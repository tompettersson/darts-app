// party/match-room.ts
// PartyKit server for real-time darts multiplayer.
// Uses object-based PartyKitServer format (not class-based).

import type { PartyKitServer, PartyKitConnection, PartyKitRoom } from 'partykit/server'

// ---- Inline Types ----

type PlayerRef = { playerId: string; name?: string; color?: string }
type GameConfig = { gameType: string; [key: string]: any }
type PlayerOrder = 'manual' | 'random'
type RoomPhase = 'lobby' | 'playing' | 'finished'

type RoomPlayer = {
  playerId: string
  name: string
  color?: string
  isHost: boolean
  isReady: boolean
  connected: boolean
  deviceId: string
  isLocal: boolean
}

type ConnState = { deviceId: string; playerIds: string[] }

type RoomState = {
  events: unknown[]
  players: RoomPlayer[]
  phase: RoomPhase
  matchId: string
  gameType: string
  gameConfig: GameConfig | null
  playerOrder: string[]
  orderType: PlayerOrder
  createdAt: number
}

type ServerMsg =
  | { type: 'sync'; events: any[]; players: RoomPlayer[]; phase: RoomPhase; gameConfig: GameConfig | null; playerOrder: string[]; orderType: PlayerOrder }
  | { type: 'events'; events: any[]; fromIndex: number }
  | { type: 'undo'; eventCount: number; events: any[] }
  | { type: 'players-update'; players: RoomPlayer[] }
  | { type: 'phase-change'; phase: RoomPhase }
  | { type: 'game-config-update'; config: GameConfig }
  | { type: 'player-order-update'; playerIds: string[]; orderType: PlayerOrder }
  | { type: 'error'; message: string; code?: string }

// ---- Room State (module-level, persisted via Durable Storage) ----

let state: RoomState = {
  events: [], players: [], phase: 'lobby',
  matchId: '', gameType: '', gameConfig: null,
  playerOrder: [], orderType: 'manual', createdAt: Date.now(),
}

function send(conn: PartyKitConnection, msg: ServerMsg) {
  conn.send(JSON.stringify(msg))
}

function broadcastAll(room: PartyKitRoom, msg: ServerMsg, exclude?: string) {
  const data = JSON.stringify(msg)
  for (const conn of room.getConnections()) {
    if (exclude && conn.id === exclude) continue
    conn.send(data)
  }
}

function sendSync(conn: PartyKitConnection) {
  send(conn, {
    type: 'sync', events: state.events as any[],
    players: state.players, phase: state.phase,
    gameConfig: state.gameConfig, playerOrder: state.playerOrder,
    orderType: state.orderType,
  })
}

function broadcastPlayers(room: PartyKitRoom) {
  broadcastAll(room, { type: 'players-update', players: state.players })
}

function broadcastPhase(room: PartyKitRoom) {
  broadcastAll(room, { type: 'phase-change', phase: state.phase })
}

async function save(room: PartyKitRoom) {
  await room.storage.put('room', state)
}

// ---- Server ----

