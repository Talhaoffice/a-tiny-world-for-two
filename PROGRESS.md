# Run-to-completion progress

## Local combat permission diagnosis (2026-10-30)

- Confirmed source behavior: local Vite configuration points to the hosted Firebase project; the app does not connect Auth/RTDB/Firestore SDKs to emulators. Combat request path/schema match checked-in RTDB rules. RTDB rules independently require administrator-provisioned membership for both players; Firestore membership does not satisfy those rules.
- Fixed diagnostics normalization so RTDB `PERMISSION_DENIED` / `permission_denied` codes map to `permission-denied` rather than `unknown`; covered in `tests/errors-logger.test.js`.
- Checks run: `npm run test:unit` passed (108/108); `npm run test:functions` passed (5/5). The integration retry could not start because port 9000 was occupied by a Database emulator left running by the detached first attempt; it was not stopped. Emulator security suites were not run in this turn.
- Still unverified: hosted RTDB rules version and target player's RTDB membership entry. These are required to distinguish an unpublished local combat rule change from missing RTDB membership; no rule change or deploy was made.

Branch: `feature/complete-game`

Repository instructions: no `AGENTS.md` was found in the repository or its parent folders. Following the user's pasted master build instructions and run-to-completion brief.

## P0: Stabilize — done

- Commit: `f5dce70` (`P0: rules, letter schema, tests`).
- Files: Firestore rules, emulator configuration, destination letter UI/data/schedule conversion, security tests, unit tests, and `FIRESTORE_SETUP.md`.
- Checks: `npm run typecheck`, `npm run test:unit` (4 passed), `npm run build`, JavaScript syntax check, JSON parse, and `git diff --check` passed.
- Verified: local typecheck/build and schedule conversion tests only.
- Unverified: Firestore/RTDB emulator assertions, live Firebase behavior, and cross-account garden visibility. The emulator Java child failed loopback initialization before tests started. No production deployment or data changes.
- Open issue: run `npm run test:security` with the explicit Temurin Java 21 path in the owner's PowerShell.

## Baseline: done

- `npm run typecheck`: passed.
- `npm run test:unit`: passed (4 tests, 0 failures).
- `npm run build`: passed. Vite reports the existing game bundle chunks above 500 kB (main 972.45 kB, Phaser 1,374.84 kB).
- Baseline is local only; this does not verify Firebase rules, live sync, or device behavior.

## Stage A — Error and debug foundation: done

- Commit: `ecc6792` (`Stage A: error and debug foundation`).
- Files changed: `package.json`, `src/App.tsx`, `src/main.tsx`, `src/styles.css`, `src/components/ErrorBoundary.tsx`, `src/components/DiagnosticsPanel.tsx`, `src/components/diagnostics.css`, `src/lib/errors.ts`, `src/lib/logger.ts`, `src/lib/diagnostics.ts`, `src/lib/healthCheck.ts`, `src/lib/firebase.ts`, `src/features/destinations/DestinationPanel.tsx`, `src/features/destinations/content.ts`, `src/features/destinations/destinations.css`, `src/features/world/IslandScene.ts`, `src/features/world/WorldGame.tsx`, `src/features/world/tutorialProgress.ts`, `src/features/world/worldSync.ts`, `src/features/world/world.css`, `tests/errors-logger.test.js`.
- Checks: `npm run typecheck` passed; `npm run test:unit` passed (9 tests); `npm run build` passed. Vite still reports the main bundle and Phaser bundle above 500 kB (988.82 kB and 1,374.84 kB). `git diff --check` passed.
- Verified by automation: error mapping, safe log redaction and 20-event cap, schedule conversion, typecheck, and production compilation. Shared content writes use client-generated document IDs, pending server writes are visible, and repeat submits are locked while a request is active.
- Verified manually: none.
- Unverified: destination flows against live Firebase, Firebase rules/emulator behavior, two-account sync, hidden-tab behavior on real browsers, and phone layout. No production data or Firebase console was accessed; no deploy was run.
- Open issues: security emulator startup remains unverified from P0. The standalone Phaser bundle still exceeds Vite's 500 kB warning threshold.

## Stage B — Two characters: done

