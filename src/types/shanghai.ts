// src/types/shanghai.ts
// Types fuer Shanghai Darts Spielmodus

/** Spieler */
export type ShanghaiPlayer = {
  playerId: string
  name: string
  isGuest?: boolean
}

/** Ein einzelner Dart */
export type ShanghaiDart = {
  target: number | 'MISS'
  mult: 1 | 2 | 3
}

/** Match-Konfiguration (minimal v1) */
export type ShanghaiMatchConfig = {}

/** Legs/Sets Struktur */
export type ShanghaiStructure =
  | { kind: 'legs'; bestOfLegs: number }
  | { kind: 'sets'; bestOfSets: number; legsPerSet: number }

// ===== Events (Event-Sourcing) =====

export type ShanghaiMatchStartedEvent = {
  type: 'ShanghaiMatchStarted'
  eventId: string
  matchId: string
  ts: string
  players: ShanghaiPlayer[]
  structure: ShanghaiStructure
  config: ShanghaiMatchConfig
}

export type ShanghaiLegStartedEvent = {
  type: 'ShanghaiLegStarted'
  eventId: string
  matchId: string
  ts: string
  legId: string
  legIndex: number
  setIndex?: number
}

export type ShanghaiTurnAddedEvent = {
  type: 'ShanghaiTurnAdded'
  eventId: string
  matchId: string
  legId: string
  ts: string
  playerId: string
  darts: ShanghaiDart[]
  turnScore: number
  targetNumber: number
  isShanghai: boolean
}

export type ShanghaiRoundFinishedEvent = {
  type: 'ShanghaiRoundFinished'
  eventId: string
  matchId: string
  legId: string
  ts: string
  roundNumber: number
  scoresByPlayer: Record<string, number>
  totalsByPlayer: Record<string, number>
}

export type ShanghaiLegFinishedEvent = {
  type: 'ShanghaiLegFinished'
  eventId: string
  matchId: string
  legId: string
  ts: string
  winnerId: string | null // null = Draw
  finalScores: Record<string, number>
  shanghaiWin: boolean
}

export type ShanghaiSetFinishedEvent = {
  type: 'ShanghaiSetFinished'
  eventId: string
  matchId: string
  ts: string
  setIndex: number
  winnerId: string
}

export type ShanghaiMatchFinishedEvent = {
  type: 'ShanghaiMatchFinished'
  eventId: string
  matchId: string
  ts: string
  winnerId: string | null
  totalDarts: number
  durationMs: number
}

export type ShanghaiEvent =
  | ShanghaiMatchStartedEvent
  | ShanghaiLegStartedEvent
  | ShanghaiTurnAddedEvent
  | ShanghaiRoundFinishedEvent
  | ShanghaiLegFinishedEvent
  | ShanghaiSetFinishedEvent
  | ShanghaiMatchFinishedEvent

// ===== Derived State =====

export type ShanghaiState = {
  match: {
    matchId: string
    players: ShanghaiPlayer[]
    structure: ShanghaiStructure
    config: ShanghaiMatchConfig
  } | null
  currentLegId: string | null
  currentLegIndex: number
  currentSetIndex: number
  turnIndex: number
  startPlayerIndex: number
  startTime: number
  dartsUsedByPlayer: Record<string, number>
  dartsUsedTotalByPlayer: Record<string, number>
  legWinsByPlayer: Record<string, number>
  setWinsByPlayer: Record<string, number>
  totalLegWinsByPlayer: Record<string, number>
  finished: {
    winnerId: string | null
    totalDarts: number
    durationMs: number
  } | null
  events: ShanghaiEvent[]
  // Shanghai-spezifischer State
  shanghaiState: {
    currentRound: number // 1-20
    scoreByPlayer: Record<string, number>
    playersCompletedThisRound: string[]
    currentRoundTurns: Record<string, { darts: ShanghaiDart[]; score: number; isShanghai: boolean }>
  }
}

// ===== Stored Match =====

export type ShanghaiStoredMatch = {
  id: string
  title: string
  createdAt: string
  players: ShanghaiPlayer[]
  structure: ShanghaiStructure
  config: ShanghaiMatchConfig
  events: ShanghaiEvent[]
  finished?: boolean
  finishedAt?: string
  durationMs?: number
  winnerId?: string | null
  winnerDarts?: number
  legWins?: Record<string, number>
  setWins?: Record<string, number>
  finalScores?: Record<string, number>
}
