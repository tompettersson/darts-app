// src/types/stats.ts
// Zentrale Typen für UI & Stats-Darstellung (X01 + Cricket + Leaderboards)

// ---------------------------------------------
// Basis
// ---------------------------------------------

export type GameMode = 'x01' | 'cricket'

export interface BasePlayerRef {
  playerId: string
  playerName: string
}

// ---------------------------------------------
// X01: langfristige Karriere-Stats pro Spieler
// (aus storage.ts -> X01PlayerLongTermStats)
// ---------------------------------------------

export interface X01PlayerLongTermStats {
  playerId: string
  playerName?: string

  matchesPlayed: number
  matchesWon: number

  legsWon: number
  setsWon: number

  dartsThrownTotal: number
  pointsScoredTotal: number
  threeDartAvgOverall: number
  first9OverallAvg?: number

  highestCheckout: number

  doubleAttemptsDart: number
  doublesHitDart: number
  doublePctDart: number

  finishingDoubles: Record<string, number>

  tons100Plus: number
  tons140Plus: number
  tons180: number

  doublesHitCount: Record<string, number>
  triplesHitCount: Record<string, number>
  segmentsHitCount: Record<string, number>

  updatedAt: string
}

// ---------------------------------------------
// X01 Leaderboards (raw aus storage.ts)
// ---------------------------------------------

export interface LBVisit {
  playerId: string
  playerName: string
  matchId: string
  visitId: string
  value: number       // Score of that visit
  ts: string
}

export interface LBCheckout {
  playerId: string
  playerName: string
  matchId: string
  visitId: string
  value: number       // Checkout score
  ts: string
}

export interface LBLeg {
  playerId: string
  playerName: string
  matchId: string
  legId: string
  darts: number       // darts needed to win the leg
  ts: string
}

export interface LBPct {
  playerId: string
  playerName: string
  value: number       // checkout %
  attempts: number
  made: number
}

// Leaderboards-Snapshot insgesamt (X01 raw)
export interface Leaderboards {
  highVisits: LBVisit[]
  highCheckouts: LBCheckout[]
  bestLegs: LBLeg[]
  worstLegs: LBLeg[]
  bestCheckoutPct: LBPct[]
  worstCheckoutPct: LBPct[]
  processedMatchIds: string[]
  version: 1
}

// ---------------------------------------------
// Cricket-Match Stats (aus computeCricketStats.ts)
// ---------------------------------------------

export type CricketRange = 'short' | 'long'
export type CricketStyle = 'standard' | 'cutthroat'
export type CricketTarget = number | 'BULL'

// Was wir pro Spieler für EIN Cricket-Match berechnen
export interface CricketPlayerMatchStats {
  playerId: string
  playerName: string

  legsWon: number

  totalMarks: number
  marksPerTurn: number
  marksPerDart: number

  // Style-dependent:
  totalPointsGiven?: number    // standard
  totalPointsTaken?: number    // cutthroat

  triplesHit: number
  doublesHit: number

  bullHitsSingle: number
  bullHitsDouble: number
  bullAccuracy: number         // 0..1

  turnsWithNoScore: number
  longestStreakMarks: number
  bestTurnMarks: number
  bestTurnPoints: number

  favouriteField: CricketTarget | null
  strongestField: CricketTarget | null
  weakestField: CricketTarget | null

  finishField: CricketTarget | null
  firstCloseOrder: CricketTarget[]
}

// Was wir fürs gesamte Match haben (Summary)
export interface CricketMatchComputedStats {
  matchId: string
  range: CricketRange
  style: CricketStyle
  targetWins: number

  players: CricketPlayerMatchStats[]

  fastestLegByMarks: {
    legIndex: number
    playerId: string
    dartsThrown: number
    marks: number
  } | null

  biggestComeback: {
    playerId: string
    fromBehindPoints: number
    result: 'wonLeg' | 'wonMatch'
  } | null
}

// ---------------------------------------------
// Cricket Leaderboards (raw aus storage.ts -> CricketLeaderboards)
// ---------------------------------------------

export interface CricketLBEntry {
  playerId: string
  playerName: string
  matchId: string
  value: number
  ts: string
}

export interface CricketFastestLegEntry {
  matchId: string
  playerId: string
  playerName: string
  dartsThrown: number
  marks: number
  ts: string
}

export interface CricketLeaderboards {
  bullMaster: CricketLBEntry[]
  tripleHunter: CricketLBEntry[]
  fastestLegs: CricketFastestLegEntry[]
  bestTurnMarks: CricketLBEntry[]
  processedMatchIds: string[]
  version: 1
}

// ---------------------------------------------
// ❗ UI-/HallOfFame-/CricketStatsView-Shape
//    (transformierte Leaderboards für Anzeigen)
// ---------------------------------------------

// Cricket UI Rows
export type CricketBullMasterRow = {
  playerId: string
  name: string
  bullPct: number // z.B. 42.5 => "42.5%"
}

export type CricketTripleHunterRow = {
  playerId: string
  name: string
  triplesHit: number
}

export type CricketBestTurnRow = {
  playerId: string
  name: string
  marks: number           // z.B. 7
  turnDesc: string        // z.B. "7 Marks Turn"
}

export type CricketFastestLegRow = {
  playerId: string
  name: string
  dartsThrown: number     // wie viele Darts bis Leg gewonnen
  marksTotal: number      // wie viele Marks in diesem Leg
}

// Cricket Leaderboard Paket für UI
export type CricketLeaderboardsUI = {
  bullMaster: CricketBullMasterRow[]
  tripleHunter: CricketTripleHunterRow[]
  bestTurn: CricketBestTurnRow[]
  fastestLeg: CricketFastestLegRow[]
}

// X01 UI Rows
export type X01HighVisitRow = {
  playerId: string
  playerName: string
  matchId: string
  value: number // Aufnahme-Score, z.B. 180
  ts: string
}

export type X01HighCheckoutRow = {
  playerId: string
  playerName: string
  matchId: string
  value: number // Checkout Score, z.B. 170
  ts: string
}

export type X01LegRow = {
  playerId: string
  playerName: string
  matchId: string
  darts: number // Darts to finish
  ts: string
}

export type X01CheckoutPctRow = {
  playerId: string
  playerName: string
  value: number   // Quote in %
  attempts: number
  made: number
}

// X01 Leaderboard Paket für UI
export type X01LeaderboardsUI = {
  highVisits: X01HighVisitRow[]
  highCheckouts: X01HighCheckoutRow[]
  bestLegs: X01LegRow[]
  worstLegs: X01LegRow[]
  bestCheckoutPct: X01CheckoutPctRow[]
  worstCheckoutPct: X01CheckoutPctRow[]
}
