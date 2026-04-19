// src/stats/computeShanghaiLegStats.ts
// Pro-Leg-Statistik fuer Shanghai (1 Leg = 20 Runden, 60 Darts, Max-Score 1890).

import type {
  ShanghaiStoredMatch,
  ShanghaiEvent,
  ShanghaiTurnAddedEvent,
  ShanghaiDart,
} from '../types/shanghai'

export const SHANGHAI_MAX_SCORE = 1890   // 3 * (1+2+...+20) * 3 = 1890
export const SHANGHAI_ROUNDS = 20
export const SHANGHAI_DARTS_PER_ROUND = 3
export const SHANGHAI_TOTAL_DARTS = SHANGHAI_ROUNDS * SHANGHAI_DARTS_PER_ROUND

export type ShanghaiRoundRow = {
  round: number          // 1..20
  targetNumber: number
  score: number
  hits: number           // Darts die targetNumber treffen (beliebiger Multiplier)
  dartsUsed: number
  hitRate: number        // hits / dartsUsed
  roundHit: boolean      // hits >= 1 (Aufnahme erfolgreich)
  firstDartHit: boolean
  firstDartMult: 0 | 1 | 2 | 3   // 0 = Miss oder daneben
  conversionAfterMiss: boolean   // Dart 1 daneben, Dart 2/3 treffer
  triples: number
  doubles: number
  singles: number
  isShanghai: boolean
  efficiency: number     // score / hits (0 wenn keine Treffer)
}

export type ShanghaiLegStats = {
  legIndex: number
  playerId: string
  finalScore: number
  scorePercent: number           // finalScore / 1890 * 100

  totalDarts: number
  totalHits: number
  hitRatePerDart: number         // %
  visitHitRate: number           // % = Runden mit >= 1 Treffer / 20

  zeroRounds: number
  firstDartHits: number
  firstDartImpact: number        // % = Punkte durch Dart 1 / Gesamtpunkte
  conversionRate: number         // % = (Treffer Dart 2/3 nach Miss Dart 1) / (Runden mit Miss Dart 1)

  triples: number
  doubles: number
  singles: number
  tripleRate: number             // % = triples / totalHits
  efficiency: number             // finalScore / totalHits (0 wenn keine Treffer)
  aggressionIndex: number        // % = triples / totalDarts

  clutchScore: number            // Punkte in Runden 15..20
  clutchHitRate: number          // % = Treffer-Darts / Gesamt-Darts in Runden 15-20

  earlyAvg: number               // Ø Score Runden 1..10
  lateAvg: number                // Ø Score Runden 11..20
  breakdownIndex: number         // earlyAvg - lateAvg (positiv = Einbruch)

  consistencyRate: number        // % Runden mit >= 2 Treffern

  longestHitStreak: number       // konsekutive Dart-Treffer
  highScoreRound: number         // max Round-Score (max 60)
  shanghaiAchieved: boolean
  shanghaiCount: number          // i.d.R. 0 oder 1 (Shanghai beendet Leg sofort)

  rounds: ShanghaiRoundRow[]
}

/**
 * Teilt Events pro Leg auf (legIndex → Events zwischen LegStarted und LegFinished).
 */
export function splitShanghaiEventsByLeg(events: ShanghaiEvent[]): Map<number, ShanghaiEvent[]> {
  const byLeg = new Map<number, ShanghaiEvent[]>()
  byLeg.set(0, [])
  let currentLeg = 0

  for (const ev of events) {
    if (ev.type === 'ShanghaiLegStarted') {
      currentLeg = ev.legIndex
      if (!byLeg.has(currentLeg)) byLeg.set(currentLeg, [])
      byLeg.get(currentLeg)!.push(ev)
      continue
    }
    if (ev.type === 'ShanghaiMatchStarted') {
      byLeg.get(0)!.push(ev)
      continue
    }
    if (!byLeg.has(currentLeg)) byLeg.set(currentLeg, [])
    byLeg.get(currentLeg)!.push(ev)
  }

  return byLeg
}

export function listShanghaiLegIndices(match: ShanghaiStoredMatch): number[] {
  const legs = new Set<number>()
  let currentLeg = 0
  let hasAnyTurn = false
  legs.add(0)
  for (const ev of match.events) {
    if (ev.type === 'ShanghaiLegStarted') {
      currentLeg = ev.legIndex
      legs.add(currentLeg)
    } else if (ev.type === 'ShanghaiTurnAdded') {
      hasAnyTurn = true
      legs.add(currentLeg)
    }
  }
  if (!hasAnyTurn) return []
  return Array.from(legs).sort((a, b) => a - b)
}

function dartTargetsNumber(d: ShanghaiDart, target: number): boolean {
  return d.target !== 'MISS' && d.target === target
}

