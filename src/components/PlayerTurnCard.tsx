import React from 'react'
import { ui } from '../ui'

export type Visit = { darts: number[]; score: number }

export default function PlayerTurnCard({
  name,
  color,
  remaining,
  currentDarts,
  lastVisit,
  flashScore,
  isActive,
}: {
  name: string
  color?: string
  remaining: number
  currentDarts: number[]         // 0..3 Einträge, z.B. [20, 20] oder [60, 20, 20] (wenn du T20 als 60 lieferst)
  lastVisit?: Visit | null
  flashScore?: number | null     // z.B. 100 -> Overlay zeigt kurz „100“
  isActive: boolean
}) {
  const s: Record<string, React.CSSProperties> = {
    card: { position: 'relative', ...(ui.card as any), padding: 14, borderColor: isActive ? '#0ea5e9' : '#e5e7eb' },
    header: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 },
    dot: { width: 10, height: 10, borderRadius: 999, background: color || '#777', boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.15)' },
    name: { fontWeight: 800 },
    body: { display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 12, alignItems: 'stretch' },
    col: { display: 'grid', gap: 6, alignContent: 'start' },
    colTitle: { fontSize: 12, opacity: 0.7, fontWeight: 600 },
    dartBubble: {
      border: '1px solid #e5e7eb',
      borderRadius: 10,
      padding: '6px 8px',
      minWidth: 42,
      textAlign: 'center',
      fontWeight: 700,
      background: '#fff',
    },
    remainingWrap: { display: 'grid', justifyItems: 'center', alignContent: 'center', gap: 4, padding: '0 6px' },
    remainingLabel: { fontSize: 12, opacity: 0.7 },
    remainingValue: { fontSize: 28, fontWeight: 800 },
    flashWrap: {
      position: 'absolute', inset: 0, pointerEvents: 'none',
      display: 'grid', placeItems: 'center',
    },
    flash: {
      fontSize: 36, fontWeight: 900,
      background: 'rgba(255,255,255,0.9)',
      border: '1px solid #e5e7eb',
      borderRadius: 14,
      padding: '6px 16px',
      animation: flashScore ? 'scoreFlash 1.1s ease-out forwards' as any : undefined,
      boxShadow: '0 10px 30px rgba(0,0,0,0.15)',
    },
    lastVisitMeta: { fontSize: 12, opacity: 0.7 },
  }

  const paddedCurrent = [currentDarts[0], currentDarts[1], currentDarts[2]].map((v) => (v ?? null))
  const last = lastVisit?.darts ?? []

  return (
    <div style={s.card}>
      {/* Kopf */}
      <div style={s.header}>
        <span style={s.dot} />
        <div style={s.name}>{name}</div>
        {isActive && <div style={{ ...ui.pill, marginLeft: 'auto', borderColor: '#0ea5e9', color: '#0369a1' }}>am Zug</div>}
      </div>

      {/* Inhalt */}
      <div style={s.body}>
        {/* Links: aktuelle drei Darts (untereinander) */}
        <div style={s.col}>
          <div style={s.colTitle}>Aktuelle Würfe</div>
          {paddedCurrent.map((v, i) => (
            <div key={i} style={s.dartBubble}>{v ?? '—'}</div>
          ))}
        </div>

        {/* Mitte: Rest */}
        <div style={s.remainingWrap}>
          <div style={s.remainingLabel}>Verbleibend</div>
          <div style={s.remainingValue}>{remaining}</div>
        </div>

        {/* Rechts: letzte Aufnahme */}
        <div style={s.col}>
          <div style={s.colTitle}>Letzte Aufnahme</div>
          <div style={{ display: 'grid', gap: 6 }}>
            <div style={{ display: 'flex', gap: 6 }}>
              <div style={s.dartBubble}>{last[0] ?? '—'}</div>
              <div style={s.dartBubble}>{last[1] ?? '—'}</div>
              <div style={s.dartBubble}>{last[2] ?? '—'}</div>
            </div>
            <div style={s.lastVisitMeta}>Summe: <b>{lastVisit?.score ?? 0}</b></div>
          </div>
        </div>
      </div>

      {/* Flash Overlay */}
      {typeof flashScore === 'number' && (
        <div style={s.flashWrap}>
          <div className="scoreFlash" style={s.flash}>{flashScore}</div>
        </div>
      )}
    </div>
  )
}
