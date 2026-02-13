// src/types/playerStats.ts
// Typen für die Spieler-Statistiken-Seite

export type OpponentRecord = {
  opponentId: string
  opponentName: string
  matchesPlayed: number
  wins: number
  losses: number
  winRate: number
}

export type GeneralPlayerStats = {
  matchesPlayed: number
  matchesWon: number
  winRate: number
  longestWinStreak: number  // Längste Siegesserie (X01 + Cricket)

  // X01 spezifisch
  x01MatchesPlayed: number
  x01MatchesWon: number
  x01WinRate: number

  // Cricket spezifisch
  cricketMatchesPlayed: number
  cricketMatchesWon: number
  cricketWinRate: number

  // Einzelspiele (Solo) - Stats zählen, aber keine Siege
  x01SoloPlayed: number
  cricketSoloPlayed: number
  atbSoloPlayed: number

  // Head-to-Head
  opponents: OpponentRecord[]
  favouriteOpponent?: OpponentRecord // höchste Win-Rate (min. 3 Matches)
  fearOpponent?: OpponentRecord      // niedrigste Win-Rate (min. 3 Matches)
  mainOpponent?: OpponentRecord      // meistgespielter Gegner

  // Zusätzliche Statistiken
  totalDartsThrown: number           // Gesamtzahl geworfener Darts
  totalPlayTime: number              // Gesamte Spielzeit in Minuten
  favouriteNumber?: {                // Am häufigsten geworfene Zahl
    target: number | 'BULL'
    count: number
  }
}

export type X01ExtendedStats = {
  // Scoring
  threeDartAvg: number
  first9OverallAvg: number
  highestVisit: number
  tons180: number
  tons140Plus: number
  tons100Plus: number
  tons61Plus: number
  pointsTotal: number
  dartsThrown: number

  // Checkout
  checkoutPctDart: number
  doubleAttemptsDart: number
  doublesHitDart: number
  highestCheckout: number
  bullCheckouts: number       // Checkouts über das Bull
  checkoutPctLow: number      // ≤40
  checkoutPctMid: number      // 41-100
  checkoutPctHigh: number     // 101-170
  favouriteDouble?: string
  finishingDoubles: Record<string, number>
  doublesHitCount: Record<string, number>

  // Busts
  totalBusts: number
  bustRate: number

  // Effizienz
  avgDartsPerLeg: number
  legsWon: number
  legsPlayed: number

  // Waste Darts
  wasteDarts: number
  wasteDartRate: number

  // Dart-Position Stats
  dart1Avg: number
  dart2Avg: number
  dart3Avg: number
}

export type CricketExtendedStats = {
  // Marks
  totalMarks: number
  avgMarksPerTurn: number
  avgMarksPerDart: number
  bestTurnMarks: number

  // Punkte
  totalPoints: number
  avgPointsPerTurn: number
  bestTurnPoints: number

  // Treffer
  totalTriples: number
  totalDoubles: number
  totalBullSingles: number
  totalBullDoubles: number
  bullAccuracy: number

  // Felder
  fieldMarks: Record<string, number>
  strongestField?: string
  weakestField?: string

  // Effizienz
  noScoreTurns: number
  noScoreRate: number
  totalTurns: number

  // Waste Darts
  wasteDarts: number
  wasteDartRate: number

  // Matches
  matchesPlayed: number
  matchesWon: number
  legsWon: number

  // Triple-Analyse
  tripleFollowUp: {
    totalTurns: number       // Runden wo Dart 1 ein Triple war
    followedByWaste: number  // davon mit Waste (Miss)
    followedByTriple: number // davon mit noch einem Triple
    wasteRate: number
    tripleRate: number
  }
  longestTripleStreak: number
}

export type SpecialStats = {
  // Treffergenauigkeit
  tripleHitRate: number
  doubleHitRate: number
  segmentsHitCount: Record<string, number>
  triplesHitCount: Record<string, number>

  // Triple-Folge-Analyse (wenn Dart 1 ein Triple war)
  afterFirstTriple: {
    totalVisits: number        // Aufnahmen wo Dart 1 ein Triple war
    followedByWaste: number    // davon mit Waste Dart (Score ≤ 20)
    followedByTriple: number   // davon mit noch einem Triple
    wasteRate: number          // Prozent
    tripleRate: number         // Prozent
  }

  // Triple-Streak (aufeinanderfolgende Aufnahmen mit mind. 1 Triple 15-20)
  longestTripleStreak: number

  // Dart-Position (X01)
  dart1Avg: number
  dart2Avg: number
  dart3Avg: number

  // Form & Konstanz
  last5Matches: { won: boolean; type: 'x01' | 'cricket'; avg?: number }[]
  averageTrend: 'rising' | 'falling' | 'stable'
  averageVariance: number

  // Druck-Situationen
  matchDartCheckoutRate: number
  matchDartAttempts: number
  matchDartHits: number
  performanceWhenBehind: number  // Average wenn im Rückstand
  performanceWhenAhead: number   // Average wenn in Führung
}

// Cricket Langzeit-Stats (analog zu X01PlayerLongTermStats)
export type CricketPlayerLongTermStats = {
  playerId: string
  playerName?: string

  matchesPlayed: number
  matchesWon: number
  legsWon: number

  // Marks
  totalMarks: number
  totalTurns: number
  totalDarts: number

  // Treffer
  totalTriples: number
  totalDoubles: number
  totalBullSingles: number
  totalBullDoubles: number
  totalBullAttempts: number

  // Felder
  fieldMarks: Record<string, number>

  // Turns
  noScoreTurns: number
  bestTurnMarks: number
  bestTurnPoints: number

  // Punkte
  totalPointsScored: number  // Standard mode
  totalPointsTaken: number   // Cutthroat mode

  updatedAt: string
}

// Für Checkout-Bereich Analyse
export type CheckoutRangeStats = {
  attempts: number
  hits: number
  pct: number
}

// Waste Dart Analyse
export type WasteDartInfo = {
  matchId: string
  legId?: string
  dartIndex: number
  reason: string
  remaining?: number
  dartThrown?: string
}

export type WasteDartStats = {
  total: number
  rate: number
  details: WasteDartInfo[]
}
