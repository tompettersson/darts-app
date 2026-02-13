// src/components/CricketTurnList.tsx
// Wurfabfolge für Cricket (ähnlich X01 VisitList)

import React from 'react'

// Farben für beide Themes
const darkColors = {
  bg: '#0a0a0a',
  cardBg: '#1a1a1a',
  ledOn: '#f97316',
  ledOff: '#2a2a2a',
  text: '#f5f5f5',
  textDim: '#6b7280',
  activeGlow: 'rgba(249, 115, 22, 0.3)',
  success: '#22c55e',
  dartBg: '#1c1c1c',
  dartBorder: '#333',
  scrollTrack: '#2a2a2a',
  scrollThumb: '#f97316',
}

const lightColors = {
  bg: '#ffffff',
  cardBg: '#ffffff',
  ledOn: '#f97316',
  ledOff: '#e5e7eb',
  text: '#111827',
  textDim: '#6b7280',
  activeGlow: 'rgba(249, 115, 22, 0.15)',
  success: '#16a34a',
  dartBg: '#f1f5f9',
  dartBorder: '#e5e7eb',
  scrollTrack: '#f1f5f9',
  scrollThumb: '#94a3b8',
}

export type CricketTurnEntry = {
  playerName: string
  playerColor?: string
  darts: string[]          // ["T20", "T20", "S19"]
  marksAdded: number       // 6
  marksDetail: string      // "20 (3), 19 (3)"
  closedFields?: string[]  // ["20", "19"] - in diesem Turn geschlossen
  isLive?: boolean
}

type Props = {
  turns: CricketTurnEntry[]
  scrollRef?: React.RefObject<HTMLDivElement | null>
  maxHeight?: number
  isLight?: boolean
}

