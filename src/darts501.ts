// src/darts501.ts
// Darts Engine – X01 mit In/Out-Regeln (Double-In / Straight-In + Single/Double/Master-Out)
// Enthält: Visit- & Dart-basierte Checkout-Stats, First-9, Highscores, Routen

export type ULID = string
export type ISO8601 = string

/** Player-Referenz für Events. Optional: Gast-Markierung und UI-Farbe. */
export type PlayerRef = {
  playerId: string
  name?: string
  /** true = flüchtiger Gast (nicht in Profile/Leaderboards aggregieren) */
  isGuest?: boolean
  /** optionale UI-Farbe (z. B. für Namens-Badge) */
  color?: string
}

export type Bed =
  | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10
  | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20
  | 'BULL' | 'DBULL' | 'MISS'
export type Mult = 1 | 2 | 3

export type Dart = {
  seq: 1 | 2 | 3
  bed: Bed
  mult: Mult
  /** optional: wohin gezielt – nutzbar für spätere Features */
  aim?: { bed: Bed; mult: Mult }
}

/* ----------------- In/Out-Regeln ----------------- */
export type InRule = 'straight-in' | 'double-in'
export type OutRule = 'single-out' | 'double-out' | 'master-out'

/* ----------------- Core Events ----------------- */
export type VisitAdded = {
  eventId: ULID
  type: 'VisitAdded'
  ts: ISO8601
  matchId: ULID
  legId: ULID
  playerId: string
  darts: (Dart & { score: number })[]
  visitScore: number
  remainingBefore: number
  remainingAfter: number
  bust: boolean
  finishingDartSeq?: 1 | 2 | 3
}

export type MatchStarted = {
  eventId: ULID
  type: 'MatchStarted'
  ts: ISO8601
  matchId: ULID
  mode:
    | '121-double-out'
    | '301-double-out'
    | '501-double-out'
    | '701-double-out'
    | '901-double-out'
  structure:
    | { kind: 'legs'; bestOfLegs?: number }
    | { kind: 'sets'; legsPerSet: number; bestOfSets: number }
  startingScorePerLeg: 121 | 301 | 501 | 701 | 901
  players: PlayerRef[]
  bullThrow: { winnerPlayerId: string }
  version: 1
  /** Neu (optional für Backwards-Compat): */
  inRule?: InRule
  outRule?: OutRule
}

export type LegStarted = {
  eventId: ULID
  type: 'LegStarted'
  ts: ISO8601
  matchId: ULID
  legId: ULID
  legIndex: number
  starterPlayerId: string
}

export type LegFinished = {
  eventId: ULID
  type: 'LegFinished'
  ts: ISO8601
  matchId: ULID
  legId: ULID
  winnerPlayerId: string
  finishingVisitId: ULID
  finishingDartSeq: 1 | 2 | 3
  highestCheckoutThisLeg: number
}

export type MatchFinished = {
  eventId: ULID
  type: 'MatchFinished'
  ts: ISO8601
  matchId: ULID
  winnerPlayerId: string
}

export type EventReverted = {
  eventId: ULID
  type: 'EventReverted'
  ts: ISO8601
  matchId: ULID
  targetEventId: ULID
  scope: 'last-dart' | 'last-visit'
  reason?: string
}

/* ----------------- Set Events ----------------- */
export type SetStarted = {
  eventId: ULID
  type: 'SetStarted'
  ts: ISO8601
  matchId: ULID
  setIndex: number
}

export type SetFinished = {
  eventId: ULID
  type: 'SetFinished'
  ts: ISO8601
  matchId: ULID
  setIndex: number
  winnerPlayerId: string
}

/* ----------------- Event Union ----------------- */
export type DartsEvent =
  | MatchStarted
  | SetStarted
  | SetFinished
  | LegStarted
  | VisitAdded
  | LegFinished
  | MatchFinished
  | EventReverted

/* ----------------- utils ----------------- */
export function id(): ULID {
  return (Date.now().toString(36) + Math.random().toString(36).slice(2, 8)).toUpperCase()
}
export function now(): ISO8601 {
  return new Date().toISOString()
}
export function scoreOf(d: Dart): number {
  if (d.bed === 'DBULL') return 50
  if (d.bed === 'BULL') return 25
  if (d.bed === 'MISS') return 0
  return (d.bed as number) * d.mult
}
export function isDouble(d: Dart) {
  return d.bed === 'DBULL' || (typeof d.bed === 'number' && d.mult === 2)
}
export function isTriple(d: Dart) {
  return typeof d.bed === 'number' && d.mult === 3
}

