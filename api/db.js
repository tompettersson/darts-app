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

function convertRoundCalls(sqlStr) {
  const pattern = /\bround\(/gi
  let result = ''
  let lastIndex = 0
  let match
  while ((match = pattern.exec(sqlStr)) !== null) {
    const start = match.index + match[0].length
    let depth = 1, lastComma = -1
    let i = start
    for (; i < sqlStr.length && depth > 0; i++) {
      if (sqlStr[i] === '(') depth++
      else if (sqlStr[i] === ')') depth--
      else if (sqlStr[i] === ',' && depth === 1) lastComma = i
    }
    if (lastComma === -1) {
      // single-arg round() — keep as-is
      result += sqlStr.slice(lastIndex, i)
    } else {
      const expr = sqlStr.slice(start, lastComma)
      const prec = sqlStr.slice(lastComma + 1, i - 1).trim()
      result += sqlStr.slice(lastIndex, match.index) + `round((${expr})::numeric, ${prec})`
    }
    lastIndex = i
  }
  result += sqlStr.slice(lastIndex)
  return result
}

function convertPlaceholders(sqlStr) {
  let index = 0
  return sqlStr.replace(/\?/g, () => `$${++index}`)
}

// Column reference pattern: optional table alias + column name (e.g. e.data, m.final_scores, d.value)
const COL = '\\w+(?:\\.\\w+)?'

function convertSQL(sqlStr) {
  let r = sqlStr.trim()

  // 1. INSERT OR REPLACE → ON CONFLICT DO UPDATE
  if (/INSERT\s+OR\s+REPLACE/i.test(r)) r = convertInsertOrReplace(r)

  // 2. INSERT OR IGNORE → ON CONFLICT DO NOTHING
  if (/INSERT\s+OR\s+IGNORE/i.test(r)) r = convertInsertOrIgnore(r)

  // 3. INTEGER PRIMARY KEY AUTOINCREMENT → SERIAL PRIMARY KEY
  r = r.replace(/INTEGER\s+PRIMARY\s+KEY\s+AUTOINCREMENT/gi, 'SERIAL PRIMARY KEY')

  // 4. e.rowid → e.seq
  r = r.replace(/\b(\w+)\.rowid\b/g, '$1.seq')

  // ============================================================
  // JSON functions — order matters! More specific patterns first.
  // ============================================================

  // 5a. CAST(json_extract(col, '$.' || expr) AS TYPE) → (col::jsonb->>(expr))::type
  //     Dynamic path with CAST — must come before other CAST+json_extract patterns
  //     Matches both '$.' || ? and '$.' || column_ref
  r = r.replace(
    new RegExp(`CAST\\(json_extract\\((${COL}),\\s*'\\$\\.'\\s*\\|\\|\\s*(\\?|${COL})\\)\\s+AS\\s+(\\w+)\\)`, 'gi'),
    (_, col, dynExpr, type) => {
      const pgType = type.toUpperCase() === 'REAL' ? 'real' : type.toUpperCase() === 'INTEGER' ? 'integer' : type.toLowerCase()
      return `(${col}::jsonb->>(${dynExpr}))::${pgType}`
    }
  )

  // 5b. CAST(json_extract(col, '$.path') AS TYPE) → (col::jsonb->>'path')::type
  r = r.replace(
    new RegExp(`CAST\\(json_extract\\((${COL}),\\s*'\\$\\.([^']+)'\\)\\s+AS\\s+(\\w+)\\)`, 'gi'),
    (_, col, path, type) => {
      const pgType = type.toUpperCase() === 'REAL' ? 'real' : type.toUpperCase() === 'INTEGER' ? 'integer' : type.toLowerCase()
      // Handle nested paths like 'aim.bed' → use -> for intermediate, ->> for last
      const parts = path.split('.')
      if (parts.length === 1) {
        return `(${col}::jsonb->>'${path}')::${pgType}`
      }
      // Nested: col::jsonb->'a'->'b'->>'c'
      const intermediate = parts.slice(0, -1).map(p => `->'${p}'`).join('')
      const last = parts[parts.length - 1]
      return `(${col}::jsonb${intermediate}->>'${last}')::${pgType}`
    }
  )

  // 5c. CAST(strftime(...) AS TYPE) — handle CAST wrapping strftime before strftime conversion
  //     This is handled naturally since we convert strftime below, but CAST around it stays valid.

  // 6. json_each(json_extract(col, '$.path')) alias → jsonb_array_elements((col::jsonb->'path')) alias
  r = r.replace(
    new RegExp(`json_each\\(json_extract\\((${COL}),\\s*'\\$\\.([^']+)'\\)\\)`, 'gi'),
    (_, col, path) => {
      const parts = path.split('.')
      const nav = parts.map(p => `->'${p}'`).join('')
      return `jsonb_array_elements((${col})::jsonb${nav})`
    }
  )

  // 7. json_each(col, '$.path') → jsonb_array_elements((col)::jsonb->'path')
  r = r.replace(
    new RegExp(`json_each\\((${COL}),\\s*'\\$\\.([^']+)'\\)`, 'gi'),
    (_, col, path) => {
      const parts = path.split('.')
      const nav = parts.map(p => `->'${p}'`).join('')
      return `jsonb_array_elements((${col})::jsonb${nav})`
    }
  )

  // 8. json_each(col) → jsonb_array_elements((col)::jsonb)
  r = r.replace(
    new RegExp(`json_each\\((${COL})\\)`, 'gi'),
    (_, col) => `jsonb_array_elements((${col})::jsonb)`
  )

  // 9. json_array_length(col, '$.path') → jsonb_array_length((col)::jsonb->'path')
  r = r.replace(
    new RegExp(`json_array_length\\((${COL}),\\s*'\\$\\.([^']+)'\\)`, 'gi'),
    (_, col, path) => {
      const parts = path.split('.')
      const nav = parts.map(p => `->'${p}'`).join('')
      return `jsonb_array_length((${col})::jsonb${nav})`
    }
  )

  // 10. json_array_length(col) → jsonb_array_length((col)::jsonb)
  r = r.replace(
    new RegExp(`json_array_length\\((${COL})\\)`, 'gi'),
    (_, col) => `jsonb_array_length((${col})::jsonb)`
  )

  // 11a. json_extract(col, '$.' || expr) → (col::jsonb->>(expr))
  //      Dynamic path without CAST (the CAST variant was handled above in step 5a)
  //      Matches both '$.' || ? and '$.' || column_ref
  r = r.replace(
    new RegExp(`json_extract\\((${COL}),\\s*'\\$\\.'\\s*\\|\\|\\s*(\\?|${COL})\\)`, 'gi'),
    (_, col, dynExpr) => `(${col}::jsonb->>(${dynExpr}))`
  )

  // 11b. json_extract(col, '$.path[#-1].key') → special array access
  //      e.g. json_extract(e.data, '$.darts[#-1].bed') → (e.data::jsonb->'darts'->>-1)::jsonb->>'bed'
  //      Postgres: col::jsonb->'darts'->-1->>'bed'
  r = r.replace(
    new RegExp(`json_extract\\((${COL}),\\s*'\\$\\.([^']*\\[#-1\\][^']*)'\\)`, 'gi'),
    (_, col, path) => {
      // Parse path like 'darts[#-1].bed'
      const match = path.match(/^(\w+)\[#-1\](?:\.(.+))?$/)
      if (!match) return `(${col}::jsonb->>'${path}')`
      const arrayField = match[1]
      const rest = match[2]
      if (rest) {
        // col::jsonb->'darts'->-1->>'bed'
        const parts = rest.split('.')
        const intermediate = parts.slice(0, -1).map(p => `->'${p}'`).join('')
        const last = parts[parts.length - 1]
        return `(${col}::jsonb->'${arrayField}'->-1${intermediate}->>'${last}')`
      }
      return `(${col}::jsonb->'${arrayField}'->-1)`
    }
  )

  // 11c. json_extract(col, '$.key.subkey') → nested path with ->> for last key
  //      e.g. json_extract(d.value, '$.aim.bed') → (d.value::jsonb->'aim'->>'bed')
  //      Must come before simple json_extract to handle multi-part paths
  r = r.replace(
    new RegExp(`json_extract\\((${COL}),\\s*'\\$\\.([^']+)'\\)`, 'gi'),
    (_, col, path) => {
      const parts = path.split('.')
      if (parts.length === 1) {
        return `(${col}::jsonb->>'${path}')`
      }
      const intermediate = parts.slice(0, -1).map(p => `->'${p}'`).join('')
      const last = parts[parts.length - 1]
      return `(${col}::jsonb${intermediate}->>'${last}')`
    }
  )

  // ============================================================
  // Date/time functions
  // ============================================================

  // 12. strftime('%fmt', expr) → to_char((expr)::timestamp, 'pgfmt')
  r = r.replace(/strftime\('([^']+)',\s*([^)]+)\)/g, (_, fmt, expr) => {
    const pgFmt = fmt
      .replace(/%Y/g, 'YYYY')
      .replace(/%m/g, 'MM')
      .replace(/%d/g, 'DD')
      .replace(/%H/g, 'HH24')
      .replace(/%M/g, 'MI')
      .replace(/%S/g, 'SS')
      .replace(/%w/g, 'D')
      .replace(/%W/g, 'IW')
    return `to_char((${expr.trim()})::timestamp, '${pgFmt}')`
  })

  // 13. date(expr, 'start of month') → date_trunc('month', (expr)::date)
  r = r.replace(/\bdate\(([^,)]+),\s*'start of month'\)/g, "date_trunc('month', ($1)::date)")

  // 14. date(expr, 'modifier') → ((expr)::date + interval 'modifier')
  r = r.replace(/\bdate\(([^,)]+),\s*'([^']+)'\)/g, "(($1)::date + interval '$2')")

  // 15. date(expr) → (expr)::date
  r = r.replace(/\bdate\(([^)]+)\)/g, '($1)::date')

  // ============================================================
  // Other function conversions
  // ============================================================

  // 16. round(expr, n) → round((expr)::numeric, n) — Postgres requires numeric for precision
  //     Use balanced-parentheses matching to handle nested function calls with commas
  r = convertRoundCalls(r)

  // 17. IFNULL(a, b) → COALESCE(a, b)
  r = r.replace(/\bIFNULL\(/gi, 'COALESCE(')

  // 18. GROUP_CONCAT(expr) → string_agg((expr)::text, ',')
  r = r.replace(/\bGROUP_CONCAT\(([^)]+)\)/gi, "string_agg(($1)::text, ',')")

  // ============================================================
  // Lateral join fix: ", jsonb_array_elements(...)" → "CROSS JOIN LATERAL jsonb_array_elements(...)"
  // In SQLite, ", json_each(e.col)" after JOINs works as implicit cross join.
  // In Postgres, set-returning functions referencing other FROM entries need LATERAL.
  // ============================================================
  r = r.replace(/,\s*jsonb_array_elements\(/g, ' CROSS JOIN LATERAL jsonb_array_elements(')

  // ============================================================
  // Post-conversion fixes for jsonb type mismatches
  // ============================================================

  // 20. IS NOT <number> → IS DISTINCT FROM '<number>' (null-safe comparison)
  r = r.replace(/\bIS\s+NOT\s+(\d+)\b/gi, "IS DISTINCT FROM '$1'")

  // 21. SUM((...::jsonb->>'key')) → SUM((...::jsonb->>'key')::numeric)
  //     When SUM/AVG wraps a jsonb extraction, cast to numeric
  r = r.replace(/\b(SUM|AVG)\((\([^)]*::jsonb->>(?:'[^']*'|\([^)]*\))\))\)/gi, '$1(($2)::numeric)')

  // 22. jsonb->>'key') = <integer> → compare as text: ->>'key') = '<integer>'
  //     Using text comparison avoids issues with boolean/null JSON values
  r = r.replace(/(->>(?:'[^']*'|\([^)]*\))\))\s*(=|!=|<>)\s*(\d+)\b/g, "$1 $2 '$3'")
  // For >, <, >=, <= we need numeric cast
  r = r.replace(/(->>(?:'[^']*'|\([^)]*\))\))\s*(>=|<=|>|<)\s*(\d+)\b/g, '$1::numeric $2 $3')

  // 23. (removed — now handled by convertRoundCalls in step 16)

  // ============================================================
  // Placeholder conversion — MUST be last
  // ============================================================

  // 24. ? → $1, $2, ... (must happen after all other conversions that reference ?)
  r = convertPlaceholders(r)

  return r
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
      case 'batch': {
        // Execute multiple queries in parallel, return all results
        const results = await Promise.all(
          body.queries.map(async (q) => {
            try {
              const pgSQL = convertSQL(q.sql)
              const rows = await db.query(pgSQL, q.params)
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
