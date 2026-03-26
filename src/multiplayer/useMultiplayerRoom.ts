// src/multiplayer/useMultiplayerRoom.ts
import { useState, useEffect, useRef, useCallback } from 'react'
import PartySocket from 'partysocket'
import type { PlayerRef } from '../darts501'
import type {
  ClientMessage,
  ServerMessage,
  RoomPlayer,
  RoomPhase,
  GameConfig,
  PlayerOrder,
} from './protocol'

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error'

export type MultiplayerState = {
  status: ConnectionStatus
  players: RoomPlayer[]
  phase: RoomPhase
  events: any[]
  error: string | null
  gameConfig: GameConfig | null
  playerOrder: string[]
  orderType: PlayerOrder
  debugLog: string[]
  spectatorCount: number
}

export type MultiplayerActions = {
  createRoom: (hostPlayer: PlayerRef) => void
  joinRoom: (player: PlayerRef) => void
  joinAsSpectator: () => void
  addLocalPlayers: (players: PlayerRef[]) => void
  removePlayer: (playerId: string) => void
  setGameConfig: (config: GameConfig) => void
  setPlayerOrder: (playerIds: string[], orderType: PlayerOrder) => void
  startGame: (matchId: string, gameType: string, events: any[]) => void
  submitEvents: (events: any[]) => void
  undo: (removeCount: number) => void
  playerReady: (playerId: string) => void
  requestSync: () => void
  disconnect: () => void
}

const PARTYKIT_HOST = import.meta.env.VITE_PARTYKIT_HOST || 'darts-multiplayer.david711-ass.partykit.dev'

