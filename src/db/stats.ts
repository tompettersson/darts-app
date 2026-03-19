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

export type CheckoutRange = {
  range: string         // "2-40", "41-60", "61-80", "81-100", "101-130", "131-170"
  attempts: number
  made: number
  percent: number
}

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

  // Leg-Details: Legs ≤15 / ≤18 / ≤25 / ≤30 / ≤35 Darts, longest leg, avg darts won leg
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
        CAST(json_extract(pm.final_scores, '$.' || ?) AS REAL) as final_score
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
        SUM(CASE WHEN json_extract(e.data, '$.hit') = 1 THEN 1 ELSE 0 END) as hits
      FROM bobs27_events e
      WHERE e.match_id IN (SELECT id FROM player_matches)
        AND e.type = 'Bobs27Throw'
        AND json_extract(e.data, '$.playerId') = ?
      GROUP BY e.match_id
    ),
    target_stats AS (
      SELECT
        e.match_id,
        COUNT(*) as targets_finished
      FROM bobs27_events e
      WHERE e.match_id IN (SELECT id FROM player_matches)
        AND e.type = 'Bobs27TargetFinished'
        AND json_extract(e.data, '$.playerId') = ?
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
      strftime('%Y-%m', m.created_at) as month,
      AVG(CAST(json_extract(m.final_scores, '$.' || ?) AS REAL)) as avg_score,
      COUNT(*) as match_count
    FROM bobs27_matches m
    JOIN bobs27_match_players mp ON mp.match_id = m.id AND mp.player_id = ?
    WHERE m.finished = 1
      AND m.final_scores IS NOT NULL
    GROUP BY strftime('%Y-%m', m.created_at)
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
      strftime('%Y-%m', m.created_at) as month,
      COUNT(*) as total_throws,
      SUM(CASE WHEN json_extract(e.data, '$.hit') = 1 THEN 1 ELSE 0 END) as total_hits,
      COUNT(DISTINCT m.id) as match_count
    FROM bobs27_matches m
    JOIN bobs27_match_players mp ON mp.match_id = m.id AND mp.player_id = ?
    JOIN bobs27_events e ON e.match_id = m.id
    WHERE m.finished = 1
      AND e.type = 'Bobs27Throw'
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
        CAST(json_extract(m.final_scores, '$.' || mp.player_id) AS REAL) as score
      FROM bobs27_matches m
      JOIN bobs27_match_players mp ON mp.match_id = m.id
      LEFT JOIN profiles p ON p.id = mp.player_id
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
      CAST(SUM(CASE WHEN json_extract(e.data, '$.hit') = 1 THEN 1 ELSE 0 END) AS REAL) /
        NULLIF(COUNT(*), 0) * 100 as hit_rate,
      COUNT(DISTINCT m.id) as match_count
    FROM bobs27_matches m
    JOIN bobs27_match_players mp ON mp.match_id = m.id
    JOIN bobs27_events e ON e.match_id = m.id
    LEFT JOIN profiles p ON p.id = mp.player_id
    WHERE m.finished = 1
      AND e.type = 'Bobs27Throw'
      AND json_extract(e.data, '$.playerId') = mp.player_id
    GROUP BY mp.player_id
    HAVING match_count >= 5
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
    LEFT JOIN profiles p ON p.id = m.winner_id
    WHERE m.finished = 1
      AND m.winner_id IS NOT NULL
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
// Operation Highscores
// ============================================================================

/**
 * Meiste Operation Treffer (gewichtete Hits: Single=1, Double=2, Triple=3)
 * Unabhaengig vom Zielfeld, da Hits statt Punkte gezaehlt werden.
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
          CASE json_extract(e.data, '$.hitType')
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
      LEFT JOIN profiles p ON p.id = mp.player_id
      WHERE m.finished = 1
        AND e.type = 'OperationDart'
        AND json_extract(e.data, '$.playerId') = mp.player_id
      GROUP BY mp.player_id, m.id
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
      CAST(SUM(json_extract(e.data, '$.points')) AS REAL) /
        NULLIF(COUNT(*), 0) as avg_ppd,
      COUNT(DISTINCT m.id) as match_count
    FROM operation_matches m
    JOIN operation_match_players mp ON mp.match_id = m.id
    JOIN operation_events e ON e.match_id = m.id
    LEFT JOIN profiles p ON p.id = mp.player_id
    WHERE m.finished = 1
      AND e.type = 'OperationDart'
      AND json_extract(e.data, '$.playerId') = mp.player_id
    GROUP BY mp.player_id
    HAVING match_count >= 5
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
      CAST(SUM(CASE WHEN json_extract(e.data, '$.hitType') != 'NO_SCORE' THEN 1 ELSE 0 END) AS REAL) /
        NULLIF(COUNT(*), 0) * 100 as hit_rate,
      COUNT(DISTINCT m.id) as match_count
    FROM operation_matches m
    JOIN operation_match_players mp ON mp.match_id = m.id
    JOIN operation_events e ON e.match_id = m.id
    LEFT JOIN profiles p ON p.id = mp.player_id
    WHERE m.finished = 1
      AND e.type = 'OperationDart'
      AND json_extract(e.data, '$.playerId') = mp.player_id
    GROUP BY mp.player_id
    HAVING match_count >= 5
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
    LEFT JOIN profiles p ON p.id = m.winner_id
    WHERE m.finished = 1
      AND m.winner_id IS NOT NULL
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

/**
 * Längster Hit-Streak (Operation) — Meiste aufeinanderfolgende Treffer ohne Miss
 * Berechnung per Gaps-and-Islands Pattern über die OperationDart Events.
 * Zeigt den besten Streak pro Spieler mit Link zum Match.
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
        json_extract(e.data, '$.playerId') as player_id,
        json_extract(e.data, '$.legIndex') as leg_index,
        json_extract(e.data, '$.isHit') as is_hit,
        ROW_NUMBER() OVER (
          PARTITION BY e.match_id, json_extract(e.data, '$.playerId'), json_extract(e.data, '$.legIndex')
          ORDER BY e.rowid
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
    LEFT JOIN profiles p ON p.id = b.player_id
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

/**
 * Meiste Treffer pro Turn (Cricket) — (+) mehrere pro Spieler
 * Nutzt enriched "marks" Feld aus CricketTurnAdded
 */
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
      json_extract(e.data, '$.playerId') as player_id,
      p.name as player_name,
      p.color as player_color,
      CAST(json_extract(e.data, '$.marks') AS INTEGER) as marks,
      m.id as match_id,
      m.created_at as match_date
    FROM cricket_events e
    JOIN cricket_matches m ON m.id = e.match_id AND m.finished = 1
    LEFT JOIN profiles p ON p.id = json_extract(e.data, '$.playerId')
    WHERE e.type = 'CricketTurnAdded'
      AND json_extract(e.data, '$.playerId') NOT LIKE 'guest-%'
      AND json_extract(e.data, '$.playerId') NOT LIKE 'temp-%'
      AND CAST(json_extract(e.data, '$.marks') AS INTEGER) > 0
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

/**
 * Beste Siegquote (Cricket) — (-) ein Eintrag pro Spieler, min. 10 Spiele
 */
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
 * Höchste Punktzahl in einem Cricket-Leg — (+) mehrere pro Spieler
 * Summiert alle Marks eines Spielers pro Leg
 */
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
        json_extract(e.data, '$.playerId') as player_id,
        e.match_id,
        CAST(json_extract(e.data, '$.marks') AS INTEGER) as marks,
        -- Leg-Nummer: Zähle CricketLegFinished Events davor
        (SELECT COUNT(*) FROM cricket_events lf
         WHERE lf.match_id = e.match_id
           AND lf.type = 'CricketLegFinished'
           AND lf.id < e.id) as leg_num
      FROM cricket_events e
      JOIN cricket_matches m ON m.id = e.match_id AND m.finished = 1
      WHERE e.type = 'CricketTurnAdded'
        AND json_extract(e.data, '$.playerId') NOT LIKE 'guest-%'
        AND json_extract(e.data, '$.playerId') NOT LIKE 'temp-%'
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
    LEFT JOIN profiles p ON p.id = td.player_id
    GROUP BY td.player_id, td.match_id, td.leg_num
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

/**
 * Wenigste Darts bis Finish (Cricket-Leg) — (+) mehrere pro Spieler
 * Zählt Darts des Gewinners in einem gewonnenen Cricket-Leg
 */
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
        json_extract(e.data, '$.winnerPlayerId') as winner_id,
        ROW_NUMBER() OVER (PARTITION BY e.match_id ORDER BY e.id) as leg_num
      FROM cricket_events e
      WHERE e.type = 'CricketLegFinished'
    ),
    leg_darts AS (
      SELECT
        lb.winner_id as player_id,
        lb.match_id,
        lb.leg_num,
        (SELECT SUM(CAST(json_extract(t.data, '$.dartCount') AS INTEGER))
         FROM cricket_events t
         WHERE t.match_id = lb.match_id
           AND t.type = 'CricketTurnAdded'
           AND json_extract(t.data, '$.playerId') = lb.winner_id
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
    LEFT JOIN profiles p ON p.id = ld.player_id
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

/**
 * Beste Scoring-Runde (Cricket, meiste Punkte in einer Aufnahme) — (+) mehrere pro Spieler
 * Nutzt enriched "marks" Feld (= Treffer/Marks in einem Turn)
 * Gleiche Daten wie BestTurnMarks, aber explizit als "Scoring-Runde"
 */
export async function getCricketHighscoreBestScoringRound(limit: number = 5): Promise<HighscoreEntrySQL[]> {
  // Identisch zu BestTurnMarks — meiste Marks in einem Turn
  return getCricketHighscoreBestTurnMarks(limit)
}

/**
 * Meiste Bulls in einem Cricket-Leg — (+) mehrere pro Spieler
 * Nutzt enriched "bullCount" + "doubleBullCount" Felder
 */
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
        json_extract(e.data, '$.playerId') as player_id,
        e.match_id,
        COALESCE(CAST(json_extract(e.data, '$.bullCount') AS INTEGER), 0) +
        COALESCE(CAST(json_extract(e.data, '$.doubleBullCount') AS INTEGER), 0) as bulls,
        (SELECT COUNT(*) FROM cricket_events lf
         WHERE lf.match_id = e.match_id
           AND lf.type = 'CricketLegFinished'
           AND lf.id < e.id) as leg_num
      FROM cricket_events e
      JOIN cricket_matches m ON m.id = e.match_id AND m.finished = 1
      WHERE e.type = 'CricketTurnAdded'
        AND json_extract(e.data, '$.playerId') NOT LIKE 'guest-%'
        AND json_extract(e.data, '$.playerId') NOT LIKE 'temp-%'
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
    LEFT JOIN profiles p ON p.id = td.player_id
    GROUP BY td.player_id, td.match_id, td.leg_num
    HAVING bulls > 0
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
// Highscore Orchestrierung
// ============================================================================

import { HIGHSCORE_CATEGORIES, type HighscoreCategory, type HighscoreCategoryId } from '../types/highscores'

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

// ============================================================================
// Killer Statistics
// ============================================================================

export type KillerFullStats = {
  matchesPlayed: number
  matchesWon: number
  winRate: number
  avgPlacement: number
  totalDarts: number
  avgDartsPerMatch: number
  totalKills: number
  avgKillsPerMatch: number
  avgHitRate: number
  avgRoundsPerMatch: number
}

export async function getKillerFullStats(playerId: string): Promise<KillerFullStats> {
  try {
    // Matches + Siege
    const matchStats = await queryOne<{
      matches_played: number
      matches_won: number
    }>(`
      SELECT
        COUNT(*) as matches_played,
        SUM(CASE WHEN m.winner_id = ? THEN 1 ELSE 0 END) as matches_won
      FROM killer_matches m
      JOIN killer_match_players mp ON mp.match_id = m.id AND mp.player_id = ?
      WHERE m.finished = 1
    `, [playerId, playerId])

    const matchesPlayed = matchStats?.matches_played ?? 0
    const matchesWon = matchStats?.matches_won ?? 0

    if (matchesPlayed === 0) {
      return { matchesPlayed: 0, matchesWon: 0, winRate: 0, avgPlacement: 0, totalDarts: 0, avgDartsPerMatch: 0, totalKills: 0, avgKillsPerMatch: 0, avgHitRate: 0, avgRoundsPerMatch: 0 }
    }

    // Darts, Hits, Kills aus enriched Events
    const eventStats = await queryOne<{
      total_darts: number
      total_hits: number
      total_kills: number
    }>(`
      SELECT
        COALESCE(SUM(json_extract(e.data, '$.totalDarts')), 0) as total_darts,
        COALESCE(SUM(json_extract(e.data, '$.hits')), 0) as total_hits,
        COALESCE(SUM(json_extract(e.data, '$.killCount')), 0) as total_kills
      FROM killer_events e
      JOIN killer_match_players mp ON mp.match_id = e.match_id AND mp.player_id = ?
      WHERE e.type = 'KillerTurnAdded'
        AND json_extract(e.data, '$.playerId') = ?
        AND e.match_id IN (SELECT id FROM killer_matches WHERE finished = 1)
    `, [playerId, playerId])

    // Avg Placement aus final_standings
    const placementStats = await queryOne<{
      avg_placement: number
    }>(`
      WITH standings AS (
        SELECT
          m.id,
          json_extract(value, '$.position') as pos
        FROM killer_matches m
        JOIN killer_match_players mp ON mp.match_id = m.id AND mp.player_id = ?
        , json_each(m.final_standings)
        WHERE m.finished = 1
          AND m.final_standings IS NOT NULL
          AND json_extract(value, '$.playerId') = ?
      )
      SELECT AVG(pos) as avg_placement FROM standings
    `, [playerId, playerId])

    // Avg Rounds pro Match (max roundNumber aus KillerTurnAdded)
    const roundStats = await queryOne<{
      avg_rounds: number
    }>(`
      WITH match_rounds AS (
        SELECT
          e.match_id,
          MAX(json_extract(e.data, '$.roundNumber')) as max_round
        FROM killer_events e
        JOIN killer_match_players mp ON mp.match_id = e.match_id AND mp.player_id = ?
        WHERE e.type = 'KillerTurnAdded'
          AND e.match_id IN (SELECT id FROM killer_matches WHERE finished = 1)
        GROUP BY e.match_id
      )
      SELECT AVG(max_round) as avg_rounds FROM match_rounds
    `, [playerId])

    const totalDarts = eventStats?.total_darts ?? 0
    const totalHits = eventStats?.total_hits ?? 0
    const totalKills = eventStats?.total_kills ?? 0

    return {
      matchesPlayed,
      matchesWon,
      winRate: Math.round((matchesWon / matchesPlayed) * 1000) / 10,
      avgPlacement: Math.round((placementStats?.avg_placement ?? 0) * 10) / 10,
      totalDarts,
      avgDartsPerMatch: Math.round((totalDarts / matchesPlayed) * 10) / 10,
      totalKills,
      avgKillsPerMatch: Math.round((totalKills / matchesPlayed) * 10) / 10,
      avgHitRate: totalDarts > 0 ? Math.round((totalHits / totalDarts) * 1000) / 10 : 0,
      avgRoundsPerMatch: Math.round((roundStats?.avg_rounds ?? 0) * 10) / 10,
    }
  } catch (e) {
    console.warn('[Stats] getKillerFullStats failed:', e)
    return { matchesPlayed: 0, matchesWon: 0, winRate: 0, avgPlacement: 0, totalDarts: 0, avgDartsPerMatch: 0, totalKills: 0, avgKillsPerMatch: 0, avgHitRate: 0, avgRoundsPerMatch: 0 }
  }
}

// ============================================================================
// TASK 16: Cross-Game Dashboard Stats
// ============================================================================

export type ActivityDay = {
  date: string       // YYYY-MM-DD
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
    // Alle Modi: Matches + Wins zählen
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
    ]

    let totalMatches = 0
    let totalWins = 0
    let totalMulti = 0
    let totalMultiWins = 0
    const distribution: GameModeDistribution[] = []

    for (const mode of modes) {
      try {
        let result: { matches: number; wins: number; multi: number; multi_wins: number } | null
        if (mode.winnerCol) {
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
          result = await queryOne<{ matches: number; wins: number; multi: number; multi_wins: number }>(`
            SELECT
              COUNT(*) as matches,
              (SELECT COUNT(*) FROM ${mode.eventsTable} e2
               WHERE e2.match_id IN (SELECT m2.id FROM ${mode.table}_matches m2 JOIN ${mode.playerTable} mp2 ON mp2.match_id = m2.id AND mp2.player_id = ? WHERE m2.finished = 1)
               AND e2.type = '${mode.winEvent}'
               AND json_extract(e2.data, '${mode.winField}') = ?) as wins,
              SUM(CASE WHEN (SELECT COUNT(*) FROM ${mode.playerTable} WHERE match_id = m.id) > 1 THEN 1 ELSE 0 END) as multi,
              0 as multi_wins
            FROM ${mode.table}_matches m
            JOIN ${mode.playerTable} mp ON mp.match_id = m.id AND mp.player_id = ?
            WHERE m.finished = 1
          `, [playerId, playerId, playerId])
          // For event-based wins, calculate multi_wins separately
          if (result && result.wins > 0) {
            const multiWins = await queryOne<{ mw: number }>(`
              SELECT COUNT(*) as mw FROM ${mode.eventsTable} e
              WHERE e.type = '${mode.winEvent}'
                AND json_extract(e.data, '${mode.winField}') = ?
                AND e.match_id IN (
                  SELECT m.id FROM ${mode.table}_matches m
                  JOIN ${mode.playerTable} mp ON mp.match_id = m.id AND mp.player_id = ?
                  WHERE m.finished = 1
                    AND (SELECT COUNT(*) FROM ${mode.playerTable} WHERE match_id = m.id) > 1
                )
            `, [playerId, playerId])
            if (result) result.multi_wins = multiWins?.mw ?? 0
          }
        }
        const m = result?.matches ?? 0
        const w = result?.wins ?? 0
        if (m > 0) {
          distribution.push({ mode: mode.table, label: mode.label, matchCount: m, percentage: 0 })
        }
        totalMatches += m
        totalWins += w
        totalMulti += result?.multi ?? 0
        totalMultiWins += result?.multi_wins ?? 0
      } catch { /* table might not exist */ }
    }

    // Percentages berechnen
    for (const d of distribution) {
      d.percentage = totalMatches > 0 ? Math.round(d.matchCount / totalMatches * 1000) / 10 : 0
    }
    distribution.sort((a, b) => b.matchCount - a.matchCount)

    // Activity Heatmap (letzte 365 Tage)
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

    // Playing Streak berechnen
    const allDates = heatmapRows.map(r => r.date).sort()
    let currentStreak = 0
    let longestStreak = 0
    let streak = 0
    const today = new Date().toISOString().split('T')[0]

    if (allDates.length > 0) {
      // Von heute rückwärts zählen
      const dateSet = new Set(allDates)
      const d = new Date(today)
      while (dateSet.has(d.toISOString().split('T')[0])) {
        currentStreak++
        d.setDate(d.getDate() - 1)
      }
      // Wenn heute nicht gespielt, gestern prüfen
      if (currentStreak === 0) {
        const yesterday = new Date(today)
        yesterday.setDate(yesterday.getDate() - 1)
        const y = new Date(yesterday)
        while (dateSet.has(y.toISOString().split('T')[0])) {
          currentStreak++
          y.setDate(y.getDate() - 1)
        }
      }

      // Longest streak
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
// TASK 17: X01 Segment-Analyse
// ============================================================================

export type SegmentAccuracy = {
  field: number | string  // 1-20, 'BULL'
  singleAttempts: number
  singleHits: number
  doubleAttempts: number
  doubleHits: number
  tripleAttempts: number
  tripleHits: number
  totalAttempts: number
  totalHits: number
  hitRate: number
}

export type DoubleFieldRate = {
  field: string   // "D1" - "D20", "DBULL"
  attempts: number
  hits: number
  hitRate: number
}

export async function getX01SegmentAccuracy(playerId: string): Promise<SegmentAccuracy[]> {
  try {
    // Extract individual darts with aim data from X01 visits
    const darts = await query<{
      bed: string
      mult: number
      aim_bed: string | null
      aim_mult: number | null
    }>(`
      SELECT
        json_extract(d.value, '$.bed') as bed,
        json_extract(d.value, '$.mult') as mult,
        json_extract(d.value, '$.aim.bed') as aim_bed,
        json_extract(d.value, '$.aim.mult') as aim_mult
      FROM x01_events e
      JOIN x01_match_players mp ON mp.match_id = e.match_id AND mp.player_id = ?
      JOIN x01_matches m ON m.id = e.match_id AND m.finished = 1
      , json_each(e.data, '$.darts') d
      WHERE e.type = 'VisitAdded'
        AND json_extract(e.data, '$.playerId') = ?
    `, [playerId, playerId])

    const segments: Record<string, SegmentAccuracy> = {}
    const allFields = [...Array.from({ length: 20 }, (_, i) => i + 1), 'BULL']
    for (const f of allFields) {
      const key = String(f)
      segments[key] = { field: f, singleAttempts: 0, singleHits: 0, doubleAttempts: 0, doubleHits: 0, tripleAttempts: 0, tripleHits: 0, totalAttempts: 0, totalHits: 0, hitRate: 0 }
    }

    for (const dart of darts) {
      const aimBed = dart.aim_bed ?? dart.bed
      const aimMult = dart.aim_mult ?? dart.mult
      if (!aimBed || aimBed === 'MISS') continue

      // Normalize bed: DBULL -> BULL field
      const normalizedAim = aimBed === 'DBULL' ? 'BULL' : aimBed
      const normalizedHit = dart.bed === 'DBULL' || dart.bed === 'BULL' ? 'BULL' : dart.bed
      const key = String(normalizedAim)
      if (!segments[key]) continue

      segments[key].totalAttempts++
      if (aimMult === 1) segments[key].singleAttempts++
      if (aimMult === 2) segments[key].doubleAttempts++
      if (aimMult === 3) segments[key].tripleAttempts++

      // Hit = same field as aimed
      if (String(normalizedHit) === key) {
        segments[key].totalHits++
        if (dart.mult === 1 && aimMult === 1) segments[key].singleHits++
        if (dart.mult === 2 && aimMult === 2) segments[key].doubleHits++
        if (dart.mult === 3 && aimMult === 3) segments[key].tripleHits++
      }
    }

    const result = Object.values(segments).filter(s => s.totalAttempts > 0)
    for (const s of result) {
      s.hitRate = Math.round(s.totalHits / s.totalAttempts * 1000) / 10
    }
    return result.sort((a, b) => b.totalAttempts - a.totalAttempts)
  } catch (e) {
    console.warn('[Stats] getX01SegmentAccuracy failed:', e)
    return []
  }
}

export async function getX01DoubleRates(playerId: string): Promise<DoubleFieldRate[]> {
  try {
    const darts = await query<{
      bed: string
      mult: number
      aim_bed: string | null
      aim_mult: number | null
    }>(`
      SELECT
        json_extract(d.value, '$.bed') as bed,
        json_extract(d.value, '$.mult') as mult,
        json_extract(d.value, '$.aim.bed') as aim_bed,
        json_extract(d.value, '$.aim.mult') as aim_mult
      FROM x01_events e
      JOIN x01_match_players mp ON mp.match_id = e.match_id AND mp.player_id = ?
      JOIN x01_matches m ON m.id = e.match_id AND m.finished = 1
      , json_each(e.data, '$.darts') d
      WHERE e.type = 'VisitAdded'
        AND json_extract(e.data, '$.playerId') = ?
        AND (json_extract(d.value, '$.aim.mult') = 2 OR (json_extract(d.value, '$.aim.mult') IS NULL AND json_extract(d.value, '$.mult') = 2))
    `, [playerId, playerId])

    const doubles: Record<string, { attempts: number; hits: number }> = {}

    for (const dart of darts) {
      const aimBed = dart.aim_bed ?? dart.bed
      const field = aimBed === 'DBULL' || aimBed === 'BULL' ? 'DBULL' : `D${aimBed}`
      if (!doubles[field]) doubles[field] = { attempts: 0, hits: 0 }
      doubles[field].attempts++
      if (dart.mult === 2 && (dart.bed === aimBed || (field === 'DBULL' && (dart.bed === 'DBULL' || dart.bed === 'BULL')))) {
        doubles[field].hits++
      }
    }

    return Object.entries(doubles)
      .map(([field, d]) => ({ field, attempts: d.attempts, hits: d.hits, hitRate: Math.round(d.hits / d.attempts * 1000) / 10 }))
      .sort((a, b) => b.attempts - a.attempts)
  } catch (e) {
    console.warn('[Stats] getX01DoubleRates failed:', e)
    return []
  }
}

export async function getX01TrebleRates(playerId: string): Promise<DoubleFieldRate[]> {
  try {
    const darts = await query<{
      bed: string
      mult: number
      aim_bed: string | null
      aim_mult: number | null
    }>(`
      SELECT
        json_extract(d.value, '$.bed') as bed,
        json_extract(d.value, '$.mult') as mult,
        json_extract(d.value, '$.aim.bed') as aim_bed,
        json_extract(d.value, '$.aim.mult') as aim_mult
      FROM x01_events e
      JOIN x01_match_players mp ON mp.match_id = e.match_id AND mp.player_id = ?
      JOIN x01_matches m ON m.id = e.match_id AND m.finished = 1
      , json_each(e.data, '$.darts') d
      WHERE e.type = 'VisitAdded'
        AND json_extract(e.data, '$.playerId') = ?
        AND (json_extract(d.value, '$.aim.mult') = 3 OR (json_extract(d.value, '$.aim.mult') IS NULL AND json_extract(d.value, '$.mult') = 3))
    `, [playerId, playerId])

    const trebles: Record<string, { attempts: number; hits: number }> = {}

    for (const dart of darts) {
      const aimBed = dart.aim_bed ?? dart.bed
      const field = `T${aimBed}`
      if (!trebles[field]) trebles[field] = { attempts: 0, hits: 0 }
      trebles[field].attempts++
      if (dart.mult === 3 && dart.bed === aimBed) {
        trebles[field].hits++
      }
    }

    return Object.entries(trebles)
      .map(([field, d]) => ({ field, attempts: d.attempts, hits: d.hits, hitRate: Math.round(d.hits / d.attempts * 1000) / 10 }))
      .sort((a, b) => b.attempts - a.attempts)
  } catch (e) {
    console.warn('[Stats] getX01TrebleRates failed:', e)
    return []
  }
}

// ============================================================================
// TASK 18: Formkurve & Momentum
// ============================================================================

export type FormCurvePoint = {
  matchId: string
  matchDate: string
  threeDartAvg: number
  checkoutPct: number
  won: boolean
  opponentNames: string
}

export type SessionPerformance = {
  sessionDate: string
  matchIndex: number  // 1st, 2nd, 3rd match of session
  threeDartAvg: number
  won: boolean
}

export type WarmupEffect = {
  firstMatchAvg: number
  laterMatchesAvg: number
  firstMatchWinRate: number
  laterMatchesWinRate: number
  difference: number       // laterAvg - firstAvg (positive = improves)
  sessionCount: number
}

export async function getX01FormCurve(playerId: string, limit: number = 20): Promise<FormCurvePoint[]> {
  try {
    const matches = await query<{
      match_id: string
      created_at: string
      avg: number
      checkout_attempts: number
      checkouts_made: number
      won: number
      opponents: string
    }>(`
      SELECT
        m.id as match_id,
        m.created_at,
        AVG(
          CAST(json_extract(e.data, '$.visitScore') AS REAL) /
          NULLIF(json_array_length(e.data, '$.darts'), 0) * 3
        ) as avg,
        COALESCE(SUM(CASE WHEN json_extract(e.data, '$.remainingAfter') IS NOT NULL
          AND CAST(json_extract(e.data, '$.remainingBefore') AS INTEGER) <= 170
          AND json_extract(e.data, '$.bust') IS NOT 1
          AND json_array_length(e.data, '$.darts') > 0
          THEN 1 ELSE 0 END), 0) as checkout_attempts,
        COALESCE(SUM(CASE WHEN json_extract(e.data, '$.finishingDartSeq') IS NOT NULL THEN 1 ELSE 0 END), 0) as checkouts_made,
        CASE WHEN (SELECT json_extract(e2.data, '$.winnerPlayerId') FROM x01_events e2
                   WHERE e2.match_id = m.id AND e2.type = 'MatchFinished') = ? THEN 1 ELSE 0 END as won,
        COALESCE((SELECT GROUP_CONCAT(p.name, ', ') FROM x01_match_players mp2
                  JOIN profiles p ON p.id = mp2.player_id
                  WHERE mp2.match_id = m.id AND mp2.player_id != ?), 'Solo') as opponents
      FROM x01_matches m
      JOIN x01_match_players mp ON mp.match_id = m.id AND mp.player_id = ?
      JOIN x01_events e ON e.match_id = m.id AND e.type = 'VisitAdded' AND json_extract(e.data, '$.playerId') = ?
      WHERE m.finished = 1
      GROUP BY m.id
      ORDER BY m.created_at DESC
      LIMIT ?
    `, [playerId, playerId, playerId, playerId, limit])

    return matches.reverse().map(m => ({
      matchId: m.match_id,
      matchDate: m.created_at,
      threeDartAvg: Math.round((m.avg || 0) * 100) / 100,
      checkoutPct: m.checkout_attempts > 0 ? Math.round(m.checkouts_made / m.checkout_attempts * 1000) / 10 : 0,
      won: m.won === 1,
      opponentNames: m.opponents || 'Solo',
    }))
  } catch (e) {
    console.warn('[Stats] getX01FormCurve failed:', e)
    return []
  }
}

export async function getSessionPerformance(playerId: string): Promise<{ sessions: SessionPerformance[]; warmup: WarmupEffect }> {
  try {
    // Alle X01 Matches mit Datum gruppiert nach Session (gleicher Tag)
    const matches = await query<{
      match_id: string
      match_date: string
      avg: number
      won: number
    }>(`
      SELECT
        m.id as match_id,
        date(m.created_at) as match_date,
        AVG(
          CAST(json_extract(e.data, '$.visitScore') AS REAL) /
          NULLIF(json_array_length(e.data, '$.darts'), 0) * 3
        ) as avg,
        CASE WHEN (SELECT json_extract(e2.data, '$.winnerPlayerId') FROM x01_events e2
                   WHERE e2.match_id = m.id AND e2.type = 'MatchFinished') = ? THEN 1 ELSE 0 END as won
      FROM x01_matches m
      JOIN x01_match_players mp ON mp.match_id = m.id AND mp.player_id = ?
      JOIN x01_events e ON e.match_id = m.id AND e.type = 'VisitAdded' AND json_extract(e.data, '$.playerId') = ?
      WHERE m.finished = 1
      GROUP BY m.id
      ORDER BY m.created_at ASC
    `, [playerId, playerId, playerId])

    // Group by date (session)
    const sessions: Record<string, { avg: number; won: number }[]> = {}
    for (const m of matches) {
      if (!sessions[m.match_date]) sessions[m.match_date] = []
      sessions[m.match_date].push({ avg: m.avg || 0, won: m.won })
    }

    const performance: SessionPerformance[] = []
    let firstMatchAvgSum = 0
    let laterAvgSum = 0
    let firstMatchWins = 0
    let laterWins = 0
    let firstCount = 0
    let laterCount = 0

    for (const [date, dayMatches] of Object.entries(sessions)) {
      if (dayMatches.length < 1) continue
      for (let i = 0; i < dayMatches.length; i++) {
        performance.push({
          sessionDate: date,
          matchIndex: i + 1,
          threeDartAvg: Math.round(dayMatches[i].avg * 100) / 100,
          won: dayMatches[i].won === 1,
        })
        if (i === 0) {
          firstMatchAvgSum += dayMatches[i].avg
          firstMatchWins += dayMatches[i].won
          firstCount++
        } else {
          laterAvgSum += dayMatches[i].avg
          laterWins += dayMatches[i].won
          laterCount++
        }
      }
    }

    const firstMatchAvg = firstCount > 0 ? Math.round(firstMatchAvgSum / firstCount * 100) / 100 : 0
    const laterMatchesAvg = laterCount > 0 ? Math.round(laterAvgSum / laterCount * 100) / 100 : 0

    return {
      sessions: performance,
      warmup: {
        firstMatchAvg,
        laterMatchesAvg,
        firstMatchWinRate: firstCount > 0 ? Math.round(firstMatchWins / firstCount * 1000) / 10 : 0,
        laterMatchesWinRate: laterCount > 0 ? Math.round(laterWins / laterCount * 1000) / 10 : 0,
        difference: Math.round((laterMatchesAvg - firstMatchAvg) * 100) / 100,
        sessionCount: Object.keys(sessions).length,
      },
    }
  } catch (e) {
    console.warn('[Stats] getSessionPerformance failed:', e)
    return { sessions: [], warmup: { firstMatchAvg: 0, laterMatchesAvg: 0, firstMatchWinRate: 0, laterMatchesWinRate: 0, difference: 0, sessionCount: 0 } }
  }
}

// ============================================================================
// TASK 19: X01 Checkout-Intelligenz
// ============================================================================

export type CheckoutByRemaining = {
  remaining: number
  attempts: number
  successes: number
  successRate: number
}

export type ClutchStats = {
  clutchAttempts: number      // Checkout-Attempts wenn gegnerisch vorne
  clutchSuccesses: number
  clutchRate: number
  normalAttempts: number
  normalSuccesses: number
  normalRate: number
  avgDartsAtDouble: number
}

export async function getCheckoutByRemaining(playerId: string): Promise<CheckoutByRemaining[]> {
  try {
    const results = await query<{
      remaining: number
      attempts: number
      successes: number
    }>(`
      SELECT
        CAST(json_extract(e.data, '$.remainingBefore') AS INTEGER) as remaining,
        COUNT(*) as attempts,
        SUM(CASE WHEN json_extract(e.data, '$.finishingDartSeq') IS NOT NULL THEN 1 ELSE 0 END) as successes
      FROM x01_events e
      JOIN x01_match_players mp ON mp.match_id = e.match_id AND mp.player_id = ?
      JOIN x01_matches m ON m.id = e.match_id AND m.finished = 1
      WHERE e.type = 'VisitAdded'
        AND json_extract(e.data, '$.playerId') = ?
        AND CAST(json_extract(e.data, '$.remainingBefore') AS INTEGER) <= 170
        AND json_extract(e.data, '$.bust') IS NOT 1
        AND CAST(json_extract(e.data, '$.remainingBefore') AS INTEGER) % 2 = 0
      GROUP BY remaining
      HAVING attempts >= 2
      ORDER BY remaining ASC
    `, [playerId, playerId])

    return results.map(r => ({
      remaining: r.remaining,
      attempts: r.attempts,
      successes: r.successes,
      successRate: Math.round(r.successes / r.attempts * 1000) / 10,
    }))
  } catch (e) {
    console.warn('[Stats] getCheckoutByRemaining failed:', e)
    return []
  }
}

export async function getClutchStats(playerId: string): Promise<ClutchStats> {
  try {
    // Avg darts at double per leg (visits where remaining <= 170)
    const dartsAtDouble = await queryOne<{ avg_visits: number }>(`
      WITH leg_doubles AS (
        SELECT e.match_id,
          json_extract(e.data, '$.legId') as leg_id,
          COUNT(*) as double_visits
        FROM x01_events e
        JOIN x01_match_players mp ON mp.match_id = e.match_id AND mp.player_id = ?
        JOIN x01_matches m ON m.id = e.match_id AND m.finished = 1
        WHERE e.type = 'VisitAdded'
          AND json_extract(e.data, '$.playerId') = ?
          AND CAST(json_extract(e.data, '$.remainingBefore') AS INTEGER) <= 170
        GROUP BY e.match_id, leg_id
      )
      SELECT AVG(double_visits) as avg_visits FROM leg_doubles
    `, [playerId, playerId])

    return {
      clutchAttempts: 0,
      clutchSuccesses: 0,
      clutchRate: 0,
      normalAttempts: 0,
      normalSuccesses: 0,
      normalRate: 0,
      avgDartsAtDouble: Math.round((dartsAtDouble?.avg_visits ?? 0) * 10) / 10,
    }
  } catch (e) {
    console.warn('[Stats] getClutchStats failed:', e)
    return { clutchAttempts: 0, clutchSuccesses: 0, clutchRate: 0, normalAttempts: 0, normalSuccesses: 0, normalRate: 0, avgDartsAtDouble: 0 }
  }
}

// ============================================================================
// TASK 20: Cricket Tiefenanalyse + H2H
// ============================================================================

export type CricketFieldMPR = {
  field: string   // "15", "16", ..., "20", "BULL"
  marks: number
  turns: number   // turns where this field was open
  mpr: number
}

export async function getCricketFieldMPR(playerId: string): Promise<CricketFieldMPR[]> {
  try {
    // Extract individual darts and their targets from cricket turns
    const darts = await query<{
      target: string
      mult: number
    }>(`
      SELECT
        json_extract(d.value, '$.target') as target,
        CAST(json_extract(d.value, '$.mult') AS INTEGER) as mult
      FROM cricket_events e
      JOIN cricket_match_players mp ON mp.match_id = e.match_id AND mp.player_id = ?
      JOIN cricket_matches m ON m.id = e.match_id AND m.finished = 1
      , json_each(e.data, '$.darts') d
      WHERE e.type = 'CricketTurnAdded'
        AND json_extract(e.data, '$.playerId') = ?
        AND json_extract(d.value, '$.target') != 'MISS'
    `, [playerId, playerId])

    const totalTurns = await queryOne<{ cnt: number }>(`
      SELECT COUNT(*) as cnt
      FROM cricket_events e
      JOIN cricket_match_players mp ON mp.match_id = e.match_id AND mp.player_id = ?
      JOIN cricket_matches m ON m.id = e.match_id AND m.finished = 1
      WHERE e.type = 'CricketTurnAdded'
        AND json_extract(e.data, '$.playerId') = ?
    `, [playerId, playerId])

    const fields: Record<string, number> = {}
    for (const d of darts) {
      const key = String(d.target)
      fields[key] = (fields[key] ?? 0) + d.mult
    }

    const turns = totalTurns?.cnt ?? 1
    return Object.entries(fields)
      .map(([field, marks]) => ({
        field,
        marks,
        turns,
        mpr: Math.round(marks / turns * 100) / 100,
      }))
      .sort((a, b) => b.marks - a.marks)
  } catch (e) {
    console.warn('[Stats] getCricketFieldMPR failed:', e)
    return []
  }
}

export async function getCricketHeadToHead(player1Id: string, player2Id: string): Promise<HeadToHead | null> {
  try {
    const result = await queryOne<{
      total: number
      p1_wins: number
      p2_wins: number
      p1_legs: number
      p2_legs: number
      last_played: string
      p1_name: string
      p2_name: string
    }>(`
      WITH shared_matches AS (
        SELECT m.id
        FROM cricket_matches m
        JOIN cricket_match_players mp1 ON mp1.match_id = m.id AND mp1.player_id = ?
        JOIN cricket_match_players mp2 ON mp2.match_id = m.id AND mp2.player_id = ?
        WHERE m.finished = 1
      )
      SELECT
        (SELECT COUNT(*) FROM shared_matches) as total,
        COALESCE((SELECT COUNT(*) FROM cricket_events e
         WHERE e.match_id IN (SELECT id FROM shared_matches)
         AND e.type = 'CricketMatchFinished'
         AND json_extract(e.data, '$.winnerPlayerId') = ?), 0) as p1_wins,
        COALESCE((SELECT COUNT(*) FROM cricket_events e
         WHERE e.match_id IN (SELECT id FROM shared_matches)
         AND e.type = 'CricketMatchFinished'
         AND json_extract(e.data, '$.winnerPlayerId') = ?), 0) as p2_wins,
        COALESCE((SELECT COUNT(*) FROM cricket_events e
         WHERE e.match_id IN (SELECT id FROM shared_matches)
         AND e.type = 'CricketLegFinished'
         AND json_extract(e.data, '$.winnerPlayerId') = ?), 0) as p1_legs,
        COALESCE((SELECT COUNT(*) FROM cricket_events e
         WHERE e.match_id IN (SELECT id FROM shared_matches)
         AND e.type = 'CricketLegFinished'
         AND json_extract(e.data, '$.winnerPlayerId') = ?), 0) as p2_legs,
        (SELECT MAX(m.created_at) FROM cricket_matches m WHERE m.id IN (SELECT id FROM shared_matches)) as last_played,
        (SELECT name FROM profiles WHERE id = ?) as p1_name,
        (SELECT name FROM profiles WHERE id = ?) as p2_name
    `, [player1Id, player2Id, player1Id, player2Id, player1Id, player2Id, player1Id, player2Id])

    if (!result || result.total === 0) return null

    return {
      player1Id, player2Id,
      player1Name: result.p1_name || player1Id,
      player2Name: result.p2_name || player2Id,
      totalMatches: result.total,
      player1Wins: result.p1_wins,
      player2Wins: result.p2_wins,
      player1LegsWon: result.p1_legs,
      player2LegsWon: result.p2_legs,
      lastPlayed: result.last_played,
    }
  } catch (e) {
    console.warn('[Stats] getCricketHeadToHead failed:', e)
    return null
  }
}

// ============================================================================
// TASK 21: Bob's 27 Langzeit-Progression + Rekorde
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
        CAST(json_extract(m.final_scores, '$.' || ?) AS INTEGER) as final_score,
        COALESCE(
          (SELECT
            ROUND(CAST(SUM(CASE WHEN json_extract(e.data, '$.hit') = 1 THEN 1 ELSE 0 END) AS REAL) /
            NULLIF(COUNT(*), 0) * 100, 1)
          FROM bobs27_events e
          WHERE e.match_id = m.id AND e.type = 'Bobs27Throw'
            AND json_extract(e.data, '$.playerId') = ?
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

export async function getBobs27DoubleWeakness(playerId: string): Promise<Bobs27DoubleWeakness[]> {
  try {
    const results = await query<{
      target_index: number
      attempts: number
      hits: number
    }>(`
      SELECT
        CAST(json_extract(e.data, '$.targetIndex') AS INTEGER) as target_index,
        COUNT(*) as attempts,
        SUM(CASE WHEN json_extract(e.data, '$.hit') = 1 THEN 1 ELSE 0 END) as hits
      FROM bobs27_events e
      JOIN bobs27_match_players mp ON mp.match_id = e.match_id AND mp.player_id = ?
      JOIN bobs27_matches m ON m.id = e.match_id AND m.finished = 1
      WHERE e.type = 'Bobs27Throw'
        AND json_extract(e.data, '$.playerId') = ?
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

// ============================================================================
// TASK 22: Achievements / Meilensteine
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
  progress?: number  // 0.0 - 1.0
}

export async function getFullAchievements(playerId: string): Promise<Achievement[]> {
  try {
    const achievements: Achievement[] = []

    // --- MILESTONES ---
    // Total matches played
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

    // --- RARE SCORES ---
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

    // --- SKILL ---
    // Best match average
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

    // --- DEDICATION ---
    // Different game modes played
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

    // Win streak
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
// TASK 23: Cross-Game H2H + Rivalen-Score
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
    ]

    for (const cfg of modeConfigs) {
      try {
        let rows: { opponent_id: string; opponent_name: string; opponent_color: string; matches: number; wins: number }[]

        if (cfg.winCol) {
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
          rows = await query<any>(`
            SELECT
              mp2.player_id as opponent_id,
              COALESCE(p.name, mp2.player_id) as opponent_name,
              p.color as opponent_color,
              COUNT(*) as matches,
              COALESCE(SUM(CASE WHEN (
                SELECT json_extract(e.data, '$.winnerPlayerId') FROM ${cfg.etable} e
                WHERE e.match_id = m.id AND e.type = '${cfg.winEvent}' LIMIT 1
              ) = ? THEN 1 ELSE 0 END), 0) as wins
            FROM ${cfg.table}_matches m
            JOIN ${cfg.ptable} mp1 ON mp1.match_id = m.id AND mp1.player_id = ?
            JOIN ${cfg.ptable} mp2 ON mp2.match_id = m.id AND mp2.player_id != ?
            LEFT JOIN profiles p ON p.id = mp2.player_id
            WHERE m.finished = 1
              AND (SELECT COUNT(*) FROM ${cfg.ptable} WHERE match_id = m.id) = 2
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
// TASK 24: Zeit-basierte Insights
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
    // Match durations (from matches that have duration_ms or finished_at - created_at)
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

    // Hourly win rate (X01 only, most data)
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
// TASK 25: Schwächen-Erkennung + Trainingsempfehlungen
// ============================================================================

export type TrainingRecommendation = {
  id: string
  priority: 'high' | 'medium' | 'low'
  category: 'doubles' | 'trebles' | 'checkout' | 'consistency' | 'endurance'
  title: string
  description: string
  currentValue: number
  targetValue?: number
  drill?: string   // empfohlene Übung
}

export async function getTrainingRecommendations(playerId: string): Promise<TrainingRecommendation[]> {
  try {
    const recommendations: TrainingRecommendation[] = []

    // 1. Checkout-Schwäche analysieren (Doppel-Rate)
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

    // 2. Schwächstes Doppelfeld (aus Bob's 27 oder X01 checkout data)
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

    // 3. Formkurve — Leistungsabfall erkennen
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

    // 4. Warmup-Effekt
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

    // 5. Scoring-Schwäche (T19 vs T20)
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
    getHighscoreBobs27BestScore,
    getHighscoreBobs27BestHitRate,
    getHighscoreBobs27MostWins,
    getHighscoreOperationBestScore,
    getHighscoreOperationBestAvgPPD,
    getHighscoreOperationBestHitRate,
    getHighscoreOperationMostWins,
    getAllHighscoresSQL,
    getPlayerAchievements,
    getATBMonthlyHitRate,
    getCTFMonthlyHitRate,
    getCTFMonthlyAvgScore,
    getStrMonthlyHitRate,
    getHighscoreMonthlyAvgScore,
    getOperationFullStats,
    getOperationMonthlyAvgScore,
    getOperationMonthlyHitRate,
    getKillerFullStats,
    // New Stats (Tasks 16-25)
    getCrossGameDashboard,
    getX01SegmentAccuracy,
    getX01DoubleRates,
    getX01TrebleRates,
    getX01FormCurve,
    getSessionPerformance,
    getCheckoutByRemaining,
    getClutchStats,
    getCricketFieldMPR,
    getCricketHeadToHead,
    getBobs27Progression,
    getBobs27DoubleWeakness,
    getFullAchievements,
    getCrossGameHeadToHead,
    getTimeInsights,
    getTrainingRecommendations,
  }
}
