// src/types/captureTheField.ts
// Types für Capture the Field Spielmodus

/** Spieler */
export type CTFPlayer = {
  playerId: string
  name: string
  isGuest?: boolean
}

/** Ein einzelner Dart */
export type CTFDart = {
  target: number | 'BULL' | 'MISS'
  mult: 1 | 2 | 3
}

/** Ein einzelnes Ziel in der Sequenz */
export type CTFTarget = {
  number: number | 'BULL'
}

/** Wie Treffer gezählt werden (Punkte) */
export type CTFMultiplierMode = 'standard' | 'standard2' | 'single'

/** Feldfolge-Modus: In welcher Reihenfolge die Felder 1-20 durchlaufen werden */
export type CTFSequenceMode = 'ascending' | 'descending' | 'clockwise' | 'counterclockwise' | 'random'

/** Match-Konfiguration */
export type CTFMatchConfig = {
  multiplierMode: CTFMultiplierMode
  rotateOrder: boolean  // Wurfreihenfolge pro Feld rotieren?
  bullPosition?: 'start' | 'end' | 'random'
  retryZeroDrawFields?: boolean  // Bei 0-Draw Feld vor Bull wiederholen?
  sequenceMode?: CTFSequenceMode  // Feldfolge-Modus, default: 'ascending'
}

/** Legs/Sets Struktur */
export type CTFStructure =
  | { kind: 'legs'; bestOfLegs: number }
  | { kind: 'sets'; bestOfSets: number; legsPerSet: number }

// ===== Events (Event-Sourcing) =====

export type CTFMatchStartedEvent = {
  type: 'CTFMatchStarted'
  eventId: string
  matchId: string
  ts: string
  players: CTFPlayer[]
  structure: CTFStructure
  config: CTFMatchConfig
  generatedSequence: CTFTarget[]
}

export type CTFLegStartedEvent = {
  type: 'CTFLegStarted'
  eventId: string
  matchId: string
  ts: string
  legId: string
  legIndex: number
  setIndex?: number
  newSequence?: CTFTarget[]
}

export type CTFTurnAddedEvent = {
  type: 'CTFTurnAdded'
  eventId: string
  matchId: string
  legId: string
  ts: string
  playerId: string
  darts: CTFDart[]
  captureScore: number
}

export type CTFRoundFinishedEvent = {
  type: 'CTFRoundFinished'
  eventId: string
  matchId: string
  legId: string
  ts: string
  fieldIndex: number
  fieldNumber: number | 'BULL'
  scoresByPlayer: Record<string, number>
  winnerId: string | null  // null = Gleichstand
  fieldPoints: Record<string, number>  // 3=Gewonnen, 1=Draw, 0=Verloren
}

export type CTFLegFinishedEvent = {
  type: 'CTFLegFinished'
  eventId: string
  matchId: string
  legId: string
  ts: string
  winnerId: string
  winnerDarts: number
}

export type CTFSetFinishedEvent = {
  type: 'CTFSetFinished'
  eventId: string
  matchId: string
  ts: string
  setIndex: number
  winnerId: string
}

export type CTFMatchFinishedEvent = {
  type: 'CTFMatchFinished'
  eventId: string
  matchId: string
  ts: string
  winnerId: string
  totalDarts: number
  durationMs: number
}

export type CTFEvent =
  | CTFMatchStartedEvent
  | CTFLegStartedEvent
  | CTFTurnAddedEvent
  | CTFRoundFinishedEvent
  | CTFLegFinishedEvent
  | CTFSetFinishedEvent
  | CTFMatchFinishedEvent

// ===== Derived State =====

export type CTFState = {
  match: {
    matchId: string
    players: CTFPlayer[]
    structure: CTFStructure
    config: CTFMatchConfig
    sequence: CTFTarget[]
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
    winnerId: string
    totalDarts: number
    durationMs: number
  } | null
  events: CTFEvent[]
  // Capture-spezifischer State
  captureState: {
    currentFieldIndex: number
    fieldWinners: Record<string, string | null>  // "1" -> playerId | null
    totalScoreByPlayer: Record<string, number>
    totalFieldPointsByPlayer: Record<string, number>
    currentRoundTurns: Record<string, { darts: CTFDart[]; score: number }>
    playersCompletedThisRound: string[]
  }
}

// ===== Stored Match =====

export type CTFStoredMatch = {
  id: string
  title: string
  matchName?: string
  notes?: string
  createdAt: string
  players: CTFPlayer[]
  structure: CTFStructure
  config: CTFMatchConfig
  events: CTFEvent[]
  generatedSequence?: CTFTarget[]
  finished?: boolean
  finishedAt?: string
  durationMs?: number
  winnerId?: string
  winnerDarts?: number
  legWins?: Record<string, number>
  setWins?: Record<string, number>
  captureFieldWinners?: Record<string, string | null>
  captureTotalScores?: Record<string, number>
  captureFieldPoints?: Record<string, number>
}
