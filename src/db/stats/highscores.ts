// src/db/stats/highscores.ts
// All highscore/hall of fame functions

import { query } from '../index'
import { getCachedGroup, setCachedGroup } from '../stats-cache'
import { HIGHSCORE_CATEGORIES, type HighscoreCategory, type HighscoreCategoryId } from '../../types/highscores'

// ============================================================================
// Types
// ============================================================================

export type HighscoreEntrySQL = {
  rank: number
  playerId: string
  playerName: string
  playerColor?: string
  value: number
  matchId?: string
  matchDate?: string
}

// ============================================================================
// X01 Highscores
// ============================================================================

/**
 * Meiste Siege (alle Spielmodi)
 */
export async function getHighscoreMostWins(limit: number = 10): Promise<HighscoreEntrySQL[]> {
  const results = await query<{
    player_id: string
    player_name: string
    player_color: string | null
    total_wins: number
  }>(`
    WITH all_wins AS (
      -- X01: Nur Mehrspieler-Matches (>1 Spieler)
      SELECT e.data::jsonb->>'winnerPlayerId' as winner_id
      FROM x01_events e
      JOIN x01_matches m ON m.id = e.match_id AND m.finished = 1
      WHERE e.type = 'MatchFinished'
        AND (SELECT COUNT(*) FROM x01_match_players WHERE match_id = m.id) > 1
      UNION ALL
      -- Cricket: Nur Mehrspieler-Matches
      SELECT e.data::jsonb->>'winnerPlayerId' as winner_id
      FROM cricket_events e
      JOIN cricket_matches m ON m.id = e.match_id AND m.finished = 1
      WHERE e.type = 'CricketMatchFinished'
        AND (SELECT COUNT(*) FROM cricket_match_players WHERE match_id = m.id) > 1
      UNION ALL
      -- ATB: Nur Mehrspieler-Matches
      SELECT winner_id FROM atb_matches m
      WHERE m.finished = 1 AND m.winner_id IS NOT NULL
        AND (SELECT COUNT(*) FROM atb_match_players WHERE match_id = m.id) > 1
    )
    SELECT
      w.winner_id as player_id,
      p.name as player_name,
      p.color as player_color,
      COUNT(*) as total_wins
    FROM all_wins w
    JOIN profiles p ON p.id = w.winner_id
    WHERE w.winner_id IS NOT NULL
      AND w.winner_id NOT LIKE 'guest-%'
      AND w.winner_id NOT LIKE 'temp-%'
    GROUP BY w.winner_id, p.name, p.color
    ORDER BY total_wins DESC
    LIMIT ?
  `, [limit])

  return results.map((r, i) => ({
    rank: i + 1,
    playerId: r.player_id,
    playerName: r.player_name ?? 'Unbekannt',
    playerColor: r.player_color ?? undefined,
    value: r.total_wins,
  }))
}

/**
 * Beste Gewinnquote (min. 10 Matches)
 */
export async function getHighscoreBestWinrate(limit: number = 10): Promise<HighscoreEntrySQL[]> {
  const results = await query<{
    player_id: string
    player_name: string
    player_color: string | null
    win_rate: number
    total_matches: number
  }>(`
    WITH player_matches AS (
      -- X01: Nur Mehrspieler-Matches
      SELECT mp.player_id, m.id as match_id,
        CASE WHEN (SELECT e.data::jsonb->>'winnerPlayerId' FROM x01_events e
                   WHERE e.match_id = m.id AND e.type = 'MatchFinished') = mp.player_id THEN 1 ELSE 0 END as won
      FROM x01_match_players mp
      JOIN x01_matches m ON m.id = mp.match_id AND m.finished = 1
      WHERE (SELECT COUNT(*) FROM x01_match_players WHERE match_id = m.id) > 1
      UNION ALL
      -- Cricket: Nur Mehrspieler-Matches
      SELECT mp.player_id, m.id as match_id,
        CASE WHEN (SELECT e.data::jsonb->>'winnerPlayerId' FROM cricket_events e
                   WHERE e.match_id = m.id AND e.type = 'CricketMatchFinished') = mp.player_id THEN 1 ELSE 0 END as won
      FROM cricket_match_players mp
      JOIN cricket_matches m ON m.id = mp.match_id AND m.finished = 1
      WHERE (SELECT COUNT(*) FROM cricket_match_players WHERE match_id = m.id) > 1
    )
    SELECT
      pm.player_id,
      p.name as player_name,
      p.color as player_color,
      CAST(SUM(pm.won) AS REAL) / COUNT(*) * 100 as win_rate,
      COUNT(*) as total_matches
    FROM player_matches pm
    JOIN profiles p ON p.id = pm.player_id
    WHERE pm.player_id NOT LIKE 'guest-%'
      AND pm.player_id NOT LIKE 'temp-%'
    GROUP BY pm.player_id, p.name, p.color
    HAVING COUNT(*) >= 10
    ORDER BY win_rate DESC
    LIMIT ?
  `, [limit])

  return results.map((r, i) => ({
    rank: i + 1,
    playerId: r.player_id,
    playerName: r.player_name ?? 'Unbekannt',
    playerColor: r.player_color ?? undefined,
    value: Math.round(r.win_rate * 10) / 10,
  }))
}

/**
 * Meiste 180er
 */
export async function getHighscoreMost180s(limit: number = 10): Promise<HighscoreEntrySQL[]> {
  const results = await query<{
    player_id: string
    player_name: string
    player_color: string | null
    count_180: number
  }>(`
    SELECT
      e.data::jsonb->>'playerId' as player_id,
      p.name as player_name,
      p.color as player_color,
      COUNT(*) as count_180
    FROM x01_events e
    JOIN x01_matches m ON m.id = e.match_id AND m.finished = 1
    JOIN profiles p ON p.id = e.data::jsonb->>'playerId'
    WHERE e.type = 'VisitAdded'
      AND (e.data::jsonb->>'visitScore')::integer = 180
      AND e.data::jsonb->>'playerId' NOT LIKE 'guest-%'
      AND e.data::jsonb->>'playerId' NOT LIKE 'temp-%'
    GROUP BY e.data::jsonb->>'playerId', p.name, p.color
    ORDER BY count_180 DESC
    LIMIT ?
  `, [limit])

  return results.map((r, i) => ({
    rank: i + 1,
    playerId: r.player_id,
    playerName: r.player_name ?? 'Unbekannt',
    playerColor: r.player_color ?? undefined,
    value: r.count_180,
  }))
}

/**
 * Bester Karriere-Durchschnitt (min. 100 Darts)
 */
export async function getHighscoreBestCareerAvg(limit: number = 10): Promise<HighscoreEntrySQL[]> {
  const results = await query<{
    player_id: string
    player_name: string
    player_color: string | null
    avg: number
  }>(`
    SELECT
      e.data::jsonb->>'playerId' as player_id,
      p.name as player_name,
      p.color as player_color,
      AVG((e.data::jsonb->>'visitScore')::real /
          NULLIF(jsonb_array_length(e.data::jsonb->'darts'), 0) * 3) as avg
    FROM x01_events e
    JOIN x01_matches m ON m.id = e.match_id AND m.finished = 1
    JOIN profiles p ON p.id = e.data::jsonb->>'playerId'
    WHERE e.type = 'VisitAdded'
      AND e.data::jsonb->>'playerId' NOT LIKE 'guest-%'
      AND e.data::jsonb->>'playerId' NOT LIKE 'temp-%'
    GROUP BY e.data::jsonb->>'playerId', p.name, p.color
    HAVING SUM(jsonb_array_length(e.data::jsonb->'darts')) >= 100
    ORDER BY avg DESC
    LIMIT ?
  `, [limit])

  return results.map((r, i) => ({
    rank: i + 1,
    playerId: r.player_id,
    playerName: r.player_name ?? 'Unbekannt',
    playerColor: r.player_color ?? undefined,
    value: Math.round((r.avg || 0) * 100) / 100,
  }))
}

/**
 * Beste Checkout-Quote (min. 20 Versuche)
 */
export async function getHighscoreBestCheckoutPct(limit: number = 10): Promise<HighscoreEntrySQL[]> {
  const results = await query<{
    player_id: string
    player_name: string
    player_color: string | null
    checkout_pct: number
  }>(`
    SELECT
      e.data::jsonb->>'playerId' as player_id,
      p.name as player_name,
      p.color as player_color,
      SUM(CASE WHEN e.data::jsonb->>'finishingDartSeq' IS NOT NULL THEN 1 ELSE 0 END)::real /
      COUNT(*) * 100 as checkout_pct
    FROM x01_events e
    JOIN x01_matches m ON m.id = e.match_id AND m.finished = 1
    JOIN profiles p ON p.id = e.data::jsonb->>'playerId'
    WHERE e.type = 'VisitAdded'
      AND (e.data::jsonb->>'remainingBefore')::integer <= 170
      AND e.data::jsonb->>'playerId' NOT LIKE 'guest-%'
      AND e.data::jsonb->>'playerId' NOT LIKE 'temp-%'
    GROUP BY e.data::jsonb->>'playerId', p.name, p.color
    HAVING COUNT(*) >= 20
    ORDER BY checkout_pct DESC
    LIMIT ?
  `, [limit])

  return results.map((r, i) => ({
    rank: i + 1,
    playerId: r.player_id,
    playerName: r.player_name ?? 'Unbekannt',
    playerColor: r.player_color ?? undefined,
    value: Math.round((r.checkout_pct || 0) * 10) / 10,
  }))
}

/**
 * Höchste Aufnahme (X01)
 */
export async function getHighscoreHighestVisit(limit: number = 10): Promise<HighscoreEntrySQL[]> {
  const results = await query<{
    player_id: string
    player_name: string
    player_color: string | null
    best_visit: number
  }>(`
    SELECT
      e.data::jsonb->>'playerId' as player_id,
      p.name as player_name,
      p.color as player_color,
      MAX((e.data::jsonb->>'visitScore')::integer) as best_visit
    FROM x01_events e
    JOIN x01_matches m ON m.id = e.match_id AND m.finished = 1
    JOIN profiles p ON p.id = e.data::jsonb->>'playerId'
    WHERE e.type = 'VisitAdded'
      AND e.data::jsonb->>'playerId' NOT LIKE 'guest-%'
      AND e.data::jsonb->>'playerId' NOT LIKE 'temp-%'
    GROUP BY e.data::jsonb->>'playerId', p.name, p.color
    ORDER BY best_visit DESC
    LIMIT ?
  `, [limit])

  return results.map((r, i) => ({
    rank: i + 1,
    playerId: r.player_id,
    playerName: r.player_name ?? 'Unbekannt',
    playerColor: r.player_color ?? undefined,
    value: r.best_visit,
  }))
}

/**
 * Höchstes Finish / Checkout (X01)
 */
export async function getHighscoreHighestCheckout(limit: number = 10): Promise<HighscoreEntrySQL[]> {
  const results = await query<{
    player_id: string
    player_name: string
    player_color: string | null
    best_checkout: number
  }>(`
    SELECT
      e.data::jsonb->>'playerId' as player_id,
      p.name as player_name,
      p.color as player_color,
      MAX((e.data::jsonb->>'remainingBefore')::integer) as best_checkout
    FROM x01_events e
    JOIN x01_matches m ON m.id = e.match_id AND m.finished = 1
    JOIN profiles p ON p.id = e.data::jsonb->>'playerId'
    WHERE e.type = 'VisitAdded'
      AND e.data::jsonb->>'finishingDartSeq' IS NOT NULL
      AND e.data::jsonb->>'playerId' NOT LIKE 'guest-%'
      AND e.data::jsonb->>'playerId' NOT LIKE 'temp-%'
    GROUP BY e.data::jsonb->>'playerId', p.name, p.color
    ORDER BY best_checkout DESC
    LIMIT ?
  `, [limit])

  return results.map((r, i) => ({
    rank: i + 1,
    playerId: r.player_id,
    playerName: r.player_name ?? 'Unbekannt',
    playerColor: r.player_color ?? undefined,
    value: r.best_checkout,
  }))
}

/**
 * Bestes Leg (wenigste Darts) für eine X01-Variante
 */
export async function getHighscoreBestLeg(variant: number, limit: number = 10): Promise<HighscoreEntrySQL[]> {
  const results = await query<{
    player_id: string
    player_name: string
    player_color: string | null
    best_darts: number
  }>(`
    WITH leg_darts AS (
      SELECT
        lf.data::jsonb->>'winnerPlayerId' as player_id,
        (SELECT SUM(jsonb_array_length(va.data::jsonb->'darts'))
         FROM x01_events va
         WHERE va.match_id = lf.match_id
           AND va.type = 'VisitAdded'
           AND va.data::jsonb->>'playerId' = lf.data::jsonb->>'winnerPlayerId'
           AND va.data::jsonb->>'legId' = lf.data::jsonb->>'legId'
        ) as darts_count
      FROM x01_events lf
      JOIN x01_matches m ON m.id = lf.match_id AND m.finished = 1 AND m.starting_score = ?
      WHERE lf.type = 'LegFinished'
        AND lf.data::jsonb->>'winnerPlayerId' NOT LIKE 'guest-%'
        AND lf.data::jsonb->>'winnerPlayerId' NOT LIKE 'temp-%'
    )
    SELECT
      ld.player_id,
      p.name as player_name,
      p.color as player_color,
      MIN(ld.darts_count) as best_darts
    FROM leg_darts ld
    JOIN profiles p ON p.id = ld.player_id
    WHERE ld.darts_count > 0
    GROUP BY ld.player_id, p.name, p.color
    ORDER BY best_darts ASC
    LIMIT ?
  `, [variant, limit])

  return results.map((r, i) => ({
    rank: i + 1,
    playerId: r.player_id,
    playerName: r.player_name ?? 'Unbekannt',
    playerColor: r.player_color ?? undefined,
    value: r.best_darts,
  }))
}

