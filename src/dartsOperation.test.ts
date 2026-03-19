import { describe, it, expect } from 'vitest'
import {
  applyOperationEvents,
  recordOperationDart,
  startNewLeg,
  calculatePoints,
  calculateHitScore,
  isHit,
  getCurrentTurnIndex,
  getCurrentDartInTurn,
  getActivePlayerId,
  getDartsRemaining,
  getDartsInTurnRemaining,
  getCurrentLeg,
  id,
  now,
  formatDuration,
  DARTS_PER_LEG,
  DARTS_PER_TURN,
  TURNS_PER_LEG,
} from './dartsOperation'
import type {
  OperationEvent,
  OperationPlayer,
  OperationConfig,
  OperationMatchStartedEvent,
  OperationLegStartedEvent,
  OperationDartResult,
  HitType,
} from './dartsOperation'

// ===== Helpers =====

function makeMatchStartedEvent(
  players: OperationPlayer[],
  config: OperationConfig,
): OperationMatchStartedEvent {
  return {
    type: 'OperationMatchStarted',
    eventId: id(),
    matchId: 'test-match',
    ts: now(),
    players,
    config,
  }
}

function makeLegStartedEvent(
  matchId: string,
  legIndex: number,
  targetNumber: number,
): OperationLegStartedEvent {
  return {
    type: 'OperationLegStarted',
    eventId: id(),
    matchId,
    ts: now(),
    legIndex,
    targetMode: 'MANUAL_NUMBER',
    targetNumber,
  }
}

/**
 * Throws a full turn (up to 3 darts) for the given player with the given hitType.
 * Returns all generated events and the last result.
 */
function throwTurn(
  events: OperationEvent[],
  playerId: string,
  hitType: HitType,
  dartsCount = 3,
): { newEvents: OperationEvent[]; lastResult: OperationDartResult } {
  const newEvents: OperationEvent[] = []
  let lastResult!: OperationDartResult

  for (let dart = 0; dart < dartsCount; dart++) {
    const state = applyOperationEvents([...events, ...newEvents])
    const result = recordOperationDart(state, playerId, hitType)
    newEvents.push(result.dartEvent)
    if (result.legFinished) newEvents.push(result.legFinished)
    if (result.matchFinished) newEvents.push(result.matchFinished)
    lastResult = result
  }

  return { newEvents, lastResult }
}

/**
 * Throws all 30 darts for a player in a leg with alternating turns (multiplayer).
 * Returns all generated events.
 */
function throwAllDartsForPlayer(
  events: OperationEvent[],
  playerId: string,
  hitType: HitType,
): OperationEvent[] {
  const allNewEvents: OperationEvent[] = []
  for (let turn = 0; turn < TURNS_PER_LEG; turn++) {
    const state = applyOperationEvents([...events, ...allNewEvents])
    // Only throw if it's this player's turn and they still have darts
    const activeId = getActivePlayerId(state)
    if (activeId !== playerId) break

    const result = recordOperationDart(state, playerId, hitType)
    allNewEvents.push(result.dartEvent)
    if (result.legFinished) allNewEvents.push(result.legFinished)
    if (result.matchFinished) allNewEvents.push(result.matchFinished)

    // Throw 2 more darts for this turn
    for (let d = 1; d < DARTS_PER_TURN; d++) {
      const s2 = applyOperationEvents([...events, ...allNewEvents])
      if (getActivePlayerId(s2) !== playerId) break
      const r2 = recordOperationDart(s2, playerId, hitType)
      allNewEvents.push(r2.dartEvent)
      if (r2.legFinished) allNewEvents.push(r2.legFinished)
      if (r2.matchFinished) allNewEvents.push(r2.matchFinished)
    }
  }
  return allNewEvents
}

const playerA: OperationPlayer = { playerId: 'a', name: 'Player A' }
const playerB: OperationPlayer = { playerId: 'b', name: 'Player B' }
const soloPlayer: OperationPlayer = { playerId: 'solo', name: 'Solo' }

