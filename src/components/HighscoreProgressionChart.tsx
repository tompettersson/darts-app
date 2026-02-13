// src/components/HighscoreProgressionChart.tsx
// Interaktives Liniendiagramm für den Punkteverlauf im Highscore-Spiel
// Y-Achse: 0 (unten) bis targetScore (oben) - Punkte wachsen nach oben

import React, { useRef, useEffect, useState } from 'react'
import { useTheme } from '../ThemeProvider'

// Spielerfarben
export const PLAYER_COLORS = [
  '#3b82f6',  // Blau (Spieler 1)
  '#22c55e',  // Grün (Spieler 2)
  '#f97316',  // Orange (Spieler 3)
  '#ef4444',  // Rot (Spieler 4)
  '#8b5cf6',  // Lila (Spieler 5)
  '#14b8a6',  // Teal (Spieler 6)
]

type PlayerTurn = {
  turnIndex: number
  scoreBefore: number
  scoreAfter: number
  dartScores: number[] // Score pro Dart [60, 45, 17]
}

type PlayerData = {
  id: string
  name: string
  color: string
  turns: PlayerTurn[]
}

type Props = {
  targetScore: number
  players: PlayerData[]
  liveScore?: number
  activePlayerId?: string
  liveDartCount?: number // 0, 1, 2 oder 3 - wie viele Darts schon geworfen
  liveDartScores?: number[] // Score pro Dart für Live-Anzeige
  winnerPlayerId?: string // Gewinner hervorheben
}

