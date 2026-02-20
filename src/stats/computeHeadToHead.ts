// src/stats/computeHeadToHead.ts
// Head-to-Head Vergleich zwischen zwei Spielern
// Berechnet alle Stats direkt aus den Matches (ohne longTermStats)

import type { StoredMatch, CricketStoredMatch } from '../storage'
import type { ATBStoredMatch } from '../types/aroundTheBlock'
import type { CTFStoredMatch } from '../types/captureTheField'
import type { ShanghaiStoredMatch, ShanghaiTurnAddedEvent } from '../types/shanghai'
import type { KillerStoredMatch, KillerTurnAddedEvent } from '../types/killer'
import { isCheckout } from '../checkoutTable'
import type { MatchFinished, VisitAdded } from '../darts501'
import type { CricketMatchFinished, CricketTurnAdded, CricketMatchStarted } from '../dartsCricket'

// ============================================================
// X01 HEAD-TO-HEAD STATS (berechnet direkt aus Matches)
// ============================================================

export type X01H2HStats = {
  // Übersicht
  matchesPlayed: number
  matchesWon: number
  legsWon: number
  legsPlayed: number

  // Scoring
  threeDartAvg: number
  first9Avg: number
  highestVisit: number
  tons180: number
  tons140Plus: number
  tons100Plus: number
  pointsTotal: number
  dartsThrown: number

  // Checkout
  checkoutPct: number
  doubleAttempts: number
  doublesHit: number
  highestCheckout: number
  checkoutPctLow: number   // ≤40
  checkoutPctMid: number   // 41-100
  checkoutPctHigh: number  // 101-170

  // Doppel
  favouriteDouble: string | undefined
  finishingDoubles: Record<string, number>

  // Busts
  totalBusts: number
  bustRate: number

  // Effizienz
  avgDartsPerLeg: number

  // Triple-Stats
  tripleFollowUp: {
    totalVisits: number      // Aufnahmen wo Dart 1 ein Triple 15-20 war
    followedByWaste: number  // davon mit Waste Dart
    followedByTriple: number // davon mit noch einem Triple
    wasteRate: number        // Prozent
    tripleRate: number       // Prozent
  }
  longestTripleStreak: number // Längste Serie von Aufnahmen mit mind. 1 Triple 15-20
}

export type X01HeadToHeadResult = {
  player1Id: string
  player2Id: string
  h2hMatches: StoredMatch[]
  matchesPlayed: number
  player1Wins: number
  player2Wins: number
  player1Stats: X01H2HStats
  player2Stats: X01H2HStats
}

/**
 * Berechnet X01 Stats für einen Spieler aus gegebenen Matches
 */
