import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { ThemeProvider } from './ThemeProvider'
import ErrorBoundary from './components/ErrorBoundary'

// SQLite DB Module laden (registriert Console Helpers)
import './db/init'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <ThemeProvider>
        <React.Suspense fallback={null}>
          <App />
        </React.Suspense>
      </ThemeProvider>
    </ErrorBoundary>
  </React.StrictMode>
)
