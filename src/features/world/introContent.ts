import {
  doc,
  getDocFromServer,
  runTransaction,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore'
import { firebaseAuth, firestore } from '../../lib/firebase'
import { trackWrite } from '../../lib/diagnostics'

export const INTRO_LETTER_PLACEHOLDER = '[Talha: write the first-entry letter here]'
export const INTRO_LETTER_LIMIT = 2000

export type IntroLetter = { text: string; exists: boolean }

function setupError(message: string, code = 'failed-precondition') {
  return Object.assign(new Error(message), { code })
}

export async function loadIntroLetter(): Promise<IntroLetter> {
  if (!firestore) throw new Error('Cloud Firestore is not configured for this app.')
  const snapshot = await getDocFromServer(doc(firestore, 'content', 'introLetter'))
  if (!snapshot.exists()) return { text: INTRO_LETTER_PLACEHOLDER, exists: false }
  const text = snapshot.data().text
  if (typeof text !== 'string' || text.trim().length === 0 || text.length > INTRO_LETTER_LIMIT) {
    throw setupError('The first-entry letter needs a valid text value.')
  }
  return { text, exists: true }
}

export async function saveIntroLetter(uid: string, talhaUid: string, text: string) {
  if (firebaseAuth?.currentUser?.uid !== uid || uid !== talhaUid) {
    throw setupError('Only Talha can update the first-entry letter.', 'permission-denied')
  }
  const normalized = text.trim()
  if (!normalized || normalized.length > INTRO_LETTER_LIMIT) {
    throw new Error('The first-entry letter must be between 1 and 2,000 characters.')
  }
  if (!firestore) throw new Error('Cloud Firestore is not configured for this app.')
  await trackWrite('firestore/intro-letter-save', setDoc(doc(firestore, 'content', 'introLetter'), {
    text: normalized,
    updatedAt: serverTimestamp(),
  }))
}

export async function completeIntroOnce(uid: string): Promise<boolean> {
  if (firebaseAuth?.currentUser?.uid !== uid) throw setupError('Your sign-in changed before the intro could be completed.', 'unauthenticated')
  if (!firestore) throw new Error('Cloud Firestore is not configured for this app.')
  const profileRef = doc(firestore, 'playerProfiles', uid)
  return trackWrite('firestore/intro-complete', runTransaction(firestore, async transaction => {
    const profile = await transaction.get(profileRef)
    if (!profile.exists()) throw setupError('The player profile is not ready for the intro.')
    const completedAt = profile.data().introCompletedAt
    if (completedAt !== null && completedAt !== undefined) return false
    transaction.update(profileRef, { introCompletedAt: serverTimestamp() })
    return true
  }))
}
