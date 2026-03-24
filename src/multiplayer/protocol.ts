// src/multiplayer/protocol.ts
// Shared protocol types for PartyKit multiplayer communication.
// Used by both server (party/) and client (src/) code.

import type { PlayerRef } from '../darts501'

// ---- Game Configuration ----

/** Full game configuration, set by the host in the lobby */
export type GameConfig = {
  gameType: 'x01' | 'cricket' | 'atb' | 'ctf' | 'str' | 'highscore' | 'shanghai' | 'killer' | 'bobs27' | 'operation'

  // X01
  startScore?: number           // 501, 301, 121, etc.
  outRule?: string               // 'double-out', 'straight-out', etc.
  inRule?: string                // 'double-in', 'straight-in', etc.
  bestOfLegs?: number
  bestOfSets?: number
  structureKind?: 'legs' | 'sets'

  // Cricket
  cricketRange?: 'short' | 'long'
  cricketStyle?: 'standard' | 'cutthroat' | 'simple' | 'crazy'
  cricketCrazyMode?: 'normal' | 'pro'
  cricketCrazyScoringMode?: 'simple' | 'standard' | 'cutthroat'
  cricketLegs?: number

  // ATB
  atbMode?: string
  atbDirection?: string
  atbLives?: number
  atbLegs?: number

  // CTF
  ctfRounds?: number
  ctfLegs?: number

  // Sträußchen
  strRingMode?: 'triple' | 'double'
  strLegs?: number

  // Highscore
  highscoreRounds?: number
  highscoreLegs?: number

  // Shanghai
  shanghaiLegs?: number

  // Killer
  killerLives?: number
  killerLegs?: number
  killerSets?: number

  // Bobs 27
  bobs27Legs?: number

  // Operation
  operationRounds?: number
  operationLegs?: number
}

// ---- Player Order ----

export type PlayerOrder = 'manual' | 'random'

// ---- Client → Server Messages ----

/** Host creates the room (no game config yet, just the room) */
export type CreateRoomMsg = {
  type: 'create-room'
  hostPlayer: PlayerRef
}

/** Guest joins an existing room */
export type JoinRoomMsg = {
  type: 'join-room'
  player: PlayerRef
}

/** Device adds local players to the room */
export type AddLocalPlayersMsg = {
  type: 'add-local-players'
  players: PlayerRef[]
}

/** Remove a player from the room */
export type RemovePlayerMsg = {
  type: 'remove-player'
  playerId: string
}

/** Host sets/updates the game configuration */
export type SetGameConfigMsg = {
  type: 'set-game-config'
  config: GameConfig
}

/** Host sets player order */
export type SetPlayerOrderMsg = {
  type: 'set-player-order'
  playerIds: string[]    // Ordered list of player IDs
  orderType: PlayerOrder // 'manual' or 'random'
}

/** Host starts the game (sends initial match events) */
export type StartGameMsg = {
  type: 'start-game'
  matchId: string
  gameType: string
  events: any[]          // Initial events (MatchStarted, LegStarted, etc.)
}

/** Player submits new events (VisitAdded, LegFinished, etc.) */
export type SubmitEventsMsg = {
  type: 'submit-events'
  events: any[]
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
  | AddLocalPlayersMsg
  | RemovePlayerMsg
  | SetGameConfigMsg
  | SetPlayerOrderMsg
  | StartGameMsg
  | SubmitEventsMsg
  | UndoMsg
  | PlayerReadyMsg
  | SyncRequestMsg

// ---- Server → Client Messages ----

/** Full state sync (on connect/reconnect) */
export type SyncMsg = {
  type: 'sync'
  events: any[]
  players: RoomPlayer[]
  phase: RoomPhase
  gameConfig: GameConfig | null
  playerOrder: string[]       // Ordered player IDs
  orderType: PlayerOrder
}

/** New events broadcast to all clients */
export type EventsBroadcastMsg = {
  type: 'events'
  events: any[]
  /** Index in the full event log where these events start */
  fromIndex: number
}

/** Undo broadcast: event log truncated */
export type UndoBroadcastMsg = {
  type: 'undo'
  /** New total event count after undo */
  eventCount: number
  events: any[]
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

/** Game config updated by host */
export type GameConfigUpdateMsg = {
  type: 'game-config-update'
  config: GameConfig
}

/** Player order updated */
export type PlayerOrderUpdateMsg = {
  type: 'player-order-update'
  playerIds: string[]
  orderType: PlayerOrder
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
  | GameConfigUpdateMsg
  | PlayerOrderUpdateMsg
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
  deviceId: string    // Which WebSocket connection owns this player
  isLocal: boolean    // True if this player was added as a local player (not the connection owner)
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
