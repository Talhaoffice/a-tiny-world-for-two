export const WEAPON_CATALOG = Object.freeze({
  sipper: Object.freeze({ damage: 5, range: 42, cooldownMs: 450, projectile: false }),
  stick: Object.freeze({ damage: 10, range: 58, cooldownMs: 750, projectile: false }),
  sword: Object.freeze({ damage: 20, range: 72, cooldownMs: 900, projectile: false }),
  axe: Object.freeze({ damage: 30, range: 68, cooldownMs: 1350, projectile: false }),
  gun: Object.freeze({ damage: 15, range: 280, cooldownMs: 1600, projectile: true }),
})

export const MAX_HEALTH = 100
export const WORLD_POSITION_MAX = { x: 1536, y: 1024 }
export const POND_CENTER = { x: 528, y: 576 }
export const POND_THROW_RADIUS = { x: 78, y: 62 }
export const HOME_RESPAWN_POSITION = { x: 768, y: 820, zone: 'home' }
const FACING = Object.freeze({ up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] })

function validInteractionPosition(position, now) {
  return position && Number.isFinite(position.x) && Number.isFinite(position.y)
    && Number.isFinite(position.updatedAt) && now - position.updatedAt <= 15_000
    && position.updatedAt <= now + 1_000 && position.x >= 0 && position.x <= WORLD_POSITION_MAX.x
    && position.y >= 0 && position.y <= WORLD_POSITION_MAX.y && position.zone === 'island'
}

export function isValidWaterThrowPosition(position) {
  if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.y)) return false
  const dx = (position.x - POND_CENTER.x) / POND_THROW_RADIUS.x
  const dy = (position.y - POND_CENTER.y) / POND_THROW_RADIUS.y
  return dx * dx + dy * dy <= 1
}

export function validateCombatInteraction({ actorUid, targetUid, action, actorPosition, targetPosition, actorOnline, targetOnline, actorState, targetState, now }) {
  if (typeof actorUid !== 'string' || typeof targetUid !== 'string' || actorUid === targetUid) return { ok: false, reason: 'invalid-target' }
  if (action !== 'pickup' && action !== 'throw') return { ok: false, reason: 'invalid-action' }
  if (!actorOnline || !targetOnline || !validInteractionPosition(actorPosition, now)
    || (action === 'pickup' && !validInteractionPosition(targetPosition, now))) {
    return { ok: false, reason: 'stale-position' }
  }
  const actor = actorState ?? { health: MAX_HEALTH, knockout: 'alive' }
  const target = targetState ?? { health: MAX_HEALTH, knockout: 'alive' }
  if (actor.health <= 0 || actor.knockout !== 'alive') return { ok: false, reason: 'actor-not-alive' }

  if (action === 'pickup') {
    if (actor.carryingUid) return { ok: false, reason: 'already-carrying' }
    if (target.health !== 0 || target.knockout !== 'knocked_out' || target.carriedBy) return { ok: false, reason: 'target-not-pickup-eligible' }
    if (Math.hypot(targetPosition.x - actorPosition.x, targetPosition.y - actorPosition.y) > 60) return { ok: false, reason: 'out-of-reach' }
    return { ok: true, action }
  }

  if (actor.carryingUid !== targetUid || target.carriedBy !== actorUid || target.health !== 0 || target.knockout !== 'carried') {
    return { ok: false, reason: 'not-carrying-target' }
  }
  if (!isValidWaterThrowPosition(actorPosition)) return { ok: false, reason: 'invalid-water-destination' }
  return { ok: true, action }
}

export function applyResolvedCombatInteraction(combatState, actorUid, targetUid, requestId, resolution, now) {
  const state = combatState && typeof combatState === 'object' ? structuredClone(combatState) : { players: {}, processed: {} }
  state.players ??= {}
  state.processed ??= {}
  const uniqueId = `${actorUid}:${requestId}`
  if (state.processed[uniqueId]) return { state, applied: false, reason: 'duplicate' }

  if (!resolution.ok) {
    state.processed[uniqueId] = { at: now, result: resolution.reason }
    return { state, applied: false, reason: resolution.reason }
  }

  const actor = state.players[actorUid] ?? { health: MAX_HEALTH, knockout: 'alive', lastAttackAt: 0, hitAt: 0 }
  const target = state.players[targetUid] ?? { health: MAX_HEALTH, knockout: 'alive', lastAttackAt: 0, hitAt: 0 }
  if (resolution.action === 'pickup') {
    actor.carryingUid = targetUid
    target.knockout = 'carried'
    target.carriedBy = actorUid
    target.hitAt = now
    state.players[actorUid] = actor
    state.players[targetUid] = target
    state.processed[uniqueId] = { at: now, result: 'picked-up' }
    return { state, applied: true, reason: 'picked-up' }
  }

  if (resolution.action !== 'throw') {
    state.processed[uniqueId] = { at: now, result: 'invalid-action' }
    return { state, applied: false, reason: 'invalid-action' }
  }
  delete actor.carryingUid
  target.knockout = 'respawning'
  target.health = 0
  delete target.carriedBy
  target.hitAt = now
  state.players[actorUid] = actor
  state.players[targetUid] = target
  state.processed[uniqueId] = { at: now, result: 'respawning' }
  return { state, applied: true, reason: 'respawning' }
}

