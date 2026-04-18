// src/dartsStraeusschen.ts
// Sträußchen – Trainingsspiel: 3× Triple auf 17/18/19/20
// Event-Sourced Engine (analog dartsAroundTheBlock.ts)

import type { StrTargetNumber, StrRingMode, StrBullMode, StrBullPosition } from './types/straeusschen'

// ============================================================================
// Types
// ============================================================================

export type StrMode = 'single' | 'all'
export type StrNumberOrder = 'fixed' | 'random' | 'free'
export type StrTurnOrder = 'alternating' | 'sequential'
export type StrDart = 'hit' | 'miss'

export type StrPlayer = {
  playerId: string
  name: string
  isGuest?: boolean
}

export type StrStructure =
  | { kind: 'legs'; bestOfLegs: number }
  | { kind: 'sets'; bestOfSets: number; legsPerSet: number }

// ===== Events =====

export type StrMatchStartedEvent = {
  type: 'StrMatchStarted'
  eventId: string
  matchId: string
  ts: string
  players: StrPlayer[]
  mode: StrMode
  targetNumber?: StrTargetNumber
  numberOrder?: StrNumberOrder
  generatedOrder?: StrTargetNumber[]
  structure: StrStructure
  turnOrder?: StrTurnOrder
  ringMode?: StrRingMode
  bullMode?: StrBullMode
  bullPosition?: StrBullPosition
}

export type StrLegStartedEvent = {
  type: 'StrLegStarted'
  eventId: string
  matchId: string
  ts: string
  legId: string
  legIndex: number
  setIndex?: number
}

export type StrTurnAddedEvent = {
  type: 'StrTurnAdded'
  eventId: string
  matchId: string
  legId: string
  ts: string
  playerId: string
  targetNumber: StrTargetNumber
  darts: StrDart[]
  hits: number
  totalHitsOnNumber: number
  numberCompleted: boolean
  nextNumber?: StrTargetNumber
  playerFinished: boolean
  totalDartsInLeg: number
  turnIndexInLeg: number
}

export type StrLegFinishedEvent = {
  type: 'StrLegFinished'
  eventId: string
  matchId: string
  legId: string
  ts: string
  winnerId: string
  winnerDarts: number
  winnerTurns: number
  winnerScore: number
  results: { playerId: string; totalDarts: number; totalTurns: number; score: number }[]
}

export type StrSetFinishedEvent = {
  type: 'StrSetFinished'
  eventId: string
  matchId: string
  ts: string
  setIndex: number
  winnerId: string
}

export type StrMatchFinishedEvent = {
  type: 'StrMatchFinished'
  eventId: string
  matchId: string
  ts: string
  winnerId: string
  totalDarts: number
  winnerScore: number
  durationMs: number
}

export type StrEvent =
  | StrMatchStartedEvent
  | StrLegStartedEvent
  | StrTurnAddedEvent
  | StrLegFinishedEvent
  | StrSetFinishedEvent
  | StrMatchFinishedEvent

// ===== State =====

export type StrNumberProgress = {
  triplesHit: number // 0-3
  completed: boolean
  dartsThrown: number
  dartsToTriple: [number | null, number | null, number | null]
}

export type StrPlayerState = {
  currentNumber: StrTargetNumber
  numberProgress: Partial<Record<StrTargetNumber, StrNumberProgress>>
  completedNumbers: StrTargetNumber[]
  dartsInLeg: number
  turnsInLeg: number
  legComplete: boolean
  legScore: number
}

export type StrState = {
  match: {
    matchId: string
    players: StrPlayer[]
    mode: StrMode
    targetNumber?: StrTargetNumber
    numberOrder?: StrNumberOrder
    numberSequence: StrTargetNumber[]
    structure: StrStructure
    turnOrder: StrTurnOrder
    ringMode: StrRingMode
    bullMode?: StrBullMode
    includeBull: boolean
  } | null
  currentLegId: string | null
  currentLegIndex: number
  currentSetIndex: number
  turnIndex: number
  startPlayerIndex: number
  playerState: Record<string, StrPlayerState>
  legWinsByPlayer: Record<string, number>
  setWinsByPlayer: Record<string, number>
  totalLegWinsByPlayer: Record<string, number>
  finished: {
    winnerId: string
    totalDarts: number
    winnerScore: number
    durationMs: number
  } | null
  events: StrEvent[]
}

