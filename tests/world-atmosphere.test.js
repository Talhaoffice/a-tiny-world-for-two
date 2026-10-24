import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { atmosphereTint, isNightAt } from '../src/features/world/worldAtmosphere.ts'

describe('local island atmosphere', () => {
  it('follows the local clock in automatic mode', () => {
    assert.equal(isNightAt(5), true)
    assert.equal(isNightAt(6), false)
    assert.equal(isNightAt(12), false)
    assert.equal(isNightAt(18), false)
    assert.equal(isNightAt(19), true)
  })

  it('allows day and night overrides independent of local time', () => {
    assert.equal(isNightAt(23, 'day'), false)
    assert.equal(isNightAt(2, 'night'), true)
  })

  it('uses a subtle warm dawn tint and a deeper night tint', () => {
    assert.ok(atmosphereTint(7, 'auto').alpha > atmosphereTint(12, 'auto').alpha)
    assert.ok(atmosphereTint(22, 'auto').alpha > atmosphereTint(12, 'auto').alpha)
    assert.equal(atmosphereTint(22, 'auto').night, true)
  })
})
