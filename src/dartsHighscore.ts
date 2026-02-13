// src/dartsHighscore.ts
// Highscore – Trainingsspiel: Erreiche als Erster das Target (300-999 Punkte)
// Event-Sourced Engine (analog dartsStraeusschen.ts)

import type {
  HighscorePlayer,
  HighscoreStructure,
  HighscoreDart,
  HighscoreEvent,
  HighscoreMatchStartedEvent,
  HighscoreLegStartedEvent,
  HighscoreTurnAddedEvent,
  HighscoreLegFinishedEvent,
  HighscoreSetFinishedEvent,
  HighscoreMatchFinishedEvent,
  HighscoreState,
  computeDartValue,
} from './types/highscore'

export type {
  HighscorePlayer,
  HighscoreStructure,
  HighscoreDart,
  HighscoreEvent,
  HighscoreState,
}

// ============================================================================
// Helpers
// ============================================================================

let _counter = 0
export function id(): string {
  return `hs_${Date.now()}_${++_counter}_${Math.random().toString(36).slice(2, 8)}`
}

export function now(): string {
  return new Date().toISOString()
}

export function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000)
  const min = Math.floor(totalSec / 60)
  const sec = totalSec % 60
  return `${min}:${sec.toString().padStart(2, '0')}`
}

// ============================================================================
// State from Events
// ============================================================================

export function applyHighscoreEvents(events: HighscoreEvent[]): HighscoreState {
  const state: HighscoreState = {
    match: null,
    currentLegId: null,
    currentLegIndex: 0,
    currentSetIndex: 0,
    scoreByPlayer: {},
    dartsUsedByPlayer: {},
    dartsUsedTotalByPlayer: {},
    turnIndex: 0,
    currentPlayerIndex: 0,
    startPlayerIndex: 0,
    legWinsByPlayer: {},
    setWinsByPlayer: {},
    finished: null,
    events,
    startTimestamp: null,
  }

  for (const ev of events) {
    switch (ev.type) {
      case 'HighscoreMatchStarted': {
        state.match = {
          matchId: ev.matchId,
          players: ev.players,
          targetScore: ev.targetScore,
          structure: ev.structure,
        }
        state.startTimestamp = ev.timestamp
        for (const p of ev.players) {
          state.scoreByPlayer[p.id] = 0
          state.dartsUsedByPlayer[p.id] = 0
          state.dartsUsedTotalByPlayer[p.id] = 0
          state.legWinsByPlayer[p.id] = 0
          state.setWinsByPlayer[p.id] = 0
        }
        break
      }

      case 'HighscoreLegStarted': {
        state.currentLegId = ev.legId
        state.currentLegIndex = ev.legIndex
        if (ev.setIndex != null) state.currentSetIndex = ev.setIndex
        state.startPlayerIndex = ev.starterIndex
        state.currentPlayerIndex = ev.starterIndex
        state.turnIndex = 0
        // Reset scores und darts für neues Leg
        if (state.match) {
          for (const p of state.match.players) {
            state.scoreByPlayer[p.id] = 0
            state.dartsUsedByPlayer[p.id] = 0
          }
        }
        break
      }

      case 'HighscoreTurnAdded': {
        const dartsCount = ev.darts.length
        state.scoreByPlayer[ev.playerId] = ev.runningScore
        state.dartsUsedByPlayer[ev.playerId] = (state.dartsUsedByPlayer[ev.playerId] ?? 0) + dartsCount
        state.dartsUsedTotalByPlayer[ev.playerId] = (state.dartsUsedTotalByPlayer[ev.playerId] ?? 0) + dartsCount

        // Nächster Spieler (wenn kein Winning Turn)
        if (!ev.isWinningTurn && state.match) {
          state.currentPlayerIndex = (state.currentPlayerIndex + 1) % state.match.players.length
          state.turnIndex++
        }
        break
      }

      case 'HighscoreLegFinished': {
        state.legWinsByPlayer[ev.winnerId] = (state.legWinsByPlayer[ev.winnerId] ?? 0) + 1
        // Rotate start player
        if (state.match) {
          state.startPlayerIndex = (state.startPlayerIndex + 1) % state.match.players.length
        }
        break
      }

      case 'HighscoreSetFinished': {
        state.setWinsByPlayer[ev.winnerId] = (state.setWinsByPlayer[ev.winnerId] ?? 0) + 1
        // Reset leg wins for new set
        if (state.match) {
          for (const p of state.match.players) {
            state.legWinsByPlayer[p.id] = 0
          }
        }
        break
      }

      case 'HighscoreMatchFinished': {
        state.finished = {
          winnerId: ev.winnerId,
          totalDarts: ev.totalDarts,
          durationMs: ev.durationMs,
        }
        break
      }
    }
  }

  return state
}

