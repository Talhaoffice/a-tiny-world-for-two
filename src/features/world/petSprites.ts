import Phaser from 'phaser'
import { logError } from '../../lib/logger'
import type { PetKind } from './petStoreStub'

// ─── Texture generation (generated once, never per frame) ─────────────────────

export function createPetTextures(scene: Phaser.Scene) {
  if (scene.textures.exists('pet/cat/idle/0')) return

  const safeDraw = (key: string, draw: () => void) => {
    try { draw() }
    catch (error) {
      logError(error, 'art/pet-texture')
      if (scene.textures.exists(key)) scene.textures.remove(key)
      const fallback = scene.make.graphics({ x: 0, y: 0 }, false)
      fallback.fillStyle(0x192d39, 1).fillRect(2, 3, 12, 11)
      fallback.fillStyle(0xe9bd68, 1).fillRect(5, 6, 2, 2).fillRect(9, 6, 2, 2)
      fallback.generateTexture(key, 16, 16)
      fallback.destroy()
    }
  }

  // Cat textures (16×16)
  safeDraw('pet/cat/idle/0', () => drawCatFrame(scene, 'pet/cat/idle/0', 'idle', 0))
  safeDraw('pet/cat/idle/1', () => drawCatFrame(scene, 'pet/cat/idle/1', 'idle', 1))
  safeDraw('pet/cat/walk/0', () => drawCatFrame(scene, 'pet/cat/walk/0', 'walk', 0))
  safeDraw('pet/cat/walk/1', () => drawCatFrame(scene, 'pet/cat/walk/1', 'walk', 1))
  safeDraw('pet/cat/walk/2', () => drawCatFrame(scene, 'pet/cat/walk/2', 'walk', 2))
  safeDraw('pet/cat/walk/3', () => drawCatFrame(scene, 'pet/cat/walk/3', 'walk', 3))
  safeDraw('pet/cat/sleep/0', () => drawCatFrame(scene, 'pet/cat/sleep/0', 'sleep', 0))

  // Fox textures (16×16)
  safeDraw('pet/fox/idle/0', () => drawFoxFrame(scene, 'pet/fox/idle/0', 'idle', 0))
  safeDraw('pet/fox/idle/1', () => drawFoxFrame(scene, 'pet/fox/idle/1', 'idle', 1))
  safeDraw('pet/fox/walk/0', () => drawFoxFrame(scene, 'pet/fox/walk/0', 'walk', 0))
  safeDraw('pet/fox/walk/1', () => drawFoxFrame(scene, 'pet/fox/walk/1', 'walk', 1))
  safeDraw('pet/fox/walk/2', () => drawFoxFrame(scene, 'pet/fox/walk/2', 'walk', 2))
  safeDraw('pet/fox/walk/3', () => drawFoxFrame(scene, 'pet/fox/walk/3', 'walk', 3))
  safeDraw('pet/fox/sleep/0', () => drawFoxFrame(scene, 'pet/fox/sleep/0', 'sleep', 0))
}

export function createPetPlaceholderTextures(scene: Phaser.Scene) {
  for (const kind of ['cat', 'fox'] as const) {
    for (const pose of ['idle', 'walk', 'sleep'] as const) {
      const frameCount = pose === 'idle' ? 2 : pose === 'walk' ? 4 : 1
      for (let frame = 0; frame < frameCount; frame += 1) {
        const key = `pet/${kind}/${pose}/${frame}`
        if (scene.textures.exists(key)) continue
        const graphics = scene.make.graphics({ x: 0, y: 0 }, false)
        graphics.fillStyle(0x192d39, 1).fillRect(2, 3, 12, 11)
        graphics.fillStyle(0xe9bd68, 1).fillRect(5, 6, 2, 2).fillRect(9, 6, 2, 2)
        graphics.generateTexture(key, 16, 16)
        graphics.destroy()
      }
    }
  }
}

function px(
  g: Phaser.GameObjects.Graphics,
  color: number,
  x: number, y: number, w: number, h: number,
) {
  g.fillStyle(color, 1).fillRect(x, y, w, h)
}

function dot(g: Phaser.GameObjects.Graphics, color: number, x: number, y: number) {
  g.fillStyle(color, 1).fillRect(x, y, 1, 1)
}

