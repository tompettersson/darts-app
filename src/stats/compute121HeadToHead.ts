// src/stats/compute121HeadToHead.ts
// Head-to-Head Vergleich für 121-Spiele zwischen zwei Spielern

import type { DartsEvent, MatchStarted, LegFinished, MatchFinished } from '../darts501'
import type { Stats121HeadToHead, Stats121H2HPlayer, Stats121Leg } from '../types/stats121'
import { compute121LegStats } from './compute121LegStats'

/**
 * Berechnet 121-spezifischen Head-to-Head Vergleich zwischen zwei Spielern.
 * @param player1Id ID des ersten Spielers
 * @param player2Id ID des zweiten Spielers
 * @param matches Array von 121-Matches (Events-Arrays)
 * @param playerNames Namen der Spieler (optional)
 * @returns Stats121HeadToHead oder null wenn keine gemeinsamen Matches
 */
export function compute121HeadToHead(
  player1Id: string,
  player2Id: string,
  matches: { matchId: string; events: DartsEvent[] }[],
  playerNames?: { player1Name?: string; player2Name?: string }
): Stats121HeadToHead | null {
  // Filtere Matches, in denen beide Spieler teilnehmen
  const sharedMatches = matches.filter(m => {
    const matchStart = m.events.find(e => e.type === 'MatchStarted') as MatchStarted | undefined
    if (!matchStart) return false
    if (matchStart.startingScorePerLeg !== 121) return false

    const playerIds = matchStart.players.map(p => p.playerId)
    return playerIds.includes(player1Id) && playerIds.includes(player2Id)
  })

  if (sharedMatches.length === 0) return null

  // Statistiken sammeln
  let legsPlayed = 0
  let player1Wins = 0
  let player2Wins = 0

  const player1LegStats: Stats121Leg[] = []
  const player2LegStats: Stats121Leg[] = []

  for (const match of sharedMatches) {
    const matchStart = match.events.find(e => e.type === 'MatchStarted') as MatchStarted
    const matchFinish = match.events.find(e => e.type === 'MatchFinished') as MatchFinished | undefined
    const legFinishes = match.events.filter(e => e.type === 'LegFinished') as LegFinished[]

    // Match-Sieger zählen
    if (matchFinish) {
      if (matchFinish.winnerPlayerId === player1Id) player1Wins++
      else if (matchFinish.winnerPlayerId === player2Id) player2Wins++
    }

    // Leg-Stats sammeln
    for (const legFinish of legFinishes) {
      legsPlayed++

      const p1Stats = compute121LegStats(match.events, legFinish.legId, player1Id)
      const p2Stats = compute121LegStats(match.events, legFinish.legId, player2Id)

      if (p1Stats) player1LegStats.push(p1Stats)
      if (p2Stats) player2LegStats.push(p2Stats)
    }
  }

  // Aggregierte Stats berechnen
  const computeH2HStats = (legStats: Stats121Leg[]): Stats121H2HPlayer => {
    const wonLegs = legStats.filter(s => s.checkoutSuccess).length
    const finishedLegs = legStats.filter(s => s.dartsToFinish !== null)

    const avgDartsToFinish = finishedLegs.length > 0
      ? finishedLegs.reduce((sum, s) => sum + (s.dartsToFinish ?? 0), 0) / finishedLegs.length
      : 0

    const totalDoublesAttempted = legStats.reduce((sum, s) => sum + s.dartsOnDouble, 0)
    const totalDoublesHit = legStats.filter(s => s.checkoutSuccess).length
    const checkoutPct = totalDoublesAttempted > 0
      ? (totalDoublesHit / totalDoublesAttempted) * 100
      : 0

    const avgDartsOnDouble = totalDoublesHit > 0
      ? totalDoublesAttempted / totalDoublesHit
      : 0

    const bestFinish = finishedLegs.length > 0
      ? Math.min(...finishedLegs.map(s => s.dartsToFinish ?? Infinity))
      : 0

    // Skill-Score berechnen (vereinfacht)
    const skillScore = Math.round(
      checkoutPct * 0.4 +
      Math.max(0, (1 - (avgDartsToFinish - 3) / 18) * 100) * 0.25 +
      Math.max(0, (1 - (avgDartsOnDouble - 1) / 9) * 100) * 0.20 +
      (wonLegs / Math.max(1, legStats.length)) * 100 * 0.15
    )

    return {
      avgDartsToFinish,
      checkoutPct,
      avgDartsOnDouble,
      bestFinish,
      skillScore,
      legsWon: wonLegs,
    }
  }

  // Namen ermitteln
  let player1Name = playerNames?.player1Name ?? player1Id
  let player2Name = playerNames?.player2Name ?? player2Id

  // Versuche Namen aus den Matches zu extrahieren
  if (sharedMatches.length > 0) {
    const firstMatch = sharedMatches[0]
    const matchStart = firstMatch.events.find(e => e.type === 'MatchStarted') as MatchStarted
    const p1 = matchStart.players.find(p => p.playerId === player1Id)
    const p2 = matchStart.players.find(p => p.playerId === player2Id)
    if (p1?.name) player1Name = p1.name
    if (p2?.name) player2Name = p2.name
  }

  return {
    player1Id,
    player2Id,
    player1Name,
    player2Name,
    legsPlayed,
    player1Wins,
    player2Wins,
    player1Stats: computeH2HStats(player1LegStats),
    player2Stats: computeH2HStats(player2LegStats),
  }
}

/**
 * Berechnet 121 Head-to-Head für alle Spieler-Paare.
 * @param playerId Der Hauptspieler
 * @param matches Alle 121-Matches
 * @returns Array von H2H-Stats gegen verschiedene Gegner
 */
export function compute121AllOpponentsH2H(
  playerId: string,
  matches: { matchId: string; events: DartsEvent[] }[]
): Stats121HeadToHead[] {
  // Alle Gegner finden
  const opponents = new Set<string>()

  for (const match of matches) {
    const matchStart = match.events.find(e => e.type === 'MatchStarted') as MatchStarted | undefined
    if (!matchStart || matchStart.startingScorePerLeg !== 121) continue

    const playerIds = matchStart.players.map(p => p.playerId)
    if (!playerIds.includes(playerId)) continue

    for (const pid of playerIds) {
      if (pid !== playerId) opponents.add(pid)
    }
  }

  // H2H für jeden Gegner berechnen
  const results: Stats121HeadToHead[] = []

  for (const opponentId of opponents) {
    const h2h = compute121HeadToHead(playerId, opponentId, matches)
    if (h2h) results.push(h2h)
  }

  // Sortieren nach Anzahl Legs gespielt
  results.sort((a, b) => b.legsPlayed - a.legsPlayed)

  return results
}
