/**
 * One-time migration: reads all data from the old OPFS SQLite database
 * (via the existing worker.ts) and returns it for insertion into Postgres.
 *
 * This module is dynamically imported only when migration is needed,
 * so the sqlite-wasm dependency is not loaded in normal operation.
 */

type WorkerMsg = { id: number; type: string; sql?: string; params?: unknown[] }
type WorkerResp = { id: number; type: string; data?: unknown; message?: string; version?: number }

function createOldWorker(): Worker {
  return new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
}

function workerRequest<T = unknown>(worker: Worker, msg: Omit<WorkerMsg, 'id'>, id: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const handler = (e: MessageEvent<WorkerResp>) => {
      if (e.data.id !== id) return
      worker.removeEventListener('message', handler)
      if (e.data.type === 'error') reject(new Error(e.data.message || 'Worker error'))
      else resolve(e.data.data as T)
    }
    worker.addEventListener('message', handler)
    worker.postMessage({ id, ...msg })
  })
}

export type OpfsDump = {
  profiles: any[]
  x01Matches: any[]
  x01Events: any[]
  x01MatchPlayers: any[]
  cricketMatches: any[]
  cricketEvents: any[]
  cricketMatchPlayers: any[]
  atbMatches: any[]
  atbEvents: any[]
  atbMatchPlayers: any[]
  atbHighscores: any[]
  ctfMatches: any[]
  ctfEvents: any[]
  ctfMatchPlayers: any[]
  strMatches: any[]
  strEvents: any[]
  strMatchPlayers: any[]
  highscoreMatches: any[]
  highscoreEvents: any[]
  highscoreMatchPlayers: any[]
  shanghaiMatches: any[]
  shanghaiEvents: any[]
  shanghaiMatchPlayers: any[]
  killerMatches: any[]
  killerEvents: any[]
  killerMatchPlayers: any[]
  bobs27Matches: any[]
  bobs27Events: any[]
  bobs27MatchPlayers: any[]
  operationMatches: any[]
  operationEvents: any[]
  operationMatchPlayers: any[]
  x01PlayerStats: any[]
  x01FinishingDoubles: any[]
  stats121: any[]
  stats121Doubles: any[]
  cricketPlayerStats: any[]
  x01Leaderboards: any[]
  cricketLeaderboards: any[]
  outbox: any[]
  systemMeta: any[]
}

const TABLES: Array<{ key: keyof OpfsDump; sql: string }> = [
  { key: 'profiles', sql: 'SELECT * FROM profiles' },
  { key: 'systemMeta', sql: 'SELECT * FROM system_meta' },
  { key: 'x01Matches', sql: 'SELECT * FROM x01_matches' },
  { key: 'x01Events', sql: 'SELECT * FROM x01_events' },
  { key: 'x01MatchPlayers', sql: 'SELECT * FROM x01_match_players' },
  { key: 'x01PlayerStats', sql: 'SELECT * FROM x01_player_stats' },
  { key: 'x01FinishingDoubles', sql: 'SELECT * FROM x01_finishing_doubles' },
  { key: 'x01Leaderboards', sql: 'SELECT * FROM x01_leaderboards' },
  { key: 'cricketMatches', sql: 'SELECT * FROM cricket_matches' },
  { key: 'cricketEvents', sql: 'SELECT * FROM cricket_events' },
  { key: 'cricketMatchPlayers', sql: 'SELECT * FROM cricket_match_players' },
  { key: 'cricketPlayerStats', sql: 'SELECT * FROM cricket_player_stats' },
  { key: 'cricketLeaderboards', sql: 'SELECT * FROM cricket_leaderboards' },
  { key: 'atbMatches', sql: 'SELECT * FROM atb_matches' },
  { key: 'atbEvents', sql: 'SELECT * FROM atb_events' },
  { key: 'atbMatchPlayers', sql: 'SELECT * FROM atb_match_players' },
  { key: 'atbHighscores', sql: 'SELECT * FROM atb_highscores' },
  { key: 'ctfMatches', sql: 'SELECT * FROM ctf_matches' },
  { key: 'ctfEvents', sql: 'SELECT * FROM ctf_events' },
  { key: 'ctfMatchPlayers', sql: 'SELECT * FROM ctf_match_players' },
  { key: 'strMatches', sql: 'SELECT * FROM str_matches' },
  { key: 'strEvents', sql: 'SELECT * FROM str_events' },
  { key: 'strMatchPlayers', sql: 'SELECT * FROM str_match_players' },
  { key: 'highscoreMatches', sql: 'SELECT * FROM highscore_matches' },
  { key: 'highscoreEvents', sql: 'SELECT * FROM highscore_events' },
  { key: 'highscoreMatchPlayers', sql: 'SELECT * FROM highscore_match_players' },
  { key: 'shanghaiMatches', sql: 'SELECT * FROM shanghai_matches' },
  { key: 'shanghaiEvents', sql: 'SELECT * FROM shanghai_events' },
  { key: 'shanghaiMatchPlayers', sql: 'SELECT * FROM shanghai_match_players' },
  { key: 'killerMatches', sql: 'SELECT * FROM killer_matches' },
  { key: 'killerEvents', sql: 'SELECT * FROM killer_events' },
  { key: 'killerMatchPlayers', sql: 'SELECT * FROM killer_match_players' },
  { key: 'bobs27Matches', sql: 'SELECT * FROM bobs27_matches' },
  { key: 'bobs27Events', sql: 'SELECT * FROM bobs27_events' },
  { key: 'bobs27MatchPlayers', sql: 'SELECT * FROM bobs27_match_players' },
  { key: 'operationMatches', sql: 'SELECT * FROM operation_matches' },
  { key: 'operationEvents', sql: 'SELECT * FROM operation_events' },
  { key: 'operationMatchPlayers', sql: 'SELECT * FROM operation_match_players' },
  { key: 'stats121', sql: 'SELECT * FROM stats_121' },
  { key: 'stats121Doubles', sql: 'SELECT * FROM stats_121_doubles' },
  { key: 'outbox', sql: 'SELECT * FROM outbox' },
]

