// src/db/stats/atb.ts
// ATB (Around the Block) statistics functions

import { query, queryOne } from '../index'

// ============================================================================
// Types
// ============================================================================

export type ATBBestTime = {
  mode: string
  direction: string
  bestTime: number
  bestDarts: number
  attempts: number
}

export type ATBVariantSpecificStats = {
  survivedRounds?: number
  eliminationField?: string
  bullQuoteFirstDart?: number
  avgDartsPerBull?: number
  totalBulls?: number
  doubleQuoteFirstDart?: number
  totalResets?: number
  fieldsLostToResets?: number
}

// ============================================================================
// ATB Statistics
// ============================================================================

/**
 * Beste ATB Zeiten pro Modus
 */
export async function getATBBestTimes(playerId: string): Promise<ATBBestTime[]> {
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
      COALESCE(SUM((e.data::jsonb->>'hits')::integer), 0) as total_hits,
      COALESCE(SUM((e.data::jsonb->>'misses')::integer), 0) as total_misses,
      COALESCE(SUM((e.data::jsonb->>'triples')::integer), 0) as total_triples,
      COALESCE(SUM((e.data::jsonb->>'doubles')::integer), 0) as total_doubles
    FROM atb_events e
    JOIN atb_match_players mp ON mp.match_id = e.match_id AND mp.player_id = ?
    JOIN atb_matches m ON m.id = e.match_id AND m.finished = 1
    WHERE e.type = 'ATBTurnAdded'
      AND e.data::jsonb->>'playerId' = ?
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

// ============================================================================
// Variant-Filtered Stats
// ============================================================================

/**
 * ATB Full Stats filtered by specialRule (and optionally miss3Variant)
 */
export async function getATBVariantStats(
  playerId: string,
  specialRule: string,
  miss3Variant?: 'previous' | 'start'
): Promise<ATBFullStats> {
  const matchParams: unknown[] = [playerId, playerId, playerId, playerId]
  let matchFilter = `AND COALESCE(m.special_rule, 'none') = ?`
  matchParams.push(specialRule)

  if (miss3Variant) {
    matchFilter += ` AND COALESCE(m.miss3_back_variant, 'previous') = ?`
    matchParams.push(miss3Variant)
  }

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
      ${matchFilter}
  `, matchParams)

  const eventParams: unknown[] = [playerId, playerId]
  let eventFilter = `AND COALESCE(m.special_rule, 'none') = ?`
  eventParams.push(specialRule)

  if (miss3Variant) {
    eventFilter += ` AND COALESCE(m.miss3_back_variant, 'previous') = ?`
    eventParams.push(miss3Variant)
  }

  const eventStats = await queryOne<{
    total_hits: number
    total_misses: number
    total_triples: number
    total_doubles: number
  }>(`
    SELECT
      COALESCE(SUM((e.data::jsonb->>'hits')::integer), 0) as total_hits,
      COALESCE(SUM((e.data::jsonb->>'misses')::integer), 0) as total_misses,
      COALESCE(SUM((e.data::jsonb->>'triples')::integer), 0) as total_triples,
      COALESCE(SUM((e.data::jsonb->>'doubles')::integer), 0) as total_doubles
    FROM atb_events e
    JOIN atb_match_players mp ON mp.match_id = e.match_id AND mp.player_id = ?
    JOIN atb_matches m ON m.id = e.match_id AND m.finished = 1
    WHERE e.type = 'ATBTurnAdded'
      AND e.data::jsonb->>'playerId' = ?
      ${eventFilter}
  `, eventParams)

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

/**
 * ATB Best Times filtered by specialRule (and optionally miss3Variant)
 */
export async function getATBVariantBestTimes(
  playerId: string,
  specialRule: string,
  miss3Variant?: 'previous' | 'start'
): Promise<ATBBestTime[]> {
  const params: unknown[] = [playerId]
  let filter = `AND COALESCE(m.special_rule, 'none') = ?`
  params.push(specialRule)

  if (miss3Variant) {
    filter += ` AND COALESCE(m.miss3_back_variant, 'previous') = ?`
    params.push(miss3Variant)
  }

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
      ${filter}
    GROUP BY m.mode, m.direction
    ORDER BY best_time ASC
  `, params)

  return results.map(r => ({
    mode: r.mode,
    direction: r.direction,
    bestTime: r.best_time,
    bestDarts: r.best_darts,
    attempts: r.attempts,
  }))
}

/**
 * Variant-specific stats (Sudden Death, Bull Heavy, No Double Escape, Miss 3x)
 */
