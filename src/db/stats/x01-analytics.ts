// src/db/stats/x01-analytics.ts
// X01 advanced analytics: segment accuracy, double/treble rates, form curve, checkout intelligence

import { query, queryOne } from '../index'
import type { HeadToHead } from './types'
import { getPlayerStreaks } from './x01'

// ============================================================================
// Types
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

export type ModeWarmupEffect = {
  mode: string
  label: string
  firstAvg: number
  laterAvg: number
  diff: number
  metric: string  // "3-Dart Avg", "MPR", "Score", etc.
  sessionCount: number
}

export type WarmupEffect = {
  firstMatchAvg: number
  laterMatchesAvg: number
  firstMatchWinRate: number
  laterMatchesWinRate: number
  difference: number       // laterAvg - firstAvg (positive = improves)
  sessionCount: number
  modeEffects?: ModeWarmupEffect[]
}

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

// ============================================================================
// Segment Accuracy
// ============================================================================

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
        d.value::jsonb->>'bed' as bed,
        (d.value::jsonb->>'mult')::integer as mult,
        d.value::jsonb->'aim'->>'bed' as aim_bed,
        (d.value::jsonb->'aim'->>'mult')::integer as aim_mult
      FROM x01_events e
      JOIN x01_match_players mp ON mp.match_id = e.match_id AND mp.player_id = ?
      JOIN x01_matches m ON m.id = e.match_id AND m.finished = 1
      , jsonb_array_elements(e.data::jsonb->'darts') d(value)
      WHERE e.type = 'VisitAdded'
        AND e.data::jsonb->>'playerId' = ?
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

    const totalAllDarts = Object.values(segments).reduce((sum, s) => sum + s.totalAttempts, 0)
    const result = Object.values(segments).filter(s => s.totalAttempts > 0)
    for (const s of result) {
      // hitRate = distribution percentage (what % of all darts landed on this field)
      // Note: without aim data, we cannot compute true hit-vs-miss rate per field
      s.hitRate = totalAllDarts > 0 ? Math.round(s.totalAttempts / totalAllDarts * 1000) / 10 : 0
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
        d.value::jsonb->>'bed' as bed,
        (d.value::jsonb->>'mult')::integer as mult,
        d.value::jsonb->'aim'->>'bed' as aim_bed,
        (d.value::jsonb->'aim'->>'mult')::integer as aim_mult
      FROM x01_events e
      JOIN x01_match_players mp ON mp.match_id = e.match_id AND mp.player_id = ?
      JOIN x01_matches m ON m.id = e.match_id AND m.finished = 1
      , jsonb_array_elements(e.data::jsonb->'darts') d(value)
      WHERE e.type = 'VisitAdded'
        AND e.data::jsonb->>'playerId' = ?
        AND ((d.value::jsonb->'aim'->>'mult')::integer = 2 OR ((d.value::jsonb->'aim'->>'mult') IS NULL AND (d.value::jsonb->>'mult')::integer = 2))
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
        d.value::jsonb->>'bed' as bed,
        (d.value::jsonb->>'mult')::integer as mult,
        d.value::jsonb->'aim'->>'bed' as aim_bed,
        (d.value::jsonb->'aim'->>'mult')::integer as aim_mult
      FROM x01_events e
      JOIN x01_match_players mp ON mp.match_id = e.match_id AND mp.player_id = ?
      JOIN x01_matches m ON m.id = e.match_id AND m.finished = 1
      , jsonb_array_elements(e.data::jsonb->'darts') d(value)
      WHERE e.type = 'VisitAdded'
        AND e.data::jsonb->>'playerId' = ?
        AND ((d.value::jsonb->'aim'->>'mult')::integer = 3 OR ((d.value::jsonb->'aim'->>'mult') IS NULL AND (d.value::jsonb->>'mult')::integer = 3))
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
// Form Curve & Momentum
// ============================================================================

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
          (e.data::jsonb->>'visitScore')::real /
          NULLIF(jsonb_array_length(e.data::jsonb->'darts'), 0) * 3
        ) as avg,
        COALESCE(SUM(CASE WHEN e.data::jsonb->>'remainingAfter' IS NOT NULL
          AND (e.data::jsonb->>'remainingBefore')::integer <= 170
          AND e.data::jsonb->>'bust' != 'true'
          AND jsonb_array_length(e.data::jsonb->'darts') > 0
          THEN 1 ELSE 0 END), 0) as checkout_attempts,
        COALESCE(SUM(CASE WHEN e.data::jsonb->>'finishingDartSeq' IS NOT NULL THEN 1 ELSE 0 END), 0) as checkouts_made,
        CASE WHEN (SELECT e2.data::jsonb->>'winnerPlayerId' FROM x01_events e2
                   WHERE e2.match_id = m.id AND e2.type = 'MatchFinished') = ? THEN 1 ELSE 0 END as won,
        COALESCE((SELECT string_agg(p.name::text, ', ') FROM x01_match_players mp2
                  JOIN profiles p ON p.id = mp2.player_id
                  WHERE mp2.match_id = m.id AND mp2.player_id != ?), 'Solo') as opponents
      FROM x01_matches m
      JOIN x01_match_players mp ON mp.match_id = m.id AND mp.player_id = ?
      JOIN x01_events e ON e.match_id = m.id AND e.type = 'VisitAdded' AND e.data::jsonb->>'playerId' = ?
      WHERE m.finished = 1
      GROUP BY m.id, m.created_at
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
        m.created_at::date as match_date,
        AVG(
          (e.data::jsonb->>'visitScore')::real /
          NULLIF(jsonb_array_length(e.data::jsonb->'darts'), 0) * 3
        ) as avg,
        CASE WHEN (SELECT e2.data::jsonb->>'winnerPlayerId' FROM x01_events e2
                   WHERE e2.match_id = m.id AND e2.type = 'MatchFinished') = ? THEN 1 ELSE 0 END as won
      FROM x01_matches m
      JOIN x01_match_players mp ON mp.match_id = m.id AND mp.player_id = ?
      JOIN x01_events e ON e.match_id = m.id AND e.type = 'VisitAdded' AND e.data::jsonb->>'playerId' = ?
      WHERE m.finished = 1
      GROUP BY m.id, m.created_at
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

    // Multi-mode warmup analysis
    const modeEffects = await getMultiModeWarmupEffects(playerId)

    // Add X01 as first entry if we have data
    const x01SessionCount = Object.keys(sessions).filter(d => sessions[d].length > 1).length
    const allModeEffects: ModeWarmupEffect[] = []
    if (x01SessionCount >= 2) {
      allModeEffects.push({
        mode: 'x01', label: 'X01',
        firstAvg: firstMatchAvg, laterAvg: laterMatchesAvg,
        diff: Math.round((laterMatchesAvg - firstMatchAvg) * 100) / 100,
        metric: '3-Dart Avg', sessionCount: x01SessionCount,
      })
    }
    allModeEffects.push(...modeEffects)

    return {
      sessions: performance,
      warmup: {
        firstMatchAvg,
        laterMatchesAvg,
        firstMatchWinRate: firstCount > 0 ? Math.round(firstMatchWins / firstCount * 1000) / 10 : 0,
        laterMatchesWinRate: laterCount > 0 ? Math.round(laterWins / laterCount * 1000) / 10 : 0,
        difference: Math.round((laterMatchesAvg - firstMatchAvg) * 100) / 100,
        sessionCount: Object.keys(sessions).length,
        modeEffects: allModeEffects.length > 0 ? allModeEffects : undefined,
      },
    }
  } catch (e) {
    console.warn('[Stats] getSessionPerformance failed:', e)
    return { sessions: [], warmup: { firstMatchAvg: 0, laterMatchesAvg: 0, firstMatchWinRate: 0, laterMatchesWinRate: 0, difference: 0, sessionCount: 0 } }
  }
}

