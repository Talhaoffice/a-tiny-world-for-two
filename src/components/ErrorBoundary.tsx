import { Component, type ErrorInfo, type ReactNode } from 'react'
import { logError } from '../lib/logger'
import { toAppError } from '../lib/errors'
import { CopyDiagnosticsButton } from './CopyDiagnosticsButton'

type Props = { children: ReactNode; title?: string; diagnosticsScope?: 'wardrobe' | 'gallery' }
type State = { failed: boolean; errorCode: string }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false, errorCode: '' }

  static getDerivedStateFromError(): State {
    return { failed: true, errorCode: 'unknown' }
  }

  componentDidCatch(error: Error, _info: ErrorInfo) {
    this.setState({ errorCode: toAppError(error).code })
    logError(error, 'react-boundary')
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <section className="app-error" role="alert" data-debug-scope={this.props.diagnosticsScope} data-error-code={this.state.errorCode}>
        <p className="eyebrow">A small pause</p>
        <h1>{this.props.title ?? 'This part could not load'}</h1>
        <p>This part could not be displayed. You can retry or copy diagnostics.</p>
        <div className="app-error__actions">
          <button type="button" onClick={() => this.setState({ failed: false, errorCode: '' })}>Retry</button>
          <CopyDiagnosticsButton />
        </div>
      </section>
    )
  }
}