- Commit: `1b7a3bf` (`Stage B: two character roster and sprite set`).
- Files changed: `package.json`, `src/assets/registry.ts`, `src/features/world/characters.config.ts`, `src/features/world/characterAnimation.ts`, `src/features/world/characterRoster.ts`, `src/features/world/characterSprites.ts`, `src/features/world/IslandScene.ts`, `src/features/world/WorldGame.tsx`, `src/features/world/worldSync.ts`, `tests/character-animation.test.js`.
- Checks: `npm run typecheck` passed; `npm run test:unit` passed (15 tests); `npm run build` passed. Vite reports the main and Phaser chunks above 500 kB (991.71 kB and 1,374.84 kB). `git diff --check` passed.
- Verified by automation: four-direction idle/walk/wave/sit frame selection, six-frame walk cycle, sprite sheet row indexing, default appearance enum validation, and fixture UID mapping. Appearance rules and owner-only profile writes are already covered by the P0 Firestore rules suite.
- Verified manually: none.
- Unverified: Phaser rendering in a browser, Firebase member/world mapping and default profile creation against the live project, two-account movement sync, and phone layout. No emulator assertions ran and no production data or Firebase console was accessed.
- Open issues: runtime setup requires exactly two active Firestore members and `world/main` mapping, plus the published rules. Character art and network behavior need live browser verification. Existing large-bundle warning remains.

## Stage C — Personal envelope and first-entry letter: done

- Commit: `fda894e` (`Stage C: personal envelope and first-entry letter`).
- Files changed: `package.json`, `src/features/world/WorldGame.tsx`, `src/features/world/characterRoster.ts`, `src/features/world/IntroExperience.tsx`, `src/features/world/intro.css`, `src/features/world/introContent.ts`, `src/features/world/introFlow.ts`, `tests/intro-flow.test.js`.
- Checks: `npm run typecheck` passed; `npm run test:unit` passed (18 tests); `npm run build` passed; `git diff --check` passed. Vite reports app and Phaser chunks above 500 kB (998.71 kB and 1,374.84 kB).
- Verified by automation: preview and reread modes do not invoke the completion-write callback; first-entry invokes it once; local typecheck and production compilation pass. The code loads `content/introLetter`, uses the provided placeholder when absent, limits text to 2,000 characters, exposes saving only to Talha's account, and marks first-entry completion with a server timestamp in a transaction.
- Verified manually: none.
- Unverified: warm cottage UI and envelope animation in a browser, editor/confirmation interaction, Firestore rules against emulator/live Firebase, Mannu first-entry behavior across two accounts, and phone layout. No production data or Firebase console was accessed.
- Open issues: emulator start remains unverified from P0; large bundle warning remains. Preview/read behavior is verified by the mode-gate unit test, not by a live Firestore session.

## Stage D — Living world: done

- Commit: `35b47a5` (`Stage D: living world atmosphere`).
- Files changed: `package.json`, `src/features/world/IslandScene.ts`, `src/features/world/WorldGame.tsx`, `src/features/world/world.css`, `src/features/world/worldAtmosphere.ts`, `tests/world-atmosphere.test.js`.
- Checks: `npm run typecheck` passed; `npm run test:unit` passed (21 tests); `npm run build` passed; `git diff --check` passed. Vite reports app and Phaser chunks above 500 kB (1,001.50 kB and 1,374.84 kB).
- Verified by automation: local-time day/night boundaries, forced day/night override, and warm/night tint selection; TypeScript and production compilation pass.
- Visible code: auto local-time tint with day/night selectors; animated tree canopy sway, pond ripples, cottage smoke, clouds and fireflies; decorative rain/snow; opt-in procedural Web Audio; reduced-motion and low-power controls. Weather and audio do not write data or use network assets.
- Verified manually: none.
- Unverified: scene rendering, audio quality/browser support, performance on a real low-power phone, and actual local-time transitions in a running Firebase session. No production data or Firebase console was accessed.
- Open issues: Phaser rendering is not browser-verified; large bundle warning remains.

## Stage E — Walkable Our Home: done

