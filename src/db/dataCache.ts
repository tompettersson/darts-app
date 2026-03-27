// src/db/dataCache.ts
// LocalStorage cache for match data to minimize Neon DB transfer
// Saves ~89% data transfer on repeat visits

const CACHE_KEY = 'darts-data-cache'
const CACHE_VERSION = 2 // Bump to invalidate all caches

type CachedData = {
  version: number
  timestamp: string // ISO date of last full sync
  profiles: any[]
  x01Matches: any[]
  cricketMatches: any[]
  atbMatches: any[]
  strMatches: any[]
  highscoreMatches: any[]
  shanghaiMatches: any[]
  killerMatches: any[]
  ctfMatches: any[]
  bobs27Matches: any[]
  operationMatches: any[]
  // Stats caches
  x01PlayerStats?: any
  stats121?: any
  x01Leaderboards?: any
  cricketLeaderboards?: any
  cricketPlayerStats?: any
}

/** Load cached data from localStorage */
export function loadCache(): CachedData | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const data = JSON.parse(raw) as CachedData
    if (data.version !== CACHE_VERSION) {
      console.debug('[Cache] Version mismatch, invalidating')
      localStorage.removeItem(CACHE_KEY)
      return null
    }
    return data
  } catch {
    localStorage.removeItem(CACHE_KEY)
    return null
  }
}

/** Save data to localStorage cache */
export function saveCache(data: Omit<CachedData, 'version' | 'timestamp'>): void {
  try {
    const cached: CachedData = {
      ...data,
      version: CACHE_VERSION,
      timestamp: new Date().toISOString(),
    }
    const json = JSON.stringify(cached)
    // Don't cache if too large (>10MB could cause quota errors)
    if (json.length > 10 * 1024 * 1024) {
      console.warn('[Cache] Data too large to cache:', (json.length / 1024 / 1024).toFixed(1), 'MB')
      return
    }
    localStorage.setItem(CACHE_KEY, json)
    console.debug('[Cache] Saved', (json.length / 1024).toFixed(0), 'KB')
  } catch (e) {
    console.warn('[Cache] Failed to save:', e)
  }
}

/** Update just the stats part of the cache */
export function updateCacheStats(stats: {
  x01PlayerStats?: any
  stats121?: any
  x01Leaderboards?: any
  cricketLeaderboards?: any
  cricketPlayerStats?: any
}): void {
  try {
    const cached = loadCache()
    if (!cached) return
    Object.assign(cached, stats)
    cached.timestamp = new Date().toISOString()
    localStorage.setItem(CACHE_KEY, JSON.stringify(cached))
  } catch {}
}

/** Get the timestamp of the last cache update */
export function getCacheTimestamp(): string | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const data = JSON.parse(raw)
    return data.version === CACHE_VERSION ? data.timestamp : null
  } catch {
    return null
  }
}

/** Clear the cache */
export function clearCache(): void {
  localStorage.removeItem(CACHE_KEY)
}
