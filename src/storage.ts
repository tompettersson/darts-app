// src/storage.ts
// Data Storage Layer — Neon Postgres (primary) + In-Memory Cache
// - Profile
// - Matches (X01)
// - CricketMatches
// - Leaderboards (X01 & Cricket)
// - Backup / Restore (Merge)
// - LastActivity (zuletzt gespieltes Spiel)

// SQLite Storage Functions
import {
  ensureDB,
  dbGetProfiles,
  dbSaveProfile,
  dbDeleteProfile,
  dbGetProfileByName,
  dbGetX01Matches,
  dbGetX01MatchById,
  dbSaveX01Match,
  dbUpdateX01Events,
  dbFinishX01Match,
  dbGetCricketMatches,
  dbGetCricketMatchById,
  dbSaveCricketMatch,
  dbUpdateCricketEvents,
  dbGetATBMatches,
  dbGetATBMatchById,
  dbSaveATBMatch,
  dbUpdateATBEvents,
  dbFinishATBMatch,
  dbGetCTFMatches,
  dbSaveCTFMatch,
  dbUpdateCTFEvents,
  dbGetStrMatches,
  dbSaveStrMatch,
  dbUpdateStrEvents,
  dbFinishStrMatch,
  dbGetHighscoreMatches,
  dbSaveHighscoreMatch,
  dbUpdateHighscoreEvents,
  dbFinishHighscoreMatch,
  dbGetShanghaiMatches,
  dbSaveShanghaiMatch,
  dbUpdateShanghaiEvents,
  dbGetKillerMatches,
  dbSaveKillerMatch,
  dbUpdateKillerEvents,
  dbFinishKillerMatch,
  dbGetBobs27Matches,
  dbSaveBobs27Match,
  dbUpdateBobs27Events,
  dbGetOperationMatches,
  dbSaveOperationMatch,
  dbUpdateOperationEvents,
  type DBProfile,
  type DBX01Match,
  type DBCricketMatch,
  type DBATBMatch,
  type DBCTFMatch,
  type DBStrMatch,
  type DBHighscoreMatch,
  type DBShanghaiMatch,
  type DBKillerMatch,
  type DBBobs27Match,
  type DBOperationMatch,
  dbSaveX01PlayerStats,
  dbLoadAllX01PlayerStats,
  dbSave121PlayerStats,
  dbLoadAll121PlayerStats,
  dbSaveX01Leaderboards,
  dbLoadX01Leaderboards,
  dbSaveCricketLeaderboards,
  dbLoadCricketLeaderboards,
  dbGetMeta,
  dbSetMeta,
  dbInsertActiveGame,
  dbDeleteActiveGame,
} from './db/storage'

import { exec, query } from './db/index'
import { queueStatsRefresh } from './db/stats-cache'
import { loadGroup } from './hooks/useSQLStats'
import { queryClient } from './queryClient'
// LocalStorage cache removed — data always loaded fresh from DB

import {
  id,
  now,
  type DartsEvent,
  type MatchStarted,
  type VisitAdded,
  type LegFinished,
  type MatchFinished,
  type SetStarted,
  type LegStarted,
  computeStats,
  applyEvents,
  // Type Guards für type-safe Event-Filterung
  isMatchStarted,
  isMatchFinished,
  isVisitAdded,
  isLegFinished,
} from './darts501'

import {
  type CricketRange,
  type CricketStyle,
  type CutthroatEndgame,
  type CrazyMode,
  type CricketEvent,
  type CricketMatchStarted,
  type CricketMatchFinished,
  applyCricketEvents as applyCricket,
  now as cricketNow,
  id as cricketId,
  targetWinsFromMatch,
  // Type Guards für type-safe Event-Filterung
  isCricketMatchStarted,
  isCricketMatchFinished,
} from './dartsCricket'

import {
  computeCricketStats,
  type CricketMatchComputedStats,
} from './stats/computeCricketStats'

import type { CricketLeaderboardsUI, X01LeaderboardsUI } from './types/stats'
import type { Stats121LongTerm } from './types/stats121'
import { aggregate121LongTermStats } from './stats/compute121LongTermStats'
import { compute121LegStats } from './stats/compute121LegStats'


// 🔥 Langzeit X01 Spieler-Stats
import {
  computeX01PlayerMatchStats,
  type X01PerMatchStatsBundle,
  type X01PerMatchPlayerStats,
} from './stats/computeX01PlayerMatchStats'

/* -------------------------------------------------
   Zentrales DB Error-Handling
------------------------------------------------- */
function trackDBError(type: string, id: string, err: unknown) {
  console.error(`[KRITISCH] DB-Fehler (${type}):`, id, err)
  try {
    const errors = JSON.parse(localStorage.getItem('darts.dbErrors') || '[]')
    errors.push({ ts: new Date().toISOString(), type, id, error: String(err) })
    localStorage.setItem('darts.dbErrors', JSON.stringify(errors.slice(-20))) // Max 20 Fehler
  } catch {}
}

// Debug-Funktion um DB-Fehler anzuzeigen
export function getDBErrors(): Array<{ ts: string; type: string; id: string; error: string }> {
  try {
    return JSON.parse(localStorage.getItem('darts.dbErrors') || '[]')
  } catch {
    return []
  }
}

/* -------------------------------------------------
   Write Queue — serializes DB writes per match
   Prevents race conditions with DELETE+re-INSERT pattern
   when multiple fire-and-forget persist calls overlap
------------------------------------------------- */
const writeQueues = new Map<string, Promise<void>>()

function queueWrite(key: string, fn: () => Promise<void>): void {
  const prev = writeQueues.get(key) ?? Promise.resolve()
  const next = prev.then(fn, () => fn()).catch(err => {
    console.warn('[DB] queued write failed:', err)
  })
  writeQueues.set(key, next)
  next.then(() => { if (writeQueues.get(key) === next) writeQueues.delete(key) })
}

// Debug-Funktion um DB-Fehler zu löschen
export function clearDBErrors() {
  localStorage.removeItem('darts.dbErrors')
}

/* -------------------------------------------------
   LocalStorage Keys — NUR noch für UI-Settings & Session-State
   Match-Daten, Profiles, Stats → SQLite + Memory-Cache
------------------------------------------------- */
const LS_KEYS = {
  lastOpenMatchId: 'darts.lastOpenMatchId.v1',
  lastActivity: 'darts.lastActivity.v1',
} as const

const LS_CRICKET = {
  lastOpenMatchId: 'cricket.lastOpenMatchId.v1',
} as const

/* -------------------------------------------------
   In-Memory Cache — Alle Daten aus SQLite
   Wird beim App-Start aus SQLite befüllt.
------------------------------------------------- */
const memCache = {
  x01PlayerStats: null as Record<string, X01PlayerLongTermStats> | null,
  leaderboards: null as Leaderboards | null,
  cricketLeaderboards: null as CricketLeaderboards | null,
}

/** Befüllt den Memory-Cache (wird von db/init.ts aufgerufen) */
export function warmMemCache(data: {
  x01PlayerStats?: Record<string, any>
  leaderboards?: any
  cricketLeaderboards?: any
}) {
  if (data.x01PlayerStats && Object.keys(data.x01PlayerStats).length > 0) {
    memCache.x01PlayerStats = data.x01PlayerStats
  }
  if (data.leaderboards) {
    memCache.leaderboards = data.leaderboards
  }
  if (data.cricketLeaderboards) {
    memCache.cricketLeaderboards = data.cricketLeaderboards
  }
}

/** Befüllt alle Match-/Profil-Caches beim App-Start (wird von db/init.ts aufgerufen) */
export function warmAllCaches(data: {
  profiles?: any[]
  x01Matches?: any[]
  cricketMatches?: any[]
  atbMatches?: any[]
  strMatches?: any[]
  ctfMatches?: any[]
  shanghaiMatches?: any[]
  killerMatches?: any[]
  bobs27Matches?: any[]
  operationMatches?: any[]
  highscoreMatches?: any[]
}) {
  if (data.profiles) profilesCache = data.profiles
  if (data.x01Matches) x01MatchesCache = data.x01Matches
  if (data.cricketMatches) cricketMatchesCache = data.cricketMatches
  if (data.atbMatches) atbMatchesCache = data.atbMatches
  if (data.strMatches) strMatchesCache = data.strMatches
  if (data.ctfMatches) ctfMatchesCache = data.ctfMatches
  if (data.shanghaiMatches) shanghaiMatchesCache = data.shanghaiMatches
  if (data.killerMatches) killerMatchesCache = data.killerMatches
  if (data.bobs27Matches) bobs27MatchesCache = data.bobs27Matches
  if (data.operationMatches) operationMatchesCache = data.operationMatches
  if (data.highscoreMatches) highscoreMatchesCache = data.highscoreMatches
}

// ============================================================================
// Active Games Cache (loaded at startup)
// ============================================================================

import type { ActiveGame } from './db/storage'

let activeGamesCache: ActiveGame[] = []

export function setActiveGamesCache(games: ActiveGame[]): void {
  activeGamesCache = games
}

export function getActiveGamesCache(): ActiveGame[] {
  return activeGamesCache
}

export function removeFromActiveGamesCache(matchId: string): void {
  activeGamesCache = activeGamesCache.filter(g => g.id !== matchId)
}

export function addToActiveGamesCache(game: ActiveGame): void {
  if (!activeGamesCache.find(g => g.id === game.id)) {
    activeGamesCache.unshift(game)
  }
}

/** Insert active game into DB AND update local cache */
export function registerActiveGame(game: ActiveGame): void {
  addToActiveGamesCache(game)
  dbInsertActiveGame(game).catch(() => {})
}

/** Internal helper: find an active (unfinished) game by game type — replaces old getOpenMatchSummary. */
function getOpenMatchSummary(gameType: string): { id: string; title: string } | undefined {
  return activeGamesCache.find(g => g.gameType === gameType)
}

/* -------------------------------------------------
   Helper: read / write JSON — NUR noch für UI-Settings
------------------------------------------------- */
function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function writeJSON<T>(key: string, value: T) {
  localStorage.setItem(key, JSON.stringify(value))
}


/** Prüft, ob Spieler Gast ist (aus MatchStarted). */
function isGuestPlayerInStart(
  start: MatchStarted | undefined,
  playerId: string
): boolean {
  if (!start) return false
  const p = start.players.find(p => p.playerId === playerId)
  return !!(
    p &&
    (p.isGuest === true || String(p.playerId).startsWith('guest:'))
  )
}

/* -------------------------------------------------
   Profile (SQLite + LocalStorage Cache)
------------------------------------------------- */
export type Profile = {
  id: string
  name: string
  createdAt: string
  updatedAt: string
  color?: string
}

// Cache für synchrone Zugriffe
let profilesCache: Profile[] | null = null
let usageCountsCache: Record<string, number> | null = null

/**
 * Zaehlt wie oft jeder Spieler in Matches aller Spielmodi vorkommt.
 * Ergebnis wird gecacht und bei saveProfiles() invalidiert.
 * Liest jetzt aus Memory-Caches statt LocalStorage.
 */
function getPlayerUsageCounts(): Record<string, number> {
  if (usageCountsCache) return usageCountsCache
  const counts: Record<string, number> = {}
  const bump = (pid: string) => { counts[pid] = (counts[pid] ?? 0) + 1 }

  try {
    for (const m of (x01MatchesCache ?? [])) for (const pid of (m.playerIds ?? [])) bump(pid)
    for (const m of (cricketMatchesCache ?? [])) for (const pid of (m.playerIds ?? [])) bump(pid)
    for (const m of (atbMatchesCache ?? [])) for (const p of (m.players ?? [])) bump(p.playerId)
    for (const m of (ctfMatchesCache ?? [])) for (const p of ((m as any).players ?? [])) bump(p.playerId)
    for (const m of (strMatchesCache ?? [])) for (const p of ((m as any).players ?? [])) bump(p.playerId)
    for (const m of (shanghaiMatchesCache ?? [])) for (const p of ((m as any).players ?? [])) bump(p.playerId)
    for (const m of (killerMatchesCache ?? [])) for (const p of ((m as any).players ?? [])) bump(p.playerId)
    for (const m of (bobs27MatchesCache ?? [])) for (const p of ((m as any).players ?? [])) bump(p.playerId)
    for (const m of (operationMatchesCache ?? [])) for (const p of ((m as any).players ?? [])) bump(p.playerId)
    for (const m of (highscoreMatchesCache ?? [])) for (const p of ((m as any).players ?? [])) bump(p.playerId)
  } catch {
    // Bei Fehler: leere Counts -> keine Sortierung
  }

  usageCountsCache = counts
  return counts
}

export function getProfiles(): Profile[] {
  // Synchroner Zugriff: nur noch Memory-Cache
  if (profilesCache) return profilesCache
  return []
}

export function saveProfiles(list: Profile[]) {
  profilesCache = list  // Cache aktualisieren
  usageCountsCache = null
}

// SQLite-aware Profile laden
export async function getProfilesAsync(): Promise<Profile[]> {
  try {
    const useSQLite = await ensureDB()
    if (useSQLite) {
      const dbProfiles = await dbGetProfiles()
      const profiles = dbProfiles.map((p): Profile => ({
        id: p.id,
        name: p.name,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
        color: p.color ?? undefined,
      }))
      profilesCache = profiles
      return profiles
    }
  } catch (e) {
    console.warn('[Storage] SQLite Profile load failed, using LocalStorage:', e)
  }
  return getProfiles()
}

export function upsertProfile(name: string): Profile {
  const list = getProfiles()
  const existing = list.find(
    p =>
      p.name.trim().toLowerCase() === name.trim().toLowerCase()
  )
  const ts = now()
  if (existing) {
    const updated = { ...existing, name, updatedAt: ts }
    const next = list.map(p => (p.id === existing.id ? updated : p))
    saveProfiles(next)
    // Async SQLite update
    dbSaveProfile({
      id: updated.id,
      name: updated.name,
      color: updated.color ?? null,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    }).catch(err => trackDBError('profile-update', updated.id, err))
    return updated
  }
  const created: Profile = {
    id: id(),
    name,
    createdAt: ts,
    updatedAt: ts,
  }
  list.push(created)
  saveProfiles(list)
  // Async SQLite insert
  dbSaveProfile({
    id: created.id,
    name: created.name,
    color: created.color ?? null,
    createdAt: created.createdAt,
    updatedAt: created.updatedAt,
  }).catch(err => trackDBError('profile-create', created.id, err))
  return created
}

export async function createProfile(input: {
  name: string
  color?: string
}): Promise<Profile> {
  const list = getProfiles()
  const ts = now()
  const profile: Profile = {
    id: id(),
    name: input.name.trim(),
    color: input.color,
    createdAt: ts,
    updatedAt: ts,
  }
  list.push(profile)
  saveProfiles(list)

  // SQLite speichern
  try {
    await dbSaveProfile({
      id: profile.id,
      name: profile.name,
      color: profile.color ?? null,
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt,
    })
  } catch (e) {
    console.warn('[Storage] SQLite profile save failed:', e)
  }

  return profile
}

export async function renameProfile(
  profileId: string,
  newName: string
): Promise<void> {
  const list = getProfiles()
  const idx = list.findIndex(p => p.id === profileId)
  if (idx === -1) return
  const ts = now()
  list[idx] = {
    ...list[idx],
    name: newName.trim(),
    updatedAt: ts,
  }
  saveProfiles(list)

  // SQLite speichern
  try {
    await dbSaveProfile({
      id: list[idx].id,
      name: list[idx].name,
      color: list[idx].color ?? null,
      createdAt: list[idx].createdAt,
      updatedAt: list[idx].updatedAt,
    })
  } catch (e) {
    console.warn('[Storage] SQLite profile rename failed:', e)
  }
}

export async function updateProfileColor(
  profileId: string,
  color: string | null
): Promise<void> {
  const list = getProfiles()
  const idx = list.findIndex(p => p.id === profileId)
  if (idx === -1) return
  const ts = now()
  list[idx] = {
    ...list[idx],
    color: color ?? undefined,
    updatedAt: ts,
  }
  saveProfiles(list)

  // SQLite speichern
  try {
    await dbSaveProfile({
      id: list[idx].id,
      name: list[idx].name,
      color: list[idx].color ?? null,
      createdAt: list[idx].createdAt,
      updatedAt: list[idx].updatedAt,
    })
  } catch (e) {
    console.warn('[Storage] SQLite profile color update failed:', e)
  }
}

export async function deleteProfile(profileId: string): Promise<void> {
  const next = getProfiles().filter(p => p.id !== profileId)
  saveProfiles(next)

  // SQLite: Kaskaden-Löschung (Stats, Leaderboards, Highscores, Profil)
  try {
    await dbDeleteProfile(profileId)
  } catch (e) {
    console.warn('[Storage] SQLite profile delete failed:', e)
  }

  // Memory-Cache bereinigen
  if (memCache.x01PlayerStats) {
    delete memCache.x01PlayerStats[profileId]
  }
  if (memCache.leaderboards) {
    const lb = memCache.leaderboards
    const filterLB = <T extends { playerId: string }>(arr: T[]) => arr.filter(e => e.playerId !== profileId)
    memCache.leaderboards = {
      ...lb,
      highVisits: filterLB(lb.highVisits),
      highCheckouts: filterLB(lb.highCheckouts),
      bestLegs: filterLB(lb.bestLegs),
      worstLegs: filterLB(lb.worstLegs),
      bestCheckoutPct: filterLB(lb.bestCheckoutPct),
      worstCheckoutPct: filterLB(lb.worstCheckoutPct),
    }
  }
  if (memCache.cricketLeaderboards) {
    const clb = memCache.cricketLeaderboards
    const filterCLB = <T extends { playerId: string }>(arr: T[]) => arr.filter(e => e.playerId !== profileId)
    memCache.cricketLeaderboards = {
      ...clb,
      bullMaster: filterCLB(clb.bullMaster),
      tripleHunter: filterCLB(clb.tripleHunter),
      fastestLegs: filterCLB(clb.fastestLegs),
      bestTurnMarks: filterCLB(clb.bestTurnMarks),
    }
  }
}

/* -------------------------------------------------
   X01 Matches (SQLite + Memory-Cache)
------------------------------------------------- */
export type StoredMatch = {
  id: string
  title: string
  matchName?: string  // Benutzerdefinierter Spielname
  notes?: string      // Bemerkungen nach dem Spiel
  createdAt: string
  finishedAt?: string | null
  events: DartsEvent[]
  playerIds: string[]
  finished?: boolean
}

export type NewGameConfig = {
  players: Profile[]
  setMode: boolean
  legs: number
  legsPerSet?: number
  bestOfSets?: number
  starterId: string
  title?: string
}

// Cache für synchrone Zugriffe
let x01MatchesCache: StoredMatch[] | null = null

export function getMatches(): StoredMatch[] {
  return x01MatchesCache ?? []
}

export function saveMatches(all: StoredMatch[]) {
  x01MatchesCache = all
}

/**
 * Ensures a match exists in the local cache (for multiplayer guests).
 * Creates it if it doesn't exist. Idempotent — safe to call multiple times.
 * Works for any game mode by accepting the getter/setter functions.
 */
export function ensureMultiplayerMatchExists<T extends { id: string; events?: any[] }>(
  matchId: string,
  events: any[],
  createStub: () => T,
  getList: () => T[],
  saveList: (list: T[]) => void,
  dbWrite?: (stub: T) => void,
) {
  const list = getList()
  const idx = list.findIndex(m => m.id === matchId)
  if (idx >= 0) {
    // Update events in cache (they grow during the game)
    list[idx] = { ...list[idx], events }
    saveList(list)
    return
  }
  const stub = createStub()
  list.unshift(stub)
  saveList(list)
  if (dbWrite) dbWrite(stub)
}

/** Ensure X01 match exists for multiplayer guest (cache + SQLite) */
export function ensureX01MatchExists(matchId: string, events: any[], playerIds: string[], title: string) {
  ensureMultiplayerMatchExists(
    matchId,
    events,
    () => ({ id: matchId, createdAt: events[0]?.ts ?? now(), events, playerIds, title, finished: false } as StoredMatch),
    getMatches,
    saveMatches,
    (stub) => {
      dbSaveX01Match({
        id: stub.id, title: (stub as any).title ?? 'Multiplayer', matchName: null, notes: null,
        createdAt: (stub as any).createdAt, finished: false, finishedAt: null,
        events, playerIds,
      }).catch(err => trackDBError('x01-mp-ensure', matchId, err))
    },
  )
}

/** Async version that awaits DB write — use when match needs to be saved reliably (e.g., match end) */
export async function ensureX01MatchExistsAsync(matchId: string, events: any[], playerIds: string[], title: string) {
  const list = getMatches()
  const exists = list.some(m => m.id === matchId)
  if (!exists) {
    const stub: StoredMatch = { id: matchId, createdAt: events[0]?.ts ?? now(), events, playerIds, title, finished: false }
    list.unshift(stub)
    saveMatches(list)
  } else {
    // Update events in memory cache
    const idx = list.findIndex(m => m.id === matchId)
    if (idx >= 0) { list[idx] = { ...list[idx], events }; saveMatches(list) }
  }
  // Await DB write
  await dbSaveX01Match({
    id: matchId, title, matchName: null, notes: null,
    createdAt: events[0]?.ts ?? now(), finished: false, finishedAt: null,
    events, playerIds,
  })
}

/** Ensure Cricket match exists for multiplayer guest */
export function ensureCricketMatchExists(matchId: string, events: any[], playerIds: string[]) {
  ensureMultiplayerMatchExists(
    matchId,
    events,
    () => ({ id: matchId, createdAt: events[0]?.ts ?? now(), events, playerIds, finished: false } as CricketStoredMatch),
    getCricketMatches,
    saveCricketMatches,
    (stub) => {
      dbSaveCricketMatch({
        id: stub.id, title: 'Cricket – Multiplayer', matchName: null, notes: null,
        createdAt: (stub as any).createdAt, finished: false, finishedAt: null,
        events, playerIds,
      }).catch(err => trackDBError('cricket-mp-ensure', matchId, err))
    },
  )
}

