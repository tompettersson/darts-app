// src/dartsCricket.ts
// Cricket-Engine (Short/Long, Standard & Cutthroat) mit Serien-Support
// - Short:   15–20 + Bull
// - Long:    10–20 + Bull
// - Standard: Overflow-Punkte zum Werfer
// - Cutthroat: Overflow-Punkte an Gegner mit offenem Feld
// Serie: targetWins (direkt) ODER bestOfGames (-> First to floor(n/2)+1)
// Zusätzlich: Leg-Siege, fertige Legs und dynamischer Starter-Index

export type ULID = string
export type ISO8601 = string

export type CricketRange = 'short' | 'long'
export type CricketStyle = 'standard' | 'cutthroat'

export type CricketPlayer = {
  playerId: string
  name?: string
  isGuest?: boolean
  color?: string
}

export type CricketMatchStarted = {
  eventId: ULID
  type: 'CricketMatchStarted'
  ts: ISO8601
  matchId: ULID
  range: CricketRange
  style: CricketStyle
  players: CricketPlayer[]      // Reihenfolge = Wurfreihenfolge
  version: 1
  /** Optional: Länge der Serie als "Best of n" */
  bestOfGames?: number
  /** Optional: Direkt "First to x" */
  targetWins?: number
  /** Optional: Start-Offset (für Starter-Rotation je beendetem Leg) */
  starterIndex?: number
}

// 'MISS' ist ein Dart der nix macht.
export type CricketTurnDart = {
  target: number | 'BULL' | 'MISS'
  mult: 1 | 2 | 3
}

export type CricketTurnAdded = {
  eventId: ULID
  type: 'CricketTurnAdded'
  ts: ISO8601
  matchId: ULID
  playerId: string
  darts: CricketTurnDart[]
}

export type CricketLegFinished = {
  eventId: ULID
  type: 'CricketLegFinished'
  ts: ISO8601
  matchId: ULID
  winnerPlayerId: string
}

export type CricketMatchFinished = {
  eventId: ULID
  type: 'CricketMatchFinished'
  ts: ISO8601
  matchId: ULID
  winnerPlayerId: string
}

export type CricketEvent =
  | CricketMatchStarted
  | CricketTurnAdded
  | CricketLegFinished
  | CricketMatchFinished

/* ---------------- utils ---------------- */

export function id(): ULID {
  return (Date.now().toString(36) + Math.random().toString(36).slice(2, 8)).toUpperCase()
}

export function now(): ISO8601 {
  return new Date().toISOString()
}

/** Targets je Range */
export function targetsFor(range: CricketRange): (number | 'BULL')[] {
  const base = range === 'short'
    ? [15, 16, 17, 18, 19, 20]
    : [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]
  return [...base, 'BULL']
}

/** Anzahl Marks durch diesen Dart */
function hitsOf(target: number | 'BULL', mult: 1|2|3): number {
  if (target === 'BULL') {
    // Triple Bull gibt es faktisch nicht, 3 zählt wie 2
    return mult > 2 ? 2 : mult
  }
  return mult
}

/* ---------------- derived state ---------------- */

export type CricketState = {
  match?: CricketMatchStarted
  events: CricketEvent[]
  players: string[] // Reihenfolge (IDs)

  // pro Spieler pro Target: 0..3 Treffer (3 = geschlossen)
  marksByPlayer: Record<string, Record<string, number>>
  // Punkte:
  // Standard  : eigene Punkte
  // Cutthroat : Strafpunkte, die man kassiert hat
  pointsByPlayer: Record<string, number>

  // Serien/Legs:
  legWinsByPlayer: Record<string, number>
  finishedLegs: number
  /** Aktueller Starter (Rotation: (starterIndex + finishedLegs) % players.length) */
  currentStarterIndex: number
}

/** "First to x" aus Match-Info bestimmen */
export function targetWinsFromMatch(m?: CricketMatchStarted): number | undefined {
  if (!m) return undefined
  if (typeof m.targetWins === 'number') return m.targetWins
  if (typeof m.bestOfGames === 'number') return Math.floor(m.bestOfGames / 2) + 1
  return undefined
}

/**
 * Verteile Overflow-Punkte für einen Dart, der über die 3 Marks hinaus geht
 * bzw. ein Feld trifft, das für den Werfer schon komplett zu ist.
 *
 * style=standard:
 *   Shooter kriegt die Punkte.
 * style=cutthroat:
 *   Jeder Gegner, der das Feld noch offen hat (<3 Marks), kriegt die Strafpunkte.
 */
