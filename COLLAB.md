# COLLAB.md: shared state between Codex and Claude
Rule: only one agent works at a time. Read this file first. Update it before you stop.

## Current baseline
Branch: `feature/pets-data` | Base commit: `d05d21f` | typecheck / unit / build: pass / pass (59) / pass | security: pass (69/69 passing; 56 baseline + 13 pet tests)
Live site: <url> | Last deploy: <date> | Rules deployed match repo: yes/no

## Task board
| # | Feature | Owner | Status | Next step | Files | Blockers |
|---|---------|-------|--------|-----------|-------|----------|
| 1 | Pets: UI + sprites | Codex | done | Review UI; Claude can start sync/rules | `src/features/world/{WorldGame,WardrobePanel,IslandScene,petSprites,petStoreStub}.tsx`, `src/features/world/wardrobe.css`, `public/pets/*.svg` | Pet settings are in-memory until task 2 |
| 2 | Pets: rules + sync | Claude | in progress | Verify pet synchronization between players in app / e2e | `firestore.rules`, rules tests, `src/features/world/petStore.ts`, `WorldGame.tsx` | Pet rules verified; NOT deployed |

Status: todo / in progress / needs-review / blocked / done

## Handoff note
- Security test verification completed: `tests/firestore.rules.test.js` syntax error (unexpected token `}` at line 1278) was caused by stale duplicate tests appended after the rewritten pet suite (which already had closed with `})` at line 1129).
- When syntax was checked, the duplicate tests failed with `ReferenceError: petRecord is not defined` and `TypeError: ctx.firestore().recursiveDelete is not a function`. The failures were in the TEST code (stale draft before rewrite), not the RULE.
- Stale duplicate block removed; all 13 rewritten pet tests pass cleanly. Security test suite: 69/69 passing (56 baseline + 13 pet tests).
- All unit tests (59/59), typecheck, and production build pass cleanly.
- Pet rules are NOT deployed.
- Next step: Verify pet synchronization in client/gameplay and end-to-end flows.

## Decisions and traps (append only)
- 2026-10-26 Pet UI uses an in-memory adapter until Claude's rules/sync task; do not infer that pet settings persist or synchronize.
- 2026-10-26 Pet security rules verified (69/69 passing). Rules enforce: active members read `world/pets`; member writes only their own UID key; kind in ['none', 'cat', 'fox']; name <= 32 chars string; updatedAt == request.time; deletes denied; non-members and unauthenticated users denied. Failed pet tests were confirmed to be stale test code calling non-existent `recursiveDelete` and undefined `petRecord`, not rule errors.

## Rules both agents follow
No deploys. $0 Firebase Spark only. No Cloud Functions or Storage. No invented personal text.
No secrets, UIDs or emails in code or logs. Never edit rules without updating tests.
Rules changes go to Claude. Never claim something works unless a check ran.

## NEEDS RULES — Pet companion document for task 2

The UI expects one Firestore document at `world/pets`, with this exact logical shape (document ID `pets` in collection `world`):

```ts
type PetKind = 'none' | 'cat' | 'fox'
type PetRecord = { kind: PetKind; name: string; updatedAt: serverTimestamp }
type PetsDocument = Record<uid, PetRecord>
```

Each active member may write only their own UID key. `name` is player-entered text, trimmed and limited to 32 characters (empty is allowed); no personal name is supplied by the app. `updatedAt` must be a server timestamp. Both active members need read access for rendering each other's pet. Implement owner-key validation and exact field/type checks in Firestore rules and emulator tests. No new realtime database path is requested; movement is simulated client-side.