// ===== Tests =====

describe('Operation Engine - Hilfsfunktionen', () => {
  describe('calculatePoints', () => {
    it('should return 0 for NO_SCORE', () => {
      expect(calculatePoints('NO_SCORE', 20)).toBe(0)
    })

    it('should return the target number for SINGLE', () => {
      expect(calculatePoints('SINGLE', 20)).toBe(20)
      expect(calculatePoints('SINGLE', 5)).toBe(5)
    })

    it('should return double the target number for DOUBLE', () => {
      expect(calculatePoints('DOUBLE', 20)).toBe(40)
      expect(calculatePoints('DOUBLE', 7)).toBe(14)
    })

    it('should return triple the target number for TRIPLE', () => {
      expect(calculatePoints('TRIPLE', 20)).toBe(60)
      expect(calculatePoints('TRIPLE', 3)).toBe(9)
    })

    it('should return 25 for SINGLE_BULL', () => {
      expect(calculatePoints('SINGLE_BULL')).toBe(25)
    })

    it('should return 50 for DOUBLE_BULL', () => {
      expect(calculatePoints('DOUBLE_BULL')).toBe(50)
    })
  })

  describe('calculateHitScore', () => {
    it('should return normalized hit scores', () => {
      expect(calculateHitScore('NO_SCORE')).toBe(0)
      expect(calculateHitScore('SINGLE')).toBe(1)
      expect(calculateHitScore('DOUBLE')).toBe(2)
      expect(calculateHitScore('TRIPLE')).toBe(3)
      expect(calculateHitScore('SINGLE_BULL')).toBe(1)
      expect(calculateHitScore('DOUBLE_BULL')).toBe(2)
    })
  })

  describe('isHit', () => {
    it('should return false for NO_SCORE and true for all others', () => {
      expect(isHit('NO_SCORE')).toBe(false)
      expect(isHit('SINGLE')).toBe(true)
      expect(isHit('DOUBLE')).toBe(true)
      expect(isHit('TRIPLE')).toBe(true)
      expect(isHit('SINGLE_BULL')).toBe(true)
      expect(isHit('DOUBLE_BULL')).toBe(true)
    })
  })

  describe('getCurrentTurnIndex / getCurrentDartInTurn', () => {
    it('should return correct turn index (1-based)', () => {
      expect(getCurrentTurnIndex(0)).toBe(1)   // 0 darts thrown → Turn 1
      expect(getCurrentTurnIndex(3)).toBe(2)   // 3 darts → Turn 2
      expect(getCurrentTurnIndex(27)).toBe(10) // 27 darts → Turn 10
      expect(getCurrentTurnIndex(29)).toBe(10)
      expect(getCurrentTurnIndex(30)).toBe(10) // All done
    })

    it('should return correct dart in turn (1-based)', () => {
      expect(getCurrentDartInTurn(0)).toBe(1)  // First dart of Turn 1
      expect(getCurrentDartInTurn(1)).toBe(2)
      expect(getCurrentDartInTurn(2)).toBe(3)
      expect(getCurrentDartInTurn(3)).toBe(1)  // First dart of Turn 2
      expect(getCurrentDartInTurn(29)).toBe(3) // Last dart
      expect(getCurrentDartInTurn(30)).toBe(0) // All done
    })
  })

  describe('formatDuration', () => {
    it('should format milliseconds correctly', () => {
      expect(formatDuration(0)).toBe('00:00.00')
      expect(formatDuration(61500)).toBe('01:01.50')
      expect(formatDuration(3723450)).toBe('62:03.45')
    })
  })
})

