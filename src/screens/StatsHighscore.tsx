// src/screens/StatsHighscore.tsx

import React, { useMemo, useState } from 'react'
import { loadLeaderboards, type Leaderboards } from '../storage'

type Props = {
  onOpenMatch?: (matchId: string) => void
}

type HighKey = 'highVisits' | 'highCheckouts' | 'bestLegs' | 'bestCheckoutPct'
type LowKey  = 'worstLegs' | 'worstCheckoutPct'

const HIGH_CATEGORIES: { key: HighKey; label: string; hint: string }[] = [
  { key: 'highVisits',       label: 'Höchste Aufnahme',         hint: 'Max. Visit-Score' },
  { key: 'highCheckouts',    label: 'Höchstes Checkout',        hint: 'Größtes Finish' },
  { key: 'bestLegs',         label: 'Bestes Leg (Darts)',       hint: 'Wenigste Darts bis Finish' },
  { key: 'bestCheckoutPct',  label: 'Beste Checkout-Quote',     hint: 'Höchste % mit Versuchen > 0' },
]

const LOW_CATEGORIES: { key: LowKey; label: string; hint: string }[] = [
  { key: 'worstLegs',        label: 'Schlechtestes Leg (Darts)', hint: 'Meiste Darts bis Finish' },
  { key: 'worstCheckoutPct', label: 'Schlechteste Checkout-Quote', hint: 'Niedrigste % (Versuche > 0)' },
]

function formatValue(catKey: string, entry: any): string {
  switch (catKey) {
    case 'highVisits':
    case 'highCheckouts':
      return String(entry.value) // Punkte
    case 'bestLegs':
    case 'worstLegs':
      return `${entry.darts} Darts`
    case 'bestCheckoutPct':
    case 'worstCheckoutPct':
      return `${entry.value.toFixed(1)}% (${entry.made}/${entry.attempts})`
    default:
      return '-'
  }
}

function formatDate(ts?: string): string {
  if (!ts) return ''
  try {
    return new Date(ts).toLocaleString()
  } catch {
    return ts
  }
}

export default function StatsHighscore({ onOpenMatch }: Props) {
  const lb: Leaderboards = useMemo(() => loadLeaderboards(), [])
  const [mode, setMode] = useState<'high' | 'low'>('high')
  const [idx, setIdx] = useState(0)

  const cats = mode === 'high' ? HIGH_CATEGORIES : LOW_CATEGORIES
  const current = cats[(idx + cats.length) % cats.length]

  const items = useMemo(() => {
    const list = (lb as any)[current.key] as any[] | undefined
    return (list ?? []).slice(0, 10)
  }, [lb, current.key])

  const goPrev = () => setIdx((i) => (i - 1 + cats.length) % cats.length)
  const goNext = () => setIdx((i) => (i + 1) % cats.length)
  const toggleMode = () => {
    const newMode = mode === 'high' ? 'low' : 'high'
    setMode(newMode)
    setIdx(0)
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {/* Header / Steuerung */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={goPrev} aria-label="Zurück">↩</button>
          <div>
            <div style={{ fontWeight: 700, fontSize: 18, lineHeight: 1 }}>
              {current.label} <span style={{ opacity: 0.6, fontWeight: 400 }}>({mode === 'high' ? 'High' : 'Low'})</span>
            </div>
            <div style={{ fontSize: 12, opacity: 0.7 }}>{current.hint}</div>
          </div>
          <button onClick={goNext} aria-label="Weiter">↪</button>
        </div>

        <button onClick={toggleMode}>
          {mode === 'high' ? 'Low anzeigen' : 'High anzeigen'}
        </button>
      </div>

      {/* Liste */}
      <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '40px 1fr 140px 120px 110px', gap: 0, padding: '8px 10px', background: '#f8fafc', fontWeight: 600 }}>
          <div>#</div>
          <div>Spieler</div>
          <div>Wert</div>
          <div>Datum</div>
          <div>Aktion</div>
        </div>

        {items.length === 0 && (
          <div style={{ padding: 12, opacity: 0.7 }}>Noch keine Einträge.</div>
        )}

        {items.map((e, i) => (
          <div
            key={`${current.key}-${i}-${e.matchId ?? i}`}
            style={{
              display: 'grid',
              gridTemplateColumns: '40px 1fr 140px 120px 110px',
              gap: 0,
              padding: '8px 10px',
              borderTop: '1px solid #eef2f7',
              alignItems: 'center'
            }}
          >
            <div style={{ opacity: 0.7 }}>{i + 1}</div>
            <div>{e.playerName ?? e.playerId ?? '–'}</div>
            <div style={{ fontWeight: 600 }}>{formatValue(current.key, e)}</div>
            <div style={{ fontSize: 12, opacity: 0.8 }}>{formatDate(e.ts)}</div>
            <div>
              <button
                onClick={() => onOpenMatch && e.matchId && onOpenMatch(e.matchId)}
                disabled={!onOpenMatch || !e.matchId}
                title={e.matchId ? `Match #${e.matchId} öffnen` : 'Kein Match verknüpft'}
              >
                Match öffnen
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Mini-Hinweis */}
      <div style={{ fontSize: 12, opacity: 0.65 }}>
        Hinweis: Diese Listen werden beim Match-Ende inkrementell aktualisiert. Für einen kompletten Neuaufbau kannst du
        intern <code>rebuildLeaderboards()</code> verwenden.
      </div>
    </div>
  )
}
