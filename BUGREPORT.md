# BUGREPORT: remote position callback crash

## Phase 1 findings (source review before fixes)

### 1. Undefined expression and creation path

The exception `Cannot read properties of undefined (reading 'setRemotePosition')` corresponds to `this.characterSprites.setRemotePosition(position)` in `src/features/world/IslandScene.ts:376`. The undefined field is `IslandScene.characterSprites`, declared with a definite-assignment assertion at line 75 and assigned only at `src/features/world/IslandScene.ts:843` by `this.characterSprites = new CharacterSprites(this, this.roster)` inside `createPlayer()`.

`WorldGame.tsx` stores the `IslandScene` instance in `scene.current` at line 353 before constructing the Phaser Game. `createPlayer()` runs later during Phaser `createWorld()` (IslandScene lines 146-160). Therefore a sync callback can find a non-null scene reference while `characterSprites` is still absent. This is a proven race window. The `remote` sprite inside `CharacterSprites` is separately created in its constructor at `src/features/world/characterSprites.ts:587`, along with its shadow, name tag, and emote objects (lines 581-596). It is initialized from `roster.remote` and default texture keys; creation does not wait for a saved look or pet. The remote sprite is hidden until a valid position is applied.

The owner trace places `sceneCreate-done` before the exception, which does not by itself prove the same Scene instance was ready: boot events are global, and development StrictMode can replay effects. In the same successfully created scene, `createPlayer()` has already assigned `characterSprites`. The trace is consistent with a callback into a different or not-yet-created Scene instance, but that interpretation is a code-based inference.

### 2. WorldGame and timing

`loadCharacterRoster(uid)` is awaited at `src/features/world/WorldGame.tsx:270`; it reads membership/world mapping and the local profile before returning (`src/features/world/characterRoster.ts:81-109`). `loadLocalPlayerLook(roster)` starts at WorldGame line 273 and is deliberately not awaited. `connectWorldSync(...)` starts at lines 278-288, before dynamic Phaser imports and before `new PhaserRuntime.Game()` at lines 296-354. Thus RTDB subscriptions begin after roster/profile completion, but before `playerLooks-done` and before Scene `create()` is guaranteed to run.

The position callback at `WorldGame.tsx:282-285` stores React state and calls `scene.current?.setRemotePosition(position)`. Optional chaining protects a null scene reference, but it does not check whether the referenced Scene has completed `createPlayer()`, is active, or belongs to the currently live effect. The effect has a local `disposed` flag for its roster/import promise and Scene-ready callback, but the RTDB callback does not check it. `scene.current` is set before Phaser boots and cleared in the effect cleanup at lines 385-394. StrictMode effect cleanup stops the first `worldSync` listener, but an already-queued callback can still run; without a disposed/generation guard it can use the shared ref during a later effect replay.

Firestore listeners for the remote look and pet start in the roster-dependent effect (`WorldGame.tsx:397-415`); they may also fire before `createPlayer()`. Their callbacks call `updateRemoteLook` and `setRemotePet`, which access `characterSprites`.

### 3. RTDB callbacks and exception behavior

`src/features/world/worldSync.ts` registers three `onValue` listeners:

- `playersRef`, lines 149-155: assigns the latest player map, then calls `updateRemotePosition()`. Its error callback calls `onRemotePosition(null)`, updates connection state, and logs. Neither callback has a local try/catch.
- `serverOffsetRef`, lines 157-160: updates offset and health diagnostics, then calls `updateRemotePosition()`. Its error callback logs only. No local try/catch.
- `connectedRef`, lines 171-194: updates connection state and starts async presence work. Its error callback changes connection state and logs. No local try/catch.

`updateRemotePosition()` calls `onRemotePosition()` at lines 133 and 146; it is also called from the 5-second timer (line 162), `setZone()` (line 236), and `stop()` (line 250). Those calls are not individually guarded. Listener unsubscribe functions are retained by `trackListener` and invoked by `stop()`; throwing from a callback does not call those unsubscribe functions. Installed RTDB code (`node_modules/@firebase/database/dist/index.esm.js:635-652`) wraps user callbacks, warns `Exception was thrown by user callback`, then rethrows on a timer. The throw interrupts the current user callback; it does not detach the listener. A local catch is still needed to keep each callback and subsequent work alive.

### 4. Other Scene entry points that can race initialization

All public scene calls from React or RTDB/Firestore were searched in `WorldGame.tsx`:

- `setRemotePosition` (RTDB, line 284), `updateRemoteLook` and `setRemotePet` (Firestore, lines 403 and 411): all assume `characterSprites` exists. `setRemotePosition` can also regenerate remote appearance textures and play a remote emote.
- `updateLocalLook` (async player-look loader, line 127; Wardrobe save, line 749), `updateLocalAppearance` (line 539), `playLocalEmote` (line 550), and `playRemoteEmote` (called from `setRemotePosition`) assume `characterSprites` exists. Local/remote emote methods may also touch lantern or pet sprites.
- `setAtmosphereSettings` is called before Phaser boot at line 346. It stores settings, but its helpers guard their uncreated objects (`refreshAtmosphere` and `drawStargazingConstellations` return if absent; the initialized tween list may be empty), so this call is currently safe.
- `setGardenEffects` returns if `gardenGlow` is not created; `setSpecialDateGlow` uses optional stars and a guarded garden refresh; `setStargazingDates` returns before drawing if its layer is absent. `setDestinationOpen` only updates a flag.
- `setLocalPet` stores config and checks for `player` before creating a pet; `setOnPetInteracted` only stores a callback. `setTouchPointer`, `setTouchJoystick`, and release methods only mutate a Map. `inspectNearbyPlace` checks `activePlace`; `getNearbyPet` checks `player`; `isPondLanternLit` reads an initialized boolean. `getLocalPosition` directly reads `player.x/y` and can be called via `scene.current` before readiness. `update()` directly reads `player`, keyboard state, and `characterSprites`; Phaser normally invokes it after `create()`, but it has no defensive guard against partial/shutdown state.

