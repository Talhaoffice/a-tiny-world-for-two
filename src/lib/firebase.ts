import { getApps, initializeApp } from 'firebase/app'
import { connectAuthEmulator, getAuth } from 'firebase/auth'
import { connectDatabaseEmulator, getDatabase } from 'firebase/database'
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore'
import { connectFunctionsEmulator, getFunctions } from 'firebase/functions'
import { assertEmulatorProject, firebaseAppName, FIREBASE_FUNCTIONS_REGION, requireEmulatorServices, resolveFirebaseTarget } from './firebaseTarget'

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

export const firebaseTarget = resolveFirebaseTarget(import.meta.env.DEV, import.meta.env.VITE_FIREBASE_TARGET)
assertEmulatorProject(firebaseTarget, config.projectId)

if (firebaseTarget === 'emulator' && !firebaseConfigured) {
  throw new Error('Firebase emulator mode requires the Firebase web app settings in .env.local; no hosted fallback was attempted.')
}

const appName = firebaseAppName(firebaseTarget)
const existingApp = getApps().find(candidate => candidate.name === appName)
const app = firebaseConfigured
  ? existingApp ?? initializeApp(config, appName)
  : null

export const firebaseAuth = app ? getAuth(app) : null
export const realtimeDatabase = app ? getDatabase(app) : null
export const firestore = app ? getFirestore(app) : null
export const firebaseFunctions = app ? getFunctions(app, FIREBASE_FUNCTIONS_REGION) : null

if (import.meta.env.DEV && firebaseTarget === 'emulator') {
  const emulatorEndpoints = {
    auth: { host: '127.0.0.1', port: 9099, url: 'http://127.0.0.1:9099' },
    database: { host: '127.0.0.1', port: 9000 },
    firestore: { host: '127.0.0.1', port: 8080 },
    functions: { host: '127.0.0.1', port: 5001 },
  }
  const emulatorServices = { firebaseAuth, realtimeDatabase, firestore, firebaseFunctions }
  requireEmulatorServices(emulatorServices)
  connectAuthEmulator(emulatorServices.firebaseAuth, emulatorEndpoints.auth.url, { disableWarnings: true })
  connectDatabaseEmulator(emulatorServices.realtimeDatabase, emulatorEndpoints.database.host, emulatorEndpoints.database.port)
  connectFirestoreEmulator(emulatorServices.firestore, emulatorEndpoints.firestore.host, emulatorEndpoints.firestore.port)
  connectFunctionsEmulator(emulatorServices.firebaseFunctions, emulatorEndpoints.functions.host, emulatorEndpoints.functions.port)
}
