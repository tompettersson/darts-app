import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import type { Plugin } from 'vite'

/** Vite Plugin: Local API proxy for /api/db → Neon Postgres */
function localApiProxy(): Plugin {
  return {
    name: 'local-api-proxy',
    configureServer(server) {
      server.middlewares.use('/api/db', async (req, res) => {
        if (req.method === 'OPTIONS') {
          res.writeHead(200, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type' })
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
          const { neon } = await import('@neondatabase/serverless')
          const { config } = await import('dotenv')
          config()
          const sql = neon(process.env.DATABASE_URL!)

          const convertPlaceholders = (s: string) => { let i = 0; return s.replace(/\?/g, () => `$${++i}`) }

          const TABLE_PKS: Record<string, string[]> = {
            profiles: ['id'], system_meta: ['key'],
            x01_matches: ['id'], x01_match_players: ['match_id', 'player_id'], x01_player_stats: ['player_id'], x01_finishing_doubles: ['player_id', 'double_field'],
            cricket_matches: ['id'], cricket_match_players: ['match_id', 'player_id'], cricket_player_stats: ['player_id'],
            atb_matches: ['id'], atb_match_players: ['match_id', 'player_id'], atb_highscores: ['id'],
            ctf_matches: ['id'], ctf_match_players: ['match_id', 'player_id'],
            str_matches: ['id'], str_match_players: ['match_id', 'player_id'],
            highscore_matches: ['id'], highscore_match_players: ['match_id', 'player_id'],
            shanghai_matches: ['id'], shanghai_match_players: ['match_id', 'player_id'],
            killer_matches: ['id'], killer_match_players: ['match_id', 'player_id'],
            bobs27_matches: ['id'], bobs27_match_players: ['match_id', 'player_id'],
            operation_matches: ['id'], operation_match_players: ['match_id', 'player_id'],
            stats_121: ['player_id'], stats_121_doubles: ['player_id', 'double_field'],
            outbox: ['id'],
          }

          const convertSQL = (s: string) => {
            let r = s.trim()
            const ior = r.match(/INSERT\s+OR\s+REPLACE\s+INTO\s+(\w+)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/is)
            if (ior) {
              const [, table, colStr, vals] = ior
              const cols = colStr.split(',').map(c => c.trim())
              const pks = TABLE_PKS[table] || ['id']
              const updates = cols.filter(c => !pks.includes(c)).map(c => `${c} = EXCLUDED.${c}`).join(', ')
              r = `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${vals}) ON CONFLICT (${pks.join(', ')}) DO UPDATE SET ${updates}`
            }
            if (/INSERT\s+OR\s+IGNORE/i.test(r)) {
              const m = r.match(/INSERT\s+OR\s+IGNORE\s+INTO\s+(\w+)/is)
              const pks = m ? (TABLE_PKS[m[1]] || ['id']) : ['id']
              r = r.replace(/INSERT\s+OR\s+IGNORE/i, 'INSERT') + ` ON CONFLICT (${pks.join(', ')}) DO NOTHING`
            }
            r = convertPlaceholders(r)
            r = r.replace(/INTEGER\s+PRIMARY\s+KEY\s+AUTOINCREMENT/gi, 'SERIAL PRIMARY KEY')
            // SQLite functions → Postgres equivalents
            r = r.replace(/json_extract\((\w+(?:\.\w+)?),\s*'\$\.(\w+)'\)/g, '($1::jsonb->>\'$2\')')
            r = r.replace(/json_extract\((\w+(?:\.\w+)?),\s*\$(\d+)\)/g, '($1::jsonb->>($$$2))')
            r = r.replace(/json_each\((\w+(?:\.\w+)?),\s*'\$\.(\w+)'\)/g, 'jsonb_array_elements(($1)::jsonb->\'$2\')')
            r = r.replace(/json_each\((\w+(?:\.\w+)?)\)/g, 'jsonb_array_elements(($1)::jsonb)')
            r = r.replace(/strftime\('([^']+)',\s*([^)]+)\)/g, (_, fmt, expr) => {
              const pgFmt = fmt.replace('%Y', 'YYYY').replace('%m', 'MM').replace('%d', 'DD').replace('%H', 'HH24').replace('%M', 'MI').replace('%S', 'SS').replace('%W', 'IW')
              return `to_char((${expr.trim()})::timestamp, '${pgFmt}')`
            })
            r = r.replace(/\bdate\(([^,)]+),\s*'start of month'\)/g, 'date_trunc(\'month\', ($1)::date)')
            r = r.replace(/\bdate\(([^,)]+),\s*'([^']+)'\)/g, '(($1)::date + interval \'$2\')')
            r = r.replace(/\bdate\(([^)]+)\)/g, '($1)::date')
            r = r.replace(/\bround\(([^,]+),\s*(\d+)\)/g, 'round(($1)::numeric, $2)')
            r = r.replace(/\bIFNULL\(/gi, 'COALESCE(')
            r = r.replace(/\bGROUP_CONCAT\(([^)]+)\)/gi, 'string_agg(($1)::text, \',\')')
            return r
          }

          let data: unknown = null

          switch (body.type) {
            case 'query': {
              data = await sql.query(convertSQL(body.sql), body.params)
              break
            }
            case 'queryOne': {
              const rows = await sql.query(convertSQL(body.sql), body.params)
              data = rows[0] ?? null
              break
            }
            case 'exec': {
              await sql.query(convertSQL(body.sql), body.params)
              break
            }
            case 'execMany':
            case 'transaction': {
              for (const stmt of body.statements) {
                await sql.query(convertSQL(stmt.sql), stmt.params)
              }
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
          const { neon } = await import('@neondatabase/serverless')
          const { config } = await import('dotenv')
          config()
          const pgSql = neon(process.env.DATABASE_URL!)

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
                  await pgSql.query(`INSERT INTO ${table} (${cols.join(', ')}) VALUES (${placeholders.join(', ')})${conflict}`, values)
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