// src/stats/computeKillerStats.ts
// Berechnet Match-Stats fuer Killer

import type { KillerStoredMatch, KillerTurnAddedEvent, KillerPlayerEliminatedEvent } from '../types/killer'

export type KillerMatchStats = {
  targetNumber: number | null
  qualifiedInRound: number | null
  isKiller: boolean
  totalKills: number
  hitsDealt: number // Treffer auf gegnerische Zahlen
  survivedRounds: number
  finalPosition: number
  totalDartsThrown: number
  hitRate: number // Prozent effektive Treffer (qualifying + killer)
  livesLost: number
  livesHealed: number
  selfKills: number // Leben durch eigene Zahl verloren (friendlyFire)
}

export function computeKillerMatchStats(
  match: KillerStoredMatch,
  playerId: string
): KillerMatchStats | null {
  const startEvt = match.events.find(e => e.type === 'KillerMatchStarted')
  if (!startEvt || startEvt.type !== 'KillerMatchStarted') return null

  const config = startEvt.config
  const assignEvt = match.events.find(e => e.type === 'KillerTargetsAssigned')
  const targetNumber = assignEvt?.type === 'KillerTargetsAssigned'
    ? (assignEvt.assignments.find(a => a.playerId === playerId)?.targetNumber ?? null)
    : null

  const turns = match.events.filter(
    (e): e is KillerTurnAddedEvent => e.type === 'KillerTurnAdded' && e.playerId === playerId
  )

  if (turns.length === 0) return null

  let isKiller = false
  let qualifiedInRound: number | null = null
  let totalKills = 0
  let totalDartsThrown = 0
  let qualifyingHits = 0
  let livesLost = 0
  let livesHealed = 0

  let hitsDealt = 0
  let selfKills = 0

  for (const turn of turns) {
    totalDartsThrown += turn.darts.length

    if (turn.becameKiller) {
      isKiller = true
      qualifiedInRound = turn.roundNumber
    }

    qualifyingHits += turn.qualifyingHitsGained

    // Kills zaehlen
    totalKills += turn.eliminations.length

    // Treffer in der Killer-Phase aufschluesseln
    for (const lc of turn.livesChanges) {
      if (lc.playerId === playerId) {
        if (lc.delta < 0) {
          livesLost += Math.abs(lc.delta)
          selfKills += Math.abs(lc.delta)
        }
        if (lc.delta > 0) livesHealed += lc.delta
      } else {
        // Treffer auf gegnerische Zahlen
        hitsDealt += Math.abs(lc.delta)
      }
    }
  }

  // Auch Eliminations durch andere zaehlen
  const allTurns = match.events.filter(
    (e): e is KillerTurnAddedEvent => e.type === 'KillerTurnAdded'
  )
  for (const turn of allTurns) {
    if (turn.playerId === playerId) continue
    for (const lc of turn.livesChanges) {
      if (lc.playerId === playerId) {
        if (lc.delta < 0) livesLost += Math.abs(lc.delta)
      }
    }
  }

  // Final position
  const finishEvt = match.events.find(e => e.type === 'KillerMatchFinished')
  let finalPosition = 0
  if (finishEvt?.type === 'KillerMatchFinished') {
    const standing = finishEvt.finalStandings.find(s => s.playerId === playerId)
    finalPosition = standing?.position ?? 0
  }

  // Survived rounds
  const elimEvt = match.events.find(
    (e): e is KillerPlayerEliminatedEvent => e.type === 'KillerPlayerEliminated' && e.playerId === playerId
  )
  const lastRound = elimEvt ? elimEvt.roundNumber : (
    allTurns.length > 0 ? allTurns[allTurns.length - 1].roundNumber : 0
  )

  // Hit rate: effektive Treffer (qualifying + gegnerische Treffer + self) / total Darts
  const effectiveHits = qualifyingHits + hitsDealt + selfKills + livesHealed
  const hitRate = totalDartsThrown > 0 ? (effectiveHits / totalDartsThrown) * 100 : 0

  return {
    targetNumber,
    qualifiedInRound,
    isKiller,
    totalKills,
    hitsDealt,
    survivedRounds: lastRound,
    finalPosition,
    totalDartsThrown,
    hitRate,
    livesLost,
    livesHealed,
    selfKills,
  }
}

/**
 * Info ueber ein einzelnes Leg eines Killer-Matches.
 */
export type KillerLegInfo = {
  legIndex: number
  setIndex: number
  winnerId: string | null
  winnerName: string | null
  playerStats: KillerLegPlayerStats[]
}

export type KillerLegPlayerStats = {
  playerId: string
  targetNumber: number | null
  totalKills: number
  hitsDealt: number
  totalDartsThrown: number
  hitRate: number
  livesLost: number
  livesHealed: number
  selfKills: number
  survivedRounds: number
  qualifiedInRound: number | null
  isKiller: boolean
}

/**
 * Extrahiert Infos ueber alle Legs in einem Killer-Match.
 */
