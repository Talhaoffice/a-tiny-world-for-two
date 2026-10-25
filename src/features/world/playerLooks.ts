/**
 * Firestore persistence for the extended PlayerLook in playerLooks/{uid}.
 * This is separate from playerProfiles which stays owner-only and private.
 *
 * playerLooks is:
 *   - readable by both active members (for live remote look updates)
 *   - writable only by the owner (strict field and range allowlists in rules)
 */
import {
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore'
import { firebaseAuth, firestore } from '../../lib/firebase'
import { trackListener, trackWrite } from '../../lib/diagnostics'
import { logError, logEvent } from '../../lib/logger'
import {
  isPlayerLook,
  migrateOldAppearance,
  TALHA_DEFAULT_LOOK,
  MANNU_DEFAULT_LOOK,
  type PlayerLook,
} from './appearanceCatalog'
import type { CharacterId } from './characters.config'

const db = () => {
  if (!firestore) throw new Error('Cloud Firestore is not configured for this app.')
  return firestore
}

/** Load the look for a given UID, migrating from old appearance if needed. */
export async function loadPlayerLook(
  uid: string,
  characterId: CharacterId,
  oldAppearance?: { hair?: unknown; outfit?: unknown; accessory?: unknown },
): Promise<Omit<PlayerLook, 'updatedAt'>> {
  const defaults = characterId === 'talha' ? TALHA_DEFAULT_LOOK : MANNU_DEFAULT_LOOK
  try {
    const snap = await getDoc(doc(db(), 'playerLooks', uid))
    if (snap.exists()) {
      const data = snap.data() as Record<string, unknown>
      if (isPlayerLook(data)) return data
    }
  } catch (err) {
    logError(err, 'firestore/player-look-load')
  }
  // Fall through: migrate from old appearance if available
  if (oldAppearance) return migrateOldAppearance(oldAppearance, defaults)
  return defaults
}

/** Save the player's look to playerLooks/{uid}. Owner-only write. */
export async function savePlayerLook(
  uid: string,
  look: Omit<PlayerLook, 'updatedAt'>,
): Promise<void> {
  const currentUid = firebaseAuth?.currentUser?.uid
  if (!currentUid || currentUid !== uid) throw new Error('Sign in again before saving your look.')
  if (!isPlayerLook(look)) throw new Error('The selected appearance is not valid.')
  const payload: PlayerLook = { ...look, updatedAt: serverTimestamp() }
  await trackWrite('firestore/player-look-save', setDoc(doc(db(), 'playerLooks', uid), payload))
  logEvent('info', 'firestore/player-look-save', 'saved')
}

/** Subscribe to the remote player's look (one doc, cleanup on unmount). */
export function watchRemotePlayerLook(
  uid: string,
  onChange: (look: Omit<PlayerLook, 'updatedAt'> | null) => void,
  onError: (err: Error) => void,
): () => void {
  return trackListener(
    onSnapshot(
      doc(db(), 'playerLooks', uid),
      snap => {
        if (!snap.exists()) { onChange(null); return }
        const data = snap.data() as Record<string, unknown>
        onChange(isPlayerLook(data) ? data : null)
      },
      err => {
        logError(err, 'firestore/remote-look-watch')
        onError(err)
      },
    ),
  )
}
