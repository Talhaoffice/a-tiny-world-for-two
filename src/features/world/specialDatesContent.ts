import { doc, getDocFromServer, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore'
import { firebaseAuth, firestore } from '../../lib/firebase'
import { logError } from '../../lib/logger'
import { trackListener, trackWrite } from '../../lib/diagnostics'
import { EMPTY_ANNUAL_SPECIAL_DATES, isValidAnnualDate, type AnnualSpecialDates } from './annualSpecialDates'

const DATE_FIELDS: Array<keyof AnnualSpecialDates> = ['dateOne', 'dateTwo', 'dateThree', 'dateFour', 'dateFive']

function setupError(message: string) {
  return Object.assign(new Error(message), { code: 'failed-precondition' })
}

function parseSpecialDates(value: Record<string, unknown>): AnnualSpecialDates {
  const dates = Object.fromEntries(DATE_FIELDS.map(field => [field, value[field] ?? null]))
  if (!('updatedAt' in value) || DATE_FIELDS.some(field => !(field in value))
    || Object.keys(value).some(key => ![...DATE_FIELDS, 'updatedAt'].includes(key as keyof AnnualSpecialDates | 'updatedAt'))
    || DATE_FIELDS.some(field => dates[field] !== null && !isValidAnnualDate(dates[field]))) {
    throw setupError('The shared special dates could not be read.')
  }
  return dates as AnnualSpecialDates
}

function isValidSpecialDates(dates: AnnualSpecialDates) {
  return Object.keys(dates).length === DATE_FIELDS.length
    && DATE_FIELDS.every(field => dates[field] === null || isValidAnnualDate(dates[field]))
}

export async function loadAnnualSpecialDates() {
  if (!firestore) return EMPTY_ANNUAL_SPECIAL_DATES
  const snapshot = await getDocFromServer(doc(firestore, 'content', 'specialDates'))
  return snapshot.exists() ? parseSpecialDates(snapshot.data()) : EMPTY_ANNUAL_SPECIAL_DATES
}

export function watchAnnualSpecialDates(onChange: (dates: AnnualSpecialDates) => void, onError: (error: unknown) => void) {
  if (!firestore) {
    onError(new Error('Cloud Firestore is not configured for this app.'))
    return () => {}
  }
  return trackListener(onSnapshot(doc(firestore, 'content', 'specialDates'), snapshot => {
    try {
      onChange(snapshot.exists() ? parseSpecialDates(snapshot.data()) : EMPTY_ANNUAL_SPECIAL_DATES)
    } catch (error) {
      logError(error, 'firestore/special-dates-read')
      onError(error)
    }
  }, error => {
    logError(error, 'firestore/special-dates-listener')
    onError(error)
  }))
}

export async function saveAnnualSpecialDates(uid: string, talhaUid: string, dates: AnnualSpecialDates) {
  if (firebaseAuth?.currentUser?.uid !== uid) throw new Error('Sign in again before changing these dates.')
  if (uid !== talhaUid) throw new Error('Only the assigned owner can change these dates.')
  if (!firestore) throw new Error('Cloud Firestore is not configured for this app.')
  if (!isValidSpecialDates(dates) || new Set(Object.values(dates).filter(Boolean)).size !== Object.values(dates).filter(Boolean).length) {
    throw new Error('Enter up to five different month-and-day values, such as 06-15.')
  }
  await trackWrite('firestore/special-dates-save', setDoc(doc(firestore, 'content', 'specialDates'), {
    ...dates,
    updatedAt: serverTimestamp(),
  }))
}
