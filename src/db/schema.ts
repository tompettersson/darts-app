// src/db/schema.ts
// SQLite Schema für Darts 501 Engine

export const CURRENT_DB_VERSION = 11

// ============================================================================
// Core Tables
// ============================================================================

export const SQL_CREATE_PROFILES = `
CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  color TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`

export const SQL_CREATE_SYSTEM_META = `
CREATE TABLE IF NOT EXISTS system_meta (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TEXT
);
`

// ============================================================================
// X01 Tables
// ============================================================================

export const SQL_CREATE_X01_MATCHES = `
CREATE TABLE IF NOT EXISTS x01_matches (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  match_name TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  finished INTEGER DEFAULT 0,
  finished_at TEXT,
  -- Konfiguration inline
  mode TEXT NOT NULL,
  starting_score INTEGER,
  structure_kind TEXT,
  best_of_legs INTEGER,
  legs_per_set INTEGER,
  best_of_sets INTEGER,
  in_rule TEXT,
  out_rule TEXT
);
`

export const SQL_CREATE_X01_MATCH_PLAYERS = `
CREATE TABLE IF NOT EXISTS x01_match_players (
  match_id TEXT NOT NULL,
  player_id TEXT NOT NULL,
  position INTEGER NOT NULL,
  is_guest INTEGER DEFAULT 0,
  PRIMARY KEY (match_id, player_id),
  FOREIGN KEY (match_id) REFERENCES x01_matches(id),
  FOREIGN KEY (player_id) REFERENCES profiles(id)
);
`

export const SQL_CREATE_X01_EVENTS = `
CREATE TABLE IF NOT EXISTS x01_events (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL,
  type TEXT NOT NULL,
  ts TEXT NOT NULL,
  seq INTEGER NOT NULL,
  data TEXT NOT NULL,
  FOREIGN KEY (match_id) REFERENCES x01_matches(id)
);
`

export const SQL_INDEX_X01_EVENTS = `
CREATE INDEX IF NOT EXISTS idx_x01_events_match ON x01_events(match_id, seq);
`

export const SQL_CREATE_X01_PLAYER_STATS = `
CREATE TABLE IF NOT EXISTS x01_player_stats (
  player_id TEXT PRIMARY KEY,
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
  updated_at TEXT,
  FOREIGN KEY (player_id) REFERENCES profiles(id)
);
`

export const SQL_CREATE_X01_FINISHING_DOUBLES = `
CREATE TABLE IF NOT EXISTS x01_finishing_doubles (
  player_id TEXT NOT NULL,
  double_field TEXT NOT NULL,
  count INTEGER DEFAULT 0,
  PRIMARY KEY (player_id, double_field),
  FOREIGN KEY (player_id) REFERENCES profiles(id)
);
`

export const SQL_CREATE_X01_LEADERBOARDS = `
CREATE TABLE IF NOT EXISTS x01_leaderboards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT NOT NULL,
  player_id TEXT,
  player_name TEXT,
  match_id TEXT,
  value INTEGER,
  value_real REAL,
  ts TEXT,
  FOREIGN KEY (player_id) REFERENCES profiles(id),
  FOREIGN KEY (match_id) REFERENCES x01_matches(id)
);
`

export const SQL_INDEX_X01_LEADERBOARDS = `
CREATE INDEX IF NOT EXISTS idx_x01_lb_category ON x01_leaderboards(category, value DESC);
`

// ============================================================================
// Cricket Tables
// ============================================================================

export const SQL_CREATE_CRICKET_MATCHES = `
CREATE TABLE IF NOT EXISTS cricket_matches (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  match_name TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  finished INTEGER DEFAULT 0,
  finished_at TEXT,
  -- Konfiguration inline
  range TEXT NOT NULL,
  style TEXT NOT NULL,
  best_of_games INTEGER,
  crazy_mode TEXT,
  crazy_scoring_mode TEXT
);
`

