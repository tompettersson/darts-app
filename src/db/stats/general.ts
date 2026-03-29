// src/db/stats/general.ts
// Cross-game functions: general stats, special stats, 121, achievements, dashboard, H2H, time insights, training

import { query, queryOne } from '../index'
import { getPlayerStreaks } from './x01'
import { getX01DoubleRates, getX01TrebleRates, getX01FormCurve, getSessionPerformance } from './x01-analytics'

// ============================================================================
// General Player Stats (for Allgemein Tab)
// ============================================================================

export type GeneralPlayerStats = {
  // Gesamt
  totalX01Matches: number
  totalCricketMatches: number
  totalATBMatches: number
  totalMatches: number
  // Wins (nur Mehrspieler)
  x01Wins: number
  cricketWins: number
  atbWins: number
  totalWins: number
  overallWinRate: number
  // Einzelspiele (Solo = nur 1 Spieler)
  soloX01Matches: number
  soloCricketMatches: number
  soloATBMatches: number
  soloTotalMatches: number
  // Mehrspieler-Matches (für Gewinnquote)
  multiX01Matches: number
  multiCricketMatches: number
  multiATBMatches: number
  multiTotalMatches: number
  // Aktivität
  totalDartsThrown: number
  firstMatchDate: string | null
  lastMatchDate: string | null
  // Highlights
  highest180Count: number
  highestCheckout: number
}

/**
 * Allgemeine Spieler-Übersicht über alle Spielmodi
 */
export async function getGeneralPlayerStats(playerId: string): Promise<GeneralPlayerStats> {
  // Alle unabhängigen Queries parallel starten
  const [x01, cricket, atb, dates, highlights] = await Promise.all([
    // X01 Stats
    queryOne<{ matches: number; solo: number; wins: number; multi_wins: number; darts: number }>(`
      WITH player_matches AS (
        SELECT m.id,
          (SELECT COUNT(*) FROM x01_match_players WHERE match_id = m.id) as player_count
        FROM x01_matches m
        JOIN x01_match_players mp ON mp.match_id = m.id AND mp.player_id = ?
        WHERE m.finished = 1
      )
      SELECT
        COUNT(*) as matches,
        SUM(CASE WHEN player_count = 1 THEN 1 ELSE 0 END) as solo,
        (SELECT COUNT(*) FROM x01_events e2
         WHERE e2.match_id IN (SELECT id FROM player_matches)
         AND e2.type = 'MatchFinished'
         AND e2.data::jsonb->>'winnerPlayerId' = ?) as wins,
        (SELECT COUNT(*) FROM x01_events e2
         WHERE e2.match_id IN (SELECT id FROM player_matches WHERE player_count > 1)
         AND e2.type = 'MatchFinished'
         AND e2.data::jsonb->>'winnerPlayerId' = ?) as multi_wins,
        COALESCE((SELECT SUM(jsonb_array_length(e3.data::jsonb->'darts'))
         FROM x01_events e3
         JOIN x01_matches m3 ON m3.id = e3.match_id AND m3.finished = 1
         JOIN x01_match_players mp3 ON mp3.match_id = m3.id AND mp3.player_id = ?
         WHERE e3.type = 'VisitAdded' AND e3.data::jsonb->>'playerId' = ?), 0) as darts
      FROM player_matches
    `, [playerId, playerId, playerId, playerId, playerId]),

    // Cricket Stats
    queryOne<{ matches: number; solo: number; wins: number; multi_wins: number }>(`
      WITH player_matches AS (
        SELECT m.id,
          (SELECT COUNT(*) FROM cricket_match_players WHERE match_id = m.id) as player_count
        FROM cricket_matches m
        JOIN cricket_match_players mp ON mp.match_id = m.id AND mp.player_id = ?
        WHERE m.finished = 1
      )
      SELECT
        COUNT(*) as matches,
        SUM(CASE WHEN player_count = 1 THEN 1 ELSE 0 END) as solo,
        (SELECT COUNT(*) FROM cricket_events e2
         WHERE e2.match_id IN (SELECT id FROM player_matches)
         AND e2.type = 'CricketMatchFinished'
         AND e2.data::jsonb->>'winnerPlayerId' = ?) as wins,
        (SELECT COUNT(*) FROM cricket_events e2
         WHERE e2.match_id IN (SELECT id FROM player_matches WHERE player_count > 1)
         AND e2.type = 'CricketMatchFinished'
         AND e2.data::jsonb->>'winnerPlayerId' = ?) as multi_wins
      FROM player_matches
    `, [playerId, playerId, playerId]),

    // ATB Stats
    queryOne<{ matches: number; solo: number; wins: number; multi_wins: number }>(`
      WITH player_matches AS (
        SELECT m.id, m.winner_id,
          (SELECT COUNT(*) FROM atb_match_players WHERE match_id = m.id) as player_count
        FROM atb_matches m
        JOIN atb_match_players mp ON mp.match_id = m.id AND mp.player_id = ?
        WHERE m.finished = 1
      )
      SELECT
        COUNT(*) as matches,
        SUM(CASE WHEN player_count = 1 THEN 1 ELSE 0 END) as solo,
        SUM(CASE WHEN winner_id = ? THEN 1 ELSE 0 END) as wins,
        SUM(CASE WHEN winner_id = ? AND player_count > 1 THEN 1 ELSE 0 END) as multi_wins
      FROM player_matches
    `, [playerId, playerId, playerId]),

    // Dates
    queryOne<{ first_date: string; last_date: string }>(`
      SELECT
        MIN(created_at) as first_date,
        MAX(created_at) as last_date
      FROM (
        SELECT created_at FROM x01_matches m JOIN x01_match_players mp ON mp.match_id = m.id AND mp.player_id = ? WHERE m.finished = 1
        UNION ALL
        SELECT created_at FROM cricket_matches m JOIN cricket_match_players mp ON mp.match_id = m.id AND mp.player_id = ? WHERE m.finished = 1
        UNION ALL
        SELECT created_at FROM atb_matches m JOIN atb_match_players mp ON mp.match_id = m.id AND mp.player_id = ? WHERE m.finished = 1
      )
    `, [playerId, playerId, playerId]),

    // Highlights
    queryOne<{ count_180: number; highest_checkout: number }>(`
      SELECT
        COALESCE(SUM(CASE WHEN (e.data::jsonb->>'visitScore')::integer = 180 THEN 1 ELSE 0 END), 0) as count_180,
        COALESCE(MAX(CASE WHEN e.data::jsonb->>'finishingDartSeq' IS NOT NULL
            THEN (e.data::jsonb->>'remainingBefore')::integer ELSE 0 END), 0) as highest_checkout
      FROM x01_events e
      JOIN x01_match_players mp ON mp.match_id = e.match_id AND mp.player_id = ?
      JOIN x01_matches m ON m.id = e.match_id AND m.finished = 1
      WHERE e.type = 'VisitAdded'
        AND e.data::jsonb->>'playerId' = ?
    `, [playerId, playerId]),
  ])

  const x01Matches = x01?.matches ?? 0
  const cricketMatches = cricket?.matches ?? 0
  const atbMatches = atb?.matches ?? 0
  const totalMatches = x01Matches + cricketMatches + atbMatches

  const soloX01 = x01?.solo ?? 0
  const soloCricket = cricket?.solo ?? 0
  const soloATB = atb?.solo ?? 0
  const soloTotal = soloX01 + soloCricket + soloATB

  const multiX01 = x01Matches - soloX01
  const multiCricket = cricketMatches - soloCricket
  const multiATB = atbMatches - soloATB
  const multiTotal = multiX01 + multiCricket + multiATB

  // Siege nur aus Mehrspieler-Matches für Gewinnquote
  const x01MultiWins = x01?.multi_wins ?? 0
  const cricketMultiWins = cricket?.multi_wins ?? 0
  const atbMultiWins = atb?.multi_wins ?? 0
  const totalMultiWins = x01MultiWins + cricketMultiWins + atbMultiWins

  return {
    totalX01Matches: x01Matches,
    totalCricketMatches: cricketMatches,
    totalATBMatches: atbMatches,
    totalMatches,
    x01Wins: x01MultiWins,
    cricketWins: cricketMultiWins,
    atbWins: atbMultiWins,
    totalWins: totalMultiWins,
    overallWinRate: multiTotal > 0 ? Math.round(totalMultiWins / multiTotal * 100) : 0,
    soloX01Matches: soloX01,
    soloCricketMatches: soloCricket,
    soloATBMatches: soloATB,
    soloTotalMatches: soloTotal,
    multiX01Matches: multiX01,
    multiCricketMatches: multiCricket,
    multiATBMatches: multiATB,
    multiTotalMatches: multiTotal,
    totalDartsThrown: x01?.darts ?? 0,
    firstMatchDate: dates?.first_date ?? null,
    lastMatchDate: dates?.last_date ?? null,
    highest180Count: highlights?.count_180 ?? 0,
    highestCheckout: highlights?.highest_checkout ?? 0,
  }
}

// ============================================================================
// 121 Stats (Sprint Mode)
// ============================================================================

export type Stats121Full = {
  totalLegs: number
  legsWon: number
  winRate: number
  matchesPlayed: number
  matchesWon: number
  checkoutAttempts: number
  checkoutsMade: number
  checkoutPct: number
  avgDartsToFinish: number
  bestDarts: number | null
  worstDarts: number | null
  totalDarts: number
  bustCount: number
  bustRate: number
  skillScore: number
}

export async function get121FullStats(playerId: string): Promise<Stats121Full> {
  const legStats = await queryOne<{
    total_legs: number
    legs_won: number
    total_darts: number
    best_darts: number
    worst_darts: number
  }>(`
    WITH player_121_matches AS (
      SELECT m.id
      FROM x01_matches m
      JOIN x01_match_players mp ON mp.match_id = m.id AND mp.player_id = ?
      WHERE m.finished = 1 AND m.starting_score = 121
    ),
    leg_results AS (
      SELECT
        e.match_id,
        e.data::jsonb->>'legId' as leg_id,
        e.data::jsonb->>'winnerPlayerId' as winner_id
      FROM x01_events e
      WHERE e.match_id IN (SELECT id FROM player_121_matches)
        AND e.type = 'LegFinished'
    ),
    player_leg_darts AS (
      SELECT
        lr.leg_id,
        SUM(jsonb_array_length(e.data::jsonb->'darts')) as darts_in_leg,
        lr.winner_id
      FROM leg_results lr
      JOIN x01_events e ON e.match_id = lr.match_id
        AND e.data::jsonb->>'legId' = lr.leg_id
        AND e.type = 'VisitAdded'
        AND e.data::jsonb->>'playerId' = ?
      GROUP BY lr.leg_id, lr.winner_id
    )
    SELECT
      COUNT(*) as total_legs,
      SUM(CASE WHEN winner_id = ? THEN 1 ELSE 0 END) as legs_won,
      SUM(darts_in_leg) as total_darts,
      MIN(CASE WHEN winner_id = ? THEN darts_in_leg ELSE NULL END) as best_darts,
      MAX(CASE WHEN winner_id = ? THEN darts_in_leg ELSE NULL END) as worst_darts
    FROM player_leg_darts
  `, [playerId, playerId, playerId, playerId, playerId])

  const checkoutStats = await queryOne<{
    checkout_attempts: number
    checkouts_made: number
  }>(`
    SELECT
      COUNT(*) as checkout_attempts,
      SUM(CASE WHEN e.data::jsonb->>'finishingDartSeq' IS NOT NULL THEN 1 ELSE 0 END) as checkouts_made
    FROM x01_events e
    JOIN x01_matches m ON m.id = e.match_id AND m.starting_score = 121 AND m.finished = 1
    JOIN x01_match_players mp ON mp.match_id = m.id AND mp.player_id = ?
    WHERE e.type = 'VisitAdded'
      AND e.data::jsonb->>'playerId' = ?
      AND (e.data::jsonb->>'remainingBefore')::integer <= 121
  `, [playerId, playerId])

  const bustStats = await queryOne<{ bust_count: number }>(`
    SELECT SUM(CASE WHEN e.data::jsonb->>'bust' = 'true' THEN 1 ELSE 0 END) as bust_count
    FROM x01_events e
    JOIN x01_matches m ON m.id = e.match_id AND m.starting_score = 121 AND m.finished = 1
    JOIN x01_match_players mp ON mp.match_id = m.id AND mp.player_id = ?
    WHERE e.type = 'VisitAdded'
      AND e.data::jsonb->>'playerId' = ?
  `, [playerId, playerId])

  const matchStats = await queryOne<{
    matches_played: number
    matches_won: number
  }>(`
    SELECT
      COUNT(*) as matches_played,
      SUM(CASE WHEN e.data IS NOT NULL AND e.data::jsonb->>'winnerPlayerId' = ? THEN 1 ELSE 0 END) as matches_won
    FROM x01_matches m
    JOIN x01_match_players mp ON mp.match_id = m.id AND mp.player_id = ?
    LEFT JOIN x01_events e ON e.match_id = m.id AND e.type = 'MatchFinished'
    WHERE m.finished = 1 AND m.starting_score = 121
      AND (SELECT COUNT(*) FROM x01_match_players mp2 WHERE mp2.match_id = m.id) > 1
  `, [playerId, playerId])

  const totalLegs = legStats?.total_legs ?? 0
  const legsWon = legStats?.legs_won ?? 0
  const totalDarts = legStats?.total_darts ?? 0
  const matchesPlayed = matchStats?.matches_played ?? 0
  const matchesWon = matchStats?.matches_won ?? 0
  const checkoutAttempts = checkoutStats?.checkout_attempts ?? 0
  const checkoutsMade = checkoutStats?.checkouts_made ?? 0
  const bustCount = bustStats?.bust_count ?? 0

  const avgDartsToFinish = legsWon > 0 ? totalDarts / legsWon : 0
  const checkoutPct = checkoutAttempts > 0 ? (checkoutsMade / checkoutAttempts) * 100 : 0

  const checkoutComponent = checkoutPct * 0.4
  const dartsComponent = legsWon > 0 ? Math.max(0, (1 - (avgDartsToFinish - 3) / 18) * 100) * 0.25 : 0
  const doubleComponent = checkoutsMade > 0 ? Math.max(0, (1 - ((checkoutAttempts / checkoutsMade) - 1) / 9) * 100) * 0.20 : 0
  const constancyComponent = 50 * 0.15
  const skillScore = Math.round(checkoutComponent + dartsComponent + doubleComponent + constancyComponent)

  return {
    totalLegs,
    legsWon,
    winRate: totalLegs > 0 ? Math.round((legsWon / totalLegs) * 100) : 0,
    matchesPlayed,
    matchesWon,
    checkoutAttempts,
    checkoutsMade,
    checkoutPct: Math.round(checkoutPct * 10) / 10,
    avgDartsToFinish: Math.round(avgDartsToFinish * 10) / 10,
    bestDarts: legStats?.best_darts ?? null,
    worstDarts: legStats?.worst_darts ?? null,
    totalDarts,
    bustCount,
    bustRate: totalLegs > 0 ? Math.round((bustCount / totalLegs) * 100) : 0,
    skillScore,
  }
}

