// src/stats/computeShanghaiMatchAggregateStats.ts
// Aggregiert Shanghai-Leg-Stats ueber alle Legs eines Matches.

import type { ShanghaiStoredMatch } from '../types/shanghai'
import {
  computeShanghaiLegStats,
  listShanghaiLegIndices,
  type ShanghaiLegStats,
} from './computeShanghaiLegStats'

export type ShanghaiMatchAggregateStats = {
  legsPlayed: number
  avgFinalScore: number
  avgScorePercent: number
  bestLegScore: number
  worstLegScore: number
  avgHitRatePerDart: number
  avgVisitHitRate: number
  avgTripleRate: number
  avgEfficiency: number
  avgAggressionIndex: number
  avgClutchScore: number
  avgZeroRounds: number
  avgConsistencyRate: number
  shanghaiRate: number           // % Legs mit mindestens 1 Shanghai
  scoreStdDev: number
  perLeg: ShanghaiLegStats[]
}

function avg(nums: number[]): number {
  if (nums.length === 0) return 0
  return nums.reduce((a, b) => a + b, 0) / nums.length
}

function stdDev(nums: number[]): number {
  if (nums.length < 2) return 0
  const m = avg(nums)
  const v = nums.reduce((a, x) => a + (x - m) * (x - m), 0) / nums.length
  return Math.sqrt(v)
}

export function computeShanghaiMatchAggregateStats(
  match: ShanghaiStoredMatch,
  playerId: string
): ShanghaiMatchAggregateStats | null {
  const legIndices = listShanghaiLegIndices(match)
  if (legIndices.length === 0) return null

  const perLeg: ShanghaiLegStats[] = []
  for (const idx of legIndices) {
    const s = computeShanghaiLegStats(match, playerId, idx)
    if (s) perLeg.push(s)
  }
  if (perLeg.length === 0) return null

  const scores = perLeg.map(l => l.finalScore)
  const round = (v: number) => Math.round(v * 10) / 10

  return {
    legsPlayed: perLeg.length,
    avgFinalScore: round(avg(scores)),
    avgScorePercent: round(avg(perLeg.map(l => l.scorePercent))),
    bestLegScore: Math.max(...scores),
    worstLegScore: Math.min(...scores),
    avgHitRatePerDart: round(avg(perLeg.map(l => l.hitRatePerDart))),
    avgVisitHitRate: round(avg(perLeg.map(l => l.visitHitRate))),
    avgTripleRate: round(avg(perLeg.map(l => l.tripleRate))),
    avgEfficiency: round(avg(perLeg.map(l => l.efficiency))),
    avgAggressionIndex: round(avg(perLeg.map(l => l.aggressionIndex))),
    avgClutchScore: round(avg(perLeg.map(l => l.clutchScore))),
    avgZeroRounds: round(avg(perLeg.map(l => l.zeroRounds))),
    avgConsistencyRate: round(avg(perLeg.map(l => l.consistencyRate))),
    shanghaiRate: round((perLeg.filter(l => l.shanghaiAchieved).length / perLeg.length) * 100),
    scoreStdDev: round(stdDev(scores)),
    perLeg,
  }
}