export const SQL_CREATE_CRICKET_MATCH_PLAYERS = `
CREATE TABLE IF NOT EXISTS cricket_match_players (
  match_id TEXT NOT NULL,
  player_id TEXT NOT NULL,
  position INTEGER NOT NULL,
  is_guest INTEGER DEFAULT 0,
  PRIMARY KEY (match_id, player_id),
  FOREIGN KEY (match_id) REFERENCES cricket_matches(id),
  FOREIGN KEY (player_id) REFERENCES profiles(id)
);
`

export const SQL_CREATE_CRICKET_EVENTS = `
CREATE TABLE IF NOT EXISTS cricket_events (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL,
  type TEXT NOT NULL,
  ts TEXT NOT NULL,
  seq INTEGER NOT NULL,
  data TEXT NOT NULL,
  FOREIGN KEY (match_id) REFERENCES cricket_matches(id)
);
`

export const SQL_INDEX_CRICKET_EVENTS = `
CREATE INDEX IF NOT EXISTS idx_cricket_events_match ON cricket_events(match_id, seq);
`

export const SQL_CREATE_CRICKET_LEADERBOARDS = `
CREATE TABLE IF NOT EXISTS cricket_leaderboards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT NOT NULL,
  player_id TEXT,
  player_name TEXT,
  match_id TEXT,
  value INTEGER,
  value_real REAL,
  ts TEXT,
  FOREIGN KEY (player_id) REFERENCES profiles(id),
  FOREIGN KEY (match_id) REFERENCES cricket_matches(id)
);
`

// ============================================================================
// ATB (Around The Block) Tables
// ============================================================================

export const SQL_CREATE_ATB_MATCHES = `
CREATE TABLE IF NOT EXISTS atb_matches (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  created_at TEXT NOT NULL,
  finished INTEGER DEFAULT 0,
  finished_at TEXT,
  duration_ms INTEGER,
  winner_id TEXT,
  winner_darts INTEGER,
  -- Konfiguration inline
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
  generated_sequence TEXT,
  FOREIGN KEY (winner_id) REFERENCES profiles(id)
);
`

export const SQL_CREATE_ATB_MATCH_PLAYERS = `
CREATE TABLE IF NOT EXISTS atb_match_players (
  match_id TEXT NOT NULL,
  player_id TEXT NOT NULL,
  position INTEGER NOT NULL,
  is_guest INTEGER DEFAULT 0,
  PRIMARY KEY (match_id, player_id),
  FOREIGN KEY (match_id) REFERENCES atb_matches(id),
  FOREIGN KEY (player_id) REFERENCES profiles(id)
);
`

export const SQL_CREATE_ATB_EVENTS = `
CREATE TABLE IF NOT EXISTS atb_events (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL,
  type TEXT NOT NULL,
  ts TEXT NOT NULL,
  seq INTEGER NOT NULL,
  data TEXT NOT NULL,
  FOREIGN KEY (match_id) REFERENCES atb_matches(id)
);
`

export const SQL_INDEX_ATB_EVENTS = `
CREATE INDEX IF NOT EXISTS idx_atb_events_match ON atb_events(match_id, seq);
`

export const SQL_CREATE_ATB_HIGHSCORES = `
CREATE TABLE IF NOT EXISTS atb_highscores (
  id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL,
  mode TEXT NOT NULL,
  direction TEXT NOT NULL,
  duration_ms INTEGER NOT NULL,
  darts INTEGER NOT NULL,
  date TEXT NOT NULL,
  FOREIGN KEY (player_id) REFERENCES profiles(id)
);
`

export const SQL_INDEX_ATB_HIGHSCORES = `
CREATE INDEX IF NOT EXISTS idx_atb_hs_player ON atb_highscores(player_id);
`

// ============================================================================
// CTF (Capture The Field) Tables
// ============================================================================