describe('Operation Engine - Match Start', () => {
  it('should create correct initial state from MatchStarted + LegStarted', () => {
    const config: OperationConfig = { legsCount: 1, targetMode: 'MANUAL_NUMBER', targetNumber: 20 }
    const events: OperationEvent[] = [
      makeMatchStartedEvent([playerA, playerB], config),
      makeLegStartedEvent('test-match', 0, 20),
    ]

    const state = applyOperationEvents(events)

    expect(state.match).not.toBeNull()
    expect(state.match!.players).toHaveLength(2)
    expect(state.match!.config.legsCount).toBe(1)
    expect(state.currentLegIndex).toBe(0)
    expect(state.isComplete).toBe(false)
    expect(state.finished).toBeNull()

    const leg = getCurrentLeg(state)!
    expect(leg.legIndex).toBe(0)
    expect(leg.targetMode).toBe('MANUAL_NUMBER')
    expect(leg.targetNumber).toBe(20)
    expect(leg.currentPlayerIndex).toBe(0)
    expect(leg.isComplete).toBe(false)
    expect(leg.players).toHaveLength(2)

    // Both players start with 0 darts
    for (const ps of leg.players) {
      expect(ps.dartsThrown).toBe(0)
      expect(ps.totalScore).toBe(0)
      expect(ps.hitScore).toBe(0)
      expect(ps.noScoreCount).toBe(0)
      expect(ps.events).toHaveLength(0)
    }

    // Active player should be Player A
    expect(getActivePlayerId(state)).toBe('a')
    expect(getDartsRemaining(state, 'a')).toBe(30)
    expect(getDartsRemaining(state, 'b')).toBe(30)
  })

  it('should initialize totals for all players', () => {
    const config: OperationConfig = { legsCount: 3, targetMode: 'MANUAL_NUMBER', targetNumber: 10 }
    const events: OperationEvent[] = [
      makeMatchStartedEvent([playerA, playerB], config),
    ]

    const state = applyOperationEvents(events)
    expect(state.totalsByPlayer['a']).toEqual({ playerId: 'a', totalScore: 0, totalHitScore: 0, legsWon: 0 })
    expect(state.totalsByPlayer['b']).toEqual({ playerId: 'b', totalScore: 0, totalHitScore: 0, legsWon: 0 })
  })
})

