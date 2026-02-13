// src/db/schema.ts
// SQLite Schema für Darts 501 Engine

export const CURRENT_DB_VERSION = 1

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
  // 121
  SQL_CREATE_STATS_121,
  SQL_CREATE_STATS_121_DOUBLES,
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
]
