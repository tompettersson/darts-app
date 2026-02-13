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
 * Bereichert ein Event basierend auf seinem Typ
 */
function enrichEvent(ev: any): any {
  if (ev.type === 'CricketTurnAdded') return enrichCricketEvent(ev)
  if (ev.type === 'ATBTurnAdded') return enrichATBEvent(ev)
  return ev
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
    `INSERT OR REPLACE INTO profiles (id, name, color, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`,
    [profile.id, profile.name, profile.color, profile.createdAt, profile.updatedAt]
  )
}

export async function dbDeleteProfile(id: string): Promise<void> {
  await ensureDB()
  await exec('DELETE FROM profiles WHERE id = ?', [id])
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

  const matches = await query<{
    id: string
    title: string
    match_name: string | null
    notes: string | null
    created_at: string
    finished: number
    finished_at: string | null
  }>('SELECT * FROM x01_matches ORDER BY created_at DESC')

  const result: DBX01Match[] = []

  for (const m of matches) {
    // Events laden
    const events = await query<{ data: string }>(
      'SELECT data FROM x01_events WHERE match_id = ? ORDER BY seq',
      [m.id]
    )

    // Player IDs laden
    const players = await query<{ player_id: string }>(
      'SELECT player_id FROM x01_match_players WHERE match_id = ? ORDER BY position',
      [m.id]
    )

    result.push({
      id: m.id,
      title: m.title,
      matchName: m.match_name,
      notes: m.notes,
      createdAt: m.created_at,
      finished: m.finished === 1,
      finishedAt: m.finished_at,
      events: events.map((e) => fromJSON(e.data)).filter(Boolean),
      playerIds: players.map((p) => p.player_id),
    })
  }

  return result
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
  console.log('[DB] dbSaveX01Match: Saving match', match.id)

  const startEvt = match.events.find((e) => e.type === 'MatchStarted')
  const finishEvt = match.events.find((e) => e.type === 'MatchFinished')

  const statements: Array<{ sql: string; params: unknown[] }> = []

  // Match
  statements.push({
    sql: `INSERT OR REPLACE INTO x01_matches (
      id, title, match_name, notes, created_at, finished, finished_at,
      mode, starting_score, structure_kind, best_of_legs, legs_per_set, best_of_sets,
      in_rule, out_rule
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
  console.log('[DB] dbSaveX01Match: Successfully saved match', match.id)
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
  console.log('[DB] dbUpdateX01Events: Updated', events.length, 'events for match', matchId)
}

export async function dbFinishX01Match(matchId: string): Promise<void> {
  const ready = await ensureDB()
  if (!ready) {
    console.warn('[DB] dbFinishX01Match: DB not ready, skipping SQLite update for', matchId)
    return
  }
  console.log('[DB] dbFinishX01Match: Finishing match', matchId)
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

  const matches = await query<{
    id: string
    title: string
    match_name: string | null
    notes: string | null
    created_at: string
    finished: number
    finished_at: string | null
  }>('SELECT * FROM cricket_matches ORDER BY created_at DESC')

  const result: DBCricketMatch[] = []

  for (const m of matches) {
    const events = await query<{ data: string }>(
      'SELECT data FROM cricket_events WHERE match_id = ? ORDER BY seq',
      [m.id]
    )

    const players = await query<{ player_id: string }>(
      'SELECT player_id FROM cricket_match_players WHERE match_id = ? ORDER BY position',
      [m.id]
    )

    result.push({
      id: m.id,
      title: m.title,
      matchName: m.match_name,
      notes: m.notes,
      createdAt: m.created_at,
      finished: m.finished === 1,
      finishedAt: m.finished_at,
      events: events.map((e) => fromJSON(e.data)).filter(Boolean),
      playerIds: players.map((p) => p.player_id),
    })
  }

  return result
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
    sql: `INSERT OR REPLACE INTO cricket_matches (
      id, title, match_name, notes, created_at, finished, finished_at,
      range, style, best_of_games, crazy_mode, crazy_scoring_mode
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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

  const matches = await query<{
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
  }>('SELECT * FROM atb_matches ORDER BY created_at DESC')

  const result: DBATBMatch[] = []

  for (const m of matches) {
    const events = await query<{ data: string }>(
      'SELECT data FROM atb_events WHERE match_id = ? ORDER BY seq',
      [m.id]
    )

    const players = await query<{ player_id: string; is_guest: number }>(
      'SELECT player_id, is_guest FROM atb_match_players WHERE match_id = ? ORDER BY position',
      [m.id]
    )

    // Player details aus Start-Event holen
    const startEvt = events.length > 0 ? fromJSON<any>(events[0].data) : null
    const playerDetails = startEvt?.players ?? players.map((p) => ({ playerId: p.player_id, name: p.player_id, isGuest: p.is_guest === 1 }))

    result.push({
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
    })
  }

  return result
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
    sql: `INSERT OR REPLACE INTO atb_matches (
      id, title, created_at, finished, finished_at, duration_ms, winner_id, winner_darts,
      mode, direction, structure_kind, best_of_legs, legs_per_set, best_of_sets,
      sequence_mode, target_mode, multiplier_mode, special_rule, generated_sequence
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
    'INSERT OR REPLACE INTO system_meta (key, value, updated_at) VALUES (?, ?, ?)',
    [key, value, nowISO()]
  )
}