export function ensureATBMatchExists(m: string, e: any[], p: string[]) {
  ensureMultiplayerMatchExists(m, e, () => ({ id: m, createdAt: e[0]?.ts ?? now(), events: e, playerIds: p, finished: false } as any), getATBMatches, saveATBMatches,
    (stub) => {
      dbSaveATBMatch({
        id: stub.id, title: 'Around the Board – Multiplayer',
        createdAt: (stub as any).createdAt, finished: false, finishedAt: null,
        durationMs: null, winnerId: null, winnerDarts: null,
        mode: '', direction: '', players: [], events: e,
      }).catch(err => trackDBError('atb-mp-ensure', m, err))
    },
  )
}
export function ensureStrMatchExists(m: string, e: any[], p: string[]) {
  ensureMultiplayerMatchExists(m, e, () => ({ id: m, createdAt: e[0]?.ts ?? now(), events: e, playerIds: p, finished: false } as any), getStrMatches, saveStrMatches,
    (stub) => {
      dbSaveStrMatch({
        id: stub.id, title: 'Sträußchen – Multiplayer',
        createdAt: (stub as any).createdAt, finished: false, finishedAt: null,
        durationMs: null, winnerId: null, winnerDarts: null,
        mode: '', targetNumber: null, numberOrder: null, turnOrder: null,
        ringMode: null, bullMode: null, bullPosition: null,
        players: [], events: e,
      }).catch(err => trackDBError('str-mp-ensure', m, err))
    },
  )
}
export function ensureHighscoreMatchExists(m: string, e: any[], p: string[]) {
  ensureMultiplayerMatchExists(m, e, () => ({ id: m, createdAt: e[0]?.ts ?? now(), events: e, playerIds: p, finished: false } as any), getHighscoreMatches, saveHighscoreMatches,
    (stub) => {
      dbSaveHighscoreMatch({
        id: stub.id, title: 'Highscore – Multiplayer',
        createdAt: (stub as any).createdAt, finished: false, finishedAt: null,
        durationMs: null, winnerId: null, winnerDarts: null,
        targetScore: 0, players: [], events: e,
      }).catch(err => trackDBError('highscore-mp-ensure', m, err))
    },
  )
}
export function ensureCTFMatchExists(m: string, e: any[], p: string[]) {
  ensureMultiplayerMatchExists(m, e, () => ({ id: m, createdAt: e[0]?.ts ?? now(), events: e, playerIds: p, finished: false } as any), getCTFMatches, saveCTFMatches,
    (stub) => {
      dbSaveCTFMatch({
        id: stub.id, title: 'Capture the Field – Multiplayer',
        createdAt: (stub as any).createdAt, finished: false, finishedAt: null,
        durationMs: null, winnerId: null, winnerDarts: null,
        players: [], events: e,
      }).catch(err => trackDBError('ctf-mp-ensure', m, err))
    },
  )
}
export function ensureShanghaiMatchExists(m: string, e: any[], p: string[]) {
  ensureMultiplayerMatchExists(m, e, () => ({ id: m, createdAt: e[0]?.ts ?? now(), events: e, playerIds: p, finished: false } as any), getShanghaiMatches, saveShanghaiMatches,
    (stub) => {
      dbSaveShanghaiMatch({
        id: stub.id, title: 'Shanghai – Multiplayer',
        createdAt: (stub as any).createdAt, finished: false, finishedAt: null,
        durationMs: null, winnerId: null, winnerDarts: null,
        players: [], events: e,
      }).catch(err => trackDBError('shanghai-mp-ensure', m, err))
    },
  )
}
export function ensureKillerMatchExists(m: string, e: any[], p: string[]) {
  ensureMultiplayerMatchExists(m, e, () => ({ id: m, createdAt: e[0]?.ts ?? now(), events: e, playerIds: p, finished: false } as any), getKillerMatches, saveKillerMatches,
    (stub) => {
      dbSaveKillerMatch({
        id: stub.id, title: 'Killer – Multiplayer',
        createdAt: (stub as any).createdAt, finished: false, finishedAt: null,
        durationMs: null, winnerId: null, winnerDarts: null,
        players: [], events: e,
      }).catch(err => trackDBError('killer-mp-ensure', m, err))
    },
  )
}
export function ensureBobs27MatchExists(m: string, e: any[], p: string[]) {
  ensureMultiplayerMatchExists(m, e, () => ({ id: m, createdAt: e[0]?.ts ?? now(), events: e, playerIds: p, finished: false } as any), getBobs27Matches, saveBobs27Matches,
    (stub) => {
      dbSaveBobs27Match({
        id: stub.id, title: "Bob's 27 – Multiplayer",
        createdAt: (stub as any).createdAt, finished: false, finishedAt: null,
        durationMs: null, winnerId: null, winnerDarts: null,
        players: [], events: e,
      }).catch(err => trackDBError('bobs27-mp-ensure', m, err))
    },
  )
}
export function ensureOperationMatchExists(m: string, e: any[], p: string[]) {
  ensureMultiplayerMatchExists(m, e, () => ({ id: m, createdAt: e[0]?.ts ?? now(), events: e, playerIds: p, finished: false } as any), getOperationMatches, saveOperationMatches,
    (stub) => {
      dbSaveOperationMatch({
        id: stub.id, title: 'Operation – Multiplayer',
        createdAt: (stub as any).createdAt, finished: false, finishedAt: null,
        durationMs: null, winnerId: null, winnerDarts: null,
        legsCount: 1, targetMode: 'random',
        players: [], events: e, config: {},
      }).catch(err => trackDBError('operation-mp-ensure', m, err))
    },
  )
}

// SQLite-aware Matches laden
export async function getMatchesAsync(): Promise<StoredMatch[]> {
  try {
    const useSQLite = await ensureDB()
    if (useSQLite) {
      const dbMatches = await dbGetX01Matches()
      const matches: StoredMatch[] = dbMatches.map((m) => ({
        id: m.id,
        title: m.title,
        matchName: m.matchName ?? undefined,
        notes: m.notes ?? undefined,
        createdAt: m.createdAt,
        events: m.events as DartsEvent[],
        playerIds: m.playerIds,
        finished: m.finished,
      }))
      x01MatchesCache = matches
      return matches
    }
  } catch (e) {
    console.warn('[Storage] SQLite X01 load failed:', e)
  }
  return getMatches()
}

export function setLastOpenMatchId(matchId?: string) {
  if (!matchId) {
    localStorage.removeItem(LS_KEYS.lastOpenMatchId)
    return
  }
  localStorage.setItem(LS_KEYS.lastOpenMatchId, matchId)
}

export function getLastOpenMatchId(): string | undefined {
  return (
    localStorage.getItem(LS_KEYS.lastOpenMatchId) || undefined
  )
}

export function loadMatchById(
  matchId: string
): StoredMatch | undefined {
  return getMatches().find(m => m.id === matchId)
}

export function getOpenMatch(): StoredMatch | undefined {
  const openId = getLastOpenMatchId()
  const m = openId ? loadMatchById(openId) : undefined
  if (m && !m.finished) return m
  // Fallback: check lightweight summaries from startup
  const summary = getOpenMatchSummary('x01')
  if (summary) return { id: summary.id, title: summary.title, finished: false, events: [], createdAt: '' } as any
  return undefined
}

export function persistEvents(
  matchId: string,
  events: DartsEvent[]
): Promise<void> {
  const list = getMatches()
  const idx = list.findIndex(m => m.id === matchId)
  if (idx === -1) return Promise.resolve()
  list[idx] = { ...list[idx], events }
  saveMatches(list)

  // Queued + awaitable DB write — prevents race conditions
  return new Promise<void>((resolve) => {
    queueWrite(`x01-${matchId}`, async () => {
      try { await dbUpdateX01Events(matchId, events) }
      catch (err) { trackDBError('x01-events', matchId, err) }
      resolve()
    })
  })
}

export function finishMatch(matchId: string): Promise<void> {
  const list = getMatches()
  const idx = list.findIndex(m => m.id === matchId)
  if (idx === -1) return Promise.resolve()

  list[idx] = { ...list[idx], finished: true }
  saveMatches(list)
  dbDeleteActiveGame(matchId).catch(() => {})

  const last = getLastOpenMatchId()
  if (last === matchId) setLastOpenMatchId(undefined)

  const matchPlayerIds = list[idx].playerIds ?? []
  if (matchPlayerIds.length > 0) queueStatsRefresh(matchPlayerIds, 'x01', loadGroup)
  // Invalidate TanStack Query stats cache
  for (const pid of matchPlayerIds) {
    queryClient.invalidateQueries({ queryKey: ['stats', pid] })
  }

  // Direct DB write — no queue wait (persistEvents may still be writing events,
  // but UPDATE finished=1 doesn't conflict with concurrent event INSERTs)
  return dbFinishX01Match(matchId).catch((err) => {
    trackDBError('x01-finish', matchId, err)
  })
}

/** Setzt Spielname und Bemerkungen für ein Match (nur einmal möglich). */
export function setMatchMetadata(
  matchId: string,
  matchName: string,
  notes: string
): boolean {
  const list = getMatches()
  const idx = list.findIndex(m => m.id === matchId)
  if (idx === -1) return false

  // Nur setzen wenn noch nicht vorhanden
  if (list[idx].matchName !== undefined || list[idx].notes !== undefined) {
    return false
  }

  list[idx] = {
    ...list[idx],
    matchName: matchName.trim() || undefined,
    notes: notes.trim() || undefined,
  }
  saveMatches(list)
  return true
}

export function getFinishedMatches(): StoredMatch[] {
  return getMatches().filter(m => m.finished)
}

/** Alle X01-Matches OHNE 121-Spiele */
export function getNon121Matches(): StoredMatch[] {
  return getMatches().filter(m => {
    const startEvt = m.events.find(isMatchStarted)
    return startEvt?.startingScorePerLeg !== 121
  })
}

/** Alle abgeschlossenen X01-Matches OHNE 121-Spiele */
export function getFinishedNon121Matches(): StoredMatch[] {
  return getNon121Matches().filter(m => m.finished)
}

/** Nur falls du mal ein leeres Shell-Match brauchst. */
export async function createMatchShell(args: { // Cache wird beim finishMatch invalidiert
  id?: string
  title: string
  playerIds: string[]
}): Promise<StoredMatch> {
  const matchId = args.id ?? id()
  const stored: StoredMatch = {
    id: matchId,
    createdAt: now(),
    events: [],
    playerIds: args.playerIds,
    title: args.title,
    finished: false,
  }
  const list = getMatches()
  const idx = list.findIndex(m => m.id === matchId)
  if (idx >= 0) list[idx] = stored
  else list.unshift(stored)
  saveMatches(list)
  setLastOpenMatchId(matchId)

  // Await DB write to ensure match is saved before gameplay starts
  try {
    await dbSaveX01Match({
      id: stored.id,
      title: stored.title,
      matchName: stored.matchName ?? null,
      notes: stored.notes ?? null,
      createdAt: stored.createdAt,
      finished: stored.finished ?? false,
      finishedAt: null,
      events: stored.events,
      playerIds: stored.playerIds,
    })
  } catch (err) {
    trackDBError('x01-create', stored.id, err)
  }

  registerActiveGame({
    id: matchId,
    playerId: args.playerIds[0] ?? '',
    gameType: 'x01',
    title: args.title,
    config: null,
    players: null,
    startedAt: new Date().toISOString(),
  })

  return stored
}

/**
 * Vollständiger X01-Match-Start
 */
export async function createNewMatch(cfg: NewGameConfig): Promise<StoredMatch> {
  const matchId = id()
  const legId = id()

  const structure = cfg.setMode
    ? {
        kind: 'sets' as const,
        legsPerSet: Math.max(1, cfg.legsPerSet || 5),
        bestOfSets: Math.max(1, cfg.bestOfSets || 3),
      }
    : {
        kind: 'legs' as const,
        bestOfLegs: Math.max(1, cfg.legs),
      }

  const start: MatchStarted = {
    eventId: id(),
    type: 'MatchStarted',
    ts: now(),
    matchId,
    mode: '501-double-out',
    structure,
    startingScorePerLeg: 501,
    players: cfg.players.map(p => ({
      playerId: p.id,
      name: p.name,
    })),
    bullThrow: { winnerPlayerId: cfg.starterId },
    version: 1,
    inRule: 'straight-in',
    outRule: 'double-out',
  }

  const events: DartsEvent[] = [start]

  if (structure.kind === 'sets') {
    const set1: SetStarted = {
      eventId: id(),
      type: 'SetStarted',
      ts: now(),
      matchId,
      setIndex: 1,
    }
    events.push(set1)
  }

  const legStart = {
    eventId: id(),
    type: 'LegStarted' as const,
    ts: now(),
    matchId,
    legId,
    legIndex: 1,
    starterPlayerId: cfg.starterId,
  }
  events.push(legStart)

  const stored: StoredMatch = {
    id: matchId,
    createdAt: now(),
    events,
    playerIds: cfg.players.map(p => p.id),
    title:
      cfg.title ??
      `501 – ${cfg.players
        .map(p => p.name)
        .join(' vs ')}`,
    finished: false,
  }

  const list = getMatches()
  list.unshift(stored)
  saveMatches(list)
  setLastOpenMatchId(matchId)

  // Await DB write to prevent data loss
  try {
    await dbSaveX01Match({
      id: stored.id,
      title: stored.title,
      matchName: stored.matchName ?? null,
      notes: stored.notes ?? null,
      createdAt: stored.createdAt,
      finished: stored.finished ?? false,
      finishedAt: null,
      events: stored.events,
      playerIds: stored.playerIds,
    })
  } catch (err) {
    trackDBError('x01-create', stored.id, err)
  }

  registerActiveGame({
    id: matchId,
    playerId: cfg.players[0]?.id ?? '',
    gameType: 'x01',
    title: stored.title,
    config: { startingScore: 501 },
    players: cfg.players.map(p => ({ id: p.id, name: p.name, color: p.color })),
    startedAt: new Date().toISOString(),
  })

  return stored
}

/* -------------------------------------------------
   Upload Outbox (kannst du easy komplett droppen, wenn du wirklich GAR KEIN MVP willst)
------------------------------------------------- */
export type BackendMatchDTO = {
  matchId: string
  title: string
  players: { id: string; name: string }[]
  startedAt?: string
  finishedAt?: string
  events: DartsEvent[]
}

type OutboxItem = {
  id: string
  createdAt: string
  payload: BackendMatchDTO
  status: 'queued' | 'sent' | 'error'
  errorMessage?: string
}

let outboxCache: OutboxItem[] = []

function getOutbox(): OutboxItem[] {
  return outboxCache
}
function saveOutbox(list: OutboxItem[]) {
  outboxCache = list
}
function addOutboxItem(payload: BackendMatchDTO) {
  const list = getOutbox()
  list.unshift({
    id: id(),
    createdAt: now(),
    payload,
    status: 'queued',
  })
  saveOutbox(list)
}
export async function tryUploadOutbox(): Promise<void> {
  return
}
export function finishMatchUpload(
  m: StoredMatch,
  players: { id: string; name: string }[]
) {
  const startEvt = m.events.find(isMatchStarted)
  const finishedEvt = m.events.find(isMatchFinished)
  const dto: BackendMatchDTO = {
    matchId: m.id,
    title: m.title,
    players,
    startedAt: startEvt?.ts,
    finishedAt: finishedEvt?.ts ?? now(),
    events: m.events,
  }
  addOutboxItem(dto)
}

/* -------------------------------------------------
   Aggregation X01 pro Spieler (matchweise)
------------------------------------------------- */
export type AggregatedPlayerStats = {
  playerId: string
  name?: string
  matches: number
  wins: number
  losses: number
  dartsThrown: number
  pointsScored: number
  threeDartAvg: number
  first9OverallAvg?: number
}

export function aggregatePlayerStats(
  matches: StoredMatch[]
): Record<string, AggregatedPlayerStats> {
  const result: Record<string, AggregatedPlayerStats> = {}
  const first9Counts = new Map<string, number>()

  for (const m of matches) {
    const start = m.events.find(isMatchStarted)
    const finishEvt = m.events.find(isMatchFinished)
    const winnerId = finishEvt?.winnerPlayerId

    const byPlayer = computeStats(m.events)

    const idToName: Record<string, string | undefined> = {}
    if (start) {
      for (const pid of m.playerIds) {
        const pname = start.players?.find(p => p.playerId === pid)?.name
        idToName[pid] = pname
      }
    }

    // Gäste rausfiltern
    const realPlayerIds = m.playerIds.filter(
      pid => !isGuestPlayerInStart(start, pid)
    )

    for (const pid of realPlayerIds) {
      const ps = byPlayer[pid]
      if (!result[pid]) {
        result[pid] = {
          playerId: pid,
          name: idToName[pid],
          matches: 0,
          wins: 0,
          losses: 0,
          dartsThrown: 0,
          pointsScored: 0,
          threeDartAvg: 0,
          first9OverallAvg: undefined,
        }
      }
      const agg = result[pid]

      if (winnerId) {
        agg.matches += 1
        if (winnerId === pid) agg.wins += 1
        else agg.losses += 1
      }

      if (ps) {
        agg.pointsScored += ps.pointsScored
        agg.dartsThrown += ps.dartsThrown

        if (typeof ps.first9OverallAvg === 'number') {
          if (typeof agg.first9OverallAvg !== 'number') {
            agg.first9OverallAvg = 0
          }
          const count = (first9Counts.get(pid) ?? 0) + 1
          first9Counts.set(pid, count)
          agg.first9OverallAvg =
            ((agg.first9OverallAvg ?? 0) * (count - 1) + ps.first9OverallAvg) / count
        }
      }
    }
  }

  for (const pid of Object.keys(result)) {
    const agg = result[pid]
    agg.threeDartAvg = agg.dartsThrown > 0
      ? (agg.pointsScored / agg.dartsThrown) * 3
      : 0
  }
  return result
}

/* -------------------------------------------------
   Persistierte X01-Langzeitwerte pro Spieler
------------------------------------------------- */

export type X01PlayerLongTermStats = {
  playerId: string
  playerName?: string

  matchesPlayed: number
  matchesWon: number

  legsWon: number
  setsWon: number

  dartsThrownTotal: number
  pointsScoredTotal: number
  threeDartAvgOverall: number
  first9OverallAvg?: number

  highestCheckout: number

  doubleAttemptsDart: number
  doublesHitDart: number
  doublePctDart: number

  finishingDoubles: Record<string, number>

  tons100Plus: number
  tons140Plus: number
  tons180: number

  doublesHitCount: Record<string, number>
  triplesHitCount: Record<string, number>
  segmentsHitCount: Record<string, number>

  updatedAt: string
}

function loadX01PlayerStatsStore(): Record<string, X01PlayerLongTermStats> {
  return memCache.x01PlayerStats ?? {}
}

function saveX01PlayerStatsStore(store: Record<string, X01PlayerLongTermStats>) {
  memCache.x01PlayerStats = store
}

export function getGlobalX01PlayerStats(): Record<string, X01PlayerLongTermStats> {
  return loadX01PlayerStatsStore()
}

/** Async SQLite-first version */
export async function getGlobalX01PlayerStatsAsync(): Promise<Record<string, X01PlayerLongTermStats>> {
  try {
    const useSQLite = await ensureDB()
    if (useSQLite) {
      const migrated = await dbGetMeta('x01_stats_ls_migrated')
      if (migrated === 'true') {
        return await dbLoadAllX01PlayerStats()
      }
    }
  } catch (e) {
    console.warn('[Storage] SQLite X01 PlayerStats load failed:', e)
  }
  return loadX01PlayerStatsStore()
}

// Hilfsmerge: addiere Keys eines number-Record in ein Ziel
function mergeCountMap(
  base: Record<string, number>,
  add: Record<string, number> | undefined
) {
  if (!add) return
  for (const k of Object.keys(add)) {
    base[k] = (base[k] ?? 0) + (add[k] ?? 0)
  }
}

function mergePlayerMatchIntoCareer(
  prev: X01PlayerLongTermStats | undefined,
  nowData: X01PerMatchPlayerStats,
  powerBins: { _100plus: number; _140plus: number; _180: number },
): X01PlayerLongTermStats {
  const ts = now()

  const fresh: X01PlayerLongTermStats = prev ?? {
    playerId: nowData.playerId,
    playerName: nowData.playerName,

    matchesPlayed: 0,
    matchesWon: 0,

    legsWon: 0,
    setsWon: 0,

    dartsThrownTotal: 0,
    pointsScoredTotal: 0,
    threeDartAvgOverall: 0,
    first9OverallAvg: undefined,

    highestCheckout: 0,

    doubleAttemptsDart: 0,
    doublesHitDart: 0,
    doublePctDart: 0,

    finishingDoubles: {},

    tons100Plus: 0,
    tons140Plus: 0,
    tons180: 0,

    doublesHitCount: {},
    triplesHitCount: {},
    segmentsHitCount: {},

    updatedAt: ts,
  }

  const matchesPlayed = fresh.matchesPlayed + 1
  const matchesWon = fresh.matchesWon + (nowData.wonMatch ? 1 : 0)

  const legsWon = fresh.legsWon + (nowData.legsWon ?? 0)
  const setsWon = fresh.setsWon + (nowData.setsWon ?? 0)

  const dartsThrownTotal = fresh.dartsThrownTotal + nowData.dartsThrown
  const pointsScoredTotal = fresh.pointsScoredTotal + nowData.pointsScored

  const threeDartAvgOverall =
    dartsThrownTotal > 0
      ? (pointsScoredTotal / dartsThrownTotal) * 3
      : 0

  let first9OverallAvg: number | undefined = fresh.first9OverallAvg
  if (typeof nowData.first9OverallAvg === 'number') {
    if (typeof first9OverallAvg !== 'number') {
      first9OverallAvg = nowData.first9OverallAvg
    } else {
      first9OverallAvg =
        ((first9OverallAvg * fresh.matchesPlayed) +
          nowData.first9OverallAvg) /
        matchesPlayed
    }
  }

  const highestCheckout = Math.max(
    fresh.highestCheckout ?? 0,
    nowData.highestCheckout ?? 0
  )

  const doubleAttemptsDart =
    fresh.doubleAttemptsDart + (nowData.doubleAttemptsDart ?? 0)
  const doublesHitDart =
    fresh.doublesHitDart + (nowData.doublesHitDart ?? 0)
  const doublePctDart =
    doubleAttemptsDart > 0
      ? (doublesHitDart / doubleAttemptsDart) * 100
      : 0

  const tons100Plus =
    (fresh.tons100Plus ?? 0) + (powerBins._100plus ?? 0)
  const tons140Plus =
    (fresh.tons140Plus ?? 0) + (powerBins._140plus ?? 0)
  const tons180 =
    (fresh.tons180 ?? 0) + (powerBins._180 ?? 0)

  const finishingDoubles = { ...fresh.finishingDoubles }
  mergeCountMap(finishingDoubles, nowData.finishingDoubles)

  const doublesHitCount = { ...fresh.doublesHitCount }
  const triplesHitCount = { ...fresh.triplesHitCount }
  const segmentsHitCount = { ...fresh.segmentsHitCount }
  mergeCountMap(doublesHitCount, nowData.doublesHitCount)
  mergeCountMap(triplesHitCount, nowData.triplesHitCount)
  mergeCountMap(segmentsHitCount, nowData.segmentsHitCount)

  return {
    playerId: nowData.playerId,
    playerName: nowData.playerName ?? fresh.playerName,

    matchesPlayed,
    matchesWon,

    legsWon,
    setsWon,

    dartsThrownTotal,
    pointsScoredTotal,
    threeDartAvgOverall,
    first9OverallAvg,

    highestCheckout,

    doubleAttemptsDart,
    doublesHitDart,
    doublePctDart,

    finishingDoubles,

    tons100Plus,
    tons140Plus,
    tons180,

    doublesHitCount,
    triplesHitCount,
    segmentsHitCount,

    updatedAt: ts,
  }
}

