// src/stats/computeCTFStats.ts
// Statistik-Berechnung für Capture the Field Matches

import type { CTFStoredMatch, CTFEvent } from '../types/captureTheField'
import { applyCTFEvents } from '../dartsCaptureTheField'

export type CTFMatchStats = {
  playerId: string
  playerName: string
  totalDarts: number
  triples: number
  doubles: number
  singles: number
  misses: number
  hitRate: number
  fieldsWon: number
  fieldPoints: number
  totalScore: number
  isWinner: boolean
  durationMs?: number
}

/**
 * Berechnet Statistiken für alle Spieler eines CTF-Matches
 */
export function computeCTFMatchStats(match: CTFStoredMatch): CTFMatchStats[] {
  const state = applyCTFEvents(match.events)
  if (!state.match) return []

  const stats: CTFMatchStats[] = []

  for (const player of state.match.players) {
    const pid = player.playerId

    let totalDarts = 0
    let triples = 0
    let doubles = 0
    let singles = 0
    let misses = 0

    for (const event of match.events) {
      if (event.type === 'CTFTurnAdded' && event.playerId === pid) {
        for (const dart of event.darts) {
          totalDarts++
          if (dart.target === 'MISS') {
            misses++
          } else if (dart.mult === 3) {
            triples++
          } else if (dart.mult === 2) {
            doubles++
          } else {
            singles++
          }
        }
      }
    }

    const hits = totalDarts - misses
    const hitRate = totalDarts > 0 ? (hits / totalDarts) * 100 : 0

    // Felder gewonnen und Feldpunkte zählen
    let fieldsWon = 0
    let fieldPoints = 0
    let totalScore = 0
    for (const event of match.events) {
      if (event.type === 'CTFRoundFinished') {
        if (event.winnerId === pid) fieldsWon++
        totalScore += event.scoresByPlayer[pid] ?? 0
        // fieldPoints aus Event oder retroaktiv berechnen
        if (event.fieldPoints) {
          fieldPoints += event.fieldPoints[pid] ?? 0
        } else {
          // Rückwärtskompatibilität
          if (event.winnerId === pid) {
            fieldPoints += 3
          } else if (event.winnerId === null) {
            const maxScore = Math.max(...Object.values(event.scoresByPlayer))
            if ((event.scoresByPlayer[pid] ?? 0) === maxScore && maxScore > 0) fieldPoints += 1
          }
        }
      }
    }

    stats.push({
      playerId: pid,
      playerName: player.name,
      totalDarts,
      triples,
      doubles,
      singles,
      misses,
      hitRate,
      fieldsWon,
      fieldPoints,
      totalScore,
      isWinner: match.winnerId === pid,
      durationMs: match.durationMs,
    })
  }

  return stats
}

// =====================================================
// DETAILLIERTE STATISTIKEN
// =====================================================

export type CTFFieldStats = {
  field: string
  darts: number
  score: number
  triples: number
  doubles: number
  singles: number
  misses: number
  won: boolean
}

export type CTFDetailedStats = {
  playerId: string
  playerName: string
  totalDarts: number
  totalScore: number
  fieldsWon: number
  fieldsPlayed: number
  avgScorePerField: number
  statsPerField: Record<string, CTFFieldStats>
  triples: number
  doubles: number
  singles: number
  misses: number
  hitRate: number
  bestField: { field: string; score: number } | null
  worstField: { field: string; score: number } | null
  perfectTurns: number // Turns mit 3 Treffern
  isWinner: boolean
}

/**
 * Berechnet detaillierte Statistiken für ein CTF Match
 */
