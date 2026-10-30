import assert from 'node:assert/strict'
import { randomUUID, generateKeyPairSync } from 'node:crypto'
import { after, test } from 'node:test'
import { cert, deleteApp as deleteAdminApp, initializeApp as initializeAdminApp } from 'firebase-admin/app'
import { getAuth as getAdminAuth } from 'firebase-admin/auth'
import { getDatabase as getAdminDatabase } from 'firebase-admin/database'
import { connectAuthEmulator, createUserWithEmailAndPassword, deleteUser, getAuth } from 'firebase/auth'
import { deleteApp as deleteFirebaseApp, initializeApp as initializeClientApp } from 'firebase/app'
import { createCombatApi } from '../src/combatApi.js'

const PROJECT = 'demo-tiny-world-combat'
const DATABASE_PORT = Number(process.env.COMBAT_TEST_DATABASE_PORT || 19000)
const AUTH_PORT = Number(process.env.COMBAT_TEST_AUTH_PORT || 19099)
const API_ORIGIN = 'https://a-tiny-world-for-two.web.app'
const adminApps = []
const clientApps = []
const users = []
let server
let internalErrorCategory = null

after(async () => {
  if (server?.listening) await new Promise(resolve => server.close(resolve))
  await Promise.allSettled(users.map(user => user.delete()))
  await Promise.allSettled([
    ...adminApps.map(app => deleteAdminApp(app)),
    ...clientApps.map(app => deleteFirebaseApp(app)),
  ])
})

test('verifies a Firebase Auth emulator ID token and resolves the hit through the HTTP API into the RTDB emulator', async () => {
  process.env.FIREBASE_AUTH_EMULATOR_HOST = `127.0.0.1:${AUTH_PORT}`
  process.env.FIREBASE_DATABASE_EMULATOR_HOST = `127.0.0.1:${DATABASE_PORT}`
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
  const serviceAccount = {
    projectId: PROJECT,
    clientEmail: `combat-api-test@${PROJECT}.iam.gserviceaccount.com`,
    privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
  }
  const adminApp = initializeAdminApp({
    credential: cert(serviceAccount),
    projectId: PROJECT,
    databaseURL: `https://${PROJECT}.firebaseio.com`,
  }, `combat-api-admin-${randomUUID()}`)
  adminApps.push(adminApp)
  const database = getAdminDatabase(adminApp)
  const adminAuth = getAdminAuth(adminApp)

  const clientApp = initializeClientApp({
    apiKey: 'emulator-test-key',
    authDomain: `${PROJECT}.firebaseapp.com`,
    projectId: PROJECT,
    databaseURL: `https://${PROJECT}.firebaseio.com`,
  }, `combat-api-client-${randomUUID()}`)
  clientApps.push(clientApp)
  const auth = getAuth(clientApp)
  connectAuthEmulator(auth, `http://127.0.0.1:${AUTH_PORT}`, { disableWarnings: true })
  const actor = (await createUserWithEmailAndPassword(auth, `combat-api-${randomUUID()}@example.test`, randomUUID())).user
  users.push(actor)
  const target = (await createUserWithEmailAndPassword(auth, `combat-api-${randomUUID()}@example.test`, randomUUID())).user
  users.push(target)
  const idToken = await actor.getIdToken()
  const now = Date.now()
  await database.ref('/').set({
    members: { [actor.uid]: true, [target.uid]: true },
    world: {
      players: {
        [actor.uid]: {
          presence: { online: true, lastChanged: now },
          position: { x: 200, y: 320, zone: 'island', updatedAt: now },
        },
        [target.uid]: {
          presence: { online: true, lastChanged: now },
          position: { x: 220, y: 320, zone: 'island', updatedAt: now },
        },
      },
      combat: { loadouts: { [actor.uid]: { weapon: 'sword' } } },
    },
  })

  server = createCombatApi({
    verifyIdToken: token => adminAuth.verifyIdToken(token, true),
    database,
    allowedOrigins: new Set([API_ORIGIN]),
    onInternalError: category => {
      internalErrorCategory = category
    },
  })
  internalErrorCategory = null
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/combat/attack`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${idToken}`, Origin: API_ORIGIN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ targetUid: target.uid, facing: 'right', requestId: `hit-${randomUUID()}` }),
  })
  assert.equal(response.status, 200, `API internal failure category: ${internalErrorCategory ?? 'none'}`)
  assert.equal(response.headers.get('access-control-allow-origin'), API_ORIGIN)
  assert.equal((await response.json()).result, 'hit')
  const combat = (await database.ref('world/combat/state/players').get()).val()
  assert.equal(combat[target.uid].health, 80)
  assert.equal(combat[target.uid].knockout, 'alive')
})
