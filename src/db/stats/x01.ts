// src/db/stats/x01.ts
// X01 statistics functions

import { query, queryOne } from '../index'
import type { TrendPoint, HeadToHead, PlayerStreak, BestPerformance, DayOfWeekStats, MonthlyStats, QuickStats, CheckoutRange } from './types'

// ============================================================================
// X01 Trend Statistics
// ============================================================================

/**
 * Durchschnitt pro Monat für einen Spieler
 * Korrigierte Felder: visitScore, json_array_length für darts
 */
export async function getX01MonthlyAverage(playerId: string): Promise<TrendPoint[]> {
  const results = await query<{
    month: string
    avg_score: number
    match_count: number
  }>(`
    SELECT
      strftime('%Y-%m', m.created_at) as month,
      AVG(
        CAST(json_extract(e.data, '$.visitScore') AS REAL) /
        NULLIF(json_array_length(e.data, '$.darts'), 0) * 3
      ) as avg_score,
      COUNT(DISTINCT m.id) as match_count
    FROM x01_matches m
    JOIN x01_events e ON e.match_id = m.id
    JOIN x01_match_players mp ON mp.match_id = m.id AND mp.player_id = ?
    WHERE e.type = 'VisitAdded'
      AND json_extract(e.data, '$.playerId') = ?
      AND m.finished = 1
    GROUP BY strftime('%Y-%m', m.created_at)
    ORDER BY month ASC
  `, [playerId, playerId])

  return results.map(r => ({
    date: r.month + '-01',
    month: r.month,
    value: Math.round((r.avg_score || 0) * 100) / 100,
    matchCount: r.match_count,
  }))
}

/**
 * Checkout-Prozent pro Monat
 * Ein Checkout ist wenn finishingDartSeq gesetzt ist
 */
export async function getX01MonthlyCheckout(playerId: string): Promise<TrendPoint[]> {
  // Zähle Legs gewonnen vs Legs gespielt pro Monat
  const results = await query<{
    month: string
    legs_won: number
    legs_played: number
    match_count: number
  }>(`
    SELECT
      strftime('%Y-%m', m.created_at) as month,
      (SELECT COUNT(*) FROM x01_events e2
       WHERE e2.match_id = m.id
       AND e2.type = 'LegFinished'
       AND json_extract(e2.data, '$.winnerPlayerId') = ?) as legs_won,
      (SELECT COUNT(*) FROM x01_events e3
       WHERE e3.match_id = m.id
       AND e3.type = 'LegFinished') as legs_played,
      COUNT(DISTINCT m.id) as match_count
    FROM x01_matches m
    JOIN x01_match_players mp ON mp.match_id = m.id AND mp.player_id = ?
    WHERE m.finished = 1
    GROUP BY strftime('%Y-%m', m.created_at)
    ORDER BY month ASC
  `, [playerId, playerId])

  return results.map(r => ({
    date: r.month + '-01',
    month: r.month,
    value: r.legs_played > 0 ? Math.round((r.legs_won / r.legs_played) * 100) : 0,
    matchCount: r.match_count,
  }))
}

// ============================================================================
// Head-to-Head Statistics
// ============================================================================

/**
 * Head-to-Head zwischen zwei Spielern (X01)
 */
export async function getX01HeadToHead(player1Id: string, player2Id: string): Promise<HeadToHead | null> {
  const result = await queryOne<{
    total_matches: number
    player1_wins: number
    player2_wins: number
    player1_legs: number
    player2_legs: number
    last_played: string
    player1_name: string
    player2_name: string
  }>(`
    WITH shared_matches AS (
      SELECT DISTINCT m.id, m.created_at
      FROM x01_matches m
      JOIN x01_match_players mp1 ON mp1.match_id = m.id AND mp1.player_id = ?
      JOIN x01_match_players mp2 ON mp2.match_id = m.id AND mp2.player_id = ?
      WHERE m.finished = 1
    ),
    match_results AS (
      SELECT
        sm.id,
        sm.created_at,
        (SELECT COUNT(*) FROM x01_events e
         WHERE e.match_id = sm.id
         AND e.type = 'LegFinished'
         AND json_extract(e.data, '$.winnerPlayerId') = ?) as p1_legs,
        (SELECT COUNT(*) FROM x01_events e
         WHERE e.match_id = sm.id
         AND e.type = 'LegFinished'
         AND json_extract(e.data, '$.winnerPlayerId') = ?) as p2_legs
      FROM shared_matches sm
    )
    SELECT
      COUNT(*) as total_matches,
      SUM(CASE WHEN p1_legs > p2_legs THEN 1 ELSE 0 END) as player1_wins,
      SUM(CASE WHEN p2_legs > p1_legs THEN 1 ELSE 0 END) as player2_wins,
      SUM(p1_legs) as player1_legs,
      SUM(p2_legs) as player2_legs,
      MAX(created_at) as last_played,
      (SELECT name FROM profiles WHERE id = ?) as player1_name,
      (SELECT name FROM profiles WHERE id = ?) as player2_name
    FROM match_results
  `, [player1Id, player2Id, player1Id, player2Id, player1Id, player2Id])

  if (!result || result.total_matches === 0) return null

  return {
    player1Id,
    player1Name: result.player1_name ?? player1Id,
    player2Id,
    player2Name: result.player2_name ?? player2Id,
    totalMatches: result.total_matches,
    player1Wins: result.player1_wins,
    player2Wins: result.player2_wins,
    player1LegsWon: result.player1_legs,
    player2LegsWon: result.player2_legs,
    lastPlayed: result.last_played,
  }
}

