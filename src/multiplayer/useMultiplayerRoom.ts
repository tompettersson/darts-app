// src/multiplayer/useMultiplayerRoom.ts
// React hook for PartyKit multiplayer connection.
// Manages WebSocket lifecycle, event sync, and connection state.

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
}

export type MultiplayerActions = {
  createRoom: (hostPlayer: PlayerRef) => void
  joinRoom: (player: PlayerRef) => void
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

  const socketRef = useRef<PartySocket | null>(null)
  const onRemoteEventsRef = useRef(onRemoteEvents)
  const onRemoteUndoRef = useRef(onRemoteUndo)
  const [debugLog, setDebugLog] = useState<string[]>([])

  // Message that should be sent immediately when socket opens
  const onConnectMessageRef = useRef<ClientMessage | null>(null)

  const addDebug = useCallback((msg: string) => {
    setDebugLog(prev => [...prev.slice(-4), msg])
  }, [])

  onRemoteEventsRef.current = onRemoteEvents
  onRemoteUndoRef.current = onRemoteUndo

  // Connect to PartyKit room
  useEffect(() => {
    if (!roomId) {
      setStatus('disconnected')
      return
    }

    setStatus('connecting')
    setError(null)

    addDebug(`Connecting to ${roomId}`)

    const socket = new PartySocket({
      host: PARTYKIT_HOST,
      room: roomId,
    })

    socketRef.current = socket

    socket.addEventListener('open', () => {
      setStatus('connected')
      setError(null)

      const initMsg = onConnectMessageRef.current
      if (initMsg) {
        addDebug(`Sending: ${initMsg.type}`)
        socket.send(JSON.stringify(initMsg))
        onConnectMessageRef.current = null
      } else {
        addDebug('Open but no init msg!')
      }
    })

    socket.addEventListener('message', (evt) => {
      try {
        const msg: ServerMessage = JSON.parse(evt.data)
        handleServerMessage(msg)
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
    })

    function handleServerMessage(msg: ServerMessage) {
      addDebug(`Recv: ${msg.type}`)
      switch (msg.type) {
        case 'sync':
          setEvents(msg.events)
          setPlayers(msg.players)
          setPhase(msg.phase)
          setGameConfig(msg.gameConfig)
          setPlayerOrder(msg.playerOrder)
          setOrderType(msg.orderType)
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
        case 'error':
          setError(msg.message)
          console.error('[Multiplayer] Server error:', msg.message, msg.code)
          break
      }
    }

    return () => {
      socket.close()
      socketRef.current = null
    }
  }, [roomId])

  // Send helper — only works when socket is open
  const sendMsg = useCallback((msg: ClientMessage) => {
    const socket = socketRef.current
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      console.warn('[Multiplayer] Socket not ready, storing as onConnect message:', msg.type)
      onConnectMessageRef.current = msg
      return
    }
    socket.send(JSON.stringify(msg))
  }, [])

  // ---- Lobby Actions ----

  const createRoom = useCallback((hostPlayer: PlayerRef) => {
    const msg: ClientMessage = { type: 'create-room', hostPlayer }
    // Store as the message to send when socket opens
    onConnectMessageRef.current = msg
    // Also try to send immediately if socket is already open
    const socket = socketRef.current
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(msg))
      onConnectMessageRef.current = null
    }
  }, [])

  const joinRoom = useCallback((player: PlayerRef) => {
    const msg: ClientMessage = { type: 'join-room', player }
    onConnectMessageRef.current = msg
    const socket = socketRef.current
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(msg))
      onConnectMessageRef.current = null
    }
  }, [])

  const addLocalPlayers = useCallback((localPlayers: PlayerRef[]) => {
    sendMsg({ type: 'add-local-players', players: localPlayers })
  }, [sendMsg])

  const removePlayer = useCallback((playerId: string) => {
    sendMsg({ type: 'remove-player', playerId })
  }, [sendMsg])

  const setGameConfigAction = useCallback((config: GameConfig) => {
    sendMsg({ type: 'set-game-config', config })
  }, [sendMsg])

  const setPlayerOrderAction = useCallback((pids: string[], ot: PlayerOrder) => {
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
    onConnectMessageRef.current = null
    setStatus('disconnected')
    setPlayers([])
    setPhase('lobby')
    setEvents([])
    setError(null)
    setGameConfig(null)
    setPlayerOrder([])
    setOrderType('manual')
  }, [])

  const state: MultiplayerState = {
    status, players, phase, events, error,
    gameConfig, playerOrder, orderType, debugLog,
  }

  const actions: MultiplayerActions = {
    createRoom, joinRoom, addLocalPlayers, removePlayer,
    setGameConfig: setGameConfigAction, setPlayerOrder: setPlayerOrderAction,
    startGame, submitEvents, undo, playerReady, requestSync, disconnect,
  }

  return [state, actions]
}
