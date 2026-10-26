import { readFile } from 'node:fs/promises'
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing'
import {
  deleteField,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore'
import { get as getRealtimeValue, ref as realtimeRef, serverTimestamp as realtimeServerTimestamp, set as setRealtimeValue } from 'firebase/database'

const PROJECT_ID = 'a-tiny-world-for-two'
const HOST = '127.0.0.1'
const FIRESTORE_PORT = 8080
const DATABASE_PORT = 9000
const MEMBER_A = 'test-member-a'
const MEMBER_B = 'test-member-b'
const INACTIVE_MEMBER = 'test-inactive-member'
const UNLISTED_USER = 'test-unlisted-user'
const notePath = 'homes/shared/notes'
const keepsakePath = 'homes/shared/keepsakes'
const flowerPath = 'gardens/shared/flowers'
const tutorialPath = 'playerTutorials'
const profilePath = 'playerProfiles'
const cornerPath = 'playerCorners'
const dreamPath = 'dreams/shared/entries'
const fixedDate = Timestamp.fromDate(new Date('2026-01-01T00:00:00.000Z'))
const futureDate = Timestamp.fromMillis(Date.now() + 24 * 60 * 60 * 1000)

let testEnv

const memberContext = uid => testEnv.authenticatedContext(uid).firestore()
const unauthenticatedContext = () => testEnv.unauthenticatedContext().firestore()
const realtimeContext = uid => testEnv.authenticatedContext(uid).database()
const note = (authorUid = MEMBER_A, text = 'A test note') => ({ authorUid, text, createdAt: serverTimestamp() })
const keepsake = (authorUid = MEMBER_A, title = 'Test keepsake', description = 'A fixture only') => ({
  authorUid, title, description, createdAt: serverTimestamp(),
})
const flower = (authorUid = MEMBER_A, title = 'Test flower', memory = 'A fixture only', flowerType = 'gold') => ({
  authorUid, title, memory, flowerType, createdAt: serverTimestamp(),
})
const letter = (senderUid = MEMBER_A, recipientUid = MEMBER_B, text = 'Fixture letter') => ({
  senderUid, recipientUid, text, createdAt: serverTimestamp(), opened: false, openedAt: null,
})
const v2Letter = (releaseAt = serverTimestamp(), senderUid = MEMBER_A, recipientUid = MEMBER_B) => ({
  senderUid, recipientUid, createdAt: serverTimestamp(), releaseAt, schemaVersion: 2,
})
const letterBody = (title = 'Fixture title', text = 'Fixture body', updatedAt = serverTimestamp()) => ({ title, text, updatedAt })
const tutorialProgress = (welcomeReadAt = null, completedAt = null, tutorialVersion = 1) => ({
  tutorialVersion, welcomeReadAt, completedAt,
})
const validProfile = (appearance = { hair: 'short', outfit: 'jacket', accessory: 'none' }) => ({ appearance })
const lanternCorner = (ownerUid = MEMBER_A, patch = {}) => ({
  ownerUid, cornerId: 'lantern-post', postLanternLit: false, workshopLanternLit: false,
  decoration: 'none', updatedAt: serverTimestamp(), ...patch,
})
const greenhouseCorner = (ownerUid = MEMBER_B, patch = {}) => ({
  ownerUid, cornerId: 'greenhouse', plotOneWatered: false, plotTwoWatered: false,
  decoration: 'none', updatedAt: serverTimestamp(), ...patch,
})
const specialDates = (patch = {}) => ({
  dateOne: null, dateTwo: null, dateThree: null, dateFour: null, dateFive: null,
  updatedAt: serverTimestamp(), ...patch,
})
const dream = (authorUid = MEMBER_A, text = 'A quiet sky with a small boat') => ({
  authorUid, text, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
})
const validPosition = (zone = undefined) => ({ x: 240, y: 320, updatedAt: Date.now(), ...(zone ? { zone } : {}) })

async function createV2Letter(db, id, releaseAt = serverTimestamp(), title = 'A test title', text = 'A test letter') {
  const parent = doc(db, 'letters', id)
  const batch = writeBatch(db)
  batch.set(parent, v2Letter(releaseAt))
  batch.set(doc(parent, 'private', 'body'), letterBody(title, text))
  return batch.commit()
}

before(async () => {
  const [rules, databaseRules] = await Promise.all([
    readFile(new URL('../firestore.rules', import.meta.url), 'utf8'),
    readFile(new URL('../database.rules.json', import.meta.url), 'utf8'),
  ])
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { host: HOST, port: FIRESTORE_PORT, rules },
    database: { host: HOST, port: DATABASE_PORT, rules: databaseRules },
  })

  await testEnv.withSecurityRulesDisabled(async context => {
    const db = context.firestore()
    await Promise.all([
      setDoc(doc(db, 'members', MEMBER_A), { active: true }),
      setDoc(doc(db, 'members', MEMBER_B), { active: true }),
      setDoc(doc(db, 'members', INACTIVE_MEMBER), { active: false }),
      setDoc(doc(db, 'world', 'main'), { talhaUid: MEMBER_A, mannuUid: MEMBER_B }),
      setDoc(doc(db, 'content', 'introLetter'), { text: 'Fixture intro letter', updatedAt: fixedDate }),
      setDoc(doc(db, notePath, 'fixture-note'), { authorUid: MEMBER_A, text: 'Fixture note', createdAt: fixedDate }),
      setDoc(doc(db, keepsakePath, 'fixture-keepsake'), { authorUid: MEMBER_B, title: 'Fixture keepsake', description: 'Fixture only', createdAt: fixedDate }),
      setDoc(doc(db, flowerPath, 'fixture-flower'), { authorUid: MEMBER_A, title: 'Fixture flower', memory: 'Fixture only', flowerType: 'rose', createdAt: fixedDate }),
      setDoc(doc(db, 'letters', 'a-to-b'), { senderUid: MEMBER_A, recipientUid: MEMBER_B, text: 'Fixture letter A to B', createdAt: fixedDate, opened: false, openedAt: null }),
      setDoc(doc(db, 'letters', 'b-to-a'), { senderUid: MEMBER_B, recipientUid: MEMBER_A, text: 'Fixture letter B to A', createdAt: fixedDate, opened: false, openedAt: null }),
      setDoc(doc(db, 'letters', 'a-to-b-sender-denied'), { senderUid: MEMBER_A, recipientUid: MEMBER_B, text: 'Unopened sender test', createdAt: fixedDate, opened: false, openedAt: null }),
      setDoc(doc(db, 'letters', 'a-to-b-immutable'), { senderUid: MEMBER_A, recipientUid: MEMBER_B, text: 'Immutable test fixture', createdAt: fixedDate, opened: false, openedAt: null }),
      setDoc(doc(db, 'letters', 'a-to-b-v2-future'), v2Letter(futureDate)),
      setDoc(doc(db, 'letters', 'a-to-b-v2-future', 'private', 'body'), letterBody()),
      setDoc(doc(db, 'letters', 'a-to-b-v2-future-reschedule'), v2Letter(futureDate)),
      setDoc(doc(db, 'letters', 'a-to-b-v2-future-reschedule', 'private', 'body'), letterBody()),
      setDoc(doc(db, 'letters', 'a-to-b-v2-future-delete'), v2Letter(futureDate)),
      setDoc(doc(db, 'letters', 'a-to-b-v2-future-delete', 'private', 'body'), letterBody()),
      setDoc(doc(db, 'letters', 'a-to-b-v2-ready'), v2Letter(fixedDate)),
      setDoc(doc(db, 'letters', 'a-to-b-v2-ready', 'private', 'body'), letterBody()),
      setDoc(doc(db, 'letters', 'a-to-b-v2-past-unopened'), v2Letter(fixedDate)),
      setDoc(doc(db, 'letters', 'a-to-b-v2-past-unopened', 'private', 'body'), letterBody()),
      setDoc(doc(db, 'letters', 'a-to-b-v2-opened'), { ...v2Letter(fixedDate), openedAt: fixedDate }),
      setDoc(doc(db, 'letters', 'a-to-b-v2-opened', 'private', 'body'), letterBody()),
      setDoc(doc(db, 'letters', 'a-to-b-legacy-upgrade'), { senderUid: MEMBER_A, recipientUid: MEMBER_B, text: 'Synthetic legacy body', createdAt: fixedDate, opened: false, openedAt: null }),
      setDoc(doc(db, 'letters', 'a-to-b-legacy-opened'), { senderUid: MEMBER_A, recipientUid: MEMBER_B, text: 'Synthetic opened body', createdAt: fixedDate, opened: true, openedAt: fixedDate }),
      setDoc(doc(db, profilePath, MEMBER_A), { displayName: 'Talha', appearance: { hair: 'short', outfit: 'jacket', accessory: 'none' } }),
      setDoc(doc(db, profilePath, MEMBER_B), { appearance: { hair: 'long', outfit: 'cardigan', accessory: 'sage-accent' } }),
      setDoc(doc(db, tutorialPath, MEMBER_A), tutorialProgress(fixedDate)),
    ])

    const rtdb = context.database()
    await rtdb.ref('members').set({ [MEMBER_A]: true, [MEMBER_B]: true, [INACTIVE_MEMBER]: true })
  })
})

