import { createServer } from 'node:http'
import {
  applyResolvedAttack,
  applyResolvedCombatInteraction,
  cleanProcessedRequests,
  completeCombatRespawn,
  HOME_RESPAWN_POSITION,
  isAuthorizedAttackEvent,
  validateAttack,
  validateCombatInteraction,
} from './combatCore.js'

const MAX_BODY_BYTES = 8 * 1024
const UID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/
const REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{8,80}$/
const FACING_VALUES = new Set(['up', 'down', 'left', 'right'])
const MEMBER_PATH = uid => `members/${uid}`
const PLAYER_PATH = uid => `world/players/${uid}`
const LOADOUT_PATH = uid => `world/combat/loadouts/${uid}`
const COMBAT_STATE_PATH = 'world/combat/state'

function send(response, status, payload, origin, allowedOrigins) {
  response.statusCode = status
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.setHeader('Cache-Control', 'no-store')
  response.setHeader('Vary', 'Origin')
  if (origin && allowedOrigins.has(origin)) response.setHeader('Access-Control-Allow-Origin', origin)
  response.end(JSON.stringify(payload))
}

function safeErrorCategory(error) {
  if (typeof error?.code === 'string' && /^[a-zA-Z0-9/_-]{1,64}$/.test(error.code)) return error.code
  if (typeof error?.name === 'string' && /^[a-zA-Z][a-zA-Z0-9]{0,48}$/.test(error.name)) return `exception-${error.name.toLowerCase()}`
  return 'internal'
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    const contentType = String(request.headers['content-type'] ?? '').split(';', 1)[0].trim().toLowerCase()
    if (contentType !== 'application/json') return reject(Object.assign(new Error('unsupported-media-type'), { status: 415 }))
    const declaredLength = Number(request.headers['content-length'])
    if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) return reject(Object.assign(new Error('payload-too-large'), { status: 413 }))
    const chunks = []
    let bytes = 0
    let tooLarge = false
    let settled = false
    request.on('data', chunk => {
      bytes += chunk.length
      if (bytes > MAX_BODY_BYTES) {
        tooLarge = true
        return
      }
      chunks.push(chunk)
    })
    request.on('error', () => {
      if (settled) return
      settled = true
      reject(Object.assign(new Error('invalid-request'), { status: 400 }))
    })
    request.on('end', () => {
      if (settled) return
      settled = true
      if (tooLarge) {
        reject(Object.assign(new Error('payload-too-large'), { status: 413 }))
        return
      }
      try {
        const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'))
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('invalid-json')
        resolve(parsed)
      } catch {
        reject(Object.assign(new Error('invalid-json'), { status: 400 }))
      }
    })
  })
}

function validKeys(body, expected) {
  return Object.keys(body).length === expected.length && expected.every(key => Object.hasOwn(body, key))
}

function safePlayer(player, now) {
  const position = player?.position
  const presence = player?.presence
  const positionFresh = position && Number.isFinite(position.updatedAt)
    && now - position.updatedAt <= 15_000 && position.updatedAt <= now + 1_000
    && Number.isFinite(position.x) && Number.isFinite(position.y)
  const online = presence?.online === true && Number.isFinite(presence.lastChanged)
    && now - presence.lastChanged <= 120_000 && presence.lastChanged <= now + 1_000
  return { positionFresh, online }
}

function safeResultFromSnapshot(snapshot, uid, requestId) {
  return snapshot?.child(`processed/${uid}:${requestId}`).val() ?? null
}

function validateCommonFields(body) {
  return typeof body.targetUid === 'string' && UID_PATTERN.test(body.targetUid)
    && typeof body.requestId === 'string' && REQUEST_ID_PATTERN.test(body.requestId)
}

function responseForValidation(result, successResult) {
  if (result === 'hit') return { status: 200, body: { ok: true, result, weapon: successResult?.weapon } }
  if (result === 'picked-up' || result === 'respawned') return { status: 200, body: { ok: true, result } }
  return { status: 409, body: { ok: false, result: result || 'rejected' } }
}

