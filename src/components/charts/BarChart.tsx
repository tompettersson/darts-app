// src/components/charts/BarChart.tsx
// Horizontales Balkendiagramm für Vergleiche

import React from 'react'

interface BarData {
  label: string
  value: number
  color?: string
}

interface BarChartProps {
  data: BarData[]
  maxValue?: number // Optional: Fester Maximalwert
  height?: number // Höhe pro Balken
  gap?: number
  showValues?: boolean
  formatValue?: (v: number) => string
}

export default function BarChart({
  data,
  maxValue,
  height = 24,
  gap = 8,
  showValues = true,
  formatValue = (v) => v.toString(),
}: BarChartProps) {
  const max = maxValue ?? Math.max(...data.map(d => d.value), 1)

  const defaultColors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899']

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap }}>
      {data.map((item, i) => {
        const pct = (item.value / max) * 100
        const color = item.color ?? defaultColors[i % defaultColors.length]

        return (
          <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* Label */}
            <div style={{
              width: 60,
              fontSize: 12,
              color: '#6b7280',
              textAlign: 'right',
              flexShrink: 0,
            }}>
              {item.label}
            </div>

            {/* Bar Container */}
            <div style={{
              flex: 1,
              height,
              backgroundColor: '#f3f4f6',
              borderRadius: 4,
              overflow: 'hidden',
              position: 'relative',
            }}>
              {/* Bar Fill */}
              <div
                style={{
                  width: `${pct}%`,
                  height: '100%',
                  backgroundColor: color,
                  borderRadius: 4,
                  transition: 'width 0.3s ease',
                  minWidth: item.value > 0 ? 4 : 0,
                }}
              />
            </div>

            {/* Value */}
            {showValues && (
              <div style={{
                width: 40,
                fontSize: 13,
                fontWeight: 600,
                color: '#111827',
                textAlign: 'right',
                flexShrink: 0,
              }}>
                {formatValue(item.value)}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
