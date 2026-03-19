// src/db/stats/atb.ts
// ATB (Around the Block) statistics functions

import { query, queryOne } from '../index'

// ============================================================================
// ATB Statistics
// ============================================================================

/**
 * Beste ATB Zeiten pro Modus
 */
export async function getATBBestTimes(playerId: string): Promise<{
  mode: string
  direction: string
  bestTime: number
  bestDarts: number
  attempts: number
}[]> {
  const results = await query<{
    mode: string
    direction: string
    best_time: number
    best_darts: number
    attempts: number
  }>(`
    SELECT
      m.mode,
      m.direction,
      MIN(m.duration_ms) as best_time,
      MIN(m.winner_darts) as best_darts,
      COUNT(*) as attempts
    FROM atb_matches m
    WHERE m.finished = 1
      AND m.winner_id = ?
    GROUP BY m.mode, m.direction
    ORDER BY best_time ASC
  `, [playerId])

  return results.map(r => ({
    mode: r.mode,
    direction: r.direction,
    bestTime: r.best_time,
    bestDarts: r.best_darts,
    attempts: r.attempts,
  }))
}

// ============================================================================
// Comprehensive ATB Stats (for ATB Tab)
// ============================================================================

export type ATBFullStats = {
  matchesPlayed: number
  matchesWon: number
  matchWinRate: number
  totalDarts: number
  avgDartsPerWin: number
  bestDarts: number
  bestTimeMs: number
  totalHits: number
  totalMisses: number
  hitRate: number
  totalTriples: number
  totalDoubles: number
}

/**
 * Vollständige ATB-Statistiken für einen Spieler
 */
export async function getATBFullStats(playerId: string): Promise<ATBFullStats> {
  const stats = await queryOne<{
    matches_played: number
    matches_won: number
    total_darts: number
    best_darts: number
    best_time: number
  }>(`
    SELECT
      COUNT(*) as matches_played,
      SUM(CASE WHEN m.winner_id = ? THEN 1 ELSE 0 END) as matches_won,
      SUM(m.winner_darts) as total_darts,
      MIN(CASE WHEN m.winner_id = ? THEN m.winner_darts ELSE NULL END) as best_darts,
      MIN(CASE WHEN m.winner_id = ? THEN m.duration_ms ELSE NULL END) as best_time
    FROM atb_matches m
    JOIN atb_match_players mp ON mp.match_id = m.id AND mp.player_id = ?
    WHERE m.finished = 1
  `, [playerId, playerId, playerId, playerId])

  // Event Stats - Hits/Misses/Triples/Doubles
  const eventStats = await queryOne<{
    total_hits: number
    total_misses: number
    total_triples: number
    total_doubles: number
  }>(`
    SELECT
      COALESCE(SUM(CAST(json_extract(e.data, '$.hits') AS INTEGER)), 0) as total_hits,
      COALESCE(SUM(CAST(json_extract(e.data, '$.misses') AS INTEGER)), 0) as total_misses,
      COALESCE(SUM(CAST(json_extract(e.data, '$.triples') AS INTEGER)), 0) as total_triples,
      COALESCE(SUM(CAST(json_extract(e.data, '$.doubles') AS INTEGER)), 0) as total_doubles
    FROM atb_events e
    JOIN atb_match_players mp ON mp.match_id = e.match_id AND mp.player_id = ?
    JOIN atb_matches m ON m.id = e.match_id AND m.finished = 1
    WHERE e.type = 'ATBTurnAdded'
      AND json_extract(e.data, '$.playerId') = ?
  `, [playerId, playerId])

  const matchesWon = stats?.matches_won ?? 0
  const totalHits = eventStats?.total_hits ?? 0
  const totalMisses = eventStats?.total_misses ?? 0
  const totalThrows = totalHits + totalMisses

  return {
    matchesPlayed: stats?.matches_played ?? 0,
    matchesWon,
    matchWinRate: (stats?.matches_played ?? 0) > 0
      ? Math.round(matchesWon / (stats?.matches_played ?? 1) * 100)
      : 0,
    totalDarts: stats?.total_darts ?? 0,
    avgDartsPerWin: matchesWon > 0
      ? Math.round((stats?.total_darts ?? 0) / matchesWon * 10) / 10
      : 0,
    bestDarts: stats?.best_darts ?? 0,
    bestTimeMs: stats?.best_time ?? 0,
    totalHits,
    totalMisses,
    hitRate: totalThrows > 0
      ? Math.round(totalHits / totalThrows * 100)
      : 0,
    totalTriples: eventStats?.total_triples ?? 0,
    totalDoubles: eventStats?.total_doubles ?? 0,
  }
}
