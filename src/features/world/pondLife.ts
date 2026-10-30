export const POND_CENTER = { x: 15 * 32 + 48, y: 17 * 32 + 32 }
export const POND_RADIUS = { x: 54, y: 34 }
export const POND_THROW_RADIUS = { x: POND_RADIUS.x + 24, y: POND_RADIUS.y + 28 }

export function isNearPondWaterDestination(point: { x: number; y: number }) {
  const dx = (point.x - POND_CENTER.x) / POND_THROW_RADIUS.x
  const dy = (point.y - POND_CENTER.y) / POND_THROW_RADIUS.y
  return Number.isFinite(dx) && Number.isFinite(dy) && dx * dx + dy * dy <= 1
}
export const POND_FISH_COLORS = [0x789078, 0xe9bd68, 0xc98575, 0xe8dcc5] as const
export const FISH_CATALOG = [
  { id: 'sage-minnow', name: 'Sage Minnow', color: POND_FISH_COLORS[0] },
  { id: 'amber-koi', name: 'Amber Koi', color: POND_FISH_COLORS[1] },
  { id: 'coral-comet', name: 'Coral Comet', color: POND_FISH_COLORS[2] },
  { id: 'cream-darter', name: 'Cream Darter', color: POND_FISH_COLORS[3] },
  { id: 'willow-carp', name: 'Willow Carp', color: POND_FISH_COLORS[0] },
  { id: 'sunny-rudd', name: 'Sunny Rudd', color: POND_FISH_COLORS[1] },
] as const

export const POND_DANCE_PERIOD_MS = 28_000
export const POND_DANCE_LENGTH_MS = 3_600
export const FISHING_CAST_MS = 650
export const FISHING_BITE_MS = 750
export const FISHING_RELEASE_MS = 700
export const FISHING_REEL_LIMIT_MS = 12_000
export const CATCH_ZONE_HEIGHT = 0.2

export type PondPoint = { x: number; y: number }
export type FishingStage = 'idle' | 'cast' | 'wait' | 'bite' | 'reel' | 'catch' | 'release' | 'miss'
export type FishingState = {
  stage: FishingStage
  enteredAt: number
  seed: number
  fishId: typeof FISH_CATALOG[number]['id']
  waitMs: number
  reelGoalMs: number
  reelElapsedMs: number
  fishPosition: number
  fishVelocity: number
  zoneCenter: number
  progress: number
  reducedMotion: boolean
}

function hash01(seed: number, salt: number) {
  const raw = Math.sin((seed >>> 0) * 127.1 + salt * 311.7 + 47.3) * 43_758.5453
  return raw - Math.floor(raw)
}

export function createSeededRandom(seed: number) {
  let value = seed >>> 0
  return () => {
    value = (value + 0x6d2b79f5) | 0
    let mixed = Math.imul(value ^ (value >>> 15), 1 | value)
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296
  }
}

export function chooseFish(seed: number) {
  const random = createSeededRandom(seed)
  return FISH_CATALOG[Math.floor(random() * FISH_CATALOG.length)]
}

export function getPondDance(nowMs: number, reducedMotion: boolean) {
  if (reducedMotion || !Number.isFinite(nowMs) || nowMs < 0) return null
  const cycle = Math.floor(nowMs / POND_DANCE_PERIOD_MS)
  const phase = nowMs % POND_DANCE_PERIOD_MS
  const startAt = 5_000 + Math.floor(hash01(cycle, 17) * 9_000)
  if (phase < startAt || phase >= startAt + POND_DANCE_LENGTH_MS) return null
  return { cycle, elapsedMs: phase - startAt, variant: Math.floor(hash01(cycle, 29) * 4) }
}

export function clampPondPoint(point: PondPoint, center: PondPoint = POND_CENTER, radius: PondPoint = POND_RADIUS, margin = 0.92): PondPoint {
  const dx = (point.x - center.x) / radius.x
  const dy = (point.y - center.y) / radius.y
  const distance = Math.hypot(dx, dy)
  if (distance <= margin || distance === 0) return point
  const scale = margin / distance
  return { x: center.x + dx * scale * radius.x, y: center.y + dy * scale * radius.y }
}

export function getPondFishPoint(index: number, timeMs: number, center: PondPoint = POND_CENTER, radius: PondPoint = POND_RADIUS): PondPoint {
  const angle = index * (Math.PI * 2 / 8) + Math.sin(timeMs / 2500 + index) * 0.12
  const ring = 0.26 + (index % 3) * 0.16
  const sway = Math.sin(timeMs / 1300 + index * 1.7) * 3
  return clampPondPoint({
    x: center.x + Math.cos(angle) * radius.x * ring + sway,
    y: center.y + Math.sin(angle) * radius.y * ring + Math.cos(timeMs / 1800 + index) * 2,
  }, center, radius)
}

