// src/db/storage.ts
// SQLite-basierte Storage-Funktionen
// Ersetzt LocalStorage-Funktionen aus src/storage.ts

import {
  initDB,
  isDBReady,
  exec,
  query,
  queryOne,
  transaction,
  batchQuery,
  generateId,
  nowISO,
  toJSON,
  fromJSON,
} from './index'

// ============================================================================
// Event Enrichment - Fügt berechnete Statistiken zu Events hinzu
// ============================================================================

/**
 * Bereichert CricketTurnAdded Events mit berechneten Stats für SQL-Queries
 */
function enrichCricketEvent(ev: any): any {
  if (ev.type !== 'CricketTurnAdded' || !ev.darts) return ev

  let marks = 0
  let tripleCount = 0
  let doubleCount = 0
  let singleCount = 0
  let bullCount = 0
  let doubleBullCount = 0

  for (const dart of ev.darts) {
    if (dart.target === 'MISS') continue

    // Marks berechnen (Bull mult=3 wird als 2 gezählt)
    const dartMarks = dart.target === 'BULL' && dart.mult === 3 ? 2 : dart.mult
    marks += dartMarks

    // Multiplier zählen
    if (dart.mult === 3) tripleCount++
    else if (dart.mult === 2) doubleCount++
    else if (dart.mult === 1) singleCount++

    // Bull-Treffer zählen
    if (dart.target === 'BULL') {
      if (dart.mult >= 2) doubleBullCount++
      else bullCount++
    }
  }

  return {
    ...ev,
    marks,
    tripleCount,
    doubleCount,
    singleCount,
    bullCount,
    doubleBullCount,
    dartCount: ev.darts.length,  // Anzahl Darts für einfachere Queries
    // darts bleibt als Array erhalten
  }
}

/**
 * Bereichert ATBTurnAdded Events mit berechneten Stats für SQL-Queries
 */
function enrichATBEvent(ev: any): any {
  if (ev.type !== 'ATBTurnAdded' || !ev.darts) return ev

  let hits = 0
  let misses = 0
  let triples = 0
  let doubles = 0

  for (const dart of ev.darts) {
    if (dart.target === 'MISS') {
      misses++
    } else {
      hits++
      if (dart.mult === 3) triples++
      else if (dart.mult === 2) doubles++
    }
  }

  return {
    ...ev,
    hits,
    misses,
    triples,
    doubles,
    totalDarts: ev.darts.length,
    dartsArray: ev.darts,  // Original beibehalten
  }
}

/**
 * Bereichert CTFTurnAdded Events mit berechneten Stats für SQL-Queries
 */
function enrichCTFEvent(ev: any): any {
  if (ev.type === 'CTFRoundFinished' && !ev.fieldPoints) {
    // Retroaktiv fieldPoints berechnen fuer alte Events
    const scores = ev.scoresByPlayer as Record<string, number> | undefined
    if (scores) {
      const fieldPoints: Record<string, number> = {}
      if (ev.winnerId) {
        for (const pid of Object.keys(scores)) {
          fieldPoints[pid] = pid === ev.winnerId ? 3 : 0
        }
      } else {
        const maxScore = Math.max(...Object.values(scores))
        for (const [pid, score] of Object.entries(scores)) {
          fieldPoints[pid] = ((score as number) === maxScore && maxScore > 0) ? 1 : 0
        }
      }
      return { ...ev, fieldPoints }
    }
    return ev
  }

  if (ev.type !== 'CTFTurnAdded' || !ev.darts) return ev

  let hits = 0
  let misses = 0
  let triples = 0
  let doubles = 0

  for (const dart of ev.darts) {
    if (dart.target === 'MISS') {
      misses++
    } else {
      hits++
      if (dart.mult === 3) triples++
      else if (dart.mult === 2) doubles++
    }
  }

  return {
    ...ev,
    hits,
    misses,
    triples,
    doubles,
    totalDarts: ev.darts.length,
    dartsArray: ev.darts,
  }
}

/**
 * Bereichert StrTurnAdded Events mit berechneten Stats für SQL-Queries
 */
function enrichStrEvent(ev: any): any {
  if (ev.type !== 'StrTurnAdded' || !ev.darts) return ev

  let hits = 0
  let misses = 0
  for (const dart of ev.darts) {
    if (dart === 'hit') hits++
    else misses++
  }

  return {
    ...ev,
    hits,
    misses,
    totalDarts: ev.darts.length,
  }
}

/**
 * Bereichert HighscoreTurnAdded Events mit berechneten Stats für SQL-Queries
 */
function enrichHighscoreEvent(ev: any): any {
  if (ev.type !== 'HighscoreTurnAdded' || !ev.darts) return ev

  let triples = 0
  let doubles = 0
  let singles = 0
  let misses = 0

  for (const dart of ev.darts) {
    if (dart.target === 'MISS') misses++
    else if (dart.mult === 3) triples++
    else if (dart.mult === 2) doubles++
    else singles++
  }

  return {
    ...ev,
    triples,
    doubles,
    singles,
    misses,
    totalDarts: ev.darts.length,
  }
}

/**
 * Bereichert ShanghaiTurnAdded Events mit berechneten Stats für SQL-Queries
 */
function enrichShanghaiEvent(ev: any): any {
  if (ev.type !== 'ShanghaiTurnAdded' || !ev.darts) return ev

  let hits = 0
  let misses = 0
  let triples = 0
  let doubles = 0
  let singles = 0

  for (const dart of ev.darts) {
    if (dart.target === 'MISS') {
      misses++
    } else if (dart.target === ev.targetNumber) {
      hits++
      if (dart.mult === 3) triples++
      else if (dart.mult === 2) doubles++
      else singles++
    } else {
      misses++ // Falsche Zahl
    }
  }

  return {
    ...ev,
    hits,
    misses,
    triples,
    doubles,
    singles,
    totalDarts: ev.darts.length,
  }
}

/**
 * Bereichert ein Event basierend auf seinem Typ
 */
function enrichEvent(ev: any): any {
  if (ev.type === 'CricketTurnAdded') return enrichCricketEvent(ev)
  if (ev.type === 'ATBTurnAdded') return enrichATBEvent(ev)
  if (ev.type === 'CTFTurnAdded') return enrichCTFEvent(ev)
  if (ev.type === 'StrTurnAdded') return enrichStrEvent(ev)
  if (ev.type === 'HighscoreTurnAdded') return enrichHighscoreEvent(ev)
  if (ev.type === 'ShanghaiTurnAdded') return enrichShanghaiEvent(ev)
  if (ev.type === 'KillerTurnAdded') return enrichKillerEvent(ev)
  if (ev.type === 'OperationDart') return enrichOperationEvent(ev)
  return ev
}

/**
 * Bereichert OperationDart Events mit berechneten Stats fuer SQL-Queries
 */
function enrichOperationEvent(ev: any): any {
  if (ev.type !== 'OperationDart') return ev
  return {
    ...ev,
    isHit: ev.hitType !== 'NO_SCORE' ? 1 : 0,
  }
}

/**
 * Bereichert KillerTurnAdded Events mit berechneten Stats für SQL-Queries
 */
function enrichKillerEvent(ev: any): any {
  if (ev.type !== 'KillerTurnAdded' || !ev.darts) return ev

  let hits = 0
  let misses = 0
  for (const dart of ev.darts) {
    if (dart.target === 'MISS') misses++
    else hits++
  }

  return {
    ...ev,
    hits,
    misses,
    totalDarts: ev.darts.length,
    killCount: ev.eliminations?.length ?? 0,
  }
}

// ============================================================================
// Initialization
// ============================================================================

let dbInitialized = false
let dbInitPromise: Promise<boolean> | null = null

/**
 * Stellt sicher dass die DB initialisiert ist
 * Gibt true zurück wenn SQLite verfügbar, false wenn Fallback auf LocalStorage
 */
export async function ensureDB(): Promise<boolean> {
  // Prüfen ob die DB bereits über db/init.ts initialisiert wurde
  if (isDBReady()) {
    dbInitialized = true
    return true
  }

  if (dbInitialized) return isDBReady()

  if (!dbInitPromise) {
    dbInitPromise = (async () => {
      try {
        await initDB()
        dbInitialized = true
        return true
      } catch (e) {
        console.warn('[DB Storage] SQLite nicht verfügbar, nutze LocalStorage:', e)
        return false
      }
    })()
  }

  return dbInitPromise
}

// ============================================================================
// Profile Functions
// ============================================================================

export type DBProfile = {
  id: string
  name: string
  color: string | null
  createdAt: string
  updatedAt: string
}

export async function dbGetProfiles(): Promise<DBProfile[]> {
  await ensureDB()
  const rows = await query<{
    id: string
    name: string
    color: string | null
    created_at: string
    updated_at: string
  }>('SELECT * FROM profiles ORDER BY name')

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    color: r.color,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }))
}