/**
 * Bester Match-Average für eine X01-Variante (min. 3 Aufnahmen)
 */
export async function getHighscoreBestMatchAvg(variant: number, limit: number = 10): Promise<HighscoreEntrySQL[]> {
  const results = await query<{
    player_id: string
    player_name: string
    player_color: string | null
    best_avg: number
  }>(`
    WITH match_avgs AS (
      SELECT
        e.data::jsonb->>'playerId' as player_id,
        SUM((e.data::jsonb->>'visitScore')::real) /
          NULLIF(SUM(jsonb_array_length(e.data::jsonb->'darts')), 0) * 3 as avg
      FROM x01_events e
      JOIN x01_matches m ON m.id = e.match_id AND m.finished = 1 AND m.starting_score = ?
      WHERE e.type = 'VisitAdded'
        AND e.data::jsonb->>'playerId' NOT LIKE 'guest-%'
        AND e.data::jsonb->>'playerId' NOT LIKE 'temp-%'
      GROUP BY e.data::jsonb->>'playerId', m.id
      HAVING COUNT(*) >= 3
    )
    SELECT
      ma.player_id,
      p.name as player_name,
      p.color as player_color,
      MAX(ma.avg) as best_avg
    FROM match_avgs ma
    JOIN profiles p ON p.id = ma.player_id
    GROUP BY ma.player_id, p.name, p.color
    ORDER BY best_avg DESC
    LIMIT ?
  `, [variant, limit])

  return results.map((r, i) => ({
    rank: i + 1,
    playerId: r.player_id,
    playerName: r.player_name ?? 'Unbekannt',
    playerColor: r.player_color ?? undefined,
    value: Math.round((r.best_avg || 0) * 100) / 100,
  }))
}

// ============================================================================
// Cricket Highscores
// ============================================================================

/**
 * Beste Marks-Per-Turn Karriere (Cricket, min. 50 Turns)
 */
export async function getHighscoreBestMPT(limit: number = 10): Promise<HighscoreEntrySQL[]> {
  const results = await query<{
    player_id: string
    player_name: string
    player_color: string | null
    mpt: number
  }>(`
    SELECT
      e.data::jsonb->>'playerId' as player_id,
      p.name as player_name,
      p.color as player_color,
      SUM((e.data::jsonb->>'marks')::integer)::real / COUNT(*) as mpt
    FROM cricket_events e
    JOIN cricket_matches m ON m.id = e.match_id AND m.finished = 1
    JOIN profiles p ON p.id = e.data::jsonb->>'playerId'
    WHERE e.type = 'CricketTurnAdded'
      AND e.data::jsonb->>'playerId' NOT LIKE 'guest-%'
      AND e.data::jsonb->>'playerId' NOT LIKE 'temp-%'
    GROUP BY e.data::jsonb->>'playerId', p.name, p.color
    HAVING COUNT(*) >= 50
    ORDER BY mpt DESC
    LIMIT ?
  `, [limit])

  return results.map((r, i) => ({
    rank: i + 1,
    playerId: r.player_id,
    playerName: r.player_name ?? 'Unbekannt',
    playerColor: r.player_color ?? undefined,
    value: Math.round((r.mpt || 0) * 100) / 100,
  }))
}

/**
 * Beste Marks-Per-Dart Karriere (Cricket, min. 100 Darts)
 */
export async function getHighscoreBestMPD(limit: number = 10): Promise<HighscoreEntrySQL[]> {
  const results = await query<{
    player_id: string
    player_name: string
    player_color: string | null
    mpd: number
  }>(`
    SELECT
      e.data::jsonb->>'playerId' as player_id,
      p.name as player_name,
      p.color as player_color,
      SUM((e.data::jsonb->>'marks')::integer)::real /
        NULLIF(SUM(COALESCE(
          (e.data::jsonb->>'dartCount')::integer,
          jsonb_array_length(e.data::jsonb->'darts')
        )), 0) as mpd
    FROM cricket_events e
    JOIN cricket_matches m ON m.id = e.match_id AND m.finished = 1
    JOIN profiles p ON p.id = e.data::jsonb->>'playerId'
    WHERE e.type = 'CricketTurnAdded'
      AND e.data::jsonb->>'playerId' NOT LIKE 'guest-%'
      AND e.data::jsonb->>'playerId' NOT LIKE 'temp-%'
    GROUP BY e.data::jsonb->>'playerId', p.name, p.color
    HAVING SUM(COALESCE(
      (e.data::jsonb->>'dartCount')::integer,
      jsonb_array_length(e.data::jsonb->'darts')
    )) >= 100
    ORDER BY mpd DESC
    LIMIT ?
  `, [limit])

  return results.map((r, i) => ({
    rank: i + 1,
    playerId: r.player_id,
    playerName: r.player_name ?? 'Unbekannt',
    playerColor: r.player_color ?? undefined,
    value: Math.round((r.mpd || 0) * 100) / 100,
  }))
}

/**
 * Meiste Triples Karriere (Cricket)
 */
export async function getHighscoreMostTriples(limit: number = 10): Promise<HighscoreEntrySQL[]> {
  const results = await query<{
    player_id: string
    player_name: string
    player_color: string | null
    total_triples: number
  }>(`
    SELECT
      e.data::jsonb->>'playerId' as player_id,
      p.name as player_name,
      p.color as player_color,
      SUM((e.data::jsonb->>'tripleCount')::integer) as total_triples
    FROM cricket_events e
    JOIN cricket_matches m ON m.id = e.match_id AND m.finished = 1
    JOIN profiles p ON p.id = e.data::jsonb->>'playerId'
    WHERE e.type = 'CricketTurnAdded'
      AND e.data::jsonb->>'playerId' NOT LIKE 'guest-%'
      AND e.data::jsonb->>'playerId' NOT LIKE 'temp-%'
    GROUP BY e.data::jsonb->>'playerId', p.name, p.color
    HAVING SUM((e.data::jsonb->>'tripleCount')::integer) > 0
    ORDER BY total_triples DESC
    LIMIT ?
  `, [limit])

  return results.map((r, i) => ({
    rank: i + 1,
    playerId: r.player_id,
    playerName: r.player_name ?? 'Unbekannt',
    playerColor: r.player_color ?? undefined,
    value: r.total_triples,
  }))
}

/**
 * Beste einzelne Runde (marks) (Cricket)
 */
export async function getHighscoreBestTurnMarks(limit: number = 10): Promise<HighscoreEntrySQL[]> {
  const results = await query<{
    player_id: string
    player_name: string
    player_color: string | null
    best_marks: number
  }>(`
    SELECT
      e.data::jsonb->>'playerId' as player_id,
      p.name as player_name,
      p.color as player_color,
      MAX((e.data::jsonb->>'marks')::integer) as best_marks
    FROM cricket_events e
    JOIN cricket_matches m ON m.id = e.match_id AND m.finished = 1
    JOIN profiles p ON p.id = e.data::jsonb->>'playerId'
    WHERE e.type = 'CricketTurnAdded'
      AND e.data::jsonb->>'playerId' NOT LIKE 'guest-%'
      AND e.data::jsonb->>'playerId' NOT LIKE 'temp-%'
    GROUP BY e.data::jsonb->>'playerId', p.name, p.color
    HAVING MAX((e.data::jsonb->>'marks')::integer) > 0
    ORDER BY best_marks DESC
    LIMIT ?
  `, [limit])

  return results.map((r, i) => ({
    rank: i + 1,
    playerId: r.player_id,
    playerName: r.player_name ?? 'Unbekannt',
    playerColor: r.player_color ?? undefined,
    value: r.best_marks,
  }))
}

// ============================================================================
// ATB Highscores
// ============================================================================

/**
 * ATB: Schnellste Zeit
 */
export async function getHighscoreATBFastest(mode: string, limit: number = 10): Promise<HighscoreEntrySQL[]> {
  const results = await query<{
    player_id: string
    player_name: string
    player_color: string | null
    best_time: number
  }>(`
    SELECT
      m.winner_id as player_id,
      p.name as player_name,
      p.color as player_color,
      MIN(m.duration_ms) as best_time
    FROM atb_matches m
    JOIN profiles p ON p.id = m.winner_id
    WHERE m.finished = 1
      AND m.mode = ?
      AND m.duration_ms IS NOT NULL
      AND m.winner_id IS NOT NULL
      AND m.winner_id NOT LIKE 'guest-%'
      AND m.winner_id NOT LIKE 'temp-%'
    GROUP BY m.winner_id, p.name, p.color
    ORDER BY best_time ASC
    LIMIT ?
  `, [mode, limit])

  return results.map((r, i) => ({
    rank: i + 1,
    playerId: r.player_id,
    playerName: r.player_name ?? 'Unbekannt',
    playerColor: r.player_color ?? undefined,
    value: r.best_time,
  }))
}

/**
 * ATB: Wenigste Darts
 */
export async function getHighscoreATBFewestDarts(mode: string, limit: number = 10): Promise<HighscoreEntrySQL[]> {
  const results = await query<{
    player_id: string
    player_name: string
    player_color: string | null
    best_darts: number
  }>(`
    SELECT
      m.winner_id as player_id,
      p.name as player_name,
      p.color as player_color,
      MIN(m.winner_darts) as best_darts
    FROM atb_matches m
    JOIN profiles p ON p.id = m.winner_id
    WHERE m.finished = 1
      AND m.mode = ?
      AND m.winner_darts IS NOT NULL
      AND m.winner_id IS NOT NULL
      AND m.winner_id NOT LIKE 'guest-%'
      AND m.winner_id NOT LIKE 'temp-%'
    GROUP BY m.winner_id, p.name, p.color
    ORDER BY best_darts ASC
    LIMIT ?
  `, [mode, limit])

  return results.map((r, i) => ({
    rank: i + 1,
    playerId: r.player_id,
    playerName: r.player_name ?? 'Unbekannt',
    playerColor: r.player_color ?? undefined,
    value: r.best_darts,
  }))
}

/**
 * ATB: Meiste Siege
 */
export async function getHighscoreATBMostWins(limit: number = 10): Promise<HighscoreEntrySQL[]> {
  const results = await query<{
    player_id: string
    player_name: string
    player_color: string | null
    total_wins: number
  }>(`
    SELECT
      m.winner_id as player_id,
      p.name as player_name,
      p.color as player_color,
      COUNT(*) as total_wins
    FROM atb_matches m
    JOIN profiles p ON p.id = m.winner_id
    WHERE m.finished = 1
      AND m.winner_id IS NOT NULL
      AND m.winner_id NOT LIKE 'guest-%'
      AND m.winner_id NOT LIKE 'temp-%'
    GROUP BY m.winner_id, p.name, p.color
    ORDER BY total_wins DESC
    LIMIT ?
  `, [limit])

  return results.map((r, i) => ({
    rank: i + 1,
    playerId: r.player_id,
    playerName: r.player_name ?? 'Unbekannt',
    playerColor: r.player_color ?? undefined,
    value: r.total_wins,
  }))
}

// ============================================================================
// Bob's 27 Highscores
// ============================================================================

/**
 * Bester Bob's 27 Endstand (aus final_scores JSON)
 */
export async function getHighscoreBobs27BestScore(limit: number = 10): Promise<HighscoreEntrySQL[]> {
  const results = await query<{
    player_id: string
    player_name: string
    player_color: string | null
    match_id: string
    match_date: string
    score: number
  }>(`
    WITH match_player_scores AS (
      SELECT
        mp.player_id,
        p.name as player_name,
        p.color as player_color,
        m.id as match_id,
        m.created_at as match_date,
        (m.final_scores::jsonb->>mp.player_id)::real as score
      FROM bobs27_matches m
      JOIN bobs27_match_players mp ON mp.match_id = m.id
      JOIN profiles p ON p.id = mp.player_id
      WHERE m.finished = 1
        AND m.final_scores IS NOT NULL
    )
    SELECT player_id, player_name, player_color, match_id, match_date, score
    FROM match_player_scores
    WHERE score IS NOT NULL
    ORDER BY score DESC
    LIMIT ?
  `, [limit])

  return results.map((r, i) => ({
    rank: i + 1,
    playerId: r.player_id,
    playerName: r.player_name ?? 'Unbekannt',
    playerColor: r.player_color ?? undefined,
    value: r.score,
    matchId: r.match_id,
    matchDate: r.match_date,
  }))
}

/**
 * Beste Bob's 27 Hit-Rate (Karriere, min. 5 Matches)
 */
