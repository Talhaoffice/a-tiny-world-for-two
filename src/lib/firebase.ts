import { getApp, getApps, initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getDatabase } from 'firebase/database'
import { getFirestore } from 'firebase/firestore'

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
