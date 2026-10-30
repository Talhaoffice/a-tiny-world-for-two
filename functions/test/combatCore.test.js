import test from 'node:test'
import assert from 'node:assert/strict'
import { applyResolvedAttack, applyResolvedCombatInteraction, cleanProcessedRequests, completeCombatRespawn, isAuthorizedAttackEvent, validateAttack, validateCombatInteraction } from '../src/combatCore.js'

const positions = { attacker: { x: 100, y: 100, zone: 'island', updatedAt: 10_000 }, target: { x: 145, y: 100, zone: 'island', updatedAt: 10_000 } }
const request = { weapon: 'sword', facing: 'right' }

test('resolver calculates catalog damage only for an eligible in-range target', () => {
  const result = validateAttack({ actorUid: 'a', targetUid: 'b', request, attackerPosition: positions.attacker, targetPosition: positions.target, now: 10_000 })
  assert.deepEqual({ ok: result.ok, damage: result.damage }, { ok: true, damage: 20 })
})

test('attack trigger requires the authenticated owner and two active members', () => {
  assert.equal(isAuthorizedAttackEvent({ authType: 'app_user', authUid: 'a', pathUid: 'a', actorIsMember: true, targetIsMember: true }), true)
  assert.equal(isAuthorizedAttackEvent({ authType: 'app_user', authUid: 'b', pathUid: 'a', actorIsMember: true, targetIsMember: true }), false)
  assert.equal(isAuthorizedAttackEvent({ authType: 'unauthenticated', authUid: null, pathUid: 'a', actorIsMember: true, targetIsMember: true }), false)
  assert.equal(isAuthorizedAttackEvent({ authType: 'app_user', authUid: 'a', pathUid: 'a', actorIsMember: true, targetIsMember: false }), false)
})

test('resolver rejects self hits, bad weapons, wrong zones, stale positions, cooldowns, and knockout targets', () => {
  const base = { actorUid: 'a', targetUid: 'b', request, attackerPosition: positions.attacker, targetPosition: positions.target, now: 10_000 }
  assert.equal(validateAttack({ ...base, targetUid: 'a' }).ok, false)
  assert.equal(validateAttack({ ...base, request: { weapon: 'ban', facing: 'right' } }).reason, 'invalid-weapon')
  assert.equal(validateAttack({ ...base, targetPosition: { ...positions.target, zone: 'home' } }).reason, 'different-zone')
  assert.equal(validateAttack({ ...base, targetPosition: { ...positions.target, updatedAt: 1 }, now: 20_000 }).reason, 'stale-position')
  assert.equal(validateAttack({ ...base, attackerState: { health: 100, knockout: 'alive', lastAttackAt: 9500 } }).reason, 'cooldown')
  assert.equal(validateAttack({ ...base, targetState: { health: 0, knockout: 'knocked_out' } }).reason, 'ineligible-player')
})

test('transaction model deduplicates trigger retries and bounds health', () => {
  const resolution = { ok: true, damage: 30, weapon: 'axe' }
  const first = applyResolvedAttack({}, 'a', 'b', 'request-1', resolution, 1000)
  assert.equal(first.state.players.b.health, 70)
  assert.equal(first.state.players.a.lastAttackAt, 1000)
  const retry = applyResolvedAttack(first.state, 'a', 'b', 'request-1', resolution, 1200)
  assert.equal(retry.applied, false)
  assert.equal(retry.state.players.b.health, 70)
})

test('repeated valid sipper hits take health below 50 to zero and knock the target out', () => {
  let state = {}
  const actorUid = 'a'
  const targetUid = 'b'
  const intervalMs = 451

  for (let index = 0; index < 20; index += 1) {
    const now = 10_000 + index * intervalMs
    const attackerPosition = { x: 100, y: 100, zone: 'island', updatedAt: now }
    const targetPosition = { x: 120, y: 100, zone: 'island', updatedAt: now }
    const resolution = validateAttack({
      actorUid,
      targetUid,
      request: { weapon: 'sipper', facing: 'right' },
      attackerPosition,
      targetPosition,
      attackerState: state.players?.[actorUid],
      targetState: state.players?.[targetUid],
      now,
    })

    assert.equal(resolution.ok, true, `sipper hit ${index + 1} should pass cooldown, range, and facing validation`)
    state = applyResolvedAttack(state, actorUid, targetUid, `sipper-${index}`, resolution, now).state
    if (index === 10) assert.equal(state.players[targetUid].health, 45, 'health must pass below 50')
  }

  assert.equal(state.players[targetUid].health, 0)
  assert.equal(state.players[targetUid].knockout, 'knocked_out')
  const afterKnockout = validateAttack({
    actorUid,
    targetUid,
    request: { weapon: 'sipper', facing: 'right' },
    attackerPosition: { x: 100, y: 100, zone: 'island', updatedAt: 20_000 },
    targetPosition: { x: 120, y: 100, zone: 'island', updatedAt: 20_000 },
    attackerState: state.players[actorUid],
    targetState: state.players[targetUid],
    now: 20_000,
  })
  assert.equal(afterKnockout.reason, 'ineligible-player')
})

