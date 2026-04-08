import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import type { Plugin } from 'vite'

/** Auth handler for dev server — mirrors api/auth.js logic */
async function handleAuthRequest(sql: any, bcrypt: any, body: any): Promise<any> {
  const SALT_ROUNDS = 10
  try { await sql`ALTER TABLE profiles ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{}'` } catch {}

  switch (body.type) {
    case 'verify': {
      const { profileId, password } = body
      if (!profileId || !password) return { valid: false }
      const rows = await sql`SELECT password_hash, settings FROM profiles WHERE id = ${profileId}`
      if (!rows[0]?.password_hash) return { valid: false }
      const valid = await bcrypt.compare(password, rows[0].password_hash)
      if (!valid) return { valid: false }
      const sessionToken = crypto.randomUUID()
      const now = new Date().toISOString()
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
      await sql`DELETE FROM sessions WHERE profile_id = ${profileId}`
      await sql`INSERT INTO sessions (session_token, profile_id, created_at, expires_at, last_used_at) VALUES (${sessionToken}, ${profileId}, ${now}, ${expiresAt}, ${now})`
      return { valid: true, sessionToken, settings: rows[0]?.settings || {} }
    }
    case 'validate-session': {
      const { sessionToken } = body
      if (!sessionToken) return { valid: false }
      const rows = await sql`SELECT profile_id, expires_at FROM sessions WHERE session_token = ${sessionToken}`
      if (!rows[0]) return { valid: false }
      if (rows[0].expires_at < new Date().toISOString()) {
        await sql`DELETE FROM sessions WHERE session_token = ${sessionToken}`
        return { valid: false }
      }
      await sql`UPDATE sessions SET last_used_at = ${new Date().toISOString()} WHERE session_token = ${sessionToken}`
      const profileRows = await sql`SELECT settings FROM profiles WHERE id = ${rows[0].profile_id}`
      return { valid: true, profileId: rows[0].profile_id, settings: profileRows[0]?.settings || {} }
    }
    case 'update-settings': {
      const { sessionToken, settings } = body
      if (!sessionToken || !settings) throw new Error('Missing fields')
      const session = await sql`SELECT profile_id FROM sessions WHERE session_token = ${sessionToken} AND expires_at > ${new Date().toISOString()}`
      if (!session[0]) throw new Error('Invalid session')
      await sql`UPDATE profiles SET settings = ${JSON.stringify(settings)}, updated_at = ${new Date().toISOString()} WHERE id = ${session[0].profile_id}`
      return { success: true }
    }
    case 'logout': {
      if (body.sessionToken) await sql`DELETE FROM sessions WHERE session_token = ${body.sessionToken}`
      return { success: true }
    }
    case 'verify-multi': {
      const { players } = body
      if (!Array.isArray(players)) return { results: [] }
      const ids = players.map((p: any) => p.profileId)
      const rows = await sql`SELECT id, password_hash FROM profiles WHERE id = ANY(${ids})`
      const hashMap = Object.fromEntries(rows.map((r: any) => [r.id, r.password_hash]))
      const results = await Promise.all(players.map(async (p: any) => {
        const hash = hashMap[p.profileId]
        if (!hash) return { profileId: p.profileId, valid: false }
        return { profileId: p.profileId, valid: await bcrypt.compare(p.password, hash) }
      }))
      return { results }
    }
    case 'change-password': {
      const { profileId, oldPassword, newPassword } = body
      if (!profileId || !oldPassword || !newPassword) throw new Error('Missing fields')
      const rows = await sql`SELECT password_hash FROM profiles WHERE id = ${profileId}`
      if (!rows[0]?.password_hash) throw new Error('Profile not found')
      if (!await bcrypt.compare(oldPassword, rows[0].password_hash)) return { success: false, error: 'Falsches Passwort' }
      await sql`UPDATE profiles SET password_hash = ${await bcrypt.hash(newPassword, SALT_ROUNDS)}, updated_at = ${new Date().toISOString()} WHERE id = ${profileId}`
      return { success: true }
    }
    case 'admin-reset-password': {
      const { adminId, adminPassword, targetProfileId, newPassword } = body
      if (!adminId || !adminPassword || !targetProfileId || !newPassword) throw new Error('Missing fields')
      const adminRows = await sql`SELECT password_hash, is_admin FROM profiles WHERE id = ${adminId}`
      if (!adminRows[0]?.is_admin) throw new Error('Not admin')
      if (!await bcrypt.compare(adminPassword, adminRows[0].password_hash)) return { success: false, error: 'Admin-Passwort falsch' }
      await sql`UPDATE profiles SET password_hash = ${await bcrypt.hash(newPassword, SALT_ROUNDS)}, updated_at = ${new Date().toISOString()} WHERE id = ${targetProfileId}`
      return { success: true }
    }
    case 'create-profile': {
      const { name, password, color } = body
      if (!name || !password) throw new Error('Missing name or password')
      const existing = await sql`SELECT id FROM profiles WHERE LOWER(name) = LOWER(${name.trim()})`
      if (existing.length > 0) throw new Error('Name existiert bereits')
      const id = crypto.randomUUID()
      const now = new Date().toISOString()
      await sql`INSERT INTO profiles (id, name, color, password_hash, is_admin, created_at, updated_at) VALUES (${id}, ${name.trim()}, ${color || null}, ${await bcrypt.hash(password, SALT_ROUNDS)}, 0, ${now}, ${now})`
      return { success: true, id, name: name.trim() }
    }
    case 'migrate-passwords': {
      const profiles = await sql`SELECT id, name FROM profiles WHERE password_hash IS NULL`
      let count = 0
      for (const p of profiles) { await sql`UPDATE profiles SET password_hash = ${await bcrypt.hash(p.name + '1', SALT_ROUNDS)} WHERE id = ${p.id}`; count++ }
      await sql`UPDATE profiles SET is_admin = 1 WHERE LOWER(name) = 'david'`
      await sql`INSERT INTO system_meta (key, value) VALUES ('passwords_migrated', 'true') ON CONFLICT (key) DO UPDATE SET value = 'true'`
      return { migrated: true, count }
    }
    case 'get-auth-profiles': {
      const rows = await sql`SELECT id, name, color, is_admin FROM profiles ORDER BY name`
      return { profiles: rows.map((r: any) => ({ id: r.id, name: r.name, color: r.color, isAdmin: r.is_admin === 1 || r.is_admin === true })) }
    }
    default: throw new Error('Unknown auth type: ' + body.type)
  }
}

