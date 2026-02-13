// src/types/stats121.ts
// Typen für 121-spezifische Statistiken

// ============================================================
// Bust-Kategorisierung
// ============================================================

/** Bust-Typ: Unterscheidung zwischen Überwerfen und falschem Finish */
export type BustType =
  | 'overshoot'      // Rest < 0 oder Rest == 1 bei Double-Out
  | 'wrong-finish'   // Rest == 0 aber nicht auf Double beendet

/** Detaillierte Bust-Information */
export type BustInfo = {
  visitIndex: number
  dartIndex: number      // 0, 1 oder 2
  type: BustType
  remainingBefore: number
  thrownScore: number
}

// ============================================================
// Checkout-Route Tracking
// ============================================================

/** Ein einzelner Checkout-Versuch mit Route-Informationen */
export type CheckoutRouteAttempt = {
  remainingBefore: number
  routeTaken: string[]           // z.B. ['T20', 'S1', 'D20']
  optimalRoute: string[]         // aus checkoutTable.ts
  success: boolean
  deviatedFromOptimal: boolean
  dartsUsed: number
}

/** Aggregierte Statistiken pro Route */
export type CheckoutRouteStats = {
  route: string                  // z.B. 'T20 S1 D20'
  attempts: number
  successes: number
  successRate: number
  bustCount: number
}

// ============================================================
// Short-Term Stats (Pro 121-Leg)
// ============================================================

/** Kurzzeit-Statistiken für ein einzelnes 121-Leg */
export type Stats121Leg = {
  legId: string
  playerId: string

  // Grundwerte
  dartsToFinish: number | null     // null wenn nicht gecheckt
  timeToFinishMs: number | null
  visitsCount: number              // Anzahl Aufnahmen
  avgDartsPerVisit: number

  // Checkout-Erfolg
  checkoutSuccess: boolean
  checkoutCategory: '<=6' | '<=9' | '>9' | 'none'

  // First-Turn Checkout
  firstTurnCheckoutPossible: boolean   // War 121 in 3 Darts machbar? (Ja, ist es)
  firstTurnCheckoutSuccess: boolean
  dartsToFirstCheckoutAttempt: number | null

  // Double-Analyse
  doubleHit: boolean
  dartsOnDouble: number
  firstAttemptDoubleHit: boolean
  missedDoubleDarts: number
  doubleFieldUsed: string | null       // z.B. 'D20', 'D14', 'BULL'

  // Bust-Analyse
  bustCount: number
  busts: BustInfo[]
  longestStreakWithoutBust: number     // Anzahl Visits ohne Bust

  // Verpasste Checkouts
  missedCheckoutDarts: number          // Total verpasste Double-Darts
  missedCheckoutsCount: number         // Aufnahmen wo Checkout möglich war aber nicht geschafft
  checkoutAfterMiss: boolean           // Direkt nach Fehlversuch gecheckt

  // Stabilität
  stabilityIndex: number               // 0-100, berechnet aus Varianz

  // Checkout-Route
  checkoutRoute: CheckoutRouteAttempt | null
}

// ============================================================
// Long-Term Stats (Karriere-Statistiken)
// ============================================================

/** Double-Statistiken pro Feld */
export type DoubleFieldStats = {
  attempts: number
  hits: number
  hitRate: number
  avgDartsToHit: number
  totalDartsOn: number   // Summe aller Darts auf dieses Double
}

/** Langzeit-Statistiken für 121-Spiele */
export type Stats121LongTerm = {
  playerId: string
  playerName?: string

  // Grundzahlen
  totalLegs: number
  legsWon: number

  // Checkout-Quote
  checkoutAttempts: number
  checkoutsMade: number
  checkoutPct: number

  // Darts-Metriken
  avgDartsToFinish: number
  avgDartsToFirstCheckoutAttempt: number
  avgDartsOnDouble: number
  totalDartsThrown: number

  // Double-Analyse je Feld
  doubleStats: Record<string, DoubleFieldStats>
  bestDouble: { field: string; hitRate: number } | null
  worstDouble: { field: string; hitRate: number } | null
  preferredDouble: string | null      // Am häufigsten gewählt
  effectiveDouble: string | null      // Höchste Erfolgsrate

  // Unter Druck
  doubleHitsAfterBust: number
  doubleHitsAfterMiss: number
  doubleAttemptsAfterPressure: number

  // Checkout-Routen
  routeStats: CheckoutRouteStats[]
  mostUsedRoute: string | null
  mostSuccessfulRoute: string | null
  routeDeviationRate: number          // % Abweichung von optimal

  // Finish-Statistiken
  bestFinishDarts: number | null
  worstFinishDarts: number | null
  finishDartsVariance: number
  pctBelowPersonalAvg: number
  personalBest: number | null         // wenigste Darts

  // Gleitender Durchschnitt & Trends
  movingAvg10: number                 // letzte 10 Runden
  checkoutPctTrend: 'rising' | 'falling' | 'stable'
  doubleEfficiencyTrend: 'rising' | 'falling' | 'stable'

  // 121-Skill-Score
  skillScore: number                  // 0-100, gewichtet

  // Bust-Statistiken
  totalBusts: number
  bustRate: number

  // Timestamps
  updatedAt: string
}

