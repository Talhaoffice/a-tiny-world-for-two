# A Tiny World for Two

This is a private two-person island built with React, Phaser, Firebase Authentication, Realtime Database, and Cloud Firestore. The Phaser game is lazy-loaded after the member roster is resolved. The static app shell can open offline after its first successful load; signing in and all Firebase-backed content still require a network connection.

## Local development

Requirements: Node.js 24 or newer and npm.

1. Install packages with `npm install`.
2. Create `.env.local` from `.env.example` if needed and add the Firebase Web App configuration. If `.env.local` already exists, keep it and edit only the values you intend to change. Never put passwords, service account keys, or other privileged credentials in Vite variables.
3. Follow [FIREBASE_SETUP.md](FIREBASE_SETUP.md) to provision the two invited Authentication accounts and Realtime Database membership.
4. Follow [FIRESTORE_SETUP.md](FIRESTORE_SETUP.md) for the Firestore membership mirror, owner-managed mapping, document structure, rules, and emulator instructions.
5. Start the Vite server with `npm run dev`.

### Isolated Firebase emulators

Vite development defaults to `VITE_FIREBASE_TARGET=emulator`. You can also set it explicitly in `.env.local`; use `hosted` only when you intentionally want the development server to connect to the configured hosted Firebase project. Emulator mode uses a separate Firebase app name and connects Auth, Realtime Database, Firestore, and Functions to loopback. It throws during initialization if local Firebase web-app settings or a required service are missing; it never switches to the hosted app. Production builds reject an emulator target.

Because `.env.local` explicitly selects emulator mode, select the hosted target only for a production build. This setting is process-local:

```powershell
$env:VITE_FIREBASE_TARGET = 'hosted'
npm run build
$buildExit = $LASTEXITCODE
Remove-Item Env:VITE_FIREBASE_TARGET
if ($buildExit -ne 0) { exit $buildExit }
```

The emulator endpoints are Auth `127.0.0.1:9099`, Realtime Database `127.0.0.1:9000`, Firestore `127.0.0.1:8080`, Functions `127.0.0.1:5001`, and Emulator UI `127.0.0.1:4000`.

Start from PowerShell in the repository root. The port check reports the owning process and exits before the start command if one of these ports is occupied. Identify any reported process before proceeding; do not stop an emulator another session is using. Java 21 is selected only for this PowerShell process:

```powershell
$ports = 4000, 5001, 8080, 9000, 9099
$listeners = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $ports -contains $_.LocalPort }
if ($listeners) {
  $listeners | ForEach-Object {
    $process = Get-CimInstance Win32_Process -Filter "ProcessId = $($_.OwningProcess)"
    [pscustomobject]@{ Port = $_.LocalPort; PID = $_.OwningProcess; Process = $process.Name; CommandLine = $process.CommandLine }
  } | Format-List
  throw 'A Firebase emulator port is already in use. Identify that session before starting another.'
}
$env:JAVA_HOME = 'C:\Program Files\Eclipse Adoptium\jdk-21.0.12.101-hotspot'
$env:Path = "$env:JAVA_HOME\bin;$env:Path"
java -version
npx firebase emulators:start --only auth,database,firestore,functions --project a-tiny-world-for-two
```

Create two synthetic users in the local Auth emulator at `http://127.0.0.1:4000` → **Authentication** → **Add user**. Do not use production accounts. Copy the generated UIDs locally, then in a second PowerShell window from the repository root seed only the verified emulator membership/roster documents:

```powershell
$env:TINY_WORLD_EMULATOR_BOOTSTRAP = '1'
$env:GCLOUD_PROJECT = 'a-tiny-world-for-two'
$env:FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099'
$env:FIREBASE_DATABASE_EMULATOR_HOST = '127.0.0.1:9000'
$env:FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080'
npm run emulator:seed -- '<talha-emulator-uid>' '<mannu-emulator-uid>'
```

The seed command confirms both UIDs exist in local Auth, refuses a different project or any non-loopback endpoint, and writes only Firestore `members/{uid}: {active:true}`, `world/main: {talhaUid, mannuUid}`, and RTDB `members/{uid}: true`. It uses the Functions folder's installed Admin SDK with emulator host variables; it does not change client-facing rules. Sign in to the app at its Vite localhost URL using the synthetic local accounts. Keep the emulator window running while testing.

Useful local checks:

```powershell
npm run typecheck
npm run test:unit
npm run build
npm run test:security
```

The security suite runs only against local Firebase emulators. Do not point tests at production data or relax rules to make a test pass. Publishing is a separate owner action; see the review and publish sequence in `FIRESTORE_SETUP.md`.

## Two-profile manual check

Use two separate browser profiles or private windows so each has an independent Firebase session. Sign in once as Talha and once as Mannu. Confirm each sees **Island connected**, then check:

1. Both characters appear in the island and walking in the same room updates the other view. Entering the home interior should hide the other character until both players return to the same room.
2. Open Our Home and the Memory Garden in both browsers. Add a harmless test note, keepsake, and flower from one profile; verify the other can read them and cannot edit or remove the first profile's item.
3. Visit each personal corner. Confirm only its owner can change its lantern or greenhouse settings. Change a wardrobe appearance and check that the other browser sees the updated look.
4. Send a wave or heart, sit at the pond bench, and switch the pond lantern. Confirm each action appears in the other browser and that the local cooldown is respected.
5. Save one optional annual date as Talha, choose it at the stargazing spot, and check the constellation after switching the local time selector to night. Restore the preferred atmosphere setting after the check.
6. Add a short dream from each account. Verify both can read each entry, but only its author can edit or remove it; confirm the removal prompt before deleting a test entry.
7. Open a letter from its sender and recipient. For a scheduled test letter, verify the recipient cannot read the body before its release time. Remove test content when it is no longer needed.
8. With the app already loaded, disconnect the browser from the network. Confirm the static shell opens, the offline status appears, and no cloud write is represented as saved. Restore the connection and confirm the app reconnects.

These checks create or change Firebase records. Run them only in an owner-approved test project or with harmless entries in the intended private world, and remove test records afterward. Emulator tests remain the required rules check before any publish.

## Optional Playwright two-context check

`npm run test:e2e` contains an authenticated browser test using two independent contexts. It skips if Playwright or the two credential pairs are absent. To enable it, install Playwright and its Chromium browser, start the app at `http://127.0.0.1:4173` (for example, `npm run build` followed by `npm run preview -- --host 127.0.0.1`), then provide these variables to the test process:

```powershell
npm install --save-dev playwright
npx playwright install chromium
```

```text
TINY_WORLD_TALHA_EMAIL
TINY_WORLD_TALHA_PASSWORD
TINY_WORLD_MANNU_EMAIL
TINY_WORLD_MANNU_PASSWORD
TINY_WORLD_BASE_URL (optional; defaults to http://127.0.0.1:4173)
```

Use credentials for a dedicated test Firebase project, not the live private world. The check signs both users in and therefore publishes their ordinary RTDB presence and position while it runs. It does not print credential values. Playwright is optional and is not installed by the base project setup.

## Privacy and offline limits

Dream-board entries and other shared content are plain text protected by Firebase Authentication and security rules. **This project does not provide end-to-end encryption. Firebase project owners with privileged access can read stored content.** Do not store highly sensitive information here.

The service worker caches only the same-origin app shell and static `/assets/` files. It does not cache Firebase Authentication, Firestore, Realtime Database, or other cross-origin/API traffic. Offline use means the interface can load and local-only moments can animate; sign-in, shared presence, and cloud reads/writes need a connection.
