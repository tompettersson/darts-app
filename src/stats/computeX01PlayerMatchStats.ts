// src/stats/computeX01PlayerMatchStats.ts
// Berechnet detaillierte Stats für EIN fertiggespieltes X01-Match,
// Spieler für Spieler. Diese Daten werden danach in storage.ts
// in eine Langzeit-Historie gemerged (Karriere-Stats).

import {
  type DartsEvent,
  type MatchStarted,
  type MatchFinished,
  type VisitAdded,
  type LegFinished,
  type SetFinished,
  computeStats,
  isDouble,
  isTriple,
  getOutRule,
  type OutRule,
} from '../darts501'

// ---- Typen für den Output Richtung Storage ----

export type X01PerMatchPlayerStats = {
  playerId: string
  playerName: string

  // Match-Meta
  matchId: string
  wonMatch: boolean
  legsWon: number
  setsWon: number

  // Scoring / Averages
  dartsThrown: number
  pointsScored: number
  threeDartAvg: number
  first9OverallAvg?: number

  // Checkout / Finishing
  highestCheckout: number
  doubleAttemptsDart: number
  doublesHitDart: number
  doublePctDart: number

  checkoutAttempts: number
  checkoutsMade: number
  checkoutPct: number

  // Treffer-Heatmaps
  // z.B. doublesHitCount["16"] = wie oft Double16 getroffen wurde
  doublesHitCount: Record<string, number>
  // triplesHitCount["20"] = wie oft T20 getroffen wurde
  triplesHitCount: Record<string, number>
  // segmentsHitCount["20"] = alle Würfe auf die 20 (S/T/D zusammengezählt)
  segmentsHitCount: Record<string, number>

  // Für "Lieblingsdouble": Wie oft wurde ein Leg mit diesem Doppel beendet?
  // e.g. finishingDoubles["16"] = 3 (Legs mit D16 gecheckt)
  finishingDoubles: Record<string, number>
}

// Für einen gesamten Match-Output:
export type X01PerMatchStatsBundle = {
  matchId: string
  players: X01PerMatchPlayerStats[]
}

// -------------------------------------------------------------
// Hilfsfunktionen
// -------------------------------------------------------------

function isGuest(playerId: string, startEvt: MatchStarted | undefined): boolean {
  if (!startEvt) return false
  const p = startEvt.players.find(p => p.playerId === playerId)
  return !!(p && (p.isGuest || String(p.playerId).startsWith('guest:')))
}

// extrahiere Finishing-Dart pro Leg
function collectFinishingDoublesByPlayer(
  events: DartsEvent[],
  outRule: OutRule
): Record<string, Record<string, number>> {
  // result[playerId][checkoutKey] = count
  const out: Record<string, Record<string, number>> = {}

  // Wir brauchen LegFinished (da wissen wir Gewinner + finishingVisitId)
  // und dazugehörige VisitAdded, um den tatsächlichen finalen Dart zu finden.
  const visitsById = new Map<string, VisitAdded>()
  for (const e of events) {
    if (e.type === 'VisitAdded') {
      visitsById.set(e.eventId, e)
    }
  }

  for (const e of events) {
    if (e.type !== 'LegFinished') continue
    const lf = e as LegFinished
    const v = visitsById.get(lf.finishingVisitId)
    if (!v) continue

    // finishingDartSeq gibt an, welcher Dart in der Aufnahme gecheckt hat
    const idx = lf.finishingDartSeq - 1
    const last = v.darts[idx]
    if (!last) continue

    // Doppelfinishes zählen (Doppel oder DBULL)
    if (isDouble(last)) {
      const bedNum =
        last.bed === 'DBULL'
          ? 'BULL' // 50er Doppel -> nennen wir "BULL"
          : String(last.bed) // z. B. "16" für D16

      if (!out[lf.winnerPlayerId]) out[lf.winnerPlayerId] = {}
      out[lf.winnerPlayerId][bedNum] =
        (out[lf.winnerPlayerId][bedNum] ?? 0) + 1
    }
    // Master-Out: auch Triple-Finishes zählen
    else if (outRule === 'master-out' && isTriple(last)) {
      const bedNum = `T${last.bed}`

      if (!out[lf.winnerPlayerId]) out[lf.winnerPlayerId] = {}
      out[lf.winnerPlayerId][bedNum] =
        (out[lf.winnerPlayerId][bedNum] ?? 0) + 1
    }
  }

  return out
}

