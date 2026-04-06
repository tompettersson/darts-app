// src/hooks/useSQLStats.ts
// Hook zum Laden aller SQL-basierten Statistiken für einen Spieler

import { useState, useEffect, useRef } from 'react'
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
  // Session & Streaks
  getTodaySessionStats,
  getWinStreaks,
  type TodaySessionStats,
  type WinStreakStats,
  // Player Insights
  getFieldAccuracy,
  getDoubleSuccessPerField,
  getPlayerTypeProfile,
  getCrossGameWinRates,
  getTimeOfDayStats,
  getDayOfWeekPerformance,
  getPlayerMilestones,
  type FieldAccuracy,
  type DoubleFieldSuccess,
  type PlayerTypeProfile,
  type CrossGameWinRate,
  type TimeOfDayStats,
  type DayOfWeekPerformance,
  type Milestone,
} from '../db/stats'
import { getCachedGroup, setCachedGroup, backfillPlayerStats } from '../db/stats-cache'

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
  // Session & Streaks
  todaySession: TodaySessionStats | null
  winStreaks: WinStreakStats | null
  // Player Insights
  fieldAccuracy: FieldAccuracy[]
  doubleSuccessPerField: DoubleFieldSuccess[]
  playerTypeProfile: PlayerTypeProfile | null
  crossGameWinRates: CrossGameWinRate[]
  timeOfDayStats: TimeOfDayStats[]
  dayOfWeekPerformance: DayOfWeekPerformance[]
  milestones: Milestone[]
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
  // Session & Streaks
  todaySession: null,
  winStreaks: null,
  // Player Insights
  fieldAccuracy: [],
  doubleSuccessPerField: [],
  playerTypeProfile: null,
  crossGameWinRates: [],
  timeOfDayStats: [],
  dayOfWeekPerformance: [],
  milestones: [],
}

/** Tab types matching StatsProfile */
export type StatsTab = 'uebersicht' | 'x01' | 'cricketco' | 'insights' | 'trends' | 'analyse' | 'erfolge'

// Track which tab groups have been loaded per player
type LoadedGroups = Set<string>

/**
 * Hook zum Laden von SQL-Statistiken für einen Spieler — Lazy per Tab.
 * Lädt nur die Stats die der aktive Tab braucht. Bereits geladene Daten bleiben gecacht.
 */
export function useSQLStats(playerId: string | undefined, activeTab: StatsTab = 'uebersicht'): SQLStatsState {
  const [state, setState] = useState<SQLStatsState>({
    loading: true,
    error: null,
    data: emptyData,
  })
  const loadedGroupsRef = useRef<LoadedGroups>(new Set())
  const prefetchDoneRef = useRef(false)
  const [currentPlayerId, setCurrentPlayerId] = useState<string | undefined>()

  useEffect(() => {
    // Player changed → reset
    if (playerId !== currentPlayerId) {
      setCurrentPlayerId(playerId)
      loadedGroupsRef.current = new Set()
      prefetchDoneRef.current = false
      setState({ loading: true, error: null, data: emptyData })
    }
  }, [playerId, currentPlayerId])

  useEffect(() => {
    if (!playerId) {
      setState({ loading: false, error: null, data: emptyData })
      return
    }

    // Determine which groups this tab needs
    const needed = getGroupsForTab(activeTab)
    const missing = needed.filter(g => !loadedGroupsRef.current.has(g))

    if (missing.length === 0) {
      setState(prev => ({ ...prev, loading: false }))
      return
    }

    let cancelled = false
    const pid = playerId

    async function loadTabStats() {
      setState(prev => ({ ...prev, loading: true }))

      try {
        const results = await Promise.all(missing.map(g => fetchGroup(pid, g)))

        if (cancelled) return

        const partial: Partial<SQLStatsData> = {}
        for (const r of results) Object.assign(partial, r)
        for (const g of missing) loadedGroupsRef.current.add(g)

        setState(prev => ({
          loading: false,
          error: null,
          data: { ...prev.data, ...partial },
        }))

        // Background prefetch: load remaining groups silently (no state.loading change)
        if (!prefetchDoneRef.current) {
          prefetchDoneRef.current = true
          const ALL_GROUPS = ['core', 'x01variants', 'x01detail', 'cricket', 'minigames', 'insights', 'playerinsights', 'achievements']
          const remaining = ALL_GROUPS.filter(g => !loadedGroupsRef.current.has(g))
          if (remaining.length > 0) {
            // Delay prefetch to avoid competing with active tab rendering
            setTimeout(async () => {
              if (cancelled) return
              try {
                const prefetchResults = await Promise.all(remaining.map(g => fetchGroup(pid, g)))
                if (cancelled) return
                const prefetchPartial: Partial<SQLStatsData> = {}
                for (const r of prefetchResults) Object.assign(prefetchPartial, r)
                for (const g of remaining) loadedGroupsRef.current.add(g)
                setState(prev => ({ ...prev, data: { ...prev.data, ...prefetchPartial } }))
              } catch {
                prefetchDoneRef.current = false // Allow retry on next tab switch
              }
            }, 500)
          }
        }
      } catch (err) {
        if (!cancelled) {
          console.error('Error loading SQL stats:', err)
          setState(prev => ({
            ...prev,
            loading: false,
            error: err instanceof Error ? err.message : 'Unbekannter Fehler',
          }))
        }
      }
    }

    loadTabStats()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerId, activeTab])

  return state
}

