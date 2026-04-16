// src/dartsCaptureTheField.ts
// Capture the Field - Eigenstaendige Game Engine
// Alle Spieler werfen 3 Darts auf das gleiche Feld.
// Wer die meisten Punkte erzielt, erobert das Feld (3 Feldpunkte).
// Gleichstand auf einem Feld: je 1 Feldpunkt fuer die Gleichauf-Spieler.
// Nach allen 21 Feldern (1-20 + Bull) gewinnt, wer die meisten Feldpunkte hat.
// Tiebreaker: Gesamt-Wurfpunkte.

import type {
  CTFPlayer, CTFDart, CTFTarget, CTFMultiplierMode, CTFMatchConfig,
  CTFStructure, CTFEvent, CTFState, CTFSequenceMode,
  CTFMatchStartedEvent, CTFLegStartedEvent, CTFTurnAddedEvent,
  CTFRoundFinishedEvent, CTFLegFinishedEvent, CTFSetFinishedEvent,
  CTFMatchFinishedEvent,
} from './types/captureTheField'

// Re-export aller Types fuer Convenience
export type {
  CTFPlayer, CTFDart, CTFTarget, CTFMultiplierMode, CTFMatchConfig,
  CTFStructure, CTFEvent, CTFState, CTFSequenceMode,
  CTFMatchStartedEvent, CTFLegStartedEvent, CTFTurnAddedEvent,
  CTFRoundFinishedEvent, CTFLegFinishedEvent, CTFSetFinishedEvent,
  CTFMatchFinishedEvent,
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

export function formatTarget(target: number | 'BULL'): string {
  return target === 'BULL' ? 'Bull' : String(target)
}

export function formatDart(dart: CTFDart): string {
  if (dart.target === 'MISS') return 'Miss'
  if (dart.target === 'BULL') {
    return dart.mult === 2 ? 'DBull' : 'Bull'
  }
  const prefix = dart.mult === 3 ? 'T' : dart.mult === 2 ? 'D' : 'S'
  return `${prefix}${dart.target}`
}

// ===== Sequenz-Generierung =====

// Dartboard im Uhrzeigersinn ab 1
const CLOCKWISE_FROM_1: number[] = [1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5, 20]

// Dartboard gegen den Uhrzeigersinn ab 20
const COUNTERCLOCKWISE_FROM_20: number[] = [20, 5, 12, 9, 14, 11, 8, 16, 7, 19, 3, 17, 2, 15, 10, 6, 13, 4, 18, 1]

/**
 * Generiert die Ziel-Sequenz fuer Capture the Field.
 * 5 Feldfolge-Modi + Bull-Position.
 */
export function generateCTFSequence(
  bullPosition?: 'start' | 'end' | 'random',
  sequenceMode?: CTFSequenceMode
): CTFTarget[] {
  const mode = sequenceMode ?? 'ascending'
  let numbers: number[]

  switch (mode) {
    case 'ascending':
      numbers = Array.from({ length: 20 }, (_, i) => i + 1)
      break
    case 'descending':
      numbers = Array.from({ length: 20 }, (_, i) => 20 - i)
      break
    case 'clockwise':
      numbers = [...CLOCKWISE_FROM_1]
      break
    case 'counterclockwise':
      numbers = [...COUNTERCLOCKWISE_FROM_20]
      break
    case 'random': {
      numbers = Array.from({ length: 20 }, (_, i) => i + 1)
      // Fisher-Yates shuffle
      for (let i = numbers.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [numbers[i], numbers[j]] = [numbers[j], numbers[i]]
      }
      break
    }
  }

  const position = bullPosition ?? 'end'
  const targets: CTFTarget[] = numbers.map(n => ({ number: n }))

  switch (position) {
    case 'start':
      return [{ number: 'BULL' }, ...targets]
    case 'end':
      return [...targets, { number: 'BULL' }]
    case 'random': {
      const bullIndex = Math.floor(Math.random() * (targets.length + 1))
      targets.splice(bullIndex, 0, { number: 'BULL' })
      return targets
    }
  }
}

// ===== Event Application =====

/**
 * Wendet CTF-Events an und berechnet den abgeleiteten State.
 */
export function applyCTFEvents(events: CTFEvent[]): CTFState {
  const state: CTFState = {
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
    captureState: {
      currentFieldIndex: 0,
      fieldWinners: {},
      totalScoreByPlayer: {},
      totalFieldPointsByPlayer: {},
      currentRoundTurns: {},
      playersCompletedThisRound: [],
    },
  }

  for (const event of events) {
    switch (event.type) {
      case 'CTFMatchStarted': {
        state.match = {
          matchId: event.matchId,
          players: event.players,
          structure: event.structure,
          config: event.config,
          sequence: [...event.generatedSequence],
        }
        // Alle Spieler initialisieren
        for (const p of event.players) {
          state.dartsUsedByPlayer[p.playerId] = 0
          state.dartsUsedTotalByPlayer[p.playerId] = 0
          state.legWinsByPlayer[p.playerId] = 0
          state.setWinsByPlayer[p.playerId] = 0
          state.totalLegWinsByPlayer[p.playerId] = 0
          state.captureState.totalScoreByPlayer[p.playerId] = 0
          state.captureState.totalFieldPointsByPlayer[p.playerId] = 0
        }
        state.startTime = new Date(event.ts).getTime()
        break
      }

      case 'CTFLegStarted': {
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
          // Leg-Rotation: Startspieler rotiert pro Leg
          const playerCount = state.match.players.length
          state.startPlayerIndex = event.legIndex % playerCount
          state.turnIndex = state.startPlayerIndex

          // Neue Sequenz uebernehmen falls vorhanden
          if (event.newSequence) {
            state.match.sequence = [...event.newSequence]
          }
        }
        // Capture-State fuer neues Leg zuruecksetzen
        if (state.match) {
          const totalScoreByPlayer: Record<string, number> = {}
          const totalFieldPointsByPlayer: Record<string, number> = {}
          for (const p of state.match.players) {
            totalScoreByPlayer[p.playerId] = 0
            totalFieldPointsByPlayer[p.playerId] = 0
          }
          state.captureState = {
            currentFieldIndex: 0,
            fieldWinners: {},
            totalScoreByPlayer,
            totalFieldPointsByPlayer,
            currentRoundTurns: {},
            playersCompletedThisRound: [],
          }
        }
        break
      }

      case 'CTFTurnAdded': {
        // Darts zaehlen
        state.dartsUsedByPlayer[event.playerId] =
          (state.dartsUsedByPlayer[event.playerId] ?? 0) + event.darts.length
        state.dartsUsedTotalByPlayer[event.playerId] =
          (state.dartsUsedTotalByPlayer[event.playerId] ?? 0) + event.darts.length

        // Turn in currentRoundTurns speichern
        state.captureState.currentRoundTurns[event.playerId] = {
          darts: event.darts,
          score: event.captureScore,
        }
        if (!state.captureState.playersCompletedThisRound.includes(event.playerId)) {
          state.captureState.playersCompletedThisRound.push(event.playerId)
        }

        // Naechster Spieler
        if (state.match) {
          state.turnIndex = (state.turnIndex + 1) % state.match.players.length
        }
        break
      }

      case 'CTFRoundFinished': {
        // Feld-Gewinner speichern
        const fieldKey = String(event.fieldNumber)
        state.captureState.fieldWinners[fieldKey] = event.winnerId

        // Gesamtpunkte aktualisieren
        for (const [playerId, score] of Object.entries(event.scoresByPlayer)) {
          state.captureState.totalScoreByPlayer[playerId] =
            (state.captureState.totalScoreByPlayer[playerId] ?? 0) + score
        }

        // Feldpunkte akkumulieren (Rueckwaertskompatibel: aus Event oder berechnen)
        const fp = event.fieldPoints ?? calculateFieldPoints(event.scoresByPlayer, event.winnerId)
        for (const [playerId, pts] of Object.entries(fp)) {
          state.captureState.totalFieldPointsByPlayer[playerId] =
            (state.captureState.totalFieldPointsByPlayer[playerId] ?? 0) + pts
        }

        // Naechstes Feld
        state.captureState.currentFieldIndex = event.fieldIndex + 1
        state.captureState.currentRoundTurns = {}
        state.captureState.playersCompletedThisRound = []

        // Retry-Logik: Bei 0-Draw und aktiver Option, Feld vor Bull einfuegen
        if (state.match?.config?.retryZeroDrawFields && event.winnerId === null) {
          const maxScore = Math.max(...Object.values(event.scoresByPlayer))
          if (maxScore === 0) {
            const seq = state.match.sequence
            const nextIdx = state.captureState.currentFieldIndex
            // Bull-Feld finden (noch nicht gespielt)
            const bullIdx = seq.findIndex((t, i) => i >= nextIdx && t.number === 'BULL')
            if (bullIdx >= 0) {
              seq.splice(bullIdx, 0, { number: event.fieldNumber })
            } else {
              seq.push({ number: event.fieldNumber })
            }
          }
        }

        // turnIndex zuruecksetzen (ggf. mit Rotation)
        if (state.match?.config?.rotateOrder) {
          state.turnIndex = (state.startPlayerIndex + event.fieldIndex + 1) % state.match.players.length
        } else {
          state.turnIndex = 0
        }
        break
      }

      case 'CTFLegFinished': {
        state.totalLegWinsByPlayer[event.winnerId] =
          (state.totalLegWinsByPlayer[event.winnerId] ?? 0) + 1
        state.legWinsByPlayer[event.winnerId] =
          (state.legWinsByPlayer[event.winnerId] ?? 0) + 1
        break
      }

      case 'CTFSetFinished': {
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

      case 'CTFMatchFinished': {
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

// ===== Score-Berechnung =====

/**
 * Berechnet den Score fuer einen Capture the Field-Turn.
 * Nur Treffer auf das aktuelle Ziel (targetNumber) zaehlen.
 */
export function calculateCaptureScore(
  darts: CTFDart[],
  targetNumber: number | 'BULL',
  multiplierMode: CTFMultiplierMode
): number {
  let score = 0
  for (const dart of darts) {
    if (dart.target === 'MISS') continue
    // Loose comparison: after JSON roundtrip, target may be string "14" instead of number 14
    // eslint-disable-next-line eqeqeq
    if (dart.target != targetNumber) continue

    const mult = Number(dart.mult) || 1
    switch (multiplierMode) {
      case 'standard':
        score += mult // T=3, D=2, S=1
        break
      case 'standard2':
        score += mult === 1 ? 1 : 2 // T=2, D=2, S=1
        break
      case 'single':
        score += 1 // Alle = 1
        break
    }
  }
  return score
}

// ===== Feld-Punkte Berechnung =====

/**
 * Berechnet Feldpunkte fuer eine Runde.
 * Gewinner: 3 Punkte.
 * Draw (hoechster Score geteilt, mindestens 1 Treffer): 1 Punkt.
 * Alle 0 (keiner hat getroffen): 0 Punkte fuer alle.
 * Verlierer: 0 Punkte.
 */
export function calculateFieldPoints(
  scoresByPlayer: Record<string, number>,
  winnerId: string | null
): Record<string, number> {
  const points: Record<string, number> = {}
  if (winnerId) {
    for (const pid of Object.keys(scoresByPlayer)) {
      points[pid] = pid === winnerId ? 3 : 0
    }
  } else {
    const maxScore = Math.max(...Object.values(scoresByPlayer))
    for (const [pid, score] of Object.entries(scoresByPlayer)) {
      // Nur 1 Punkt bei Draw, wenn mindestens ein Treffer (maxScore > 0)
      points[pid] = (score === maxScore && maxScore > 0) ? 1 : 0
    }
  }
  return points
}

// ===== Runden-Logik =====

/**
 * Prueft ob eine Capture the Field-Runde abgeschlossen ist (alle haben geworfen).
 */
export function isCaptureRoundComplete(state: CTFState): boolean {
  if (!state.match) return false
  return state.captureState.playersCompletedThisRound.length >= state.match.players.length
}

/**
 * Ermittelt den Gewinner einer Capture the Field-Runde.
 * Hoechster Score gewinnt. Bei Gleichstand: null (keiner gewinnt).
 */
export function determineCaptureRoundWinner(
  scoresByPlayer: Record<string, number>
): string | null {
  const entries = Object.entries(scoresByPlayer)
  if (entries.length === 0) return null

  // Hoechsten Score finden
  const maxScore = Math.max(...entries.map(([_, score]) => score))
  const winners = entries.filter(([_, score]) => score === maxScore)

  // Bei Gleichstand: null (keiner gewinnt das Feld)
  if (winners.length !== 1) return null

  return winners[0][0]
}

/**
 * Ermittelt den Gesamtgewinner eines Capture the Field-Legs.
 * Primaer: Feldpunkte (3=Sieg, 1=Draw, 0=Verloren).
 * Sekundaer (Tiebreaker): Gesamt-Wurfpunkte.
 * Bei totalem Gleichstand: erster Spieler mit hoechstem Score.
 */
export function determineCaptureLegWinner(state: CTFState): string | null {
  if (!state.match) return null

  const fieldPoints = state.captureState.totalFieldPointsByPlayer

  // Hoechste Feldpunkte finden
  const maxPoints = Math.max(...Object.values(fieldPoints))
  const topPlayers = Object.entries(fieldPoints).filter(([_, pts]) => pts === maxPoints)

  // Eindeutiger Gewinner
  if (topPlayers.length === 1) {
    return topPlayers[0][0]
  }

  // Tiebreaker: Gesamt-Wurfpunkte
  let highestScore = -1
  let winner: string | null = null
  for (const [playerId] of topPlayers) {
    const score = state.captureState.totalScoreByPlayer[playerId] ?? 0
    if (score > highestScore) {
      highestScore = score
      winner = playerId
    } else if (score === highestScore) {
      winner = null
    }
  }

  return winner
}

// ===== State-Abfragen =====

/**
 * Gibt die playerId des aktiven Spielers zurueck.
 */
export function getActivePlayerId(state: CTFState): string | null {
  if (!state.match || state.finished) return null
  return state.match.players[state.turnIndex]?.playerId ?? null
}

/**
 * Gibt das aktuelle Ziel in der Sequenz zurueck.
 */
export function getCurrentTarget(state: CTFState): CTFTarget | null {
  if (!state.match) return null
  const idx = state.captureState.currentFieldIndex
  if (idx >= state.match.sequence.length) return null
  return state.match.sequence[idx]
}

/**
 * Gibt die Gesamtlaenge der Sequenz zurueck.
 */
export function getSequenceLength(state: CTFState): number {
  if (!state.match) return 0
  return state.match.sequence.length
}

// ===== Turn Recording =====

export type CTFTurnResult = {
  turnEvent: CTFTurnAddedEvent
  roundFinished?: CTFRoundFinishedEvent
  legFinished?: CTFLegFinishedEvent
  setFinished?: CTFSetFinishedEvent
  matchFinished?: CTFMatchFinishedEvent
  nextLegStart?: CTFLegStartedEvent
}

/**
 * Erstellt ein CTFLegStarted-Event.
 * Bei bullPosition 'random' wird eine neue Sequenz generiert.
 */
export function createCTFLegStartEvent(
  matchId: string,
  legIndex: number,
  setIndex?: number,
  config?: CTFMatchConfig
): CTFLegStartedEvent {
  // Immer neue zufaellige Sequenz fuer jedes neue Leg generieren
  // damit die Zahlenreihenfolge sich bei jedem Leg aendert
  let newSequence: CTFTarget[] | undefined = undefined
  if (config) {
    newSequence = generateCTFSequence(config.bullPosition, 'random')
  }

  return {
    type: 'CTFLegStarted',
    eventId: id(),
    matchId,
    ts: now(),
    legId: id(),
    legIndex,
    setIndex,
    newSequence,
  }
}

/**
 * Nimmt einen Turn im Capture the Field auf.
 * Hauptfunktion fuer die Spiellogik.
 */
export function recordCTFTurn(
  state: CTFState,
  playerId: string,
  darts: CTFDart[]
): CTFTurnResult {
  if (!state.match) throw new Error('No match started')
  if (!state.currentLegId) throw new Error('No leg started')

  const config = state.match.config
  const currentFieldIndex = state.captureState.currentFieldIndex
  const sequence = state.match.sequence

  if (currentFieldIndex >= sequence.length) {
    throw new Error('All fields completed')
  }

  const currentTarget = sequence[currentFieldIndex]
  const targetNumber = currentTarget.number

  // Score berechnen
  const captureScore = calculateCaptureScore(darts, targetNumber, config.multiplierMode)

  // Turn-Event erstellen
  const turnEvent: CTFTurnAddedEvent = {
    type: 'CTFTurnAdded',
    eventId: id(),
    matchId: state.match.matchId,
    legId: state.currentLegId,
    ts: now(),
    playerId,
    darts,
    captureScore,
  }

  const result: CTFTurnResult = { turnEvent }

  // State temporaer aktualisieren fuer Pruefungen
  const tempPlayersCompleted = [...state.captureState.playersCompletedThisRound, playerId]
  const tempRoundTurns = {
    ...state.captureState.currentRoundTurns,
    [playerId]: { darts, score: captureScore },
  }

  // Pruefe ob Runde komplett (alle Spieler haben geworfen)
  if (tempPlayersCompleted.length >= state.match.players.length) {
    // Scores sammeln
    const scoresByPlayer: Record<string, number> = {}
    for (const [pid, turnData] of Object.entries(tempRoundTurns)) {
      scoresByPlayer[pid] = turnData.score
    }

    // Gewinner ermitteln
    const roundWinnerId = determineCaptureRoundWinner(scoresByPlayer)
    const fieldPoints = calculateFieldPoints(scoresByPlayer, roundWinnerId)

    result.roundFinished = {
      type: 'CTFRoundFinished',
      eventId: id(),
      matchId: state.match.matchId,
      legId: state.currentLegId,
      ts: now(),
      fieldIndex: currentFieldIndex,
      fieldNumber: targetNumber,
      scoresByPlayer,
      winnerId: roundWinnerId,
      fieldPoints,
    }

    // Bei 0-Draw mit Retry-Option: Feld wird wiederholt, Leg NICHT beenden
    const isRetryZeroDraw = roundWinnerId === null &&
      Math.max(...Object.values(scoresByPlayer)) === 0 &&
      config.retryZeroDrawFields

    // Pruefe ob Leg fertig (alle Felder gespielt, ausser bei Retry)
    if (currentFieldIndex + 1 >= sequence.length && !isRetryZeroDraw) {
      // Temporaere Feldpunkte und Scores berechnen
      const tempTotalFieldPoints = { ...state.captureState.totalFieldPointsByPlayer }
      for (const [pid, pts] of Object.entries(fieldPoints)) {
        tempTotalFieldPoints[pid] = (tempTotalFieldPoints[pid] ?? 0) + pts
      }

      const tempTotalScores = { ...state.captureState.totalScoreByPlayer }
      for (const [pid, score] of Object.entries(scoresByPlayer)) {
        tempTotalScores[pid] = (tempTotalScores[pid] ?? 0) + score
      }

      // Leg-Gewinner: Primaer Feldpunkte, Sekundaer Wurfpunkte
      const maxPoints = Math.max(...Object.values(tempTotalFieldPoints))
      const topPlayers = Object.entries(tempTotalFieldPoints).filter(([_, p]) => p === maxPoints)

      let legWinnerId: string
      if (topPlayers.length === 1) {
        legWinnerId = topPlayers[0][0]
      } else {
        // Tiebreaker: Gesamt-Wurfpunkte
        let highestScore = -1
        let winner = topPlayers[0][0]
        for (const [pid] of topPlayers) {
          const score = tempTotalScores[pid] ?? 0
          if (score > highestScore) {
            highestScore = score
            winner = pid
          }
        }
        legWinnerId = winner
      }

      // Darts zaehlen fuer den Gewinner
      const winnerDarts = (state.dartsUsedByPlayer[legWinnerId] ?? 0) + darts.length

      result.legFinished = {
        type: 'CTFLegFinished',
        eventId: id(),
        matchId: state.match.matchId,
        legId: state.currentLegId,
        ts: now(),
        winnerId: legWinnerId,
        winnerDarts,
      }

      // Berechne neue Leg-Wins
      const newTotalLegWins = (state.totalLegWinsByPlayer[legWinnerId] ?? 0) + 1
      const newLegWins = (state.legWinsByPlayer[legWinnerId] ?? 0) + 1

      const structure = state.match.structure

      if (structure.kind === 'legs') {
        // Legs-Modus: Pruefe ob Match gewonnen
        const targetLegs = Math.ceil(structure.bestOfLegs / 2)
        if (newTotalLegWins >= targetLegs) {
          const totalDarts = Object.values(state.dartsUsedTotalByPlayer)
            .reduce((a, b) => a + b, 0) + darts.length
          const durationMs = Date.now() - state.startTime

          result.matchFinished = {
            type: 'CTFMatchFinished',
            eventId: id(),
            matchId: state.match.matchId,
            ts: now(),
            winnerId: legWinnerId,
            totalDarts,
            durationMs,
          }
        } else {
          // Naechstes Leg starten
          result.nextLegStart = createCTFLegStartEvent(
            state.match.matchId,
            state.currentLegIndex + 1,
            undefined,
            state.match.config
          )
        }
      } else {
        // Sets-Modus: Pruefe ob Set gewonnen
        const targetLegsPerSet = Math.ceil(structure.legsPerSet / 2)
        if (newLegWins >= targetLegsPerSet) {
          // Set gewonnen
          const newSetWins = (state.setWinsByPlayer[legWinnerId] ?? 0) + 1

          result.setFinished = {
            type: 'CTFSetFinished',
            eventId: id(),
            matchId: state.match.matchId,
            ts: now(),
            setIndex: state.currentSetIndex,
            winnerId: legWinnerId,
          }

          // Pruefe ob Match gewonnen
          const targetSets = Math.ceil(structure.bestOfSets / 2)
          if (newSetWins >= targetSets) {
            const totalDarts = Object.values(state.dartsUsedTotalByPlayer)
              .reduce((a, b) => a + b, 0) + darts.length
            const durationMs = Date.now() - state.startTime

            result.matchFinished = {
              type: 'CTFMatchFinished',
              eventId: id(),
              matchId: state.match.matchId,
              ts: now(),
              winnerId: legWinnerId,
              totalDarts,
              durationMs,
            }
          } else {
            // Naechstes Set (neues Leg im neuen Set)
            result.nextLegStart = createCTFLegStartEvent(
              state.match.matchId,
              state.currentLegIndex + 1,
              state.currentSetIndex + 1,
              state.match.config
            )
          }
        } else {
          // Naechstes Leg im gleichen Set
          result.nextLegStart = createCTFLegStartEvent(
            state.match.matchId,
            state.currentLegIndex + 1,
            state.currentSetIndex,
            state.match.config
          )
        }
      }
    }
  }

  return result
}
