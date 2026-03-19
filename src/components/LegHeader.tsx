// src/components/LegHeader.tsx
// Einheitlicher Leg-Header für alle Spielmodi (X01, Cricket, ATB)

import React, { useMemo } from 'react'
import { getThemedUI } from '../ui'
import { useTheme } from '../ThemeProvider'

export type LegHeaderPlayer = {
  id: string
  name: string
  color?: string
}

type Props = {
  // Leg-Info
  legNumber: number
  setNumber?: number

  // Spielinfo
  gameName?: string
  gameMode: string

  // Spieler
  players: LegHeaderPlayer[]
  winnerId?: string

  // Spielstand nach diesem Leg
  scoreAfterLeg: string      // z.B. "1:2:0"

  // Zeit
  legDurationMs?: number

  // Navigation
  onBack: () => void
  onPrevLeg?: () => void
  onNextLeg?: () => void
  hasPrev: boolean
  hasNext: boolean
}

function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000)
  const min = Math.floor(totalSec / 60)
  const sec = totalSec % 60
  return `${min}:${sec.toString().padStart(2, '0')}`
}

export default function LegHeader({
  legNumber,
  setNumber,
  gameName,
  gameMode,
  players,
  winnerId,
  scoreAfterLeg,
  legDurationMs,
  onBack,
  onPrevLeg,
  onNextLeg,
  hasPrev,
  hasNext,
}: Props) {
  const { isArcade, colors } = useTheme()
  const styles = useMemo(() => getThemedUI(colors, isArcade), [colors, isArcade])

  const winner = players.find(p => p.id === winnerId)
  const winnerColor = winner?.color || colors.success

  // Leg-Titel
  const legTitle = setNumber ? `Set ${setNumber} · Leg ${legNumber}` : `Leg ${legNumber}`

  // Anzeigetitel: Spielname oder Modus als Fallback
  const displayTitle = gameName || gameMode

  return (
    <>
      {/* Header Row mit Navigation */}
      <div style={styles.headerRow}>
        <button style={styles.backBtn} onClick={onBack}>← Zurück</button>

        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 16,
        }}>
          {/* Prev Button */}
          <button
            onClick={onPrevLeg}
            disabled={!hasPrev}
            aria-label="Vorheriges Leg"
            style={{
              background: 'none',
              border: 'none',
              fontSize: 24,
              cursor: hasPrev ? 'pointer' : 'default',
              opacity: hasPrev ? 1 : 0.3,
              padding: '4px 8px',
              color: colors.fg,
            }}
          >
            ←
          </button>

          {/* Leg-Titel */}
          <h2 style={{ margin: 0, fontSize: 20, color: colors.fg }}>{legTitle}</h2>

          {/* Next Button */}
          <button
            onClick={onNextLeg}
            disabled={!hasNext}
            aria-label="Nächstes Leg"
            style={{
              background: 'none',
              border: 'none',
              fontSize: 24,
              cursor: hasNext ? 'pointer' : 'default',
              opacity: hasNext ? 1 : 0.3,
              padding: '4px 8px',
              color: colors.fg,
            }}
          >
            →
          </button>
        </div>

        <div style={{ width: 80 }} /> {/* Spacer für Symmetrie */}
      </div>

      {/* Leg Info Card */}
      <div style={{
        ...styles.card,
        textAlign: 'center',
        padding: '16px',
      }}>
        {/* Spieler */}
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          gap: 8,
          alignItems: 'center',
          flexWrap: 'wrap',
          marginBottom: 12,
        }}>
          {players.map((player, idx) => {
            const isWinner = player.id === winnerId
            const playerColor = player.color || colors.fgDim

            return (
              <React.Fragment key={player.id}>
                {idx > 0 && <span style={{ color: colors.fgMuted }}>vs</span>}
                <span style={{
                  fontWeight: isWinner ? 800 : 600,
                  fontSize: isWinner ? 17 : 15,
                  color: playerColor,
                  textDecoration: isWinner ? 'underline' : 'none',
                  textDecorationColor: playerColor,
                  textUnderlineOffset: 3,
                }}>
                  {player.name}
                </span>
              </React.Fragment>
            )
          })}
        </div>

        {/* Sieger-Banner */}
        {winner && (
          <div style={{
            background: `${winnerColor}15`,
            border: `2px solid ${winnerColor}`,
            borderRadius: 10,
            padding: '10px 16px',
            marginBottom: 12,
          }}>
            <span style={{
              fontSize: 16,
              fontWeight: 700,
              color: winnerColor,
            }}>
              ★ {winner.name} gewinnt Leg {legNumber} ★
            </span>
          </div>
        )}

        {/* Spielstand nach diesem Leg */}
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          gap: 8,
          marginBottom: 12,
        }}>
          <span style={{ fontSize: 13, color: colors.fgDim }}>Spielstand:</span>
          <span style={{
            fontSize: 22,
            fontWeight: 800,
            fontVariantNumeric: 'tabular-nums',
            background: colors.bgMuted,
            padding: '4px 12px',
            borderRadius: 6,
            color: colors.fg,
          }}>
            {scoreAfterLeg}
          </span>
        </div>

        {/* Spielinfo-Zeile */}
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          gap: 12,
          alignItems: 'center',
          flexWrap: 'wrap',
          fontSize: 13,
          color: colors.fgDim,
        }}>
          <span style={{ fontWeight: 600 }}>{displayTitle}</span>

          {gameName && (
            <>
              <span>•</span>
              <span>{gameMode}</span>
            </>
          )}

          {legDurationMs !== undefined && legDurationMs > 0 && (
            <>
              <span>•</span>
              <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                {formatDuration(legDurationMs)}
              </span>
            </>
          )}
        </div>
      </div>
    </>
  )
}