// ============================================================================
// Constants
// ============================================================================

const ALL_NUMBERS_BASE: StrTargetNumber[] = [17, 18, 19, 20]
const ALL_NUMBERS_WITH_BULL: StrTargetNumber[] = [17, 18, 19, 20, 25]
const TRIPLES_NEEDED = 3

export function getAllNumbers(includeBull: boolean): StrTargetNumber[] {
  return includeBull ? [...ALL_NUMBERS_WITH_BULL] : [...ALL_NUMBERS_BASE]
}

export function getTargetLabel(num: StrTargetNumber, ringMode: StrRingMode): string {
  return num === 25 ? 'Bull' : `${ringMode === 'double' ? 'D' : 'T'}${num}`
}

// ============================================================================
// Helpers
// ============================================================================

let _counter = 0
export function id(): string {
  return `str_${Date.now()}_${++_counter}_${Math.random().toString(36).slice(2, 8)}`
}

export function now(): string {
  return new Date().toISOString()
}

export function computeStrFieldScore(dartsToTriple: [number | null, number | null, number | null]): number {
  let score = 0
  for (let i = 0; i < dartsToTriple.length; i++) {
    const d = dartsToTriple[i]
    if (d != null && d > 0) score += ((i + 1) / d) * 100
  }
  return score
}

export function generateNumberOrder(
  order: StrNumberOrder,
  includeBull: boolean = false,
  bullPosition?: StrBullPosition,
): StrTargetNumber[] {
  if (order === 'fixed') {
    const base = [...ALL_NUMBERS_BASE]
    if (includeBull) {
      if (bullPosition === 'start') return [25 as StrTargetNumber, ...base]
      if (bullPosition === 'random') {
        const pos = Math.floor(Math.random() * (base.length + 1))
        base.splice(pos, 0, 25 as StrTargetNumber)
        return base
      }
      // default / 'end'
      return [...base, 25 as StrTargetNumber]
    }
    return base
  }
  if (order === 'random') {
    const arr = includeBull ? [...ALL_NUMBERS_WITH_BULL] : [...ALL_NUMBERS_BASE]
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[arr[i], arr[j]] = [arr[j], arr[i]]
    }
    return arr
  }
  // 'free': Spieler wählt – Start ist frei wählbar, wir geben alle als Option
  return includeBull ? [...ALL_NUMBERS_WITH_BULL] : [...ALL_NUMBERS_BASE]
}

function getFirstNumber(mode: StrMode, targetNumber?: StrTargetNumber, sequence?: StrTargetNumber[]): StrTargetNumber {
  if (mode === 'single' && targetNumber) return targetNumber
  return sequence?.[0] ?? 17
}

function initNumberProgress(mode: StrMode, targetNumber?: StrTargetNumber, includeBull: boolean = false): Partial<Record<StrTargetNumber, StrNumberProgress>> {
  const progress: Partial<Record<StrTargetNumber, StrNumberProgress>> = {}
  const mkProgress = (): StrNumberProgress => ({ triplesHit: 0, completed: false, dartsThrown: 0, dartsToTriple: [null, null, null] })
  if (mode === 'single' && targetNumber) {
    progress[targetNumber] = mkProgress()
  } else {
    for (const n of getAllNumbers(includeBull)) {
      progress[n] = mkProgress()
    }
  }
  return progress
}