- Commit: `da66f6b` (`Stage E: walkable home interior`).
- Files changed: `database.rules.json`, `FIREBASE_SETUP.md`, `package.json`, `src/features/destinations/DestinationPanel.tsx`, `src/features/destinations/destinationFocus.css`, `src/features/world/HomeInterior.tsx`, `src/features/world/homeInterior.css`, `src/features/world/IslandScene.ts`, `src/features/world/WorldGame.tsx`, `src/features/world/worldSync.ts`, `src/features/world/worldZone.ts`, `tests/firestore.rules.test.js`, `tests/world-zone.test.js`.
- Checks: `npm run typecheck` passed; `npm run test:unit` passed (23 tests); `npm run build` passed; `database.rules.json` parsed as valid JSON; `git diff --check` passed. Vite reports app and Phaser chunks above 500 kB (1,008.56 kB and 1,374.84 kB).
- Visible code: walkable room with table, lamp, bookshelf, plants, memory wall, keepsake shelf and note board; hotspots open existing garden, notes, and keepsake panels; door/back button and Escape return to the island. Current position is shared only while both players are in the same zone.
- Data/rules: added optional RTDB `zone` (`island` or `home`) to player position; existing records without `zone` remain valid and are treated as island presence. Added emulator assertions for accepted `home` and rejected unknown zones. No Firestore query or index change.
- Verified manually: none.
- Unverified: RTDB emulator assertions, live two-account room presence, browser rendering and keyboard movement, and phone layout. The previously observed Java emulator child loopback failure was not retried. No production data or Firebase console was accessed.
- Open issues: deploy the revised RTDB rules before live room presence can work; emulator access control remains unverified; large bundle warning remains.

## Stage F — Garden and Mailbox polish: done

- Commit: `692e9ba` (`Stage F: garden and mailbox polish`).
- Files changed: `package.json`, `src/features/destinations/DestinationPanel.tsx`, `src/features/destinations/gardenMailbox.css`, `src/features/destinations/letterAvailability.ts`, `src/features/world/IslandScene.ts`, `tests/letter-availability.test.js`.
- Checks: `npm run typecheck` passed; `npm run test:unit` passed (26 tests); `npm run build` passed; `git diff --check` passed. Vite reports app and Phaser chunks above 500 kB (1,010.88 kB and 1,374.84 kB).
- Visible code: memory garden now displays 24 soil plots; selecting a flower opens its memory, with edit/delete available only to its creator. The island mailbox has a waving flag; letter envelopes animate when opened. Existing scheduled-letter UI displays the release date and keeps the body closed before release.
- Verified by automation: body loader is called zero times before the release time and while server-time offset is unknown; sender can read before release; recipient can read at release time. Local typecheck and production build pass.
- Verified manually: none.
- Unverified: garden layout and mailbox animation in a browser/phone, RTDB server-time offset against the live server, and Firestore rules emulator behavior. No production data or Firebase console was accessed.
- Open issues: recipient body reads wait until an RTDB server-time offset is available; the existing rules still enforce release using server time. Emulator assertions remain unverified; large bundle warning remains.

## Stage G — Personal corners: done

- Commit: `d3dab8f` (`Stage G: personal corners and wardrobe`).
- Files changed: `database.rules.json`, `FIREBASE_SETUP.md`, `FIRESTORE_SETUP.md`, `firestore.rules`, `package.json`, `src/features/world/AppearancePanel.tsx`, `src/features/world/IslandScene.ts`, `src/features/world/PersonalCornerPanel.tsx`, `src/features/world/WorldGame.tsx`, `src/features/world/characterSprites.ts`, `src/features/world/gardenCornerEffects.ts`, `src/features/world/personalCornerContent.ts`, `src/features/world/world.css`, `src/features/world/worldSync.ts`, `tests/firestore.rules.test.js`, `tests/garden-corner-effects.test.js`.
- Checks: `npm run typecheck` passed; `npm run test:unit` passed (29 tests); `npm run build` passed; `database.rules.json` parsed as valid JSON; `git diff --check` passed. Vite reports the app and Phaser bundles above 500 kB (1,022.97 kB and 1,374.84 kB).
- Visible code: visitors can enter either owner-assigned corner. Talha can set two lanterns and a decoration; Mannu can water two plots and set a decoration. Pond fishing is cosmetic. Lantern light creates a garden glow; watering adds visible growth and fireflies. Both accounts can choose a validated wardrobe appearance, and the other member receives the appearance through validated owner-writable RTDB cosmetic state.
- Rules: Firestore stores structured corner flags and allows reads to both active members, while each owner alone can write their assigned corner. RTDB appearance state contains only validated hair/outfit/accessory enums; only its owner can write it. No composite index was added.
- Verified manually: none.
- Unverified: Firestore/RTDB emulator assertions (still blocked before test start by the earlier Java loopback failure), live two-account corner and wardrobe sync, Phaser visuals, and phone layout. Publish the changed Firestore and RTDB rules before live use. No Firebase console, production data, or deployment was accessed.
- Open issues: large bundle warning remains.