export async function getATBVariantSpecificStats(
  playerId: string,
  specialRule: string,
  miss3Variant?: 'previous' | 'start'
): Promise<ATBVariantSpecificStats> {
  switch (specialRule) {
    case 'suddenDeath': {
      const result = await queryOne<{
        survived_rounds: number
        elimination_field: number | null
      }>(`
        SELECT
          COUNT(*) FILTER (WHERE (e.data::jsonb->'specialEffects'->>'eliminated') IS DISTINCT FROM 'true') as survived_rounds,
          MODE() WITHIN GROUP (ORDER BY (e.data::jsonb->>'newIndex')::integer) FILTER (WHERE (e.data::jsonb->'specialEffects'->>'eliminated') = 'true') as elimination_field
        FROM atb_events e
        JOIN atb_matches m ON m.id = e.match_id AND m.finished = 1 AND COALESCE(m.special_rule, 'none') = 'suddenDeath'
        JOIN atb_match_players mp ON mp.match_id = m.id AND mp.player_id = ?
        WHERE e.type = 'ATBTurnAdded' AND e.data::jsonb->>'playerId' = ?
      `, [playerId, playerId])

      if (!result || result.survived_rounds === 0) return {}

      return {
        survivedRounds: result.survived_rounds,
        eliminationField: result.elimination_field != null ? String(result.elimination_field) : undefined,
      }
    }

    case 'bullHeavy': {
      const result = await queryOne<{
        total_bulls: number
        bull_needed_turns: number
      }>(`
        SELECT
          SUM(CASE WHEN (e.data::jsonb->'specialEffects'->>'bullHit') = 'true' THEN 1 ELSE 0 END) as total_bulls,
          SUM(CASE WHEN (e.data::jsonb->'specialEffects'->>'needsBull') = 'true' THEN 1 ELSE 0 END) as bull_needed_turns
        FROM atb_events e
        JOIN atb_matches m ON m.id = e.match_id AND m.finished = 1 AND COALESCE(m.special_rule, 'none') = 'bullHeavy'
        JOIN atb_match_players mp ON mp.match_id = m.id AND mp.player_id = ?
        WHERE e.type = 'ATBTurnAdded' AND e.data::jsonb->>'playerId' = ?
      `, [playerId, playerId])

      if (!result || (result.total_bulls === 0 && result.bull_needed_turns === 0)) return {}

      const totalBulls = result.total_bulls ?? 0
      const bullNeededTurns = result.bull_needed_turns ?? 0

      return {
        totalBulls,
        bullQuoteFirstDart: bullNeededTurns > 0
          ? Math.round(totalBulls / bullNeededTurns * 100)
          : 0,
        avgDartsPerBull: totalBulls > 0
          ? Math.round(bullNeededTurns / totalBulls * 10) / 10
          : 0,
      }
    }

    case 'noDoubleEscape': {
      const result = await queryOne<{
        double_used: number
        double_required_turns: number
      }>(`
        SELECT
          SUM(CASE WHEN (e.data::jsonb->'specialEffects'->>'usedDouble') = 'true' THEN 1 ELSE 0 END) as double_used,
          SUM(CASE WHEN (e.data::jsonb->'specialEffects'->>'doubleRequired') = 'true' THEN 1 ELSE 0 END) as double_required_turns
        FROM atb_events e
        JOIN atb_matches m ON m.id = e.match_id AND m.finished = 1 AND COALESCE(m.special_rule, 'none') = 'noDoubleEscape'
        JOIN atb_match_players mp ON mp.match_id = m.id AND mp.player_id = ?
        WHERE e.type = 'ATBTurnAdded' AND e.data::jsonb->>'playerId' = ?
      `, [playerId, playerId])

      if (!result || (result.double_used === 0 && result.double_required_turns === 0)) return {}

      const doubleUsed = result.double_used ?? 0
      const doubleRequired = result.double_required_turns ?? 0
      const totalAttempts = doubleUsed + doubleRequired

      return {
        doubleQuoteFirstDart: totalAttempts > 0
          ? Math.round(doubleUsed / totalAttempts * 100)
          : 0,
      }
    }

    case 'miss3Back': {
      const variant = miss3Variant ?? 'previous'
      const result = await queryOne<{
        total_resets: number
        fields_lost: number
      }>(`
        SELECT
          SUM(CASE WHEN (e.data::jsonb->'specialEffects'->>'setBackTo') IS NOT NULL THEN 1 ELSE 0 END) as total_resets,
          SUM(CASE
            WHEN (e.data::jsonb->'specialEffects'->>'setBackTo') IS NOT NULL
            THEN (e.data::jsonb->>'newIndex')::integer - COALESCE((e.data::jsonb->'specialEffects'->>'setBackTo')::integer, 0)
            ELSE 0
          END) as fields_lost
        FROM atb_events e
        JOIN atb_matches m ON m.id = e.match_id AND m.finished = 1 AND COALESCE(m.special_rule, 'none') = 'miss3Back'
          AND COALESCE(m.miss3_back_variant, 'previous') = ?
        JOIN atb_match_players mp ON mp.match_id = m.id AND mp.player_id = ?
        WHERE e.type = 'ATBTurnAdded' AND e.data::jsonb->>'playerId' = ?
      `, [variant, playerId, playerId])

      if (!result || result.total_resets === 0) return {}

      return {
        totalResets: result.total_resets ?? 0,
        fieldsLostToResets: result.fields_lost ?? 0,
      }
    }

    default:
      return {}
  }
}
