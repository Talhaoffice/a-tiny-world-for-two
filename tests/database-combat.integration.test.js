import { randomBytes, randomUUID } from 'node:crypto'
import { after, before, beforeEach, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { deleteApp, initializeApp } from 'firebase/app'
import { connectAuthEmulator, createUserWithEmailAndPassword, deleteUser, getAuth } from 'firebase/auth'
import { connectDatabaseEmulator, getDatabase, ref, serverTimestamp, set, get } from 'firebase/database'
import { initializeTestEnvironment } from '@firebase/rules-unit-testing'

const PROJECT = process.env.COMBAT_TEST_PROJECT_ID || 'demo-tiny-world-combat'
// The isolated demo Functions trigger and Admin SDK use the project-ID RTDB
// namespace. firebase.combat-test.json binds the rules to that same instance.
const DATABASE_URL = `https://${PROJECT}.firebaseio.com`
const DATABASE_PORT = Number(process.env.COMBAT_TEST_DATABASE_PORT || 19000)
const AUTH_PORT = Number(process.env.COMBAT_TEST_AUTH_PORT || 19099)
let environment
let appA
let appB
let authA
let authB
let databaseA
let databaseB
let playerA
let playerB

before(async () => {
  environment = await initializeTestEnvironment({ projectId: PROJECT, database: { host: '127.0.0.1', port: DATABASE_PORT } })
  appA = initializeApp({ apiKey: 'emulator-test-key', authDomain: `${PROJECT}.firebaseapp.com`, projectId: PROJECT, databaseURL: DATABASE_URL }, `combat-test-a-${randomUUID()}`)
  appB = initializeApp({ apiKey: 'emulator-test-key', authDomain: `${PROJECT}.firebaseapp.com`, projectId: PROJECT, databaseURL: DATABASE_URL }, `combat-test-b-${randomUUID()}`)
  authA = getAuth(appA)
  authB = getAuth(appB)
  connectAuthEmulator(authA, `http://127.0.0.1:${AUTH_PORT}`, { disableWarnings: true })
  connectAuthEmulator(authB, `http://127.0.0.1:${AUTH_PORT}`, { disableWarnings: true })
  const [accountA, accountB] = await Promise.all([
    createUserWithEmailAndPassword(authA, `combat-${randomUUID()}@example.test`, randomBytes(24).toString('base64url')),
    createUserWithEmailAndPassword(authB, `combat-${randomUUID()}@example.test`, randomBytes(24).toString('base64url')),
  ])
  playerA = accountA.user.uid
  playerB = accountB.user.uid
  databaseA = getDatabase(appA)
  databaseB = getDatabase(appB)
  connectDatabaseEmulator(databaseA, '127.0.0.1', DATABASE_PORT)
  connectDatabaseEmulator(databaseB, '127.0.0.1', DATABASE_PORT)
})
beforeEach(async () => {
  await environment.withSecurityRulesDisabled(async context => {
    const defaultInstance = context.database(DATABASE_URL)
    await set(ref(defaultInstance, '/'), null)
    await set(ref(defaultInstance, `members/${playerA}`), true)
    await set(ref(defaultInstance, `members/${playerB}`), true)
  })
})
after(async () => {
  await Promise.allSettled([
    authA?.currentUser ? deleteUser(authA.currentUser) : Promise.resolve(),
    authB?.currentUser ? deleteUser(authB.currentUser) : Promise.resolve(),
  ])
  await Promise.allSettled([appA && deleteApp(appA), appB && deleteApp(appB), environment?.cleanup()])
})

describe('Cloud Function combat integration', () => {
  const stateRef = () => ref(databaseA, 'world/combat/state')
  const seedPlayers = async ({ actor = { x: 200, y: 320 }, target = { x: 220, y: 320 }, state = null } = {}) => {
    await Promise.all([
      set(ref(databaseA, `world/players/${playerA}/presence`), { online: true, lastChanged: serverTimestamp() }),
      set(ref(databaseB, `world/players/${playerB}/presence`), { online: true, lastChanged: serverTimestamp() }),
      set(ref(databaseA, `world/players/${playerA}/position`), { ...actor, zone: 'island', updatedAt: serverTimestamp() }),
      set(ref(databaseB, `world/players/${playerB}/position`), { ...target, zone: 'island', updatedAt: serverTimestamp() }),
    ])
    if (state) await environment.withSecurityRulesDisabled(async context => {
      await set(ref(context.database(DATABASE_URL), 'world/combat/state'), state)
    })
  }

  const sendInteraction = (requestId, action, targetUid = playerB) => set(
    ref(databaseA, `world/combat/requests/interactions/${playerA}/${requestId}`),
    { targetUid, action, createdAt: serverTimestamp() },
  )

  const waitForResult = async (requestId, expected) => {
    for (let attempt = 0; attempt < 120; attempt += 1) {
      const state = (await get(stateRef())).val()
      const result = state?.processed?.[`${playerA}:${requestId}`]?.result
      if (result === expected) return state
      await new Promise(resolve => setTimeout(resolve, 50))
    }
    assert.fail(`Timed out waiting for combat interaction result ${expected}`)
  }

  const retryInteractionUntilAccepted = async (requestId, action) => {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      try {
        await sendInteraction(requestId, action)
        return
      } catch (error) {
        if (error?.code !== 'PERMISSION_DENIED' && error?.code !== 'database/permission-denied') throw error
        await new Promise(resolve => setTimeout(resolve, 50))
      }
    }
    assert.fail('Timed out waiting for the server to consume the prior request before retrying its ID')
  }

  it('resolves an authenticated member attack into server-owned health', async () => {
    const owner = databaseA
    const peer = databaseB
    assert.equal((await get(ref(owner, `members/${playerA}`))).val(), true, 'owner membership fixture is visible to the authenticated default-instance client')
    assert.equal((await get(ref(peer, `members/${playerB}`))).val(), true, 'target membership fixture is visible to the authenticated default-instance client')
    await Promise.all([
      set(ref(owner, `world/players/${playerA}/presence`), { online: true, lastChanged: serverTimestamp() }),
      set(ref(peer, `world/players/${playerB}/presence`), { online: true, lastChanged: serverTimestamp() }),
    ])
    await set(ref(owner, `world/players/${playerA}/position`), {
      x: 200, y: 320, zone: 'island', updatedAt: serverTimestamp(),
    })
    await set(ref(peer, `world/players/${playerB}/position`), {
      x: 245, y: 320, zone: 'island', updatedAt: serverTimestamp(),
    })
    await set(ref(owner, `world/combat/loadouts/${playerA}`), { weapon: 'sword' })
    await set(ref(owner, `world/combat/requests/attacks/${playerA}/req-server-hit`), {
      targetUid: playerB, facing: 'right', createdAt: serverTimestamp(),
    })
    let combat
    for (let attempt = 0; attempt < 150; attempt += 1) {
      combat = (await get(ref(peer, 'world/combat/state/players'))).val()
      if (combat?.[playerB]?.health === 80) break
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    assert.equal(combat?.[playerB]?.health, 80)
    assert.equal(combat?.[playerA]?.lastAttackAt > 0, true)
    await assert.rejects(
      set(ref(owner, `world/combat/state/players/${playerB}`), { health: 100, knockout: 'alive' }),
      error => error?.code === 'PERMISSION_DENIED' || error?.code === 'database/permission-denied',
    )
  })

  it('applies repeated authenticated sipper hits below 50 through knockout', async () => {
    const owner = databaseA
    const peer = databaseB
    const stateRef = ref(peer, 'world/combat/state')
    const attackerPositionRef = ref(owner, `world/players/${playerA}/position`)
    const targetPositionRef = ref(peer, `world/players/${playerB}/position`)
    await Promise.all([
      set(ref(owner, `world/players/${playerA}/presence`), { online: true, lastChanged: serverTimestamp() }),
      set(ref(peer, `world/players/${playerB}/presence`), { online: true, lastChanged: serverTimestamp() }),
      set(ref(owner, `world/combat/loadouts/${playerA}`), { weapon: 'sipper' }),
    ])

    const waitForProcessedResult = async requestId => {
      for (let attempt = 0; attempt < 100; attempt += 1) {
        const combat = (await get(stateRef)).val()
        const result = combat?.processed?.[`${playerA}:${requestId}`]?.result
        if (result) return { combat, result }
        await new Promise(resolve => setTimeout(resolve, 50))
      }
      assert.fail(`Timed out waiting for server result ${requestId}`)
    }

    for (let index = 0; index < 20; index += 1) {
      if (index > 0) await new Promise(resolve => setTimeout(resolve, 500))
      await Promise.all([
        set(attackerPositionRef, { x: 200, y: 320, zone: 'island', updatedAt: serverTimestamp() }),
        set(targetPositionRef, { x: 220, y: 320, zone: 'island', updatedAt: serverTimestamp() }),
      ])
      const requestId = `req-sipper-${String(index).padStart(2, '0')}`
      await set(ref(owner, `world/combat/requests/attacks/${playerA}/${requestId}`), {
        targetUid: playerB, facing: 'right', createdAt: serverTimestamp(),
      })
      const { combat, result } = await waitForProcessedResult(requestId)
      assert.equal(result, 'hit', `sipper hit ${index + 1} must be valid`)
      const expectedHealth = Math.max(0, 100 - (index + 1) * 5)
      assert.equal(combat.players[playerB].health, expectedHealth)
      if (index === 10) assert.ok(combat.players[playerB].health < 50)
    }

    const combat = (await get(stateRef)).val()
    assert.equal(combat.players[playerB].health, 0)
    assert.equal(combat.players[playerB].knockout, 'knocked_out')
  })

  it('picks up a nearby knocked-out member and synchronizes carry ownership', async () => {
    await seedPlayers({ state: {
      players: { [playerB]: { health: 0, knockout: 'knocked_out', hitAt: Date.now(), lastAttackAt: 0 } },
      processed: {},
    } })
    await sendInteraction('req-pickup-valid', 'pickup')
    const state = await waitForResult('req-pickup-valid', 'picked-up')
    assert.equal(state.players[playerA].carryingUid, playerB)
    assert.equal(state.players[playerB].knockout, 'carried')
    assert.equal(state.players[playerB].carriedBy, playerA)
  })

  it('rejects a throw away from water without releasing the carried target', async () => {
    await seedPlayers({ state: {
      players: {
        [playerA]: { health: 100, knockout: 'alive', carryingUid: playerB, lastAttackAt: 0 },
        [playerB]: { health: 0, knockout: 'carried', carriedBy: playerA, hitAt: Date.now(), lastAttackAt: 0 },
      },
      processed: {},
    } })
    await sendInteraction('req-throw-invalid', 'throw')
    const state = await waitForResult('req-throw-invalid', 'invalid-water-destination')
    assert.equal(state.players[playerA].carryingUid, playerB)
    assert.equal(state.players[playerB].health, 0)
    assert.equal(state.players[playerB].knockout, 'carried')
  })

  it('returns a carried target to the cottage and restores server-owned health', async () => {
    await seedPlayers({ actor: { x: 528, y: 515 }, target: { x: 540, y: 515 }, state: {
      players: {
        [playerA]: { health: 100, knockout: 'alive', carryingUid: playerB, lastAttackAt: 0 },
        [playerB]: { health: 0, knockout: 'carried', carriedBy: playerA, hitAt: Date.now(), lastAttackAt: 0 },
      },
      processed: {},
    } })
    await sendInteraction('req-throw-valid', 'throw')
    const state = await waitForResult('req-throw-valid', 'respawned')
    assert.equal(state.players[playerA].carryingUid, undefined)
    assert.equal(state.players[playerB].health, 100)
    assert.equal(state.players[playerB].knockout, 'alive')
    const position = (await get(ref(databaseB, `world/players/${playerB}/position`))).val()
    assert.deepEqual({ x: position.x, y: position.y, zone: position.zone }, { x: 768, y: 820, zone: 'home' })
    assert.equal(Number.isFinite(position.updatedAt), true)
  })

  it('ignores duplicate interaction request IDs after the original pickup', async () => {
    await seedPlayers({ state: {
      players: { [playerB]: { health: 0, knockout: 'knocked_out', hitAt: Date.now(), lastAttackAt: 0 } },
      processed: {},
    } })
    const requestId = 'req-pickup-duplicate'
    await sendInteraction(requestId, 'pickup')
    await waitForResult(requestId, 'picked-up')
    await retryInteractionUntilAccepted(requestId, 'pickup')
    await new Promise(resolve => setTimeout(resolve, 150))
    const state = (await get(stateRef())).val()
    assert.equal(state.players[playerA].carryingUid, playerB)
    assert.equal(state.players[playerB].knockout, 'carried')
    assert.equal(state.processed[`${playerA}:${requestId}`].result, 'picked-up')
  })
})
