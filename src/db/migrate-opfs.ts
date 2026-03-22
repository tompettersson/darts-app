/**
 * One-time migration: reads the raw OPFS SQLite file and sends it
 * to the server for parsing and insertion into Postgres.
 *
 * Browser-side: reads /darts.sqlite from OPFS via File System Access API
 * Server-side: parses with better-sqlite3 and writes to Postgres
 */

/**
 * Reads the raw OPFS SQLite database file (no WASM needed).
 * Returns the file as ArrayBuffer, or null if not found.
 */
async function readOpfsFile(): Promise<ArrayBuffer | null> {
  try {
    if (!navigator.storage?.getDirectory) {
      console.debug('[OPFS Migration] File System Access API nicht verfügbar')
      return null
    }

    const root = await navigator.storage.getDirectory()

    // Try to find the SQLite database file
    // The old worker used '/darts.sqlite' as the DB name
    let fileHandle: FileSystemFileHandle | null = null

    // Try common OPFS paths where sqlite-wasm stores the DB
    for (const name of ['.darts.sqlite', 'darts.sqlite']) {
      try {
        fileHandle = await root.getFileHandle(name)
        break
      } catch {
        // File not found at this name, try next
      }
    }

    if (!fileHandle) {
      // Try listing root directory for any .sqlite files
      const entries: string[] = []
      for await (const [name] of (root as any).entries()) {
        entries.push(name)
      }
      console.debug('[OPFS Migration] OPFS Dateien:', entries)

      // Look for any sqlite file
      const sqliteFile = entries.find(n => n.includes('sqlite') || n.includes('.db'))
      if (sqliteFile) {
        fileHandle = await root.getFileHandle(sqliteFile)
        console.debug('[OPFS Migration] SQLite-Datei gefunden:', sqliteFile)
      }
    }

    if (!fileHandle) {
      console.debug('[OPFS Migration] Keine SQLite-Datei in OPFS gefunden')
      return null
    }

    const file = await fileHandle.getFile()
    if (file.size < 100) {
      console.debug('[OPFS Migration] SQLite-Datei ist zu klein:', file.size, 'bytes')
      return null
    }

    console.debug(`[OPFS Migration] SQLite-Datei gefunden: ${file.name}, ${(file.size / 1024).toFixed(1)} KB`)
    return await file.arrayBuffer()
  } catch (e: any) {
    console.warn('[OPFS Migration] OPFS Zugriff fehlgeschlagen:', e.message)
    return null
  }
}

/**
 * Sends the raw SQLite file to the server for parsing and migration.
 */
async function sendToServer(data: ArrayBuffer): Promise<{ success: boolean; stats?: Record<string, number>; error?: string }> {
  try {
    console.debug(`[OPFS Migration] Sende ${(data.byteLength / 1024).toFixed(1)} KB an Server...`)

    const response = await fetch('/api/migrate-opfs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: data,
    })

    const result = await response.json()

    if (!response.ok) {
      console.error('[OPFS Migration] Server-Fehler:', result.error)
      return { success: false, error: result.error }
    }

    console.log('[OPFS Migration] ✅ Server-Migration erfolgreich!', result.stats)
    return { success: true, stats: result.stats }
  } catch (e: any) {
    console.error('[OPFS Migration] Senden fehlgeschlagen:', e.message)
    return { success: false, error: e.message }
  }
}

/**
 * Main migration function: reads OPFS file and sends to server.
 */
export async function migrateOpfsToPostgres(): Promise<boolean> {
  const data = await readOpfsFile()
  if (!data) return false

  const result = await sendToServer(data)
  return result.success
}
