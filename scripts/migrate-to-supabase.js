#!/usr/bin/env node
// scripts/migrate-to-supabase.js
// Migrates schema + data from Neon to Supabase
// Usage: NEON_URL=... SUPABASE_URL=... node scripts/migrate-to-supabase.js

const postgres = require('postgres')

const NEON_URL = process.env.NEON_URL || process.env.DATABASE_URL
const SUPABASE_URL = process.env.SUPABASE_URL

if (!NEON_URL || !SUPABASE_URL) {
  console.error('Usage: NEON_URL=... SUPABASE_URL=... node scripts/migrate-to-supabase.js')
  process.exit(1)
}

const neon = postgres(NEON_URL, { max: 1, idle_timeout: 10 })
const supa = postgres(SUPABASE_URL, { max: 1, idle_timeout: 10 })

const TABLES = [
  'system_meta',
  'profiles',
  'sessions',
  'error_logs',
  'x01_matches', 'x01_match_players', 'x01_events',
  'x01_player_stats', 'x01_finishing_doubles',
  'x01_leaderboards',
  'cricket_matches', 'cricket_match_players', 'cricket_events',
  'cricket_player_stats', 'cricket_leaderboards',
  'atb_matches', 'atb_match_players', 'atb_events', 'atb_highscores',
  'ctf_matches', 'ctf_match_players', 'ctf_events',
  'str_matches', 'str_match_players', 'str_events',
  'highscore_matches', 'highscore_match_players', 'highscore_events',
  'shanghai_matches', 'shanghai_match_players', 'shanghai_events',
  'killer_matches', 'killer_match_players', 'killer_events',
  'bobs27_matches', 'bobs27_match_players', 'bobs27_events',
  'operation_matches', 'operation_match_players', 'operation_events',
  'stats_121', 'stats_121_doubles',
]

async function run() {
  console.log('=== Neon → Supabase Migration ===')
  console.log()

  // Step 1: Get schema from Neon
  console.log('Step 1: Exporting schema from Neon...')
  const tables = await neon`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `
  console.log(`  Found ${tables.length} tables:`, tables.map(t => t.table_name).join(', '))

  // Step 2: Create tables in Supabase
  console.log('\nStep 2: Creating tables in Supabase...')
  for (const { table_name } of tables) {
    try {
      // Get CREATE TABLE statement
      const cols = await neon`
        SELECT column_name, data_type, is_nullable, column_default,
               character_maximum_length
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = ${table_name}
        ORDER BY ordinal_position
      `

      // Get primary key
      const pks = await neon`
        SELECT kcu.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
        WHERE tc.table_name = ${table_name} AND tc.constraint_type = 'PRIMARY KEY'
      `

      // Build CREATE TABLE
      const colDefs = cols.map(c => {
        let type = c.data_type === 'character varying' ? `VARCHAR(${c.character_maximum_length || 255})`
          : c.data_type === 'ARRAY' ? 'TEXT[]'
          : c.data_type.toUpperCase()
        if (c.column_default) type += ` DEFAULT ${c.column_default}`
        if (c.is_nullable === 'NO') type += ' NOT NULL'
        return `  ${c.column_name} ${type}`
      })

      if (pks.length > 0) {
        colDefs.push(`  PRIMARY KEY (${pks.map(p => p.column_name).join(', ')})`)
      }

      const createSQL = `CREATE TABLE IF NOT EXISTS ${table_name} (\n${colDefs.join(',\n')}\n)`
      await supa.unsafe(createSQL)
      console.log(`  ✓ ${table_name}`)
    } catch (e) {
      console.log(`  ✗ ${table_name}: ${e.message}`)
    }
  }

  // Step 3: Copy data
  console.log('\nStep 3: Copying data...')
  for (const table_name of TABLES) {
    try {
      // Check if table exists in both
      const srcRows = await neon`SELECT COUNT(*) as c FROM ${neon(table_name)}`
      const count = parseInt(srcRows[0].c)
      if (count === 0) {
        console.log(`  - ${table_name}: empty, skipping`)
        continue
      }

      // Fetch all rows
      const rows = await neon.unsafe(`SELECT * FROM ${table_name}`)

      if (rows.length === 0) continue

      // Clear target table first
      await supa.unsafe(`DELETE FROM ${table_name}`)

      // Insert in batches of 100
      const BATCH = 100
      for (let i = 0; i < rows.length; i += BATCH) {
        const batch = rows.slice(i, i + BATCH)
        const cols = Object.keys(batch[0])
        const values = batch.map(row => `(${cols.map(c => {
          const v = row[c]
          if (v === null) return 'NULL'
          if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE'
          if (typeof v === 'number') return String(v)
          if (typeof v === 'object') return `'${JSON.stringify(v).replace(/'/g, "''")}'`
          return `'${String(v).replace(/'/g, "''")}'`
        }).join(', ')})`).join(',\n')

        await supa.unsafe(`INSERT INTO ${table_name} (${cols.join(', ')}) VALUES ${values}`)
      }

      console.log(`  ✓ ${table_name}: ${rows.length} rows`)
    } catch (e) {
      console.log(`  ✗ ${table_name}: ${e.message}`)
    }
  }

  // Step 4: Verify
  console.log('\nStep 4: Verification...')
  for (const table_name of ['profiles', 'x01_matches', 'x01_events', 'sessions']) {
    try {
      const neonCount = await neon.unsafe(`SELECT COUNT(*) as c FROM ${table_name}`)
      const supaCount = await supa.unsafe(`SELECT COUNT(*) as c FROM ${table_name}`)
      const n = parseInt(neonCount[0].c)
      const s = parseInt(supaCount[0].c)
      const ok = n === s ? '✓' : '✗'
      console.log(`  ${ok} ${table_name}: Neon=${n}, Supabase=${s}`)
    } catch (e) {
      console.log(`  ? ${table_name}: ${e.message}`)
    }
  }

  console.log('\n=== Migration complete! ===')
  console.log('Next steps:')
  console.log('1. Update DATABASE_URL in Vercel to the Supabase connection string')
  console.log('2. Deploy to Vercel')
  console.log('3. Test the app')

  await neon.end()
  await supa.end()
}

run().catch(e => {
  console.error('Migration failed:', e)
  process.exit(1)
})
