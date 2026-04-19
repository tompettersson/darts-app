// src/db/stats/shanghai.ts
// Langzeit-Statistiken + Zahlen-Heatmap fuer Shanghai.

import { query } from '../index'
import type { ShanghaiEvent, ShanghaiStoredMatch, ShanghaiTurnAddedEvent } from '../../types/shanghai'
import {
  computeShanghaiLegStats,
  listShanghaiLegIndices,
  SHANGHAI_MAX_SCORE,
  type ShanghaiLegStats,
} from '../../stats/computeShanghaiLegStats'

export type ShanghaiExtendedStats = {
  totalLegs: number
  totalMatches: number
  avgScore: number
  avgScorePercent: number
  bestLegScore: number
  avgHitRatePerDart: number
  avgVisitHitRate: number
  avgTripleRate: number
  avgEfficiency: number
  avgAggressionIndex: number
  avgClutchScore: number
  avgConsistencyRate: number
  avgZeroRoundRate: number          // Ø Zero Rounds / 20
  scoreProgression: number          // Ø letzte 5 Legs − Ø erste 5 Legs
  weakestNumber: { number: number; avgScore: number } | null
  strongestNumber: { number: number; avgScore: number } | null
  totalShanghais: number

  soloMatchesPlayed: number
  soloCompletionRate: number        // aktuell: % Matches >= 50% Score (kein Elim. in Shanghai)
  mpMatchesPlayed: number
  mpWinRate: number
}

export type ShanghaiNumberHeatmapRow = {
  number: number           // 1..20
  avgScore: number
  totalHits: number
  attempts: number
  hitRatePerDart: number   // %
  visits: number
  visitsWithHit: number
  visitHitRate: number     // %
  triples: number
  tripleRate: number       // % = triples / hits
  efficiency: number       // avgScore / hitsPerVisit (naeherung: avgScore / visitsWithHit-Durchschnittstreffer)
  shanghaiHits: number
  shanghaiRate: number     // % Runden dieser Zahl mit Shanghai
}

type ShanghaiMatchRow = {
  id: string
  players: any
  structure: any
  events: any
  finished: number
  winner_id: string | null
}

async function loadFinishedShanghaiMatches(): Promise<ShanghaiStoredMatch[]> {
  try {
    const rows = await query<ShanghaiMatchRow>(`
      SELECT m.id, m.players, m.structure, m.events, m.finished, m.winner_id
      FROM shanghai_matches m
      WHERE m.finished = 1
    `, [])

    return rows.map(r => {
      const players = parseJSON(r.players) ?? []
      const structure = parseJSON(r.structure) ?? { kind: 'legs', bestOfLegs: 1 }
      const events = parseJSON(r.events) ?? []
      return {
        id: r.id,
        title: "Shanghai",
        createdAt: '',
        players,
        structure,
        config: {},
        events,
        finished: true,
        winnerId: r.winner_id,
      } as ShanghaiStoredMatch
    })
  } catch (e) {
    console.warn('[Stats] loadFinishedShanghaiMatches failed:', e)
    return []
  }
}

function parseJSON(v: any): any {
  if (v === null || v === undefined) return null
  if (typeof v === 'string') {
    try { return JSON.parse(v) } catch { return null }
  }
  return v
}

