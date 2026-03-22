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