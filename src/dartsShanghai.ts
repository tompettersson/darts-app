// src/dartsShanghai.ts
// Shanghai Darts - Eigenstaendige Game Engine
// Felder 1-20, alle Spieler werfen auf die gleiche Zahl.
// Punkte: S=Feld×1, D=Feld×2, T=Feld×3 (nur Treffer auf aktuelle Zahl zaehlen).
// Shanghai-Regel: Wer in einer Runde S+D+T der aktuellen Zahl trifft, gewinnt sofort.
// Nach 20 Runden gewinnt wer die meisten Punkte hat. Draw moeglich.

import type {
  ShanghaiPlayer, ShanghaiDart, ShanghaiMatchConfig,
  ShanghaiStructure, ShanghaiEvent, ShanghaiState,
  ShanghaiMatchStartedEvent, ShanghaiLegStartedEvent, ShanghaiTurnAddedEvent,
  ShanghaiRoundFinishedEvent, ShanghaiLegFinishedEvent, ShanghaiSetFinishedEvent,
  ShanghaiMatchFinishedEvent,
} from './types/shanghai'

// Re-export aller Types fuer Convenience
export type {
  ShanghaiPlayer, ShanghaiDart, ShanghaiMatchConfig,
  ShanghaiStructure, ShanghaiEvent, ShanghaiState,
  ShanghaiMatchStartedEvent, ShanghaiLegStartedEvent, ShanghaiTurnAddedEvent,
  ShanghaiRoundFinishedEvent, ShanghaiLegFinishedEvent, ShanghaiSetFinishedEvent,
  ShanghaiMatchFinishedEvent,
}

// ===== Hilfsfunktionen =====

export function id(): string {
  return Math.random().toString(36).slice(2, 11)
}

export function now(): string {
  return new Date().toISOString()
}

