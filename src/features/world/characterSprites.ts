import Phaser from 'phaser'
import { characterTextureKey, emoteBubbleTextureKey } from '../../assets/registry'
import type { CharacterDirection, CharacterPose } from './characters.config'
import { selectCharacterAnimation } from './characterAnimation'
import type { CharacterRoster, ResolvedCharacter } from './characterRoster'
import type { RemotePlayerPosition } from './IslandScene'

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

function drawCharacterTexture(
  scene: Phaser.Scene,
  key: string,
  character: ResolvedCharacter,
  pose: CharacterPose,
  direction: CharacterDirection,
  frame: number,
) {
  const graphics = scene.make.graphics({ x: 0, y: 0 }, false)
  const rect = (color: number, x: number, y: number, width: number, height: number) => {
    graphics.fillStyle(color, 1).fillRect(x, y, width, height)
  }
  const { palette, footwear } = character.config
  const { appearance } = character
  const outfitColor = appearance.outfit === 'jacket'
    ? palette.jacket
    : appearance.outfit === 'cardigan' ? palette.cardigan : palette.dress
  const sitting = pose === 'sit'
  const bodyTop = (sitting ? 19 : 16) + (pose === 'idle' ? frame % 2 : 0)
  const gait = pose === 'walk' ? [-2, -1, 1, 2, 1, -1][frame] : 0

  if (appearance.hair === 'long') {
    rect(palette.outline, 7, 5, 18, 18)
    rect(palette.hair, 8, 5, 16, 15)
    rect(palette.hair, 6, 11, 4, 11)
    rect(palette.hair, 22, 11, 4, 11)
  } else {
    rect(palette.outline, 8, 4, 16, 12)
    rect(palette.hair, 9, 4, 14, 9)
  }
  rect(palette.skin, 9, 8, 14, 11)
  rect(palette.outline, 8, 7, 2, 9)
  rect(palette.outline, 22, 7, 2, 9)

  if (direction === 'down') {
    rect(palette.outline, 12, 12, 2, 2)
    rect(palette.outline, 18, 12, 2, 2)
    rect(0xf6e0bd, 14, 16, 4, 1)
  } else if (direction === 'up') {
    rect(palette.hair, 7, 6, 18, 13)
  } else {
    const eyeX = direction === 'right' ? 18 : 12
    rect(palette.outline, eyeX, 12, 2, 2)
    rect(0xf6e0bd, direction === 'right' ? 19 : 11, 16, 2, 2)
  }

  if (appearance.hair === 'long') {
    rect(palette.hair, 7, 15, 3, 8)
    rect(palette.hair, 22, 15, 3, 8)
  } else {
    rect(palette.hair, 9, 5, 14, 4)
  }
  if (appearance.accessory === 'lantern-clip') {
    rect(palette.gold, direction === 'left' ? 8 : 22, 7, 3, 2)
    rect(palette.gold, direction === 'left' ? 9 : 23, 6, 1, 4)
  }

  if (appearance.outfit === 'dress') {
    rect(palette.outline, 6, bodyTop, 20, 13)
    rect(outfitColor, 7, bodyTop + 1, 18, 12)
    rect(appearance.accessory === 'sage-accent' ? palette.sage : palette.gold, 7, bodyTop + 10, 18, 2)
  } else {
    rect(palette.outline, 7, bodyTop, 18, 13)
    rect(outfitColor, 8, bodyTop + 1, 16, 11)
    if (appearance.outfit === 'jacket') {
      rect(palette.outline, 15, bodyTop + 1, 2, 11)
      rect(palette.gold, 15, bodyTop + 3, 2, 3)
      rect(palette.gold, 12, bodyTop + 5, 2, 2)
    } else {
      rect(palette.sage, 10, bodyTop + 1, 2, 10)
      rect(palette.sage, 20, bodyTop + 1, 2, 10)
      rect(0xe8dcc5, 15, bodyTop + 2, 2, 8)
    }
  }

  if (pose === 'wave') {
    const wavingLeft = direction === 'left'
    rect(palette.outline, wavingLeft ? 3 : 25, bodyTop - 8, 4, 10)
    rect(outfitColor, wavingLeft ? 4 : 24, bodyTop - 7, 4, 8)
    rect(palette.skin, wavingLeft ? 3 : 25, bodyTop - 11, 4, 4)
    rect(palette.outline, wavingLeft ? 23 : 5, bodyTop + 2, 4, 9)
    rect(outfitColor, wavingLeft ? 24 : 6, bodyTop + 2, 2, 7)
  } else {
    const leftArmX = 5 - Math.max(0, gait)
    const rightArmX = 23 + Math.max(0, -gait)
    rect(palette.outline, leftArmX, bodyTop + 2, 4, 9)
    rect(outfitColor, leftArmX + 1, bodyTop + 2, 2, 7)
    rect(palette.outline, rightArmX, bodyTop + 2, 4, 9)
    rect(outfitColor, rightArmX + 1, bodyTop + 2, 2, 7)
  }

  if (sitting) {
    rect(palette.trousers, 8, 31, 7, 4)
    rect(palette.trousers, 17, 31, 7, 4)
    rect(footwear === 'boots' ? palette.boots : palette.shoes, 5, 34, 8, 4)
    rect(footwear === 'boots' ? palette.boots : palette.shoes, 19, 34, 8, 4)
  } else {
    const leftLegY = 28 + Math.max(0, gait)
    const rightLegY = 28 + Math.max(0, -gait)
    rect(palette.outline, 9, leftLegY, 6, 7)
    rect(palette.trousers, 10, leftLegY, 4, 6)
    rect(palette.outline, 17, rightLegY, 6, 7)
    rect(palette.trousers, 18, rightLegY, 4, 6)
    const shoeColor = footwear === 'boots' ? palette.boots : palette.shoes
    rect(palette.outline, 8 + Math.max(0, -gait), 34, 7, 4)
    rect(shoeColor, 9 + Math.max(0, -gait), 34, 5, 3)
    rect(palette.outline, 17 + Math.max(0, gait), 34, 7, 4)
    rect(shoeColor, 18 + Math.max(0, gait), 34, 5, 3)
  }

  graphics.generateTexture(key, 32, 40)
  graphics.destroy()
}

