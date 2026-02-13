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
}

export default function GameControls({
  isPaused,
  onTogglePause,
  isMuted,
  onToggleMute,
  onExit,
  onCancel,
  title,
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
          >
            ✕
          </button>
        )}
      </div>

      {/* Mitte: Titel */}
      <h2
        style={{
          textAlign: 'center',
          margin: 0,
          color: isArcade ? '#fff' : colors.fg,
          fontSize: 16,
          fontWeight: 800,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {title}
      </h2>

      {/* Rechts: Buttons */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', justifyContent: 'flex-end' }}>
        {/* Pause Button */}
        <button
          onClick={onTogglePause}
          style={pauseBtnStyle}
          title={isPaused ? 'Fortsetzen' : 'Pause'}
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
        >
          {isMuted ? '🔇' : '🔊'}
        </button>

        {/* Menü Button */}
        <button onClick={onExit} style={btnStyle}>
          Menü
        </button>
      </div>
    </div>
  )
}

// Pause Overlay Komponente - Klick oder Taste beendet Pause
export function PauseOverlay({ onResume }: { onResume: () => void }) {
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

  return (
    <div
      onClick={onResume}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.7)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        backdropFilter: 'blur(4px)',
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
      <div
        style={{
          marginTop: 24,
          fontSize: 16,
          color: isArcade ? '#9ca3af' : '#6b7280',
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
    </div>
  )
}
