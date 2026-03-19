import { describe, it, expect } from 'vitest'
import {
  applyShanghaiEvents,
  recordShanghaiTurn,
  calculateShanghaiScore,
  isShanghaiHit,
  createShanghaiLegStartEvent,
  getActivePlayerId,
  getCurrentRound,
  getTargetNumber,
  formatDart,
  id,
  now,
} from './dartsShanghai'
import type {
  ShanghaiEvent,
  ShanghaiPlayer,
  ShanghaiDart,
  ShanghaiMatchStartedEvent,
  ShanghaiStructure,
  ShanghaiState,
  ShanghaiTurnResult,
} from './dartsShanghai'

// ===== Helpers =====

function makeMatchStartedEvent(
  players: ShanghaiPlayer[],
  structure: ShanghaiStructure = { kind: 'legs', bestOfLegs: 1 },
): ShanghaiMatchStartedEvent {
  return {
    type: 'ShanghaiMatchStarted',
    eventId: id(),
    matchId: 'match-1',
    ts: now(),
    players,
    structure,
    config: {},
  }
}

function makeLegStartEvent(matchId: string, legIndex: number, setIndex?: number) {
  return createShanghaiLegStartEvent(matchId, legIndex, setIndex)
}

/** Starts a standard match and returns events array with MatchStarted + LegStarted. */
function startMatch(
  players: ShanghaiPlayer[],
  structure: ShanghaiStructure = { kind: 'legs', bestOfLegs: 1 },
): ShanghaiEvent[] {
  const matchStart = makeMatchStartedEvent(players, structure)
  const legStart = makeLegStartEvent(matchStart.matchId, 1)
  return [matchStart, legStart]
}

/** Creates 3 miss darts. */
function missDarts(): ShanghaiDart[] {
  return [
    { target: 'MISS', mult: 1 },
    { target: 'MISS', mult: 1 },
    { target: 'MISS', mult: 1 },
  ]
}

/** Creates 3 single darts on the target number. */
function tripleSingleDarts(target: number): ShanghaiDart[] {
  return [
    { target, mult: 1 },
    { target, mult: 1 },
    { target, mult: 1 },
  ]
}

/** Creates a Shanghai (S+D+T) on the target number. */
function shanghaiDarts(target: number): ShanghaiDart[] {
  return [
    { target, mult: 1 },
    { target, mult: 2 },
    { target, mult: 3 },
  ]
}

/**
 * Records a turn for the given player and applies all resulting events.
 * Returns the TurnResult and the updated events array.
 */
function recordAndApply(
  events: ShanghaiEvent[],
  playerId: string,
  darts: ShanghaiDart[],
): { result: ShanghaiTurnResult; events: ShanghaiEvent[] } {
  const state = applyShanghaiEvents(events)
  const result = recordShanghaiTurn(state, playerId, darts)
  const newEvents: ShanghaiEvent[] = [...events, result.turnEvent]
  if (result.roundFinished) newEvents.push(result.roundFinished)
  if (result.legFinished) newEvents.push(result.legFinished)
  if (result.setFinished) newEvents.push(result.setFinished)
  if (result.matchFinished) newEvents.push(result.matchFinished)
  if (result.nextLegStart) newEvents.push(result.nextLegStart)
  return { result, events: newEvents }
}

// ===== Tests =====

const playerA: ShanghaiPlayer = { playerId: 'a', name: 'Player A' }
const playerB: ShanghaiPlayer = { playerId: 'b', name: 'Player B' }

