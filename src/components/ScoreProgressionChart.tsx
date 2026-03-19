// src/components/ScoreProgressionChart.tsx
// Interaktives Liniendiagramm für den Punkteverlauf im X01

import React, { useRef, useEffect, useState } from 'react'
import { useTheme } from '../ThemeProvider'
export { PLAYER_COLORS } from '../playerColors'

type PlayerVisit = {
  visitIndex: number
  remainingBefore: number
  remainingAfter: number
  bust: boolean
  dartScores: number[] // Score pro Dart [20, 5, 17]
}

type PlayerData = {
  id: string
  name: string
  color: string
  visits: PlayerVisit[]
}

type Props = {
  startScore: number
  players: PlayerData[]
  liveRemaining?: number
  activePlayerId?: string
  liveDartCount?: number // 0, 1, 2 oder 3 - wie viele Darts schon geworfen
  liveDartScores?: number[] // Score pro Dart [20, 5, 17] für Live-Anzeige
  winnerPlayerId?: string // Gewinner hervorheben
  showCheckoutLine?: boolean // 170er Checkout-Linie anzeigen
  showFinishLine?: boolean // Ziellinie (bei startScore) anzeigen
}

export default function ScoreProgressionChart({
  startScore,
  players,
  liveRemaining,
  activePlayerId,
  liveDartCount = 0,
  liveDartScores = [],
  winnerPlayerId,
  showCheckoutLine = true,
  showFinishLine = true,
}: Props) {
  const { isArcade } = useTheme()
  const containerRef = useRef<HTMLDivElement>(null)
  const [dimensions, setDimensions] = useState({ width: 300, height: 150 })

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

  // Padding (top größer für "Sieg" Label, right größer für Average-Anzeige)
  const PADDING = { top: 30, right: 45, bottom: 25, left: 40 }

  // Chart-Bereich berechnen
  const chartWidth = dimensions.width - PADDING.left - PADDING.right
  const chartHeight = dimensions.height - PADDING.top - PADDING.bottom - 20 // 20 für Legende

  // Max Visits über alle Spieler (inkl. Live-Block wenn jemand gerade wirft)
  const maxVisits = Math.max(
    1,
    ...players.map(p => {
      const baseVisits = p.visits.length
      // Wenn aktiver Spieler und mindestens 1 Dart geworfen → nächster Block zählt mit
      if (p.id === activePlayerId && liveDartCount > 0) {
        return baseVisits + 1
      }
      return baseVisits
    })
  )

  // X-Skala: Visit-Index → X-Position (0 = links, gleichmäßig verteilt)
  const xScale = (visitIndex: number) => {
    // Alle Visits bekommen gleiche Breite
    // visitIndex 0 = Startpunkt, 1 = erster Wurf, etc.
    if (maxVisits <= 0) return PADDING.left
    return PADDING.left + (visitIndex / maxVisits) * chartWidth
  }

  // Y-Skala: Score → Y-Position
  // UMGEKEHRT: 0 unten (chartHeight), startScore oben (0)
  // Wir zeigen "erreichte Punkte" = startScore - remaining
  const yScale = (remaining: number) => {
    const scored = startScore - remaining  // Geworfene Punkte
    return PADDING.top + chartHeight - (scored / startScore) * chartHeight
  }

  // Y-Achsen-Werte berechnen (0 unten bis startScore oben)
  // Haupt-Ticks bei 0, 100, 200, 300, ... + Zwischen-Ticks bei 50, 150, 250, ...
  const yTicks: number[] = []
  const tickStep = 50 // Alle 50 Punkte eine Linie
  for (let v = 0; v <= startScore; v += tickStep) {
    yTicks.push(v)
  }
  if (!yTicks.includes(startScore)) yTicks.push(startScore)
  yTicks.sort((a, b) => a - b) // Aufsteigend (unten → oben)

  // X-Achsen-Werte (0, 1, 2, 3, ... maxVisits)
  const xTicks: number[] = [0]
  const xStep = maxVisits <= 6 ? 1 : maxVisits <= 12 ? 2 : Math.ceil(maxVisits / 6)
  for (let i = xStep; i <= maxVisits; i += xStep) {
    xTicks.push(i)
  }
  if (maxVisits > 0 && !xTicks.includes(maxVisits)) xTicks.push(maxVisits)

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
            <filter key={i} id={`glow-${i}`} x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="2" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          ))}
        </defs>

        {/* Grid-Linien horizontal (yTicks = geworfene Punkte, umrechnen zu remaining) */}
        {yTicks.map(scored => (
          <line
            key={`h-${scored}`}
            x1={PADDING.left}
            y1={yScale(startScore - scored)}
            x2={PADDING.left + chartWidth}
            y2={yScale(startScore - scored)}
            stroke={colors.grid}
            strokeWidth={1}
          />
        ))}

        {/* Grid-Linien vertikal (Haupt-Ticks bei jedem Visit) */}
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

        {/* Dart-Unterteilungen: kleine Striche für Dart 1+2, größerer Strich für Dart 3 (Aufnahme-Ende) */}
        {Array.from({ length: maxVisits }, (_, i) => i + 1).map(visitIdx => {
          // Jeder Visit-Block geht von visitIdx-1 bis visitIdx
          // Dart 1 bei 1/3 des Blocks, Dart 2 bei 2/3 des Blocks, Dart 3 am Ende
          const dart1X = xScale(visitIdx - 2/3)
          const dart2X = xScale(visitIdx - 1/3)
          const dart3X = xScale(visitIdx) // Aufnahme-Ende
          const smallTickHeight = 4 // Kleine Striche für Dart 1+2
          const largeTickHeight = 14 // Größerer Strich für Aufnahme-Ende
          const yBottom = PADDING.top + chartHeight

          return (
            <g key={`darts-${visitIdx}`}>
              {/* Dart 1 Tick (klein) */}
              <line
                x1={dart1X}
                y1={yBottom}
                x2={dart1X}
                y2={yBottom - smallTickHeight}
                stroke={colors.grid}
                strokeWidth={1}
              />
              {/* Dart 2 Tick (klein) */}
              <line
                x1={dart2X}
                y1={yBottom}
                x2={dart2X}
                y2={yBottom - smallTickHeight}
                stroke={colors.grid}
                strokeWidth={1}
              />
              {/* Dart 3 / Aufnahme-Ende Tick (größer, dicker) */}
              <line
                x1={dart3X}
                y1={yBottom}
                x2={dart3X}
                y2={yBottom - largeTickHeight}
                stroke={isArcade ? '#444' : '#9ca3af'}
                strokeWidth={2}
              />
            </g>
          )
        })}

        {/* Checkout-Linie bei 170 Rest (hellgrün) */}
        {showCheckoutLine && startScore >= 170 && (
          <line
            x1={PADDING.left}
            y1={yScale(170)} // remaining=170
            x2={PADDING.left + chartWidth}
            y2={yScale(170)}
            stroke="#22c55e"
            strokeWidth={2}
            strokeDasharray="6 3"
            opacity={0.7}
          />
        )}

        {/* Ziellinie bei 0 Rest / startScore scored (rot, ganz oben) */}
        {showFinishLine && (
          <line
            x1={PADDING.left}
            y1={yScale(0)} // remaining=0 = Ziel erreicht
            x2={PADDING.left + chartWidth}
            y2={yScale(0)}
            stroke="#ef4444"
            strokeWidth={2}
            opacity={0.8}
          />
        )}

        {/* Y-Achsen-Labels (zeigen geworfene Punkte: 0 unten, startScore oben) */}
        {yTicks.map(scored => (
          <text
            key={`yl-${scored}`}
            x={PADDING.left - 6}
            y={yScale(startScore - scored) + 3}
            textAnchor="end"
            fontSize={9}
            fill={colors.label}
            fontFamily="'Courier New', monospace"
          >
            {scored}
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
          // Spieler ohne Visits UND ohne Live-Darts überspringen
          const isActive = player.id === activePlayerId && liveDartCount > 0
          if (player.visits.length === 0 && !isActive) return null

          // Punkte für Polyline sammeln (inkl. Startpunkt bei startScore)
          // Für jeden Dart ein eigener Punkt, nicht nur pro Visit!
          // dartNumber: 1, 2 oder 3 - für unterschiedliche Größen
          const points: { x: number; y: number; bust: boolean; isLiveDart?: boolean; dartNumber?: number }[] = [
            { x: xScale(0), y: yScale(startScore), bust: false, dartNumber: 0 }, // Startpunkt bei 0
          ]

          // Für jeden Visit: Für jeden Dart einen eigenen Punkt hinzufügen
          player.visits.forEach((v, visitIdx) => {
            let cumulativeScore = 0
            const dartScores = v.dartScores || []

            // Falls keine dartScores vorhanden, Fallback auf alten Modus (1 Punkt pro Visit)
            if (dartScores.length === 0) {
              points.push({
                x: xScale(visitIdx + 1),
                y: yScale(v.remainingAfter),
                bust: v.bust,
                dartNumber: 3, // Fallback: wie Dart 3 behandeln
              })
              return
            }

            // Für jeden geworfenen Dart einen eigenen Punkt
            dartScores.forEach((dartScore, dartIdx) => {
              cumulativeScore += dartScore
              const remainingAfterDart = v.remainingBefore - cumulativeScore
              // X-Position: bei 1/3, 2/3 oder 3/3 des Blocks
              const dartOffset = (dartIdx + 1) / 3
              points.push({
                x: xScale(visitIdx + dartOffset),
                y: yScale(remainingAfterDart),
                // Bust nur beim letzten Dart des Visits anzeigen
                bust: v.bust && dartIdx === dartScores.length - 1,
                dartNumber: dartIdx + 1, // 1, 2 oder 3
              })
            })
          })

          // Live-Punkte hinzufügen wenn aktiver Spieler und mindestens 1 Dart geworfen
          if (player.id === activePlayerId && liveDartCount > 0 && liveDartScores.length > 0) {
            const baseVisitIndex = player.visits.length
            // Remaining am Start des aktuellen Visits
            const lastVisit = player.visits[player.visits.length - 1]
            const remainingAtStart = lastVisit ? lastVisit.remainingAfter : startScore

            // Für jeden geworfenen Dart einen Punkt hinzufügen
            let cumulativeScore = 0
            for (let dartIdx = 0; dartIdx < liveDartScores.length; dartIdx++) {
              cumulativeScore += liveDartScores[dartIdx]
              const remainingAfterDart = remainingAtStart - cumulativeScore
              const dartOffset = (dartIdx + 1) / 3 // 1/3, 2/3 oder 3/3
              points.push({
                x: xScale(baseVisitIndex + dartOffset),
                y: yScale(remainingAfterDart),
                bust: false,
                isLiveDart: true, // Markieren als Live-Dart für Animation
                dartNumber: dartIdx + 1, // 1, 2 oder 3
              })
            }
          }

          // Polyline-Path
          const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
          const isWinner = player.id === winnerPlayerId

          return (
            <g key={player.id}>
              {/* Gewinner-Hintergrund-Glow (extra dick, extra leuchtend) */}
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
                filter={isArcade ? `url(#glow-${pIdx})` : undefined}
                style={isWinner ? { filter: `drop-shadow(0 0 6px ${player.color})` } : undefined}
              />

              {/* Datenpunkte (außer Startpunkt) */}
              {points.slice(1).map((p, i, arr) => {
                const isLiveDart = p.isLiveDart === true
                const isBust = p.bust
                const dartNum = p.dartNumber || 3
                const isLastPoint = i === arr.length - 1
                const isFinishPoint = isWinner && isLastPoint && Math.abs(p.y - yScale(0)) < 1

                // Punktgröße: Dart 1+2 klein (2), Dart 3 größer (4)
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

                if (isBust) {
                  // Bust: X-Marker
                  return (
                    <g key={i}>
                      <circle
                        cx={p.x}
                        cy={p.y}
                        r={4}
                        fill="#0a0a0a"
                        stroke="#ef4444"
                        strokeWidth={2}
                      />
                      <text
                        x={p.x}
                        y={p.y + 3}
                        textAnchor="middle"
                        fontSize={8}
                        fill="#ef4444"
                        fontWeight={700}
                      >
                        ✕
                      </text>
                    </g>
                  )
                }

                // Finish-Punkt mit "Sieg" Label
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

              {/* 3-Dart-Average am Ende der Linie anzeigen */}
              {points.length > 1 && (() => {
                const lastPoint = points[points.length - 1]
                // Berechne den 3-Dart-Average
                const totalDarts = player.visits.reduce((sum, v) => sum + (v.dartScores?.length || 3), 0)
                  + (player.id === activePlayerId ? liveDartScores.length : 0)
                const lastRemaining = player.id === activePlayerId && liveDartScores.length > 0
                  ? (player.visits.length > 0
                      ? player.visits[player.visits.length - 1].remainingAfter
                      : startScore) - liveDartScores.reduce((a, b) => a + b, 0)
                  : (player.visits.length > 0
                      ? player.visits[player.visits.length - 1].remainingAfter
                      : startScore)
                const totalScored = startScore - lastRemaining
                const avg = totalDarts > 0 ? (totalScored / totalDarts) * 3 : 0

                // Nur anzeigen wenn mindestens 1 Dart geworfen
                if (totalDarts === 0) return null

                return (
                  <text
                    x={lastPoint.x + 6}
                    y={lastPoint.y + 3}
                    fontSize={11}
                    fontWeight={700}
                    fill={player.color}
                    fontFamily="'Courier New', monospace"
                    style={{
                      filter: isArcade ? `drop-shadow(0 0 2px ${player.color})` : undefined,
                    }}
                  >
                    {avg.toFixed(1)}
                  </text>
                )
              })()}
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