// ============================================================================
// Turn Recording
// ============================================================================

export type HighscoreTurnResult = {
  turnEvent: HighscoreTurnAddedEvent
  legFinished?: HighscoreLegFinishedEvent
  setFinished?: HighscoreSetFinishedEvent
  matchFinished?: HighscoreMatchFinishedEvent
  nextLegStart?: HighscoreLegStartedEvent
}

export function recordHighscoreTurn(
  state: HighscoreState,
  playerId: string,
  darts: HighscoreDart[],
  durationMs?: number,
): HighscoreTurnResult {
  if (!state.match || !state.currentLegId) {
    throw new Error('No active match/leg')
  }

  const matchId = state.match.matchId
  const legId = state.currentLegId
  const targetScore = state.match.targetScore

  // Berechne Turn-Score und prüfe auf Gewinn
  let turnScore = 0
  let runningScore = state.scoreByPlayer[playerId] ?? 0
  let isWinningTurn = false
  let winningDartIndex: number | undefined

  // Darts einzeln durchgehen um Winning Dart zu finden
  const actualDarts: HighscoreDart[] = []
  for (let i = 0; i < darts.length; i++) {
    const dart = darts[i]
    turnScore += dart.value
    runningScore += dart.value
    actualDarts.push(dart)

    // Prüfe ob Target erreicht
    if (runningScore >= targetScore && !isWinningTurn) {
      isWinningTurn = true
      winningDartIndex = i
      // Spiel endet sofort - weitere Darts werden nicht geworfen
      break
    }
  }

  const dartIndex = (state.dartsUsedByPlayer[playerId] ?? 0)

  const turnEvent: HighscoreTurnAddedEvent = {
    type: 'HighscoreTurnAdded',
    playerId,
    darts: actualDarts,
    turnScore,
    runningScore,
    turnIndex: state.turnIndex,
    dartIndex,
    isWinningTurn,
    winningDartIndex,
    timestamp: Date.now(),
  }

  const result: HighscoreTurnResult = { turnEvent }

  // Wenn Leg gewonnen
  if (isWinningTurn) {
    const winnerId = playerId
    const winnerDarts = (state.dartsUsedByPlayer[playerId] ?? 0) + actualDarts.length

    // Rankings für alle Spieler erstellen
    const rankings = state.match.players.map((p, idx) => {
      const isWinner = p.id === playerId
      const finalScore = isWinner ? runningScore : (state.scoreByPlayer[p.id] ?? 0)
      const dartsThrown = isWinner ? winnerDarts : (state.dartsUsedByPlayer[p.id] ?? 0)

      return {
        playerId: p.id,
        playerName: p.name,
        finalScore,
        placement: isWinner ? 1 : idx + 2,  // Gewinner = 1, Rest nach Reihenfolge
        dartsThrown,
      }
    })

    // Rankings nach Score sortieren für korrekte Platzierung
    rankings.sort((a, b) => b.finalScore - a.finalScore)
    rankings.forEach((r, idx) => { r.placement = idx + 1 })

    result.legFinished = {
      type: 'HighscoreLegFinished',
      legId,
      winnerId,
      winnerDarts,
      winnerScore: runningScore,
      rankings,
      timestamp: Date.now(),
    }

    // Prüfe ob Match beendet ist
    const structure = state.match.structure
    const newLegWins = { ...state.legWinsByPlayer }
    newLegWins[winnerId] = (newLegWins[winnerId] ?? 0) + 1

    if (structure.kind === 'legs') {
      if (newLegWins[winnerId] >= structure.targetLegs) {
        const totalDarts = (state.dartsUsedTotalByPlayer[winnerId] ?? 0) + actualDarts.length
        result.matchFinished = {
          type: 'HighscoreMatchFinished',
          winnerId,
          totalDarts,
          durationMs: durationMs ?? (Date.now() - (state.startTimestamp ?? Date.now())),
          legWins: newLegWins,
          timestamp: Date.now(),
        }
      }
    } else {
      // Sets mode
      if (newLegWins[winnerId] >= structure.legsPerSet) {
        const newSetWins = { ...state.setWinsByPlayer }
        newSetWins[winnerId] = (newSetWins[winnerId] ?? 0) + 1

        result.setFinished = {
          type: 'HighscoreSetFinished',
          setIndex: state.currentSetIndex,
          winnerId,
          legWins: { ...newLegWins },
          timestamp: Date.now(),
        }

        if (newSetWins[winnerId] >= structure.targetSets) {
          const totalDarts = (state.dartsUsedTotalByPlayer[winnerId] ?? 0) + actualDarts.length
          result.matchFinished = {
            type: 'HighscoreMatchFinished',
            winnerId,
            totalDarts,
            durationMs: durationMs ?? (Date.now() - (state.startTimestamp ?? Date.now())),
            legWins: newLegWins,
            setWins: newSetWins,
            timestamp: Date.now(),
          }
        }
      }
    }

    // Neues Leg starten (wenn Match nicht beendet)
    if (!result.matchFinished) {
      const newLegIndex = state.currentLegIndex + 1
      const newSetIndex = result.setFinished ? state.currentSetIndex + 1 : state.currentSetIndex
      const newStarterIndex = (state.startPlayerIndex + 1) % state.match.players.length

      result.nextLegStart = {
        type: 'HighscoreLegStarted',
        legId: id(),
        legIndex: newLegIndex,
        setIndex: structure.kind === 'sets' ? newSetIndex : undefined,
        starterIndex: newStarterIndex,
        timestamp: Date.now(),
      }
    }
  }

  return result
}

