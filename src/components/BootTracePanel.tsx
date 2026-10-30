import { useEffect, useState } from 'react'
import { getBootTrace, subscribeBootTrace, type BootTraceEvent } from '../lib/logger'
import { CopyDiagnosticsButton } from './CopyDiagnosticsButton'
import './diagnostics.css'

const enabled = import.meta.env.DEV || new URLSearchParams(window.location.search).get('debug') === '1'

export function BootTracePanel() {
  const [events, setEvents] = useState<BootTraceEvent[]>(() => getBootTrace())

  useEffect(() => {
    const stop = subscribeBootTrace(setEvents)
    return () => { stop() }
  }, [])
  if (!enabled) return null

  const last = events.at(-1)
  return <details className="boot-trace-panel">
    <summary>Boot trace</summary>
    <div className="boot-trace-panel__body" aria-live="polite">
      <p><strong>Last step reached:</strong> {last ? `${last.step} · ${last.status}` : 'Waiting for startup'}</p>
      <ol>
        {events.map((event, index) => <li key={`${event.at}-${index}`}>
          <time dateTime={event.at}>{new Date(event.at).toLocaleTimeString()}</time>
          <span>{event.step}: {event.status}{event.errorCode ? ` · ${event.errorCode}` : ''}</span>
        </li>)}
      </ol>
      <CopyDiagnosticsButton />
    </div>
  </details>
}
