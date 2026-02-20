// party/match-room.ts
// PartyKit server for real-time darts multiplayer.
// Each room = one match. Events are stored in Durable Storage.

import type {
  ClientMessage,
  ServerMessage,
  RoomPlayer,
  RoomPhase,
  SyncMsg,
  EventsBroadcastMsg,
  UndoBroadcastMsg,
  PlayersUpdateMsg,
  PhaseChangeMsg,
  ErrorMsg,
} from '../src/multiplayer/protocol'

// PartyKit types (runtime provided)
type Party = {
  id: string
  storage: {
    get<T>(key: string): Promise<T | undefined>
    put<T>(key: string, value: T): Promise<void>
    delete(key: string): Promise<boolean>
  }
}

type Connection = {
  id: string
  send(data: string): void
  setState(state: unknown): void
  state: unknown
}

type ConnectionContext = {
  request: Request
}

// Connection state: which player is this connection?
type ConnState = { playerId: string }

// Room state (in memory, backed by Durable Storage)
type RoomState = {
  events: unknown[] // DartsEvent[] - stored as unknown to avoid importing darts501 in party server
  players: RoomPlayer[]
  phase: RoomPhase
  matchId: string
  gameType: string
  createdAt: number
}

function send(ws: Connection, msg: ServerMessage) {
  ws.send(JSON.stringify(msg))
}

function broadcast(connections: Connection[], msg: ServerMessage, exclude?: string) {
  const data = JSON.stringify(msg)
  for (const ws of connections) {
    if (exclude && ws.id === exclude) continue
    ws.send(data)
  }
}

export default class MatchRoom {
  state: RoomState = {
    events: [],
    players: [],
    phase: 'lobby',
    matchId: '',
    gameType: 'x01',
    createdAt: Date.now(),
  }

  party: Party
  connections: Map<string, Connection> = new Map()

  constructor(party: Party) {
    this.party = party
  }

  async onStart() {
    // Load state from Durable Storage on room startup
    const saved = await this.party.storage.get<RoomState>('room')
    if (saved) {
      this.state = saved
      // Mark all players as disconnected on startup
      for (const p of this.state.players) {
        p.connected = false
      }
    }
  }

  async onConnect(ws: Connection, ctx: ConnectionContext) {
    this.connections.set(ws.id, ws)

    // New connection gets a sync if room is initialized
    if (this.state.matchId) {
      const syncMsg: SyncMsg = {
        type: 'sync',
        events: this.state.events as any,
        players: this.state.players,
        phase: this.state.phase,
      }
      send(ws, syncMsg)
    }
  }

  onClose(ws: Connection) {
    this.connections.delete(ws.id)
    const connState = ws.state as ConnState | null
    if (connState?.playerId) {
      const player = this.state.players.find(p => p.playerId === connState.playerId)
      if (player) {
        player.connected = false
        this.broadcastPlayers()
        this.save()
      }
    }
  }

  onError(ws: Connection) {
    this.onClose(ws)
  }

  async onMessage(ws: Connection, rawMessage: string) {
    let msg: ClientMessage
    try {
      msg = JSON.parse(rawMessage)
    } catch {
      send(ws, { type: 'error', message: 'Invalid JSON' })
      return
    }

    switch (msg.type) {
      case 'create-room':
        this.handleCreateRoom(ws, msg)
        break
      case 'join-room':
        this.handleJoinRoom(ws, msg)
        break
      case 'submit-events':
        this.handleSubmitEvents(ws, msg)
        break
      case 'undo':
        this.handleUndo(ws, msg)
        break
      case 'player-ready':
        this.handlePlayerReady(ws, msg)
        break
      case 'sync-request':
        this.handleSyncRequest(ws)
        break
      default:
        send(ws, { type: 'error', message: `Unknown message type` })
    }
  }

  // ---- Handlers ----

  private handleCreateRoom(ws: Connection, msg: ClientMessage & { type: 'create-room' }) {
    if (this.state.matchId) {
      send(ws, { type: 'error', message: 'Room already created', code: 'ROOM_EXISTS' })
      return
    }

    const hostPlayer: RoomPlayer = {
      playerId: msg.hostPlayer.playerId,
      name: msg.hostPlayer.name ?? msg.hostPlayer.playerId,
      color: msg.hostPlayer.color,
      isHost: true,
      isReady: true,
      connected: true,
    }

    this.state = {
      events: msg.events,
      players: [hostPlayer],
      phase: 'lobby',
      matchId: msg.matchId,
      gameType: msg.gameType,
      createdAt: Date.now(),
    }

    ws.setState({ playerId: hostPlayer.playerId } satisfies ConnState)

    const syncMsg: SyncMsg = {
      type: 'sync',
      events: this.state.events as any,
      players: this.state.players,
      phase: this.state.phase,
    }
    send(ws, syncMsg)

    this.save()
  }

