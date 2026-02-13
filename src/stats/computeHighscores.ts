// src/stats/computeHighscores.ts
// Berechnung aller Highscore-Kategorien für die Hall of Fame

import {
  getFinishedNon121Matches,
  getCricketMatches,
  getATBMatches,
  getGlobalX01PlayerStats,
  getProfiles,
  loadLeaderboards,
  type StoredMatch,
  type CricketStoredMatch,
  type Profile,
} from '../storage'
import type { ATBStoredMatch } from '../types/aroundTheBlock'
import { getGlobalCricketPlayerStats } from './computePlayerStats'
import {
  HIGHSCORE_CATEGORIES,
  type HighscoreCategory,
  type HighscoreEntry,
  type HighscoreCategoryId,
} from '../types/highscores'
import type { DartsEvent } from '../darts501'

// Hilfsfunktion: Ist Spieler ein Gast oder temporär?
function isGuestOrTemp(playerId: string, profiles: Profile[]): boolean {
  if (playerId.startsWith('guest-') || playerId.startsWith('temp-')) return true
  const profile = profiles.find(p => p.id === playerId)
  if (!profile) return true
  if (profile.name.toLowerCase().includes('gast')) return true
  return false
}

// Hilfsfunktion: Spielerinfo holen
function getPlayerInfo(playerId: string, profiles: Profile[]): { name: string; color?: string } {
  const profile = profiles.find(p => p.id === playerId)
  return {
    name: profile?.name ?? 'Unbekannt',
    color: profile?.color,
  }
}

// Hilfsfunktion: X01-Variante aus Events extrahieren
function getX01Variant(events: DartsEvent[]): number | null {
  const startEvent = events.find(e => e.type === 'MatchStarted') as { startingScorePerLeg?: number } | undefined
  return startEvent?.startingScorePerLeg ?? null
}

// Hilfsfunktion: Winner-ID aus X01 Match extrahieren
function getX01Winner(match: StoredMatch): string | null {
  const finishEvent = match.events.find(e => e.type === 'MatchFinished') as { winnerPlayerId?: string } | undefined
  return finishEvent?.winnerPlayerId ?? null
}

// Hilfsfunktion: Winner-ID aus Cricket Match extrahieren
function getCricketWinner(match: CricketStoredMatch): string | null {
  const finishEvent = match.events.find(e => e.type === 'CricketMatchFinished') as { winnerPlayerId?: string } | undefined
  return finishEvent?.winnerPlayerId ?? null
}

// Hauptfunktion: Alle Kategorien berechnen
export function computeAllHighscores(): HighscoreCategory[] {
  const profiles = getProfiles()
  const x01Matches = getFinishedNon121Matches()
  const cricketMatches = getCricketMatches().filter(m => m.finished)
  const atbMatches = getATBMatches().filter(m => m.finished)
  const x01PlayerStats = getGlobalX01PlayerStats()
  const cricketPlayerStats = getGlobalCricketPlayerStats()
  const leaderboards = loadLeaderboards()

  const categories: HighscoreCategory[] = []

  for (const catConfig of HIGHSCORE_CATEGORIES) {
    const entries = computeCategoryEntries(
      catConfig.id,
      profiles,
      x01Matches,
      cricketMatches,
      atbMatches,
      x01PlayerStats,
      cricketPlayerStats,
      leaderboards
    )

    categories.push({
      ...catConfig,
      entries,
    })
  }

  return categories
}