// zählt Treffer pro Single/Double/Triple-Segment
function collectSegmentHeatmaps(
  events: DartsEvent[]
): {
  doublesHitCount: Record<string, Record<string, number>>
  triplesHitCount: Record<string, Record<string, number>>
  segmentsHitCount: Record<string, Record<string, number>>
} {
  const doublesHitCount: Record<string, Record<string, number>> = {}
  const triplesHitCount: Record<string, Record<string, number>> = {}
  const segmentsHitCount: Record<string, Record<string, number>> = {}

  for (const e of events) {
    if (e.type !== 'VisitAdded') continue
    const v = e as VisitAdded
    for (const d of v.darts) {
      if (d.bed === 'MISS') continue
      if (d.bed === 'BULL' || d.bed === 'DBULL') {
        // wir zählen Bull als Segment "BULL"
        const segKey = d.bed === 'DBULL' ? 'BULL' : 'BULL'
        if (!segmentsHitCount[v.playerId]) segmentsHitCount[v.playerId] = {}
        segmentsHitCount[v.playerId][segKey] =
          (segmentsHitCount[v.playerId][segKey] ?? 0) + 1

        // Double-Bull geht auch in doublesHitCount["BULL"]
        if (d.bed === 'DBULL') {
          if (!doublesHitCount[v.playerId]) doublesHitCount[v.playerId] = {}
          doublesHitCount[v.playerId]['BULL'] =
            (doublesHitCount[v.playerId]['BULL'] ?? 0) + 1
        }
        continue
      }

      const bedNum = String(d.bed) // "20", "19", etc.

      // segmentsHitCount zählt JEDE Berührung dieses Feldes, egal ob S/D/T
      if (!segmentsHitCount[v.playerId]) segmentsHitCount[v.playerId] = {}
      segmentsHitCount[v.playerId][bedNum] =
        (segmentsHitCount[v.playerId][bedNum] ?? 0) + 1

      // doubles?
      if (isDouble(d)) {
        if (!doublesHitCount[v.playerId]) doublesHitCount[v.playerId] = {}
        doublesHitCount[v.playerId][bedNum] =
          (doublesHitCount[v.playerId][bedNum] ?? 0) + 1
      }

      // triples?
      if (isTriple(d)) {
        if (!triplesHitCount[v.playerId]) triplesHitCount[v.playerId] = {}
        triplesHitCount[v.playerId][bedNum] =
          (triplesHitCount[v.playerId][bedNum] ?? 0) + 1
      }
    }
  }

  return { doublesHitCount, triplesHitCount, segmentsHitCount }
}

// Sets / Legs gewonnen aus Events herausziehen
function countLegsAndSetsWon(
  events: DartsEvent[],
  start: MatchStarted | undefined
): {
  legsWonByPlayer: Record<string, number>
  setsWonByPlayer: Record<string, number>
} {
  const legsWonByPlayer: Record<string, number> = {}
  const setsWonByPlayer: Record<string, number> = {}

  if (start) {
    for (const p of start.players) {
      legsWonByPlayer[p.playerId] = 0
      setsWonByPlayer[p.playerId] = 0
    }
  }

  for (const e of events) {
    if (e.type === 'LegFinished') {
      const lf = e as LegFinished
      legsWonByPlayer[lf.winnerPlayerId] =
        (legsWonByPlayer[lf.winnerPlayerId] ?? 0) + 1
    } else if (e.type === 'SetFinished') {
      const sf = e as SetFinished
      setsWonByPlayer[sf.winnerPlayerId] =
        (setsWonByPlayer[sf.winnerPlayerId] ?? 0) + 1
    }
  }

  return { legsWonByPlayer, setsWonByPlayer }
}

// -------------------------------------------------------------
// Hauptfunktion
// -------------------------------------------------------------

export function computeX01PlayerMatchStats(
  matchId: string,
  events: DartsEvent[]
): X01PerMatchStatsBundle {
  if (!events || events.length === 0) {
    return { matchId, players: [] }
  }

  const startEvt = events.find(e => e.type === 'MatchStarted') as MatchStarted | undefined
  const finishEvt = events.find(e => e.type === 'MatchFinished') as MatchFinished | undefined

  const statsBasic = computeStats(events)
  const outRule = startEvt ? getOutRule(startEvt) : 'double-out'
  const { doublesHitCount, triplesHitCount, segmentsHitCount } = collectSegmentHeatmaps(events)
  const finishingDoublesAll = collectFinishingDoublesByPlayer(events, outRule)
  const { legsWonByPlayer, setsWonByPlayer } = countLegsAndSetsWon(events, startEvt)

  const players: X01PerMatchPlayerStats[] = []

  if (startEvt) {
    for (const p of startEvt.players) {
      const pid = p.playerId

      // Gäste NICHT exportieren zur Langzeit-Speicherung
      if (isGuest(pid, startEvt)) continue

      const base = statsBasic[pid]
      if (!base) continue

      const wonMatch = finishEvt
        ? finishEvt.winnerPlayerId === pid
        : false

      players.push({
        playerId: pid,
        playerName: p.name ?? pid,
        matchId,

        wonMatch,
        legsWon: legsWonByPlayer[pid] ?? 0,
        setsWon: setsWonByPlayer[pid] ?? 0,

        dartsThrown: base.dartsThrown,
        pointsScored: base.pointsScored,
        threeDartAvg: base.threeDartAvg,
        first9OverallAvg: base.first9OverallAvg,

        highestCheckout: base.highestCheckout,

        doubleAttemptsDart: base.doubleAttemptsDart,
        doublesHitDart: base.doublesHitDart,
        doublePctDart: base.doublePctDart,

        checkoutAttempts: base.checkoutAttempts,
        checkoutsMade: base.checkoutsMade,
        checkoutPct: base.checkoutPct,

        doublesHitCount: doublesHitCount[pid] ?? {},
        triplesHitCount: triplesHitCount[pid] ?? {},
        segmentsHitCount: segmentsHitCount[pid] ?? {},
        finishingDoubles: finishingDoublesAll[pid] ?? {},
      })
    }
  }

  return { matchId, players }
}