after(async () => {
  if (testEnv) {
    await Promise.all([testEnv.clearFirestore(), testEnv.clearDatabase()])
    await testEnv.cleanup()
  }
})

describe('Firestore security rules: unauthenticated access', () => {
  it('denies protected reads and writes for all content and membership', async () => {
    const db = unauthenticatedContext()
    await Promise.all([
      assertFails(getDoc(doc(db, notePath, 'fixture-note'))),
      assertFails(getDoc(doc(db, keepsakePath, 'fixture-keepsake'))),
      assertFails(getDoc(doc(db, flowerPath, 'fixture-flower'))),
      assertFails(getDoc(doc(db, 'letters', 'a-to-b'))),
      assertFails(getDoc(doc(db, 'letters', 'a-to-b-v2-future', 'private', 'body'))),
      assertFails(getDoc(doc(db, 'members', MEMBER_A))),
      assertFails(getDoc(doc(db, profilePath, MEMBER_A))),
      assertFails(getDoc(doc(db, 'world', 'main'))),
      assertFails(getDoc(doc(db, 'content', 'introLetter'))),
      assertFails(getDoc(doc(db, tutorialPath, MEMBER_A))),
      assertFails(setDoc(doc(db, notePath, 'unauth-note'), note())),
      assertFails(setDoc(doc(db, keepsakePath, 'unauth-keepsake'), keepsake())),
      assertFails(setDoc(doc(db, flowerPath, 'unauth-flower'), flower())),
      assertFails(setDoc(doc(db, 'letters', 'unauth-letter'), letter())),
      assertFails(setDoc(doc(db, tutorialPath, 'unauth-user'), tutorialProgress())),
    ])
  })
})

describe('Firestore security rules: active member shared content', () => {
  it('allows active members to read all shared content types', async () => {
    const db = memberContext(MEMBER_A)
    await Promise.all([
      assertSucceeds(getDoc(doc(db, notePath, 'fixture-note'))),
      assertSucceeds(getDoc(doc(db, keepsakePath, 'fixture-keepsake'))),
      assertSucceeds(getDoc(doc(db, flowerPath, 'fixture-flower'))),
    ])
  })

  it('allows valid note, keepsake, and flower creation', async () => {
    const db = memberContext(MEMBER_A)
    await Promise.all([
      assertSucceeds(setDoc(doc(db, notePath, 'valid-note'), note())),
      assertSucceeds(setDoc(doc(db, keepsakePath, 'valid-keepsake'), keepsake())),
      assertSucceeds(setDoc(doc(db, flowerPath, 'valid-flower'), flower())),
      assertSucceeds(setDoc(doc(db, flowerPath, 'valid-flower-rose'), flower(MEMBER_A, 'Rose', 'Fixture only', 'rose'))),
      assertSucceeds(setDoc(doc(db, flowerPath, 'valid-flower-cream'), flower(MEMBER_A, 'Cream', 'Fixture only', 'cream'))),
      assertSucceeds(setDoc(doc(db, flowerPath, 'valid-flower-coral'), flower(MEMBER_A, 'Coral', 'Fixture only', 'coral'))),
    ])
  })

  it('allows another active member to query newly created notes, keepsakes, and flowers', async () => {
    const writer = memberContext(MEMBER_A)
    await Promise.all([
      setDoc(doc(writer, notePath, 'cross-member-note'), note()),
      setDoc(doc(writer, keepsakePath, 'cross-member-keepsake'), keepsake()),
      setDoc(doc(writer, flowerPath, 'cross-member-flower'), flower(MEMBER_A, 'New flower', 'A newly planted shared memory.')),
    ])

    const reader = memberContext(MEMBER_B)
    const [notes, keepsakes, flowers] = await Promise.all([
      assertSucceeds(getDocs(query(collection(reader, notePath), orderBy('createdAt', 'desc'), limit(50)))),
      assertSucceeds(getDocs(query(collection(reader, keepsakePath), orderBy('createdAt', 'desc'), limit(50)))),
      assertSucceeds(getDocs(query(collection(reader, flowerPath), orderBy('createdAt', 'desc'), limit(50)))),
    ])
    assert.equal(notes.docs.some(document => document.id === 'cross-member-note'), true)
    assert.equal(keepsakes.docs.some(document => document.id === 'cross-member-keepsake'), true)
    assert.equal(flowers.docs.some(document => document.id === 'cross-member-flower'), true)
  })

  it('rejects invalid notes, keepsakes, and flowers', async () => {
    const db = memberContext(MEMBER_A)
    const invalidWrites = [
      setDoc(doc(db, notePath, 'note-missing-field'), { authorUid: MEMBER_A, createdAt: serverTimestamp() }),
      setDoc(doc(db, notePath, 'note-too-long'), note(MEMBER_A, 'n'.repeat(501))),
      setDoc(doc(db, notePath, 'note-wrong-author'), note(MEMBER_B)),
      setDoc(doc(db, notePath, 'note-extra-field'), { ...note(), unexpected: true }),
      setDoc(doc(db, keepsakePath, 'keepsake-missing-field'), { authorUid: MEMBER_A, title: 'Title', createdAt: serverTimestamp() }),
      setDoc(doc(db, keepsakePath, 'keepsake-title-too-long'), keepsake(MEMBER_A, 't'.repeat(61), 'Description')),
      setDoc(doc(db, keepsakePath, 'keepsake-description-too-long'), keepsake(MEMBER_A, 'Title', 'd'.repeat(301))),
      setDoc(doc(db, keepsakePath, 'keepsake-wrong-author'), keepsake(MEMBER_B)),
      setDoc(doc(db, flowerPath, 'flower-missing-field'), { authorUid: MEMBER_A, title: 'Title', createdAt: serverTimestamp() }),
      setDoc(doc(db, flowerPath, 'flower-title-too-long'), flower(MEMBER_A, 't'.repeat(61))),
      setDoc(doc(db, flowerPath, 'flower-memory-too-long'), flower(MEMBER_A, 'Title', 'm'.repeat(301))),
      setDoc(doc(db, flowerPath, 'flower-invalid-type'), flower(MEMBER_A, 'Title', 'Memory', 'violet')),
      setDoc(doc(db, flowerPath, 'flower-extra-field'), { ...flower(), unexpected: true }),
      setDoc(doc(db, flowerPath, 'flower-wrong-author'), flower(MEMBER_B)),
    ]
    await Promise.all(invalidWrites.map(write => assertFails(write)))
  })

  it('allows creators to edit and delete their own notes, keepsakes, and flowers only', async () => {
    const ownerA = memberContext(MEMBER_A)
    const ownerB = memberContext(MEMBER_B)
    await Promise.all([
      assertSucceeds(updateDoc(doc(ownerA, notePath, 'fixture-note'), { text: 'Edited note', updatedAt: serverTimestamp() })),
      assertFails(updateDoc(doc(ownerB, notePath, 'fixture-note'), { text: 'Other member edit', updatedAt: serverTimestamp() })),
      assertFails(updateDoc(doc(ownerA, notePath, 'fixture-note'), { authorUid: MEMBER_B, text: 'Changed author', updatedAt: serverTimestamp() })),
      assertFails(updateDoc(doc(ownerA, notePath, 'fixture-note'), { createdAt: Timestamp.fromMillis(fixedDate.toMillis() + 1), text: 'Changed creation time', updatedAt: serverTimestamp() })),
      assertFails(updateDoc(doc(ownerA, notePath, 'fixture-note'), { text: 'n'.repeat(501), updatedAt: serverTimestamp() })),
      assertSucceeds(updateDoc(doc(ownerB, keepsakePath, 'fixture-keepsake'), { description: 'Edited description', updatedAt: serverTimestamp() })),
      assertFails(updateDoc(doc(ownerA, keepsakePath, 'fixture-keepsake'), { description: 'Other member edit', updatedAt: serverTimestamp() })),
      assertFails(updateDoc(doc(ownerB, keepsakePath, 'fixture-keepsake'), { authorUid: MEMBER_A, updatedAt: serverTimestamp() })),
      assertFails(updateDoc(doc(ownerB, keepsakePath, 'fixture-keepsake'), { createdAt: Timestamp.fromMillis(fixedDate.toMillis() + 1), updatedAt: serverTimestamp() })),
      assertFails(updateDoc(doc(ownerB, keepsakePath, 'fixture-keepsake'), { title: 'k'.repeat(61), updatedAt: serverTimestamp() })),
      assertSucceeds(updateDoc(doc(ownerA, flowerPath, 'fixture-flower'), { memory: 'Edited memory', updatedAt: serverTimestamp() })),
      assertFails(updateDoc(doc(ownerB, flowerPath, 'fixture-flower'), { memory: 'Other member edit', updatedAt: serverTimestamp() })),
      assertFails(updateDoc(doc(ownerA, flowerPath, 'fixture-flower'), { authorUid: MEMBER_B, updatedAt: serverTimestamp() })),
      assertFails(updateDoc(doc(ownerA, flowerPath, 'fixture-flower'), { createdAt: Timestamp.fromMillis(fixedDate.toMillis() + 1), updatedAt: serverTimestamp() })),
      assertFails(updateDoc(doc(ownerA, flowerPath, 'fixture-flower'), { flowerType: 'violet', updatedAt: serverTimestamp() })),
    ])
    await Promise.all([
      assertSucceeds(deleteDoc(doc(ownerA, notePath, 'fixture-note'))),
      assertFails(deleteDoc(doc(ownerB, notePath, 'fixture-note'))),
      assertFails(deleteDoc(doc(ownerA, keepsakePath, 'fixture-keepsake'))),
      assertSucceeds(deleteDoc(doc(ownerB, keepsakePath, 'fixture-keepsake'))),
      assertSucceeds(deleteDoc(doc(ownerA, flowerPath, 'fixture-flower'))),
      assertFails(deleteDoc(doc(ownerB, flowerPath, 'fixture-flower'))),
    ])
  })
})

