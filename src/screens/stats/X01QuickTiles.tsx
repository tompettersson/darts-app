import React, { useMemo } from 'react'
import { ui } from '../../ui'
import { getMatches, getProfiles } from '../../storage'
import { applyEvents, computeStats } from '../../darts501'

type Props = {
  onShowPlayer: (playerId: string) => void
  limit?: number
}

/* Mini-Sparkline */
function Sparkline({ values, width = 100, height = 28 }: { values:number[]; width?:number; height?:number }) {
  const pad = 3
  const w = Math.max(60, width)
  const h = Math.max(20, height)
  if (!values?.length) return <svg width={w} height={h}></svg>
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const stepX = (w - pad * 2) / Math.max(1, values.length - 1)
  const pts = values.map((v,i)=>{
    const x = pad + i * stepX
    const y = pad + (1 - (v - min) / span) * (h - pad * 2)
    return `${x},${y}`
  })
  const rising = values[values.length - 1] >= values[0]
  return (
    <svg width={w} height={h} style={{ display:'block' }}>
      <polyline points={pts.join(' ')} fill="none" stroke={rising ? '#0f766e' : '#9a3412'} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

function fmt2(n:number|undefined|null){ return n==null || Number.isNaN(n) ? '—' : n.toFixed(2) }
function fmtPct(n:number|undefined|null){ return n==null || Number.isNaN(n) ? '—' : (n*100).toFixed(1)+' %' }

export default function X01QuickTiles({ onShowPlayer, limit = 6 }: Props) {
  const profiles = getProfiles() || []
  const nameOf = useMemo(()=>{
    const map = new Map<string,string>()
    for (const p of profiles) if (p?.id) map.set(p.id, (p.name||'').trim() || p.id)
    return (id:string)=> map.get(id) || id
  }, [profiles])

  const data = useMemo(()=>{
    const ms = (getMatches() || []).filter((m:any)=>m.finished)
      .sort((a:any,b:any)=> (a.createdAt<b.createdAt? -1:1))

    const perPlayer: Record<string, {
      name: string
      games: number
      wins: number
      tdaAvgArr: number[]
      dblPctArr: number[]
      tdaAvg: number
      dblPct: number
    }> = {}

    for (const m of ms) {
      const derived = applyEvents(m.events || [])
      const stats = computeStats(m.events || [])
      const started = (m.events||[]).find((e:any)=>e?.type==='MatchStarted') as any
      const players = Array.isArray(started?.players) ? started.players : []
      for (const pl of players) {
        const pid = pl.playerId
        if (!pid) continue
        const st = stats[pid]
        if (!st) continue
        perPlayer[pid] ??= { name: nameOf(pid), games:0, wins:0, tdaAvgArr:[], dblPctArr:[], tdaAvg:0, dblPct:0 }
        perPlayer[pid].games += 1
        const won = derived?.finished?.winnerPlayerId === pid
        if (won) perPlayer[pid].wins += 1

        // Ø 3-Dart (points/darts * 3)
        const tda = st.dartsThrown>0 ? (st.pointsScored/st.dartsThrown)*3 : NaN
        if (isFinite(tda)) perPlayer[pid].tdaAvgArr.push(tda)

        // Double% (Darts-basiert, falls vorhanden)
        const dblPct = (st.doubleAttemptsDart ?? 0) > 0
          ? (st.doublesHitDart ?? 0) / (st.doubleAttemptsDart || 1)
          : NaN
        if (isFinite(dblPct)) perPlayer[pid].dblPctArr.push(dblPct)
      }
    }

    const rows = Object.keys(perPlayer).map(pid=>{
      const v = perPlayer[pid]
      v.tdaAvg = v.tdaAvgArr.length ? v.tdaAvgArr.reduce((a,b)=>a+b,0)/v.tdaAvgArr.length : NaN
      v.dblPct = v.dblPctArr.length ? v.dblPctArr.reduce((a,b)=>a+b,0)/v.dblPctArr.length : NaN
      return { playerId: pid, ...v }
    })

    // Sortierung: Ø 3-Dart, dann Double%
    rows.sort((a,b)=> (b.tdaAvg - a.tdaAvg) || (b.dblPct - a.dblPct))
    return rows.slice(0, limit)
  }, [nameOf, limit])

  if (!data.length) {
    return (
      <div style={{ border:'1px solid #e5e7eb', background:'#fff', borderRadius:14, padding:14 }}>
        <div style={{ fontWeight:700, marginBottom:6 }}>X01 – Schnellüberblick</div>
        <div style={ui.sub}>Noch keine fertigen X01-Spiele vorhanden.</div>
      </div>
    )
  }

  return (
    <div style={{ border:'1px solid #e5e7eb', background:'#fff', borderRadius:14, padding:14, display:'grid', gap:12 }}>
      <div style={{ fontWeight:700 }}>X01 – Schnellüberblick</div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(220px, 1fr))', gap:10 }}>
        {data.map(r=>(
          <button
            key={r.playerId}
            onClick={()=>onShowPlayer(r.playerId)}
            style={{
              textAlign:'left',
              border:'1px solid #e5e7eb',
              borderRadius:12,
              padding:10,
              background:'#fff',
              cursor:'pointer'
            }}
            title={`${r.name} · Spiele ${r.wins}/${r.games}`}
          >
            <div style={{ fontWeight:800, marginBottom:4, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{r.name}</div>
            <div style={{ fontSize:12, color:'#475569', marginBottom:6 }}>Spiele {r.wins}/{r.games}</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr auto', gap:8, alignItems:'center' }}>
              <div>
                <div style={{ fontSize:11, color:'#475569', fontWeight:700 }}>Ø 3-Dart</div>
                <div style={{ fontWeight:800 }}>{fmt2(r.tdaAvg)}</div>
              </div>
              <Sparkline values={r.tdaAvgArr.slice(-12)} width={120} height={34} />
            </div>
            <div style={{ height:8 }} />
            <div style={{ display:'grid', gridTemplateColumns:'1fr auto', gap:8, alignItems:'center' }}>
              <div>
                <div style={{ fontSize:11, color:'#475569', fontWeight:700 }}>Double%</div>
                <div style={{ fontWeight:800 }}>{fmtPct(r.dblPct)}</div>
              </div>
              <Sparkline values={r.dblPctArr.slice(-12)} width={120} height={34} />
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
