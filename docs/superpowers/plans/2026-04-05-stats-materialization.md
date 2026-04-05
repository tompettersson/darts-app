# Stats Materialization — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace live-computed stats (~80 SQL queries scanning all events on every view) with pre-computed cached stats (1 query per group), recomputed only when a match ends.

**Architecture:** Cache-aside pattern at the stats-group level. After each match, affected stat groups are recomputed for participating players and stored as JSONB in a `player_stats_cache` table. The `useSQLStats` hook reads from cache first, falls back to live computation on cache miss. A one-time backfill computes cache for all existing players on first deploy.

**Tech Stack:** Neon Postgres (JSONB), existing `loadGroup()` for computation, TanStack Query (unchanged), existing `query()`/`queryOne()` from `src/db/index.ts`.

---

## File Structure

**Create:**
- `src/db/stats-cache.ts` — Cache table DDL, read/write, refresh orchestration, backfill

**Modify:**
- `src/db/stats/x01.ts` — Fix 3 Postgres SQL bugs (missing subquery aliases, GROUP BY alias)
- `src/hooks/useSQLStats.ts` — Use `fetchGroupCached()` instead of direct `fetchGroup()`
- `src/storage.ts` — Call `queueStatsRefresh()` from each `finishXxxMatch()` function
- `src/screens/StatsProfile.tsx` — Add "Statistiken werden generiert..." loading state for first-time backfill

---

## Task 1: Fix Postgres SQL Bugs in X01 Stats

These bugs cause `getX01FullStats()` to silently fail (caught by `safe()`, returns null). The cache relies on these functions computing correctly.

**Files:**
- Modify: `src/db/stats/x01.ts:770` (bestLegStats subquery alias)
- Modify: `src/db/stats/x01.ts:952` (legDetails subquery alias)
- Modify: `src/db/stats/x01.ts:841` (topDouble GROUP BY)

- [ ] **Step 1: Fix bestLegStats — missing subquery alias**

In `src/db/stats/x01.ts`, the `bestLegStats` query has `FROM (SELECT ...) ` without an alias. PostgreSQL requires aliases for derived tables in FROM.

Find (around line 770):
```sql
        AND lf.data::jsonb->>'winnerPlayerId' = ?
    )
  `, [playerId, playerId, ...scoreParam, playerId])
```

Replace with:
```sql
        AND lf.data::jsonb->>'winnerPlayerId' = ?
    ) t
  `, [playerId, playerId, ...scoreParam, playerId])
```

- [ ] **Step 2: Fix legDetails — missing subquery alias**

Same pattern, around line 952:

Find:
```sql
        AND lf.data::jsonb->>'winnerPlayerId' = ?
    )
  `, [playerId, playerId, ...scoreParam, playerId])

  // Berechne abgeleitete Werte
```

Replace with:
```sql
        AND lf.data::jsonb->>'winnerPlayerId' = ?
    ) t
  `, [playerId, playerId, ...scoreParam, playerId])

  // Berechne abgeleitete Werte
```

- [ ] **Step 3: Fix topDouble — GROUP BY uses alias that may confuse Postgres**

Find (around line 841):
```sql
    GROUP BY bed
    ORDER BY cnt DESC
```

Replace with:
```sql
    GROUP BY e.data::jsonb->'darts'->((e.data::jsonb->>'finishingDartSeq')::integer - 1)->>'bed'
    ORDER BY cnt DESC
```

- [ ] **Step 4: Commit**

```bash
git add src/db/stats/x01.ts
git commit -m "fix: add missing Postgres subquery aliases in x01 stats queries"
```

---

## Task 2: Create Cache Table and Read/Write Utilities

**Files:**
- Create: `src/db/stats-cache.ts`

- [ ] **Step 1: Create `src/db/stats-cache.ts` with table DDL and CRUD**

