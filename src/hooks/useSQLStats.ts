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
  type GeneralPlayerStats,
  type X01FullStats,
  type CricketFullStats,
  type ATBFullStats,
  type QuickStats,
  type PlayerStreak,
  type HeadToHead,
  type Stats121Full,
  type SpecialStatsSQL,
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
  cricket: CricketFullStats | null
  atb: ATBFullStats | null
  atbBestTimes: ATBBestTime[]
  quick: QuickStats | null
  streaks: PlayerStreak | null
  headToHead: HeadToHead[]
  stats121: Stats121Full | null
  special: SpecialStatsSQL | null
  achievements: { categoryId: string; categoryTitle: string; rank: number; value: number }[]
}

export type SQLStatsState = {
  loading: boolean
  error: string | null
  data: SQLStatsData
}

const emptyData: SQLStatsData = {
  general: null,
  x01: null,
  cricket: null,
  atb: null,
  atbBestTimes: [],
  quick: null,
  streaks: null,
  headToHead: [],
  stats121: null,
  special: null,
  achievements: [],
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
        // Alle Stats parallel laden
        const [general, x01, cricket, atb, atbBestTimes, quick, streaks, headToHead, stats121, special, achievements] = await Promise.all([
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
        ])

        if (!cancelled) {
          setState({
            loading: false,
            error: null,
            data: { general, x01, cricket, atb, atbBestTimes, quick, streaks, headToHead, stats121, special, achievements },
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
