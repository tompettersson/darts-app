// src/types/killer.ts
// Types fuer Killer Darts Spielmodus

/** Spieler */
export type KillerPlayer = {
  playerId: string
  name: string
  isGuest?: boolean
}

/** Ein einzelner Dart */
export type KillerDart = {
  target: number | 'MISS'
  mult: 1 | 2 | 3
}

/** Legs/Sets Struktur (analog zu Shanghai) */
export type KillerStructure =
  | { kind: 'legs'; bestOfLegs: number }
  | { kind: 'sets'; bestOfSets: number; legsPerSet: number }

/** Match-Konfiguration */
export type KillerMatchConfig = {
  hitsToBecomeKiller: number       // 1-5, default 1
  qualifyingRing: 'DOUBLE' | 'TRIPLE'  // default DOUBLE
  startingLives: number            // 1-5, default 3
  friendlyFire: boolean            // Killer trifft eigene Zahl -> eigene Leben -1 (default true)
  selfHeal: boolean                // Killer trifft eigene Zahl -> +1 Leben (default false)
  noNegativeLives: boolean         // Leben nicht unter 0 (default true)
  secretNumbers: boolean           // Gegner-Zahlen verbergen (default false)
  targetAssignment: 'auto' | 'manual'  // default auto
}

/** Spieler-Zustand waehrend des Spiels */
export type KillerPlayerState = {
  playerId: string
  targetNumber: number | null      // null bis zugewiesen (manual mode)
  qualifyingHits: number           // 0..hitsToBecomeKiller
  isKiller: boolean
  lives: number
  isEliminated: boolean
  eliminatedInRound?: number
}

// ===== Events (Event-Sourcing) =====

export type KillerMatchStartedEvent = {
  type: 'KillerMatchStarted'
  eventId: string
  matchId: string
  ts: string
  players: KillerPlayer[]
  config: KillerMatchConfig
  structure?: KillerStructure
}

export type KillerTargetsAssignedEvent = {
  type: 'KillerTargetsAssigned'
  eventId: string
  matchId: string
  ts: string
  assignments: { playerId: string; targetNumber: number }[]
}

export type KillerTurnAddedEvent = {
  type: 'KillerTurnAdded'
  eventId: string
  matchId: string
  ts: string
  playerId: string
  darts: KillerDart[]
  qualifyingHitsGained: number
  becameKiller: boolean
  livesChanges: { playerId: string; delta: number; newLives: number }[]
  eliminations: string[]
  roundNumber: number
}

export type KillerPlayerEliminatedEvent = {
  type: 'KillerPlayerEliminated'
  eventId: string
  matchId: string
  ts: string
  playerId: string
  eliminatedBy: string
  roundNumber: number
}

export type KillerMatchFinishedEvent = {
  type: 'KillerMatchFinished'
  eventId: string
  matchId: string
  ts: string
  winnerId: string | null
  finalStandings: { playerId: string; position: number; lives: number }[]
  totalDarts: number
  durationMs: number
}

export type KillerLegStartedEvent = {
  type: 'KillerLegStarted'
  eventId: string
  matchId: string
  ts: string
  legIndex: number
  setIndex: number
  startingPlayerIndex?: number
}

export type KillerLegFinishedEvent = {
  type: 'KillerLegFinished'
  eventId: string
  matchId: string
  ts: string
  legIndex: number
  setIndex: number
  winnerId: string
}

export type KillerSetFinishedEvent = {
  type: 'KillerSetFinished'
  eventId: string
  matchId: string
  ts: string
  setIndex: number
  winnerId: string
}

export type KillerEvent =
  | KillerMatchStartedEvent
  | KillerTargetsAssignedEvent
  | KillerTurnAddedEvent
  | KillerPlayerEliminatedEvent
  | KillerMatchFinishedEvent
  | KillerLegStartedEvent
  | KillerLegFinishedEvent
  | KillerSetFinishedEvent

// ===== Derived State =====

export type KillerLogEntry = {
  ts: string
  text: string
  type: 'qualifying' | 'hit' | 'kill' | 'heal' | 'info'
}

export type KillerState = {
  phase: 'qualifying' | 'killing' | 'finished'
  players: KillerPlayerState[]
  playerOrder: string[]
  turnIndex: number
  roundNumber: number
  currentDarts: KillerDart[]
  events: KillerEvent[]
  config: KillerMatchConfig
  matchId: string | null
  winnerId: string | null
  startTime: number
  dartsUsedByPlayer: Record<string, number>
  log: KillerLogEntry[]
  // Legs/Sets
  structure: KillerStructure
  legStartingPlayerIndex: number
  currentLegIndex: number
  currentSetIndex: number
  legWinsByPlayer: Record<string, number>
  setWinsByPlayer: Record<string, number>
  /** Leg-wins in aktueller Set fuer Sets-Modus */
  currentSetLegWinsByPlayer: Record<string, number>
}

// ===== Stored Match =====

export type KillerStoredMatch = {
  id: string
  title: string
  createdAt: string
  players: KillerPlayer[]
  config: KillerMatchConfig
  events: KillerEvent[]
  finished?: boolean
  finishedAt?: string
  durationMs?: number
  winnerId?: string | null
  winnerDarts?: number
  finalStandings?: { playerId: string; position: number; lives: number }[]
  structure?: KillerStructure
  legWins?: Record<string, number>
  setWins?: Record<string, number>
}
