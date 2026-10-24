import {
  collection,
  doc,
  getDocFromServer,
  getDocsFromServer,
  limit,
  query,
  runTransaction,
  updateDoc,
  where,
} from 'firebase/firestore'
import { firebaseAuth, firestore } from '../../lib/firebase'
import { trackWrite } from '../../lib/diagnostics'
import { characters, isCharacterAppearance, resolveCharacterIds, type CharacterAppearance, type CharacterConfig } from './characters.config'

export type ResolvedCharacter = { config: CharacterConfig; appearance: CharacterAppearance }
export type CharacterRoster = { local: ResolvedCharacter; remote: ResolvedCharacter; remoteUid: string }

function setupError(message: string) {
  return Object.assign(new Error(message), { code: 'failed-precondition' })
}

async function readOrCreateAppearance(uid: string, fallback: CharacterAppearance): Promise<CharacterAppearance> {
  if (!firestore) throw new Error('Cloud Firestore is not configured for this app.')
  const profileRef = doc(firestore, 'playerProfiles', uid)
  const profile = await getDocFromServer(profileRef)
  if (profile.exists()) {
    const appearance = profile.data().appearance
    if (!isCharacterAppearance(appearance)) throw setupError('Player appearance settings are invalid.')
    return appearance
  }

  return trackWrite('firestore/player-profile-create', runTransaction(firestore, async transaction => {
    const latestProfile = await transaction.get(profileRef)
    if (latestProfile.exists()) {
      const latestAppearance = latestProfile.data().appearance
      if (!isCharacterAppearance(latestAppearance)) throw setupError('Player appearance settings are invalid.')
      return latestAppearance
    }
    transaction.set(profileRef, { appearance: fallback })
    return fallback
  }))
}

export async function saveCharacterAppearance(uid: string, appearance: CharacterAppearance) {
  if (firebaseAuth?.currentUser?.uid !== uid) throw new Error('Sign in again before changing this appearance.')
  if (!isCharacterAppearance(appearance)) throw new Error('Choose a valid character appearance.')
  if (!firestore) throw new Error('Cloud Firestore is not configured for this app.')
  await trackWrite('firestore/player-profile-update', updateDoc(doc(firestore, 'playerProfiles', uid), { appearance }))
}

export async function loadCharacterRoster(uid: string): Promise<CharacterRoster> {
  if (firebaseAuth?.currentUser?.uid !== uid) throw Object.assign(new Error('Your sign-in changed while loading the island.'), { code: 'unauthenticated' })
  if (!firestore) throw new Error('Cloud Firestore is not configured for this app.')

  const [memberSnapshot, worldSnapshot] = await Promise.all([
    getDocsFromServer(query(collection(firestore, 'members'), where('active', '==', true), limit(3))),
    getDocFromServer(doc(firestore, 'world', 'main')),
  ])
  const memberUids = memberSnapshot.docs.map(member => member.id)
  const world = worldSnapshot.data()
  const talhaUid = world?.talhaUid
  const mannuUid = world?.mannuUid

  if (memberUids.length !== 2 || !memberUids.includes(uid)) {
    throw setupError('The island needs exactly two active member records.')
  }
  if (typeof talhaUid !== 'string' || typeof mannuUid !== 'string') {
    throw setupError('The island character mapping needs both active member records.')
  }

  const resolved = resolveCharacterIds(uid, memberUids, talhaUid, mannuUid)
  if (!resolved) throw setupError('This account is not assigned to a character on the island.')
  const localConfig = characters[resolved.localId]
  const localAppearance = await readOrCreateAppearance(uid, localConfig.defaultAppearance)

  return {
    local: { config: localConfig, appearance: localAppearance },
    remote: { config: characters[resolved.remoteId], appearance: characters[resolved.remoteId].defaultAppearance },
    remoteUid: resolved.remoteUid,
  }
}
