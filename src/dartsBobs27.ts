// src/dartsBobs27.ts
// Bob's 27 - Eigenstaendige Game Engine
// Start bei 27 Punkten. D1 bis D20 (optional D-Bull).
// 3 Darts pro Target. Treffer = +Doppelwert, kein Treffer = -Doppelwert.
// Score < 0 = eliminiert (Game Over).

import type {
  Bobs27Player, Bobs27Target, Bobs27Config,
  Bobs27Event, Bobs27State, Bobs27PlayerState,
  Bobs27MatchStartedEvent, Bobs27ThrowEvent,
  Bobs27TargetFinishedEvent, Bobs27MatchFinishedEvent,
  Bobs27LegFinishedEvent, Bobs27LegStartedEvent,
  Bobs27TargetResult,
} from './types/bobs27'

// Re-export aller Types fuer Convenience
export type {
  Bobs27Player, Bobs27Target, Bobs27Config,
  Bobs27Event, Bobs27State, Bobs27PlayerState,
  Bobs27MatchStartedEvent, Bobs27ThrowEvent,
  Bobs27TargetFinishedEvent, Bobs27MatchFinishedEvent,
  Bobs27LegFinishedEvent, Bobs27LegStartedEvent,
  Bobs27TargetResult,
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

// ===== Target-Generierung =====

export const DEFAULT_CONFIG: Bobs27Config = {
  startScore: 27,
  dartsPerTarget: 3,
  includeBull: false,
  allowNegative: false,
  legsCount: 1,
}

/**
 * Generiert die Target-Sequenz D1-D20 (+ optional D-Bull).
 */
export function generateTargets(config: Bobs27Config): Bobs27Target[] {
  const targets: Bobs27Target[] = []

  for (let i = 1; i <= 20; i++) {
    targets.push({
      fieldNumber: i,
      label: `D${i}`,
      doubleValue: i * 2,
    })
  }

  if (config.includeBull) {
    targets.push({
      fieldNumber: 25,
      label: 'D-Bull',
      doubleValue: 50,
    })
  }

  return targets
}

// ===== Score-Berechnung =====

/**
 * Berechnet die Score-Aenderung fuer ein abgeschlossenes Target.
 * hits > 0: + (hits × doubleValue)
 * hits === 0: - doubleValue
 */
export function calculateDelta(target: Bobs27Target, hits: number): number {
  if (hits > 0) {
    return hits * target.doubleValue
  }
  return -target.doubleValue
}

// ===== Event Application =====

function createEmptyPlayerState(playerId: string, startScore: number): Bobs27PlayerState {
  return {
    playerId,
    score: startScore,
    currentTargetIndex: 0,
    currentDartNumber: 1,
    hitsOnCurrentTarget: 0,
    targetResults: [],
    eliminated: false,
    eliminatedAtTarget: null,
    finished: false,
    totalDarts: 0,
    totalHits: 0,
  }
}

/**
 * Wendet Bob's 27 Events an und berechnet den abgeleiteten State.
 */
export function applyBobs27Events(events: Bobs27Event[]): Bobs27State {
  const state: Bobs27State = {
    match: null,
    playerStates: {},
    currentPlayerIndex: 0,
    currentLegIndex: 0,
    legWins: {},
    legFinished: false,
    legWinnerId: null,
    legFinalScores: null,
    startTime: 0,
    finished: null,
    events,
  }

  for (const event of events) {
    switch (event.type) {
      case 'Bobs27MatchStarted': {
        state.match = {
          matchId: event.matchId,
          players: event.players,
          config: event.config,
          targets: event.targets,
        }
        for (const p of event.players) {
          state.playerStates[p.playerId] = createEmptyPlayerState(p.playerId, event.config.startScore)
          state.legWins[p.playerId] = 0
        }
        state.startTime = new Date(event.ts).getTime()
        break
      }

      case 'Bobs27Throw': {
        const ps = state.playerStates[event.playerId]
        if (!ps) break
        ps.totalDarts++
        ps.currentDartNumber = event.dartNumber + 1
        if (event.hit) {
          ps.hitsOnCurrentTarget++
          ps.totalHits++
        }
        break
      }

      case 'Bobs27TargetFinished': {
        const ps = state.playerStates[event.playerId]
        if (!ps || !state.match) break

        const target = state.match.targets[event.targetIndex]
        ps.targetResults.push({
          target,
          hits: event.hits,
          dartsThrown: ps.currentDartNumber - 1, // currentDartNumber wurde schon erhoeht
          delta: event.delta,
          scoreAfter: event.newScore,
        })
        ps.score = event.newScore
        ps.hitsOnCurrentTarget = 0
        ps.currentDartNumber = 1

        if (event.eliminated) {
          ps.eliminated = true
          ps.eliminatedAtTarget = event.targetIndex
          ps.finished = true
        } else {
          ps.currentTargetIndex = event.targetIndex + 1
          // Alle Targets durch → Spieler fertig
          if (ps.currentTargetIndex >= state.match.targets.length) {
            ps.finished = true
          }
        }

        // Naechster aktiver Spieler
        if (state.match.players.length > 1) {
          advanceToNextPlayer(state)
        }
        break
      }

      case 'Bobs27LegFinished': {
        state.legFinished = true
        state.legWinnerId = event.winnerId
        state.legFinalScores = event.finalScores
        if (event.winnerId) {
          state.legWins[event.winnerId] = (state.legWins[event.winnerId] ?? 0) + 1
        }
        break
      }

      case 'Bobs27LegStarted': {
        if (!state.match) break
        state.currentLegIndex = event.legIndex
        state.legFinished = false
        state.legWinnerId = null
        state.legFinalScores = null
        // Reset all player states for the new leg
        for (const p of state.match.players) {
          state.playerStates[p.playerId] = createEmptyPlayerState(p.playerId, state.match.config.startScore)
        }
        // Set starter player
        const starterIdx = state.match.players.findIndex(p => p.playerId === event.starterPlayerId)
        state.currentPlayerIndex = starterIdx >= 0 ? starterIdx : 0
        break
      }

      case 'Bobs27MatchFinished': {
        state.finished = {
          winnerId: event.winnerId,
          totalDarts: event.totalDarts,
          durationMs: event.durationMs,
          finalScores: event.finalScores,
        }
        break
      }
    }
  }

  return state
}

/** Setzt currentPlayerIndex auf den naechsten nicht-eliminierten/fertigen Spieler */
function advanceToNextPlayer(state: Bobs27State): void {
  if (!state.match) return
  const count = state.match.players.length
  for (let attempt = 0; attempt < count; attempt++) {
    state.currentPlayerIndex = (state.currentPlayerIndex + 1) % count
    const pid = state.match.players[state.currentPlayerIndex].playerId
    const ps = state.playerStates[pid]
    if (ps && !ps.finished) return
  }
}

// ===== State-Abfragen =====

export function getActivePlayerId(state: Bobs27State): string | null {
  if (!state.match || state.finished) return null
  const player = state.match.players[state.currentPlayerIndex]
  if (!player) return null
  const ps = state.playerStates[player.playerId]
  if (ps?.finished) return null
  return player.playerId
}

export function getCurrentTarget(state: Bobs27State, playerId: string): Bobs27Target | null {
  if (!state.match) return null
  const ps = state.playerStates[playerId]
  if (!ps || ps.finished) return null
  return state.match.targets[ps.currentTargetIndex] ?? null
}

// ===== Throw Recording =====

export type Bobs27ThrowResult = {
  throwEvent: Bobs27ThrowEvent
  targetFinished?: Bobs27TargetFinishedEvent
  legFinished?: Bobs27LegFinishedEvent
  matchFinished?: Bobs27MatchFinishedEvent
}

/**
 * Nimmt einen einzelnen Wurf im Bob's 27 auf.
 * hit = true wenn der Spieler das Double getroffen hat.
 */
export function recordBobs27Throw(
  state: Bobs27State,
  playerId: string,
  hit: boolean
): Bobs27ThrowResult {
  if (!state.match) throw new Error('No match started')

  const ps = state.playerStates[playerId]
  if (!ps) throw new Error('Player not found')
  if (ps.finished) throw new Error('Player already finished')

  const config = state.match.config
  const target = state.match.targets[ps.currentTargetIndex]
  const dartNumber = ps.currentDartNumber

  // Throw-Event
  const throwEvent: Bobs27ThrowEvent = {
    type: 'Bobs27Throw',
    eventId: id(),
    matchId: state.match.matchId,
    ts: now(),
    playerId,
    targetIndex: ps.currentTargetIndex,
    dartNumber,
    hit,
  }

  const result: Bobs27ThrowResult = { throwEvent }

  // Pruefen ob Target fertig: Alle Darts verbraucht
  const hitsAfterThrow = ps.hitsOnCurrentTarget + (hit ? 1 : 0)
  const isLastDart = dartNumber >= config.dartsPerTarget

  if (isLastDart) {
    const delta = calculateDelta(target, hitsAfterThrow)
    const newScore = ps.score + delta
    const eliminated = !config.allowNegative && newScore < 0

    result.targetFinished = {
      type: 'Bobs27TargetFinished',
      eventId: id(),
      matchId: state.match.matchId,
      ts: now(),
      playerId,
      targetIndex: ps.currentTargetIndex,
      hits: hitsAfterThrow,
      delta,
      newScore,
      eliminated,
    }

    // Pruefen ob Match fertig
    if (eliminated || ps.currentTargetIndex + 1 >= state.match.targets.length) {
      // Pruefen ob ALLE Spieler fertig sind
      const allFinished = checkAllPlayersFinished(state, playerId, eliminated)

      if (allFinished) {
        const finalScores: Record<string, number> = {}
        for (const p of state.match.players) {
          const pState = state.playerStates[p.playerId]
          if (p.playerId === playerId) {
            finalScores[p.playerId] = newScore
          } else {
            finalScores[p.playerId] = pState?.score ?? 0
          }
        }

        // Gewinner: Wer weiter gekommen ist (hoeheres Double).
        // Bei gleichem Fortschritt: hoeherer Score gewinnt.
        const { winnerId: legWinnerId } = computeLegWinner(state, playerId, eliminated, finalScores)

        const legsCount = config.legsCount ?? 1
        const winsNeeded = Math.ceil(legsCount / 2)

        if (legsCount > 1) {
          // Multi-leg: Generate LegFinished event
          result.legFinished = {
            type: 'Bobs27LegFinished',
            eventId: id(),
            matchId: state.match.matchId,
            ts: now(),
            legIndex: state.currentLegIndex,
            winnerId: legWinnerId,
            finalScores,
          }

          // Check if match is won
          const updatedLegWins = { ...state.legWins }
          if (legWinnerId) {
            updatedLegWins[legWinnerId] = (updatedLegWins[legWinnerId] ?? 0) + 1
          }

          if (legWinnerId && updatedLegWins[legWinnerId] >= winsNeeded) {
            const totalDarts = Object.values(state.playerStates)
              .reduce((sum, p) => sum + p.totalDarts, 0) + 1
            const durationMs = Date.now() - state.startTime

            result.matchFinished = {
              type: 'Bobs27MatchFinished',
              eventId: id(),
              matchId: state.match.matchId,
              ts: now(),
              winnerId: legWinnerId,
              totalDarts,
              durationMs,
              finalScores,
            }
          }
          // If no match winner yet, game screen will show leg summary and start next leg
        } else {
          // Single-leg: Original behavior — match finishes immediately
          const totalDarts = Object.values(state.playerStates)
            .reduce((sum, p) => sum + p.totalDarts, 0) + 1
          const durationMs = Date.now() - state.startTime

          result.matchFinished = {
            type: 'Bobs27MatchFinished',
            eventId: id(),
            matchId: state.match.matchId,
            ts: now(),
            winnerId: legWinnerId,
            totalDarts,
            durationMs,
            finalScores,
          }
        }
      }
    }
  }

  return result
}

/** Berechnet den Leg-Gewinner basierend auf Fortschritt und Score */
function computeLegWinner(
  state: Bobs27State,
  currentPlayerId: string,
  currentEliminated: boolean,
  finalScores: Record<string, number>
): { winnerId: string | null } {
  if (!state.match) return { winnerId: null }

  const playerRanking = state.match.players.map(p => {
    const ps = state.playerStates[p.playerId]
    if (!ps) return { pid: p.playerId, progress: 0, score: 0 }
    if (p.playerId === currentPlayerId) {
      return {
        pid: p.playerId,
        progress: currentEliminated ? ps.currentTargetIndex : ps.currentTargetIndex + 1,
        score: finalScores[p.playerId] ?? 0,
      }
    }
    return {
      pid: p.playerId,
      progress: ps.eliminated ? ps.currentTargetIndex : ps.currentTargetIndex,
      score: finalScores[p.playerId] ?? 0,
    }
  })
  playerRanking.sort((a, b) => b.progress - a.progress || b.score - a.score)

  let winnerId: string | null = playerRanking[0]?.pid ?? null
  if (playerRanking.length > 1 &&
      playerRanking[0].progress === playerRanking[1].progress &&
      playerRanking[0].score === playerRanking[1].score) {
    winnerId = null
  }

  return { winnerId }
}

/**
 * Erstellt ein Bobs27LegStarted-Event fuer ein neues Leg.
 */
export function startNewBobs27Leg(state: Bobs27State): Bobs27LegStartedEvent {
  if (!state.match) throw new Error('No match started')

  const newLegIndex = state.currentLegIndex + 1
  // Rotate starter: leg 0 = player 0, leg 1 = player 1, etc.
  const starterIdx = newLegIndex % state.match.players.length
  const starterPlayerId = state.match.players[starterIdx].playerId

  return {
    type: 'Bobs27LegStarted',
    eventId: id(),
    matchId: state.match.matchId,
    ts: now(),
    legIndex: newLegIndex,
    starterPlayerId,
  }
}

/** Pruefen ob nach diesem Spieler alle Spieler fertig sind */
function checkAllPlayersFinished(
  state: Bobs27State,
  currentPlayerId: string,
  currentEliminated: boolean
): boolean {
  if (!state.match) return false

  for (const p of state.match.players) {
    if (p.playerId === currentPlayerId) {
      // Aktueller Spieler: fertig wenn eliminiert oder letztes Target
      if (!currentEliminated) {
        const ps = state.playerStates[p.playerId]
        if (ps && ps.currentTargetIndex + 1 < state.match.targets.length) return false
      }
      continue
    }
    const ps = state.playerStates[p.playerId]
    if (ps && !ps.finished) return false
  }
  return true
}
