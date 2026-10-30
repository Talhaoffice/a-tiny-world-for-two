import assert from 'node:assert/strict'
import { afterEach, beforeEach, test } from 'node:test'
import { createCombatApi } from '../src/combatApi.js'
import { readCombatApiConfig } from '../src/apiConfig.js'

const PROJECT_ID = 'a-tiny-world-for-two'
const ACTOR = 'actor_uid'
const TARGET = 'target_uid'
const TOKEN = 'test-firebase-id-token-value-long-enough'
const NOW = 100_000
const ORIGIN = 'https://a-tiny-world-for-two.web.app'
const LOCAL_ORIGIN = 'http://localhost:5173'

function clone(value) {
  return value === undefined ? undefined : structuredClone(value)
}

function readAt(root, path) {
  return path.split('/').filter(Boolean).reduce((value, segment) => value?.[segment], root)
}

function writeAt(root, path, value) {
  const segments = path.split('/').filter(Boolean)
  let node = root
  for (const segment of segments.slice(0, -1)) node = node[segment] ??= {}
  if (segments.length) {
    if (value === null) delete node[segments.at(-1)]
    else node[segments.at(-1)] = clone(value)
  }
}

class Snapshot {
  constructor(value) { this.value = clone(value) }
  val() { return clone(this.value) ?? null }
  child(path) { return new Snapshot(readAt(this.value, path)) }
}

class MemoryDatabase {
  constructor(data) { this.data = clone(data) }
  ref(path) {
    return {
      get: async () => new Snapshot(readAt(this.data, path)),
      transaction: async update => {
        const updated = update(clone(readAt(this.data, path)) ?? null)
        if (updated === undefined) return { committed: false, snapshot: new Snapshot(readAt(this.data, path)) }
        writeAt(this.data, path, updated)
        return { committed: true, snapshot: new Snapshot(updated) }
      },
      update: async patch => writeAt(this.data, path, { ...(readAt(this.data, path) ?? {}), ...clone(patch) }),
    }
  }
  get(path) { return clone(readAt(this.data, path)) }
}

function seededDatabase({ actorPosition = { x: 200, y: 320, zone: 'island', updatedAt: NOW }, targetPosition = { x: 220, y: 320, zone: 'island', updatedAt: NOW }, combatState = {} } = {}) {
  return new MemoryDatabase({
    members: { [ACTOR]: true, [TARGET]: true },
    world: {
      players: {
        [ACTOR]: { presence: { online: true, lastChanged: NOW }, position: actorPosition },
        [TARGET]: { presence: { online: true, lastChanged: NOW }, position: targetPosition },
      },
      combat: { loadouts: { [ACTOR]: { weapon: 'sword' } }, state: combatState },
    },
  })
}

let database
let server
let baseUrl

const verifyTestToken = async token => {
  if (token !== TOKEN) throw new Error('invalid-token')
  return { uid: ACTOR }
}