// ============================================================================
// Special Stats (Spezial-Tab)
// ============================================================================

export type SpecialStatsSQL = {
  tripleHitRate: number
  doubleHitRate: number
  dart1Avg: number
  dart2Avg: number
  dart3Avg: number
  performanceWhenBehind: number
  performanceWhenAhead: number
  last5Wins: number
  last5Avg: number
  averageTrend: 'rising' | 'falling' | 'stable'
}

export async function getSpecialStats(playerId: string): Promise<SpecialStatsSQL> {
  const cricketRates = await queryOne<{
    triple_count: number
    double_count: number
    single_count: number
    total_throws: number
  }>(`
    SELECT
      COALESCE(SUM((e.data::jsonb->>'tripleCount')::integer), 0) as triple_count,
      COALESCE(SUM((e.data::jsonb->>'doubleCount')::integer), 0) as double_count,
      COALESCE(SUM((e.data::jsonb->>'singleCount')::integer), 0) as single_count,
      COUNT(*) * 3 as total_throws
    FROM cricket_events e
    JOIN cricket_match_players mp ON mp.match_id = e.match_id AND mp.player_id = ?
    JOIN cricket_matches m ON m.id = e.match_id AND m.finished = 1
    WHERE e.type = 'CricketTurnAdded'
      AND e.data::jsonb->>'playerId' = ?
  `, [playerId, playerId])

  const totalThrows = cricketRates?.total_throws ?? 0
  const tripleHitRate = totalThrows > 0 ? (cricketRates?.triple_count ?? 0) / totalThrows * 100 : 0
  const doubleHitRate = totalThrows > 0 ? (cricketRates?.double_count ?? 0) / totalThrows * 100 : 0

  // Dart 1/2/3 Average aus X01 VisitAdded Events
  const dartAvgs = await queryOne<{ dart1Avg: number; dart2Avg: number; dart3Avg: number }>(`
    SELECT
      AVG(CASE WHEN (d.value->>'seq')::integer = 1 THEN (d.value->>'score')::real END) as dart1Avg,
      AVG(CASE WHEN (d.value->>'seq')::integer = 2 THEN (d.value->>'score')::real END) as dart2Avg,
      AVG(CASE WHEN (d.value->>'seq')::integer = 3 THEN (d.value->>'score')::real END) as dart3Avg
    FROM x01_events e
    JOIN x01_matches m ON m.id = e.match_id AND m.finished = 1
    JOIN x01_match_players mp ON mp.match_id = m.id AND mp.player_id = ?
    CROSS JOIN LATERAL jsonb_array_elements(e.data::jsonb->'darts') d(value)
    WHERE e.type = 'VisitAdded'
      AND e.data::jsonb->>'playerId' = ?
  `, [playerId, playerId])

  const last5 = await query<{
    match_id: string
    won: number
    avg: number
  }>(`
    SELECT
      m.id as match_id,
      CASE WHEN (SELECT e2.data::jsonb->>'winnerPlayerId' FROM x01_events e2
                 WHERE e2.match_id = m.id AND e2.type = 'MatchFinished') = ? THEN 1 ELSE 0 END as won,
      AVG((e.data::jsonb->>'visitScore')::real /
          NULLIF(jsonb_array_length(e.data::jsonb->'darts'), 0) * 3) as avg
    FROM x01_matches m
    JOIN x01_match_players mp ON mp.match_id = m.id AND mp.player_id = ?
    JOIN x01_events e ON e.match_id = m.id AND e.type = 'VisitAdded' AND e.data::jsonb->>'playerId' = ?
    WHERE m.finished = 1
    GROUP BY m.id, m.created_at
    ORDER BY m.created_at DESC
    LIMIT 5
  `, [playerId, playerId, playerId])

  const last5Wins = last5.filter(m => m.won === 1).length
  const last5Avg = last5.length > 0 ? last5.reduce((sum, m) => sum + (m.avg || 0), 0) / last5.length : 0

  const previous5 = await query<{ avg: number }>(`
    SELECT
      AVG((e.data::jsonb->>'visitScore')::real /
          NULLIF(jsonb_array_length(e.data::jsonb->'darts'), 0) * 3) as avg
    FROM x01_matches m
    JOIN x01_match_players mp ON mp.match_id = m.id AND mp.player_id = ?
    JOIN x01_events e ON e.match_id = m.id AND e.type = 'VisitAdded' AND e.data::jsonb->>'playerId' = ?
    WHERE m.finished = 1
    GROUP BY m.id, m.created_at
    ORDER BY m.created_at DESC
    LIMIT 5 OFFSET 5
  `, [playerId, playerId])

  const prev5Avg = previous5.length > 0 ? previous5.reduce((sum, m) => sum + (m.avg || 0), 0) / previous5.length : 0
  let averageTrend: 'rising' | 'falling' | 'stable' = 'stable'
  if (prev5Avg > 0 && last5Avg > prev5Avg * 1.05) averageTrend = 'rising'
  if (prev5Avg > 0 && last5Avg < prev5Avg * 0.95) averageTrend = 'falling'

  // Performance Under Pressure: 3DA in gewonnenen vs verlorenen Matches (nur Multiplayer)
  const pressureAvg = await queryOne<{ avg_winning: number; avg_losing: number }>(`
    SELECT
      AVG(CASE WHEN won = 1 THEN avg ELSE NULL END) as avg_winning,
      AVG(CASE WHEN won = 0 THEN avg ELSE NULL END) as avg_losing
    FROM (
      SELECT
        m.id,
        CASE WHEN (SELECT ef.data::jsonb->>'winnerPlayerId' FROM x01_events ef
                   WHERE ef.match_id = m.id AND ef.type = 'MatchFinished') = ? THEN 1 ELSE 0 END as won,
        AVG((e.data::jsonb->>'visitScore')::real /
            NULLIF(jsonb_array_length(e.data::jsonb->'darts'), 0) * 3) as avg
      FROM x01_matches m
      JOIN x01_match_players mp ON mp.match_id = m.id AND mp.player_id = ?
      JOIN x01_events e ON e.match_id = m.id AND e.type = 'VisitAdded' AND e.data::jsonb->>'playerId' = ?
      WHERE m.finished = 1
        AND (SELECT COUNT(*) FROM x01_match_players WHERE match_id = m.id) > 1
      GROUP BY m.id
    )
  `, [playerId, playerId, playerId])

  const perfBehind = pressureAvg?.avg_losing ?? 0
  const perfAhead = pressureAvg?.avg_winning ?? 0

  return {
    tripleHitRate: Math.round(tripleHitRate * 10) / 10,
    doubleHitRate: Math.round(doubleHitRate * 10) / 10,
    dart1Avg: Math.round((dartAvgs?.dart1Avg ?? 0) * 10) / 10,
    dart2Avg: Math.round((dartAvgs?.dart2Avg ?? 0) * 10) / 10,
    dart3Avg: Math.round((dartAvgs?.dart3Avg ?? 0) * 10) / 10,
    performanceWhenBehind: Math.round(perfBehind * 100) / 100,
    performanceWhenAhead: Math.round(perfAhead * 100) / 100,
    last5Wins,
    last5Avg: Math.round(last5Avg * 100) / 100,
    averageTrend,
  }
}

// ============================================================================
// Cross-Game Dashboard (TASK 16)
// ============================================================================

export type ActivityDay = {
  date: string
  matchCount: number
}

export type GameModeDistribution = {
  mode: string
  label: string
  matchCount: number
  percentage: number
}

export type PlayingStreak = {
  currentDays: number
  longestDays: number
  totalActiveDays: number
  totalDaysTracked: number
}

export type CrossGameDashboard = {
  overallWinRate: number
  overallWinRateMultiOnly: number
  totalMatchesAllModes: number
  totalWinsAllModes: number
  activityHeatmap: ActivityDay[]
  gameModeDistribution: GameModeDistribution[]
  playingStreak: PlayingStreak
  favoriteMode: string | null
  favoriteModeLabel: string | null
}

export async function getCrossGameDashboard(playerId: string): Promise<CrossGameDashboard> {
  try {
    const modes = [
      { table: 'x01', playerTable: 'x01_match_players', eventsTable: 'x01_events', winEvent: 'MatchFinished', winField: '$.winnerPlayerId', label: 'X01' },
      { table: 'cricket', playerTable: 'cricket_match_players', eventsTable: 'cricket_events', winEvent: 'CricketMatchFinished', winField: '$.winnerPlayerId', label: 'Cricket' },
      { table: 'atb', playerTable: 'atb_match_players', winnerCol: 'winner_id', label: 'Around the Block' },
      { table: 'ctf', playerTable: 'ctf_match_players', winnerCol: 'winner_id', label: 'Capture the Field' },
      { table: 'str', playerTable: 'str_match_players', winnerCol: 'winner_id', label: 'Sträußchen' },
      { table: 'highscore', playerTable: 'highscore_match_players', winnerCol: 'winner_id', label: 'Highscore' },
      { table: 'shanghai', playerTable: 'shanghai_match_players', winnerCol: 'winner_id', label: 'Shanghai' },
      { table: 'killer', playerTable: 'killer_match_players', winnerCol: 'winner_id', label: 'Killer' },
      { table: 'bobs27', playerTable: 'bobs27_match_players', winnerCol: 'winner_id', label: "Bob's 27" },
      { table: 'operation', playerTable: 'operation_match_players', winnerCol: 'winner_id', label: 'Operation' },
    ] as const

    let totalMatches = 0
    let totalWins = 0
    let totalMulti = 0
    let totalMultiWins = 0
    const distribution: GameModeDistribution[] = []

    for (const mode of modes) {
      try {
        let result: { matches: number; wins: number; multi: number; multi_wins: number } | null
        if ('winnerCol' in mode && mode.winnerCol) {
          result = await queryOne<{ matches: number; wins: number; multi: number; multi_wins: number }>(`
            SELECT
              COUNT(*) as matches,
              SUM(CASE WHEN m.${mode.winnerCol} = ? THEN 1 ELSE 0 END) as wins,
              SUM(CASE WHEN (SELECT COUNT(*) FROM ${mode.playerTable} WHERE match_id = m.id) > 1 THEN 1 ELSE 0 END) as multi,
              SUM(CASE WHEN m.${mode.winnerCol} = ? AND (SELECT COUNT(*) FROM ${mode.playerTable} WHERE match_id = m.id) > 1 THEN 1 ELSE 0 END) as multi_wins
            FROM ${mode.table}_matches m
            JOIN ${mode.playerTable} mp ON mp.match_id = m.id AND mp.player_id = ?
            WHERE m.finished = 1
          `, [playerId, playerId, playerId])
        } else {
          const m = mode as { table: string; playerTable: string; eventsTable: string; winEvent: string; winField: string; label: string }
          result = await queryOne<{ matches: number; wins: number; multi: number; multi_wins: number }>(`
            SELECT
              COUNT(*) as matches,
              (SELECT COUNT(*) FROM ${m.eventsTable} e2
               WHERE e2.match_id IN (SELECT m2.id FROM ${m.table}_matches m2 JOIN ${m.playerTable} mp2 ON mp2.match_id = m2.id AND mp2.player_id = ? WHERE m2.finished = 1)
               AND e2.type = '${m.winEvent}'
               AND e2.data::jsonb->>'winnerPlayerId' = ?) as wins,
              SUM(CASE WHEN (SELECT COUNT(*) FROM ${m.playerTable} WHERE match_id = mt.id) > 1 THEN 1 ELSE 0 END) as multi,
              0 as multi_wins
            FROM ${m.table}_matches mt
            JOIN ${m.playerTable} mp ON mp.match_id = mt.id AND mp.player_id = ?
            WHERE mt.finished = 1
          `, [playerId, playerId, playerId])
          if (result && result.wins > 0) {
            const multiWins = await queryOne<{ mw: number }>(`
              SELECT COUNT(*) as mw FROM ${m.eventsTable} e
              WHERE e.type = '${m.winEvent}'
                AND e.data::jsonb->>'winnerPlayerId' = ?
                AND e.match_id IN (
                  SELECT mt.id FROM ${m.table}_matches mt
                  JOIN ${m.playerTable} mp ON mp.match_id = mt.id AND mp.player_id = ?
                  WHERE mt.finished = 1
                    AND (SELECT COUNT(*) FROM ${m.playerTable} WHERE match_id = mt.id) > 1
                )
            `, [playerId, playerId])
            if (result) result.multi_wins = multiWins?.mw ?? 0
          }
        }
        const mc = result?.matches ?? 0
        const w = result?.wins ?? 0
        if (mc > 0) {
          distribution.push({ mode: mode.table, label: mode.label, matchCount: mc, percentage: 0 })
        }
        totalMatches += mc
        totalWins += w
        totalMulti += result?.multi ?? 0
        totalMultiWins += result?.multi_wins ?? 0
      } catch { /* table might not exist */ }
    }

    for (const d of distribution) {
      d.percentage = totalMatches > 0 ? Math.round(d.matchCount / totalMatches * 1000) / 10 : 0
    }
    distribution.sort((a, b) => b.matchCount - a.matchCount)

    const heatmapRows = await query<{ date: string; count: number }>(`
      SELECT created_at::date as date, COUNT(*) as count FROM (
        SELECT created_at FROM x01_matches m JOIN x01_match_players mp ON mp.match_id = m.id AND mp.player_id = ? WHERE m.finished = 1
        UNION ALL SELECT created_at FROM cricket_matches m JOIN cricket_match_players mp ON mp.match_id = m.id AND mp.player_id = ? WHERE m.finished = 1
        UNION ALL SELECT created_at FROM atb_matches m JOIN atb_match_players mp ON mp.match_id = m.id AND mp.player_id = ? WHERE m.finished = 1
        UNION ALL SELECT created_at FROM ctf_matches m JOIN ctf_match_players mp ON mp.match_id = m.id AND mp.player_id = ? WHERE m.finished = 1
        UNION ALL SELECT created_at FROM str_matches m JOIN str_match_players mp ON mp.match_id = m.id AND mp.player_id = ? WHERE m.finished = 1
        UNION ALL SELECT created_at FROM highscore_matches m JOIN highscore_match_players mp ON mp.match_id = m.id AND mp.player_id = ? WHERE m.finished = 1
        UNION ALL SELECT created_at FROM shanghai_matches m JOIN shanghai_match_players mp ON mp.match_id = m.id AND mp.player_id = ? WHERE m.finished = 1
        UNION ALL SELECT created_at FROM killer_matches m JOIN killer_match_players mp ON mp.match_id = m.id AND mp.player_id = ? WHERE m.finished = 1
        UNION ALL SELECT created_at FROM bobs27_matches m JOIN bobs27_match_players mp ON mp.match_id = m.id AND mp.player_id = ? WHERE m.finished = 1
        UNION ALL SELECT created_at FROM operation_matches m JOIN operation_match_players mp ON mp.match_id = m.id AND mp.player_id = ? WHERE m.finished = 1
      )
      WHERE created_at::date >= CURRENT_DATE - INTERVAL '365 days'
      GROUP BY created_at::date
      ORDER BY date ASC
    `, [playerId, playerId, playerId, playerId, playerId, playerId, playerId, playerId, playerId, playerId])

    const allDates = heatmapRows.map(r => r.date).sort()
    let currentStreak = 0
    let longestStreak = 0
    let streak = 0
    const today = new Date().toISOString().split('T')[0]

    if (allDates.length > 0) {
      const dateSet = new Set(allDates)
      const d = new Date(today)
      while (dateSet.has(d.toISOString().split('T')[0])) {
        currentStreak++
        d.setDate(d.getDate() - 1)
      }
      if (currentStreak === 0) {
        const yesterday = new Date(today)
        yesterday.setDate(yesterday.getDate() - 1)
        const y = new Date(yesterday)
        while (dateSet.has(y.toISOString().split('T')[0])) {
          currentStreak++
          y.setDate(y.getDate() - 1)
        }
      }

      for (let i = 0; i < allDates.length; i++) {
        if (i === 0) { streak = 1; } else {
          const prev = new Date(allDates[i - 1])
          const cur = new Date(allDates[i])
          const diff = (cur.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24)
          streak = diff <= 1 ? streak + 1 : 1
        }
        if (streak > longestStreak) longestStreak = streak
      }
    }

    const firstDate = allDates[0] ? new Date(allDates[0]) : new Date()
    const totalDaysTracked = Math.max(1, Math.ceil((new Date(today).getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24)))

    return {
      overallWinRate: totalMatches > 0 ? Math.round(totalWins / totalMatches * 1000) / 10 : 0,
      overallWinRateMultiOnly: totalMulti > 0 ? Math.round(totalMultiWins / totalMulti * 1000) / 10 : 0,
      totalMatchesAllModes: totalMatches,
      totalWinsAllModes: totalWins,
      activityHeatmap: heatmapRows.map(r => ({ date: r.date, matchCount: r.count })),
      gameModeDistribution: distribution,
      playingStreak: {
        currentDays: currentStreak,
        longestDays: longestStreak,
        totalActiveDays: allDates.length,
        totalDaysTracked,
      },
      favoriteMode: distribution[0]?.mode ?? null,
      favoriteModeLabel: distribution[0]?.label ?? null,
    }
  } catch (e) {
    console.warn('[Stats] getCrossGameDashboard failed:', e)
    return {
      overallWinRate: 0, overallWinRateMultiOnly: 0, totalMatchesAllModes: 0, totalWinsAllModes: 0,
      activityHeatmap: [], gameModeDistribution: [], playingStreak: { currentDays: 0, longestDays: 0, totalActiveDays: 0, totalDaysTracked: 1 },
      favoriteMode: null, favoriteModeLabel: null,
    }
  }
}

