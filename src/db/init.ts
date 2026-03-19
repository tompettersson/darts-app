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
import { warmMemCache } from '../storage'

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
      console.log('[DB Init] Starte Migration von LocalStorage...')
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

      console.log('[DB Init] Migration erfolgreich:', {
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
        console.log('[DB Init] CTF LocalStorage → SQLite Sync...')
        const count = await migrateCTFMatches()
        await dbSetMeta('ctf_ls_migrated', 'true')
        console.log(`[DB Init] ${count} CTF Matches nach SQLite migriert`)
      }
    } catch (e) {
      console.warn('[DB Init] CTF-Migration fehlgeschlagen:', e)
    }

    // One-Shot STR-Migration
    try {
      const strMigrated = await dbGetMeta('str_ls_migrated')
      if (strMigrated !== 'true') {
        console.log('[DB Init] STR LocalStorage → SQLite Sync...')
        const count = await migrateStrMatches()
        await dbSetMeta('str_ls_migrated', 'true')
        console.log(`[DB Init] ${count} STR Matches nach SQLite migriert`)
      }
    } catch (e) {
      console.warn('[DB Init] STR-Migration fehlgeschlagen:', e)
    }

    // One-Shot Highscore-Migration
    try {
      const hsMigrated = await dbGetMeta('highscore_ls_migrated')
      if (hsMigrated !== 'true') {
        console.log('[DB Init] Highscore LocalStorage → SQLite Sync...')
        const count = await migrateHighscoreMatches()
        await dbSetMeta('highscore_ls_migrated', 'true')
        console.log(`[DB Init] ${count} Highscore Matches nach SQLite migriert`)
      }
    } catch (e) {
      console.warn('[DB Init] Highscore-Migration fehlgeschlagen:', e)
    }

    // One-Shot X01 PlayerStats Migration
    try {
      const x01StatsMigrated = await dbGetMeta('x01_stats_ls_migrated')
      if (x01StatsMigrated !== 'true') {
        console.log('[DB Init] X01 PlayerStats LS → SQLite...')
        const raw = localStorage.getItem('x01.playerStats.v1')
        if (raw) {
          const store = JSON.parse(raw) as Record<string, any>
          let count = 0
          for (const s of Object.values(store)) {
            await dbSaveX01PlayerStats(s)
            count++
          }
          console.log(`[DB Init] ${count} X01 PlayerStats nach SQLite migriert`)
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
        console.log('[DB Init] 121 PlayerStats LS → SQLite...')
        const raw = localStorage.getItem('121.playerStats.v1')
        if (raw) {
          const store = JSON.parse(raw) as Record<string, any>
          let count = 0
          for (const [pid, s] of Object.entries(store)) {
            await dbSave121PlayerStats(pid, s)
            count++
          }
          console.log(`[DB Init] ${count} 121 PlayerStats nach SQLite migriert`)
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
        console.log('[DB Init] X01 Leaderboards LS → SQLite...')
        const raw = localStorage.getItem('darts.leaderboards.v1')
        if (raw) {
          const lb = JSON.parse(raw)
          await dbSaveX01Leaderboards(lb)
          console.log('[DB Init] X01 Leaderboards nach SQLite migriert')
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
        console.log('[DB Init] Cricket Leaderboards LS → SQLite...')
        const raw = localStorage.getItem('cricket.leaderboards.v1')
        if (raw) {
          const lb = JSON.parse(raw)
          await dbSaveCricketLeaderboards(lb)
          console.log('[DB Init] Cricket Leaderboards nach SQLite migriert')
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
        console.log('[DB Init] Outbox LS → SQLite...')
        const raw = localStorage.getItem('darts.outbox.v1')
        if (raw) {
          const items = JSON.parse(raw) as any[]
          let count = 0
          for (const item of items) {
            await dbQueueMatch(item)
            count++
          }
          console.log(`[DB Init] ${count} Outbox-Einträge nach SQLite migriert`)
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
        console.log('[DB Init] Cricket PlayerStats LS → SQLite...')
        const raw = localStorage.getItem('cricket.playerStats.v1')
        if (raw) {
          const store = JSON.parse(raw) as Record<string, any>
          let count = 0
          for (const s of Object.values(store)) {
            await dbSaveCricketPlayerStats(s)
            count++
          }
          console.log(`[DB Init] ${count} Cricket PlayerStats nach SQLite migriert`)
        }
        await dbSetMeta('cricket_stats_ls_migrated', 'true')
      }
    } catch (e) {
      console.warn('[DB Init] Cricket PlayerStats Migration fehlgeschlagen:', e)
    }

    console.log('[DB Init] SQLite bereit, Version:', version)
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
 * Merge-Helfer: Kombiniert SQLite-Daten mit existierenden LS-Daten.
 * Verhindert Datenverlust wenn async SQLite-Writes noch nicht fertig waren.
 * - Matches nur in SQLite → übernehmen
 * - Matches nur in LS → behalten (async write noch nicht angekommen)
 * - Matches in beiden → LS-Version bevorzugen wenn preferLS() true ist
 */
function mergeMatchData<T extends { id: string }>(
  sqliteData: T[],
  lsKey: string,
  preferLS: (ls: T, sqlite: T) => boolean
): T[] {
  let existingLS: T[] = []
  try {
    const raw = localStorage.getItem(lsKey)
    if (raw) existingLS = JSON.parse(raw)
  } catch { /* ignore */ }

  if (existingLS.length === 0) return sqliteData

  const sqliteMap = new Map(sqliteData.map(m => [m.id, m]))
  const merged = new Map<string, T>()

  // SQLite-Daten als Basis
  for (const m of sqliteData) {
    merged.set(m.id, m)
  }

  // LS-Daten mergen
  for (const lsMatch of existingLS) {
    const sqliteMatch = sqliteMap.get(lsMatch.id)
    if (!sqliteMatch) {
      // Nur in LS → behalten (async SQLite write noch nicht fertig)
      merged.set(lsMatch.id, lsMatch)
    } else if (preferLS(lsMatch, sqliteMatch)) {
      // In beiden, aber LS hat neuere Daten
      merged.set(lsMatch.id, lsMatch)
    }
    // sonst: SQLite-Version behalten (bereits in merged)
  }

  return Array.from(merged.values())
}

/** Max Matches pro Modus im LS-Cache (Events sind groß → Quota schonen) */
const LS_CACHE_LIMIT = 20

/** Begrenzt ein Match-Array auf die neuesten N Einträge */
function limitForLS<T extends { createdAt?: string }>(matches: T[], limit = LS_CACHE_LIMIT): T[] {
  if (matches.length <= limit) return matches
  return matches
    .slice()
    .sort((a, b) => {
      const da = a.createdAt ? new Date(a.createdAt).getTime() : 0
      const db = b.createdAt ? new Date(b.createdAt).getTime() : 0
      return db - da
    })
    .slice(0, limit)
}

/**
 * Lädt alle Daten aus SQLite und aktualisiert die LocalStorage-Caches.
 * Sollte beim App-Start aufgerufen werden.
 */
export async function loadAllDataFromSQLite(): Promise<AppDataLoaded> {
  const startTime = Date.now()

  try {
    // Parallel laden — jede Query einzeln wrappen für Robustheit bei fehlenden Tabellen
    const safe = <T,>(p: Promise<T>, fallback: T): Promise<T> =>
      p.catch((err) => { console.warn('[DB Init] Query failed (missing table?):', err.message); return fallback })

    const [profiles, x01Matches, cricketMatches, atbMatches, strMatches, highscoreMatches, bobs27Matches, operationMatches] = await Promise.all([
      safe(dbGetProfiles(), []),
      safe(dbGetX01Matches(), []),
      safe(dbGetCricketMatches(), []),
      safe(dbGetATBMatches(), []),
      safe(dbGetStrMatches(), []),
      safe(dbGetHighscoreMatches(), []),
      safe(dbGetBobs27Matches(), []),
      safe(dbGetOperationMatches(), []),
    ])

    // LocalStorage als Cache aktualisieren (für synchrone Zugriffe)
    const profilesForLS = profiles.map((p) => ({
      id: p.id,
      name: p.name,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      color: p.color ?? undefined,
    }))

    const x01ForLS = x01Matches.map((m) => ({
      id: m.id,
      title: m.title,
      matchName: m.matchName ?? undefined,
      notes: m.notes ?? undefined,
      createdAt: m.createdAt,
      events: m.events,
      playerIds: m.playerIds,
      finished: m.finished,
    }))

    const cricketForLS = cricketMatches.map((m) => ({
      id: m.id,
      title: m.title,
      matchName: m.matchName ?? undefined,
      notes: m.notes ?? undefined,
      createdAt: m.createdAt,
      events: m.events,
      playerIds: m.playerIds,
      finished: m.finished,
    }))

    const atbForLS = atbMatches.map((m) => ({
      id: m.id,
      title: m.title,
      createdAt: m.createdAt,
      finished: m.finished,
      finishedAt: m.finishedAt ?? undefined,
      durationMs: m.durationMs ?? undefined,
      winnerId: m.winnerId ?? undefined,
      winnerDarts: m.winnerDarts ?? undefined,
      mode: m.mode,
      direction: m.direction,
      players: m.players,
      events: m.events,
      structure: m.structure,
      config: m.config,
      generatedSequence: m.generatedSequence,
    }))

    // In LocalStorage schreiben - MERGE statt Überschreiben!
    // LS kann neuere Daten enthalten als SQLite (weil SQLite-Writes async sind).
    // Strategie: SQLite-Daten als Basis, aber LS-Matches behalten die:
    //   - in SQLite nicht existieren (async write noch nicht fertig)
    //   - in LS "finished" sind, aber in SQLite nicht (finished-Flag nicht angekommen)
    //   - in LS mehr Events haben (Events-Write nicht angekommen)
    try {
      localStorage.setItem('darts.profiles.v1', JSON.stringify(profilesForLS))
    } catch { /* ignore quota errors */ }

    // X01: Merge LS + SQLite
    try {
      const mergedX01 = limitForLS(mergeMatchData(
        x01ForLS,
        'darts.matches.v1',
        (a, b) => (a.finished && !b.finished) || (a.events?.length ?? 0) > (b.events?.length ?? 0)
      ))
      localStorage.setItem('darts.matches.v1', JSON.stringify(mergedX01))
    } catch (e) {
      console.warn('[DB Init] X01 Cache Quota-Error')
      try {
        localStorage.setItem('darts.matches.v1', JSON.stringify(limitForLS(x01ForLS, 10)))
      } catch { /* ignore */ }
    }

    // Cricket: Merge LS + SQLite
    try {
      const mergedCricket = limitForLS(mergeMatchData(
        cricketForLS,
        'cricket.matches.v1',
        (a, b) => (a.finished && !b.finished) || (a.events?.length ?? 0) > (b.events?.length ?? 0)
      ))
      localStorage.setItem('cricket.matches.v1', JSON.stringify(mergedCricket))
    } catch (e) {
      console.warn('[DB Init] Cricket Cache Quota-Error')
      try {
        localStorage.setItem('cricket.matches.v1', JSON.stringify(limitForLS(cricketForLS, 10)))
      } catch { /* ignore */ }
    }

    // ATB: Merge LS + SQLite
    try {
      const mergedATB = limitForLS(mergeMatchData(
        atbForLS,
        'atb.matches.v1',
        (a, b) => (a.finished && !b.finished) || (a.events?.length ?? 0) > (b.events?.length ?? 0)
      ))
      localStorage.setItem('atb.matches.v1', JSON.stringify(mergedATB))
    } catch (e) {
      console.warn('[DB Init] ATB Cache Quota-Error')
      try {
        localStorage.setItem('atb.matches.v1', JSON.stringify(limitForLS(atbForLS, 10)))
      } catch { /* ignore */ }
    }

    // STR: Merge LS + SQLite
    const strForLS = strMatches.map((m) => ({
      id: m.id,
      title: m.title,
      createdAt: m.createdAt,
      finished: m.finished,
      finishedAt: m.finishedAt ?? undefined,
      durationMs: m.durationMs ?? undefined,
      winnerId: m.winnerId ?? undefined,
      winnerDarts: m.winnerDarts ?? undefined,
      mode: m.mode,
      targetNumber: m.targetNumber ?? undefined,
      numberOrder: m.numberOrder ?? undefined,
      turnOrder: m.turnOrder ?? undefined,
      ringMode: m.ringMode ?? undefined,
      bullMode: m.bullMode ?? undefined,
      bullPosition: m.bullPosition ?? undefined,
      players: m.players,
      events: m.events,
      structure: m.structure,
      generatedOrder: m.generatedOrder,
      legWins: m.legWins,
      setWins: m.setWins,
    }))
    try {
      const mergedStr = limitForLS(mergeMatchData(
        strForLS,
        'str.matches.v1',
        (a: any, b: any) => (a.finished && !b.finished) || (a.events?.length ?? 0) > (b.events?.length ?? 0)
      ))
      localStorage.setItem('str.matches.v1', JSON.stringify(mergedStr))
    } catch (e) {
      console.warn('[DB Init] STR Cache Quota-Error')
      try {
        localStorage.setItem('str.matches.v1', JSON.stringify(limitForLS(strForLS, 10)))
      } catch { /* ignore */ }
    }

    // Highscore: Merge LS + SQLite
    const hsForLS = highscoreMatches.map((m) => ({
      id: m.id,
      title: m.title,
      createdAt: m.createdAt,
      finished: m.finished,
      finishedAt: m.finishedAt ?? undefined,
      durationMs: m.durationMs ?? undefined,
      winnerId: m.winnerId ?? undefined,
      winnerDarts: m.winnerDarts ?? undefined,
      targetScore: m.targetScore,
      players: m.players,
      events: m.events,
      structure: m.structure,
      legWins: m.legWins,
      setWins: m.setWins,
    }))
    try {
      const mergedHs = limitForLS(mergeMatchData(
        hsForLS,
        'highscore.matches.v1',
        (a: any, b: any) => (a.finished && !b.finished) || (a.events?.length ?? 0) > (b.events?.length ?? 0)
      ))
      localStorage.setItem('highscore.matches.v1', JSON.stringify(mergedHs))
    } catch (e) {
      console.warn('[DB Init] Highscore Cache Quota-Error')
      try {
        localStorage.setItem('highscore.matches.v1', JSON.stringify(limitForLS(hsForLS, 10)))
      } catch { /* ignore */ }
    }

    // Bob's 27: Merge LS + SQLite
    const bobs27ForLS = bobs27Matches.map((m) => ({
      id: m.id,
      title: m.title,
      createdAt: m.createdAt,
      finished: m.finished,
      finishedAt: m.finishedAt ?? undefined,
      durationMs: m.durationMs ?? undefined,
      winnerId: m.winnerId ?? undefined,
      winnerDarts: m.winnerDarts ?? undefined,
      players: m.players,
      events: m.events,
      config: m.config,
      targets: m.targets,
      finalScores: m.finalScores,
    }))
    try {
      const mergedBobs27 = limitForLS(mergeMatchData(
        bobs27ForLS,
        'bobs27.matches.v1',
        (a: any, b: any) => (a.finished && !b.finished) || (a.events?.length ?? 0) > (b.events?.length ?? 0)
      ))
      localStorage.setItem('bobs27.matches.v1', JSON.stringify(mergedBobs27))
    } catch (e) {
      console.warn('[DB Init] Bobs27 Cache Quota-Error')
      try {
        localStorage.setItem('bobs27.matches.v1', JSON.stringify(limitForLS(bobs27ForLS, 10)))
      } catch { /* ignore */ }
    }

    // Operation: Merge LS + SQLite
    const operationForLS = operationMatches.map((m) => ({
      id: m.id,
      title: m.title,
      createdAt: m.createdAt,
      finished: m.finished,
      finishedAt: m.finishedAt ?? undefined,
      durationMs: m.durationMs ?? undefined,
      winnerId: m.winnerId ?? undefined,
      players: m.players,
      events: m.events,
      config: m.config,
      finalScores: m.finalScores,
      legWins: m.legWins,
    }))
    try {
      const mergedOperation = limitForLS(mergeMatchData(
        operationForLS,
        'operation.matches.v1',
        (a: any, b: any) => (a.finished && !b.finished) || (a.events?.length ?? 0) > (b.events?.length ?? 0)
      ))
      localStorage.setItem('operation.matches.v1', JSON.stringify(mergedOperation))
    } catch (e) {
      console.warn('[DB Init] Operation Cache Quota-Error')
      try {
        localStorage.setItem('operation.matches.v1', JSON.stringify(limitForLS(operationForLS, 10)))
      } catch { /* ignore */ }
    }

    // Stats & Leaderboards: SQLite → Memory-Cache (für synchrone Reads in UI)
    try {
      const [x01Stats, stats121, x01Lb, cricketLb, cricketStats] = await Promise.all([
        safe(dbLoadAllX01PlayerStats(), {}),
        safe(dbLoadAll121PlayerStats(), {}),
        safe(dbLoadX01Leaderboards(), null),
        safe(dbLoadCricketLeaderboards(), null),
        safe(dbLoadAllCricketPlayerStats(), {}),
      ])

      // Memory-Cache befüllen (ersetzt LS für sync Reads)
      warmMemCache({
        x01PlayerStats: x01Stats,
        leaderboards: x01Lb ?? undefined,
        cricketLeaderboards: cricketLb ?? undefined,
      })

      // 121 + Cricket Stats nur in LS schreiben (kein Memory-Cache nötig, selten gelesen)
      if (Object.keys(stats121).length > 0) {
        try { localStorage.setItem('121.playerStats.v1', JSON.stringify(stats121)) } catch { /* quota */ }
      }
      if (Object.keys(cricketStats).length > 0) {
        try { localStorage.setItem('cricket.playerStats.v1', JSON.stringify(cricketStats)) } catch { /* quota */ }
      }

      // Alte LS-Keys löschen die jetzt aus Memory-Cache bedient werden (Quota freigeben)
      try {
        localStorage.removeItem('x01.playerStats.v1')
        localStorage.removeItem('darts.leaderboards.v1')
        localStorage.removeItem('cricket.leaderboards.v1')
        localStorage.removeItem('darts.outbox.v1')
      } catch { /* ignore */ }
    } catch (e) {
      console.warn('[DB Init] Stats/Leaderboards Cache-Sync fehlgeschlagen:', e)
    }

    const durationMs = Date.now() - startTime
    console.log(`[DB Init] Daten aus SQLite geladen in ${durationMs}ms:`, {
      profiles: profiles.length,
      x01: x01Matches.length,
      cricket: cricketMatches.length,
      atb: atbMatches.length,
      str: strMatches.length,
      highscore: highscoreMatches.length,
      bobs27: bobs27Matches.length,
      operation: operationMatches.length,
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
      profiles: 0,
      x01Matches: 0,
      cricketMatches: 0,
      atbMatches: 0,
      strMatches: 0,
      highscoreMatches: 0,
      bobs27Matches: 0,
      operationMatches: 0,
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
  console.log('[App Startup] Starte mit SQLite...')

  // 1. DB initialisieren (inkl. Migration falls nötig)
  const dbInit = await initializeDB()

  if (!dbInit.success || !dbInit.usingSQLite) {
    console.warn('[App Startup] SQLite nicht verfügbar, nutze LocalStorage')
    return { dbInit, dataLoaded: null }
  }

  // 2. Daten aus SQLite laden
  const dataLoaded = await loadAllDataFromSQLite()

  console.log('[App Startup] Abgeschlossen')
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
