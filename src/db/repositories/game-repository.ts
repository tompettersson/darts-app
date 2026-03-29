/**
 * Generic Game Repository
 *
 * Single parameterized repository that handles CRUD for ANY of the 10 game modes.
 * Eliminates the 10x copy-paste pattern in db/storage.ts.
 *
 * All 10 modes share identical table structures:
 * - matches (id, title, created_at, finished, finished_at, + mode-specific cols)
 * - match_players (match_id, player_id, position, is_guest)
 * - events (id, match_id, type, ts, seq, data)
 */
import { eq, desc, sql, inArray, and } from 'drizzle-orm'
import type { PgTable } from 'drizzle-orm/pg-core'
import type { DrizzleDb } from '../drizzle'
import * as schema from '../drizzle-schema'

// ============================================================
// Types
// ============================================================

export type GameMode =
  | 'x01' | 'cricket' | 'atb' | 'str' | 'ctf'
  | 'highscore' | 'shanghai' | 'killer' | 'bobs27' | 'operation'

export type GameTableSet = {
  matches: typeof schema.x01Matches       // any matches table (they share the same base shape)
  matchPlayers: typeof schema.x01MatchPlayers
  events: typeof schema.x01Events
}

export type MatchRow = {
  id: string
  title: string
  matchName?: string | null
  notes?: string | null
  createdAt: string
  finished?: number | null
  finishedAt?: string | null
  [key: string]: unknown  // mode-specific columns
}

export type MatchPlayerRow = {
  matchId: string
  playerId: string
  position: number
  isGuest?: number | null
}

export type EventRow = {
  id: string
  matchId: string
  type: string
  ts: string
  seq: number
  data: string
}

export type MatchWithRelations = MatchRow & {
  playerIds: string[]
  events: EventRow[]
}

// ============================================================
// Table Registry
// ============================================================

export const GAME_TABLES: Record<GameMode, GameTableSet> = {
  x01:       { matches: schema.x01Matches as any,       matchPlayers: schema.x01MatchPlayers as any,       events: schema.x01Events as any },
  cricket:   { matches: schema.cricketMatches as any,    matchPlayers: schema.cricketMatchPlayers as any,   events: schema.cricketEvents as any },
  atb:       { matches: schema.atbMatches as any,        matchPlayers: schema.atbMatchPlayers as any,       events: schema.atbEvents as any },
  str:       { matches: schema.strMatches as any,        matchPlayers: schema.strMatchPlayers as any,       events: schema.strEvents as any },
  ctf:       { matches: schema.ctfMatches as any,        matchPlayers: schema.ctfMatchPlayers as any,       events: schema.ctfEvents as any },
  highscore: { matches: schema.highscoreMatches as any,  matchPlayers: schema.highscoreMatchPlayers as any, events: schema.highscoreEvents as any },
  shanghai:  { matches: schema.shanghaiMatches as any,   matchPlayers: schema.shanghaiMatchPlayers as any,  events: schema.shanghaiEvents as any },
  killer:    { matches: schema.killerMatches as any,     matchPlayers: schema.killerMatchPlayers as any,    events: schema.killerEvents as any },
  bobs27:    { matches: schema.bobs27Matches as any,     matchPlayers: schema.bobs27MatchPlayers as any,    events: schema.bobs27Events as any },
  operation: { matches: schema.operationMatches as any,  matchPlayers: schema.operationMatchPlayers as any, events: schema.operationEvents as any },
}

// ============================================================
// Repository Factory
// ============================================================

