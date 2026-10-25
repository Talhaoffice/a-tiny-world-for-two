# CLAUDE_HANDOFF.md

## 1. File map

- `PROGRESS.md` (~132): stage history, checks, unverified work, deployment plan.
- `package.json` (~30): scripts and runtime/test dependencies.
- `firebase.json` (~23): emulator and rules/index paths; no Hosting target.
- `firestore.rules` (~455): Firestore membership and content authorization.
- `database.rules.json` (~51): RTDB membership, player state, validation.
- `firestore.indexes.json` (~21): two mailbox composite indexes.
- `src/main.tsx` (~19): React root, error boundary, production service-worker registration.
- `src/App.tsx` (~98): auth, RTDB membership gate, welcome/login/game routing.
- `src/pages/Welcome.tsx` (~18), `src/features/auth/Login.tsx` (~48): entry and invited-account sign-in screens.
- `src/components/DiagnosticsPanel.tsx` (~102): connection banner and gated diagnostics.
- `src/lib/healthCheck.ts` (~223): auth, Firestore and RTDB health probes; development hook.
- `src/features/world/WorldGame.tsx` (~596): world orchestration, Phaser lifecycle, controls, panels.
- `src/features/world/IslandScene.ts` (~740): Phaser map, collision, hotspots, atmosphere, movement.
- `src/features/world/worldSync.ts` (~264): RTDB presence, position, appearance and emotes.
- `src/features/world/characterRoster.ts` (~94): member/profile resolution for the two characters.
- `src/features/world/characterSprites.ts` (~420): runtime character textures and appearance variants.
- `src/features/world/worldAtmosphere.ts` (~15), `worldZone.ts` (~7): atmosphere and room types.
- `src/features/world/HomeInterior.tsx` (~128): walkable room and hotspot UI.
- `src/features/destinations/DestinationPanel.tsx` (~492): home, garden and mailbox screens.
- `src/features/destinations/content.ts` (~293): notes, keepsakes, flowers and letters data/listeners.
- `src/features/destinations/letterSchedule.ts` (~84), `letterAvailability.ts` (~13): letter release rules.
- `src/features/world/introContent.ts` (~58), `IntroExperience.tsx` (~156): first-entry content and reader/editor.
- `src/features/world/PersonalCornerPanel.tsx` (~159), `personalCornerContent.ts` (~155): corners and saved settings.
- `src/features/world/SpecialDatesPanel.tsx` (~82), `specialDatesContent.ts` (~63): annual dates UI/data.
- `src/features/world/StargazingPanel.tsx` (~52), `constellation.ts` (~18): optional date selection and constellation geometry.
- `src/features/world/DreamBoardPanel.tsx` (~125), `dreamBoardContent.ts` (~79): shared future board.
- `src/features/world/tutorialProgress.ts` (~83): saved tutorial/welcome progress.
- `public/sw.js` (~53): shell/static-asset service worker; Firebase/API requests bypass cache.
- `tests/firestore.rules.test.js` (~724): Firestore and RTDB authorization cases.
- `tests/e2e/two-profile.test.mjs` (~47): optional authenticated two-profile browser check.
- `tests/pwa-service-worker.test.mjs` (~96): VM-based service-worker behavior checks.

## 2. Feature wiring audit

`PROGRESS.md` marks P0, Baseline and A–J **done**. No stage is explicitly marked skipped or partial. The authenticated E2E case was skipped; that is a test status, not a stage status.

- **A — PARTIAL:** root error boundary is mounted (`src/main.tsx:13-18`); diagnostics render in the game (`WorldGame.tsx:456`) but are hidden unless dev or `?debug=1` (`DiagnosticsPanel.tsx:28-42`).
- **B — WIRED:** authenticated game loads the roster, dynamically imports Phaser/scene, and creates the game (`WorldGame.tsx:185-242`).
- **C — WIRED:** first-entry mode is selected from profile state; reader/editor has menu entry points (`WorldGame.tsx:191,513-518,552`). Default content remains a placeholder (`introContent.ts:11,20-23`).
- **D — WIRED:** atmosphere controls update scene settings (`WorldGame.tsx:473-500`; `IslandScene.ts:228,511-564`).
- **E — WIRED:** home hotspot routes to the room, changes zone, and mounts `HomeInterior` (`IslandScene.ts:41`; `WorldGame.tsx:225,366-373,543`).
- **F — WIRED:** home/garden/mailbox hotspots route to `DestinationPanel`; its active-destination branches contain the screens (`IslandScene.ts:41-43`; `WorldGame.tsx:230,530`; `DestinationPanel.tsx:131-160,336-455`).
- **G — WIRED:** corner hotspots set the active corner and mount its panel; wardrobe is also reachable from controls (`IslandScene.ts:44-45`; `WorldGame.tsx:226-229,478,559-574`).
- **H — WIRED:** bench/blanket/pond lantern route to emotes or scene state; special dates has a control and panel (`IslandScene.ts:46-48`; `WorldGame.tsx:210-216,511,575`).
- **I — WIRED:** stargazing/dream-board hotspots open mounted panels (`IslandScene.ts:49-50`; `WorldGame.tsx:217-224,582-593`).
- **J — PARTIAL:** production registers the shell worker; the joystick is wired to Phaser movement (`main.tsx:7-10`; `WorldGame.tsx:520-525`; `IslandScene.ts:207`). Worker/offline and mobile rendering were not manually verified.

