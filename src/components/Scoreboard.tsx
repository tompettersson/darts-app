// src/components/Scoreboard.tsx
import React, { useState, useEffect } from 'react'
import type { Bed } from '../darts501'

type Props = {
  onThrow: (bed: Bed | 'MISS', mult: 1 | 2 | 3) => void
}

export default function Scoreboard({ onThrow }: Props) {
  const [mult, setMult] = useState<1 | 2 | 3>(1) // 1=Single (default)

  // Tastatur-Shortcuts: S=Single / D=Double / T=Triple
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      const tag = (t?.tagName || '').toLowerCase()
      const typing = tag === 'input' || tag === 'textarea' || (t as any)?.isContentEditable
      if (typing) return
      const k = e.key.toLowerCase()
      if (k === 's') { setMult(1); e.preventDefault() }
      if (k === 'd') { setMult(2); e.preventDefault() }
      if (k === 't') { setMult(3); e.preventDefault() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const isSelected = (m: 1 | 2 | 3) => mult === m

  // ——— Styles: fein, aber gleiche Maße/Grids wie vorher ———
  const modeButtonStyle = (active: boolean): React.CSSProperties => ({
    padding: '10px 12px',
    borderRadius: 8,
    border: active ? '1px solid #0ea5e9' : '1px solid #e5e7eb',
    background: active ? '#e0f2fe' : '#fff',
    color: active ? '#0369a1' : '#111827',
    cursor: 'pointer',
    fontWeight: 700,
    lineHeight: 1.2,
    transition: 'background .15s, border-color .15s, color .15s, box-shadow .15s',
    boxShadow: active ? '0 0 0 3px rgba(14,165,233,0.15)' : 'none',
  })

  const numberButtonStyle: React.CSSProperties = {
    padding: '10px 0',
    borderRadius: 8,
    border: '1px solid #e5e7eb',
    background: '#fff',
    cursor: 'pointer',
    fontWeight: 700,
    lineHeight: 1.2,
    textAlign: 'center',
    transition: 'background .12s, border-color .12s, box-shadow .12s',
  }

  const numberButtonHover: React.CSSProperties = {
    borderColor: '#0ea5e9',
    boxShadow: '0 0 0 3px rgba(14,165,233,0.10)',
    background: '#f8fafc',
  }

  const rowStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(5, 1fr)',
    gap: 8,
  }

  const [hoverId, setHoverId] = useState<string | null>(null)
  const hov = (id: string) => hoverId === id

  const fireNumber = (n: number) => {
    onThrow(n as Bed, mult)
    if (mult !== 1) setMult(1)
  }
  const fireBull = () => { onThrow('BULL' as Bed, 1); if (mult !== 1) setMult(1) }
  const fireDBull = () => { onThrow('DBULL' as Bed, 1); if (mult !== 1) setMult(1) }
  const fireMiss = () => { onThrow('MISS', 1); if (mult !== 1) setMult(1) }

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {/* Moduswahl */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, max-content)', gap: 8 }}>
        <button type="button" style={modeButtonStyle(isSelected(1))} onClick={() => setMult(1)}>
          Single <span style={{ fontSize: 12, opacity: 0.7 }}>(S)</span>
        </button>
        <button type="button" style={modeButtonStyle(isSelected(2))} onClick={() => setMult(2)}>
          Double <span style={{ fontSize: 12, opacity: 0.7 }}>(D)</span>
        </button>
        <button type="button" style={modeButtonStyle(isSelected(3))} onClick={() => setMult(3)}>
          Triple <span style={{ fontSize: 12, opacity: 0.7 }}>(T)</span>
        </button>
        <div style={{ alignSelf: 'center', fontSize: 12, color: '#6b7280' }}>
          (BULL/DBULL ignorieren den Modus)
        </div>
      </div>

      {/* Zahlen 1–20 in 4 Reihen (gleiches Grid) */}
      <div style={rowStyle}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            style={{ ...numberButtonStyle, ...(hov(`n-${n}`) ? numberButtonHover : null) }}
            onMouseEnter={() => setHoverId(`n-${n}`)}
            onMouseLeave={() => setHoverId(null)}
            onFocus={() => setHoverId(`n-${n}`)}
            onBlur={() => setHoverId(null)}
            onClick={() => fireNumber(n)}
          >
            {n}
          </button>
        ))}
      </div>
      <div style={rowStyle}>
        {[6, 7, 8, 9, 10].map((n) => (
          <button
            key={n}
            type="button"
            style={{ ...numberButtonStyle, ...(hov(`n-${n}`) ? numberButtonHover : null) }}
            onMouseEnter={() => setHoverId(`n-${n}`)}
            onMouseLeave={() => setHoverId(null)}
            onFocus={() => setHoverId(`n-${n}`)}
            onBlur={() => setHoverId(null)}
            onClick={() => fireNumber(n)}
          >
            {n}
          </button>
        ))}
      </div>
      <div style={rowStyle}>
        {[11, 12, 13, 14, 15].map((n) => (
          <button
            key={n}
            type="button"
            style={{ ...numberButtonStyle, ...(hov(`n-${n}`) ? numberButtonHover : null) }}
            onMouseEnter={() => setHoverId(`n-${n}`)}
            onMouseLeave={() => setHoverId(null)}
            onFocus={() => setHoverId(`n-${n}`)}
            onBlur={() => setHoverId(null)}
            onClick={() => fireNumber(n)}
          >
            {n}
          </button>
        ))}
      </div>
      <div style={rowStyle}>
        {[16, 17, 18, 19, 20].map((n) => (
          <button
            key={n}
            type="button"
            style={{ ...numberButtonStyle, ...(hov(`n-${n}`) ? numberButtonHover : null) }}
            onMouseEnter={() => setHoverId(`n-${n}`)}
            onMouseLeave={() => setHoverId(null)}
            onFocus={() => setHoverId(`n-${n}`)}
            onBlur={() => setHoverId(null)}
            onClick={() => fireNumber(n)}
          >
            {n}
          </button>
        ))}
      </div>

      {/* Bull / DBull / Miss */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
        {[
          { id: 'bull', label: 'BULL (25)', onClick: fireBull },
          { id: 'dbull', label: 'DBULL (50)', onClick: fireDBull },
          { id: 'miss', label: 'MISS', onClick: fireMiss },
        ].map(({ id, label, onClick }) => (
          <button
            key={id}
            type="button"
            style={{ ...numberButtonStyle, ...(hov(id) ? numberButtonHover : null) }}
            onMouseEnter={() => setHoverId(id)}
            onMouseLeave={() => setHoverId(null)}
            onFocus={() => setHoverId(id)}
            onBlur={() => setHoverId(null)}
            onClick={onClick}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}
