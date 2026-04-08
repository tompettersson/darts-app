// src/types/bobs27.ts
// Types fuer Bob's 27 Darts Trainingsmodus
// Start-Score: 27. Ziel: Doubles D1-D20. Treffer = +Doppelwert, Fehler = -Doppelwert. Score < 0 = Game Over.

/** Spieler */
export type Bobs27Player = {
  playerId: string
  name: string
  isGuest?: boolean
}

/** Ein einzelnes Target im Spiel */
export type Bobs27Target = {
  fieldNumber: number    // 1-20 (oder 25 fuer Bull)
  label: string          // z.B. "D5", "D-Bull"
  doubleValue: number    // 2×fieldNumber (oder 50 fuer Bull)
}

/** Match-Konfiguration */
export type Bobs27Config = {
  startScore: number             // Default: 27
  dartsPerTarget: number         // Default: 3
  includeBull: boolean           // D-Bull als 21. Ziel
  allowNegative: boolean         // true = Score darf unter 0 gehen, false = Game Over bei < 0
  legsCount: number              // "Best of" value (1=single, 3=FT2, 5=FT3, etc.)
}

// ===== Events (Event-Sourcing) =====

export type Bobs27MatchStartedEvent = {
  type: 'Bobs27MatchStarted'
  eventId: string
  matchId: string
  ts: string
  players: Bobs27Player[]
  config: Bobs27Config
  targets: Bobs27Target[]
}

export type Bobs27ThrowEvent = {
  type: 'Bobs27Throw'
  eventId: string
  matchId: string
  ts: string
  playerId: string
  targetIndex: number       // Index in targets Array
  dartNumber: number        // 1, 2, oder 3
  hit: boolean              // Treffer auf das Double?
}

export type Bobs27TargetFinishedEvent = {
  type: 'Bobs27TargetFinished'
  eventId: string
  matchId: string
  ts: string
  playerId: string
  targetIndex: number
  hits: number              // Anzahl Treffer auf dieses Target
  delta: number             // Score-Aenderung (+ oder -)
  newScore: number          // Score nach Anwendung
  eliminated: boolean       // Score < 0 → Game Over
}

export type Bobs27MatchFinishedEvent = {
  type: 'Bobs27MatchFinished'
  eventId: string
  matchId: string
  ts: string
  winnerId: string | null   // Hoechster Score, null bei Gleichstand
  totalDarts: number
  durationMs: number
  finalScores: Record<string, number>
}

export type Bobs27LegFinishedEvent = {
  type: 'Bobs27LegFinished'
  eventId: string
  matchId: string
  ts: string
  legIndex: number
  winnerId: string | null
  finalScores: Record<string, number>
}

export type Bobs27LegStartedEvent = {
  type: 'Bobs27LegStarted'
  eventId: string
  matchId: string
  ts: string
  legIndex: number
  starterPlayerId: string
}

export type Bobs27Event =
  | Bobs27MatchStartedEvent
  | Bobs27ThrowEvent
  | Bobs27TargetFinishedEvent
  | Bobs27LegFinishedEvent
  | Bobs27LegStartedEvent
  | Bobs27MatchFinishedEvent

// ===== Derived State =====

export type Bobs27TargetResult = {
  target: Bobs27Target
  hits: number
  dartsThrown: number
  delta: number
  scoreAfter: number
}

export type Bobs27PlayerState = {
  playerId: string
  score: number
  currentTargetIndex: number
  currentDartNumber: number   // 1, 2, 3
  hitsOnCurrentTarget: number
  targetResults: Bobs27TargetResult[]
  eliminated: boolean
  eliminatedAtTarget: number | null
  finished: boolean
  totalDarts: number
  totalHits: number
}

export type Bobs27State = {
  match: {
    matchId: string
    players: Bobs27Player[]
    config: Bobs27Config
    targets: Bobs27Target[]
  } | null
  playerStates: Record<string, Bobs27PlayerState>
  currentPlayerIndex: number
  currentLegIndex: number
  legWins: Record<string, number>
  legFinished: boolean
  legWinnerId: string | null
  legFinalScores: Record<string, number> | null
  startTime: number
  finished: {
    winnerId: string | null
    totalDarts: number
    durationMs: number
    finalScores: Record<string, number>
  } | null
  events: Bobs27Event[]
}

// ===== Stored Match =====

export type Bobs27StoredMatch = {
  id: string
  title: string
  createdAt: string
  players: Bobs27Player[]
  config: Bobs27Config
  targets: Bobs27Target[]
  events: Bobs27Event[]
  finished?: boolean
  finishedAt?: string
  durationMs?: number
  winnerId?: string | null
  winnerDarts?: number
  finalScores?: Record<string, number>
  legWins?: Record<string, number>
}
