/**
 * Setup-Script: Erstellt das Postgres-Schema auf Neon
 * Usage: npx tsx scripts/setup-postgres.ts
 */
import { neon } from '@neondatabase/serverless'
import * as dotenv from 'dotenv'

dotenv.config()

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL nicht gesetzt. Bitte .env prüfen.')
  process.exit(1)
}

const sql = neon(DATABASE_URL)

// Postgres-Schema (converted from SQLite)
const SCHEMA_STATEMENTS = [
  // Core
  `CREATE TABLE IF NOT EXISTS profiles (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    color TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS system_meta (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at TEXT
  )`,

  // X01
  `CREATE TABLE IF NOT EXISTS x01_matches (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    match_name TEXT,
    notes TEXT,
    created_at TEXT NOT NULL,
    finished INTEGER DEFAULT 0,
    finished_at TEXT,
    mode TEXT NOT NULL,
    starting_score INTEGER,
    structure_kind TEXT,
    best_of_legs INTEGER,
    legs_per_set INTEGER,
    best_of_sets INTEGER,
    in_rule TEXT,
    out_rule TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS x01_match_players (
    match_id TEXT NOT NULL REFERENCES x01_matches(id),
    player_id TEXT NOT NULL REFERENCES profiles(id),
    position INTEGER NOT NULL,
    is_guest INTEGER DEFAULT 0,
    PRIMARY KEY (match_id, player_id)
  )`,
  `CREATE TABLE IF NOT EXISTS x01_events (
    id TEXT PRIMARY KEY,
    match_id TEXT NOT NULL REFERENCES x01_matches(id),
    type TEXT NOT NULL,
    ts TEXT NOT NULL,
    seq INTEGER NOT NULL,
    data TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_x01_events_match ON x01_events(match_id, seq)`,
  `CREATE TABLE IF NOT EXISTS x01_player_stats (
    player_id TEXT PRIMARY KEY REFERENCES profiles(id),
    matches_played INTEGER DEFAULT 0,
    matches_won INTEGER DEFAULT 0,
    legs_won INTEGER DEFAULT 0,
    sets_won INTEGER DEFAULT 0,
    darts_thrown INTEGER DEFAULT 0,
    points_scored INTEGER DEFAULT 0,
    three_dart_avg REAL DEFAULT 0,
    first9_avg REAL DEFAULT 0,
    highest_checkout INTEGER DEFAULT 0,
    double_attempts INTEGER DEFAULT 0,
    doubles_hit INTEGER DEFAULT 0,
    double_pct REAL DEFAULT 0,
    tons_100 INTEGER DEFAULT 0,
    tons_140 INTEGER DEFAULT 0,
    tons_180 INTEGER DEFAULT 0,
    updated_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS x01_finishing_doubles (
    player_id TEXT NOT NULL REFERENCES profiles(id),
    double_field TEXT NOT NULL,
    count INTEGER DEFAULT 0,
    PRIMARY KEY (player_id, double_field)
  )`,
  `CREATE TABLE IF NOT EXISTS x01_leaderboards (
    id SERIAL PRIMARY KEY,
    category TEXT NOT NULL,
    player_id TEXT REFERENCES profiles(id),
    player_name TEXT,
    match_id TEXT REFERENCES x01_matches(id),
    value INTEGER,
    value_real REAL,
    ts TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_x01_lb_category ON x01_leaderboards(category, value DESC)`,

  // Cricket
  `CREATE TABLE IF NOT EXISTS cricket_matches (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    match_name TEXT,
    notes TEXT,
    created_at TEXT NOT NULL,
    finished INTEGER DEFAULT 0,
    finished_at TEXT,
    range TEXT NOT NULL,
    style TEXT NOT NULL,
    best_of_games INTEGER,
    crazy_mode TEXT,
    crazy_scoring_mode TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS cricket_match_players (
    match_id TEXT NOT NULL REFERENCES cricket_matches(id),
    player_id TEXT NOT NULL REFERENCES profiles(id),
    position INTEGER NOT NULL,
    is_guest INTEGER DEFAULT 0,
    PRIMARY KEY (match_id, player_id)
  )`,
  `CREATE TABLE IF NOT EXISTS cricket_events (
    id TEXT PRIMARY KEY,
    match_id TEXT NOT NULL REFERENCES cricket_matches(id),
    type TEXT NOT NULL,
    ts TEXT NOT NULL,
    seq INTEGER NOT NULL,
    data TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_cricket_events_match ON cricket_events(match_id, seq)`,
  `CREATE TABLE IF NOT EXISTS cricket_leaderboards (
    id SERIAL PRIMARY KEY,
    category TEXT NOT NULL,
    player_id TEXT REFERENCES profiles(id),
    player_name TEXT,
    match_id TEXT REFERENCES cricket_matches(id),
    value INTEGER,
    value_real REAL,
    ts TEXT
  )`,

  // ATB
  `CREATE TABLE IF NOT EXISTS atb_matches (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    created_at TEXT NOT NULL,
    finished INTEGER DEFAULT 0,
    finished_at TEXT,
    duration_ms INTEGER,
    winner_id TEXT REFERENCES profiles(id),
    winner_darts INTEGER,
    mode TEXT NOT NULL,
    direction TEXT NOT NULL,
    structure_kind TEXT,
    best_of_legs INTEGER,
    legs_per_set INTEGER,
    best_of_sets INTEGER,
    sequence_mode TEXT,
    target_mode TEXT,
    multiplier_mode TEXT,
    special_rule TEXT,
    generated_sequence TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS atb_match_players (
    match_id TEXT NOT NULL REFERENCES atb_matches(id),
    player_id TEXT NOT NULL REFERENCES profiles(id),
    position INTEGER NOT NULL,
    is_guest INTEGER DEFAULT 0,
    PRIMARY KEY (match_id, player_id)
  )`,
  `CREATE TABLE IF NOT EXISTS atb_events (
    id TEXT PRIMARY KEY,
    match_id TEXT NOT NULL REFERENCES atb_matches(id),
    type TEXT NOT NULL,
    ts TEXT NOT NULL,
    seq INTEGER NOT NULL,
    data TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_atb_events_match ON atb_events(match_id, seq)`,
  `CREATE TABLE IF NOT EXISTS atb_highscores (
    id TEXT PRIMARY KEY,
    player_id TEXT NOT NULL REFERENCES profiles(id),
    mode TEXT NOT NULL,
    direction TEXT NOT NULL,
    duration_ms INTEGER NOT NULL,
    darts INTEGER NOT NULL,
    date TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_atb_hs_player ON atb_highscores(player_id)`,

  // CTF
  `CREATE TABLE IF NOT EXISTS ctf_matches (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    created_at TEXT NOT NULL,
    finished INTEGER DEFAULT 0,
    finished_at TEXT,
    duration_ms INTEGER,
    winner_id TEXT REFERENCES profiles(id),
    winner_darts INTEGER,
    multiplier_mode TEXT,
    rotate_order INTEGER DEFAULT 1,
    bull_position TEXT,
    structure_kind TEXT,
    best_of_legs INTEGER,
    legs_per_set INTEGER,
    best_of_sets INTEGER,
    generated_sequence TEXT,
    capture_field_winners TEXT,
    capture_total_scores TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS ctf_match_players (
    match_id TEXT NOT NULL REFERENCES ctf_matches(id),
    player_id TEXT NOT NULL REFERENCES profiles(id),
    position INTEGER NOT NULL,
    is_guest INTEGER DEFAULT 0,
    PRIMARY KEY (match_id, player_id)
  )`,
  `CREATE TABLE IF NOT EXISTS ctf_events (
    id TEXT PRIMARY KEY,
    match_id TEXT NOT NULL REFERENCES ctf_matches(id),
    type TEXT NOT NULL,
    ts TEXT NOT NULL,
    seq INTEGER NOT NULL,
    data TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_ctf_events_match ON ctf_events(match_id, seq)`,

  // STR
  `CREATE TABLE IF NOT EXISTS str_matches (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    created_at TEXT NOT NULL,
    finished INTEGER DEFAULT 0,
    finished_at TEXT,
    duration_ms INTEGER,
    winner_id TEXT REFERENCES profiles(id),
    winner_darts INTEGER,
    mode TEXT NOT NULL,
    target_number INTEGER,
    number_order TEXT,
    turn_order TEXT,
    ring_mode TEXT,
    bull_mode TEXT,
    bull_position TEXT,
    structure_kind TEXT,
    best_of_legs INTEGER,
    legs_per_set INTEGER,
    best_of_sets INTEGER,
    generated_order TEXT,
    leg_wins TEXT,
    set_wins TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS str_match_players (
    match_id TEXT NOT NULL REFERENCES str_matches(id),
    player_id TEXT NOT NULL REFERENCES profiles(id),
    position INTEGER NOT NULL,
    is_guest INTEGER DEFAULT 0,
    PRIMARY KEY (match_id, player_id)
  )`,
  `CREATE TABLE IF NOT EXISTS str_events (
    id TEXT PRIMARY KEY,
    match_id TEXT NOT NULL REFERENCES str_matches(id),
    type TEXT NOT NULL,
    ts TEXT NOT NULL,
    seq INTEGER NOT NULL,
    data TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_str_events_match ON str_events(match_id, seq)`,

  // Highscore
  `CREATE TABLE IF NOT EXISTS highscore_matches (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    created_at TEXT NOT NULL,
    finished INTEGER DEFAULT 0,
    finished_at TEXT,
    duration_ms INTEGER,
    winner_id TEXT REFERENCES profiles(id),
    winner_darts INTEGER,
    target_score INTEGER NOT NULL,
    structure_kind TEXT,
    target_legs INTEGER,
    legs_per_set INTEGER,
    target_sets INTEGER,
    leg_wins TEXT,
    set_wins TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS highscore_match_players (
    match_id TEXT NOT NULL REFERENCES highscore_matches(id),
    player_id TEXT NOT NULL REFERENCES profiles(id),
    position INTEGER NOT NULL,
    is_guest INTEGER DEFAULT 0,
    PRIMARY KEY (match_id, player_id)
  )`,
  `CREATE TABLE IF NOT EXISTS highscore_events (
    id TEXT PRIMARY KEY,
    match_id TEXT NOT NULL REFERENCES highscore_matches(id),
    type TEXT NOT NULL,
    ts TEXT NOT NULL,
    seq INTEGER NOT NULL,
    data TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_highscore_events_match ON highscore_events(match_id, seq)`,

  // Shanghai
  `CREATE TABLE IF NOT EXISTS shanghai_matches (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    created_at TEXT NOT NULL,
    finished INTEGER DEFAULT 0,
    finished_at TEXT,
    duration_ms INTEGER,
    winner_id TEXT REFERENCES profiles(id),
    winner_darts INTEGER,
    structure_kind TEXT,
    best_of_legs INTEGER,
    legs_per_set INTEGER,
    best_of_sets INTEGER,
    final_scores TEXT,
    leg_wins TEXT,
    set_wins TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS shanghai_match_players (
    match_id TEXT NOT NULL REFERENCES shanghai_matches(id),
    player_id TEXT NOT NULL REFERENCES profiles(id),
    position INTEGER NOT NULL,
    is_guest INTEGER DEFAULT 0,
    PRIMARY KEY (match_id, player_id)
  )`,
  `CREATE TABLE IF NOT EXISTS shanghai_events (
    id TEXT PRIMARY KEY,
    match_id TEXT NOT NULL REFERENCES shanghai_matches(id),
    type TEXT NOT NULL,
    ts TEXT NOT NULL,
    seq INTEGER NOT NULL,
    data TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_shanghai_events_match ON shanghai_events(match_id, seq)`,

  // Killer
  `CREATE TABLE IF NOT EXISTS killer_matches (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    created_at TEXT NOT NULL,
    finished INTEGER DEFAULT 0,
    finished_at TEXT,
    duration_ms INTEGER,
    winner_id TEXT REFERENCES profiles(id),
    winner_darts INTEGER,
    hits_to_become_killer INTEGER DEFAULT 1,
    qualifying_ring TEXT DEFAULT 'DOUBLE',
    starting_lives INTEGER DEFAULT 3,
    friendly_fire INTEGER DEFAULT 1,
    self_heal INTEGER DEFAULT 0,
    no_negative_lives INTEGER DEFAULT 1,
    secret_numbers INTEGER DEFAULT 0,
    target_assignment TEXT DEFAULT 'auto',
    final_standings TEXT,
    structure_kind TEXT,
    best_of_legs INTEGER,
    legs_per_set INTEGER,
    best_of_sets INTEGER,
    leg_wins TEXT,
    set_wins TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS killer_match_players (
    match_id TEXT NOT NULL REFERENCES killer_matches(id),
    player_id TEXT NOT NULL REFERENCES profiles(id),
    position INTEGER NOT NULL,
    is_guest INTEGER DEFAULT 0,
    PRIMARY KEY (match_id, player_id)
  )`,
  `CREATE TABLE IF NOT EXISTS killer_events (
    id TEXT PRIMARY KEY,
    match_id TEXT NOT NULL REFERENCES killer_matches(id),
    type TEXT NOT NULL,
    ts TEXT NOT NULL,
    seq INTEGER NOT NULL,
    data TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_killer_events_match ON killer_events(match_id, seq)`,

  // Bob's 27
  `CREATE TABLE IF NOT EXISTS bobs27_matches (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    created_at TEXT NOT NULL,
    finished INTEGER DEFAULT 0,
    finished_at TEXT,
    duration_ms INTEGER,
    winner_id TEXT REFERENCES profiles(id),
    winner_darts INTEGER,
    start_score INTEGER DEFAULT 27,
    darts_per_target INTEGER DEFAULT 3,
    include_bull INTEGER DEFAULT 0,
    allow_negative INTEGER DEFAULT 0,
    final_scores TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS bobs27_match_players (
    match_id TEXT NOT NULL REFERENCES bobs27_matches(id),
    player_id TEXT NOT NULL REFERENCES profiles(id),
    position INTEGER NOT NULL,
    is_guest INTEGER DEFAULT 0,
    PRIMARY KEY (match_id, player_id)
  )`,
  `CREATE TABLE IF NOT EXISTS bobs27_events (
    id TEXT PRIMARY KEY,
    match_id TEXT NOT NULL REFERENCES bobs27_matches(id),
    type TEXT NOT NULL,
    ts TEXT NOT NULL,
    seq INTEGER NOT NULL,
    data TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_bobs27_events_match ON bobs27_events(match_id, seq)`,

  // Operation
  `CREATE TABLE IF NOT EXISTS operation_matches (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    created_at TEXT NOT NULL,
    finished INTEGER DEFAULT 0,
    finished_at TEXT,
    duration_ms INTEGER,
    winner_id TEXT REFERENCES profiles(id),
    winner_darts INTEGER,
    legs_count INTEGER NOT NULL DEFAULT 1,
    target_mode TEXT NOT NULL DEFAULT 'MANUAL_NUMBER',
    final_scores TEXT,
    leg_wins TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS operation_match_players (
    match_id TEXT NOT NULL REFERENCES operation_matches(id),
    player_id TEXT NOT NULL REFERENCES profiles(id),
    position INTEGER NOT NULL,
    is_guest INTEGER DEFAULT 0,
    PRIMARY KEY (match_id, player_id)
  )`,
  `CREATE TABLE IF NOT EXISTS operation_events (
    id TEXT PRIMARY KEY,
    match_id TEXT NOT NULL REFERENCES operation_matches(id),
    type TEXT NOT NULL,
    ts TEXT NOT NULL,
    seq INTEGER NOT NULL,
    data TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_operation_events_match ON operation_events(match_id, seq)`,

  // 121 Stats
  `CREATE TABLE IF NOT EXISTS stats_121 (
    player_id TEXT PRIMARY KEY REFERENCES profiles(id),
    total_legs INTEGER DEFAULT 0,
    legs_won INTEGER DEFAULT 0,
    checkout_attempts INTEGER DEFAULT 0,
    checkouts_made INTEGER DEFAULT 0,
    checkout_pct REAL DEFAULT 0,
    avg_darts_to_finish REAL DEFAULT 0,
    avg_darts_on_double REAL DEFAULT 0,
    total_darts INTEGER DEFAULT 0,
    best_double TEXT,
    preferred_double TEXT,
    skill_score INTEGER DEFAULT 0,
    total_busts INTEGER DEFAULT 0,
    bust_rate REAL DEFAULT 0,
    updated_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS stats_121_doubles (
    player_id TEXT NOT NULL REFERENCES profiles(id),
    double_field TEXT NOT NULL,
    attempts INTEGER DEFAULT 0,
    hits INTEGER DEFAULT 0,
    hit_rate REAL DEFAULT 0,
    PRIMARY KEY (player_id, double_field)
  )`,

  // Cricket Player Stats
  `CREATE TABLE IF NOT EXISTS cricket_player_stats (
    player_id TEXT PRIMARY KEY REFERENCES profiles(id),
    player_name TEXT,
    matches_played INTEGER DEFAULT 0,
    matches_won INTEGER DEFAULT 0,
    legs_won INTEGER DEFAULT 0,
    total_marks INTEGER DEFAULT 0,
    total_turns INTEGER DEFAULT 0,
    total_darts INTEGER DEFAULT 0,
    total_triples INTEGER DEFAULT 0,
    total_doubles INTEGER DEFAULT 0,
    total_bull_singles INTEGER DEFAULT 0,
    total_bull_doubles INTEGER DEFAULT 0,
    total_bull_attempts INTEGER DEFAULT 0,
    field_marks TEXT,
    no_score_turns INTEGER DEFAULT 0,
    best_turn_marks INTEGER DEFAULT 0,
    best_turn_points INTEGER DEFAULT 0,
    total_points_scored INTEGER DEFAULT 0,
    total_points_taken INTEGER DEFAULT 0,
    updated_at TEXT
  )`,

  // Outbox
  `CREATE TABLE IF NOT EXISTS outbox (
    id TEXT PRIMARY KEY,
    payload TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
]

async function main() {
  console.log('🚀 Erstelle Postgres-Schema auf Neon...\n')

  for (const stmt of SCHEMA_STATEMENTS) {
    const tableName = stmt.match(/(?:TABLE|INDEX)\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)/i)?.[1]
    try {
      await sql.query(stmt)
      console.log(`  ✅ ${tableName}`)
    } catch (err: any) {
      console.error(`  ❌ ${tableName}: ${err.message}`)
    }
  }

  // Set DB version
  const now = new Date().toISOString()
  await sql.query(
    `INSERT INTO system_meta (key, value, updated_at) VALUES ($1, $2, $3) ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = $3`,
    ['db_version', '10', now]
  )

  console.log('\n✅ Schema erfolgreich erstellt! DB Version: 10')
}

main().catch((err) => {
  console.error('❌ Fatal:', err)
  process.exit(1)
})
