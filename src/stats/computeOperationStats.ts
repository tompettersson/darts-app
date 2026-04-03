// src/stats/computeOperationStats.ts
// Berechnet Match-Stats fuer Operation

import type { OperationStoredMatch, OperationDartEvent } from '../types/operation'
import { applyOperationEvents, isHit } from '../dartsOperation'

export type OperationLegStats = {
  legIndex: number
  targetNumber?: number
  totalScore: number
  hitScore: number
  totalDarts: number
  hitRate: number
  avgPointsPerDart: number
  avgHitScorePerDart: number
  maxHitStreak: number
  noScoreCount: number
  singleCount: number
  doubleCount: number
  tripleCount: number
  singleBullCount: number
  doubleBullCount: number
  bestTurnScore: number
  noScoreTurns: number
}

export type OperationMatchStats = {
  totalScore: number
  totalHitScore: number
  totalDarts: number
  hitRate: number
  avgPointsPerDart: number
  avgHitScorePerDart: number
  maxHitStreak: number
  noScoreCount: number
  singleCount: number
  doubleCount: number
  tripleCount: number
  singleBullCount: number
  doubleBullCount: number
  bestTurnScore: number
  noScoreTurns: number
  legScores: number[]
  legHitScores: number[]
  legHitRates: number[]
  legStats: OperationLegStats[]
}

function computeBestTurnScore(events: OperationDartEvent[]): number {
  const turnScores = new Map<number, number>()
  for (const ev of events) {
    const key = ev.turnIndex
    turnScores.set(key, (turnScores.get(key) ?? 0) + ev.points)
  }
  return turnScores.size > 0 ? Math.max(...turnScores.values()) : 0
}

/**
 * Zaehlt Turns (Gruppen von 3 Darts) in denen der Spieler 0 Punkte erzielt hat.
 */
function computeNoScoreTurns(events: OperationDartEvent[]): number {
  const turnScores = new Map<number, number>()
  const turnDarts = new Map<number, number>()
  for (const ev of events) {
    const key = ev.turnIndex
    turnScores.set(key, (turnScores.get(key) ?? 0) + ev.points)
    turnDarts.set(key, (turnDarts.get(key) ?? 0) + 1)
  }
  let count = 0
  for (const [turn, score] of turnScores) {
    // Nur vollstaendige Turns zaehlen (3 Darts)
    if ((turnDarts.get(turn) ?? 0) >= 3 && score === 0) count++
  }
  return count
}

export function computeOperationLegStats(
  match: OperationStoredMatch,
  playerId: string,
  legIndex: number
): OperationLegStats | null {
  const state = applyOperationEvents(match.events)
  const leg = state.legs[legIndex]
  if (!leg) return null

  const ps = leg.players.find(p => p.playerId === playerId)
  if (!ps) return null

  const hits = ps.dartsThrown - ps.noScoreCount
  const hitRate = ps.dartsThrown > 0 ? (hits / ps.dartsThrown) * 100 : 0
  const avgPointsPerDart = ps.dartsThrown > 0 ? ps.totalScore / ps.dartsThrown : 0

  const hs = ps.hitScore
  const avgHitScorePerDart = ps.dartsThrown > 0 ? hs / ps.dartsThrown : 0

  return {
    legIndex,
    targetNumber: leg.targetNumber,
    totalScore: ps.totalScore,
    hitScore: hs,
    totalDarts: ps.dartsThrown,
    hitRate,
    avgPointsPerDart,
    avgHitScorePerDart,
    maxHitStreak: ps.maxHitStreak,
    noScoreCount: ps.noScoreCount,
    singleCount: ps.singleCount,
    doubleCount: ps.doubleCount,
    tripleCount: ps.tripleCount,
    singleBullCount: ps.singleBullCount,
    doubleBullCount: ps.doubleBullCount,
    bestTurnScore: computeBestTurnScore(ps.events),
    noScoreTurns: computeNoScoreTurns(ps.events),
  }
}