export function useMultiplayerRoom(
  roomId: string | null,
  onRemoteEvents?: (events: any[], fromIndex: number) => void,
  onRemoteUndo?: (events: any[]) => void,
): [MultiplayerState, MultiplayerActions] {
  const [status, setStatus] = useState<ConnectionStatus>('disconnected')
  const [players, setPlayers] = useState<RoomPlayer[]>([])
  const [phase, setPhase] = useState<RoomPhase>('lobby')
  const [events, setEvents] = useState<any[]>([])
  const [error, setError] = useState<string | null>(null)
  const [gameConfig, setGameConfig] = useState<GameConfig | null>(null)
  const [playerOrder, setPlayerOrder] = useState<string[]>([])
  const [orderType, setOrderType] = useState<PlayerOrder>('manual')
  const [debugLog, setDebugLog] = useState<string[]>([])
  const [spectatorCount, setSpectatorCount] = useState(0)

  // The initial message to send when connecting (create-room or join-room)
  // Stored as STATE so it survives React re-renders and is available in useEffect
  const [initMessage, setInitMessage] = useState<ClientMessage | null>(null)

  const socketRef = useRef<PartySocket | null>(null)
  const onRemoteEventsRef = useRef(onRemoteEvents)
  const onRemoteUndoRef = useRef(onRemoteUndo)

  onRemoteEventsRef.current = onRemoteEvents
  onRemoteUndoRef.current = onRemoteUndo

  const addDebug = useCallback((msg: string) => {
    setDebugLog(prev => [...prev.slice(-4), msg])
  }, [])

  // Connect to PartyKit room AND send init message
  useEffect(() => {
    if (!roomId) {
      setStatus('disconnected')
      return
    }

    // Don't connect yet if we don't have an init message
    // (wait for createRoom/joinRoom to be called)
    if (!initMessage) {
      addDebug(`Room ${roomId} waiting for init...`)
      return
    }

    addDebug(`Connecting ${roomId}`)
    setStatus('connecting')
    setError(null)

    const socket = new PartySocket({
      host: PARTYKIT_HOST,
      room: roomId,
    })

    socketRef.current = socket

    socket.addEventListener('open', () => {
      setStatus('connected')
      setError(null)
      addDebug(`Sending: ${initMessage.type}`)
      socket.send(JSON.stringify(initMessage))
    })

    socket.addEventListener('message', (evt) => {
      try {
        const msg: ServerMessage = JSON.parse(evt.data)
        addDebug(`Recv: ${msg.type}`)
        switch (msg.type) {
          case 'sync':
            addDebug(`Sync: ${msg.players.length}p`)
            setEvents(msg.events)
            setPlayers(msg.players)
            setPhase(msg.phase)
            setGameConfig(msg.gameConfig)
            setPlayerOrder(msg.playerOrder)
            setOrderType(msg.orderType)
            if ((msg as any).spectatorCount !== undefined) setSpectatorCount((msg as any).spectatorCount)
            if (msg.events.length > 0) {
              onRemoteEventsRef.current?.(msg.events, 0)
            }
            break
          case 'events':
            setEvents(prev => {
              if (msg.fromIndex === prev.length) {
                const updated = [...prev, ...msg.events]
                onRemoteEventsRef.current?.(msg.events, msg.fromIndex)
                return updated
              }
              socket.send(JSON.stringify({ type: 'sync-request' }))
              return prev
            })
            break
          case 'undo':
            setEvents(msg.events)
            onRemoteUndoRef.current?.(msg.events)
            break
          case 'players-update':
            addDebug(`Players: ${msg.players.length}`)
            setPlayers(msg.players)
            break
          case 'phase-change':
            setPhase(msg.phase)
            break
          case 'game-config-update':
            setGameConfig(msg.config)
            break
          case 'player-order-update':
            setPlayerOrder(msg.playerIds)
            setOrderType(msg.orderType)
            break
          case 'spectator-count':
            setSpectatorCount((msg as any).count ?? 0)
            break
          case 'error':
            setError(msg.message)
            addDebug(`Error: ${msg.message}`)
            break
        }
      } catch (e) {
        console.error('[Multiplayer] Failed to parse message:', e)
      }
    })

    socket.addEventListener('close', () => {
      setStatus('disconnected')
    })

    socket.addEventListener('error', () => {
      setStatus('error')
      setError('Verbindungsfehler — läuft der PartyKit-Server?')
      addDebug('Socket error!')
    })

    return () => {
      socket.close()
      socketRef.current = null
    }
  }, [roomId, initMessage]) // Re-run when roomId OR initMessage changes

  // Send helper
  const sendMsg = useCallback((msg: ClientMessage) => {
    const socket = socketRef.current
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      addDebug(`Can't send ${msg.type} (not connected)`)
      return
    }
    socket.send(JSON.stringify(msg))
  }, [addDebug])

  // ---- Lobby Actions ----

  const createRoom = useCallback((hostPlayer: PlayerRef) => {
    addDebug('createRoom called')
    setInitMessage({ type: 'create-room', hostPlayer })
  }, [addDebug])

  const joinRoom = useCallback((player: PlayerRef) => {
    addDebug('joinRoom called')
    setInitMessage({ type: 'join-room', player })
  }, [addDebug])

  const joinAsSpectator = useCallback(() => {
    addDebug('joinAsSpectator called')
    setInitMessage({ type: 'join-spectator' })
  }, [addDebug])

  const addLocalPlayers = useCallback((localPlayers: PlayerRef[]) => {
    sendMsg({ type: 'add-local-players', players: localPlayers })
  }, [sendMsg])

  const removePlayer = useCallback((playerId: string) => {
    sendMsg({ type: 'remove-player', playerId })
  }, [sendMsg])

  const setGameConfigAction = useCallback((config: GameConfig) => {
    setGameConfig(config) // Set locally immediately (optimistic)
    sendMsg({ type: 'set-game-config', config })
  }, [sendMsg])

  const setPlayerOrderAction = useCallback((pids: string[], ot: PlayerOrder) => {
    setPlayerOrder(pids) // Set locally immediately (optimistic)
    setOrderType(ot)
    sendMsg({ type: 'set-player-order', playerIds: pids, orderType: ot })
  }, [sendMsg])

  const startGame = useCallback((matchId: string, gameType: string, initialEvents: any[]) => {
    sendMsg({ type: 'start-game', matchId, gameType, events: initialEvents })
  }, [sendMsg])

  const submitEvents = useCallback((evts: any[]) => {
    sendMsg({ type: 'submit-events', events: evts })
  }, [sendMsg])

  const undo = useCallback((removeCount: number) => {
    sendMsg({ type: 'undo', removeCount })
  }, [sendMsg])

  const playerReady = useCallback((playerId: string) => {
    sendMsg({ type: 'player-ready', playerId })
  }, [sendMsg])

  const requestSync = useCallback(() => {
    sendMsg({ type: 'sync-request' })
  }, [sendMsg])

  const disconnect = useCallback(() => {
    socketRef.current?.close()
    socketRef.current = null
    setInitMessage(null)
    setStatus('disconnected')
    setPlayers([])
    setPhase('lobby')
    setEvents([])
    setError(null)
    setGameConfig(null)
    setPlayerOrder([])
    setOrderType('manual')
    setDebugLog([])
    setSpectatorCount(0)
  }, [])

  const state: MultiplayerState = {
    status, players, phase, events, error,
    gameConfig, playerOrder, orderType, debugLog, spectatorCount,
  }

  const actions: MultiplayerActions = {
    createRoom, joinRoom, joinAsSpectator, addLocalPlayers, removePlayer,
    setGameConfig: setGameConfigAction, setPlayerOrder: setPlayerOrderAction,
    startGame, submitEvents, undo, playerReady, requestSync, disconnect,
  }

  return [state, actions]
}
