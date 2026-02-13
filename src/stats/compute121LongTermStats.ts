// src/stats/compute121LongTermStats.ts
// Aggregiert Langzeit-Statistiken für 121-Spiele über mehrere Legs

import type { DartsEvent, MatchStarted, LegFinished } from '../darts501'
import { now } from '../darts501'
import type {
  Stats121LongTerm,
  Stats121Leg,
  DoubleFieldStats,
  CheckoutRouteStats,
} from '../types/stats121'
import { calculate121SkillScore, calculateTrend } from '../types/stats121'
import { compute121LegStats } from './compute121LegStats'

// ============================================================
// Helper-Funktionen
// ============================================================

/** Initialisiert leere Langzeit-Stats */
function createEmpty121LongTermStats(playerId: string, playerName?: string): Stats121LongTerm {
  return {
    playerId,
    playerName,

    // Grundzahlen
    totalLegs: 0,
    legsWon: 0,

    // Checkout-Quote
    checkoutAttempts: 0,
    checkoutsMade: 0,
    checkoutPct: 0,

    // Darts-Metriken
    avgDartsToFinish: 0,
    avgDartsToFirstCheckoutAttempt: 0,
    avgDartsOnDouble: 0,
    totalDartsThrown: 0,

    // Double-Analyse je Feld
    doubleStats: {},
    bestDouble: null,
    worstDouble: null,
    preferredDouble: null,
    effectiveDouble: null,

    // Unter Druck
    doubleHitsAfterBust: 0,
    doubleHitsAfterMiss: 0,
    doubleAttemptsAfterPressure: 0,

    // Checkout-Routen
    routeStats: [],
    mostUsedRoute: null,
    mostSuccessfulRoute: null,
    routeDeviationRate: 0,

    // Finish-Statistiken
    bestFinishDarts: null,
    worstFinishDarts: null,
    finishDartsVariance: 0,
    pctBelowPersonalAvg: 0,
    personalBest: null,

    // Gleitender Durchschnitt & Trends
    movingAvg10: 0,
    checkoutPctTrend: 'stable',
    doubleEfficiencyTrend: 'stable',

    // 121-Skill-Score
    skillScore: 0,

    // Bust-Statistiken
    totalBusts: 0,
    bustRate: 0,

    // Timestamps
    updatedAt: now(),
  }
}

/** Berechnet die Varianz eines Arrays */
function calculateVariance(values: number[]): number {
  if (values.length < 2) return 0
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  return values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length
}

// ============================================================
// Hauptfunktion
// ============================================================

/**
 * Aggregiert Langzeit-Stats aus mehreren 121-Leg-Stats.
 * @param legStats Array von Stats121Leg Objekten
 * @param playerId Spieler-ID
 * @param playerName Spieler-Name (optional)
 * @param existingStats Bestehende Langzeit-Stats (falls vorhanden)
 * @returns Aktualisierte Stats121LongTerm
 */
