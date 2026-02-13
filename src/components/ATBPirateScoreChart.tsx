// src/components/ATBPirateScoreChart.tsx
// Pseudo-3D Säulendiagramm für ATB Piratenmodus - zeigt Punkte pro Spieler pro Feld

import React from 'react'
import { useTheme } from '../ThemeProvider'

type RoundData = {
  fieldNumber: number | 'BULL'
  scoresByPlayer: Record<string, number>
  winnerId: string | null
}

type PlayerInfo = {
  playerId: string
  name: string
  color: string
}

type Props = {
  rounds: RoundData[]
  players: PlayerInfo[]
}

// Hilfsfunktionen für Farbanpassung (heller/dunkler für 3D-Effekt)
function lightenColor(hex: string, percent: number): string {
  const num = parseInt(hex.replace('#', ''), 16)
  const r = Math.min(255, Math.floor((num >> 16) + (255 - (num >> 16)) * percent))
  const g = Math.min(255, Math.floor(((num >> 8) & 0x00FF) + (255 - ((num >> 8) & 0x00FF)) * percent))
  const b = Math.min(255, Math.floor((num & 0x0000FF) + (255 - (num & 0x0000FF)) * percent))
  return `rgb(${r}, ${g}, ${b})`
}

function darkenColor(hex: string, percent: number): string {
  const num = parseInt(hex.replace('#', ''), 16)
  const r = Math.floor((num >> 16) * (1 - percent))
  const g = Math.floor(((num >> 8) & 0x00FF) * (1 - percent))
  const b = Math.floor((num & 0x0000FF) * (1 - percent))
  return `rgb(${r}, ${g}, ${b})`
}

