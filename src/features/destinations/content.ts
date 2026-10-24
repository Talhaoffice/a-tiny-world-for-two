import {
  addDoc,
  collection,
  deleteField,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore'
import { firebaseAuth, firestore } from '../../lib/firebase'

export type SavedNote = { id: string; authorUid: string; text: string; createdAt: Timestamp; hasPendingWrites: boolean }
export type Keepsake = { id: string; authorUid: string; title: string; description: string; createdAt: Timestamp; hasPendingWrites: boolean }
export type GardenFlower = { id: string; authorUid: string; title: string; memory: string; flowerType: FlowerType; createdAt: Timestamp }
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

function reportSnapshotError(error: { code?: string; message: string }) {
  console.error('[firestore] snapshot listener failed', { code: error.code ?? 'unknown', message: error.message })
}

async function writeSharedContent(operation: 'note' | 'keepsake', path: string, data: Record<string, unknown>) {
  const authorUid = typeof data.authorUid === 'string' ? data.authorUid : ''
  console.info(`[firestore] ${operation} write started`, {
    firestoreInitialized: Boolean(firestore),
    authUidPresent: Boolean(firebaseAuth?.currentUser?.uid),
    authorMatchesAuth: Boolean(authorUid) && authorUid === firebaseAuth?.currentUser?.uid,
  })
  try {
    await addDoc(collection(db(), path), data)
    console.info(`[firestore] ${operation} write succeeded`)
  } catch (reason) {
    const code = reason && typeof reason === 'object' && 'code' in reason && typeof reason.code === 'string'
      ? reason.code
      : 'unknown'
    const message = reason instanceof Error ? reason.message : 'Unknown Firestore write error.'
    console.error(`[firestore] ${operation} write failed`, { code, message })
    throw reason
  }
}

export function watchHomeContent(
  onChange: (content: { notes: SavedNote[]; keepsakes: Keepsake[] }) => void,
  onError: (error: Error) => void,
) {
  const database = db()
  let notes: SavedNote[] = []
  let keepsakes: Keepsake[] = []
  const publish = () => onChange({ notes, keepsakes })
  const stopNotes = onSnapshot(
    query(collection(database, 'homes/shared/notes'), orderBy('createdAt', 'desc'), limit(LIST_LIMIT)),
    { includeMetadataChanges: true },
    snapshot => {
      console.info('[firestore] notes listener snapshot', {
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
    error => { reportSnapshotError(error); onError(error) },
  )
  const stopKeepsakes = onSnapshot(
    query(collection(database, 'homes/shared/keepsakes'), orderBy('createdAt', 'desc'), limit(LIST_LIMIT)),
    { includeMetadataChanges: true },
    snapshot => {
      console.info('[firestore] keepsakes listener snapshot', {
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
    error => { reportSnapshotError(error); onError(error) },
  )
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

export function watchGarden(onChange: (flowers: GardenFlower[]) => void, onError: (error: Error) => void) {
  return onSnapshot(
    query(collection(db(), 'gardens/shared/flowers'), orderBy('createdAt', 'desc'), limit(LIST_LIMIT)),
    snapshot => onChange(byNewest(snapshot.docs.map(document => ({ id: document.id, ...document.data() } as GardenFlower)))),
    error => { reportSnapshotError(error); onError(error) },
  )
}

export async function plantFlower(authorUid: string, title: string, memory: string, flowerType: FlowerType) {
  const normalizedTitle = title.trim()
  const normalizedMemory = memory.trim()
  if (!normalizedTitle || normalizedTitle.length > 60 || !normalizedMemory || normalizedMemory.length > 300) {
    throw new Error('Add a title up to 60 characters and a memory up to 300 characters.')
  }
  await addDoc(collection(db(), 'gardens/shared/flowers'), {
    authorUid, title: normalizedTitle, memory: normalizedMemory, flowerType, createdAt: serverTimestamp(),
  })
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
  const stopSent = onSnapshot(
    query(collection(database, 'letters'), where('senderUid', '==', uid), orderBy('createdAt', 'desc'), limit(LIST_LIMIT)),
    snapshot => { sent = snapshot.docs.map(document => ({ id: document.id, ...document.data() } as Letter)); publish() },
    error => { reportSnapshotError(error); onError(error) },
  )
  const stopReceived = onSnapshot(
    query(collection(database, 'letters'), where('recipientUid', '==', uid), orderBy('createdAt', 'desc'), limit(LIST_LIMIT)),
    snapshot => { received = snapshot.docs.map(document => ({ id: document.id, ...document.data() } as Letter)); publish() },
    error => { reportSnapshotError(error); onError(error) },
  )
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
  await batch.commit()
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
  await updateDoc(doc(db(), 'letters', letter.id), updates)
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
  await batch.commit()
}
