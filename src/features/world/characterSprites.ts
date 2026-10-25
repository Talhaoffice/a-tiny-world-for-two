import Phaser from 'phaser'
import { characterTextureKey, emoteBubbleTextureKey } from '../../assets/registry'
import type { CharacterDirection, CharacterPose } from './characters.config'
import { selectCharacterAnimation } from './characterAnimation'
import type { CharacterRoster, ResolvedCharacter } from './characterRoster'
import type { RemotePlayerPosition } from './IslandScene'
import type { WorldEmoteType } from './worldEmotes'

export type MoodLanternColor = 'off' | 'gold' | 'rose' | 'sage'

// ─── Texture generation ───────────────────────────────────────────────────────

export function createCharacterTextures(scene: Phaser.Scene, roster: CharacterRoster) {
  createCharacterAppearanceTextures(scene, roster.local)
  createCharacterAppearanceTextures(scene, roster.remote)
  for (const character of [roster.local, roster.remote]) {
    drawEmoteBubble(scene, emoteBubbleTextureKey(character.config.id), character.config.palette.gold)
  }
}

export function createCharacterAppearanceTextures(scene: Phaser.Scene, character: ResolvedCharacter) {
  const directions: CharacterDirection[] = ['down', 'left', 'right', 'up']
  const poses: CharacterPose[] = ['idle', 'walk', 'wave', 'sit']
  const frameCounts: Record<CharacterPose, number> = { idle: 2, walk: 6, wave: 1, sit: 1 }
  for (const pose of poses) {
    for (const direction of directions) {
      for (let frame = 0; frame < frameCounts[pose]; frame += 1) {
        drawCharacterTexture(
          scene,
          characterTextureKey(character.config.id, pose, direction, frame),
          character,
          pose,
          direction,
          frame,
        )
      }
    }
  }
}

// ─── Pixel art helpers ────────────────────────────────────────────────────────

/** Draw a filled rect then optionally a 1 px darker shade on the bottom/right edges. */
function px(
  g: Phaser.GameObjects.Graphics,
  color: number,
  x: number, y: number, w: number, h: number,
  shade?: number,
) {
  g.fillStyle(color, 1).fillRect(x, y, w, h)
  if (shade !== undefined && w > 1 && h > 1) {
    g.fillStyle(shade, 1).fillRect(x + w - 1, y, 1, h)   // right edge
    g.fillStyle(shade, 1).fillRect(x, y + h - 1, w - 1, 1) // bottom edge
  }
}

/** Single pixel dot, used for dithering / highlights. */
function dot(g: Phaser.GameObjects.Graphics, color: number, x: number, y: number) {
  g.fillStyle(color, 1).fillRect(x, y, 1, 1)
}

// ─── Character sprite drawing ─────────────────────────────────────────────────

// Frame canvas is 32 × 40 pixels (matches registry.CHARACTER_SPRITE_SHEET_LAYOUT).
// Coordinate system: (0,0) top-left. Top-left light source.

