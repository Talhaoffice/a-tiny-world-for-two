import { readFile } from 'node:fs/promises'
import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing'
import {
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
} from 'firebase/firestore'

const PROJECT_ID = 'demo-tiny-world-firestore-rules'
const HOST = '127.0.0.1'
const PORT = 8080
const MEMBER_A = 'test-member-a'
const MEMBER_B = 'test-member-b'
const INACTIVE_MEMBER = 'test-inactive-member'
const UNLISTED_USER = 'test-unlisted-user'
const notePath = 'homes/shared/notes'
const keepsakePath = 'homes/shared/keepsakes'
const flowerPath = 'gardens/shared/flowers'
const tutorialPath = 'playerTutorials'
const fixedDate = Timestamp.fromDate(new Date('2026-01-01T00:00:00.000Z'))

let testEnv

const memberContext = uid => testEnv.authenticatedContext(uid).firestore()
const unauthenticatedContext = () => testEnv.unauthenticatedContext().firestore()
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
const tutorialProgress = (welcomeReadAt = null, completedAt = null, tutorialVersion = 1) => ({
  tutorialVersion, welcomeReadAt, completedAt,
})

before(async () => {
  const rules = await readFile(new URL('../firestore.rules', import.meta.url), 'utf8')
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { host: HOST, port: PORT, rules },
  })

  await testEnv.withSecurityRulesDisabled(async context => {
    const db = context.firestore()
    await Promise.all([
      setDoc(doc(db, 'members', MEMBER_A), { active: true }),
      setDoc(doc(db, 'members', MEMBER_B), { active: true }),
      setDoc(doc(db, 'members', INACTIVE_MEMBER), { active: false }),
      setDoc(doc(db, notePath, 'fixture-note'), { authorUid: MEMBER_A, text: 'Fixture note', createdAt: fixedDate }),
      setDoc(doc(db, keepsakePath, 'fixture-keepsake'), { authorUid: MEMBER_B, title: 'Fixture keepsake', description: 'Fixture only', createdAt: fixedDate }),
      setDoc(doc(db, flowerPath, 'fixture-flower'), { authorUid: MEMBER_A, title: 'Fixture flower', memory: 'Fixture only', flowerType: 'rose', createdAt: fixedDate }),
      setDoc(doc(db, 'letters', 'a-to-b'), { senderUid: MEMBER_A, recipientUid: MEMBER_B, text: 'Fixture letter A to B', createdAt: fixedDate, opened: false, openedAt: null }),
      setDoc(doc(db, 'letters', 'b-to-a'), { senderUid: MEMBER_B, recipientUid: MEMBER_A, text: 'Fixture letter B to A', createdAt: fixedDate, opened: false, openedAt: null }),
      setDoc(doc(db, 'letters', 'a-to-b-sender-denied'), { senderUid: MEMBER_A, recipientUid: MEMBER_B, text: 'Unopened sender test', createdAt: fixedDate, opened: false, openedAt: null }),
      setDoc(doc(db, 'letters', 'a-to-b-immutable'), { senderUid: MEMBER_A, recipientUid: MEMBER_B, text: 'Immutable test fixture', createdAt: fixedDate, opened: false, openedAt: null }),
      setDoc(doc(db, tutorialPath, MEMBER_A), tutorialProgress(fixedDate)),
    ])
  })
})

after(async () => {
  if (testEnv) {
    await testEnv.clearFirestore()
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
      assertFails(getDoc(doc(db, 'members', MEMBER_A))),
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

  it('allows another active member to query newly created notes and keepsakes', async () => {
    const writer = memberContext(MEMBER_A)
    await Promise.all([
      setDoc(doc(writer, notePath, 'cross-member-note'), note()),
      setDoc(doc(writer, keepsakePath, 'cross-member-keepsake'), keepsake()),
    ])

    const reader = memberContext(MEMBER_B)
    const [notes, keepsakes] = await Promise.all([
      assertSucceeds(getDocs(query(collection(reader, notePath), orderBy('createdAt', 'desc'), limit(50)))),
      assertSucceeds(getDocs(query(collection(reader, keepsakePath), orderBy('createdAt', 'desc'), limit(50)))),
    ])
    assert.equal(notes.docs.some(document => document.id === 'cross-member-note'), true)
    assert.equal(keepsakes.docs.some(document => document.id === 'cross-member-keepsake'), true)
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
      setDoc(doc(db, flowerPath, 'flower-wrong-author'), flower(MEMBER_B)),
    ]
    await Promise.all(invalidWrites.map(write => assertFails(write)))
  })

  it('rejects updates and deletes of shared content', async () => {
    const db = memberContext(MEMBER_A)
    await Promise.all([
      assertFails(updateDoc(doc(db, notePath, 'fixture-note'), { text: 'changed' })),
      assertFails(deleteDoc(doc(db, keepsakePath, 'fixture-keepsake'))),
      assertFails(deleteDoc(doc(db, flowerPath, 'fixture-flower'))),
    ])
  })
})

