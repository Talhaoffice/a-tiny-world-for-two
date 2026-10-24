import { toAppError } from './errors.ts'

export type SafeErrorEvent = { at: string; namespace: string; code: string }
export type LogLevel = 'info' | 'warn' | 'error'

const ERROR_LIMIT = 20
const PRIVATE_KEY = /(email|uid|token|password|secret|credential|letter|note|content|body|text|memory|description|title|payload|draft|message|api[_-]?key|authorization)/i
const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi
const BEARER = /\bBearer\s+[A-Z0-9._~+/-]+=*/gi
const JWT = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g

let recentErrors: SafeErrorEvent[] = []
const loggedErrorAt = new Map<string, number>()
const errorSubscribers = new Set<(events: SafeErrorEvent[]) => void>()

export function redactLogValue(value: unknown, key = '', seen = new WeakSet<object>()): unknown {
  if (PRIVATE_KEY.test(key)) return '[redacted]'
  if (typeof value === 'string') {
    return value.replace(EMAIL, '[redacted email]').replace(BEARER, 'Bearer [redacted token]').replace(JWT, '[redacted token]')
  }
  if (value === null || typeof value !== 'object') return value
  if (seen.has(value)) return '[circular]'
  seen.add(value)
  if (Array.isArray(value)) return value.map(item => redactLogValue(item, key, seen))
  return Object.fromEntries(Object.entries(value).map(([childKey, childValue]) => [
    childKey,
    redactLogValue(childValue, childKey, seen),
  ]))
}

function normalizedNamespace(namespace: string) {
  return namespace.replace(/[^a-z0-9/_-]/gi, '').slice(0, 48) || 'app'
}

export function logEvent(level: LogLevel, namespace: string, code = 'info', context?: unknown) {
  const safeNamespace = normalizedNamespace(namespace)
  const safeCode = /^[a-z0-9/_-]{1,48}$/i.test(code) ? code : 'unknown'
  const safeContext = context === undefined ? undefined : redactLogValue(context)
  const output = [`[${safeNamespace}]`, safeCode, safeContext].filter(value => value !== undefined)
  if (level === 'error') console.error(...output)
  else if (level === 'warn') console.warn(...output)
  else console.info(...output)
}

export function logError(error: unknown, namespace: string) {
  const appError = toAppError(error)
  const safeNamespace = normalizedNamespace(namespace)
  const now = Date.now()
  const key = `${safeNamespace}/${appError.code}`
  const previous = loggedErrorAt.get(key)
  if (previous !== undefined && now - previous < 10_000) return appError
  for (const [loggedKey, loggedAt] of loggedErrorAt) {
    if (now - loggedAt >= 60_000) loggedErrorAt.delete(loggedKey)
  }
  loggedErrorAt.set(key, now)
  const event: SafeErrorEvent = {
    at: new Date(now).toISOString(),
    namespace: safeNamespace,
    code: appError.code,
  }
  recentErrors = [...recentErrors, event].slice(-ERROR_LIMIT)
  for (const subscriber of errorSubscribers) subscriber(getRecentErrors())
  logEvent('error', event.namespace, event.code)
  return appError
}

export function getRecentErrors(): SafeErrorEvent[] {
  return recentErrors.map(event => ({ ...event }))
}

export function clearRecentErrors() {
  recentErrors = []
  loggedErrorAt.clear()
  for (const subscriber of errorSubscribers) subscriber([])
}

export function subscribeRecentErrors(subscriber: (events: SafeErrorEvent[]) => void) {
  errorSubscribers.add(subscriber)
  subscriber(getRecentErrors())
  return () => errorSubscribers.delete(subscriber)
}
