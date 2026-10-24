import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { canSendWorldEmote, isFreshWorldEmote, isWorldEmoteType } from '../src/features/world/worldEmotes.ts'

describe('short-lived shared emotes', () => {
  it('accepts only the small set of supported emote actions', () => {
    assert.equal(isWorldEmoteType('heart'), true)
    assert.equal(isWorldEmoteType('pond-lantern-on'), true)
    assert.equal(isWorldEmoteType('private text'), false)
  })

  it('enforces a client cooldown between sends', () => {
    assert.equal(canSendWorldEmote(1000, 3499), false)
    assert.equal(canSendWorldEmote(1000, 3500), true)
    assert.equal(canSendWorldEmote(Number.NEGATIVE_INFINITY, 0), true)
  })

  it('ignores stale or future-dated events when reconnecting', () => {
    assert.equal(isFreshWorldEmote(9500, 10_000), true)
    assert.equal(isFreshWorldEmote(1000, 10_000), false)
    assert.equal(isFreshWorldEmote(11_000, 10_000), false)
    assert.equal(isFreshWorldEmote(Number.NaN, 10_000), false)
  })
})
