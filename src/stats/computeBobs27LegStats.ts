// src/stats/computeBobs27LegStats.ts
// Pro-Leg-Statistik fuer Bob's 27. Bull wird strikt von D1-D20 getrennt.

import type {
  Bobs27StoredMatch,
  Bobs27Event,
  Bobs27ThrowEvent,
  Bobs27TargetFinishedEvent,
} from '../types/bobs27'

export type Bobs27DoubleRow = {
  label: string
  fieldNumber: number
  isBull: boolean
  hits: number
  darts: number
  delta: number
  success: 0 | 1              // 1 wenn hits >= 1
  firstDartHit: boolean       // Dart 1 war Treffer
  conversionAfterMiss: boolean // Dart 1 Fehler, Dart 2 oder 3 Treffer
}

export type Bobs27LegStats = {
  legIndex: number
  playerId: string
  finalScore: number
  totalDarts: number
  totalHits: number

  // Hauptquote: nur D1–D20 (OHNE Bull)
  doublesDarts: number
  doublesHits: number
  doubleRatePerDart: number
  doublesVisits: number
  doublesVisitsWithHit: number
  doubleRatePerVisit: number

  // Bull SEPARAT (null wenn kein Bull im Leg)
  bullDarts: number | null
  bullHits: number | null
  bullRatePerDart: number | null
  bullVisitHit: boolean | null

  zeroVisits: number
  firstDartHits: number
  conversionRate: number
  longestHitStreak: number
  worstZeroStreak: number
  bestTargetStreak: number

  doubleRows: Bobs27DoubleRow[]
  eliminated: boolean
  eliminatedAtTarget: number | null
}

/**
 * Teilt ein Match-Event-Log in Per-Leg-Event-Listen auf.
 * Leg 0 = alles bis zum ersten Bobs27LegStarted-Event (bzw. bis LegFinished).
 * Leg N (N>=1) = Events zwischen Bobs27LegStarted(N) und Bobs27LegFinished(N).
 * MatchStarted wird jedem Leg als Referenz mitgegeben.
 */
export function splitBobs27EventsByLeg(events: Bobs27Event[]): Map<number, Bobs27Event[]> {
  const byLeg = new Map<number, Bobs27Event[]>()
  byLeg.set(0, [])
  let currentLeg = 0

  for (const ev of events) {
    if (ev.type === 'Bobs27LegStarted') {
      currentLeg = ev.legIndex
      if (!byLeg.has(currentLeg)) byLeg.set(currentLeg, [])
      byLeg.get(currentLeg)!.push(ev)
      continue
    }
    if (ev.type === 'Bobs27MatchStarted') {
      byLeg.get(0)!.push(ev)
      continue
    }
    if (!byLeg.has(currentLeg)) byLeg.set(currentLeg, [])
    byLeg.get(currentLeg)!.push(ev)
  }

  return byLeg
}

/** Liste aller tatsaechlich gespielten Leg-Indizes, sortiert. */
export function listBobs27LegIndices(match: Bobs27StoredMatch): number[] {
  const legs = new Set<number>()
  let hasAnyThrow = false
  let currentLeg = 0
  legs.add(0)
  for (const ev of match.events) {
    if (ev.type === 'Bobs27LegStarted') {
      currentLeg = ev.legIndex
      legs.add(currentLeg)
    } else if (ev.type === 'Bobs27Throw' || ev.type === 'Bobs27TargetFinished') {
      hasAnyThrow = true
      legs.add(currentLeg)
    }
  }
  if (!hasAnyThrow) return []
  return Array.from(legs).sort((a, b) => a - b)
}

/**
 * Berechnet die Leg-Statistik fuer einen Spieler in einem bestimmten Leg.
 * Bull wird strikt von D1-D20 getrennt erfasst.
 */
