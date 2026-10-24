import {
  collection,
  deleteField,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore'
import { firebaseAuth, firestore } from '../../lib/firebase'
import { logError, logEvent } from '../../lib/logger'
import { trackListener, trackWrite } from '../../lib/diagnostics'

export type SavedNote = { id: string; authorUid: string; text: string; createdAt: Timestamp; hasPendingWrites: boolean }
export type Keepsake = { id: string; authorUid: string; title: string; description: string; createdAt: Timestamp; hasPendingWrites: boolean }
export type GardenFlower = { id: string; authorUid: string; title: string; memory: string; flowerType: FlowerType; createdAt: Timestamp; hasPendingWrites: boolean }
export type Letter = {
  id: string
  senderUid: string
  recipientUid: string
  createdAt: Timestamp
  releaseAt?: Timestamp
  openedAt?: Timestamp | null
  schemaVersion?: 2
  // Legacy fields remain readable until the sender upgrades that letter.
  text?: string
  opened?: boolean
}
export type LetterBody = { title: string; text: string }
export type FlowerType = 'gold' | 'rose' | 'cream' | 'coral'
export type Member = { uid: string }

const LIST_LIMIT = 50
const db = () => {
  if (!firestore) throw new Error('Cloud Firestore is not configured for this app.')
  return firestore
}

const byNewest = <T extends { createdAt?: Timestamp }>(items: T[]) =>
  items.sort((a, b) => {
    const aTime = a.createdAt && typeof a.createdAt.toMillis === 'function' ? a.createdAt.toMillis() : 0
    const bTime = b.createdAt && typeof b.createdAt.toMillis === 'function' ? b.createdAt.toMillis() : 0
    return bTime - aTime
  })

function reportSnapshotError(error: Error, namespace: string) {
  logError(error, namespace)
}

async function writeSharedContent(operation: 'note' | 'keepsake' | 'flower', path: string, data: Record<string, unknown>) {
  const authorUid = typeof data.authorUid === 'string' ? data.authorUid : ''
  if (!authorUid || authorUid !== firebaseAuth?.currentUser?.uid) throw new Error('Sign in again before saving this shared item.')
  const reference = doc(collection(db(), path))
  logEvent('info', `firestore/${operation}`, 'client-id-created')
  await trackWrite(`firestore/${operation}`, setDoc(reference, data))
  return reference.id
}

export function watchHomeContent(
  onChange: (content: { notes: SavedNote[]; keepsakes: Keepsake[] }) => void,
  onError: (error: Error) => void,
) {
  const database = db()
  let notes: SavedNote[] = []
  let keepsakes: Keepsake[] = []
  const publish = () => onChange({ notes, keepsakes })
  const stopNotes = trackListener(onSnapshot(
    query(collection(database, 'homes/shared/notes'), orderBy('createdAt', 'desc'), limit(LIST_LIMIT)),
    { includeMetadataChanges: true },
    snapshot => {
      logEvent('info', 'firestore/notes', 'snapshot', {
        fromCache: snapshot.metadata.fromCache,
        hasPendingWrites: snapshot.metadata.hasPendingWrites,
        documentCount: snapshot.size,
      })
      notes = byNewest(snapshot.docs.map(document => ({
        id: document.id,
        ...document.data(),
        hasPendingWrites: document.metadata.hasPendingWrites,
      } as SavedNote)))
      publish()
    },
    error => { reportSnapshotError(error, 'firestore/notes'); onError(error) },
  ))
  const stopKeepsakes = trackListener(onSnapshot(
    query(collection(database, 'homes/shared/keepsakes'), orderBy('createdAt', 'desc'), limit(LIST_LIMIT)),
    { includeMetadataChanges: true },
    snapshot => {
      logEvent('info', 'firestore/keepsakes', 'snapshot', {
        fromCache: snapshot.metadata.fromCache,
        hasPendingWrites: snapshot.metadata.hasPendingWrites,
        documentCount: snapshot.size,
      })
      keepsakes = byNewest(snapshot.docs.map(document => ({
        id: document.id,
        ...document.data(),
        hasPendingWrites: document.metadata.hasPendingWrites,
      } as Keepsake)))
      publish()
    },
    error => { reportSnapshotError(error, 'firestore/keepsakes'); onError(error) },
  ))
  return () => { stopNotes(); stopKeepsakes() }
}

export async function addSharedNote(authorUid: string, text: string) {
  const normalized = text.trim()
  if (!normalized || normalized.length > 500) throw new Error('Notes must be between 1 and 500 characters.')
  await writeSharedContent('note', 'homes/shared/notes', { authorUid, text: normalized, createdAt: serverTimestamp() })
}

export async function addKeepsake(authorUid: string, title: string, description: string) {
  const normalizedTitle = title.trim()
  const normalizedDescription = description.trim()
  if (!normalizedTitle || normalizedTitle.length > 60 || !normalizedDescription || normalizedDescription.length > 300) {
    throw new Error('Add a title up to 60 characters and a description up to 300 characters.')
  }
  await writeSharedContent('keepsake', 'homes/shared/keepsakes', {
    authorUid, title: normalizedTitle, description: normalizedDescription, createdAt: serverTimestamp(),
  })
}

export async function editSharedNote(id: string, authorUid: string, text: string) {
  const normalized = text.trim()
  if (!normalized || normalized.length > 500) throw new Error('Notes must be between 1 and 500 characters.')
  if (firebaseAuth?.currentUser?.uid !== authorUid) throw new Error('Only the creator can edit this note.')
  await trackWrite('firestore/note-edit', updateDoc(doc(db(), 'homes/shared/notes', id), {
    text: normalized, updatedAt: serverTimestamp(),
  }))
}

export async function deleteSharedNote(id: string, authorUid: string) {
  if (firebaseAuth?.currentUser?.uid !== authorUid) throw new Error('Only the creator can delete this note.')
  await trackWrite('firestore/note-delete', deleteDoc(doc(db(), 'homes/shared/notes', id)))
}

export async function editKeepsake(id: string, authorUid: string, title: string, description: string) {
  const normalizedTitle = title.trim()
  const normalizedDescription = description.trim()
  if (!normalizedTitle || normalizedTitle.length > 60 || !normalizedDescription || normalizedDescription.length > 300) {
    throw new Error('Add a title up to 60 characters and a description up to 300 characters.')
  }
  if (firebaseAuth?.currentUser?.uid !== authorUid) throw new Error('Only the creator can edit this keepsake.')
  await trackWrite('firestore/keepsake-edit', updateDoc(doc(db(), 'homes/shared/keepsakes', id), {
    title: normalizedTitle, description: normalizedDescription, updatedAt: serverTimestamp(),
  }))
}

export async function deleteKeepsake(id: string, authorUid: string) {
  if (firebaseAuth?.currentUser?.uid !== authorUid) throw new Error('Only the creator can delete this keepsake.')
  await trackWrite('firestore/keepsake-delete', deleteDoc(doc(db(), 'homes/shared/keepsakes', id)))
}

export function watchGarden(onChange: (flowers: GardenFlower[]) => void, onError: (error: Error) => void) {
  return trackListener(onSnapshot(
    query(collection(db(), 'gardens/shared/flowers'), orderBy('createdAt', 'desc'), limit(LIST_LIMIT)),
    { includeMetadataChanges: true },
    snapshot => onChange(byNewest(snapshot.docs.map(document => ({
      id: document.id,
      ...document.data(),
      hasPendingWrites: document.metadata.hasPendingWrites,
    } as GardenFlower)))),
    error => { reportSnapshotError(error, 'firestore/flowers'); onError(error) },
  ))
}

export async function plantFlower(authorUid: string, title: string, memory: string, flowerType: FlowerType) {
  const normalizedTitle = title.trim()
  const normalizedMemory = memory.trim()
  if (!normalizedTitle || normalizedTitle.length > 60 || !normalizedMemory || normalizedMemory.length > 300) {
    throw new Error('Add a title up to 60 characters and a memory up to 300 characters.')
  }
  await writeSharedContent('flower', 'gardens/shared/flowers', {
    authorUid, title: normalizedTitle, memory: normalizedMemory, flowerType, createdAt: serverTimestamp(),
  })
}

export async function editFlower(id: string, authorUid: string, title: string, memory: string) {
  const normalizedTitle = title.trim()
  const normalizedMemory = memory.trim()
  if (!normalizedTitle || normalizedTitle.length > 60 || !normalizedMemory || normalizedMemory.length > 300) {
    throw new Error('Add a title up to 60 characters and a memory up to 300 characters.')
  }
  if (firebaseAuth?.currentUser?.uid !== authorUid) throw new Error('Only the creator can edit this memory.')
  await trackWrite('firestore/flower-edit', updateDoc(doc(db(), 'gardens/shared/flowers', id), {
    title: normalizedTitle, memory: normalizedMemory, updatedAt: serverTimestamp(),
  }))
}

export async function deleteFlower(id: string, authorUid: string) {
  if (firebaseAuth?.currentUser?.uid !== authorUid) throw new Error('Only the creator can delete this memory.')
  await trackWrite('firestore/flower-delete', deleteDoc(doc(db(), 'gardens/shared/flowers', id)))
}

export async function loadMembers() {
  const members = await getDocs(query(collection(db(), 'members'), where('active', '==', true), limit(2)))
  return members.docs.map(document => ({ uid: document.id }))
}

export function watchLetters(uid: string, onChange: (letters: Letter[]) => void, onError: (error: Error) => void) {
  const database = db()
  let sent: Letter[] = []
  let received: Letter[] = []
  const publish = () => {
    const unique = new Map<string, Letter>()
    for (const letter of [...sent, ...received]) unique.set(letter.id, letter)
    onChange(byNewest([...unique.values()]))
  }
  const stopSent = trackListener(onSnapshot(
    query(collection(database, 'letters'), where('senderUid', '==', uid), orderBy('createdAt', 'desc'), limit(LIST_LIMIT)),
    snapshot => { sent = snapshot.docs.map(document => ({ id: document.id, ...document.data() } as Letter)); publish() },
    error => { reportSnapshotError(error, 'firestore/letters-sent'); onError(error) },
  ))
  const stopReceived = trackListener(onSnapshot(
    query(collection(database, 'letters'), where('recipientUid', '==', uid), orderBy('createdAt', 'desc'), limit(LIST_LIMIT)),
    snapshot => { received = snapshot.docs.map(document => ({ id: document.id, ...document.data() } as Letter)); publish() },
    error => { reportSnapshotError(error, 'firestore/letters-received'); onError(error) },
  ))
  return () => { stopSent(); stopReceived() }
}

export async function sendLetter(senderUid: string, recipientUid: string, title: string, text: string, releaseAt: Date | null) {
  const normalizedTitle = title.trim()
  const normalized = text.trim()
  if (!normalizedTitle || normalizedTitle.length > 80) throw new Error('Letter titles must be between 1 and 80 characters.')
  if (!normalized || normalized.length > 2000) throw new Error('Letters must be between 1 and 2,000 characters.')

  const database = db()
  const letterRef = doc(collection(database, 'letters'))
  const batch = writeBatch(database)
  batch.set(letterRef, {
    senderUid,
    recipientUid,
    createdAt: serverTimestamp(),
    releaseAt: releaseAt ? Timestamp.fromDate(releaseAt) : serverTimestamp(),
    schemaVersion: 2,
  })
  batch.set(doc(letterRef, 'private', 'body'), {
    title: normalizedTitle,
    text: normalized,
    updatedAt: serverTimestamp(),
  })
  await trackWrite('firestore/letter-create', batch.commit())
}

export async function loadLetterBody(letterId: string): Promise<LetterBody> {
  const snapshot = await getDoc(doc(db(), 'letters', letterId, 'private', 'body'))
  if (!snapshot.exists()) throw new Error('The letter body is unavailable. Try again later.')
  const data = snapshot.data()
  if (typeof data.title !== 'string' || typeof data.text !== 'string') {
    throw new Error('The letter body could not be read. Ask the project owner to check the mailbox setup.')
  }
  return { title: data.title, text: data.text }
}

export async function markLetterOpened(letter: Letter) {
  const updates = letter.schemaVersion === 2
    ? { openedAt: serverTimestamp() }
    : { opened: true, openedAt: serverTimestamp() }
  await trackWrite('firestore/letter-open', updateDoc(doc(db(), 'letters', letter.id), updates))
}

export async function upgradeLegacyLetter(letter: Letter) {
  if (letter.schemaVersion === 2 || !letter.text || letter.opened || letter.openedAt) {
    throw new Error('Only unopened legacy letters can be upgraded by their sender.')
  }

  const database = db()
  const letterRef = doc(database, 'letters', letter.id)
  const batch = writeBatch(database)
  batch.update(letterRef, {
    text: deleteField(),
    opened: deleteField(),
    openedAt: deleteField(),
    releaseAt: serverTimestamp(),
    schemaVersion: 2,
  })
  batch.set(doc(letterRef, 'private', 'body'), {
    title: 'Letter',
    text: letter.text,
    updatedAt: serverTimestamp(),
  })
  await trackWrite('firestore/letter-legacy-upgrade', batch.commit())
}