export function createCombatApi({ verifyIdToken, database, allowedOrigins, now = Date.now, onInternalError = () => undefined }) {
  if (typeof verifyIdToken !== 'function' || !database?.ref || !(allowedOrigins instanceof Set)) {
    throw new TypeError('Combat API requires token verification, Realtime Database, and an origin allowlist.')
  }

  return createServer(async (request, response) => {
    const origin = typeof request.headers.origin === 'string' ? request.headers.origin : null
    if (origin && !allowedOrigins.has(origin)) {
      send(response, 403, { error: 'origin_not_allowed' }, null, allowedOrigins)
      return
    }
    if (origin) {
      response.setHeader('Access-Control-Allow-Origin', origin)
      response.setHeader('Vary', 'Origin')
    }
    if (request.method === 'OPTIONS') {
      response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
      response.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
      response.setHeader('Access-Control-Max-Age', '600')
      response.statusCode = 204
      response.end()
      return
    }
    const path = new URL(request.url ?? '/', 'http://localhost').pathname
    if (request.method === 'GET' && path === '/healthz') {
      send(response, 200, { status: 'ok' }, origin, allowedOrigins)
      return
    }
    if (request.method !== 'POST' || !['/api/combat/attack', '/api/combat/interact'].includes(path)) {
      send(response, 404, { error: 'not_found' }, origin, allowedOrigins)
      return
    }

    const authorization = request.headers.authorization
    const bearer = typeof authorization === 'string' ? /^Bearer ([A-Za-z0-9._~-]{20,8192})$/.exec(authorization) : null
    if (!bearer) {
      send(response, 401, { error: 'unauthorized' }, origin, allowedOrigins)
      return
    }

    let uid
    try {
      const decoded = await verifyIdToken(bearer[1])
      uid = decoded?.uid
      if (typeof uid !== 'string' || !UID_PATTERN.test(uid)) throw new Error('invalid-token')
    } catch {
      send(response, 401, { error: 'unauthorized' }, origin, allowedOrigins)
      return
    }

    let body
    try { body = await readJsonBody(request) } catch (error) {
      send(response, error?.status ?? 400, { error: error?.status === 415 ? 'unsupported_media_type' : error?.status === 413 ? 'payload_too_large' : 'invalid_json' }, origin, allowedOrigins)
      return
    }

    const expectedKeys = path.endsWith('/attack') ? ['targetUid', 'facing', 'requestId'] : ['targetUid', 'action', 'requestId']
    if (!validKeys(body, expectedKeys) || !validateCommonFields(body)
      || (path.endsWith('/attack') && !FACING_VALUES.has(body.facing))
      || (path.endsWith('/interact') && !['pickup', 'throw'].includes(body.action))) {
      send(response, 400, { error: 'invalid_request' }, origin, allowedOrigins)
      return
    }

    const targetUid = body.targetUid
    if (targetUid === uid) {
      send(response, 400, { error: 'invalid_request' }, origin, allowedOrigins)
      return
    }

    try {
      const [actorMember, targetMember] = await Promise.all([
        database.ref(MEMBER_PATH(uid)).get(),
        database.ref(MEMBER_PATH(targetUid)).get(),
      ])
      const actorIsMember = actorMember.val() === true
      const targetIsMember = targetMember.val() === true
      if (!isAuthorizedAttackEvent({
        authType: 'app_user', authUid: uid, pathUid: uid, actorIsMember, targetIsMember,
      })) {
        send(response, 403, { error: 'not_authorized' }, origin, allowedOrigins)
        return
      }

      const requestId = body.requestId
      const currentTime = now()
      if (path.endsWith('/attack')) {
        const [actorSnapshot, targetSnapshot, loadoutSnapshot] = await Promise.all([
          database.ref(PLAYER_PATH(uid)).get(),
          database.ref(PLAYER_PATH(targetUid)).get(),
          database.ref(LOADOUT_PATH(uid)).get(),
        ])
        const actorPlayer = actorSnapshot.val()
        const targetPlayer = targetSnapshot.val()
        const actorPresence = safePlayer(actorPlayer, currentTime)
        const targetPresence = safePlayer(targetPlayer, currentTime)
        const safelyLocated = actorPresence.online && targetPresence.online
          && actorPresence.positionFresh && targetPresence.positionFresh
        const weapon = loadoutSnapshot.val()?.weapon
        let resolution = { ok: false, reason: 'stale-position' }
        const transaction = await database.ref(COMBAT_STATE_PATH).transaction(current => {
          const currentState = current ?? { players: {}, processed: {} }
          resolution = safelyLocated
            ? validateAttack({
                actorUid: uid,
                targetUid,
                request: { weapon, facing: body.facing },
                attackerPosition: actorPlayer?.position,
                targetPosition: targetPlayer?.position,
                attackerState: currentState.players?.[uid],
                targetState: currentState.players?.[targetUid],
                now: currentTime,
              })
            : { ok: false, reason: 'stale-position' }
          const resolved = applyResolvedAttack(currentState, uid, targetUid, requestId, resolution, currentTime)
          resolved.state.processed = cleanProcessedRequests(resolved.state.processed, currentTime)
          return resolved.state
        })
        if (!transaction.committed) throw new Error('combat_transaction_failed')
        const processed = safeResultFromSnapshot(transaction.snapshot, uid, requestId)
        const resultResponse = responseForValidation(processed?.result, processed)
        send(response, resultResponse.status, { ...resultResponse.body, requestId }, origin, allowedOrigins)
        return
      }

      const [actorPlayerSnapshot, targetPlayerSnapshot] = await Promise.all([
        database.ref(PLAYER_PATH(uid)).get(), database.ref(PLAYER_PATH(targetUid)).get(),
      ])
      const actorPlayer = actorPlayerSnapshot.val()
      const targetPlayer = targetPlayerSnapshot.val()
      const actorPresence = safePlayer(actorPlayer, currentTime)
      const targetPresence = safePlayer(targetPlayer, currentTime)
      let resolution = { ok: false, reason: 'stale-position' }
      const transaction = await database.ref(COMBAT_STATE_PATH).transaction(current => {
        const currentState = current ?? { players: {}, processed: {} }
        resolution = validateCombatInteraction({
          actorUid: uid,
          targetUid,
          action: body.action,
          actorPosition: actorPlayer?.position,
          targetPosition: targetPlayer?.position,
          actorOnline: actorPresence.online,
          targetOnline: targetPresence.online,
          actorState: currentState.players?.[uid],
          targetState: currentState.players?.[targetUid],
          now: currentTime,
        })
        const resolved = applyResolvedCombatInteraction(currentState, uid, targetUid, requestId, resolution, currentTime)
        resolved.state.processed = cleanProcessedRequests(resolved.state.processed, currentTime)
        return resolved.state
      })
      if (!transaction.committed) throw new Error('combat_transaction_failed')
      let processed = safeResultFromSnapshot(transaction.snapshot, uid, requestId)
      if (!processed) throw new Error('combat_result_missing')
      if (processed.result === 'respawning') {
        await database.ref(PLAYER_PATH(targetUid)).update({
          position: { ...HOME_RESPAWN_POSITION, updatedAt: now() },
        })
        const completedAt = now()
        const completion = await database.ref(COMBAT_STATE_PATH).transaction(current =>
          completeCombatRespawn(current, uid, targetUid, requestId, completedAt))
        if (!completion.committed) throw new Error('combat_respawn_failed')
        processed = safeResultFromSnapshot(completion.snapshot, uid, requestId)
      }
      const resultResponse = responseForValidation(processed?.result, processed)
      send(response, resultResponse.status, { ...resultResponse.body, requestId }, origin, allowedOrigins)
    } catch (error) {
      try { onInternalError(safeErrorCategory(error), error) } catch { /* Diagnostic hooks must not affect the response. */ }
      if (!response.headersSent) send(response, 503, { error: 'combat_service_unavailable' }, origin, allowedOrigins)
    }
  })
}