describe('Operation Engine - Throwing Darts', () => {
  const config: OperationConfig = { legsCount: 1, targetMode: 'MANUAL_NUMBER', targetNumber: 20 }

  function setupLeg(): OperationEvent[] {
    return [
      makeMatchStartedEvent([playerA, playerB], config),
      makeLegStartedEvent('test-match', 0, 20),
    ]
  }

  it('should record a hit and calculate points correctly', () => {
    const events = setupLeg()
    const state = applyOperationEvents(events)
    const result = recordOperationDart(state, 'a', 'TRIPLE')

    expect(result.dartEvent.type).toBe('OperationDart')
    expect(result.dartEvent.playerId).toBe('a')
    expect(result.dartEvent.hitType).toBe('TRIPLE')
    expect(result.dartEvent.points).toBe(60) // Triple 20
    expect(result.dartEvent.dartIndexGlobal).toBe(1)
    expect(result.dartEvent.turnIndex).toBe(1)
    expect(result.dartEvent.dartInTurn).toBe(1)
  })

  it('should record a miss with 0 points', () => {
    const events = setupLeg()
    const state = applyOperationEvents(events)
    const result = recordOperationDart(state, 'a', 'NO_SCORE')

    expect(result.dartEvent.points).toBe(0)
    expect(result.dartEvent.hitType).toBe('NO_SCORE')
  })

  it('should accumulate score after multiple darts', () => {
    const events = setupLeg()

    // Player A throws 3 Triples on 20
    const { newEvents } = throwTurn(events, 'a', 'TRIPLE')
    events.push(...newEvents)

    const state = applyOperationEvents(events)
    const leg = getCurrentLeg(state)!
    const psA = leg.players.find(p => p.playerId === 'a')!

    expect(psA.dartsThrown).toBe(3)
    expect(psA.totalScore).toBe(180) // 3 * T20 = 3 * 60
    expect(psA.hitScore).toBe(9) // 3 * 3 (TRIPLE hit score)
    expect(psA.tripleCount).toBe(3)
    expect(psA.noScoreCount).toBe(0)
  })

  it('should track hit type counts correctly', () => {
    const events = setupLeg()

    // Throw one of each type for Player A (3 darts per turn, need 6 darts = 2 turns)
    // Turn 1: SINGLE, DOUBLE, TRIPLE
    let state = applyOperationEvents(events)
    let r = recordOperationDart(state, 'a', 'SINGLE')
    events.push(r.dartEvent)

    state = applyOperationEvents(events)
    r = recordOperationDart(state, 'a', 'DOUBLE')
    events.push(r.dartEvent)

    state = applyOperationEvents(events)
    r = recordOperationDart(state, 'a', 'NO_SCORE')
    events.push(r.dartEvent)

    // After turn: switch to Player B, then throw B's turn
    const { newEvents: bEvents } = throwTurn(events, 'b', 'NO_SCORE')
    events.push(...bEvents)

    // Turn 2 for A: TRIPLE, NO_SCORE, NO_SCORE
    state = applyOperationEvents(events)
    r = recordOperationDart(state, 'a', 'TRIPLE')
    events.push(r.dartEvent)

    state = applyOperationEvents(events)
    r = recordOperationDart(state, 'a', 'NO_SCORE')
    events.push(r.dartEvent)

    state = applyOperationEvents(events)
    r = recordOperationDart(state, 'a', 'NO_SCORE')
    events.push(r.dartEvent)

    state = applyOperationEvents(events)
    const leg = getCurrentLeg(state)!
    const psA = leg.players.find(p => p.playerId === 'a')!

    expect(psA.dartsThrown).toBe(6)
    expect(psA.singleCount).toBe(1)
    expect(psA.doubleCount).toBe(1)
    expect(psA.tripleCount).toBe(1)
    expect(psA.noScoreCount).toBe(3)
  })

  it('should track hit streaks correctly', () => {
    const events = setupLeg()

    // Player A: SINGLE, SINGLE, SINGLE (streak=3), then next turn after B
    const hitTypes: HitType[] = ['SINGLE', 'SINGLE', 'SINGLE']
    for (const ht of hitTypes) {
      const state = applyOperationEvents(events)
      const r = recordOperationDart(state, 'a', ht)
      events.push(r.dartEvent)
    }

    let state = applyOperationEvents(events)
    let leg = getCurrentLeg(state)!
    let psA = leg.players.find(p => p.playerId === 'a')!
    expect(psA.currentHitStreak).toBe(3)
    expect(psA.maxHitStreak).toBe(3)

    // Player B throws
    const { newEvents: bEvents } = throwTurn(events, 'b', 'NO_SCORE')
    events.push(...bEvents)

    // Player A: NO_SCORE breaks the streak
    state = applyOperationEvents(events)
    const r = recordOperationDart(state, 'a', 'NO_SCORE')
    events.push(r.dartEvent)

    state = applyOperationEvents(events)
    leg = getCurrentLeg(state)!
    psA = leg.players.find(p => p.playerId === 'a')!
    expect(psA.currentHitStreak).toBe(0)
    expect(psA.maxHitStreak).toBe(3) // Max stays at 3
  })
})

