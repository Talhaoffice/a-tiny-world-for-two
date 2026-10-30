import Phaser from 'phaser'
import { characterTextureKey, emoteBubbleTextureKey } from '../../assets/registry'
import type { CharacterDirection, CharacterPose, CharacterConfig } from './characters.config'
import { selectCharacterAnimation } from './characterAnimation'
import type { CharacterRoster, ResolvedCharacter } from './characterRoster'
import type { RemotePlayerPosition } from './IslandScene'
import type { WorldEmoteType } from './worldEmotes'
import { logError } from '../../lib/logger'
import {
  ACCESSORIES,
  BOTTOMS,
  CLOTH_TINTS,
  EYE_COLORS,
  HAIR_COLORS,
  HAIR_STYLES,
  HATS,
  SHOES,
  SKIN_TONES,
  TOPS,
  getLookKey,
  migrateOldAppearance,
  TALHA_DEFAULT_LOOK,
  MANNU_DEFAULT_LOOK,
  type PlayerLook,
} from './appearanceCatalog'

export type MoodLanternColor = 'off' | 'gold' | 'rose' | 'sage'

function createCharacterPlaceholder(scene: Phaser.Scene, key: string, width = 32, height = 40) {
  if (scene.textures.exists(key)) return
  const graphics = scene.make.graphics({ x: 0, y: 0 }, false)
  graphics.fillStyle(0x192d39, 1).fillRect(7, 2, width - 14, height - 4)
  graphics.fillStyle(0xe9bd68, 1).fillRect(10, 5, width - 20, 8)
  graphics.fillStyle(0x789078, 1).fillRect(9, 15, width - 18, height - 22)
  graphics.generateTexture(key, width, height)
  graphics.destroy()
}

function createCharacterPlaceholderSet(scene: Phaser.Scene, characterId: 'talha' | 'mannu', lookKey?: string) {
  const directions: CharacterDirection[] = ['down', 'left', 'right', 'up']
  const poses: CharacterPose[] = ['idle', 'walk', 'wave', 'sit']
  const frameCounts: Record<CharacterPose, number> = { idle: 2, walk: 6, wave: 1, sit: 1 }
  for (const pose of poses) {
    for (const direction of directions) {
      for (let frame = 0; frame < frameCounts[pose]; frame += 1) {
        createCharacterPlaceholder(scene, characterTextureKey(characterId, pose, direction, frame, lookKey))
      }
    }
  }
}

export function createCharacterFallbackTextures(scene: Phaser.Scene, roster: CharacterRoster) {
  for (const character of [roster.local, roster.remote]) {
    const defaults = character.config.id === 'talha' ? TALHA_DEFAULT_LOOK : MANNU_DEFAULT_LOOK
    const look = migrateOldAppearance(character.appearance, defaults)
    createCharacterPlaceholderSet(scene, character.config.id)
    createCharacterPlaceholderSet(scene, character.config.id, getLookKey(look))
  }
}

// ─── Texture cache ────────────────────────────────────────────────────────────
const MAX_CACHED_LOOKS = 16
const cachedLookKeys: string[] = []

export function ensureCharacterLookTextures(
  scene: Phaser.Scene,
  characterId: 'talha' | 'mannu',
  look: Omit<PlayerLook, 'updatedAt'>,
  _config?: CharacterConfig,
) {
  const lKey = getLookKey(look)
  const fullCacheKey = `${characterId}:${lKey}`

  // If already generated and cached, bump to front of LRU
  const existingIndex = cachedLookKeys.indexOf(fullCacheKey)
  if (existingIndex !== -1) {
    cachedLookKeys.splice(existingIndex, 1)
    cachedLookKeys.push(fullCacheKey)
    return
  }

  // Capped cache eviction
  if (cachedLookKeys.length >= MAX_CACHED_LOOKS) {
    const oldest = cachedLookKeys.shift()
    if (oldest) {
      const [oldChar, oldLookKey] = oldest.split(':')
      const directions: CharacterDirection[] = ['down', 'left', 'right', 'up']
      const poses: CharacterPose[] = ['idle', 'walk', 'wave', 'sit']
      const frameCounts: Record<CharacterPose, number> = { idle: 2, walk: 6, wave: 1, sit: 1 }
      for (const p of poses) {
        for (const d of directions) {
          for (let f = 0; f < frameCounts[p]; f += 1) {
            const oldKey = characterTextureKey(oldChar as 'talha' | 'mannu', p, d, f, oldLookKey)
            if (scene.textures.exists(oldKey)) {
              scene.textures.remove(oldKey)
            }
          }
        }
      }
    }
  }

  cachedLookKeys.push(fullCacheKey)

  // Generate 40 frames for this look
  const directions: CharacterDirection[] = ['down', 'left', 'right', 'up']
  const poses: CharacterPose[] = ['idle', 'walk', 'wave', 'sit']
  const frameCounts: Record<CharacterPose, number> = { idle: 2, walk: 6, wave: 1, sit: 1 }
  const bw = characterId === 'talha' ? 2 : 0

  for (const pose of poses) {
    for (const direction of directions) {
      for (let frame = 0; frame < frameCounts[pose]; frame += 1) {
        const key = characterTextureKey(characterId, pose, direction, frame, lKey)
        if (!scene.textures.exists(key)) {
          try {
            drawLayeredCharacterTexture(scene, key, look, bw, pose, direction, frame)
          } catch (error) {
            logError(error, 'art/player-look-texture')
            createCharacterPlaceholder(scene, key)
          }
        }
      }
    }
  }
}

