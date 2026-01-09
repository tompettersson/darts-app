import React, { useEffect, useMemo, useState } from 'react'
import { CricketTarget } from '../../types/cricket'

export type Mult = 1|2|3


export type CricketPlayerCol = {
  id: string
  name: string
  color?: string
  /** Gesamtscore (Standard: eigene Punkte; Cutthroat: kassierte Punkte) */
  totalPoints: number
  /** Marks je Target: 0..n (n>3 = geschlossen + Überschuss) */
  marks: Record<CricketTarget, number | undefined>
  /** Punkte auf diesem Target (nur Informationsanzeige) */
  pointsOnTarget?: Record<CricketTarget, number | undefined>
}

type Props = {
  /** Reihenfolge ist auch die Spielreihenfolge */
  players: CricketPlayerCol[]
  /** Aktiver Spieler zur Hervorhebung */
  activePlayerId?: string
  /** Targets, z.B. [20,19,18,17,16,15,'BULL'] oder [20..10,'BULL'] */
  targets: CricketTarget[]
  /** Klick auf die Mittelsäule (Zahl/Bull) mit aktuellem Mult */
  onThrow: (bed: Exclude<CricketTarget, 10|11|12|13|14> | number, mult: Mult) => void
  /** Optional: Label über den Totals (z. B. "Punkte" / "Gegnerpunkte") */
  totalLabel?: string
}

/** Marks -> Symbol-Darstellung: 0='', 1='•', 2='×', 3+='Ⓧ' */
function markSymbol(m: number | undefined) {
  const v = Math.max(0, Math.floor(m ?? 0))
  if (v <= 0) return ''
  if (v === 1) return '•'
  if (v === 2) return '×'
  return 'Ⓧ'
}