describe('Firestore security rules: letters', () => {
  it('creates v2 parent metadata and the protected body in one batch', async () => {
    const db = memberContext(MEMBER_A)
    await assertSucceeds(createV2Letter(db, 'valid-v2-immediate'))
    await assertSucceeds(createV2Letter(db, 'valid-v2-scheduled', futureDate))

    const parent = await getDoc(doc(db, 'letters', 'valid-v2-scheduled'))
    assert.equal(parent.data().schemaVersion, 2)
    assert.equal('text' in parent.data(), false)
    assert.equal('title' in parent.data(), false)
    await assertSucceeds(getDoc(doc(db, 'letters', 'valid-v2-scheduled', 'private', 'body')))
  })

  it('rejects parent-only and body-only creates', async () => {
    const db = memberContext(MEMBER_A)
    await Promise.all([
      assertFails(setDoc(doc(db, 'letters', 'parent-without-body'), v2Letter())),
      assertFails(setDoc(doc(db, 'letters', 'body-without-parent', 'private', 'body'), letterBody())),
    ])
  })

  it('rejects invalid v2 parents, schedules, titles, bodies, and extra fields', async () => {
    const db = memberContext(MEMBER_A)
    const write = (id, parentData, bodyData = letterBody()) => {
      const batch = writeBatch(db)
      batch.set(doc(db, 'letters', id), parentData)
      batch.set(doc(db, 'letters', id, 'private', 'body'), bodyData)
      return batch.commit()
    }
    const tooFar = Timestamp.fromMillis(Date.now() + 6 * 365 * 24 * 60 * 60 * 1000)
    await Promise.all([
      assertFails(write('letter-old-schema-create', letter())),
      assertFails(write('letter-wrong-sender', v2Letter(serverTimestamp(), MEMBER_B, MEMBER_A))),
      assertFails(write('letter-self-addressed', v2Letter(serverTimestamp(), MEMBER_A, MEMBER_A))),
      assertFails(write('letter-inactive-recipient', v2Letter(serverTimestamp(), MEMBER_A, INACTIVE_MEMBER))),
      assertFails(write('letter-unlisted-recipient', v2Letter(serverTimestamp(), MEMBER_A, UNLISTED_USER))),
      assertFails(write('letter-past-release', v2Letter(fixedDate))),
      assertFails(write('letter-release-too-far', v2Letter(tooFar))),
      assertFails(write('letter-parent-extra-field', { ...v2Letter(), text: 'must be in body only' })),
      assertFails(write('letter-parent-optional-open-on-create', { ...v2Letter(), openedAt: null })),
      assertFails(write('letter-body-extra-field', v2Letter(), { ...letterBody(), extra: true })),
      assertFails(write('letter-body-title-too-long', v2Letter(), letterBody('t'.repeat(81)))),
      assertFails(write('letter-body-empty-title', v2Letter(), letterBody(''))),
      assertFails(write('letter-body-too-long', v2Letter(), letterBody('Title', 'x'.repeat(2001)))),
      assertFails(write('letter-body-empty', v2Letter(), letterBody('Title', ''))),
    ])
  })

  it('lets participants read parent metadata while hiding a future body from the recipient', async () => {
    const sender = memberContext(MEMBER_A)
    const recipient = memberContext(MEMBER_B)
    const parentPath = doc(sender, 'letters', 'a-to-b-v2-future')
    const bodyPath = doc(sender, 'letters', 'a-to-b-v2-future', 'private', 'body')
    await Promise.all([
      assertSucceeds(getDoc(parentPath)),
      assertSucceeds(getDoc(doc(recipient, 'letters', 'a-to-b-v2-future'))),
      assertSucceeds(getDoc(bodyPath)),
      assertFails(getDoc(doc(recipient, 'letters', 'a-to-b-v2-future', 'private', 'body'))),
      assertFails(getDoc(doc(memberContext(INACTIVE_MEMBER), 'letters', 'a-to-b-v2-future', 'private', 'body'))),
      assertFails(getDoc(doc(memberContext(UNLISTED_USER), 'letters', 'a-to-b-v2-future'))),
    ])

    const parents = await assertSucceeds(getDocs(query(
      collection(recipient, 'letters'),
      where('recipientUid', '==', MEMBER_B),
      orderBy('createdAt', 'desc'),
      limit(50),
    )))
    const listed = parents.docs.find(item => item.id === 'a-to-b-v2-future')
    assert.ok(listed)
    assert.equal('text' in listed.data(), false)
    assert.equal('title' in listed.data(), false)
    await assertFails(getDocs(collection(recipient, 'letters', 'a-to-b-v2-future', 'private')))
  })

  it('allows a released recipient to read the body and set openedAt once', async () => {
    const recipient = memberContext(MEMBER_B)
    const path = doc(recipient, 'letters', 'a-to-b-v2-ready')
    await assertSucceeds(getDoc(doc(recipient, 'letters', 'a-to-b-v2-ready', 'private', 'body')))
    await assertSucceeds(updateDoc(path, { openedAt: serverTimestamp() }))
    await assertFails(updateDoc(path, { openedAt: serverTimestamp() }))
  })

  it('denies opening before release, a second open, and recipient changes to other fields', async () => {
    const recipient = memberContext(MEMBER_B)
    await Promise.all([
      assertFails(updateDoc(doc(recipient, 'letters', 'a-to-b-v2-future'), { openedAt: serverTimestamp() })),
      assertFails(updateDoc(doc(recipient, 'letters', 'a-to-b-v2-opened'), { openedAt: serverTimestamp() })),
      assertFails(updateDoc(doc(recipient, 'letters', 'a-to-b-v2-future'), { openedAt: serverTimestamp(), releaseAt: serverTimestamp() })),
      assertFails(updateDoc(doc(recipient, 'letters', 'a-to-b-v2-future'), { openedAt: serverTimestamp(), senderUid: MEMBER_B })),
      assertFails(updateDoc(doc(recipient, 'letters', 'a-to-b-v2-future'), { openedAt: serverTimestamp(), recipientUid: MEMBER_A })),
      assertFails(updateDoc(doc(memberContext(MEMBER_A), 'letters', 'a-to-b-v2-ready'), { openedAt: serverTimestamp() })),
    ])
  })

  it('allows the sender to reschedule and edit the body before release only', async () => {
    const sender = memberContext(MEMBER_A)
    await assertSucceeds(updateDoc(doc(sender, 'letters', 'a-to-b-v2-future-reschedule'), { releaseAt: Timestamp.fromMillis(Date.now() + 48 * 60 * 60 * 1000) }))
    await assertFails(updateDoc(doc(memberContext(MEMBER_B), 'letters', 'a-to-b-v2-future-reschedule'), { releaseAt: Timestamp.fromMillis(Date.now() + 72 * 60 * 60 * 1000) }))
    await assertSucceeds(updateDoc(doc(sender, 'letters', 'a-to-b-v2-future', 'private', 'body'), {
      title: 'Updated title', text: 'Updated fixture body', updatedAt: serverTimestamp(),
    }))
    await assertFails(updateDoc(doc(sender, 'letters', 'a-to-b-v2-future', 'private', 'body'), {
      title: 'Updated title', text: 'Updated fixture body', updatedAt: serverTimestamp(), extra: true,
    }))
    await assertFails(updateDoc(doc(sender, 'letters', 'a-to-b-v2-past-unopened', 'private', 'body'), {
      title: 'Too late', text: 'This body is already released', updatedAt: serverTimestamp(),
    }))
    await assertFails(updateDoc(doc(memberContext(MEMBER_B), 'letters', 'a-to-b-v2-future', 'private', 'body'), {
      title: 'Recipient edit', text: 'Not allowed', updatedAt: serverTimestamp(),
    }))
    await assertFails(updateDoc(doc(sender, 'letters', 'a-to-b-v2-past-unopened'), { releaseAt: Timestamp.fromMillis(Date.now() + 24 * 60 * 60 * 1000) }))
  })

  it('allows only an atomic pre-release sender deletion of v2 parent and body', async () => {
    const sender = memberContext(MEMBER_A)
    await assertFails(deleteDoc(doc(sender, 'letters', 'a-to-b-v2-future-delete')))
    const batch = writeBatch(sender)
    batch.delete(doc(sender, 'letters', 'a-to-b-v2-future-delete'))
    batch.delete(doc(sender, 'letters', 'a-to-b-v2-future-delete', 'private', 'body'))
    await assertSucceeds(batch.commit())
    await assertFails(deleteDoc(doc(memberContext(MEMBER_B), 'letters', 'a-to-b-v2-future')))

    for (const id of ['a-to-b-v2-past-unopened', 'a-to-b-v2-opened']) {
      const lateDelete = writeBatch(sender)
      lateDelete.delete(doc(sender, 'letters', id))
      lateDelete.delete(doc(sender, 'letters', id, 'private', 'body'))
      await assertFails(lateDelete.commit())
    }
  })

  it('keeps legacy letters readable and preserves their existing open behavior', async () => {
    const sender = memberContext(MEMBER_A)
    const recipient = memberContext(MEMBER_B)
    const legacy = await assertSucceeds(getDoc(doc(recipient, 'letters', 'a-to-b')))
    assert.equal(legacy.data().text, 'Fixture letter A to B')
    await assertSucceeds(getDoc(doc(sender, 'letters', 'b-to-a')))
    await assertSucceeds(updateDoc(doc(recipient, 'letters', 'a-to-b'), { opened: true, openedAt: serverTimestamp() }))
    await assertFails(updateDoc(doc(sender, 'letters', 'a-to-b-sender-denied'), { opened: true, openedAt: serverTimestamp() }))
  })

  it('allows the sender to upgrade only an unopened legacy letter in one batch', async () => {
    const sender = memberContext(MEMBER_A)
    const recipient = memberContext(MEMBER_B)
    const openedUpgrade = writeBatch(sender)
    openedUpgrade.update(doc(sender, 'letters', 'a-to-b-legacy-opened'), {
      text: deleteField(), opened: deleteField(), openedAt: deleteField(), releaseAt: serverTimestamp(), schemaVersion: 2,
    })
    openedUpgrade.set(doc(sender, 'letters', 'a-to-b-legacy-opened', 'private', 'body'), letterBody('Letter', 'Synthetic opened body'))
    await assertFails(openedUpgrade.commit())

    const refused = writeBatch(recipient)
    refused.update(doc(recipient, 'letters', 'a-to-b-legacy-upgrade'), {
      text: deleteField(), opened: deleteField(), openedAt: deleteField(), releaseAt: serverTimestamp(), schemaVersion: 2,
    })
    refused.set(doc(recipient, 'letters', 'a-to-b-legacy-upgrade', 'private', 'body'), letterBody('Letter', 'Synthetic legacy body'))
    await assertFails(refused.commit())

    const batch = writeBatch(sender)
    batch.update(doc(sender, 'letters', 'a-to-b-legacy-upgrade'), {
      text: deleteField(), opened: deleteField(), openedAt: deleteField(), releaseAt: serverTimestamp(), schemaVersion: 2,
    })
    batch.set(doc(sender, 'letters', 'a-to-b-legacy-upgrade', 'private', 'body'), letterBody('Letter', 'Synthetic legacy body'))
    await assertSucceeds(batch.commit())
    const parent = await getDoc(doc(recipient, 'letters', 'a-to-b-legacy-upgrade'))
    assert.equal('text' in parent.data(), false)
    assert.equal('openedAt' in parent.data(), false)
    await assertSucceeds(getDoc(doc(recipient, 'letters', 'a-to-b-legacy-upgrade', 'private', 'body')))
  })

  it('denies queries that attempt to read another user’s letters', async () => {
    const db = memberContext(MEMBER_A)
    await Promise.all([
      assertFails(getDocs(query(collection(db, 'letters'), where('senderUid', '==', MEMBER_B)))),
      assertFails(getDocs(query(collection(db, 'letters'), where('recipientUid', '==', MEMBER_B)))),
      assertFails(getDocs(collection(db, 'letters'))),
    ])
  })
})

