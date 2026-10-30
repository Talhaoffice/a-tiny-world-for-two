export const LOCAL_EMULATOR_PROJECT_ID = 'a-tiny-world-for-two'
export const LOCAL_EMULATOR_HOSTS = Object.freeze({
  auth: '127.0.0.1:9099',
  database: '127.0.0.1:9000',
  firestore: '127.0.0.1:8080',
})

export function validateLocalBootstrapConfig({ optIn, projectId, authHost, databaseHost, firestoreHost }) {
  if (optIn !== '1') throw new Error('Set TINY_WORLD_EMULATOR_BOOTSTRAP=1 to authorize local emulator seeding.')
  if (projectId !== LOCAL_EMULATOR_PROJECT_ID) throw new Error('Bootstrap is restricted to the configured local Firebase project.')
  if (authHost !== LOCAL_EMULATOR_HOSTS.auth
    || databaseHost !== LOCAL_EMULATOR_HOSTS.database
    || firestoreHost !== LOCAL_EMULATOR_HOSTS.firestore) {
    throw new Error('Bootstrap requires the exact loopback Auth, Realtime Database, and Firestore emulator endpoints.')
  }
}

export function validateTestUids(uidA, uidB) {
  const uidPattern = /^[A-Za-z0-9_-]{1,128}$/
  if (!uidPattern.test(uidA) || !uidPattern.test(uidB) || uidA === uidB) {
    throw new Error('Provide two distinct valid emulator Auth UIDs.')
  }
}

export function firestoreBootstrapDocuments(uidTalha, uidMannu) {
  validateTestUids(uidTalha, uidMannu)
  return {
    members: [
      { uid: uidTalha, data: { active: true } },
      { uid: uidMannu, data: { active: true } },
    ],
    worldMain: { talhaUid: uidTalha, mannuUid: uidMannu },
  }
}

export function realtimeDatabaseMembership(uidA, uidB) {
  validateTestUids(uidA, uidB)
  return { [uidA]: true, [uidB]: true }
}
