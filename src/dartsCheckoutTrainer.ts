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

/**
 * Generiert einen zufaelligen Checkout-Score aus der Checkout-Tabelle.
 * Bevorzugt haeufige Scores (70% Chance), Rest aus gesamter Tabelle.
 */
export function generateRandomCheckout(): { score: number; route: string; darts: 1 | 2 | 3 } {
  const useCommon = Math.random() < 0.7
  const allScores = Object.keys(CHECKOUT_TABLE).map(Number)

  if (useCommon) {
    const score = COMMON_CHECKOUTS[Math.floor(Math.random() * COMMON_CHECKOUTS.length)]
    const entry = CHECKOUT_TABLE[score]
    if (entry) return { score, route: entry.route, darts: entry.darts }
  }

  // Fallback: zufaelliger Score aus gesamter Tabelle
  const score = allScores[Math.floor(Math.random() * allScores.length)]
  const entry = CHECKOUT_TABLE[score]
  if (!entry) return { score: 40, route: 'D20', darts: 1 as const }
  return { score, route: entry.route, darts: entry.darts }
}

/**
 * Generiert eine Liste von N zufaelligen Checkouts (ohne direkte Wiederholungen).
 */
export function generateCheckoutList(count: number): { score: number; route: string; darts: 1 | 2 | 3 }[] {
  const list: { score: number; route: string; darts: 1 | 2 | 3 }[] = []
  let lastScore = -1

  for (let i = 0; i < count; i++) {
    let checkout: { score: number; route: string; darts: 1 | 2 | 3 }
    let attempts = 0
    do {
      checkout = generateRandomCheckout()
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
          state.results.push({
            score: state.currentTarget.score,
            route: state.currentTarget.route,
            optimalDarts: state.currentTarget.darts,
            success: event.success,
            dartsUsed: event.dartsUsed,
          })
          if (event.success) {
            state.successCount++
          }
          state.totalDartsUsed += event.dartsUsed
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