export async function getHighscoreBobs27BestHitRate(limit: number = 10): Promise<HighscoreEntrySQL[]> {
  const results = await query<{
    player_id: string
    player_name: string
    player_color: string | null
    hit_rate: number
    match_count: number
  }>(`
    SELECT
      mp.player_id,
      p.name as player_name,
      p.color as player_color,
      SUM(CASE WHEN e.data::jsonb->>'hit' = 'true' THEN 1 ELSE 0 END)::real /
        NULLIF(COUNT(*), 0) * 100 as hit_rate,
      COUNT(DISTINCT m.id) as match_count
    FROM bobs27_matches m
    JOIN bobs27_match_players mp ON mp.match_id = m.id
    JOIN bobs27_events e ON e.match_id = m.id
    JOIN profiles p ON p.id = mp.player_id
    WHERE m.finished = 1
      AND e.type = 'Bobs27Throw'
      AND e.data::jsonb->>'playerId' = mp.player_id
    GROUP BY mp.player_id, p.name, p.color
    HAVING COUNT(DISTINCT m.id) >= 5
    ORDER BY hit_rate DESC
    LIMIT ?
  `, [limit])

  return results.map((r, i) => ({
    rank: i + 1,
    playerId: r.player_id,
    playerName: r.player_name ?? 'Unbekannt',
    playerColor: r.player_color ?? undefined,
    value: Math.round(r.hit_rate * 10) / 10,
  }))
}

/**
 * Meiste Bob's 27 Siege
 */
export async function getHighscoreBobs27MostWins(limit: number = 10): Promise<HighscoreEntrySQL[]> {
  const results = await query<{
    player_id: string
    player_name: string
    player_color: string | null
    total_wins: number
  }>(`
    SELECT
      m.winner_id as player_id,
      p.name as player_name,
      p.color as player_color,
      COUNT(*) as total_wins
    FROM bobs27_matches m
    JOIN profiles p ON p.id = m.winner_id
    WHERE m.finished = 1
      AND m.winner_id IS NOT NULL
    GROUP BY m.winner_id, p.name, p.color
    ORDER BY total_wins DESC
    LIMIT ?
  `, [limit])

  return results.map((r, i) => ({
    rank: i + 1,
    playerId: r.player_id,
    playerName: r.player_name ?? 'Unbekannt',
    playerColor: r.player_color ?? undefined,
    value: r.total_wins,
  }))
}

// ============================================================================
// Operation Highscores
// ============================================================================

/**
 * Meiste Operation Treffer (gewichtete Hits: Single=1, Double=2, Triple=3)
 */
export async function getHighscoreOperationBestScore(limit: number = 10): Promise<HighscoreEntrySQL[]> {
  const results = await query<{
    player_id: string
    player_name: string
    player_color: string | null
    match_id: string
    match_date: string
    hits: number
  }>(`
    WITH match_player_hits AS (
      SELECT
        mp.player_id,
        p.name as player_name,
        p.color as player_color,
        m.id as match_id,
        m.created_at as match_date,
        SUM(
          CASE e.data::jsonb->>'hitType'
            WHEN 'SINGLE' THEN 1
            WHEN 'DOUBLE' THEN 2
            WHEN 'TRIPLE' THEN 3
            WHEN 'SINGLE_BULL' THEN 1
            WHEN 'DOUBLE_BULL' THEN 2
            ELSE 0
          END
        ) as hits
      FROM operation_matches m
      JOIN operation_match_players mp ON mp.match_id = m.id
      JOIN operation_events e ON e.match_id = m.id
      JOIN profiles p ON p.id = mp.player_id
      WHERE m.finished = 1
        AND e.type = 'OperationDart'
        AND e.data::jsonb->>'playerId' = mp.player_id
      GROUP BY mp.player_id, m.id, p.name, p.color, m.created_at
    )
    SELECT player_id, player_name, player_color, match_id, match_date, hits
    FROM match_player_hits
    ORDER BY hits DESC
    LIMIT ?
  `, [limit])

  return results.map((r, i) => ({
    rank: i + 1,
    playerId: r.player_id,
    playerName: r.player_name ?? 'Unbekannt',
    playerColor: r.player_color ?? undefined,
    value: r.hits,
    matchId: r.match_id,
    matchDate: r.match_date,
  }))
}

/**
 * Bester Ø Punkte/Dart (Operation, Karriere, min. 5 Matches)
 */
export async function getHighscoreOperationBestAvgPPD(limit: number = 10): Promise<HighscoreEntrySQL[]> {
  const results = await query<{
    player_id: string
    player_name: string
    player_color: string | null
    avg_ppd: number
    match_count: number
  }>(`
    SELECT
      mp.player_id,
      p.name as player_name,
      p.color as player_color,
      SUM((e.data::jsonb->>'points')::numeric)::real /
        NULLIF(COUNT(*), 0) as avg_ppd,
      COUNT(DISTINCT m.id) as match_count
    FROM operation_matches m
    JOIN operation_match_players mp ON mp.match_id = m.id
    JOIN operation_events e ON e.match_id = m.id
    JOIN profiles p ON p.id = mp.player_id
    WHERE m.finished = 1
      AND e.type = 'OperationDart'
      AND e.data::jsonb->>'playerId' = mp.player_id
    GROUP BY mp.player_id, p.name, p.color
    HAVING COUNT(DISTINCT m.id) >= 5
    ORDER BY avg_ppd DESC
    LIMIT ?
  `, [limit])

  return results.map((r, i) => ({
    rank: i + 1,
    playerId: r.player_id,
    playerName: r.player_name ?? 'Unbekannt',
    playerColor: r.player_color ?? undefined,
    value: Math.round(r.avg_ppd * 100) / 100,
  }))
}

/**
 * Beste Operation Hit-Rate (Karriere, min. 5 Matches)
 */
export async function getHighscoreOperationBestHitRate(limit: number = 10): Promise<HighscoreEntrySQL[]> {
  const results = await query<{
    player_id: string
    player_name: string
    player_color: string | null
    hit_rate: number
    match_count: number
  }>(`
    SELECT
      mp.player_id,
      p.name as player_name,
      p.color as player_color,
      SUM(CASE WHEN e.data::jsonb->>'hitType' != 'NO_SCORE' THEN 1 ELSE 0 END)::real /
        NULLIF(COUNT(*), 0) * 100 as hit_rate,
      COUNT(DISTINCT m.id) as match_count
    FROM operation_matches m
    JOIN operation_match_players mp ON mp.match_id = m.id
    JOIN operation_events e ON e.match_id = m.id
    JOIN profiles p ON p.id = mp.player_id
    WHERE m.finished = 1
      AND e.type = 'OperationDart'
      AND e.data::jsonb->>'playerId' = mp.player_id
    GROUP BY mp.player_id, p.name, p.color
    HAVING COUNT(DISTINCT m.id) >= 5
    ORDER BY hit_rate DESC
    LIMIT ?
  `, [limit])

  return results.map((r, i) => ({
    rank: i + 1,
    playerId: r.player_id,
    playerName: r.player_name ?? 'Unbekannt',
    playerColor: r.player_color ?? undefined,
    value: Math.round(r.hit_rate * 10) / 10,
  }))
}

/**
 * Meiste Operation Siege
 */
export async function getHighscoreOperationMostWins(limit: number = 10): Promise<HighscoreEntrySQL[]> {
  const results = await query<{
    player_id: string
    player_name: string
    player_color: string | null
    total_wins: number
  }>(`
    SELECT
      m.winner_id as player_id,
      p.name as player_name,
      p.color as player_color,
      COUNT(*) as total_wins
    FROM operation_matches m
    JOIN profiles p ON p.id = m.winner_id
    WHERE m.finished = 1
      AND m.winner_id IS NOT NULL
    GROUP BY m.winner_id, p.name, p.color
    ORDER BY total_wins DESC
    LIMIT ?
  `, [limit])

  return results.map((r, i) => ({
    rank: i + 1,
    playerId: r.player_id,
    playerName: r.player_name ?? 'Unbekannt',
    playerColor: r.player_color ?? undefined,
    value: r.total_wins,
  }))
}

/**
 * Längster Hit-Streak (Operation)
 */
export async function getHighscoreOperationLongestStreak(limit: number = 10): Promise<HighscoreEntrySQL[]> {
  const results = await query<{
    player_id: string
    player_name: string
    player_color: string | null
    match_id: string
    match_date: string
    longest_streak: number
  }>(`
    WITH darts AS (
      SELECT
        e.match_id,
        e.data::jsonb->>'playerId' as player_id,
        e.data::jsonb->>'legIndex' as leg_index,
        (e.data::jsonb->>'isHit')::integer as is_hit,
        ROW_NUMBER() OVER (
          PARTITION BY e.match_id, e.data::jsonb->>'playerId', e.data::jsonb->>'legIndex'
          ORDER BY e.seq
        ) as rn
      FROM operation_events e
      JOIN operation_matches m ON m.id = e.match_id
      WHERE e.type = 'OperationDart'
        AND m.finished = 1
    ),
    hits_numbered AS (
      SELECT *,
        ROW_NUMBER() OVER (
          PARTITION BY match_id, player_id, leg_index
          ORDER BY rn
        ) as hit_rn
      FROM darts
      WHERE is_hit = 1
    ),
    streaks AS (
      SELECT
        player_id,
        match_id,
        COUNT(*) as streak_len
      FROM hits_numbered
      GROUP BY player_id, match_id, leg_index, (rn - hit_rn)
    ),
    best_per_player AS (
      SELECT
        player_id,
        match_id,
        MAX(streak_len) as best_streak,
        ROW_NUMBER() OVER (PARTITION BY player_id ORDER BY MAX(streak_len) DESC) as rk
      FROM streaks
      GROUP BY player_id, match_id
    )
    SELECT
      b.player_id,
      p.name as player_name,
      p.color as player_color,
      b.match_id,
      m.created_at as match_date,
      b.best_streak as longest_streak
    FROM best_per_player b
    JOIN operation_matches m ON m.id = b.match_id
    JOIN profiles p ON p.id = b.player_id
    WHERE b.rk = 1
    ORDER BY b.best_streak DESC
    LIMIT ?
  `, [limit])

  return results.map((r, i) => ({
    rank: i + 1,
    playerId: r.player_id,
    playerName: r.player_name ?? 'Unbekannt',
    playerColor: r.player_color ?? undefined,
    value: r.longest_streak,
    matchId: r.match_id,
    matchDate: r.match_date,
  }))
}

// ============================================================================
// Cricket Highscore-Queries (6 Kategorien)
// ============================================================================

export async function getCricketHighscoreBestTurnMarks(limit: number = 5): Promise<HighscoreEntrySQL[]> {
  const results = await query<{
    player_id: string
    player_name: string
    player_color: string | null
    marks: number
    match_id: string
    match_date: string
  }>(`
    SELECT
      e.data::jsonb->>'playerId' as player_id,
      p.name as player_name,
      p.color as player_color,
      (e.data::jsonb->>'marks')::integer as marks,
      m.id as match_id,
      m.created_at as match_date
    FROM cricket_events e
    JOIN cricket_matches m ON m.id = e.match_id AND m.finished = 1
    JOIN profiles p ON p.id = e.data::jsonb->>'playerId'
    WHERE e.type = 'CricketTurnAdded'
      AND e.data::jsonb->>'playerId' NOT LIKE 'guest-%'
      AND e.data::jsonb->>'playerId' NOT LIKE 'temp-%'
      AND (e.data::jsonb->>'marks')::integer > 0
    ORDER BY marks DESC
    LIMIT ?
  `, [limit])

  return results.map((r, i) => ({
    rank: i + 1,
    playerId: r.player_id,
    playerName: r.player_name ?? 'Unbekannt',
    playerColor: r.player_color ?? undefined,
    value: r.marks,
    matchId: r.match_id,
    matchDate: r.match_date,
  }))
}

export async function getCricketHighscoreBestWinrate(limit: number = 5): Promise<HighscoreEntrySQL[]> {
  const results = await query<{
    player_id: string
    player_name: string
    player_color: string | null
    win_rate: number
    total_matches: number
  }>(`
    WITH player_matches AS (
      SELECT mp.player_id, m.id as match_id,
        CASE WHEN (SELECT e.data::jsonb->>'winnerPlayerId' FROM cricket_events e
                   WHERE e.match_id = m.id AND e.type = 'CricketMatchFinished') = mp.player_id THEN 1 ELSE 0 END as won
      FROM cricket_match_players mp
      JOIN cricket_matches m ON m.id = mp.match_id AND m.finished = 1
      WHERE (SELECT COUNT(*) FROM cricket_match_players WHERE match_id = m.id) > 1
    )
    SELECT
      pm.player_id,
      p.name as player_name,
      p.color as player_color,
      CAST(SUM(pm.won) AS REAL) / COUNT(*) * 100 as win_rate,
      COUNT(*) as total_matches
    FROM player_matches pm
    JOIN profiles p ON p.id = pm.player_id
    WHERE pm.player_id NOT LIKE 'guest-%'
      AND pm.player_id NOT LIKE 'temp-%'
    GROUP BY pm.player_id, p.name, p.color
    HAVING COUNT(*) >= 10
    ORDER BY win_rate DESC
    LIMIT ?
  `, [limit])

  return results.map((r, i) => ({
    rank: i + 1,
    playerId: r.player_id,
    playerName: r.player_name ?? 'Unbekannt',
    playerColor: r.player_color ?? undefined,
    value: Math.round(r.win_rate * 10) / 10,
  }))
}

