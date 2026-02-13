// src/components/CricketProgressChart.tsx
// Kombiniertes Chart für Cricket: Marks-Verlauf (oben) + Feldstand (unten)

import React, { useRef, useEffect, useState, useMemo } from 'react'
import { useTheme } from '../ThemeProvider'
import { PLAYER_COLORS } from './ScoreProgressionChart'

export type CricketTarget = '15' | '16' | '17' | '18' | '19' | '20' | 'BULL'

export const CRICKET_TARGETS: CricketTarget[] = ['20', '19', '18', '17', '16', '15', 'BULL']
const MAX_MARKS = 21 // 7 Felder * 3 Marks = 21

export type CricketPlayerTurn = {
  turnIndex: number
  totalMarks: number      // 0-21 kumulative Marks
  totalPoints: number     // Standard: eigene | Cutthroat: kassierte
  marksThisTurn: number   // Marks in diesem Turn
}

export type CricketChartPlayer = {
  id: string
  name: string
  color: string
  turns: CricketPlayerTurn[]
  fields: Record<CricketTarget, number>  // 0-3 Marks pro Feld
  totalPoints: number
}

export type CricketProgressChartProps = {
  players: CricketChartPlayer[]
  scoringMode: 'standard' | 'cutthroat' | 'simple'
  winnerPlayerId?: string
  // Live-Daten (optional)
  activePlayerId?: string
  liveTurnMarks?: number
}

