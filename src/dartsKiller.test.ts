import { describe, it, expect } from 'vitest'
import {
  applyKillerEvents,
  recordKillerTurn,
  getActivePlayerId,
  defaultKillerConfig,
  defaultKillerStructure,
  id,
  now,
  formatDart,
  formatDuration,
  assignTargetsAuto,
} from './dartsKiller'
import type {
  KillerEvent,
  KillerPlayer,
  KillerDart,
  KillerMatchConfig,
  KillerMatchStartedEvent,
  KillerTargetsAssignedEvent,
  KillerState,
  KillerTurnResult,
} from './dartsKiller'

// ===== Helpers =====

const P1: KillerPlayer = { playerId: 'p1', name: 'Alice' }
const P2: KillerPlayer = { playerId: 'p2', name: 'Bob' }
const P3: KillerPlayer = { playerId: 'p3', name: 'Charlie' }

function makeMatchStarted(
  players: KillerPlayer[],
  config?: Partial<KillerMatchConfig>,
): KillerMatchStartedEvent {
  return {
    type: 'KillerMatchStarted',
    eventId: id(),
    matchId: 'match-1',
    ts: now(),
    players,
    config: { ...defaultKillerConfig(), ...config },
  }
}

function makeTargetsAssigned(
  assignments: { playerId: string; targetNumber: number }[],
): KillerTargetsAssignedEvent {
  return {
    type: 'KillerTargetsAssigned',
    eventId: id(),
    matchId: 'match-1',
    ts: now(),
    assignments,
  }
}

/** Shorthand: creates a dart hitting a specific number with given multiplier */
function dart(target: number | 'MISS', mult: 1 | 2 | 3 = 1): KillerDart {
  return { target, mult }
}

function miss(): KillerDart {
  return { target: 'MISS', mult: 1 }
}

/**
 * Sets up a standard 2-player match where both have targets assigned
 * and returns the base events.
 */
function setup2PlayerMatch(
  config?: Partial<KillerMatchConfig>,
  targets?: { p1: number; p2: number },
): KillerEvent[] {
  const t = targets ?? { p1: 5, p2: 10 }
  return [
    makeMatchStarted([P1, P2], config),
    makeTargetsAssigned([
      { playerId: 'p1', targetNumber: t.p1 },
      { playerId: 'p2', targetNumber: t.p2 },
    ]),
  ]
}

function setup3PlayerMatch(
  config?: Partial<KillerMatchConfig>,
): KillerEvent[] {
  return [
    makeMatchStarted([P1, P2, P3], config),
    makeTargetsAssigned([
      { playerId: 'p1', targetNumber: 5 },
      { playerId: 'p2', targetNumber: 10 },
      { playerId: 'p3', targetNumber: 15 },
    ]),
  ]
}

/**
 * Records a turn and appends all resulting events to the event array.
 * Returns the KillerTurnResult for further inspection.
 */
function playTurn(
  events: KillerEvent[],
  playerId: string,
  darts: KillerDart[],
): KillerTurnResult {
  const state = applyKillerEvents(events)
  const result = recordKillerTurn(state, playerId, darts)
  events.push(result.turnEvent)
  for (const elim of result.eliminationEvents) events.push(elim)
  if (result.legFinished) events.push(result.legFinished)
  if (result.setFinished) events.push(result.setFinished)
  if (result.matchFinished) events.push(result.matchFinished)
  return result
}

// ===== Tests =====

