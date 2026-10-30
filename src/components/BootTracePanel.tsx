import { useEffect, useState } from 'react'
import { getBootTrace, subscribeBootTrace, type BootTraceEvent } from '../lib/logger'
import { CopyDiagnosticsButton } from './CopyDiagnosticsButton'
import './diagnostics.css'

const enabled = import.meta.env.DEV || new URLSearchParams(window.location.search).get('debug') === '1'

export function BootTracePanel() {
  const [events, setEvents] = useState<BootTraceEvent[]>(() => getBootTrace())
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const stop = subscribeBootTrace(setEvents)
    return () => { stop() }
  }, [])
  useEffect(() => {
    if (!enabled || !events.some(event => event.status === 'started')) return
    const timer = window.setInterval(() => setNow(Date.now()), 250)
    return () => window.clearInterval(timer)
  }, [events])
  if (!enabled) return null

  const last = events.at(-1)
  return <details className="boot-trace-panel">
    <summary>Boot trace</summary>
    <div className="boot-trace-panel__body" aria-live="polite">
      <p><strong>Last step reached:</strong> {last ? `${last.step} · ${last.status}` : 'Waiting for startup'}</p>
      <ol>
        {events.map((event, index) => <li key={`${event.at}-${index}`}>
          <time dateTime={event.at}>{new Date(event.at).toLocaleTimeString()}</time>
          <span>{event.step}: {event.status} · {event.status === 'started' ? Math.max(0, now - Date.parse(event.at)) : event.durationMs}ms{event.errorCode ? ` · ${event.errorCode}` : ''}{event.errorMessage ? ` · ${event.errorMessage}` : ''}</span>
        </li>)}
      </ol>
      <CopyDiagnosticsButton />
    </div>
  </details>
}