/** Maps tabs to required data groups */
function getGroupsForTab(tab: StatsTab): string[] {
  switch (tab) {
    case 'uebersicht':
      return ['core', 'x01variants']
    case 'x01':
      return ['core', 'x01variants', 'x01detail']
    case 'cricketco':
      return ['core', 'cricket', 'minigames']
    case 'insights':
      return ['core', 'insights', 'playerinsights']
    case 'trends':
      return ['core'] // Trends loads its own data via separate queries
    case 'analyse':
      return ['core', 'minigames']
    case 'erfolge':
      return ['core', 'achievements', 'insights', 'playerinsights']
    default:
      return ['core']
  }
}

/** Track which players are being backfilled to avoid duplicate runs */
const backfillInProgress = new Set<string>()

/** Fetch function for a single stats group — reads from cache, falls back to live computation */
async function fetchGroup(playerId: string, group: string): Promise<Partial<SQLStatsData>> {
  // Try cache first (silently skip on error — cache is optional)
  try {
    const cached = await getCachedGroup<Partial<SQLStatsData>>(playerId, group)
    if (cached && typeof cached === 'object' && Object.keys(cached).length > 0) {
      return cached
    }
  } catch {
    // Cache unavailable (cold start, table not yet created) — fall through to live
  }

  // Cache miss or error: compute live
  const partial: Partial<SQLStatsData> = {}
  await loadGroup(playerId, group, partial)

  // Store in background (don't block the UI)
  setCachedGroup(playerId, group, partial).catch(() => {})

  // Trigger full backfill for this player (once) so all groups are cached
  if (!backfillInProgress.has(playerId)) {
    backfillInProgress.add(playerId)
    backfillPlayerStats(playerId, loadGroup)
      .catch(() => {})
      .finally(() => backfillInProgress.delete(playerId))
  }

  return partial
}

