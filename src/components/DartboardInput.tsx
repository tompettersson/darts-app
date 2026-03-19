// src/components/DartboardInput.tsx
// Interaktive SVG-Dartscheibe als Eingabemethode

import React, { useState } from 'react'
import type { Bed } from '../darts501'

type Props = {
  onThrow: (bed: Bed | 'MISS', mult: 1 | 2 | 3) => void
}

// Dartscheiben-Reihenfolge (im Uhrzeigersinn, startend bei 20 oben)
const SEGMENTS = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5]

// Radien (relativ zum Gesamtradius 200)
// Double und Triple Felder vergrößert für bessere Klickbarkeit
const R = {
  doubleBull: 12,   // Double Bull (50) - etwas größer
  singleBull: 28,   // Single Bull (25) - etwas größer
  tripleInner: 85,  // Triple Ring innen - früher starten
  tripleOuter: 115, // Triple Ring außen - später enden (30px breit statt 12px)
  doubleInner: 148, // Double Ring innen - früher starten
  doubleOuter: 178, // Double Ring außen (30px breit statt 16px)
  board: 200,       // Gesamtradius
}

// Farben
const COLORS = {
  black: '#1a1a1a',
  white: '#f5f0e6',
  red: '#c41e3a',
  green: '#006400',
  wire: '#c0c0c0',
  bullRed: '#c41e3a',
  bullGreen: '#006400',
}

// Berechnet einen Segment-Pfad (Kreisausschnitt)
function segmentPath(
  cx: number,
  cy: number,
  innerR: number,
  outerR: number,
  startAngle: number,
  endAngle: number
): string {
  const toRad = (deg: number) => (deg - 90) * (Math.PI / 180)

  const x1 = cx + innerR * Math.cos(toRad(startAngle))
  const y1 = cy + innerR * Math.sin(toRad(startAngle))
  const x2 = cx + outerR * Math.cos(toRad(startAngle))
  const y2 = cy + outerR * Math.sin(toRad(startAngle))
  const x3 = cx + outerR * Math.cos(toRad(endAngle))
  const y3 = cy + outerR * Math.sin(toRad(endAngle))
  const x4 = cx + innerR * Math.cos(toRad(endAngle))
  const y4 = cy + innerR * Math.sin(toRad(endAngle))

  const largeArc = endAngle - startAngle > 180 ? 1 : 0

  return `M ${x1} ${y1} L ${x2} ${y2} A ${outerR} ${outerR} 0 ${largeArc} 1 ${x3} ${y3} L ${x4} ${y4} A ${innerR} ${innerR} 0 ${largeArc} 0 ${x1} ${y1} Z`
}