describe('Killer Engine', () => {

  // --- 1. Match Start ---

  describe('Match Start - Initial State', () => {
    it('should create correct initial state after MatchStarted', () => {
      const events: KillerEvent[] = [makeMatchStarted([P1, P2])]
      const state = applyKillerEvents(events)

      expect(state.matchId).toBe('match-1')
      expect(state.phase).toBe('qualifying')
      expect(state.players).toHaveLength(2)
      expect(state.playerOrder).toEqual(['p1', 'p2'])
      expect(state.turnIndex).toBe(0)
      expect(state.roundNumber).toBe(1)
      expect(state.winnerId).toBeNull()
    })

    it('should initialize all players with correct defaults', () => {
      const events: KillerEvent[] = [
        makeMatchStarted([P1, P2], { startingLives: 5 }),
      ]
      const state = applyKillerEvents(events)

      for (const ps of state.players) {
        expect(ps.targetNumber).toBeNull()
        expect(ps.qualifyingHits).toBe(0)
        expect(ps.isKiller).toBe(false)
        expect(ps.lives).toBe(5)
        expect(ps.isEliminated).toBe(false)
      }
    })

    it('should assign targets via TargetsAssigned event', () => {
      const events = setup2PlayerMatch()
      const state = applyKillerEvents(events)

      const p1state = state.players.find(p => p.playerId === 'p1')!
      const p2state = state.players.find(p => p.playerId === 'p2')!
      expect(p1state.targetNumber).toBe(5)
      expect(p2state.targetNumber).toBe(10)
    })
  })

  // --- 2. Qualifying Phase ---

  describe('Qualifying Phase', () => {
    it('should qualify a player who hits their number with a double', () => {
      const events = setup2PlayerMatch()
      const result = playTurn(events, 'p1', [dart(5, 2), miss(), miss()])

      expect(result.turnEvent.qualifyingHitsGained).toBe(1)
      expect(result.turnEvent.becameKiller).toBe(true)

      const state = applyKillerEvents(events)
      const p1 = state.players.find(p => p.playerId === 'p1')!
      expect(p1.isKiller).toBe(true)
      expect(p1.qualifyingHits).toBe(1)
    })

    it('should NOT qualify on a single (only double/triple counts)', () => {
      const events = setup2PlayerMatch()
      playTurn(events, 'p1', [dart(5, 1), dart(5, 1), dart(5, 1)])

      const state = applyKillerEvents(events)
      const p1 = state.players.find(p => p.playerId === 'p1')!
      expect(p1.isKiller).toBe(false)
      expect(p1.qualifyingHits).toBe(0)
    })

    it('should qualify with triple when qualifyingRing is TRIPLE', () => {
      const events = setup2PlayerMatch({ qualifyingRing: 'TRIPLE' })
      playTurn(events, 'p1', [dart(5, 3), miss(), miss()])

      const state = applyKillerEvents(events)
      const p1 = state.players.find(p => p.playerId === 'p1')!
      expect(p1.isKiller).toBe(true)
    })

    it('should NOT qualify with double when qualifyingRing is TRIPLE', () => {
      const events = setup2PlayerMatch({ qualifyingRing: 'TRIPLE' })
      playTurn(events, 'p1', [dart(5, 2), dart(5, 2), dart(5, 2)])

      const state = applyKillerEvents(events)
      const p1 = state.players.find(p => p.playerId === 'p1')!
      expect(p1.isKiller).toBe(false)
    })

    it('should require multiple hits when hitsToBecomeKiller > 1', () => {
      const events = setup2PlayerMatch({ hitsToBecomeKiller: 3 })

      // Turn 1: 2 qualifying hits
      playTurn(events, 'p1', [dart(5, 2), dart(5, 2), miss()])
      let state = applyKillerEvents(events)
      let p1 = state.players.find(p => p.playerId === 'p1')!
      expect(p1.qualifyingHits).toBe(2)
      expect(p1.isKiller).toBe(false)

      // P2 turn (skip)
      playTurn(events, 'p2', [miss(), miss(), miss()])

      // Turn 2: 1 more qualifying hit -> becomes killer
      playTurn(events, 'p1', [dart(5, 2), miss(), miss()])
      state = applyKillerEvents(events)
      p1 = state.players.find(p => p.playerId === 'p1')!
      expect(p1.qualifyingHits).toBe(3)
      expect(p1.isKiller).toBe(true)
    })

    it('should NOT count hits on wrong number during qualifying', () => {
      const events = setup2PlayerMatch()
      // P1's target is 5, but hits 10 (P2's target) with double
      playTurn(events, 'p1', [dart(10, 2), dart(10, 2), dart(10, 2)])

      const state = applyKillerEvents(events)
      const p1 = state.players.find(p => p.playerId === 'p1')!
      expect(p1.qualifyingHits).toBe(0)
      expect(p1.isKiller).toBe(false)
    })

    it('should transition phase to killing when first player qualifies', () => {
      const events = setup2PlayerMatch()

      // Phase starts as qualifying
      let state = applyKillerEvents(events)
      expect(state.phase).toBe('qualifying')

      // P1 qualifies
      playTurn(events, 'p1', [dart(5, 2), miss(), miss()])
      state = applyKillerEvents(events)
      expect(state.phase).toBe('killing')
    })

    it('should allow mid-turn killer activation and immediate kills', () => {
      const events = setup2PlayerMatch()

      // P2 qualifies first so there's an opponent to hit
      playTurn(events, 'p1', [miss(), miss(), miss()])
      playTurn(events, 'p2', [dart(10, 2), miss(), miss()])

      // P1 qualifies with first dart, then hits P2 with remaining darts
      const result = playTurn(events, 'p1', [dart(5, 2), dart(10, 2), dart(10, 2)])

      expect(result.turnEvent.becameKiller).toBe(true)
      expect(result.turnEvent.qualifyingHitsGained).toBe(1)
      // Should have hit P2 twice
      const p2Change = result.turnEvent.livesChanges.find(lc => lc.playerId === 'p2')
      expect(p2Change).toBeDefined()
      expect(p2Change!.delta).toBe(-2)
    })
  })

  // --- 3. Hitting Opponents ---

  describe('Hitting Opponents (Reducing Lives)', () => {
    it('should reduce opponent lives when hitting their number with a double', () => {
      const events = setup2PlayerMatch()

      // Both qualify
      playTurn(events, 'p1', [dart(5, 2), miss(), miss()])
      playTurn(events, 'p2', [dart(10, 2), miss(), miss()])

      // P1 hits P2's number (10) with double
      const result = playTurn(events, 'p1', [dart(10, 2), miss(), miss()])

      const p2Change = result.turnEvent.livesChanges.find(lc => lc.playerId === 'p2')
      expect(p2Change).toBeDefined()
      expect(p2Change!.delta).toBe(-1)
      expect(p2Change!.newLives).toBe(2) // 3 - 1

      const state = applyKillerEvents(events)
      expect(state.players.find(p => p.playerId === 'p2')!.lives).toBe(2)
    })

    it('should NOT reduce lives with a single hit (must be double/triple)', () => {
      const events = setup2PlayerMatch()

      // Both qualify
      playTurn(events, 'p1', [dart(5, 2), miss(), miss()])
      playTurn(events, 'p2', [dart(10, 2), miss(), miss()])

      // P1 hits P2's number with singles only
      playTurn(events, 'p1', [dart(10, 1), dart(10, 1), dart(10, 1)])

      const state = applyKillerEvents(events)
      expect(state.players.find(p => p.playerId === 'p2')!.lives).toBe(3) // unchanged
    })

    it('should handle multiple hits in one turn', () => {
      const events = setup2PlayerMatch()

      // Both qualify
      playTurn(events, 'p1', [dart(5, 2), miss(), miss()])
      playTurn(events, 'p2', [dart(10, 2), miss(), miss()])

      // P1 hits P2 three times with doubles
      const result = playTurn(events, 'p1', [dart(10, 2), dart(10, 2), dart(10, 2)])

      const p2Change = result.turnEvent.livesChanges.find(lc => lc.playerId === 'p2')
      expect(p2Change!.delta).toBe(-3)
      expect(p2Change!.newLives).toBe(0) // 3 - 3

      const state = applyKillerEvents(events)
      expect(state.players.find(p => p.playerId === 'p2')!.lives).toBe(0)
    })

    it('should hit with triples too', () => {
      const events = setup2PlayerMatch()

      // Both qualify
      playTurn(events, 'p1', [dart(5, 2), miss(), miss()])
      playTurn(events, 'p2', [dart(10, 2), miss(), miss()])

      // P1 hits P2's number with triple
      playTurn(events, 'p1', [dart(10, 3), miss(), miss()])

      const state = applyKillerEvents(events)
      expect(state.players.find(p => p.playerId === 'p2')!.lives).toBe(2)
    })
  })

  // --- 4. Self-Hits ---

  describe('Self-Hits', () => {
    it('should reduce own lives with friendlyFire enabled (default)', () => {
      const events = setup2PlayerMatch({ friendlyFire: true })

      // Both qualify
      playTurn(events, 'p1', [dart(5, 2), miss(), miss()])
      playTurn(events, 'p2', [dart(10, 2), miss(), miss()])

      // P1 hits own number (5) with double as killer
      const result = playTurn(events, 'p1', [dart(5, 2), miss(), miss()])

      const p1Change = result.turnEvent.livesChanges.find(lc => lc.playerId === 'p1')
      expect(p1Change).toBeDefined()
      expect(p1Change!.delta).toBe(-1)
      expect(p1Change!.newLives).toBe(2)
    })

    it('should NOT reduce own lives when friendlyFire is disabled', () => {
      const events = setup2PlayerMatch({ friendlyFire: false, selfHeal: false })

      // Both qualify
      playTurn(events, 'p1', [dart(5, 2), miss(), miss()])
      playTurn(events, 'p2', [dart(10, 2), miss(), miss()])

      // P1 hits own number as killer
      const result = playTurn(events, 'p1', [dart(5, 2), miss(), miss()])

      // No lives change for P1
      const p1Change = result.turnEvent.livesChanges.find(lc => lc.playerId === 'p1')
      expect(p1Change).toBeUndefined()

      const state = applyKillerEvents(events)
      expect(state.players.find(p => p.playerId === 'p1')!.lives).toBe(3)
    })

    it('should heal when selfHeal is enabled', () => {
      const events = setup2PlayerMatch({ selfHeal: true, startingLives: 2 })

      // Both qualify
      playTurn(events, 'p1', [dart(5, 2), miss(), miss()])
      playTurn(events, 'p2', [dart(10, 2), miss(), miss()])

      // P1 hits own number -> should heal +1
      const result = playTurn(events, 'p1', [dart(5, 2), miss(), miss()])

      const p1Change = result.turnEvent.livesChanges.find(lc => lc.playerId === 'p1')
      expect(p1Change).toBeDefined()
      expect(p1Change!.delta).toBe(1) // positive = heal
      expect(p1Change!.newLives).toBe(3) // 2 + 1
    })

    it('should not go below 0 lives with noNegativeLives enabled', () => {
      const events = setup2PlayerMatch({
        friendlyFire: true,
        noNegativeLives: true,
        startingLives: 1,
      })

      // Both qualify
      playTurn(events, 'p1', [dart(5, 2), miss(), miss()])
      playTurn(events, 'p2', [dart(10, 2), miss(), miss()])

      // P1 hits own number 3 times -> would be -3 but clamped to 0
      const result = playTurn(events, 'p1', [dart(5, 2), dart(5, 2), dart(5, 2)])

      const p1Change = result.turnEvent.livesChanges.find(lc => lc.playerId === 'p1')
      expect(p1Change!.newLives).toBe(0)
    })
  })

  // --- 5. Player Elimination ---

  describe('Player Elimination', () => {
    it('should eliminate a player when lives reach 0', () => {
      const events = setup2PlayerMatch({ startingLives: 1 })

      // Both qualify
      playTurn(events, 'p1', [dart(5, 2), miss(), miss()])
      playTurn(events, 'p2', [dart(10, 2), miss(), miss()])

      // P1 eliminates P2 with one double hit
      const result = playTurn(events, 'p1', [dart(10, 2), miss(), miss()])

      expect(result.turnEvent.eliminations).toContain('p2')
      expect(result.eliminationEvents).toHaveLength(1)
      expect(result.eliminationEvents[0].playerId).toBe('p2')
      expect(result.eliminationEvents[0].eliminatedBy).toBe('p1')

      const state = applyKillerEvents(events)
      expect(state.players.find(p => p.playerId === 'p2')!.isEliminated).toBe(true)
    })

    it('should eliminate via self-hit with friendlyFire', () => {
      const events = setup2PlayerMatch({ friendlyFire: true, startingLives: 1 })

      // Both qualify
      playTurn(events, 'p1', [dart(5, 2), miss(), miss()])
      playTurn(events, 'p2', [dart(10, 2), miss(), miss()])

      // P1 hits own number -> eliminates self
      const result = playTurn(events, 'p1', [dart(5, 2), miss(), miss()])

      expect(result.turnEvent.eliminations).toContain('p1')
    })

    it('should skip eliminated players in turn order', () => {
      const events = setup3PlayerMatch({ startingLives: 1 })

      // All qualify
      playTurn(events, 'p1', [dart(5, 2), miss(), miss()])
      playTurn(events, 'p2', [dart(10, 2), miss(), miss()])
      playTurn(events, 'p3', [dart(15, 2), miss(), miss()])

      // P1 eliminates P2
      playTurn(events, 'p1', [dart(10, 2), miss(), miss()])

      const state = applyKillerEvents(events)
      // After P1's turn, next active player should be P3 (P2 is eliminated)
      const activeId = getActivePlayerId(state)
      expect(activeId).toBe('p3')
    })
  })

  // --- 6. Win Condition ---

  describe('Win Condition', () => {
    it('should finish match when only one player remains', () => {
      const events = setup2PlayerMatch({ startingLives: 1 })

      // Both qualify
      playTurn(events, 'p1', [dart(5, 2), miss(), miss()])
      playTurn(events, 'p2', [dart(10, 2), miss(), miss()])

      // P1 eliminates P2
      const result = playTurn(events, 'p1', [dart(10, 2), miss(), miss()])

      expect(result.matchFinished).toBeDefined()
      expect(result.matchFinished!.winnerId).toBe('p1')
      expect(result.matchFinished!.finalStandings).toHaveLength(2)
      expect(result.matchFinished!.finalStandings[0].playerId).toBe('p1')
      expect(result.matchFinished!.finalStandings[0].position).toBe(1)
    })

    it('should declare correct winner in 3-player game', () => {
      const events = setup3PlayerMatch({ startingLives: 1 })

      // All qualify
      playTurn(events, 'p1', [dart(5, 2), miss(), miss()])
      playTurn(events, 'p2', [dart(10, 2), miss(), miss()])
      playTurn(events, 'p3', [dart(15, 2), miss(), miss()])

      // P1 eliminates P2
      playTurn(events, 'p1', [dart(10, 2), miss(), miss()])

      // P3 eliminates P1
      const result = playTurn(events, 'p3', [dart(5, 2), miss(), miss()])

      expect(result.matchFinished).toBeDefined()
      expect(result.matchFinished!.winnerId).toBe('p3')
    })

    it('should set phase to finished after match ends', () => {
      const events = setup2PlayerMatch({ startingLives: 1 })

      playTurn(events, 'p1', [dart(5, 2), miss(), miss()])
      playTurn(events, 'p2', [dart(10, 2), miss(), miss()])
      playTurn(events, 'p1', [dart(10, 2), miss(), miss()])

      const state = applyKillerEvents(events)
      expect(state.phase).toBe('finished')
      expect(state.winnerId).toBe('p1')
    })

    it('should return null active player after match is finished', () => {
      const events = setup2PlayerMatch({ startingLives: 1 })

      playTurn(events, 'p1', [dart(5, 2), miss(), miss()])
      playTurn(events, 'p2', [dart(10, 2), miss(), miss()])
      playTurn(events, 'p1', [dart(10, 2), miss(), miss()])

      const state = applyKillerEvents(events)
      expect(getActivePlayerId(state)).toBeNull()
    })

    it('should include totalDarts in matchFinished event', () => {
      const events = setup2PlayerMatch({ startingLives: 1 })

      playTurn(events, 'p1', [dart(5, 2), miss(), miss()])  // 3 darts
      playTurn(events, 'p2', [dart(10, 2), miss(), miss()]) // 3 darts
      const result = playTurn(events, 'p1', [dart(10, 2), miss(), miss()]) // 3 darts

      expect(result.matchFinished!.totalDarts).toBe(9)
    })

    it('should include final standings with correct positions and lives', () => {
      const events = setup3PlayerMatch({ startingLives: 2 })

      // All qualify
      playTurn(events, 'p1', [dart(5, 2), miss(), miss()])
      playTurn(events, 'p2', [dart(10, 2), miss(), miss()])
      playTurn(events, 'p3', [dart(15, 2), miss(), miss()])

      // P1 eliminates P3 (2 hits)
      playTurn(events, 'p1', [dart(15, 2), dart(15, 2), miss()])

      // P2 skips
      playTurn(events, 'p2', [miss(), miss(), miss()])

      // P1 eliminates P2 (2 hits)
      const result = playTurn(events, 'p1', [dart(10, 2), dart(10, 2), miss()])

      expect(result.matchFinished).toBeDefined()
      const standings = result.matchFinished!.finalStandings
      expect(standings).toHaveLength(3)

      // P1 won (position 1), P2 eliminated later (position 2), P3 eliminated first (position 3)
      const p1standing = standings.find(s => s.playerId === 'p1')!
      const p2standing = standings.find(s => s.playerId === 'p2')!
      const p3standing = standings.find(s => s.playerId === 'p3')!

      expect(p1standing.position).toBe(1)
      expect(p2standing.position).toBe(2)
      expect(p3standing.position).toBe(3)
    })
  })

  // --- 7. Edge Cases ---

  describe('Edge Cases', () => {
    it('should track dartsUsedByPlayer correctly', () => {
      const events = setup2PlayerMatch()

      playTurn(events, 'p1', [dart(5, 2), miss(), miss()])
      playTurn(events, 'p2', [miss(), miss(), miss()])
      playTurn(events, 'p1', [miss(), miss(), miss()])

      const state = applyKillerEvents(events)
      expect(state.dartsUsedByPlayer['p1']).toBe(6)
      expect(state.dartsUsedByPlayer['p2']).toBe(3)
    })

    it('should advance turn correctly between players', () => {
      const events = setup2PlayerMatch()

      let state = applyKillerEvents(events)
      expect(getActivePlayerId(state)).toBe('p1')

      playTurn(events, 'p1', [miss(), miss(), miss()])
      state = applyKillerEvents(events)
      expect(getActivePlayerId(state)).toBe('p2')

      playTurn(events, 'p2', [miss(), miss(), miss()])
      state = applyKillerEvents(events)
      expect(getActivePlayerId(state)).toBe('p1')
    })

    it('should handle all misses gracefully', () => {
      const events = setup2PlayerMatch()

      playTurn(events, 'p1', [miss(), miss(), miss()])

      const state = applyKillerEvents(events)
      const p1 = state.players.find(p => p.playerId === 'p1')!
      expect(p1.qualifyingHits).toBe(0)
      expect(p1.isKiller).toBe(false)
      expect(p1.lives).toBe(3) // unchanged
    })

    it('should throw error when recording turn for eliminated player', () => {
      const events = setup2PlayerMatch({ startingLives: 1 })

      playTurn(events, 'p1', [dart(5, 2), miss(), miss()])
      playTurn(events, 'p2', [dart(10, 2), miss(), miss()])
      // P1 eliminates P2
      playTurn(events, 'p1', [dart(10, 2), miss(), miss()])

      // Remove the matchFinished event so the match isn't over for the state
      // but P2 is still eliminated
      const stateWithEliminated = applyKillerEvents(
        events.filter(e => e.type !== 'KillerMatchFinished' && e.type !== 'KillerLegFinished')
      )

      expect(() => {
        recordKillerTurn(stateWithEliminated, 'p2', [miss(), miss(), miss()])
      }).toThrow('Player is eliminated')
    })

    it('should throw error for unknown player', () => {
      const events = setup2PlayerMatch()
      const state = applyKillerEvents(events)

      expect(() => {
        recordKillerTurn(state, 'unknown', [miss(), miss(), miss()])
      }).toThrow('Player not found')
    })

    it('should handle hitting number that belongs to no player', () => {
      const events = setup2PlayerMatch()

      // Both qualify
      playTurn(events, 'p1', [dart(5, 2), miss(), miss()])
      playTurn(events, 'p2', [dart(10, 2), miss(), miss()])

      // P1 hits number 20 (not assigned to anyone) with double
      const result = playTurn(events, 'p1', [dart(20, 2), dart(20, 2), dart(20, 2)])

      expect(result.turnEvent.livesChanges).toHaveLength(0)
      expect(result.turnEvent.eliminations).toHaveLength(0)
    })

    it('should log qualifying and killer events', () => {
      const events = setup2PlayerMatch()

      playTurn(events, 'p1', [dart(5, 2), miss(), miss()])

      const state = applyKillerEvents(events)
      // Should have match started log + targets assigned log + qualifying log + killer log
      const qualifyingLogs = state.log.filter(l => l.type === 'qualifying')
      const infoLogs = state.log.filter(l => l.type === 'info')
      expect(qualifyingLogs.length).toBeGreaterThanOrEqual(1)
      expect(infoLogs.length).toBeGreaterThanOrEqual(2) // match started + targets assigned + killer status
    })

    it('should handle simultaneous elimination of multiple players in one turn', () => {
      // P1 targets both P2 and P3 in one turn
      const events = setup3PlayerMatch({ startingLives: 1 })

      // All qualify
      playTurn(events, 'p1', [dart(5, 2), miss(), miss()])
      playTurn(events, 'p2', [dart(10, 2), miss(), miss()])
      playTurn(events, 'p3', [dart(15, 2), miss(), miss()])

      // P1 hits P2 and P3 in one turn
      const result = playTurn(events, 'p1', [dart(10, 2), dart(15, 2), miss()])

      expect(result.turnEvent.eliminations).toContain('p2')
      expect(result.turnEvent.eliminations).toContain('p3')
      expect(result.matchFinished).toBeDefined()
      expect(result.matchFinished!.winnerId).toBe('p1')
    })
  })

  // --- Utility Functions ---

  describe('Utility Functions', () => {
    it('formatDart should format darts correctly', () => {
      expect(formatDart({ target: 'MISS', mult: 1 })).toBe('Miss')
      expect(formatDart({ target: 20, mult: 1 })).toBe('S20')
      expect(formatDart({ target: 20, mult: 2 })).toBe('D20')
      expect(formatDart({ target: 20, mult: 3 })).toBe('T20')
    })

    it('formatDuration should format milliseconds correctly', () => {
      expect(formatDuration(0)).toBe('00:00.00')
      expect(formatDuration(61500)).toBe('01:01.50')
      expect(formatDuration(3723450)).toBe('62:03.45')
    })

    it('assignTargetsAuto should assign unique numbers 1-20', () => {
      const players = [P1, P2, P3]
      const assignments = assignTargetsAuto(players)

      expect(assignments).toHaveLength(3)
      const numbers = assignments.map(a => a.targetNumber)
      // All unique
      expect(new Set(numbers).size).toBe(3)
      // All in range 1-20
      for (const n of numbers) {
        expect(n).toBeGreaterThanOrEqual(1)
        expect(n).toBeLessThanOrEqual(20)
      }
    })

    it('defaultKillerConfig should return sensible defaults', () => {
      const config = defaultKillerConfig()
      expect(config.hitsToBecomeKiller).toBe(1)
      expect(config.qualifyingRing).toBe('DOUBLE')
      expect(config.startingLives).toBe(3)
      expect(config.friendlyFire).toBe(true)
      expect(config.selfHeal).toBe(false)
      expect(config.noNegativeLives).toBe(true)
    })
  })
})
