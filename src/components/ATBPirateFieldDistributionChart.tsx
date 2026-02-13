// src/components/ATBPirateFieldDistributionChart.tsx
// Kreisdiagramm für Feldverteilung im ATB Piratenmodus

import React, { useMemo } from 'react'
import { useTheme } from '../ThemeProvider'

type FieldDistributionData = {
  label: string
  count: number
  color: string
}

type Props = {
  data: FieldDistributionData[]
  size?: number
}

export default function ATBPirateFieldDistributionChart({ data, size = 200 }: Props) {
  const { colors } = useTheme()

  const chartData = useMemo(() => {
    const total = data.reduce((sum, d) => sum + d.count, 0)
    if (total === 0) return { slices: [], total: 0 }

    let currentAngle = 0
    const slices = data.map(item => {
      const percentage = (item.count / total) * 100
      const sliceAngle = (item.count / total) * 360
      const startAngle = currentAngle
      const endAngle = currentAngle + sliceAngle

      const slice = {
        label: item.label,
        count: item.count,
        percentage,
        startAngle,
        endAngle,
        color: item.color,
      }

      currentAngle = endAngle
      return slice
    })

    return { slices, total }
  }, [data])

  const cx = size / 2
  const cy = size / 2
  const radius = size * 0.35

  const createSlicePath = (startAngle: number, endAngle: number, innerRadius: number, outerRadius: number) => {
    const toRad = (deg: number) => (deg - 90) * (Math.PI / 180)

    const x1 = cx + outerRadius * Math.cos(toRad(startAngle))
    const y1 = cy + outerRadius * Math.sin(toRad(startAngle))
    const x2 = cx + outerRadius * Math.cos(toRad(endAngle))
    const y2 = cy + outerRadius * Math.sin(toRad(endAngle))

    const largeArc = endAngle - startAngle > 180 ? 1 : 0

    if (innerRadius === 0) {
      return `M ${cx} ${cy} L ${x1} ${y1} A ${outerRadius} ${outerRadius} 0 ${largeArc} 1 ${x2} ${y2} Z`
    } else {
      const ix1 = cx + innerRadius * Math.cos(toRad(startAngle))
      const iy1 = cy + innerRadius * Math.sin(toRad(startAngle))
      const ix2 = cx + innerRadius * Math.cos(toRad(endAngle))
      const iy2 = cy + innerRadius * Math.sin(toRad(endAngle))
      return `M ${x1} ${y1} A ${outerRadius} ${outerRadius} 0 ${largeArc} 1 ${x2} ${y2} L ${ix2} ${iy2} A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${ix1} ${iy1} Z`
    }
  }

  if (chartData.slices.length === 0) {
    return (
      <div style={{ padding: 16, textAlign: 'center', color: colors.fgMuted }}>
        Keine Felddaten vorhanden
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Kreisdiagramm-Slices */}
        {chartData.slices.map((slice, idx) => (
          <path
            key={idx}
            d={createSlicePath(slice.startAngle, slice.endAngle, 0, radius)}
            fill={slice.color}
            opacity={0.8}
            stroke={colors.bg}
            strokeWidth={2}
          />
        ))}

        {/* Zentrierter Text mit Gesamtzahl */}
        <text
          x={cx}
          y={cy - 8}
          textAnchor="middle"
          dominantBaseline="central"
          fill={colors.fg}
          fontSize={18}
          fontWeight={700}
        >
          {chartData.total}
        </text>
        <text
          x={cx}
          y={cy + 12}
          textAnchor="middle"
          dominantBaseline="central"
          fill={colors.fgMuted}
          fontSize={11}
        >
          Felder
        </text>
      </svg>

      {/* Legende */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12 }}>
        {chartData.slices.map((slice, idx) => (
          <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div
              style={{
                width: 12,
                height: 12,
                borderRadius: 2,
                background: slice.color,
                opacity: 0.8,
              }}
            />
            <span style={{ color: colors.fg, flex: 1 }}>
              {slice.label}
            </span>
            <span style={{ color: colors.fgMuted, fontWeight: 600, minWidth: 40, textAlign: 'right' }}>
              {slice.count} ({slice.percentage.toFixed(0)}%)
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
