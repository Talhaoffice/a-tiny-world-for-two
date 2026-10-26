# COLLAB.md: shared state between Codex and Claude
Rule: only one agent works at a time. Read this file first. Update it before you stop.

## Current baseline
Branch: `codex/task-1-pets-ui-sprites` | Base commit: `d05d21f` | typecheck / unit / build: pass / pass (59) / pass | security: not run
Live site: <url> | Last deploy: <date> | Rules deployed match repo: yes/no

## Task board
| # | Feature | Owner | Status | Next step | Files | Blockers |
|---|---------|-------|--------|-----------|-------|----------|
| 1 | Pets: UI + sprites | Codex | done | Review UI; Claude can start sync/rules | `src/features/world/{WorldGame,WardrobePanel,IslandScene,petSprites,petStoreStub}.tsx`, `src/features/world/wardrobe.css`, `public/pets/*.svg` | Pet settings are in-memory until task 2 |
| 2 | Pets: rules + sync | Claude | todo | Replace `petStoreStub.ts` with secured read/write/watch and synchronize both pets | `firestore.rules`, rules tests, `src/features/world/petStoreStub.ts`, `WorldGame.tsx` | NEEDS RULES below |

Status: todo / in progress / needs-review / blocked / done

## Handoff note
- Who stopped: Claude, weekly usage limit. Resumes in about 7 days.
- Done, UNVERIFIED: `world/pets` rule in firestore.rules, `petStore.ts` (Firestore-backed, replaces petStoreStub), imports in WardrobePanel.tsx and WorldGame.tsx, savePetDraft is now async.
- Half-finished: pet tests in tests/firestore.rules.test.js were rewritten to seed `world/pets` with setDoc instead of recursiveDelete. They have NOT been run since.
- Next step: run `npm run test:security`. Fix any failing pet tests. Do not change a rule to make a test pass without writing down why.
- Pet rules are NOT deployed.

## Decisions and traps (append only)
- 2026-10-26 Pet UI uses an in-memory adapter until Claude's rules/sync task; do not infer that pet settings persist or synchronize.

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
