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
import { isCharacterAppearance, type CharacterAppearance } from './characters.config'
import { canSendWorldEmote, isFreshWorldEmote, isWorldEmoteType, type WorldEmoteType } from './worldEmotes'
import { dispatchRemotePosition, getPositionWriteRetryDelay, preserveSleepAnimation, shouldPublishPosition, validateRemotePosition, type RemoteAnimation, type ValidRemotePosition } from './remotePosition'

export type RemotePosition = ValidRemotePosition & { appearance?: CharacterAppearance; emote?: WorldEmoteType }
export type ConnectionState = 'connecting' | 'online' | 'reconnecting' | 'error'

type PlayerRecord = {
  presence?: { online?: unknown; lastChanged?: unknown }
  position?: { x?: unknown; y?: unknown; updatedAt?: unknown; zone?: unknown; anim?: unknown }
  appearance?: unknown
  emote?: { kind?: unknown; sentAt?: unknown }
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
  const ownAppearanceRef = ref(database, `world/players/${uid}/appearance`)
  const ownEmoteRef = ref(database, `world/players/${uid}/emote`)
  const connectedRef = ref(database, '.info/connected')
  const serverOffsetRef = ref(database, '.info/serverTimeOffset')
  const playersRef = ref(database, 'world/players')
  const disconnectOperation = onDisconnect(ownPresenceRef)
  let disposed = false
  let connected = false
  let presenceOnline = false
  let positionPublishingEnabled = true
  let serverOffset = 0
  let latestPlayers: Record<string, PlayerRecord> = {}
  let lastSentX = Number.NaN
  let lastSentY = Number.NaN
  let lastSentAt = Number.NEGATIVE_INFINITY
  let lastSentZone: WorldZone = 'island'
  let lastSentAnim: RemoteAnimation | undefined
  let activeZone: WorldZone = 'island'
  let latestPosition: { x: number; y: number; anim?: RemoteAnimation } | null = null
  let latestAppearance: CharacterAppearance | null = null
  let lastSentAppearance = ''
  let lastSentEmoteAt = Number.NEGATIVE_INFINITY
  let lastSeenRemoteEmoteAt = Number.NEGATIVE_INFINITY
  let lastPresenceHeartbeatAt = Date.now()
  let presenceRegistrationInFlight = false
  let positionWriteToken = 0
  let positionWriteRetryCount = 0
  let positionWriteRetryTimer = 0

  const writeLatestPosition = (force = false, now = performance.now()) => {
    if (disposed || document.hidden || !connected || !positionPublishingEnabled || !latestPosition) return
    const { x, y, anim } = latestPosition
    const moved = !Number.isFinite(lastSentX) || Math.abs(x - lastSentX) >= 2 || Math.abs(y - lastSentY) >= 2
    const zoneChanged = activeZone !== lastSentZone
    const animationChanged = anim !== lastSentAnim
    if (!shouldPublishPosition({ force, elapsedMs: now - lastSentAt, moved, zoneChanged, animationChanged })) return
    lastSentX = x
    lastSentY = y
    lastSentAt = now
    lastSentZone = activeZone
    lastSentAnim = anim
    if (positionWriteRetryTimer) window.clearTimeout(positionWriteRetryTimer)
    positionWriteRetryTimer = 0
    const writeToken = ++positionWriteToken
    recordRtdbWrite()
    void trackWrite('rtdb/position', set(ownPositionRef, { x: Math.round(x), y: Math.round(y), zone: activeZone, ...(anim ? { anim } : {}), updatedAt: serverTimestamp() })).then(() => {
      if (disposed || writeToken !== positionWriteToken) return
      positionWriteRetryCount = 0
      if (presenceOnline) onConnectionState('online')
    }).catch(() => {
      if (disposed || writeToken !== positionWriteToken) return
      lastSentX = Number.NaN
      lastSentY = Number.NaN
      lastSentAnim = undefined
      lastSentZone = activeZone === 'home' ? 'island' : 'home'
      const delay = getPositionWriteRetryDelay(positionWriteRetryCount)
      if (delay !== null) {
        positionWriteRetryCount += 1
        onConnectionState('reconnecting')
        positionWriteRetryTimer = window.setTimeout(() => {
          positionWriteRetryTimer = 0
          writeLatestPosition(true)
        }, delay)
      } else {
        positionWriteRetryCount = 0
        onConnectionState('error')
      }
    })
  }

  const writeAppearance = () => {
    if (disposed || document.hidden || !connected || !latestAppearance) return
    const signature = JSON.stringify(latestAppearance)
    if (signature === lastSentAppearance) return
    lastSentAppearance = signature
    recordRtdbWrite()
    void trackWrite('rtdb/appearance', set(ownAppearanceRef, latestAppearance)).catch(() => {
      lastSentAppearance = ''
      if (!disposed) onConnectionState('reconnecting')
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
      presenceOnline = true
      writeAppearance()
      if (!disposed) onConnectionState('online')
      writeLatestPosition(true)
    } catch {
      if (!disposed) onConnectionState('error')
    } finally {
      presenceRegistrationInFlight = false
    }
  }

  const updateRemotePosition = () => {
    if (disposed) return
    const now = Date.now() + serverOffset
    const remote = Object.entries(latestPlayers).find(([otherUid, player]) => {
      if (otherUid !== expectedPeerUid || player.presence?.online !== true) return false
      if (!positionMatchesZone(activeZone, player.position?.zone)) return false
      const lastChanged = player.presence.lastChanged
      if (typeof lastChanged !== 'number' || !Number.isFinite(lastChanged)) return false
      const presenceAge = now - lastChanged
      if (presenceAge < 0 || presenceAge > STALE_PRESENCE_MS) return false
      const { x, y, updatedAt } = player.position ?? {}
      return typeof x === 'number' && Number.isFinite(x) && typeof y === 'number' && Number.isFinite(y)
        && typeof updatedAt === 'number' && Number.isFinite(updatedAt)
        && x >= 0 && x <= 1536 && y >= 0 && y <= 1024
        && (player.position?.anim === undefined || ['idle', 'walk', 'wave', 'sit', 'sleep'].includes(String(player.position.anim)))
    })

    if (!remote) {
      dispatchRemotePosition(onRemotePosition, null, disposed, error => logError(error, 'rtdb/remote-position-callback'))
      return
    }
    const [remoteUid, player] = remote
    const appearance = isCharacterAppearance(player.appearance) ? player.appearance : undefined
    const sharedEmote = player.emote
    let emote: WorldEmoteType | undefined
    if (sharedEmote && isWorldEmoteType(sharedEmote.kind)
      && typeof sharedEmote.sentAt === 'number' && Number.isFinite(sharedEmote.sentAt)
      && sharedEmote.sentAt > lastSeenRemoteEmoteAt) {
      lastSeenRemoteEmoteAt = sharedEmote.sentAt
      if (isFreshWorldEmote(sharedEmote.sentAt, now)) emote = sharedEmote.kind
    }
    const position: RemotePosition = {
      uid: remoteUid,
      x: player.position!.x as number,
      y: player.position!.y as number,
      updatedAt: player.position!.updatedAt as number,
      ...(typeof player.position!.anim === 'string' ? { anim: player.position!.anim as RemoteAnimation } : {}),
      appearance,
      emote,
    }
    if (!validateRemotePosition(position, expectedPeerUid)) return
    dispatchRemotePosition(onRemotePosition, position, disposed, error => logError(error, 'rtdb/remote-position-callback'))
  }

  const stopPlayers = trackListener(onValue(playersRef, snapshot => {
    try {
      if (disposed) return
      latestPlayers = (snapshot.val() ?? {}) as Record<string, PlayerRecord>
      updateRemotePosition()
    } catch (error) { logError(error, 'rtdb/players-callback') }
  }, () => {
    try {
      if (disposed) return
      dispatchRemotePosition(onRemotePosition, null, disposed, error => logError(error, 'rtdb/remote-position-callback'))
      onConnectionState('error')
      logError(new Error('RTDB player listener failed.'), 'rtdb/players')
    } catch (error) { logError(error, 'rtdb/players-error-callback') }
  }))
  const stopOffset = trackListener(onValue(serverOffsetRef, snapshot => {
    try {
      if (disposed) return
      serverOffset = typeof snapshot.val() === 'number' && Number.isFinite(snapshot.val()) ? snapshot.val() as number : 0
      setServerTimeOffset(serverOffset)
      updateRemotePosition()
    } catch (error) { logError(error, 'rtdb/server-offset-callback') }
  }, error => logError(error, 'rtdb/server-offset')))
  const stalenessTimer = window.setInterval(() => {
    try { updateRemotePosition() } catch (error) { logError(error, 'rtdb/remote-position-timer') }
  }, 5_000)
  const handleVisibilityChange = () => {
    if (document.hidden) return
    lastSentX = Number.NaN
    lastSentY = Number.NaN
    lastSentAt = Number.NEGATIVE_INFINITY
    if (connected) void markPresenceOnline()
  }
  document.addEventListener('visibilitychange', handleVisibilityChange)
  const stopConnection = trackListener(onValue(connectedRef, snapshot => {
    try {
      if (disposed) return
      if (snapshot.val() !== true) {
        connected = false
        presenceOnline = false
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
    } catch (error) { logError(error, 'rtdb/connection-callback') }
  }, error => {
    try {
      if (disposed) return
      connected = false
      presenceOnline = false
      setRtdbConnected(false)
      onConnectionState('error')
      logError(error, 'rtdb/connection')
    } catch (callbackError) { logError(callbackError, 'rtdb/connection-error-callback') }
  }))

  const publishPosition = (x: number, y: number, _sceneTime?: number, anim?: RemoteAnimation) => {
    if (disposed || !Number.isFinite(x) || !Number.isFinite(y)
      || x < 0 || x > 1536 || y < 0 || y > 1024) return
    const nextAnim = preserveSleepAnimation(latestPosition?.anim, anim)
    latestPosition = { x, y, ...(nextAnim ? { anim: nextAnim } : {}) }
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
    setPositionPublishingEnabled(enabled: boolean) {
      if (disposed || positionPublishingEnabled === enabled) return
      positionPublishingEnabled = enabled
      if (enabled) {
        lastSentAt = Number.NEGATIVE_INFINITY
        writeLatestPosition(true)
      }
    },
    publishAppearance(appearance: CharacterAppearance) {
      if (disposed || !isCharacterAppearance(appearance)) return
      latestAppearance = { ...appearance }
      writeAppearance()
    },
    publishEmote(kind: WorldEmoteType) {
      const now = performance.now()
      if (disposed || document.hidden || !connected || !isWorldEmoteType(kind)
        || !canSendWorldEmote(lastSentEmoteAt, now)) return false
      lastSentEmoteAt = now
      recordRtdbWrite()
      void trackWrite('rtdb/emote', set(ownEmoteRef, { kind, sentAt: serverTimestamp() })).catch(() => {
        if (!disposed) onConnectionState('reconnecting')
      })
      return true
    },
    setZone(zone: WorldZone, x?: number, y?: number) {
      if (disposed) return
      activeZone = zone
      if (typeof x === 'number' && Number.isFinite(x) && typeof y === 'number' && Number.isFinite(y)
        && x >= 0 && x <= 1536 && y >= 0 && y <= 1024) latestPosition = { x, y, ...(latestPosition?.anim ? { anim: latestPosition.anim } : {}) }
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
      if (positionWriteRetryTimer) window.clearTimeout(positionWriteRetryTimer)
      positionWriteRetryTimer = 0
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      connected = false
      presenceOnline = false
      setRtdbConnected(null)
      setServerTimeOffset(null)
      dispatchRemotePosition(onRemotePosition, null, disposed, error => logError(error, 'rtdb/remote-position-callback'))
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
