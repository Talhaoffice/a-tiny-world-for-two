import type { CharacterId } from './characters.config.ts'
export type RoomPosition = { x: number; y: number }

export type HomeAnimation = 'idle' | 'walk' | 'wave' | 'sit' | 'sleep'

export const BED_CENTER = { x: 768, y: 550 }
export const BED_RADIUS = 220
export const CUDDLE_GAP = 116

export function isNearBed(position: RoomPosition) {
  return Math.hypot(position.x - BED_CENTER.x, position.y - BED_CENTER.y) <= BED_RADIUS
}

export function sleepPosition(character: CharacterId): RoomPosition {
  return character === 'talha'
    ? { x: BED_CENTER.x - 74, y: BED_CENTER.y + 55 }
    : { x: BED_CENTER.x + 74, y: BED_CENTER.y + 55 }
}

/** Stable character-to-side mapping keeps both clients' cuddle layout identical. */
export function cuddlePosition(character: CharacterId): RoomPosition {
  return character === 'talha'
    ? { x: BED_CENTER.x - CUDDLE_GAP / 2, y: BED_CENTER.y + 55 }
    : { x: BED_CENTER.x + CUDDLE_GAP / 2, y: BED_CENTER.y + 55 }
}

export function areBothAsleep(localSleeping: boolean, remoteAnimation?: string | null) {
  return localSleeping && remoteAnimation === 'sleep'
}