`scene.current?.` in React prevents calls when the ref is null but does not protect a constructed, inactive, or partially initialized Scene. Phaser 4.2.1's installed type declares `Scene.sys.isActive(): boolean` at `node_modules/phaser/types/phaser.d.ts:130359`; this is the lifecycle guard used in the fix.

### 5. Blank-canvas assessment and panels

`createWorld()` draws ground/path/pond/cottage/trees/garden/place markers, then atmosphere and collisions, then creates the local player and `CharacterSprites` (`IslandScene.ts:146-160`). The camera follows the local `player` at lines 166-170. Character config spawn coordinates are finite and inside the world (`characters.config.ts:62,86`). The atmosphere shade is depth 1000 but its maximum alpha is 0.38 (`worldAtmosphere.ts:13`), so it cannot fully cover the world. The dotted page background has z-index -1; the canvas is a child of `.game-host`, which has width 100%, a fixed viewport-relative height, and a minimum height in `world.css:2,6,29-30`. These are code facts; actual canvas dimensions and runtime camera state remain unverified.

The callback crash is proven and can explain repeated console exceptions and dropped remote-position updates. It is not by itself proof of a blank canvas: the RTDB SDK rethrows asynchronously, outside Phaser `create()`/`update()`. A separate exception during `createWorld()` is caught by `IslandScene.create()` and stops the Scene, which could leave a blank canvas (likely mechanism, not established here). A recurring `update()` exception or an overlay obscuring the canvas is speculative; source review finds no alpha-1 atmosphere overlay or foreground dotted layer. Runtime renderer/camera/canvas observations require a browser and are unverified.

Wardrobe and Gallery currently have explicit loading/error/empty content, and their own ErrorBoundary wrappers in `WorldGame.tsx:726-739,778`. Gallery handles list timeout/error/retry and displays `No photos yet` (`GalleryPanel.tsx:62-100,335-345`). Wardrobe displays saved-look and pet load states (`WardrobePanel.tsx:580-585,697-702`). Neither panel has a `return null` render path found. A throw in an external Firebase callback is not a React render error, so it does not itself unmount these panels; an unhandled callback exception can still disrupt the page event loop. Their runtime display remains unverified.

## Phase 2-4 implementation notes

The latest-position queue is implemented in `src/features/world/remotePosition.ts:11-33`. `IslandScene.setRemotePosition()` now queues until `createPlayer()` has assigned `CharacterSprites`, then drains the latest pending position (`IslandScene.ts:384-408,880`). A null position remains deferred as a hidden-state marker. `SHUTDOWN` clears the queue and marks the scene inactive (`IslandScene.ts:179-182`); `update()` and methods that touch sprite state guard against partial initialization or shutdown (`IslandScene.ts:196,297-318,384-429`). `getLocalPosition()` returns null until the player exists (`IslandScene.ts:443`), and its caller handles that result (`WorldGame.tsx:522-524`).

`connectWorldSync()` now rejects non-finite/out-of-bounds positions, invalid timestamps, mismatched peer keys, and unsupported optional direction/animation values before dispatch (`worldSync.ts:124-158`, validator `remotePosition.ts:35-43`). Remote callbacks are caught and logged through the existing redacted `logError` path under fixed namespaces; the three RTDB listeners, interval callback, and callback error paths each have local guards (`worldSync.ts:161-213`). The React subscription checks its effect's `disposed` flag and catches Scene delivery (`WorldGame.tsx:278-289`); Firestore remote look/pet callbacks use an active flag and catch Scene delivery (`WorldGame.tsx:397-418`). Remote `CharacterSprites` initializes from the catalog default look and refreshes the sprite immediately (`characterSprites.ts:567-568,604`).

**Root cause status:** the undefined `characterSprites` access was a real startup race: `scene.current` is assigned before Phaser boot (`WorldGame.tsx:355-356`), while `CharacterSprites` is assigned later from `createPlayer()` (`IslandScene.ts:865-876`). `worldSync` subscribes before Phaser boot (`WorldGame.tsx:278-289`). This explains the reported `setRemotePosition` exception and is now covered by deferred delivery. It does not prove that this exception alone caused the live blank island; the trace says scene creation later completed, and a Firebase callback exception is rethrown asynchronously outside Scene `create()`. No runtime/browser reproduction was available.

Added `tests/remote-position.test.js` to the unit command. It covers queue-and-flush/latest-per-peer behavior, malformed events, disposal, exception containment followed by later delivery, and the catalog default-look fallback. **Verified by commands:** `npm run typecheck` passed; `npm run test:unit` passed (71/71, including six new cases); `npm run build` passed (Vite large-chunk warning only). `npm run test:security` was NOT run, per the no-network constraint. Existing rule files and security tests were not changed.

**Unverified:** browser behavior, live-site blank-canvas cause/resolution, RTDB listener behavior against Firebase, two-account synchronization, and phone layout. No browser or emulator was used.

**Exact next step:** owner opens the live site with `?debug=1` on two accounts, confirms the island and remote avatar render without `setRemotePosition` exceptions, exercises remote movement and disconnect/reconnect, then repeats on a phone. If still blank, capture the boot trace and first console error; do not infer the remote-position race is the canvas cause.
