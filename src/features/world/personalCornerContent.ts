import { doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore'
import { firebaseAuth, firestore } from '../../lib/firebase'
import { logError } from '../../lib/logger'
import { trackListener, trackWrite } from '../../lib/diagnostics'

export type LanternCornerState = {
  postLanternLit: boolean
  workshopLanternLit: boolean
  decoration: 'none' | 'wind-chime' | 'flower-box'
}

export type GreenhouseCornerState = {
  plotOneWatered: boolean
  plotTwoWatered: boolean
  decoration: 'none' | 'herb-shelf' | 'plant-stand'
}

export type PersonalCornerState = {
  lantern: LanternCornerState
  greenhouse: GreenhouseCornerState
}

export const emptyLanternCorner: LanternCornerState = {
  postLanternLit: false,
  workshopLanternLit: false,
  decoration: 'none',
}

export const emptyGreenhouseCorner: GreenhouseCornerState = {
  plotOneWatered: false,
  plotTwoWatered: false,
  decoration: 'none',
}

const emptyCorners: PersonalCornerState = {
  lantern: emptyLanternCorner,
  greenhouse: emptyGreenhouseCorner,
}

function setupError(message: string) {
  return Object.assign(new Error(message), { code: 'failed-precondition' })
}

function readLanternCorner(value: Record<string, unknown>, ownerUid: string): LanternCornerState {
  if (value.ownerUid !== ownerUid || value.cornerId !== 'lantern-post'
    || typeof value.postLanternLit !== 'boolean' || typeof value.workshopLanternLit !== 'boolean'
    || !['none', 'wind-chime', 'flower-box'].includes(String(value.decoration))) {
    throw setupError('The lantern corner settings could not be read.')
  }
  return {
    postLanternLit: value.postLanternLit,
    workshopLanternLit: value.workshopLanternLit,
    decoration: value.decoration as LanternCornerState['decoration'],
  }
}

function readGreenhouseCorner(value: Record<string, unknown>, ownerUid: string): GreenhouseCornerState {
  if (value.ownerUid !== ownerUid || value.cornerId !== 'greenhouse'
    || typeof value.plotOneWatered !== 'boolean' || typeof value.plotTwoWatered !== 'boolean'
    || !['none', 'herb-shelf', 'plant-stand'].includes(String(value.decoration))) {
    throw setupError('The greenhouse settings could not be read.')
  }
  return {
    plotOneWatered: value.plotOneWatered,
    plotTwoWatered: value.plotTwoWatered,
    decoration: value.decoration as GreenhouseCornerState['decoration'],
  }
}

export function watchPersonalCorners(
  talhaUid: string,
  mannuUid: string,
  onChange: (state: PersonalCornerState) => void,
  onError: (error: unknown) => void,
) {
  if (!firestore) {
    const error = new Error('Cloud Firestore is not configured for this app.')
    onError(error)
    return () => {}
  }

  let state = { ...emptyCorners }
  let stopLantern = () => {}
  let stopGreenhouse = () => {}
  const fail = (error: unknown, operation: string) => {
    logError(error, operation)
    onError(error)
  }
  try {
    stopLantern = trackListener(onSnapshot(doc(firestore, 'playerCorners', talhaUid), snapshot => {
      try {
        state = {
          ...state,
          lantern: snapshot.exists() ? readLanternCorner(snapshot.data(), talhaUid) : emptyLanternCorner,
        }
        onChange(state)
      } catch (error) {
        fail(error, 'firestore/lantern-corner-read')
      }
    }, error => fail(error, 'firestore/lantern-corner-listener')))
    stopGreenhouse = trackListener(onSnapshot(doc(firestore, 'playerCorners', mannuUid), snapshot => {
      try {
        state = {
          ...state,
          greenhouse: snapshot.exists() ? readGreenhouseCorner(snapshot.data(), mannuUid) : emptyGreenhouseCorner,
        }
        onChange(state)
      } catch (error) {
        fail(error, 'firestore/greenhouse-corner-read')
      }
    }, error => fail(error, 'firestore/greenhouse-corner-listener')))
  } catch (error) {
    stopLantern()
    stopGreenhouse()
    fail(error, 'firestore/personal-corners-watch')
    return () => {}
  }

  return () => {
    stopLantern()
    stopGreenhouse()
  }
}

export async function saveLanternCorner(uid: string, talhaUid: string, state: LanternCornerState) {
  if (firebaseAuth?.currentUser?.uid !== uid) throw new Error('Sign in again before changing this corner.')
  if (uid !== talhaUid) throw new Error('Only this corner’s owner can change it.')
  if (!firestore) throw new Error('Cloud Firestore is not configured for this app.')
  if (typeof state.postLanternLit !== 'boolean' || typeof state.workshopLanternLit !== 'boolean'
    || !['none', 'wind-chime', 'flower-box'].includes(state.decoration)) {
    throw new Error('Choose valid lantern corner settings.')
  }
  await trackWrite('firestore/lantern-corner-save', setDoc(doc(firestore, 'playerCorners', uid), {
    ownerUid: uid,
    cornerId: 'lantern-post',
    ...state,
    updatedAt: serverTimestamp(),
  }))
}

export async function saveGreenhouseCorner(uid: string, mannuUid: string, state: GreenhouseCornerState) {
  if (firebaseAuth?.currentUser?.uid !== uid) throw new Error('Sign in again before changing this corner.')
  if (uid !== mannuUid) throw new Error('Only this corner’s owner can change it.')
  if (!firestore) throw new Error('Cloud Firestore is not configured for this app.')
  if (typeof state.plotOneWatered !== 'boolean' || typeof state.plotTwoWatered !== 'boolean'
    || !['none', 'herb-shelf', 'plant-stand'].includes(state.decoration)) {
    throw new Error('Choose valid greenhouse settings.')
  }
  await trackWrite('firestore/greenhouse-corner-save', setDoc(doc(firestore, 'playerCorners', uid), {
    ownerUid: uid,
    cornerId: 'greenhouse',
    ...state,
    updatedAt: serverTimestamp(),
  }))
}