describe('Firestore security rules: letters', () => {
  it('allows a sender to create a valid letter addressed to another active member', async () => {
    await assertSucceeds(setDoc(doc(memberContext(MEMBER_A), 'letters', 'valid-a-to-b'), letter()))
  })

  it('rejects invalid letters, sender impersonation, and oversized text', async () => {
    const db = memberContext(MEMBER_A)
    await Promise.all([
      assertFails(setDoc(doc(db, 'letters', 'letter-missing-field'), { senderUid: MEMBER_A, recipientUid: MEMBER_B, text: 'Incomplete' })),
      assertFails(setDoc(doc(db, 'letters', 'letter-too-long'), letter(MEMBER_A, MEMBER_B, 'x'.repeat(2001)))),
      assertFails(setDoc(doc(db, 'letters', 'letter-wrong-sender'), letter(MEMBER_B, MEMBER_A))),
      assertFails(setDoc(doc(db, 'letters', 'letter-self-addressed'), letter(MEMBER_A, MEMBER_A))),
      assertFails(setDoc(doc(db, 'letters', 'letter-recipient-inactive'), letter(MEMBER_A, INACTIVE_MEMBER))),
      assertFails(setDoc(doc(db, 'letters', 'letter-recipient-unlisted'), letter(MEMBER_A, UNLISTED_USER))),
      assertFails(setDoc(doc(db, 'letters', 'letter-extra-field'), { ...letter(), extra: 'not allowed' })),
    ])
  })

  it('allows sender and recipient to read letters addressed either way', async () => {
    await Promise.all([
      assertSucceeds(getDoc(doc(memberContext(MEMBER_A), 'letters', 'a-to-b'))),
      assertSucceeds(getDoc(doc(memberContext(MEMBER_B), 'letters', 'a-to-b'))),
      assertSucceeds(getDoc(doc(memberContext(MEMBER_A), 'letters', 'b-to-a'))),
      assertSucceeds(getDoc(doc(memberContext(MEMBER_B), 'letters', 'b-to-a'))),
    ])
  })

  it('denies letter reads to an unauthorized third user', async () => {
    await assertFails(getDoc(doc(memberContext(UNLISTED_USER), 'letters', 'a-to-b')))
    await assertFails(getDoc(doc(memberContext(INACTIVE_MEMBER), 'letters', 'a-to-b')))
  })

  it('allows the recipient to mark an unopened letter as opened', async () => {
    await assertSucceeds(updateDoc(doc(memberContext(MEMBER_B), 'letters', 'a-to-b'), {
      opened: true,
      openedAt: serverTimestamp(),
    }))
  })

  it('denies the sender marking their letter as opened', async () => {
    await assertFails(updateDoc(doc(memberContext(MEMBER_A), 'letters', 'a-to-b-sender-denied'), {
      opened: true,
      openedAt: serverTimestamp(),
    }))
  })

  it('prevents recipients changing sender, recipient, or text while opening', async () => {
    const db = memberContext(MEMBER_B)
    await Promise.all([
      assertFails(updateDoc(doc(db, 'letters', 'a-to-b-immutable'), { opened: true, openedAt: serverTimestamp(), text: 'tampered' })),
      assertFails(updateDoc(doc(db, 'letters', 'a-to-b-immutable'), { opened: true, openedAt: serverTimestamp(), senderUid: MEMBER_B })),
      assertFails(updateDoc(doc(db, 'letters', 'a-to-b-immutable'), { opened: true, openedAt: serverTimestamp(), recipientUid: MEMBER_A })),
    ])
  })

  it('denies queries that attempt to read another user’s sent or received letters', async () => {
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
