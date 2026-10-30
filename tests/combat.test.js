import test from 'node:test'
import assert from 'node:assert/strict'
import { MAX_PLAYER_HEALTH, WEAPONS, applyDamage, attackDamage, canTransitionKnockout, clampHealth, healWhileSleeping, isWaterPoint, resolveKnockoutState } from '../src/features/world/combat.ts'
import { isNearPondWaterDestination, POND_CENTER } from '../src/features/world/pondLife.ts'

test('weapon catalog damage is fixed and health stays in bounds', () => {
  assert.deepEqual(Object.keys(WEAPONS), ['sipper', 'stick', 'sword', 'axe', 'gun'])
  assert.equal(WEAPONS.axe.damage, 30)
  assert.equal(applyDamage(100, 1000), 0)
  assert.equal(clampHealth(200), MAX_PLAYER_HEALTH)
  assert.equal(clampHealth(-1), 0)
})

test('attack validation blocks self hits, duplicate cooldowns, range and direction misses', () => {
  const base = { actorId: 'a', targetId: 'b', weapon: 'sword', origin: { x: 20, y: 20 }, facing: 'right', sentAt: 2000, nonce: 'n1' }
  assert.equal(attackDamage(base, { x: 60, y: 20 }, 'b', 'alive', 0), 20)
  assert.equal(attackDamage(base, { x: 60, y: 20 }, 'a', 'alive', 0), 0)
  assert.equal(attackDamage({ ...base, sentAt: 2500 }, { x: 60, y: 20 }, 'b', 'alive', 2000), 0)
  assert.equal(attackDamage(base, { x: 200, y: 20 }, 'b', 'alive', 0), 0)
  assert.equal(attackDamage({ ...base, facing: 'left' }, { x: 60, y: 20 }, 'b', 'alive', 0), 0)
  assert.equal(attackDamage(base, { x: 60, y: 20 }, 'b', 'knocked_out', 0), 0)
})

test('knockout and carry transitions are explicit', () => {
  assert.equal(resolveKnockoutState(0, 'alive'), 'knocked_out')
  assert.equal(canTransitionKnockout('knocked_out', 'carried'), true)
  assert.equal(canTransitionKnockout('alive', 'carried'), false)
  assert.equal(canTransitionKnockout('carried', 'thrown'), true)
  assert.equal(canTransitionKnockout('thrown', 'alive'), false)
})

test('sleep healing is gradual, capped, and inactive while awake', () => {
  assert.equal(healWhileSleeping(80, true, 15_000), 83)
  assert.equal(healWhileSleeping(99, true, 10_000), 100)
  assert.equal(healWhileSleeping(80, false, 60_000), 80)
})

test('water points use normalized pond bounds', () => {
  const pond = { x: 100, y: 100, radiusX: 50, radiusY: 25 }
  assert.equal(isWaterPoint({ x: 100, y: 100 }, pond), true)
  assert.equal(isWaterPoint({ x: 151, y: 100 }, pond), false)
})

test('water return prompt uses the existing pond edge and rejects distant land', () => {
  assert.equal(isNearPondWaterDestination({ x: POND_CENTER.x, y: POND_CENTER.y - 61 }), true)
  assert.equal(isNearPondWaterDestination({ x: POND_CENTER.x + 90, y: POND_CENTER.y }), false)
})