// Einträge für eine Kategorie berechnen
function computeCategoryEntries(
  categoryId: HighscoreCategoryId,
  profiles: Profile[],
  x01Matches: StoredMatch[],
  cricketMatches: CricketStoredMatch[],
  atbMatches: ATBStoredMatch[],
  x01PlayerStats: Record<string, any>,
  cricketPlayerStats: Record<string, any>,
  leaderboards: any
): HighscoreEntry[] {
  const validProfiles = profiles.filter(p => !isGuestOrTemp(p.id, profiles))

  switch (categoryId) {
    // ========== ÜBERGREIFEND ==========
    case 'most-wins':
      return computeMostWins(validProfiles, x01Matches, cricketMatches, atbMatches)

    case 'best-winrate':
      return computeBestWinrate(validProfiles, x01Matches, cricketMatches)

    // ========== X01 VARIANTEN-UNABHÄNGIG ==========
    case 'highest-visit':
      return computeHighestVisit(validProfiles, leaderboards)

    case 'highest-checkout':
      return computeHighestCheckout(validProfiles, leaderboards)

    case 'most-180s':
      return computeMost180s(validProfiles, x01PlayerStats)

    case 'best-career-avg':
      return computeBestCareerAvg(validProfiles, x01PlayerStats)

    case 'best-checkout-pct':
      return computeBestCheckoutPct(validProfiles, x01PlayerStats)

    // ========== X01 VARIANTEN-ABHÄNGIG ==========
    case 'best-leg-501':
      return computeBestLeg(validProfiles, x01Matches, 501)

    case 'best-leg-301':
      return computeBestLeg(validProfiles, x01Matches, 301)

    case 'best-leg-701':
      return computeBestLeg(validProfiles, x01Matches, 701)

    case 'best-match-avg-501':
      return computeBestMatchAvg(validProfiles, x01Matches, 501)

    case 'best-match-avg-301':
      return computeBestMatchAvg(validProfiles, x01Matches, 301)

    // ========== CRICKET ==========
    case 'best-mpt':
      return computeBestMPT(validProfiles, cricketPlayerStats, cricketMatches)

    case 'best-mpd':
      return computeBestMPD(validProfiles, cricketPlayerStats, cricketMatches)

    case 'most-triples':
      return computeMostTriples(validProfiles, cricketPlayerStats, cricketMatches)

    case 'best-turn-marks':
      return computeBestTurnMarks(validProfiles, cricketPlayerStats, cricketMatches)

    // ========== AROUND THE BLOCK ==========
    case 'atb-fastest-ascending':
      return computeATBFastest(validProfiles, atbMatches, 'ascending')

    case 'atb-fastest-board':
      return computeATBFastest(validProfiles, atbMatches, 'board')

    case 'atb-fewest-darts-ascending':
      return computeATBFewestDarts(validProfiles, atbMatches, 'ascending')

    case 'atb-fewest-darts-board':
      return computeATBFewestDarts(validProfiles, atbMatches, 'board')

    case 'atb-most-wins':
      return computeATBMostWins(validProfiles, atbMatches)

    default:
      return []
  }
}

// ========== ÜBERGREIFEND ==========

function computeMostWins(
  profiles: Profile[],
  x01Matches: StoredMatch[],
  cricketMatches: CricketStoredMatch[],
  atbMatches: ATBStoredMatch[]
): HighscoreEntry[] {
  const winsMap: Record<string, number> = {}

  // X01 Siege zählen (nur Mehrspieler-Matches)
  for (const match of x01Matches) {
    if (match.playerIds.length <= 1) continue
    const winnerId = getX01Winner(match)
    if (winnerId && !isGuestOrTemp(winnerId, profiles)) {
      winsMap[winnerId] = (winsMap[winnerId] || 0) + 1
    }
  }

  // Cricket Siege zählen (nur Mehrspieler-Matches)
  for (const match of cricketMatches) {
    if (match.playerIds.length <= 1) continue
    const winnerId = getCricketWinner(match)
    if (winnerId && !isGuestOrTemp(winnerId, profiles)) {
      winsMap[winnerId] = (winsMap[winnerId] || 0) + 1
    }
  }

  // ATB Siege zählen (nur Mehrspieler-Matches)
  for (const match of atbMatches) {
    if (match.players.length <= 1) continue
    const winnerId = match.winnerId
    if (winnerId && !isGuestOrTemp(winnerId, profiles)) {
      winsMap[winnerId] = (winsMap[winnerId] || 0) + 1
    }
  }

  return createRankedEntries(winsMap, profiles, 'desc')
}

