/**
 * Temporary in-memory store for the pet editor.
 *
 * Claude's rules/sync task should replace this adapter with the secured
 * `world/pets` document described in COLLAB.md. This stub makes the UI usable
 * without introducing an unapproved Firestore path.
 */
export type PetKind = 'none' | 'cat' | 'fox'

export type PetDraft = {
  kind: PetKind
  name: string
}

const petDrafts = new Map<string, PetDraft>()

export function loadPetDraft(uid: string): PetDraft {
  const saved = petDrafts.get(uid)
  return saved ? { ...saved } : { kind: 'none', name: '' }
}

export function savePetDraft(uid: string, draft: PetDraft): PetDraft {
  const saved = { kind: draft.kind, name: draft.name.trim().slice(0, 32) }
  petDrafts.set(uid, saved)
  return { ...saved }
}
