// src/screens/MatchHistory.tsx
import React, { useMemo, useState } from 'react'
import { ui } from '../ui'
import {
  getMatches,
  getCricketMatches,
  type StoredMatch,
  type CricketStoredMatch,
} from '../storage'

type Props = {
  onBack: () => void
  onOpenX01Match: (matchId: string) => void
  onOpenCricketMatch: (matchId: string) => void
}

type Filter = 'all' | 'x01' | 'cricket'

function fmtWhen(s?: string) {
  return s ? new Date(s).toLocaleString() : '—'
}

function safeTsFromMatch(m: { createdAt?: string; events?: any[] }) {
  const ts = m.createdAt
  if (ts) return ts
  const ev0 = Array.isArray(m.events) ? m.events[0] : undefined
  return ev0?.ts ?? ''
}

function isFinishedX01(m: StoredMatch) {
  if (m.finished) return true
  return (m.events as any[])?.some((e) => e?.type === 'MatchFinished')
}

function isFinishedCricket(m: CricketStoredMatch) {
  if (m.finished) return true
  return (m.events as any[])?.some((e) => e?.type === 'CricketMatchFinished')
}

export default function MatchHistory({ onBack, onOpenX01Match, onOpenCricketMatch }: Props) {
  const [filter, setFilter] = useState<Filter>('all')

  const x01 = useMemo(() => getMatches(), [])
  const cricket = useMemo(() => getCricketMatches(), [])

  const items = useMemo(() => {
    const x01Items = x01.map((m) => ({
      kind: 'x01' as const,
      id: m.id,
      title: m.title,
      createdAt: safeTsFromMatch(m),
      finished: isFinishedX01(m),
      raw: m,
    }))

    const cricketItems = cricket.map((m) => ({
      kind: 'cricket' as const,
      id: m.id,
      title: m.title,
      createdAt: safeTsFromMatch(m),
      finished: isFinishedCricket(m),
      raw: m,
    }))

    let merged = [...x01Items, ...cricketItems]

    if (filter === 'x01') merged = merged.filter((x) => x.kind === 'x01')
    if (filter === 'cricket') merged = merged.filter((x) => x.kind === 'cricket')

    merged.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
    return merged
  }, [x01, cricket, filter])

  return (
    <div style={ui.page}>
      <div style={ui.headerRow}>
        <h2 style={{ margin: 0 }}>Matchhistorie</h2>
        <button style={ui.backBtn} onClick={onBack}>
          ← Zurück
        </button>
      </div>

      {/* Filter */}
      <div style={ui.card}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontWeight: 700 }}>Filter:</span>

          {(['all', 'x01', 'cricket'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                height: 36,
                borderRadius: 999,
                border: '1px solid ' + (filter === f ? '#0ea5e9' : '#e5e7eb'),
                background: filter === f ? '#e0f2fe' : '#fff',
                color: filter === f ? '#0369a1' : '#0f172a',
                padding: '0 12px',
                cursor: 'pointer',
                fontWeight: 800,
              }}
            >
              {f === 'all' ? 'Alle' : f === 'x01' ? 'X01' : 'Cricket'}
            </button>
          ))}
        </div>

        <div style={{ ...ui.sub, marginTop: 8 }}>
          {items.length} Match{items.length === 1 ? '' : 'es'} gefunden.
        </div>
      </div>

      {/* Liste */}
      <div style={{ display: 'grid', gap: 10 }}>
        {items.length === 0 ? (
          <div style={ui.card}>
            <div style={{ opacity: 0.75 }}>Keine Matches im aktuellen Filter.</div>
          </div>
        ) : (
          items.map((m) => (
            <div key={`${m.kind}:${m.id}`} style={ui.card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontWeight: 900 }}>
                    {m.title}{' '}
                    <span style={{ fontWeight: 800, opacity: 0.7 }}>
                      · {m.kind === 'x01' ? 'X01' : 'Cricket'}
                    </span>
                  </div>
                  <div style={ui.sub}>
                    {fmtWhen(m.createdAt)} · {m.finished ? 'beendet' : 'offen'}
                  </div>
                </div>

                <button
                  style={ui.backBtn}
                  onClick={() => {
                    if (m.kind === 'x01') onOpenX01Match(m.id)
                    else onOpenCricketMatch(m.id)
                  }}
                >
                  Öffnen →
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
