// src/db/stats/player-insights.ts
// Cross-game player statistics: field accuracy, double success, player profile,
// win rates, session analysis, milestones, and deep head-to-head

import { query, queryOne } from '../index'

// ============================================================================
// 1. Field Accuracy (X01 only — free targeting gives unbiased data)
// ============================================================================

export type FieldAccuracy = {
  field: number | 'BULL'
  totalAttempts: number // how many darts landed on this field
  hits: number // same as totalAttempts (kept for compat)
  hitRate: number // NOT a real hit rate — use distributionPct instead
  avgScore: number
  triplePct: number
  doublePct: number
  distributionPct: number // % of all darts that landed on this field
}

/**
 * Treffer-Rate pro Feld 1-20 + Bull, basierend auf X01 Dart-Daten.
 * Nur X01 wird verwendet, da dort frei gezielt wird (keine vorgegebenen Ziele).
 */
export async function getFieldAccuracy(playerId: string): Promise<FieldAccuracy[]> {
  try {
    const darts = await query<{
      bed: string
      mult: number
      score: number
    }>(`
      SELECT
        json_extract(d.value, '$.bed') as bed,
        CAST(json_extract(d.value, '$.mult') AS INTEGER) as mult,
        CAST(json_extract(d.value, '$.score') AS INTEGER) as score
      FROM x01_events e
      JOIN x01_match_players mp ON mp.match_id = e.match_id AND mp.player_id = ?
      JOIN x01_matches m ON m.id = e.match_id AND m.finished = 1
      , json_each(e.data, '$.darts') d
      WHERE e.type = 'VisitAdded'
        AND json_extract(e.data, '$.playerId') = ?
    `, [playerId, playerId])

    // Group by field
    const fields: Record<string, {
      attempts: number
      hits: number
      totalScore: number
      triples: number
      doubles: number
    }> = {}

    for (const dart of darts) {
      if (!dart.bed || dart.bed === 'MISS') continue

      // Normalize: DBULL -> BULL
      const field = dart.bed === 'DBULL' ? 'BULL' : dart.bed
      if (!fields[field]) {
        fields[field] = { attempts: 0, hits: 0, totalScore: 0, triples: 0, doubles: 0 }
      }

      fields[field].attempts++
      fields[field].hits++ // If bed is not MISS, the dart hit this field
      fields[field].totalScore += dart.score || 0
      if (dart.mult === 3) fields[field].triples++
      if (dart.mult === 2) fields[field].doubles++
    }

    // Total darts thrown (including misses) for distribution calculation
    const totalDartsThrown = darts.length

    return Object.entries(fields)
      .map(([key, d]) => ({
        field: key === 'BULL' ? 'BULL' as const : parseInt(key, 10),
        totalAttempts: d.attempts,
        hits: d.hits,
        hitRate: totalDartsThrown > 0 ? Math.round(d.attempts / totalDartsThrown * 1000) / 10 : 0,
        avgScore: d.attempts > 0 ? Math.round(d.totalScore / d.attempts * 100) / 100 : 0,
        triplePct: d.hits > 0 ? Math.round(d.triples / d.hits * 1000) / 10 : 0,
        doublePct: d.hits > 0 ? Math.round(d.doubles / d.hits * 1000) / 10 : 0,
        distributionPct: totalDartsThrown > 0 ? Math.round(d.attempts / totalDartsThrown * 1000) / 10 : 0,
      }))
      .sort((a, b) => b.totalAttempts - a.totalAttempts)
  } catch (e) {
    console.warn('[Stats] getFieldAccuracy failed:', e)
    return []
  }
}

// ============================================================================
// 2. Double Success Rate per Field
// ============================================================================

export type DoubleFieldSuccess = {
  field: number | 'BULL'
  attempts: number
  hits: number
  hitRate: number
}

/**
 * Double-Trefferquote pro Feld, kombiniert aus:
 * - X01 Events (Darts mit mult=2 oder aim.mult=2)
 * - x01_finishing_doubles Tabelle
 * - Bob's 27 Events (jedes Target ist ein Doppel)
 */
export async function getDoubleSuccessPerField(playerId: string): Promise<DoubleFieldSuccess[]> {
  try {
    const doubles: Record<string, { attempts: number; hits: number }> = {}

    // --- X01: Checkout-Versuche aus VisitAdded Events ---
    // Wir nutzen die Checkout-Situationen (Remaining <= 170 und gerade) um echte
    // Double-Versuche zu schätzen. Jede Aufnahme bei einem checkbaren Rest zählt als Versuch.
    // Erfolgreiche Checkouts (remainingAfter === 0, kein Bust) zählen als Hits.
    const x01Checkouts = await query<{
      remaining_before: number
      remaining_after: number
      bust: number
      finishing_dart_bed: string | null
    }>(`
      SELECT
        CAST(json_extract(e.data, '$.remainingBefore') AS INTEGER) as remaining_before,
        CAST(json_extract(e.data, '$.remainingAfter') AS INTEGER) as remaining_after,
        CASE WHEN json_extract(e.data, '$.bust') = 1 THEN 1 ELSE 0 END as bust,
        json_extract(e.data, '$.darts[#-1].bed') as finishing_dart_bed
      FROM x01_events e
      JOIN x01_match_players mp ON mp.match_id = e.match_id AND mp.player_id = ?
      JOIN x01_matches m ON m.id = e.match_id AND m.finished = 1
      WHERE e.type = 'VisitAdded'
        AND json_extract(e.data, '$.playerId') = ?
        AND CAST(json_extract(e.data, '$.remainingBefore') AS INTEGER) <= 170
        AND CAST(json_extract(e.data, '$.remainingBefore') AS INTEGER) >= 2
        AND CAST(json_extract(e.data, '$.remainingBefore') AS INTEGER) % 2 = 0
    `, [playerId, playerId])

    // Für X01 schätzen wir: bei checkbarem Rest wird mind. 1 Dart aufs Doppel geworfen
    for (const visit of x01Checkouts) {
      // Welches Doppel wird angepeilt? Heuristik: Rest / 2 (vereinfacht)
      const targetDouble = visit.remaining_before <= 40
        ? String(visit.remaining_before / 2)
        : visit.remaining_before === 50 ? 'BULL' : '20'  // Bei höheren Rests meist D20

      if (!doubles[targetDouble]) doubles[targetDouble] = { attempts: 0, hits: 0 }
      doubles[targetDouble].attempts++

      // Erfolgreicher Checkout?
      if (visit.remaining_after === 0 && !visit.bust) {
        doubles[targetDouble].hits++
      }
    }

    // --- Bob's 27: Each round targets a specific double ---
    try {
      const bobs27Darts = await query<{
        target: number
        hits: number
        darts_thrown: number
      }>(`
        SELECT
          CAST(json_extract(e.data, '$.target') AS INTEGER) as target,
          CAST(json_extract(e.data, '$.hits') AS INTEGER) as hits,
          CAST(json_extract(e.data, '$.dartsThrown') AS INTEGER) as darts_thrown
        FROM bobs27_events e
        JOIN bobs27_match_players mp ON mp.match_id = e.match_id AND mp.player_id = ?
        JOIN bobs27_matches m ON m.id = e.match_id AND m.finished = 1
        WHERE e.type = 'Bobs27RoundPlayed'
          AND json_extract(e.data, '$.playerId') = ?
      `, [playerId, playerId])

      for (const round of bobs27Darts) {
        if (!round.target) continue
        // Bob's 27 target is the number (1-20, 25 for bull)
        const field = round.target === 25 ? 'BULL' : String(round.target)
        if (!doubles[field]) doubles[field] = { attempts: 0, hits: 0 }
        doubles[field].attempts += round.darts_thrown || 0
        doubles[field].hits += round.hits || 0
      }
    } catch {
      // bobs27 tables may not exist
    }

    return Object.entries(doubles)
      .filter(([, d]) => d.attempts > 0)
      .map(([key, d]) => ({
        field: key === 'BULL' ? 'BULL' as const : parseInt(key, 10),
        attempts: d.attempts,
        hits: d.hits,
        hitRate: d.attempts > 0 ? Math.round(d.hits / d.attempts * 1000) / 10 : 0,
      }))
      .sort((a, b) => b.attempts - a.attempts)
  } catch (e) {
    console.warn('[Stats] getDoubleSuccessPerField failed:', e)
    return []
  }
}

