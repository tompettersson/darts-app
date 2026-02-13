// src/components/charts/GaugeChart.tsx
// Halbkreis-Gauge für Prozent-Anzeige (z.B. Win-Rate)

import React from 'react'

interface GaugeChartProps {
  value: number // 0-100
  label?: string
  size?: number
  strokeWidth?: number
  color?: string
  backgroundColor?: string
  showValue?: boolean
  formatValue?: (v: number) => string
}

export default function GaugeChart({
  value,
  label,
  size = 120,
  strokeWidth = 12,
  color = '#10b981',
  backgroundColor = '#e5e7eb',
  showValue = true,
  formatValue = (v) => `${v.toFixed(1)}%`,
}: GaugeChartProps) {
  const clampedValue = Math.max(0, Math.min(100, value))

  // SVG Berechnungen für Halbkreis
  const radius = (size - strokeWidth) / 2
  const circumference = Math.PI * radius // Halbkreis
  const offset = circumference - (clampedValue / 100) * circumference

  // Farbe basierend auf Wert (optional)
  const getColor = () => {
    if (color !== '#10b981') return color
    if (clampedValue >= 60) return '#10b981' // Grün
    if (clampedValue >= 40) return '#f59e0b' // Orange
    return '#ef4444' // Rot
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 4,
    }}>
      <svg
        width={size}
        height={size / 2 + 10}
        viewBox={`0 0 ${size} ${size / 2 + 10}`}
      >
        {/* Background Arc */}
        <path
          d={`M ${strokeWidth / 2} ${size / 2} A ${radius} ${radius} 0 0 1 ${size - strokeWidth / 2} ${size / 2}`}
          fill="none"
          stroke={backgroundColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />

        {/* Value Arc */}
        <path
          d={`M ${strokeWidth / 2} ${size / 2} A ${radius} ${radius} 0 0 1 ${size - strokeWidth / 2} ${size / 2}`}
          fill="none"
          stroke={getColor()}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 0.5s ease' }}
        />

        {/* Value Text */}
        {showValue && (
          <text
            x={size / 2}
            y={size / 2}
            textAnchor="middle"
            fontSize={size / 5}
            fontWeight={700}
            fill="#111827"
          >
            {formatValue(clampedValue)}
          </text>
        )}
      </svg>

      {label && (
        <div style={{
          fontSize: 12,
          color: '#6b7280',
          textAlign: 'center',
        }}>
          {label}
        </div>
      )}
    </div>
  )
}
