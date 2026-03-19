// src/hooks/useSQLStats.ts
// Hook zum Laden aller SQL-basierten Statistiken für einen Spieler

import { useState, useEffect } from 'react'
import {
  getGeneralPlayerStats,
  getX01FullStats,
  getCricketFullStats,
  getATBFullStats,
  getATBBestTimes,
  getQuickStats,
  getPlayerStreaks,
  getAllHeadToHeadForPlayer,
  get121FullStats,
  getSpecialStats,
  getPlayerAchievements,
  getBobs27FullStats,
  getOperationFullStats,
  getKillerFullStats,
  // New Stats (Tasks 16-25)
  getCrossGameDashboard,
  getX01SegmentAccuracy,
  getX01DoubleRates,
  getX01TrebleRates,
  getX01FormCurve,
  getSessionPerformance,
  getCheckoutByRemaining,
  getClutchStats,
  getCricketFieldMPR,
  getBobs27Progression,
  getBobs27DoubleWeakness,
  getFullAchievements,
  getCrossGameHeadToHead,
  getTimeInsights,
  getTrainingRecommendations,
  type GeneralPlayerStats,
  type X01FullStats,
  type CricketFullStats,
  type ATBFullStats,
  type QuickStats,
  type PlayerStreak,
  type HeadToHead,
  type Stats121Full,
  type SpecialStatsSQL,
  type Bobs27FullStats,
  type OperationFullStats,
  type KillerFullStats,
  type CrossGameDashboard,
  type SegmentAccuracy,
  type DoubleFieldRate,
  type FormCurvePoint,
  type SessionPerformance,
  type WarmupEffect,
  type CheckoutByRemaining,
  type ClutchStats as ClutchStatsType,
  type CricketFieldMPR as CricketFieldMPRType,
  type Bobs27Progression as Bobs27ProgressionType,
  type Bobs27DoubleWeakness as Bobs27DoubleWeaknessType,
  type Achievement,
  type CrossGameH2H,
  type TimeInsights,
  type TrainingRecommendation,
} from '../db/stats'

export type ATBBestTime = {
  mode: string
  direction: string
  bestTime: number
  bestDarts: number
  attempts: number
}

export type SQLStatsData = {
  general: GeneralPlayerStats | null
  x01: X01FullStats | null
  x01ByScore: {
    301: X01FullStats | null
    501: X01FullStats | null
    701: X01FullStats | null
    901: X01FullStats | null
  }
  cricket: CricketFullStats | null
  atb: ATBFullStats | null
  atbBestTimes: ATBBestTime[]
  quick: QuickStats | null
  streaks: PlayerStreak | null
  headToHead: HeadToHead[]
  stats121: Stats121Full | null
  special: SpecialStatsSQL | null
  achievements: { categoryId: string; categoryTitle: string; rank: number; value: number }[]
  bobs27: Bobs27FullStats | null
  operation: OperationFullStats | null
  killer: KillerFullStats | null
  // New Stats (Tasks 16-25)
  crossGameDashboard: CrossGameDashboard | null
  segmentAccuracy: SegmentAccuracy[]
  doubleRates: DoubleFieldRate[]
  trebleRates: DoubleFieldRate[]
  formCurve: FormCurvePoint[]
  sessionPerformance: SessionPerformance[]
  warmupEffect: WarmupEffect | null
  checkoutByRemaining: CheckoutByRemaining[]
  clutchStats: ClutchStatsType | null
  cricketFieldMPR: CricketFieldMPRType[]
  bobs27Progression: Bobs27ProgressionType[]
  bobs27DoubleWeakness: Bobs27DoubleWeaknessType[]
  fullAchievements: Achievement[]
  crossGameH2H: CrossGameH2H[]
  timeInsights: TimeInsights | null
  trainingRecommendations: TrainingRecommendation[]
}

export type SQLStatsState = {
  loading: boolean
  error: string | null
  data: SQLStatsData
}

