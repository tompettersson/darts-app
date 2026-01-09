// src/stats/computeCricketStats.ts
//
// Berechnet Statistiken für ein komplettes Cricket-Match
// (wird vom Storage für Summary/Hall of Fame genutzt)

import {
  targetsFor,
  applyCricketEvents,
  type CricketEvent,
  type CricketMatchStarted,
  type CricketTurnAdded,
  type CricketLegFinished,
} from '../dartsCricket'

// Wir nehmen die gleichen Grundtypen wie in dartsCricket.ts
export type CricketRange = 'short' | 'long'
export type CricketStyle = 'standard' | 'cutthroat'

// Ein Cricket-Target ist eine Zahl (10..20 oder 15..20 je nach Range) oder Bull
export type CricketTarget = number | 'BULL'

// Stat-Result pro Spieler fürs ganze Match
export type CricketPlayerMatchStats = {
  playerId: string
  playerName: string

  legsWon: number

  totalMarks: number          // alle Marks über das ganze Match (alle Legs)
  marksPerTurn: number
  marksPerDart: number

  totalPointsGiven?: number   // Standard: eigene Punkte
  totalPointsTaken?: number   // Cutthroat: kassierte Punkte

  triplesHit: number          // wie oft mult=3 (Bull mult=3 wird als 2 gezählt in Engine, aber wir zählen den Wurf trotzdem als "3 gedrückt")
  doublesHit: number
  bullHitsSingle: number      // Bulls mit mult=1
  bullHitsDouble: number      // Bulls mit mult>=2
  bullAccuracy: number        // Bulls/Versuche auf Bull

  turnsWithNoScore: number    // Turns mit 0 Marks UND 0 Punkte
  longestStreakMarks: number  // längste Serie von Turns mit >=1 Mark hintereinander
  bestTurnMarks: number       // maximale Marks in EINEM Turn
  bestTurnPoints: number      // maximale Punkte in EINEM Turn

  favouriteField: CricketTarget | null      // Feld, das am häufigsten zuerst geschlossen wurde
  strongestField: CricketTarget | null      // Feld mit den meisten Gesamt-Marks
  weakestField: CricketTarget | null        // Feld mit den wenigsten Gesamt-Marks (unter den Cricket-Zielen)

  finishField: CricketTarget | null         // Mit welchem Feld wurde das Leg entschieden (das Sieger-Leg, letzter Dart)
  firstCloseOrder: CricketTarget[]          // Reihenfolge, in der Felder im Match erstmals zu waren
}

// Stat-Result fürs ganze Match
export type CricketMatchComputedStats = {
  matchId: string
  range: CricketRange
  style: CricketStyle
  targetWins: number

  players: CricketPlayerMatchStats[]

  fastestLegByMarks: {
    legIndex: number
    playerId: string
    dartsThrown: number
    marks: number
  } | null

  biggestComeback: {
    playerId: string
    fromBehindPoints: number
    result: 'wonLeg' | 'wonMatch'
  } | null
}

/**
 * computeCricketStats
 *
 * Erwartete Form von `cricketMatch`:
 * {
 *   id: string,
 *   range: 'short' | 'long',
 *   style: 'standard' | 'cutthroat',
 *   targetWins: number,
 *   players: [{ id, name }],
 *   events: CricketEvent[],
 *   finished: boolean
 * }
 */
