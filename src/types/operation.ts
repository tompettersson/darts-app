// src/types/operation.ts
// Types fuer Operation - "Ein Feld keine Gnade"
// Praezisionstraining auf ein Zielsegment ueber 30 Darts pro Spieler und Leg.

/** Spieler */
export type OperationPlayer = {
  playerId: string
  name: string
  isGuest?: boolean
}

/** Ziel-Modus */
export type OperationTargetMode = 'MANUAL_NUMBER' | 'RANDOM_NUMBER' | 'BULL'

/** Match-Konfiguration */
export type OperationConfig = {
  legsCount: number
  targetMode: OperationTargetMode
  targetNumber?: number  // 1-20, nur bei MANUAL_NUMBER
}

/** Treffer-Typ */
export type HitType = 'NO_SCORE' | 'SINGLE' | 'DOUBLE' | 'TRIPLE' | 'SINGLE_BULL' | 'DOUBLE_BULL'

// ===== Events (Event-Sourcing) =====

export type OperationMatchStartedEvent = {
  type: 'OperationMatchStarted'
  eventId: string
  matchId: string
  ts: string
  players: OperationPlayer[]
  config: OperationConfig
}

export type OperationLegStartedEvent = {
  type: 'OperationLegStarted'
  eventId: string
  matchId: string
  ts: string
  legIndex: number
  targetMode: OperationTargetMode
  targetNumber?: number   // 1-20 fuer NUMBER-Modi, undefined fuer BULL
}

export type OperationDartEvent = {
  type: 'OperationDart'
  eventId: string
  matchId: string
  ts: string
  playerId: string
  legIndex: number
  dartIndexGlobal: number    // 1-30
  turnIndex: number          // 1-10
  dartInTurn: number         // 1, 2, oder 3 (letzter Turn kann 1 sein wenn 29 Darts geworfen)
  hitType: HitType
  points: number
}

export type OperationLegFinishedEvent = {
  type: 'OperationLegFinished'
  eventId: string
  matchId: string
  ts: string
  legIndex: number
  playerScores: Record<string, number>
  playerHitScores?: Record<string, number>
  winnerId: string | null
}

export type OperationMatchFinishedEvent = {
  type: 'OperationMatchFinished'
  eventId: string
  matchId: string
  ts: string
  winnerId: string | null
  totalDarts: number
  durationMs: number
  finalScores: Record<string, number>
  finalHitScores?: Record<string, number>
  legWins: Record<string, number>
}

export type OperationEvent =
  | OperationMatchStartedEvent
  | OperationLegStartedEvent
  | OperationDartEvent
  | OperationLegFinishedEvent
  | OperationMatchFinishedEvent

// ===== Derived State =====

export type OperationPlayerLegState = {
  playerId: string
  dartsThrown: number          // 0-30
  totalScore: number
  hitScore: number             // normalisierter Treffer-Score (S=1, D=2, T=3)
  currentHitStreak: number
  maxHitStreak: number
  noScoreCount: number
  singleCount: number
  doubleCount: number
  tripleCount: number
  singleBullCount: number
  doubleBullCount: number
  events: OperationDartEvent[]
}

export type OperationLegState = {
  legIndex: number
  targetMode: OperationTargetMode
  targetNumber?: number
  players: OperationPlayerLegState[]
  currentPlayerIndex: number
  isComplete: boolean
}

export type OperationPlayerTotals = {
  playerId: string
  totalScore: number
  totalHitScore: number
  legsWon: number
}

export type OperationState = {
  match: {
    matchId: string
    players: OperationPlayer[]
    config: OperationConfig
  } | null
  legs: OperationLegState[]
  currentLegIndex: number
  totalsByPlayer: Record<string, OperationPlayerTotals>
  isComplete: boolean
  finished: {
    winnerId: string | null
    totalDarts: number
    durationMs: number
    finalScores: Record<string, number>
    finalHitScores: Record<string, number>
    legWins: Record<string, number>
  } | null
  startTime: number
  events: OperationEvent[]
}

// ===== Stored Match =====

export type OperationStoredMatch = {
  id: string
  title: string
  matchName?: string
  notes?: string
  createdAt: string
  players: OperationPlayer[]
  config: OperationConfig
  events: OperationEvent[]
  finished?: boolean
  finishedAt?: string
  durationMs?: number
  winnerId?: string | null
  legWins?: Record<string, number>
  finalScores?: Record<string, number>
}
