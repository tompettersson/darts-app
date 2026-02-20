// src/stats/computeTrendData.ts
// Berechnet Trend-Daten für mehrere Spieler (für Vergleiche-Feature)

import { getNon121Matches, getCricketMatches, getCricketComputedStats, getATBMatches, getCTFMatches, getStrMatches, getHighscoreMatches, getShanghaiMatches, getKillerMatches } from '../storage'
import { computeStats } from '../darts501'
import { computeATBMatchStats } from './computeATBStats'
import { computeCTFMatchStats } from './computeCTFStats'
import { computeStrMatchStats } from './computeStraeusschenStats'
import { computeHighscoreMatchStats } from './computeHighscoreStats'
import { computeShanghaiMatchStats } from './computeShanghaiStats'
import { computeKillerMatchStats } from './computeKillerStats'

/**
 * Ermittelt die Spieleranzahl eines Matches (universal fuer alle Modi).
 * Prueft: m.players (ATB/CTF/STR/Highscore/Shanghai),
 *         m.playerIds (X01/Cricket),
 *         oder events[0].players (aus MatchStarted-Event).
 */
function getPlayerCount(m: any): number {
  if (Array.isArray(m.players) && m.players.length > 0) return m.players.length
  if (Array.isArray(m.playerIds) && m.playerIds.length > 0) return m.playerIds.length
  // Fallback: aus dem ersten Event (MatchStarted) die Spieler zaehlen
  const events = m.events
  if (Array.isArray(events) && events.length > 0) {
    const start = events[0]
    if (Array.isArray(start?.players)) return start.players.length
    if (Array.isArray(start?.playerIds)) return start.playerIds.length
  }
  return 0
}

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
export function computeX01Trends(playerId: string, limit: number = 30, multiplayerOnly: boolean = false): X01TrendData {
  const ms = (getNon121Matches() || []) as any[]
  let finished = ms.filter(m => m.finished).sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))
  if (multiplayerOnly) finished = finished.filter(m => getPlayerCount(m) > 1)

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
export function computeCricketTrends(playerId: string, limit: number = 30, multiplayerOnly: boolean = false): CricketTrendData {
  const cms = (getCricketMatches() || []) as any[]
  let finished = cms.filter(m => m.finished).sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))
  if (multiplayerOnly) finished = finished.filter(m => getPlayerCount(m) > 1)

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
// ATB TRENDS
// ============================================================

export type ATBTrendData = {
  playerId: string
  hitRateTrend: number[]
  dartsPerFieldTrend: number[]
}

export function computeATBTrends(playerId: string, limit: number = 30, multiplayerOnly: boolean = false): ATBTrendData {
  const ms = (getATBMatches() || []) as any[]
  let finished = ms.filter((m: any) => m.finished).sort((a: any, b: any) => (a.createdAt < b.createdAt ? -1 : 1))
  if (multiplayerOnly) finished = finished.filter(m => getPlayerCount(m) > 1)

  const hitRateTrend: number[] = []
  const dartsPerFieldTrend: number[] = []

  for (const m of finished) {
    const stats = computeATBMatchStats(m)
    const ps = stats.find(s => s.playerId === playerId)
    if (!ps) continue

    hitRateTrend.push(ps.hitRate / 100) // normalize to 0-1 for percent format
    dartsPerFieldTrend.push(ps.avgDartsPerField)
  }

  return {
    playerId,
    hitRateTrend: hitRateTrend.slice(-limit),
    dartsPerFieldTrend: dartsPerFieldTrend.slice(-limit),
  }
}

// ============================================================
// CTF TRENDS
// ============================================================

export type CTFTrendData = {
  playerId: string
  hitRateTrend: number[]
  scoreTrend: number[]
  fieldsWonTrend: number[]
}

