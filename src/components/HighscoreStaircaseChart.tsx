// src/components/HighscoreStaircaseChart.tsx
// Vertikale "Treppen"-Visualisierung für Highscore-Leg-Verlauf (aufwärts zum Target)
// Dunkles Theme mit kumulativen Fortschrittsbalken

import React from 'react'
import type { HighscoreDart } from '../types/highscore'

// Dart-Label Funktion
function dartLabel(dart: HighscoreDart): string {
  if (dart.target === 'MISS') return '—'
  if (dart.target === 'BULL') return dart.mult === 2 ? 'DB' : 'B'
  const prefix = dart.mult === 3 ? 'T' : dart.mult === 2 ? 'D' : 'S'
  return `${prefix}${dart.target}`
}

// Farbe abdunkeln
function darkenColor(hex: string, factor: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  const newR = Math.round(r * factor)
  const newG = Math.round(g * factor)
  const newB = Math.round(b * factor)
  return `#${newR.toString(16).padStart(2, '0')}${newG.toString(16).padStart(2, '0')}${newB.toString(16).padStart(2, '0')}`
}

export type HighscoreVisit = {
  turnScore: number
  runningScore: number     // Score NACH diesem Turn
  scoreBefore: number      // Score VOR diesem Turn
  darts: HighscoreDart[]
  isWinningTurn?: boolean
  playerId?: string        // Optional: Spieler-ID für Multi-Player-Ansicht
  playerName?: string      // Optional: Spieler-Name
  playerColor?: string     // Optional: Spieler-Farbe
}

type Props = {
  targetScore: number           // 300-999 (Ziel)
  visits: HighscoreVisit[]      // Alle Turns des Legs
  playerName: string
  playerColor?: string
  totalDarts: number            // Gesamte Dart-Anzahl
  matchDate?: string            // Optional: Datum
  compact?: boolean             // Kompaktmodus für Listen
  showHeader?: boolean          // Header mit Titel anzeigen
}

