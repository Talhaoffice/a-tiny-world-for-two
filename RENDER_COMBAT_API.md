# Combat API on Render Free

This service replaces Firebase Cloud Functions for combat actions. The browser sends an authenticated HTTPS request; the API verifies the Firebase ID token, checks both RTDB memberships and current presence/positions, and uses the existing server combat core to update `world/combat/state`. The browser continues to listen directly to Realtime Database for health and knockout updates.

The service does not trust request-supplied damage, health, weapon, membership, or target eligibility. The selected weapon is read from the validated RTDB loadout; target membership, current state, position, freshness, range, facing, cooldown, carry ownership, and water bounds are validated by the server. Service-account credentials must never be put in any `VITE_*` variable or committed file.

## Runtime environment

Render sets `PORT` for a web service. The API also accepts the following environment variables:

| Variable | Required | Value |
| --- | --- | --- |
| `FIREBASE_PROJECT_ID` | Yes | `a-tiny-world-for-two` |
| `FIREBASE_DATABASE_URL` | Yes | `https://a-tiny-world-for-two-default-rtdb.firebaseio.com` |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Yes | The full service account JSON, entered as a secret in Render's Environment settings. The account's `project_id` must match. |
| `COMBAT_ALLOWED_ORIGINS` | Optional | Comma-separated bare origins. Default: production site plus `http://localhost:5173` and `http://127.0.0.1:5173`. Keep the production origin in the list. |
| `PORT` | Supplied by Render | The server defaults to `8787` for local use. Do not hard-code a Render port. |

The API verifies ID tokens with revocation checking. Grant the dedicated service account Firebase Authentication Viewer and Firebase Realtime Database Admin on this project, and no roles on other projects. The Admin SDK can bypass RTDB rules, so keep the key only in Render's secret environment variable, restrict access to the Render service settings, and rotate/delete the key if it is exposed. RTDB Admin gives broad access to this project's database; the API code deliberately limits which actions it performs.

## Create the Render Free Web Service

1. Push the reviewed repository branch to GitHub yourself, then in Render choose **New → Web Service** and connect `Talhaoffice/a-tiny-world-for-two` and that branch. This repository has not been pushed by this change.
2. Set **Root Directory** to `functions`.
3. Select the **Free** instance plan and a region close to the Firebase database.
4. Set **Build Command** to `npm ci` and **Start Command** to `npm run start:api`.
5. Set **Health Check Path** to `/healthz`.
6. Add the required environment variables from the table above. Enter the service account JSON only in Render's secret environment editor; do not paste it into the repository, chat, or browser configuration. `COMBAT_ALLOWED_ORIGINS` can be set to `https://a-tiny-world-for-two.web.app,http://localhost:5173,http://127.0.0.1:5173`.
7. Create/deploy the service. Confirm `https://<render-service>.onrender.com/healthz` returns `{"status":"ok"}`. The action routes are `/api/combat/attack` and `/api/combat/interact`.

Render Free web services sleep after 15 minutes without inbound traffic and can take about a minute to wake. The first action after idle may be slow or need a retry. The service is stateless and keeps authoritative state in RTDB, so its ephemeral filesystem and restarts do not lose combat state. It does not provide a continuously running process for scheduled/background game logic.

## Point the production frontend to the API

After Render assigns the service URL, build the existing Firebase Hosting app with that URL. In PowerShell, from the repository root:

```powershell
$env:VITE_FIREBASE_TARGET = 'hosted'
$env:VITE_COMBAT_API_URL = 'https://<render-service>.onrender.com'
npm run build
```

Check the output, then separately publish the Hosting build only when ready:

```powershell
firebase deploy --only hosting --project a-tiny-world-for-two
```

Remove the process-local variables after the build/deploy command:

```powershell
Remove-Item Env:VITE_FIREBASE_TARGET, Env:VITE_COMBAT_API_URL -ErrorAction SilentlyContinue
```

`VITE_COMBAT_API_URL` is a public endpoint and is safe in the frontend bundle; it must contain no credentials. Production code rejects HTTP and localhost API URLs. If it is unset, production combat fails closed; it does not fall back to a client RTDB write. Development without this URL keeps the current local Functions emulator path. To test the HTTP path locally, set `VITE_COMBAT_API_URL=http://127.0.0.1:8787` in the development environment and add the local app origin to `COMBAT_ALLOWED_ORIGINS` on the API process.

### Run the HTTP API against local emulators

Start the Auth and Database emulators using the project's configured local ports. In a second PowerShell window, start the API with explicit emulator mode (no service-account key is needed):

```powershell
$env:FIREBASE_PROJECT_ID = 'a-tiny-world-for-two'
$env:FIREBASE_DATABASE_URL = 'https://a-tiny-world-for-two-default-rtdb.firebaseio.com'
$env:COMBAT_API_EMULATOR_MODE = 'true'
$env:FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099'
$env:FIREBASE_DATABASE_EMULATOR_HOST = '127.0.0.1:9000'
$env:PORT = '8787'
npm --prefix functions run start:api
```

For the Vite app, set `VITE_COMBAT_API_URL=http://127.0.0.1:8787` in `.env.local` and restart Vite. The API refuses emulator mode unless both Admin SDK emulator hosts are loopback addresses. The regular browser config still chooses the local Auth and Database emulators from `firebase.json`; do not set `VITE_FIREBASE_TARGET=hosted` for this local test.

## Free-tier boundary

Firebase Authentication, RTDB client listeners, and RTDB storage/rules remain Firebase services. The Render API handles only synchronous combat actions. Cloud Functions triggers, scheduled functions, continuous server loops, and always-on low-latency API availability are not supplied by this design. Render Free's idle sleep makes the HTTP backend intermittently unavailable during cold starts; Firebase RTDB listeners and movement do not depend on Render. Render Free includes finite monthly instance hours and can suspend service at its quota, so check the current plan limits before relying on the API for an always-available live game.
