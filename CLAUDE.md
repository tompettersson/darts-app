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
