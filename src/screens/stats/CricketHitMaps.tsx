// src/screens/stats/CricketHitMaps.tsx
import React, { useMemo, useState } from 'react'
import { ui } from '../../ui'
import { getCricketMatches, getProfiles, getCricketMatchById } from '../../storage'
import { targetsFor, type CricketRange, type CricketStyle } from '../../dartsCricket'

type TargetKey = string // "10".."20" | "BULL"

type RangeFilter = 'all' | CricketRange
type StyleFilter = 'all' | CricketStyle

type Totals = Record<TargetKey, number>
type PerPlayerTotals = Record<string, Totals>

function hitsOf(target: number | 'BULL', mult: 1|2|3): number {
  if (target === 'BULL') return mult > 2 ? 2 : mult
  return mult
}

function useNameOf() {
  const profiles = getProfiles() || []
  return (pid: string) => profiles.find(p => p.id === pid)?.name || pid
}

function aggregate(rangeF: RangeFilter, styleF: StyleFilter) {
  const matches = (getCricketMatches() || []).filter(m => m.finished)

  const totalsGlobal: Totals = {}
  const perPlayer: PerPlayerTotals = {}
  let activeTargets: TargetKey[] = [] // wird pro Match gesetzt; bei "all" am Ende vereinigt

  const unionTargets = new Set<TargetKey>()

  for (const m of matches) {
    const norm = getCricketMatchById(m.id)
    if (!norm) continue

    if (rangeF !== 'all' && norm.range !== rangeF) continue
    if (styleF !== 'all' && norm.style !== styleF) continue

    const tks = targetsFor(norm.range).map(String) as TargetKey[]
    tks.forEach(t => unionTargets.add(t))

    for (const ev of norm.events) {
      if (ev.type !== 'CricketTurnAdded') continue
      const pid = (ev as any).playerId as string
      perPlayer[pid] ??= {}
      for (const d of (ev as any).darts as { target: number|'BULL'|'MISS'; mult: 1|2|3 }[]) {
        if (d.target === 'MISS') continue
        const key = String(d.target) as TargetKey
        if (!tks.includes(key)) continue // nur gültige Targets der Match-Range
        const marks = hitsOf(d.target as any, d.mult)
        totalsGlobal[key] = (totalsGlobal[key] ?? 0) + marks
        perPlayer[pid][key] = (perPlayer[pid][key] ?? 0) + marks
      }
    }
  }

  activeTargets = Array.from(unionTargets)
  // stabile Reihenfolge: Zahlen aufsteigend, Bull zuletzt
  activeTargets.sort((a,b) => (a==='BULL'? 1 : b==='BULL'? -1 : parseInt(a,10)-parseInt(b,10)))

  return { totalsGlobal, perPlayer, activeTargets }
}

function BarRow({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = max > 0 ? (value / max) * 100 : 0
  return (
    <div style={{ display:'grid', gridTemplateColumns:'minmax(28px,1fr) 1fr 8ch', gap:8, alignItems:'center' }}>
      <div style={{ fontWeight:700 }}>{label}</div>
      <div style={{ position:'relative', height:8, background:'#f1f5f9', borderRadius:6, overflow:'hidden' }}>
        <div style={{ position:'absolute', inset:0, width:`${pct}%`, background:'#0f766e' }} />
      </div>
      <div style={{ textAlign:'right', fontVariantNumeric:'tabular-nums', fontWeight:700 }}>{value}</div>
    </div>
  )
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      border:'1px solid #e5e7eb', background:'#fff', borderRadius:14, padding:14,
      boxShadow:'0 1px 2px rgba(0,0,0,0.04), 0 10px 20px rgba(0,0,0,0.03)', display:'grid', gap:12
    }}>
      {children}
    </div>
  )
}

