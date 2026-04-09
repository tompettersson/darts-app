const postgres = require('postgres')

let _sql = null
function getSQL() {
  if (!_sql) {
    const url = process.env.DATABASE_URL
    if (!url) throw new Error('DATABASE_URL environment variable is not set')
    _sql = postgres(url, { max: 1, idle_timeout: 20, connect_timeout: 10 })
  }
  return _sql
}

const API_KEY = process.env.API_SECRET || 'darts-2024-local'

function convertPlaceholders(sqlStr) {
  let index = 0
  return sqlStr.replace(/\?/g, () => `$${++index}`)
}

function coerceNumericValues(rows) {
  if (!Array.isArray(rows)) return rows
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

/**
 * Server-side batch query executor for stats refresh.
 *
 * Receives pre-built queries from the client, executes them server-side
 * (1 HTTP call instead of 85+), and writes results to player_stats_cache.
 *
 * POST /api/refresh-stats
 * Body: {
 *   playerId: string,
 *   groups: [{ name: string, queries: [{ key: string, sql: string, params: any[], mode: 'one'|'all' }] }]
 * }
 */
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Api-Key')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.headers['x-api-key'] !== API_KEY) return res.status(403).json({ error: 'Unauthorized' })

  const { playerId, groups } = req.body || {}
  if (!playerId || !groups || !Array.isArray(groups)) {
    return res.status(400).json({ error: 'Missing playerId or groups' })
  }

  const db = getSQL()
  const results = {}

  try {
    for (const group of groups) {
      const groupData = {}

      // Execute all queries for this group in parallel
      const promises = group.queries.map(async (q) => {
        try {
          const pgSQL = convertPlaceholders(q.sql)
          const rows = await db.unsafe(pgSQL, q.params || [])
          coerceNumericValues(rows)
          groupData[q.key] = q.mode === 'one' ? (rows[0] || null) : rows
        } catch (err) {
          groupData[q.key] = q.mode === 'one' ? null : []
        }
      })

      await Promise.all(promises)

      // Write to cache
      try {
        const cacheSQL = convertPlaceholders(
          `INSERT INTO player_stats_cache (player_id, stat_group, data, computed_at)
           VALUES (?, ?, ?::text::jsonb, ?)
           ON CONFLICT (player_id, stat_group) DO UPDATE
           SET data = EXCLUDED.data, computed_at = EXCLUDED.computed_at`
        )
        await db.unsafe(cacheSQL, [
          playerId, group.name, JSON.stringify(groupData), new Date().toISOString()
        ])
      } catch (err) {
        console.warn(`[refresh-stats] Cache write for ${group.name}:`, err.message)
      }

      results[group.name] = Object.keys(groupData).length
    }

    return res.json({ ok: true, playerId, groups: results })
  } catch (err) {
    console.error('[refresh-stats]', err)
    return res.status(500).json({ error: err.message })
  }
}
