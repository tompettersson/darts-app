// src/stats/computeTrendData.ts
// Berechnet Trend-Daten für mehrere Spieler (für Vergleiche-Feature)

import { getNon121Matches, getCricketMatches, getCricketComputedStats } from '../storage'
import { computeStats } from '../darts501'

// ============================================================
// TYPEN
// ============================================================

export type X01TrendData = {
  playerId: string
  tdaTrend: number[]       // 3-Dart-Average pro Match
  first9Trend: number[]    // First-9 Average pro Match
  doublePctTrend: number[] // Double% pro Match
}

export type CricketTrendData = {
  playerId: string
  mptTrend: number[]      // Marks per Turn
  mpdTrend: number[]      // Marks per Dart
  nstrTrend: number[]     // No-Score Turn Rate (0-1)
  legWRTrend: number[]    // Leg Win Rate (0-1)
  matchWRTrend: number[]  // Match Win Rate (0/1)
}

// ============================================================
// X01 TRENDS
// ============================================================

/**
 * Berechnet X01 Trend-Daten für einen Spieler
 * @param playerId - Spieler-ID
 * @param limit - Anzahl der letzten Matches (default: 30)
 */
export function computeX01Trends(playerId: string, limit: number = 30): X01TrendData {
  const ms = (getNon121Matches() || []) as any[]
  const finished = ms.filter(m => m.finished).sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))

  const tdaTrend: number[] = []
  const first9Trend: number[] = []
  const doublePctTrend: number[] = []

  for (const m of finished) {
    const stats = computeStats(m.events || [])
    const p = stats[playerId]
    if (!p) continue

    // 3-Dart Average
    const tda = p.dartsThrown > 0 ? (p.pointsScored / p.dartsThrown) * 3 : 0
    tdaTrend.push(tda)

    // First-9 Average (aus den Events berechnen)
    const events = m.events || []
    let currentLeg = 0
    let legVisitCount: Record<number, number> = {}
    let first9Points = 0
    let first9Darts = 0

    for (const ev of events) {
      if (ev?.type === 'LegStarted') {
        currentLeg++
        legVisitCount[currentLeg] = 0
      }
      if (ev?.type === 'VisitAdded' && ev.playerId === playerId) {
        legVisitCount[currentLeg] = (legVisitCount[currentLeg] || 0) + 1
        // Nur die ersten 3 Aufnahmen pro Leg zählen (= 9 Darts)
        if (legVisitCount[currentLeg] <= 3) {
          first9Points += ev.visitScore || 0
          first9Darts += (ev.darts?.length || 3)
        }
      }
    }
    const f9 = first9Darts > 0 ? (first9Points / first9Darts) * 3 : 0
    first9Trend.push(f9)

    // Double%
    const dblPct = (p.doubleAttemptsDart ?? 0) > 0
      ? (p.doublesHitDart ?? 0) / (p.doubleAttemptsDart ?? 1)
      : 0
    doublePctTrend.push(dblPct)
  }

  return {
    playerId,
    tdaTrend: tdaTrend.slice(-limit),
    first9Trend: first9Trend.slice(-limit),
    doublePctTrend: doublePctTrend.slice(-limit),
  }
}

// ============================================================
// CRICKET TRENDS
// ============================================================

/**
 * Berechnet Cricket Trend-Daten für einen Spieler
 * @param playerId - Spieler-ID
 * @param limit - Anzahl der letzten Matches (default: 30)
 */