function computeX01StatsFromMatches(
  playerId: string,
  matches: StoredMatch[]
): X01H2HStats {
  const stats: X01H2HStats = {
    matchesPlayed: 0,
    matchesWon: 0,
    legsWon: 0,
    legsPlayed: 0,
    threeDartAvg: 0,
    first9Avg: 0,
    highestVisit: 0,
    tons180: 0,
    tons140Plus: 0,
    tons100Plus: 0,
    pointsTotal: 0,
    dartsThrown: 0,
    checkoutPct: 0,
    doubleAttempts: 0,
    doublesHit: 0,
    highestCheckout: 0,
    checkoutPctLow: 0,
    checkoutPctMid: 0,
    checkoutPctHigh: 0,
    favouriteDouble: undefined,
    finishingDoubles: {},
    totalBusts: 0,
    bustRate: 0,
    avgDartsPerLeg: 0,
    tripleFollowUp: {
      totalVisits: 0,
      followedByWaste: 0,
      followedByTriple: 0,
      wasteRate: 0,
      tripleRate: 0,
    },
    longestTripleStreak: 0,
  }

  // Checkout-Bereich Zähler
  let checkoutLowAttempts = 0, checkoutLowHits = 0
  let checkoutMidAttempts = 0, checkoutMidHits = 0
  let checkoutHighAttempts = 0, checkoutHighHits = 0

  // First-9 Daten pro Leg
  const first9Data: { points: number; darts: number }[] = []

  // Visits im Checkout-Bereich (für Bust-Rate)
  let visitsInCheckoutRange = 0

  // Triple-Folge Stats
  let firstTripleVisits = 0
  let firstTripleFollowedByWaste = 0
  let firstTripleFollowedByTriple = 0

  // Triple-Streak (längste Serie von Aufnahmen mit mind. 1 Triple 15-20)
  let longestTripleStreak = 0
  let currentTripleStreak = 0

  for (const match of matches) {
    if (!match.finished) continue
    if (!match.playerIds.includes(playerId)) continue

    stats.matchesPlayed++

    // Match gewonnen?
    const finishEvt = match.events.find(e => e.type === 'MatchFinished') as MatchFinished | undefined
    if (finishEvt?.winnerPlayerId === playerId) {
      stats.matchesWon++
    }

    // First-9 Tracking pro Leg
    const legFirst9: Record<string, { points: number; darts: number }> = {}

    // Visits durchgehen
    const visits = match.events.filter(
      e => e.type === 'VisitAdded' && (e as VisitAdded).playerId === playerId
    ) as VisitAdded[]

    for (const v of visits) {
      // Basis-Stats
      stats.dartsThrown += v.darts.length
      stats.pointsTotal += v.visitScore

      // Höchste Aufnahme
      if (v.visitScore > stats.highestVisit) {
        stats.highestVisit = v.visitScore
      }

      // Ton-Bins
      if (v.visitScore === 180) stats.tons180++
      else if (v.visitScore >= 140) stats.tons140Plus++
      else if (v.visitScore >= 100) stats.tons100Plus++

      // Bust-Tracking
      if (v.remainingBefore <= 170) {
        visitsInCheckoutRange++
        if (v.bust) stats.totalBusts++
      }

      // Checkout-Analyse
      const wasCheckout = v.remainingAfter === 0 && !v.bust
      const rem = v.remainingBefore

      if (rem <= 40 && rem >= 2) {
        checkoutLowAttempts++
        if (wasCheckout) checkoutLowHits++
      } else if (rem <= 100 && rem > 40) {
        checkoutMidAttempts++
        if (wasCheckout) checkoutMidHits++
      } else if (rem <= 170 && rem > 100) {
        checkoutHighAttempts++
        if (wasCheckout) checkoutHighHits++
      }

      // Double-Attempts auf Dart-Ebene (konsistent mit computePlayerStats.ts)
      // Zähle jeden Wurf auf ein Double-Feld, wenn man auf Checkout-Rest steht
      if (isCheckout(v.remainingBefore)) {
        for (const d of v.darts) {
          // Prüfe ob der Wurf auf ein Double zielt (mult === 2 oder DBULL)
          const isDoubleThrow = d.mult === 2 || d.bed === 'DBULL'
          if (isDoubleThrow) {
            stats.doubleAttempts++
            // Checkout getroffen?
            if (d.seq === v.finishingDartSeq && wasCheckout) {
              stats.doublesHit++
            }
          }
        }
      }

      // Checkout getroffen - Doppel tracken
      if (wasCheckout) {
        stats.legsWon++
        const lastDart = v.darts[v.darts.length - 1]
        if (lastDart && lastDart.mult === 2) {
          const bed = lastDart.bed.toString()
          stats.finishingDoubles[bed] = (stats.finishingDoubles[bed] || 0) + 1
          if (v.remainingBefore > stats.highestCheckout) {
            stats.highestCheckout = v.remainingBefore
          }
        } else if (lastDart?.bed === 'DBULL') {
          stats.finishingDoubles['BULL'] = (stats.finishingDoubles['BULL'] || 0) + 1
          if (v.remainingBefore > stats.highestCheckout) {
            stats.highestCheckout = v.remainingBefore
          }
        }
      }

      // First-9 Tracking
      const legId = v.legId
      if (!legFirst9[legId]) {
        legFirst9[legId] = { points: 0, darts: 0 }
      }
      if (legFirst9[legId].darts < 9) {
        for (const d of v.darts) {
          if (legFirst9[legId].darts >= 9) break
          legFirst9[legId].points += v.bust ? 0 : d.score
          legFirst9[legId].darts++
        }
      }

      // Triple-Folge Analyse: War Dart 1 ein Triple auf 15-20?
      if (v.darts.length >= 1) {
        const d1 = v.darts[0]
        const d1Bed = (d1 as any).bed
        const isHighTriple = d1.mult === 3 && typeof d1Bed === 'number' && d1Bed >= 15 && d1Bed <= 20

        if (isHighTriple && v.darts.length >= 2) {
          firstTripleVisits++

          // Prüfe Dart 2 und 3
          let hasWaste = false
          let hasTriple = false
          let currentRest = v.remainingBefore - d1.score

          for (let i = 1; i < v.darts.length; i++) {
            const fd = v.darts[i]
            const fdBed = (fd as any).bed

            // Waste-Dart Prüfung
            if (currentRest <= 170 && currentRest >= 2) {
              // Im Checkout-Bereich: Score 1-14 ist Waste (vereinfacht)
              if (fd.score >= 1 && fd.score <= 14) {
                hasWaste = true
              }
            } else if (currentRest > 170) {
              // Außerhalb Checkout-Bereich: Score 1-14 ist Waste
              if (fd.score >= 1 && fd.score <= 14) {
                hasWaste = true
              }
            }

            // Weiteres Triple auf 15-20?
            if (fd.mult === 3 && typeof fdBed === 'number' && fdBed >= 15 && fdBed <= 20) {
              hasTriple = true
            }

            currentRest -= fd.score
          }

          if (hasWaste) firstTripleFollowedByWaste++
          if (hasTriple) firstTripleFollowedByTriple++
        }
      }

      // Triple-Streak: Hat diese Aufnahme mindestens ein Triple auf 15-20?
      const hasAnyHighTriple = v.darts.some(d => {
        const bed = (d as any).bed
        return d.mult === 3 && typeof bed === 'number' && bed >= 15 && bed <= 20
      })

      if (hasAnyHighTriple) {
        currentTripleStreak++
        if (currentTripleStreak > longestTripleStreak) {
          longestTripleStreak = currentTripleStreak
        }
      } else {
        currentTripleStreak = 0
      }
    }

    // First-9 Daten sammeln
    for (const f9 of Object.values(legFirst9)) {
      if (f9.darts > 0) {
        first9Data.push(f9)
      }
    }

    // Legs zählen
    const legFinishes = match.events.filter(e => e.type === 'LegFinished')
    stats.legsPlayed += legFinishes.length
  }

  // Averages berechnen
  if (stats.dartsThrown > 0) {
    stats.threeDartAvg = (stats.pointsTotal / stats.dartsThrown) * 3
  }

  // First-9 Average
  if (first9Data.length > 0) {
    let totalF9Points = 0
    let totalF9Darts = 0
    for (const f9 of first9Data) {
      totalF9Points += f9.points
      totalF9Darts += f9.darts
    }
    if (totalF9Darts > 0) {
      stats.first9Avg = (totalF9Points / totalF9Darts) * 3
    }
  }

  // Checkout-Quoten
  if (stats.doubleAttempts > 0) {
    stats.checkoutPct = (stats.doublesHit / stats.doubleAttempts) * 100
  }
  if (checkoutLowAttempts > 0) {
    stats.checkoutPctLow = (checkoutLowHits / checkoutLowAttempts) * 100
  }
  if (checkoutMidAttempts > 0) {
    stats.checkoutPctMid = (checkoutMidHits / checkoutMidAttempts) * 100
  }
  if (checkoutHighAttempts > 0) {
    stats.checkoutPctHigh = (checkoutHighHits / checkoutHighAttempts) * 100
  }

  // Bust-Rate
  if (visitsInCheckoutRange > 0) {
    stats.bustRate = (stats.totalBusts / visitsInCheckoutRange) * 100
  }

  // Avg Darts per Leg
  if (stats.legsWon > 0) {
    stats.avgDartsPerLeg = stats.dartsThrown / stats.legsWon
  }

  // Lieblingsdoppel
  let maxFinishes = 0
  for (const [bed, count] of Object.entries(stats.finishingDoubles)) {
    if (count > maxFinishes) {
      maxFinishes = count
      stats.favouriteDouble = bed
    }
  }

  // Triple-Folge Stats
  stats.tripleFollowUp = {
    totalVisits: firstTripleVisits,
    followedByWaste: firstTripleFollowedByWaste,
    followedByTriple: firstTripleFollowedByTriple,
    wasteRate: firstTripleVisits > 0 ? (firstTripleFollowedByWaste / firstTripleVisits) * 100 : 0,
    tripleRate: firstTripleVisits > 0 ? (firstTripleFollowedByTriple / firstTripleVisits) * 100 : 0,
  }
  stats.longestTripleStreak = longestTripleStreak

  return stats
}

