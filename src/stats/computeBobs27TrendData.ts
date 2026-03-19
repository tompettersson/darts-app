// src/stats/computeBobs27TrendData.ts
// Trend-Daten fuer Bob's 27

import { getBobs27Matches } from '../storage'
import { computeBobs27MatchStats } from './computeBobs27Stats'

export type Bobs27TrendPoint = {
  matchIndex: number
  date: string
  finalScore: number
  hitRate: number
  targetsCompleted: number
  eliminated: boolean
}

/**
 * Berechnet Trend-Daten fuer einen Spieler ueber seine letzten N Bob's 27 Matches
 */
export function computeBobs27Trends(
  playerId: string,
  limit: number = 20,
  multiplayerOnly: boolean = false
): Bobs27TrendPoint[] {
  const allMatches = getBobs27Matches()

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
    const stats = computeBobs27MatchStats(m, playerId)
    return {
      matchIndex: i,
      date: m.createdAt,
      finalScore: stats?.finalScore ?? 0,
      hitRate: stats?.hitRate ?? 0,
      targetsCompleted: stats?.targetsCompleted ?? 0,
      eliminated: stats?.eliminated ?? false,
    }
  })
}
