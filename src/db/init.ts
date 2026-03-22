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

    // Alle Daten parallel aus Postgres laden
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

  const dataLoaded = await loadAllDataFromSQLite()

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
