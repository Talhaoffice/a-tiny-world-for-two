import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  writeBatch,
  limit,
  type Timestamp,
} from 'firebase/firestore'
import { firebaseAuth, firestore } from '../../lib/firebase'
import { logError, logEvent } from '../../lib/logger'
import { trackListener, trackWrite } from '../../lib/diagnostics'

export const PHOTO_CAPTION_MAX = 140
export const THUMB_BASE64_MAX = 24_000
export const FULL_BASE64_MAX = 400_000
export const PHOTO_FILE_MAX_BYTES = 15 * 1024 * 1024 // 15 MB
export const GALLERY_LIST_LIMIT = 60
export const GALLERY_SOFT_CAP = 100

export const PHOTO_MIME = 'image/jpeg' as const

export const SCHEMA_VERSION = 1 as const

export type PhotoMeta = {
  id: string
  authorUid: string
  caption: string
  takenOn: string | null
  createdAt: Timestamp
  width: number
  height: number
  /** base64 JPEG body WITHOUT the data:image/jpeg;base64, prefix */
  thumb: string
  mime: typeof PHOTO_MIME
  schemaVersion: typeof SCHEMA_VERSION
  hasPendingWrites: boolean
}

export type PhotoFull = {
  image: string // base64 JPEG body, no prefix
  width: number
  height: number
}

const db = () => {
  if (!firestore) throw new Error('Cloud Firestore is not configured for this app.')
  return firestore
}

const PARENT_COLLECTION = 'gallery/shared/photos'

function parentRef(photoId: string) {
  return doc(collection(db(), PARENT_COLLECTION), photoId)
}

function fullRef(photoId: string) {
  return doc(db(), `gallery/shared/photos/${photoId}/full/main`)
}

/** Live list of photo metadata (thumbnails only), ordered newest-first. */
export function watchPhotos(
  onChange: (photos: PhotoMeta[]) => void,
  onError: (error: Error) => void,
) {
  const database = db()
  const q = query(
    collection(database, PARENT_COLLECTION),
    orderBy('createdAt', 'desc'),
    limit(GALLERY_LIST_LIMIT),
  )
  return trackListener(
    onSnapshot(
      q,
      { includeMetadataChanges: true },
      snapshot => {
        logEvent('info', 'firestore/gallery', 'snapshot', { count: snapshot.docs.length })
        const photos: PhotoMeta[] = snapshot.docs.map(d => ({
          id: d.id,
          ...(d.data() as Omit<PhotoMeta, 'id' | 'hasPendingWrites'>),
          hasPendingWrites: d.metadata.hasPendingWrites,
        }))
        onChange(photos)
      },
      error => {
        logError(error, 'firestore/gallery-snapshot')
        onError(error)
      },
    ),
  )
}

/** One-shot load of the full-size image for a single photo. */
export async function loadPhotoFull(photoId: string): Promise<PhotoFull | null> {
  const snap = await getDoc(fullRef(photoId))
  if (!snap.exists()) return null
  return snap.data() as PhotoFull
}

/** Create parent + full doc atomically in a batch. */
export async function addPhoto(opts: {
  caption: string
  takenOn: string | null
  width: number
  height: number
  thumb: string // base64 body, no prefix
  fullImage: string // base64 body, no prefix
  fullWidth: number
  fullHeight: number
}): Promise<string> {
  const uid = firebaseAuth?.currentUser?.uid
  if (!uid) throw new Error('Sign in again before saving a photo.')
  if (opts.caption.length > PHOTO_CAPTION_MAX) throw new Error(`Caption must be ${PHOTO_CAPTION_MAX} characters or less.`)
  if (opts.thumb.length > THUMB_BASE64_MAX) throw new Error('Thumbnail is too large to store.')
  if (opts.fullImage.length > FULL_BASE64_MAX) throw new Error('Photo is too large to store even after compression.')

  const database = db()
  const photoId = doc(collection(database, PARENT_COLLECTION)).id
  logEvent('info', 'firestore/gallery', 'client-id-created', { photoId })

  const batch = writeBatch(database)
  batch.set(parentRef(photoId), {
    authorUid: uid,
    caption: opts.caption,
    takenOn: opts.takenOn,
    createdAt: serverTimestamp(),
    width: opts.width,
    height: opts.height,
    thumb: opts.thumb,
    mime: PHOTO_MIME,
    schemaVersion: SCHEMA_VERSION,
  })
  batch.set(fullRef(photoId), {
    image: opts.fullImage,
    width: opts.fullWidth,
    height: opts.fullHeight,
  })

  await trackWrite('firestore/gallery-add', batch.commit())
  return photoId
}

/** Update caption only (creator only). */
export async function updatePhotoCaption(photoId: string, caption: string): Promise<void> {
  const uid = firebaseAuth?.currentUser?.uid
  if (!uid) throw new Error('Sign in again before editing a photo.')
  if (caption.length > PHOTO_CAPTION_MAX) throw new Error(`Caption must be ${PHOTO_CAPTION_MAX} characters or less.`)
  await trackWrite('firestore/gallery-caption', updateDoc(parentRef(photoId), {
    caption,
    updatedAt: serverTimestamp(),
  }))
}

/** Delete parent + full doc atomically (creator only). */
export async function deletePhoto(photoId: string): Promise<void> {
  const uid = firebaseAuth?.currentUser?.uid
  if (!uid) throw new Error('Sign in again before deleting a photo.')
  const database = db()
  const batch = writeBatch(database)
  batch.delete(parentRef(photoId))
  batch.delete(fullRef(photoId))
  await trackWrite('firestore/gallery-delete', batch.commit())
}