/**
 * Öffentliche Funktion:
 * Diese Funktion soll am Match-Ende aufgerufen werden.
 * Sie merged Match-Stats pro Spieler → Karriere-Store.
 */
export function updateGlobalX01PlayerStatsFromMatch(matchId: string, events: DartsEvent[]) {
  try {
    const startEvt = events.find(e => e.type === 'MatchStarted') as MatchStarted | undefined
    const finishEvt = events.find(e => e.type === 'MatchFinished') as MatchFinished | undefined

    if (!startEvt) return
    if (!finishEvt) {
      // kein Sieger => kein abgeschlossenes Match => skip
      return
    }

    const bundle: X01PerMatchStatsBundle = computeX01PlayerMatchStats(matchId, events)
    const perPlayerBasic = computeStats(events)

    const store = loadX01PlayerStatsStore()

    for (const pStats of bundle.players) {
      const bins = perPlayerBasic[pStats.playerId]?.bins ?? {
        _100plus: 0,
        _140plus: 0,
        _180: 0,
      }

      const prev = store[pStats.playerId]
      const merged = mergePlayerMatchIntoCareer(prev, pStats, bins)
      store[pStats.playerId] = merged
    }

    saveX01PlayerStatsStore(store)

    // Dual-Write: SQLite (fire-and-forget)
    for (const pStats of bundle.players) {
      const s = store[pStats.playerId]
      if (s) {
        dbSaveX01PlayerStats(s).catch(e => trackDBError('x01_player_stats', pStats.playerId, e))
      }
    }
  } catch (err) {
    console.error('updateGlobalX01PlayerStatsFromMatch failed:', err)
  }
}

export function getFavouriteDoubleForPlayer(pid: string): { bed: string; count: number } | null {
  const store = loadX01PlayerStatsStore()
  const s = store[pid]
  if (!s) return null
  let bestBed = ''
  let bestCount = 0
  for (const k of Object.keys(s.finishingDoubles || {})) {
    const c = s.finishingDoubles[k] ?? 0
    if (c > bestCount) {
      bestCount = c
      bestBed = k
    }
  }
  if (!bestBed) return null
  return { bed: bestBed, count: bestCount }
}

/* -------------------------------------------------
   🎯 121-spezifische Langzeit-Spieler-Stats
------------------------------------------------- */

// In-Memory Cache für 121 Stats (wird beim App-Start aus SQLite befüllt)
let stats121Cache: Record<string, Stats121LongTerm> = {}

export function load121PlayerStatsStore(): Record<string, Stats121LongTerm> {
  return stats121Cache
}

export function save121PlayerStatsStore(store: Record<string, Stats121LongTerm>): void {
  stats121Cache = store
}

export function warmStats121Cache(data: Record<string, Stats121LongTerm>) {
  stats121Cache = data
}

export function get121PlayerStats(playerId: string): Stats121LongTerm | null {
  const store = load121PlayerStatsStore()
  return store[playerId] ?? null
}

/** Async SQLite-first version */
export async function get121PlayerStatsAsync(playerId: string): Promise<Stats121LongTerm | null> {
  try {
    const useSQLite = await ensureDB()
    if (useSQLite) {
      const migrated = await dbGetMeta('stats_121_ls_migrated')
      if (migrated === 'true') {
        const all = await dbLoadAll121PlayerStats()
        return all[playerId] ?? null
      }
    }
  } catch (e) {
    console.warn('[Storage] SQLite 121 PlayerStats load failed:', e)
  }
  return get121PlayerStats(playerId)
}

/** Async SQLite-first: load all 121 stats */
export async function load121PlayerStatsStoreAsync(): Promise<Record<string, Stats121LongTerm>> {
  try {
    const useSQLite = await ensureDB()
    if (useSQLite) {
      const migrated = await dbGetMeta('stats_121_ls_migrated')
      if (migrated === 'true') {
        return await dbLoadAll121PlayerStats()
      }
    }
  } catch (e) {
    console.warn('[Storage] SQLite 121 PlayerStats load failed:', e)
  }
  return load121PlayerStatsStore()
}

/**
 * Liefert alle X01-Matches, die 121-Spiele sind (startingScorePerLeg === 121).
 */
export function get121Matches(): StoredMatch[] {
  const allMatches = getMatches()
  return allMatches.filter(m => {
    const startEvt = m.events.find(e => e.type === 'MatchStarted') as MatchStarted | undefined
    return startEvt?.startingScorePerLeg === 121
  })
}

/**
 * Liefert nur abgeschlossene 121-Matches.
 */
export function getFinished121Matches(): StoredMatch[] {
  return get121Matches().filter(m => m.finished)
}

/**
 * Berechnet alle 121-Stats für alle Spieler neu.
 * Nützlich für Migration von alten Daten.
 */
export function recalculate121StatsForAllPlayers() {
  const matches = getFinished121Matches()
  // Store leeren
  save121PlayerStatsStore({})

  // Alle 121-Matches neu berechnen
  for (const m of matches) {
    updateGlobal121PlayerStatsFromMatch(m.id, m.events)
  }

  console.debug(`Recalculated 121 stats from ${matches.length} matches`)
}

/**
 * Aktualisiert die globalen 121-Langzeit-Stats für alle Spieler eines Matches.
 * Soll am Ende eines 121-Matches aufgerufen werden.
 */
export function updateGlobal121PlayerStatsFromMatch(matchId: string, events: DartsEvent[]) {
  try {
    const startEvt = events.find(e => e.type === 'MatchStarted') as MatchStarted | undefined
    const finishEvt = events.find(e => e.type === 'MatchFinished') as MatchFinished | undefined

    if (!startEvt) return
    if (!finishEvt) return // Nur bei abgeschlossenen Matches

    // Nur für 121-Spiele
    if (startEvt.startingScorePerLeg !== 121) return

    const store = load121PlayerStatsStore()
    const legFinishedEvents = events.filter(e => e.type === 'LegFinished') as LegFinished[]

    for (const player of startEvt.players) {
      // Leg-Stats für diesen Spieler sammeln
      const legStats = legFinishedEvents
        .map(lf => compute121LegStats(events, lf.legId, player.playerId))
        .filter((s): s is NonNullable<typeof s> => s !== null)

      // Mit bestehenden Stats mergen
      const existingStats = store[player.playerId]
      const updatedStats = aggregate121LongTermStats(
        legStats,
        player.playerId,
        player.name,
        existingStats
      )

      store[player.playerId] = updatedStats
    }

    save121PlayerStatsStore(store)

    // Dual-Write: SQLite (fire-and-forget)
    for (const player of startEvt.players) {
      const s = store[player.playerId]
      if (s) {
        dbSave121PlayerStats(player.playerId, s).catch(e => trackDBError('stats_121', player.playerId, e))
      }
    }
  } catch (err) {
    console.error('updateGlobal121PlayerStatsFromMatch failed:', err)
  }
}

/* -------------------------------------------------
   Leaderboards X01
------------------------------------------------- */
export type LBVisit = {
  playerId: string
  playerName: string
  matchId: string
  visitId: string
  value: number
  ts: string
}

export type LBCheckout = {
  playerId: string
  playerName: string
  matchId: string
  visitId: string
  value: number
  ts: string
}

export type LBLeg = {
  playerId: string
  playerName: string
  matchId: string
  legId: string
  darts: number
  ts: string
}

export type LBPct = {
  playerId: string
  playerName: string
  value: number
  attempts: number
  made: number
}

export type Leaderboards = {
  highVisits: LBVisit[]
  highCheckouts: LBCheckout[]
  bestLegs: LBLeg[]
  worstLegs: LBLeg[]
  bestCheckoutPct: LBPct[]
  worstCheckoutPct: LBPct[]
  processedMatchIds: string[]
  version: 1
}

export function loadLeaderboards(): Leaderboards {
  return memCache.leaderboards ?? {
    highVisits: [],
    highCheckouts: [],
    bestLegs: [],
    worstLegs: [],
    bestCheckoutPct: [],
    worstCheckoutPct: [],
    processedMatchIds: [],
    version: 1,
  }
}

export function saveLeaderboards(lb: Leaderboards) {
  memCache.leaderboards = lb
}

function playerNameById(match: MatchStarted, pid: string) {
  return (
    match.players.find(p => p.playerId === pid)?.name ??
    pid
  )
}

function dartsToFinishForWinner(
  legId: string,
  winnerId: string,
  events: DartsEvent[]
): { darts: number; ts: string } | null {
  const visits = events.filter(
    e =>
      e.type === 'VisitAdded' &&
      (e as VisitAdded).legId === legId
  ) as VisitAdded[]

  const fin = events.find(
    e =>
      e.type === 'LegFinished' &&
      (e as LegFinished).legId === legId
  ) as LegFinished | undefined

  if (!fin) return null

  let total = 0
  for (const v of visits) {
    if (v.playerId !== winnerId) continue
    if (v.eventId === fin.finishingVisitId) {
      const seq = fin.finishingDartSeq
      total += Math.min(seq, v.darts.length)
      break
    } else {
      total += v.darts.length
    }
  }
  return { darts: total, ts: fin.ts }
}

export function updateLeaderboardsWithMatch(finished: {
  id: string
  events: DartsEvent[]
  finishedAt?: string
}) {
  const lb = loadLeaderboards()

  if (lb.processedMatchIds.includes(finished.id)) {
    return
  }

  const events = finished.events
  const match = events.find(
    e => e.type === 'MatchStarted'
  ) as MatchStarted | undefined
  if (!match) return

  // High Visits
  const visits = events.filter(
    e => e.type === 'VisitAdded'
  ) as VisitAdded[]
  for (const v of visits) {
    if (isGuestPlayerInStart(match, v.playerId)) continue
    lb.highVisits.push({
      playerId: v.playerId,
      playerName: playerNameById(match, v.playerId),
      matchId: finished.id,
      visitId: v.eventId,
      value: v.visitScore,
      ts: v.ts,
    })
  }

  // High Checkouts
  const legsFinished = events.filter(
    e => e.type === 'LegFinished'
  ) as LegFinished[]
  const finishingVisitIds = new Set(
    legsFinished.map(l => l.finishingVisitId)
  )
  for (const v of visits) {
    if (!finishingVisitIds.has(v.eventId)) continue
    if (isGuestPlayerInStart(match, v.playerId)) continue
    lb.highCheckouts.push({
      playerId: v.playerId,
      playerName: playerNameById(match, v.playerId),
      matchId: finished.id,
      visitId: v.eventId,
      value: v.visitScore,
      ts: v.ts,
    })
  }

  // Bestes / schlechtestes Leg
  for (const lf of legsFinished) {
    if (isGuestPlayerInStart(match, lf.winnerPlayerId))
      continue
    const dtf = dartsToFinishForWinner(
      lf.legId,
      lf.winnerPlayerId,
      events
    )
    if (!dtf) continue
    const entry: LBLeg = {
      playerId: lf.winnerPlayerId,
      playerName: playerNameById(match, lf.winnerPlayerId),
      matchId: finished.id,
      legId: lf.legId,
      darts: dtf.darts,
      ts: dtf.ts,
    }
    lb.bestLegs.push(entry)
    lb.worstLegs.push(entry)
  }

  // Checkout %-Leaderboards (DART-basierte Quote!)
  const stats = computeStats(events)
  const pctList: LBPct[] = Object.values(stats)
    .filter(s => !isGuestPlayerInStart(match, s.playerId))
    .map(s => ({
      playerId: s.playerId,
      playerName: playerNameById(match, s.playerId),
      value: s.doublePctDart ?? 0,
      attempts: s.doubleAttemptsDart ?? 0,
      made: s.doublesHitDart ?? 0,
    }))

  lb.bestCheckoutPct.push(
    ...pctList.filter(p => p.attempts > 0)
  )
  lb.worstCheckoutPct.push(
    ...pctList.filter(p => p.attempts > 0)
  )

  // Sortieren
  const byTsDesc = <T extends { ts: string }>(
    a: T,
    b: T
  ) => (a.ts < b.ts ? 1 : -1)

  lb.highVisits.sort(
    (a, b) => b.value - a.value || byTsDesc(a, b)
  )
  lb.highCheckouts.sort(
    (a, b) => b.value - a.value || byTsDesc(a, b)
  )
  lb.bestLegs.sort(
    (a, b) => a.darts - b.darts || byTsDesc(a, b)
  )
  lb.worstLegs.sort(
    (a, b) => b.darts - a.darts || byTsDesc(a, b)
  )
  lb.bestCheckoutPct.sort(
    (a, b) => b.value - a.value
  )
  lb.worstCheckoutPct.sort(
    (a, b) => a.value - b.value
  )

  // Deckeln
  lb.highVisits = lb.highVisits.slice(0, 50)
  lb.highCheckouts = lb.highCheckouts.slice(0, 50)
  lb.bestLegs = lb.bestLegs.slice(0, 50)
  lb.worstLegs = lb.worstLegs.slice(0, 50)
  lb.bestCheckoutPct =
    lb.bestCheckoutPct.slice(0, 50)
  lb.worstCheckoutPct =
    lb.worstCheckoutPct.slice(0, 50)

  lb.processedMatchIds.push(finished.id)

  saveLeaderboards(lb)

  // Dual-Write: SQLite (fire-and-forget)
  dbSaveX01Leaderboards(lb).catch(e => trackDBError('x01_leaderboards', finished.id, e))
}

/** komplette X01-Leaderboards neu aufbauen */
export function rebuildLeaderboards() {
  const empty: Leaderboards = {
    highVisits: [],
    highCheckouts: [],
    bestLegs: [],
    worstLegs: [],
    bestCheckoutPct: [],
    worstCheckoutPct: [],
    processedMatchIds: [],
    version: 1,
  }
  saveLeaderboards(empty)

  const all = getFinishedMatches()
  for (const m of all) {
    updateLeaderboardsWithMatch({
      id: m.id,
      events: m.events,
      finishedAt: m.finishedAt ?? undefined,
    })
  }
}

/* -------------------------------------------------
   Cricket-Persistenz (SQLite + LocalStorage Cache)
------------------------------------------------- */
export type CricketStoredMatch = {
  id: string
  title: string
  matchName?: string  // Benutzerdefinierter Spielname
  notes?: string      // Bemerkungen nach dem Spiel
  createdAt: string
  events: CricketEvent[]
  playerIds: string[] // nur echte Profile (keine Gäste)
  finished?: boolean
  // alte Kompatibilität:
  seriesTargetWins?: number
}

// Cache für synchrone Zugriffe
let cricketMatchesCache: CricketStoredMatch[] | null = null

export function getCricketMatches(): CricketStoredMatch[] {
  return cricketMatchesCache ?? []
}

export function saveCricketMatches(
  all: CricketStoredMatch[]
) {
  cricketMatchesCache = all
}

// SQLite-aware Cricket Matches laden
export async function getCricketMatchesAsync(): Promise<CricketStoredMatch[]> {
  try {
    const useSQLite = await ensureDB()
    if (useSQLite) {
      const dbMatches = await dbGetCricketMatches()
      const matches: CricketStoredMatch[] = dbMatches.map((m) => ({
        id: m.id,
        title: m.title,
        matchName: m.matchName ?? undefined,
        notes: m.notes ?? undefined,
        createdAt: m.createdAt,
        events: m.events as CricketEvent[],
        playerIds: m.playerIds,
        finished: m.finished,
      }))
      cricketMatchesCache = matches
      return matches
    }
  } catch (e) {
    console.warn('[Storage] SQLite Cricket load failed:', e)
  }
  return getCricketMatches()
}

export function getCricketMatch(
  idStr: string
): CricketStoredMatch | undefined {
  return getCricketMatches().find(m => m.id === idStr)
}

export function getOpenCricketMatch():
  | CricketStoredMatch
  | undefined {
  const idStr =
    localStorage.getItem(LS_CRICKET.lastOpenMatchId) ||
    undefined
  const m = idStr
    ? getCricketMatches().find(x => x.id === idStr)
    : undefined
  if (m && !m.finished) return m
  const summary = getOpenMatchSummary('cricket')
  if (summary) return { id: summary.id, title: summary.title, finished: false, events: [], createdAt: '' } as any
  return undefined
}

export function setLastOpenCricketMatchId(idStr?: string) {
  if (!idStr)
    localStorage.removeItem(LS_CRICKET.lastOpenMatchId)
  else
    localStorage.setItem(
      LS_CRICKET.lastOpenMatchId,
      idStr
    )
}

/**
 * Cricket-Äquivalent zu createNewMatch().
 * bestOfGames: z. B. 3 → First to 2; 5 → First to 3
 */
export function createCricketMatchShell(args: {
  id?: string
  title: string
  players: { id: string; name: string; isGuest?: boolean }[]
  range: CricketRange
  style: CricketStyle
  bestOfGames: number
  cutthroatEndgame?: CutthroatEndgame
  crazyMode?: CrazyMode
  crazyWithPoints?: boolean
  crazySameForAll?: boolean
  crazyScoringMode?: 'standard' | 'cutthroat' | 'simple'
}): CricketStoredMatch {
  const matchId = args.id ?? cricketId()
  const targetWins = Math.floor(args.bestOfGames / 2) + 1

  // Zufälliger Salt für Crazy-Modus (sorgt für unterschiedliche Zahlenfolgen pro Match)
  const crazySalt = args.style === 'crazy'
    ? Math.floor(Math.random() * 1000000)
    : undefined

  const startEvt: CricketMatchStarted = {
    eventId: cricketId(),
    type: 'CricketMatchStarted',
    ts: cricketNow(),
    matchId,
    range: args.range,
    style: args.style,
    players: args.players.map(p => ({
      playerId: p.id,
      name: p.name,
      isGuest: p.isGuest,
    })),
    version: 1,
    bestOfGames: args.bestOfGames,
    targetWins,
    cutthroatEndgame: args.cutthroatEndgame,
    crazyMode: args.crazyMode,
    crazyWithPoints: args.crazyWithPoints,
    crazySameForAll: args.crazySameForAll,
    crazyScoringMode: args.crazyScoringMode,
    crazySalt,
  }

  const stored: CricketStoredMatch = {
    id: matchId,
    createdAt: cricketNow(),
    events: [startEvt],
    playerIds: args.players
      .filter(p => !p.isGuest)
      .map(p => p.id),
    title: args.title,
    finished: false,
  }

  const list = getCricketMatches()
  list.unshift(stored)
  saveCricketMatches(list)
  setLastOpenCricketMatchId(matchId)

  // Async SQLite save
  dbSaveCricketMatch({
    id: stored.id,
    title: stored.title,
    matchName: stored.matchName ?? null,
    notes: stored.notes ?? null,
    createdAt: stored.createdAt,
    finished: stored.finished ?? false,
    finishedAt: null,
    events: stored.events,
    playerIds: stored.playerIds,
  }).catch(err => trackDBError('cricket-create', stored.id, err))

  registerActiveGame({
    id: matchId,
    playerId: args.players.find(p => !p.isGuest)?.id ?? args.players[0]?.id ?? '',
    gameType: 'cricket',
    title: stored.title,
    config: { range: args.range, style: args.style, bestOfGames: args.bestOfGames },
    players: args.players.map(p => ({ id: p.id, name: p.name, color: (p as any).color })),
    startedAt: new Date().toISOString(),
  })

  return stored
}

export function persistCricketEvents(
  matchId: string,
  events: CricketEvent[]
): Promise<void> {
  const list = getCricketMatches()
  const idx = list.findIndex(m => m.id === matchId)
  if (idx === -1) return Promise.resolve()
  list[idx] = { ...list[idx], events }
  saveCricketMatches(list)

  // Queued DB write — prevents race condition with concurrent persist calls
  return new Promise<void>((resolve) => {
    queueWrite(`cricket-${matchId}`, async () => {
      try { await dbUpdateCricketEvents(matchId, events) }
      catch (err) { trackDBError('cricket-events', matchId, err) }
      resolve()
    })
  })
}

/**
 * Cricket-Match beenden.
 */
export function finishCricketMatch(
  matchId: string
): Promise<void> {
  const list = getCricketMatches()
  const idx = list.findIndex(m => m.id === matchId)
  if (idx === -1) return Promise.resolve()

  list[idx] = { ...list[idx], finished: true }
  saveCricketMatches(list)
  dbDeleteActiveGame(matchId).catch(() => {})

  const last =
    localStorage.getItem(
      LS_CRICKET.lastOpenMatchId
    )
  if (last === matchId) {
    setLastOpenCricketMatchId(undefined)
  }

  try {
    const finishedMatch = list[idx]
    if (finishedMatch.finished) {
      updateCricketLeaderboardsWithMatch(
        finishedMatch
      )
    }
  } catch (err) {
    console.error(
      'Cricket leaderboard update failed',
      err
    )
  }

  const cricketPlayerIds = list[idx].playerIds ?? []
  if (cricketPlayerIds.length > 0) queueStatsRefresh(cricketPlayerIds, 'cricket', loadGroup)
  // Invalidate TanStack Query stats cache
  for (const pid of cricketPlayerIds) {
    queryClient.invalidateQueries({ queryKey: ['stats', pid] })
  }

  // Queued DB write — serialized with event persist
  const matchData = list[idx]
  return new Promise<void>((resolve) => {
    queueWrite(`cricket-${matchId}`, async () => {
      try {
        await dbSaveCricketMatch({
          id: matchData.id,
          title: matchData.title || 'Cricket – Multiplayer',
          matchName: matchData.matchName ?? null,
          notes: matchData.notes ?? null,
          createdAt: matchData.createdAt,
          finished: true,
          finishedAt: now(),
          events: matchData.events,
          playerIds: matchData.playerIds,
        })
      } catch (err) { trackDBError('cricket-finish', matchData.id, err) }
      resolve()
    })
  })
}

/** Setzt Spielname und Bemerkungen für ein Cricket-Match (nur einmal möglich). */
export function setCricketMatchMetadata(
  matchId: string,
  matchName: string,
  notes: string
): boolean {
  const list = getCricketMatches()
  const idx = list.findIndex(m => m.id === matchId)
  if (idx === -1) return false

  // Nur setzen wenn noch nicht vorhanden
  if (list[idx].matchName !== undefined || list[idx].notes !== undefined) {
    return false
  }

  list[idx] = {
    ...list[idx],
    matchName: matchName.trim() || undefined,
    notes: notes.trim() || undefined,
  }
  saveCricketMatches(list)
  return true
}

/* -------------------------------------------------
   Cricket Summary Helpers
------------------------------------------------- */

