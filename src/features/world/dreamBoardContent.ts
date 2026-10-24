import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
} from 'firebase/firestore'
import { firebaseAuth, firestore } from '../../lib/firebase'
import { logError } from '../../lib/logger'
import { trackListener, trackWrite } from '../../lib/diagnostics'
import { normalizeDreamText } from './dreamBoardText'

export type DreamEntry = {
  id: string
  authorUid: string
  text: string
  createdAt: Timestamp
  updatedAt: Timestamp
  hasPendingWrites: boolean
}

const DREAMS_PATH = 'dreams/shared/entries'
const DREAM_LIMIT = 100

function requireCurrentAuthor(authorUid: string) {
  if (firebaseAuth?.currentUser?.uid !== authorUid) throw new Error('Sign in again before changing this dream.')
  if (!firestore) throw new Error('Cloud Firestore is not configured for this app.')
}

export function watchDreamBoard(onChange: (entries: DreamEntry[]) => void, onError: (error: unknown) => void) {
  if (!firestore) {
    onError(new Error('Cloud Firestore is not configured for this app.'))
    return () => {}
  }
  return trackListener(onSnapshot(
    query(collection(firestore, DREAMS_PATH), orderBy('createdAt', 'desc'), limit(DREAM_LIMIT)),
    { includeMetadataChanges: true },
    snapshot => onChange(snapshot.docs.map(document => ({
      id: document.id,
      ...document.data(),
      hasPendingWrites: document.metadata.hasPendingWrites,
    } as DreamEntry))),
    error => {
      logError(error, 'firestore/dream-board-listener')
      onError(error)
    },
  ))
}

export async function addDream(authorUid: string, text: string) {
  requireCurrentAuthor(authorUid)
  const normalized = normalizeDreamText(text)
  await trackWrite('firestore/dream-create', addDoc(collection(firestore!, DREAMS_PATH), {
    authorUid,
    text: normalized,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }))
}

export async function editDream(id: string, authorUid: string, text: string) {
  requireCurrentAuthor(authorUid)
  const normalized = normalizeDreamText(text)
  await trackWrite('firestore/dream-edit', updateDoc(doc(firestore!, DREAMS_PATH, id), {
    text: normalized,
    updatedAt: serverTimestamp(),
  }))
}

export async function deleteDream(id: string, authorUid: string) {
  requireCurrentAuthor(authorUid)
  await trackWrite('firestore/dream-delete', deleteDoc(doc(firestore!, DREAMS_PATH, id)))
}