// ─── Texture generation for roster ────────────────────────────────────────────

export function createCharacterTextures(scene: Phaser.Scene, roster: CharacterRoster) {
  for (const character of [roster.local, roster.remote]) {
    try {
      createCharacterAppearanceTextures(scene, character)
    } catch (error) {
      logError(error, 'art/character-textures')
      createCharacterPlaceholderSet(scene, character.config.id)
    }
  }

  // Generate initial look textures
  const localDefaults = roster.local.config.id === 'talha' ? TALHA_DEFAULT_LOOK : MANNU_DEFAULT_LOOK
  const remoteDefaults = roster.remote.config.id === 'talha' ? TALHA_DEFAULT_LOOK : MANNU_DEFAULT_LOOK
  const localLook = migrateOldAppearance(roster.local.appearance, localDefaults)
  const remoteLook = migrateOldAppearance(roster.remote.appearance, remoteDefaults)

  try { ensureCharacterLookTextures(scene, roster.local.config.id, localLook, roster.local.config) }
  catch (error) {
    logError(error, 'art/local-look-textures')
    createCharacterPlaceholderSet(scene, roster.local.config.id, getLookKey(localLook))
  }
  try { ensureCharacterLookTextures(scene, roster.remote.config.id, remoteLook, roster.remote.config) }
  catch (error) {
    logError(error, 'art/remote-look-textures')
    createCharacterPlaceholderSet(scene, roster.remote.config.id, getLookKey(remoteLook))
  }

  for (const character of [roster.local, roster.remote]) {
    try {
      drawEmoteBubble(scene, emoteBubbleTextureKey(character.config.id), character.config.palette.gold)
    } catch (error) {
      logError(error, 'art/emote-texture')
      createCharacterPlaceholder(scene, emoteBubbleTextureKey(character.config.id), 24, 24)
    }
  }
}

export function createCharacterAppearanceTextures(scene: Phaser.Scene, character: ResolvedCharacter) {
  const directions: CharacterDirection[] = ['down', 'left', 'right', 'up']
  const poses: CharacterPose[] = ['idle', 'walk', 'wave', 'sit']
  const frameCounts: Record<CharacterPose, number> = { idle: 2, walk: 6, wave: 1, sit: 1 }
  for (const pose of poses) {
    for (const direction of directions) {
      for (let frame = 0; frame < frameCounts[pose]; frame += 1) {
        const key = characterTextureKey(character.config.id, pose, direction, frame)
        try {
          drawLegacyCharacterTexture(scene, key, character, pose, direction, frame)
        } catch (error) {
          logError(error, 'art/legacy-character-texture')
          createCharacterPlaceholder(scene, key)
        }
      }
    }
  }
}

// ─── Pixel art helpers ────────────────────────────────────────────────────────

function px(
  g: Phaser.GameObjects.Graphics,
  color: number,
  x: number, y: number, w: number, h: number,
  shade?: number,
) {
  g.fillStyle(color, 1).fillRect(x, y, w, h)
  if (shade !== undefined && w > 1 && h > 1) {
    g.fillStyle(shade, 1).fillRect(x + w - 1, y, 1, h)
    g.fillStyle(shade, 1).fillRect(x, y + h - 1, w - 1, 1)
  }
}

function dot(g: Phaser.GameObjects.Graphics, color: number, x: number, y: number) {
  g.fillStyle(color, 1).fillRect(x, y, 1, 1)
}

function mixDark(color: number, amt = 0x18): number {
  const r = Math.max(0, ((color >> 16) & 0xff) - amt)
  const g2 = Math.max(0, ((color >> 8) & 0xff) - amt)
  const b = Math.max(0, (color & 0xff) - amt)
  return (r << 16) | (g2 << 8) | b
}

function lighten(color: number, amt = 0x18): number {
  const r = Math.min(255, ((color >> 16) & 0xff) + amt)
  const g2 = Math.min(255, ((color >> 8) & 0xff) + amt)
  const b = Math.min(255, (color & 0xff) + amt)
  return (r << 16) | (g2 << 8) | b
}

// ─── Layered character drawing (Palette-ramp recoloring) ──────────────────────