async function startServer(db, verifyIdToken = verifyTestToken) {
  if (server?.listening) await new Promise(resolve => server.close(resolve))
  database = db
  server = createCombatApi({
    verifyIdToken,
    database,
    allowedOrigins: new Set([ORIGIN, LOCAL_ORIGIN]),
    now: () => NOW,
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  baseUrl = `http://127.0.0.1:${server.address().port}`
}

beforeEach(async () => startServer(seededDatabase()))

afterEach(async () => {
  if (server?.listening) await new Promise(resolve => server.close(resolve))
})

async function post(path, body, { token = TOKEN, origin = ORIGIN } = {}) {
  return fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(origin ? { Origin: origin } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
}

test('health endpoint is public and CORS allows the configured production and local origins only', async () => {
  const response = await fetch(`${baseUrl}/healthz`, { headers: { Origin: LOCAL_ORIGIN } })
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { status: 'ok' })
  assert.equal(response.headers.get('access-control-allow-origin'), LOCAL_ORIGIN)

  const denied = await fetch(`${baseUrl}/healthz`, { headers: { Origin: 'https://not-allowed.example' } })
  assert.equal(denied.status, 403)
})

test('unauthenticated, malformed, and invalid Firebase tokens cannot invoke combat actions', async () => {
  const payload = { targetUid: TARGET, facing: 'right', requestId: 'attack-unauth-01' }
  assert.equal((await post('/api/combat/attack', payload, { token: null })).status, 401)
  assert.equal((await post('/api/combat/attack', payload, { token: 'invalid-firebase-id-token-long' })).status, 401)
  assert.equal(database.get('world/combat/state/players'), undefined)
})

test('attack damage is derived from the server loadout and clients cannot submit damage or health', async () => {
  const request = { targetUid: TARGET, facing: 'right', requestId: 'attack-valid-001' }
  const response = await post('/api/combat/attack', request)
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { ok: true, result: 'hit', weapon: 'sword', requestId: request.requestId })
  assert.equal(database.get(`world/combat/state/players/${TARGET}`).health, 80)

  const forged = await post('/api/combat/attack', { ...request, requestId: 'attack-forged-01', damage: 999, health: 1 })
  assert.equal(forged.status, 400)
  assert.equal(database.get(`world/combat/state/players/${TARGET}`).health, 80)
})

test('unknown or inactive target members are rejected before combat state changes', async () => {
  const payload = { targetUid: 'outsider_uid', facing: 'right', requestId: 'attack-outsider-01' }
  const response = await post('/api/combat/attack', payload)
  assert.equal(response.status, 403)
  assert.deepEqual(await response.json(), { error: 'not_authorized' })
  assert.equal(database.get('world/combat/state/players'), undefined)
})

test('attack input schema rejects self-targeting, unknown fields, and invalid facing', async () => {
  const self = await post('/api/combat/attack', { targetUid: ACTOR, facing: 'right', requestId: 'attack-self-0001' })
  const facing = await post('/api/combat/attack', { targetUid: TARGET, facing: 'diagonal', requestId: 'attack-face-0001' })
  const extra = await post('/api/combat/attack', { targetUid: TARGET, facing: 'right', requestId: 'attack-extra-001', weapon: 'axe' })
  assert.equal(self.status, 400)
  assert.equal(facing.status, 400)
  assert.equal(extra.status, 400)
})

test('duplicate attack IDs are idempotent and cooldown remains server enforced', async () => {
  const payload = { targetUid: TARGET, facing: 'right', requestId: 'attack-repeat-001' }
  assert.equal((await post('/api/combat/attack', payload)).status, 200)
  assert.equal((await post('/api/combat/attack', payload)).status, 200)
  assert.equal(database.get(`world/combat/state/players/${TARGET}`).health, 80)

  const next = await post('/api/combat/attack', { ...payload, requestId: 'attack-cooldown-01' })
  assert.equal(next.status, 409)
  assert.equal((await next.json()).result, 'cooldown')
  assert.equal(database.get(`world/combat/state/players/${TARGET}`).health, 80)
})

test('pickup requires a valid knocked-out target and records server-owned carry state', async () => {
  await startServer(seededDatabase({ combatState: { players: { [TARGET]: { health: 0, knockout: 'knocked_out' } }, processed: {} } }))
  const response = await post('/api/combat/interact', { targetUid: TARGET, action: 'pickup', requestId: 'pickup-valid-001' })
  assert.equal(response.status, 200)
  assert.equal(database.get(`world/combat/state/players/${ACTOR}`).carryingUid, TARGET)
  assert.equal(database.get(`world/combat/state/players/${TARGET}`).knockout, 'carried')
})

test('throw away from the pond is rejected without releasing the carried player', async () => {
  database = seededDatabase({ combatState: {
    players: {
      [ACTOR]: { health: 100, knockout: 'alive', carryingUid: TARGET, lastAttackAt: 0 },
      [TARGET]: { health: 0, knockout: 'carried', carriedBy: ACTOR },
    }, processed: {},
  } })
  await startServer(database)
  const response = await post('/api/combat/interact', { targetUid: TARGET, action: 'throw', requestId: 'throw-invalid-001' })
  assert.equal(response.status, 409)
  assert.equal((await response.json()).result, 'invalid-water-destination')
  assert.equal(database.get(`world/combat/state/players/${ACTOR}`).carryingUid, TARGET)
  assert.equal(database.get(`world/combat/state/players/${TARGET}`).health, 0)
})

test('valid water throw writes cottage position then restores 100 health and alive state', async () => {
  database = seededDatabase({
    actorPosition: { x: 528, y: 515, zone: 'island', updatedAt: NOW },
    targetPosition: { x: 540, y: 515, zone: 'island', updatedAt: NOW },
    combatState: {
      players: {
        [ACTOR]: { health: 100, knockout: 'alive', carryingUid: TARGET, lastAttackAt: 0 },
        [TARGET]: { health: 0, knockout: 'carried', carriedBy: ACTOR },
      }, processed: {},
    },
  })
  await startServer(database)
  const response = await post('/api/combat/interact', { targetUid: TARGET, action: 'throw', requestId: 'throw-valid-001' })
  assert.equal(response.status, 200)
  assert.equal((await response.json()).result, 'respawned')
  assert.equal(database.get(`world/combat/state/players/${TARGET}`).health, 100)
  assert.equal(database.get(`world/combat/state/players/${TARGET}`).knockout, 'alive')
  assert.deepEqual(database.get(`world/players/${TARGET}/position`), { x: 768, y: 820, zone: 'home', updatedAt: NOW })
})

test('startup configuration requires matching Firebase credentials and refuses local or wrong-project databases', () => {
  const valid = {
    FIREBASE_PROJECT_ID: PROJECT_ID,
    FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify({ project_id: PROJECT_ID, client_email: 'service@example.test', private_key: 'PRIVATE KEY' }),
    FIREBASE_DATABASE_URL: `https://${PROJECT_ID}-default-rtdb.firebaseio.com`,
    PORT: '8787',
  }
  assert.equal(readCombatApiConfig(valid).projectId, PROJECT_ID)
  assert.throws(() => readCombatApiConfig({ ...valid, FIREBASE_DATABASE_URL: 'http://127.0.0.1:9000?ns=demo' }), /FIREBASE_DATABASE_URL/)
  assert.throws(() => readCombatApiConfig({ ...valid, FIREBASE_PROJECT_ID: 'another-project' }), /FIREBASE_PROJECT_ID/)
  assert.throws(() => readCombatApiConfig({ ...valid, FIREBASE_SERVICE_ACCOUNT_JSON: '{}' }), /FIREBASE_SERVICE_ACCOUNT_JSON/)
  const local = {
    FIREBASE_PROJECT_ID: PROJECT_ID,
    FIREBASE_DATABASE_URL: `https://${PROJECT_ID}-default-rtdb.firebaseio.com`,
    COMBAT_API_EMULATOR_MODE: 'true',
    FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:19099',
    FIREBASE_DATABASE_EMULATOR_HOST: '127.0.0.1:19000',
  }
  assert.equal(readCombatApiConfig(local).emulatorMode, true)
  assert.throws(() => readCombatApiConfig({ ...local, FIREBASE_AUTH_EMULATOR_HOST: 'firebase.google.com:443' }), /loopback/)
})