```typescript
// src/db/stats-cache.ts
// Materialized stats cache — stores pre-computed stats per player per group as JSONB.
// Written after each match end, read by useSQLStats hook.

import { exec, queryOne } from './index'

// ============================================================================
// Table Setup
// ============================================================================

const TABLE_DDL = `
CREATE TABLE IF NOT EXISTS player_stats_cache (
  player_id TEXT NOT NULL,
  stat_group TEXT NOT NULL,
  data JSONB NOT NULL DEFAULT '{}',
  computed_at TEXT NOT NULL,
  PRIMARY KEY (player_id, stat_group)
)`

let tableReady = false

export async function ensureCacheTable(): Promise<void> {
  if (tableReady) return
  await exec(TABLE_DDL)
  tableReady = true
}

// ============================================================================
// Read / Write
// ============================================================================

export async function getCachedGroup<T = Record<string, unknown>>(
  playerId: string,
  group: string
): Promise<T | null> {
  await ensureCacheTable()
  const row = await queryOne<{ data: T }>(
    'SELECT data FROM player_stats_cache WHERE player_id = ? AND stat_group = ?',
    [playerId, group]
  )
  return row?.data ?? null
}

export async function setCachedGroup(
  playerId: string,
  group: string,
  data: unknown
): Promise<void> {
  await ensureCacheTable()
  const now = new Date().toISOString()
  await exec(
    `INSERT INTO player_stats_cache (player_id, stat_group, data, computed_at)
     VALUES (?, ?, ?::jsonb, ?)
     ON CONFLICT (player_id, stat_group)
     DO UPDATE SET data = EXCLUDED.data, computed_at = EXCLUDED.computed_at`,
    [playerId, group, JSON.stringify(data), now]
  )
}

export async function invalidatePlayerCache(playerId: string): Promise<void> {
  await ensureCacheTable()
  await exec('DELETE FROM player_stats_cache WHERE player_id = ?', [playerId])
}
```

- [ ] **Step 2: Commit**

```bash
git add src/db/stats-cache.ts
git commit -m "feat: add player_stats_cache table and read/write utilities"
```

---

## Task 3: Add Refresh Orchestration

After a match ends, we need to recompute the affected stat groups for each participating player. This task adds the logic that maps game types to groups and triggers recomputation.

**Files:**
- Modify: `src/db/stats-cache.ts` (append refresh functions)

- [ ] **Step 1: Add refresh functions to `src/db/stats-cache.ts`**

Append to end of file:

```typescript
// ============================================================================
// Refresh (recompute and cache)
// ============================================================================

type LoadGroupFn = (pid: string, group: string, out: Record<string, unknown>) => Promise<void>

/**
 * Which stat groups to refresh when a specific game type finishes.
 * 'core' contains general cross-game stats, so it's refreshed for every game type.
 */
const GROUPS_BY_GAME_TYPE: Record<string, string[]> = {
  x01:        ['core', 'x01variants', 'x01detail', 'insights', 'playerinsights', 'achievements'],
  cricket:    ['core', 'cricket', 'insights', 'playerinsights', 'achievements'],
  atb:        ['core', 'achievements'],
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
 * Runs in background — errors are logged but don't block the caller.
 */
export async function refreshPlayerStatsAfterMatch(
  playerId: string,
  gameType: string,
  loadGroupFn: LoadGroupFn
): Promise<void> {
  const groups = GROUPS_BY_GAME_TYPE[gameType] ?? ['core']

  for (const group of groups) {
    try {
      const partial: Record<string, unknown> = {}
      await loadGroupFn(playerId, group, partial)
      await setCachedGroup(playerId, group, partial)
    } catch (err) {
      console.warn(`[StatsCache] Failed to refresh ${group} for ${playerId}:`, err)
    }
  }
}

/**
 * Queue stats refresh for all players in a match.
 * Non-blocking — fires and forgets.
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
}
```

- [ ] **Step 2: Commit**

```bash
git add src/db/stats-cache.ts
git commit -m "feat: add stats refresh orchestration per game type"
```

---

## Task 4: Export loadGroup From useSQLStats

The `loadGroup` function is currently a private module-level function inside `useSQLStats.ts`. We need it accessible for the stats refresh logic.

**Files:**
- Modify: `src/hooks/useSQLStats.ts`

- [ ] **Step 1: Export `loadGroup`**

In `src/hooks/useSQLStats.ts`, find (around line 349):
```typescript
/** Load a specific data group */
async function loadGroup(pid: string, group: string, out: Partial<SQLStatsData>): Promise<void> {
```