export function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  const centis = Math.floor((ms % 1000) / 10)
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${centis.toString().padStart(2, '0')}`
}

export function formatDart(dart: ShanghaiDart): string {
  if (dart.target === 'MISS') return 'Miss'
  const prefix = dart.mult === 3 ? 'T' : dart.mult === 2 ? 'D' : 'S'
  return `${prefix}${dart.target}`
}

// ===== Score-Berechnung =====

/**
 * Berechnet den Score fuer einen Shanghai-Turn.
 * Nur Treffer auf das aktuelle Ziel (targetNumber) zaehlen.
 * S=Feld×1, D=Feld×2, T=Feld×3
 */
export function calculateShanghaiScore(darts: ShanghaiDart[], targetNumber: number): number {
  let score = 0
  for (const dart of darts) {
    if (dart.target === 'MISS') continue
    if (dart.target !== targetNumber) continue
    score += dart.mult * targetNumber
  }
  return score
}

/**
 * Prueft ob ein Spieler Shanghai erzielt hat:
 * Mindestens je 1× Single + Double + Triple auf das aktuelle Ziel.
 */
export function isShanghaiHit(darts: ShanghaiDart[], targetNumber: number): boolean {
  let hasSingle = false
  let hasDouble = false
  let hasTriple = false

  for (const dart of darts) {
    if (dart.target === 'MISS') continue
    if (dart.target !== targetNumber) continue
    if (dart.mult === 1) hasSingle = true
    if (dart.mult === 2) hasDouble = true
    if (dart.mult === 3) hasTriple = true
  }

  return hasSingle && hasDouble && hasTriple
}

// ===== Event Application =====

/**
 * Wendet Shanghai-Events an und berechnet den abgeleiteten State.
 */
export function applyShanghaiEvents(events: ShanghaiEvent[]): ShanghaiState {
  const state: ShanghaiState = {
    match: null,
    currentLegId: null,
    currentLegIndex: 0,
    currentSetIndex: 1,
    turnIndex: 0,
    startPlayerIndex: 0,
    startTime: 0,
    dartsUsedByPlayer: {},
    dartsUsedTotalByPlayer: {},
    legWinsByPlayer: {},
    setWinsByPlayer: {},
    totalLegWinsByPlayer: {},
    finished: null,
    events,
    shanghaiState: {
      currentRound: 1,
      scoreByPlayer: {},
      playersCompletedThisRound: [],
      currentRoundTurns: {},
    },
  }

  for (const event of events) {
    switch (event.type) {
      case 'ShanghaiMatchStarted': {
        state.match = {
          matchId: event.matchId,
          players: event.players,
          structure: event.structure,
          config: event.config,
        }
        for (const p of event.players) {
          state.dartsUsedByPlayer[p.playerId] = 0
          state.dartsUsedTotalByPlayer[p.playerId] = 0
          state.legWinsByPlayer[p.playerId] = 0
          state.setWinsByPlayer[p.playerId] = 0
          state.totalLegWinsByPlayer[p.playerId] = 0
          state.shanghaiState.scoreByPlayer[p.playerId] = 0
        }
        state.startTime = new Date(event.ts).getTime()
        break
      }

      case 'ShanghaiLegStarted': {
        state.currentLegId = event.legId
        state.currentLegIndex = event.legIndex
        if (event.setIndex !== undefined) {
          state.currentSetIndex = event.setIndex
        }
        // Reset fuer neues Leg
        if (state.match) {
          for (const p of state.match.players) {
            state.dartsUsedByPlayer[p.playerId] = 0
          }
          const playerCount = state.match.players.length
          state.startPlayerIndex = (event.legIndex - 1) % playerCount
          state.turnIndex = state.startPlayerIndex
        }
        // Shanghai-State fuer neues Leg zuruecksetzen
        if (state.match) {
          const scoreByPlayer: Record<string, number> = {}
          for (const p of state.match.players) {
            scoreByPlayer[p.playerId] = 0
          }
          state.shanghaiState = {
            currentRound: 1,
            scoreByPlayer,
            playersCompletedThisRound: [],
            currentRoundTurns: {},
          }
        }
        break
      }

      case 'ShanghaiTurnAdded': {
        state.dartsUsedByPlayer[event.playerId] =
          (state.dartsUsedByPlayer[event.playerId] ?? 0) + event.darts.length
        state.dartsUsedTotalByPlayer[event.playerId] =
          (state.dartsUsedTotalByPlayer[event.playerId] ?? 0) + event.darts.length

        // Score akkumulieren
        state.shanghaiState.scoreByPlayer[event.playerId] =
          (state.shanghaiState.scoreByPlayer[event.playerId] ?? 0) + event.turnScore

        // Turn in currentRoundTurns speichern
        state.shanghaiState.currentRoundTurns[event.playerId] = {
          darts: event.darts,
          score: event.turnScore,
          isShanghai: event.isShanghai,
        }
        if (!state.shanghaiState.playersCompletedThisRound.includes(event.playerId)) {
          state.shanghaiState.playersCompletedThisRound.push(event.playerId)
        }

        // Naechster Spieler
        if (state.match) {
          state.turnIndex = (state.turnIndex + 1) % state.match.players.length
        }
        break
      }

      case 'ShanghaiRoundFinished': {
        // Naechste Runde
        state.shanghaiState.currentRound = event.roundNumber + 1
        state.shanghaiState.currentRoundTurns = {}
        state.shanghaiState.playersCompletedThisRound = []

        // turnIndex auf Leg-Startspieler zuruecksetzen (gleicher Anwerfer im gesamten Leg)
        state.turnIndex = state.startPlayerIndex
        break
      }

      case 'ShanghaiLegFinished': {
        if (event.winnerId) {
          state.totalLegWinsByPlayer[event.winnerId] =
            (state.totalLegWinsByPlayer[event.winnerId] ?? 0) + 1
          state.legWinsByPlayer[event.winnerId] =
            (state.legWinsByPlayer[event.winnerId] ?? 0) + 1
        }
        break
      }

      case 'ShanghaiSetFinished': {
        state.setWinsByPlayer[event.winnerId] =
          (state.setWinsByPlayer[event.winnerId] ?? 0) + 1
        // Reset Leg-Wins fuer naechstes Set
        if (state.match) {
          for (const p of state.match.players) {
            state.legWinsByPlayer[p.playerId] = 0
          }
        }
        break
      }

      case 'ShanghaiMatchFinished': {
        state.finished = {
          winnerId: event.winnerId,
          totalDarts: event.totalDarts,
          durationMs: event.durationMs,
        }
        break
      }
    }
  }

  return state
}

// ===== State-Abfragen =====

/**
 * Gibt die playerId des aktiven Spielers zurueck.
 */
export function getActivePlayerId(state: ShanghaiState): string | null {
  if (!state.match || state.finished) return null
  return state.match.players[state.turnIndex]?.playerId ?? null
}

/**
 * Gibt die aktuelle Rundennummer (1-20) zurueck.
 */
export function getCurrentRound(state: ShanghaiState): number {
  return state.shanghaiState.currentRound
}

/**
 * Gibt die aktuelle Zielzahl zurueck (= Rundennummer).
 */
export function getTargetNumber(state: ShanghaiState): number {
  return state.shanghaiState.currentRound
}

// ===== Turn Recording =====

export type ShanghaiTurnResult = {
  turnEvent: ShanghaiTurnAddedEvent
  roundFinished?: ShanghaiRoundFinishedEvent
  legFinished?: ShanghaiLegFinishedEvent
  setFinished?: ShanghaiSetFinishedEvent
  matchFinished?: ShanghaiMatchFinishedEvent
  nextLegStart?: ShanghaiLegStartedEvent
}

/**
 * Erstellt ein ShanghaiLegStarted-Event.
 */
export function createShanghaiLegStartEvent(
  matchId: string,
  legIndex: number,
  setIndex?: number,
): ShanghaiLegStartedEvent {
  return {
    type: 'ShanghaiLegStarted',
    eventId: id(),
    matchId,
    ts: now(),
    legId: id(),
    legIndex,
    setIndex,
  }
}

/**
 * Nimmt einen Turn im Shanghai auf.
 * Hauptfunktion fuer die Spiellogik.
 */
export function recordShanghaiTurn(
  state: ShanghaiState,
  playerId: string,
  darts: ShanghaiDart[]
): ShanghaiTurnResult {
  if (!state.match) throw new Error('No match started')
  if (!state.currentLegId) throw new Error('No leg started')

  const currentRound = state.shanghaiState.currentRound
  const targetNumber = currentRound // Ziel = Rundennummer

  // Score berechnen
  const turnScore = calculateShanghaiScore(darts, targetNumber)

  // Shanghai pruefen
  const isShanghai = isShanghaiHit(darts, targetNumber)

  // Turn-Event erstellen
  const turnEvent: ShanghaiTurnAddedEvent = {
    type: 'ShanghaiTurnAdded',
    eventId: id(),
    matchId: state.match.matchId,
    legId: state.currentLegId,
    ts: now(),
    playerId,
    darts,
    turnScore,
    targetNumber,
    isShanghai,
  }

  const result: ShanghaiTurnResult = { turnEvent }

  // Shanghai? -> Sofort Leg beenden
  if (isShanghai) {
    // Temporaere Scores aktualisieren
    const finalScores = { ...state.shanghaiState.scoreByPlayer }
    finalScores[playerId] = (finalScores[playerId] ?? 0) + turnScore

    result.legFinished = {
      type: 'ShanghaiLegFinished',
      eventId: id(),
      matchId: state.match.matchId,
      legId: state.currentLegId,
      ts: now(),
      winnerId: playerId,
      finalScores,
      shanghaiWin: true,
    }

    return finishLegProgression(state, result, playerId, darts.length)
  }

  // Pruefe ob Runde komplett (alle Spieler haben geworfen)
  const tempPlayersCompleted = [...state.shanghaiState.playersCompletedThisRound, playerId]

  if (tempPlayersCompleted.length >= state.match.players.length) {
    // Scores sammeln
    const scoresByPlayer: Record<string, number> = {}
    const tempRoundTurns = {
      ...state.shanghaiState.currentRoundTurns,
      [playerId]: { darts, score: turnScore, isShanghai: false },
    }
    for (const [pid, turnData] of Object.entries(tempRoundTurns)) {
      scoresByPlayer[pid] = turnData.score
    }

    // Temporaere Gesamtscores
    const totalsByPlayer: Record<string, number> = { ...state.shanghaiState.scoreByPlayer }
    totalsByPlayer[playerId] = (totalsByPlayer[playerId] ?? 0) + turnScore

    result.roundFinished = {
      type: 'ShanghaiRoundFinished',
      eventId: id(),
      matchId: state.match.matchId,
      legId: state.currentLegId,
      ts: now(),
      roundNumber: currentRound,
      scoresByPlayer,
      totalsByPlayer,
    }

    // Runde 20 fertig? -> Leg beenden
    if (currentRound >= 20) {
      const finalScores = totalsByPlayer

      // Hoechsten Score finden
      const maxScore = Math.max(...Object.values(finalScores))
      const topPlayers = Object.entries(finalScores).filter(([_, s]) => s === maxScore)

      // Draw oder Gewinner?
      const legWinnerId = topPlayers.length === 1 ? topPlayers[0][0] : null

      result.legFinished = {
        type: 'ShanghaiLegFinished',
        eventId: id(),
        matchId: state.match.matchId,
        legId: state.currentLegId,
        ts: now(),
        winnerId: legWinnerId,
        finalScores,
        shanghaiWin: false,
      }

      return finishLegProgression(state, result, legWinnerId, darts.length)
    }
  }

  return result
}

/**
 * Verarbeitet Leg/Set/Match Progression nach einem LegFinished.
 */
function finishLegProgression(
  state: ShanghaiState,
  result: ShanghaiTurnResult,
  legWinnerId: string | null,
  currentDarts: number
): ShanghaiTurnResult {
  if (!state.match) return result

  // Bei Draw: Kein Leg-Win, aber wir muessen trotzdem pruefen ob Match-Ende
  // Bei Draw im Legs-Modus: Leg gilt nicht, aber Runden sind um -> ggf. neues Leg
  const structure = state.match.structure

  if (legWinnerId) {
    const newTotalLegWins = (state.totalLegWinsByPlayer[legWinnerId] ?? 0) + 1
    const newLegWins = (state.legWinsByPlayer[legWinnerId] ?? 0) + 1

    if (structure.kind === 'legs') {
      const targetLegs = Math.ceil(structure.bestOfLegs / 2)
      if (newTotalLegWins >= targetLegs) {
        const totalDarts = Object.values(state.dartsUsedTotalByPlayer)
          .reduce((a, b) => a + b, 0) + currentDarts
        const durationMs = Date.now() - state.startTime

        result.matchFinished = {
          type: 'ShanghaiMatchFinished',
          eventId: id(),
          matchId: state.match.matchId,
          ts: now(),
          winnerId: legWinnerId,
          totalDarts,
          durationMs,
        }
      } else {
        result.nextLegStart = createShanghaiLegStartEvent(
          state.match.matchId,
          state.currentLegIndex + 1,
        )
      }
    } else {
      // Sets-Modus
      const targetLegsPerSet = Math.ceil(structure.legsPerSet / 2)
      if (newLegWins >= targetLegsPerSet) {
        const newSetWins = (state.setWinsByPlayer[legWinnerId] ?? 0) + 1

        result.setFinished = {
          type: 'ShanghaiSetFinished',
          eventId: id(),
          matchId: state.match.matchId,
          ts: now(),
          setIndex: state.currentSetIndex,
          winnerId: legWinnerId,
        }

        const targetSets = Math.ceil(structure.bestOfSets / 2)
        if (newSetWins >= targetSets) {
          const totalDarts = Object.values(state.dartsUsedTotalByPlayer)
            .reduce((a, b) => a + b, 0) + currentDarts
          const durationMs = Date.now() - state.startTime

          result.matchFinished = {
            type: 'ShanghaiMatchFinished',
            eventId: id(),
            matchId: state.match.matchId,
            ts: now(),
            winnerId: legWinnerId,
            totalDarts,
            durationMs,
          }
        } else {
          result.nextLegStart = createShanghaiLegStartEvent(
            state.match.matchId,
            state.currentLegIndex + 1,
            state.currentSetIndex + 1,
          )
        }
      } else {
        result.nextLegStart = createShanghaiLegStartEvent(
          state.match.matchId,
          state.currentLegIndex + 1,
          state.currentSetIndex,
        )
      }
    }
  } else {
    // Draw: Neues Leg starten (niemand bekommt einen Leg-Win)
    if (structure.kind === 'legs') {
      // Bei Best of 1 und Draw: Match endet unentschieden
      if (structure.bestOfLegs === 1) {
        const totalDarts = Object.values(state.dartsUsedTotalByPlayer)
          .reduce((a, b) => a + b, 0) + currentDarts
        const durationMs = Date.now() - state.startTime

        result.matchFinished = {
          type: 'ShanghaiMatchFinished',
          eventId: id(),
          matchId: state.match.matchId,
          ts: now(),
          winnerId: null,
          totalDarts,
          durationMs,
        }
      } else {
        // Neues Leg (Draw zaehlt nicht als Leg-Win)
        result.nextLegStart = createShanghaiLegStartEvent(
          state.match.matchId,
          state.currentLegIndex + 1,
        )
      }
    } else {
      // Sets: Neues Leg im gleichen Set
      result.nextLegStart = createShanghaiLegStartEvent(
        state.match.matchId,
        state.currentLegIndex + 1,
        state.currentSetIndex,
      )
    }
  }

  return result
}
