/**
 * Zustand App Store
 *
 * Wraps the module-level caches from storage.ts into a reactive Zustand store.
 * This provides React DevTools visibility, reactive updates, and a foundation
 * for future migration away from the module-level pattern.
 *
 * The store mirrors the existing cache structure. The synchronous getters in
 * storage.ts (getMatches, getProfiles etc.) remain as the primary API — they
 * now read from the store instead of module-level variables.
 */
import { create } from 'zustand'
import { devtools } from 'zustand/middleware'

export interface AppState {
  // Data caches (mirroring storage.ts module-level variables)
  profiles: any[]
  x01Matches: any[]
  cricketMatches: any[]
  atbMatches: any[]
  strMatches: any[]
  ctfMatches: any[]
  shanghaiMatches: any[]
  killerMatches: any[]
  bobs27Matches: any[]
  operationMatches: any[]
  highscoreMatches: any[]

  // Stats caches
  x01PlayerStats: Record<string, any>
  leaderboards: any | null
  cricketLeaderboards: any | null

  // Initialization state
  initialized: boolean
  loading: boolean

  // Actions
  setProfiles: (profiles: any[]) => void
  setMatches: (mode: string, matches: any[]) => void
  warmAll: (data: Record<string, any>) => void
  warmStats: (data: { x01PlayerStats?: any; leaderboards?: any; cricketLeaderboards?: any }) => void
  setInitialized: (value: boolean) => void
  setLoading: (value: boolean) => void
}

export const useAppStore = create<AppState>()(
  devtools(
    (set) => ({
      // Initial state
      profiles: [],
      x01Matches: [],
      cricketMatches: [],
      atbMatches: [],
      strMatches: [],
      ctfMatches: [],
      shanghaiMatches: [],
      killerMatches: [],
      bobs27Matches: [],
      operationMatches: [],
      highscoreMatches: [],
      x01PlayerStats: {},
      leaderboards: null,
      cricketLeaderboards: null,
      initialized: false,
      loading: true,

      // Actions
      setProfiles: (profiles) => set({ profiles }, false, 'setProfiles'),

      setMatches: (mode, matches) => set(
        (state) => ({ [`${mode}Matches`]: matches }),
        false,
        `setMatches/${mode}`,
      ),

      warmAll: (data) => set(
        {
          profiles: data.profiles ?? [],
          x01Matches: data.x01Matches ?? [],
          cricketMatches: data.cricketMatches ?? [],
          atbMatches: data.atbMatches ?? [],
          strMatches: data.strMatches ?? [],
          ctfMatches: data.ctfMatches ?? [],
          shanghaiMatches: data.shanghaiMatches ?? [],
          killerMatches: data.killerMatches ?? [],
          bobs27Matches: data.bobs27Matches ?? [],
          operationMatches: data.operationMatches ?? [],
          highscoreMatches: data.highscoreMatches ?? [],
          initialized: true,
          loading: false,
        },
        false,
        'warmAll',
      ),

      warmStats: (data) => set(
        (state) => ({
          x01PlayerStats: data.x01PlayerStats ?? state.x01PlayerStats,
          leaderboards: data.leaderboards ?? state.leaderboards,
          cricketLeaderboards: data.cricketLeaderboards ?? state.cricketLeaderboards,
        }),
        false,
        'warmStats',
      ),

      setInitialized: (value) => set({ initialized: value }, false, 'setInitialized'),
      setLoading: (value) => set({ loading: value }, false, 'setLoading'),
    }),
    { name: 'darts-app-store' },
  ),
)

/**
 * Non-React access to the store (for use in storage.ts synchronous getters).
 * This replaces the module-level variables.
 */
export const getStoreState = () => useAppStore.getState()