export function createGameRepository(db: DrizzleDb, tables: GameTableSet) {
  const { matches, matchPlayers, events } = tables

  return {
    /**
     * Get recent matches with player IDs and events.
     */
    async getMatches(options?: { limit?: number; finished?: boolean }): Promise<MatchWithRelations[]> {
      const limit = options?.limit ?? 50

      // 1. Get match rows
      const matchRows = await db
        .select()
        .from(matches)
        .orderBy(desc(matches.createdAt))
        .limit(limit)

      if (matchRows.length === 0) return []

      const matchIds = matchRows.map((m: any) => m.id)

      // 2. Get players for these matches
      const playerRows = await db
        .select()
        .from(matchPlayers)
        .where(inArray(matchPlayers.matchId, matchIds))

      // 3. Get events for these matches
      const eventRows = await db
        .select()
        .from(events)
        .where(inArray(events.matchId, matchIds))
        .orderBy(events.matchId, events.seq)

      // 4. Combine
      const playersByMatch = new Map<string, string[]>()
      for (const p of playerRows) {
        const list = playersByMatch.get(p.matchId) ?? []
        list.push(p.playerId)
        playersByMatch.set(p.matchId, list)
      }

      const eventsByMatch = new Map<string, EventRow[]>()
      for (const e of eventRows) {
        const list = eventsByMatch.get(e.matchId) ?? []
        list.push(e as EventRow)
        eventsByMatch.set(e.matchId, list)
      }

      return matchRows.map((m: any) => ({
        ...m,
        playerIds: playersByMatch.get(m.id) ?? [],
        events: eventsByMatch.get(m.id) ?? [],
      }))
    },

    /**
     * Get a single match by ID with players and events.
     */
    async getMatchById(id: string): Promise<MatchWithRelations | null> {
      const [match] = await db
        .select()
        .from(matches)
        .where(eq(matches.id, id))
        .limit(1)

      if (!match) return null

      const [playerRows, eventRows] = await Promise.all([
        db.select().from(matchPlayers).where(eq(matchPlayers.matchId, id)),
        db.select().from(events).where(eq(events.matchId, id)).orderBy(events.seq),
      ])

      return {
        ...(match as any),
        playerIds: playerRows.map(p => p.playerId),
        events: eventRows as EventRow[],
      }
    },

    /**
     * Save or update a match with its players.
     * Uses INSERT ON CONFLICT UPDATE (upsert).
     */
    async saveMatch(matchData: Record<string, unknown>, players: MatchPlayerRow[]): Promise<void> {
      // Upsert match
      await db
        .insert(matches)
        .values(matchData as any)
        .onConflictDoUpdate({
          target: matches.id,
          set: matchData as any,
        })

      // Replace players: delete + insert
      await db.delete(matchPlayers).where(eq(matchPlayers.matchId, matchData.id as string))
      if (players.length > 0) {
        await db.insert(matchPlayers).values(players as any[])
      }
    },

    /**
     * Update events for a match (replace all).
     */
    async updateEvents(matchId: string, newEvents: EventRow[]): Promise<void> {
      await db.delete(events).where(eq(events.matchId, matchId))
      if (newEvents.length > 0) {
        await db.insert(events).values(newEvents as any[])
      }
    },

    /**
     * Mark a match as finished.
     */
    async finishMatch(matchId: string, finishedAt?: string): Promise<void> {
      await db
        .update(matches)
        .set({
          finished: 1,
          finishedAt: finishedAt ?? new Date().toISOString(),
        } as any)
        .where(eq(matches.id, matchId))
    },

    /**
     * Delete a match and its related data.
     */
    async deleteMatch(matchId: string): Promise<void> {
      await db.delete(events).where(eq(events.matchId, matchId))
      await db.delete(matchPlayers).where(eq(matchPlayers.matchId, matchId))
      await db.delete(matches).where(eq(matches.id, matchId))
    },

    /**
     * Count matches, optionally filtered.
     */
    async countMatches(options?: { since?: string }): Promise<number> {
      const conditions = []
      if (options?.since) {
        conditions.push(sql`${matches.createdAt} > ${options.since}`)
      }

      const result = await db
        .select({ count: sql<number>`count(*)` })
        .from(matches)
        .where(conditions.length > 0 ? and(...conditions) : undefined)

      return result[0]?.count ?? 0
    },
  }
}

// ============================================================
// Convenience: Create all repositories at once
// ============================================================

export function createAllGameRepositories(db: DrizzleDb) {
  const repos = {} as Record<GameMode, ReturnType<typeof createGameRepository>>
  for (const [mode, tables] of Object.entries(GAME_TABLES)) {
    repos[mode as GameMode] = createGameRepository(db, tables)
  }
  return repos
}