export default function HighscoreProgressionChart({
  targetScore,
  players,
  liveScore,
  activePlayerId,
  liveDartCount = 0,
  liveDartScores = [],
  winnerPlayerId,
}: Props) {
  const { isArcade } = useTheme()
  const containerRef = useRef<HTMLDivElement>(null)
  const [dimensions, setDimensions] = useState({ width: 300, height: 200 })

  // Größe messen
  useEffect(() => {
    if (!containerRef.current) return
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        setDimensions({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        })
      }
    })
    ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [])

  // Padding
  const PADDING = { top: 30, right: 15, bottom: 25, left: 45 }

  // Chart-Bereich berechnen
  const chartWidth = dimensions.width - PADDING.left - PADDING.right
  const chartHeight = dimensions.height - PADDING.top - PADDING.bottom - 20

  // Max Turns über alle Spieler
  const maxTurns = Math.max(
    1,
    ...players.map(p => {
      const baseTurns = p.turns.length
      if (p.id === activePlayerId && liveDartCount > 0) {
        return baseTurns + 1
      }
      return baseTurns
    })
  )

  // X-Skala: Turn-Index → X-Position
  const xScale = (turnIndex: number) => {
    if (maxTurns <= 0) return PADDING.left
    return PADDING.left + (turnIndex / maxTurns) * chartWidth
  }

  // Y-Skala: Score → Y-Position (0 unten, targetScore oben)
  const yScale = (score: number) => {
    return PADDING.top + chartHeight - (score / targetScore) * chartHeight
  }

  // Y-Achsen-Werte berechnen (dynamisch basierend auf targetScore)
  const yTicks: number[] = []
  // Schritt basierend auf targetScore wählen
  const tickStep = targetScore <= 300 ? 50 :
                   targetScore <= 500 ? 100 :
                   targetScore <= 700 ? 100 : 150
  for (let v = 0; v <= targetScore; v += tickStep) {
    yTicks.push(v)
  }
  if (!yTicks.includes(targetScore)) yTicks.push(targetScore)
  yTicks.sort((a, b) => a - b)

  // X-Achsen-Werte
  const xTicks: number[] = [0]
  const xStep = maxTurns <= 6 ? 1 : maxTurns <= 12 ? 2 : Math.ceil(maxTurns / 6)
  for (let i = xStep; i <= maxTurns; i += xStep) {
    xTicks.push(i)
  }
  if (maxTurns > 0 && !xTicks.includes(maxTurns)) xTicks.push(maxTurns)

  // Farben basierend auf Theme
  const colors = {
    bg: isArcade ? '#0a0a0a' : '#ffffff',
    grid: isArcade ? '#1a1a1a' : '#e5e7eb',
    axis: isArcade ? '#333' : '#d1d5db',
    label: isArcade ? '#6b7280' : '#6b7280',
    labelDark: isArcade ? '#9ca3af' : '#374151',
  }

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        background: colors.bg,
        borderRadius: 8,
        padding: 4,
        display: 'flex',
        flexDirection: 'column',
        boxSizing: 'border-box',
      }}
    >
      {/* SVG Chart */}
      <svg
        width={dimensions.width}
        height={dimensions.height - 20}
        style={{ flexShrink: 0 }}
      >
        {/* Animationen */}
        <defs>
          <style>{`
            @keyframes pulse {
              0%, 100% { opacity: 1; r: 5; }
              50% { opacity: 0.6; r: 7; }
            }
            .live-dot { animation: pulse 1s ease-in-out infinite; }
          `}</style>
          {/* Glow-Filter für Arcade */}
          {isArcade && players.map((p, i) => (
            <filter key={i} id={`hs-glow-${i}`} x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="2" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          ))}
        </defs>

        {/* Grid-Linien horizontal */}
        {yTicks.map(score => (
          <line
            key={`h-${score}`}
            x1={PADDING.left}
            y1={yScale(score)}
            x2={PADDING.left + chartWidth}
            y2={yScale(score)}
            stroke={colors.grid}
            strokeWidth={1}
          />
        ))}

        {/* Grid-Linien vertikal */}
        {xTicks.map(v => (
          <line
            key={`v-${v}`}
            x1={xScale(v)}
            y1={PADDING.top}
            x2={xScale(v)}
            y2={PADDING.top + chartHeight}
            stroke={colors.grid}
            strokeWidth={1}
          />
        ))}

        {/* Dart-Unterteilungen */}
        {Array.from({ length: maxTurns }, (_, i) => i + 1).map(turnIdx => {
          const dart1X = xScale(turnIdx - 2/3)
          const dart2X = xScale(turnIdx - 1/3)
          const dart3X = xScale(turnIdx)
          const smallTickHeight = 4
          const largeTickHeight = 14
          const yBottom = PADDING.top + chartHeight

          return (
            <g key={`darts-${turnIdx}`}>
              <line
                x1={dart1X} y1={yBottom}
                x2={dart1X} y2={yBottom - smallTickHeight}
                stroke={colors.grid} strokeWidth={1}
              />
              <line
                x1={dart2X} y1={yBottom}
                x2={dart2X} y2={yBottom - smallTickHeight}
                stroke={colors.grid} strokeWidth={1}
              />
              <line
                x1={dart3X} y1={yBottom}
                x2={dart3X} y2={yBottom - largeTickHeight}
                stroke={isArcade ? '#444' : '#9ca3af'} strokeWidth={2}
              />
            </g>
          )
        })}

        {/* Ziellinie bei targetScore (grün, ganz oben) */}
        <line
          x1={PADDING.left}
          y1={yScale(targetScore)}
          x2={PADDING.left + chartWidth}
          y2={yScale(targetScore)}
          stroke="#22c55e"
          strokeWidth={3}
          opacity={0.9}
        />

        {/* Ziel-Label */}
        <text
          x={PADDING.left + chartWidth + 5}
          y={yScale(targetScore) + 4}
          fontSize={11}
          fontWeight={700}
          fill="#22c55e"
        >
          ZIEL
        </text>

        {/* Y-Achsen-Labels */}
        {yTicks.map(score => (
          <text
            key={`yl-${score}`}
            x={PADDING.left - 6}
            y={yScale(score) + 3}
            textAnchor="end"
            fontSize={9}
            fill={score === targetScore ? '#22c55e' : colors.label}
            fontWeight={score === targetScore ? 700 : 400}
            fontFamily="'Courier New', monospace"
          >
            {score}
          </text>
        ))}

        {/* X-Achsen-Labels */}
        {xTicks.map(v => (
          <text
            key={`xl-${v}`}
            x={xScale(v)}
            y={PADDING.top + chartHeight + 14}
            textAnchor="middle"
            fontSize={9}
            fill={colors.label}
            fontFamily="'Courier New', monospace"
          >
            {v}
          </text>
        ))}

        {/* Spieler-Linien */}
        {players.map((player, pIdx) => {
          const isActive = player.id === activePlayerId && liveDartCount > 0
          if (player.turns.length === 0 && !isActive) return null

          // Punkte für Polyline sammeln
          const points: { x: number; y: number; isLiveDart?: boolean; dartNumber?: number }[] = [
            { x: xScale(0), y: yScale(0), dartNumber: 0 }, // Startpunkt bei 0
          ]

          // Für jeden Turn: Für jeden Dart einen eigenen Punkt
          player.turns.forEach((t, turnIdx) => {
            const dartScores = t.dartScores || []

            if (dartScores.length === 0) {
              points.push({
                x: xScale(turnIdx + 1),
                y: yScale(t.scoreAfter),
                dartNumber: 3,
              })
              return
            }

            let cumulativeScore = t.scoreBefore
            dartScores.forEach((dartScore, dartIdx) => {
              cumulativeScore += dartScore
              const dartOffset = (dartIdx + 1) / 3
              points.push({
                x: xScale(turnIdx + dartOffset),
                y: yScale(cumulativeScore),
                dartNumber: dartIdx + 1,
              })
            })
          })

          // Live-Punkte hinzufügen
          if (player.id === activePlayerId && liveDartCount > 0 && liveDartScores.length > 0) {
            const baseTurnIndex = player.turns.length
            const lastTurn = player.turns[player.turns.length - 1]
            const scoreAtStart = lastTurn ? lastTurn.scoreAfter : 0

            let cumulativeScore = scoreAtStart
            for (let dartIdx = 0; dartIdx < liveDartScores.length; dartIdx++) {
              cumulativeScore += liveDartScores[dartIdx]
              const dartOffset = (dartIdx + 1) / 3
              points.push({
                x: xScale(baseTurnIndex + dartOffset),
                y: yScale(cumulativeScore),
                isLiveDart: true,
                dartNumber: dartIdx + 1,
              })
            }
          }

          // Polyline-Path
          const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
          const isWinner = player.id === winnerPlayerId

          return (
            <g key={player.id}>
              {/* Gewinner-Hintergrund-Glow */}
              {isWinner && (
                <path
                  d={pathD}
                  fill="none"
                  stroke={player.color}
                  strokeWidth={8}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  opacity={0.3}
                  style={{ filter: `blur(4px)` }}
                />
              )}
              {/* Linie */}
              <path
                d={pathD}
                fill="none"
                stroke={player.color}
                strokeWidth={isWinner ? 4 : 2}
                strokeLinecap="round"
                strokeLinejoin="round"
                filter={isArcade ? `url(#hs-glow-${pIdx})` : undefined}
                style={isWinner ? { filter: `drop-shadow(0 0 6px ${player.color})` } : undefined}
              />

              {/* Datenpunkte */}
              {points.slice(1).map((p, i, arr) => {
                const isLiveDart = p.isLiveDart === true
                const dartNum = p.dartNumber || 3
                const isLastPoint = i === arr.length - 1
                const isFinishPoint = isWinner && isLastPoint && Math.abs(p.y - yScale(targetScore)) < 5

                const isDart3 = dartNum === 3
                const baseRadius = isDart3 ? 4 : 2
                const radius = isWinner ? baseRadius + 1 : baseRadius

                // Live-Dart-Punkte (pulsierend)
                if (isLiveDart) {
                  return (
                    <circle
                      key={i}
                      cx={p.x}
                      cy={p.y}
                      r={isDart3 ? 5 : 3}
                      fill={player.color}
                      className="live-dot"
                      style={{
                        filter: isArcade ? `drop-shadow(0 0 4px ${player.color})` : undefined,
                      }}
                    />
                  )
                }

                // Finish-Punkt mit "ZIEL!" Label
                if (isFinishPoint) {
                  return (
                    <g key={i}>
                      <circle
                        cx={p.x}
                        cy={p.y}
                        r={radius + 2}
                        fill={player.color}
                        style={{
                          filter: `drop-shadow(0 0 6px ${player.color})`,
                        }}
                      />
                      <text
                        x={p.x}
                        y={p.y - 12}
                        textAnchor="middle"
                        fontSize={12}
                        fontWeight={700}
                        fill={player.color}
                        style={{
                          filter: isArcade ? `drop-shadow(0 0 4px ${player.color})` : undefined,
                        }}
                      >
                        ZIEL!
                      </text>
                    </g>
                  )
                }

                return (
                  <circle
                    key={i}
                    cx={p.x}
                    cy={p.y}
                    r={radius}
                    fill={player.color}
                    style={{
                      filter: isWinner && isDart3
                        ? `drop-shadow(0 0 4px ${player.color})`
                        : isArcade && isDart3 ? `drop-shadow(0 0 2px ${player.color})` : undefined,
                    }}
                  />
                )
              })}
            </g>
          )
        })}
      </svg>

      {/* Legende */}
      <div
        style={{
          display: 'flex',
          gap: 12,
          justifyContent: 'center',
          alignItems: 'center',
          height: 16,
          flexShrink: 0,
        }}
      >
        {players.map(p => (
          <span
            key={p.id}
            style={{
              color: p.color,
              fontSize: 10,
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: 3,
            }}
          >
            <span style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: p.color,
              boxShadow: isArcade ? `0 0 4px ${p.color}` : undefined,
            }} />
            {p.name}
          </span>
        ))}
      </div>
    </div>
  )
}