export default function HighscoreStaircaseChart({
  targetScore,
  visits,
  playerName,
  playerColor = '#3b82f6',
  totalDarts,
  matchDate,
  compact = false,
  showHeader = true,
}: Props) {
  // Berechne maximale Breite für Balken (proportional zum Zielwert)
  const maxBarWidth = compact ? 120 : 200

  // Spezielle Achievements erkennen
  const is180 = (v: HighscoreVisit) => v.turnScore === 180
  const isFinish = (v: HighscoreVisit) => v.runningScore >= targetScore
  const isHighScore = (v: HighscoreVisit) => v.turnScore >= 140 && v.turnScore < 180

  // Durchschnitt berechnen
  const avgPerVisit = visits.length > 0
    ? visits.reduce((sum, v) => sum + v.turnScore, 0) / visits.length
    : 0

  // Darts pro Punkt berechnen (Effizienz)
  const efficiency = visits.length > 0
    ? (visits[visits.length - 1]?.runningScore ?? 0) / totalDarts
    : 0

  return (
    <div
      style={{
        background: compact ? 'transparent' : '#111',
        borderRadius: compact ? 0 : 12,
        padding: compact ? '8px 0' : 16,
        border: compact ? 'none' : '1px solid #333',
      }}
    >
      {/* Header */}
      {showHeader && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 12,
            paddingBottom: 8,
            borderBottom: '1px solid #333',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* Spieler-Dot + Name */}
            <div
              style={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                background: playerColor,
                boxShadow: `0 0 6px ${playerColor}`,
              }}
            />
            <span style={{ fontWeight: 700, color: '#e5e7eb' }}>{playerName}</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {/* Dart-Count Badge */}
            <div
              style={{
                background: '#1e293b',
                border: '1px solid #334155',
                borderRadius: 999,
                padding: '4px 10px',
                fontSize: 13,
                fontWeight: 800,
                color: '#94a3b8',
              }}
            >
              {totalDarts} Darts
            </div>

            {/* Target Badge */}
            <div
              style={{
                background: '#14532d',
                border: '1px solid #22c55e',
                borderRadius: 999,
                padding: '4px 10px',
                fontSize: 13,
                fontWeight: 800,
                color: '#4ade80',
              }}
            >
              Ziel: {targetScore}
            </div>

            {/* Datum */}
            {matchDate && (
              <span style={{ fontSize: 12, color: '#64748b' }}>
                {matchDate}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Staircase Container */}
      <div style={{ position: 'relative', paddingLeft: 50 }}>
        {/* Y-Achse (Score-Skala) - umgedreht für Highscore (0 unten, Target oben) */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: 45,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            paddingRight: 8,
            fontSize: 11,
            fontWeight: 600,
            color: '#64748b',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          <span style={{ color: '#22c55e', fontWeight: 700 }}>{targetScore}</span>
          {visits.length > 2 && <span>{Math.round(targetScore / 2)}</span>}
          <span>0</span>
        </div>

        {/* Stufen */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: compact ? 4 : 6 }}>
          {visits.map((visit, idx) => {
            // Kumulativer Fortschritt zum Ziel
            const totalProgress = Math.min((visit.runningScore / targetScore) * maxBarWidth, maxBarWidth)
            const previousProgress = Math.min((visit.scoreBefore / targetScore) * maxBarWidth, maxBarWidth)
            const currentTurnWidth = totalProgress - previousProgress

            // Spielerfarbe für diesen Turn (falls Multi-Player-Ansicht)
            const visitPlayerColor = visit.playerColor || playerColor

            // Farbe basierend auf Leistung für den aktuellen Turn-Teil
            const turnColor = is180(visit)
              ? '#fbbf24'  // Gold für 180
              : isFinish(visit)
                ? '#4ade80'  // Grün für Finish
                : isHighScore(visit)
                  ? '#f97316'  // Orange für High Score
                  : visitPlayerColor  // Spielerfarbe für normal

            // Hintergrundfarbe der Zeile
            const bgColor = is180(visit)
              ? '#422006'
              : isFinish(visit)
                ? '#14532d'
                : isHighScore(visit)
                  ? '#431407'
                  : '#1a1a1a'

            return (
              <div
                key={idx}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: compact ? '4px 8px' : '6px 10px',
                  background: bgColor,
                  borderRadius: 8,
                  border: `1px solid ${isFinish(visit) ? '#22c55e' : '#333'}`,
                }}
              >
                {/* Turn-Nummer */}
                <div
                  style={{
                    width: 20,
                    fontSize: 11,
                    fontWeight: 600,
                    color: '#64748b',
                    textAlign: 'center',
                  }}
                >
                  {idx + 1}
                </div>

                {/* Spielername (bei Multi-Player-Ansicht) */}
                {visit.playerName && (
                  <div
                    style={{
                      width: 60,
                      fontSize: 11,
                      fontWeight: 700,
                      color: visitPlayerColor,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {visit.playerName}
                  </div>
                )}

                {/* Kumulativer Score-Balken */}
                <div
                  style={{
                    position: 'relative',
                    height: compact ? 18 : 22,
                    width: maxBarWidth,
                    background: '#333',
                    borderRadius: 4,
                    overflow: 'hidden',
                    display: 'flex',
                  }}
                >
                  {/* Bisheriger Score (dunkler) */}
                  {previousProgress > 0 && (
                    <div
                      style={{
                        height: '100%',
                        width: previousProgress,
                        background: darkenColor(visitPlayerColor, 0.4),
                        /* no transition — prevents collapse animation on re-render */
                      }}
                    />
                  )}
                  {/* Dieser Turn (heller, mit Glow) */}
                  <div
                    style={{
                      height: '100%',
                      width: Math.max(currentTurnWidth, 4),
                      background: turnColor,
                      boxShadow: `0 0 8px ${turnColor}`,
                      transition: 'width 0.3s ease',
                    }}
                  />
                  {/* Score-Label im Balken */}
                  <div
                    style={{
                      position: 'absolute',
                      left: 6,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      fontSize: compact ? 11 : 12,
                      fontWeight: 800,
                      color: '#fff',
                      textShadow: '0 1px 3px rgba(0,0,0,0.7)',
                    }}
                  >
                    +{visit.turnScore}
                  </div>
                </div>

                {/* Dart-Labels */}
                <div
                  style={{
                    display: 'flex',
                    gap: 4,
                    fontSize: compact ? 10 : 11,
                    fontWeight: 600,
                    color: '#94a3b8',
                    minWidth: compact ? 80 : 100,
                  }}
                >
                  {visit.darts.map((d, i) => (
                    <span
                      key={i}
                      style={{
                        padding: '2px 4px',
                        background: d.value >= 50 ? 'rgba(249,115,22,0.2)' : 'transparent',
                        borderRadius: 3,
                        color: d.value >= 50 ? '#fb923c' : '#94a3b8',
                      }}
                    >
                      {dartLabel(d)}
                    </span>
                  ))}
                </div>

                {/* Progress-Anzeige (Score / Target) */}
                <div
                  style={{
                    marginLeft: 'auto',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  {/* Mini Progress Bar */}
                  <div
                    style={{
                      width: 40,
                      height: 4,
                      background: '#333',
                      borderRadius: 2,
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        width: `${Math.min(100, (visit.runningScore / targetScore) * 100)}%`,
                        height: '100%',
                        background: isFinish(visit) ? '#22c55e' : visitPlayerColor,
                        transition: 'width 0.3s',
                      }}
                    />
                  </div>

                  {/* Score */}
                  <span
                    style={{
                      fontSize: compact ? 11 : 12,
                      fontWeight: 700,
                      color: isFinish(visit) ? '#4ade80' : '#e5e7eb',
                      fontVariantNumeric: 'tabular-nums',
                      minWidth: 35,
                      textAlign: 'right',
                    }}
                  >
                    {isFinish(visit) ? '✓' : visit.runningScore}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Footer mit Stats */}
      {!compact && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            marginTop: 12,
            paddingTop: 8,
            borderTop: '1px solid #333',
            fontSize: 12,
            color: '#94a3b8',
          }}
        >
          <div style={{ display: 'flex', gap: 16 }}>
            <span>
              <strong style={{ color: '#e5e7eb' }}>{avgPerVisit.toFixed(1)}</strong> Avg
            </span>
            <span>
              <strong style={{ color: '#e5e7eb' }}>{visits.length}</strong> Turns
            </span>
            <span>
              <strong style={{ color: '#e5e7eb' }}>{efficiency.toFixed(1)}</strong> Pts/Dart
            </span>
          </div>

          {visits.length > 0 && visits[visits.length - 1]?.runningScore >= targetScore && (
            <div style={{ color: '#4ade80', fontWeight: 600 }}>
              ✓ Ziel erreicht mit {totalDarts} Darts
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// Kompakte Mini-Version für Listen (nur Balken)
export function HighscoreStaircaseMini({
  targetScore,
  visits,
  playerColor = '#3b82f6',
  width = 100,
  height = 24,
}: {
  targetScore: number
  visits: HighscoreVisit[]
  playerColor?: string
  width?: number
  height?: number
}) {
  // Mini-Sparkline Darstellung - Balken zeigen Score-Zuwachs
  const stepWidth = width / Math.max(visits.length, 1)

  return (
    <svg width={width} height={height} style={{ display: 'block' }}>
      {/* Hintergrund */}
      <rect x={0} y={0} width={width} height={height} fill="#1a1a1a" rx={4} />

      {/* Stufen als aufsteigende Blöcke */}
      {visits.map((v, i) => {
        // Höhe proportional zum Turn-Score (max 180)
        const blockHeight = Math.min((v.turnScore / 180) * (height - 4), height - 4)
        const y = height - 2 - blockHeight
        const isLast = v.runningScore >= targetScore

        return (
          <rect
            key={i}
            x={i * stepWidth + 1}
            y={y}
            width={stepWidth - 2}
            height={blockHeight}
            fill={isLast ? '#4ade80' : v.turnScore >= 140 ? '#f97316' : playerColor}
            rx={2}
          />
        )
      })}

      {/* Ziellinie oben */}
      <line x1={0} y1={2} x2={width} y2={2} stroke="#22c55e" strokeWidth={2} />
    </svg>
  )
}