test('pickup requires an active actor, a nearby knocked-out target, and a free carrier', () => {
  const base = {
    actorUid: 'a', targetUid: 'b', action: 'pickup', now: 10_000,
    actorPosition: { x: 100, y: 100, zone: 'island', updatedAt: 10_000 },
    targetPosition: { x: 130, y: 100, zone: 'island', updatedAt: 10_000 },
    actorOnline: true, targetOnline: true,
    actorState: { health: 100, knockout: 'alive' },
    targetState: { health: 0, knockout: 'knocked_out' },
  }
  assert.deepEqual(validateCombatInteraction(base), { ok: true, action: 'pickup' })
  assert.equal(validateCombatInteraction({ ...base, targetUid: 'a' }).reason, 'invalid-target')
  assert.equal(validateCombatInteraction({ ...base, targetState: { health: 100, knockout: 'alive' } }).reason, 'target-not-pickup-eligible')
  assert.equal(validateCombatInteraction({ ...base, actorState: { ...base.actorState, carryingUid: 'other' } }).reason, 'already-carrying')
  assert.equal(validateCombatInteraction({ ...base, targetPosition: { ...base.targetPosition, x: 200 } }).reason, 'out-of-reach')

  const pickedUp = applyResolvedCombatInteraction({}, 'a', 'b', 'pickup-one', { ok: true, action: 'pickup' }, 10_000)
  assert.equal(pickedUp.state.players.a.carryingUid, 'b')
  assert.equal(pickedUp.state.players.b.knockout, 'carried')
  assert.equal(pickedUp.state.players.b.carriedBy, 'a')
  const duplicate = applyResolvedCombatInteraction(pickedUp.state, 'a', 'b', 'pickup-one', { ok: true, action: 'pickup' }, 11_000)
  assert.equal(duplicate.reason, 'duplicate')
  assert.equal(duplicate.state.players.a.carryingUid, 'b')
})

test('throw rejects an invalid water destination and completes a server-owned cottage respawn', () => {
  const carriedState = {
    players: {
      a: { health: 100, knockout: 'alive', carryingUid: 'b' },
      b: { health: 0, knockout: 'carried', carriedBy: 'a' },
    },
    processed: {},
  }
  const base = {
    actorUid: 'a', targetUid: 'b', action: 'throw', now: 20_000,
    actorPosition: { x: 100, y: 100, zone: 'island', updatedAt: 20_000 },
    targetPosition: { x: 110, y: 100, zone: 'island', updatedAt: 20_000 },
    actorOnline: true, targetOnline: true,
    actorState: carriedState.players.a, targetState: carriedState.players.b,
  }
  assert.equal(validateCombatInteraction(base).reason, 'invalid-water-destination')
  assert.equal(validateCombatInteraction({ ...base, actorPosition: { x: 528, y: 515, zone: 'island', updatedAt: 20_000 } }).ok, true)
  assert.equal(validateCombatInteraction({ ...base, actorPosition: { x: 528, y: 515, zone: 'island', updatedAt: 20_000 }, targetPosition: { x: 110, y: 100, zone: 'island', updatedAt: 1 } }).ok, true)
  assert.equal(validateCombatInteraction({ ...base, targetState: { health: 0, knockout: 'carried', carriedBy: 'other' } }).reason, 'not-carrying-target')

  const begin = applyResolvedCombatInteraction(carriedState, 'a', 'b', 'throw-one', { ok: true, action: 'throw' }, 20_000)
  assert.equal(begin.state.players.b.health, 0)
  assert.equal(begin.state.players.b.knockout, 'respawning')
  assert.equal(begin.state.players.a.carryingUid, undefined)
  const completed = completeCombatRespawn(begin.state, 'a', 'b', 'throw-one', 20_001)
  assert.equal(completed.players.b.health, 100)
  assert.equal(completed.players.b.knockout, 'alive')
  assert.equal(completed.processed['a:throw-one'].result, 'respawned')
  assert.equal(completeCombatRespawn(completed, 'a', 'b', 'throw-one', 20_002).players.b.health, 100)
})

test('processed request records expire after their bounded deduplication window', () => {
  assert.deepEqual(cleanProcessedRequests({ old: { at: 1 }, current: { at: 1000 } }, 2000, 1500), { current: { at: 1000 } })
})