export function rebuildCricketStateFromEvents(
  match: CricketStoredMatch
) {
  const start = match.events.find(isCricketMatchStarted)

  const totalsMarks: Record<
    string,
    number
  > = {}
  const totalsPoints: Record<
    string,
    number
  > = {}
  const totalsClosed: Record<
    string,
    number
  > = {}

  if (start?.players) {
    for (const p of start.players) {
      totalsMarks[p.playerId] = 0
      totalsPoints[p.playerId] = 0
      totalsClosed[p.playerId] = 0
    }
  }

  const seq: CricketEvent[] = []
  for (const ev of match.events) {
    seq.push(ev)

    if (ev.type === 'CricketLegFinished') {
      const st = applyCricket(seq)

      for (const pid of Object.keys(
        st.marksByPlayer
      )) {
        const marksSum = Object.values(
          st.marksByPlayer[pid] ?? {}
        ).reduce(
          (a, b) => a + (b ?? 0),
          0
        )

        totalsMarks[pid] =
          (totalsMarks[pid] ?? 0) + marksSum
        totalsPoints[pid] =
          (totalsPoints[pid] ?? 0) +
          (st.pointsByPlayer[pid] ?? 0)

        const closedCount = Object.values(
          st.marksByPlayer[pid] ?? {}
        ).filter(v => (v ?? 0) >= 3).length

        totalsClosed[pid] =
          (totalsClosed[pid] ?? 0) + closedCount
      }
    }
  }

  const finalState = applyCricket(match.events)
  return {
    ...finalState,
    totalMarksByPlayer: totalsMarks,
    totalPointsByPlayer: totalsPoints,
    totalClosedCountByPlayer: totalsClosed,
  }
}

export function getCricketMatchById(
  matchId: string
): null | {
  id: string
  range: CricketRange
  style: CricketStyle
  targetWins: number
  players: { id: string; name: string }[]
  events: CricketEvent[]
  finished: boolean
  cutthroatEndgame?: CutthroatEndgame
  crazyMode?: CrazyMode
  crazyWithPoints?: boolean
  crazySameForAll?: boolean
  crazyScoringMode?: 'standard' | 'cutthroat' | 'simple'
  matchName?: string
  notes?: string
} {
  const raw = getCricketMatch(matchId)
  if (!raw) return null

  const startEvt = raw.events.find(isCricketMatchStarted)

  const range = startEvt?.range ?? 'short'
  const style = startEvt?.style ?? 'standard'

  const players = (startEvt?.players ?? []).map(
    p => ({
      id: p.playerId,
      name: p.name ?? p.playerId,
    })
  )

  const targetWins =
    (startEvt?.targetWins as
      | number
      | undefined) ??
    (raw.seriesTargetWins as
      | number
      | undefined) ??
    (typeof startEvt?.bestOfGames ===
    'number'
      ? Math.floor(
          startEvt.bestOfGames / 2
        ) + 1
      : 1)

  return {
    id: raw.id,
    range,
    style,
    targetWins: targetWins || 1,
    players,
    events: raw.events,
    finished: !!raw.finished,
    cutthroatEndgame: startEvt?.cutthroatEndgame,
    crazyMode: startEvt?.crazyMode,
    crazyWithPoints: startEvt?.crazyWithPoints,
    crazySameForAll: startEvt?.crazySameForAll,
    crazyScoringMode: startEvt?.crazyScoringMode,
    matchName: raw.matchName,
    notes: raw.notes,
  }
}

export function getCricketComputedStats(
  matchId: string
): CricketMatchComputedStats | null {
  const m = getCricketMatchById(matchId)
  if (!m) return null
  return computeCricketStats(m)
}

/* -------------------------------------------------
   Cricket Leaderboards
------------------------------------------------- */
export type CricketLBEntry = {
  playerId: string
  playerName: string
  matchId: string
  value: number
  ts: string
}

export type CricketLeaderboards = {
  bullMaster: CricketLBEntry[]
  tripleHunter: CricketLBEntry[]
  fastestLegs: {
    matchId: string
    playerId: string
    playerName: string
    dartsThrown: number
    marks: number
    ts: string
  }[]
  bestTurnMarks: CricketLBEntry[]
  processedMatchIds: string[]
  version: 1
}

export function loadCricketLeaderboards(): CricketLeaderboards {
  return memCache.cricketLeaderboards ?? {
    bullMaster: [],
    tripleHunter: [],
    fastestLegs: [],
    bestTurnMarks: [],
    processedMatchIds: [],
    version: 1,
  }
}

export function saveCricketLeaderboards(
  lb: CricketLeaderboards
) {
  memCache.cricketLeaderboards = lb
}

export function updateCricketLeaderboardsWithMatch(
  match: CricketStoredMatch
) {
  const lb = loadCricketLeaderboards()

  if (lb.processedMatchIds.includes(match.id)) {
    return
  }

  const startEvt = match.events.find(isCricketMatchStarted)

  const stats = computeCricketStats({
    id: match.id,
    range: startEvt?.range ?? 'short',
    style: startEvt?.style ?? 'standard',
    targetWins:
      startEvt?.targetWins ??
      (startEvt?.bestOfGames
        ? Math.floor(startEvt.bestOfGames / 2) + 1
        : 1),
    players: (startEvt?.players ?? []).map(
      p => ({
        id: p.playerId,
        name: p.name ?? p.playerId,
      })
    ),
    events: match.events,
  })

  const finishedEvt = match.events.find(isCricketMatchFinished)
  const finishedTs = finishedEvt?.ts ?? match.createdAt

  for (const p of stats.players) {
    lb.bullMaster.push({
      playerId: p.playerId,
      playerName: p.playerName,
      matchId: match.id,
      value:
        Math.round(
          (p.bullAccuracy ?? 0) * 1000
        ) / 10,
      ts: finishedTs,
    })

    lb.tripleHunter.push({
      playerId: p.playerId,
      playerName: p.playerName,
      matchId: match.id,
      value: p.triplesHit ?? 0,
      ts: finishedTs,
    })

    lb.bestTurnMarks.push({
      playerId: p.playerId,
      playerName: p.playerName,
      matchId: match.id,
      value: p.bestTurnMarks ?? 0,
      ts: finishedTs,
    })
  }

  if (stats.fastestLegByMarks) {
    const fastest = stats.fastestLegByMarks
    const winnerName =
      stats.players.find(
        pp =>
          pp.playerId === fastest.playerId
      )?.playerName ?? fastest.playerId

    lb.fastestLegs.push({
      matchId: match.id,
      playerId: fastest.playerId,
      playerName: winnerName,
      dartsThrown: fastest.dartsThrown,
      marks: fastest.marks,
      ts: finishedTs,
    })
  }

  lb.bullMaster.sort(
    (a, b) => b.value - a.value
  )
  lb.tripleHunter.sort(
    (a, b) => b.value - a.value
  )
  lb.bestTurnMarks.sort(
    (a, b) => b.value - a.value
  )
  lb.fastestLegs.sort(
    (a, b) =>
      a.dartsThrown - b.dartsThrown ||
      b.marks - a.marks
  )

  lb.bullMaster = lb.bullMaster.slice(
    0,
    50
  )
  lb.tripleHunter = lb.tripleHunter.slice(
    0,
    50
  )
  lb.bestTurnMarks = lb.bestTurnMarks.slice(
    0,
    50
  )
  lb.fastestLegs = lb.fastestLegs.slice(
    0,
    50
  )

  lb.processedMatchIds.push(match.id)

  saveCricketLeaderboards(lb)

  // Dual-Write: SQLite (fire-and-forget)
  dbSaveCricketLeaderboards(lb).catch(e => trackDBError('cricket_leaderboards', match.id, e))
}

export function rebuildCricketLeaderboards() {
  const empty: CricketLeaderboards = {
    bullMaster: [],
    tripleHunter: [],
    fastestLegs: [],
    bestTurnMarks: [],
    processedMatchIds: [],
    version: 1,
  }
  saveCricketLeaderboards(empty)

  const all = getCricketMatches().filter(
    m => m.finished
  )
  for (const m of all) {
    updateCricketLeaderboardsWithMatch(m)
  }
}

export function getCricketLeaderboards(): CricketLeaderboardsUI {
  const lb = loadCricketLeaderboards()
  return cricketLbToUI(lb)
}

/** Async SQLite-first version */
export async function getCricketLeaderboardsAsync(): Promise<CricketLeaderboardsUI> {
  try {
    const useSQLite = await ensureDB()
    if (useSQLite) {
      const migrated = await dbGetMeta('cricket_lb_ls_migrated')
      if (migrated === 'true') {
        const dbLb = await dbLoadCricketLeaderboards()
        if (dbLb) return cricketLbToUI(dbLb)
      }
    }
  } catch (e) {
    console.warn('[Storage] SQLite Cricket Leaderboards load failed:', e)
  }
  return getCricketLeaderboards()
}

function cricketLbToUI(lb: CricketLeaderboards): CricketLeaderboardsUI {
  const bullMaster = lb.bullMaster.map(entry => ({
    playerId: entry.playerId,
    name: entry.playerName,
    bullPct: entry.value,
  }))

  const tripleHunter = lb.tripleHunter.map(entry => ({
    playerId: entry.playerId,
    name: entry.playerName,
    triplesHit: entry.value,
  }))

  const bestTurn = lb.bestTurnMarks.map(entry => ({
    playerId: entry.playerId,
    name: entry.playerName,
    marks: entry.value,
    turnDesc: `${entry.value} Marks Turn`,
  }))

  const fastestLeg = lb.fastestLegs.map(entry => ({
    playerId: entry.playerId,
    name: entry.playerName,
    dartsThrown: entry.dartsThrown,
    marksTotal: entry.marks,
  }))

  return { bullMaster, tripleHunter, bestTurn, fastestLeg }
}

export function getX01Leaderboards(): X01LeaderboardsUI {
  const lb = loadLeaderboards()
  return x01LbToUI(lb)
}

/** Async SQLite-first version */
export async function getX01LeaderboardsAsync(): Promise<X01LeaderboardsUI> {
  try {
    const useSQLite = await ensureDB()
    if (useSQLite) {
      const migrated = await dbGetMeta('x01_lb_ls_migrated')
      if (migrated === 'true') {
        const dbLb = await dbLoadX01Leaderboards()
        if (dbLb) return x01LbToUI(dbLb)
      }
    }
  } catch (e) {
    console.warn('[Storage] SQLite X01 Leaderboards load failed:', e)
  }
  return getX01Leaderboards()
}

function x01LbToUI(lb: Leaderboards): X01LeaderboardsUI {
  return {
    highVisits: lb.highVisits.map(v => ({
      playerId: v.playerId,
      playerName: v.playerName,
      matchId: v.matchId,
      value: v.value,
      ts: v.ts,
    })),
    highCheckouts: lb.highCheckouts.map(v => ({
      playerId: v.playerId,
      playerName: v.playerName,
      matchId: v.matchId,
      value: v.value,
      ts: v.ts,
    })),
    bestLegs: lb.bestLegs.map(l => ({
      playerId: l.playerId,
      playerName: l.playerName,
      matchId: l.matchId,
      darts: l.darts,
      ts: l.ts,
    })),
    worstLegs: lb.worstLegs.map(l => ({
      playerId: l.playerId,
      playerName: l.playerName,
      matchId: l.matchId,
      darts: l.darts,
      ts: l.ts,
    })),
    bestCheckoutPct: lb.bestCheckoutPct.map(p => ({
      playerId: p.playerId,
      playerName: p.playerName,
      value: p.value,
      attempts: p.attempts,
      made: p.made,
    })),
    worstCheckoutPct: lb.worstCheckoutPct.map(p => ({
      playerId: p.playerId,
      playerName: p.playerName,
      value: p.value,
      attempts: p.attempts,
      made: p.made,
    })),
  }
}

/* -------------------------------------------------
   Rematch-Helfer für Cricket
------------------------------------------------- */
export function createCricketRematchFromMatch(
  originalMatchId: string
): string | null {
  const original =
    getCricketMatch(originalMatchId)
  if (!original) return null

  const startEvt = original.events.find(isCricketMatchStarted)

  if (!startEvt) return null

  const playersInput = (startEvt.players || []).map(
    p => ({
      id: p.playerId,
      name: p.name ?? p.playerId,
      isGuest: !!p.isGuest,
    })
  )

  const targetWins = startEvt.targetWins
  let bestOfGames: number
  if (
    typeof targetWins === 'number' &&
    targetWins > 0
  ) {
    bestOfGames = targetWins * 2 - 1
  } else if (
    typeof startEvt.bestOfGames ===
      'number' &&
    startEvt.bestOfGames > 0
  ) {
    bestOfGames = startEvt.bestOfGames
  } else {
    bestOfGames = 3
  }

  const title = `Cricket ${
    startEvt.range === 'long'
      ? 'Long'
      : 'Short'
  } · ${
    startEvt.style === 'cutthroat'
      ? 'Cutthroat'
      : 'Standard'
  } – ${playersInput
    .map(p => p.name)
    .join(' vs ')} (Rematch)`

  const newStored =
    createCricketMatchShell({
      title,
      players: playersInput,
      range: startEvt.range,
      style: startEvt.style,
      bestOfGames,
    })

  return newStored.id
}

/* -------------------------------------------------
   Last Activity (Start Menu → "Spiel fortsetzen")
------------------------------------------------- */
type LastActivityInfo = {
  kind: 'x01' | 'cricket' | 'atb' | 'str' | 'highscore' | 'ctf' | 'shanghai' | 'killer' | 'bobs27' | 'operation'
  matchId: string
  ts: string
}

export function setLastActivity(
  kind: 'x01' | 'cricket' | 'atb' | 'str' | 'highscore' | 'ctf' | 'shanghai' | 'killer' | 'bobs27' | 'operation',
  matchId: string
) {
  const data: LastActivityInfo = {
    kind,
    matchId,
    ts: now(),
  }
  writeJSON(LS_KEYS.lastActivity, data)
}

export function getLastActivity():
  | (LastActivityInfo & {
      matchExists: boolean
      finished: boolean
    })
  | undefined {
  const raw = readJSON<LastActivityInfo | null>(
    LS_KEYS.lastActivity,
    null
  )
  if (!raw) return undefined

  if (raw.kind === 'x01') {
    const m = getMatches().find(
      mm => mm.id === raw.matchId
    )
    if (!m) {
      return {
        ...raw,
        matchExists: false,
        finished: true,
      }
    }
    return {
      ...raw,
      matchExists: true,
      finished: !!m.finished,
    }
  } else if (raw.kind === 'cricket') {
    const m = getCricketMatches().find(
      mm => mm.id === raw.matchId
    )
    if (!m) {
      return {
        ...raw,
        matchExists: false,
        finished: true,
      }
    }
    return {
      ...raw,
      matchExists: true,
      finished: !!m.finished,
    }
  } else if (raw.kind === 'atb') {
    const m = getATBMatches().find(
      mm => mm.id === raw.matchId
    )
    if (!m) {
      return {
        ...raw,
        matchExists: false,
        finished: true,
      }
    }
    return {
      ...raw,
      matchExists: true,
      finished: !!m.finished,
    }
  } else if (raw.kind === 'str') {
    const m = getStrMatches().find(
      mm => mm.id === raw.matchId
    )
    if (!m) {
      return {
        ...raw,
        matchExists: false,
        finished: true,
      }
    }
    return {
      ...raw,
      matchExists: true,
      finished: !!m.finished,
    }
  } else if (raw.kind === 'highscore') {
    const m = getHighscoreMatches().find(
      mm => mm.id === raw.matchId
    )
    if (!m) {
      return {
        ...raw,
        matchExists: false,
        finished: true,
      }
    }
    return {
      ...raw,
      matchExists: true,
      finished: !!m.finished,
    }
  } else if (raw.kind === 'ctf') {
    const m = getCTFMatches().find(
      mm => mm.id === raw.matchId
    )
    if (!m) {
      return {
        ...raw,
        matchExists: false,
        finished: true,
      }
    }
    return {
      ...raw,
      matchExists: true,
      finished: !!m.finished,
    }
  } else if (raw.kind === 'shanghai') {
    const m = getShanghaiMatches().find(
      mm => mm.id === raw.matchId
    )
    if (!m) {
      return {
        ...raw,
        matchExists: false,
        finished: true,
      }
    }
    return {
      ...raw,
      matchExists: true,
      finished: !!m.finished,
    }
  } else if (raw.kind === 'killer') {
    const m = getKillerMatches().find(
      mm => mm.id === raw.matchId
    )
    if (!m) {
      return {
        ...raw,
        matchExists: false,
        finished: true,
      }
    }
    return {
      ...raw,
      matchExists: true,
      finished: !!m.finished,
    }
  } else if (raw.kind === 'bobs27') {
    const m = getBobs27Matches().find(
      mm => mm.id === raw.matchId
    )
    if (!m) {
      return {
        ...raw,
        matchExists: false,
        finished: true,
      }
    }
    return {
      ...raw,
      matchExists: true,
      finished: !!m.finished,
    }
  } else {
    // operation
    const m = getOperationMatches().find(
      mm => mm.id === raw.matchId
    )
    if (!m) {
      return {
        ...raw,
        matchExists: false,
        finished: true,
      }
    }
    return {
      ...raw,
      matchExists: true,
      finished: !!m.finished,
    }
  }
}

/* -------------------------------------------------
   Around the Block (ATB) Storage
------------------------------------------------- */
import type { ATBStoredMatch, ATBHighscore, ATBStructure, ATBMatchConfig, ATBTarget } from './types/aroundTheBlock'
import { generateATBSequence } from './dartsAroundTheBlock'
import type { ATBEvent, ATBMode, ATBDirection, ATBPlayer, ATBLegStartedEvent } from './dartsAroundTheBlock'
import { getModeLabel, getDirectionLabel } from './dartsAroundTheBlock'

const LS_ATB = {
  lastOpenMatchId: 'atb.lastOpenMatchId.v1',
} as const

// Cache für synchrone Zugriffe
let atbMatchesCache: ATBStoredMatch[] | null = null

export function getATBMatches(): ATBStoredMatch[] {
  return atbMatchesCache ?? []
}

export function saveATBMatches(all: ATBStoredMatch[]) {
  atbMatchesCache = all
}

// SQLite-aware ATB Matches laden
export async function getATBMatchesAsync(): Promise<ATBStoredMatch[]> {
  try {
    const useSQLite = await ensureDB()
    if (useSQLite) {
      const dbMatches = await dbGetATBMatches()
      const matches: ATBStoredMatch[] = dbMatches.map((m) => ({
        id: m.id,
        title: m.title,
        createdAt: m.createdAt,
        finished: m.finished,
        finishedAt: m.finishedAt ?? undefined,
        durationMs: m.durationMs ?? undefined,
        winnerId: m.winnerId ?? undefined,
        winnerDarts: m.winnerDarts ?? undefined,
        mode: m.mode as ATBMode,
        direction: m.direction as ATBDirection,
        players: m.players,
        events: m.events as ATBEvent[],
        structure: m.structure,
        config: m.config,
        generatedSequence: m.generatedSequence,
      }))
      atbMatchesCache = matches
      return matches
    }
  } catch (e) {
    console.warn('[Storage] SQLite ATB load failed:', e)
  }
  return getATBMatches()
}

export function getATBMatchById(matchId: string): ATBStoredMatch | null {
  const matches = getATBMatches()
  return matches.find(m => m.id === matchId) ?? null
}

export function getOpenATBMatch(): ATBStoredMatch | undefined {
  const lastId = localStorage.getItem(LS_ATB.lastOpenMatchId)
  if (!lastId) return undefined
  const matches = getATBMatches()
  const found = matches.find(m => m.id === lastId && !m.finished)
  if (found) return found
  const summary = getOpenMatchSummary('atb')
  if (summary) return { id: summary.id, title: summary.title, finished: false } as any
  return undefined
}

export function setLastOpenATBMatchId(matchId: string) {
  localStorage.setItem(LS_ATB.lastOpenMatchId, matchId)
}

export function createATBMatchShell(args: {
  players: ATBPlayer[]
  mode: ATBMode
  direction: ATBDirection
  structure?: ATBStructure
  config?: ATBMatchConfig
}): ATBStoredMatch {
  const matchId = id()
  const structure: ATBStructure = args.structure ?? { kind: 'legs', bestOfLegs: 1 }

  // Titel mit Legs/Sets Info
  let structureLabel = ''
  if (structure.kind === 'legs' && structure.bestOfLegs > 1) {
    const targetLegs = Math.ceil(structure.bestOfLegs / 2)
    structureLabel = ` (First to ${targetLegs})`
  } else if (structure.kind === 'sets') {
    const targetSets = Math.ceil(structure.bestOfSets / 2)
    structureLabel = ` (First to ${targetSets} Sets)`
  }

  const title = `Around the Block · ${getModeLabel(args.mode)} ${getDirectionLabel(args.direction)}${structureLabel} – ${args.players.map(p => p.name).join(' vs ')}`

  // Generiere Sequenz falls Config vorhanden
  let generatedSequence: ATBTarget[] | undefined
  if (args.config) {
    generatedSequence = generateATBSequence(args.config, args.direction)
  }

  const startEvent: ATBEvent = {
    type: 'ATBMatchStarted',
    eventId: id(),
    matchId,
    ts: now(),
    players: args.players,
    mode: args.mode,
    direction: args.direction,
    structure,
    config: args.config,
    generatedSequence,
  }

  // Erstes Leg starten
  const legStartEvent: ATBLegStartedEvent = {
    type: 'ATBLegStarted',
    eventId: id(),
    matchId,
    ts: now(),
    legId: id(),
    legIndex: 1,
    setIndex: structure.kind === 'sets' ? 1 : undefined,
  }

  const stored: ATBStoredMatch = {
    id: matchId,
    title,
    createdAt: now(),
    players: args.players,
    mode: args.mode,
    direction: args.direction,
    structure,
    events: [startEvent, legStartEvent],
    config: args.config,
    generatedSequence,
  }

  const all = getATBMatches()
  all.push(stored)
  atbMatchesCache = all


  // Async SQLite save
  dbSaveATBMatch({
    id: stored.id,
    title: stored.title,
    createdAt: stored.createdAt,
    finished: stored.finished ?? false,
    finishedAt: stored.finishedAt ?? null,
    durationMs: stored.durationMs ?? null,
    winnerId: stored.winnerId ?? null,
    winnerDarts: stored.winnerDarts ?? null,
    mode: stored.mode,
    direction: stored.direction,
    players: stored.players,
    events: stored.events,
    structure: stored.structure,
    config: stored.config,
    generatedSequence: stored.generatedSequence,
  }).catch(err => trackDBError('atb-create', stored.id, err))

  registerActiveGame({
    id: matchId,
    playerId: args.players[0]?.playerId ?? '',
    gameType: 'atb',
    title,
    config: { mode: args.mode, direction: args.direction },
    players: args.players.map(p => ({ id: p.playerId, name: p.name, color: (p as any).color })),
    startedAt: new Date().toISOString(),
  })

  return stored
}

export function persistATBEvents(matchId: string, events: ATBEvent[]): Promise<void> {
  const all = getATBMatches()
  const idx = all.findIndex(m => m.id === matchId)
  if (idx === -1) return Promise.resolve()

  all[idx].events = events
  atbMatchesCache = all

  return new Promise<void>((resolve) => {
    queueWrite(`atb-${matchId}`, async () => {
      try { await dbUpdateATBEvents(matchId, events) }
      catch (err) { trackDBError('atb-events', matchId, err) }
      resolve()
    })
  })
}