// ============================================================================
// Achievements (TASK 22)
// ============================================================================

export type Achievement = {
  id: string
  title: string
  description: string
  category: 'milestone' | 'rare' | 'skill' | 'cricket' | 'vielseitigkeit'
  unlocked: boolean
  unlockedDate?: string
  value?: number
  target?: number
  progress?: number
}

export async function getFullAchievements(playerId: string): Promise<Achievement[]> {
  try {
    const achievements: Achievement[] = []

    // ===== PARALLELISIERT: Alle unabhängigen Queries gleichzeitig starten =====
    const [totalMatches, rareScores, bestAvg, modesPlayed, streaks, checkoutPct, legStats, cricketStats, cricketSkill, playDates] = await Promise.all([
      // 1. Total Matches (alle Modi)
      queryOne<{ cnt: number }>(`
        SELECT COUNT(*) as cnt FROM (
          SELECT id FROM x01_matches m JOIN x01_match_players mp ON mp.match_id = m.id AND mp.player_id = ? WHERE m.finished = 1
          UNION ALL SELECT id FROM cricket_matches m JOIN cricket_match_players mp ON mp.match_id = m.id AND mp.player_id = ? WHERE m.finished = 1
          UNION ALL SELECT id FROM atb_matches m JOIN atb_match_players mp ON mp.match_id = m.id AND mp.player_id = ? WHERE m.finished = 1
          UNION ALL SELECT id FROM ctf_matches m JOIN ctf_match_players mp ON mp.match_id = m.id AND mp.player_id = ? WHERE m.finished = 1
          UNION ALL SELECT id FROM str_matches m JOIN str_match_players mp ON mp.match_id = m.id AND mp.player_id = ? WHERE m.finished = 1
          UNION ALL SELECT id FROM highscore_matches m JOIN highscore_match_players mp ON mp.match_id = m.id AND mp.player_id = ? WHERE m.finished = 1
          UNION ALL SELECT id FROM shanghai_matches m JOIN shanghai_match_players mp ON mp.match_id = m.id AND mp.player_id = ? WHERE m.finished = 1
          UNION ALL SELECT id FROM killer_matches m JOIN killer_match_players mp ON mp.match_id = m.id AND mp.player_id = ? WHERE m.finished = 1
          UNION ALL SELECT id FROM bobs27_matches m JOIN bobs27_match_players mp ON mp.match_id = m.id AND mp.player_id = ? WHERE m.finished = 1
          UNION ALL SELECT id FROM operation_matches m JOIN operation_match_players mp ON mp.match_id = m.id AND mp.player_id = ? WHERE m.finished = 1
        )
      `, [playerId, playerId, playerId, playerId, playerId, playerId, playerId, playerId, playerId, playerId]).catch(() => null),

      // 2. X01-Scoring-Daten (kombiniert)
      queryOne<{
        count_180: number; count_171: number; count_170_checkout: number
        highest_checkout: number; count_9darter_legs: number
        count_ton: number; count_ton40: number; count_ton80: number; count_60plus: number
        total_darts: number; total_points: number; total_visits: number
        has_bull_finish: number; bust_count: number
      }>(`
        SELECT
          COALESCE(SUM(CASE WHEN (e.data::jsonb->>'visitScore')::integer = 180 THEN 1 ELSE 0 END), 0) as count_180,
          COALESCE(SUM(CASE WHEN (e.data::jsonb->>'visitScore')::integer = 171 THEN 1 ELSE 0 END), 0) as count_171,
          COALESCE(MAX(CASE WHEN e.data::jsonb->>'finishingDartSeq' IS NOT NULL
              THEN (e.data::jsonb->>'remainingBefore')::integer ELSE 0 END), 0) as highest_checkout,
          COALESCE(SUM(CASE WHEN e.data::jsonb->>'finishingDartSeq' IS NOT NULL
              AND (e.data::jsonb->>'remainingBefore')::integer >= 170
              THEN 1 ELSE 0 END), 0) as count_170_checkout,
          0 as count_9darter_legs,
          COALESCE(SUM(CASE WHEN (e.data::jsonb->>'visitScore')::integer >= 100 THEN 1 ELSE 0 END), 0) as count_ton,
          COALESCE(SUM(CASE WHEN (e.data::jsonb->>'visitScore')::integer >= 140 THEN 1 ELSE 0 END), 0) as count_ton40,
          COALESCE(SUM(CASE WHEN (e.data::jsonb->>'visitScore')::integer >= 80 THEN 1 ELSE 0 END), 0) as count_ton80,
          COALESCE(SUM(CASE WHEN (e.data::jsonb->>'visitScore')::integer >= 60 THEN 1 ELSE 0 END), 0) as count_60plus,
          COALESCE(SUM(jsonb_array_length(e.data::jsonb->'darts')), 0) as total_darts,
          COALESCE(SUM((e.data::jsonb->>'visitScore')::integer), 0) as total_points,
          COUNT(*) as total_visits,
          COALESCE(MAX(CASE WHEN e.data::jsonb->>'finishingDartSeq' IS NOT NULL
            AND (e.data::jsonb->>'remainingBefore')::integer = 50
            THEN 1 ELSE 0 END), 0) as has_bull_finish,
          COALESCE(SUM(CASE WHEN e.data::jsonb->>'bust' = 'true' THEN 1 ELSE 0 END), 0) as bust_count
        FROM x01_events e
        JOIN x01_match_players mp ON mp.match_id = e.match_id AND mp.player_id = ?
        JOIN x01_matches m ON m.id = e.match_id AND m.finished = 1
        WHERE e.type = 'VisitAdded'
          AND e.data::jsonb->>'playerId' = ?
      `, [playerId, playerId]).catch(() => null),

      // 3. Best Average
      queryOne<{ best: number }>(`
        SELECT MAX(avg) as best FROM (
          SELECT AVG(
            (e.data::jsonb->>'visitScore')::real /
            NULLIF(jsonb_array_length(e.data::jsonb->'darts'), 0) * 3
          ) as avg
          FROM x01_matches m
          JOIN x01_match_players mp ON mp.match_id = m.id AND mp.player_id = ?
          JOIN x01_events e ON e.match_id = m.id AND e.type = 'VisitAdded' AND e.data::jsonb->>'playerId' = ?
          WHERE m.finished = 1
          GROUP BY m.id
        )
      `, [playerId, playerId]).catch(() => null),

      // 4. Modes Played
      queryOne<{ modes: number }>(`
        SELECT COUNT(DISTINCT mode) as modes FROM (
          SELECT 'x01' as mode FROM x01_matches m JOIN x01_match_players mp ON mp.match_id = m.id AND mp.player_id = ? WHERE m.finished = 1 LIMIT 1
          UNION SELECT 'cricket' FROM cricket_matches m JOIN cricket_match_players mp ON mp.match_id = m.id AND mp.player_id = ? WHERE m.finished = 1 LIMIT 1
          UNION SELECT 'atb' FROM atb_matches m JOIN atb_match_players mp ON mp.match_id = m.id AND mp.player_id = ? WHERE m.finished = 1 LIMIT 1
          UNION SELECT 'ctf' FROM ctf_matches m JOIN ctf_match_players mp ON mp.match_id = m.id AND mp.player_id = ? WHERE m.finished = 1 LIMIT 1
          UNION SELECT 'str' FROM str_matches m JOIN str_match_players mp ON mp.match_id = m.id AND mp.player_id = ? WHERE m.finished = 1 LIMIT 1
          UNION SELECT 'highscore' FROM highscore_matches m JOIN highscore_match_players mp ON mp.match_id = m.id AND mp.player_id = ? WHERE m.finished = 1 LIMIT 1
          UNION SELECT 'shanghai' FROM shanghai_matches m JOIN shanghai_match_players mp ON mp.match_id = m.id AND mp.player_id = ? WHERE m.finished = 1 LIMIT 1
          UNION SELECT 'killer' FROM killer_matches m JOIN killer_match_players mp ON mp.match_id = m.id AND mp.player_id = ? WHERE m.finished = 1 LIMIT 1
          UNION SELECT 'bobs27' FROM bobs27_matches m JOIN bobs27_match_players mp ON mp.match_id = m.id AND mp.player_id = ? WHERE m.finished = 1 LIMIT 1
          UNION SELECT 'operation' FROM operation_matches m JOIN operation_match_players mp ON mp.match_id = m.id AND mp.player_id = ? WHERE m.finished = 1 LIMIT 1
        )
      `, [playerId, playerId, playerId, playerId, playerId, playerId, playerId, playerId, playerId, playerId]).catch(() => null),

      // 5. Player Streaks
      getPlayerStreaks(playerId).catch(() => null),

      // 6. Checkout Percentage
      queryOne<{ best_pct: number }>(`
        SELECT MAX(
          CAST(doubles_hit AS REAL) / NULLIF(double_attempts, 0) * 100
        ) as best_pct
        FROM x01_player_stats
        WHERE player_id = ? AND double_attempts >= 10
      `, [playerId]).catch(() => null),

      // 7. Leg Stats
      queryOne<{ best_leg_darts: number; clean_match_wins: number }>(`
        SELECT
          COALESCE(MIN(darts_in_leg), 999) as best_leg_darts,
          COALESCE((
            SELECT COUNT(*) FROM (
              SELECT mf.match_id
              FROM x01_events mf
              JOIN x01_match_players mfp ON mfp.match_id = mf.match_id AND mfp.player_id = ?
              WHERE mf.type = 'MatchFinished'
                AND mf.data::jsonb->>'winnerPlayerId' = ?
                AND NOT EXISTS (
                  SELECT 1 FROM x01_events be
                  WHERE be.match_id = mf.match_id AND be.type = 'VisitAdded'
                  AND be.data::jsonb->>'playerId' = ?
                  AND be.data::jsonb->>'bust' = 'true'
                )
              GROUP BY mf.match_id
            ) clean_wins
          ), 0) as clean_match_wins
        FROM (
          SELECT e.data::jsonb->>'legId' as leg_id,
            SUM(jsonb_array_length(e.data::jsonb->'darts')) as darts_in_leg
          FROM x01_events e
          JOIN x01_match_players mp ON mp.match_id = e.match_id AND mp.player_id = ?
          JOIN x01_matches m ON m.id = e.match_id AND m.finished = 1 AND m.starting_score >= 501
          JOIN x01_events lf ON lf.match_id = e.match_id AND lf.type = 'LegFinished'
            AND lf.data::jsonb->>'legId' = e.data::jsonb->>'legId'
            AND lf.data::jsonb->>'winnerPlayerId' = ?
          WHERE e.type = 'VisitAdded'
            AND e.data::jsonb->>'playerId' = ?
          GROUP BY leg_id
        )
      `, [playerId, playerId, playerId, playerId, playerId, playerId]).catch(() => null),

      // 8. Cricket Stats
      queryOne<{ matches: number; wins: number; max_marks: number }>(`
        SELECT
          COUNT(DISTINCT m.id) as matches,
          COALESCE((
            SELECT COUNT(*) FROM cricket_events we
            JOIN cricket_match_players wmp ON wmp.match_id = we.match_id AND wmp.player_id = ?
            WHERE we.type = 'CricketMatchFinished'
              AND we.data::jsonb->>'winnerPlayerId' = ?
          ), 0) as wins,
          COALESCE((
            SELECT MAX((ce.data::jsonb->>'marks')::integer)
            FROM cricket_events ce
            JOIN cricket_match_players cmp ON cmp.match_id = ce.match_id AND cmp.player_id = ?
            WHERE ce.type = 'CricketTurnAdded' AND ce.data::jsonb->>'playerId' = ?
          ), 0) as max_marks
        FROM cricket_matches m
        JOIN cricket_match_players mp ON mp.match_id = m.id AND mp.player_id = ?
        WHERE m.finished = 1
      `, [playerId, playerId, playerId, playerId, playerId]).catch(() => null),

      // 9. Cricket Skill Stats
      queryOne<{
        total_triples: number; total_dbulls: number
        best_turn_marks: number; total_marks: number; no_score_turns: number
      }>(`
        SELECT
          COALESCE(SUM(CASE WHEN (d.value->>'mult')::integer = 3 AND d.value->>'target' != 'MISS' THEN 1 ELSE 0 END), 0) as total_triples,
          COALESCE(SUM(CASE WHEN d.value->>'target' = 'BULL' AND (d.value->>'mult')::integer >= 2 THEN 1 ELSE 0 END), 0) as total_dbulls,
          COALESCE(MAX((e.data::jsonb->>'marks')::integer), 0) as best_turn_marks,
          COALESCE(SUM((e.data::jsonb->>'marks')::integer), 0) as total_marks,
          COALESCE(SUM(CASE WHEN (e.data::jsonb->>'marks')::integer = 0 THEN 1 ELSE 0 END), 0) as no_score_turns
        FROM cricket_events e
        JOIN cricket_match_players mp ON mp.match_id = e.match_id AND mp.player_id = ?
        JOIN cricket_matches m ON m.id = e.match_id AND m.finished = 1,
        jsonb_array_elements(e.data::jsonb->'darts') d(value)
        WHERE e.type = 'CricketTurnAdded' AND e.data::jsonb->>'playerId' = ?
      `, [playerId, playerId]).catch(() => null),

      // 10. Play Dates (für Streak)
      query<{ play_date: string }>(`
        SELECT DISTINCT created_at::date as play_date FROM (
          SELECT created_at FROM x01_matches m JOIN x01_match_players mp ON mp.match_id = m.id AND mp.player_id = ? WHERE m.finished = 1
          UNION ALL SELECT created_at FROM cricket_matches m JOIN cricket_match_players mp ON mp.match_id = m.id AND mp.player_id = ? WHERE m.finished = 1
          UNION ALL SELECT created_at FROM atb_matches m JOIN atb_match_players mp ON mp.match_id = m.id AND mp.player_id = ? WHERE m.finished = 1
          UNION ALL SELECT created_at FROM ctf_matches m JOIN ctf_match_players mp ON mp.match_id = m.id AND mp.player_id = ? WHERE m.finished = 1
          UNION ALL SELECT created_at FROM str_matches m JOIN str_match_players mp ON mp.match_id = m.id AND mp.player_id = ? WHERE m.finished = 1
          UNION ALL SELECT created_at FROM highscore_matches m JOIN highscore_match_players mp ON mp.match_id = m.id AND mp.player_id = ? WHERE m.finished = 1
          UNION ALL SELECT created_at FROM shanghai_matches m JOIN shanghai_match_players mp ON mp.match_id = m.id AND mp.player_id = ? WHERE m.finished = 1
          UNION ALL SELECT created_at FROM killer_matches m JOIN killer_match_players mp ON mp.match_id = m.id AND mp.player_id = ? WHERE m.finished = 1
          UNION ALL SELECT created_at FROM bobs27_matches m JOIN bobs27_match_players mp ON mp.match_id = m.id AND mp.player_id = ? WHERE m.finished = 1
          UNION ALL SELECT created_at FROM operation_matches m JOIN operation_match_players mp ON mp.match_id = m.id AND mp.player_id = ? WHERE m.finished = 1
        ) ORDER BY play_date
      `, [playerId, playerId, playerId, playerId, playerId, playerId, playerId, playerId, playerId, playerId]).catch(() => [] as { play_date: string }[]),
    ])

    const total = totalMatches?.cnt ?? 0
    for (const [target, title, desc] of [
      [1, 'Erster Pfeil', 'Erstes Match gespielt'],
      [10, 'Einsteiger', '10 Matches gespielt'],
      [50, 'Stammgast', '50 Matches gespielt'],
      [100, 'Centurion', '100 Matches gespielt'],
      [250, 'Dartomane', '250 Matches gespielt'],
      [500, 'Legende', '500 Matches gespielt'],
      [1000, 'Hall of Famer', '1000 Matches gespielt'],
    ] as [number, string, string][]) {
      achievements.push({
        id: `matches-${target}`, title, description: desc, category: 'milestone',
        unlocked: total >= target, value: total, target, progress: Math.min(1, total / target),
      })
    }

    const c180 = rareScores?.count_180 ?? 0
    achievements.push({
      id: 'first-180', title: 'Maximum!', description: 'Erste 180 geworfen',
      category: 'rare', unlocked: c180 > 0, value: c180, target: 1, progress: Math.min(1, c180),
    })
    for (const [target, title] of [[10, '180-Jäger'], [50, '180-Maschine'], [100, 'Mr. Maximum']] as [number, string][]) {
      achievements.push({
        id: `180s-${target}`, title, description: `${target}x 180 geworfen`,
        category: 'rare', unlocked: c180 >= target, value: c180, target, progress: Math.min(1, c180 / target),
      })
    }

    achievements.push({
      id: '171', title: 'Maximales Chaos', description: '171 geworfen (T20+T19+T18)',
      category: 'rare', unlocked: (rareScores?.count_171 ?? 0) > 0, value: rareScores?.count_171 ?? 0,
    })

    // Scoring-Stufen
    const c60 = rareScores?.count_60plus ?? 0
    achievements.push({
      id: 'first-60', title: 'Erster Sechziger', description: 'Erste Aufnahme mit 60+ Punkten',
      category: 'milestone', unlocked: c60 > 0, value: c60, target: 1, progress: Math.min(1, c60),
    })
    const c80 = rareScores?.count_ton80 ?? 0
    for (const [target, title, desc] of [
      [10, 'Ton-80 Anfänger', '10 Aufnahmen mit 80+'],
      [50, 'Ton-80 Jäger', '50 Aufnahmen mit 80+'],
      [100, 'Ton-80 Maschine', '100 Aufnahmen mit 80+'],
    ] as [number, string, string][]) {
      achievements.push({
        id: `ton80-${target}`, title, description: desc,
        category: 'rare', unlocked: c80 >= target, value: c80, target, progress: Math.min(1, c80 / target),
      })
    }

    // Punkte-Meilensteine
    const tp = rareScores?.total_points ?? 0
    for (const [target, title, desc] of [
      [10000, 'Punktesammler', '10.000 Punkte erzielt'],
      [50000, 'Punktekönig', '50.000 Punkte erzielt'],
      [100000, 'Punkte-Legende', '100.000 Punkte erzielt'],
    ] as [number, string, string][]) {
      achievements.push({
        id: `points-${target}`, title, description: desc,
        category: 'milestone', unlocked: tp >= target, value: tp, target, progress: Math.min(1, tp / target),
      })
    }

    const hc = rareScores?.highest_checkout ?? 0
    achievements.push({
      id: 'checkout-100plus', title: 'Ton-Checkout', description: 'Checkout von 100+ geschafft',
      category: 'skill', unlocked: hc >= 100, value: hc,
    })
    achievements.push({
      id: 'checkout-150plus', title: 'High Flyer', description: 'Checkout von 150+ geschafft',
      category: 'skill', unlocked: hc >= 150, value: hc,
    })
    achievements.push({
      id: 'checkout-170', title: 'Big Fish', description: '170 Checkout (T20-T20-Bull)',
      category: 'skill', unlocked: (rareScores?.count_170_checkout ?? 0) > 0, value: rareScores?.count_170_checkout ?? 0,
    })

    const ba = bestAvg?.best ?? 0
    for (const [target, title, desc] of [
      [40, 'Solide', 'Match-Durchschnitt über 40'],
      [60, 'Stark', 'Match-Durchschnitt über 60'],
      [80, 'Weltklasse', 'Match-Durchschnitt über 80'],
      [100, 'Perfektionist', 'Match-Durchschnitt über 100'],
    ] as [number, string, string][]) {
      achievements.push({
        id: `avg-${target}`, title, description: desc,
        category: 'skill', unlocked: ba >= target, value: Math.round(ba * 10) / 10,
      })
    }

    const mp = modesPlayed?.modes ?? 0
    for (const [target, title, desc] of [
      [3, 'Vielseitig', '3 verschiedene Spielmodi ausprobiert'],
      [5, 'Allrounder', '5 verschiedene Spielmodi ausprobiert'],
      [8, 'Meister aller Klassen', '8 verschiedene Spielmodi ausprobiert'],
      [10, 'Komplettist', 'Alle 10 Spielmodi gespielt'],
    ] as [number, string, string][]) {
      achievements.push({
        id: `modes-${target}`, title, description: desc,
        category: 'vielseitigkeit', unlocked: mp >= target, value: mp, target, progress: Math.min(1, mp / target),
      })
    }

    const longestWin = streaks?.longestWinStreak ?? 0
    for (const [target, title, desc] of [
      [3, 'Heißer Lauf', '3 Siege in Folge'],
      [5, 'Dominanz', '5 Siege in Folge'],
      [10, 'Unaufhaltbar', '10 Siege in Folge'],
    ] as [number, string, string][]) {
      achievements.push({
        id: `streak-${target}`, title, description: desc,
        category: 'skill', unlocked: longestWin >= target, value: longestWin, target, progress: Math.min(1, longestWin / target),
      })
    }

    // ========== NEUE ACHIEVEMENTS: Scoring (Daten aus kombinierter rareScores-Query) ==========
    const cTon = rareScores?.count_ton ?? 0
    achievements.push({
      id: 'first-ton', title: 'Erster Ton', description: 'Erste Aufnahme mit 100+ Punkten',
      category: 'milestone', unlocked: cTon > 0, value: cTon, target: 1, progress: Math.min(1, cTon),
    })
    achievements.push({
      id: 'first-ton40', title: 'Ton-40 Club', description: 'Erste Aufnahme mit 140+ Punkten',
      category: 'milestone', unlocked: (rareScores?.count_ton40 ?? 0) > 0, value: rareScores?.count_ton40 ?? 0, target: 1,
      progress: Math.min(1, (rareScores?.count_ton40 ?? 0)),
    })

    const td = rareScores?.total_darts ?? 0
    for (const [target, title, desc] of [
      [1000, 'Dart-Lehrling', '1.000 Darts geworfen'],
      [5000, 'Dart-Geselle', '5.000 Darts geworfen'],
      [10000, 'Dart-Marathon', '10.000 Darts geworfen'],
    ] as [number, string, string][]) {
      achievements.push({
        id: `darts-${target}`, title, description: desc,
        category: 'milestone', unlocked: td >= target, value: td, target, progress: Math.min(1, td / target),
      })
    }

    // ========== NEUE ACHIEVEMENTS: Finishing ==========
    achievements.push({
      id: 'bull-finish', title: "Bull's Eye Finish", description: 'Leg mit Bull (50) ausgecheckt',
      category: 'skill', unlocked: (rareScores?.has_bull_finish ?? 0) > 0,
    })

    const bestPct = checkoutPct?.best_pct ?? 0

    const bestLeg = legStats?.best_leg_darts ?? 999
    achievements.push({
      id: 'leg-under-21', title: 'Schnelles 501', description: '501-Leg in unter 21 Darts gewonnen',
      category: 'skill', unlocked: bestLeg <= 21, value: bestLeg < 999 ? bestLeg : undefined,
    })
    achievements.push({
      id: 'leg-under-18', title: 'Blitz-501', description: '501-Leg in unter 18 Darts gewonnen',
      category: 'skill', unlocked: bestLeg <= 18, value: bestLeg < 999 ? bestLeg : undefined,
    })
    achievements.push({
      id: 'leg-under-15', title: 'Eiskalt', description: '501-Leg in unter 15 Darts gewonnen',
      category: 'rare', unlocked: bestLeg <= 15, value: bestLeg < 999 ? bestLeg : undefined,
    })
    achievements.push({
      id: 'nine-darter', title: '9-Darter!', description: '501-Leg in 9 Darts gewonnen — Perfektion!',
      category: 'rare', unlocked: bestLeg <= 9, value: bestLeg <= 9 ? bestLeg : undefined,
    })
    achievements.push({
      id: 'clean-match', title: 'Sauberes Match', description: 'Match gewonnen ohne einen Bust',
      category: 'skill', unlocked: (legStats?.clean_match_wins ?? 0) > 0,
    })

    achievements.push({
      id: 'checkout-specialist', title: 'Doppel-Spezialist', description: 'Checkout-Quote über 40%',
      category: 'skill', unlocked: bestPct >= 40, value: Math.round(bestPct * 10) / 10,
    })

    // ========== NEUE ACHIEVEMENTS: Cricket ==========
    const cm = cricketStats?.matches ?? 0
    achievements.push({
      id: 'cricket-first', title: 'Cricket Opener', description: 'Erstes Cricket-Match gespielt',
      category: 'cricket', unlocked: cm > 0, value: cm, target: 1, progress: Math.min(1, cm),
    })
    achievements.push({
      id: 'mark-machine', title: 'Mark Machine', description: '9 Marks in einer Runde (3× Triple)',
      category: 'cricket', unlocked: (cricketStats?.max_marks ?? 0) >= 9, value: cricketStats?.max_marks ?? 0, target: 9,
      progress: Math.min(1, (cricketStats?.max_marks ?? 0) / 9),
    })
    const cw = cricketStats?.wins ?? 0
    for (const [target, title, desc] of [
      [10, 'Cricket-Profi', '10 Cricket-Matches gewonnen'],
      [25, 'Cricket-Ass', '25 Cricket-Matches gewonnen'],
      [50, 'Cricket-Meister', '50 Cricket-Matches gewonnen'],
    ] as [number, string, string][]) {
      achievements.push({
        id: `cricket-wins-${target}`, title, description: desc,
        category: 'cricket', unlocked: cw >= target, value: cw, target, progress: Math.min(1, cw / target),
      })
    }

    // Weitere Cricket-Achievements
    achievements.push({
      id: 'cricket-veteran', title: 'Cricket-Veteran', description: '100 Cricket-Matches gespielt',
      category: 'cricket', unlocked: cm >= 100, value: cm, target: 100, progress: Math.min(1, cm / 100),
    })

    const cTriples = cricketSkill?.total_triples ?? 0
    for (const [target, title, desc] of [
      [25, 'Triple-Treffer', '25 Triples im Cricket'],
      [100, 'Triple-Jäger', '100 Triples im Cricket'],
      [250, 'Triple-Maschine', '250 Triples im Cricket'],
    ] as [number, string, string][]) {
      achievements.push({
        id: `cricket-triples-${target}`, title, description: desc,
        category: 'cricket', unlocked: cTriples >= target, value: cTriples, target, progress: Math.min(1, cTriples / target),
      })
    }

    const cDBulls = cricketSkill?.total_dbulls ?? 0
    for (const [target, title, desc] of [
      [5, 'Bull-Treffer', '5 Double-Bulls im Cricket'],
      [25, 'Bull-Meister', '25 Double-Bulls im Cricket'],
    ] as [number, string, string][]) {
      achievements.push({
        id: `cricket-dbulls-${target}`, title, description: desc,
        category: 'cricket', unlocked: cDBulls >= target, value: cDBulls, target, progress: Math.min(1, cDBulls / target),
      })
    }

    // Cricket: Marks-Meilensteine
    const cMarks = cricketSkill?.total_marks ?? 0
    for (const [target, title, desc] of [
      [100, 'Mark-Sammler', '100 Marks im Cricket insgesamt'],
      [500, 'Mark-König', '500 Marks im Cricket insgesamt'],
      [1000, 'Mark-Legende', '1.000 Marks im Cricket insgesamt'],
    ] as [number, string, string][]) {
      achievements.push({
        id: `cricket-marks-${target}`, title, description: desc,
        category: 'cricket', unlocked: cMarks >= target, value: cMarks, target, progress: Math.min(1, cMarks / target),
      })
    }

    // Cricket: Perfekter Turn (9 Marks = 3 Triples)
    const bestTurn = cricketSkill?.best_turn_marks ?? 0
    achievements.push({
      id: 'cricket-perfect-turn', title: 'Perfekter Turn', description: 'Cricket-Runde mit 9 Marks (3x Triple)',
      category: 'cricket', unlocked: bestTurn >= 9, value: bestTurn, target: 9, progress: Math.min(1, bestTurn / 9),
    })

    // ========== NEUE ACHIEVEMENTS: Vielseitigkeit (+ umkategorisierte Modi) ==========
    // Wochenkrieger: 7 Tage in Folge gespielt
    let longestDayStreak = 0
    let currentDayStreak = 1
    const dates = playDates.map(r => r.play_date).filter(Boolean)
    for (let i = 1; i < dates.length; i++) {
      const prev = new Date(dates[i - 1])
      const curr = new Date(dates[i])
      const diffDays = Math.round((curr.getTime() - prev.getTime()) / 86400000)
      if (diffDays === 1) {
        currentDayStreak++
      } else {
        longestDayStreak = Math.max(longestDayStreak, currentDayStreak)
        currentDayStreak = 1
      }
    }
    longestDayStreak = Math.max(longestDayStreak, currentDayStreak)

    achievements.push({
      id: 'week-warrior', title: 'Wochenkrieger', description: '7 Tage in Folge gespielt',
      category: 'vielseitigkeit', unlocked: longestDayStreak >= 7, value: longestDayStreak, target: 7,
      progress: Math.min(1, longestDayStreak / 7),
    })

    // Mode-spezifische Achievements (parallelisiert)
    const [shanghaiHit, atbBest, bobsSurvived, strWon, killerElim, shanghaiScore, killerWon, ctfFields, atbCompleted, operationBestLeg] = await Promise.all([
      queryOne<{ cnt: number }>(`
        SELECT COUNT(*) as cnt FROM shanghai_events e
        JOIN shanghai_match_players mp ON mp.match_id = e.match_id AND mp.player_id = ?
        WHERE e.type = 'ShanghaiTurnAdded'
          AND e.data::jsonb->>'playerId' = ?
          AND (e.data::jsonb->>'isShanghai')::integer = 1
      `, [playerId, playerId]).catch(() => null),
      queryOne<{ best: number }>(`
        SELECT MIN(winner_darts) as best FROM atb_matches m
        JOIN atb_match_players mp ON mp.match_id = m.id AND mp.player_id = ?
        WHERE m.finished = 1 AND m.winner_id = ?
      `, [playerId, playerId]).catch(() => null),
      queryOne<{ cnt: number }>(`
        SELECT COUNT(*) as cnt FROM bobs27_matches m
        JOIN bobs27_match_players mp ON mp.match_id = m.id AND mp.player_id = ?
        WHERE m.finished = 1 AND m.final_scores IS NOT NULL
          AND (m.final_scores::jsonb->>?)::integer > 0
      `, [playerId, playerId]).catch(() => null),
      queryOne<{ cnt: number }>(`
        SELECT COUNT(*) as cnt FROM str_matches m
        JOIN str_match_players mp ON mp.match_id = m.id AND mp.player_id = ?
        WHERE m.finished = 1 AND m.winner_id = ?
      `, [playerId, playerId]).catch(() => null),
      queryOne<{ cnt: number }>(`
        SELECT COUNT(*) as cnt FROM killer_events e
        JOIN killer_match_players mp ON mp.match_id = e.match_id AND mp.player_id = ?
        WHERE e.type = 'KillerTurnAdded'
          AND e.data::jsonb->>'eliminatedPlayerId' IS NOT NULL
          AND e.data::jsonb->>'playerId' = ?
      `, [playerId, playerId]).catch(() => null),
      // Shanghai: Bester Score
      queryOne<{ best: number }>(`
        SELECT MAX((m.final_scores::jsonb->>?)::integer) as best
        FROM shanghai_matches m JOIN shanghai_match_players mp ON mp.match_id = m.id AND mp.player_id = ?
        WHERE m.finished = 1 AND m.final_scores IS NOT NULL
      `, [playerId, playerId]).catch(() => null),
      // Killer: Match gewonnen
      queryOne<{ cnt: number }>(`
        SELECT COUNT(*) as cnt FROM killer_matches m
        JOIN killer_match_players mp ON mp.match_id = m.id AND mp.player_id = ?
        WHERE m.finished = 1 AND m.winner_id = ?
      `, [playerId, playerId]).catch(() => null),
      // CTF: Felder gewonnen (aus capture_field_winners)
      queryOne<{ best_fields: number }>(`
        SELECT MAX((m.capture_field_winners::jsonb->>?)::integer) as best_fields
        FROM ctf_matches m JOIN ctf_match_players mp ON mp.match_id = m.id AND mp.player_id = ?
        WHERE m.finished = 1 AND m.capture_field_winners IS NOT NULL
      `, [playerId, playerId]).catch(() => null),
      // ATB: Matches abgeschlossen (zählt als Training)
      queryOne<{ cnt: number }>(`
        SELECT COUNT(*) as cnt FROM atb_matches m
        JOIN atb_match_players mp ON mp.match_id = m.id AND mp.player_id = ?
        WHERE m.finished = 1
      `, [playerId]).catch(() => null),
      // Operation: Bester Leg-Score
      queryOne<{ best: number }>(`
        SELECT MAX((m.final_scores::jsonb->>?)::integer) as best
        FROM operation_matches m JOIN operation_match_players mp ON mp.match_id = m.id AND mp.player_id = ?
        WHERE m.finished = 1 AND m.final_scores IS NOT NULL
      `, [playerId, playerId]).catch(() => null),
    ])

    achievements.push({
      id: 'shanghai-hit', title: 'Shanghai!', description: 'Single + Double + Triple auf eine Zahl',
      category: 'vielseitigkeit', unlocked: (shanghaiHit?.cnt ?? 0) > 0,
    })
    // Shanghai Score-Stufen
    const shBest = shanghaiScore?.best ?? 0
    for (const [target, title, desc] of [
      [200, 'Shanghai-Punktesammler', 'Shanghai: 200+ Punkte in einem Match'],
      [400, 'Shanghai-Meister', 'Shanghai: 400+ Punkte in einem Match'],
    ] as [number, string, string][]) {
      achievements.push({
        id: `shanghai-score-${target}`, title, description: desc,
        category: 'vielseitigkeit', unlocked: shBest >= target, value: shBest > 0 ? shBest : undefined, target,
        progress: Math.min(1, Math.max(0, shBest) / target),
      })
    }

    const atbDarts = atbBest?.best ?? 999
    achievements.push({
      id: 'atb-speedrun', title: 'ATB Speedrun', description: 'Around the Block in unter 60 Darts',
      category: 'vielseitigkeit', unlocked: atbDarts < 60 && atbDarts > 0, value: atbDarts > 0 && atbDarts < 999 ? atbDarts : undefined,
    })
    achievements.push({
      id: 'bobs27-survived', title: "Bob überlebt", description: "Bob's 27 mit positivem Score beendet",
      category: 'vielseitigkeit', unlocked: (bobsSurvived?.cnt ?? 0) > 0,
    })
    achievements.push({
      id: 'str-complete', title: 'Sträußchen komplett', description: 'Ein Sträußchen gewonnen',
      category: 'vielseitigkeit', unlocked: (strWon?.cnt ?? 0) > 0,
    })
    achievements.push({
      id: 'killer-instinct', title: 'Killer-Instinkt', description: 'Einen Spieler im Killer-Modus eliminiert',
      category: 'vielseitigkeit', unlocked: (killerElim?.cnt ?? 0) > 0,
    })

    // Killer Siege
    const kw = killerWon?.cnt ?? 0
    achievements.push({
      id: 'killer-survivor', title: 'Letzter Überlebender', description: 'Ein Killer-Match gewonnen',
      category: 'vielseitigkeit', unlocked: kw > 0,
    })
    achievements.push({
      id: 'killer-5-wins', title: 'Killer-Veteran', description: '5 Killer-Matches gewonnen',
      category: 'vielseitigkeit', unlocked: kw >= 5, value: kw, target: 5, progress: Math.min(1, kw / 5),
    })

    // CTF Feld-Dominanz
    const ctfBest = ctfFields?.best_fields ?? 0
    achievements.push({
      id: 'ctf-dominator', title: 'Feld-Eroberer', description: 'CTF: 10+ Felder in einem Match gewonnen',
      category: 'vielseitigkeit', unlocked: ctfBest >= 10, value: ctfBest > 0 ? ctfBest : undefined, target: 10,
      progress: Math.min(1, ctfBest / 10),
    })
    achievements.push({
      id: 'ctf-sweep', title: 'Totale Kontrolle', description: 'CTF: 15+ Felder in einem Match gewonnen',
      category: 'vielseitigkeit', unlocked: ctfBest >= 15, value: ctfBest > 0 ? ctfBest : undefined, target: 15,
      progress: Math.min(1, ctfBest / 15),
    })

    // ATB Trainings-Meilensteine
    const atbTotal = atbCompleted?.cnt ?? 0
    for (const [target, title, desc] of [
      [5, 'Board-Kenner', '5 Around-the-Block Runden absolviert'],
      [20, 'Board-Profi', '20 Around-the-Block Runden absolviert'],
      [50, 'Board-Meister', '50 Around-the-Block Runden absolviert'],
    ] as [number, string, string][]) {
      achievements.push({
        id: `atb-completed-${target}`, title, description: desc,
        category: 'vielseitigkeit', unlocked: atbTotal >= target, value: atbTotal, target, progress: Math.min(1, atbTotal / target),
      })
    }

    // Operation Punkterekorde
    const opBest = operationBestLeg?.best ?? 0
    achievements.push({
      id: 'operation-score-100', title: 'Operation gelungen', description: 'Operation: 100+ Punkte in einem Match',
      category: 'vielseitigkeit', unlocked: opBest >= 100, value: opBest > 0 ? opBest : undefined,
    })
    achievements.push({
      id: 'operation-score-200', title: 'Chirurgische Präzision', description: 'Operation: 200+ Punkte in einem Match',
      category: 'vielseitigkeit', unlocked: opBest >= 200, value: opBest > 0 ? opBest : undefined,
    })

    // ========== TREFFER-SERIEN (Konsekutive Treffer bei Ziel-Spielen) ==========
    const [opHits, atbHits, bobsHits] = await Promise.all([
      // Operation: Alle Darts mit isHit pro Match, sortiert
      query<{ match_id: string; is_hit: number }>(`
        SELECT e.match_id, (e.data::jsonb->>'isHit')::integer as is_hit
        FROM operation_events e
        JOIN operation_match_players mp ON mp.match_id = e.match_id AND mp.player_id = ?
        JOIN operation_matches m ON m.id = e.match_id AND m.finished = 1
        WHERE e.type = 'OperationDart' AND e.data::jsonb->>'playerId' = ?
        ORDER BY e.match_id, e.seq
      `, [playerId, playerId]).catch(() => []),
      // ATB: Treffer pro Turn (hits > 0 = getroffen)
      query<{ match_id: string; hits: number }>(`
        SELECT e.match_id, (e.data::jsonb->>'hits')::integer as hits
        FROM atb_events e
        JOIN atb_match_players mp ON mp.match_id = e.match_id AND mp.player_id = ?
        JOIN atb_matches m ON m.id = e.match_id AND m.finished = 1
        WHERE e.type = 'ATBTurnAdded' AND e.data::jsonb->>'playerId' = ?
        ORDER BY e.match_id, e.seq
      `, [playerId, playerId]).catch(() => []),
      // Bob's 27: Treffer pro Runde (hits > 0 = Double getroffen)
      query<{ match_id: string; hits: number }>(`
        SELECT e.match_id, (e.data::jsonb->>'hits')::integer as hits
        FROM bobs27_events e
        JOIN bobs27_match_players mp ON mp.match_id = e.match_id AND mp.player_id = ?
        JOIN bobs27_matches m ON m.id = e.match_id AND m.finished = 1
        WHERE e.type = 'Bobs27RoundPlayed' AND e.data::jsonb->>'playerId' = ?
        ORDER BY e.match_id, e.seq
      `, [playerId, playerId]).catch(() => []),
    ])

    // Längste Serie berechnen (Reset bei Match-Wechsel oder Miss)
    function longestStreak(data: { match_id: string; hits?: number; is_hit?: number }[]): number {
      let best = 0, cur = 0, lastMatch = ''
      for (const row of data) {
        const hit = (row.is_hit ?? (row.hits != null && row.hits > 0 ? 1 : 0)) > 0
        if (row.match_id !== lastMatch) { cur = 0; lastMatch = row.match_id }
        if (hit) { cur++; best = Math.max(best, cur) } else { cur = 0 }
      }
      return best
    }

    const opStreak = longestStreak(opHits)
    for (const [target, title, desc] of [
      [5, 'Fokussiert', 'Operation: 5 Darts in Folge getroffen'],
      [10, 'Laser-Fokus', 'Operation: 10 Darts in Folge getroffen'],
      [15, 'Unfehlbar', 'Operation: 15 Darts in Folge getroffen'],
    ] as [number, string, string][]) {
      achievements.push({
        id: `op-streak-${target}`, title, description: desc,
        category: 'skill', unlocked: opStreak >= target, value: opStreak, target, progress: Math.min(1, opStreak / target),
      })
    }

    const atbStreak = longestStreak(atbHits)
    for (const [target, title, desc] of [
      [5, 'Treffsicher', 'ATB: 5 Zahlen in Folge getroffen'],
      [10, 'Scharfschütze', 'ATB: 10 Zahlen in Folge getroffen'],
      [15, 'Perfekter Lauf', 'ATB: 15 Zahlen in Folge getroffen'],
    ] as [number, string, string][]) {
      achievements.push({
        id: `atb-streak-${target}`, title, description: desc,
        category: 'skill', unlocked: atbStreak >= target, value: atbStreak, target, progress: Math.min(1, atbStreak / target),
      })
    }

    const bobsStreak = longestStreak(bobsHits)
    for (const [target, title, desc] of [
      [5, 'Double-Serie', "Bob's 27: 5 Doubles in Folge getroffen"],
      [10, 'Double-Profi', "Bob's 27: 10 Doubles in Folge getroffen"],
      [15, 'Double-Perfektion', "Bob's 27: 15 Doubles in Folge getroffen"],
    ] as [number, string, string][]) {
      achievements.push({
        id: `bobs-streak-${target}`, title, description: desc,
        category: 'skill', unlocked: bobsStreak >= target, value: bobsStreak, target, progress: Math.min(1, bobsStreak / target),
      })
    }

    // ========== FUN & TIME ACHIEVEMENTS ==========
    const [timeStats, rivalStats, bobsHighScores, highscoreWins] = await Promise.all([
      // Spiel-Zeiten und Tages-Statistiken
      queryOne<{ night_games: number; early_games: number; day_max: number }>(`
        SELECT
          COALESCE(SUM(CASE WHEN EXTRACT(HOUR FROM created_at::timestamp)::integer >= 22 THEN 1 ELSE 0 END), 0) as night_games,
          COALESCE(SUM(CASE WHEN EXTRACT(HOUR FROM created_at::timestamp)::integer < 8 THEN 1 ELSE 0 END), 0) as early_games,
          COALESCE(MAX(day_count), 0) as day_max
        FROM (
          SELECT created_at, COUNT(*) OVER (PARTITION BY DATE(created_at)) as day_count
          FROM (
            SELECT created_at FROM x01_matches m JOIN x01_match_players mp ON mp.match_id = m.id AND mp.player_id = ? WHERE m.finished = 1
            UNION ALL SELECT created_at FROM cricket_matches m JOIN cricket_match_players mp ON mp.match_id = m.id AND mp.player_id = ? WHERE m.finished = 1
            UNION ALL SELECT created_at FROM atb_matches m JOIN atb_match_players mp ON mp.match_id = m.id AND mp.player_id = ? WHERE m.finished = 1
          )
        )
      `, [playerId, playerId, playerId]).catch(() => null),
      // Rivale: Meistgespielter Gegner
      queryOne<{ max_matches: number }>(`
        SELECT MAX(cnt) as max_matches FROM (
          SELECT mp2.player_id, COUNT(*) as cnt
          FROM x01_match_players mp1
          JOIN x01_match_players mp2 ON mp2.match_id = mp1.match_id AND mp2.player_id != mp1.player_id
          JOIN x01_matches m ON m.id = mp1.match_id AND m.finished = 1
          WHERE mp1.player_id = ?
          GROUP BY mp2.player_id
        )
      `, [playerId]).catch(() => null),
      // Bob's 27 Highscores
      queryOne<{ best_score: number }>(`
        SELECT MAX((m.final_scores::jsonb->>?)::integer) as best_score
        FROM bobs27_matches m
        JOIN bobs27_match_players mp ON mp.match_id = m.id AND mp.player_id = ?
        WHERE m.finished = 1 AND m.final_scores IS NOT NULL
      `, [playerId, playerId]).catch(() => null),
      // Highscore-Siege
      queryOne<{ cnt: number }>(`
        SELECT COUNT(*) as cnt FROM highscore_matches m
        JOIN highscore_match_players mp ON mp.match_id = m.id AND mp.player_id = ?
        WHERE m.finished = 1 AND m.winner_id = ?
      `, [playerId, playerId]).catch(() => null),
    ])

    achievements.push({
      id: 'night-owl', title: 'Nachteulen-Dart', description: 'Ein Match nach 22 Uhr gespielt',
      category: 'vielseitigkeit', unlocked: (timeStats?.night_games ?? 0) > 0,
    })
    achievements.push({
      id: 'early-bird', title: 'Frühaufsteher', description: 'Ein Match vor 8 Uhr morgens gespielt',
      category: 'vielseitigkeit', unlocked: (timeStats?.early_games ?? 0) > 0,
    })
    achievements.push({
      id: 'day-grinder', title: 'Tagesmarathon', description: '10+ Matches an einem Tag gespielt',
      category: 'vielseitigkeit', unlocked: (timeStats?.day_max ?? 0) >= 10,
      value: timeStats?.day_max ?? 0, target: 10, progress: Math.min(1, (timeStats?.day_max ?? 0) / 10),
    })

    const rivalMax = rivalStats?.max_matches ?? 0
    for (const [target, title, desc] of [
      [10, 'Rivale', '10 Matches gegen denselben Gegner'],
      [25, 'Erzrivale', '25 Matches gegen denselben Gegner'],
      [50, 'Nemesis', '50 Matches gegen denselben Gegner'],
    ] as [number, string, string][]) {
      achievements.push({
        id: `rival-${target}`, title, description: desc,
        category: 'vielseitigkeit', unlocked: rivalMax >= target, value: rivalMax, target, progress: Math.min(1, rivalMax / target),
      })
    }

    // Bob's 27 Score-Stufen
    const bobsBest = bobsHighScores?.best_score ?? 0
    for (const [target, title, desc] of [
      [200, "Bob's Lehrling", "Bob's 27 mit über 200 Punkten"],
      [400, "Bob's Geselle", "Bob's 27 mit über 400 Punkten"],
      [600, "Bob's Meister", "Bob's 27 mit über 600 Punkten"],
    ] as [number, string, string][]) {
      achievements.push({
        id: `bobs27-${target}`, title, description: desc,
        category: 'vielseitigkeit', unlocked: bobsBest >= target, value: bobsBest > 0 ? bobsBest : undefined, target,
        progress: Math.min(1, Math.max(0, bobsBest) / target),
      })
    }

    // Highscore-Siege
    const hsWins = highscoreWins?.cnt ?? 0
    achievements.push({
      id: 'highscore-winner', title: 'Highscore-König', description: '3 Highscore-Matches gewonnen',
      category: 'vielseitigkeit', unlocked: hsWins >= 3, value: hsWins, target: 3, progress: Math.min(1, hsWins / 3),
    })

    // X01 Gesamt-Siege
    const x01Wins = await queryOne<{ cnt: number }>(`
      SELECT COUNT(*) as cnt FROM x01_events e
      JOIN x01_match_players mp ON mp.match_id = e.match_id AND mp.player_id = ?
      WHERE e.type = 'MatchFinished' AND e.data::jsonb->>'winnerPlayerId' = ?
    `, [playerId, playerId]).catch(() => null)
    const xw = x01Wins?.cnt ?? 0
    for (const [target, title, desc] of [
      [10, 'X01-Gewinner', '10 X01-Matches gewonnen'],
      [50, 'X01-Champion', '50 X01-Matches gewonnen'],
      [100, 'X01-Legende', '100 X01-Matches gewonnen'],
    ] as [number, string, string][]) {
      achievements.push({
        id: `x01-wins-${target}`, title, description: desc,
        category: 'skill', unlocked: xw >= target, value: xw, target, progress: Math.min(1, xw / target),
      })
    }

    // ========== CHECKOUT-VIELFALT & X01-SPEZIFISCH ==========
    const [doubleVariety, t20count, legsWonTotal, allBeaten] = await Promise.all([
      // Verschiedene Doppelfelder zum Auschecken verwendet
      queryOne<{ distinct_doubles: number }>(`
        SELECT COUNT(DISTINCT double_field) as distinct_doubles
        FROM x01_finishing_doubles WHERE player_id = ? AND count > 0
      `, [playerId]).catch(() => null),
      // T20-Treffer in einem Match
      queryOne<{ max_t20: number }>(`
        SELECT MAX(t20_count) as max_t20 FROM (
          SELECT e.match_id, COUNT(*) as t20_count
          FROM x01_events e
          JOIN x01_match_players mp ON mp.match_id = e.match_id AND mp.player_id = ?
          JOIN x01_matches m ON m.id = e.match_id AND m.finished = 1
          WHERE e.type = 'VisitAdded' AND e.data::jsonb->>'playerId' = ?
            AND EXISTS (
              SELECT 1 FROM jsonb_array_elements(e.data::jsonb->'darts') d(value)
              WHERE (d.value->>'bed')::integer = 20 AND (d.value->>'mult')::integer = 3
            )
          GROUP BY e.match_id
        )
      `, [playerId, playerId]).catch(() => null),
      // Gesamt Legs gewonnen (X01)
      queryOne<{ cnt: number }>(`
        SELECT COUNT(*) as cnt FROM x01_events e
        JOIN x01_match_players mp ON mp.match_id = e.match_id AND mp.player_id = ?
        WHERE e.type = 'LegFinished' AND e.data::jsonb->>'winnerPlayerId' = ?
      `, [playerId, playerId]).catch(() => null),
      // Gegen alle registrierten Spieler mindestens 1x gewonnen
      queryOne<{ opponents_beaten: number; total_opponents: number }>(`
        SELECT
          COUNT(DISTINCT beaten) as opponents_beaten,
          (SELECT COUNT(DISTINCT mp2.player_id) FROM x01_match_players mp2
           JOIN x01_matches m2 ON m2.id = mp2.match_id AND m2.finished = 1
           WHERE mp2.player_id != ? AND mp2.player_id NOT LIKE 'guest-%'
             AND EXISTS (SELECT 1 FROM x01_match_players mp3 WHERE mp3.match_id = mp2.match_id AND mp3.player_id = ?)
          ) as total_opponents
        FROM (
          SELECT DISTINCT mp2.player_id as beaten
          FROM x01_events e
          JOIN x01_match_players mp1 ON mp1.match_id = e.match_id AND mp1.player_id = ?
          JOIN x01_match_players mp2 ON mp2.match_id = e.match_id AND mp2.player_id != ?
            AND mp2.player_id NOT LIKE 'guest-%'
          WHERE e.type = 'MatchFinished' AND e.data::jsonb->>'winnerPlayerId' = ?
        )
      `, [playerId, playerId, playerId, playerId, playerId]).catch(() => null),
    ])

    const dd = doubleVariety?.distinct_doubles ?? 0
    for (const [target, title, desc] of [
      [5, 'Doppel-Sammler', 'Mit 5 verschiedenen Doppeln ausgecheckt'],
      [10, 'Doppel-Experte', 'Mit 10 verschiedenen Doppeln ausgecheckt'],
      [15, 'Doppel-Virtuose', 'Mit 15 verschiedenen Doppeln ausgecheckt'],
    ] as [number, string, string][]) {
      achievements.push({
        id: `double-variety-${target}`, title, description: desc,
        category: 'skill', unlocked: dd >= target, value: dd, target, progress: Math.min(1, dd / target),
      })
    }

    achievements.push({
      id: 't20-magnet', title: 'T20-Magnet', description: '20x Triple-20 in einem Match getroffen',
      category: 'rare', unlocked: (t20count?.max_t20 ?? 0) >= 20, value: t20count?.max_t20 ?? 0, target: 20,
      progress: Math.min(1, (t20count?.max_t20 ?? 0) / 20),
    })

    const lw = legsWonTotal?.cnt ?? 0
    for (const [target, title, desc] of [
      [10, 'Leg-Gewinner', '10 Legs gewonnen (X01)'],
      [50, 'Leg-Sammler', '50 Legs gewonnen (X01)'],
      [100, 'Leg-Jäger', '100 Legs gewonnen (X01)'],
      [500, 'Leg-Maschine', '500 Legs gewonnen (X01)'],
    ] as [number, string, string][]) {
      achievements.push({
        id: `legs-won-${target}`, title, description: desc,
        category: 'milestone', unlocked: lw >= target, value: lw, target, progress: Math.min(1, lw / target),
      })
    }

    // Alle Gegner geschlagen
    const beaten = allBeaten?.opponents_beaten ?? 0
    const totalOpp = allBeaten?.total_opponents ?? 0
    if (totalOpp > 0) {
      achievements.push({
        id: 'all-beaten', title: 'Alle geschlagen', description: 'Gegen jeden Gegner mindestens 1x gewonnen',
        category: 'skill', unlocked: beaten >= totalOpp && totalOpp >= 2, value: beaten, target: totalOpp,
        progress: totalOpp > 0 ? Math.min(1, beaten / totalOpp) : 0,
      })
    }

    // ========== CHECKOUT-STUFEN ==========
    const checkoutsOver80 = await queryOne<{ cnt: number }>(`
      SELECT COUNT(*) as cnt FROM x01_events e
      JOIN x01_match_players mp ON mp.match_id = e.match_id AND mp.player_id = ?
      WHERE e.type = 'VisitAdded' AND e.data::jsonb->>'playerId' = ?
        AND e.data::jsonb->>'finishingDartSeq' IS NOT NULL
        AND (e.data::jsonb->>'remainingBefore')::integer >= 80
    `, [playerId, playerId]).catch(() => null)
    const co80 = checkoutsOver80?.cnt ?? 0
    for (const [target, title, desc] of [
      [1, 'High Finish', 'Erster Checkout über 80'],
      [5, 'Finisher', '5 Checkouts über 80'],
      [20, 'Checkout-Künstler', '20 Checkouts über 80'],
    ] as [number, string, string][]) {
      achievements.push({
        id: `checkout80-${target}`, title, description: desc,
        category: 'skill', unlocked: co80 >= target, value: co80, target, progress: Math.min(1, co80 / target),
      })
    }

    // ========== MULTI-MODE SIEGE ==========
    const [atbWins, ctfWins, shanghaiWins, killerWins, strWins2, operationWins] = await Promise.all([
      queryOne<{ cnt: number }>(`SELECT COUNT(*) as cnt FROM atb_matches m JOIN atb_match_players mp ON mp.match_id = m.id AND mp.player_id = ? WHERE m.finished = 1 AND m.winner_id = ?`, [playerId, playerId]).catch(() => null),
      queryOne<{ cnt: number }>(`SELECT COUNT(*) as cnt FROM ctf_matches m JOIN ctf_match_players mp ON mp.match_id = m.id AND mp.player_id = ? WHERE m.finished = 1 AND m.winner_id = ?`, [playerId, playerId]).catch(() => null),
      queryOne<{ cnt: number }>(`SELECT COUNT(*) as cnt FROM shanghai_matches m JOIN shanghai_match_players mp ON mp.match_id = m.id AND mp.player_id = ? WHERE m.finished = 1 AND m.winner_id = ?`, [playerId, playerId]).catch(() => null),
      queryOne<{ cnt: number }>(`SELECT COUNT(*) as cnt FROM killer_matches m JOIN killer_match_players mp ON mp.match_id = m.id AND mp.player_id = ? WHERE m.finished = 1 AND m.winner_id = ?`, [playerId, playerId]).catch(() => null),
      queryOne<{ cnt: number }>(`SELECT COUNT(*) as cnt FROM str_matches m JOIN str_match_players mp ON mp.match_id = m.id AND mp.player_id = ? WHERE m.finished = 1 AND m.winner_id = ?`, [playerId, playerId]).catch(() => null),
      queryOne<{ cnt: number }>(`SELECT COUNT(*) as cnt FROM operation_matches m JOIN operation_match_players mp ON mp.match_id = m.id AND mp.player_id = ? WHERE m.finished = 1 AND m.winner_id = ?`, [playerId, playerId]).catch(() => null),
    ])

    // Siege-Meilensteine pro Modus (nur wenn Modus gespielt)
    const modeWins: [string, string, number | undefined][] = [
      ['atb', 'Around the Block', atbWins?.cnt],
      ['ctf', 'Capture the Field', ctfWins?.cnt],
      ['shanghai', 'Shanghai', shanghaiWins?.cnt],
      ['killer', 'Killer', killerWins?.cnt],
      ['str', 'Sträußchen', strWins2?.cnt],
      ['operation', 'Operation', operationWins?.cnt],
    ]
    for (const [mode, label, wins] of modeWins) {
      const w = wins ?? 0
      if (w > 0 || total > 0) { // Nur zeigen wenn irgendein Match gespielt
        achievements.push({
          id: `${mode}-wins-5`, title: `${label}-Profi`, description: `5 ${label}-Matches gewonnen`,
          category: 'vielseitigkeit', unlocked: w >= 5, value: w, target: 5, progress: Math.min(1, w / 5),
        })
      }
    }

    // ========== ÜBERGREIFENDE SIEGE ==========
    const totalWins = xw + (cw) + (atbWins?.cnt ?? 0) + (ctfWins?.cnt ?? 0) + (shanghaiWins?.cnt ?? 0) + (killerWins?.cnt ?? 0) + (strWins2?.cnt ?? 0) + (operationWins?.cnt ?? 0) + hsWins
    for (const [target, title, desc] of [
      [10, 'Sieger-Typ', '10 Siege insgesamt (alle Modi)'],
      [50, 'Gewohnheitssieger', '50 Siege insgesamt (alle Modi)'],
      [100, 'Sieges-Maschine', '100 Siege insgesamt (alle Modi)'],
      [250, 'Unbesiegbar', '250 Siege insgesamt (alle Modi)'],
    ] as [number, string, string][]) {
      achievements.push({
        id: `total-wins-${target}`, title, description: desc,
        category: 'milestone', unlocked: totalWins >= target, value: totalWins, target, progress: Math.min(1, totalWins / target),
      })
    }

    return achievements
  } catch (e) {
    console.warn('[Stats] getFullAchievements failed:', e)
    // Bei Fehler trotzdem Basis-Achievements zurückgeben (alle locked)
    return [
      { id: 'matches-1', title: 'Erster Pfeil', description: 'Erstes Match gespielt', category: 'milestone' as const, unlocked: false, value: 0, target: 1, progress: 0 },
      { id: 'matches-10', title: 'Einsteiger', description: '10 Matches gespielt', category: 'milestone' as const, unlocked: false, value: 0, target: 10, progress: 0 },
      { id: 'matches-50', title: 'Stammgast', description: '50 Matches gespielt', category: 'milestone' as const, unlocked: false, value: 0, target: 50, progress: 0 },
      { id: 'matches-100', title: 'Centurion', description: '100 Matches gespielt', category: 'milestone' as const, unlocked: false, value: 0, target: 100, progress: 0 },
      { id: 'first-180', title: 'Maximum!', description: 'Erste 180 geworfen', category: 'rare' as const, unlocked: false, value: 0, target: 1, progress: 0 },
      { id: 'first-ton', title: 'Erster Ton', description: 'Erste Aufnahme mit 100+ Punkten', category: 'milestone' as const, unlocked: false, value: 0, target: 1, progress: 0 },
      { id: 'avg-40', title: 'Solide', description: 'Match-Durchschnitt über 40', category: 'skill' as const, unlocked: false },
      { id: 'avg-60', title: 'Stark', description: 'Match-Durchschnitt über 60', category: 'skill' as const, unlocked: false },
      { id: 'cricket-first', title: 'Cricket Opener', description: 'Erstes Cricket-Match gespielt', category: 'cricket' as const, unlocked: false, value: 0, target: 1, progress: 0 },
      { id: 'modes-3', title: 'Vielseitig', description: '3 verschiedene Spielmodi ausprobiert', category: 'vielseitigkeit' as const, unlocked: false, value: 0, target: 3, progress: 0 },
      { id: 'darts-1000', title: 'Dart-Lehrling', description: '1.000 Darts geworfen', category: 'milestone' as const, unlocked: false, value: 0, target: 1000, progress: 0 },
      { id: 'streak-3', title: 'Heißer Lauf', description: '3 Siege in Folge', category: 'skill' as const, unlocked: false, value: 0, target: 3, progress: 0 },
    ]
  }
}

