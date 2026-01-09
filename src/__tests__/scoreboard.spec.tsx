import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import App from '../App'

describe('Scoreboard UI', () => {
  it('renders player names and sections', () => {
    render(<App />)
    expect(screen.getByText(/Scoreboard/i)).toBeInTheDocument()
    // Player names from exampleMatchEvents
    expect(screen.getByText(/Thomas/i)).toBeInTheDocument()
    expect(screen.getByText(/CPU/i)).toBeInTheDocument()
    expect(screen.getByText(/Checkout-Routen/i)).toBeInTheDocument()
  })
})