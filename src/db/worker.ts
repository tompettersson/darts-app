// src/db/worker.ts
// Web Worker für SQLite Datenbankoperationen
// Läuft in separatem Thread um UI nicht zu blockieren

import sqlite3InitModule, { type Database, type Sqlite3Static, type BindingSpec } from '@sqlite.org/sqlite-wasm'
import { ALL_SCHEMA_STATEMENTS, CURRENT_DB_VERSION } from './schema'

const DB_NAME = '/darts.sqlite'

let db: Database | null = null
let sqlite3: Sqlite3Static | null = null

// Helper: Konvertiert unknown[] zu BindingSpec
function toBindSpec(params?: unknown[]): BindingSpec | undefined {
  if (!params || params.length === 0) return undefined
  return params as BindingSpec
}

// ============================================================================
// Worker Message Types
// ============================================================================

export type WorkerRequest =
  | { type: 'init' }
  | { type: 'exec'; sql: string; params?: unknown[] }
  | { type: 'execMany'; statements: Array<{ sql: string; params?: unknown[] }> }
  | { type: 'query'; sql: string; params?: unknown[] }
  | { type: 'queryOne'; sql: string; params?: unknown[] }
  | { type: 'transaction'; statements: Array<{ sql: string; params?: unknown[] }> }
  | { type: 'close' }
  | { type: 'export' }
  | { type: 'import'; data: Uint8Array }
  | { type: 'getVersion' }

export type WorkerResponse =
  | { type: 'ready'; version: number }
  | { type: 'result'; data: unknown }
  | { type: 'error'; message: string; code?: string }
  | { type: 'exported'; data: Uint8Array }

// ============================================================================
// Database Initialization
// ============================================================================

async function initDatabase(): Promise<number> {
  if (db) return getCurrentVersion()

  sqlite3 = await sqlite3InitModule()

  console.log('[SQLite Worker] Running SQLite version:', sqlite3.version.libVersion)

  // Versuche OPFS für persistenten Speicher
  if (sqlite3.oo1.OpfsDb) {
    try {
      db = new sqlite3.oo1.OpfsDb(DB_NAME)
      console.log('[SQLite Worker] Using OPFS storage')
    } catch (e) {
      console.warn('[SQLite Worker] OPFS not available, falling back to memory:', e)
      db = new sqlite3.oo1.DB(':memory:')
    }
  } else {
    console.log('[SQLite Worker] OPFS not supported, using in-memory database')
    db = new sqlite3.oo1.DB(':memory:')
  }

  // Schema initialisieren
  await runMigrations()

  return getCurrentVersion()
}

function getCurrentVersion(): number {
  if (!db) return 0
  try {
    const result = db.selectValue('SELECT value FROM system_meta WHERE key = ?', ['db_version'])
    return result ? parseInt(result as string, 10) : 0
  } catch {
    return 0
  }
}

async function runMigrations(): Promise<void> {
  if (!db) throw new Error('Database not initialized')

  const currentVersion = getCurrentVersion()

  if (currentVersion < CURRENT_DB_VERSION) {
    console.log(`[SQLite Worker] Migrating from v${currentVersion} to v${CURRENT_DB_VERSION}`)

    // Run all schema statements
    for (const sql of ALL_SCHEMA_STATEMENTS) {
      try {
        db.exec(sql)
      } catch (e) {
        console.error('[SQLite Worker] Migration error:', sql, e)
        throw e
      }
    }

    // Update version
    db.exec(
      `INSERT OR REPLACE INTO system_meta (key, value, updated_at)
       VALUES ('db_version', ?, datetime('now'))`,
      { bind: toBindSpec([CURRENT_DB_VERSION.toString()]) }
    )

    console.log('[SQLite Worker] Migration complete')
  }
}

// ============================================================================
// Query Execution
// ============================================================================

function exec(sql: string, params?: unknown[]): void {
  if (!db) throw new Error('Database not initialized')
  db.exec(sql, { bind: toBindSpec(params) })
}