export default function ATBPirateScoreChart({ rounds, players }: Props) {
  const { colors } = useTheme()

  if (rounds.length === 0 || players.length === 0) {
    return <div style={{ color: colors.fgMuted, padding: 16 }}>Keine Daten verfügbar</div>
  }

  // Chart-Dimensionen
  const chartWidth = 700
  const chartHeight = 280
  const paddingLeft = 40
  const paddingRight = 20
  const paddingTop = 20
  const paddingBottom = 50

  const graphWidth = chartWidth - paddingLeft - paddingRight
  const graphHeight = chartHeight - paddingTop - paddingBottom

  // Max Score für Y-Achse berechnen (mindestens 9 für Triple)
  const maxScore = Math.max(
    9,
    ...rounds.flatMap(r => Object.values(r.scoresByPlayer))
  )

  // Säulen-Dimensionen
  const numRounds = rounds.length
  const numPlayers = players.length
  const groupWidth = graphWidth / numRounds
  const barWidth = Math.min(20, (groupWidth - 8) / numPlayers) // Max 20px, mit Abstand
  const depth3D = 6 // 3D-Tiefe in Pixeln

  // Y-Achsen-Ticks
  const yTicks = [0, 3, 6, 9]
  if (maxScore > 9) {
    yTicks.push(12)
    if (maxScore > 12) yTicks.push(15)
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg width={chartWidth} height={chartHeight + 40} style={{ display: 'block' }}>
        {/* Hintergrund-Raster */}
        {yTicks.map(tick => {
          const y = paddingTop + graphHeight - (tick / maxScore) * graphHeight
          return (
            <g key={tick}>
              <line
                x1={paddingLeft}
                y1={y}
                x2={chartWidth - paddingRight}
                y2={y}
                stroke={colors.border}
                strokeWidth={1}
                strokeDasharray={tick === 0 ? 'none' : '4,4'}
                opacity={0.5}
              />
              <text
                x={paddingLeft - 8}
                y={y + 4}
                textAnchor="end"
                fontSize={11}
                fill={colors.fgMuted}
              >
                {tick}
              </text>
            </g>
          )
        })}

        {/* Y-Achsen-Label */}
        <text
          x={12}
          y={paddingTop + graphHeight / 2}
          textAnchor="middle"
          fontSize={11}
          fill={colors.fgMuted}
          transform={`rotate(-90, 12, ${paddingTop + graphHeight / 2})`}
        >
          Punkte
        </text>

        {/* Säulengruppen pro Feld */}
        {rounds.map((round, roundIdx) => {
          const groupX = paddingLeft + roundIdx * groupWidth + groupWidth / 2
          const fieldLabel = round.fieldNumber === 'BULL' ? 'B' : String(round.fieldNumber)

          return (
            <g key={roundIdx}>
              {/* X-Achsen-Label (Feldnummer) */}
              <text
                x={groupX}
                y={chartHeight - paddingBottom + 18}
                textAnchor="middle"
                fontSize={10}
                fill={colors.fgMuted}
                fontWeight={round.winnerId ? 600 : 400}
              >
                {fieldLabel}
              </text>

              {/* Säulen für jeden Spieler */}
              {players.map((player, playerIdx) => {
                const score = round.scoresByPlayer[player.playerId] ?? 0
                const barHeight = (score / maxScore) * graphHeight
                const barX = groupX - (numPlayers * barWidth) / 2 + playerIdx * barWidth
                const barY = paddingTop + graphHeight - barHeight

                const isWinner = round.winnerId === player.playerId

                // Farben für 3D-Effekt
                const frontColor = player.color
                const topColor = lightenColor(player.color, 0.3)
                const sideColor = darkenColor(player.color, 0.3)

                if (score === 0) {
                  // Leere Säule als dünne Linie anzeigen
                  return (
                    <line
                      key={player.playerId}
                      x1={barX + barWidth / 2}
                      y1={paddingTop + graphHeight}
                      x2={barX + barWidth / 2}
                      y2={paddingTop + graphHeight - 2}
                      stroke={colors.fgMuted}
                      strokeWidth={2}
                      opacity={0.3}
                    />
                  )
                }

                return (
                  <g key={player.playerId}>
                    {/* Schatten */}
                    <rect
                      x={barX + 2}
                      y={barY + 2}
                      width={barWidth - 1}
                      height={barHeight}
                      fill="rgba(0,0,0,0.15)"
                      rx={1}
                    />

                    {/* Seitenfläche (rechts) - 3D-Effekt */}
                    <polygon
                      points={`
                        ${barX + barWidth - 1},${barY}
                        ${barX + barWidth - 1 + depth3D},${barY - depth3D / 2}
                        ${barX + barWidth - 1 + depth3D},${paddingTop + graphHeight - depth3D / 2}
                        ${barX + barWidth - 1},${paddingTop + graphHeight}
                      `}
                      fill={sideColor}
                    />

                    {/* Oberfläche (oben) - 3D-Effekt */}
                    <polygon
                      points={`
                        ${barX},${barY}
                        ${barX + depth3D},${barY - depth3D / 2}
                        ${barX + barWidth - 1 + depth3D},${barY - depth3D / 2}
                        ${barX + barWidth - 1},${barY}
                      `}
                      fill={topColor}
                    />

                    {/* Hauptfläche (vorne) */}
                    <rect
                      x={barX}
                      y={barY}
                      width={barWidth - 1}
                      height={barHeight}
                      fill={frontColor}
                      rx={1}
                    />

                    {/* Gewinner-Indikator */}
                    {isWinner && (
                      <circle
                        cx={barX + barWidth / 2}
                        cy={barY - 8}
                        r={4}
                        fill={colors.warning}
                        stroke={colors.bgMuted}
                        strokeWidth={1}
                      />
                    )}

                    {/* Score-Label auf der Säule (wenn groß genug) */}
                    {barHeight > 20 && (
                      <text
                        x={barX + barWidth / 2}
                        y={barY + barHeight / 2 + 4}
                        textAnchor="middle"
                        fontSize={9}
                        fill="#fff"
                        fontWeight={600}
                      >
                        {score}
                      </text>
                    )}
                  </g>
                )
              })}
            </g>
          )
        })}
      </svg>

      {/* Legende */}
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        gap: 16,
        marginTop: 8,
        flexWrap: 'wrap',
      }}>
        {players.map(player => (
          <div
            key={player.playerId}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 12,
            }}
          >
            <div
              style={{
                width: 14,
                height: 14,
                backgroundColor: player.color,
                borderRadius: 2,
                boxShadow: `2px 2px 0 ${darkenColor(player.color, 0.3)}`,
              }}
            />
            <span style={{ color: colors.fg }}>{player.name}</span>
          </div>
        ))}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 12,
            marginLeft: 8,
          }}
        >
          <div
            style={{
              width: 10,
              height: 10,
              backgroundColor: colors.warning,
              borderRadius: '50%',
            }}
          />
          <span style={{ color: colors.fgMuted }}>Gewinner</span>
        </div>
      </div>
    </div>
  )
}
