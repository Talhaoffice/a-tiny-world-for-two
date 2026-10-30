import { useState } from 'react'
import { createSafeBootDiagnostics } from '../lib/logger'

export function CopyDiagnosticsButton() {
  const [message, setMessage] = useState('')

  async function copyDiagnostics() {
    try {
      await navigator.clipboard.writeText(JSON.stringify(createSafeBootDiagnostics(), null, 2))
      setMessage('Diagnostics copied.')
    } catch {
      setMessage('Clipboard access is unavailable here.')
    }
  }

  return <>
    <button type="button" onClick={() => { void copyDiagnostics() }}>Copy diagnostics</button>
    {message && <span role="status">{message}</span>}
  </>
}
