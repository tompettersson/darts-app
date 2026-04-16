import React from 'react'
import { useTheme } from '../ThemeProvider'
import type { ActiveGame } from '../db/storage'

type Props = {
  games: ActiveGame[]
  onSelect: (game: ActiveGame) => void
  onDiscard: (gameId: string) => void
  onBack: () => void
}

// Game type display info
const GAME_TYPE_INFO: Record<string, { label: string; color: string }> = {
  x01: { label: 'X01', color: '#3b82f6' },
  cricket: { label: 'Cricket', color: '#10b981' },
  atb: { label: 'ATB', color: '#f59e0b' },
  str: { label: 'Sträußchen', color: '#ec4899' },
  ctf: { label: 'CTF', color: '#8b5cf6' },
  shanghai: { label: 'Shanghai', color: '#ef4444' },
  killer: { label: 'Killer', color: '#f97316' },
  bobs27: { label: "Bob's 27", color: '#06b6d4' },
  operation: { label: 'Operation', color: '#84cc16' },
  highscore: { label: 'Highscore', color: '#d946ef' },
}

function formatRelativeDate(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'Gerade eben'
  if (minutes < 60) return `vor ${minutes} Min.`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `vor ${hours} Std.`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'Gestern'
  return `vor ${days} Tagen`
}

function getConfigSummary(game: ActiveGame): string {
  const c = game.config
  if (!c) return ''
  switch (game.gameType) {
    case 'x01': return [c.startingScore, c.outRule].filter(Boolean).join(' · ')
    case 'cricket': return [c.style, c.range].filter(Boolean).join(' · ')
    case 'atb': return [c.mode, c.direction].filter(Boolean).join(' · ')
    default: return ''
  }
}

function getPlayerNames(game: ActiveGame): string {
  if (!game.players || game.players.length === 0) return ''
  return game.players.map(p => p.name).filter(Boolean).join(', ')
}

export default function OpenGames({ games, onSelect, onDiscard, onBack }: Props) {
  const { colors } = useTheme()

  return (
    <div style={{
      minHeight: '100dvh',
      background: colors.bg,
      padding: '12px 16px calc(env(safe-area-inset-bottom, 0px) + 20px)',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20,
      }}>
        <h2 style={{ margin: 0, color: colors.fg, fontSize: 20, fontWeight: 700 }}>
          Spiel fortsetzen
        </h2>
        <button
          onClick={onBack}
          style={{
            padding: '8px 16px',
            borderRadius: 8,
            border: `1px solid ${colors.border}`,
            background: colors.bgCard,
            color: colors.fg,
            cursor: 'pointer',
            fontSize: 14,
          }}
        >
          ← Zurück
        </button>
      </div>

      {/* Empty state */}
      {games.length === 0 && (
        <div style={{
          textAlign: 'center',
          padding: 60,
          color: colors.fgMuted,
          fontSize: 15,
        }}>
          Keine offenen Spiele
        </div>
      )}

      {/* Game cards */}
      <div style={{ display: 'grid', gap: 12, maxWidth: 520, margin: '0 auto' }}>
        {games.map(game => {
          const info = GAME_TYPE_INFO[game.gameType] ?? { label: game.gameType, color: '#6b7280' }
          const playerNames = getPlayerNames(game)
          const configSummary = getConfigSummary(game)

          return (
            <div
              key={game.id}
              onClick={() => onSelect(game)}
              style={{
                background: colors.bgCard,
                borderRadius: 12,
                padding: 16,
                cursor: 'pointer',
                border: `1px solid ${colors.border}`,
                boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                display: 'flex',
                gap: 12,
                alignItems: 'center',
                transition: 'transform 0.1s',
                WebkitTapHighlightColor: 'transparent',
                position: 'relative' as const,
              }}
            >
              {/* Color accent bar */}
              <div style={{
                width: 4,
                alignSelf: 'stretch',
                borderRadius: 2,
                background: info.color,
                flexShrink: 0,
              }} />

              {/* Content */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 4,
                }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{
                      fontSize: 11,
                      fontWeight: 700,
                      textTransform: 'uppercase' as const,
                      letterSpacing: '0.05em',
                      color: info.color,
                    }}>
                      {info.label}
                    </span>
                    {game.isMultiplayer && (
                      <span style={{
                        fontSize: 9,
                        fontWeight: 700,
                        textTransform: 'uppercase' as const,
                        letterSpacing: '0.05em',
                        padding: '2px 6px',
                        borderRadius: 4,
                        background: '#3b82f620',
                        color: '#3b82f6',
                        border: '1px solid #3b82f640',
                      }}>
                        Online
                      </span>
                    )}
                  </span>
                  <span style={{ fontSize: 12, color: colors.fgMuted }}>
                    {formatRelativeDate(game.startedAt)}
                  </span>
                </div>

                <div style={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: colors.fg,
                  marginBottom: configSummary ? 4 : 0,
                  lineHeight: 1.3,
                  wordBreak: 'break-word' as const,
                }}>
                  {game.title}
                </div>

                {configSummary && (
                  <div style={{ fontSize: 12, color: colors.fgMuted, lineHeight: 1.3 }}>
                    {configSummary}
                  </div>
                )}
              </div>

              {/* Discard button */}
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  if (confirm('Spiel verwerfen?')) onDiscard(game.id)
                }}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  border: `1px solid ${colors.border}`,
                  background: 'transparent',
                  color: colors.fgMuted,
                  cursor: 'pointer',
                  fontSize: 16,
                  display: 'grid',
                  placeItems: 'center',
                  flexShrink: 0,
                }}
                title="Spiel verwerfen"
              >
                ×
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