/**
 * Berechnet X01 Head-to-Head Stats zwischen zwei Spielern
 */
export function computeX01HeadToHead(
  player1Id: string,
  player2Id: string,
  allMatches: StoredMatch[]
): X01HeadToHeadResult {
  // Matches filtern wo BEIDE dabei waren
  const h2hMatches = allMatches.filter(m =>
    m.finished &&
    m.playerIds.includes(player1Id) &&
    m.playerIds.includes(player2Id)
  )

  // Match-Siege zählen
  let player1Wins = 0
  let player2Wins = 0

  for (const match of h2hMatches) {
    const finishEvt = match.events.find(e => e.type === 'MatchFinished') as MatchFinished | undefined
    if (finishEvt) {
      if (finishEvt.winnerPlayerId === player1Id) player1Wins++
      if (finishEvt.winnerPlayerId === player2Id) player2Wins++
    }
  }

  // Stats für beide Spieler berechnen
  const player1Stats = computeX01StatsFromMatches(player1Id, h2hMatches)
  const player2Stats = computeX01StatsFromMatches(player2Id, h2hMatches)

  return {
    player1Id,
    player2Id,
    h2hMatches,
    matchesPlayed: h2hMatches.length,
    player1Wins,
    player2Wins,
    player1Stats,
    player2Stats,
  }
}

// ============================================================
// CRICKET HEAD-TO-HEAD STATS
// ============================================================

export type CricketH2HStats = {
  // Übersicht
  matchesPlayed: number
  matchesWon: number
  legsWon: number

  // Marks
  totalMarks: number
  avgMarksPerTurn: number
  avgMarksPerDart: number
  bestTurnMarks: number

  // Treffer
  totalTriples: number
  totalDoubles: number
  totalSingles: number
  totalBullSingles: number
  totalBullDoubles: number
  bullAccuracy: number

  // Felder
  fieldMarks: Record<string, number>
  strongestField: string | undefined
  weakestField: string | undefined

  // Effizienz
  noScoreTurns: number
  noScoreRate: number
  totalTurns: number
  totalDarts: number

  // Triple-Analyse
  tripleFollowUp: {
    totalTurns: number       // Runden wo Dart 1 ein Triple war
    followedByWaste: number  // davon mit Waste Dart (Miss)
    followedByTriple: number // davon mit noch einem Triple
    wasteRate: number        // Prozent
    tripleRate: number       // Prozent
  }
  longestTripleStreak: number // Längste Serie von Runden mit mind. 1 Triple
}