describe('Shanghai Engine', () => {

  // ===== 1. Match Start - Correct Initial State =====

  describe('Match Start', () => {
    it('should initialize state correctly after MatchStarted + LegStarted', () => {
      const events = startMatch([playerA, playerB])
      const state = applyShanghaiEvents(events)

      expect(state.match).not.toBeNull()
      expect(state.match!.players).toHaveLength(2)
      expect(state.match!.players[0].playerId).toBe('a')
      expect(state.match!.players[1].playerId).toBe('b')
      expect(state.currentLegIndex).toBe(1)
      expect(state.currentLegId).not.toBeNull()
      expect(state.finished).toBeNull()
      expect(state.shanghaiState.currentRound).toBe(1)
      expect(state.shanghaiState.scoreByPlayer['a']).toBe(0)
      expect(state.shanghaiState.scoreByPlayer['b']).toBe(0)
      expect(state.turnIndex).toBe(0)
    })

    it('should set the first player as active', () => {
      const events = startMatch([playerA, playerB])
      const state = applyShanghaiEvents(events)
      expect(getActivePlayerId(state)).toBe('a')
    })

    it('should start at round 1 (target number 1)', () => {
      const events = startMatch([playerA, playerB])
      const state = applyShanghaiEvents(events)
      expect(getCurrentRound(state)).toBe(1)
      expect(getTargetNumber(state)).toBe(1)
    })

    it('should initialize darts counters to 0', () => {
      const events = startMatch([playerA, playerB])
      const state = applyShanghaiEvents(events)
      expect(state.dartsUsedByPlayer['a']).toBe(0)
      expect(state.dartsUsedByPlayer['b']).toBe(0)
      expect(state.dartsUsedTotalByPlayer['a']).toBe(0)
      expect(state.dartsUsedTotalByPlayer['b']).toBe(0)
    })
  })

  // ===== 2. Scoring - Single, Double, Triple =====

  describe('Score Calculation', () => {
    it('should score single correctly: target x 1', () => {
      const darts: ShanghaiDart[] = [
        { target: 5, mult: 1 },
        { target: 'MISS', mult: 1 },
        { target: 'MISS', mult: 1 },
      ]
      expect(calculateShanghaiScore(darts, 5)).toBe(5)
    })

    it('should score double correctly: target x 2', () => {
      const darts: ShanghaiDart[] = [
        { target: 7, mult: 2 },
        { target: 'MISS', mult: 1 },
        { target: 'MISS', mult: 1 },
      ]
      expect(calculateShanghaiScore(darts, 7)).toBe(14)
    })

    it('should score triple correctly: target x 3', () => {
      const darts: ShanghaiDart[] = [
        { target: 10, mult: 3 },
        { target: 'MISS', mult: 1 },
        { target: 'MISS', mult: 1 },
      ]
      expect(calculateShanghaiScore(darts, 10)).toBe(30)
    })

    it('should score S+D+T combined: target x (1+2+3) = target x 6', () => {
      const darts = shanghaiDarts(20)
      expect(calculateShanghaiScore(darts, 20)).toBe(20 * 6) // 120
    })

    it('should ignore darts on wrong target number', () => {
      const darts: ShanghaiDart[] = [
        { target: 3, mult: 3 }, // wrong target
        { target: 5, mult: 1 }, // correct
        { target: 'MISS', mult: 1 },
      ]
      expect(calculateShanghaiScore(darts, 5)).toBe(5)
    })

    it('should score 0 for all misses', () => {
      expect(calculateShanghaiScore(missDarts(), 1)).toBe(0)
    })

    it('should accumulate multiple hits on same target', () => {
      const darts = tripleSingleDarts(8) // 3 x S8
      expect(calculateShanghaiScore(darts, 8)).toBe(24) // 8+8+8
    })
  })

  // ===== 3. Shanghai Detection =====

  describe('Shanghai Detection (isShanghaiHit)', () => {
    it('should detect Shanghai: S+D+T of the same target', () => {
      expect(isShanghaiHit(shanghaiDarts(15), 15)).toBe(true)
    })

    it('should not detect Shanghai with only S+D (missing T)', () => {
      const darts: ShanghaiDart[] = [
        { target: 5, mult: 1 },
        { target: 5, mult: 2 },
        { target: 'MISS', mult: 1 },
      ]
      expect(isShanghaiHit(darts, 5)).toBe(false)
    })

    it('should not detect Shanghai with only S+T (missing D)', () => {
      const darts: ShanghaiDart[] = [
        { target: 5, mult: 1 },
        { target: 5, mult: 3 },
        { target: 'MISS', mult: 1 },
      ]
      expect(isShanghaiHit(darts, 5)).toBe(false)
    })

    it('should not detect Shanghai with only D+T (missing S)', () => {
      const darts: ShanghaiDart[] = [
        { target: 5, mult: 2 },
        { target: 5, mult: 3 },
        { target: 'MISS', mult: 1 },
      ]
      expect(isShanghaiHit(darts, 5)).toBe(false)
    })

    it('should not detect Shanghai when hits are on the wrong target', () => {
      const darts: ShanghaiDart[] = [
        { target: 3, mult: 1 },
        { target: 3, mult: 2 },
        { target: 3, mult: 3 },
      ]
      expect(isShanghaiHit(darts, 5)).toBe(false)
    })

    it('should not detect Shanghai for all misses', () => {
      expect(isShanghaiHit(missDarts(), 1)).toBe(false)
    })
  })

  // ===== 4. Round Progression =====

  describe('Round Progression', () => {
    it('should advance to round 2 after both players complete round 1', () => {
      let events = startMatch([playerA, playerB])

      // Player A throws round 1
      ;({ events } = recordAndApply(events, 'a', tripleSingleDarts(1)))
      let state = applyShanghaiEvents(events)
      expect(state.shanghaiState.currentRound).toBe(1) // still round 1, B hasn't thrown
      expect(getActivePlayerId(state)).toBe('b')

      // Player B throws round 1
      ;({ events } = recordAndApply(events, 'b', missDarts()))
      state = applyShanghaiEvents(events)
      expect(state.shanghaiState.currentRound).toBe(2) // now round 2
      expect(getActivePlayerId(state)).toBe('a') // back to A
    })

    it('should increment target number with each round', () => {
      let events = startMatch([playerA])

      for (let round = 1; round <= 5; round++) {
        const state = applyShanghaiEvents(events)
        expect(getTargetNumber(state)).toBe(round)
        ;({ events } = recordAndApply(events, 'a', missDarts()))
      }

      const state = applyShanghaiEvents(events)
      expect(getTargetNumber(state)).toBe(6)
    })

    it('should track turn index correctly in 2-player game', () => {
      let events = startMatch([playerA, playerB])

      // Round 1: A then B
      let state = applyShanghaiEvents(events)
      expect(state.turnIndex).toBe(0) // A

      ;({ events } = recordAndApply(events, 'a', missDarts()))
      state = applyShanghaiEvents(events)
      expect(state.turnIndex).toBe(1) // B

      ;({ events } = recordAndApply(events, 'b', missDarts()))
      state = applyShanghaiEvents(events)
      // After RoundFinished, turnIndex resets to startPlayerIndex (0)
      expect(state.turnIndex).toBe(0) // A again for round 2
    })

    it('should accumulate scores across rounds', () => {
      let events = startMatch([playerA])

      // Round 1: 3 x S1 = 3 points
      ;({ events } = recordAndApply(events, 'a', tripleSingleDarts(1)))
      let state = applyShanghaiEvents(events)
      expect(state.shanghaiState.scoreByPlayer['a']).toBe(3)

      // Round 2: 3 x S2 = 6 points
      ;({ events } = recordAndApply(events, 'a', tripleSingleDarts(2)))
      state = applyShanghaiEvents(events)
      expect(state.shanghaiState.scoreByPlayer['a']).toBe(9) // 3 + 6
    })
  })

  // ===== 5. Shanghai Instant Win =====

  describe('Shanghai Instant Win', () => {
    it('should end the leg immediately when Shanghai is hit', () => {
      let events = startMatch([playerA, playerB])

      // Player A hits Shanghai on round 1
      const { result } = recordAndApply(events, 'a', shanghaiDarts(1))

      expect(result.turnEvent.isShanghai).toBe(true)
      expect(result.legFinished).toBeDefined()
      expect(result.legFinished!.winnerId).toBe('a')
      expect(result.legFinished!.shanghaiWin).toBe(true)
    })

    it('should end the match (best of 1) on Shanghai', () => {
      let events = startMatch([playerA, playerB])

      const { result } = recordAndApply(events, 'a', shanghaiDarts(1))

      expect(result.matchFinished).toBeDefined()
      expect(result.matchFinished!.winnerId).toBe('a')
    })

    it('should give the correct final score on Shanghai win', () => {
      let events = startMatch([playerA, playerB])

      const { result } = recordAndApply(events, 'a', shanghaiDarts(1))

      // S1 + D1 + T1 = 1 + 2 + 3 = 6
      expect(result.legFinished!.finalScores['a']).toBe(6)
      expect(result.legFinished!.finalScores['b']).toBe(0)
    })

    it('should allow Shanghai mid-game (not just round 1)', () => {
      let events = startMatch([playerA, playerB])

      // Play 2 rounds normally (both miss)
      for (let round = 0; round < 2; round++) {
        ;({ events } = recordAndApply(events, 'a', missDarts()))
        ;({ events } = recordAndApply(events, 'b', missDarts()))
      }

      const state = applyShanghaiEvents(events)
      expect(getCurrentRound(state)).toBe(3)

      // Player A hits Shanghai on round 3
      const { result } = recordAndApply(events, 'a', shanghaiDarts(3))

      expect(result.turnEvent.isShanghai).toBe(true)
      expect(result.legFinished).toBeDefined()
      expect(result.legFinished!.winnerId).toBe('a')
      expect(result.legFinished!.shanghaiWin).toBe(true)
      // S3+D3+T3 = 3+6+9 = 18
      expect(result.legFinished!.finalScores['a']).toBe(18)
    })

    it('should allow Player B to win with Shanghai after Player A has thrown', () => {
      let events = startMatch([playerA, playerB])

      // Player A throws round 1 (no Shanghai)
      ;({ events } = recordAndApply(events, 'a', tripleSingleDarts(1)))

      // Player B hits Shanghai on round 1
      const { result } = recordAndApply(events, 'b', shanghaiDarts(1))

      expect(result.legFinished).toBeDefined()
      expect(result.legFinished!.winnerId).toBe('b')
      expect(result.legFinished!.shanghaiWin).toBe(true)
    })
  })

  // ===== 6. Full Game - Winner Determination =====

  describe('Full Game - Winner Determination', () => {
    it('should declare the player with the highest score as winner after 20 rounds', () => {
      let events = startMatch([playerA, playerB])

      // Play all 20 rounds:
      // Player A always hits 3 singles, Player B always misses
      for (let round = 1; round <= 20; round++) {
        ;({ events } = recordAndApply(events, 'a', tripleSingleDarts(round)))
        ;({ events } = recordAndApply(events, 'b', missDarts()))
      }

      const state = applyShanghaiEvents(events)
      expect(state.finished).not.toBeNull()
      expect(state.finished!.winnerId).toBe('a')

      // Player A total: sum(3*i for i=1..20) = 3 * 210 = 630
      expect(state.shanghaiState.scoreByPlayer['a']).toBe(630)
      expect(state.shanghaiState.scoreByPlayer['b']).toBe(0)
    })

    it('should declare a draw when both players have the same score', () => {
      let events = startMatch([playerA, playerB])

      // Both players miss everything for 20 rounds -> both have 0 points
      for (let round = 1; round <= 20; round++) {
        ;({ events } = recordAndApply(events, 'a', missDarts()))
        ;({ events } = recordAndApply(events, 'b', missDarts()))
      }

      const state = applyShanghaiEvents(events)
      expect(state.finished).not.toBeNull()
      // Draw: winnerId is null
      expect(state.finished!.winnerId).toBeNull()
    })

    it('should produce a matchFinished event after round 20', () => {
      let events = startMatch([playerA])
      let lastResult: ShanghaiTurnResult | undefined

      for (let round = 1; round <= 20; round++) {
        ;({ events, result: lastResult } = recordAndApply(events, 'a', missDarts()) as any)
      }

      // The last round should produce matchFinished
      expect(lastResult!.matchFinished).toBeDefined()
      expect(lastResult!.matchFinished!.winnerId).toBe('a') // solo player wins
    })
  })

  // ===== 7. Best of Legs / Sets =====

  describe('Best of Legs', () => {
    it('should start a new leg after winning a leg in best-of-3', () => {
      const structure: ShanghaiStructure = { kind: 'legs', bestOfLegs: 3 }
      let events = startMatch([playerA, playerB], structure)

      // Leg 1: Player A wins with Shanghai on round 1
      const { result, events: newEvents } = recordAndApply(events, 'a', shanghaiDarts(1))
      events = newEvents

      expect(result.legFinished).toBeDefined()
      expect(result.legFinished!.winnerId).toBe('a')
      expect(result.matchFinished).toBeUndefined() // not finished yet, need 2 legs
      expect(result.nextLegStart).toBeDefined()

      // Verify new leg started
      const state = applyShanghaiEvents(events)
      expect(state.currentLegIndex).toBe(2)
      expect(state.shanghaiState.currentRound).toBe(1) // reset to round 1
      expect(state.shanghaiState.scoreByPlayer['a']).toBe(0) // reset scores
      expect(state.totalLegWinsByPlayer['a']).toBe(1)
    })

    it('should finish the match when a player wins enough legs', () => {
      const structure: ShanghaiStructure = { kind: 'legs', bestOfLegs: 3 }
      let events = startMatch([playerA, playerB], structure)

      // Leg 1: A wins with Shanghai
      ;({ events } = recordAndApply(events, 'a', shanghaiDarts(1)))

      // Leg 2: A wins with Shanghai again
      let lastResult: ShanghaiTurnResult
      ;({ events, result: lastResult } = recordAndApply(events, 'a', shanghaiDarts(1)))

      const state = applyShanghaiEvents(events)
      expect(state.finished).not.toBeNull()
      expect(state.finished!.winnerId).toBe('a')
      expect(state.totalLegWinsByPlayer['a']).toBe(2)
    })

    it('should handle draw in best-of-1 (match ends with no winner)', () => {
      let events = startMatch([playerA, playerB])

      // Both miss all 20 rounds
      for (let round = 1; round <= 20; round++) {
        ;({ events } = recordAndApply(events, 'a', missDarts()))
        ;({ events } = recordAndApply(events, 'b', missDarts()))
      }

      const state = applyShanghaiEvents(events)
      expect(state.finished).not.toBeNull()
      expect(state.finished!.winnerId).toBeNull()
    })

    it('should start new leg on draw in best-of-3', () => {
      const structure: ShanghaiStructure = { kind: 'legs', bestOfLegs: 3 }
      let events = startMatch([playerA, playerB], structure)

      // Play 20 rounds of misses -> draw
      for (let round = 1; round <= 20; round++) {
        ;({ events } = recordAndApply(events, 'a', missDarts()))
        ;({ events } = recordAndApply(events, 'b', missDarts()))
      }

      const state = applyShanghaiEvents(events)
      // Draw doesn't count as a leg win, new leg starts
      expect(state.finished).toBeNull()
      expect(state.totalLegWinsByPlayer['a']).toBe(0)
      expect(state.totalLegWinsByPlayer['b']).toBe(0)
      expect(state.currentLegIndex).toBe(2) // new leg started
      expect(state.shanghaiState.currentRound).toBe(1)
    })
  })

  // ===== 8. Edge Cases =====

  describe('Edge Cases', () => {
    it('should handle a solo player game (1 player)', () => {
      let events = startMatch([playerA])

      // Round 1: 3 x S1 = 3
      ;({ events } = recordAndApply(events, 'a', tripleSingleDarts(1)))

      const state = applyShanghaiEvents(events)
      expect(state.shanghaiState.currentRound).toBe(2)
      expect(state.shanghaiState.scoreByPlayer['a']).toBe(3)
    })

    it('should count darts used correctly', () => {
      let events = startMatch([playerA, playerB])

      // Round 1
      ;({ events } = recordAndApply(events, 'a', tripleSingleDarts(1)))
      ;({ events } = recordAndApply(events, 'b', missDarts()))

      // Round 2
      ;({ events } = recordAndApply(events, 'a', tripleSingleDarts(2)))
      ;({ events } = recordAndApply(events, 'b', missDarts()))

      const state = applyShanghaiEvents(events)
      expect(state.dartsUsedByPlayer['a']).toBe(6) // 2 rounds * 3 darts
      expect(state.dartsUsedByPlayer['b']).toBe(6)
      expect(state.dartsUsedTotalByPlayer['a']).toBe(6)
      expect(state.dartsUsedTotalByPlayer['b']).toBe(6)
    })

    it('should return null for active player when match is finished', () => {
      let events = startMatch([playerA, playerB])

      // Shanghai to end immediately
      ;({ events } = recordAndApply(events, 'a', shanghaiDarts(1)))

      const state = applyShanghaiEvents(events)
      expect(getActivePlayerId(state)).toBeNull()
    })

    it('should return null for active player when no match started', () => {
      const state = applyShanghaiEvents([])
      expect(getActivePlayerId(state)).toBeNull()
    })

    it('should throw when recording a turn without a match', () => {
      const state = applyShanghaiEvents([])
      expect(() => recordShanghaiTurn(state, 'a', missDarts())).toThrow('No match started')
    })

    it('should throw when recording a turn without a leg', () => {
      const matchStart = makeMatchStartedEvent([playerA])
      const state = applyShanghaiEvents([matchStart])
      expect(() => recordShanghaiTurn(state, 'a', missDarts())).toThrow('No leg started')
    })

    it('should handle darts that hit a different number than the target', () => {
      let events = startMatch([playerA])

      // Round 1 (target = 1): all darts hit 20 instead
      const wrongDarts: ShanghaiDart[] = [
        { target: 20, mult: 3 },
        { target: 20, mult: 2 },
        { target: 20, mult: 1 },
      ]
      const { result } = recordAndApply(events, 'a', wrongDarts)

      expect(result.turnEvent.turnScore).toBe(0) // wrong target -> 0 points
      expect(result.turnEvent.isShanghai).toBe(false)
    })

    it('should correctly reset scores between legs', () => {
      const structure: ShanghaiStructure = { kind: 'legs', bestOfLegs: 3 }
      let events = startMatch([playerA, playerB], structure)

      // Leg 1: A scores some points then wins with Shanghai
      ;({ events } = recordAndApply(events, 'a', tripleSingleDarts(1))) // 3 pts
      ;({ events } = recordAndApply(events, 'b', missDarts()))
      ;({ events } = recordAndApply(events, 'a', shanghaiDarts(2))) // Shanghai on 2

      const state = applyShanghaiEvents(events)
      // Scores should be reset for new leg
      expect(state.shanghaiState.scoreByPlayer['a']).toBe(0)
      expect(state.shanghaiState.scoreByPlayer['b']).toBe(0)
      expect(state.shanghaiState.currentRound).toBe(1)
    })
  })

  // ===== 9. formatDart =====

  describe('formatDart', () => {
    it('should format single', () => {
      expect(formatDart({ target: 5, mult: 1 })).toBe('S5')
    })

    it('should format double', () => {
      expect(formatDart({ target: 20, mult: 2 })).toBe('D20')
    })

    it('should format triple', () => {
      expect(formatDart({ target: 18, mult: 3 })).toBe('T18')
    })

    it('should format miss', () => {
      expect(formatDart({ target: 'MISS', mult: 1 })).toBe('Miss')
    })
  })

  // ===== 10. Sets Mode =====

  describe('Sets Mode', () => {
    it('should track set wins and finish match when enough sets are won', () => {
      const structure: ShanghaiStructure = { kind: 'sets', bestOfSets: 3, legsPerSet: 1 }
      let events = startMatch([playerA, playerB], structure)

      // Set 1, Leg 1: A wins with Shanghai
      ;({ events } = recordAndApply(events, 'a', shanghaiDarts(1)))
      let state = applyShanghaiEvents(events)
      expect(state.setWinsByPlayer['a']).toBe(1)
      expect(state.finished).toBeNull()

      // Set 2, Leg 1: A wins again
      ;({ events } = recordAndApply(events, 'a', shanghaiDarts(1)))
      state = applyShanghaiEvents(events)
      expect(state.setWinsByPlayer['a']).toBe(2)
      expect(state.finished).not.toBeNull()
      expect(state.finished!.winnerId).toBe('a')
    })
  })
})