// ============================================================================
// Multi-Mode Warmup Effects Helper
// ============================================================================

async function getMultiModeWarmupEffects(playerId: string): Promise<ModeWarmupEffect[]> {
  const effects: ModeWarmupEffect[] = []

  // Cricket: MPR (marks per round) comparison
  try {
    const cricketMatches = await query<{
      match_id: string
      match_date: string
      mpr: number
    }>(`
      SELECT
        m.id as match_id,
        m.created_at::date as match_date,
        AVG(
          (e.data::jsonb->>'marks')::real /
          NULLIF(COALESCE(
            (e.data::jsonb->>'dartCount')::real,
            jsonb_array_length(e.data::jsonb->'darts')
          ), 0) * 3
        ) as mpr
      FROM cricket_matches m
      JOIN cricket_match_players mp ON mp.match_id = m.id AND mp.player_id = ?
      JOIN cricket_events e ON e.match_id = m.id AND e.type = 'CricketTurnAdded' AND e.data::jsonb->>'playerId' = ?
      WHERE m.finished = 1
      GROUP BY m.id, m.created_at
      ORDER BY m.created_at ASC
    `, [playerId, playerId])

    const eff = computeModeWarmup(cricketMatches, 'cricket', 'Cricket', 'MPR')
    if (eff) effects.push(eff)
  } catch { /* table might not exist */ }

  // Highscore: total score per match (turnScore per turn)
  try {
    const highscoreMatches = await query<{
      match_id: string
      match_date: string
      mpr: number
    }>(`
      SELECT
        m.id as match_id,
        m.created_at::date as match_date,
        COALESCE(SUM((e.data::jsonb->>'turnScore')::real), 0) as mpr
      FROM highscore_matches m
      JOIN highscore_match_players mp ON mp.match_id = m.id AND mp.player_id = ?
      JOIN highscore_events e ON e.match_id = m.id AND e.type = 'HighscoreTurnAdded' AND e.data::jsonb->>'playerId' = ?
      WHERE m.finished = 1
      GROUP BY m.id, m.created_at
      ORDER BY m.created_at ASC
    `, [playerId, playerId])

    const eff = computeModeWarmup(highscoreMatches, 'highscore', 'Highscore', 'Score')
    if (eff) effects.push(eff)
  } catch { /* table might not exist */ }

  // Shanghai: total score per match (turnScore per turn)
  try {
    const shanghaiMatches = await query<{
      match_id: string
      match_date: string
      mpr: number
    }>(`
      SELECT
        m.id as match_id,
        m.created_at::date as match_date,
        COALESCE(SUM((e.data::jsonb->>'turnScore')::real), 0) as mpr
      FROM shanghai_matches m
      JOIN shanghai_match_players mp ON mp.match_id = m.id AND mp.player_id = ?
      JOIN shanghai_events e ON e.match_id = m.id AND e.type = 'ShanghaiTurnAdded' AND e.data::jsonb->>'playerId' = ?
      WHERE m.finished = 1
      GROUP BY m.id, m.created_at
      ORDER BY m.created_at ASC
    `, [playerId, playerId])

    const eff = computeModeWarmup(shanghaiMatches, 'shanghai', 'Shanghai', 'Score')
    if (eff) effects.push(eff)
  } catch { /* table might not exist */ }

  // Bob's 27: final score per match (from finalScores map in Bobs27MatchFinished)
  try {
    const bobs27Raw = await query<{
      match_id: string
      match_date: string
      final_scores: string
    }>(`
      SELECT
        m.id as match_id,
        m.created_at::date as match_date,
        ef.data::jsonb->>'finalScores' as final_scores
      FROM bobs27_matches m
      JOIN bobs27_match_players mp ON mp.match_id = m.id AND mp.player_id = ?
      JOIN bobs27_events ef ON ef.match_id = m.id AND ef.type = 'Bobs27MatchFinished'
      WHERE m.finished = 1
      ORDER BY m.created_at ASC
    `, [playerId])

    const bobs27Matches = bobs27Raw.map(r => {
      let score = 0
      try {
        const scores = typeof r.final_scores === 'string' ? JSON.parse(r.final_scores) : r.final_scores
        score = scores?.[playerId] ?? 0
      } catch { /* ignore parse errors */ }
      return { match_id: r.match_id, match_date: r.match_date, mpr: score }
    })

    const eff = computeModeWarmup(bobs27Matches, 'bobs27', "Bob's 27", 'Score')
    if (eff) effects.push(eff)
  } catch { /* table might not exist */ }

  // ATB: hit rate (hits / totalDarts from enriched events)
  try {
    const atbMatches = await query<{
      match_id: string
      match_date: string
      mpr: number
    }>(`
      SELECT
        m.id as match_id,
        m.created_at::date as match_date,
        CASE WHEN SUM(COALESCE((e.data::jsonb->>'totalDarts')::integer, 0)) > 0
          THEN SUM(COALESCE((e.data::jsonb->>'hits')::integer, 0))::real /
               SUM(COALESCE((e.data::jsonb->>'totalDarts')::integer, 0)) * 100
          ELSE 0
        END as mpr
      FROM atb_matches m
      JOIN atb_match_players mp ON mp.match_id = m.id AND mp.player_id = ?
      JOIN atb_events e ON e.match_id = m.id AND e.type = 'ATBTurnAdded' AND e.data::jsonb->>'playerId' = ?
      WHERE m.finished = 1
      GROUP BY m.id, m.created_at
      ORDER BY m.created_at ASC
    `, [playerId, playerId])

    const eff = computeModeWarmup(atbMatches, 'atb', 'Around the Block', 'Hit Rate %')
    if (eff) effects.push(eff)
  } catch { /* table might not exist */ }

  return effects
}