describe('Operation Engine - Player Turn Rotation', () => {
  const config: OperationConfig = { legsCount: 1, targetMode: 'MANUAL_NUMBER', targetNumber: 10 }

  it('should switch to next player after 3 darts', () => {
    const events: OperationEvent[] = [
      makeMatchStartedEvent([playerA, playerB], config),
      makeLegStartedEvent('test-match', 0, 10),
    ]

    // Player A throws 3 darts
    const { newEvents } = throwTurn(events, 'a', 'SINGLE')
    events.push(...newEvents)

    const state = applyOperationEvents(events)
    expect(getActivePlayerId(state)).toBe('b')
  })

  it('should switch back to first player after both throw', () => {
    const events: OperationEvent[] = [
      makeMatchStartedEvent([playerA, playerB], config),
      makeLegStartedEvent('test-match', 0, 10),
    ]

    // Player A turn
    const { newEvents: aEvents } = throwTurn(events, 'a', 'SINGLE')
    events.push(...aEvents)

    // Player B turn
    const { newEvents: bEvents } = throwTurn(events, 'b', 'SINGLE')
    events.push(...bEvents)

    const state = applyOperationEvents(events)
    expect(getActivePlayerId(state)).toBe('a')
  })

  it('should track darts in turn remaining correctly', () => {
    const events: OperationEvent[] = [
      makeMatchStartedEvent([soloPlayer], config),
      makeLegStartedEvent('test-match', 0, 10),
    ]

    let state = applyOperationEvents(events)
    expect(getDartsInTurnRemaining(state, 'solo')).toBe(3)

    // Throw 1 dart
    const r = recordOperationDart(state, 'solo', 'SINGLE')
    events.push(r.dartEvent)

    state = applyOperationEvents(events)
    expect(getDartsInTurnRemaining(state, 'solo')).toBe(2)
  })
})

describe('Operation Engine - Solo Leg Completion', () => {
  const config: OperationConfig = { legsCount: 1, targetMode: 'MANUAL_NUMBER', targetNumber: 10 }

  it('should complete a leg after 30 darts (solo)', () => {
    const events: OperationEvent[] = [
      makeMatchStartedEvent([soloPlayer], config),
      makeLegStartedEvent('test-match', 0, 10),
    ]

    let lastResult: OperationDartResult | null = null

    // Throw 30 darts (all SINGLE on 10)
    for (let i = 0; i < 30; i++) {
      const state = applyOperationEvents(events)
      const result = recordOperationDart(state, 'solo', 'SINGLE')
      events.push(result.dartEvent)
      if (result.legFinished) events.push(result.legFinished)
      if (result.matchFinished) events.push(result.matchFinished)
      lastResult = result
    }

    // Last dart should trigger leg and match finish
    expect(lastResult!.legFinished).toBeDefined()
    expect(lastResult!.legFinished!.playerScores['solo']).toBe(300) // 30 * 10
    expect(lastResult!.legFinished!.playerHitScores!['solo']).toBe(30) // 30 * 1
    expect(lastResult!.legFinished!.winnerId).toBe('solo')

    expect(lastResult!.matchFinished).toBeDefined()
    expect(lastResult!.matchFinished!.winnerId).toBe('solo')
    expect(lastResult!.matchFinished!.totalDarts).toBe(30)
    expect(lastResult!.matchFinished!.finalScores['solo']).toBe(300)

    // Verify final state
    const finalState = applyOperationEvents(events)
    expect(finalState.isComplete).toBe(true)
    expect(finalState.finished).not.toBeNull()
    expect(finalState.finished!.winnerId).toBe('solo')
  })

  it('should score 0 for all misses', () => {
    const events: OperationEvent[] = [
      makeMatchStartedEvent([soloPlayer], config),
      makeLegStartedEvent('test-match', 0, 10),
    ]

    for (let i = 0; i < 30; i++) {
      const state = applyOperationEvents(events)
      const result = recordOperationDart(state, 'solo', 'NO_SCORE')
      events.push(result.dartEvent)
      if (result.legFinished) events.push(result.legFinished)
      if (result.matchFinished) events.push(result.matchFinished)
    }

    const finalState = applyOperationEvents(events)
    expect(finalState.finished!.finalScores['solo']).toBe(0)
    expect(finalState.finished!.finalHitScores['solo']).toBe(0)
  })
})

