import { describe, it, expect } from 'vitest'
import { exampleMatchEvents, applyEvents, computeStats } from '../darts501'

describe('Engine basics', () => {
  it('computes state from example events', () => {
    const events = exampleMatchEvents()
    const state = applyEvents(events)
    const stats = computeStats(events)

    expect(state.legs.length).toBeGreaterThan(0)
    expect(Object.keys(stats)).toContain('p1')
    // exampleMatchEvents() enthält nur Start-Events, daher ist das Match noch nicht beendet
    expect(state.finished).toBeUndefined()
  })
})