const emptyData: SQLStatsData = {
  general: null,
  x01: null,
  x01ByScore: { 301: null, 501: null, 701: null, 901: null },
  cricket: null,
  atb: null,
  atbBestTimes: [],
  quick: null,
  streaks: null,
  headToHead: [],
  stats121: null,
  special: null,
  achievements: [],
  bobs27: null,
  operation: null,
  killer: null,
  // New Stats
  crossGameDashboard: null,
  segmentAccuracy: [],
  doubleRates: [],
  trebleRates: [],
  formCurve: [],
  sessionPerformance: [],
  warmupEffect: null,
  checkoutByRemaining: [],
  clutchStats: null,
  cricketFieldMPR: [],
  bobs27Progression: [],
  bobs27DoubleWeakness: [],
  fullAchievements: [],
  crossGameH2H: [],
  timeInsights: null,
  trainingRecommendations: [],
}

/**
 * Hook zum Laden aller SQL-Statistiken für einen Spieler
 */
export function useSQLStats(playerId: string | undefined): SQLStatsState {
  const [state, setState] = useState<SQLStatsState>({
    loading: true,
    error: null,
    data: emptyData,
  })

  useEffect(() => {
    if (!playerId) {
      setState({ loading: false, error: null, data: emptyData })
      return
    }

    let cancelled = false
    const pid = playerId // Capture for closure

    async function loadStats() {
      setState(prev => ({ ...prev, loading: true, error: null }))

      try {
        // Alle Stats parallel laden (Basis + Erweitert)
        const [
          general, x01, cricket, atb, atbBestTimes, quick, streaks, headToHead,
          stats121, special, achievements, bobs27, operation, killer,
          x01_301, x01_501, x01_701, x01_901,
          // New Stats
          crossGameDashboard, segmentAccuracy, doubleRates, trebleRates,
          formCurve, sessionPerf, checkoutByRemaining, clutchStats,
          cricketFieldMPR, bobs27Progression, bobs27DoubleWeakness,
          fullAchievements, crossGameH2H, timeInsights, trainingRecommendations,
        ] = await Promise.all([
          getGeneralPlayerStats(pid),
          getX01FullStats(pid),
          getCricketFullStats(pid),
          getATBFullStats(pid),
          getATBBestTimes(pid),
          getQuickStats(pid),
          getPlayerStreaks(pid),
          getAllHeadToHeadForPlayer(pid),
          get121FullStats(pid),
          getSpecialStats(pid),
          getPlayerAchievements(pid),
          getBobs27FullStats(pid),
          getOperationFullStats(pid),
          getKillerFullStats(pid),
          getX01FullStats(pid, 301),
          getX01FullStats(pid, 501),
          getX01FullStats(pid, 701),
          getX01FullStats(pid, 901),
          // New Stats
          getCrossGameDashboard(pid),
          getX01SegmentAccuracy(pid),
          getX01DoubleRates(pid),
          getX01TrebleRates(pid),
          getX01FormCurve(pid),
          getSessionPerformance(pid),
          getCheckoutByRemaining(pid),
          getClutchStats(pid),
          getCricketFieldMPR(pid),
          getBobs27Progression(pid),
          getBobs27DoubleWeakness(pid),
          getFullAchievements(pid),
          getCrossGameHeadToHead(pid),
          getTimeInsights(pid),
          getTrainingRecommendations(pid),
        ])

        if (!cancelled) {
          const x01ByScore = { 301: x01_301, 501: x01_501, 701: x01_701, 901: x01_901 }
          setState({
            loading: false,
            error: null,
            data: {
              general, x01, cricket, atb, atbBestTimes, quick, streaks, headToHead,
              stats121, special, achievements, bobs27, operation, killer, x01ByScore,
              crossGameDashboard, segmentAccuracy, doubleRates, trebleRates,
              formCurve, sessionPerformance: sessionPerf.sessions, warmupEffect: sessionPerf.warmup,
              checkoutByRemaining, clutchStats,
              cricketFieldMPR, bobs27Progression, bobs27DoubleWeakness,
              fullAchievements, crossGameH2H, timeInsights, trainingRecommendations,
            },
          })
        }
      } catch (err) {
        if (!cancelled) {
          console.error('Error loading SQL stats:', err)
          setState({
            loading: false,
            error: err instanceof Error ? err.message : 'Unbekannter Fehler',
            data: emptyData,
          })
        }
      }
    }

    loadStats()

    return () => {
      cancelled = true
    }
  }, [playerId])

  return state
}

/**
 * Formatiert Millisekunden als mm:ss
 */
export function formatDuration(ms: number): string {
  if (!ms) return '-'
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}
