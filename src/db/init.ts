// src/db/init.ts
// Öffentlicher Entry-Point für Postgres Database (Neon)

import { initDB, isDBReady, getDBStatus, getDBVersion, closeDB } from './index'
import {
  dbGetProfiles,
  dbGetOpenMatchSummaries,
  dbGetX01MatchById,
  dbGetCricketMatchById,
  dbGetATBMatchById,
  dbGetShanghaiMatchById,
  dbGetKillerMatchById,
  dbGetBobs27MatchById,
  dbGetOperationMatchById,
  dbRepairUnfinishedMatches,
} from './storage'
import { warmAllCaches, setOpenMatchSummaries } from '../storage'

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
        // Repair stale matches — only once per 24h to avoid 10+ queries on every startup
        const REPAIR_KEY = 'darts.lastRepairCheck'
        const lastRepair = localStorage.getItem(REPAIR_KEY)
        const needsRepair = !lastRepair || (Date.now() - parseInt(lastRepair, 10)) > 24 * 60 * 60 * 1000
        if (needsRepair) {
          try {
            const { repaired } = await dbRepairUnfinishedMatches()
            if (repaired.length > 0) console.log(`[DB Repair] Fixed ${repaired.length} matches:`, repaired)
            localStorage.setItem(REPAIR_KEY, String(Date.now()))
          } catch {}
        }

        const bgStart = Date.now()

        // Step 1: Find which games have open (unfinished) matches (1 lightweight query)
        const openMatches = await safe(dbGetOpenMatchSummaries(), [])
        setOpenMatchSummaries(openMatches)

        // Step 2: Load full match data ONLY for open matches (so "Spiel fortsetzen" works)
        // This loads at most 1 match per game type — not 50 like before
        const loaders: Record<string, (id: string) => Promise<any>> = {
          x01: async (id) => { const m = await dbGetX01MatchById(id); return m ? { x01Matches: [{ id: m.id, title: m.title, matchName: m.matchName, notes: m.notes, createdAt: m.createdAt, events: m.events, playerIds: m.playerIds, finished: m.finished }] } : null },
          cricket: async (id) => { const m = await dbGetCricketMatchById(id); return m ? { cricketMatches: [{ id: m.id, title: m.title, matchName: m.matchName, notes: m.notes, createdAt: m.createdAt, events: m.events, playerIds: m.playerIds, finished: m.finished }] } : null },
          atb: async (id) => { const m = await dbGetATBMatchById(id); return m ? { atbMatches: [m] } : null },
          shanghai: async (id) => { const m = await dbGetShanghaiMatchById(id); return m ? { shanghaiMatches: [m] } : null },
          killer: async (id) => { const m = await dbGetKillerMatchById(id); return m ? { killerMatches: [m] } : null },
          bobs27: async (id) => { const m = await dbGetBobs27MatchById(id); return m ? { bobs27Matches: [m] } : null },
          operation: async (id) => { const m = await dbGetOperationMatchById(id); return m ? { operationMatches: [m] } : null },
        }

        if (openMatches.length > 0) {
          const cacheData: Record<string, any[]> = {}
          const loadPromises = openMatches
            .filter(om => loaders[om.gameType])
            .map(om => safe(loaders[om.gameType](om.id), null))

          const results = await Promise.all(loadPromises)
          for (const r of results) {
            if (r) Object.assign(cacheData, r)
          }

          if (Object.keys(cacheData).length > 0) {
            warmAllCaches(cacheData)
          }
        }

        console.debug(`[DB Init] Phase 2 (open matches) in ${Date.now() - bgStart}ms: ${openMatches.length} open`)
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
