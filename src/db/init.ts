// src/db/init.ts
// Öffentlicher Entry-Point für Postgres Database (Neon)

import { initDB, isDBReady, getDBStatus, getDBVersion, closeDB } from './index'
import {
  dbGetProfiles,
  dbGetX01Matches,
  dbGetCricketMatches,
  dbGetATBMatches,
  dbGetStrMatches,
  dbGetHighscoreMatches,
  dbGetShanghaiMatches,
  dbGetKillerMatches,
  dbGetCTFMatches,
  dbGetBobs27Matches,
  dbGetOperationMatches,
  dbLoadAllX01PlayerStats,
  dbLoadAll121PlayerStats,
  dbLoadX01Leaderboards,
  dbLoadCricketLeaderboards,
  dbLoadAllCricketPlayerStats,
} from './storage'
import { warmMemCache, warmAllCaches, warmStats121Cache } from '../storage'
import { warmCricketPlayerStatsCache } from '../stats/computePlayerStats'
import { loadCache, saveCache, updateCacheStats, getCacheTimestamp } from './dataCache'
import { queryOne } from './index'

export type DBInitResult = {
  success: boolean
  usingSQLite: boolean
  migratedFromLS: boolean
  version: number
  error?: string
}

/**
 * Initialisiert die Datenbank-Verbindung
 */
