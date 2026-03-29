// src/db/stats/bobs27.ts
// Bob's 27 statistics functions

import { query, queryOne } from '../index'
import type { TrendPoint } from './types'

// ============================================================================
// Bob's 27 Stats
// ============================================================================

export type Bobs27FullStats = {
  matchesPlayed: number
  avgFinalScore: number
  bestScore: number
  worstScore: number
  avgHitRate: number
  avgTargetsCompleted: number
  completionRate: number
  totalDarts: number
  avgDartsPerMatch: number
}

/**
 * Vollstaendige Bob's 27 Statistiken fuer einen Spieler
 */
export async function getBobs27FullStats(playerId: string): Promise<Bobs27FullStats> {
  const stats = await queryOne<{
    matches_played: number
    avg_score: number
    best_score: number
    worst_score: number
  }>(`
    WITH player_matches AS (
      SELECT m.id, m.final_scores
      FROM bobs27_matches m
      JOIN bobs27_match_players mp ON mp.match_id = m.id AND mp.player_id = ?
      WHERE m.finished = 1
    ),
    match_scores AS (
      SELECT
        pm.id,
        (pm.final_scores::jsonb->>?)::real as final_score
      FROM player_matches pm
      WHERE pm.final_scores IS NOT NULL
    )
    SELECT
      COUNT(*) as matches_played,
      AVG(ms.final_score) as avg_score,
      MAX(ms.final_score) as best_score,
      MIN(ms.final_score) as worst_score
    FROM match_scores ms
    WHERE ms.final_score IS NOT NULL
  `, [playerId, playerId])

  // Hit-Rate aus Events berechnen
  const hitStats = await queryOne<{
    total_throws: number
    total_hits: number
    total_targets_finished: number
    matches_with_all_targets: number
  }>(`
    WITH player_matches AS (
      SELECT m.id, m.include_bull
      FROM bobs27_matches m
      JOIN bobs27_match_players mp ON mp.match_id = m.id AND mp.player_id = ?
      WHERE m.finished = 1
    ),
    throw_stats AS (
      SELECT
        e.match_id,
        COUNT(*) as throws,
        SUM(CASE WHEN (e.data::jsonb->>'hit')::integer = 1 THEN 1 ELSE 0 END) as hits
      FROM bobs27_events e
      WHERE e.match_id IN (SELECT id FROM player_matches)
        AND e.type = 'Bobs27Throw'
        AND e.data::jsonb->>'playerId' = ?
      GROUP BY e.match_id
    ),
    target_stats AS (
      SELECT
        e.match_id,
        COUNT(*) as targets_finished
      FROM bobs27_events e
      WHERE e.match_id IN (SELECT id FROM player_matches)
        AND e.type = 'Bobs27TargetFinished'
        AND e.data::jsonb->>'playerId' = ?
      GROUP BY e.match_id
    )
    SELECT
      COALESCE(SUM(ts.throws), 0) as total_throws,
      COALESCE(SUM(ts.hits), 0) as total_hits,
      COALESCE(SUM(tgs.targets_finished), 0) as total_targets_finished,
      COALESCE(SUM(CASE
        WHEN tgs.targets_finished >= CASE WHEN pm.include_bull = 1 THEN 21 ELSE 20 END
        THEN 1 ELSE 0 END), 0) as matches_with_all_targets
    FROM player_matches pm
    LEFT JOIN throw_stats ts ON ts.match_id = pm.id
    LEFT JOIN target_stats tgs ON tgs.match_id = pm.id
  `, [playerId, playerId, playerId])

  const matchesPlayed = stats?.matches_played ?? 0
  const totalDarts = hitStats?.total_throws ?? 0
  const totalHits = hitStats?.total_hits ?? 0
  const avgHitRate = totalDarts > 0 ? (totalHits / totalDarts) * 100 : 0
  const avgTargetsCompleted = matchesPlayed > 0
    ? (hitStats?.total_targets_finished ?? 0) / matchesPlayed
    : 0
  const completionRate = matchesPlayed > 0
    ? ((hitStats?.matches_with_all_targets ?? 0) / matchesPlayed) * 100
    : 0

  return {
    matchesPlayed,
    avgFinalScore: Math.round((stats?.avg_score ?? 0) * 10) / 10,
    bestScore: stats?.best_score ?? 0,
    worstScore: stats?.worst_score ?? 0,
    avgHitRate: Math.round(avgHitRate * 10) / 10,
    avgTargetsCompleted: Math.round(avgTargetsCompleted * 10) / 10,
    completionRate: Math.round(completionRate),
    totalDarts,
    avgDartsPerMatch: matchesPlayed > 0
      ? Math.round((totalDarts / matchesPlayed) * 10) / 10
      : 0,
  }
}

// ============================================================================
// Bob's 27 Trends
// ============================================================================

/**
 * Bob's 27 Ø Score pro Monat
 */
