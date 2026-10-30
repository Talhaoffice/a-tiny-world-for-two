export type RemoteDirection = 'up' | 'down' | 'left' | 'right'
export type RemoteAnimation = 'idle' | 'walk' | 'wave' | 'sit' | 'sleep'

export const POSITION_WRITE_RETRY_DELAYS = [1_000, 3_000, 6_000] as const
// Combat validation rejects positions older than 15 seconds. Keep a five
// second margin while refreshing stationary players from the scene heartbeat.
export const POSITION_WRITE_HEARTBEAT_MS = 10_000

export function shouldPublishPosition({
  force,
  elapsedMs,
  moved,
  zoneChanged,
  animationChanged,
}: {
  force: boolean
  elapsedMs: number
  moved: boolean
  zoneChanged: boolean
  animationChanged: boolean
}) {
  return force || zoneChanged || animationChanged
    || (moved && elapsedMs >= 100)
    || elapsedMs >= POSITION_WRITE_HEARTBEAT_MS
}

export function getPositionWriteRetryDelay(retryCount: number): number | null {
  return Number.isInteger(retryCount) && retryCount >= 0 && retryCount < POSITION_WRITE_RETRY_DELAYS.length
    ? POSITION_WRITE_RETRY_DELAYS[retryCount]
    : null
}

/** Position-only publications must not erase a sleeping state. Wake publishes `idle` explicitly. */
export function preserveSleepAnimation(current: RemoteAnimation | undefined, requested: RemoteAnimation | undefined): RemoteAnimation | undefined {
  return requested ?? (current === 'sleep' ? 'sleep' : undefined)
}

export type ValidRemotePosition = {
  uid: string
  x: number
  y: number
  updatedAt: number
  dir?: RemoteDirection
  anim?: RemoteAnimation
}

export class LatestRemotePositionQueue<T extends { uid: string }> {
  private readonly pending = new Map<string, T>()

  set(position: T) {
    this.pending.set(position.uid, position)
  }

  drain() {
    const values = [...this.pending.values()]
    this.pending.clear()
    return values
  }

  clear() {
    this.pending.clear()
  }

  get size() {
    return this.pending.size
  }
}

export function validateRemotePosition(value: unknown, expectedUid: string): value is ValidRemotePosition {
  if (!value || typeof value !== 'object') return false
  const position = value as Record<string, unknown>
  return position.uid === expectedUid
    && typeof position.x === 'number' && Number.isFinite(position.x) && position.x >= 0 && position.x <= 1536
    && typeof position.y === 'number' && Number.isFinite(position.y) && position.y >= 0 && position.y <= 1024
    && typeof position.updatedAt === 'number' && Number.isFinite(position.updatedAt)
    && (position.dir === undefined || ['up', 'down', 'left', 'right'].includes(String(position.dir)))
    && (position.anim === undefined || ['idle', 'walk', 'wave', 'sit', 'sleep'].includes(String(position.anim)))
}

export function dispatchRemotePosition<T>(
  callback: (position: T) => void,
  position: T,
  disposed: boolean,
  onError: (error: unknown) => void,
) {
  if (disposed) return false
  try {
    callback(position)
    return true
  } catch (error) {
    try { onError(error) } catch { /* diagnostic observers must not escape into the Firebase callback */ }
    return false
  }
}

export function resolveRemoteLook<T>(savedLook: T | null | undefined, catalogDefault: T): T {
  return savedLook ?? catalogDefault
}
