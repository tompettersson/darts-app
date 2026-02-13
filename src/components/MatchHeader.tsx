// src/components/MatchHeader.tsx
// Einheitlicher Match-Header für alle Spielmodi (X01, Cricket, ATB)

import React, { useMemo } from 'react'
import { getThemedUI } from '../ui'
import { useTheme } from '../ThemeProvider'

export type MatchHeaderPlayer = {
  id: string
  name: string
  color?: string
  legsWon: number
  setsWon?: number
}

type Props = {
  // Spielinfo
  gameName?: string          // z.B. "Freitagsspiel"
  gameMode: string           // z.B. "501 Double Out", "Cricket Short L"

  // Spieler & Ergebnis
  players: MatchHeaderPlayer[]
  winnerId?: string

  // Spielstand
  legScore: string           // z.B. "3:2:0"
  setScore?: string          // z.B. "2:1" (optional)

  // Zeit
  durationMs?: number
  playedAt?: string          // ISO timestamp

  // Navigation
  onBack: () => void
}

// Medaillen-Farben
const MEDAL_COLORS = {
  gold: '#fbbf24',
  silver: '#9ca3af',
  bronze: '#d97706',
}

function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000)
  const min = Math.floor(totalSec / 60)
  const sec = totalSec % 60
  return `${min}:${sec.toString().padStart(2, '0')}`
}

function formatDate(s?: string): string {
  if (!s) return ''
  return new Date(s).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function MatchHeader({
  gameName,
  gameMode,
  players,
  winnerId,
  legScore,
  setScore,
  durationMs,
  playedAt,
  onBack,
}: Props) {
  const { isArcade, colors } = useTheme()
  const styles = useMemo(() => getThemedUI(colors, isArcade), [colors, isArcade])

  // Spieler nach Legs sortieren für Podium
  const sortedPlayers = [...players].sort((a, b) => b.legsWon - a.legsWon)

  // Medaille für Position
  const getMedal = (index: number) => {
    if (index === 0) return { emoji: '🥇', color: MEDAL_COLORS.gold }
    if (index === 1) return { emoji: '🥈', color: MEDAL_COLORS.silver }
    if (index === 2) return { emoji: '🥉', color: MEDAL_COLORS.bronze }
    return null
  }

  // Anzeigetitel: Spielname oder Modus als Fallback
  const displayTitle = gameName || gameMode

  return (
    <>
      {/* Header Row */}
      <div style={styles.headerRow}>
        <h2 style={{ margin: 0, fontSize: 18, color: colors.fg }}>Match-Statistik</h2>
        <button style={styles.backBtn} onClick={onBack}>← Zurück</button>
      </div>

      {/* Match Info Card */}
      <div style={{
        ...styles.card,
        textAlign: 'center',
        padding: '20px 16px',
      }}>
        {/* Spielname */}
        <div style={{
          fontSize: 22,
          fontWeight: 700,
          marginBottom: 4,
          color: colors.fg,
        }}>
          {displayTitle}
        </div>

        {/* Spielmodus (nur wenn Spielname vorhanden) */}
        {gameName && (
          <div style={{
            fontSize: 14,
            color: colors.fgDim,
            marginBottom: 16,
          }}>
            {gameMode}
          </div>
        )}

        {!gameName && <div style={{ marginBottom: 16 }} />}

        {/* Spieler-Podium */}
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          gap: 16,
          flexWrap: 'wrap',
          marginBottom: 16,
        }}>
          {sortedPlayers.map((player, idx) => {
            const medal = getMedal(idx)
            const isWinner = player.id === winnerId
            const playerColor = player.color || colors.fgDim

            return (
              <div
                key={player.id}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  padding: '12px 16px',
                  background: isWinner ? colors.successBg : colors.bgMuted,
                  borderRadius: 12,
                  border: isWinner ? `2px solid ${colors.success}` : `1px solid ${colors.border}`,
                  minWidth: 100,
                }}
              >
                {/* Medaille */}
                {medal && (
                  <span style={{ fontSize: 24, marginBottom: 4 }}>{medal.emoji}</span>
                )}

                {/* Spielername */}
                <span style={{
                  fontWeight: 700,
                  fontSize: 16,
                  color: playerColor,
                }}>
                  {player.name}
                </span>

                {/* Legs gewonnen */}
                <span style={{
                  fontSize: 13,
                  color: colors.fgDim,
                  marginTop: 4,
                }}>
                  {player.legsWon} {player.legsWon === 1 ? 'Leg' : 'Legs'}
                </span>

                {/* Sets (falls vorhanden) */}
                {player.setsWon !== undefined && player.setsWon > 0 && (
                  <span style={{
                    fontSize: 12,
                    color: colors.fgMuted,
                  }}>
                    {player.setsWon} {player.setsWon === 1 ? 'Set' : 'Sets'}
                  </span>
                )}
              </div>
            )
          })}
        </div>

        {/* Endstand */}
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          gap: 16,
          alignItems: 'center',
          flexWrap: 'wrap',
        }}>
          {/* Legs-Endstand */}
          <div style={{
            background: colors.bgMuted,
            padding: '6px 16px',
            borderRadius: 8,
          }}>
            <span style={{ fontSize: 12, color: colors.fgDim }}>Legs: </span>
            <span style={{
              fontSize: 20,
              fontWeight: 800,
              fontVariantNumeric: 'tabular-nums',
              color: colors.fg,
            }}>
              {legScore}
            </span>
          </div>

          {/* Sets-Endstand (falls vorhanden) */}
          {setScore && (
            <div style={{
              background: colors.accentSoft,
              padding: '6px 16px',
              borderRadius: 8,
            }}>
              <span style={{ fontSize: 12, color: colors.accent }}>Sets: </span>
              <span style={{
                fontSize: 20,
                fontWeight: 800,
                fontVariantNumeric: 'tabular-nums',
                color: colors.fg,
              }}>
                {setScore}
              </span>
            </div>
          )}
        </div>

        {/* Dauer & Datum */}
        <div style={{
          marginTop: 16,
          display: 'flex',
          justifyContent: 'center',
          gap: 16,
          color: colors.fgDim,
          fontSize: 13,
          flexWrap: 'wrap',
        }}>
          {durationMs !== undefined && durationMs > 0 && (
            <span>
              Dauer: <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{formatDuration(durationMs)}</strong>
            </span>
          )}
          {playedAt && (
            <span>{formatDate(playedAt)}</span>
          )}
        </div>
      </div>
    </>
  )
}