// ============================================================================
// Cross-Game H2H (TASK 23)
// ============================================================================

export type CrossGameH2H = {
  opponentId: string
  opponentName: string
  opponentColor?: string
  totalMatches: number
  wins: number
  losses: number
  winRate: number
  modes: { mode: string; label: string; matches: number; wins: number }[]
}

export async function getCrossGameHeadToHead(playerId: string): Promise<CrossGameH2H[]> {
  try {
    const opponents: Record<string, CrossGameH2H> = {}

    const modeConfigs = [
      { table: 'x01', ptable: 'x01_match_players', etable: 'x01_events', winEvent: 'MatchFinished', label: 'X01' },
      { table: 'cricket', ptable: 'cricket_match_players', etable: 'cricket_events', winEvent: 'CricketMatchFinished', label: 'Cricket' },
      { table: 'atb', ptable: 'atb_match_players', winCol: 'winner_id', label: 'ATB' },
      { table: 'ctf', ptable: 'ctf_match_players', winCol: 'winner_id', label: 'CTF' },
      { table: 'str', ptable: 'str_match_players', winCol: 'winner_id', label: 'Sträußchen' },
      { table: 'shanghai', ptable: 'shanghai_match_players', winCol: 'winner_id', label: 'Shanghai' },
      { table: 'killer', ptable: 'killer_match_players', winCol: 'winner_id', label: 'Killer' },
      { table: 'highscore', ptable: 'highscore_match_players', winCol: 'winner_id', label: 'Highscore' },
    ] as const

    for (const cfg of modeConfigs) {
      try {
        let rows: { opponent_id: string; opponent_name: string; opponent_color: string; matches: number; wins: number }[]

        if ('winCol' in cfg && cfg.winCol) {
          rows = await query<any>(`
            SELECT
              mp2.player_id as opponent_id,
              COALESCE(p.name, mp2.player_id) as opponent_name,
              p.color as opponent_color,
              COUNT(*) as matches,
              SUM(CASE WHEN m.${cfg.winCol} = ? THEN 1 ELSE 0 END) as wins
            FROM ${cfg.table}_matches m
            JOIN ${cfg.ptable} mp1 ON mp1.match_id = m.id AND mp1.player_id = ?
            JOIN ${cfg.ptable} mp2 ON mp2.match_id = m.id AND mp2.player_id != ?
            JOIN profiles p ON p.id = mp2.player_id
            WHERE m.finished = 1
              AND (SELECT COUNT(*) FROM ${cfg.ptable} WHERE match_id = m.id) = 2
            GROUP BY mp2.player_id, p.name, p.color
          `, [playerId, playerId, playerId])
        } else {
          const c = cfg as { table: string; ptable: string; etable: string; winEvent: string; label: string }
          rows = await query<any>(`
            SELECT
              mp2.player_id as opponent_id,
              COALESCE(p.name, mp2.player_id) as opponent_name,
              p.color as opponent_color,
              COUNT(*) as matches,
              COALESCE(SUM(CASE WHEN (
                SELECT e.data::jsonb->>'winnerPlayerId' FROM ${c.etable} e
                WHERE e.match_id = m.id AND e.type = '${c.winEvent}' LIMIT 1
              ) = ? THEN 1 ELSE 0 END), 0) as wins
            FROM ${c.table}_matches m
            JOIN ${c.ptable} mp1 ON mp1.match_id = m.id AND mp1.player_id = ?
            JOIN ${c.ptable} mp2 ON mp2.match_id = m.id AND mp2.player_id != ?
            JOIN profiles p ON p.id = mp2.player_id
            WHERE m.finished = 1
              AND (SELECT COUNT(*) FROM ${c.ptable} WHERE match_id = m.id) = 2
            GROUP BY mp2.player_id, p.name, p.color
          `, [playerId, playerId, playerId])
        }

        for (const r of rows) {
          if (!opponents[r.opponent_id]) {
            opponents[r.opponent_id] = {
              opponentId: r.opponent_id, opponentName: r.opponent_name, opponentColor: r.opponent_color,
              totalMatches: 0, wins: 0, losses: 0, winRate: 0, modes: [],
            }
          }
          opponents[r.opponent_id].totalMatches += r.matches
          opponents[r.opponent_id].wins += r.wins
          opponents[r.opponent_id].losses += (r.matches - r.wins)
          opponents[r.opponent_id].modes.push({ mode: cfg.table, label: cfg.label, matches: r.matches, wins: r.wins })
        }
      } catch { /* table might not exist */ }
    }

    const result = Object.values(opponents)
    for (const r of result) {
      r.winRate = r.totalMatches > 0 ? Math.round(r.wins / r.totalMatches * 1000) / 10 : 0
    }
    return result.sort((a, b) => b.totalMatches - a.totalMatches)
  } catch (e) {
    console.warn('[Stats] getCrossGameHeadToHead failed:', e)
    return []
  }
}

