import React from 'react'

/**
 * DartboardHeatmap: Zeigt ein vereinfachtes Dartboard mit farbkodierten Segmenten
 * basierend auf der Trefferfrequenz pro Feld.
 */

type SegmentData = {
  field: number // 1-20
  hits: number
}

type Props = {
  segments: SegmentData[]
  bullHits?: number
  bullDoubleHits?: number
  size?: number
  colors?: { bg?: string; fg?: string }
}

// Dartboard Reihenfolge (im Uhrzeigersinn, beginnend oben)
const BOARD_ORDER = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5]

function getHeatColor(intensity: number): string {
  // 0 = kalt (blau/grau), 1 = heiß (rot/orange)
  if (intensity <= 0) return '#1e293b'
  if (intensity < 0.2) return '#1e40af'
  if (intensity < 0.4) return '#2563eb'
  if (intensity < 0.6) return '#f59e0b'
  if (intensity < 0.8) return '#f97316'
  return '#ef4444'
}

export default function DartboardHeatmap({ segments, bullHits = 0, bullDoubleHits = 0, size = 200, colors }: Props) {
  const cx = size / 2
  const cy = size / 2
  const maxHits = Math.max(...segments.map(s => s.hits), bullHits, 1)

  // Segment-Map für schnellen Lookup
  const hitMap = new Map<number, number>()
  for (const s of segments) hitMap.set(s.field, s.hits)

  const segAngle = 360 / 20
  const startAngle = -90 - segAngle / 2 // 20 oben zentriert

  // Radien
  const outerR = size * 0.46
  const innerR = size * 0.28
  const bullR = size * 0.08
  const bullDoubleR = size * 0.04

  const polarToCart = (angle: number, r: number) => ({
    x: cx + r * Math.cos((angle * Math.PI) / 180),
    y: cy + r * Math.sin((angle * Math.PI) / 180),
  })

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {/* Hintergrund */}
      <circle cx={cx} cy={cy} r={outerR + 4} fill={colors?.bg ?? '#0f172a'} />

      {/* Segmente */}
      {BOARD_ORDER.map((field, i) => {
        const a1 = startAngle + i * segAngle
        const a2 = a1 + segAngle
        const hits = hitMap.get(field) ?? 0
        const intensity = hits / maxHits
        const color = getHeatColor(intensity)

        // Äußerer Bogen (Hauptsegment)
        const outerStart = polarToCart(a1, outerR)
        const outerEnd = polarToCart(a2, outerR)
        const innerStart = polarToCart(a1, innerR)
        const innerEnd = polarToCart(a2, innerR)

        const path = [
          `M ${innerStart.x} ${innerStart.y}`,
          `L ${outerStart.x} ${outerStart.y}`,
          `A ${outerR} ${outerR} 0 0 1 ${outerEnd.x} ${outerEnd.y}`,
          `L ${innerEnd.x} ${innerEnd.y}`,
          `A ${innerR} ${innerR} 0 0 0 ${innerStart.x} ${innerStart.y}`,
        ].join(' ')

        // Label-Position (Mitte des Segments, außen)
        const labelAngle = a1 + segAngle / 2
        const labelR = outerR + 10
        const labelPos = polarToCart(labelAngle, labelR)

        return (
          <g key={field}>
            <path
              d={path}
              fill={color}
              stroke="#334155"
              strokeWidth={0.5}
              opacity={0.85}
            />
            <text
              x={labelPos.x}
              y={labelPos.y}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={size * 0.04}
              fontWeight={600}
              fill={colors?.fg ?? '#94a3b8'}
            >
              {field}
            </text>
          </g>
        )
      })}

      {/* Bull */}
      <circle
        cx={cx} cy={cy} r={bullR}
        fill={getHeatColor(bullHits / maxHits)}
        stroke="#334155" strokeWidth={0.5}
      />
      <circle
        cx={cx} cy={cy} r={bullDoubleR}
        fill={getHeatColor(bullDoubleHits / maxHits)}
        stroke="#334155" strokeWidth={0.5}
      />
    </svg>
  )
}