export type CricketHeadToHeadResult = {
  player1Id: string
  player2Id: string
  h2hMatches: CricketStoredMatch[]
  matchesPlayed: number
  player1Wins: number
  player2Wins: number
  player1Stats: CricketH2HStats
  player2Stats: CricketH2HStats
}

/**
 * Berechnet Cricket Stats für einen Spieler aus gegebenen Matches
 */
function computeCricketStatsFromMatches(
  playerId: string,
  matches: CricketStoredMatch[]
): CricketH2HStats {
  const stats: CricketH2HStats = {
    matchesPlayed: 0,
    matchesWon: 0,
    legsWon: 0,
    totalMarks: 0,
    avgMarksPerTurn: 0,
    avgMarksPerDart: 0,
    bestTurnMarks: 0,
    totalTriples: 0,
    totalDoubles: 0,
    totalSingles: 0,
    totalBullSingles: 0,
    totalBullDoubles: 0,
    bullAccuracy: 0,
    fieldMarks: {},
    strongestField: undefined,
    weakestField: undefined,
    noScoreTurns: 0,
    noScoreRate: 0,
    totalTurns: 0,
    totalDarts: 0,
    tripleFollowUp: {
      totalTurns: 0,
      followedByWaste: 0,
      followedByTriple: 0,
      wasteRate: 0,
      tripleRate: 0,
    },
    longestTripleStreak: 0,
  }

  let totalBullAttempts = 0
  let totalBullHits = 0

  // Triple-Folge Stats
  let firstTripleTurns = 0
  let firstTripleFollowedByWaste = 0
  let firstTripleFollowedByTriple = 0

  // Triple-Streak
  let longestTripleStreak = 0
  let currentTripleStreak = 0

  for (const match of matches) {
    if (!match.finished) continue
    if (!match.playerIds.includes(playerId)) continue

    stats.matchesPlayed++

    // Match gewonnen?
    const finishEvt = match.events.find(e => e.type === 'CricketMatchFinished') as CricketMatchFinished | undefined
    if (finishEvt?.winnerPlayerId === playerId) {
      stats.matchesWon++
    }

    // Leg-Siege zählen
    const legFinishes = match.events.filter(e => e.type === 'CricketLegFinished')
    for (const lf of legFinishes) {
      if ((lf as any).winnerPlayerId === playerId) {
        stats.legsWon++
      }
    }

    // Turns durchgehen
    const turns = match.events.filter(
      e => e.type === 'CricketTurnAdded' && (e as CricketTurnAdded).playerId === playerId
    ) as CricketTurnAdded[]

    for (const turn of turns) {
      stats.totalTurns++
      let turnMarks = 0

      for (const d of turn.darts) {
        stats.totalDarts++

        if (d.target === 'MISS') continue

        const mult = d.mult ?? 1
        turnMarks += mult

        // Treffer-Typ zählen
        if (d.target === 'BULL') {
          totalBullAttempts++
          if (mult >= 1) totalBullHits++
          if (mult === 1) stats.totalBullSingles++
          if (mult === 2) stats.totalBullDoubles++
        } else {
          if (mult === 3) stats.totalTriples++
          else if (mult === 2) stats.totalDoubles++
          else if (mult === 1) stats.totalSingles++

          // Feld-Marks
          const field = d.target.toString()
          stats.fieldMarks[field] = (stats.fieldMarks[field] || 0) + mult
        }
      }

      stats.totalMarks += turnMarks

      if (turnMarks === 0) {
        stats.noScoreTurns++
      }

      if (turnMarks > stats.bestTurnMarks) {
        stats.bestTurnMarks = turnMarks
      }

      // Triple-Folge Analyse: War Dart 1 ein Triple?
      if (turn.darts.length >= 1) {
        const d1 = turn.darts[0]
        const isTriple = d1.mult === 3 && d1.target !== 'MISS' && d1.target !== 'BULL'

        if (isTriple && turn.darts.length >= 2) {
          firstTripleTurns++

          let hasWaste = false
          let hasTriple = false

          for (let i = 1; i < turn.darts.length; i++) {
            const fd = turn.darts[i]

            // Waste = Miss
            if (fd.target === 'MISS') {
              hasWaste = true
            }

            // Weiteres Triple?
            if (fd.mult === 3 && fd.target !== 'MISS' && fd.target !== 'BULL') {
              hasTriple = true
            }
          }

          if (hasWaste) firstTripleFollowedByWaste++
          if (hasTriple) firstTripleFollowedByTriple++
        }
      }

      // Triple-Streak: Hat diese Runde mindestens ein Triple?
      const hasAnyTriple = turn.darts.some(d =>
        d.mult === 3 && d.target !== 'MISS' && d.target !== 'BULL'
      )

      if (hasAnyTriple) {
        currentTripleStreak++
        if (currentTripleStreak > longestTripleStreak) {
          longestTripleStreak = currentTripleStreak
        }
      } else {
        currentTripleStreak = 0
      }
    }
  }

  // Averages
  if (stats.totalTurns > 0) {
    stats.avgMarksPerTurn = stats.totalMarks / stats.totalTurns
    stats.noScoreRate = (stats.noScoreTurns / stats.totalTurns) * 100
  }
  if (stats.totalDarts > 0) {
    stats.avgMarksPerDart = stats.totalMarks / stats.totalDarts
  }
  if (totalBullAttempts > 0) {
    stats.bullAccuracy = (totalBullHits / totalBullAttempts) * 100
  }

  // Stärkstes/Schwächstes Feld
  let maxMarks = 0
  let minMarks = Infinity
  for (const [field, marks] of Object.entries(stats.fieldMarks)) {
    if (marks > maxMarks) {
      maxMarks = marks
      stats.strongestField = field
    }
    if (marks < minMarks) {
      minMarks = marks
      stats.weakestField = field
    }
  }

  // Triple-Folge Stats
  stats.tripleFollowUp = {
    totalTurns: firstTripleTurns,
    followedByWaste: firstTripleFollowedByWaste,
    followedByTriple: firstTripleFollowedByTriple,
    wasteRate: firstTripleTurns > 0 ? (firstTripleFollowedByWaste / firstTripleTurns) * 100 : 0,
    tripleRate: firstTripleTurns > 0 ? (firstTripleFollowedByTriple / firstTripleTurns) * 100 : 0,
  }
  stats.longestTripleStreak = longestTripleStreak

  return stats
}

