// src/components/StraeusschenDartboard.tsx
// Dartscheibe für Sträußchen: Hebt das Triple-Segment der Zielzahl hervor

import React from 'react'
import type { StrTargetNumber, StrRingMode, StrBullMode } from '../types/straeusschen'

// Dartboard-Reihenfolge (im Uhrzeigersinn, startend bei 12 Uhr = 20)
const BOARD_ORDER = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5]

type Props = {
  targetNumber: StrTargetNumber
  triplesHit: number // 0-3
  size?: number
  glowColor?: string // Farbe des Glow-Effekts (default: orange)
  ringMode?: StrRingMode // 'triple' (default) oder 'double'
  bullMode?: StrBullMode // nur relevant wenn targetNumber === 25
  zoomed?: boolean // Zoom auf den relevanten Bereich (17-20 + Bull)
  flashVisible?: boolean // Direkt vom Parent gesteuert: true = Flash sichtbar
}

export default function StraeusschenDartboard({ targetNumber, triplesHit, size = 300, glowColor = '#f97316', ringMode = 'triple', bullMode = 'red-only', zoomed, flashVisible }: Props) {
  const cx = size / 2
  const cy = size / 2
  const segmentAngle = 360 / 20

  // Radien
  const outerRadius = size * 0.46
  const doubleOuter = outerRadius
  const doubleInner = outerRadius * 0.92
  const tripleOuter = outerRadius * 0.62
  const tripleInner = outerRadius * 0.56
  const singleOuterRadius = doubleInner
  const singleInner2Radius = tripleInner
  const singleInner3Radius = outerRadius * 0.18
  const bullOuterRadius = outerRadius * 0.18
  const bullInnerRadius = outerRadius * 0.08

  const createArcPath = (innerR: number, outerR: number, startAngle: number, endAngle: number): string => {
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

  const getSegmentColors = (index: number) => {
    const isEven = index % 2 === 0
    return {
      single: isEven ? '#1a1a1a' : '#f5f5dc',
      double: isEven ? '#e31b23' : '#00a651',
      triple: isEven ? '#e31b23' : '#00a651',
    }
  }

  const isBullTarget = targetNumber === 25
  const rm = ringMode ?? 'triple'
  const bm = bullMode ?? 'red-only'

  const targetBoardIndex = isBullTarget ? -1 : BOARD_ORDER.indexOf(targetNumber)

  // Positionen für die "steckenden Darts" — abhängig von ringMode und Bull
  const getDartPositions = (boardIdx: number, count: number): { x: number; y: number }[] => {
    if (count === 0) return []

    // Bull: Darts kreisförmig um die Mitte im Bull-Bereich
    if (isBullTarget) {
      const bullR = (bullInnerRadius + bullOuterRadius) / 2
      const positions: { x: number; y: number }[] = []
      for (let i = 0; i < count; i++) {
        const dartAngle = (i * 360) / Math.max(count, 3) - 90
        const rad = dartAngle * (Math.PI / 180)
        positions.push({
          x: cx + bullR * Math.cos(rad),
          y: cy + bullR * Math.sin(rad),
        })
      }
      return positions
    }

    const offset = -segmentAngle / 2
    const centerAngle = boardIdx * segmentAngle + offset
    // Radius hängt vom Ring-Modus ab
    const targetR = rm === 'double'
      ? (doubleInner + doubleOuter) / 2
      : (tripleInner + tripleOuter) / 2
    const positions: { x: number; y: number }[] = []

    for (let i = 0; i < count; i++) {
      const dartAngle = centerAngle + (i - 1) * (segmentAngle * 0.28)
      const rad = (dartAngle - 90) * (Math.PI / 180)
      positions.push({
        x: cx + targetR * Math.cos(rad),
        y: cy + targetR * Math.sin(rad),
      })
    }
    return positions
  }

  const dartPositions = getDartPositions(targetBoardIndex, triplesHit)

  return (
    <svg width={size} height={size}
      viewBox={(() => {
        if (!zoomed) return `${-size * 0.06} ${-size * 0.06} ${size * 1.12} ${size * 1.12}`
        // Zoom auf das aktive Zielsegment — Bull = Mitte
        if (targetNumber === 25) {
          const zoomSize = size * 0.5
          return `${cx - zoomSize / 2} ${cy - zoomSize / 2} ${zoomSize} ${zoomSize}`
        }
        const targetIdx = BOARD_ORDER.indexOf(targetNumber as number)
        const angle = (targetIdx * segmentAngle - 90) * (Math.PI / 180)
        const focusR = outerRadius * 0.65
        const focusX = cx + focusR * Math.cos(angle)
        const focusY = cy + focusR * Math.sin(angle)
        const zoomSize = size * 0.55
        return `${focusX - zoomSize / 2} ${focusY - zoomSize / 2} ${zoomSize} ${zoomSize}`
      })()}
      style={{ overflow: 'visible', transition: 'viewBox 0.5s ease' }}>
      <defs>
        <filter id="str-triple-glow" x="-150%" y="-150%" width="400%" height="400%">
          <feGaussianBlur stdDeviation="10" result="blur" />
          <feFlood floodColor={glowColor} floodOpacity="0.9" />
          <feComposite in2="blur" operator="in" />
          <feMerge>
            <feMergeNode />
            <feMergeNode />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="str-dart-glow" x="-200%" y="-200%" width="500%" height="500%">
          <feGaussianBlur stdDeviation="4" result="blur" />
          <feFlood floodColor="#fbbf24" floodOpacity="0.9" />
          <feComposite in2="blur" operator="in" />
          <feMerge>
            <feMergeNode />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <style>{`
          @keyframes str-pulse {
            0%, 100% { opacity: 0.5; }
            50% { opacity: 1; }
          }
          .str-target-ring {
            animation: str-pulse 1.2s ease-in-out infinite;
          }
          @keyframes str-hit-flash {
            0% { opacity: 1; }
            12.5% { opacity: 0; }
            25% { opacity: 1; }
            37.5% { opacity: 0; }
            50% { opacity: 1; }
            62.5% { opacity: 0; }
            75% { opacity: 1; }
            87.5% { opacity: 0; }
            100% { opacity: 0; }
          }
        `}</style>
      </defs>

      {/* Hintergrund */}
      {!zoomed && <circle cx={cx} cy={cy} r={outerRadius + 4} fill="#111" />}
      {/* Kein grauer Hintergrund bei zoomed */}

      {/* Segmente */}
      {BOARD_ORDER.map((num, i) => {
        const offset = -segmentAngle / 2
        const startAngle = i * segmentAngle + offset
        const endAngle = (i + 1) * segmentAngle + offset
        const colors = getSegmentColors(i)
        const isTarget = !isBullTarget && num === targetNumber
        const dim = 0.35

        // Zoomed: nur Zielsegment anzeigen
        if (zoomed && !isTarget) return null

        // Bestimme welcher Ring im Zielsegment leuchtet
        const isTargetDouble = isTarget && rm === 'double'
        const isTargetTriple = isTarget && rm === 'triple'

        // Echte Segmentfarbe für das Ziel (rot oder grün)
        const realTargetColor = rm === 'double' ? colors.double : colors.triple

        // Glow-Radien abhängig vom Ring-Modus
        const glowInner = rm === 'double' ? doubleInner - 4 : tripleInner - 4
        const glowOuter = rm === 'double' ? doubleOuter + 4 : tripleOuter + 4

        return (
          <g key={num}>
            {/* Glow-Hintergrund für Ziel-Ring — in der echten Segmentfarbe */}
            {isTarget && (
              <path
                d={createArcPath(glowInner, glowOuter, startAngle - 1, endAngle + 1)}
                fill={realTargetColor}
                opacity={0.4}
                filter="url(#str-triple-glow)"
                className="str-target-ring"
              />
            )}

            {/* Double-Ring */}
            <path
              d={createArcPath(doubleInner, doubleOuter, startAngle, endAngle)}
              fill={isTargetDouble ? realTargetColor : colors.double}
              stroke="#222"
              strokeWidth={isTargetDouble ? 1.5 : 0.5}
              opacity={isTargetDouble ? 1 : (zoomed ? 0.8 : dim)}
              className={isTargetDouble ? 'str-target-ring' : undefined}
            />
            {/* Äußeres Single */}
            <path
              d={createArcPath(tripleOuter, singleOuterRadius, startAngle, endAngle)}
              fill={colors.single}
              stroke="#222"
              strokeWidth={0.5}
              opacity={zoomed ? 0.8 : dim}
            />
            {/* Triple-Ring */}
            <path
              d={createArcPath(tripleInner, tripleOuter, startAngle, endAngle)}
              fill={isTargetTriple ? realTargetColor : colors.triple}
              stroke="#222"
              strokeWidth={isTargetTriple ? 1.5 : 0.5}
              opacity={isTargetTriple ? 1 : (zoomed ? 0.8 : dim)}
              className={isTargetTriple ? 'str-target-ring' : undefined}
            />
            {/* Inneres Single */}
            <path
              d={createArcPath(singleInner3Radius, singleInner2Radius, startAngle, endAngle)}
              fill={colors.single}
              stroke="#222"
              strokeWidth={0.5}
              opacity={zoomed ? 0.8 : dim}
            />

            {/* Zahlen-Label */}
            {(() => {
              const labelAngle = i * segmentAngle
              const labelR = outerRadius + (isTarget ? 16 : 12)
              const rad = (labelAngle - 90) * (Math.PI / 180)
              return (
                <text
                  x={cx + labelR * Math.cos(rad)}
                  y={cy + labelR * Math.sin(rad)}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fill={isTarget ? glowColor : '#666'}
                  fontSize={isTarget ? size * 0.06 : size * 0.04}
                  fontWeight={isTarget ? 800 : 500}
                  opacity={isTarget ? 1 : dim}
                >
                  {num}
                </text>
              )
            })()}
          </g>
        )
      })}

      {/* Bull's Eye — bei zoomed nur anzeigen wenn Bull das Ziel ist */}
      {zoomed && !isBullTarget ? null : (<>
      {isBullTarget && (
        <circle
          cx={cx}
          cy={cy}
          r={bm === 'both' ? bullOuterRadius + 4 : bullInnerRadius + 4}
          fill={glowColor}
          opacity={0.4}
          filter="url(#str-triple-glow)"
          className="str-target-ring"
        />
      )}
      <circle
        cx={cx}
        cy={cy}
        r={bullOuterRadius}
        fill={isBullTarget && bm === 'both' ? glowColor : '#00a651'}
        stroke="#222"
        strokeWidth={isBullTarget && bm === 'both' ? 1.5 : 0.5}
        opacity={isBullTarget && bm === 'both' ? 1 : 0.35}
        className={isBullTarget && bm === 'both' ? 'str-target-ring' : undefined}
      />
      <circle
        cx={cx}
        cy={cy}
        r={bullInnerRadius}
        fill={isBullTarget ? glowColor : '#e31b23'}
        stroke="#222"
        strokeWidth={isBullTarget ? 1.5 : 0.5}
        opacity={isBullTarget ? 1 : 0.35}
        className={isBullTarget ? 'str-target-ring' : undefined}
      />
      </>)}

      {/* "Steckende Darts" im Ziel-Ring — nur wenn nicht zoomed */}
      {!zoomed && dartPositions.map((pos, i) => (
        <g key={i}>
          <circle cx={pos.x} cy={pos.y} r={8} fill="#fbbf24" opacity={0.3} filter="url(#str-dart-glow)" />
          <circle cx={pos.x} cy={pos.y} r={4} fill="#fbbf24" stroke="#fff" strokeWidth={1.5} />
          <line
            x1={pos.x} y1={pos.y - 4}
            x2={pos.x} y2={pos.y - 12}
            stroke="#d4d4d8" strokeWidth={1.5} strokeLinecap="round"
          />
        </g>
      ))}

      {/* Treffer-Flash: Gegenfarbe blinken (rot→grün, grün→rot) */}
      {flashVisible && !isBullTarget && (() => {
        const targetIdx = BOARD_ORDER.indexOf(targetNumber as number)
        const segColors = getSegmentColors(targetIdx)
        const ringColor = rm === 'double' ? segColors.double : segColors.triple
        const flashColor = ringColor === '#e31b23' ? '#22c55e' : '#ef4444'
        const offset = -segmentAngle / 2
        const sa = targetIdx * segmentAngle + offset - 1
        const ea = (targetIdx + 1) * segmentAngle + offset + 1
        const inner = rm === 'double' ? doubleInner - 3 : tripleInner - 3
        const outer = rm === 'double' ? doubleOuter + 5 : tripleOuter + 5
        return (
          <path d={createArcPath(inner, outer, sa, ea)} fill={flashColor} pointerEvents="none" />
        )
      })()}
      {flashVisible && isBullTarget && (
        <circle cx={cx} cy={cy} r={(bm === 'both' ? bullOuterRadius : bullInnerRadius) + 3}
          fill="#22c55e" pointerEvents="none" />
      )}
    </svg>
  )
}