// ============================================================================
// Time Insights (TASK 24)
// ============================================================================

export type TimeInsights = {
  avgMatchDurationMinutes: number
  fastestMatchMinutes: number | null
  fastestMatchId: string | null
  hourlyPerformance: { hour: number; matchCount: number; winRate: number }[]
  bestHour: number | null
  bestHourWinRate: number
}

export async function getTimeInsights(playerId: string): Promise<TimeInsights> {
  try {
    const durations = await query<{ duration_min: number; match_id: string }>(`
      SELECT
        m.id as match_id,
        ROUND(CAST(m.duration_ms AS numeric) / 60000, 1) as duration_min
      FROM (
        SELECT id, duration_ms FROM atb_matches WHERE finished = 1 AND duration_ms > 0 AND id IN (SELECT match_id FROM atb_match_players WHERE player_id = ?)
        UNION ALL SELECT id, duration_ms FROM ctf_matches WHERE finished = 1 AND duration_ms > 0 AND id IN (SELECT match_id FROM ctf_match_players WHERE player_id = ?)
        UNION ALL SELECT id, duration_ms FROM str_matches WHERE finished = 1 AND duration_ms > 0 AND id IN (SELECT match_id FROM str_match_players WHERE player_id = ?)
        UNION ALL SELECT id, duration_ms FROM highscore_matches WHERE finished = 1 AND duration_ms > 0 AND id IN (SELECT match_id FROM highscore_match_players WHERE player_id = ?)
        UNION ALL SELECT id, duration_ms FROM shanghai_matches WHERE finished = 1 AND duration_ms > 0 AND id IN (SELECT match_id FROM shanghai_match_players WHERE player_id = ?)
        UNION ALL SELECT id, duration_ms FROM killer_matches WHERE finished = 1 AND duration_ms > 0 AND id IN (SELECT match_id FROM killer_match_players WHERE player_id = ?)
        UNION ALL SELECT id, duration_ms FROM bobs27_matches WHERE finished = 1 AND duration_ms > 0 AND id IN (SELECT match_id FROM bobs27_match_players WHERE player_id = ?)
        UNION ALL SELECT id, duration_ms FROM operation_matches WHERE finished = 1 AND duration_ms > 0 AND id IN (SELECT match_id FROM operation_match_players WHERE player_id = ?)
      ) m
      ORDER BY duration_min ASC
    `, [playerId, playerId, playerId, playerId, playerId, playerId, playerId, playerId])

    const avgDuration = durations.length > 0
      ? Math.round(durations.reduce((s, d) => s + d.duration_min, 0) / durations.length * 10) / 10
      : 0

    const hourly = await query<{ hour: number; matches: number; wins: number }>(`
      SELECT
        EXTRACT(HOUR FROM m.created_at::timestamp)::integer as hour,
        COUNT(*) as matches,
        SUM(CASE WHEN (SELECT e.data::jsonb->>'winnerPlayerId' FROM x01_events e
                       WHERE e.match_id = m.id AND e.type = 'MatchFinished') = ? THEN 1 ELSE 0 END) as wins
      FROM x01_matches m
      JOIN x01_match_players mp ON mp.match_id = m.id AND mp.player_id = ?
      WHERE m.finished = 1
        AND (SELECT COUNT(*) FROM x01_match_players WHERE match_id = m.id) > 1
      GROUP BY hour
      ORDER BY hour ASC
    `, [playerId, playerId])

    const hourlyPerf = hourly.map(h => ({
      hour: h.hour,
      matchCount: h.matches,
      winRate: h.matches > 0 ? Math.round(h.wins / h.matches * 1000) / 10 : 0,
    }))

    let bestHour: number | null = null
    let bestHourWinRate = 0
    for (const h of hourlyPerf) {
      if (h.matchCount >= 3 && h.winRate > bestHourWinRate) {
        bestHour = h.hour
        bestHourWinRate = h.winRate
      }
    }

    return {
      avgMatchDurationMinutes: avgDuration,
      fastestMatchMinutes: durations[0]?.duration_min ?? null,
      fastestMatchId: durations[0]?.match_id ?? null,
      hourlyPerformance: hourlyPerf,
      bestHour,
      bestHourWinRate,
    }
  } catch (e) {
    console.warn('[Stats] getTimeInsights failed:', e)
    return { avgMatchDurationMinutes: 0, fastestMatchMinutes: null, fastestMatchId: null, hourlyPerformance: [], bestHour: null, bestHourWinRate: 0 }
  }
}