function drawLayeredCharacterTexture(
  scene: Phaser.Scene,
  key: string,
  look: Omit<PlayerLook, 'updatedAt'>,
  bw: number,
  pose: CharacterPose,
  direction: CharacterDirection,
  frame: number,
) {
  const g = scene.make.graphics({ x: 0, y: 0 }, false)

  const outline = 0x192d39
  const skin = SKIN_TONES[look.skin] || SKIN_TONES[0]
  const skinColor = skin.color
  const skinShadow = skin.shadow
  const skinLight = lighten(skinColor, 0x12)

  const hair = HAIR_COLORS[look.hairColor] || HAIR_COLORS[0]
  const hairColor = hair.color
  const hairShadow = mixDark(hairColor)
  const hairHighlight = lighten(hairColor, 0x20)

  const topColor = CLOTH_TINTS[look.topColor]?.color ?? 0x263b58
  const topShadow = mixDark(topColor)
  const topLight = lighten(topColor, 0x14)

  const bottomColor = CLOTH_TINTS[look.bottomColor]?.color ?? 0x435464
  const bottomShadow = mixDark(bottomColor)

  const shoeColor = CLOTH_TINTS[look.shoesColor]?.color ?? 0x2c2c2c
  const shoeShadow = mixDark(shoeColor)

  const sitting = pose === 'sit'
  const breathBob = (pose === 'idle' && frame === 1) ? 1 : 0
  const bodyTop = (sitting ? 20 : 17) + breathBob
  const gait = pose === 'walk' ? ([-2, -1, 1, 2, 1, -1] as const)[frame as 0|1|2|3|4|5] : 0

  const hx = 9 - Math.floor(bw / 2)
  const hw = 14 + bw
  const faceX = 10 - Math.floor(bw / 2)
  const faceW = 12 + bw
  const bodyX = 8 - Math.floor(bw / 2)
  const bodyW = 16 + bw

  const hairStyle = HAIR_STYLES[look.hairStyle]?.id ?? 'short-crop'
  const isLongHair = hairStyle === 'long-straight' || hairStyle === 'long-wavy' || hairStyle === 'messy-long'

  // ── 1. Hair back layer (drawn behind head for long styles) ────────────────
  if (isLongHair) {
    px(g, outline, hx - 1, 3, hw + 2, 17)
    px(g, hairColor, hx, 3, hw, 14, hairHighlight)
    px(g, hairColor, hx - 1, 10, 3, 10)
    px(g, hairColor, hx + hw - 2, 10, 3, 10)
  }

  // ── 2. Face / Head ─────────────────────────────────────────────────────────
  px(g, skinColor, faceX, 6, faceW, 10, skinShadow)
  dot(g, skinLight, faceX + 1, 7)
  dot(g, skinLight, faceX + 2, 7)

  // Eyes & Mouth
  const eyeColor = EYE_COLORS[look.eyes]?.color ?? 0x3d2b1f
  if (direction === 'down') {
    px(g, eyeColor, faceX + 2, 10, 2, 2)
    px(g, eyeColor, faceX + faceW - 4, 10, 2, 2)
    dot(g, 0xc0806a, faceX + Math.floor(faceW / 2) - 1, 13)
    dot(g, 0xc0806a, faceX + Math.floor(faceW / 2), 13)
  } else if (direction === 'up') {
    // Back of head covered in hair
    px(g, hairColor, faceX - 1, 5, faceW + 2, 11)
  } else {
    const eyeX = direction === 'right' ? faceX + faceW - 4 : faceX + 2
    px(g, eyeColor, eyeX, 10, 2, 2)
    const noseX = direction === 'right' ? faceX + faceW - 1 : faceX
    dot(g, skinShadow, noseX, 12)
  }

  // ── 3. Neck ────────────────────────────────────────────────────────────────
  const neckX = faceX + Math.floor(faceW / 2) - 2
  px(g, skinColor, neckX, 16, 4, 2, skinShadow)

  // ── 4. Torso & Bottoms ─────────────────────────────────────────────────────
  const bottomStyle = BOTTOMS[look.bottom]?.id ?? 'trousers'

  if (bottomStyle === 'dress') {
    px(g, outline, bodyX - 1, bodyTop, bodyW + 2, 8)
    px(g, topColor, bodyX, bodyTop + 1, bodyW, 7, topShadow)
    // Flared skirt
    px(g, outline, bodyX - 2, bodyTop + 8, bodyW + 4, 7)
    px(g, bottomColor, bodyX - 1, bodyTop + 9, bodyW + 2, 6, bottomShadow)
    // Collar accent
    px(g, 0xe8dcc5, bodyX + 2, bodyTop + 1, 3, 3)
  } else if (bottomStyle === 'skirt') {
    px(g, outline, bodyX - 1, bodyTop, bodyW + 2, 8)
    px(g, topColor, bodyX, bodyTop + 1, bodyW, 7, topShadow)
    // Skirt
    px(g, outline, bodyX - 2, bodyTop + 8, bodyW + 4, 7)
    px(g, bottomColor, bodyX - 1, bodyTop + 9, bodyW + 2, 6, bottomShadow)
  } else {
    // Jacket / Cardigan / Hoodie / Sweater / Shirt / Kurta
    const topStyle = TOPS[look.top]?.id ?? 'jacket'
    px(g, outline, bodyX - 1, bodyTop, bodyW + 2, 13)
    px(g, topColor, bodyX, bodyTop + 1, bodyW, 12, topShadow)

    const midX = bodyX + Math.floor(bodyW / 2)
    if (topStyle === 'jacket') {
      px(g, outline, midX, bodyTop + 1, 1, 12)
      px(g, 0xe9bd68, midX - 1, bodyTop + 3, 3, 2)
      px(g, 0xe8dcc5, bodyX, bodyTop + 1, 3, 2)
      px(g, 0xe8dcc5, bodyX + bodyW - 3, bodyTop + 1, 3, 2)
    } else if (topStyle === 'cardigan') {
      px(g, 0x789078, bodyX, bodyTop + 1, 2, 11)
      px(g, 0x789078, bodyX + bodyW - 2, bodyTop + 1, 2, 11)
      px(g, 0xe8dcc5, bodyX + 2, bodyTop + 2, bodyW - 4, 9)
    } else if (topStyle === 'hoodie') {
      // Kangaroo pocket
      px(g, topShadow, bodyX + 2, bodyTop + 7, bodyW - 4, 4)
      dot(g, 0xe8dcc5, midX - 2, bodyTop + 3)
      dot(g, 0xe8dcc5, midX + 2, bodyTop + 3)
    } else if (topStyle === 'sweater') {
      // Ribbed collar & hem
      px(g, topShadow, bodyX, bodyTop + 11, bodyW, 1)
      px(g, topLight, bodyX + 2, bodyTop + 1, bodyW - 4, 2)
    } else if (topStyle === 'shirt') {
      // Button placket
      px(g, outline, midX, bodyTop + 1, 1, 12)
      dot(g, 0xf0ece4, midX, bodyTop + 3)
      dot(g, 0xf0ece4, midX, bodyTop + 6)
      dot(g, 0xf0ece4, midX, bodyTop + 9)
    } else if (topStyle === 'kurta') {
      // Mandarin collar
      px(g, topShadow, bodyX + 1, bodyTop, bodyW - 2, 2)
      px(g, outline, midX, bodyTop + 2, 1, 8)
    }
  }

  // ── 5. Arms ────────────────────────────────────────────────────────────────
  const armLen = 9
  if (pose === 'wave') {
    const waveLeft = direction === 'left'
    const rxUp = waveLeft ? bodyX - 4 : bodyX + bodyW
    px(g, outline, rxUp, bodyTop - 8, 4, 10)
    px(g, topColor, rxUp + 1, bodyTop - 7, 2, 8, topShadow)
    px(g, skinColor, rxUp, bodyTop - 11, 4, 4)

    const rxRest = waveLeft ? bodyX + bodyW : bodyX - 4
    px(g, outline, rxRest, bodyTop + 2, 4, armLen)
    px(g, topColor, rxRest + 1, bodyTop + 2, 2, armLen - 2, topShadow)
  } else {
    const leftArmX = bodyX - 4 - Math.max(0, gait)
    const rightArmX = bodyX + bodyW + Math.max(0, -gait)
    px(g, outline, leftArmX, bodyTop + 2, 4, armLen)
    px(g, topColor, leftArmX + 1, bodyTop + 2, 2, armLen - 2, topShadow)
    dot(g, skinColor, leftArmX + 1, bodyTop + armLen)

    px(g, outline, rightArmX, bodyTop + 2, 4, armLen)
    px(g, topColor, rightArmX + 1, bodyTop + 2, 2, armLen - 2, topShadow)
    dot(g, skinColor, rightArmX + 1, bodyTop + armLen)
  }

  // ── 6. Legs & Feet ─────────────────────────────────────────────────────────
  const legShade = bottomStyle === 'shorts' ? skinShadow : bottomShadow
  const legColor = bottomStyle === 'shorts' ? skinColor : bottomColor

  if (sitting) {
    px(g, outline, bodyX, 30, Math.floor(bodyW / 2) - 1, 5)
    px(g, legColor, bodyX + 1, 31, Math.floor(bodyW / 2) - 2, 4, legShade)
    px(g, outline, bodyX + Math.floor(bodyW / 2) + 1, 30, Math.floor(bodyW / 2) - 1, 5)
    px(g, legColor, bodyX + Math.floor(bodyW / 2) + 2, 31, Math.floor(bodyW / 2) - 2, 4, legShade)

    px(g, outline, bodyX - 1, 34, 7, 4)
    px(g, shoeColor, bodyX, 35, 5, 3, shoeShadow)
    px(g, outline, bodyX + bodyW - 6, 34, 7, 4)
    px(g, shoeColor, bodyX + bodyW - 5, 35, 5, 3, shoeShadow)
  } else {
    const lLegY = 29 + Math.max(0, gait)
    const rLegY = 29 + Math.max(0, -gait)
    const legW = 5 + Math.floor(bw / 2)
    px(g, outline, bodyX + 1, lLegY, legW, 6)
    px(g, legColor, bodyX + 2, lLegY + 1, legW - 2, 5, legShade)
    px(g, outline, bodyX + bodyW - legW - 1, rLegY, legW, 6)
    px(g, legColor, bodyX + bodyW - legW, rLegY + 1, legW - 2, 5, legShade)

    // Shoes
    const lShoeX = bodyX + Math.max(0, -gait)
    const rShoeX = bodyX + bodyW - 7 + Math.max(0, gait)
    px(g, outline, lShoeX, 34, 7, 4)
    px(g, shoeColor, lShoeX + 1, 35, 5, 3, shoeShadow)
    px(g, outline, rShoeX, 34, 7, 4)
    px(g, shoeColor, rShoeX + 1, 35, 5, 3, shoeShadow)

    const shoeStyle = SHOES[look.shoes]?.id ?? 'boots'
    if (shoeStyle === 'boots') {
      dot(g, lighten(shoeColor, 0x18), lShoeX + 1, 34)
      dot(g, lighten(shoeColor, 0x18), rShoeX + 1, 34)
    } else if (shoeStyle === 'sneakers') {
      // White sole stripe
      px(g, 0xf0ece4, lShoeX + 1, 37, 5, 1)
      px(g, 0xf0ece4, rShoeX + 1, 37, 5, 1)
    }
  }

  // ── 7. Hair front layer ────────────────────────────────────────────────────
  px(g, outline, hx - 1, 2, hw + 2, 7)
  px(g, hairColor, hx, 3, hw, 6, hairHighlight)

  if (hairStyle === 'messy-short' || hairStyle === 'curly') {
    dot(g, hairColor, hx + 1, 2)
    dot(g, hairColor, hx + 3, 2)
    dot(g, hairColor, hx + 5, 2)
    dot(g, hairHighlight, hx + 2, 3)
    dot(g, hairHighlight, hx + 6, 3)
  } else if (hairStyle === 'bun') {
    px(g, hairColor, hx + Math.floor(hw / 2) - 2, 0, 5, 3, hairHighlight)
  } else if (hairStyle === 'ponytail') {
    const tailX = direction === 'left' ? hx + hw - 1 : hx - 2
    px(g, hairColor, tailX, 5, 3, 9, hairShadow)
  }

  // ── 8. Hats ────────────────────────────────────────────────────────────────
  const hatStyle = HATS[look.hat]?.id ?? 'none'
  if (hatStyle === 'cap') {
    const brimDir = direction === 'left' ? -2 : direction === 'right' ? 2 : 0
    px(g, outline, hx - 1, 1, hw + 2, 4)
    px(g, 0x263b58, hx, 2, hw, 3, 0x192d39)
    px(g, 0x263b58, hx + brimDir, 5, hw, 1)
  } else if (hatStyle === 'beanie') {
    px(g, outline, hx - 1, 0, hw + 2, 6)
    px(g, 0xc98575, hx, 1, hw, 5, 0x9b5d50)
    px(g, 0xd9a08c, hx - 1, 5, hw + 2, 2)
  } else if (hatStyle === 'flower-crown') {
    px(g, 0x789078, hx, 4, hw, 1)
    dot(g, 0xe9bd68, hx + 1, 3)
    dot(g, 0xc98575, hx + 4, 3)
    dot(g, 0xfffbf0, hx + 7, 3)
    dot(g, 0xc98575, hx + 10, 3)
  }

  // ── 9. Accessories ─────────────────────────────────────────────────────────
  const accStyle = ACCESSORIES[look.accessory]?.id ?? 'none'
  if (accStyle === 'glasses' && direction !== 'up') {
    const gY = 9
    const gColor = 0xb8924a
    if (direction === 'down') {
      px(g, gColor, faceX + 1, gY, 4, 3)
      px(g, skinColor, faceX + 2, gY + 1, 2, 1)
      px(g, gColor, faceX + faceW - 5, gY, 4, 3)
      px(g, skinColor, faceX + faceW - 4, gY + 1, 2, 1)
      dot(g, gColor, faceX + Math.floor(faceW / 2) - 1, gY + 1)
    } else {
      const eX = direction === 'right' ? faceX + faceW - 5 : faceX + 1
      px(g, gColor, eX, gY, 4, 3)
      px(g, skinColor, eX + 1, gY + 1, 2, 1)
    }
  } else if (accStyle === 'scarf') {
    px(g, 0x789078, neckX - 2, 15, 8, 3, 0x5a6e5a)
    px(g, 0x789078, neckX + 1, 18, 3, 4, 0x5a6e5a)
  } else if (accStyle === 'hair-clip') {
    const clipX = direction === 'left' ? hx - 1 : hx + hw - 2
    px(g, 0xe9bd68, clipX, 7, 3, 2)
  } else if (accStyle === 'lantern-pin') {
    dot(g, 0xe9bd68, bodyX + 3, bodyTop + 3)
    dot(g, 0xfce8b0, bodyX + 3, bodyTop + 2)
  }

  // Dither shadow
  dot(g, outline, bodyX + 1, bodyTop + 12)
  dot(g, outline, bodyX + 3, bodyTop + 12)

  g.generateTexture(key, 32, 40)
  g.destroy()
}

