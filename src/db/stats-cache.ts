// src/db/stats-cache.ts
// Materialized stats cache — read/write utilities for player_stats_cache table

import { exec, queryOne } from './index'

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
  await ensureCacheTable()
  const row = await queryOne<{ data: T }>(
    'SELECT data FROM player_stats_cache WHERE player_id = ? AND stat_group = ?',
    [playerId, group]
  )
  return row?.data ?? null
}

// ============================================================================
// Write
// ============================================================================

export async function setCachedGroup(playerId: string, group: string, data: unknown): Promise<void> {
  await ensureCacheTable()
  await exec(
    `INSERT INTO player_stats_cache (player_id, stat_group, data, computed_at)
     VALUES (?, ?, ?::jsonb, ?)
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
