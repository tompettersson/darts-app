// src/db/stats/types.ts
// Shared types/interfaces for SQL-based statistics

export type TrendPoint = {
  date: string       // YYYY-MM-DD
  month: string      // YYYY-MM
  value: number
  matchCount: number
}

export type HeadToHead = {
  player1Id: string
  player1Name: string
  player2Id: string
  player2Name: string
  totalMatches: number
  player1Wins: number
  player2Wins: number
  player1LegsWon: number
  player2LegsWon: number
  lastPlayed: string
}

export type PlayerStreak = {
  playerId: string
  playerName: string
  currentWinStreak: number
  currentLoseStreak: number
  longestWinStreak: number
  longestLoseStreak: number
}

export type BestPerformance = {
  playerId: string
  playerName: string
  matchId: string
  matchTitle: string
  date: string
  value: number
  category: string
}

export type MonthlyStats = {
  month: string
  matchesPlayed: number
  legsWon: number
  legsLost: number
  winRate: number
}

export type DayOfWeekStats = {
  dayOfWeek: number  // 0 = Sunday, 6 = Saturday
  dayName: string
  matchesPlayed: number
  winRate: number
}

export type QuickStats = {
  totalMatches: number
  totalLegsWon: number
  total180s: number
  highestCheckout: number
  avgThreeDart: number
  avgCheckoutPercent: number
  favoriteDayName: string
  currentStreak: string
}

export type CheckoutRange = {
  range: string         // "2-40", "41-60", "61-80", "81-100", "101-130", "131-170"
  attempts: number
  made: number
  percent: number
}
