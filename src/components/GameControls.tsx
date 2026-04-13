// src/components/GameControls.tsx
// Einheitliche Spielsteuerung: Pause, Mute, Exit
// Wird in allen Spielen (X01, Cricket, ATB) verwendet

import React from 'react'
import { useTheme } from '../ThemeProvider'

type Props = {
  /** Ist das Spiel pausiert? */
  isPaused: boolean
  /** Pause umschalten */
  onTogglePause: () => void
  /** Ist Sprache aktiviert? */
  isMuted: boolean
  /** Mute umschalten */
  onToggleMute: () => void
  /** Zurück zum Menü */
  onExit: () => void
  /** Spiel abbrechen (optional) */
  onCancel?: () => void
  /** Spieltitel */
  title: string
  /** Optionale Zusatzinfo unter/neben dem Titel (z.B. Leg-Nr, Zeit) */
  subtitle?: string
}

export default function GameControls({
  isPaused,
  onTogglePause,
  isMuted,
  onToggleMute,
  onExit,
  onCancel,
  title,
  subtitle,
}: Props) {
  const { isArcade, colors } = useTheme()

  // Button Styles
  const btnStyle: React.CSSProperties = {
    padding: '6px 10px',
    fontSize: 11,
    fontWeight: 700,
    background: isArcade ? '#292524' : colors.bgCard,
    border: `1px solid ${isArcade ? '#444' : colors.border}`,
    borderRadius: 6,
    color: isArcade ? '#9ca3af' : colors.fg,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 36,
    height: 32,
  }

  const pauseBtnStyle: React.CSSProperties = {
    ...btnStyle,
    background: isPaused
      ? (isArcade ? '#f97316' : colors.accent)
      : (isArcade ? '#292524' : colors.bgCard),
    color: isPaused
      ? (isArcade ? '#0a0a0a' : '#fff')
      : (isArcade ? '#f97316' : colors.fg),
    border: `1px solid ${isArcade ? '#f97316' : colors.accent}`,
  }

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'auto 1fr auto',
        alignItems: 'center',
        background: isArcade ? '#0f0f0f' : colors.bgCard,
        padding: '10px 16px',
        borderRadius: '12px 12px 0 0',
        borderBottom: `1px solid ${colors.border}`,
        gap: 12,
      }}
    >
      {/* Links: Abbrechen-Button */}
      <div style={{ width: 80, display: 'flex', alignItems: 'center' }}>
        {onCancel && (
          <button
            onClick={() => {
              if (confirm('Spiel wirklich abbrechen? Das Spiel wird nicht gespeichert.')) {
                onCancel()
              }
            }}
            style={{
              ...btnStyle,
              background: isArcade ? '#7f1d1d' : '#fef2f2',
              border: `1px solid ${isArcade ? '#dc2626' : '#fecaca'}`,
              color: isArcade ? '#fca5a5' : '#dc2626',
              fontSize: 14,
            }}
            title="Spiel abbrechen"
            aria-label="Spiel abbrechen"
          >
            ✕
          </button>
        )}
      </div>

      {/* Mitte: Titel + optionaler Untertitel */}
      <div style={{ textAlign: 'center', overflow: 'hidden', minWidth: 0 }}>
        <div
          style={{
            margin: 0,
            color: isArcade ? '#fff' : colors.fg,
            fontSize: subtitle ? 13 : 16,
            fontWeight: 800,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            lineHeight: 1.2,
          }}
        >
          {title}
        </div>
        {subtitle && (
          <div style={{
            fontSize: 10,
            fontWeight: 600,
            color: isArcade ? '#9ca3af' : colors.fgDim,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            lineHeight: 1.2,
            marginTop: 1,
          }}>
            {subtitle}
          </div>
        )}
      </div>

      {/* Rechts: Buttons */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', justifyContent: 'flex-end' }}>
        {/* Pause Button */}
        <button
          onClick={onTogglePause}
          style={pauseBtnStyle}
          title={isPaused ? 'Fortsetzen' : 'Pause'}
          aria-label={isPaused ? 'Spiel fortsetzen' : 'Spiel pausieren'}
        >
          {isPaused ? '▶' : '⏸'}
        </button>

        {/* Mute Button */}
        <button
          onClick={onToggleMute}
          style={{
            ...btnStyle,
            fontSize: 16,
          }}
          title={isMuted ? 'Ton an' : 'Ton aus'}
          aria-label={isMuted ? 'Ton einschalten' : 'Ton ausschalten'}
        >
          {isMuted ? '🔇' : '🔊'}
        </button>

        {/* Menü Button */}
        <button onClick={onExit} style={btnStyle} aria-label="Zurück zum Menü">
          Menü
        </button>
      </div>
    </div>
  )
}