export async function getShanghaiExtendedStats(playerId: string): Promise<ShanghaiExtendedStats> {
  try {
    const matches = await loadFinishedShanghaiMatches()
    const allLegs: ShanghaiLegStats[] = []
    let soloPlayed = 0
    let soloCompleted = 0   // % der Legs mit >= 50% Score
    let mpPlayed = 0
    let mpWon = 0
    let totalShanghais = 0

    // Pro Zahl: avgScore ueber alle Legs
    const perNumberScores: Record<number, { sum: number; count: number }> = {}

    for (const m of matches) {
      const hasPlayer = (m.players ?? []).some(p => p.playerId === playerId)
      if (!hasPlayer) continue
      const isSolo = (m.players ?? []).length === 1
      if (isSolo) soloPlayed++
      else {
        mpPlayed++
        if (m.winnerId === playerId) mpWon++
      }
      const legIndices = listShanghaiLegIndices(m)
      for (const idx of legIndices) {
        const s = computeShanghaiLegStats(m, playerId, idx)
        if (!s) continue
        allLegs.push(s)
        if (s.shanghaiAchieved) totalShanghais++
        if (isSolo && s.scorePercent >= 50) soloCompleted++
        for (const r of s.rounds) {
          if (!perNumberScores[r.targetNumber]) perNumberScores[r.targetNumber] = { sum: 0, count: 0 }
          perNumberScores[r.targetNumber].sum += r.score
          perNumberScores[r.targetNumber].count++
        }
      }
    }

    if (allLegs.length === 0) {
      return {
        totalLegs: 0, totalMatches: matches.length,
        avgScore: 0, avgScorePercent: 0, bestLegScore: 0,
        avgHitRatePerDart: 0, avgVisitHitRate: 0, avgTripleRate: 0,
        avgEfficiency: 0, avgAggressionIndex: 0, avgClutchScore: 0,
        avgConsistencyRate: 0, avgZeroRoundRate: 0,
        scoreProgression: 0,
        weakestNumber: null, strongestNumber: null, totalShanghais: 0,
        soloMatchesPlayed: soloPlayed, soloCompletionRate: 0,
        mpMatchesPlayed: mpPlayed, mpWinRate: 0,
      }
    }

    const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0
    const round = (v: number) => Math.round(v * 10) / 10

    const scores = allLegs.map(l => l.finalScore)

    let scoreProgression = 0
    if (allLegs.length >= 10) {
      const first5 = scores.slice(0, 5)
      const last5 = scores.slice(-5)
      scoreProgression = round(avg(last5) - avg(first5))
    } else if (allLegs.length >= 2) {
      scoreProgression = round(scores[scores.length - 1] - scores[0])
    }

    let weakestNumber: { number: number; avgScore: number } | null = null
    let strongestNumber: { number: number; avgScore: number } | null = null
    for (const n of Object.keys(perNumberScores)) {
      const num = Number(n)
      const entry = perNumberScores[num]
      if (entry.count < 3) continue   // Mindesteinsaetze
      const avgSc = entry.sum / entry.count
      if (!weakestNumber || avgSc < weakestNumber.avgScore) weakestNumber = { number: num, avgScore: round(avgSc) }
      if (!strongestNumber || avgSc > strongestNumber.avgScore) strongestNumber = { number: num, avgScore: round(avgSc) }
    }

    return {
      totalLegs: allLegs.length,
      totalMatches: matches.length,
      avgScore: round(avg(scores)),
      avgScorePercent: round(avg(allLegs.map(l => l.scorePercent))),
      bestLegScore: Math.max(...scores),
      avgHitRatePerDart: round(avg(allLegs.map(l => l.hitRatePerDart))),
      avgVisitHitRate: round(avg(allLegs.map(l => l.visitHitRate))),
      avgTripleRate: round(avg(allLegs.map(l => l.tripleRate))),
      avgEfficiency: round(avg(allLegs.map(l => l.efficiency))),
      avgAggressionIndex: round(avg(allLegs.map(l => l.aggressionIndex))),
      avgClutchScore: round(avg(allLegs.map(l => l.clutchScore))),
      avgConsistencyRate: round(avg(allLegs.map(l => l.consistencyRate))),
      avgZeroRoundRate: round(avg(allLegs.map(l => (l.zeroRounds / 20) * 100))),
      scoreProgression,
      weakestNumber,
      strongestNumber,
      totalShanghais,
      soloMatchesPlayed: soloPlayed,
      soloCompletionRate: soloPlayed > 0 ? round((soloCompleted / soloPlayed) * 100) : 0,
      mpMatchesPlayed: mpPlayed,
      mpWinRate: mpPlayed > 0 ? round((mpWon / mpPlayed) * 100) : 0,
    }
  } catch (e) {
    console.warn('[Stats] getShanghaiExtendedStats failed:', e)
    return {
      totalLegs: 0, totalMatches: 0, avgScore: 0, avgScorePercent: 0, bestLegScore: 0,
      avgHitRatePerDart: 0, avgVisitHitRate: 0, avgTripleRate: 0,
      avgEfficiency: 0, avgAggressionIndex: 0, avgClutchScore: 0,
      avgConsistencyRate: 0, avgZeroRoundRate: 0, scoreProgression: 0,
      weakestNumber: null, strongestNumber: null, totalShanghais: 0,
      soloMatchesPlayed: 0, soloCompletionRate: 0, mpMatchesPlayed: 0, mpWinRate: 0,
    }
  }
}

export async function getShanghaiNumberHeatmap(playerId: string): Promise<ShanghaiNumberHeatmapRow[]> {
  try {
    const matches = await loadFinishedShanghaiMatches()
    type Agg = {
      scoreSum: number
      visits: number
      visitsWithHit: number
      hits: number
      attempts: number
      triples: number
      shanghaiHits: number
    }
    const byNumber: Record<number, Agg> = {}

    for (let n = 1; n <= 20; n++) byNumber[n] = {
      scoreSum: 0, visits: 0, visitsWithHit: 0,
      hits: 0, attempts: 0, triples: 0, shanghaiHits: 0,
    }

    for (const m of matches) {
      const hasPlayer = (m.players ?? []).some(p => p.playerId === playerId)
      if (!hasPlayer) continue
      const legIndices = listShanghaiLegIndices(m)
      for (const idx of legIndices) {
        const s = computeShanghaiLegStats(m, playerId, idx)
        if (!s) continue
        for (const r of s.rounds) {
          const a = byNumber[r.targetNumber]
          if (!a) continue
          a.scoreSum += r.score
          a.visits++
          if (r.roundHit) a.visitsWithHit++
          a.hits += r.hits
          a.attempts += r.dartsUsed
          a.triples += r.triples
          if (r.isShanghai) a.shanghaiHits++
        }
      }
    }

    const round = (v: number) => Math.round(v * 10) / 10
    return Object.entries(byNumber).map(([k, a]) => {
      const num = Number(k)
      const avgScore = a.visits > 0 ? a.scoreSum / a.visits : 0
      const avgHitsPerVisit = a.visits > 0 ? a.hits / a.visits : 0
      return {
        number: num,
        avgScore: round(avgScore),
        totalHits: a.hits,
        attempts: a.attempts,
        hitRatePerDart: a.attempts > 0 ? round((a.hits / a.attempts) * 100) : 0,
        visits: a.visits,
        visitsWithHit: a.visitsWithHit,
        visitHitRate: a.visits > 0 ? round((a.visitsWithHit / a.visits) * 100) : 0,
        triples: a.triples,
        tripleRate: a.hits > 0 ? round((a.triples / a.hits) * 100) : 0,
        efficiency: avgHitsPerVisit > 0 ? round(avgScore / avgHitsPerVisit) : 0,
        shanghaiHits: a.shanghaiHits,
        shanghaiRate: a.visits > 0 ? round((a.shanghaiHits / a.visits) * 100) : 0,
      }
    }).sort((a, b) => a.number - b.number)
  } catch (e) {
    console.warn('[Stats] getShanghaiNumberHeatmap failed:', e)
    return []
  }
}

// Dummy export so the file is considered a module by auto-import tools
export const SHANGHAI_MAX_SCORE_ALIAS = SHANGHAI_MAX_SCORE
