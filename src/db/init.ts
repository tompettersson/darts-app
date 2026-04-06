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
  dbRepairUnfinishedMatches,
} from './storage'
import { warmAllCaches } from '../storage'

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

    // === Phase 1: Critical data for login screen (fast) ===
    // Only load profiles — everything else is loaded lazily when needed
    const profiles = await safe(dbGetProfiles(), [])

    warmAllCaches({
      profiles: profiles.map((p) => ({
        id: p.id, name: p.name, createdAt: p.createdAt, updatedAt: p.updatedAt, color: p.color ?? undefined,
      })),
    })

    const phase1Ms = Date.now() - startTime
    console.debug(`[DB Init] Phase 1 (profiles) in ${phase1Ms}ms: ${profiles.length} profiles`)

    // === Phase 2: Match data loaded in background (non-blocking) ===
    // This runs after the app is already interactive
    setTimeout(async () => {
      try {
        // Repair stale matches BEFORE loading data into cache
        try {
          const { repaired } = await dbRepairUnfinishedMatches()
          if (repaired.length > 0) console.log(`[DB Repair] Fixed ${repaired.length} matches:`, repaired)
        } catch {}

        const bgStart = Date.now()
        const [x01Matches, cricketMatches, atbMatches, strMatches, highscoreMatches,
               shanghaiMatches, killerMatches, ctfMatches, bobs27Matches, operationMatches] = await Promise.all([
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

        warmAllCaches({
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

        // Stats & Leaderboards — removed from startup.
        // These were pre-loaded into memCache but never read during normal app usage.
        // All stats are loaded on-demand via useSQLStats hook + player_stats_cache.
        // See docs/startup-optimization.md for the full plan.

        console.debug(`[DB Init] Phase 2 (matches) in ${Date.now() - bgStart}ms`)
        // Signal to UI components that match data is now available
        window.dispatchEvent(new CustomEvent('darts-data-ready'))
      } catch (e) {
        console.warn('[DB Init] Background load failed:', e)
        window.dispatchEvent(new CustomEvent('darts-data-ready'))
      }
    }, 100) // Small delay to let the UI render first

    const durationMs = Date.now() - startTime
    console.debug(`[DB Init] Ready in ${durationMs}ms (${profiles.length} profiles, matches loading in background)`)

    return {
      profiles: profiles.length,
      x01Matches: 0, // loaded in background
      cricketMatches: 0,
      atbMatches: 0,
      strMatches: 0,
      highscoreMatches: 0,
      bobs27Matches: 0,
      operationMatches: 0,
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

  const dataLoaded = await loadAllDataFromSQLite()

  // Run migrations in background (non-blocking)
  setTimeout(async () => {
    try { await tryOpfsMigration() } catch {}
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
    } catch {}
  }, 500)

  // Legacy: keep try/catch structure for remaining code
  try {
    void 0 // placeholder
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
