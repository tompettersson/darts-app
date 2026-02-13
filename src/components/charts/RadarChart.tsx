// src/components/charts/RadarChart.tsx
// Radar/Spinnennetz-Chart für Cricket Feld-Performance

import React from 'react'

interface RadarDataPoint {
  label: string
  value: number // 0-100 normalisiert
}

interface RadarChartProps {
  data: RadarDataPoint[]
  size?: number
  color?: string
  fillOpacity?: number
  showLabels?: boolean
  levels?: number // Anzahl der Ringe
}

export default function RadarChart({
  data,
  size = 200,
  color = '#3b82f6',
  fillOpacity = 0.3,
  showLabels = true,
  levels = 4,
}: RadarChartProps) {
  if (data.length < 3) {
    return (
      <div style={{ textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>
        Mindestens 3 Datenpunkte benötigt
      </div>
    )
  }

  const center = size / 2
  const radius = (size - 40) / 2 // Platz für Labels
  const angleStep = (2 * Math.PI) / data.length

  // Punkte auf dem Polygon berechnen
  const getPoint = (index: number, value: number) => {
    const angle = angleStep * index - Math.PI / 2 // Start oben
    const r = (value / 100) * radius
    return {
      x: center + r * Math.cos(angle),
      y: center + r * Math.sin(angle),
    }
  }

  // Label-Position
  const getLabelPoint = (index: number) => {
    const angle = angleStep * index - Math.PI / 2
    const r = radius + 16
    return {
      x: center + r * Math.cos(angle),
      y: center + r * Math.sin(angle),
    }
  }

  // Grid-Linien (Ringe)
  const gridLevels = Array.from({ length: levels }, (_, i) => ((i + 1) / levels) * 100)

  // Polygon-Pfad für Datenpunkte
  const polygonPoints = data
    .map((d, i) => {
      const p = getPoint(i, d.value)
      return `${p.x},${p.y}`
    })
    .join(' ')

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {/* Grid Ringe */}
      {gridLevels.map((level) => {
        const points = data
          .map((_, i) => {
            const p = getPoint(i, level)
            return `${p.x},${p.y}`
          })
          .join(' ')
        return (
          <polygon
            key={level}
            points={points}
            fill="none"
            stroke="#e5e7eb"
            strokeWidth={1}
          />
        )
      })}

      {/* Achsenlinien */}
      {data.map((_, i) => {
        const p = getPoint(i, 100)
        return (
          <line
            key={i}
            x1={center}
            y1={center}
            x2={p.x}
            y2={p.y}
            stroke="#e5e7eb"
            strokeWidth={1}
          />
        )
      })}

      {/* Daten-Polygon */}
      <polygon
        points={polygonPoints}
        fill={color}
        fillOpacity={fillOpacity}
        stroke={color}
        strokeWidth={2}
        style={{ transition: 'all 0.3s ease' }}
      />

      {/* Datenpunkte */}
      {data.map((d, i) => {
        const p = getPoint(i, d.value)
        return (
          <circle
            key={d.label}
            cx={p.x}
            cy={p.y}
            r={4}
            fill={color}
            stroke="#fff"
            strokeWidth={2}
          />
        )
      })}

      {/* Labels */}
      {showLabels && data.map((d, i) => {
        const p = getLabelPoint(i)
        const angle = angleStep * i - Math.PI / 2

        // Textausrichtung basierend auf Position
        let textAnchor: 'start' | 'middle' | 'end' = 'middle'
        if (Math.cos(angle) > 0.1) textAnchor = 'start'
        else if (Math.cos(angle) < -0.1) textAnchor = 'end'

        return (
          <text
            key={d.label}
            x={p.x}
            y={p.y}
            textAnchor={textAnchor}
            dominantBaseline="middle"
            fontSize={11}
            fill="#6b7280"
          >
            {d.label}
          </text>
        )
      })}
    </svg>
  )
}
