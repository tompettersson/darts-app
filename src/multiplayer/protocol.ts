// src/multiplayer/protocol.ts
// Shared protocol types for PartyKit multiplayer communication.
// Used by both server (party/) and client (src/) code.

import type { DartsEvent, PlayerRef } from '../darts501'

// ---- Client → Server Messages ----

/** Host creates the match room with initial setup */
export type CreateRoomMsg = {
  type: 'create-room'
  matchId: string
  gameType: 'x01'
  hostPlayer: PlayerRef
  /** Initial events (MatchStarted, LegStarted) */
  events: DartsEvent[]
}

/** Guest joins an existing room */
export type JoinRoomMsg = {
  type: 'join-room'
  matchId: string
  player: PlayerRef
}

/** Player submits new events (VisitAdded, LegFinished, etc.) */
export type SubmitEventsMsg = {
  type: 'submit-events'
  events: DartsEvent[]
}

/** Player sends undo (removes last visit) */
export type UndoMsg = {
  type: 'undo'
  /** How many events to remove from the end */
  removeCount: number
}

/** Player signals ready in lobby */
export type PlayerReadyMsg = {
  type: 'player-ready'
  playerId: string
}

/** Request full state sync (for reconnect) */
export type SyncRequestMsg = {
  type: 'sync-request'
}

export type ClientMessage =
  | CreateRoomMsg
  | JoinRoomMsg
  | SubmitEventsMsg
  | UndoMsg
  | PlayerReadyMsg
  | SyncRequestMsg

// ---- Server → Client Messages ----

/** Full state sync (on connect/reconnect) */
export type SyncMsg = {
  type: 'sync'
  events: DartsEvent[]
  players: RoomPlayer[]
  phase: RoomPhase
}

/** New events broadcast to all clients */
export type EventsBroadcastMsg = {
  type: 'events'
  events: DartsEvent[]
  /** Index in the full event log where these events start */
  fromIndex: number
}

/** Undo broadcast: event log truncated */
export type UndoBroadcastMsg = {
  type: 'undo'
  /** New total event count after undo */
  eventCount: number
  events: DartsEvent[]
}

/** Player joined/left/ready update */
export type PlayersUpdateMsg = {
  type: 'players-update'
  players: RoomPlayer[]
}

/** Room phase changed */
export type PhaseChangeMsg = {
  type: 'phase-change'
  phase: RoomPhase
}

/** Error from server */
export type ErrorMsg = {
  type: 'error'
  message: string
  code?: string
}

export type ServerMessage =
  | SyncMsg
  | EventsBroadcastMsg
  | UndoBroadcastMsg
  | PlayersUpdateMsg
  | PhaseChangeMsg
  | ErrorMsg

// ---- Shared Types ----

export type RoomPhase = 'lobby' | 'playing' | 'finished'

export type RoomPlayer = {
  playerId: string
  name: string
  color?: string
  isHost: boolean
  isReady: boolean
  connected: boolean
}

/** Generate a short room code (6 chars, uppercase alphanumeric) */
export function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no I,O,0,1 to avoid confusion
  let code = ''
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
}