/* ----------------- Event Type Guards ----------------- */
// Diese Type Guards ermöglichen type-safe Event-Filterung ohne `as any`

export function isMatchStarted(e: DartsEvent): e is MatchStarted {
  return e.type === 'MatchStarted'
}

export function isLegStarted(e: DartsEvent): e is LegStarted {
  return e.type === 'LegStarted'
}

export function isLegFinished(e: DartsEvent): e is LegFinished {
  return e.type === 'LegFinished'
}

export function isMatchFinished(e: DartsEvent): e is MatchFinished {
  return e.type === 'MatchFinished'
}

export function isVisitAdded(e: DartsEvent): e is VisitAdded {
  return e.type === 'VisitAdded'
}

export function isSetStarted(e: DartsEvent): e is SetStarted {
  return e.type === 'SetStarted'
}

export function isSetFinished(e: DartsEvent): e is SetFinished {
  return e.type === 'SetFinished'
}

export function isEventReverted(e: DartsEvent): e is EventReverted {
  return e.type === 'EventReverted'
}
export function isBull50(d: Dart) {
  return d.bed === 'DBULL'
}
export function requiredToWin(bestOf: number) {
  return Math.floor(bestOf / 2) + 1
}

/** Backwards-Compat: Regeln aus Feldern bzw. aus `mode` ableiten */
export function getInRule(m: MatchStarted): InRule {
  return m.inRule ?? 'straight-in'
}
export function getOutRule(m: MatchStarted): OutRule {
  if (m.outRule) return m.outRule
  if (m.mode.endsWith('double-out')) return 'double-out'
  return 'single-out'
}
function finishAllowed(outRule: OutRule, last: Dart): boolean {
  if (outRule === 'double-out') return isDouble(last)
  if (outRule === 'master-out') return isDouble(last) || isTriple(last) || isBull50(last)
  return true // single-out
}

/* ===== LIVE-Checkout-Helpers (für Dart- und Visit-Logik) ===== */

// Board-Nachbarn pro Sektor (im Uhrzeigersinn)
const SECTOR_NEIGHBORS: Record<number, [number, number]> = {
  20:[1,5], 1:[20,18], 18:[1,4], 4:[18,13], 13:[4,6],
  6:[13,10], 10:[6,15], 15:[10,2], 2:[15,17], 17:[2,3],
  3:[17,19], 19:[3,7], 7:[19,16], 16:[7,8], 8:[16,11],
  11:[8,14], 14:[11,9], 9:[14,12], 12:[9,5], 5:[12,20],
}

// „Unmögliche" Finishes bei Double-Out
const IMPOSSIBLE_DO = new Set([169, 168, 166, 165, 163, 162, 159])

function isCheckoutNumber(rem: number, outRule: OutRule): boolean {
  if (rem <= 1 || rem > 170) return false
  return outRule === 'double-out' ? !IMPOSSIBLE_DO.has(rem) : true
}

/**
 * Prüft, ob der Rest ein DIREKTER Double-Checkout ist.
 * Das heißt: Mit einem einzigen Wurf auf ein Doppelfeld kann man auschecken.
 *
 * Bei Double-Out / Master-Out:
 * - 50 (D25/Bull)
 * - Gerade Zahlen 2-40 (D1 bis D20)
 *
 * Ungerade Reste (z.B. 35) erfordern erst ein "Stellen" → kein Doppelversuch.
 */
function isDirectDoubleCheckout(rem: number, outRule: OutRule): boolean {
  if (outRule === 'single-out') return false
  if (rem === 50) return true
  if (rem >= 2 && rem <= 40 && rem % 2 === 0) return true
  return false
}

