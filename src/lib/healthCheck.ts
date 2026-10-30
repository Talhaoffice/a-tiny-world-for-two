import { onValue, ref, type DatabaseReference } from 'firebase/database'
import {
  collection,
  doc,
  getDocFromServer,
  getDocsFromServer,
  limit,
  orderBy,
  query,
  where,
} from 'firebase/firestore'
import { firebaseAuth, firestore, realtimeDatabase } from './firebase'
import { logEvent, logError } from './logger'
import { trackListener } from './diagnostics'

type ProbeState = 'success' | 'missing' | 'permission-denied' | 'unavailable' | 'failed-precondition' | 'error' | 'timeout' | 'skipped'
type ProbeResult = { state: ProbeState; indexHint?: string }
type FirestorePathState = 'allowed' | Exclude<ProbeState, 'success'>
type FirestorePathProbe = {
  name: string
  path: string
  operation: 'get' | 'list/query'
  state: FirestorePathState
  documents?: number
}

export type HealthReport = {
  checkedAt: string
  auth: { userPresent: boolean; token: 'success' | 'failure' | 'skipped' }
  firestoreMember: ProbeResult
  realtime: {
    connected: boolean | null
    connectionState: ProbeState
    serverTimeOffset: number | null
    offsetState: ProbeState
  }
  queries: Array<{ name: string; state: ProbeState; indexHint?: string }>
  setupPaths: FirestorePathProbe[]
  online: boolean
}

let lastReport: HealthReport | undefined
const timeoutMs = 10_000

function readErrorCode(error: unknown) {
  return error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
    ? error.code.toLowerCase().replace(/^(firestore|database|auth)\//, '')
    : 'unknown'
}

type FailedProbeState = Exclude<ProbeState, 'success'>

function stateForError(error: unknown): FailedProbeState {
  const code = readErrorCode(error)
  if (code === 'permission-denied') return 'permission-denied'
  if (code === 'unavailable' || code === 'network-request-failed') return 'unavailable'
  if (code === 'failed-precondition') return 'failed-precondition'
  return 'error'
}

function pathStateForProbe(state: ProbeState): FirestorePathState {
  return state === 'success' ? 'allowed' : state
}

async function documentPathProbe(
  name: string,
  path: string,
  request: Promise<{ exists(): boolean }>,
): Promise<FirestorePathProbe> {
  const result = await timed(request)
  if (result.state === 'success') {
    return { name, path, operation: 'get', state: result.value.exists() ? 'allowed' : 'missing' }
  }
  if (result.state === 'error') logError(result.error, `health/${name}`)
  return { name, path, operation: 'get', state: result.state }
}

async function queryPathProbe(
  name: string,
  path: string,
  request: Promise<{ size: number }>,
): Promise<FirestorePathProbe> {
  const result = await timed(request)
  if (result.state === 'success') {
    return { name, path, operation: 'list/query', state: 'allowed', documents: result.value.size }
  }
  if (result.state === 'error') logError(result.error, `health/${name}`)
  return { name, path, operation: 'list/query', state: result.state }
}

async function timed<T>(request: Promise<T>): Promise<{ state: 'success'; value: T } | { state: 'timeout' } | { state: FailedProbeState; error?: unknown }> {
  let timer = 0
  const timeout = new Promise<{ state: 'timeout' }>(resolve => {
    timer = window.setTimeout(() => resolve({ state: 'timeout' }), timeoutMs)
  })
  const settled = request.then(
    value => ({ state: 'success' as const, value }),
    error => ({ state: stateForError(error), error }),
  )
  const result = await Promise.race([settled, timeout])
  window.clearTimeout(timer)
  return result
}

function readRealtimeOnce(reference: DatabaseReference): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let stop: () => void = () => {}
    let trackedStop: () => void = () => {}
    let timeout = 0
    let completed = false
    const finish = (action: () => void) => {
      if (completed) return
      completed = true
      window.clearTimeout(timeout)
      trackedStop()
      action()
    }
    timeout = window.setTimeout(() => finish(() => resolve({ __probeTimeout: true })), timeoutMs)
    stop = onValue(reference, snapshot => finish(() => resolve(snapshot.val())), error => finish(() => reject(error)), { onlyOnce: true })
    trackedStop = trackListener(stop)
    if (completed) trackedStop()
  })
}

async function realtimeProbe(path: string): Promise<{ state: ProbeState; value?: unknown }> {
  if (!realtimeDatabase) return { state: 'skipped' }
  const result = await timed(readRealtimeOnce(ref(realtimeDatabase, path)))
  if (result.state !== 'success') return { state: result.state }
  if (result.value && typeof result.value === 'object' && '__probeTimeout' in result.value) return { state: 'timeout' }
  return { state: 'success', value: result.value }
}

function queryProbes(uid: string) {
  if (!firestore) return []
  const db = firestore
  return [
    { name: 'members', request: query(collection(db, 'members'), where('active', '==', true), limit(3)) },
    { name: 'notes', request: query(collection(db, 'homes/shared/notes'), orderBy('createdAt', 'desc'), limit(1)) },
    { name: 'keepsakes', request: query(collection(db, 'homes/shared/keepsakes'), orderBy('createdAt', 'desc'), limit(1)) },
    { name: 'flowers', request: query(collection(db, 'gardens/shared/flowers'), orderBy('createdAt', 'desc'), limit(1)) },
    { name: 'letters-sent', request: query(collection(db, 'letters'), where('senderUid', '==', uid), orderBy('createdAt', 'desc'), limit(1)) },
    { name: 'letters-received', request: query(collection(db, 'letters'), where('recipientUid', '==', uid), orderBy('createdAt', 'desc'), limit(1)) },
  ]
}

