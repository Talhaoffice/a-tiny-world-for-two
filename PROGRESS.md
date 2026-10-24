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

## Stage A — Error and debug foundation: pending

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
