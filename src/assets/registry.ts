import type { CharacterDirection, CharacterId, CharacterPose } from '../features/world/characters.config.ts'

/** Local illustration registry. Add future island and character art here. */
export const worldAssets = {
  cottage: 'css:cottage',
  island: 'css:island',
  fireflies: 'css:fireflies',
} as const

/**
 * Character sheet contract for replaceable PNG art: 32x40 frames, 6 columns,
 * and 16 rows. Row order is pose (idle, walk, wave, sit), then direction
 * (down, left, right, up). Idle uses frames 0-1, walk uses 0-5, and wave/sit
 * use frame 0; unused cells stay transparent.
 */
export const CHARACTER_SPRITE_SHEET_LAYOUT = {
  frameWidth: 32,
  frameHeight: 40,
  columns: 6,
  directions: ['down', 'left', 'right', 'up'] as const,
  poses: ['idle', 'walk', 'wave', 'sit'] as const,
} as const

export function characterFrameIndex(pose: CharacterPose, direction: CharacterDirection, frame: number) {
  const row = CHARACTER_SPRITE_SHEET_LAYOUT.poses.indexOf(pose) * CHARACTER_SPRITE_SHEET_LAYOUT.directions.length
    + CHARACTER_SPRITE_SHEET_LAYOUT.directions.indexOf(direction)
  return row * CHARACTER_SPRITE_SHEET_LAYOUT.columns + frame
}

export function characterTextureKey(
  character: CharacterId,
  pose: CharacterPose,
  direction: CharacterDirection,
  frame = 0,
) {
  return `character/${character}/${pose}/${direction}/${frame}`
}

export function emoteBubbleTextureKey(character: CharacterId) {
  return `character/${character}/emote-bubble`
}