export const SQL_CREATE_CTF_MATCHES = `
CREATE TABLE IF NOT EXISTS ctf_matches (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  created_at TEXT NOT NULL,
  finished INTEGER DEFAULT 0,
  finished_at TEXT,
  duration_ms INTEGER,
  winner_id TEXT,
  winner_darts INTEGER,
  -- Konfiguration inline
  multiplier_mode TEXT,
  rotate_order INTEGER DEFAULT 1,
  bull_position TEXT,
  structure_kind TEXT,
  best_of_legs INTEGER,
  legs_per_set INTEGER,
  best_of_sets INTEGER,
  generated_sequence TEXT,
  capture_field_winners TEXT,
  capture_total_scores TEXT,
  FOREIGN KEY (winner_id) REFERENCES profiles(id)
);
`

export const SQL_CREATE_CTF_MATCH_PLAYERS = `
CREATE TABLE IF NOT EXISTS ctf_match_players (
  match_id TEXT NOT NULL,
  player_id TEXT NOT NULL,
  position INTEGER NOT NULL,
  is_guest INTEGER DEFAULT 0,
  PRIMARY KEY (match_id, player_id),
  FOREIGN KEY (match_id) REFERENCES ctf_matches(id),
  FOREIGN KEY (player_id) REFERENCES profiles(id)
);
`

export const SQL_CREATE_CTF_EVENTS = `
CREATE TABLE IF NOT EXISTS ctf_events (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL,
  type TEXT NOT NULL,
  ts TEXT NOT NULL,
  seq INTEGER NOT NULL,
  data TEXT NOT NULL,
  FOREIGN KEY (match_id) REFERENCES ctf_matches(id)
);
`

export const SQL_INDEX_CTF_EVENTS = `
CREATE INDEX IF NOT EXISTS idx_ctf_events_match ON ctf_events(match_id, seq);
`

// ============================================================================
// STR (Sträußchen) Tables
// ============================================================================

export const SQL_CREATE_STR_MATCHES = `
CREATE TABLE IF NOT EXISTS str_matches (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  created_at TEXT NOT NULL,
  finished INTEGER DEFAULT 0,
  finished_at TEXT,
  duration_ms INTEGER,
  winner_id TEXT,
  winner_darts INTEGER,
  -- Konfiguration inline
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
  set_wins TEXT,
  FOREIGN KEY (winner_id) REFERENCES profiles(id)
);
`

export const SQL_CREATE_STR_MATCH_PLAYERS = `
CREATE TABLE IF NOT EXISTS str_match_players (
  match_id TEXT NOT NULL,
  player_id TEXT NOT NULL,
  position INTEGER NOT NULL,
  is_guest INTEGER DEFAULT 0,
  PRIMARY KEY (match_id, player_id),
  FOREIGN KEY (match_id) REFERENCES str_matches(id),
  FOREIGN KEY (player_id) REFERENCES profiles(id)
);
`

export const SQL_CREATE_STR_EVENTS = `
CREATE TABLE IF NOT EXISTS str_events (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL,
  type TEXT NOT NULL,
  ts TEXT NOT NULL,
  seq INTEGER NOT NULL,
  data TEXT NOT NULL,
  FOREIGN KEY (match_id) REFERENCES str_matches(id)
);
`

export const SQL_INDEX_STR_EVENTS = `
CREATE INDEX IF NOT EXISTS idx_str_events_match ON str_events(match_id, seq);
`

// ============================================================================
// Highscore Tables
// ============================================================================

export const SQL_CREATE_HIGHSCORE_MATCHES = `
CREATE TABLE IF NOT EXISTS highscore_matches (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  created_at TEXT NOT NULL,
  finished INTEGER DEFAULT 0,
  finished_at TEXT,
  duration_ms INTEGER,
  winner_id TEXT,
  winner_darts INTEGER,
  -- Konfiguration inline
  target_score INTEGER NOT NULL,
  structure_kind TEXT,
  target_legs INTEGER,
  legs_per_set INTEGER,
  target_sets INTEGER,
  leg_wins TEXT,
  set_wins TEXT,
  FOREIGN KEY (winner_id) REFERENCES profiles(id)
);
`