// ─── Cat drawing ──────────────────────────────────────────────────────────────
function drawCatFrame(scene: Phaser.Scene, key: string, pose: 'idle' | 'walk' | 'sleep', frame: number) {
  const g = scene.make.graphics({ x: 0, y: 0 }, false)
  const outline = 0x192d39
  const fur = 0xf0ece4     // cream cat
  const furDark = 0xd4b896 // ginger/tan patches
  const nose = 0xc08080    // soft pink nose

  if (pose === 'sleep') {
    // Curled up sleeping ball
    px(g, outline, 2, 7, 12, 8)
    px(g, fur, 3, 8, 10, 6)
    px(g, furDark, 4, 8, 4, 3)
    // Closed curved eye line
    dot(g, outline, 10, 11)
    dot(g, outline, 11, 10)
    // Curled tail
    dot(g, furDark, 2, 11)
    dot(g, furDark, 3, 12)
  } else {
    // Body
    const bob = pose === 'walk' ? (frame % 2 === 0 ? 0 : 1) : (frame === 1 ? 1 : 0)
    const legOffset = pose === 'walk' ? (frame === 1 ? -1 : frame === 3 ? 1 : 0) : 0

    // Outline
    px(g, outline, 3, 4 + bob, 10, 10)
    // Head & Body
    px(g, fur, 4, 5 + bob, 8, 8)
    // Ginger patch
    px(g, furDark, 7, 5 + bob, 4, 4)
    // Pointy ears
    dot(g, outline, 4, 3 + bob)
    dot(g, fur, 5, 4 + bob)
    dot(g, outline, 10, 3 + bob)
    dot(g, furDark, 10, 4 + bob)
    // Eyes & Nose
    dot(g, outline, 6, 8 + bob)
    dot(g, outline, 9, 8 + bob)
    dot(g, nose, 7, 9 + bob)
    // Legs
    px(g, outline, 4 + legOffset, 13, 2, 3)
    px(g, outline, 9 - legOffset, 13, 2, 3)
    // Tail
    const tailY = frame === 1 ? 7 : 6
    dot(g, furDark, 2, tailY + bob)
    dot(g, furDark, 2, tailY + 1 + bob)
    dot(g, furDark, 3, tailY + 2 + bob)
  }

  g.generateTexture(key, 16, 16)
  g.destroy()
}

// ─── Fox drawing ──────────────────────────────────────────────────────────────
function drawFoxFrame(scene: Phaser.Scene, key: string, pose: 'idle' | 'walk' | 'sleep', frame: number) {
  const g = scene.make.graphics({ x: 0, y: 0 }, false)
  const outline = 0x192d39
  const coat = 0xc98575    // terracotta
  const white = 0xfffbf0   // chest/tail tip
  const dark = 0x2c2c2c    // dark ears and paws

  if (pose === 'sleep') {
    // Curled up nose-to-tail
    px(g, outline, 1, 7, 14, 8)
    px(g, coat, 2, 8, 12, 6)
    px(g, white, 9, 10, 4, 3) // white tail tip
    dot(g, dark, 3, 9)        // black ear tip
    dot(g, outline, 5, 11)    // closed eye
  } else {
    const bob = pose === 'walk' ? (frame % 2 === 0 ? 0 : 1) : (frame === 1 ? 1 : 0)
    const legOffset = pose === 'walk' ? (frame === 1 ? -1 : frame === 3 ? 1 : 0) : 0

    // Outline
    px(g, outline, 2, 4 + bob, 11, 10)
    // Body & Head
    px(g, coat, 3, 5 + bob, 9, 8)
    // White muzzle & chest
    px(g, white, 6, 9 + bob, 4, 3)
    // Big triangular ears
    dot(g, dark, 3, 3 + bob)
    dot(g, coat, 4, 4 + bob)
    dot(g, dark, 9, 3 + bob)
    dot(g, coat, 8, 4 + bob)
    // Eyes & Nose
    dot(g, outline, 5, 8 + bob)
    dot(g, outline, 8, 8 + bob)
    dot(g, dark, 6, 10 + bob)
    // Paws
    px(g, dark, 4 + legOffset, 13, 2, 3)
    px(g, dark, 9 - legOffset, 13, 2, 3)
    // Bushy tail with white tip
    px(g, coat, 12, 6 + bob, 3, 5)
    dot(g, white, 13, 5 + bob)
    dot(g, white, 14, 6 + bob)
  }

  g.generateTexture(key, 16, 16)
  g.destroy()
}

// ─── PetCompanion simulation class ────────────────────────────────────────────