function initPlayerState(mode: StrMode, targetNumber?: StrTargetNumber, sequence?: StrTargetNumber[], includeBull: boolean = false): StrPlayerState {
  return {
    currentNumber: getFirstNumber(mode, targetNumber, sequence),
    numberProgress: initNumberProgress(mode, targetNumber, includeBull),
    completedNumbers: [],
    dartsInLeg: 0,
    turnsInLeg: 0,
    legComplete: false,
    legScore: 0,
  }
}

export function getAvailableDarts(state: StrState, playerId: string): number {
  const ps = state.playerState[playerId]
  if (!ps || ps.legComplete) return 0
  const progress = ps.numberProgress[ps.currentNumber]
  return TRIPLES_NEEDED - (progress?.triplesHit ?? 0)
}

export function getRequiredNumbers(state: StrState): StrTargetNumber[] {
  if (!state.match) return []
  if (state.match.mode === 'single' && state.match.targetNumber) {
    return [state.match.targetNumber]
  }
  return getAllNumbers(state.match.includeBull)
}

export function getRemainingNumbers(state: StrState, playerId: string): StrTargetNumber[] {
  const ps = state.playerState[playerId]
  if (!ps || !state.match) return []
  if (state.match.mode === 'single') return ps.legComplete ? [] : [ps.currentNumber]
  return getAllNumbers(state.match.includeBull).filter(n => !ps.completedNumbers.includes(n))
}

// ============================================================================
// State from Events
// ============================================================================