/**
 * Prüft, ob ein einzelner Dart d bei Rest liveRem ein echter Kill-Versuch war
 * (kein Setup, sondern klarer Versuch das Leg zu beenden).
 *
 * Regeln:
 * - double-out/master-out:
 *   * bei geradem Rest R: Ziel ist D(R/2)
 *       D(R/2)            => Versuch
 *       S(R/2)            => Versuch (innen gehangen)
 *       S(Nachbar R/2)    => Versuch (knapp daneben)
 *   * bei Rest 50:
 *       DBULL             => Versuch
 *       MISS              => Versuch (knapp daneben am Bull)
 *       (Single Bull NICHT zwingend Versuch -> Stellen erlauben)
 *   * master-out zusätzlich:
 *       exakter Triple-Kill (Wenn liveRem == bed*3 && mult===3)
 *
 * - single-out: wir zählen gar keine Double-Versuche.
 */
function countsAsDoubleAttempt(liveRem: number, d: Dart, outRule: OutRule): boolean {
  if (outRule === 'single-out') return false

  if (!isCheckoutNumber(liveRem, outRule)) return false

  // Bull-Finish bei 50 Rest
  if (liveRem === 50) {
    if (d.bed === 'DBULL') return true
    if (d.bed === 'MISS') return true
    return false
  }

  // Standard Double/Master-Out bei geradem Rest
  if (liveRem % 2 === 0) {
    const target = liveRem / 2

    // Doppel genau getroffen
    if (typeof d.bed === 'number' && d.bed === target && d.mult === 2) return true

    // "innen hängen geblieben": Single gleiche Zahl
    if (typeof d.bed === 'number' && d.bed === target && d.mult === 1) return true

    // "knapp daneben": Single Nachbar auf dem Board
    if (typeof d.bed === 'number' && d.mult === 1) {
      const nb = SECTOR_NEIGHBORS[target]
      if (nb && (d.bed === nb[0] || d.bed === nb[1])) return true
    }

    // Master-Out erlaubt direkte Triple-Finishes
    if (outRule === 'master-out' && typeof d.bed === 'number' && d.mult === 3) {
      if (liveRem === d.bed * 3) return true
    }

    return false
  }

  // Ungerade Reste: normal kein direkter Doppel-Finish-Versuch
  if (outRule === 'master-out' && typeof d.bed === 'number' && d.mult === 3) {
    if (liveRem === d.bed * 3) return true
  }

  return false
}

/* ----------------- Derived State ----------------- */
export type DerivedLegState = {
  legId: ULID
  remainingByPlayer: Record<string, number>
  visits: VisitAdded[]
  winnerPlayerId?: string
  /** Double-In Fortschritt pro Spieler; bei straight-in automatisch true */
  inByPlayer?: Record<string, boolean>
}

export type DerivedSetState = {
  setIndex: number
  legsWonByPlayer: Record<string, number>
  winnerPlayerId?: string
}

export type DerivedMatchState = {
  match?: MatchStarted
  sets: DerivedSetState[]
  legs: DerivedLegState[]
  finished?: MatchFinished
  events: DartsEvent[]
}

/* ----------------- Reducer ----------------- */
export function applyEvents(all: DartsEvent[]): DerivedMatchState {
  const reverted = new Set<ULID>()
  for (const e of all) if (e.type === 'EventReverted') reverted.add(e.targetEventId)
  const events = all.filter((e) => !reverted.has(e.eventId))

  const state: DerivedMatchState = { match: undefined, sets: [], legs: [], events }
  const legMap = new Map<ULID, DerivedLegState>()

  const ensureCurrentSet = (setIndex: number) => {
    let s = state.sets.find((x) => x.setIndex === setIndex)
    if (!s && state.match) {
      s = {
        setIndex,
        legsWonByPlayer: Object.fromEntries(state.match.players.map((p) => [p.playerId, 0])),
      }
      state.sets.push(s)
    }
    return s
  }

  for (const ev of events) {
    switch (ev.type) {
      case 'MatchStarted':
        state.match = ev
        break
      case 'SetStarted':
        ensureCurrentSet(ev.setIndex)
        break
      case 'SetFinished': {
        const s = ensureCurrentSet(ev.setIndex)
        if (s) s.winnerPlayerId = ev.winnerPlayerId
        break
      }
      case 'LegStarted': {
        const leg: DerivedLegState = {
          legId: ev.legId,
          remainingByPlayer: Object.fromEntries(
            state.match!.players.map((p) => [p.playerId, state.match!.startingScorePerLeg])
          ),
          visits: [],
          inByPlayer: Object.fromEntries(
            state.match!.players.map((p) => [p.playerId, getInRule(state.match!) === 'straight-in'])
          ),
        }
        legMap.set(ev.legId, leg)
        state.legs.push(leg)
        break
      }
      case 'VisitAdded': {
        const leg = legMap.get(ev.legId)
        if (!leg) break
        leg.visits.push(ev)
        leg.remainingByPlayer = { ...leg.remainingByPlayer, [ev.playerId]: ev.remainingAfter }

        // Double-In Fortschritt (falls noch nicht „in“)
        if (leg.inByPlayer && !leg.inByPlayer[ev.playerId]) {
          if (ev.darts.some((d) => isDouble(d))) {
            leg.inByPlayer[ev.playerId] = true
          }
        }
        break
      }
      case 'LegFinished': {
        const leg = legMap.get(ev.legId)
        if (leg) {
          leg.winnerPlayerId = ev.winnerPlayerId
          const curSet = state.sets.length ? state.sets[state.sets.length - 1] : ensureCurrentSet(1)!
          curSet.legsWonByPlayer[ev.winnerPlayerId] =
            (curSet.legsWonByPlayer[ev.winnerPlayerId] ?? 0) + 1
        }
        break
      }
      case 'MatchFinished':
        state.finished = ev
        break
    }
  }
  return state
}