function computeModeWarmup(
  matches: { match_id: string; match_date: string; mpr: number }[],
  mode: string, label: string, metric: string,
): ModeWarmupEffect | null {
  if (matches.length < 3) return null

  // Group by date
  const byDate: Record<string, number[]> = {}
  for (const m of matches) {
    if (!byDate[m.match_date]) byDate[m.match_date] = []
    byDate[m.match_date].push(m.mpr || 0)
  }

  // Only sessions with 2+ matches are relevant
  const multiSessions = Object.values(byDate).filter(d => d.length >= 2)
  if (multiSessions.length < 2) return null

  let firstSum = 0, laterSum = 0, laterCount = 0

  for (const day of multiSessions) {
    firstSum += day[0]
    for (let i = 1; i < day.length; i++) {
      laterSum += day[i]
      laterCount++
    }
  }

  const firstAvg = Math.round(firstSum / multiSessions.length * 100) / 100
  const laterAvg = laterCount > 0 ? Math.round(laterSum / laterCount * 100) / 100 : 0

  return {
    mode, label, firstAvg, laterAvg,
    diff: Math.round((laterAvg - firstAvg) * 100) / 100,
    metric, sessionCount: multiSessions.length,
  }
}

// ============================================================================
// Checkout Intelligence
// ============================================================================