export function startFishing(seed: number, nowMs: number, reducedMotion = false): FishingState {
  const random = createSeededRandom(seed)
  const fishIndex = Math.floor(random() * FISH_CATALOG.length)
  const waitMs = 2_000 + Math.floor(random() * 4_001)
  const reelGoalMs = 8_000 + Math.floor(random() * 4_001)
  const fishPosition = 0.2 + random() * 0.6
  const fishVelocity = (random() < 0.5 ? -1 : 1) * (0.18 + random() * 0.18)
  return {
    stage: 'cast', enteredAt: nowMs, seed, fishId: FISH_CATALOG[fishIndex].id,
    waitMs, reelGoalMs, reelElapsedMs: 0, fishPosition, fishVelocity,
    zoneCenter: 0.35, progress: 0, reducedMotion,
  }
}

export function advanceFishing(state: FishingState, nowMs: number, deltaMs: number, holding = false): FishingState {
  if (state.stage === 'cast' && nowMs - state.enteredAt >= FISHING_CAST_MS) {
    return { ...state, stage: 'wait', enteredAt: nowMs }
  }
  if (state.stage === 'wait' && nowMs - state.enteredAt >= state.waitMs) {
    return { ...state, stage: 'bite', enteredAt: nowMs }
  }
  if (state.stage === 'bite' && nowMs - state.enteredAt >= FISHING_BITE_MS) {
    return { ...state, stage: 'reel', enteredAt: nowMs, reelElapsedMs: 0 }
  }
  if (state.stage === 'reel') return advanceReel(state, deltaMs, holding, nowMs)
  if (state.stage === 'release' && nowMs - state.enteredAt >= FISHING_RELEASE_MS) {
    return { ...state, stage: 'idle', enteredAt: nowMs }
  }
  return state
}

export function advanceReel(state: FishingState, deltaMs: number, holding: boolean, nowMs = state.enteredAt): FishingState {
  if (state.stage !== 'reel') return state
  const delta = Math.max(0, Math.min(100, Number.isFinite(deltaMs) ? deltaMs : 0))
  let fishPosition = state.fishPosition + state.fishVelocity * (delta / 1_000)
  let fishVelocity = state.fishVelocity
  if (fishPosition < 0.05) { fishPosition = 0.05 + (0.05 - fishPosition); fishVelocity = Math.abs(fishVelocity) }
  if (fishPosition > 0.95) { fishPosition = 0.95 - (fishPosition - 0.95); fishVelocity = -Math.abs(fishVelocity) }
  fishPosition = Math.max(0.05, Math.min(0.95, fishPosition))
  const zoneCenter = Math.max(CATCH_ZONE_HEIGHT / 2, Math.min(1 - CATCH_ZONE_HEIGHT / 2, state.zoneCenter + (holding ? 0.72 : -0.22) * delta / 1_000))
  const reelElapsedMs = state.reelElapsedMs + delta
  const isInsideZone = Math.abs(fishPosition - zoneCenter) <= CATCH_ZONE_HEIGHT / 2
  const progress = Math.max(0, Math.min(1, state.progress + delta / state.reelGoalMs * (isInsideZone ? 1 : -0.28)))
  const next = { ...state, fishPosition, fishVelocity, zoneCenter, reelElapsedMs, progress }
  if (progress >= 1) return { ...next, stage: 'catch', enteredAt: nowMs }
  if (reelElapsedMs >= FISHING_REEL_LIMIT_MS) return { ...next, stage: 'miss', enteredAt: nowMs }
  return next
}

export function releaseFishing(state: FishingState, nowMs: number): FishingState {
  return state.stage === 'catch' ? { ...state, stage: 'release', enteredAt: nowMs } : state
}

export function retryFishing(state: FishingState, seed: number, nowMs: number, reducedMotion = state.reducedMotion): FishingState {
  return state.stage === 'miss' ? startFishing(seed, nowMs, reducedMotion) : state
}

export function cancelFishing(state: FishingState, nowMs: number): FishingState {
  return { ...state, stage: 'idle', enteredAt: nowMs, progress: 0, reelElapsedMs: 0 }
}

export function getFishById(id: FishingState['fishId']) {
  return FISH_CATALOG.find(fish => fish.id === id) ?? FISH_CATALOG[0]
}