/**
 * Alle Head-to-Head Paarungen für einen Spieler
 */
export async function getAllHeadToHeadForPlayer(playerId: string): Promise<HeadToHead[]> {
  const opponents = await query<{ opponent_id: string }>(`
    SELECT DISTINCT mp2.player_id as opponent_id
    FROM x01_match_players mp1
    JOIN x01_match_players mp2 ON mp2.match_id = mp1.match_id AND mp2.player_id != mp1.player_id
    WHERE mp1.player_id = ?
  `, [playerId])

  const results: HeadToHead[] = []
  for (const opp of opponents) {
    const h2h = await getX01HeadToHead(playerId, opp.opponent_id)
    if (h2h && h2h.totalMatches > 0) {
      results.push(h2h)
    }
  }

  return results.sort((a, b) => b.totalMatches - a.totalMatches)
}

// ============================================================================
// Streaks & Records
// ============================================================================

/**
 * Berechnet Win/Lose Streaks für einen Spieler
 */
export async function getPlayerStreaks(playerId: string): Promise<PlayerStreak | null> {
  const matches = await query<{
    match_id: string
    created_at: string
    won: number
  }>(`
    SELECT
      m.id as match_id,
      m.created_at,
      CASE
        WHEN (SELECT COUNT(*) FROM x01_events e
              WHERE e.match_id = m.id
              AND e.type = 'LegFinished'
              AND json_extract(e.data, '$.winnerPlayerId') = mp.player_id) >
             (SELECT COUNT(*) FROM x01_events e
              WHERE e.match_id = m.id
              AND e.type = 'LegFinished'
              AND json_extract(e.data, '$.winnerPlayerId') != mp.player_id)
        THEN 1 ELSE 0
      END as won
    FROM x01_matches m
    JOIN x01_match_players mp ON mp.match_id = m.id AND mp.player_id = ?
    WHERE m.finished = 1
    ORDER BY m.created_at ASC
  `, [playerId])

  if (matches.length === 0) return null

  let currentWin = 0
  let currentLose = 0
  let longestWin = 0
  let longestLose = 0
  let tempWin = 0
  let tempLose = 0

  for (const m of matches) {
    if (m.won) {
      tempWin++
      tempLose = 0
      if (tempWin > longestWin) longestWin = tempWin
    } else {
      tempLose++
      tempWin = 0
      if (tempLose > longestLose) longestLose = tempLose
    }
  }

  // Aktuelle Streaks (vom Ende her)
  currentWin = 0
  currentLose = 0
  for (let i = matches.length - 1; i >= 0; i--) {
    if (matches[i].won) {
      if (currentLose > 0) break
      currentWin++
    } else {
      if (currentWin > 0) break
      currentLose++
    }
  }

  const playerName = await queryOne<{ name: string }>(
    'SELECT name FROM profiles WHERE id = ?', [playerId]
  )

  return {
    playerId,
    playerName: playerName?.name ?? playerId,
    currentWinStreak: currentWin,
    currentLoseStreak: currentLose,
    longestWinStreak: longestWin,
    longestLoseStreak: longestLose,
  }
}

// ============================================================================
// Best Performances
// ============================================================================

/**
 * Höchste Checkouts aller Zeiten
 * Checkout = remainingBefore wenn finishingDartSeq gesetzt ist
 */
export async function getHighestCheckouts(limit: number = 10): Promise<BestPerformance[]> {
  const results = await query<{
    player_id: string
    player_name: string
    match_id: string
    match_title: string
    date: string
    checkout: number
  }>(`
    SELECT
      json_extract(e.data, '$.playerId') as player_id,
      p.name as player_name,
      m.id as match_id,
      m.title as match_title,
      m.created_at as date,
      CAST(json_extract(e.data, '$.remainingBefore') AS INTEGER) as checkout
    FROM x01_events e
    JOIN x01_matches m ON m.id = e.match_id
    JOIN profiles p ON p.id = json_extract(e.data, '$.playerId')
    WHERE e.type = 'VisitAdded'
      AND json_extract(e.data, '$.finishingDartSeq') IS NOT NULL
      AND m.finished = 1
    ORDER BY checkout DESC
    LIMIT ?
  `, [limit])

  return results.map(r => ({
    playerId: r.player_id,
    playerName: r.player_name ?? 'Unbekannt',
    matchId: r.match_id,
    matchTitle: r.match_title,
    date: r.date,
    value: r.checkout,
    category: 'Highest Checkout',
  }))
}

/**
 * Beste 3-Dart-Averages in einem Match
 */
export async function getBestMatchAverages(limit: number = 10): Promise<BestPerformance[]> {
  const results = await query<{
    player_id: string
    player_name: string
    match_id: string
    match_title: string
    date: string
    avg: number
  }>(`
    SELECT
      mp.player_id,
      p.name as player_name,
      m.id as match_id,
      m.title as match_title,
      m.created_at as date,
      AVG(
        CAST(json_extract(e.data, '$.visitScore') AS REAL) /
        NULLIF(json_array_length(e.data, '$.darts'), 0) * 3
      ) as avg
    FROM x01_matches m
    JOIN x01_match_players mp ON mp.match_id = m.id
    JOIN x01_events e ON e.match_id = m.id
    JOIN profiles p ON p.id = mp.player_id
    WHERE e.type = 'VisitAdded'
      AND json_extract(e.data, '$.playerId') = mp.player_id
      AND m.finished = 1
    GROUP BY m.id, mp.player_id, p.name, m.title, m.created_at
    HAVING COUNT(*) >= 3
    ORDER BY avg DESC
    LIMIT ?
  `, [limit])

  return results.map(r => ({
    playerId: r.player_id,
    playerName: r.player_name ?? 'Unbekannt',
    matchId: r.match_id,
    matchTitle: r.match_title,
    date: r.date,
    value: Math.round((r.avg || 0) * 100) / 100,
    category: 'Best Match Average',
  }))
}

