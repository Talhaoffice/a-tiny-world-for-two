import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { characterFrameIndex } from '../src/assets/registry.ts'
import { selectCharacterAnimation } from '../src/features/world/characterAnimation.ts'
import { characters, isCharacterAppearance, resolveCharacterIds } from '../src/features/world/characters.config.ts'

describe('character animation selection', () => {
  it('selects both idle frames for all four directions', () => {
    for (const direction of ['down', 'left', 'right', 'up']) {
      assert.deepEqual(selectCharacterAnimation(0, false, direction), { pose: 'idle', direction, frame: 0 })
      assert.deepEqual(selectCharacterAnimation(600, false, direction), { pose: 'idle', direction, frame: 1 })
    }
  })

  it('cycles through six walk frames while keeping the requested direction', () => {
    assert.deepEqual(selectCharacterAnimation(360, true, 'left'), { pose: 'walk', direction: 'left', frame: 3 })
    assert.deepEqual(selectCharacterAnimation(720, true, 'up'), { pose: 'walk', direction: 'up', frame: 0 })
  })

  it('selects the fixed wave and sit poses', () => {
    assert.deepEqual(selectCharacterAnimation(999, true, 'right', 'wave'), { pose: 'wave', direction: 'right', frame: 0 })
    assert.deepEqual(selectCharacterAnimation(999, false, 'down', 'sit'), { pose: 'sit', direction: 'down', frame: 0 })
  })

  it('selects the layered sleeping pose with a fixed frame', () => {
    assert.deepEqual(selectCharacterAnimation(999, false, 'down', 'sleep'), { pose: 'sleep', direction: 'down', frame: 0 })
  })

  it('keeps a row-major six-column sprite sheet layout for all poses and directions', () => {
    assert.equal(characterFrameIndex('idle', 'down', 0), 0)
    assert.equal(characterFrameIndex('idle', 'up', 1), 19)
    assert.equal(characterFrameIndex('walk', 'down', 0), 24)
    assert.equal(characterFrameIndex('wave', 'left', 0), 54)
    assert.equal(characterFrameIndex('sit', 'up', 0), 90)
    assert.equal(characterFrameIndex('sleep', 'down', 0), 96)
  })

  it('defines distinct default identities and validates profile appearance enums', () => {
    assert.equal(characters.talha.defaultAppearance.hair, 'short')
    assert.equal(characters.talha.defaultAppearance.outfit, 'jacket')
    assert.equal(characters.mannu.defaultAppearance.hair, 'long')
    assert.equal(characters.mannu.defaultAppearance.outfit, 'cardigan')
    assert.equal(isCharacterAppearance({ hair: 'long', outfit: 'dress', accessory: 'sage-accent' }), true)
    assert.equal(isCharacterAppearance({ hair: 'unknown', outfit: 'jacket', accessory: 'none' }), false)
    assert.equal(isCharacterAppearance({ hair: 'short', outfit: 'jacket', accessory: 'none', extra: true }), false)
  })

  it('maps only the authenticated UID among the two active roster IDs', () => {
    assert.deepEqual(resolveCharacterIds('fixture-a', ['fixture-a', 'fixture-b'], 'fixture-a', 'fixture-b'), {
      localId: 'talha', remoteId: 'mannu', remoteUid: 'fixture-b',
    })
    assert.deepEqual(resolveCharacterIds('fixture-b', ['fixture-a', 'fixture-b'], 'fixture-a', 'fixture-b'), {
      localId: 'mannu', remoteId: 'talha', remoteUid: 'fixture-a',
    })
    assert.equal(resolveCharacterIds('unlisted-fixture', ['fixture-a', 'fixture-b'], 'fixture-a', 'fixture-b'), null)
    assert.equal(resolveCharacterIds('fixture-a', ['fixture-a'], 'fixture-a', 'fixture-b'), null)
  })
})