describe('Operation Engine - 2-Player Leg Completion', () => {
  const config: OperationConfig = { legsCount: 1, targetMode: 'MANUAL_NUMBER', targetNumber: 20 }

  it('should determine winner by hitScore (not raw points)', () => {
    const events: OperationEvent[] = [
      makeMatchStartedEvent([playerA, playerB], config),
      makeLegStartedEvent('test-match', 0, 20),
    ]

    // Alternate turns: A throws TRIPLE, B throws NO_SCORE
    for (let turn = 0; turn < TURNS_PER_LEG; turn++) {
      // Player A: 3 Triples
      for (let d = 0; d < 3; d++) {
        const state = applyOperationEvents(events)
        const result = recordOperationDart(state, 'a', 'TRIPLE')
        events.push(result.dartEvent)
        if (result.legFinished) events.push(result.legFinished)
        if (result.matchFinished) events.push(result.matchFinished)
      }

      // Player B: 3 misses
      for (let d = 0; d < 3; d++) {
        const state = applyOperationEvents(events)
        const result = recordOperationDart(state, 'b', 'NO_SCORE')
        events.push(result.dartEvent)
        if (result.legFinished) events.push(result.legFinished)
        if (result.matchFinished) events.push(result.matchFinished)
      }
    }

    const finalState = applyOperationEvents(events)
    expect(finalState.isComplete).toBe(true)
    expect(finalState.finished!.winnerId).toBe('a')
    // Player A: 30 * T20 = 1800 points, hitScore = 30 * 3 = 90
    expect(finalState.finished!.finalScores['a']).toBe(1800)
    expect(finalState.finished!.finalHitScores['a']).toBe(90)
    // Player B: 0 points, hitScore = 0
    expect(finalState.finished!.finalScores['b']).toBe(0)
    expect(finalState.finished!.finalHitScores['b']).toBe(0)
  })

  it('should return null winnerId on hitScore tie', () => {
    const events: OperationEvent[] = [
      makeMatchStartedEvent([playerA, playerB], config),
      makeLegStartedEvent('test-match', 0, 20),
    ]

    // Both players throw all SINGLE → same hitScore
    for (let turn = 0; turn < TURNS_PER_LEG; turn++) {
      for (let d = 0; d < 3; d++) {
        const state = applyOperationEvents(events)
        const result = recordOperationDart(state, 'a', 'SINGLE')
        events.push(result.dartEvent)
        if (result.legFinished) events.push(result.legFinished)
        if (result.matchFinished) events.push(result.matchFinished)
      }
      for (let d = 0; d < 3; d++) {
        const state = applyOperationEvents(events)
        const result = recordOperationDart(state, 'b', 'SINGLE')
        events.push(result.dartEvent)
        if (result.legFinished) events.push(result.legFinished)
        if (result.matchFinished) events.push(result.matchFinished)
      }
    }

    const finalState = applyOperationEvents(events)
    expect(finalState.finished!.winnerId).toBeNull()
  })
})