export function completeCombatRespawn(combatState, actorUid, targetUid, requestId, now) {
  const state = combatState && typeof combatState === 'object' ? structuredClone(combatState) : { players: {}, processed: {} }
  state.players ??= {}
  state.processed ??= {}
  const processed = state.processed[`${actorUid}:${requestId}`]
  const target = state.players[targetUid]
  if (processed?.result !== 'respawning' || target?.knockout !== 'respawning' || target?.health !== 0) return state
  target.health = MAX_HEALTH
  target.knockout = 'alive'
  target.hitAt = now
  processed.result = 'respawned'
  processed.respawnedAt = now
  return state
}

export function isAuthorizedAttackEvent({ authType, authUid, pathUid, actorIsMember, targetIsMember }) {
  return authType === 'app_user' && typeof authUid === 'string' && authUid === pathUid
    && actorIsMember === true && targetIsMember === true && authUid !== ''
}

export function validateAttack({ actorUid, targetUid, request, attackerPosition, targetPosition, attackerState, targetState, now }) {
  if (typeof actorUid !== 'string' || typeof targetUid !== 'string' || actorUid === targetUid) return { ok: false, reason: 'invalid-target' }
  if (!request || !Object.hasOwn(WEAPON_CATALOG, request.weapon)) return { ok: false, reason: 'invalid-weapon' }
  if (!FACING[request.facing]) return { ok: false, reason: 'invalid-facing' }
  if (!attackerPosition || !targetPosition) return { ok: false, reason: 'missing-position' }
  if (attackerPosition.zone !== targetPosition.zone) return { ok: false, reason: 'different-zone' }
  for (const position of [attackerPosition, targetPosition]) {
    if (![position.x, position.y, position.updatedAt].every(Number.isFinite) || now - position.updatedAt > 15_000 || position.updatedAt > now + 1_000) {
      return { ok: false, reason: 'stale-position' }
    }
  }
  const actor = attackerState ?? { health: MAX_HEALTH, knockout: 'alive', lastAttackAt: 0 }
  const target = targetState ?? { health: MAX_HEALTH, knockout: 'alive' }
  if (actor.health <= 0 || actor.knockout !== 'alive' || target.health <= 0 || target.knockout !== 'alive') return { ok: false, reason: 'ineligible-player' }
  const weapon = WEAPON_CATALOG[request.weapon]
  if (!Number.isFinite(actor.lastAttackAt) || now - actor.lastAttackAt < weapon.cooldownMs) return { ok: false, reason: 'cooldown' }
  const dx = targetPosition.x - attackerPosition.x
  const dy = targetPosition.y - attackerPosition.y
  const distance = Math.hypot(dx, dy)
  if (distance > weapon.range) return { ok: false, reason: 'out-of-range' }
  const [fx, fy] = FACING[request.facing]
  if (distance > 18 && dx * fx + dy * fy < 0) return { ok: false, reason: 'wrong-direction' }
  return { ok: true, damage: weapon.damage, weapon: request.weapon, distance }
}

export function applyResolvedAttack(combatState, actorUid, targetUid, requestId, resolution, now) {
  const state = combatState && typeof combatState === 'object' ? structuredClone(combatState) : { players: {}, processed: {} }
  state.players ??= {}
  state.processed ??= {}
  const uniqueId = `${actorUid}:${requestId}`
  if (state.processed[uniqueId]) return { state, applied: false, reason: 'duplicate' }
  const actor = state.players[actorUid] ?? { health: MAX_HEALTH, knockout: 'alive', lastAttackAt: 0, hitAt: 0 }
  const target = state.players[targetUid] ?? { health: MAX_HEALTH, knockout: 'alive', lastAttackAt: 0, hitAt: 0 }
  if (!resolution.ok) {
    state.processed[uniqueId] = { at: now, result: resolution.reason }
    state.players[actorUid] = actor
    state.players[targetUid] = target
    return { state, applied: false, reason: resolution.reason }
  }
  actor.lastAttackAt = now
  target.health = Math.max(0, Math.min(MAX_HEALTH, target.health - resolution.damage))
  target.knockout = target.health === 0 ? 'knocked_out' : 'alive'
  target.hitAt = now
  state.players[actorUid] = actor
  state.players[targetUid] = target
  state.processed[uniqueId] = { at: now, result: 'hit', weapon: resolution.weapon }
  return { state, applied: true, damage: resolution.damage }
}

export function cleanProcessedRequests(processed, now, ttlMs = 120_000) {
  return Object.fromEntries(Object.entries(processed ?? {}).filter(([, result]) => Number.isFinite(result?.at) && now - result.at <= ttlMs))
}