export function computeCTFTrends(playerId: string, limit: number = 30, multiplayerOnly: boolean = false): CTFTrendData {
  const ms = (getCTFMatches() || []) as any[]
  let finished = ms.filter((m: any) => m.finished).sort((a: any, b: any) => (a.createdAt < b.createdAt ? -1 : 1))
  if (multiplayerOnly) finished = finished.filter(m => getPlayerCount(m) > 1)

  const hitRateTrend: number[] = []
  const scoreTrend: number[] = []
  const fieldsWonTrend: number[] = []

  for (const m of finished) {
    const stats = computeCTFMatchStats(m)
    const ps = stats.find(s => s.playerId === playerId)
    if (!ps) continue

    hitRateTrend.push(ps.hitRate / 100)
    scoreTrend.push(ps.totalScore)
    fieldsWonTrend.push(ps.fieldsWon)
  }

  return {
    playerId,
    hitRateTrend: hitRateTrend.slice(-limit),
    scoreTrend: scoreTrend.slice(-limit),
    fieldsWonTrend: fieldsWonTrend.slice(-limit),
  }
}

// ============================================================
// STR TRENDS
// ============================================================

export type StrTrendData = {
  playerId: string
  hitRateTrend: number[]
  dartsPerFieldTrend: number[]
}

export function computeStrTrends(playerId: string, limit: number = 30, multiplayerOnly: boolean = false): StrTrendData {
  const ms = (getStrMatches() || []) as any[]
  let finished = ms.filter((m: any) => m.finished).sort((a: any, b: any) => (a.createdAt < b.createdAt ? -1 : 1))
  if (multiplayerOnly) finished = finished.filter(m => getPlayerCount(m) > 1)

  const hitRateTrend: number[] = []
  const dartsPerFieldTrend: number[] = []

  for (const m of finished) {
    const players = (m.players || []).map((p: any) => ({ playerId: p.playerId ?? p.id, name: p.name }))
    const stats = computeStrMatchStats(m.events || [], players)
    const ps = stats.find(s => s.playerId === playerId)
    if (!ps) continue

    hitRateTrend.push(ps.hitRate / 100)
    // Ø Darts pro Feld: totalDarts / Anzahl der gespielten Felder
    const fieldsCompleted = ps.avgFields.filter(f => f.timesPlayed > 0).length
    const dartsPerField = fieldsCompleted > 0 ? ps.totalDarts / fieldsCompleted : 0
    dartsPerFieldTrend.push(dartsPerField)
  }

  return {
    playerId,
    hitRateTrend: hitRateTrend.slice(-limit),
    dartsPerFieldTrend: dartsPerFieldTrend.slice(-limit),
  }
}

// ============================================================
// HIGHSCORE TRENDS
// ============================================================

export type HighscoreTrendData = {
  playerId: string
  avgPerTurnTrend: number[]
  bestTurnTrend: number[]
}

export function computeHighscoreTrends(playerId: string, limit: number = 30, multiplayerOnly: boolean = false): HighscoreTrendData {
  const ms = (getHighscoreMatches() || []) as any[]
  let finished = ms.filter((m: any) => m.finished).sort((a: any, b: any) => (a.createdAt < b.createdAt ? -1 : 1))
  if (multiplayerOnly) finished = finished.filter(m => getPlayerCount(m) > 1)

  const avgPerTurnTrend: number[] = []
  const bestTurnTrend: number[] = []

  for (const m of finished) {
    const stats = computeHighscoreMatchStats(m)
    const ps = stats.find(s => s.playerId === playerId)
    if (!ps) continue

    avgPerTurnTrend.push(ps.avgPointsPerTurn)
    bestTurnTrend.push(ps.bestTurn)
  }

  return {
    playerId,
    avgPerTurnTrend: avgPerTurnTrend.slice(-limit),
    bestTurnTrend: bestTurnTrend.slice(-limit),
  }
}

// ============================================================
// SHANGHAI TRENDS
// ============================================================

export type ShanghaiTrendData = {
  playerId: string
  totalScoreTrend: number[]
  avgPerRoundTrend: number[]
  hitRateTrend: number[]
}

export function computeShanghaiTrends(playerId: string, limit: number = 30, multiplayerOnly: boolean = false): ShanghaiTrendData {
  const ms = (getShanghaiMatches() || []) as any[]
  let finished = ms.filter((m: any) => m.finished).sort((a: any, b: any) => (a.createdAt < b.createdAt ? -1 : 1))
  if (multiplayerOnly) finished = finished.filter(m => getPlayerCount(m) > 1)

  const totalScoreTrend: number[] = []
  const avgPerRoundTrend: number[] = []
  const hitRateTrend: number[] = []

  for (const m of finished) {
    const stats = computeShanghaiMatchStats(m, playerId)
    if (!stats) continue

    totalScoreTrend.push(stats.totalScore)
    avgPerRoundTrend.push(stats.avgPerRound)
    hitRateTrend.push(stats.hitRate / 100)
  }

  return {
    playerId,
    totalScoreTrend: totalScoreTrend.slice(-limit),
    avgPerRoundTrend: avgPerRoundTrend.slice(-limit),
    hitRateTrend: hitRateTrend.slice(-limit),
  }
}