function drawEmoteBubble(scene: Phaser.Scene, key: string, accent: number) {
  const graphics = scene.make.graphics({ x: 0, y: 0 }, false)
  graphics.fillStyle(0x192d39, 1).fillRect(1, 1, 15, 11).fillRect(4, 12, 4, 3)
  graphics.fillStyle(0xe8dcc5, 1).fillRect(2, 2, 13, 9).fillRect(4, 11, 3, 2)
  graphics.fillStyle(accent, 1).fillRect(7, 4, 3, 5).fillRect(6, 5, 5, 3).fillRect(5, 6, 7, 1)
  graphics.generateTexture(key, 17, 16)
  graphics.destroy()
}

export class CharacterSprites {
  private readonly local: Phaser.GameObjects.Sprite
  private readonly localShadow: Phaser.GameObjects.Ellipse
  private readonly localNameTag: Phaser.GameObjects.Text
  private readonly localEmoteBubble: Phaser.GameObjects.Sprite
  private readonly remote: Phaser.GameObjects.Sprite
  private readonly remoteShadow: Phaser.GameObjects.Ellipse
  private readonly remoteNameTag: Phaser.GameObjects.Text
  private readonly remoteEmoteBubble: Phaser.GameObjects.Sprite
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
    this.local = scene.add.sprite(localSpawn.x, localSpawn.y, localIdle).setDepth(localSpawn.y + 40)
    this.localNameTag = this.createNameTag(local.config.name, localSpawn.x, localSpawn.y - 20).setDepth(localSpawn.y + 42)
    this.localEmoteBubble = scene.add.sprite(localSpawn.x + 13, localSpawn.y - 31, emoteBubbleTextureKey(local.config.id))
      .setDepth(localSpawn.y + 43)
      .setVisible(false)

    this.remoteShadow = scene.add.ellipse(remoteSpawn.x, remoteSpawn.y + 17, 24, 8, remote.config.palette.outline, 0.36)
      .setDepth(remoteSpawn.y + 38)
      .setVisible(false)
    this.remote = scene.add.sprite(remoteSpawn.x, remoteSpawn.y, remoteIdle)
      .setDepth(remoteSpawn.y + 40)
      .setVisible(false)
    this.remoteNameTag = this.createNameTag(remote.config.name, remoteSpawn.x, remoteSpawn.y - 20)
      .setDepth(remoteSpawn.y + 42)
      .setVisible(false)
    this.remoteEmoteBubble = scene.add.sprite(remoteSpawn.x + 13, remoteSpawn.y - 31, emoteBubbleTextureKey(remote.config.id))
      .setDepth(remoteSpawn.y + 43)
      .setVisible(false)

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
    const forcedPose = time < this.localWaveUntil && !actuallyMoving ? 'wave' : undefined
    const animation = selectCharacterAnimation(time, actuallyMoving, this.facing, forcedPose)
    this.localPose = animation.pose
    this.localDirection = animation.direction
    this.localFrame = animation.frame
    this.setCharacterFrame(this.local, this.roster.local, animation.pose, animation.direction, animation.frame)
    this.localShadow.setPosition(x, y + 17).setDepth(y + 38)
    this.local.setDepth(y + 40)
    this.localNameTag.setPosition(x, y - 20).setDepth(y + 42)
    this.localEmoteBubble.setPosition(x + 13, y - 31).setDepth(y + 43)

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
    const forcedPose = time < this.remoteWaveUntil && !moving ? 'wave' : undefined
    const animation = selectCharacterAnimation(time, moving, this.remoteFacing, forcedPose)
    this.remotePose = animation.pose
    this.remoteDirection = animation.direction
    this.remoteFrame = animation.frame
    this.setCharacterFrame(this.remote, this.roster.remote, animation.pose, animation.direction, animation.frame)
    this.remoteShadow.setPosition(this.remote.x, this.remote.y + 17).setDepth(this.remote.y + 38)
    this.remote.setDepth(this.remote.y + 40)
    this.remoteNameTag.setPosition(this.remote.x, this.remote.y - 20).setDepth(this.remote.y + 42)
    this.remoteEmoteBubble.setPosition(this.remote.x + 13, this.remote.y - 31).setDepth(this.remote.y + 43)
  }

  setRemotePosition(position: RemotePlayerPosition | null) {
    if (position && position.uid !== this.roster.remoteUid) position = null
    this.remoteTarget = position
    if (!position) {
      this.remote.setVisible(false)
      this.remoteShadow.setVisible(false)
      this.remoteNameTag.setVisible(false)
      this.remoteEmoteBubble.setVisible(false)
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
    this.remoteNameTag.setVisible(true)
  }

  refreshLocalAppearance() {
    this.local.setTexture(characterTextureKey(this.roster.local.config.id, this.localPose, this.localDirection, this.localFrame))
  }

  refreshRemoteAppearance() {
    this.remote.setTexture(characterTextureKey(this.roster.remote.config.id, this.remotePose, this.remoteDirection, this.remoteFrame))
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
