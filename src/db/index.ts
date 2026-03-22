// src/db/index.ts
// Public API für Postgres Database (Neon)
// Kommuniziert mit Vercel Serverless Functions via HTTP

// ============================================================================
// Types
// ============================================================================

export type DBStatus = 'uninitialized' | 'initializing' | 'ready' | 'error'

// ============================================================================
// API Communication
// ============================================================================

let status: DBStatus = 'uninitialized'
let initPromise: Promise<void> | null = null

/** API base URL — in dev: Vite proxy, in prod: same origin */
function getApiUrl(): string {
  return '/api/db'
}

async function apiRequest<T = unknown>(body: Record<string, unknown>): Promise<T> {
  const response = await fetch(getApiUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText }))
    throw new Error(`[DB API] ${error.error || response.statusText}`)
  }

  const result = await response.json()
  return result.data as T
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Initialisiert die Datenbank-Verbindung
 * Prüft ob der API-Endpoint erreichbar ist
 */
export async function initDB(): Promise<void> {
  if (status === 'ready') return
  if (initPromise) return initPromise

  initPromise = (async () => {
    try {
      status = 'initializing'
      // Simple health check — query the DB version
      await apiRequest({ type: 'queryOne', sql: "SELECT value FROM system_meta WHERE key = 'db_version'" })
      status = 'ready'
      console.debug('[DB] Connected to Postgres via API')
    } catch (e) {
      status = 'error'
      console.error('[DB] API connection failed:', e)
      throw e
    }
  })()

  return initPromise
}

/**
 * Führt ein SQL Statement aus (INSERT, UPDATE, DELETE)
 */
export async function exec(sql: string, params?: unknown[]): Promise<void> {
  await initDB()
  await apiRequest({ type: 'exec', sql, params })
}

/**
 * Führt mehrere SQL Statements aus
 */
export async function execMany(statements: Array<{ sql: string; params?: unknown[] }>): Promise<void> {
  await initDB()
  await apiRequest({ type: 'execMany', statements })
}

// ============================================================================
// Automatic Request Batching (DataLoader pattern)
// Queries called in the same microtask are batched into a single HTTP request.
// ============================================================================

type PendingQuery = {
  sql: string
  params?: unknown[]
  mode: 'all' | 'one'
  resolve: (value: any) => void
  reject: (error: any) => void
}

let pendingBatch: PendingQuery[] | null = null
let flushTimer: ReturnType<typeof setTimeout> | null = null

function enqueueQuery(sql: string, params: unknown[] | undefined, mode: 'all' | 'one'): Promise<any> {
  return new Promise((resolve, reject) => {
    if (!pendingBatch) {
      pendingBatch = []
    }
    pendingBatch.push({ sql, params, mode, resolve, reject })

    // Reset flush timer — collect queries for 5ms window.
    // This batches sequential await chains within the same logical operation.
    if (flushTimer) clearTimeout(flushTimer)
    flushTimer = setTimeout(flushBatch, 5)
  })
}

async function flushBatch() {
  flushTimer = null
  const batch = pendingBatch
  pendingBatch = null
  if (!batch || batch.length === 0) return

  // Single query — no need for batch overhead
  if (batch.length === 1) {
    const q = batch[0]
    try {
      const type = q.mode === 'one' ? 'queryOne' : 'query'
      const result = await apiRequest({ type, sql: q.sql, params: q.params })
      q.resolve(result)
    } catch (e) {
      q.reject(e)
    }
    return
  }

  // Multiple queries — send as batch
  try {
    const results = await apiRequest<Array<{ data: unknown; error?: string }>>({
      type: 'batch',
      queries: batch.map(q => ({ sql: q.sql, params: q.params, mode: q.mode })),
    })

    for (let i = 0; i < batch.length; i++) {
      const r = results[i]
      if (r?.error) {
        batch[i].reject(new Error(`[DB API] ${r.error}`))
      } else {
        batch[i].resolve(r?.data)
      }
    }
  } catch (e) {
    // Network error — reject all
    for (const q of batch) q.reject(e)
  }
}

/**
 * Führt eine Query aus und gibt alle Ergebnisse zurück
 */
export async function query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]> {
  await initDB()
  return enqueueQuery(sql, params, 'all')
}

/**
 * Führt eine Query aus und gibt das erste Ergebnis zurück
 */
export async function queryOne<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T | null> {
  await initDB()
  return enqueueQuery(sql, params, 'one')
}

/**
 * Führt mehrere Queries in einem einzigen HTTP-Request aus.
 * Jeder Query-Eintrag hat { sql, params?, mode?: 'all' | 'one' }.
 * Gibt ein Array von Ergebnissen zurück (eins pro Query).
 */
export type BatchQuery = { sql: string; params?: unknown[]; mode?: 'all' | 'one' }