export const SQL_CREATE_HIGHSCORE_MATCH_PLAYERS = `
CREATE TABLE IF NOT EXISTS highscore_match_players (
  match_id TEXT NOT NULL,
  player_id TEXT NOT NULL,
  position INTEGER NOT NULL,
  is_guest INTEGER DEFAULT 0,
  PRIMARY KEY (match_id, player_id),
  FOREIGN KEY (match_id) REFERENCES highscore_matches(id),
  FOREIGN KEY (player_id) REFERENCES profiles(id)
);
`

export const SQL_CREATE_HIGHSCORE_EVENTS = `
CREATE TABLE IF NOT EXISTS highscore_events (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL,
  type TEXT NOT NULL,
  ts TEXT NOT NULL,
  seq INTEGER NOT NULL,
  data TEXT NOT NULL,
  FOREIGN KEY (match_id) REFERENCES highscore_matches(id)
);
`

export const SQL_INDEX_HIGHSCORE_EVENTS = `
CREATE INDEX IF NOT EXISTS idx_highscore_events_match ON highscore_events(match_id, seq);
`

// ============================================================================
// Shanghai Tables
// ============================================================================

export const SQL_CREATE_SHANGHAI_MATCHES = `
CREATE TABLE IF NOT EXISTS shanghai_matches (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  created_at TEXT NOT NULL,
  finished INTEGER DEFAULT 0,
  finished_at TEXT,
  duration_ms INTEGER,
  winner_id TEXT,
  winner_darts INTEGER,
  -- Konfiguration inline
  structure_kind TEXT,
  best_of_legs INTEGER,
  legs_per_set INTEGER,
  best_of_sets INTEGER,
  final_scores TEXT,
  leg_wins TEXT,
  set_wins TEXT,
  FOREIGN KEY (winner_id) REFERENCES profiles(id)
);
`

export const SQL_CREATE_SHANGHAI_MATCH_PLAYERS = `
CREATE TABLE IF NOT EXISTS shanghai_match_players (
  match_id TEXT NOT NULL,
  player_id TEXT NOT NULL,
  position INTEGER NOT NULL,
  is_guest INTEGER DEFAULT 0,
  PRIMARY KEY (match_id, player_id),
  FOREIGN KEY (match_id) REFERENCES shanghai_matches(id),
  FOREIGN KEY (player_id) REFERENCES profiles(id)
);
`

export const SQL_CREATE_SHANGHAI_EVENTS = `
CREATE TABLE IF NOT EXISTS shanghai_events (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL,
  type TEXT NOT NULL,
  ts TEXT NOT NULL,
  seq INTEGER NOT NULL,
  data TEXT NOT NULL,
  FOREIGN KEY (match_id) REFERENCES shanghai_matches(id)
);
`

export const SQL_INDEX_SHANGHAI_EVENTS = `
CREATE INDEX IF NOT EXISTS idx_shanghai_events_match ON shanghai_events(match_id, seq);
`

// ============================================================================
// Killer Tables
// ============================================================================

export const SQL_CREATE_KILLER_MATCHES = `
CREATE TABLE IF NOT EXISTS killer_matches (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  created_at TEXT NOT NULL,
  finished INTEGER DEFAULT 0,
  finished_at TEXT,
  duration_ms INTEGER,
  winner_id TEXT,
  winner_darts INTEGER,
  -- Konfiguration inline
  hits_to_become_killer INTEGER DEFAULT 1,
  qualifying_ring TEXT DEFAULT 'DOUBLE',
  starting_lives INTEGER DEFAULT 3,
  friendly_fire INTEGER DEFAULT 1,
  self_heal INTEGER DEFAULT 0,
  no_negative_lives INTEGER DEFAULT 1,
  secret_numbers INTEGER DEFAULT 0,
  target_assignment TEXT DEFAULT 'auto',
  final_standings TEXT,
  -- Legs/Sets
  structure_kind TEXT,
  best_of_legs INTEGER,
  legs_per_set INTEGER,
  best_of_sets INTEGER,
  leg_wins TEXT,
  set_wins TEXT,
  FOREIGN KEY (winner_id) REFERENCES profiles(id)
);
`

