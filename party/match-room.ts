// party/match-room.ts
// PartyKit server for real-time darts multiplayer.
// Each room = one match. Events are stored in Durable Storage.

import type {
  ClientMessage,
  ServerMessage,
  RoomPlayer,
  RoomPhase,
  GameConfig,
  PlayerOrder,
  SyncMsg,
  EventsBroadcastMsg,
  UndoBroadcastMsg,
  PlayersUpdateMsg,
  PhaseChangeMsg,
  GameConfigUpdateMsg,
  PlayerOrderUpdateMsg,
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

// Connection state: which device and players are on this connection
type ConnState = {
  deviceId: string      // = ws.id
  playerIds: string[]   // All player IDs managed by this connection
}

// Room state (in memory, backed by Durable Storage)
type RoomState = {
  events: unknown[]
  players: RoomPlayer[]
  phase: RoomPhase
  matchId: string
  gameType: string
  gameConfig: GameConfig | null
  playerOrder: string[]     // Ordered list of player IDs
  orderType: PlayerOrder
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
    gameType: '',
    gameConfig: null,
    playerOrder: [],
    orderType: 'manual',
    createdAt: Date.now(),
  }

  party: Party
  connections: Map<string, Connection> = new Map()

  constructor(party: Party) {
    this.party = party
  }

  async onStart() {
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

    // If room is initialized, send sync to reconnecting client
    if (this.state.players.length > 0) {
      // Try to reconnect: check if this device had players before
      const connState = ws.state as ConnState | null
      if (connState?.playerIds) {
        for (const pid of connState.playerIds) {
          const player = this.state.players.find(p => p.playerId === pid)
          if (player) {
            player.connected = true
            player.deviceId = ws.id
          }
        }
        this.broadcastPlayers()
        this.save()
      }

      this.sendSync(ws)
    }
  }

  onClose(ws: Connection) {
    this.connections.delete(ws.id)
    // Mark ALL players from this device as disconnected
    let changed = false
    for (const p of this.state.players) {
      if (p.deviceId === ws.id) {
        p.connected = false
        changed = true
      }
    }
    if (changed) {
      this.broadcastPlayers()
      this.save()
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
      case 'add-local-players':
        this.handleAddLocalPlayers(ws, msg)
        break
      case 'remove-player':
        this.handleRemovePlayer(ws, msg)
        break
      case 'set-game-config':
        this.handleSetGameConfig(ws, msg)
        break
      case 'set-player-order':
        this.handleSetPlayerOrder(ws, msg)
        break
      case 'start-game':
        this.handleStartGame(ws, msg)
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
        this.sendSync(ws)
        break
      default:
        send(ws, { type: 'error', message: 'Unknown message type' })
    }
  }

  // ---- Handlers ----

  private handleCreateRoom(ws: Connection, msg: ClientMessage & { type: 'create-room' }) {
    // Room can only be created once
    if (this.state.players.length > 0) {
      send(ws, { type: 'error', message: 'Room already created', code: 'ROOM_EXISTS' })
      return
    }

    const hostPlayer: RoomPlayer = {
      playerId: msg.hostPlayer.playerId,
      name: msg.hostPlayer.name ?? msg.hostPlayer.playerId,
      color: msg.hostPlayer.color,
      isHost: true,
      isReady: false,
      connected: true,
      deviceId: ws.id,
      isLocal: false,
    }

    this.state = {
      events: [],
      players: [hostPlayer],
      phase: 'lobby',
      matchId: '',
      gameType: '',
      gameConfig: null,
      playerOrder: [hostPlayer.playerId],
      orderType: 'manual',
      createdAt: Date.now(),
    }

    ws.setState({ deviceId: ws.id, playerIds: [hostPlayer.playerId] } satisfies ConnState)
    this.sendSync(ws)
    this.save()
  }

  private handleJoinRoom(ws: Connection, msg: ClientMessage & { type: 'join-room' }) {
    if (this.state.players.length === 0) {
      send(ws, { type: 'error', message: 'Room not found', code: 'NO_ROOM' })
      return
    }

    const existing = this.state.players.find(p => p.playerId === msg.player.playerId)
    if (existing) {
      // Reconnect
      existing.connected = true
      existing.deviceId = ws.id
      const connState = (ws.state as ConnState) || { deviceId: ws.id, playerIds: [] }
      if (!connState.playerIds.includes(existing.playerId)) {
        connState.playerIds.push(existing.playerId)
      }
      connState.deviceId = ws.id
      ws.setState(connState)
    } else {
      // New player joining
      if (this.state.phase !== 'lobby') {
        send(ws, { type: 'error', message: 'Game already started', code: 'GAME_STARTED' })
        return
      }

      // Duplicate check
      if (this.state.players.some(p => p.playerId === msg.player.playerId)) {
        send(ws, { type: 'error', message: 'Spieler bereits im Raum', code: 'DUPLICATE_PLAYER' })
        return
      }

      const newPlayer: RoomPlayer = {
        playerId: msg.player.playerId,
        name: msg.player.name ?? msg.player.playerId,
        color: msg.player.color,
        isHost: false,
        isReady: false,
        connected: true,
        deviceId: ws.id,
        isLocal: false,
      }
      this.state.players.push(newPlayer)
      this.state.playerOrder.push(newPlayer.playerId)

      ws.setState({ deviceId: ws.id, playerIds: [newPlayer.playerId] } satisfies ConnState)
    }

    this.sendSync(ws)
    this.broadcastPlayers()
    this.save()
  }

  private handleAddLocalPlayers(ws: Connection, msg: ClientMessage & { type: 'add-local-players' }) {
    if (this.state.phase !== 'lobby') {
      send(ws, { type: 'error', message: 'Can only add players in lobby', code: 'WRONG_PHASE' })
      return
    }

    const connState = (ws.state as ConnState) || { deviceId: ws.id, playerIds: [] }
    const added: string[] = []

    for (const p of msg.players) {
      // Duplicate check
      if (this.state.players.some(existing => existing.playerId === p.playerId)) {
        send(ws, { type: 'error', message: `Spieler "${p.name}" ist bereits im Raum`, code: 'DUPLICATE_PLAYER' })
        continue
      }

      const newPlayer: RoomPlayer = {
        playerId: p.playerId,
        name: p.name ?? p.playerId,
        color: p.color,
        isHost: false,
        isReady: false,
        connected: true,
        deviceId: ws.id,
        isLocal: true,
      }
      this.state.players.push(newPlayer)
      this.state.playerOrder.push(newPlayer.playerId)
      added.push(newPlayer.playerId)
    }

    if (added.length > 0) {
      connState.playerIds = [...(connState.playerIds || []), ...added]
      ws.setState(connState)
      this.broadcastPlayers()
      this.save()
    }
  }

  private handleRemovePlayer(ws: Connection, msg: ClientMessage & { type: 'remove-player' }) {
    if (this.state.phase !== 'lobby') {
      send(ws, { type: 'error', message: 'Can only remove players in lobby', code: 'WRONG_PHASE' })
      return
    }

    const connState = ws.state as ConnState | null
    const target = this.state.players.find(p => p.playerId === msg.playerId)
    if (!target) return

    // Only allow: own local players, or host can remove anyone
    const isOwnPlayer = target.deviceId === ws.id
    const isHost = this.state.players.some(p => p.isHost && p.deviceId === ws.id)

    if (!isOwnPlayer && !isHost) {
      send(ws, { type: 'error', message: 'Nicht berechtigt', code: 'UNAUTHORIZED' })
      return
    }

    // Can't remove the host
    if (target.isHost) {
      send(ws, { type: 'error', message: 'Host kann nicht entfernt werden', code: 'CANNOT_REMOVE_HOST' })
      return
    }

    this.state.players = this.state.players.filter(p => p.playerId !== msg.playerId)
    this.state.playerOrder = this.state.playerOrder.filter(id => id !== msg.playerId)

    // Update connection state
    if (connState?.playerIds) {
      connState.playerIds = connState.playerIds.filter(id => id !== msg.playerId)
      ws.setState(connState)
    }

    this.broadcastPlayers()
    this.save()
  }

  private handleSetGameConfig(ws: Connection, msg: ClientMessage & { type: 'set-game-config' }) {
    // Only host can set config
    const isHost = this.state.players.some(p => p.isHost && p.deviceId === ws.id)
    if (!isHost) {
      send(ws, { type: 'error', message: 'Nur der Host kann die Konfiguration ändern', code: 'NOT_HOST' })
      return
    }

    this.state.gameConfig = msg.config
    this.state.gameType = msg.config.gameType

    // Reset ready status for all non-host players when config changes
    for (const p of this.state.players) {
      if (!p.isHost) p.isReady = false
    }

    const configMsg: GameConfigUpdateMsg = { type: 'game-config-update', config: msg.config }
    broadcast(Array.from(this.connections.values()), configMsg)
    this.broadcastPlayers() // Because ready status was reset
    this.save()
  }

  private handleSetPlayerOrder(ws: Connection, msg: ClientMessage & { type: 'set-player-order' }) {
    // Only host can set order
    const isHost = this.state.players.some(p => p.isHost && p.deviceId === ws.id)
    if (!isHost) {
      send(ws, { type: 'error', message: 'Nur der Host kann die Reihenfolge ändern', code: 'NOT_HOST' })
      return
    }

    this.state.playerOrder = msg.playerIds
    this.state.orderType = msg.orderType

    const orderMsg: PlayerOrderUpdateMsg = {
      type: 'player-order-update',
      playerIds: msg.playerIds,
      orderType: msg.orderType,
    }
    broadcast(Array.from(this.connections.values()), orderMsg)
    this.save()
  }

  private handleStartGame(ws: Connection, msg: ClientMessage & { type: 'start-game' }) {
    // Only host can start
    const isHost = this.state.players.some(p => p.isHost && p.deviceId === ws.id)
    if (!isHost) {
      send(ws, { type: 'error', message: 'Nur der Host kann das Spiel starten', code: 'NOT_HOST' })
      return
    }

    if (this.state.players.length < 2) {
      send(ws, { type: 'error', message: 'Mindestens 2 Spieler erforderlich', code: 'NOT_ENOUGH_PLAYERS' })
      return
    }

    if (!this.state.gameConfig) {
      send(ws, { type: 'error', message: 'Bitte zuerst Spielmodus wählen', code: 'NO_CONFIG' })
      return
    }

    this.state.matchId = msg.matchId
    this.state.gameType = msg.gameType
    this.state.events = msg.events
    this.state.phase = 'playing'

    // Broadcast events + phase change to all
    const eventsMsg: EventsBroadcastMsg = {
      type: 'events',
      events: msg.events as any,
      fromIndex: 0,
    }
    broadcast(Array.from(this.connections.values()), eventsMsg)
    this.broadcastPhase()
    this.save()
  }

  private handleSubmitEvents(ws: Connection, msg: ClientMessage & { type: 'submit-events' }) {
    if (this.state.phase === 'lobby') {
      this.state.phase = 'playing'
      this.broadcastPhase()
    }

    const fromIndex = this.state.events.length
    this.state.events.push(...msg.events)

    // Check if match is finished
    const lastEvent = msg.events[msg.events.length - 1] as any
    if (lastEvent?.type === 'MatchFinished' || lastEvent?.type === 'CricketMatchFinished') {
      this.state.phase = 'finished'
      this.broadcastPhase()
    }

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
      player.isReady = !player.isReady // Toggle
      this.broadcastPlayers()
      this.save()
    }
  }

  // ---- Helpers ----

  private sendSync(ws: Connection) {
    const syncMsg: SyncMsg = {
      type: 'sync',
      events: this.state.events as any,
      players: this.state.players,
      phase: this.state.phase,
      gameConfig: this.state.gameConfig,
      playerOrder: this.state.playerOrder,
      orderType: this.state.orderType,
    }
    send(ws, syncMsg)
  }

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