export default function CricketHitMaps() {
  const [rangeF, setRangeF] = useState<RangeFilter>('all')
  const [styleF, setStyleF] = useState<StyleFilter>('all')
  const nameOf = useNameOf()

  const { totalsGlobal, perPlayer, activeTargets } = useMemo(
    () => aggregate(rangeF, styleF),
    [rangeF, styleF]
  )

  const hasData = activeTargets.length > 0 && Object.keys(totalsGlobal).length > 0
  const maxGlobal = Math.max(1, ...activeTargets.map(k => totalsGlobal[k] ?? 0))

  // pro Spieler: Top-Target bestimmen
  const playerRows = useMemo(() => {
    const entries = Object.keys(perPlayer).map(pid => {
      const t = perPlayer[pid] || {}
      let topKey: TargetKey | null = null
      let topVal = -1
      for (const k of activeTargets) {
        const v = t[k] ?? 0
        if (v > topVal) { topVal = v; topKey = k }
      }
      const total = activeTargets.reduce((a,k)=>a+(t[k]??0),0)
      return { pid, name: nameOf(pid), topKey, topVal, total, t }
    })
    // sortiere nach Gesamt-Hits absteigend
    entries.sort((a,b)=> (b.total - a.total) || a.name.localeCompare(b.name))
    return entries
  }, [perPlayer, activeTargets, nameOf])

  return (
    <div style={{ display:'grid', gap:12 }}>
      <Card>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:8, flexWrap:'wrap' }}>
          <div>
            <div style={{ fontWeight:700, fontSize:15 }}>Cricket Hitmaps</div>
            <div style={ui.sub}>Häufigkeit der getroffenen Ziele (Marks), filterbar nach Range & Style</div>
          </div>
          <div style={{ display:'flex', gap:8, alignItems:'center', fontSize:12 }}>
            <label><b>Range:</b>{' '}
              <select value={rangeF} onChange={e=>setRangeF(e.target.value as RangeFilter)}>
                <option value="all">Alle</option>
                <option value="short">Short (15–20,Bull)</option>
                <option value="long">Long (10–20,Bull)</option>
              </select>
            </label>
            <label><b>Style:</b>{' '}
              <select value={styleF} onChange={e=>setStyleF(e.target.value as StyleFilter)}>
                <option value="all">Alle</option>
                <option value="standard">Standard</option>
                <option value="cutthroat">Cutthroat</option>
              </select>
            </label>
          </div>
        </div>

        {!hasData ? (
          <div style={{ ...ui.sub, textAlign:'center', padding:'12px 0' }}>Keine fertigen Cricket-Spiele in diesem Filter.</div>
        ) : (
          <>
            {/* Global */}
            <div style={{ fontWeight:700, fontSize:13 }}>Gesamt (alle Spieler)</div>
            <div style={{ display:'grid', gap:6 }}>
              {activeTargets.map(k => (
                <BarRow key={k} label={k==='BULL' ? 'BULL' : k} value={totalsGlobal[k] ?? 0} max={maxGlobal} />
              ))}
            </div>

            {/* Top Target Global */}
            <div style={{ ...ui.sub, marginTop:6 }}>
              {(() => {
                let topKey: TargetKey | null = null, topVal = -1
                for (const k of activeTargets) {
                  const v = totalsGlobal[k] ?? 0
                  if (v > topVal) { topVal = v; topKey = k }
                }
                return topKey ? <>Meist getroffen: <b>{topKey}</b> ({topVal} Marks)</> : null
              })()}
            </div>

            {/* Pro Spieler kompakt */}
            <div style={{ fontWeight:700, fontSize:13, marginTop:8 }}>Spieler (Top-Ziel & Verteilung)</div>
            <div style={{ display:'grid', gap:10 }}>
              {playerRows.map(row => {
                const max = Math.max(1, ...activeTargets.map(k => row.t[k] ?? 0))
                return (
                  <div key={row.pid} style={{ border:'1px solid #e5e7eb', borderRadius:12, padding:10, display:'grid', gap:6 }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline' }}>
                      <div style={{ fontWeight:800 }}>{row.name}</div>
                      <div style={ui.sub}>
                        Top: {row.topKey ?? '—'} {row.topVal>0 ? `(${row.topVal})` : ''}
                        {' · '}Summe: <b>{row.total}</b>
                      </div>
                    </div>
                    <div style={{ display:'grid', gap:6 }}>
                      {activeTargets.map(k => (
                        <BarRow key={k} label={k==='BULL'?'BULL':k} value={row.t[k] ?? 0} max={max} />
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>

            <div style={{ ...ui.sub, textAlign:'center', marginTop:6 }}>
              Hinweis: Es werden **Marks** gezählt (S=1, D=2, T=3; Bull max. 2), unabhängig davon, ob das Feld bereits geschlossen war.
            </div>
          </>
        )}
      </Card>
    </div>
  )
}
