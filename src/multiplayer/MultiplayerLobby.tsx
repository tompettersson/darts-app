// src/multiplayer/MultiplayerLobby.tsx
// Lobby screen for multiplayer matches.
// Host creates room + shares code, guest enters code to join.

import React, { useState, useEffect, useCallback } from 'react'
import type { ConnectionStatus } from './useMultiplayerRoom'
import type { RoomPlayer, RoomPhase } from './protocol'
import { generateRoomCode } from './protocol'

type Props = {
  /** "host" creating a new room, "join" entering a code */
  mode: 'host' | 'join'
  /** Current connection status */
  status: ConnectionStatus
  /** Players in the room */
  players: RoomPlayer[]
  /** Room phase */
  phase: RoomPhase
  /** Error message */
  error: string | null
  /** Current player ID */
  myPlayerId: string
  /** Room code (set by host, entered by guest) */
  roomCode: string
  /** Called when host creates the room */
  onCreateRoom: (roomCode: string) => void
  /** Called when guest joins with a code */
  onJoinRoom: (roomCode: string) => void
  /** Called when player clicks "Ready" */
  onReady: () => void
  /** Called when game should start (all ready) */
  onGameStart: () => void
  /** Back to menu */
  onBack: () => void
}

export default function MultiplayerLobby({
  mode,
  status,
  players,
  phase,
  error,
  myPlayerId,
  roomCode,
  onCreateRoom,
  onJoinRoom,
  onReady,
  onGameStart,
  onBack,
}: Props) {
  const [joinCode, setJoinCode] = useState('')
  const [copied, setCopied] = useState(false)

  // Host: auto-create room
  useEffect(() => {
    if (mode === 'host' && !roomCode) {
      const code = generateRoomCode()
      onCreateRoom(code)
    }
  }, [mode, roomCode, onCreateRoom])

  // Auto-start when all ready and phase changes to 'playing'
  useEffect(() => {
    if (phase === 'playing') {
      onGameStart()
    }
  }, [phase, onGameStart])

  const handleCopyCode = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(roomCode)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback: select the text
    }
  }, [roomCode])

  const handleJoinSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const code = joinCode.trim().toUpperCase()
    if (code.length >= 4) {
      onJoinRoom(code)
    }
  }

  const me = players.find(p => p.playerId === myPlayerId)
  const amReady = me?.isReady ?? false
  const allReady = players.length >= 2 && players.every(p => p.isReady)

  const s = {
    page: {
      display: 'flex',
      flexDirection: 'column' as const,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      padding: 24,
      background: '#f8fafc',
      fontFamily: 'system-ui, -apple-system, sans-serif',
    },
    card: {
      background: '#fff',
      borderRadius: 16,
      padding: 32,
      maxWidth: 420,
      width: '100%',
      boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
    },
    title: {
      fontSize: 24,
      fontWeight: 800,
      marginBottom: 8,
      textAlign: 'center' as const,
    },
    subtitle: {
      fontSize: 14,
      color: '#64748b',
      textAlign: 'center' as const,
      marginBottom: 24,
    },
    codeBox: {
      background: '#f1f5f9',
      border: '2px dashed #cbd5e1',
      borderRadius: 12,
      padding: '16px 24px',
      textAlign: 'center' as const,
      marginBottom: 16,
      cursor: 'pointer',
    },
    code: {
      fontSize: 36,
      fontWeight: 900,
      letterSpacing: 6,
      color: '#0f172a',
      fontFamily: 'monospace',
    },
    copyHint: {
      fontSize: 12,
      color: '#94a3b8',
      marginTop: 4,
    },
    playerList: {
      marginTop: 16,
      marginBottom: 24,
    },
    playerRow: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '10px 12px',
      borderRadius: 10,
      marginBottom: 6,
    },
    dot: (color: string, connected: boolean) => ({
      width: 12,
      height: 12,
      borderRadius: '50%',
      background: connected ? color : '#cbd5e1',
      border: '2px solid ' + (connected ? color : '#94a3b8'),
      transition: 'all 0.3s',
    }),
    name: { fontWeight: 700, flex: 1 },
    badge: (ready: boolean) => ({
      fontSize: 11,
      fontWeight: 700,
      padding: '3px 8px',
      borderRadius: 99,
      background: ready ? '#dcfce7' : '#fef3c7',
      color: ready ? '#166534' : '#92400e',
    }),
    btn: {
      width: '100%',
      padding: '14px 24px',
      borderRadius: 12,
      border: 'none',
      fontSize: 16,
      fontWeight: 700,
      cursor: 'pointer',
      transition: 'all 0.2s',
    },
    btnPrimary: {
      background: '#0ea5e9',
      color: '#fff',
    },
    btnSecondary: {
      background: '#f1f5f9',
      color: '#334155',
      marginTop: 8,
    },
    btnDisabled: {
      opacity: 0.5,
      cursor: 'not-allowed',
    },
    input: {
      width: '100%',
      padding: '14px 16px',
      borderRadius: 12,
      border: '2px solid #e2e8f0',
      fontSize: 20,
      fontWeight: 700,
      textAlign: 'center' as const,
      letterSpacing: 4,
      fontFamily: 'monospace',
      textTransform: 'uppercase' as const,
      outline: 'none',
      marginBottom: 12,
    },
    statusBar: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      marginBottom: 16,
      fontSize: 13,
      color: status === 'connected' ? '#16a34a' : status === 'error' ? '#dc2626' : '#94a3b8',
    },
    statusDot: {
      width: 8,
      height: 8,
      borderRadius: '50%',
      background: status === 'connected' ? '#16a34a' : status === 'error' ? '#dc2626' : '#94a3b8',
      animation: status === 'connecting' ? 'pulse 1.5s infinite' : undefined,
    },
    error: {
      background: '#fef2f2',
      border: '1px solid #fecaca',
      color: '#991b1b',
      padding: '10px 14px',
      borderRadius: 10,
      fontSize: 13,
      marginBottom: 16,
      textAlign: 'center' as const,
    },
  }

  const statusLabels: Record<ConnectionStatus, string> = {
    connecting: 'Verbinde...',
    connected: 'Verbunden',
    disconnected: 'Getrennt',
    error: 'Fehler',
  }

  return (
    <div style={s.page}>
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>

      <div style={s.card}>
        <div style={s.title}>
          {mode === 'host' ? 'Multiplayer Match' : 'Match beitreten'}
        </div>
        <div style={s.subtitle}>
          {mode === 'host'
            ? 'Teile den Code mit deinem Mitspieler'
            : 'Gib den Code vom Host ein'}
        </div>

        {/* Connection Status */}
        <div style={s.statusBar}>
          <div style={s.statusDot} />
          {statusLabels[status]}
        </div>

        {/* Error */}
        {error && <div style={s.error}>{error}</div>}

        {/* HOST: Show room code */}
        {mode === 'host' && roomCode && (
          <div style={s.codeBox} onClick={handleCopyCode}>
            <div style={s.code}>{roomCode}</div>
            <div style={s.copyHint}>
              {copied ? 'Kopiert!' : 'Tippen zum Kopieren'}
            </div>
          </div>
        )}

        {/* JOIN: Code input */}
        {mode === 'join' && status !== 'connected' && (
          <form onSubmit={handleJoinSubmit}>
            <input
              style={s.input}
              value={joinCode}
              onChange={e => setJoinCode(e.target.value.toUpperCase())}
              placeholder="CODE"
              maxLength={6}
              autoFocus
              aria-label="Raum-Code eingeben"
            />
            <button
              type="submit"
              style={{ ...s.btn, ...s.btnPrimary, ...(joinCode.length < 4 ? s.btnDisabled : {}) }}
              disabled={joinCode.length < 4}
            >
              Beitreten
            </button>
          </form>
        )}

        {/* Player List */}
        {players.length > 0 && (
          <div style={s.playerList}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#64748b', marginBottom: 8 }}>
              Spieler ({players.length})
            </div>
            {players.map(p => (
              <div
                key={p.playerId}
                style={{
                  ...s.playerRow,
                  background: p.playerId === myPlayerId ? '#f0f9ff' : '#fafafa',
                }}
              >
                <div style={s.dot(p.color || '#0ea5e9', p.connected)} />
                <div style={s.name}>
                  {p.name}
                  {p.isHost && (
                    <span style={{ fontSize: 11, color: '#64748b', marginLeft: 6 }}>Host</span>
                  )}
                </div>
                <div style={s.badge(p.isReady)}>
                  {p.isReady ? 'Bereit' : 'Wartet'}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Ready / Start Buttons */}
        {status === 'connected' && phase === 'lobby' && (
          <>
            {!amReady && players.length >= 2 && (
              <button
                style={{ ...s.btn, ...s.btnPrimary }}
                onClick={onReady}
              >
                Bereit!
              </button>
            )}
            {amReady && !allReady && (
              <div style={{ textAlign: 'center', color: '#64748b', fontSize: 14, padding: 12 }}>
                Warte auf andere Spieler...
              </div>
            )}
            {players.length < 2 && (
              <div style={{ textAlign: 'center', color: '#64748b', fontSize: 14, padding: 12 }}>
                Warte auf Mitspieler...
              </div>
            )}
          </>
        )}

        {/* Back button */}
        <button
          style={{ ...s.btn, ...s.btnSecondary }}
          onClick={onBack}
        >
          Zurück
        </button>
      </div>
    </div>
  )
}