## 3. Likely “feels unfinished” causes

- If no letter has been saved, the first-entry reader displays a bracketed setup placeholder (`introContent.ts:11,20-23`).
- Characters use runtime-generated pixel textures rather than authored sprite sheets; visual quality is intentionally simple (`characterSprites.ts:11-149`).
- Fishing is a 1.5-second local animation with no saved outcome (`PersonalCornerPanel.ts:92-96,126`).
- Stargazing selections live only in React state and reset on leaving the world/session (`WorldGame.tsx:65-66,159-162`).
- Shared movement/emotes require both clients connected and in the same zone; the PWA caches the app shell/assets, not Firebase data (`worldSync.ts:120-171`; `SETUP.md:30`; `public/sw.js:12-39`).
- Large production chunks remain: app ~1,040 kB and Phaser ~1,375 kB (`PROGRESS.md:123`), which can slow first load.
- Service-worker registration failure is swallowed (`main.tsx:7-10`); special-date load failure is only logged (`WorldGame.tsx:188-190`). Audit search found no TODO/FIXME or “coming soon” strings in app, public, or test paths.

## 4. Deploy dependencies

`PROGRESS.md:13,73,94,105,116,127,132` says no deploy occurred; **none of the current rule/index files is confirmed live**.

- Firestore rules (`firestore.rules:305-453`) cover tutorial/profile/corners, member/world metadata, intro/dates, home/garden content, dreams, and letter parent/private-body access. Stale rules can deny those reads/writes or expose older letter behavior. The two composite `letters` indexes (`firestore.indexes.json:3-18`) are required for sent/received mailbox queries; until built, those queries can fail with a missing-index error.
- RTDB rules (`database.rules.json:6-45`) authorize membership, presence, position (including `zone`), appearance and emotes. Older rules without `zone` reject current room-position writes; stale rules can also block appearance/emote sync. `firebase.json:2-8` points the CLI at these rule/index files.
- `firebase.json:1-23` has no `hosting` section even though `PROGRESS.md:132` and `FIRESTORE_SETUP.md:104` plan Hosting deployment. Add/verify a Hosting target before attempting that deploy.
- Rules default-deny and constrain content to active members. The Firestore `/members` rule allows active members to `list` that collection (`firestore.rules:343-345`), used for roster resolution; review that exposure. Rules are **untested**, not confirmed unsafe: emulator execution stopped before assertions began (`PROGRESS.md:13,127`).
- **Character/tutorial path trace:** `characterRoster.ts:67-68` queries `/members` and gets `/world/main`; `:34,43,50,59` gets/transaction-reads/creates/updates `/playerProfiles/{currentUid}`. `tutorialProgress.ts:54,62,64,73` gets/transaction-reads/creates/updates `/playerTutorials/{currentUid}`. Rules require active membership (`firestore.rules:4-15,343-345`); `/world/main` also requires the literal `main` document ID (`:348-350`). Profile get requires own UID; create/update also validate appearance, and update preserves or sets intro completion once (`:100-114,320-330`). Tutorial get requires own UID; create requires the exact version-1/timestamp schema, while update keeps version and sets timestamps once (`:23-32,305-317`).
- `runHealthCheck()` now reports read-only status for the member query plus `world/main`, profile, and tutorial docs (`src/lib/healthCheck.ts:147-186`; `DiagnosticsPanel.tsx:94-96`). It does not attempt profile/tutorial writes, so it cannot validate write-rule conditions.

## 5. Known bugs and risks

