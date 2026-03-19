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
} from './protocol'

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error'

export type MultiplayerState = {
  status: ConnectionStatus
  players: RoomPlayer[]
  phase: RoomPhase
  events: any[]
  error: string | null
}

export type MultiplayerActions = {
  createRoom: (matchId: string, gameType: string, hostPlayer: PlayerRef, initialEvents: any[]) => void
  joinRoom: (matchId: string, player: PlayerRef) => void
  submitEvents: (events: any[]) => void
  undo: (removeCount: number) => void
  playerReady: (playerId: string) => void
  requestSync: () => void
  disconnect: () => void
}

const PARTYKIT_HOST = import.meta.env.VITE_PARTYKIT_HOST || 'localhost:1999'

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

  const socketRef = useRef<PartySocket | null>(null)
  const onRemoteEventsRef = useRef(onRemoteEvents)
  const onRemoteUndoRef = useRef(onRemoteUndo)

  // Queue for messages that arrive before socket is open
  const pendingQueueRef = useRef<ClientMessage[]>([])

  // Keep callback refs current
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
    pendingQueueRef.current = []

    const socket = new PartySocket({
      host: PARTYKIT_HOST,
      room: roomId,
    })

    socketRef.current = socket

    socket.addEventListener('open', () => {
      setStatus('connected')
      setError(null)
      // Flush any queued messages
      const queue = pendingQueueRef.current
      pendingQueueRef.current = []
      for (const msg of queue) {
        socket.send(JSON.stringify(msg))
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
      switch (msg.type) {
        case 'sync':
          setEvents(msg.events)
          setPlayers(msg.players)
          setPhase(msg.phase)
          onRemoteEventsRef.current?.(msg.events, 0)
          break
        case 'events':
          setEvents(prev => {
            if (msg.fromIndex === prev.length) {
              const updated = [...prev, ...msg.events]
              onRemoteEventsRef.current?.(msg.events, msg.fromIndex)
              return updated
            }
            // Index mismatch — request full sync
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
        case 'error':
          setError(msg.message)
          console.error('[Multiplayer] Server error:', msg.message, msg.code)
          break
      }
    }

    return () => {
      socket.close()
      socketRef.current = null
      pendingQueueRef.current = []
    }
  }, [roomId])

  // Send helper — queues if socket not ready yet
  const sendMsg = useCallback((msg: ClientMessage) => {
    const socket = socketRef.current
    if (!socket) {
      console.warn('[Multiplayer] No socket, cannot send')
      return
    }
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(msg))
    } else {
      // Queue message — will be flushed on 'open'
      console.log('[Multiplayer] Socket not open yet, queuing message:', msg.type)
      pendingQueueRef.current.push(msg)
    }
  }, [])

  // Actions
  const createRoom = useCallback((matchId: string, gameType: string, hostPlayer: PlayerRef, initialEvents: any[]) => {
    sendMsg({
      type: 'create-room',
      matchId,
      gameType,
      hostPlayer,
      events: initialEvents,
    })
  }, [sendMsg])

  const joinRoom = useCallback((matchId: string, player: PlayerRef) => {
    sendMsg({
      type: 'join-room',
      matchId,
      player,
    })
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
    pendingQueueRef.current = []
    setStatus('disconnected')
    setPlayers([])
    setPhase('lobby')
    setEvents([])
    setError(null)
  }, [])

  const state: MultiplayerState = { status, players, phase, events, error }
  const actions: MultiplayerActions = {
    createRoom, joinRoom, submitEvents, undo,
    playerReady, requestSync, disconnect,
  }

  return [state, actions]
}
