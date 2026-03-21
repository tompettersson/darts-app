import React from 'react'

/**
 * Mini-Sparkline: Zeigt die letzten N Aufnahmen als winzigen Liniengraph.
 * Wird in der Spieler-Karte angezeigt um die aktuelle Form sichtbar zu machen.
 */
export default function MiniSparkline({ values, color = '#0ea5e9', width = 80, height = 24 }: {
  values: number[]
  color?: string
  width?: number
  height?: number
}) {
  if (values.length < 2) return null

  const max = Math.max(...values, 1)
  const min = Math.min(...values, 0)
  const range = max - min || 1

  const pad = 2
  const w = width - pad * 2
  const h = height - pad * 2

  const points = values.map((v, i) => {
    const x = pad + (i / (values.length - 1)) * w
    const y = pad + h - ((v - min) / range) * h
    return `${x},${y}`
  }).join(' ')

  // Durchschnittslinie
  const avg = values.reduce((a, b) => a + b, 0) / values.length
  const avgY = pad + h - ((avg - min) / range) * h

  return (
    <svg width={width} height={height} style={{ display: 'block' }}>
      {/* Durchschnittslinie */}
      <line x1={pad} y1={avgY} x2={width - pad} y2={avgY} stroke={color} strokeWidth={0.5} opacity={0.3} strokeDasharray="2 2" />
      {/* Sparkline */}
      <polyline points={points} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      {/* Letzter Punkt hervorheben */}
      <circle cx={width - pad} cy={pad + h - ((values[values.length - 1] - min) / range) * h} r={2} fill={color} />
    </svg>
  )
}
