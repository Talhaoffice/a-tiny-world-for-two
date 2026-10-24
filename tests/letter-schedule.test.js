import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { localDateTimeToDate } from '../src/features/destinations/letterSchedule.ts'

describe('local letter release time conversion', () => {
  it('converts a local time to a UTC instant without changing its wall-clock fields', () => {
    const result = localDateTimeToDate('2026-10-25T12:30', 'Asia/Kolkata')
    assert.equal(result.toISOString(), '2026-10-25T07:00:00.000Z')
  })

  it('rejects calendar-invalid values', () => {
    assert.throws(() => localDateTimeToDate('2026-02-30T12:00', 'UTC'), /valid local release date/)
    assert.throws(() => localDateTimeToDate('not-a-date', 'UTC'), /valid local release date/)
  })

  it('rejects local times skipped by a daylight-saving transition', () => {
    assert.throws(
      () => localDateTimeToDate('2026-03-08T02:30', 'America/New_York'),
      /does not exist because the clock changes/,
    )
  })

  it('rejects ambiguous local times repeated by a daylight-saving transition', () => {
    assert.throws(
      () => localDateTimeToDate('2026-11-01T01:30', 'America/New_York'),
      /occurs twice when the clock changes/,
    )
  })
})