describe('Operation Engine - Multi-Leg Match', () => {
  it('should track totals across multiple legs', () => {
    const config: OperationConfig = { legsCount: 2, targetMode: 'MANUAL_NUMBER', targetNumber: 10 }
    const events: OperationEvent[] = [
      makeMatchStartedEvent([soloPlayer], config),
      makeLegStartedEvent('test-match', 0, 10),
    ]

    // Leg 1: all SINGLE (30 * 10 = 300 points, hitScore = 30)
    for (let i = 0; i < 30; i++) {
      const state = applyOperationEvents(events)
      const result = recordOperationDart(state, 'solo', 'SINGLE')
      events.push(result.dartEvent)
      if (result.legFinished) events.push(result.legFinished)
      if (result.matchFinished) events.push(result.matchFinished)
    }

    // Verify leg 1 finished but match not yet
    let state = applyOperationEvents(events)
    expect(state.legs[0].isComplete).toBe(true)
    expect(state.isComplete).toBe(false)
    expect(state.totalsByPlayer['solo'].totalScore).toBe(300)
    expect(state.totalsByPlayer['solo'].legsWon).toBe(1)

    // Start Leg 2
    const legEvent = startNewLeg(state, 'MANUAL_NUMBER', 10)
    events.push(legEvent)

    // Leg 2: all DOUBLE (30 * 20 = 600 points, hitScore = 60)
    for (let i = 0; i < 30; i++) {
      state = applyOperationEvents(events)
      const result = recordOperationDart(state, 'solo', 'DOUBLE')
      events.push(result.dartEvent)
      if (result.legFinished) events.push(result.legFinished)
      if (result.matchFinished) events.push(result.matchFinished)
    }

    const finalState = applyOperationEvents(events)
    expect(finalState.isComplete).toBe(true)
    expect(finalState.finished).not.toBeNull()
    expect(finalState.finished!.winnerId).toBe('solo')
    expect(finalState.finished!.finalScores['solo']).toBe(900)    // 300 + 600
    expect(finalState.finished!.finalHitScores['solo']).toBe(90)  // 30 + 60
    expect(finalState.finished!.legWins['solo']).toBe(2)
    expect(finalState.finished!.totalDarts).toBe(60)              // 2 legs * 30
  })

  it('should use startNewLeg to create correct LegStartedEvent', () => {
    const config: OperationConfig = { legsCount: 3, targetMode: 'RANDOM_NUMBER' }
    const events: OperationEvent[] = [
      makeMatchStartedEvent([soloPlayer], config),
    ]

    const state = applyOperationEvents(events)
    const legEvent = startNewLeg(state, 'RANDOM_NUMBER', 15)

    expect(legEvent.type).toBe('OperationLegStarted')
    expect(legEvent.legIndex).toBe(0)
    expect(legEvent.targetMode).toBe('RANDOM_NUMBER')
    expect(legEvent.targetNumber).toBe(15)
  })

  it('should resolve targetNumber for BULL mode as undefined', () => {
    const config: OperationConfig = { legsCount: 1, targetMode: 'BULL' }
    const events: OperationEvent[] = [
      makeMatchStartedEvent([soloPlayer], config),
    ]

    const state = applyOperationEvents(events)
    const legEvent = startNewLeg(state, 'BULL')

    expect(legEvent.targetNumber).toBeUndefined()
  })
})

describe('Operation Engine - BULL Target Mode', () => {
  it('should score SINGLE_BULL and DOUBLE_BULL correctly without targetNumber', () => {
    const config: OperationConfig = { legsCount: 1, targetMode: 'BULL' }
    const events: OperationEvent[] = [
      makeMatchStartedEvent([soloPlayer], config),
      {
        type: 'OperationLegStarted',
        eventId: id(),
        matchId: 'test-match',
        ts: now(),
        legIndex: 0,
        targetMode: 'BULL',
        // no targetNumber
      },
    ]

    let state = applyOperationEvents(events)
    let r = recordOperationDart(state, 'solo', 'SINGLE_BULL')
    events.push(r.dartEvent)
    expect(r.dartEvent.points).toBe(25)

    state = applyOperationEvents(events)
    r = recordOperationDart(state, 'solo', 'DOUBLE_BULL')
    events.push(r.dartEvent)
    expect(r.dartEvent.points).toBe(50)

    state = applyOperationEvents(events)
    r = recordOperationDart(state, 'solo', 'NO_SCORE')
    events.push(r.dartEvent)
    expect(r.dartEvent.points).toBe(0)

    state = applyOperationEvents(events)
    const leg = getCurrentLeg(state)!
    const ps = leg.players[0]
    expect(ps.totalScore).toBe(75)
    expect(ps.singleBullCount).toBe(1)
    expect(ps.doubleBullCount).toBe(1)
    expect(ps.noScoreCount).toBe(1)
  })
})

