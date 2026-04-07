/**
 * Drizzle ORM Schema for Darts App
 * Maps to existing Neon Postgres tables (neon-darts / spring-glade-73187559)
 * 43 tables, generated from DB introspection on 2026-03-28
 */
import { pgTable, text, integer, real, serial, jsonb, primaryKey } from 'drizzle-orm/pg-core'

// ============================================================
// Core Tables
// ============================================================

export const profiles = pgTable('profiles', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  color: text('color'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  passwordHash: text('password_hash'),
  isAdmin: integer('is_admin').default(0),
  settings: jsonb('settings').default({}),
})

export const systemMeta = pgTable('system_meta', {
  key: text('key').primaryKey(),
  value: text('value'),
  updatedAt: text('updated_at'),
})

export const sessions = pgTable('sessions', {
  sessionToken: text('session_token').primaryKey(),
  profileId: text('profile_id').notNull(),
  createdAt: text('created_at').notNull(),
  expiresAt: text('expires_at').notNull(),
  lastUsedAt: text('last_used_at').notNull(),
})

export const outbox = pgTable('outbox', {
  id: text('id').primaryKey(),
  payload: text('payload').notNull(),
  createdAt: text('created_at').notNull(),
})

export const errorLogs = pgTable('error_logs', {
  id: text('id').primaryKey(),
  message: text('message'),
  stack: text('stack'),
  source: text('source'),
  userAgent: text('user_agent'),
  url: text('url'),
  profileId: text('profile_id'),
  createdAt: text('created_at'),
})

// ============================================================
// X01 Mode
// ============================================================

export const x01Matches = pgTable('x01_matches', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  matchName: text('match_name'),
  notes: text('notes'),
  createdAt: text('created_at').notNull(),
  finished: integer('finished').default(0),
  finishedAt: text('finished_at'),
  mode: text('mode').notNull(),
  startingScore: integer('starting_score'),
  structureKind: text('structure_kind'),
  bestOfLegs: integer('best_of_legs'),
  legsPerSet: integer('legs_per_set'),
  bestOfSets: integer('best_of_sets'),
  inRule: text('in_rule'),
  outRule: text('out_rule'),
})

export const x01MatchPlayers = pgTable('x01_match_players', {
  matchId: text('match_id').notNull(),
  playerId: text('player_id').notNull(),
  position: integer('position').notNull(),
  isGuest: integer('is_guest').default(0),
}, (t) => [primaryKey({ columns: [t.matchId, t.playerId] })])

export const x01Events = pgTable('x01_events', {
  id: text('id').primaryKey(),
  matchId: text('match_id').notNull(),
  type: text('type').notNull(),
  ts: text('ts').notNull(),
  seq: integer('seq').notNull(),
  data: text('data').notNull(),
})

export const x01PlayerStats = pgTable('x01_player_stats', {
  playerId: text('player_id').primaryKey(),
  matchesPlayed: integer('matches_played').default(0),
  matchesWon: integer('matches_won').default(0),
  legsWon: integer('legs_won').default(0),
  setsWon: integer('sets_won').default(0),
  dartsThrown: integer('darts_thrown').default(0),
  pointsScored: integer('points_scored').default(0),
  threeDartAvg: real('three_dart_avg').default(0),
  first9Avg: real('first9_avg').default(0),
  highestCheckout: integer('highest_checkout').default(0),
  doubleAttempts: integer('double_attempts').default(0),
  doublesHit: integer('doubles_hit').default(0),
  doublePct: real('double_pct').default(0),
  tons100: integer('tons_100').default(0),
  tons140: integer('tons_140').default(0),
  tons180: integer('tons_180').default(0),
  updatedAt: text('updated_at'),
})

export const x01FinishingDoubles = pgTable('x01_finishing_doubles', {
  playerId: text('player_id').notNull(),
  doubleField: text('double_field').notNull(),
  count: integer('count').default(0),
}, (t) => [primaryKey({ columns: [t.playerId, t.doubleField] })])

