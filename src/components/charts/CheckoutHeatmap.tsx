// src/components/charts/CheckoutHeatmap.tsx
// Heatmap für Checkout-Doppelfelder (welche Doubles werden am häufigsten gecheckt)

import React, { useMemo } from 'react'
import HeatmapGrid from './HeatmapGrid'

interface CheckoutHeatmapProps {
  finishingDoubles: Record<string, number>
  showPercent?: boolean
}

export default function CheckoutHeatmap({ finishingDoubles, showPercent = true }: CheckoutHeatmapProps) {
  const data = useMemo(() => {
    // Alle Double-Felder: 20 bis 1 (absteigend für natürliche Dartboard-Reihenfolge), dann BULL
    const fields = [
      '20', '19', '18', '17', '16',
      '15', '14', '13', '12', '11',
      '10', '9', '8', '7', '6',
      '5', '4', '3', '2', '1',
      'BULL'
    ]
    const total = Object.values(finishingDoubles).reduce((a, b) => a + b, 0) || 1

    return fields.map(field => {
      const count = finishingDoubles[field] ?? 0
      return {
        label: field === 'BULL' ? 'Bull' : `D${field}`,
        value: showPercent
          ? (count / total) * 100
          : count,
      }
    })
  }, [finishingDoubles, showPercent])

  // Maximalen Wert für Normalisierung berechnen (für Farbintensität)
  const maxValue = useMemo(() => {
    return Math.max(...data.map(d => d.value), 1)
  }, [data])

  // Normalisierte Daten für HeatmapGrid (erwartet 0-100 für Farbe)
  // Aber wir zeigen den echten Wert als Text
  const normalizedData = useMemo(() => {
    return data.map(d => ({
      label: d.label,
      // Normalisierter Wert für Farbintensität (0-100)
      value: (d.value / maxValue) * 100,
    }))
  }, [data, maxValue])

  return (
    <HeatmapGrid
      data={normalizedData}
      columns={5}
      cellSize={52}
      gap={4}
      colorScale="green"
      showLabels
      showValues
      formatValue={(normalizedValue) => {
        // Rückrechnung zum echten Wert
        const realValue = (normalizedValue / 100) * maxValue
        return showPercent ? `${realValue.toFixed(0)}%` : `${realValue.toFixed(0)}`
      }}
    />
  )
}