function computeBestWinrate(
  profiles: Profile[],
  x01Matches: StoredMatch[],
  cricketMatches: CricketStoredMatch[]
): HighscoreEntry[] {
  const statsMap: Record<string, { wins: number; total: number }> = {}

  // X01 Matches (nur Mehrspieler-Matches)
  for (const match of x01Matches) {
    if (match.playerIds.length <= 1) continue
    const winnerId = getX01Winner(match)
    for (const pid of match.playerIds) {
      if (isGuestOrTemp(pid, profiles)) continue
      if (!statsMap[pid]) statsMap[pid] = { wins: 0, total: 0 }
      statsMap[pid].total++
      if (winnerId === pid) statsMap[pid].wins++
    }
  }

  // Cricket Matches (nur Mehrspieler-Matches)
  for (const match of cricketMatches) {
    if (match.playerIds.length <= 1) continue
    const winnerId = getCricketWinner(match)
    for (const pid of match.playerIds) {
      if (isGuestOrTemp(pid, profiles)) continue
      if (!statsMap[pid]) statsMap[pid] = { wins: 0, total: 0 }
      statsMap[pid].total++
      if (winnerId === pid) statsMap[pid].wins++
    }
  }

  // Winrate berechnen (min. 10 Matches)
  const rateMap: Record<string, number> = {}
  for (const [pid, stats] of Object.entries(statsMap)) {
    if (stats.total >= 10) {
      rateMap[pid] = (stats.wins / stats.total) * 100
    }
  }

  return createRankedEntries(rateMap, profiles, 'desc')
}

// ========== X01 VARIANTEN-UNABHÄNGIG ==========

function computeHighestVisit(profiles: Profile[], leaderboards: any): HighscoreEntry[] {
  // Aus vorhandenen Leaderboards die besten pro Spieler
  const bestPerPlayer: Record<string, { value: number; matchId?: string }> = {}

  for (const entry of leaderboards.highVisits || []) {
    const pid = entry.playerId
    if (isGuestOrTemp(pid, profiles)) continue
    if (!bestPerPlayer[pid] || entry.value > bestPerPlayer[pid].value) {
      bestPerPlayer[pid] = { value: entry.value, matchId: entry.matchId }
    }
  }

  return createRankedEntriesWithMatch(bestPerPlayer, profiles, 'desc')
}

function computeHighestCheckout(profiles: Profile[], leaderboards: any): HighscoreEntry[] {
  const bestPerPlayer: Record<string, { value: number; matchId?: string }> = {}

  for (const entry of leaderboards.highCheckouts || []) {
    const pid = entry.playerId
    if (isGuestOrTemp(pid, profiles)) continue
    if (!bestPerPlayer[pid] || entry.value > bestPerPlayer[pid].value) {
      bestPerPlayer[pid] = { value: entry.value, matchId: entry.matchId }
    }
  }

  return createRankedEntriesWithMatch(bestPerPlayer, profiles, 'desc')
}

function computeMost180s(profiles: Profile[], x01PlayerStats: Record<string, any>): HighscoreEntry[] {
  const valueMap: Record<string, number> = {}

  for (const [pid, stats] of Object.entries(x01PlayerStats)) {
    if (isGuestOrTemp(pid, profiles)) continue
    if (stats.tons180 > 0) {
      valueMap[pid] = stats.tons180
    }
  }

  return createRankedEntries(valueMap, profiles, 'desc')
}

function computeBestCareerAvg(profiles: Profile[], x01PlayerStats: Record<string, any>): HighscoreEntry[] {
  const valueMap: Record<string, number> = {}

  for (const [pid, stats] of Object.entries(x01PlayerStats)) {
    if (isGuestOrTemp(pid, profiles)) continue
    if (stats.threeDartAvgOverall > 0) {
      valueMap[pid] = stats.threeDartAvgOverall
    }
  }

  return createRankedEntries(valueMap, profiles, 'desc')
}

