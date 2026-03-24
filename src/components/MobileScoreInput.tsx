// src/components/MobileScoreInput.tsx
// Compact 4x4 mobile input grid for X01 games
import React, { useState, useRef, useCallback } from 'react'
import type { Bed } from '../darts501'
import { useTheme } from '../ThemeProvider'

type ThrownDart = {
  bed: Bed | 'MISS'
  mult: 1 | 2 | 3
}

type Props = {
  onThrow: (bed: Bed | 'MISS', mult: 1 | 2 | 3) => void
  dartsThrown?: number
  thrownDarts?: ThrownDart[]
  onUndoLastDart?: () => void
  onUndoLastVisit?: () => void
}

function dartLabel(d: ThrownDart): string {
  if (d.bed === 'MISS') return 'Miss'
  if (d.bed === 'BULL') return '25'
  if (d.bed === 'DBULL') return '50'
  const prefix = d.mult === 3 ? 'T' : d.mult === 2 ? 'D' : ''
  return `${prefix}${d.bed}`
}

function dartScore(d: ThrownDart): number {
  if (d.bed === 'MISS') return 0
  if (d.bed === 'BULL') return 25
  if (d.bed === 'DBULL') return 50
  return (d.bed as number) * d.mult
}

export default function MobileScoreInput({ onThrow, dartsThrown = 0, thrownDarts = [], onUndoLastDart, onUndoLastVisit }: Props) {
  const [mult, setMult] = useState<1 | 2 | 3>(1)
  const [teenMode, setTeenMode] = useState(false)
  const teenModeRef = useRef(false) // Sync ref for rapid tapping
  const { colors, isArcade } = useTheme()

  const fire = useCallback((bed: Bed | 'MISS', m: 1 | 2 | 3) => {
    onThrow(bed, m)
    setMult(1) // Reset to Single after each throw
    setTeenMode(false)
    teenModeRef.current = false
  }, [onThrow])

  const handleNumber = useCallback((n: number) => {
    if (teenModeRef.current) {
      // Teen mode: 10 + n
      fire((10 + n) as Bed, mult)
    } else if (n === 0) {
      fire('MISS', 1)
    } else {
      fire(n as Bed, mult)
    }
  }, [fire, mult])

  const handleTeenToggle = useCallback(() => {
    const next = !teenModeRef.current
    teenModeRef.current = next
    setTeenMode(next)
  }, [])

  const handle20 = useCallback(() => {
    fire(20 as Bed, mult)
  }, [fire, mult])

  const handleBull = useCallback(() => {
    if (mult >= 2) {
      fire('DBULL', 1) // Double/Triple Bull = 50
    } else {
      fire('BULL', 1) // Single Bull = 25
    }
  }, [fire, mult])

  const handleMult = useCallback((m: 1 | 2 | 3) => {
    setMult(prev => prev === m ? 1 : m)
  }, [])

  // Colors
  const bg = isArcade ? '#1a1a2e' : '#f8fafc'
  const btnBg = isArcade ? '#2a2a3e' : '#ffffff'
  const btnBorder = isArcade ? '#3a3a5e' : '#d1d5db'
  const btnText = isArcade ? '#e5e7eb' : '#1f2937'
  const activeBg = isArcade ? '#f97316' : '#111827'
  const activeText = isArcade ? '#000' : '#fff'
  const teenBg = isArcade ? '#4a3a1e' : '#fef3c7'
  const teenBorder = isArcade ? '#f59e0b' : '#f59e0b'

  const multColors = {
    1: { bg: isArcade ? '#1e3a5a' : '#dbeafe', border: isArcade ? '#3b82f6' : '#3b82f6', text: isArcade ? '#93c5fd' : '#1d4ed8' },
    2: { bg: isArcade ? '#1a3a1a' : '#dcfce7', border: isArcade ? '#22c55e' : '#22c55e', text: isArcade ? '#86efac' : '#15803d' },
    3: { bg: isArcade ? '#3a1a1a' : '#fee2e2', border: isArcade ? '#ef4444' : '#ef4444', text: isArcade ? '#fca5a5' : '#b91c1c' },
  }

  // Styles
  const gridStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: 4,
    padding: 4,
  }

  const btnBase: React.CSSProperties = {
    height: 52,
    borderRadius: 8,
    border: `1.5px solid ${btnBorder}`,
    background: btnBg,
    color: btnText,
    fontSize: 16,
    fontWeight: 700,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'background .08s, transform .05s',
    WebkitTapHighlightColor: 'transparent',
    userSelect: 'none',
  }

  const teenBtn: React.CSSProperties = {
    ...btnBase,
    background: teenMode ? teenBg : btnBg,
    border: `1.5px solid ${teenMode ? teenBorder : btnBorder}`,
    color: teenMode ? (isArcade ? '#f59e0b' : '#92400e') : btnText,
  }

  const multBtn = (m: 1 | 2 | 3): React.CSSProperties => {
    const active = mult === m
    const c = multColors[m]
    return {
      ...btnBase,
      background: active ? c.bg : btnBg,
      border: `1.5px solid ${active ? c.border : btnBorder}`,
      color: active ? c.text : btnText,
      fontWeight: 800,
    }
  }

  // Dart slots display
  const slots = [0, 1, 2].map(i => thrownDarts?.[i] ?? null)
  const visitScore = thrownDarts?.reduce((sum, d) => sum + dartScore(d), 0) ?? 0

  return (
    <div style={{ background: bg, borderRadius: 12, padding: 6, width: '100%', boxSizing: 'border-box' }}>
      {/* Dart slots + score */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 8px 6px', gap: 8 }}>
        <div style={{ display: 'flex', gap: 4, flex: 1 }}>
          {slots.map((d, i) => (
            <div key={i} style={{
              flex: 1,
              height: 32,
              borderRadius: 6,
              border: `1.5px solid ${d ? (dartScore(d) === 0 ? '#ef4444' : dartScore(d) >= 40 ? '#22c55e' : '#60a5fa') : (isArcade ? '#3a3a5e' : '#e5e7eb')}`,
              background: d ? (isArcade ? '#2a2a3e' : '#f0f9ff') : (isArcade ? '#1a1a2e' : '#f9fafb'),
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 13, fontWeight: 700,
              color: d ? btnText : (isArcade ? '#555' : '#d1d5db'),
            }}>
              {d ? dartLabel(d) : `${i + 1}.`}
            </div>
          ))}
        </div>
        <div style={{
          fontSize: 18, fontWeight: 900,
          color: visitScore > 0 ? (isArcade ? '#f97316' : '#111827') : (isArcade ? '#555' : '#d1d5db'),
          minWidth: 40, textAlign: 'right',
          fontVariantNumeric: 'tabular-nums',
        }}>
          {visitScore > 0 ? visitScore : '–'}
        </div>
      </div>

      {/* Teen mode indicator */}
      {teenMode && (
        <div style={{
          textAlign: 'center', fontSize: 12, fontWeight: 700,
          color: isArcade ? '#f59e0b' : '#92400e',
          padding: '2px 0',
        }}>
          10+ → Tippe 0–9
        </div>
      )}

      {/* 4x4 Grid */}
      <div style={gridStyle}>
        {/* Row 1: 1, 2, 3, S */}
        <button style={btnBase} onClick={() => handleNumber(1)}>
          {teenMode ? '11' : '1'}
        </button>
        <button style={btnBase} onClick={() => handleNumber(2)}>
          {teenMode ? '12' : '2'}
        </button>
        <button style={btnBase} onClick={() => handleNumber(3)}>
          {teenMode ? '13' : '3'}
        </button>
        <button style={multBtn(1)} onClick={() => handleMult(1)}>S</button>

        {/* Row 2: 4, 5, 6, D */}
        <button style={btnBase} onClick={() => handleNumber(4)}>
          {teenMode ? '14' : '4'}
        </button>
        <button style={btnBase} onClick={() => handleNumber(5)}>
          {teenMode ? '15' : '5'}
        </button>
        <button style={btnBase} onClick={() => handleNumber(6)}>
          {teenMode ? '16' : '6'}
        </button>
        <button style={multBtn(2)} onClick={() => handleMult(2)}>D</button>

        {/* Row 3: 7, 8, 9, T */}
        <button style={btnBase} onClick={() => handleNumber(7)}>
          {teenMode ? '17' : '7'}
        </button>
        <button style={btnBase} onClick={() => handleNumber(8)}>
          {teenMode ? '18' : '8'}
        </button>
        <button style={btnBase} onClick={() => handleNumber(9)}>
          {teenMode ? '19' : '9'}
        </button>
        <button style={multBtn(3)} onClick={() => handleMult(3)}>T</button>

        {/* Row 4: 1X, 0, 20, B */}
        <button style={teenBtn} onClick={handleTeenToggle}>
          1+
        </button>
        <button style={btnBase} onClick={() => handleNumber(0)}>
          {teenMode ? '10' : '0'}
        </button>
        <button style={btnBase} onClick={handle20}>
          20
        </button>
        <button style={{
          ...btnBase,
          background: isArcade ? '#2e1a1a' : '#fef2f2',
          border: `1.5px solid ${isArcade ? '#dc2626' : '#fca5a5'}`,
          color: isArcade ? '#fca5a5' : '#991b1b',
        }} onClick={handleBull}>
          B
        </button>
      </div>

      {/* Undo buttons */}
      <div style={{ display: 'flex', gap: 4, padding: '6px 4px 2px' }}>
        <button
          style={{
            ...btnBase,
            flex: 1,
            height: 38,
            fontSize: 12,
            opacity: dartsThrown > 0 ? 1 : 0.4,
          }}
          onClick={onUndoLastDart}
          disabled={dartsThrown === 0}
        >
          ↩ Letzter Wurf
        </button>
        <button
          style={{
            ...btnBase,
            flex: 1,
            height: 38,
            fontSize: 12,
            opacity: dartsThrown === 0 ? 1 : 0.4,
          }}
          onClick={onUndoLastVisit}
          disabled={dartsThrown > 0}
        >
          ↩ Letzte Aufnahme
        </button>
      </div>
    </div>
  )
}