Replace with:
```typescript
/** Load a specific data group — exported for stats cache refresh */
export async function loadGroup(pid: string, group: string, out: Partial<SQLStatsData>): Promise<void> {
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/useSQLStats.ts
git commit -m "refactor: export loadGroup for stats cache refresh"
```

---

## Task 5: Hook Stats Refresh Into All Finish Functions

Each `finishXxxMatch()` function in `src/storage.ts` needs to trigger a background stats refresh for all participating players.

**Files:**
- Modify: `src/storage.ts`

- [ ] **Step 1: Add imports at top of `src/storage.ts`**

Add near the existing imports:
```typescript
import { queueStatsRefresh } from './db/stats-cache'
import { loadGroup } from './hooks/useSQLStats'
```

- [ ] **Step 2: Hook into `finishMatch()` (X01)**

In `finishMatch()` (around line 808), before the `return new Promise` block, add:

```typescript
  // Refresh materialized stats for all players in this match
  const matchForStats = list[idx]
  const startEvt = matchForStats.events.find((e: DartsEvent) => e.type === 'MatchStarted')
  const playerIds = (startEvt as MatchStarted)?.playerIds ?? []
  if (playerIds.length > 0) {
    queueStatsRefresh(playerIds, 'x01', loadGroup)
  }
```

- [ ] **Step 3: Hook into `finishCricketMatch()`**

Find the end of `finishCricketMatch()` before its `return new Promise` block. Add:

```typescript
  // Refresh materialized stats
  const cricketMatchForStats = cricketList[idx]
  const cricketPlayerIds = cricketMatchForStats.players?.map((p: { id: string }) => p.id) ?? []
  if (cricketPlayerIds.length > 0) {
    queueStatsRefresh(cricketPlayerIds, 'cricket', loadGroup)
  }
```

- [ ] **Step 4: Hook into remaining 8 finish functions**

Apply the same pattern to each finish function. The player ID extraction differs per game mode — check the match object structure for each:

- X01: `events[0].playerIds` (from MatchStarted event)
- Cricket: `match.players[].id`
- ATB/Str/CTF/Shanghai/Highscore/Killer/Bobs27/Operation: Check each match object for `playerIds` array or `players` array

For each, add before the `return new Promise` block:
```typescript
  const pIds = /* extract player IDs from match object */
  if (pIds.length > 0) {
    queueStatsRefresh(pIds, '<gameType>', loadGroup)
  }
```

Where `<gameType>` matches the keys in `GROUPS_BY_GAME_TYPE`: `'atb'`, `'str'`, `'ctf'`, `'shanghai'`, `'killer'`, `'bobs27'`, `'operation'`, `'highscore'`.

- [ ] **Step 5: Commit**

```bash
git add src/storage.ts
git commit -m "feat: trigger background stats refresh after every match end"
```

---

## Task 6: Update useSQLStats Read Path to Use Cache

Replace direct `fetchGroup()` with a cached version that reads from `player_stats_cache` first, falls back to live computation on cache miss.

**Files:**
- Modify: `src/hooks/useSQLStats.ts`

- [ ] **Step 1: Add cache-aware fetch function**

In `src/hooks/useSQLStats.ts`, find the existing `fetchGroup`:

```typescript
/** Fetch function for a single stats group */
async function fetchGroup(playerId: string, group: string): Promise<Partial<SQLStatsData>> {
  const partial: Partial<SQLStatsData> = {}
  await loadGroup(playerId, group, partial)
  return partial
}
```

Replace with:

