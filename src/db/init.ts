// src/db/init.ts
// Öffentlicher Entry-Point für SQLite Database

import { initDB, isDBReady, getDBStatus, getDBVersion, closeDB } from './index'
import { migrateFromLocalStorage, migrateCTFMatches, migrateStrMatches, migrateHighscoreMatches, isMigrated, getMigrationStatus, clearMigratedData, debugLocalStorage, forceMigration, listAllStorageKeys, enrichAllEvents } from './migrate'
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
  dbGetMeta,
  dbSetMeta,
  dbSaveX01PlayerStats,
  dbSave121PlayerStats,
  dbSaveX01Leaderboards,
  dbSaveCricketLeaderboards,
  dbQueueMatch,
  dbLoadAllX01PlayerStats,
  dbLoadAll121PlayerStats,
  dbLoadX01Leaderboards,
  dbLoadCricketLeaderboards,
  dbSaveCricketPlayerStats,
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
 * Initialisiert die SQLite-Datenbank und migriert automatisch von LocalStorage
 */
export async function initializeDB(): Promise<DBInitResult> {
  try {
    // DB initialisieren
    await initDB()
    const version = getDBVersion()

    // Prüfen ob bereits migriert
    const alreadyMigrated = await isMigrated()

    if (!alreadyMigrated) {
      // Migration von LocalStorage durchführen
      console.debug('[DB Init] Starte Migration von LocalStorage...')
      const result = await migrateFromLocalStorage()

      if (!result.success) {
        console.error('[DB Init] Migration fehlgeschlagen:', result.error)
        return {
          success: false,
          usingSQLite: true,
          migratedFromLS: false,
          version,
          error: result.error,
        }
      }

      console.debug('[DB Init] Migration erfolgreich:', {
        profiles: result.profiles,
        x01: result.x01Matches,
        cricket: result.cricketMatches,
        atb: result.atbMatches,
        duration: `${result.durationMs}ms`,
      })

      // Event-Enrichment durchführen (für neue Statistik-Felder)
      try {
        await enrichAllEvents()
      } catch (e) {
        console.warn('[DB Init] Event-Enrichment fehlgeschlagen:', e)
      }

      return {
        success: true,
        usingSQLite: true,
        migratedFromLS: true,
        version,
      }
    }

    // Auch bei bereits migrierter DB das Enrichment durchführen (für alte Events)
    try {
      await enrichAllEvents()
    } catch (e) {
      console.warn('[DB Init] Event-Enrichment fehlgeschlagen:', e)
    }

    // One-Shot CTF-Migration (für bereits migrierte DBs die noch kein CTF hatten)
    try {
      const ctfMigrated = await dbGetMeta('ctf_ls_migrated')
      if (ctfMigrated !== 'true') {
        console.debug('[DB Init] CTF LocalStorage → SQLite Sync...')
        const count = await migrateCTFMatches()
        await dbSetMeta('ctf_ls_migrated', 'true')
        console.debug(`[DB Init] ${count} CTF Matches nach SQLite migriert`)
      }
    } catch (e) {
      console.warn('[DB Init] CTF-Migration fehlgeschlagen:', e)
    }

    // One-Shot STR-Migration
    try {
      const strMigrated = await dbGetMeta('str_ls_migrated')
      if (strMigrated !== 'true') {
        console.debug('[DB Init] STR LocalStorage → SQLite Sync...')
        const count = await migrateStrMatches()
        await dbSetMeta('str_ls_migrated', 'true')
        console.debug(`[DB Init] ${count} STR Matches nach SQLite migriert`)
      }
    } catch (e) {
      console.warn('[DB Init] STR-Migration fehlgeschlagen:', e)
    }

    // One-Shot Highscore-Migration
    try {
      const hsMigrated = await dbGetMeta('highscore_ls_migrated')
      if (hsMigrated !== 'true') {
        console.debug('[DB Init] Highscore LocalStorage → SQLite Sync...')
        const count = await migrateHighscoreMatches()
        await dbSetMeta('highscore_ls_migrated', 'true')
        console.debug(`[DB Init] ${count} Highscore Matches nach SQLite migriert`)
      }
    } catch (e) {
      console.warn('[DB Init] Highscore-Migration fehlgeschlagen:', e)
    }

    // One-Shot X01 PlayerStats Migration
    try {
      const x01StatsMigrated = await dbGetMeta('x01_stats_ls_migrated')
      if (x01StatsMigrated !== 'true') {
        console.debug('[DB Init] X01 PlayerStats LS → SQLite...')
        const raw = localStorage.getItem('x01.playerStats.v1')
        if (raw) {
          const store = JSON.parse(raw) as Record<string, any>
          let count = 0
          for (const s of Object.values(store)) {
            await dbSaveX01PlayerStats(s)
            count++
          }
          console.debug(`[DB Init] ${count} X01 PlayerStats nach SQLite migriert`)
        }
        await dbSetMeta('x01_stats_ls_migrated', 'true')
      }
    } catch (e) {
      console.warn('[DB Init] X01 PlayerStats Migration fehlgeschlagen:', e)
    }

    // One-Shot 121 PlayerStats Migration
    try {
      const stats121Migrated = await dbGetMeta('stats_121_ls_migrated')
      if (stats121Migrated !== 'true') {
        console.debug('[DB Init] 121 PlayerStats LS → SQLite...')
        const raw = localStorage.getItem('121.playerStats.v1')
        if (raw) {
          const store = JSON.parse(raw) as Record<string, any>
          let count = 0
          for (const [pid, s] of Object.entries(store)) {
            await dbSave121PlayerStats(pid, s)
            count++
          }
          console.debug(`[DB Init] ${count} 121 PlayerStats nach SQLite migriert`)
        }
        await dbSetMeta('stats_121_ls_migrated', 'true')
      }
    } catch (e) {
      console.warn('[DB Init] 121 PlayerStats Migration fehlgeschlagen:', e)
    }

    // One-Shot X01 Leaderboards Migration
    try {
      const x01LbMigrated = await dbGetMeta('x01_lb_ls_migrated')
      if (x01LbMigrated !== 'true') {
        console.debug('[DB Init] X01 Leaderboards LS → SQLite...')
        const raw = localStorage.getItem('darts.leaderboards.v1')
        if (raw) {
          const lb = JSON.parse(raw)
          await dbSaveX01Leaderboards(lb)
          console.debug('[DB Init] X01 Leaderboards nach SQLite migriert')
        }
        await dbSetMeta('x01_lb_ls_migrated', 'true')
      }
    } catch (e) {
      console.warn('[DB Init] X01 Leaderboards Migration fehlgeschlagen:', e)
    }

    // One-Shot Cricket Leaderboards Migration
    try {
      const cricketLbMigrated = await dbGetMeta('cricket_lb_ls_migrated')
      if (cricketLbMigrated !== 'true') {
        console.debug('[DB Init] Cricket Leaderboards LS → SQLite...')
        const raw = localStorage.getItem('cricket.leaderboards.v1')
        if (raw) {
          const lb = JSON.parse(raw)
          await dbSaveCricketLeaderboards(lb)
          console.debug('[DB Init] Cricket Leaderboards nach SQLite migriert')
        }
        await dbSetMeta('cricket_lb_ls_migrated', 'true')
      }
    } catch (e) {
      console.warn('[DB Init] Cricket Leaderboards Migration fehlgeschlagen:', e)
    }

    // One-Shot Outbox Migration
    try {
      const outboxMigrated = await dbGetMeta('outbox_ls_migrated')
      if (outboxMigrated !== 'true') {
        console.debug('[DB Init] Outbox LS → SQLite...')
        const raw = localStorage.getItem('darts.outbox.v1')
        if (raw) {
          const items = JSON.parse(raw) as any[]
          let count = 0
          for (const item of items) {
            await dbQueueMatch(item)
            count++
          }
          console.debug(`[DB Init] ${count} Outbox-Einträge nach SQLite migriert`)
        }
        await dbSetMeta('outbox_ls_migrated', 'true')
      }
    } catch (e) {
      console.warn('[DB Init] Outbox Migration fehlgeschlagen:', e)
    }

    // One-Shot Cricket PlayerStats Migration
    try {
      const cricketStatsMigrated = await dbGetMeta('cricket_stats_ls_migrated')
      if (cricketStatsMigrated !== 'true') {
        console.debug('[DB Init] Cricket PlayerStats LS → SQLite...')
        const raw = localStorage.getItem('cricket.playerStats.v1')
        if (raw) {
          const store = JSON.parse(raw) as Record<string, any>
          let count = 0
          for (const s of Object.values(store)) {
            await dbSaveCricketPlayerStats(s)
            count++
          }
          console.debug(`[DB Init] ${count} Cricket PlayerStats nach SQLite migriert`)
        }
        await dbSetMeta('cricket_stats_ls_migrated', 'true')
      }
    } catch (e) {
      console.warn('[DB Init] Cricket PlayerStats Migration fehlgeschlagen:', e)
    }

    console.debug('[DB Init] SQLite bereit, Version:', version)
    return {
      success: true,
      usingSQLite: true,
      migratedFromLS: false,
      version,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[DB Init] Fehler:', error)

    // Fallback: App läuft weiter ohne SQLite
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
 * Prüft ob SQLite verfügbar und bereit ist
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
 * Lädt alle Daten aus SQLite direkt in die Memory-Caches.
 * Kein LocalStorage mehr nötig — SQLite ist die einzige Quelle.
 */
export async function loadAllDataFromSQLite(): Promise<AppDataLoaded> {
  const startTime = Date.now()

  try {
    const safe = <T,>(p: Promise<T>, fallback: T): Promise<T> =>
      p.catch((err) => { console.warn('[DB Init] Query failed (missing table?):', err.message); return fallback })

    // Alle Daten parallel aus SQLite laden
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

    // Memory-Caches direkt befüllen (kein LocalStorage!)
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

    // Alte LS-Match-Keys aufräumen (einmalig, kann irgendwann entfernt werden)
    try {
      const legacyKeys = [
        'darts.matches.v1', 'cricket.matches.v1', 'atb.matches.v1', 'str.matches.v1',
        'ctf.matches.v1', 'highscore.matches.v1', 'shanghai.matches.v1', 'killer.matches.v1',
        'bobs27.matches.v1', 'operation.matches.v1', 'darts.profiles.v1',
        'x01.playerStats.v1', '121.playerStats.v1', 'cricket.playerStats.v1',
        'darts.leaderboards.v1', 'cricket.leaderboards.v1', 'darts.outbox.v1',
      ]
      for (const key of legacyKeys) localStorage.removeItem(key)
    } catch { /* ignore */ }

    const durationMs = Date.now() - startTime
    console.debug(`[DB Init] Daten aus SQLite geladen in ${durationMs}ms:`, {
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
    console.error('[DB Init] Fehler beim Laden aus SQLite:', error)
    return {
      profiles: 0, x01Matches: 0, cricketMatches: 0, atbMatches: 0,
      strMatches: 0, highscoreMatches: 0, bobs27Matches: 0, operationMatches: 0,
      durationMs: Date.now() - startTime,
    }
  }
}

/**
 * Kompletter App-Start: DB initialisieren, migrieren falls nötig, Daten laden
 */
export async function startupWithSQLite(): Promise<{
  dbInit: DBInitResult
  dataLoaded: AppDataLoaded | null
}> {
  console.debug('[App Startup] Starte mit SQLite...')

  // 1. DB initialisieren (inkl. Migration falls nötig)
  const dbInit = await initializeDB()

  if (!dbInit.success || !dbInit.usingSQLite) {
    console.warn('[App Startup] SQLite nicht verfügbar, nutze LocalStorage')
    return { dbInit, dataLoaded: null }
  }

  // 2. Daten aus SQLite laden
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
  migrateFromLocalStorage,
  isMigrated,
  getMigrationStatus,
  clearMigratedData,
  debugLocalStorage,
  forceMigration,
}

// Dev Helpers
if (typeof window !== 'undefined') {
  ;(window as any).initializeDB = initializeDB
  ;(window as any).isSQLiteReady = isSQLiteReady
  ;(window as any).debugLocalStorage = debugLocalStorage
  ;(window as any).forceMigration = forceMigration
  ;(window as any).loadAllDataFromSQLite = loadAllDataFromSQLite
  ;(window as any).startupWithSQLite = startupWithSQLite
}
