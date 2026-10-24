import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { constellationForDate } from '../src/features/world/constellation.ts'

describe('memory-date constellations', () => {
  it('makes a stable star pattern from a month and day', () => {
    assert.deepEqual(constellationForDate('06-15', 0), constellationForDate('06-15', 0))
    assert.notDeepEqual(constellationForDate('06-15', 0), constellationForDate('06-16', 0))
  })

  it('keeps its stars inside the preview field and ignores invalid dates', () => {
    const points = constellationForDate('02-29', 2)
    assert.equal(points.length, 4)
    assert.ok(points.every(point => point.x >= 0 && point.x <= 100 && point.y >= 0 && point.y <= 100))
    assert.deepEqual(constellationForDate('02-30'), [])
  })
})
