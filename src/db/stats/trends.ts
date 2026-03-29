// src/db/stats/trends.ts
// Monthly trend functions for non-X01 modes (ATB, CTF, STR, Highscore)

import { query } from '../index'
import type { TrendPoint } from './types'

// ============================================================================
// ATB Monthly Trends
// ============================================================================

/**
 * ATB Trefferquote pro Monat
 * Nutzt enriched fields: $.hits, $.misses, $.totalDarts
 */
export async function getATBMonthlyHitRate(playerId: string): Promise<TrendPoint[]> {
  try {
    const results = await query<{
      month: string
      avg_hit_rate: number
      match_count: number
    }>(`
      SELECT
        to_char(m.created_at::timestamp, 'YYYY-MM') as month,
        SUM((e.data::jsonb->>'hits')::integer)::real /
          NULLIF(SUM((e.data::jsonb->>'totalDarts')::integer), 0) * 100
          as avg_hit_rate,
        COUNT(DISTINCT m.id) as match_count
      FROM atb_matches m
      JOIN atb_events e ON e.match_id = m.id
      JOIN atb_match_players mp ON mp.match_id = m.id AND mp.player_id = ?
      WHERE e.type = 'ATBTurnAdded'
        AND e.data::jsonb->>'playerId' = ?
        AND m.finished = 1
      GROUP BY to_char(m.created_at::timestamp, 'YYYY-MM')
      ORDER BY month ASC
    `, [playerId, playerId])

    return results.map(r => ({
      date: r.month + '-01',
      month: r.month,
      value: Math.round((r.avg_hit_rate || 0) * 100) / 100,
      matchCount: r.match_count,
    }))
  } catch (e) {
    console.warn('[Stats] getATBMonthlyHitRate failed:', e)
    return []
  }
}

// ============================================================================
// CTF Monthly Trends
// ============================================================================

/**
 * CTF Trefferquote pro Monat
 */
export async function getCTFMonthlyHitRate(playerId: string): Promise<TrendPoint[]> {
  try {
    const results = await query<{
      month: string
      avg_hit_rate: number
      match_count: number
    }>(`
      SELECT
        to_char(m.created_at::timestamp, 'YYYY-MM') as month,
        SUM((e.data::jsonb->>'hits')::integer)::real /
          NULLIF(SUM((e.data::jsonb->>'totalDarts')::integer), 0) * 100
          as avg_hit_rate,
        COUNT(DISTINCT m.id) as match_count
      FROM ctf_matches m
      JOIN ctf_events e ON e.match_id = m.id
      JOIN ctf_match_players mp ON mp.match_id = m.id AND mp.player_id = ?
      WHERE e.type = 'CTFTurnAdded'
        AND e.data::jsonb->>'playerId' = ?
        AND m.finished = 1
      GROUP BY to_char(m.created_at::timestamp, 'YYYY-MM')
      ORDER BY month ASC
    `, [playerId, playerId])

    return results.map(r => ({
      date: r.month + '-01',
      month: r.month,
      value: Math.round((r.avg_hit_rate || 0) * 100) / 100,
      matchCount: r.match_count,
    }))
  } catch (e) {
    console.warn('[Stats] getCTFMonthlyHitRate failed:', e)
    return []
  }
}

/**
 * CTF Durchschnittlicher Score pro Match pro Monat
 */
export async function getCTFMonthlyAvgScore(playerId: string): Promise<TrendPoint[]> {
  try {
    const results = await query<{
      month: string
      avg_score: number
      match_count: number
    }>(`
      SELECT
        to_char(created_at::timestamp, 'YYYY-MM') as month,
        AVG(match_score) as avg_score,
        COUNT(*) as match_count
      FROM (
        SELECT
          m.id,
          m.created_at,
          SUM((e.data::jsonb->>'captureScore')::real) as match_score
        FROM ctf_matches m
        JOIN ctf_events e ON e.match_id = m.id
        JOIN ctf_match_players mp ON mp.match_id = m.id AND mp.player_id = ?
        WHERE e.type = 'CTFTurnAdded'
          AND e.data::jsonb->>'playerId' = ?
          AND m.finished = 1
        GROUP BY m.id, m.created_at
      )
      GROUP BY to_char(created_at::timestamp, 'YYYY-MM')
      ORDER BY month ASC
    `, [playerId, playerId])

    return results.map(r => ({
      date: r.month + '-01',
      month: r.month,
      value: Math.round((r.avg_score || 0) * 100) / 100,
      matchCount: r.match_count,
    }))
  } catch (e) {
    console.warn('[Stats] getCTFMonthlyAvgScore failed:', e)
    return []
  }
}

// ============================================================================
// STR Monthly Trends
// ============================================================================

/**
 * STR Trefferquote pro Monat
 */