/**
 * Meiste 180er in einem Match
 */
export async function getMost180sInMatch(limit: number = 10): Promise<BestPerformance[]> {
  const results = await query<{
    player_id: string
    player_name: string
    match_id: string
    match_title: string
    date: string
    count_180: number
  }>(`
    SELECT
      mp.player_id,
      p.name as player_name,
      m.id as match_id,
      m.title as match_title,
      m.created_at as date,
      SUM(CASE WHEN json_extract(e.data, '$.visitScore') = 180 THEN 1 ELSE 0 END) as count_180
    FROM x01_matches m
    JOIN x01_match_players mp ON mp.match_id = m.id
    JOIN x01_events e ON e.match_id = m.id
    JOIN profiles p ON p.id = mp.player_id
    WHERE e.type = 'VisitAdded'
      AND json_extract(e.data, '$.playerId') = mp.player_id
      AND m.finished = 1
    GROUP BY m.id, mp.player_id, p.name, m.title, m.created_at
    HAVING SUM(CASE WHEN json_extract(e.data, '$.visitScore') = 180 THEN 1 ELSE 0 END) > 0
    ORDER BY count_180 DESC
    LIMIT ?
  `, [limit])

  return results.map(r => ({
    playerId: r.player_id,
    playerName: r.player_name ?? 'Unbekannt',
    matchId: r.match_id,
    matchTitle: r.match_title,
    date: r.date,
    value: r.count_180,
    category: 'Most 180s in Match',
  }))
}

// ============================================================================
// Time-based Statistics
// ============================================================================

/**
 * Statistiken nach Wochentag
 */
export async function getStatsByDayOfWeek(playerId: string): Promise<DayOfWeekStats[]> {
  const dayNames = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag']

  const results = await query<{
    day_of_week: number
    matches_played: number
    matches_won: number
  }>(`
    SELECT
      CAST(strftime('%w', m.created_at) AS INTEGER) as day_of_week,
      COUNT(DISTINCT m.id) as matches_played,
      SUM(CASE
        WHEN (SELECT COUNT(*) FROM x01_events e
              WHERE e.match_id = m.id
              AND e.type = 'LegFinished'
              AND json_extract(e.data, '$.winnerPlayerId') = mp.player_id) >
             (SELECT COUNT(*) FROM x01_events e
              WHERE e.match_id = m.id
              AND e.type = 'LegFinished'
              AND json_extract(e.data, '$.winnerPlayerId') != mp.player_id)
        THEN 1 ELSE 0
      END) as matches_won
    FROM x01_matches m
    JOIN x01_match_players mp ON mp.match_id = m.id AND mp.player_id = ?
    WHERE m.finished = 1
    GROUP BY day_of_week
    ORDER BY day_of_week
  `, [playerId])

  return results.map(r => ({
    dayOfWeek: r.day_of_week,
    dayName: dayNames[r.day_of_week],
    matchesPlayed: r.matches_played,
    winRate: r.matches_played > 0 ? Math.round(r.matches_won / r.matches_played * 100) : 0,
  }))
}

/**
 * Statistiken nach Monat
 */
export async function getMonthlyStats(playerId: string): Promise<MonthlyStats[]> {
  const results = await query<{
    month: string
    matches_played: number
    legs_won: number
    legs_lost: number
  }>(`
    WITH player_matches AS (
      SELECT m.id, m.created_at
      FROM x01_matches m
      JOIN x01_match_players mp ON mp.match_id = m.id AND mp.player_id = ?
      WHERE m.finished = 1
    )
    SELECT
      strftime('%Y-%m', pm.created_at) as month,
      COUNT(DISTINCT pm.id) as matches_played,
      (SELECT COUNT(*) FROM x01_events e
       WHERE e.match_id IN (SELECT id FROM player_matches WHERE strftime('%Y-%m', created_at) = strftime('%Y-%m', pm.created_at))
       AND e.type = 'LegFinished'
       AND json_extract(e.data, '$.winnerPlayerId') = ?) as legs_won,
      (SELECT COUNT(*) FROM x01_events e
       WHERE e.match_id IN (SELECT id FROM player_matches WHERE strftime('%Y-%m', created_at) = strftime('%Y-%m', pm.created_at))
       AND e.type = 'LegFinished'
       AND json_extract(e.data, '$.winnerPlayerId') != ?) as legs_lost
    FROM player_matches pm
    GROUP BY month
    ORDER BY month DESC
    LIMIT 12
  `, [playerId, playerId, playerId])

  return results.map(r => ({
    month: r.month,
    matchesPlayed: r.matches_played,
    legsWon: r.legs_won,
    legsLost: r.legs_lost,
    winRate: (r.legs_won + r.legs_lost) > 0
      ? Math.round(r.legs_won / (r.legs_won + r.legs_lost) * 100)
      : 0,
  }))
}

