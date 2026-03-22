const { neon } = require('@neondatabase/serverless')

// Neon SQL client — lazy init
let _sql = null
function getSQL() {
  if (!_sql) {
    const url = process.env.DATABASE_URL
    if (!url) throw new Error('DATABASE_URL environment variable is not set')
    _sql = neon(url)
  }
  return _sql
}

// SQL Conversion: SQLite → Postgres

function convertPlaceholders(sqlStr) {
  let index = 0
  return sqlStr.replace(/\?/g, () => `$${++index}`)
}

const TABLE_PKS = {
  profiles: ['id'], system_meta: ['key'],
  x01_matches: ['id'], x01_match_players: ['match_id', 'player_id'],
  x01_player_stats: ['player_id'], x01_finishing_doubles: ['player_id', 'double_field'],
  cricket_matches: ['id'], cricket_match_players: ['match_id', 'player_id'],
  cricket_player_stats: ['player_id'],
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

function convertInsertOrReplace(sqlStr) {
  const match = sqlStr.match(
    /INSERT\s+OR\s+REPLACE\s+INTO\s+(\w+)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/is
  )
  if (!match) return sqlStr
  const tableName = match[1]
  const columns = match[2].split(',').map(c => c.trim())
  const values = match[3]
  const pks = TABLE_PKS[tableName]
  if (!pks) return sqlStr.replace(/INSERT\s+OR\s+REPLACE/i, 'INSERT')
  const updateCols = columns.filter(c => !pks.includes(c))
  const updateSet = updateCols.map(c => `${c} = EXCLUDED.${c}`).join(', ')
  return `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${values}) ON CONFLICT (${pks.join(', ')}) DO UPDATE SET ${updateSet}`
}

function convertInsertOrIgnore(sqlStr) {
  const match = sqlStr.match(/INSERT\s+OR\s+IGNORE\s+INTO\s+(\w+)/is)
  if (!match) return sqlStr.replace(/INSERT\s+OR\s+IGNORE/i, 'INSERT')
  const tableName = match[1]
  const pks = TABLE_PKS[tableName]
  const base = sqlStr.replace(/INSERT\s+OR\s+IGNORE/i, 'INSERT')
  if (pks) return base + ` ON CONFLICT (${pks.join(', ')}) DO NOTHING`
  return base
}

function convertSQL(sqlStr) {
  let result = sqlStr.trim()
  if (/INSERT\s+OR\s+REPLACE/i.test(result)) result = convertInsertOrReplace(result)
  if (/INSERT\s+OR\s+IGNORE/i.test(result)) result = convertInsertOrIgnore(result)
  result = convertPlaceholders(result)
  result = result.replace(/INTEGER\s+PRIMARY\s+KEY\s+AUTOINCREMENT/gi, 'SERIAL PRIMARY KEY')
  return result
}

// Request Handler

module.exports = async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()

  if (req.method === 'GET') {
    try {
      const db = getSQL()
      const rows = await db.query('SELECT count(*) as count FROM profiles')
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
        const pgSQL = convertSQL(body.sql)
        const rows = await db.query(pgSQL, body.params)
        return res.json({ data: rows })
      }
      case 'queryOne': {
        const pgSQL = convertSQL(body.sql)
        const rows = await db.query(pgSQL, body.params)
        return res.json({ data: rows[0] ?? null })
      }
      case 'exec': {
        const pgSQL = convertSQL(body.sql)
        await db.query(pgSQL, body.params)
        return res.json({ data: null })
      }
      case 'execMany':
      case 'transaction': {
        for (const stmt of body.statements) {
          const pgSQL = convertSQL(stmt.sql)
          await db(pgSQL, stmt.params)
        }
        return res.json({ data: null })
      }
      case 'schema': {
        for (const stmt of body.statements) {
          await db.query(convertSQL(stmt))
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