export default {
  async onStart(room: PartyKitRoom) {
    const saved = await room.storage.get<RoomState>('room')
    if (saved) {
      state = saved
      for (const p of state.players) p.connected = false
    }
  },

  onConnect(conn: PartyKitConnection, room: PartyKitRoom) {
    if (state.players.length > 0) {
      sendSync(conn)
    }
  },

  onClose(conn: PartyKitConnection, room: PartyKitRoom) {
    let changed = false
    for (const p of state.players) {
      if (p.deviceId === conn.id) {
        p.connected = false
        changed = true
      }
    }
    if (changed) {
      broadcastPlayers(room)
      save(room)
    }
  },

  onError(conn: PartyKitConnection, room: PartyKitRoom) {
    // Treat as close
    let changed = false
    for (const p of state.players) {
      if (p.deviceId === conn.id) { p.connected = false; changed = true }
    }
    if (changed) { broadcastPlayers(room); save(room) }
  },

  async onMessage(message: string, conn: PartyKitConnection, room: PartyKitRoom) {
    let msg: any
    try {
      msg = JSON.parse(message)
    } catch {
      send(conn, { type: 'error', message: 'Invalid JSON' })
      return
    }

    try {
      switch (msg.type) {
        case 'create-room': {
          if (state.players.length > 0) {
            send(conn, { type: 'error', message: 'Room already created', code: 'ROOM_EXISTS' })
            return
          }
          const hp = msg.hostPlayer as PlayerRef
          const hostPlayer: RoomPlayer = {
            playerId: hp.playerId, name: hp.name ?? hp.playerId,
            color: hp.color, isHost: true, isReady: false,
            connected: true, deviceId: conn.id, isLocal: false,
          }
          state = {
            events: [], players: [hostPlayer], phase: 'lobby',
            matchId: '', gameType: '', gameConfig: null,
            playerOrder: [hostPlayer.playerId], orderType: 'manual',
            createdAt: Date.now(),
          }
          conn.setState({ deviceId: conn.id, playerIds: [hostPlayer.playerId] } as ConnState)
          sendSync(conn)
          await save(room)
          break
        }

        case 'join-room': {
          if (state.players.length === 0) {
            send(conn, { type: 'error', message: 'Room not found', code: 'NO_ROOM' })
            return
          }
          const jp = msg.player as PlayerRef
          const existing = state.players.find(p => p.playerId === jp.playerId)
          if (existing) {
            existing.connected = true
            existing.deviceId = conn.id
            conn.setState({ deviceId: conn.id, playerIds: [existing.playerId] } as ConnState)
          } else {
            if (state.phase !== 'lobby') {
              send(conn, { type: 'error', message: 'Game already started', code: 'GAME_STARTED' })
              return
            }
            if (state.players.some(p => p.playerId === jp.playerId)) {
              send(conn, { type: 'error', message: 'Spieler bereits im Raum', code: 'DUPLICATE_PLAYER' })
              return
            }
            const newPlayer: RoomPlayer = {
              playerId: jp.playerId, name: jp.name ?? jp.playerId,
              color: jp.color, isHost: false, isReady: false,
              connected: true, deviceId: conn.id, isLocal: false,
            }
            state.players.push(newPlayer)
            state.playerOrder.push(newPlayer.playerId)
            conn.setState({ deviceId: conn.id, playerIds: [newPlayer.playerId] } as ConnState)
          }
          sendSync(conn)
          broadcastPlayers(room)
          await save(room)
          break
        }

        case 'add-local-players': {
          if (state.phase !== 'lobby') return
          const connState = conn.state as ConnState | null
          const added: string[] = []
          for (const p of msg.players as PlayerRef[]) {
            if (state.players.some(e => e.playerId === p.playerId)) {
              send(conn, { type: 'error', message: `"${p.name}" ist bereits im Raum`, code: 'DUPLICATE_PLAYER' })
              continue
            }
            const np: RoomPlayer = {
              playerId: p.playerId, name: p.name ?? p.playerId,
              color: p.color, isHost: false, isReady: false,
              connected: true, deviceId: conn.id, isLocal: true,
            }
            state.players.push(np)
            state.playerOrder.push(np.playerId)
            added.push(np.playerId)
          }
          if (added.length > 0) {
            const pids = connState?.playerIds ?? []
            conn.setState({ deviceId: conn.id, playerIds: [...pids, ...added] } as ConnState)
            broadcastPlayers(room)
            await save(room)
          }
          break
        }

        case 'remove-player': {
          if (state.phase !== 'lobby') return
          const target = state.players.find(p => p.playerId === msg.playerId)
          if (!target || target.isHost) return
          const isOwnPlayer = target.deviceId === conn.id
          const isHost = state.players.some(p => p.isHost && p.deviceId === conn.id)
          if (!isOwnPlayer && !isHost) return
          state.players = state.players.filter(p => p.playerId !== msg.playerId)
          state.playerOrder = state.playerOrder.filter(id => id !== msg.playerId)
          broadcastPlayers(room)
          await save(room)
          break
        }

        case 'set-game-config': {
          const isHost = state.players.some(p => p.isHost && p.deviceId === conn.id)
          if (!isHost) return
          state.gameConfig = msg.config
          state.gameType = msg.config.gameType
          for (const p of state.players) { if (!p.isHost) p.isReady = false }
          broadcastAll(room, { type: 'game-config-update', config: msg.config })
          broadcastPlayers(room)
          await save(room)
          break
        }

        case 'set-player-order': {
          const isHost = state.players.some(p => p.isHost && p.deviceId === conn.id)
          if (!isHost) return
          state.playerOrder = msg.playerIds
          state.orderType = msg.orderType
          broadcastAll(room, { type: 'player-order-update', playerIds: msg.playerIds, orderType: msg.orderType })
          await save(room)
          break
        }

        case 'start-game': {
          const isHost = state.players.some(p => p.isHost && p.deviceId === conn.id)
          if (!isHost) return
          if (state.players.length < 2 || !state.gameConfig) return
          state.matchId = msg.matchId
          state.gameType = msg.gameType
          state.events = msg.events
          state.phase = 'playing'
          broadcastAll(room, { type: 'events', events: msg.events, fromIndex: 0 })
          broadcastPhase(room)
          await save(room)
          break
        }

        case 'submit-events': {
          if (state.phase === 'lobby') { state.phase = 'playing'; broadcastPhase(room) }
          const fromIndex = state.events.length
          state.events.push(...msg.events)
          const lastEvent = msg.events[msg.events.length - 1]
          if (lastEvent?.type === 'MatchFinished' || lastEvent?.type === 'CricketMatchFinished') {
            state.phase = 'finished'
            broadcastPhase(room)
          }
          broadcastAll(room, { type: 'events', events: msg.events, fromIndex })
          await save(room)
          break
        }

        case 'undo': {
          if (msg.removeCount <= 0 || msg.removeCount > state.events.length) return
          state.events = state.events.slice(0, -msg.removeCount)
          broadcastAll(room, { type: 'undo', eventCount: state.events.length, events: state.events as any[] })
          await save(room)
          break
        }

        case 'player-ready': {
          const player = state.players.find(p => p.playerId === msg.playerId)
          if (player) {
            player.isReady = !player.isReady
            broadcastPlayers(room)
            await save(room)
          }
          break
        }

        case 'sync-request': {
          sendSync(conn)
          break
        }

        default:
          send(conn, { type: 'error', message: `Unknown: ${msg.type}` })
      }
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e)
      send(conn, { type: 'error', message: `Server error: ${errMsg}`, code: 'SERVER_CRASH' })
    }
  },
} satisfies PartyKitServer
