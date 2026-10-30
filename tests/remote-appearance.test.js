import assert from 'node:assert/strict'
import test from 'node:test'
import { MANNU_DEFAULT_LOOK, TALHA_DEFAULT_LOOK } from '../src/features/world/appearanceCatalog.ts'
import { keepNewestRemoteAppearance, normalizeRemotePlayerLook } from '../src/features/world/remoteAppearance.ts'

test('normalizes every supported appearance field and revision', () => {
  const normalized = normalizeRemotePlayerLook({ ...TALHA_DEFAULT_LOOK, updatedAt: { seconds: 12, nanoseconds: 500_000_000 } })
  assert.deepEqual(normalized, { look: TALHA_DEFAULT_LOOK, revision: 12_500 })
})

test('rejects missing or invalid remote appearance safely', () => {
  assert.equal(normalizeRemotePlayerLook(null), null)
  assert.equal(normalizeRemotePlayerLook({ ...MANNU_DEFAULT_LOOK, shoes: 99 }), null)
})

test('newer appearance replaces older snapshots and delayed stale data is ignored', () => {
  const newer = { look: { ...TALHA_DEFAULT_LOOK, topColor: 7 }, revision: 20 }
  const older = { look: { ...TALHA_DEFAULT_LOOK, topColor: 1 }, revision: 10 }
  assert.deepEqual(keepNewestRemoteAppearance(null, older), older)
  assert.deepEqual(keepNewestRemoteAppearance(older, newer), newer)
  assert.deepEqual(keepNewestRemoteAppearance(newer, older), newer)
})

test('an unversioned delayed snapshot cannot overwrite a known newer look', () => {
  const known = { look: TALHA_DEFAULT_LOOK, revision: 20 }
  const delayed = { look: MANNU_DEFAULT_LOOK, revision: null }
  assert.deepEqual(keepNewestRemoteAppearance(known, delayed), known)
})

test('accepted remote look is the complete value supplied to the avatar update boundary', () => {
  let renderedLook = MANNU_DEFAULT_LOOK
  const applyRemoteLook = look => { renderedLook = look }
  const selected = { ...TALHA_DEFAULT_LOOK, skin: 5, hat: 3, shoesColor: 6 }
  const incoming = normalizeRemotePlayerLook({ ...selected, updatedAt: 21 })
  const newest = keepNewestRemoteAppearance(null, incoming)
  applyRemoteLook(newest.look)
  assert.deepEqual(renderedLook, selected)
})
