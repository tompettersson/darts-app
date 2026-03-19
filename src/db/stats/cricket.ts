// src/db/stats/cricket.ts
// Cricket statistics functions

import { query, queryOne } from '../index'
import type { TrendPoint } from './types'

// ============================================================================
// Cricket MPR Trend
// ============================================================================

/**
 * Cricket MPR Trend pro Monat
 * Verwendet dartCount (neue Events) oder json_array_length (alte Events) als Fallback
 */
export async function getCricketMonthlyMPR(playerId: string): Promise<TrendPoint[]> {
  const results = await query<{
    month: string
    avg_mpr: number
    match_count: number
  }>(`
    SELECT
      strftime('%Y-%m', m.created_at) as month,
      AVG(CAST(json_extract(e.data, '$.marks') AS REAL) /
          NULLIF(COALESCE(
            CAST(json_extract(e.data, '$.dartCount') AS REAL),
            json_array_length(e.data, '$.darts')
          ), 0) * 3) as avg_mpr,
      COUNT(DISTINCT m.id) as match_count
    FROM cricket_matches m
    JOIN cricket_events e ON e.match_id = m.id
    JOIN cricket_match_players mp ON mp.match_id = m.id AND mp.player_id = ?
    WHERE e.type = 'CricketTurnAdded'
      AND json_extract(e.data, '$.playerId') = ?
      AND m.finished = 1
    GROUP BY strftime('%Y-%m', m.created_at)
    ORDER BY month ASC
  `, [playerId, playerId])

  return results.map(r => ({
    date: r.month + '-01',
    month: r.month,
    value: Math.round((r.avg_mpr || 0) * 100) / 100,
    matchCount: r.match_count,
  }))
}

// ============================================================================
// Comprehensive Cricket Stats (for Cricket Tab)
// ============================================================================

export type CricketFullStats = {
  matchesPlayed: number
  matchesWon: number
  matchWinRate: number
  legsPlayed: number
  legsWon: number
  legWinRate: number
  totalMarks: number
  totalTurns: number
  marksPerRound: number
  totalTriples: number
  totalDoubles: number
  totalSingles: number
  bullHits: number
  doubleBullHits: number
  tripleRate: number
  noScoreTurns: number
  noScoreRate: number
  bestLegDarts: number | null
}

/**
 * Vollständige Cricket-Statistiken für einen Spieler
 */
