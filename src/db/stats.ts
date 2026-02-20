// src/db/stats.ts
// SQL-basierte Statistiken - Dinge die mit LocalStorage nicht möglich waren

import { query, queryOne } from './index'

// ============================================================================
// Types
// ============================================================================

export type TrendPoint = {
  date: string       // YYYY-MM-DD
  month: string      // YYYY-MM
  value: number
  matchCount: number
}

export type HeadToHead = {
  player1Id: string
  player1Name: string
  player2Id: string
  player2Name: string
  totalMatches: number
  player1Wins: number
  player2Wins: number
  player1LegsWon: number
  player2LegsWon: number
  lastPlayed: string
}

export type PlayerStreak = {
  playerId: string
  playerName: string
  currentWinStreak: number
  currentLoseStreak: number
  longestWinStreak: number
  longestLoseStreak: number
}

export type BestPerformance = {
  playerId: string
  playerName: string
  matchId: string
  matchTitle: string
  date: string
  value: number
  category: string
}

export type MonthlyStats = {
  month: string
  matchesPlayed: number
  legsWon: number
  legsLost: number
  winRate: number
}

export type DayOfWeekStats = {
  dayOfWeek: number  // 0 = Sunday, 6 = Saturday
  dayName: string
  matchesPlayed: number
  winRate: number
}

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
    LEFT JOIN profiles p ON p.id = json_extract(e.data, '$.playerId')
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
    LEFT JOIN profiles p ON p.id = mp.player_id
    WHERE e.type = 'VisitAdded'
      AND json_extract(e.data, '$.playerId') = mp.player_id
      AND m.finished = 1
    GROUP BY m.id, mp.player_id
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
    LEFT JOIN profiles p ON p.id = mp.player_id
    WHERE e.type = 'VisitAdded'
      AND json_extract(e.data, '$.playerId') = mp.player_id
      AND m.finished = 1
    GROUP BY m.id, mp.player_id
    HAVING count_180 > 0
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

export type QuickStats = {
  totalMatches: number
  totalLegsWon: number
  total180s: number
  highestCheckout: number
  avgThreeDart: number
  avgCheckoutPercent: number
  favoriteDayName: string
  currentStreak: string
}

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
// ATB Statistics
// ============================================================================

/**
 * Beste ATB Zeiten pro Modus
 */
