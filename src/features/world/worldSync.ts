import {
  onDisconnect,
  onValue,
  ref,
  serverTimestamp,
  set,
  update,
  type Database,
} from 'firebase/database'
import { recordRtdbWrite, setRtdbConnected, setServerTimeOffset, trackListener, trackWrite } from '../../lib/diagnostics'
import { logError } from '../../lib/logger'
import { positionMatchesZone, type WorldZone } from './worldZone'

export type RemotePosition = { uid: string; x: number; y: number }
export type ConnectionState = 'connecting' | 'online' | 'reconnecting' | 'error'

type PlayerRecord = {
  presence?: { online?: unknown; lastChanged?: unknown }
  position?: { x?: unknown; y?: unknown; updatedAt?: unknown; zone?: unknown }
}

// Presence gets a heartbeat every 20 seconds. Two minutes tolerates brief
// reconnects and delayed writes while bounding how long a missed disconnect
// can leave an unresponsive player visible.
const PRESENCE_HEARTBEAT_MS = 20_000
const STALE_PRESENCE_MS = 120_000

export function connectWorldSync(
  database: Database,
  uid: string,
  expectedPeerUid: string,
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
  let connected = false
  let serverOffset = 0
  let latestPlayers: Record<string, PlayerRecord> = {}
  let lastSentX = Number.NaN
  let lastSentY = Number.NaN
  let lastSentAt = Number.NEGATIVE_INFINITY
  let lastSentZone: WorldZone = 'island'
  let activeZone: WorldZone = 'island'
  let latestPosition: { x: number; y: number } | null = null
  let lastPresenceHeartbeatAt = Date.now()
  let presenceRegistrationInFlight = false

  const writeLatestPosition = (force = false, now = performance.now()) => {
    if (disposed || document.hidden || !connected || !latestPosition) return
    const { x, y } = latestPosition
    const moved = !Number.isFinite(lastSentX) || Math.abs(x - lastSentX) >= 2 || Math.abs(y - lastSentY) >= 2
    const dueToMove = moved && now - lastSentAt >= 100
    const zoneChanged = activeZone !== lastSentZone
    if (!force && !dueToMove && !zoneChanged) return
    lastSentX = x
    lastSentY = y
    lastSentAt = now
    lastSentZone = activeZone
    recordRtdbWrite()
    void trackWrite('rtdb/position', set(ownPositionRef, { x: Math.round(x), y: Math.round(y), zone: activeZone, updatedAt: serverTimestamp() })).catch(() => {
      if (!disposed) {
        lastSentX = Number.NaN
        lastSentY = Number.NaN
        lastSentZone = activeZone === 'home' ? 'island' : 'home'
        onConnectionState('reconnecting')
      }
    })
  }

  const markPresenceOnline = async () => {
    if (disposed || document.hidden || !connected || presenceRegistrationInFlight) return
    presenceRegistrationInFlight = true
    try {
      recordRtdbWrite()
      await trackWrite('rtdb/presence-register', disconnectOperation.update({ online: false, lastChanged: serverTimestamp() }))
      if (disposed || document.hidden || !connected) return
      recordRtdbWrite()
      await trackWrite('rtdb/presence-online', update(ownPresenceRef, { online: true, lastChanged: serverTimestamp() }))
      lastPresenceHeartbeatAt = Date.now()
      if (!disposed) onConnectionState('online')
      writeLatestPosition(true)
    } catch {
      if (!disposed) onConnectionState('error')
    } finally {
      presenceRegistrationInFlight = false
    }
  }

  const updateRemotePosition = () => {
    const now = Date.now() + serverOffset
    const remote = Object.entries(latestPlayers).find(([otherUid, player]) => {
      if (otherUid !== expectedPeerUid || player.presence?.online !== true) return false
      if (!positionMatchesZone(activeZone, player.position?.zone)) return false
      const lastChanged = player.presence.lastChanged
      if (typeof lastChanged !== 'number' || !Number.isFinite(lastChanged)) return false
      const presenceAge = now - lastChanged
      if (presenceAge < 0 || presenceAge > STALE_PRESENCE_MS) return false
      const { x, y, updatedAt } = player.position ?? {}
      return typeof x === 'number' && typeof y === 'number' && typeof updatedAt === 'number'
        && x >= 0 && x <= 1536 && y >= 0 && y <= 1024
    })

    if (!remote) {
      onRemotePosition(null)
      return
    }
    const [remoteUid, player] = remote
    onRemotePosition({ uid: remoteUid, x: player.position!.x as number, y: player.position!.y as number })
  }

  const stopPlayers = trackListener(onValue(playersRef, snapshot => {
    latestPlayers = (snapshot.val() ?? {}) as Record<string, PlayerRecord>
    updateRemotePosition()
  }, () => {
    onRemotePosition(null)
    onConnectionState('error')
    logError(new Error('RTDB player listener failed.'), 'rtdb/players')
  }))
  const stopOffset = trackListener(onValue(serverOffsetRef, snapshot => {
    serverOffset = typeof snapshot.val() === 'number' ? snapshot.val() : 0
    setServerTimeOffset(serverOffset)
    updateRemotePosition()
  }, error => logError(error, 'rtdb/server-offset')))
  const stalenessTimer = window.setInterval(updateRemotePosition, 5_000)
  const handleVisibilityChange = () => {
    if (document.hidden) return
    lastSentX = Number.NaN
    lastSentY = Number.NaN
    lastSentAt = Number.NEGATIVE_INFINITY
    if (connected) void markPresenceOnline()
  }
  document.addEventListener('visibilitychange', handleVisibilityChange)
  const stopConnection = trackListener(onValue(connectedRef, snapshot => {
    if (snapshot.val() !== true) {
      connected = false
      lastSentX = Number.NaN
      lastSentY = Number.NaN
      lastSentAt = Number.NEGATIVE_INFINITY
      setRtdbConnected(false)
      onConnectionState('reconnecting')
      return
    }

    connected = true
    setRtdbConnected(true)
    onConnectionState('connecting')
    lastSentX = Number.NaN
    lastSentY = Number.NaN
    lastSentAt = Number.NEGATIVE_INFINITY
    void markPresenceOnline()
  }, error => {
    connected = false
    setRtdbConnected(false)
    onConnectionState('error')
    logError(error, 'rtdb/connection')
  }))

  const publishPosition = (x: number, y: number, _sceneTime?: number) => {
    if (disposed || !Number.isFinite(x) || !Number.isFinite(y)
      || x < 0 || x > 1536 || y < 0 || y > 1024) return
    latestPosition = { x, y }
    writeLatestPosition(false, performance.now())

    const wallClockNow = Date.now()
    if (wallClockNow - lastPresenceHeartbeatAt >= PRESENCE_HEARTBEAT_MS) {
      if (!connected || document.hidden) return
      lastPresenceHeartbeatAt = wallClockNow
      recordRtdbWrite()
      void trackWrite('rtdb/presence-heartbeat', update(ownPresenceRef, { online: true, lastChanged: serverTimestamp() })).catch(() => {
        if (!disposed) onConnectionState('reconnecting')
      })
    }
  }

  return {
    publishPosition,
    setZone(zone: WorldZone, x?: number, y?: number) {
      if (disposed) return
      activeZone = zone
      if (typeof x === 'number' && Number.isFinite(x) && typeof y === 'number' && Number.isFinite(y)
        && x >= 0 && x <= 1536 && y >= 0 && y <= 1024) latestPosition = { x, y }
      updateRemotePosition()
      writeLatestPosition(true)
    },
    async stop() {
      if (disposed) return
      disposed = true
      stopPlayers()
      stopOffset()
      stopConnection()
      window.clearInterval(stalenessTimer)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      connected = false
      setRtdbConnected(null)
      setServerTimeOffset(null)
      onRemotePosition(null)
      if (!document.hidden) {
        recordRtdbWrite()
        const cleanup = trackWrite('rtdb/presence-offline', update(ownPresenceRef, { online: false, lastChanged: serverTimestamp() }))
          .then(() => disconnectOperation.cancel())
          .catch(() => {
            // The registered onDisconnect operation remains the offline fallback.
          })
        let timeout = 0
        await Promise.race([cleanup, new Promise<void>(resolve => { timeout = window.setTimeout(resolve, 1_500) })])
        window.clearTimeout(timeout)
      }
    },
  }
}
