// src/stats/computeBobs27MatchAggregateStats.ts
// Aggregiert Bob's-27-Leg-Stats ueber alle Legs eines Matches.
// Bull wird strikt von D1-D20 getrennt gefuehrt.

import type { Bobs27StoredMatch } from '../types/bobs27'
import {
  computeBobs27LegStats,
  listBobs27LegIndices,
  type Bobs27LegStats,
} from './computeBobs27LegStats'

export type Bobs27MatchAggregateStats = {
  legsPlayed: number
  avgFinalScore: number
  bestLegScore: number
  worstLegScore: number

  avgDoubleRatePerDart: number      // Mittel D1–D20 (OHNE Bull)
  avgDoubleRatePerVisit: number     // Mittel D1–D20 (OHNE Bull)

  avgBullRatePerDart: number | null // Mittel Bull-Quote pro Dart (null wenn nie Bull gespielt)
  bullLegsWithHit: number | null    // Anzahl Legs mit >= 1 Bull-Treffer

  avgZeroVisits: number
  totalHits: number
  totalDarts: number
  scoreStdDev: number

  perLeg: Bobs27LegStats[]
}

function stdDev(nums: number[]): number {
  if (nums.length < 2) return 0
  const mean = nums.reduce((a, b) => a + b, 0) / nums.length
  const variance = nums.reduce((acc, v) => acc + (v - mean) * (v - mean), 0) / nums.length
  return Math.sqrt(variance)
}

function avg(nums: number[]): number {
  if (nums.length === 0) return 0
  return nums.reduce((a, b) => a + b, 0) / nums.length
}

/**
 * Aggregiert Leg-Stats ueber alle Legs eines Matches fuer einen Spieler.
 */
export function computeBobs27MatchAggregateStats(
  match: Bobs27StoredMatch,
  playerId: string
): Bobs27MatchAggregateStats | null {
  const legIndices = listBobs27LegIndices(match)
  if (legIndices.length === 0) return null

  const perLeg: Bobs27LegStats[] = []
  for (const idx of legIndices) {
    const s = computeBobs27LegStats(match, playerId, idx)
    if (s) perLeg.push(s)
  }
  if (perLeg.length === 0) return null

  const scores = perLeg.map(l => l.finalScore)
  const dartRates = perLeg.map(l => l.doubleRatePerDart)
  const visitRates = perLeg.map(l => l.doubleRatePerVisit)
  const zeroVisitsArr = perLeg.map(l => l.zeroVisits)

  const bullLegs = perLeg.filter(l => l.bullDarts !== null && l.bullDarts > 0)
  const avgBullRatePerDart = bullLegs.length > 0
    ? avg(bullLegs.map(l => l.bullRatePerDart ?? 0))
    : null
  const bullLegsWithHit = bullLegs.length > 0
    ? bullLegs.filter(l => (l.bullHits ?? 0) >= 1).length
    : null

  const totalHits = perLeg.reduce((a, l) => a + l.totalHits, 0)
  const totalDarts = perLeg.reduce((a, l) => a + l.totalDarts, 0)

  return {
    legsPlayed: perLeg.length,
    avgFinalScore: avg(scores),
    bestLegScore: Math.max(...scores),
    worstLegScore: Math.min(...scores),
    avgDoubleRatePerDart: avg(dartRates),
    avgDoubleRatePerVisit: avg(visitRates),
    avgBullRatePerDart,
    bullLegsWithHit,
    avgZeroVisits: avg(zeroVisitsArr),
    totalHits,
    totalDarts,
    scoreStdDev: stdDev(scores),
    perLeg,
  }
}
