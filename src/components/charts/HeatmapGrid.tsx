// src/components/charts/HeatmapGrid.tsx
// Grid mit Farbintensität basierend auf Werten (z.B. ATB Zahlen-Profil)

import React from 'react'

interface HeatmapCell {
  label: string
  value: number // 0-100 (oder normalisiert)
}

interface HeatmapGridProps {
  data: HeatmapCell[]
  columns?: number
  cellSize?: number
  gap?: number
  colorScale?: 'green' | 'blue' | 'red' | 'rainbow'
  showLabels?: boolean
  showValues?: boolean
  formatValue?: (v: number) => string
}

export default function HeatmapGrid({
  data,
  columns = 5,
  cellSize = 48,
  gap = 4,
  colorScale = 'green',
  showLabels = true,
  showValues = true,
  formatValue = (v) => `${v.toFixed(0)}%`,
}: HeatmapGridProps) {
  // Farbskalen
  const getColor = (value: number) => {
    const v = Math.max(0, Math.min(100, value))

    switch (colorScale) {
      case 'green':
        // Weiß -> Grün
        const g = Math.round(200 - (v / 100) * 150)
        return `rgb(${g}, ${Math.min(200, 100 + v)}, ${g})`

      case 'blue':
        // Weiß -> Blau
        const b = Math.round(240 - (v / 100) * 100)
        return `rgb(${b}, ${b}, ${Math.min(255, 180 + v * 0.75)})`

      case 'red':
        // Weiß -> Rot
        const r = Math.round(255 - (v / 100) * 50)
        return `rgb(255, ${r}, ${r})`

      case 'rainbow':
        // Rot -> Gelb -> Grün
        if (v < 50) {
          return `rgb(255, ${Math.round((v / 50) * 200)}, 50)`
        } else {
          return `rgb(${Math.round(255 - ((v - 50) / 50) * 200)}, 200, 50)`
        }

      default:
        return '#f3f4f6'
    }
  }

  // Textfarbe basierend auf Hintergrund
  const getTextColor = (value: number) => {
    return value > 60 ? '#fff' : '#111827'
  }

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${columns}, ${cellSize}px)`,
        gap,
        justifyContent: 'center',
      }}
    >
      {data.map((cell) => (
        <div
          key={cell.label}
          style={{
            width: cellSize,
            height: cellSize,
            backgroundColor: getColor(cell.value),
            borderRadius: 6,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'background-color 0.3s ease',
            border: '1px solid rgba(0,0,0,0.05)',
          }}
        >
          {showLabels && (
            <span
              style={{
                fontSize: cellSize > 40 ? 14 : 11,
                fontWeight: 700,
                color: getTextColor(cell.value),
              }}
            >
              {cell.label}
            </span>
          )}
          {showValues && (
            <span
              style={{
                fontSize: cellSize > 40 ? 10 : 9,
                color: getTextColor(cell.value),
                opacity: 0.9,
              }}
            >
              {formatValue(cell.value)}
            </span>
          )}
        </div>
      ))}
    </div>
  )
}