export const SQL_CREATE_KILLER_MATCH_PLAYERS = `
CREATE TABLE IF NOT EXISTS killer_match_players (
  match_id TEXT NOT NULL,
  player_id TEXT NOT NULL,
  position INTEGER NOT NULL,
  is_guest INTEGER DEFAULT 0,
  PRIMARY KEY (match_id, player_id),
  FOREIGN KEY (match_id) REFERENCES killer_matches(id),
  FOREIGN KEY (player_id) REFERENCES profiles(id)
);
`

export const SQL_CREATE_KILLER_EVENTS = `
CREATE TABLE IF NOT EXISTS killer_events (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL,
  type TEXT NOT NULL,
  ts TEXT NOT NULL,
  seq INTEGER NOT NULL,
  data TEXT NOT NULL,
  FOREIGN KEY (match_id) REFERENCES killer_matches(id)
);
`

export const SQL_INDEX_KILLER_EVENTS = `
CREATE INDEX IF NOT EXISTS idx_killer_events_match ON killer_events(match_id, seq);
`

// ============================================================================
// Bob's 27 Tables
// ============================================================================

export const SQL_CREATE_BOBS27_MATCHES = `
CREATE TABLE IF NOT EXISTS bobs27_matches (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  created_at TEXT NOT NULL,
  finished INTEGER DEFAULT 0,
  finished_at TEXT,
  duration_ms INTEGER,
  winner_id TEXT,
  winner_darts INTEGER,
  -- Konfiguration inline
  start_score INTEGER DEFAULT 27,
  darts_per_target INTEGER DEFAULT 3,
  include_bull INTEGER DEFAULT 0,
  allow_negative INTEGER DEFAULT 0,
  final_scores TEXT,
  FOREIGN KEY (winner_id) REFERENCES profiles(id)
);
`

export const SQL_CREATE_BOBS27_MATCH_PLAYERS = `
CREATE TABLE IF NOT EXISTS bobs27_match_players (
  match_id TEXT NOT NULL,
  player_id TEXT NOT NULL,
  position INTEGER NOT NULL,
  is_guest INTEGER DEFAULT 0,
  PRIMARY KEY (match_id, player_id),
  FOREIGN KEY (match_id) REFERENCES bobs27_matches(id),
  FOREIGN KEY (player_id) REFERENCES profiles(id)
);
`

export const SQL_CREATE_BOBS27_EVENTS = `
CREATE TABLE IF NOT EXISTS bobs27_events (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL,
  type TEXT NOT NULL,
  ts TEXT NOT NULL,
  seq INTEGER NOT NULL,
  data TEXT NOT NULL,
  FOREIGN KEY (match_id) REFERENCES bobs27_matches(id)
);
`

export const SQL_INDEX_BOBS27_EVENTS = `
CREATE INDEX IF NOT EXISTS idx_bobs27_events_match ON bobs27_events(match_id, seq);
`

// ============================================================================
// Operation Tables
// ============================================================================

export const SQL_CREATE_OPERATION_MATCHES = `
CREATE TABLE IF NOT EXISTS operation_matches (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  created_at TEXT NOT NULL,
  finished INTEGER DEFAULT 0,
  finished_at TEXT,
  duration_ms INTEGER,
  winner_id TEXT,
  winner_darts INTEGER,
  -- Konfiguration inline
  legs_count INTEGER NOT NULL DEFAULT 1,
  target_mode TEXT NOT NULL DEFAULT 'MANUAL_NUMBER',
  final_scores TEXT,
  leg_wins TEXT,
  FOREIGN KEY (winner_id) REFERENCES profiles(id)
);
`

export const SQL_CREATE_OPERATION_MATCH_PLAYERS = `
CREATE TABLE IF NOT EXISTS operation_match_players (
  match_id TEXT NOT NULL,
  player_id TEXT NOT NULL,
  position INTEGER NOT NULL,
  is_guest INTEGER DEFAULT 0,
  PRIMARY KEY (match_id, player_id),
  FOREIGN KEY (match_id) REFERENCES operation_matches(id),
  FOREIGN KEY (player_id) REFERENCES profiles(id)
);
`

