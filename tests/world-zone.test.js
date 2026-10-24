import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { positionMatchesZone } from '../src/features/world/worldZone.ts'

describe('shared room presence', () => {
  it('shows visitors only when both players occupy the same room', () => {
    assert.equal(positionMatchesZone('home', 'home'), true)
    assert.equal(positionMatchesZone('home', 'island'), false)
    assert.equal(positionMatchesZone('island', 'home'), false)
    assert.equal(positionMatchesZone('island', 'island'), true)
  })

  it('keeps legacy position records in the island zone', () => {
    assert.equal(positionMatchesZone('island', undefined), true)
    assert.equal(positionMatchesZone('home', undefined), false)
    assert.equal(positionMatchesZone('island', 'unrecognized'), true)
  })
})
