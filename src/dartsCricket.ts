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
export type CricketStyle = 'standard' | 'cutthroat' | 'simple' | 'crazy'
export type CutthroatEndgame = 'standard' | 'suddenDeath'
export type CrazyMode = 'normal' | 'pro'
export type CrazyScoringMode = 'standard' | 'cutthroat' | 'simple'

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
  /** Cutthroat Endgame-Regel (nur bei style='cutthroat') */
  cutthroatEndgame?: CutthroatEndgame
  /** Crazy-Modus (nur bei style='crazy'): 'normal' = 1 Ziel/Runde, 'pro' = 3 Ziele/Runde */
  crazyMode?: CrazyMode
  /** Crazy mit Punkten: Overflow-Punkte werden vergeben wie bei Standard Cricket (legacy, bevorzugt crazyScoringMode) */
  crazyWithPoints?: boolean
  /** Crazy gleiche Zahl für alle: Alle Spieler haben dieselbe Zielzahl pro Runde */
  crazySameForAll?: boolean
  /** Zufälliger Salt für Crazy-Modus (wird beim Match-Start generiert) */
  crazySalt?: number
  /** Crazy Punkteverteilung: 'standard' = Shooter bekommt Punkte, 'cutthroat' = Gegner bekommen Strafpunkte, 'simple' = keine Punkte */
  crazyScoringMode?: CrazyScoringMode
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

/* ---------------- Type Guards ---------------- */

export function isCricketMatchStarted(e: CricketEvent): e is CricketMatchStarted {
  return e.type === 'CricketMatchStarted'
}

export function isCricketTurnAdded(e: CricketEvent): e is CricketTurnAdded {
  return e.type === 'CricketTurnAdded'
}

export function isCricketLegFinished(e: CricketEvent): e is CricketLegFinished {
  return e.type === 'CricketLegFinished'
}

export function isCricketMatchFinished(e: CricketEvent): e is CricketMatchFinished {
  return e.type === 'CricketMatchFinished'
}

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

/** Deterministischer Pseudo-Zufallsgenerator (Mulberry32) */
function seededRandom(seed: number): () => number {
  return function() {
    let t = seed += 0x6D2B79F5
    t = Math.imul(t ^ t >>> 15, t | 1)
    t ^= t + Math.imul(t ^ t >>> 7, t | 61)
    return ((t ^ t >>> 14) >>> 0) / 4294967296
  }
}

/** Simple Hash für Strings -> Seed */
function hashString(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash
  }
  return Math.abs(hash)
}

/**
 * Generiert Zielzahlen für Crazy Cricket
 * @param mode 'normal' = 1 Ziel, 'pro' = 3 Ziele
 * @param availableTargets Noch nicht von allen geschlossene Zahlen
 * @param salt Zufälliger Salt (beim Match-Start generiert)
 * @param roundNumber Aktuelle Rundennummer für Seed
 */
