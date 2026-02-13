// src/stats/computeHighscoreStats.ts
// Statistik-Berechnung für Highscore Trainingsspiel

import type {
  HighscoreStoredMatch,
  HighscoreEvent,
  HighscoreTurnAddedEvent,
  HighscorePlayerStats,
  HighscoreDart,
} from '../types/highscore'

/**
 * Berechnet Match-Statistiken für alle Spieler
 */
export function computeHighscoreMatchStats(
  match: HighscoreStoredMatch
): HighscorePlayerStats[] {
  const { players, targetScore, events } = match

  // Sammle alle Turns pro Spieler
  const turnsByPlayer = new Map<string, HighscoreTurnAddedEvent[]>()
  players.forEach(p => turnsByPlayer.set(p.id, []))

  for (const ev of events) {
    if (ev.type === 'HighscoreTurnAdded') {
      const turns = turnsByPlayer.get(ev.playerId)
      if (turns) turns.push(ev)
    }
  }

  // Berechne Stats für jeden Spieler
  const stats: HighscorePlayerStats[] = []

  for (const player of players) {
    const turns = turnsByPlayer.get(player.id) ?? []

    if (turns.length === 0) {
      stats.push({
        playerId: player.id,
        playerName: player.name,
        finalScore: 0,
        placement: 0,
        dartsThrown: 0,
        turnsPlayed: 0,
        avgPointsPerDart: 0,
        avgPointsPerTurn: 0,
        bestTurn: 0,
        highestDart: null,
        speedRating: 0,
        normalized999Darts: undefined,
      })
      continue
    }

    // Zähle Darts und Punkte
    let totalDarts = 0
    let totalScore = 0
    let bestTurn = 0
    let highestDart: HighscoreDart | null = null
    let highestDartValue = 0

    for (const turn of turns) {
      totalDarts += turn.darts.length
      totalScore += turn.turnScore
      if (turn.turnScore > bestTurn) bestTurn = turn.turnScore

      for (const dart of turn.darts) {
        if (dart.value > highestDartValue) {
          highestDartValue = dart.value
          highestDart = dart
        }
      }
    }

    // Letzter Score = finalScore
    const finalScore = turns[turns.length - 1]?.runningScore ?? 0

    // Averages
    const avgPointsPerDart = totalDarts > 0 ? totalScore / totalDarts : 0
    const avgPointsPerTurn = turns.length > 0 ? totalScore / turns.length : 0

    // Speed Rating (nur für Gewinner sinnvoll)
    const isWinner = player.id === match.winnerId
    const speedRating = isWinner && totalDarts > 0 ? targetScore / totalDarts : avgPointsPerDart

    // 999-Equivalent Darts (nur für Gewinner)
    const normalized999Darts = isWinner && totalDarts > 0
      ? totalDarts * (999 / targetScore)
      : undefined

    stats.push({
      playerId: player.id,
      playerName: player.name,
      finalScore,
      placement: 0, // wird später gesetzt
      dartsThrown: totalDarts,
      turnsPlayed: turns.length,
      avgPointsPerDart,
      avgPointsPerTurn,
      bestTurn,
      highestDart,
      speedRating,
      normalized999Darts,
    })
  }

  // Platzierung berechnen (nach Score sortiert)
  const sorted = [...stats].sort((a, b) => b.finalScore - a.finalScore)
  sorted.forEach((s, idx) => {
    const original = stats.find(x => x.playerId === s.playerId)
    if (original) original.placement = idx + 1
  })

  return stats
}

/**
 * Berechnet Leg-spezifische Statistiken
 */
