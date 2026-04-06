# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Local-first Darts game engine (X01 and Cricket) built with React + TypeScript + Vite. Supports offline play with LocalStorage persistence, player profiles, match history, and comprehensive statistics.

## Commands

```bash
npm run dev      # Start Vite dev server
npm run build    # TypeScript compile + Vite build
npm test         # Run Vitest tests
npm run test:ui  # Run tests with UI dashboard
npm run server   # Start Express backend (minimal)
```

## Architecture

### Game Engines (Event-Sourced)

Both game modes use an immutable event log with derived state:

- **X01 Engine** (`src/darts501.ts`) - 501/301/121 rules, checkout route calculation, double-in/out variants
  - Events: `MatchStarted`, `LegStarted`, `VisitAdded`, `LegFinished`, `MatchFinished`

- **Cricket Engine** (`src/dartsCricket.ts`) - Short/Long variants, Standard/Cutthroat styles
  - Events: `CricketMatchStarted`, `CricketTurnAdded`, `CricketLegFinished`, `CricketMatchFinished`

### Storage Layer (`src/storage.ts`)

Central persistence module handling:
- Match state derivation from event logs
- Player profiles and career stats
- Leaderboards and match history
- Backup/restore with merge functionality

All data persisted to LocalStorage (offline-first design).

### UI Structure

- **Entry**: `src/main.tsx` → `src/App.tsx` (view controller)
- **Screens** (`src/screens/`): Game UIs, setup wizards, stats dashboards, profile management
- **Components** (`src/components/`): Reusable scoreboard, player cards, cricket sheet
- **Design System** (`src/ui.ts`): Centralized shadows, spacing, colors

### Statistics (`src/stats/`)

- `computeX01PlayerMatchStats.ts` - Per-match X01 stats (averages, checkout %, doubles)
- `computeCricketStats.ts` - Per-match cricket stats (marks, MPR, strongest field)
- `x01/` - Long-term player stat aggregation

## Key Patterns

- **Event sourcing**: Game state computed from immutable event logs, not mutated directly
- **Offline queue** (`src/outbox.ts`): Match uploads queued with exponential backoff
- **Type-first**: Shared interfaces in `src/types/` for stats and cricket types

## Stats Materialization (player_stats_cache)

Spieler-Statistiken werden **nicht live** aus Events berechnet, sondern aus dem Cache gelesen (`player_stats_cache` Tabelle, JSONB). Der Cache wird nach jedem Spielende im Hintergrund aktualisiert (`queueStatsRefresh` in `storage.ts`). Highscores sind ebenfalls gecacht (globaler Eintrag `_global/highscores`).

- Cache-Logik: `src/db/stats-cache.ts`
- Read-Path: `src/hooks/useSQLStats.ts` → `getCachedGroups()` → Fallback auf Live-Berechnung
- Write-Path: Alle `finishXxxMatch()` in `storage.ts` → `queueStatsRefresh()`
- JSONB-Parameter: Immer `?::text::jsonb` verwenden (nicht `?::jsonb`, sonst wird String statt Objekt gespeichert)

## Geplante Optimierungen

- **Startup Lazy Loading** (`docs/startup-optimization.md`): Phase 2 Match-Loading durch leichtgewichtigen Open-Match-Check ersetzen. Aktuell werden ~30 DB-Queries beim Start gemacht, nur um zu prüfen ob ein offenes Spiel existiert. Ziel: 1 Query statt 30.