export const x01Leaderboards = pgTable('x01_leaderboards', {
  id: serial('id').primaryKey(),
  category: text('category').notNull(),
  playerId: text('player_id'),
  playerName: text('player_name'),
  matchId: text('match_id'),
  value: integer('value'),
  valueReal: real('value_real'),
  ts: text('ts'),
})

// ============================================================
// Cricket Mode
// ============================================================

export const cricketMatches = pgTable('cricket_matches', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  matchName: text('match_name'),
  notes: text('notes'),
  createdAt: text('created_at').notNull(),
  finished: integer('finished').default(0),
  finishedAt: text('finished_at'),
  range: text('range').notNull(),
  style: text('style').notNull(),
  bestOfGames: integer('best_of_games'),
  crazyMode: text('crazy_mode'),
  crazyScoringMode: text('crazy_scoring_mode'),
})

export const cricketMatchPlayers = pgTable('cricket_match_players', {
  matchId: text('match_id').notNull(),
  playerId: text('player_id').notNull(),
  position: integer('position').notNull(),
  isGuest: integer('is_guest').default(0),
}, (t) => [primaryKey({ columns: [t.matchId, t.playerId] })])

export const cricketEvents = pgTable('cricket_events', {
  id: text('id').primaryKey(),
  matchId: text('match_id').notNull(),
  type: text('type').notNull(),
  ts: text('ts').notNull(),
  seq: integer('seq').notNull(),
  data: text('data').notNull(),
})

export const cricketPlayerStats = pgTable('cricket_player_stats', {
  playerId: text('player_id').primaryKey(),
  playerName: text('player_name'),
  matchesPlayed: integer('matches_played').default(0),
  matchesWon: integer('matches_won').default(0),
  legsWon: integer('legs_won').default(0),
  totalMarks: integer('total_marks').default(0),
  totalTurns: integer('total_turns').default(0),
  totalDarts: integer('total_darts').default(0),
  totalTriples: integer('total_triples').default(0),
  totalDoubles: integer('total_doubles').default(0),
  totalBullSingles: integer('total_bull_singles').default(0),
  totalBullDoubles: integer('total_bull_doubles').default(0),
  totalBullAttempts: integer('total_bull_attempts').default(0),
  fieldMarks: text('field_marks'),
  noScoreTurns: integer('no_score_turns').default(0),
  bestTurnMarks: integer('best_turn_marks').default(0),
  bestTurnPoints: integer('best_turn_points').default(0),
  totalPointsScored: integer('total_points_scored').default(0),
  totalPointsTaken: integer('total_points_taken').default(0),
  updatedAt: text('updated_at'),
})

export const cricketLeaderboards = pgTable('cricket_leaderboards', {
  id: serial('id').primaryKey(),
  category: text('category').notNull(),
  playerId: text('player_id'),
  playerName: text('player_name'),
  matchId: text('match_id'),
  value: integer('value'),
  valueReal: real('value_real'),
  ts: text('ts'),
})

// ============================================================
// Helper: Generic match/players/events tables for minor game modes
// All share the same column structure
// ============================================================

// ATB (Around the Board)
export const atbMatches = pgTable('atb_matches', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  matchName: text('match_name'),
  notes: text('notes'),
  createdAt: text('created_at').notNull(),
  finished: integer('finished').default(0),
  finishedAt: text('finished_at'),
})
export const atbMatchPlayers = pgTable('atb_match_players', {
  matchId: text('match_id').notNull(),
  playerId: text('player_id').notNull(),
  position: integer('position').notNull(),
  isGuest: integer('is_guest').default(0),
}, (t) => [primaryKey({ columns: [t.matchId, t.playerId] })])
export const atbEvents = pgTable('atb_events', {
  id: text('id').primaryKey(),
  matchId: text('match_id').notNull(),
  type: text('type').notNull(),
  ts: text('ts').notNull(),
  seq: integer('seq').notNull(),
  data: text('data').notNull(),
})
export const atbHighscores = pgTable('atb_highscores', {
  id: text('id').primaryKey(),
})

