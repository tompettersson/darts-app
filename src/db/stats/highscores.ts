// src/db/stats/highscores.ts
// All highscore/hall of fame functions

import { query } from '../index'
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
      SUM(CASE WHEN (e.data::jsonb->>'hit')::integer = 1 THEN 1 ELSE 0 END)::real /
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
