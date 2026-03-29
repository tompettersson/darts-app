// src/db/stats/killer.ts
// Killer statistics functions

import { query, queryOne } from '../index'

// ============================================================================
// Killer Statistics
// ============================================================================

export type KillerFullStats = {
  matchesPlayed: number
  matchesWon: number
  winRate: number
  avgPlacement: number
  totalDarts: number
  avgDartsPerMatch: number
  totalKills: number
  avgKillsPerMatch: number
  avgHitRate: number
  avgRoundsPerMatch: number
}

export async function getKillerFullStats(playerId: string): Promise<KillerFullStats> {
  try {
    // Matches + Siege
    const matchStats = await queryOne<{
      matches_played: number
      matches_won: number
    }>(`
      SELECT
        COUNT(*) as matches_played,
        SUM(CASE WHEN m.winner_id = ? THEN 1 ELSE 0 END) as matches_won
      FROM killer_matches m
      JOIN killer_match_players mp ON mp.match_id = m.id AND mp.player_id = ?
      WHERE m.finished = 1
    `, [playerId, playerId])

    const matchesPlayed = matchStats?.matches_played ?? 0
    const matchesWon = matchStats?.matches_won ?? 0

    if (matchesPlayed === 0) {
      return { matchesPlayed: 0, matchesWon: 0, winRate: 0, avgPlacement: 0, totalDarts: 0, avgDartsPerMatch: 0, totalKills: 0, avgKillsPerMatch: 0, avgHitRate: 0, avgRoundsPerMatch: 0 }
    }

    // Darts, Hits, Kills aus enriched Events
    const eventStats = await queryOne<{
      total_darts: number
      total_hits: number
      total_kills: number
    }>(`
      SELECT
        COALESCE(SUM((e.data::jsonb->>'totalDarts')::numeric), 0) as total_darts,
        COALESCE(SUM((e.data::jsonb->>'hits')::numeric), 0) as total_hits,
        COALESCE(SUM((e.data::jsonb->>'killCount')::numeric), 0) as total_kills
      FROM killer_events e
      JOIN killer_match_players mp ON mp.match_id = e.match_id AND mp.player_id = ?
      WHERE e.type = 'KillerTurnAdded'
        AND e.data::jsonb->>'playerId' = ?
        AND e.match_id IN (SELECT id FROM killer_matches WHERE finished = 1)
    `, [playerId, playerId])

    // Avg Placement aus final_standings
    const placementStats = await queryOne<{
      avg_placement: number
    }>(`
      WITH standings AS (
        SELECT
          m.id,
          value::jsonb->>'position' as pos
        FROM killer_matches m
        JOIN killer_match_players mp ON mp.match_id = m.id AND mp.player_id = ?
        , jsonb_array_elements(m.final_standings::jsonb) as value
        WHERE m.finished = 1
          AND m.final_standings IS NOT NULL
          AND value::jsonb->>'playerId' = ?
      )
      SELECT AVG(pos::real) as avg_placement FROM standings
    `, [playerId, playerId])

    // Avg Rounds pro Match (max roundNumber aus KillerTurnAdded)
    const roundStats = await queryOne<{
      avg_rounds: number
    }>(`
      WITH match_rounds AS (
        SELECT
          e.match_id,
          MAX((e.data::jsonb->>'roundNumber')::integer) as max_round
        FROM killer_events e
        JOIN killer_match_players mp ON mp.match_id = e.match_id AND mp.player_id = ?
        WHERE e.type = 'KillerTurnAdded'
          AND e.match_id IN (SELECT id FROM killer_matches WHERE finished = 1)
        GROUP BY e.match_id
      )
      SELECT AVG(max_round::real) as avg_rounds FROM match_rounds
    `, [playerId])

    const totalDarts = eventStats?.total_darts ?? 0
    const totalHits = eventStats?.total_hits ?? 0
    const totalKills = eventStats?.total_kills ?? 0

    return {
      matchesPlayed,
      matchesWon,
      winRate: Math.round((matchesWon / matchesPlayed) * 1000) / 10,
      avgPlacement: Math.round((placementStats?.avg_placement ?? 0) * 10) / 10,
      totalDarts,
      avgDartsPerMatch: Math.round((totalDarts / matchesPlayed) * 10) / 10,
      totalKills,
      avgKillsPerMatch: Math.round((totalKills / matchesPlayed) * 10) / 10,
      avgHitRate: totalDarts > 0 ? Math.round((totalHits / totalDarts) * 1000) / 10 : 0,
      avgRoundsPerMatch: Math.round((roundStats?.avg_rounds ?? 0) * 10) / 10,
    }
  } catch (e) {
    console.warn('[Stats] getKillerFullStats failed:', e)
    return { matchesPlayed: 0, matchesWon: 0, winRate: 0, avgPlacement: 0, totalDarts: 0, avgDartsPerMatch: 0, totalKills: 0, avgKillsPerMatch: 0, avgHitRate: 0, avgRoundsPerMatch: 0 }
  }
}