describe('Firestore security rules: membership', () => {
  it('denies client creation, update, and deletion of any membership record', async () => {
    const db = memberContext(MEMBER_A)
    await Promise.all([
      assertFails(setDoc(doc(db, 'members', 'test-new-member'), { active: true })),
      assertFails(updateDoc(doc(db, 'members', MEMBER_A), { active: false })),
      assertFails(deleteDoc(doc(db, 'members', MEMBER_A))),
      assertFails(updateDoc(doc(db, 'members', MEMBER_B), { active: false })),
      assertFails(deleteDoc(doc(db, 'members', MEMBER_B))),
    ])
  })

  it('denies inactive and unlisted users access to protected shared content', async () => {
    for (const uid of [INACTIVE_MEMBER, UNLISTED_USER]) {
      const db = memberContext(uid)
      await Promise.all([
        assertFails(getDoc(doc(db, notePath, 'fixture-note'))),
        assertFails(getDoc(doc(db, keepsakePath, 'fixture-keepsake'))),
        assertFails(getDoc(doc(db, flowerPath, 'fixture-flower'))),
        assertFails(setDoc(doc(db, notePath, `${uid}-cannot-write`), note(uid))),
        assertFails(setDoc(doc(db, keepsakePath, `${uid}-cannot-write`), keepsake(uid))),
        assertFails(setDoc(doc(db, flowerPath, `${uid}-cannot-write`), flower(uid))),
        assertFails(setDoc(doc(db, 'letters', `${uid}-cannot-write`), letter(uid, MEMBER_A))),
      ])
    }
  })
})

describe('Firestore security rules: per-player tutorial progress', () => {
  it('allows an active member to read and update only their own tutorial progress', async () => {
    const owner = memberContext(MEMBER_A)
    await assertSucceeds(getDoc(doc(owner, tutorialPath, MEMBER_A)))
    await assertSucceeds(updateDoc(doc(owner, tutorialPath, MEMBER_A), { completedAt: serverTimestamp() }))
    const other = memberContext(MEMBER_B)
    const otherProgress = doc(other, tutorialPath, MEMBER_B)
    await assertSucceeds(setDoc(otherProgress, tutorialProgress()))
    await assertSucceeds(updateDoc(otherProgress, { welcomeReadAt: serverTimestamp() }))
    await assertSucceeds(updateDoc(otherProgress, { completedAt: serverTimestamp() }))
    await assertFails(getDoc(doc(owner, tutorialPath, MEMBER_B)))
    await assertFails(setDoc(doc(owner, tutorialPath, MEMBER_B), tutorialProgress()))
  })

  it('denies listing and deletion of tutorial progress', async () => {
    const db = memberContext(MEMBER_A)
    await Promise.all([
      assertFails(getDocs(collection(db, tutorialPath))),
      assertFails(deleteDoc(doc(db, tutorialPath, MEMBER_A))),
    ])
  })

  it('denies inactive and unlisted users reading or creating tutorial progress', async () => {
    for (const uid of [INACTIVE_MEMBER, UNLISTED_USER]) {
      const db = memberContext(uid)
      await Promise.all([
        assertFails(getDoc(doc(db, tutorialPath, uid))),
        assertFails(setDoc(doc(db, tutorialPath, uid), tutorialProgress())),
      ])
    }
  })

  it('rejects invalid fields, types, versions, and client-supplied timestamps', async () => {
    const db = memberContext(MEMBER_A)
    await Promise.all([
      assertFails(setDoc(doc(db, tutorialPath, 'missing-field'), { tutorialVersion: 1, welcomeReadAt: null })),
      assertFails(setDoc(doc(db, tutorialPath, 'extra-field'), { ...tutorialProgress(), notes: 'not allowed' })),
      assertFails(setDoc(doc(db, tutorialPath, 'unsupported-version'), tutorialProgress(null, null, 2))),
      assertFails(setDoc(doc(db, tutorialPath, 'bad-welcome-time'), tutorialProgress('yesterday'))),
      assertFails(setDoc(doc(db, tutorialPath, 'client-time'), tutorialProgress(fixedDate))),
      assertFails(updateDoc(doc(db, tutorialPath, MEMBER_A), { welcomeReadAt: null })),
    ])
  })
})