export function computeShanghaiLegStats(
  match: ShanghaiStoredMatch,
  playerId: string,
  legIndex: number
): ShanghaiLegStats | null {
  let currentLeg = 0
  const legTurns: ShanghaiTurnAddedEvent[] = []

  for (const ev of match.events) {
    if (ev.type === 'ShanghaiLegStarted') {
      currentLeg = ev.legIndex
      continue
    }
    if (currentLeg !== legIndex) continue
    if (ev.type === 'ShanghaiTurnAdded' && ev.playerId === playerId) {
      legTurns.push(ev)
    }
  }

  if (legTurns.length === 0) return null

  // Pro Runde einen Eintrag (Runde = targetNumber)
  const rounds: ShanghaiRoundRow[] = []
  const byRound = new Map<number, ShanghaiTurnAddedEvent>()
  for (const t of legTurns) byRound.set(t.targetNumber, t)

  let totalHits = 0
  let totalDarts = 0
  let firstDartHits = 0
  let firstDartPoints = 0
  let missedFirstDartCount = 0
  let conversionsCount = 0
  let triplesTotal = 0
  let doublesTotal = 0
  let singlesTotal = 0
  let zeroRounds = 0
  let clutchScore = 0
  let clutchHits = 0
  let clutchDarts = 0
  let earlySum = 0, earlyCount = 0
  let lateSum = 0, lateCount = 0
  let consistencyRounds = 0
  let highScoreRound = 0
  let shanghaiCount = 0
  const dartSequence: boolean[] = [] // true = hit targetNumber, false = miss

  for (let round = 1; round <= SHANGHAI_ROUNDS; round++) {
    const turn = byRound.get(round)
    if (!turn) {
      // Leg vielleicht vorzeitig beendet (Shanghai). Runde ueberspringen — kein Eintrag
      continue
    }

    const target = turn.targetNumber
    const darts = turn.darts
    const roundHits = darts.filter(d => dartTargetsNumber(d, target))
    const hits = roundHits.length
    const dartsUsed = darts.length
    let triples = 0, doubles = 0, singles = 0
    for (const d of roundHits) {
      if (d.mult === 3) triples++
      else if (d.mult === 2) doubles++
      else singles++
    }
    const firstDart = darts[0]
    const firstHit = firstDart ? dartTargetsNumber(firstDart, target) : false
    const firstMult = firstDart && firstHit ? firstDart.mult : 0
    let conversion = false
    if (firstDart && !firstHit) {
      missedFirstDartCount++
      conversion = darts.slice(1).some(d => dartTargetsNumber(d, target))
      if (conversion) conversionsCount++
    }
    const score = turn.turnScore
    const hitRate = dartsUsed > 0 ? (hits / dartsUsed) * 100 : 0
    const firstDartPts = firstHit ? (firstMult as number) * target : 0
    firstDartPoints += firstDartPts
    firstDartHits += firstHit ? 1 : 0
    const isShanghai = turn.isShanghai
    if (isShanghai) shanghaiCount++
    if (hits === 0) zeroRounds++
    if (hits >= 2) consistencyRounds++
    if (score > highScoreRound) highScoreRound = score
    triplesTotal += triples
    doublesTotal += doubles
    singlesTotal += singles
    totalHits += hits
    totalDarts += dartsUsed

    if (round >= 15) {
      clutchScore += score
      clutchHits += hits
      clutchDarts += dartsUsed
    }
    if (round <= 10) { earlySum += score; earlyCount++ }
    else { lateSum += score; lateCount++ }

    for (const d of darts) dartSequence.push(dartTargetsNumber(d, target))

    const efficiency = hits > 0 ? score / hits : 0

    rounds.push({
      round,
      targetNumber: target,
      score,
      hits,
      dartsUsed,
      hitRate,
      roundHit: hits >= 1,
      firstDartHit: firstHit,
      firstDartMult: firstMult as 0 | 1 | 2 | 3,
      conversionAfterMiss: conversion,
      triples, doubles, singles,
      isShanghai,
      efficiency,
    })
  }

  const roundsPlayed = rounds.length
  const finalScore = rounds.reduce((a, r) => a + r.score, 0)
  const scorePercent = SHANGHAI_MAX_SCORE > 0 ? (finalScore / SHANGHAI_MAX_SCORE) * 100 : 0

  let longestHitStreak = 0, currentStreak = 0
  for (const hit of dartSequence) {
    if (hit) { currentStreak++; if (currentStreak > longestHitStreak) longestHitStreak = currentStreak }
    else currentStreak = 0
  }

  const visitHitRate = roundsPlayed > 0
    ? (rounds.filter(r => r.roundHit).length / roundsPlayed) * 100
    : 0

  return {
    legIndex,
    playerId,
    finalScore,
    scorePercent: Math.round(scorePercent * 10) / 10,
    totalDarts,
    totalHits,
    hitRatePerDart: totalDarts > 0 ? Math.round((totalHits / totalDarts) * 1000) / 10 : 0,
    visitHitRate: Math.round(visitHitRate * 10) / 10,
    zeroRounds,
    firstDartHits,
    firstDartImpact: finalScore > 0 ? Math.round((firstDartPoints / finalScore) * 1000) / 10 : 0,
    conversionRate: missedFirstDartCount > 0 ? Math.round((conversionsCount / missedFirstDartCount) * 1000) / 10 : 0,
    triples: triplesTotal,
    doubles: doublesTotal,
    singles: singlesTotal,
    tripleRate: totalHits > 0 ? Math.round((triplesTotal / totalHits) * 1000) / 10 : 0,
    efficiency: totalHits > 0 ? Math.round((finalScore / totalHits) * 10) / 10 : 0,
    aggressionIndex: totalDarts > 0 ? Math.round((triplesTotal / totalDarts) * 1000) / 10 : 0,
    clutchScore,
    clutchHitRate: clutchDarts > 0 ? Math.round((clutchHits / clutchDarts) * 1000) / 10 : 0,
    earlyAvg: earlyCount > 0 ? Math.round((earlySum / earlyCount) * 10) / 10 : 0,
    lateAvg: lateCount > 0 ? Math.round((lateSum / lateCount) * 10) / 10 : 0,
    breakdownIndex: Math.round(((earlyCount > 0 ? earlySum / earlyCount : 0) - (lateCount > 0 ? lateSum / lateCount : 0)) * 10) / 10,
    consistencyRate: roundsPlayed > 0 ? Math.round((consistencyRounds / roundsPlayed) * 1000) / 10 : 0,
    longestHitStreak,
    highScoreRound,
    shanghaiAchieved: shanghaiCount >= 1,
    shanghaiCount,
    rounds,
  }
}
