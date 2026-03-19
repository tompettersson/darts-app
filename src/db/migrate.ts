// src/db/migrate.ts
// Migration von LocalStorage zu SQLite

import {
  initDB,
  exec,
  query,
  transaction,
  generateId,
  nowISO,
  toJSON,
  setMeta,
  getMeta,
} from './index'

// ============================================================================
// LocalStorage Keys (gespiegelt von storage.ts)
// ============================================================================

const LS_KEYS = {
  matches: 'darts.matches.v1',
  profiles: 'darts.profiles.v1',
  lastOpenMatchId: 'darts.lastOpenMatchId.v1',
  leaderboards: 'darts.leaderboards.v1',
  lastActivity: 'darts.lastActivity.v1',
  x01PlayerStats: 'x01.playerStats.v1',
  stats121: '121.playerStats.v1',
  cricketMatches: 'cricket.matches.v1',
  cricketLastOpenMatchId: 'cricket.lastOpenMatchId.v1',
  cricketLeaderboards: 'cricket.leaderboards.v1',
  atbMatches: 'atb.matches.v1',
  atbLastOpenMatchId: 'atb.lastOpenMatchId.v1',
  atbHighscores: 'atb.highscores.v1',
  ctfMatches: 'ctf.matches.v1',
  strMatches: 'str.matches.v1',
  highscoreMatches: 'highscore.matches.v1',
} as const

// ============================================================================
// Migration Status
// ============================================================================

export type MigrationStatus = {
  migrated: boolean
  migratedAt: string | null
  profiles: number
  x01Matches: number
  cricketMatches: number
  atbMatches: number
}

/**
 * Prüft ob bereits migriert wurde
 */
export async function isMigrated(): Promise<boolean> {
  const status = await getMeta('ls_migrated')
  return status === 'true'
}

/**
 * Gibt den Migrations-Status zurück
 */
export async function getMigrationStatus(): Promise<MigrationStatus> {
  const migrated = await isMigrated()
  const migratedAt = await getMeta('ls_migrated_at')

  const profiles = await query<{ count: number }>('SELECT COUNT(*) as count FROM profiles')
  const x01 = await query<{ count: number }>('SELECT COUNT(*) as count FROM x01_matches')
  const cricket = await query<{ count: number }>('SELECT COUNT(*) as count FROM cricket_matches')
  const atb = await query<{ count: number }>('SELECT COUNT(*) as count FROM atb_matches')

  return {
    migrated,
    migratedAt,
    profiles: profiles[0]?.count ?? 0,
    x01Matches: x01[0]?.count ?? 0,
    cricketMatches: cricket[0]?.count ?? 0,
    atbMatches: atb[0]?.count ?? 0,
  }
}

// ============================================================================
// LocalStorage Reader Helpers
// ============================================================================

function readLS<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

// ============================================================================
// Profile Migration
// ============================================================================

type LSProfile = {
  id: string
  name: string
  createdAt: string
  updatedAt: string
  color?: string
}

async function migrateProfiles(): Promise<number> {
  const profiles = readLS<LSProfile[]>(LS_KEYS.profiles, [])
  if (profiles.length === 0) return 0

  const statements = profiles.map((p) => ({
    sql: `INSERT OR REPLACE INTO profiles (id, name, color, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?)`,
    params: [p.id, p.name, p.color ?? null, p.createdAt, p.updatedAt],
  }))

  await transaction(statements)
  console.debug(`[Migration] ${profiles.length} Profiles migriert`)
  return profiles.length
}

// ============================================================================
// X01 Match Migration
// ============================================================================

type LSMatch = {
  id: string
  title: string
  matchName?: string
  notes?: string
  createdAt: string
  events: any[]
  playerIds: string[]
  finished?: boolean
}

