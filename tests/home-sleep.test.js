import test from 'node:test'
import assert from 'node:assert/strict'
import { areBothAsleep, isNearBed, sleepPosition } from '../src/features/world/homeSleep.ts'

test('the cottage bed interaction area is bounded around the bed', () => {
  assert.equal(isNearBed({ x: 768, y: 550 }), true)
  assert.equal(isNearBed({ x: 988, y: 550 }), true)
  assert.equal(isNearBed({ x: 989, y: 550 }), false)
})

test('sleep spots reserve one side of the bed for each character', () => {
  assert.deepEqual(sleepPosition('talha'), { x: 694, y: 605 })
  assert.deepEqual(sleepPosition('mannu'), { x: 842, y: 605 })
})

test('the night scene begins only when the local and remote players sleep', () => {
  assert.equal(areBothAsleep(false, 'sleep'), false)
  assert.equal(areBothAsleep(true, 'idle'), false)
  assert.equal(areBothAsleep(true, 'sleep'), true)
  assert.equal(areBothAsleep(true, null), false)
})
