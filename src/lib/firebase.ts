import { getApp, getApps, initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getDatabase } from 'firebase/database'
import { doc, getDocFromServer, getFirestore, setLogLevel } from 'firebase/firestore'

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

const configValues = Object.values(config)
export const firebaseConfigured = configValues.every(value =>
  typeof value === 'string' && value.trim().length > 0 && !value.toLowerCase().includes('your-'),
)

const app = firebaseConfigured
  ? getApps().length > 0 ? getApp() : initializeApp(config)
  : null

export const firebaseAuth = app ? getAuth(app) : null
export const realtimeDatabase = app ? getDatabase(app) : null
export const firestore = app ? getFirestore(app) : null

const DEFAULT_FIRESTORE_DATABASE_ID = '(default)'

async function runFirestoreProbe() {
  console.info('[fs-probe] configuration', {
    projectId: config.projectId || 'missing',
    databaseId: DEFAULT_FIRESTORE_DATABASE_ID,
    online: navigator.onLine,
  })

  const user = firebaseAuth?.currentUser
  if (!user) {
    console.info('[fs-probe] auth token: failure (no authenticated user); read not run')
    return
  }

  try {
    await user.getIdToken()
    console.info('[fs-probe] auth token: success')
  } catch {
    console.info('[fs-probe] auth token: failure')
  }

  if (!firestore) {
    console.info('[fs-probe] outcome: unavailable', {
      code: 'unavailable',
      message: 'Cloud Firestore is not configured for this app.',
    })
    return
  }

  type ProbeResult =
    | { outcome: 'success'; exists: boolean }
    | { outcome: 'error'; code: string; message: string }
    | { outcome: 'timeout' }

  const serverRead: Promise<ProbeResult> = getDocFromServer(doc(firestore, 'members', user.uid)).then(
    snapshot => ({ outcome: 'success', exists: snapshot.exists() }),
    (reason: unknown) => ({
      outcome: 'error',
      code: reason && typeof reason === 'object' && 'code' in reason && typeof reason.code === 'string'
        ? reason.code
        : 'unknown',
      message: reason instanceof Error ? reason.message : 'Unknown Firestore probe error.',
    }),
  )

  let timeoutId: number | undefined
  const timeout = new Promise<ProbeResult>(resolve => {
    timeoutId = window.setTimeout(() => resolve({ outcome: 'timeout' }), 10_000)
  })
  const result = await Promise.race([serverRead, timeout])
  if (timeoutId !== undefined) window.clearTimeout(timeoutId)

  if (result.outcome === 'success') {
    console.info(`[fs-probe] outcome: success (${result.exists ? 'exists' : 'does not exist'})`)
  } else if (result.outcome === 'timeout') {
    console.info('[fs-probe] outcome: timeout; underlying read was not cancelled')
  } else {
    const outcome = result.code === 'permission-denied' || result.code === 'unavailable'
      ? result.code
      : 'other error'
    console.info(`[fs-probe] outcome: ${outcome}`, { code: result.code, message: result.message })
  }
}

declare global {
  interface Window {
    __fsProbe?: () => Promise<void>
  }
}

if (import.meta.env.DEV) {
  window.__fsProbe = runFirestoreProbe
  if (new URLSearchParams(window.location.search).get('fsdebug') === '1') {
    setLogLevel('debug')
  }
}