// ============================================================================
// 3. Player Type Profile
// ============================================================================

export type PlayerTypeProfile = {
  scoringRating: number
  finishingRating: number
  consistencyRating: number
  bullAccuracy: number
  tripleAccuracy: number
  clutchRating: number
  playerType: 'scorer' | 'finisher' | 'allrounder' | 'beginner'
  totalDartsThrown: number
  totalMatchesPlayed: number
}

/**
 * Spieler-Typ-Profil basierend auf X01-Daten.
 * Bewertet Scoring, Finishing, Consistency, Bull, Triple und Clutch-Performance.
 */
export async function getPlayerTypeProfile(playerId: string): Promise<PlayerTypeProfile | null> {
  try {
    // Total matches across all modes
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

    const matchCount = totalMatches?.cnt ?? 0
    if (matchCount === 0) return null

    // X01 core stats: average, darts, checkout
    const x01Stats = await queryOne<{
      overall_avg: number
      total_darts: number
      checkout_attempts: number
      checkouts_made: number
      match_count: number
    }>(`
      SELECT
        AVG(match_avg) as overall_avg,
        SUM(darts) as total_darts,
        SUM(co_attempts) as checkout_attempts,
        SUM(co_made) as checkouts_made,
        COUNT(*) as match_count
      FROM (
        SELECT
          m.id,
          AVG(
            CAST(json_extract(e.data, '$.visitScore') AS REAL) /
            NULLIF(json_array_length(e.data, '$.darts'), 0) * 3
          ) as match_avg,
          SUM(json_array_length(e.data, '$.darts')) as darts,
          SUM(CASE WHEN CAST(json_extract(e.data, '$.remainingBefore') AS INTEGER) <= 170
              AND json_extract(e.data, '$.bust') IS NOT 1
              THEN 1 ELSE 0 END) as co_attempts,
          SUM(CASE WHEN json_extract(e.data, '$.finishingDartSeq') IS NOT NULL THEN 1 ELSE 0 END) as co_made
        FROM x01_matches m
        JOIN x01_match_players mp ON mp.match_id = m.id AND mp.player_id = ?
        JOIN x01_events e ON e.match_id = m.id AND e.type = 'VisitAdded' AND json_extract(e.data, '$.playerId') = ?
        WHERE m.finished = 1
        GROUP BY m.id
      )
    `, [playerId, playerId])

    // Standard deviation of match averages for consistency
    const avgStddev = await queryOne<{ stddev: number; avg_of_avgs: number }>(`
      SELECT
        AVG(match_avg) as avg_of_avgs,
        AVG(match_avg * match_avg) - AVG(match_avg) * AVG(match_avg) as stddev
      FROM (
        SELECT
          AVG(
            CAST(json_extract(e.data, '$.visitScore') AS REAL) /
            NULLIF(json_array_length(e.data, '$.darts'), 0) * 3
          ) as match_avg
        FROM x01_matches m
        JOIN x01_match_players mp ON mp.match_id = m.id AND mp.player_id = ?
        JOIN x01_events e ON e.match_id = m.id AND e.type = 'VisitAdded' AND json_extract(e.data, '$.playerId') = ?
        WHERE m.finished = 1
        GROUP BY m.id
      )
    `, [playerId, playerId])

    // Bull accuracy from X01
    const bullStats = await queryOne<{ bull_attempts: number; bull_hits: number }>(`
      SELECT
        COUNT(*) as bull_attempts,
        SUM(CASE WHEN json_extract(d.value, '$.mult') = 2
            AND (json_extract(d.value, '$.bed') = 'DBULL' OR json_extract(d.value, '$.bed') = 'BULL')
            THEN 1 ELSE 0 END) as bull_hits
      FROM x01_events e
      JOIN x01_match_players mp ON mp.match_id = e.match_id AND mp.player_id = ?
      JOIN x01_matches m ON m.id = e.match_id AND m.finished = 1
      , json_each(e.data, '$.darts') d
      WHERE e.type = 'VisitAdded'
        AND json_extract(e.data, '$.playerId') = ?
        AND (json_extract(d.value, '$.bed') = 'BULL' OR json_extract(d.value, '$.bed') = 'DBULL')
    `, [playerId, playerId])

    // Triple accuracy from X01
    const tripleStats = await queryOne<{ triple_attempts: number; triple_hits: number }>(`
      SELECT
        COUNT(*) as triple_attempts,
        SUM(CASE WHEN json_extract(d.value, '$.mult') = 3 THEN 1 ELSE 0 END) as triple_hits
      FROM x01_events e
      JOIN x01_match_players mp ON mp.match_id = e.match_id AND mp.player_id = ?
      JOIN x01_matches m ON m.id = e.match_id AND m.finished = 1
      , json_each(e.data, '$.darts') d
      WHERE e.type = 'VisitAdded'
        AND json_extract(e.data, '$.playerId') = ?
        AND (json_extract(d.value, '$.aim.mult') = 3
             OR (json_extract(d.value, '$.aim.mult') IS NULL AND json_extract(d.value, '$.mult') = 3))
    `, [playerId, playerId])

    // Clutch: checkout when opponent is closer to finishing
    const clutchStats = await queryOne<{ clutch_attempts: number; clutch_hits: number }>(`
      SELECT
        COUNT(*) as clutch_attempts,
        SUM(CASE WHEN json_extract(e.data, '$.finishingDartSeq') IS NOT NULL THEN 1 ELSE 0 END) as clutch_hits
      FROM x01_events e
      JOIN x01_match_players mp ON mp.match_id = e.match_id AND mp.player_id = ?
      JOIN x01_matches m ON m.id = e.match_id AND m.finished = 1
      WHERE e.type = 'VisitAdded'
        AND json_extract(e.data, '$.playerId') = ?
        AND CAST(json_extract(e.data, '$.remainingBefore') AS INTEGER) <= 170
        AND json_extract(e.data, '$.bust') IS NOT 1
        AND (SELECT COUNT(*) FROM x01_match_players WHERE match_id = m.id) > 1
    `, [playerId, playerId])

    // Calculate ratings (0-100 scale)
    const overallAvg = x01Stats?.overall_avg ?? 0
    const totalDarts = x01Stats?.total_darts ?? 0
    const coAttempts = x01Stats?.checkout_attempts ?? 0
    const coMade = x01Stats?.checkouts_made ?? 0
    const checkoutPct = coAttempts > 0 ? (coMade / coAttempts) * 100 : 0

    // Scoring: 0=0avg, 100=100+avg (linear scale, capped)
    const scoringRating = Math.min(100, Math.max(0, Math.round(overallAvg)))

    // Finishing: based on checkout % (0%=0, 50%+=100)
    const finishingRating = Math.min(100, Math.max(0, Math.round(checkoutPct * 2)))

    // Consistency: based on stddev (lower = better). Variance value from SQL
    const variance = avgStddev?.stddev ?? 0
    const stddev = Math.sqrt(Math.max(0, variance))
    // stddev of 0 = perfect consistency (100), stddev of 30+ = low consistency (0)
    const consistencyRating = (x01Stats?.match_count ?? 0) >= 3
      ? Math.min(100, Math.max(0, Math.round(100 - (stddev / 30) * 100)))
      : 50 // default for too few matches

    // Bull accuracy
    const bullAcc = (bullStats?.bull_attempts ?? 0) > 0
      ? Math.min(100, Math.round((bullStats!.bull_hits / bullStats!.bull_attempts) * 100))
      : 0

    // Triple accuracy
    const tripleAcc = (tripleStats?.triple_attempts ?? 0) > 0
      ? Math.min(100, Math.round((tripleStats!.triple_hits / tripleStats!.triple_attempts) * 100))
      : 0

    // Clutch rating
    const clutchAttempts = clutchStats?.clutch_attempts ?? 0
    const clutchHits = clutchStats?.clutch_hits ?? 0
    const clutchRating = clutchAttempts >= 5
      ? Math.min(100, Math.max(0, Math.round((clutchHits / clutchAttempts) * 200))) // scale to 0-100
      : 50

    // Determine player type
    let playerType: PlayerTypeProfile['playerType'] = 'beginner'
    if (totalDarts < 100) {
      playerType = 'beginner'
    } else if (scoringRating >= 50 && finishingRating >= 50) {
      playerType = 'allrounder'
    } else if (scoringRating > finishingRating + 15) {
      playerType = 'scorer'
    } else if (finishingRating > scoringRating + 15) {
      playerType = 'finisher'
    } else {
      playerType = 'allrounder'
    }

    return {
      scoringRating,
      finishingRating,
      consistencyRating,
      bullAccuracy: bullAcc,
      tripleAccuracy: tripleAcc,
      clutchRating,
      playerType,
      totalDartsThrown: totalDarts,
      totalMatchesPlayed: matchCount,
    }
  } catch (e) {
    console.warn('[Stats] getPlayerTypeProfile failed:', e)
    return null
  }
}