export async function batchQuery(queries: BatchQuery[]): Promise<Array<{ data: unknown; error?: string }>> {
  await initDB()
  return apiRequest<Array<{ data: unknown; error?: string }>>({ type: 'batch', queries })
}

/**
 * Führt mehrere Statements in einer Transaktion aus
 */
export async function transaction(statements: Array<{ sql: string; params?: unknown[] }>): Promise<void> {
  await initDB()
  await apiRequest({ type: 'transaction', statements })
}

/**
 * Export/Import nicht verfügbar bei Postgres — Stubs für Kompatibilität
 */
export async function exportDB(): Promise<Uint8Array> {
  throw new Error('exportDB not supported with Postgres backend')
}

export async function importDB(_data: Uint8Array): Promise<void> {
  throw new Error('importDB not supported with Postgres backend')
}

/**
 * Gibt den aktuellen Status der Datenbank zurück
 */
export function getDBStatus(): DBStatus {
  return status
}

/**
 * Gibt die aktuelle Datenbankversion zurück
 */
export function getDBVersion(): number {
  return 10 // Fixed — managed by migrations
}

/**
 * Prüft ob die Datenbank bereit ist
 */
export function isDBReady(): boolean {
  return status === 'ready'
}

/**
 * Schließt die Datenbankverbindung (no-op bei HTTP)
 */
export async function closeDB(): Promise<void> {
  status = 'uninitialized'
  initPromise = null
}

// ============================================================================
// Helper Functions for Common Operations
// ============================================================================

/**
 * Generiert eine UUID v4
 */
export function generateId(): string {
  return crypto.randomUUID()
}

/**
 * Gibt das aktuelle Datum im ISO Format zurück
 */
export function nowISO(): string {
  return new Date().toISOString()
}

/**
 * Konvertiert ein JavaScript-Objekt zu JSON für DB-Speicherung
 */
export function toJSON(obj: unknown): string {
  return JSON.stringify(obj)
}

/**
 * Parst JSON aus der Datenbank
 */
export function fromJSON<T>(json: string | null): T | null {
  if (!json) return null
  try {
    return JSON.parse(json) as T
  } catch {
    return null
  }
}

// ============================================================================
// Profile Operations
// ============================================================================

export type DBProfile = {
  id: string
  name: string
  color: string | null
  created_at: string
  updated_at: string
}

export async function getProfiles(): Promise<DBProfile[]> {
  return query<DBProfile>('SELECT * FROM profiles ORDER BY name')
}

export async function getProfileById(id: string): Promise<DBProfile | null> {
  return queryOne<DBProfile>('SELECT * FROM profiles WHERE id = ?', [id])
}

export async function getProfileByName(name: string): Promise<DBProfile | null> {
  return queryOne<DBProfile>('SELECT * FROM profiles WHERE name = ?', [name])
}

export async function insertProfile(profile: Omit<DBProfile, 'created_at' | 'updated_at'>): Promise<void> {
  const now = nowISO()
  await exec(
    'INSERT INTO profiles (id, name, color, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
    [profile.id, profile.name, profile.color, now, now]
  )
}

export async function updateProfile(id: string, updates: Partial<Pick<DBProfile, 'name' | 'color'>>): Promise<void> {
  const sets: string[] = []
  const params: unknown[] = []

  if (updates.name !== undefined) {
    sets.push('name = ?')
    params.push(updates.name)
  }
  if (updates.color !== undefined) {
    sets.push('color = ?')
    params.push(updates.color)
  }

  if (sets.length === 0) return

  sets.push('updated_at = ?')
  params.push(nowISO())
  params.push(id)

  await exec(`UPDATE profiles SET ${sets.join(', ')} WHERE id = ?`, params)
}

export async function deleteProfile(id: string): Promise<void> {
  await exec('DELETE FROM profiles WHERE id = ?', [id])
}

// ============================================================================
// System Meta Operations
// ============================================================================

export async function getMeta(key: string): Promise<string | null> {
  const result = await queryOne<{ value: string }>('SELECT value FROM system_meta WHERE key = ?', [key])
  return result?.value ?? null
}

export async function setMeta(key: string, value: string): Promise<void> {
  await exec(
    'INSERT OR REPLACE INTO system_meta (key, value, updated_at) VALUES (?, ?, ?)',
    [key, value, nowISO()]
  )
}

// ============================================================================
// X01 Match Operations
// ============================================================================

export type DBX01Match = {
  id: string
  title: string
  match_name: string | null
  notes: string | null
  created_at: string
  finished: number
  finished_at: string | null
  mode: string
  starting_score: number | null
  structure_kind: string | null
  best_of_legs: number | null
  legs_per_set: number | null
  best_of_sets: number | null
  in_rule: string | null
  out_rule: string | null
}

export async function getX01Matches(): Promise<DBX01Match[]> {
  return query<DBX01Match>('SELECT * FROM x01_matches ORDER BY created_at DESC')
}

