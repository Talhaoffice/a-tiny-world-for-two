import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { assertBuildTarget, assertEmulatorProject, firebaseAppName, FIREBASE_FUNCTIONS_REGION, requireEmulatorServices, resolveFirebaseTarget } from '../src/lib/firebaseTarget.ts'
import {
  LOCAL_EMULATOR_HOSTS,
  LOCAL_EMULATOR_PROJECT_ID,
  firestoreBootstrapDocuments,
  realtimeDatabaseMembership,
  validateLocalBootstrapConfig,
  validateTestUids,
} from '../scripts/local-emulator-bootstrap-core.mjs'

test('development defaults to the local emulator and hosted use requires an explicit target', () => {
  assert.equal(resolveFirebaseTarget(true, undefined), 'emulator')
  assert.equal(resolveFirebaseTarget(true, 'hosted'), 'hosted')
  assert.equal(resolveFirebaseTarget(false, undefined), 'hosted')
})

test('emulator service configuration matches the Firebase CLI ports', () => {
  assert.equal(FIREBASE_FUNCTIONS_REGION, 'us-central1')
})

test('configured endpoints match firebase.json and all browser services use emulator connectors', async () => {
  const firebaseConfig = JSON.parse(await readFile(new URL('../firebase.json', import.meta.url), 'utf8'))
  const source = await readFile(new URL('../src/lib/firebase.ts', import.meta.url), 'utf8')
  const endpoints = {
    auth: { host: '127.0.0.1', port: 9099 },
    database: { host: '127.0.0.1', port: 9000 },
    firestore: { host: '127.0.0.1', port: 8080 },
    functions: { host: '127.0.0.1', port: 5001 },
  }
  for (const service of ['auth', 'database', 'firestore', 'functions']) {
    assert.equal(firebaseConfig.emulators[service].host, endpoints[service].host)
    assert.equal(firebaseConfig.emulators[service].port, endpoints[service].port)
    assert.ok(source.includes(`${service}: { host: '${endpoints[service].host}', port: ${endpoints[service].port}`))
  }
  assert.match(source, /auth: \{ host: '127\.0\.0\.1', port: 9099, url: 'http:\/\/127\.0\.0\.1:9099' \}/)
  assert.match(source, /connectAuthEmulator\(emulatorServices\.firebaseAuth/)
  assert.match(source, /connectDatabaseEmulator\(emulatorServices\.realtimeDatabase/)
  assert.match(source, /connectFirestoreEmulator\(emulatorServices\.firestore/)
  assert.match(source, /connectFunctionsEmulator\(emulatorServices\.firebaseFunctions/)
  assert.equal(firebaseAppName('emulator'), 'tiny-world-local-emulators')
  assert.equal(firebaseAppName('hosted'), '[DEFAULT]')
})

test('emulator mode is rejected by production runtime and build guards', () => {
  assert.throws(() => resolveFirebaseTarget(false, 'emulator'), /only available in Vite development mode/)
  assert.throws(() => assertBuildTarget('build', 'emulator'), /Production builds cannot use Firebase emulator mode/)
  assert.doesNotThrow(() => assertBuildTarget('build', 'hosted'))
})

test('requested emulator mode fails closed when required service initialization is missing', () => {
  assert.doesNotThrow(() => requireEmulatorServices({ auth: {}, database: {}, firestore: {}, functions: {} }))
  assert.throws(() => requireEmulatorServices({ auth: {}, database: {}, firestore: {}, functions: null }), /no hosted fallback/)
})

test('local emulator mode requires the expected project and bootstrap opt-in', () => {
  assert.throws(() => assertEmulatorProject('emulator', 'another-project'), /requires project/)
  assert.doesNotThrow(() => assertEmulatorProject('emulator', LOCAL_EMULATOR_PROJECT_ID))
  assert.throws(() => validateLocalBootstrapConfig({
    optIn: undefined,
    projectId: LOCAL_EMULATOR_PROJECT_ID,
    authHost: LOCAL_EMULATOR_HOSTS.auth,
    databaseHost: LOCAL_EMULATOR_HOSTS.database,
    firestoreHost: LOCAL_EMULATOR_HOSTS.firestore,
  }), /TINY_WORLD_EMULATOR_BOOTSTRAP=1/)
})

test('bootstrap refuses hosted or unexpected emulator endpoints', () => {
  assert.throws(() => validateLocalBootstrapConfig({
    optIn: '1',
    projectId: LOCAL_EMULATOR_PROJECT_ID,
    authHost: 'auth.example.com:9099',
    databaseHost: LOCAL_EMULATOR_HOSTS.database,
    firestoreHost: LOCAL_EMULATOR_HOSTS.firestore,
  }), /exact loopback/)
  assert.throws(() => validateLocalBootstrapConfig({
    optIn: '1',
    projectId: 'production-project',
    authHost: LOCAL_EMULATOR_HOSTS.auth,
    databaseHost: LOCAL_EMULATOR_HOSTS.database,
    firestoreHost: LOCAL_EMULATOR_HOSTS.firestore,
  }), /restricted to the configured local Firebase project/)
})

test('bootstrap fixture contains only active membership and the required roster mapping', () => {
  const fixture = firestoreBootstrapDocuments('local-test-talha', 'local-test-mannu')
  assert.deepEqual(fixture, {
    members: [
      { uid: 'local-test-talha', data: { active: true } },
      { uid: 'local-test-mannu', data: { active: true } },
    ],
    worldMain: { talhaUid: 'local-test-talha', mannuUid: 'local-test-mannu' },
  })
  assert.deepEqual(realtimeDatabaseMembership('local-test-talha', 'local-test-mannu'), {
    'local-test-talha': true,
    'local-test-mannu': true,
  })
  assert.throws(() => validateTestUids('same-user', 'same-user'), /two distinct/)
})

test('local development explicitly selects emulator mode in the example environment', async () => {
  const exampleEnv = await readFile(new URL('../.env.example', import.meta.url), 'utf8')
  assert.match(exampleEnv, /^VITE_FIREBASE_TARGET=emulator$/m)
})