export async function getCricketHighscoreHighestLegScore(limit: number = 5): Promise<HighscoreEntrySQL[]> {
  const results = await query<{
    player_id: string
    player_name: string
    player_color: string | null
    total_marks: number
    match_id: string
    match_date: string
  }>(`
    WITH turn_data AS (
      SELECT
        e.data::jsonb->>'playerId' as player_id,
        e.match_id,
        (e.data::jsonb->>'marks')::integer as marks,
        (SELECT COUNT(*) FROM cricket_events lf
         WHERE lf.match_id = e.match_id
           AND lf.type = 'CricketLegFinished'
           AND lf.id < e.id) as leg_num
      FROM cricket_events e
      JOIN cricket_matches m ON m.id = e.match_id AND m.finished = 1
      WHERE e.type = 'CricketTurnAdded'
        AND e.data::jsonb->>'playerId' NOT LIKE 'guest-%'
        AND e.data::jsonb->>'playerId' NOT LIKE 'temp-%'
    )
    SELECT
      td.player_id,
      p.name as player_name,
      p.color as player_color,
      SUM(td.marks) as total_marks,
      td.match_id,
      m.created_at as match_date
    FROM turn_data td
    JOIN cricket_matches m ON m.id = td.match_id
    JOIN profiles p ON p.id = td.player_id
    GROUP BY td.player_id, td.match_id, td.leg_num, p.name, p.color, m.created_at
    ORDER BY total_marks DESC
    LIMIT ?
  `, [limit])

  return results.map((r, i) => ({
    rank: i + 1,
    playerId: r.player_id,
    playerName: r.player_name ?? 'Unbekannt',
    playerColor: r.player_color ?? undefined,
    value: r.total_marks,
    matchId: r.match_id,
    matchDate: r.match_date,
  }))
}

export async function getCricketHighscoreFewestDarts(limit: number = 5): Promise<HighscoreEntrySQL[]> {
  const results = await query<{
    player_id: string
    player_name: string
    player_color: string | null
    total_darts: number
    match_id: string
    match_date: string
  }>(`
    WITH leg_boundaries AS (
      SELECT
        e.match_id,
        e.id as event_id,
        e.data::jsonb->>'winnerPlayerId' as winner_id,
        ROW_NUMBER() OVER (PARTITION BY e.match_id ORDER BY e.id) as leg_num
      FROM cricket_events e
      WHERE e.type = 'CricketLegFinished'
    ),
    leg_darts AS (
      SELECT
        lb.winner_id as player_id,
        lb.match_id,
        lb.leg_num,
        (SELECT SUM((t.data::jsonb->>'dartCount')::integer)
         FROM cricket_events t
         WHERE t.match_id = lb.match_id
           AND t.type = 'CricketTurnAdded'
           AND t.data::jsonb->>'playerId' = lb.winner_id
           AND t.id < lb.event_id
           AND (lb.leg_num = 1 OR t.id > (
             SELECT e2.id FROM cricket_events e2
             WHERE e2.match_id = lb.match_id AND e2.type = 'CricketLegFinished'
             AND e2.id < lb.event_id
             ORDER BY e2.id DESC LIMIT 1
           ))
        ) as total_darts
      FROM leg_boundaries lb
      JOIN cricket_matches m ON m.id = lb.match_id AND m.finished = 1
      WHERE lb.winner_id NOT LIKE 'guest-%'
        AND lb.winner_id NOT LIKE 'temp-%'
    )
    SELECT
      ld.player_id,
      p.name as player_name,
      p.color as player_color,
      ld.total_darts,
      ld.match_id,
      m.created_at as match_date
    FROM leg_darts ld
    JOIN cricket_matches m ON m.id = ld.match_id
    JOIN profiles p ON p.id = ld.player_id
    WHERE ld.total_darts > 0
    ORDER BY ld.total_darts ASC
    LIMIT ?
  `, [limit])

  return results.map((r, i) => ({
    rank: i + 1,
    playerId: r.player_id,
    playerName: r.player_name ?? 'Unbekannt',
    playerColor: r.player_color ?? undefined,
    value: r.total_darts,
    matchId: r.match_id,
    matchDate: r.match_date,
  }))
}

export async function getCricketHighscoreBestScoringRound(limit: number = 5): Promise<HighscoreEntrySQL[]> {
  return getCricketHighscoreBestTurnMarks(limit)
}

export async function getCricketHighscoreMostBullsInLeg(limit: number = 5): Promise<HighscoreEntrySQL[]> {
  const results = await query<{
    player_id: string
    player_name: string
    player_color: string | null
    bulls: number
    match_id: string
    match_date: string
  }>(`
    WITH turn_data AS (
      SELECT
        e.data::jsonb->>'playerId' as player_id,
        e.match_id,
        COALESCE((e.data::jsonb->>'bullCount')::integer, 0) +
        COALESCE((e.data::jsonb->>'doubleBullCount')::integer, 0) as bulls,
        (SELECT COUNT(*) FROM cricket_events lf
         WHERE lf.match_id = e.match_id
           AND lf.type = 'CricketLegFinished'
           AND lf.id < e.id) as leg_num
      FROM cricket_events e
      JOIN cricket_matches m ON m.id = e.match_id AND m.finished = 1
      WHERE e.type = 'CricketTurnAdded'
        AND e.data::jsonb->>'playerId' NOT LIKE 'guest-%'
        AND e.data::jsonb->>'playerId' NOT LIKE 'temp-%'
    )
    SELECT
      td.player_id,
      p.name as player_name,
      p.color as player_color,
      SUM(td.bulls) as bulls,
      td.match_id,
      m.created_at as match_date
    FROM turn_data td
    JOIN cricket_matches m ON m.id = td.match_id
    JOIN profiles p ON p.id = td.player_id
    GROUP BY td.player_id, td.match_id, td.leg_num, p.name, p.color, m.created_at
    HAVING SUM(td.bulls) > 0
    ORDER BY bulls DESC
    LIMIT ?
  `, [limit])

  return results.map((r, i) => ({
    rank: i + 1,
    playerId: r.player_id,
    playerName: r.player_name ?? 'Unbekannt',
    playerColor: r.player_color ?? undefined,
    value: r.bulls,
    matchId: r.match_id,
    matchDate: r.match_date,
  }))
}

// ============================================================================
// Shanghai Highscores
// ============================================================================

export async function getHighscoreShanghaiMostWins(limit: number = 10): Promise<HighscoreEntrySQL[]> {
  const results = await query<{
    player_id: string
    player_name: string
    player_color: string | null
    total_wins: number
  }>(`
    SELECT
      m.winner_id as player_id,
      p.name as player_name,
      p.color as player_color,
      COUNT(*) as total_wins
    FROM shanghai_matches m
    JOIN profiles p ON p.id = m.winner_id
    WHERE m.finished = 1
      AND m.winner_id IS NOT NULL
      AND m.winner_id NOT LIKE 'guest-%'
      AND m.winner_id NOT LIKE 'temp-%'
    GROUP BY m.winner_id, p.name, p.color
    ORDER BY total_wins DESC
    LIMIT ?
  `, [limit])
  return results.map((r, i) => ({ rank: i + 1, playerId: r.player_id, playerName: r.player_name ?? 'Unbekannt', playerColor: r.player_color ?? undefined, value: r.total_wins }))
}

export async function getHighscoreShanghaiMostFinishs(limit: number = 10): Promise<HighscoreEntrySQL[]> {
  const results = await query<{
    player_id: string
    player_name: string
    player_color: string | null
    total_finishs: number
  }>(`
    SELECT
      e.data::jsonb->>'winnerId' as player_id,
      p.name as player_name,
      p.color as player_color,
      COUNT(*) as total_finishs
    FROM shanghai_events e
    JOIN shanghai_matches m ON m.id = e.match_id AND m.finished = 1
    JOIN profiles p ON p.id = e.data::jsonb->>'winnerId'
    WHERE e.type = 'ShanghaiLegFinished'
      AND (e.data::jsonb->>'shanghaiWin')::boolean = true
      AND e.data::jsonb->>'winnerId' NOT LIKE 'guest-%'
      AND e.data::jsonb->>'winnerId' NOT LIKE 'temp-%'
    GROUP BY e.data::jsonb->>'winnerId', p.name, p.color
    ORDER BY total_finishs DESC
    LIMIT ?
  `, [limit])
  return results.map((r, i) => ({ rank: i + 1, playerId: r.player_id, playerName: r.player_name ?? 'Unbekannt', playerColor: r.player_color ?? undefined, value: r.total_finishs }))
}

export async function getHighscoreShanghaiHighestLegScore(limit: number = 10): Promise<HighscoreEntrySQL[]> {
  const results = await query<{
    player_id: string
    player_name: string
    player_color: string | null
    match_id: string
    match_date: string
    score: number
  }>(`
    WITH leg_scores AS (
      SELECT
        e.match_id,
        m.created_at as match_date,
        kv.key as player_id,
        (kv.value)::integer as score
      FROM shanghai_events e
      JOIN shanghai_matches m ON m.id = e.match_id AND m.finished = 1
      CROSS JOIN LATERAL jsonb_each_text(e.data::jsonb->'finalScores') kv
      WHERE e.type = 'ShanghaiLegFinished'
    )
    SELECT
      ls.player_id,
      p.name as player_name,
      p.color as player_color,
      ls.match_id,
      ls.match_date,
      ls.score
    FROM leg_scores ls
    JOIN profiles p ON p.id = ls.player_id
    WHERE ls.score IS NOT NULL
      AND ls.player_id NOT LIKE 'guest-%'
      AND ls.player_id NOT LIKE 'temp-%'
    ORDER BY ls.score DESC
    LIMIT ?
  `, [limit])
  return results.map((r, i) => ({ rank: i + 1, playerId: r.player_id, playerName: r.player_name ?? 'Unbekannt', playerColor: r.player_color ?? undefined, value: r.score, matchId: r.match_id, matchDate: r.match_date }))
}

export async function getHighscoreShanghaiFewestDarts(limit: number = 10): Promise<HighscoreEntrySQL[]> {
  const results = await query<{
    player_id: string
    player_name: string
    player_color: string | null
    best_darts: number
  }>(`
    SELECT
      m.winner_id as player_id,
      p.name as player_name,
      p.color as player_color,
      MIN(m.winner_darts) as best_darts
    FROM shanghai_matches m
    JOIN profiles p ON p.id = m.winner_id
    WHERE m.finished = 1
      AND m.winner_darts IS NOT NULL
      AND m.winner_id IS NOT NULL
      AND m.winner_id NOT LIKE 'guest-%'
      AND m.winner_id NOT LIKE 'temp-%'
    GROUP BY m.winner_id, p.name, p.color
    ORDER BY best_darts ASC
    LIMIT ?
  `, [limit])
  return results.map((r, i) => ({ rank: i + 1, playerId: r.player_id, playerName: r.player_name ?? 'Unbekannt', playerColor: r.player_color ?? undefined, value: r.best_darts }))
}

export async function getHighscoreShanghaiHighestTurn(limit: number = 10): Promise<HighscoreEntrySQL[]> {
  const results = await query<{
    player_id: string
    player_name: string
    player_color: string | null
    match_id: string
    match_date: string
    score: number
  }>(`
    SELECT
      e.data::jsonb->>'playerId' as player_id,
      p.name as player_name,
      p.color as player_color,
      e.match_id,
      m.created_at as match_date,
      (e.data::jsonb->>'turnScore')::integer as score
    FROM shanghai_events e
    JOIN shanghai_matches m ON m.id = e.match_id AND m.finished = 1
    JOIN profiles p ON p.id = e.data::jsonb->>'playerId'
    WHERE e.type = 'ShanghaiTurnAdded'
      AND e.data::jsonb->>'turnScore' IS NOT NULL
      AND e.data::jsonb->>'playerId' NOT LIKE 'guest-%'
      AND e.data::jsonb->>'playerId' NOT LIKE 'temp-%'
    ORDER BY score DESC
    LIMIT ?
  `, [limit])
  return results.map((r, i) => ({ rank: i + 1, playerId: r.player_id, playerName: r.player_name ?? 'Unbekannt', playerColor: r.player_color ?? undefined, value: r.score, matchId: r.match_id, matchDate: r.match_date }))
}

