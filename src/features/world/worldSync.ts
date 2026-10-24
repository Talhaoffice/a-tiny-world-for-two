import {
  onDisconnect,
  onValue,
  ref,
  serverTimestamp,
  set,
  update,
  type Database,
} from 'firebase/database'

export type RemotePosition = { uid: string; x: number; y: number }
export type ConnectionState = 'connecting' | 'online' | 'reconnecting' | 'error'

type PlayerRecord = {
  presence?: { online?: unknown; lastChanged?: unknown }
  position?: { x?: unknown; y?: unknown; updatedAt?: unknown }
}

const STALE_POSITION_MS = 30_000
// Presence gets a heartbeat every 30 seconds. Two minutes tolerates brief
// reconnects and delayed writes while bounding how long a missed disconnect
// can leave an unresponsive player visible.
const PRESENCE_HEARTBEAT_MS = 30_000
const STALE_PRESENCE_MS = 120_000

export function connectWorldSync(
  database: Database,
  uid: string,
  onRemotePosition: (position: RemotePosition | null) => void,
  onConnectionState: (state: ConnectionState) => void,
) {
  const ownPresenceRef = ref(database, `world/players/${uid}/presence`)
  const ownPositionRef = ref(database, `world/players/${uid}/position`)
  const connectedRef = ref(database, '.info/connected')
  const serverOffsetRef = ref(database, '.info/serverTimeOffset')
  const playersRef = ref(database, 'world/players')
  const disconnectOperation = onDisconnect(ownPresenceRef)
  let disposed = false
  let serverOffset = 0
  let latestPlayers: Record<string, PlayerRecord> = {}

  const updateRemotePosition = () => {
    const now = Date.now() + serverOffset
    const remote = Object.entries(latestPlayers).find(([otherUid, player]) => {
      if (otherUid === uid || player.presence?.online !== true) return false
      const lastChanged = player.presence.lastChanged
      if (typeof lastChanged !== 'number' || !Number.isFinite(lastChanged)) return false
      const presenceAge = now - lastChanged
      if (presenceAge < 0 || presenceAge > STALE_PRESENCE_MS) return false
      const { x, y, updatedAt } = player.position ?? {}
      if (typeof x !== 'number' || typeof y !== 'number' || typeof updatedAt !== 'number') return false
      const age = now - updatedAt
      return age >= 0 && age <= STALE_POSITION_MS && x >= 0 && x <= 1536 && y >= 0 && y <= 1024
    })

    if (!remote) {
      onRemotePosition(null)
      return
    }
    const [remoteUid, player] = remote
    onRemotePosition({ uid: remoteUid, x: player.position!.x as number, y: player.position!.y as number })
  }

  const stopPlayers = onValue(playersRef, snapshot => {
    latestPlayers = (snapshot.val() ?? {}) as Record<string, PlayerRecord>
    updateRemotePosition()
  }, () => {
    onRemotePosition(null)
    onConnectionState('error')
  })
  const stopOffset = onValue(serverOffsetRef, snapshot => {
    serverOffset = typeof snapshot.val() === 'number' ? snapshot.val() : 0
    updateRemotePosition()
  })
  const stalenessTimer = window.setInterval(updateRemotePosition, 5_000)
  const stopConnection = onValue(connectedRef, snapshot => {
    if (snapshot.val() !== true) {
      onConnectionState('reconnecting')
      return
    }

    onConnectionState('connecting')
    void (async () => {
      await disconnectOperation.update({ online: false, lastChanged: serverTimestamp() })
      await update(ownPresenceRef, { online: true, lastChanged: serverTimestamp() })
      if (!disposed) onConnectionState('online')
    })().catch(() => {
      if (!disposed) onConnectionState('error')
    })
  }, () => onConnectionState('error'))

  let lastSentX = Number.NaN
  let lastSentY = Number.NaN
  let lastSentAt = Number.NEGATIVE_INFINITY
  let lastPresenceHeartbeatAt = Date.now()
  const publishPosition = (x: number, y: number, now: number) => {
    if (disposed) return
    const moved = Math.abs(x - lastSentX) >= 2 || Math.abs(y - lastSentY) >= 2
    const dueToMove = moved && now - lastSentAt >= 100
    const heartbeatDue = now - lastSentAt >= 10_000
    if (!dueToMove && !heartbeatDue) return

    lastSentX = x
    lastSentY = y
    lastSentAt = now
    void set(ownPositionRef, { x: Math.round(x), y: Math.round(y), updatedAt: serverTimestamp() }).catch(() => {
      if (!disposed) onConnectionState('reconnecting')
    })

    const wallClockNow = Date.now()
    if (wallClockNow - lastPresenceHeartbeatAt >= PRESENCE_HEARTBEAT_MS) {
      lastPresenceHeartbeatAt = wallClockNow
      void update(ownPresenceRef, { online: true, lastChanged: serverTimestamp() }).catch(() => {
        if (!disposed) onConnectionState('reconnecting')
      })
    }
  }

  return {
    publishPosition,
    async stop() {
      if (disposed) return
      disposed = true
      stopPlayers()
      stopOffset()
      stopConnection()
      window.clearInterval(stalenessTimer)
      onRemotePosition(null)
      const cleanup = update(ownPresenceRef, { online: false, lastChanged: serverTimestamp() })
        .then(() => disconnectOperation.cancel())
        .catch(() => {
          // The registered onDisconnect operation remains the offline fallback.
        })
      let timeout = 0
      await Promise.race([cleanup, new Promise<void>(resolve => { timeout = window.setTimeout(resolve, 1_500) })])
      window.clearTimeout(timeout)
    },
  }
}
