// src/db/stats-cache.ts
// Materialized stats cache — read/write utilities for player_stats_cache table

import { exec, query, queryOne } from './index'

// ============================================================================
// Table DDL
// ============================================================================

const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS player_stats_cache (
    player_id   TEXT NOT NULL,
    stat_group  TEXT NOT NULL,
    data        JSONB NOT NULL DEFAULT '{}',
    computed_at TEXT NOT NULL,
    PRIMARY KEY (player_id, stat_group)
  )
`

// ============================================================================
// Table Initialization
// ============================================================================

let tableReady = false

export async function ensureCacheTable(): Promise<void> {
  if (tableReady) return
  await exec(CREATE_TABLE_SQL)
  tableReady = true
}

// ============================================================================
// Read
// ============================================================================

export async function getCachedGroup<T>(playerId: string, group: string): Promise<T | null> {
  const row = await queryOne<{ data: T }>(
    'SELECT data FROM player_stats_cache WHERE player_id = ? AND stat_group = ?',
    [playerId, group]
  )
  return row?.data ?? null
}

/**
 * Load multiple stat groups for a player in a single query.
 * Returns a map: group → data. Missing groups are not in the map.
 */
export async function getCachedGroups<T>(playerId: string, groups: string[]): Promise<Map<string, T>> {
  if (groups.length === 0) return new Map()

  // Build IN clause with positional params: $2, $3, $4, ...
  const placeholders = groups.map(() => '?').join(', ')
  const rows = await query<{ stat_group: string; data: T }>(
    `SELECT stat_group, data FROM player_stats_cache WHERE player_id = ? AND stat_group IN (${placeholders})`,
    [playerId, ...groups]
  )

  const map = new Map<string, T>()
  for (const row of rows) {
    if (row.data && typeof row.data === 'object') {
      map.set(row.stat_group, row.data)
    }
  }
  return map
}

// ============================================================================
// Write
// ============================================================================

export async function setCachedGroup(playerId: string, group: string, data: unknown): Promise<void> {
  await ensureCacheTable()
  await exec(
    `INSERT INTO player_stats_cache (player_id, stat_group, data, computed_at)
     VALUES (?, ?, ?::text::jsonb, ?)
     ON CONFLICT (player_id, stat_group) DO UPDATE
       SET data        = EXCLUDED.data,
           computed_at = EXCLUDED.computed_at`,
    [playerId, group, JSON.stringify(data), new Date().toISOString()]
  )
}

// ============================================================================
// Invalidation
// ============================================================================

export async function invalidatePlayerCache(playerId: string): Promise<void> {
  await ensureCacheTable()
  await exec(
    'DELETE FROM player_stats_cache WHERE player_id = ?',
    [playerId]
  )
}

// ============================================================================
// Refresh Orchestration
// ============================================================================

type LoadGroupFn = (pid: string, group: string, out: Record<string, unknown>) => Promise<void>

/**
 * Which stat groups to refresh when a specific game type finishes.
 * 'core' contains general cross-game stats — refreshed for every game type.
 */
const GROUPS_BY_GAME_TYPE: Record<string, string[]> = {
  x01:        ['core', 'x01variants', 'x01detail', 'insights', 'playerinsights', 'achievements'],
  cricket:    ['core', 'cricket', 'insights', 'playerinsights', 'achievements'],
  atb:        ['core', 'atbvariants', 'achievements'],
  str:        ['core'],
  ctf:        ['core'],
  shanghai:   ['core'],
  killer:     ['core', 'minigames'],
  bobs27:     ['core', 'minigames', 'achievements'],
  operation:  ['core', 'minigames'],
  highscore:  ['core'],
}

/**
 * Recompute and cache stats for a player after a match ends.
 * Errors are logged but don't block the caller.
 */
export async function refreshPlayerStatsAfterMatch(
  playerId: string,
  gameType: string,
  loadGroupFn: LoadGroupFn
): Promise<void> {
  const groups = GROUPS_BY_GAME_TYPE[gameType] ?? ['core']

  // Run all groups in parallel — allows DataLoader batching (5ms window)
  // to combine queries from different groups into fewer HTTP requests
  await Promise.all(groups.map(async (group) => {
    try {
      const partial: Record<string, unknown> = {}
      await loadGroupFn(playerId, group, partial)
      await setCachedGroup(playerId, group, partial)
    } catch (err) {
      console.warn(`[StatsCache] Failed to refresh ${group} for ${playerId}:`, err)
    }
  }))
}

/**
 * Queue stats refresh for all players in a match.
 * Non-blocking — fires and forgets.
 * Also invalidates global highscores cache.
 */
export function queueStatsRefresh(
  playerIds: string[],
  gameType: string,
  loadGroupFn: LoadGroupFn
): void {
  for (const pid of playerIds) {
    refreshPlayerStatsAfterMatch(pid, gameType, loadGroupFn).catch((err) =>
      console.warn(`[StatsCache] Background refresh failed for ${pid}:`, err)
    )
  }
  // Invalidate global highscores cache (will be recomputed on next HallOfFame visit)
  exec('DELETE FROM player_stats_cache WHERE player_id = ? AND stat_group = ?',
    ['_global', 'highscores']
  ).catch(() => {})
}

// ============================================================================
// Backfill (one-time for existing players)
// ============================================================================

const ALL_GROUPS = ['core', 'x01variants', 'x01detail', 'cricket', 'minigames',
                    'insights', 'playerinsights', 'atbvariants', 'achievements']

/**
 * Backfill all stat groups for a single player.
 * Called on first stats view when cache is empty.
 * Skips groups that are already cached.
 */
export async function backfillPlayerStats(
  playerId: string,
  loadGroupFn: LoadGroupFn
): Promise<void> {
  for (const group of ALL_GROUPS) {
    try {
      const existing = await getCachedGroup(playerId, group)
      if (existing && typeof existing === 'object' && Object.keys(existing).length > 0) continue

      const partial: Record<string, unknown> = {}
      await loadGroupFn(playerId, group, partial)
      await setCachedGroup(playerId, group, partial)
    } catch (err) {
      console.warn(`[StatsCache] Backfill failed for ${playerId}/${group}:`, err)
    }
  }
}