export async function getHighscoreShanghaiPerfectTurns(limit: number = 10): Promise<HighscoreEntrySQL[]> {
  const results = await query<{
    player_id: string
    player_name: string
    player_color: string | null
    perfect_turns: number
  }>(`
    SELECT
      e.data::jsonb->>'playerId' as player_id,
      p.name as player_name,
      p.color as player_color,
      COUNT(*)::integer as perfect_turns
    FROM shanghai_events e
    JOIN shanghai_matches m ON m.id = e.match_id AND m.finished = 1
    JOIN profiles p ON p.id = e.data::jsonb->>'playerId'
    WHERE e.type = 'ShanghaiTurnAdded'
      AND jsonb_array_length(e.data::jsonb->'darts') = 3
      AND (e.data::jsonb->'darts'->0->>'target') = (e.data::jsonb->>'targetNumber')
      AND (e.data::jsonb->'darts'->1->>'target') = (e.data::jsonb->>'targetNumber')
      AND (e.data::jsonb->'darts'->2->>'target') = (e.data::jsonb->>'targetNumber')
      AND e.data::jsonb->>'playerId' NOT LIKE 'guest-%'
      AND e.data::jsonb->>'playerId' NOT LIKE 'temp-%'
    GROUP BY e.data::jsonb->>'playerId', p.name, p.color
    ORDER BY perfect_turns DESC
    LIMIT ?
  `, [limit])
  return results.map((r, i) => ({ rank: i + 1, playerId: r.player_id, playerName: r.player_name ?? 'Unbekannt', playerColor: r.player_color ?? undefined, value: r.perfect_turns }))
}

export async function getHighscoreShanghaiBiggestMargin(limit: number = 10): Promise<HighscoreEntrySQL[]> {
  const results = await query<{
    player_id: string
    player_name: string
    player_color: string | null
    match_id: string
    match_date: string
    margin: number
  }>(`
    WITH winners AS (
      SELECT
        m.id as match_id,
        m.created_at as match_date,
        m.winner_id,
        (m.final_scores::jsonb->>m.winner_id)::integer as winner_score,
        (SELECT MAX((kv.value)::integer) FROM jsonb_each_text(m.final_scores::jsonb) kv WHERE kv.key != m.winner_id) as runner_up
      FROM shanghai_matches m
      WHERE m.finished = 1
        AND m.winner_id IS NOT NULL
        AND m.final_scores IS NOT NULL
        AND m.winner_id NOT LIKE 'guest-%'
        AND m.winner_id NOT LIKE 'temp-%'
    )
    SELECT
      w.winner_id as player_id,
      p.name as player_name,
      p.color as player_color,
      w.match_id,
      w.match_date,
      (w.winner_score - COALESCE(w.runner_up, 0))::integer as margin
    FROM winners w
    JOIN profiles p ON p.id = w.winner_id
    WHERE w.runner_up IS NOT NULL
      AND w.winner_score IS NOT NULL
    ORDER BY margin DESC
    LIMIT ?
  `, [limit])
  return results.map((r, i) => ({ rank: i + 1, playerId: r.player_id, playerName: r.player_name ?? 'Unbekannt', playerColor: r.player_color ?? undefined, value: r.margin, matchId: r.match_id, matchDate: r.match_date }))
}

export async function getHighscoreShanghaiFocusedMatch(limit: number = 10): Promise<HighscoreEntrySQL[]> {
  const results = await query<{
    player_id: string
    player_name: string
    player_color: string | null
    focused_matches: number
  }>(`
    WITH turn_hits AS (
      SELECT
        e.match_id,
        e.data::jsonb->>'playerId' as player_id,
        CASE WHEN (
          SELECT COUNT(*) FROM jsonb_array_elements(e.data::jsonb->'darts') d
          WHERE d->>'target' = e.data::jsonb->>'targetNumber'
        ) > 0 THEN 1 ELSE 0 END as has_hit
      FROM shanghai_events e
      JOIN shanghai_matches m ON m.id = e.match_id AND m.finished = 1
      WHERE e.type = 'ShanghaiTurnAdded'
    ),
    match_summary AS (
      SELECT match_id, player_id, COUNT(*) as turns, SUM(has_hit) as hit_turns
      FROM turn_hits
      GROUP BY match_id, player_id
    )
    SELECT
      ms.player_id,
      p.name as player_name,
      p.color as player_color,
      COUNT(*)::integer as focused_matches
    FROM match_summary ms
    JOIN profiles p ON p.id = ms.player_id
    WHERE ms.turns >= 5
      AND ms.turns = ms.hit_turns
      AND ms.player_id NOT LIKE 'guest-%'
      AND ms.player_id NOT LIKE 'temp-%'
    GROUP BY ms.player_id, p.name, p.color
    ORDER BY focused_matches DESC
    LIMIT ?
  `, [limit])
  return results.map((r, i) => ({ rank: i + 1, playerId: r.player_id, playerName: r.player_name ?? 'Unbekannt', playerColor: r.player_color ?? undefined, value: r.focused_matches }))
}

export async function getHighscoreShanghaiTripleMaster(limit: number = 10): Promise<HighscoreEntrySQL[]> {
  const results = await query<{
    player_id: string
    player_name: string
    player_color: string | null
    triple_rate: number
  }>(`
    SELECT
      e.data::jsonb->>'playerId' as player_id,
      p.name as player_name,
      p.color as player_color,
      SUM((
        SELECT COUNT(*) FROM jsonb_array_elements(e.data::jsonb->'darts') d
        WHERE d->>'target' = e.data::jsonb->>'targetNumber'
          AND (d->>'mult')::integer = 3
      ))::real
      / NULLIF(SUM(jsonb_array_length(e.data::jsonb->'darts'))::real, 0) * 100 as triple_rate
    FROM shanghai_events e
    JOIN shanghai_matches m ON m.id = e.match_id AND m.finished = 1
    JOIN profiles p ON p.id = e.data::jsonb->>'playerId'
    WHERE e.type = 'ShanghaiTurnAdded'
      AND e.data::jsonb->>'playerId' NOT LIKE 'guest-%'
      AND e.data::jsonb->>'playerId' NOT LIKE 'temp-%'
    GROUP BY e.data::jsonb->>'playerId', p.name, p.color
    HAVING SUM(jsonb_array_length(e.data::jsonb->'darts')) >= 30
    ORDER BY triple_rate DESC
    LIMIT ?
  `, [limit])
  return results.map((r, i) => ({ rank: i + 1, playerId: r.player_id, playerName: r.player_name ?? 'Unbekannt', playerColor: r.player_color ?? undefined, value: Math.round(r.triple_rate * 10) / 10 }))
}

// ============================================================================
// CTF Highscores
// ============================================================================

export async function getHighscoreCTFMostWins(limit: number = 10): Promise<HighscoreEntrySQL[]> {
  const results = await query<{
    player_id: string
    player_name: string
    player_color: string | null
    total_wins: number
  }>(`
    SELECT
      m.winner_id as player_id,
      p.name as player_name,
      p.color as player_color,
      COUNT(*) as total_wins
    FROM ctf_matches m
    JOIN profiles p ON p.id = m.winner_id
    WHERE m.finished = 1
      AND m.winner_id IS NOT NULL
      AND m.winner_id NOT LIKE 'guest-%'
      AND m.winner_id NOT LIKE 'temp-%'
    GROUP BY m.winner_id, p.name, p.color
    ORDER BY total_wins DESC
    LIMIT ?
  `, [limit])
  return results.map((r, i) => ({ rank: i + 1, playerId: r.player_id, playerName: r.player_name ?? 'Unbekannt', playerColor: r.player_color ?? undefined, value: r.total_wins }))
}

export async function getHighscoreCTFHighestMatchScore(limit: number = 10): Promise<HighscoreEntrySQL[]> {
  const results = await query<{
    player_id: string
    player_name: string
    player_color: string | null
    match_id: string
    match_date: string
    score: number
  }>(`
    SELECT
      mp.player_id,
      p.name as player_name,
      p.color as player_color,
      m.id as match_id,
      m.created_at as match_date,
      (m.capture_total_scores::jsonb->>mp.player_id)::integer as score
    FROM ctf_matches m
    JOIN ctf_match_players mp ON mp.match_id = m.id
    JOIN profiles p ON p.id = mp.player_id
    WHERE m.finished = 1
      AND m.capture_total_scores IS NOT NULL
      AND (m.capture_total_scores::jsonb->>mp.player_id) IS NOT NULL
      AND mp.player_id NOT LIKE 'guest-%'
      AND mp.player_id NOT LIKE 'temp-%'
    ORDER BY score DESC
    LIMIT ?
  `, [limit])
  return results.map((r, i) => ({ rank: i + 1, playerId: r.player_id, playerName: r.player_name ?? 'Unbekannt', playerColor: r.player_color ?? undefined, value: r.score, matchId: r.match_id, matchDate: r.match_date }))
}

export async function getHighscoreCTFMostFields(limit: number = 10): Promise<HighscoreEntrySQL[]> {
  const results = await query<{
    player_id: string
    player_name: string
    player_color: string | null
    match_id: string
    match_date: string
    field_count: number
  }>(`
    SELECT
      mp.player_id,
      p.name as player_name,
      p.color as player_color,
      m.id as match_id,
      m.created_at as match_date,
      (SELECT COUNT(*) FROM jsonb_each_text(m.capture_field_winners::jsonb) cw WHERE cw.value = mp.player_id)::integer as field_count
    FROM ctf_matches m
    JOIN ctf_match_players mp ON mp.match_id = m.id
    JOIN profiles p ON p.id = mp.player_id
    WHERE m.finished = 1
      AND m.capture_field_winners IS NOT NULL
      AND mp.player_id NOT LIKE 'guest-%'
      AND mp.player_id NOT LIKE 'temp-%'
    ORDER BY field_count DESC
    LIMIT ?
  `, [limit])
  return results
    .filter(r => r.field_count > 0)
    .map((r, i) => ({ rank: i + 1, playerId: r.player_id, playerName: r.player_name ?? 'Unbekannt', playerColor: r.player_color ?? undefined, value: r.field_count, matchId: r.match_id, matchDate: r.match_date }))
}

export async function getHighscoreCTFLongestStreak(limit: number = 10): Promise<HighscoreEntrySQL[]> {
  const results = await query<{
    player_id: string
    player_name: string
    player_color: string | null
    match_id: string
    match_date: string
    streak: number
  }>(`
    WITH round_events AS (
      SELECT
        e.match_id,
        e.data::jsonb->>'winnerId' as winner_id,
        e.seq,
        ROW_NUMBER() OVER (PARTITION BY e.match_id ORDER BY e.seq) as round_rn
      FROM ctf_events e
      JOIN ctf_matches m ON m.id = e.match_id AND m.finished = 1
      WHERE e.type = 'CTFRoundFinished'
        AND e.data::jsonb->>'winnerId' IS NOT NULL
    ),
    player_wins AS (
      SELECT
        match_id,
        winner_id,
        round_rn,
        ROW_NUMBER() OVER (PARTITION BY match_id, winner_id ORDER BY round_rn) as win_rn
      FROM round_events
    ),
    streaks AS (
      SELECT
        winner_id as player_id,
        match_id,
        COUNT(*) as streak_len
      FROM player_wins
      GROUP BY match_id, winner_id, (round_rn - win_rn)
    )
    SELECT
      s.player_id,
      p.name as player_name,
      p.color as player_color,
      s.match_id,
      m.created_at as match_date,
      s.streak_len as streak
    FROM streaks s
    JOIN profiles p ON p.id = s.player_id
    JOIN ctf_matches m ON m.id = s.match_id
    WHERE s.player_id NOT LIKE 'guest-%'
      AND s.player_id NOT LIKE 'temp-%'
      AND s.streak_len >= 2
    ORDER BY s.streak_len DESC
    LIMIT ?
  `, [limit])
  return results.map((r, i) => ({ rank: i + 1, playerId: r.player_id, playerName: r.player_name ?? 'Unbekannt', playerColor: r.player_color ?? undefined, value: r.streak, matchId: r.match_id, matchDate: r.match_date }))
}

export async function getHighscoreCTFBestTurn(limit: number = 10): Promise<HighscoreEntrySQL[]> {
  const results = await query<{
    player_id: string
    player_name: string
    player_color: string | null
    match_id: string
    match_date: string
    turn_score: number
  }>(`
    SELECT
      e.data::jsonb->>'playerId' as player_id,
      p.name as player_name,
      p.color as player_color,
      e.match_id,
      m.created_at as match_date,
      (e.data::jsonb->>'captureScore')::integer as turn_score
    FROM ctf_events e
    JOIN ctf_matches m ON m.id = e.match_id AND m.finished = 1
    JOIN profiles p ON p.id = e.data::jsonb->>'playerId'
    WHERE e.type = 'CTFTurnAdded'
      AND e.data::jsonb->>'captureScore' IS NOT NULL
      AND e.data::jsonb->>'playerId' NOT LIKE 'guest-%'
      AND e.data::jsonb->>'playerId' NOT LIKE 'temp-%'
    ORDER BY turn_score DESC
    LIMIT ?
  `, [limit])
  return results.map((r, i) => ({ rank: i + 1, playerId: r.player_id, playerName: r.player_name ?? 'Unbekannt', playerColor: r.player_color ?? undefined, value: r.turn_score, matchId: r.match_id, matchDate: r.match_date }))
}

