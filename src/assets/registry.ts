import type { CharacterDirection, CharacterId, CharacterPose } from '../features/world/characters.config.ts'

/** Local illustration registry. Add future island and character art here. */
export const worldAssets = {
  cottage: 'css:cottage',
  island: 'css:island',
  fireflies: 'css:fireflies',
} as const

/**
 * Master pixel-art palette (source of truth).
 * All sprites and props use only these colours.
 * Ramps: shadow → base → light → highlight per hue.
 */
export const PALETTE = {
  // Midnight ramp
  midnightDeep:   0x192d39,
  midnight:       0x263747,
  midnightLight:  0x354a5c,
  midnightHigh:   0x4a6278,
  // Sage ramp
  sageShadow:     0x5a6e5a,
  sage:           0x789078,
  sageLight:      0x96a896,
  sageHigh:       0xb4c4b4,
  // Cream ramp
  creamShadow:    0xc8b898,
  cream:          0xe8dcc5,
  creamLight:     0xf4eedd,
  creamHigh:      0xfffbf0,
  // Terracotta ramp
  terraShadow:    0x9b5d50,
  terra:          0xc98575,
  terraLight:     0xd9a08c,
  terraHigh:      0xeabca8,
  // Lantern gold ramp
  goldShadow:     0xb8924a,
  gold:           0xe9bd68,
  goldLight:      0xf4d088,
  goldHigh:       0xfce8b0,
  // Outline (near-black, never pure black)
  outline:        0x192d39,
} as const

/**
 * Character sheet contract for replaceable PNG art: 32×40 frames, 6 columns,
 * and 20 rows. Row order is pose (idle, walk, wave, sit, sleep), then direction
 * (down, left, right, up). Idle uses frames 0–1, walk uses 0–5, and wave/sit/sleep
 * use frame 0; unused cells stay transparent.
 *
 * To replace with hand-drawn PNG: provide a spritesheet with this exact layout.
 * characterTextureKey() maps pose+direction+frame → Phaser texture key string,
 * which is also the expected row×column index if using a spritesheet loader.
 */
export const CHARACTER_SPRITE_SHEET_LAYOUT = {
  frameWidth: 32,
  frameHeight: 40,
  columns: 6,
  directions: ['down', 'left', 'right', 'up'] as const,
  poses: ['idle', 'walk', 'wave', 'sit', 'sleep'] as const,
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
  lookKey?: string,
) {
  if (lookKey) {
    return `character/${character}/${lookKey}/${pose}/${direction}/${frame}`
  }
  return `character/${character}/${pose}/${direction}/${frame}`
}

export function emoteBubbleTextureKey(character: CharacterId) {
  return `character/${character}/emote-bubble`
}
