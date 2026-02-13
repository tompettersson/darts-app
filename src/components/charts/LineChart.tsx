// src/components/charts/LineChart.tsx
// Einfache SVG Line-Chart Komponente für Trend-Daten

import React from 'react'

type DataPoint = {
  label: string
  value: number
}

type Props = {
  data: DataPoint[]
  height?: number
  width?: number
  color?: string
  showPoints?: boolean
  showLabels?: boolean
  showGrid?: boolean
  valueFormatter?: (v: number) => string
}

export default function LineChart({
  data,
  height = 150,
  width = 300,
  color = '#3b82f6',
  showPoints = true,
  showLabels = true,
  showGrid = true,
  valueFormatter = (v) => v.toFixed(1),
}: Props) {
  if (data.length === 0) {
    return (
      <div style={{
        height,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#9ca3af',
        fontSize: 12,
      }}>
        Keine Daten
      </div>
    )
  }

  const padding = { top: 20, right: 20, bottom: 30, left: 45 }
  const chartWidth = width - padding.left - padding.right
  const chartHeight = height - padding.top - padding.bottom

  const values = data.map((d) => d.value)
  const minValue = Math.min(...values)
  const maxValue = Math.max(...values)
  const valueRange = maxValue - minValue || 1

  // Skaliere Y-Werte mit etwas Puffer
  const yMin = Math.floor(minValue - valueRange * 0.1)
  const yMax = Math.ceil(maxValue + valueRange * 0.1)
  const yRange = yMax - yMin || 1

  const points = data.map((d, i) => ({
    x: padding.left + (i / (data.length - 1 || 1)) * chartWidth,
    y: padding.top + chartHeight - ((d.value - yMin) / yRange) * chartHeight,
    ...d,
  }))

  // SVG Path für die Linie
  const linePath = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`)
    .join(' ')

  // Grid-Linien (horizontal)
  const gridLines = 5
  const gridY = Array.from({ length: gridLines }, (_, i) => ({
    y: padding.top + (i / (gridLines - 1)) * chartHeight,
    value: yMax - (i / (gridLines - 1)) * yRange,
  }))

  return (
    <svg width={width} height={height} style={{ overflow: 'visible' }}>
      {/* Grid */}
      {showGrid && gridY.map((g, i) => (
        <g key={i}>
          <line
            x1={padding.left}
            y1={g.y}
            x2={padding.left + chartWidth}
            y2={g.y}
            stroke="#e5e7eb"
            strokeDasharray="4,4"
          />
          <text
            x={padding.left - 8}
            y={g.y}
            textAnchor="end"
            dominantBaseline="middle"
            fontSize={10}
            fill="#9ca3af"
          >
            {valueFormatter(g.value)}
          </text>
        </g>
      ))}

      {/* Linie */}
      <path
        d={linePath}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Fläche unter der Linie */}
      <path
        d={`${linePath} L ${points[points.length - 1]?.x ?? 0} ${padding.top + chartHeight} L ${points[0]?.x ?? 0} ${padding.top + chartHeight} Z`}
        fill={color}
        fillOpacity={0.1}
      />

      {/* Punkte */}
      {showPoints && points.map((p, i) => (
        <circle
          key={i}
          cx={p.x}
          cy={p.y}
          r={4}
          fill="#fff"
          stroke={color}
          strokeWidth={2}
        />
      ))}

      {/* X-Achsen Labels */}
      {showLabels && points.map((p, i) => {
        // Zeige nur jeden n-ten Label wenn zu viele Datenpunkte
        const step = Math.ceil(data.length / 6)
        if (i % step !== 0 && i !== data.length - 1) return null
        return (
          <text
            key={i}
            x={p.x}
            y={height - 8}
            textAnchor="middle"
            fontSize={10}
            fill="#6b7280"
          >
            {p.label}
          </text>
        )
      })}
    </svg>
  )
}
