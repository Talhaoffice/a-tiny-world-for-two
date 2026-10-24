import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { loadLetterBodyWhenAvailable } from '../src/features/destinations/letterAvailability.ts'

describe('scheduled letter body access', () => {
  it('does not call the body loader before the release time', async () => {
    let reads = 0
    const result = await loadLetterBodyWhenAvailable(true, 20_000, 19_999, async () => { reads += 1; return 'body' })
    assert.deepEqual(result, { ready: false })
    assert.equal(reads, 0)
  })

  it('waits for a server-time estimate before allowing a recipient read', async () => {
    let reads = 0
    const result = await loadLetterBodyWhenAvailable(true, 20_000, null, async () => { reads += 1; return 'body' })
    assert.deepEqual(result, { ready: false })
    assert.equal(reads, 0)
  })

  it('loads the body at release time and lets the sender read before release', async () => {
    let reads = 0
    const released = await loadLetterBodyWhenAvailable(true, 20_000, 20_000, async () => { reads += 1; return 'body' })
    const sender = await loadLetterBodyWhenAvailable(false, 30_000, 20_000, async () => { reads += 1; return 'sender copy' })
    assert.deepEqual(released, { ready: true, body: 'body' })
    assert.deepEqual(sender, { ready: true, body: 'sender copy' })
    assert.equal(reads, 2)
  })
})