  private handleJoinRoom(ws: Connection, msg: ClientMessage & { type: 'join-room' }) {
    if (!this.state.matchId) {
      send(ws, { type: 'error', message: 'Room not found', code: 'NO_ROOM' })
      return
    }

    const existing = this.state.players.find(p => p.playerId === msg.player.playerId)
    if (existing) {
      // Reconnect
      existing.connected = true
      ws.setState({ playerId: existing.playerId } satisfies ConnState)
    } else {
      // New player joining
      if (this.state.phase !== 'lobby') {
        send(ws, { type: 'error', message: 'Game already started', code: 'GAME_STARTED' })
        return
      }

      const newPlayer: RoomPlayer = {
        playerId: msg.player.playerId,
        name: msg.player.name ?? msg.player.playerId,
        color: msg.player.color,
        isHost: false,
        isReady: false,
        connected: true,
      }
      this.state.players.push(newPlayer)
      ws.setState({ playerId: newPlayer.playerId } satisfies ConnState)
    }

    // Send full sync to the joining player
    const syncMsg: SyncMsg = {
      type: 'sync',
      events: this.state.events as any,
      players: this.state.players,
      phase: this.state.phase,
    }
    send(ws, syncMsg)

    // Broadcast updated player list to everyone else
    this.broadcastPlayers()
    this.save()
  }

  private handleSubmitEvents(ws: Connection, msg: ClientMessage & { type: 'submit-events' }) {
    if (this.state.phase === 'lobby') {
      // Transition to playing on first events after lobby
      this.state.phase = 'playing'
      this.broadcastPhase()
    }

    const fromIndex = this.state.events.length
    this.state.events.push(...msg.events)

    // Check if match is finished
    const lastEvent = msg.events[msg.events.length - 1] as any
    if (lastEvent?.type === 'MatchFinished') {
      this.state.phase = 'finished'
      this.broadcastPhase()
    }

    // Broadcast new events to all clients (including sender for confirmation)
    const broadcastMsg: EventsBroadcastMsg = {
      type: 'events',
      events: msg.events as any,
      fromIndex,
    }
    broadcast(Array.from(this.connections.values()), broadcastMsg)

    this.save()
  }

  private handleUndo(ws: Connection, msg: ClientMessage & { type: 'undo' }) {
    if (msg.removeCount <= 0 || msg.removeCount > this.state.events.length) {
      send(ws, { type: 'error', message: 'Invalid undo count' })
      return
    }

    this.state.events = this.state.events.slice(0, -msg.removeCount)

    const undoMsg: UndoBroadcastMsg = {
      type: 'undo',
      eventCount: this.state.events.length,
      events: this.state.events as any,
    }
    broadcast(Array.from(this.connections.values()), undoMsg)

    this.save()
  }

  private handlePlayerReady(ws: Connection, msg: ClientMessage & { type: 'player-ready' }) {
    const player = this.state.players.find(p => p.playerId === msg.playerId)
    if (player) {
      player.isReady = true
      this.broadcastPlayers()

      // Check if all players are ready → start game
      const allReady = this.state.players.length >= 2 && this.state.players.every(p => p.isReady)
      if (allReady && this.state.phase === 'lobby') {
        this.state.phase = 'playing'
        this.broadcastPhase()
      }

      this.save()
    }
  }

  private handleSyncRequest(ws: Connection) {
    const syncMsg: SyncMsg = {
      type: 'sync',
      events: this.state.events as any,
      players: this.state.players,
      phase: this.state.phase,
    }
    send(ws, syncMsg)
  }

  // ---- Helpers ----

  private broadcastPlayers() {
    const msg: PlayersUpdateMsg = { type: 'players-update', players: this.state.players }
    broadcast(Array.from(this.connections.values()), msg)
  }

  private broadcastPhase() {
    const msg: PhaseChangeMsg = { type: 'phase-change', phase: this.state.phase }
    broadcast(Array.from(this.connections.values()), msg)
  }

  private async save() {
    await this.party.storage.put('room', this.state)
  }
}
