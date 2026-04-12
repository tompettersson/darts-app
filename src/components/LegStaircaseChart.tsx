// src/components/LegStaircaseChart.tsx
// Vertikale "Treppen"-Visualisierung eines Leg-Verlaufs für Highscores

import React from 'react'

// Dart-Label Funktion (wie in anderen Komponenten)
function dartLabel(bed: number | string, mult: number): string {
  if (bed === 'MISS' || bed === 0) return '—'
  if (bed === 'DBULL') return 'DB'
  if (bed === 'BULL') return 'B'
  const prefix = mult === 3 ? 'T' : mult === 2 ? 'D' : 'S'
  return `${prefix}${bed}`
}

export type LegVisit = {
  visitScore: number
  remainingBefore: number
  remainingAfter: number
  darts: { bed: number | string; mult: number; score: number }[]
  bust?: boolean
}

type Props = {
  startScore: number              // 301, 501, 701
  visits: LegVisit[]              // Alle Visits des Legs
  playerName: string
  playerColor?: string
  totalDarts: number              // Gesamte Dart-Anzahl
  checkoutHeight?: number         // Checkout-Höhe (z.B. 141)
  finishingDart?: string          // z.B. "D12"
  matchDate?: string              // Optional: Datum
  compact?: boolean               // Kompaktmodus für Listen
  showHeader?: boolean            // Header mit Titel anzeigen
}