// ============================================================================
// 4. Cross-Game Win Rate
// ============================================================================

export type CrossGameWinRate = {
  gameMode: string
  matchesPlayed: number
  matchesWon: number
  winRate: number
  bestStreak: number
}

/**
 * Gewinnquote pro Spielmodus (nur Mehrspieler-Matches).
 */
export async function getCrossGameWinRates(playerId: string): Promise<CrossGameWinRate[]> {
  try {
    const results: CrossGameWinRate[] = []

    // Modes with winner_id column on match table
    const directWinModes = [
      { table: 'atb', ptable: 'atb_match_players', label: 'Around the Block' },
      { table: 'ctf', ptable: 'ctf_match_players', label: 'Capture the Field' },
      { table: 'str', ptable: 'str_match_players', label: 'Straeuesschen' },
      { table: 'highscore', ptable: 'highscore_match_players', label: 'Highscore' },
      { table: 'shanghai', ptable: 'shanghai_match_players', label: 'Shanghai' },
      { table: 'killer', ptable: 'killer_match_players', label: 'Killer' },
      { table: 'bobs27', ptable: 'bobs27_match_players', label: "Bob's 27" },
      { table: 'operation', ptable: 'operation_match_players', label: 'Operation' },
    ] as const

    for (const mode of directWinModes) {
      try {
        const stats = await queryOne<{ matches: number; wins: number }>(`
          SELECT
            COUNT(*) as matches,
            SUM(CASE WHEN m.winner_id = ? THEN 1 ELSE 0 END) as wins
          FROM ${mode.table}_matches m
          JOIN ${mode.ptable} mp ON mp.match_id = m.id AND mp.player_id = ?
          WHERE m.finished = 1
            AND (SELECT COUNT(*) FROM ${mode.ptable} WHERE match_id = m.id) > 1
        `, [playerId, playerId])

        if (stats && stats.matches > 0) {
          // Compute best streak
          const matchResults = await query<{ won: number; created_at: string }>(`
            SELECT
              CASE WHEN m.winner_id = ? THEN 1 ELSE 0 END as won,
              m.created_at
            FROM ${mode.table}_matches m
            JOIN ${mode.ptable} mp ON mp.match_id = m.id AND mp.player_id = ?
            WHERE m.finished = 1
              AND (SELECT COUNT(*) FROM ${mode.ptable} WHERE match_id = m.id) > 1
            ORDER BY m.created_at ASC
          `, [playerId, playerId])

          let bestStreak = 0
          let currentStreak = 0
          for (const r of matchResults) {
            if (r.won === 1) {
              currentStreak++
              if (currentStreak > bestStreak) bestStreak = currentStreak
            } else {
              currentStreak = 0
            }
          }

          results.push({
            gameMode: mode.label,
            matchesPlayed: stats.matches,
            matchesWon: stats.wins,
            winRate: Math.round(stats.wins / stats.matches * 1000) / 10,
            bestStreak,
          })
        }
      } catch {
        // table might not exist
      }
    }

    // X01 (winner in events)
    try {
      const x01Stats = await queryOne<{ matches: number; wins: number }>(`
        SELECT
          COUNT(*) as matches,
          SUM(CASE WHEN (
            SELECT json_extract(e2.data, '$.winnerPlayerId') FROM x01_events e2
            WHERE e2.match_id = m.id AND e2.type = 'MatchFinished' LIMIT 1
          ) = ? THEN 1 ELSE 0 END) as wins
        FROM x01_matches m
        JOIN x01_match_players mp ON mp.match_id = m.id AND mp.player_id = ?
        WHERE m.finished = 1
          AND (SELECT COUNT(*) FROM x01_match_players WHERE match_id = m.id) > 1
      `, [playerId, playerId])

      if (x01Stats && x01Stats.matches > 0) {
        const x01Results = await query<{ won: number }>(`
          SELECT
            CASE WHEN (
              SELECT json_extract(e2.data, '$.winnerPlayerId') FROM x01_events e2
              WHERE e2.match_id = m.id AND e2.type = 'MatchFinished' LIMIT 1
            ) = ? THEN 1 ELSE 0 END as won
          FROM x01_matches m
          JOIN x01_match_players mp ON mp.match_id = m.id AND mp.player_id = ?
          WHERE m.finished = 1
            AND (SELECT COUNT(*) FROM x01_match_players WHERE match_id = m.id) > 1
          ORDER BY m.created_at ASC
        `, [playerId, playerId])

        let bestStreak = 0
        let currentStreak = 0
        for (const r of x01Results) {
          if (r.won === 1) {
            currentStreak++
            if (currentStreak > bestStreak) bestStreak = currentStreak
          } else {
            currentStreak = 0
          }
        }

        results.push({
          gameMode: 'X01',
          matchesPlayed: x01Stats.matches,
          matchesWon: x01Stats.wins,
          winRate: Math.round(x01Stats.wins / x01Stats.matches * 1000) / 10,
          bestStreak,
        })
      }
    } catch {
      // table might not exist
    }

    // Cricket (winner in events)
    try {
      const cricketStats = await queryOne<{ matches: number; wins: number }>(`
        SELECT
          COUNT(*) as matches,
          SUM(CASE WHEN (
            SELECT json_extract(e2.data, '$.winnerPlayerId') FROM cricket_events e2
            WHERE e2.match_id = m.id AND e2.type = 'CricketMatchFinished' LIMIT 1
          ) = ? THEN 1 ELSE 0 END) as wins
        FROM cricket_matches m
        JOIN cricket_match_players mp ON mp.match_id = m.id AND mp.player_id = ?
        WHERE m.finished = 1
          AND (SELECT COUNT(*) FROM cricket_match_players WHERE match_id = m.id) > 1
      `, [playerId, playerId])

      if (cricketStats && cricketStats.matches > 0) {
        const cricketResults = await query<{ won: number }>(`
          SELECT
            CASE WHEN (
              SELECT json_extract(e2.data, '$.winnerPlayerId') FROM cricket_events e2
              WHERE e2.match_id = m.id AND e2.type = 'CricketMatchFinished' LIMIT 1
            ) = ? THEN 1 ELSE 0 END as won
          FROM cricket_matches m
          JOIN cricket_match_players mp ON mp.match_id = m.id AND mp.player_id = ?
          WHERE m.finished = 1
            AND (SELECT COUNT(*) FROM cricket_match_players WHERE match_id = m.id) > 1
          ORDER BY m.created_at ASC
        `, [playerId, playerId])

        let bestStreak = 0
        let currentStreak = 0
        for (const r of cricketResults) {
          if (r.won === 1) {
            currentStreak++
            if (currentStreak > bestStreak) bestStreak = currentStreak
          } else {
            currentStreak = 0
          }
        }

        results.push({
          gameMode: 'Cricket',
          matchesPlayed: cricketStats.matches,
          matchesWon: cricketStats.wins,
          winRate: Math.round(cricketStats.wins / cricketStats.matches * 1000) / 10,
          bestStreak,
        })
      }
    } catch {
      // table might not exist
    }

    return results.sort((a, b) => b.matchesPlayed - a.matchesPlayed)
  } catch (e) {
    console.warn('[Stats] getCrossGameWinRates failed:', e)
    return []
  }
}

