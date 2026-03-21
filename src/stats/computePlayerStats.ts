// src/stats/computePlayerStats.ts
// Berechnungen für Spieler-Statistiken (Allgemein, X01, Cricket, Speziell)

import { CHECKOUT_TABLE } from '../checkoutTable'
import type {
  GeneralPlayerStats,
  OpponentRecord,
  X01ExtendedStats,
  CricketExtendedStats,
  SpecialStats,
  CricketPlayerLongTermStats,
} from '../types/playerStats'

import type { StoredMatch, CricketStoredMatch, X01PlayerLongTermStats } from '../storage'
import type { DartsEvent, MatchStarted, VisitAdded, MatchFinished, LegFinished } from '../darts501'
import type { CricketMatchStarted, CricketTurnAdded, CricketMatchFinished, CricketEvent } from '../dartsCricket'
import { computeStats } from '../darts501'
import { computeCricketStats } from './computeCricketStats'
import { dbSaveCricketPlayerStats } from '../db/storage'

// ============================================================
// ALLGEMEINE STATISTIKEN
// ============================================================

/**
 * Berechnet Head-to-Head Records für einen Spieler
 */
export function computeHeadToHead(
  playerId: string,
  x01Matches: StoredMatch[],
  cricketMatches: CricketStoredMatch[]
): OpponentRecord[] {
  const opponents: Record<string, OpponentRecord> = {}

  // X01 Matches
  for (const m of x01Matches) {
    if (!m.finished) continue
    if (!m.playerIds.includes(playerId)) continue

    const finishEvt = m.events.find(e => e.type === 'MatchFinished') as MatchFinished | undefined
    if (!finishEvt) continue

    const startEvt = m.events.find(e => e.type === 'MatchStarted') as MatchStarted | undefined
    if (!startEvt) continue

    const otherPlayerIds = m.playerIds.filter(id => id !== playerId)
    const won = finishEvt.winnerPlayerId === playerId

    for (const oppId of otherPlayerIds) {
      if (!opponents[oppId]) {
        const oppName = startEvt.players.find(p => p.playerId === oppId)?.name ?? oppId
        opponents[oppId] = {
          opponentId: oppId,
          opponentName: oppName,
          matchesPlayed: 0,
          wins: 0,
          losses: 0,
          winRate: 0,
        }
      }
      opponents[oppId].matchesPlayed++
      if (won) opponents[oppId].wins++
      else opponents[oppId].losses++
    }
  }

  // Cricket Matches
  for (const m of cricketMatches) {
    if (!m.finished) continue
    if (!m.playerIds.includes(playerId)) continue

    const finishEvt = m.events.find(e => e.type === 'CricketMatchFinished') as CricketMatchFinished | undefined
    if (!finishEvt) continue

    const startEvt = m.events.find(e => e.type === 'CricketMatchStarted') as CricketMatchStarted | undefined
    if (!startEvt) continue

    const otherPlayerIds = m.playerIds.filter(id => id !== playerId)
    const won = finishEvt.winnerPlayerId === playerId

    for (const oppId of otherPlayerIds) {
      if (!opponents[oppId]) {
        const oppName = startEvt.players.find(p => p.playerId === oppId)?.name ?? oppId
        opponents[oppId] = {
          opponentId: oppId,
          opponentName: oppName,
          matchesPlayed: 0,
          wins: 0,
          losses: 0,
          winRate: 0,
        }
      }
      opponents[oppId].matchesPlayed++
      if (won) opponents[oppId].wins++
      else opponents[oppId].losses++
    }
  }

  // Win Rate berechnen
  for (const opp of Object.values(opponents)) {
    opp.winRate = opp.matchesPlayed > 0 ? (opp.wins / opp.matchesPlayed) * 100 : 0
  }

  return Object.values(opponents).sort((a, b) => b.matchesPlayed - a.matchesPlayed)
}

/**
 * Berechnet allgemeine Spieler-Statistiken
 */
