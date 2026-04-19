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
        SUM(CASE WHEN e.data::jsonb->>'hit' = 'true' THEN 1 ELSE 0 END) as hits
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
      SUM(CASE WHEN e.data::jsonb->>'hit' = 'true' THEN 1 ELSE 0 END) as total_hits,
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
            ROUND(CAST(SUM(CASE WHEN e.data::jsonb->>'hit' = 'true' THEN 1 ELSE 0 END) AS numeric) /
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

// ============================================================================
// Bob's 27 Extended Stats & Doppel-Heatmap (Phase 4)
// Bull wird strikt von D1-D20 getrennt aggregiert.
// ============================================================================

export type Bobs27DoubleHeatmapRow = {
  field: string               // "D1".."D20","Bull"
  fieldNumber: number         // 1..20 oder 25
  isBull: boolean
  attempts: number            // Darts auf dieses Doppel
  hits: number
  hitRatePerDart: number      // %
  visits: number              // Target-Besuche
  visitsWithHit: number
  hitRatePerVisit: number     // %
}

/**
 * Liefert pro Doppel (D1..D20 + optional Bull) eine Heatmap-Zeile.
 * Nur abgeschlossene Matches.
 */
export async function getBobs27DoubleHeatmap(playerId: string): Promise<Bobs27DoubleHeatmapRow[]> {
  try {
    const darts = await query<{
      target_index: number
      attempts: number
      hits: number
    }>(`
      SELECT
        (e.data::jsonb->>'targetIndex')::integer as target_index,
        COUNT(*) as attempts,
        SUM(CASE WHEN e.data::jsonb->>'hit' = 'true' THEN 1 ELSE 0 END) as hits
      FROM bobs27_events e
      JOIN bobs27_match_players mp ON mp.match_id = e.match_id AND mp.player_id = ?
      JOIN bobs27_matches m ON m.id = e.match_id AND m.finished = 1
      WHERE e.type = 'Bobs27Throw'
        AND e.data::jsonb->>'playerId' = ?
      GROUP BY target_index
      ORDER BY target_index ASC
    `, [playerId, playerId])

    const visits = await query<{
      target_index: number
      visits: number
      visits_with_hit: number
    }>(`
      SELECT
        (e.data::jsonb->>'targetIndex')::integer as target_index,
        COUNT(*) as visits,
        SUM(CASE WHEN (e.data::jsonb->>'hits')::integer >= 1 THEN 1 ELSE 0 END) as visits_with_hit
      FROM bobs27_events e
      JOIN bobs27_match_players mp ON mp.match_id = e.match_id AND mp.player_id = ?
      JOIN bobs27_matches m ON m.id = e.match_id AND m.finished = 1
      WHERE e.type = 'Bobs27TargetFinished'
        AND e.data::jsonb->>'playerId' = ?
      GROUP BY target_index
      ORDER BY target_index ASC
    `, [playerId, playerId])

    const visitMap = new Map<number, { visits: number; visitsWithHit: number }>()
    for (const v of visits) {
      visitMap.set(v.target_index, { visits: v.visits, visitsWithHit: v.visits_with_hit })
    }

    return darts.map(d => {
      const isBull = d.target_index >= 20
      const fieldNumber = isBull ? 25 : d.target_index + 1
      const field = isBull ? 'Bull' : `D${fieldNumber}`
      const v = visitMap.get(d.target_index) ?? { visits: 0, visitsWithHit: 0 }
      return {
        field,
        fieldNumber,
        isBull,
        attempts: d.attempts,
        hits: d.hits,
        hitRatePerDart: d.attempts > 0 ? Math.round(d.hits / d.attempts * 1000) / 10 : 0,
        visits: v.visits,
        visitsWithHit: v.visitsWithHit,
        hitRatePerVisit: v.visits > 0 ? Math.round(v.visitsWithHit / v.visits * 1000) / 10 : 0,
      }
    })
  } catch (e) {
    console.warn('[Stats] getBobs27DoubleHeatmap failed:', e)
    return []
  }
}

export type Bobs27ExtendedStats = {
  legsPlayed: number
  avgFinalScore: number
  bestLegScore: number
  avgDoubleRatePerDart: number         // NUR D1–D20
  avgDoubleRatePerVisit: number        // NUR D1–D20
  avgZeroVisits: number
  bestImprovement: number
  strongestDouble: { field: string; rate: number } | null   // nur D1–D20
  weakestDouble: { field: string; rate: number } | null     // nur D1–D20

  // Bull SEPARAT
  bullLegsPlayed: number
  bullRatePerDart: number | null
  bullRatePerVisit: number | null

  // Siegquote GETRENNT
  soloMatchesPlayed: number
  soloCompletionRate: number
  mpMatchesPlayed: number
  mpWinRate: number
}

/**
 * Langzeit-Statistiken fuer Bob's 27.
 * - Bull strikt von D1-D20 getrennt.
 * - Siegquoten Solo vs Multiplayer getrennt.
 */
export async function getBobs27ExtendedStats(playerId: string): Promise<Bobs27ExtendedStats> {
  try {
    // 1) Per-Leg-Scores (aus LegFinished-Events)
    const legRows = await query<{
      match_id: string
      created_at: string
      score: number
    }>(`
      SELECT
        e.match_id,
        m.created_at,
        (e.data::jsonb->'finalScores'->>?)::integer as score
      FROM bobs27_events e
      JOIN bobs27_matches m ON m.id = e.match_id AND m.finished = 1
      JOIN bobs27_match_players mp ON mp.match_id = e.match_id AND mp.player_id = ?
      WHERE e.type = 'Bobs27LegFinished'
      ORDER BY m.created_at ASC, e.seq ASC
    `, [playerId, playerId])

    const legScores = legRows
      .map(r => r.score)
      .filter((s): s is number => s !== null && s !== undefined && !Number.isNaN(s))

    const legsPlayed = legScores.length
    const avgFinalScore = legsPlayed > 0 ? legScores.reduce((a, b) => a + b, 0) / legsPlayed : 0
    const bestLegScore = legsPlayed > 0 ? Math.max(...legScores) : 0

    // Beste Entwicklung: Ø letzte 5 Legs minus Ø erste 5 Legs
    let bestImprovement = 0
    if (legsPlayed >= 10) {
      const first5 = legScores.slice(0, 5)
      const last5 = legScores.slice(-5)
      const avgFirst = first5.reduce((a, b) => a + b, 0) / 5
      const avgLast = last5.reduce((a, b) => a + b, 0) / 5
      bestImprovement = Math.round((avgLast - avgFirst) * 10) / 10
    } else if (legsPlayed >= 2) {
      bestImprovement = Math.max(...legScores) - legScores[0]
    }

    // 2) D1-D20 Durchschnitte (Dart + Aufnahme) aus Events
    const dartAggDoubles = await queryOne<{
      total_darts: number
      total_hits: number
    }>(`
      SELECT
        COUNT(*) as total_darts,
        SUM(CASE WHEN e.data::jsonb->>'hit' = 'true' THEN 1 ELSE 0 END) as total_hits
      FROM bobs27_events e
      JOIN bobs27_match_players mp ON mp.match_id = e.match_id AND mp.player_id = ?
      JOIN bobs27_matches m ON m.id = e.match_id AND m.finished = 1
      WHERE e.type = 'Bobs27Throw'
        AND e.data::jsonb->>'playerId' = ?
        AND (e.data::jsonb->>'targetIndex')::integer < 20
    `, [playerId, playerId])

    const visitAggDoubles = await queryOne<{
      total_visits: number
      visits_with_hit: number
    }>(`
      SELECT
        COUNT(*) as total_visits,
        SUM(CASE WHEN (e.data::jsonb->>'hits')::integer >= 1 THEN 1 ELSE 0 END) as visits_with_hit
      FROM bobs27_events e
      JOIN bobs27_match_players mp ON mp.match_id = e.match_id AND mp.player_id = ?
      JOIN bobs27_matches m ON m.id = e.match_id AND m.finished = 1
      WHERE e.type = 'Bobs27TargetFinished'
        AND e.data::jsonb->>'playerId' = ?
        AND (e.data::jsonb->>'targetIndex')::integer < 20
    `, [playerId, playerId])

    const totalDartsDoubles = dartAggDoubles?.total_darts ?? 0
    const totalHitsDoubles = dartAggDoubles?.total_hits ?? 0
    const avgDoubleRatePerDart = totalDartsDoubles > 0
      ? Math.round(totalHitsDoubles / totalDartsDoubles * 1000) / 10
      : 0
    const totalVisitsDoubles = visitAggDoubles?.total_visits ?? 0
    const visitsWithHitDoubles = visitAggDoubles?.visits_with_hit ?? 0
    const avgDoubleRatePerVisit = totalVisitsDoubles > 0
      ? Math.round(visitsWithHitDoubles / totalVisitsDoubles * 1000) / 10
      : 0

    // 3) Bull-Stats (SEPARAT)
    const bullDarts = await queryOne<{
      total_darts: number
      total_hits: number
    }>(`
      SELECT
        COUNT(*) as total_darts,
        SUM(CASE WHEN e.data::jsonb->>'hit' = 'true' THEN 1 ELSE 0 END) as total_hits
      FROM bobs27_events e
      JOIN bobs27_match_players mp ON mp.match_id = e.match_id AND mp.player_id = ?
      JOIN bobs27_matches m ON m.id = e.match_id AND m.finished = 1
      WHERE e.type = 'Bobs27Throw'
        AND e.data::jsonb->>'playerId' = ?
        AND (e.data::jsonb->>'targetIndex')::integer >= 20
    `, [playerId, playerId])

    const bullVisits = await queryOne<{
      total_visits: number
      visits_with_hit: number
    }>(`
      SELECT
        COUNT(*) as total_visits,
        SUM(CASE WHEN (e.data::jsonb->>'hits')::integer >= 1 THEN 1 ELSE 0 END) as visits_with_hit
      FROM bobs27_events e
      JOIN bobs27_match_players mp ON mp.match_id = e.match_id AND mp.player_id = ?
      JOIN bobs27_matches m ON m.id = e.match_id AND m.finished = 1
      WHERE e.type = 'Bobs27TargetFinished'
        AND e.data::jsonb->>'playerId' = ?
        AND (e.data::jsonb->>'targetIndex')::integer >= 20
    `, [playerId, playerId])

    const totalBullDarts = bullDarts?.total_darts ?? 0
    const totalBullHits = bullDarts?.total_hits ?? 0
    const totalBullVisits = bullVisits?.total_visits ?? 0
    const bullVisitsWithHit = bullVisits?.visits_with_hit ?? 0

    const bullRatePerDart = totalBullDarts > 0
      ? Math.round(totalBullHits / totalBullDarts * 1000) / 10
      : null
    const bullRatePerVisit = totalBullVisits > 0
      ? Math.round(bullVisitsWithHit / totalBullVisits * 1000) / 10
      : null

    // Bull-Legs = Anzahl Legs (LegFinished + Throw mit targetIndex>=20) — approximiert via distinct match_id
    const bullLegsRow = await queryOne<{ bull_legs: number }>(`
      SELECT COUNT(DISTINCT e.match_id) as bull_legs
      FROM bobs27_events e
      JOIN bobs27_match_players mp ON mp.match_id = e.match_id AND mp.player_id = ?
      JOIN bobs27_matches m ON m.id = e.match_id AND m.finished = 1
      WHERE e.type = 'Bobs27TargetFinished'
        AND e.data::jsonb->>'playerId' = ?
        AND (e.data::jsonb->>'targetIndex')::integer >= 20
    `, [playerId, playerId])
    const bullLegsPlayed = bullLegsRow?.bull_legs ?? 0

    // 4) Strongest / Weakest Double (nur D1-D20, min. 5 Versuche um Rauschen zu vermeiden)
    const perField = await query<{
      target_index: number
      attempts: number
      hits: number
    }>(`
      SELECT
        (e.data::jsonb->>'targetIndex')::integer as target_index,
        COUNT(*) as attempts,
        SUM(CASE WHEN e.data::jsonb->>'hit' = 'true' THEN 1 ELSE 0 END) as hits
      FROM bobs27_events e
      JOIN bobs27_match_players mp ON mp.match_id = e.match_id AND mp.player_id = ?
      JOIN bobs27_matches m ON m.id = e.match_id AND m.finished = 1
      WHERE e.type = 'Bobs27Throw'
        AND e.data::jsonb->>'playerId' = ?
        AND (e.data::jsonb->>'targetIndex')::integer < 20
      GROUP BY target_index
    `, [playerId, playerId])

    let strongestDouble: { field: string; rate: number } | null = null
    let weakestDouble: { field: string; rate: number } | null = null
    for (const r of perField) {
      if (r.attempts < 5) continue
      const rate = Math.round(r.hits / r.attempts * 1000) / 10
      const field = `D${r.target_index + 1}`
      if (!strongestDouble || rate > strongestDouble.rate) strongestDouble = { field, rate }
      if (!weakestDouble || rate < weakestDouble.rate) weakestDouble = { field, rate }
    }

    // 5) Zero-Visits pro Leg im Schnitt
    const zeroVisitsRow = await queryOne<{ avg_zero: number }>(`
      WITH per_leg_zeros AS (
        SELECT e.match_id,
          COUNT(CASE WHEN (e.data::jsonb->>'hits')::integer = 0 THEN 1 END) as zeros
        FROM bobs27_events e
        JOIN bobs27_match_players mp ON mp.match_id = e.match_id AND mp.player_id = ?
        JOIN bobs27_matches m ON m.id = e.match_id AND m.finished = 1
        WHERE e.type = 'Bobs27TargetFinished'
          AND e.data::jsonb->>'playerId' = ?
        GROUP BY e.match_id
      )
      SELECT COALESCE(AVG(zeros), 0) as avg_zero FROM per_leg_zeros
    `, [playerId, playerId])
    const avgZeroVisits = Math.round((zeroVisitsRow?.avg_zero ?? 0) * 10) / 10

    // 6) Solo vs MP Matches
    const modeStats = await queryOne<{
      solo_played: number
      solo_completed: number
      mp_played: number
      mp_won: number
    }>(`
      WITH match_meta AS (
        SELECT
          m.id,
          m.winner_id,
          (SELECT COUNT(*) FROM bobs27_match_players mpx WHERE mpx.match_id = m.id) as player_count,
          EXISTS(
            SELECT 1 FROM bobs27_events e2
            WHERE e2.match_id = m.id
              AND e2.type = 'Bobs27TargetFinished'
              AND e2.data::jsonb->>'playerId' = ?
              AND e2.data::jsonb->>'eliminated' = 'true'
          ) as was_eliminated
        FROM bobs27_matches m
        JOIN bobs27_match_players mp ON mp.match_id = m.id AND mp.player_id = ?
        WHERE m.finished = 1
      )
      SELECT
        SUM(CASE WHEN player_count = 1 THEN 1 ELSE 0 END) as solo_played,
        SUM(CASE WHEN player_count = 1 AND NOT was_eliminated THEN 1 ELSE 0 END) as solo_completed,
        SUM(CASE WHEN player_count > 1 THEN 1 ELSE 0 END) as mp_played,
        SUM(CASE WHEN player_count > 1 AND winner_id = ? THEN 1 ELSE 0 END) as mp_won
      FROM match_meta
    `, [playerId, playerId, playerId])

    const soloPlayed = modeStats?.solo_played ?? 0
    const soloCompleted = modeStats?.solo_completed ?? 0
    const mpPlayed = modeStats?.mp_played ?? 0
    const mpWon = modeStats?.mp_won ?? 0

    return {
      legsPlayed,
      avgFinalScore: Math.round(avgFinalScore * 10) / 10,
      bestLegScore,
      avgDoubleRatePerDart,
      avgDoubleRatePerVisit,
      avgZeroVisits,
      bestImprovement,
      strongestDouble,
      weakestDouble,
      bullLegsPlayed,
      bullRatePerDart,
      bullRatePerVisit,
      soloMatchesPlayed: soloPlayed,
      soloCompletionRate: soloPlayed > 0 ? Math.round(soloCompleted / soloPlayed * 1000) / 10 : 0,
      mpMatchesPlayed: mpPlayed,
      mpWinRate: mpPlayed > 0 ? Math.round(mpWon / mpPlayed * 1000) / 10 : 0,
    }
  } catch (e) {
    console.warn('[Stats] getBobs27ExtendedStats failed:', e)
    return {
      legsPlayed: 0,
      avgFinalScore: 0,
      bestLegScore: 0,
      avgDoubleRatePerDart: 0,
      avgDoubleRatePerVisit: 0,
      avgZeroVisits: 0,
      bestImprovement: 0,
      strongestDouble: null,
      weakestDouble: null,
      bullLegsPlayed: 0,
      bullRatePerDart: null,
      bullRatePerVisit: null,
      soloMatchesPlayed: 0,
      soloCompletionRate: 0,
      mpMatchesPlayed: 0,
      mpWinRate: 0,
    }
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
        SUM(CASE WHEN e.data::jsonb->>'hit' = 'true' THEN 1 ELSE 0 END) as hits
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