export async function getX01MatchById(id: string): Promise<DBX01Match | null> {
  return queryOne<DBX01Match>('SELECT * FROM x01_matches WHERE id = ?', [id])
}

export async function insertX01Match(match: DBX01Match): Promise<void> {
  await exec(
    `INSERT INTO x01_matches (
      id, title, match_name, notes, created_at, finished, finished_at,
      mode, starting_score, structure_kind, best_of_legs, legs_per_set, best_of_sets,
      in_rule, out_rule
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      match.id, match.title, match.match_name, match.notes, match.created_at,
      match.finished, match.finished_at, match.mode, match.starting_score,
      match.structure_kind, match.best_of_legs, match.legs_per_set, match.best_of_sets,
      match.in_rule, match.out_rule
    ]
  )
}

export async function updateX01Match(id: string, finished: boolean, finished_at: string | null): Promise<void> {
  await exec(
    'UPDATE x01_matches SET finished = ?, finished_at = ? WHERE id = ?',
    [finished ? 1 : 0, finished_at, id]
  )
}

// ============================================================================
// X01 Event Operations
// ============================================================================

export type DBX01Event = {
  id: string
  match_id: string
  type: string
  ts: string
  seq: number
  data: string
}

export async function getX01Events(matchId: string): Promise<DBX01Event[]> {
  return query<DBX01Event>(
    'SELECT * FROM x01_events WHERE match_id = ? ORDER BY seq',
    [matchId]
  )
}

export async function insertX01Event(event: DBX01Event): Promise<void> {
  await exec(
    'INSERT INTO x01_events (id, match_id, type, ts, seq, data) VALUES (?, ?, ?, ?, ?, ?)',
    [event.id, event.match_id, event.type, event.ts, event.seq, event.data]
  )
}

export async function insertX01Events(events: DBX01Event[]): Promise<void> {
  if (events.length === 0) return

  const statements = events.map((event) => ({
    sql: 'INSERT INTO x01_events (id, match_id, type, ts, seq, data) VALUES (?, ?, ?, ?, ?, ?)',
    params: [event.id, event.match_id, event.type, event.ts, event.seq, event.data],
  }))

  await transaction(statements)
}

// ============================================================================
// Cricket Match Operations (analog zu X01)
// ============================================================================

export type DBCricketMatch = {
  id: string
  title: string
  match_name: string | null
  notes: string | null
  created_at: string
  finished: number
  finished_at: string | null
  range: string
  style: string
  best_of_games: number | null
  crazy_mode: string | null
  crazy_scoring_mode: string | null
}

export async function getCricketMatches(): Promise<DBCricketMatch[]> {
  return query<DBCricketMatch>('SELECT * FROM cricket_matches ORDER BY created_at DESC')
}

export async function getCricketMatchById(id: string): Promise<DBCricketMatch | null> {
  return queryOne<DBCricketMatch>('SELECT * FROM cricket_matches WHERE id = ?', [id])
}

export async function insertCricketMatch(match: DBCricketMatch): Promise<void> {
  await exec(
    `INSERT INTO cricket_matches (
      id, title, match_name, notes, created_at, finished, finished_at,
      range, style, best_of_games, crazy_mode, crazy_scoring_mode
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      match.id, match.title, match.match_name, match.notes, match.created_at,
      match.finished, match.finished_at, match.range, match.style,
      match.best_of_games, match.crazy_mode, match.crazy_scoring_mode
    ]
  )
}

// ============================================================================
// ATB Match Operations
// ============================================================================

export type DBATBMatch = {
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
  legs_per_set: number | null
  best_of_sets: number | null
  sequence_mode: string | null
  target_mode: string | null
  multiplier_mode: string | null
  special_rule: string | null
  generated_sequence: string | null
}

export async function getATBMatches(): Promise<DBATBMatch[]> {
  return query<DBATBMatch>('SELECT * FROM atb_matches ORDER BY created_at DESC')
}

export async function getATBMatchById(id: string): Promise<DBATBMatch | null> {
  return queryOne<DBATBMatch>('SELECT * FROM atb_matches WHERE id = ?', [id])
}

export async function insertATBMatch(match: DBATBMatch): Promise<void> {
  await exec(
    `INSERT INTO atb_matches (
      id, title, created_at, finished, finished_at, duration_ms, winner_id, winner_darts,
      mode, direction, structure_kind, best_of_legs, legs_per_set, best_of_sets,
      sequence_mode, target_mode, multiplier_mode, special_rule, generated_sequence
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      match.id, match.title, match.created_at, match.finished, match.finished_at,
      match.duration_ms, match.winner_id, match.winner_darts, match.mode, match.direction,
      match.structure_kind, match.best_of_legs, match.legs_per_set, match.best_of_sets,
      match.sequence_mode, match.target_mode, match.multiplier_mode, match.special_rule,
      match.generated_sequence
    ]
  )
}