// ============================================================================
// Training Recommendations (TASK 25)
// ============================================================================

export type TrainingRecommendation = {
  id: string
  priority: 'high' | 'medium' | 'low'
  category: 'doubles' | 'trebles' | 'checkout' | 'consistency' | 'endurance'
  title: string
  description: string
  currentValue: number
  targetValue?: number
  drill?: string
}

export async function getTrainingRecommendations(playerId: string): Promise<TrainingRecommendation[]> {
  try {
    const recommendations: TrainingRecommendation[] = []

    const checkoutStats = await queryOne<{
      checkout_attempts: number
      checkouts_made: number
    }>(`
      SELECT
        COALESCE(SUM(CASE WHEN (e.data::jsonb->>'remainingBefore')::integer <= 170
          AND e.data::jsonb->>'bust' != 'true'
          THEN 1 ELSE 0 END), 0) as checkout_attempts,
        COALESCE(SUM(CASE WHEN e.data::jsonb->>'finishingDartSeq' IS NOT NULL THEN 1 ELSE 0 END), 0) as checkouts_made
      FROM x01_events e
      JOIN x01_match_players mp ON mp.match_id = e.match_id AND mp.player_id = ?
      JOIN x01_matches m ON m.id = e.match_id AND m.finished = 1
      WHERE e.type = 'VisitAdded'
        AND e.data::jsonb->>'playerId' = ?
    `, [playerId, playerId])

    const coPct = (checkoutStats?.checkout_attempts ?? 0) > 0
      ? (checkoutStats!.checkouts_made / checkoutStats!.checkout_attempts * 100)
      : 0

    if (coPct < 30 && (checkoutStats?.checkout_attempts ?? 0) >= 10) {
      recommendations.push({
        id: 'checkout-low', priority: 'high', category: 'checkout',
        title: 'Checkout-Quote verbessern',
        description: `Deine Checkout-Quote liegt bei ${Math.round(coPct)}%. Ziel: 35%+`,
        currentValue: Math.round(coPct * 10) / 10, targetValue: 35,
        drill: "Bob's 27 spielen — trainiert systematisch alle Doppelfelder",
      })
    }

    const doubles = await getX01DoubleRates(playerId)
    if (doubles.length >= 3) {
      const weakest = doubles.filter(d => d.attempts >= 5).sort((a, b) => a.hitRate - b.hitRate)[0]
      const strongest = doubles.filter(d => d.attempts >= 5).sort((a, b) => b.hitRate - a.hitRate)[0]
      if (weakest && strongest && weakest.hitRate < strongest.hitRate * 0.5) {
        recommendations.push({
          id: `double-weak-${weakest.field}`, priority: 'medium', category: 'doubles',
          title: `${weakest.field} trainieren`,
          description: `${weakest.field} hat nur ${weakest.hitRate}% Trefferquote vs. ${strongest.field} mit ${strongest.hitRate}%`,
          currentValue: weakest.hitRate, targetValue: strongest.hitRate * 0.8,
          drill: `Ziele 50x auf ${weakest.field}, dann alternierend ${weakest.field} und ${strongest.field}`,
        })
      }
    }

    const form = await getX01FormCurve(playerId, 10)
    if (form.length >= 6) {
      const first5Avg = form.slice(0, 5).reduce((s, f) => s + f.threeDartAvg, 0) / 5
      const last5Avg = form.slice(-5).reduce((s, f) => s + f.threeDartAvg, 0) / 5
      if (first5Avg > 0 && last5Avg < first5Avg * 0.9) {
        recommendations.push({
          id: 'form-declining', priority: 'medium', category: 'consistency',
          title: 'Formkurve rückläufig',
          description: `Dein Avg ist von ${Math.round(first5Avg)} auf ${Math.round(last5Avg)} gefallen (letzte 10 Spiele)`,
          currentValue: Math.round(last5Avg * 10) / 10, targetValue: Math.round(first5Avg * 10) / 10,
          drill: 'Fokus auf Grundlagen: 20 Minuten T20-Training vor dem nächsten Match',
        })
      }
    }

    const session = await getSessionPerformance(playerId)
    if (session.warmup.sessionCount >= 5 && session.warmup.difference > 5) {
      recommendations.push({
        id: 'warmup-needed', priority: 'low', category: 'endurance',
        title: 'Aufwärmeffekt erkannt',
        description: `Dein 1. Match des Tages hat Avg ${session.warmup.firstMatchAvg}, spätere ${session.warmup.laterMatchesAvg} (+${session.warmup.difference})`,
        currentValue: session.warmup.firstMatchAvg, targetValue: session.warmup.laterMatchesAvg,
        drill: '10 Minuten Aufwärmrunde vor dem ersten Spiel (3x Runde T20-T19-T18)',
      })
    }

    const trebles = await getX01TrebleRates(playerId)
    const t20 = trebles.find(t => t.field === 'T20')
    const t19 = trebles.find(t => t.field === 'T19')
    if (t20 && t19 && t20.attempts >= 10 && t19.attempts >= 10) {
      if (t19.hitRate < t20.hitRate * 0.6) {
        recommendations.push({
          id: 'treble-imbalance', priority: 'low', category: 'trebles',
          title: 'T19 stärken',
          description: `T20: ${t20.hitRate}%, T19: ${t19.hitRate}% — mehr T19-Training hilft bei Alternativ-Routen`,
          currentValue: t19.hitRate, targetValue: t20.hitRate * 0.8,
          drill: 'Abwechselnd 3 Darts T20, dann 3 Darts T19 — je 10 Runden',
        })
      }
    }

    return recommendations.sort((a, b) => {
      const prio = { high: 0, medium: 1, low: 2 }
      return prio[a.priority] - prio[b.priority]
    })
  } catch (e) {
    console.warn('[Stats] getTrainingRecommendations failed:', e)
    return []
  }
}

