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
import { get as getRealtimeValue, ref as realtimeRef, set as setRealtimeValue } from 'firebase/database'

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
    await assertSucceeds(setDoc(doc(memberContext(MEMBER_B), tutorialPath, MEMBER_B), tutorialProgress()))
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
    await assertSucceeds(setDoc(doc(owner, profilePath, 'new-profile'), validProfile()))
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

  it('validates appearance and allows introCompletedAt to be set once', async () => {
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
    await assertFails(updateDoc(profile, { introCompletedAt: serverTimestamp() }))
    await assertFails(updateDoc(profile, { introCompletedAt: deleteField() }))
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
})