/**
 * Berechnet Cricket Head-to-Head Stats zwischen zwei Spielern
 */
export function computeCricketHeadToHead(
  player1Id: string,
  player2Id: string,
  allMatches: CricketStoredMatch[]
): CricketHeadToHeadResult {
  // Matches filtern wo BEIDE dabei waren
  const h2hMatches = allMatches.filter(m =>
    m.finished &&
    m.playerIds.includes(player1Id) &&
    m.playerIds.includes(player2Id)
  )

  // Match-Siege zählen
  let player1Wins = 0
  let player2Wins = 0

  for (const match of h2hMatches) {
    const finishEvt = match.events.find(e => e.type === 'CricketMatchFinished') as CricketMatchFinished | undefined
    if (finishEvt) {
      if (finishEvt.winnerPlayerId === player1Id) player1Wins++
      if (finishEvt.winnerPlayerId === player2Id) player2Wins++
    }
  }

  // Stats für beide Spieler berechnen
  const player1Stats = computeCricketStatsFromMatches(player1Id, h2hMatches)
  const player2Stats = computeCricketStatsFromMatches(player2Id, h2hMatches)

  return {
    player1Id,
    player2Id,
    h2hMatches,
    matchesPlayed: h2hMatches.length,
    player1Wins,
    player2Wins,
    player1Stats,
    player2Stats,
  }
}

// ============================================================
// ATB (AROUND THE BLOCK) HEAD-TO-HEAD STATS
// ============================================================

export type ATBH2HStats = {
  // Übersicht
  matchesPlayed: number
  matchesWon: number

  // Darts
  totalDarts: number
  avgDartsPerMatch: number

  // Treffer
  totalTriples: number
  totalDoubles: number
  totalSingles: number
  totalMisses: number
  hitRate: number // Prozent

  // Effizienz
  avgDartsPerField: number
  fieldsCompleted: number

  // Bestleistungen
  bestTime?: number // ms
  bestDarts?: number
}

export type ATBHeadToHeadResult = {
  player1Id: string
  player2Id: string
  h2hMatches: ATBStoredMatch[]
  matchesPlayed: number
  player1Wins: number
  player2Wins: number
  player1Stats: ATBH2HStats
  player2Stats: ATBH2HStats
}

/**
 * Berechnet ATB Stats für einen Spieler aus gegebenen Matches
 */
