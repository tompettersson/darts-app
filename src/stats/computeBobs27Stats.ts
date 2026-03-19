// src/stats/computeBobs27Stats.ts
// Berechnet Match-Stats fuer Bob's 27

import type { Bobs27StoredMatch, Bobs27ThrowEvent, Bobs27TargetFinishedEvent } from '../types/bobs27'
import { applyBobs27Events } from '../dartsBobs27'

export type Bobs27TargetResultStat = {
  label: string
  hits: number
  darts: number
  delta: number
  scoreAfter: number
}

export type Bobs27MatchStats = {
  finalScore: number
  targetsCompleted: number
  totalTargets: number
  hitRate: number        // Prozent
  totalDarts: number
  totalHits: number
  bestTargetDelta: { label: string; delta: number } | undefined
  worstTargetDelta: { label: string; delta: number } | undefined
  targetResults: Bobs27TargetResultStat[]
  scoreHistory: number[] // Score nach jedem Target (fuer Chart)
  eliminated: boolean
  eliminatedAtTarget: number | null
}

export function computeBobs27MatchStats(
  match: Bobs27StoredMatch,
  playerId: string
): Bobs27MatchStats | null {
  const state = applyBobs27Events(match.events)
  const ps = state.playerStates[playerId]
  if (!ps) return null

  const config = match.config ?? state.match?.config
  const startScore = config?.startScore ?? 27

  // Target Results aus dem PlayerState
  const targetResults: Bobs27TargetResultStat[] = ps.targetResults.map(tr => ({
    label: tr.target.label,
    hits: tr.hits,
    darts: tr.dartsThrown,
    delta: tr.delta,
    scoreAfter: tr.scoreAfter,
  }))

  // Score History: startScore + nach jedem Target
  const scoreHistory: number[] = [startScore]
  for (const tr of ps.targetResults) {
    scoreHistory.push(tr.scoreAfter)
  }

  // Best/Worst Target
  let bestTargetDelta: { label: string; delta: number } | undefined
  let worstTargetDelta: { label: string; delta: number } | undefined

  for (const tr of targetResults) {
    if (!bestTargetDelta || tr.delta > bestTargetDelta.delta) {
      bestTargetDelta = { label: tr.label, delta: tr.delta }
    }
    if (!worstTargetDelta || tr.delta < worstTargetDelta.delta) {
      worstTargetDelta = { label: tr.label, delta: tr.delta }
    }
  }

  const totalTargets = match.targets?.length ?? (config?.includeBull ? 21 : 20)
  const hitRate = ps.totalDarts > 0 ? (ps.totalHits / ps.totalDarts) * 100 : 0

  return {
    finalScore: ps.score,
    targetsCompleted: ps.targetResults.length,
    totalTargets,
    hitRate,
    totalDarts: ps.totalDarts,
    totalHits: ps.totalHits,
    bestTargetDelta,
    worstTargetDelta,
    targetResults,
    scoreHistory,
    eliminated: ps.eliminated,
    eliminatedAtTarget: ps.eliminatedAtTarget,
  }
}

/**
 * Head-to-Head Vergleich fuer Bob's 27
 */
export type Bobs27HeadToHead = {
  matchesPlayed: number
  p1Wins: number
  p2Wins: number
  p1AvgScore: number
  p2AvgScore: number
  p1AvgHitRate: number
  p2AvgHitRate: number
  p1BestScore: number
  p2BestScore: number
}

export function computeBobs27HeadToHead(
  matches: Bobs27StoredMatch[],
  p1Id: string,
  p2Id: string
): Bobs27HeadToHead | null {
  // Nur Matches in denen beide Spieler vorkommen
  const shared = matches.filter(m =>
    m.finished &&
    m.players.some(p => p.playerId === p1Id) &&
    m.players.some(p => p.playerId === p2Id)
  )

  if (shared.length === 0) return null

  let p1Wins = 0
  let p2Wins = 0
  const p1Scores: number[] = []
  const p2Scores: number[] = []
  const p1HitRates: number[] = []
  const p2HitRates: number[] = []

  for (const m of shared) {
    if (m.winnerId === p1Id) p1Wins++
    else if (m.winnerId === p2Id) p2Wins++

    const s1 = computeBobs27MatchStats(m, p1Id)
    const s2 = computeBobs27MatchStats(m, p2Id)

    if (s1) {
      p1Scores.push(s1.finalScore)
      p1HitRates.push(s1.hitRate)
    }
    if (s2) {
      p2Scores.push(s2.finalScore)
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
  }
}
