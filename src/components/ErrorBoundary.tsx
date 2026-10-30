import { Component, type ErrorInfo, type ReactNode } from 'react'
import { logError } from '../lib/logger'
import { CopyDiagnosticsButton } from './CopyDiagnosticsButton'

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
        <p>This part could not be displayed. You can retry or copy diagnostics.</p>
        <div className="app-error__actions">
          <button type="button" onClick={() => this.setState({ failed: false })}>Retry</button>
          <CopyDiagnosticsButton />
        </div>
      </section>
    )
  }
}