describe('Firestore security rules: player profiles', () => {
  it('allows an active player to read and write only their own validated profile', async () => {
    const owner = memberContext(MEMBER_A)
    await assertSucceeds(getDoc(doc(owner, profilePath, MEMBER_A)))
    const newProfileUid = 'test-profile-creator'
    await testEnv.withSecurityRulesDisabled(async context => {
      await setDoc(doc(context.firestore(), 'members', newProfileUid), { active: true })
    })
    try {
      const newOwner = memberContext(newProfileUid)
      await assertSucceeds(setDoc(doc(newOwner, profilePath, newProfileUid), validProfile()))
    } finally {
      await testEnv.withSecurityRulesDisabled(async context => {
        await Promise.all([
          deleteDoc(doc(context.firestore(), profilePath, newProfileUid)),
          deleteDoc(doc(context.firestore(), 'members', newProfileUid)),
        ])
      })
    }
    await assertSucceeds(updateDoc(doc(owner, profilePath, MEMBER_A), {
      appearance: { hair: 'long', outfit: 'dress', accessory: 'sage-accent' },
    }))
    await Promise.all([
      assertFails(getDoc(doc(owner, profilePath, MEMBER_B))),
      assertFails(setDoc(doc(owner, profilePath, MEMBER_B), validProfile())),
      assertFails(updateDoc(doc(owner, profilePath, MEMBER_B), { displayName: 'Changed by another member' })),
      assertFails(deleteDoc(doc(owner, profilePath, MEMBER_A))),
      assertFails(getDocs(collection(owner, profilePath))),
    ])
  })

  it('validates appearance, preserves intro completion when updating a profile, and sets it once', async () => {
    const owner = memberContext(MEMBER_A)
    const invalidAppearance = [
      { hair: 'unknown', outfit: 'jacket', accessory: 'none' },
      { hair: 'short', outfit: 'jacket', accessory: 'none', extra: true },
      { hair: 'short', outfit: 'jacket' },
    ]
    await Promise.all(invalidAppearance.map((appearance, index) =>
      assertFails(setDoc(doc(owner, profilePath, `invalid-profile-${index}`), validProfile(appearance)))))
    await assertFails(setDoc(doc(owner, profilePath, 'missing-appearance'), { displayName: 'No appearance' }))
    await assertFails(setDoc(doc(owner, profilePath, 'extra-profile-field'), { ...validProfile(), extra: true }))

    const otherOwner = memberContext(MEMBER_B)
    const profile = doc(otherOwner, profilePath, MEMBER_B)
    await assertSucceeds(updateDoc(profile, { introCompletedAt: serverTimestamp() }))
    await assertSucceeds(updateDoc(profile, { displayName: 'Updated after intro' }))
    await assertFails(updateDoc(profile, { introCompletedAt: serverTimestamp() }))
    await assertFails(updateDoc(profile, { introCompletedAt: deleteField() }))
  })
})

describe('Firestore security rules: player-owned corners', () => {
  it('lets each assigned owner write their corner and both active members visit it', async () => {
    const talha = memberContext(MEMBER_A)
    const mannu = memberContext(MEMBER_B)
    await Promise.all([
      assertSucceeds(setDoc(doc(talha, cornerPath, MEMBER_A), lanternCorner())),
      assertSucceeds(setDoc(doc(mannu, cornerPath, MEMBER_B), greenhouseCorner())),
    ])
    await Promise.all([
      assertSucceeds(getDoc(doc(talha, cornerPath, MEMBER_B))),
      assertSucceeds(getDoc(doc(mannu, cornerPath, MEMBER_A))),
    ])
    await assertSucceeds(updateDoc(doc(talha, cornerPath, MEMBER_A), lanternCorner(MEMBER_A, {
      postLanternLit: true, decoration: 'wind-chime',
    })))
    await assertSucceeds(updateDoc(doc(mannu, cornerPath, MEMBER_B), greenhouseCorner(MEMBER_B, {
      plotOneWatered: true, decoration: 'plant-stand',
    })))
  })

  it('blocks cross-owner writes, invalid corner schemas, queries, deletes, and inactive readers', async () => {
    const talha = memberContext(MEMBER_A)
    const mannu = memberContext(MEMBER_B)
    await Promise.all([
      assertFails(setDoc(doc(mannu, cornerPath, MEMBER_A), lanternCorner(MEMBER_A))),
      assertFails(setDoc(doc(talha, cornerPath, MEMBER_B), greenhouseCorner(MEMBER_B))),
      assertFails(setDoc(doc(talha, cornerPath, 'wrong-owner'), lanternCorner('wrong-owner'))),
      assertFails(setDoc(doc(talha, cornerPath, 'bad-flag'), lanternCorner(MEMBER_A, { postLanternLit: 'yes' }))),
      assertFails(setDoc(doc(talha, cornerPath, 'bad-decoration'), lanternCorner(MEMBER_A, { decoration: 'statue' }))),
      assertFails(setDoc(doc(talha, cornerPath, 'extra-field'), { ...lanternCorner(), extra: true })),
      assertFails(getDocs(collection(talha, cornerPath))),
      assertFails(deleteDoc(doc(talha, cornerPath, MEMBER_A))),
      assertFails(getDoc(doc(memberContext(INACTIVE_MEMBER), cornerPath, MEMBER_A))),
      assertFails(getDoc(doc(memberContext(UNLISTED_USER), cornerPath, MEMBER_A))),
    ])
  })
})

describe('Firestore security rules: world metadata and intro letter', () => {
  it('allows active members to read world/main and denies client changes', async () => {
    const member = memberContext(MEMBER_A)
    await Promise.all([
      assertSucceeds(getDoc(doc(member, 'world', 'main'))),
      assertFails(getDoc(doc(member, 'world', 'other'))),
      assertFails(getDocs(collection(member, 'world'))),
      assertFails(updateDoc(doc(member, 'world', 'main'), { talhaUid: MEMBER_B })),
      assertFails(setDoc(doc(member, 'world', 'main-copy'), { talhaUid: MEMBER_A, mannuUid: MEMBER_B })),
      assertFails(getDoc(doc(memberContext(UNLISTED_USER), 'world', 'main'))),
    ])
  })

  it('lets active members read intro content and only the configured Talha account write it', async () => {
    const talha = memberContext(MEMBER_A)
    const mannu = memberContext(MEMBER_B)
    await Promise.all([
      assertSucceeds(getDoc(doc(talha, 'content', 'introLetter'))),
      assertSucceeds(getDoc(doc(mannu, 'content', 'introLetter'))),
    ])
    await assertFails(updateDoc(doc(mannu, 'content', 'introLetter'), {
      text: 'Unauthorized fixture edit', updatedAt: serverTimestamp(),
    }))
    await assertFails(setDoc(doc(mannu, 'content', 'introLetter-copy'), {
      text: 'Unauthorized fixture create', updatedAt: serverTimestamp(),
    }))
    await assertSucceeds(updateDoc(doc(talha, 'content', 'introLetter'), {
      text: 'Updated neutral fixture content', updatedAt: serverTimestamp(),
    }))
    await assertFails(deleteDoc(doc(talha, 'content', 'introLetter')))
    await assertFails(updateDoc(doc(talha, 'content', 'introLetter'), {
      text: 'x'.repeat(2001), updatedAt: serverTimestamp(),
    }))
  })
})

describe('Firestore security rules: annual special dates', () => {
  it('allows both members to read the date list and only Talha to change it', async () => {
    const talha = memberContext(MEMBER_A)
    const mannu = memberContext(MEMBER_B)
    await Promise.all([
      assertSucceeds(getDoc(doc(talha, 'content', 'specialDates'))),
      assertSucceeds(getDoc(doc(mannu, 'content', 'specialDates'))),
    ])
    await assertSucceeds(setDoc(doc(talha, 'content', 'specialDates'), specialDates({ dateOne: '02-29', dateTwo: '12-31' })))
    await Promise.all([
      assertFails(updateDoc(doc(mannu, 'content', 'specialDates'), specialDates({ dateOne: '12-31' }))),
      assertFails(setDoc(doc(talha, 'content', 'special-dates-copy'), specialDates())),
      assertFails(updateDoc(doc(talha, 'content', 'specialDates'), specialDates({ dateOne: '02-30' }))),
      assertFails(updateDoc(doc(talha, 'content', 'specialDates'), { ...specialDates(), extra: true })),
      assertFails(getDocs(collection(talha, 'content'))),
      assertFails(deleteDoc(doc(talha, 'content', 'specialDates'))),
    ])
  })
})

describe('Firestore security rules: shared dream board', () => {
  it('lets both active members read, while each author alone edits or deletes their entry', async () => {
    const owner = memberContext(MEMBER_A)
    const other = memberContext(MEMBER_B)
    const entry = doc(owner, dreamPath, 'dream-owner-entry')
    await assertSucceeds(setDoc(entry, dream()))
    await Promise.all([
      assertSucceeds(getDoc(entry)),
      assertSucceeds(getDoc(doc(other, dreamPath, 'dream-owner-entry'))),
      assertSucceeds(getDocs(collection(other, dreamPath))),
    ])
    await assertSucceeds(updateDoc(entry, { ...dream(MEMBER_A, 'A quiet sky with a garden'), createdAt: (await getDoc(entry)).data().createdAt }))
    await Promise.all([
      assertFails(updateDoc(doc(other, dreamPath, 'dream-owner-entry'), { text: 'Changed by another member', updatedAt: serverTimestamp() })),
      assertFails(deleteDoc(doc(other, dreamPath, 'dream-owner-entry'))),
    ])
    await assertSucceeds(deleteDoc(entry))
  })

  it('rejects long text, extra fields, and an author UID that does not match sign-in', async () => {
    const owner = memberContext(MEMBER_A)
    await Promise.all([
      assertFails(setDoc(doc(owner, dreamPath, 'dream-too-long'), dream(MEMBER_A, 'd'.repeat(301)))),
      assertFails(setDoc(doc(owner, dreamPath, 'dream-extra'), { ...dream(), html: '<b>not rich text</b>' })),
      assertFails(setDoc(doc(owner, dreamPath, 'dream-other-author'), dream(MEMBER_B))),
    ])
  })
})

