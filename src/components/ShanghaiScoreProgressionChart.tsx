// src/components/ShanghaiScoreProgressionChart.tsx
// Score-Progression-Chart für Shanghai: zeigt Gesamtpunkte pro Runde als Polyline pro Spieler.
// Aus ShanghaiMatchDetails ausgelagert; wird dort UND in ShanghaiLegSummary verwendet.

import React from 'react'
import type { ShanghaiPlayer, ShanghaiRoundFinishedEvent } from '../types/shanghai'

type Props = {
  rounds: ShanghaiRoundFinishedEvent[]
  players: ShanghaiPlayer[]
  playerColors: Record<string, string>
  colors: any
}

export default function ShanghaiScoreProgressionChart({ rounds, players, playerColors, colors }: Props) {
  if (rounds.length === 0) return null

  const W = 580
  const H = 200
  const PAD = { top: 20, right: 20, bottom: 30, left: 45 }
  const chartW = W - PAD.left - PAD.right
  const chartH = H - PAD.top - PAD.bottom

  const maxTotal = Math.max(
    1,
    ...rounds.flatMap(r => players.map(p => r.totalsByPlayer[p.playerId] ?? 0))
  )

  const xScale = (i: number) => PAD.left + (i / Math.max(1, rounds.length - 1)) * chartW
  const yScale = (v: number) => PAD.top + chartH - (v / maxTotal) * chartH

  const lines = players.map(p => {
    const points = rounds.map((r, i) => {
      const total = r.totalsByPlayer[p.playerId] ?? 0
      return `${xScale(i)},${yScale(total)}`
    })
    return {
      playerId: p.playerId,
      color: playerColors[p.playerId],
      name: p.name,
      d: points.join(' '),
      lastTotal: rounds[rounds.length - 1]?.totalsByPlayer[p.playerId] ?? 0,
    }
  })

  const yTicks: number[] = []
  const step = Math.ceil(maxTotal / 5 / 10) * 10 || 10
  for (let v = 0; v <= maxTotal; v += step) yTicks.push(v)
  if (yTicks[yTicks.length - 1] < maxTotal) yTicks.push(Math.ceil(maxTotal / step) * step)

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', maxWidth: W, height: 'auto' }}>
        {yTicks.map(v => (
          <g key={v}>
            <line
              x1={PAD.left} y1={yScale(v)}
              x2={W - PAD.right} y2={yScale(v)}
              stroke={colors.border} strokeWidth={0.5} strokeDasharray="4,3"
            />
            <text x={PAD.left - 6} y={yScale(v) + 4} textAnchor="end" fontSize={10} fill={colors.fgMuted}>
              {v}
            </text>
          </g>
        ))}
        {rounds.map((r, i) => (
          <text
            key={i}
            x={xScale(i)}
            y={H - 6}
            textAnchor="middle"
            fontSize={9}
            fill={colors.fgMuted}
          >
            {r.roundNumber}
          </text>
        ))}
        {lines.map(l => (
          <g key={l.playerId}>
            <polyline
              points={l.d}
              fill="none"
              stroke={l.color}
              strokeWidth={2.5}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {rounds.map((r, i) => {
              const total = r.totalsByPlayer[l.playerId] ?? 0
              return (
                <circle
                  key={i}
                  cx={xScale(i)}
                  cy={yScale(total)}
                  r={3}
                  fill={l.color}
                  stroke={colors.bg}
                  strokeWidth={1}
                />
              )
            })}
            <text
              x={xScale(rounds.length - 1) + 6}
              y={yScale(l.lastTotal) + 4}
              fontSize={10}
              fontWeight={700}
              fill={l.color}
            >
              {l.lastTotal}
            </text>
          </g>
        ))}
        <text x={PAD.left + chartW / 2} y={H - 0} textAnchor="middle" fontSize={10} fill={colors.fgMuted}>
          Runde
        </text>
      </svg>
    </div>
  )
}