export function computeCTFDetailedStats(
  match: CTFStoredMatch,
  legIndex?: number
): CTFDetailedStats[] {
  const state = applyCTFEvents(match.events)
  if (!state.match) return []

  const sequence = match.generatedSequence ?? state.match.sequence

  // Events für das gewünschte Leg filtern
  let relevantEvents: CTFEvent[] = match.events
  if (legIndex !== undefined) {
    let currentLeg = 0
    let legStartIdx = 0
    let legEndIdx = match.events.length

    for (let i = 0; i < match.events.length; i++) {
      const ev = match.events[i]
      if (ev.type === 'CTFLegStarted') {
        if (currentLeg === legIndex) {
          legStartIdx = i
        }
      }
      if (ev.type === 'CTFLegFinished') {
        if (currentLeg === legIndex) {
          legEndIdx = i + 1
          break
        }
        currentLeg++
      }
    }
    relevantEvents = match.events.slice(legStartIdx, legEndIdx)
  }

  // Round-Events sammeln für Feld-Zuordnung
  const roundEvents = relevantEvents.filter(
    (e): e is Extract<CTFEvent, { type: 'CTFRoundFinished' }> => e.type === 'CTFRoundFinished'
  )

  const results: CTFDetailedStats[] = []

  for (const player of state.match.players) {
    const pid = player.playerId

    const statsPerField: Record<string, CTFFieldStats> = {}
    for (const t of sequence) {
      const key = String(t.number)
      statsPerField[key] = {
        field: key,
        darts: 0,
        score: 0,
        triples: 0,
        doubles: 0,
        singles: 0,
        misses: 0,
        won: false,
      }
    }

    let totalDarts = 0
    let totalScore = 0
    let triples = 0
    let doubles = 0
    let singles = 0
    let misses = 0
    let perfectTurns = 0
    let fieldsWon = 0

    // Turn-Events für diesen Spieler
    const turnEvents = relevantEvents.filter(
      (e) => e.type === 'CTFTurnAdded' && e.playerId === pid
    ) as Extract<CTFEvent, { type: 'CTFTurnAdded' }>[]

    // Ordne Turns den Feldern zu über Round-Events
    let roundIdx = 0
    for (const turn of turnEvents) {
      // Finde das zugehörige Round-Event
      let targetField: string | null = null
      const turnTime = new Date(turn.ts).getTime()

      for (let ri = roundIdx; ri < roundEvents.length; ri++) {
        const roundTime = new Date(roundEvents[ri].ts).getTime()
        if (roundTime >= turnTime) {
          targetField = String(roundEvents[ri].fieldNumber)
          break
        }
      }

      if (!targetField) continue

      if (!statsPerField[targetField]) {
        statsPerField[targetField] = {
          field: targetField,
          darts: 0,
          score: 0,
          triples: 0,
          doubles: 0,
          singles: 0,
          misses: 0,
          won: false,
        }
      }

      let turnHits = 0
      for (const dart of turn.darts) {
        totalDarts++
        statsPerField[targetField].darts++

        if (dart.target === 'MISS') {
          misses++
          statsPerField[targetField].misses++
        } else {
          turnHits++
          if (dart.mult === 3) {
            triples++
            statsPerField[targetField].triples++
          } else if (dart.mult === 2) {
            doubles++
            statsPerField[targetField].doubles++
          } else {
            singles++
            statsPerField[targetField].singles++
          }
        }
      }

      // Score aus dem Turn-Event
      totalScore += turn.captureScore
      statsPerField[targetField].score += turn.captureScore

      if (turnHits === 3) perfectTurns++
    }

    // Gewonnene Felder markieren
    for (const round of roundEvents) {
      const fieldKey = String(round.fieldNumber)
      if (round.winnerId === pid && statsPerField[fieldKey]) {
        statsPerField[fieldKey].won = true
        fieldsWon++
      }
    }

    const fieldsPlayed = roundEvents.length
    const avgScorePerField = fieldsPlayed > 0 ? totalScore / fieldsPlayed : 0
    const hits = totalDarts - misses
    const hitRate = totalDarts > 0 ? (hits / totalDarts) * 100 : 0

    // Best/Worst Field nach Score
    const playedFields = Object.entries(statsPerField)
      .filter(([_, s]) => s.darts > 0)
      .map(([field, s]) => ({ field, score: s.score }))

    const bestField = playedFields.length > 0
      ? playedFields.reduce((best, curr) => curr.score > best.score ? curr : best)
      : null
    const worstField = playedFields.length > 0
      ? playedFields.reduce((worst, curr) => curr.score < worst.score ? curr : worst)
      : null

    results.push({
      playerId: pid,
      playerName: player.name,
      totalDarts,
      totalScore,
      fieldsWon,
      fieldsPlayed,
      avgScorePerField,
      statsPerField,
      triples,
      doubles,
      singles,
      misses,
      hitRate,
      bestField,
      worstField,
      perfectTurns,
      isWinner: match.winnerId === pid,
    })
  }

  return results
}