function generateCrazyTargets(
  mode: CrazyMode,
  availableTargets: string[],
  salt: number,
  roundNumber: number
): string[] {
  if (availableTargets.length === 0) return []

  // Salt + roundNumber für echten Zufall bei jedem Match
  const seed = salt + roundNumber * 7919 // 7919 ist eine Primzahl für gute Verteilung
  const random = seededRandom(seed)

  const count = mode === 'pro' ? 3 : 1
  const targets: string[] = []

  for (let i = 0; i < count; i++) {
    const idx = Math.floor(random() * availableTargets.length)
    targets.push(availableTargets[idx])
  }

  return targets
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

  // Cutthroat Endgame-Tracking:
  /** true wenn ein Spieler alle Felder geschlossen hat */
  endgameActive: boolean
  /** Wer hat das Endgame ausgelöst (alle Felder zu) */
  endgameTriggeredByPlayer?: string
  /** Turn-Index als das Endgame aktiviert wurde */
  endgameTriggerTurnIndex?: number
  /** Für Standard-Endgame: verbleibende Runden (3, 2, 1, 0) */
  endgameRoundsRemaining?: number
  /** Für Sudden Death: Anzahl Bull-Treffer seit Endgame-Start (0-5) */
  endgameBullHits?: number

  // Crazy Cricket:
  /** Aktuelle Zielzahlen für Crazy-Modus (Normal: 1 Eintrag, Pro: 3 Einträge) */
  currentCrazyTargets?: string[]
  /** Aktuelle Rundennummer für Seed-Berechnung */
  currentRoundNumber?: number
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
 * style=crazy + crazyWithPoints:
 *   Wie Standard: Shooter kriegt die Punkte.
 */
function awardOverflowPoints(args: {
  style: CricketStyle
  players: string[]
  shooterId: string
  tKey: string
  overflowMarks: number
  marksByPlayer: Record<string, Record<string, number>>
  pointsByPlayer: Record<string, number>
  crazyWithPoints?: boolean
  crazyScoringMode?: CrazyScoringMode
}) {
  const {
    style,
    players,
    shooterId,
    tKey,
    overflowMarks,
    marksByPlayer,
    pointsByPlayer,
    crazyWithPoints,
    crazyScoringMode,
  } = args

  // Gibt es überhaupt jemanden, der dieses Feld noch offen hat (<3)?
  const opponents = players.filter(x => x !== shooterId)
  const anyOpponentOpen = opponents.some(op => (marksByPlayer[op][tKey] ?? 0) < 3)
  if (!anyOpponentOpen) return

  // Punktewert pro Overflow-Mark
  const perMark = tKey === 'BULL' ? 25 : parseInt(tKey, 10)
  const pts = overflowMarks * perMark

  if (style === 'simple') {
    // Simple: Keine Punkte
    return
  } else if (style === 'crazy') {
    // Crazy: Verwende crazyScoringMode (mit Fallback auf legacy crazyWithPoints)
    const scoringMode = crazyScoringMode ?? (crazyWithPoints ? 'standard' : 'simple')

    if (scoringMode === 'simple') {
      // Crazy ohne Punkte: Keine Punkte
      return
    } else if (scoringMode === 'cutthroat') {
      // Crazy Cutthroat: Gegner kassieren Punkte
      for (const op of opponents) {
        if ((marksByPlayer[op][tKey] ?? 0) < 3) {
          pointsByPlayer[op] = (pointsByPlayer[op] ?? 0) + pts
        }
      }
    } else {
      // Crazy Standard: Shooter bekommt Punkte
      pointsByPlayer[shooterId] = (pointsByPlayer[shooterId] ?? 0) + pts
    }
  } else if (style === 'standard') {
    // Standard: Shooter bekommt Punkte
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
    // Endgame-Tracking
    endgameActive: false,
    endgameTriggeredByPlayer: undefined,
    endgameTriggerTurnIndex: undefined,
    endgameRoundsRemaining: undefined,
    endgameBullHits: undefined,
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

  let turnIndex = 0
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

      // Neues Leg beginnt -> Marks & Punkte & Endgame resetten
      for (const pid of s.players) {
        for (const t of tKeys) s.marksByPlayer[pid][t] = 0
        s.pointsByPlayer[pid] = 0
      }
      // Endgame zurücksetzen
      s.endgameActive = false
      s.endgameTriggeredByPlayer = undefined
      s.endgameTriggerTurnIndex = undefined
      s.endgameRoundsRemaining = undefined
      s.endgameBullHits = undefined
      turnIndex = 0
      continue
    }

    if (ev.type !== 'CricketTurnAdded') continue

    const pid = ev.playerId
    if (!s.marksByPlayer[pid]) continue

    // Crazy Cricket: Berechne aktive Zielzahlen für diesen Turn
    let crazyTargets: string[] | undefined
    if (start.style === 'crazy' && start.crazyMode) {
      // Bei crazySameForAll: Alle Spieler haben dieselbe Zielzahl pro Runde
      // Bei !crazySameForAll (default): Jeder Spieler bekommt eigene Zielzahl
      const sameForAll = start.crazySameForAll ?? true // Default: gleich für alle

      // Verfügbare Zahlen:
      // - Bei sameForAll: Nur global offene Zahlen (mindestens ein Spieler hat sie noch offen)
      // - Bei !sameForAll: Zusätzlich muss der aktive Spieler sie noch offen haben
      const availableTargets = sameForAll
        ? tKeys.filter(t => s.players.some(p => (s.marksByPlayer[p][t] ?? 0) < 3))
        : tKeys.filter(t =>
            s.players.some(p => (s.marksByPlayer[p][t] ?? 0) < 3) && // global offen
            (s.marksByPlayer[pid][t] ?? 0) < 3 // aktiver Spieler hat noch nicht geschlossen
          )

      if (availableTargets.length > 0) {
        // Bei sameForAll: Seed basiert auf Spielrunde (turnIndex / Spielerzahl)
        // Bei !sameForAll: Seed basiert auf turnIndex (jeder Turn hat eigene Zahl)
        const seedNumber = sameForAll
          ? Math.floor(turnIndex / s.players.length)
          : turnIndex

        // Salt für echten Zufall (beim Match-Start generiert), Fallback auf matchId-Hash
        // NEU: Leg-Index einbeziehen für unterschiedliche Reihenfolge pro Leg
        const baseSalt = start.crazySalt ?? hashString(start.matchId)
        const legFactor = s.finishedLegs * 1000003 // Primzahl für gute Verteilung
        const salt = baseSalt + legFactor

        crazyTargets = generateCrazyTargets(
          start.crazyMode,
          availableTargets,
          salt,
          seedNumber
        )
        s.currentCrazyTargets = crazyTargets
        s.currentRoundNumber = turnIndex
      }
    }

    for (let dartIdx = 0; dartIdx < ev.darts.length; dartIdx++) {
      const d = ev.darts[dartIdx]
      if (d.target === 'MISS') continue

      // Bull: Triple Bull (mult=3) wird wie Double Bull (mult=2)
      const mult = d.target === 'BULL' && d.mult === 3 ? 2 : d.mult
      const tKey = String(d.target)
      if (!validKey.has(tKey)) continue

      // Crazy Cricket: Nur aktive Zielzahl(en) zählen
      if (crazyTargets) {
        // Pro-Modus: Jeder Dart hat sein eigenes Ziel
        // Normal-Modus: Alle Darts haben dasselbe Ziel (Index 0)
        const activeTarget = start.crazyMode === 'pro'
          ? crazyTargets[dartIdx] ?? crazyTargets[0]
          : crazyTargets[0]
        if (tKey !== activeTarget) continue // Kein Treffer auf aktive Zahl
      }

      const beforeMarks = s.marksByPlayer[pid][tKey] ?? 0
      const hitMarks = hitsOf(d.target, mult)

      if (beforeMarks >= 3) {
        // Feld war schon komplett geschlossen -> ALLE Marks sind Overflow
        // Sudden Death: Nur Bull gibt Punkte
        const isSuddenDeath = s.endgameActive && start.cutthroatEndgame === 'suddenDeath'
        if (!isSuddenDeath || tKey === 'BULL') {
          awardOverflowPoints({
            style: start.style,
            players: s.players,
            shooterId: pid,
            tKey,
            overflowMarks: hitMarks,
            marksByPlayer: s.marksByPlayer,
            pointsByPlayer: s.pointsByPlayer,
            crazyWithPoints: start.crazyWithPoints,
            crazyScoringMode: start.crazyScoringMode,
          })
        }
        // Sudden Death: Bull-Hits zählen (auch wenn Bull schon geschlossen ist!)
        if (s.endgameActive && start.cutthroatEndgame === 'suddenDeath' && d.target === 'BULL') {
          const bullHits = mult === 2 ? 2 : 1
          s.endgameBullHits = (s.endgameBullHits ?? 0) + bullHits
        }
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
        // Sudden Death: Nur Bull gibt Punkte
        const isSuddenDeath = s.endgameActive && start.cutthroatEndgame === 'suddenDeath'
        if (!isSuddenDeath || tKey === 'BULL') {
          awardOverflowPoints({
            style: start.style,
            players: s.players,
            shooterId: pid,
            tKey,
            overflowMarks: overflowHitsFromUnclosed,
            marksByPlayer: s.marksByPlayer,
            pointsByPlayer: s.pointsByPlayer,
            crazyWithPoints: start.crazyWithPoints,
            crazyScoringMode: start.crazyScoringMode,
          })
        }
      }

      // Sudden Death: Bull-Hits zählen
      if (s.endgameActive && start.cutthroatEndgame === 'suddenDeath') {
        if (d.target === 'BULL') {
          // BULL = 1 Hit, DBULL (mult=2) = 2 Hits
          const bullHits = mult === 2 ? 2 : 1
          s.endgameBullHits = (s.endgameBullHits ?? 0) + bullHits
        }
      }
    }

    // Nach diesem Turn: Endgame-Check für Cutthroat
    if (start.style === 'cutthroat' && start.cutthroatEndgame && !s.endgameActive) {
      // Prüfe ob dieser Spieler alle Felder geschlossen hat
      const allClosed = tKeys.every(t => (s.marksByPlayer[pid][t] ?? 0) >= 3)
      if (allClosed) {
        s.endgameActive = true
        s.endgameTriggeredByPlayer = pid
        s.endgameTriggerTurnIndex = turnIndex

        if (start.cutthroatEndgame === 'standard') {
          // Standard: 3 Runden für die anderen
          s.endgameRoundsRemaining = 3
        } else {
          // Sudden Death: Bull-Counter starten
          s.endgameBullHits = 0
        }
      }
    }

    // Standard-Endgame: Runden zählen
    if (s.endgameActive && start.cutthroatEndgame === 'standard' && s.endgameTriggerTurnIndex !== undefined) {
      // Runden = vollständige Umläufe seit Endgame-Start
      const turnsSinceTrigger = turnIndex - s.endgameTriggerTurnIndex
      const completedRounds = Math.floor(turnsSinceTrigger / s.players.length)
      s.endgameRoundsRemaining = Math.max(0, 3 - completedRounds)
    }

    turnIndex++
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

  // Hilfsfunktion: Spieler mit wenigsten Punkten finden
  const findPlayerWithLowestPoints = (): string => {
    let minPid = tmp.players[0]
    let minPts = tmp.pointsByPlayer[minPid] ?? 0
    for (const pid of tmp.players) {
      const pts = tmp.pointsByPlayer[pid] ?? 0
      if (pts < minPts) {
        minPts = pts
        minPid = pid
      }
    }
    return minPid
  }

  let winner: string | undefined

  // Cutthroat Endgame-Check (Standard: 3 Runden, Sudden Death: 5 Bulls)
  if (m.style === 'cutthroat' && m.cutthroatEndgame && tmp.endgameActive) {
    if (m.cutthroatEndgame === 'standard' && (tmp.endgameRoundsRemaining ?? 3) <= 0) {
      // Standard-Endgame: 3 Runden vorbei → wenigste Punkte gewinnt
      winner = findPlayerWithLowestPoints()
      return { event: ev, winnerId: winner }
    }

    if (m.cutthroatEndgame === 'suddenDeath' && (tmp.endgameBullHits ?? 0) >= 5) {
      // Sudden Death: 5 Bulls erreicht → wenigste Punkte gewinnt
      winner = findPlayerWithLowestPoints()
      return { event: ev, winnerId: winner }
    }
  }

  // Gewinner-Check basierend auf Spielmodus
  for (const pid of tmp.players) {
    if (!closedAll(pid)) continue

    // Crazy-Modus: Verwende crazyScoringMode (mit Fallback auf legacy crazyWithPoints)
    const crazyScoringMode = m.crazyScoringMode ?? (m.crazyWithPoints ? 'standard' : 'simple')

    if (m.style === 'simple' || (m.style === 'crazy' && crazyScoringMode === 'simple')) {
      // Simple/Crazy ohne Punkte: Erste Person mit allen Feldern zu gewinnt sofort
      winner = pid
      break
    }

    const my = tmp.pointsByPlayer[pid] ?? 0
    const others = tmp.players.filter(x => x !== pid).map(x => tmp.pointsByPlayer[x] ?? 0)

    if (m.style === 'standard' || (m.style === 'crazy' && crazyScoringMode === 'standard')) {
      // Standard oder Crazy mit Standard-Punkten: alle Felder zu UND >= alle Gegner (Punkte)
      if (others.every(o => my >= o)) { winner = pid; break }
    } else if (m.style === 'cutthroat' || (m.style === 'crazy' && crazyScoringMode === 'cutthroat')) {
      // Cutthroat oder Crazy mit Cutthroat-Punkten: alle Felder zu UND <= alle Gegner (wenigste Punkte)
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