// ─── Legacy character sprite drawing ─────────────────────────────────────────

function drawLegacyCharacterTexture(
  scene: Phaser.Scene,
  key: string,
  character: ResolvedCharacter,
  pose: CharacterPose,
  direction: CharacterDirection,
  frame: number,
) {
  const defaults = character.config.id === 'talha' ? TALHA_DEFAULT_LOOK : MANNU_DEFAULT_LOOK
  const look = migrateOldAppearance(character.appearance, defaults)
  const bw = character.config.bodyWidthOffset
  drawLayeredCharacterTexture(scene, key, look, bw, pose, direction, frame)
}

// ─── Emote bubble ─────────────────────────────────────────────────────────────

function drawEmoteBubble(scene: Phaser.Scene, key: string, accent: number) {
  const g = scene.make.graphics({ x: 0, y: 0 }, false)
  g.fillStyle(0x192d39, 1).fillRect(1, 1, 15, 11).fillRect(4, 12, 4, 3)
  g.fillStyle(0xe8dcc5, 1).fillRect(2, 2, 13, 9).fillRect(5, 11, 2, 2)
  g.fillStyle(accent, 1)
    .fillRect(4, 4, 3, 1).fillRect(8, 4, 3, 1)
    .fillRect(3, 5, 5, 1).fillRect(7, 5, 5, 1)
    .fillRect(3, 6, 11, 2)
    .fillRect(4, 8, 9, 1)
    .fillRect(5, 9, 7, 1)
    .fillRect(6, 10, 5, 1)
    .fillRect(7, 11, 3, 1)
  g.generateTexture(key, 17, 16)
  g.destroy()
}

