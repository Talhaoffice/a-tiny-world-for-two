import test from 'node:test'
import assert from 'node:assert/strict'
import { WEAPON_CATALOG } from '../functions/src/combatCore.js'
import { WEAPONS } from '../src/features/world/combat.ts'

test('browser weapon choices match the server-owned damage and cooldown catalog', () => {
  const clientShape = Object.fromEntries(Object.entries(WEAPONS).map(([id, item]) => [id, {
    damage: item.damage,
    range: item.range,
    cooldownMs: item.cooldownMs,
    projectile: item.projectile,
  }]))
  assert.deepEqual(clientShape, WEAPON_CATALOG)
})