```typescript
import { getCachedGroup, setCachedGroup } from '../db/stats-cache'

/** Track which players are being backfilled to avoid duplicate runs */
const backfillInProgress = new Set<string>()

/** Fetch function for a single stats group — reads from cache, falls back to live computation */
async function fetchGroup(playerId: string, group: string): Promise<Partial<SQLStatsData>> {
  // Try cache first
  const cached = await getCachedGroup<Partial<SQLStatsData>>(playerId, group)
  if (cached && Object.keys(cached).length > 0) {
    return cached
  }

  // Cache miss: compute live, store in cache for next time
  const partial: Partial<SQLStatsData> = {}
  await loadGroup(playerId, group, partial)

  // Store in background (don't block the UI)
  setCachedGroup(playerId, group, partial).catch(() => {})

  // Trigger full backfill for this player (once) so all groups are cached
  if (!backfillInProgress.has(playerId)) {
    backfillInProgress.add(playerId)
    backfillPlayerStats(playerId, loadGroup)
      .catch(() => {})
      .finally(() => backfillInProgress.delete(playerId))
  }

  return partial
}
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/useSQLStats.ts
git commit -m "feat: read stats from cache, fall back to live computation on miss"
```

---

## Task 7: Add Backfill Function

On first deploy, the cache is empty. The backfill computes stats for all groups when a player's stats are first viewed.

**Files:**
- Modify: `src/db/stats-cache.ts` (append backfill function)

- [ ] **Step 1: Add backfill function to `src/db/stats-cache.ts`**

Append:

```typescript
// ============================================================================
// Backfill (one-time for existing players)
// ============================================================================

/**
 * Backfill all stat groups for a single player.
 * Called on first stats view when cache is empty.
 */
export async function backfillPlayerStats(
  playerId: string,
  loadGroupFn: LoadGroupFn
): Promise<void> {
  const ALL_GROUPS = ['core', 'x01variants', 'x01detail', 'cricket', 'minigames',
                      'insights', 'playerinsights', 'achievements']

  for (const group of ALL_GROUPS) {
    try {
      // Skip groups that are already cached
      const existing = await getCachedGroup(playerId, group)
      if (existing && Object.keys(existing).length > 0) continue

      const partial: Record<string, unknown> = {}
      await loadGroupFn(playerId, group, partial)
      await setCachedGroup(playerId, group, partial)
    } catch (err) {
      console.warn(`[StatsCache] Backfill failed for ${playerId}/${group}:`, err)
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/db/stats-cache.ts
git commit -m "feat: add backfill function for first-time stats cache population"
```

---

## Task 8: Add Cache Invalidation on TanStack Query

After a match ends and the cache is refreshed, TanStack Query needs to pick up the new data on next stats visit.

**Files:**
- Modify: `src/storage.ts`

- [ ] **Step 1: Invalidate TanStack Query cache after stats refresh**

In `src/storage.ts`, add import:

```typescript
import { queryClient } from './queryClient'
```

Then in `finishMatch()` (and all other finish functions), after the `queueStatsRefresh` call, add:

```typescript
  // Invalidate TanStack Query cache so stats reload from updated cache on next visit
  for (const pid of playerIds) {
    queryClient.invalidateQueries({ queryKey: ['stats', pid] })
  }
```

- [ ] **Step 2: Commit**

```bash
git add src/storage.ts
git commit -m "feat: invalidate TanStack Query stats cache after match end"
```

---

## Task 9: Build Verification and Deploy

- [ ] **Step 1: Build and verify no TypeScript errors**

Run: `npm run build`
Expected: Clean build, no errors.

- [ ] **Step 2: Manual test flow**

1. Open app, go to Stats for any player
2. First load: should compute live and populate cache (slightly slow, one-time)
3. Close and reopen stats: should load near-instantly (from cache)
4. Play a match and finish it
5. Open stats: should show updated numbers

- [ ] **Step 3: Final commit and push**

```bash
git push origin main
```

---

## Performance Impact Summary

| Metric | Before | After |
|--------|--------|-------|
| Stats screen load | ~80 SQL queries scanning events | 1-2 cached reads from JSONB |
| First load (new player) | ~80 queries | ~80 queries + cache write (one-time) |
| After match ends | Nothing | Background refresh (non-blocking) |
| Data freshness | Always live | Updated after each match |

## Future Improvements (not in this plan)

- **Incremental updates**: Instead of recomputing all stats from events after each match, compute only the delta from the single match. Reduces match-end computation from O(all_events) to O(match_events).
- **Per-score-variant refresh**: Only refresh x01_301 stats when a 301 match ends, not all variants.
- **Leaderboard materialization**: Similar cache pattern for cross-player leaderboards.