// ─── CharacterSprites class ───────────────────────────────────────────────────

export class CharacterSprites {
  private readonly local: Phaser.GameObjects.Sprite
  private readonly localShadow: Phaser.GameObjects.Ellipse
  private readonly localMoodGlow: Phaser.GameObjects.Ellipse
  private readonly localNameTag: Phaser.GameObjects.Text
  private readonly localEmoteBubble: Phaser.GameObjects.Sprite
  private readonly remote: Phaser.GameObjects.Sprite
  private readonly remoteShadow: Phaser.GameObjects.Ellipse
  private readonly remoteMoodGlow: Phaser.GameObjects.Ellipse
  private readonly remoteNameTag: Phaser.GameObjects.Text
  private readonly remoteEmoteBubble: Phaser.GameObjects.Sprite
  private readonly localEmoteGlyph: Phaser.GameObjects.Text
  private readonly remoteEmoteGlyph: Phaser.GameObjects.Text
  private remoteTarget: RemotePlayerPosition | null = null
  private facing: CharacterDirection = 'down'
  private localDirection: CharacterDirection = 'down'
  private localPose: CharacterPose = 'idle'
  private localFrame = 0
  private remoteFacing: CharacterDirection = 'down'
  private remoteDirection: CharacterDirection = 'down'
  private remotePose: CharacterPose = 'idle'
  private remoteFrame = 0
  private localWaveUntil = 0
  private remoteWaveUntil = 0
  private localSitUntil = 0
  private remoteSitUntil = 0
  private localMoodColor: MoodLanternColor = 'off'
  private remoteMoodColor: MoodLanternColor = 'off'
  private lastDustAt = 0

