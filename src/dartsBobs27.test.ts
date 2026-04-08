import { describe, it, expect } from 'vitest'
import {
  applyBobs27Events,
  recordBobs27Throw,
  generateTargets,
  DEFAULT_CONFIG,
  id,
  now,
} from './dartsBobs27'
import type {
  Bobs27Event,
  Bobs27Config,
  Bobs27Player,
  Bobs27MatchStartedEvent,
  Bobs27State,
  Bobs27ThrowResult,
} from './dartsBobs27'

// ===== Helpers =====

function makeMatchStartedEvent(
  players: Bobs27Player[],
  config: Bobs27Config = DEFAULT_CONFIG,
): Bobs27MatchStartedEvent {
  return {
    type: 'Bobs27MatchStarted',
    eventId: id(),
    matchId: id(),
    ts: now(),
    players,
    config,
    targets: generateTargets(config),
  }
}

/**
 * Throws 3 darts for the active player at the current target.
 * All darts are either hits or misses.
 * Returns the events generated and the final ThrowResult (which may contain matchFinished).
 */
function throwTarget(
  events: Bobs27Event[],
  playerId: string,
  hit: boolean,
): { newEvents: Bobs27Event[]; lastResult: Bobs27ThrowResult } {
  const newEvents: Bobs27Event[] = []
  let lastResult!: Bobs27ThrowResult

  for (let dart = 0; dart < 3; dart++) {
    const state = applyBobs27Events([...events, ...newEvents])
    const result = recordBobs27Throw(state, playerId, hit)
    newEvents.push(result.throwEvent)
    if (result.targetFinished) newEvents.push(result.targetFinished)
    if (result.legFinished) newEvents.push(result.legFinished)
    if (result.matchFinished) newEvents.push(result.matchFinished)
    lastResult = result
  }

  return { newEvents, lastResult }
}

// ===== Tests =====

