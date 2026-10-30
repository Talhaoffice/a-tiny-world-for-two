import { onValue, push, ref, serverTimestamp, set, type Database } from 'firebase/database'
import { logError } from '../../lib/logger'
import { firebaseAuth } from '../../lib/firebase'
import { isWeaponId, type Facing, type KnockoutState, type WeaponId } from './combat'
import { resolveCombatApiBaseUrl } from './combatApiTarget'

export type CombatPlayerState = {
  health: number
  knockout: KnockoutState
  hitAt: number
  lastAttackAt: number
  carryingUid?: string
  carriedBy?: string
}
export type CombatSnapshot = { local: CombatPlayerState; remote: CombatPlayerState }
export type CombatInteraction = 'pickup' | 'throw'

const COMBAT_API_BASE_URL = resolveCombatApiBaseUrl(import.meta.env.DEV, import.meta.env.VITE_COMBAT_API_URL)

const initialState = (): CombatPlayerState => ({ health: 100, knockout: 'alive', hitAt: 0, lastAttackAt: 0 })

function readPlayerState(value: unknown): CombatPlayerState {
  if (!value || typeof value !== 'object') return initialState()
  const state = value as Partial<CombatPlayerState>
  const knockout = ['alive', 'knocked_out', 'carried', 'thrown', 'respawning'].includes(String(state.knockout))
    ? state.knockout as KnockoutState : 'alive'
  return {
    health: typeof state.health === 'number' && Number.isFinite(state.health) ? Math.max(0, Math.min(100, Math.round(state.health))) : 100,
    knockout,
    hitAt: typeof state.hitAt === 'number' && Number.isFinite(state.hitAt) ? state.hitAt : 0,
    lastAttackAt: typeof state.lastAttackAt === 'number' && Number.isFinite(state.lastAttackAt) ? state.lastAttackAt : 0,
    ...(typeof state.carryingUid === 'string' ? { carryingUid: state.carryingUid } : {}),
    ...(typeof state.carriedBy === 'string' ? { carriedBy: state.carriedBy } : {}),
  }
}

async function postCombatAction(path: string, body: Record<string, string>): Promise<boolean> {
  const user = firebaseAuth?.currentUser
  if (!COMBAT_API_BASE_URL || !user) return false
  try {
    const idToken = await user.getIdToken()
    const response = await fetch(`${COMBAT_API_BASE_URL}${path}`, {
      method: 'POST',
      mode: 'cors',
      headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const result = await response.json().catch(() => null) as { ok?: unknown } | null
    return response.ok && result?.ok === true
  } catch (error) {
    logError(error, 'combat/http-api')
    return false
  }
}

function requestId(): string {
  return globalThis.crypto.randomUUID()
}

export function connectCombatSync(
  database: Database,
  uid: string,
  remoteUid: string,
  onState: (snapshot: CombatSnapshot) => void,
  onWeapons: (local: WeaponId, remote: WeaponId) => void,
) {
  let stopped = false
  let localWeapon: WeaponId = 'sipper'
  let remoteWeapon: WeaponId = 'sipper'
  const stops = [
    onValue(ref(database, 'world/combat/state/players'), snapshot => {
      if (stopped) return
      try {
        const players = snapshot.val() ?? {}
        onState({ local: readPlayerState(players[uid]), remote: readPlayerState(players[remoteUid]) })
      } catch (error) { logError(error, 'rtdb/combat-state-callback') }
    }, error => logError(error, 'rtdb/combat-state')),
    onValue(ref(database, 'world/combat/loadouts'), snapshot => {
      if (stopped) return
      const loadouts = snapshot.val() ?? {}
      const localCandidate = loadouts[uid]?.weapon
      const remoteCandidate = loadouts[remoteUid]?.weapon
      if (isWeaponId(localCandidate)) localWeapon = localCandidate
      if (isWeaponId(remoteCandidate)) remoteWeapon = remoteCandidate
      onWeapons(localWeapon, remoteWeapon)
      if (!isWeaponId(localCandidate)) void set(ref(database, `world/combat/loadouts/${uid}`), { weapon: localWeapon }).catch(error => logError(error, 'rtdb/combat-loadout-init'))
    }, error => logError(error, 'rtdb/combat-loadouts')),
  ]

  return {
    setWeapon(weapon: WeaponId) {
      if (stopped || !isWeaponId(weapon)) return
      localWeapon = weapon
      onWeapons(localWeapon, remoteWeapon)
      void set(ref(database, `world/combat/loadouts/${uid}`), { weapon }).catch(error => logError(error, 'rtdb/combat-loadout'))
    },
    async attack(targetUid: string, facing: Facing) {
      if (stopped || targetUid !== remoteUid) return false
      if (COMBAT_API_BASE_URL) {
        return postCombatAction('/api/combat/attack', { targetUid, facing, requestId: requestId() })
      }
      if (!import.meta.env.DEV) return false
      const request = push(ref(database, `world/combat/requests/attacks/${uid}`))
      try {
        await set(request, { targetUid, facing, createdAt: serverTimestamp() })
        return true
      } catch (error) {
        logError(error, 'rtdb/combat-attack-request')
        return false
      }
    },
    async interact(targetUid: string, action: CombatInteraction) {
      if (stopped || targetUid !== remoteUid || (action !== 'pickup' && action !== 'throw')) return false
      if (COMBAT_API_BASE_URL) {
        return postCombatAction('/api/combat/interact', { targetUid, action, requestId: requestId() })
      }
      if (!import.meta.env.DEV) return false
      const request = push(ref(database, `world/combat/requests/interactions/${uid}`))
      try {
        await set(request, { targetUid, action, createdAt: serverTimestamp() })
        return true
      } catch (error) {
        logError(error, `rtdb/combat-interaction-${action}`)
        return false
      }
    },
    stop() {
      if (stopped) return
      stopped = true
      stops.forEach(stop => stop())
    },
  }
}
