import React, { useMemo } from 'react'
import { ui } from '../../ui'
import { getProfiles, getMatches } from '../../storage'
import { applyEvents, computeStats } from '../../darts501'

type Props = {
  onOpenPlayer?: (playerId: string) => void
  limit?: number
}

type Row = {
  playerId: string
  name: string
  games: number
  wins: number
  tdaAvg: number            // Ø 3-Dart
  dblPctAvg: number         // 0..1
  tdaTrend: number[]        // letzte 10
  dblPctTrend: number[]     // letzte 10
}

export default function X01PlayerTiles({ onOpenPlayer, limit = 8 }: Props) {
  const rows = useX01Rows()
  const top = rows.slice(0, limit)

  if (top.length === 0) {
    return (
      <div style={tileWrap}>
        <div style={headerRow}>
          <div style={headerTitle}>X01 – Spielerübersicht</div>
        </div>
        <div style={{ ...ui.sub, textAlign:'center', padding:'12px 0' }}>Noch keine fertigen X01-Matches vorhanden.</div>
      </div>
    )
  }

  return (
    <div style={tileWrap}>
      <div style={headerRow}>
        <div style={headerTitle}>X01 – Spielerübersicht</div>
        <div style={{ ...ui.sub }}>Ø 3-Dart, Double% & Trend (letzte 10)</div>
      </div>
      <div style={grid}>
        {top.map(r => (
          <button
            key={r.playerId}
            onClick={() => onOpenPlayer?.(r.playerId)}
            style={tile}
            title={`${r.name} · ${r.wins}/${r.games} Siege`}
          >
            <div style={name}>{r.name}</div>
            <div style={subRow}>
              <span>Spiele:</span><b>{r.wins}/{r.games}</b>
            </div>
            <div style={kpiRow}>
              <KPI label="Ø 3-Dart" value={fmt2(r.tdaAvg)} />
              <KPI label="Double%" value={fmtPct(r.dblPctAvg)} />
            </div>
            <div style={sparkRow}>
              <Sparkline values={r.tdaTrend} width={180} height={36} />
              <Sparkline values={r.dblPctTrend} width={180} height={36} />
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

/* -------- Datenaufbau -------- */

function useX01Rows(): Row[] {
  const profiles = getProfiles() || []
  const nameOf = useMemo(() => {
    const m = new Map<string,string>()
    for (const p of profiles) if (p?.id) m.set(p.id, (p.name||'').trim() || p.id)
    return (pid: string) => m.get(pid) || pid
  }, [profiles])

  const matches = (getMatches() || []).filter((m:any)=> m.finished)
  // nach Zeit sortieren (alt→neu)
  matches.sort((a:any,b:any)=> (a.createdAt < b.createdAt ? -1 : 1))

  // pro Spieler sammeln
  const agg: Record<string, {
    games:number, wins:number,
    tda:number[], dblPct:number[]
  }> = {}

  for (const m of matches) {
    const derived = applyEvents(m.events || [])
    const stats = computeStats(m.events || [])
    if (!derived?.finished?.winnerPlayerId) continue

    // beteiligte Spieler ermitteln
    const started = (m.events || []).find((e:any)=> e?.type==='MatchStarted') as any
    const players: string[] = Array.isArray(started?.players) ? started.players.map((p:any)=> p.playerId) : Object.keys(stats)

    for (const pid of players) {
      const s = stats[pid]
      if (!s) continue
      const tda = s.dartsThrown>0 ? (s.pointsScored/s.dartsThrown)*3 : NaN
      const dblPct = (s.doubleAttemptsDart ?? 0) > 0 ? (s.doublesHitDart ?? 0) / (s.doubleAttemptsDart ?? 1) : NaN

      agg[pid] ??= { games:0, wins:0, tda:[], dblPct:[] }
      agg[pid].games += 1
      if (derived.finished.winnerPlayerId === pid) agg[pid].wins += 1
      if (isFinite(tda)) agg[pid].tda.push(tda)
      if (isFinite(dblPct)) agg[pid].dblPct.push(dblPct)
    }
  }

  const rows: Row[] = Object.keys(agg).map(pid => {
    const a = agg[pid]
    const tdaAvg = avg(a.tda)
    const dblAvg = avg(a.dblPct)
    return {
      playerId: pid,
      name: nameOf(pid),
      games: a.games,
      wins: a.wins,
      tdaAvg,
      dblPctAvg: dblAvg,
      tdaTrend: a.tda.slice(-10),
      dblPctTrend: a.dblPct.slice(-10),
    }
  })

  // Sortierung: Ø 3-Dart desc, dann Double%, dann Wins
  rows.sort((x,y)=>{
    if (y.tdaAvg !== x.tdaAvg) return y.tdaAvg - x.tdaAvg
    if (y.dblPctAvg !== x.dblPctAvg) return y.dblPctAvg - x.dblPctAvg
    return y.wins - x.wins
  })

  return rows
}

/* -------- Kleine UI-Bausteine -------- */

function KPI({ label, value }:{ label:string; value:string }) {
  return (
    <div style={{ display:'grid', gap:2 }}>
      <div style={kpiLabel}>{label}</div>
      <div style={kpiValue}>{value}</div>
    </div>
  )
}

function Sparkline({ values, width = 180, height = 36 }:{ values:number[]; width?:number; height?:number }) {
  const pad = 3
  const w = Math.max(60, width)
  const h = Math.max(24, height)
  if (!values || values.length === 0) return <svg width={w} height={h}></svg>

  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const stepX = (w - pad*2) / Math.max(1, values.length - 1)

  const pts = values.map((v,i)=>{
    const x = pad + i*stepX
    const y = pad + (1 - (v - min)/span) * (h - pad*2)
    return `${x},${y}`
  })
  const rising = values[values.length - 1] >= values[0]

  return (
    <svg width={w} height={h} style={{ display:'block' }}>
      <polyline
        points={pts.join(' ')}
        fill="none"
        stroke={rising ? '#0f766e' : '#9a3412'}
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  )
}

/* -------- Utils & Styles -------- */
function avg(a:number[]): number { return a.length ? a.reduce((p,c)=>p+c,0)/a.length : 0 }
function fmt2(n:number|null|undefined){ return (n==null||Number.isNaN(n)) ? '—' : n.toFixed(2) }
function fmtPct(n:number|null|undefined){ return (n==null||Number.isNaN(n)) ? '—' : (n*100).toFixed(1) + ' %' }

const tileWrap: React.CSSProperties = {
  border:'1px solid #e5e7eb', background:'#fff', borderRadius:14, padding:14,
  boxShadow:'0 1px 2px rgba(0,0,0,0.04), 0 10px 20px rgba(0,0,0,0.03)', display:'grid', gap:12
}
const headerRow: React.CSSProperties = { display:'flex', justifyContent:'space-between', alignItems:'baseline' }
const headerTitle: React.CSSProperties = { fontWeight:700, fontSize:15 }
const grid: React.CSSProperties = {
  display:'grid',
  gridTemplateColumns:'repeat(auto-fill, minmax(260px, 1fr))',
  gap:12
}
const tile: React.CSSProperties = {
  textAlign:'left',
  border:'1px solid #e5e7eb',
  borderRadius:12,
  padding:12,
  background:'#fff',
  display:'grid',
  gap:8,
  cursor:'pointer'
}
const name: React.CSSProperties = { fontWeight:800, fontSize:16, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }
const subRow: React.CSSProperties = { display:'flex', justifyContent:'space-between', alignItems:'center', color:'#475569', fontSize:12 }
const kpiRow: React.CSSProperties = { display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }
const sparkRow: React.CSSProperties = { display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }
const kpiLabel: React.CSSProperties = { fontSize:12, color:'#475569', fontWeight:700 }
const kpiValue: React.CSSProperties = { fontWeight:800, fontSize:18 }