// ============================================================================
// 5. Session Analysis — Time of Day & Day of Week
// ============================================================================

export type TimeOfDayStats = {
  hour: number
  matchesPlayed: number
  avgPerformance: number
}

export type DayOfWeekPerformance = {
  day: number
  matchesPlayed: number
  winRate: number
}

/**
 * Leistung nach Tageszeit (basierend auf X01 3-Dart-Average).
 */
export async function getTimeOfDayStats(playerId: string): Promise<TimeOfDayStats[]> {
  try {
    const rows = await query<{ hour: number; matches: number; avg_perf: number }>(`
      SELECT
        CAST(strftime('%H', m.created_at) AS INTEGER) as hour,
        COUNT(DISTINCT m.id) as matches,
        AVG(
          CAST(json_extract(e.data, '$.visitScore') AS REAL) /
          NULLIF(json_array_length(e.data, '$.darts'), 0) * 3
        ) as avg_perf
      FROM x01_matches m
      JOIN x01_match_players mp ON mp.match_id = m.id AND mp.player_id = ?
      JOIN x01_events e ON e.match_id = m.id AND e.type = 'VisitAdded' AND json_extract(e.data, '$.playerId') = ?
      WHERE m.finished = 1
      GROUP BY hour
      ORDER BY hour ASC
    `, [playerId, playerId])

    return rows.map(r => ({
      hour: r.hour,
      matchesPlayed: r.matches,
      avgPerformance: Math.round((r.avg_perf || 0) * 100) / 100,
    }))
  } catch (e) {
    console.warn('[Stats] getTimeOfDayStats failed:', e)
    return []
  }
}

/**
 * Gewinnquote nach Wochentag (alle Spielmodi, nur Mehrspieler).
 */
export async function getDayOfWeekPerformance(playerId: string): Promise<DayOfWeekPerformance[]> {
  try {
    // Collect match results across all modes with day of week
    // SQLite strftime('%w') returns 0=Sunday, 6=Saturday
    const allMatchResults: { day: number; won: boolean }[] = []

    // X01
    try {
      const x01Rows = await query<{ dow: number; won: number }>(`
        SELECT
          CAST(strftime('%w', m.created_at) AS INTEGER) as dow,
          CASE WHEN (
            SELECT json_extract(e2.data, '$.winnerPlayerId') FROM x01_events e2
            WHERE e2.match_id = m.id AND e2.type = 'MatchFinished' LIMIT 1
          ) = ? THEN 1 ELSE 0 END as won
        FROM x01_matches m
        JOIN x01_match_players mp ON mp.match_id = m.id AND mp.player_id = ?
        WHERE m.finished = 1
          AND (SELECT COUNT(*) FROM x01_match_players WHERE match_id = m.id) > 1
      `, [playerId, playerId])
      for (const r of x01Rows) allMatchResults.push({ day: r.dow, won: r.won === 1 })
    } catch { /* ignore */ }

    // Cricket
    try {
      const cricketRows = await query<{ dow: number; won: number }>(`
        SELECT
          CAST(strftime('%w', m.created_at) AS INTEGER) as dow,
          CASE WHEN (
            SELECT json_extract(e2.data, '$.winnerPlayerId') FROM cricket_events e2
            WHERE e2.match_id = m.id AND e2.type = 'CricketMatchFinished' LIMIT 1
          ) = ? THEN 1 ELSE 0 END as won
        FROM cricket_matches m
        JOIN cricket_match_players mp ON mp.match_id = m.id AND mp.player_id = ?
        WHERE m.finished = 1
          AND (SELECT COUNT(*) FROM cricket_match_players WHERE match_id = m.id) > 1
      `, [playerId, playerId])
      for (const r of cricketRows) allMatchResults.push({ day: r.dow, won: r.won === 1 })
    } catch { /* ignore */ }

    // Direct-winner modes
    const directModes = [
      { table: 'atb', ptable: 'atb_match_players' },
      { table: 'ctf', ptable: 'ctf_match_players' },
      { table: 'str', ptable: 'str_match_players' },
      { table: 'shanghai', ptable: 'shanghai_match_players' },
      { table: 'killer', ptable: 'killer_match_players' },
    ] as const

    for (const mode of directModes) {
      try {
        const rows = await query<{ dow: number; won: number }>(`
          SELECT
            CAST(strftime('%w', m.created_at) AS INTEGER) as dow,
            CASE WHEN m.winner_id = ? THEN 1 ELSE 0 END as won
          FROM ${mode.table}_matches m
          JOIN ${mode.ptable} mp ON mp.match_id = m.id AND mp.player_id = ?
          WHERE m.finished = 1
            AND (SELECT COUNT(*) FROM ${mode.ptable} WHERE match_id = m.id) > 1
        `, [playerId, playerId])
        for (const r of rows) allMatchResults.push({ day: r.dow, won: r.won === 1 })
      } catch { /* ignore */ }
    }

    // Group by day
    const dayMap: Record<number, { matches: number; wins: number }> = {}
    for (const r of allMatchResults) {
      if (!dayMap[r.day]) dayMap[r.day] = { matches: 0, wins: 0 }
      dayMap[r.day].matches++
      if (r.won) dayMap[r.day].wins++
    }

    return Object.entries(dayMap)
      .map(([day, d]) => ({
        day: parseInt(day, 10),
        matchesPlayed: d.matches,
        winRate: d.matches > 0 ? Math.round(d.wins / d.matches * 1000) / 10 : 0,
      }))
      .sort((a, b) => a.day - b.day)
  } catch (e) {
    console.warn('[Stats] getDayOfWeekPerformance failed:', e)
    return []
  }
}

// ============================================================================
// 6. Milestone Tracker
// ============================================================================

export type Milestone = {
  title: string
  description: string
  achievedAt: string | null
  matchId: string | null
  value: number | null
}

/**
 * Meilensteine des Spielers: Erste 180, 9-Darter-Versuch, hoechster Checkout, etc.
 */
