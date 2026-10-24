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
    { name: 'members', request: query(collection(db, 'members'), where('active', '==', true), limit(1)) },
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
        ...(result.state === 'failed-precondition' ? { indexHint: `${probe.name} query may require a Firestore composite index.` } : {}),
      }
    }))
    queries.push(...results)
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
    online: typeof navigator === 'undefined' ? false : navigator.onLine,
  }
  lastReport = report
  logEvent('info', 'health', 'check-complete', {
    auth: report.auth.token,
    firestore: report.firestoreMember.state,
    realtime: report.realtime.connectionState,
    queryFailures: report.queries.filter(result => result.state !== 'success').length,
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