function awardOverflowPoints(args: {
  style: CricketStyle
  players: string[]
  shooterId: string
  tKey: string
  overflowMarks: number
  marksByPlayer: Record<string, Record<string, number>>
  pointsByPlayer: Record<string, number>
}) {
  const {
    style,
    players,
    shooterId,
    tKey,
    overflowMarks,
    marksByPlayer,
    pointsByPlayer,
  } = args

  // Gibt es überhaupt jemanden, der dieses Feld noch offen hat (<3)?
  const opponents = players.filter(x => x !== shooterId)
  const anyOpponentOpen = opponents.some(op => (marksByPlayer[op][tKey] ?? 0) < 3)
  if (!anyOpponentOpen) return

  // Punktewert pro Overflow-Mark
  const perMark = tKey === 'BULL' ? 25 : parseInt(tKey, 10)
  const pts = overflowMarks * perMark

  if (style === 'standard') {
    // Shooter bekommt Punkte
    pointsByPlayer[shooterId] = (pointsByPlayer[shooterId] ?? 0) + pts
  } else {
    // Cutthroat: Gegner kassieren Punkte (nur die, die noch offen haben)
    for (const op of opponents) {
      if ((marksByPlayer[op][tKey] ?? 0) < 3) {
        pointsByPlayer[op] = (pointsByPlayer[op] ?? 0) + pts
      }
    }
  }
}

/**
 * Events anwenden → aktueller Status
 * Wichtig:
 * - KEIN doppeltes Punkte-Buchen mehr für denselben Dart
 * - Nach CricketLegFinished wird Marks + Punkte für alle Spieler resettet
 *   (= neues Leg startet sauber)
 */
export function applyCricketEvents(all: CricketEvent[]): CricketState {
  const s: CricketState = {
    match: undefined,
    events: all,
    players: [],
    marksByPlayer: {},
    pointsByPlayer: {},
    legWinsByPlayer: {},
    finishedLegs: 0,
    currentStarterIndex: 0,
  }

  const start = all.find(e => e.type === 'CricketMatchStarted') as CricketMatchStarted | undefined
  if (!start) return s

  s.match = start
  s.players = start.players.map(p => p.playerId)

  const tKeys = targetsFor(start.range).map(String)
  const validKey = new Set(tKeys)

  // init
  for (const pid of s.players) {
    s.marksByPlayer[pid] = {}
    for (const t of tKeys) s.marksByPlayer[pid][t] = 0
    s.pointsByPlayer[pid] = 0
    s.legWinsByPlayer[pid] = 0
  }

  // Starter-Rotation
  const baseStarter = start.starterIndex ?? 0
  s.finishedLegs = 0
  s.currentStarterIndex =
    s.players.length > 0 ? (baseStarter + s.finishedLegs) % s.players.length : 0

  for (const ev of all) {
    if (ev.type === 'CricketLegFinished') {
      // Leg-Sieg eintragen
      s.legWinsByPlayer[ev.winnerPlayerId] =
        (s.legWinsByPlayer[ev.winnerPlayerId] ?? 0) + 1

      // Serienstarter updaten
      s.finishedLegs += 1
      s.currentStarterIndex =
        s.players.length > 0
          ? (baseStarter + s.finishedLegs) % s.players.length
          : 0

      // Neues Leg beginnt -> Marks & Punkte resetten
      for (const pid of s.players) {
        for (const t of tKeys) s.marksByPlayer[pid][t] = 0
        s.pointsByPlayer[pid] = 0
      }
      continue
    }

    if (ev.type !== 'CricketTurnAdded') continue

    const pid = ev.playerId
    if (!s.marksByPlayer[pid]) continue

    for (const d of ev.darts) {
      if (d.target === 'MISS') continue

      // Bull: Triple Bull (mult=3) wird wie Double Bull (mult=2)
      const mult = d.target === 'BULL' && d.mult === 3 ? 2 : d.mult
      const tKey = String(d.target)
      if (!validKey.has(tKey)) continue

      const beforeMarks = s.marksByPlayer[pid][tKey] ?? 0
      const hitMarks = hitsOf(d.target, mult)

      if (beforeMarks >= 3) {
        // Feld war schon komplett geschlossen -> ALLE Marks sind Overflow
        awardOverflowPoints({
          style: start.style,
          players: s.players,
          shooterId: pid,
          tKey,
          overflowMarks: hitMarks,
          marksByPlayer: s.marksByPlayer,
          pointsByPlayer: s.pointsByPlayer,
        })
        // Marks bleiben auf 3
        continue
      }

      // Feld ist noch nicht komplett zu -> wir schließen bis zu 3
      const spaceToClose = Math.max(0, 3 - beforeMarks)      // wie viel fehlt noch bis 3
      const closingHits = Math.min(spaceToClose, hitMarks)   // Hits, die für's Schließen gehen
      const afterMarks = Math.min(3, beforeMarks + closingHits)
      s.marksByPlayer[pid][tKey] = afterMarks

      // ÜBER 3 hinaus? -> Overflow
      const overflowHitsFromUnclosed = hitMarks - closingHits
      if (overflowHitsFromUnclosed > 0) {
        awardOverflowPoints({
          style: start.style,
          players: s.players,
          shooterId: pid,
          tKey,
          overflowMarks: overflowHitsFromUnclosed,
          marksByPlayer: s.marksByPlayer,
          pointsByPlayer: s.pointsByPlayer,
        })
      }
    }
  }

  return s
}

