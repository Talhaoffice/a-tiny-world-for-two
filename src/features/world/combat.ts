export const MAX_PLAYER_HEALTH = 100

export const WEAPONS = {
  sipper: { label: 'Sipper', damage: 5, range: 42, cooldownMs: 450, projectile: false },
  stick: { label: 'Stick', damage: 10, range: 58, cooldownMs: 750, projectile: false },
  sword: { label: 'Sword', damage: 20, range: 72, cooldownMs: 900, projectile: false },
  axe: { label: 'Axe', damage: 30, range: 68, cooldownMs: 1_350, projectile: false },
  gun: { label: 'Water popper', damage: 15, range: 280, cooldownMs: 1_600, projectile: true },
} as const

export type WeaponId = keyof typeof WEAPONS
export type KnockoutState = 'alive' | 'knocked_out' | 'carried' | 'thrown' | 'respawning'
export type Point = { x: number; y: number }
export type Facing = 'up' | 'down' | 'left' | 'right'
export type AttackIntent = { actorId: string; targetId: string; weapon: WeaponId; origin: Point; facing: Facing; sentAt: number; nonce: string }

export function isWeaponId(value: unknown): value is WeaponId {
  return typeof value === 'string' && Object.hasOwn(WEAPONS, value)
}

export function clampHealth(value: number) {
  return Math.max(0, Math.min(MAX_PLAYER_HEALTH, Number.isFinite(value) ? Math.round(value) : 0))
}

export function resolveKnockoutState(health: number, state: KnockoutState): KnockoutState {
  if (health > 0) return state === 'respawning' ? 'alive' : state
  return state === 'carried' || state === 'thrown' || state === 'respawning' ? state : 'knocked_out'
}

export function canTransitionKnockout(from: KnockoutState, to: KnockoutState) {
  const transitions: Record<KnockoutState, KnockoutState[]> = {
    alive: ['knocked_out'], knocked_out: ['carried', 'respawning'], carried: ['thrown', 'respawning'],
    thrown: ['respawning'], respawning: ['alive'],
  }
  return from === to || transitions[from].includes(to)
}

export function attackDamage(intent: AttackIntent, victim: Point, victimId: string, victimState: KnockoutState, lastAttackAt: number, blocked = false) {
  if (intent.actorId === victimId || intent.targetId !== victimId || victimState !== 'alive' || blocked || !isWeaponId(intent.weapon)) return 0
  if (!Number.isFinite(intent.sentAt) || !intent.nonce || !Number.isFinite(intent.origin.x) || !Number.isFinite(intent.origin.y)) return 0
  const weapon = WEAPONS[intent.weapon]
  if (intent.sentAt - lastAttackAt < weapon.cooldownMs) return 0
  const dx = victim.x - intent.origin.x
  const dy = victim.y - intent.origin.y
  const distance = Math.hypot(dx, dy)
  if (distance > weapon.range) return 0
  const facing: Record<Facing, Point> = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } }
  const toward = facing[intent.facing]
  if (distance > 18 && dx * toward.x + dy * toward.y < 0) return 0
  return weapon.damage
}

export function applyDamage(health: number, damage: number) {
  return clampHealth(health - Math.max(0, Math.round(damage)))
}

export function healWhileSleeping(health: number, sleeping: boolean, elapsedMs: number) {
  if (!sleeping || !Number.isFinite(elapsedMs) || elapsedMs <= 0) return clampHealth(health)
  return clampHealth(health + Math.floor(elapsedMs / 5_000))
}

export function isWaterPoint(point: Point, pond: { x: number; y: number; radiusX: number; radiusY: number }) {
  const dx = (point.x - pond.x) / pond.radiusX
  const dy = (point.y - pond.y) / pond.radiusY
  return dx * dx + dy * dy <= 1
}
