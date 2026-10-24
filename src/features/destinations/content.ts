import {
  addDoc,
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  type Timestamp,
} from 'firebase/firestore'
import { firebaseAuth, firestore } from '../../lib/firebase'

export type SavedNote = { id: string; authorUid: string; text: string; createdAt: Timestamp; hasPendingWrites: boolean }
export type Keepsake = { id: string; authorUid: string; title: string; description: string; createdAt: Timestamp; hasPendingWrites: boolean }
export type GardenFlower = { id: string; authorUid: string; title: string; memory: string; flowerType: FlowerType; createdAt: Timestamp }
export type Letter = { id: string; senderUid: string; recipientUid: string; text: string; createdAt: Timestamp; opened: boolean; openedAt: Timestamp | null }
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

export async function sendLetter(senderUid: string, recipientUid: string, text: string) {
  const normalized = text.trim()
  if (!normalized || normalized.length > 2000) throw new Error('Letters must be between 1 and 2,000 characters.')
  await addDoc(collection(db(), 'letters'), {
    senderUid, recipientUid, text: normalized, createdAt: serverTimestamp(), opened: false, openedAt: null,
  })
}

export async function markLetterOpened(letterId: string) {
  await updateDoc(doc(db(), 'letters', letterId), { opened: true, openedAt: serverTimestamp() })
}