## Stage H — Together moments: done

- Commit: `aba23ec` (`Stage H: shared moments and special dates`).
- Files changed: `FIREBASE_SETUP.md`, `FIRESTORE_SETUP.md`, `database.rules.json`, `firestore.rules`, `package.json`, `src/features/world/IslandScene.ts`, `src/features/world/SpecialDatesPanel.tsx`, `src/features/world/WorldGame.tsx`, `src/features/world/annualSpecialDates.ts`, `src/features/world/characterSprites.ts`, `src/features/world/specialDatesContent.ts`, `src/features/world/world.css`, `src/features/world/worldEmotes.ts`, `src/features/world/worldSync.ts`, `tests/annual-special-dates.test.js`, `tests/firestore.rules.test.js`, `tests/world-emotes.test.js`.
- Checks: `npm run typecheck` passed; `npm run test:unit` passed (34 tests); `npm run build` passed; `node --check tests/firestore.rules.test.js`, `database.rules.json` parse, and `git diff --check` passed. Vite reports app and Phaser bundles above 500 kB (1,030.54 kB and 1,374.84 kB).
- Visible code: short-lived wave/heart/sparkle/hug actions share over RTDB; the client enforces a 2.5-second cooldown and ignores events older than seven seconds. Pond bench and blanket spots trigger a sit pose, the pond lantern can be lit/dimmed, and mood lantern colors apply locally and share with the other active member. The game can still animate local moments while disconnected. Talha can save up to five annual `MM-DD` dates; both members can read them and the island shows a gentle glow on the matching local day without a countdown.
- Rules: RTDB validates emote enum/timestamp/cooldown and appearance shape, limits writes to the owner, and blocks deletes. Firestore allows only Talha to write the exact special-date schema; reads are available to both active members. No composite index was added.
- Verified manually: none.
- Unverified: Firestore/RTDB emulator assertions remain blocked before test start by the earlier Java loopback failure; live two-account emotes, mood color, date sync, Phaser visuals, and phone layout are unverified. Publish the changed rules before live use. No Firebase console, production data, or deployment was accessed.
- Open issues: large bundle warning remains.

## Stage I — Our Little Sky and Our Future: done

- Commit: `e0b96fe` (`Stage I: stargazing and dream board`).
- Files changed: `FIRESTORE_SETUP.md`, `firestore.rules`, `package.json`, `src/features/world/DreamBoardPanel.tsx`, `src/features/world/IslandScene.ts`, `src/features/world/StargazingPanel.tsx`, `src/features/world/WorldGame.tsx`, `src/features/world/constellation.ts`, `src/features/world/dreamBoardContent.ts`, `src/features/world/dreamBoardText.ts`, `src/features/world/world.css`, `tests/dream-board.test.js`, `tests/firestore.rules.test.js`, `tests/stargazing.test.js`.
- Checks: `npm run typecheck` passed; `npm run test:unit` passed (38 tests); `npm run build` passed; database rules JSON parse, `node --check tests/firestore.rules.test.js`, and `git diff --check` passed. Vite reports app and Phaser chunks above 500 kB (1,039.19 kB and 1,374.84 kB).
- Visible code: up to five optional saved month-and-day dates can be traced as deterministic constellations at the island's stargazing spot; these are drawn only at night. The future board stores shared 1–300 character plain text, reads only while open, and offers edit/delete only to the author with a confirmation step.
- Rules: both active members can read dreams; the author alone can create, update, or delete their own entry. Dream documents have an exact four-field schema. No composite index was added.
- Verified manually: none.
- Unverified: Firestore rules emulator assertions (Java loopback failure occurred before suite start), live two-account board sync, Phaser visuals, and phone layout. No production data, Firebase console, or deployment was accessed. Dreams are not end-to-end encrypted; Firebase project owners can read them.
- Open issues: large bundle warning remains.

## Stage J — Polish and release: done