export async function getHighscoreCTFPerfectMatch(limit: number = 10): Promise<HighscoreEntrySQL[]> {
  const results = await query<{
    player_id: string
    player_name: string
    player_color: string | null
    perfect_matches: number
  }>(`
    SELECT
      mp.player_id,
      p.name as player_name,
      p.color as player_color,
      COUNT(DISTINCT m.id)::integer as perfect_matches
    FROM ctf_matches m
    JOIN ctf_match_players mp ON mp.match_id = m.id
    JOIN profiles p ON p.id = mp.player_id
    WHERE m.finished = 1
      AND m.capture_field_winners IS NOT NULL
      AND mp.player_id NOT LIKE 'guest-%'
      AND mp.player_id NOT LIKE 'temp-%'
      AND (SELECT COUNT(*) FROM jsonb_each_text(m.capture_field_winners::jsonb)) > 0
      AND (
        SELECT COUNT(*) FROM jsonb_each_text(m.capture_field_winners::jsonb) cw
        WHERE cw.value = mp.player_id
      ) = (
        SELECT COUNT(*) FROM jsonb_each_text(m.capture_field_winners::jsonb)
      )
    GROUP BY mp.player_id, p.name, p.color
    ORDER BY perfect_matches DESC
    LIMIT ?
  `, [limit])
  return results.map((r, i) => ({ rank: i + 1, playerId: r.player_id, playerName: r.player_name ?? 'Unbekannt', playerColor: r.player_color ?? undefined, value: r.perfect_matches }))
}

export async function getHighscoreCTFBullSniper(limit: number = 10): Promise<HighscoreEntrySQL[]> {
  const results = await query<{
    player_id: string
    player_name: string
    player_color: string | null
    bull_hits: number
  }>(`
    WITH bulls_per_turn AS (
      SELECT
        e.data::jsonb->>'playerId' as player_id,
        (SELECT COUNT(*) FROM jsonb_array_elements(e.data::jsonb->'darts') d WHERE d->>'target' = 'BULL')::integer as bulls
      FROM ctf_events e
      JOIN ctf_matches m ON m.id = e.match_id AND m.finished = 1
      WHERE e.type = 'CTFTurnAdded'
    )
    SELECT
      bpt.player_id,
      p.name as player_name,
      p.color as player_color,
      SUM(bpt.bulls)::integer as bull_hits
    FROM bulls_per_turn bpt
    JOIN profiles p ON p.id = bpt.player_id
    WHERE bpt.player_id NOT LIKE 'guest-%'
      AND bpt.player_id NOT LIKE 'temp-%'
    GROUP BY bpt.player_id, p.name, p.color
    HAVING SUM(bpt.bulls) > 0
    ORDER BY bull_hits DESC
    LIMIT ?
  `, [limit])
  return results.map((r, i) => ({ rank: i + 1, playerId: r.player_id, playerName: r.player_name ?? 'Unbekannt', playerColor: r.player_color ?? undefined, value: r.bull_hits }))
}

export async function getHighscoreCTFFocusedMatch(limit: number = 10): Promise<HighscoreEntrySQL[]> {
  const results = await query<{
    player_id: string
    player_name: string
    player_color: string | null
    focused_matches: number
  }>(`
    WITH turn_hits AS (
      SELECT
        e.match_id,
        e.data::jsonb->>'playerId' as player_id,
        CASE WHEN (
          SELECT COUNT(*) FROM jsonb_array_elements(e.data::jsonb->'darts') d
          WHERE d->>'target' != 'MISS'
        ) > 0 THEN 1 ELSE 0 END as has_hit
      FROM ctf_events e
      JOIN ctf_matches m ON m.id = e.match_id AND m.finished = 1
      WHERE e.type = 'CTFTurnAdded'
    ),
    match_summary AS (
      SELECT match_id, player_id, COUNT(*) as turns, SUM(has_hit) as hit_turns
      FROM turn_hits
      GROUP BY match_id, player_id
    )
    SELECT
      ms.player_id,
      p.name as player_name,
      p.color as player_color,
      COUNT(*)::integer as focused_matches
    FROM match_summary ms
    JOIN profiles p ON p.id = ms.player_id
    WHERE ms.turns >= 5
      AND ms.turns = ms.hit_turns
      AND ms.player_id NOT LIKE 'guest-%'
      AND ms.player_id NOT LIKE 'temp-%'
    GROUP BY ms.player_id, p.name, p.color
    ORDER BY focused_matches DESC
    LIMIT ?
  `, [limit])
  return results.map((r, i) => ({ rank: i + 1, playerId: r.player_id, playerName: r.player_name ?? 'Unbekannt', playerColor: r.player_color ?? undefined, value: r.focused_matches }))
}

export async function getHighscoreCTFTripleThrees(limit: number = 10): Promise<HighscoreEntrySQL[]> {
  const results = await query<{
    player_id: string
    player_name: string
    player_color: string | null
    triple_turns: number
  }>(`
    SELECT
      e.data::jsonb->>'playerId' as player_id,
      p.name as player_name,
      p.color as player_color,
      COUNT(*)::integer as triple_turns
    FROM ctf_events e
    JOIN ctf_matches m ON m.id = e.match_id AND m.finished = 1
    JOIN profiles p ON p.id = e.data::jsonb->>'playerId'
    WHERE e.type = 'CTFTurnAdded'
      AND jsonb_array_length(e.data::jsonb->'darts') = 3
      AND (
        SELECT COUNT(*) FROM jsonb_array_elements(e.data::jsonb->'darts') d
        WHERE d->>'target' != 'MISS'
      ) = 3
      AND e.data::jsonb->>'playerId' NOT LIKE 'guest-%'
      AND e.data::jsonb->>'playerId' NOT LIKE 'temp-%'
    GROUP BY e.data::jsonb->>'playerId', p.name, p.color
    ORDER BY triple_turns DESC
    LIMIT ?
  `, [limit])
  return results.map((r, i) => ({ rank: i + 1, playerId: r.player_id, playerName: r.player_name ?? 'Unbekannt', playerColor: r.player_color ?? undefined, value: r.triple_turns }))
}

export async function getHighscoreCTFCleanSheet(limit: number = 10): Promise<HighscoreEntrySQL[]> {
  const results = await query<{
    player_id: string
    player_name: string
    player_color: string | null
    clean_matches: number
  }>(`
    WITH round_points AS (
      SELECT
        e.match_id,
        kv.key as player_id,
        (kv.value)::integer as points
      FROM ctf_events e
      JOIN ctf_matches m ON m.id = e.match_id AND m.finished = 1
      CROSS JOIN LATERAL jsonb_each_text(e.data::jsonb->'fieldPoints') kv
      WHERE e.type = 'CTFRoundFinished'
    ),
    match_player_stats AS (
      SELECT
        match_id,
        player_id,
        COUNT(*) as rounds,
        SUM(CASE WHEN points = 0 THEN 1 ELSE 0 END) as zero_rounds
      FROM round_points
      GROUP BY match_id, player_id
    )
    SELECT
      mps.player_id,
      p.name as player_name,
      p.color as player_color,
      COUNT(*)::integer as clean_matches
    FROM match_player_stats mps
    JOIN profiles p ON p.id = mps.player_id
    WHERE mps.zero_rounds = 0
      AND mps.rounds >= 3
      AND mps.player_id NOT LIKE 'guest-%'
      AND mps.player_id NOT LIKE 'temp-%'
    GROUP BY mps.player_id, p.name, p.color
    ORDER BY clean_matches DESC
    LIMIT ?
  `, [limit])
  return results.map((r, i) => ({ rank: i + 1, playerId: r.player_id, playerName: r.player_name ?? 'Unbekannt', playerColor: r.player_color ?? undefined, value: r.clean_matches }))
}

// ============================================================================
// Sträußchen Highscores
// ============================================================================

export async function getHighscoreStrMostWins(limit: number = 10): Promise<HighscoreEntrySQL[]> {
  const results = await query<{
    player_id: string
    player_name: string
    player_color: string | null
    total_wins: number
  }>(`
    SELECT
      m.winner_id as player_id,
      p.name as player_name,
      p.color as player_color,
      COUNT(*) as total_wins
    FROM str_matches m
    JOIN profiles p ON p.id = m.winner_id
    WHERE m.finished = 1
      AND m.winner_id IS NOT NULL
      AND m.winner_id NOT LIKE 'guest-%'
      AND m.winner_id NOT LIKE 'temp-%'
    GROUP BY m.winner_id, p.name, p.color
    ORDER BY total_wins DESC
    LIMIT ?
  `, [limit])
  return results.map((r, i) => ({ rank: i + 1, playerId: r.player_id, playerName: r.player_name ?? 'Unbekannt', playerColor: r.player_color ?? undefined, value: r.total_wins }))
}

export async function getHighscoreStrFastestTime(limit: number = 10): Promise<HighscoreEntrySQL[]> {
  const results = await query<{
    player_id: string
    player_name: string
    player_color: string | null
    best_time: number
  }>(`
    SELECT
      m.winner_id as player_id,
      p.name as player_name,
      p.color as player_color,
      MIN(m.duration_ms) as best_time
    FROM str_matches m
    JOIN profiles p ON p.id = m.winner_id
    WHERE m.finished = 1
      AND m.duration_ms IS NOT NULL
      AND m.winner_id IS NOT NULL
      AND m.winner_id NOT LIKE 'guest-%'
      AND m.winner_id NOT LIKE 'temp-%'
    GROUP BY m.winner_id, p.name, p.color
    ORDER BY best_time ASC
    LIMIT ?
  `, [limit])
  return results.map((r, i) => ({ rank: i + 1, playerId: r.player_id, playerName: r.player_name ?? 'Unbekannt', playerColor: r.player_color ?? undefined, value: r.best_time }))
}

export async function getHighscoreStrFewestDarts(limit: number = 10): Promise<HighscoreEntrySQL[]> {
  const results = await query<{
    player_id: string
    player_name: string
    player_color: string | null
    best_darts: number
  }>(`
    SELECT
      m.winner_id as player_id,
      p.name as player_name,
      p.color as player_color,
      MIN(m.winner_darts) as best_darts
    FROM str_matches m
    JOIN profiles p ON p.id = m.winner_id
    WHERE m.finished = 1
      AND m.winner_darts IS NOT NULL
      AND m.winner_id IS NOT NULL
      AND m.winner_id NOT LIKE 'guest-%'
      AND m.winner_id NOT LIKE 'temp-%'
    GROUP BY m.winner_id, p.name, p.color
    ORDER BY best_darts ASC
    LIMIT ?
  `, [limit])
  return results.map((r, i) => ({ rank: i + 1, playerId: r.player_id, playerName: r.player_name ?? 'Unbekannt', playerColor: r.player_color ?? undefined, value: r.best_darts }))
}

export async function getHighscoreStrHitStreak(limit: number = 10): Promise<HighscoreEntrySQL[]> {
  const results = await query<{
    player_id: string
    player_name: string
    player_color: string | null
    match_id: string
    match_date: string
    streak: number
  }>(`
    WITH all_darts AS (
      SELECT
        e.match_id,
        e.data::jsonb->>'playerId' as player_id,
        e.seq as turn_seq,
        d.ord as dart_ord,
        d.val::text as dart_status
      FROM str_events e
      JOIN str_matches m ON m.id = e.match_id AND m.finished = 1
      CROSS JOIN LATERAL jsonb_array_elements_text(e.data::jsonb->'darts') WITH ORDINALITY d(val, ord)
      WHERE e.type = 'StrTurnAdded'
    ),
    dart_rn AS (
      SELECT
        match_id, player_id, dart_status,
        ROW_NUMBER() OVER (PARTITION BY match_id, player_id ORDER BY turn_seq, dart_ord) as full_rn,
        ROW_NUMBER() OVER (PARTITION BY match_id, player_id, dart_status ORDER BY turn_seq, dart_ord) as status_rn
      FROM all_darts
    ),
    hit_streaks AS (
      SELECT match_id, player_id, COUNT(*)::integer as streak_len
      FROM dart_rn
      WHERE dart_status = 'hit'
      GROUP BY match_id, player_id, (full_rn - status_rn)
    )
    SELECT
      hs.player_id,
      p.name as player_name,
      p.color as player_color,
      hs.match_id,
      m.created_at as match_date,
      hs.streak_len as streak
    FROM hit_streaks hs
    JOIN str_matches m ON m.id = hs.match_id
    JOIN profiles p ON p.id = hs.player_id
    WHERE hs.player_id NOT LIKE 'guest-%'
      AND hs.player_id NOT LIKE 'temp-%'
      AND hs.streak_len >= 3
    ORDER BY hs.streak_len DESC
    LIMIT ?
  `, [limit])
  return results.map((r, i) => ({ rank: i + 1, playerId: r.player_id, playerName: r.player_name ?? 'Unbekannt', playerColor: r.player_color ?? undefined, value: r.streak, matchId: r.match_id, matchDate: r.match_date }))
}

