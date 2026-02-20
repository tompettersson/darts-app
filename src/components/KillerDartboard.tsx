// src/components/KillerDartboard.tsx
// Interaktive SVG-Dartscheibe für Killer mit Glow-Highlights
// Basiert auf DartboardInput.tsx (Click-Handler) + ATBDartboard.tsx (Glow-Effekte)

import React, { useState } from 'react'

type Props = {
  onThrow: (target: number | 'MISS', mult: 1 | 2 | 3) => void
  disabled?: boolean
  ownTarget?: number | null       // Eigene Zahl (rot/Warnung)
  enemyTargets?: number[]         // Gegner-Zahlen (grün/Angriff)
  secretNumbers?: boolean         // Wenn true, keine Gegner-Highlights
}

// Dartscheiben-Reihenfolge (im Uhrzeigersinn, startend bei 20 oben)
const SEGMENTS = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5]

// Radien (relativ zum Gesamtradius 200)
const R = {
  doubleBull: 12,
  singleBull: 28,
  tripleInner: 85,
  tripleOuter: 115,
  doubleInner: 148,
  doubleOuter: 178,
  board: 200,
}

// Farben
const COLORS = {
  black: '#1a1a1a',
  white: '#f5f0e6',
  red: '#c41e3a',
  green: '#006400',
  wire: '#c0c0c0',
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

export default function KillerDartboard({ onThrow, disabled, ownTarget, enemyTargets = [], secretNumbers }: Props) {
  const [hovered, setHovered] = useState<string | null>(null)
  const cx = 200
  const cy = 200

  const handleClick = (target: number | 'MISS', mult: 1 | 2 | 3) => {
    if (disabled) return
    onThrow(target, mult)
  }

  // Extrahiere die Zahl aus dem Hover-State
  const getHoveredNumber = (): number | null => {
    if (!hovered) return null
    if (hovered === 'miss' || hovered === 'bull') return null
    const match = hovered.match(/\d+$/)
    return match ? parseInt(match[0]) : null
  }
  const hoveredNumber = getHoveredNumber()

  // Highlight-Typ für eine Zahl bestimmen
  const getHighlightType = (num: number): 'own' | 'enemy' | null => {
    if (ownTarget === num) return 'own'
    if (!secretNumbers && enemyTargets.includes(num)) return 'enemy'
    return null
  }

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
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 8,
      opacity: disabled ? 0.5 : 1,
      pointerEvents: disabled ? 'none' : 'auto',
      transition: 'opacity 0.2s',
    }}>
      <svg
        viewBox="0 0 400 400"
        width="280"
        height="280"
        style={{
          cursor: disabled ? 'not-allowed' : 'pointer',
          filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.3))',
        }}
      >
        <defs>
          {/* Roter Glow-Filter (eigene Zahl = Warnung) */}
          <filter id="killer-own-glow" x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur stdDeviation="10" result="blur" />
            <feFlood floodColor="#ef4444" floodOpacity="0.8" />
            <feComposite in2="blur" operator="in" />
            <feMerge>
              <feMergeNode />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          {/* Grüner Glow-Filter (Gegner-Zahlen = Angriff) */}
          <filter id="killer-enemy-glow" x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur stdDeviation="8" result="blur" />
            <feFlood floodColor="#22c55e" floodOpacity="0.7" />
            <feComposite in2="blur" operator="in" />
            <feMerge>
              <feMergeNode />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          {/* Pulsier-Animation */}
          <style>{`
            @keyframes killer-pulse-own {
              0%, 100% { opacity: 0.25; }
              50% { opacity: 0.55; }
            }
            @keyframes killer-pulse-enemy {
              0%, 100% { opacity: 0.15; }
              50% { opacity: 0.35; }
            }
          `}</style>
        </defs>

        {/* Hintergrund (Miss-Bereich) */}
        <circle
          cx={cx}
          cy={cy}
          r={R.board}
          fill="#2a2a2a"
          onClick={() => handleClick('MISS', 1)}
          onMouseEnter={() => setHovered('miss')}
          onMouseLeave={() => setHovered(null)}
          style={{ cursor: disabled ? 'not-allowed' : 'pointer' }}
        />

        {/* Äußerer Ring (Rahmen) */}
        <circle cx={cx} cy={cy} r={R.doubleOuter + 2} fill="none" stroke="#444" strokeWidth="4" />

        {/* Segmente zeichnen */}
        {SEGMENTS.map((num, i) => {
          const startAngle = i * 18 - 9
          const endAngle = i * 18 + 9
          const highlight = getHighlightType(num)

          const segments = [
            { id: `d-${num}`, innerR: R.doubleInner, outerR: R.doubleOuter, mult: 2 as const, isDoubleOrTriple: true },
            { id: `so-${num}`, innerR: R.tripleOuter, outerR: R.doubleInner, mult: 1 as const, isDoubleOrTriple: false },
            { id: `t-${num}`, innerR: R.tripleInner, outerR: R.tripleOuter, mult: 3 as const, isDoubleOrTriple: true },
            { id: `si-${num}`, innerR: R.singleBull, outerR: R.tripleInner, mult: 1 as const, isDoubleOrTriple: false },
          ]

          return (
            <g key={num}>
              {segments.map((seg) => {
                const baseColor = getSegmentColor(i, seg.isDoubleOrTriple)
                const isHovered = hovered === seg.id
                const fillColor = isHovered ? getHoverColor(baseColor) : baseColor

                return (
                  <path
                    key={seg.id}
                    d={segmentPath(cx, cy, seg.innerR, seg.outerR, startAngle, endAngle)}
                    fill={fillColor}
                    stroke={COLORS.wire}
                    strokeWidth="0.5"
                    onClick={() => handleClick(num, seg.mult)}
                    onMouseEnter={() => setHovered(seg.id)}
                    onMouseLeave={() => setHovered(null)}
                    style={{ cursor: disabled ? 'not-allowed' : 'pointer', transition: 'fill 0.1s' }}
                  />
                )
              })}

              {/* Highlight-Overlay für eigene/Gegner-Zahlen */}
              {highlight && (
                <path
                  d={segmentPath(cx, cy, R.singleBull, R.doubleOuter, startAngle, endAngle)}
                  fill={highlight === 'own' ? '#ef4444' : '#22c55e'}
                  filter={highlight === 'own' ? 'url(#killer-own-glow)' : 'url(#killer-enemy-glow)'}
                  style={{
                    pointerEvents: 'none',
                    animation: highlight === 'own'
                      ? 'killer-pulse-own 1.2s ease-in-out infinite'
                      : 'killer-pulse-enemy 1.8s ease-in-out infinite',
                  }}
                />
              )}
            </g>
          )
        })}

        {/* Bull-Bereich = Miss (Killer nutzt nur 1-20) */}
        <circle
          cx={cx}
          cy={cy}
          r={R.singleBull}
          fill={hovered === 'bull' ? '#3a3a3a' : '#2a2a2a'}
          stroke={COLORS.wire}
          strokeWidth="0.5"
          onClick={() => handleClick('MISS', 1)}
          onMouseEnter={() => setHovered('bull')}
          onMouseLeave={() => setHovered(null)}
          style={{ cursor: disabled ? 'not-allowed' : 'pointer', transition: 'fill 0.1s' }}
        />
        {/* "Miss" Label im Bull */}
        <text
          x={cx}
          y={cy}
          textAnchor="middle"
          dominantBaseline="middle"
          fill="#555"
          fontSize="10"
          fontWeight="600"
          style={{ pointerEvents: 'none', userSelect: 'none' }}
        >
          MISS
        </text>

        {/* Zahlen außen herum */}
        {SEGMENTS.map((num, i) => {
          const angle = (i * 18 - 90) * (Math.PI / 180)
          const r = R.doubleOuter + 16
          const x = cx + r * Math.cos(angle)
          const y = cy + r * Math.sin(angle)
          const isHoveredLabel = hoveredNumber === num
          const highlight = getHighlightType(num)

          // Farbe bestimmen: Hover > Own > Enemy > Standard
          let labelColor = '#888'
          let labelShadow = 'none'
          let labelSize = '14'
          let labelWeight = 'bold'

          if (isHoveredLabel) {
            labelColor = '#fbbf24'
            labelShadow = '0 0 8px #fbbf24'
            labelSize = '18'
          } else if (highlight === 'own') {
            labelColor = '#ef4444'
            labelShadow = '0 0 10px #ef4444, 0 0 20px #ef444480'
            labelSize = '16'
            labelWeight = '900'
          } else if (highlight === 'enemy') {
            labelColor = '#22c55e'
            labelShadow = '0 0 8px #22c55e, 0 0 16px #22c55e80'
            labelSize = '15'
            labelWeight = '800'
          }

          return (
            <text
              key={`label-${num}`}
              x={x}
              y={y}
              textAnchor="middle"
              dominantBaseline="middle"
              fill={labelColor}
              fontSize={labelSize}
              fontWeight={labelWeight}
              style={{
                pointerEvents: 'none',
                userSelect: 'none',
                transition: 'all 0.15s ease',
                textShadow: labelShadow,
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
        color: '#9ca3af',
      }}>
        {hovered === 'miss' && 'Miss (außerhalb)'}
        {hovered === 'bull' && 'Miss (Bull = Miss bei Killer)'}
        {hovered?.startsWith('d-') && `Double ${hovered.slice(2)}`}
        {hovered?.startsWith('t-') && `Triple ${hovered.slice(2)}`}
        {(hovered?.startsWith('so-') || hovered?.startsWith('si-')) && `Single ${hovered.slice(3)}`}
      </div>
    </div>
  )
}