function computeBestCheckoutPct(profiles: Profile[], x01PlayerStats: Record<string, any>): HighscoreEntry[] {
  const valueMap: Record<string, number> = {}

  for (const [pid, stats] of Object.entries(x01PlayerStats)) {
    if (isGuestOrTemp(pid, profiles)) continue
    // Min. 20 Versuche
    if (stats.doubleAttemptsDart >= 20 && stats.doublePctDart > 0) {
      valueMap[pid] = stats.doublePctDart
    }
  }

  return createRankedEntries(valueMap, profiles, 'desc')
}

// ========== X01 VARIANTEN-ABHÄNGIG ==========

function computeBestLeg(
  profiles: Profile[],
  x01Matches: StoredMatch[],
  variant: number
): HighscoreEntry[] {
  const bestPerPlayer: Record<string, { value: number; matchId?: string }> = {}

  for (const match of x01Matches) {
    const matchVariant = getX01Variant(match.events)
    if (matchVariant !== variant) continue

    // Darts pro Spieler pro Leg zählen
    let currentLegId: string | null = null
    const dartsInLeg: Record<string, number> = {}

    for (const event of match.events) {
      if (event.type === 'LegStarted') {
        const legStart = event as { legId?: string }
        currentLegId = legStart.legId ?? null
        // Reset Darts für neues Leg
        for (const key of Object.keys(dartsInLeg)) {
          delete dartsInLeg[key]
        }
      }

      if (event.type === 'VisitAdded') {
        const visit = event as { playerId?: string; darts?: any[] }
        const pid = visit.playerId
        if (pid) {
          dartsInLeg[pid] = (dartsInLeg[pid] || 0) + (visit.darts?.length ?? 3)
        }
      }

      if (event.type === 'LegFinished') {
        const legEvent = event as { winnerPlayerId?: string; legId?: string }
        const winnerId = legEvent.winnerPlayerId
        if (!winnerId) continue
        if (isGuestOrTemp(winnerId, profiles)) continue

        const darts = dartsInLeg[winnerId] || 0
        if (darts === 0) continue

        if (!bestPerPlayer[winnerId] || darts < bestPerPlayer[winnerId].value) {
          bestPerPlayer[winnerId] = { value: darts, matchId: match.id }
        }
      }
    }
  }

  return createRankedEntriesWithMatch(bestPerPlayer, profiles, 'asc')
}

function computeBestMatchAvg(
  profiles: Profile[],
  x01Matches: StoredMatch[],
  variant: number
): HighscoreEntry[] {
  const bestPerPlayer: Record<string, { value: number; matchId?: string }> = {}

  for (const match of x01Matches) {
    const matchVariant = getX01Variant(match.events)
    if (matchVariant !== variant) continue

    // Match-Stats für jeden Spieler berechnen
    const playerDarts: Record<string, number> = {}
    const playerPoints: Record<string, number> = {}

    for (const event of match.events) {
      if (event.type === 'VisitAdded') {
        const visit = event as { playerId?: string; darts?: any[]; visitScore?: number }
        const pid = visit.playerId
        if (!pid) continue

        const dartsCount = visit.darts?.length ?? 3
        const points = visit.visitScore ?? 0

        playerDarts[pid] = (playerDarts[pid] || 0) + dartsCount
        playerPoints[pid] = (playerPoints[pid] || 0) + points
      }
    }

    // Average berechnen
    for (const [pid, darts] of Object.entries(playerDarts)) {
      if (isGuestOrTemp(pid, profiles)) continue
      if (darts < 9) continue // Min. 3 Aufnahmen

      const avg = (playerPoints[pid] / darts) * 3
      if (!bestPerPlayer[pid] || avg > bestPerPlayer[pid].value) {
        bestPerPlayer[pid] = { value: avg, matchId: match.id }
      }
    }
  }

  return createRankedEntriesWithMatch(bestPerPlayer, profiles, 'desc')
}

// ========== CRICKET ==========

