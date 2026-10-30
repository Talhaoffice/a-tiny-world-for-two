import type { BootStep, BootStatus, BootTraceEvent } from './logger.ts'

export type StartupProgressState = {
  status: 'connecting' | 'failed' | 'ready'
  step: BootStep
  message?: string
}

type TimerApi = {
  now: () => number
  setTimeout: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>
  clearTimeout: (timer: ReturnType<typeof setTimeout>) => void
}

const RETRY_DELAYS_MS = [1_000, 3_000, 6_000]
const DEFAULT_TIMER_API: TimerApi = {
  now: () => Date.now(),
  setTimeout: (callback, delay) => setTimeout(callback, delay),
  clearTimeout: timer => clearTimeout(timer),
}

export class StartupProgressMonitor {
  private state: StartupProgressState = { status: 'connecting', step: 'auth' }
  private listeners = new Set<(state: StartupProgressState) => void>()
  private activeSteps = new Map<BootStep, number>()
  private lastProgressAt: number
  private inactivityTimer: ReturnType<typeof setTimeout> | null = null
  private readonly timeoutMs: number
  private readonly timerApi: TimerApi
  private failureRecoversOnProgress = false
  private timeoutHandler: ((step: BootStep) => void) | undefined

  constructor(
    timeoutMs = 30_000,
    timerApi: TimerApi = DEFAULT_TIMER_API,
  ) {
    this.timeoutMs = timeoutMs
    this.timerApi = timerApi
    this.lastProgressAt = this.timerApi.now()
  }

  getSnapshot = () => ({ ...this.state })

  subscribe = (listener: (state: StartupProgressState) => void) => {
    this.listeners.add(listener)
    listener(this.getSnapshot())
    return () => { this.listeners.delete(listener) }
  }

  begin(step: BootStep) {
    this.failureRecoversOnProgress = false
    this.activeSteps.clear()
    this.activeSteps.set(step, this.timerApi.now())
    this.setState({ status: 'connecting', step })
    this.touch(step)
  }

  observe(event: Pick<BootTraceEvent, 'step' | 'status'>) {
    if (this.state.status === 'ready') return
    if (this.state.status === 'failed' && !this.failureRecoversOnProgress) return
    // A late event is new evidence that startup is alive. Clear a prior timeout.
    this.failureRecoversOnProgress = false
    if (event.status === 'started') {
      this.activeSteps.delete(event.step)
      this.activeSteps.set(event.step, this.timerApi.now())
    } else {
      this.activeSteps.delete(event.step)
    }
    const activeStep = [...this.activeSteps.keys()].at(-1) ?? event.step
    this.setState({ status: 'connecting', step: activeStep })
    this.touch(activeStep)
  }

  fail(step: BootStep, message: string, recoverOnProgress = false) {
    this.clearTimeout()
    this.failureRecoversOnProgress = recoverOnProgress
    this.setState({ status: 'failed', step, message })
  }

  ready() {
    this.clearTimeout()
    this.failureRecoversOnProgress = false
    this.setState({ status: 'ready', step: this.state.step })
  }

  dispose() {
    this.clearTimeout()
    this.listeners.clear()
  }

  setTimeoutHandler(handler: (step: BootStep) => void) {
    this.timeoutHandler = handler
  }

  private touch(step: BootStep) {
    this.lastProgressAt = this.timerApi.now()
    this.scheduleTimeout()
    this.setState({ status: 'connecting', step })
  }

  private scheduleTimeout() {
    this.clearTimeout()
    this.inactivityTimer = this.timerApi.setTimeout(() => {
      const idleFor = this.timerApi.now() - this.lastProgressAt
      if (idleFor < this.timeoutMs) {
        this.scheduleTimeout()
        return
      }
      const stuckStep = this.state.step
      this.timeoutHandler?.(stuckStep)
      this.fail(stuckStep, `Still waiting for ${stuckStep} to finish.`, true)
    }, this.timeoutMs)
    ;(this.inactivityTimer as unknown as { unref?: () => void }).unref?.()
  }

  private clearTimeout() {
    if (this.inactivityTimer !== null) this.timerApi.clearTimeout(this.inactivityTimer)
    this.inactivityTimer = null
  }

  private setState(state: StartupProgressState) {
    this.state = state
    for (const listener of this.listeners) listener(this.getSnapshot())
  }
}

export const startupProgress = new StartupProgressMonitor()

export function setStartupTimeoutHandler(handler: (step: BootStep) => void) {
  startupProgress.setTimeoutHandler(handler)
}

export async function retryMembershipRead<T>(
  read: () => Promise<T>,
  onAttemptStart: (attempt: number) => void,
  onAttemptFailure: (error: unknown, attempt: number, willRetry: boolean) => void,
  wait: (delayMs: number) => Promise<void> = delay => new Promise(resolve => setTimeout(resolve, delay)),
  shouldContinue: () => boolean = () => true,
): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    if (!shouldContinue()) throw Object.assign(new Error('Membership check was cancelled.'), { code: 'cancelled' })
    onAttemptStart(attempt)
    try {
      return await read()
    } catch (error) {
      const willRetry = attempt <= RETRY_DELAYS_MS.length
      onAttemptFailure(error, attempt, willRetry)
      if (!willRetry) throw error
      await wait(RETRY_DELAYS_MS[attempt - 1])
    }
  }
}

export function membershipDenialMessage() {
  return 'This account is not on the island’s authorized-member list.'
}

export type StartupBootStatus = BootStatus