export function computeGeneralPlayerStats(
  playerId: string,
  x01Matches: StoredMatch[],
  cricketMatches: CricketStoredMatch[],
  x01LongTermStats?: X01PlayerLongTermStats,
  cricketLongTermStats?: CricketPlayerLongTermStats
): GeneralPlayerStats {
  // X01 Stats
  let x01Played = 0
  let x01Won = 0
  let x01SoloPlayed = 0  // Solo-Spiele (nur Stats, kein Win)
  let x01PlayTime = 0
  const numberCounts: Record<string, number> = {} // Zähler für jede Zahl

  for (const m of x01Matches) {
    if (!m.finished) continue
    if (!m.playerIds.includes(playerId)) continue

    // Solo-Match erkennen (nur 1 Spieler)
    if (m.playerIds.length === 1) {
      x01SoloPlayed++
      // Stats zählen, aber KEIN Sieg
    } else {
      // Multiplayer-Match: Siege zählen
      x01Played++
      const finishEvt = m.events.find(e => e.type === 'MatchFinished') as MatchFinished | undefined
      if (finishEvt?.winnerPlayerId === playerId) x01Won++
    }

    // Lieblingszahl ermitteln
    const visits = m.events.filter(e => e.type === 'VisitAdded' && (e as VisitAdded).playerId === playerId) as VisitAdded[]
    for (const v of visits) {
      for (const d of v.darts) {
        if (d.bed !== 'MISS' && d.bed !== 'BULL' && d.bed !== 'DBULL') {
          const key = typeof d.bed === 'number' ? String(d.bed) : d.bed
          numberCounts[key] = (numberCounts[key] ?? 0) + 1
        } else if (d.bed === 'BULL' || d.bed === 'DBULL') {
          numberCounts['BULL'] = (numberCounts['BULL'] ?? 0) + 1
        }
      }
    }

    // Spielzeit berechnen (Differenz zwischen erstem und letztem Event)
    if (m.events.length >= 2) {
      const firstEvt = m.events[0]
      const lastEvt = m.events[m.events.length - 1]
      const firstTs = firstEvt && 'ts' in firstEvt ? firstEvt.ts : undefined
      const lastTs = lastEvt && 'ts' in lastEvt ? lastEvt.ts : undefined
      if (firstTs && lastTs) {
        const diffMs = new Date(lastTs).getTime() - new Date(firstTs).getTime()
        x01PlayTime += Math.max(0, diffMs / 60000) // in Minuten
      }
    }
  }

  // Cricket Stats
  let cricketPlayed = 0
  let cricketWon = 0
  let cricketSoloPlayed = 0  // Solo-Spiele (nur Stats, kein Win)
  let cricketPlayTime = 0
  let cricketTurnsFromEvents = 0  // Fallback-Zählung aus Events

  for (const m of cricketMatches) {
    if (!m.finished) continue
    if (!m.playerIds.includes(playerId)) continue

    // Solo-Match erkennen (nur 1 Spieler)
    if (m.playerIds.length === 1) {
      cricketSoloPlayed++
      // Stats zählen, aber KEIN Sieg
    } else {
      // Multiplayer-Match: Siege zählen
      cricketPlayed++
      const finishEvt = m.events.find(e => e.type === 'CricketMatchFinished') as CricketMatchFinished | undefined
      if (finishEvt?.winnerPlayerId === playerId) cricketWon++
    }

    // Lieblingszahl ermitteln + Turns zählen
    const turns = m.events.filter(e => e.type === 'CricketTurnAdded' && (e as CricketTurnAdded).playerId === playerId) as CricketTurnAdded[]
    cricketTurnsFromEvents += turns.length
    for (const turn of turns) {
      for (const d of turn.darts) {
        if (d.target !== 'MISS') {
          const key = d.target === 'BULL' ? 'BULL' : String(d.target)
          numberCounts[key] = (numberCounts[key] ?? 0) + 1
        }
      }
    }

    // Spielzeit berechnen
    if (m.events.length >= 2) {
      const firstEvt = m.events[0]
      const lastEvt = m.events[m.events.length - 1]
      const firstTs = firstEvt && 'ts' in firstEvt ? firstEvt.ts : undefined
      const lastTs = lastEvt && 'ts' in lastEvt ? lastEvt.ts : undefined
      if (firstTs && lastTs) {
        const diffMs = new Date(lastTs).getTime() - new Date(firstTs).getTime()
        cricketPlayTime += Math.max(0, diffMs / 60000) // in Minuten
      }
    }
  }

  // Darts aus Langzeit-Stats (konsistent mit X01/Cricket Tabs)
  const x01Darts = x01LongTermStats?.dartsThrownTotal ?? 0
  // Cricket: totalDarts aus Langzeit-Stats, oder Fallback: direkt aus Events zählen (turns * 3)
  const cricketDarts = cricketLongTermStats?.totalDarts
    ?? (cricketLongTermStats?.totalTurns ? cricketLongTermStats.totalTurns * 3 : cricketTurnsFromEvents * 3)

  // Lieblingszahl ermitteln
  let favouriteNumber: { target: number | 'BULL'; count: number } | undefined
  let maxCount = 0
  for (const [key, count] of Object.entries(numberCounts)) {
    if (count > maxCount) {
      maxCount = count
      favouriteNumber = {
        target: key === 'BULL' ? 'BULL' : parseInt(key, 10),
        count,
      }
    }
  }

  // Head-to-Head
  const opponents = computeHeadToHead(playerId, x01Matches, cricketMatches)

  // Lieblingsgegner (höchste Win-Rate, min. 3 Matches)
  const eligibleOpponents = opponents.filter(o => o.matchesPlayed >= 3)
  const favouriteOpponent = eligibleOpponents.length > 0
    ? eligibleOpponents.reduce((best, curr) => curr.winRate > best.winRate ? curr : best)
    : undefined

  // Angstgegner (niedrigste Win-Rate, min. 3 Matches)
  const fearOpponent = eligibleOpponents.length > 0
    ? eligibleOpponents.reduce((worst, curr) => curr.winRate < worst.winRate ? curr : worst)
    : undefined

  // Hauptgegner (meiste Matches)
  const mainOpponent = opponents.length > 0 ? opponents[0] : undefined // bereits nach matchesPlayed sortiert

  const totalPlayed = x01Played + cricketPlayed
  const totalWon = x01Won + cricketWon

  // Längste Siegesserie berechnen (alle Matches nach Datum sortiert)
  const allMatchResults: { date: string; won: boolean }[] = []

  for (const m of x01Matches) {
    if (!m.finished) continue
    if (!m.playerIds.includes(playerId)) continue
    const finishEvt = m.events.find(e => e.type === 'MatchFinished') as MatchFinished | undefined
    allMatchResults.push({
      date: m.createdAt,
      won: finishEvt?.winnerPlayerId === playerId,
    })
  }

  for (const m of cricketMatches) {
    if (!m.finished) continue
    if (!m.playerIds.includes(playerId)) continue
    const finishEvt = m.events.find(e => e.type === 'CricketMatchFinished') as CricketMatchFinished | undefined
    allMatchResults.push({
      date: m.createdAt,
      won: finishEvt?.winnerPlayerId === playerId,
    })
  }

  // Nach Datum sortieren (älteste zuerst)
  allMatchResults.sort((a, b) => a.date.localeCompare(b.date))

  // Längste Siegesserie finden
  let longestWinStreak = 0
  let currentWinStreak = 0
  for (const match of allMatchResults) {
    if (match.won) {
      currentWinStreak++
      if (currentWinStreak > longestWinStreak) {
        longestWinStreak = currentWinStreak
      }
    } else {
      currentWinStreak = 0
    }
  }

  return {
    matchesPlayed: totalPlayed,
    matchesWon: totalWon,
    winRate: totalPlayed > 0 ? (totalWon / totalPlayed) * 100 : 0,
    longestWinStreak,
    x01MatchesPlayed: x01Played,
    x01MatchesWon: x01Won,
    x01WinRate: x01Played > 0 ? (x01Won / x01Played) * 100 : 0,
    cricketMatchesPlayed: cricketPlayed,
    cricketMatchesWon: cricketWon,
    cricketWinRate: cricketPlayed > 0 ? (cricketWon / cricketPlayed) * 100 : 0,
    // Einzelspiele (Solo)
    x01SoloPlayed,
    cricketSoloPlayed,
    atbSoloPlayed: 0,  // ATB-Solo wird separat in computeATBLongTermStats behandelt
    opponents,
    favouriteOpponent,
    fearOpponent,
    mainOpponent,
    totalDartsThrown: x01Darts + cricketDarts,
    totalPlayTime: Math.round(x01PlayTime + cricketPlayTime),
    favouriteNumber,
  }
}

// ============================================================
// X01 EXTENDED STATISTIKEN
// ============================================================

/**
 * Berechnet erweiterte X01-Statistiken aus Langzeit-Stats
 */