// ============================================================================
// Quick Stats Overview
// ============================================================================

/**
 * Schnelle Übersicht für einen Spieler
 */
export async function getQuickStats(playerId: string): Promise<QuickStats> {
  const [
    matchCount,
    legsWon,
    total180s,
    highestCheckout,
    avgStats,
    dayStats,
    streaks,
  ] = await Promise.all([
    queryOne<{ count: number }>(`
      SELECT COUNT(DISTINCT m.id) as count
      FROM x01_matches m
      JOIN x01_match_players mp ON mp.match_id = m.id AND mp.player_id = ?
      WHERE m.finished = 1
    `, [playerId]),

    queryOne<{ count: number }>(`
      SELECT COUNT(*) as count
      FROM x01_events e
      JOIN x01_match_players mp ON mp.match_id = e.match_id AND mp.player_id = ?
      WHERE e.type = 'LegFinished'
        AND json_extract(e.data, '$.winnerPlayerId') = ?
    `, [playerId, playerId]),

    queryOne<{ count: number }>(`
      SELECT COUNT(*) as count
      FROM x01_events e
      JOIN x01_match_players mp ON mp.match_id = e.match_id AND mp.player_id = ?
      WHERE e.type = 'VisitAdded'
        AND json_extract(e.data, '$.playerId') = ?
        AND json_extract(e.data, '$.visitScore') = 180
    `, [playerId, playerId]),

    queryOne<{ max_checkout: number }>(`
      SELECT MAX(CAST(json_extract(e.data, '$.remainingBefore') AS INTEGER)) as max_checkout
      FROM x01_events e
      JOIN x01_match_players mp ON mp.match_id = e.match_id AND mp.player_id = ?
      WHERE e.type = 'VisitAdded'
        AND json_extract(e.data, '$.playerId') = ?
        AND json_extract(e.data, '$.finishingDartSeq') IS NOT NULL
    `, [playerId, playerId]),

    queryOne<{ avg: number }>(`
      SELECT
        AVG(
          CAST(json_extract(e.data, '$.visitScore') AS REAL) /
          NULLIF(json_array_length(e.data, '$.darts'), 0) * 3
        ) as avg
      FROM x01_events e
      JOIN x01_match_players mp ON mp.match_id = e.match_id AND mp.player_id = ?
      WHERE e.type = 'VisitAdded'
        AND json_extract(e.data, '$.playerId') = ?
    `, [playerId, playerId]),

    getStatsByDayOfWeek(playerId),
    getPlayerStreaks(playerId),
  ])

  // Finde besten Tag
  const bestDay = dayStats.reduce((best, day) =>
    day.matchesPlayed > best.matchesPlayed ? day : best,
    { dayName: '-', matchesPlayed: 0, winRate: 0, dayOfWeek: 0 }
  )

  // Streak String
  let streakStr = '-'
  if (streaks) {
    if (streaks.currentWinStreak > 0) {
      streakStr = `${streaks.currentWinStreak} Siege`
    } else if (streaks.currentLoseStreak > 0) {
      streakStr = `${streaks.currentLoseStreak} Niederlagen`
    }
  }

  // Leg-Win-Rate berechnen
  const legsWonCount = legsWon?.count ?? 0
  const totalLegs = await queryOne<{ count: number }>(`
    SELECT COUNT(*) as count
    FROM x01_events e
    JOIN x01_match_players mp ON mp.match_id = e.match_id AND mp.player_id = ?
    WHERE e.type = 'LegFinished'
  `, [playerId])
  const legWinRate = (totalLegs?.count ?? 0) > 0
    ? Math.round((legsWonCount / (totalLegs?.count ?? 1)) * 100)
    : 0

  return {
    totalMatches: matchCount?.count ?? 0,
    totalLegsWon: legsWonCount,
    total180s: total180s?.count ?? 0,
    highestCheckout: highestCheckout?.max_checkout ?? 0,
    avgThreeDart: Math.round((avgStats?.avg ?? 0) * 100) / 100,
    avgCheckoutPercent: legWinRate, // Verwende Leg-Win-Rate statt Checkout-%
    favoriteDayName: bestDay.dayName,
    currentStreak: streakStr,
  }
}

// ============================================================================
// Comprehensive X01 Stats (for X01 Tab)
// ============================================================================

export type X01FullStats = {
  // Übersicht
  matchesPlayed: number
  matchesWon: number
  matchWinRate: number
  matchesLost: number
  legsPlayed: number
  legsWon: number
  legsLost: number
  legDifference: number
  legWinRate: number
  // Scoring
  totalDarts: number
  totalPoints: number
  threeDartAvg: number
  first9Avg: number
  highestVisit: number
  count180: number
  count140plus: number
  count100plus: number
  count60plus: number
  // Averages
  bestMatchAvg: number | null
  worstMatchAvg: number | null
  // Checkout
  checkoutAttempts: number
  checkoutsMade: number
  checkoutPercent: number
  highestCheckout: number
  avgCheckout: number
  checkouts100plus: number
  dartsPerCheckout: number | null
  topFinishingDouble: string | null
  checkoutRanges: CheckoutRange[]
  // Highscores / Bestleistungen
  most180sInMatch: number
  best140plusInMatch: number
  bestCheckoutPctInMatch: number | null
  // Solo/Multi Breakdown
  soloMatches: number
  multiMatchesPlayed: number
  multiMatchesWon: number
  multiMatchesLost: number
  // Busts
  bustCount: number
  bustRate: number
  // Legs-Details
  avgDartsPerLeg: number
  bestLegDarts: number | null
  legsWonUnder15: number
  legsWonUnder18: number
  legsWonUnder25: number
  legsWonUnder30: number
  legsWonUnder35: number
  longestLegDarts: number | null
  avgDartsWonLeg: number | null
}