// STR (Straight)
export const strMatches = pgTable('str_matches', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  matchName: text('match_name'),
  notes: text('notes'),
  createdAt: text('created_at').notNull(),
  finished: integer('finished').default(0),
  finishedAt: text('finished_at'),
})
export const strMatchPlayers = pgTable('str_match_players', {
  matchId: text('match_id').notNull(),
  playerId: text('player_id').notNull(),
  position: integer('position').notNull(),
  isGuest: integer('is_guest').default(0),
}, (t) => [primaryKey({ columns: [t.matchId, t.playerId] })])
export const strEvents = pgTable('str_events', {
  id: text('id').primaryKey(),
  matchId: text('match_id').notNull(),
  type: text('type').notNull(),
  ts: text('ts').notNull(),
  seq: integer('seq').notNull(),
  data: text('data').notNull(),
})

// CTF (Cut the Field)
export const ctfMatches = pgTable('ctf_matches', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  matchName: text('match_name'),
  notes: text('notes'),
  createdAt: text('created_at').notNull(),
  finished: integer('finished').default(0),
  finishedAt: text('finished_at'),
})
export const ctfMatchPlayers = pgTable('ctf_match_players', {
  matchId: text('match_id').notNull(),
  playerId: text('player_id').notNull(),
  position: integer('position').notNull(),
  isGuest: integer('is_guest').default(0),
}, (t) => [primaryKey({ columns: [t.matchId, t.playerId] })])
export const ctfEvents = pgTable('ctf_events', {
  id: text('id').primaryKey(),
  matchId: text('match_id').notNull(),
  type: text('type').notNull(),
  ts: text('ts').notNull(),
  seq: integer('seq').notNull(),
  data: text('data').notNull(),
})

// Highscore
export const highscoreMatches = pgTable('highscore_matches', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  matchName: text('match_name'),
  notes: text('notes'),
  createdAt: text('created_at').notNull(),
  finished: integer('finished').default(0),
  finishedAt: text('finished_at'),
})
export const highscoreMatchPlayers = pgTable('highscore_match_players', {
  matchId: text('match_id').notNull(),
  playerId: text('player_id').notNull(),
  position: integer('position').notNull(),
  isGuest: integer('is_guest').default(0),
}, (t) => [primaryKey({ columns: [t.matchId, t.playerId] })])
export const highscoreEvents = pgTable('highscore_events', {
  id: text('id').primaryKey(),
  matchId: text('match_id').notNull(),
  type: text('type').notNull(),
  ts: text('ts').notNull(),
  seq: integer('seq').notNull(),
  data: text('data').notNull(),
})

// Shanghai
export const shanghaiMatches = pgTable('shanghai_matches', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  matchName: text('match_name'),
  notes: text('notes'),
  createdAt: text('created_at').notNull(),
  finished: integer('finished').default(0),
  finishedAt: text('finished_at'),
})
export const shanghaiMatchPlayers = pgTable('shanghai_match_players', {
  matchId: text('match_id').notNull(),
  playerId: text('player_id').notNull(),
  position: integer('position').notNull(),
  isGuest: integer('is_guest').default(0),
}, (t) => [primaryKey({ columns: [t.matchId, t.playerId] })])
export const shanghaiEvents = pgTable('shanghai_events', {
  id: text('id').primaryKey(),
  matchId: text('match_id').notNull(),
  type: text('type').notNull(),
  ts: text('ts').notNull(),
  seq: integer('seq').notNull(),
  data: text('data').notNull(),
})