export function computeOperationMatchStats(
  match: OperationStoredMatch,
  playerId: string
): OperationMatchStats | null {
  const state = applyOperationEvents(match.events)

  let totalScore = 0
  let totalHitScore = 0
  let totalDarts = 0
  let totalHits = 0
  let maxHitStreak = 0
  let noScoreCount = 0
  let singleCount = 0
  let doubleCount = 0
  let tripleCount = 0
  let singleBullCount = 0
  let doubleBullCount = 0
  let bestTurnScore = 0
  let noScoreTurns = 0
  const legScores: number[] = []
  const legHitScores: number[] = []
  const legHitRates: number[] = []
  const legStats: OperationLegStats[] = []

  for (const leg of state.legs) {
    const ps = leg.players.find(p => p.playerId === playerId)
    if (!ps) continue

    const hits = ps.dartsThrown - ps.noScoreCount
    totalScore += ps.totalScore
    totalHitScore += ps.hitScore
    totalDarts += ps.dartsThrown
    totalHits += hits
    if (ps.maxHitStreak > maxHitStreak) maxHitStreak = ps.maxHitStreak
    noScoreCount += ps.noScoreCount
    singleCount += ps.singleCount
    doubleCount += ps.doubleCount
    tripleCount += ps.tripleCount
    singleBullCount += ps.singleBullCount
    doubleBullCount += ps.doubleBullCount

    const turnScore = computeBestTurnScore(ps.events)
    if (turnScore > bestTurnScore) bestTurnScore = turnScore

    const legNoScoreTurns = computeNoScoreTurns(ps.events)
    noScoreTurns += legNoScoreTurns

    legScores.push(ps.totalScore)
    legHitScores.push(ps.hitScore)
    const lr = ps.dartsThrown > 0 ? (hits / ps.dartsThrown) * 100 : 0
    legHitRates.push(lr)

    legStats.push({
      legIndex: leg.legIndex,
      targetNumber: leg.targetNumber,
      totalScore: ps.totalScore,
      hitScore: ps.hitScore,
      totalDarts: ps.dartsThrown,
      hitRate: lr,
      avgPointsPerDart: ps.dartsThrown > 0 ? ps.totalScore / ps.dartsThrown : 0,
      avgHitScorePerDart: ps.dartsThrown > 0 ? ps.hitScore / ps.dartsThrown : 0,
      maxHitStreak: ps.maxHitStreak,
      noScoreCount: ps.noScoreCount,
      singleCount: ps.singleCount,
      doubleCount: ps.doubleCount,
      tripleCount: ps.tripleCount,
      singleBullCount: ps.singleBullCount,
      doubleBullCount: ps.doubleBullCount,
      bestTurnScore: turnScore,
      noScoreTurns: legNoScoreTurns,
    })
  }

  const hitRate = totalDarts > 0 ? (totalHits / totalDarts) * 100 : 0
  const avgPointsPerDart = totalDarts > 0 ? totalScore / totalDarts : 0
  const avgHitScorePerDart = totalDarts > 0 ? totalHitScore / totalDarts : 0

  return {
    totalScore,
    totalHitScore,
    totalDarts,
    hitRate,
    avgPointsPerDart,
    avgHitScorePerDart,
    maxHitStreak,
    noScoreCount,
    singleCount,
    doubleCount,
    tripleCount,
    singleBullCount,
    doubleBullCount,
    bestTurnScore,
    noScoreTurns,
    legScores,
    legHitScores,
    legHitRates,
    legStats,
  }
}

/**
 * Head-to-Head Vergleich fuer Operation
 */
export type OperationHeadToHead = {
  matchesPlayed: number
  p1Wins: number
  p2Wins: number
  p1AvgScore: number
  p2AvgScore: number
  p1AvgHitRate: number
  p2AvgHitRate: number
  p1BestScore: number
  p2BestScore: number
  p1LegsWon: number
  p2LegsWon: number
}

export function computeOperationHeadToHead(
  matches: OperationStoredMatch[],
  p1Id: string,
  p2Id: string
): OperationHeadToHead | null {
  const shared = matches.filter(m =>
    m.finished &&
    m.players.some(p => p.playerId === p1Id) &&
    m.players.some(p => p.playerId === p2Id)
  )

  if (shared.length === 0) return null

  let p1Wins = 0
  let p2Wins = 0
  let p1LegsWon = 0
  let p2LegsWon = 0
  const p1Scores: number[] = []
  const p2Scores: number[] = []
  const p1HitRates: number[] = []
  const p2HitRates: number[] = []

  for (const m of shared) {
    if (m.winnerId === p1Id) p1Wins++
    else if (m.winnerId === p2Id) p2Wins++

    p1LegsWon += m.legWins?.[p1Id] ?? 0
    p2LegsWon += m.legWins?.[p2Id] ?? 0

    const s1 = computeOperationMatchStats(m, p1Id)
    const s2 = computeOperationMatchStats(m, p2Id)

    if (s1) {
      p1Scores.push(s1.totalScore)
      p1HitRates.push(s1.hitRate)
    }
    if (s2) {
      p2Scores.push(s2.totalScore)
      p2HitRates.push(s2.hitRate)
    }
  }

  const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0

  return {
    matchesPlayed: shared.length,
    p1Wins,
    p2Wins,
    p1AvgScore: Math.round(avg(p1Scores) * 10) / 10,
    p2AvgScore: Math.round(avg(p2Scores) * 10) / 10,
    p1AvgHitRate: Math.round(avg(p1HitRates) * 10) / 10,
    p2AvgHitRate: Math.round(avg(p2HitRates) * 10) / 10,
    p1BestScore: p1Scores.length > 0 ? Math.max(...p1Scores) : 0,
    p2BestScore: p2Scores.length > 0 ? Math.max(...p2Scores) : 0,
    p1LegsWon,
    p2LegsWon,
  }
}