/**
 * Reads all data from the old OPFS SQLite database.
 * Returns null if no OPFS database exists or it's empty.
 */
export async function readOpfsData(): Promise<OpfsDump | null> {
  let worker: Worker | null = null

  try {
    console.debug('[OPFS Migration] Versuche alte OPFS-Datenbank zu öffnen...')
    worker = createOldWorker()

    // Wait for worker init (with 10s timeout)
    let reqId = 1
    const version = await Promise.race([
      workerRequest<number>(worker, { type: 'init' }, reqId++),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Worker init timeout')), 10000)
      ),
    ])

    console.debug('[OPFS Migration] OPFS SQLite geöffnet, Version:', version)

    // Check if there's any data worth migrating
    const profiles = await workerRequest<any[]>(worker, {
      type: 'query', sql: 'SELECT * FROM profiles',
    }, reqId++)

    if (!profiles || profiles.length === 0) {
      console.debug('[OPFS Migration] Keine Profile in OPFS gefunden, überspringe Migration')
      worker.terminate()
      return null
    }

    console.debug(`[OPFS Migration] ${profiles.length} Profile gefunden, lese alle Tabellen...`)

    // Read all tables
    const dump: Record<string, any[]> = { profiles }

    for (const table of TABLES) {
      if (table.key === 'profiles') continue // already read
      try {
        const rows = await workerRequest<any[]>(worker, {
          type: 'query', sql: table.sql,
        }, reqId++)
        dump[table.key] = rows || []
      } catch (e) {
        console.warn(`[OPFS Migration] Tabelle ${table.key} nicht lesbar:`, e)
        dump[table.key] = []
      }
    }

    worker.terminate()
    worker = null

    // Count totals
    const totalRows = Object.values(dump).reduce((sum, arr) => sum + arr.length, 0)
    console.debug(`[OPFS Migration] ${totalRows} Zeilen aus ${Object.keys(dump).length} Tabellen gelesen`)

    return dump as OpfsDump
  } catch (e: any) {
    console.warn('[OPFS Migration] Konnte OPFS nicht lesen:', e.message)
    if (worker) worker.terminate()
    return null
  }
}

/**
 * Writes OPFS dump data to Postgres via the API.
 */