export function computeX01ExtendedStats(
  longTermStats: X01PlayerLongTermStats | undefined,
  x01Matches: StoredMatch[],
  playerId: string
): X01ExtendedStats {
  // Default-Werte wenn keine Stats vorhanden
  if (!longTermStats) {
    return {
      threeDartAvg: 0,
      first9OverallAvg: 0,
      highestVisit: 0,
      tons180: 0,
      tons140Plus: 0,
      tons100Plus: 0,
      tons61Plus: 0,
      pointsTotal: 0,
      dartsThrown: 0,
      checkoutPctDart: 0,
      doubleAttemptsDart: 0,
      doublesHitDart: 0,
      highestCheckout: 0,
      bullCheckouts: 0,
      checkoutPctLow: 0,
      checkoutPctMid: 0,
      checkoutPctHigh: 0,
      favouriteDouble: undefined,
      finishingDoubles: {},
      doublesHitCount: {},
      totalBusts: 0,
      bustRate: 0,
      avgDartsPerLeg: 0,
      legsWon: 0,
      legsPlayed: 0,
      wasteDarts: 0,
      wasteDartRate: 0,
      dart1Avg: 0,
      dart2Avg: 0,
      dart3Avg: 0,
    }
  }

  // Basis-Stats aus Langzeit
  const stats: X01ExtendedStats = {
    threeDartAvg: longTermStats.threeDartAvgOverall ?? 0,
    first9OverallAvg: longTermStats.first9OverallAvg ?? 0,
    highestVisit: 180, // Max möglich
    tons180: longTermStats.tons180 ?? 0,
    tons140Plus: longTermStats.tons140Plus ?? 0,
    tons100Plus: longTermStats.tons100Plus ?? 0,
    tons61Plus: 0,  // Wird aus Matches berechnet
    pointsTotal: longTermStats.pointsScoredTotal ?? 0,
    dartsThrown: longTermStats.dartsThrownTotal ?? 0,
    checkoutPctDart: longTermStats.doublePctDart ?? 0,
    doubleAttemptsDart: longTermStats.doubleAttemptsDart ?? 0,
    doublesHitDart: longTermStats.doublesHitDart ?? 0,
    highestCheckout: longTermStats.highestCheckout ?? 0,
    bullCheckouts: 0,  // Wird aus Matches berechnet
    checkoutPctLow: 0,
    checkoutPctMid: 0,
    checkoutPctHigh: 0,
    favouriteDouble: undefined,
    finishingDoubles: longTermStats.finishingDoubles ?? {},
    doublesHitCount: longTermStats.doublesHitCount ?? {},
    totalBusts: 0,
    bustRate: 0,
    avgDartsPerLeg: 0,
    legsWon: longTermStats.legsWon ?? 0,
    legsPlayed: 0,
    wasteDarts: 0,
    wasteDartRate: 0,
    dart1Avg: 0,
    dart2Avg: 0,
    dart3Avg: 0,
  }

  // Lieblingsdoppel finden
  let maxFinishes = 0
  for (const [bed, count] of Object.entries(stats.finishingDoubles)) {
    if (count > maxFinishes) {
      maxFinishes = count
      stats.favouriteDouble = bed
    }
  }

  // Erweiterte Stats aus allen Matches berechnen
  let totalBusts = 0
  let visitsInCheckoutRange = 0
  let legsPlayed = 0
  let dart1Total = 0, dart1Count = 0
  let dart2Total = 0, dart2Count = 0
  let dart3Total = 0, dart3Count = 0
  let highestVisit = 0
  let tons61Plus = 0
  let bullCheckouts = 0

  // Checkout-Bereich Stats
  let checkoutLowAttempts = 0, checkoutLowHits = 0
  let checkoutMidAttempts = 0, checkoutMidHits = 0
  let checkoutHighAttempts = 0, checkoutHighHits = 0

  for (const m of x01Matches) {
    if (!m.finished) continue
    if (!m.playerIds.includes(playerId)) continue

    const visits = m.events.filter(e => e.type === 'VisitAdded' && (e as VisitAdded).playerId === playerId) as VisitAdded[]

    for (const v of visits) {
      // Höchste Aufnahme
      if (v.visitScore > highestVisit) highestVisit = v.visitScore

      // 61+ Aufnahmen zählen
      if (v.visitScore >= 61) tons61Plus++

      // Bust-Analyse
      if (v.bust) totalBusts++
      if (v.remainingBefore <= 170) visitsInCheckoutRange++

      // Dart-Position Stats
      for (const d of v.darts) {
        if (d.seq === 1) { dart1Total += d.score; dart1Count++ }
        if (d.seq === 2) { dart2Total += d.score; dart2Count++ }
        if (d.seq === 3) { dart3Total += d.score; dart3Count++ }
      }

      // Checkout-Bereich Analyse
      const rem = v.remainingBefore
      const wasCheckout = v.remainingAfter === 0 && !v.bust

      // Bull-Checkouts zählen
      if (wasCheckout && v.finishingDartSeq) {
        const finishingDart = v.darts.find(d => d.seq === v.finishingDartSeq)
        if (finishingDart && finishingDart.bed === 'DBULL') {
          bullCheckouts++
        }
      }

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
    }

    // Legs zählen
    const legFinishes = m.events.filter(e => e.type === 'LegFinished')
    legsPlayed += legFinishes.length
  }

  stats.highestVisit = highestVisit
  stats.tons61Plus = tons61Plus
  stats.bullCheckouts = bullCheckouts
  stats.totalBusts = totalBusts
  stats.bustRate = visitsInCheckoutRange > 0 ? (totalBusts / visitsInCheckoutRange) * 100 : 0
  stats.legsPlayed = legsPlayed
  stats.avgDartsPerLeg = stats.legsWon > 0 ? stats.dartsThrown / stats.legsWon : 0

  stats.dart1Avg = dart1Count > 0 ? dart1Total / dart1Count : 0
  stats.dart2Avg = dart2Count > 0 ? dart2Total / dart2Count : 0
  stats.dart3Avg = dart3Count > 0 ? dart3Total / dart3Count : 0

  stats.checkoutPctLow = checkoutLowAttempts > 0 ? (checkoutLowHits / checkoutLowAttempts) * 100 : 0
  stats.checkoutPctMid = checkoutMidAttempts > 0 ? (checkoutMidHits / checkoutMidAttempts) * 100 : 0
  stats.checkoutPctHigh = checkoutHighAttempts > 0 ? (checkoutHighHits / checkoutHighAttempts) * 100 : 0

  // Waste Darts werden später berechnet (nach der Funktion definiert)
  // Hier nur Platzhalter - wird in StatsProfile.tsx separat aufgerufen

  return stats
}

// ============================================================
// X01 STATS NUR AUS MATCHES (ohne Langzeit-Stats)
// ============================================================

/**
 * Berechnet X01-Stats direkt aus Matches (ohne Langzeit-Stats).
 * Verwendet für gefilterte Ansichten wie "nur 301/501/701/901" (ohne 121).
 */