  private localLook: Omit<PlayerLook, 'updatedAt'> | null = null
  private remoteLook: Omit<PlayerLook, 'updatedAt'> | null = null

  constructor(private readonly scene: Phaser.Scene, private readonly roster: CharacterRoster) {
    const local = roster.local
    const remote = roster.remote
    const localSpawn = local.config.spawn
    const remoteSpawn = remote.config.spawn
    const localIdle = characterTextureKey(local.config.id, 'idle', 'down', 0)
    const remoteIdle = characterTextureKey(remote.config.id, 'idle', 'down', 0)

    this.localShadow = scene.add.ellipse(localSpawn.x, localSpawn.y + 17, 24, 8, local.config.palette.outline, 0.36)
      .setDepth(localSpawn.y + 38)
    this.localMoodGlow = scene.add.ellipse(localSpawn.x, localSpawn.y + 2, 38, 46, 0xe9bd68, 0.14)
      .setBlendMode(Phaser.BlendModes.ADD).setDepth(localSpawn.y + 35).setVisible(false)
    this.local = scene.add.sprite(localSpawn.x, localSpawn.y, localIdle).setDepth(localSpawn.y + 40)
    this.localNameTag = this.createNameTag(local.config.name, localSpawn.x, localSpawn.y - 20).setDepth(localSpawn.y + 42)
    this.localEmoteBubble = scene.add.sprite(localSpawn.x + 13, localSpawn.y - 31, emoteBubbleTextureKey(local.config.id))
      .setDepth(localSpawn.y + 43)
      .setVisible(false)
    this.localEmoteGlyph = this.createEmoteGlyph(localSpawn.x + 13, localSpawn.y - 34)

    this.remoteShadow = scene.add.ellipse(remoteSpawn.x, remoteSpawn.y + 17, 24, 8, remote.config.palette.outline, 0.36)
      .setDepth(remoteSpawn.y + 38)
      .setVisible(false)
    this.remoteMoodGlow = scene.add.ellipse(remoteSpawn.x, remoteSpawn.y + 2, 38, 46, 0xe9bd68, 0.14)
      .setBlendMode(Phaser.BlendModes.ADD).setDepth(remoteSpawn.y + 35).setVisible(false)
    this.remote = scene.add.sprite(remoteSpawn.x, remoteSpawn.y, remoteIdle)
      .setDepth(remoteSpawn.y + 40)
      .setVisible(false)
    this.remoteNameTag = this.createNameTag(remote.config.name, remoteSpawn.x, remoteSpawn.y - 20)
      .setDepth(remoteSpawn.y + 42)
      .setVisible(false)
    this.remoteEmoteBubble = scene.add.sprite(remoteSpawn.x + 13, remoteSpawn.y - 31, emoteBubbleTextureKey(remote.config.id))
      .setDepth(remoteSpawn.y + 43)
      .setVisible(false)
    this.remoteEmoteGlyph = this.createEmoteGlyph(remoteSpawn.x + 13, remoteSpawn.y - 34)

    this.localWaveUntil = scene.time.now + 900
    this.showEmoteBubble(this.localEmoteBubble)
    this.playArrivalBounce(this.local)
  }

  setLocalLook(look: Omit<PlayerLook, 'updatedAt'>) {
    this.localLook = look
    ensureCharacterLookTextures(this.scene, this.roster.local.config.id, look, this.roster.local.config)
    this.refreshLocalAppearance()
  }

  setRemoteLook(look: Omit<PlayerLook, 'updatedAt'>) {
    this.remoteLook = look
    ensureCharacterLookTextures(this.scene, this.roster.remote.config.id, look, this.roster.remote.config)
    this.refreshRemoteAppearance()
  }

