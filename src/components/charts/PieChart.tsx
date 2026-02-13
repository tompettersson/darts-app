// src/components/charts/PieChart.tsx
// Kreisdiagramm (Donut-Style) für Verteilungen

import React from 'react'

interface PieSlice {
  label: string
  value: number
  color?: string
}

interface PieChartProps {
  data: PieSlice[]
  size?: number
  strokeWidth?: number
  showLegend?: boolean
  showValues?: boolean
  donut?: boolean // Loch in der Mitte
}

export default function PieChart({
  data,
  size = 120,
  strokeWidth = 24,
  showLegend = true,
  showValues = true,
  donut = true,
}: PieChartProps) {
  const defaultColors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899']

  const total = data.reduce((sum, d) => sum + d.value, 0)
  if (total === 0) {
    return (
      <div style={{ textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>
        Keine Daten
      </div>
    )
  }

  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const center = size / 2

  // Berechne Segmente
  let currentAngle = -90 // Start oben

  const segments = data.map((item, i) => {
    const pct = (item.value / total) * 100
    const angle = (pct / 100) * 360
    const startAngle = currentAngle
    currentAngle += angle

    return {
      ...item,
      pct,
      startAngle,
      endAngle: currentAngle,
      color: item.color ?? defaultColors[i % defaultColors.length],
    }
  })

  // Für Donut: strokeDasharray/offset Methode
  let accumulatedPct = 0

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 16,
      flexWrap: 'wrap',
      justifyContent: 'center',
    }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {donut ? (
          // Donut-Style mit Strokes
          segments.map((seg, i) => {
            const dashLength = (seg.pct / 100) * circumference
            const dashOffset = -accumulatedPct / 100 * circumference
            accumulatedPct += seg.pct

            return (
              <circle
                key={seg.label}
                cx={center}
                cy={center}
                r={radius}
                fill="none"
                stroke={seg.color}
                strokeWidth={strokeWidth}
                strokeDasharray={`${dashLength} ${circumference - dashLength}`}
                strokeDashoffset={dashOffset}
                transform={`rotate(-90 ${center} ${center})`}
                style={{ transition: 'stroke-dasharray 0.3s ease' }}
              />
            )
          })
        ) : (
          // Filled Pie
          segments.map((seg) => {
            const startRad = (seg.startAngle * Math.PI) / 180
            const endRad = (seg.endAngle * Math.PI) / 180

            const x1 = center + radius * Math.cos(startRad)
            const y1 = center + radius * Math.sin(startRad)
            const x2 = center + radius * Math.cos(endRad)
            const y2 = center + radius * Math.sin(endRad)

            const largeArc = seg.pct > 50 ? 1 : 0

            const d = `M ${center} ${center} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z`

            return (
              <path
                key={seg.label}
                d={d}
                fill={seg.color}
                style={{ transition: 'd 0.3s ease' }}
              />
            )
          })
        )}

        {/* Center Text für Total (bei Donut) */}
        {donut && (
          <text
            x={center}
            y={center}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={size / 6}
            fontWeight={700}
            fill="#111827"
          >
            {total}
          </text>
        )}
      </svg>

      {/* Legende */}
      {showLegend && (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
        }}>
          {segments.map((seg) => (
            <div key={seg.label} style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 12,
            }}>
              <div style={{
                width: 10,
                height: 10,
                borderRadius: 2,
                backgroundColor: seg.color,
                flexShrink: 0,
              }} />
              <span style={{ color: '#6b7280' }}>{seg.label}</span>
              {showValues && (
                <span style={{ color: '#111827', fontWeight: 600, marginLeft: 'auto' }}>
                  {seg.pct.toFixed(0)}%
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