export async function initializeDB(): Promise<DBInitResult> {
  try {
    await initDB()
    const version = getDBVersion()

    console.debug('[DB Init] Postgres bereit, Version:', version)
    return {
      success: true,
      usingSQLite: true, // Kompatibilitäts-Flag — bedeutet jetzt "DB verfügbar"
      migratedFromLS: false,
      version,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[DB Init] Fehler:', error)

    return {
      success: false,
      usingSQLite: false,
      migratedFromLS: false,
      version: 0,
      error: message,
    }
  }
}

/**
 * Prüft ob die Datenbank verfügbar und bereit ist
 */
export function isSQLiteReady(): boolean {
  return isDBReady()
}

// ============================================================================
// App Startup Loading
// ============================================================================

export type AppDataLoaded = {
  profiles: number
  x01Matches: number
  cricketMatches: number
  atbMatches: number
  strMatches: number
  highscoreMatches: number
  bobs27Matches: number
  operationMatches: number
  durationMs: number
}

/**
 * Lädt alle Daten aus Postgres in die Memory-Caches.
 */
export async function loadAllDataFromSQLite(): Promise<AppDataLoaded> {
  const startTime = Date.now()

  try {
    const safe = <T,>(p: Promise<T>, fallback: T): Promise<T> =>
      p.catch((err) => { console.warn('[DB Init] Query failed:', err.message); return fallback })

    // === LocalStorage Cache Check ===
    const cached = loadCache()
    const cacheTs = getCacheTimestamp()

    if (cached && cacheTs) {
      // Check if there are new matches since last cache
      let hasNew = false
      try {
        const result = await queryOne<{ c: number }>(
          `SELECT COUNT(*) as c FROM x01_matches WHERE created_at > ?`,
          [cacheTs]
        )
        hasNew = (result?.c ?? 0) > 0

        // Also check all other game modes (quick count)
        if (!hasNew) {
          const other = await queryOne<{ c: number }>(
            `SELECT (SELECT COUNT(*) FROM cricket_matches WHERE created_at > ?) +
                    (SELECT COUNT(*) FROM atb_matches WHERE created_at > ?) +
                    (SELECT COUNT(*) FROM str_matches WHERE created_at > ?) +
                    (SELECT COUNT(*) FROM ctf_matches WHERE created_at > ?) +
                    (SELECT COUNT(*) FROM highscore_matches WHERE created_at > ?) +
                    (SELECT COUNT(*) FROM shanghai_matches WHERE created_at > ?) +
                    (SELECT COUNT(*) FROM killer_matches WHERE created_at > ?) +
                    (SELECT COUNT(*) FROM bobs27_matches WHERE created_at > ?) +
                    (SELECT COUNT(*) FROM operation_matches WHERE created_at > ?) as c`,
            [cacheTs, cacheTs, cacheTs, cacheTs, cacheTs, cacheTs, cacheTs, cacheTs, cacheTs]
          )
          hasNew = (other?.c ?? 0) > 0
        }
      } catch {
        hasNew = true // On error, do a full reload
      }

      if (!hasNew) {
        // No new data — load entirely from cache (0 DB transfer!)
        console.debug('[Cache] No new matches since', cacheTs, '— using cache')
        warmAllCaches({
          profiles: cached.profiles,
          x01Matches: cached.x01Matches,
          cricketMatches: cached.cricketMatches,
          atbMatches: cached.atbMatches,
          strMatches: cached.strMatches,
          ctfMatches: cached.ctfMatches,
          shanghaiMatches: cached.shanghaiMatches,
          killerMatches: cached.killerMatches,
          bobs27Matches: cached.bobs27Matches,
          operationMatches: cached.operationMatches,
          highscoreMatches: cached.highscoreMatches,
        })

        // Restore stats from cache too
        if (cached.x01PlayerStats || cached.x01Leaderboards || cached.cricketLeaderboards) {
          warmMemCache({
            x01PlayerStats: cached.x01PlayerStats ?? {},
            leaderboards: cached.x01Leaderboards ?? undefined,
            cricketLeaderboards: cached.cricketLeaderboards ?? undefined,
          })
        }
        if (cached.stats121) warmStats121Cache(cached.stats121)
        if (cached.cricketPlayerStats) warmCricketPlayerStatsCache(cached.cricketPlayerStats)

        const durationMs = Date.now() - startTime
        console.debug(`[Cache] Loaded from cache in ${durationMs}ms`)
        return {
          profiles: cached.profiles.length,
          x01Matches: cached.x01Matches.length,
          cricketMatches: cached.cricketMatches.length,
          atbMatches: cached.atbMatches.length,
          strMatches: cached.strMatches.length,
          highscoreMatches: cached.highscoreMatches.length,
          bobs27Matches: cached.bobs27Matches.length,
          operationMatches: cached.operationMatches.length,
          durationMs,
        }
      }
      console.debug('[Cache] New matches found — doing full reload')
    }

    // === Full DB Load (first visit or new data exists) ===
    const [profiles, x01Matches, cricketMatches, atbMatches, strMatches, highscoreMatches,
           shanghaiMatches, killerMatches, ctfMatches, bobs27Matches, operationMatches] = await Promise.all([
      safe(dbGetProfiles(), []),
      safe(dbGetX01Matches(), []),
      safe(dbGetCricketMatches(), []),
      safe(dbGetATBMatches(), []),
      safe(dbGetStrMatches(), []),
      safe(dbGetHighscoreMatches(), []),
      safe(dbGetShanghaiMatches(), []),
      safe(dbGetKillerMatches(), []),
      safe(dbGetCTFMatches(), []),
      safe(dbGetBobs27Matches(), []),
      safe(dbGetOperationMatches(), []),
    ])

    // Memory-Caches direkt befüllen
    warmAllCaches({
      profiles: profiles.map((p) => ({
        id: p.id, name: p.name, createdAt: p.createdAt, updatedAt: p.updatedAt, color: p.color ?? undefined,
      })),
      x01Matches: x01Matches.map((m) => ({
        id: m.id, title: m.title, matchName: m.matchName ?? undefined, notes: m.notes ?? undefined,
        createdAt: m.createdAt, events: m.events, playerIds: m.playerIds, finished: m.finished,
      })),
      cricketMatches: cricketMatches.map((m) => ({
        id: m.id, title: m.title, matchName: m.matchName ?? undefined, notes: m.notes ?? undefined,
        createdAt: m.createdAt, events: m.events, playerIds: m.playerIds, finished: m.finished,
      })),
      atbMatches: atbMatches as any[],
      strMatches: strMatches as any[],
      ctfMatches: ctfMatches as any[],
      shanghaiMatches: shanghaiMatches as any[],
      killerMatches: killerMatches as any[],
      bobs27Matches: bobs27Matches as any[],
      operationMatches: operationMatches as any[],
      highscoreMatches: highscoreMatches as any[],
    })

    // Stats & Leaderboards in Memory-Cache laden
    try {
      const [x01Stats, stats121, x01Lb, cricketLb, cricketStats] = await Promise.all([
        safe(dbLoadAllX01PlayerStats(), {}),
        safe(dbLoadAll121PlayerStats(), {}),
        safe(dbLoadX01Leaderboards(), null),
        safe(dbLoadCricketLeaderboards(), null),
        safe(dbLoadAllCricketPlayerStats(), {}),
      ])

      warmMemCache({
        x01PlayerStats: x01Stats,
        leaderboards: x01Lb ?? undefined,
        cricketLeaderboards: cricketLb ?? undefined,
      })

      warmStats121Cache(stats121)
      warmCricketPlayerStatsCache(cricketStats)
    } catch (e) {
      console.warn('[DB Init] Stats/Leaderboards Cache-Sync fehlgeschlagen:', e)
    }

    // === Save to LocalStorage Cache for next visit ===
    try {
      const profilesForCache = profiles.map((p) => ({
        id: p.id, name: p.name, createdAt: p.createdAt, updatedAt: p.updatedAt, color: p.color ?? undefined,
      }))
      const x01ForCache = x01Matches.map((m) => ({
        id: m.id, title: m.title, matchName: m.matchName ?? undefined, notes: m.notes ?? undefined,
        createdAt: m.createdAt, events: m.events, playerIds: m.playerIds, finished: m.finished,
      }))
      const cricketForCache = cricketMatches.map((m) => ({
        id: m.id, title: m.title, matchName: m.matchName ?? undefined, notes: m.notes ?? undefined,
        createdAt: m.createdAt, events: m.events, playerIds: m.playerIds, finished: m.finished,
      }))
      saveCache({
        profiles: profilesForCache,
        x01Matches: x01ForCache,
        cricketMatches: cricketForCache,
        atbMatches: atbMatches as any[],
        strMatches: strMatches as any[],
        highscoreMatches: highscoreMatches as any[],
        shanghaiMatches: shanghaiMatches as any[],
        killerMatches: killerMatches as any[],
        ctfMatches: ctfMatches as any[],
        bobs27Matches: bobs27Matches as any[],
        operationMatches: operationMatches as any[],
      })
    } catch (e) {
      console.warn('[Cache] Save failed:', e)
    }

    const durationMs = Date.now() - startTime
    console.debug(`[DB Init] Daten geladen in ${durationMs}ms:`, {
      profiles: profiles.length, x01: x01Matches.length, cricket: cricketMatches.length,
      atb: atbMatches.length, str: strMatches.length, highscore: highscoreMatches.length,
      shanghai: shanghaiMatches.length, killer: killerMatches.length, ctf: ctfMatches.length,
      bobs27: bobs27Matches.length, operation: operationMatches.length,
    })

    return {
      profiles: profiles.length,
      x01Matches: x01Matches.length,
      cricketMatches: cricketMatches.length,
      atbMatches: atbMatches.length,
      strMatches: strMatches.length,
      highscoreMatches: highscoreMatches.length,
      bobs27Matches: bobs27Matches.length,
      operationMatches: operationMatches.length,
      durationMs,
    }
  } catch (error) {
    console.error('[DB Init] Fehler beim Laden:', error)
    return {
      profiles: 0, x01Matches: 0, cricketMatches: 0, atbMatches: 0,
      strMatches: 0, highscoreMatches: 0, bobs27Matches: 0, operationMatches: 0,
      durationMs: Date.now() - startTime,
    }
  }
}

/**
 * One-time OPFS → Postgres migration.
 * Checks if Postgres has no X01 matches but OPFS SQLite has data.
 */
async function tryOpfsMigration(): Promise<void> {
  try {
    // Check if migration is still needed (check multiple tables)
    const { query } = await import('./index')
    const countResult = await query<{ x01: string; cricket: string; atb: string }>(`SELECT
      (SELECT count(*) FROM x01_events) as x01,
      (SELECT count(*) FROM cricket_matches) as cricket,
      (SELECT count(*) FROM atb_matches) as atb`)
    const x01Events = parseInt(countResult[0]?.x01 ?? '0', 10)
    const cricket = parseInt(countResult[0]?.cricket ?? '0', 10)
    const atb = parseInt(countResult[0]?.atb ?? '0', 10)
    // Only skip if ALL major tables have data
    if (x01Events > 5000 && cricket > 0 && atb > 0) {
      console.debug('[OPFS Migration] Postgres hat bereits Daten, überspringe')
      return
    }
    console.debug(`[OPFS Migration] Prüfe... x01_events=${x01Events}, cricket=${cricket}, atb=${atb} → Migration nötig`)

    // Dynamically import migration module
    const { migrateOpfsToPostgres } = await import('./migrate-opfs')
    const success = await migrateOpfsToPostgres()
    if (success) {
      console.log('[OPFS Migration] ✅ Migration erfolgreich!')
    }
  } catch (e) {
    console.warn('[OPFS Migration] Übersprungen:', e)
  }
}

/**
 * Kompletter App-Start: DB initialisieren, Daten laden
 */
export async function startupWithSQLite(): Promise<{
  dbInit: DBInitResult
  dataLoaded: AppDataLoaded | null
}> {
  console.debug('[App Startup] Starte mit Postgres...')

  const dbInit = await initializeDB()

  if (!dbInit.success || !dbInit.usingSQLite) {
    console.warn('[App Startup] Postgres nicht verfügbar')
    return { dbInit, dataLoaded: null }
  }

  // Try one-time OPFS → Postgres migration
  await tryOpfsMigration()

  const dataLoaded = await loadAllDataFromSQLite()

  // One-time: migrate passwords for all profiles
  try {
    const res = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Api-Key': 'darts-2024-local' },
      body: JSON.stringify({ type: 'migrate-passwords' }),
    })
    const migResult = await res.json()
    if (migResult.migrated) {
      console.debug(`[Auth] Passwörter migriert: ${migResult.count} Profile`)
    }
  } catch (e) {
    console.warn('[Auth] Passwort-Migration übersprungen:', e)
  }

  console.debug('[App Startup] Abgeschlossen')
  return { dbInit, dataLoaded }
}

// Re-export für Convenience
export {
  initDB,
  isDBReady,
  getDBStatus,
  getDBVersion,
  closeDB,
}

// Dev Helpers
if (typeof window !== 'undefined') {
  ;(window as any).initializeDB = initializeDB
  ;(window as any).isSQLiteReady = isSQLiteReady
  ;(window as any).loadAllDataFromSQLite = loadAllDataFromSQLite
  ;(window as any).startupWithSQLite = startupWithSQLite
}
