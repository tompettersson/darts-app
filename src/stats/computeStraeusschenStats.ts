// src/stats/computeStraeusschenStats.ts
// Statistikberechnung für Sträußchen – pro Leg und pro Match

import type { StrTargetNumber } from '../types/straeusschen'
import type { StrTurnAddedEvent, StrEvent } from '../dartsStraeusschen'
import { computeStrFieldScore } from '../dartsStraeusschen'

// ===== Typen =====

export type StrFieldStat = {
  targetNumber: StrTargetNumber
  totalDarts: number
  totalTurns: number
  /** Kumulative Darts bis zum 1./2./3. Triple-Treffer (null = noch nicht erreicht) */
  dartsToTriple: [number | null, number | null, number | null]
  completed: boolean
  score: number
}

export type StrRoundStat = {
  turnIndex: number
  targetNumber: StrTargetNumber
  darts: ('hit' | 'miss')[]
  hits: number
  misses: number
  hitRate: number
  cumulativeHitRate: number
}

export type StrPlayerLegStat = {
  playerId: string
  name: string
  totalDarts: number
  totalTurns: number
  totalHits: number
  totalMisses: number
  hitRate: number
  fields: StrFieldStat[]
  hardestField: { number: StrTargetNumber; darts: number } | null
  totalScore: number
  bestRound: { turnIndex: number; hits: number; darts: number } | null
  worstRound: { turnIndex: number; hits: number; darts: number } | null
  avgHitsPerRound: number
  longestHitStreak: number
  firstDartHitRate: number
  rounds: StrRoundStat[]
}

export type StrAvgFieldStat = {
  targetNumber: StrTargetNumber
  avgDarts: number
  avgDartsToTriple: [number | null, number | null, number | null]
  timesPlayed: number
  avgScore: number
}

export type StrPlayerMatchStat = {
  playerId: string
  name: string
  totalDarts: number
  totalTurns: number
  totalHits: number
  totalMisses: number
  hitRate: number
  legsPlayed: number
  avgDartsPerLeg: number
  avgTurnsPerLeg: number
  /** Ø Darts bis 1./2./3. Triple (Durchschnitt über alle Legs) */
  avgDartsToTriple: [number | null, number | null, number | null]
  avgFields: StrAvgFieldStat[]
  hardestField: { number: StrTargetNumber; avgDarts: number } | null
  totalScore: number
  avgScorePerLeg: number
  bestRound: { turnIndex: number; hits: number; darts: number } | null
  worstRound: { turnIndex: number; hits: number; darts: number } | null
  avgHitsPerRound: number
  longestHitStreak: number
  firstDartHitRate: number
}

// ===== Leg-Stats =====

/**
 * Berechnet Spielerstatistiken für einen einzelnen Leg.
 * turnEvents müssen bereits nach legId gefiltert sein.
 */
