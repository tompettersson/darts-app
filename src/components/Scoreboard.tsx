// src/components/Scoreboard.tsx
import React, { useState, useEffect, useRef, useCallback } from 'react'
import type { Bed } from '../darts501'
import { startListening, isSpeechInputSupported, type DartResult } from '../speechInput'
import DartboardInput from './DartboardInput'
import MobileScoreInput from './MobileScoreInput'

type InputMode = 'keyboard' | 'dartboard' | 'mobile'

/** Info about a thrown dart, used for slot display */
type ThrownDart = {
  bed: Bed | 'MISS'
  mult: 1 | 2 | 3
}

type Props = {
  onThrow: (bed: Bed | 'MISS', mult: 1 | 2 | 3) => void
  dartsThrown?: number // Anzahl bereits geworfener Darts (0-2)
  thrownDarts?: ThrownDart[] // Actual dart details for slot display
  theme?: 'light' | 'arcade'
  onUndoLastDart?: () => void // Backspace: letzten Dart in aktueller Aufnahme rückgängig
  onUndoLastVisit?: () => void // Letzte bestätigte Aufnahme rückgängig
  compact?: boolean // Kompaktes quadratisches Layout für Arcade-Modus
}

// SVG Dart-Pfeil Icon
const DartIcon = ({ size = 18 }: { size?: number }) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    style={{ display: 'inline-block', verticalAlign: 'middle' }}
  >
    <path
      d="M20 4L4 11L9 13L11 20L20 4Z"
      fill="currentColor"
      stroke="currentColor"
      strokeWidth="1"
      strokeLinejoin="round"
    />
    <path
      d="M9 13L11 20L12 15L20 4L9 13Z"
      fill="currentColor"
      opacity="0.6"
    />
    <line x1="4" y1="11" x2="20" y2="4" stroke="currentColor" strokeWidth="0.5" opacity="0.3" />
  </svg>
)

// SVG Bullseye Icon
const BullseyeIcon = ({ size = 14 }: { size?: number }) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: 2 }}
  >
    <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2" />
    <circle cx="12" cy="12" r="6" fill="none" stroke="currentColor" strokeWidth="2" />
    <circle cx="12" cy="12" r="2.5" fill="currentColor" />
  </svg>
)

// Hilfsfunktion: DartResult als lesbaren String formatieren
function formatDart(d: DartResult): string {
  const prefix = d.mult === 3 ? 'T' : d.mult === 2 ? 'D' : ''
  if (d.bed === 'MISS') return 'Miss'
  if (d.bed === 'BULL') return 'Bull'
  if (d.bed === 'DBULL') return 'DBull'
  return `${prefix}${d.bed}`
}

// Format a thrown dart for slot display
function formatThrownDart(d: ThrownDart): string {
  if (d.bed === 'MISS') return 'Miss'
  if (d.bed === 'BULL') return 'Bull'
  if (d.bed === 'DBULL') return 'DBull'
  const prefix = d.mult === 3 ? 'T' : d.mult === 2 ? 'D' : 'S'
  return `${prefix}${d.bed}`
}

// Compute numerical score of a dart
function dartScore(d: ThrownDart): number {
  if (d.bed === 'MISS') return 0
  if (d.bed === 'BULL') return 25
  if (d.bed === 'DBULL') return 50
  return (d.bed as number) * d.mult
}

// Get slot color based on dart score
function dartSlotColor(d: ThrownDart): { bg: string; border: string; text: string } {
  const s = dartScore(d)
  if (s === 0) return { bg: '#fee2e2', border: '#ef4444', text: '#b91c1c' } // Red for miss
  if (s >= 40) return { bg: '#dcfce7', border: '#22c55e', text: '#15803d' } // Green for great
  if (s >= 20) return { bg: '#fff7ed', border: '#f97316', text: '#c2410c' } // Orange for medium
  return { bg: '#f0f9ff', border: '#60a5fa', text: '#1d4ed8' } // Blue for low
}

function dartSlotColorDark(d: ThrownDart): { bg: string; border: string; text: string } {
  const s = dartScore(d)
  if (s === 0) return { bg: '#450a0a', border: '#ef4444', text: '#fca5a5' }
  if (s >= 40) return { bg: '#052e16', border: '#22c55e', text: '#86efac' }
  if (s >= 20) return { bg: '#431407', border: '#f97316', text: '#fdba74' }
  return { bg: '#172554', border: '#60a5fa', text: '#93c5fd' }
}

