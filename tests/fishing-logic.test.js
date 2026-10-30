import test from 'node:test'
import assert from 'node:assert/strict'
import {
  FISHING_BITE_MS,
  FISHING_CAST_MS,
  FISHING_RELEASE_MS,
  FISH_CATALOG,
  POND_DANCE_LENGTH_MS,
  POND_DANCE_PERIOD_MS,
  advanceFishing,
  advanceReel,
  cancelFishing,
  chooseFish,
  getPondDance,
  getPondFishPoint,
  releaseFishing,
  retryFishing,
  startFishing,
} from '../src/features/world/pondLife.ts'

test('casting, waiting, biting, and reeling follow the valid state transitions', () => {
  let state = startFishing(51, 1_000)
  assert.equal(state.stage, 'cast')
  assert.equal(releaseFishing(state, 2_000).stage, 'cast', 'release is invalid before catch')
  state = advanceFishing(state, 1_000 + FISHING_CAST_MS - 1, 20)
  assert.equal(state.stage, 'cast')
  state = advanceFishing(state, 1_000 + FISHING_CAST_MS, 20)
  assert.equal(state.stage, 'wait')
  assert.ok(state.waitMs >= 2_000 && state.waitMs <= 6_000)
  assert.ok(state.reelGoalMs >= 8_000 && state.reelGoalMs <= 12_000)
  state = advanceFishing(state, state.enteredAt + state.waitMs, 20)
  assert.equal(state.stage, 'bite')
  state = advanceFishing(state, state.enteredAt + FISHING_BITE_MS, 20)
  assert.equal(state.stage, 'reel')
})

test('waiting interval does not bite before its seeded 2–6 seconds have elapsed', () => {
  let state = advanceFishing(startFishing(7, 0), FISHING_CAST_MS, 16)
  assert.equal(state.stage, 'wait')
  const waitStart = state.enteredAt
  state = advanceFishing(state, waitStart + state.waitMs - 1, 16)
  assert.equal(state.stage, 'wait')
  state = advanceFishing(state, waitStart + state.waitMs, 16)
  assert.equal(state.stage, 'bite')
})

test('reel zone stays inside bounds and moves while held or released', () => {
  const base = { ...startFishing(9, 0), stage: 'reel', fishPosition: 0.9, fishVelocity: 0 }
  const raised = advanceReel({ ...base, zoneCenter: 0.85 }, 100, true)
  assert.ok(raised.zoneCenter > 0.85 && raised.zoneCenter <= 0.9)
  const lowered = advanceReel({ ...base, zoneCenter: 0.1 }, 100, false)
  assert.equal(lowered.zoneCenter, 0.1)
})

test('holding the catch zone with the fish fills progress and catches within 8–12 seconds', () => {
  let state = { ...startFishing(2, 0), stage: 'reel', fishPosition: 0.9, fishVelocity: 0, zoneCenter: 0.9, reelElapsedMs: 0 }
  while (state.stage === 'reel' && state.reelElapsedMs < state.reelGoalMs + 100) {
    state = advanceReel(state, 100, true, state.reelElapsedMs + 100)
  }
  assert.equal(state.stage, 'catch')
  assert.equal(state.progress, 1)
  assert.ok(state.reelElapsedMs >= 8_000 && state.reelElapsedMs <= 12_000)
  state = releaseFishing(state, 13_000)
  assert.equal(state.stage, 'release')
  assert.equal(advanceFishing(state, 13_000 + FISHING_RELEASE_MS, 20).stage, 'idle')
})

test('letting the reel timer end produces a miss that can be retried', () => {
  let state = { ...startFishing(53, 0), stage: 'reel', fishPosition: 0.85, fishVelocity: 0, zoneCenter: 0.2, reelElapsedMs: 0 }
  while (state.stage === 'reel') state = advanceReel(state, 100, false, state.reelElapsedMs + 100)
  assert.equal(state.stage, 'miss')
  assert.equal(retryFishing(state, 54, 15_000).stage, 'cast')
})

test('fish selection is deterministic for a seed and stays in the catalog', () => {
  for (const seed of [1, 17, 500, 0xffffffff]) {
    assert.deepEqual(chooseFish(seed), chooseFish(seed))
    assert.ok(FISH_CATALOG.some(fish => fish.id === chooseFish(seed).id))
  }
})

test('pond fish swim points stay inside the water ellipse', () => {
  for (let index = 0; index < 8; index += 1) {
    for (const time of [0, 500, 1_000, 60_000]) {
      const point = getPondFishPoint(index, time)
      assert.ok(((point.x - 528) / 54) ** 2 + ((point.y - 576) / 34) ** 2 <= 0.92 ** 2)
    }
  }
})

test('dance phase is shared-clock deterministic and disabled for reduced motion', () => {
  let timestamp = POND_DANCE_PERIOD_MS * 3
  while (timestamp < POND_DANCE_PERIOD_MS * 4 && !getPondDance(timestamp, false)) timestamp += 100
  const dance = getPondDance(timestamp, false)
  assert.ok(dance)
  assert.deepEqual(dance, getPondDance(timestamp, false))
  assert.equal(getPondDance(timestamp, true), null)
  if (dance) assert.ok(dance.elapsedMs < POND_DANCE_LENGTH_MS)
})

test('cancel returns to idle and a miss can retry without penalties', () => {
  const start = startFishing(33, 100, true)
  assert.equal(cancelFishing(start, 120).stage, 'idle')
  const miss = { ...start, stage: 'miss' }
  assert.equal(retryFishing(miss, 34, 200).stage, 'cast')
  assert.equal(retryFishing(start, 34, 200), start)
})
