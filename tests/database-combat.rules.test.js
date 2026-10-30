import { readFile } from 'node:fs/promises'
import { after, before, beforeEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing'
import { ref, serverTimestamp, set, get } from 'firebase/database'

const PROJECT = process.env.COMBAT_TEST_PROJECT_ID || 'demo-tiny-world-combat'
const PLAYER_A = 'combat-fixture-a'
const PLAYER_B = 'combat-fixture-b'
const DATABASE_PORT = Number(process.env.COMBAT_TEST_DATABASE_PORT || 19000)
let environment

before(async () => {
  const rules = await readFile(new URL('../database.rules.json', import.meta.url), 'utf8')
  environment = await initializeTestEnvironment({
    projectId: PROJECT,
    database: { host: '127.0.0.1', port: DATABASE_PORT, rules },
  })
})

beforeEach(async () => {
  await environment.clearDatabase()
  await environment.withSecurityRulesDisabled(async context => {
    await set(ref(context.database(), `members/${PLAYER_A}`), true)
    await set(ref(context.database(), `members/${PLAYER_B}`), true)
  })
})

after(async () => { await environment?.cleanup() })

const context = uid => environment.authenticatedContext(uid).database()

describe('combat Realtime Database rules', () => {
  it('limits loadouts and attack requests to valid member-owned shapes', async () => {
    const owner = context(PLAYER_A)
    const other = context(PLAYER_B)
    const request = { targetUid: PLAYER_B, facing: 'right', createdAt: serverTimestamp() }
    await assertSucceeds(set(ref(owner, `world/combat/loadouts/${PLAYER_A}`), { weapon: 'sword' }))
    await assertSucceeds(set(ref(owner, `world/combat/requests/attacks/${PLAYER_A}/req-one`), request))
    await Promise.all([
      assertFails(set(ref(other, `world/combat/requests/attacks/${PLAYER_A}/req-two`), request)),
      assertFails(set(ref(owner, `world/combat/requests/attacks/${PLAYER_A}/req-self`), { ...request, targetUid: PLAYER_A })),
      assertFails(set(ref(owner, `world/combat/requests/attacks/${PLAYER_A}/req-forged`), { ...request, damage: 999 })),
      assertFails(set(ref(owner, `world/combat/loadouts/${PLAYER_A}`), { weapon: 'unknown' })),
      assertFails(set(ref(owner, `world/combat/state/players/${PLAYER_A}`), { health: 0, knockout: 'knocked_out' })),
    ])
  })

  it('rejects unauthenticated and non-member combat writes and reads', async () => {
    const unauthenticated = environment.unauthenticatedContext().database()
    const nonMember = context('combat-fixture-outsider')
    await Promise.all([
      assertFails(set(ref(unauthenticated, `world/combat/loadouts/${PLAYER_A}`), { weapon: 'sword' })),
      assertFails(get(ref(unauthenticated, 'world/combat/state/players'))),
      assertFails(set(ref(nonMember, `world/combat/requests/attacks/combat-fixture-outsider/req`), {
        targetUid: PLAYER_A, facing: 'left', createdAt: serverTimestamp(),
      })),
      assertFails(get(ref(nonMember, 'world/combat/state/players'))),
    ])
  })

  it('rejects self-targeting and duplicate attack request IDs', async () => {
    const owner = context(PLAYER_A)
    const base = { targetUid: PLAYER_B, facing: 'right', createdAt: serverTimestamp() }
    await Promise.all([
      assertFails(set(ref(owner, `world/combat/requests/attacks/${PLAYER_A}/req-self`), { ...base, targetUid: PLAYER_A })),
      assertFails(set(ref(owner, `world/combat/requests/attacks/${PLAYER_A}/req-invalid-facing`), { ...base, facing: 'diagonal' })),
      assertFails(set(ref(owner, `world/combat/requests/attacks/${PLAYER_A}/req-invalid-member`), { ...base, targetUid: 'combat-fixture-outsider' })),
    ])
    const path = `world/combat/requests/attacks/${PLAYER_A}/req-once`
    await assertSucceeds(set(ref(owner, path), base))
    await assertFails(set(ref(owner, path), base))
  })

  it('allows only an active member to submit a valid carry or throw request', async () => {
    const owner = context(PLAYER_A)
    const other = context(PLAYER_B)
    const base = { targetUid: PLAYER_B, action: 'pickup', createdAt: serverTimestamp() }
    await assertSucceeds(set(ref(owner, `world/combat/requests/interactions/${PLAYER_A}/pickup-one`), base))
    await Promise.all([
      assertFails(set(ref(other, `world/combat/requests/interactions/${PLAYER_A}/forged-owner`), base)),
      assertFails(set(ref(owner, `world/combat/requests/interactions/${PLAYER_A}/self-target`), { ...base, targetUid: PLAYER_A })),
      assertFails(set(ref(owner, `world/combat/requests/interactions/${PLAYER_A}/inactive-target`), { ...base, targetUid: 'combat-fixture-outsider' })),
      assertFails(set(ref(owner, `world/combat/requests/interactions/${PLAYER_A}/invalid-action`), { ...base, action: 'teleport' })),
      assertFails(set(ref(owner, `world/combat/requests/interactions/${PLAYER_A}/forged-health`), { ...base, health: 100 })),
      assertFails(set(ref(context('combat-fixture-outsider'), 'world/combat/requests/interactions/combat-fixture-outsider/no-membership'), base)),
    ])
    await assertSucceeds(set(ref(owner, `world/combat/requests/interactions/${PLAYER_A}/throw-one`), { ...base, action: 'throw' }))
    await assertFails(set(ref(owner, `world/combat/state/players/${PLAYER_B}`), { health: 100, knockout: 'alive' }))
  })

  it('preserves owner position bounds, animation values, and unknown-field rejection', async () => {
    const owner = context(PLAYER_A)
    const other = context(PLAYER_B)
    const path = `world/players/${PLAYER_A}/position`
    for (const anim of ['idle', 'walk', 'wave', 'sit', 'sleep']) {
      await assertSucceeds(set(ref(owner, path), {
        x: 320, y: 240, zone: 'home', updatedAt: serverTimestamp(), anim,
      }))
    }
    await Promise.all([
      assertFails(set(ref(owner, path), { x: 320, y: 240, zone: 'home', updatedAt: serverTimestamp(), anim: 'attack' })),
      assertFails(set(ref(owner, path), { x: 320, y: 240, zone: 'home', updatedAt: serverTimestamp(), anim: 'idle', damage: 99 })),
      assertFails(set(ref(owner, path), { x: 1600, y: 240, zone: 'home', updatedAt: serverTimestamp(), anim: 'idle' })),
      assertFails(set(ref(other, path), { x: 320, y: 240, zone: 'home', updatedAt: serverTimestamp(), anim: 'idle' })),
    ])
  })
})
