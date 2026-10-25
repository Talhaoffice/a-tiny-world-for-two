import React, { lazy, Suspense } from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { ErrorBoundary } from './components/ErrorBoundary'
import './styles.css'

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').catch(() => undefined)
  }, { once: true })
}

const ArtPreview = lazy(() => import('./pages/ArtPreview'))

const isArtPreview = new URLSearchParams(window.location.search).get('art') === '1'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {isArtPreview
      ? <Suspense fallback={<div style={{ color: '#e9bd68', padding: 24, fontFamily: 'monospace' }}>Loading art preview…</div>}><ArtPreview /></Suspense>
      : <ErrorBoundary><App /></ErrorBoundary>
    }
  </React.StrictMode>,
)
