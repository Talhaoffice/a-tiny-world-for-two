/**
 * Firestore persistence for pet companion settings.
 *
 * Document: world/pets  (collection "world", document ID "pets")
 * Shape: { [uid]: { kind: PetKind; name: string; updatedAt: serverTimestamp } }
 *
 * Rules:
 *   - Both active members may read (needed for rendering each other's pet).
 *   - Each member may write only their own UID key.
 *   - Extra fields or wrong kinds are denied by the Firestore rule.
 *
 * This module replaces petStoreStub.ts; import from here everywhere.
 */

import {
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore'
import { firebaseAuth, firestore } from '../../lib/firebase'
import { trackListener, trackWrite } from '../../lib/diagnostics'
import { logError, logEvent, recordBootStep } from '../../lib/logger'
import { toAppError } from '../../lib/errors'

// ─── Types ────────────────────────────────────────────────────────────────────

export type PetKind = 'none' | 'cat' | 'fox'

/** The shape stored per-UID inside the world/pets document. */
export type PetRecord = {
  kind: PetKind
  name: string
  // updatedAt is a Firestore server timestamp — present after a round-trip
}

/** Draft used in UI state (no updatedAt needed). */
export type PetDraft = {
  kind: PetKind
  name: string
}
export type PetLoadState = 'saved' | 'empty' | 'error'

const PET_KINDS: PetKind[] = ['none', 'cat', 'fox']
const PET_NAME_MAX = 32

// ─── Internal helpers ─────────────────────────────────────────────────────────

function db() {
  if (!firestore) throw new Error('Cloud Firestore is not configured for this app.')
  return firestore
}

function isPetKind(v: unknown): v is PetKind {
  return typeof v === 'string' && (PET_KINDS as string[]).includes(v)
}

function isPetRecord(v: unknown): v is PetRecord {
  if (typeof v !== 'object' || v === null) return false
  const r = v as Record<string, unknown>
  return isPetKind(r.kind) && typeof r.name === 'string'
}

/** Trim and clamp name to the rule-enforced limit. */
function sanitiseName(raw: string): string {
  return raw.trim().slice(0, PET_NAME_MAX)
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Load the caller's own PetDraft from Firestore.
 * Returns `{ kind: 'none', name: '' }` on miss or read error.
 */
export async function loadPetDraft(uid: string, onStatus?: (state: PetLoadState, errorCode?: string) => void): Promise<PetDraft> {
  const fallback: PetDraft = { kind: 'none', name: '' }
  recordBootStep('pets', 'started')
  let timeout = 0
  try {
    const request = getDoc(doc(db(), 'world', 'pets'))
    const timedOut = new Promise<never>((_, reject) => {
      timeout = window.setTimeout(() => reject(Object.assign(new Error('Pet read timed out.'), { code: 'deadline-exceeded' })), 5_000)
    })
    const snap = await Promise.race([request, timedOut])
    if (!snap.exists()) {
      recordBootStep('pets', 'done')
      onStatus?.('empty', '')
      return fallback
    }
    const entry = snap.data()?.[uid]
    if (!isPetRecord(entry)) {
      recordBootStep('pets', 'done')
      onStatus?.('empty', '')
      return fallback
    }
    recordBootStep('pets', 'done')
    onStatus?.('saved', '')
    return { kind: entry.kind, name: entry.name }
  } catch (err) {
    logError(err, 'firestore/pet-load')
    recordBootStep('pets', 'failed', err)
    onStatus?.('error', toAppError(err).code)
    return fallback
  } finally {
    window.clearTimeout(timeout)
  }
}

/**
 * Save the caller's pet selection to world/pets.
 * Uses updateDoc when the document already exists (preserves the partner's key),
 * and setDoc (create) otherwise.
 * Returns the sanitised draft that was written.
 */
export async function savePetDraft(
  uid: string,
  draft: PetDraft,
): Promise<PetDraft> {
  const currentUid = firebaseAuth?.currentUser?.uid
  if (!currentUid || currentUid !== uid) {
    throw new Error('Sign in again before saving your companion.')
  }
  if (!isPetKind(draft.kind)) throw new Error('Unknown pet kind.')

  const sanitised: PetDraft = { kind: draft.kind, name: sanitiseName(draft.name) }
  const payload = {
    [uid]: {
      kind: sanitised.kind,
      name: sanitised.name,
      updatedAt: serverTimestamp(),
    },
  }

  // Check whether the document exists so we can choose create vs. merge.
  const ref = doc(db(), 'world', 'pets')
  const snap = await getDoc(ref)
  if (snap.exists()) {
    await trackWrite(
      'firestore/pet-save',
      updateDoc(ref, payload),
    )
  } else {
    await trackWrite(
      'firestore/pet-save',
      setDoc(ref, payload),
    )
  }

  logEvent('info', 'firestore/pet-save', 'saved')
  return sanitised
}

/**
 * Subscribe to the world/pets document and call `onChange` whenever either
 * pet entry changes.  Returns an unsubscribe function (cleanup on unmount).
 * Only the entry for `remoteUid` is passed to `onRemoteChange`; the local
 * entry is already held in component state.
 */
export function watchRemotePet(
  remoteUid: string,
  onRemoteChange: (pet: PetDraft | null) => void,
  onError: (err: Error) => void,
): () => void {
  return trackListener(
    onSnapshot(
      doc(db(), 'world', 'pets'),
      snap => {
        if (!snap.exists()) { onRemoteChange(null); return }
        const entry = snap.data()?.[remoteUid]
        if (!isPetRecord(entry)) { onRemoteChange(null); return }
        onRemoteChange({ kind: entry.kind, name: entry.name })
      },
      err => {
        logError(err, 'firestore/remote-pet-watch')
        onError(err)
      },
    ),
  )
}