- Commit: `bc64843` (`Stage J: PWA and mobile polish`).
- Files changed: `SETUP.md`, `index.html`, `package.json`, `public/icon.svg`, `public/manifest.webmanifest`, `public/sw.js`, `src/features/world/IslandScene.ts`, `src/features/world/WorldGame.tsx`, `src/features/world/world.css`, `src/main.tsx`, `tests/e2e/two-profile.test.mjs`, `tests/pwa-service-worker.test.mjs`.
- Checks: `npm run build` passed, including typecheck; `npm run test:unit` passed (41 tests); `npm run test:e2e` skipped its authenticated case because test credential pairs are absent; service worker and E2E files passed Node syntax checks; PWA manifest and database rules JSON parsed; built output contains the worker, manifest, and icon; `git diff --check` passed. Vite reports app and Phaser chunks above 500 kB (1,039.83 kB and 1,374.84 kB).
- Visible code: the versioned service worker caches the same-origin shell and static `/assets/` only, and falls back to the app shell for offline navigation. It bypasses cross-origin Firebase Auth, Firestore, Realtime Database, same-origin API paths, and non-GET requests. The app has a manifest/icon, mobile analog joystick, safe-area padding, keyboard movement remains available, and Phaser remains dynamically imported. `SETUP.md` documents Firebase setup links, the two-profile walkthrough, privacy, offline limits, and optional Playwright setup.
- Verified by automation: a Node VM harness exercised offline shell fallback, old app-cache cleanup, and bypass of Firebase/API/write requests. The production build copied the PWA assets into `dist/`.
- Verified manually: none.
- Unverified: browser rendering and offline mode could not be checked because the in-app browser timed out on the local preview and the sandbox denied loopback sockets. The Playwright two-profile test was written but skipped because test accounts and the Playwright package are not configured. Firestore/RTDB emulator assertions remain blocked before suite start by the earlier Java loopback failure. No production data, Firebase console, or deployment was accessed.
- Open issues: large bundle warning remains; live two-account behavior and visual/mobile testing still require the owner's test setup.

## Combined deploy plan

Not run. After emulator rules tests and owner review: deploy Firestore indexes and wait for them to finish; deploy Firestore rules; run the production build and deploy Hosting. Every Firebase deploy command will include `--project a-tiny-world-for-two`.

## Task 1 — Make Hosting deployable (done)
- Added `hosting` section (`public: dist`, SPA rewrite, cache/security headers) to `firebase.json`.
- Created `.firebaserc` with default project `a-tiny-world-for-two`.
- Added `deploy:hosting` script to `package.json` (`npm run build && firebase deploy --only hosting`).
- Typecheck: passed. Deploy not run (owner must run `npm run deploy:hosting` after login).

## Task G1 — Distinct characters + art preview (done)
- Distinct Talha (broader body, short messy hair, gold-stripe jacket, boots) vs Mannu (slimmer, long hair with clip, flared dress/cardigan, light shoes); 1px edge shading + dither + highlight via px()/dot() helpers; skinShadow + hairHighlight per character.
- Added bodyWidthOffset + shoulderWidth to CharacterConfig; added skinShadow + hairHighlight to palette (characters.config.ts).
- PALETTE master constants added to registry.ts as source of truth; PNG-replacement path documented.
- ArtPreview page (src/pages/ArtPreview.tsx): canvas-only, no Firebase, shows all poses × directions at 4× with live animation cycling.
- main.tsx: ?art=1 loads ArtPreview via React.lazy, bypassing auth entirely.
- Typecheck: passed. Animation selector unit tests already existed and pass.