export async function getPlayerMilestones(playerId: string): Promise<Milestone[]> {
  try {
    const milestones: Milestone[] = []

    // First 180
    const first180 = await queryOne<{ ts: string; match_id: string }>(`
      SELECT e.ts, e.match_id
      FROM x01_events e
      JOIN x01_match_players mp ON mp.match_id = e.match_id AND mp.player_id = ?
      JOIN x01_matches m ON m.id = e.match_id AND m.finished = 1
      WHERE e.type = 'VisitAdded'
        AND json_extract(e.data, '$.playerId') = ?
        AND json_extract(e.data, '$.visitScore') = 180
      ORDER BY e.ts ASC
      LIMIT 1
    `, [playerId, playerId])
    milestones.push({
      title: 'Erste 180',
      description: 'Maximale Punktzahl mit 3 Darts',
      achievedAt: first180?.ts ?? null,
      matchId: first180?.match_id ?? null,
      value: first180 ? 180 : null,
    })

    // 9-darter attempt: leg won with <= 9 darts (or very close)
    const nineDarter = await queryOne<{ ts: string; match_id: string; darts_count: number }>(`
      SELECT lr.ts, lr.match_id, SUM(json_array_length(e.data, '$.darts')) as darts_count
      FROM (
        SELECT e.ts, e.match_id, json_extract(e.data, '$.legId') as leg_id,
               json_extract(e.data, '$.winnerPlayerId') as winner_id
        FROM x01_events e
        JOIN x01_match_players mp ON mp.match_id = e.match_id AND mp.player_id = ?
        WHERE e.type = 'LegFinished'
          AND json_extract(e.data, '$.winnerPlayerId') = ?
      ) lr
      JOIN x01_events e ON e.match_id = lr.match_id
        AND json_extract(e.data, '$.legId') = lr.leg_id
        AND e.type = 'VisitAdded'
        AND json_extract(e.data, '$.playerId') = ?
      GROUP BY lr.match_id, lr.leg_id
      HAVING darts_count <= 12
      ORDER BY darts_count ASC, lr.ts ASC
      LIMIT 1
    `, [playerId, playerId, playerId])
    milestones.push({
      title: nineDarter && nineDarter.darts_count <= 9 ? '9-Darter!' : 'Fast 9-Darter',
      description: nineDarter && nineDarter.darts_count <= 9
        ? 'Ein Leg in 9 Darts ausgecheckt!'
        : 'Ein Leg in 12 oder weniger Darts gewonnen',
      achievedAt: nineDarter?.ts ?? null,
      matchId: nineDarter?.match_id ?? null,
      value: nineDarter?.darts_count ?? null,
    })

    // Highest checkout
    const highestCo = await queryOne<{ remaining: number; ts: string; match_id: string }>(`
      SELECT
        CAST(json_extract(e.data, '$.remainingBefore') AS INTEGER) as remaining,
        e.ts,
        e.match_id
      FROM x01_events e
      JOIN x01_match_players mp ON mp.match_id = e.match_id AND mp.player_id = ?
      JOIN x01_matches m ON m.id = e.match_id AND m.finished = 1
      WHERE e.type = 'VisitAdded'
        AND json_extract(e.data, '$.playerId') = ?
        AND json_extract(e.data, '$.finishingDartSeq') IS NOT NULL
      ORDER BY remaining DESC
      LIMIT 1
    `, [playerId, playerId])
    milestones.push({
      title: 'Hoechster Checkout',
      description: highestCo ? `${highestCo.remaining} ausgecheckt` : 'Noch kein Checkout',
      achievedAt: highestCo?.ts ?? null,
      matchId: highestCo?.match_id ?? null,
      value: highestCo?.remaining ?? null,
    })

    // Best match average
    const bestAvg = await queryOne<{ avg: number; match_id: string; created_at: string }>(`
      SELECT
        AVG(
          CAST(json_extract(e.data, '$.visitScore') AS REAL) /
          NULLIF(json_array_length(e.data, '$.darts'), 0) * 3
        ) as avg,
        m.id as match_id,
        m.created_at
      FROM x01_matches m
      JOIN x01_match_players mp ON mp.match_id = m.id AND mp.player_id = ?
      JOIN x01_events e ON e.match_id = m.id AND e.type = 'VisitAdded' AND json_extract(e.data, '$.playerId') = ?
      WHERE m.finished = 1
      GROUP BY m.id
      ORDER BY avg DESC
      LIMIT 1
    `, [playerId, playerId])
    milestones.push({
      title: 'Bester Match-Durchschnitt',
      description: bestAvg ? `3-Dart-Avg von ${Math.round((bestAvg.avg || 0) * 100) / 100}` : 'Noch keine Daten',
      achievedAt: bestAvg?.created_at ?? null,
      matchId: bestAvg?.match_id ?? null,
      value: bestAvg ? Math.round((bestAvg.avg || 0) * 100) / 100 : null,
    })

    // Longest win streak (X01 multiplayer)
    const x01Results = await query<{ won: number; ts: string; match_id: string }>(`
      SELECT
        CASE WHEN (
          SELECT json_extract(e2.data, '$.winnerPlayerId') FROM x01_events e2
          WHERE e2.match_id = m.id AND e2.type = 'MatchFinished' LIMIT 1
        ) = ? THEN 1 ELSE 0 END as won,
        m.created_at as ts,
        m.id as match_id
      FROM x01_matches m
      JOIN x01_match_players mp ON mp.match_id = m.id AND mp.player_id = ?
      WHERE m.finished = 1
        AND (SELECT COUNT(*) FROM x01_match_players WHERE match_id = m.id) > 1
      ORDER BY m.created_at ASC
    `, [playerId, playerId])

    let longestStreak = 0
    let currentStreak = 0
    let streakEndTs: string | null = null
    let streakEndMatchId: string | null = null
    for (const r of x01Results) {
      if (r.won === 1) {
        currentStreak++
        if (currentStreak > longestStreak) {
          longestStreak = currentStreak
          streakEndTs = r.ts
          streakEndMatchId = r.match_id
        }
      } else {
        currentStreak = 0
      }
    }
    milestones.push({
      title: 'Laengste Siegesserie',
      description: longestStreak > 0 ? `${longestStreak} Siege in Folge (X01)` : 'Noch keine Serie',
      achievedAt: streakEndTs,
      matchId: streakEndMatchId,
      value: longestStreak > 0 ? longestStreak : null,
    })

    // 100th match
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
    milestones.push({
      title: '100. Match',
      description: total >= 100 ? '100 Matches abgeschlossen!' : `${total}/100 Matches gespielt`,
      achievedAt: total >= 100 ? 'achieved' : null,
      matchId: null,
      value: total,
    })

    // Total 180s count
    const count180 = await queryOne<{ cnt: number }>(`
      SELECT COUNT(*) as cnt
      FROM x01_events e
      JOIN x01_match_players mp ON mp.match_id = e.match_id AND mp.player_id = ?
      JOIN x01_matches m ON m.id = e.match_id AND m.finished = 1
      WHERE e.type = 'VisitAdded'
        AND json_extract(e.data, '$.playerId') = ?
        AND json_extract(e.data, '$.visitScore') = 180
    `, [playerId, playerId])
    const c180 = count180?.cnt ?? 0
    milestones.push({
      title: '180er Sammler',
      description: c180 > 0 ? `${c180} Maximum-Scores geworfen` : 'Noch keine 180',
      achievedAt: c180 > 0 ? 'achieved' : null,
      matchId: null,
      value: c180,
    })

    return milestones
  } catch (e) {
    console.warn('[Stats] getPlayerMilestones failed:', e)
    return []
  }
}

// ============================================================================
// 7. Head-to-Head Deep Analysis
// ============================================================================