function computeATBStatsFromMatches(
  playerId: string,
  matches: ATBStoredMatch[]
): ATBH2HStats {
  const stats: ATBH2HStats = {
    matchesPlayed: 0,
    matchesWon: 0,
    totalDarts: 0,
    avgDartsPerMatch: 0,
    totalTriples: 0,
    totalDoubles: 0,
    totalSingles: 0,
    totalMisses: 0,
    hitRate: 0,
    avgDartsPerField: 0,
    fieldsCompleted: 0,
    bestTime: undefined,
    bestDarts: undefined,
  }

  for (const match of matches) {
    if (!match.finished) continue
    if (!match.players.some(p => p.playerId === playerId)) continue

    stats.matchesPlayed++

    // Match gewonnen?
    const isWinner = match.winnerId === playerId
    if (isWinner) {
      stats.matchesWon++

      // Best Time/Darts nur bei gewonnenen Matches
      if (match.durationMs && (!stats.bestTime || match.durationMs < stats.bestTime)) {
        stats.bestTime = match.durationMs
      }
    }

    // Darts durchgehen
    let matchDarts = 0
    let matchFieldsCompleted = 0

    for (const event of match.events) {
      if (event.type === 'ATBTurnAdded' && event.playerId === playerId) {
        for (const dart of event.darts) {
          matchDarts++
          stats.totalDarts++

          if (dart.target === 'MISS') {
            stats.totalMisses++
          } else if (dart.mult === 3) {
            stats.totalTriples++
          } else if (dart.mult === 2) {
            stats.totalDoubles++
          } else {
            stats.totalSingles++
          }
        }

        // Felder gezählt (wie viele neue Felder abgeschlossen)
        matchFieldsCompleted += event.fieldsAdvanced
      }
    }

    stats.fieldsCompleted += matchFieldsCompleted

    // Best Darts bei gewonnenem Match
    if (isWinner && (!stats.bestDarts || matchDarts < stats.bestDarts)) {
      stats.bestDarts = matchDarts
    }
  }

  // Averages berechnen
  const hits = stats.totalDarts - stats.totalMisses
  if (stats.totalDarts > 0) {
    stats.hitRate = (hits / stats.totalDarts) * 100
  }
  if (stats.matchesPlayed > 0) {
    stats.avgDartsPerMatch = stats.totalDarts / stats.matchesPlayed
  }
  if (stats.fieldsCompleted > 0) {
    stats.avgDartsPerField = stats.totalDarts / stats.fieldsCompleted
  }

  return stats
}

/**
 * Berechnet ATB Head-to-Head Stats zwischen zwei Spielern
 */
export function computeATBHeadToHead(
  player1Id: string,
  player2Id: string,
  allMatches: ATBStoredMatch[]
): ATBHeadToHeadResult {
  // Matches filtern wo BEIDE dabei waren
  const h2hMatches = allMatches.filter(m =>
    m.finished &&
    m.players.some(p => p.playerId === player1Id) &&
    m.players.some(p => p.playerId === player2Id)
  )

  // Match-Siege zählen
  let player1Wins = 0
  let player2Wins = 0

  for (const match of h2hMatches) {
    if (match.winnerId === player1Id) player1Wins++
    if (match.winnerId === player2Id) player2Wins++
  }

  // Stats für beide Spieler berechnen
  const player1Stats = computeATBStatsFromMatches(player1Id, h2hMatches)
  const player2Stats = computeATBStatsFromMatches(player2Id, h2hMatches)

  return {
    player1Id,
    player2Id,
    h2hMatches,
    matchesPlayed: h2hMatches.length,
    player1Wins,
    player2Wins,
    player1Stats,
    player2Stats,
  }
}

// ============================================================
// CTF (CAPTURE THE FIELD) HEAD-TO-HEAD STATS
// ============================================================

export type CTFH2HStats = {
  // Übersicht
  matchesPlayed: number
  matchesWon: number

  // Darts
  totalDarts: number
  avgDartsPerMatch: number

  // Treffer
  totalTriples: number
  totalDoubles: number
  totalSingles: number
  totalMisses: number
  hitRate: number // Prozent

  // Capture-spezifisch
  totalFieldsWon: number
  totalScore: number
  avgFieldsPerMatch: number
  avgScorePerMatch: number
}

export type CTFHeadToHeadResult = {
  player1Id: string
  player2Id: string
  h2hMatches: CTFStoredMatch[]
  matchesPlayed: number
  player1Wins: number
  player2Wins: number
  player1Stats: CTFH2HStats
  player2Stats: CTFH2HStats
}

/**
 * Berechnet CTF Stats für einen Spieler aus gegebenen Matches
 */
function computeCTFStatsFromMatches(
  playerId: string,
  matches: CTFStoredMatch[]
): CTFH2HStats {
  const stats: CTFH2HStats = {
    matchesPlayed: 0,
    matchesWon: 0,
    totalDarts: 0,
    avgDartsPerMatch: 0,
    totalTriples: 0,
    totalDoubles: 0,
    totalSingles: 0,
    totalMisses: 0,
    hitRate: 0,
    totalFieldsWon: 0,
    totalScore: 0,
    avgFieldsPerMatch: 0,
    avgScorePerMatch: 0,
  }

  for (const match of matches) {
    if (!match.finished) continue
    if (!match.players.some(p => p.playerId === playerId)) continue

    stats.matchesPlayed++

    if (match.winnerId === playerId) {
      stats.matchesWon++
    }

    // Darts und Treffer durchgehen
    for (const event of match.events) {
      if (event.type === 'CTFTurnAdded' && event.playerId === playerId) {
        for (const dart of event.darts) {
          stats.totalDarts++
          if (dart.target === 'MISS') {
            stats.totalMisses++
          } else if (dart.mult === 3) {
            stats.totalTriples++
          } else if (dart.mult === 2) {
            stats.totalDoubles++
          } else {
            stats.totalSingles++
          }
        }
      }

      // Felder gewonnen und Punkte
      if (event.type === 'CTFRoundFinished') {
        if (event.winnerId === playerId) {
          stats.totalFieldsWon++
        }
        stats.totalScore += event.scoresByPlayer[playerId] ?? 0
      }
    }
  }

  // Averages berechnen
  const hits = stats.totalDarts - stats.totalMisses
  if (stats.totalDarts > 0) {
    stats.hitRate = (hits / stats.totalDarts) * 100
  }
  if (stats.matchesPlayed > 0) {
    stats.avgDartsPerMatch = stats.totalDarts / stats.matchesPlayed
    stats.avgFieldsPerMatch = stats.totalFieldsWon / stats.matchesPlayed
    stats.avgScorePerMatch = stats.totalScore / stats.matchesPlayed
  }

  return stats
}