describe('Realtime Database rules: player ownership', () => {
  it('allows owners to write valid positions and blocks cross-user or membership writes', async () => {
    const owner = realtimeContext(MEMBER_A)
    const other = realtimeContext(MEMBER_B)
    await assertSucceeds(setRealtimeValue(realtimeRef(owner, `world/players/${MEMBER_A}/position`), validPosition()))
    await assertSucceeds(setRealtimeValue(realtimeRef(owner, `world/players/${MEMBER_A}/position`), validPosition('home')))
    await assertSucceeds(setRealtimeValue(realtimeRef(other, `world/players/${MEMBER_B}/position`), validPosition()))
    await Promise.all([
      assertFails(setRealtimeValue(realtimeRef(owner, `world/players/${MEMBER_B}/position`), validPosition())),
      assertFails(setRealtimeValue(realtimeRef(owner, `members/${MEMBER_B}`), true)),
      assertFails(setRealtimeValue(realtimeRef(owner, `world/players/${MEMBER_A}/position`), { ...validPosition(), x: 1537 })),
      assertFails(setRealtimeValue(realtimeRef(owner, `world/players/${MEMBER_A}/position`), validPosition('attic'))),
      assertFails(setRealtimeValue(realtimeRef(owner, `world/players/${MEMBER_A}/position`), { ...validPosition(), extra: true })),
    ])
    await assertSucceeds(getRealtimeValue(realtimeRef(other, 'world/players')))
    await assertFails(getRealtimeValue(realtimeRef(testEnv.unauthenticatedContext().database(), 'world/players')))
  })

  it('shares validated appearance while keeping appearance writes owner-only', async () => {
    const owner = realtimeContext(MEMBER_A)
    const other = realtimeContext(MEMBER_B)
    const appearance = { hair: 'long', outfit: 'cardigan', accessory: 'sage-accent' }
    await assertSucceeds(setRealtimeValue(realtimeRef(owner, `world/players/${MEMBER_A}/appearance`), appearance))
    await assertSucceeds(getRealtimeValue(realtimeRef(other, `world/players/${MEMBER_A}/appearance`)))
    await Promise.all([
      assertFails(setRealtimeValue(realtimeRef(other, `world/players/${MEMBER_A}/appearance`), appearance)),
      assertFails(setRealtimeValue(realtimeRef(owner, `world/players/${MEMBER_A}/appearance`), { ...appearance, hair: 'unknown' })),
      assertFails(setRealtimeValue(realtimeRef(owner, `world/players/${MEMBER_A}/appearance`), { ...appearance, extra: true })),
      assertFails(setRealtimeValue(realtimeRef(owner, `world/players/${MEMBER_A}/appearance`), null)),
    ])
  })

  it('allows fresh cooldown-limited emotes from the owner and rejects invalid or stale events', async () => {
    const owner = realtimeContext(MEMBER_A)
    const other = realtimeContext(MEMBER_B)
    const path = `world/players/${MEMBER_A}/emote`
    await assertSucceeds(setRealtimeValue(realtimeRef(owner, path), { kind: 'heart', sentAt: realtimeServerTimestamp() }))
    await assertSucceeds(getRealtimeValue(realtimeRef(other, path)))
    const sentAt = (await getRealtimeValue(realtimeRef(owner, path))).val().sentAt
    await Promise.all([
      assertFails(setRealtimeValue(realtimeRef(owner, path), { kind: 'wave', sentAt })),
      assertFails(setRealtimeValue(realtimeRef(other, `world/players/${MEMBER_A}/emote`), { kind: 'wave', sentAt: realtimeServerTimestamp() })),
      assertFails(setRealtimeValue(realtimeRef(owner, path), { kind: 'private text', sentAt: realtimeServerTimestamp() })),
      assertFails(setRealtimeValue(realtimeRef(owner, path), { kind: 'wave', sentAt: Date.now() - 60_000 })),
      assertFails(setRealtimeValue(realtimeRef(owner, path), { kind: 'wave', sentAt: realtimeServerTimestamp(), extra: true })),
      assertFails(setRealtimeValue(realtimeRef(owner, path), null)),
    ])
  })
})

// ─── Gallery rules ────────────────────────────────────────────────────────────

const photoMeta = (authorUid = MEMBER_A, caption = 'A test photo', patch = {}) => ({
  authorUid,
  caption,
  takenOn: null,
  createdAt: serverTimestamp(),
  width: 240,
  height: 180,
  thumb: 'dGVzdA==', // 8-char base64
  mime: 'image/jpeg',
  schemaVersion: 1,
  ...patch,
})

const photoFull = (patch = {}) => ({
  image: 'dGVzdA==',
  width: 1024,
  height: 768,
  ...patch,
})

const photoPath = 'gallery/shared/photos'

async function createPhotoAtomic(db, photoId) {
  const batch = writeBatch(db)
  batch.set(doc(db, photoPath, photoId), photoMeta())
  batch.set(doc(db, photoPath, photoId, 'full', 'main'), photoFull())
  return batch.commit()
}

describe('Firestore security rules: gallery', () => {
  it('allows an active member to create a photo atomically', async () => {
    const db = memberContext(MEMBER_A)
    await assertSucceeds(createPhotoAtomic(db, 'gallery-create-ok'))
  })

  it('denies creating the parent without the full doc in the same batch', async () => {
    const db = memberContext(MEMBER_A)
    await assertFails(setDoc(doc(db, photoPath, 'gallery-orphan-parent'), photoMeta()))
  })

  it('denies creating the full doc without the parent in the same batch', async () => {
    const db = memberContext(MEMBER_A)
    await assertFails(setDoc(doc(db, photoPath, 'gallery-orphan-full', 'full', 'main'), photoFull()))
  })

  it('denies a non-member from reading or writing photos', async () => {
    const unauth = unauthenticatedContext()
    await Promise.all([
      assertFails(getDoc(doc(unauth, photoPath, 'gallery-create-ok'))),
      assertFails(setDoc(doc(unauth, photoPath, 'gallery-unauth'), photoMeta())),
    ])
  })

  it('allows both active members to read photos', async () => {
    const dbA = memberContext(MEMBER_A)
    const dbB = memberContext(MEMBER_B)
    await assertSucceeds(createPhotoAtomic(dbA, 'gallery-cross-read'))
    await assertSucceeds(getDoc(doc(dbB, photoPath, 'gallery-cross-read')))
    await assertSucceeds(getDoc(doc(dbB, photoPath, 'gallery-cross-read', 'full', 'main')))
  })

  it('allows the creator to update the caption only', async () => {
    const db = memberContext(MEMBER_A)
    await assertSucceeds(createPhotoAtomic(db, 'gallery-edit-caption'))
    await assertSucceeds(updateDoc(doc(db, photoPath, 'gallery-edit-caption'), {
      caption: 'Updated caption',
      updatedAt: serverTimestamp(),
    }))
  })

  it('denies cross-user caption edit', async () => {
    const dbA = memberContext(MEMBER_A)
    const dbB = memberContext(MEMBER_B)
    await assertSucceeds(createPhotoAtomic(dbA, 'gallery-cross-edit'))
    await assertFails(updateDoc(doc(dbB, photoPath, 'gallery-cross-edit'), {
      caption: 'Hijacked',
      updatedAt: serverTimestamp(),
    }))
  })

  it('denies extra-field update', async () => {
    const db = memberContext(MEMBER_A)
    await assertSucceeds(createPhotoAtomic(db, 'gallery-extra-field'))
    await assertFails(updateDoc(doc(db, photoPath, 'gallery-extra-field'), {
      caption: 'ok',
      updatedAt: serverTimestamp(),
      extra: true,
    }))
  })

  it('allows the creator to delete both docs atomically', async () => {
    const db = memberContext(MEMBER_A)
    await assertSucceeds(createPhotoAtomic(db, 'gallery-delete-ok'))
    const batch = writeBatch(db)
    batch.delete(doc(db, photoPath, 'gallery-delete-ok'))
    batch.delete(doc(db, photoPath, 'gallery-delete-ok', 'full', 'main'))
    await assertSucceeds(batch.commit())
  })

  it('denies deleting the parent without also deleting the full doc', async () => {
    const db = memberContext(MEMBER_A)
    await assertSucceeds(createPhotoAtomic(db, 'gallery-delete-orphan'))
    await assertFails(deleteDoc(doc(db, photoPath, 'gallery-delete-orphan')))
  })

  it('denies cross-user delete', async () => {
    const dbA = memberContext(MEMBER_A)
    const dbB = memberContext(MEMBER_B)
    await assertSucceeds(createPhotoAtomic(dbA, 'gallery-cross-delete'))
    const batch = writeBatch(dbB)
    batch.delete(doc(dbB, photoPath, 'gallery-cross-delete'))
    batch.delete(doc(dbB, photoPath, 'gallery-cross-delete', 'full', 'main'))
    await assertFails(batch.commit())
  })

  it('denies a photo with oversize thumb', async () => {
    const db = memberContext(MEMBER_A)
    const bigThumb = 'A'.repeat(24001)
    const batch = writeBatch(db)
    batch.set(doc(db, photoPath, 'gallery-oversize-thumb'), photoMeta(MEMBER_A, 'caption', { thumb: bigThumb }))
    batch.set(doc(db, photoPath, 'gallery-oversize-thumb', 'full', 'main'), photoFull())
    await assertFails(batch.commit())
  })

  it('denies a photo with oversize full image', async () => {
    const db = memberContext(MEMBER_A)
    const bigImage = 'A'.repeat(400001)
    const batch = writeBatch(db)
    batch.set(doc(db, photoPath, 'gallery-oversize-full'), photoMeta())
    batch.set(doc(db, photoPath, 'gallery-oversize-full', 'full', 'main'), photoFull({ image: bigImage }))
    await assertFails(batch.commit())
  })

  it('denies a photo with wrong mime type', async () => {
    const db = memberContext(MEMBER_A)
    const batch = writeBatch(db)
    batch.set(doc(db, photoPath, 'gallery-bad-mime'), photoMeta(MEMBER_A, 'caption', { mime: 'image/png' }))
    batch.set(doc(db, photoPath, 'gallery-bad-mime', 'full', 'main'), photoFull())
    await assertFails(batch.commit())
  })

  it('denies a photo with extra fields in the meta', async () => {
    const db = memberContext(MEMBER_A)
    const batch = writeBatch(db)
    batch.set(doc(db, photoPath, 'gallery-extra-meta'), photoMeta(MEMBER_A, 'caption', { surprise: true }))
    batch.set(doc(db, photoPath, 'gallery-extra-meta', 'full', 'main'), photoFull())
    await assertFails(batch.commit())
  })
})

