import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import App from './App'
import { queryClient } from './queryClient'
import { ThemeProvider } from './ThemeProvider'
import { AuthProvider } from './auth/AuthContext'
import ErrorBoundary from './components/ErrorBoundary'
import ScaleWrapper from './components/ScaleWrapper'
import ToastContainer from './components/Toast'
import Skeleton from './components/Skeleton'

// Global styles (viewport, theme tokens, animations)
import './screens/game.css'

// Error logging (install global handlers)
import { installGlobalErrorHandlers } from './errorLog'
installGlobalErrorHandlers()

// SQLite DB Module laden (registriert Console Helpers)
import './db/init'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <AuthProvider>
            <ScaleWrapper>
              <React.Suspense fallback={<Skeleton rows={5} />}>
                <App />
              </React.Suspense>
            </ScaleWrapper>
            <ToastContainer />
          </AuthProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  </React.StrictMode>
)