export async function getCricketFullStats(playerId: string): Promise<CricketFullStats> {
  // Match Stats
  const matchStats = await queryOne<{
    matches_played: number
    matches_won: number
    legs_played: number
    legs_won: number
  }>(`
    WITH player_matches AS (
      SELECT m.id
      FROM cricket_matches m
      JOIN cricket_match_players mp ON mp.match_id = m.id AND mp.player_id = ?
      WHERE m.finished = 1
    ),
    leg_stats AS (
      SELECT
        COUNT(*) as legs_played,
        SUM(CASE WHEN json_extract(e.data, '$.winnerPlayerId') = ? THEN 1 ELSE 0 END) as legs_won
      FROM cricket_events e
      WHERE e.match_id IN (SELECT id FROM player_matches)
        AND e.type = 'CricketLegFinished'
    ),
    match_wins AS (
      SELECT COUNT(*) as wins
      FROM cricket_events e
      WHERE e.match_id IN (SELECT id FROM player_matches)
        AND e.type = 'CricketMatchFinished'
        AND json_extract(e.data, '$.winnerPlayerId') = ?
    )
    SELECT
      (SELECT COUNT(*) FROM player_matches) as matches_played,
      (SELECT wins FROM match_wins) as matches_won,
      COALESCE((SELECT legs_played FROM leg_stats), 0) as legs_played,
      COALESCE((SELECT legs_won FROM leg_stats), 0) as legs_won
  `, [playerId, playerId, playerId])

  // Turn Stats - mit Fallback wenn CricketTurnAdded andere Struktur hat
  const turnStats = await queryOne<{
    total_turns: number
    total_marks: number
    total_triples: number
    total_doubles: number
    total_singles: number
    bull_hits: number
    double_bull_hits: number
    no_score_turns: number
  }>(`
    SELECT
      COUNT(*) as total_turns,
      COALESCE(SUM(CAST(json_extract(e.data, '$.marks') AS INTEGER)), 0) as total_marks,
      COALESCE(SUM(CAST(json_extract(e.data, '$.tripleCount') AS INTEGER)), 0) as total_triples,
      COALESCE(SUM(CAST(json_extract(e.data, '$.doubleCount') AS INTEGER)), 0) as total_doubles,
      COALESCE(SUM(CAST(json_extract(e.data, '$.singleCount') AS INTEGER)), 0) as total_singles,
      COALESCE(SUM(CAST(json_extract(e.data, '$.bullCount') AS INTEGER)), 0) as bull_hits,
      COALESCE(SUM(CAST(json_extract(e.data, '$.doubleBullCount') AS INTEGER)), 0) as double_bull_hits,
      SUM(CASE WHEN COALESCE(CAST(json_extract(e.data, '$.marks') AS INTEGER), 0) = 0 THEN 1 ELSE 0 END) as no_score_turns
    FROM cricket_events e
    JOIN cricket_match_players mp ON mp.match_id = e.match_id AND mp.player_id = ?
    JOIN cricket_matches m ON m.id = e.match_id AND m.finished = 1
    WHERE e.type = 'CricketTurnAdded'
      AND json_extract(e.data, '$.playerId') = ?
  `, [playerId, playerId])

  // Best Leg Darts (Minimum Darts in einem gewonnenen Leg)
  // Cricket hat kein legId auf Turns -> wir nutzen seq-Reihenfolge + CricketLegFinished-Grenzen
  const bestLegStats = await queryOne<{
    best_leg_darts: number | null
  }>(`
    WITH leg_ends AS (
      SELECT
        match_id,
        seq,
        json_extract(data, '$.winnerPlayerId') as winner_id,
        ROW_NUMBER() OVER (PARTITION BY match_id ORDER BY seq) as leg_num
      FROM cricket_events
      WHERE type = 'CricketLegFinished'
        AND match_id IN (
          SELECT m.id FROM cricket_matches m
          JOIN cricket_match_players mp ON mp.match_id = m.id AND mp.player_id = ?
          WHERE m.finished = 1
        )
    ),
    turns_with_leg AS (
      SELECT
        t.match_id,
        json_array_length(t.data, '$.darts') as dart_count,
        (SELECT MIN(le.leg_num) FROM leg_ends le
         WHERE le.match_id = t.match_id AND le.seq > t.seq) as leg_num
      FROM cricket_events t
      JOIN cricket_matches m ON m.id = t.match_id AND m.finished = 1
      JOIN cricket_match_players mp ON mp.match_id = t.match_id AND mp.player_id = ?
      WHERE t.type = 'CricketTurnAdded'
        AND json_extract(t.data, '$.playerId') = ?
    )
    SELECT MIN(leg_darts) as best_leg_darts
    FROM (
      SELECT twl.match_id, twl.leg_num, SUM(twl.dart_count) as leg_darts
      FROM turns_with_leg twl
      JOIN leg_ends le ON le.match_id = twl.match_id AND le.leg_num = twl.leg_num
      WHERE le.winner_id = ?
      GROUP BY twl.match_id, twl.leg_num
    )
  `, [playerId, playerId, playerId, playerId])

  const totalTurns = turnStats?.total_turns ?? 0
  const totalMarks = turnStats?.total_marks ?? 0

  return {
    matchesPlayed: matchStats?.matches_played ?? 0,
    matchesWon: matchStats?.matches_won ?? 0,
    matchWinRate: (matchStats?.matches_played ?? 0) > 0
      ? Math.round((matchStats?.matches_won ?? 0) / (matchStats?.matches_played ?? 1) * 100)
      : 0,
    legsPlayed: matchStats?.legs_played ?? 0,
    legsWon: matchStats?.legs_won ?? 0,
    legWinRate: (matchStats?.legs_played ?? 0) > 0
      ? Math.round((matchStats?.legs_won ?? 0) / (matchStats?.legs_played ?? 1) * 100)
      : 0,
    totalMarks,
    totalTurns,
    marksPerRound: totalTurns > 0
      ? Math.round((totalMarks / totalTurns) * 100) / 100
      : 0,
    totalTriples: turnStats?.total_triples ?? 0,
    totalDoubles: turnStats?.total_doubles ?? 0,
    totalSingles: turnStats?.total_singles ?? 0,
    bullHits: turnStats?.bull_hits ?? 0,
    doubleBullHits: turnStats?.double_bull_hits ?? 0,
    tripleRate: totalTurns > 0
      ? Math.round((turnStats?.total_triples ?? 0) / totalTurns * 100)
      : 0,
    noScoreTurns: turnStats?.no_score_turns ?? 0,
    noScoreRate: totalTurns > 0
      ? Math.round((turnStats?.no_score_turns ?? 0) / totalTurns * 100)
      : 0,
    bestLegDarts: bestLegStats?.best_leg_darts ?? null,
  }
}