export function computeCricketTrends(playerId: string, limit: number = 30): CricketTrendData {
  const cms = (getCricketMatches() || []) as any[]
  const finished = cms.filter(m => m.finished).sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))

  const mpdTrend: number[] = []
  const mptTrend: number[] = []
  const nstrTrend: number[] = []
  const legWRTrend: number[] = []
  const matchWRTrend: number[] = []

  for (const m of finished) {
    let comp: any = null
    try {
      comp = getCricketComputedStats(m.id)
    } catch {
      comp = null
    }
    if (!comp) continue

    const ps = (comp.players || []).find((p: any) => p.playerId === playerId)
    if (!ps) continue

    // Match Win
    const fin = (m.events || []).find((ev: any) => ev?.type === 'CricketMatchFinished')
    const won = fin?.winnerPlayerId === playerId
    matchWRTrend.push(won ? 1 : 0)

    // Leg Win Rate
    const lp = Array.isArray(m.events)
      ? m.events.filter((ev: any) => ev?.type === 'CricketLegFinished').length
      : 0
    const legWR = lp > 0 ? (ps.legsWon ?? 0) / lp : NaN
    if (isFinite(legWR)) legWRTrend.push(legWR)

    // Marks per Dart
    const darts = typeof ps?.dartsThrown === 'number' ? ps.dartsThrown : NaN
    const mpd = isFinite(darts) && darts > 0
      ? (ps.totalMarks ?? 0) / darts
      : (typeof ps?.marksPerDart === 'number' ? ps.marksPerDart : NaN)
    if (isFinite(mpd)) mpdTrend.push(mpd)

    // Marks per Turn
    const mpt = typeof ps?.marksPerTurn === 'number' ? ps.marksPerTurn : NaN
    if (isFinite(mpt)) mptTrend.push(mpt)

    // No-Score Turn Rate
    let nstr = NaN
    if (typeof ps?.turnsWithNoScore === 'number' && typeof ps?.totalTurns === 'number' && ps.totalTurns > 0) {
      nstr = ps.turnsWithNoScore / ps.totalTurns
    }
    if (isFinite(nstr)) nstrTrend.push(nstr)
  }

  return {
    playerId,
    mpdTrend: mpdTrend.slice(-limit),
    mptTrend: mptTrend.slice(-limit),
    nstrTrend: nstrTrend.slice(-limit),
    legWRTrend: legWRTrend.slice(-limit),
    matchWRTrend: matchWRTrend.slice(-limit),
  }
}

// ============================================================
// ALLE TRENDS FÜR MEHRERE SPIELER
// ============================================================

export type MetricId = 'tda' | 'first9' | 'doublePct' | 'mpt' | 'mpd' | 'noScore' | 'legWR' | 'matchWR'

export type MetricConfig = {
  id: MetricId
  label: string
  mode: 'x01' | 'cricket'
  format: 'decimal' | 'percent'
}

export const AVAILABLE_METRICS: MetricConfig[] = [
  // X01
  { id: 'tda', label: '3-Dart-Average', mode: 'x01', format: 'decimal' },
  { id: 'first9', label: 'First-9 Average', mode: 'x01', format: 'decimal' },
  { id: 'doublePct', label: 'Double%', mode: 'x01', format: 'percent' },
  // Cricket
  { id: 'mpt', label: 'Marks/Runde', mode: 'cricket', format: 'decimal' },
  { id: 'mpd', label: 'Marks/Pfeil', mode: 'cricket', format: 'decimal' },
  { id: 'noScore', label: 'No-Score %', mode: 'cricket', format: 'percent' },
  { id: 'legWR', label: 'Leg-Win-Rate', mode: 'cricket', format: 'percent' },
  { id: 'matchWR', label: 'Match-Win-Rate', mode: 'cricket', format: 'percent' },
]

/**
 * Gibt Trend-Werte für eine bestimmte Metrik und mehrere Spieler zurück
 * @param metricId - ID der Metrik
 * @param playerIds - Array von Spieler-IDs
 * @param limit - Anzahl der letzten Matches (default: 30)
 */
export function getTrendForMetric(
  metricId: MetricId,
  playerIds: string[],
  limit: number = 30
): { playerId: string; values: number[] }[] {
  const results: { playerId: string; values: number[] }[] = []

  for (const playerId of playerIds) {
    let values: number[] = []

    switch (metricId) {
      case 'tda': {
        const data = computeX01Trends(playerId, limit)
        values = data.tdaTrend
        break
      }
      case 'first9': {
        const data = computeX01Trends(playerId, limit)
        values = data.first9Trend
        break
      }
      case 'doublePct': {
        const data = computeX01Trends(playerId, limit)
        values = data.doublePctTrend
        break
      }
      case 'mpt': {
        const data = computeCricketTrends(playerId, limit)
        values = data.mptTrend
        break
      }
      case 'mpd': {
        const data = computeCricketTrends(playerId, limit)
        values = data.mpdTrend
        break
      }
      case 'noScore': {
        const data = computeCricketTrends(playerId, limit)
        values = data.nstrTrend
        break
      }
      case 'legWR': {
        const data = computeCricketTrends(playerId, limit)
        values = data.legWRTrend
        break
      }
      case 'matchWR': {
        const data = computeCricketTrends(playerId, limit)
        values = data.matchWRTrend
        break
      }
    }

    results.push({ playerId, values })
  }

  return results
}