export const SQL_CREATE_OPERATION_EVENTS = `
CREATE TABLE IF NOT EXISTS operation_events (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL,
  type TEXT NOT NULL,
  ts TEXT NOT NULL,
  seq INTEGER NOT NULL,
  data TEXT NOT NULL,
  FOREIGN KEY (match_id) REFERENCES operation_matches(id)
);
`

export const SQL_INDEX_OPERATION_EVENTS = `
CREATE INDEX IF NOT EXISTS idx_operation_events_match ON operation_events(match_id, seq);
`

// ============================================================================
// 121-Mode Stats
// ============================================================================

export const SQL_CREATE_STATS_121 = `
CREATE TABLE IF NOT EXISTS stats_121 (
  player_id TEXT PRIMARY KEY,
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
  updated_at TEXT,
  FOREIGN KEY (player_id) REFERENCES profiles(id)
);
`

export const SQL_CREATE_STATS_121_DOUBLES = `
CREATE TABLE IF NOT EXISTS stats_121_doubles (
  player_id TEXT NOT NULL,
  double_field TEXT NOT NULL,
  attempts INTEGER DEFAULT 0,
  hits INTEGER DEFAULT 0,
  hit_rate REAL DEFAULT 0,
  PRIMARY KEY (player_id, double_field),
  FOREIGN KEY (player_id) REFERENCES profiles(id)
);
`

// ============================================================================
// Cricket Player Stats
// ============================================================================

export const SQL_CREATE_CRICKET_PLAYER_STATS = `
CREATE TABLE IF NOT EXISTS cricket_player_stats (
  player_id TEXT PRIMARY KEY,
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
  updated_at TEXT,
  FOREIGN KEY (player_id) REFERENCES profiles(id)
);
`

// ============================================================================
// Outbox
// ============================================================================

export const SQL_CREATE_OUTBOX = `
CREATE TABLE IF NOT EXISTS outbox (
  id TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL
);
`

// ============================================================================
// All Schema Statements in Order
// ============================================================================

export const ALL_SCHEMA_STATEMENTS: string[] = [
  // Core
  SQL_CREATE_PROFILES,
  SQL_CREATE_SYSTEM_META,
  // X01
  SQL_CREATE_X01_MATCHES,
  SQL_CREATE_X01_MATCH_PLAYERS,
  SQL_CREATE_X01_EVENTS,
  SQL_INDEX_X01_EVENTS,
  SQL_CREATE_X01_PLAYER_STATS,
  SQL_CREATE_X01_FINISHING_DOUBLES,
  SQL_CREATE_X01_LEADERBOARDS,
  SQL_INDEX_X01_LEADERBOARDS,
  // Cricket
  SQL_CREATE_CRICKET_MATCHES,
  SQL_CREATE_CRICKET_MATCH_PLAYERS,
  SQL_CREATE_CRICKET_EVENTS,
  SQL_INDEX_CRICKET_EVENTS,
  SQL_CREATE_CRICKET_LEADERBOARDS,
  // ATB
  SQL_CREATE_ATB_MATCHES,
  SQL_CREATE_ATB_MATCH_PLAYERS,
  SQL_CREATE_ATB_EVENTS,
  SQL_INDEX_ATB_EVENTS,
  SQL_CREATE_ATB_HIGHSCORES,
  SQL_INDEX_ATB_HIGHSCORES,
  // CTF
  SQL_CREATE_CTF_MATCHES,
  SQL_CREATE_CTF_MATCH_PLAYERS,
  SQL_CREATE_CTF_EVENTS,
  SQL_INDEX_CTF_EVENTS,
  // STR
  SQL_CREATE_STR_MATCHES,
  SQL_CREATE_STR_MATCH_PLAYERS,
  SQL_CREATE_STR_EVENTS,
  SQL_INDEX_STR_EVENTS,
  // Highscore
  SQL_CREATE_HIGHSCORE_MATCHES,
  SQL_CREATE_HIGHSCORE_MATCH_PLAYERS,
  SQL_CREATE_HIGHSCORE_EVENTS,
  SQL_INDEX_HIGHSCORE_EVENTS,
  // Shanghai
  SQL_CREATE_SHANGHAI_MATCHES,
  SQL_CREATE_SHANGHAI_MATCH_PLAYERS,
  SQL_CREATE_SHANGHAI_EVENTS,
  SQL_INDEX_SHANGHAI_EVENTS,
  // Killer
  SQL_CREATE_KILLER_MATCHES,
  SQL_CREATE_KILLER_MATCH_PLAYERS,
  SQL_CREATE_KILLER_EVENTS,
  SQL_INDEX_KILLER_EVENTS,
  // Bob's 27
  SQL_CREATE_BOBS27_MATCHES,
  SQL_CREATE_BOBS27_MATCH_PLAYERS,
  SQL_CREATE_BOBS27_EVENTS,
  SQL_INDEX_BOBS27_EVENTS,
  // Operation
  SQL_CREATE_OPERATION_MATCHES,
  SQL_CREATE_OPERATION_MATCH_PLAYERS,
  SQL_CREATE_OPERATION_EVENTS,
  SQL_INDEX_OPERATION_EVENTS,
  // 121
  SQL_CREATE_STATS_121,
  SQL_CREATE_STATS_121_DOUBLES,
  // Cricket Player Stats
  SQL_CREATE_CRICKET_PLAYER_STATS,
  // Outbox
  SQL_CREATE_OUTBOX,
]