/**
 * Vollständige X01-Statistiken für einen Spieler
 * @param startingScore - Optional: Nur Matches mit diesem Startwert (301, 501, 701, 901)
 */
export async function getX01FullStats(playerId: string, startingScore?: number): Promise<X01FullStats> {
  // Score-Filter als wiederkehrender SQL-Baustein
  const scoreFilter = startingScore != null ? 'AND m.starting_score = ?' : ''
  const scoreParam = startingScore != null ? [startingScore] : []

  // Matches und Legs (mit Solo/Multi-Trennung)
  const matchStats = await queryOne<{
    matches_played: number
    matches_won: number
    solo_matches: number
    multi_matches: number
    multi_wins: number
    legs_played: number
    legs_won: number
  }>(`
    WITH player_matches AS (
      SELECT m.id,
        (SELECT COUNT(*) FROM x01_match_players WHERE match_id = m.id) as player_count
      FROM x01_matches m
      JOIN x01_match_players mp ON mp.match_id = m.id AND mp.player_id = ?
      WHERE m.finished = 1 ${scoreFilter}
    ),
    leg_stats AS (
      SELECT
        COUNT(*) as legs_played,
        SUM(CASE WHEN json_extract(e.data, '$.winnerPlayerId') = ? THEN 1 ELSE 0 END) as legs_won
      FROM x01_events e
      WHERE e.match_id IN (SELECT id FROM player_matches)
        AND e.type = 'LegFinished'
    ),
    match_wins AS (
      SELECT COUNT(*) as wins
      FROM x01_events e
      WHERE e.match_id IN (SELECT id FROM player_matches)
        AND e.type = 'MatchFinished'
        AND json_extract(e.data, '$.winnerPlayerId') = ?
    ),
    multi_wins AS (
      SELECT COUNT(*) as wins
      FROM x01_events e
      WHERE e.match_id IN (SELECT id FROM player_matches WHERE player_count > 1)
        AND e.type = 'MatchFinished'
        AND json_extract(e.data, '$.winnerPlayerId') = ?
    )
    SELECT
      (SELECT COUNT(*) FROM player_matches) as matches_played,
      (SELECT wins FROM match_wins) as matches_won,
      SUM(CASE WHEN player_count = 1 THEN 1 ELSE 0 END) as solo_matches,
      SUM(CASE WHEN player_count > 1 THEN 1 ELSE 0 END) as multi_matches,
      (SELECT wins FROM multi_wins) as multi_wins,
      (SELECT legs_played FROM leg_stats) as legs_played,
      (SELECT legs_won FROM leg_stats) as legs_won
    FROM player_matches
  `, [playerId, ...scoreParam, playerId, playerId, playerId])

  // Scoring Stats
  const scoringStats = await queryOne<{
    total_darts: number
    total_points: number
    highest_visit: number
    count_180: number
    count_140: number
    count_100: number
    count_60: number
  }>(`
    SELECT
      SUM(json_array_length(e.data, '$.darts')) as total_darts,
      SUM(CAST(json_extract(e.data, '$.visitScore') AS INTEGER)) as total_points,
      MAX(CAST(json_extract(e.data, '$.visitScore') AS INTEGER)) as highest_visit,
      SUM(CASE WHEN json_extract(e.data, '$.visitScore') = 180 THEN 1 ELSE 0 END) as count_180,
      SUM(CASE WHEN json_extract(e.data, '$.visitScore') >= 140 AND json_extract(e.data, '$.visitScore') < 180 THEN 1 ELSE 0 END) as count_140,
      SUM(CASE WHEN json_extract(e.data, '$.visitScore') >= 100 AND json_extract(e.data, '$.visitScore') < 140 THEN 1 ELSE 0 END) as count_100,
      SUM(CASE WHEN json_extract(e.data, '$.visitScore') >= 60 AND json_extract(e.data, '$.visitScore') < 100 THEN 1 ELSE 0 END) as count_60
    FROM x01_events e
    JOIN x01_match_players mp ON mp.match_id = e.match_id AND mp.player_id = ?
    JOIN x01_matches m ON m.id = e.match_id AND m.finished = 1 ${scoreFilter}
    WHERE e.type = 'VisitAdded'
      AND json_extract(e.data, '$.playerId') = ?
  `, [playerId, ...scoreParam, playerId])

  // Checkout Stats
  const checkoutStats = await queryOne<{
    checkout_attempts: number
    checkouts_made: number
    highest_checkout: number
    total_checkout_score: number
  }>(`
    SELECT
      COUNT(*) as checkout_attempts,
      SUM(CASE WHEN json_extract(e.data, '$.finishingDartSeq') IS NOT NULL THEN 1 ELSE 0 END) as checkouts_made,
      MAX(CASE WHEN json_extract(e.data, '$.finishingDartSeq') IS NOT NULL
          THEN CAST(json_extract(e.data, '$.remainingBefore') AS INTEGER) ELSE 0 END) as highest_checkout,
      SUM(CASE WHEN json_extract(e.data, '$.finishingDartSeq') IS NOT NULL
          THEN CAST(json_extract(e.data, '$.remainingBefore') AS INTEGER) ELSE 0 END) as total_checkout_score
    FROM x01_events e
    JOIN x01_match_players mp ON mp.match_id = e.match_id AND mp.player_id = ?
    JOIN x01_matches m ON m.id = e.match_id AND m.finished = 1 ${scoreFilter}
    WHERE e.type = 'VisitAdded'
      AND json_extract(e.data, '$.playerId') = ?
      AND CAST(json_extract(e.data, '$.remainingBefore') AS INTEGER) <= 170
  `, [playerId, ...scoreParam, playerId])

  // Bust Stats
  const bustStats = await queryOne<{
    bust_count: number
    total_visits: number
  }>(`
    SELECT
      SUM(CASE WHEN json_extract(e.data, '$.bust') = 1 THEN 1 ELSE 0 END) as bust_count,
      COUNT(*) as total_visits
    FROM x01_events e
    JOIN x01_match_players mp ON mp.match_id = e.match_id AND mp.player_id = ?
    JOIN x01_matches m ON m.id = e.match_id AND m.finished = 1 ${scoreFilter}
    WHERE e.type = 'VisitAdded'
      AND json_extract(e.data, '$.playerId') = ?
  `, [playerId, ...scoreParam, playerId])

  // Best Leg Darts (Minimum Darts in einem gewonnenen Leg)
  const bestLegStats = await queryOne<{
    best_leg_darts: number | null
  }>(`
    SELECT MIN(leg_darts) as best_leg_darts
    FROM (
      SELECT
        (SELECT SUM(json_array_length(v.data, '$.darts'))
         FROM x01_events v
         WHERE v.match_id = lf.match_id
           AND v.type = 'VisitAdded'
           AND json_extract(v.data, '$.playerId') = ?
           AND json_extract(v.data, '$.legId') = json_extract(lf.data, '$.legId')
        ) as leg_darts
      FROM x01_events lf
      JOIN x01_match_players mp ON mp.match_id = lf.match_id AND mp.player_id = ?
      JOIN x01_matches m ON m.id = lf.match_id AND m.finished = 1 ${scoreFilter}
      WHERE lf.type = 'LegFinished'
        AND json_extract(lf.data, '$.winnerPlayerId') = ?
    )
  `, [playerId, playerId, ...scoreParam, playerId])

  // === NEUE QUERIES ===

  // Best/Worst Match Average (per-Match AVG, dann MAX/MIN)
  const matchAvgs = await query<{
    match_id: string
    avg_score: number
  }>(`
    SELECT
      m.id as match_id,
      AVG(
        CAST(json_extract(e.data, '$.visitScore') AS REAL) /
        NULLIF(json_array_length(e.data, '$.darts'), 0) * 3
      ) as avg_score
    FROM x01_matches m
    JOIN x01_match_players mp ON mp.match_id = m.id AND mp.player_id = ?
    JOIN x01_events e ON e.match_id = m.id
    WHERE e.type = 'VisitAdded'
      AND json_extract(e.data, '$.playerId') = ?
      AND m.finished = 1 ${scoreFilter}
    GROUP BY m.id
    HAVING COUNT(*) >= 3
  `, [playerId, playerId, ...scoreParam])

  let bestMatchAvg: number | null = null
  let worstMatchAvg: number | null = null
  if (matchAvgs.length > 0) {
    const avgs = matchAvgs.map(r => r.avg_score).filter(v => v != null && !isNaN(v))
    if (avgs.length > 0) {
      bestMatchAvg = Math.round(Math.max(...avgs) * 100) / 100
      worstMatchAvg = Math.round(Math.min(...avgs) * 100) / 100
    }
  }

  // Checkouts 100+
  const co100 = await queryOne<{ cnt: number }>(`
    SELECT COUNT(*) as cnt
    FROM x01_events e
    JOIN x01_match_players mp ON mp.match_id = e.match_id AND mp.player_id = ?
    JOIN x01_matches m ON m.id = e.match_id AND m.finished = 1 ${scoreFilter}
    WHERE e.type = 'VisitAdded'
      AND json_extract(e.data, '$.playerId') = ?
      AND json_extract(e.data, '$.finishingDartSeq') IS NOT NULL
      AND CAST(json_extract(e.data, '$.remainingBefore') AS INTEGER) >= 100
  `, [playerId, ...scoreParam, playerId])

  // Darts pro Checkout (AVG der finishingDartSeq)
  const dartsPerCO = await queryOne<{ avg_darts: number | null }>(`
    SELECT AVG(CAST(json_extract(e.data, '$.finishingDartSeq') AS REAL)) as avg_darts
    FROM x01_events e
    JOIN x01_match_players mp ON mp.match_id = e.match_id AND mp.player_id = ?
    JOIN x01_matches m ON m.id = e.match_id AND m.finished = 1 ${scoreFilter}
    WHERE e.type = 'VisitAdded'
      AND json_extract(e.data, '$.playerId') = ?
      AND json_extract(e.data, '$.finishingDartSeq') IS NOT NULL
  `, [playerId, ...scoreParam, playerId])

  // Top Finishing Double — aus dem finishing dart das Feld bestimmen
  // Der finishing dart ist darts[finishingDartSeq - 1]
  const topDouble = await queryOne<{ bed: string | null, cnt: number }>(`
    SELECT
      json_extract(e.data, '$.darts[' || (CAST(json_extract(e.data, '$.finishingDartSeq') AS INTEGER) - 1) || '].bed') as bed,
      COUNT(*) as cnt
    FROM x01_events e
    JOIN x01_match_players mp ON mp.match_id = e.match_id AND mp.player_id = ?
    JOIN x01_matches m ON m.id = e.match_id AND m.finished = 1 ${scoreFilter}
    WHERE e.type = 'VisitAdded'
      AND json_extract(e.data, '$.playerId') = ?
      AND json_extract(e.data, '$.finishingDartSeq') IS NOT NULL
    GROUP BY bed
    ORDER BY cnt DESC
    LIMIT 1
  `, [playerId, ...scoreParam, playerId])

  // Checkout Ranges
  const checkoutRangeRows = await query<{
    range_label: string
    attempts: number
    made: number
  }>(`
    SELECT
      CASE
        WHEN CAST(json_extract(e.data, '$.remainingBefore') AS INTEGER) BETWEEN 2 AND 40 THEN '2-40'
        WHEN CAST(json_extract(e.data, '$.remainingBefore') AS INTEGER) BETWEEN 41 AND 60 THEN '41-60'
        WHEN CAST(json_extract(e.data, '$.remainingBefore') AS INTEGER) BETWEEN 61 AND 80 THEN '61-80'
        WHEN CAST(json_extract(e.data, '$.remainingBefore') AS INTEGER) BETWEEN 81 AND 100 THEN '81-100'
        WHEN CAST(json_extract(e.data, '$.remainingBefore') AS INTEGER) BETWEEN 101 AND 130 THEN '101-130'
        WHEN CAST(json_extract(e.data, '$.remainingBefore') AS INTEGER) BETWEEN 131 AND 170 THEN '131-170'
      END as range_label,
      COUNT(*) as attempts,
      SUM(CASE WHEN json_extract(e.data, '$.finishingDartSeq') IS NOT NULL THEN 1 ELSE 0 END) as made
    FROM x01_events e
    JOIN x01_match_players mp ON mp.match_id = e.match_id AND mp.player_id = ?
    JOIN x01_matches m ON m.id = e.match_id AND m.finished = 1 ${scoreFilter}
    WHERE e.type = 'VisitAdded'
      AND json_extract(e.data, '$.playerId') = ?
      AND CAST(json_extract(e.data, '$.remainingBefore') AS INTEGER) BETWEEN 2 AND 170
    GROUP BY range_label
    ORDER BY MIN(CAST(json_extract(e.data, '$.remainingBefore') AS INTEGER))
  `, [playerId, ...scoreParam, playerId])

  const checkoutRanges: CheckoutRange[] = checkoutRangeRows
    .filter(r => r.range_label != null)
    .map(r => ({
      range: r.range_label,
      attempts: r.attempts,
      made: r.made,
      percent: r.attempts > 0 ? Math.round(r.made / r.attempts * 1000) / 10 : 0,
    }))

  // Per-Match Highscores: most 180s, most 140+, best checkout%
  const perMatchHighscores = await query<{
    match_id: string
    count_180: number
    count_140plus: number
    co_pct: number | null
  }>(`
    SELECT
      m.id as match_id,
      SUM(CASE WHEN json_extract(e.data, '$.visitScore') = 180 THEN 1 ELSE 0 END) as count_180,
      SUM(CASE WHEN json_extract(e.data, '$.visitScore') >= 140 THEN 1 ELSE 0 END) as count_140plus,
      CASE
        WHEN SUM(CASE WHEN CAST(json_extract(e.data, '$.remainingBefore') AS INTEGER) <= 170 THEN 1 ELSE 0 END) > 0
        THEN ROUND(
          CAST(SUM(CASE WHEN json_extract(e.data, '$.finishingDartSeq') IS NOT NULL THEN 1 ELSE 0 END) AS REAL) /
          SUM(CASE WHEN CAST(json_extract(e.data, '$.remainingBefore') AS INTEGER) <= 170 THEN 1 ELSE 0 END) * 100, 1)
        ELSE NULL
      END as co_pct
    FROM x01_matches m
    JOIN x01_match_players mp ON mp.match_id = m.id AND mp.player_id = ?
    JOIN x01_events e ON e.match_id = m.id
    WHERE e.type = 'VisitAdded'
      AND json_extract(e.data, '$.playerId') = ?
      AND m.finished = 1 ${scoreFilter}
    GROUP BY m.id
  `, [playerId, playerId, ...scoreParam])

  let most180sInMatch = 0
  let best140plusInMatch = 0
  let bestCheckoutPctInMatch: number | null = null
  for (const pm of perMatchHighscores) {
    if (pm.count_180 > most180sInMatch) most180sInMatch = pm.count_180
    if (pm.count_140plus > best140plusInMatch) best140plusInMatch = pm.count_140plus
    if (pm.co_pct != null && (bestCheckoutPctInMatch == null || pm.co_pct > bestCheckoutPctInMatch)) {
      bestCheckoutPctInMatch = pm.co_pct
    }
  }

  // Leg-Details: Legs <=15 / <=18 / <=25 / <=30 / <=35 Darts, longest leg, avg darts won leg
  const legDetails = await queryOne<{
    legs_under_15: number
    legs_under_18: number
    legs_under_25: number
    legs_under_30: number
    legs_under_35: number
    longest_leg: number | null
    avg_darts_won: number | null
  }>(`
    SELECT
      SUM(CASE WHEN leg_darts <= 15 THEN 1 ELSE 0 END) as legs_under_15,
      SUM(CASE WHEN leg_darts <= 18 THEN 1 ELSE 0 END) as legs_under_18,
      SUM(CASE WHEN leg_darts <= 25 THEN 1 ELSE 0 END) as legs_under_25,
      SUM(CASE WHEN leg_darts <= 30 THEN 1 ELSE 0 END) as legs_under_30,
      SUM(CASE WHEN leg_darts <= 35 THEN 1 ELSE 0 END) as legs_under_35,
      MAX(leg_darts) as longest_leg,
      ROUND(AVG(leg_darts), 1) as avg_darts_won
    FROM (
      SELECT
        (SELECT SUM(json_array_length(v.data, '$.darts'))
         FROM x01_events v
         WHERE v.match_id = lf.match_id
           AND v.type = 'VisitAdded'
           AND json_extract(v.data, '$.playerId') = ?
           AND json_extract(v.data, '$.legId') = json_extract(lf.data, '$.legId')
        ) as leg_darts
      FROM x01_events lf
      JOIN x01_match_players mp ON mp.match_id = lf.match_id AND mp.player_id = ?
      JOIN x01_matches m ON m.id = lf.match_id AND m.finished = 1 ${scoreFilter}
      WHERE lf.type = 'LegFinished'
        AND json_extract(lf.data, '$.winnerPlayerId') = ?
    )
  `, [playerId, playerId, ...scoreParam, playerId])

  // Berechne abgeleitete Werte
  const matchesPlayed = matchStats?.matches_played ?? 0
  const matchesWon = matchStats?.matches_won ?? 0
  const soloMatches = matchStats?.solo_matches ?? 0
  const multiMatchesPlayed = matchStats?.multi_matches ?? 0
  const multiMatchesWon = matchStats?.multi_wins ?? 0
  const legsPlayed = matchStats?.legs_played ?? 0
  const totalDarts = scoringStats?.total_darts ?? 0
  const totalPoints = scoringStats?.total_points ?? 0
  const legsWon = matchStats?.legs_won ?? 0
  const legsLost = legsPlayed - legsWon
  const checkoutsMade = checkoutStats?.checkouts_made ?? 0
  const checkoutAttempts = checkoutStats?.checkout_attempts ?? 0

  // Top finishing double formatieren (z.B. "D20")
  let topFinishingDouble: string | null = null
  if (topDouble?.bed) {
    topFinishingDouble = `D${topDouble.bed}`
  }

  return {
    matchesPlayed,
    matchesWon,
    matchesLost: matchesPlayed - matchesWon,
    matchWinRate: matchesPlayed > 0
      ? Math.round(matchesWon / matchesPlayed * 100)
      : 0,
    soloMatches,
    multiMatchesPlayed,
    multiMatchesWon,
    multiMatchesLost: multiMatchesPlayed - multiMatchesWon,
    legsPlayed,
    legsWon,
    legsLost,
    legDifference: legsWon - legsLost,
    legWinRate: legsPlayed > 0
      ? Math.round(legsWon / legsPlayed * 100)
      : 0,
    totalDarts,
    totalPoints,
    threeDartAvg: totalDarts > 0 ? Math.round((totalPoints / totalDarts * 3) * 100) / 100 : 0,
    first9Avg: 0, // V2
    highestVisit: scoringStats?.highest_visit ?? 0,
    count180: scoringStats?.count_180 ?? 0,
    count140plus: scoringStats?.count_140 ?? 0,
    count100plus: scoringStats?.count_100 ?? 0,
    count60plus: scoringStats?.count_60 ?? 0,
    bestMatchAvg,
    worstMatchAvg,
    checkoutAttempts,
    checkoutsMade,
    checkoutPercent: checkoutAttempts > 0
      ? Math.round(checkoutsMade / checkoutAttempts * 100)
      : 0,
    highestCheckout: checkoutStats?.highest_checkout ?? 0,
    avgCheckout: checkoutsMade > 0
      ? Math.round((checkoutStats?.total_checkout_score ?? 0) / checkoutsMade)
      : 0,
    checkouts100plus: co100?.cnt ?? 0,
    dartsPerCheckout: dartsPerCO?.avg_darts != null ? Math.round(dartsPerCO.avg_darts * 10) / 10 : null,
    topFinishingDouble,
    checkoutRanges,
    most180sInMatch,
    best140plusInMatch,
    bestCheckoutPctInMatch,
    bustCount: bustStats?.bust_count ?? 0,
    bustRate: (bustStats?.total_visits ?? 0) > 0
      ? Math.round((bustStats?.bust_count ?? 0) / (bustStats?.total_visits ?? 1) * 1000) / 10
      : 0,
    avgDartsPerLeg: legsWon > 0
      ? Math.round((totalDarts / legsWon) * 10) / 10
      : 0,
    bestLegDarts: bestLegStats?.best_leg_darts ?? null,
    legsWonUnder15: legDetails?.legs_under_15 ?? 0,
    legsWonUnder18: legDetails?.legs_under_18 ?? 0,
    legsWonUnder25: legDetails?.legs_under_25 ?? 0,
    legsWonUnder30: legDetails?.legs_under_30 ?? 0,
    legsWonUnder35: legDetails?.legs_under_35 ?? 0,
    longestLegDarts: legDetails?.longest_leg ?? null,
    avgDartsWonLeg: legDetails?.avg_darts_won ?? null,
  }
}
