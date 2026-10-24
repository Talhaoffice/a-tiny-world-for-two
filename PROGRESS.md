# Run-to-completion progress

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

## Stage H — Together moments: pending

## Stage I — Our Little Sky and Our Future: pending

## Stage J — Polish and release: pending

## Combined deploy plan

Not run. After emulator rules tests and owner review: deploy Firestore indexes and wait for them to finish; deploy Firestore rules; run the production build and deploy Hosting. Every Firebase deploy command will include `--project a-tiny-world-for-two`.