## Stage 1 — Working photo gallery: done
- Commit: `3b33aca` (`Stage 1: photo gallery (rules, data layer, UI, unit tests)`).
- Files changed: `firestore.rules`, `package.json`, `src/features/gallery/GalleryPanel.tsx`, `src/features/gallery/galleryContent.ts`, `src/features/gallery/gallery.css`, `src/features/gallery/imageProcessing.ts`, `src/features/world/WorldGame.tsx`, `src/lib/healthCheck.ts`, `src/components/DiagnosticsPanel.tsx`, `tests/gallery.test.js`, `tests/firestore.rules.test.js`.
- Checks: `npm run typecheck` passed; `npm run test:unit` passed (52 tests); `npm run build` passed; `node --check tests/firestore.rules.test.js` passed.
- Visible code: Client-side photo compression with orientation-aware `createImageBitmap` (resizing full to <=1280px, <=400KB and thumbnail to <=240px, <=24KB without Firebase Storage). Atomic two-document batch creation (`gallery/shared/photos/{photoId}` thumbnail + `.../full/main` full image). Polaroid wall UI with caption editing, confirmation dialog for deletion, full-size viewer with arrow/esc navigation, and 100-photo soft cap.
- Rules: Firestore security rules allow members to read; creator-only atomic batch creation with required dimensions, size limits, and JPEG MIME check; creator-only caption update; creator-only atomic deletion.
- Verified by tests: Unit test suite for base64 body stripping, caption limits, size constants, and image constraints; syntax checks.
- Unverified: Live Firebase emulator execution (Java loopback unavailable) and live two-account browser photo upload.

## Stage 2 — Character creator and wardrobe: done
- Files changed: `firestore.rules`, `package.json`, `src/assets/registry.ts`, `src/features/world/appearanceCatalog.ts`, `src/features/world/playerLooks.ts`, `src/features/world/WardrobePanel.tsx`, `src/features/world/wardrobe.css`, `src/features/world/characterSprites.ts`, `src/features/world/IslandScene.ts`, `src/features/world/WorldGame.tsx`, `src/features/world/HomeInterior.tsx`, `src/features/world/homeInterior.css`, `tests/player-looks.test.js`, `tests/firestore.rules.test.js`.
- Checks: `npm run typecheck` passed; `npm run test:unit` passed (59 tests); `npm run build` passed; `node --check tests/firestore.rules.test.js` passed.
- Visible code: Full character creator and wardrobe panel accessible via sidebar button and cottage mirror. Single source of truth in `appearanceCatalog.ts` (6 skin tones, 10 hair styles, 12 hair colors, 5 eye colors, 6 tops, 4 bottoms, 3 shoes, 4 hats, 5 accessories, 10 cloth tints). Layered sprite generator with palette-ramp recoloring (shadow, base, light, highlight) and LRU texture caching (up to 16 looks, zero per-frame regeneration). Real-time 4x preview canvas with walk/idle/wave poses and 4-direction rotation. Reset to default, randomize, unsaved-changes confirmation, Web Audio chime, and sparkle effect on save. Live remote synchronization over Firestore `playerLooks/{uid}` with backward-compatible RTDB appearance publishing.
- Rules: Firestore rules for `playerLooks/{uid}` allow active members to read for remote synchronization; owner-only write with strict integer range checks mirroring the catalog and extra-field rejection.
- Verified by tests: Unit tests for catalog size constraints matching rules, schema bounds, legacy migration, random generation, and look key determinism; typecheck and production build passed.
- Unverified: Live two-account look synchronization over Firebase.

## Pet task 1 — UI and sprites (Codex): done

- Branch: `codex/task-1-pets-ui-sprites`.
- Files: `src/features/world/WorldGame.tsx`, `src/features/world/WardrobePanel.tsx`, `src/features/world/IslandScene.ts`, `src/features/world/characterSprites.ts`, `src/features/world/petSprites.ts`, `src/features/world/petStoreStub.ts`, `src/features/world/wardrobe.css`, `public/pets/cat.svg`, `public/pets/fox.svg`, `COLLAB.md`.
- Visible code: companion tab and direct sidebar entry, cat/fox pixel previews, optional player-entered name, local delayed-follow/idle/sleep behavior, and petting/heart reaction. Pet art textures are generated once and reused.
- Data: no Firestore rules or tests changed. `petStoreStub.ts` is in-memory pending the separate Claude rules/sync task. The required `/world/pets` document shape and owner-only access expectations are in `COLLAB.md` under NEEDS RULES.
- Checks: `npm run typecheck` passed; `npm run test:unit` passed (59 tests); `npm run build` passed; `git diff --check` passed.
- Verified by automation: project typecheck, all 59 existing unit tests, and production compilation.
- Unverified: browser visuals, collision-free following, live two-account appearance, persistence and Firestore access control.


## Task — Local Firebase emulator isolation (2026-10-30)