describe('player looks security rules', () => {
  const lookPath = 'playerLooks'
  const validLook = (patch = {}) => ({
    skin: 0,
    hairStyle: 0,
    hairColor: 0,
    eyes: 0,
    top: 0,
    topColor: 0,
    bottom: 0,
    bottomColor: 0,
    shoes: 0,
    shoesColor: 0,
    hat: 0,
    accessory: 0,
    ...patch,
  })

  it('allows active member to get their own look and the other member look', async () => {
    const dbA = memberContext(MEMBER_A)
    const dbB = memberContext(MEMBER_B)
    await assertSucceeds(getDoc(doc(dbA, lookPath, MEMBER_A)))
    await assertSucceeds(getDoc(doc(dbA, lookPath, MEMBER_B)))
    await assertSucceeds(getDoc(doc(dbB, lookPath, MEMBER_A)))
  })

  it('allows owner write with valid fields', async () => {
    const db = memberContext(MEMBER_A)
    await assertSucceeds(setDoc(doc(db, lookPath, MEMBER_A), validLook({ updatedAt: serverTimestamp() })))
  })

  it('denies cross-user write to playerLooks', async () => {
    const dbB = memberContext(MEMBER_B)
    await assertFails(setDoc(doc(dbB, lookPath, MEMBER_A), validLook()))
  })

  it('denies out-of-range fields', async () => {
    const db = memberContext(MEMBER_A)
    await assertFails(setDoc(doc(db, lookPath, MEMBER_A), validLook({ skin: 99 })))
    await assertFails(setDoc(doc(db, lookPath, MEMBER_A), validLook({ hairStyle: -1 })))
    await assertFails(setDoc(doc(db, lookPath, MEMBER_A), validLook({ hairColor: 25 })))
  })

  it('denies extra fields', async () => {
    const db = memberContext(MEMBER_A)
    await assertFails(setDoc(doc(db, lookPath, MEMBER_A), validLook({ wings: true })))
  })

  it('denies delete to playerLooks', async () => {
    const db = memberContext(MEMBER_A)
    await assertFails(deleteDoc(doc(db, lookPath, MEMBER_A)))
  })
})

// ─── Pet companion rules (world/pets) ─────────────────────────────────────────
//
// Document: world/pets
// Shape: { [uid]: { kind: 'none'|'cat'|'fox', name: string (0-32 chars), updatedAt: timestamp } }
// Rules:
//   - Both active members can read.
//   - Each member can create/update only their own UID key.
//   - name must be <= 32 chars; kind must be in the allowed enum.
//   - Extra fields inside the per-user record are denied.
//   - Cross-user writes (touching another member's key) are denied.
//   - Unauthenticated and inactive members are denied.

const petPath = 'world/pets'

/** Build a valid per-uid record with fixed (non-server) timestamps for admin seeding. */
const petSeedRecord = (uid, kind = 'cat', name = 'Mochi') => ({
  [uid]: { kind, name, updatedAt: fixedDate },
})

/** Build a record using serverTimestamp for writes under rules. */
const petWriteRecord = (uid, kind = 'cat', name = 'Mochi') => ({
  [uid]: { kind, name, updatedAt: serverTimestamp() },
})