export async function getHighscoreStrBestHitRate(limit: number = 10): Promise<HighscoreEntrySQL[]> {
  const results = await query<{
    player_id: string
    player_name: string
    player_color: string | null
    hit_rate: number
  }>(`
    SELECT
      e.data::jsonb->>'playerId' as player_id,
      p.name as player_name,
      p.color as player_color,
      SUM((e.data::jsonb->>'hits')::integer)::real / NULLIF(SUM(jsonb_array_length(e.data::jsonb->'darts'))::real, 0) * 100 as hit_rate
    FROM str_events e
    JOIN str_matches m ON m.id = e.match_id AND m.finished = 1
    JOIN profiles p ON p.id = e.data::jsonb->>'playerId'
    WHERE e.type = 'StrTurnAdded'
      AND e.data::jsonb->>'playerId' NOT LIKE 'guest-%'
      AND e.data::jsonb->>'playerId' NOT LIKE 'temp-%'
    GROUP BY e.data::jsonb->>'playerId', p.name, p.color
    HAVING COUNT(*) >= 10 AND SUM(jsonb_array_length(e.data::jsonb->'darts')) > 0
    ORDER BY hit_rate DESC
    LIMIT ?
  `, [limit])
  return results.map((r, i) => ({ rank: i + 1, playerId: r.player_id, playerName: r.player_name ?? 'Unbekannt', playerColor: r.player_color ?? undefined, value: Math.round(r.hit_rate * 10) / 10 }))
}

// ============================================================================
// Killer Highscores
// ============================================================================

export async function getHighscoreKillerMostWins(limit: number = 10): Promise<HighscoreEntrySQL[]> {
  const results = await query<{
    player_id: string
    player_name: string
    player_color: string | null
    total_wins: number
  }>(`
    SELECT
      m.winner_id as player_id,
      p.name as player_name,
      p.color as player_color,
      COUNT(*) as total_wins
    FROM killer_matches m
    JOIN profiles p ON p.id = m.winner_id
    WHERE m.finished = 1
      AND m.winner_id IS NOT NULL
      AND m.winner_id NOT LIKE 'guest-%'
      AND m.winner_id NOT LIKE 'temp-%'
    GROUP BY m.winner_id, p.name, p.color
    ORDER BY total_wins DESC
    LIMIT ?
  `, [limit])
  return results.map((r, i) => ({ rank: i + 1, playerId: r.player_id, playerName: r.player_name ?? 'Unbekannt', playerColor: r.player_color ?? undefined, value: r.total_wins }))
}

export async function getHighscoreKillerEliminationsMatch(limit: number = 10): Promise<HighscoreEntrySQL[]> {
  const results = await query<{
    player_id: string
    player_name: string
    player_color: string | null
    match_id: string
    match_date: string
    total_kills: number
  }>(`
    WITH elim_turns AS (
      SELECT
        e.match_id,
        m.created_at as match_date,
        e.data::jsonb->>'playerId' as player_id,
        jsonb_array_length(e.data::jsonb->'eliminations') as kills
      FROM killer_events e
      JOIN killer_matches m ON m.id = e.match_id AND m.finished = 1
      WHERE e.type = 'KillerTurnAdded'
        AND e.data::jsonb->'eliminations' IS NOT NULL
        AND jsonb_typeof(e.data::jsonb->'eliminations') = 'array'
    )
    SELECT
      et.player_id,
      p.name as player_name,
      p.color as player_color,
      et.match_id,
      et.match_date,
      SUM(et.kills)::integer as total_kills
    FROM elim_turns et
    JOIN profiles p ON p.id = et.player_id
    WHERE et.player_id NOT LIKE 'guest-%'
      AND et.player_id NOT LIKE 'temp-%'
    GROUP BY et.player_id, p.name, p.color, et.match_id, et.match_date
    HAVING SUM(et.kills) > 0
    ORDER BY total_kills DESC
    LIMIT ?
  `, [limit])
  return results.map((r, i) => ({ rank: i + 1, playerId: r.player_id, playerName: r.player_name ?? 'Unbekannt', playerColor: r.player_color ?? undefined, value: r.total_kills, matchId: r.match_id, matchDate: r.match_date }))
}

export async function getHighscoreKillerEliminationsCareer(limit: number = 10): Promise<HighscoreEntrySQL[]> {
  const results = await query<{
    player_id: string
    player_name: string
    player_color: string | null
    total_kills: number
  }>(`
    SELECT
      e.data::jsonb->>'playerId' as player_id,
      p.name as player_name,
      p.color as player_color,
      SUM(jsonb_array_length(e.data::jsonb->'eliminations'))::integer as total_kills
    FROM killer_events e
    JOIN killer_matches m ON m.id = e.match_id AND m.finished = 1
    JOIN profiles p ON p.id = e.data::jsonb->>'playerId'
    WHERE e.type = 'KillerTurnAdded'
      AND e.data::jsonb->'eliminations' IS NOT NULL
      AND jsonb_typeof(e.data::jsonb->'eliminations') = 'array'
      AND e.data::jsonb->>'playerId' NOT LIKE 'guest-%'
      AND e.data::jsonb->>'playerId' NOT LIKE 'temp-%'
    GROUP BY e.data::jsonb->>'playerId', p.name, p.color
    HAVING SUM(jsonb_array_length(e.data::jsonb->'eliminations')) > 0
    ORDER BY total_kills DESC
    LIMIT ?
  `, [limit])
  return results.map((r, i) => ({ rank: i + 1, playerId: r.player_id, playerName: r.player_name ?? 'Unbekannt', playerColor: r.player_color ?? undefined, value: r.total_kills }))
}

export async function getHighscoreKillerMultiKill(limit: number = 10): Promise<HighscoreEntrySQL[]> {
  const results = await query<{
    player_id: string
    player_name: string
    player_color: string | null
    match_id: string
    match_date: string
    kills: number
  }>(`
    SELECT
      e.data::jsonb->>'playerId' as player_id,
      p.name as player_name,
      p.color as player_color,
      e.match_id,
      m.created_at as match_date,
      jsonb_array_length(e.data::jsonb->'eliminations')::integer as kills
    FROM killer_events e
    JOIN killer_matches m ON m.id = e.match_id AND m.finished = 1
    JOIN profiles p ON p.id = e.data::jsonb->>'playerId'
    WHERE e.type = 'KillerTurnAdded'
      AND e.data::jsonb->'eliminations' IS NOT NULL
      AND jsonb_typeof(e.data::jsonb->'eliminations') = 'array'
      AND jsonb_array_length(e.data::jsonb->'eliminations') >= 2
      AND e.data::jsonb->>'playerId' NOT LIKE 'guest-%'
      AND e.data::jsonb->>'playerId' NOT LIKE 'temp-%'
    ORDER BY kills DESC
    LIMIT ?
  `, [limit])
  return results.map((r, i) => ({ rank: i + 1, playerId: r.player_id, playerName: r.player_name ?? 'Unbekannt', playerColor: r.player_color ?? undefined, value: r.kills, matchId: r.match_id, matchDate: r.match_date }))
}

export async function getHighscoreKillerFlawlessWins(limit: number = 10): Promise<HighscoreEntrySQL[]> {
  const results = await query<{
    player_id: string
    player_name: string
    player_color: string | null
    flawless_wins: number
  }>(`
    SELECT
      m.winner_id as player_id,
      p.name as player_name,
      p.color as player_color,
      COUNT(*)::integer as flawless_wins
    FROM killer_matches m
    JOIN profiles p ON p.id = m.winner_id
    WHERE m.finished = 1
      AND m.winner_id IS NOT NULL
      AND m.final_standings IS NOT NULL
      AND m.starting_lives IS NOT NULL
      AND m.winner_id NOT LIKE 'guest-%'
      AND m.winner_id NOT LIKE 'temp-%'
      AND (
        SELECT (fs->>'lives')::integer
        FROM jsonb_array_elements(m.final_standings::jsonb) fs
        WHERE fs->>'playerId' = m.winner_id
        LIMIT 1
      ) = m.starting_lives
    GROUP BY m.winner_id, p.name, p.color
    ORDER BY flawless_wins DESC
    LIMIT ?
  `, [limit])
  return results.map((r, i) => ({ rank: i + 1, playerId: r.player_id, playerName: r.player_name ?? 'Unbekannt', playerColor: r.player_color ?? undefined, value: r.flawless_wins }))
}

// ============================================================================
// Highscore-Modus Highscores
// ============================================================================

export async function getHighscoreModeMostWins(limit: number = 10): Promise<HighscoreEntrySQL[]> {
  const results = await query<{
    player_id: string
    player_name: string
    player_color: string | null
    total_wins: number
  }>(`
    SELECT
      m.winner_id as player_id,
      p.name as player_name,
      p.color as player_color,
      COUNT(*) as total_wins
    FROM highscore_matches m
    JOIN profiles p ON p.id = m.winner_id
    WHERE m.finished = 1
      AND m.winner_id IS NOT NULL
      AND m.winner_id NOT LIKE 'guest-%'
      AND m.winner_id NOT LIKE 'temp-%'
    GROUP BY m.winner_id, p.name, p.color
    ORDER BY total_wins DESC
    LIMIT ?
  `, [limit])
  return results.map((r, i) => ({ rank: i + 1, playerId: r.player_id, playerName: r.player_name ?? 'Unbekannt', playerColor: r.player_color ?? undefined, value: r.total_wins }))
}

export async function getHighscoreModeHighestLegScore(limit: number = 10): Promise<HighscoreEntrySQL[]> {
  const results = await query<{
    player_id: string
    player_name: string
    player_color: string | null
    match_id: string
    match_date: string
    score: number
  }>(`
    WITH leg_finals AS (
      SELECT
        e.match_id,
        m.created_at as match_date,
        ranking->>'playerId' as player_id,
        (ranking->>'finalScore')::integer as score
      FROM highscore_events e
      JOIN highscore_matches m ON m.id = e.match_id AND m.finished = 1
      CROSS JOIN LATERAL jsonb_array_elements(e.data::jsonb->'rankings') ranking
      WHERE e.type = 'HighscoreLegFinished'
    )
    SELECT
      lf.player_id,
      p.name as player_name,
      p.color as player_color,
      lf.match_id,
      lf.match_date,
      lf.score
    FROM leg_finals lf
    JOIN profiles p ON p.id = lf.player_id
    WHERE lf.score IS NOT NULL
      AND lf.player_id NOT LIKE 'guest-%'
      AND lf.player_id NOT LIKE 'temp-%'
    ORDER BY lf.score DESC
    LIMIT ?
  `, [limit])
  return results.map((r, i) => ({ rank: i + 1, playerId: r.player_id, playerName: r.player_name ?? 'Unbekannt', playerColor: r.player_color ?? undefined, value: r.score, matchId: r.match_id, matchDate: r.match_date }))
}

export async function getHighscoreModeMost180s(limit: number = 10): Promise<HighscoreEntrySQL[]> {
  const results = await query<{
    player_id: string
    player_name: string
    player_color: string | null
    match_id: string
    match_date: string
    count_180s: number
  }>(`
    WITH match_180s AS (
      SELECT
        e.data::jsonb->>'playerId' as player_id,
        e.match_id,
        m.created_at as match_date,
        COUNT(*) as count_180s
      FROM highscore_events e
      JOIN highscore_matches m ON m.id = e.match_id AND m.finished = 1
      WHERE e.type = 'HighscoreTurnAdded'
        AND (e.data::jsonb->>'turnScore')::integer = 180
      GROUP BY e.data::jsonb->>'playerId', e.match_id, m.created_at
    )
    SELECT
      m180.player_id,
      p.name as player_name,
      p.color as player_color,
      m180.match_id,
      m180.match_date,
      m180.count_180s
    FROM match_180s m180
    JOIN profiles p ON p.id = m180.player_id
    WHERE m180.player_id NOT LIKE 'guest-%'
      AND m180.player_id NOT LIKE 'temp-%'
    ORDER BY m180.count_180s DESC
    LIMIT ?
  `, [limit])
  return results.map((r, i) => ({ rank: i + 1, playerId: r.player_id, playerName: r.player_name ?? 'Unbekannt', playerColor: r.player_color ?? undefined, value: r.count_180s, matchId: r.match_id, matchDate: r.match_date }))
}

export async function getHighscoreModeFastestLeg(limit: number = 10): Promise<HighscoreEntrySQL[]> {
  const results = await query<{
    player_id: string
    player_name: string
    player_color: string | null
    match_id: string
    match_date: string
    darts: number
  }>(`
    SELECT
      e.data::jsonb->>'winnerId' as player_id,
      p.name as player_name,
      p.color as player_color,
      e.match_id,
      m.created_at as match_date,
      (e.data::jsonb->>'winnerDarts')::integer as darts
    FROM highscore_events e
    JOIN highscore_matches m ON m.id = e.match_id AND m.finished = 1
    JOIN profiles p ON p.id = e.data::jsonb->>'winnerId'
    WHERE e.type = 'HighscoreLegFinished'
      AND e.data::jsonb->>'winnerDarts' IS NOT NULL
      AND e.data::jsonb->>'winnerId' NOT LIKE 'guest-%'
      AND e.data::jsonb->>'winnerId' NOT LIKE 'temp-%'
    ORDER BY darts ASC
    LIMIT ?
  `, [limit])
  return results.map((r, i) => ({ rank: i + 1, playerId: r.player_id, playerName: r.player_name ?? 'Unbekannt', playerColor: r.player_color ?? undefined, value: r.darts, matchId: r.match_id, matchDate: r.match_date }))
}

