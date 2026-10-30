import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { StartupProgressMonitor, retryMembershipRead } from '../src/lib/startupProgress.ts'
import { getBootTrace, recordBootStep } from '../src/lib/logger.ts'

describe('startup progress and membership retry', () => {
  it('keeps a 12-second membership read alive and becomes ready when it succeeds', async t => {
    t.mock.timers.enable({ apis: ['setTimeout', 'Date'] })
    const monitor = new StartupProgressMonitor()
    monitor.begin('membership')
    const read = new Promise(resolve => setTimeout(() => resolve({ allowed: true }), 12_000))
    const membership = retryMembershipRead(
      () => read,
      () => monitor.observe({ step: 'membership', status: 'started' }),
      () => monitor.observe({ step: 'membership', status: 'failed' }),
    )

    await t.mock.timers.tick(12_000)
    assert.deepEqual(await membership, { allowed: true })
    monitor.observe({ step: 'membership', status: 'done' })
    monitor.ready()
    assert.equal(monitor.getSnapshot().status, 'ready')
    assert.notEqual(monitor.getSnapshot().status, 'failed')
    monitor.dispose()
    t.mock.timers.reset()
  })

  it('retries two transient membership failures and succeeds on the third read', async t => {
    t.mock.timers.enable({ apis: ['setTimeout', 'Date'] })
    let calls = 0
    const failedCodes = []
    const membership = retryMembershipRead(
      async () => {
        calls += 1
        if (calls < 3) throw Object.assign(new Error('temporary network issue'), { code: 'unavailable' })
        return { allowed: true }
      },
      () => {},
      error => failedCodes.push(error.code),
    )

    await Promise.resolve()
    await t.mock.timers.tick(1_000)
    await Promise.resolve()
    await Promise.resolve()
    await t.mock.timers.tick(3_000)
    assert.deepEqual(await membership, { allowed: true })
    assert.equal(calls, 3)
    assert.deepEqual(failedCodes, ['unavailable', 'unavailable'])
    t.mock.timers.reset()
  })

  it('shows the stuck step after 30 seconds with no progress', t => {
    t.mock.timers.enable({ apis: ['setTimeout', 'Date'] })
    const monitor = new StartupProgressMonitor()
    monitor.begin('roster')
    t.mock.timers.tick(30_000)

    assert.deepEqual(monitor.getSnapshot(), {
      status: 'failed',
      step: 'roster',
      message: 'Still waiting for roster to finish.',
    })
    monitor.dispose()
    t.mock.timers.reset()
  })

  it('names the active child step when an earlier step finishes', t => {
    t.mock.timers.enable({ apis: ['setTimeout', 'Date'] })
    const monitor = new StartupProgressMonitor()
    monitor.begin('roster')
    monitor.observe({ step: 'profile', status: 'started' })
    monitor.observe({ step: 'roster', status: 'done' })
    t.mock.timers.tick(30_000)

    assert.equal(monitor.getSnapshot().status, 'failed')
    assert.equal(monitor.getSnapshot().step, 'profile')
    assert.equal(monitor.getSnapshot().message, 'Still waiting for profile to finish.')
    monitor.dispose()
    t.mock.timers.reset()
  })

  it('clears a shown failure when the late ready signal arrives', t => {
    t.mock.timers.enable({ apis: ['setTimeout', 'Date'] })
    const monitor = new StartupProgressMonitor()
    monitor.begin('sceneCreate')
    t.mock.timers.tick(30_000)
    assert.equal(monitor.getSnapshot().status, 'failed')

    monitor.observe({ step: 'sceneCreate', status: 'done' })
    monitor.ready()
    assert.equal(monitor.getSnapshot().status, 'ready')
    assert.equal(monitor.getSnapshot().message, undefined)
    monitor.dispose()
    t.mock.timers.reset()
  })

  it('records step duration and safe membership error details', t => {
    t.mock.timers.enable({ apis: ['setTimeout', 'Date'] })
    recordBootStep('membership', 'started')
    t.mock.timers.tick(1_250)
    recordBootStep('membership', 'failed', {
      code: 'unavailable',
      userMessage: 'Retry person@example.test with Bearer abc.def.ghi and UID abcdefghijklmnopqrstuvwxyz012345',
      retryable: true,
    })
    const event = getBootTrace().at(-1)

    assert.equal(event.durationMs, 1_250)
    assert.equal(event.errorCode, 'unavailable')
    assert.equal(event.errorMessage.includes('person@example.test'), false)
    assert.equal(event.errorMessage.includes('abcdefghijklmnopqrstuvwxyz012345'), false)
    assert.match(event.errorMessage, /redacted/)
    t.mock.timers.reset()
  })
})