export async function getATBBestTimes(playerId: string): Promise<{
  mode: string
  direction: string
  bestTime: number
  bestDarts: number
  attempts: number
}[]> {
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
// Cricket Statistics
// ============================================================================

/**
 * Cricket MPR Trend pro Monat
 * Verwendet dartCount (neue Events) oder json_array_length (alte Events) als Fallback
 */
export async function getCricketMonthlyMPR(playerId: string): Promise<TrendPoint[]> {
  const results = await query<{
    month: string
    avg_mpr: number
    match_count: number
  }>(`
    SELECT
      strftime('%Y-%m', m.created_at) as month,
      AVG(CAST(json_extract(e.data, '$.marks') AS REAL) /
          NULLIF(COALESCE(
            CAST(json_extract(e.data, '$.dartCount') AS REAL),
            json_array_length(e.data, '$.darts')
          ), 0) * 3) as avg_mpr,
      COUNT(DISTINCT m.id) as match_count
    FROM cricket_matches m
    JOIN cricket_events e ON e.match_id = m.id
    JOIN cricket_match_players mp ON mp.match_id = m.id AND mp.player_id = ?
    WHERE e.type = 'CricketTurnAdded'
      AND json_extract(e.data, '$.playerId') = ?
      AND m.finished = 1
    GROUP BY strftime('%Y-%m', m.created_at)
    ORDER BY month ASC
  `, [playerId, playerId])

  return results.map(r => ({
    date: r.month + '-01',
    month: r.month,
    value: Math.round((r.avg_mpr || 0) * 100) / 100,
    matchCount: r.match_count,
  }))
}

// ============================================================================
// Comprehensive X01 Stats (for X01 Tab)
// ============================================================================

export type X01FullStats = {
  // Übersicht
  matchesPlayed: number
  matchesWon: number
  matchWinRate: number
  legsPlayed: number
  legsWon: number
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
  // Checkout
  checkoutAttempts: number
  checkoutsMade: number
  checkoutPercent: number
  highestCheckout: number
  avgCheckout: number
  // Busts
  bustCount: number
  bustRate: number
  // Effizienz
  avgDartsPerLeg: number
  bestLegDarts: number | null
}

/**
 * Vollständige X01-Statistiken für einen Spieler
 */
export async function getX01FullStats(playerId: string): Promise<X01FullStats> {
  // Matches und Legs
  const matchStats = await queryOne<{
    matches_played: number
    matches_won: number
    legs_played: number
    legs_won: number
  }>(`
    WITH player_matches AS (
      SELECT m.id
      FROM x01_matches m
      JOIN x01_match_players mp ON mp.match_id = m.id AND mp.player_id = ?
      WHERE m.finished = 1
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
    )
    SELECT
      (SELECT COUNT(*) FROM player_matches) as matches_played,
      (SELECT wins FROM match_wins) as matches_won,
      (SELECT legs_played FROM leg_stats) as legs_played,
      (SELECT legs_won FROM leg_stats) as legs_won
  `, [playerId, playerId, playerId])

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
    JOIN x01_matches m ON m.id = e.match_id AND m.finished = 1
    WHERE e.type = 'VisitAdded'
      AND json_extract(e.data, '$.playerId') = ?
  `, [playerId, playerId])

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
    JOIN x01_matches m ON m.id = e.match_id AND m.finished = 1
    WHERE e.type = 'VisitAdded'
      AND json_extract(e.data, '$.playerId') = ?
      AND CAST(json_extract(e.data, '$.remainingBefore') AS INTEGER) <= 170
  `, [playerId, playerId])

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
    JOIN x01_matches m ON m.id = e.match_id AND m.finished = 1
    WHERE e.type = 'VisitAdded'
      AND json_extract(e.data, '$.playerId') = ?
  `, [playerId, playerId])

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
      JOIN x01_matches m ON m.id = lf.match_id AND m.finished = 1
      WHERE lf.type = 'LegFinished'
        AND json_extract(lf.data, '$.winnerPlayerId') = ?
    )
  `, [playerId, playerId, playerId])

  // Berechne abgeleitete Werte
  const totalDarts = scoringStats?.total_darts ?? 0
  const totalPoints = scoringStats?.total_points ?? 0
  const legsWon = matchStats?.legs_won ?? 0
  const checkoutsMade = checkoutStats?.checkouts_made ?? 0
  const checkoutAttempts = checkoutStats?.checkout_attempts ?? 0

  return {
    matchesPlayed: matchStats?.matches_played ?? 0,
    matchesWon: matchStats?.matches_won ?? 0,
    matchWinRate: (matchStats?.matches_played ?? 0) > 0
      ? Math.round((matchStats?.matches_won ?? 0) / (matchStats?.matches_played ?? 1) * 100)
      : 0,
    legsPlayed: matchStats?.legs_played ?? 0,
    legsWon,
    legWinRate: (matchStats?.legs_played ?? 0) > 0
      ? Math.round(legsWon / (matchStats?.legs_played ?? 1) * 100)
      : 0,
    totalDarts,
    totalPoints,
    threeDartAvg: totalDarts > 0 ? Math.round((totalPoints / totalDarts * 3) * 100) / 100 : 0,
    first9Avg: 0, // Benötigt komplexere Berechnung
    highestVisit: scoringStats?.highest_visit ?? 0,
    count180: scoringStats?.count_180 ?? 0,
    count140plus: scoringStats?.count_140 ?? 0,
    count100plus: scoringStats?.count_100 ?? 0,
    count60plus: scoringStats?.count_60 ?? 0,
    checkoutAttempts,
    checkoutsMade,
    checkoutPercent: checkoutAttempts > 0
      ? Math.round(checkoutsMade / checkoutAttempts * 100)
      : 0,
    highestCheckout: checkoutStats?.highest_checkout ?? 0,
    avgCheckout: checkoutsMade > 0
      ? Math.round((checkoutStats?.total_checkout_score ?? 0) / checkoutsMade)
      : 0,
    bustCount: bustStats?.bust_count ?? 0,
    bustRate: (bustStats?.total_visits ?? 0) > 0
      ? Math.round((bustStats?.bust_count ?? 0) / (bustStats?.total_visits ?? 1) * 1000) / 10
      : 0,
    avgDartsPerLeg: legsWon > 0
      ? Math.round((totalDarts / legsWon) * 10) / 10
      : 0,
    bestLegDarts: bestLegStats?.best_leg_darts ?? null,
  }
}

// ============================================================================
// Comprehensive Cricket Stats (for Cricket Tab)
// ============================================================================

export type CricketFullStats = {
  matchesPlayed: number
  matchesWon: number
  matchWinRate: number
  legsPlayed: number
  legsWon: number
  legWinRate: number
  totalMarks: number
  totalTurns: number
  marksPerRound: number
  totalTriples: number
  totalDoubles: number
  totalSingles: number
  bullHits: number
  doubleBullHits: number
  tripleRate: number
  noScoreTurns: number
  noScoreRate: number
  bestLegDarts: number | null
}

/**
 * Vollständige Cricket-Statistiken für einen Spieler
 */
