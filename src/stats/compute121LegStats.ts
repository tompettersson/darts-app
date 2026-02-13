// src/stats/compute121LegStats.ts
// Berechnet Short-Term Stats für ein einzelnes 121-Leg

import type {
  DartsEvent,
  VisitAdded,
  LegStarted,
  LegFinished,
  Dart,
} from '../darts501'
import { scoreOf, isDouble } from '../darts501'
import { CHECKOUT_TABLE } from '../checkoutTable'
import type {
  Stats121Leg,
  Stats121Match,
  BustInfo,
  BustType,
  CheckoutRouteAttempt,
} from '../types/stats121'

// ============================================================
// Helper-Funktionen
// ============================================================

/** Wandelt einen Dart in Route-String um (z.B. T20, D14, BULL) */
function dartToRouteString(d: Dart): string {
  if (d.bed === 'MISS') return 'Miss'
  if (d.bed === 'DBULL') return 'BULL'
  if (d.bed === 'BULL') return '25'
  const prefix = d.mult === 3 ? 'T' : d.mult === 2 ? 'D' : 'S'
  return `${prefix}${d.bed}`
}

/** Gibt die optimale Route für einen Rest zurück */
function getOptimalRoute(remaining: number): string[] {
  const entry = CHECKOUT_TABLE[remaining]
  if (!entry) return []
  return entry.route.split(' ')
}

/** Prüft ob ein Rest ein möglicher Checkout ist (2-170, keine Bogey-Zahlen) */
function isCheckoutPossible(remaining: number): boolean {
  return remaining >= 2 && remaining <= 170 && CHECKOUT_TABLE[remaining] !== undefined
}

/** Prüft ob ein Rest mit Double erreichbar ist (für Double-Out) */
function isDoublePossible(remaining: number): boolean {
  // Gerade Zahlen von 2-40 oder Bull (50)
  if (remaining === 50) return true
  if (remaining >= 2 && remaining <= 40 && remaining % 2 === 0) return true
  return false
}

/** Berechnet den Stabilitätsindex (0-100) */
function calculateStabilityIndex(visitScores: number[]): number {
  if (visitScores.length < 2) return 100 // Zu wenig Daten = perfekt stabil

  const mean = visitScores.reduce((a, b) => a + b, 0) / visitScores.length
  const variance = visitScores.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / visitScores.length

  // Max erwartete Varianz für 121: ca. 2000
  // Bei hoher Varianz sinkt der Index
  const maxExpectedVariance = 2000
  const stabilityIndex = Math.max(0, 100 - (variance / maxExpectedVariance) * 100)

  return Math.round(stabilityIndex)
}

/** Bestimmt den Bust-Typ */
function determineBustType(
  remainingBefore: number,
  thrownScore: number,
  finalDart: Dart | undefined
): BustType {
  const remainingAfter = remainingBefore - thrownScore

  // Überwerfen: Rest wird negativ oder genau 1 (unmöglich bei Double-Out)
  if (remainingAfter < 0 || remainingAfter === 1) {
    return 'overshoot'
  }

  // Rest == 0 aber nicht auf Double beendet
  if (remainingAfter === 0 && finalDart && !isDouble(finalDart)) {
    return 'wrong-finish'
  }

  return 'overshoot' // Default
}

/** Extrahiert das Double-Feld aus einem Dart */
function getDoubleField(d: Dart): string | null {
  if (d.bed === 'DBULL') return 'BULL'
  if (d.mult === 2 && typeof d.bed === 'number') {
    return `D${d.bed}`
  }
  return null
}

// ============================================================
// Hauptfunktion
// ============================================================

/**
 * Berechnet die 121-spezifischen Statistiken für ein einzelnes Leg.
 * @param events Alle Events des Matches
 * @param legId ID des zu analysierenden Legs
 * @param playerId ID des Spielers
 * @returns Stats121Leg oder null wenn keine Daten vorhanden
 */
