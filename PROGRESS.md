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

- Commit: pending (`Stage A: error and debug foundation`).
- Files changed: `package.json`, `src/App.tsx`, `src/main.tsx`, `src/styles.css`, `src/components/ErrorBoundary.tsx`, `src/components/DiagnosticsPanel.tsx`, `src/components/diagnostics.css`, `src/lib/errors.ts`, `src/lib/logger.ts`, `src/lib/diagnostics.ts`, `src/lib/healthCheck.ts`, `src/lib/firebase.ts`, `src/features/destinations/DestinationPanel.tsx`, `src/features/destinations/content.ts`, `src/features/destinations/destinations.css`, `src/features/world/IslandScene.ts`, `src/features/world/WorldGame.tsx`, `src/features/world/tutorialProgress.ts`, `src/features/world/worldSync.ts`, `src/features/world/world.css`, `tests/errors-logger.test.js`.
- Checks: `npm run typecheck` passed; `npm run test:unit` passed (9 tests); `npm run build` passed. Vite still reports the main bundle and Phaser bundle above 500 kB (988.82 kB and 1,374.84 kB). `git diff --check` passed.
- Verified by automation: error mapping, safe log redaction and 20-event cap, schedule conversion, typecheck, and production compilation. Shared content writes use client-generated document IDs, pending server writes are visible, and repeat submits are locked while a request is active.
- Verified manually: none.
- Unverified: destination flows against live Firebase, Firebase rules/emulator behavior, two-account sync, hidden-tab behavior on real browsers, and phone layout. No production data or Firebase console was accessed; no deploy was run.
- Open issues: security emulator startup remains unverified from P0. The standalone Phaser bundle still exceeds Vite's 500 kB warning threshold.

## Stage B — Two characters: pending

## Stage C — Personal envelope and first-entry letter: pending

## Stage D — Living world: pending

## Stage E — Walkable Our Home: pending

## Stage F — Garden and Mailbox polish: pending

## Stage G — Personal corners: pending

## Stage H — Together moments: pending

## Stage I — Our Little Sky and Our Future: pending

## Stage J — Polish and release: pending

## Combined deploy plan

Not run. After emulator rules tests and owner review: deploy Firestore indexes and wait for them to finish; deploy Firestore rules; run the production build and deploy Hosting. Every Firebase deploy command will include `--project a-tiny-world-for-two`.