function drawCharacterTexture(
  scene: Phaser.Scene,
  key: string,
  character: ResolvedCharacter,
  pose: CharacterPose,
  direction: CharacterDirection,
  frame: number,
) {
  const g = scene.make.graphics({ x: 0, y: 0 }, false)
  const { palette, footwear, appearance, config } = {
    palette: character.config.palette,
    footwear: character.config.footwear,
    appearance: character.appearance,
    config: character.config,
  }

  const bw = config.bodyWidthOffset        // 2 for Talha (broader), 0 for Mannu

  const outfitColor = appearance.outfit === 'jacket'
    ? palette.jacket
    : appearance.outfit === 'cardigan' ? palette.cardigan : palette.dress
  const outfitShade = mixDark(outfitColor)

  const sitting = pose === 'sit'
  // Breathing bob: idle frame 1 drops body 1 px
  const breathBob = (pose === 'idle' && frame === 1) ? 1 : 0
  const bodyTop = (sitting ? 20 : 17) + breathBob
  // Walk gait offsets: symmetric swing
  const gait = pose === 'walk' ? ([-2, -1, 1, 2, 1, -1] as const)[frame as 0|1|2|3|4|5] : 0

  // ── Ground shadow (soft oval, 50% transparency) ──────────────────────────
  // Not drawn to texture — handled in CharacterSprites via scene.add.ellipse.

  // ── Hair (drawn first so face overwrites inner pixels) ───────────────────
  const isLong = appearance.hair === 'long'
  const hx = 9 - Math.floor(bw / 2)   // hair x: Talha starts 1 px further left
  const hw = 14 + bw                    // hair width: wider for Talha

  if (isLong) {
    // Long hair: reaches shoulders; side curtains down past collar
    px(g, palette.outline, hx - 1, 3, hw + 2, 17)         // outer outline
    px(g, palette.hair, hx, 3, hw, 13, palette.hairHighlight)
    // Side curtains
    px(g, palette.hair, hx - 1, 10, 3, 10)                // left curtain
    px(g, palette.hair, hx + hw - 2, 10, 3, 10)           // right curtain
    dot(g, palette.hairHighlight, hx, 4)
    dot(g, palette.hairHighlight, hx + 1, 3)
    // Small clip accessory on side
    if (appearance.accessory === 'lantern-clip' || appearance.accessory === 'sage-accent') {
      const clipColor = appearance.accessory === 'lantern-clip' ? palette.gold : palette.sage
      const clipX = direction === 'left' ? hx - 1 : hx + hw - 2
      px(g, clipColor, clipX, 8, 3, 2)
    }
  } else {
    // Short messy hair: spiky top, wider for Talha
    px(g, palette.outline, hx - 1, 2, hw + 2, 11)         // outer outline
    px(g, palette.hair, hx, 3, hw, 8, palette.hairHighlight)
    // Messy spikes on top
    dot(g, palette.hair, hx + 1, 2)
    dot(g, palette.hair, hx + 3, 2)
    dot(g, palette.hair, hx + 5, 2)
    dot(g, palette.hair, hx + 7, 2)
    dot(g, palette.hairHighlight, hx + 2, 3)
    dot(g, palette.hairHighlight, hx + 6, 3)
    // Scarf/lantern-gold stripe at collar (jacket only)
    if (appearance.outfit === 'jacket') {
      px(g, palette.gold, hx, 11, hw, 2)
    }
  }

  // ── Face ─────────────────────────────────────────────────────────────────
  const faceX = 10 - Math.floor(bw / 2)
  const faceW = 12 + bw
  px(g, palette.skin, faceX, 6, faceW, 10, palette.skinShadow)
  // Cheek highlight (top-left light)
  dot(g, lighten(palette.skin, 0x18), faceX + 1, 7)
  dot(g, lighten(palette.skin, 0x10), faceX + 2, 7)

  if (direction === 'down') {
    // Two eyes
    px(g, palette.outline, faceX + 2, 10, 2, 2)
    px(g, palette.outline, faceX + 8, 10, 2, 2)
    // Mouth
    dot(g, 0xc0806a, faceX + 4, 13)
    dot(g, 0xc0806a, faceX + 5, 13)
  } else if (direction === 'up') {
    // Only hair visible, no face features
    px(g, palette.hair, faceX - 1, 5, faceW + 2, 11)
  } else {
    // Side profile — one eye, one cheek
    const eyeX = direction === 'right' ? faceX + 7 : faceX + 1
    px(g, palette.outline, eyeX, 10, 2, 2)
    // Nose dot
    const noseX = direction === 'right' ? faceX + faceW - 1 : faceX
    dot(g, palette.skinShadow, noseX, 12)
  }

  // ── Neck ──────────────────────────────────────────────────────────────────
  const neckX = faceX + Math.floor(faceW / 2) - 2
  px(g, palette.skin, neckX, 16, 4, 2, palette.skinShadow)

  // ── Body / outfit ─────────────────────────────────────────────────────────
  const bodyX = 8 - Math.floor(bw / 2)
  const bodyW = 16 + bw

  if (appearance.outfit === 'dress') {
    // Skirt flares outward below waist (unique to Mannu)
    px(g, palette.outline, bodyX - 1, bodyTop, bodyW + 2, 8)              // torso outline
    px(g, outfitColor, bodyX, bodyTop + 1, bodyW, 7, outfitShade)         // torso fill
    // Flared skirt
    px(g, palette.outline, bodyX - 2, bodyTop + 8, bodyW + 4, 7)          // skirt outline
    px(g, outfitColor, bodyX - 1, bodyTop + 9, bodyW + 2, 6, outfitShade) // skirt fill
    // Sage accent band at waist
    if (appearance.accessory === 'sage-accent') {
      px(g, palette.sage, bodyX, bodyTop + 7, bodyW, 2)
    }
    // Inner white blouse glimpse at collar
    px(g, 0xe8dcc5, bodyX + 2, bodyTop + 1, 3, 3)
  } else {
    // Jacket / cardigan: straight-sided silhouette, broader for Talha
    px(g, palette.outline, bodyX - 1, bodyTop, bodyW + 2, 13)              // outline
    px(g, outfitColor, bodyX, bodyTop + 1, bodyW, 12, outfitShade)         // fill

    if (appearance.outfit === 'jacket') {
      // Center button line
      const midX = bodyX + Math.floor(bodyW / 2)
      px(g, palette.outline, midX, bodyTop + 1, 1, 12)
      // Lantern-gold chest stripe / badge
      px(g, palette.gold, midX - 1, bodyTop + 3, 3, 2)
      // Collar
      px(g, 0xe8dcc5, bodyX, bodyTop + 1, 3, 2)
      px(g, 0xe8dcc5, bodyX + bodyW - 3, bodyTop + 1, 3, 2)
    } else {
      // Cardigan: sage lapels + cream inner
      px(g, palette.sage, bodyX, bodyTop + 1, 2, 11)
      px(g, palette.sage, bodyX + bodyW - 2, bodyTop + 1, 2, 11)
      px(g, 0xe8dcc5, bodyX + 2, bodyTop + 2, bodyW - 4, 9)
    }
  }

  // ── Arms ──────────────────────────────────────────────────────────────────
  const armLen = 9
  if (pose === 'wave') {
    const waveLeft = direction === 'left'
    // Raised arm
    const rxUp = waveLeft ? bodyX - 4 : bodyX + bodyW
    px(g, palette.outline, rxUp, bodyTop - 8, 4, 10)
    px(g, outfitColor, rxUp + 1, bodyTop - 7, 2, 8, outfitShade)
    px(g, palette.skin, rxUp, bodyTop - 11, 4, 4)
    // Resting arm
    const rxRest = waveLeft ? bodyX + bodyW : bodyX - 4
    px(g, palette.outline, rxRest, bodyTop + 2, 4, armLen)
    px(g, outfitColor, rxRest + 1, bodyTop + 2, 2, armLen - 2, outfitShade)
  } else {
    const leftArmX = bodyX - 4 - Math.max(0, gait)
    const rightArmX = bodyX + bodyW + Math.max(0, -gait)
    px(g, palette.outline, leftArmX, bodyTop + 2, 4, armLen)
    px(g, outfitColor, leftArmX + 1, bodyTop + 2, 2, armLen - 2, outfitShade)
    dot(g, palette.skin, leftArmX + 1, bodyTop + armLen)
    px(g, palette.outline, rightArmX, bodyTop + 2, 4, armLen)
    px(g, outfitColor, rightArmX + 1, bodyTop + 2, 2, armLen - 2, outfitShade)
    dot(g, palette.skin, rightArmX + 1, bodyTop + armLen)
  }

  // ── Legs ──────────────────────────────────────────────────────────────────
  const legShade = mixDark(palette.trousers)
  if (sitting) {
    // Legs forward (L-shape)
    px(g, palette.outline, bodyX, 30, Math.floor(bodyW / 2) - 1, 5)
    px(g, palette.trousers, bodyX + 1, 31, Math.floor(bodyW / 2) - 2, 4, legShade)
    px(g, palette.outline, bodyX + Math.floor(bodyW / 2) + 1, 30, Math.floor(bodyW / 2) - 1, 5)
    px(g, palette.trousers, bodyX + Math.floor(bodyW / 2) + 2, 31, Math.floor(bodyW / 2) - 2, 4, legShade)
    // Feet forward
    const shoeColor = footwear === 'boots' ? palette.boots : palette.shoes
    px(g, palette.outline, bodyX - 1, 34, 7, 4)
    px(g, shoeColor, bodyX, 35, 5, 3)
    px(g, palette.outline, bodyX + bodyW - 6, 34, 7, 4)
    px(g, shoeColor, bodyX + bodyW - 5, 35, 5, 3)
  } else {
    const lLegY = 29 + Math.max(0, gait)
    const rLegY = 29 + Math.max(0, -gait)
    const legW = 5 + Math.floor(bw / 2)
    px(g, palette.outline, bodyX + 1, lLegY, legW, 6)
    px(g, palette.trousers, bodyX + 2, lLegY + 1, legW - 2, 5, legShade)
    px(g, palette.outline, bodyX + bodyW - legW - 1, rLegY, legW, 6)
    px(g, palette.trousers, bodyX + bodyW - legW, rLegY + 1, legW - 2, 5, legShade)

    // Shoes / boots
    const shoeColor = footwear === 'boots' ? palette.boots : palette.shoes
    const shoeShade = mixDark(shoeColor)
    const lShoeX = bodyX + Math.max(0, -gait)
    const rShoeX = bodyX + bodyW - 7 + Math.max(0, gait)
    px(g, palette.outline, lShoeX, 34, 7, 4)
    px(g, shoeColor, lShoeX + 1, 35, 5, 3, shoeShade)
    px(g, palette.outline, rShoeX, 34, 7, 4)
    px(g, shoeColor, rShoeX + 1, 35, 5, 3, shoeShade)

    // Boot cuff highlight for Talha
    if (footwear === 'boots') {
      dot(g, lighten(palette.boots, 0x18), lShoeX + 1, 34)
      dot(g, lighten(palette.boots, 0x18), rShoeX + 1, 34)
    }
  }

  // ── Dither shadow under body (2 checkerboard dots at bottom of torso) ─────
  dot(g, palette.outline, bodyX + 1, bodyTop + 12)
  dot(g, palette.outline, bodyX + 3, bodyTop + 12)

  g.generateTexture(key, 32, 40)
  g.destroy()
}

