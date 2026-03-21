// src/dartsCheckoutTrainer.ts
// Checkout Trainer - Practice Mode
// Zufaellige Checkout-Scores ueben. Spieler bekommt Score + Route angezeigt
// und gibt an, ob/mit wie vielen Darts gecheckt wurde.

import { CHECKOUT_TABLE } from './checkoutTable'

// ===== Hilfsfunktionen =====

export function id(): string {
  return Math.random().toString(36).slice(2, 11)
}

export function now(): string {
  return new Date().toISOString()
}

// ===== Event Types =====

export type CheckoutTrainerStartedEvent = {
  type: 'CheckoutTrainerStarted'
  eventId: string
  matchId: string
  ts: string
  playerId: string
  playerName: string
  targetCount: number
  /** Multiplayer: Liste aller Spieler */
  players?: { playerId: string; name: string }[]
}

export type CheckoutAttemptStartedEvent = {
  type: 'CheckoutAttemptStarted'
  eventId: string
  matchId: string
  ts: string
  targetScore: number
  optimalRoute: string
  optimalDarts: number
}

export type CheckoutAttemptResultEvent = {
  type: 'CheckoutAttemptResult'
  eventId: string
  matchId: string
  ts: string
  success: boolean
  dartsUsed: number
  dartsThrown?: string[]  // z.B. ['T19', 'D16'] - optional fuer Rueckwaertskompatibilitaet
  /** Multiplayer: Index des Spielers, der geworfen hat */
  playerIndex?: number
}

export type CheckoutTrainerFinishedEvent = {
  type: 'CheckoutTrainerFinished'
  eventId: string
  matchId: string
  ts: string
  successCount: number
  totalAttempts: number
  totalDartsUsed: number
  durationMs: number
}

export type CheckoutTrainerEvent =
  | CheckoutTrainerStartedEvent
  | CheckoutAttemptStartedEvent
  | CheckoutAttemptResultEvent
  | CheckoutTrainerFinishedEvent

// ===== State =====

export type CheckoutAttemptResult = {
  score: number
  route: string
  optimalDarts: number
  success: boolean
  dartsUsed: number
  dartsThrown?: string[]  // z.B. ['T19', 'D16']
}

export type CheckoutTrainerState = {
  matchId: string
  playerId: string
  playerName: string
  targetCount: number
  currentTarget: { score: number; route: string; darts: number } | null
  attemptIndex: number
  results: CheckoutAttemptResult[]
  finished: boolean
  successCount: number
  totalDartsUsed: number
  startTime: number
  events: CheckoutTrainerEvent[]
  /** Multiplayer: Alle Spieler */
  players: { playerId: string; name: string }[]
  /** Multiplayer: Wer ist aktuell dran (Index in players[]) */
  activePlayerIndex: number
  /** Multiplayer: Ergebnisse pro Spieler-Index */
  playerResults: Map<number, CheckoutAttemptResult[]>
  /** Multiplayer: Erfolge pro Spieler-Index */
  playerSuccessCounts: Map<number, number>
  /** Multiplayer: Darts pro Spieler-Index */
  playerDartsUsed: Map<number, number>
}

// ===== Checkout-Generierung =====

// Haeufige Checkout-Scores (gewichtet: 2-Dart und 3-Dart Finishes sind haeufiger im Spiel)
const COMMON_CHECKOUTS = [
  // 1-Dart (selten im echten Spiel, aber gut zum Ueben)
  32, 40, 36, 16, 20, 8,
  // 2-Dart (haeufig)
  41, 45, 51, 56, 57, 60, 61, 64, 65, 68, 72, 76, 80,
  // 3-Dart (haeufig)
  81, 84, 85, 88, 90, 92, 95, 96, 97, 98, 100, 101, 104,
  105, 106, 107, 108, 110, 112, 113, 116, 117, 120,
  121, 124, 125, 127, 128, 130, 131, 132, 135, 136,
  138, 140, 141, 143, 144, 146, 148, 150, 152, 154,
  156, 158, 160, 161, 164, 167, 170,
]

