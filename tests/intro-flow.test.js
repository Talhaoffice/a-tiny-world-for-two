import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { continueIntroFlow } from '../src/features/world/introFlow.ts'

describe('first-entry intro writes', () => {
  it('does not call the write function in preview mode', async () => {
    let writes = 0
    const continued = await continueIntroFlow('preview', async () => { writes += 1 })
    assert.equal(continued, false)
    assert.equal(writes, 0)
  })

  it('does not write again when re-reading the letter', async () => {
    let writes = 0
    const continued = await continueIntroFlow('read', async () => { writes += 1 })
    assert.equal(continued, false)
    assert.equal(writes, 0)
  })

  it('runs the set-once completion callback only for the first-entry flow', async () => {
    let writes = 0
    const continued = await continueIntroFlow('first-entry', async () => { writes += 1 })
    assert.equal(continued, true)
    assert.equal(writes, 1)
  })
})
