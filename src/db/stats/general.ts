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
  // X01 Stats (mit Solo-Erkennung: player_count = Anzahl Spieler im Match)
  const x01 = await queryOne<{ matches: number; solo: number; wins: number; multi_wins: number; darts: number }>(`
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
       AND json_extract(e2.data, '$.winnerPlayerId') = ?) as wins,
      (SELECT COUNT(*) FROM x01_events e2
       WHERE e2.match_id IN (SELECT id FROM player_matches WHERE player_count > 1)
       AND e2.type = 'MatchFinished'
       AND json_extract(e2.data, '$.winnerPlayerId') = ?) as multi_wins,
      COALESCE((SELECT SUM(json_array_length(e3.data, '$.darts'))
       FROM x01_events e3
       JOIN x01_matches m3 ON m3.id = e3.match_id AND m3.finished = 1
       JOIN x01_match_players mp3 ON mp3.match_id = m3.id AND mp3.player_id = ?
       WHERE e3.type = 'VisitAdded' AND json_extract(e3.data, '$.playerId') = ?), 0) as darts
    FROM player_matches
  `, [playerId, playerId, playerId, playerId, playerId])

  // Cricket Stats (mit Solo-Erkennung)
  const cricket = await queryOne<{ matches: number; solo: number; wins: number; multi_wins: number }>(`
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
       AND json_extract(e2.data, '$.winnerPlayerId') = ?) as wins,
      (SELECT COUNT(*) FROM cricket_events e2
       WHERE e2.match_id IN (SELECT id FROM player_matches WHERE player_count > 1)
       AND e2.type = 'CricketMatchFinished'
       AND json_extract(e2.data, '$.winnerPlayerId') = ?) as multi_wins
    FROM player_matches
  `, [playerId, playerId, playerId])

  // ATB Stats (mit Solo-Erkennung)
  const atb = await queryOne<{ matches: number; solo: number; wins: number; multi_wins: number }>(`
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
  `, [playerId, playerId, playerId])

  // Dates
  const dates = await queryOne<{ first_date: string; last_date: string }>(`
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
  `, [playerId, playerId, playerId])

  // Highlights
  const highlights = await queryOne<{ count_180: number; highest_checkout: number }>(`
    SELECT
      COALESCE(SUM(CASE WHEN json_extract(e.data, '$.visitScore') = 180 THEN 1 ELSE 0 END), 0) as count_180,
      COALESCE(MAX(CASE WHEN json_extract(e.data, '$.finishingDartSeq') IS NOT NULL
          THEN CAST(json_extract(e.data, '$.remainingBefore') AS INTEGER) ELSE 0 END), 0) as highest_checkout
    FROM x01_events e
    JOIN x01_match_players mp ON mp.match_id = e.match_id AND mp.player_id = ?
    JOIN x01_matches m ON m.id = e.match_id AND m.finished = 1
    WHERE e.type = 'VisitAdded'
      AND json_extract(e.data, '$.playerId') = ?
  `, [playerId, playerId])

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
        json_extract(e.data, '$.legId') as leg_id,
        json_extract(e.data, '$.winnerPlayerId') as winner_id
      FROM x01_events e
      WHERE e.match_id IN (SELECT id FROM player_121_matches)
        AND e.type = 'LegFinished'
    ),
    player_leg_darts AS (
      SELECT
        lr.leg_id,
        SUM(json_array_length(e.data, '$.darts')) as darts_in_leg,
        lr.winner_id
      FROM leg_results lr
      JOIN x01_events e ON e.match_id = lr.match_id
        AND json_extract(e.data, '$.legId') = lr.leg_id
        AND e.type = 'VisitAdded'
        AND json_extract(e.data, '$.playerId') = ?
      GROUP BY lr.leg_id
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
      SUM(CASE WHEN json_extract(e.data, '$.finishingDartSeq') IS NOT NULL THEN 1 ELSE 0 END) as checkouts_made
    FROM x01_events e
    JOIN x01_matches m ON m.id = e.match_id AND m.starting_score = 121 AND m.finished = 1
    JOIN x01_match_players mp ON mp.match_id = m.id AND mp.player_id = ?
    WHERE e.type = 'VisitAdded'
      AND json_extract(e.data, '$.playerId') = ?
      AND CAST(json_extract(e.data, '$.remainingBefore') AS INTEGER) <= 121
  `, [playerId, playerId])

  const bustStats = await queryOne<{ bust_count: number }>(`
    SELECT SUM(CASE WHEN json_extract(e.data, '$.bust') = 1 THEN 1 ELSE 0 END) as bust_count
    FROM x01_events e
    JOIN x01_matches m ON m.id = e.match_id AND m.starting_score = 121 AND m.finished = 1
    JOIN x01_match_players mp ON mp.match_id = m.id AND mp.player_id = ?
    WHERE e.type = 'VisitAdded'
      AND json_extract(e.data, '$.playerId') = ?
  `, [playerId, playerId])

  const matchStats = await queryOne<{
    matches_played: number
    matches_won: number
  }>(`
    SELECT
      COUNT(*) as matches_played,
      SUM(CASE WHEN e.data IS NOT NULL AND json_extract(e.data, '$.winnerPlayerId') = ? THEN 1 ELSE 0 END) as matches_won
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
      COALESCE(SUM(CAST(json_extract(e.data, '$.tripleCount') AS INTEGER)), 0) as triple_count,
      COALESCE(SUM(CAST(json_extract(e.data, '$.doubleCount') AS INTEGER)), 0) as double_count,
      COALESCE(SUM(CAST(json_extract(e.data, '$.singleCount') AS INTEGER)), 0) as single_count,
      COUNT(*) * 3 as total_throws
    FROM cricket_events e
    JOIN cricket_match_players mp ON mp.match_id = e.match_id AND mp.player_id = ?
    JOIN cricket_matches m ON m.id = e.match_id AND m.finished = 1
    WHERE e.type = 'CricketTurnAdded'
      AND json_extract(e.data, '$.playerId') = ?
  `, [playerId, playerId])

  const totalThrows = cricketRates?.total_throws ?? 0
  const tripleHitRate = totalThrows > 0 ? (cricketRates?.triple_count ?? 0) / totalThrows * 100 : 0
  const doubleHitRate = totalThrows > 0 ? (cricketRates?.double_count ?? 0) / totalThrows * 100 : 0

  const last5 = await query<{
    match_id: string
    won: number
    avg: number
  }>(`
    SELECT
      m.id as match_id,
      CASE WHEN (SELECT json_extract(e2.data, '$.winnerPlayerId') FROM x01_events e2
                 WHERE e2.match_id = m.id AND e2.type = 'MatchFinished') = ? THEN 1 ELSE 0 END as won,
      AVG(CAST(json_extract(e.data, '$.visitScore') AS REAL) /
          NULLIF(json_array_length(e.data, '$.darts'), 0) * 3) as avg
    FROM x01_matches m
    JOIN x01_match_players mp ON mp.match_id = m.id AND mp.player_id = ?
    JOIN x01_events e ON e.match_id = m.id AND e.type = 'VisitAdded' AND json_extract(e.data, '$.playerId') = ?
    WHERE m.finished = 1
    GROUP BY m.id
    ORDER BY m.created_at DESC
    LIMIT 5
  `, [playerId, playerId, playerId])

  const last5Wins = last5.filter(m => m.won === 1).length
  const last5Avg = last5.length > 0 ? last5.reduce((sum, m) => sum + (m.avg || 0), 0) / last5.length : 0

  const previous5 = await query<{ avg: number }>(`
    SELECT
      AVG(CAST(json_extract(e.data, '$.visitScore') AS REAL) /
          NULLIF(json_array_length(e.data, '$.darts'), 0) * 3) as avg
    FROM x01_matches m
    JOIN x01_match_players mp ON mp.match_id = m.id AND mp.player_id = ?
    JOIN x01_events e ON e.match_id = m.id AND e.type = 'VisitAdded' AND json_extract(e.data, '$.playerId') = ?
    WHERE m.finished = 1
    GROUP BY m.id
    ORDER BY m.created_at DESC
    LIMIT 5 OFFSET 5
  `, [playerId, playerId])

  const prev5Avg = previous5.length > 0 ? previous5.reduce((sum, m) => sum + (m.avg || 0), 0) / previous5.length : 0
  let averageTrend: 'rising' | 'falling' | 'stable' = 'stable'
  if (prev5Avg > 0 && last5Avg > prev5Avg * 1.05) averageTrend = 'rising'
  if (prev5Avg > 0 && last5Avg < prev5Avg * 0.95) averageTrend = 'falling'

  return {
    tripleHitRate: Math.round(tripleHitRate * 10) / 10,
    doubleHitRate: Math.round(doubleHitRate * 10) / 10,
    dart1Avg: 0,
    dart2Avg: 0,
    dart3Avg: 0,
    performanceWhenBehind: 0,
    performanceWhenAhead: 0,
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
               AND json_extract(e2.data, '${m.winField}') = ?) as wins,
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
                AND json_extract(e.data, '${m.winField}') = ?
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
      SELECT date(created_at) as date, COUNT(*) as count FROM (
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
      WHERE date(created_at) >= date('now', '-365 days')
      GROUP BY date(created_at)
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
  category: 'milestone' | 'rare' | 'skill' | 'dedication'
  unlocked: boolean
  unlockedDate?: string
  value?: number
  target?: number
  progress?: number
}

export async function getFullAchievements(playerId: string): Promise<Achievement[]> {
  try {
    const achievements: Achievement[] = []

    const totalMatches = await queryOne<{ cnt: number }>(`
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
    `, [playerId, playerId, playerId, playerId, playerId, playerId, playerId, playerId, playerId, playerId])
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

    const rareScores = await queryOne<{
      count_180: number
      count_171: number
      count_170_checkout: number
      highest_checkout: number
      count_9darter_legs: number
    }>(`
      SELECT
        COALESCE(SUM(CASE WHEN json_extract(e.data, '$.visitScore') = 180 THEN 1 ELSE 0 END), 0) as count_180,
        COALESCE(SUM(CASE WHEN json_extract(e.data, '$.visitScore') = 171 THEN 1 ELSE 0 END), 0) as count_171,
        COALESCE(MAX(CASE WHEN json_extract(e.data, '$.finishingDartSeq') IS NOT NULL
            THEN CAST(json_extract(e.data, '$.remainingBefore') AS INTEGER) ELSE 0 END), 0) as highest_checkout,
        COALESCE(SUM(CASE
            WHEN json_extract(e.data, '$.finishingDartSeq') IS NOT NULL
            AND CAST(json_extract(e.data, '$.remainingBefore') AS INTEGER) >= 170
            THEN 1 ELSE 0 END), 0) as count_170_checkout,
        0 as count_9darter_legs
      FROM x01_events e
      JOIN x01_match_players mp ON mp.match_id = e.match_id AND mp.player_id = ?
      JOIN x01_matches m ON m.id = e.match_id AND m.finished = 1
      WHERE e.type = 'VisitAdded'
        AND json_extract(e.data, '$.playerId') = ?
    `, [playerId, playerId])

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

    const bestAvg = await queryOne<{ best: number }>(`
      SELECT MAX(avg) as best FROM (
        SELECT AVG(
          CAST(json_extract(e.data, '$.visitScore') AS REAL) /
          NULLIF(json_array_length(e.data, '$.darts'), 0) * 3
        ) as avg
        FROM x01_matches m
        JOIN x01_match_players mp ON mp.match_id = m.id AND mp.player_id = ?
        JOIN x01_events e ON e.match_id = m.id AND e.type = 'VisitAdded' AND json_extract(e.data, '$.playerId') = ?
        WHERE m.finished = 1
        GROUP BY m.id
      )
    `, [playerId, playerId])

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

    const modesPlayed = await queryOne<{ modes: number }>(`
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
    `, [playerId, playerId, playerId, playerId, playerId, playerId, playerId, playerId, playerId, playerId])

    const mp = modesPlayed?.modes ?? 0
    for (const [target, title, desc] of [
      [3, 'Vielseitig', '3 verschiedene Spielmodi ausprobiert'],
      [5, 'Allrounder', '5 verschiedene Spielmodi ausprobiert'],
      [8, 'Meister aller Klassen', '8 verschiedene Spielmodi ausprobiert'],
      [10, 'Komplettist', 'Alle 10 Spielmodi gespielt'],
    ] as [number, string, string][]) {
      achievements.push({
        id: `modes-${target}`, title, description: desc,
        category: 'dedication', unlocked: mp >= target, value: mp, target, progress: Math.min(1, mp / target),
      })
    }

    const streaks = await getPlayerStreaks(playerId)
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

    return achievements
  } catch (e) {
    console.warn('[Stats] getFullAchievements failed:', e)
    return []
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
            LEFT JOIN profiles p ON p.id = mp2.player_id
            WHERE m.finished = 1
              AND (SELECT COUNT(*) FROM ${cfg.ptable} WHERE match_id = m.id) = 2
            GROUP BY mp2.player_id
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
                SELECT json_extract(e.data, '$.winnerPlayerId') FROM ${c.etable} e
                WHERE e.match_id = m.id AND e.type = '${c.winEvent}' LIMIT 1
              ) = ? THEN 1 ELSE 0 END), 0) as wins
            FROM ${c.table}_matches m
            JOIN ${c.ptable} mp1 ON mp1.match_id = m.id AND mp1.player_id = ?
            JOIN ${c.ptable} mp2 ON mp2.match_id = m.id AND mp2.player_id != ?
            LEFT JOIN profiles p ON p.id = mp2.player_id
            WHERE m.finished = 1
              AND (SELECT COUNT(*) FROM ${c.ptable} WHERE match_id = m.id) = 2
            GROUP BY mp2.player_id
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
        ROUND(CAST(m.duration_ms AS REAL) / 60000, 1) as duration_min
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
        CAST(strftime('%H', m.created_at) AS INTEGER) as hour,
        COUNT(*) as matches,
        SUM(CASE WHEN (SELECT json_extract(e.data, '$.winnerPlayerId') FROM x01_events e
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
        COALESCE(SUM(CASE WHEN CAST(json_extract(e.data, '$.remainingBefore') AS INTEGER) <= 170
          AND json_extract(e.data, '$.bust') IS NOT 1
          THEN 1 ELSE 0 END), 0) as checkout_attempts,
        COALESCE(SUM(CASE WHEN json_extract(e.data, '$.finishingDartSeq') IS NOT NULL THEN 1 ELSE 0 END), 0) as checkouts_made
      FROM x01_events e
      JOIN x01_match_players mp ON mp.match_id = e.match_id AND mp.player_id = ?
      JOIN x01_matches m ON m.id = e.match_id AND m.finished = 1
      WHERE e.type = 'VisitAdded'
        AND json_extract(e.data, '$.playerId') = ?
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