export async function getCricketFullStats(playerId: string): Promise<CricketFullStats> {
  // Match Stats
  const matchStats = await queryOne<{
    matches_played: number
    matches_won: number
    legs_played: number
    legs_won: number
  }>(`
    WITH player_matches AS (
      SELECT m.id
      FROM cricket_matches m
      JOIN cricket_match_players mp ON mp.match_id = m.id AND mp.player_id = ?
      WHERE m.finished = 1
    ),
    leg_stats AS (
      SELECT
        COUNT(*) as legs_played,
        SUM(CASE WHEN json_extract(e.data, '$.winnerPlayerId') = ? THEN 1 ELSE 0 END) as legs_won
      FROM cricket_events e
      WHERE e.match_id IN (SELECT id FROM player_matches)
        AND e.type = 'CricketLegFinished'
    ),
    match_wins AS (
      SELECT COUNT(*) as wins
      FROM cricket_events e
      WHERE e.match_id IN (SELECT id FROM player_matches)
        AND e.type = 'CricketMatchFinished'
        AND json_extract(e.data, '$.winnerPlayerId') = ?
    )
    SELECT
      (SELECT COUNT(*) FROM player_matches) as matches_played,
      (SELECT wins FROM match_wins) as matches_won,
      COALESCE((SELECT legs_played FROM leg_stats), 0) as legs_played,
      COALESCE((SELECT legs_won FROM leg_stats), 0) as legs_won
  `, [playerId, playerId, playerId])

  // Turn Stats - mit Fallback wenn CricketTurnAdded andere Struktur hat
  const turnStats = await queryOne<{
    total_turns: number
    total_marks: number
    total_triples: number
    total_doubles: number
    total_singles: number
    bull_hits: number
    double_bull_hits: number
    no_score_turns: number
  }>(`
    SELECT
      COUNT(*) as total_turns,
      COALESCE(SUM(CAST(json_extract(e.data, '$.marks') AS INTEGER)), 0) as total_marks,
      COALESCE(SUM(CAST(json_extract(e.data, '$.tripleCount') AS INTEGER)), 0) as total_triples,
      COALESCE(SUM(CAST(json_extract(e.data, '$.doubleCount') AS INTEGER)), 0) as total_doubles,
      COALESCE(SUM(CAST(json_extract(e.data, '$.singleCount') AS INTEGER)), 0) as total_singles,
      COALESCE(SUM(CAST(json_extract(e.data, '$.bullCount') AS INTEGER)), 0) as bull_hits,
      COALESCE(SUM(CAST(json_extract(e.data, '$.doubleBullCount') AS INTEGER)), 0) as double_bull_hits,
      SUM(CASE WHEN COALESCE(CAST(json_extract(e.data, '$.marks') AS INTEGER), 0) = 0 THEN 1 ELSE 0 END) as no_score_turns
    FROM cricket_events e
    JOIN cricket_match_players mp ON mp.match_id = e.match_id AND mp.player_id = ?
    JOIN cricket_matches m ON m.id = e.match_id AND m.finished = 1
    WHERE e.type = 'CricketTurnAdded'
      AND json_extract(e.data, '$.playerId') = ?
  `, [playerId, playerId])

  // Best Leg Darts (Minimum Darts in einem gewonnenen Leg)
  // Cricket hat kein legId auf Turns → wir nutzen seq-Reihenfolge + CricketLegFinished-Grenzen
  const bestLegStats = await queryOne<{
    best_leg_darts: number | null
  }>(`
    WITH leg_ends AS (
      SELECT
        match_id,
        seq,
        json_extract(data, '$.winnerPlayerId') as winner_id,
        ROW_NUMBER() OVER (PARTITION BY match_id ORDER BY seq) as leg_num
      FROM cricket_events
      WHERE type = 'CricketLegFinished'
        AND match_id IN (
          SELECT m.id FROM cricket_matches m
          JOIN cricket_match_players mp ON mp.match_id = m.id AND mp.player_id = ?
          WHERE m.finished = 1
        )
    ),
    turns_with_leg AS (
      SELECT
        t.match_id,
        json_array_length(t.data, '$.darts') as dart_count,
        (SELECT MIN(le.leg_num) FROM leg_ends le
         WHERE le.match_id = t.match_id AND le.seq > t.seq) as leg_num
      FROM cricket_events t
      JOIN cricket_matches m ON m.id = t.match_id AND m.finished = 1
      JOIN cricket_match_players mp ON mp.match_id = t.match_id AND mp.player_id = ?
      WHERE t.type = 'CricketTurnAdded'
        AND json_extract(t.data, '$.playerId') = ?
    )
    SELECT MIN(leg_darts) as best_leg_darts
    FROM (
      SELECT twl.match_id, twl.leg_num, SUM(twl.dart_count) as leg_darts
      FROM turns_with_leg twl
      JOIN leg_ends le ON le.match_id = twl.match_id AND le.leg_num = twl.leg_num
      WHERE le.winner_id = ?
      GROUP BY twl.match_id, twl.leg_num
    )
  `, [playerId, playerId, playerId, playerId])

  const totalTurns = turnStats?.total_turns ?? 0
  const totalMarks = turnStats?.total_marks ?? 0

  return {
    matchesPlayed: matchStats?.matches_played ?? 0,
    matchesWon: matchStats?.matches_won ?? 0,
    matchWinRate: (matchStats?.matches_played ?? 0) > 0
      ? Math.round((matchStats?.matches_won ?? 0) / (matchStats?.matches_played ?? 1) * 100)
      : 0,
    legsPlayed: matchStats?.legs_played ?? 0,
    legsWon: matchStats?.legs_won ?? 0,
    legWinRate: (matchStats?.legs_played ?? 0) > 0
      ? Math.round((matchStats?.legs_won ?? 0) / (matchStats?.legs_played ?? 1) * 100)
      : 0,
    totalMarks,
    totalTurns,
    marksPerRound: totalTurns > 0
      ? Math.round((totalMarks / totalTurns) * 100) / 100
      : 0,
    totalTriples: turnStats?.total_triples ?? 0,
    totalDoubles: turnStats?.total_doubles ?? 0,
    totalSingles: turnStats?.total_singles ?? 0,
    bullHits: turnStats?.bull_hits ?? 0,
    doubleBullHits: turnStats?.double_bull_hits ?? 0,
    tripleRate: totalTurns > 0
      ? Math.round((turnStats?.total_triples ?? 0) / totalTurns * 100)
      : 0,
    noScoreTurns: turnStats?.no_score_turns ?? 0,
    noScoreRate: totalTurns > 0
      ? Math.round((turnStats?.no_score_turns ?? 0) / totalTurns * 100)
      : 0,
    bestLegDarts: bestLegStats?.best_leg_darts ?? null,
  }
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
      COALESCE(SUM(CAST(json_extract(e.data, '$.hits') AS INTEGER)), 0) as total_hits,
      COALESCE(SUM(CAST(json_extract(e.data, '$.misses') AS INTEGER)), 0) as total_misses,
      COALESCE(SUM(CAST(json_extract(e.data, '$.triples') AS INTEGER)), 0) as total_triples,
      COALESCE(SUM(CAST(json_extract(e.data, '$.doubles') AS INTEGER)), 0) as total_doubles
    FROM atb_events e
    JOIN atb_match_players mp ON mp.match_id = e.match_id AND mp.player_id = ?
    JOIN atb_matches m ON m.id = e.match_id AND m.finished = 1
    WHERE e.type = 'ATBTurnAdded'
      AND json_extract(e.data, '$.playerId') = ?
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
    // Solo-Spiele
    soloX01Matches: soloX01,
    soloCricketMatches: soloCricket,
    soloATBMatches: soloATB,
    soloTotalMatches: soloTotal,
    // Mehrspieler-Matches
    multiX01Matches: multiX01,
    multiCricketMatches: multiCricket,
    multiATBMatches: multiATB,
    multiTotalMatches: multiTotal,
    // Aktivität
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

/**
 * 121-Sprint Statistiken für einen Spieler
 */
export async function get121FullStats(playerId: string): Promise<Stats121Full> {
  // Nur 121-Matches (starting_score = 121)
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

  // Checkout Stats (Darts auf Double bei <=170 remaining)
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

  // Bust Stats
  const bustStats = await queryOne<{ bust_count: number }>(`
    SELECT SUM(CASE WHEN json_extract(e.data, '$.bust') = 1 THEN 1 ELSE 0 END) as bust_count
    FROM x01_events e
    JOIN x01_matches m ON m.id = e.match_id AND m.starting_score = 121 AND m.finished = 1
    JOIN x01_match_players mp ON mp.match_id = m.id AND mp.player_id = ?
    WHERE e.type = 'VisitAdded'
      AND json_extract(e.data, '$.playerId') = ?
  `, [playerId, playerId])

  // Match Stats (nur Mehrspieler-Matches, keine Einzelspiele)
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

  // Skill Score berechnen (vereinfacht)
  // 40% Checkout-Quote, 25% Darts to Finish, 20% Double-Effizienz, 15% Konstanz
  const checkoutComponent = checkoutPct * 0.4
  const dartsComponent = legsWon > 0 ? Math.max(0, (1 - (avgDartsToFinish - 3) / 18) * 100) * 0.25 : 0
  const doubleComponent = checkoutsMade > 0 ? Math.max(0, (1 - ((checkoutAttempts / checkoutsMade) - 1) / 9) * 100) * 0.20 : 0
  const constancyComponent = 50 * 0.15 // Vereinfacht
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
  // Triple/Double Rates
  tripleHitRate: number
  doubleHitRate: number
  // Dart Position Averages
  dart1Avg: number
  dart2Avg: number
  dart3Avg: number
  // Performance under pressure
  performanceWhenBehind: number
  performanceWhenAhead: number
  // Recent form
  last5Wins: number
  last5Avg: number
  averageTrend: 'rising' | 'falling' | 'stable'
}

/**
 * Spezial-Statistiken für einen Spieler
 */
export async function getSpecialStats(playerId: string): Promise<SpecialStatsSQL> {
  // Triple/Double Hit Rates aus Cricket
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

  // Last 5 X01 Matches
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

  // Trend berechnen (letzte 5 vs vorherige 5)
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
    dart1Avg: 0, // Benötigt detailliertere Dart-Daten
    dart2Avg: 0,
    dart3Avg: 0,
    performanceWhenBehind: 0, // Benötigt Leg-State Analyse
    performanceWhenAhead: 0,
    last5Wins,
    last5Avg: Math.round(last5Avg * 100) / 100,
    averageTrend,
  }
}