export function computeStrLegStats(
  turnEvents: StrTurnAddedEvent[],
  players: { playerId: string; name: string }[],
): StrPlayerLegStat[] {
  return players.map(p => {
    const playerTurns = turnEvents
      .filter(t => t.playerId === p.playerId)
      .sort((a, b) => a.turnIndexInLeg - b.turnIndexInLeg)

    const totalDarts = playerTurns.reduce((sum, t) => sum + t.darts.length, 0)
    const totalHits = playerTurns.reduce((sum, t) => sum + t.hits, 0)
    const totalMisses = totalDarts - totalHits
    const hitRate = totalDarts > 0 ? (totalHits / totalDarts) * 100 : 0

    // Turns nach Zielzahl gruppieren
    const byTarget = new Map<StrTargetNumber, StrTurnAddedEvent[]>()
    for (const t of playerTurns) {
      const arr = byTarget.get(t.targetNumber) || []
      arr.push(t)
      byTarget.set(t.targetNumber, arr)
    }

    const fields: StrFieldStat[] = []
    for (const [num, fieldTurns] of byTarget) {
      const fieldDarts = fieldTurns.reduce((sum, t) => sum + t.darts.length, 0)
      const dartsToTriple: [number | null, number | null, number | null] = [null, null, null]

      let dartCount = 0
      let hitCount = 0

      for (const turn of fieldTurns) {
        for (const dart of turn.darts) {
          dartCount++
          if (dart === 'hit') {
            hitCount++
            if (hitCount <= 3) {
              dartsToTriple[hitCount - 1] = dartCount
            }
          }
        }
      }

      const completed = fieldTurns.some(t => t.numberCompleted)
      const fieldScore = computeStrFieldScore(dartsToTriple)
      fields.push({ targetNumber: num, totalDarts: fieldDarts, totalTurns: fieldTurns.length, dartsToTriple, completed, score: fieldScore })
    }

    fields.sort((a, b) => a.targetNumber - b.targetNumber)

    // Schwerstes Feld (meiste Darts unter den abgeschlossenen)
    let hardestField: { number: StrTargetNumber; darts: number } | null = null
    for (const f of fields) {
      if (f.completed && (!hardestField || f.totalDarts > hardestField.darts)) {
        hardestField = { number: f.targetNumber, darts: f.totalDarts }
      }
    }

    const totalScore = fields.reduce((sum, f) => sum + f.score, 0)

    // Best/Worst Round
    let bestRound: { turnIndex: number; hits: number; darts: number } | null = null
    let worstRound: { turnIndex: number; hits: number; darts: number } | null = null
    for (let i = 0; i < playerTurns.length; i++) {
      const t = playerTurns[i]
      const entry = { turnIndex: i + 1, hits: t.hits, darts: t.darts.length }
      if (!bestRound || t.hits > bestRound.hits || (t.hits === bestRound.hits && t.darts.length < bestRound.darts)) {
        bestRound = entry
      }
      if (!worstRound || t.hits < worstRound.hits || (t.hits === worstRound.hits && t.darts.length > worstRound.darts)) {
        worstRound = entry
      }
    }

    const avgHitsPerRound = playerTurns.length > 0 ? totalHits / playerTurns.length : 0

    // Longest hit streak
    let longestHitStreak = 0
    let currentStreak = 0
    for (const t of playerTurns) {
      for (const d of t.darts) {
        if (d === 'hit') {
          currentStreak++
          if (currentStreak > longestHitStreak) longestHitStreak = currentStreak
        } else {
          currentStreak = 0
        }
      }
    }

    // First-dart hit rate
    let firstDartAttempts = 0
    let firstDartHits = 0
    for (const t of playerTurns) {
      if (t.darts.length > 0) {
        firstDartAttempts++
        if (t.darts[0] === 'hit') firstDartHits++
      }
    }
    const firstDartHitRate = firstDartAttempts > 0 ? (firstDartHits / firstDartAttempts) * 100 : 0

    // Round-by-round stats
    let cumDarts = 0
    let cumHits = 0
    const rounds: StrRoundStat[] = playerTurns.map((t, i) => {
      cumDarts += t.darts.length
      cumHits += t.hits
      const misses = t.darts.length - t.hits
      return {
        turnIndex: i + 1,
        targetNumber: t.targetNumber,
        darts: t.darts as ('hit' | 'miss')[],
        hits: t.hits,
        misses,
        hitRate: t.darts.length > 0 ? (t.hits / t.darts.length) * 100 : 0,
        cumulativeHitRate: cumDarts > 0 ? (cumHits / cumDarts) * 100 : 0,
      }
    })

    return {
      playerId: p.playerId,
      name: p.name,
      totalDarts,
      totalTurns: playerTurns.length,
      totalHits,
      totalMisses,
      hitRate,
      fields,
      hardestField,
      totalScore,
      bestRound,
      worstRound,
      avgHitsPerRound,
      longestHitStreak,
      firstDartHitRate,
      rounds,
    }
  })
}

// ===== Match-Stats =====

/**
 * Berechnet Match-Gesamtstatistiken (Summen + Durchschnitte über alle Legs).
 */