/** Aktueller Spieler mit Starter-Rotation je beendetem Leg */
export function currentPlayerId(state: CricketState): string | undefined {
  if (!state.match) return undefined
  // Turns IM AKTUELLEN LEG zählen (ab letztem LegFinished rückwärts)
  let turnsInCurrentLeg = 0
  for (let i = state.events.length - 1; i >= 0; i--) {
    const ev = state.events[i]
    if (ev.type === 'CricketLegFinished') break
    if (ev.type === 'CricketTurnAdded') turnsInCurrentLeg++
  }
  const idx = state.players.length > 0
    ? (state.currentStarterIndex + (turnsInCurrentLeg % state.players.length)) % state.players.length
    : 0
  return state.players[idx]
}

/**
 * Einen Turn erzeugen und (optional, falls komplett) Gewinner des Legs bestimmen.
 * Das macht KEINE Seiteneffekte, sondern gibt nur das Event + winnerId zurück.
 */
export function recordCricketTurn(args: {
  state: CricketState
  playerId: string
  darts: CricketTurnDart[]
}): { event: CricketTurnAdded; winnerId?: string } {
  const ev: CricketTurnAdded = {
    eventId: id(),
    type: 'CricketTurnAdded',
    ts: now(),
    matchId: args.state.match?.matchId ?? id(),
    playerId: args.playerId,
    darts: args.darts.map(d => ({
      target: d.target,
      mult:
        d.target === 'BULL' && d.mult === 3
          ? 2
          : d.target === 'MISS'
          ? 1
          : d.mult,
    })),
  }

  // Check Winner im hypothetischen State NACH diesem Turn
  const tmp = applyCricketEvents([...args.state.events, ev])
  const m = tmp.match!
  const tKeys = targetsFor(m.range).map(String)

  // Hat Spieler alle Felder zu?
  const closedAll = (pid: string) =>
    tKeys.every(t => (tmp.marksByPlayer[pid][t] ?? 0) >= 3)

  let winner: string | undefined
  for (const pid of tmp.players) {
    if (!closedAll(pid)) continue
    const my = tmp.pointsByPlayer[pid] ?? 0
    const others = tmp.players.filter(x => x !== pid).map(x => tmp.pointsByPlayer[x] ?? 0)

    if (m.style === 'standard') {
      // Gewinner = alle Felder zu UND >= alle Gegner
      if (others.every(o => my >= o)) { winner = pid; break }
    } else {
      // Cutthroat: alle Felder zu UND <= alle Gegner
      if (others.every(o => my <= o)) { winner = pid; break }
    }
  }

  return { event: ev, winnerId: winner }
}

/** Serienkontext + Starterinfos */
export function currentLegContext(state: CricketState): {
  legWinsByPlayer: Record<string, number>
  finishedLegs: number
  currentStarterIndex: number
  targetWins?: number
} {
  return {
    legWinsByPlayer: state.legWinsByPlayer,
    finishedLegs: state.finishedLegs,
    currentStarterIndex: state.currentStarterIndex,
    targetWins: targetWinsFromMatch(state.match),
  }
}

/** Serie gewonnen? */
export function isSeriesWon(state: CricketState, winnerId: string): boolean {
  const need = targetWinsFromMatch(state.match)
  if (!need) return false
  const wins = state.legWinsByPlayer[winnerId] ?? 0
  return wins >= need
}