  updateLocal(x: number, y: number, time: number, hasInput: boolean, horizontal: number, vertical: number) {
    if (hasInput) {
      if (Math.abs(horizontal) > Math.abs(vertical)) this.facing = horizontal < 0 ? 'left' : 'right'
      else this.facing = vertical < 0 ? 'up' : 'down'
    }

    const previousX = this.local.x
    const previousY = this.local.y
    this.local.setPosition(x, y)
    const actuallyMoving = Math.hypot(x - previousX, y - previousY) > 0.25
    if (actuallyMoving) this.localSitUntil = 0
    const forcedPose = !actuallyMoving && time < this.localSitUntil ? 'sit' : time < this.localWaveUntil && !actuallyMoving ? 'wave' : undefined
    const animation = selectCharacterAnimation(time, actuallyMoving, this.facing, forcedPose)
    this.localPose = animation.pose
    this.localDirection = animation.direction
    this.localFrame = animation.frame
    this.setCharacterFrame(this.local, this.roster.local, animation.pose, animation.direction, animation.frame)
    this.localShadow.setPosition(x, y + 17).setDepth(y + 38)
    this.localMoodGlow.setPosition(x, y + 2).setDepth(y + 35)
    this.local.setDepth(y + 40)
    this.localNameTag.setPosition(x, y - 20).setDepth(y + 42)
    this.localEmoteBubble.setPosition(x + 13, y - 31).setDepth(y + 43)
    this.localEmoteGlyph.setPosition(x + 13, y - 34).setDepth(y + 45)

    if (actuallyMoving && time - this.lastDustAt >= 260) {
      this.lastDustAt = time
      this.createDustPuff(x, y + 15, this.roster.local.config.palette.sage)
    }
  }

  updateRemote(time: number) {
    if (!this.remote.visible || !this.remoteTarget) return
    const deltaX = this.remoteTarget.x - this.remote.x
    const deltaY = this.remoteTarget.y - this.remote.y
    const moving = Math.abs(deltaX) + Math.abs(deltaY) > 0.5
    if (moving) {
      if (Math.abs(deltaX) > Math.abs(deltaY)) this.remoteFacing = deltaX < 0 ? 'left' : 'right'
      else this.remoteFacing = deltaY < 0 ? 'up' : 'down'
    }

    this.remote.x = Phaser.Math.Linear(this.remote.x, this.remoteTarget.x, 0.16)
    this.remote.y = Phaser.Math.Linear(this.remote.y, this.remoteTarget.y, 0.16)
    if (moving) this.remoteSitUntil = 0
    const forcedPose = !moving && time < this.remoteSitUntil ? 'sit' : time < this.remoteWaveUntil && !moving ? 'wave' : undefined
    const animation = selectCharacterAnimation(time, moving, this.remoteFacing, forcedPose)
    this.remotePose = animation.pose
    this.remoteDirection = animation.direction
    this.remoteFrame = animation.frame
    this.setCharacterFrame(this.remote, this.roster.remote, animation.pose, animation.direction, animation.frame)
    this.remoteShadow.setPosition(this.remote.x, this.remote.y + 17).setDepth(this.remote.y + 38)
    this.remoteMoodGlow.setPosition(this.remote.x, this.remote.y + 2).setDepth(this.remote.y + 35)
    this.remote.setDepth(this.remote.y + 40)
    this.remoteNameTag.setPosition(this.remote.x, this.remote.y - 20).setDepth(this.remote.y + 42)
    this.remoteEmoteBubble.setPosition(this.remote.x + 13, this.remote.y - 31).setDepth(this.remote.y + 43)
    this.remoteEmoteGlyph.setPosition(this.remote.x + 13, this.remote.y - 34).setDepth(this.remote.y + 45)
  }

  setRemotePosition(position: RemotePlayerPosition | null) {
    if (position && position.uid !== this.roster.remoteUid) position = null
    this.remoteTarget = position
    if (!position) {
      this.remote.setVisible(false)
      this.remoteShadow.setVisible(false)
      this.remoteMoodGlow.setVisible(false)
      this.remoteNameTag.setVisible(false)
      this.remoteEmoteBubble.setVisible(false)
      this.remoteEmoteGlyph.setVisible(false)
      return
    }

    if (!this.remote.visible) {
      this.remote.setPosition(position.x, position.y)
      this.remoteWaveUntil = this.scene.time.now + 900
      this.showEmoteBubble(this.remoteEmoteBubble)
      this.playArrivalBounce(this.remote)
    }
    this.remote.setVisible(true)
    this.remoteShadow.setVisible(true)
    this.remoteMoodGlow.setVisible(this.remoteMoodColor !== 'off')
    this.remoteNameTag.setVisible(true)
  }

  getRemoteRenderPosition(): { x: number; y: number; visible: boolean } {
    return {
      x: this.remote.x,
      y: this.remote.y,
      visible: this.remote.visible,
    }
  }

  refreshLocalAppearance() {
    const isLocalTalha = this.roster.local.config.id === 'talha'
    const defaults = isLocalTalha ? TALHA_DEFAULT_LOOK : MANNU_DEFAULT_LOOK
    const look = this.localLook || migrateOldAppearance(this.roster.local.appearance, defaults)
    const lKey = getLookKey(look)
    const key = characterTextureKey(this.roster.local.config.id, this.localPose, this.localDirection, this.localFrame, lKey)
    if (this.scene.textures.exists(key)) {
      this.local.setTexture(key)
    } else {
      this.local.setTexture(characterTextureKey(this.roster.local.config.id, this.localPose, this.localDirection, this.localFrame))
    }
  }

  refreshRemoteAppearance() {
    const isRemoteTalha = this.roster.remote.config.id === 'talha'
    const defaults = isRemoteTalha ? TALHA_DEFAULT_LOOK : MANNU_DEFAULT_LOOK
    const look = this.remoteLook || migrateOldAppearance(this.roster.remote.appearance, defaults)
    const lKey = getLookKey(look)
    const key = characterTextureKey(this.roster.remote.config.id, this.remotePose, this.remoteDirection, this.remoteFrame, lKey)
    if (this.scene.textures.exists(key)) {
      this.remote.setTexture(key)
    } else {
      this.remote.setTexture(characterTextureKey(this.roster.remote.config.id, this.remotePose, this.remoteDirection, this.remoteFrame))
    }
  }