export function computeX01StatsFromMatchesOnly(
  x01Matches: StoredMatch[],
  playerId: string
): X01ExtendedStats {
  const stats: X01ExtendedStats = {
    threeDartAvg: 0,
    first9OverallAvg: 0,
    highestVisit: 0,
    tons180: 0,
    tons140Plus: 0,
    tons100Plus: 0,
    tons61Plus: 0,
    pointsTotal: 0,
    dartsThrown: 0,
    checkoutPctDart: 0,
    doubleAttemptsDart: 0,
    doublesHitDart: 0,
    highestCheckout: 0,
    bullCheckouts: 0,
    checkoutPctLow: 0,
    checkoutPctMid: 0,
    checkoutPctHigh: 0,
    favouriteDouble: undefined,
    finishingDoubles: {},
    doublesHitCount: {},
    totalBusts: 0,
    bustRate: 0,
    avgDartsPerLeg: 0,
    legsWon: 0,
    legsPlayed: 0,
    wasteDarts: 0,
    wasteDartRate: 0,
    dart1Avg: 0,
    dart2Avg: 0,
    dart3Avg: 0,
  }

  let totalPoints = 0
  let totalDarts = 0
  let totalBusts = 0
  let visitsInCheckoutRange = 0
  let legsPlayed = 0
  let legsWon = 0
  let dart1Total = 0, dart1Count = 0
  let dart2Total = 0, dart2Count = 0
  let dart3Total = 0, dart3Count = 0
  let highestVisit = 0
  let highestCheckout = 0
  let tons180 = 0, tons140Plus = 0, tons100Plus = 0, tons61Plus = 0
  let bullCheckouts = 0
  let doubleAttempts = 0, doublesHit = 0

  // Checkout-Bereich Stats
  let checkoutLowAttempts = 0, checkoutLowHits = 0
  let checkoutMidAttempts = 0, checkoutMidHits = 0
  let checkoutHighAttempts = 0, checkoutHighHits = 0

  // First-9 Stats
  let first9Total = 0
  let first9Visits = 0

  const finishingDoubles: Record<string, number> = {}
  const doublesHitCount: Record<string, number> = {}

  for (const m of x01Matches) {
    if (!m.finished) continue
    if (!m.playerIds.includes(playerId)) continue

    const visits = m.events.filter(e => e.type === 'VisitAdded' && (e as VisitAdded).playerId === playerId) as VisitAdded[]

    // Für First-9: Visits pro Leg gruppieren
    const legVisits: Record<string, VisitAdded[]> = {}
    for (const v of visits) {
      const legId = v.legId ?? 'unknown'
      if (!legVisits[legId]) legVisits[legId] = []
      legVisits[legId].push(v)
    }

    // First-9 berechnen (erste 3 Aufnahmen pro Leg)
    for (const legV of Object.values(legVisits)) {
      const first3 = legV.slice(0, 3)
      for (const v of first3) {
        if (!v.bust) {
          first9Total += v.visitScore
          first9Visits++
        }
      }
    }

    for (const v of visits) {
      // Punkte und Darts (alle Würfe zählen, auch Busts)
      totalPoints += v.visitScore
      totalDarts += v.darts.length

      // Höchste Aufnahme
      if (v.visitScore > highestVisit) highestVisit = v.visitScore

      // Ton-Aufnahmen zählen (exklusiv, keine Doppelzählung)
      if (v.visitScore === 180) tons180++
      else if (v.visitScore >= 140) tons140Plus++
      else if (v.visitScore >= 100) tons100Plus++
      else if (v.visitScore >= 61) tons61Plus++

      // Bust-Analyse
      if (v.bust) totalBusts++
      if (v.remainingBefore <= 170) visitsInCheckoutRange++

      // Dart-Position Stats
      for (const d of v.darts) {
        if (d.seq === 1) { dart1Total += d.score; dart1Count++ }
        if (d.seq === 2) { dart2Total += d.score; dart2Count++ }
        if (d.seq === 3) { dart3Total += d.score; dart3Count++ }
      }

      // Checkout-Bereich Analyse
      const rem = v.remainingBefore
      const wasCheckout = v.remainingAfter === 0 && !v.bust

      // Bull-Checkouts und höchstes Checkout
      if (wasCheckout && v.finishingDartSeq) {
        const finishingDart = v.darts.find(d => d.seq === v.finishingDartSeq)
        if (finishingDart) {
          if (finishingDart.bed === 'DBULL') {
            bullCheckouts++
          }
          // Höchstes Checkout
          if (rem > highestCheckout) highestCheckout = rem

          // Finishing Double zählen
          const bed = finishingDart.bed
          if (typeof bed === 'string') {
            finishingDoubles[bed] = (finishingDoubles[bed] ?? 0) + 1
          }
        }
      }

      // Double-Versuche zählen (auf checkout-fähigen Resten)
      if (rem && rem > 0 && CHECKOUT_TABLE[rem]) {
        for (const d of v.darts) {
          const bed = d.bed
          if (typeof bed === 'string' && (bed.startsWith('D') || bed === 'DBULL')) {
            doubleAttempts++
            if (d.seq === v.finishingDartSeq && wasCheckout) {
              doublesHit++
              doublesHitCount[bed] = (doublesHitCount[bed] ?? 0) + 1
            }
          }
        }
      }

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
    }

    // Legs zählen
    const legFinishes = m.events.filter(e => e.type === 'LegFinished') as LegFinished[]
    legsPlayed += legFinishes.length
    legsWon += legFinishes.filter(lf => lf.winnerPlayerId === playerId).length
  }

  // Stats zuweisen
  stats.pointsTotal = totalPoints
  stats.dartsThrown = totalDarts
  stats.threeDartAvg = totalDarts > 0 ? (totalPoints / totalDarts) * 3 : 0
  // First-9 Average: Durchschnitt der ersten 3 Visits pro Leg (bereits Visit-basiert, kein ×3 nötig)
  stats.first9OverallAvg = first9Visits > 0 ? first9Total / first9Visits : 0
  stats.highestVisit = highestVisit
  stats.highestCheckout = highestCheckout
  stats.tons180 = tons180
  stats.tons140Plus = tons140Plus
  stats.tons100Plus = tons100Plus
  stats.tons61Plus = tons61Plus
  stats.bullCheckouts = bullCheckouts
  stats.totalBusts = totalBusts
  stats.bustRate = visitsInCheckoutRange > 0 ? (totalBusts / visitsInCheckoutRange) * 100 : 0
  stats.legsPlayed = legsPlayed
  stats.legsWon = legsWon
  stats.avgDartsPerLeg = legsWon > 0 ? totalDarts / legsWon : 0
  stats.doubleAttemptsDart = doubleAttempts
  stats.doublesHitDart = doublesHit
  stats.checkoutPctDart = doubleAttempts > 0 ? (doublesHit / doubleAttempts) * 100 : 0

  stats.dart1Avg = dart1Count > 0 ? dart1Total / dart1Count : 0
  stats.dart2Avg = dart2Count > 0 ? dart2Total / dart2Count : 0
  stats.dart3Avg = dart3Count > 0 ? dart3Total / dart3Count : 0

  stats.checkoutPctLow = checkoutLowAttempts > 0 ? (checkoutLowHits / checkoutLowAttempts) * 100 : 0
  stats.checkoutPctMid = checkoutMidAttempts > 0 ? (checkoutMidHits / checkoutMidAttempts) * 100 : 0
  stats.checkoutPctHigh = checkoutHighAttempts > 0 ? (checkoutHighHits / checkoutHighAttempts) * 100 : 0

  stats.finishingDoubles = finishingDoubles
  stats.doublesHitCount = doublesHitCount

  // Lieblingsdoppel finden (maxFinishes = -1 damit erster Eintrag gezählt wird)
  let maxFinishes = -1
  for (const [bed, count] of Object.entries(finishingDoubles)) {
    if (count > maxFinishes) {
      maxFinishes = count
      // "D20" -> "20", "DBULL" -> "Bull"
      stats.favouriteDouble = bed.replace('D', '').replace('BULL', 'Bull')
    }
  }

  return stats
}