export function compute121LegStats(
  events: DartsEvent[],
  legId: string,
  playerId: string
): Stats121Leg | null {
  // Leg-Start finden
  const legStart = events.find(
    e => e.type === 'LegStarted' && (e as LegStarted).legId === legId
  ) as LegStarted | undefined

  if (!legStart) return null

  // Leg-Ende finden (falls vorhanden)
  const legFinish = events.find(
    e => e.type === 'LegFinished' && (e as LegFinished).legId === legId
  ) as LegFinished | undefined

  // Alle Visits für dieses Leg und diesen Spieler
  const visits = events.filter(
    e =>
      e.type === 'VisitAdded' &&
      (e as VisitAdded).legId === legId &&
      (e as VisitAdded).playerId === playerId
  ) as VisitAdded[]

  if (visits.length === 0) return null

  // Grundwerte initialisieren
  let dartsToFinish: number | null = null
  let timeToFinishMs: number | null = null
  const visitsCount = visits.length
  let totalDarts = 0

  // Checkout & Double Tracking
  let checkoutSuccess = false
  let dartsOnDouble = 0
  let missedDoubleDarts = 0
  let firstAttemptDoubleHit = false
  let doubleFieldUsed: string | null = null
  let dartsToFirstCheckoutAttempt: number | null = null
  let firstCheckoutAttemptVisitIdx = -1

  // Bust Tracking
  const busts: BustInfo[] = []
  let longestStreakWithoutBust = 0
  let currentStreak = 0

  // Verpasste Checkouts
  let missedCheckoutsCount = 0
  let missedCheckoutDarts = 0
  let hadMissedCheckout = false
  let checkoutAfterMiss = false

  // Visit-Scores für Stabilität
  const visitScores: number[] = []

  // Checkout-Route (falls erfolgreich)
  let checkoutRoute: CheckoutRouteAttempt | null = null

  // Erste Checkout-Gelegenheit tracken (121 ist immer in 3 Darts machbar)
  const firstTurnCheckoutPossible = true
  let firstTurnCheckoutSuccess = false

  // Durch alle Visits iterieren
  for (let vIdx = 0; vIdx < visits.length; vIdx++) {
    const visit = visits[vIdx]
    const dartsInVisit = visit.darts.length
    totalDarts += dartsInVisit
    visitScores.push(visit.visitScore)

    // Bust-Erkennung
    if (visit.bust) {
      const lastDartIdx = visit.darts.length - 1
      const lastDart = visit.darts[lastDartIdx]

      // Score bis zum Bust berechnen
      let scoreToBust = 0
      for (let i = 0; i <= lastDartIdx; i++) {
        scoreToBust += scoreOf(visit.darts[i])
      }

      const bustType = determineBustType(
        visit.remainingBefore,
        scoreToBust,
        lastDart
      )

      busts.push({
        visitIndex: vIdx,
        dartIndex: lastDartIdx,
        type: bustType,
        remainingBefore: visit.remainingBefore,
        thrownScore: scoreToBust,
      })

      currentStreak = 0
    } else {
      currentStreak++
      longestStreakWithoutBust = Math.max(longestStreakWithoutBust, currentStreak)
    }

    // Checkout-Versuche tracken
    let remainingInVisit = visit.remainingBefore
    let visitHadCheckoutChance = false

    for (let dIdx = 0; dIdx < visit.darts.length; dIdx++) {
      const dart = visit.darts[dIdx]
      const dartScore = scoreOf(dart)

      // Prüfen ob vor diesem Dart ein Checkout möglich war
      if (isCheckoutPossible(remainingInVisit)) {
        visitHadCheckoutChance = true

        // Erste Checkout-Gelegenheit merken
        if (dartsToFirstCheckoutAttempt === null) {
          dartsToFirstCheckoutAttempt = totalDarts - (visit.darts.length - dIdx)
          firstCheckoutAttemptVisitIdx = vIdx
        }

        // Prüfen ob auf Double gezielt (Rest ist Double-fähig)
        if (isDoublePossible(remainingInVisit)) {
          dartsOnDouble++

          const doubleField = getDoubleField(dart)

          if (doubleField && remainingInVisit === dartScore) {
            // Double getroffen und ausgecheckt!
            if (dartsOnDouble === 1) {
              firstAttemptDoubleHit = true
            }
            doubleFieldUsed = doubleField
          } else {
            // Double verfehlt
            missedDoubleDarts++
          }
        }
      }

      remainingInVisit -= dartScore
      if (remainingInVisit <= 0) break
    }

    // Verpasste Checkout-Gelegenheit?
    if (visitHadCheckoutChance && !visit.finishingDartSeq && !visit.bust) {
      // Hat ausgespielt ohne zu checken (nicht bust) = verpasster Checkout
      missedCheckoutsCount++
      hadMissedCheckout = true
    }

    // First-Turn Checkout Check (erstes Visit)
    if (vIdx === 0 && visit.finishingDartSeq) {
      firstTurnCheckoutSuccess = true
    }

    // Checkout nach Miss?
    if (visit.finishingDartSeq && hadMissedCheckout) {
      checkoutAfterMiss = true
    }
  }

  // Checkout-Erfolg und Darts bis Finish
  if (legFinish && legFinish.winnerPlayerId === playerId) {
    checkoutSuccess = true

    // Darts bis Finish berechnen
    const finishingVisit = visits.find(v => v.eventId === legFinish.finishingVisitId)
    if (finishingVisit) {
      dartsToFinish = totalDarts - finishingVisit.darts.length + legFinish.finishingDartSeq
    }

    // Zeit berechnen
    const startTime = new Date(legStart.ts).getTime()
    const endTime = new Date(legFinish.ts).getTime()
    timeToFinishMs = endTime - startTime

    // Checkout-Route extrahieren
    const finishVisit = visits.find(v => v.eventId === legFinish.finishingVisitId)
    if (finishVisit) {
      const routeTaken = finishVisit.darts
        .slice(0, legFinish.finishingDartSeq)
        .map(d => dartToRouteString(d))

      const optimalRoute = getOptimalRoute(finishVisit.remainingBefore)

      checkoutRoute = {
        remainingBefore: finishVisit.remainingBefore,
        routeTaken,
        optimalRoute,
        success: true,
        deviatedFromOptimal: routeTaken.join(' ') !== optimalRoute.join(' '),
        dartsUsed: legFinish.finishingDartSeq,
      }
    }
  }

  // Checkout-Kategorie bestimmen
  let checkoutCategory: '<=6' | '<=9' | '>9' | 'none' = 'none'
  if (dartsToFinish !== null) {
    if (dartsToFinish <= 6) checkoutCategory = '<=6'
    else if (dartsToFinish <= 9) checkoutCategory = '<=9'
    else checkoutCategory = '>9'
  }

  // Durchschnittliche Darts pro Visit
  const avgDartsPerVisit = visitsCount > 0 ? totalDarts / visitsCount : 0

  // Stabilitätsindex berechnen
  const stabilityIndex = calculateStabilityIndex(visitScores)

  // Verpasste Checkout-Darts = alle Darts auf Double die nicht trafen
  missedCheckoutDarts = missedDoubleDarts

  return {
    legId,
    playerId,

    // Grundwerte
    dartsToFinish,
    timeToFinishMs,
    visitsCount,
    avgDartsPerVisit,

    // Checkout-Erfolg
    checkoutSuccess,
    checkoutCategory,

    // First-Turn Checkout
    firstTurnCheckoutPossible,
    firstTurnCheckoutSuccess,
    dartsToFirstCheckoutAttempt,

    // Double-Analyse
    doubleHit: checkoutSuccess,
    dartsOnDouble,
    firstAttemptDoubleHit,
    missedDoubleDarts,
    doubleFieldUsed,

    // Bust-Analyse
    bustCount: busts.length,
    busts,
    longestStreakWithoutBust,

    // Verpasste Checkouts
    missedCheckoutDarts,
    missedCheckoutsCount,
    checkoutAfterMiss,

    // Stabilität
    stabilityIndex,

    // Checkout-Route
    checkoutRoute,
  }
}