/**
 * Berechnet CTF Head-to-Head Stats zwischen zwei Spielern
 */
export function computeCTFHeadToHead(
  player1Id: string,
  player2Id: string,
  allMatches: CTFStoredMatch[]
): CTFHeadToHeadResult {
  // Matches filtern wo BEIDE dabei waren
  const h2hMatches = allMatches.filter(m =>
    m.finished &&
    m.players.some(p => p.playerId === player1Id) &&
    m.players.some(p => p.playerId === player2Id)
  )

  // Match-Siege zählen
  let player1Wins = 0
  let player2Wins = 0

  for (const match of h2hMatches) {
    if (match.winnerId === player1Id) player1Wins++
    if (match.winnerId === player2Id) player2Wins++
  }

  // Stats für beide Spieler berechnen
  const player1Stats = computeCTFStatsFromMatches(player1Id, h2hMatches)
  const player2Stats = computeCTFStatsFromMatches(player2Id, h2hMatches)

  return {
    player1Id,
    player2Id,
    h2hMatches,
    matchesPlayed: h2hMatches.length,
    player1Wins,
    player2Wins,
    player1Stats,
    player2Stats,
  }
}

// ============================================================
// SHANGHAI HEAD-TO-HEAD STATS
// ============================================================

export type ShanghaiH2HStats = {
  matchesPlayed: number
  matchesWon: number
  totalScore: number
  avgScore: number
  avgPerRound: number
  totalDarts: number
  shanghaiCount: number
  triples: number
  doubles: number
  singles: number
  misses: number
  hitRate: number
  bestScore: number
}

export type ShanghaiHeadToHeadResult = {
  player1Id: string
  player2Id: string
  h2hMatches: ShanghaiStoredMatch[]
  matchesPlayed: number
  player1Wins: number
  player2Wins: number
  player1Stats: ShanghaiH2HStats
  player2Stats: ShanghaiH2HStats
}

function computeShanghaiStatsFromMatches(
  playerId: string,
  matches: ShanghaiStoredMatch[]
): ShanghaiH2HStats {
  const stats: ShanghaiH2HStats = {
    matchesPlayed: 0,
    matchesWon: 0,
    totalScore: 0,
    avgScore: 0,
    avgPerRound: 0,
    totalDarts: 0,
    shanghaiCount: 0,
    triples: 0,
    doubles: 0,
    singles: 0,
    misses: 0,
    hitRate: 0,
    bestScore: 0,
  }

  let totalRounds = 0

  for (const match of matches) {
    if (!match.finished) continue
    if (!match.players.some(p => p.playerId === playerId)) continue

    stats.matchesPlayed++

    if (match.winnerId === playerId) {
      stats.matchesWon++
    }

    const matchScore = match.finalScores?.[playerId] ?? 0
    stats.totalScore += matchScore
    if (matchScore > stats.bestScore) stats.bestScore = matchScore

    const turns = match.events.filter(
      (e): e is ShanghaiTurnAddedEvent => e.type === 'ShanghaiTurnAdded' && (e as any).playerId === playerId
    )

    totalRounds += turns.length

    for (const turn of turns) {
      if (turn.isShanghai) stats.shanghaiCount++

      for (const dart of turn.darts) {
        stats.totalDarts++
        if (dart.target === 'MISS') {
          stats.misses++
        } else if (dart.target === turn.targetNumber) {
          if (dart.mult === 3) stats.triples++
          else if (dart.mult === 2) stats.doubles++
          else stats.singles++
        } else {
          stats.misses++
        }
      }
    }
  }

  const hits = stats.totalDarts - stats.misses
  if (stats.totalDarts > 0) stats.hitRate = (hits / stats.totalDarts) * 100
  if (stats.matchesPlayed > 0) stats.avgScore = stats.totalScore / stats.matchesPlayed
  if (totalRounds > 0) stats.avgPerRound = stats.totalScore / totalRounds

  return stats
}