// ============================================================
// CRICKET EXTENDED STATISTIKEN
// ============================================================

/**
 * Berechnet Cricket-Stats aus allen Matches für einen Spieler
 */
export function computeCricketExtendedStats(
  cricketMatches: CricketStoredMatch[],
  playerId: string
): CricketExtendedStats {
  const stats: CricketExtendedStats = {
    totalMarks: 0,
    avgMarksPerTurn: 0,
    avgMarksPerDart: 0,
    bestTurnMarks: 0,
    totalPoints: 0,
    avgPointsPerTurn: 0,
    bestTurnPoints: 0,
    totalTriples: 0,
    totalDoubles: 0,
    totalBullSingles: 0,
    totalBullDoubles: 0,
    bullAccuracy: 0,
    fieldMarks: {},
    strongestField: undefined,
    weakestField: undefined,
    noScoreTurns: 0,
    noScoreRate: 0,
    totalTurns: 0,
    wasteDarts: 0,
    wasteDartRate: 0,
    matchesPlayed: 0,
    matchesWon: 0,
    legsWon: 0,
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

  for (const m of cricketMatches) {
    if (!m.finished) continue
    if (!m.playerIds.includes(playerId)) continue

    stats.matchesPlayed++

    const finishEvt = m.events.find(e => e.type === 'CricketMatchFinished') as CricketMatchFinished | undefined
    if (finishEvt?.winnerPlayerId === playerId) stats.matchesWon++

    // Berechne Stats für dieses Match
    const startEvt = m.events.find(e => e.type === 'CricketMatchStarted') as CricketMatchStarted | undefined
    if (!startEvt) continue

    const matchStats = computeCricketStats({
      id: m.id,
      range: startEvt.range,
      style: startEvt.style,
      targetWins: startEvt.targetWins ?? 1,
      players: startEvt.players.map(p => ({ id: p.playerId, name: p.name ?? p.playerId })),
      events: m.events,
    })

    const playerStats = matchStats.players.find(p => p.playerId === playerId)
    if (!playerStats) continue

    stats.legsWon += playerStats.legsWon ?? 0
    stats.totalMarks += playerStats.totalMarks ?? 0
    stats.totalTriples += playerStats.triplesHit ?? 0
    stats.totalDoubles += playerStats.doublesHit ?? 0
    stats.totalBullSingles += playerStats.bullHitsSingle ?? 0
    stats.totalBullDoubles += playerStats.bullHitsDouble ?? 0
    stats.bestTurnMarks = Math.max(stats.bestTurnMarks, playerStats.bestTurnMarks ?? 0)
    stats.bestTurnPoints = Math.max(stats.bestTurnPoints, playerStats.bestTurnPoints ?? 0)
    stats.noScoreTurns += playerStats.turnsWithNoScore ?? 0

    // Turns zählen aus Events
    const turns = m.events.filter(e => e.type === 'CricketTurnAdded' && (e as CricketTurnAdded).playerId === playerId) as CricketTurnAdded[]
    stats.totalTurns += turns.length

    // Punkte aggregieren und Triple-Analyse
    for (const turn of turns) {
      let turnPoints = 0
      for (const d of turn.darts) {
        if (d.target === 'BULL') {
          totalBullAttempts++
          if (d.mult >= 1) totalBullHits++
        }
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

    // Feld-Marks
    if (playerStats.fieldMarks) {
      for (const [field, marks] of Object.entries(playerStats.fieldMarks)) {
        stats.fieldMarks[field] = (stats.fieldMarks[field] ?? 0) + marks
      }
    }
  }

  // Durchschnitte berechnen
  const totalDarts = stats.totalTurns * 3 // Annahme: 3 Darts pro Turn
  stats.avgMarksPerTurn = stats.totalTurns > 0 ? stats.totalMarks / stats.totalTurns : 0
  stats.avgMarksPerDart = totalDarts > 0 ? stats.totalMarks / totalDarts : 0
  stats.avgPointsPerTurn = stats.totalTurns > 0 ? stats.totalPoints / stats.totalTurns : 0
  stats.noScoreRate = stats.totalTurns > 0 ? (stats.noScoreTurns / stats.totalTurns) * 100 : 0
  stats.bullAccuracy = totalBullAttempts > 0 ? (totalBullHits / totalBullAttempts) * 100 : 0

  // Stärkstes/Schwächstes Feld
  let maxMarks = 0, minMarks = Infinity
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

// ============================================================
// SPEZIELLE STATISTIKEN
// ============================================================

/**
 * Berechnet spezielle/übergreifende Statistiken
 */
export function computeSpecialStats(
  playerId: string,
  x01Matches: StoredMatch[],
  cricketMatches: CricketStoredMatch[],
  x01LongTerm: X01PlayerLongTermStats | undefined
): SpecialStats {
  const stats: SpecialStats = {
    tripleHitRate: 0,
    doubleHitRate: 0,
    segmentsHitCount: x01LongTerm?.segmentsHitCount ?? {},
    triplesHitCount: x01LongTerm?.triplesHitCount ?? {},
    afterFirstTriple: {
      totalVisits: 0,
      followedByWaste: 0,
      followedByTriple: 0,
      wasteRate: 0,
      tripleRate: 0,
    },
    longestTripleStreak: 0,
    dart1Avg: 0,
    dart2Avg: 0,
    dart3Avg: 0,
    last5Matches: [],
    averageTrend: 'stable',
    averageVariance: 0,
    matchDartCheckoutRate: 0,
    matchDartAttempts: 0,
    matchDartHits: 0,
    performanceWhenBehind: 0,
    performanceWhenAhead: 0,
  }

  // Dart-Position Stats aus X01
  let dart1Total = 0, dart1Count = 0
  let dart2Total = 0, dart2Count = 0
  let dart3Total = 0, dart3Count = 0
  let totalTripleAttempts = 0, totalTripleHits = 0
  let totalDoubleAttempts = 0, totalDoubleHits = 0

  // Matchdart Stats
  let matchDartAttempts = 0, matchDartHits = 0

  // Performance bei Rückstand/Führung
  let behindPoints = 0, behindDarts = 0
  let aheadPoints = 0, aheadDarts = 0

  // Triple-Folge Stats
  let firstTripleVisits = 0
  let firstTripleFollowedByWaste = 0
  let firstTripleFollowedByTriple = 0

  // Triple-Streak Stats (längste Serie von Aufnahmen mit mind. 1 Triple 15-20)
  let longestTripleStreak = 0
  let currentTripleStreak = 0

  // Averages für Trend-Analyse
  const matchAverages: number[] = []

  // Letzte 5 Matches sammeln
  const allMatches: { date: string; type: 'x01' | 'cricket'; won: boolean; avg?: number }[] = []

  for (const m of x01Matches) {
    if (!m.finished) continue
    if (!m.playerIds.includes(playerId)) continue

    const finishEvt = m.events.find(e => e.type === 'MatchFinished') as MatchFinished | undefined
    const startEvt = m.events.find(e => e.type === 'MatchStarted') as MatchStarted | undefined
    const won = finishEvt?.winnerPlayerId === playerId

    // Match Average berechnen
    const playerStats = computeStats(m.events)[playerId]
    const avg = playerStats?.threeDartAvg ?? 0
    matchAverages.push(avg)

    allMatches.push({
      date: m.createdAt,
      type: 'x01',
      won: won ?? false,
      avg,
    })

    // Leg-Stand tracken für Rückstand/Führung
    const bestOfLegs = startEvt?.structure?.kind === 'legs' ? (startEvt.structure.bestOfLegs ?? 1) : 1
    const legsToWin = Math.ceil(bestOfLegs / 2)
    const legWins: Record<string, number> = {}
    for (const pid of m.playerIds) legWins[pid] = 0

    // Events chronologisch durchgehen
    for (const evt of m.events) {
      if (evt.type === 'LegFinished') {
        const legEvt = evt as LegFinished
        if (legEvt.winnerPlayerId) {
          legWins[legEvt.winnerPlayerId] = (legWins[legEvt.winnerPlayerId] ?? 0) + 1
        }
      }

      if (evt.type === 'VisitAdded') {
        const v = evt as VisitAdded
        if (v.playerId !== playerId) continue

        // Aktueller Leg-Stand: Bin ich in Führung oder Rückstand?
        const myLegs = legWins[playerId] ?? 0
        const opponentLegs = Math.max(...Object.entries(legWins)
          .filter(([pid]) => pid !== playerId)
          .map(([, legs]) => legs))

        // Performance bei Rückstand/Führung
        if (myLegs < opponentLegs) {
          // Rückstand
          behindPoints += v.visitScore
          behindDarts += v.darts.length
        } else if (myLegs > opponentLegs) {
          // Führung
          aheadPoints += v.visitScore
          aheadDarts += v.darts.length
        }

        // Matchdart-Analyse: Kann ich mit diesem Checkout das Match gewinnen?
        const needOneMoreLeg = myLegs === legsToWin - 1
        if (needOneMoreLeg && v.remainingBefore <= 170 && isCheckable(v.remainingBefore)) {
          matchDartAttempts++
          // Hat er gecheckt?
          if (v.remainingAfter === 0 && !v.bust) {
            matchDartHits++
          }
        }
      }
    }

    // Jetzt die detaillierte Visit-Analyse für Triple-Quote etc.
    const visits = m.events.filter(e => e.type === 'VisitAdded' && (e as VisitAdded).playerId === playerId) as VisitAdded[]

    for (const v of visits) {
      for (const d of v.darts) {
        // Triple-Versuche (auf 20, 19, 18 etc.)
        if (d.bed !== 'BULL' && d.bed !== 'DBULL' && d.bed !== 'MISS') {
          // Annahme: Wurf auf Triple-Bereich wenn auf 20, 19, 18, 17, 16
          const target = typeof d.bed === 'number' ? d.bed : parseInt(d.bed as string, 10)
          if ([20, 19, 18, 17, 16].includes(target)) {
            totalTripleAttempts++
            if (d.mult === 3) totalTripleHits++
          }
        }

        // Double-Versuche im Checkout-Bereich
        if (v.remainingBefore <= 40 && v.remainingBefore >= 2) {
          totalDoubleAttempts++
          if (d.mult === 2) totalDoubleHits++
        }

        // Dart-Position
        if (d.seq === 1) { dart1Total += d.score; dart1Count++ }
        if (d.seq === 2) { dart2Total += d.score; dart2Count++ }
        if (d.seq === 3) { dart3Total += d.score; dart3Count++ }
      }

      // Triple-Folge-Analyse: Wenn Dart 1 ein Triple auf 15-20 war
      const dart1 = v.darts.find(d => d.seq === 1)
      const dart1Bed = dart1?.bed
      const isHighTriple = dart1 && dart1.mult === 3 &&
        typeof dart1Bed === 'number' && dart1Bed >= 15 && dart1Bed <= 20

      if (isHighTriple) {
        firstTripleVisits++

        // Prüfe Dart 2 und 3
        const followingDarts = v.darts.filter(d => d.seq === 2 || d.seq === 3)
        let hasWaste = false
        let hasTriple = false

        // Analysiere jeden folgenden Dart
        let currentRest = v.remainingBefore - dart1!.score
        for (const fd of followingDarts) {
          const newRest = currentRest - fd.score

          // Waste-Dart-Kriterien
          if (currentRest <= 170 && currentRest >= 2) {
            // Im Checkout-Bereich: Bogey-Zahl oder Checkout verschlechtert
            const dartsBefore = isCheckable(currentRest) ? dartsNeeded(currentRest) : null
            const dartsAfter = newRest > 0 ? dartsNeeded(newRest) : 0

            if (newRest > 0 && BOGEY_NUMBERS.has(newRest)) {
              hasWaste = true
            } else if (dartsBefore !== null && dartsAfter !== null && dartsAfter > dartsBefore) {
              hasWaste = true
            }
          } else if (currentRest > 170) {
            // Außerhalb Checkout-Bereich: Score 1-14 ist Waste
            if (fd.score >= 1 && fd.score <= 14) {
              hasWaste = true
            }
          }

          // Weiteres Triple auf 15-20
          const fdBed = fd.bed
          if (fd.mult === 3 && typeof fdBed === 'number' && fdBed >= 15 && fdBed <= 20) {
            hasTriple = true
          }

          currentRest = newRest
        }

        if (hasWaste) firstTripleFollowedByWaste++
        if (hasTriple) firstTripleFollowedByTriple++
      }

      // Triple-Streak: Hat diese Aufnahme mindestens ein Triple auf 15-20?
      const hasAnyHighTriple = v.darts.some(d => {
        const bed = d.bed
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

      // Matchdart-Analyse (wenn Match gewonnen werden kann)
      // Vereinfachung: Wenn rest <= 170 und letztes Leg
      // TODO: Komplexere Logik für echte Matchdarts
    }
  }

  // Cricket Matches für letzte 5
  for (const m of cricketMatches) {
    if (!m.finished) continue
    if (!m.playerIds.includes(playerId)) continue

    const finishEvt = m.events.find(e => e.type === 'CricketMatchFinished') as CricketMatchFinished | undefined
    const won = finishEvt?.winnerPlayerId === playerId

    allMatches.push({
      date: m.createdAt,
      type: 'cricket',
      won: won ?? false,
    })
  }

  // Letzte 5 Matches sortieren
  allMatches.sort((a, b) => b.date.localeCompare(a.date))
  stats.last5Matches = allMatches.slice(0, 5).map(m => ({
    won: m.won,
    type: m.type,
    avg: m.avg,
  }))

  // Trend berechnen
  if (matchAverages.length >= 5) {
    const recent5 = matchAverages.slice(-5)
    const older5 = matchAverages.slice(-10, -5)

    if (older5.length >= 3) {
      const recentAvg = recent5.reduce((a, b) => a + b, 0) / recent5.length
      const olderAvg = older5.reduce((a, b) => a + b, 0) / older5.length

      if (recentAvg > olderAvg * 1.05) stats.averageTrend = 'rising'
      else if (recentAvg < olderAvg * 0.95) stats.averageTrend = 'falling'
      else stats.averageTrend = 'stable'
    }
  }

  // Varianz berechnen
  if (matchAverages.length >= 2) {
    const mean = matchAverages.reduce((a, b) => a + b, 0) / matchAverages.length
    const squaredDiffs = matchAverages.map(v => Math.pow(v - mean, 2))
    stats.averageVariance = Math.sqrt(squaredDiffs.reduce((a, b) => a + b, 0) / matchAverages.length)
  }

  // Stats berechnen
  stats.dart1Avg = dart1Count > 0 ? dart1Total / dart1Count : 0
  stats.dart2Avg = dart2Count > 0 ? dart2Total / dart2Count : 0
  stats.dart3Avg = dart3Count > 0 ? dart3Total / dart3Count : 0
  stats.tripleHitRate = totalTripleAttempts > 0 ? (totalTripleHits / totalTripleAttempts) * 100 : 0
  stats.doubleHitRate = totalDoubleAttempts > 0 ? (totalDoubleHits / totalDoubleAttempts) * 100 : 0

  // Triple-Folge Stats
  stats.afterFirstTriple = {
    totalVisits: firstTripleVisits,
    followedByWaste: firstTripleFollowedByWaste,
    followedByTriple: firstTripleFollowedByTriple,
    wasteRate: firstTripleVisits > 0 ? (firstTripleFollowedByWaste / firstTripleVisits) * 100 : 0,
    tripleRate: firstTripleVisits > 0 ? (firstTripleFollowedByTriple / firstTripleVisits) * 100 : 0,
  }

  stats.longestTripleStreak = longestTripleStreak

  stats.matchDartAttempts = matchDartAttempts
  stats.matchDartHits = matchDartHits
  stats.matchDartCheckoutRate = matchDartAttempts > 0 ? (matchDartHits / matchDartAttempts) * 100 : 0
  stats.performanceWhenBehind = behindDarts > 0 ? (behindPoints / behindDarts) * 3 : 0
  stats.performanceWhenAhead = aheadDarts > 0 ? (aheadPoints / aheadDarts) * 3 : 0

  return stats
}

// ============================================================
// WASTE DARTS BERECHNUNG
// ============================================================

// Bogey-Zahlen: Reste die nicht mit 3 Darts checkbar sind
const BOGEY_NUMBERS = new Set([159, 162, 163, 165, 166, 168, 169])

/**
 * Prüft ob ein Rest checkbar ist
 */
function isCheckable(remaining: number): boolean {
  if (remaining < 2 || remaining > 170) return false
  return CHECKOUT_TABLE[remaining] !== undefined
}

/**
 * Gibt die Anzahl benötigter Darts für einen Checkout zurück
 */
function dartsNeeded(remaining: number): number | null {
  const entry = CHECKOUT_TABLE[remaining]
  if (!entry) return null
  return entry.darts
}

/**
 * Berechnet X01 Waste Darts für einen Spieler
 *
 * Waste-Dart-Kriterien:
 * 1. Bust: Wurf der zum Bust führt wenn Rest checkbar war
 * 2. Bogey-Zahlen: Wurf der zu uncheckbarem Rest führt (159, 162, 163, 165, 166, 168, 169)
 * 3. Schlechteres Setup: Wurf erhöht die benötigten Darts für den Checkout
 */
export function computeX01WasteDarts(
  x01Matches: StoredMatch[],
  playerId: string
): { count: number; rate: number } {
  let wasteDarts = 0
  let totalDarts = 0

  for (const m of x01Matches) {
    if (!m.finished) continue
    if (!m.playerIds.includes(playerId)) continue

    const visits = m.events.filter(
      e => e.type === 'VisitAdded' && (e as VisitAdded).playerId === playerId
    ) as VisitAdded[]

    for (const v of visits) {
      const dartsInVisit = v.darts.length
      totalDarts += dartsInVisit

      // Bust im Checkout-Bereich = Waste
      if (v.bust && v.remainingBefore <= 170 && isCheckable(v.remainingBefore)) {
        // Alle Darts in dieser Aufnahme sind Waste
        wasteDarts += dartsInVisit
        continue
      }

      // Analysiere jeden Dart einzeln
      let currentRest = v.remainingBefore
      for (const d of v.darts) {
        const newRest = currentRest - d.score

        // Nur im Checkout-Bereich analysieren
        if (currentRest <= 170) {
          const dartsBefore = dartsNeeded(currentRest)
          const dartsAfter = newRest > 0 ? dartsNeeded(newRest) : 0

          // Zu Bogey-Zahl geworfen
          if (newRest > 0 && BOGEY_NUMBERS.has(newRest)) {
            wasteDarts++
          }
          // Checkout verschlechtert (mehr Darts nötig als vorher)
          else if (dartsBefore !== null && dartsAfter !== null && dartsAfter > dartsBefore) {
            wasteDarts++
          }
        }

        currentRest = newRest
      }
    }
  }

  return {
    count: wasteDarts,
    rate: totalDarts > 0 ? (wasteDarts / totalDarts) * 100 : 0,
  }
}

/**
 * Berechnet Cricket Waste Darts für einen Spieler
 *
 * Waste-Dart-Kriterien:
 * 1. Miss: Jeder Miss ist ein Waste
 * 2. Treffer auf geschlossene Felder ohne Scoring-Möglichkeit (beide haben zu)
 */
export function computeCricketWasteDarts(
  cricketMatches: CricketStoredMatch[],
  playerId: string
): { count: number; rate: number } {
  let wasteDarts = 0
  let totalDarts = 0

  for (const m of cricketMatches) {
    if (!m.finished) continue
    if (!m.playerIds.includes(playerId)) continue

    const startEvt = m.events.find(e => e.type === 'CricketMatchStarted') as CricketMatchStarted | undefined
    if (!startEvt) continue

    const turns = m.events.filter(
      e => e.type === 'CricketTurnAdded' && (e as CricketTurnAdded).playerId === playerId
    ) as CricketTurnAdded[]

    for (const turn of turns) {
      for (const d of turn.darts) {
        totalDarts++

        // Miss ist immer Waste
        if (d.target === 'MISS') {
          wasteDarts++
        }
      }
    }
  }

  return {
    count: wasteDarts,
    rate: totalDarts > 0 ? (wasteDarts / totalDarts) * 100 : 0,
  }
}

// ============================================================
// CRICKET LANGZEIT-STATS MANAGEMENT
// ============================================================

// In-Memory Cache für Cricket Langzeit-Stats (wird beim App-Start aus SQLite befüllt)
let cricketPlayerStatsCache: Record<string, CricketPlayerLongTermStats> = {}

export function loadCricketPlayerStatsStore(): Record<string, CricketPlayerLongTermStats> {
  return cricketPlayerStatsCache
}

export function saveCricketPlayerStatsStore(store: Record<string, CricketPlayerLongTermStats>) {
  cricketPlayerStatsCache = store
}

export function warmCricketPlayerStatsCache(data: Record<string, CricketPlayerLongTermStats>) {
  cricketPlayerStatsCache = data
}

export function getGlobalCricketPlayerStats(): Record<string, CricketPlayerLongTermStats> {
  return loadCricketPlayerStatsStore()
}

/**
 * Update Cricket Langzeit-Stats nach Match-Ende
 */
export function updateGlobalCricketPlayerStatsFromMatch(matchId: string, events: CricketEvent[]) {
  try {
    const startEvt = events.find(e => e.type === 'CricketMatchStarted') as CricketMatchStarted | undefined
    const finishEvt = events.find(e => e.type === 'CricketMatchFinished') as CricketMatchFinished | undefined

    if (!startEvt || !finishEvt) return

    const store = loadCricketPlayerStatsStore()

    for (const player of startEvt.players) {
      if (player.isGuest) continue

      const pid = player.playerId
      const prev = store[pid]

      // Berechne Stats für dieses Match
      const matchStats = computeCricketStats({
        id: matchId,
        range: startEvt.range,
        style: startEvt.style,
        targetWins: startEvt.targetWins ?? 1,
        players: startEvt.players.map(p => ({ id: p.playerId, name: p.name ?? p.playerId })),
        events,
      })

      const playerStats = matchStats.players.find(p => p.playerId === pid)
      if (!playerStats) continue

      // Turns zählen aus Events (computeCricketStats gibt turns nicht zurück)
      const playerTurns = events.filter(
        e => e.type === 'CricketTurnAdded' && (e as CricketTurnAdded).playerId === pid
      ) as CricketTurnAdded[]
      const turnCount = playerTurns.length

      // Merge in Langzeit-Stats
      const merged: CricketPlayerLongTermStats = {
        playerId: pid,
        playerName: player.name,
        matchesPlayed: (prev?.matchesPlayed ?? 0) + 1,
        matchesWon: (prev?.matchesWon ?? 0) + (finishEvt.winnerPlayerId === pid ? 1 : 0),
        legsWon: (prev?.legsWon ?? 0) + (playerStats.legsWon ?? 0),
        totalMarks: (prev?.totalMarks ?? 0) + (playerStats.totalMarks ?? 0),
        totalTurns: (prev?.totalTurns ?? 0) + turnCount,
        totalDarts: (prev?.totalDarts ?? 0) + turnCount * 3,
        totalTriples: (prev?.totalTriples ?? 0) + (playerStats.triplesHit ?? 0),
        totalDoubles: (prev?.totalDoubles ?? 0) + (playerStats.doublesHit ?? 0),
        totalBullSingles: (prev?.totalBullSingles ?? 0) + (playerStats.bullHitsSingle ?? 0),
        totalBullDoubles: (prev?.totalBullDoubles ?? 0) + (playerStats.bullHitsDouble ?? 0),
        totalBullAttempts: (prev?.totalBullAttempts ?? 0) + (playerStats.bullAttempts ?? 0),
        fieldMarks: { ...(prev?.fieldMarks ?? {}) },
        noScoreTurns: (prev?.noScoreTurns ?? 0) + (playerStats.turnsWithNoScore ?? 0),
        bestTurnMarks: Math.max(prev?.bestTurnMarks ?? 0, playerStats.bestTurnMarks ?? 0),
        bestTurnPoints: Math.max(prev?.bestTurnPoints ?? 0, playerStats.bestTurnPoints ?? 0),
        totalPointsScored: (prev?.totalPointsScored ?? 0) + (playerStats.totalPointsGiven ?? 0),
        totalPointsTaken: (prev?.totalPointsTaken ?? 0) + (playerStats.totalPointsTaken ?? 0),
        updatedAt: new Date().toISOString(),
      }

      store[pid] = merged
    }

    saveCricketPlayerStatsStore(store)

    // Dual-Write: SQLite (fire-and-forget)
    for (const player of startEvt.players) {
      if (player.isGuest) continue
      const s = store[player.playerId]
      if (s) {
        dbSaveCricketPlayerStats(s).catch(e =>
          console.error('[KRITISCH] DB-Fehler (cricket_player_stats):', player.playerId, e)
        )
      }
    }
  } catch (err) {
    console.error('updateGlobalCricketPlayerStatsFromMatch failed:', err)
  }
}
