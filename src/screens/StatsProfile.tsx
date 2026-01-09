// src/screens/StatsProfile.tsx
import React, { useEffect, useMemo, useState } from 'react'
import {
  getProfiles,
  getFinishedMatches,
  aggregatePlayerStats,
  type Profile,
} from '../storage'
import { computeStats, type DartsEvent, type MatchStarted } from '../darts501'

export default function StatsProfile({
  onOpenMatch,
}: {
  onOpenMatch?: (matchId: string) => void
}) {
  const [profiles, setProfiles] = useState<Profile[]>(() => getProfiles())
  const [search, setSearch] = useState('')
  const [cursor, setCursor] = useState(0)
  const [hoverMatch, setHoverMatch] = useState<string | null>(null)

  useEffect(() => {
    const list = getProfiles()
    setProfiles(list)
    if (cursor >= list.length) setCursor(0)
  }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const list = !q ? profiles : profiles.filter(p => p.name.toLowerCase().includes(q))
    if (cursor >= list.length && list.length > 0) setCursor(0)
    return list
  }, [profiles, search])

  const selected: Profile | undefined = filtered[cursor]

  const finished = useMemo(() => getFinishedMatches(), [])
  const aggregates = useMemo(() => aggregatePlayerStats(finished), [finished])
  const selectedAgg = selected ? aggregates[selected.id] : undefined

  type PerMatchRow = {
    matchId: string
    date: string
    title: string
    opponents: string[]
    threeDartAvg: number
    doublePct: number
    doubleAttempts: number
    doubleHits: number
    highestCheckout: number
    result?: 'W' | 'L'
  }

  const perMatch: PerMatchRow[] = useMemo(() => {
    if (!selected) return []
    const rows: PerMatchRow[] = []
    for (const m of finished) {
      if (!m.finished) continue
      if (!m.playerIds.includes(selected.id)) continue

      const events = m.events as DartsEvent[]
      const start = events.find(e => (e as any).type === 'MatchStarted') as MatchStarted | undefined
      if (!start) continue

      const stats = computeStats(events)
      const ps = stats[selected.id]
      if (!ps) continue

      const opp = start.players
        .filter(p => p.playerId !== selected.id)
        .map(p => p.name ?? p.playerId)

      const mf = events.find(e => (e as any).type === 'MatchFinished') as any
      const result: 'W' | 'L' | undefined = mf?.winnerPlayerId
        ? (mf.winnerPlayerId === selected.id ? 'W' : 'L')
        : undefined

      rows.push({
        matchId: m.id,
        date: new Date(m.createdAt || Date.now()).toLocaleDateString(),
        title: m.title || 'Match',
        opponents: opp,
        threeDartAvg: ps.threeDartAvg ?? 0,
        doublePct: ps.doublePctDart ?? 0,
        doubleAttempts: ps.doubleAttemptsDart ?? 0,
        doubleHits: ps.doublesHitDart ?? 0,
        highestCheckout: ps.highestCheckout ?? 0,
        result,
      })
    }
    return rows.sort((a, b) => (a.matchId < b.matchId ? 1 : -1))
  }, [finished, selected])

  // ——— minimal, flache Styles ———
  const s = {
    shell: { maxWidth: 960, margin: '0 auto', padding: '16px 16px 40px', background: 'transparent' } as React.CSSProperties,

    section: { marginBottom: 16 } as React.CSSProperties,

    inputRow: { display: 'flex', gap: 8, alignItems: 'center' } as React.CSSProperties,
    input: { flex: 1, padding: '10px 12px', borderRadius: 6, border: '1px solid #E5E7EB', outline: 'none', fontSize: 14, background: '#fff' } as React.CSSProperties,

    list: { display: 'flex', flexDirection: 'column', gap: 8 } as React.CSSProperties,
    row: {
      display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px',
      borderRadius: 6, background: '#fff', border: '1px solid #E5E7EB', cursor: 'pointer',
    } as React.CSSProperties,
    rowActive: { borderColor: '#111', background: 'rgba(17,17,17,0.03)' } as React.CSSProperties,

    nameWrap: { display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 } as React.CSSProperties,
    colorDot: (color?: string) => ({ width: 10, height: 10, borderRadius: 9999, background: color || '#777' }) as React.CSSProperties,
    truncate: { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: 600 } as React.CSSProperties,
    meta: { fontSize: 12, color: '#6B7280' } as React.CSSProperties,
    muted: { fontSize: 13, color: '#6B7280', textAlign: 'center' } as React.CSSProperties,

    navBar: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, margin: '8px 0 4px' } as React.CSSProperties,
    navBtn: { padding: '4px 10px', borderRadius: 6, border: '1px solid #E5E7EB', background: '#fff', cursor: 'pointer' } as React.CSSProperties,
    titleInline: { display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 } as React.CSSProperties,
    playerName: { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: 18, fontWeight: 700 } as React.CSSProperties,

    kpiGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 8 } as React.CSSProperties,
    kpiCard: { border: '1px solid #E5E7EB', borderRadius: 6, padding: '12px', background: '#fff', display: 'flex', flexDirection: 'column', gap: 2 } as React.CSSProperties,
    kpiLabel: { fontSize: 12, color: '#6B7280' } as React.CSSProperties,
    kpiVal: { fontSize: 18, fontWeight: 700 } as React.CSSProperties,

    matches: { display: 'flex', flexDirection: 'column', gap: 8 } as React.CSSProperties,
    matchRow: {
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
      padding: '12px', borderRadius: 6, border: '1px solid #E5E7EB', background: '#fff',
      cursor: 'pointer', transition: 'border-color .12s, background .12s',
    } as React.CSSProperties,
    matchRowHover: { borderColor: '#111', background: 'rgba(17,17,17,0.03)' } as React.CSSProperties,

    small: { fontSize: 12, color: '#6B7280' } as React.CSSProperties,
    strong: { fontWeight: 700 } as React.CSSProperties,
  }

  // A11y: Tastatur-Handler für match-open
  const onMatchKeyDown = (e: React.KeyboardEvent, id: string) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onOpenMatch?.(id)
    }
  }

  return (
    <div style={s.shell}>
      {/* Suche */}
      <div style={s.section}>
        <div style={s.inputRow}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Suche nach Namen…"
            style={s.input}
          />
        </div>
        {search && (
          <div style={{ ...s.small, textAlign: 'right', marginTop: 6 }}>
            {filtered.length} Ergebnis{filtered.length === 1 ? '' : 'se'}
          </div>
        )}
      </div>

      {/* Profil-Liste */}
      <div style={s.section}>
        <div style={s.list}>
          {filtered.length === 0 && <div style={s.muted}>Keine Profile gefunden.</div>}
          {filtered.map((p, i) => (
            <div
              key={p.id}
              style={{ ...s.row, ...(i === cursor ? s.rowActive : {}) }}
              onClick={() => setCursor(i)}
            >
              <div style={s.nameWrap}>
                <span style={s.colorDot(p.color)} />
                <div style={s.truncate}>{p.name}</div>
              </div>
              <div style={s.meta}>Angelegt: {new Date(p.createdAt).toLocaleDateString()}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Spieler-Detail */}
      {selected && (
        <>
          {/* Pfeil-Navigation + Name */}
          <div style={s.navBar}>
            <button
              style={s.navBtn}
              disabled={filtered.length <= 1}
              onClick={() => setCursor(c => (c - 1 + filtered.length) % filtered.length)}
              aria-label="Vorheriger Spieler"
            >
              ←
            </button>

            <div style={s.titleInline}>
              <span style={s.colorDot(selected.color)} />
              <div style={s.playerName}>{selected.name}</div>
            </div>

            <button
              style={s.navBtn}
              disabled={filtered.length <= 1}
              onClick={() => setCursor(c => (c + 1) % filtered.length)}
              aria-label="Nächster Spieler"
            >
              →
            </button>
          </div>

          {/* KPIs */}
          <div style={s.section}>
            <div style={s.kpiGrid}>
              <div style={s.kpiCard}>
                <div style={s.kpiLabel}>Matches</div>
                <div style={s.kpiVal}>{selectedAgg ? `${selectedAgg.wins}/${selectedAgg.matches}` : '—'}</div>
              </div>
              <div style={s.kpiCard}>
                <div style={s.kpiLabel}>3-Dart-Average</div>
                <div style={s.kpiVal}>{selectedAgg ? selectedAgg.threeDartAvg.toFixed(2) : '—'}</div>
              </div>
              <div style={s.kpiCard}>
                <div style={s.kpiLabel}>First-9 Avg</div>
                <div style={s.kpiVal}>
                  {selectedAgg && selectedAgg.first9OverallAvg !== undefined
                    ? selectedAgg.first9OverallAvg.toFixed(2)
                    : '—'}
                </div>
              </div>
              <div style={s.kpiCard}>
                <div style={s.kpiLabel}>Darts gesamt</div>
                <div style={s.kpiVal}>{selectedAgg ? selectedAgg.dartsThrown : '—'}</div>
              </div>
            </div>
          </div>

          {/* Einzelmatches (klickbar → Details öffnen) */}
          <div style={s.section}>
            <div style={s.matches}>
              {perMatch.length === 0 && (
                <div style={s.muted}>Keine beendeten Spiele für dieses Profil gefunden.</div>
              )}

              {perMatch.map(row => (
                <div
                  key={row.matchId}
                  style={{
                    ...s.matchRow,
                    ...(hoverMatch === row.matchId ? s.matchRowHover : {}),
                  }}
                  role="button"
                  tabIndex={0}
                  onMouseEnter={() => setHoverMatch(row.matchId)}
                  onMouseLeave={() => setHoverMatch(null)}
                  onClick={() => onOpenMatch?.(row.matchId)}
                  onKeyDown={e => onMatchKeyDown(e, row.matchId)}
                  aria-label={`Spiel vom ${row.date} öffnen`}
                >
                  <div style={{ minWidth: 140 }}>
                    <div style={s.strong}>{row.date}</div>
                    <div style={s.small}>{row.title}</div>
                    {row.result && (
                      <div style={s.small}>
                        Ergebnis: <strong>{row.result}</strong>
                      </div>
                    )}
                  </div>

                  <div style={{ flex: 1, minWidth: 140 }}>
                    <div style={s.small}>Gegner:</div>
                    <div style={s.strong}>{row.opponents.join(', ') || '—'}</div>
                  </div>

                  <div
                    style={{
                      minWidth: 260,
                      display: 'grid',
                      gridTemplateColumns: 'repeat(3, minmax(0,1fr))',
                      gap: 8,
                    }}
                  >
                    <div>
                      <div style={s.small}>3-DA</div>
                      <div style={s.strong}>{row.threeDartAvg.toFixed(2)}</div>
                    </div>
                    <div>
                      <div style={s.small}>Doubles %</div>
                      <div style={s.strong}>
                        {row.doubleAttempts > 0 ? `${row.doublePct.toFixed(1)}%` : '—'}
                      </div>
                      {row.doubleAttempts > 0 && (
                        <div style={s.small}>
                          {row.doubleHits}/{row.doubleAttempts}
                        </div>
                      )}
                    </div>
                    <div>
                      <div style={s.small}>High CO</div>
                      <div style={s.strong}>{row.highestCheckout || '—'}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