// ===== Dart Input Parsing =====

export type ParsedDart = { bed: string; mult: number; score: number }

/**
 * Parst eine Dart-Eingabe wie "S20", "D16", "T19", "BULL", "DBULL", "MISS".
 * Case-insensitive. Gibt null zurueck bei ungueltigem Input.
 */
export function parseDartInput(input: string): ParsedDart | null {
  const s = input.trim().toUpperCase()
  if (!s) return null

  if (s === 'MISS' || s === 'M') return { bed: '0', mult: 0, score: 0 }
  if (s === 'DBULL' || s === 'DB' || s === 'D25' || s === 'BULL50') return { bed: 'BULL', mult: 2, score: 50 }
  if (s === 'BULL' || s === 'B' || s === '25' || s === 'SB' || s === 'S25') return { bed: 'BULL', mult: 1, score: 25 }

  // Mit Prefix: S20, D16, T19
  const match = s.match(/^([SDT])(\d{1,2})$/)
  if (match) {
    const prefix = match[1]
    const bed = parseInt(match[2], 10)
    if (bed < 1 || bed > 20) return null
    const mult = prefix === 'S' ? 1 : prefix === 'D' ? 2 : 3
    return { bed: String(bed), mult, score: bed * mult }
  }

  // Ohne Prefix: reine Zahl → Single (z.B. "20" = S20, "1" = S1)
  const numMatch = s.match(/^(\d{1,2})$/)
  if (numMatch) {
    const bed = parseInt(numMatch[1], 10)
    if (bed < 1 || bed > 20) return null
    return { bed: String(bed), mult: 1, score: bed }
  }

  return null
}

/**
 * Berechnet den Score eines Darts.
 */
export function calculateDartScore(bed: string, mult: number): number {
  if (bed === 'BULL') return mult === 2 ? 50 : 25
  if (bed === '0') return 0
  return parseInt(bed, 10) * mult
}

/**
 * Prueft ob ein Dart ein Double ist (fuer Checkout).
 */
export function isDartDouble(dart: ParsedDart): boolean {
  return dart.mult === 2
}

// ===== Score Range Type =====

export type ScoreRange = [number, number]

/**
 * Generiert einen zufaelligen Checkout-Score aus der Checkout-Tabelle.
 * Bevorzugt haeufige Scores (70% Chance), Rest aus gesamter Tabelle.
 * Optional: scoreRange [min, max] filtert nach Score-Bereich.
 */
export function generateRandomCheckout(scoreRange?: ScoreRange): { score: number; route: string; darts: 1 | 2 | 3 } {
  const allScores = Object.keys(CHECKOUT_TABLE).map(Number)

  // Filtere nach Score-Range wenn angegeben
  const filteredScores = scoreRange
    ? allScores.filter(s => s >= scoreRange[0] && s <= scoreRange[1])
    : allScores

  if (filteredScores.length === 0) {
    // Fallback wenn Range keine Treffer hat
    return { score: 40, route: 'D20', darts: 1 as const }
  }

  if (!scoreRange) {
    // Ohne Range: bevorzuge Common Checkouts (70% Chance)
    const useCommon = Math.random() < 0.7
    if (useCommon) {
      const score = COMMON_CHECKOUTS[Math.floor(Math.random() * COMMON_CHECKOUTS.length)]
      const entry = CHECKOUT_TABLE[score]
      if (entry) return { score, route: entry.route, darts: entry.darts }
    }
  }

  // Zufaelliger Score aus (gefilterter) Tabelle
  const score = filteredScores[Math.floor(Math.random() * filteredScores.length)]
  const entry = CHECKOUT_TABLE[score]
  if (!entry) return { score: 40, route: 'D20', darts: 1 as const }
  return { score, route: entry.route, darts: entry.darts }
}