export type DeepH2H = {
  opponentId: string
  opponentName: string
  modes: {
    mode: string
    wins: number
    losses: number
    draws: number
  }[]
  totalWins: number
  totalLosses: number
  avgDiffWhenWinning: number
  checkoutPctVsOpponent: number
  last5: ('W' | 'L' | 'D')[]
}

/**
 * Tiefenanalyse Head-to-Head zwischen zwei Spielern, ueber alle Spielmodi.
 */
export async function getDeepHeadToHead(playerId: string, opponentId: string): Promise<DeepH2H | null> {
  try {
    // Get opponent name
    const opponent = await queryOne<{ name: string }>(`
      SELECT name FROM profiles WHERE id = ?
    `, [opponentId])
    if (!opponent) return null

    const modes: DeepH2H['modes'] = []
    let totalWins = 0
    let totalLosses = 0

    // Recent match results (all modes) for last5
    const recentResults: { ts: string; result: 'W' | 'L' | 'D' }[] = []

    // --- X01 ---
    try {
      const x01 = await query<{ match_id: string; won: number; created_at: string }>(`
        SELECT
          m.id as match_id,
          CASE
            WHEN (SELECT json_extract(e2.data, '$.winnerPlayerId') FROM x01_events e2
                  WHERE e2.match_id = m.id AND e2.type = 'MatchFinished' LIMIT 1) = ? THEN 1
            WHEN (SELECT json_extract(e2.data, '$.winnerPlayerId') FROM x01_events e2
                  WHERE e2.match_id = m.id AND e2.type = 'MatchFinished' LIMIT 1) = ? THEN -1
            ELSE 0
          END as won,
          m.created_at
        FROM x01_matches m
        JOIN x01_match_players mp1 ON mp1.match_id = m.id AND mp1.player_id = ?
        JOIN x01_match_players mp2 ON mp2.match_id = m.id AND mp2.player_id = ?
        WHERE m.finished = 1
        ORDER BY m.created_at ASC
      `, [playerId, opponentId, playerId, opponentId])

      let w = 0, l = 0, d = 0
      for (const r of x01) {
        if (r.won === 1) { w++; recentResults.push({ ts: r.created_at, result: 'W' }) }
        else if (r.won === -1) { l++; recentResults.push({ ts: r.created_at, result: 'L' }) }
        else { d++; recentResults.push({ ts: r.created_at, result: 'D' }) }
      }
      if (w + l + d > 0) {
        modes.push({ mode: 'X01', wins: w, losses: l, draws: d })
        totalWins += w
        totalLosses += l
      }
    } catch { /* ignore */ }

    // --- Cricket ---
    try {
      const cricket = await query<{ won: number; created_at: string }>(`
        SELECT
          CASE
            WHEN (SELECT json_extract(e2.data, '$.winnerPlayerId') FROM cricket_events e2
                  WHERE e2.match_id = m.id AND e2.type = 'CricketMatchFinished' LIMIT 1) = ? THEN 1
            WHEN (SELECT json_extract(e2.data, '$.winnerPlayerId') FROM cricket_events e2
                  WHERE e2.match_id = m.id AND e2.type = 'CricketMatchFinished' LIMIT 1) = ? THEN -1
            ELSE 0
          END as won,
          m.created_at
        FROM cricket_matches m
        JOIN cricket_match_players mp1 ON mp1.match_id = m.id AND mp1.player_id = ?
        JOIN cricket_match_players mp2 ON mp2.match_id = m.id AND mp2.player_id = ?
        WHERE m.finished = 1
        ORDER BY m.created_at ASC
      `, [playerId, opponentId, playerId, opponentId])

      let w = 0, l = 0, d = 0
      for (const r of cricket) {
        if (r.won === 1) { w++; recentResults.push({ ts: r.created_at, result: 'W' }) }
        else if (r.won === -1) { l++; recentResults.push({ ts: r.created_at, result: 'L' }) }
        else { d++; recentResults.push({ ts: r.created_at, result: 'D' }) }
      }
      if (w + l + d > 0) {
        modes.push({ mode: 'Cricket', wins: w, losses: l, draws: d })
        totalWins += w
        totalLosses += l
      }
    } catch { /* ignore */ }

    // --- Direct winner_id modes ---
    const directModes = [
      { table: 'atb', ptable: 'atb_match_players', label: 'ATB' },
      { table: 'ctf', ptable: 'ctf_match_players', label: 'CTF' },
      { table: 'str', ptable: 'str_match_players', label: 'Straeuesschen' },
      { table: 'shanghai', ptable: 'shanghai_match_players', label: 'Shanghai' },
      { table: 'killer', ptable: 'killer_match_players', label: 'Killer' },
      { table: 'highscore', ptable: 'highscore_match_players', label: 'Highscore' },
    ] as const

    for (const cfg of directModes) {
      try {
        const rows = await query<{ won: number; created_at: string }>(`
          SELECT
            CASE
              WHEN m.winner_id = ? THEN 1
              WHEN m.winner_id = ? THEN -1
              ELSE 0
            END as won,
            m.created_at
          FROM ${cfg.table}_matches m
          JOIN ${cfg.ptable} mp1 ON mp1.match_id = m.id AND mp1.player_id = ?
          JOIN ${cfg.ptable} mp2 ON mp2.match_id = m.id AND mp2.player_id = ?
          WHERE m.finished = 1
          ORDER BY m.created_at ASC
        `, [playerId, opponentId, playerId, opponentId])

        let w = 0, l = 0, d = 0
        for (const r of rows) {
          if (r.won === 1) { w++; recentResults.push({ ts: r.created_at, result: 'W' }) }
          else if (r.won === -1) { l++; recentResults.push({ ts: r.created_at, result: 'L' }) }
          else { d++; recentResults.push({ ts: r.created_at, result: 'D' }) }
        }
        if (w + l + d > 0) {
          modes.push({ mode: cfg.label, wins: w, losses: l, draws: d })
          totalWins += w
          totalLosses += l
        }
      } catch { /* ignore */ }
    }

    if (totalWins + totalLosses === 0 && modes.length === 0) return null

    // X01 specific: average difference when winning + checkout % vs opponent
    let avgDiffWhenWinning = 0
    let checkoutPctVsOpponent = 0
    try {
      const x01AvgDiff = await queryOne<{ avg_diff: number }>(`
        SELECT AVG(my_avg - opp_avg) as avg_diff
        FROM (
          SELECT
            m.id,
            (SELECT AVG(
              CAST(json_extract(e.data, '$.visitScore') AS REAL) /
              NULLIF(json_array_length(e.data, '$.darts'), 0) * 3
            ) FROM x01_events e WHERE e.match_id = m.id AND e.type = 'VisitAdded'
              AND json_extract(e.data, '$.playerId') = ?) as my_avg,
            (SELECT AVG(
              CAST(json_extract(e.data, '$.visitScore') AS REAL) /
              NULLIF(json_array_length(e.data, '$.darts'), 0) * 3
            ) FROM x01_events e WHERE e.match_id = m.id AND e.type = 'VisitAdded'
              AND json_extract(e.data, '$.playerId') = ?) as opp_avg
          FROM x01_matches m
          JOIN x01_match_players mp1 ON mp1.match_id = m.id AND mp1.player_id = ?
          JOIN x01_match_players mp2 ON mp2.match_id = m.id AND mp2.player_id = ?
          WHERE m.finished = 1
            AND (SELECT json_extract(e2.data, '$.winnerPlayerId') FROM x01_events e2
                 WHERE e2.match_id = m.id AND e2.type = 'MatchFinished' LIMIT 1) = ?
        )
      `, [playerId, opponentId, playerId, opponentId, playerId])
      avgDiffWhenWinning = Math.round((x01AvgDiff?.avg_diff ?? 0) * 100) / 100

      const coPct = await queryOne<{ co_attempts: number; co_made: number }>(`
        SELECT
          SUM(CASE WHEN CAST(json_extract(e.data, '$.remainingBefore') AS INTEGER) <= 170
              AND json_extract(e.data, '$.bust') IS NOT 1
              THEN 1 ELSE 0 END) as co_attempts,
          SUM(CASE WHEN json_extract(e.data, '$.finishingDartSeq') IS NOT NULL THEN 1 ELSE 0 END) as co_made
        FROM x01_events e
        JOIN x01_match_players mp1 ON mp1.match_id = e.match_id AND mp1.player_id = ?
        JOIN x01_match_players mp2 ON mp2.match_id = e.match_id AND mp2.player_id = ?
        JOIN x01_matches m ON m.id = e.match_id AND m.finished = 1
        WHERE e.type = 'VisitAdded'
          AND json_extract(e.data, '$.playerId') = ?
      `, [playerId, opponentId, playerId])
      const coAttempts = coPct?.co_attempts ?? 0
      const coMade = coPct?.co_made ?? 0
      checkoutPctVsOpponent = coAttempts > 0 ? Math.round(coMade / coAttempts * 1000) / 10 : 0
    } catch { /* ignore */ }

    // Sort recent results by date desc and take last 5
    recentResults.sort((a, b) => b.ts.localeCompare(a.ts))
    const last5 = recentResults.slice(0, 5).map(r => r.result)

    return {
      opponentId,
      opponentName: opponent.name,
      modes,
      totalWins,
      totalLosses,
      avgDiffWhenWinning,
      checkoutPctVsOpponent,
      last5,
    }
  } catch (e) {
    console.warn('[Stats] getDeepHeadToHead failed:', e)
    return null
  }
}