export function getKillerLegs(match: KillerStoredMatch): KillerLegInfo[] {
  const events = match.events
  const startEvt = events.find(e => e.type === 'KillerMatchStarted')
  if (!startEvt || startEvt.type !== 'KillerMatchStarted') return []

  const players = startEvt.players
  const playerNameMap: Record<string, string> = {}
  players.forEach(p => { playerNameMap[p.playerId] = p.name })

  // Identify leg boundaries: events between KillerLegStarted events (or start of match)
  // For single-leg matches, there may not be a KillerLegStarted event at all
  type LegBoundary = { legIndex: number; setIndex: number; startIdx: number; endIdx: number }
  const boundaries: LegBoundary[] = []

  const legStartIndices: { idx: number; legIndex: number; setIndex: number }[] = []
  for (let i = 0; i < events.length; i++) {
    const e = events[i]
    if (e.type === 'KillerLegStarted') {
      legStartIndices.push({ idx: i, legIndex: e.legIndex, setIndex: e.setIndex })
    }
  }

  if (legStartIndices.length === 0) {
    // Single leg match - all events belong to leg 0
    boundaries.push({ legIndex: 0, setIndex: 0, startIdx: 0, endIdx: events.length })
  } else {
    // First leg: from start to first LegStarted (events before it are also leg 0 conceptually,
    // but the first LegStarted IS leg 0, so events between match start and first LegStarted
    // are the initial leg)
    for (let i = 0; i < legStartIndices.length; i++) {
      const curr = legStartIndices[i]
      const nextIdx = i + 1 < legStartIndices.length ? legStartIndices[i + 1].idx : events.length
      boundaries.push({
        legIndex: curr.legIndex,
        setIndex: curr.setIndex,
        startIdx: curr.idx,
        endIdx: nextIdx,
      })
    }

    // If there are events before the first LegStarted (initial leg with no explicit LegStarted)
    if (legStartIndices[0].idx > 0 && legStartIndices[0].legIndex > 0) {
      boundaries.unshift({
        legIndex: 0,
        setIndex: 0,
        startIdx: 0,
        endIdx: legStartIndices[0].idx,
      })
    }
  }

  // For each leg, compute per-player stats
  const legs: KillerLegInfo[] = []

  for (const bound of boundaries) {
    const legEvents = events.slice(bound.startIdx, bound.endIdx)

    // Find winner from LegFinished event in this range
    const legFinished = legEvents.find(e => e.type === 'KillerLegFinished' && e.legIndex === bound.legIndex)
    const legWinnerId = legFinished?.type === 'KillerLegFinished' ? legFinished.winnerId : null

    // If no LegFinished, check MatchFinished (last leg)
    const matchFinished = legEvents.find(e => e.type === 'KillerMatchFinished')
    const winnerId = legWinnerId ?? (matchFinished?.type === 'KillerMatchFinished' ? matchFinished.winnerId : null)

    // Find target assignments for this leg
    const assignEvt = legEvents.find(e => e.type === 'KillerTargetsAssigned')

    const legTurns = legEvents.filter(
      (e): e is KillerTurnAddedEvent => e.type === 'KillerTurnAdded'
    )

    const legElims = legEvents.filter(
      (e): e is KillerPlayerEliminatedEvent => e.type === 'KillerPlayerEliminated'
    )

    const playerStats: KillerLegPlayerStats[] = players.map(p => {
      const pid = p.playerId
      const targetNumber = assignEvt?.type === 'KillerTargetsAssigned'
        ? (assignEvt.assignments.find(a => a.playerId === pid)?.targetNumber ?? null)
        : null

      const myTurns = legTurns.filter(t => t.playerId === pid)

      let totalKills = 0
      let hitsDealt = 0
      let totalDartsThrown = 0
      let livesLost = 0
      let livesHealed = 0
      let selfKills = 0
      let qualifyingHits = 0
      let isKiller = false
      let qualifiedInRound: number | null = null

      for (const turn of myTurns) {
        totalDartsThrown += turn.darts.length
        if (turn.becameKiller) {
          isKiller = true
          qualifiedInRound = turn.roundNumber
        }
        qualifyingHits += turn.qualifyingHitsGained
        totalKills += turn.eliminations.length

        for (const lc of turn.livesChanges) {
          if (lc.playerId === pid) {
            if (lc.delta < 0) { livesLost += Math.abs(lc.delta); selfKills += Math.abs(lc.delta) }
            if (lc.delta > 0) livesHealed += lc.delta
          } else {
            hitsDealt += Math.abs(lc.delta)
          }
        }
      }

      // Lives lost from others' turns
      for (const turn of legTurns) {
        if (turn.playerId === pid) continue
        for (const lc of turn.livesChanges) {
          if (lc.playerId === pid && lc.delta < 0) {
            livesLost += Math.abs(lc.delta)
          }
        }
      }

      // Survived rounds
      const elimEvt = legElims.find(e => e.playerId === pid)
      const lastRound = elimEvt ? elimEvt.roundNumber : (
        myTurns.length > 0 ? myTurns[myTurns.length - 1].roundNumber : 0
      )

      const effectiveHits = qualifyingHits + hitsDealt + selfKills + livesHealed
      const hitRate = totalDartsThrown > 0 ? (effectiveHits / totalDartsThrown) * 100 : 0

      return {
        playerId: pid,
        targetNumber,
        totalKills,
        hitsDealt,
        totalDartsThrown,
        hitRate,
        livesLost,
        livesHealed,
        selfKills,
        survivedRounds: lastRound,
        qualifiedInRound,
        isKiller,
      }
    })

    legs.push({
      legIndex: bound.legIndex,
      setIndex: bound.setIndex,
      winnerId,
      winnerName: winnerId ? (playerNameMap[winnerId] ?? null) : null,
      playerStats,
    })
  }

  return legs
}