export function finishATBMatch(
  matchId: string,
  winnerId: string,
  winnerDarts: number,
  durationMs: number
): Promise<void> {
  const all = getATBMatches()
  const idx = all.findIndex(m => m.id === matchId)
  if (idx === -1) return Promise.resolve()

  all[idx].finished = true
  all[idx].finishedAt = now()
  all[idx].winnerId = winnerId
  all[idx].winnerDarts = winnerDarts
  all[idx].durationMs = durationMs
  atbMatchesCache = all
  dbDeleteActiveGame(matchId).catch(() => {})

  // Update Highscores
  const match = all[idx]
  const winner = match.players.find(p => p.playerId === winnerId)
  if (winner) {
    updateATBHighscores({
      playerId: winnerId,
      playerName: winner.name,
      mode: match.mode,
      direction: match.direction,
      durationMs,
      darts: winnerDarts,
    })
  }

  const atbPids = all[idx].players.map((p: { playerId: string }) => p.playerId)
  if (atbPids.length > 0) queueStatsRefresh(atbPids, 'atb', loadGroup)
  // Invalidate TanStack Query stats cache
  for (const pid of atbPids) {
    queryClient.invalidateQueries({ queryKey: ['stats', pid] })
  }

  return new Promise<void>((resolve) => {
    queueWrite(`atb-${matchId}`, async () => {
      try { await dbFinishATBMatch(matchId, winnerId, winnerDarts, durationMs) }
      catch (err) { trackDBError('atb-finish', matchId, err) }
      resolve()
    })
  })
}

let atbHighscoresCache: ATBHighscore[] | null = null

export function getATBHighscores(): ATBHighscore[] {
  return atbHighscoresCache ?? []
}

export function updateATBHighscores(result: {
  playerId: string
  playerName: string
  mode: ATBMode
  direction: ATBDirection
  durationMs: number
  darts: number
}) {
  const all = getATBHighscores()

  const entry: ATBHighscore = {
    id: id(),
    playerId: result.playerId,
    playerName: result.playerName,
    mode: result.mode,
    direction: result.direction,
    durationMs: result.durationMs,
    darts: result.darts,
    date: now(),
  }

  all.push(entry)

  // Sortiere nach Zeit (schnellste zuerst), behalte Top 50
  all.sort((a, b) => a.durationMs - b.durationMs)
  const trimmed = all.slice(0, 50)

  atbHighscoresCache = trimmed
}

/* -------------------------------------------------
   Match-Ende Helper für X01
   -> zentrale Logik um zu prüfen, ob ein Match vorbei ist.
------------------------------------------------- */

/**
 * checkIfX01MatchIsOver(eventsSoFar):
 * - analysiert die Events mit applyEvents
 * - liefert { finished: boolean, winnerId?: string }
 * - finished=true heißt: wir haben einen MatchFinished Event ODER
 *   aus Legs/Sets klaren Sieger abgeleitet.
 */
export function checkIfX01MatchIsOver(eventsSoFar: DartsEvent[]): {
  finished: boolean
  winnerId?: string
} {
  const derived = applyEvents(eventsSoFar)
  const match = derived.match
  if (!match) return { finished: false }

  // 1. Falls schon ein MatchFinished Event drin ist → Winner übernehmen.
  if (derived.finished?.winnerPlayerId) {
    return { finished: true, winnerId: derived.finished.winnerPlayerId }
  }

  // 2. Sonst aus Legs / Sets ableiten:
  if (match.structure.kind === 'legs') {
    const bestOfLegs = match.structure.bestOfLegs ?? 1
    const need = Math.floor(bestOfLegs / 2) + 1

    const wins: Record<string, number> = {}
    for (const p of match.players) wins[p.playerId] = 0
    for (const L of derived.legs) {
      if (L.winnerPlayerId) {
        wins[L.winnerPlayerId]++
      }
    }
    for (const pid of Object.keys(wins)) {
      if (wins[pid] >= need) {
        return { finished: true, winnerId: pid }
      }
    }
  } else {
    const needSets = Math.floor(match.structure.bestOfSets / 2) + 1

    const setsWon: Record<string, number> = {}
    for (const p of match.players) setsWon[p.playerId] = 0
    for (const s of derived.sets) {
      if (s.winnerPlayerId) {
        setsWon[s.winnerPlayerId]++
      }
    }
    for (const pid of Object.keys(setsWon)) {
      if (setsWon[pid] >= needSets) {
        return { finished: true, winnerId: pid }
      }
    }
  }

  return { finished: false }
}



/* -------------------------------------------------
   Dev Helper
------------------------------------------------- */
;(window as any).rebuildCricketLB = rebuildCricketLeaderboards
;(window as any).rebuildX01LB = rebuildLeaderboards

/* -------------------------------------------------
   BACKUP / EXPORT - Alle Daten sichern
------------------------------------------------- */

// Alle LocalStorage Keys die noch in LS gespeichert werden (nur Session-State)
const ALL_STORAGE_KEYS = [
  'darts.lastOpenMatchId.v1',
  'darts.lastActivity.v1',
  'cricket.lastOpenMatchId.v1',
  'atb.lastOpenMatchId.v1',
  'highscore.lastOpenMatchId.v1',
] as const

export type DartsBackup = {
  version: 1
  createdAt: string
  data: Record<string, unknown>
  stats: {
    x01Matches: number
    cricketMatches: number
    atbMatches: number
    highscoreMatches: number
    profiles: number
    totalSizeBytes: number
  }
}

/**
 * Erstellt ein vollständiges Backup aller Darts-Daten.
 */
export function createFullBackup(): DartsBackup {
  const data: Record<string, unknown> = {}
  let totalSize = 0

  for (const key of ALL_STORAGE_KEYS) {
    const raw = localStorage.getItem(key)
    if (raw) {
      totalSize += raw.length * 2 // UTF-16
      try {
        data[key] = JSON.parse(raw)
      } catch {
        data[key] = raw
      }
    }
  }

  const x01Matches = Array.isArray(data['darts.matches.v1']) ? data['darts.matches.v1'].length : 0
  const cricketMatches = Array.isArray(data['cricket.matches.v1']) ? data['cricket.matches.v1'].length : 0
  const atbMatches = Array.isArray(data['atb.matches.v1']) ? data['atb.matches.v1'].length : 0
  const highscoreMatches = Array.isArray(data['highscore.matches.v1']) ? data['highscore.matches.v1'].length : 0
  const profiles = Array.isArray(data['darts.profiles.v1']) ? data['darts.profiles.v1'].length : 0

  return {
    version: 1,
    createdAt: new Date().toISOString(),
    data,
    stats: {
      x01Matches,
      cricketMatches,
      atbMatches,
      highscoreMatches,
      profiles,
      totalSizeBytes: totalSize,
    },
  }
}

/**
 * Lädt ein Backup herunter als JSON-Datei.
 */
export function downloadBackup(): void {
  const backup = createFullBackup()
  const json = JSON.stringify(backup, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)

  const date = new Date().toISOString().slice(0, 10)
  const filename = `darts-backup-${date}.json`

  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)

  console.debug(`[Backup] Downloaded: ${filename}`)
  console.debug(`[Backup] Stats:`, backup.stats)
}

/**
 * Stellt ein Backup wieder her.
 */
export function restoreBackup(backup: DartsBackup): { success: boolean; message: string } {
  if (backup.version !== 1) {
    return { success: false, message: `Unbekannte Backup-Version: ${backup.version}` }
  }

  try {
    for (const [key, value] of Object.entries(backup.data)) {
      if (ALL_STORAGE_KEYS.includes(key as any)) {
        localStorage.setItem(key, JSON.stringify(value))
      }
    }
    return {
      success: true,
      message: `Backup wiederhergestellt: ${backup.stats.x01Matches} X01, ${backup.stats.cricketMatches} Cricket, ${backup.stats.atbMatches} ATB, ${backup.stats.highscoreMatches ?? 0} Highscore Matches`,
    }
  } catch (e) {
    return { success: false, message: `Fehler: ${e}` }
  }
}

/**
 * Gibt Storage-Statistiken zurück.
 */
export function getStorageStats(): {
  usedBytes: number
  usedMB: string
  itemCounts: Record<string, number>
} {
  let usedBytes = 0
  const itemCounts: Record<string, number> = {}

  for (const key of ALL_STORAGE_KEYS) {
    const raw = localStorage.getItem(key)
    if (raw) {
      usedBytes += raw.length * 2
      try {
        const parsed = JSON.parse(raw)
        itemCounts[key] = Array.isArray(parsed) ? parsed.length : 1
      } catch {
        itemCounts[key] = 1
      }
    }
  }

  return {
    usedBytes,
    usedMB: (usedBytes / 1024 / 1024).toFixed(2) + ' MB',
    itemCounts,
  }
}

// ============================================================
// Pause-Persistenz
// Speichert ob ein Spiel pausiert war (für Auto-Pause bei Exit)
// ============================================================

const PAUSED_MATCHES_KEY = 'pausedMatches'

type PausedMatchesMap = Record<string, boolean>

