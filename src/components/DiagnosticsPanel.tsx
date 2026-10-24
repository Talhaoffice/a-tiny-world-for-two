import { useEffect, useState } from 'react'
import { createDiagnosticsReport, getDiagnosticsSnapshot, subscribeDiagnostics, type DiagnosticsSnapshot } from '../lib/diagnostics'
import { getRecentErrors, logError, subscribeRecentErrors, type SafeErrorEvent } from '../lib/logger'
import { getLastHealthReport, runHealthCheck, type HealthReport } from '../lib/healthCheck'
import type { ConnectionState } from '../features/world/worldSync'
import './diagnostics.css'

export function ConnectionBanner({ state }: { state: ConnectionState }) {
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine)

  useEffect(() => {
    const onOnline = () => setOnline(true)
    const onOffline = () => setOnline(false)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [])

  const status = !online ? 'offline' : state === 'online' ? 'online' : state === 'error' ? 'issue' : 'reconnecting'
  const label = status === 'online' ? 'Island connected' : status === 'offline' ? 'Offline · changes may not save' : status === 'issue' ? 'Connection issue · retrying' : 'Reconnecting to the island…'
  return <div className={`connection-banner connection-banner--${status}`} role="status" aria-live="polite">{label}</div>
}

export function DiagnosticsPanel() {
  const enabled = import.meta.env.DEV || new URLSearchParams(window.location.search).get('debug') === '1'
  const [metrics, setMetrics] = useState<DiagnosticsSnapshot>(() => getDiagnosticsSnapshot())
  const [errors, setErrors] = useState<SafeErrorEvent[]>(() => getRecentErrors())
  const [health, setHealth] = useState<HealthReport | undefined>(() => getLastHealthReport())
  const [checking, setChecking] = useState(false)
  const [healthError, setHealthError] = useState('')
  const [copyMessage, setCopyMessage] = useState('')

  useEffect(() => {
    const stopMetrics = subscribeDiagnostics(setMetrics)
    const stopErrors = subscribeRecentErrors(setErrors)
    return () => { stopMetrics(); stopErrors() }
  }, [])

  if (!enabled) return null

  async function checkHealth() {
    setChecking(true)
    setHealthError('')
    try {
      setHealth(await runHealthCheck())
    } catch (error) {
      logError(error, 'health/run')
      setHealthError('The read-only health check could not finish.')
    } finally {
      setChecking(false)
    }
  }

  async function copyReport() {
    const online = typeof navigator !== 'undefined' && navigator.onLine
    try {
      await navigator.clipboard.writeText(JSON.stringify(createDiagnosticsReport(online, health), null, 2))
      setCopyMessage('Sanitized diagnostics copied.')
    } catch {
      setCopyMessage('Clipboard access is unavailable in this browser.')
    }
  }

  return (
    <details className="diagnostics-panel">
      <summary>Diagnostics</summary>
      <div className="diagnostics-panel__body">
        <dl>
          <dt>Version / commit</dt><dd>0.1.0 / unknown</dd>
          <dt>Project</dt><dd>{import.meta.env.VITE_FIREBASE_PROJECT_ID || 'unconfigured'}</dd>
          <dt>Browser network</dt><dd>{typeof navigator !== 'undefined' && navigator.onLine ? 'online' : 'offline'}</dd>
          <dt>RTDB connected</dt><dd>{metrics.rtdbConnected === null ? 'unknown' : metrics.rtdbConnected ? 'yes' : 'no'}</dd>
          <dt>Server time offset</dt><dd>{metrics.serverTimeOffset === null ? 'unknown' : `${Math.round(metrics.serverTimeOffset)} ms`}</dd>
          <dt>Listeners / pending writes</dt><dd>{metrics.listenerCount} / {metrics.pendingWrites}</dd>
          <dt>FPS / RTDB writes per minute</dt><dd>{metrics.fps} / {metrics.rtdbWritesPerMinute}</dd>
        </dl>
        <div className="diagnostics-panel__actions">
          <button type="button" onClick={() => { void checkHealth() }} disabled={checking}>{checking ? 'Checking…' : 'Run read-only health check'}</button>
          <button type="button" onClick={() => { void copyReport() }}>Copy diagnostics</button>
        </div>
        {copyMessage && <p role="status">{copyMessage}</p>}
        {healthError && <p role="alert">{healthError}</p>}
        {health && <div className="diagnostics-panel__health" aria-live="polite">
          <strong>Last health check · {new Date(health.checkedAt).toLocaleTimeString()}</strong>
          <span>Auth token: {health.auth.token}</span>
          <span>Firestore membership: {health.firestoreMember.state}</span>
          <span>RTDB connected: {health.realtime.connected === null ? health.realtime.connectionState : health.realtime.connected ? 'yes' : 'no'}</span>
          <span>RTDB server offset: {health.realtime.serverTimeOffset === null ? health.realtime.offsetState : `${Math.round(health.realtime.serverTimeOffset)} ms`}</span>
          <span>Browser network: {health.online ? 'online' : 'offline'}</span>
          {health.queries.map(result => <span key={result.name}>{result.name}: {result.state}{result.indexHint ? ` · ${result.indexHint}` : ''}</span>)}
        </div>}
        <div className="diagnostics-panel__errors">
          <strong>Recent errors ({errors.length}/20)</strong>
          {errors.length ? errors.map((event, index) => <span key={`${event.at}-${index}`}>{event.code} · {event.namespace} · {new Date(event.at).toLocaleTimeString()}</span>) : <span>No recorded errors.</span>}
        </div>
      </div>
    </details>
  )
}