// ============================================================================
// Highscores / Hall of Fame
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
      SELECT json_extract(e.data, '$.winnerPlayerId') as winner_id
      FROM x01_events e
      JOIN x01_matches m ON m.id = e.match_id AND m.finished = 1
      WHERE e.type = 'MatchFinished'
        AND (SELECT COUNT(*) FROM x01_match_players WHERE match_id = m.id) > 1
      UNION ALL
      -- Cricket: Nur Mehrspieler-Matches
      SELECT json_extract(e.data, '$.winnerPlayerId') as winner_id
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
    LEFT JOIN profiles p ON p.id = w.winner_id
    WHERE w.winner_id IS NOT NULL
      AND w.winner_id NOT LIKE 'guest-%'
      AND w.winner_id NOT LIKE 'temp-%'
    GROUP BY w.winner_id
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
        CASE WHEN (SELECT json_extract(e.data, '$.winnerPlayerId') FROM x01_events e
                   WHERE e.match_id = m.id AND e.type = 'MatchFinished') = mp.player_id THEN 1 ELSE 0 END as won
      FROM x01_match_players mp
      JOIN x01_matches m ON m.id = mp.match_id AND m.finished = 1
      WHERE (SELECT COUNT(*) FROM x01_match_players WHERE match_id = m.id) > 1
      UNION ALL
      -- Cricket: Nur Mehrspieler-Matches
      SELECT mp.player_id, m.id as match_id,
        CASE WHEN (SELECT json_extract(e.data, '$.winnerPlayerId') FROM cricket_events e
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
    LEFT JOIN profiles p ON p.id = pm.player_id
    WHERE pm.player_id NOT LIKE 'guest-%'
      AND pm.player_id NOT LIKE 'temp-%'
    GROUP BY pm.player_id
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
      json_extract(e.data, '$.playerId') as player_id,
      p.name as player_name,
      p.color as player_color,
      COUNT(*) as count_180
    FROM x01_events e
    JOIN x01_matches m ON m.id = e.match_id AND m.finished = 1
    LEFT JOIN profiles p ON p.id = json_extract(e.data, '$.playerId')
    WHERE e.type = 'VisitAdded'
      AND json_extract(e.data, '$.visitScore') = 180
      AND json_extract(e.data, '$.playerId') NOT LIKE 'guest-%'
      AND json_extract(e.data, '$.playerId') NOT LIKE 'temp-%'
    GROUP BY json_extract(e.data, '$.playerId')
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
      json_extract(e.data, '$.playerId') as player_id,
      p.name as player_name,
      p.color as player_color,
      AVG(CAST(json_extract(e.data, '$.visitScore') AS REAL) /
          NULLIF(json_array_length(e.data, '$.darts'), 0) * 3) as avg
    FROM x01_events e
    JOIN x01_matches m ON m.id = e.match_id AND m.finished = 1
    LEFT JOIN profiles p ON p.id = json_extract(e.data, '$.playerId')
    WHERE e.type = 'VisitAdded'
      AND json_extract(e.data, '$.playerId') NOT LIKE 'guest-%'
      AND json_extract(e.data, '$.playerId') NOT LIKE 'temp-%'
    GROUP BY json_extract(e.data, '$.playerId')
    HAVING SUM(json_array_length(e.data, '$.darts')) >= 100
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
      json_extract(e.data, '$.playerId') as player_id,
      p.name as player_name,
      p.color as player_color,
      CAST(SUM(CASE WHEN json_extract(e.data, '$.finishingDartSeq') IS NOT NULL THEN 1 ELSE 0 END) AS REAL) /
      COUNT(*) * 100 as checkout_pct
    FROM x01_events e
    JOIN x01_matches m ON m.id = e.match_id AND m.finished = 1
    LEFT JOIN profiles p ON p.id = json_extract(e.data, '$.playerId')
    WHERE e.type = 'VisitAdded'
      AND CAST(json_extract(e.data, '$.remainingBefore') AS INTEGER) <= 170
      AND json_extract(e.data, '$.playerId') NOT LIKE 'guest-%'
      AND json_extract(e.data, '$.playerId') NOT LIKE 'temp-%'
    GROUP BY json_extract(e.data, '$.playerId')
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

// ============================================================================
// Neue Highscore-Funktionen
// ============================================================================

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
      json_extract(e.data, '$.playerId') as player_id,
      p.name as player_name,
      p.color as player_color,
      MAX(CAST(json_extract(e.data, '$.visitScore') AS INTEGER)) as best_visit
    FROM x01_events e
    JOIN x01_matches m ON m.id = e.match_id AND m.finished = 1
    LEFT JOIN profiles p ON p.id = json_extract(e.data, '$.playerId')
    WHERE e.type = 'VisitAdded'
      AND json_extract(e.data, '$.playerId') NOT LIKE 'guest-%'
      AND json_extract(e.data, '$.playerId') NOT LIKE 'temp-%'
    GROUP BY json_extract(e.data, '$.playerId')
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
      json_extract(e.data, '$.playerId') as player_id,
      p.name as player_name,
      p.color as player_color,
      MAX(CAST(json_extract(e.data, '$.remainingBefore') AS INTEGER)) as best_checkout
    FROM x01_events e
    JOIN x01_matches m ON m.id = e.match_id AND m.finished = 1
    LEFT JOIN profiles p ON p.id = json_extract(e.data, '$.playerId')
    WHERE e.type = 'VisitAdded'
      AND json_extract(e.data, '$.finishingDartSeq') IS NOT NULL
      AND json_extract(e.data, '$.playerId') NOT LIKE 'guest-%'
      AND json_extract(e.data, '$.playerId') NOT LIKE 'temp-%'
    GROUP BY json_extract(e.data, '$.playerId')
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
        json_extract(lf.data, '$.winnerPlayerId') as player_id,
        (SELECT SUM(json_array_length(va.data, '$.darts'))
         FROM x01_events va
         WHERE va.match_id = lf.match_id
           AND va.type = 'VisitAdded'
           AND json_extract(va.data, '$.playerId') = json_extract(lf.data, '$.winnerPlayerId')
           AND json_extract(va.data, '$.legId') = json_extract(lf.data, '$.legId')
        ) as darts_count
      FROM x01_events lf
      JOIN x01_matches m ON m.id = lf.match_id AND m.finished = 1 AND m.starting_score = ?
      WHERE lf.type = 'LegFinished'
        AND json_extract(lf.data, '$.winnerPlayerId') NOT LIKE 'guest-%'
        AND json_extract(lf.data, '$.winnerPlayerId') NOT LIKE 'temp-%'
    )
    SELECT
      ld.player_id,
      p.name as player_name,
      p.color as player_color,
      MIN(ld.darts_count) as best_darts
    FROM leg_darts ld
    LEFT JOIN profiles p ON p.id = ld.player_id
    WHERE ld.darts_count > 0
    GROUP BY ld.player_id
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
        json_extract(e.data, '$.playerId') as player_id,
        SUM(CAST(json_extract(e.data, '$.visitScore') AS REAL)) /
          NULLIF(SUM(json_array_length(e.data, '$.darts')), 0) * 3 as avg
      FROM x01_events e
      JOIN x01_matches m ON m.id = e.match_id AND m.finished = 1 AND m.starting_score = ?
      WHERE e.type = 'VisitAdded'
        AND json_extract(e.data, '$.playerId') NOT LIKE 'guest-%'
        AND json_extract(e.data, '$.playerId') NOT LIKE 'temp-%'
      GROUP BY json_extract(e.data, '$.playerId'), m.id
      HAVING COUNT(*) >= 3
    )
    SELECT
      ma.player_id,
      p.name as player_name,
      p.color as player_color,
      MAX(ma.avg) as best_avg
    FROM match_avgs ma
    LEFT JOIN profiles p ON p.id = ma.player_id
    GROUP BY ma.player_id
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
      json_extract(e.data, '$.playerId') as player_id,
      p.name as player_name,
      p.color as player_color,
      CAST(SUM(CAST(json_extract(e.data, '$.marks') AS INTEGER)) AS REAL) / COUNT(*) as mpt
    FROM cricket_events e
    JOIN cricket_matches m ON m.id = e.match_id AND m.finished = 1
    LEFT JOIN profiles p ON p.id = json_extract(e.data, '$.playerId')
    WHERE e.type = 'CricketTurnAdded'
      AND json_extract(e.data, '$.playerId') NOT LIKE 'guest-%'
      AND json_extract(e.data, '$.playerId') NOT LIKE 'temp-%'
    GROUP BY json_extract(e.data, '$.playerId')
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
      json_extract(e.data, '$.playerId') as player_id,
      p.name as player_name,
      p.color as player_color,
      CAST(SUM(CAST(json_extract(e.data, '$.marks') AS INTEGER)) AS REAL) /
        NULLIF(SUM(COALESCE(
          CAST(json_extract(e.data, '$.dartCount') AS INTEGER),
          json_array_length(e.data, '$.darts')
        )), 0) as mpd
    FROM cricket_events e
    JOIN cricket_matches m ON m.id = e.match_id AND m.finished = 1
    LEFT JOIN profiles p ON p.id = json_extract(e.data, '$.playerId')
    WHERE e.type = 'CricketTurnAdded'
      AND json_extract(e.data, '$.playerId') NOT LIKE 'guest-%'
      AND json_extract(e.data, '$.playerId') NOT LIKE 'temp-%'
    GROUP BY json_extract(e.data, '$.playerId')
    HAVING SUM(COALESCE(
      CAST(json_extract(e.data, '$.dartCount') AS INTEGER),
      json_array_length(e.data, '$.darts')
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
      json_extract(e.data, '$.playerId') as player_id,
      p.name as player_name,
      p.color as player_color,
      SUM(CAST(json_extract(e.data, '$.tripleCount') AS INTEGER)) as total_triples
    FROM cricket_events e
    JOIN cricket_matches m ON m.id = e.match_id AND m.finished = 1
    LEFT JOIN profiles p ON p.id = json_extract(e.data, '$.playerId')
    WHERE e.type = 'CricketTurnAdded'
      AND json_extract(e.data, '$.playerId') NOT LIKE 'guest-%'
      AND json_extract(e.data, '$.playerId') NOT LIKE 'temp-%'
    GROUP BY json_extract(e.data, '$.playerId')
    HAVING total_triples > 0
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
      json_extract(e.data, '$.playerId') as player_id,
      p.name as player_name,
      p.color as player_color,
      MAX(CAST(json_extract(e.data, '$.marks') AS INTEGER)) as best_marks
    FROM cricket_events e
    JOIN cricket_matches m ON m.id = e.match_id AND m.finished = 1
    LEFT JOIN profiles p ON p.id = json_extract(e.data, '$.playerId')
    WHERE e.type = 'CricketTurnAdded'
      AND json_extract(e.data, '$.playerId') NOT LIKE 'guest-%'
      AND json_extract(e.data, '$.playerId') NOT LIKE 'temp-%'
    GROUP BY json_extract(e.data, '$.playerId')
    HAVING best_marks > 0
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
    LEFT JOIN profiles p ON p.id = m.winner_id
    WHERE m.finished = 1
      AND m.mode = ?
      AND m.duration_ms IS NOT NULL
      AND m.winner_id IS NOT NULL
      AND m.winner_id NOT LIKE 'guest-%'
      AND m.winner_id NOT LIKE 'temp-%'
    GROUP BY m.winner_id
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
    LEFT JOIN profiles p ON p.id = m.winner_id
    WHERE m.finished = 1
      AND m.mode = ?
      AND m.winner_darts IS NOT NULL
      AND m.winner_id IS NOT NULL
      AND m.winner_id NOT LIKE 'guest-%'
      AND m.winner_id NOT LIKE 'temp-%'
    GROUP BY m.winner_id
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
    LEFT JOIN profiles p ON p.id = m.winner_id
    WHERE m.finished = 1
      AND m.winner_id IS NOT NULL
      AND m.winner_id NOT LIKE 'guest-%'
      AND m.winner_id NOT LIKE 'temp-%'
    GROUP BY m.winner_id
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
// Highscore Orchestrierung
// ============================================================================

import { HIGHSCORE_CATEGORIES, type HighscoreCategory, type HighscoreCategoryId } from '../types/highscores'

export async function getAllHighscoresSQL(): Promise<HighscoreCategory[]> {
  const categories: HighscoreCategory[] = []

  for (const catConfig of HIGHSCORE_CATEGORIES) {
    let entries: HighscoreEntrySQL[] = []

    try {
      switch (catConfig.id as HighscoreCategoryId) {
        case 'most-wins': entries = await getHighscoreMostWins(); break
        case 'best-winrate': entries = await getHighscoreBestWinrate(); break
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
        case 'best-mpt': entries = await getHighscoreBestMPT(); break
        case 'best-mpd': entries = await getHighscoreBestMPD(); break
        case 'most-triples': entries = await getHighscoreMostTriples(); break
        case 'best-turn-marks': entries = await getHighscoreBestTurnMarks(); break
        case 'atb-fastest-ascending': entries = await getHighscoreATBFastest('ascending'); break
        case 'atb-fastest-board': entries = await getHighscoreATBFastest('board'); break
        case 'atb-fewest-darts-ascending': entries = await getHighscoreATBFewestDarts('ascending'); break
        case 'atb-fewest-darts-board': entries = await getHighscoreATBFewestDarts('board'); break
        case 'atb-most-wins': entries = await getHighscoreATBMostWins(); break
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

// ============================================================================
// ATB Monthly Trends (from SQLite)
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
        strftime('%Y-%m', m.created_at) as month,
        CAST(SUM(CAST(json_extract(e.data, '$.hits') AS INTEGER)) AS REAL) /
          NULLIF(SUM(CAST(json_extract(e.data, '$.totalDarts') AS INTEGER)), 0) * 100
          as avg_hit_rate,
        COUNT(DISTINCT m.id) as match_count
      FROM atb_matches m
      JOIN atb_events e ON e.match_id = m.id
      JOIN atb_match_players mp ON mp.match_id = m.id AND mp.player_id = ?
      WHERE e.type = 'ATBTurnAdded'
        AND json_extract(e.data, '$.playerId') = ?
        AND m.finished = 1
      GROUP BY strftime('%Y-%m', m.created_at)
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
// CTF Monthly Trends (from SQLite)
// ============================================================================

/**
 * CTF Trefferquote pro Monat
 * Nutzt enriched fields: $.hits, $.misses, $.totalDarts
 */
export async function getCTFMonthlyHitRate(playerId: string): Promise<TrendPoint[]> {
  try {
    const results = await query<{
      month: string
      avg_hit_rate: number
      match_count: number
    }>(`
      SELECT
        strftime('%Y-%m', m.created_at) as month,
        CAST(SUM(CAST(json_extract(e.data, '$.hits') AS INTEGER)) AS REAL) /
          NULLIF(SUM(CAST(json_extract(e.data, '$.totalDarts') AS INTEGER)), 0) * 100
          as avg_hit_rate,
        COUNT(DISTINCT m.id) as match_count
      FROM ctf_matches m
      JOIN ctf_events e ON e.match_id = m.id
      JOIN ctf_match_players mp ON mp.match_id = m.id AND mp.player_id = ?
      WHERE e.type = 'CTFTurnAdded'
        AND json_extract(e.data, '$.playerId') = ?
        AND m.finished = 1
      GROUP BY strftime('%Y-%m', m.created_at)
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
 * captureScore wird im enriched CTFTurnAdded Event gespeichert
 */
export async function getCTFMonthlyAvgScore(playerId: string): Promise<TrendPoint[]> {
  try {
    const results = await query<{
      month: string
      avg_score: number
      match_count: number
    }>(`
      SELECT
        strftime('%Y-%m', m.created_at) as month,
        AVG(match_score) as avg_score,
        COUNT(*) as match_count
      FROM (
        SELECT
          m.id,
          m.created_at,
          SUM(CAST(json_extract(e.data, '$.captureScore') AS REAL)) as match_score
        FROM ctf_matches m
        JOIN ctf_events e ON e.match_id = m.id
        JOIN ctf_match_players mp ON mp.match_id = m.id AND mp.player_id = ?
        WHERE e.type = 'CTFTurnAdded'
          AND json_extract(e.data, '$.playerId') = ?
          AND m.finished = 1
        GROUP BY m.id, m.created_at
      )
      GROUP BY strftime('%Y-%m', created_at)
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
// STR Monthly Trends (from SQLite)
// ============================================================================

/**
 * STR Trefferquote pro Monat
 * Nutzt enriched fields: $.hits, $.misses, $.totalDarts
 */
export async function getStrMonthlyHitRate(playerId: string): Promise<TrendPoint[]> {
  try {
    const results = await query<{
      month: string
      avg_hit_rate: number
      match_count: number
    }>(`
      SELECT
        strftime('%Y-%m', m.created_at) as month,
        CAST(SUM(CAST(json_extract(e.data, '$.hits') AS INTEGER)) AS REAL) /
          NULLIF(SUM(CAST(json_extract(e.data, '$.totalDarts') AS INTEGER)), 0) * 100
          as avg_hit_rate,
        COUNT(DISTINCT m.id) as match_count
      FROM str_matches m
      JOIN str_events e ON e.match_id = m.id
      JOIN str_match_players mp ON mp.match_id = m.id AND mp.player_id = ?
      WHERE e.type = 'StrTurnAdded'
        AND json_extract(e.data, '$.playerId') = ?
        AND m.finished = 1
      GROUP BY strftime('%Y-%m', m.created_at)
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
// Highscore Monthly Trends (from SQLite)
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
        strftime('%Y-%m', m.created_at) as month,
        AVG(match_score) as avg_score,
        COUNT(*) as match_count
      FROM (
        SELECT
          m.id,
          m.created_at,
          SUM(CAST(json_extract(e.data, '$.turnScore') AS REAL)) as match_score
        FROM highscore_matches m
        JOIN highscore_events e ON e.match_id = m.id
        JOIN highscore_match_players mp ON mp.match_id = m.id AND mp.player_id = ?
        WHERE e.type = 'HighscoreTurnAdded'
          AND json_extract(e.data, '$.playerId') = ?
          AND m.finished = 1
        GROUP BY m.id, m.created_at
      )
      GROUP BY strftime('%Y-%m', created_at)
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
// Dev Helpers
// ============================================================================

if (typeof window !== 'undefined') {
  ;(window as any).sqlStats = {
    getX01MonthlyAverage,
    getX01MonthlyCheckout,
    getX01HeadToHead,
    getAllHeadToHeadForPlayer,
    getPlayerStreaks,
    getHighestCheckouts,
    getBestMatchAverages,
    getMost180sInMatch,
    getStatsByDayOfWeek,
    getMonthlyStats,
    getQuickStats,
    getATBBestTimes,
    getCricketMonthlyMPR,
    // Full-Stats Funktionen
    getX01FullStats,
    getCricketFullStats,
    getATBFullStats,
    getGeneralPlayerStats,
    // Neue Funktionen
    get121FullStats,
    getSpecialStats,
    getHighscoreMostWins,
    getHighscoreBestWinrate,
    getHighscoreMost180s,
    getHighscoreBestCareerAvg,
    getHighscoreBestCheckoutPct,
    getHighscoreHighestVisit,
    getHighscoreHighestCheckout,
    getHighscoreBestLeg,
    getHighscoreBestMatchAvg,
    getHighscoreBestMPT,
    getHighscoreBestMPD,
    getHighscoreMostTriples,
    getHighscoreBestTurnMarks,
    getHighscoreATBFastest,
    getHighscoreATBFewestDarts,
    getHighscoreATBMostWins,
    getAllHighscoresSQL,
    getPlayerAchievements,
    getATBMonthlyHitRate,
    getCTFMonthlyHitRate,
    getCTFMonthlyAvgScore,
    getStrMonthlyHitRate,
    getHighscoreMonthlyAvgScore,
  }
}
