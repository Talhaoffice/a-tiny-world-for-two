import { Component, type ErrorInfo, type ReactNode } from 'react'
import { logError } from '../lib/logger'

type Props = { children: ReactNode; title?: string }
type State = { failed: boolean }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  componentDidCatch(error: Error, _info: ErrorInfo) {
    logError(error, 'react-boundary')
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <section className="app-error" role="alert">
        <p className="eyebrow">A small pause</p>
        <h1>{this.props.title ?? 'This part could not load'}</h1>
        <p>Refresh the page to try again. Your unsent words stay on this device only while this page remains open.</p>
        <button type="button" onClick={() => window.location.reload()}>Refresh</button>
      </section>
    )
  }
}