// ============================================================
// KILLER TRENDS
// ============================================================

export type KillerTrendData = {
  playerId: string
  killsTrend: number[]
  survivedRoundsTrend: number[]
  positionTrend: number[]
}

export function computeKillerTrends(playerId: string, limit: number = 30, multiplayerOnly: boolean = false): KillerTrendData {
  const ms = (getKillerMatches() || []) as any[]
  let finished = ms.filter((m: any) => m.finished).sort((a: any, b: any) => (a.createdAt < b.createdAt ? -1 : 1))
  if (multiplayerOnly) finished = finished.filter(m => getPlayerCount(m) > 1)

  const killsTrend: number[] = []
  const survivedRoundsTrend: number[] = []
  const positionTrend: number[] = []

  for (const m of finished) {
    const stats = computeKillerMatchStats(m, playerId)
    if (!stats) continue

    killsTrend.push(stats.totalKills)
    survivedRoundsTrend.push(stats.survivedRounds)
    positionTrend.push(stats.finalPosition)
  }

  return {
    playerId,
    killsTrend: killsTrend.slice(-limit),
    survivedRoundsTrend: survivedRoundsTrend.slice(-limit),
    positionTrend: positionTrend.slice(-limit),
  }
}

// ============================================================
// ALLE TRENDS FÜR MEHRERE SPIELER
// ============================================================

export type MetricId =
  | 'tda' | 'first9' | 'doublePct'
  | 'mpt' | 'mpd' | 'noScore' | 'legWR' | 'matchWR'
  | 'atbHitRate' | 'atbDartsPerField'
  | 'ctfHitRate' | 'ctfScore' | 'ctfFieldsWon'
  | 'strHitRate' | 'strDartsPerField'
  | 'hsAvgPerTurn' | 'hsBestTurn'
  | 'shTotalScore' | 'shAvgPerRound' | 'shHitRate'
  | 'klKills' | 'klSurvivedRounds' | 'klPosition'

