import test from 'node:test'
import assert from 'node:assert/strict'
import { areBothAsleep, cuddlePosition, getSleepPresentation, isNearBed, sleepPosition } from '../src/features/world/homeSleep.ts'

test('the cottage bed interaction area is bounded around the bed', () => {
  assert.equal(isNearBed({ x: 768, y: 550 }), true)
  assert.equal(isNearBed({ x: 988, y: 550 }), true)
  assert.equal(isNearBed({ x: 989, y: 550 }), false)
})

test('sleep spots reserve one side of the bed for each character', () => {
  assert.deepEqual(sleepPosition('talha'), { x: 694, y: 605 })
  assert.deepEqual(sleepPosition('mannu'), { x: 842, y: 605 })
})

test('cuddle positions are stable, close together, and inside the bed', () => {
  const talha = cuddlePosition('talha')
  const mannu = cuddlePosition('mannu')
  assert.deepEqual(talha, { x: 732, y: 605 })
  assert.deepEqual(mannu, { x: 804, y: 605 })
  assert.equal(mannu.x - talha.x, 72)
  for (const [character, position] of [['talha', talha], ['mannu', mannu]]) {
    assert.ok(position.x >= 632 && position.x <= 904)
    assert.ok(position.y >= 505 && position.y <= 674)
    assert.deepEqual(cuddlePosition(character), position)
  }
})

test('the night scene begins only when the local and remote players sleep', () => {
  assert.equal(areBothAsleep(false, 'sleep'), false)
  assert.equal(areBothAsleep(true, 'idle'), false)
  assert.equal(areBothAsleep(true, 'sleep'), true)
  assert.equal(areBothAsleep(true, null), false)
})

test('cuddle state starts and ends with both players sleeping', () => {
  assert.equal(areBothAsleep(false, 'sleep'), false, 'remote sleeping alone does not cuddle')
  assert.equal(areBothAsleep(true, 'idle'), false, 'local sleeping alone does not cuddle')
  assert.equal(areBothAsleep(true, 'sleep'), true)
  assert.equal(areBothAsleep(true, null), false, 'disconnect removes the shared cuddle state')
  assert.equal(areBothAsleep(true, 'idle'), false, 'a remote wake restores separate positions')
})

test('both clients derive the same character ordering regardless of local identity', () => {
  const talhaFirst = { talha: cuddlePosition('talha'), mannu: cuddlePosition('mannu') }
  const mannuFirst = { mannu: cuddlePosition('mannu'), talha: cuddlePosition('talha') }
  assert.deepEqual(talhaFirst, mannuFirst)
  assert.ok(talhaFirst.talha.x < talhaFirst.mannu.x)
})

test('the coordinated sleeping pose takes priority while both sleep and clears on wake or disconnect', () => {
  const asleep = getSleepPresentation(true, 'sleep')
  assert.equal(asleep.bothAsleep, true)
  assert.equal(asleep.localPose, 'sleep')
  assert.equal(asleep.remotePose, 'sleep')
  assert.equal(getSleepPresentation(false, 'sleep').bothAsleep, false)
  assert.equal(getSleepPresentation(true, 'idle').bothAsleep, false)
  assert.equal(getSleepPresentation(true, null).remotePose, 'idle')
})