// ─── Emote bubble ─────────────────────────────────────────────────────────────

function drawEmoteBubble(scene: Phaser.Scene, key: string, accent: number) {
  const g = scene.make.graphics({ x: 0, y: 0 }, false)
  // Rounded speech bubble: outline
  g.fillStyle(0x192d39, 1).fillRect(1, 1, 15, 11).fillRect(4, 12, 4, 3)
  // Cream interior
  g.fillStyle(0xe8dcc5, 1).fillRect(2, 2, 13, 9).fillRect(5, 11, 2, 2)
  // Accent heart shape (gold or custom)
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

// ─── Colour math helpers ──────────────────────────────────────────────────────

/** Returns a darker version of an RGB hex number (subtract each channel by amt). */
function mixDark(color: number, amt = 0x18): number {
  const r = Math.max(0, ((color >> 16) & 0xff) - amt)
  const g2 = Math.max(0, ((color >> 8) & 0xff) - amt)
  const b = Math.max(0, (color & 0xff) - amt)
  return (r << 16) | (g2 << 8) | b
}

/** Returns a lighter version of an RGB hex number (add each channel by amt). */
function lighten(color: number, amt = 0x18): number {
  const r = Math.min(255, ((color >> 16) & 0xff) + amt)
  const g2 = Math.min(255, ((color >> 8) & 0xff) + amt)
  const b = Math.min(255, (color & 0xff) + amt)
  return (r << 16) | (g2 << 8) | b
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

    // Keep the existing remote interpolation so network movement stays smooth.
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

  refreshLocalAppearance() {
    this.local.setTexture(characterTextureKey(this.roster.local.config.id, this.localPose, this.localDirection, this.localFrame))
  }

  refreshRemoteAppearance() {
    this.remote.setTexture(characterTextureKey(this.roster.remote.config.id, this.remotePose, this.remoteDirection, this.remoteFrame))
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

  private setCharacterFrame(sprite: Phaser.GameObjects.Sprite, character: ResolvedCharacter, pose: CharacterPose, direction: CharacterDirection, frame: number) {
    const key = characterTextureKey(character.config.id, pose, direction, frame)
    if (sprite.texture.key !== key) sprite.setTexture(key)
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
