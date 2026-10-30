import type { CharacterDirection, CharacterPose } from './characters.config.ts'

export type CharacterAnimation = { pose: CharacterPose; direction: CharacterDirection; frame: number }

export function selectCharacterAnimation(
  time: number,
  moving: boolean,
  direction: CharacterDirection,
  forcedPose?: 'wave' | 'sit' | 'sleep',
): CharacterAnimation {
  if (forcedPose) return { pose: forcedPose, direction, frame: 0 }
  if (moving) return { pose: 'walk', direction, frame: Math.floor(time / 120) % 6 }
  return { pose: 'idle', direction, frame: Math.floor(time / 600) % 2 }
}