export async function getHighscoreModeCareer180s(limit: number = 10): Promise<HighscoreEntrySQL[]> {
  const results = await query<{
    player_id: string
    player_name: string
    player_color: string | null
    total_180s: number
  }>(`
    SELECT
      e.data::jsonb->>'playerId' as player_id,
      p.name as player_name,
      p.color as player_color,
      COUNT(*)::integer as total_180s
    FROM highscore_events e
    JOIN highscore_matches m ON m.id = e.match_id AND m.finished = 1
    JOIN profiles p ON p.id = e.data::jsonb->>'playerId'
    WHERE e.type = 'HighscoreTurnAdded'
      AND (e.data::jsonb->>'turnScore')::integer = 180
      AND e.data::jsonb->>'playerId' NOT LIKE 'guest-%'
      AND e.data::jsonb->>'playerId' NOT LIKE 'temp-%'
    GROUP BY e.data::jsonb->>'playerId', p.name, p.color
    ORDER BY total_180s DESC
    LIMIT ?
  `, [limit])
  return results.map((r, i) => ({ rank: i + 1, playerId: r.player_id, playerName: r.player_name ?? 'Unbekannt', playerColor: r.player_color ?? undefined, value: r.total_180s }))
}

export async function getHighscoreModeBestCareerAvg(limit: number = 10): Promise<HighscoreEntrySQL[]> {
  const results = await query<{
    player_id: string
    player_name: string
    player_color: string | null
    career_avg: number
  }>(`
    WITH player_totals AS (
      SELECT
        e.data::jsonb->>'playerId' as player_id,
        SUM((e.data::jsonb->>'turnScore')::integer)::real as total_score,
        SUM(jsonb_array_length(e.data::jsonb->'darts'))::real as total_darts
      FROM highscore_events e
      JOIN highscore_matches m ON m.id = e.match_id AND m.finished = 1
      WHERE e.type = 'HighscoreTurnAdded'
      GROUP BY e.data::jsonb->>'playerId'
    ),
    match_count AS (
      SELECT
        mp.player_id,
        COUNT(DISTINCT m.id)::integer as matches
      FROM highscore_matches m
      JOIN highscore_match_players mp ON mp.match_id = m.id
      WHERE m.finished = 1
      GROUP BY mp.player_id
    )
    SELECT
      pt.player_id,
      p.name as player_name,
      p.color as player_color,
      (pt.total_score / pt.total_darts * 3) as career_avg
    FROM player_totals pt
    JOIN profiles p ON p.id = pt.player_id
    JOIN match_count mc ON mc.player_id = pt.player_id
    WHERE pt.player_id NOT LIKE 'guest-%'
      AND pt.player_id NOT LIKE 'temp-%'
      AND mc.matches >= 5
      AND pt.total_darts > 0
    ORDER BY career_avg DESC
    LIMIT ?
  `, [limit])
  return results.map((r, i) => ({ rank: i + 1, playerId: r.player_id, playerName: r.player_name ?? 'Unbekannt', playerColor: r.player_color ?? undefined, value: Math.round(r.career_avg * 100) / 100 }))
}

// ============================================================================
// Highscore Orchestration
// ============================================================================

export async function getAllHighscoresSQL(): Promise<HighscoreCategory[]> {
  const categories: HighscoreCategory[] = []

  for (const catConfig of HIGHSCORE_CATEGORIES) {
    let entries: HighscoreEntrySQL[] = []

    try {
      switch (catConfig.id as HighscoreCategoryId) {
        // Übergreifend
        case 'most-wins': entries = await getHighscoreMostWins(); break
        case 'best-winrate': entries = await getHighscoreBestWinrate(); break
        // X01
        case 'highest-visit': entries = await getHighscoreHighestVisit(); break
        case 'highest-checkout': entries = await getHighscoreHighestCheckout(); break
        case 'most-180s': entries = await getHighscoreMost180s(); break
        case 'best-career-avg': entries = await getHighscoreBestCareerAvg(); break
        case 'best-checkout-pct': entries = await getHighscoreBestCheckoutPct(); break
        case 'best-leg-501': entries = await getHighscoreBestLeg(501); break
        case 'best-leg-301': entries = await getHighscoreBestLeg(301); break
        case 'best-leg-701': entries = await getHighscoreBestLeg(701); break
        case 'best-match-avg-501': entries = await getHighscoreBestMatchAvg(501); break
        case 'best-match-avg-301': entries = await getHighscoreBestMatchAvg(301); break
        // Cricket (6 neue Kategorien)
        case 'cricket-best-turn-marks': entries = await getCricketHighscoreBestTurnMarks(); break
        case 'cricket-best-winrate': entries = await getCricketHighscoreBestWinrate(); break
        case 'cricket-highest-leg-score': entries = await getCricketHighscoreHighestLegScore(); break
        case 'cricket-fewest-darts': entries = await getCricketHighscoreFewestDarts(); break
        case 'cricket-best-scoring-round': entries = await getCricketHighscoreBestScoringRound(); break
        case 'cricket-most-bulls-leg': entries = await getCricketHighscoreMostBullsInLeg(); break
        // ATB
        case 'atb-fastest-ascending': entries = await getHighscoreATBFastest('ascending'); break
        case 'atb-fastest-board': entries = await getHighscoreATBFastest('board'); break
        case 'atb-fewest-darts-ascending': entries = await getHighscoreATBFewestDarts('ascending'); break
        case 'atb-fewest-darts-board': entries = await getHighscoreATBFewestDarts('board'); break
        case 'atb-most-wins': entries = await getHighscoreATBMostWins(); break
        // Bob's 27
        case 'bobs27-best-score': entries = await getHighscoreBobs27BestScore(); break
        case 'bobs27-best-hitrate': entries = await getHighscoreBobs27BestHitRate(); break
        case 'bobs27-most-wins': entries = await getHighscoreBobs27MostWins(); break
        // Operation
        case 'operation-best-score': entries = await getHighscoreOperationBestScore(); break
        case 'operation-best-avg-ppd': entries = await getHighscoreOperationBestAvgPPD(); break
        case 'operation-best-hitrate': entries = await getHighscoreOperationBestHitRate(); break
        case 'operation-most-wins': entries = await getHighscoreOperationMostWins(); break
        case 'operation-longest-streak': entries = await getHighscoreOperationLongestStreak(); break
        // Shanghai
        case 'shanghai-most-wins': entries = await getHighscoreShanghaiMostWins(); break
        case 'shanghai-most-finishs': entries = await getHighscoreShanghaiMostFinishs(); break
        case 'shanghai-highest-leg-score': entries = await getHighscoreShanghaiHighestLegScore(); break
        case 'shanghai-fewest-darts': entries = await getHighscoreShanghaiFewestDarts(); break
        case 'shanghai-highest-turn': entries = await getHighscoreShanghaiHighestTurn(); break
        case 'shanghai-perfect-turns': entries = await getHighscoreShanghaiPerfectTurns(); break
        case 'shanghai-biggest-margin': entries = await getHighscoreShanghaiBiggestMargin(); break
        case 'shanghai-focused-match': entries = await getHighscoreShanghaiFocusedMatch(); break
        case 'shanghai-triple-master': entries = await getHighscoreShanghaiTripleMaster(); break
        // CTF
        case 'ctf-most-wins': entries = await getHighscoreCTFMostWins(); break
        case 'ctf-highest-match-score': entries = await getHighscoreCTFHighestMatchScore(); break
        case 'ctf-most-fields': entries = await getHighscoreCTFMostFields(); break
        case 'ctf-longest-streak': entries = await getHighscoreCTFLongestStreak(); break
        case 'ctf-best-turn': entries = await getHighscoreCTFBestTurn(); break
        case 'ctf-perfect-match': entries = await getHighscoreCTFPerfectMatch(); break
        case 'ctf-bull-sniper': entries = await getHighscoreCTFBullSniper(); break
        case 'ctf-focused-match': entries = await getHighscoreCTFFocusedMatch(); break
        case 'ctf-triple-threes': entries = await getHighscoreCTFTripleThrees(); break
        case 'ctf-clean-sheet': entries = await getHighscoreCTFCleanSheet(); break
        // Sträußchen
        case 'str-most-wins': entries = await getHighscoreStrMostWins(); break
        case 'str-fastest-time': entries = await getHighscoreStrFastestTime(); break
        case 'str-fewest-darts': entries = await getHighscoreStrFewestDarts(); break
        case 'str-hit-streak': entries = await getHighscoreStrHitStreak(); break
        case 'str-best-hit-rate': entries = await getHighscoreStrBestHitRate(); break
        // Killer
        case 'killer-most-wins': entries = await getHighscoreKillerMostWins(); break
        case 'killer-most-eliminations-match': entries = await getHighscoreKillerEliminationsMatch(); break
        case 'killer-most-eliminations-career': entries = await getHighscoreKillerEliminationsCareer(); break
        case 'killer-multi-kill': entries = await getHighscoreKillerMultiKill(); break
        case 'killer-flawless-wins': entries = await getHighscoreKillerFlawlessWins(); break
        // Highscore-Modus
        case 'highscore-most-wins': entries = await getHighscoreModeMostWins(); break
        case 'highscore-highest-leg-score': entries = await getHighscoreModeHighestLegScore(); break
        case 'highscore-most-180s': entries = await getHighscoreModeMost180s(); break
        case 'highscore-fastest-leg': entries = await getHighscoreModeFastestLeg(); break
        case 'highscore-career-180s': entries = await getHighscoreModeCareer180s(); break
        case 'highscore-best-career-avg': entries = await getHighscoreModeBestCareerAvg(); break
      }
    } catch (err) {
      console.error(`Highscore-Kategorie ${catConfig.id} fehlgeschlagen:`, err)
    }

    categories.push({
      ...catConfig,
      entries: entries.map(e => ({
        rank: e.rank,
        playerId: e.playerId,
        playerName: e.playerName,
        playerColor: e.playerColor,
        value: e.value,
        matchId: e.matchId,
        matchDate: e.matchDate,
      })),
    })
  }

  return categories
}

const GLOBAL_PLAYER_ID = '_global'

/**
 * Cached version of getAllHighscoresSQL.
 * Reads from player_stats_cache on subsequent calls, computes live on first call.
 */
export async function getAllHighscoresCached(): Promise<HighscoreCategory[]> {
  try {
    const cached = await getCachedGroup<HighscoreCategory[]>(GLOBAL_PLAYER_ID, 'highscores')
    if (cached && Array.isArray(cached) && cached.length > 0) {
      return cached
    }
  } catch {
    // Cache unavailable — fall through to live
  }

  const result = await getAllHighscoresSQL()
  setCachedGroup(GLOBAL_PLAYER_ID, 'highscores', result).catch(() => {})
  return result
}

/**
 * Invalidate the global highscores cache (call after any match ends).
 */
export async function invalidateHighscoresCache(): Promise<void> {
  try {
    await import('../index').then(db =>
      db.exec(
        'DELETE FROM player_stats_cache WHERE player_id = ? AND stat_group = ?',
        [GLOBAL_PLAYER_ID, 'highscores']
      )
    )
  } catch {}
}

/**
 * Alle Highscore-Kategorien für einen Spieler (für Achievements)
 */
export async function getPlayerAchievements(playerId: string): Promise<{
  categoryId: string
  categoryTitle: string
  rank: number
  value: number
}[]> {
  const achievements: { categoryId: string; categoryTitle: string; rank: number; value: number }[] = []

  // Meiste Siege
  const wins = await getHighscoreMostWins()
  const winsEntry = wins.find(e => e.playerId === playerId)
  if (winsEntry && winsEntry.rank <= 3) {
    achievements.push({ categoryId: 'most-wins', categoryTitle: 'Meiste Siege', rank: winsEntry.rank, value: winsEntry.value })
  }

  // Beste Gewinnquote
  const winrate = await getHighscoreBestWinrate()
  const winrateEntry = winrate.find(e => e.playerId === playerId)
  if (winrateEntry && winrateEntry.rank <= 3) {
    achievements.push({ categoryId: 'best-winrate', categoryTitle: 'Beste Gewinnquote', rank: winrateEntry.rank, value: winrateEntry.value })
  }

  // Meiste 180er
  const most180s = await getHighscoreMost180s()
  const most180sEntry = most180s.find(e => e.playerId === playerId)
  if (most180sEntry && most180sEntry.rank <= 3) {
    achievements.push({ categoryId: 'most-180s', categoryTitle: 'Meiste 180er', rank: most180sEntry.rank, value: most180sEntry.value })
  }

  // Bester Durchschnitt
  const bestAvg = await getHighscoreBestCareerAvg()
  const bestAvgEntry = bestAvg.find(e => e.playerId === playerId)
  if (bestAvgEntry && bestAvgEntry.rank <= 3) {
    achievements.push({ categoryId: 'best-career-avg', categoryTitle: 'Bester Durchschnitt', rank: bestAvgEntry.rank, value: bestAvgEntry.value })
  }

  // Beste Checkout-Quote
  const checkoutPct = await getHighscoreBestCheckoutPct()
  const checkoutPctEntry = checkoutPct.find(e => e.playerId === playerId)
  if (checkoutPctEntry && checkoutPctEntry.rank <= 3) {
    achievements.push({ categoryId: 'best-checkout-pct', categoryTitle: 'Beste Checkout-%', rank: checkoutPctEntry.rank, value: checkoutPctEntry.value })
  }

  return achievements.sort((a, b) => a.rank - b.rank)
}