- Tutorial-progress read failure leaves `progressReady` false, hiding the automatic welcome prompt with no visible error (`WorldGame.tsx:132-142,536`; `DestinationPanel.tsx:118`).
- Up to one RTDB position write per 100 ms while moving (~10/s), plus presence heartbeats and interaction writes; monitor quota/cost (`worldSync.ts:65-76,196-207`; `IslandScene.ts:153-180`).
- Service-worker register errors and special-date load errors do not reach the user (`main.tsx:7-10`; `WorldGame.tsx:188-190`).
- No persistent listener leak or duplicate Phaser canvas is established by static inspection: game cleanup stops sync/destroys Phaser (`WorldGame.tsx:270-274`); scene removes document/canvas listeners (`IslandScene.ts:140-150`). React StrictMode replays effects in development (`main.tsx:13-18`), so verify cleanup if duplicate-canvas reports appear.
- Firestore/RTDB access behavior remains a security risk until emulator rules tests actually run; do not infer safety from the passing build/unit suite.

## 6. Prioritized next tasks

1. **Make Hosting deployable.** Files: `firebase.json:1-23`, `package.json:6-13`, `index.html:1-18`. Acceptance: deploy/preview URL opens login and loads manifest/assets in a browser. Risk: wrong Hosting site or public target.
2. **Replace the first-entry placeholder with approved copy or a clear setup state.** Files: `src/features/world/introContent.ts:11,20-23`, `src/features/world/IntroExperience.tsx:142-156`. Acceptance: both profiles can read a non-placeholder letter or clear setup message. Risk: changing intended tone/content.
3. **Make progress/date-load failures recoverable in the UI.** Files: `src/features/world/WorldGame.tsx:132-142,188-190,536`, `src/features/destinations/DestinationPanel.tsx:118-130`. Acceptance: with Firestore unavailable, browser still offers manual letter access and explains the failed saved state. Risk: stale progress may be mistaken for saved progress.
4. **Persist stargazing choices if they are meant to survive reloads.** Files: `src/features/world/WorldGame.tsx:65-66,159-162`, `src/features/world/stargazingPreferences.ts` (new), `firestore.rules:320-330`. Acceptance: select a date, reload, and see the same constellation selection. Risk: profile schema/privacy changes.
5. **Run/fix security rules against emulators before deployment.** Files: `tests/firestore.rules.test.js:1-45,676-724`, `firestore.rules:305-453`, `database.rules.json:1-51`. Acceptance: emulator-backed app browser can create shared content; the second profile cannot edit the first profile record, and the suite passes. Risk: weakening an access rule to satisfy a test.
6. **Publish Firestore indexes, wait for build, then rules.** Files: `firestore.indexes.json:1-21`, `firestore.rules:305-453`, `FIRESTORE_SETUP.md:91-107`. Acceptance: two browser profiles send/receive a released letter and read shared notes/dreams. Risk: production permission mismatch.
7. **Publish current RTDB rules.** Files: `database.rules.json:1-51`, `firebase.json:2-4`, `FIREBASE_SETUP.md:11-23`. Acceptance: two browsers see each other move in the same zone and hide each other across zones; appearance/emotes sync. Risk: live access boundary changes.
8. **Complete phone viewport QA.** Files: `src/features/world/WorldGame.tsx:520-525`, `src/features/world/world.css:25-30`, `src/features/world/HomeInterior.tsx:1-128`. Acceptance: on a phone browser, joystick walks and hotspot/modal controls remain tappable in portrait and landscape. Risk: pointer capture or safe-area regressions.
9. **Measure and reduce position write frequency if needed.** Files: `src/features/world/worldSync.ts:65-76,196-207`, `src/features/world/IslandScene.ts:153-180`. Acceptance: two-browser movement stays smooth while dev diagnostics show fewer writes/minute. Risk: slower remote movement or stale presence.

## 7. Commands

- Typecheck: `npm run typecheck`
- Unit tests: `npm run test:unit`
- Production build: `npm run build`
- Dev server: `npm run dev`
- Firestore + RTDB emulator tests: `npm run test:security`
- Optional authenticated browser test: `npm run test:e2e`

## 8. Verification status

- **Automated, recorded in `PROGRESS.md`:** typecheck/build passed; unit suite passed (41 tests); PWA service-worker VM checks, syntax checks, JSON parsing and built PWA asset presence passed.
- **Attempted but not verified:** `test:security` could not start assertions because the Java child failed loopback initialization. Authenticated E2E was skipped because test setup was unavailable.
- **Manual:** none. Browser preview timed out; no mobile/offline visual checks. The new authenticated path probes were not run: browser automation stopped because it could not verify the current page URL, so the failing live path remains unknown.
- **Never verified:** deployed Hosting, live Firestore/RTDB rules/indexes, sign-in, two-profile sync, real-device layout/offline behavior. No deployment or live Firebase data changes are recorded.
- **Latest local verification:** `npm run typecheck` passed after adding the path probes.



