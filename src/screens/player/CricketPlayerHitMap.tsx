// src/screens/player/CricketPlayerHitMap.tsx
import React, { useMemo } from 'react'
import { ui } from '../../ui'
import { getCricketMatches, getCricketMatchById } from '../../storage'
import { targetsFor, type CricketRange } from '../../dartsCricket'

type TargetKey = string

function hitsOf(target: number | 'BULL', mult: 1|2|3): number {
  if (target === 'BULL') return mult > 2 ? 2 : mult
  return mult
}

function aggregateForPlayer(pid: string) {
  const matches = (getCricketMatches() || []).filter(m => m.finished)

  const byRange: Record<CricketRange, Record<TargetKey, number>> = {
    short: {}, long: {},
  }

  for (const m of matches) {
    const norm = getCricketMatchById(m.id)
    if (!norm) continue

    const tks = targetsFor(norm.range).map(String) as TargetKey[]

    for (const ev of norm.events) {
      if (ev.type !== 'CricketTurnAdded') continue
      const shooter = (ev as any).playerId as string
      if (shooter !== pid) continue
      for (const d of (ev as any).darts as { target: number|'BULL'|'MISS'; mult: 1|2|3 }[]) {
        if (d.target === 'MISS') continue
        const key = String(d.target) as TargetKey
        if (!tks.includes(key)) continue
        const marks = hitsOf(d.target as any, d.mult)
        const bucket = byRange[norm.range]
        bucket[key] = (bucket[key] ?? 0) + marks
      }
    }
  }

  // sort targets stable
  const order = (range: CricketRange) => {
    const base = targetsFor(range).map(String) as TargetKey[]
    base.sort((a,b)=> (a==='BULL'? 1 : b==='BULL'? -1 : parseInt(a,10)-parseInt(b,10)))
    return base
  }

  return { byRange, order }
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

function Card({ children, title, hint }: { children: React.ReactNode; title: string; hint?: string }) {
  return (
    <div style={{
      border:'1px solid #e5e7eb', background:'#fff', borderRadius:12, padding:12,
      boxShadow:'0 1px 2px rgba(0,0,0,0.04), 0 10px 20px rgba(0,0,0,0.03)', display:'grid', gap:10
    }}>
      <div style={{ fontWeight:700, fontSize:14 }}>{title}</div>
      {children}
      {hint && <div style={{ ...ui.sub, fontSize:11 }}>{hint}</div>}
    </div>
  )
}

export default function CricketPlayerHitMap({ playerId }: { playerId: string }) {
  const { byRange, order } = useMemo(() => aggregateForPlayer(playerId), [playerId])

  const shortKeys = order('short')
  const longKeys = order('long')

  const maxShort = Math.max(1, ...shortKeys.map(k => byRange.short[k] ?? 0))
  const maxLong  = Math.max(1, ...longKeys.map(k => byRange.long[k] ?? 0))

  const totalShort = shortKeys.reduce((a,k)=>a+(byRange.short[k]??0),0)
  const totalLong  = longKeys.reduce((a,k)=>a+(byRange.long[k]??0),0)

  const topShort = (() => {
    let key: string | null = null, val = -1
    for (const k of shortKeys) { const v = byRange.short[k] ?? 0; if (v > val) { val=v; key=k } }
    return key ? `${key} (${val})` : '—'
  })()

  const topLong = (() => {
    let key: string | null = null, val = -1
    for (const k of longKeys) { const v = byRange.long[k] ?? 0; if (v > val) { val=v; key=k } }
    return key ? `${key} (${val})` : '—'
  })()

  const hasShort = totalShort > 0
  const hasLong  = totalLong > 0

  if (!hasShort && !hasLong) {
    return <div style={{ ...ui.sub, textAlign:'center' }}>Noch keine Cricket-Treffer für diesen Spieler.</div>
  }

  return (
    <div style={{ display:'grid', gap:12 }}>
      {hasShort && (
        <Card title="Hitmap – Short (15–20, BULL)" hint="Marks je Ziel (S=1, D=2, T=3; Bull max. 2)">
          <div style={{ ...ui.sub, marginTop:-6 }}>Top: <b>{topShort}</b> · Summe: <b>{totalShort}</b></div>
          <div style={{ display:'grid', gap:6, marginTop:4 }}>
            {shortKeys.map(k => (
              <BarRow key={k} label={k==='BULL'?'BULL':k} value={byRange.short[k] ?? 0} max={maxShort} />
            ))}
          </div>
        </Card>
      )}

      {hasLong && (
        <Card title="Hitmap – Long (10–20, BULL)" hint="Marks je Ziel (S=1, D=2, T=3; Bull max. 2)">
          <div style={{ ...ui.sub, marginTop:-6 }}>Top: <b>{topLong}</b> · Summe: <b>{totalLong}</b></div>
          <div style={{ display:'grid', gap:6, marginTop:4 }}>
            {longKeys.map(k => (
              <BarRow key={k} label={k==='BULL'?'BULL':k} value={byRange.long[k] ?? 0} max={maxLong} />
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}