/**
 * Berechnet 121-Leg-Stats für alle Spieler eines Legs.
 */
export function compute121LegStatsForAllPlayers(
  events: DartsEvent[],
  legId: string,
  playerIds: string[]
): Record<string, Stats121Leg | null> {
  const result: Record<string, Stats121Leg | null> = {}

  for (const playerId of playerIds) {
    result[playerId] = compute121LegStats(events, legId, playerId)
  }

  return result
}

// ============================================================
// Match-Level Aggregation
// ============================================================

/**
 * Aggregiert mehrere Leg-Stats zu Match-Level Stats für einen Spieler.
 * @param legStats Array von Stats121Leg für einen Spieler
 * @param playerId ID des Spielers
 * @returns Stats121Match oder null wenn keine Daten
 */
export function compute121MatchStats(
  legStats: Stats121Leg[],
  playerId: string
): Stats121Match | null {
  // Nur Stats für diesen Spieler
  const playerLegStats = legStats.filter(s => s.playerId === playerId)

  if (playerLegStats.length === 0) return null

  // Aggregierte Werte sammeln
  const legsPlayed = playerLegStats.length
  const legsWon = playerLegStats.filter(s => s.checkoutSuccess).length

  // Darts-Metriken
  const finishedLegs = playerLegStats.filter(s => s.dartsToFinish !== null)
  const totalDartsToFinish = finishedLegs.reduce((sum, s) => sum + (s.dartsToFinish ?? 0), 0)
  const avgDartsToFinish = finishedLegs.length > 0 ? totalDartsToFinish / finishedLegs.length : 0

  const bestLegDarts = finishedLegs.length > 0
    ? Math.min(...finishedLegs.map(s => s.dartsToFinish!))
    : null
  const worstLegDarts = finishedLegs.length > 0
    ? Math.max(...finishedLegs.map(s => s.dartsToFinish!))
    : null

  // Checkout
  const checkoutAttempts = playerLegStats.reduce((sum, s) => sum + s.dartsOnDouble, 0)
  const checkoutsMade = legsWon
  const checkoutPct = checkoutAttempts > 0 ? (checkoutsMade / checkoutAttempts) * 100 : 0
  const firstTurnCheckouts = playerLegStats.filter(s => s.firstTurnCheckoutSuccess).length

  // Double-Analyse
  const totalDartsOnDouble = checkoutAttempts
  const avgDartsOnDouble = checkoutsMade > 0 ? totalDartsOnDouble / checkoutsMade : 0
  const firstAttemptDoubleHits = playerLegStats.filter(s => s.firstAttemptDoubleHit).length
  const missedDoubleDarts = playerLegStats.reduce((sum, s) => sum + s.missedDoubleDarts, 0)

  // Preferred Double ermitteln
  const doubleCounts: Record<string, number> = {}
  for (const leg of playerLegStats) {
    if (leg.doubleFieldUsed) {
      doubleCounts[leg.doubleFieldUsed] = (doubleCounts[leg.doubleFieldUsed] ?? 0) + 1
    }
  }
  let preferredDouble: string | null = null
  let maxDoubleCount = 0
  for (const [field, count] of Object.entries(doubleCounts)) {
    if (count > maxDoubleCount) {
      maxDoubleCount = count
      preferredDouble = field
    }
  }

  // Busts
  const totalBusts = playerLegStats.reduce((sum, s) => sum + s.bustCount, 0)
  const avgBustsPerLeg = legsPlayed > 0 ? totalBusts / legsPlayed : 0

  // Stabilität
  const avgStabilityIndex = playerLegStats.length > 0
    ? playerLegStats.reduce((sum, s) => sum + s.stabilityIndex, 0) / playerLegStats.length
    : 0

  // Routen
  const optimalRouteCount = playerLegStats.filter(
    s => s.checkoutRoute && !s.checkoutRoute.deviatedFromOptimal
  ).length
  const alternativeRouteCount = playerLegStats.filter(
    s => s.checkoutRoute && s.checkoutRoute.deviatedFromOptimal
  ).length

  return {
    playerId,
    legsPlayed,
    legsWon,
    totalDartsToFinish,
    avgDartsToFinish,
    bestLegDarts,
    worstLegDarts,
    checkoutAttempts,
    checkoutsMade,
    checkoutPct,
    firstTurnCheckouts,
    totalDartsOnDouble,
    avgDartsOnDouble,
    firstAttemptDoubleHits,
    missedDoubleDarts,
    preferredDouble,
    totalBusts,
    avgBustsPerLeg,
    avgStabilityIndex,
    optimalRouteCount,
    alternativeRouteCount,
  }
}
