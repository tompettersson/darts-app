// src/components/charts/ProgressBar.tsx
// Einfacher Fortschrittsbalken für Prozent-Werte

import React from 'react'

interface ProgressBarProps {
  value: number // 0-100
  label?: string
  showValue?: boolean
  height?: number
  color?: string
  backgroundColor?: string
}

export default function ProgressBar({
  value,
  label,
  showValue = true,
  height = 20,
  color = '#10b981',
  backgroundColor = '#e5e7eb',
}: ProgressBarProps) {
  const clampedValue = Math.max(0, Math.min(100, value))

  return (
    <div style={{ width: '100%' }}>
      {label && (
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginBottom: 4,
          fontSize: 13,
          color: '#6b7280',
        }}>
          <span>{label}</span>
          {showValue && <span style={{ fontWeight: 600, color: '#111827' }}>{clampedValue.toFixed(1)}%</span>}
        </div>
      )}
      <div
        style={{
          width: '100%',
          height,
          backgroundColor,
          borderRadius: height / 2,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${clampedValue}%`,
            height: '100%',
            backgroundColor: color,
            borderRadius: height / 2,
            transition: 'width 0.3s ease',
          }}
        />
      </div>
    </div>
  )
}