export default function LegStaircaseChart({
  startScore,
  visits,
  playerName,
  playerColor = '#f97316',
  totalDarts,
  checkoutHeight,
  finishingDart,
  matchDate,
  compact = false,
  showHeader = true,
}: Props) {
  // Berechne maximale Breite für Balken (proportional zum Startwert)
  const isMobileChart = typeof window !== 'undefined' && window.innerWidth < 500
  const maxBarWidth = compact ? 120 : isMobileChart ? 80 : 180

  // Spezielle Achievements erkennen
  const is180 = (v: LegVisit) => v.visitScore === 180
  const isCheckout = (v: LegVisit) => v.remainingAfter === 0 && !v.bust
  const isHighScore = (v: LegVisit) => v.visitScore >= 140 && v.visitScore < 180

  // Durchschnitt berechnen
  const avgPerVisit = visits.length > 0
    ? visits.reduce((sum, v) => sum + (v.bust ? 0 : v.visitScore), 0) / visits.length
    : 0

  // Ist es ein perfektes Leg? (9-Darter bei 501)
  const isPerfectLeg = startScore === 501 && totalDarts === 9

  return (
    <div
      style={{
        background: compact ? 'transparent' : '#fafafa',
        borderRadius: compact ? 0 : 12,
        padding: compact ? '8px 0' : 16,
        border: compact ? 'none' : '1px solid #e5e7eb',
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
            borderBottom: '1px solid #e5e7eb',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* Medaille für perfektes Leg */}
            {isPerfectLeg && (
              <span style={{ fontSize: 20 }}>🏆</span>
            )}
            {/* Spieler-Dot + Name */}
            <div
              style={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                background: playerColor,
                boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.15)',
              }}
            />
            <span style={{ fontWeight: 700, color: '#0f172a' }}>{playerName}</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {/* Dart-Count Badge */}
            <div
              style={{
                background: isPerfectLeg ? '#fef3c7' : '#f1f5f9',
                border: isPerfectLeg ? '1px solid #f59e0b' : '1px solid #e2e8f0',
                borderRadius: 999,
                padding: '4px 10px',
                fontSize: 13,
                fontWeight: 800,
                color: isPerfectLeg ? '#b45309' : '#475569',
              }}
            >
              {totalDarts} Darts
            </div>

            {/* Datum */}
            {matchDate && (
              <span style={{ fontSize: 12, color: '#94a3b8' }}>
                {matchDate}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Staircase Container */}
      <div style={{ position: 'relative', paddingLeft: isMobileChart ? 35 : 50 }}>
        {/* Y-Achse (Score-Skala) */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: isMobileChart ? 30 : 45,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            paddingRight: 8,
            fontSize: 11,
            fontWeight: 600,
            color: '#94a3b8',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          <span>{startScore}</span>
          {visits.length > 2 && <span>{Math.round(startScore / 2)}</span>}
          <span style={{ color: '#22c55e', fontWeight: 700 }}>0</span>
        </div>

        {/* Stufen */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: compact ? 4 : 6 }}>
          {visits.map((visit, idx) => {
            // Balken-Breite proportional zum geworfenen Score
            const barWidth = (visit.visitScore / startScore) * maxBarWidth
            // Farbe basierend auf Leistung
            const barColor = visit.bust
              ? '#fca5a5'  // Rot für Bust
              : is180(visit)
                ? '#fbbf24'  // Gold für 180
                : isCheckout(visit)
                  ? '#4ade80'  // Grün für Checkout
                  : isHighScore(visit)
                    ? '#f97316'  // Orange für High Score
                    : '#94a3b8'  // Grau für normal

            const bgColor = visit.bust
              ? '#fef2f2'
              : is180(visit)
                ? '#fffbeb'
                : isCheckout(visit)
                  ? '#f0fdf4'
                  : isHighScore(visit)
                    ? '#fff7ed'
                    : '#f8fafc'

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
                  border: `1px solid ${visit.bust ? '#fecaca' : isCheckout(visit) ? '#bbf7d0' : '#e2e8f0'}`,
                }}
              >
                {/* Visit-Nummer */}
                <div
                  style={{
                    width: 20,
                    fontSize: 11,
                    fontWeight: 600,
                    color: '#94a3b8',
                    textAlign: 'center',
                  }}
                >
                  {idx + 1}
                </div>

                {/* Score-Balken */}
                <div
                  style={{
                    position: 'relative',
                    height: compact ? 16 : 20,
                    width: maxBarWidth,
                    background: '#e2e8f0',
                    borderRadius: 4,
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      position: 'absolute',
                      left: 0,
                      top: 0,
                      bottom: 0,
                      width: Math.max(barWidth, 4),
                      background: barColor,
                      borderRadius: 4,
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
                      color: barWidth > 30 ? '#fff' : '#475569',
                      textShadow: barWidth > 30 ? '0 1px 2px rgba(0,0,0,0.3)' : 'none',
                    }}
                  >
                    {visit.bust ? 'BUST' : visit.visitScore}
                  </div>
                </div>

                {/* Dart-Labels */}
                <div
                  style={{
                    display: 'flex',
                    gap: isMobileChart ? 2 : 4,
                    fontSize: compact ? 10 : isMobileChart ? 10 : 11,
                    fontWeight: 600,
                    color: '#64748b',
                    minWidth: 0,
                  }}
                >
                  {visit.darts.map((d, i) => (
                    <span
                      key={i}
                      style={{
                        padding: '2px 4px',
                        background: d.score >= 50 ? 'rgba(249,115,22,0.1)' : 'transparent',
                        borderRadius: 3,
                        color: d.score >= 50 ? '#ea580c' : '#64748b',
                      }}
                    >
                      {dartLabel(d.bed, d.mult)}
                    </span>
                  ))}
                </div>

                {/* Rest nach diesem Visit */}
                <div
                  style={{
                    marginLeft: 'auto',
                    fontSize: compact ? 11 : 12,
                    fontWeight: 700,
                    color: visit.remainingAfter === 0 ? '#16a34a' : '#475569',
                    fontVariantNumeric: 'tabular-nums',
                    minWidth: 35,
                    textAlign: 'right',
                  }}
                >
                  {visit.remainingAfter === 0 ? '✓' : visit.remainingAfter}
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
            borderTop: '1px solid #e5e7eb',
            fontSize: 12,
            color: '#64748b',
          }}
        >
          <div style={{ display: 'flex', gap: 16 }}>
            <span>
              <strong style={{ color: '#0f172a' }}>{avgPerVisit.toFixed(1)}</strong> Avg
            </span>
            <span>
              <strong style={{ color: '#0f172a' }}>{visits.length}</strong> Visits
            </span>
          </div>

          {checkoutHeight && finishingDart && (
            <div style={{ color: '#16a34a', fontWeight: 600 }}>
              Checkout: {checkoutHeight} ({finishingDart})
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// Kompakte Inline-Version für Listen (nur Balken, keine Labels)
export function LegStaircaseMini({
  startScore,
  visits,
  playerColor = '#f97316',
  width = 100,
  height = 24,
}: {
  startScore: number
  visits: LegVisit[]
  playerColor?: string
  width?: number
  height?: number
}) {
  // Mini-Sparkline Darstellung
  const stepWidth = width / Math.max(visits.length, 1)

  return (
    <svg width={width} height={height} style={{ display: 'block' }}>
      {/* Hintergrund */}
      <rect x={0} y={0} width={width} height={height} fill="#f1f5f9" rx={4} />

      {/* Stufen als absteigende Blöcke */}
      {visits.map((v, i) => {
        const blockHeight = (v.visitScore / startScore) * (height - 4)
        const y = height - 2 - blockHeight
        const isLast = v.remainingAfter === 0

        return (
          <rect
            key={i}
            x={i * stepWidth + 1}
            y={y}
            width={stepWidth - 2}
            height={blockHeight}
            fill={v.bust ? '#fca5a5' : isLast ? '#4ade80' : playerColor}
            rx={2}
          />
        )
      })}

      {/* Ziellinie */}
      <line x1={0} y1={height - 2} x2={width} y2={height - 2} stroke="#22c55e" strokeWidth={2} />
    </svg>
  )
}
