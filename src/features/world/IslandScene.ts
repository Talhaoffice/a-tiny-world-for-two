import Phaser from 'phaser'
import type { Destination } from '../destinations/types'
import { isEditableTarget, shouldCaptureGameKeyboard } from './keyboardInput'
import { recordFrame } from '../../lib/diagnostics'

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
  id: Destination
  label: string
  detail: string
  x: number
  y: number
}

export type RemotePlayerPosition = { x: number; y: number }

const PLACES: IslandPlace[] = [
  { id: 'home', label: 'Our Home', detail: 'Leave a note or tuck away a small keepsake.', x: CENTER_COLUMN * TILE + 16, y: 14 * TILE + 16 },
  { id: 'garden', label: 'Memory Garden', detail: 'Plant a flower for a memory you share.', x: 32 * TILE + 16, y: 19 * TILE + 16 },
  { id: 'mailbox', label: 'Mailbox', detail: 'Write a letter for your person.', x: 26 * TILE + 16, y: 20 * TILE + 16 },
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
  private remotePlayer!: Phaser.GameObjects.Sprite
  private remoteTarget: RemotePlayerPosition | null = null
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys
  private wasd!: Record<'W' | 'A' | 'S' | 'D', Phaser.Input.Keyboard.Key>
  private interactKey!: Phaser.Input.Keyboard.Key
  private solids!: Phaser.Physics.Arcade.StaticGroup
  private readonly touchPointers = new Map<number, Direction>()
  private activePlace: IslandPlace | null = null
  private previousInteractDown = false
  private destinationOpen = false
  private walkingFrameAt = 0
  private walkingFrame = 0
  private lastReportedAt = Number.NEGATIVE_INFINITY
  private lastReportedX = Number.NaN
  private lastReportedY = Number.NaN
  private facing: 'up' | 'down' | 'side' = 'down'
  private readonly onNearbyChange: (place: IslandPlace | null) => void
  private readonly onInspect: (place: IslandPlace) => void
  private readonly onPlayerPosition: (x: number, y: number, time: number) => void

  constructor(
    onNearbyChange: (place: IslandPlace | null) => void,
    onInspect: (place: IslandPlace) => void,
    onPlayerPosition: (x: number, y: number, time: number) => void,
  ) {
    super('island')
    this.onNearbyChange = onNearbyChange
    this.onInspect = onInspect
    this.onPlayerPosition = onPlayerPosition
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
    this.createCollisions()
    this.createPlayer()
    this.createRemotePlayer()
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
    this.player.setDepth(this.player.y + 40)
    const moved = Math.abs(this.player.x - this.lastReportedX) >= 2 || Math.abs(this.player.y - this.lastReportedY) >= 2
    if ((moved && time - this.lastReportedAt >= 100) || time - this.lastReportedAt >= 10_000) {
      this.lastReportedAt = time
      this.lastReportedX = this.player.x
      this.lastReportedY = this.player.y
      this.onPlayerPosition(this.player.x, this.player.y, time)
    }
    if (this.remotePlayer.visible && this.remoteTarget) {
      this.remotePlayer.x = Phaser.Math.Linear(this.remotePlayer.x, this.remoteTarget.x, 0.16)
      this.remotePlayer.y = Phaser.Math.Linear(this.remotePlayer.y, this.remoteTarget.y, 0.16)
      this.remotePlayer.setDepth(this.remotePlayer.y + 40)
    }
    if (magnitude > 0) {
      if (Math.abs(normalizedX) > Math.abs(normalizedY)) this.facing = 'side'
      else this.facing = normalizedY < 0 ? 'up' : 'down'
      if (time >= this.walkingFrameAt) {
        this.walkingFrame = 1 - this.walkingFrame
        this.walkingFrameAt = time + 150
      }
      this.player.setTexture(`player-walk-${this.facing}-${this.walkingFrame}`)
      this.player.setFlipX(this.facing === 'side' && normalizedX < 0)
    } else {
      this.player.setTexture(`player-idle-${this.facing}`)
      this.player.setFlipX(false)
    }

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

  setRemotePosition(position: RemotePlayerPosition | null) {
    this.remoteTarget = position
    if (!position) {
      this.remotePlayer?.setVisible(false)
      return
    }

    if (!this.remotePlayer.visible) this.remotePlayer.setPosition(position.x, position.y)
    this.remotePlayer.setVisible(true)
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
    const directions = ['down', 'up', 'side'] as const
    for (const direction of directions) {
      this.drawPlayerTexture(`player-idle-${direction}`, direction, false, 0)
      this.drawPlayerTexture(`player-walk-${direction}-0`, direction, true, 0)
      this.drawPlayerTexture(`player-walk-${direction}-1`, direction, true, 1)
    }
    const block = this.make.graphics({ x: 0, y: 0 }, false)
    block.fillStyle(0xffffff, 1).fillRect(0, 0, TILE, TILE).generateTexture('solid-tile', TILE, TILE)
    block.destroy()
  }

  private drawPlayerTexture(key: string, direction: 'down' | 'up' | 'side', walking: boolean, frame: number) {
    const graphics = this.make.graphics({ x: 0, y: 0 }, false)
    const rect = (color: number, x: number, y: number, width: number, height: number) => {
      graphics.fillStyle(color, 1).fillRect(x, y, width, height)
    }

    rect(0x192d39, 7, 34, 18, 3)
    rect(0x493d3b, 10, 27, 12, 9)
    rect(0x314b61, 8, 16, 16, 13)
    rect(0x253947, 6, 18, 4, 11)
    rect(0x253947, 22, 18, 4, 11)
    rect(0x62483f, 8, 5, 16, 13)
    rect(0xf0c49a, 9, 8, 14, 10)
    rect(0x62483f, 8, 5, 16, 5)

    if (direction === 'down') {
      rect(0x253747, 11, 12, 2, 2)
      rect(0x253747, 19, 12, 2, 2)
      rect(0xf6e0bd, 15, 21, 3, 3)
    } else if (direction === 'up') {
      rect(0x62483f, 7, 6, 18, 12)
    } else {
      rect(0x253747, 18, 11, 2, 2)
      rect(0xf6e0bd, 19, 20, 2, 3)
      rect(0x62483f, 6, 7, 4, 8)
    }

    const legOffset = walking && frame === 1 ? 3 : 0
    rect(0x60483e, 10, walking && frame === 1 ? 29 : 30, 5, 7)
    rect(0x60483e, 17, walking && frame === 1 ? 30 : 29, 5, 7)
    if (legOffset) {
      rect(0x60483e, 8, 32, 5, 5)
      rect(0x60483e, 19, 29, 5, 5)
    }
    graphics.generateTexture(key, 32, 40)
    graphics.destroy()
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
      const tree = this.add.graphics().setDepth(y + 30)
      tree.fillStyle(0x765b4b, 1).fillRect(x - 5, y + 3, 10, 24)
      tree.fillStyle(0x425b51, 1).fillRect(x - 22, y - 20, 44, 34)
      tree.fillStyle(0x526f5d, 1).fillRect(x - 18, y - 28, 36, 35)
      tree.fillStyle(0x6f8969, 1).fillRect(x - 11, y - 23, 9, 6)
    }
  }

  private drawGarden() {
    const flowers = this.add.graphics().setDepth(3)
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
  }

  private drawPlaceMarkers() {
    for (const place of PLACES) {
      const marker = this.add.graphics().setDepth(13)
      marker.fillStyle(0x263747, 0.88).fillCircle(place.x, place.y - 20, 11)
      marker.lineStyle(2, 0xe9bd68, 1).strokeCircle(place.x, place.y - 20, 11)
      this.add.text(place.x - 4, place.y - 26, 'E', { fontFamily: 'monospace', fontSize: '12px', color: '#e9bd68' }).setDepth(14)
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
    this.player = this.physics.add.sprite(CENTER_COLUMN * TILE + 16, 16 * TILE + 16, 'player-idle-down')
    this.player.setDepth(this.player.y + 40)
    this.player.setCollideWorldBounds(true)
    const body = this.player.body
    if (!body) throw new Error('Player physics body is unavailable.')
    body.setSize(16, 12).setOffset(8, 27)
    this.physics.add.collider(this.player, this.solids)
  }

  private createRemotePlayer() {
    this.remotePlayer = this.add.sprite(this.player.x, this.player.y, 'player-idle-down')
      .setTint(0xe5c779)
      .setAlpha(0.9)
      .setDepth(this.player.y + 40)
      .setVisible(false)
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
