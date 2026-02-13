// src/db/index.ts
// Public API für SQLite Database
// Kommuniziert mit dem Web Worker

import type { WorkerRequest, WorkerResponse } from './worker'

// ============================================================================
// Types
// ============================================================================

type PendingRequest = {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
}

export type DBStatus = 'uninitialized' | 'initializing' | 'ready' | 'error'

// ============================================================================
// Worker Management
// ============================================================================

let worker: Worker | null = null
let requestId = 0
let pendingRequests = new Map<number, PendingRequest>()
let status: DBStatus = 'uninitialized'
let initPromise: Promise<void> | null = null
let dbVersion = 0

function createWorker(): Worker {
  // Vite Worker Import
  return new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
}

function sendRequest<T = unknown>(request: WorkerRequest): Promise<T> {
  return new Promise((resolve, reject) => {
    if (!worker) {
      reject(new Error('Database worker not initialized'))
      return
    }

    const id = ++requestId
    pendingRequests.set(id, {
      resolve: resolve as (value: unknown) => void,
      reject,
    })

    worker.postMessage({ id, ...request })
  })
}

function handleMessage(event: MessageEvent<WorkerResponse & { id?: number }>) {
  const { id, ...response } = event.data

  // Initial ready message (no id)
  if (response.type === 'ready' && id === undefined) {
    return
  }

  if (id === undefined) return

  const pending = pendingRequests.get(id)
  if (!pending) return
  pendingRequests.delete(id)

  switch (response.type) {
    case 'ready':
      dbVersion = response.version
      pending.resolve(undefined)
      break
    case 'result':
      pending.resolve(response.data)
      break
    case 'exported':
      pending.resolve(response.data)
      break
    case 'error':
      pending.reject(new Error(response.message))
      break
  }
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Initialisiert die Datenbank
 * Wird automatisch beim ersten Query aufgerufen
 */
export async function initDB(): Promise<void> {
  if (status === 'ready') return
  if (initPromise) return initPromise

  initPromise = (async () => {
    try {
      status = 'initializing'

      worker = createWorker()
      worker.onmessage = handleMessage
      worker.onerror = (e) => {
        console.error('[DB] Worker error:', e)
        status = 'error'
      }

      await sendRequest({ type: 'init' })
      status = 'ready'
      console.log('[DB] Initialized, version:', dbVersion)
    } catch (e) {
      status = 'error'
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
  return sendRequest({ type: 'exec', sql, params })
}

/**
 * Führt mehrere SQL Statements aus
 */
export async function execMany(statements: Array<{ sql: string; params?: unknown[] }>): Promise<void> {
  await initDB()
  return sendRequest({ type: 'execMany', statements })
}

/**
 * Führt eine Query aus und gibt alle Ergebnisse zurück
 */
export async function query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]> {
  await initDB()
  return sendRequest<T[]>({ type: 'query', sql, params })
}

/**
 * Führt eine Query aus und gibt das erste Ergebnis zurück
 */
export async function queryOne<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T | null> {
  await initDB()
  return sendRequest<T | null>({ type: 'queryOne', sql, params })
}

/**
 * Führt mehrere Statements in einer Transaktion aus
 */
export async function transaction(statements: Array<{ sql: string; params?: unknown[] }>): Promise<void> {
  await initDB()
  return sendRequest({ type: 'transaction', statements })
}

/**
 * Exportiert die gesamte Datenbank als Uint8Array
 */
export async function exportDB(): Promise<Uint8Array> {
  await initDB()
  return sendRequest<Uint8Array>({ type: 'export' })
}

/**
 * Importiert eine Datenbank aus einem Uint8Array
 * ACHTUNG: Ersetzt die komplette bestehende Datenbank!
 */
export async function importDB(data: Uint8Array): Promise<void> {
  await initDB()
  return sendRequest({ type: 'import', data })
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
  return dbVersion
}

/**
 * Prüft ob die Datenbank bereit ist
 */
export function isDBReady(): boolean {
  return status === 'ready'
}

/**
 * Schließt die Datenbankverbindung
 */
export async function closeDB(): Promise<void> {
  if (!worker) return

  try {
    await sendRequest({ type: 'close' })
  } finally {
    worker.terminate()
    worker = null
    status = 'uninitialized'
    initPromise = null
    pendingRequests.clear()
  }
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