export class PetCompanion {
  private sprite: Phaser.GameObjects.Sprite | null = null
  private heartBubble: Phaser.GameObjects.Text | null = null
  private currentPose: 'idle' | 'walk' | 'sleep' = 'idle'
  private animFrame = 0
  private lastAnimTime = 0
  private stationarySince = 0
  private isSleeping = false
  private history: { x: number; y: number }[] = []
  private x = 0
  private y = 0
  private lastOwnerX = 0
  private lastOwnerY = 0

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly kind: PetKind,
    private readonly petName: string,
    initialX: number,
    initialY: number,
  ) {
    if (kind === 'none') return

    createPetTextures(scene)
    this.x = initialX + 16
    this.y = initialY + 8
    this.lastOwnerX = initialX
    this.lastOwnerY = initialY
    this.stationarySince = scene.time.now

    this.sprite = scene.add.sprite(this.x, this.y, `pet/${kind}/idle/0`)
      .setOrigin(0.5, 0.8)
      .setDepth(this.y + 35)

    this.heartBubble = scene.add.text(this.x, this.y - 18, '♡', {
      fontFamily: 'monospace',
      fontSize: '15px',
      color: '#ffb3ba',
      stroke: '#192d39',
      strokeThickness: 3,
    }).setOrigin(0.5, 1).setDepth(this.y + 40).setVisible(false)
  }

  getKind(): PetKind {
    return this.kind
  }

  getName(): string {
    return this.petName
  }

  getPosition(): { x: number; y: number } {
    return { x: this.x, y: this.y }
  }

  update(ownerX: number, ownerY: number, time: number) {
    if (!this.sprite || this.kind === 'none') return

    // Record owner movement
    const ownerMoved = Math.hypot(ownerX - this.lastOwnerX, ownerY - this.lastOwnerY) > 0.4
    if (ownerMoved) {
      this.lastOwnerX = ownerX
      this.lastOwnerY = ownerY
      this.stationarySince = time
      if (this.isSleeping) {
        this.isSleeping = false
      }
      this.history.push({ x: ownerX, y: ownerY })
      if (this.history.length > 20) {
        this.history.shift()
      }
    } else {
      if (!this.isSleeping && time - this.stationarySince > 4500) {
        this.isSleeping = true
      }
    }

    // Target calculation: follow delayed trail or trail behind owner
    let targetX = ownerX + 18
    let targetY = ownerY + 10
    if (this.history.length > 8) {
      const trail = this.history[0]
      targetX = trail.x
      targetY = trail.y
    }

    const distToOwner = Math.hypot(ownerX - this.x, ownerY - this.y)
    const distToTarget = Math.hypot(targetX - this.x, targetY - this.y)

    // Move smoothly if not sleeping and sufficiently far
    if (!this.isSleeping && (distToOwner > 26 || distToTarget > 6)) {
      // Lerp smoothly toward target
      const speed = Math.min(0.18, Math.max(0.06, distToOwner / 200))
      this.x = Phaser.Math.Linear(this.x, targetX, speed)
      this.y = Phaser.Math.Linear(this.y, targetY, speed)

      // Facing
      if (targetX < this.x - 1) this.sprite.setFlipX(true)
      else if (targetX > this.x + 1) this.sprite.setFlipX(false)

      this.currentPose = 'walk'
    } else if (this.isSleeping) {
      this.currentPose = 'sleep'
    } else {
      this.currentPose = 'idle'
    }

    // Animation frames
    if (time - this.lastAnimTime > 180) {
      this.lastAnimTime = time
      const maxFrames = this.currentPose === 'walk' ? 4 : this.currentPose === 'idle' ? 2 : 1
      this.animFrame = (this.animFrame + 1) % maxFrames
      const frameKey = `pet/${this.kind}/${this.currentPose}/${this.currentPose === 'sleep' ? 0 : this.animFrame}`
      if (this.scene.textures.exists(frameKey)) {
        this.sprite.setTexture(frameKey)
      }
    }

    this.sprite.setPosition(this.x, this.y).setDepth(this.y + 35)
    if (this.heartBubble?.visible) {
      this.heartBubble.setPosition(this.x, this.y - 18).setDepth(this.y + 40)
    }
  }

  pet() {
    if (!this.sprite || this.kind === 'none') return

    // Wake up if sleeping
    this.isSleeping = false
    this.stationarySince = this.scene.time.now

    // Show heart pop
    if (this.heartBubble) {
      this.heartBubble.setVisible(true).setAlpha(1).setScale(0.8)
      this.scene.tweens.add({
        targets: this.heartBubble,
        y: this.y - 26,
        alpha: 0,
        scaleX: 1.3,
        scaleY: 1.3,
        duration: 900,
        ease: 'Quad.Out',
        onComplete: () => {
          this.heartBubble?.setVisible(false)
        },
      })
    }

    // Gentle purr/chime sound
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      const ctx = new AudioCtx()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'triangle'
      osc.frequency.setValueAtTime(260, ctx.currentTime)
      osc.frequency.exponentialRampToValueAtTime(520, ctx.currentTime + 0.25)
      gain.gain.setValueAtTime(0.04, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start()
      osc.stop(ctx.currentTime + 0.3)
      setTimeout(() => { void ctx.close() }, 500)
    } catch {
      /* ignore audio errors */
    }
  }

  destroy() {
    this.sprite?.destroy()
    this.heartBubble?.destroy()
    this.sprite = null
    this.heartBubble = null
  }
}
