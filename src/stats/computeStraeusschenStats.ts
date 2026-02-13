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
  // Alle Legs finden
  const legIds: string[] = []
  for (const e of allEvents) {
    if (e.type === 'StrLegStarted') legIds.push(e.legId)
  }

  const allTurns = allEvents.filter(
    (e): e is StrTurnAddedEvent => e.type === 'StrTurnAdded'
  )

  // Per-Leg Stats berechnen
  const perLegStats: StrPlayerLegStat[][] = legIds.map(legId => {
    const legTurns = allTurns.filter(t => t.legId === legId)
    return computeStrLegStats(legTurns, players)
  })

  return players.map((p, playerIdx) => {
    // Gesamtwerte über alle Turns
    const allPlayerTurns = allTurns.filter(t => t.playerId === p.playerId)
    const totalDarts = allPlayerTurns.reduce((sum, t) => sum + t.darts.length, 0)
    const totalHits = allPlayerTurns.reduce((sum, t) => sum + t.hits, 0)
    const totalMisses = totalDarts - totalHits
    const hitRate = totalDarts > 0 ? (totalHits / totalDarts) * 100 : 0
    const totalTurns = allPlayerTurns.length

    // Legs mit Beteiligung
    const legsPlayed = perLegStats.filter(leg => (leg[playerIdx]?.totalDarts ?? 0) > 0).length

    // Ø Darts to Triple über alle Legs (nur single-field mode sinnvoll als Gesamtwert)
    const avgDartsToTriple: [number | null, number | null, number | null] = [null, null, null]
    for (let i = 0; i < 3; i++) {
      const values: number[] = []
      for (const legStat of perLegStats) {
        const ps = legStat[playerIdx]
        if (!ps) continue
        // Bei single mode: nur ein Feld
        // Bei all mode: Summe aller Felder
        if (ps.fields.length === 1) {
          const v = ps.fields[0].dartsToTriple[i]
          if (v != null) values.push(v)
        } else {
          // Für 'all' mode: diesen Wert nicht als Gesamt-Durchschnitt verwenden
          // (wird per-Feld in avgFields gezeigt)
        }
      }
      if (values.length > 0) {
        avgDartsToTriple[i] = values.reduce((s, v) => s + v, 0) / values.length
      }
    }

    // Per-Feld Durchschnitte über alle Legs
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

    // Schwerstes Feld (höchster Ø Darts)
    let hardestField: { number: StrTargetNumber; avgDarts: number } | null = null
    for (const f of avgFields) {
      if (f.avgDarts > 0 && (!hardestField || f.avgDarts > hardestField.avgDarts)) {
        hardestField = { number: f.targetNumber, avgDarts: f.avgDarts }
      }
    }

    // Gesamt-Score über alle Legs
    const legScores = perLegStats
      .map(leg => leg[playerIdx]?.totalScore ?? 0)
      .filter(s => s > 0)
    const totalScore = legScores.reduce((s, v) => s + v, 0)
    const avgScorePerLeg = legScores.length > 0 ? totalScore / legScores.length : 0

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
    }
  })
}