async function migrateX01Matches(): Promise<number> {
  const matches = readLS<LSMatch[]>(LS_KEYS.matches, [])
  console.debug(`[Migration] Gefundene X01 Matches im LocalStorage: ${matches.length}`)
  if (matches.length === 0) return 0

  let migrated = 0
  const batchSize = 10

  for (let i = 0; i < matches.length; i += batchSize) {
    const batch = matches.slice(i, i + batchSize)
    console.debug(`[Migration] X01 Batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(matches.length / batchSize)} (${i + 1}-${Math.min(i + batchSize, matches.length)})`)

    for (const m of batch) {
      try {
        const startEvt = m.events?.find((e) => e.type === 'MatchStarted')
        const finishEvt = m.events?.find((e) => e.type === 'MatchFinished')

        // Alle Statements für dieses Match sammeln
        const statements: Array<{ sql: string; params: unknown[] }> = []

        // Match
        statements.push({
          sql: `INSERT OR REPLACE INTO x01_matches (
            id, title, match_name, notes, created_at, finished, finished_at,
            mode, starting_score, structure_kind, best_of_legs, legs_per_set, best_of_sets,
            in_rule, out_rule
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          params: [
            m.id,
            m.title ?? 'Unbenannt',
            m.matchName ?? null,
            m.notes ?? null,
            m.createdAt ?? nowISO(),
            m.finished ? 1 : 0,
            finishEvt?.ts ?? null,
            startEvt?.mode ?? '501-double-out',
            startEvt?.startingScorePerLeg ?? 501,
            startEvt?.structure?.kind ?? 'legs',
            startEvt?.structure?.bestOfLegs ?? null,
            startEvt?.structure?.legsPerSet ?? null,
            startEvt?.structure?.bestOfSets ?? null,
            startEvt?.inRule ?? 'straight-in',
            startEvt?.outRule ?? 'double-out',
          ],
        })

        // Spieler
        const players = startEvt?.players ?? []
        for (let pi = 0; pi < players.length; pi++) {
          const p = players[pi]
          statements.push({
            sql: `INSERT OR REPLACE INTO x01_match_players (match_id, player_id, position, is_guest)
                  VALUES (?, ?, ?, ?)`,
            params: [m.id, p.playerId, pi, p.isGuest ? 1 : 0],
          })
        }

        // Events
        const events = m.events ?? []
        for (let seq = 0; seq < events.length; seq++) {
          const ev = events[seq]
          statements.push({
            sql: `INSERT OR REPLACE INTO x01_events (id, match_id, type, ts, seq, data)
                  VALUES (?, ?, ?, ?, ?, ?)`,
            params: [ev.eventId ?? generateId(), m.id, ev.type, ev.ts, seq, toJSON(ev)],
          })
        }

        // Alle Statements in einer Transaction ausführen
        await transaction(statements)
        migrated++
      } catch (err) {
        console.error(`[Migration] Fehler bei X01 Match ${m.id}:`, err)
      }
    }
  }

  console.debug(`[Migration] ${migrated}/${matches.length} X01 Matches migriert`)
  return migrated
}

// ============================================================================
// Cricket Match Migration
// ============================================================================

type LSCricketMatch = {
  id: string
  title: string
  matchName?: string
  notes?: string
  createdAt: string
  events: any[]
  playerIds: string[]
  finished?: boolean
}

async function migrateCricketMatches(): Promise<number> {
  const matches = readLS<LSCricketMatch[]>(LS_KEYS.cricketMatches, [])
  console.debug(`[Migration] Gefundene Cricket Matches im LocalStorage: ${matches.length}`)
  if (matches.length === 0) return 0

  let migrated = 0
  const batchSize = 10

  for (let i = 0; i < matches.length; i += batchSize) {
    const batch = matches.slice(i, i + batchSize)
    console.debug(`[Migration] Cricket Batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(matches.length / batchSize)}`)

    for (const m of batch) {
      try {
        const startEvt = m.events?.find((e) => e.type === 'CricketMatchStarted')
        const finishEvt = m.events?.find((e) => e.type === 'CricketMatchFinished')

        const statements: Array<{ sql: string; params: unknown[] }> = []

        // Match
        statements.push({
          sql: `INSERT OR REPLACE INTO cricket_matches (
            id, title, match_name, notes, created_at, finished, finished_at,
            range, style, best_of_games, crazy_mode, crazy_scoring_mode
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          params: [
            m.id,
            m.title ?? 'Unbenannt',
            m.matchName ?? null,
            m.notes ?? null,
            m.createdAt ?? nowISO(),
            m.finished ? 1 : 0,
            finishEvt?.ts ?? null,
            startEvt?.range ?? 'short',
            startEvt?.style ?? 'standard',
            startEvt?.bestOfGames ?? null,
            startEvt?.crazyMode ?? null,
            startEvt?.crazyScoringMode ?? null,
          ],
        })

        // Spieler
        const players = startEvt?.players ?? []
        for (let pi = 0; pi < players.length; pi++) {
          const p = players[pi]
          statements.push({
            sql: `INSERT OR REPLACE INTO cricket_match_players (match_id, player_id, position, is_guest)
                  VALUES (?, ?, ?, ?)`,
            params: [m.id, p.playerId, pi, p.isGuest ? 1 : 0],
          })
        }

        // Events
        const events = m.events ?? []
        for (let seq = 0; seq < events.length; seq++) {
          const ev = events[seq]
          statements.push({
            sql: `INSERT OR REPLACE INTO cricket_events (id, match_id, type, ts, seq, data)
                  VALUES (?, ?, ?, ?, ?, ?)`,
            params: [ev.eventId ?? generateId(), m.id, ev.type, ev.ts, seq, toJSON(ev)],
          })
        }

        await transaction(statements)
        migrated++
      } catch (err) {
        console.error(`[Migration] Fehler bei Cricket Match ${m.id}:`, err)
      }
    }
  }

  console.debug(`[Migration] ${migrated}/${matches.length} Cricket Matches migriert`)
  return migrated
}

// ============================================================================
// ATB Match Migration
// ============================================================================

type LSATBMatch = {
  id: string
  title: string
  createdAt: string
  players: any[]
  mode: string
  direction: string
  structure?: any
  events: any[]
  config?: any
  generatedSequence?: any[]
  finished?: boolean
  finishedAt?: string
  durationMs?: number
  winnerId?: string
  winnerDarts?: number
}