// Killer
export const killerMatches = pgTable('killer_matches', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  matchName: text('match_name'),
  notes: text('notes'),
  createdAt: text('created_at').notNull(),
  finished: integer('finished').default(0),
  finishedAt: text('finished_at'),
})
export const killerMatchPlayers = pgTable('killer_match_players', {
  matchId: text('match_id').notNull(),
  playerId: text('player_id').notNull(),
  position: integer('position').notNull(),
  isGuest: integer('is_guest').default(0),
}, (t) => [primaryKey({ columns: [t.matchId, t.playerId] })])
export const killerEvents = pgTable('killer_events', {
  id: text('id').primaryKey(),
  matchId: text('match_id').notNull(),
  type: text('type').notNull(),
  ts: text('ts').notNull(),
  seq: integer('seq').notNull(),
  data: text('data').notNull(),
})

// Bob's 27
export const bobs27Matches = pgTable('bobs27_matches', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  matchName: text('match_name'),
  notes: text('notes'),
  createdAt: text('created_at').notNull(),
  finished: integer('finished').default(0),
  finishedAt: text('finished_at'),
})
export const bobs27MatchPlayers = pgTable('bobs27_match_players', {
  matchId: text('match_id').notNull(),
  playerId: text('player_id').notNull(),
  position: integer('position').notNull(),
  isGuest: integer('is_guest').default(0),
}, (t) => [primaryKey({ columns: [t.matchId, t.playerId] })])
export const bobs27Events = pgTable('bobs27_events', {
  id: text('id').primaryKey(),
  matchId: text('match_id').notNull(),
  type: text('type').notNull(),
  ts: text('ts').notNull(),
  seq: integer('seq').notNull(),
  data: text('data').notNull(),
})

// Operation
export const operationMatches = pgTable('operation_matches', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  matchName: text('match_name'),
  notes: text('notes'),
  createdAt: text('created_at').notNull(),
  finished: integer('finished').default(0),
  finishedAt: text('finished_at'),
})
export const operationMatchPlayers = pgTable('operation_match_players', {
  matchId: text('match_id').notNull(),
  playerId: text('player_id').notNull(),
  position: integer('position').notNull(),
  isGuest: integer('is_guest').default(0),
}, (t) => [primaryKey({ columns: [t.matchId, t.playerId] })])
export const operationEvents = pgTable('operation_events', {
  id: text('id').primaryKey(),
  matchId: text('match_id').notNull(),
  type: text('type').notNull(),
  ts: text('ts').notNull(),
  seq: integer('seq').notNull(),
  data: text('data').notNull(),
})

// ============================================================
// 121 Stats
// ============================================================

export const stats121 = pgTable('stats_121', {
  playerId: text('player_id').primaryKey(),
  totalLegs: integer('total_legs').default(0),
  legsWon: integer('legs_won').default(0),
  checkoutAttempts: integer('checkout_attempts').default(0),
  checkoutsMade: integer('checkouts_made').default(0),
  checkoutPct: real('checkout_pct').default(0),
  avgDartsToFinish: real('avg_darts_to_finish').default(0),
  avgDartsOnDouble: real('avg_darts_on_double').default(0),
  totalDarts: integer('total_darts').default(0),
  bestDouble: text('best_double'),
  preferredDouble: text('preferred_double'),
  skillScore: integer('skill_score').default(0),
  totalBusts: integer('total_busts').default(0),
  bustRate: real('bust_rate').default(0),
  updatedAt: text('updated_at'),
})

export const stats121Doubles = pgTable('stats_121_doubles', {
  playerId: text('player_id').notNull(),
  doubleField: text('double_field').notNull(),
  attempts: integer('attempts').default(0),
  hits: integer('hits').default(0),
  hitRate: real('hit_rate').default(0),
}, (t) => [primaryKey({ columns: [t.playerId, t.doubleField] })])

// ============================================================================
// Active Games (open/unfinished matches for quick resume)
// ============================================================================

export const activeGames = pgTable('active_games', {
  id: text('id').primaryKey(),
  playerId: text('player_id').notNull(),
  gameType: text('game_type').notNull(),
  title: text('title').notNull(),
  config: jsonb('config'),
  players: jsonb('players'),
  startedAt: text('started_at').notNull(),
})
