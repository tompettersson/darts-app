// src/components/X01StaircaseChart.tsx
// Staircase-Visualisierung für X01 Leg-Verlauf (abwärts von 501 zu 0)
// Dunkles Theme mit kumulativen Fortschrittsbalken

import React from 'react'

// Farbe abdunkeln
function darkenColor(hex: string, factor: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  const newR = Math.round(r * factor)
  const newG = Math.round(g * factor)
  const newB = Math.round(b * factor)
  return `#${newR.toString(16).padStart(2, '0')}${newG.toString(16).padStart(2, '0')}${newB.toString(16).padStart(2, '0')}`
}

export type X01Visit = {
  visitScore: number       // Geworfene Punkte in diesem Turn
  remainingBefore: number  // Rest VOR diesem Turn
  remainingAfter: number   // Rest NACH diesem Turn
  bust: boolean
  darts: string[]          // Dart-Labels (z.B. ["T20", "T20", "T20"])
  playerId?: string
  playerName?: string
  playerColor?: string
  isCheckout?: boolean     // War das der Checkout?
}

type Props = {
  startScore: number            // 501, 301, etc.
  visits: X01Visit[]
  playerName?: string
  playerColor?: string
  compact?: boolean
  showHeader?: boolean
}

export default function X01StaircaseChart({
  startScore,
  visits,
  playerName = '',
  playerColor = '#3b82f6',
  compact = false,
  showHeader = true,
}: Props) {
  const maxBarWidth = compact ? 120 : 200

  // Spezielle Achievements
  const is180 = (v: X01Visit) => v.visitScore === 180
  const isCheckout = (v: X01Visit) => v.remainingAfter === 0 && !v.bust
  const isHighScore = (v: X01Visit) => v.visitScore >= 140 && v.visitScore < 180

  return (
    <div
      style={{
        background: compact ? 'transparent' : '#111',
        borderRadius: compact ? 0 : 12,
        padding: compact ? '8px 0' : 16,
        border: compact ? 'none' : '1px solid #333',
      }}
    >
      {/* Header */}
      {showHeader && playerName && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginBottom: 12,
            paddingBottom: 8,
            borderBottom: '1px solid #333',
          }}
        >
          <div
            style={{
              width: 10,
              height: 10,
              borderRadius: '50%',
              background: playerColor,
              boxShadow: `0 0 6px ${playerColor}`,
            }}
          />
          <span style={{ fontWeight: 700, color: '#e5e7eb' }}>{playerName}</span>
        </div>
      )}

      {/* Staircase */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: compact ? 4 : 6 }}>
        {visits.map((visit, idx) => {
          // Bei X01: Fortschritt = wie viel vom Start schon verbraucht wurde
          // Start = 0%, Ziel (0) = 100%
          const progressBefore = ((startScore - visit.remainingBefore) / startScore) * maxBarWidth
          const progressAfter = ((startScore - visit.remainingAfter) / startScore) * maxBarWidth
          const currentTurnWidth = visit.bust ? 0 : (progressAfter - progressBefore)

          // Spielerfarbe für diesen Turn
          const visitPlayerColor = visit.playerColor || playerColor

          // Farbe basierend auf Leistung
          const turnColor = visit.bust
            ? '#ef4444'  // Rot für Bust
            : is180(visit)
              ? '#fbbf24'  // Gold für 180
              : isCheckout(visit)
                ? '#4ade80'  // Grün für Checkout
                : isHighScore(visit)
                  ? '#f97316'  // Orange für High Score
                  : visitPlayerColor

          // Hintergrundfarbe der Zeile
          const bgColor = visit.bust
            ? '#450a0a'
            : is180(visit)
              ? '#422006'
              : isCheckout(visit)
                ? '#14532d'
                : isHighScore(visit)
                  ? '#431407'
                  : '#1a1a1a'

          return (
            <div
              key={idx}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: compact ? '4px 8px' : '6px 10px',
                background: bgColor,
                borderRadius: 8,
                border: `1px solid ${isCheckout(visit) ? '#22c55e' : visit.bust ? '#dc2626' : '#333'}`,
              }}
            >
              {/* Turn-Nummer */}
              <div
                style={{
                  width: 20,
                  fontSize: 11,
                  fontWeight: 600,
                  color: '#64748b',
                  textAlign: 'center',
                }}
              >
                {idx + 1}
              </div>

              {/* Spielername (bei Multi-Player-Ansicht) */}
              {visit.playerName && (
                <div
                  style={{
                    width: 60,
                    fontSize: 11,
                    fontWeight: 700,
                    color: visitPlayerColor,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {visit.playerName}
                </div>
              )}

              {/* Kumulativer Fortschritts-Balken */}
              <div
                style={{
                  position: 'relative',
                  height: compact ? 18 : 22,
                  width: maxBarWidth,
                  background: '#333',
                  borderRadius: 4,
                  overflow: 'hidden',
                  display: 'flex',
                }}
              >
                {/* Bisheriger Fortschritt (dunkler) */}
                {progressBefore > 0 && (
                  <div
                    style={{
                      height: '100%',
                      width: progressBefore,
                      background: darkenColor(visitPlayerColor, 0.4),
                      transition: 'width 0.3s ease',
                    }}
                  />
                )}
                {/* Dieser Turn (heller, mit Glow) */}
                {currentTurnWidth > 0 && (
                  <div
                    style={{
                      height: '100%',
                      width: Math.max(currentTurnWidth, 4),
                      background: turnColor,
                      boxShadow: `0 0 8px ${turnColor}`,
                      transition: 'width 0.3s ease',
                    }}
                  />
                )}
                {/* Score-Label im Balken */}
                <div
                  style={{
                    position: 'absolute',
                    left: 6,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    fontSize: compact ? 11 : 12,
                    fontWeight: 800,
                    color: '#fff',
                    textShadow: '0 1px 3px rgba(0,0,0,0.7)',
                  }}
                >
                  {visit.bust ? 'BUST' : `+${visit.visitScore}`}
                </div>
              </div>

              {/* Dart-Labels */}
              <div
                style={{
                  display: 'flex',
                  gap: 4,
                  fontSize: compact ? 10 : 11,
                  fontWeight: 600,
                  color: '#94a3b8',
                  minWidth: compact ? 80 : 100,
                }}
              >
                {visit.darts.slice(0, 3).map((d, i) => (
                  <span
                    key={i}
                    style={{
                      padding: '2px 4px',
                      background: d.startsWith('T') || d === 'DBULL' ? 'rgba(249,115,22,0.2)' : 'transparent',
                      borderRadius: 3,
                      color: d.startsWith('T') || d === 'DBULL' ? '#fb923c' : '#94a3b8',
                    }}
                  >
                    {d}
                  </span>
                ))}
              </div>

              {/* Rest-Anzeige */}
              <div
                style={{
                  marginLeft: 'auto',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                {/* Mini Progress Bar */}
                <div
                  style={{
                    width: 40,
                    height: 4,
                    background: '#333',
                    borderRadius: 2,
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      width: `${Math.min(100, ((startScore - visit.remainingAfter) / startScore) * 100)}%`,
                      height: '100%',
                      background: isCheckout(visit) ? '#22c55e' : visitPlayerColor,
                      transition: 'width 0.3s',
                    }}
                  />
                </div>

                {/* Rest */}
                <span
                  style={{
                    fontSize: compact ? 11 : 12,
                    fontWeight: 700,
                    color: isCheckout(visit) ? '#4ade80' : visit.bust ? '#ef4444' : '#e5e7eb',
                    fontVariantNumeric: 'tabular-nums',
                    minWidth: 35,
                    textAlign: 'right',
                  }}
                >
                  {isCheckout(visit) ? '✓' : visit.remainingAfter}
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
