# COLLAB.md: shared state between Codex and Claude
Rule: only one agent works at a time. Read this file first. Update it before you stop.

## Current baseline
Branch: `feature/pets-data` | Base commit: `d05d21f` | prior security baseline: 69/69 (56 baseline + 13 pet tests). Previous task: typecheck / unit / build passed; security result remained unverified. Startup timing task: typecheck / unit (65) / build passed; test:security NOT run here and must be run by the owner.
Live site: <url> | Last deploy: <date> | Rules deployed match repo: yes/no

## Task board
| # | Feature | Owner | Status | Next step | Files | Blockers |
|---|---------|-------|--------|-----------|-------|----------|
| 1 | Pets: UI + sprites | Codex | done | Review UI; Claude can start sync/rules | `src/features/world/{WorldGame,WardrobePanel,IslandScene,petSprites,petStoreStub}.tsx`, `src/features/world/wardrobe.css`, `public/pets/*.svg` | Pet settings are in-memory until task 2 |
| 2 | Pets: rules + sync | Claude | in progress | Verify pet synchronization between players in app / e2e | `firestore.rules`, rules tests, `src/features/world/petStore.ts`, `WorldGame.tsx` | Pet rules verified; NOT deployed |
| 3 | Blank island and panels | Codex | needs-review | Complete security verification, then browser verification of boot trace, live SW refresh, panels, two accounts, phone | `src/features/world/WorldGame.tsx`, `IslandScene.ts`, `WardrobePanel.tsx`, `src/features/gallery/GalleryPanel.tsx`, `public/sw.js` | Browser is unavailable; live behavior unverified |
| 4 | Startup timing and membership retries | Codex | needs-review | Owner runs security test, then browser-check slow membership, retries, timeout, and late-ready recovery | `src/App.tsx`, `src/lib/startupProgress.ts`, `src/lib/logger.ts`, `src/features/world/WorldGame.tsx`, `tests/startup-progress.test.js` | Browser unavailable; security not run here |

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

## Handoff — Task 3: blank island and panels (2026-10-30)

- **Root cause is not confirmed.** Browser access was explicitly unavailable, so the live blank canvas and blank panels could not be reproduced. Code suspects found: the service worker used a fixed `tiny-world-shell-v1` cache key, which can retain a stale shell across deployments (`public/sw.js` before this change); `IslandScene.create()` previously had no catch around its asynchronous Phaser lifecycle, which React ErrorBoundary cannot catch; Wardrobe had no explicit saved-look loading/error state and Gallery listener/render errors had no reliable recovery UI. These are failure modes identified from code, not a confirmed explanation for the live incident.
- Startup path: auth observer (`src/App.tsx:48`) → RTDB membership (`src/App.tsx:61`) → required roster/world and profile reads (`src/features/world/WorldGame.tsx:267`, `src/features/world/characterRoster.ts:32,81`) → Phaser dynamic import/boot (`src/features/world/WorldGame.tsx:282,351`) → scene create/texture generation (`src/features/world/IslandScene.ts:131,447`). Player look (`WorldGame.tsx:270`, `playerLooks.ts:42`) and pets (`WorldGame.tsx:194`, `petStore.ts:76`) load independently and now time out with fallback. Auth and membership happen before Phaser; either can fail or stall without mounting the island. Task 4 replaces the earlier 10-second App timeout with a shared 30-second inactivity monitor. Roster queries can reject or wait; profile/look/pet reads now time out. Scene construction/drawing can throw; scene create now catches and exposes failure UI. Phaser config is `AUTO` (`WorldGame.tsx:353`), which Phaser's installed type documentation describes as WebGL with Canvas fallback when WebGL is unavailable. Host size is measured and repaired/validated before Phaser construction (`WorldGame.tsx:290`). Runtime/browser canvas dimensions and actual renderer selection are unverified.
- Boot trace records timestamp, fixed step name, started/done/failed, and normalized error code in the redacted logger; visible in DEV or with `?debug=1`. No tokens, emails, UIDs, or content are included in trace/copy diagnostics.
- Service worker now receives a unique timestamp + random UUID at build close; activation deletes earlier caches with the app-shell prefix. Two production builds ran; the generated worker cache name changed between them. Old-cache deletion is covered by the unit test. Live activation/reload is unverified.
- Verification this task: `npm run typecheck` passed; `npm run test:unit` passed (59/59); `npm run build` passed (large-chunk warning only). `npm run test:security` was run twice; each invocation stalled after the CLI MOTD/network warning without reporting emulator readiness or tests. Both were interrupted after more than two minutes. Current security result is unverified; the historical 69/69 result above is not claimed as this task's verification. No browser/site, two-account, or phone behavior is verified.
- **Exact next step:** rerun `npm run test:security` in an environment where the Firebase emulators start, and confirm at least 69 passing; then use a real browser on the live site with `?debug=1`; capture the last boot step and browser console if blank, verify the updated worker reload, Wardrobe and Gallery states, then repeat on two accounts and a phone.

## Handoff — Task 4: startup timing (2026-10-30)

- The owner's console trace plus code confirms the timing issue: the previous global timer was `src/App.tsx:28` (10 seconds), while the independent game timer was `src/features/world/WorldGame.tsx:234` (10 seconds) and set `disposed = true`. The scene-ready callback at `WorldGame.tsx:329` returned immediately when disposed, leaving the failure overlay sticky after late startup. Both fixed deadlines are replaced by `src/lib/startupProgress.ts:33`, which checks for 30 seconds without a progress event.
- A shared startup progress monitor now resets a 30-second inactivity deadline on each trace step. It names the last active step in the failure message, shows “Still connecting…” with a spinner while connecting, and treats a timeout as recoverable if late progress arrives. The scene-ready signal clears any displayed failure. Retry starts a fresh monitoring interval.
- Membership reads retry after errors with 1s, 3s, and 6s backoffs (four attempts total). Every failed read records a normalized code, safe message, and duration in the boot trace. Only a successful read whose value is not `true` denies membership and signs out; exhausted network errors keep the session and show a retryable connection message.
- Boot trace events now include per-attempt duration in milliseconds and safe error details. Opaque IDs, emails, and tokens are redacted; `?debug=1` visibility remains.
- **Verified:** `npm run typecheck` passed; `npm run test:unit` passed (65/65, including six fake-timer startup tests); `npm run build` passed (large-chunk warning only). Tests cover a 12-second membership read then ready, two membership errors then success, a 30-second stuck step naming `roster`, late ready clearing failure, and trace duration/redaction.
- **Not run:** `npm run test:security` was not run for this task; the owner must run it. No browser was used. Live membership retry behavior, visible spinner/failure recovery, and `?debug=1` rendering remain UNVERIFIED.
- **Exact next step:** the owner runs `npm run test:security`; then use a browser to exercise membership success after 12 seconds, two transient failures then success, a step with no progress for 30 seconds, and ready arriving after the failure overlay. Confirm the overlay clears and the trace shows each duration and failed-attempt code/message.
