import React from 'react'
import { logError } from '../errorLog'

interface Props {
  children: React.ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
  retryCount: number
}

const MAX_AUTO_RETRIES = 3

export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, error: null, retryCount: 0 }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack)
    logError(error, 'ErrorBoundary')

    // Auto-recover from transient React render errors (e.g. data not loaded yet)
    const isTransient =
      error.message?.includes('310') ||
      error.message?.includes('Minified React error') ||
      error.message?.includes('Cannot read properties of undefined') ||
      error.message?.includes('Cannot read properties of null') ||
      error.message?.includes('Objects are not valid as a React child')

    if (isTransient && this.state.retryCount < MAX_AUTO_RETRIES) {
      console.warn(`[ErrorBoundary] Transient error — auto-retry ${this.state.retryCount + 1}/${MAX_AUTO_RETRIES}`)
      setTimeout(() => this.setState(s => ({ hasError: false, error: null, retryCount: s.retryCount + 1 })), 200)
      return
    }

    // Auto-recover from stale chunk errors (happens after new deployment)
    if (error.message?.includes('Failed to fetch dynamically imported module') ||
        error.message?.includes('Loading chunk') ||
        error.message?.includes('Loading CSS chunk')) {
      if ('caches' in window) {
        caches.keys().then(names => names.forEach(name => caches.delete(name)))
      }
      navigator.serviceWorker?.getRegistrations().then(regs =>
        regs.forEach(r => r.unregister())
      )
      setTimeout(() => window.location.reload(), 300)
    }
  }

  render() {
    if (this.state.hasError) {
      // During auto-retry, show nothing (avoid error flash)
      if (this.state.retryCount < MAX_AUTO_RETRIES) {
        return null
      }
      return (
        <div style={{
          padding: 32,
          textAlign: 'center',
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 16,
          fontFamily: 'system-ui, sans-serif',
        }}>
          <h2 style={{ margin: 0 }}>Etwas ist schiefgelaufen</h2>
          <p style={{ color: '#888', maxWidth: 400 }}>
            {this.state.error?.message || 'Unbekannter Fehler'}
          </p>
          <button
            onClick={() => {
              this.setState({ hasError: false, error: null, retryCount: 0 })
              window.location.reload()
            }}
            style={{
              padding: '10px 24px',
              fontSize: 16,
              borderRadius: 8,
              border: '1px solid #444',
              background: '#222',
              color: '#fff',
              cursor: 'pointer',
            }}
          >
            App neu laden
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