// ============================================================================
// 8. Bob's 27 ↔ X01 Double Correlation
// ============================================================================

export type DoubleCorrelation = {
  field: number | 'BULL'
  bobs27HitRate: number  // hit rate in Bob's 27
  x01HitRate: number     // hit rate in X01 checkout attempts
  bobs27Attempts: number
  x01Attempts: number
  correlation: 'consistent' | 'training-better' | 'match-better'
}

/**
 * Vergleicht die Double-Trefferquote aus Bob's 27 (Training) mit X01 (Match-Play)
 * pro Feld. Zeigt ob Trainingsergebnisse sich in Matches widerspiegeln.
 */
export async function getBobs27X01DoubleCorrelation(playerId: string): Promise<DoubleCorrelation[]> {
  try {
    // --- Bob's 27: Each round targets a specific double (D1-D20, optionally DBull) ---
    const bobs27Data: Record<string, { attempts: number; hits: number }> = {}

    try {
      const bobs27Rounds = await query<{
        target: number
        hits: number
        darts_thrown: number
      }>(`
        SELECT
          CAST(json_extract(e.data, '$.target') AS INTEGER) as target,
          CAST(json_extract(e.data, '$.hits') AS INTEGER) as hits,
          CAST(json_extract(e.data, '$.dartsThrown') AS INTEGER) as darts_thrown
        FROM bobs27_events e
        JOIN bobs27_match_players mp ON mp.match_id = e.match_id AND mp.player_id = ?
        JOIN bobs27_matches m ON m.id = e.match_id AND m.finished = 1
        WHERE e.type = 'Bobs27RoundPlayed'
          AND json_extract(e.data, '$.playerId') = ?
      `, [playerId, playerId])

      for (const round of bobs27Rounds) {
        if (!round.target) continue
        const field = round.target === 25 ? 'BULL' : String(round.target)
        if (!bobs27Data[field]) bobs27Data[field] = { attempts: 0, hits: 0 }
        bobs27Data[field].attempts += round.darts_thrown || 0
        bobs27Data[field].hits += round.hits || 0
      }
    } catch {
      // bobs27 tables may not exist
    }

    // --- X01: Double attempts from events (mult=2 or aim.mult=2) ---
    const x01Data: Record<string, { attempts: number; hits: number }> = {}

    // X01 darts aimed at doubles
    const x01Darts = await query<{
      bed: string
      mult: number
      aim_bed: string | null
      aim_mult: number | null
    }>(`
      SELECT
        json_extract(d.value, '$.bed') as bed,
        CAST(json_extract(d.value, '$.mult') AS INTEGER) as mult,
        json_extract(d.value, '$.aim.bed') as aim_bed,
        json_extract(d.value, '$.aim.mult') as aim_mult
      FROM x01_events e
      JOIN x01_match_players mp ON mp.match_id = e.match_id AND mp.player_id = ?
      JOIN x01_matches m ON m.id = e.match_id AND m.finished = 1
      , json_each(e.data, '$.darts') d
      WHERE e.type = 'VisitAdded'
        AND json_extract(e.data, '$.playerId') = ?
        AND (json_extract(d.value, '$.aim.mult') = 2
             OR (json_extract(d.value, '$.aim.mult') IS NULL AND json_extract(d.value, '$.mult') = 2))
    `, [playerId, playerId])

    for (const dart of x01Darts) {
      const aimBed = dart.aim_bed ?? dart.bed
      if (!aimBed || aimBed === 'MISS') continue
      const field = aimBed === 'DBULL' || aimBed === 'BULL' ? 'BULL' : aimBed
      if (!x01Data[field]) x01Data[field] = { attempts: 0, hits: 0 }
      x01Data[field].attempts++
      if (dart.mult === 2) {
        const hitField = dart.bed === 'DBULL' || dart.bed === 'BULL' ? 'BULL' : dart.bed
        if (hitField === field) x01Data[field].hits++
      }
    }

    // Also incorporate x01_finishing_doubles (successful checkouts)
    try {
      const finishingDoubles = await query<{
        double_field: string
        count: number
      }>(`
        SELECT double_field, count
        FROM x01_finishing_doubles
        WHERE player_id = ? AND count > 0
      `, [playerId])

      for (const fd of finishingDoubles) {
        const field = fd.double_field === 'DBULL' ? 'BULL' : fd.double_field.replace(/^D/, '')
        if (!x01Data[field]) x01Data[field] = { attempts: 0, hits: 0 }
        // Finishing doubles are successful hits
        x01Data[field].hits += fd.count
      }
    } catch {
      // table might not exist
    }

    // --- Combine: only fields that have data in BOTH sources ---
    const allFields = new Set([...Object.keys(bobs27Data), ...Object.keys(x01Data)])
    const results: DoubleCorrelation[] = []

    for (const fieldKey of allFields) {
      const b27 = bobs27Data[fieldKey]
      const x01 = x01Data[fieldKey]

      // Need at least some data from both sources for a meaningful comparison
      if (!b27 || !x01 || b27.attempts === 0 || x01.attempts === 0) continue

      const bobs27HitRate = Math.round(b27.hits / b27.attempts * 1000) / 10
      const x01HitRate = Math.round(x01.hits / x01.attempts * 1000) / 10

      // Determine correlation: within 10% difference = consistent
      const diff = Math.abs(bobs27HitRate - x01HitRate)
      let correlation: DoubleCorrelation['correlation']
      if (diff <= 10) {
        correlation = 'consistent'
      } else if (bobs27HitRate > x01HitRate) {
        correlation = 'training-better'
      } else {
        correlation = 'match-better'
      }

      results.push({
        field: fieldKey === 'BULL' ? 'BULL' as const : parseInt(fieldKey, 10),
        bobs27HitRate,
        x01HitRate,
        bobs27Attempts: b27.attempts,
        x01Attempts: x01.attempts,
        correlation,
      })
    }

    return results.sort((a, b) => {
      const aAttempts = (bobs27Data[String(a.field === 'BULL' ? 'BULL' : a.field)]?.attempts ?? 0) +
                        (x01Data[String(a.field === 'BULL' ? 'BULL' : a.field)]?.attempts ?? 0)
      const bAttempts = (bobs27Data[String(b.field === 'BULL' ? 'BULL' : b.field)]?.attempts ?? 0) +
                        (x01Data[String(b.field === 'BULL' ? 'BULL' : b.field)]?.attempts ?? 0)
      return bAttempts - aAttempts
    })
  } catch (e) {
    console.warn('[Stats] getBobs27X01DoubleCorrelation failed:', e)
    return []
  }
}

