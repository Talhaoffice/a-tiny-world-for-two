import { getRecentErrors, logError } from './logger'
import { getPanelDiagnostics } from './panelDiagnostics.ts'

export type DiagnosticsSnapshot = {
  listenerCount: number
  pendingWrites: number
  fps: number
  rtdbWritesPerMinute: number
  rtdbConnected: boolean | null
  serverTimeOffset: number | null
}

let snapshot: DiagnosticsSnapshot = {
  listenerCount: 0,
  pendingWrites: 0,
  fps: 0,
  rtdbWritesPerMinute: 0,
  rtdbConnected: null,
  serverTimeOffset: null,
}
let writeTimes: number[] = []
let frameCount = 0
let lastFrameSample = 0
const subscribers = new Set<(value: DiagnosticsSnapshot) => void>()

function publish(patch: Partial<DiagnosticsSnapshot>) {
  snapshot = { ...snapshot, ...patch }
  for (const subscriber of subscribers) subscriber({ ...snapshot })
}

export function getDiagnosticsSnapshot() {
  return { ...snapshot }
}

export function subscribeDiagnostics(subscriber: (value: DiagnosticsSnapshot) => void) {
  subscribers.add(subscriber)
  subscriber({ ...snapshot })
  return () => subscribers.delete(subscriber)
}

export function trackListener(unsubscribe: () => void) {
  publish({ listenerCount: snapshot.listenerCount + 1 })
  let active = true
  return () => {
    if (!active) return
    active = false
    publish({ listenerCount: Math.max(0, snapshot.listenerCount - 1) })
    unsubscribe()
  }
}

export async function trackWrite<T>(operation: string, request: Promise<T>): Promise<T> {
  publish({ pendingWrites: snapshot.pendingWrites + 1 })
  try {
    return await request
  } catch (error) {
    logError(error, operation)
    throw error
  } finally {
    publish({ pendingWrites: Math.max(0, snapshot.pendingWrites - 1) })
  }
}

export function recordRtdbWrite(at = Date.now()) {
  writeTimes = [...writeTimes.filter(time => at - time < 60_000), at]
  publish({ rtdbWritesPerMinute: writeTimes.length })
}

export function setRtdbConnected(connected: boolean | null) {
  publish({ rtdbConnected: connected })
}

export function setServerTimeOffset(offset: number | null) {
  publish({ serverTimeOffset: offset })
}

export function recordFrame(time: number) {
  frameCount += 1
  if (!lastFrameSample) lastFrameSample = time
  if (time - lastFrameSample >= 1000) {
    writeTimes = writeTimes.filter(writeTime => Date.now() - writeTime < 60_000)
    publish({
      fps: Math.round(frameCount * 1000 / (time - lastFrameSample)),
      rtdbWritesPerMinute: writeTimes.length,
    })
    frameCount = 0
    lastFrameSample = time
  }
}

export function createDiagnosticsReport(online: boolean, health?: unknown) {
  return {
    appVersion: '0.1.0',
    commit: 'unknown',
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'unconfigured',
    online,
    ...getDiagnosticsSnapshot(),
    lastErrors: getRecentErrors(),
    panels: getPanelDiagnostics(),
    ...(health ? { health } : {}),
  }
}
