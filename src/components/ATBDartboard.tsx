// src/components/ATBDartboard.tsx
// Visuelle Dartscheibe für Around the Block mit Spielerpositionen

import React from 'react'

// Dartboard-Reihenfolge (im Uhrzeigersinn, startend bei 12 Uhr)
const BOARD_ORDER = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5]

// Hilfsfunktion: Farbe aufhellen/abdunkeln
function adjustBrightness(hex: string, factor: number): string {
  // Hex zu RGB
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)

  // Aufhellen (Richtung Weiß mischen)
  const newR = Math.min(255, Math.round(r + (255 - r) * (factor - 1)))
  const newG = Math.min(255, Math.round(g + (255 - g) * (factor - 1)))
  const newB = Math.min(255, Math.round(b + (255 - b) * (factor - 1)))

  return `#${newR.toString(16).padStart(2, '0')}${newG.toString(16).padStart(2, '0')}${newB.toString(16).padStart(2, '0')}`
}

// Hilfsfunktion: Farbe abdunkeln (für inaktive Spieler)
function darkenColor(hex: string, factor: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)

  const newR = Math.round(r * factor)
  const newG = Math.round(g * factor)
  const newB = Math.round(b * factor)

  return `#${newR.toString(16).padStart(2, '0')}${newG.toString(16).padStart(2, '0')}${newB.toString(16).padStart(2, '0')}`
}

// Spielerfarben (satte Farben)
const PLAYER_COLORS = [
  '#3b82f6', // Blau (500))
  '#22c55e', // Grün (500))
  '#f97316', // Orange (500))
  '#ef4444', // Rot (500))
  '#a855f7', // Violett (500))
  '#14b8a6', // Türkis (500))
  '#eab308', // Gelb (500))
  '#ec4899', // Pink (500))
]

type PlayerPosition = {
  playerId: string
  name: string
  target: number | 'BULL' | null // Aktuelles Ziel (null = fertig)
  color: string // Spielerfarbe (aus Profil oder Fallback)
  isActive: boolean
}

// Welche Multiplier für das aktuelle Ziel noch ausstehen (für Mixed-Modus)
type PendingMultipliers = {
  single?: boolean
  double?: boolean
  triple?: boolean
}

// NEU: Feld-Besitzer für Piratenmodus
type FieldOwner = {
  playerId: string
  color: string
} | 'tie'

type Props = {
  currentTarget: number | 'BULL' | null // Ziel des aktiven Spielers
  players: PlayerPosition[]
  size?: number
  activePlayerColor?: string // Farbe des aktiven Spielers für Zielfeld-Highlight
  pendingMultipliers?: PendingMultipliers // NEU: Welche Ringe leuchten sollen
  fieldOwners?: Record<string, FieldOwner> // NEU: Piratenmodus - wer hat welches Feld gewonnen
}