// ============================================================
// Head-to-Head Stats
// ============================================================

/** Player-spezifische Stats im Head-to-Head Vergleich */
export type Stats121H2HPlayer = {
  avgDartsToFinish: number
  checkoutPct: number
  avgDartsOnDouble: number
  bestFinish: number
  skillScore: number
  legsWon: number
}

/** 121-spezifischer Head-to-Head Vergleich */
export type Stats121HeadToHead = {
  player1Id: string
  player2Id: string
  player1Name: string
  player2Name: string

  legsPlayed: number
  player1Wins: number
  player2Wins: number

  player1Stats: Stats121H2HPlayer
  player2Stats: Stats121H2HPlayer
}

// ============================================================
// Match-Level Stats (Aggregiert über alle Legs eines Matches)
// ============================================================

/** Aggregierte 121-Stats für ein komplettes Match */
export type Stats121Match = {
  playerId: string

  // Über alle Legs aggregiert
  legsPlayed: number
  legsWon: number

  // Darts-Metriken
  totalDartsToFinish: number
  avgDartsToFinish: number
  bestLegDarts: number | null     // Wenigste Darts in einem Leg
  worstLegDarts: number | null    // Meiste Darts in einem Leg

  // Checkout
  checkoutAttempts: number        // Total Darts auf Double
  checkoutsMade: number           // Erfolgreiche Legs
  checkoutPct: number
  firstTurnCheckouts: number      // In 3 Darts gecheckt

  // Double-Analyse
  totalDartsOnDouble: number
  avgDartsOnDouble: number
  firstAttemptDoubleHits: number  // Beim ersten Dart aufs Double getroffen
  missedDoubleDarts: number
  preferredDouble: string | null  // Am häufigsten gewählt

  // Busts
  totalBusts: number
  avgBustsPerLeg: number

  // Stabilität
  avgStabilityIndex: number

  // Routen
  optimalRouteCount: number       // Wie oft optimale Route genommen
  alternativeRouteCount: number   // Wie oft abgewichen
}

// ============================================================
// Hilfsfunktionen für 121-Skill-Score
// ============================================================

/**
 * Berechnet den 121-Skill-Score basierend auf:
 * - 40% Checkout-Quote (normalisiert auf 0-100)
 * - 25% Durchschnittliche Darts bis Finish (invertiert, 3 Darts = 100, 21 Darts = 0)
 * - 20% Double-Effizienz (1 Dart = 100, 10 Darts = 0)
 * - 15% Konstanz (100 - Varianz-Prozent)
 */
export function calculate121SkillScore(
  checkoutPct: number,
  avgDartsToFinish: number,
  avgDartsOnDouble: number,
  pctBelowPersonalAvg: number
): number {
  // Checkout-Komponente (0-100)
  const checkoutComponent = checkoutPct * 0.4

  // Darts to Finish: 3 Darts = 100, 21 Darts = 0
  const dartsComponent = Math.max(0, (1 - (avgDartsToFinish - 3) / 18) * 100) * 0.25

  // Double Effizienz: 1 Dart = 100, 10 Darts = 0
  const doubleComponent = Math.max(0, (1 - (avgDartsOnDouble - 1) / 9) * 100) * 0.20

  // Konstanz
  const constancyComponent = (100 - pctBelowPersonalAvg) * 0.15

  return Math.round(checkoutComponent + dartsComponent + doubleComponent + constancyComponent)
}

/**
 * Berechnet den Trend basierend auf den letzten 10 vs. den vorherigen 10 Werten
 */
export function calculateTrend(
  recent10: number[],
  older10: number[]
): 'rising' | 'falling' | 'stable' {
  if (recent10.length === 0 || older10.length === 0) return 'stable'

  const recentAvg = recent10.reduce((a, b) => a + b, 0) / recent10.length
  const olderAvg = older10.reduce((a, b) => a + b, 0) / older10.length

  if (recentAvg > olderAvg * 1.05) return 'rising'
  if (recentAvg < olderAvg * 0.95) return 'falling'
  return 'stable'
}