export function computeHighscoreLegStats(
  events: HighscoreEvent[],
  legIndex: number,
  players: Array<{ id: string; name: string }>,
  targetScore: number
): HighscorePlayerStats[] {
  // Finde Events für dieses Leg
  let legStarted = false
  let legFinished = false
  const legTurns = new Map<string, HighscoreTurnAddedEvent[]>()
  players.forEach(p => legTurns.set(p.id, []))

  let currentLegIndex = -1

  for (const ev of events) {
    if (ev.type === 'HighscoreLegStarted') {
      currentLegIndex = ev.legIndex
      if (ev.legIndex === legIndex) {
        legStarted = true
      } else if (legStarted) {
        break // nächstes Leg begonnen
      }
    }

    if (ev.type === 'HighscoreTurnAdded' && currentLegIndex === legIndex) {
      const turns = legTurns.get(ev.playerId)
      if (turns) turns.push(ev)
    }

    if (ev.type === 'HighscoreLegFinished' && currentLegIndex === legIndex) {
      legFinished = true
    }
  }

  // Berechne Stats für jeden Spieler (ähnlich wie Match-Stats)
  const stats: HighscorePlayerStats[] = []

  for (const player of players) {
    const turns = legTurns.get(player.id) ?? []

    if (turns.length === 0) {
      stats.push({
        playerId: player.id,
        playerName: player.name,
        finalScore: 0,
        placement: 0,
        dartsThrown: 0,
        turnsPlayed: 0,
        avgPointsPerDart: 0,
        avgPointsPerTurn: 0,
        bestTurn: 0,
        highestDart: null,
        speedRating: 0,
      })
      continue
    }

    let totalDarts = 0
    let totalScore = 0
    let bestTurn = 0
    let highestDart: HighscoreDart | null = null
    let highestDartValue = 0

    for (const turn of turns) {
      totalDarts += turn.darts.length
      totalScore += turn.turnScore
      if (turn.turnScore > bestTurn) bestTurn = turn.turnScore

      for (const dart of turn.darts) {
        if (dart.value > highestDartValue) {
          highestDartValue = dart.value
          highestDart = dart
        }
      }
    }

    const finalScore = turns[turns.length - 1]?.runningScore ?? 0
    const avgPointsPerDart = totalDarts > 0 ? totalScore / totalDarts : 0
    const avgPointsPerTurn = turns.length > 0 ? totalScore / turns.length : 0

    // Speed Rating
    const isWinner = finalScore >= targetScore
    const speedRating = isWinner && totalDarts > 0 ? targetScore / totalDarts : avgPointsPerDart

    stats.push({
      playerId: player.id,
      playerName: player.name,
      finalScore,
      placement: 0,
      dartsThrown: totalDarts,
      turnsPlayed: turns.length,
      avgPointsPerDart,
      avgPointsPerTurn,
      bestTurn,
      highestDart,
      speedRating,
    })
  }

  // Platzierung
  const sorted = [...stats].sort((a, b) => b.finalScore - a.finalScore)
  sorted.forEach((s, idx) => {
    const original = stats.find(x => x.playerId === s.playerId)
    if (original) original.placement = idx + 1
  })

  return stats
}

/**
 * Aggregiert Highscore-Statistiken über mehrere Matches
 */
export type HighscoreAggregateStats = {
  playerId: string
  playerName: string
  matchesPlayed: number
  matchesWon: number
  winRate: number
  totalDartsThrown: number
  totalPointsScored: number
  avgPointsPerDart: number
  avgPointsPerTurn: number
  bestTurn: number
  fastestWin: { matchId: string; darts: number; targetScore: number } | null
  avgDartsToWin: number
}

export function aggregateHighscoreStats(
  matches: HighscoreStoredMatch[],
  playerId: string,
  playerName: string
): HighscoreAggregateStats {
  let matchesPlayed = 0
  let matchesWon = 0
  let totalDarts = 0
  let totalPoints = 0
  let totalTurns = 0
  let bestTurn = 0
  let fastestWin: HighscoreAggregateStats['fastestWin'] = null
  let totalDartsInWins = 0

  for (const match of matches) {
    // Prüfe ob Spieler teilgenommen hat
    const participated = match.players.some(p => p.id === playerId)
    if (!participated) continue

    matchesPlayed++

    // Sammle Turns für diesen Spieler
    for (const ev of match.events) {
      if (ev.type === 'HighscoreTurnAdded' && ev.playerId === playerId) {
        totalDarts += ev.darts.length
        totalPoints += ev.turnScore
        totalTurns++
        if (ev.turnScore > bestTurn) bestTurn = ev.turnScore
      }
    }

    // Gewonnen?
    if (match.winnerId === playerId) {
      matchesWon++
      const winnerDarts = match.winnerDarts ?? 0
      totalDartsInWins += winnerDarts

      // Schnellster Sieg?
      if (!fastestWin || winnerDarts < fastestWin.darts) {
        fastestWin = {
          matchId: match.id,
          darts: winnerDarts,
          targetScore: match.targetScore,
        }
      }
    }
  }

  return {
    playerId,
    playerName,
    matchesPlayed,
    matchesWon,
    winRate: matchesPlayed > 0 ? (matchesWon / matchesPlayed) * 100 : 0,
    totalDartsThrown: totalDarts,
    totalPointsScored: totalPoints,
    avgPointsPerDart: totalDarts > 0 ? totalPoints / totalDarts : 0,
    avgPointsPerTurn: totalTurns > 0 ? totalPoints / totalTurns : 0,
    bestTurn,
    fastestWin,
    avgDartsToWin: matchesWon > 0 ? totalDartsInWins / matchesWon : 0,
  }
}