export default function ATBDartboard({ currentTarget, players, size = 300, activePlayerColor, pendingMultipliers, fieldOwners }: Props) {
  const cx = size / 2
  const cy = size / 2
  const segmentAngle = 360 / 20

  // Radien (relativ zur Größe)
  const outerRadius = size * 0.46
  const doubleOuter = outerRadius
  const doubleInner = outerRadius * 0.92
  const tripleOuter = outerRadius * 0.62
  const tripleInner = outerRadius * 0.56
  const singleOuterRadius = doubleInner
  const singleInnerRadius = tripleOuter
  const singleInner2Radius = tripleInner
  const singleInner3Radius = outerRadius * 0.18
  const bullOuterRadius = outerRadius * 0.18
  const bullInnerRadius = outerRadius * 0.08

  // Segment-Pfad erstellen (Kreisbogen)
  const createArcPath = (
    innerR: number,
    outerR: number,
    startAngle: number,
    endAngle: number
  ): string => {
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

  // Prüfen ob eine Zahl das aktuelle Ziel ist
  const isTarget = (num: number | 'BULL') => currentTarget === num

  // Spieler auf diesem Feld finden
  const getPlayersOnField = (field: number | 'BULL') => {
    return players.filter(p => p.target === field)
  }

  // Segment-Farbe bestimmen
  const getSegmentColors = (index: number) => {
    const isEven = index % 2 === 0
    return {
      single: isEven ? '#1a1a1a' : '#f5f5dc', // Schwarz / Beige
      double: isEven ? '#e31b23' : '#00a651', // Rot / Grün
      triple: isEven ? '#e31b23' : '#00a651', // Rot / Grün
    }
  }

  // Position für Spieler-Marker berechnen
  const getMarkerPosition = (field: number | 'BULL', playerIndex: number, totalPlayers: number) => {
    if (field === 'BULL') {
      // Um den Bull herum anordnen
      const angle = (playerIndex / totalPlayers) * 360
      const r = bullOuterRadius * 1.5
      const rad = (angle - 90) * (Math.PI / 180)
      return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
    }

    const boardIndex = BOARD_ORDER.indexOf(field)
    if (boardIndex === -1) return { x: cx, y: cy }

    // Zentriert im Segment (gleicher Offset wie Segmente)
    const centerAngle = boardIndex * segmentAngle
    const r = (singleOuterRadius + singleInnerRadius) / 2

    // Offset für mehrere Spieler
    const playerOffset = (playerIndex - (totalPlayers - 1) / 2) * 12
    const rad = (centerAngle - 90) * (Math.PI / 180)
    const perpRad = rad + Math.PI / 2

    return {
      x: cx + r * Math.cos(rad) + playerOffset * Math.cos(perpRad),
      y: cy + r * Math.sin(rad) + playerOffset * Math.sin(perpRad),
    }
  }

  // Spieler-Farbe ermitteln (hell für aktiv, dunkel für inaktiv)
  const getPlayerDisplayColor = (player: PlayerPosition, bright = false) => {
    const baseColor = player.color
    if (player.isActive) {
      return bright ? adjustBrightness(baseColor, 1.3) : baseColor
    } else {
      // Inaktive Spieler: 50% dunkler
      return darkenColor(baseColor, 0.5)
    }
  }

  // Opacity für Spieler-Segmente
  const getPlayerOpacity = (player: PlayerPosition) => {
    return player.isActive ? 0.6 : 0.35
  }

  // Aktiver Spieler für Glow-Effekt
  const activePlayer = players.find(p => p.isActive)
  const activePlayerDisplayColor = activePlayer ? activePlayer.color : '#f97316'

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <defs>
        {/* Pulsierender Glow-Filter für aktives Ziel */}
        <filter id="target-glow" x="-150%" y="-150%" width="400%" height="400%">
          <feGaussianBlur stdDeviation="8" result="blur" />
          <feFlood floodColor={activePlayerDisplayColor} floodOpacity="1" />
          <feComposite in2="blur" operator="in" />
          <feMerge>
            <feMergeNode />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        {/* Starker Glow für Segment-Overlay */}
        <filter id="segment-glow" x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="12" result="blur" />
          <feFlood floodColor={activePlayerDisplayColor} floodOpacity="0.9" />
          <feComposite in2="blur" operator="in" />
          <feMerge>
            <feMergeNode />
            <feMergeNode />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        {/* Spieler-Glow-Filter */}
        {PLAYER_COLORS.map((color, i) => (
          <filter key={i} id={`player-glow-${i}`} x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feFlood floodColor={color} floodOpacity="0.9" />
            <feComposite in2="blur" operator="in" />
            <feMerge>
              <feMergeNode />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        ))}

        {/* CSS Animation für Pulsieren */}
        <style>{`
          @keyframes pulse-glow {
            0%, 100% { opacity: 0.4; filter: drop-shadow(0 0 2px rgba(255,255,255,0)); }
            50% { opacity: 1; filter: drop-shadow(0 0 8px rgba(255,255,255,0.6)); }
          }
          .target-segment {
            animation: pulse-glow 0.8s ease-in-out infinite;
          }
        `}</style>
      </defs>

      {/* Hintergrund */}
      <circle cx={cx} cy={cy} r={outerRadius + 4} fill="#111" />

      {/* Segmente */}
      {BOARD_ORDER.map((num, i) => {
        // Offset um halbes Segment, damit 20 zentriert oben ist
        const offset = -segmentAngle / 2
        const startAngle = i * segmentAngle + offset
        const endAngle = (i + 1) * segmentAngle + offset
        const colors = getSegmentColors(i)
        const isTargetField = isTarget(num)
        const playersHere = getPlayersOnField(num)
        const hasPlayers = playersHere.length > 0

        // Bei Mixed-Modus: Welche Ringe sollen leuchten?
        const showRingHighlight = isTargetField && activePlayer && pendingMultipliers
        const showFullHighlight = isTargetField && activePlayer && !pendingMultipliers

        return (
          <g key={num}>
            {/* Großer Glow-Hintergrund für aktives Ziel (nur wenn KEIN pendingMultipliers gesetzt) */}
            {showFullHighlight && (
              <path
                d={createArcPath(0, doubleOuter + 8, startAngle - 1, endAngle + 1)}
                fill={activePlayerDisplayColor}
                opacity={0.3}
                filter="url(#segment-glow)"
                className="target-segment"
              />
            )}

            {/* Double-Ring */}
            <path
              d={createArcPath(doubleInner, doubleOuter, startAngle, endAngle)}
              fill={colors.double}
              stroke="#222"
              strokeWidth={0.5}
            />

            {/* Äußeres Single-Feld */}
            <path
              d={createArcPath(tripleOuter, singleOuterRadius, startAngle, endAngle)}
              fill={colors.single}
              stroke="#222"
              strokeWidth={0.5}
            />

            {/* Triple-Ring */}
            <path
              d={createArcPath(tripleInner, tripleOuter, startAngle, endAngle)}
              fill={colors.triple}
              stroke="#222"
              strokeWidth={0.5}
            />

            {/* Inneres Single-Feld */}
            <path
              d={createArcPath(singleInner3Radius, singleInner2Radius, startAngle, endAngle)}
              fill={colors.single}
              stroke="#222"
              strokeWidth={0.5}
            />

            {/* NEU: Piratenmodus - Feld-Besitzer Overlay */}
            {(() => {
              const fieldKey = String(num)
              const owner = fieldOwners?.[fieldKey]
              if (!owner) return null

              if (owner === 'tie') {
                // Gleichstand: Graues Overlay
                return (
                  <path
                    d={createArcPath(singleInner3Radius, doubleOuter, startAngle, endAngle)}
                    fill="#888888"
                    opacity={0.75}
                  />
                )
              }

              // Gewinner: Spielerfarbe mit Opacity
              return (
                <path
                  d={createArcPath(singleInner3Radius, doubleOuter, startAngle, endAngle)}
                  fill={owner.color}
                  opacity={0.75}
                />
              )
            })()}

            {/* Spieler-Overlays: Segment aufteilen bei mehreren Spielern */}
            {/* Bei Ring-Highlight: Keine Overlays für aktiven Spieler (sonst überdeckt es das Highlight) */}
            {hasPlayers && !showRingHighlight && playersHere.map((player, pIdx) => {
              const numPlayers = playersHere.length
              // Segment aufteilen: jeder Spieler bekommt einen Teil
              const sliceAngle = segmentAngle / numPlayers
              const playerStartAngle = startAngle + pIdx * sliceAngle
              const playerEndAngle = startAngle + (pIdx + 1) * sliceAngle
              const playerColor = getPlayerDisplayColor(player)
              const playerOpacity = getPlayerOpacity(player)

              return (
                <g key={player.playerId}>
                  {/* Spieler-Highlight über dem gesamten Segment-Slice */}
                  <path
                    d={createArcPath(singleInner3Radius, doubleOuter, playerStartAngle, playerEndAngle)}
                    fill={playerColor}
                    opacity={playerOpacity}
                    stroke={player.isActive ? playerColor : 'none'}
                    strokeWidth={player.isActive ? 2 : 0}
                  />
                </g>
              )
            })}

            {/* Ring-Highlights (NACH den Spieler-Overlays, damit sie oben liegen) */}
            {/* Double-Ring Highlight */}
            {showRingHighlight && pendingMultipliers.double && (
              <path
                d={createArcPath(doubleInner - 2, doubleOuter + 4, startAngle - 0.5, endAngle + 0.5)}
                fill={activePlayerDisplayColor}
                opacity={0.6}
                filter="url(#segment-glow)"
                className="target-segment"
              />
            )}
            {/* Triple-Ring Highlight */}
            {showRingHighlight && pendingMultipliers.triple && (
              <path
                d={createArcPath(tripleInner - 2, tripleOuter + 4, startAngle - 0.5, endAngle + 0.5)}
                fill={activePlayerDisplayColor}
                opacity={0.6}
                filter="url(#segment-glow)"
                className="target-segment"
              />
            )}
            {/* Single-Feld Highlights (beide Bereiche) */}
            {showRingHighlight && pendingMultipliers.single && (
              <>
                <path
                  d={createArcPath(tripleOuter - 2, singleOuterRadius + 2, startAngle - 0.5, endAngle + 0.5)}
                  fill={activePlayerDisplayColor}
                  opacity={0.75}
                  filter="url(#segment-glow)"
                  className="target-segment"
                />
                <path
                  d={createArcPath(singleInner3Radius - 2, singleInner2Radius + 2, startAngle - 0.5, endAngle + 0.5)}
                  fill={activePlayerDisplayColor}
                  opacity={0.75}
                  filter="url(#segment-glow)"
                  className="target-segment"
                />
              </>
            )}

            {/* Zahlen-Label */}
            {(() => {
              const labelAngle = i * segmentAngle // Zentriert im Segment
              const labelR = outerRadius + (isTargetField ? 16 : 12)
              const rad = (labelAngle - 90) * (Math.PI / 180)
              const lx = cx + labelR * Math.cos(rad)
              const ly = cy + labelR * Math.sin(rad)

              // Label-Farbe: Aktiver Spieler auf diesem Feld oder erster Spieler
              const activeOnField = playersHere.find(p => p.isActive)
              let labelColor = '#888'
              let labelWeight = 500
              if (isTargetField && activeOnField) {
                labelColor = activeOnField.color
                labelWeight = 800
              } else if (hasPlayers) {
                // Mischfarbe oder Farbe des ersten Spielers
                labelColor = activeOnField
                  ? activeOnField.color
                  : darkenColor(playersHere[0].color, 0.7)
                labelWeight = 700
              }

              return (
                <text
                  x={lx}
                  y={ly}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fill={labelColor}
                  fontSize={isTargetField ? size * 0.055 : size * 0.04}
                  fontWeight={labelWeight}
                  filter={isTargetField ? 'url(#target-glow)' : undefined}
                >
                  {num}
                </text>
              )
            })()}
          </g>
        )
      })}

      {/* Bull's Eye */}
      {(() => {
        const isBullTarget = isTarget('BULL')
        const bullPlayers = getPlayersOnField('BULL')
        const hasBullPlayers = bullPlayers.length > 0
        const activeBullPlayer = bullPlayers.find(p => p.isActive)

        return (
          <>
            {/* Großer pulsierender Glow für Bull als Ziel */}
            {isBullTarget && activeBullPlayer && (
              <circle
                cx={cx}
                cy={cy}
                r={bullOuterRadius + 15}
                fill={activeBullPlayer.color}
                opacity={0.4}
                filter="url(#segment-glow)"
                className="target-segment"
              />
            )}

            {/* Outer Bull (grün) */}
            <circle
              cx={cx}
              cy={cy}
              r={bullOuterRadius}
              fill="#00a651"
              stroke="#222"
              strokeWidth={0.5}
            />

            {/* Inner Bull (rot) */}
            <circle
              cx={cx}
              cy={cy}
              r={bullInnerRadius}
              fill="#e31b23"
              stroke="#222"
              strokeWidth={0.5}
            />

            {/* NEU: Piratenmodus - Bull-Besitzer Overlay */}
            {(() => {
              const owner = fieldOwners?.['BULL']
              if (!owner) return null

              if (owner === 'tie') {
                return (
                  <circle
                    cx={cx}
                    cy={cy}
                    r={bullOuterRadius}
                    fill="#888888"
                    opacity={0.75}
                  />
                )
              }

              return (
                <circle
                  cx={cx}
                  cy={cy}
                  r={bullOuterRadius}
                  fill={owner.color}
                  opacity={0.75}
                />
              )
            })()}

            {/* Spieler-Overlays auf Bull: Tortendiagramm-Segmente */}
            {hasBullPlayers && bullPlayers.map((player, pIdx) => {
              const numPlayers = bullPlayers.length
              const sliceAngle = 360 / numPlayers
              const playerStartAngle = pIdx * sliceAngle - 90 // -90 für 12-Uhr-Start
              const playerEndAngle = (pIdx + 1) * sliceAngle - 90
              const playerColor = getPlayerDisplayColor(player)
              const playerOpacity = getPlayerOpacity(player)

              // Kreissegment-Pfad für Bull
              const toRad = (deg: number) => deg * (Math.PI / 180)
              const r = bullOuterRadius
              const x1 = cx + r * Math.cos(toRad(playerStartAngle))
              const y1 = cy + r * Math.sin(toRad(playerStartAngle))
              const x2 = cx + r * Math.cos(toRad(playerEndAngle))
              const y2 = cy + r * Math.sin(toRad(playerEndAngle))
              const largeArc = sliceAngle > 180 ? 1 : 0

              const piePath = numPlayers === 1
                ? '' // Bei nur einem Spieler: voller Kreis, kein Pfad nötig
                : `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`

              return numPlayers === 1 ? (
                <circle
                  key={player.playerId}
                  cx={cx}
                  cy={cy}
                  r={bullOuterRadius}
                  fill={playerColor}
                  opacity={playerOpacity}
                  stroke={player.isActive ? playerColor : 'none'}
                  strokeWidth={player.isActive ? 2 : 0}
                />
              ) : (
                <path
                  key={player.playerId}
                  d={piePath}
                  fill={playerColor}
                  opacity={playerOpacity}
                  stroke={player.isActive ? playerColor : 'none'}
                  strokeWidth={player.isActive ? 2 : 0}
                />
              )
            })}
          </>
        )
      })()}

      {/* Spieler-Marker */}
      {players.map((player, playerIdx) => {
        if (!player.target) return null // Spieler hat fertig

        const playersOnSameField = players.filter(p => p.target === player.target)
        const indexOnField = playersOnSameField.findIndex(p => p.playerId === player.playerId)
        const pos = getMarkerPosition(player.target, indexOnField, playersOnSameField.length)
        const playerColor = player.color

        return (
          <g key={player.playerId}>
            {/* Glow-Kreis */}
            <circle
              cx={pos.x}
              cy={pos.y}
              r={player.isActive ? 10 : 7}
              fill={playerColor}
              opacity={0.3}
              filter="url(#segment-glow)"
            />

            {/* Spieler-Punkt */}
            <circle
              cx={pos.x}
              cy={pos.y}
              r={player.isActive ? 6 : 4}
              fill={playerColor}
              stroke={player.isActive ? '#fff' : '#000'}
              strokeWidth={player.isActive ? 2 : 1}
            />
          </g>
        )
      })}
    </svg>
  )
}
