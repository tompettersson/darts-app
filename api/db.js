const postgres = require('postgres')

// PostgreSQL client — lazy init (works with Supabase, Neon, or any Postgres)
let _sql = null
function getSQL() {
  if (!_sql) {
    const url = process.env.DATABASE_URL
    if (!url) throw new Error('DATABASE_URL environment variable is not set')
    _sql = postgres(url, {
      max: 1,              // Single connection for serverless
      idle_timeout: 20,    // Close idle connections after 20s
      connect_timeout: 10, // 10s connection timeout
    })
  }
  return _sql
}

// Placeholder conversion: ? → $1, $2, ...
// All SQL queries are now native Postgres — no SQLite conversion needed.
function convertPlaceholders(sqlStr) {
  let index = 0
  return sqlStr.replace(/\?/g, () => `$${++index}`)
}

// Post-processing: Convert numeric strings to numbers in query results.
// Neon/pg returns bigint/numeric as strings (e.g. "35" instead of 35).
// This causes string concatenation bugs in JavaScript (e.g. "35"+"15" = "3515").
function coerceNumericValues(rows) {
  if (!Array.isArray(rows)) return rows
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue
    for (const key of Object.keys(row)) {
      const val = row[key]
      if (typeof val === 'string' && val !== '' && !isNaN(val) && !isNaN(parseFloat(val))) {
        // Don't convert UUIDs, dates, player IDs, hex strings, etc.
        // Only convert if it looks purely numeric (digits, optional sign, optional decimal)
        if (/^-?\d+(\.\d+)?$/.test(val)) {
          row[key] = Number(val)
        }
      }
    }
  }
  return rows
}

// Request Handler

// Simple API key guard — prevents unauthorized direct API access
const API_KEY = process.env.API_SECRET || 'darts-2024-local'

function checkApiKey(req) {
  return req.headers['x-api-key'] === API_KEY
}

module.exports = async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Api-Key, X-Session-Token')

  if (req.method === 'OPTIONS') return res.status(200).end()

  // API key check (skip for GET health check)
  if (req.method === 'POST' && !checkApiKey(req)) {
    return res.status(403).json({ error: 'Unauthorized' })
  }

  if (req.method === 'GET') {
    try {
      const db = getSQL()
      const rows = await db.unsafe('SELECT count(*) as count FROM profiles')
      return res.json({ status: 'ok', profiles: rows[0]?.count })
    } catch (e) {
      return res.status(500).json({ status: 'error', message: e.message })
    }
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const body = req.body
    const db = getSQL()

    switch (body.type) {
      case 'query': {
        const pgSQL = convertPlaceholders(body.sql)
        const rows = await db.unsafe(pgSQL, body.params)
        return res.json({ data: coerceNumericValues(rows) })
      }
      case 'queryOne': {
        const pgSQL = convertPlaceholders(body.sql)
        const rows = await db.unsafe(pgSQL, body.params)
        const row = rows[0] ?? null
        if (row) coerceNumericValues([row])
        return res.json({ data: row })
      }
      case 'exec': {
        const pgSQL = convertPlaceholders(body.sql)
        await db.unsafe(pgSQL, body.params)
        return res.json({ data: null })
      }
      case 'execMany':
      case 'transaction': {
        await db`BEGIN`
        try {
          for (const stmt of body.statements) {
            const pgSQL = convertPlaceholders(stmt.sql)
            await db.unsafe(pgSQL, stmt.params)
          }
          await db`COMMIT`
        } catch (e) {
          await db`ROLLBACK`
          throw e
        }
        return res.json({ data: null })
      }
      case 'batch': {
        // Execute multiple queries in parallel, return all results
        const results = await Promise.all(
          body.queries.map(async (q) => {
            try {
              const pgSQL = convertPlaceholders(q.sql)
              const rows = await db.unsafe(pgSQL, q.params)
              coerceNumericValues(rows)
              return { data: q.mode === 'one' ? (rows[0] ?? null) : rows }
            } catch (e) {
              return { error: e.message }
            }
          })
        )
        return res.json({ data: results })
      }
      case 'schema': {
        for (const stmt of body.statements) {
          await db.unsafe(convertPlaceholders(stmt))
        }
        return res.json({ data: null })
      }
      default:
        return res.status(400).json({ error: 'Unknown request type' })
    }
  } catch (error) {
    console.error('[API/DB] Error:', error)
    return res.status(500).json({ error: error.message || 'Internal server error' })
  }
}