/* ----------------- Recording a visit ----------------- */
export function recordVisit({
  match,
  leg,
  playerId,
  darts,
}: {
  match: MatchStarted
  leg: DerivedLegState
  playerId: string
  darts: Dart[]
}) {
  const visitId = id()
  const ts = now()
  const before = leg.remainingByPlayer[playerId]
  const inRule = getInRule(match)
  const outRule = getOutRule(match)

  const legInMap = leg.inByPlayer ?? {}
  let isIn = inRule === 'straight-in' ? true : !!legInMap[playerId]

  let tmp = before
  let bust = false
  let finDart: 1 | 2 | 3 | undefined
  const thrown: (Dart & { score: number })[] = []

  for (let i = 0; i < darts.length && i < 3; i++) {
    const base = darts[i]

    // Double-In: Score ist 0 wenn noch nicht "in"
    let effectiveScore = scoreOf(base)
    if (inRule === 'double-in' && !isIn) {
      if (isDouble(base)) {
        isIn = true
        // Dieser Dart zählt - Score bleibt
      } else {
        effectiveScore = 0 // Dart zählt nicht
      }
    }

    const dart: Dart & { score: number } = { ...base, score: effectiveScore }
    thrown.push(dart)

    // Nur wenn Score > 0, Punktelogik ausführen
    if (effectiveScore === 0) {
      continue
    }

    const after = tmp - effectiveScore

    if (after === 0) {
      if (finishAllowed(outRule, dart)) {
        tmp = 0
        finDart = (i + 1) as 1 | 2 | 3
        break
      } else {
        bust = true
        tmp = before
        break
      }
    }

    if (after < 0 || (after === 1 && outRule !== 'single-out')) {
      bust = true
      tmp = before
      break
    }

    tmp = after
  }

  if (inRule === 'double-in' && leg.inByPlayer && !leg.inByPlayer[playerId] && isIn) {
    leg.inByPlayer[playerId] = true
  }

  const visitScore = bust ? 0 : before - tmp
  const visit: VisitAdded = {
    eventId: visitId,
    type: 'VisitAdded',
    ts,
    matchId: match.matchId,
    legId: leg.legId,
    playerId,
    darts: thrown,
    visitScore,
    remainingBefore: before,
    remainingAfter: tmp,
    bust,
    finishingDartSeq: finDart,
  }

  const events: DartsEvent[] = [visit]
  if (!bust && tmp === 0 && finDart) {
    const legFin: LegFinished = {
      eventId: id(),
      type: 'LegFinished',
      ts: now(),
      matchId: match.matchId,
      legId: leg.legId,
      winnerPlayerId: playerId,
      finishingVisitId: visitId,
      finishingDartSeq: finDart,
      highestCheckoutThisLeg: visitScore,
    }
    events.push(legFin)
  }
  return { events, result: visit }
}