export default function CricketTurnList({ turns, scrollRef, maxHeight = 350, isLight = false }: Props) {
  const c = isLight ? lightColors : darkColors
  const scrollClass = isLight ? 'cricket-turn-list-scroll-light' : 'cricket-turn-list-scroll-dark'

  return (
    <div
      ref={scrollRef}
      style={{
        background: c.cardBg,
        borderRadius: 10,
        padding: '10px 12px',
        border: isLight ? '1px solid #e5e7eb' : 'none',
        width: '100%',
        maxWidth: 300,
        height: '100%',
        maxHeight,
        overflowY: 'auto',
        overflowX: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        boxSizing: 'border-box',
      }}
      className={scrollClass}
    >
      {/* Scrollbar Styling */}
      <style>{`
        .cricket-turn-list-scroll-dark {
          scrollbar-width: thin;
          scrollbar-color: ${darkColors.scrollThumb} ${darkColors.scrollTrack};
        }
        .cricket-turn-list-scroll-dark::-webkit-scrollbar {
          width: 10px;
        }
        .cricket-turn-list-scroll-dark::-webkit-scrollbar-track {
          background: ${darkColors.scrollTrack};
          border-radius: 5px;
        }
        .cricket-turn-list-scroll-dark::-webkit-scrollbar-thumb {
          background: ${darkColors.scrollThumb};
          border-radius: 5px;
        }
        .cricket-turn-list-scroll-light {
          scrollbar-width: thin;
          scrollbar-color: ${lightColors.scrollThumb} ${lightColors.scrollTrack};
        }
        .cricket-turn-list-scroll-light::-webkit-scrollbar {
          width: 10px;
        }
        .cricket-turn-list-scroll-light::-webkit-scrollbar-track {
          background: ${lightColors.scrollTrack};
          border-radius: 5px;
        }
        .cricket-turn-list-scroll-light::-webkit-scrollbar-thumb {
          background: ${lightColors.scrollThumb};
          border-radius: 5px;
        }
      `}</style>

      {/* Header */}
      <div
        style={{
          display: 'flex',
          gap: 8,
          padding: '0 2px 4px',
          borderBottom: `1px solid ${c.ledOff}`,
          marginBottom: 4,
          fontSize: 9,
          color: c.textDim,
          letterSpacing: 0.5,
          textTransform: 'uppercase',
          fontWeight: 700,
        }}
      >
        <span style={{ width: 50, flexShrink: 0 }}>Spieler</span>
        <span style={{ flex: 1 }}>Darts</span>
        <span style={{ width: 35, textAlign: 'right', flexShrink: 0 }}>+</span>
      </div>

      {/* Turn-Zeilen — kompakt horizontal */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {turns.length === 0 ? (
          <div style={{ padding: '6px 2px', fontSize: 10, color: c.textDim }}>
            Noch keine Aufnahmen
          </div>
        ) : (
          turns.map((t, idx) => (
            <div
              key={idx}
              style={{
                display: 'flex',
                gap: 8,
                padding: '3px 2px',
                borderRadius: 4,
                background: t.isLive ? c.activeGlow : 'transparent',
                borderLeft: t.isLive ? `2px solid ${c.ledOn}` : '2px solid transparent',
                alignItems: 'center',
              }}
            >
              {/* Spieler */}
              <span
                style={{
                  width: 50,
                  flexShrink: 0,
                  fontSize: 9,
                  fontWeight: 600,
                  color: t.playerColor ?? c.text,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {t.playerName}
              </span>

              {/* Darts — horizontal nebeneinander */}
              <div style={{ display: 'flex', gap: 2, flex: 1 }}>
                {t.darts.map((label, i) => (
                  <span
                    key={i}
                    style={{
                      fontSize: 9,
                      fontWeight: 700,
                      color: t.isLive ? c.ledOn : c.text,
                      background: c.dartBg,
                      padding: '1px 3px',
                      borderRadius: 2,
                      border: t.isLive ? `1px solid ${c.ledOn}` : `1px solid ${c.dartBorder}`,
                    }}
                  >
                    {label}
                  </span>
                ))}
              </div>

              {/* Marks Added */}
              <span
                style={{
                  width: 35,
                  flexShrink: 0,
                  fontSize: 11,
                  fontWeight: 800,
                  color: t.marksAdded > 0 ? (t.isLive ? '#eab308' : c.success) : c.textDim,
                  textAlign: 'right',
                }}
                title={t.marksDetail}
              >
                {t.marksAdded > 0 ? `+${t.marksAdded}` : '0'}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

/**
 * Hilfsfunktion: Formatiert einen Dart als kurzes Label
 */
export function formatDartLabel(d: { target: number | 'BULL' | 'MISS'; mult: 1 | 2 | 3 }): string {
  if (d.target === 'MISS') return 'X'
  if (d.target === 'BULL') return d.mult === 2 ? 'DB' : 'B'
  const prefix = d.mult === 3 ? 'T' : d.mult === 2 ? 'D' : 'S'
  return `${prefix}${d.target}`
}

/**
 * Hilfsfunktion: Berechnet die Marks-Details für einen Turn
 */
export function computeMarksDetail(
  darts: { target: number | 'BULL' | 'MISS'; mult: 1 | 2 | 3 }[],
  marksBefore: Record<string, number>,
  validTargets: string[]
): {
  marksAdded: number
  marksDetail: string
  closedFields: string[]
} {
  const newMarks: Record<string, number> = {}
  const closedFields: string[] = []
  const currentMarks = { ...marksBefore }

  for (const d of darts) {
    if (d.target === 'MISS') continue
    const tKey = String(d.target)
    if (!validTargets.includes(tKey)) continue

    const before = currentMarks[tKey] ?? 0
    if (before >= 3) continue // schon geschlossen

    const mult = d.target === 'BULL' && d.mult === 3 ? 2 : d.mult
    const added = Math.min(mult, 3 - before)
    currentMarks[tKey] = before + added
    newMarks[tKey] = (newMarks[tKey] ?? 0) + added

    // Feld gerade geschlossen?
    if (before < 3 && currentMarks[tKey] >= 3) {
      closedFields.push(tKey === 'BULL' ? 'Bull' : tKey)
    }
  }

  const parts: string[] = []
  for (const [t, count] of Object.entries(newMarks)) {
    if (count > 0) {
      const label = t === 'BULL' ? 'Bull' : t
      parts.push(`${label}:${count}`)
    }
  }

  const marksAdded = Object.values(newMarks).reduce((a, b) => a + b, 0)
  return {
    marksAdded,
    marksDetail: parts.join(' ') || '—',
    closedFields,
  }
}
