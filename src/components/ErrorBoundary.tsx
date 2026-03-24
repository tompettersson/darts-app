import React from 'react'
import { logError } from '../errorLog'

interface Props {
  children: React.ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack)
    logError(error, 'ErrorBoundary')

    // Auto-recover from transient React render errors (e.g. orientation change race conditions)
    if (error.message?.includes('310') ||
        error.message?.includes('Objects are not valid as a React child') ||
        error.message?.includes('Minified React error')) {
      console.warn('[ErrorBoundary] Transient React error — auto-recovering...')
      setTimeout(() => this.setState({ hasError: false, error: null }), 100)
      return
    }

    // Auto-recover from stale chunk errors (happens after new deployment)
    if (error.message?.includes('Failed to fetch dynamically imported module') ||
        error.message?.includes('Loading chunk') ||
        error.message?.includes('Loading CSS chunk')) {
      // Clear all caches and reload
      if ('caches' in window) {
        caches.keys().then(names => names.forEach(name => caches.delete(name)))
      }
      navigator.serviceWorker?.getRegistrations().then(regs =>
        regs.forEach(r => r.unregister())
      )
      // Small delay to let cache clearing finish, then reload
      setTimeout(() => window.location.reload(), 300)
    }
  }

  render() {
    if (this.state.hasError) {
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
              this.setState({ hasError: false, error: null })
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
