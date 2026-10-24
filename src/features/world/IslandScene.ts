import Phaser from 'phaser'
import type { Destination } from '../destinations/types'
import { isEditableTarget, shouldCaptureGameKeyboard } from './keyboardInput'
import { recordFrame } from '../../lib/diagnostics'
import { characterTextureKey } from '../../assets/registry'
import { CharacterSprites, createCharacterAppearanceTextures, createCharacterTextures } from './characterSprites'
import type { CharacterRoster, ResolvedCharacter } from './characterRoster'
import type { CharacterAppearance, CharacterDirection, CharacterPose } from './characters.config'
import { isCharacterAppearance } from './characters.config'
import type { GardenCornerEffects } from './gardenCornerEffects'
import type { WorldEmoteType } from './worldEmotes'
import { atmosphereTint, type DayNightMode, type DecorativeWeather } from './worldAtmosphere'

const TILE = 32
const COLUMNS = 48
const ROWS = 32
const WORLD_WIDTH = COLUMNS * TILE
const WORLD_HEIGHT = ROWS * TILE
const CENTER_COLUMN = 24
const CENTER_ROW = 16
const LAND_RADIUS_X = 21
const LAND_RADIUS_Y = 13
const WALK_SPEED = 170
const POND_COLLISION_CELL = 4

export type Direction = 'up' | 'down' | 'left' | 'right'

export type IslandPlace = {
  id: Destination | 'lantern-post' | 'greenhouse' | 'bench' | 'blanket' | 'pond-lantern'
  label: string
  detail: string
  x: number
  y: number
}

export type RemotePlayerPosition = { uid: string; x: number; y: number; appearance?: CharacterAppearance; emote?: WorldEmoteType }
export type AtmosphereSettings = { dayNight: DayNightMode; weather: DecorativeWeather; reducedMotion: boolean; lowPower: boolean }

const PLACES: IslandPlace[] = [
  { id: 'home', label: 'Our Home', detail: 'Leave a note or tuck away a small keepsake.', x: CENTER_COLUMN * TILE + 16, y: 14 * TILE + 16 },
  { id: 'garden', label: 'Memory Garden', detail: 'Plant a flower for a memory you share.', x: 32 * TILE + 16, y: 19 * TILE + 16 },
  { id: 'mailbox', label: 'Mailbox', detail: 'Write a letter for your person.', x: 26 * TILE + 16, y: 20 * TILE + 16 },
  { id: 'lantern-post', label: 'Talha’s Lantern Post & Workshop', detail: 'Visit the shared pond and tend a lantern.', x: 20 * TILE + 16, y: 22 * TILE + 16 },
  { id: 'greenhouse', label: 'Mannu’s Greenhouse & Dressing Nook', detail: 'Visit the flowers, water a plot, or pick a look.', x: 34 * TILE + 16, y: 20 * TILE + 16 },
  { id: 'bench', label: 'Pond Bench', detail: 'Sit for a little while beside the water.', x: 13 * TILE + 16, y: 18 * TILE + 16 },
  { id: 'blanket', label: 'Picnic Blanket', detail: 'Take a quiet seat beneath the trees.', x: 17 * TILE + 16, y: 22 * TILE + 16 },
  { id: 'pond-lantern', label: 'Pond Lantern', detail: 'Light or dim the small lantern beside the water.', x: 18 * TILE + 16, y: 18 * TILE + 16 },
]

const PATH_TILES = new Set<string>()
for (let row = 14; row <= 20; row += 1) PATH_TILES.add(`${CENTER_COLUMN},${row}`)
for (let column = 15; column <= CENTER_COLUMN; column += 1) PATH_TILES.add(`${column},20`)
for (let column = CENTER_COLUMN; column <= 32; column += 1) PATH_TILES.add(`${column},20`)

function inIsland(column: number, row: number) {
  const x = (column - CENTER_COLUMN) / LAND_RADIUS_X
  const y = (row - CENTER_ROW) / LAND_RADIUS_Y
  return x * x + y * y <= 1
}

function seededValue(column: number, row: number, salt: number) {
  const value = Math.sin(column * 127.1 + row * 311.7 + salt * 74.7) * 43758.5453
  return value - Math.floor(value)
}