// Hilfsfunktion: Cricket-Stats aus Matches berechnen
function computeCricketStatsFromMatches(
  profiles: Profile[],
  cricketMatches: CricketStoredMatch[]
): Record<string, { totalMarks: number; totalTurns: number; totalTriples: number; bestTurnMarks: number }> {
  const playerStats: Record<string, { totalMarks: number; totalTurns: number; totalTriples: number; bestTurnMarks: number }> = {}

  for (const match of cricketMatches) {
    for (const event of match.events) {
      if (event.type === 'CricketTurnAdded') {
        const turn = event as {
          playerId?: string
          darts?: { target?: number | string; mult?: number }[]
        }
        const pid = turn.playerId
        if (!pid) continue
        if (isGuestOrTemp(pid, profiles)) continue

        if (!playerStats[pid]) {
          playerStats[pid] = { totalMarks: 0, totalTurns: 0, totalTriples: 0, bestTurnMarks: 0 }
        }

        // Marks aus Darts berechnen (mult = Marks pro Dart, außer MISS)
        let turnMarks = 0
        if (turn.darts) {
          for (const dart of turn.darts) {
            // MISS zählt nicht
            if (dart.target === 'MISS') continue
            const mult = dart.mult ?? 1
            turnMarks += mult

            // Triples zählen
            if (mult === 3) {
              playerStats[pid].totalTriples += 1
            }
          }
        }

        playerStats[pid].totalMarks += turnMarks
        playerStats[pid].totalTurns += 1

        if (turnMarks > playerStats[pid].bestTurnMarks) {
          playerStats[pid].bestTurnMarks = turnMarks
        }
      }
    }
  }

  return playerStats
}

function computeBestMPT(
  profiles: Profile[],
  cricketPlayerStats: Record<string, any>,
  cricketMatches: CricketStoredMatch[]
): HighscoreEntry[] {
  // Berechne Stats direkt aus Matches
  const statsFromMatches = computeCricketStatsFromMatches(profiles, cricketMatches)
  const valueMap: Record<string, number> = {}

  for (const [pid, stats] of Object.entries(statsFromMatches)) {
    // Min. 50 Turns
    if (stats.totalTurns >= 50 && stats.totalMarks > 0) {
      const mpt = stats.totalMarks / stats.totalTurns
      valueMap[pid] = mpt
    }
  }

  return createRankedEntries(valueMap, profiles, 'desc')
}

function computeBestMPD(
  profiles: Profile[],
  cricketPlayerStats: Record<string, any>,
  cricketMatches: CricketStoredMatch[]
): HighscoreEntry[] {
  const statsFromMatches = computeCricketStatsFromMatches(profiles, cricketMatches)
  const valueMap: Record<string, number> = {}

  for (const [pid, stats] of Object.entries(statsFromMatches)) {
    // Min. 100 Darts (= ca. 33 Turns)
    const darts = stats.totalTurns * 3
    if (darts >= 100 && stats.totalMarks > 0) {
      const mpd = stats.totalMarks / darts
      valueMap[pid] = mpd
    }
  }

  return createRankedEntries(valueMap, profiles, 'desc')
}

function computeMostTriples(
  profiles: Profile[],
  cricketPlayerStats: Record<string, any>,
  cricketMatches: CricketStoredMatch[]
): HighscoreEntry[] {
  const statsFromMatches = computeCricketStatsFromMatches(profiles, cricketMatches)
  const valueMap: Record<string, number> = {}

  for (const [pid, stats] of Object.entries(statsFromMatches)) {
    if (stats.totalTriples > 0) {
      valueMap[pid] = stats.totalTriples
    }
  }

  return createRankedEntries(valueMap, profiles, 'desc')
}

function computeBestTurnMarks(
  profiles: Profile[],
  cricketPlayerStats: Record<string, any>,
  cricketMatches: CricketStoredMatch[]
): HighscoreEntry[] {
  const statsFromMatches = computeCricketStatsFromMatches(profiles, cricketMatches)
  const valueMap: Record<string, number> = {}

  for (const [pid, stats] of Object.entries(statsFromMatches)) {
    if (stats.bestTurnMarks > 0) {
      valueMap[pid] = stats.bestTurnMarks
    }
  }

  return createRankedEntries(valueMap, profiles, 'desc')
}