// ============================================================================
// Migration Helper
// ============================================================================

export type Migration = {
  version: number
  name: string
  up: string[]
  down?: string[]
}

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: 'initial_schema',
    up: ALL_SCHEMA_STATEMENTS,
    down: [
      'DROP TABLE IF EXISTS stats_121_doubles',
      'DROP TABLE IF EXISTS stats_121',
      'DROP TABLE IF EXISTS ctf_events',
      'DROP TABLE IF EXISTS ctf_match_players',
      'DROP TABLE IF EXISTS ctf_matches',
      'DROP TABLE IF EXISTS atb_highscores',
      'DROP TABLE IF EXISTS atb_events',
      'DROP TABLE IF EXISTS atb_match_players',
      'DROP TABLE IF EXISTS atb_matches',
      'DROP TABLE IF EXISTS cricket_leaderboards',
      'DROP TABLE IF EXISTS cricket_events',
      'DROP TABLE IF EXISTS cricket_match_players',
      'DROP TABLE IF EXISTS cricket_matches',
      'DROP TABLE IF EXISTS x01_leaderboards',
      'DROP TABLE IF EXISTS x01_finishing_doubles',
      'DROP TABLE IF EXISTS x01_player_stats',
      'DROP TABLE IF EXISTS x01_events',
      'DROP TABLE IF EXISTS x01_match_players',
      'DROP TABLE IF EXISTS x01_matches',
      'DROP TABLE IF EXISTS system_meta',
      'DROP TABLE IF EXISTS profiles',
    ],
  },
  {
    version: 2,
    name: 'add_ctf_tables',
    up: [
      SQL_CREATE_CTF_MATCHES,
      SQL_CREATE_CTF_MATCH_PLAYERS,
      SQL_CREATE_CTF_EVENTS,
      SQL_INDEX_CTF_EVENTS,
    ],
    down: [
      'DROP TABLE IF EXISTS ctf_events',
      'DROP TABLE IF EXISTS ctf_match_players',
      'DROP TABLE IF EXISTS ctf_matches',
    ],
  },
  {
    version: 3,
    name: 'add_str_highscore_tables',
    up: [
      SQL_CREATE_STR_MATCHES,
      SQL_CREATE_STR_MATCH_PLAYERS,
      SQL_CREATE_STR_EVENTS,
      SQL_INDEX_STR_EVENTS,
      SQL_CREATE_HIGHSCORE_MATCHES,
      SQL_CREATE_HIGHSCORE_MATCH_PLAYERS,
      SQL_CREATE_HIGHSCORE_EVENTS,
      SQL_INDEX_HIGHSCORE_EVENTS,
    ],
    down: [
      'DROP TABLE IF EXISTS highscore_events',
      'DROP TABLE IF EXISTS highscore_match_players',
      'DROP TABLE IF EXISTS highscore_matches',
      'DROP TABLE IF EXISTS str_events',
      'DROP TABLE IF EXISTS str_match_players',
      'DROP TABLE IF EXISTS str_matches',
    ],
  },
  {
    version: 4,
    name: 'add_shanghai_tables',
    up: [
      SQL_CREATE_SHANGHAI_MATCHES,
      SQL_CREATE_SHANGHAI_MATCH_PLAYERS,
      SQL_CREATE_SHANGHAI_EVENTS,
      SQL_INDEX_SHANGHAI_EVENTS,
    ],
    down: [
      'DROP TABLE IF EXISTS shanghai_events',
      'DROP TABLE IF EXISTS shanghai_match_players',
      'DROP TABLE IF EXISTS shanghai_matches',
    ],
  },
  {
    version: 5,
    name: 'add_killer_tables',
    up: [
      SQL_CREATE_KILLER_MATCHES,
      SQL_CREATE_KILLER_MATCH_PLAYERS,
      SQL_CREATE_KILLER_EVENTS,
      SQL_INDEX_KILLER_EVENTS,
    ],
    down: [
      'DROP TABLE IF EXISTS killer_events',
      'DROP TABLE IF EXISTS killer_match_players',
      'DROP TABLE IF EXISTS killer_matches',
    ],
  },
  {
    version: 6,
    name: 'add_killer_legs_sets',
    up: [
      `ALTER TABLE killer_matches ADD COLUMN structure_kind TEXT`,
      `ALTER TABLE killer_matches ADD COLUMN best_of_legs INTEGER`,
      `ALTER TABLE killer_matches ADD COLUMN legs_per_set INTEGER`,
      `ALTER TABLE killer_matches ADD COLUMN best_of_sets INTEGER`,
      `ALTER TABLE killer_matches ADD COLUMN leg_wins TEXT`,
      `ALTER TABLE killer_matches ADD COLUMN set_wins TEXT`,
    ],
  },
  {
    version: 7,
    name: 'add_bobs27_tables',
    up: [
      SQL_CREATE_BOBS27_MATCHES,
      SQL_CREATE_BOBS27_MATCH_PLAYERS,
      SQL_CREATE_BOBS27_EVENTS,
      SQL_INDEX_BOBS27_EVENTS,
    ],
    down: [
      'DROP TABLE IF EXISTS bobs27_events',
      'DROP TABLE IF EXISTS bobs27_match_players',
      'DROP TABLE IF EXISTS bobs27_matches',
    ],
  },
  {
    version: 8,
    name: 'add_operation_tables',
    up: [
      SQL_CREATE_OPERATION_MATCHES,
      SQL_CREATE_OPERATION_MATCH_PLAYERS,
      SQL_CREATE_OPERATION_EVENTS,
      SQL_INDEX_OPERATION_EVENTS,
    ],
    down: [
      'DROP TABLE IF EXISTS operation_events',
      'DROP TABLE IF EXISTS operation_match_players',
      'DROP TABLE IF EXISTS operation_matches',
    ],
  },
  {
    version: 9,
    name: 'add_outbox_table',
    up: [
      SQL_CREATE_OUTBOX,
    ],
    down: [
      'DROP TABLE IF EXISTS outbox',
    ],
  },
  {
    version: 10,
    name: 'add_cricket_player_stats',
    up: [
      SQL_CREATE_CRICKET_PLAYER_STATS,
    ],
    down: [
      'DROP TABLE IF EXISTS cricket_player_stats',
    ],
  },
  {
    version: 11,
    name: 'add_auth_columns',
    up: [
      'ALTER TABLE profiles ADD COLUMN IF NOT EXISTS password_hash TEXT',
      'ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_admin INTEGER DEFAULT 0',
    ],
    down: [
      'ALTER TABLE profiles DROP COLUMN IF EXISTS password_hash',
      'ALTER TABLE profiles DROP COLUMN IF EXISTS is_admin',
    ],
  },
]