export async function runHealthCheck(): Promise<HealthReport> {
  const user = firebaseAuth?.currentUser ?? null
  let token: HealthReport['auth']['token'] = user ? 'failure' : 'skipped'
  if (user) {
    try {
      await user.getIdToken()
      token = 'success'
    } catch {
      token = 'failure'
    }
  }

  let firestoreMember: ProbeResult = { state: 'skipped' }
  const queries: HealthReport['queries'] = []
  const setupPaths: HealthReport['setupPaths'] = [
    { name: 'character-members', path: 'members', operation: 'list/query', state: 'skipped' },
    { name: 'character-world', path: 'world/main', operation: 'get', state: 'skipped' },
    { name: 'character-profile', path: 'playerProfiles/{currentUid}', operation: 'get', state: 'skipped' },
    { name: 'tutorial-progress', path: 'playerTutorials/{currentUid}', operation: 'get', state: 'skipped' },
    { name: 'player-looks', path: 'playerLooks/{currentUid}', operation: 'get', state: 'skipped' },
    { name: 'pets', path: 'world/pets', operation: 'get', state: 'skipped' },
    { name: 'gallery-photos', path: 'gallery/shared/photos', operation: 'list/query', state: 'skipped' },
  ]
  if (user && firestore) {
    const memberResult = await timed(getDocFromServer(doc(firestore, 'members', user.uid)))
    if (memberResult.state === 'success') firestoreMember = { state: memberResult.value.exists() ? 'success' : 'missing' }
    else {
      firestoreMember = { state: memberResult.state }
      if (memberResult.state === 'error') logError(memberResult.error, 'health/firestore-member')
    }

    const results = await Promise.all(queryProbes(user.uid).map(async probe => {
      const result = await timed(getDocsFromServer(probe.request))
      if (result.state === 'error') logError(result.error, `health/${probe.name}`)
      return {
        name: probe.name,
        state: result.state,
        ...(result.state === 'success' ? { documents: result.value.size } : {}),
        ...(result.state === 'failed-precondition' ? { indexHint: `${probe.name} query may require a Firestore composite index.` } : {}),
      }
    }))
    queries.push(...results)

    const membersQuery = results.find(result => result.name === 'members')
    setupPaths[0] = {
      name: 'character-members',
      path: 'members',
      operation: 'list/query',
      state: pathStateForProbe(membersQuery?.state ?? 'skipped'),
      ...(membersQuery?.documents !== undefined ? { documents: membersQuery.documents } : {}),
    }
    const [worldPath, profilePath, tutorialPath, playerLooksPath, petsPath, galleryPhotosPath] = await Promise.all([
      documentPathProbe('character-world', 'world/main', getDocFromServer(doc(firestore, 'world', 'main'))),
      documentPathProbe('character-profile', 'playerProfiles/{currentUid}', getDocFromServer(doc(firestore, 'playerProfiles', user.uid))),
      documentPathProbe('tutorial-progress', 'playerTutorials/{currentUid}', getDocFromServer(doc(firestore, 'playerTutorials', user.uid))),
      documentPathProbe('player-looks', 'playerLooks/{currentUid}', getDocFromServer(doc(firestore, 'playerLooks', user.uid))),
      documentPathProbe('pets', 'world/pets', getDocFromServer(doc(firestore, 'world', 'pets'))),
      queryPathProbe('gallery-photos', 'gallery/shared/photos', getDocsFromServer(
        query(collection(firestore, 'gallery', 'shared', 'photos'), limit(1)),
      )),
    ])
    setupPaths.splice(1, 6, worldPath, profilePath, tutorialPath, playerLooksPath, petsPath, galleryPhotosPath)
  }

  const [connectedProbe, offsetProbe] = await Promise.all([
    realtimeProbe('.info/connected'),
    realtimeProbe('.info/serverTimeOffset'),
  ])
  const connected = connectedProbe.state === 'success' && typeof connectedProbe.value === 'boolean'
    ? connectedProbe.value
    : null
  const serverTimeOffset = offsetProbe.state === 'success' && typeof offsetProbe.value === 'number'
    ? offsetProbe.value
    : null

  const report: HealthReport = {
    checkedAt: new Date().toISOString(),
    auth: { userPresent: Boolean(user), token },
    firestoreMember,
    realtime: {
      connected,
      connectionState: connectedProbe.state,
      serverTimeOffset,
      offsetState: offsetProbe.state,
    },
    queries,
    setupPaths,
    online: typeof navigator === 'undefined' ? false : navigator.onLine,
  }
  lastReport = report
  logEvent('info', 'health', 'check-complete', {
    auth: report.auth.token,
    firestore: report.firestoreMember.state,
    realtime: report.realtime.connectionState,
    queryFailures: report.queries.filter(result => result.state !== 'success').length,
    setupPathFailures: report.setupPaths.filter(result => result.state === 'permission-denied').length,
    online: report.online,
  })
  return report
}

export function getLastHealthReport() {
  return lastReport
}

declare global {
  interface Window {
    __tw?: { health: typeof runHealthCheck }
  }
}

if (import.meta.env.DEV && typeof window !== 'undefined') {
  window.__tw = { ...window.__tw, health: runHealthCheck }
}