export async function getBobs27MonthlyAvgScore(playerId: string): Promise<TrendPoint[]> {
  const results = await query<{
    month: string
    avg_score: number
    match_count: number
  }>(`
    SELECT
      to_char(m.created_at::timestamp, 'YYYY-MM') as month,
      AVG((m.final_scores::jsonb->>?)::real) as avg_score,
      COUNT(*) as match_count
    FROM bobs27_matches m
    JOIN bobs27_match_players mp ON mp.match_id = m.id AND mp.player_id = ?
    WHERE m.finished = 1
      AND m.final_scores IS NOT NULL
    GROUP BY to_char(m.created_at::timestamp, 'YYYY-MM')
    ORDER BY month ASC
  `, [playerId, playerId])

  return results.map(r => ({
    date: r.month + '-01',
    month: r.month,
    value: Math.round((r.avg_score || 0) * 10) / 10,
    matchCount: r.match_count,
  }))
}

/**
 * Bob's 27 Hit-Rate pro Monat
 */
export async function getBobs27MonthlyHitRate(playerId: string): Promise<TrendPoint[]> {
  const results = await query<{
    month: string
    total_throws: number
    total_hits: number
    match_count: number
  }>(`
    SELECT
      to_char(m.created_at::timestamp, 'YYYY-MM') as month,
      COUNT(*) as total_throws,
      SUM(CASE WHEN (e.data::jsonb->>'hit')::integer = 1 THEN 1 ELSE 0 END) as total_hits,
      COUNT(DISTINCT m.id) as match_count
    FROM bobs27_matches m
    JOIN bobs27_match_players mp ON mp.match_id = m.id AND mp.player_id = ?
    JOIN bobs27_events e ON e.match_id = m.id
    WHERE m.finished = 1
      AND e.type = 'Bobs27Throw'
      AND e.data::jsonb->>'playerId' = ?
    GROUP BY to_char(m.created_at::timestamp, 'YYYY-MM')
    ORDER BY month ASC
  `, [playerId, playerId])

  return results.map(r => ({
    date: r.month + '-01',
    month: r.month,
    value: r.total_throws > 0
      ? Math.round((r.total_hits / r.total_throws) * 1000) / 10
      : 0,
    matchCount: r.match_count,
  }))
}

// ============================================================================
// Bob's 27 Progression & Double Weakness (TASK 21)
// ============================================================================

export type Bobs27Progression = {
  matchId: string
  matchDate: string
  finalScore: number
  hitRate: number
  completed: boolean         // nicht eliminiert
  personalBest: boolean      // neuer Rekord zum Zeitpunkt
}

export type Bobs27DoubleWeakness = {
  field: string  // "D1" - "D20", "DBULL"
  attempts: number
  hits: number
  hitRate: number
}

export async function getBobs27Progression(playerId: string): Promise<Bobs27Progression[]> {
  try {
    const matches = await query<{
      match_id: string
      created_at: string
      final_score: number
      hit_rate: number
    }>(`
      SELECT
        m.id as match_id,
        m.created_at,
        (m.final_scores::jsonb->>?)::integer as final_score,
        COALESCE(
          (SELECT
            ROUND(CAST(SUM(CASE WHEN (e.data::jsonb->>'hit')::integer = 1 THEN 1 ELSE 0 END) AS numeric) /
            NULLIF(COUNT(*), 0) * 100, 1)
          FROM bobs27_events e
          WHERE e.match_id = m.id AND e.type = 'Bobs27Throw'
            AND e.data::jsonb->>'playerId' = ?
          ), 0) as hit_rate
      FROM bobs27_matches m
      JOIN bobs27_match_players mp ON mp.match_id = m.id AND mp.player_id = ?
      WHERE m.finished = 1
      ORDER BY m.created_at ASC
    `, [playerId, playerId, playerId])

    let bestSoFar = -Infinity
    return matches.map(m => {
      const isNewBest = m.final_score > bestSoFar
      if (isNewBest) bestSoFar = m.final_score
      return {
        matchId: m.match_id,
        matchDate: m.created_at,
        finalScore: m.final_score ?? 0,
        hitRate: m.hit_rate ?? 0,
        completed: (m.final_score ?? 0) > 0 || m.hit_rate > 0,  // if score > 0, was not eliminated
        personalBest: isNewBest,
      }
    })
  } catch (e) {
    console.warn('[Stats] getBobs27Progression failed:', e)
    return []
  }
}

export async function getBobs27DoubleWeakness(playerId: string): Promise<Bobs27DoubleWeakness[]> {
  try {
    const results = await query<{
      target_index: number
      attempts: number
      hits: number
    }>(`
      SELECT
        (e.data::jsonb->>'targetIndex')::integer as target_index,
        COUNT(*) as attempts,
        SUM(CASE WHEN (e.data::jsonb->>'hit')::integer = 1 THEN 1 ELSE 0 END) as hits
      FROM bobs27_events e
      JOIN bobs27_match_players mp ON mp.match_id = e.match_id AND mp.player_id = ?
      JOIN bobs27_matches m ON m.id = e.match_id AND m.finished = 1
      WHERE e.type = 'Bobs27Throw'
        AND e.data::jsonb->>'playerId' = ?
      GROUP BY target_index
      ORDER BY target_index ASC
    `, [playerId, playerId])

    return results.map(r => ({
      field: r.target_index <= 20 ? `D${r.target_index}` : 'DBULL',
      attempts: r.attempts,
      hits: r.hits,
      hitRate: r.attempts > 0 ? Math.round(r.hits / r.attempts * 1000) / 10 : 0,
    }))
  } catch (e) {
    console.warn('[Stats] getBobs27DoubleWeakness failed:', e)
    return []
  }
}