/* ----------------- Stats ----------------- */
export type PlayerStats = {
  playerId: string
  dartsThrown: number
  pointsScored: number
  threeDartAvg: number
  first9AvgByLeg: Record<ULID, number>
  first9OverallAvg?: number

  // Visit-basierte Checkout-Quote (konsistent zur Dart-Logik)
  checkoutAttempts: number
  checkoutsMade: number
  checkoutPct: number

  // Dart-basierte Kennzahlen (Game/Endscreen / Leaderboard)
  doubleAttemptsDart: number
  doublesHitDart: number
  doublePctDart: number

  highestCheckout: number
  bins: { _180: number; _140plus: number; _100plus: number; _61plus: number }
  busts: number
  finishingDoubles: Record<string, number>  // z.B. { "D20": 3, "D16": 1 }
  bestLegDarts: number | null
}

/**
 * VisitAttempt = mindestens EIN Dart in dieser Aufnahme war ein echter Kill-Versuch
 * (also nicht nur Stellen), basierend auf countsAsDoubleAttempt.
 */
function isCheckoutAttemptVisit_LIVE(v: VisitAdded, outRule: OutRule): boolean {
  let tmp = v.remainingBefore
  for (let i = 0; i < v.darts.length; i++) {
    const d = v.darts[i]
    if (countsAsDoubleAttempt(tmp, d, outRule)) return true

    const after = tmp - d.score
    if (after === 0) break

    if (outRule === 'single-out') {
      if (after < 0) break
    } else {
      if (after < 0 || after === 1) break
    }

    tmp = after
  }
  return false
}

/**
 * VisitMade = diese Aufnahme hat gecheckt, legal laut OutRule
 */
function isCheckoutMadeVisit_LIVE(v: VisitAdded, outRule: OutRule): boolean {
  if (v.remainingAfter !== 0) return false
  if (v.finishingDartSeq) {
    const idx = v.finishingDartSeq - 1
    const d = v.darts[idx]
    return !!d && finishAllowed(outRule, d)
  }
  // Fallback falls finishingDartSeq aus alten Events fehlt
  let tmp = v.remainingBefore
  for (let i = 0; i < v.darts.length; i++) {
    const d = v.darts[i]
    const after = tmp - d.score
    if (after === 0) return finishAllowed(outRule, d)

    if (outRule === 'single-out') {
      if (after < 0) break
    } else {
      if (after < 0 || after === 1) break
    }

    tmp = after
  }
  return false
}

/**
 * computeStats
 * Zählt alles pro Spieler:
 * - Punkte, Würfe
 * - First9
 * - Visit-basierte Checkout-Quote (checkoutAttempts / checkoutsMade)
 * - Dart-basierte Double-Quote (doubleAttemptsDart / doublesHitDart)
 *   -> countsAsDoubleAttempt() regelt, was ein echter Checkout-Versuch ist
 *      (Double anspielen, knapp daneben, Bull bei 50),
 *      aber KEIN Setup-Dart.
 */
