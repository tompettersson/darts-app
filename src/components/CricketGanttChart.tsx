// src/components/CricketGanttChart.tsx
// Gantt-Matrix Chart: Zeigt WELCHE Felder WANN geschlossen wurden

import React, { useRef, useEffect, useState, useMemo } from 'react'
import { useTheme } from '../ThemeProvider'

export type CricketTarget = '15' | '16' | '17' | '18' | '19' | '20' | 'BULL'

export const GANTT_TARGETS: CricketTarget[] = ['20', '19', '18', '17', '16', '15', 'BULL']

export type GanttChartPlayer = {
  id: string
  name: string
  color: string
  fieldClosures: Record<CricketTarget, number | null>  // Turn-Index wo geschlossen, oder null
}

export type CricketGanttChartProps = {
  players: GanttChartPlayer[]
  maxTurns: number
  winnerPlayerId?: string
}

export default function CricketGanttChart({
  players,
  maxTurns,
  winnerPlayerId,
}: CricketGanttChartProps) {
  const { isArcade } = useTheme()
  const containerRef = useRef<HTMLDivElement>(null)
  const [dimensions, setDimensions] = useState({ width: 300, height: 250 })

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

  // Dimensionen
  const PADDING = { top: 25, right: 15, bottom: 25, left: 50 }
  const chartWidth = dimensions.width - PADDING.left - PADDING.right
  const chartHeight = dimensions.height - PADDING.top - PADDING.bottom

  // Zeilen- und Balkenhöhen
  const numFields = GANTT_TARGETS.length
  const rowHeight = chartHeight / numFields
  const playerBarHeight = Math.max(6, Math.min(12, (rowHeight - 4) / players.length))
  const playerGap = 2

  // Effektiver maxTurns (mindestens 1)
  const effectiveMaxTurns = Math.max(1, maxTurns)

  // X-Skala
  const xScale = (turn: number) => {
    return PADDING.left + (turn / effectiveMaxTurns) * chartWidth
  }

  // X-Achsen-Ticks
  const xTicks: number[] = []
  const xStep = effectiveMaxTurns <= 6 ? 1 : effectiveMaxTurns <= 12 ? 2 : Math.ceil(effectiveMaxTurns / 6)
  for (let i = 0; i <= effectiveMaxTurns; i += xStep) {
    xTicks.push(i)
  }
  if (!xTicks.includes(effectiveMaxTurns)) xTicks.push(effectiveMaxTurns)

  // Farben
  const colors = {
    bg: isArcade ? '#0a0a0a' : '#ffffff',
    grid: isArcade ? '#1a1a1a' : '#e5e7eb',
    label: isArcade ? '#6b7280' : '#6b7280',
    openBar: isArcade ? '#2a2a2a' : '#e5e7eb',
    closedBorder: isArcade ? '#333' : '#d1d5db',
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
        boxSizing: 'border-box',
        overflow: 'hidden',
      }}
    >
      <svg width={dimensions.width - 8} height={dimensions.height - 8}>
        <defs>
          {/* Glow-Filter für Arcade-Modus */}
          {isArcade && players.map((p, i) => (
            <filter key={i} id={`gantt-glow-${i}`} x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="1.5" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          ))}
        </defs>

        {/* Hintergrund-Raster */}
        {GANTT_TARGETS.map((_, idx) => (
          <rect
            key={`bg-${idx}`}
            x={PADDING.left}
            y={PADDING.top + idx * rowHeight}
            width={chartWidth}
            height={rowHeight}
            fill={idx % 2 === 0 ? 'transparent' : (isArcade ? '#0f0f0f' : '#f9fafb')}
          />
        ))}

        {/* Vertikale Grid-Linien */}
        {xTicks.map(t => (
          <line
            key={`v-${t}`}
            x1={xScale(t)}
            y1={PADDING.top}
            x2={xScale(t)}
            y2={PADDING.top + chartHeight}
            stroke={colors.grid}
            strokeWidth={1}
          />
        ))}

        {/* Y-Achsen-Labels (Feld-Namen) */}
        {GANTT_TARGETS.map((target, idx) => (
          <text
            key={`yl-${target}`}
            x={PADDING.left - 8}
            y={PADDING.top + idx * rowHeight + rowHeight / 2 + 4}
            textAnchor="end"
            fontSize={11}
            fontWeight={600}
            fill={colors.label}
            fontFamily="'Courier New', monospace"
          >
            {target === 'BULL' ? 'Bull' : target}
          </text>
        ))}

        {/* X-Achsen-Labels */}
        {xTicks.map(t => (
          <text
            key={`xl-${t}`}
            x={xScale(t)}
            y={PADDING.top + chartHeight + 14}
            textAnchor="middle"
            fontSize={9}
            fill={colors.label}
            fontFamily="'Courier New', monospace"
          >
            {t}
          </text>
        ))}

        {/* Balken pro Feld und Spieler */}
        {GANTT_TARGETS.map((target, fieldIdx) => {
          const fieldY = PADDING.top + fieldIdx * rowHeight + 2

          return (
            <g key={target}>
              {players.map((player, pIdx) => {
                const closedAt = player.fieldClosures[target]
                const barY = fieldY + pIdx * (playerBarHeight + playerGap)
                const isWinner = player.id === winnerPlayerId

                // Geschlossener Bereich (0 bis closedAt)
                if (closedAt !== null) {
                  const closedWidth = (closedAt / effectiveMaxTurns) * chartWidth
                  return (
                    <g key={player.id}>
                      {/* Offener Bereich (grau, volle Breite) */}
                      <rect
                        x={PADDING.left}
                        y={barY}
                        width={chartWidth}
                        height={playerBarHeight}
                        fill={colors.openBar}
                        rx={2}
                        opacity={0.4}
                      />
                      {/* Geschlossener Bereich (Spielerfarbe) */}
                      <rect
                        x={PADDING.left}
                        y={barY}
                        width={Math.max(4, closedWidth)}
                        height={playerBarHeight}
                        fill={player.color}
                        rx={2}
                        filter={isArcade ? `url(#gantt-glow-${pIdx})` : undefined}
                        style={isWinner ? { filter: `drop-shadow(0 0 3px ${player.color})` } : undefined}
                      />
                      {/* "X" Marker am Ende */}
                      <text
                        x={PADDING.left + closedWidth + 3}
                        y={barY + playerBarHeight / 2 + 3}
                        fontSize={8}
                        fontWeight={700}
                        fill={player.color}
                      >
                        X
                      </text>
                    </g>
                  )
                }

                // Offener Bereich (Feld noch nicht geschlossen)
                return (
                  <rect
                    key={player.id}
                    x={PADDING.left}
                    y={barY}
                    width={chartWidth}
                    height={playerBarHeight}
                    fill={colors.openBar}
                    rx={2}
                    opacity={0.3}
                  />
                )
              })}
            </g>
          )
        })}

        {/* Titel */}
        <text
          x={PADDING.left}
          y={14}
          fontSize={11}
          fontWeight={700}
          fill={isArcade ? '#f5f5f5' : '#111'}
        >
          Feldfortschritt
        </text>
      </svg>

      {/* Legende */}
      <div
        style={{
          position: 'absolute',
          top: 4,
          right: 12,
          display: 'flex',
          gap: 10,
        }}
      >
        {players.map(p => (
          <span
            key={p.id}
            style={{
              color: p.color,
              fontSize: 9,
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: 3,
            }}
          >
            <span style={{
              width: 8,
              height: 8,
              borderRadius: 2,
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

/**
 * Hilfsfunktion: Berechnet fieldClosures aus Events
 */
export function computeFieldClosures(
  events: any[],
  players: string[],
  range: 'short' | 'long'
): {
  fieldClosures: Record<string, Record<CricketTarget, number | null>>
  maxTurns: number
} {
  const validTargets = range === 'short'
    ? GANTT_TARGETS
    : ['10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20', 'BULL'] as CricketTarget[]

  // Initialisieren
  const fieldClosures: Record<string, Record<CricketTarget, number | null>> = {}
  const tempMarks: Record<string, Record<string, number>> = {}
  const turnIndex: Record<string, number> = {}

  players.forEach(pid => {
    fieldClosures[pid] = {} as Record<CricketTarget, number | null>
    GANTT_TARGETS.forEach(t => { fieldClosures[pid][t] = null })
    tempMarks[pid] = {}
    validTargets.forEach(t => { tempMarks[pid][t] = 0 })
    turnIndex[pid] = 0
  })

  let maxTurns = 0

  for (const ev of events) {
    if (ev.type === 'CricketLegFinished') {
      // Bei Leg-Ende: Reset für nächstes Leg
      players.forEach(pid => {
        GANTT_TARGETS.forEach(t => { fieldClosures[pid][t] = null })
        validTargets.forEach(t => { tempMarks[pid][t] = 0 })
        turnIndex[pid] = 0
      })
      maxTurns = 0
      continue
    }

    if (ev.type !== 'CricketTurnAdded') continue

    const pid = ev.playerId
    if (!fieldClosures[pid]) continue

    turnIndex[pid]++
    maxTurns = Math.max(maxTurns, turnIndex[pid])

    for (const d of ev.darts) {
      if (d.target === 'MISS') continue
      const tKey = String(d.target) as CricketTarget
      if (!GANTT_TARGETS.includes(tKey)) continue

      const before = tempMarks[pid][tKey] ?? 0
      if (before >= 3) continue

      const mult = d.target === 'BULL' && d.mult === 3 ? 2 : d.mult
      const newMarks = Math.min(3, before + mult)
      tempMarks[pid][tKey] = newMarks

      // Gerade geschlossen?
      if (before < 3 && newMarks >= 3) {
        fieldClosures[pid][tKey] = turnIndex[pid]
      }
    }
  }

  return { fieldClosures, maxTurns }
}