export default function Scoreboard({ onThrow, dartsThrown = 0, thrownDarts, theme = 'light', onUndoLastDart, onUndoLastVisit, compact = false }: Props) {
  const [mult, setMult] = useState<1 | 2 | 3>(1)
  const [voiceState, setVoiceState] = useState<'idle' | 'listening' | 'processing'>('idle')
  const [voiceMode, setVoiceMode] = useState<1 | 3 | null>(null)
  const [partialDarts, setPartialDarts] = useState<DartResult[]>([])
  const stopListeningRef = useRef<(() => void) | null>(null)
  const [inputMode, setInputMode] = useState<InputMode>('keyboard')
  const [numBufDisplay, setNumBufDisplay] = useState('')
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(max-width: 599px)').matches
  )

  // Listen for screen size changes
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 599px)')
    setIsMobile(mq.matches)
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  const dark = theme === 'arcade'

  // Mobile: render compact 4x4 grid
  if (isMobile) {
    return (
      <MobileScoreInput
        onThrow={onThrow}
        dartsThrown={dartsThrown}
        thrownDarts={thrownDarts}
        onUndoLastDart={onUndoLastDart}
        onUndoLastVisit={onUndoLastVisit}
      />
    )
  }

  // Speech Recognition Support prüfen
  const speechSupported = isSpeechInputSupported()
  const dartsRemaining = 3 - dartsThrown
  const canUseThreeDartVoice = dartsThrown === 0

  // Refs für Keyboard-Handler (damit immer aktueller Wert verfügbar)
  const multRef = useRef(mult)
  multRef.current = mult
  const onThrowRef = useRef(onThrow)
  onThrowRef.current = onThrow

  // ===== Nummern-Puffer für Tastatur-Eingabe =====
  const numBuf = useRef('')
  const numBufTimer = useRef<number | null>(null)

  const clearNumBuf = useCallback(() => {
    if (numBufTimer.current) {
      window.clearTimeout(numBufTimer.current)
      numBufTimer.current = null
    }
    numBuf.current = ''
    setNumBufDisplay('')
  }, [])

  const fireNum = useCallback((n: number) => {
    if (n >= 1 && n <= 20) {
      onThrowRef.current(n as Bed, multRef.current)
      if (multRef.current !== 1) setMult(1)
    }
    clearNumBuf()
  }, [clearNumBuf])

  const flushBuf = useCallback(() => {
    if (numBuf.current !== '') {
      const n = parseInt(numBuf.current, 10)
      if (n >= 1 && n <= 20) {
        fireNum(n)
      } else {
        clearNumBuf()
      }
    }
  }, [fireNum, clearNumBuf])

  // Tastatur-Handler: S/D/T + Nummern + B/M
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return
      const t = e.target as HTMLElement | null
      const tag = (t?.tagName || '').toLowerCase()
      const typing = tag === 'input' || tag === 'textarea' || (t as any)?.isContentEditable
      if (typing) return

      const k = e.key.toLowerCase()

      // S/D/T Multiplier
      if (k === 's') { setMult(1); e.preventDefault(); return }
      if (k === 'd') { setMult(2); e.preventDefault(); return }
      if (k === 't') { setMult(3); e.preventDefault(); return }

      // Bull
      if (k === 'b') {
        clearNumBuf()
        const m = multRef.current
        if (m >= 2) {
          onThrowRef.current('DBULL' as Bed, 1)
        } else {
          onThrowRef.current('BULL' as Bed, 1)
        }
        if (multRef.current !== 1) setMult(1)
        e.preventDefault()
        return
      }

      // Miss
      if (k === 'm') {
        clearNumBuf()
        onThrowRef.current('MISS', 1)
        if (multRef.current !== 1) setMult(1)
        e.preventDefault()
        return
      }

      // Backspace: Nur NumBuf leeren (Game.tsx handhabt Dart-Undo)
      if (e.key === 'Backspace') {
        clearNumBuf()
        // Kein onUndoLastDart hier - wird in Game.tsx separat behandelt
        return
      }

      // Space/Enter: Gepufferte Ziffer sofort bestätigen (1 oder 2)
      if (e.code === 'Space' || k === 'enter') {
        if (numBuf.current !== '') {
          e.preventDefault()
          flushBuf()
        }
        return
      }

      // Ziffern 0-9
      if (k >= '0' && k <= '9') {
        e.preventDefault()
        const digit = k

        if (numBuf.current === '') {
          // Erste Ziffer
          if (digit === '0') {
            // 0 allein = Miss
            onThrowRef.current('MISS', 1)
            if (multRef.current !== 1) setMult(1)
            return
          }
          if (digit >= '3' && digit <= '9') {
            // 3-9: Einstellig, sofort feuern
            fireNum(parseInt(digit, 10))
          } else {
            // 1 oder 2: Puffern, auf zweite Ziffer warten
            numBuf.current = digit
            setNumBufDisplay(digit)
            numBufTimer.current = window.setTimeout(() => {
              flushBuf()
            }, 500) as unknown as number
          }
        } else {
          // Zweite Ziffer
          if (numBufTimer.current) {
            window.clearTimeout(numBufTimer.current)
            numBufTimer.current = null
          }

          const first = numBuf.current
          const combined = parseInt(first + digit, 10)

          if (first === '1') {
            // 10-19: Alle gültig
            fireNum(combined)
          } else if (first === '2') {
            if (digit === '0') {
              // 20: Gültig
              fireNum(20)
            } else {
              // 21-29: Ungültig → nur die 2 feuern
              fireNum(2)
            }
          }
        }
        return
      }
    }

    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      if (numBufTimer.current) window.clearTimeout(numBufTimer.current)
    }
  }, [fireNum, flushBuf, clearNumBuf])

  const isSelected = (m: 1 | 2 | 3) => mult === m

  // ===== Styling =====
  const lightSdtColors = {
    1: { activeBg: '#dbeafe', activeBorder: '#3b82f6', activeColor: '#1d4ed8', glow: 'rgba(59,130,246,0.25)' },
    2: { activeBg: '#dcfce7', activeBorder: '#22c55e', activeColor: '#15803d', glow: 'rgba(34,197,94,0.25)' },
    3: { activeBg: '#fee2e2', activeBorder: '#ef4444', activeColor: '#b91c1c', glow: 'rgba(239,68,68,0.25)' },
  }

  const modeButtonStyle = (m: 1 | 2 | 3, active: boolean): React.CSSProperties => {
    const c = dark ? sdtColors[m] : lightSdtColors[m]
    if (dark) return {
      padding: '6px 10px',
      borderRadius: 6,
      border: `2px solid ${active ? (c as typeof sdtColors[1]).border : '#6b7280'}`,
      background: active ? (c as typeof sdtColors[1]).bg : '#374151',
      color: active ? '#fff' : '#9ca3af',
      cursor: 'pointer',
      fontWeight: 700,
      fontSize: 13,
      lineHeight: 1.2,
      transition: 'all .15s',
      flex: 1,
      boxShadow: active ? `0 0 10px ${(c as typeof sdtColors[1]).glow}` : 'none',
      transform: active ? 'scale(1.08)' : 'scale(1)',
    }
    const lc = c as typeof lightSdtColors[1]
    return {
      padding: '4px 6px',
      borderRadius: 4,
      border: active ? `2px solid ${lc.activeBorder}` : '1px solid #e5e7eb',
      background: active ? lc.activeBg : '#fff',
      color: active ? lc.activeColor : '#111827',
      cursor: 'pointer',
      fontWeight: 700,
      fontSize: 11,
      lineHeight: 1.2,
      transition: 'all .15s',
      boxShadow: active ? `0 0 8px ${lc.glow}` : 'none',
      transform: active ? 'scale(1.08)' : 'scale(1)',
    }
  }

  const numberButtonStyle: React.CSSProperties = dark ? {
    padding: compact ? '8px 0' : '8px 0',
    borderRadius: compact ? 5 : 6,
    border: compact ? '2px solid #f97316' : '2px solid #f97316',
    background: '#292524',
    color: '#f97316',
    cursor: 'pointer',
    fontWeight: 800,
    fontSize: compact ? 16 : 14,
    lineHeight: 1.2,
    textAlign: 'center',
    transition: 'all .12s',
  } : {
    padding: '5px 0',
    borderRadius: 4,
    border: '1px solid #e5e7eb',
    background: '#fff',
    cursor: 'pointer',
    fontWeight: 700,
    fontSize: 12,
    lineHeight: 1.2,
    textAlign: 'center',
    transition: 'background .12s, border-color .12s',
  }

  const numberButtonHover: React.CSSProperties = dark ? {
    borderColor: '#fb923c',
    background: '#3a2a1a',
  } : {
    borderColor: '#0ea5e9',
    background: '#f8fafc',
  }

  const specialBtnStyle = (type: 'bull' | 'dbull' | 'miss'): React.CSSProperties => {
    const isMiss = type === 'miss'
    const isBull = type === 'bull' || type === 'dbull'
    if (!dark) {
      return {
        ...numberButtonStyle,
        border: isMiss ? '2px solid #fca5a5' : '2px solid #fbbf24',
        background: isMiss ? '#fef2f2' : '#fffbeb',
        color: isMiss ? '#b91c1c' : '#92400e',
        fontWeight: 800,
      }
    }
    return {
      ...numberButtonStyle,
      border: `2px solid ${isMiss ? '#ef4444' : '#eab308'}`,
      color: isMiss ? '#fca5a5' : '#fde047',
      background: isMiss ? '#450a0a' : '#422006',
      fontWeight: 800,
    }
  }

  const rowStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(5, 1fr)',
    gap: compact ? 4 : (dark ? 4 : 3),
  }

  const [hoverId, setHoverId] = useState<string | null>(null)
  const hov = (id: string) => hoverId === id

  // Render content for special buttons (Bull/Miss)
  const specialBtnContent = (type: 'bull' | 'dbull' | 'miss', label: string) => {
    if (type === 'bull' || type === 'dbull') {
      return <><BullseyeIcon size={compact ? 13 : 12} />{label}</>
    }
    return <>{label}</>
  }

  const fireNumber = (n: number, e?: React.MouseEvent) => {
    e?.currentTarget && (e.currentTarget as HTMLElement).blur()
    onThrow(n as Bed, mult)
    if (mult !== 1) setMult(1)
  }
  const fireBull = (e?: React.MouseEvent) => {
    e?.currentTarget && (e.currentTarget as HTMLElement).blur()
    onThrow('BULL' as Bed, 1)
    if (mult !== 1) setMult(1)
  }
  const fireDBull = (e?: React.MouseEvent) => {
    e?.currentTarget && (e.currentTarget as HTMLElement).blur()
    onThrow('DBULL' as Bed, 1)
    if (mult !== 1) setMult(1)
  }
  const fireMiss = (e?: React.MouseEvent) => {
    e?.currentTarget && (e.currentTarget as HTMLElement).blur()
    onThrow('MISS', 1)
    if (mult !== 1) setMult(1)
  }

  // Voice Input starten
  const startVoiceInput = (count: 1 | 3) => {
    if (!speechSupported || voiceState !== 'idle') return
    setVoiceMode(count)
    setVoiceState('listening')
    setPartialDarts([])
    stopListeningRef.current = startListening(
      (darts: DartResult[]) => {
        darts.forEach((d) => { onThrow(d.bed as Bed, d.mult) })
        setVoiceState('idle')
        setVoiceMode(null)
        setPartialDarts([])
        stopListeningRef.current = null
      },
      count,
      (state) => { setVoiceState(state) },
      (darts: DartResult[]) => { setPartialDarts([...darts]) }
    )
  }

  const cancelVoiceInput = () => {
    if (stopListeningRef.current) {
      stopListeningRef.current()
      stopListeningRef.current = null
    }
    setVoiceState('idle')
    setVoiceMode(null)
    setPartialDarts([])
  }

  useEffect(() => {
    return () => { if (stopListeningRef.current) stopListeningRef.current() }
  }, [])

  const INPUT_MODES: InputMode[] = ['keyboard', 'dartboard', 'mobile']
  const INPUT_MODE_LABELS: Record<InputMode, string> = { keyboard: 'Tastatur', dartboard: 'Dartscheibe', mobile: 'Numpad' }

  const toggleInputMode = () => {
    const idx = INPUT_MODES.indexOf(inputMode)
    setInputMode(INPUT_MODES[(idx + 1) % INPUT_MODES.length])
  }

  // Container-Style
  const containerStyle: React.CSSProperties = dark ? {
    display: compact ? 'flex' : 'grid',
    flexDirection: compact ? 'column' : undefined,
    justifyContent: compact ? 'space-between' : undefined,
    gap: compact ? 5 : 6,
    maxWidth: compact ? 340 : 300,
    width: compact ? 340 : undefined,
    height: compact ? '100%' : undefined,
    margin: compact ? 0 : '0 auto',
    background: compact ? '#1a1a1a' : '#0f0f0f',
    borderRadius: 10,
    padding: compact ? '10px 10px 14px' : '10px 10px 12px',
    border: compact ? 'none' : '1px solid #2a2a2a',
  } : {
    display: 'grid',
    gap: 4,
    maxWidth: 280,
    margin: '0 auto',
  }

  const toggleBtnStyle: React.CSSProperties = dark ? {
    padding: '2px 8px',
    background: '#292524',
    border: '1px solid #6b7280',
    borderRadius: 4,
    cursor: 'pointer',
    fontSize: 14,
    fontWeight: 700,
    color: '#9ca3af',
  } : {
    padding: '2px 8px',
    background: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: 4,
    cursor: 'pointer',
    fontSize: 14,
    fontWeight: 700,
    color: '#374151',
  }

  const toggleLabelStyle: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 600,
    color: dark ? '#9ca3af' : '#374151',
    minWidth: 70,
    textAlign: 'center',
  }

  // S/D/T color coding
  const sdtColors = {
    1: { active: '#3b82f6', glow: 'rgba(59,130,246,0.5)', bg: '#1e3a5f', border: '#60a5fa' },   // Blue
    2: { active: '#22c55e', glow: 'rgba(34,197,94,0.5)', bg: '#14532d', border: '#4ade80' },     // Green
    3: { active: '#ef4444', glow: 'rgba(239,68,68,0.5)', bg: '#7f1d1d', border: '#f87171' },     // Red
  }

  // Arcade-Modus: S/D/T rechts vertikal + runder Toggle-Button
  const arcadeSdtStyle = (m: 1 | 2 | 3, active: boolean): React.CSSProperties => {
    const c = sdtColors[m]
    return {
      width: compact ? 44 : 38,
      height: compact ? 44 : 38,
      borderRadius: compact ? 5 : 6,
      border: `2px solid ${active ? c.border : '#6b7280'}`,
      background: active ? c.bg : '#374151',
      color: active ? '#fff' : '#9ca3af',
      cursor: 'pointer',
      fontWeight: 800,
      fontSize: compact ? 16 : 14,
      lineHeight: 1,
      transition: 'all .15s',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 0,
      boxShadow: active ? `0 0 12px ${c.glow}` : 'none',
      transform: active ? 'scale(1.12)' : 'scale(1)',
    }
  }

  const arcadeToggleBtnStyle: React.CSSProperties = {
    width: compact ? 36 : 32,
    height: compact ? 36 : 32,
    borderRadius: '50%',
    border: `2px solid #6b7280`,
    background: '#292524',
    color: '#9ca3af',
    cursor: 'pointer',
    fontWeight: 700,
    fontSize: compact ? 14 : 11,
    lineHeight: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
    transition: 'all .15s',
    marginTop: compact ? 4 : 4,
  }

  return (
    <div style={containerStyle}>
      {/* Dart Slot Display — 3 pill-shaped badges */}
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 8,
        padding: compact ? '4px 0 2px' : '6px 0 4px',
      }}>
        {[0, 1, 2].map((idx) => {
          const dart = thrownDarts?.[idx]
          const filled = !!dart
          if (filled) {
            const colors = dark ? dartSlotColorDark(dart) : dartSlotColor(dart)
            return (
              <div
                key={idx}
                className="dart-slot-filled"
                style={{
                  padding: compact ? '4px 10px' : '5px 12px',
                  borderRadius: 20,
                  border: `2px solid ${colors.border}`,
                  background: colors.bg,
                  color: colors.text,
                  fontSize: compact ? 13 : 14,
                  fontWeight: 800,
                  minWidth: compact ? 48 : 54,
                  textAlign: 'center',
                  transition: 'all 0.2s ease',
                }}
              >
                {formatThrownDart(dart)}
              </div>
            )
          }
          return (
            <div
              key={idx}
              style={{
                padding: compact ? '4px 10px' : '5px 12px',
                borderRadius: 20,
                border: `2px dashed ${dark ? '#4b5563' : '#d1d5db'}`,
                background: 'transparent',
                color: dark ? '#6b7280' : '#9ca3af',
                fontSize: compact ? 13 : 14,
                fontWeight: 600,
                minWidth: compact ? 48 : 54,
                textAlign: 'center',
              }}
            >
              {idx + 1}
            </div>
          )
        })}

        {/* NumBuf Indicator */}
        {numBufDisplay && (
          <div
            className="numbuf-indicator"
            style={{
              padding: '3px 10px',
              borderRadius: 8,
              background: dark ? '#1e3a5f' : '#dbeafe',
              border: `2px solid ${dark ? '#3b82f6' : '#60a5fa'}`,
              color: dark ? '#93c5fd' : '#1d4ed8',
              fontSize: 14,
              fontWeight: 800,
              minWidth: 36,
              textAlign: 'center',
              marginLeft: 4,
            }}
          >
            {numBufDisplay}_
          </div>
        )}
      </div>

      {/* Light-Modus: Eingabemodus-Umschalter oben */}
      {!dark && (
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          gap: 8,
          padding: '2px 0',
        }}>
          <button type="button" onClick={toggleInputMode} style={toggleBtnStyle} title="Zur anderen Eingabemethode wechseln" aria-label="Zur anderen Eingabemethode wechseln">
            ←
          </button>
          <div style={toggleLabelStyle}>
            {INPUT_MODE_LABELS[inputMode]}
          </div>
          <button type="button" onClick={toggleInputMode} style={toggleBtnStyle} title="Zur anderen Eingabemethode wechseln" aria-label="Zur anderen Eingabemethode wechseln">
            →
          </button>
        </div>
      )}

      {/* Dartscheibe-Modus */}
      {inputMode === 'dartboard' && (
        <>
          <DartboardInput onThrow={onThrow} />
          {/* Im Arcade-Modus: kleiner runder Toggle unter der Dartscheibe */}
          {dark && (
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: 6 }}>
              <button type="button" onClick={toggleInputMode} style={arcadeToggleBtnStyle} title="Zur Tastatur wechseln" aria-label="Zur Tastatur wechseln">
                ⌨
              </button>
            </div>
          )}
        </>
      )}

      {/* Tastatur-Modus */}
      {inputMode === 'keyboard' && (
        <>
          {dark ? (
            /* === ARCADE LAYOUT: Nummernfeld links, S/D/T rechts vertikal === */
            <div style={{ display: 'flex', gap: 8, alignItems: 'start' }}>
              {/* Linke Seite: Nummernfeld + Bull/Miss */}
              <div style={{ flex: 1, display: 'grid', gap: 4 }}>
                {/* Moduswahl S/D/T - Light-Modus oben */}

                {/* Zahlen 1–20 in 4 Reihen */}
                {[[1,2,3,4,5],[6,7,8,9,10],[11,12,13,14,15],[16,17,18,19,20]].map((row, ri) => (
                  <div key={ri} style={rowStyle}>
                    {row.map((n) => (
                      <button
                        key={n}
                        type="button"
                        style={{ ...numberButtonStyle, ...(hov(`n-${n}`) ? numberButtonHover : null) }}
                        onMouseEnter={() => setHoverId(`n-${n}`)}
                        onMouseLeave={() => setHoverId(null)}
                        onFocus={() => setHoverId(`n-${n}`)}
                        onBlur={() => setHoverId(null)}
                        onClick={(e) => fireNumber(n, e)}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                ))}

                {/* Bull / DBull / Miss */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 }}>
                  {[
                    { id: 'bull', label: 'Bull', handler: fireBull, type: 'bull' as const },
                    { id: 'dbull', label: 'DBull', handler: fireDBull, type: 'dbull' as const },
                    { id: 'miss', label: 'Miss', handler: fireMiss, type: 'miss' as const },
                  ].map(({ id, label, handler, type }) => (
                    <button
                      key={id}
                      type="button"
                      style={{ ...specialBtnStyle(type), ...(hov(id) ? numberButtonHover : null) }}
                      onMouseEnter={() => setHoverId(id)}
                      onMouseLeave={() => setHoverId(null)}
                      onFocus={() => setHoverId(id)}
                      onBlur={() => setHoverId(null)}
                      onClick={(e) => handler(e)}
                    >
                      {specialBtnContent(type, label)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Rechte Seite: S/D/T vertikal + Toggle-Button */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, paddingTop: 2 }}>
                <button type="button" style={arcadeSdtStyle(1, isSelected(1))} onClick={(e) => { (e.currentTarget as HTMLElement).blur(); setMult(1) }} aria-label="Single" aria-pressed={isSelected(1)}>
                  S
                </button>
                <button type="button" style={arcadeSdtStyle(2, isSelected(2))} onClick={(e) => { (e.currentTarget as HTMLElement).blur(); setMult(2) }} aria-label="Double" aria-pressed={isSelected(2)}>
                  D
                </button>
                <button type="button" style={arcadeSdtStyle(3, isSelected(3))} onClick={(e) => { (e.currentTarget as HTMLElement).blur(); setMult(3) }} aria-label="Triple" aria-pressed={isSelected(3)}>
                  T
                </button>
                {/* Runder Toggle-Button für Dartscheibe/Tastatur */}
                <button type="button" onClick={toggleInputMode} style={arcadeToggleBtnStyle} title="Zur Dartscheibe wechseln" aria-label="Zur Dartscheibe wechseln">
                  🎯
                </button>
              </div>
            </div>
          ) : (
            /* === LIGHT LAYOUT: Original-Layout === */
            <>
              {/* Moduswahl S/D/T */}
              <div style={{ display: 'flex', gap: 3, justifyContent: 'center', alignItems: 'center' }} role="group" aria-label="Multiplikator auswählen">
                <button type="button" style={modeButtonStyle(1, isSelected(1))} onClick={(e) => { (e.currentTarget as HTMLElement).blur(); setMult(1) }} aria-label="Single" aria-pressed={isSelected(1)}>
                  S
                </button>
                <button type="button" style={modeButtonStyle(2, isSelected(2))} onClick={(e) => { (e.currentTarget as HTMLElement).blur(); setMult(2) }} aria-label="Double" aria-pressed={isSelected(2)}>
                  D
                </button>
                <button type="button" style={modeButtonStyle(3, isSelected(3))} onClick={(e) => { (e.currentTarget as HTMLElement).blur(); setMult(3) }} aria-label="Triple" aria-pressed={isSelected(3)}>
                  T
                </button>
                <span style={{ fontSize: 9, color: '#9ca3af', marginLeft: 4 }}>Bull=fix</span>
              </div>

              {/* Zahlen 1–20 in 4 Reihen */}
              {[[1,2,3,4,5],[6,7,8,9,10],[11,12,13,14,15],[16,17,18,19,20]].map((row, ri) => (
                <div key={ri} style={rowStyle}>
                  {row.map((n) => (
                    <button
                      key={n}
                      type="button"
                      style={{ ...numberButtonStyle, ...(hov(`n-${n}`) ? numberButtonHover : null) }}
                      onMouseEnter={() => setHoverId(`n-${n}`)}
                      onMouseLeave={() => setHoverId(null)}
                      onFocus={() => setHoverId(`n-${n}`)}
                      onBlur={() => setHoverId(null)}
                      onClick={(e) => fireNumber(n, e)}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              ))}

              {/* Bull / DBull / Miss + Voice Buttons */}
              <div style={{ display: 'grid', gridTemplateColumns: speechSupported ? 'repeat(5, 1fr)' : 'repeat(3, 1fr)', gap: 3 }}>
                {[
                  { id: 'bull', label: 'Bull', handler: fireBull, type: 'bull' as const },
                  { id: 'dbull', label: 'DBull', handler: fireDBull, type: 'dbull' as const },
                  { id: 'miss', label: 'Miss', handler: fireMiss, type: 'miss' as const },
                ].map(({ id, label, handler, type }) => (
                  <button
                    key={id}
                    type="button"
                    style={{ ...specialBtnStyle(type), ...(hov(id) ? numberButtonHover : null) }}
                    onMouseEnter={() => setHoverId(id)}
                    onMouseLeave={() => setHoverId(null)}
                    onFocus={() => setHoverId(id)}
                    onBlur={() => setHoverId(null)}
                    onClick={(e) => handler(e)}
                  >
                    {specialBtnContent(type, label)}
                  </button>
                ))}

                {/* Voice Input Buttons - nur wenn unterstützt */}
                {speechSupported && (
                  <>
                    <button
                      type="button"
                      style={{
                        ...numberButtonStyle,
                        ...(hov('voice-1') ? numberButtonHover : {}),
                        ...(voiceState !== 'idle' && voiceMode === 1 ? {
                          background: voiceState === 'listening' ? '#fef3c7' : '#e0f2fe',
                          borderColor: voiceState === 'listening' ? '#f59e0b' : '#0ea5e9',
                          animation: voiceState === 'listening' ? 'pulse 1.5s infinite' : undefined,
                        } : {}),
                      }}
                      onMouseEnter={() => setHoverId('voice-1')}
                      onMouseLeave={() => setHoverId(null)}
                      onFocus={() => setHoverId('voice-1')}
                      onBlur={() => setHoverId(null)}
                      onClick={() => voiceState === 'idle' ? startVoiceInput(1) : voiceMode === 1 ? cancelVoiceInput() : null}
                      disabled={voiceState !== 'idle' && voiceMode !== 1}
                      title="Spracheingabe: 1 Dart"
                      aria-label="Spracheingabe: 1 Dart"
                    >
                      <DartIcon size={18} />
                    </button>
                    <button
                      type="button"
                      style={{
                        ...numberButtonStyle,
                        ...(hov('voice-3') && canUseThreeDartVoice ? numberButtonHover : {}),
                        ...(voiceState !== 'idle' && voiceMode === 3 ? {
                          background: voiceState === 'listening' ? '#fef3c7' : '#e0f2fe',
                          borderColor: voiceState === 'listening' ? '#f59e0b' : '#0ea5e9',
                          animation: voiceState === 'listening' ? 'pulse 1.5s infinite' : undefined,
                        } : {}),
                        ...(!canUseThreeDartVoice ? { opacity: 0.4, cursor: 'not-allowed' } : {}),
                      }}
                      onMouseEnter={() => setHoverId('voice-3')}
                      onMouseLeave={() => setHoverId(null)}
                      onFocus={() => setHoverId('voice-3')}
                      onBlur={() => setHoverId(null)}
                      onClick={() => canUseThreeDartVoice && voiceState === 'idle' ? startVoiceInput(3) : voiceMode === 3 ? cancelVoiceInput() : null}
                      disabled={!canUseThreeDartVoice || (voiceState !== 'idle' && voiceMode !== 3)}
                      title={canUseThreeDartVoice ? "Spracheingabe: 3 Darts" : "Nicht verfügbar - bereits Darts geworfen"}
                      aria-label={canUseThreeDartVoice ? "Spracheingabe: 3 Darts" : "Nicht verfügbar - bereits Darts geworfen"}
                    >
                      <DartIcon size={16} />
                      <DartIcon size={16} />
                      <DartIcon size={16} />
                    </button>
                  </>
                )}
              </div>
            </>
          )}

          {/* CSS Animations */}
          <style>{`
            @keyframes pulse {
              0%, 100% { opacity: 1; }
              50% { opacity: 0.6; }
            }
            @keyframes dartSlotScaleIn {
              0% { transform: scale(0.5); opacity: 0.3; }
              60% { transform: scale(1.15); }
              100% { transform: scale(1); opacity: 1; }
            }
            .dart-slot-filled {
              animation: dartSlotScaleIn 0.3s ease-out;
            }
            @keyframes numbufBlink {
              0%, 100% { opacity: 1; }
              50% { opacity: 0.4; }
            }
            .numbuf-indicator {
              animation: numbufBlink 0.8s ease-in-out infinite;
            }
          `}</style>

          {/* Voice Status Anzeige */}
          {voiceState !== 'idle' && (
            <div style={{
              textAlign: 'center',
              padding: '10px 12px',
              background: voiceState === 'listening' ? '#fef3c7' : '#e0f2fe',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              color: voiceState === 'listening' ? '#92400e' : '#0369a1',
            }}>
              <div style={{ marginBottom: voiceMode === 3 ? 8 : 0 }}>
                {voiceState === 'listening'
                  ? `Sprechen Sie ${voiceMode === 1 ? 'einen Dart' : 'drei Darts'}...`
                  : 'Verarbeite...'
                }
                <button
                  type="button"
                  onClick={cancelVoiceInput}
                  style={{
                    marginLeft: 12,
                    padding: '4px 8px',
                    background: '#fff',
                    border: '1px solid #e5e7eb',
                    borderRadius: 4,
                    fontSize: 12,
                    cursor: 'pointer',
                  }}
                >
                  Abbrechen
                </button>
              </div>

              {voiceMode === 3 && (
                <>
                  <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginTop: 8 }}>
                    {[0, 1, 2].map((idx) => {
                      const dart = partialDarts[idx]
                      const isRecognized = !!dart
                      return (
                        <div
                          key={idx}
                          style={{
                            padding: '6px 14px',
                            background: isRecognized ? '#fff' : 'transparent',
                            border: isRecognized ? '2px solid #16a34a' : '2px dashed #d1d5db',
                            borderRadius: 8,
                            fontSize: 15,
                            fontWeight: 700,
                            color: isRecognized ? '#15803d' : '#9ca3af',
                            minWidth: 50,
                            transition: 'all 0.2s ease',
                          }}
                        >
                          {isRecognized ? formatDart(dart) : `(${idx + 1})`}
                        </div>
                      )
                    })}
                  </div>
                  {partialDarts.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        if (stopListeningRef.current) {
                          stopListeningRef.current()
                          stopListeningRef.current = null
                        }
                        setPartialDarts([])
                        setTimeout(() => startVoiceInput(3), 100)
                      }}
                      style={{
                        marginTop: 10,
                        padding: '8px 16px',
                        background: '#fff',
                        border: '2px solid #f59e0b',
                        borderRadius: 8,
                        fontSize: 13,
                        fontWeight: 600,
                        color: '#b45309',
                        cursor: 'pointer',
                        transition: 'all 0.15s',
                      }}
                    >
                      Nochmal von vorne
                    </button>
                  )}
                </>
              )}
            </div>
          )}
        </>
      )}

      {/* Mobile Numpad Modus (auch auf PC) */}
      {inputMode === 'mobile' && (
        <MobileScoreInput
          onThrow={onThrow}
          dartsThrown={dartsThrown}
          thrownDarts={thrownDarts}
          onUndoLastDart={onUndoLastDart}
          onUndoLastVisit={onUndoLastVisit}
        />
      )}
    </div>
  )
}
