import test from 'node:test'
import assert from 'node:assert/strict'
import { areBothAsleep, cuddlePosition, getCuddleLayout, getSleepPresentation, isNearBed, resolveRemoteSleepState, sleepPosition } from '../src/features/world/homeSleep.ts'
import { preserveSleepAnimation } from '../src/features/world/remotePosition.ts'

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
  assert.deepEqual(talha, { x: 753, y: 605 })
  assert.deepEqual(mannu, { x: 783, y: 605 })
  assert.equal(mannu.x - talha.x, 30)
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
  const talhaFirst = getCuddleLayout('talha', 'mannu', true)
  const mannuFirst = getCuddleLayout('mannu', 'talha', true)
  assert.ok(talhaFirst && mannuFirst)
  assert.deepEqual(talhaFirst.byCharacter, mannuFirst.byCharacter)
  assert.equal(talhaFirst.leftCharacter, mannuFirst.leftCharacter)
  assert.equal(talhaFirst.rightCharacter, mannuFirst.rightCharacter)
  assert.deepEqual(getCuddleLayout('talha', 'mannu', false), null)
})

test('the coordinated sleeping pose takes priority while both sleep and clears on wake or disconnect', () => {
  const asleep = getSleepPresentation(true, true)
  assert.equal(asleep.bothAsleep, true)
  assert.equal(asleep.localPose, 'sleep')
  assert.equal(asleep.remotePose, 'sleep')
  assert.equal(getSleepPresentation(false, true).bothAsleep, false)
  assert.equal(getSleepPresentation(true, false).bothAsleep, false)
  assert.equal(getSleepPresentation(true, false).remotePose, 'idle')
})

test('remote sleep arriving after local sleep activates cuddle; explicit wake and removal clear it', () => {
  let remoteSleeping = resolveRemoteSleepState(false, null)
  assert.equal(getSleepPresentation(true, remoteSleeping).bothAsleep, false)
  remoteSleeping = resolveRemoteSleepState(remoteSleeping, { anim: 'sleep' })
  assert.equal(getSleepPresentation(true, remoteSleeping).bothAsleep, true)
  remoteSleeping = resolveRemoteSleepState(remoteSleeping, { anim: 'idle' })
  assert.equal(getSleepPresentation(true, remoteSleeping).bothAsleep, false)
  remoteSleeping = resolveRemoteSleepState(true, null)
  assert.equal(remoteSleeping, false)
  assert.equal(getSleepPresentation(true, remoteSleeping).bothAsleep, false)
})

test('position-only updates preserve the sleep animation until an explicit wake', () => {
  assert.equal(preserveSleepAnimation('sleep', undefined), 'sleep')
  assert.equal(preserveSleepAnimation('sleep', 'idle'), 'idle')
  assert.equal(preserveSleepAnimation(undefined, undefined), undefined)
  const movementSnapshotSleep = resolveRemoteSleepState(true, {})
  assert.equal(movementSnapshotSleep, true, 'remote position movement without anim keeps its last sleep state')
  assert.equal(resolveRemoteSleepState(true, { anim: 'walk' }), false)
  const layoutBeforeMovement = getCuddleLayout('talha', 'mannu', getSleepPresentation(true, movementSnapshotSleep).bothAsleep)
  const layoutAfterMovement = getCuddleLayout('talha', 'mannu', getSleepPresentation(true, resolveRemoteSleepState(movementSnapshotSleep, {})).bothAsleep)
  assert.deepEqual(layoutAfterMovement, layoutBeforeMovement, 'overworld position-only movement cannot change the cottage cuddle layout')
})