describe('Bob\'s 27 Engine - Multiplayer Game Completion', () => {

  describe('2-Player Match: Player A hits everything, Player B misses everything', () => {
    const playerA: Bobs27Player = { playerId: 'a', name: 'Player A' }
    const playerB: Bobs27Player = { playerId: 'b', name: 'Player B' }

    it('should complete the match with Player A as winner', () => {
      const config: Bobs27Config = { ...DEFAULT_CONFIG, allowNegative: false }
      const startEvent = makeMatchStartedEvent([playerA, playerB], config)
      const events: Bobs27Event[] = [startEvent]

      // Track which target each player is on
      let playerBEliminated = false
      let matchFinishedResult: Bobs27ThrowResult | null = null

      // The game alternates: after each TargetFinished, the next player throws.
      // Player order: A starts at index 0, B is at index 1.
      // After A finishes a target, B goes. After B finishes, A goes. And so on.
      //
      // Player B elimination timeline (all misses):
      // D1: -2, score=25
      // D2: -4, score=21
      // D3: -6, score=15
      // D4: -8, score=7
      // D5: -10, score=-3 → ELIMINATED
      //
      // After Player B is eliminated at D5, Player A continues alone until D20.

      for (let targetIdx = 0; targetIdx < 20; targetIdx++) {
        // Player A throws at their current target (always hits)
        {
          const state = applyBobs27Events(events)
          // Verify it's Player A's turn
          expect(state.match!.players[state.currentPlayerIndex].playerId).toBe('a')

          const { newEvents, lastResult } = throwTarget(events, 'a', true)
          events.push(...newEvents)
          if (lastResult.matchFinished) {
            matchFinishedResult = lastResult
            break
          }
        }

        // Player B throws at their current target (always misses) - if not eliminated
        if (!playerBEliminated) {
          const state = applyBobs27Events(events)
          // Verify it's Player B's turn
          expect(state.match!.players[state.currentPlayerIndex].playerId).toBe('b')

          const { newEvents, lastResult } = throwTarget(events, 'b', false)
          events.push(...newEvents)

          // Check if B got eliminated
          if (lastResult.targetFinished?.eliminated) {
            playerBEliminated = true
          }
          if (lastResult.matchFinished) {
            matchFinishedResult = lastResult
            break
          }
        }
      }

      // The match should have finished
      expect(matchFinishedResult).not.toBeNull()
      expect(matchFinishedResult!.matchFinished).toBeDefined()
      expect(matchFinishedResult!.matchFinished!.winnerId).toBe('a')

      // Verify final state
      const finalState = applyBobs27Events(events)
      expect(finalState.finished).not.toBeNull()
      expect(finalState.finished!.winnerId).toBe('a')

      // Player A played all 20 targets
      const psA = finalState.playerStates['a']
      expect(psA.targetResults.length).toBe(20)
      expect(psA.eliminated).toBe(false)
      expect(psA.finished).toBe(true)
      expect(psA.totalDarts).toBe(60) // 20 targets * 3 darts

      // Player A final score: 27 + sum(hits*doubleValue for D1..D20)
      // Each target: 3 hits * doubleValue = 3 * 2i for target i (i=1..20)
      // Total delta = 6*(1+2+3+...+20) = 6*210 = 1260
      // Final score = 27 + 1260 = 1287
      expect(psA.score).toBe(1287)

      // Player B was eliminated at D5 (targetIndex 4)
      const psB = finalState.playerStates['b']
      expect(psB.eliminated).toBe(true)
      expect(psB.eliminatedAtTarget).toBe(4) // D5 is index 4
      expect(psB.finished).toBe(true)
      expect(psB.targetResults.length).toBe(5) // D1-D5
      expect(psB.score).toBe(-3) // 27 - 2 - 4 - 6 - 8 - 10 = -3
      expect(psB.totalDarts).toBe(15) // 5 targets * 3 darts

      // Final scores in the match result
      expect(finalState.finished!.finalScores['a']).toBe(1287)
      expect(finalState.finished!.finalScores['b']).toBe(-3)
    })

    it('should eliminate Player B at D5 with score -3', () => {
      const config: Bobs27Config = { ...DEFAULT_CONFIG, allowNegative: false }
      const startEvent = makeMatchStartedEvent([playerA, playerB], config)
      const events: Bobs27Event[] = [startEvent]

      // Play through targets until B gets eliminated
      // We need to track elimination carefully
      const bScoreHistory: number[] = []

      for (let round = 0; round < 5; round++) {
        // Player A hits
        const { newEvents: aEvents } = throwTarget(events, 'a', true)
        events.push(...aEvents)

        // Player B misses
        const { newEvents: bEvents, lastResult: bResult } = throwTarget(events, 'b', false)
        events.push(...bEvents)

        if (bResult.targetFinished) {
          bScoreHistory.push(bResult.targetFinished.newScore)
        }

        if (bResult.targetFinished?.eliminated) break
      }

      // Verify score progression: 25, 21, 15, 7, -3
      expect(bScoreHistory).toEqual([25, 21, 15, 7, -3])

      const state = applyBobs27Events(events)
      expect(state.playerStates['b'].eliminated).toBe(true)
      expect(state.playerStates['b'].eliminatedAtTarget).toBe(4)
    })

    it('should have correct delta values for each target when missing', () => {
      const config: Bobs27Config = { ...DEFAULT_CONFIG, allowNegative: false }
      const startEvent = makeMatchStartedEvent([playerA, playerB], config)
      const events: Bobs27Event[] = [startEvent]

      for (let round = 0; round < 5; round++) {
        const { newEvents: aEvents } = throwTarget(events, 'a', true)
        events.push(...aEvents)

        const { newEvents: bEvents, lastResult } = throwTarget(events, 'b', false)
        events.push(...bEvents)
        if (lastResult.targetFinished?.eliminated) break
      }

      const state = applyBobs27Events(events)
      const bResults = state.playerStates['b'].targetResults

      // D1: delta = -2, D2: delta = -4, D3: delta = -6, D4: delta = -8, D5: delta = -10
      expect(bResults[0].delta).toBe(-2)
      expect(bResults[1].delta).toBe(-4)
      expect(bResults[2].delta).toBe(-6)
      expect(bResults[3].delta).toBe(-8)
      expect(bResults[4].delta).toBe(-10)
    })

    it('should have correct delta values for each target when hitting all 3', () => {
      const config: Bobs27Config = { ...DEFAULT_CONFIG, allowNegative: false }
      const startEvent = makeMatchStartedEvent([playerA, playerB], config)
      const events: Bobs27Event[] = [startEvent]

      // Play 3 rounds to check Player A's deltas
      for (let round = 0; round < 3; round++) {
        const { newEvents: aEvents } = throwTarget(events, 'a', true)
        events.push(...aEvents)

        const { newEvents: bEvents } = throwTarget(events, 'b', false)
        events.push(...bEvents)
      }

      const state = applyBobs27Events(events)
      const aResults = state.playerStates['a'].targetResults

      // D1: 3 hits * 2 = +6, D2: 3 hits * 4 = +12, D3: 3 hits * 6 = +18
      expect(aResults[0].delta).toBe(6)
      expect(aResults[1].delta).toBe(12)
      expect(aResults[2].delta).toBe(18)

      // Score after each: 33, 45, 63
      expect(aResults[0].scoreAfter).toBe(33)
      expect(aResults[1].scoreAfter).toBe(45)
      expect(aResults[2].scoreAfter).toBe(63)
    })
  })

  describe('Solo (1-Player) Elimination', () => {
    const soloPlayer: Bobs27Player = { playerId: 'solo', name: 'Solo Player' }

    it('should generate matchFinished when solo player is eliminated', () => {
      const config: Bobs27Config = { ...DEFAULT_CONFIG, allowNegative: false }
      const startEvent = makeMatchStartedEvent([soloPlayer], config)
      const events: Bobs27Event[] = [startEvent]

      let matchFinishedResult: Bobs27ThrowResult | null = null

      // Miss everything until eliminated
      // D1: -2, score=25
      // D2: -4, score=21
      // D3: -6, score=15
      // D4: -8, score=7
      // D5: -10, score=-3 → ELIMINATED
      for (let targetIdx = 0; targetIdx < 20; targetIdx++) {
        const { newEvents, lastResult } = throwTarget(events, 'solo', false)
        events.push(...newEvents)

        if (lastResult.matchFinished) {
          matchFinishedResult = lastResult
          break
        }
      }

      // matchFinished should be generated even for a solo elimination
      expect(matchFinishedResult).not.toBeNull()
      expect(matchFinishedResult!.matchFinished).toBeDefined()

      // The solo player is eliminated but is still the "winner" (only player)
      // Actually, they might be the winner since they're the only player
      // The engine sorts by progress desc then score desc, so the solo player is at index 0
      // However they are eliminated, the winner should still be set since there's only 1 player
      const winnerId = matchFinishedResult!.matchFinished!.winnerId
      expect(winnerId).toBe('solo')

      // Verify final state
      const finalState = applyBobs27Events(events)
      expect(finalState.finished).not.toBeNull()
      expect(finalState.finished!.winnerId).toBe('solo')
      expect(finalState.finished!.finalScores['solo']).toBe(-3)

      // Player was eliminated at D5
      const ps = finalState.playerStates['solo']
      expect(ps.eliminated).toBe(true)
      expect(ps.eliminatedAtTarget).toBe(4)
      expect(ps.finished).toBe(true)
      expect(ps.totalDarts).toBe(15) // 5 targets * 3 darts
    })

    it('should complete a solo game where the player survives all 20 targets', () => {
      const config: Bobs27Config = { ...DEFAULT_CONFIG, allowNegative: false }
      const startEvent = makeMatchStartedEvent([soloPlayer], config)
      const events: Bobs27Event[] = [startEvent]

      let matchFinishedResult: Bobs27ThrowResult | null = null

      // Hit everything for all 20 targets
      for (let targetIdx = 0; targetIdx < 20; targetIdx++) {
        const { newEvents, lastResult } = throwTarget(events, 'solo', true)
        events.push(...newEvents)

        if (lastResult.matchFinished) {
          matchFinishedResult = lastResult
          break
        }
      }

      expect(matchFinishedResult).not.toBeNull()
      expect(matchFinishedResult!.matchFinished).toBeDefined()
      expect(matchFinishedResult!.matchFinished!.winnerId).toBe('solo')

      const finalState = applyBobs27Events(events)
      expect(finalState.finished).not.toBeNull()
      expect(finalState.playerStates['solo'].eliminated).toBe(false)
      expect(finalState.playerStates['solo'].finished).toBe(true)
      expect(finalState.playerStates['solo'].targetResults.length).toBe(20)
      expect(finalState.playerStates['solo'].totalDarts).toBe(60)

      // Final score: 27 + 6*(1+2+...+20) = 27 + 6*210 = 1287
      expect(finalState.playerStates['solo'].score).toBe(1287)
    })
  })

  describe('2-Player Match: Both Players Eliminated', () => {
    const playerA: Bobs27Player = { playerId: 'a', name: 'Player A' }
    const playerB: Bobs27Player = { playerId: 'b', name: 'Player B' }

    it('should complete when both players are eliminated', () => {
      const config: Bobs27Config = { ...DEFAULT_CONFIG, allowNegative: false }
      const startEvent = makeMatchStartedEvent([playerA, playerB], config)
      const events: Bobs27Event[] = [startEvent]

      let matchFinishedResult: Bobs27ThrowResult | null = null
      let playerAEliminated = false
      let playerBEliminated = false

      // Both players miss everything.
      // Player A: D1(-2)=25, D2(-4)=21, D3(-6)=15, D4(-8)=7, D5(-10)=-3 → ELIMINATED
      // Player B: D1(-2)=25, D2(-4)=21, D3(-6)=15, D4(-8)=7, D5(-10)=-3 → ELIMINATED
      // They alternate, so A goes first, then B.
      // After A is eliminated at D5, B still needs to play their D5.

      for (let round = 0; round < 20; round++) {
        if (!playerAEliminated) {
          const { newEvents: aEvents, lastResult: aResult } = throwTarget(events, 'a', false)
          events.push(...aEvents)

          if (aResult.targetFinished?.eliminated) {
            playerAEliminated = true
          }
          if (aResult.matchFinished) {
            matchFinishedResult = aResult
            break
          }
        }

        if (!playerBEliminated) {
          const { newEvents: bEvents, lastResult: bResult } = throwTarget(events, 'b', false)
          events.push(...bEvents)

          if (bResult.targetFinished?.eliminated) {
            playerBEliminated = true
          }
          if (bResult.matchFinished) {
            matchFinishedResult = bResult
            break
          }
        }

        if (playerAEliminated && playerBEliminated) break
      }

      // Both should be eliminated
      expect(playerAEliminated).toBe(true)
      expect(playerBEliminated).toBe(true)

      // Match should be finished
      expect(matchFinishedResult).not.toBeNull()
      expect(matchFinishedResult!.matchFinished).toBeDefined()

      // Both eliminated at D5 with the same score → winnerId should be null (tie)
      expect(matchFinishedResult!.matchFinished!.winnerId).toBeNull()

      // Verify final state
      const finalState = applyBobs27Events(events)
      expect(finalState.finished).not.toBeNull()
      expect(finalState.finished!.winnerId).toBeNull()

      // Both players eliminated
      expect(finalState.playerStates['a'].eliminated).toBe(true)
      expect(finalState.playerStates['b'].eliminated).toBe(true)
      expect(finalState.playerStates['a'].score).toBe(-3)
      expect(finalState.playerStates['b'].score).toBe(-3)
      expect(finalState.playerStates['a'].eliminatedAtTarget).toBe(4)
      expect(finalState.playerStates['b'].eliminatedAtTarget).toBe(4)
    })

    it('should declare winner when one player survives longer', () => {
      // Player A: hits D1 (to survive longer), then misses the rest
      // Player B: misses everything
      //
      // Player A scores:
      //   D1: hit 3x → +6, score=33
      //   D2: miss → -4, score=29
      //   D3: miss → -6, score=23
      //   D4: miss → -8, score=15
      //   D5: miss → -10, score=5
      //   D6: miss → -12, score=-7 → ELIMINATED at D6 (index 5)
      //
      // Player B scores:
      //   D1: miss → -2, score=25
      //   D2: miss → -4, score=21
      //   D3: miss → -6, score=15
      //   D4: miss → -8, score=7
      //   D5: miss → -10, score=-3 → ELIMINATED at D5 (index 4)

      const config: Bobs27Config = { ...DEFAULT_CONFIG, allowNegative: false }
      const startEvent = makeMatchStartedEvent([playerA, playerB], config)
      const events: Bobs27Event[] = [startEvent]

      let matchFinishedResult: Bobs27ThrowResult | null = null
      let playerAEliminated = false
      let playerBEliminated = false

      for (let round = 0; round < 20; round++) {
        if (!playerAEliminated) {
          // Player A hits only on D1 (round 0), misses after
          const aHit = round === 0
          const { newEvents: aEvents, lastResult: aResult } = throwTarget(events, 'a', aHit)
          events.push(...aEvents)

          if (aResult.targetFinished?.eliminated) {
            playerAEliminated = true
          }
          if (aResult.matchFinished) {
            matchFinishedResult = aResult
            break
          }
        }

        if (!playerBEliminated) {
          const { newEvents: bEvents, lastResult: bResult } = throwTarget(events, 'b', false)
          events.push(...bEvents)

          if (bResult.targetFinished?.eliminated) {
            playerBEliminated = true
          }
          if (bResult.matchFinished) {
            matchFinishedResult = bResult
            break
          }
        }

        if (playerAEliminated && playerBEliminated) break
      }

      expect(matchFinishedResult).not.toBeNull()
      expect(matchFinishedResult!.matchFinished).toBeDefined()

      // Player A survived longer (eliminated at D6 vs D5)
      // The engine ranks by progress descending, so A wins
      expect(matchFinishedResult!.matchFinished!.winnerId).toBe('a')

      const finalState = applyBobs27Events(events)
      expect(finalState.finished!.winnerId).toBe('a')

      // Verify elimination points
      expect(finalState.playerStates['a'].eliminatedAtTarget).toBe(5) // D6
      expect(finalState.playerStates['b'].eliminatedAtTarget).toBe(4) // D5

      // Verify final scores
      expect(finalState.playerStates['a'].score).toBe(-7)
      expect(finalState.playerStates['b'].score).toBe(-3)
    })
  })

  describe('Edge Cases', () => {
    it('should track totalDarts correctly across the match', () => {
      const playerA: Bobs27Player = { playerId: 'a', name: 'Player A' }
      const playerB: Bobs27Player = { playerId: 'b', name: 'Player B' }
      const config: Bobs27Config = { ...DEFAULT_CONFIG, allowNegative: false }
      const startEvent = makeMatchStartedEvent([playerA, playerB], config)
      const events: Bobs27Event[] = [startEvent]

      // Play 2 full rounds (2 targets each)
      for (let round = 0; round < 2; round++) {
        const { newEvents: aEvents } = throwTarget(events, 'a', true)
        events.push(...aEvents)
        const { newEvents: bEvents } = throwTarget(events, 'b', false)
        events.push(...bEvents)
      }

      const state = applyBobs27Events(events)
      // Each player threw 2 targets * 3 darts = 6 darts
      expect(state.playerStates['a'].totalDarts).toBe(6)
      expect(state.playerStates['b'].totalDarts).toBe(6)
      expect(state.playerStates['a'].totalHits).toBe(6) // all hits
      expect(state.playerStates['b'].totalHits).toBe(0) // all misses
    })

    it('should handle the transition from active to eliminated player correctly', () => {
      // When player B is eliminated, player A should continue as the only active player
      const playerA: Bobs27Player = { playerId: 'a', name: 'Player A' }
      const playerB: Bobs27Player = { playerId: 'b', name: 'Player B' }
      const config: Bobs27Config = { ...DEFAULT_CONFIG, allowNegative: false }
      const startEvent = makeMatchStartedEvent([playerA, playerB], config)
      const events: Bobs27Event[] = [startEvent]

      // Play until B is eliminated (5 rounds of A hit, B miss)
      for (let round = 0; round < 5; round++) {
        const { newEvents: aEvents } = throwTarget(events, 'a', true)
        events.push(...aEvents)
        const { newEvents: bEvents } = throwTarget(events, 'b', false)
        events.push(...bEvents)
      }

      let state = applyBobs27Events(events)
      expect(state.playerStates['b'].eliminated).toBe(true)

      // Now Player A should still be the active player and continue alone
      // Player A is at target index 5 (D6)
      expect(state.playerStates['a'].currentTargetIndex).toBe(5)

      // Play A's next target (D6)
      const { newEvents } = throwTarget(events, 'a', true)
      events.push(...newEvents)

      state = applyBobs27Events(events)
      expect(state.playerStates['a'].currentTargetIndex).toBe(6)
      expect(state.playerStates['a'].targetResults.length).toBe(6)
    })

    it('should count match totalDarts in matchFinished event', () => {
      const soloPlayer: Bobs27Player = { playerId: 'solo', name: 'Solo' }
      const config: Bobs27Config = { ...DEFAULT_CONFIG, allowNegative: false }
      const startEvent = makeMatchStartedEvent([soloPlayer], config)
      const events: Bobs27Event[] = [startEvent]

      // Miss until eliminated at D5 (15 darts total)
      let matchResult: Bobs27ThrowResult | null = null
      for (let i = 0; i < 20; i++) {
        const { newEvents, lastResult } = throwTarget(events, 'solo', false)
        events.push(...newEvents)
        if (lastResult.matchFinished) {
          matchResult = lastResult
          break
        }
      }

      expect(matchResult).not.toBeNull()
      expect(matchResult!.matchFinished!.totalDarts).toBe(15)
    })
  })
})
