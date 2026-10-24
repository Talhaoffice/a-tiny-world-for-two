import {
  doc,
  getDocFromServer,
  runTransaction,
  serverTimestamp,
  Timestamp,
  type DocumentReference,
  type Firestore,
} from 'firebase/firestore'
import { firebaseAuth, firestore } from '../../lib/firebase'

export const TUTORIAL_VERSION = 1

export type TutorialProgress = {
  tutorialVersion: number
  welcomeReadAt: Timestamp | null
  completedAt: Timestamp | null
}

type ProgressField = 'welcomeReadAt' | 'completedAt'

function progressContext(): { database: Firestore; reference: DocumentReference } {
  const database = firestore
  const uid = firebaseAuth?.currentUser?.uid
  if (!database) throw new Error('Cloud Firestore is not configured for this app.')
  if (!uid) throw new Error('Sign in before saving tutorial progress.')
  return { database, reference: doc(database, 'playerTutorials', uid) }
}

function parseProgress(data: Record<string, unknown>): TutorialProgress {
  const allowedFields = ['tutorialVersion', 'welcomeReadAt', 'completedAt']
  const hasExactFields = allowedFields.every(field => field in data)
    && Object.keys(data).every(field => allowedFields.includes(field))
  const validTimestamp = (value: unknown): value is Timestamp | null =>
    value === null || value instanceof Timestamp

  if (!hasExactFields
    || data.tutorialVersion !== TUTORIAL_VERSION
    || !validTimestamp(data.welcomeReadAt)
    || !validTimestamp(data.completedAt)) {
    throw new Error('Tutorial progress is unavailable or has an unsupported version.')
  }

  return {
    tutorialVersion: TUTORIAL_VERSION,
    welcomeReadAt: data.welcomeReadAt,
    completedAt: data.completedAt,
  }
}

export async function loadTutorialProgress(): Promise<TutorialProgress | null> {
  const { reference } = progressContext()
  const snapshot = await getDocFromServer(reference)
  return snapshot.exists() ? parseProgress(snapshot.data()) : null
}

async function recordProgress(field: ProgressField): Promise<void> {
  const { database, reference } = progressContext()

  await runTransaction(database, async transaction => {
    const snapshot = await transaction.get(reference)
    if (!snapshot.exists()) {
      transaction.set(reference, {
        tutorialVersion: TUTORIAL_VERSION,
        welcomeReadAt: field === 'welcomeReadAt' ? serverTimestamp() : null,
        completedAt: field === 'completedAt' ? serverTimestamp() : null,
      })
      return
    }

    const progress = parseProgress(snapshot.data())
    if (progress[field] === null) transaction.update(reference, { [field]: serverTimestamp() })
  })
}

export function recordWelcomeRead(): Promise<void> {
  return recordProgress('welcomeReadAt')
}

export function recordTutorialCompletion(): Promise<void> {
  return recordProgress('completedAt')
}