export function computeStats(events: DartsEvent[]): Record<string, PlayerStats> {
  const match = events.find((e) => e.type === 'MatchStarted') as MatchStarted | undefined
  if (!match) return {}
  const players = match.players.map((p) => p.playerId)
  const outRule = getOutRule(match)

  const stats: Record<string, PlayerStats> = {}
  for (const pid of players) {
    stats[pid] = {
      playerId: pid,
      dartsThrown: 0,
      pointsScored: 0,
      threeDartAvg: 0,
      first9AvgByLeg: {},
      first9OverallAvg: undefined,

      checkoutAttempts: 0,
      checkoutsMade: 0,
      checkoutPct: 0,

      doubleAttemptsDart: 0,
      doublesHitDart: 0,
      doublePctDart: 0,

      highestCheckout: 0,
      bins: { _180: 0, _140plus: 0, _100plus: 0, _61plus: 0 },
      busts: 0,
      finishingDoubles: {},
      bestLegDarts: null,
    }
  }

  // First 9 pro (Leg,Player)
  const first9: Record<string, { points: number; darts: number }> = {}

  // Darts pro Leg pro Spieler (für bestes Leg)
  const dartsPerLeg: Record<string, Record<string, number>> = {}  // legId -> playerId -> darts

  for (const e of events) {
    // LegFinished: Bestes Leg tracken
    if (e.type === 'LegFinished') {
      const lf = e as LegFinished
      const winnerId = lf.winnerPlayerId
      const s = stats[winnerId]
      if (s && dartsPerLeg[lf.legId]?.[winnerId]) {
        const dartsForLeg = dartsPerLeg[lf.legId][winnerId]
        if (s.bestLegDarts === null || dartsForLeg < s.bestLegDarts) {
          s.bestLegDarts = dartsForLeg
        }
      }
      continue
    }

    if (e.type !== 'VisitAdded') continue
    const s = stats[e.playerId]
    if (!s) continue

    // --- Basiswerte ---
    s.dartsThrown += e.darts.length
    s.pointsScored += e.visitScore || 0

    // Darts pro Leg tracken (für bestes Leg)
    if (!dartsPerLeg[e.legId]) dartsPerLeg[e.legId] = {}
    dartsPerLeg[e.legId][e.playerId] = (dartsPerLeg[e.legId][e.playerId] ?? 0) + e.darts.length
    if (e.visitScore === 180) s.bins._180 += 1
    else if (e.visitScore >= 140) s.bins._140plus += 1
    else if (e.visitScore >= 100) s.bins._100plus += 1
    else if (e.visitScore >= 61) s.bins._61plus += 1

    // Busts zählen
    if (e.bust) s.busts += 1

    // --- First 9 ---
    const key = `${e.legId}:${e.playerId}`
    if (!first9[key]) first9[key] = { points: 0, darts: 0 }
    for (let i = 0; i < e.darts.length && first9[key].darts < 9; i++) {
      first9[key].points += e.bust ? 0 : e.darts[i].score
      first9[key].darts += 1
    }

    // --- Visit-basierte Checkout-Stats ---
    if (isCheckoutAttemptVisit_LIVE(e, outRule)) s.checkoutAttempts += 1
    if (isCheckoutMadeVisit_LIVE(e, outRule)) {
      s.checkoutsMade += 1
      if (e.remainingBefore > s.highestCheckout) {
        s.highestCheckout = e.remainingBefore
      }
    }

    // --- Dart-basierte Double-Stats ---
    // Ein Doppelversuch zählt nur, wenn der Rest ein DIREKTER Double-Checkout ist:
    // 50 (Bull) oder gerade Zahlen 2-40 (D1 bis D20).
    // Bei ungeraden Resten (z.B. 35, 67) muss erst "gestellt" werden → kein Doppelversuch.
    let liveRem = e.remainingBefore
    for (let i = 0; i < e.darts.length; i++) {
      const d = e.darts[i]

      // Doppelversuch = Rest ist direkter Double-Checkout
      if (isDirectDoubleCheckout(liveRem, outRule)) {
        s.doubleAttemptsDart += 1
      }

      const after = liveRem - d.score

      // erfolgreicher Checkout-Dart?
      if (after === 0 && finishAllowed(outRule, d)) {
        s.doublesHitDart += 1

        // Finishing Double tracken
        const doubleKey = d.mult === 2
          ? (d.bed === 'BULL' ? 'DBULL' : `D${d.bed}`)
          : (d.bed === 'BULL' ? 'BULL' : String(d.bed))  // Single-Out
        s.finishingDoubles[doubleKey] = (s.finishingDoubles[doubleKey] ?? 0) + 1

        liveRem = after
        break // Leg vorbei
      }

      // Bust / Stop?
      if (outRule === 'single-out') {
        if (after < 0) break
      } else {
        if (after < 0 || after === 1) break
      }

      // kein Bust, weiterspielen
      liveRem = after
    }
  }

  // --- Abschlussberechnung ---
  for (const pid of players) {
    const s = stats[pid]

    // 3-Dart Average
    s.threeDartAvg = s.dartsThrown > 0
      ? (s.pointsScored / s.dartsThrown) * 3
      : 0

    // First 9 Averages
    const entries = Object.entries(first9).filter(([k]) => k.endsWith(`:${pid}`))
    let sum = 0
    let c = 0
    for (const [k, v] of entries) {
      const legId = k.split(':')[0] as ULID
      const avg = v.darts > 0 ? (v.points / v.darts) * 3 : 0
      s.first9AvgByLeg[legId] = avg
      sum += avg
      c++
    }
    if (c > 0) s.first9OverallAvg = sum / c

    // Visit-basierte Checkout-Quote
    s.checkoutPct = s.checkoutAttempts > 0
      ? (s.checkoutsMade / s.checkoutAttempts) * 100
      : 0

    // Dart-basierte Double-Quote (DAS ist die, die du in den Leaderboards hast)
    s.doublePctDart = s.doubleAttemptsDart > 0
      ? (s.doublesHitDart / s.doubleAttemptsDart) * 100
      : 0
  }

  return stats
}

