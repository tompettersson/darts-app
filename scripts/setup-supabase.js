#!/usr/bin/env node
// scripts/setup-supabase.js
// Creates all tables in Supabase from scratch
// Usage: SUPABASE_URL=... node scripts/setup-supabase.js

const postgres = require('postgres')

const SUPABASE_URL = process.env.SUPABASE_URL
if (!SUPABASE_URL) {
  console.error('Usage: SUPABASE_URL=... node scripts/setup-supabase.js')
  process.exit(1)
}

const sql = postgres(SUPABASE_URL, { max: 1, idle_timeout: 10, connect_timeout: 15 })

// All CREATE TABLE statements for the darts app
const SCHEMA = [
  // Core
  `CREATE TABLE IF NOT EXISTS system_meta (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS profiles (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    color TEXT,
    password_hash TEXT,
    is_admin INTEGER DEFAULT 0,
    settings JSONB DEFAULT '{}',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS sessions (
    session_token TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    last_used_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS error_logs (
    id TEXT PRIMARY KEY,
    message TEXT,
    stack TEXT,
    source TEXT,
    user_agent TEXT,
    url TEXT,
    profile_id TEXT,
    created_at TEXT
  )`,

  // X01
  `CREATE TABLE IF NOT EXISTS x01_matches (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL DEFAULT '',
    match_name TEXT,
    notes TEXT,
    created_at TEXT NOT NULL,
    finished INTEGER DEFAULT 0,
    finished_at TEXT,
    mode TEXT NOT NULL DEFAULT '501-double-out',
    starting_score INTEGER NOT NULL DEFAULT 501,
    structure_kind TEXT NOT NULL DEFAULT 'legs',
    best_of_legs INTEGER,
    legs_per_set INTEGER,
    best_of_sets INTEGER,
    in_rule TEXT DEFAULT 'straight-in',
    out_rule TEXT DEFAULT 'double-out',
    duration_ms INTEGER
  )`,
  `CREATE TABLE IF NOT EXISTS x01_match_players (
    match_id TEXT NOT NULL,
    player_id TEXT NOT NULL,
    position INTEGER NOT NULL DEFAULT 0,
    is_guest INTEGER DEFAULT 0,
    PRIMARY KEY (match_id, player_id)
  )`,
  `CREATE TABLE IF NOT EXISTS x01_events (
    id TEXT PRIMARY KEY,
    match_id TEXT NOT NULL,
    type TEXT NOT NULL,
    ts TEXT,
    seq INTEGER NOT NULL DEFAULT 0,
    data JSONB
  )`,
  `CREATE TABLE IF NOT EXISTS x01_player_stats (
    player_id TEXT PRIMARY KEY,
    matches_played INTEGER DEFAULT 0,
    matches_won INTEGER DEFAULT 0,
    legs_played INTEGER DEFAULT 0,
    legs_won INTEGER DEFAULT 0,
    total_darts INTEGER DEFAULT 0,
    total_points INTEGER DEFAULT 0,
    total_visits INTEGER DEFAULT 0,
    highest_visit INTEGER DEFAULT 0,
    highest_checkout INTEGER DEFAULT 0,
    count_180 INTEGER DEFAULT 0,
    count_140_plus INTEGER DEFAULT 0,
    count_100_plus INTEGER DEFAULT 0,
    count_ton_plus INTEGER DEFAULT 0,
    checkout_attempts INTEGER DEFAULT 0,
    checkout_hits INTEGER DEFAULT 0,
    best_leg_darts INTEGER,
    worst_leg_darts INTEGER,
    nine_dart_finishes INTEGER DEFAULT 0,
    busts INTEGER DEFAULT 0,
    data JSONB DEFAULT '{}'
  )`,
  `CREATE TABLE IF NOT EXISTS x01_finishing_doubles (
    player_id TEXT NOT NULL,
    double_field TEXT NOT NULL,
    attempts INTEGER DEFAULT 0,
    hits INTEGER DEFAULT 0,
    PRIMARY KEY (player_id, double_field)
  )`,
  `CREATE TABLE IF NOT EXISTS x01_leaderboards (
    id TEXT PRIMARY KEY,
    category TEXT NOT NULL,
    player_id TEXT NOT NULL,
    value REAL NOT NULL DEFAULT 0,
    match_id TEXT,
    created_at TEXT
  )`,

  // Cricket
  `CREATE TABLE IF NOT EXISTS cricket_matches (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL DEFAULT '',
    match_name TEXT,
    notes TEXT,
    created_at TEXT NOT NULL,
    finished INTEGER DEFAULT 0,
    finished_at TEXT,
    range TEXT DEFAULT 'short',
    style TEXT DEFAULT 'standard',
    crazy_mode TEXT,
    target_wins INTEGER,
    duration_ms INTEGER
  )`,
  `CREATE TABLE IF NOT EXISTS cricket_match_players (
    match_id TEXT NOT NULL,
    player_id TEXT NOT NULL,
    position INTEGER NOT NULL DEFAULT 0,
    is_guest INTEGER DEFAULT 0,
    PRIMARY KEY (match_id, player_id)
  )`,
  `CREATE TABLE IF NOT EXISTS cricket_events (
    id TEXT PRIMARY KEY,
    match_id TEXT NOT NULL,
    type TEXT NOT NULL,
    ts TEXT,
    seq INTEGER NOT NULL DEFAULT 0,
    data JSONB
  )`,
  `CREATE TABLE IF NOT EXISTS cricket_player_stats (
    player_id TEXT PRIMARY KEY,
    data JSONB DEFAULT '{}'
  )`,
  `CREATE TABLE IF NOT EXISTS cricket_leaderboards (
    id TEXT PRIMARY KEY,
    category TEXT NOT NULL,
    player_id TEXT NOT NULL,
    value REAL NOT NULL DEFAULT 0,
    match_id TEXT,
    created_at TEXT
  )`,

  // ATB (Around the Block)
  `CREATE TABLE IF NOT EXISTS atb_matches (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL DEFAULT '',
    match_name TEXT,
    notes TEXT,
    created_at TEXT NOT NULL,
    finished INTEGER DEFAULT 0,
    finished_at TEXT,
    winner_id TEXT,
    config JSONB,
    final_scores JSONB,
    duration_ms INTEGER
  )`,
  `CREATE TABLE IF NOT EXISTS atb_match_players (
    match_id TEXT NOT NULL,
    player_id TEXT NOT NULL,
    position INTEGER NOT NULL DEFAULT 0,
    is_guest INTEGER DEFAULT 0,
    PRIMARY KEY (match_id, player_id)
  )`,
  `CREATE TABLE IF NOT EXISTS atb_events (
    id TEXT PRIMARY KEY,
    match_id TEXT NOT NULL,
    type TEXT NOT NULL,
    ts TEXT,
    seq INTEGER NOT NULL DEFAULT 0,
    data JSONB
  )`,
  `CREATE TABLE IF NOT EXISTS atb_highscores (
    id TEXT PRIMARY KEY,
    player_id TEXT NOT NULL,
    mode TEXT,
    direction TEXT,
    darts INTEGER,
    time_ms INTEGER,
    created_at TEXT
  )`,

  // CTF (Capture the Field)
  `CREATE TABLE IF NOT EXISTS ctf_matches (
    id TEXT PRIMARY KEY, title TEXT NOT NULL DEFAULT '', match_name TEXT, notes TEXT,
    created_at TEXT NOT NULL, finished INTEGER DEFAULT 0, finished_at TEXT,
    winner_id TEXT, config JSONB, final_scores JSONB, duration_ms INTEGER
  )`,
  `CREATE TABLE IF NOT EXISTS ctf_match_players (
    match_id TEXT NOT NULL, player_id TEXT NOT NULL, position INTEGER NOT NULL DEFAULT 0, is_guest INTEGER DEFAULT 0,
    PRIMARY KEY (match_id, player_id)
  )`,
  `CREATE TABLE IF NOT EXISTS ctf_events (
    id TEXT PRIMARY KEY, match_id TEXT NOT NULL, type TEXT NOT NULL, ts TEXT, seq INTEGER NOT NULL DEFAULT 0, data JSONB
  )`,

  // Sträußchen
  `CREATE TABLE IF NOT EXISTS str_matches (
    id TEXT PRIMARY KEY, title TEXT NOT NULL DEFAULT '', match_name TEXT, notes TEXT,
    created_at TEXT NOT NULL, finished INTEGER DEFAULT 0, finished_at TEXT,
    winner_id TEXT, config JSONB, final_scores JSONB, duration_ms INTEGER
  )`,
  `CREATE TABLE IF NOT EXISTS str_match_players (
    match_id TEXT NOT NULL, player_id TEXT NOT NULL, position INTEGER NOT NULL DEFAULT 0, is_guest INTEGER DEFAULT 0,
    PRIMARY KEY (match_id, player_id)
  )`,
  `CREATE TABLE IF NOT EXISTS str_events (
    id TEXT PRIMARY KEY, match_id TEXT NOT NULL, type TEXT NOT NULL, ts TEXT, seq INTEGER NOT NULL DEFAULT 0, data JSONB
  )`,

  // Highscore
  `CREATE TABLE IF NOT EXISTS highscore_matches (
    id TEXT PRIMARY KEY, title TEXT NOT NULL DEFAULT '', match_name TEXT, notes TEXT,
    created_at TEXT NOT NULL, finished INTEGER DEFAULT 0, finished_at TEXT,
    winner_id TEXT, config JSONB, final_scores JSONB, duration_ms INTEGER
  )`,
  `CREATE TABLE IF NOT EXISTS highscore_match_players (
    match_id TEXT NOT NULL, player_id TEXT NOT NULL, position INTEGER NOT NULL DEFAULT 0, is_guest INTEGER DEFAULT 0,
    PRIMARY KEY (match_id, player_id)
  )`,
  `CREATE TABLE IF NOT EXISTS highscore_events (
    id TEXT PRIMARY KEY, match_id TEXT NOT NULL, type TEXT NOT NULL, ts TEXT, seq INTEGER NOT NULL DEFAULT 0, data JSONB
  )`,

  // Shanghai
  `CREATE TABLE IF NOT EXISTS shanghai_matches (
    id TEXT PRIMARY KEY, title TEXT NOT NULL DEFAULT '', match_name TEXT, notes TEXT,
    created_at TEXT NOT NULL, finished INTEGER DEFAULT 0, finished_at TEXT,
    winner_id TEXT, config JSONB, final_scores JSONB, final_standings JSONB, duration_ms INTEGER
  )`,
  `CREATE TABLE IF NOT EXISTS shanghai_match_players (
    match_id TEXT NOT NULL, player_id TEXT NOT NULL, position INTEGER NOT NULL DEFAULT 0, is_guest INTEGER DEFAULT 0,
    PRIMARY KEY (match_id, player_id)
  )`,
  `CREATE TABLE IF NOT EXISTS shanghai_events (
    id TEXT PRIMARY KEY, match_id TEXT NOT NULL, type TEXT NOT NULL, ts TEXT, seq INTEGER NOT NULL DEFAULT 0, data JSONB
  )`,

  // Killer
  `CREATE TABLE IF NOT EXISTS killer_matches (
    id TEXT PRIMARY KEY, title TEXT NOT NULL DEFAULT '', match_name TEXT, notes TEXT,
    created_at TEXT NOT NULL, finished INTEGER DEFAULT 0, finished_at TEXT,
    winner_id TEXT, config JSONB, final_scores JSONB, final_standings JSONB, duration_ms INTEGER
  )`,
  `CREATE TABLE IF NOT EXISTS killer_match_players (
    match_id TEXT NOT NULL, player_id TEXT NOT NULL, position INTEGER NOT NULL DEFAULT 0, is_guest INTEGER DEFAULT 0,
    PRIMARY KEY (match_id, player_id)
  )`,
  `CREATE TABLE IF NOT EXISTS killer_events (
    id TEXT PRIMARY KEY, match_id TEXT NOT NULL, type TEXT NOT NULL, ts TEXT, seq INTEGER NOT NULL DEFAULT 0, data JSONB
  )`,

  // Bob's 27
  `CREATE TABLE IF NOT EXISTS bobs27_matches (
    id TEXT PRIMARY KEY, title TEXT NOT NULL DEFAULT '', match_name TEXT, notes TEXT,
    created_at TEXT NOT NULL, finished INTEGER DEFAULT 0, finished_at TEXT,
    winner_id TEXT, config JSONB, final_scores JSONB, include_bull INTEGER DEFAULT 0, duration_ms INTEGER
  )`,
  `CREATE TABLE IF NOT EXISTS bobs27_match_players (
    match_id TEXT NOT NULL, player_id TEXT NOT NULL, position INTEGER NOT NULL DEFAULT 0, is_guest INTEGER DEFAULT 0,
    PRIMARY KEY (match_id, player_id)
  )`,
  `CREATE TABLE IF NOT EXISTS bobs27_events (
    id TEXT PRIMARY KEY, match_id TEXT NOT NULL, type TEXT NOT NULL, ts TEXT, seq INTEGER NOT NULL DEFAULT 0, data JSONB
  )`,

  // Operation
  `CREATE TABLE IF NOT EXISTS operation_matches (
    id TEXT PRIMARY KEY, title TEXT NOT NULL DEFAULT '', match_name TEXT, notes TEXT,
    created_at TEXT NOT NULL, finished INTEGER DEFAULT 0, finished_at TEXT,
    winner_id TEXT, config JSONB, final_scores JSONB, duration_ms INTEGER
  )`,
  `CREATE TABLE IF NOT EXISTS operation_match_players (
    match_id TEXT NOT NULL, player_id TEXT NOT NULL, position INTEGER NOT NULL DEFAULT 0, is_guest INTEGER DEFAULT 0,
    PRIMARY KEY (match_id, player_id)
  )`,
  `CREATE TABLE IF NOT EXISTS operation_events (
    id TEXT PRIMARY KEY, match_id TEXT NOT NULL, type TEXT NOT NULL, ts TEXT, seq INTEGER NOT NULL DEFAULT 0, data JSONB
  )`,

  // 121 Sprint Stats
  `CREATE TABLE IF NOT EXISTS stats_121 (
    player_id TEXT PRIMARY KEY,
    data JSONB DEFAULT '{}'
  )`,
  `CREATE TABLE IF NOT EXISTS stats_121_doubles (
    player_id TEXT NOT NULL,
    double_field TEXT NOT NULL,
    attempts INTEGER DEFAULT 0,
    hits INTEGER DEFAULT 0,
    PRIMARY KEY (player_id, double_field)
  )`,

  // Outbox (for future use)
  `CREATE TABLE IF NOT EXISTS outbox (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    payload JSONB,
    created_at TEXT,
    status TEXT DEFAULT 'pending'
  )`,

  // Set DB version
  `INSERT INTO system_meta (key, value) VALUES ('db_version', '11') ON CONFLICT (key) DO UPDATE SET value = '11'`,
]

async function run() {
  console.log('=== Supabase Schema Setup ===\n')

  let ok = 0, fail = 0
  for (const stmt of SCHEMA) {
    const name = stmt.match(/CREATE TABLE IF NOT EXISTS (\w+)/)?.[1]
      || stmt.match(/INSERT INTO (\w+)/)?.[1]
      || stmt.substring(0, 40)
    try {
      await sql.unsafe(stmt)
      console.log(`  ✓ ${name}`)
      ok++
    } catch (e) {
      console.log(`  ✗ ${name}: ${e.message}`)
      fail++
    }
  }

  console.log(`\n=== Done: ${ok} succeeded, ${fail} failed ===`)

  // Verify
  const tables = await sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`
  console.log(`\nTables in Supabase: ${tables.length}`)
  tables.forEach(t => console.log(`  - ${t.table_name}`))

  await sql.end()
}

run().catch(e => { console.error('Setup failed:', e.message); process.exit(1) })