export default function DartboardInput({ onThrow }: Props) {
  const [hovered, setHovered] = useState<string | null>(null)
  const cx = 200
  const cy = 200

  const handleClick = (bed: Bed | 'MISS', mult: 1 | 2 | 3) => {
    onThrow(bed, mult)
  }

  // Extrahiere die Zahl aus dem Hover-State (z.B. "d-20" -> 20)
  const getHoveredNumber = (): number | null => {
    if (!hovered) return null
    if (hovered === 'miss' || hovered === 'bull' || hovered === 'dbull') return null
    const match = hovered.match(/\d+$/)
    return match ? parseInt(match[0]) : null
  }
  const hoveredNumber = getHoveredNumber()

  // Segment-Farbe bestimmen (alternierend schwarz/weiß bzw. rot/grün)
  const getSegmentColor = (index: number, isDoubleOrTriple: boolean) => {
    if (isDoubleOrTriple) {
      return index % 2 === 0 ? COLORS.red : COLORS.green
    }
    return index % 2 === 0 ? COLORS.black : COLORS.white
  }

  // Hover-Farbe (aufgehellt)
  const getHoverColor = (baseColor: string) => {
    if (baseColor === COLORS.black) return '#333'
    if (baseColor === COLORS.white) return '#fff'
    if (baseColor === COLORS.red) return '#e63950'
    if (baseColor === COLORS.green) return '#008000'
    return baseColor
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
      <svg
        viewBox="0 0 400 400"
        width="320"
        height="320"
        role="img"
        aria-label="Interaktive Dartscheibe zur Wurf-Eingabe"
        style={{
          cursor: 'pointer',
          filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.3))',
        }}
      >
        {/* Hintergrund (Miss-Bereich) */}
        <circle
          cx={cx}
          cy={cy}
          r={R.board}
          fill="#2a2a2a"
          onClick={() => handleClick('MISS', 1)}
          onMouseEnter={() => setHovered('miss')}
          onMouseLeave={() => setHovered(null)}
          style={{ cursor: 'pointer' }}
          aria-label="Miss"
          role="button"
        />

        {/* Äußerer Ring (Rahmen) */}
        <circle cx={cx} cy={cy} r={R.doubleOuter + 2} fill="none" stroke="#444" strokeWidth="4" />

        {/* Segmente zeichnen */}
        {SEGMENTS.map((num, i) => {
          const startAngle = i * 18 - 9
          const endAngle = i * 18 + 9

          const segments = [
            // Double (außen)
            {
              id: `d-${num}`,
              innerR: R.doubleInner,
              outerR: R.doubleOuter,
              mult: 2 as const,
              isDoubleOrTriple: true,
            },
            // Single außen (zwischen Double und Triple)
            {
              id: `so-${num}`,
              innerR: R.tripleOuter,
              outerR: R.doubleInner,
              mult: 1 as const,
              isDoubleOrTriple: false,
            },
            // Triple
            {
              id: `t-${num}`,
              innerR: R.tripleInner,
              outerR: R.tripleOuter,
              mult: 3 as const,
              isDoubleOrTriple: true,
            },
            // Single innen (zwischen Triple und Bull)
            {
              id: `si-${num}`,
              innerR: R.singleBull,
              outerR: R.tripleInner,
              mult: 1 as const,
              isDoubleOrTriple: false,
            },
          ]

          return segments.map((seg) => {
            const baseColor = getSegmentColor(i, seg.isDoubleOrTriple)
            const isHovered = hovered === seg.id
            const fillColor = isHovered ? getHoverColor(baseColor) : baseColor

            const multLabel = seg.mult === 3 ? 'Triple' : seg.mult === 2 ? 'Double' : 'Single'
            return (
              <path
                key={seg.id}
                d={segmentPath(cx, cy, seg.innerR, seg.outerR, startAngle, endAngle)}
                fill={fillColor}
                stroke={COLORS.wire}
                strokeWidth="0.5"
                onClick={() => handleClick(num as Bed, seg.mult)}
                onMouseEnter={() => setHovered(seg.id)}
                onMouseLeave={() => setHovered(null)}
                style={{ cursor: 'pointer', transition: 'fill 0.1s' }}
                aria-label={`${multLabel} ${num}`}
                role="button"
              />
            )
          })
        })}

        {/* Single Bull (grün, 25) */}
        <circle
          cx={cx}
          cy={cy}
          r={R.singleBull}
          fill={hovered === 'bull' ? '#008000' : COLORS.bullGreen}
          stroke={COLORS.wire}
          strokeWidth="0.5"
          onClick={() => handleClick('BULL', 1)}
          onMouseEnter={() => setHovered('bull')}
          onMouseLeave={() => setHovered(null)}
          style={{ cursor: 'pointer', transition: 'fill 0.1s' }}
          aria-label="Single Bull (25)"
          role="button"
        />

        {/* Double Bull (rot, 50) */}
        <circle
          cx={cx}
          cy={cy}
          r={R.doubleBull}
          fill={hovered === 'dbull' ? '#e63950' : COLORS.bullRed}
          stroke={COLORS.wire}
          strokeWidth="0.5"
          onClick={() => handleClick('DBULL', 1)}
          onMouseEnter={() => setHovered('dbull')}
          onMouseLeave={() => setHovered(null)}
          style={{ cursor: 'pointer', transition: 'fill 0.1s' }}
          aria-label="Double Bull (50)"
          role="button"
        />

        {/* Zahlen außen herum */}
        {SEGMENTS.map((num, i) => {
          const angle = (i * 18 - 90) * (Math.PI / 180)
          const r = R.doubleOuter + 16
          const x = cx + r * Math.cos(angle)
          const y = cy + r * Math.sin(angle)
          const isHighlighted = hoveredNumber === num

          return (
            <text
              key={`label-${num}`}
              x={x}
              y={y}
              textAnchor="middle"
              dominantBaseline="middle"
              fill={isHighlighted ? '#fbbf24' : '#888'}
              fontSize={isHighlighted ? '18' : '14'}
              fontWeight="bold"
              style={{
                pointerEvents: 'none',
                userSelect: 'none',
                transition: 'all 0.15s ease',
                textShadow: isHighlighted ? '0 0 8px #fbbf24' : 'none',
              }}
            >
              {num}
            </text>
          )
        })}
      </svg>

      {/* Hover-Info */}
      <div style={{
        height: 24,
        fontSize: 14,
        fontWeight: 600,
        color: '#374151',
      }}>
        {hovered === 'miss' && 'Miss (außerhalb)'}
        {hovered === 'bull' && 'Single Bull (25)'}
        {hovered === 'dbull' && 'Double Bull (50)'}
        {hovered?.startsWith('d-') && `Double ${hovered.slice(2)}`}
        {hovered?.startsWith('t-') && `Triple ${hovered.slice(2)}`}
        {(hovered?.startsWith('so-') || hovered?.startsWith('si-')) && `Single ${hovered.slice(3)}`}
      </div>
    </div>
  )
}