export function computeCricketStats(cricketMatch: {
  id: string
  range: CricketRange
  style: CricketStyle
  targetWins: number
  players: { id: string; name: string }[]
  events: CricketEvent[]
}): CricketMatchComputedStats {

  const { id: matchId, range, style, targetWins, players, events } = cricketMatch

  // --- Vorbereitung aus Start-Event ---------------------------------
  const matchStart = events.find(e => e.type === 'CricketMatchStarted') as CricketMatchStarted | undefined
  const playerOrder: string[] = matchStart
    ? matchStart.players.map(p => p.playerId)
    : players.map(p => p.id)

  const cricketTargets = targetsFor(range) as CricketTarget[]

  // Accumulator pro Spieler
  type MutablePlayerAcc = {
    legsWon: number
    totalMarks: number
    totalPointsGiven: number
    totalPointsTaken: number
    totalTurns: number
    totalDarts: number
    triplesHit: number
    doublesHit: number
    bullHitsSingle: number
    bullHitsDouble: number
    bullAttempts: number
    turnsWithNoScore: number
    currentHitStreak: number
    longestHitStreak: number
    bestTurnMarks: number
    bestTurnPoints: number
    // Feld-spezifisch:
    marksByField: Record<CricketTarget, number>
    firstCloseOrder: CricketTarget[]
    closedAlready: Set<CricketTarget>
    finishField: CricketTarget | null
  }

  const perPlayer: Record<string, MutablePlayerAcc> = {}
  for (const p of players) {
    const acc: MutablePlayerAcc = {
      legsWon: 0,
      totalMarks: 0,
      totalPointsGiven: 0,
      totalPointsTaken: 0,
      totalTurns: 0,
      totalDarts: 0,
      triplesHit: 0,
      doublesHit: 0,
      bullHitsSingle: 0,
      bullHitsDouble: 0,
      bullAttempts: 0,
      turnsWithNoScore: 0,
      currentHitStreak: 0,
      longestHitStreak: 0,
      bestTurnMarks: 0,
      bestTurnPoints: 0,
      marksByField: {} as Record<CricketTarget, number>,
      firstCloseOrder: [],
      closedAlready: new Set<CricketTarget>(),
      finishField: null,
    }
    for (const t of cricketTargets) {
      acc.marksByField[t] = 0
    }
    perPlayer[p.id] = acc
  }

  // Leg-Tracking für Awards wie "fastestLegByMarks"
  let currentLegIndex = 0
  let legStartEventIdx = 0 // index in events wo das aktuelle Leg anfängt
  let fastestLeg: {
    legIndex: number
    playerId: string
    dartsThrown: number
    marks: number
  } | null = null

  function evaluateLeg(legWinnerId: string) {
    const legEvents = events.slice(legStartEventIdx)

    let winnerDarts = 0
    let winnerMarks = 0

    for (const ev of legEvents) {
      if (ev.type !== 'CricketTurnAdded') continue
      const turn = ev as CricketTurnAdded
      if (turn.playerId !== legWinnerId) continue

      for (const dart of turn.darts) {
        winnerDarts += 1
        if (dart.target !== 'MISS') {
          const marksFromThisDart =
            dart.target === 'BULL' && dart.mult === 3
              ? 2
              : dart.mult
          winnerMarks += marksFromThisDart
        }
      }
    }

    const newEntry = {
      legIndex: currentLegIndex,
      playerId: legWinnerId,
      dartsThrown: winnerDarts,
      marks: winnerMarks,
    }

    if (!fastestLeg) {
      fastestLeg = newEntry
    } else {
      // "schnell" = weniger Darts; bei Gleichstand -> mehr Marks
      if (
        newEntry.dartsThrown < fastestLeg.dartsThrown ||
        (newEntry.dartsThrown === fastestLeg.dartsThrown &&
          newEntry.marks > fastestLeg.marks)
      ) {
        fastestLeg = newEntry
      }
    }
  }

  // Comeback-Tracking
  let biggestComeback: {
    playerId: string
    fromBehindPoints: number
    result: 'wonLeg' | 'wonMatch'
  } | null = null

  function considerComeback(winnerId: string, legEndIdx: number, isMatchWinner: boolean) {
    // wir approximieren "vor dem letzten Wurf" vs "nach dem letzten Wurf"
    const beforeState = applyCricketEvents(events.slice(0, legEndIdx) as CricketEvent[])
    const afterState  = applyCricketEvents(events.slice(0, legEndIdx + 1) as CricketEvent[])

    const beforeWinnerScore = beforeState.pointsByPlayer[winnerId] ?? 0
    const oppScoresBefore = Object.keys(beforeState.pointsByPlayer)
      .filter(pid => pid !== winnerId)
      .map(pid => beforeState.pointsByPlayer[pid] ?? 0)

    if (!oppScoresBefore.length) return

    let deficit = 0
    if (style === 'standard') {
      // Standard: mehr Punkte ist besser.
      const maxOppBefore = Math.max(...oppScoresBefore)
      if (beforeWinnerScore < maxOppBefore) {
        deficit = maxOppBefore - beforeWinnerScore
      }
    } else {
      // Cutthroat: weniger Punkte ist besser (Punkte = Strafpunkte).
      const minOppBefore = Math.min(...oppScoresBefore)
      if (beforeWinnerScore > minOppBefore) {
        deficit = beforeWinnerScore - minOppBefore
      }
    }

    if (deficit <= 0) return

    const candidate = {
      playerId: winnerId,
      fromBehindPoints: deficit,
      result: isMatchWinner ? 'wonMatch' as const : 'wonLeg' as const,
    }

    if (!biggestComeback) {
      biggestComeback = candidate
    } else {
      if (candidate.fromBehindPoints > biggestComeback.fromBehindPoints) {
        biggestComeback = candidate
      } else if (
        candidate.fromBehindPoints === biggestComeback.fromBehindPoints &&
        candidate.result === 'wonMatch' &&
        biggestComeback.result !== 'wonMatch'
      ) {
        // Gleichstand beim Defizit, Match-Win ist höherwertig als nur Leg-Win
        biggestComeback = candidate
      }
    }
  }

  // Leg-Aggregation (laufend)
  type LegAgg = {
    marksThisLegByPlayer: Record<string, number>
    pointsThisLegByPlayer: Record<string, number>
  }
  let legAgg: LegAgg = {
    marksThisLegByPlayer: {},
    pointsThisLegByPlayer: {},
  }
  function ensureLegAggPlayer(pid: string) {
    if (legAgg.marksThisLegByPlayer[pid] === undefined) {
      legAgg.marksThisLegByPlayer[pid] = 0
    }
    if (legAgg.pointsThisLegByPlayer[pid] === undefined) {
      legAgg.pointsThisLegByPlayer[pid] = 0
    }
  }

  // State, den wir inkrementell mitführen
  let stateSoFar = applyCricketEvents([])

  // --- Hauptloop über Events ---------------------------------
  for (let i = 0; i < events.length; i++) {
    const ev = events[i]

    if (ev.type === 'CricketTurnAdded') {
      const turn = ev as CricketTurnAdded
      const pid = turn.playerId
      const playerAcc = perPlayer[pid]
      if (!playerAcc) {
        // Spieler evtl. Gast o.Ä., ignorieren
        stateSoFar = applyCricketEvents([...stateSoFar.events, ev])
        continue
      }

      const before = stateSoFar
      const after  = applyCricketEvents([...stateSoFar.events, ev])

      let turnMarks = 0
      let turnPointsDelta = 0
      let turnHadScore = false

      const dartsInTurn = turn.darts.length
      playerAcc.totalTurns += 1
      playerAcc.totalDarts += dartsInTurn

      for (const dart of turn.darts) {
        // Bull stats
        if (dart.target === 'BULL') {
          playerAcc.bullAttempts += 1
          if (dart.mult >= 2) {
            playerAcc.bullHitsDouble += 1
          } else if (dart.mult === 1) {
            playerAcc.bullHitsSingle += 1
          }
        }

        // Triples / Doubles (was der Spieler geworfen hat)
        if (dart.mult === 3) playerAcc.triplesHit += 1
        else if (dart.mult === 2) playerAcc.doublesHit += 1

        // Marks aus dem Dart
        if (dart.target !== 'MISS') {
          const marksFromThisDart =
            dart.target === 'BULL' && dart.mult === 3
              ? 2
              : dart.mult
          turnMarks += marksFromThisDart
          if (marksFromThisDart > 0) {
            turnHadScore = true
          }

          const fieldKey = (dart.target === 'BULL' ? 'BULL' : dart.target) as CricketTarget
          playerAcc.marksByField[fieldKey] = (playerAcc.marksByField[fieldKey] ?? 0) + marksFromThisDart
        }
      }

      // Punkteänderung messen (Standard = eigene Punkte hoch, Cutthroat = Strafpunkte hoch)
      {
        const beforePoints = before.pointsByPlayer[pid] ?? 0
        const afterPoints  = after.pointsByPlayer[pid] ?? 0
        const delta = afterPoints - beforePoints
        if (delta !== 0) {
          turnPointsDelta += delta
          turnHadScore = true
        }

        ensureLegAggPlayer(pid)
        legAgg.pointsThisLegByPlayer[pid] += delta
      }

      ensureLegAggPlayer(pid)
      legAgg.marksThisLegByPlayer[pid] += turnMarks

      playerAcc.totalMarks += turnMarks
      if (style === 'standard') {
        playerAcc.totalPointsGiven += turnPointsDelta
      } else {
        playerAcc.totalPointsTaken += turnPointsDelta
      }

      // Best Turn stuff
      if (turnMarks > playerAcc.bestTurnMarks) {
        playerAcc.bestTurnMarks = turnMarks
      }
      if (turnPointsDelta > playerAcc.bestTurnPoints) {
        playerAcc.bestTurnPoints = turnPointsDelta
      }

      // Streak
      if (turnHadScore) {
        playerAcc.currentHitStreak += 1
        if (playerAcc.currentHitStreak > playerAcc.longestHitStreak) {
          playerAcc.longestHitStreak = playerAcc.currentHitStreak
        }
      } else {
        playerAcc.turnsWithNoScore += 1
        playerAcc.currentHitStreak = 0
      }

      // Feld-Schließ-Reihenfolge tracken (wann schließt der Spieler ein Feld zum ersten Mal?)
      const afterMarks = after.marksByPlayer[pid]
      const beforeMarks = before.marksByPlayer[pid]
      for (const tgt of cricketTargets) {
        const key = String(tgt)
        const wasBeforeClosed = (beforeMarks?.[key] ?? 0) >= 3
        const isAfterClosed   = (afterMarks?.[key]  ?? 0) >= 3
        if (!wasBeforeClosed && isAfterClosed) {
          if (!playerAcc.closedAlready.has(tgt)) {
            playerAcc.closedAlready.add(tgt)
            playerAcc.firstCloseOrder.push(tgt)
          }
        }
      }

      stateSoFar = after
      continue
    }

    if (ev.type === 'CricketLegFinished') {
      const legEnd = ev as CricketLegFinished
      const winnerId = legEnd.winnerPlayerId
      const winnerAcc = perPlayer[winnerId]
      if (winnerAcc) {
        winnerAcc.legsWon += 1

        // Feld, mit dem das Leg tatsächlich beendet wurde
        const lastTurnOfWinner = findLastTurnBeforeIndex(events, i, winnerId)
        const finishField = lastSignificantField(lastTurnOfWinner)
        if (finishField) {
          winnerAcc.finishField = finishField
        }
      }

      // fastestLegByMarks aktualisieren
      evaluateLeg(winnerId)

      // Comeback-Kandidat prüfen (Leg)
      considerComeback(winnerId, i, false)

      // Neues Leg beginnt direkt danach
      currentLegIndex += 1
      legStartEventIdx = i + 1

      // Leg-Zwischenstände resetten
      legAgg = {
        marksThisLegByPlayer: {},
        pointsThisLegByPlayer: {},
      }

      // stateSoFar nach diesem Event neu aufbauen (applyCricketEvents resettet Marks/Punkte nach LegFinish)
      stateSoFar = applyCricketEvents(events.slice(0, i + 1) as CricketEvent[])
      continue
    }

    if (ev.type === 'CricketMatchFinished') {
      const winnerId = (ev as any).winnerPlayerId as string | undefined
      if (winnerId) {
        considerComeback(winnerId, i, true)
      }
      // danach nichts mehr besonderes
      continue
    }

    if (ev.type === 'CricketMatchStarted') {
      stateSoFar = applyCricketEvents(events.slice(0, i + 1) as CricketEvent[])
      continue
    }
  }

  // --- finale Aufbereitung pro Spieler -----------------------

  const playersOut: CricketPlayerMatchStats[] = players.map(p => {
    const acc = perPlayer[p.id]

    const marksPerTurn =
      acc.totalTurns > 0 ? acc.totalMarks / acc.totalTurns : 0

    const marksPerDart =
      acc.totalDarts > 0 ? acc.totalMarks / acc.totalDarts : 0

    const bullTotalHits = acc.bullHitsSingle + acc.bullHitsDouble
    const bullAccuracy =
      acc.bullAttempts > 0 ? bullTotalHits / acc.bullAttempts : 0

    // stärkstes / schwächstes Feld
    let strongestField: CricketTarget | null = null
    let strongestVal = -Infinity
    let weakestField: CricketTarget | null = null
    let weakestVal = Infinity
    for (const tgt of cricketTargets) {
      const val = acc.marksByField[tgt] ?? 0
      if (val > strongestVal) {
        strongestVal = val
        strongestField = tgt
      }
      if (val < weakestVal) {
        weakestVal = val
        weakestField = tgt
      }
    }

    // Lieblingsfeld = das erste Feld, das dieser Spieler jemals geschlossen hat
    const favouriteField =
      acc.firstCloseOrder.length > 0
        ? acc.firstCloseOrder[0]
        : null

    return {
      playerId: p.id,
      playerName: p.name,

      legsWon: acc.legsWon,

      totalMarks: acc.totalMarks,
      marksPerTurn,
      marksPerDart,

      totalPointsGiven: style === 'standard' ? acc.totalPointsGiven : undefined,
      totalPointsTaken: style === 'cutthroat' ? acc.totalPointsTaken : undefined,

      triplesHit: acc.triplesHit,
      doublesHit: acc.doublesHit,
      bullHitsSingle: acc.bullHitsSingle,
      bullHitsDouble: acc.bullHitsDouble,
      bullAccuracy,

      turnsWithNoScore: acc.turnsWithNoScore,
      longestStreakMarks: acc.longestHitStreak,
      bestTurnMarks: acc.bestTurnMarks,
      bestTurnPoints: acc.bestTurnPoints,

      favouriteField,
      strongestField,
      weakestField,

      finishField: acc.finishField,
      firstCloseOrder: acc.firstCloseOrder,
    }
  })

  return {
    matchId,
    range,
    style,
    targetWins,
    players: playersOut,
    fastestLegByMarks: fastestLeg,
    biggestComeback,
  }
}

// ----------------- interne Helfer -----------------

function findLastTurnBeforeIndex(
  events: CricketEvent[],
  endIndex: number,
  playerId: string
): CricketTurnAdded | null {
  for (let i = endIndex - 1; i >= 0; i--) {
    const ev = events[i]
    if (ev.type === 'CricketTurnAdded' && (ev as CricketTurnAdded).playerId === playerId) {
      return ev as CricketTurnAdded
    }
  }
  return null
}

function lastSignificantField(
  turn: CricketTurnAdded | null
): CricketTarget | null {
  if (!turn) return null
  for (let i = turn.darts.length - 1; i >= 0; i--) {
    const d = turn.darts[i]
    if (d.target === 'MISS') continue
    if (d.target === 'BULL') return 'BULL'
    return d.target as CricketTarget
  }
  return null
}