export function computeStrMatchStats(
  allEvents: StrEvent[],
  players: { playerId: string; name: string }[],
): StrPlayerMatchStat[] {
  const legIds: string[] = []
  for (const e of allEvents) {
    if (e.type === 'StrLegStarted') legIds.push(e.legId)
  }

  const allTurns = allEvents.filter(
    (e): e is StrTurnAddedEvent => e.type === 'StrTurnAdded'
  )

  const perLegStats: StrPlayerLegStat[][] = legIds.map(legId => {
    const legTurns = allTurns.filter(t => t.legId === legId)
    return computeStrLegStats(legTurns, players)
  })

  return players.map((p, playerIdx) => {
    const allPlayerTurns = allTurns.filter(t => t.playerId === p.playerId)
    const totalDarts = allPlayerTurns.reduce((sum, t) => sum + t.darts.length, 0)
    const totalHits = allPlayerTurns.reduce((sum, t) => sum + t.hits, 0)
    const totalMisses = totalDarts - totalHits
    const hitRate = totalDarts > 0 ? (totalHits / totalDarts) * 100 : 0
    const totalTurns = allPlayerTurns.length

    const legsPlayed = perLegStats.filter(leg => (leg[playerIdx]?.totalDarts ?? 0) > 0).length

    const avgDartsToTriple: [number | null, number | null, number | null] = [null, null, null]
    for (let i = 0; i < 3; i++) {
      const values: number[] = []
      for (const legStat of perLegStats) {
        const ps = legStat[playerIdx]
        if (!ps) continue
        if (ps.fields.length === 1) {
          const v = ps.fields[0].dartsToTriple[i]
          if (v != null) values.push(v)
        }
      }
      if (values.length > 0) {
        avgDartsToTriple[i] = values.reduce((s, v) => s + v, 0) / values.length
      }
    }

    const allFieldNumbers = new Set<StrTargetNumber>()
    for (const leg of perLegStats) {
      for (const f of leg[playerIdx]?.fields ?? []) {
        allFieldNumbers.add(f.targetNumber)
      }
    }

    const avgFields: StrAvgFieldStat[] = [...allFieldNumbers].sort((a, b) => a - b).map(num => {
      const fieldFromLegs = perLegStats
        .map(leg => leg[playerIdx]?.fields.find(f => f.targetNumber === num))
        .filter((f): f is StrFieldStat => !!f && f.totalDarts > 0)

      const completedLegs = fieldFromLegs.filter(f => f.completed)
      const timesPlayed = completedLegs.length
      const avgDarts = timesPlayed > 0
        ? completedLegs.reduce((s, f) => s + f.totalDarts, 0) / timesPlayed
        : fieldFromLegs.length > 0
          ? fieldFromLegs.reduce((s, f) => s + f.totalDarts, 0) / fieldFromLegs.length
          : 0

      const avgDartsToTripleFld: [number | null, number | null, number | null] = [null, null, null]
      for (let i = 0; i < 3; i++) {
        const values = completedLegs.length > 0
          ? completedLegs.map(f => f.dartsToTriple[i]).filter((v): v is number => v != null)
          : fieldFromLegs.map(f => f.dartsToTriple[i]).filter((v): v is number => v != null)
        if (values.length > 0) {
          avgDartsToTripleFld[i] = values.reduce((s, v) => s + v, 0) / values.length
        }
      }

      const avgScore = timesPlayed > 0
        ? completedLegs.reduce((s, f) => s + f.score, 0) / timesPlayed
        : fieldFromLegs.length > 0
          ? fieldFromLegs.reduce((s, f) => s + f.score, 0) / fieldFromLegs.length
          : 0

      return { targetNumber: num, avgDarts, avgDartsToTriple: avgDartsToTripleFld, timesPlayed, avgScore }
    })

    let hardestField: { number: StrTargetNumber; avgDarts: number } | null = null
    for (const f of avgFields) {
      if (f.avgDarts > 0 && (!hardestField || f.avgDarts > hardestField.avgDarts)) {
        hardestField = { number: f.targetNumber, avgDarts: f.avgDarts }
      }
    }

    const legScores = perLegStats
      .map(leg => leg[playerIdx]?.totalScore ?? 0)
      .filter(s => s > 0)
    const totalScore = legScores.reduce((s, v) => s + v, 0)
    const avgScorePerLeg = legScores.length > 0 ? totalScore / legScores.length : 0

    // Best/Worst Round across entire match
    let bestRound: { turnIndex: number; hits: number; darts: number } | null = null
    let worstRound: { turnIndex: number; hits: number; darts: number } | null = null
    for (let i = 0; i < allPlayerTurns.length; i++) {
      const t = allPlayerTurns[i]
      const entry = { turnIndex: i + 1, hits: t.hits, darts: t.darts.length }
      if (!bestRound || t.hits > bestRound.hits || (t.hits === bestRound.hits && t.darts.length < bestRound.darts)) {
        bestRound = entry
      }
      if (!worstRound || t.hits < worstRound.hits || (t.hits === worstRound.hits && t.darts.length > worstRound.darts)) {
        worstRound = entry
      }
    }

    const avgHitsPerRound = totalTurns > 0 ? totalHits / totalTurns : 0

    let longestHitStreak = 0
    let currentStreak = 0
    for (const t of allPlayerTurns) {
      for (const d of t.darts) {
        if (d === 'hit') {
          currentStreak++
          if (currentStreak > longestHitStreak) longestHitStreak = currentStreak
        } else {
          currentStreak = 0
        }
      }
    }

    let firstDartAttempts = 0
    let firstDartHits = 0
    for (const t of allPlayerTurns) {
      if (t.darts.length > 0) {
        firstDartAttempts++
        if (t.darts[0] === 'hit') firstDartHits++
      }
    }
    const firstDartHitRate = firstDartAttempts > 0 ? (firstDartHits / firstDartAttempts) * 100 : 0

    return {
      playerId: p.playerId,
      name: p.name,
      totalDarts,
      totalTurns,
      totalHits,
      totalMisses,
      hitRate,
      legsPlayed,
      avgDartsPerLeg: legsPlayed > 0 ? totalDarts / legsPlayed : 0,
      avgTurnsPerLeg: legsPlayed > 0 ? totalTurns / legsPlayed : 0,
      avgDartsToTriple,
      avgFields,
      hardestField,
      totalScore,
      avgScorePerLeg,
      bestRound,
      worstRound,
      avgHitsPerRound,
      longestHitStreak,
      firstDartHitRate,
    }
  })
}