/** Load a specific data group — exported for stats cache refresh */
export async function loadGroup(pid: string, group: string, out: Partial<SQLStatsData>): Promise<void> {
  const safe = <T,>(p: Promise<T>, fallback: T): Promise<T> =>
    p.catch((err) => { console.warn(`[Stats] ${group} query failed:`, err.message); return fallback })

  switch (group) {
    case 'core': {
      const [general, quick, streaks, headToHead, special, achievements, atb, atbBestTimes] = await Promise.all([
        safe(getGeneralPlayerStats(pid), null),
        safe(getQuickStats(pid), null),
        safe(getPlayerStreaks(pid), null),
        safe(getAllHeadToHeadForPlayer(pid), []),
        safe(getSpecialStats(pid), null),
        safe(getPlayerAchievements(pid), []),
        safe(getATBFullStats(pid), null),
        safe(getATBBestTimes(pid), []),
      ])
      Object.assign(out, { general, quick, streaks, headToHead, special, achievements, atb, atbBestTimes })
      break
    }
    case 'x01variants': {
      const [x01, x01_301, x01_501, x01_701, x01_901] = await Promise.all([
        safe(getX01FullStats(pid), null),
        safe(getX01FullStats(pid, 301), null),
        safe(getX01FullStats(pid, 501), null),
        safe(getX01FullStats(pid, 701), null),
        safe(getX01FullStats(pid, 901), null),
      ])
      Object.assign(out, { x01, x01ByScore: { 301: x01_301, 501: x01_501, 701: x01_701, 901: x01_901 } })
      break
    }
    case 'x01detail': {
      const [stats121, checkoutByRemaining] = await Promise.all([
        safe(get121FullStats(pid), null),
        safe(getCheckoutByRemaining(pid), []),
      ])
      Object.assign(out, { stats121, checkoutByRemaining })
      break
    }
    case 'cricket': {
      const [cricket, cricketFieldMPR] = await Promise.all([
        safe(getCricketFullStats(pid), null),
        safe(getCricketFieldMPR(pid), []),
      ])
      Object.assign(out, { cricket, cricketFieldMPR })
      break
    }
    case 'minigames': {
      const [bobs27, operation, killer] = await Promise.all([
        safe(getBobs27FullStats(pid), null),
        safe(getOperationFullStats(pid), null),
        safe(getKillerFullStats(pid), null),
      ])
      Object.assign(out, { bobs27, operation, killer })
      break
    }
    case 'insights': {
      const [crossGameDashboard, clutchStats, segmentAccuracy, doubleRates, trebleRates,
             crossGameH2H, sessionPerf, timeInsights] = await Promise.all([
        safe(getCrossGameDashboard(pid), null),
        safe(getClutchStats(pid), null),
        safe(getX01SegmentAccuracy(pid), []),
        safe(getX01DoubleRates(pid), []),
        safe(getX01TrebleRates(pid), []),
        safe(getCrossGameHeadToHead(pid), []),
        safe(getSessionPerformance(pid), { sessions: [] as SessionPerformance[], warmup: null as WarmupEffect | null }),
        safe(getTimeInsights(pid), null),
      ])
      Object.assign(out, {
        crossGameDashboard, clutchStats, segmentAccuracy, doubleRates, trebleRates,
        crossGameH2H,
        sessionPerformance: sessionPerf?.sessions ?? [],
        warmupEffect: sessionPerf?.warmup ?? null,
        timeInsights,
      })
      break
    }
    case 'playerinsights': {
      const [fieldAccuracy, doubleSuccessPerField, playerTypeProfile,
             crossGameWinRates, timeOfDayStats, dayOfWeekPerformance, milestones] = await Promise.all([
        safe(getFieldAccuracy(pid), []),
        safe(getDoubleSuccessPerField(pid), []),
        safe(getPlayerTypeProfile(pid), null),
        safe(getCrossGameWinRates(pid), []),
        safe(getTimeOfDayStats(pid), []),
        safe(getDayOfWeekPerformance(pid), []),
        safe(getPlayerMilestones(pid), []),
      ])
      Object.assign(out, {
        fieldAccuracy, doubleSuccessPerField, playerTypeProfile,
        crossGameWinRates, timeOfDayStats, dayOfWeekPerformance, milestones,
      })
      break
    }
    case 'achievements': {
      const [fullAchievements, formCurve, bobs27Progression, bobs27DoubleWeakness,
             trainingRecommendations, todaySession, winStreaks] = await Promise.all([
        safe(getFullAchievements(pid), []),
        safe(getX01FormCurve(pid), []),
        safe(getBobs27Progression(pid), []),
        safe(getBobs27DoubleWeakness(pid), []),
        safe(getTrainingRecommendations(pid), []),
        safe(getTodaySessionStats(pid), null),
        safe(getWinStreaks(pid), null),
      ])
      Object.assign(out, {
        fullAchievements, formCurve, bobs27Progression, bobs27DoubleWeakness,
        trainingRecommendations, todaySession, winStreaks,
      })
      break
    }
  }
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