async function migrateATBMatches(): Promise<number> {
  const matches = readLS<LSATBMatch[]>(LS_KEYS.atbMatches, [])
  console.debug(`[Migration] Gefundene ATB Matches im LocalStorage: ${matches.length}`)
  if (matches.length === 0) return 0

  let migrated = 0

  for (let i = 0; i < matches.length; i++) {
    const m = matches[i]
    if (i % 5 === 0) {
      console.debug(`[Migration] ATB ${i + 1}/${matches.length}`)
    }

    try {
      const statements: Array<{ sql: string; params: unknown[] }> = []

      // Match
      statements.push({
        sql: `INSERT OR REPLACE INTO atb_matches (
          id, title, created_at, finished, finished_at, duration_ms, winner_id, winner_darts,
          mode, direction, structure_kind, best_of_legs, legs_per_set, best_of_sets,
          sequence_mode, target_mode, multiplier_mode, special_rule, generated_sequence
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        params: [
          m.id,
          m.title ?? 'Unbenannt',
          m.createdAt ?? nowISO(),
          m.finished ? 1 : 0,
          m.finishedAt ?? null,
          m.durationMs ?? null,
          m.winnerId ?? null,
          m.winnerDarts ?? null,
          m.mode ?? 'classic',
          m.direction ?? 'forward',
          m.structure?.kind ?? 'legs',
          m.structure?.bestOfLegs ?? null,
          m.structure?.legsPerSet ?? null,
          m.structure?.bestOfSets ?? null,
          m.config?.sequenceMode ?? null,
          m.config?.targetMode ?? null,
          m.config?.multiplierMode ?? null,
          m.config?.specialRule ?? null,
          m.generatedSequence ? toJSON(m.generatedSequence) : null,
        ],
      })

      // Spieler
      const players = m.players ?? []
      for (let pi = 0; pi < players.length; pi++) {
        const p = players[pi]
        statements.push({
          sql: `INSERT OR REPLACE INTO atb_match_players (match_id, player_id, position, is_guest)
                VALUES (?, ?, ?, ?)`,
          params: [m.id, p.playerId, pi, p.isGuest ? 1 : 0],
        })
      }

      // Events
      const events = m.events ?? []
      for (let seq = 0; seq < events.length; seq++) {
        const ev = events[seq]
        statements.push({
          sql: `INSERT OR REPLACE INTO atb_events (id, match_id, type, ts, seq, data)
                VALUES (?, ?, ?, ?, ?, ?)`,
          params: [ev.eventId ?? generateId(), m.id, ev.type, ev.ts, seq, toJSON(ev)],
        })
      }

      await transaction(statements)
      migrated++
    } catch (err) {
      console.error(`[Migration] Fehler bei ATB Match ${m.id}:`, err)
    }
  }

  console.debug(`[Migration] ${migrated}/${matches.length} ATB Matches migriert`)
  return migrated
}

// ============================================================================
// ATB Highscores Migration
// ============================================================================

type LSATBHighscore = {
  id: string
  playerId: string
  playerName: string
  mode: string
  direction: string
  durationMs: number
  darts: number
  date: string
}

async function migrateATBHighscores(): Promise<number> {
  const highscores = readLS<LSATBHighscore[]>(LS_KEYS.atbHighscores, [])
  if (highscores.length === 0) return 0

  const statements = highscores.map((h) => ({
    sql: `INSERT OR REPLACE INTO atb_highscores (id, player_id, mode, direction, duration_ms, darts, date)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
    params: [h.id, h.playerId, h.mode, h.direction, h.durationMs, h.darts, h.date],
  }))

  await transaction(statements)
  console.debug(`[Migration] ${highscores.length} ATB Highscores migriert`)
  return highscores.length
}

// ============================================================================
// CTF (Capture The Field) Migration
// ============================================================================

type LSCTFMatch = {
  id: string
  title?: string
  createdAt?: string
  players: Array<{ playerId: string; name: string; isGuest?: boolean }>
  structure?: any
  config?: any
  events: any[]
  generatedSequence?: any[]
  finished?: boolean
  finishedAt?: string
  durationMs?: number
  winnerId?: string
  winnerDarts?: number
  captureFieldWinners?: Record<string, string>
  captureTotalScores?: Record<string, number>
}

export async function migrateCTFMatches(): Promise<number> {
  const matches = readLS<LSCTFMatch[]>(LS_KEYS.ctfMatches, [])
  console.debug(`[Migration] Gefundene CTF Matches im LocalStorage: ${matches.length}`)
  if (matches.length === 0) return 0

  let migrated = 0

  for (let i = 0; i < matches.length; i++) {
    const m = matches[i]

    try {
      const startEvt = (m.events || []).find((e: any) => e.type === 'CTFMatchStarted')
      const statements: Array<{ sql: string; params: unknown[] }> = []

      statements.push({
        sql: `INSERT OR REPLACE INTO ctf_matches (
          id, title, created_at, finished, finished_at, duration_ms, winner_id, winner_darts,
          multiplier_mode, rotate_order, bull_position,
          structure_kind, best_of_legs, legs_per_set, best_of_sets,
          generated_sequence, capture_field_winners, capture_total_scores
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        params: [
          m.id,
          m.title ?? 'Unbenannt',
          m.createdAt ?? nowISO(),
          m.finished ? 1 : 0,
          m.finishedAt ?? null,
          m.durationMs ?? null,
          m.winnerId ?? null,
          m.winnerDarts ?? null,
          m.config?.multiplierMode ?? startEvt?.config?.multiplierMode ?? 'standard',
          m.config?.rotateOrder !== false ? 1 : 0,
          m.config?.bullPosition ?? startEvt?.config?.bullPosition ?? null,
          m.structure?.kind ?? startEvt?.structure?.kind ?? 'legs',
          m.structure?.bestOfLegs ?? startEvt?.structure?.bestOfLegs ?? null,
          m.structure?.legsPerSet ?? startEvt?.structure?.legsPerSet ?? null,
          m.structure?.bestOfSets ?? startEvt?.structure?.bestOfSets ?? null,
          m.generatedSequence ? toJSON(m.generatedSequence) : null,
          m.captureFieldWinners ? toJSON(m.captureFieldWinners) : null,
          m.captureTotalScores ? toJSON(m.captureTotalScores) : null,
        ],
      })

      // Spieler
      const players = startEvt?.players ?? m.players ?? []
      for (let pi = 0; pi < players.length; pi++) {
        const p = players[pi]
        statements.push({
          sql: `INSERT OR REPLACE INTO ctf_match_players (match_id, player_id, position, is_guest)
                VALUES (?, ?, ?, ?)`,
          params: [m.id, p.playerId, pi, p.isGuest ? 1 : 0],
        })
      }

      // Events (mit Enrichment für CTFTurnAdded)
      const events = m.events ?? []
      for (let seq = 0; seq < events.length; seq++) {
        const ev = events[seq]
        // Inline-Enrichment für CTFTurnAdded
        let enriched = ev
        if (ev.type === 'CTFTurnAdded' && ev.darts) {
          let hits = 0, misses = 0, triples = 0, doubles = 0
          for (const dart of ev.darts) {
            if (dart.target === 'MISS') misses++
            else {
              hits++
              if (dart.mult === 3) triples++
              else if (dart.mult === 2) doubles++
            }
          }
          enriched = { ...ev, hits, misses, triples, doubles, totalDarts: ev.darts.length, dartsArray: ev.darts }
        }
        statements.push({
          sql: `INSERT OR REPLACE INTO ctf_events (id, match_id, type, ts, seq, data)
                VALUES (?, ?, ?, ?, ?, ?)`,
          params: [ev.eventId ?? generateId(), m.id, ev.type, ev.ts, seq, toJSON(enriched)],
        })
      }

      await transaction(statements)
      migrated++
    } catch (err) {
      console.error(`[Migration] Fehler bei CTF Match ${m.id}:`, err)
    }
  }

  console.debug(`[Migration] ${migrated}/${matches.length} CTF Matches migriert`)
  return migrated
}

// ============================================================================
// STR (Sträußchen) Match Migration
// ============================================================================

type LSStrMatch = {
  id: string
  title: string
  createdAt: string
  players: any[]
  mode: string
  targetNumber?: number
  numberOrder?: string
  turnOrder?: string
  ringMode?: string
  bullMode?: string
  bullPosition?: string
  structure?: any
  events: any[]
  generatedOrder?: number[]
  finished?: boolean
  finishedAt?: string
  durationMs?: number
  winnerId?: string
  winnerDarts?: number
  legWins?: Record<string, number>
  setWins?: Record<string, number>
}

export async function migrateStrMatches(): Promise<number> {
  const matches = readLS<LSStrMatch[]>(LS_KEYS.strMatches, [])
  console.debug(`[Migration] Gefundene STR Matches im LocalStorage: ${matches.length}`)
  if (matches.length === 0) return 0

  let migrated = 0

  for (let i = 0; i < matches.length; i++) {
    const m = matches[i]

    try {
      const startEvt = (m.events || []).find((e: any) => e.type === 'StrMatchStarted')
      const statements: Array<{ sql: string; params: unknown[] }> = []

      statements.push({
        sql: `INSERT OR REPLACE INTO str_matches (
          id, title, created_at, finished, finished_at, duration_ms, winner_id, winner_darts,
          mode, target_number, number_order, turn_order, ring_mode, bull_mode, bull_position,
          structure_kind, best_of_legs, legs_per_set, best_of_sets,
          generated_order, leg_wins, set_wins
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        params: [
          m.id,
          m.title ?? 'Unbenannt',
          m.createdAt ?? nowISO(),
          m.finished ? 1 : 0,
          m.finishedAt ?? null,
          m.durationMs ?? null,
          m.winnerId ?? null,
          m.winnerDarts ?? null,
          m.mode ?? startEvt?.mode ?? 'single',
          m.targetNumber ?? startEvt?.targetNumber ?? null,
          m.numberOrder ?? startEvt?.numberOrder ?? null,
          m.turnOrder ?? startEvt?.turnOrder ?? null,
          m.ringMode ?? startEvt?.ringMode ?? null,
          m.bullMode ?? startEvt?.bullMode ?? null,
          m.bullPosition ?? startEvt?.bullPosition ?? null,
          m.structure?.kind ?? startEvt?.structure?.kind ?? 'legs',
          m.structure?.bestOfLegs ?? startEvt?.structure?.bestOfLegs ?? null,
          m.structure?.legsPerSet ?? startEvt?.structure?.legsPerSet ?? null,
          m.structure?.bestOfSets ?? startEvt?.structure?.bestOfSets ?? null,
          m.generatedOrder ? toJSON(m.generatedOrder) : (startEvt?.generatedOrder ? toJSON(startEvt.generatedOrder) : null),
          m.legWins ? toJSON(m.legWins) : null,
          m.setWins ? toJSON(m.setWins) : null,
        ],
      })

      // Spieler
      const players = startEvt?.players ?? m.players ?? []
      for (let pi = 0; pi < players.length; pi++) {
        const p = players[pi]
        statements.push({
          sql: `INSERT OR REPLACE INTO str_match_players (match_id, player_id, position, is_guest)
                VALUES (?, ?, ?, ?)`,
          params: [m.id, p.playerId, pi, p.isGuest ? 1 : 0],
        })
      }

      // Events (mit Enrichment für StrTurnAdded)
      const events = m.events ?? []
      for (let seq = 0; seq < events.length; seq++) {
        const ev = events[seq]
        let enriched = ev
        if (ev.type === 'StrTurnAdded' && ev.darts) {
          let hits = 0, misses = 0
          for (const dart of ev.darts) {
            if (dart === 'hit') hits++
            else misses++
          }
          enriched = { ...ev, hits, misses, totalDarts: ev.darts.length }
        }
        statements.push({
          sql: `INSERT OR REPLACE INTO str_events (id, match_id, type, ts, seq, data)
                VALUES (?, ?, ?, ?, ?, ?)`,
          params: [ev.eventId ?? generateId(), m.id, ev.type, ev.ts, seq, toJSON(enriched)],
        })
      }

      await transaction(statements)
      migrated++
    } catch (err) {
      console.error(`[Migration] Fehler bei STR Match ${m.id}:`, err)
    }
  }

  console.debug(`[Migration] ${migrated}/${matches.length} STR Matches migriert`)
  return migrated
}

// ============================================================================
// Highscore Match Migration
// ============================================================================

type LSHighscoreMatch = {
  id: string
  title: string
  createdAt: string
  players: any[]
  targetScore: number
  structure?: any
  events: any[]
  finished?: boolean
  finishedAt?: string
  durationMs?: number
  winnerId?: string
  winnerDarts?: number
  legWins?: Record<string, number>
  setWins?: Record<string, number>
}

export async function migrateHighscoreMatches(): Promise<number> {
  const matches = readLS<LSHighscoreMatch[]>(LS_KEYS.highscoreMatches, [])
  console.debug(`[Migration] Gefundene Highscore Matches im LocalStorage: ${matches.length}`)
  if (matches.length === 0) return 0

  let migrated = 0

  for (let i = 0; i < matches.length; i++) {
    const m = matches[i]

    try {
      const startEvt = (m.events || []).find((e: any) => e.type === 'HighscoreMatchStarted')
      const statements: Array<{ sql: string; params: unknown[] }> = []

      statements.push({
        sql: `INSERT OR REPLACE INTO highscore_matches (
          id, title, created_at, finished, finished_at, duration_ms, winner_id, winner_darts,
          target_score, structure_kind, target_legs, legs_per_set, target_sets,
          leg_wins, set_wins
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        params: [
          m.id,
          m.title ?? 'Unbenannt',
          m.createdAt ?? nowISO(),
          m.finished ? 1 : 0,
          m.finishedAt ?? null,
          m.durationMs ?? null,
          m.winnerId ?? null,
          m.winnerDarts ?? null,
          m.targetScore ?? startEvt?.targetScore ?? 300,
          m.structure?.kind ?? startEvt?.structure?.kind ?? 'legs',
          m.structure?.targetLegs ?? startEvt?.structure?.targetLegs ?? null,
          m.structure?.legsPerSet ?? startEvt?.structure?.legsPerSet ?? null,
          m.structure?.targetSets ?? startEvt?.structure?.targetSets ?? null,
          m.legWins ? toJSON(m.legWins) : null,
          m.setWins ? toJSON(m.setWins) : null,
        ],
      })

      // Spieler
      const players = startEvt?.players ?? m.players ?? []
      for (let pi = 0; pi < players.length; pi++) {
        const p = players[pi]
        statements.push({
          sql: `INSERT OR REPLACE INTO highscore_match_players (match_id, player_id, position, is_guest)
                VALUES (?, ?, ?, ?)`,
          params: [m.id, p.id ?? p.playerId, pi, p.isGuest ? 1 : 0],
        })
      }

      // Events (mit Enrichment für HighscoreTurnAdded)
      const events = m.events ?? []
      for (let seq = 0; seq < events.length; seq++) {
        const ev = events[seq]
        let enriched = ev
        if (ev.type === 'HighscoreTurnAdded' && ev.darts) {
          let triples = 0, doubles = 0, singles = 0, misses = 0
          for (const dart of ev.darts) {
            if (dart.target === 'MISS') misses++
            else if (dart.mult === 3) triples++
            else if (dart.mult === 2) doubles++
            else singles++
          }
          enriched = { ...ev, triples, doubles, singles, misses, totalDarts: ev.darts.length }
        }
        // Highscore nutzt timestamp (number) statt ts (string)
        const ts = ev.ts ?? (ev.timestamp ? new Date(ev.timestamp).toISOString() : nowISO())
        statements.push({
          sql: `INSERT OR REPLACE INTO highscore_events (id, match_id, type, ts, seq, data)
                VALUES (?, ?, ?, ?, ?, ?)`,
          params: [ev.eventId ?? generateId(), m.id, ev.type, ts, seq, toJSON(enriched)],
        })
      }

      await transaction(statements)
      migrated++
    } catch (err) {
      console.error(`[Migration] Fehler bei Highscore Match ${m.id}:`, err)
    }
  }

  console.debug(`[Migration] ${migrated}/${matches.length} Highscore Matches migriert`)
  return migrated
}

// ============================================================================
// System Meta Migration
// ============================================================================

async function migrateSystemMeta(): Promise<void> {
  const lastX01 = localStorage.getItem(LS_KEYS.lastOpenMatchId)
  const lastCricket = localStorage.getItem(LS_KEYS.cricketLastOpenMatchId)
  const lastATB = localStorage.getItem(LS_KEYS.atbLastOpenMatchId)

  if (lastX01) await setMeta('last_open_x01', lastX01)
  if (lastCricket) await setMeta('last_open_cricket', lastCricket)
  if (lastATB) await setMeta('last_open_atb', lastATB)

  console.debug('[Migration] System Meta migriert')
}

// ============================================================================
// Main Migration Function
// ============================================================================

export type MigrationResult = {
  success: boolean
  profiles: number
  x01Matches: number
  cricketMatches: number
  atbMatches: number
  atbHighscores: number
  durationMs: number
  error?: string
}

/**
 * Führt die vollständige Migration von LocalStorage zu SQLite durch.
 * Kann sicher mehrfach aufgerufen werden (INSERT OR REPLACE).
 */
export async function migrateFromLocalStorage(): Promise<MigrationResult> {
  const startTime = Date.now()

  let profiles = 0
  let x01Matches = 0
  let cricketMatches = 0
  let atbMatches = 0
  let atbHighscores = 0
  let ctfMatches = 0
  let strMatches = 0
  let highscoreMatches = 0

  try {
    // DB initialisieren
    await initDB()

    console.debug('[Migration] Starte Migration von LocalStorage zu SQLite...')

    // Alle Daten migrieren - einzeln mit try/catch
    try {
      profiles = await migrateProfiles()
    } catch (e) {
      console.error('[Migration] Profiles fehlgeschlagen:', e)
    }

    try {
      x01Matches = await migrateX01Matches()
    } catch (e) {
      console.error('[Migration] X01 Matches fehlgeschlagen:', e)
    }

    try {
      cricketMatches = await migrateCricketMatches()
    } catch (e) {
      console.error('[Migration] Cricket Matches fehlgeschlagen:', e)
    }

    try {
      atbMatches = await migrateATBMatches()
    } catch (e) {
      console.error('[Migration] ATB Matches fehlgeschlagen:', e)
    }

    try {
      atbHighscores = await migrateATBHighscores()
    } catch (e) {
      console.error('[Migration] ATB Highscores fehlgeschlagen:', e)
    }

    try {
      ctfMatches = await migrateCTFMatches()
    } catch (e) {
      console.error('[Migration] CTF Matches fehlgeschlagen:', e)
    }

    try {
      strMatches = await migrateStrMatches()
    } catch (e) {
      console.error('[Migration] STR Matches fehlgeschlagen:', e)
    }

    try {
      highscoreMatches = await migrateHighscoreMatches()
    } catch (e) {
      console.error('[Migration] Highscore Matches fehlgeschlagen:', e)
    }

    try {
      await migrateSystemMeta()
    } catch (e) {
      console.error('[Migration] System Meta fehlgeschlagen:', e)
    }

    // Migrations-Status speichern
    await setMeta('ls_migrated', 'true')
    await setMeta('ls_migrated_at', nowISO())

    const durationMs = Date.now() - startTime
    console.debug(`[Migration] Abgeschlossen in ${durationMs}ms`)
    console.debug(`[Migration] Ergebnis: ${profiles} Profile, ${x01Matches} X01, ${cricketMatches} Cricket, ${atbMatches} ATB, ${ctfMatches} CTF, ${strMatches} STR, ${highscoreMatches} Highscore, ${atbHighscores} ATB-HS`)

    return {
      success: true,
      profiles,
      x01Matches,
      cricketMatches,
      atbMatches,
      atbHighscores,
      durationMs,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[Migration] Kritischer Fehler:', error)
    return {
      success: false,
      profiles,
      x01Matches,
      cricketMatches,
      atbMatches,
      atbHighscores,
      durationMs: Date.now() - startTime,
      error: message,
    }
  }
}

/**
 * Löscht alle migrierten Daten (für Development/Testing)
 */
export async function clearMigratedData(): Promise<void> {
  await initDB()

  await exec('DELETE FROM atb_highscores')
  await exec('DELETE FROM atb_events')
  await exec('DELETE FROM atb_match_players')
  await exec('DELETE FROM atb_matches')
  await exec('DELETE FROM cricket_events')
  await exec('DELETE FROM cricket_match_players')
  await exec('DELETE FROM cricket_matches')
  await exec('DELETE FROM x01_events')
  await exec('DELETE FROM x01_match_players')
  await exec('DELETE FROM x01_matches')
  await exec('DELETE FROM profiles')
  await exec("DELETE FROM system_meta WHERE key LIKE 'ls_%'")

  console.debug('[Migration] Alle migrierten Daten gelöscht')
}

/**
 * Debug: Zeigt was im LocalStorage vorhanden ist
 */
export function debugLocalStorage(): Record<string, { count: number; sampleKeys?: string[] }> {
  const result: Record<string, { count: number; sampleKeys?: string[] }> = {}

  // Prüfe alle relevanten Keys
  const keysToCheck = [
    { key: LS_KEYS.profiles, name: 'profiles' },
    { key: LS_KEYS.matches, name: 'x01Matches' },
    { key: LS_KEYS.cricketMatches, name: 'cricketMatches' },
    { key: LS_KEYS.atbMatches, name: 'atbMatches' },
    { key: LS_KEYS.atbHighscores, name: 'atbHighscores' },
  ]

  for (const { key, name } of keysToCheck) {
    const raw = localStorage.getItem(key)
    if (!raw) {
      result[name] = { count: 0 }
      continue
    }

    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        result[name] = {
          count: parsed.length,
          sampleKeys: parsed.slice(0, 2).map((item: any) => item.id || item.name || 'unknown'),
        }
      } else {
        result[name] = { count: 1 }
      }
    } catch {
      result[name] = { count: -1 } // Parse error
    }
  }

  console.debug('[Debug] LocalStorage Inhalt:', result)
  return result
}

/**
 * Zeigt alle LocalStorage Keys die mit darts/cricket/atb beginnen
 */
export function listAllStorageKeys(): string[] {
  const keys: string[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key && (key.includes('darts') || key.includes('cricket') || key.includes('atb') || key.includes('121') || key.includes('x01'))) {
      keys.push(key)
    }
  }
  console.debug('[Debug] Alle relevanten LocalStorage Keys:', keys)
  return keys
}

/**
 * Force re-migration (löscht SQLite und migriert neu)
 */
export async function forceMigration(): Promise<MigrationResult> {
  console.debug('[Migration] Force migration - lösche alte Daten...')
  await clearMigratedData()
  console.debug('[Migration] Starte neue Migration...')
  return migrateFromLocalStorage()
}

/**
 * Kompletter Migrations-Test mit detailliertem Output
 */
export async function fullMigrationTest(): Promise<void> {
  console.debug('='.repeat(60))
  console.debug('[Test] MIGRATIONS-TEST GESTARTET')
  console.debug('='.repeat(60))

  // 1. LocalStorage analysieren
  console.debug('\n[1/4] LocalStorage analysieren...')
  const lsData = debugLocalStorage()
  listAllStorageKeys()

  // 2. SQLite Daten löschen
  console.debug('\n[2/4] SQLite Daten löschen...')
  await clearMigratedData()

  // 3. Migration durchführen
  console.debug('\n[3/4] Migration durchführen...')
  const result = await migrateFromLocalStorage()

  // 4. Ergebnis prüfen
  console.debug('\n[4/4] Ergebnis prüfen...')
  const status = await getMigrationStatus()

  console.debug('\n' + '='.repeat(60))
  console.debug('[Test] MIGRATIONS-TEST ABGESCHLOSSEN')
  console.debug('='.repeat(60))

  console.debug('\nLocalStorage hatte:')
  console.table(lsData)

  console.debug('\nSQLite hat jetzt:')
  console.table({
    profiles: status.profiles,
    x01Matches: status.x01Matches,
    cricketMatches: status.cricketMatches,
    atbMatches: status.atbMatches,
  })

  console.debug('\nMigrations-Ergebnis:', result)

  // Vergleich
  const lsProfiles = lsData.profiles?.count ?? 0
  const lsX01 = lsData.x01Matches?.count ?? 0
  const lsCricket = lsData.cricketMatches?.count ?? 0
  const lsATB = lsData.atbMatches?.count ?? 0

  const missing = {
    profiles: lsProfiles - status.profiles,
    x01: lsX01 - status.x01Matches,
    cricket: lsCricket - status.cricketMatches,
    atb: lsATB - status.atbMatches,
  }

  if (missing.profiles > 0 || missing.x01 > 0 || missing.cricket > 0 || missing.atb > 0) {
    console.warn('\n⚠️ FEHLENDE DATEN:', missing)
  } else {
    console.debug('\n✅ Alle Daten erfolgreich migriert!')
  }
}

// ============================================================================
// Event Enrichment Migration
// ============================================================================

/**
 * Berechnet Statistik-Felder für ein Cricket Event
 */
function enrichCricketEventData(eventData: any): any {
  if (!eventData.darts || !Array.isArray(eventData.darts)) return eventData
  if (eventData.marks !== undefined) return eventData // Bereits enriched

  let marks = 0
  let tripleCount = 0
  let doubleCount = 0
  let singleCount = 0
  let bullCount = 0
  let doubleBullCount = 0

  for (const dart of eventData.darts) {
    if (dart.target === 'MISS') continue

    const dartMarks = dart.target === 'BULL' && dart.mult === 3 ? 2 : dart.mult
    marks += dartMarks

    if (dart.mult === 3) tripleCount++
    else if (dart.mult === 2) doubleCount++
    else if (dart.mult === 1) singleCount++

    if (dart.target === 'BULL') {
      if (dart.mult >= 2) doubleBullCount++
      else bullCount++
    }
  }

  return {
    ...eventData,
    marks,
    tripleCount,
    doubleCount,
    singleCount,
    bullCount,
    doubleBullCount,
    dartCount: eventData.darts.length,
  }
}

/**
 * Berechnet Statistik-Felder für ein ATB Event
 */
function enrichATBEventData(eventData: any): any {
  if (!eventData.darts || !Array.isArray(eventData.darts)) return eventData
  if (eventData.hits !== undefined) return eventData // Bereits enriched

  let hits = 0
  let misses = 0
  let triples = 0
  let doubles = 0

  for (const dart of eventData.darts) {
    if (dart.target === 'MISS') {
      misses++
    } else {
      hits++
      if (dart.mult === 3) triples++
      else if (dart.mult === 2) doubles++
    }
  }

  return {
    ...eventData,
    hits,
    misses,
    triples,
    doubles,
    totalDarts: eventData.darts.length,
  }
}

/**
 * Migriert existierende Cricket-Events um Statistik-Felder hinzuzufügen
 */
export async function enrichCricketEvents(): Promise<number> {
  const events = await query<{ id: string; data: string }>(`
    SELECT id, data FROM cricket_events WHERE type = 'CricketTurnAdded'
  `)

  let enriched = 0
  const statements: Array<{ sql: string; params: unknown[] }> = []

  for (const ev of events) {
    try {
      const eventData = JSON.parse(ev.data)

      // Prüfe ob bereits enriched
      if (eventData.marks !== undefined) continue

      const enrichedData = enrichCricketEventData(eventData)
      statements.push({
        sql: 'UPDATE cricket_events SET data = ? WHERE id = ?',
        params: [JSON.stringify(enrichedData), ev.id],
      })
      enriched++
    } catch (e) {
      console.warn(`[Enrichment] Cricket Event ${ev.id} fehlgeschlagen:`, e)
    }
  }

  if (statements.length > 0) {
    await transaction(statements)
  }

  console.debug(`[Enrichment] ${enriched}/${events.length} Cricket Events bereichert`)
  return enriched
}

/**
 * Migriert existierende ATB-Events um Statistik-Felder hinzuzufügen
 */
export async function enrichATBEvents(): Promise<number> {
  const events = await query<{ id: string; data: string }>(`
    SELECT id, data FROM atb_events WHERE type = 'ATBTurnAdded'
  `)

  let enriched = 0
  const statements: Array<{ sql: string; params: unknown[] }> = []

  for (const ev of events) {
    try {
      const eventData = JSON.parse(ev.data)

      // Prüfe ob bereits enriched
      if (eventData.hits !== undefined) continue

      const enrichedData = enrichATBEventData(eventData)
      statements.push({
        sql: 'UPDATE atb_events SET data = ? WHERE id = ?',
        params: [JSON.stringify(enrichedData), ev.id],
      })
      enriched++
    } catch (e) {
      console.warn(`[Enrichment] ATB Event ${ev.id} fehlgeschlagen:`, e)
    }
  }

  if (statements.length > 0) {
    await transaction(statements)
  }

  console.debug(`[Enrichment] ${enriched}/${events.length} ATB Events bereichert`)
  return enriched
}

/**
 * Führt alle Event-Enrichments durch
 */
export async function enrichAllEvents(): Promise<{ cricket: number; atb: number }> {
  // Guard: Skip wenn bereits komplett enriched
  try {
    const done = await getMeta('enrichment_done_v2')
    if (done === 'true') {
      return { cricket: 0, atb: 0 }
    }
  } catch { /* meta table might not exist yet */ }

  console.debug('[Enrichment] Starte Event-Enrichment...')

  const cricket = await enrichCricketEvents()
  const atb = await enrichATBEvents()

  console.debug(`[Enrichment] Fertig: ${cricket} Cricket, ${atb} ATB Events bereichert`)

  // Flag setzen wenn nichts mehr zu enrichen war
  if (cricket === 0 && atb === 0) {
    try {
      await setMeta('enrichment_done_v2', 'true')
    } catch { /* ignore */ }
  }

  return { cricket, atb }
}

/**
 * Merge-Migration: Fügt nur fehlende Matches von LocalStorage zu SQLite hinzu
 * Ohne bestehende SQLite-Daten zu löschen!
 */
export async function mergeFromLocalStorage(): Promise<{
  x01Added: number
  cricketAdded: number
  atbAdded: number
}> {
  await initDB()
  console.debug('[Merge] Starte Merge von LocalStorage nach SQLite...')

  let x01Added = 0
  let cricketAdded = 0
  let atbAdded = 0

  // X01 Matches mergen
  try {
    const lsMatches = readLS<LSMatch[]>(LS_KEYS.matches, [])
    const existingIds = await query<{ id: string }>('SELECT id FROM x01_matches')
    const existingIdSet = new Set(existingIds.map((r) => r.id))

    const missingMatches = lsMatches.filter((m) => !existingIdSet.has(m.id))
    console.debug(`[Merge] X01: ${lsMatches.length} in LS, ${existingIds.length} in SQLite, ${missingMatches.length} fehlen`)

    for (const m of missingMatches) {
      try {
        const startEvt = m.events?.find((e) => e.type === 'MatchStarted')
        const finishEvt = m.events?.find((e) => e.type === 'MatchFinished')

        const statements: Array<{ sql: string; params: unknown[] }> = []

        statements.push({
          sql: `INSERT INTO x01_matches (
            id, title, match_name, notes, created_at, finished, finished_at,
            mode, starting_score, structure_kind, best_of_legs, legs_per_set, best_of_sets,
            in_rule, out_rule
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          params: [
            m.id,
            m.title ?? 'Unbenannt',
            m.matchName ?? null,
            m.notes ?? null,
            m.createdAt ?? nowISO(),
            m.finished ? 1 : 0,
            finishEvt?.ts ?? null,
            startEvt?.mode ?? '501-double-out',
            startEvt?.startingScorePerLeg ?? 501,
            startEvt?.structure?.kind ?? 'legs',
            startEvt?.structure?.bestOfLegs ?? null,
            startEvt?.structure?.legsPerSet ?? null,
            startEvt?.structure?.bestOfSets ?? null,
            startEvt?.inRule ?? 'straight-in',
            startEvt?.outRule ?? 'double-out',
          ],
        })

        const players = startEvt?.players ?? []
        for (let pi = 0; pi < players.length; pi++) {
          const p = players[pi]
          statements.push({
            sql: `INSERT INTO x01_match_players (match_id, player_id, position, is_guest) VALUES (?, ?, ?, ?)`,
            params: [m.id, p.playerId, pi, p.isGuest ? 1 : 0],
          })
        }

        const events = m.events ?? []
        for (let seq = 0; seq < events.length; seq++) {
          const ev = events[seq]
          statements.push({
            sql: `INSERT INTO x01_events (id, match_id, type, ts, seq, data) VALUES (?, ?, ?, ?, ?, ?)`,
            params: [ev.eventId ?? generateId(), m.id, ev.type, ev.ts, seq, toJSON(ev)],
          })
        }

        await transaction(statements)
        x01Added++
        console.debug(`[Merge] X01 hinzugefügt: ${m.id} (${m.title})`)
      } catch (e) {
        console.error(`[Merge] X01 Fehler bei ${m.id}:`, e)
      }
    }
  } catch (e) {
    console.error('[Merge] X01 Fehler:', e)
  }

  // Cricket Matches mergen
  try {
    const lsMatches = readLS<any[]>(LS_KEYS.cricketMatches, [])
    const existingIds = await query<{ id: string }>('SELECT id FROM cricket_matches')
    const existingIdSet = new Set(existingIds.map((r) => r.id))

    const missingMatches = lsMatches.filter((m) => !existingIdSet.has(m.id))
    console.debug(`[Merge] Cricket: ${lsMatches.length} in LS, ${existingIds.length} in SQLite, ${missingMatches.length} fehlen`)

    for (const m of missingMatches) {
      try {
        const startEvt = m.events?.find((e: any) => e.type === 'CricketMatchStarted')
        const finishEvt = m.events?.find((e: any) => e.type === 'CricketMatchFinished')

        const statements: Array<{ sql: string; params: unknown[] }> = []

        statements.push({
          sql: `INSERT INTO cricket_matches (
            id, title, match_name, notes, created_at, finished, finished_at,
            range, style, best_of_games, crazy_mode, crazy_scoring_mode
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          params: [
            m.id,
            m.title ?? 'Unbenannt',
            m.matchName ?? null,
            m.notes ?? null,
            m.createdAt ?? nowISO(),
            m.finished ? 1 : 0,
            finishEvt?.ts ?? null,
            startEvt?.range ?? 'short',
            startEvt?.style ?? 'standard',
            startEvt?.bestOfGames ?? 1,
            startEvt?.crazyMode ?? null,
            startEvt?.crazyScoringMode ?? null,
          ],
        })

        const players = startEvt?.players ?? []
        for (let pi = 0; pi < players.length; pi++) {
          const p = players[pi]
          statements.push({
            sql: `INSERT INTO cricket_match_players (match_id, player_id, position) VALUES (?, ?, ?)`,
            params: [m.id, p.playerId, pi],
          })
        }

        const events = m.events ?? []
        for (let seq = 0; seq < events.length; seq++) {
          const ev = events[seq]
          statements.push({
            sql: `INSERT INTO cricket_events (id, match_id, type, ts, seq, data) VALUES (?, ?, ?, ?, ?, ?)`,
            params: [ev.eventId ?? generateId(), m.id, ev.type, ev.ts, seq, toJSON(ev)],
          })
        }

        await transaction(statements)
        cricketAdded++
        console.debug(`[Merge] Cricket hinzugefügt: ${m.id} (${m.title})`)
      } catch (e) {
        console.error(`[Merge] Cricket Fehler bei ${m.id}:`, e)
      }
    }
  } catch (e) {
    console.error('[Merge] Cricket Fehler:', e)
  }

  // ATB Matches mergen
  try {
    const lsMatches = readLS<any[]>(LS_KEYS.atbMatches, [])
    const existingIds = await query<{ id: string }>('SELECT id FROM atb_matches')
    const existingIdSet = new Set(existingIds.map((r) => r.id))

    const missingMatches = lsMatches.filter((m) => !existingIdSet.has(m.id))
    console.debug(`[Merge] ATB: ${lsMatches.length} in LS, ${existingIds.length} in SQLite, ${missingMatches.length} fehlen`)

    for (const m of missingMatches) {
      try {
        const startEvt = m.events?.find((e: any) => e.type === 'ATBMatchStarted')
        const finishEvt = m.events?.find((e: any) => e.type === 'ATBMatchFinished')

        const statements: Array<{ sql: string; params: unknown[] }> = []

        statements.push({
          sql: `INSERT INTO atb_matches (
            id, title, created_at, finished, finished_at, duration_ms, winner_id, winner_darts,
            mode, direction, structure_kind, best_of_legs, legs_per_set, best_of_sets,
            sequence_mode, target_mode, multiplier_mode, special_rule, generated_sequence
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          params: [
            m.id,
            m.title ?? 'Unbenannt',
            m.createdAt ?? nowISO(),
            m.finished ? 1 : 0,
            finishEvt?.ts ?? null,
            m.durationMs ?? null,
            m.winnerId ?? null,
            m.winnerDarts ?? null,
            startEvt?.mode ?? 'standard',
            startEvt?.direction ?? 'forward',
            startEvt?.structure?.kind ?? 'legs',
            startEvt?.structure?.bestOfLegs ?? null,
            startEvt?.structure?.legsPerSet ?? null,
            startEvt?.structure?.bestOfSets ?? null,
            startEvt?.config?.sequenceMode ?? null,
            startEvt?.config?.targetMode ?? null,
            startEvt?.config?.multiplierMode ?? null,
            startEvt?.config?.specialRule ?? null,
            startEvt?.extendedSequence ? toJSON(startEvt.extendedSequence) : null,
          ],
        })

        const players = startEvt?.players ?? []
        for (let pi = 0; pi < players.length; pi++) {
          const p = players[pi]
          statements.push({
            sql: `INSERT INTO atb_match_players (match_id, player_id, position) VALUES (?, ?, ?)`,
            params: [m.id, p.playerId, pi],
          })
        }

        const events = m.events ?? []
        for (let seq = 0; seq < events.length; seq++) {
          const ev = events[seq]
          statements.push({
            sql: `INSERT INTO atb_events (id, match_id, type, ts, seq, data) VALUES (?, ?, ?, ?, ?, ?)`,
            params: [ev.eventId ?? generateId(), m.id, ev.type, ev.ts, seq, toJSON(ev)],
          })
        }

        await transaction(statements)
        atbAdded++
        console.debug(`[Merge] ATB hinzugefügt: ${m.id} (${m.title})`)
      } catch (e) {
        console.error(`[Merge] ATB Fehler bei ${m.id}:`, e)
      }
    }
  } catch (e) {
    console.error('[Merge] ATB Fehler:', e)
  }

  console.debug(`[Merge] Abgeschlossen: ${x01Added} X01, ${cricketAdded} Cricket, ${atbAdded} ATB hinzugefügt`)
  return { x01Added, cricketAdded, atbAdded }
}

// Dev Helpers
if (typeof window !== 'undefined') {
  ;(window as any).migrateToSQLite = migrateFromLocalStorage
  ;(window as any).getMigrationStatus = getMigrationStatus
  ;(window as any).clearSQLiteData = clearMigratedData
  ;(window as any).debugLocalStorage = debugLocalStorage
  ;(window as any).forceMigration = forceMigration
  ;(window as any).mergeFromLocalStorage = mergeFromLocalStorage
  ;(window as any).listAllStorageKeys = listAllStorageKeys
  ;(window as any).fullMigrationTest = fullMigrationTest
  ;(window as any).enrichAllEvents = enrichAllEvents
  ;(window as any).enrichCricketEvents = enrichCricketEvents
  ;(window as any).enrichATBEvents = enrichATBEvents
}