export function aggregate121LongTermStats(
  legStats: Stats121Leg[],
  playerId: string,
  playerName?: string,
  existingStats?: Stats121LongTerm
): Stats121LongTerm {
  if (legStats.length === 0 && !existingStats) {
    return createEmpty121LongTermStats(playerId, playerName)
  }

  // Filtere nur Stats für diesen Spieler
  const playerLegStats = legStats.filter(s => s.playerId === playerId)

  // Tracking-Variablen
  let totalLegs = existingStats?.totalLegs ?? 0
  let legsWon = existingStats?.legsWon ?? 0
  let checkoutAttempts = existingStats?.checkoutAttempts ?? 0
  let checkoutsMade = existingStats?.checkoutsMade ?? 0
  let totalDartsThrown = existingStats?.totalDartsThrown ?? 0
  let totalDartsToFinish = 0
  let totalDartsToFirstCheckout = 0
  let totalDartsOnDouble = 0
  let legsWithFinish = 0
  let legsWithFirstCheckout = 0
  let totalBusts = existingStats?.totalBusts ?? 0
  let doubleHitsAfterBust = existingStats?.doubleHitsAfterBust ?? 0
  let doubleHitsAfterMiss = existingStats?.doubleHitsAfterMiss ?? 0
  let doubleAttemptsAfterPressure = existingStats?.doubleAttemptsAfterPressure ?? 0

  // Double-Stats je Feld
  const doubleStats: Record<string, DoubleFieldStats> = { ...(existingStats?.doubleStats ?? {}) }

  // Route-Stats
  const routeMap: Record<string, { attempts: number; successes: number; busts: number }> = {}
  if (existingStats?.routeStats) {
    for (const rs of existingStats.routeStats) {
      routeMap[rs.route] = {
        attempts: rs.attempts,
        successes: rs.successes,
        busts: rs.bustCount,
      }
    }
  }

  // Finish-Darts für Varianz/Best/Worst
  const allFinishDarts: number[] = []
  let routeDeviations = 0
  let routeTotal = 0

  // Letzte 20 Legs für Trends
  const recent20FinishDarts: number[] = []
  const recent20CheckoutAttempts: { attempts: number; hits: number }[] = []

  for (const legStat of playerLegStats) {
    totalLegs++
    totalDartsThrown += legStat.visitsCount * 3 // Approximation

    // Busts
    totalBusts += legStat.bustCount

    // Checkout-Versuche (Darts auf Double)
    if (legStat.dartsOnDouble > 0) {
      checkoutAttempts += legStat.dartsOnDouble
      totalDartsOnDouble += legStat.dartsOnDouble
    }

    // Checkout gemacht?
    if (legStat.checkoutSuccess) {
      legsWon++
      checkoutsMade++

      if (legStat.dartsToFinish !== null) {
        totalDartsToFinish += legStat.dartsToFinish
        legsWithFinish++
        allFinishDarts.push(legStat.dartsToFinish)
        recent20FinishDarts.push(legStat.dartsToFinish)
        if (recent20FinishDarts.length > 20) recent20FinishDarts.shift()
      }

      // Double-Feld Statistik aktualisieren
      if (legStat.doubleFieldUsed) {
        const field = legStat.doubleFieldUsed
        if (!doubleStats[field]) {
          doubleStats[field] = {
            attempts: 0,
            hits: 0,
            hitRate: 0,
            avgDartsToHit: 0,
            totalDartsOn: 0,
          }
        }
        doubleStats[field].hits++
        doubleStats[field].totalDartsOn += legStat.dartsOnDouble
      }

      // Checkout nach Bust/Miss?
      if (legStat.checkoutAfterMiss) {
        doubleHitsAfterMiss++
        doubleAttemptsAfterPressure++
      }
      if (legStat.bustCount > 0) {
        doubleHitsAfterBust++
        doubleAttemptsAfterPressure++
      }
    }

    // Erste Checkout-Gelegenheit
    if (legStat.dartsToFirstCheckoutAttempt !== null) {
      totalDartsToFirstCheckout += legStat.dartsToFirstCheckoutAttempt
      legsWithFirstCheckout++
    }

    // Double-Attempts je Feld
    if (legStat.doubleFieldUsed && legStat.dartsOnDouble > 0) {
      const field = legStat.doubleFieldUsed
      if (!doubleStats[field]) {
        doubleStats[field] = {
          attempts: 0,
          hits: 0,
          hitRate: 0,
          avgDartsToHit: 0,
          totalDartsOn: 0,
        }
      }
      doubleStats[field].attempts += legStat.dartsOnDouble
    }

    // Checkout-Route tracking
    if (legStat.checkoutRoute) {
      const route = legStat.checkoutRoute.routeTaken.join(' ')
      routeTotal++
      if (legStat.checkoutRoute.deviatedFromOptimal) {
        routeDeviations++
      }

      if (!routeMap[route]) {
        routeMap[route] = { attempts: 0, successes: 0, busts: 0 }
      }
      routeMap[route].attempts++
      if (legStat.checkoutRoute.success) {
        routeMap[route].successes++
      }
    }

    // Trend-Tracking
    recent20CheckoutAttempts.push({
      attempts: legStat.dartsOnDouble,
      hits: legStat.checkoutSuccess ? 1 : 0,
    })
    if (recent20CheckoutAttempts.length > 20) recent20CheckoutAttempts.shift()
  }

  // Double-Stats Berechnungen finalisieren
  let bestDouble: { field: string; hitRate: number } | null = null
  let worstDouble: { field: string; hitRate: number } | null = null
  let preferredDouble: string | null = null
  let effectiveDouble: string | null = null
  let maxAttempts = 0
  let maxHitRate = 0
  let minHitRate = 100

  for (const [field, stats] of Object.entries(doubleStats)) {
    if (stats.attempts > 0) {
      stats.hitRate = (stats.hits / stats.attempts) * 100
      stats.avgDartsToHit = stats.hits > 0 ? stats.totalDartsOn / stats.hits : 0

      // Preferred Double (meiste Versuche)
      if (stats.attempts > maxAttempts) {
        maxAttempts = stats.attempts
        preferredDouble = field
      }

      // Best Double (höchste Trefferquote, min. 3 Versuche)
      if (stats.attempts >= 3 && stats.hitRate > maxHitRate) {
        maxHitRate = stats.hitRate
        bestDouble = { field, hitRate: stats.hitRate }
        effectiveDouble = field
      }

      // Worst Double (niedrigste Trefferquote, min. 3 Versuche)
      if (stats.attempts >= 3 && stats.hitRate < minHitRate) {
        minHitRate = stats.hitRate
        worstDouble = { field, hitRate: stats.hitRate }
      }
    }
  }

  // Route-Stats finalisieren
  const routeStats: CheckoutRouteStats[] = []
  let mostUsedRoute: string | null = null
  let mostUsedCount = 0
  let mostSuccessfulRoute: string | null = null
  let bestSuccessRate = 0

  for (const [route, data] of Object.entries(routeMap)) {
    const successRate = data.attempts > 0 ? (data.successes / data.attempts) * 100 : 0
    routeStats.push({
      route,
      attempts: data.attempts,
      successes: data.successes,
      successRate,
      bustCount: data.busts,
    })

    if (data.attempts > mostUsedCount) {
      mostUsedCount = data.attempts
      mostUsedRoute = route
    }
    if (successRate > bestSuccessRate && data.attempts >= 2) {
      bestSuccessRate = successRate
      mostSuccessfulRoute = route
    }
  }

  // Sortieren nach Erfolgsquote
  routeStats.sort((a, b) => b.successRate - a.successRate)

  // Finish-Statistiken
  const allFinishDartsCombined = [
    ...(existingStats ? [] : []), // Bei vorhandenen Stats nicht verdoppeln
    ...allFinishDarts,
  ]
  const bestFinishDarts = allFinishDartsCombined.length > 0
    ? Math.min(...allFinishDartsCombined, existingStats?.bestFinishDarts ?? Infinity)
    : existingStats?.bestFinishDarts ?? null
  const worstFinishDarts = allFinishDartsCombined.length > 0
    ? Math.max(...allFinishDartsCombined, existingStats?.worstFinishDarts ?? 0)
    : existingStats?.worstFinishDarts ?? null
  const finishDartsVariance = calculateVariance(allFinishDarts)

  // Durchschnittswerte berechnen
  const avgDartsToFinish = legsWithFinish > 0 ? totalDartsToFinish / legsWithFinish : 0
  const avgDartsToFirstCheckoutAttempt = legsWithFirstCheckout > 0
    ? totalDartsToFirstCheckout / legsWithFirstCheckout
    : 0
  const avgDartsOnDouble = checkoutAttempts > 0 ? totalDartsOnDouble / checkoutsMade : 0

  // Checkout-Quote
  const checkoutPct = checkoutAttempts > 0 ? (checkoutsMade / checkoutAttempts) * 100 : 0

  // Bust-Rate
  const bustRate = totalLegs > 0 ? (totalBusts / totalLegs) * 100 : 0

  // Route-Deviation-Rate
  const routeDeviationRate = routeTotal > 0 ? (routeDeviations / routeTotal) * 100 : 0

  // Prozent unter persönlichem Durchschnitt
  const belowAvgCount = allFinishDarts.filter(d => d > avgDartsToFinish).length
  const pctBelowPersonalAvg = allFinishDarts.length > 0 ? (belowAvgCount / allFinishDarts.length) * 100 : 0

  // Moving Average (letzte 10 Legs)
  const last10 = recent20FinishDarts.slice(-10)
  const movingAvg10 = last10.length > 0 ? last10.reduce((a, b) => a + b, 0) / last10.length : avgDartsToFinish

  // Trends berechnen
  const older10 = recent20FinishDarts.slice(0, 10)
  const checkoutPctTrend = calculateTrend(
    recent20CheckoutAttempts.slice(-10).map(c => c.attempts > 0 ? c.hits / c.attempts : 0),
    recent20CheckoutAttempts.slice(0, 10).map(c => c.attempts > 0 ? c.hits / c.attempts : 0)
  )
  // Für Double-Effizienz: weniger Darts = besser, also invertierte Logik
  const doubleEfficiencyTrend = calculateTrend(
    last10.map(d => 1 / d), // Invertiert für "besser = höher"
    older10.map(d => 1 / d)
  )

  // 121-Skill-Score berechnen
  const skillScore = calculate121SkillScore(
    checkoutPct,
    avgDartsToFinish,
    avgDartsOnDouble,
    pctBelowPersonalAvg
  )

  return {
    playerId,
    playerName: playerName ?? existingStats?.playerName,

    totalLegs,
    legsWon,

    checkoutAttempts,
    checkoutsMade,
    checkoutPct,

    avgDartsToFinish,
    avgDartsToFirstCheckoutAttempt,
    avgDartsOnDouble,
    totalDartsThrown,

    doubleStats,
    bestDouble,
    worstDouble,
    preferredDouble,
    effectiveDouble,

    doubleHitsAfterBust,
    doubleHitsAfterMiss,
    doubleAttemptsAfterPressure,

    routeStats,
    mostUsedRoute,
    mostSuccessfulRoute,
    routeDeviationRate,

    bestFinishDarts,
    worstFinishDarts,
    finishDartsVariance,
    pctBelowPersonalAvg,
    personalBest: bestFinishDarts,

    movingAvg10,
    checkoutPctTrend,
    doubleEfficiencyTrend,

    skillScore,

    totalBusts,
    bustRate,

    updatedAt: now(),
  }
}

/**
 * Berechnet Langzeit-Stats aus einem kompletten Match.
 * @param matchId Match-ID
 * @param events Alle Events des Matches
 * @returns Record mit Stats121LongTerm pro Spieler
 */
export function compute121LongTermStatsFromMatch(
  matchId: string,
  events: DartsEvent[]
): Record<string, Stats121LongTerm> {
  const matchStart = events.find(e => e.type === 'MatchStarted') as MatchStarted | undefined
  if (!matchStart || matchStart.startingScorePerLeg !== 121) {
    return {}
  }

  const legFinishedEvents = events.filter(e => e.type === 'LegFinished') as LegFinished[]
  const result: Record<string, Stats121LongTerm> = {}

  for (const player of matchStart.players) {
    const legStats: Stats121Leg[] = []

    for (const legFinish of legFinishedEvents) {
      const legStat = compute121LegStats(events, legFinish.legId, player.playerId)
      if (legStat) {
        legStats.push(legStat)
      }
    }

    result[player.playerId] = aggregate121LongTermStats(
      legStats,
      player.playerId,
      player.name
    )
  }

  return result
}
