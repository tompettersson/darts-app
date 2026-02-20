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
  dbGetMeta,
  dbSetMeta,
} from './storage'

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
const LS_CACHE_LIMIT = 40

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

    const [profiles, x01Matches, cricketMatches, atbMatches, strMatches, highscoreMatches] = await Promise.all([
      safe(dbGetProfiles(), []),
      safe(dbGetX01Matches(), []),
      safe(dbGetCricketMatches(), []),
      safe(dbGetATBMatches(), []),
      safe(dbGetStrMatches(), []),
      safe(dbGetHighscoreMatches(), []),
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
        localStorage.setItem('darts.matches.v1', JSON.stringify(limitForLS(x01ForLS, 20)))
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
        localStorage.setItem('cricket.matches.v1', JSON.stringify(limitForLS(cricketForLS, 20)))
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
        localStorage.setItem('atb.matches.v1', JSON.stringify(limitForLS(atbForLS, 20)))
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
        localStorage.setItem('str.matches.v1', JSON.stringify(limitForLS(strForLS, 20)))
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
        localStorage.setItem('highscore.matches.v1', JSON.stringify(limitForLS(hsForLS, 20)))
      } catch { /* ignore */ }
    }

    const durationMs = Date.now() - startTime
    console.log(`[DB Init] Daten aus SQLite geladen in ${durationMs}ms:`, {
      profiles: profiles.length,
      x01: x01Matches.length,
      cricket: cricketMatches.length,
      atb: atbMatches.length,
      str: strMatches.length,
      highscore: highscoreMatches.length,
    })

    return {
      profiles: profiles.length,
      x01Matches: x01Matches.length,
      cricketMatches: cricketMatches.length,
      atbMatches: atbMatches.length,
      strMatches: strMatches.length,
      highscoreMatches: highscoreMatches.length,
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
