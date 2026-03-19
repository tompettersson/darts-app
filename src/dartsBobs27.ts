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
  Bobs27TargetResult,
} from './types/bobs27'

// Re-export aller Types fuer Convenience
export type {
  Bobs27Player, Bobs27Target, Bobs27Config,
  Bobs27Event, Bobs27State, Bobs27PlayerState,
  Bobs27MatchStartedEvent, Bobs27ThrowEvent,
  Bobs27TargetFinishedEvent, Bobs27MatchFinishedEvent,
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
        // Fortschritt = Target-Index bis wohin gespielt wurde.
        // Eliminierter Spieler: currentTargetIndex (= Target wo er rausflog)
        // Fertiger Spieler: currentTargetIndex + 1 (= targets.length)
        const playerRanking = state.match.players.map(p => {
          const ps = state.playerStates[p.playerId]
          if (!ps) return { pid: p.playerId, progress: 0, score: 0 }
          if (p.playerId === playerId) {
            // Aktueller Spieler: State noch nicht aktualisiert
            return {
              pid: p.playerId,
              progress: eliminated ? ps.currentTargetIndex : ps.currentTargetIndex + 1,
              score: finalScores[p.playerId] ?? 0,
            }
          }
          // Andere Spieler: State bereits aktualisiert
          return {
            pid: p.playerId,
            progress: ps.eliminated ? ps.currentTargetIndex : ps.currentTargetIndex,
            score: finalScores[p.playerId] ?? 0,
          }
        })
        // Sortieren: 1. Fortschritt absteigend, 2. Score absteigend
        playerRanking.sort((a, b) => b.progress - a.progress || b.score - a.score)

        let winnerId: string | null = playerRanking[0]?.pid ?? null
        // Bei Gleichstand (gleicher Fortschritt UND gleicher Score): null
        if (playerRanking.length > 1 &&
            playerRanking[0].progress === playerRanking[1].progress &&
            playerRanking[0].score === playerRanking[1].score) {
          winnerId = null
        }

        const totalDarts = Object.values(state.playerStates)
          .reduce((sum, p) => sum + p.totalDarts, 0) + 1 // +1 for current throw
        const durationMs = Date.now() - state.startTime

        result.matchFinished = {
          type: 'Bobs27MatchFinished',
          eventId: id(),
          matchId: state.match.matchId,
          ts: now(),
          winnerId,
          totalDarts,
          durationMs,
          finalScores,
        }
      }
    }
  }

  return result
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
