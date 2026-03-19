// src/components/ShanghaiHitChart.tsx
// Pseudo-3D Säulendiagramm für Shanghai - zeigt normalisierte Trefferwerte pro Runde/Spieler

import React from 'react'
import { useTheme } from '../ThemeProvider'
import type { ShanghaiEvent, ShanghaiTurnAddedEvent } from '../types/shanghai'

type PlayerInfo = {
  playerId: string
  name: string
  color: string
}

type Props = {
  events: ShanghaiEvent[]
  players: PlayerInfo[]
  currentRound: number
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

export default function ShanghaiHitChart({ events, players, currentRound }: Props) {
  const { colors } = useTheme()

  // Nur TurnAdded Events aus dem aktuellen Leg extrahieren
  // Finde den letzten LegStarted-Index, um nur das aktuelle Leg zu zeigen
  let legStartIdx = 0
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i].type === 'ShanghaiLegStarted') {
      legStartIdx = i
      break
    }
  }

  const turnEvents = events
    .slice(legStartIdx)
    .filter((e): e is ShanghaiTurnAddedEvent => e.type === 'ShanghaiTurnAdded')

  // Runden 1 bis currentRound (nur bereits gespielte Runden zeigen)
  const maxRound = Math.max(1, currentRound)
  const rounds: number[] = []
  for (let i = 1; i <= maxRound; i++) rounds.push(i)

  if (rounds.length === 0 || players.length === 0) {
    return null
  }

  // Normalisierte Scores pro Runde/Spieler berechnen
  // turnScore / targetNumber = normalisierter Hit-Wert (0-9)
  const scoresByRound: Record<number, Record<string, number>> = {}
  for (const turn of turnEvents) {
    if (!scoresByRound[turn.targetNumber]) {
      scoresByRound[turn.targetNumber] = {}
    }
    scoresByRound[turn.targetNumber][turn.playerId] =
      turn.targetNumber > 0 ? turn.turnScore / turn.targetNumber : 0
  }

  // Chart-Dimensionen
  const paddingLeft = 32
  const paddingRight = 20
  const paddingTop = 20
  const paddingBottom = 40
  const chartHeight = 220
  const numRounds = rounds.length
  const numPlayers = players.length
  const minGroupWidth = 30
  const minWidth = paddingLeft + paddingRight + numRounds * minGroupWidth
  const chartWidth = Math.max(700, minWidth)

  const graphWidth = chartWidth - paddingLeft - paddingRight
  const graphHeight = chartHeight - paddingTop - paddingBottom

  const maxScore = 9 // S+D+T normalisiert = 1+2+3 pro Dart, max 9 bei 3 Triples
  const yTicks = [0, 3, 6, 9]

  // Säulen-Dimensionen
  const groupWidth = graphWidth / numRounds
  const barWidth = Math.min(16, (groupWidth - 6) / numPlayers)
  const depth3D = 5

  return (
    <div style={{
      background: colors.bgCard,
      borderRadius: 12,
      padding: '12px 16px',
      border: `1px solid ${colors.border}`,
    }}>
      <div style={{ fontSize: 11, color: colors.fgDim, marginBottom: 8, textAlign: 'center' }}>
        TREFFERWERTE PRO RUNDE
      </div>

      <div style={{ overflowX: 'auto' }}>
        <svg width={chartWidth} height={chartHeight + 30} style={{ display: 'block' }}>
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
                  x={paddingLeft - 6}
                  y={y + 4}
                  textAnchor="end"
                  fontSize={10}
                  fill={colors.fgMuted}
                >
                  {tick}
                </text>
              </g>
            )
          })}

          {/* Y-Achsen-Label */}
          <text
            x={10}
            y={paddingTop + graphHeight / 2}
            textAnchor="middle"
            fontSize={10}
            fill={colors.fgMuted}
            transform={`rotate(-90, 10, ${paddingTop + graphHeight / 2})`}
          >
            Hits
          </text>

          {/* Säulengruppen pro Runde */}
          {rounds.map((roundNum, roundIdx) => {
            const groupX = paddingLeft + roundIdx * groupWidth + groupWidth / 2
            const isCurrentRound = roundNum === currentRound

            return (
              <g key={roundNum}>
                {/* X-Achsen-Label (Rundennummer) */}
                <text
                  x={groupX}
                  y={chartHeight - paddingBottom + 16}
                  textAnchor="middle"
                  fontSize={9}
                  fill={isCurrentRound ? colors.ledOn : colors.fgMuted}
                  fontWeight={isCurrentRound ? 700 : 400}
                >
                  {roundNum}
                </text>

                {/* Säulen für jeden Spieler */}
                {players.map((player, playerIdx) => {
                  const normalizedScore = scoresByRound[roundNum]?.[player.playerId] ?? 0
                  const barHeight = (normalizedScore / maxScore) * graphHeight
                  const barX = groupX - (numPlayers * barWidth) / 2 + playerIdx * barWidth
                  const barY = paddingTop + graphHeight - barHeight

                  const frontColor = player.color
                  const topColor = lightenColor(player.color, 0.3)
                  const sideColor = darkenColor(player.color, 0.3)

                  if (normalizedScore === 0) {
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

                      {/* Score-Label auf der Säule (wenn groß genug) */}
                      {barHeight > 18 && (
                        <text
                          x={barX + barWidth / 2}
                          y={barY + barHeight / 2 + 3}
                          textAnchor="middle"
                          fontSize={8}
                          fill="#fff"
                          fontWeight={600}
                        >
                          {Math.round(normalizedScore)}
                        </text>
                      )}
                    </g>
                  )
                })}
              </g>
            )
          })}
        </svg>
      </div>

      {/* Legende */}
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        gap: 14,
        marginTop: 4,
        flexWrap: 'wrap',
      }}>
        {players.map(player => (
          <div
            key={player.playerId}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              fontSize: 11,
            }}
          >
            <div
              style={{
                width: 12,
                height: 12,
                backgroundColor: player.color,
                borderRadius: 2,
                boxShadow: `2px 2px 0 ${darkenColor(player.color, 0.3)}`,
              }}
            />
            <span style={{ color: colors.fg }}>{player.name}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