function getPausedMatchesMap(): PausedMatchesMap {
  try {
    const raw = localStorage.getItem(PAUSED_MATCHES_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function savePausedMatchesMap(map: PausedMatchesMap) {
  localStorage.setItem(PAUSED_MATCHES_KEY, JSON.stringify(map))
}

/**
 * Markiert ein Match als pausiert.
 */
export function setMatchPaused(matchId: string, gameType: 'x01' | 'cricket' | 'atb' | 'str' | 'highscore' | 'ctf' | 'shanghai' | 'killer' | 'bobs27' | 'operation', paused: boolean) {
  const key = `${gameType}:${matchId}`
  const map = getPausedMatchesMap()
  if (paused) {
    map[key] = true
  } else {
    delete map[key]
  }
  savePausedMatchesMap(map)
}

/**
 * Prüft ob ein Match als pausiert markiert ist.
 */
export function isMatchPaused(matchId: string, gameType: 'x01' | 'cricket' | 'atb' | 'str' | 'highscore' | 'ctf' | 'shanghai' | 'killer' | 'bobs27' | 'operation'): boolean {
  const key = `${gameType}:${matchId}`
  const map = getPausedMatchesMap()
  return !!map[key]
}

/**
 * Löscht den Pause-Status für ein Match.
 */
export function clearMatchPaused(matchId: string, gameType: 'x01' | 'cricket' | 'atb' | 'str' | 'highscore' | 'ctf' | 'shanghai' | 'killer' | 'bobs27' | 'operation') {
  setMatchPaused(matchId, gameType, false)
}

// ============================================================
// Zeit-Persistenz
// Speichert die verstrichene Spielzeit beim Verlassen
// ============================================================

const MATCH_ELAPSED_TIME_KEY = 'matchElapsedTime'

type ElapsedTimeMap = Record<string, number>

function getElapsedTimeMap(): ElapsedTimeMap {
  try {
    const raw = localStorage.getItem(MATCH_ELAPSED_TIME_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function saveElapsedTimeMap(map: ElapsedTimeMap) {
  localStorage.setItem(MATCH_ELAPSED_TIME_KEY, JSON.stringify(map))
}

/**
 * Speichert die verstrichene Zeit für ein Match (in ms).
 */
export function setMatchElapsedTime(matchId: string, gameType: 'x01' | 'cricket' | 'atb' | 'str' | 'highscore' | 'ctf' | 'shanghai' | 'killer' | 'bobs27' | 'operation', elapsedMs: number) {
  const key = `${gameType}:${matchId}`
  const map = getElapsedTimeMap()
  map[key] = elapsedMs
  saveElapsedTimeMap(map)
}

/**
 * Holt die gespeicherte verstrichene Zeit für ein Match (in ms).
 * Gibt 0 zurück wenn keine Zeit gespeichert ist.
 */
export function getMatchElapsedTime(matchId: string, gameType: 'x01' | 'cricket' | 'atb' | 'str' | 'highscore' | 'ctf' | 'shanghai' | 'killer' | 'bobs27' | 'operation'): number {
  const key = `${gameType}:${matchId}`
  const map = getElapsedTimeMap()
  return map[key] ?? 0
}

/**
 * Berechnet die Match-Dauer aus Event-Timestamps.
 * Funktioniert in Multiplayer (identisch auf allen Geräten).
 */
export function computeMatchDurationFromEvents(events: Array<{ ts?: string; timestamp?: number }>): number {
  if (events.length < 2) return 0
  const getTime = (e: { ts?: string; timestamp?: number }): number => {
    if (e.timestamp) return e.timestamp
    if (e.ts) return new Date(e.ts).getTime()
    return 0
  }
  const first = getTime(events[0])
  const last = getTime(events[events.length - 1])
  if (!first || !last) return 0
  return Math.max(0, last - first)
}

/**
 * Löscht die gespeicherte Zeit für ein Match.
 */
export function clearMatchElapsedTime(matchId: string, gameType: 'x01' | 'cricket' | 'atb' | 'str' | 'highscore' | 'ctf' | 'shanghai' | 'killer' | 'bobs27' | 'operation') {
  const key = `${gameType}:${matchId}`
  const map = getElapsedTimeMap()
  delete map[key]
  saveElapsedTimeMap(map)
}

// ============================================================
// Match-Löschung (für Abbrechen)
// ============================================================

/**
 * Löscht ein X01-Match komplett.
 */
export function deleteX01Match(matchId: string) {
  const matches = getMatches()
  const filtered = matches.filter(m => m.id !== matchId)
  saveMatches(filtered)
  dbDeleteActiveGame(matchId).catch(() => {})
  // Pause- und Zeit-Status auch löschen
  clearMatchPaused(matchId, 'x01')
  clearMatchElapsedTime(matchId, 'x01')
}

/**
 * Löscht ein Cricket-Match komplett.
 */
export function deleteCricketMatch(matchId: string) {
  const matches = getCricketMatches()
  const filtered = matches.filter(m => m.id !== matchId)
  saveCricketMatches(filtered)
  dbDeleteActiveGame(matchId).catch(() => {})
  // Pause- und Zeit-Status auch löschen
  clearMatchPaused(matchId, 'cricket')
  clearMatchElapsedTime(matchId, 'cricket')
}

/**
 * Löscht ein ATB-Match komplett.
 */
export function deleteATBMatch(matchId: string) {
  const all = getATBMatches()
  const filtered = all.filter(m => m.id !== matchId)
  atbMatchesCache = filtered
  dbDeleteActiveGame(matchId).catch(() => {})
  // Pause- und Zeit-Status auch löschen
  clearMatchPaused(matchId, 'atb')
  clearMatchElapsedTime(matchId, 'atb')
}

/* -------------------------------------------------
   Sträußchen (STR) Storage
------------------------------------------------- */
import type { StrStoredMatch, StrRingMode, StrBullMode, StrBullPosition } from './types/straeusschen'
import type { StrEvent, StrPlayer, StrStructure, StrMode, StrNumberOrder, StrTurnOrder, StrLegStartedEvent } from './dartsStraeusschen'
import { id as strId, now as strNow, generateNumberOrder, getTargetLabel } from './dartsStraeusschen'
import type { StrTargetNumber } from './types/straeusschen'

const LS_STR = {
  lastOpenMatchId: 'str.lastOpenMatchId.v1',
} as const

let strMatchesCache: StrStoredMatch[] | null = null

export function getStrMatches(): StrStoredMatch[] {
  return strMatchesCache ?? []
}

export function saveStrMatches(all: StrStoredMatch[]) {
  strMatchesCache = all
}

// SQLite-aware Str Matches laden
export async function getStrMatchesAsync(): Promise<StrStoredMatch[]> {
  try {
    const useSQLite = await ensureDB()
    if (useSQLite) {
      const dbMatches = await dbGetStrMatches()
      const matches = dbMatches as any as StrStoredMatch[]
      strMatchesCache = matches
      return matches
    }
  } catch (e) {
    console.warn('[Storage] SQLite Str load failed:', e)
  }
  return getStrMatches()
}

export function getStrMatchById(matchId: string): StrStoredMatch | null {
  const matches = getStrMatches()
  return matches.find(m => m.id === matchId) ?? null
}

export function getOpenStrMatch(): StrStoredMatch | undefined {
  const lastId = localStorage.getItem(LS_STR.lastOpenMatchId)
  if (!lastId) return undefined
  const matches = getStrMatches()
  const found = matches.find(m => m.id === lastId && !m.finished)
  if (found) return found
  const summary = getOpenMatchSummary('str')
  if (summary) return { id: summary.id, title: summary.title, finished: false } as any
  return undefined
}

export function setLastOpenStrMatchId(matchId: string) {
  localStorage.setItem(LS_STR.lastOpenMatchId, matchId)
}

export function createStrMatchShell(args: {
  players: StrPlayer[]
  mode: StrMode
  targetNumber?: StrTargetNumber
  numberOrder?: StrNumberOrder
  turnOrder?: StrTurnOrder
  structure?: StrStructure
  ringMode?: StrRingMode
  bullMode?: StrBullMode
  bullPosition?: StrBullPosition
}): StrStoredMatch {
  const matchId = strId()
  const structure: StrStructure = args.structure ?? { kind: 'legs', bestOfLegs: 1 }
  const ringMode: StrRingMode = args.ringMode ?? 'triple'

  // Bull im Spiel?
  const includeBull = args.mode === 'single' ? args.targetNumber === 25 : true

  // Titel
  const prefix = ringMode === 'double' ? 'D' : 'T'
  const modeLabel = args.mode === 'single'
    ? getTargetLabel(args.targetNumber ?? 20 as StrTargetNumber, ringMode)
    : `${prefix}17-${prefix}20+Bull`
  let structureLabel = ''
  if (structure.kind === 'legs' && structure.bestOfLegs > 1) {
    const target = Math.ceil(structure.bestOfLegs / 2)
    structureLabel = ` (First to ${target})`
  } else if (structure.kind === 'sets') {
    const target = Math.ceil(structure.bestOfSets / 2)
    structureLabel = ` (First to ${target} Sets)`
  }
  const title = `Sträußchen · ${modeLabel}${structureLabel} – ${args.players.map(p => p.name).join(' vs ')}`

  // Generiere Reihenfolge bei 'all' mode
  let generatedOrder: StrTargetNumber[] | undefined
  if (args.mode === 'all' && args.numberOrder) {
    generatedOrder = generateNumberOrder(args.numberOrder, includeBull, args.bullPosition)
  }

  const startEvent: StrEvent = {
    type: 'StrMatchStarted',
    eventId: strId(),
    matchId,
    ts: strNow(),
    players: args.players,
    mode: args.mode,
    targetNumber: args.targetNumber,
    numberOrder: args.numberOrder,
    generatedOrder,
    structure,
    turnOrder: args.turnOrder,
    ringMode: args.ringMode,
    bullMode: includeBull ? args.bullMode : undefined,
    bullPosition: args.bullPosition,
  }

  const legStartEvent: StrLegStartedEvent = {
    type: 'StrLegStarted',
    eventId: strId(),
    matchId,
    ts: strNow(),
    legId: strId(),
    legIndex: 1,
    setIndex: structure.kind === 'sets' ? 1 : undefined,
  }

  const stored: StrStoredMatch = {
    id: matchId,
    title,
    createdAt: strNow(),
    players: args.players,
    mode: args.mode,
    targetNumber: args.targetNumber,
    numberOrder: args.numberOrder,
    turnOrder: args.turnOrder,
    generatedOrder,
    structure,
    events: [startEvent, legStartEvent],
    ringMode: args.ringMode,
    bullMode: includeBull ? args.bullMode : undefined,
    bullPosition: args.bullPosition,
  }

  const all = getStrMatches()
  all.push(stored)
  strMatchesCache = all


  // SQLite Dual-Write
  const dbMatch: DBStrMatch = {
    id: stored.id,
    title: stored.title,
    createdAt: stored.createdAt,
    finished: false,
    finishedAt: null,
    durationMs: null,
    winnerId: null,
    winnerDarts: null,
    mode: stored.mode,
    targetNumber: stored.targetNumber ?? null,
    numberOrder: stored.numberOrder ?? null,
    turnOrder: stored.turnOrder ?? null,
    ringMode: stored.ringMode ?? null,
    bullMode: stored.bullMode ?? null,
    bullPosition: stored.bullPosition ?? null,
    players: stored.players,
    events: stored.events,
    structure: stored.structure,
    generatedOrder: stored.generatedOrder,
  }
  dbSaveStrMatch(dbMatch).catch(err => trackDBError('str-create', stored.id, err))

  registerActiveGame({
    id: matchId,
    playerId: args.players[0]?.playerId ?? '',
    gameType: 'str',
    title,
    config: { mode: args.mode, ringMode },
    players: args.players.map(p => ({ id: p.playerId, name: p.name, color: (p as any).color })),
    startedAt: new Date().toISOString(),
  })

  return stored
}

export function persistStrEvents(matchId: string, events: StrEvent[]): Promise<void> {
  const all = getStrMatches()
  const idx = all.findIndex(m => m.id === matchId)
  if (idx === -1) return Promise.resolve()

  all[idx].events = events
  strMatchesCache = all

  return new Promise<void>((resolve) => {
    queueWrite(`str-${matchId}`, async () => {
      try { await dbUpdateStrEvents(matchId, events as any[]) }
      catch (err) { trackDBError('str-events', matchId, err) }
      resolve()
    })
  })
}

export function finishStrMatch(
  matchId: string,
  winnerId: string,
  winnerDarts: number,
  durationMs: number
): Promise<void> {
  const all = getStrMatches()
  const idx = all.findIndex(m => m.id === matchId)
  if (idx === -1) return Promise.resolve()

  all[idx].finished = true
  all[idx].finishedAt = strNow()
  all[idx].winnerId = winnerId
  all[idx].winnerDarts = winnerDarts
  all[idx].durationMs = durationMs
  strMatchesCache = all
  dbDeleteActiveGame(matchId).catch(() => {})

  const strPids = all[idx].players.map((p: { playerId: string }) => p.playerId)
  if (strPids.length > 0) queueStatsRefresh(strPids, 'str', loadGroup)
  // Invalidate TanStack Query stats cache
  for (const pid of strPids) {
    queryClient.invalidateQueries({ queryKey: ['stats', pid] })
  }

  return new Promise<void>((resolve) => {
    queueWrite(`str-${matchId}`, async () => {
      try { await dbFinishStrMatch(matchId, winnerId, winnerDarts, durationMs) }
      catch (err) { trackDBError('str-finish', matchId, err) }
      resolve()
    })
  })
}

export function deleteStrMatch(matchId: string) {
  const all = getStrMatches()
  const filtered = all.filter(m => m.id !== matchId)
  strMatchesCache = filtered
  dbDeleteActiveGame(matchId).catch(() => {})

  clearMatchPaused(matchId, 'str')
  clearMatchElapsedTime(matchId, 'str')
}

/* -------------------------------------------------
   Capture the Field (CTF) Storage
------------------------------------------------- */
import type { CTFStoredMatch, CTFEvent, CTFStructure, CTFMatchConfig, CTFTarget, CTFMultiplierMode } from './types/captureTheField'
import type { CTFPlayer } from './types/captureTheField'
import { id as ctfId, now as ctfNow, generateCTFSequence, calculateFieldPoints } from './dartsCaptureTheField'

const LS_CTF = {
  lastOpenMatchId: 'ctf.lastOpenMatchId.v1',
} as const

let ctfMatchesCache: CTFStoredMatch[] | null = null

export function getCTFMatches(): CTFStoredMatch[] {
  return ctfMatchesCache ?? []
}

export function saveCTFMatches(all: CTFStoredMatch[]) {
  ctfMatchesCache = all
}

// SQLite-aware CTF Matches laden
export async function getCTFMatchesAsync(): Promise<CTFStoredMatch[]> {
  try {
    const useSQLite = await ensureDB()
    if (useSQLite) {
      const dbMatches = await dbGetCTFMatches()
      const matches = dbMatches as any as CTFStoredMatch[]
      ctfMatchesCache = matches
      return matches
    }
  } catch (e) {
    console.warn('[Storage] SQLite CTF load failed:', e)
  }
  return getCTFMatches()
}

export function getCTFMatchById(matchId: string): CTFStoredMatch | null {
  const matches = getCTFMatches()
  return matches.find(m => m.id === matchId) ?? null
}

export function getOpenCTFMatch(): CTFStoredMatch | undefined {
  const lastId = localStorage.getItem(LS_CTF.lastOpenMatchId)
  if (!lastId) return undefined
  const matches = getCTFMatches()
  const found = matches.find(m => m.id === lastId && !m.finished)
  if (found) return found
  const summary = getOpenMatchSummary('ctf')
  if (summary) return { id: summary.id, title: summary.title, finished: false } as any
  return undefined
}

export function setLastOpenCTFMatchId(matchId: string) {
  localStorage.setItem(LS_CTF.lastOpenMatchId, matchId)
}

export function createCTFMatchShell(args: {
  players: CTFPlayer[]
  structure?: CTFStructure
  config: CTFMatchConfig
}): CTFStoredMatch {
  const matchId = ctfId()
  const structure: CTFStructure = args.structure ?? { kind: 'legs', bestOfLegs: 1 }

  // Titel
  let structureLabel = ''
  if (structure.kind === 'legs' && structure.bestOfLegs > 1) {
    const target = Math.ceil(structure.bestOfLegs / 2)
    structureLabel = ` (First to ${target})`
  } else if (structure.kind === 'sets') {
    const target = Math.ceil(structure.bestOfSets / 2)
    structureLabel = ` (First to ${target} Sets)`
  }
  const title = `Capture the Field${structureLabel} – ${args.players.map(p => p.name).join(' vs ')}`

  // Generiere Sequenz
  const generatedSequence = generateCTFSequence(args.config.bullPosition, args.config.sequenceMode)

  const startEvent: CTFEvent = {
    type: 'CTFMatchStarted',
    eventId: ctfId(),
    matchId,
    ts: ctfNow(),
    players: args.players,
    structure,
    config: args.config,
    generatedSequence,
  }

  const legStartEvent: CTFEvent = {
    type: 'CTFLegStarted',
    eventId: ctfId(),
    matchId,
    ts: ctfNow(),
    legId: ctfId(),
    legIndex: 1,
    setIndex: structure.kind === 'sets' ? 1 : undefined,
  }

  const stored: CTFStoredMatch = {
    id: matchId,
    title,
    createdAt: ctfNow(),
    players: args.players,
    structure,
    config: args.config,
    events: [startEvent, legStartEvent],
    generatedSequence,
  }

  const all = getCTFMatches()
  all.push(stored)
  ctfMatchesCache = all


  // SQLite Dual-Write
  dbSaveCTFMatch({
    id: stored.id,
    title: stored.title,
    createdAt: stored.createdAt,
    finished: false,
    finishedAt: null,
    durationMs: null,
    winnerId: null,
    winnerDarts: null,
    players: stored.players,
    events: stored.events,
    structure: stored.structure,
    config: stored.config,
    generatedSequence: stored.generatedSequence,
  }).catch(err => trackDBError('ctf-save', stored.id, err))

  registerActiveGame({
    id: matchId,
    playerId: args.players[0]?.playerId ?? '',
    gameType: 'ctf',
    title,
    config: { sequenceMode: args.config.sequenceMode },
    players: args.players.map(p => ({ id: p.playerId, name: p.name, color: (p as any).color })),
    startedAt: new Date().toISOString(),
  })

  return stored
}

export function persistCTFEvents(matchId: string, events: CTFEvent[]): Promise<void> {
  const all = getCTFMatches()
  const idx = all.findIndex(m => m.id === matchId)
  if (idx === -1) return Promise.resolve()

  all[idx].events = events
  ctfMatchesCache = all

  return new Promise<void>((resolve) => {
    queueWrite(`ctf-${matchId}`, async () => {
      try { await dbUpdateCTFEvents(matchId, events) }
      catch (err) { trackDBError('ctf-events', matchId, err) }
      resolve()
    })
  })
}

export function finishCTFMatch(
  matchId: string,
  winnerId: string,
  winnerDarts: number,
  durationMs: number
): Promise<void> {
  const all = getCTFMatches()
  const idx = all.findIndex(m => m.id === matchId)
  if (idx === -1) return Promise.resolve()

  all[idx].finished = true
  all[idx].finishedAt = ctfNow()
  all[idx].winnerId = winnerId
  all[idx].winnerDarts = winnerDarts
  all[idx].durationMs = durationMs
  dbDeleteActiveGame(matchId).catch(() => {})

  // Feldpunkte aus Events berechnen und speichern
  const captureFieldPoints: Record<string, number> = {}
  for (const p of (all[idx].players ?? [])) {
    captureFieldPoints[p.playerId] = 0
  }
  for (const ev of (all[idx].events ?? [])) {
    if (ev.type === 'CTFRoundFinished') {
      const rfEv = ev as any
      // fieldPoints aus Event oder retroaktiv berechnen
      let fp = rfEv.fieldPoints as Record<string, number> | undefined
      if (!fp) {
        fp = {}
        const scores = rfEv.scoresByPlayer as Record<string, number>
        if (rfEv.winnerId) {
          for (const pid of Object.keys(scores)) {
            fp[pid] = pid === rfEv.winnerId ? 3 : 0
          }
        } else {
          const maxScore = Math.max(...Object.values(scores))
          for (const [pid, score] of Object.entries(scores)) {
            fp[pid] = (score === maxScore && maxScore > 0) ? 1 : 0
          }
        }
      }
      for (const [pid, pts] of Object.entries(fp)) {
        captureFieldPoints[pid] = (captureFieldPoints[pid] ?? 0) + pts
      }
    }
  }
  all[idx].captureFieldPoints = captureFieldPoints

  ctfMatchesCache = all

  const ctfPids = all[idx].players.map((p: { playerId: string }) => p.playerId)
  if (ctfPids.length > 0) queueStatsRefresh(ctfPids, 'ctf', loadGroup)
  // Invalidate TanStack Query stats cache
  for (const pid of ctfPids) {
    queryClient.invalidateQueries({ queryKey: ['stats', pid] })
  }

  const match = all[idx]
  return new Promise<void>((resolve) => {
    queueWrite(`ctf-${matchId}`, async () => {
      try {
        await dbSaveCTFMatch({
          id: match.id,
          title: match.title || 'Capture the Field – Multiplayer',
          createdAt: match.createdAt,
          finished: true,
          finishedAt: match.finishedAt ?? null,
          durationMs,
          winnerId,
          winnerDarts,
          players: match.players,
          events: match.events,
          structure: match.structure,
          config: match.config,
          generatedSequence: match.generatedSequence,
          captureFieldWinners: match.captureFieldWinners,
          captureTotalScores: match.captureTotalScores,
          captureFieldPoints: match.captureFieldPoints,
        })
      } catch (err) { trackDBError('ctf-finish', matchId, err) }
      resolve()
    })
  })
}

export function deleteCTFMatch(matchId: string) {
  const all = getCTFMatches()
  const filtered = all.filter(m => m.id !== matchId)
  ctfMatchesCache = filtered
  dbDeleteActiveGame(matchId).catch(() => {})

  clearMatchPaused(matchId, 'ctf')
  clearMatchElapsedTime(matchId, 'ctf')
}


/* -------------------------------------------------
   Shanghai Storage
------------------------------------------------- */
import type { ShanghaiStoredMatch, ShanghaiEvent, ShanghaiStructure, ShanghaiMatchConfig } from './types/shanghai'
import type { ShanghaiPlayer } from './types/shanghai'
import { id as shanghaiId, now as shanghaiNow } from './dartsShanghai'

const LS_SHANGHAI = {
  lastOpenMatchId: 'shanghai.lastOpenMatchId.v1',
} as const

let shanghaiMatchesCache: ShanghaiStoredMatch[] | null = null

export function getShanghaiMatches(): ShanghaiStoredMatch[] {
  return shanghaiMatchesCache ?? []
}

export function saveShanghaiMatches(all: ShanghaiStoredMatch[]) {
  shanghaiMatchesCache = all
}

// SQLite-aware Shanghai Matches laden
export async function getShanghaiMatchesAsync(): Promise<ShanghaiStoredMatch[]> {
  try {
    const useSQLite = await ensureDB()
    if (useSQLite) {
      const dbMatches = await dbGetShanghaiMatches()
      const matches = dbMatches as any as ShanghaiStoredMatch[]
      shanghaiMatchesCache = matches
      return matches
    }
  } catch (e) {
    console.warn('[Storage] SQLite Shanghai load failed:', e)
  }
  return getShanghaiMatches()
}

export function getShanghaiMatchById(matchId: string): ShanghaiStoredMatch | null {
  const matches = getShanghaiMatches()
  return matches.find(m => m.id === matchId) ?? null
}

export function getOpenShanghaiMatch(): ShanghaiStoredMatch | undefined {
  const lastId = localStorage.getItem(LS_SHANGHAI.lastOpenMatchId)
  if (!lastId) return undefined
  const matches = getShanghaiMatches()
  const found = matches.find(m => m.id === lastId && !m.finished)
  if (found) return found
  const summary = getOpenMatchSummary('shanghai')
  if (summary) return { id: summary.id, title: summary.title, finished: false } as any
  return undefined
}

export function setLastOpenShanghaiMatchId(matchId: string) {
  localStorage.setItem(LS_SHANGHAI.lastOpenMatchId, matchId)
}

export function createShanghaiMatchShell(args: {
  players: ShanghaiPlayer[]
  structure?: ShanghaiStructure
  config?: ShanghaiMatchConfig
}): ShanghaiStoredMatch {
  const matchId = shanghaiId()
  const structure: ShanghaiStructure = args.structure ?? { kind: 'legs', bestOfLegs: 1 }
  const config: ShanghaiMatchConfig = args.config ?? {}

  // Titel
  let structureLabel = ''
  if (structure.kind === 'legs' && structure.bestOfLegs > 1) {
    const target = Math.ceil(structure.bestOfLegs / 2)
    structureLabel = ` (First to ${target})`
  } else if (structure.kind === 'sets') {
    const target = Math.ceil(structure.bestOfSets / 2)
    structureLabel = ` (First to ${target} Sets)`
  }
  const title = `Shanghai${structureLabel} – ${args.players.map(p => p.name).join(' vs ')}`

  const startEvent: ShanghaiEvent = {
    type: 'ShanghaiMatchStarted',
    eventId: shanghaiId(),
    matchId,
    ts: shanghaiNow(),
    players: args.players,
    structure,
    config,
  }

  const legStartEvent: ShanghaiEvent = {
    type: 'ShanghaiLegStarted',
    eventId: shanghaiId(),
    matchId,
    ts: shanghaiNow(),
    legId: shanghaiId(),
    legIndex: 1,
    setIndex: structure.kind === 'sets' ? 1 : undefined,
  }

  const stored: ShanghaiStoredMatch = {
    id: matchId,
    title,
    createdAt: shanghaiNow(),
    players: args.players,
    structure,
    config,
    events: [startEvent, legStartEvent],
  }

  const all = getShanghaiMatches()
  all.push(stored)
  shanghaiMatchesCache = all


  // SQLite Dual-Write
  dbSaveShanghaiMatch({
    id: stored.id,
    title: stored.title,
    createdAt: stored.createdAt,
    finished: false,
    finishedAt: null,
    durationMs: null,
    winnerId: null,
    winnerDarts: null,
    players: stored.players,
    events: stored.events,
    structure: stored.structure,
    config: stored.config,
  }).catch(err => trackDBError('shanghai-save', stored.id, err))

  registerActiveGame({
    id: matchId,
    playerId: args.players[0]?.playerId ?? '',
    gameType: 'shanghai',
    title,
    config: config,
    players: args.players.map(p => ({ id: p.playerId, name: p.name, color: (p as any).color })),
    startedAt: new Date().toISOString(),
  })

  return stored
}

export function persistShanghaiEvents(matchId: string, events: ShanghaiEvent[]): Promise<void> {
  const all = getShanghaiMatches()
  const idx = all.findIndex(m => m.id === matchId)
  if (idx === -1) return Promise.resolve()

  all[idx].events = events
  shanghaiMatchesCache = all

  return new Promise<void>((resolve) => {
    queueWrite(`shanghai-${matchId}`, async () => {
      try { await dbUpdateShanghaiEvents(matchId, events) }
      catch (err) { trackDBError('shanghai-events', matchId, err) }
      resolve()
    })
  })
}

export function finishShanghaiMatch(
  matchId: string,
  winnerId: string | null,
  winnerDarts: number,
  durationMs: number
): Promise<void> {
  const all = getShanghaiMatches()
  const idx = all.findIndex(m => m.id === matchId)
  if (idx === -1) return Promise.resolve()

  all[idx].finished = true
  all[idx].finishedAt = shanghaiNow()
  all[idx].winnerId = winnerId
  all[idx].winnerDarts = winnerDarts
  all[idx].durationMs = durationMs
  dbDeleteActiveGame(matchId).catch(() => {})

  // Final scores aus letztem LegFinished Event
  const legFinished = all[idx].events.filter((e: any) => e.type === 'ShanghaiLegFinished')
  const lastLeg = legFinished[legFinished.length - 1] as any
  if (lastLeg?.finalScores) {
    all[idx].finalScores = lastLeg.finalScores
  }

  shanghaiMatchesCache = all

  const shanghaiPids = all[idx].players.map((p: { playerId: string }) => p.playerId)
  if (shanghaiPids.length > 0) queueStatsRefresh(shanghaiPids, 'shanghai', loadGroup)
  // Invalidate TanStack Query stats cache
  for (const pid of shanghaiPids) {
    queryClient.invalidateQueries({ queryKey: ['stats', pid] })
  }

  const match = all[idx]
  return new Promise<void>((resolve) => {
    queueWrite(`shanghai-${matchId}`, async () => {
      try {
        await dbSaveShanghaiMatch({
          id: match.id,
          title: match.title || 'Shanghai – Multiplayer',
          createdAt: match.createdAt,
          finished: true,
          finishedAt: match.finishedAt ?? null,
          durationMs,
          winnerId,
          winnerDarts,
          players: match.players,
          events: match.events,
          structure: match.structure,
          config: match.config,
          finalScores: match.finalScores,
          legWins: match.legWins,
          setWins: match.setWins,
        })
      } catch (err) { trackDBError('shanghai-finish', matchId, err) }
      resolve()
    })
  })
}

export function deleteShanghaiMatch(matchId: string) {
  const all = getShanghaiMatches()
  const filtered = all.filter(m => m.id !== matchId)
  shanghaiMatchesCache = filtered
  dbDeleteActiveGame(matchId).catch(() => {})

  clearMatchPaused(matchId, 'shanghai')
  clearMatchElapsedTime(matchId, 'shanghai')
}


/* -------------------------------------------------
   Killer Storage
------------------------------------------------- */
import type {
  KillerPlayer,
  KillerMatchConfig,
  KillerStructure,
  KillerStoredMatch,
  KillerEvent,
  KillerMatchStartedEvent,
  KillerTargetsAssignedEvent,
  KillerLegStartedEvent,
} from './types/killer'
import { id as killerId, now as killerNow, defaultKillerStructure } from './dartsKiller'


let killerMatchesCache: KillerStoredMatch[] | null = null

export function getKillerMatches(): KillerStoredMatch[] {
  return killerMatchesCache ?? []
}

export function saveKillerMatches(all: KillerStoredMatch[]) {
  killerMatchesCache = all
}

// SQLite-aware Killer Matches laden
export async function getKillerMatchesAsync(): Promise<KillerStoredMatch[]> {
  try {
    const useSQLite = await ensureDB()
    if (useSQLite) {
      const dbMatches = await dbGetKillerMatches()
      const matches = dbMatches as any as KillerStoredMatch[]
      killerMatchesCache = matches
      return matches
    }
  } catch (e) {
    console.warn('[Storage] SQLite Killer load failed:', e)
  }
  return getKillerMatches()
}

export function getKillerMatchById(matchId: string): KillerStoredMatch | undefined {
  const matches = getKillerMatches()
  return matches.find(m => m.id === matchId)
}

export function getOpenKillerMatch(): KillerStoredMatch | undefined {
  const matches = getKillerMatches()
  const found = matches.find(m => !m.finished)
  if (found) return found
  const summary = getOpenMatchSummary('killer')
  if (summary) return { id: summary.id, title: summary.title, finished: false } as any
  return undefined
}

export function createKillerMatchShell(
  players: KillerPlayer[],
  config: KillerMatchConfig,
  assignments: { playerId: string; targetNumber: number }[],
  structure?: KillerStructure
): KillerStoredMatch {
  const matchId = killerId()
  const tsNow = killerNow()
  const resolvedStructure = structure ?? defaultKillerStructure()

  const title = `Killer \u00b7 ${players.map(p => p.name).join(', ')}`

  const startEvent: KillerMatchStartedEvent = {
    type: 'KillerMatchStarted',
    eventId: killerId(),
    matchId,
    ts: tsNow,
    players,
    config,
    structure: resolvedStructure,
  }

  const assignEvent: KillerTargetsAssignedEvent = {
    type: 'KillerTargetsAssigned',
    eventId: killerId(),
    matchId,
    ts: tsNow,
    assignments,
  }

  const legStartEvent: KillerLegStartedEvent = {
    type: 'KillerLegStarted',
    eventId: killerId(),
    matchId,
    ts: tsNow,
    legIndex: 0,
    setIndex: 0,
    startingPlayerIndex: 0,
  }

  const stored: KillerStoredMatch = {
    id: matchId,
    title,
    createdAt: tsNow,
    players,
    config,
    events: [startEvent, legStartEvent, assignEvent],
    structure: resolvedStructure,
  }

  const all = getKillerMatches()
  all.push(stored)
  killerMatchesCache = all


  // SQLite Dual-Write
  dbSaveKillerMatch({
    id: stored.id,
    title: stored.title,
    createdAt: stored.createdAt,
    finished: false,
    finishedAt: null,
    durationMs: null,
    winnerId: null,
    winnerDarts: null,
    players: stored.players,
    events: stored.events,
    config: stored.config,
    structure: resolvedStructure,
  }).catch(err => trackDBError('killer-save', stored.id, err))

  registerActiveGame({
    id: matchId,
    playerId: players[0]?.playerId ?? '',
    gameType: 'killer',
    title,
    config: config,
    players: players.map(p => ({ id: p.playerId, name: p.name, color: (p as any).color })),
    startedAt: new Date().toISOString(),
  })

  return stored
}

export function persistKillerEvents(matchId: string, events: KillerEvent[]): Promise<void> {
  const all = getKillerMatches()
  const idx = all.findIndex(m => m.id === matchId)
  if (idx === -1) return Promise.resolve()

  all[idx].events = events
  killerMatchesCache = all

  return new Promise<void>((resolve) => {
    queueWrite(`killer-${matchId}`, async () => {
      try { await dbUpdateKillerEvents(matchId, events) }
      catch (err) { trackDBError('killer-events', matchId, err) }
      resolve()
    })
  })
}

export function finishKillerMatch(
  matchId: string,
  winnerId: string | null,
  finalStandings: { playerId: string; position: number; lives: number }[],
  winnerDarts: number,
  durationMs: number,
  legWins?: Record<string, number>,
  setWins?: Record<string, number>
): Promise<void> {
  const all = getKillerMatches()
  const idx = all.findIndex(m => m.id === matchId)
  if (idx === -1) return Promise.resolve()

  all[idx].finished = true
  all[idx].finishedAt = killerNow()
  all[idx].winnerId = winnerId
  all[idx].winnerDarts = winnerDarts
  all[idx].durationMs = durationMs
  all[idx].finalStandings = finalStandings
  if (legWins) all[idx].legWins = legWins
  if (setWins) all[idx].setWins = setWins

  killerMatchesCache = all
  dbDeleteActiveGame(matchId).catch(() => {})

  const killerPids = all[idx].players.map((p: { playerId: string }) => p.playerId)
  if (killerPids.length > 0) queueStatsRefresh(killerPids, 'killer', loadGroup)
  // Invalidate TanStack Query stats cache
  for (const pid of killerPids) {
    queryClient.invalidateQueries({ queryKey: ['stats', pid] })
  }

  return new Promise<void>((resolve) => {
    queueWrite(`killer-${matchId}`, async () => {
      try { await dbFinishKillerMatch(matchId, winnerId, winnerDarts, durationMs, finalStandings, legWins, setWins) }
      catch (err) { trackDBError('killer-finish', matchId, err) }
      resolve()
    })
  })
}

export function deleteKillerMatch(matchId: string) {
  const all = getKillerMatches()
  const filtered = all.filter(m => m.id !== matchId)
  killerMatchesCache = filtered
  dbDeleteActiveGame(matchId).catch(() => {})
}


export function getKillerInfo(match: KillerStoredMatch): { players: number; winner: string | null; rounds: number } {
  const players = match.players?.length ?? 0
  const winner = match.winnerId
    ? match.players.find(p => p.playerId === match.winnerId)?.name ?? null
    : null
  const rounds = (match.events || []).filter((e: any) => e.type === 'KillerTurnAdded')
    .reduce((max: number, e: any) => Math.max(max, e.roundNumber ?? 0), 0)
  return { players, winner, rounds }
}

/* -------------------------------------------------
   Bob's 27 Storage
------------------------------------------------- */
import type { Bobs27StoredMatch, Bobs27Event, Bobs27Config, Bobs27Target } from './types/bobs27'
import type { Bobs27Player } from './types/bobs27'
import { id as bobs27Id, now as bobs27Now, generateTargets, DEFAULT_CONFIG as BOBS27_DEFAULT_CONFIG, applyBobs27Events } from './dartsBobs27'

const LS_BOBS27 = {
  lastOpenMatchId: 'bobs27.lastOpenMatchId.v1',
} as const

let bobs27MatchesCache: Bobs27StoredMatch[] | null = null

export function getBobs27Matches(): Bobs27StoredMatch[] {
  return bobs27MatchesCache ?? []
}

export function saveBobs27Matches(all: Bobs27StoredMatch[]) {
  bobs27MatchesCache = all
}

// SQLite-aware Bobs27 Matches laden
export async function getBobs27MatchesAsync(): Promise<Bobs27StoredMatch[]> {
  try {
    const useSQLite = await ensureDB()
    if (useSQLite) {
      const dbMatches = await dbGetBobs27Matches()
      const matches = dbMatches as any as Bobs27StoredMatch[]
      bobs27MatchesCache = matches
      return matches
    }
  } catch (e) {
    console.warn('[Storage] SQLite Bobs27 load failed:', e)
  }
  return getBobs27Matches()
}

export function getBobs27MatchById(matchId: string): Bobs27StoredMatch | null {
  const matches = getBobs27Matches()
  return matches.find(m => m.id === matchId) ?? null
}

export function getOpenBobs27Match(): Bobs27StoredMatch | undefined {
  const lastId = localStorage.getItem(LS_BOBS27.lastOpenMatchId)
  if (!lastId) return undefined
  const matches = getBobs27Matches()
  const found = matches.find(m => m.id === lastId && !m.finished)
  if (found) return found
  const summary = getOpenMatchSummary('bobs27')
  if (summary) return { id: summary.id, title: summary.title, finished: false } as any
  return undefined
}

export function setLastOpenBobs27MatchId(matchId: string) {
  localStorage.setItem(LS_BOBS27.lastOpenMatchId, matchId)
}

export function createBobs27MatchShell(args: {
  players: Bobs27Player[]
  config?: Partial<Bobs27Config>
}): Bobs27StoredMatch {
  const matchId = bobs27Id()
  const config: Bobs27Config = {
    ...BOBS27_DEFAULT_CONFIG,
    ...args.config,
  }
  const targets = generateTargets(config)

  const title = `Bob's 27 – ${args.players.map(p => p.name).join(' vs ')}`

  const startEvent: Bobs27Event = {
    type: 'Bobs27MatchStarted',
    eventId: bobs27Id(),
    matchId,
    ts: bobs27Now(),
    players: args.players,
    config,
    targets,
  }

  const stored: Bobs27StoredMatch = {
    id: matchId,
    title,
    createdAt: bobs27Now(),
    players: args.players,
    config,
    targets,
    events: [startEvent],
  }

  const all = getBobs27Matches()
  all.push(stored)
  bobs27MatchesCache = all


  // SQLite Dual-Write
  dbSaveBobs27Match({
    id: stored.id,
    title: stored.title,
    createdAt: stored.createdAt,
    finished: false,
    finishedAt: null,
    durationMs: null,
    winnerId: null,
    winnerDarts: null,
    players: stored.players,
    events: stored.events,
    config: stored.config,
    targets: stored.targets,
  }).catch(err => trackDBError('bobs27-save', stored.id, err))

  registerActiveGame({
    id: matchId,
    playerId: args.players[0]?.playerId ?? '',
    gameType: 'bobs27',
    title,
    config: config,
    players: args.players.map(p => ({ id: p.playerId, name: p.name, color: (p as any).color })),
    startedAt: new Date().toISOString(),
  })

  return stored
}

export function persistBobs27Events(matchId: string, events: Bobs27Event[]): Promise<void> {
  const all = getBobs27Matches()
  const idx = all.findIndex(m => m.id === matchId)
  if (idx === -1) return Promise.resolve()

  all[idx].events = events
  bobs27MatchesCache = all

  return new Promise<void>((resolve) => {
    queueWrite(`bobs27-${matchId}`, async () => {
      try { await dbUpdateBobs27Events(matchId, events) }
      catch (err) { trackDBError('bobs27-events', matchId, err) }
      resolve()
    })
  })
}

export function finishBobs27Match(
  matchId: string,
  winnerId: string | null,
  winnerDarts: number,
  durationMs: number,
  finalScores?: Record<string, number>,
  legWins?: Record<string, number>
): Promise<void> {
  const all = getBobs27Matches()
  const idx = all.findIndex(m => m.id === matchId)
  if (idx === -1) return Promise.resolve()

  all[idx].finished = true
  all[idx].finishedAt = bobs27Now()
  all[idx].winnerId = winnerId
  all[idx].winnerDarts = winnerDarts
  all[idx].durationMs = durationMs
  if (finalScores) all[idx].finalScores = finalScores
  if (legWins) all[idx].legWins = legWins

  bobs27MatchesCache = all
  dbDeleteActiveGame(matchId).catch(() => {})

  const bobs27Pids = all[idx].players.map((p: { playerId: string }) => p.playerId)
  if (bobs27Pids.length > 0) queueStatsRefresh(bobs27Pids, 'bobs27', loadGroup)
  // Invalidate TanStack Query stats cache
  for (const pid of bobs27Pids) {
    queryClient.invalidateQueries({ queryKey: ['stats', pid] })
  }

  const match = all[idx]
  return new Promise<void>((resolve) => {
    queueWrite(`bobs27-${matchId}`, async () => {
      try {
        await dbSaveBobs27Match({
          id: match.id,
          title: match.title || "Bob's 27 – Multiplayer",
          createdAt: match.createdAt,
          finished: true,
          finishedAt: match.finishedAt ?? null,
          durationMs,
          winnerId,
          winnerDarts,
          players: match.players,
          events: match.events,
          config: match.config,
          targets: match.targets,
          finalScores: match.finalScores,
        })
      } catch (err) { trackDBError('bobs27-finish', matchId, err) }
      resolve()
    })
  })
}

export function deleteBobs27Match(matchId: string) {
  const all = getBobs27Matches()
  const filtered = all.filter(m => m.id !== matchId)
  bobs27MatchesCache = filtered
  dbDeleteActiveGame(matchId).catch(() => {})

  clearMatchPaused(matchId, 'bobs27')
  clearMatchElapsedTime(matchId, 'bobs27')
}

/**
 * Repariert Bob's 27 Matches:
 * 1. Events enthalten MatchFinished aber Match-Shell ist nicht finished
 * 2. Kein MatchFinished Event, aber alle Spieler fertig → aus Event-Log rekonstruieren
 * 3. Solo-Matches die finished sind aber winnerId = null haben
 */
export function repairBobs27Matches(): number {
  const all = getBobs27Matches()
  let repaired = 0

  for (const m of all) {
    let needsSave = false

    if (!m.finished) {
      // Fall 1: Events enthalten MatchFinished aber Match-Shell ist nicht finished
      const finishEvent = m.events?.find(e => e.type === 'Bobs27MatchFinished') as any
      if (finishEvent) {
        m.finished = true
        m.finishedAt = finishEvent.ts
        m.winnerId = finishEvent.winnerId ?? null
        m.winnerDarts = finishEvent.totalDarts ?? 0
        m.durationMs = finishEvent.durationMs ?? 0
        m.finalScores = finishEvent.finalScores
        needsSave = true
      } else if (m.events && m.events.length > 1) {
        // Fall 2: Kein MatchFinished aber alle Spieler fertig (eliminiert oder alle Targets durch)
        try {
          const state = applyBobs27Events(m.events)
          if (state.match) {
            const allDone = state.match.players.every(p => {
              const ps = state.playerStates[p.playerId]
              return ps?.finished === true
            })
            if (allDone) {
              const finalScores: Record<string, number> = {}
              for (const p of state.match.players) {
                finalScores[p.playerId] = state.playerStates[p.playerId]?.score ?? 0
              }
              // Ranking: Fortschritt absteigend, dann Score absteigend
              const ranking = state.match.players.map(p => {
                const ps = state.playerStates[p.playerId]
                return {
                  pid: p.playerId,
                  progress: ps?.eliminated ? (ps.eliminatedAtTarget ?? 0) : (ps?.currentTargetIndex ?? 0),
                  score: finalScores[p.playerId] ?? 0,
                }
              }).sort((a, b) => b.progress - a.progress || b.score - a.score)

              let winnerId: string | null = ranking[0]?.pid ?? null
              if (ranking.length > 1 &&
                  ranking[0].progress === ranking[1].progress &&
                  ranking[0].score === ranking[1].score) {
                winnerId = null
              }

              const totalDarts = Object.values(state.playerStates).reduce((s, ps) => s + ps.totalDarts, 0)
              const lastEventTs = m.events[m.events.length - 1]?.ts ?? bobs27Now()

              m.finished = true
              m.finishedAt = lastEventTs
              m.winnerId = winnerId
              m.winnerDarts = totalDarts
              m.durationMs = m.durationMs ?? 0
              m.finalScores = finalScores
              needsSave = true
              console.debug(`[Storage] Repaired Bob's 27 match ${m.id} from event log (no MatchFinished event)`)
            }
          }
        } catch (e) {
          console.warn(`[Storage] Failed to replay Bob's 27 events for ${m.id}:`, e)
        }
      }
    }

    // Fall 3: Solo-Match ist finished aber winnerId ist null → Solo-Spieler ist Winner
    if (m.finished && !m.winnerId && m.players?.length === 1) {
      m.winnerId = m.players[0].playerId
      needsSave = true
    }

    if (!needsSave) continue

    // SQLite Dual-Write
    dbSaveBobs27Match({
      id: m.id,
      title: m.title,
      createdAt: m.createdAt,
      finished: true,
      finishedAt: m.finishedAt ?? null,
      durationMs: m.durationMs ?? 0,
      winnerId: m.winnerId ?? null,
      winnerDarts: m.winnerDarts ?? 0,
      players: m.players,
      events: m.events,
      config: m.config,
      targets: m.targets,
      finalScores: m.finalScores,
    }).catch(err => trackDBError('bobs27-repair', m.id, err))

    repaired++
  }

  if (repaired > 0) {
    bobs27MatchesCache = all
    console.debug(`[Storage] Repaired ${repaired} Bob's 27 match(es)`)
  }
  return repaired
}


/* -------------------------------------------------
   Operation Storage
------------------------------------------------- */
import type { OperationStoredMatch, OperationEvent, OperationConfig, OperationPlayer } from './types/operation'
import { id as operationId, now as operationNow } from './dartsOperation'

const LS_OPERATION = {
  lastOpenMatchId: 'operation.lastOpenMatchId.v1',
} as const

let operationMatchesCache: OperationStoredMatch[] | null = null

export function getOperationMatches(): OperationStoredMatch[] {
  return operationMatchesCache ?? []
}

export function saveOperationMatches(all: OperationStoredMatch[]) {
  operationMatchesCache = all
}

// SQLite-aware Operation Matches laden
export async function getOperationMatchesAsync(): Promise<OperationStoredMatch[]> {
  try {
    const useSQLite = await ensureDB()
    if (useSQLite) {
      const dbMatches = await dbGetOperationMatches()
      const matches = dbMatches as any as OperationStoredMatch[]
      operationMatchesCache = matches
      return matches
    }
  } catch (e) {
    console.warn('[Storage] SQLite Operation load failed:', e)
  }
  return getOperationMatches()
}

export function getOperationMatchById(matchId: string): OperationStoredMatch | null {
  const matches = getOperationMatches()
  return matches.find(m => m.id === matchId) ?? null
}

export function getOpenOperationMatch(): OperationStoredMatch | undefined {
  const lastId = localStorage.getItem(LS_OPERATION.lastOpenMatchId)
  if (!lastId) return undefined
  const matches = getOperationMatches()
  const found = matches.find(m => m.id === lastId && !m.finished)
  if (found) return found
  const summary = getOpenMatchSummary('operation')
  if (summary) return { id: summary.id, title: summary.title, finished: false } as any
  return undefined
}

export function setLastOpenOperationMatchId(matchId: string) {
  localStorage.setItem(LS_OPERATION.lastOpenMatchId, matchId)
}

export function createOperationMatchShell(args: {
  players: OperationPlayer[]
  config: OperationConfig
}): OperationStoredMatch {
  const matchId = operationId()
  const config = args.config

  const title = `Operation – ${args.players.map(p => p.name).join(' vs ')}`

  const startEvent: OperationEvent = {
    type: 'OperationMatchStarted',
    eventId: operationId(),
    matchId,
    ts: operationNow(),
    players: args.players,
    config,
  }

  const stored: OperationStoredMatch = {
    id: matchId,
    title,
    createdAt: operationNow(),
    players: args.players,
    config,
    events: [startEvent],
  }

  const all = getOperationMatches()
  all.push(stored)
  operationMatchesCache = all


  // SQLite Dual-Write
  dbSaveOperationMatch({
    id: stored.id,
    title: stored.title,
    createdAt: stored.createdAt,
    finished: false,
    finishedAt: null,
    durationMs: null,
    winnerId: null,
    winnerDarts: null,
    legsCount: config.legsCount,
    targetMode: config.targetMode,
    players: stored.players,
    events: stored.events,
    config: stored.config,
  }).catch(err => trackDBError('operation-save', stored.id, err))

  registerActiveGame({
    id: matchId,
    playerId: args.players[0]?.playerId ?? '',
    gameType: 'operation',
    title,
    config: config,
    players: args.players.map(p => ({ id: p.playerId, name: p.name, color: (p as any).color })),
    startedAt: new Date().toISOString(),
  })

  return stored
}

export function persistOperationEvents(matchId: string, events: OperationEvent[]): Promise<void> {
  const all = getOperationMatches()
  const idx = all.findIndex(m => m.id === matchId)
  if (idx === -1) return Promise.resolve()

  all[idx].events = events
  operationMatchesCache = all

  return new Promise<void>((resolve) => {
    queueWrite(`operation-${matchId}`, async () => {
      try { await dbUpdateOperationEvents(matchId, events) }
      catch (err) { trackDBError('operation-events', matchId, err) }
      resolve()
    })
  })
}

export function finishOperationMatch(
  matchId: string,
  winnerId: string | null,
  durationMs: number,
  finalScores?: Record<string, number>,
  legWins?: Record<string, number>
): Promise<void> {
  const all = getOperationMatches()
  const idx = all.findIndex(m => m.id === matchId)
  if (idx === -1) return Promise.resolve()

  all[idx].finished = true
  all[idx].finishedAt = operationNow()
  all[idx].winnerId = winnerId
  all[idx].durationMs = durationMs
  if (finalScores) all[idx].finalScores = finalScores
  if (legWins) all[idx].legWins = legWins

  operationMatchesCache = all
  dbDeleteActiveGame(matchId).catch(() => {})

  const opPids = all[idx].players.map((p: { playerId: string }) => p.playerId)
  if (opPids.length > 0) queueStatsRefresh(opPids, 'operation', loadGroup)
  // Invalidate TanStack Query stats cache
  for (const pid of opPids) {
    queryClient.invalidateQueries({ queryKey: ['stats', pid] })
  }

  const match = all[idx]
  return new Promise<void>((resolve) => {
    queueWrite(`operation-${matchId}`, async () => {
      try {
        await dbSaveOperationMatch({
          id: match.id,
          title: match.title || 'Operation – Multiplayer',
          createdAt: match.createdAt,
          finished: true,
          finishedAt: match.finishedAt ?? null,
          durationMs: match.durationMs ?? null,
          winnerId: match.winnerId ?? null,
          winnerDarts: null,
          legsCount: match.config.legsCount,
          targetMode: match.config.targetMode,
          players: match.players,
          events: match.events,
          config: match.config,
          finalScores: match.finalScores,
          legWins: match.legWins,
        })
      } catch (err) { trackDBError('operation-finish', matchId, err) }
      resolve()
    })
  })
}

export function deleteOperationMatch(matchId: string) {
  const all = getOperationMatches()
  const filtered = all.filter(m => m.id !== matchId)
  operationMatchesCache = filtered
  dbDeleteActiveGame(matchId).catch(() => {})

  clearMatchPaused(matchId, 'operation')
  clearMatchElapsedTime(matchId, 'operation')
}

/**
 * Repariert Operation Matches:
 * 1. Events enthalten MatchFinished aber Match-Shell ist nicht finished
 * 2. Solo-Matches die finished sind aber winnerId = null haben
 */
export function repairOperationMatches(): number {
  const all = getOperationMatches()
  let repaired = 0

  for (const m of all) {
    let needsSave = false

    // Fall 1: Events enthalten MatchFinished aber Match nicht als finished markiert
    if (!m.finished) {
      const finishEvent = m.events?.find(e => e.type === 'OperationMatchFinished') as any
      if (!finishEvent) continue

      m.finished = true
      m.finishedAt = finishEvent.ts
      m.winnerId = finishEvent.winnerId ?? null
      m.durationMs = finishEvent.durationMs ?? 0
      m.finalScores = finishEvent.finalScores
      m.legWins = finishEvent.legWins
      needsSave = true
    }

    // Fall 2: Solo-Match ist finished aber winnerId ist null → Solo-Spieler ist Winner
    if (m.finished && !m.winnerId && m.players?.length === 1) {
      m.winnerId = m.players[0].playerId
      needsSave = true
    }

    if (!needsSave) continue

    // SQLite Dual-Write
    dbSaveOperationMatch({
      id: m.id,
      title: m.title,
      createdAt: m.createdAt,
      finished: true,
      finishedAt: m.finishedAt ?? null,
      durationMs: m.durationMs ?? null,
      winnerId: m.winnerId ?? null,
      winnerDarts: null,
      legsCount: m.config?.legsCount ?? 1,
      targetMode: m.config?.targetMode ?? 'RANDOM_NUMBER',
      players: m.players,
      events: m.events,
      config: m.config,
      finalScores: m.finalScores,
      legWins: m.legWins,
    }).catch(err => trackDBError('operation-repair', m.id, err))

    repaired++
  }

  if (repaired > 0) {
    operationMatchesCache = all
    console.debug(`[Storage] Repaired ${repaired} Operation match(es)`)
  }
  return repaired
}


/* -------------------------------------------------
   Migration: ATB Capture/Pirate → CTF
------------------------------------------------- */

/**
 * Baut eine Map von ATBTurnAdded.eventId → captureScore auf,
 * indem die scoresByPlayer aus dem nächsten ATBCaptureRoundFinished/ATBPirateRoundFinished
 * Event für jeden pendenden Turn zugeordnet werden.
 */
function buildCaptureScoreMap(events: ATBEvent[]): Map<string, number> {
  const scores = new Map<string, number>()
  const pendingTurns: { eventId: string; playerId: string }[] = []

  for (const ev of events) {
    if (ev.type === 'ATBTurnAdded') {
      pendingTurns.push({ eventId: ev.eventId, playerId: ev.playerId })
    } else if (ev.type === 'ATBCaptureRoundFinished' || ev.type === 'ATBPirateRoundFinished') {
      for (const turn of pendingTurns) {
        scores.set(turn.eventId, ev.scoresByPlayer[turn.playerId] ?? 0)
      }
      pendingTurns.length = 0
    }
  }

  return scores
}

function convertATBEventsToCTF(events: ATBEvent[]): CTFEvent[] {
  const captureScores = buildCaptureScoreMap(events)
  const ctfEvents: CTFEvent[] = []

  for (const ev of events) {
    switch (ev.type) {
      case 'ATBMatchStarted': {
        const cfg = ev.config
        ctfEvents.push({
          type: 'CTFMatchStarted',
          eventId: ev.eventId,
          matchId: ev.matchId,
          ts: ev.ts,
          players: ev.players.map(p => ({ playerId: p.playerId, name: p.name, isGuest: p.isGuest })),
          structure: ev.structure.kind === 'legs'
            ? { kind: 'legs', bestOfLegs: ev.structure.bestOfLegs }
            : { kind: 'sets', bestOfSets: ev.structure.bestOfSets, legsPerSet: ev.structure.legsPerSet },
          config: {
            multiplierMode: (cfg?.multiplierMode ?? 'standard') as CTFMultiplierMode,
            rotateOrder: true,
            bullPosition: cfg?.bullPosition,
          },
          generatedSequence: ev.generatedSequence?.map(t => ({ number: t.number })) ?? [],
        })
        break
      }

      case 'ATBLegStarted':
        ctfEvents.push({
          type: 'CTFLegStarted',
          eventId: ev.eventId,
          matchId: ev.matchId,
          ts: ev.ts,
          legId: ev.legId,
          legIndex: ev.legIndex,
          setIndex: ev.setIndex,
          newSequence: ev.newExtendedSequence?.map(t => ({ number: t.number })),
        })
        break

      case 'ATBTurnAdded':
        ctfEvents.push({
          type: 'CTFTurnAdded',
          eventId: ev.eventId,
          matchId: ev.matchId,
          legId: ev.legId,
          ts: ev.ts,
          playerId: ev.playerId,
          darts: ev.darts.map(d => ({ target: d.target, mult: d.mult })),
          captureScore: captureScores.get(ev.eventId) ?? 0,
        })
        break

      case 'ATBCaptureRoundFinished':
      case 'ATBPirateRoundFinished':
        ctfEvents.push({
          type: 'CTFRoundFinished',
          eventId: ev.eventId,
          matchId: ev.matchId,
          legId: ev.legId,
          ts: ev.ts,
          fieldIndex: ev.fieldIndex,
          fieldNumber: ev.fieldNumber,
          scoresByPlayer: ev.scoresByPlayer,
          winnerId: ev.winnerId,
          fieldPoints: calculateFieldPoints(ev.scoresByPlayer, ev.winnerId),
        })
        break

      case 'ATBLegFinished':
        ctfEvents.push({
          type: 'CTFLegFinished',
          eventId: ev.eventId,
          matchId: ev.matchId,
          legId: ev.legId,
          ts: ev.ts,
          winnerId: ev.winnerId,
          winnerDarts: ev.winnerDarts,
        })
        break

      case 'ATBSetFinished':
        ctfEvents.push({
          type: 'CTFSetFinished',
          eventId: ev.eventId,
          matchId: ev.matchId,
          ts: ev.ts,
          setIndex: ev.setIndex,
          winnerId: ev.winnerId,
        })
        break

      case 'ATBMatchFinished':
        ctfEvents.push({
          type: 'CTFMatchFinished',
          eventId: ev.eventId,
          matchId: ev.matchId,
          ts: ev.ts,
          winnerId: ev.winnerId,
          totalDarts: ev.totalDarts,
          durationMs: ev.durationMs,
        })
        break
    }
  }

  return ctfEvents
}

function convertATBMatchToCTF(atbMatch: ATBStoredMatch): CTFStoredMatch {
  // Config kann auf dem Match-Objekt ODER im ATBMatchStarted-Event stecken
  const startEvent = (atbMatch.events || []).find((e: any) => e.type === 'ATBMatchStarted') as any
  const cfg = atbMatch.config ?? startEvent?.config

  const ctfConfig: CTFMatchConfig = {
    multiplierMode: (cfg?.multiplierMode ?? 'standard') as CTFMultiplierMode,
    rotateOrder: true,
    bullPosition: cfg?.bullPosition,
  }

  const ctfStructure: CTFStructure = atbMatch.structure.kind === 'legs'
    ? { kind: 'legs', bestOfLegs: atbMatch.structure.bestOfLegs }
    : { kind: 'sets', bestOfSets: atbMatch.structure.bestOfSets, legsPerSet: atbMatch.structure.legsPerSet }

  const ctfPlayers: CTFPlayer[] = atbMatch.players.map(p => ({
    playerId: p.playerId,
    name: p.name,
    isGuest: p.isGuest,
  }))

  return {
    id: atbMatch.id,
    title: atbMatch.title,
    createdAt: atbMatch.createdAt,
    players: ctfPlayers,
    structure: ctfStructure,
    config: ctfConfig,
    events: convertATBEventsToCTF(atbMatch.events),
    generatedSequence: atbMatch.generatedSequence?.map(t => ({ number: t.number })),
    finished: atbMatch.finished,
    finishedAt: atbMatch.finishedAt,
    durationMs: atbMatch.durationMs,
    winnerId: atbMatch.winnerId,
    winnerDarts: atbMatch.winnerDarts,
    legWins: atbMatch.legWins,
    setWins: atbMatch.setWins,
    captureFieldWinners: atbMatch.captureFieldWinners,
    captureTotalScores: atbMatch.captureTotalScores,
  }
}

/**
 * Migriert alle fertigen ATB Capture/Pirate Matches nach CTF-Storage.
 * Wird einmal beim App-Start ausgeführt, dann per Flag übersprungen.
 */
export function migrateATBCaptureMatchesToCTF(): void {
  if (localStorage.getItem('ctf.migrated.v2') === 'true') return

  const atbMatches = getATBMatches()

  // GameMode kann auf m.config ODER im ATBMatchStarted-Event stecken
  function isCaptureMatch(m: ATBStoredMatch): boolean {
    const gm = m.config?.gameMode
    if (gm === 'capture' || gm === 'pirate') return true
    // Fallback: ATBMatchStarted-Event prüfen
    const startEvent = (m.events || []).find((e: any) => e.type === 'ATBMatchStarted') as any
    const evGm = startEvent?.config?.gameMode
    return evGm === 'capture' || evGm === 'pirate'
  }

  // Alle Capture/Pirate Matches (fertige + unbeendete)
  const allCapture = atbMatches.filter(isCaptureMatch)
  const finishedCapture = allCapture.filter(m => m.finished)
  const unfinishedCapture = allCapture.filter(m => !m.finished)

  if (allCapture.length === 0) {
    localStorage.setItem('ctf.migrated.v2', 'true')
    return
  }

  console.debug(`[Migration v2] Found ${finishedCapture.length} finished + ${unfinishedCapture.length} unfinished Capture/Pirate matches`)

  const ctfMatches = getCTFMatches()
  const removeFromATB: string[] = []

  // Fertige Matches nach CTF migrieren
  for (const atbMatch of finishedCapture) {
    try {
      // Idempotent: Skip wenn bereits in CTF vorhanden
      if (ctfMatches.some(m => m.id === atbMatch.id)) {
        removeFromATB.push(atbMatch.id)
        continue
      }
      const ctfStored = convertATBMatchToCTF(atbMatch)
      ctfMatches.push(ctfStored)
      removeFromATB.push(atbMatch.id)
    } catch (err) {
      console.error(`[Migration] Failed to migrate match ${atbMatch.id}:`, err)
    }
  }

  // Unbeendete Capture/Pirate Matches löschen (können nicht fortgesetzt werden)
  for (const m of unfinishedCapture) {
    removeFromATB.push(m.id)
  }

  if (removeFromATB.length > 0) {
    // CTF-Matches im Cache speichern
    ctfMatchesCache = ctfMatches

    // Migrierte + unbeendete Matches aus ATB-Cache entfernen
    const remainingATB = atbMatches.filter(m => !removeFromATB.includes(m.id))
    atbMatchesCache = remainingATB

    console.debug(`[Migration v2] Migrated ${finishedCapture.length}, deleted ${unfinishedCapture.length} unfinished`)
  }

  localStorage.setItem('ctf.migrated.v2', 'true')
}

/* -------------------------------------------------
   Cleanup: Unbeendete Spiele nach 100 Stunden löschen
------------------------------------------------- */

const STALE_MATCH_THRESHOLD_MS = 100 * 60 * 60 * 1000 // 100 Stunden

/**
 * Löscht unbeendete Spiele aller Spieltypen, die älter als 100 Stunden sind.
 * Wird beim App-Start ausgeführt.
 */
export function cleanupStaleUnfinishedMatches(): void {
  const cutoff = Date.now() - STALE_MATCH_THRESHOLD_MS
  let totalDeleted = 0

  function isStale(createdAt: string | undefined, finished: boolean | undefined): boolean {
    if (finished) return false
    if (!createdAt) return false
    return new Date(createdAt).getTime() < cutoff
  }

  // X01
  {
    const all = getMatches()
    const filtered = all.filter(m => !isStale(m.createdAt, m.finished))
    if (filtered.length < all.length) {
      const deleted = all.length - filtered.length
      totalDeleted += deleted
      saveMatches(filtered)
      console.debug(`[Cleanup] Deleted ${deleted} stale X01 matches`)
    }
  }

  // Cricket
  {
    const all = getCricketMatches()
    const filtered = all.filter(m => !isStale(m.createdAt, m.finished))
    if (filtered.length < all.length) {
      const deleted = all.length - filtered.length
      totalDeleted += deleted
      saveCricketMatches(filtered)
      console.debug(`[Cleanup] Deleted ${deleted} stale Cricket matches`)
    }
  }

  // ATB
  {
    const all = getATBMatches()
    const filtered = all.filter(m => !isStale(m.createdAt, m.finished))
    if (filtered.length < all.length) {
      const deleted = all.length - filtered.length
      totalDeleted += deleted
      atbMatchesCache = filtered
      console.debug(`[Cleanup] Deleted ${deleted} stale ATB matches`)
    }
  }

  // Sträußchen
  {
    const all = getStrMatches()
    const filtered = all.filter(m => !isStale(m.createdAt, m.finished))
    if (filtered.length < all.length) {
      const deleted = all.length - filtered.length
      totalDeleted += deleted
      strMatchesCache = filtered
      console.debug(`[Cleanup] Deleted ${deleted} stale Sträußchen matches`)
    }
  }

  // CTF
  {
    const all = getCTFMatches()
    const filtered = all.filter(m => !isStale(m.createdAt, m.finished))
    if (filtered.length < all.length) {
      const deleted = all.length - filtered.length
      totalDeleted += deleted
      ctfMatchesCache = filtered
      console.debug(`[Cleanup] Deleted ${deleted} stale CTF matches`)
    }
  }

  // Highscore
  {
    const all = getHighscoreMatches()
    const filtered = all.filter(m => !isStale(m.createdAt, m.finished))
    if (filtered.length < all.length) {
      const deleted = all.length - filtered.length
      totalDeleted += deleted
      highscoreMatchesCache = filtered
      console.debug(`[Cleanup] Deleted ${deleted} stale Highscore matches`)
    }
  }

  // Shanghai
  {
    const all = getShanghaiMatches()
    const filtered = all.filter(m => !isStale(m.createdAt, m.finished))
    if (filtered.length < all.length) {
      const deleted = all.length - filtered.length
      totalDeleted += deleted
      shanghaiMatchesCache = filtered
      console.debug(`[Cleanup] Deleted ${deleted} stale Shanghai matches`)
    }
  }

  // Killer
  {
    const all = getKillerMatches()
    const filtered = all.filter(m => !isStale(m.createdAt, m.finished))
    if (filtered.length < all.length) {
      const deleted = all.length - filtered.length
      totalDeleted += deleted
      killerMatchesCache = filtered
      console.debug(`[Cleanup] Deleted ${deleted} stale Killer matches`)
    }
  }

  // Bob's 27
  {
    const all = getBobs27Matches()
    const filtered = all.filter(m => !isStale(m.createdAt, m.finished))
    if (filtered.length < all.length) {
      const deleted = all.length - filtered.length
      totalDeleted += deleted
      bobs27MatchesCache = filtered
      console.debug(`[Cleanup] Deleted ${deleted} stale Bob's 27 matches`)
    }
  }

  // Operation
  {
    const all = getOperationMatches()
    const filtered = all.filter(m => !isStale(m.createdAt, m.finished))
    if (filtered.length < all.length) {
      const deleted = all.length - filtered.length
      totalDeleted += deleted
      operationMatchesCache = filtered
      console.debug(`[Cleanup] Deleted ${deleted} stale Operation matches`)
    }
  }

  if (totalDeleted > 0) {
    console.debug(`[Cleanup] Total: ${totalDeleted} stale unfinished matches deleted`)
  }
}

/**
 * Zählt alle offenen (nicht-beendeten) Matches über alle Spielmodi.
 */
export function countOpenMatches(): number {
  // Count from active_games cache (source of truth since architecture update)
  return activeGamesCache.length
}

// Async version that counts directly from DB (more accurate)
export async function countOpenMatchesFromDB(): Promise<number> {
  try {
    const tables = ['x01', 'cricket', 'atb', 'str', 'highscore', 'ctf', 'shanghai', 'killer', 'bobs27', 'operation']
    let total = 0
    for (const table of tables) {
      try {
        const rows = await query<any>(`SELECT COUNT(*) as cnt FROM ${table}_matches WHERE finished = 0 OR finished IS NULL`, [])
        total += Number(rows[0]?.cnt ?? 0)
      } catch {}
    }
    // Also count active_games entries
    try {
      const rows = await query<any>('SELECT COUNT(*) as cnt FROM active_games', [])
      total = Math.max(total, Number(rows[0]?.cnt ?? 0))
    } catch {}
    return total
  } catch { return 0 }
}

/**
 * Löscht ALLE offenen (nicht-beendeten) Matches über alle Spielmodi.
 * Gibt die Anzahl gelöschter Matches zurück.
 */
export async function deleteAllOpenMatches(): Promise<number> {
  let deleted = 0
  const tables = ['x01', 'cricket', 'atb', 'str', 'highscore', 'ctf', 'shanghai', 'killer', 'bobs27', 'operation']

  // Memory cache cleanup
  const x01 = getMatches(); const x01f = x01.filter(m => m.finished); deleted += x01.length - x01f.length; saveMatches(x01f)
  const cr = getCricketMatches(); const crf = cr.filter(m => m.finished); deleted += cr.length - crf.length; saveCricketMatches(crf)
  const atb = getATBMatches(); const atbf = atb.filter(m => (m as any).finished); deleted += atb.length - atbf.length; saveATBMatches(atbf)
  const str = getStrMatches(); const strf = str.filter(m => (m as any).finished); deleted += str.length - strf.length; saveStrMatches(strf)
  const hs = getHighscoreMatches(); const hsf = hs.filter(m => (m as any).finished); deleted += hs.length - hsf.length; saveHighscoreMatches(hsf)
  const ctf = getCTFMatches(); const ctff = ctf.filter(m => (m as any).finished); deleted += ctf.length - ctff.length; saveCTFMatches(ctff)
  const sh = getShanghaiMatches(); const shf = sh.filter(m => (m as any).finished); deleted += sh.length - shf.length; saveShanghaiMatches(shf)
  const ki = getKillerMatches(); const kif = ki.filter(m => (m as any).finished); deleted += ki.length - kif.length; saveKillerMatches(kif)
  const b27 = getBobs27Matches(); const b27f = b27.filter(m => (m as any).finished); deleted += b27.length - b27f.length; saveBobs27Matches(b27f)
  const op = getOperationMatches(); const opf = op.filter(m => (m as any).finished); deleted += op.length - opf.length; saveOperationMatches(opf)

  // Delete from DB — all 10 game modes
  let dbDeleted = 0
  for (const table of tables) {
    try {
      await exec(`DELETE FROM ${table}_events WHERE match_id IN (SELECT id FROM ${table}_matches WHERE finished = 0 OR finished IS NULL)`)
      await exec(`DELETE FROM ${table}_match_players WHERE match_id IN (SELECT id FROM ${table}_matches WHERE finished = 0 OR finished IS NULL)`)
      await exec(`DELETE FROM ${table}_matches WHERE finished = 0 OR finished IS NULL`)
      dbDeleted++
      console.log(`[deleteAllOpenMatches] Cleaned ${table}`)
    } catch (err: any) {
      console.error(`[deleteAllOpenMatches] FAILED for ${table}:`, err?.message ?? err)
    }
  }

  // Clear active_games table + cache
  try {
    await exec('DELETE FROM active_games')
    console.log('[deleteAllOpenMatches] Cleared active_games')
  } catch (err: any) {
    console.error('[deleteAllOpenMatches] active_games failed:', err?.message ?? err)
  }
  activeGamesCache = []

  return Math.max(deleted, dbDeleted)
}

/* -------------------------------------------------
   Highscore (HS) Storage
------------------------------------------------- */
import type {
  HighscoreStoredMatch,
  HighscorePlayer,
  HighscoreStructure,
  HighscoreEvent,
} from './types/highscore'
import {
  id as hsId,
  now as hsNow,
  createHighscoreMatchStartedEvent,
  createHighscoreLegStartedEvent,
} from './dartsHighscore'

const LS_HIGHSCORE = {
  lastOpenMatchId: 'highscore.lastOpenMatchId.v1',
} as const

let highscoreMatchesCache: HighscoreStoredMatch[] | null = null

export function getHighscoreMatches(): HighscoreStoredMatch[] {
  return highscoreMatchesCache ?? []
}

export function saveHighscoreMatches(all: HighscoreStoredMatch[]) {
  highscoreMatchesCache = all
}

// SQLite-aware Highscore Matches laden
export async function getHighscoreMatchesAsync(): Promise<HighscoreStoredMatch[]> {
  try {
    const useSQLite = await ensureDB()
    if (useSQLite) {
      const dbMatches = await dbGetHighscoreMatches()
      const matches = dbMatches as any as HighscoreStoredMatch[]
      highscoreMatchesCache = matches
      return matches
    }
  } catch (e) {
    console.warn('[Storage] SQLite Highscore load failed:', e)
  }
  return getHighscoreMatches()
}

export function getHighscoreMatchById(matchId: string): HighscoreStoredMatch | null {
  const matches = getHighscoreMatches()
  return matches.find(m => m.id === matchId) ?? null
}

export function getOpenHighscoreMatch(): HighscoreStoredMatch | undefined {
  const lastId = localStorage.getItem(LS_HIGHSCORE.lastOpenMatchId)
  if (!lastId) return undefined
  const matches = getHighscoreMatches()
  const found = matches.find(m => m.id === lastId && !m.finished)
  if (found) return found
  const summary = getOpenMatchSummary('highscore')
  if (summary) return { id: summary.id, title: summary.title, finished: false } as any
  return undefined
}

export function setLastOpenHighscoreMatchId(matchId: string) {
  localStorage.setItem(LS_HIGHSCORE.lastOpenMatchId, matchId)
}

export function createHighscoreMatchShell(args: {
  players: HighscorePlayer[]
  targetScore: number
  structure?: HighscoreStructure
}): HighscoreStoredMatch {
  const structure: HighscoreStructure = args.structure ?? { kind: 'legs', targetLegs: 1 }

  // Titel mit Legs/Sets Info
  let structureLabel = ''
  if (structure.kind === 'legs' && structure.targetLegs > 1) {
    structureLabel = ` (First to ${structure.targetLegs})`
  } else if (structure.kind === 'sets') {
    structureLabel = ` (First to ${structure.targetSets} Sets)`
  }

  const title = `Highscore ${args.targetScore}${structureLabel} – ${args.players.map(p => p.name).join(' vs ')}`

  const startEvent = createHighscoreMatchStartedEvent(args.players, args.targetScore, structure)
  const legStartEvent = createHighscoreLegStartedEvent(0, structure.kind === 'sets' ? 0 : undefined, 0)

  const stored: HighscoreStoredMatch = {
    id: startEvent.matchId,
    title,
    createdAt: new Date().toISOString(),
    players: args.players,
    targetScore: args.targetScore,
    structure,
    events: [startEvent, legStartEvent],
  }

  const all = getHighscoreMatches()
  all.push(stored)
  highscoreMatchesCache = all


  // SQLite Dual-Write
  const dbMatch: DBHighscoreMatch = {
    id: stored.id,
    title: stored.title,
    createdAt: stored.createdAt,
    finished: false,
    finishedAt: null,
    durationMs: null,
    winnerId: null,
    winnerDarts: null,
    targetScore: stored.targetScore,
    players: stored.players,
    events: stored.events as any[],
    structure: stored.structure,
  }
  dbSaveHighscoreMatch(dbMatch).catch(err => trackDBError('highscore-create', stored.id, err))

  registerActiveGame({
    id: stored.id,
    playerId: args.players[0]?.id ?? '',
    gameType: 'highscore',
    title,
    config: { targetScore: args.targetScore },
    players: args.players.map(p => ({ id: p.id, name: p.name, color: (p as any).color })),
    startedAt: new Date().toISOString(),
  })

  return stored
}

export function persistHighscoreEvents(matchId: string, events: HighscoreEvent[]): Promise<void> {
  const all = getHighscoreMatches()
  const idx = all.findIndex(m => m.id === matchId)
  if (idx === -1) return Promise.resolve()

  all[idx].events = events
  highscoreMatchesCache = all

  return new Promise<void>((resolve) => {
    queueWrite(`highscore-${matchId}`, async () => {
      try { await dbUpdateHighscoreEvents(matchId, events as any[]) }
      catch (err) { trackDBError('highscore-events', matchId, err) }
      resolve()
    })
  })
}

export function finishHighscoreMatch(
  matchId: string,
  winnerId: string,
  winnerDarts: number,
  durationMs: number,
  legWins?: Record<string, number>,
  setWins?: Record<string, number>
): Promise<void> {
  const all = getHighscoreMatches()
  const idx = all.findIndex(m => m.id === matchId)
  if (idx === -1) return Promise.resolve()

  all[idx].finished = true
  all[idx].finishedAt = new Date().toISOString()
  all[idx].winnerId = winnerId
  all[idx].winnerDarts = winnerDarts
  all[idx].durationMs = durationMs
  if (legWins) all[idx].legWins = legWins
  if (setWins) all[idx].setWins = setWins
  highscoreMatchesCache = all
  dbDeleteActiveGame(matchId).catch(() => {})

  const hsPids = all[idx].players.map((p: { id: string }) => p.id)
  if (hsPids.length > 0) queueStatsRefresh(hsPids, 'highscore', loadGroup)
  // Invalidate TanStack Query stats cache
  for (const pid of hsPids) {
    queryClient.invalidateQueries({ queryKey: ['stats', pid] })
  }

  return new Promise<void>((resolve) => {
    queueWrite(`highscore-${matchId}`, async () => {
      try { await dbFinishHighscoreMatch(matchId, winnerId, winnerDarts, durationMs, legWins, setWins) }
      catch (err) { trackDBError('highscore-finish', matchId, err) }
      resolve()
    })
  })
}

export function deleteHighscoreMatch(matchId: string) {
  const all = getHighscoreMatches()
  const filtered = all.filter(m => m.id !== matchId)
  highscoreMatchesCache = filtered
  dbDeleteActiveGame(matchId).catch(() => {})

  clearMatchPaused(matchId, 'highscore')
  clearMatchElapsedTime(matchId, 'highscore')
}


// ============================================================
// Spielerfarben-Hintergrund Einstellung
// ============================================================

const PLAYER_COLOR_BG_KEY = 'darts.playerColorBackground'

/**
 * Prüft ob der Spielerfarben-Hintergrund aktiviert ist.
 * Default: true (aktiviert)
 */
export function getPlayerColorBackgroundEnabled(): boolean {
  return localStorage.getItem(PLAYER_COLOR_BG_KEY) !== 'false'
}

/**
 * Setzt die Einstellung für Spielerfarben-Hintergrund.
 */
export function setPlayerColorBackgroundEnabled(enabled: boolean): void {
  localStorage.setItem(PLAYER_COLOR_BG_KEY, enabled ? 'true' : 'false')
}

/* -------------------------------------------------
   Checkout Trainer Storage (Memory Cache only)
------------------------------------------------- */
import type { CheckoutTrainerEvent } from './dartsCheckoutTrainer'
import { id as ctId, now as ctNow, generateCheckoutList } from './dartsCheckoutTrainer'

export type CheckoutTrainerStoredMatch = {
  id: string
  title: string
  createdAt: string
  finished?: boolean
  playerId: string
  playerName: string
  events: CheckoutTrainerEvent[]
  targetCount: number
  /** Multiplayer: Alle Spieler */
  players?: { playerId: string; name: string }[]
}

let checkoutTrainerCache: CheckoutTrainerStoredMatch[] | null = null

export function getCheckoutTrainerMatches(): CheckoutTrainerStoredMatch[] {
  return checkoutTrainerCache ?? []
}

export function getCheckoutTrainerMatchById(matchId: string): CheckoutTrainerStoredMatch | null {
  const matches = getCheckoutTrainerMatches()
  return matches.find(m => m.id === matchId) ?? null
}

export function createCheckoutTrainerMatchShell(args: {
  playerId: string
  playerName: string
  targetCount: number
  /** Multiplayer: Alle Spieler */
  players?: { playerId: string; name: string }[]
}): CheckoutTrainerStoredMatch {
  const matchId = ctId()

  const players = args.players && args.players.length > 0
    ? args.players
    : [{ playerId: args.playerId, name: args.playerName }]

  const startEvent: CheckoutTrainerEvent = {
    type: 'CheckoutTrainerStarted',
    eventId: ctId(),
    matchId,
    ts: ctNow(),
    playerId: args.playerId,
    playerName: args.playerName,
    targetCount: args.targetCount,
    players: players.length > 1 ? players : undefined,
  }

  const playerNames = players.map(p => p.name).join(', ')

  const stored: CheckoutTrainerStoredMatch = {
    id: matchId,
    title: players.length > 1
      ? `Checkout Training – ${playerNames}`
      : `Checkout Training – ${args.playerName}`,
    createdAt: ctNow(),
    playerId: args.playerId,
    playerName: args.playerName,
    targetCount: args.targetCount,
    events: [startEvent],
    players: players.length > 1 ? players : undefined,
  }

  const all = getCheckoutTrainerMatches()
  all.push(stored)
  checkoutTrainerCache = all

  return stored
}

export function persistCheckoutTrainerEvents(matchId: string, events: CheckoutTrainerEvent[]) {
  const all = getCheckoutTrainerMatches()
  const idx = all.findIndex(m => m.id === matchId)
  if (idx === -1) return

  all[idx].events = events
  checkoutTrainerCache = all
}

export function finishCheckoutTrainerMatch(matchId: string) {
  const all = getCheckoutTrainerMatches()
  const idx = all.findIndex(m => m.id === matchId)
  if (idx === -1) return

  all[idx].finished = true
  checkoutTrainerCache = all
}

export function deleteCheckoutTrainerMatch(matchId: string) {
  const all = getCheckoutTrainerMatches()
  const filtered = all.filter(m => m.id !== matchId)
  checkoutTrainerCache = filtered
}


// Dev Helper für Console
;(window as any).dartsBackup = downloadBackup
;(window as any).dartsStorageStats = getStorageStats
;(window as any).dartsCreateBackup = createFullBackup