export async function dbGetProfileById(id: string): Promise<DBProfile | null> {
  await ensureDB()
  const row = await queryOne<{
    id: string
    name: string
    color: string | null
    created_at: string
    updated_at: string
  }>('SELECT * FROM profiles WHERE id = ?', [id])

  if (!row) return null
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function dbGetProfileByName(name: string): Promise<DBProfile | null> {
  await ensureDB()
  const row = await queryOne<{
    id: string
    name: string
    color: string | null
    created_at: string
    updated_at: string
  }>('SELECT * FROM profiles WHERE LOWER(name) = LOWER(?)', [name.trim()])

  if (!row) return null
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function dbSaveProfile(profile: DBProfile): Promise<void> {
  await ensureDB()
  await exec(
    `INSERT INTO profiles (id, name, color, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name,
       color = EXCLUDED.color,
       created_at = EXCLUDED.created_at,
       updated_at = EXCLUDED.updated_at`,
    [profile.id, profile.name, profile.color, profile.createdAt, profile.updatedAt]
  )
}

export async function dbDeleteProfile(id: string): Promise<void> {
  await ensureDB()

  // Kaskaden-Löschung: Alle spielerspezifischen Stats, Leaderboards und Highscores entfernen.
  // Matches und Match-Player-Zuordnungen bleiben erhalten (für Matchhistorie).
  const cascadeDeletes = [
    // Stats-Tabellen
    'DELETE FROM x01_player_stats WHERE player_id = ?',
    'DELETE FROM x01_finishing_doubles WHERE player_id = ?',
    'DELETE FROM cricket_player_stats WHERE player_id = ?',
    'DELETE FROM stats_121 WHERE player_id = ?',
    'DELETE FROM stats_121_doubles WHERE player_id = ?',
    // Leaderboards
    'DELETE FROM x01_leaderboards WHERE player_id = ?',
    'DELETE FROM cricket_leaderboards WHERE player_id = ?',
    // Highscores
    'DELETE FROM atb_highscores WHERE player_id = ?',
    // Profil
    'DELETE FROM profiles WHERE id = ?',
  ]

  for (const sql of cascadeDeletes) {
    try {
      await exec(sql, [id])
    } catch (e) {
      // Tabelle existiert evtl. noch nicht (alte DB-Version) → ignorieren
      console.warn(`[DB] Cascade delete failed for: ${sql.split(' ')[2]}`, e)
    }
  }
}

// ============================================================================
// Batch Load All Data (single HTTP request for startup)
// ============================================================================

/** Match types with events tables */
const MATCH_TYPES_WITH_EVENTS = [
  { key: 'x01', matchTable: 'x01_matches', eventTable: 'x01_events', playerTable: 'x01_match_players', orderMatches: 'created_at DESC' },
  { key: 'cricket', matchTable: 'cricket_matches', eventTable: 'cricket_events', playerTable: 'cricket_match_players', orderMatches: 'created_at DESC' },
  { key: 'atb', matchTable: 'atb_matches', eventTable: 'atb_events', playerTable: 'atb_match_players', orderMatches: 'created_at DESC' },
  { key: 'str', matchTable: 'str_matches', eventTable: 'str_events', playerTable: 'str_match_players', orderMatches: 'created_at DESC' },
  { key: 'highscore', matchTable: 'highscore_matches', eventTable: 'highscore_events', playerTable: 'highscore_match_players', orderMatches: 'created_at DESC' },
  { key: 'shanghai', matchTable: 'shanghai_matches', eventTable: 'shanghai_events', playerTable: 'shanghai_match_players', orderMatches: 'created_at DESC' },
  { key: 'killer', matchTable: 'killer_matches', eventTable: 'killer_events', playerTable: 'killer_match_players', orderMatches: 'created_at DESC' },
  { key: 'ctf', matchTable: 'ctf_matches', eventTable: 'ctf_events', playerTable: 'ctf_match_players', orderMatches: 'created_at DESC' },
  { key: 'bobs27', matchTable: 'bobs27_matches', eventTable: 'bobs27_events', playerTable: 'bobs27_match_players', orderMatches: 'created_at DESC' },
  { key: 'operation', matchTable: 'operation_matches', eventTable: 'operation_events', playerTable: 'operation_match_players', orderMatches: 'created_at DESC' },
] as const

type BatchLoadResult = {
  profiles: DBProfile[]
  x01: { matches: any[]; events: any[]; players: any[] }
  cricket: { matches: any[]; events: any[]; players: any[] }
  atb: { matches: any[]; events: any[]; players: any[] }
  str: { matches: any[]; events: any[]; players: any[] }
  highscore: { matches: any[]; events: any[]; players: any[] }
  shanghai: { matches: any[]; events: any[]; players: any[] }
  killer: { matches: any[]; events: any[]; players: any[] }
  ctf: { matches: any[]; events: any[]; players: any[] }
  bobs27: { matches: any[]; events: any[]; players: any[] }
  operation: { matches: any[]; events: any[]; players: any[] }
}

/**
 * Lädt ALLE Daten in einem einzigen HTTP-Request via Batch-API.
 * 1 query für Profiles + 3 queries pro Match-Typ (matches, events, players) = 31 queries, 1 HTTP-Request.
 */
export async function dbLoadAllDataBatch(): Promise<BatchLoadResult> {
  await ensureDB()

  // Build batch query array: profiles + 3 per match type
  const queries: Array<{ sql: string; params?: unknown[] }> = [
    { sql: 'SELECT * FROM profiles ORDER BY name' },
  ]

  for (const mt of MATCH_TYPES_WITH_EVENTS) {
    queries.push(
      { sql: `SELECT * FROM ${mt.matchTable} ORDER BY ${mt.orderMatches}` },
      { sql: `SELECT match_id, data FROM ${mt.eventTable} ORDER BY match_id, seq` },
      { sql: `SELECT match_id, player_id FROM ${mt.playerTable} ORDER BY match_id, position` },
    )
  }

  const results = await batchQuery(queries)

  // Parse results: index 0 = profiles, then groups of 3
  const profiles = ((results[0]?.data ?? []) as any[]).map((r: any) => ({
    id: r.id, name: r.name, color: r.color, createdAt: r.created_at, updatedAt: r.updated_at,
  }))

  const parsed: Record<string, { matches: any[]; events: any[]; players: any[] }> = {}
  for (let i = 0; i < MATCH_TYPES_WITH_EVENTS.length; i++) {
    const base = 1 + i * 3
    parsed[MATCH_TYPES_WITH_EVENTS[i].key] = {
      matches: (results[base]?.data ?? []) as any[],
      events: (results[base + 1]?.data ?? []) as any[],
      players: (results[base + 2]?.data ?? []) as any[],
    }
  }

  return { profiles, ...parsed } as BatchLoadResult
}

/**
 * Helper: Group rows by match_id into a Map
 */
function groupByMatchId<T extends { match_id: string }>(rows: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>()
  for (const row of rows) {
    const arr = map.get(row.match_id)
    if (arr) arr.push(row); else map.set(row.match_id, [row])
  }
  return map
}

/**
 * Assembles X01 matches from batch data
 */
export function assembleX01Matches(data: { matches: any[]; events: any[]; players: any[] }): DBX01Match[] {
  const eventsByMatch = groupByMatchId(data.events)
  const playersByMatch = groupByMatchId(data.players)

  return data.matches.map((m: any) => ({
    id: m.id,
    title: m.title,
    matchName: m.match_name,
    notes: m.notes,
    createdAt: m.created_at,
    finished: m.finished === 1 || m.finished === true,
    finishedAt: m.finished_at,
    events: (eventsByMatch.get(m.id) ?? []).map((e: any) => fromJSON(e.data)).filter(Boolean),
    playerIds: (playersByMatch.get(m.id) ?? []).map((p: any) => p.player_id),
  }))
}

/**
 * Assembles Cricket matches from batch data
 */
export function assembleCricketMatches(data: { matches: any[]; events: any[]; players: any[] }): DBCricketMatch[] {
  const eventsByMatch = groupByMatchId(data.events)
  const playersByMatch = groupByMatchId(data.players)

  return data.matches.map((m: any) => ({
    id: m.id,
    title: m.title,
    matchName: m.match_name,
    notes: m.notes,
    createdAt: m.created_at,
    finished: m.finished === 1 || m.finished === true,
    events: (eventsByMatch.get(m.id) ?? []).map((e: any) => {
      const ev = fromJSON(e.data) as any
      return ev?.type === 'CricketTurnAdded' ? enrichCricketEvent(ev) : ev
    }).filter(Boolean),
    playerIds: (playersByMatch.get(m.id) ?? []).map((p: any) => p.player_id),
  })) as DBCricketMatch[]
}

/**
 * Assembles generic matches (ATB, STR, Highscore, etc.) from batch data
 */
export function assembleGenericMatches(
  data: { matches: any[]; events: any[]; players: any[] },
  enrichFn?: (ev: any) => any,
): any[] {
  const eventsByMatch = groupByMatchId(data.events)
  const playersByMatch = groupByMatchId(data.players)

  return data.matches.map((m: any) => {
    const events = (eventsByMatch.get(m.id) ?? []).map((e: any) => {
      const ev = fromJSON(e.data)
      return enrichFn ? enrichFn(ev) : ev
    }).filter(Boolean)
    const players = (playersByMatch.get(m.id) ?? []).map((p: any) => p.player_id)

    // Extract extra match-level data from start events
    const startEvent = events.find((e: any) => e.type?.includes('Started') || e.type?.includes('MatchStarted'))

    return {
      ...m,
      id: m.id,
      title: m.title,
      matchName: m.match_name ?? undefined,
      notes: m.notes ?? undefined,
      createdAt: m.created_at,
      finished: m.finished === 1 || m.finished === true,
      finishedAt: m.finished_at ?? undefined,
      events,
      playerIds: players,
      // Common fields that some match types use
      winnerId: m.winner_id ?? undefined,
      finalScores: m.final_scores ? (typeof m.final_scores === 'string' ? JSON.parse(m.final_scores) : m.final_scores) : undefined,
      finalStandings: m.final_standings ? (typeof m.final_standings === 'string' ? JSON.parse(m.final_standings) : m.final_standings) : undefined,
      config: m.config ? (typeof m.config === 'string' ? JSON.parse(m.config) : m.config) : undefined,
      durationMs: m.duration_ms ?? undefined,
      includeBull: m.include_bull != null ? (m.include_bull === 1 || m.include_bull === true) : undefined,
    }
  })
}

// ============================================================================
// Open Match Check (lightweight startup query)
// ============================================================================

export type OpenMatchInfo = {
  gameType: string
  id: string
  title: string
}

/**
 * Check all game types for unfinished matches in a single batch query.
 * Returns minimal data (id + title) — no events, no player lists.
 * Used at startup instead of loading all match data.
 */
export async function dbGetOpenMatchSummaries(): Promise<OpenMatchInfo[]> {
  await ensureDB()

  const rows = await query<{ game_type: string; id: string; title: string }>(`
    (SELECT 'x01' as game_type, id, title FROM x01_matches WHERE finished = 0 ORDER BY created_at DESC LIMIT 1)
    UNION ALL
    (SELECT 'cricket', id, title FROM cricket_matches WHERE finished = 0 ORDER BY created_at DESC LIMIT 1)
    UNION ALL
    (SELECT 'atb', id, title FROM atb_matches WHERE finished = 0 ORDER BY created_at DESC LIMIT 1)
    UNION ALL
    (SELECT 'str', id, title FROM str_matches WHERE finished = 0 ORDER BY created_at DESC LIMIT 1)
    UNION ALL
    (SELECT 'highscore', id, title FROM highscore_matches WHERE finished = 0 ORDER BY created_at DESC LIMIT 1)
    UNION ALL
    (SELECT 'ctf', id, title FROM ctf_matches WHERE finished = 0 ORDER BY created_at DESC LIMIT 1)
    UNION ALL
    (SELECT 'shanghai', id, title FROM shanghai_matches WHERE finished = 0 ORDER BY created_at DESC LIMIT 1)
    UNION ALL
    (SELECT 'killer', id, title FROM killer_matches WHERE finished = 0 ORDER BY created_at DESC LIMIT 1)
    UNION ALL
    (SELECT 'bobs27', id, title FROM bobs27_matches WHERE finished = 0 ORDER BY created_at DESC LIMIT 1)
    UNION ALL
    (SELECT 'operation', id, title FROM operation_matches WHERE finished = 0 ORDER BY created_at DESC LIMIT 1)
  `)

  return rows.map(r => ({ gameType: r.game_type, id: r.id, title: r.title }))
}

// ============================================================================
// Active Games (open/unfinished match tracking)
// ============================================================================

export type ActiveGame = {
  id: string
  playerId: string
  gameType: string
  title: string
  config: Record<string, any> | null
  players: Array<{ id: string; name: string; color?: string }> | null
  startedAt: string
}

const ACTIVE_GAMES_DDL = `
CREATE TABLE IF NOT EXISTS active_games (
  id          TEXT PRIMARY KEY,
  player_id   TEXT NOT NULL,
  game_type   TEXT NOT NULL,
  title       TEXT NOT NULL,
  config      JSONB,
  players     JSONB,
  started_at  TEXT NOT NULL
)`

const ACTIVE_GAMES_INDEX = `CREATE INDEX IF NOT EXISTS idx_active_games_player ON active_games(player_id)`

let activeGamesTableReady = false

async function ensureActiveGamesTable(): Promise<void> {
  if (activeGamesTableReady) return
  await exec(ACTIVE_GAMES_DDL)
  await exec(ACTIVE_GAMES_INDEX)
  activeGamesTableReady = true
}

export async function dbInsertActiveGame(game: ActiveGame): Promise<void> {
  await ensureActiveGamesTable()
  await exec(
    `INSERT INTO active_games (id, player_id, game_type, title, config, players, started_at)
     VALUES (?, ?, ?, ?, ?::text::jsonb, ?::text::jsonb, ?)
     ON CONFLICT (id) DO UPDATE SET
       title = EXCLUDED.title,
       config = EXCLUDED.config,
       players = EXCLUDED.players`,
    [game.id, game.playerId, game.gameType, game.title,
     JSON.stringify(game.config), JSON.stringify(game.players), game.startedAt]
  )
}

export async function dbDeleteActiveGame(matchId: string): Promise<void> {
  await ensureActiveGamesTable()
  await exec('DELETE FROM active_games WHERE id = ?', [matchId])
}

export async function dbGetActiveGames(): Promise<ActiveGame[]> {
  await ensureActiveGamesTable()
  const rows = await query<{
    id: string; player_id: string; game_type: string; title: string;
    config: any; players: any; started_at: string
  }>('SELECT * FROM active_games ORDER BY started_at DESC')

  return rows.map(r => ({
    id: r.id,
    playerId: r.player_id,
    gameType: r.game_type,
    title: r.title,
    config: r.config,
    players: r.players,
    startedAt: r.started_at,
  }))
}

/**
 * One-time migration: populate active_games from existing unfinished matches.
 * Only runs if active_games is empty and there are unfinished matches.
 * Sets a system_meta flag so it only runs once.
 */
export async function dbMigrateToActiveGames(): Promise<number> {
  // Check if migration already done
  const flag = await queryOne<{ value: string }>(
    "SELECT value FROM system_meta WHERE key = 'active_games_migrated'"
  )
  if (flag) return 0

  // Check if active_games already has data
  const existing = await queryOne<{ cnt: number }>(
    'SELECT COUNT(*) as cnt FROM active_games'
  )
  if (existing && existing.cnt > 0) {
    // Already has data, mark as migrated
    await exec(
      "INSERT INTO system_meta (key, value, updated_at) VALUES ('active_games_migrated', '1', ?) ON CONFLICT (key) DO UPDATE SET value = '1'",
      [new Date().toISOString()]
    )
    return 0
  }

  // Find all unfinished matches using the existing UNION ALL query
  let openMatches: OpenMatchInfo[] = []
  try {
    openMatches = await dbGetOpenMatchSummaries()
  } catch {
    return 0
  }

  if (openMatches.length === 0) {
    await exec(
      "INSERT INTO system_meta (key, value, updated_at) VALUES ('active_games_migrated', '1', ?) ON CONFLICT (key) DO UPDATE SET value = '1'",
      [new Date().toISOString()]
    )
    return 0
  }

  // For each open match, get player info from the match_players table
  let migrated = 0
  for (const om of openMatches) {
    try {
      const tableName = `${om.gameType}_match_players`
      const playerRows = await query<{ player_id: string }>(
        `SELECT player_id FROM ${tableName} WHERE match_id = ?`,
        [om.id]
      )

      await dbInsertActiveGame({
        id: om.id,
        playerId: playerRows[0]?.player_id ?? '',
        gameType: om.gameType,
        title: om.title,
        config: null,
        players: playerRows.map(p => ({ id: p.player_id, name: '', color: undefined })),
        startedAt: new Date().toISOString(),
      })
      migrated++
    } catch (err) {
      console.warn(`[Migration] Failed to migrate ${om.gameType} match ${om.id}:`, err)
    }
  }

  // Mark migration as done
  await exec(
    "INSERT INTO system_meta (key, value, updated_at) VALUES ('active_games_migrated', '1', ?) ON CONFLICT (key) DO UPDATE SET value = '1'",
    [new Date().toISOString()]
  )

  console.log(`[Migration] Migrated ${migrated} open matches to active_games`)
  return migrated
}

// ============================================================================
// X01 Match Functions
// ============================================================================

export type DBX01Match = {
  id: string
  title: string
  matchName: string | null
  notes: string | null
  createdAt: string
  finished: boolean
  finishedAt: string | null
  events: any[]
  playerIds: string[]
}

export async function dbGetX01Matches(): Promise<DBX01Match[]> {
  await ensureDB()

  // Optimized: Load only recent matches (last 50) + their events
  // Events are the biggest data transfer cost (~500 bytes each × thousands)
  const MATCH_LIMIT = 50

  const results = await batchQuery([
    { sql: `SELECT * FROM x01_matches ORDER BY created_at DESC LIMIT ${MATCH_LIMIT}` },
    { sql: `SELECT e.match_id, e.data FROM x01_events e INNER JOIN (SELECT id FROM x01_matches ORDER BY created_at DESC LIMIT ${MATCH_LIMIT}) m ON e.match_id = m.id ORDER BY e.match_id, e.seq` },
    { sql: `SELECT mp.match_id, mp.player_id FROM x01_match_players mp INNER JOIN (SELECT id FROM x01_matches ORDER BY created_at DESC LIMIT ${MATCH_LIMIT}) m ON mp.match_id = m.id ORDER BY mp.match_id, mp.position` },
  ])
  const matches = (results[0]?.data ?? []) as any[]
  const allEvents = (results[1]?.data ?? []) as any[]
  const allPlayers = (results[2]?.data ?? []) as any[]

  // Group by match_id
  const eventsByMatch = new Map<string, string[]>()
  for (const e of allEvents) {
    const arr = eventsByMatch.get(e.match_id)
    if (arr) arr.push(e.data); else eventsByMatch.set(e.match_id, [e.data])
  }
  const playersByMatch = new Map<string, string[]>()
  for (const p of allPlayers) {
    const arr = playersByMatch.get(p.match_id)
    if (arr) arr.push(p.player_id); else playersByMatch.set(p.match_id, [p.player_id])
  }

  return matches.map((m) => ({
    id: m.id,
    title: m.title,
    matchName: m.match_name,
    notes: m.notes,
    createdAt: m.created_at,
    finished: m.finished === 1,
    finishedAt: m.finished_at,
    events: (eventsByMatch.get(m.id) ?? []).map((d) => fromJSON(d)).filter(Boolean),
    playerIds: playersByMatch.get(m.id) ?? [],
  }))
}

export async function dbGetX01MatchById(matchId: string): Promise<DBX01Match | null> {
  await ensureDB()

  const m = await queryOne<{
    id: string
    title: string
    match_name: string | null
    notes: string | null
    created_at: string
    finished: number
    finished_at: string | null
  }>('SELECT * FROM x01_matches WHERE id = ?', [matchId])

  if (!m) return null

  const events = await query<{ data: string }>(
    'SELECT data FROM x01_events WHERE match_id = ? ORDER BY seq',
    [matchId]
  )

  const players = await query<{ player_id: string }>(
    'SELECT player_id FROM x01_match_players WHERE match_id = ? ORDER BY position',
    [matchId]
  )

  return {
    id: m.id,
    title: m.title,
    matchName: m.match_name,
    notes: m.notes,
    createdAt: m.created_at,
    finished: m.finished === 1,
    finishedAt: m.finished_at,
    events: events.map((e) => fromJSON(e.data)).filter(Boolean),
    playerIds: players.map((p) => p.player_id),
  }
}

export async function dbSaveX01Match(match: DBX01Match): Promise<void> {
  const ready = await ensureDB()
  if (!ready) {
    console.warn('[DB] dbSaveX01Match: DB not ready, skipping SQLite save for', match.id)
    return
  }
  console.debug('[DB] dbSaveX01Match: Saving match', match.id)

  const startEvt = match.events.find((e) => e.type === 'MatchStarted')
  const finishEvt = match.events.find((e) => e.type === 'MatchFinished')

  const statements: Array<{ sql: string; params: unknown[] }> = []

  // Match
  statements.push({
    sql: `INSERT INTO x01_matches (
      id, title, match_name, notes, created_at, finished, finished_at,
      mode, starting_score, structure_kind, best_of_legs, legs_per_set, best_of_sets,
      in_rule, out_rule
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (id) DO UPDATE SET
      title = EXCLUDED.title,
      match_name = EXCLUDED.match_name,
      notes = EXCLUDED.notes,
      created_at = EXCLUDED.created_at,
      finished = EXCLUDED.finished,
      finished_at = EXCLUDED.finished_at,
      mode = EXCLUDED.mode,
      starting_score = EXCLUDED.starting_score,
      structure_kind = EXCLUDED.structure_kind,
      best_of_legs = EXCLUDED.best_of_legs,
      legs_per_set = EXCLUDED.legs_per_set,
      best_of_sets = EXCLUDED.best_of_sets,
      in_rule = EXCLUDED.in_rule,
      out_rule = EXCLUDED.out_rule`,
    params: [
      match.id,
      match.title,
      match.matchName,
      match.notes,
      match.createdAt,
      match.finished ? 1 : 0,
      match.finishedAt ?? finishEvt?.ts ?? null,
      startEvt?.mode ?? '501-double-out',
      startEvt?.startingScorePerLeg ?? 501,
      startEvt?.structure?.kind ?? 'legs',
      startEvt?.structure?.bestOfLegs ?? null,
      startEvt?.structure?.legsPerSet ?? null,
      startEvt?.structure?.bestOfSets ?? null,
      startEvt?.inRule ?? 'straight-in',
      startEvt?.outRule ?? 'double-out',
    ],
  })

  // Alte Events/Players löschen
  statements.push({ sql: 'DELETE FROM x01_events WHERE match_id = ?', params: [match.id] })
  statements.push({ sql: 'DELETE FROM x01_match_players WHERE match_id = ?', params: [match.id] })

  // Spieler
  const players = startEvt?.players ?? []
  for (let i = 0; i < players.length; i++) {
    const p = players[i]
    statements.push({
      sql: `INSERT INTO x01_match_players (match_id, player_id, position, is_guest)
            VALUES (?, ?, ?, ?)`,
      params: [match.id, p.playerId, i, p.isGuest ? 1 : 0],
    })
  }

  // Events
  for (let seq = 0; seq < match.events.length; seq++) {
    const ev = match.events[seq]
    statements.push({
      sql: `INSERT INTO x01_events (id, match_id, type, ts, seq, data)
            VALUES (?, ?, ?, ?, ?, ?)`,
      params: [ev.eventId ?? generateId(), match.id, ev.type, ev.ts, seq, toJSON(ev)],
    })
  }

  await transaction(statements)
  console.debug('[DB] dbSaveX01Match: Successfully saved match', match.id)
}

export async function dbUpdateX01Events(matchId: string, events: any[]): Promise<void> {
  const ready = await ensureDB()
  if (!ready) {
    console.warn('[DB] dbUpdateX01Events: DB not ready, skipping SQLite update for', matchId)
    return
  }

  const statements: Array<{ sql: string; params: unknown[] }> = []

  // Alte Events löschen
  statements.push({ sql: 'DELETE FROM x01_events WHERE match_id = ?', params: [matchId] })

  // Neue Events einfügen
  for (let seq = 0; seq < events.length; seq++) {
    const ev = events[seq]
    statements.push({
      sql: `INSERT INTO x01_events (id, match_id, type, ts, seq, data)
            VALUES (?, ?, ?, ?, ?, ?)`,
      params: [ev.eventId ?? generateId(), matchId, ev.type, ev.ts, seq, toJSON(ev)],
    })
  }

  // Finished Status aktualisieren
  const finishEvt = events.find((e) => e.type === 'MatchFinished')
  if (finishEvt) {
    statements.push({
      sql: 'UPDATE x01_matches SET finished = 1, finished_at = ? WHERE id = ?',
      params: [finishEvt.ts, matchId],
    })
  }

  await transaction(statements)
  console.debug('[DB] dbUpdateX01Events: Updated', events.length, 'events for match', matchId)
}

export async function dbFinishX01Match(matchId: string): Promise<void> {
  const ready = await ensureDB()
  if (!ready) {
    console.warn('[DB] dbFinishX01Match: DB not ready, skipping SQLite update for', matchId)
    return
  }
  console.debug('[DB] dbFinishX01Match: Finishing match', matchId)
  await exec(
    'UPDATE x01_matches SET finished = 1, finished_at = ? WHERE id = ?',
    [nowISO(), matchId]
  )
}

// ============================================================================
// Cricket Match Functions
// ============================================================================

export type DBCricketMatch = {
  id: string
  title: string
  matchName: string | null
  notes: string | null
  createdAt: string
  finished: boolean
  finishedAt: string | null
  events: any[]
  playerIds: string[]
}

export async function dbGetCricketMatches(): Promise<DBCricketMatch[]> {
  await ensureDB()

  // Optimized: Load only recent matches (last 50) + their events
  const MATCH_LIMIT = 50

  const results = await batchQuery([
    { sql: `SELECT * FROM cricket_matches ORDER BY created_at DESC LIMIT ${MATCH_LIMIT}` },
    { sql: `SELECT e.match_id, e.data FROM cricket_events e INNER JOIN (SELECT id FROM cricket_matches ORDER BY created_at DESC LIMIT ${MATCH_LIMIT}) m ON e.match_id = m.id ORDER BY e.match_id, e.seq` },
    { sql: `SELECT mp.match_id, mp.player_id FROM cricket_match_players mp INNER JOIN (SELECT id FROM cricket_matches ORDER BY created_at DESC LIMIT ${MATCH_LIMIT}) m ON mp.match_id = m.id ORDER BY mp.match_id, mp.position` },
  ])
  const matches = (results[0]?.data ?? []) as any[]
  const allEvents = (results[1]?.data ?? []) as any[]
  const allPlayers = (results[2]?.data ?? []) as any[]

  // Group by match_id
  const eventsByMatch = new Map<string, string[]>()
  for (const e of allEvents) {
    const arr = eventsByMatch.get(e.match_id)
    if (arr) arr.push(e.data); else eventsByMatch.set(e.match_id, [e.data])
  }
  const playersByMatch = new Map<string, string[]>()
  for (const p of allPlayers) {
    const arr = playersByMatch.get(p.match_id)
    if (arr) arr.push(p.player_id); else playersByMatch.set(p.match_id, [p.player_id])
  }

  return matches.map((m) => ({
    id: m.id,
    title: m.title,
    matchName: m.match_name,
    notes: m.notes,
    createdAt: m.created_at,
    finished: m.finished === 1,
    finishedAt: m.finished_at,
    events: (eventsByMatch.get(m.id) ?? []).map((d) => fromJSON(d)).filter(Boolean),
    playerIds: playersByMatch.get(m.id) ?? [],
  }))
}

export async function dbGetCricketMatchById(matchId: string): Promise<DBCricketMatch | null> {
  await ensureDB()

  const m = await queryOne<{
    id: string
    title: string
    match_name: string | null
    notes: string | null
    created_at: string
    finished: number
    finished_at: string | null
  }>('SELECT * FROM cricket_matches WHERE id = ?', [matchId])

  if (!m) return null

  const events = await query<{ data: string }>(
    'SELECT data FROM cricket_events WHERE match_id = ? ORDER BY seq',
    [matchId]
  )

  const players = await query<{ player_id: string }>(
    'SELECT player_id FROM cricket_match_players WHERE match_id = ? ORDER BY position',
    [matchId]
  )

  return {
    id: m.id,
    title: m.title,
    matchName: m.match_name,
    notes: m.notes,
    createdAt: m.created_at,
    finished: m.finished === 1,
    finishedAt: m.finished_at,
    events: events.map((e) => fromJSON(e.data)).filter(Boolean),
    playerIds: players.map((p) => p.player_id),
  }
}

export async function dbSaveCricketMatch(match: DBCricketMatch): Promise<void> {
  await ensureDB()

  const startEvt = match.events.find((e) => e.type === 'CricketMatchStarted')
  const finishEvt = match.events.find((e) => e.type === 'CricketMatchFinished')

  const statements: Array<{ sql: string; params: unknown[] }> = []

  statements.push({
    sql: `INSERT INTO cricket_matches (
      id, title, match_name, notes, created_at, finished, finished_at,
      range, style, best_of_games, crazy_mode, crazy_scoring_mode
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (id) DO UPDATE SET
      title = EXCLUDED.title,
      match_name = EXCLUDED.match_name,
      notes = EXCLUDED.notes,
      created_at = EXCLUDED.created_at,
      finished = EXCLUDED.finished,
      finished_at = EXCLUDED.finished_at,
      range = EXCLUDED.range,
      style = EXCLUDED.style,
      best_of_games = EXCLUDED.best_of_games,
      crazy_mode = EXCLUDED.crazy_mode,
      crazy_scoring_mode = EXCLUDED.crazy_scoring_mode`,
    params: [
      match.id,
      match.title,
      match.matchName,
      match.notes,
      match.createdAt,
      match.finished ? 1 : 0,
      match.finishedAt ?? finishEvt?.ts ?? null,
      startEvt?.range ?? 'short',
      startEvt?.style ?? 'standard',
      startEvt?.bestOfGames ?? null,
      startEvt?.crazyMode ?? null,
      startEvt?.crazyScoringMode ?? null,
    ],
  })

  statements.push({ sql: 'DELETE FROM cricket_events WHERE match_id = ?', params: [match.id] })
  statements.push({ sql: 'DELETE FROM cricket_match_players WHERE match_id = ?', params: [match.id] })

  const players = startEvt?.players ?? []
  for (let i = 0; i < players.length; i++) {
    const p = players[i]
    statements.push({
      sql: `INSERT INTO cricket_match_players (match_id, player_id, position, is_guest)
            VALUES (?, ?, ?, ?)`,
      params: [match.id, p.playerId, i, p.isGuest ? 1 : 0],
    })
  }

  for (let seq = 0; seq < match.events.length; seq++) {
    const ev = match.events[seq]
    const enrichedEv = enrichEvent(ev)
    statements.push({
      sql: `INSERT INTO cricket_events (id, match_id, type, ts, seq, data)
            VALUES (?, ?, ?, ?, ?, ?)`,
      params: [ev.eventId ?? generateId(), match.id, ev.type, ev.ts, seq, toJSON(enrichedEv)],
    })
  }

  await transaction(statements)
}

export async function dbUpdateCricketEvents(matchId: string, events: any[]): Promise<void> {
  await ensureDB()

  const statements: Array<{ sql: string; params: unknown[] }> = []

  statements.push({ sql: 'DELETE FROM cricket_events WHERE match_id = ?', params: [matchId] })

  for (let seq = 0; seq < events.length; seq++) {
    const ev = events[seq]
    const enrichedEv = enrichEvent(ev)
    statements.push({
      sql: `INSERT INTO cricket_events (id, match_id, type, ts, seq, data)
            VALUES (?, ?, ?, ?, ?, ?)`,
      params: [ev.eventId ?? generateId(), matchId, ev.type, ev.ts, seq, toJSON(enrichedEv)],
    })
  }

  const finishEvt = events.find((e) => e.type === 'CricketMatchFinished')
  if (finishEvt) {
    statements.push({
      sql: 'UPDATE cricket_matches SET finished = 1, finished_at = ? WHERE id = ?',
      params: [finishEvt.ts, matchId],
    })
  }

  await transaction(statements)
}

// ============================================================================
// ATB Match Functions
// ============================================================================

export type DBATBMatch = {
  id: string
  title: string
  createdAt: string
  finished: boolean
  finishedAt: string | null
  durationMs: number | null
  winnerId: string | null
  winnerDarts: number | null
  mode: string
  direction: string
  players: any[]
  events: any[]
  structure?: any
  config?: any
  generatedSequence?: any[]
}

export async function dbGetATBMatches(): Promise<DBATBMatch[]> {
  await ensureDB()

  // Optimized: Load only recent matches (last 50) + their events
  const MATCH_LIMIT = 50

  const results = await batchQuery([
    { sql: `SELECT * FROM atb_matches ORDER BY created_at DESC LIMIT ${MATCH_LIMIT}` },
    { sql: `SELECT e.match_id, e.data FROM atb_events e INNER JOIN (SELECT id FROM atb_matches ORDER BY created_at DESC LIMIT ${MATCH_LIMIT}) m ON e.match_id = m.id ORDER BY e.match_id, e.seq` },
    { sql: `SELECT mp.match_id, mp.player_id, mp.is_guest FROM atb_match_players mp INNER JOIN (SELECT id FROM atb_matches ORDER BY created_at DESC LIMIT ${MATCH_LIMIT}) m ON mp.match_id = m.id ORDER BY mp.match_id, mp.position` },
  ])
  const matches = (results[0]?.data ?? []) as any[]
  const allEvents = (results[1]?.data ?? []) as any[]
  const allPlayers = (results[2]?.data ?? []) as any[]

  // Group by match_id
  const eventsByMatch = new Map<string, string[]>()
  for (const e of allEvents) {
    const arr = eventsByMatch.get(e.match_id)
    if (arr) arr.push(e.data); else eventsByMatch.set(e.match_id, [e.data])
  }
  const playersByMatch = new Map<string, { player_id: string; is_guest: number }[]>()
  for (const p of allPlayers) {
    const arr = playersByMatch.get(p.match_id)
    if (arr) arr.push(p); else playersByMatch.set(p.match_id, [p])
  }

  return matches.map((m) => {
    const evtData = eventsByMatch.get(m.id) ?? []
    const players = playersByMatch.get(m.id) ?? []

    // Player details aus Start-Event holen
    const startEvt = evtData.length > 0 ? fromJSON<any>(evtData[0]) : null
    const playerDetails = startEvt?.players ?? players.map((p) => ({ playerId: p.player_id, name: p.player_id, isGuest: p.is_guest === 1 }))

    return {
      id: m.id,
      title: m.title,
      createdAt: m.created_at,
      finished: m.finished === 1,
      finishedAt: m.finished_at,
      durationMs: m.duration_ms,
      winnerId: m.winner_id,
      winnerDarts: m.winner_darts,
      mode: m.mode,
      direction: m.direction,
      players: playerDetails,
      events: evtData.map((d) => fromJSON(d)).filter(Boolean),
      structure: m.structure_kind ? { kind: m.structure_kind, bestOfLegs: m.best_of_legs } : undefined,
      generatedSequence: m.generated_sequence ? (fromJSON<any[]>(m.generated_sequence) ?? undefined) : undefined,
    }
  })
}

export async function dbGetATBMatchById(matchId: string): Promise<DBATBMatch | null> {
  await ensureDB()

  const m = await queryOne<{
    id: string
    title: string
    created_at: string
    finished: number
    finished_at: string | null
    duration_ms: number | null
    winner_id: string | null
    winner_darts: number | null
    mode: string
    direction: string
    structure_kind: string | null
    best_of_legs: number | null
    generated_sequence: string | null
  }>('SELECT * FROM atb_matches WHERE id = ?', [matchId])

  if (!m) return null

  const events = await query<{ data: string }>(
    'SELECT data FROM atb_events WHERE match_id = ? ORDER BY seq',
    [matchId]
  )

  const players = await query<{ player_id: string; is_guest: number }>(
    'SELECT player_id, is_guest FROM atb_match_players WHERE match_id = ? ORDER BY position',
    [matchId]
  )

  const startEvt = events.length > 0 ? fromJSON<any>(events[0].data) : null
  const playerDetails = startEvt?.players ?? players.map((p) => ({ playerId: p.player_id, name: p.player_id, isGuest: p.is_guest === 1 }))

  return {
    id: m.id,
    title: m.title,
    createdAt: m.created_at,
    finished: m.finished === 1,
    finishedAt: m.finished_at,
    durationMs: m.duration_ms,
    winnerId: m.winner_id,
    winnerDarts: m.winner_darts,
    mode: m.mode,
    direction: m.direction,
    players: playerDetails,
    events: events.map((e) => fromJSON(e.data)).filter(Boolean),
    structure: m.structure_kind ? { kind: m.structure_kind, bestOfLegs: m.best_of_legs } : undefined,
    generatedSequence: m.generated_sequence ? (fromJSON<any[]>(m.generated_sequence) ?? undefined) : undefined,
  }
}

export async function dbSaveATBMatch(match: DBATBMatch): Promise<void> {
  await ensureDB()

  const statements: Array<{ sql: string; params: unknown[] }> = []

  statements.push({
    sql: `INSERT INTO atb_matches (
      id, title, created_at, finished, finished_at, duration_ms, winner_id, winner_darts,
      mode, direction, structure_kind, best_of_legs, legs_per_set, best_of_sets,
      sequence_mode, target_mode, multiplier_mode, special_rule, generated_sequence
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (id) DO UPDATE SET
      title = EXCLUDED.title,
      created_at = EXCLUDED.created_at,
      finished = EXCLUDED.finished,
      finished_at = EXCLUDED.finished_at,
      duration_ms = EXCLUDED.duration_ms,
      winner_id = EXCLUDED.winner_id,
      winner_darts = EXCLUDED.winner_darts,
      mode = EXCLUDED.mode,
      direction = EXCLUDED.direction,
      structure_kind = EXCLUDED.structure_kind,
      best_of_legs = EXCLUDED.best_of_legs,
      legs_per_set = EXCLUDED.legs_per_set,
      best_of_sets = EXCLUDED.best_of_sets,
      sequence_mode = EXCLUDED.sequence_mode,
      target_mode = EXCLUDED.target_mode,
      multiplier_mode = EXCLUDED.multiplier_mode,
      special_rule = EXCLUDED.special_rule,
      generated_sequence = EXCLUDED.generated_sequence`,
    params: [
      match.id,
      match.title,
      match.createdAt,
      match.finished ? 1 : 0,
      match.finishedAt,
      match.durationMs,
      match.winnerId,
      match.winnerDarts,
      match.mode,
      match.direction,
      match.structure?.kind ?? 'legs',
      match.structure?.bestOfLegs ?? null,
      match.structure?.legsPerSet ?? null,
      match.structure?.bestOfSets ?? null,
      match.config?.sequenceMode ?? null,
      match.config?.targetMode ?? null,
      match.config?.multiplierMode ?? null,
      match.config?.specialRule ?? null,
      match.generatedSequence ? toJSON(match.generatedSequence) : null,
    ],
  })

  statements.push({ sql: 'DELETE FROM atb_events WHERE match_id = ?', params: [match.id] })
  statements.push({ sql: 'DELETE FROM atb_match_players WHERE match_id = ?', params: [match.id] })

  for (let i = 0; i < match.players.length; i++) {
    const p = match.players[i]
    statements.push({
      sql: `INSERT INTO atb_match_players (match_id, player_id, position, is_guest)
            VALUES (?, ?, ?, ?)`,
      params: [match.id, p.playerId, i, p.isGuest ? 1 : 0],
    })
  }

  for (let seq = 0; seq < match.events.length; seq++) {
    const ev = match.events[seq]
    const enrichedEv = enrichEvent(ev)
    statements.push({
      sql: `INSERT INTO atb_events (id, match_id, type, ts, seq, data)
            VALUES (?, ?, ?, ?, ?, ?)`,
      params: [ev.eventId ?? generateId(), match.id, ev.type, ev.ts, seq, toJSON(enrichedEv)],
    })
  }

  await transaction(statements)
}

export async function dbUpdateATBEvents(matchId: string, events: any[]): Promise<void> {
  await ensureDB()

  const statements: Array<{ sql: string; params: unknown[] }> = []

  statements.push({ sql: 'DELETE FROM atb_events WHERE match_id = ?', params: [matchId] })

  for (let seq = 0; seq < events.length; seq++) {
    const ev = events[seq]
    const enrichedEv = enrichEvent(ev)
    statements.push({
      sql: `INSERT INTO atb_events (id, match_id, type, ts, seq, data)
            VALUES (?, ?, ?, ?, ?, ?)`,
      params: [ev.eventId ?? generateId(), matchId, ev.type, ev.ts, seq, toJSON(enrichedEv)],
    })
  }

  await transaction(statements)
}

export async function dbFinishATBMatch(
  matchId: string,
  winnerId: string,
  winnerDarts: number,
  durationMs: number
): Promise<void> {
  await ensureDB()
  await exec(
    `UPDATE atb_matches
     SET finished = 1, finished_at = ?, winner_id = ?, winner_darts = ?, duration_ms = ?
     WHERE id = ?`,
    [nowISO(), winnerId, winnerDarts, durationMs, matchId]
  )
}

// ============================================================================
// CTF (Capture The Field) Match Functions
// ============================================================================

export type DBCTFMatch = {
  id: string
  title: string
  createdAt: string
  finished: boolean
  finishedAt: string | null
  durationMs: number | null
  winnerId: string | null
  winnerDarts: number | null
  players: any[]
  events: any[]
  structure?: any
  config?: any
  generatedSequence?: any[]
  captureFieldWinners?: Record<string, string | null>
  captureTotalScores?: Record<string, number>
  captureFieldPoints?: Record<string, number>
}

export async function dbGetCTFMatches(): Promise<DBCTFMatch[]> {
  await ensureDB()

  // Optimized: Load only recent matches (last 50) + their events
  const MATCH_LIMIT = 50

  const results = await batchQuery([
    { sql: `SELECT * FROM ctf_matches ORDER BY created_at DESC LIMIT ${MATCH_LIMIT}` },
    { sql: `SELECT e.match_id, e.data FROM ctf_events e INNER JOIN (SELECT id FROM ctf_matches ORDER BY created_at DESC LIMIT ${MATCH_LIMIT}) m ON e.match_id = m.id ORDER BY e.match_id, e.seq` },
    { sql: `SELECT mp.match_id, mp.player_id, mp.is_guest FROM ctf_match_players mp INNER JOIN (SELECT id FROM ctf_matches ORDER BY created_at DESC LIMIT ${MATCH_LIMIT}) m ON mp.match_id = m.id ORDER BY mp.match_id, mp.position` },
  ])
  const matches = (results[0]?.data ?? []) as any[]
  const allEvents = (results[1]?.data ?? []) as any[]
  const allPlayers = (results[2]?.data ?? []) as any[]

  // Group by match_id
  const eventsByMatch = new Map<string, string[]>()
  for (const e of allEvents) {
    const arr = eventsByMatch.get(e.match_id)
    if (arr) arr.push(e.data); else eventsByMatch.set(e.match_id, [e.data])
  }
  const playersByMatch = new Map<string, { player_id: string; is_guest: number }[]>()
  for (const p of allPlayers) {
    const arr = playersByMatch.get(p.match_id)
    if (arr) arr.push(p); else playersByMatch.set(p.match_id, [p])
  }

  return matches.map((m) => {
    const evtData = eventsByMatch.get(m.id) ?? []
    const players = playersByMatch.get(m.id) ?? []

    const startEvt = evtData.length > 0 ? fromJSON<any>(evtData[0]) : null
    const playerDetails = startEvt?.players ?? players.map((p) => ({
      playerId: p.player_id, name: p.player_id, isGuest: p.is_guest === 1,
    }))

    return {
      id: m.id,
      title: m.title,
      createdAt: m.created_at,
      finished: m.finished === 1,
      finishedAt: m.finished_at,
      durationMs: m.duration_ms,
      winnerId: m.winner_id,
      winnerDarts: m.winner_darts,
      players: playerDetails,
      events: evtData.map((d) => fromJSON(d)).filter(Boolean),
      structure: m.structure_kind
        ? m.structure_kind === 'legs'
          ? { kind: 'legs', bestOfLegs: m.best_of_legs }
          : { kind: 'sets', bestOfSets: m.best_of_sets, legsPerSet: m.legs_per_set }
        : undefined,
      config: {
        multiplierMode: m.multiplier_mode ?? 'standard',
        rotateOrder: m.rotate_order === 1,
        bullPosition: m.bull_position,
      },
      generatedSequence: m.generated_sequence ? (fromJSON<any[]>(m.generated_sequence) ?? undefined) : undefined,
      captureFieldWinners: m.capture_field_winners ? (fromJSON<any>(m.capture_field_winners) ?? undefined) : undefined,
      captureTotalScores: m.capture_total_scores ? (fromJSON<any>(m.capture_total_scores) ?? undefined) : undefined,
    }
  })
}

export async function dbSaveCTFMatch(match: DBCTFMatch): Promise<void> {
  const ready = await ensureDB()
  if (!ready) {
    console.warn('[DB] dbSaveCTFMatch: DB not ready, skipping SQLite save for', match.id)
    return
  }

  const startEvt = match.events.find((e: any) => e.type === 'CTFMatchStarted')
  const finishEvt = match.events.find((e: any) => e.type === 'CTFMatchFinished')

  const statements: Array<{ sql: string; params: unknown[] }> = []

  statements.push({
    sql: `INSERT INTO ctf_matches (
      id, title, created_at, finished, finished_at, duration_ms, winner_id, winner_darts,
      multiplier_mode, rotate_order, bull_position,
      structure_kind, best_of_legs, legs_per_set, best_of_sets,
      generated_sequence, capture_field_winners, capture_total_scores
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (id) DO UPDATE SET
      title = EXCLUDED.title,
      created_at = EXCLUDED.created_at,
      finished = EXCLUDED.finished,
      finished_at = EXCLUDED.finished_at,
      duration_ms = EXCLUDED.duration_ms,
      winner_id = EXCLUDED.winner_id,
      winner_darts = EXCLUDED.winner_darts,
      multiplier_mode = EXCLUDED.multiplier_mode,
      rotate_order = EXCLUDED.rotate_order,
      bull_position = EXCLUDED.bull_position,
      structure_kind = EXCLUDED.structure_kind,
      best_of_legs = EXCLUDED.best_of_legs,
      legs_per_set = EXCLUDED.legs_per_set,
      best_of_sets = EXCLUDED.best_of_sets,
      generated_sequence = EXCLUDED.generated_sequence,
      capture_field_winners = EXCLUDED.capture_field_winners,
      capture_total_scores = EXCLUDED.capture_total_scores`,
    params: [
      match.id,
      match.title,
      match.createdAt,
      match.finished ? 1 : 0,
      match.finishedAt ?? finishEvt?.ts ?? null,
      match.durationMs ?? finishEvt?.durationMs ?? null,
      match.winnerId ?? finishEvt?.winnerId ?? null,
      match.winnerDarts ?? finishEvt?.totalDarts ?? null,
      match.config?.multiplierMode ?? startEvt?.config?.multiplierMode ?? 'standard',
      match.config?.rotateOrder !== false ? 1 : 0,
      match.config?.bullPosition ?? startEvt?.config?.bullPosition ?? null,
      match.structure?.kind ?? startEvt?.structure?.kind ?? 'legs',
      match.structure?.bestOfLegs ?? startEvt?.structure?.bestOfLegs ?? null,
      match.structure?.legsPerSet ?? startEvt?.structure?.legsPerSet ?? null,
      match.structure?.bestOfSets ?? startEvt?.structure?.bestOfSets ?? null,
      match.generatedSequence ? toJSON(match.generatedSequence) : null,
      match.captureFieldWinners ? toJSON(match.captureFieldWinners) : null,
      match.captureTotalScores ? toJSON(match.captureTotalScores) : null,
    ],
  })

  statements.push({ sql: 'DELETE FROM ctf_events WHERE match_id = ?', params: [match.id] })
  statements.push({ sql: 'DELETE FROM ctf_match_players WHERE match_id = ?', params: [match.id] })

  const players = startEvt?.players ?? match.players ?? []
  for (let i = 0; i < players.length; i++) {
    const p = players[i]
    statements.push({
      sql: `INSERT INTO ctf_match_players (match_id, player_id, position, is_guest)
            VALUES (?, ?, ?, ?)`,
      params: [match.id, p.playerId, i, p.isGuest ? 1 : 0],
    })
  }

  for (let seq = 0; seq < match.events.length; seq++) {
    const ev = match.events[seq]
    const enrichedEv = enrichEvent(ev)
    statements.push({
      sql: `INSERT INTO ctf_events (id, match_id, type, ts, seq, data)
            VALUES (?, ?, ?, ?, ?, ?)`,
      params: [ev.eventId ?? generateId(), match.id, ev.type, ev.ts, seq, toJSON(enrichedEv)],
    })
  }

  await transaction(statements)
}

export async function dbUpdateCTFEvents(matchId: string, events: any[]): Promise<void> {
  const ready = await ensureDB()
  if (!ready) return

  const statements: Array<{ sql: string; params: unknown[] }> = []

  statements.push({ sql: 'DELETE FROM ctf_events WHERE match_id = ?', params: [matchId] })

  for (let seq = 0; seq < events.length; seq++) {
    const ev = events[seq]
    const enrichedEv = enrichEvent(ev)
    statements.push({
      sql: `INSERT INTO ctf_events (id, match_id, type, ts, seq, data)
            VALUES (?, ?, ?, ?, ?, ?)`,
      params: [ev.eventId ?? generateId(), matchId, ev.type, ev.ts, seq, toJSON(enrichedEv)],
    })
  }

  const finishEvt = events.find((e: any) => e.type === 'CTFMatchFinished')
  if (finishEvt) {
    statements.push({
      sql: `UPDATE ctf_matches SET finished = 1, finished_at = ?,
            winner_id = ?, winner_darts = ?, duration_ms = ? WHERE id = ?`,
      params: [finishEvt.ts, finishEvt.winnerId, finishEvt.totalDarts, finishEvt.durationMs, matchId],
    })
  }

  await transaction(statements)
}

// ============================================================================
// STR (Sträußchen) Match Functions
// ============================================================================

export type DBStrMatch = {
  id: string
  title: string
  createdAt: string
  finished: boolean
  finishedAt: string | null
  durationMs: number | null
  winnerId: string | null
  winnerDarts: number | null
  mode: string
  targetNumber: number | null
  numberOrder: string | null
  turnOrder: string | null
  ringMode: string | null
  bullMode: string | null
  bullPosition: string | null
  players: any[]
  events: any[]
  structure?: any
  generatedOrder?: number[]
  legWins?: Record<string, number>
  setWins?: Record<string, number>
}

export async function dbGetStrMatches(): Promise<DBStrMatch[]> {
  await ensureDB()

  // Optimized: Load only recent matches (last 50) + their events
  const MATCH_LIMIT = 50

  const results = await batchQuery([
    { sql: `SELECT * FROM str_matches ORDER BY created_at DESC LIMIT ${MATCH_LIMIT}` },
    { sql: `SELECT e.match_id, e.data FROM str_events e INNER JOIN (SELECT id FROM str_matches ORDER BY created_at DESC LIMIT ${MATCH_LIMIT}) m ON e.match_id = m.id ORDER BY e.match_id, e.seq` },
    { sql: `SELECT mp.match_id, mp.player_id, mp.is_guest FROM str_match_players mp INNER JOIN (SELECT id FROM str_matches ORDER BY created_at DESC LIMIT ${MATCH_LIMIT}) m ON mp.match_id = m.id ORDER BY mp.match_id, mp.position` },
  ])
  const matches = (results[0]?.data ?? []) as any[]
  const allEvents = (results[1]?.data ?? []) as any[]
  const allPlayers = (results[2]?.data ?? []) as any[]

  // Group by match_id
  const eventsByMatch = new Map<string, string[]>()
  for (const e of allEvents) {
    const arr = eventsByMatch.get(e.match_id)
    if (arr) arr.push(e.data); else eventsByMatch.set(e.match_id, [e.data])
  }
  const playersByMatch = new Map<string, { player_id: string; is_guest: number }[]>()
  for (const p of allPlayers) {
    const arr = playersByMatch.get(p.match_id)
    if (arr) arr.push(p); else playersByMatch.set(p.match_id, [p])
  }

  return matches.map((m) => {
    const evtData = eventsByMatch.get(m.id) ?? []
    const players = playersByMatch.get(m.id) ?? []

    const startEvt = evtData.length > 0 ? fromJSON<any>(evtData[0]) : null
    const playerDetails = startEvt?.players ?? players.map((p: any) => ({
      playerId: p.player_id, name: p.player_id, isGuest: p.is_guest === 1,
    }))

    return {
      id: m.id,
      title: m.title,
      createdAt: m.created_at,
      finished: m.finished === 1,
      finishedAt: m.finished_at,
      durationMs: m.duration_ms,
      winnerId: m.winner_id,
      winnerDarts: m.winner_darts,
      mode: m.mode,
      targetNumber: m.target_number,
      numberOrder: m.number_order,
      turnOrder: m.turn_order,
      ringMode: m.ring_mode,
      bullMode: m.bull_mode,
      bullPosition: m.bull_position,
      players: playerDetails,
      events: evtData.map((d) => fromJSON(d)).filter(Boolean),
      structure: m.structure_kind
        ? m.structure_kind === 'legs'
          ? { kind: 'legs', bestOfLegs: m.best_of_legs }
          : { kind: 'sets', bestOfSets: m.best_of_sets, legsPerSet: m.legs_per_set }
        : undefined,
      generatedOrder: m.generated_order ? (fromJSON<number[]>(m.generated_order) ?? undefined) : undefined,
      legWins: m.leg_wins ? (fromJSON<Record<string, number>>(m.leg_wins) ?? undefined) : undefined,
      setWins: m.set_wins ? (fromJSON<Record<string, number>>(m.set_wins) ?? undefined) : undefined,
    }
  })
}

export async function dbSaveStrMatch(match: DBStrMatch): Promise<void> {
  const ready = await ensureDB()
  if (!ready) {
    console.warn('[DB] dbSaveStrMatch: DB not ready, skipping SQLite save for', match.id)
    return
  }

  const startEvt = match.events.find((e: any) => e.type === 'StrMatchStarted')

  const statements: Array<{ sql: string; params: unknown[] }> = []

  statements.push({
    sql: `INSERT INTO str_matches (
      id, title, created_at, finished, finished_at, duration_ms, winner_id, winner_darts,
      mode, target_number, number_order, turn_order, ring_mode, bull_mode, bull_position,
      structure_kind, best_of_legs, legs_per_set, best_of_sets,
      generated_order, leg_wins, set_wins
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (id) DO UPDATE SET
      title = EXCLUDED.title,
      created_at = EXCLUDED.created_at,
      finished = EXCLUDED.finished,
      finished_at = EXCLUDED.finished_at,
      duration_ms = EXCLUDED.duration_ms,
      winner_id = EXCLUDED.winner_id,
      winner_darts = EXCLUDED.winner_darts,
      mode = EXCLUDED.mode,
      target_number = EXCLUDED.target_number,
      number_order = EXCLUDED.number_order,
      turn_order = EXCLUDED.turn_order,
      ring_mode = EXCLUDED.ring_mode,
      bull_mode = EXCLUDED.bull_mode,
      bull_position = EXCLUDED.bull_position,
      structure_kind = EXCLUDED.structure_kind,
      best_of_legs = EXCLUDED.best_of_legs,
      legs_per_set = EXCLUDED.legs_per_set,
      best_of_sets = EXCLUDED.best_of_sets,
      generated_order = EXCLUDED.generated_order,
      leg_wins = EXCLUDED.leg_wins,
      set_wins = EXCLUDED.set_wins`,
    params: [
      match.id,
      match.title,
      match.createdAt,
      match.finished ? 1 : 0,
      match.finishedAt,
      match.durationMs,
      match.winnerId,
      match.winnerDarts,
      match.mode ?? startEvt?.mode ?? 'single',
      match.targetNumber ?? startEvt?.targetNumber ?? null,
      match.numberOrder ?? startEvt?.numberOrder ?? null,
      match.turnOrder ?? startEvt?.turnOrder ?? null,
      match.ringMode ?? startEvt?.ringMode ?? null,
      match.bullMode ?? startEvt?.bullMode ?? null,
      match.bullPosition ?? startEvt?.bullPosition ?? null,
      match.structure?.kind ?? startEvt?.structure?.kind ?? 'legs',
      match.structure?.bestOfLegs ?? startEvt?.structure?.bestOfLegs ?? null,
      match.structure?.legsPerSet ?? startEvt?.structure?.legsPerSet ?? null,
      match.structure?.bestOfSets ?? startEvt?.structure?.bestOfSets ?? null,
      match.generatedOrder ? toJSON(match.generatedOrder) : (startEvt?.generatedOrder ? toJSON(startEvt.generatedOrder) : null),
      match.legWins ? toJSON(match.legWins) : null,
      match.setWins ? toJSON(match.setWins) : null,
    ],
  })

  statements.push({ sql: 'DELETE FROM str_events WHERE match_id = ?', params: [match.id] })
  statements.push({ sql: 'DELETE FROM str_match_players WHERE match_id = ?', params: [match.id] })

  const players = startEvt?.players ?? match.players ?? []
  for (let i = 0; i < players.length; i++) {
    const p = players[i]
    statements.push({
      sql: `INSERT INTO str_match_players (match_id, player_id, position, is_guest)
            VALUES (?, ?, ?, ?)`,
      params: [match.id, p.playerId, i, p.isGuest ? 1 : 0],
    })
  }

  for (let seq = 0; seq < match.events.length; seq++) {
    const ev = match.events[seq]
    const enrichedEv = enrichEvent(ev)
    statements.push({
      sql: `INSERT INTO str_events (id, match_id, type, ts, seq, data)
            VALUES (?, ?, ?, ?, ?, ?)`,
      params: [ev.eventId ?? generateId(), match.id, ev.type, ev.ts, seq, toJSON(enrichedEv)],
    })
  }

  await transaction(statements)
}

export async function dbUpdateStrEvents(matchId: string, events: any[]): Promise<void> {
  const ready = await ensureDB()
  if (!ready) return

  const statements: Array<{ sql: string; params: unknown[] }> = []

  statements.push({ sql: 'DELETE FROM str_events WHERE match_id = ?', params: [matchId] })

  for (let seq = 0; seq < events.length; seq++) {
    const ev = events[seq]
    const enrichedEv = enrichEvent(ev)
    statements.push({
      sql: `INSERT INTO str_events (id, match_id, type, ts, seq, data)
            VALUES (?, ?, ?, ?, ?, ?)`,
      params: [ev.eventId ?? generateId(), matchId, ev.type, ev.ts, seq, toJSON(enrichedEv)],
    })
  }

  const finishEvt = events.find((e: any) => e.type === 'StrMatchFinished')
  if (finishEvt) {
    statements.push({
      sql: `UPDATE str_matches SET finished = 1, finished_at = ?,
            winner_id = ?, winner_darts = ?, duration_ms = ? WHERE id = ?`,
      params: [finishEvt.ts, finishEvt.winnerId, finishEvt.totalDarts, finishEvt.durationMs, matchId],
    })
  }

  await transaction(statements)
}

export async function dbFinishStrMatch(
  matchId: string,
  winnerId: string,
  winnerDarts: number,
  durationMs: number,
  legWins?: Record<string, number>,
  setWins?: Record<string, number>
): Promise<void> {
  const ready = await ensureDB()
  if (!ready) return
  await exec(
    `UPDATE str_matches
     SET finished = 1, finished_at = ?, winner_id = ?, winner_darts = ?, duration_ms = ?,
         leg_wins = ?, set_wins = ?
     WHERE id = ?`,
    [nowISO(), winnerId, winnerDarts, durationMs,
     legWins ? toJSON(legWins) : null, setWins ? toJSON(setWins) : null, matchId]
  )
}

// ============================================================================
// Highscore Match Functions
// ============================================================================

export type DBHighscoreMatch = {
  id: string
  title: string
  createdAt: string
  finished: boolean
  finishedAt: string | null
  durationMs: number | null
  winnerId: string | null
  winnerDarts: number | null
  targetScore: number
  players: any[]
  events: any[]
  structure?: any
  legWins?: Record<string, number>
  setWins?: Record<string, number>
}

export async function dbGetHighscoreMatches(): Promise<DBHighscoreMatch[]> {
  await ensureDB()

  // Optimized: Load only recent matches (last 50) + their events
  const MATCH_LIMIT = 50

  const results = await batchQuery([
    { sql: `SELECT * FROM highscore_matches ORDER BY created_at DESC LIMIT ${MATCH_LIMIT}` },
    { sql: `SELECT e.match_id, e.data FROM highscore_events e INNER JOIN (SELECT id FROM highscore_matches ORDER BY created_at DESC LIMIT ${MATCH_LIMIT}) m ON e.match_id = m.id ORDER BY e.match_id, e.seq` },
    { sql: `SELECT mp.match_id, mp.player_id, mp.is_guest FROM highscore_match_players mp INNER JOIN (SELECT id FROM highscore_matches ORDER BY created_at DESC LIMIT ${MATCH_LIMIT}) m ON mp.match_id = m.id ORDER BY mp.match_id, mp.position` },
  ])
  const matches = (results[0]?.data ?? []) as any[]
  const allEvents = (results[1]?.data ?? []) as any[]
  const allPlayers = (results[2]?.data ?? []) as any[]

  // Group by match_id
  const eventsByMatch = new Map<string, string[]>()
  for (const e of allEvents) {
    const arr = eventsByMatch.get(e.match_id)
    if (arr) arr.push(e.data); else eventsByMatch.set(e.match_id, [e.data])
  }
  const playersByMatch = new Map<string, { player_id: string; is_guest: number }[]>()
  for (const p of allPlayers) {
    const arr = playersByMatch.get(p.match_id)
    if (arr) arr.push(p); else playersByMatch.set(p.match_id, [p])
  }

  return matches.map((m) => {
    const evtData = eventsByMatch.get(m.id) ?? []
    const players = playersByMatch.get(m.id) ?? []

    const startEvt = evtData.length > 0 ? fromJSON<any>(evtData[0]) : null
    const playerDetails = startEvt?.players ?? players.map((p: any) => ({
      id: p.player_id, name: p.player_id, isGuest: p.is_guest === 1,
    }))

    return {
      id: m.id,
      title: m.title,
      createdAt: m.created_at,
      finished: m.finished === 1,
      finishedAt: m.finished_at,
      durationMs: m.duration_ms,
      winnerId: m.winner_id,
      winnerDarts: m.winner_darts,
      targetScore: m.target_score,
      players: playerDetails,
      events: evtData.map((d) => fromJSON(d)).filter(Boolean),
      structure: m.structure_kind
        ? m.structure_kind === 'legs'
          ? { kind: 'legs', targetLegs: m.target_legs }
          : { kind: 'sets', targetSets: m.target_sets, legsPerSet: m.legs_per_set }
        : undefined,
      legWins: m.leg_wins ? (fromJSON<Record<string, number>>(m.leg_wins) ?? undefined) : undefined,
      setWins: m.set_wins ? (fromJSON<Record<string, number>>(m.set_wins) ?? undefined) : undefined,
    }
  })
}

export async function dbSaveHighscoreMatch(match: DBHighscoreMatch): Promise<void> {
  const ready = await ensureDB()
  if (!ready) {
    console.warn('[DB] dbSaveHighscoreMatch: DB not ready, skipping SQLite save for', match.id)
    return
  }

  const startEvt = match.events.find((e: any) => e.type === 'HighscoreMatchStarted')

  const statements: Array<{ sql: string; params: unknown[] }> = []

  statements.push({
    sql: `INSERT INTO highscore_matches (
      id, title, created_at, finished, finished_at, duration_ms, winner_id, winner_darts,
      target_score, structure_kind, target_legs, legs_per_set, target_sets,
      leg_wins, set_wins
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (id) DO UPDATE SET
      title = EXCLUDED.title,
      created_at = EXCLUDED.created_at,
      finished = EXCLUDED.finished,
      finished_at = EXCLUDED.finished_at,
      duration_ms = EXCLUDED.duration_ms,
      winner_id = EXCLUDED.winner_id,
      winner_darts = EXCLUDED.winner_darts,
      target_score = EXCLUDED.target_score,
      structure_kind = EXCLUDED.structure_kind,
      target_legs = EXCLUDED.target_legs,
      legs_per_set = EXCLUDED.legs_per_set,
      target_sets = EXCLUDED.target_sets,
      leg_wins = EXCLUDED.leg_wins,
      set_wins = EXCLUDED.set_wins`,
    params: [
      match.id,
      match.title,
      match.createdAt,
      match.finished ? 1 : 0,
      match.finishedAt,
      match.durationMs,
      match.winnerId,
      match.winnerDarts,
      match.targetScore ?? startEvt?.targetScore ?? 300,
      match.structure?.kind ?? startEvt?.structure?.kind ?? 'legs',
      match.structure?.targetLegs ?? startEvt?.structure?.targetLegs ?? null,
      match.structure?.legsPerSet ?? startEvt?.structure?.legsPerSet ?? null,
      match.structure?.targetSets ?? startEvt?.structure?.targetSets ?? null,
      match.legWins ? toJSON(match.legWins) : null,
      match.setWins ? toJSON(match.setWins) : null,
    ],
  })

  statements.push({ sql: 'DELETE FROM highscore_events WHERE match_id = ?', params: [match.id] })
  statements.push({ sql: 'DELETE FROM highscore_match_players WHERE match_id = ?', params: [match.id] })

  const players = startEvt?.players ?? match.players ?? []
  for (let i = 0; i < players.length; i++) {
    const p = players[i]
    statements.push({
      sql: `INSERT INTO highscore_match_players (match_id, player_id, position, is_guest)
            VALUES (?, ?, ?, ?)`,
      params: [match.id, p.id ?? p.playerId, i, p.isGuest ? 1 : 0],
    })
  }

  for (let seq = 0; seq < match.events.length; seq++) {
    const ev = match.events[seq]
    const enrichedEv = enrichEvent(ev)
    // Highscore nutzt timestamp (number) statt ts (string)
    const ts = ev.ts ?? (ev.timestamp ? new Date(ev.timestamp).toISOString() : nowISO())
    statements.push({
      sql: `INSERT INTO highscore_events (id, match_id, type, ts, seq, data)
            VALUES (?, ?, ?, ?, ?, ?)`,
      params: [ev.eventId ?? generateId(), match.id, ev.type, ts, seq, toJSON(enrichedEv)],
    })
  }

  await transaction(statements)
}

export async function dbUpdateHighscoreEvents(matchId: string, events: any[]): Promise<void> {
  const ready = await ensureDB()
  if (!ready) return

  const statements: Array<{ sql: string; params: unknown[] }> = []

  statements.push({ sql: 'DELETE FROM highscore_events WHERE match_id = ?', params: [matchId] })

  for (let seq = 0; seq < events.length; seq++) {
    const ev = events[seq]
    const enrichedEv = enrichEvent(ev)
    const ts = ev.ts ?? (ev.timestamp ? new Date(ev.timestamp).toISOString() : nowISO())
    statements.push({
      sql: `INSERT INTO highscore_events (id, match_id, type, ts, seq, data)
            VALUES (?, ?, ?, ?, ?, ?)`,
      params: [ev.eventId ?? generateId(), matchId, ev.type, ts, seq, toJSON(enrichedEv)],
    })
  }

  const finishEvt = events.find((e: any) => e.type === 'HighscoreMatchFinished')
  if (finishEvt) {
    const finishedAt = finishEvt.ts ?? (finishEvt.timestamp ? new Date(finishEvt.timestamp).toISOString() : nowISO())
    statements.push({
      sql: `UPDATE highscore_matches SET finished = 1, finished_at = ?,
            winner_id = ?, winner_darts = ?, duration_ms = ?,
            leg_wins = ?, set_wins = ? WHERE id = ?`,
      params: [
        finishedAt, finishEvt.winnerId, finishEvt.totalDarts, finishEvt.durationMs,
        finishEvt.legWins ? toJSON(finishEvt.legWins) : null,
        finishEvt.setWins ? toJSON(finishEvt.setWins) : null,
        matchId,
      ],
    })
  }

  await transaction(statements)
}

export async function dbFinishHighscoreMatch(
  matchId: string,
  winnerId: string,
  winnerDarts: number,
  durationMs: number,
  legWins?: Record<string, number>,
  setWins?: Record<string, number>
): Promise<void> {
  const ready = await ensureDB()
  if (!ready) return
  await exec(
    `UPDATE highscore_matches
     SET finished = 1, finished_at = ?, winner_id = ?, winner_darts = ?, duration_ms = ?,
         leg_wins = ?, set_wins = ?
     WHERE id = ?`,
    [nowISO(), winnerId, winnerDarts, durationMs,
     legWins ? toJSON(legWins) : null, setWins ? toJSON(setWins) : null, matchId]
  )
}

// ============================================================================
// Shanghai Match Functions
// ============================================================================

export type DBShanghaiMatch = {
  id: string
  title: string
  createdAt: string
  finished: boolean
  finishedAt: string | null
  durationMs: number | null
  winnerId: string | null
  winnerDarts: number | null
  players: any[]
  events: any[]
  structure?: any
  config?: any
  legWins?: Record<string, number>
  setWins?: Record<string, number>
  finalScores?: Record<string, number>
}

export async function dbGetShanghaiMatches(): Promise<DBShanghaiMatch[]> {
  await ensureDB()

  // Optimized: Load only recent matches (last 50) + their events
  const MATCH_LIMIT = 50

  const results = await batchQuery([
    { sql: `SELECT * FROM shanghai_matches ORDER BY created_at DESC LIMIT ${MATCH_LIMIT}` },
    { sql: `SELECT e.match_id, e.data FROM shanghai_events e INNER JOIN (SELECT id FROM shanghai_matches ORDER BY created_at DESC LIMIT ${MATCH_LIMIT}) m ON e.match_id = m.id ORDER BY e.match_id, e.seq` },
    { sql: `SELECT mp.match_id, mp.player_id, mp.is_guest FROM shanghai_match_players mp INNER JOIN (SELECT id FROM shanghai_matches ORDER BY created_at DESC LIMIT ${MATCH_LIMIT}) m ON mp.match_id = m.id ORDER BY mp.match_id, mp.position` },
  ])
  const matches = (results[0]?.data ?? []) as any[]
  const allEvents = (results[1]?.data ?? []) as any[]
  const allPlayers = (results[2]?.data ?? []) as any[]

  // Group by match_id
  const eventsByMatch = new Map<string, string[]>()
  for (const e of allEvents) {
    const arr = eventsByMatch.get(e.match_id)
    if (arr) arr.push(e.data); else eventsByMatch.set(e.match_id, [e.data])
  }
  const playersByMatch = new Map<string, { player_id: string; is_guest: number }[]>()
  for (const p of allPlayers) {
    const arr = playersByMatch.get(p.match_id)
    if (arr) arr.push(p); else playersByMatch.set(p.match_id, [p])
  }

  return matches.map((m) => {
    const evtData = eventsByMatch.get(m.id) ?? []
    const players = playersByMatch.get(m.id) ?? []

    const startEvt = evtData.length > 0 ? fromJSON<any>(evtData[0]) : null
    const playerDetails = startEvt?.players ?? players.map((p: any) => ({
      playerId: p.player_id, name: p.player_id, isGuest: p.is_guest === 1,
    }))

    return {
      id: m.id,
      title: m.title,
      createdAt: m.created_at,
      finished: m.finished === 1,
      finishedAt: m.finished_at,
      durationMs: m.duration_ms,
      winnerId: m.winner_id,
      winnerDarts: m.winner_darts,
      players: playerDetails,
      events: evtData.map((d) => fromJSON(d)).filter(Boolean),
      structure: m.structure_kind
        ? m.structure_kind === 'legs'
          ? { kind: 'legs', bestOfLegs: m.best_of_legs }
          : { kind: 'sets', bestOfSets: m.best_of_sets, legsPerSet: m.legs_per_set }
        : undefined,
      finalScores: m.final_scores ? (fromJSON<Record<string, number>>(m.final_scores) ?? undefined) : undefined,
      legWins: m.leg_wins ? (fromJSON<Record<string, number>>(m.leg_wins) ?? undefined) : undefined,
      setWins: m.set_wins ? (fromJSON<Record<string, number>>(m.set_wins) ?? undefined) : undefined,
    }
  })
}

export async function dbGetShanghaiMatchById(matchId: string): Promise<DBShanghaiMatch | null> {
  await ensureDB()

  const m = await queryOne<{
    id: string
    title: string
    created_at: string
    finished: number
    finished_at: string | null
    duration_ms: number | null
    winner_id: string | null
    winner_darts: number | null
    structure_kind: string | null
    best_of_legs: number | null
    legs_per_set: number | null
    best_of_sets: number | null
    final_scores: string | null
    leg_wins: string | null
    set_wins: string | null
  }>('SELECT * FROM shanghai_matches WHERE id = ?', [matchId])

  if (!m) return null

  const events = await query<{ data: string }>(
    'SELECT data FROM shanghai_events WHERE match_id = ? ORDER BY seq',
    [matchId]
  )

  const players = await query<{ player_id: string; is_guest: number }>(
    'SELECT player_id, is_guest FROM shanghai_match_players WHERE match_id = ? ORDER BY position',
    [matchId]
  )

  const startEvt = events.length > 0 ? fromJSON<any>(events[0].data) : null
  const playerDetails = startEvt?.players ?? players.map((p: any) => ({
    playerId: p.player_id, name: p.player_id, isGuest: p.is_guest === 1,
  }))

  return {
    id: m.id,
    title: m.title,
    createdAt: m.created_at,
    finished: m.finished === 1,
    finishedAt: m.finished_at,
    durationMs: m.duration_ms,
    winnerId: m.winner_id,
    winnerDarts: m.winner_darts,
    players: playerDetails,
    events: events.map((e) => fromJSON(e.data)).filter(Boolean),
    structure: m.structure_kind
      ? m.structure_kind === 'legs'
        ? { kind: 'legs', bestOfLegs: m.best_of_legs }
        : { kind: 'sets', bestOfSets: m.best_of_sets, legsPerSet: m.legs_per_set }
      : undefined,
    finalScores: m.final_scores ? (fromJSON<Record<string, number>>(m.final_scores) ?? undefined) : undefined,
    legWins: m.leg_wins ? (fromJSON<Record<string, number>>(m.leg_wins) ?? undefined) : undefined,
    setWins: m.set_wins ? (fromJSON<Record<string, number>>(m.set_wins) ?? undefined) : undefined,
  }
}

export async function dbSaveShanghaiMatch(match: DBShanghaiMatch): Promise<void> {
  const ready = await ensureDB()
  if (!ready) {
    console.warn('[DB] dbSaveShanghaiMatch: DB not ready, skipping SQLite save for', match.id)
    return
  }

  const startEvt = match.events.find((e: any) => e.type === 'ShanghaiMatchStarted')

  const statements: Array<{ sql: string; params: unknown[] }> = []

  statements.push({
    sql: `INSERT INTO shanghai_matches (
      id, title, created_at, finished, finished_at, duration_ms, winner_id, winner_darts,
      structure_kind, best_of_legs, legs_per_set, best_of_sets,
      final_scores, leg_wins, set_wins
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (id) DO UPDATE SET
      title = EXCLUDED.title,
      created_at = EXCLUDED.created_at,
      finished = EXCLUDED.finished,
      finished_at = EXCLUDED.finished_at,
      duration_ms = EXCLUDED.duration_ms,
      winner_id = EXCLUDED.winner_id,
      winner_darts = EXCLUDED.winner_darts,
      structure_kind = EXCLUDED.structure_kind,
      best_of_legs = EXCLUDED.best_of_legs,
      legs_per_set = EXCLUDED.legs_per_set,
      best_of_sets = EXCLUDED.best_of_sets,
      final_scores = EXCLUDED.final_scores,
      leg_wins = EXCLUDED.leg_wins,
      set_wins = EXCLUDED.set_wins`,
    params: [
      match.id,
      match.title,
      match.createdAt,
      match.finished ? 1 : 0,
      match.finishedAt,
      match.durationMs,
      match.winnerId,
      match.winnerDarts,
      match.structure?.kind ?? startEvt?.structure?.kind ?? 'legs',
      match.structure?.bestOfLegs ?? startEvt?.structure?.bestOfLegs ?? null,
      match.structure?.legsPerSet ?? startEvt?.structure?.legsPerSet ?? null,
      match.structure?.bestOfSets ?? startEvt?.structure?.bestOfSets ?? null,
      match.finalScores ? toJSON(match.finalScores) : null,
      match.legWins ? toJSON(match.legWins) : null,
      match.setWins ? toJSON(match.setWins) : null,
    ],
  })

  statements.push({ sql: 'DELETE FROM shanghai_events WHERE match_id = ?', params: [match.id] })
  statements.push({ sql: 'DELETE FROM shanghai_match_players WHERE match_id = ?', params: [match.id] })

  const players = startEvt?.players ?? match.players ?? []
  for (let i = 0; i < players.length; i++) {
    const p = players[i]
    statements.push({
      sql: `INSERT INTO shanghai_match_players (match_id, player_id, position, is_guest)
            VALUES (?, ?, ?, ?)`,
      params: [match.id, p.playerId, i, p.isGuest ? 1 : 0],
    })
  }

  for (let seq = 0; seq < match.events.length; seq++) {
    const ev = match.events[seq]
    const enrichedEv = enrichEvent(ev)
    statements.push({
      sql: `INSERT INTO shanghai_events (id, match_id, type, ts, seq, data)
            VALUES (?, ?, ?, ?, ?, ?)`,
      params: [ev.eventId ?? generateId(), match.id, ev.type, ev.ts, seq, toJSON(enrichedEv)],
    })
  }

  await transaction(statements)
}

export async function dbUpdateShanghaiEvents(matchId: string, events: any[]): Promise<void> {
  const ready = await ensureDB()
  if (!ready) return

  const statements: Array<{ sql: string; params: unknown[] }> = []

  statements.push({ sql: 'DELETE FROM shanghai_events WHERE match_id = ?', params: [matchId] })

  for (let seq = 0; seq < events.length; seq++) {
    const ev = events[seq]
    const enrichedEv = enrichEvent(ev)
    statements.push({
      sql: `INSERT INTO shanghai_events (id, match_id, type, ts, seq, data)
            VALUES (?, ?, ?, ?, ?, ?)`,
      params: [ev.eventId ?? generateId(), matchId, ev.type, ev.ts, seq, toJSON(enrichedEv)],
    })
  }

  const finishEvt = events.find((e: any) => e.type === 'ShanghaiMatchFinished')
  if (finishEvt) {
    statements.push({
      sql: `UPDATE shanghai_matches SET finished = 1, finished_at = ?,
            winner_id = ?, winner_darts = ?, duration_ms = ? WHERE id = ?`,
      params: [finishEvt.ts, finishEvt.winnerId, finishEvt.totalDarts, finishEvt.durationMs, matchId],
    })
  }

  await transaction(statements)
}

export async function dbFinishShanghaiMatch(
  matchId: string,
  winnerId: string | null,
  winnerDarts: number,
  durationMs: number,
  finalScores?: Record<string, number>,
  legWins?: Record<string, number>,
  setWins?: Record<string, number>
): Promise<void> {
  const ready = await ensureDB()
  if (!ready) return
  await exec(
    `UPDATE shanghai_matches
     SET finished = 1, finished_at = ?, winner_id = ?, winner_darts = ?, duration_ms = ?,
         final_scores = ?, leg_wins = ?, set_wins = ?
     WHERE id = ?`,
    [nowISO(), winnerId, winnerDarts, durationMs,
     finalScores ? toJSON(finalScores) : null,
     legWins ? toJSON(legWins) : null, setWins ? toJSON(setWins) : null, matchId]
  )
}

// ============================================================================
// Killer Match Functions
// ============================================================================

export type DBKillerMatch = {
  id: string
  title: string
  createdAt: string
  finished: boolean
  finishedAt: string | null
  durationMs: number | null
  winnerId: string | null
  winnerDarts: number | null
  players: any[]
  events: any[]
  config?: any
  finalStandings?: any[]
  structure?: any
  legWins?: Record<string, number>
  setWins?: Record<string, number>
}

export async function dbGetKillerMatches(): Promise<DBKillerMatch[]> {
  await ensureDB()

  // Optimized: Load only recent matches (last 50) + their events
  const MATCH_LIMIT = 50

  const results = await batchQuery([
    { sql: `SELECT * FROM killer_matches ORDER BY created_at DESC LIMIT ${MATCH_LIMIT}` },
    { sql: `SELECT e.match_id, e.data FROM killer_events e INNER JOIN (SELECT id FROM killer_matches ORDER BY created_at DESC LIMIT ${MATCH_LIMIT}) m ON e.match_id = m.id ORDER BY e.match_id, e.seq` },
    { sql: `SELECT mp.match_id, mp.player_id, mp.is_guest FROM killer_match_players mp INNER JOIN (SELECT id FROM killer_matches ORDER BY created_at DESC LIMIT ${MATCH_LIMIT}) m ON mp.match_id = m.id ORDER BY mp.match_id, mp.position` },
  ])
  const matches = (results[0]?.data ?? []) as any[]
  const allEvents = (results[1]?.data ?? []) as any[]
  const allPlayers = (results[2]?.data ?? []) as any[]

  // Group by match_id
  const eventsByMatch = new Map<string, string[]>()
  for (const e of allEvents) {
    const arr = eventsByMatch.get(e.match_id)
    if (arr) arr.push(e.data); else eventsByMatch.set(e.match_id, [e.data])
  }
  const playersByMatch = new Map<string, { player_id: string; is_guest: number }[]>()
  for (const p of allPlayers) {
    const arr = playersByMatch.get(p.match_id)
    if (arr) arr.push(p); else playersByMatch.set(p.match_id, [p])
  }

  return matches.map((m) => {
    const evtData = eventsByMatch.get(m.id) ?? []
    const players = playersByMatch.get(m.id) ?? []

    const startEvt = evtData.length > 0 ? fromJSON<any>(evtData[0]) : null
    const playerDetails = startEvt?.players ?? players.map((p: any) => ({
      playerId: p.player_id, name: p.player_id, isGuest: p.is_guest === 1,
    }))

    // Structure aus DB oder Event rekonstruieren
    const structure = startEvt?.structure ?? (m.structure_kind === 'sets'
      ? { kind: 'sets', bestOfSets: m.best_of_sets ?? 3, legsPerSet: m.legs_per_set ?? 3 }
      : m.structure_kind === 'legs' && m.best_of_legs && m.best_of_legs > 1
        ? { kind: 'legs', bestOfLegs: m.best_of_legs }
        : undefined)

    return {
      id: m.id,
      title: m.title,
      createdAt: m.created_at,
      finished: m.finished === 1,
      finishedAt: m.finished_at,
      durationMs: m.duration_ms,
      winnerId: m.winner_id,
      winnerDarts: m.winner_darts,
      players: playerDetails,
      events: evtData.map((d) => fromJSON(d)).filter(Boolean),
      config: startEvt?.config,
      finalStandings: m.final_standings ? (fromJSON<any[]>(m.final_standings) ?? undefined) : undefined,
      structure,
      legWins: m.leg_wins ? (fromJSON<Record<string, number>>(m.leg_wins) ?? undefined) : undefined,
      setWins: m.set_wins ? (fromJSON<Record<string, number>>(m.set_wins) ?? undefined) : undefined,
    }
  })
}

export async function dbGetKillerMatchById(matchId: string): Promise<DBKillerMatch | null> {
  await ensureDB()

  const m = await queryOne<{
    id: string
    title: string
    created_at: string
    finished: number
    finished_at: string | null
    duration_ms: number | null
    winner_id: string | null
    winner_darts: number | null
    final_standings: string | null
    structure_kind: string | null
    best_of_legs: number | null
    legs_per_set: number | null
    best_of_sets: number | null
    leg_wins: string | null
    set_wins: string | null
  }>('SELECT * FROM killer_matches WHERE id = ?', [matchId])

  if (!m) return null

  const events = await query<{ data: string }>(
    'SELECT data FROM killer_events WHERE match_id = ? ORDER BY seq',
    [matchId]
  )

  const players = await query<{ player_id: string; is_guest: number }>(
    'SELECT player_id, is_guest FROM killer_match_players WHERE match_id = ? ORDER BY position',
    [matchId]
  )

  const startEvt = events.length > 0 ? fromJSON<any>(events[0].data) : null
  const playerDetails = startEvt?.players ?? players.map((p: any) => ({
    playerId: p.player_id, name: p.player_id, isGuest: p.is_guest === 1,
  }))

  const structure = startEvt?.structure ?? (m.structure_kind === 'sets'
    ? { kind: 'sets', bestOfSets: m.best_of_sets ?? 3, legsPerSet: m.legs_per_set ?? 3 }
    : m.structure_kind === 'legs' && m.best_of_legs && m.best_of_legs > 1
      ? { kind: 'legs', bestOfLegs: m.best_of_legs }
      : undefined)

  return {
    id: m.id,
    title: m.title,
    createdAt: m.created_at,
    finished: m.finished === 1,
    finishedAt: m.finished_at,
    durationMs: m.duration_ms,
    winnerId: m.winner_id,
    winnerDarts: m.winner_darts,
    players: playerDetails,
    events: events.map((e) => fromJSON(e.data)).filter(Boolean),
    config: startEvt?.config,
    finalStandings: m.final_standings ? (fromJSON<any[]>(m.final_standings) ?? undefined) : undefined,
    structure,
    legWins: m.leg_wins ? (fromJSON<Record<string, number>>(m.leg_wins) ?? undefined) : undefined,
    setWins: m.set_wins ? (fromJSON<Record<string, number>>(m.set_wins) ?? undefined) : undefined,
  }
}

export async function dbSaveKillerMatch(match: DBKillerMatch): Promise<void> {
  const ready = await ensureDB()
  if (!ready) {
    console.warn('[DB] dbSaveKillerMatch: DB not ready, skipping SQLite save for', match.id)
    return
  }

  const startEvt = match.events.find((e: any) => e.type === 'KillerMatchStarted')
  const config = match.config ?? startEvt?.config

  const statements: Array<{ sql: string; params: unknown[] }> = []

  const structure = match.structure ?? startEvt?.structure

  statements.push({
    sql: `INSERT INTO killer_matches (
      id, title, created_at, finished, finished_at, duration_ms, winner_id, winner_darts,
      hits_to_become_killer, qualifying_ring, starting_lives,
      friendly_fire, self_heal, no_negative_lives, secret_numbers, target_assignment,
      final_standings, structure_kind, best_of_legs, legs_per_set, best_of_sets, leg_wins, set_wins
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (id) DO UPDATE SET
      title = EXCLUDED.title,
      created_at = EXCLUDED.created_at,
      finished = EXCLUDED.finished,
      finished_at = EXCLUDED.finished_at,
      duration_ms = EXCLUDED.duration_ms,
      winner_id = EXCLUDED.winner_id,
      winner_darts = EXCLUDED.winner_darts,
      hits_to_become_killer = EXCLUDED.hits_to_become_killer,
      qualifying_ring = EXCLUDED.qualifying_ring,
      starting_lives = EXCLUDED.starting_lives,
      friendly_fire = EXCLUDED.friendly_fire,
      self_heal = EXCLUDED.self_heal,
      no_negative_lives = EXCLUDED.no_negative_lives,
      secret_numbers = EXCLUDED.secret_numbers,
      target_assignment = EXCLUDED.target_assignment,
      final_standings = EXCLUDED.final_standings,
      structure_kind = EXCLUDED.structure_kind,
      best_of_legs = EXCLUDED.best_of_legs,
      legs_per_set = EXCLUDED.legs_per_set,
      best_of_sets = EXCLUDED.best_of_sets,
      leg_wins = EXCLUDED.leg_wins,
      set_wins = EXCLUDED.set_wins`,
    params: [
      match.id,
      match.title,
      match.createdAt,
      match.finished ? 1 : 0,
      match.finishedAt,
      match.durationMs,
      match.winnerId,
      match.winnerDarts,
      config?.hitsToBecomeKiller ?? 1,
      config?.qualifyingRing ?? 'DOUBLE',
      config?.startingLives ?? 3,
      config?.friendlyFire !== false ? 1 : 0,
      config?.selfHeal ? 1 : 0,
      config?.noNegativeLives !== false ? 1 : 0,
      config?.secretNumbers ? 1 : 0,
      config?.targetAssignment ?? 'auto',
      match.finalStandings ? toJSON(match.finalStandings) : null,
      structure?.kind ?? 'legs',
      structure?.kind === 'legs' ? structure.bestOfLegs : (structure?.kind === 'sets' ? null : 1),
      structure?.kind === 'sets' ? structure.legsPerSet : null,
      structure?.kind === 'sets' ? structure.bestOfSets : null,
      match.legWins ? toJSON(match.legWins) : null,
      match.setWins ? toJSON(match.setWins) : null,
    ],
  })

  statements.push({ sql: 'DELETE FROM killer_events WHERE match_id = ?', params: [match.id] })
  statements.push({ sql: 'DELETE FROM killer_match_players WHERE match_id = ?', params: [match.id] })

  const players = startEvt?.players ?? match.players ?? []
  for (let i = 0; i < players.length; i++) {
    const p = players[i]
    statements.push({
      sql: `INSERT INTO killer_match_players (match_id, player_id, position, is_guest)
            VALUES (?, ?, ?, ?)`,
      params: [match.id, p.playerId, i, p.isGuest ? 1 : 0],
    })
  }

  for (let seq = 0; seq < match.events.length; seq++) {
    const ev = match.events[seq]
    const enrichedEv = enrichEvent(ev)
    statements.push({
      sql: `INSERT INTO killer_events (id, match_id, type, ts, seq, data)
            VALUES (?, ?, ?, ?, ?, ?)`,
      params: [ev.eventId ?? generateId(), match.id, ev.type, ev.ts, seq, toJSON(enrichedEv)],
    })
  }

  await transaction(statements)
}

export async function dbUpdateKillerEvents(matchId: string, events: any[]): Promise<void> {
  const ready = await ensureDB()
  if (!ready) return

  const statements: Array<{ sql: string; params: unknown[] }> = []

  statements.push({ sql: 'DELETE FROM killer_events WHERE match_id = ?', params: [matchId] })

  for (let seq = 0; seq < events.length; seq++) {
    const ev = events[seq]
    const enrichedEv = enrichEvent(ev)
    statements.push({
      sql: `INSERT INTO killer_events (id, match_id, type, ts, seq, data)
            VALUES (?, ?, ?, ?, ?, ?)`,
      params: [ev.eventId ?? generateId(), matchId, ev.type, ev.ts, seq, toJSON(enrichedEv)],
    })
  }

  const finishEvt = events.find((e: any) => e.type === 'KillerMatchFinished')
  if (finishEvt) {
    statements.push({
      sql: `UPDATE killer_matches SET finished = 1, finished_at = ?,
            winner_id = ?, winner_darts = ?, duration_ms = ?,
            final_standings = ? WHERE id = ?`,
      params: [
        finishEvt.ts, finishEvt.winnerId, finishEvt.totalDarts, finishEvt.durationMs,
        finishEvt.finalStandings ? toJSON(finishEvt.finalStandings) : null,
        matchId,
      ],
    })
  }

  await transaction(statements)
}

export async function dbFinishKillerMatch(
  matchId: string,
  winnerId: string | null,
  winnerDarts: number,
  durationMs: number,
  finalStandings?: any[],
  legWins?: Record<string, number>,
  setWins?: Record<string, number>
): Promise<void> {
  const ready = await ensureDB()
  if (!ready) return
  await exec(
    `UPDATE killer_matches
     SET finished = 1, finished_at = ?, winner_id = ?, winner_darts = ?, duration_ms = ?,
         final_standings = ?, leg_wins = ?, set_wins = ?
     WHERE id = ?`,
    [nowISO(), winnerId, winnerDarts, durationMs,
     finalStandings ? toJSON(finalStandings) : null,
     legWins ? toJSON(legWins) : null,
     setWins ? toJSON(setWins) : null,
     matchId]
  )
}

// ============================================================================
// Bob's 27 Match Functions
// ============================================================================

export type DBBobs27Match = {
  id: string
  title: string
  createdAt: string
  finished: boolean
  finishedAt: string | null
  durationMs: number | null
  winnerId: string | null
  winnerDarts: number | null
  players: any[]
  events: any[]
  config?: any
  targets?: any[]
  finalScores?: Record<string, number>
}

export async function dbGetBobs27Matches(): Promise<DBBobs27Match[]> {
  await ensureDB()

  // Optimized: Load only recent matches (last 50) + their events
  const MATCH_LIMIT = 50

  const results = await batchQuery([
    { sql: `SELECT * FROM bobs27_matches ORDER BY created_at DESC LIMIT ${MATCH_LIMIT}` },
    { sql: `SELECT e.match_id, e.data FROM bobs27_events e INNER JOIN (SELECT id FROM bobs27_matches ORDER BY created_at DESC LIMIT ${MATCH_LIMIT}) m ON e.match_id = m.id ORDER BY e.match_id, e.seq` },
    { sql: `SELECT mp.match_id, mp.player_id, mp.is_guest FROM bobs27_match_players mp INNER JOIN (SELECT id FROM bobs27_matches ORDER BY created_at DESC LIMIT ${MATCH_LIMIT}) m ON mp.match_id = m.id ORDER BY mp.match_id, mp.position` },
  ])
  const matches = (results[0]?.data ?? []) as any[]
  const allEvents = (results[1]?.data ?? []) as any[]
  const allPlayers = (results[2]?.data ?? []) as any[]

  // Group by match_id
  const eventsByMatch = new Map<string, string[]>()
  for (const e of allEvents) {
    const arr = eventsByMatch.get(e.match_id)
    if (arr) arr.push(e.data); else eventsByMatch.set(e.match_id, [e.data])
  }
  const playersByMatch = new Map<string, { player_id: string; is_guest: number }[]>()
  for (const p of allPlayers) {
    const arr = playersByMatch.get(p.match_id)
    if (arr) arr.push(p); else playersByMatch.set(p.match_id, [p])
  }

  return matches.map((m) => {
    const evtData = eventsByMatch.get(m.id) ?? []
    const players = playersByMatch.get(m.id) ?? []

    const startEvt = evtData.length > 0 ? fromJSON<any>(evtData[0]) : null
    const playerDetails = startEvt?.players ?? players.map((p: any) => ({
      playerId: p.player_id, name: p.player_id, isGuest: p.is_guest === 1,
    }))

    return {
      id: m.id,
      title: m.title,
      createdAt: m.created_at,
      finished: m.finished === 1,
      finishedAt: m.finished_at,
      durationMs: m.duration_ms,
      winnerId: m.winner_id,
      winnerDarts: m.winner_darts,
      players: playerDetails,
      events: evtData.map((d) => fromJSON(d)).filter(Boolean),
      config: startEvt?.config ?? {
        startScore: m.start_score ?? 27,
        dartsPerTarget: m.darts_per_target ?? 3,
        includeBull: (m.include_bull ?? 0) === 1,
        allowNegative: (m.allow_negative ?? 0) === 1,
      },
      targets: startEvt?.targets,
      finalScores: m.final_scores ? (fromJSON<Record<string, number>>(m.final_scores) ?? undefined) : undefined,
    }
  })
}

export async function dbGetBobs27MatchById(matchId: string): Promise<DBBobs27Match | null> {
  await ensureDB()

  const m = await queryOne<{
    id: string
    title: string
    created_at: string
    finished: number
    finished_at: string | null
    duration_ms: number | null
    winner_id: string | null
    winner_darts: number | null
    start_score: number | null
    darts_per_target: number | null
    include_bull: number | null
    allow_negative: number | null
    final_scores: string | null
  }>('SELECT * FROM bobs27_matches WHERE id = ?', [matchId])

  if (!m) return null

  const events = await query<{ data: string }>(
    'SELECT data FROM bobs27_events WHERE match_id = ? ORDER BY seq',
    [matchId]
  )

  const players = await query<{ player_id: string; is_guest: number }>(
    'SELECT player_id, is_guest FROM bobs27_match_players WHERE match_id = ? ORDER BY position',
    [matchId]
  )

  const startEvt = events.length > 0 ? fromJSON<any>(events[0].data) : null
  const playerDetails = startEvt?.players ?? players.map((p: any) => ({
    playerId: p.player_id, name: p.player_id, isGuest: p.is_guest === 1,
  }))

  return {
    id: m.id,
    title: m.title,
    createdAt: m.created_at,
    finished: m.finished === 1,
    finishedAt: m.finished_at,
    durationMs: m.duration_ms,
    winnerId: m.winner_id,
    winnerDarts: m.winner_darts,
    players: playerDetails,
    events: events.map((e) => fromJSON(e.data)).filter(Boolean),
    config: startEvt?.config ?? {
      startScore: m.start_score ?? 27,
      dartsPerTarget: m.darts_per_target ?? 3,
      includeBull: (m.include_bull ?? 0) === 1,
      allowNegative: (m.allow_negative ?? 0) === 1,
    },
    targets: startEvt?.targets,
    finalScores: m.final_scores ? (fromJSON<Record<string, number>>(m.final_scores) ?? undefined) : undefined,
  }
}

export async function dbSaveBobs27Match(match: DBBobs27Match): Promise<void> {
  const ready = await ensureDB()
  if (!ready) {
    console.warn('[DB] dbSaveBobs27Match: DB not ready, skipping SQLite save for', match.id)
    return
  }

  const startEvt = match.events.find((e: any) => e.type === 'Bobs27MatchStarted')
  const config = match.config ?? startEvt?.config ?? {}

  const statements: Array<{ sql: string; params: unknown[] }> = []

  statements.push({
    sql: `INSERT INTO bobs27_matches (
      id, title, created_at, finished, finished_at, duration_ms, winner_id, winner_darts,
      start_score, darts_per_target, include_bull, allow_negative, final_scores
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (id) DO UPDATE SET
      title = EXCLUDED.title,
      created_at = EXCLUDED.created_at,
      finished = EXCLUDED.finished,
      finished_at = EXCLUDED.finished_at,
      duration_ms = EXCLUDED.duration_ms,
      winner_id = EXCLUDED.winner_id,
      winner_darts = EXCLUDED.winner_darts,
      start_score = EXCLUDED.start_score,
      darts_per_target = EXCLUDED.darts_per_target,
      include_bull = EXCLUDED.include_bull,
      allow_negative = EXCLUDED.allow_negative,
      final_scores = EXCLUDED.final_scores`,
    params: [
      match.id,
      match.title,
      match.createdAt,
      match.finished ? 1 : 0,
      match.finishedAt,
      match.durationMs,
      match.winnerId,
      match.winnerDarts,
      config.startScore ?? 27,
      config.dartsPerTarget ?? 3,
      config.includeBull ? 1 : 0,
      config.allowNegative ? 1 : 0,
      match.finalScores ? toJSON(match.finalScores) : null,
    ],
  })

  statements.push({ sql: 'DELETE FROM bobs27_events WHERE match_id = ?', params: [match.id] })
  statements.push({ sql: 'DELETE FROM bobs27_match_players WHERE match_id = ?', params: [match.id] })

  const players = startEvt?.players ?? match.players ?? []
  for (let i = 0; i < players.length; i++) {
    const p = players[i]
    statements.push({
      sql: `INSERT INTO bobs27_match_players (match_id, player_id, position, is_guest)
            VALUES (?, ?, ?, ?)`,
      params: [match.id, p.playerId, i, p.isGuest ? 1 : 0],
    })
  }

  for (let seq = 0; seq < match.events.length; seq++) {
    const ev = match.events[seq]
    statements.push({
      sql: `INSERT INTO bobs27_events (id, match_id, type, ts, seq, data)
            VALUES (?, ?, ?, ?, ?, ?)`,
      params: [ev.eventId ?? generateId(), match.id, ev.type, ev.ts, seq, toJSON(ev)],
    })
  }

  await transaction(statements)
}

export async function dbUpdateBobs27Events(matchId: string, events: any[]): Promise<void> {
  const ready = await ensureDB()
  if (!ready) return

  const statements: Array<{ sql: string; params: unknown[] }> = []

  statements.push({ sql: 'DELETE FROM bobs27_events WHERE match_id = ?', params: [matchId] })

  for (let seq = 0; seq < events.length; seq++) {
    const ev = events[seq]
    statements.push({
      sql: `INSERT INTO bobs27_events (id, match_id, type, ts, seq, data)
            VALUES (?, ?, ?, ?, ?, ?)`,
      params: [ev.eventId ?? generateId(), matchId, ev.type, ev.ts, seq, toJSON(ev)],
    })
  }

  const finishEvt = events.find((e: any) => e.type === 'Bobs27MatchFinished')
  if (finishEvt) {
    statements.push({
      sql: `UPDATE bobs27_matches SET finished = 1, finished_at = ?,
            winner_id = ?, winner_darts = ?, duration_ms = ?,
            final_scores = ? WHERE id = ?`,
      params: [finishEvt.ts, finishEvt.winnerId, finishEvt.totalDarts, finishEvt.durationMs,
               finishEvt.finalScores ? toJSON(finishEvt.finalScores) : null, matchId],
    })
  }

  await transaction(statements)
}

export async function dbFinishBobs27Match(
  matchId: string,
  winnerId: string | null,
  winnerDarts: number,
  durationMs: number,
  finalScores?: Record<string, number>
): Promise<void> {
  const ready = await ensureDB()
  if (!ready) return
  await exec(
    `UPDATE bobs27_matches
     SET finished = 1, finished_at = ?, winner_id = ?, winner_darts = ?, duration_ms = ?,
         final_scores = ?
     WHERE id = ?`,
    [nowISO(), winnerId, winnerDarts, durationMs,
     finalScores ? toJSON(finalScores) : null, matchId]
  )
}

// ============================================================================
// Operation Match Functions
// ============================================================================

export type DBOperationMatch = {
  id: string
  title: string
  createdAt: string
  finished: boolean
  finishedAt: string | null
  durationMs: number | null
  winnerId: string | null
  winnerDarts: number | null
  legsCount: number
  targetMode: string
  players: { playerId: string; name: string; isGuest?: boolean }[]
  events: any[]
  config: any
  finalScores?: Record<string, number>
  legWins?: Record<string, number>
}

export async function dbGetOperationMatches(): Promise<DBOperationMatch[]> {
  await ensureDB()

  // Optimized: Load only recent matches (last 50) + their events
  const MATCH_LIMIT = 50

  const results = await batchQuery([
    { sql: `SELECT * FROM operation_matches ORDER BY created_at DESC LIMIT ${MATCH_LIMIT}` },
    { sql: `SELECT e.match_id, e.data FROM operation_events e INNER JOIN (SELECT id FROM operation_matches ORDER BY created_at DESC LIMIT ${MATCH_LIMIT}) m ON e.match_id = m.id ORDER BY e.match_id, e.seq` },
    { sql: `SELECT mp.match_id, mp.player_id, mp.is_guest FROM operation_match_players mp INNER JOIN (SELECT id FROM operation_matches ORDER BY created_at DESC LIMIT ${MATCH_LIMIT}) m ON mp.match_id = m.id ORDER BY mp.match_id, mp.position` },
  ])
  const matches = (results[0]?.data ?? []) as any[]
  const allEvents = (results[1]?.data ?? []) as any[]
  const allPlayers = (results[2]?.data ?? []) as any[]

  // Group by match_id
  const eventsByMatch = new Map<string, string[]>()
  for (const e of allEvents) {
    const arr = eventsByMatch.get(e.match_id)
    if (arr) arr.push(e.data); else eventsByMatch.set(e.match_id, [e.data])
  }
  const playersByMatch = new Map<string, { player_id: string; is_guest: number }[]>()
  for (const p of allPlayers) {
    const arr = playersByMatch.get(p.match_id)
    if (arr) arr.push(p); else playersByMatch.set(p.match_id, [p])
  }

  return matches.map((m) => {
    const evtData = eventsByMatch.get(m.id) ?? []
    const players = playersByMatch.get(m.id) ?? []

    // Spielernamen aus dem MatchStarted Event holen
    const parsedEvents = evtData.map((d) => fromJSON(d)).filter(Boolean)
    const startEvt: any = parsedEvents.find((e: any) => e.type === 'OperationMatchStarted')

    return {
      id: m.id,
      title: m.title,
      createdAt: m.created_at,
      finished: m.finished === 1,
      finishedAt: m.finished_at,
      durationMs: m.duration_ms,
      winnerId: m.winner_id,
      winnerDarts: m.winner_darts,
      legsCount: m.legs_count,
      targetMode: m.target_mode,
      players: players.map((p, i) => ({
        playerId: p.player_id,
        name: startEvt?.players?.[i]?.name ?? p.player_id,
        isGuest: p.is_guest === 1,
      })),
      events: parsedEvents,
      config: startEvt?.config ?? { legsCount: m.legs_count, targetMode: m.target_mode },
      finalScores: m.final_scores ? fromJSON(m.final_scores) ?? undefined : undefined,
      legWins: m.leg_wins ? fromJSON(m.leg_wins) ?? undefined : undefined,
    }
  })
}

export async function dbGetOperationMatchById(matchId: string): Promise<DBOperationMatch | null> {
  await ensureDB()

  const m = await queryOne<{
    id: string
    title: string
    created_at: string
    finished: number
    finished_at: string | null
    duration_ms: number | null
    winner_id: string | null
    winner_darts: number | null
    legs_count: number
    target_mode: string
    final_scores: string | null
    leg_wins: string | null
  }>('SELECT * FROM operation_matches WHERE id = ?', [matchId])

  if (!m) return null

  const events = await query<{ data: string }>(
    'SELECT data FROM operation_events WHERE match_id = ? ORDER BY seq',
    [matchId]
  )

  const players = await query<{ player_id: string; is_guest: number }>(
    'SELECT player_id, is_guest FROM operation_match_players WHERE match_id = ? ORDER BY position',
    [matchId]
  )

  const parsedEvents = events.map((e) => fromJSON(e.data)).filter(Boolean)
  const startEvt: any = parsedEvents.find((e: any) => e.type === 'OperationMatchStarted')

  return {
    id: m.id,
    title: m.title,
    createdAt: m.created_at,
    finished: m.finished === 1,
    finishedAt: m.finished_at,
    durationMs: m.duration_ms,
    winnerId: m.winner_id,
    winnerDarts: m.winner_darts,
    legsCount: m.legs_count,
    targetMode: m.target_mode,
    players: players.map((p, i) => ({
      playerId: p.player_id,
      name: startEvt?.players?.[i]?.name ?? p.player_id,
      isGuest: p.is_guest === 1,
    })),
    events: parsedEvents,
    config: startEvt?.config ?? { legsCount: m.legs_count, targetMode: m.target_mode },
    finalScores: m.final_scores ? fromJSON(m.final_scores) ?? undefined : undefined,
    legWins: m.leg_wins ? fromJSON(m.leg_wins) ?? undefined : undefined,
  }
}

export async function dbSaveOperationMatch(match: DBOperationMatch): Promise<void> {
  const ready = await ensureDB()
  if (!ready) {
    console.warn('[DB] dbSaveOperationMatch: DB not ready, skipping SQLite save for', match.id)
    return
  }

  const startEvt = match.events.find((e: any) => e.type === 'OperationMatchStarted')
  const config = match.config ?? startEvt?.config ?? {}

  const statements: Array<{ sql: string; params: unknown[] }> = []

  statements.push({
    sql: `INSERT INTO operation_matches (
      id, title, created_at, finished, finished_at, duration_ms, winner_id, winner_darts,
      legs_count, target_mode, final_scores, leg_wins
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (id) DO UPDATE SET
      title = EXCLUDED.title,
      created_at = EXCLUDED.created_at,
      finished = EXCLUDED.finished,
      finished_at = EXCLUDED.finished_at,
      duration_ms = EXCLUDED.duration_ms,
      winner_id = EXCLUDED.winner_id,
      winner_darts = EXCLUDED.winner_darts,
      legs_count = EXCLUDED.legs_count,
      target_mode = EXCLUDED.target_mode,
      final_scores = EXCLUDED.final_scores,
      leg_wins = EXCLUDED.leg_wins`,
    params: [
      match.id,
      match.title,
      match.createdAt,
      match.finished ? 1 : 0,
      match.finishedAt ?? null,
      match.durationMs ?? null,
      match.winnerId ?? null,
      match.winnerDarts ?? null,
      config.legsCount ?? 1,
      config.targetMode ?? 'MANUAL_NUMBER',
      match.finalScores ? toJSON(match.finalScores) : null,
      match.legWins ? toJSON(match.legWins) : null,
    ],
  })

  statements.push({ sql: 'DELETE FROM operation_events WHERE match_id = ?', params: [match.id] })
  statements.push({ sql: 'DELETE FROM operation_match_players WHERE match_id = ?', params: [match.id] })

  const players = startEvt?.players ?? match.players ?? []
  for (let i = 0; i < players.length; i++) {
    const p = players[i]
    statements.push({
      sql: `INSERT INTO operation_match_players (match_id, player_id, position, is_guest)
            VALUES (?, ?, ?, ?)`,
      params: [match.id, p.playerId, i, p.isGuest ? 1 : 0],
    })
  }

  for (let seq = 0; seq < match.events.length; seq++) {
    const ev = match.events[seq]
    const enrichedEv = enrichEvent(ev)
    statements.push({
      sql: `INSERT INTO operation_events (id, match_id, type, ts, seq, data)
            VALUES (?, ?, ?, ?, ?, ?)`,
      params: [ev.eventId ?? generateId(), match.id, ev.type, ev.ts, seq, toJSON(enrichedEv)],
    })
  }

  await transaction(statements)
}

export async function dbUpdateOperationEvents(matchId: string, events: any[]): Promise<void> {
  const ready = await ensureDB()
  if (!ready) return

  const statements: Array<{ sql: string; params: unknown[] }> = []

  statements.push({ sql: 'DELETE FROM operation_events WHERE match_id = ?', params: [matchId] })

  for (let seq = 0; seq < events.length; seq++) {
    const ev = events[seq]
    const enrichedEv = enrichEvent(ev)
    statements.push({
      sql: `INSERT INTO operation_events (id, match_id, type, ts, seq, data)
            VALUES (?, ?, ?, ?, ?, ?)`,
      params: [ev.eventId ?? generateId(), matchId, ev.type, ev.ts, seq, toJSON(enrichedEv)],
    })
  }

  const finishEvt = events.find((e: any) => e.type === 'OperationMatchFinished')
  if (finishEvt) {
    statements.push({
      sql: `UPDATE operation_matches SET finished = 1, finished_at = ?,
            winner_id = ?, winner_darts = ?, duration_ms = ?,
            final_scores = ?, leg_wins = ? WHERE id = ?`,
      params: [finishEvt.ts, finishEvt.winnerId, finishEvt.totalDarts, finishEvt.durationMs,
        finishEvt.finalScores ? toJSON(finishEvt.finalScores) : null,
        finishEvt.legWins ? toJSON(finishEvt.legWins) : null, matchId],
    })
  }

  await transaction(statements)
}

export async function dbFinishOperationMatch(
  matchId: string,
  winnerId: string | null,
  winnerDarts: number,
  durationMs: number,
  finalScores?: Record<string, number>,
  legWins?: Record<string, number>
): Promise<void> {
  const ready = await ensureDB()
  if (!ready) return
  await exec(
    `UPDATE operation_matches
     SET finished = 1, finished_at = ?, winner_id = ?, winner_darts = ?, duration_ms = ?,
         final_scores = ?, leg_wins = ?
     WHERE id = ?`,
    [nowISO(), winnerId, winnerDarts, durationMs,
     finalScores ? toJSON(finalScores) : null,
     legWins ? toJSON(legWins) : null, matchId]
  )
}

// ============================================================================
// System Meta
// ============================================================================

export async function dbGetMeta(key: string): Promise<string | null> {
  await ensureDB()
  const row = await queryOne<{ value: string }>('SELECT value FROM system_meta WHERE key = ?', [key])
  return row?.value ?? null
}

export async function dbSetMeta(key: string, value: string): Promise<void> {
  await ensureDB()
  await exec(
    `INSERT INTO system_meta (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT (key) DO UPDATE SET
       value = EXCLUDED.value,
       updated_at = EXCLUDED.updated_at`,
    [key, value, nowISO()]
  )
}

// ============================================================================
// X01 Player Stats
// ============================================================================

export async function dbSaveX01PlayerStats(stats: {
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
  updatedAt: string
}): Promise<void> {
  await ensureDB()
  await exec(
    `INSERT INTO x01_player_stats
     (player_id, matches_played, matches_won, legs_won, sets_won,
      darts_thrown, points_scored, three_dart_avg, first9_avg,
      highest_checkout, double_attempts, doubles_hit, double_pct,
      tons_100, tons_140, tons_180, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (player_id) DO UPDATE SET
       matches_played = EXCLUDED.matches_played,
       matches_won = EXCLUDED.matches_won,
       legs_won = EXCLUDED.legs_won,
       sets_won = EXCLUDED.sets_won,
       darts_thrown = EXCLUDED.darts_thrown,
       points_scored = EXCLUDED.points_scored,
       three_dart_avg = EXCLUDED.three_dart_avg,
       first9_avg = EXCLUDED.first9_avg,
       highest_checkout = EXCLUDED.highest_checkout,
       double_attempts = EXCLUDED.double_attempts,
       doubles_hit = EXCLUDED.doubles_hit,
       double_pct = EXCLUDED.double_pct,
       tons_100 = EXCLUDED.tons_100,
       tons_140 = EXCLUDED.tons_140,
       tons_180 = EXCLUDED.tons_180,
       updated_at = EXCLUDED.updated_at`,
    [
      stats.playerId,
      stats.matchesPlayed,
      stats.matchesWon,
      stats.legsWon,
      stats.setsWon,
      stats.dartsThrownTotal,
      stats.pointsScoredTotal,
      stats.threeDartAvgOverall,
      stats.first9OverallAvg ?? null,
      stats.highestCheckout,
      stats.doubleAttemptsDart,
      stats.doublesHitDart,
      stats.doublePctDart,
      stats.tons100Plus,
      stats.tons140Plus,
      stats.tons180,
      stats.updatedAt,
    ]
  )

  // Finishing doubles — use upsert to avoid duplicate key errors from concurrent writes
  for (const [field, count] of Object.entries(stats.finishingDoubles)) {
    if (count > 0) {
      await exec(
        'INSERT INTO x01_finishing_doubles (player_id, double_field, count) VALUES (?, ?, ?) ON CONFLICT (player_id, double_field) DO UPDATE SET count = EXCLUDED.count',
        [stats.playerId, field, count]
      )
    }
  }
}

export async function dbLoadAllX01PlayerStats(): Promise<Record<string, any>> {
  await ensureDB()
  const rows = await query<any>('SELECT * FROM x01_player_stats', [])
  const doublesRows = await query<any>('SELECT * FROM x01_finishing_doubles', [])

  // Group doubles by player
  const doublesByPlayer: Record<string, Record<string, number>> = {}
  for (const d of doublesRows) {
    if (!doublesByPlayer[d.player_id]) doublesByPlayer[d.player_id] = {}
    doublesByPlayer[d.player_id][d.double_field] = d.count
  }

  const result: Record<string, any> = {}
  for (const r of rows) {
    result[r.player_id] = {
      playerId: r.player_id,
      matchesPlayed: r.matches_played,
      matchesWon: r.matches_won,
      legsWon: r.legs_won,
      setsWon: r.sets_won,
      dartsThrownTotal: r.darts_thrown,
      pointsScoredTotal: r.points_scored,
      threeDartAvgOverall: r.three_dart_avg,
      first9OverallAvg: r.first9_avg ?? undefined,
      highestCheckout: r.highest_checkout,
      doubleAttemptsDart: r.double_attempts,
      doublesHitDart: r.doubles_hit,
      doublePctDart: r.double_pct,
      finishingDoubles: doublesByPlayer[r.player_id] ?? {},
      tons100Plus: r.tons_100,
      tons140Plus: r.tons_140,
      tons180: r.tons_180,
      // Note: doublesHitCount, triplesHitCount, segmentsHitCount not in DB schema
      doublesHitCount: {},
      triplesHitCount: {},
      segmentsHitCount: {},
      updatedAt: r.updated_at ?? '',
    }
  }
  return result
}

// ============================================================================
// 121 Player Stats
// ============================================================================

export async function dbSave121PlayerStats(playerId: string, stats: any): Promise<void> {
  await ensureDB()
  await exec(
    `INSERT INTO stats_121
     (player_id, total_legs, legs_won, checkout_attempts, checkouts_made,
      checkout_pct, avg_darts_to_finish, avg_darts_on_double, total_darts,
      best_double, preferred_double, skill_score, total_busts, bust_rate, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (player_id) DO UPDATE SET
       total_legs = EXCLUDED.total_legs,
       legs_won = EXCLUDED.legs_won,
       checkout_attempts = EXCLUDED.checkout_attempts,
       checkouts_made = EXCLUDED.checkouts_made,
       checkout_pct = EXCLUDED.checkout_pct,
       avg_darts_to_finish = EXCLUDED.avg_darts_to_finish,
       avg_darts_on_double = EXCLUDED.avg_darts_on_double,
       total_darts = EXCLUDED.total_darts,
       best_double = EXCLUDED.best_double,
       preferred_double = EXCLUDED.preferred_double,
       skill_score = EXCLUDED.skill_score,
       total_busts = EXCLUDED.total_busts,
       bust_rate = EXCLUDED.bust_rate,
       updated_at = EXCLUDED.updated_at`,
    [
      playerId,
      stats.totalLegs ?? 0,
      stats.legsWon ?? 0,
      stats.checkoutAttempts ?? 0,
      stats.checkoutsMade ?? 0,
      stats.checkoutPct ?? 0,
      stats.avgDartsToFinish ?? 0,
      stats.avgDartsOnDouble ?? 0,
      stats.totalDartsThrown ?? 0,
      stats.bestDouble ? JSON.stringify(stats.bestDouble) : null,
      stats.preferredDouble ?? null,
      stats.skillScore ?? 0,
      stats.totalBusts ?? 0,
      stats.bustRate ?? 0,
      stats.updatedAt ?? nowISO(),
    ]
  )

  // Double stats
  await exec('DELETE FROM stats_121_doubles WHERE player_id = ?', [playerId])
  if (stats.doubleStats) {
    for (const [field, ds] of Object.entries(stats.doubleStats as Record<string, any>)) {
      await exec(
        'INSERT INTO stats_121_doubles (player_id, double_field, attempts, hits, hit_rate) VALUES (?, ?, ?, ?, ?)',
        [playerId, field, ds.attempts ?? 0, ds.hits ?? 0, ds.hitRate ?? 0]
      )
    }
  }
}

export async function dbLoadAll121PlayerStats(): Promise<Record<string, any>> {
  await ensureDB()
  const rows = await query<any>('SELECT * FROM stats_121', [])
  const doublesRows = await query<any>('SELECT * FROM stats_121_doubles', [])

  const doublesByPlayer: Record<string, Record<string, any>> = {}
  for (const d of doublesRows) {
    if (!doublesByPlayer[d.player_id]) doublesByPlayer[d.player_id] = {}
    doublesByPlayer[d.player_id][d.double_field] = {
      attempts: d.attempts,
      hits: d.hits,
      hitRate: d.hit_rate,
    }
  }

  const result: Record<string, any> = {}
  for (const r of rows) {
    result[r.player_id] = {
      playerId: r.player_id,
      totalLegs: r.total_legs,
      legsWon: r.legs_won,
      checkoutAttempts: r.checkout_attempts,
      checkoutsMade: r.checkouts_made,
      checkoutPct: r.checkout_pct,
      avgDartsToFinish: r.avg_darts_to_finish,
      avgDartsOnDouble: r.avg_darts_on_double,
      totalDartsThrown: r.total_darts,
      bestDouble: r.best_double ? JSON.parse(r.best_double) : null,
      preferredDouble: r.preferred_double ?? null,
      effectiveDouble: null,
      skillScore: r.skill_score,
      totalBusts: r.total_busts,
      bustRate: r.bust_rate,
      doubleStats: doublesByPlayer[r.player_id] ?? {},
      worstDouble: null,
      doubleHitsAfterBust: 0,
      doubleHitsAfterMiss: 0,
      doubleAttemptsAfterPressure: 0,
      routeStats: [],
      mostUsedRoute: null,
      mostSuccessfulRoute: null,
      routeDeviationRate: 0,
      bestFinishDarts: null,
      worstFinishDarts: null,
      finishDartsVariance: 0,
      pctBelowPersonalAvg: 0,
      personalBest: null,
      movingAvg10: 0,
      checkoutPctTrend: 'stable' as const,
      doubleEfficiencyTrend: 'stable' as const,
      avgDartsToFirstCheckoutAttempt: 0,
      updatedAt: r.updated_at ?? '',
    }
  }
  return result
}

// ============================================================================
// X01 Leaderboards
// ============================================================================

export async function dbSaveX01Leaderboards(lb: {
  highVisits: any[]
  highCheckouts: any[]
  bestLegs: any[]
  worstLegs: any[]
  bestCheckoutPct: any[]
  worstCheckoutPct: any[]
  processedMatchIds: string[]
}): Promise<void> {
  await ensureDB()
  await exec('DELETE FROM x01_leaderboards', [])

  const categories = [
    { name: 'highVisit', items: lb.highVisits },
    { name: 'highCheckout', items: lb.highCheckouts },
    { name: 'bestLeg', items: lb.bestLegs },
    { name: 'worstLeg', items: lb.worstLegs },
    { name: 'bestCheckoutPct', items: lb.bestCheckoutPct },
    { name: 'worstCheckoutPct', items: lb.worstCheckoutPct },
  ]

  for (const cat of categories) {
    for (const item of cat.items) {
      const isLeg = cat.name === 'bestLeg' || cat.name === 'worstLeg'
      const isPct = cat.name === 'bestCheckoutPct' || cat.name === 'worstCheckoutPct'
      await exec(
        `INSERT INTO x01_leaderboards (category, player_id, player_name, match_id, value, value_real, ts)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          cat.name,
          item.playerId,
          item.playerName,
          item.matchId ?? null,
          isLeg ? item.darts : (!isPct ? item.value : null),
          isPct ? item.value : null,
          item.ts ?? null,
        ]
      )
    }
  }

  // Store processedMatchIds as meta
  await dbSetMeta('x01_lb_processedMatchIds', JSON.stringify(lb.processedMatchIds))
}

export async function dbLoadX01Leaderboards(): Promise<{
  highVisits: any[]
  highCheckouts: any[]
  bestLegs: any[]
  worstLegs: any[]
  bestCheckoutPct: any[]
  worstCheckoutPct: any[]
  processedMatchIds: string[]
  version: 1
} | null> {
  await ensureDB()
  const rows = await query<any>('SELECT * FROM x01_leaderboards ORDER BY id', [])
  if (rows.length === 0) return null

  const lb: any = {
    highVisits: [],
    highCheckouts: [],
    bestLegs: [],
    worstLegs: [],
    bestCheckoutPct: [],
    worstCheckoutPct: [],
    processedMatchIds: [],
    version: 1,
  }

  for (const r of rows) {
    switch (r.category) {
      case 'highVisit':
        lb.highVisits.push({
          playerId: r.player_id,
          playerName: r.player_name,
          matchId: r.match_id,
          visitId: '',
          value: r.value,
          ts: r.ts ?? '',
        })
        break
      case 'highCheckout':
        lb.highCheckouts.push({
          playerId: r.player_id,
          playerName: r.player_name,
          matchId: r.match_id,
          visitId: '',
          value: r.value,
          ts: r.ts ?? '',
        })
        break
      case 'bestLeg':
        lb.bestLegs.push({
          playerId: r.player_id,
          playerName: r.player_name,
          matchId: r.match_id,
          legId: '',
          darts: r.value,
          ts: r.ts ?? '',
        })
        break
      case 'worstLeg':
        lb.worstLegs.push({
          playerId: r.player_id,
          playerName: r.player_name,
          matchId: r.match_id,
          legId: '',
          darts: r.value,
          ts: r.ts ?? '',
        })
        break
      case 'bestCheckoutPct':
        lb.bestCheckoutPct.push({
          playerId: r.player_id,
          playerName: r.player_name,
          value: r.value_real ?? 0,
          attempts: 0,
          made: 0,
        })
        break
      case 'worstCheckoutPct':
        lb.worstCheckoutPct.push({
          playerId: r.player_id,
          playerName: r.player_name,
          value: r.value_real ?? 0,
          attempts: 0,
          made: 0,
        })
        break
    }
  }

  // Load processedMatchIds
  const metaVal = await dbGetMeta('x01_lb_processedMatchIds')
  if (metaVal) {
    try { lb.processedMatchIds = JSON.parse(metaVal) } catch { /* ignore */ }
  }

  return lb
}

// ============================================================================
// Cricket Leaderboards
// ============================================================================

export async function dbSaveCricketLeaderboards(lb: {
  bullMaster: any[]
  tripleHunter: any[]
  fastestLegs: any[]
  bestTurnMarks: any[]
  processedMatchIds: string[]
}): Promise<void> {
  await ensureDB()
  await exec('DELETE FROM cricket_leaderboards', [])

  const categories = [
    { name: 'bullMaster', items: lb.bullMaster },
    { name: 'tripleHunter', items: lb.tripleHunter },
    { name: 'bestTurnMarks', items: lb.bestTurnMarks },
  ]

  for (const cat of categories) {
    for (const item of cat.items) {
      await exec(
        `INSERT INTO cricket_leaderboards (category, player_id, player_name, match_id, value, value_real, ts)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [cat.name, item.playerId, item.playerName, item.matchId ?? null, item.value, null, item.ts ?? null]
      )
    }
  }

  // Fastest legs (different shape)
  for (const item of lb.fastestLegs) {
    await exec(
      `INSERT INTO cricket_leaderboards (category, player_id, player_name, match_id, value, value_real, ts)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ['fastestLeg', item.playerId, item.playerName, item.matchId ?? null, item.dartsThrown, item.marks, item.ts ?? null]
    )
  }

  await dbSetMeta('cricket_lb_processedMatchIds', JSON.stringify(lb.processedMatchIds))
}

export async function dbLoadCricketLeaderboards(): Promise<{
  bullMaster: any[]
  tripleHunter: any[]
  fastestLegs: any[]
  bestTurnMarks: any[]
  processedMatchIds: string[]
  version: 1
} | null> {
  await ensureDB()
  const rows = await query<any>('SELECT * FROM cricket_leaderboards ORDER BY id', [])
  if (rows.length === 0) return null

  const lb: any = {
    bullMaster: [],
    tripleHunter: [],
    fastestLegs: [],
    bestTurnMarks: [],
    processedMatchIds: [],
    version: 1,
  }

  for (const r of rows) {
    const base = { playerId: r.player_id, playerName: r.player_name, matchId: r.match_id, ts: r.ts ?? '' }
    switch (r.category) {
      case 'bullMaster':
        lb.bullMaster.push({ ...base, value: r.value })
        break
      case 'tripleHunter':
        lb.tripleHunter.push({ ...base, value: r.value })
        break
      case 'bestTurnMarks':
        lb.bestTurnMarks.push({ ...base, value: r.value })
        break
      case 'fastestLeg':
        lb.fastestLegs.push({ ...base, dartsThrown: r.value, marks: r.value_real ?? 0 })
        break
    }
  }

  const metaVal = await dbGetMeta('cricket_lb_processedMatchIds')
  if (metaVal) {
    try { lb.processedMatchIds = JSON.parse(metaVal) } catch { /* ignore */ }
  }

  return lb
}

// ============================================================================
// Outbox
// ============================================================================

export async function dbQueueMatch(payload: { id: string; createdAt: string; [key: string]: any }): Promise<void> {
  await ensureDB()
  const existing = await queryOne<{ id: string }>('SELECT id FROM outbox WHERE id = ?', [payload.id])
  if (existing) return
  await exec(
    'INSERT INTO outbox (id, payload, created_at) VALUES (?, ?, ?)',
    [payload.id, JSON.stringify(payload), payload.createdAt]
  )
}

export async function dbReadOutbox(): Promise<any[]> {
  await ensureDB()
  const rows = await query<{ id: string; payload: string; created_at: string }>(
    'SELECT * FROM outbox ORDER BY created_at',
    []
  )
  return rows.map(r => JSON.parse(r.payload))
}

export async function dbRemoveFromOutbox(id: string): Promise<void> {
  await ensureDB()
  await exec('DELETE FROM outbox WHERE id = ?', [id])
}

// ============================================================================
// Cricket Player Stats
// ============================================================================

export async function dbSaveCricketPlayerStats(stats: any): Promise<void> {
  await ensureDB()
  await exec(
    `INSERT INTO cricket_player_stats
     (player_id, player_name, matches_played, matches_won, legs_won,
      total_marks, total_turns, total_darts, total_triples, total_doubles,
      total_bull_singles, total_bull_doubles, total_bull_attempts,
      field_marks, no_score_turns, best_turn_marks, best_turn_points,
      total_points_scored, total_points_taken, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (player_id) DO UPDATE SET
       player_name = EXCLUDED.player_name,
       matches_played = EXCLUDED.matches_played,
       matches_won = EXCLUDED.matches_won,
       legs_won = EXCLUDED.legs_won,
       total_marks = EXCLUDED.total_marks,
       total_turns = EXCLUDED.total_turns,
       total_darts = EXCLUDED.total_darts,
       total_triples = EXCLUDED.total_triples,
       total_doubles = EXCLUDED.total_doubles,
       total_bull_singles = EXCLUDED.total_bull_singles,
       total_bull_doubles = EXCLUDED.total_bull_doubles,
       total_bull_attempts = EXCLUDED.total_bull_attempts,
       field_marks = EXCLUDED.field_marks,
       no_score_turns = EXCLUDED.no_score_turns,
       best_turn_marks = EXCLUDED.best_turn_marks,
       best_turn_points = EXCLUDED.best_turn_points,
       total_points_scored = EXCLUDED.total_points_scored,
       total_points_taken = EXCLUDED.total_points_taken,
       updated_at = EXCLUDED.updated_at`,
    [
      stats.playerId,
      stats.playerName ?? null,
      stats.matchesPlayed ?? 0,
      stats.matchesWon ?? 0,
      stats.legsWon ?? 0,
      stats.totalMarks ?? 0,
      stats.totalTurns ?? 0,
      stats.totalDarts ?? 0,
      stats.totalTriples ?? 0,
      stats.totalDoubles ?? 0,
      stats.totalBullSingles ?? 0,
      stats.totalBullDoubles ?? 0,
      stats.totalBullAttempts ?? 0,
      stats.fieldMarks ? JSON.stringify(stats.fieldMarks) : null,
      stats.noScoreTurns ?? 0,
      stats.bestTurnMarks ?? 0,
      stats.bestTurnPoints ?? 0,
      stats.totalPointsScored ?? 0,
      stats.totalPointsTaken ?? 0,
      stats.updatedAt ?? nowISO(),
    ]
  )
}

export async function dbLoadAllCricketPlayerStats(): Promise<Record<string, any>> {
  await ensureDB()
  const rows = await query<any>('SELECT * FROM cricket_player_stats', [])

  const result: Record<string, any> = {}
  for (const r of rows) {
    result[r.player_id] = {
      playerId: r.player_id,
      playerName: r.player_name ?? undefined,
      matchesPlayed: r.matches_played,
      matchesWon: r.matches_won,
      legsWon: r.legs_won,
      totalMarks: r.total_marks,
      totalTurns: r.total_turns,
      totalDarts: r.total_darts,
      totalTriples: r.total_triples,
      totalDoubles: r.total_doubles,
      totalBullSingles: r.total_bull_singles,
      totalBullDoubles: r.total_bull_doubles,
      totalBullAttempts: r.total_bull_attempts,
      fieldMarks: r.field_marks ? JSON.parse(r.field_marks) : {},
      noScoreTurns: r.no_score_turns,
      bestTurnMarks: r.best_turn_marks,
      bestTurnPoints: r.best_turn_points,
      totalPointsScored: r.total_points_scored,
      totalPointsTaken: r.total_points_taken,
      updatedAt: r.updated_at ?? '',
    }
  }
  return result
}

// ============================================================================
// Check if match is already finished in DB (for guest backup-persist skip)
// ============================================================================

export async function isMatchFinishedInDB(table: string, matchId: string): Promise<boolean> {
  const ready = await ensureDB()
  if (!ready) return false
  try {
    const rows = await query(`SELECT finished FROM ${table} WHERE id = ?`, [matchId])
    return rows.length > 0 && (rows[0].finished === 1 || rows[0].finished === true)
  } catch { return false }
}

// ============================================================================
// DB Repair — fix matches with finish events but not marked as finished
// ============================================================================

export async function dbRepairUnfinishedMatches(): Promise<{ repaired: string[] }> {
  const ready = await ensureDB()
  if (!ready) return { repaired: [] }

  const repaired: string[] = []

  const modes: Array<{
    matchTable: string
    eventTable: string
    finishType: string
    label: string
  }> = [
    { matchTable: 'x01_matches', eventTable: 'x01_events', finishType: 'MatchFinished', label: 'x01' },
    { matchTable: 'cricket_matches', eventTable: 'cricket_events', finishType: 'CricketMatchFinished', label: 'cricket' },
    { matchTable: 'atb_matches', eventTable: 'atb_events', finishType: 'ATBMatchFinished', label: 'atb' },
    { matchTable: 'ctf_matches', eventTable: 'ctf_events', finishType: 'CTFMatchFinished', label: 'ctf' },
    { matchTable: 'str_matches', eventTable: 'str_events', finishType: 'StrMatchFinished', label: 'str' },
    { matchTable: 'highscore_matches', eventTable: 'highscore_events', finishType: 'HighscoreMatchFinished', label: 'highscore' },
    { matchTable: 'shanghai_matches', eventTable: 'shanghai_events', finishType: 'ShanghaiMatchFinished', label: 'shanghai' },
    { matchTable: 'killer_matches', eventTable: 'killer_events', finishType: 'KillerMatchFinished', label: 'killer' },
    { matchTable: 'bobs27_matches', eventTable: 'bobs27_events', finishType: 'Bobs27MatchFinished', label: 'bobs27' },
    { matchTable: 'operation_matches', eventTable: 'operation_events', finishType: 'OperationMatchFinished', label: 'operation' },
  ]

  for (const mode of modes) {
    try {
      // Find unfinished matches that DO have a finish event
      const rows = await query(
        `SELECT m.id, e.ts
         FROM ${mode.matchTable} m
         JOIN ${mode.eventTable} e ON e.match_id = m.id AND e.type = ?
         WHERE (m.finished = 0 OR m.finished IS NULL)`,
        [mode.finishType]
      )
      for (const row of rows) {
        await exec(
          `UPDATE ${mode.matchTable} SET finished = 1, finished_at = ? WHERE id = ?`,
          [row.ts, row.id]
        )
        repaired.push(`${mode.label}:${row.id}`)
        console.log(`[DB Repair] Marked ${mode.label} match ${row.id} as finished`)
      }
    } catch (err) {
      console.warn(`[DB Repair] Error repairing ${mode.label}:`, err)
    }
  }

  // Undo: revert matches that were incorrectly marked finished by the old stale repair
  // These have finished=1 but NO MatchFinished event — they were genuinely abandoned
  for (const mode of modes) {
    try {
      const wronglyFinished = await query(
        `SELECT m.id FROM ${mode.matchTable} m
         WHERE (m.finished = 1)
         AND NOT EXISTS (SELECT 1 FROM ${mode.eventTable} e WHERE e.match_id = m.id AND e.type = ?)`,
        [mode.finishType]
      )
      for (const row of wronglyFinished) {
        await exec(
          `UPDATE ${mode.matchTable} SET finished = 0, finished_at = NULL WHERE id = ?`,
          [row.id]
        )
        repaired.push(`${mode.label}:${row.id}(reverted)`)
        console.log(`[DB Repair] Reverted ${mode.label} match ${row.id} back to unfinished (no finish event)`)
      }
    } catch (err) {
      console.warn(`[DB Repair] Error reverting ${mode.label}:`, err)
    }
  }

  return { repaired }
}