// ============================================================================
// Session Stats ("Heute gespielt")
// ============================================================================

export type TodaySessionStats = {
  totalMatchesToday: number
  winsToday: number
  bestThreeDartAvgToday: number | null
  bestCheckoutToday: number | null
  totalDartsThrownToday: number
}

/**
 * Statistiken für den heutigen Tag (über alle Spielmodi).
 */
export async function getTodaySessionStats(playerId: string): Promise<TodaySessionStats | null> {
  try {
    // Matches played today across all modes
    const modes = [
      { table: 'x01', ptable: 'x01_match_players' },
      { table: 'cricket', ptable: 'cricket_match_players' },
      { table: 'atb', ptable: 'atb_match_players' },
      { table: 'ctf', ptable: 'ctf_match_players' },
      { table: 'str', ptable: 'str_match_players' },
      { table: 'highscore', ptable: 'highscore_match_players' },
      { table: 'shanghai', ptable: 'shanghai_match_players' },
      { table: 'killer', ptable: 'killer_match_players' },
      { table: 'bobs27', ptable: 'bobs27_match_players' },
      { table: 'operation', ptable: 'operation_match_players' },
    ] as const

    let totalMatches = 0
    let totalWins = 0

    // Count matches and wins per mode
    for (const mode of modes) {
      try {
        if (mode.table === 'x01' || mode.table === 'cricket') {
          // Winner determined via events
          const winEvent = mode.table === 'x01' ? 'MatchFinished' : 'CricketMatchFinished'
          const result = await queryOne<{ matches: number; wins: number }>(`
            SELECT
              COUNT(*) as matches,
              COALESCE(SUM(CASE WHEN (
                SELECT e.data::jsonb->>'winnerPlayerId' FROM ${mode.table}_events e
                WHERE e.match_id = m.id AND e.type = '${winEvent}' LIMIT 1
              ) = ? THEN 1 ELSE 0 END), 0) as wins
            FROM ${mode.table}_matches m
            JOIN ${mode.ptable} mp ON mp.match_id = m.id AND mp.player_id = ?
            WHERE m.finished = 1
              AND m.created_at::date = CURRENT_DATE
          `, [playerId, playerId])
          totalMatches += result?.matches ?? 0
          totalWins += result?.wins ?? 0
        } else {
          // Winner determined via winner_id column
          const result = await queryOne<{ matches: number; wins: number }>(`
            SELECT
              COUNT(*) as matches,
              SUM(CASE WHEN m.winner_id = ? THEN 1 ELSE 0 END) as wins
            FROM ${mode.table}_matches m
            JOIN ${mode.ptable} mp ON mp.match_id = m.id AND mp.player_id = ?
            WHERE m.finished = 1
              AND m.created_at::date = CURRENT_DATE
          `, [playerId, playerId])
          totalMatches += result?.matches ?? 0
          totalWins += result?.wins ?? 0
        }
      } catch { /* table might not exist */ }
    }

    if (totalMatches === 0) return null

    // Best 3-dart average today (X01 only)
    const bestAvg = await queryOne<{ best_avg: number | null }>(`
      SELECT MAX(match_avg) as best_avg FROM (
        SELECT
          AVG(
            (e.data::jsonb->>'visitScore')::real /
            NULLIF(jsonb_array_length(e.data::jsonb->'darts'), 0) * 3
          ) as match_avg
        FROM x01_matches m
        JOIN x01_match_players mp ON mp.match_id = m.id AND mp.player_id = ?
        JOIN x01_events e ON e.match_id = m.id AND e.type = 'VisitAdded' AND e.data::jsonb->>'playerId' = ?
        WHERE m.finished = 1
          AND m.created_at::date = CURRENT_DATE
        GROUP BY m.id
      )
    `, [playerId, playerId]).catch(() => null)

    // Best checkout today (X01 only)
    const bestCo = await queryOne<{ best_checkout: number | null }>(`
      SELECT MAX((e.data::jsonb->>'remainingBefore')::integer) as best_checkout
      FROM x01_events e
      JOIN x01_match_players mp ON mp.match_id = e.match_id AND mp.player_id = ?
      JOIN x01_matches m ON m.id = e.match_id AND m.finished = 1
      WHERE e.type = 'VisitAdded'
        AND e.data::jsonb->>'playerId' = ?
        AND e.data::jsonb->>'finishingDartSeq' IS NOT NULL
        AND m.created_at::date = CURRENT_DATE
    `, [playerId, playerId]).catch(() => null)

    // Total darts thrown today (X01 only — other modes don't track individual darts)
    const dartsToday = await queryOne<{ total_darts: number }>(`
      SELECT COALESCE(SUM(jsonb_array_length(e.data::jsonb->'darts')), 0) as total_darts
      FROM x01_events e
      JOIN x01_match_players mp ON mp.match_id = e.match_id AND mp.player_id = ?
      JOIN x01_matches m ON m.id = e.match_id AND m.finished = 1
      WHERE e.type = 'VisitAdded'
        AND e.data::jsonb->>'playerId' = ?
        AND m.created_at::date = CURRENT_DATE
    `, [playerId, playerId]).catch(() => null)

    return {
      totalMatchesToday: totalMatches,
      winsToday: totalWins,
      bestThreeDartAvgToday: bestAvg?.best_avg ? Math.round(bestAvg.best_avg * 100) / 100 : null,
      bestCheckoutToday: bestCo?.best_checkout ?? null,
      totalDartsThrownToday: dartsToday?.total_darts ?? 0,
    }
  } catch (e) {
    console.warn('[Stats] getTodaySessionStats failed:', e)
    return null
  }
}

