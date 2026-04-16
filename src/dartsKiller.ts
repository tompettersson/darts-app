// src/dartsKiller.ts
// Killer Darts - Eigenstaendige Game Engine
// 2-8 Spieler. Jeder bekommt eine Zielzahl (1-20).
// Phase 1: Qualifying - eigene Zahl treffen (Double/Triple Ring).
// Phase 2: Killer - gegnerische Zahlen treffen um Leben abzuziehen.
// Letzter Ueberlebender gewinnt.

import type {
  KillerPlayer, KillerDart, KillerMatchConfig, KillerStructure,
  KillerEvent, KillerState, KillerPlayerState,
  KillerMatchStartedEvent, KillerTargetsAssignedEvent,
  KillerTurnAddedEvent, KillerPlayerEliminatedEvent,
  KillerMatchFinishedEvent, KillerLogEntry,
  KillerLegStartedEvent, KillerLegFinishedEvent, KillerSetFinishedEvent,
} from './types/killer'

// Re-export aller Types fuer Convenience
export type {
  KillerPlayer, KillerDart, KillerMatchConfig, KillerStructure,
  KillerEvent, KillerState, KillerPlayerState,
  KillerMatchStartedEvent, KillerTargetsAssignedEvent,
  KillerTurnAddedEvent, KillerPlayerEliminatedEvent,
  KillerMatchFinishedEvent, KillerLogEntry,
  KillerLegStartedEvent, KillerLegFinishedEvent, KillerSetFinishedEvent,
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

export function formatDart(dart: KillerDart): string {
  if (dart.target === 'MISS') return 'Miss'
  const prefix = dart.mult === 3 ? 'T' : dart.mult === 2 ? 'D' : 'S'
  return `${prefix}${dart.target}`
}

// ===== Default Config =====

export function defaultKillerConfig(): KillerMatchConfig {
  return {
    hitsToBecomeKiller: 1,
    qualifyingRing: 'DOUBLE',
    startingLives: 3,
    friendlyFire: true,
    selfHeal: false,
    noNegativeLives: true,
    secretNumbers: false,
    targetAssignment: 'auto',
  }
}

// ===== Target Assignment =====

/**
 * Weist jedem Spieler eine zufaellige einzigartige Zahl (1-20) zu.
 */
export function assignTargetsAuto(players: KillerPlayer[]): { playerId: string; targetNumber: number }[] {
  const numbers = Array.from({ length: 20 }, (_, i) => i + 1)
  // Fisher-Yates Shuffle
  for (let i = numbers.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[numbers[i], numbers[j]] = [numbers[j], numbers[i]]
  }
  return players.map((p, i) => ({
    playerId: p.playerId,
    targetNumber: numbers[i],
  }))
}

// ===== Event Application =====

export function defaultKillerStructure(): KillerStructure {
  return { kind: 'legs', bestOfLegs: 1 }
}

function createEmptyState(): KillerState {
  return {
    phase: 'qualifying',
    players: [],
    playerOrder: [],
    turnIndex: 0,
    roundNumber: 1,
    currentDarts: [],
    events: [],
    config: defaultKillerConfig(),
    matchId: null,
    winnerId: null,
    startTime: 0,
    dartsUsedByPlayer: {},
    log: [],
    structure: defaultKillerStructure(),
    legStartingPlayerIndex: 0,
    currentLegIndex: 0,
    currentSetIndex: 0,
    legWinsByPlayer: {},
    setWinsByPlayer: {},
    currentSetLegWinsByPlayer: {},
  }
}

/**
 * Wendet Killer-Events an und berechnet den abgeleiteten State.
 */
export function applyKillerEvents(events: KillerEvent[]): KillerState {
  const state = createEmptyState()
  state.events = events

  // Runden-Tracking: wenn ein Spieler erneut dran ist, hat eine neue Runde begonnen
  let playedThisRound = new Set<string>()

  for (const event of events) {
    switch (event.type) {
      case 'KillerMatchStarted': {
        state.matchId = event.matchId
        state.config = event.config
        state.structure = event.structure ?? defaultKillerStructure()
        state.playerOrder = event.players.map(p => p.playerId)
        state.players = event.players.map(p => ({
          playerId: p.playerId,
          targetNumber: null,
          qualifyingHits: 0,
          isKiller: false,
          lives: event.config.startingLives,
          isEliminated: false,
        }))
        for (const p of event.players) {
          state.dartsUsedByPlayer[p.playerId] = 0
          state.legWinsByPlayer[p.playerId] = 0
          state.setWinsByPlayer[p.playerId] = 0
          state.currentSetLegWinsByPlayer[p.playerId] = 0
        }
        state.startTime = new Date(event.ts).getTime()
        state.log.push({ ts: event.ts, text: 'Killer Match gestartet', type: 'info' })
        break
      }

      case 'KillerTargetsAssigned': {
        for (const assignment of event.assignments) {
          const ps = state.players.find(p => p.playerId === assignment.playerId)
          if (ps) {
            ps.targetNumber = assignment.targetNumber
          }
        }
        state.log.push({ ts: event.ts, text: 'Zielzahlen zugewiesen', type: 'info' })
        break
      }

      case 'KillerTurnAdded': {
        const ps = state.players.find(p => p.playerId === event.playerId)
        if (!ps) break

        state.dartsUsedByPlayer[event.playerId] =
          (state.dartsUsedByPlayer[event.playerId] ?? 0) + event.darts.length

        // Runde berechnen: Wenn dieser Spieler schon gespielt hat, neue Runde
        if (playedThisRound.has(event.playerId)) {
          state.roundNumber++
          playedThisRound.clear()
        }
        playedThisRound.add(event.playerId)

        const turnRound = state.roundNumber

        // Qualifying-Fortschritt
        if (event.qualifyingHitsGained > 0) {
          ps.qualifyingHits += event.qualifyingHitsGained
          const playerName = getPlayerName(state, event.playerId)
          state.log.push({
            ts: event.ts,
            text: `${playerName} qualifiziert ${ps.qualifyingHits}/${state.config.hitsToBecomeKiller}`,
            type: 'qualifying',
            round: turnRound,
          })
        }

        if (event.becameKiller) {
          ps.isKiller = true
          const playerName = getPlayerName(state, event.playerId)
          state.log.push({
            ts: event.ts,
            text: `${playerName} ist jetzt KILLER!`,
            type: 'info',
            round: turnRound,
          })
        }

        // Leben-Aenderungen
        for (const lc of event.livesChanges) {
          const target = state.players.find(p => p.playerId === lc.playerId)
          if (target) {
            target.lives = lc.newLives
            const playerName = getPlayerName(state, event.playerId)
            const targetName = getPlayerName(state, lc.playerId)
            if (lc.delta < 0) {
              if (lc.playerId === event.playerId) {
                state.log.push({
                  ts: event.ts,
                  text: `${playerName} trifft eigene Zahl! -${Math.abs(lc.delta)} Leben`,
                  type: 'hit',
                  round: turnRound,
                })
              } else {
                state.log.push({
                  ts: event.ts,
                  text: `${playerName} trifft ${targetName}! -${Math.abs(lc.delta)} Leben`,
                  type: 'hit',
                  round: turnRound,
                })
              }
            } else if (lc.delta > 0) {
              state.log.push({
                ts: event.ts,
                text: `${playerName} heilt sich! +${lc.delta} Leben`,
                type: 'heal',
                round: turnRound,
              })
            }
          }
        }

        // Eliminierungen
        for (const elimId of event.eliminations) {
          const elim = state.players.find(p => p.playerId === elimId)
          if (elim) {
            elim.isEliminated = true
            elim.eliminatedInRound = turnRound
          }
        }

        // Phase Check: Wechsel zu killing wenn mindestens 1 Killer
        if (state.phase === 'qualifying' && state.players.some(p => p.isKiller)) {
          state.phase = 'killing'
        }

        // Naechster aktiver Spieler
        advanceTurnIndex(state)
        break
      }

      case 'KillerPlayerEliminated': {
        const elim = state.players.find(p => p.playerId === event.playerId)
        if (elim) {
          elim.isEliminated = true
          elim.eliminatedInRound = state.roundNumber
          const playerName = getPlayerName(state, event.playerId)
          state.log.push({
            ts: event.ts,
            text: `${playerName} ist eliminiert!`,
            type: 'kill',
            round: state.roundNumber,
          })
        }
        break
      }

      case 'KillerLegStarted': {
        state.currentLegIndex = event.legIndex
        state.currentSetIndex = event.setIndex
        // Reset game state fuer neues Leg
        state.phase = 'qualifying'
        state.turnIndex = event.startingPlayerIndex ?? 0
        state.legStartingPlayerIndex = event.startingPlayerIndex ?? 0
        state.roundNumber = 1
        playedThisRound = new Set()
        for (const ps of state.players) {
          ps.targetNumber = null
          ps.qualifyingHits = 0
          ps.isKiller = false
          ps.lives = state.config.startingLives
          ps.isEliminated = false
          ps.eliminatedInRound = undefined
        }
        const setStr = state.structure.kind === 'sets' ? ` Set ${event.setIndex + 1}` : ''
        state.log.push({ ts: event.ts, text: `Leg ${event.legIndex + 1}${setStr} gestartet`, type: 'info' })
        break
      }

      case 'KillerLegFinished': {
        const legWinnerName = getPlayerName(state, event.winnerId)
        state.legWinsByPlayer[event.winnerId] = (state.legWinsByPlayer[event.winnerId] ?? 0) + 1
        state.currentSetLegWinsByPlayer[event.winnerId] = (state.currentSetLegWinsByPlayer[event.winnerId] ?? 0) + 1
        state.log.push({ ts: event.ts, text: `${legWinnerName} gewinnt Leg ${event.legIndex + 1}!`, type: 'info' })
        break
      }

      case 'KillerSetFinished': {
        const setWinnerName = getPlayerName(state, event.winnerId)
        state.setWinsByPlayer[event.winnerId] = (state.setWinsByPlayer[event.winnerId] ?? 0) + 1
        // Reset currentSetLegWins
        for (const pid of state.playerOrder) {
          state.currentSetLegWinsByPlayer[pid] = 0
        }
        state.log.push({ ts: event.ts, text: `${setWinnerName} gewinnt Set ${event.setIndex + 1}!`, type: 'info' })
        break
      }

      case 'KillerMatchFinished': {
        state.phase = 'finished'
        state.winnerId = event.winnerId
        if (event.winnerId) {
          const winnerName = getPlayerName(state, event.winnerId)
          state.log.push({
            ts: event.ts,
            text: `${winnerName} gewinnt!`,
            type: 'info',
          })
        } else {
          state.log.push({
            ts: event.ts,
            text: 'Unentschieden!',
            type: 'info',
          })
        }
        break
      }
    }
  }

  return state
}

// ===== State-Abfragen =====

function getPlayerName(state: KillerState, playerId: string): string {
  // Aus MatchStarted Event den Namen holen
  const startEvt = state.events.find(e => e.type === 'KillerMatchStarted') as KillerMatchStartedEvent | undefined
  return startEvt?.players.find(p => p.playerId === playerId)?.name ?? playerId
}

/**
 * Gibt die playerId des aktiven Spielers zurueck.
 */
export function getActivePlayerId(state: KillerState): string | null {
  if (state.phase === 'finished') return null
  const activePlayers = state.playerOrder.filter(pid => {
    const ps = state.players.find(p => p.playerId === pid)
    return ps && !ps.isEliminated
  })
  if (activePlayers.length === 0) return null
  return activePlayers[state.turnIndex % activePlayers.length] ?? null
}

/**
 * Ruckt den turnIndex zum naechsten aktiven Spieler vor.
 */
function advanceTurnIndex(state: KillerState): void {
  const activePlayers = state.playerOrder.filter(pid => {
    const ps = state.players.find(p => p.playerId === pid)
    return ps && !ps.isEliminated
  })
  if (activePlayers.length === 0) return

  state.turnIndex = (state.turnIndex + 1) % activePlayers.length
}

/**
 * Findet die Target-Nummer eines Spielers anhand seiner playerId.
 */
function getTargetForPlayer(state: KillerState, playerId: string): number | null {
  const ps = state.players.find(p => p.playerId === playerId)
  return ps?.targetNumber ?? null
}

// ===== Turn Recording =====

export type KillerTurnResult = {
  turnEvent: KillerTurnAddedEvent
  eliminationEvents: KillerPlayerEliminatedEvent[]
  matchFinished?: KillerMatchFinishedEvent
  legFinished?: KillerLegFinishedEvent
  setFinished?: KillerSetFinishedEvent
  /** Events fuer den Start des naechsten Legs (anzuwenden nach Intermission) */
  pendingNextEvents?: KillerEvent[]
  /** Bei manual-Modus: Spieler muessen Zahlen neu waehlen */
  needsManualAssignment?: boolean
}

/**
 * Nimmt einen Turn im Killer-Spiel auf.
 * Hauptfunktion fuer die Spiellogik.
 */
export function recordKillerTurn(
  state: KillerState,
  playerId: string,
  darts: KillerDart[]
): KillerTurnResult {
  if (!state.matchId) throw new Error('No match started')

  const config = state.config
  const ps = state.players.find(p => p.playerId === playerId)
  if (!ps) throw new Error('Player not found')
  if (ps.isEliminated) throw new Error('Player is eliminated')

  const myTarget = ps.targetNumber
  if (myTarget === null) throw new Error('Player has no target number')

  let qualifyingHitsGained = 0
  let becameKiller = false
  const livesChanges: { playerId: string; delta: number; newLives: number }[] = []
  const eliminations: string[] = []

  const requiredMult = config.qualifyingRing === 'TRIPLE' ? 3 : 2

  // ===== Darts sequenziell verarbeiten (Mid-Turn Killer-Aktivierung) =====
  const hitsOnPlayers: Record<string, number> = {}
  let isCurrentlyKiller = ps.isKiller

  for (const dart of darts) {
    if (dart.target === 'MISS') continue

    if (!isCurrentlyKiller) {
      // Qualifying-Dart: eigene Zahl im richtigen Ring treffen
      // eslint-disable-next-line eqeqeq
      if (dart.target == myTarget && Number(dart.mult) >= requiredMult) {
        qualifyingHitsGained++
        if (ps.qualifyingHits + qualifyingHitsGained >= config.hitsToBecomeKiller) {
          isCurrentlyKiller = true
          becameKiller = true
        }
      }
    } else {
      // Killer-Dart (auch direkt nach Qualifying im selben Turn)
      if (Number(dart.mult) < requiredMult) continue
      for (const otherPs of state.players) {
        if (otherPs.isEliminated) continue
        // eslint-disable-next-line eqeqeq
        if (otherPs.targetNumber == dart.target) {
          hitsOnPlayers[otherPs.playerId] = (hitsOnPlayers[otherPs.playerId] ?? 0) + 1
          break
        }
      }
    }
  }

  // Leben-Aenderungen berechnen
  for (const [hitPlayerId, hitCount] of Object.entries(hitsOnPlayers)) {
    if (hitPlayerId === playerId) {
      // Eigene Zahl getroffen
      if (config.selfHeal) {
        // Self-Heal: +1 Leben pro Treffer
        const newLives = ps.lives + hitCount
        livesChanges.push({ playerId: hitPlayerId, delta: hitCount, newLives })
      } else if (config.friendlyFire) {
        // Friendly Fire: -1 pro Treffer
        let newLives = ps.lives - hitCount
        if (config.noNegativeLives) newLives = Math.max(0, newLives)
        livesChanges.push({ playerId: hitPlayerId, delta: -hitCount, newLives })
      }
    } else {
      // Gegnerische Zahl getroffen: -1 pro Treffer
      const target = state.players.find(p => p.playerId === hitPlayerId)
      if (target) {
        let newLives = target.lives - hitCount
        if (config.noNegativeLives) newLives = Math.max(0, newLives)
        livesChanges.push({ playerId: hitPlayerId, delta: -hitCount, newLives })
      }
    }
  }

  // Eliminierungen pruefen
  for (const lc of livesChanges) {
    if (lc.newLives <= 0 && lc.delta < 0) {
      const target = state.players.find(p => p.playerId === lc.playerId)
      if (target && !target.isEliminated) {
        eliminations.push(lc.playerId)
      }
    }
  }

  // Runde berechnen: Wenn wir am Ende der aktiven Spieler sind, erhoehen
  const activePlayers = state.playerOrder.filter(pid => {
    const p = state.players.find(pp => pp.playerId === pid)
    return p && !p.isEliminated && !eliminations.includes(pid)
  })
  const currentActiveIndex = activePlayers.indexOf(playerId)
  const isLastInRound = currentActiveIndex === activePlayers.length - 1
  const roundNumber = isLastInRound ? state.roundNumber + 1 : state.roundNumber

  // Turn-Event erstellen
  const turnEvent: KillerTurnAddedEvent = {
    type: 'KillerTurnAdded',
    eventId: id(),
    matchId: state.matchId,
    ts: now(),
    playerId,
    darts,
    qualifyingHitsGained,
    becameKiller,
    livesChanges,
    eliminations,
    roundNumber,
  }

  // Elimination-Events
  const eliminationEvents: KillerPlayerEliminatedEvent[] = eliminations.map(elimId => ({
    type: 'KillerPlayerEliminated' as const,
    eventId: id(),
    matchId: state.matchId!,
    ts: now(),
    playerId: elimId,
    eliminatedBy: playerId,
    roundNumber: state.roundNumber,
  }))

  const result: KillerTurnResult = { turnEvent, eliminationEvents }

  // Pruefen ob nur noch 1 Spieler uebrig
  const remainingAfter = state.players.filter(p =>
    !p.isEliminated && !eliminations.includes(p.playerId)
  )

  if (remainingAfter.length <= 1) {
    const legWinnerId = remainingAfter.length === 1 ? remainingAfter[0].playerId : null

    // Leg-Progression pruefen
    const progression = finishKillerLegProgression(state, legWinnerId)

    if (progression.matchFinished) {
      // Match ist vorbei
      const standings = computeFinalStandings(state, eliminations, legWinnerId)
      const totalDarts = Object.values(state.dartsUsedByPlayer)
        .reduce((a, b) => a + b, 0) + darts.length
      const durationMs = Date.now() - state.startTime

      result.legFinished = progression.legFinished
      result.setFinished = progression.setFinished
      result.matchFinished = {
        type: 'KillerMatchFinished',
        eventId: id(),
        matchId: state.matchId!,
        ts: now(),
        winnerId: legWinnerId,
        finalStandings: standings,
        totalDarts,
        durationMs,
      }
    } else {
      // Neues Leg starten (nach Intermission)
      result.legFinished = progression.legFinished
      result.setFinished = progression.setFinished
      result.pendingNextEvents = progression.pendingNextEvents
      result.needsManualAssignment = progression.needsManualAssignment
    }
  }

  return result
}

/**
 * Erstellt ein KillerLegStartedEvent + ggf. neue TargetsAssigned fuer das naechste Leg.
 */
function createNextLegEvents(
  state: KillerState,
  nextLegIndex: number,
  nextSetIndex: number,
): KillerEvent[] {
  const events: KillerEvent[] = []

  // Startspieler rotieren
  const nextStartingPlayer = (state.legStartingPlayerIndex + 1) % state.playerOrder.length

  events.push({
    type: 'KillerLegStarted',
    eventId: id(),
    matchId: state.matchId!,
    ts: now(),
    legIndex: nextLegIndex,
    setIndex: nextSetIndex,
    startingPlayerIndex: nextStartingPlayer,
  })

  // Bei auto-assignment: neue Targets pro Leg
  if (state.config.targetAssignment === 'auto') {
    const startEvt = state.events.find(e => e.type === 'KillerMatchStarted') as KillerMatchStartedEvent | undefined
    if (startEvt) {
      const players = startEvt.players
      events.push({
        type: 'KillerTargetsAssigned',
        eventId: id(),
        matchId: state.matchId!,
        ts: now(),
        assignments: assignTargetsAuto(players),
      })
    }
  }
  // Manual: kein TargetsAssigned-Event hier — wird vom UI nach Auswahl erstellt

  return events
}

/**
 * Prueft ob nach einem Leg-Gewinn das Match vorbei ist oder ein neues Leg startet.
 */
function finishKillerLegProgression(
  state: KillerState,
  legWinnerId: string | null,
): {
  matchFinished: boolean
  legFinished?: KillerLegFinishedEvent
  setFinished?: KillerSetFinishedEvent
  pendingNextEvents?: KillerEvent[]
  needsManualAssignment?: boolean
} {
  const structure = state.structure

  if (!legWinnerId) {
    // Kein Gewinner (sollte selten passieren) -> Match beenden
    return { matchFinished: true }
  }

  // LegFinished Event
  const legFinished: KillerLegFinishedEvent = {
    type: 'KillerLegFinished',
    eventId: id(),
    matchId: state.matchId!,
    ts: now(),
    legIndex: state.currentLegIndex,
    setIndex: state.currentSetIndex,
    winnerId: legWinnerId,
  }

  if (structure.kind === 'legs') {
    const totalLegWins = (state.legWinsByPlayer[legWinnerId] ?? 0) + 1
    const legsNeeded = Math.ceil(structure.bestOfLegs / 2)

    if (totalLegWins >= legsNeeded) {
      // Match gewonnen
      return { matchFinished: true, legFinished }
    }

    // Neues Leg
    const isManual = state.config.targetAssignment === 'manual'
    const nextEvents = createNextLegEvents(state, state.currentLegIndex + 1, 0)
    return { matchFinished: false, legFinished, pendingNextEvents: nextEvents, needsManualAssignment: isManual || undefined }
  }

  // Sets-Modus
  const currentSetLegWins = (state.currentSetLegWinsByPlayer[legWinnerId] ?? 0) + 1
  const legsNeeded = Math.ceil(structure.legsPerSet / 2)

  if (currentSetLegWins >= legsNeeded) {
    // Set gewonnen
    const setFinished: KillerSetFinishedEvent = {
      type: 'KillerSetFinished',
      eventId: id(),
      matchId: state.matchId!,
      ts: now(),
      setIndex: state.currentSetIndex,
      winnerId: legWinnerId,
    }

    const totalSetWins = (state.setWinsByPlayer[legWinnerId] ?? 0) + 1
    const setsNeeded = Math.ceil(structure.bestOfSets / 2)

    if (totalSetWins >= setsNeeded) {
      // Match gewonnen
      return { matchFinished: true, legFinished, setFinished }
    }

    // Neues Set, neues Leg
    const isManualS = state.config.targetAssignment === 'manual'
    const nextEvents = createNextLegEvents(state, state.currentLegIndex + 1, state.currentSetIndex + 1)
    return { matchFinished: false, legFinished, setFinished, pendingNextEvents: nextEvents, needsManualAssignment: isManualS || undefined }
  }

  // Gleicher Set, neues Leg
  const isManualL = state.config.targetAssignment === 'manual'
  const nextEvents = createNextLegEvents(state, state.currentLegIndex + 1, state.currentSetIndex)
  return { matchFinished: false, legFinished, pendingNextEvents: nextEvents, needsManualAssignment: isManualL || undefined }
}

/**
 * Berechnet die Final Standings basierend auf Eliminierungsreihenfolge.
 */
function computeFinalStandings(
  state: KillerState,
  newEliminations: string[],
  winnerId: string | null
): { playerId: string; position: number; lives: number }[] {
  // Alle Spieler sammeln mit ihrer Eliminierungsreihenfolge
  const standings: { playerId: string; position: number; lives: number; eliminatedInRound: number }[] = []

  for (const ps of state.players) {
    if (ps.playerId === winnerId) {
      standings.push({
        playerId: ps.playerId,
        position: 1,
        lives: ps.lives,
        eliminatedInRound: Infinity,
      })
    } else if (newEliminations.includes(ps.playerId)) {
      standings.push({
        playerId: ps.playerId,
        position: 0, // wird gleich berechnet
        lives: 0,
        eliminatedInRound: state.roundNumber,
      })
    } else if (ps.isEliminated) {
      standings.push({
        playerId: ps.playerId,
        position: 0,
        lives: 0,
        eliminatedInRound: ps.eliminatedInRound ?? 0,
      })
    } else {
      standings.push({
        playerId: ps.playerId,
        position: 0,
        lives: ps.lives,
        eliminatedInRound: Infinity,
      })
    }
  }

  // Sortieren: Spaeter eliminiert = bessere Position
  standings.sort((a, b) => b.eliminatedInRound - a.eliminatedInRound)

  // Positionen zuweisen
  for (let i = 0; i < standings.length; i++) {
    standings[i].position = i + 1
  }

  return standings.map(s => ({
    playerId: s.playerId,
    position: s.position,
    lives: s.lives,
  }))
}
