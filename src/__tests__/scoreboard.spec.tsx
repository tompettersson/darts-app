import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import React from 'react'

// Mock SQLite init before importing App
vi.mock('../db/init', () => ({
  startupWithSQLite: vi.fn().mockResolvedValue({ dbInit: { success: true }, dataLoaded: true }),
  isSQLiteReady: vi.fn().mockReturnValue(true),
}))

import App from '../App'
import { ThemeProvider } from '../ThemeProvider'

describe('App UI', () => {
  it('renders the main menu after loading', async () => {
    render(
      <ThemeProvider>
        <React.Suspense fallback={null}>
          <App />
        </React.Suspense>
      </ThemeProvider>
    )
    await waitFor(() => {
      expect(screen.getByText(/Neues Spiel/i)).toBeInTheDocument()
    })
    expect(screen.getByText(/Statistiken/i)).toBeInTheDocument()
    expect(screen.getByText(/Einstellungen/i)).toBeInTheDocument()
  })
})
