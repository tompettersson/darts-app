// src/dartsOperation.ts
// Operation - "Ein Feld keine Gnade" Game Engine
// Praezisionstraining: 30 Darts pro Spieler pro Leg auf ein Zielfeld.
// Scoring: Single/Double/Triple des Zielfelds. Alles andere = 0.

import type {
  OperationPlayer, OperationConfig, OperationTargetMode, HitType,
  OperationEvent, OperationState, OperationLegState, OperationPlayerLegState,
  OperationPlayerTotals,
  OperationMatchStartedEvent, OperationLegStartedEvent, OperationDartEvent,
  OperationLegFinishedEvent, OperationMatchFinishedEvent,
} from './types/operation'

// Re-export aller Types fuer Convenience
export type {
  OperationPlayer, OperationConfig, OperationTargetMode, HitType,
  OperationEvent, OperationState, OperationLegState, OperationPlayerLegState,
  OperationPlayerTotals,
  OperationMatchStartedEvent, OperationLegStartedEvent, OperationDartEvent,
  OperationLegFinishedEvent, OperationMatchFinishedEvent,
}

// ===== Hilfsfunktionen =====

export function id(): string {
  return Math.random().toString(36).slice(2, 11)
}

export function now(): string {
  return new Date().toISOString()
}

export function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  const centis = Math.floor((ms % 1000) / 10)
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${centis.toString().padStart(2, '0')}`
}

const DARTS_PER_LEG = 30
const DARTS_PER_TURN = 3
const TURNS_PER_LEG = 10

// ===== Target-Generierung =====

export function generateTargetNumber(): number {
  return Math.floor(Math.random() * 20) + 1
}

// ===== Score-Berechnung =====

export function calculatePoints(hitType: HitType, targetNumber?: number): number {
  if (hitType === 'NO_SCORE') return 0
  if (hitType === 'SINGLE_BULL') return 25
  if (hitType === 'DOUBLE_BULL') return 50
  const num = targetNumber ?? 0
  if (hitType === 'SINGLE') return num
  if (hitType === 'DOUBLE') return num * 2
  if (hitType === 'TRIPLE') return num * 3
  return 0
}

/**
 * Normalisierter Hit Score: Bewertet nur die Treffsicherheit, nicht den Zahlenwert.
 * So ist Triple-5 genauso viel wert wie Triple-20.
 */
export function calculateHitScore(hitType: HitType): number {
  switch (hitType) {
    case 'NO_SCORE': return 0
    case 'SINGLE': return 1
    case 'DOUBLE': return 2
    case 'TRIPLE': return 3
    case 'SINGLE_BULL': return 1
    case 'DOUBLE_BULL': return 2
  }
}

export function isHit(hitType: HitType): boolean {
  return hitType !== 'NO_SCORE'
}

// ===== Event Application =====

function createEmptyPlayerLegState(playerId: string): OperationPlayerLegState {
  return {
    playerId,
    dartsThrown: 0,
    totalScore: 0,
    hitScore: 0,
    currentHitStreak: 0,
    maxHitStreak: 0,
    noScoreCount: 0,
    singleCount: 0,
    doubleCount: 0,
    tripleCount: 0,
    singleBullCount: 0,
    doubleBullCount: 0,
    events: [],
  }
}

function createEmptyLegState(legIndex: number, players: OperationPlayer[], targetMode: OperationTargetMode, targetNumber?: number): OperationLegState {
  return {
    legIndex,
    targetMode,
    targetNumber,
    players: players.map(p => createEmptyPlayerLegState(p.playerId)),
    currentPlayerIndex: 0,
    isComplete: false,
  }
}

/**
 * Wendet Operation Events an und berechnet den abgeleiteten State.
 */
export function applyOperationEvents(events: OperationEvent[]): OperationState {
  const state: OperationState = {
    match: null,
    legs: [],
    currentLegIndex: -1,
    totalsByPlayer: {},
    isComplete: false,
    finished: null,
    startTime: 0,
    events,
  }

  for (const event of events) {
    switch (event.type) {
      case 'OperationMatchStarted': {
        state.match = {
          matchId: event.matchId,
          players: event.players,
          config: event.config,
        }
        state.startTime = new Date(event.ts).getTime()
        for (const p of event.players) {
          state.totalsByPlayer[p.playerId] = { playerId: p.playerId, totalScore: 0, totalHitScore: 0, legsWon: 0 }
        }
        break
      }

      case 'OperationLegStarted': {
        if (!state.match) break
        const leg = createEmptyLegState(event.legIndex, state.match.players, event.targetMode, event.targetNumber)
        // Ersetze existierendes Leg oder fuege neues hinzu
        if (state.legs.length > event.legIndex) {
          state.legs[event.legIndex] = leg
        } else {
          state.legs.push(leg)
        }
        state.currentLegIndex = event.legIndex
        break
      }

      case 'OperationDart': {
        const leg = state.legs[event.legIndex]
        if (!leg) break
        const ps = leg.players.find(p => p.playerId === event.playerId)
        if (!ps) break

        ps.dartsThrown++
        ps.totalScore += event.points
        ps.hitScore += calculateHitScore(event.hitType)
        ps.events.push(event)

        // Hit-Type Zaehler
        switch (event.hitType) {
          case 'NO_SCORE': ps.noScoreCount++; break
          case 'SINGLE': ps.singleCount++; break
          case 'DOUBLE': ps.doubleCount++; break
          case 'TRIPLE': ps.tripleCount++; break
          case 'SINGLE_BULL': ps.singleBullCount++; break
          case 'DOUBLE_BULL': ps.doubleBullCount++; break
        }

        // Streak-Tracking
        if (isHit(event.hitType)) {
          ps.currentHitStreak++
          if (ps.currentHitStreak > ps.maxHitStreak) {
            ps.maxHitStreak = ps.currentHitStreak
          }
        } else {
          ps.currentHitStreak = 0
        }

        // Naechster Spieler nach vollem Turn (3 Darts) oder Leg-Ende
        const dartsInCurrentTurn = getDartsInCurrentTurn(ps.dartsThrown)
        if (dartsInCurrentTurn === 0 && ps.dartsThrown < DARTS_PER_LEG) {
          // Turn komplett, naechster Spieler
          advanceToNextPlayer(leg)
        } else if (ps.dartsThrown >= DARTS_PER_LEG) {
          // Spieler hat 30 Darts geworfen
          // Pruefen ob alle Spieler fertig
          const allDone = leg.players.every(p => p.dartsThrown >= DARTS_PER_LEG)
          if (!allDone) {
            advanceToNextPlayer(leg)
          }
        }
        break
      }

      case 'OperationLegFinished': {
        const leg = state.legs[event.legIndex]
        if (!leg) break
        leg.isComplete = true

        // Totals aktualisieren
        for (const [pid, score] of Object.entries(event.playerScores)) {
          if (state.totalsByPlayer[pid]) {
            state.totalsByPlayer[pid].totalScore += score
          }
        }
        // HitScores aus Event oder aus Leg-State ableiten (Backward-Compat)
        const hitScores = event.playerHitScores ?? {}
        for (const ps of leg.players) {
          if (state.totalsByPlayer[ps.playerId]) {
            state.totalsByPlayer[ps.playerId].totalHitScore += hitScores[ps.playerId] ?? ps.hitScore
          }
        }
        if (event.winnerId && state.totalsByPlayer[event.winnerId]) {
          state.totalsByPlayer[event.winnerId].legsWon++
        }
        break
      }

      case 'OperationMatchFinished': {
        state.isComplete = true
        // finalHitScores aus Event oder aus Totals ableiten (Backward-Compat)
        const fhs = event.finalHitScores ?? Object.fromEntries(
          Object.entries(state.totalsByPlayer).map(([pid, t]) => [pid, t.totalHitScore])
        )
        state.finished = {
          winnerId: event.winnerId,
          totalDarts: event.totalDarts,
          durationMs: event.durationMs,
          finalScores: event.finalScores,
          finalHitScores: fhs,
          legWins: event.legWins,
        }
        break
      }
    }
  }

  return state
}

/**
 * Berechnet wieviele Darts im aktuellen Turn schon geworfen wurden.
 * 0 = Turn gerade abgeschlossen
 */
function getDartsInCurrentTurn(dartsThrown: number): number {
  if (dartsThrown === 0) return 0
  // Letzter Turn: bei 29 Darts geworfen → nur 1 Dart, bei 30 → 0 (fertig)
  if (dartsThrown >= DARTS_PER_LEG) return 0
  // Sonderfall: 28 geworfene Darts → naechster Turn hat nur 2 Darts
  // Sonderfall: 29 geworfene Darts → naechster Turn hat nur 1 Dart
  return dartsThrown % DARTS_PER_TURN
}

function advanceToNextPlayer(leg: OperationLegState): void {
  const count = leg.players.length
  for (let attempt = 0; attempt < count; attempt++) {
    leg.currentPlayerIndex = (leg.currentPlayerIndex + 1) % count
    const ps = leg.players[leg.currentPlayerIndex]
    if (ps.dartsThrown < DARTS_PER_LEG) return
  }
}

// ===== State-Abfragen =====

export function getActivePlayerId(state: OperationState): string | null {
  if (!state.match || state.finished) return null
  const leg = getCurrentLeg(state)
  if (!leg || leg.isComplete) return null
  const ps = leg.players[leg.currentPlayerIndex]
  if (!ps || ps.dartsThrown >= DARTS_PER_LEG) return null
  return ps.playerId
}

export function getCurrentLeg(state: OperationState): OperationLegState | null {
  if (state.currentLegIndex < 0 || state.currentLegIndex >= state.legs.length) return null
  return state.legs[state.currentLegIndex]
}

export function getDartsRemaining(state: OperationState, playerId: string): number {
  const leg = getCurrentLeg(state)
  if (!leg) return 0
  const ps = leg.players.find(p => p.playerId === playerId)
  if (!ps) return 0
  return DARTS_PER_LEG - ps.dartsThrown
}

export function getDartsInTurnRemaining(state: OperationState, playerId: string): number {
  const leg = getCurrentLeg(state)
  if (!leg) return 0
  const ps = leg.players.find(p => p.playerId === playerId)
  if (!ps) return 0
  const remaining = DARTS_PER_LEG - ps.dartsThrown
  if (remaining <= 0) return 0
  const inTurn = ps.dartsThrown % DARTS_PER_TURN
  const normalRemaining = DARTS_PER_TURN - inTurn
  return Math.min(normalRemaining, remaining)
}

export function getCurrentTurnIndex(dartsThrown: number): number {
  if (dartsThrown >= DARTS_PER_LEG) return TURNS_PER_LEG
  return Math.floor(dartsThrown / DARTS_PER_TURN) + 1
}

export function getCurrentDartInTurn(dartsThrown: number): number {
  if (dartsThrown >= DARTS_PER_LEG) return 0
  return (dartsThrown % DARTS_PER_TURN) + 1
}

// ===== Dart Recording =====

export type OperationDartResult = {
  dartEvent: OperationDartEvent
  legFinished?: OperationLegFinishedEvent
  matchFinished?: OperationMatchFinishedEvent
}

/**
 * Nimmt einen einzelnen Dart im Operation-Modus auf.
 */
export function recordOperationDart(
  state: OperationState,
  playerId: string,
  hitType: HitType
): OperationDartResult {
  if (!state.match) throw new Error('No match started')

  const leg = getCurrentLeg(state)
  if (!leg) throw new Error('No active leg')
  if (leg.isComplete) throw new Error('Leg already complete')

  const ps = leg.players.find(p => p.playerId === playerId)
  if (!ps) throw new Error('Player not found in leg')
  if (ps.dartsThrown >= DARTS_PER_LEG) throw new Error('Player already threw all darts')

  const points = calculatePoints(hitType, leg.targetNumber)
  const dartIndexGlobal = ps.dartsThrown + 1
  const turnIndex = getCurrentTurnIndex(ps.dartsThrown)
  const dartInTurn = getCurrentDartInTurn(ps.dartsThrown)

  const dartEvent: OperationDartEvent = {
    type: 'OperationDart',
    eventId: id(),
    matchId: state.match.matchId,
    ts: now(),
    playerId,
    legIndex: leg.legIndex,
    dartIndexGlobal,
    turnIndex,
    dartInTurn,
    hitType,
    points,
  }

  const result: OperationDartResult = { dartEvent }

  // Pruefen ob das Leg nach diesem Dart fertig ist
  const newDartsThrown = ps.dartsThrown + 1
  const allPlayersWillBeDone = leg.players.every(p => {
    if (p.playerId === playerId) return newDartsThrown >= DARTS_PER_LEG
    return p.dartsThrown >= DARTS_PER_LEG
  })

  // Pruefen ob der aktuelle Spieler-Turn vorbei ist und dann ob alle fertig
  const dartsAfter = newDartsThrown % DARTS_PER_TURN
  const turnComplete = dartsAfter === 0 || newDartsThrown >= DARTS_PER_LEG

  if (allPlayersWillBeDone) {
    // Leg fertig
    const playerScores: Record<string, number> = {}
    const playerHitScores: Record<string, number> = {}
    const dartHitScore = calculateHitScore(hitType)
    for (const p of leg.players) {
      if (p.playerId === playerId) {
        playerScores[p.playerId] = p.totalScore + points
        playerHitScores[p.playerId] = p.hitScore + dartHitScore
      } else {
        playerScores[p.playerId] = p.totalScore
        playerHitScores[p.playerId] = p.hitScore
      }
    }

    // Winner = hoechster Hit Score (faire Bewertung unabhaengig von Zielzahl)
    let winnerId: string | null = null
    let bestHitScore = -1
    let tieCount = 0
    for (const [pid, hs] of Object.entries(playerHitScores)) {
      if (hs > bestHitScore) {
        bestHitScore = hs
        winnerId = pid
        tieCount = 1
      } else if (hs === bestHitScore) {
        tieCount++
      }
    }
    // Gleichstand → kein Winner
    if (tieCount > 1) winnerId = null

    result.legFinished = {
      type: 'OperationLegFinished',
      eventId: id(),
      matchId: state.match.matchId,
      ts: now(),
      legIndex: leg.legIndex,
      playerScores,
      playerHitScores,
      winnerId,
    }

    // Pruefen ob Match fertig (alle Legs gespielt)
    const legsPlayed = leg.legIndex + 1
    if (legsPlayed >= state.match.config.legsCount) {
      // Match fertig
      const finalScores: Record<string, number> = {}
      const finalHitScores: Record<string, number> = {}
      const legWins: Record<string, number> = {}
      for (const p of state.match.players) {
        const totals = state.totalsByPlayer[p.playerId]
        finalScores[p.playerId] = (totals?.totalScore ?? 0) + (playerScores[p.playerId] ?? 0)
        finalHitScores[p.playerId] = (totals?.totalHitScore ?? 0) + (playerHitScores[p.playerId] ?? 0)
        legWins[p.playerId] = (totals?.legsWon ?? 0) + (winnerId === p.playerId ? 1 : 0)
      }

      // Gesamtsieger = hoechster Hit Score
      let matchWinnerId: string | null = null
      let matchBestHitScore = -1
      let matchTieCount = 0
      for (const [pid, hs] of Object.entries(finalHitScores)) {
        if (hs > matchBestHitScore) {
          matchBestHitScore = hs
          matchWinnerId = pid
          matchTieCount = 1
        } else if (hs === matchBestHitScore) {
          matchTieCount++
        }
      }
      if (matchTieCount > 1) matchWinnerId = null

      const totalDarts = state.match.players.length * DARTS_PER_LEG * legsPlayed
      const durationMs = Date.now() - state.startTime

      result.matchFinished = {
        type: 'OperationMatchFinished',
        eventId: id(),
        matchId: state.match.matchId,
        ts: now(),
        winnerId: matchWinnerId,
        totalDarts,
        durationMs,
        finalScores,
        finalHitScores,
        legWins,
      }
    }
  }

  return result
}

// ===== Leg Management =====

export function startNewLeg(
  state: OperationState,
  targetMode: OperationTargetMode,
  targetNumber?: number
): OperationLegStartedEvent {
  if (!state.match) throw new Error('No match started')

  const legIndex = state.currentLegIndex + 1
  const resolvedTarget = targetMode === 'RANDOM_NUMBER'
    ? (targetNumber ?? generateTargetNumber())
    : targetMode === 'MANUAL_NUMBER'
      ? targetNumber
      : undefined

  return {
    type: 'OperationLegStarted',
    eventId: id(),
    matchId: state.match.matchId,
    ts: now(),
    legIndex,
    targetMode,
    targetNumber: resolvedTarget,
  }
}

// ===== Constants Export =====
export { DARTS_PER_LEG, DARTS_PER_TURN, TURNS_PER_LEG }