// ============================================================================
// Utility Functions
// ============================================================================

export function getActivePlayerId(state: HighscoreState): string | null {
  if (!state.match || state.finished) return null
  const players = state.match.players
  if (players.length === 0) return null
  return players[state.currentPlayerIndex].id
}

export function getActivePlayer(state: HighscoreState): HighscorePlayer | null {
  const pid = getActivePlayerId(state)
  if (!pid || !state.match) return null
  return state.match.players.find(p => p.id === pid) ?? null
}

export function getPlayerScore(state: HighscoreState, playerId: string): number {
  return state.scoreByPlayer[playerId] ?? 0
}

export function getPlayerDarts(state: HighscoreState, playerId: string): number {
  return state.dartsUsedByPlayer[playerId] ?? 0
}

export function getPlayerProgress(state: HighscoreState, playerId: string): number {
  if (!state.match) return 0
  const score = state.scoreByPlayer[playerId] ?? 0
  return Math.min(100, (score / state.match.targetScore) * 100)
}

export function getRemainingScore(state: HighscoreState, playerId: string): number {
  if (!state.match) return 0
  const score = state.scoreByPlayer[playerId] ?? 0
  return Math.max(0, state.match.targetScore - score)
}

// ============================================================================
// Match Creation Helper
// ============================================================================

export function createHighscoreMatchStartedEvent(
  players: HighscorePlayer[],
  targetScore: number,
  structure: HighscoreStructure,
): HighscoreMatchStartedEvent {
  return {
    type: 'HighscoreMatchStarted',
    matchId: id(),
    players,
    targetScore,
    structure,
    timestamp: Date.now(),
  }
}

export function createHighscoreLegStartedEvent(
  legIndex: number = 0,
  setIndex?: number,
  starterIndex: number = 0,
): HighscoreLegStartedEvent {
  return {
    type: 'HighscoreLegStarted',
    legId: id(),
    legIndex,
    setIndex,
    starterIndex,
    timestamp: Date.now(),
  }
}

// ============================================================================
// Dart Value Calculation (re-export for convenience)
// ============================================================================

export { computeDartValue } from './types/highscore'
export { createHighscoreDart } from './types/highscore'