  playLocalEmote(kind: WorldEmoteType) {
    if (kind === 'sit-bench' || kind === 'sit-blanket') {
      this.localSitUntil = this.scene.time.now + 15_000
      this.localWaveUntil = 0
    } else if (!kind.startsWith('mood-') && !kind.startsWith('pond-lantern-')) {
      this.localWaveUntil = this.scene.time.now + 1100
      this.localSitUntil = 0
    }
    if (kind.startsWith('mood-')) {
      this.localMoodColor = kind.slice(5) as MoodLanternColor
      this.setMoodLantern(this.localMoodGlow, this.localMoodColor)
    }
    this.showEmote(this.localEmoteBubble, this.localEmoteGlyph, kind)
  }

  playRemoteEmote(kind: WorldEmoteType) {
    if (kind === 'sit-bench' || kind === 'sit-blanket') {
      this.remoteSitUntil = this.scene.time.now + 15_000
      this.remoteWaveUntil = 0
    } else if (!kind.startsWith('mood-') && !kind.startsWith('pond-lantern-')) {
      this.remoteWaveUntil = this.scene.time.now + 1100
      this.remoteSitUntil = 0
    }
    if (kind.startsWith('mood-')) {
      this.remoteMoodColor = kind.slice(5) as MoodLanternColor
      this.setMoodLantern(this.remoteMoodGlow, this.remoteMoodColor)
    }
    this.showEmote(this.remoteEmoteBubble, this.remoteEmoteGlyph, kind)
  }

  private setMoodLantern(glow: Phaser.GameObjects.Ellipse, color: MoodLanternColor) {
    const colors: Record<Exclude<MoodLanternColor, 'off'>, number> = {
      gold: 0xf1c96e,
      rose: 0xe69b9c,
      sage: 0x9fbc8e,
    }
    if (color === 'off') {
      glow.setVisible(false)
      return
    }
    glow.setFillStyle(colors[color], 0.16).setVisible(true)
  }

  private createEmoteGlyph(x: number, y: number) {
    return this.scene.add.text(x, y, '', {
      fontFamily: 'monospace', fontSize: '17px', color: '#fff1cb',
      stroke: '#263747', strokeThickness: 3,
    }).setOrigin(0.5, 1).setDepth(y + 45).setVisible(false)
  }

  private showEmote(bubble: Phaser.GameObjects.Sprite, glyph: Phaser.GameObjects.Text, kind: WorldEmoteType) {
    const glyphs: Record<WorldEmoteType, string> = {
      wave: '↗', heart: '♡', sparkle: '✦', hug: '♥',
      'sit-bench': '…', 'sit-blanket': '✧',
      'pond-lantern-on': '✦', 'pond-lantern-off': '·',
      'mood-off': '·', 'mood-gold': '✦', 'mood-rose': '♡', 'mood-sage': '✧',
    }
    this.showEmoteBubble(bubble)
    glyph.setText(glyphs[kind]).setVisible(true).setAlpha(1)
    this.scene.time.delayedCall(1100, () => glyph.setVisible(false))
  }

  private createNameTag(name: string, x: number, y: number) {
    return this.scene.add.text(x, y, name, {
      fontFamily: 'monospace', fontSize: '10px', color: '#fff1cb',
      backgroundColor: '#263747cc', padding: { x: 4, y: 2 },
    }).setOrigin(0.5, 1)
  }

  private setCharacterFrame(
    sprite: Phaser.GameObjects.Sprite,
    character: ResolvedCharacter,
    pose: CharacterPose,
    direction: CharacterDirection,
    frame: number,
  ) {
    const isLocal = character.config.id === this.roster.local.config.id
    const look = isLocal ? this.localLook : this.remoteLook
    const lookKey = look ? getLookKey(look) : undefined
    const key = characterTextureKey(character.config.id, pose, direction, frame, lookKey)
    if (sprite.texture.key !== key && this.scene.textures.exists(key)) {
      sprite.setTexture(key)
    } else if (sprite.texture.key !== key) {
      const fallbackKey = characterTextureKey(character.config.id, pose, direction, frame)
      if (sprite.texture.key !== fallbackKey && this.scene.textures.exists(fallbackKey)) {
        sprite.setTexture(fallbackKey)
      }
    }
  }

  private showEmoteBubble(bubble: Phaser.GameObjects.Sprite) {
    bubble.setVisible(true).setAlpha(0).setScale(0.5)
    this.scene.tweens.add({ targets: bubble, alpha: 1, scaleX: 1, scaleY: 1, duration: 140, ease: 'Back.Out' })
    this.scene.time.delayedCall(1000, () => bubble.setVisible(false))
  }

  private playArrivalBounce(sprite: Phaser.GameObjects.Sprite) {
    sprite.setScale(0.82, 0.7)
    this.scene.tweens.add({ targets: sprite, scaleX: 1, scaleY: 1, duration: 330, ease: 'Back.Out' })
  }

  private createDustPuff(x: number, y: number, color: number) {
    const puff = this.scene.add.rectangle(x, y, 4, 3, color, 0.58).setDepth(y + 5)
    this.scene.tweens.add({
      targets: puff,
      scaleX: 1.9,
      scaleY: 0.7,
      alpha: 0,
      duration: 280,
      ease: 'Quad.Out',
      onComplete: () => puff.destroy(),
    })
  }
}
