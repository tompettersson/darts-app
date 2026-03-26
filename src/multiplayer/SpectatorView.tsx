// src/multiplayer/SpectatorView.tsx
// Read-only spectator view: enter code, watch live game

import React, { useState, useEffect, useMemo } from 'react'
import type { ConnectionStatus } from './useMultiplayerRoom'
import type { RoomPlayer, RoomPhase, GameConfig } from './protocol'
import { useTheme } from '../ThemeProvider'
import { getThemedUI } from '../ui'

type Props = {
  status: ConnectionStatus
  players: RoomPlayer[]
  phase: RoomPhase
  events: any[]
  error: string | null
  gameConfig: GameConfig | null
  spectatorCount: number
  roomCode: string
  onJoinSpectator: (code: string) => void
  onBack: () => void
}

export default function SpectatorView({
  status, players, phase, events, error,
  gameConfig, spectatorCount, roomCode,
  onJoinSpectator, onBack,
}: Props) {
  const { colors, isArcade } = useTheme()
  const styles = useMemo(() => getThemedUI(colors, isArcade), [colors, isArcade])
  const [code, setCode] = useState('')
  const [joined, setJoined] = useState(false)

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault()
    const c = code.trim().toUpperCase()
    if (c.length >= 4) {
      onJoinSpectator(c)
      setJoined(true)
    }
  }

  // Derive game state from events for display
  const gameInfo = useMemo(() => {
    if (events.length === 0) return null
    const start = events[0] as any
    const lastEvt = events[events.length - 1] as any
    return {
      mode: gameConfig?.gameType || start?.mode || 'X01',
      playerNames: (start?.players ?? []).map((p: any) => p.name),
      eventCount: events.length,
      lastEventType: lastEvt?.type,
    }
  }, [events, gameConfig])

  // Simple score display for X01
  const scores = useMemo(() => {
    if (events.length === 0) return []
    const start = events[0] as any
    if (!start?.players || !start?.startingScorePerLeg) return []

    const playerScores: Record<string, number> = {}
    for (const p of start.players) {
      playerScores[p.playerId] = start.startingScorePerLeg
    }

    // Apply visits
    for (const evt of events) {
      const e = evt as any
      if (e.type === 'VisitAdded' && e.playerId && typeof e.visitScore === 'number') {
        if (!e.bust) {
          playerScores[e.playerId] = (playerScores[e.playerId] ?? 0) - e.visitScore
        }
      }
      if (e.type === 'LegStarted') {
        // Reset scores for new leg
        for (const p of start.players) {
          playerScores[p.playerId] = start.startingScorePerLeg
        }
      }
    }

    return start.players.map((p: any) => ({
      name: p.name,
      playerId: p.playerId,
      remaining: playerScores[p.playerId] ?? 0,
    }))
  }, [events])

  const s = {
    page: { ...styles.page, display: 'flex' as const, flexDirection: 'column' as const, minHeight: '100dvh', gap: 12 },
    card: { ...styles.card, padding: 16 },
    input: {
      width: '100%', padding: '12px 16px', borderRadius: 10,
      border: `2px solid ${colors.border}`, fontSize: 18, fontWeight: 700,
      textAlign: 'center' as const, letterSpacing: 4, fontFamily: 'monospace',
      textTransform: 'uppercase' as const, outline: 'none',
      background: colors.bgInput, color: colors.fg, boxSizing: 'border-box' as const,
    },
    btn: { padding: '12px 20px', borderRadius: 10, fontWeight: 700, fontSize: 14, border: 'none', cursor: 'pointer' },
    playerScore: {
      display: 'flex' as const, justifyContent: 'space-between' as const, alignItems: 'center' as const,
      padding: '12px 14px', borderRadius: 10, background: colors.bgCard,
      border: `1px solid ${colors.border}`, marginBottom: 6,
    },
  }

  return (
    <div style={s.page}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: colors.fg }}>
          {joined ? 'Live-Spiel' : 'Zuschauen'}
        </h2>
        <button style={{ ...styles.backBtn, flexShrink: 0 }} onClick={onBack}>← Zurück</button>
      </div>

      {/* Status */}
      {joined && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12,
          color: status === 'connected' ? '#16a34a' : colors.fgMuted }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%',
            background: status === 'connected' ? '#16a34a' : '#94a3b8' }} />
          {status === 'connected' ? 'Live verbunden' : 'Verbinde...'}
          {spectatorCount > 0 && <span style={{ marginLeft: 8, fontSize: 10, color: colors.fgDim }}>👁 {spectatorCount}</span>}
        </div>
      )}

      {error && (
        <div style={{ background: isArcade ? '#3a1a1a' : '#fef2f2', border: `1px solid ${colors.error}`,
          color: colors.error, padding: '8px 12px', borderRadius: 8, fontSize: 13 }}>{error}</div>
      )}

      {/* Code Input (before joining) */}
      {!joined && (
        <div style={s.card}>
          <div style={{ fontSize: 14, fontWeight: 600, color: colors.fg, marginBottom: 8 }}>
            Raum-Code eingeben um ein Spiel live zu verfolgen
          </div>
          <form onSubmit={handleJoin} style={{ display: 'grid', gap: 10 }}>
            <input style={s.input} value={code} onChange={e => setCode(e.target.value.toUpperCase())}
              placeholder="CODE" maxLength={6} autoFocus />
            <button type="submit" disabled={code.length < 4}
              style={{ ...s.btn, background: colors.accent, color: isArcade ? '#0a0a0a' : '#fff', opacity: code.length < 4 ? 0.5 : 1 }}>
              Zuschauen
            </button>
          </form>
        </div>
      )}

      {/* Game Info */}
      {joined && gameInfo && (
        <div style={s.card}>
          <div style={{ fontSize: 16, fontWeight: 800, color: colors.accent, marginBottom: 4 }}>
            {gameInfo.mode}
          </div>
          <div style={{ fontSize: 12, color: colors.fgMuted }}>
            {gameInfo.playerNames.join(' vs ')} · {phase === 'playing' ? 'Läuft' : phase === 'finished' ? 'Beendet' : 'Lobby'}
          </div>
        </div>
      )}

      {/* Live Scores (X01) */}
      {joined && scores.length > 0 && (
        <div style={s.card}>
          <div style={{ fontSize: 13, fontWeight: 700, color: colors.fg, marginBottom: 8 }}>Live-Stand</div>
          {scores.map((p: any) => (
            <div key={p.playerId} style={s.playerScore}>
              <div style={{ fontWeight: 700, color: colors.fg }}>{p.name}</div>
              <div style={{ fontSize: 24, fontWeight: 900, color: colors.accent }}>{p.remaining}</div>
            </div>
          ))}
        </div>
      )}

      {/* Player List */}
      {joined && players.length > 0 && (
        <div style={s.card}>
          <div style={{ fontSize: 13, fontWeight: 700, color: colors.fg, marginBottom: 8 }}>
            Spieler ({players.length})
          </div>
          {players.map(p => (
            <div key={p.playerId} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0' }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: p.color || colors.accent }} />
              <div style={{ fontWeight: 600, fontSize: 13, color: colors.fg }}>{p.name}</div>
              {p.isHost && <span style={{ fontSize: 10, color: colors.fgMuted }}>Host</span>}
            </div>
          ))}
        </div>
      )}

      {/* Waiting state */}
      {joined && events.length === 0 && phase === 'lobby' && (
        <div style={{ textAlign: 'center', padding: 20, color: colors.fgMuted, fontSize: 14 }}>
          Warte auf Spielstart...
        </div>
      )}

      {/* Match finished */}
      {joined && phase === 'finished' && (
        <div style={{ textAlign: 'center', padding: 20 }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: colors.accent }}>Spiel beendet</div>
        </div>
      )}
    </div>
  )
}