export function applyStrEvents(events: StrEvent[]): StrState {
  const state: StrState = {
    match: null,
    currentLegId: null,
    currentLegIndex: 0,
    currentSetIndex: 0,
    turnIndex: 0,
    startPlayerIndex: 0,
    playerState: {},
    legWinsByPlayer: {},
    setWinsByPlayer: {},
    totalLegWinsByPlayer: {},
    finished: null,
    events,
  }

  // Dedup nach eventId — MP-Sync kann Events doppelt zurückspielen
  const seenEventIds = new Set<string>()

  for (const ev of events) {
    if (ev.eventId) {
      if (seenEventIds.has(ev.eventId)) continue
      seenEventIds.add(ev.eventId)
    }
    switch (ev.type) {
      case 'StrMatchStarted': {
        const ringMode: StrRingMode = ev.ringMode ?? 'triple'
        const bullMode = ev.bullMode
        const includeBull = ev.mode === 'single'
          ? ev.targetNumber === 25
          : !!ev.generatedOrder?.includes(25 as StrTargetNumber) || !!bullMode
        const sequence: StrTargetNumber[] = ev.mode === 'all'
          ? (ev.generatedOrder ?? generateNumberOrder(ev.numberOrder ?? 'fixed', includeBull, ev.bullPosition))
          : (ev.targetNumber ? [ev.targetNumber] : [20 as StrTargetNumber])
        state.match = {
          matchId: ev.matchId,
          players: ev.players,
          mode: ev.mode,
          targetNumber: ev.targetNumber,
          numberOrder: ev.numberOrder,
          numberSequence: sequence,
          structure: ev.structure,
          turnOrder: ev.turnOrder ?? 'sequential',
          ringMode,
          bullMode,
          includeBull,
        }
        for (const p of ev.players) {
          state.playerState[p.playerId] = initPlayerState(ev.mode, ev.targetNumber, sequence, includeBull)
          state.legWinsByPlayer[p.playerId] = 0
          state.setWinsByPlayer[p.playerId] = 0
          state.totalLegWinsByPlayer[p.playerId] = 0
        }
        break
      }

      case 'StrLegStarted': {
        state.currentLegId = ev.legId
        state.currentLegIndex = ev.legIndex
        if (ev.setIndex != null) state.currentSetIndex = ev.setIndex
        // Reset player state für neues Leg
        if (state.match) {
          const sequence = state.match.numberSequence
          for (const p of state.match.players) {
            state.playerState[p.playerId] = initPlayerState(state.match.mode, state.match.targetNumber, sequence, state.match.includeBull)
          }
        }
        // Rotate Start-Spieler
        state.turnIndex = state.startPlayerIndex
        break
      }

      case 'StrTurnAdded': {
        const ps = state.playerState[ev.playerId]
        if (!ps) break
        const np = ps.numberProgress[ev.targetNumber]
        if (np) {
          // Score-Tracking: dartsToTriple + legScore berechnen (VOR triplesHit-Update!)
          let dartsSoFar = np.dartsThrown
          let hitsSoFar = np.triplesHit
          for (const dart of ev.darts) {
            dartsSoFar++
            if (dart === 'hit') {
              hitsSoFar++
              if (hitsSoFar <= 3) {
                np.dartsToTriple[hitsSoFar - 1] = dartsSoFar
                ps.legScore += (hitsSoFar / dartsSoFar) * 100
              }
            }
          }
          np.dartsThrown = dartsSoFar

          np.triplesHit = ev.totalHitsOnNumber
          np.completed = ev.numberCompleted
        }
        ps.dartsInLeg = ev.totalDartsInLeg
        ps.turnsInLeg = ev.turnIndexInLeg
        if (ev.numberCompleted && !ps.completedNumbers.includes(ev.targetNumber)) {
          ps.completedNumbers.push(ev.targetNumber)
        }
        if (ev.playerFinished) {
          ps.legComplete = true
        }
        if (ev.numberCompleted && !ev.playerFinished && ev.nextNumber != null) {
          ps.currentNumber = ev.nextNumber
        }
        // Spielerwechsel: abhängig von turnOrder
        if (state.match) {
          const shouldAdvance = state.match.turnOrder === 'alternating'
            ? true
            : ev.playerFinished
          if (shouldAdvance) {
            const players = state.match.players
            let next = (state.turnIndex + 1) % players.length
            let attempts = 0
            while (state.playerState[players[next].playerId]?.legComplete && attempts < players.length) {
              next = (next + 1) % players.length
              attempts++
            }
            state.turnIndex = next
          }
        }
        break
      }

      case 'StrLegFinished': {
        state.legWinsByPlayer[ev.winnerId] = (state.legWinsByPlayer[ev.winnerId] ?? 0) + 1
        state.totalLegWinsByPlayer[ev.winnerId] = (state.totalLegWinsByPlayer[ev.winnerId] ?? 0) + 1
        // Rotate start player
        if (state.match) {
          state.startPlayerIndex = (state.startPlayerIndex + 1) % state.match.players.length
        }
        break
      }

      case 'StrSetFinished': {
        state.setWinsByPlayer[ev.winnerId] = (state.setWinsByPlayer[ev.winnerId] ?? 0) + 1
        // Reset leg wins for new set
        if (state.match) {
          for (const p of state.match.players) {
            state.legWinsByPlayer[p.playerId] = 0
          }
        }
        break
      }

      case 'StrMatchFinished': {
        state.finished = {
          winnerId: ev.winnerId,
          totalDarts: ev.totalDarts,
          winnerScore: ev.winnerScore,
          durationMs: ev.durationMs,
        }
        break
      }
    }
  }

  return state
}

// ============================================================================
// Turn Recording
// ============================================================================

export type StrTurnResult = {
  turnEvent: StrTurnAddedEvent
  legFinished?: StrLegFinishedEvent
  setFinished?: StrSetFinishedEvent
  matchFinished?: StrMatchFinishedEvent
  nextLegStart?: StrLegStartedEvent
}

