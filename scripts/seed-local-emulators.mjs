import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import {
  LOCAL_EMULATOR_HOSTS,
  LOCAL_EMULATOR_PROJECT_ID,
  firestoreBootstrapDocuments,
  realtimeDatabaseMembership,
  validateLocalBootstrapConfig,
  validateTestUids,
} from './local-emulator-bootstrap-core.mjs'

const expectedDatabaseUrl = `http://${LOCAL_EMULATOR_HOSTS.database}?ns=${LOCAL_EMULATOR_PROJECT_ID}-default-rtdb`

function bootstrapAdminSdk() {
  const require = createRequire(resolve(dirname(fileURLToPath(import.meta.url)), '../functions/package.json'))
  return {
    ...require('firebase-admin/app'),
    ...require('firebase-admin/auth'),
    ...require('firebase-admin/database'),
    ...require('firebase-admin/firestore'),
  }
}

export async function seedLocalEmulatorMembers(uidTalha, uidMannu) {
  validateLocalBootstrapConfig({
    optIn: process.env.TINY_WORLD_EMULATOR_BOOTSTRAP,
    projectId: process.env.GCLOUD_PROJECT,
    authHost: process.env.FIREBASE_AUTH_EMULATOR_HOST,
    databaseHost: process.env.FIREBASE_DATABASE_EMULATOR_HOST,
    firestoreHost: process.env.FIRESTORE_EMULATOR_HOST,
  })
  validateTestUids(uidTalha, uidMannu)

  const { initializeApp, deleteApp, getAuth, getDatabase, getFirestore } = bootstrapAdminSdk()
  const app = initializeApp({ projectId: LOCAL_EMULATOR_PROJECT_ID, databaseURL: expectedDatabaseUrl }, 'local-emulator-bootstrap')
  try {
    const auth = getAuth(app)
    const database = getDatabase(app)
    const firestore = getFirestore(app)

    try {
      await Promise.all([auth.getUser(uidTalha), auth.getUser(uidMannu)])
    } catch {
      throw new Error('Both supplied UIDs must already exist in the local Auth emulator.')
    }

    const membersCollection = firestore.collection('members')
    const currentActiveMembers = await membersCollection.where('active', '==', true).get()
    const suppliedUids = new Set([uidTalha, uidMannu])
    if (currentActiveMembers.docs.some(document => !suppliedUids.has(document.id))) {
      throw new Error('The local Firestore emulator has other active members; refusing to alter its roster.')
    }

    const [memberSnapshots, worldMainSnapshot] = await Promise.all([
      Promise.all([...suppliedUids].map(uid => membersCollection.doc(uid).get())),
      firestore.doc('world/main').get(),
    ])
    if (memberSnapshots.some(document => document.exists && document.data()?.active !== true)) {
      throw new Error('A supplied UID already has a conflicting Firestore membership record; refusing to overwrite it.')
    }
    if (worldMainSnapshot.exists) {
      const existingRoster = worldMainSnapshot.data()
      if (existingRoster?.talhaUid !== uidTalha || existingRoster?.mannuUid !== uidMannu) {
        throw new Error('The local Firestore roster maps different UIDs; refusing to overwrite it.')
      }
    }

    const batch = firestore.batch()
    const fixture = firestoreBootstrapDocuments(uidTalha, uidMannu)
    for (const member of fixture.members) {
      batch.set(membersCollection.doc(member.uid), member.data, { merge: true })
    }
    batch.set(firestore.doc('world/main'), fixture.worldMain, { merge: true })

    await batch.commit()
    await database.ref('members').update(realtimeDatabaseMembership(uidTalha, uidMannu))
    return { seededMembers: 2 }
  } finally {
    await deleteApp(app)
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [, , uidTalha, uidMannu, ...extra] = process.argv
  if (!uidTalha || !uidMannu || extra.length > 0) {
    console.error('Usage: npm run emulator:seed -- <talha-emulator-uid> <mannu-emulator-uid>')
    process.exitCode = 2
  } else {
    try {
      const result = await seedLocalEmulatorMembers(uidTalha, uidMannu)
      console.log(`Seeded ${result.seededMembers} local emulator members and the required roster mapping.`)
    } catch (error) {
      console.error(error instanceof Error ? error.message : 'Local emulator bootstrap failed.')
      process.exitCode = 1
    }
  }
}
