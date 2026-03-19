// src/stats/computeShanghaiStats.ts
// Berechnet Match-Stats fuer Shanghai

import type { ShanghaiStoredMatch, ShanghaiTurnAddedEvent, ShanghaiDart } from '../types/shanghai'

export type ShanghaiMatchStats = {
  totalScore: number
  avgPerRound: number
  bestRound: { round: number; score: number }
  worstRound: { round: number; score: number }
  shanghaiCount: number
  triples: number
  doubles: number
  singles: number
  misses: number
  totalDarts: number
  hitRate: number // Prozent Treffer auf Zielzahl
  consistencyScore: number // Standardabweichung der Rundenscores (niedrig = konsistent)
  longestScoringStreak: number // Laengste Serie aufeinanderfolgender Runden mit Score > 0
  roundScores: { round: number; score: number }[] // Score pro Runde (fuer Charts)
}

export function computeShanghaiMatchStats(
  match: ShanghaiStoredMatch,
  playerId: string
): ShanghaiMatchStats | null {
  const turns = match.events.filter(
    (e): e is ShanghaiTurnAddedEvent => e.type === 'ShanghaiTurnAdded' && (e as any).playerId === playerId
  )

  if (turns.length === 0) return null

  let totalScore = 0
  let shanghaiCount = 0
  let triples = 0
  let doubles = 0
  let singles = 0
  let misses = 0
  let totalDarts = 0
  let hits = 0

  let bestRound = { round: 0, score: -1 }
  let worstRound = { round: 0, score: Infinity }

  const roundScores: { round: number; score: number }[] = []

  for (const turn of turns) {
    totalScore += turn.turnScore
    roundScores.push({ round: turn.targetNumber, score: turn.turnScore })

    if (turn.isShanghai) shanghaiCount++

    if (turn.turnScore > bestRound.score) {
      bestRound = { round: turn.targetNumber, score: turn.turnScore }
    }
    if (turn.turnScore < worstRound.score) {
      worstRound = { round: turn.targetNumber, score: turn.turnScore }
    }

    for (const dart of turn.darts) {
      totalDarts++
      if (dart.target === 'MISS') {
        misses++
      } else if (dart.target === turn.targetNumber) {
        hits++
        if (dart.mult === 3) triples++
        else if (dart.mult === 2) doubles++
        else singles++
      } else {
        misses++ // Falsche Zahl = kein Treffer
      }
    }
  }

  const avgPerRound = turns.length > 0 ? totalScore / turns.length : 0
  const hitRate = totalDarts > 0 ? (hits / totalDarts) * 100 : 0

  // Konsistenz: Standardabweichung der Rundenscores
  let consistencyScore = 0
  if (roundScores.length > 1) {
    const mean = totalScore / roundScores.length
    const variance = roundScores.reduce((sum, rs) => sum + Math.pow(rs.score - mean, 2), 0) / roundScores.length
    consistencyScore = Math.sqrt(variance)
  }

  // Laengste Scoring-Streak (aufeinanderfolgende Runden mit Score > 0)
  let longestScoringStreak = 0
  let currentStreak = 0
  for (const rs of roundScores) {
    if (rs.score > 0) {
      currentStreak++
      if (currentStreak > longestScoringStreak) longestScoringStreak = currentStreak
    } else {
      currentStreak = 0
    }
  }

  return {
    totalScore,
    avgPerRound,
    bestRound: bestRound.score >= 0 ? bestRound : { round: 0, score: 0 },
    worstRound: worstRound.score < Infinity ? worstRound : { round: 0, score: 0 },
    shanghaiCount,
    triples,
    doubles,
    singles,
    misses,
    totalDarts,
    hitRate,
    consistencyScore,
    longestScoringStreak,
    roundScores,
  }
}