/* ----------------- Checkout routes ----------------- */
const PREF_DEFAULT = ['D16', 'D20', 'D32', 'D8']
export type RouteStyle = 'safe' | 'aggressive' | 'preference'
export type CheckoutOption = { route: string[]; lastDouble: string }

/**
 * DO/MO/SO-abhängige Checkout-Routen.
 * Backwards-kompatibel: outRule default 'double-out' → bestehende Aufrufer müssen nichts ändern.
 */
export function getCheckoutRoutes(
  rem: number,
  _style: RouteStyle = 'safe',
  pref: { preferDoubles?: string[] } = {},
  outRule: OutRule = 'double-out'
): CheckoutOption[] {
  if (rem < 2 || rem > 170) return []
  const prefer = pref.preferDoubles?.length ? pref.preferDoubles : PREF_DEFAULT

  // Basis: klassische DO-Tabelle
  const tbl: Record<number, string[][]> = {
    170: [['T20', 'T20', 'D25']],
    167: [['T20', 'T19', 'D25']],
    164: [['T20', 'T18', 'D25']],
    161: [['T20', 'T17', 'D25']],
    160: [['T20', 'T20', 'D20']],
    100: [['T20', 'D20'], ['T16', 'D16']],
    81: [['T19', 'D12'], ['T15', 'D18']],
    40: [['D20'], ['S8', 'D16']],
    32: [['D16'], ['S16', 'D8']],
    16: [['D8'], ['S8', 'D4']],
    8: [['D4'], ['S4', 'D2']],
    2: [['D1']],
  }

  let routes: CheckoutOption[] =
    tbl[rem]?.map((r) => ({ route: r, lastDouble: r[r.length - 1] })) || []

  if (routes.length === 0 && rem <= 40 && rem % 2 === 0) {
    const d = `D${rem / 2}`
    routes = [{ route: [d], lastDouble: d }]
  }

  if (outRule === 'master-out') {
    if (rem <= 60 && rem % 3 === 0) {
      const t = `T${rem / 3}`
      routes.unshift({ route: [t], lastDouble: t })
    }
    if (rem === 50) {
      routes.unshift({ route: ['DBULL'], lastDouble: 'DBULL' })
    }
  }

  if (outRule === 'single-out') {
    if (rem <= 20) routes.unshift({ route: [`S${rem}`], lastDouble: `S${rem}` })
    if (rem === 25) routes.unshift({ route: ['BULL'], lastDouble: 'BULL' })
    if (rem === 50) routes.unshift({ route: ['DBULL'], lastDouble: 'DBULL' })
    if (rem <= 60 && rem % 3 === 0) {
      const t = `T${rem / 3}`
      routes.unshift({ route: [t], lastDouble: t })
    }
  }

  routes.sort((a, b) => prefer.indexOf(a.lastDouble) - prefer.indexOf(b.lastDouble))
  return routes.slice(0, 3)
}

/* ----------------- Example events ----------------- */
export function exampleMatchEvents(): DartsEvent[] {
  const matchId = id()
  const legId = id()
  const start: MatchStarted = {
    eventId: id(),
    type: 'MatchStarted',
    ts: now(),
    matchId,
    mode: '501-double-out',
    structure: { kind: 'legs', bestOfLegs: 1 },
    startingScorePerLeg: 501,
    players: [
      { playerId: 'p1', name: 'Thomas' },
      { playerId: 'p2', name: 'CPU' },
    ],
    bullThrow: { winnerPlayerId: 'p1' },
    version: 1,
    inRule: 'straight-in',
    outRule: 'double-out',
  }
  const legStart: LegStarted = {
    eventId: id(),
    type: 'LegStarted',
    ts: now(),
    matchId,
    legId,
    legIndex: 1,
    starterPlayerId: 'p1',
  }
  return [start, legStart]
}
