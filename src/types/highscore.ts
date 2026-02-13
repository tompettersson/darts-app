// src/types/highscore.ts
// Types für Highscore Trainingsspiel

// ===== Player Types =====

export type HighscorePlayer = {
  id: string
  name: string
  isGuest?: boolean
}

// ===== Structure Types =====

export type HighscoreStructure =
  | { kind: 'legs'; targetLegs: number }  // First to X Legs
  | { kind: 'sets'; targetSets: number; legsPerSet: number }

// ===== Dart Types =====

export type HighscoreDart = {
  target: number | 'BULL' | 'MISS'
  mult: 1 | 2 | 3
  value: number  // Berechneter Punktewert (target × mult, BULL = 25/50, MISS = 0)
}

// ===== Event Types =====

export type HighscoreMatchStartedEvent = {
  type: 'HighscoreMatchStarted'
  matchId: string
  players: HighscorePlayer[]
  targetScore: number  // 300-999
  structure: HighscoreStructure
  timestamp: number
}

export type HighscoreLegStartedEvent = {
  type: 'HighscoreLegStarted'
  legId: string
  legIndex: number
  setIndex?: number
  starterIndex: number
  timestamp: number
}

export type HighscoreTurnAddedEvent = {
  type: 'HighscoreTurnAdded'
  playerId: string
  darts: HighscoreDart[]
  turnScore: number  // Summe der Dart-Werte
  runningScore: number  // Score nach diesem Turn
  turnIndex: number  // 0-basierter Index
  dartIndex: number  // Globaler Dart-Index im Leg
  isWinningTurn: boolean
  winningDartIndex?: number  // 0, 1, oder 2 - welcher Dart hat gewonnen
  timestamp: number
}

export type HighscoreLegFinishedEvent = {
  type: 'HighscoreLegFinished'
  legId: string
  winnerId: string
  winnerDarts: number
  winnerScore: number
  rankings: Array<{
    playerId: string
    playerName: string
    finalScore: number
    placement: number
    dartsThrown: number
  }>
  timestamp: number
}

export type HighscoreSetFinishedEvent = {
  type: 'HighscoreSetFinished'
  setIndex: number
  winnerId: string
  legWins: Record<string, number>
  timestamp: number
}

export type HighscoreMatchFinishedEvent = {
  type: 'HighscoreMatchFinished'
  winnerId: string
  totalDarts: number
  durationMs: number
  legWins: Record<string, number>
  setWins?: Record<string, number>
  timestamp: number
}

export type HighscoreEvent =
  | HighscoreMatchStartedEvent
  | HighscoreLegStartedEvent
  | HighscoreTurnAddedEvent
  | HighscoreLegFinishedEvent
  | HighscoreSetFinishedEvent
  | HighscoreMatchFinishedEvent

// ===== Stored Match Type =====

export type HighscoreStoredMatch = {
  id: string
  title: string
  createdAt: string
  players: HighscorePlayer[]
  targetScore: number  // 300-999
  structure: HighscoreStructure
  events: HighscoreEvent[]
  finished?: boolean
  finishedAt?: string
  durationMs?: number
  winnerId?: string
  winnerDarts?: number
  legWins?: Record<string, number>
  setWins?: Record<string, number>
}

// ===== Stats Types =====

export type HighscorePlayerStats = {
  playerId: string
  playerName: string
  finalScore: number
  placement: number  // 1, 2, 3...
  dartsThrown: number
  turnsPlayed: number
  avgPointsPerDart: number
  avgPointsPerTurn: number  // 3-Dart-Average
  bestTurn: number
  highestDart: HighscoreDart | null
  speedRating: number  // targetScore / dartsUsed (nur für Gewinner sinnvoll)
  normalized999Darts?: number  // dartsUsed × (999/targetScore)
}

export type HighscoreLegStats = {
  legIndex: number
  winnerId: string
  winnerDarts: number
  playerStats: HighscorePlayerStats[]
}

export type HighscoreMatchStats = {
  matchId: string
  targetScore: number
  playerCount: number
  totalLegs: number
  totalDuration: number
  overallStats: HighscorePlayerStats[]
  legStats: HighscoreLegStats[]
}

// ===== State Type =====

export type HighscoreState = {
  match: {
    matchId: string
    players: HighscorePlayer[]
    targetScore: number
    structure: HighscoreStructure
  } | null
  currentLegId: string | null
  currentLegIndex: number
  currentSetIndex: number
  scoreByPlayer: Record<string, number>  // Aktueller Score pro Spieler
  dartsUsedByPlayer: Record<string, number>  // Darts im aktuellen Leg
  dartsUsedTotalByPlayer: Record<string, number>  // Gesamt-Darts
  turnIndex: number  // Aktueller Turn-Index im Leg
  currentPlayerIndex: number  // Wer ist dran
  startPlayerIndex: number  // Wer hat das Leg begonnen
  legWinsByPlayer: Record<string, number>
  setWinsByPlayer: Record<string, number>
  finished: {
    winnerId: string
    totalDarts: number
    durationMs: number
  } | null
  events: HighscoreEvent[]
  startTimestamp: number | null
}

// ===== Hilfsfunktionen für Dart-Werte =====

export function computeDartValue(dart: { target: number | 'BULL' | 'MISS'; mult: 1 | 2 | 3 }): number {
  if (dart.target === 'MISS') return 0
  if (dart.target === 'BULL') {
    // Bull: Single = 25, Double = 50 (Triple gibt es nicht, wird als Double behandelt)
    return dart.mult >= 2 ? 50 : 25
  }
  return dart.target * dart.mult
}

export function createHighscoreDart(
  target: number | 'BULL' | 'MISS',
  mult: 1 | 2 | 3
): HighscoreDart {
  return {
    target,
    mult,
    value: computeDartValue({ target, mult })
  }
}