// ========== HILFSFUNKTIONEN ==========

function createRankedEntries(
  valueMap: Record<string, number>,
  profiles: Profile[],
  sortOrder: 'asc' | 'desc'
): HighscoreEntry[] {
  const entries: HighscoreEntry[] = []

  for (const [pid, value] of Object.entries(valueMap)) {
    const info = getPlayerInfo(pid, profiles)
    entries.push({
      rank: 0,
      playerId: pid,
      playerName: info.name,
      playerColor: info.color,
      value,
    })
  }

  // Sortieren
  entries.sort((a, b) => sortOrder === 'desc' ? b.value - a.value : a.value - b.value)

  // Ränge zuweisen (Top 10)
  return entries.slice(0, 10).map((e, i) => ({ ...e, rank: i + 1 }))
}

function createRankedEntriesWithMatch(
  valueMap: Record<string, { value: number; matchId?: string }>,
  profiles: Profile[],
  sortOrder: 'asc' | 'desc'
): HighscoreEntry[] {
  const entries: HighscoreEntry[] = []

  for (const [pid, data] of Object.entries(valueMap)) {
    const info = getPlayerInfo(pid, profiles)
    entries.push({
      rank: 0,
      playerId: pid,
      playerName: info.name,
      playerColor: info.color,
      value: data.value,
      matchId: data.matchId,
    })
  }

  // Sortieren
  entries.sort((a, b) => sortOrder === 'desc' ? b.value - a.value : a.value - b.value)

  // Ränge zuweisen (Top 10)
  return entries.slice(0, 10).map((e, i) => ({ ...e, rank: i + 1 }))
}

// ========== AROUND THE BLOCK ==========

function computeATBFastest(
  profiles: Profile[],
  atbMatches: ATBStoredMatch[],
  mode: 'ascending' | 'board'
): HighscoreEntry[] {
  const bestPerPlayer: Record<string, { value: number; matchId?: string }> = {}

  for (const match of atbMatches) {
    if (match.mode !== mode) continue
    if (!match.winnerId || !match.durationMs) continue
    if (isGuestOrTemp(match.winnerId, profiles)) continue

    const pid = match.winnerId
    const time = match.durationMs

    if (!bestPerPlayer[pid] || time < bestPerPlayer[pid].value) {
      bestPerPlayer[pid] = { value: time, matchId: match.id }
    }
  }

  return createRankedEntriesWithMatch(bestPerPlayer, profiles, 'asc')
}

function computeATBFewestDarts(
  profiles: Profile[],
  atbMatches: ATBStoredMatch[],
  mode: 'ascending' | 'board'
): HighscoreEntry[] {
  const bestPerPlayer: Record<string, { value: number; matchId?: string }> = {}

  for (const match of atbMatches) {
    if (match.mode !== mode) continue
    if (!match.winnerId || !match.winnerDarts) continue
    if (isGuestOrTemp(match.winnerId, profiles)) continue

    const pid = match.winnerId
    const darts = match.winnerDarts

    if (!bestPerPlayer[pid] || darts < bestPerPlayer[pid].value) {
      bestPerPlayer[pid] = { value: darts, matchId: match.id }
    }
  }

  return createRankedEntriesWithMatch(bestPerPlayer, profiles, 'asc')
}

function computeATBMostWins(
  profiles: Profile[],
  atbMatches: ATBStoredMatch[]
): HighscoreEntry[] {
  const winsMap: Record<string, number> = {}

  for (const match of atbMatches) {
    const winnerId = match.winnerId
    if (winnerId && !isGuestOrTemp(winnerId, profiles)) {
      winsMap[winnerId] = (winsMap[winnerId] || 0) + 1
    }
  }

  return createRankedEntries(winsMap, profiles, 'desc')
}
