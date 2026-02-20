// src/multiplayer/index.ts
// Re-exports for multiplayer module

export { useMultiplayerRoom } from './useMultiplayerRoom'
export type { MultiplayerState, MultiplayerActions, ConnectionStatus } from './useMultiplayerRoom'
export { default as MultiplayerLobby } from './MultiplayerLobby'
export { default as ConnectionBadge } from './ConnectionBadge'
export { generateRoomCode } from './protocol'
export type { RoomPlayer, RoomPhase, ClientMessage, ServerMessage } from './protocol'