/** Vite Plugin: Local API proxy for /api/db → Neon Postgres */
function localApiProxy(): Plugin {
  return {
    name: 'local-api-proxy',
    configureServer(server) {
      server.middlewares.use('/api/db', async (req, res) => {
        if (req.method === 'OPTIONS') {
          res.writeHead(200, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type, X-Api-Key' })
          res.end()
          return
        }
        if (req.method !== 'POST') {
          res.writeHead(405)
          res.end(JSON.stringify({ error: 'Method not allowed' }))
          return
        }

        // Parse body
        const chunks: Buffer[] = []
        for await (const chunk of req) chunks.push(chunk as Buffer)
        const body = JSON.parse(Buffer.concat(chunks).toString())

        try {
          // Dynamic import to avoid bundling in client
          const pgLib = await import('postgres')
          const { config } = await import('dotenv')
          config({ path: '.env.local' })
          if (!process.env.DATABASE_URL) config() // fallback to .env
          const sql = pgLib.default(process.env.DATABASE_URL!, { max: 1, idle_timeout: 20 })

          const convertPlaceholders = (s: string) => { let i = 0; return s.replace(/\?/g, () => `$${++i}`) }


          // Neon/pg returns bigint/numeric as strings — coerce to JS numbers
          function coerceNumericValues(rows: any[]) {
            for (const row of rows) {
              if (!row || typeof row !== 'object') continue
              for (const key of Object.keys(row)) {
                const val = row[key]
                if (typeof val === 'string' && val !== '' && /^-?\d+(\.\d+)?$/.test(val)) {
                  row[key] = Number(val)
                }
              }
            }
            return rows
          }

          let data: unknown = null

          switch (body.type) {
            case 'query': {
              data = coerceNumericValues(await sql.unsafe(convertPlaceholders(body.sql), body.params))
              break
            }
            case 'queryOne': {
              const rows = await sql.unsafe(convertPlaceholders(body.sql), body.params)
              if (rows[0]) coerceNumericValues([rows[0]])
              data = rows[0] ?? null
              break
            }
            case 'exec': {
              await sql.unsafe(convertPlaceholders(body.sql), body.params)
              break
            }
            case 'execMany':
            case 'transaction': {
              await sql`BEGIN`
              try {
                for (const stmt of body.statements) {
                  await sql.unsafe(convertPlaceholders(stmt.sql), stmt.params)
                }
                await sql`COMMIT`
              } catch (e) {
                await sql`ROLLBACK`
                throw e
              }
              break
            }
            case 'batch': {
              data = await Promise.all(
                body.queries.map(async (q: any) => {
                  try {
                    const rows = await sql.unsafe(convertPlaceholders(q.sql), q.params)
                    coerceNumericValues(rows)
                    return { data: q.mode === 'one' ? (rows[0] ?? null) : rows }
                  } catch (e: any) {
                    return { error: e.message }
                  }
                })
              )
              break
            }
            case 'auth': {
              // Auth requests routed through /api/db to work around Vite middleware issues
              const bcryptLib = await import('bcryptjs')
              const bcrypt = bcryptLib.default
              const authBody = body.auth
              data = await handleAuthRequest(sql, bcrypt, authBody)
              break
            }
          }

          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ data }))
        } catch (err: any) {
          console.error('[API/DB Local]', err.message)
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: err.message }))
        }
      })

      // OPFS Migration endpoint: receives raw SQLite bytes, parses with better-sqlite3, writes to Postgres
      server.middlewares.use('/api/migrate-opfs', async (req, res) => {
        if (req.method !== 'POST') {
          res.writeHead(405)
          res.end(JSON.stringify({ error: 'POST only' }))
          return
        }

        const chunks: Buffer[] = []
        for await (const chunk of req) chunks.push(chunk as Buffer)
        const sqliteBytes = Buffer.concat(chunks)

        try {
          const initSqlJs = (await import('sql.js')).default
          const SQL = await initSqlJs()
          const pgLib2 = await import('postgres')
          const { config } = await import('dotenv')
          config()
          const pgSql = pgLib2.default(process.env.DATABASE_URL!, { max: 1, idle_timeout: 20 })

          const db = new SQL.Database(new Uint8Array(sqliteBytes))
          const stats: Record<string, number> = {}

          // Get all tables
          const tablesResult = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
          const tables = tablesResult[0]?.values?.map((r: any) => ({ name: r[0] as string })) || []

          for (const { name: table } of tables) {
            try {
              const result = db.exec(`SELECT * FROM ${table}`)
              if (!result[0]) continue
              const columns = result[0].columns
              const rows = result[0].values.map((vals: any[]) => {
                const row: Record<string, any> = {}
                columns.forEach((col: string, i: number) => { row[col] = vals[i] })
                return row
              })
              if (rows.length === 0) continue

              console.log(`[OPFS Migration] ${table}: ${rows.length} Zeilen gelesen`)

              // Insert rows into Postgres
              let ok = 0, fail = 0, firstError = ''
              for (const row of rows) {
                const cols = Object.keys(row)
                const placeholders = cols.map((_, i) => `$${i + 1}`)
                // Convert Uint8Array blobs to Buffer for Postgres
                const values = cols.map(c => {
                  const v = row[c]
                  return v instanceof Uint8Array ? Buffer.from(v) : v
                })

                const pks: Record<string, string[]> = {
                  profiles: ['id'], system_meta: ['key'],
                  x01_matches: ['id'], x01_match_players: ['match_id', 'player_id'],
                  x01_events: ['id'], x01_player_stats: ['player_id'],
                  x01_finishing_doubles: ['player_id', 'double_field'],
                  cricket_matches: ['id'], cricket_match_players: ['match_id', 'player_id'],
                  cricket_events: ['id'], cricket_player_stats: ['player_id'],
                  atb_matches: ['id'], atb_match_players: ['match_id', 'player_id'],
                  atb_events: ['id'], atb_highscores: ['id'],
                  ctf_matches: ['id'], ctf_match_players: ['match_id', 'player_id'],
                  ctf_events: ['id'],
                  str_matches: ['id'], str_match_players: ['match_id', 'player_id'],
                  str_events: ['id'],
                  highscore_matches: ['id'], highscore_match_players: ['match_id', 'player_id'],
                  highscore_events: ['id'],
                  shanghai_matches: ['id'], shanghai_match_players: ['match_id', 'player_id'],
                  shanghai_events: ['id'],
                  killer_matches: ['id'], killer_match_players: ['match_id', 'player_id'],
                  killer_events: ['id'],
                  bobs27_matches: ['id'], bobs27_match_players: ['match_id', 'player_id'],
                  bobs27_events: ['id'],
                  operation_matches: ['id'], operation_match_players: ['match_id', 'player_id'],
                  operation_events: ['id'],
                  stats_121: ['player_id'], stats_121_doubles: ['player_id', 'double_field'],
                  outbox: ['id'],
                }
                const pk = pks[table]
                const conflict = pk ? ` ON CONFLICT (${pk.join(', ')}) DO NOTHING` : ''

                try {
                  await pgSql.unsafe(`INSERT INTO ${table} (${cols.join(', ')}) VALUES (${placeholders.join(', ')})${conflict}`, values)
                  ok++
                } catch (insertErr: any) {
                  fail++
                  if (!firstError) firstError = insertErr.message?.slice(0, 200) || 'unknown'
                }
              }
              stats[table] = ok
              console.log(`[OPFS Migration] ${table}: ${ok} OK, ${fail} fehlgeschlagen${firstError ? ` (erster Fehler: ${firstError})` : ''}`)
            } catch (tableErr: any) {
              console.warn(`[OPFS Migration] Tabelle ${table} übersprungen:`, tableErr.message)
            }
          }

          db.close()

          const totalRows = Object.values(stats).reduce((s, n) => s + n, 0)
          console.log(`[OPFS Migration] ✅ ${totalRows} Zeilen aus ${Object.keys(stats).length} Tabellen migriert`)

          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ success: true, stats, totalRows }))
        } catch (err: any) {
          console.error('[OPFS Migration] Fehler:', err.message)
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: err.message }))
        }
      })

    },
  }
}

export default defineConfig({
  plugins: [
    react(),
    localApiProxy(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'sounds/**/*'],
      manifest: {
        name: 'Darts Engine',
        short_name: 'Darts',
        description: 'Local-first Darts game engine',
        theme_color: '#1a1a2e',
        background_color: '#1a1a2e',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          {
            src: 'icon.svg',
            sizes: '192x192 512x512',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'gstatic-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
      },
    }),
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom'],
        },
      },
    },
  },
  server: {
    watch: {
      usePolling: true,
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test.setup.ts',
    exclude: ['e2e/**', 'node_modules/**', 'darts-backend/**'],
  }
})