export type MetricConfig = {
  id: MetricId
  label: string
  mode: 'x01' | 'cricket' | 'atb' | 'ctf' | 'str' | 'highscore' | 'shanghai' | 'killer'
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
  // ATB
  { id: 'atbHitRate', label: 'Trefferquote', mode: 'atb', format: 'percent' },
  { id: 'atbDartsPerField', label: 'Ø Darts/Feld', mode: 'atb', format: 'decimal' },
  // CTF
  { id: 'ctfHitRate', label: 'Trefferquote', mode: 'ctf', format: 'percent' },
  { id: 'ctfScore', label: 'Gesamtpunktzahl', mode: 'ctf', format: 'decimal' },
  { id: 'ctfFieldsWon', label: 'Felder gewonnen', mode: 'ctf', format: 'decimal' },
  // STR
  { id: 'strHitRate', label: 'Trefferquote', mode: 'str', format: 'percent' },
  { id: 'strDartsPerField', label: 'Ø Darts/Feld', mode: 'str', format: 'decimal' },
  // Highscore
  { id: 'hsAvgPerTurn', label: 'Ø Punkte/Aufnahme', mode: 'highscore', format: 'decimal' },
  { id: 'hsBestTurn', label: 'Beste Aufnahme', mode: 'highscore', format: 'decimal' },
  // Shanghai
  { id: 'shTotalScore', label: 'Gesamtpunktzahl', mode: 'shanghai', format: 'decimal' },
  { id: 'shAvgPerRound', label: 'Ø Punkte/Runde', mode: 'shanghai', format: 'decimal' },
  { id: 'shHitRate', label: 'Trefferquote', mode: 'shanghai', format: 'percent' },
  // Killer
  { id: 'klKills', label: 'Kills', mode: 'killer', format: 'decimal' },
  { id: 'klSurvivedRounds', label: 'Überlebte Runden', mode: 'killer', format: 'decimal' },
  { id: 'klPosition', label: 'Platzierung', mode: 'killer', format: 'decimal' },
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
  limit: number = 30,
  multiplayerOnly: boolean = false
): { playerId: string; values: number[] }[] {
  const results: { playerId: string; values: number[] }[] = []

  for (const playerId of playerIds) {
    let values: number[] = []

    switch (metricId) {
      case 'tda': {
        const data = computeX01Trends(playerId, limit, multiplayerOnly)
        values = data.tdaTrend
        break
      }
      case 'first9': {
        const data = computeX01Trends(playerId, limit, multiplayerOnly)
        values = data.first9Trend
        break
      }
      case 'doublePct': {
        const data = computeX01Trends(playerId, limit, multiplayerOnly)
        values = data.doublePctTrend
        break
      }
      case 'mpt': {
        const data = computeCricketTrends(playerId, limit, multiplayerOnly)
        values = data.mptTrend
        break
      }
      case 'mpd': {
        const data = computeCricketTrends(playerId, limit, multiplayerOnly)
        values = data.mpdTrend
        break
      }
      case 'noScore': {
        const data = computeCricketTrends(playerId, limit, multiplayerOnly)
        values = data.nstrTrend
        break
      }
      case 'legWR': {
        const data = computeCricketTrends(playerId, limit, multiplayerOnly)
        values = data.legWRTrend
        break
      }
      case 'matchWR': {
        const data = computeCricketTrends(playerId, limit, multiplayerOnly)
        values = data.matchWRTrend
        break
      }
      // ATB
      case 'atbHitRate': {
        const data = computeATBTrends(playerId, limit, multiplayerOnly)
        values = data.hitRateTrend
        break
      }
      case 'atbDartsPerField': {
        const data = computeATBTrends(playerId, limit, multiplayerOnly)
        values = data.dartsPerFieldTrend
        break
      }
      // CTF
      case 'ctfHitRate': {
        const data = computeCTFTrends(playerId, limit, multiplayerOnly)
        values = data.hitRateTrend
        break
      }
      case 'ctfScore': {
        const data = computeCTFTrends(playerId, limit, multiplayerOnly)
        values = data.scoreTrend
        break
      }
      case 'ctfFieldsWon': {
        const data = computeCTFTrends(playerId, limit, multiplayerOnly)
        values = data.fieldsWonTrend
        break
      }
      // STR
      case 'strHitRate': {
        const data = computeStrTrends(playerId, limit, multiplayerOnly)
        values = data.hitRateTrend
        break
      }
      case 'strDartsPerField': {
        const data = computeStrTrends(playerId, limit, multiplayerOnly)
        values = data.dartsPerFieldTrend
        break
      }
      // Highscore
      case 'hsAvgPerTurn': {
        const data = computeHighscoreTrends(playerId, limit, multiplayerOnly)
        values = data.avgPerTurnTrend
        break
      }
      case 'hsBestTurn': {
        const data = computeHighscoreTrends(playerId, limit, multiplayerOnly)
        values = data.bestTurnTrend
        break
      }
      // Shanghai
      case 'shTotalScore': {
        const data = computeShanghaiTrends(playerId, limit, multiplayerOnly)
        values = data.totalScoreTrend
        break
      }
      case 'shAvgPerRound': {
        const data = computeShanghaiTrends(playerId, limit, multiplayerOnly)
        values = data.avgPerRoundTrend
        break
      }
      case 'shHitRate': {
        const data = computeShanghaiTrends(playerId, limit, multiplayerOnly)
        values = data.hitRateTrend
        break
      }
      // Killer
      case 'klKills': {
        const data = computeKillerTrends(playerId, limit, multiplayerOnly)
        values = data.killsTrend
        break
      }
      case 'klSurvivedRounds': {
        const data = computeKillerTrends(playerId, limit, multiplayerOnly)
        values = data.survivedRoundsTrend
        break
      }
      case 'klPosition': {
        const data = computeKillerTrends(playerId, limit, multiplayerOnly)
        values = data.positionTrend
        break
      }
    }

    results.push({ playerId, values })
  }

  return results
}