export class IslandScene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Sprite
  private characterSprites!: CharacterSprites
  private readonly roster: CharacterRoster
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys
  private wasd!: Record<'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key>
  private interactKey!: Phaser.Input.Keyboard.Key
  private solids!: Phaser.Physics.Arcade.StaticGroup
  private readonly touchPointers = new Map<number, Direction>()
  private activePlace: IslandPlace | null = null
  private previousInteractDown = false
  private destinationOpen = false
  private lastReportedAt = Number.NEGATIVE_INFINITY
  private lastReportedX = Number.NaN
  private lastReportedY = Number.NaN
  private readonly onNearbyChange: (place: IslandPlace | null) => void
  private readonly onInspect: (place: IslandPlace) => void
  private readonly onPlayerPosition: (x: number, y: number, time: number) => void
  private dayNightMode: DayNightMode = 'auto'
  private decorativeWeather: DecorativeWeather = 'clear'
  private reducedMotion = false
  private lowPower = false
  private lastAtmosphereUpdate = Number.NEGATIVE_INFINITY
  private atmosphereShade!: Phaser.GameObjects.Rectangle
  private weatherLayer!: Phaser.GameObjects.Graphics
  private readonly ambientTweens: Array<{ tween: Phaser.Tweens.Tween; lowPowerOk: boolean }> = []
  private readonly ambientFireflies: Phaser.GameObjects.Arc[] = []
  private readonly gardenFireflies: Phaser.GameObjects.Arc[] = []
  private gardenGlow!: Phaser.GameObjects.Ellipse
  private gardenGrowth!: Phaser.GameObjects.Graphics
  private gardenEffects: GardenCornerEffects = { lanternGlow: false, gardenFireflies: false, gardenGrowth: false }
  private pondLanternGlow!: Phaser.GameObjects.Ellipse
  private pondLanternLit = false
  private specialDateGlow = false
  private specialDateStars!: Phaser.GameObjects.Text

  constructor(
    onNearbyChange: (place: IslandPlace | null) => void,
    onInspect: (place: IslandPlace) => void,
    onPlayerPosition: (x: number, y: number, time: number) => void,
    roster: CharacterRoster,
  ) {
    super('island')
    this.onNearbyChange = onNearbyChange
    this.onInspect = onInspect
    this.onPlayerPosition = onPlayerPosition
    this.roster = roster
  }

  create() {
    this.createTextures()
    this.drawGround()
    this.drawPath()
    this.drawPond()
    this.drawCottage()
    this.drawTrees()
    this.drawGarden()
    this.drawPlaceMarkers()
    this.createAtmosphere()
    this.createCollisions()
    this.createPlayer()
    this.createControls()
    this.game.canvas.tabIndex = 0
    this.game.canvas.setAttribute('aria-label', 'Island game area. Use WASD or arrow keys to walk and E to explore nearby places.')
    this.game.canvas.addEventListener('pointerdown', this.focusGameCanvas)

    this.physics.world.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT)
    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT)
    this.cameras.main.startFollow(this.player, true, 0.09, 0.09)
    this.cameras.main.setDeadzone(40, 30)
    this.cameras.main.setBackgroundColor('#294657')
    this.events.on(Phaser.Scenes.Events.SHUTDOWN, this.releaseTouchControls, this)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      const document = this.game.canvas.ownerDocument
      document.removeEventListener('keydown', this.handleKeyboardEvent, true)
      document.removeEventListener('keyup', this.handleKeyboardEvent, true)
      document.removeEventListener('focusin', this.handleEditableFocus, true)
      document.removeEventListener('focusout', this.handleEditableBlur, true)
      this.input.keyboard?.enableGlobalCapture()
      this.game.canvas.removeEventListener('pointerdown', this.focusGameCanvas)
    })
  }

  update(time: number) {
    recordFrame(time)
    const editableFocused = isEditableTarget(this.game.canvas.ownerDocument.activeElement)
    const keyboardEnabled = !this.destinationOpen && !editableFocused
    const horizontal = this.destinationOpen ? 0 : Number((keyboardEnabled && (this.cursors.right.isDown || this.wasd.D.isDown)) || this.hasTouchDirection('right'))
      - Number((keyboardEnabled && (this.cursors.left.isDown || this.wasd.A.isDown)) || this.hasTouchDirection('left'))
    const vertical = this.destinationOpen ? 0 : Number((keyboardEnabled && (this.cursors.down.isDown || this.wasd.S.isDown)) || this.hasTouchDirection('down'))
      - Number((keyboardEnabled && (this.cursors.up.isDown || this.wasd.W.isDown)) || this.hasTouchDirection('up'))
    const magnitude = Math.hypot(horizontal, vertical)
    const normalizedX = magnitude > 0 ? horizontal / magnitude : 0
    const normalizedY = magnitude > 0 ? vertical / magnitude : 0

    this.player.setVelocity(normalizedX * WALK_SPEED, normalizedY * WALK_SPEED)
    this.characterSprites.updateLocal(this.player.x, this.player.y, time, magnitude > 0, normalizedX, normalizedY)
    const moved = Math.abs(this.player.x - this.lastReportedX) >= 2 || Math.abs(this.player.y - this.lastReportedY) >= 2
    if (!this.destinationOpen && ((moved && time - this.lastReportedAt >= 100) || time - this.lastReportedAt >= 10_000)) {
      this.lastReportedAt = time
      this.lastReportedX = this.player.x
      this.lastReportedY = this.player.y
      this.onPlayerPosition(this.player.x, this.player.y, time)
    }
    this.characterSprites.updateRemote(time)
    if (time - this.lastAtmosphereUpdate >= 30_000) this.refreshAtmosphere()
    this.drawDecorativeWeather(time)

    const place = PLACES.find(candidate => Phaser.Math.Distance.Between(this.player.x, this.player.y, candidate.x, candidate.y) < 66) ?? null
    if (place?.id !== this.activePlace?.id) {
      this.activePlace = place
      this.onNearbyChange(place)
    }

    const interactDown = keyboardEnabled && this.interactKey.isDown
    if ((interactDown && !this.previousInteractDown) && this.activePlace) this.onInspect(this.activePlace)
    this.previousInteractDown = interactDown
  }

  setTouchPointer(pointerId: number, direction: Direction) {
    this.touchPointers.set(pointerId, direction)
  }

  releaseTouchPointer(pointerId: number) {
    this.touchPointers.delete(pointerId)
  }

  releaseTouchPointers() {
    this.touchPointers.clear()
  }

  inspectNearbyPlace() {
    if (this.activePlace) this.onInspect(this.activePlace)
  }

  setDestinationOpen(open: boolean) {
    this.destinationOpen = open
    if (open) this.releaseTouchPointers()
  }

  setAtmosphereSettings(settings: AtmosphereSettings) {
    this.dayNightMode = settings.dayNight
    this.decorativeWeather = settings.weather
    this.reducedMotion = settings.reducedMotion
    this.lowPower = settings.lowPower
    this.refreshAmbientMotion()
    this.refreshAtmosphere()
  }

  setGardenEffects(effects: GardenCornerEffects) {
    this.gardenEffects = effects
    if (!this.gardenGlow) return
    this.refreshGardenGlow()
    this.gardenGrowth.setVisible(effects.gardenGrowth)
    this.gardenFireflies.forEach((fly, index) => fly.setVisible(effects.gardenFireflies && (!this.lowPower || index < 2)))
  }

  updateLocalAppearance(appearance: CharacterAppearance) {
    this.roster.local.appearance = appearance
    this.refreshCharacterTextures(this.roster.local)
    this.characterSprites.refreshLocalAppearance()
  }

  private refreshCharacterTextures(character: ResolvedCharacter) {
    const directions: CharacterDirection[] = ['down', 'left', 'right', 'up']
    const poses: CharacterPose[] = ['idle', 'walk', 'wave', 'sit']
    const frameCounts: Record<CharacterPose, number> = { idle: 2, walk: 6, wave: 1, sit: 1 }
    for (const pose of poses) {
      for (const direction of directions) {
        for (let frame = 0; frame < frameCounts[pose]; frame += 1) {
          this.textures.remove(characterTextureKey(character.config.id, pose, direction, frame))
        }
      }
    }
    createCharacterAppearanceTextures(this, character)
  }

  setRemotePosition(position: RemotePlayerPosition | null) {
    if (position?.appearance && isCharacterAppearance(position.appearance)) {
      const current = this.roster.remote.appearance
      const next = position.appearance
      if (current.hair !== next.hair || current.outfit !== next.outfit || current.accessory !== next.accessory) {
        this.roster.remote.appearance = next
        this.refreshCharacterTextures(this.roster.remote)
        this.characterSprites.refreshRemoteAppearance()
      }
    }
    this.characterSprites.setRemotePosition(position)
    if (position?.emote) this.playRemoteEmote(position.emote)
  }

  playLocalEmote(kind: WorldEmoteType) {
    if (kind === 'pond-lantern-on' || kind === 'pond-lantern-off') this.setPondLanternLit(kind === 'pond-lantern-on')
    this.characterSprites.playLocalEmote(kind)
  }

  playRemoteEmote(kind: WorldEmoteType) {
    if (kind === 'pond-lantern-on' || kind === 'pond-lantern-off') this.setPondLanternLit(kind === 'pond-lantern-on')
    this.characterSprites.playRemoteEmote(kind)
  }

  isPondLanternLit() {
    return this.pondLanternLit
  }

  setSpecialDateGlow(enabled: boolean) {
    this.specialDateGlow = enabled
    this.specialDateStars?.setVisible(enabled)
    this.refreshGardenGlow()
  }

  getLocalPosition() {
    return { x: this.player.x, y: this.player.y }
  }

  private releaseTouchControls() {
    this.releaseTouchPointers()
  }

  private hasTouchDirection(direction: Direction) {
    return [...this.touchPointers.values()].includes(direction)
  }

  private focusGameCanvas = () => {
    this.game.canvas.focus({ preventScroll: true })
  }

  private readonly handleKeyboardEvent = (event: KeyboardEvent) => {
    const keyboard = this.input.keyboard
    if (!keyboard) return
    if (shouldCaptureGameKeyboard(event.target, this.game.canvas.ownerDocument.activeElement)) {
      keyboard.enableGlobalCapture()
    } else {
      keyboard.disableGlobalCapture()
    }
  }

  private readonly handleEditableFocus = (event: FocusEvent) => {
    if (isEditableTarget(event.target)) this.input.keyboard?.disableGlobalCapture()
  }

  private readonly handleEditableBlur = () => {
    queueMicrotask(() => {
      const keyboard = this.input.keyboard
      if (!keyboard) return
      if (isEditableTarget(this.game.canvas.ownerDocument.activeElement)) keyboard.disableGlobalCapture()
      else keyboard.enableGlobalCapture()
    })
  }

  private createTextures() {
    createCharacterTextures(this, this.roster)
    const block = this.make.graphics({ x: 0, y: 0 }, false)
    block.fillStyle(0xffffff, 1).fillRect(0, 0, TILE, TILE).generateTexture('solid-tile', TILE, TILE)
    block.destroy()
    const canopy = this.make.graphics({ x: 0, y: 0 }, false)
    canopy.fillStyle(0x425b51, 1).fillRect(0, 8, 44, 27)
    canopy.fillStyle(0x526f5d, 1).fillRect(4, 0, 36, 30)
    canopy.fillStyle(0x6f8969, 1).fillRect(11, 5, 9, 6).fillRect(28, 18, 8, 5)
    canopy.generateTexture('tree-canopy', 44, 36)
    canopy.destroy()
  }

  private drawGround() {
    const graphics = this.add.graphics().setDepth(0)
    graphics.fillStyle(0x294657, 1).fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT)

    for (let row = 0; row < ROWS; row += 1) {
      for (let column = 0; column < COLUMNS; column += 1) {
        const x = column * TILE
        const y = row * TILE
        const land = inIsland(column, row)
        if (land) {
          const shade = seededValue(column, row, 1) > 0.6 ? 0x839b78 : seededValue(column, row, 2) > 0.5 ? 0x789078 : 0x728a70
          graphics.fillStyle(shade, 1).fillRect(x, y, TILE, TILE)
          if (seededValue(column, row, 3) > 0.78) {
            graphics.fillStyle(0x9bad7c, 0.58).fillRect(x + 6, y + 8, 3, 3).fillRect(x + 22, y + 21, 3, 3)
          }
        } else if (seededValue(column, row, 4) > 0.58) {
          graphics.fillStyle(0x35576a, 0.65).fillRect(x + 5, y + 12, 12, 2).fillRect(x + 19, y + 21, 7, 2)
        }
      }
    }
  }

  private drawPath() {
    const graphics = this.add.graphics().setDepth(1)
    for (const tile of PATH_TILES) {
      const [column, row] = tile.split(',').map(Number)
      const x = column * TILE
      const y = row * TILE
      graphics.fillStyle(0xb99d76, 1).fillRect(x, y, TILE, TILE)
      graphics.fillStyle(0xd0b994, 0.85).fillRect(x + 3, y + 4, TILE - 7, 5).fillRect(x + 7, y + 20, TILE - 12, 4)
    }
  }

  private drawPond() {
    const x = 15 * TILE
    const y = 17 * TILE
    const water = this.add.graphics().setDepth(2)
    water.fillStyle(0x627d65, 1).fillEllipse(x + 48, y + 32, 126, 90)
    water.fillStyle(0x63959a, 1).fillEllipse(x + 48, y + 30, 108, 70)
    water.fillStyle(0xa9c4b1, 0.72).fillRect(x + 26, y + 16, 25, 3).fillRect(x + 64, y + 34, 15, 3)
    const lanternX = 18 * TILE + 16
    const lanternY = 18 * TILE - 10
    this.pondLanternGlow = this.add.ellipse(lanternX, lanternY + 17, 74, 55, 0xf2cb78, 0.18)
      .setDepth(3).setBlendMode(Phaser.BlendModes.ADD).setVisible(false)
    const lantern = this.add.graphics().setDepth(lanternY + 28)
    lantern.fillStyle(0x765b4b, 1).fillRect(lanternX - 2, lanternY + 8, 4, 30)
    lantern.fillStyle(0x765b4b, 1).fillRect(lanternX - 8, lanternY + 5, 16, 3)
    lantern.fillStyle(0xe9bd68, 1).fillRect(lanternX - 6, lanternY + 9, 12, 10)
    lantern.fillStyle(0xffe5a2, 1).fillRect(lanternX - 2, lanternY + 11, 4, 6)
    this.add.text(x + 15, y - 25, 'POND', { fontFamily: 'monospace', fontSize: '12px', color: '#f1e4c6', backgroundColor: '#263747cc', padding: { x: 5, y: 3 } }).setDepth(12)
  }

  private drawCottage() {
    const x = CENTER_COLUMN * TILE - 50
    const y = 9 * TILE
    const house = this.add.graphics().setDepth(y + 100)
    house.fillStyle(0x76554b, 1).fillRect(x + 5, y + 55, 96, 70)
    house.fillStyle(0xc98575, 1).fillRect(x + 10, y + 58, 86, 62)
    house.fillStyle(0x80564d, 1).fillPoints([new Phaser.Math.Vector2(x - 3, y + 62), new Phaser.Math.Vector2(x + 53, y + 9), new Phaser.Math.Vector2(x + 108, y + 62)], true)
    house.fillStyle(0xa9685c, 1).fillPoints([new Phaser.Math.Vector2(x + 5, y + 59), new Phaser.Math.Vector2(x + 53, y + 17), new Phaser.Math.Vector2(x + 101, y + 59)], true)
    house.fillStyle(0x76554b, 1).fillRect(x + 76, y + 18, 10, 27).fillRect(x + 73, y + 16, 16, 5)
    house.fillStyle(0x76554b, 1).fillRect(x + 42, y + 82, 23, 38)
    house.fillStyle(0xe9bd68, 1).fillRect(x + 17, y + 72, 16, 18).fillRect(x + 74, y + 72, 16, 18)
    house.fillStyle(0xffe4a0, 0.55).fillRect(x + 20, y + 75, 4, 12).fillRect(x + 77, y + 75, 4, 12)
    house.fillStyle(0x6d4b45, 1).fillRect(x + 14, y + 114, 80, 6)
    this.add.text(x + 25, y - 18, 'COTTAGE', { fontFamily: 'monospace', fontSize: '12px', color: '#fff1cb', backgroundColor: '#263747cc', padding: { x: 5, y: 3 } }).setDepth(12)
  }

  private drawTrees() {
    const trees = [[13, 12], [35, 12], [30, 24], [17, 23], [37, 19]] as const
    for (const [column, row] of trees) {
      const x = column * TILE + 16
      const y = row * TILE + 16
      const trunk = this.add.graphics().setDepth(y + 29)
      trunk.fillStyle(0x765b4b, 1).fillRect(x - 5, y + 3, 10, 24)
      const canopy = this.add.image(x, y - 10, 'tree-canopy').setDepth(y + 30)
      const tween = this.tweens.add({ targets: canopy, angle: 1.7, duration: 2100 + seededValue(column, row, 9) * 1100, yoyo: true, repeat: -1, ease: 'Sine.InOut' })
      this.ambientTweens.push({ tween, lowPowerOk: this.ambientTweens.length < 2 })
    }
  }

  private drawGarden() {
    this.gardenGlow = this.add.ellipse(32 * TILE, 19 * TILE + 8, 182, 116, 0xffd78d, 0.2)
      .setDepth(2)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setVisible(false)
    const flowers = this.add.graphics().setDepth(3)
    this.gardenGrowth = this.add.graphics().setDepth(4).setVisible(false)
    this.gardenGrowth.fillStyle(0x91aa74, 1)
      .fillRect(30 * TILE + 19, 18 * TILE + 12, 3, 10)
      .fillRect(32 * TILE + 47, 19 * TILE + 5, 3, 12)
      .fillRect(34 * TILE + 14, 20 * TILE + 3, 3, 9)
    this.gardenGrowth.fillStyle(0xf0d68c, 1)
      .fillCircle(30 * TILE + 20, 18 * TILE + 10, 3)
      .fillCircle(32 * TILE + 48, 19 * TILE + 3, 3)
      .fillCircle(34 * TILE + 15, 20 * TILE + 1, 3)
    const colors = [0xe5c779, 0xd89787, 0xf0e2c0, 0xc98575]
    for (let index = 0; index < 30; index += 1) {
      const column = 29 + Math.floor(seededValue(index, 19, 12) * 7)
      const row = 17 + Math.floor(seededValue(index, 22, 8) * 5)
      const x = column * TILE + 8 + Math.floor(seededValue(index, row, 2) * 14)
      const y = row * TILE + 8 + Math.floor(seededValue(column, index, 5) * 14)
      flowers.fillStyle(0x536f52, 1).fillRect(x, y + 3, 2, 6)
      flowers.fillStyle(colors[index % colors.length], 1).fillRect(x - 2, y, 6, 4).fillRect(x, y - 2, 2, 8)
    }
    this.add.text(31 * TILE, 16 * TILE, 'FLOWERS', { fontFamily: 'monospace', fontSize: '12px', color: '#fff1cb', backgroundColor: '#263747cc', padding: { x: 5, y: 3 } }).setDepth(12)
    this.specialDateStars = this.add.text(31 * TILE + 12, 16 * TILE + 20, '✦  ✧  ✦', {
      fontFamily: 'monospace', fontSize: '13px', color: '#fff1cb',
    }).setDepth(13).setVisible(false)
  }

  private drawPlaceMarkers() {
    for (const place of PLACES) {
      if (place.id === 'mailbox') {
        const mailbox = this.add.graphics({ x: place.x + 21, y: place.y - 45 }).setDepth(place.y + 16)
        mailbox.fillStyle(0x765b4b, 1).fillRect(12, 14, 5, 30)
        mailbox.fillStyle(0xc98575, 1).fillRect(0, 2, 29, 19)
        mailbox.lineStyle(2, 0x765b4b, 1).strokeRect(0, 2, 29, 19)
        mailbox.fillStyle(0xf3dfb0, 1).fillRect(11, 8, 6, 3)
        const flag = this.add.graphics({ x: place.x + 33, y: place.y - 48 }).setDepth(place.y + 18)
        flag.fillStyle(0x765b4b, 1).fillRect(0, 0, 3, 15)
        flag.fillStyle(0xe9bd68, 1).fillPoints([new Phaser.Math.Vector2(3, 1), new Phaser.Math.Vector2(20, 1), new Phaser.Math.Vector2(15, 8), new Phaser.Math.Vector2(3, 8)], true)
        const flagTween = this.tweens.add({ targets: flag, angle: 5, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.InOut' })
        this.ambientTweens.push({ tween: flagTween, lowPowerOk: false })
      } else if (place.id === 'lantern-post') {
        const workshop = this.add.graphics({ x: place.x - 34, y: place.y - 57 }).setDepth(place.y + 13)
        workshop.fillStyle(0x765b4b, 1).fillRect(0, 27, 48, 22).fillRect(5, 20, 38, 8)
        workshop.fillStyle(0xb88761, 1).fillRect(3, 29, 42, 16)
        workshop.fillStyle(0xe9bd68, 1).fillRect(12, 33, 5, 5).fillRect(29, 33, 5, 5)
        workshop.fillStyle(0x765b4b, 1).fillRect(48, 8, 4, 40)
        workshop.fillStyle(0xffe3a0, 1).fillRect(43, 10, 14, 13).fillRect(46, 7, 8, 3)
        workshop.fillStyle(0xe9bd68, 0.28).fillRect(40, 24, 20, 9)
      } else if (place.id === 'greenhouse') {
        const greenhouse = this.add.graphics({ x: place.x - 43, y: place.y - 52 }).setDepth(place.y + 12)
        greenhouse.fillStyle(0x789078, 0.72).fillRect(0, 18, 62, 27)
        greenhouse.lineStyle(3, 0x536f52, 1).strokeRect(0, 18, 62, 27)
        greenhouse.lineStyle(3, 0x536f52, 1).lineBetween(31, 18, 31, 45).lineBetween(0, 18, 14, 2).lineBetween(14, 2, 48, 2).lineBetween(48, 2, 62, 18)
        greenhouse.fillStyle(0x765b4b, 1).fillRect(9, 37, 12, 9).fillRect(39, 37, 12, 9)
        greenhouse.fillStyle(0x91aa74, 1).fillRect(13, 28, 3, 11).fillRect(44, 26, 3, 13)
        greenhouse.fillStyle(0xe5c779, 1).fillCircle(14, 25, 4).fillCircle(45, 23, 4)
      } else if (place.id === 'bench') {
        const bench = this.add.graphics({ x: place.x - 18, y: place.y - 26 }).setDepth(place.y + 12)
        bench.fillStyle(0x765b4b, 1).fillRect(0, 4, 36, 7).fillRect(4, 12, 28, 7).fillRect(4, 20, 4, 9).fillRect(28, 20, 4, 9)
        bench.fillStyle(0xb88761, 1).fillRect(2, 5, 32, 4).fillRect(6, 13, 24, 4)
      } else if (place.id === 'blanket') {
        const picnic = this.add.graphics({ x: place.x - 24, y: place.y - 20 }).setDepth(place.y + 5)
        picnic.fillStyle(0xc98575, 0.9).fillRect(0, 4, 48, 28)
        picnic.fillStyle(0xe8dcc5, 0.82).fillRect(4, 8, 40, 4).fillRect(4, 18, 40, 4).fillRect(4, 27, 40, 3)
        picnic.fillStyle(0x789078, 1).fillRect(18, 11, 12, 12)
      }
      const marker = this.add.graphics().setDepth(13)
      marker.fillStyle(0x263747, 0.88).fillCircle(place.x, place.y - 20, 11)
      marker.lineStyle(2, 0xe9bd68, 1).strokeCircle(place.x, place.y - 20, 11)
      this.add.text(place.x - 4, place.y - 26, 'E', { fontFamily: 'monospace', fontSize: '12px', color: '#e9bd68' }).setDepth(14)
    }
  }

  private createAtmosphere() {
    this.atmosphereShade = this.add.rectangle(0, 0, WORLD_WIDTH, WORLD_HEIGHT, 0xffffff, 0)
      .setOrigin(0)
      .setDepth(1000)
    this.weatherLayer = this.add.graphics().setDepth(1001)

    for (let index = 0; index < 4; index += 1) {
      const x = -160 - index * 370
      const y = 70 + (index % 2) * 106
      const cloud = this.add.graphics({ x, y }).setDepth(18).setAlpha(0.25)
      cloud.fillStyle(0xf0e9d4, 0.75).fillEllipse(36, 23, 66, 20).fillCircle(21, 19, 15).fillCircle(38, 13, 18).fillCircle(55, 19, 14)
      const tween = this.tweens.add({ targets: cloud, x: WORLD_WIDTH + 120, duration: 135_000 + index * 21_000, repeat: -1, delay: index * 9_000 })
      this.ambientTweens.push({ tween, lowPowerOk: index === 0 })
    }

    for (let index = 0; index < 7; index += 1) {
      const x = 13 * TILE + 42 + seededValue(index, 4, 1) * 118
      const y = 18 * TILE + 12 + seededValue(index, 8, 2) * 48
      const firefly = this.add.circle(x, y, 2.4, 0xf4d889, 0.8).setDepth(y + 24).setBlendMode(Phaser.BlendModes.ADD)
      this.ambientFireflies.push(firefly)
      const tween = this.tweens.add({ targets: firefly, x: x + (index % 2 === 0 ? 12 : -12), y: y - 10, alpha: 0.22, duration: 850 + index * 170, yoyo: true, repeat: -1, delay: index * 170, ease: 'Sine.InOut' })
      this.ambientTweens.push({ tween, lowPowerOk: index < 2 })
    }

    for (let index = 0; index < 4; index += 1) {
      const x = 30 * TILE + 20 + index * 26
      const y = 18 * TILE + 15 + (index % 2) * 35
      const firefly = this.add.circle(x, y, 2.2, 0xf4d889, 0.86).setDepth(y + 24).setBlendMode(Phaser.BlendModes.ADD).setVisible(false)
      this.gardenFireflies.push(firefly)
      const tween = this.tweens.add({ targets: firefly, x: x + (index % 2 ? -12 : 13), y: y - 9, alpha: 0.18, duration: 1000 + index * 240, yoyo: true, repeat: -1, delay: index * 230, ease: 'Sine.InOut' })
      this.ambientTweens.push({ tween, lowPowerOk: false })
    }

    for (let index = 0; index < 3; index += 1) {
      const ripple = this.add.ellipse(15 * TILE + 32 + index * 30, 17 * TILE + 28 + index % 2 * 19, 18, 5, 0xc0d6c1, 0.38).setDepth(4)
      const tween = this.tweens.add({ targets: ripple, scaleX: 2, scaleY: 1.4, alpha: 0.05, duration: 1300 + index * 500, yoyo: true, repeat: -1, delay: index * 800, ease: 'Sine.InOut' })
      this.ambientTweens.push({ tween, lowPowerOk: index === 0 })
    }

    const cottageX = CENTER_COLUMN * TILE - 50
    const cottageY = 9 * TILE
    for (let index = 0; index < 3; index += 1) {
      const smoke = this.add.circle(cottageX + 82, cottageY + 17, 5 + index, 0xe5d6bd, 0.28).setDepth(cottageY + 15).setScale(0.65)
      const tween = this.tweens.add({ targets: smoke, y: cottageY - 22, x: cottageX + 92, alpha: 0.02, scale: 1.3, duration: 3400, repeat: -1, delay: index * 1250, onRepeat: () => smoke.setPosition(cottageX + 82, cottageY + 17).setAlpha(0.28).setScale(0.65) })
      this.ambientTweens.push({ tween, lowPowerOk: index === 0 })
    }

    this.refreshAtmosphere()
    this.refreshAmbientMotion()
  }

  private refreshAtmosphere() {
    if (!this.atmosphereShade) return
    const tint = atmosphereTint(new Date().getHours(), this.dayNightMode)
    this.atmosphereShade.setFillStyle(tint.color, tint.alpha)
    this.ambientFireflies.forEach((firefly, index) => firefly.setVisible(!this.lowPower || index < 3))
    this.gardenFireflies.forEach((firefly, index) => firefly.setVisible(this.gardenEffects.gardenFireflies && (!this.lowPower || index < 2)))
  }

  private refreshGardenGlow() {
    if (!this.gardenGlow) return
    this.gardenGlow.setFillStyle(this.specialDateGlow ? 0xfff1bf : 0xffd78d, this.specialDateGlow ? 0.16 : 0.2)
      .setVisible(this.gardenEffects.lanternGlow || this.specialDateGlow)
  }

  private setPondLanternLit(lit: boolean) {
    this.pondLanternLit = lit
    this.pondLanternGlow.setVisible(lit)
  }

  private refreshAmbientMotion() {
    for (const { tween, lowPowerOk } of this.ambientTweens) {
      if (this.reducedMotion || (this.lowPower && !lowPowerOk)) tween.pause()
      else tween.resume()
    }
  }

  private drawDecorativeWeather(time: number) {
    this.weatherLayer.clear()
    if (this.decorativeWeather === 'clear' || this.reducedMotion) return
    const count = this.lowPower ? 18 : 42
    if (this.decorativeWeather === 'rain') {
      this.weatherLayer.lineStyle(1, 0xc7d9de, this.lowPower ? 0.28 : 0.42)
      for (let index = 0; index < count; index += 1) {
        const x = seededValue(index, 1, 13) * WORLD_WIDTH
        const y = (seededValue(index, 3, 14) * WORLD_HEIGHT + time * 0.11 + index * 37) % WORLD_HEIGHT
        this.weatherLayer.lineBetween(x, y, x - 3, y + 10)
      }
    } else {
      this.weatherLayer.fillStyle(0xf2ead5, this.lowPower ? 0.55 : 0.74)
      for (let index = 0; index < count; index += 1) {
        const x = seededValue(index, 2, 25) * WORLD_WIDTH
        const y = (seededValue(index, 4, 26) * WORLD_HEIGHT + time * 0.035 + index * 61) % WORLD_HEIGHT
        this.weatherLayer.fillCircle(x, y, index % 3 === 0 ? 2 : 1.3)
      }
    }
  }

  private createCollisions() {
    this.solids = this.physics.add.staticGroup()
    for (let row = 0; row < ROWS; row += 1) {
      for (let column = 0; column < COLUMNS; column += 1) {
        if (!inIsland(column, row)) {
          const touchesLand = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => inIsland(column + dx, row + dy))
          if (touchesLand) this.addSolid(column, row)
          continue
        }
        if (PATH_TILES.has(`${column},${row}`)) continue
      }
    }
    this.createPondCollisions()
    this.createCottageCollisions()
    this.createTreeCollisions()
  }

  private createPondCollisions() {
    const centerX = 15 * TILE + 48
    const centerY = 17 * TILE + 32
    const radiusX = 63
    const radiusY = 45
    const left = Math.floor((centerX - radiusX) / POND_COLLISION_CELL) * POND_COLLISION_CELL
    const right = Math.ceil((centerX + radiusX) / POND_COLLISION_CELL) * POND_COLLISION_CELL
    const top = Math.floor((centerY - radiusY) / POND_COLLISION_CELL) * POND_COLLISION_CELL
    const bottom = Math.ceil((centerY + radiusY) / POND_COLLISION_CELL) * POND_COLLISION_CELL

    for (let y = top; y < bottom; y += POND_COLLISION_CELL) {
      for (let x = left; x < right; x += POND_COLLISION_CELL) {
        const nearestX = Phaser.Math.Clamp(centerX, x, x + POND_COLLISION_CELL)
        const nearestY = Phaser.Math.Clamp(centerY, y, y + POND_COLLISION_CELL)
        const normalizedX = (nearestX - centerX) / radiusX
        const normalizedY = (nearestY - centerY) / radiusY
        if (normalizedX ** 2 + normalizedY ** 2 <= 1) {
          this.addSolidRect(x, y, POND_COLLISION_CELL, POND_COLLISION_CELL)
        }
      }
    }
  }

  private createCottageCollisions() {
    const x = CENTER_COLUMN * TILE - 50
    const y = 9 * TILE
    const roofTop = y + 9
    const roofBottom = y + 62
    const bandHeight = 8

    for (let bandY = roofTop; bandY < roofBottom; bandY += bandHeight) {
      const bandBottom = Math.min(bandY + bandHeight, roofBottom)
      const halfWidth = ((bandBottom - roofTop) / (roofBottom - roofTop)) * 56
      this.addSolidRect(x + 53 - halfWidth, bandY, halfWidth * 2, bandBottom - bandY)
    }

    // Keep the painted door closed: this milestone has no interior scene, and the
    // interaction marker remains reachable immediately outside the cottage.
    this.addSolidRect(x + 5, y + 55, 96, 70)
  }

  private createTreeCollisions() {
    const trees = [[13, 12], [35, 12], [30, 24], [17, 23], [37, 19]] as const
    for (const [column, row] of trees) {
      const x = column * TILE + 16
      const y = row * TILE + 16
      this.addSolidRect(x - 5, y + 3, 10, 24)
    }
  }

  private addSolid(column: number, row: number) {
    this.solids.create(column * TILE + TILE / 2, row * TILE + TILE / 2, 'solid-tile').setAlpha(0).refreshBody()
  }

  private addSolidRect(x: number, y: number, width: number, height: number) {
    this.solids.create(x + width / 2, y + height / 2, 'solid-tile')
      .setDisplaySize(width, height)
      .setAlpha(0)
      .refreshBody()
  }

  private createPlayer() {
    const character = this.roster.local
    const { x, y } = character.config.spawn
    const idleKey = characterTextureKey(character.config.id, 'idle', 'down', 0)
    this.player = this.physics.add.sprite(x, y, idleKey).setAlpha(0)
    this.player.setCollideWorldBounds(true)
    const body = this.player.body
    if (!body) throw new Error('Player physics body is unavailable.')
    body.setSize(16, 12).setOffset(8, 27)
    this.physics.add.collider(this.player, this.solids)
    this.characterSprites = new CharacterSprites(this, this.roster)
  }

  private createControls() {
    const keyboard = this.input.keyboard
    if (!keyboard) throw new Error('Keyboard input is unavailable.')
    this.cursors = keyboard.createCursorKeys()
    this.wasd = keyboard.addKeys('W,A,S,D') as Record<'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key>
    this.interactKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E)
    const document = this.game.canvas.ownerDocument
    document.addEventListener('keydown', this.handleKeyboardEvent, true)
    document.addEventListener('keyup', this.handleKeyboardEvent, true)
    document.addEventListener('focusin', this.handleEditableFocus, true)
    document.addEventListener('focusout', this.handleEditableBlur, true)
    if (isEditableTarget(document.activeElement)) keyboard.disableGlobalCapture()
  }
}