export default function CricketProgressChart({
  players,
  scoringMode,
  winnerPlayerId,
  activePlayerId,
  liveTurnMarks,
}: CricketProgressChartProps) {
  const { isArcade } = useTheme()
  const containerRef = useRef<HTMLDivElement>(null)
  const [dimensions, setDimensions] = useState({ width: 300, height: 400 })

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

  // Chart-Dimensionen
  const CHART_HEIGHT_RATIO = 0.55 // 55% für Chart, 45% für Feldstand
  const chartHeight = Math.max(100, dimensions.height * CHART_HEIGHT_RATIO - 40)
  const PADDING = { top: 30, right: 15, bottom: 25, left: 35 }

  const chartWidth = dimensions.width - PADDING.left - PADDING.right
  const innerChartHeight = chartHeight - PADDING.top - PADDING.bottom

  // Max Turns über alle Spieler
  const maxTurns = useMemo(() => {
    let max = Math.max(1, ...players.map(p => p.turns.length))
    // Wenn aktiver Spieler und Live-Marks, +1 für Vorschau
    if (activePlayerId && liveTurnMarks !== undefined && liveTurnMarks > 0) {
      const activePlayer = players.find(p => p.id === activePlayerId)
      if (activePlayer) max = Math.max(max, activePlayer.turns.length + 1)
    }
    return max
  }, [players, activePlayerId, liveTurnMarks])

  // Skalen
  const xScale = (turnIndex: number) => {
    if (maxTurns <= 1) return PADDING.left
    return PADDING.left + (turnIndex / maxTurns) * chartWidth
  }

  const yScale = (marks: number) => {
    return PADDING.top + innerChartHeight - (marks / MAX_MARKS) * innerChartHeight
  }

  // Y-Achsen-Ticks (0, 7, 14, 21)
  const yTicks = [0, 7, 14, 21]

  // X-Achsen-Ticks
  const xTicks: number[] = []
  const xStep = maxTurns <= 6 ? 1 : maxTurns <= 12 ? 2 : Math.ceil(maxTurns / 6)
  for (let i = 0; i <= maxTurns; i += xStep) {
    xTicks.push(i)
  }
  if (!xTicks.includes(maxTurns)) xTicks.push(maxTurns)

  // Farben
  const colors = {
    bg: isArcade ? '#0a0a0a' : '#ffffff',
    grid: isArcade ? '#1a1a1a' : '#e5e7eb',
    label: isArcade ? '#6b7280' : '#6b7280',
    fieldBg: isArcade ? '#111' : '#f9fafb',
    fieldBorder: isArcade ? '#222' : '#e5e7eb',
    closedField: isArcade ? '#22c55e' : '#16a34a',
    openField: isArcade ? '#333' : '#d1d5db',
    markFilled: isArcade ? '#f97316' : '#ea580c',
    markEmpty: isArcade ? '#333' : '#d1d5db',
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
        overflow: 'hidden',
      }}
    >
      {/* OBERER TEIL: Marks-Verlauf Chart */}
      <svg
        width={dimensions.width - 8}
        height={chartHeight}
        style={{ flexShrink: 0 }}
      >
        <defs>
          <style>{`
            @keyframes pulse {
              0%, 100% { opacity: 1; r: 5; }
              50% { opacity: 0.6; r: 7; }
            }
            .live-dot { animation: pulse 1s ease-in-out infinite; }
          `}</style>
          {isArcade && players.map((_, i) => (
            <filter key={i} id={`cricket-glow-${i}`} x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="2" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          ))}
        </defs>

        {/* Grid-Linien horizontal */}
        {yTicks.map(marks => (
          <line
            key={`h-${marks}`}
            x1={PADDING.left}
            y1={yScale(marks)}
            x2={PADDING.left + chartWidth}
            y2={yScale(marks)}
            stroke={colors.grid}
            strokeWidth={marks === 21 ? 2 : 1}
          />
        ))}

        {/* Ziellinie bei 21 Marks */}
        <line
          x1={PADDING.left}
          y1={yScale(21)}
          x2={PADDING.left + chartWidth}
          y2={yScale(21)}
          stroke="#22c55e"
          strokeWidth={2}
          strokeDasharray="6 3"
          opacity={0.8}
        />

        {/* Grid-Linien vertikal */}
        {xTicks.map(t => (
          <line
            key={`v-${t}`}
            x1={xScale(t)}
            y1={PADDING.top}
            x2={xScale(t)}
            y2={PADDING.top + innerChartHeight}
            stroke={colors.grid}
            strokeWidth={1}
          />
        ))}

        {/* Y-Achsen-Labels */}
        {yTicks.map(marks => (
          <text
            key={`yl-${marks}`}
            x={PADDING.left - 6}
            y={yScale(marks) + 3}
            textAnchor="end"
            fontSize={9}
            fill={colors.label}
            fontFamily="'Courier New', monospace"
          >
            {marks}
          </text>
        ))}

        {/* X-Achsen-Labels */}
        {xTicks.map(t => (
          <text
            key={`xl-${t}`}
            x={xScale(t)}
            y={PADDING.top + innerChartHeight + 14}
            textAnchor="middle"
            fontSize={9}
            fill={colors.label}
            fontFamily="'Courier New', monospace"
          >
            {t}
          </text>
        ))}

        {/* Spieler-Linien */}
        {players.map((player, pIdx) => {
          const isWinner = player.id === winnerPlayerId
          const isActive = player.id === activePlayerId

          // Punkte sammeln (inkl. Startpunkt bei 0)
          const points: { x: number; y: number }[] = [
            { x: xScale(0), y: yScale(0) }
          ]

          player.turns.forEach((turn) => {
            points.push({
              x: xScale(turn.turnIndex),
              y: yScale(turn.totalMarks),
            })
          })

          // Live-Punkt hinzufügen
          if (isActive && liveTurnMarks !== undefined && liveTurnMarks > 0) {
            const lastTurn = player.turns[player.turns.length - 1]
            const baseMarks = lastTurn?.totalMarks ?? 0
            points.push({
              x: xScale(player.turns.length + 1),
              y: yScale(Math.min(MAX_MARKS, baseMarks + liveTurnMarks)),
            })
          }

          const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')

          return (
            <g key={player.id}>
              {/* Gewinner-Glow */}
              {isWinner && (
                <path
                  d={pathD}
                  fill="none"
                  stroke={player.color}
                  strokeWidth={8}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  opacity={0.3}
                  style={{ filter: 'blur(4px)' }}
                />
              )}

              {/* Linie */}
              <path
                d={pathD}
                fill="none"
                stroke={player.color}
                strokeWidth={isWinner ? 3 : 2}
                strokeLinecap="round"
                strokeLinejoin="round"
                filter={isArcade ? `url(#cricket-glow-${pIdx})` : undefined}
                style={isWinner ? { filter: `drop-shadow(0 0 6px ${player.color})` } : undefined}
              />

              {/* Datenpunkte */}
              {points.slice(1).map((p, i) => {
                const isLive = isActive && liveTurnMarks !== undefined && i === points.length - 2
                const isFinish = isWinner && i === points.length - 2 && Math.abs(p.y - yScale(21)) < 5

                if (isLive) {
                  return (
                    <circle
                      key={i}
                      cx={p.x}
                      cy={p.y}
                      r={4}
                      fill={player.color}
                      className="live-dot"
                      style={{ filter: isArcade ? `drop-shadow(0 0 4px ${player.color})` : undefined }}
                    />
                  )
                }

                if (isFinish) {
                  return (
                    <g key={i}>
                      <circle
                        cx={p.x}
                        cy={p.y}
                        r={5}
                        fill={player.color}
                        style={{ filter: `drop-shadow(0 0 6px ${player.color})` }}
                      />
                      <text
                        x={p.x}
                        y={p.y - 12}
                        textAnchor="middle"
                        fontSize={11}
                        fontWeight={700}
                        fill={player.color}
                        style={{ filter: isArcade ? `drop-shadow(0 0 4px ${player.color})` : undefined }}
                      >
                        Sieg
                      </text>
                    </g>
                  )
                }

                return (
                  <circle
                    key={i}
                    cx={p.x}
                    cy={p.y}
                    r={isWinner ? 4 : 3}
                    fill={player.color}
                    style={{
                      filter: isWinner
                        ? `drop-shadow(0 0 4px ${player.color})`
                        : isArcade ? `drop-shadow(0 0 2px ${player.color})` : undefined,
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
          height: 18,
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

      {/* UNTERER TEIL: Feldstand-Tabelle */}
      <div
        style={{
          flex: 1,
          background: colors.fieldBg,
          borderRadius: 6,
          padding: '8px 6px',
          marginTop: 4,
          overflow: 'auto',
        }}
      >
        {/* Header mit Spielernamen */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `40px repeat(${players.length}, 1fr)`,
            gap: 4,
            marginBottom: 6,
            fontSize: 11,
            fontWeight: 600,
          }}
        >
          <div style={{ color: colors.label }}></div>
          {players.map(p => (
            <div
              key={p.id}
              style={{
                color: p.color,
                textAlign: 'center',
                textOverflow: 'ellipsis',
                overflow: 'hidden',
                whiteSpace: 'nowrap',
              }}
            >
              {p.name}
            </div>
          ))}
        </div>

        {/* Felder */}
        {CRICKET_TARGETS.map(target => (
          <div
            key={target}
            style={{
              display: 'grid',
              gridTemplateColumns: `40px repeat(${players.length}, 1fr)`,
              gap: 4,
              marginBottom: 3,
              alignItems: 'center',
            }}
          >
            {/* Feld-Label */}
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: colors.label,
                textAlign: 'right',
                paddingRight: 4,
              }}
            >
              {target === 'BULL' ? 'Bull' : target}
            </div>

            {/* Marks pro Spieler */}
            {players.map(p => {
              const marks = p.fields[target] ?? 0
              const isClosed = marks >= 3

              return (
                <div
                  key={p.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 2,
                  }}
                >
                  {/* 3 Mark-Kreise */}
                  {[0, 1, 2].map(i => (
                    <div
                      key={i}
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: '50%',
                        background: i < marks ? p.color : colors.markEmpty,
                        opacity: i < marks ? 1 : 0.4,
                        boxShadow: i < marks && isArcade ? `0 0 3px ${p.color}` : undefined,
                      }}
                    />
                  ))}
                  {/* Geschlossen-Indikator */}
                  {isClosed && (
                    <span
                      style={{
                        fontSize: 10,
                        color: colors.closedField,
                        marginLeft: 2,
                      }}
                    >
                      X
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        ))}

        {/* Punkte-Zeile (nur wenn nicht simple) */}
        {scoringMode !== 'simple' && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: `40px repeat(${players.length}, 1fr)`,
              gap: 4,
              marginTop: 8,
              paddingTop: 6,
              borderTop: `1px solid ${colors.fieldBorder}`,
              alignItems: 'center',
            }}
          >
            <div
              style={{
                fontSize: 10,
                fontWeight: 600,
                color: colors.label,
                textAlign: 'right',
                paddingRight: 4,
              }}
            >
              {scoringMode === 'cutthroat' ? 'Straf' : 'Pkt'}
            </div>
            {players.map(p => (
              <div
                key={p.id}
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: scoringMode === 'cutthroat'
                    ? (p.totalPoints > 0 ? '#ef4444' : colors.label)
                    : p.color,
                  textAlign: 'center',
                }}
              >
                {p.totalPoints}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Hilfsfunktion: Bereitet Daten für CricketProgressChart aus Cricket-Events auf
 */
export function prepareCricketChartData(
  events: any[],
  state: {
    marksByPlayer: Record<string, Record<string, number>>
    pointsByPlayer: Record<string, number>
    players: string[]
    match?: { style: string; players: { playerId: string; name?: string }[] }
  },
  playerColors?: string[]
): {
  players: CricketChartPlayer[]
  scoringMode: 'standard' | 'cutthroat' | 'simple'
} {
  const match = state.match
  const scoringMode = (match?.style === 'cutthroat' ? 'cutthroat' :
    match?.style === 'simple' ? 'simple' : 'standard') as 'standard' | 'cutthroat' | 'simple'

  // Turn-Events sammeln
  const turnEvents = events.filter(e => e.type === 'CricketTurnAdded')

  // Pro Spieler: Turns mit kumulativen Marks berechnen
  const playerTurns: Record<string, CricketPlayerTurn[]> = {}
  const cumulativeMarks: Record<string, number> = {}
  const cumulativePoints: Record<string, number> = {}

  state.players.forEach(pid => {
    playerTurns[pid] = []
    cumulativeMarks[pid] = 0
    cumulativePoints[pid] = 0
  })

  // Temporäre Marks pro Spieler pro Feld
  const tempMarks: Record<string, Record<string, number>> = {}
  state.players.forEach(pid => {
    tempMarks[pid] = {}
    CRICKET_TARGETS.forEach(t => { tempMarks[pid][t] = 0 })
  })

  // Temporäre Punkte
  const tempPoints: Record<string, number> = {}
  state.players.forEach(pid => { tempPoints[pid] = 0 })

  // Turn-Index pro Spieler
  const turnIndex: Record<string, number> = {}
  state.players.forEach(pid => { turnIndex[pid] = 0 })

  turnEvents.forEach((ev: any) => {
    const pid = ev.playerId
    if (!playerTurns[pid]) return

    turnIndex[pid]++

    // Marks in diesem Turn berechnen
    let marksThisTurn = 0
    ev.darts.forEach((d: any) => {
      if (d.target === 'MISS') return
      const tKey = String(d.target) as CricketTarget
      if (!CRICKET_TARGETS.includes(tKey)) return

      const currentMarks = tempMarks[pid][tKey] ?? 0
      if (currentMarks >= 3) return // Schon geschlossen

      const mult = d.target === 'BULL' && d.mult === 3 ? 2 : d.mult
      const newMarks = Math.min(3, currentMarks + mult)
      const addedMarks = newMarks - currentMarks

      tempMarks[pid][tKey] = newMarks
      marksThisTurn += addedMarks
    })

    cumulativeMarks[pid] += marksThisTurn

    playerTurns[pid].push({
      turnIndex: turnIndex[pid],
      totalMarks: cumulativeMarks[pid],
      totalPoints: state.pointsByPlayer[pid] ?? 0,
      marksThisTurn,
    })
  })

  // Spieler-Daten zusammenstellen
  const chartPlayers: CricketChartPlayer[] = state.players.map((pid, index) => {
    const matchPlayer = match?.players.find(p => p.playerId === pid)
    const color = playerColors?.[index] ?? PLAYER_COLORS[index % PLAYER_COLORS.length]

    return {
      id: pid,
      name: matchPlayer?.name ?? pid,
      color,
      turns: playerTurns[pid] ?? [],
      fields: Object.fromEntries(
        CRICKET_TARGETS.map(t => [t, state.marksByPlayer[pid]?.[t] ?? 0])
      ) as Record<CricketTarget, number>,
      totalPoints: state.pointsByPlayer[pid] ?? 0,
    }
  })

  return { players: chartPlayers, scoringMode }
}
