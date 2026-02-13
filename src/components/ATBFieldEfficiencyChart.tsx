// src/components/ATBFieldEfficiencyChart.tsx
// Bar Chart für ATB: Darts pro Feld im Vergleich zwischen Spielern

import React, { useMemo } from 'react'
import { useTheme } from '../ThemeProvider'
import type { FieldStats } from '../stats/computeATBStats'

type PlayerData = {
  playerId: string
  name: string
  color: string
  statsPerField: Record<string, FieldStats>
  isWinner?: boolean
}

type Props = {
  players: PlayerData[]
  sequence: readonly (number | 'BULL')[]  // Die Reihenfolge der Felder
}

// Farbkodierung basierend auf Darts pro Feld
function getEfficiencyColor(darts: number, colors: { success: string; warning: string; error: string; fgMuted: string }): string {
  if (darts === 0) return colors.fgMuted  // Nicht gespielt
  if (darts <= 1.5) return colors.success  // Sehr effizient (1 Dart)
  if (darts <= 2.5) return colors.warning  // Normal (2 Darts)
  return colors.error  // Langsam (3+ Darts)
}

export default function ATBFieldEfficiencyChart({ players, sequence }: Props) {
  const { colors } = useTheme()

  // Berechne max Darts für Skalierung (mindestens 4 für gute Visualisierung)
  const maxDarts = useMemo(() => {
    let max = 4
    for (const player of players) {
      for (const field of sequence) {
        const fieldKey = String(field)
        const fieldStats = player.statsPerField[fieldKey]
        if (fieldStats && fieldStats.darts > max) {
          max = fieldStats.darts
        }
      }
    }
    return max
  }, [players, sequence])

  // Berechne welche Felder tatsächlich gespielt wurden (irgendein Spieler hat attempts > 0)
  const playedFields = useMemo(() => {
    return sequence.filter(field => {
      const fieldKey = String(field)
      return players.some(p => {
        const stats = p.statsPerField[fieldKey]
        return stats && stats.attempts > 0
      })
    })
  }, [players, sequence])

  if (playedFields.length === 0) {
    return (
      <div style={{ padding: 16, textAlign: 'center', color: colors.fgMuted }}>
        Keine Felddaten vorhanden
      </div>
    )
  }

  const barHeight = players.length === 1 ? 20 : 12
  const fieldGap = 4
  const barGap = 2

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* Legende */}
      <div style={{
        display: 'flex',
        gap: 16,
        justifyContent: 'center',
        fontSize: 11,
        color: colors.fgDim,
        flexWrap: 'wrap',
        marginBottom: 4,
      }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 12, height: 12, background: colors.success, borderRadius: 2 }} />
          1 Dart
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 12, height: 12, background: colors.warning, borderRadius: 2 }} />
          2 Darts
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 12, height: 12, background: colors.error, borderRadius: 2 }} />
          3+ Darts
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{
            width: 12,
            height: 12,
            background: 'transparent',
            border: `2px solid ${colors.success}`,
            borderRadius: '50%',
          }} />
          First-Dart-Hit
        </span>
      </div>

      {/* Chart */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: fieldGap,
        maxHeight: 350,
        overflowY: 'auto',
      }}>
        {playedFields.map(field => {
          const fieldKey = String(field)
          const displayName = field === 'BULL' ? 'Bull' : String(field)

          return (
            <div
              key={fieldKey}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              {/* Feldname */}
              <div style={{
                minWidth: 36,
                fontSize: 12,
                fontWeight: 600,
                color: colors.fg,
                textAlign: 'right',
              }}>
                {displayName}
              </div>

              {/* Balken für alle Spieler */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: barGap }}>
                {players.map((player, playerIdx) => {
                  const fieldStats = player.statsPerField[fieldKey]
                  const darts = fieldStats?.darts ?? 0
                  const attempts = fieldStats?.attempts ?? 0
                  const firstDartHits = fieldStats?.firstDartHits ?? 0
                  const isFirstDartHit = firstDartHits > 0

                  // Wenn Feld nicht gespielt, zeige leeren Balken
                  if (attempts === 0) {
                    return (
                      <div
                        key={player.playerId}
                        style={{
                          height: barHeight,
                          background: colors.bgMuted,
                          borderRadius: 3,
                          opacity: 0.3,
                        }}
                      />
                    )
                  }

                  const widthPercent = (darts / maxDarts) * 100
                  const barColor = getEfficiencyColor(darts, colors)

                  return (
                    <div
                      key={player.playerId}
                      style={{
                        position: 'relative',
                        height: barHeight,
                        background: colors.bgMuted,
                        borderRadius: 3,
                        overflow: 'hidden',
                      }}
                    >
                      {/* Balken */}
                      <div
                        style={{
                          position: 'absolute',
                          left: 0,
                          top: 0,
                          height: '100%',
                          width: `${widthPercent}%`,
                          minWidth: 4,
                          background: barColor,
                          borderRadius: 3,
                          opacity: 0.8,
                          transition: 'width 0.3s ease',
                        }}
                      />

                      {/* First-Dart-Hit Indikator */}
                      {isFirstDartHit && (
                        <div
                          style={{
                            position: 'absolute',
                            right: 4,
                            top: '50%',
                            transform: 'translateY(-50%)',
                            width: barHeight - 4,
                            height: barHeight - 4,
                            border: `2px solid ${colors.success}`,
                            borderRadius: '50%',
                            background: 'rgba(34, 197, 94, 0.2)',
                          }}
                        />
                      )}

                      {/* Dart-Zahl (bei größeren Balken) */}
                      {darts > 0 && barHeight >= 16 && (
                        <div
                          style={{
                            position: 'absolute',
                            left: 6,
                            top: '50%',
                            transform: 'translateY(-50%)',
                            fontSize: 10,
                            fontWeight: 700,
                            color: colors.bg,
                            textShadow: '0 1px 2px rgba(0,0,0,0.3)',
                          }}
                        >
                          {darts}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Darts-Werte rechts */}
              <div style={{
                minWidth: 50,
                display: 'flex',
                gap: 4,
                fontSize: 11,
                fontFamily: 'monospace',
              }}>
                {players.map((player, idx) => {
                  const fieldStats = player.statsPerField[fieldKey]
                  const darts = fieldStats?.darts ?? 0
                  const attempts = fieldStats?.attempts ?? 0

                  if (attempts === 0) {
                    return (
                      <span
                        key={player.playerId}
                        style={{
                          color: colors.fgMuted,
                          minWidth: players.length > 1 ? 20 : 'auto',
                          textAlign: 'center',
                        }}
                      >
                        —
                      </span>
                    )
                  }

                  return (
                    <span
                      key={player.playerId}
                      style={{
                        color: player.color,
                        fontWeight: 600,
                        minWidth: players.length > 1 ? 20 : 'auto',
                        textAlign: 'center',
                      }}
                    >
                      {darts}
                    </span>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      {/* Spieler-Legende (bei mehreren Spielern) */}
      {players.length > 1 && (
        <div style={{
          display: 'flex',
          gap: 16,
          justifyContent: 'center',
          marginTop: 8,
          fontSize: 12,
        }}>
          {players.map((player, idx) => (
            <span
              key={player.playerId}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                color: player.color,
                fontWeight: 600,
              }}
            >
              <span style={{
                width: 12,
                height: 12,
                background: player.color,
                borderRadius: 2,
                opacity: 0.8,
              }} />
              {player.name} {player.isWinner && '🏆'}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
