export type PlayerStatsAggregate = {
  playerId: string
  totalDarts: number
  totalVisits: number
  totalScore: number

  averagePerDart: number
  averagePerVisit: number

  firstNineTotalScore: number
  firstNineDarts: number
  firstNineAverage: number

  legsPlayed: number
  legsWon: number
  fewestDartsToWin?: number
  highestCheckout?: number

  checkoutAttempts: number
  checkoutHits: number
  checkoutPercentage: number

  favouriteFinishSegment?: string
  finishSegmentHitCount: Record<string, number>
  finishSegmentMissCount: Record<string, number>

  tons100Plus: number
  tons140Plus: number
  tons180: number

  visitScores: number[]
  scoringStdDev?: number

  segmentHits: Record<string, number>
}