describe('Firestore security rules: pet companion (world/pets)', () => {
  it('allows both active members to read the pets document', async () => {
    const dbA = memberContext(MEMBER_A)
    const dbB = memberContext(MEMBER_B)
    await testEnv.withSecurityRulesDisabled(async ctx => {
      await setDoc(doc(ctx.firestore(), petPath), petSeedRecord(MEMBER_A))
    })
    await assertSucceeds(getDoc(doc(dbA, petPath)))
    await assertSucceeds(getDoc(doc(dbB, petPath)))
  })

  it('denies an unauthenticated read of the pets document', async () => {
    const unauth = unauthenticatedContext()
    await assertFails(getDoc(doc(unauth, petPath)))
  })

  it('allows member A to write their own key (create)', async () => {
    // Seed with only B's key so A's key is absent — write is a "create" of the A key.
    await testEnv.withSecurityRulesDisabled(async ctx => {
      await setDoc(doc(ctx.firestore(), petPath), petSeedRecord(MEMBER_B))
    })
    const db = memberContext(MEMBER_A)
    await assertSucceeds(setDoc(doc(db, petPath), {
      ...petSeedRecord(MEMBER_B),   // keeps B's existing value unchanged in the diff
      ...petWriteRecord(MEMBER_A),
    }))
  })

  it('allows member A to update their own key when document exists', async () => {
    await testEnv.withSecurityRulesDisabled(async ctx => {
      await setDoc(doc(ctx.firestore(), petPath), {
        ...petSeedRecord(MEMBER_A),
        ...petSeedRecord(MEMBER_B, 'fox', 'Rustle'),
      })
    })
    const dbA = memberContext(MEMBER_A)
    await assertSucceeds(
      updateDoc(doc(dbA, petPath), petWriteRecord(MEMBER_A, 'fox', 'Amber')),
    )
  })

  it('denies member B writing to member A\'s key', async () => {
    await testEnv.withSecurityRulesDisabled(async ctx => {
      await setDoc(doc(ctx.firestore(), petPath), petSeedRecord(MEMBER_A))
    })
    const dbB = memberContext(MEMBER_B)
    await assertFails(
      updateDoc(doc(dbB, petPath), {
        [MEMBER_A]: { kind: 'cat', name: 'Hijack', updatedAt: serverTimestamp() },
      }),
    )
  })

  it('denies writing an unknown pet kind', async () => {
    await testEnv.withSecurityRulesDisabled(async ctx => {
      await setDoc(doc(ctx.firestore(), petPath), petSeedRecord(MEMBER_B))
    })
    const db = memberContext(MEMBER_A)
    await assertFails(
      setDoc(doc(db, petPath), {
        ...petSeedRecord(MEMBER_B),
        [MEMBER_A]: { kind: 'dragon', name: 'Blaze', updatedAt: serverTimestamp() },
      }),
    )
  })

  it('denies a name longer than 32 characters', async () => {
    await testEnv.withSecurityRulesDisabled(async ctx => {
      await setDoc(doc(ctx.firestore(), petPath), petSeedRecord(MEMBER_B))
    })
    const db = memberContext(MEMBER_A)
    const longName = 'A'.repeat(33)
    await assertFails(
      setDoc(doc(db, petPath), {
        ...petSeedRecord(MEMBER_B),
        [MEMBER_A]: { kind: 'cat', name: longName, updatedAt: serverTimestamp() },
      }),
    )
  })

  it('allows a name of exactly 32 characters', async () => {
    await testEnv.withSecurityRulesDisabled(async ctx => {
      await setDoc(doc(ctx.firestore(), petPath), petSeedRecord(MEMBER_B))
    })
    const db = memberContext(MEMBER_A)
    const exactName = 'B'.repeat(32)
    await assertSucceeds(
      setDoc(doc(db, petPath), {
        ...petSeedRecord(MEMBER_B),
        [MEMBER_A]: { kind: 'cat', name: exactName, updatedAt: serverTimestamp() },
      }),
    )
  })

  it('allows an empty name (kind none)', async () => {
    await testEnv.withSecurityRulesDisabled(async ctx => {
      await setDoc(doc(ctx.firestore(), petPath), petSeedRecord(MEMBER_B))
    })
    const db = memberContext(MEMBER_A)
    await assertSucceeds(
      setDoc(doc(db, petPath), {
        ...petSeedRecord(MEMBER_B),
        [MEMBER_A]: { kind: 'none', name: '', updatedAt: serverTimestamp() },
      }),
    )
  })

  it('denies extra fields inside the pet record', async () => {
    await testEnv.withSecurityRulesDisabled(async ctx => {
      await setDoc(doc(ctx.firestore(), petPath), petSeedRecord(MEMBER_B))
    })
    const db = memberContext(MEMBER_A)
    await assertFails(
      setDoc(doc(db, petPath), {
        ...petSeedRecord(MEMBER_B),
        [MEMBER_A]: { kind: 'cat', name: 'Mochi', updatedAt: serverTimestamp(), extra: true },
      }),
    )
  })

  it('denies a write that touches a second key beyond the caller\'s own', async () => {
    await testEnv.withSecurityRulesDisabled(async ctx => {
      await setDoc(doc(ctx.firestore(), petPath), {
        ...petSeedRecord(MEMBER_A),
        ...petSeedRecord(MEMBER_B, 'fox', 'Rustle'),
      })
    })
    const dbA = memberContext(MEMBER_A)
    // A tries to update their own key AND B's key in a single write.
    await assertFails(
      updateDoc(doc(dbA, petPath), {
        [MEMBER_A]: { kind: 'fox', name: 'Amber', updatedAt: serverTimestamp() },
        [MEMBER_B]: { kind: 'none', name: '', updatedAt: serverTimestamp() },
      }),
    )
  })

  it('denies an inactive member from writing', async () => {
    await testEnv.withSecurityRulesDisabled(async ctx => {
      await setDoc(doc(ctx.firestore(), petPath), petSeedRecord(MEMBER_A))
    })
    const db = memberContext(INACTIVE_MEMBER)
    await assertFails(
      setDoc(doc(db, petPath), {
        ...petSeedRecord(MEMBER_A),
        [INACTIVE_MEMBER]: { kind: 'cat', name: 'Shadow', updatedAt: serverTimestamp() },
      }),
    )
  })

  it('denies delete of the pets document', async () => {
    const db = memberContext(MEMBER_A)
    await assertFails(deleteDoc(doc(db, petPath)))
  })
})

  it('allows both active members to read the pets document', async () => {
    const dbA = memberContext(MEMBER_A)
    const dbB = memberContext(MEMBER_B)
    // Pre-seed with rules disabled so a document exists.
    await testEnv.withSecurityRulesDisabled(async ctx => {
      await setDoc(doc(ctx.firestore(), petPath), petRecord(MEMBER_A))
    })
    await assertSucceeds(getDoc(doc(dbA, petPath)))
    await assertSucceeds(getDoc(doc(dbB, petPath)))
  })

  it('denies an unauthenticated read of the pets document', async () => {
    const unauth = unauthenticatedContext()
    await assertFails(getDoc(doc(unauth, petPath)))
  })

  it('allows member A to create the document with their own key', async () => {
    const db = memberContext(MEMBER_A)
    // Use a unique path suffix to avoid interference from other tests.
    // (The rule is for world/pets — we rely on withSecurityRulesDisabled to clean state.)
    await testEnv.withSecurityRulesDisabled(async ctx => {
      await ctx.firestore().recursiveDelete(doc(ctx.firestore(), petPath))
    })
    await assertSucceeds(setDoc(doc(db, petPath), petRecord(MEMBER_A)))
  })

  it('allows member A to update (merge) their own key when document exists', async () => {
    const dbA = memberContext(MEMBER_A)
    // Seed with both members' keys disabled.
    await testEnv.withSecurityRulesDisabled(async ctx => {
      await setDoc(doc(ctx.firestore(), petPath), {
        ...petRecord(MEMBER_A),
        ...petRecord(MEMBER_B, 'fox', 'Rustle'),
      })
    })
    // A updates only their own key.
    await assertSucceeds(
      updateDoc(doc(dbA, petPath), { [MEMBER_A]: { kind: 'fox', name: 'Amber', updatedAt: serverTimestamp() } }),
    )
  })

  it('denies member B writing to member A\'s key', async () => {
    const dbB = memberContext(MEMBER_B)
    // Seed with A's key already present.
    await testEnv.withSecurityRulesDisabled(async ctx => {
      await setDoc(doc(ctx.firestore(), petPath), petRecord(MEMBER_A))
    })
    await assertFails(
      updateDoc(doc(dbB, petPath), {
        [MEMBER_A]: { kind: 'cat', name: 'Hijack', updatedAt: serverTimestamp() },
      }),
    )
  })

  it('denies writing an unknown pet kind', async () => {
    const db = memberContext(MEMBER_A)
    await testEnv.withSecurityRulesDisabled(async ctx => {
      await ctx.firestore().recursiveDelete(doc(ctx.firestore(), petPath))
    })
    await assertFails(
      setDoc(doc(db, petPath), {
        [MEMBER_A]: { kind: 'dragon', name: 'Blaze', updatedAt: serverTimestamp() },
      }),
    )
  })

  it('denies a name longer than 32 characters', async () => {
    const db = memberContext(MEMBER_A)
    await testEnv.withSecurityRulesDisabled(async ctx => {
      await ctx.firestore().recursiveDelete(doc(ctx.firestore(), petPath))
    })
    const longName = 'A'.repeat(33)
    await assertFails(
      setDoc(doc(db, petPath), {
        [MEMBER_A]: { kind: 'cat', name: longName, updatedAt: serverTimestamp() },
      }),
    )
  })

  it('allows a name of exactly 32 characters', async () => {
    const db = memberContext(MEMBER_A)
    await testEnv.withSecurityRulesDisabled(async ctx => {
      await ctx.firestore().recursiveDelete(doc(ctx.firestore(), petPath))
    })
    const exactName = 'B'.repeat(32)
    await assertSucceeds(
      setDoc(doc(db, petPath), {
        [MEMBER_A]: { kind: 'cat', name: exactName, updatedAt: serverTimestamp() },
      }),
    )
  })

  it('allows an empty name', async () => {
    const db = memberContext(MEMBER_A)
    await testEnv.withSecurityRulesDisabled(async ctx => {
      await ctx.firestore().recursiveDelete(doc(ctx.firestore(), petPath))
    })
    await assertSucceeds(
      setDoc(doc(db, petPath), {
        [MEMBER_A]: { kind: 'none', name: '', updatedAt: serverTimestamp() },
      }),
    )
  })

  it('denies extra fields inside the pet record', async () => {
    const db = memberContext(MEMBER_A)
    await testEnv.withSecurityRulesDisabled(async ctx => {
      await ctx.firestore().recursiveDelete(doc(ctx.firestore(), petPath))
    })
    await assertFails(
      setDoc(doc(db, petPath), {
        [MEMBER_A]: { kind: 'cat', name: 'Mochi', updatedAt: serverTimestamp(), extra: true },
      }),
    )
  })

  it('denies a write that touches a second key beyond the caller\'s own', async () => {
    const dbA = memberContext(MEMBER_A)
    // Seed so both keys exist.
    await testEnv.withSecurityRulesDisabled(async ctx => {
      await setDoc(doc(ctx.firestore(), petPath), {
        ...petRecord(MEMBER_A),
        ...petRecord(MEMBER_B, 'fox', 'Rustle'),
      })
    })
    // A tries to update their key AND member B's key in one write.
    await assertFails(
      updateDoc(doc(dbA, petPath), {
        [MEMBER_A]: { kind: 'fox', name: 'Amber', updatedAt: serverTimestamp() },
        [MEMBER_B]: { kind: 'none', name: '', updatedAt: serverTimestamp() },
      }),
    )
  })

  it('denies an inactive member from writing', async () => {
    const db = memberContext(INACTIVE_MEMBER)
    await assertFails(
      setDoc(doc(db, petPath), {
        [INACTIVE_MEMBER]: { kind: 'cat', name: 'Shadow', updatedAt: serverTimestamp() },
      }),
    )
  })

  it('denies delete of the pets document', async () => {
    const db = memberContext(MEMBER_A)
    await assertFails(deleteDoc(doc(db, petPath)))
  })
})