export async function writeToPostgres(dump: OpfsDump): Promise<{ success: boolean; stats: Record<string, number> }> {
  const apiUrl = '/api/db'
  const stats: Record<string, number> = {}

  async function apiExec(sql: string, params?: unknown[]) {
    const resp = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'exec', sql, params }),
    })
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}))
      throw new Error(`API error: ${err.error || resp.statusText}`)
    }
  }

  // Helper: insert rows into a table
  async function insertRows(tableName: string, rows: any[]) {
    if (!rows || rows.length === 0) return
    stats[tableName] = rows.length

    for (const row of rows) {
      const columns = Object.keys(row)
      const placeholders = columns.map(() => '?').join(', ')
      const values = columns.map(c => row[c])
      const sql = `INSERT OR IGNORE INTO ${tableName} (${columns.join(', ')}) VALUES (${placeholders})`
      try {
        await apiExec(sql, values)
      } catch (e: any) {
        // Skip duplicates silently
        if (!e.message?.includes('duplicate') && !e.message?.includes('conflict')) {
          console.warn(`[OPFS Migration] Insert in ${tableName} fehlgeschlagen:`, e.message)
        }
      }
    }
  }

  try {
    console.debug('[OPFS Migration] Schreibe Daten nach Postgres...')

    // Order matters: profiles first (FK references), then matches, then events/players
    await insertRows('profiles', dump.profiles)
    await insertRows('system_meta', dump.systemMeta.filter(m => m.key !== 'db_version'))

    // X01
    await insertRows('x01_matches', dump.x01Matches)
    await insertRows('x01_match_players', dump.x01MatchPlayers)
    await insertRows('x01_events', dump.x01Events)
    await insertRows('x01_player_stats', dump.x01PlayerStats)
    await insertRows('x01_finishing_doubles', dump.x01FinishingDoubles)
    await insertRows('x01_leaderboards', dump.x01Leaderboards)

    // Cricket
    await insertRows('cricket_matches', dump.cricketMatches)
    await insertRows('cricket_match_players', dump.cricketMatchPlayers)
    await insertRows('cricket_events', dump.cricketEvents)
    await insertRows('cricket_player_stats', dump.cricketPlayerStats)
    await insertRows('cricket_leaderboards', dump.cricketLeaderboards)

    // ATB
    await insertRows('atb_matches', dump.atbMatches)
    await insertRows('atb_match_players', dump.atbMatchPlayers)
    await insertRows('atb_events', dump.atbEvents)
    await insertRows('atb_highscores', dump.atbHighscores)

    // CTF
    await insertRows('ctf_matches', dump.ctfMatches)
    await insertRows('ctf_match_players', dump.ctfMatchPlayers)
    await insertRows('ctf_events', dump.ctfEvents)

    // STR
    await insertRows('str_matches', dump.strMatches)
    await insertRows('str_match_players', dump.strMatchPlayers)
    await insertRows('str_events', dump.strEvents)

    // Highscore
    await insertRows('highscore_matches', dump.highscoreMatches)
    await insertRows('highscore_match_players', dump.highscoreMatchPlayers)
    await insertRows('highscore_events', dump.highscoreEvents)

    // Shanghai
    await insertRows('shanghai_matches', dump.shanghaiMatches)
    await insertRows('shanghai_match_players', dump.shanghaiMatchPlayers)
    await insertRows('shanghai_events', dump.shanghaiEvents)

    // Killer
    await insertRows('killer_matches', dump.killerMatches)
    await insertRows('killer_match_players', dump.killerMatchPlayers)
    await insertRows('killer_events', dump.killerEvents)

    // Bobs27
    await insertRows('bobs27_matches', dump.bobs27Matches)
    await insertRows('bobs27_match_players', dump.bobs27MatchPlayers)
    await insertRows('bobs27_events', dump.bobs27Events)

    // Operation
    await insertRows('operation_matches', dump.operationMatches)
    await insertRows('operation_match_players', dump.operationMatchPlayers)
    await insertRows('operation_events', dump.operationEvents)

    // Stats
    await insertRows('stats_121', dump.stats121)
    await insertRows('stats_121_doubles', dump.stats121Doubles)

    // Outbox
    await insertRows('outbox', dump.outbox)

    const totalRows = Object.values(stats).reduce((sum, n) => sum + n, 0)
    console.debug(`[OPFS Migration] ✅ ${totalRows} Zeilen in ${Object.keys(stats).length} Tabellen geschrieben`)
    console.debug('[OPFS Migration] Details:', stats)

    return { success: true, stats }
  } catch (e: any) {
    console.error('[OPFS Migration] ❌ Fehler beim Schreiben:', e)
    return { success: false, stats }
  }
}