export default function CricketScoreSheet({
  players, activePlayerId, targets, onThrow, totalLabel = 'Punkte',
}: Props) {
  const [mult, setMult] = useState<Mult>(1) // S=1 default

  // Tastaturkürzel: S/D/T
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      const tag = (t?.tagName || '').toLowerCase()
      if (tag === 'input' || tag === 'textarea' || (t as any)?.isContentEditable) return
      const k = e.key.toLowerCase()
      if (k === 's') { setMult(1); e.preventDefault() }
      else if (k === 'd') { setMult(2); e.preventDefault() }
      else if (k === 't') { setMult(3); e.preventDefault() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Spieler links/rechts abwechselnd verteilen (1–8)
  const { left, right } = useMemo(() => {
    const L: CricketPlayerCol[] = []
    const R: CricketPlayerCol[] = []
    players.forEach((p, i) => (i % 2 === 0 ? L : R).push(p))
    return { left: L, right: R }
  }, [players])

  const s = styles

  return (
    <div style={s.wrap}>
      {/* Kopf: Moduswahl + Legende */}
      <div style={s.topBar}>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" style={buttonMode(mult === 1)} onClick={() => setMult(1)}>
            Single <span style={s.hint}>(S)</span>
          </button>
          <button type="button" style={buttonMode(mult === 2)} onClick={() => setMult(2)}>
            Double <span style={s.hint}>(D)</span>
          </button>
          <button type="button" style={buttonMode(mult === 3)} onClick={() => setMult(3)}>
            Triple <span style={s.hint}>(T)</span>
          </button>
        </div>
        <div style={s.legend}>
          <span>• = 1</span>
          <span>× = 2</span>
          <span>Ⓧ = 3+</span>
        </div>
      </div>

      <div style={s.sheet}>
        {/* Linke Spielerspalten */}
        {left.map(p => (
          <div key={p.id} style={colStyle(p.id === activePlayerId, p.color)}>
            <div style={s.colHeader}>
              <span style={{ ...s.dot, background: p.color || '#6b7280' }} />
              <div style={s.name} title={p.name}>{p.name}</div>
              <div style={s.totalLabel}>{totalLabel}</div>
              <div style={s.totalVal}>{p.totalPoints}</div>
            </div>
            {targets.map(t => (
              <div key={String(t)} style={s.rowCell}>
                <div style={s.markCell}>{markSymbol(p.marks[t])}</div>
                <div style={s.pointsCell}>{p.pointsOnTarget?.[t] ?? ''}</div>
              </div>
            ))}
          </div>
        ))}

        {/* Mittlere Zielspalte */}
        <div style={s.centerCol}>
          <div style={s.centerHeader}>CRICKET</div>
          {targets.map(t => (
            <button
              key={String(t)}
              type="button"
              style={s.centerBtn}
              onClick={() => onThrow(t === 'BULL' ? 'BULL' : (t as number), mult)}
            >
              {t === 'BULL' ? 'BULL' : t}
            </button>
          ))}
        </div>

        {/* Rechte Spielerspalten */}
        {right.map(p => (
          <div key={p.id} style={colStyle(p.id === activePlayerId, p.color)}>
            <div style={s.colHeader}>
              <span style={{ ...s.dot, background: p.color || '#6b7280' }} />
              <div style={s.name} title={p.name}>{p.name}</div>
              <div style={s.totalLabel}>{totalLabel}</div>
              <div style={s.totalVal}>{p.totalPoints}</div>
            </div>
            {targets.map(t => (
              <div key={String(t)} style={s.rowCell}>
                <div style={s.markCell}>{markSymbol(p.marks[t])}</div>
                <div style={s.pointsCell}>{p.pointsOnTarget?.[t] ?? ''}</div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

/* ---------- Styles (inline, clean, kein Layout-Shift) ---------- */

const styles: Record<string, React.CSSProperties> = {
  wrap: { display: 'grid', gap: 12 },
  topBar: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    gap: 12, padding: '8px 0',
  },
  hint: { fontSize: 11, opacity: 0.65, marginLeft: 6 },
  legend: { display: 'flex', gap: 14, fontSize: 12, opacity: 0.75 },
  sheet: {
    display: 'grid',
    gridAutoFlow: 'column',
    alignItems: 'start',
    gap: 12,
  },
  centerCol: {
    display: 'grid',
    gap: 8,
    justifyItems: 'center',
    padding: '0 10px',
    borderLeft: '1px solid #e5e7eb',
    borderRight: '1px solid #e5e7eb',
  },
  centerHeader: {
    fontSize: 12, opacity: 0.7, fontWeight: 700, marginBottom: 2, letterSpacing: 1,
  },
  centerBtn: {
    width: 80, padding: '8px 0',
    borderRadius: 10,
    border: '1px solid #e5e7eb',
    background: '#fff',
    fontWeight: 800,
    cursor: 'pointer',
    transition: 'background .12s, border-color .12s, box-shadow .12s',
  } as React.CSSProperties,
  colHeader: {
    display: 'grid',
    gridTemplateColumns: '14px 1fr auto auto',
    alignItems: 'center',
    gap: 8,
    padding: '6px 8px',
    borderRadius: 10,
    background: '#f8fafc',
    border: '1px solid #e5e7eb',
    marginBottom: 6,
  },
  name: { fontWeight: 800, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  totalLabel: { fontSize: 11, opacity: 0.65, textAlign: 'right' },
  totalVal: { fontWeight: 900, fontVariantNumeric: 'tabular-nums', minWidth: 28, textAlign: 'right' },
  dot: { width: 10, height: 10, borderRadius: 999, boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.12)' },
  rowCell: {
    display: 'grid',
    gridTemplateColumns: '32px 38px', // links Marks, rechts Punkte
    alignItems: 'center',
    gap: 6,
    padding: '6px 8px',
    borderRadius: 10,
    border: '1px solid #e5e7eb',
    background: '#fff',
    fontWeight: 800,
  },
  markCell: { textAlign: 'center', fontSize: 18 },
  pointsCell: { textAlign: 'right', fontVariantNumeric: 'tabular-nums', minWidth: 18 },
}

function colStyle(active: boolean, color?: string): React.CSSProperties {
  return {
    display: 'grid',
    gap: 8,
    minWidth: 180,
    borderRadius: 14,
    padding: 4,
    border: `1px solid ${active ? '#0ea5e9' : '#ffffff00'}`,
    boxShadow: active ? '0 0 0 3px rgba(14,165,233,0.12)' : 'none',
  }
}

function buttonMode(active: boolean): React.CSSProperties {
  return {
    padding: '8px 12px',
    borderRadius: 8,
    border: active ? '1px solid #0ea5e9' : '1px solid #e5e7eb',
    background: active ? '#e0f2fe' : '#fff',
    color: active ? '#0369a1' : '#111827',
    cursor: 'pointer',
    fontWeight: 700,
    lineHeight: 1.2,
    transition: 'background .15s, border-color .15s, color .15s, box-shadow .15s',
    boxShadow: active ? '0 0 0 3px rgba(14,165,233,0.15)' : 'none',
  }

  

}
