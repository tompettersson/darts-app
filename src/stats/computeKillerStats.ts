// src/stats/computeKillerStats.ts
// Berechnet Match-Stats fuer Killer

import type { KillerStoredMatch, KillerTurnAddedEvent, KillerPlayerEliminatedEvent } from '../types/killer'

export type KillerMatchStats = {
  targetNumber: number | null
  qualifiedInRound: number | null
  isKiller: boolean
  totalKills: number
  survivedRounds: number
  finalPosition: number
  totalDartsThrown: number
  hitRate: number // Prozent qualifizierende Treffer
  livesLost: number
  livesHealed: number
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

  for (const turn of turns) {
    totalDartsThrown += turn.darts.length

    if (turn.becameKiller) {
      isKiller = true
      qualifiedInRound = turn.roundNumber
    }

    qualifyingHits += turn.qualifyingHitsGained

    // Kills zaehlen
    totalKills += turn.eliminations.length

    // Leben-Aenderungen fuer diesen Spieler
    for (const lc of turn.livesChanges) {
      if (lc.playerId === playerId) {
        if (lc.delta < 0) livesLost += Math.abs(lc.delta)
        if (lc.delta > 0) livesHealed += lc.delta
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

  // Hit rate: qualifizierende Darts / total Darts
  const hitRate = totalDartsThrown > 0 ? (qualifyingHits / totalDartsThrown) * 100 : 0

  return {
    targetNumber,
    qualifiedInRound,
    isKiller,
    totalKills,
    survivedRounds: lastRound,
    finalPosition,
    totalDartsThrown,
    hitRate,
    livesLost,
    livesHealed,
  }
}
