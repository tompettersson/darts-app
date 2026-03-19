// src/db/stats/operation.ts
// Operation statistics functions

import { query, queryOne } from '../index'
import type { TrendPoint } from './types'

// ============================================================================
// Operation Stats
// ============================================================================

export type OperationFullStats = {
  matchesPlayed: number
  multiMatchesPlayed: number
  multiMatchesWon: number
  soloMatchesPlayed: number
  avgScore: number
  bestScore: number
  avgHitRate: number
  avgPointsPerDart: number
  completionRate: number
  totalDarts: number
  bestStreak: number
}

/**
 * Vollstaendige Operation Statistiken fuer einen Spieler
 */
export async function getOperationFullStats(playerId: string): Promise<OperationFullStats> {
  try {
    const stats = await queryOne<{
      matches_played: number
      avg_score: number
      best_score: number
    }>(`
      WITH player_matches AS (
        SELECT m.id, m.final_scores
        FROM operation_matches m
        JOIN operation_match_players mp ON mp.match_id = m.id AND mp.player_id = ?
        WHERE m.finished = 1
      ),
      match_scores AS (
        SELECT
          id,
          CAST(json_extract(final_scores, '$.' || ?) AS INTEGER) as score
        FROM player_matches
        WHERE final_scores IS NOT NULL
      )
      SELECT
        COUNT(*) as matches_played,
        COALESCE(AVG(score), 0) as avg_score,
        COALESCE(MAX(score), 0) as best_score
      FROM match_scores
    `, [playerId, playerId])

    // Solo/Multiplayer Aufteilung
    const multiStats = await queryOne<{
      solo: number
      multi: number
      multi_won: number
    }>(`
      SELECT
        SUM(CASE WHEN pc = 1 THEN 1 ELSE 0 END) as solo,
        SUM(CASE WHEN pc > 1 THEN 1 ELSE 0 END) as multi,
        SUM(CASE WHEN pc > 1 AND winner_id = ? THEN 1 ELSE 0 END) as multi_won
      FROM (
        SELECT m.id, m.winner_id,
          (SELECT COUNT(*) FROM operation_match_players mp2 WHERE mp2.match_id = m.id) as pc
        FROM operation_matches m
        JOIN operation_match_players mp ON mp.match_id = m.id AND mp.player_id = ?
        WHERE m.finished = 1
      )
    `, [playerId, playerId])

    // Hit-Rate und Streak aus Events
    const dartStats = await queryOne<{
      total_darts: number
      total_hits: number
    }>(`
      SELECT
        COUNT(*) as total_darts,
        SUM(CASE WHEN json_extract(e.data, '$.hitType') != 'NO_SCORE' THEN 1 ELSE 0 END) as total_hits
      FROM operation_matches m
      JOIN operation_match_players mp ON mp.match_id = m.id AND mp.player_id = ?
      JOIN operation_events e ON e.match_id = m.id
      WHERE m.finished = 1
        AND e.type = 'OperationDart'
        AND json_extract(e.data, '$.playerId') = ?
    `, [playerId, playerId])

    const totalDarts = dartStats?.total_darts ?? 0
    const totalHits = dartStats?.total_hits ?? 0
    const avgHitRate = totalDarts > 0 ? (totalHits / totalDarts) * 100 : 0

    // Points fuer avg points per dart
    const pointStats = await queryOne<{ total_points: number }>(`
      SELECT
        COALESCE(SUM(json_extract(e.data, '$.points')), 0) as total_points
      FROM operation_matches m
      JOIN operation_match_players mp ON mp.match_id = m.id AND mp.player_id = ?
      JOIN operation_events e ON e.match_id = m.id
      WHERE m.finished = 1
        AND e.type = 'OperationDart'
        AND json_extract(e.data, '$.playerId') = ?
    `, [playerId, playerId])

    const totalPoints = pointStats?.total_points ?? 0
    const avgPointsPerDart = totalDarts > 0 ? totalPoints / totalDarts : 0

    return {
      matchesPlayed: stats?.matches_played ?? 0,
      multiMatchesPlayed: multiStats?.multi ?? 0,
      multiMatchesWon: multiStats?.multi_won ?? 0,
      soloMatchesPlayed: multiStats?.solo ?? 0,
      avgScore: Math.round((stats?.avg_score ?? 0) * 10) / 10,
      bestScore: stats?.best_score ?? 0,
      avgHitRate: Math.round(avgHitRate * 10) / 10,
      avgPointsPerDart: Math.round(avgPointsPerDart * 100) / 100,
      completionRate: 100, // Operation hat immer 30 Darts, also immer 100%
      totalDarts,
      bestStreak: 0, // Streak muesste aus Events berechnet werden, TODO
    }
  } catch (e) {
    console.warn('[Stats] getOperationFullStats failed:', e)
    return { matchesPlayed: 0, multiMatchesPlayed: 0, multiMatchesWon: 0, soloMatchesPlayed: 0, avgScore: 0, bestScore: 0, avgHitRate: 0, avgPointsPerDart: 0, completionRate: 0, totalDarts: 0, bestStreak: 0 }
  }
}

// ============================================================================
// Operation Trends
// ============================================================================

/**
 * Operation Ø Score pro Monat
 */
export async function getOperationMonthlyAvgScore(playerId: string): Promise<TrendPoint[]> {
  try {
    const results = await query<{
      month: string
      avg_score: number
      match_count: number
    }>(`
      SELECT
        strftime('%Y-%m', m.created_at) as month,
        AVG(CAST(json_extract(m.final_scores, '$.' || ?) AS REAL)) as avg_score,
        COUNT(*) as match_count
      FROM operation_matches m
      JOIN operation_match_players mp ON mp.match_id = m.id AND mp.player_id = ?
      WHERE m.finished = 1
        AND m.final_scores IS NOT NULL
      GROUP BY strftime('%Y-%m', m.created_at)
      ORDER BY month ASC
    `, [playerId, playerId])

    return results.map(r => ({
      date: r.month + '-01',
      month: r.month,
      value: Math.round((r.avg_score ?? 0) * 10) / 10,
      matchCount: r.match_count,
    }))
  } catch (e) {
    console.warn('[Stats] getOperationMonthlyAvgScore failed:', e)
    return []
  }
}

/**
 * Operation Hit-Rate pro Monat
 */
export async function getOperationMonthlyHitRate(playerId: string): Promise<TrendPoint[]> {
  try {
    const results = await query<{
      month: string
      total_throws: number
      total_hits: number
      match_count: number
    }>(`
      SELECT
        strftime('%Y-%m', m.created_at) as month,
        COUNT(*) as total_throws,
        SUM(CASE WHEN json_extract(e.data, '$.hitType') != 'NO_SCORE' THEN 1 ELSE 0 END) as total_hits,
        COUNT(DISTINCT m.id) as match_count
      FROM operation_matches m
      JOIN operation_match_players mp ON mp.match_id = m.id AND mp.player_id = ?
      JOIN operation_events e ON e.match_id = m.id
      WHERE m.finished = 1
        AND e.type = 'OperationDart'
        AND json_extract(e.data, '$.playerId') = ?
      GROUP BY strftime('%Y-%m', m.created_at)
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
  } catch (e) {
    console.warn('[Stats] getOperationMonthlyHitRate failed:', e)
    return []
  }
}