// ============================================================================
// Head-to-Head Detailed (Player vs Opponent)
// ============================================================================

export type HeadToHeadDetailed = {
  totalMatches: number
  playerWins: number
  opponentWins: number
  playerAvgScore: number | null  // X01 3-dart avg
  opponentAvgScore: number | null
  playerBestCheckout: number | null
  opponentBestCheckout: number | null
}

/**
 * Detaillierter Head-to-Head-Vergleich zwischen zwei Spielern (X01-fokussiert).
 */
export async function getHeadToHead(playerId: string, opponentId: string): Promise<HeadToHeadDetailed> {
  try {
    // Find X01 matches where both players participated
    const x01Matches = await query<{ match_id: string; winner_id: string | null }>(`
      SELECT m.id as match_id,
        (SELECT json_extract(e.data, '$.winnerPlayerId') FROM x01_events e
         WHERE e.match_id = m.id AND e.type = 'MatchFinished' LIMIT 1) as winner_id
      FROM x01_matches m
      JOIN x01_match_players mp1 ON mp1.match_id = m.id AND mp1.player_id = ?
      JOIN x01_match_players mp2 ON mp2.match_id = m.id AND mp2.player_id = ?
      WHERE m.finished = 1
    `, [playerId, opponentId])

    let totalMatches = x01Matches.length
    let playerWins = 0
    let opponentWins = 0

    for (const m of x01Matches) {
      if (m.winner_id === playerId) playerWins++
      else if (m.winner_id === opponentId) opponentWins++
    }

    // Also count non-X01 modes
    const directWinModes = ['cricket', 'atb', 'ctf', 'str', 'highscore', 'shanghai', 'killer', 'bobs27', 'operation'] as const
    for (const mode of directWinModes) {
      try {
        let modeResult: { matches: number; p_wins: number; o_wins: number } | null = null
        if (mode === 'cricket') {
          modeResult = await queryOne<{ matches: number; p_wins: number; o_wins: number }>(`
            SELECT COUNT(*) as matches,
              COALESCE(SUM(CASE WHEN (
                SELECT json_extract(e.data, '$.winnerPlayerId') FROM cricket_events e
                WHERE e.match_id = m.id AND e.type = 'CricketMatchFinished' LIMIT 1
              ) = ? THEN 1 ELSE 0 END), 0) as p_wins,
              COALESCE(SUM(CASE WHEN (
                SELECT json_extract(e.data, '$.winnerPlayerId') FROM cricket_events e
                WHERE e.match_id = m.id AND e.type = 'CricketMatchFinished' LIMIT 1
              ) = ? THEN 1 ELSE 0 END), 0) as o_wins
            FROM cricket_matches m
            JOIN cricket_match_players mp1 ON mp1.match_id = m.id AND mp1.player_id = ?
            JOIN cricket_match_players mp2 ON mp2.match_id = m.id AND mp2.player_id = ?
            WHERE m.finished = 1
          `, [playerId, opponentId, playerId, opponentId])
        } else {
          modeResult = await queryOne<{ matches: number; p_wins: number; o_wins: number }>(`
            SELECT COUNT(*) as matches,
              SUM(CASE WHEN m.winner_id = ? THEN 1 ELSE 0 END) as p_wins,
              SUM(CASE WHEN m.winner_id = ? THEN 1 ELSE 0 END) as o_wins
            FROM ${mode}_matches m
            JOIN ${mode}_match_players mp1 ON mp1.match_id = m.id AND mp1.player_id = ?
            JOIN ${mode}_match_players mp2 ON mp2.match_id = m.id AND mp2.player_id = ?
            WHERE m.finished = 1
          `, [playerId, opponentId, playerId, opponentId])
        }
        if (modeResult && modeResult.matches > 0) {
          totalMatches += modeResult.matches
          playerWins += modeResult.p_wins
          opponentWins += modeResult.o_wins
        }
      } catch { /* table might not exist */ }
    }

    if (totalMatches === 0) {
      return {
        totalMatches: 0, playerWins: 0, opponentWins: 0,
        playerAvgScore: null, opponentAvgScore: null,
        playerBestCheckout: null, opponentBestCheckout: null,
      }
    }

    // X01 averages for both players in shared matches
    const matchIds = x01Matches.map(m => m.match_id)
    let playerAvg: number | null = null
    let opponentAvg: number | null = null
    let playerBestCo: number | null = null
    let opponentBestCo: number | null = null

    if (matchIds.length > 0) {
      const placeholders = matchIds.map(() => '?').join(',')

      const playerStats = await queryOne<{ avg_score: number; best_checkout: number | null }>(`
        SELECT
          AVG(
            CAST(json_extract(e.data, '$.visitScore') AS REAL) /
            NULLIF(json_array_length(e.data, '$.darts'), 0) * 3
          ) as avg_score,
          MAX(CASE WHEN json_extract(e.data, '$.finishingDartSeq') IS NOT NULL
            THEN CAST(json_extract(e.data, '$.remainingBefore') AS INTEGER) ELSE NULL END) as best_checkout
        FROM x01_events e
        WHERE e.type = 'VisitAdded'
          AND json_extract(e.data, '$.playerId') = ?
          AND e.match_id IN (${placeholders})
      `, [playerId, ...matchIds]).catch(() => null)

      const oppStats = await queryOne<{ avg_score: number; best_checkout: number | null }>(`
        SELECT
          AVG(
            CAST(json_extract(e.data, '$.visitScore') AS REAL) /
            NULLIF(json_array_length(e.data, '$.darts'), 0) * 3
          ) as avg_score,
          MAX(CASE WHEN json_extract(e.data, '$.finishingDartSeq') IS NOT NULL
            THEN CAST(json_extract(e.data, '$.remainingBefore') AS INTEGER) ELSE NULL END) as best_checkout
        FROM x01_events e
        WHERE e.type = 'VisitAdded'
          AND json_extract(e.data, '$.playerId') = ?
          AND e.match_id IN (${placeholders})
      `, [opponentId, ...matchIds]).catch(() => null)

      playerAvg = playerStats?.avg_score ? Math.round(playerStats.avg_score * 100) / 100 : null
      opponentAvg = oppStats?.avg_score ? Math.round(oppStats.avg_score * 100) / 100 : null
      playerBestCo = playerStats?.best_checkout ?? null
      opponentBestCo = oppStats?.best_checkout ?? null
    }

    return {
      totalMatches,
      playerWins,
      opponentWins,
      playerAvgScore: playerAvg,
      opponentAvgScore: opponentAvg,
      playerBestCheckout: playerBestCo,
      opponentBestCheckout: opponentBestCo,
    }
  } catch (e) {
    console.warn('[Stats] getHeadToHead failed:', e)
    return {
      totalMatches: 0, playerWins: 0, opponentWins: 0,
      playerAvgScore: null, opponentAvgScore: null,
      playerBestCheckout: null, opponentBestCheckout: null,
    }
  }
}