export function recordStrTurn(
  state: StrState,
  playerId: string,
  darts: StrDart[],
  nextNumber?: StrTargetNumber,
  durationMs?: number,
): StrTurnResult {
  if (!state.match || !state.currentLegId) {
    throw new Error('No active match/leg')
  }

  const ps = state.playerState[playerId]
  if (!ps) throw new Error(`Player ${playerId} not found`)

  const matchId = state.match.matchId
  const legId = state.currentLegId
  const targetNumber = ps.currentNumber

  // Berechne Treffer
  const hits = darts.filter(d => d === 'hit').length
  const currentProgress = ps.numberProgress[targetNumber]
  const totalHitsOnNumber = (currentProgress?.triplesHit ?? 0) + hits
  const numberCompleted = totalHitsOnNumber >= TRIPLES_NEEDED

  // Bestimme ob Spieler fertig ist
  let playerFinished = false
  if (state.match.mode === 'single') {
    playerFinished = numberCompleted
  } else {
    // 'all' mode: fertig wenn diese Zahl die letzte noch offene war
    const remaining = getAllNumbers(state.match.includeBull).filter(n => {
      if (n === targetNumber) return !numberCompleted
      return !ps.completedNumbers.includes(n)
    })
    playerFinished = remaining.length === 0
  }

  // nextNumber bestimmen (für 'all' mode)
  let resolvedNextNumber: StrTargetNumber | undefined
  if (numberCompleted && !playerFinished && state.match.mode === 'all') {
    if (state.match.numberOrder === 'free') {
      // Spieler wählt – nextNumber muss übergeben werden
      resolvedNextNumber = nextNumber
    } else {
      // Feste oder zufällige Reihenfolge – nächste aus Sequenz
      const seq = state.match.numberSequence
      const currentIdx = seq.indexOf(targetNumber)
      const completedAfter = [...ps.completedNumbers]
      if (!completedAfter.includes(targetNumber)) completedAfter.push(targetNumber)
      for (let i = 1; i <= seq.length; i++) {
        const candidate = seq[(currentIdx + i) % seq.length]
        if (!completedAfter.includes(candidate)) {
          resolvedNextNumber = candidate
          break
        }
      }
    }
  }

  const totalDartsInLeg = ps.dartsInLeg + darts.length
  const turnIndexInLeg = ps.turnsInLeg + 1

  const turnEvent: StrTurnAddedEvent = {
    type: 'StrTurnAdded',
    eventId: id(),
    matchId,
    legId,
    ts: now(),
    playerId,
    targetNumber,
    darts,
    hits,
    totalHitsOnNumber: Math.min(totalHitsOnNumber, TRIPLES_NEEDED),
    numberCompleted,
    nextNumber: resolvedNextNumber,
    playerFinished,
    totalDartsInLeg,
    turnIndexInLeg,
  }

  const result: StrTurnResult = { turnEvent }

  // Prüfe ob alle Spieler fertig sind (Leg beendet)
  const allPlayers = state.match.players
  const allFinished = allPlayers.every(p => {
    if (p.playerId === playerId) return playerFinished
    return state.playerState[p.playerId]?.legComplete ?? false
  })

  if (allFinished) {
    // Score für aktuellen Spieler berechnen
    let turnScore = 0
    const currentProgress = ps.numberProgress[targetNumber]
    let scoreDartsSoFar = currentProgress?.dartsThrown ?? 0
    let scoreHitsSoFar = currentProgress?.triplesHit ?? 0
    for (const dart of darts) {
      scoreDartsSoFar++
      if (dart === 'hit') {
        scoreHitsSoFar++
        if (scoreHitsSoFar <= 3) {
          turnScore += (scoreHitsSoFar / scoreDartsSoFar) * 100
        }
      }
    }
    const playerScore = (ps.legScore ?? 0) + turnScore

    // Gewinner bestimmen: HÖCHSTER Score
    let winnerId = playerId
    let maxScore = playerScore

    for (const p of allPlayers) {
      const pScore = p.playerId === playerId ? playerScore : state.playerState[p.playerId]?.legScore ?? 0
      if (pScore > maxScore) {
        maxScore = pScore
        winnerId = p.playerId
      }
    }

    const winnerDarts = winnerId === playerId ? totalDartsInLeg : state.playerState[winnerId]?.dartsInLeg ?? 0

    const playerResults = allPlayers.map(p => ({
      playerId: p.playerId,
      totalDarts: p.playerId === playerId ? totalDartsInLeg : state.playerState[p.playerId]?.dartsInLeg ?? 0,
      totalTurns: p.playerId === playerId ? turnIndexInLeg : state.playerState[p.playerId]?.turnsInLeg ?? 0,
      score: p.playerId === playerId ? playerScore : state.playerState[p.playerId]?.legScore ?? 0,
    }))

    result.legFinished = {
      type: 'StrLegFinished',
      eventId: id(),
      matchId,
      legId,
      ts: now(),
      winnerId,
      winnerDarts,
      winnerTurns: playerResults.find(r => r.playerId === winnerId)?.totalTurns ?? 0,
      winnerScore: maxScore,
      results: playerResults,
    }

    // Prüfe ob Match beendet ist
    const structure = state.match.structure
    const newLegWins = { ...state.legWinsByPlayer }
    newLegWins[winnerId] = (newLegWins[winnerId] ?? 0) + 1
    const newTotalLegWins = { ...state.totalLegWinsByPlayer }
    newTotalLegWins[winnerId] = (newTotalLegWins[winnerId] ?? 0) + 1

    if (structure.kind === 'legs') {
      const target = Math.ceil(structure.bestOfLegs / 2)
      if (newLegWins[winnerId] >= target) {
        result.matchFinished = {
          type: 'StrMatchFinished',
          eventId: id(),
          matchId,
          ts: now(),
          winnerId,
          totalDarts: winnerDarts,
          winnerScore: maxScore,
          durationMs: durationMs ?? 0,
        }
      }
    } else {
      // Sets mode
      const legsTarget = Math.ceil(structure.legsPerSet / 2)
      if (newLegWins[winnerId] >= legsTarget) {
        const newSetWins = { ...state.setWinsByPlayer }
        newSetWins[winnerId] = (newSetWins[winnerId] ?? 0) + 1

        result.setFinished = {
          type: 'StrSetFinished',
          eventId: id(),
          matchId,
          ts: now(),
          setIndex: state.currentSetIndex,
          winnerId,
        }

        const setsTarget = Math.ceil(structure.bestOfSets / 2)
        if (newSetWins[winnerId] >= setsTarget) {
          result.matchFinished = {
            type: 'StrMatchFinished',
            eventId: id(),
            matchId,
            ts: now(),
            winnerId,
            totalDarts: winnerDarts,
            winnerScore: maxScore,
            durationMs: durationMs ?? 0,
          }
        }
      }
    }

    // Neues Leg starten (wenn Match nicht beendet)
    if (!result.matchFinished) {
      const newLegIndex = state.currentLegIndex + 1
      const newSetIndex = result.setFinished ? state.currentSetIndex + 1 : state.currentSetIndex
      result.nextLegStart = {
        type: 'StrLegStarted',
        eventId: id(),
        matchId,
        ts: now(),
        legId: id(),
        legIndex: newLegIndex,
        setIndex: structure.kind === 'sets' ? newSetIndex : undefined,
      }
    }
  }

  return result
}

// ============================================================================
// Utility
// ============================================================================

export function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000)
  const min = Math.floor(totalSec / 60)
  const sec = totalSec % 60
  return `${min}:${sec.toString().padStart(2, '0')}`
}

export function getActivePlayerId(state: StrState): string | null {
  if (!state.match || state.finished) return null
  const players = state.match.players
  if (players.length === 0) return null
  const idx = state.turnIndex % players.length
  return players[idx].playerId
}

export function getActivePlayer(state: StrState): StrPlayer | null {
  const pid = getActivePlayerId(state)
  if (!pid || !state.match) return null
  return state.match.players.find(p => p.playerId === pid) ?? null
}

/** Alle Zahlen für die Konfiguration (ohne Bull) */
export const TARGET_NUMBERS: StrTargetNumber[] = [17, 18, 19, 20]
/** Alle Zahlen inkl. Bull */
export const TARGET_NUMBERS_WITH_BULL: StrTargetNumber[] = [17, 18, 19, 20, 25]