describe('Operation Engine - Edge Cases', () => {
  it('should throw error when no match started', () => {
    const state = applyOperationEvents([])
    expect(() => recordOperationDart(state, 'a', 'SINGLE')).toThrow('No match started')
  })

  it('should throw error when no active leg', () => {
    const config: OperationConfig = { legsCount: 1, targetMode: 'MANUAL_NUMBER', targetNumber: 10 }
    const events: OperationEvent[] = [
      makeMatchStartedEvent([soloPlayer], config),
      // No LegStarted event
    ]
    const state = applyOperationEvents(events)
    expect(() => recordOperationDart(state, 'solo', 'SINGLE')).toThrow('No active leg')
  })

  it('should throw error when player already threw all 30 darts', () => {
    const config: OperationConfig = { legsCount: 1, targetMode: 'MANUAL_NUMBER', targetNumber: 10 }
    const events: OperationEvent[] = [
      makeMatchStartedEvent([soloPlayer], config),
      makeLegStartedEvent('test-match', 0, 10),
    ]

    // Throw 30 darts
    for (let i = 0; i < 30; i++) {
      const state = applyOperationEvents(events)
      const result = recordOperationDart(state, 'solo', 'SINGLE')
      events.push(result.dartEvent)
      if (result.legFinished) events.push(result.legFinished)
      if (result.matchFinished) events.push(result.matchFinished)
    }

    // 31st dart should fail
    const state = applyOperationEvents(events)
    expect(getActivePlayerId(state)).toBeNull()
  })

  it('should return null activePlayerId when match is finished', () => {
    const config: OperationConfig = { legsCount: 1, targetMode: 'MANUAL_NUMBER', targetNumber: 10 }
    const events: OperationEvent[] = [
      makeMatchStartedEvent([soloPlayer], config),
      makeLegStartedEvent('test-match', 0, 10),
    ]

    for (let i = 0; i < 30; i++) {
      const state = applyOperationEvents(events)
      const result = recordOperationDart(state, 'solo', 'SINGLE')
      events.push(result.dartEvent)
      if (result.legFinished) events.push(result.legFinished)
      if (result.matchFinished) events.push(result.matchFinished)
    }

    const finalState = applyOperationEvents(events)
    expect(getActivePlayerId(finalState)).toBeNull()
  })

  it('should handle dart event metadata (turnIndex, dartInTurn) correctly through a full leg', () => {
    const config: OperationConfig = { legsCount: 1, targetMode: 'MANUAL_NUMBER', targetNumber: 5 }
    const events: OperationEvent[] = [
      makeMatchStartedEvent([soloPlayer], config),
      makeLegStartedEvent('test-match', 0, 5),
    ]

    const dartResults: OperationDartResult[] = []
    for (let i = 0; i < 30; i++) {
      const state = applyOperationEvents(events)
      const result = recordOperationDart(state, 'solo', 'SINGLE')
      events.push(result.dartEvent)
      dartResults.push(result)
      if (result.legFinished) events.push(result.legFinished)
      if (result.matchFinished) events.push(result.matchFinished)
    }

    // Verify first dart: turn 1, dart 1, global 1
    expect(dartResults[0].dartEvent.turnIndex).toBe(1)
    expect(dartResults[0].dartEvent.dartInTurn).toBe(1)
    expect(dartResults[0].dartEvent.dartIndexGlobal).toBe(1)

    // Verify last dart of first turn: turn 1, dart 3, global 3
    expect(dartResults[2].dartEvent.turnIndex).toBe(1)
    expect(dartResults[2].dartEvent.dartInTurn).toBe(3)
    expect(dartResults[2].dartEvent.dartIndexGlobal).toBe(3)

    // Verify first dart of second turn: turn 2, dart 1, global 4
    expect(dartResults[3].dartEvent.turnIndex).toBe(2)
    expect(dartResults[3].dartEvent.dartInTurn).toBe(1)
    expect(dartResults[3].dartEvent.dartIndexGlobal).toBe(4)

    // Verify last dart: turn 10, dart 3, global 30
    expect(dartResults[29].dartEvent.turnIndex).toBe(10)
    expect(dartResults[29].dartEvent.dartInTurn).toBe(3)
    expect(dartResults[29].dartEvent.dartIndexGlobal).toBe(30)
  })

  it('should correctly compute constants', () => {
    expect(DARTS_PER_LEG).toBe(30)
    expect(DARTS_PER_TURN).toBe(3)
    expect(TURNS_PER_LEG).toBe(10)
  })
})
