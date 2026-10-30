export type RemoteDirection = 'up' | 'down' | 'left' | 'right'
export type RemoteAnimation = 'idle' | 'walk' | 'wave' | 'sit'

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
    && (position.anim === undefined || ['idle', 'walk', 'wave', 'sit'].includes(String(position.anim)))
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
