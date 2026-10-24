import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeDreamText } from '../src/features/world/dreamBoardText.ts'

describe('plain-text dream entries', () => {
  it('trims whitespace and keeps valid text unchanged', () => {
    assert.equal(normalizeDreamText('  Visit a quiet beach.  '), 'Visit a quiet beach.')
    assert.equal(normalizeDreamText('<b>literal text</b>'), '<b>literal text</b>')
  })

  it('rejects empty and overlong entries', () => {
    assert.throws(() => normalizeDreamText('   '), /between 1 and 300 characters/)
    assert.throws(() => normalizeDreamText('d'.repeat(301)), /between 1 and 300 characters/)
  })
})