- Added an explicit dev emulator target and routed browser Auth, RTDB, Firestore, and Functions to loopback. The emulator app uses a separate Firebase app name so its Auth persistence is isolated. Emulator mode checks project/config and fails closed; production runtime/build reject emulator mode. Vite production assets were checked and contain no configured local emulator endpoint strings.
- Enabled Emulator UI only on `127.0.0.1:4000`. Added a guarded local bootstrap that requires `TINY_WORLD_EMULATOR_BOOTSTRAP=1`, the expected project ID, exact loopback Auth/RTDB/Firestore endpoints, and two UIDs already created in local Auth. It seeds only the verified Firestore membership docs, `world/main` roster, and RTDB membership flags. No rules, server combat validation, or health ownership were modified.
- `.env.local` received only `VITE_FIREBASE_TARGET=emulator`; other contents were preserved. No user accounts/UIDs/credentials were written or reported. No deployment, commit, reset, or discard.
- Checks passed: `npm run typecheck`; `npm run test:unit` (117/117); `npm run build` with process-local hosted target; explicit build rejection for emulator target; no localhost emulator addresses in built JS; `npm run test:security:combat` (4/4); `npm run test:security` (72/72 on rerun); `npm run test:functions` (5/5); `npm run test:integration:combat` (1/1 with JDK 21 and Functions discovery timeout 60); `git diff --check`; bootstrap/test syntax checks. One prior full security run had a transient single Firestore delete-test failure; isolated and full rerun passed. One initial Functions emulator launch exited before discovery; retry passed.
- Manual follow-up: create two synthetic emulator Auth accounts in UI, copy their local UIDs into the documented seed command, run `npm run dev`, and test the two profiles in separate browser contexts. No browser gameplay was run here.

## PVP combat no-visible-damage investigation — 2026-10-30

- Traced the client button, request writer/listeners, database trigger/auth validation/transaction, RTDB rules, health state and Phaser/UI rendering. `Attack request sent.` confirms only that the request write promise resolved, not a server hit. Server gameplay outcomes are written to `world/combat/state/processed`; health is in `world/combat/state/players` and clients listen at the latter path. Default 100 is used only for missing player records.
- Found a presentation bug: the persistent combat status message replaces the remote-health text in `WorldGame.tsx`, so the card can hide remote health after an attack. This does not account for the local health text and both scene bars staying unchanged, so no UI-only change was made as a claimed fix.
- Current local emulator checks: Vite development serves code with all four local emulator connectors and all configured ports are listening. Live default RTDB has no membership/player/presence/position/pending/processed-combat records; Firestore has no active memberships or `world/main`; available emulator logs show startup/trigger registration but no request invocation/outcome. The current state cannot establish the outcome of the earlier browser click or its exact rejection category.
- No source/rules/tests changed; no test was run because the combat integration test clears the entire RTDB root in `beforeEach` and would mutate the shared emulator session. No emulator was started, stopped, or killed. No deploy or Git mutation.
- Remaining evidence: reproduce after confirming the browser target and member fixture against the currently running instance, then provide the safe Functions resolution/rejection category and state result for that request. Do not share credentials, tokens, or raw UIDs.

## PVP combat stationary health stall — 2026-10-30

- Confirmed why combat stopped at 50: the Function accepts only positions fresher than 15 seconds; scene reports stationary coordinates every 10 seconds, but `worldSync` suppressed unchanged position writes. The current emulator had health values 50/100, both position timestamps stale by over 160 seconds, and recent processed results included 37 `stale-position` rejections, alongside 7 sipper hits and 8 cooldowns. No 50 health minimum exists in server/client logic.
- Added a 10-second stationary-position heartbeat before the server's 15-second freshness threshold; movement/zone/animation/forced updates remain as before. Added unit and integration regressions: twenty valid sipper hits cross below 50, reach exactly 0, set `knocked_out`, and remain nonnegative. Integration test updates positions and observes each server processed result.
- Added isolated combat emulator ports/config (Auth 19099, RTDB 19000, Functions 15001) and environment-overridable test ports. Existing shared emulators on 9099/9000/5001 remained running and were not used by the destructive integration fixture cleanup.
- Passed: `npm run test:unit` 119/119; `npm run test:functions` 6/6; `npm run test:security:combat` 4/4; isolated Functions integration 2/2; `npm run typecheck`; JS syntax checks; JSON config checks; `git diff --check`.
- No Firebase rules or server authorization/damage logic were weakened. No deployment or Git history operation.

