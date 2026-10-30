import assert from 'node:assert/strict'
import test from 'node:test'
import {
  dispatchRemotePosition,
  LatestRemotePositionQueue,
  resolveRemoteLook,
  validateRemotePosition,
} from '../src/features/world/remotePosition.ts'
import { MANNU_DEFAULT_LOOK } from '../src/features/world/appearanceCatalog.ts'

test('queues the latest position until the character handler is ready, then applies it', () => {
  const queue = new LatestRemotePositionQueue()
  const applied = []
  queue.set({ uid: 'peer', x: 10, y: 20, updatedAt: 1 })
  queue.set({ uid: 'peer', x: 15, y: 25, updatedAt: 2 })
  assert.equal(queue.size, 1)
  for (const position of queue.drain()) applied.push(position)
  assert.deepEqual(applied, [{ uid: 'peer', x: 15, y: 25, updatedAt: 2 }])
  assert.equal(queue.size, 0)
})

test('retains one latest queued position for each peer key', () => {
  const queue = new LatestRemotePositionQueue()
  queue.set({ uid: 'a', x: 1 })
  queue.set({ uid: 'b', x: 2 })
  queue.set({ uid: 'a', x: 3 })
  assert.deepEqual(queue.drain(), [{ uid: 'a', x: 3 }, { uid: 'b', x: 2 }])
})

test('rejects malformed coordinates, timestamps, direction, animation, and peer keys', () => {
  const valid = { uid: 'peer', x: 10, y: 20, updatedAt: 123 }
  assert.equal(validateRemotePosition(valid, 'peer'), true)
  for (const invalid of [
    { ...valid, x: Number.NaN }, { ...valid, y: 1025 }, { ...valid, updatedAt: Infinity },
    { ...valid, dir: 'diagonal' }, { ...valid, anim: 'dance' }, { ...valid, uid: 'other' },
  ]) assert.equal(validateRemotePosition(invalid, 'peer'), false)
})

test('does not invoke handlers after disposal', () => {
  let invoked = false
  assert.equal(dispatchRemotePosition(() => { invoked = true }, {}, true, () => {}), false)
  assert.equal(invoked, false)
})

test('contains a throwing callback so a later event can still be delivered', () => {
  const errors = []
  const applied = []
  assert.equal(dispatchRemotePosition(() => { throw new Error('scene not ready') }, 1, false, error => errors.push(error)), false)
  assert.equal(dispatchRemotePosition(value => applied.push(value), 2, false, error => errors.push(error)), true)
  assert.equal(errors.length, 1)
  assert.deepEqual(applied, [2])
})

test('uses the catalog default when a saved remote look is unavailable', () => {
  assert.equal(resolveRemoteLook(undefined, MANNU_DEFAULT_LOOK), MANNU_DEFAULT_LOOK)
  assert.deepEqual(resolveRemoteLook({ skin: 2 }, MANNU_DEFAULT_LOOK), { skin: 2 })
})