export function computeShanghaiHeadToHead(
  player1Id: string,
  player2Id: string,
  allMatches: ShanghaiStoredMatch[]
): ShanghaiHeadToHeadResult {
  const h2hMatches = allMatches.filter(m =>
    m.finished &&
    m.players.some(p => p.playerId === player1Id) &&
    m.players.some(p => p.playerId === player2Id)
  )

  let player1Wins = 0
  let player2Wins = 0
  for (const match of h2hMatches) {
    if (match.winnerId === player1Id) player1Wins++
    if (match.winnerId === player2Id) player2Wins++
  }

  return {
    player1Id,
    player2Id,
    h2hMatches,
    matchesPlayed: h2hMatches.length,
    player1Wins,
    player2Wins,
    player1Stats: computeShanghaiStatsFromMatches(player1Id, h2hMatches),
    player2Stats: computeShanghaiStatsFromMatches(player2Id, h2hMatches),
  }
}

// ============================================================
// KILLER HEAD-TO-HEAD STATS
// ============================================================

export type KillerH2HStats = {
  matchesPlayed: number
  matchesWon: number
  totalKills: number
  avgKillsPerMatch: number
  totalDarts: number
  avgSurvivedRounds: number
  avgPosition: number
  livesLost: number
  livesHealed: number
}

export type KillerHeadToHeadResult = {
  player1Id: string
  player2Id: string
  h2hMatches: KillerStoredMatch[]
  matchesPlayed: number
  player1Wins: number
  player2Wins: number
  player1Stats: KillerH2HStats
  player2Stats: KillerH2HStats
}

function computeKillerStatsFromMatches(
  playerId: string,
  matches: KillerStoredMatch[]
): KillerH2HStats {
  const stats: KillerH2HStats = {
    matchesPlayed: 0,
    matchesWon: 0,
    totalKills: 0,
    avgKillsPerMatch: 0,
    totalDarts: 0,
    avgSurvivedRounds: 0,
    avgPosition: 0,
    livesLost: 0,
    livesHealed: 0,
  }

  let totalSurvivedRounds = 0
  let totalPosition = 0

  for (const match of matches) {
    if (!match.finished) continue
    if (!match.players.some(p => p.playerId === playerId)) continue

    stats.matchesPlayed++
    if (match.winnerId === playerId) stats.matchesWon++

    const turns = match.events.filter(
      (e): e is KillerTurnAddedEvent => e.type === 'KillerTurnAdded' && e.playerId === playerId
    )

    for (const turn of turns) {
      stats.totalDarts += turn.darts.length
      stats.totalKills += turn.eliminations.length

      for (const lc of turn.livesChanges) {
        if (lc.playerId === playerId) {
          if (lc.delta < 0) stats.livesLost += Math.abs(lc.delta)
          if (lc.delta > 0) stats.livesHealed += lc.delta
        }
      }
    }

    // Leben verloren durch andere Spieler
    const otherTurns = match.events.filter(
      (e): e is KillerTurnAddedEvent => e.type === 'KillerTurnAdded' && e.playerId !== playerId
    )
    for (const turn of otherTurns) {
      for (const lc of turn.livesChanges) {
        if (lc.playerId === playerId && lc.delta < 0) {
          stats.livesLost += Math.abs(lc.delta)
        }
      }
    }

    // Position
    const finishEvt = match.events.find(e => e.type === 'KillerMatchFinished')
    if (finishEvt?.type === 'KillerMatchFinished') {
      const standing = finishEvt.finalStandings.find(s => s.playerId === playerId)
      if (standing) totalPosition += standing.position
    }

    // Survived rounds
    const elimEvt = match.events.find(
      e => e.type === 'KillerPlayerEliminated' && (e as any).playerId === playerId
    )
    if (elimEvt && elimEvt.type === 'KillerPlayerEliminated') {
      totalSurvivedRounds += elimEvt.roundNumber
    } else {
      const lastTurn = [...match.events].reverse().find(
        (e): e is KillerTurnAddedEvent => e.type === 'KillerTurnAdded'
      )
      if (lastTurn) totalSurvivedRounds += lastTurn.roundNumber
    }
  }

  if (stats.matchesPlayed > 0) {
    stats.avgKillsPerMatch = stats.totalKills / stats.matchesPlayed
    stats.avgSurvivedRounds = totalSurvivedRounds / stats.matchesPlayed
    stats.avgPosition = totalPosition / stats.matchesPlayed
  }

  return stats
}

export function computeKillerHeadToHead(
  player1Id: string,
  player2Id: string,
  allMatches: KillerStoredMatch[]
): KillerHeadToHeadResult {
  const h2hMatches = allMatches.filter(m =>
    m.finished &&
    m.players.some(p => p.playerId === player1Id) &&
    m.players.some(p => p.playerId === player2Id)
  )

  let player1Wins = 0
  let player2Wins = 0
  for (const match of h2hMatches) {
    if (match.winnerId === player1Id) player1Wins++
    if (match.winnerId === player2Id) player2Wins++
  }

  return {
    player1Id,
    player2Id,
    h2hMatches,
    matchesPlayed: h2hMatches.length,
    player1Wins,
    player2Wins,
    player1Stats: computeKillerStatsFromMatches(player1Id, h2hMatches),
    player2Stats: computeKillerStatsFromMatches(player2Id, h2hMatches),
  }
}