// ============================================================================
// Win Streaks (Cross-Game)
// ============================================================================

export type WinStreakStats = {
  currentWinStreak: number
  longestWinStreak: number
  currentLossStreak: number
}

/**
 * Berechnet Gewinn- und Verlustserien über alle Spielmodi hinweg.
 * Betrachtet nur Mehrspieler-Matches.
 */
export async function getWinStreaks(playerId: string): Promise<WinStreakStats> {
  try {
    // Combined query across all modes with timestamps for proper ordering
    const unionParts: string[] = []
    const params: string[] = []

    // X01
    unionParts.push(`
      SELECT m.created_at, CASE WHEN (
        SELECT e.data::jsonb->>'winnerPlayerId' FROM x01_events e
        WHERE e.match_id = m.id AND e.type = 'MatchFinished' LIMIT 1
      ) = ? THEN 1 ELSE 0 END as won
      FROM x01_matches m
      JOIN x01_match_players mp ON mp.match_id = m.id AND mp.player_id = ?
      WHERE m.finished = 1
        AND (SELECT COUNT(*) FROM x01_match_players WHERE match_id = m.id) > 1
    `)
    params.push(playerId, playerId)

    // Cricket
    unionParts.push(`
      SELECT m.created_at, CASE WHEN (
        SELECT e.data::jsonb->>'winnerPlayerId' FROM cricket_events e
        WHERE e.match_id = m.id AND e.type = 'CricketMatchFinished' LIMIT 1
      ) = ? THEN 1 ELSE 0 END as won
      FROM cricket_matches m
      JOIN cricket_match_players mp ON mp.match_id = m.id AND mp.player_id = ?
      WHERE m.finished = 1
        AND (SELECT COUNT(*) FROM cricket_match_players WHERE match_id = m.id) > 1
    `)
    params.push(playerId, playerId)

    // Modes with winner_id column
    const directWinModes = ['atb', 'ctf', 'str', 'highscore', 'shanghai', 'killer', 'bobs27', 'operation'] as const
    for (const mode of directWinModes) {
      unionParts.push(`
        SELECT m.created_at, CASE WHEN m.winner_id = ? THEN 1 ELSE 0 END as won
        FROM ${mode}_matches m
        JOIN ${mode}_match_players mp ON mp.match_id = m.id AND mp.player_id = ?
        WHERE m.finished = 1
          AND (SELECT COUNT(*) FROM ${mode}_match_players WHERE match_id = m.id) > 1
      `)
      params.push(playerId, playerId)
    }

    const results = await query<{ created_at: string; won: number }>(
      `SELECT created_at, won FROM (${unionParts.join(' UNION ALL ')}) ORDER BY created_at DESC`,
      params,
    ).catch(() => [])

    if (results.length === 0) {
      return { currentWinStreak: 0, longestWinStreak: 0, currentLossStreak: 0 }
    }

    // Current streaks (from most recent)
    let currentWinStreak = 0
    let currentLossStreak = 0
    for (const r of results) {
      if (r.won === 1) {
        if (currentLossStreak > 0) break
        currentWinStreak++
      } else {
        if (currentWinStreak > 0) break
        currentLossStreak++
      }
    }

    // Longest win streak (iterate chronologically)
    let longestWin = 0
    let tempWin = 0
    for (let i = results.length - 1; i >= 0; i--) {
      if (results[i].won === 1) {
        tempWin++
        if (tempWin > longestWin) longestWin = tempWin
      } else {
        tempWin = 0
      }
    }

    return {
      currentWinStreak,
      longestWinStreak: longestWin,
      currentLossStreak,
    }
  } catch (e) {
    console.warn('[Stats] getWinStreaks failed:', e)
    return { currentWinStreak: 0, longestWinStreak: 0, currentLossStreak: 0 }
  }
}