/**
 * Generiert eine Liste von N zufaelligen Checkouts (ohne direkte Wiederholungen).
 * Optional: scoreRange [min, max] filtert nach Score-Bereich.
 */
export function generateCheckoutList(count: number, scoreRange?: ScoreRange): { score: number; route: string; darts: 1 | 2 | 3 }[] {
  const list: { score: number; route: string; darts: 1 | 2 | 3 }[] = []
  let lastScore = -1

  for (let i = 0; i < count; i++) {
    let checkout: { score: number; route: string; darts: 1 | 2 | 3 }
    let attempts = 0
    do {
      checkout = generateRandomCheckout(scoreRange)
      attempts++
    } while (checkout.score === lastScore && attempts < 20)
    lastScore = checkout.score
    list.push(checkout)
  }

  return list
}

// ===== Event Application =====

function createEmptyState(): CheckoutTrainerState {
  return {
    matchId: '',
    playerId: '',
    playerName: '',
    targetCount: 10,
    currentTarget: null,
    attemptIndex: 0,
    results: [],
    finished: false,
    successCount: 0,
    totalDartsUsed: 0,
    startTime: 0,
    events: [],
    players: [],
    activePlayerIndex: 0,
    playerResults: new Map(),
    playerSuccessCounts: new Map(),
    playerDartsUsed: new Map(),
  }
}

/**
 * Wendet Checkout Trainer Events an und berechnet den abgeleiteten State.
 */
export function applyCheckoutTrainerEvents(events: CheckoutTrainerEvent[]): CheckoutTrainerState {
  const state = createEmptyState()
  state.events = events

  for (const event of events) {
    switch (event.type) {
      case 'CheckoutTrainerStarted': {
        state.matchId = event.matchId
        state.playerId = event.playerId
        state.playerName = event.playerName
        state.targetCount = event.targetCount
        state.startTime = new Date(event.ts).getTime()
        // Multiplayer: players Array aus Event oder Fallback auf einzelnen Spieler
        if (event.players && event.players.length > 0) {
          state.players = event.players
        } else {
          state.players = [{ playerId: event.playerId, name: event.playerName }]
        }
        state.activePlayerIndex = 0
        // Maps initialisieren
        for (let pi = 0; pi < state.players.length; pi++) {
          state.playerResults.set(pi, [])
          state.playerSuccessCounts.set(pi, 0)
          state.playerDartsUsed.set(pi, 0)
        }
        break
      }

      case 'CheckoutAttemptStarted': {
        state.currentTarget = {
          score: event.targetScore,
          route: event.optimalRoute,
          darts: event.optimalDarts,
        }
        break
      }

      case 'CheckoutAttemptResult': {
        if (state.currentTarget) {
          const result: CheckoutAttemptResult = {
            score: state.currentTarget.score,
            route: state.currentTarget.route,
            optimalDarts: state.currentTarget.darts,
            success: event.success,
            dartsUsed: event.dartsUsed,
            dartsThrown: event.dartsThrown,
          }
          state.results.push(result)
          if (event.success) {
            state.successCount++
          }
          state.totalDartsUsed += event.dartsUsed

          // Multiplayer: Ergebnis dem aktiven Spieler zuordnen
          const pi = event.playerIndex ?? state.activePlayerIndex
          const pResults = state.playerResults.get(pi) ?? []
          pResults.push(result)
          state.playerResults.set(pi, pResults)
          if (event.success) {
            state.playerSuccessCounts.set(pi, (state.playerSuccessCounts.get(pi) ?? 0) + 1)
          }
          state.playerDartsUsed.set(pi, (state.playerDartsUsed.get(pi) ?? 0) + event.dartsUsed)

          // Naechster Spieler (rotieren)
          if (state.players.length > 1) {
            state.activePlayerIndex = (pi + 1) % state.players.length
          }

          state.attemptIndex++
          state.currentTarget = null
        }
        break
      }

      case 'CheckoutTrainerFinished': {
        state.finished = true
        break
      }
    }
  }

  return state
}