// Pause Overlay Komponente - Klick oder Taste beendet Pause
type PauseOverlayProps = {
  onResume: () => void
  /** Optional: Match-Stand (z.B. "Legs: 2-1" oder "Sets: 1-0, Legs: 2-1") */
  matchScore?: string
  /** Optional: Verstrichene Spielzeit (formatiert, z.B. "5:32") */
  elapsedTime?: string
  /** Optional: Mini-Stats der Spieler */
  playerStats?: Array<{
    name: string
    color?: string
    average: number
    dartsThrown: number
  }>
  /** Optional: Extra-Inhalte (z.B. Charts) die in der Pause angezeigt werden */
  children?: React.ReactNode
}

export function PauseOverlay({ onResume, matchScore, elapsedTime, playerStats, children }: PauseOverlayProps) {
  const { isArcade, colors } = useTheme()

  // Jede Taste beendet Pause
  React.useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      e.preventDefault()
      onResume()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onResume])

  const cardBg = isArcade ? 'rgba(30, 30, 30, 0.85)' : 'rgba(255, 255, 255, 0.12)'
  const textMuted = isArcade ? '#9ca3af' : '#a1a1aa'
  const textBright = isArcade ? '#e5e7eb' : '#d4d4d8'

  return (
    <div
      onClick={onResume}
      role="dialog"
      aria-modal="true"
      aria-label="Spiel pausiert"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.6)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        cursor: 'pointer',
      }}
    >
      <div
        style={{
          fontSize: isArcade ? 72 : 64,
          fontWeight: 900,
          color: isArcade ? colors.ledOn : colors.fg,
          textShadow: isArcade
            ? `0 0 30px ${colors.ledGlow}, 0 0 60px ${colors.ledGlow}`
            : '0 4px 20px rgba(0,0,0,0.3)',
          fontFamily: isArcade ? '"Orbitron", monospace' : 'inherit',
          letterSpacing: isArcade ? 8 : 4,
          animation: 'pausePulse 2s ease-in-out infinite',
        }}
      >
        PAUSE
      </div>

      {/* Match Score + Elapsed Time */}
      {(matchScore || elapsedTime) && (
        <div style={{
          marginTop: 20,
          display: 'flex',
          gap: 16,
          alignItems: 'center',
          fontSize: 15,
          fontWeight: 600,
          color: textBright,
        }}>
          {matchScore && <span>{matchScore}</span>}
          {matchScore && elapsedTime && <span style={{ color: textMuted }}>|</span>}
          {elapsedTime && <span style={{ color: textMuted }}>Spielzeit: {elapsedTime}</span>}
        </div>
      )}

      {/* Mini Stats */}
      {playerStats && playerStats.length > 0 && (
        <div style={{
          marginTop: 20,
          display: 'flex',
          gap: 12,
          flexWrap: 'wrap',
          justifyContent: 'center',
        }}>
          {playerStats.map((p, i) => (
            <div key={i} style={{
              background: cardBg,
              borderRadius: 10,
              padding: '10px 16px',
              minWidth: 120,
              textAlign: 'center',
              border: `1px solid ${p.color ? p.color + '40' : 'rgba(255,255,255,0.1)'}`,
            }}>
              <div style={{
                fontSize: 13,
                fontWeight: 700,
                color: p.color || textBright,
                marginBottom: 6,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {p.name}
              </div>
              <div style={{ fontSize: 12, color: textMuted, marginBottom: 2 }}>
                3-Dart-Avg
              </div>
              <div style={{ fontSize: 20, fontWeight: 800, color: textBright }}>
                {p.average.toFixed(1)}
              </div>
              <div style={{ fontSize: 11, color: textMuted, marginTop: 4 }}>
                {p.dartsThrown} Darts
              </div>
            </div>
          ))}
        </div>
      )}

      <div
        style={{
          marginTop: 24,
          fontSize: 16,
          color: textMuted,
          fontWeight: 500,
        }}
      >
        Klicken oder Taste drücken zum Fortsetzen
      </div>
      <style>{`
        @keyframes pausePulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.7; transform: scale(1.02); }
        }
      `}</style>
      {children}
    </div>
  )
}