export async function getStrMonthlyHitRate(playerId: string): Promise<TrendPoint[]> {
  try {
    const results = await query<{
      month: string
      avg_hit_rate: number
      match_count: number
    }>(`
      SELECT
        to_char(m.created_at::timestamp, 'YYYY-MM') as month,
        SUM((e.data::jsonb->>'hits')::integer)::real /
          NULLIF(SUM((e.data::jsonb->>'totalDarts')::integer), 0) * 100
          as avg_hit_rate,
        COUNT(DISTINCT m.id) as match_count
      FROM str_matches m
      JOIN str_events e ON e.match_id = m.id
      JOIN str_match_players mp ON mp.match_id = m.id AND mp.player_id = ?
      WHERE e.type = 'StrTurnAdded'
        AND e.data::jsonb->>'playerId' = ?
        AND m.finished = 1
      GROUP BY to_char(m.created_at::timestamp, 'YYYY-MM')
      ORDER BY month ASC
    `, [playerId, playerId])

    return results.map(r => ({
      date: r.month + '-01',
      month: r.month,
      value: Math.round((r.avg_hit_rate || 0) * 100) / 100,
      matchCount: r.match_count,
    }))
  } catch (e) {
    console.warn('[Stats] getStrMonthlyHitRate failed:', e)
    return []
  }
}

// ============================================================================
// Highscore Monthly Trends
// ============================================================================

/**
 * Highscore Durchschnittlicher Score pro Monat
 */
export async function getHighscoreMonthlyAvgScore(playerId: string): Promise<TrendPoint[]> {
  try {
    const results = await query<{
      month: string
      avg_score: number
      match_count: number
    }>(`
      SELECT
        to_char(created_at::timestamp, 'YYYY-MM') as month,
        AVG(match_score) as avg_score,
        COUNT(*) as match_count
      FROM (
        SELECT
          m.id,
          m.created_at,
          SUM((e.data::jsonb->>'turnScore')::real) as match_score
        FROM highscore_matches m
        JOIN highscore_events e ON e.match_id = m.id
        JOIN highscore_match_players mp ON mp.match_id = m.id AND mp.player_id = ?
        WHERE e.type = 'HighscoreTurnAdded'
          AND e.data::jsonb->>'playerId' = ?
          AND m.finished = 1
        GROUP BY m.id, m.created_at
      )
      GROUP BY to_char(created_at::timestamp, 'YYYY-MM')
      ORDER BY month ASC
    `, [playerId, playerId])

    return results.map(r => ({
      date: r.month + '-01',
      month: r.month,
      value: Math.round((r.avg_score || 0) * 100) / 100,
      matchCount: r.match_count,
    }))
  } catch (e) {
    console.warn('[Stats] getHighscoreMonthlyAvgScore failed:', e)
    return []
  }
}

// ============================================================================
// Shanghai Monthly Trends
// ============================================================================

/**
 * Shanghai Durchschnittlicher Total-Score pro Monat
 */
export async function getShanghaiMonthlyAvgScore(playerId: string): Promise<TrendPoint[]> {
  try {
    const results = await query<{
      month: string
      avg_score: number
      match_count: number
    }>(`
      SELECT
        to_char(m.created_at::timestamp, 'YYYY-MM') as month,
        AVG((m.final_scores::jsonb->>?)::real) as avg_score,
        COUNT(*) as match_count
      FROM shanghai_matches m
      JOIN shanghai_match_players mp ON mp.match_id = m.id AND mp.player_id = ?
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
  } catch (e) {
    console.warn('[Stats] getShanghaiMonthlyAvgScore failed:', e)
    return []
  }
}

// ============================================================================
// Killer Monthly Trends
// ============================================================================

/**
 * Killer Win-Rate pro Monat
 */
export async function getKillerMonthlyWinRate(playerId: string): Promise<TrendPoint[]> {
  try {
    const results = await query<{
      month: string
      win_rate: number
      match_count: number
    }>(`
      SELECT
        to_char(m.created_at::timestamp, 'YYYY-MM') as month,
        SUM(CASE WHEN m.winner_id = ? THEN 1 ELSE 0 END)::real /
          COUNT(*) * 100 as win_rate,
        COUNT(*) as match_count
      FROM killer_matches m
      JOIN killer_match_players mp ON mp.match_id = m.id AND mp.player_id = ?
      WHERE m.finished = 1
      GROUP BY to_char(m.created_at::timestamp, 'YYYY-MM')
      ORDER BY month ASC
    `, [playerId, playerId])

    return results.map(r => ({
      date: r.month + '-01',
      month: r.month,
      value: Math.round((r.win_rate || 0) * 10) / 10,
      matchCount: r.match_count,
    }))
  } catch (e) {
    console.warn('[Stats] getKillerMonthlyWinRate failed:', e)
    return []
  }
}
