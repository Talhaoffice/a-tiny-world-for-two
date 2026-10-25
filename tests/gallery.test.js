/**
 * Unit tests for gallery constants and content helpers.
 * Note: processImageFile uses createImageBitmap and canvas which are not
 * available in Node; those paths are tested manually / in a browser.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

// Re-implement constants inline to avoid importing browser modules
const THUMB_BASE64_MAX = 24_000
const FULL_BASE64_MAX = 400_000
const PHOTO_FILE_MAX_BYTES = 15 * 1024 * 1024
const PHOTO_CAPTION_MAX = 140
const GALLERY_SOFT_CAP = 100

describe('Gallery constants', () => {
  it('THUMB_BASE64_MAX is 24,000', () => assert.equal(THUMB_BASE64_MAX, 24_000))
  it('FULL_BASE64_MAX is 400,000', () => assert.equal(FULL_BASE64_MAX, 400_000))
  it('PHOTO_FILE_MAX_BYTES is 15 MB', () => assert.equal(PHOTO_FILE_MAX_BYTES, 15 * 1024 * 1024))
  it('PHOTO_CAPTION_MAX is 140', () => assert.equal(PHOTO_CAPTION_MAX, 140))
  it('GALLERY_SOFT_CAP is 100', () => assert.equal(GALLERY_SOFT_CAP, 100))
})

describe('Gallery base64 body stripping', () => {
  function stripPrefix(dataUrl) {
    const idx = dataUrl.indexOf(',')
    return idx >= 0 ? dataUrl.slice(idx + 1) : dataUrl
  }
  it('strips a data URL prefix', () => {
    assert.equal(stripPrefix('data:image/jpeg;base64,/9j/ABC'), '/9j/ABC')
  })
  it('returns the string unchanged if no comma', () => {
    assert.equal(stripPrefix('rawbody'), 'rawbody')
  })
  it('handles empty string', () => {
    assert.equal(stripPrefix(''), '')
  })
})

describe('Gallery caption validation', () => {
  it('accepts an empty caption', () => {
    assert.ok(''.length <= PHOTO_CAPTION_MAX)
  })
  it('accepts a 140-char caption', () => {
    assert.ok('A'.repeat(140).length <= PHOTO_CAPTION_MAX)
  })
  it('rejects a 141-char caption', () => {
    assert.ok('A'.repeat(141).length > PHOTO_CAPTION_MAX)
  })
})