## Knockout carry, water throw, and respawn — 2026-10-30

- Added authenticated RTDB interaction requests and `resolveCombatInteraction` to the existing Functions backend. Server checks both members, request ownership, actor/target presence and freshness, actor alive state, exact knocked-out eligibility, one-carried-target ownership, proximity, and a bounded pond water destination. The transaction records pickup/throw state and duplicate outcomes; valid throws write the existing player position to the cottage and only then restore combat state to 100 / alive. Client rules still default deny and still forbid combat-state writes.
- Updated combat sync, Phaser scene, sprite handling, world sync, and React controls for knockout blocking, prompts, attached carry rendering, no independent carried movement, and respawn transition. Added pure combat interaction and pond geometry tests, RTDB permission tests, and Functions emulator coverage for pickup, invalid throw, valid respawn, duplicate IDs, and server-owned health.
- Confirmed and fixed the emulator harness mismatch: test rules were bound to the `demo-tiny-world-combat-default-rtdb` namespace, but the Functions trigger used the `demo-tiny-world-combat` namespace. The isolated config explicitly binds RTDB rules to the trigger namespace, and integration fixture clearing targets only that namespace. An initial duplicate test also tried an unauthorized client read on request paths; it now tests retries via the allowed create path without broadening read rules.
- Tests: `npm run test:unit` 122/122; `npm run test:functions` 8/8; `npm run test:security:combat` 5/5; isolated `npm run test:integration:combat` 6/6; isolated Firestore/RTDB general security suite 72/72; `npm run typecheck`; `npm run build`; `git diff --check`. All passed; production build reports the existing large-chunk warning. The shared emulator session was not stopped or mutated.
- Manual browser checks remain for two-client carried-avatar alignment, input/prompt transitions, water edge behavior, cottage appearance, and both clients observing the same restored health. No deploy or Git history operation was performed.

## Render Free combat HTTP API — 2026-10-31

- Added a standalone Node 22 HTTP API in `functions/` with `/healthz`, authenticated attack, and authenticated pickup/throw endpoints. It verifies Firebase ID tokens (including revocation), validates exact payloads, checks actor and target membership, reads live position/presence/loadout/state from RTDB, and reuses the current server combat core for authoritative damage and interaction outcomes. It never accepts client damage/health/weapon fields.
- Frontend combat requests send the signed-in user's Firebase ID token to `VITE_COMBAT_API_URL`; production without the API URL returns failure and never falls back to client RTDB request writes. Local development retains the Functions emulator path when the API URL is absent. API emulator mode is explicit and accepts only loopback Admin Auth/RTDB emulator hosts without service credentials.
- Added API unit coverage and an isolated integration test that obtains a Firebase Auth Emulator ID token, verifies it through Admin SDK, calls the HTTP API, and confirms the RTDB emulator health result. Initial integration exposed a harness SDK-version mismatch: browser modular RTDB writes and Admin SDK in the same process exchanged incompatible path objects. Moving fixture setup to Admin SDK fixed the harness without altering production logic.
- Files for this task: `functions/src/{api,apiConfig,combatApi}.js`, `functions/test/{combatApi.test,combatApi.emulator}.js`, `functions/package.json`, `functions/.node-version`, `src/features/world/{combatApiTarget.ts,combatSync.ts}`, `tests/combat-api-target.test.js`, `package.json`, `.env.example`, `RENDER_COMBAT_API.md`, and this task note in `COLLAB.md`/`PROGRESS.md`. Existing rules and user changes were preserved.
- Verification: `npm run test:unit` 125/125; `npm run typecheck`; `npm run test:functions` 18/18; `npm run build` passed (existing large-chunk warning); `npm run test:security:combat` 5/5; `npm run test:integration:combat` 6/6; isolated HTTP API/Auth/RTDB integration 1/1; isolated general Firestore/RTDB security 72/72. JDK 21 and the Windows Unix-domain temp override were process-local. No shared emulator session was used for the destructive integration fixture.
- Deployment is not run. Next steps: push the reviewed branch manually, create the Render Free Web Service with root `functions`, build `npm ci`, start `npm run start:api`, `/healthz`, and the documented Firebase environment variables; then rebuild and publish Firebase Hosting with the assigned HTTPS API URL. Render Free sleeps when idle, so first requests can incur cold-start delay.