export async function getCheckoutByRemaining(playerId: string): Promise<CheckoutByRemaining[]> {
  try {
    const results = await query<{
      remaining: number
      attempts: number
      successes: number
    }>(`
      SELECT
        (e.data::jsonb->>'remainingBefore')::integer as remaining,
        COUNT(*) as attempts,
        SUM(CASE WHEN e.data::jsonb->>'finishingDartSeq' IS NOT NULL THEN 1 ELSE 0 END) as successes
      FROM x01_events e
      JOIN x01_match_players mp ON mp.match_id = e.match_id AND mp.player_id = ?
      JOIN x01_matches m ON m.id = e.match_id AND m.finished = 1
      WHERE e.type = 'VisitAdded'
        AND e.data::jsonb->>'playerId' = ?
        AND (e.data::jsonb->>'remainingBefore')::integer <= 170
        AND e.data::jsonb->>'bust' != 'true'
        AND (e.data::jsonb->>'remainingBefore')::integer % 2 = 0
      GROUP BY remaining
      HAVING COUNT(*) >= 2
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
          e.data::jsonb->>'legId' as leg_id,
          COUNT(*) as double_visits
        FROM x01_events e
        JOIN x01_match_players mp ON mp.match_id = e.match_id AND mp.player_id = ?
        JOIN x01_matches m ON m.id = e.match_id AND m.finished = 1
        WHERE e.type = 'VisitAdded'
          AND e.data::jsonb->>'playerId' = ?
          AND (e.data::jsonb->>'remainingBefore')::integer <= 170
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
// Cricket Deep Analysis + H2H (TASK 20)
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
        d.value::jsonb->>'target' as target,
        (d.value::jsonb->>'mult')::integer as mult
      FROM cricket_events e
      JOIN cricket_match_players mp ON mp.match_id = e.match_id AND mp.player_id = ?
      JOIN cricket_matches m ON m.id = e.match_id AND m.finished = 1
      , jsonb_array_elements(e.data::jsonb->'darts') d(value)
      WHERE e.type = 'CricketTurnAdded'
        AND e.data::jsonb->>'playerId' = ?
        AND d.value::jsonb->>'target' != 'MISS'
    `, [playerId, playerId])

    const totalTurns = await queryOne<{ cnt: number }>(`
      SELECT COUNT(*) as cnt
      FROM cricket_events e
      JOIN cricket_match_players mp ON mp.match_id = e.match_id AND mp.player_id = ?
      JOIN cricket_matches m ON m.id = e.match_id AND m.finished = 1
      WHERE e.type = 'CricketTurnAdded'
        AND e.data::jsonb->>'playerId' = ?
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
         AND e.data::jsonb->>'winnerPlayerId' = ?), 0) as p1_wins,
        COALESCE((SELECT COUNT(*) FROM cricket_events e
         WHERE e.match_id IN (SELECT id FROM shared_matches)
         AND e.type = 'CricketMatchFinished'
         AND e.data::jsonb->>'winnerPlayerId' = ?), 0) as p2_wins,
        COALESCE((SELECT COUNT(*) FROM cricket_events e
         WHERE e.match_id IN (SELECT id FROM shared_matches)
         AND e.type = 'CricketLegFinished'
         AND e.data::jsonb->>'winnerPlayerId' = ?), 0) as p1_legs,
        COALESCE((SELECT COUNT(*) FROM cricket_events e
         WHERE e.match_id IN (SELECT id FROM shared_matches)
         AND e.type = 'CricketLegFinished'
         AND e.data::jsonb->>'winnerPlayerId' = ?), 0) as p2_legs,
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
