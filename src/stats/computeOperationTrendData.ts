// src/stats/computeOperationTrendData.ts
// Trend-Daten fuer Operation

import { getOperationMatches } from '../storage'
import { computeOperationMatchStats } from './computeOperationStats'

export type OperationTrendPoint = {
  matchIndex: number
  date: string
  avgScore: number
  hitRate: number
  bestStreak: number
}

/**
 * Berechnet Trend-Daten fuer einen Spieler ueber seine letzten N Operation Matches
 */
export function computeOperationTrends(
  playerId: string,
  limit: number = 20,
  multiplayerOnly: boolean = false
): OperationTrendPoint[] {
  const allMatches = getOperationMatches()

  // Nur abgeschlossene Matches mit diesem Spieler
  let relevant = allMatches.filter(m =>
    m.finished &&
    m.players.some(p => p.playerId === playerId)
  )

  if (multiplayerOnly) {
    relevant = relevant.filter(m => m.players.length > 1)
  }

  // Neueste zuerst, dann limitieren, dann chronologisch sortieren
  relevant.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  relevant = relevant.slice(0, limit)
  relevant.reverse()

  return relevant.map((m, i) => {
    const stats = computeOperationMatchStats(m, playerId)
    return {
      matchIndex: i,
      date: m.createdAt,
      avgScore: stats?.totalScore ?? 0,
      hitRate: stats?.hitRate ?? 0,
      bestStreak: stats?.maxHitStreak ?? 0,
    }
  })
}