export function computeBobs27LegStats(
  match: Bobs27StoredMatch,
  playerId: string,
  legIndex: number
): Bobs27LegStats | null {
  const targets = match.targets
  const config = match.config
  if (!targets || !config) return null

  // Events dieses Legs + Spielers sammeln
  let currentLeg = 0
  const legThrows: Bobs27ThrowEvent[] = []
  const legTargetFinished: Bobs27TargetFinishedEvent[] = []

  for (const ev of match.events) {
    if (ev.type === 'Bobs27LegStarted') {
      currentLeg = ev.legIndex
      continue
    }
    if (currentLeg !== legIndex) continue
    if (ev.type === 'Bobs27Throw' && ev.playerId === playerId) {
      legThrows.push(ev)
    } else if (ev.type === 'Bobs27TargetFinished' && ev.playerId === playerId) {
      legTargetFinished.push(ev)
    }
  }

  if (legThrows.length === 0 && legTargetFinished.length === 0) return null

  // Wuerfe nach Target gruppieren (fuer First-Dart-Hit + Conversion)
  const throwsByTarget = new Map<number, Bobs27ThrowEvent[]>()
  for (const t of legThrows) {
    if (!throwsByTarget.has(t.targetIndex)) throwsByTarget.set(t.targetIndex, [])
    throwsByTarget.get(t.targetIndex)!.push(t)
  }
  for (const arr of throwsByTarget.values()) {
    arr.sort((a, b) => a.dartNumber - b.dartNumber)
  }

  const doubleRows: Bobs27DoubleRow[] = []
  let doublesDarts = 0
  let doublesHits = 0
  let doublesVisits = 0
  let doublesVisitsWithHit = 0
  let bullDarts = 0
  let bullHits = 0
  let hasBullVisit = false
  let zeroVisits = 0
  let firstDartHits = 0
  let conversionsCount = 0
  let missedFirstDartCount = 0

  for (const tf of legTargetFinished) {
    const target = targets[tf.targetIndex]
    if (!target) continue
    const targetThrows = throwsByTarget.get(tf.targetIndex) ?? []
    const dartsThrown = targetThrows.length
    const firstDart = targetThrows[0]
    const firstHit = firstDart?.hit === true
    let conversion = false
    if (firstDart && !firstDart.hit && targetThrows.length > 1) {
      conversion = targetThrows.slice(1).some(d => d.hit)
    }
    const isBull = target.fieldNumber === 25
    const success = (tf.hits >= 1 ? 1 : 0) as 0 | 1

    doubleRows.push({
      label: target.label,
      fieldNumber: target.fieldNumber,
      isBull,
      hits: tf.hits,
      darts: dartsThrown,
      delta: tf.delta,
      success,
      firstDartHit: firstHit,
      conversionAfterMiss: conversion,
    })

    if (isBull) {
      bullDarts += dartsThrown
      bullHits += tf.hits
      hasBullVisit = true
    } else {
      doublesDarts += dartsThrown
      doublesHits += tf.hits
      doublesVisits++
      if (tf.hits >= 1) doublesVisitsWithHit++
    }

    if (tf.hits === 0) zeroVisits++
    if (firstHit) firstDartHits++
    if (firstDart && !firstDart.hit) {
      missedFirstDartCount++
      if (conversion) conversionsCount++
    }
  }

  // Longest hit streak (aufeinanderfolgende Treffer ueber alle Darts)
  const sortedThrows = [...legThrows].sort((a, b) => {
    if (a.targetIndex !== b.targetIndex) return a.targetIndex - b.targetIndex
    return a.dartNumber - b.dartNumber
  })
  let longestHitStreak = 0
  let currentStreak = 0
  for (const t of sortedThrows) {
    if (t.hit) {
      currentStreak++
      if (currentStreak > longestHitStreak) longestHitStreak = currentStreak
    } else currentStreak = 0
  }

  // Worst Zero-Streak + Best Target-Streak (ueber Targets)
  let worstZeroStreak = 0
  let currentZero = 0
  let bestTargetStreak = 0
  let currentTargetStreak = 0
  for (const row of doubleRows) {
    if (row.hits === 0) {
      currentZero++
      if (currentZero > worstZeroStreak) worstZeroStreak = currentZero
      currentTargetStreak = 0
    } else {
      currentTargetStreak++
      if (currentTargetStreak > bestTargetStreak) bestTargetStreak = currentTargetStreak
      currentZero = 0
    }
  }

  const lastTf = legTargetFinished[legTargetFinished.length - 1]
  const finalScore = lastTf?.newScore ?? config.startScore
  const eliminated = lastTf?.eliminated === true
  const eliminatedAtTarget = eliminated ? (lastTf?.targetIndex ?? null) : null

  const totalHits = legThrows.filter(t => t.hit).length
  const totalDarts = legThrows.length

  return {
    legIndex,
    playerId,
    finalScore,
    totalDarts,
    totalHits,
    doublesDarts,
    doublesHits,
    doubleRatePerDart: doublesDarts > 0 ? (doublesHits / doublesDarts) * 100 : 0,
    doublesVisits,
    doublesVisitsWithHit,
    doubleRatePerVisit: doublesVisits > 0 ? (doublesVisitsWithHit / doublesVisits) * 100 : 0,
    bullDarts: hasBullVisit ? bullDarts : null,
    bullHits: hasBullVisit ? bullHits : null,
    bullRatePerDart: hasBullVisit && bullDarts > 0 ? (bullHits / bullDarts) * 100 : null,
    bullVisitHit: hasBullVisit ? bullHits >= 1 : null,
    zeroVisits,
    firstDartHits,
    conversionRate: missedFirstDartCount > 0 ? (conversionsCount / missedFirstDartCount) * 100 : 0,
    longestHitStreak,
    worstZeroStreak,
    bestTargetStreak,
    doubleRows,
    eliminated,
    eliminatedAtTarget,
  }
}
