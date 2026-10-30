import { isPlayerLook, type PlayerLook } from './appearanceCatalog.ts'

export type SavedPlayerLook = Omit<PlayerLook, 'updatedAt'>
export type RemoteAppearanceSnapshot = { look: SavedPlayerLook; revision: number | null }

export function normalizeRemotePlayerLook(value: unknown): RemoteAppearanceSnapshot | null {
  if (!isPlayerLook(value)) return null
  const data = value as Record<string, unknown>
  const stamp = data.updatedAt as { toMillis?: () => number; seconds?: number; nanoseconds?: number } | number | null | undefined
  const revision = typeof stamp === 'number' && Number.isFinite(stamp)
    ? stamp
    : stamp && typeof stamp === 'object' && typeof stamp.toMillis === 'function'
      ? stamp.toMillis()
      : stamp && typeof stamp === 'object' && typeof stamp.seconds === 'number'
        ? stamp.seconds * 1000 + (typeof stamp.nanoseconds === 'number' ? stamp.nanoseconds / 1_000_000 : 0)
        : null
  const { updatedAt: _updatedAt, ...look } = data
  return {
    look: look as SavedPlayerLook,
    revision: typeof revision === 'number' && Number.isFinite(revision) ? revision : null,
  }
}

/** Ignore stale cached Firestore snapshots after a newer look was already observed. */
export function keepNewestRemoteAppearance(
  current: RemoteAppearanceSnapshot | null,
  incoming: RemoteAppearanceSnapshot,
): RemoteAppearanceSnapshot {
  if (!current) return incoming
  if (incoming.revision === null) return current.revision === null ? incoming : current
  if (current.revision !== null && incoming.revision < current.revision) return current
  return incoming
}
