import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { toAppError } from '../src/lib/errors.ts'
import { clearRecentErrors, getRecentErrors, logError, redactLogValue } from '../src/lib/logger.ts'

describe('application error mapping', () => {
  it('maps Firebase codes without exposing the SDK message', () => {
    const mapped = toAppError({ code: 'firestore/permission-denied', message: 'private backend detail' })
    assert.equal(mapped.code, 'permission-denied')
    assert.match(mapped.userMessage, /account/)
    assert.doesNotMatch(mapped.userMessage, /private backend detail/)
  })

  it('normalizes Realtime Database permission codes that use underscores', () => {
    const mapped = toAppError({ code: 'database/PERMISSION_DENIED', message: 'Permission denied' })
    assert.equal(mapped.code, 'permission-denied')
    assert.match(mapped.userMessage, /account/)
  })

  it('keeps unknown errors generic so private content does not reach the UI', () => {
    const mapped = toAppError(new Error('private letter words'))
    assert.equal(mapped.code, 'unknown')
    assert.doesNotMatch(mapped.userMessage, /private letter words/)
  })

  it('treats network request failures as retryable connection errors', () => {
    const mapped = toAppError({ code: 'auth/network-request-failed', message: 'network detail' })
    assert.equal(mapped.code, 'unavailable')
    assert.equal(mapped.retryable, true)
  })
})

describe('redacted diagnostics logging', () => {
  it('masks fake email, token, and letter text values', () => {
    const masked = redactLogValue({
      email: 'person@example.test',
      token: 'Bearer abc.def.ghi',
      body: 'A private test letter',
      note: 'A private shared note',
      details: 'Contact person@example.test with Bearer abc.def.ghi',
    })
    assert.deepEqual(masked, {
      email: '[redacted]',
      token: '[redacted]',
      body: '[redacted]',
      note: '[redacted]',
      details: 'Contact [redacted email] with Bearer [redacted token]',
    })
  })

  it('retains only the most recent twenty sanitized error events', () => {
    clearRecentErrors()
    const originalError = console.error
    console.error = () => {}
    try {
      for (let index = 0; index < 24; index += 1) {
        logError({ code: 'unavailable', message: 'private letter words' }, `test/${index}`)
      }
    } finally {
      console.error = originalError
    }

    const errors = getRecentErrors()
    assert.equal(errors.length, 20)
    assert.equal(errors[0].namespace, 'test/4')
    assert.equal(errors.at(-1).namespace, 'test/23')
    assert.equal(errors[0].code, 'unavailable')
    assert.equal(JSON.stringify(errors).includes('private letter words'), false)
    clearRecentErrors()
  })
})
