// src/multiplayer/SpectatorView.tsx
// Spectator view: browse live games OR enter code manually

import React, { useState, useEffect, useMemo, useRef } from 'react'
import PartySocket from 'partysocket'
import type { ConnectionStatus } from './useMultiplayerRoom'
import type { RoomPlayer, RoomPhase, GameConfig } from './protocol'
import { useTheme } from '../ThemeProvider'
import { getThemedUI } from '../ui'

const PARTYKIT_HOST = import.meta.env.VITE_PARTYKIT_HOST || 'darts-multiplayer.david711-ass.partykit.dev'

type LiveGame = {
  roomCode: string
  gameType: string
  playerNames: string[]
  playerCount: number
  phase: string
  startedAt: number
}

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

const GAME_LABELS: Record<string, string> = {
  x01: 'X01', cricket: 'Cricket', atb: 'ATB', ctf: 'CTF',
  shanghai: 'Shanghai', killer: 'Killer', str: 'Sträußchen',
  highscore: 'Highscore', bobs27: "Bob's 27", operation: 'Operation',
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
  const [liveGames, setLiveGames] = useState<LiveGame[]>([])
  const [loadingGames, setLoadingGames] = useState(true)
  const registryRef = useRef<PartySocket | null>(null)

  // Connect to __live__ registry to get active games
  useEffect(() => {
    if (joined) return // Don't need registry when watching a game

    const socket = new PartySocket({ host: PARTYKIT_HOST, room: '__live__' })
    registryRef.current = socket

    socket.addEventListener('message', (evt) => {
      try {
        const msg = JSON.parse(evt.data)
        if (msg.type === 'live-games') {
          setLiveGames(msg.games || [])
          setLoadingGames(false)
        }
      } catch {}
    })

    socket.addEventListener('open', () => {
      socket.send(JSON.stringify({ type: 'get-live-games' }))
      setLoadingGames(false)
    })

    socket.addEventListener('error', () => setLoadingGames(false))

    return () => { socket.close(); registryRef.current = null }
  }, [joined])

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault()
    const c = code.trim().toUpperCase()
    if (c.length >= 4) { onJoinSpectator(c); setJoined(true) }
  }

  const handleWatchGame = (roomCode: string) => {
    onJoinSpectator(roomCode)
    setJoined(true)
  }

  // Simple score display for X01
  const scores = useMemo(() => {
    if (events.length === 0) return []
    const start = events[0] as any
    if (!start?.players || !start?.startingScorePerLeg) return []
    const playerScores: Record<string, number> = {}
    for (const p of start.players) playerScores[p.playerId] = start.startingScorePerLeg
    for (const evt of events) {
      const e = evt as any
      if (e.type === 'VisitAdded' && e.playerId && typeof e.visitScore === 'number' && !e.bust) {
        playerScores[e.playerId] = (playerScores[e.playerId] ?? 0) - e.visitScore
      }
      if (e.type === 'LegStarted') {
        for (const p of start.players) playerScores[p.playerId] = start.startingScorePerLeg
      }
    }
    return start.players.map((p: any) => ({ name: p.name, playerId: p.playerId, remaining: playerScores[p.playerId] ?? 0 }))
  }, [events])

  const gameInfo = useMemo(() => {
    if (events.length === 0) return null
    const start = events[0] as any
    return {
      mode: gameConfig?.gameType || start?.mode || 'X01',
      playerNames: (start?.players ?? []).map((p: any) => p.name),
    }
  }, [events, gameConfig])

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
    gameCard: {
      padding: '12px 14px', borderRadius: 10, background: colors.bgCard,
      border: `1px solid ${colors.border}`, cursor: 'pointer',
      display: 'flex' as const, justifyContent: 'space-between' as const, alignItems: 'center' as const,
    },
  }

  return (
    <div style={s.page}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: colors.fg }}>
          {joined ? 'Live-Spiel' : 'Zuschauen'}
        </h2>
        <button style={{ ...styles.backBtn, flexShrink: 0 }} onClick={onBack}>← Zurück</button>
      </div>

      {/* Connected status when watching */}
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

      {/* Browse mode: show live games + manual code input */}
      {!joined && (
        <>
          {/* Live Games List */}
          <div style={s.card}>
            <div style={{ fontSize: 14, fontWeight: 700, color: colors.fg, marginBottom: 8 }}>
              Live-Spiele {liveGames.length > 0 && `(${liveGames.length})`}
            </div>
            {loadingGames ? (
              <div style={{ color: colors.fgMuted, fontSize: 13 }}>Lade...</div>
            ) : liveGames.length === 0 ? (
              <div style={{ color: colors.fgMuted, fontSize: 13, padding: '12px 0', textAlign: 'center' }}>
                Keine aktiven Spiele gerade. Gib einen Code ein um direkt beizutreten.
              </div>
            ) : (
              <div style={{ display: 'grid', gap: 6 }}>
                {liveGames.map(game => (
                  <div key={game.roomCode} style={s.gameCard} onClick={() => handleWatchGame(game.roomCode)}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14, color: colors.fg }}>
                        {GAME_LABELS[game.gameType] || game.gameType}
                      </div>
                      <div style={{ fontSize: 12, color: colors.fgMuted }}>
                        {game.playerNames.join(' vs ') || `${game.playerCount} Spieler`}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{
                        fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 99,
                        background: game.phase === 'playing' ? '#dcfce7' : '#fef3c7',
                        color: game.phase === 'playing' ? '#166534' : '#92400e',
                      }}>
                        {game.phase === 'playing' ? 'Live' : game.phase === 'lobby' ? 'Lobby' : 'Beendet'}
                      </span>
                      <span style={{ fontSize: 18 }}>👁</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Manual code input */}
          <div style={s.card}>
            <div style={{ fontSize: 13, color: colors.fgMuted, marginBottom: 8 }}>
              Oder Code eingeben:
            </div>
            <form onSubmit={handleJoin} style={{ display: 'flex', gap: 8 }}>
              <input style={{ ...s.input, flex: 1 }} value={code} onChange={e => setCode(e.target.value.toUpperCase())}
                placeholder="CODE" maxLength={6} />
              <button type="submit" disabled={code.length < 4}
                style={{ ...s.btn, background: colors.accent, color: isArcade ? '#0a0a0a' : '#fff',
                  opacity: code.length < 4 ? 0.5 : 1, flexShrink: 0 }}>
                Zuschauen
              </button>
            </form>
          </div>
        </>
      )}

      {/* Watching a game */}
      {joined && gameInfo && (
        <div style={s.card}>
          <div style={{ fontSize: 16, fontWeight: 800, color: colors.accent, marginBottom: 4 }}>
            {GAME_LABELS[gameInfo.mode] || gameInfo.mode}
          </div>
          <div style={{ fontSize: 12, color: colors.fgMuted }}>
            {gameInfo.playerNames.join(' vs ')} · {phase === 'playing' ? 'Läuft' : phase === 'finished' ? 'Beendet' : 'Lobby'}
          </div>
        </div>
      )}

      {joined && scores.length > 0 && (
        <div style={s.card}>
          <div style={{ fontSize: 13, fontWeight: 700, color: colors.fg, marginBottom: 8 }}>Live-Stand</div>
          {scores.map((p: any) => (
            <div key={p.playerId} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '10px 12px', borderRadius: 8, background: colors.bgCard,
              border: `1px solid ${colors.border}`, marginBottom: 4,
            }}>
              <div style={{ fontWeight: 700, color: colors.fg }}>{p.name}</div>
              <div style={{ fontSize: 24, fontWeight: 900, color: colors.accent }}>{p.remaining}</div>
            </div>
          ))}
        </div>
      )}

      {joined && players.length > 0 && (
        <div style={s.card}>
          <div style={{ fontSize: 13, fontWeight: 700, color: colors.fg, marginBottom: 8 }}>
            Spieler ({players.length})
          </div>
          {players.map(p => (
            <div key={p.playerId} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: p.color || colors.accent }} />
              <div style={{ fontWeight: 600, fontSize: 13, color: colors.fg }}>{p.name}</div>
              {p.isHost && <span style={{ fontSize: 10, color: colors.fgMuted }}>Host</span>}
            </div>
          ))}
        </div>
      )}

      {joined && events.length === 0 && phase === 'lobby' && (
        <div style={{ textAlign: 'center', padding: 20, color: colors.fgMuted, fontSize: 14 }}>
          Warte auf Spielstart...
        </div>
      )}

      {joined && phase === 'finished' && (
        <div style={{ textAlign: 'center', padding: 20 }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: colors.accent }}>Spiel beendet</div>
        </div>
      )}
    </div>
  )
}