function execMany(statements: Array<{ sql: string; params?: unknown[] }>): void {
  if (!db) throw new Error('Database not initialized')
  for (const stmt of statements) {
    db.exec(stmt.sql, { bind: toBindSpec(stmt.params) })
  }
}

function query<T = Record<string, unknown>>(sql: string, params?: unknown[]): T[] {
  if (!db) throw new Error('Database not initialized')
  const results: T[] = []
  db.exec(sql, {
    bind: toBindSpec(params),
    rowMode: 'object',
    callback: (row) => {
      results.push(row as T)
    },
  })
  return results
}

function queryOne<T = Record<string, unknown>>(sql: string, params?: unknown[]): T | null {
  const results = query<T>(sql, params)
  return results[0] ?? null
}

function runTransaction(statements: Array<{ sql: string; params?: unknown[] }>): void {
  if (!db) throw new Error('Database not initialized')

  db.exec('BEGIN TRANSACTION')
  try {
    for (const stmt of statements) {
      db.exec(stmt.sql, { bind: toBindSpec(stmt.params) })
    }
    db.exec('COMMIT')
  } catch (e) {
    db.exec('ROLLBACK')
    throw e
  }
}

function exportDatabase(): Uint8Array {
  if (!db) throw new Error('Database not initialized')
  return sqlite3!.capi.sqlite3_js_db_export(db)
}

function importDatabase(data: Uint8Array): void {
  // Schließe bestehende DB falls offen
  if (db) {
    db.close()
    db = null
  }

  // Neue in-memory DB erstellen
  db = new sqlite3!.oo1.DB()

  // Daten deserialisieren
  const p = sqlite3!.wasm.allocFromTypedArray(data)
  const dbPointer = db.pointer
  if (!dbPointer) {
    throw new Error('Database pointer is undefined')
  }

  const rc = sqlite3!.capi.sqlite3_deserialize(
    dbPointer,
    'main',
    p,
    data.length,
    data.length,
    sqlite3!.capi.SQLITE_DESERIALIZE_FREEONCLOSE |
    sqlite3!.capi.SQLITE_DESERIALIZE_RESIZEABLE
  )

  if (rc !== 0) {
    throw new Error(`sqlite3_deserialize failed with code ${rc}`)
  }
}

function closeDatabase(): void {
  if (db) {
    db.close()
    db = null
  }
}

// ============================================================================
// Message Handler
// ============================================================================

self.onmessage = async (event: MessageEvent<WorkerRequest & { id: number }>) => {
  const { id, ...request } = event.data

  try {
    let response: WorkerResponse

    switch (request.type) {
      case 'init': {
        const version = await initDatabase()
        response = { type: 'ready', version }
        break
      }
      case 'exec': {
        exec(request.sql, request.params)
        response = { type: 'result', data: null }
        break
      }
      case 'execMany': {
        execMany(request.statements)
        response = { type: 'result', data: null }
        break
      }
      case 'query': {
        const data = query(request.sql, request.params)
        response = { type: 'result', data }
        break
      }
      case 'queryOne': {
        const data = queryOne(request.sql, request.params)
        response = { type: 'result', data }
        break
      }
      case 'transaction': {
        runTransaction(request.statements)
        response = { type: 'result', data: null }
        break
      }
      case 'export': {
        const data = exportDatabase()
        response = { type: 'exported', data }
        break
      }
      case 'import': {
        importDatabase(request.data)
        response = { type: 'result', data: null }
        break
      }
      case 'getVersion': {
        const version = getCurrentVersion()
        response = { type: 'result', data: version }
        break
      }
      case 'close': {
        closeDatabase()
        response = { type: 'result', data: null }
        break
      }
      default:
        response = { type: 'error', message: `Unknown request type: ${(request as any).type}` }
    }

    self.postMessage({ id, ...response })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    self.postMessage({ id, type: 'error', message })
  }
}

// Signal ready
self.postMessage({ type: 'ready', version: 0 })
