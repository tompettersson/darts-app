import React, { useMemo, useState } from 'react'
import { ui } from '../../ui'
import {
  getProfiles,
  getMatches,
  getCricketMatches,
  getCricketComputedStats,
  getGlobalX01PlayerStats,
  getFavouriteDoubleForPlayer,
} from '../../storage'
import { applyEvents, computeStats } from '../../darts501'
import CricketPlayerHitMap from './CricketPlayerHitMap'


/* ---------- Mini-Format-Helper ---------- */
function fmt2(n: number | null | undefined) { return (n==null || Number.isNaN(n)) ? '—' : n.toFixed(2) }
function fmtPct(n: number | null | undefined) { return (n==null || Number.isNaN(n)) ? '—' : (n*100).toFixed(1) + ' %' }
/* TS-compat: Array.prototype.at(-1) Ersatz */
function last<T>(arr: T[]): T | undefined { return arr && arr.length ? arr[arr.length - 1] : undefined }

/* ---------- Komponententypen ---------- */
type TabKey = 'overview' | 'x01' | 'cricket' | 'trends'

export default function PlayerProfile({
  playerId,
  onBack,
}: {
  playerId: string
  onBack: () => void
}) {
  const name = usePlayerName(playerId)

  // Daten vorbereiten
  const x01 = useMemo(() => buildX01Series(playerId), [playerId])
  const crk = useMemo(() => buildCricketSeries(playerId), [playerId])

  // Auto-Start: Wenn es Cricket-Daten gibt, beginne auf "cricket", sonst overview
  const initial: TabKey = crk.games > 0 ? 'cricket' : 'overview'
  const [tab, setTab] = useState<TabKey>(initial)

  return (
    <div style={ui.page}>
      {/* Header */}
      <div style={ui.headerRow}>
        <div>
          <h2 style={{ margin: 0 }}>{name}</h2>
          <div style={ui.sub}>Spielerprofil · X01 & Cricket</div>
        </div>
        <button style={ui.backBtn} onClick={onBack}>← Zurück</button>
      </div>

      {/* Tabs */}
      <div style={tabsBar}>
        {(['overview','x01','cricket','trends'] as TabKey[]).map(k => (
          <button
            key={k}
            onClick={() => setTab(k)}
            style={{ ...tabBtn, ...(tab===k?tabBtnActive:{}) }}
          >
            {k === 'overview' ? 'Overview' : k === 'x01' ? 'X01' : k === 'cricket' ? 'Cricket' : 'Trends'}
          </button>
        ))}
      </div>

      {/* OVERVIEW */}
      {tab === 'overview' && (
        <div style={card}>
          <div style={secTitle}>Kurzüberblick</div>
          <div style={grid2}>
            <div>
              <div style={label}>X01</div>
              <div style={bigNum}>{x01.games} Spiele · {x01.wins} Wins</div>
              <div style={sub}>Ø 3-Dart: {fmt2(x01.tda)} · Double%: {fmtPct(x01.doublePctOverall)}</div>
              <div style={sparkRow}>
                <SparkBox title="Ø 3-Dart" values={x01.tdaTrend} />
                <SparkBox title="Double%" values={x01.doublePctTrend} asPct />
              </div>
            </div>
            <div>
              <div style={label}>Cricket</div>
              <div style={bigNum}>{crk.games} Spiele · {crk.wins} Wins</div>
              <div style={sub}>Mk/D {fmt2(crk.mpd)} · Mk/T {fmt2(crk.mpt)} · NoScore {fmtPct(crk.nstr)}</div>
              <div style={sparkRow}>
                <SparkBox title="Mk/D" values={crk.mpdTrend} />
                <SparkBox title="Mk/T" values={crk.mptTrend} />
                <SparkBox title="NoScore%" values={crk.nstrTrend} asPct />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* X01 */}
      {tab === 'x01' && (
        <div style={card}>
          <div style={secTitle}>X01</div>
          <div style={sub}>
            Spiele: <b>{x01.games}</b> · Wins: <b>{x01.wins}</b> ·
            {' '}Ø 3-Dart: <b>{fmt2(x01.tda)}</b> · Double%: <b>{fmtPct(x01.doublePctOverall)}</b>
          </div>

          {/* Kennzahlen-Grid */}
          <div style={metricsGridX01}>
            <MetricCard k="Highest Checkout" v={x01.highestCheckout ? String(x01.highestCheckout) : '—'} />
            <MetricCard k="180" v={String(x01.tons180 ?? 0)} />
            <MetricCard k="140+" v={String(x01.tons140Plus ?? 0)} />
            <MetricCard k="100+" v={String(x01.tons100Plus ?? 0)} />
            <MetricCard k="Fav. Double" v={x01.favDoubleText} />
            <MetricCard
              k="Double% Trend"
              v={x01.doublePctTrend.length ? fmtPct(last(x01.doublePctTrend) ?? 0) : '—'}
              spark={<Sparkline values={x01.doublePctTrend} width={160} height={36} />}
            />
            <div style={{ marginTop: 12 }}>
  <CricketPlayerHitMap playerId={playerId} />
</div>

          </div>

          {/* Trends groß */}
          <div style={sparkCol}>
            <SparkBlock title="Trend Ø 3-Dart" values={x01.tdaTrend} />
            <SparkBlock title="Trend Double%" values={x01.doublePctTrend} asPct />
          </div>

          {/* Mini-Leaderboard: Top-Finishes (Lieblingsdoppel) */}
          <div style={grid2}>
            <BarList
              title="Top Finishes – Lieblingsdoppel"
              items={x01.topFinishes}
              unit="x"
              hint="Gezählte Leg-Abschlüsse auf diesem Doppel"
            />
            <div />
          </div>

          {/* Heatmaps */}
          <div style={secTitle}>Heatmaps</div>
          <div style={grid3}>
            <BarList title="Doubles Hit" items={x01.doublesTop} unit="x" hint="Treffer auf Doppel-Segmente" />
            <BarList title="Triples Hit" items={x01.triplesTop} unit="x" hint="Treffer auf Triple-Segmente" />
            <BarList title="Segments Hit (Alle)" items={x01.segmentsTop} unit="x" hint="Alle Treffer auf das Feld (S/D/T/BULL)" />
          </div>

          {x01.recent.length > 0 && (
            <>
              <div style={smallTitle}>Letzte X01-Matches</div>
              <TableX rows={x01.recent} />
            </>
          )}
        </div>
      )}

      {/* CRICKET */}
      {tab === 'cricket' && (
        <div style={card}>
          <div style={secTitle}>Cricket</div>
          <div style={sub}>
            Matches: <b>{crk.wins}/{crk.games}</b> ·
            {' '}Legs: <b>{crk.legsWon}/{crk.legsPlayed}</b> ·
            {' '}Mk/D <b>{fmt2(crk.mpd)}</b> · Mk/T <b>{fmt2(crk.mpt)}</b> · NoScore <b>{fmtPct(crk.nstr)}</b>
          </div>

          <div style={metricsGrid}>
            <MetricCard k="Mk/D" v={fmt2(crk.mpd)} spark={<Sparkline values={crk.mpdTrend} width={160} height={36} />} />
            <MetricCard k="Mk/T" v={fmt2(crk.mpt)} spark={<Sparkline values={crk.mptTrend} width={160} height={36} />} />
            <MetricCard k="No-Score-% " v={fmtPct(crk.nstr)} spark={<Sparkline values={crk.nstrTrend} width={160} height={36} />} />
            <MetricCard k="Leg-Win-%" v={fmtPct(crk.legWR)} spark={<Sparkline values={crk.legWRTrend} width={160} height={36} />} />
            <MetricCard k="Match-Win-%" v={fmtPct(crk.matchWR)} spark={<Sparkline values={crk.matchWRTrend} width={160} height={36} />} />
            <MetricCard k="Best Turn (Marks)" v={String(crk.bestTurnMarks ?? '—')} />
          </div>

          <div style={sparkCol}>
            <SparkBlock title="Trend Mk/D" values={crk.mpdTrend} />
            <SparkBlock title="Trend Mk/T" values={crk.mptTrend} />
            <SparkBlock title="Trend No-Score-%" values={crk.nstrTrend} asPct />
          </div>

          {crk.recent.length > 0 && (
            <>
              <div style={smallTitle}>Letzte Cricket-Matches</div>
              <TableCricket rows={crk.recent} />
            </>
          )}
        </div>
      )}

      {/* TRENDS */}
      {tab === 'trends' && (
        <div style={card}>
          <div style={secTitle}>Vergleichende Trends (links alt → rechts neu)</div>
          <div style={sparkCol}>
            <SparkBlock title="X01 Ø 3-Dart" values={x01.tdaTrend} />
            <SparkBlock title="X01 Double%" values={x01.doublePctTrend} asPct />
            <SparkBlock title="Cricket Mk/D" values={crk.mpdTrend} />
            <SparkBlock title="Cricket Mk/T" values={crk.mptTrend} />
            <SparkBlock title="Cricket No-Score-%" values={crk.nstrTrend} asPct />
          </div>
        </div>
      )}
    </div>
  )
}

/* ---------- Daten-Aufbau ---------- */
function usePlayerName(pid: string) {
  const profiles = getProfiles() || []
  return useMemo(() => profiles.find(p => p.id === pid)?.name || pid, [profiles, pid])
}

/* Utility: Records -> Top-Liste */
type BarItem = { label: string; value: number }
function topFromRecord(rec?: Record<string, number>, limit = 10): BarItem[] {
  if (!rec) return []
  const arr = Object.keys(rec).map(k => ({ label: k, value: rec[k] ?? 0 }))
  arr.sort((a,b)=> (b.value - a.value) || (a.label.localeCompare(b.label)))
  return arr.slice(0, limit)
}

/* X01 */
function buildX01Series(pid: string) {
  const ms = (getMatches() || []) as any[]
  const finished = ms.filter(m => m.finished).sort((a,b) => (a.createdAt<b.createdAt? -1:1))

  let games=0, wins=0
  const tdaTrend: number[] = []
  const doublePctTrend: number[] = []
  const recent: { opp: string; wl: 'W'|'L'; set: string; tda: number; dblPct: number; ts: string }[] = []

  for (const m of finished) {
    const derived = applyEvents(m.events || [])
    const stats = computeStats(m.events || [])
    if (!derived?.match) continue

    const p = stats[pid]
    if (!p) continue

    games++
    const won = derived.finished?.winnerPlayerId === pid
    if (won) wins++

    const tda = p.dartsThrown>0 ? (p.pointsScored/p.dartsThrown)*3 : 0
    const dblPct = (p.doubleAttemptsDart ?? 0) > 0 ? (p.doublesHitDart ?? 0) / (p.doubleAttemptsDart ?? 1) : 0
    tdaTrend.push(tda)
    doublePctTrend.push(dblPct)

    // Recent row
    const start = (m.events || []).find((e:any)=>e?.type==='MatchStarted') as any
    const oppName = Array.isArray(start?.players)
      ? (start.players.find((pp:any)=>pp.playerId!==pid)?.name ?? '—')
      : '—'
    const setScore = deriveX01SetScore(derived, pid)
    recent.push({ opp: oppName, wl: won ? 'W':'L', set: setScore, tda, dblPct, ts: m.createdAt })
  }

  const tda = tdaTrend.length ? tdaTrend.reduce((a,b)=>a+b,0)/tdaTrend.length : 0
  recent.sort((a,b)=> (a.ts<b.ts? 1: -1))

  // Karriere-Store für Power-Stats etc.
  const career = getGlobalX01PlayerStats?.()[pid]
  const tons180 = career?.tons180 ?? 0
  const tons140Plus = career?.tons140Plus ?? 0
  const tons100Plus = career?.tons100Plus ?? 0
  const highestCheckout = career?.highestCheckout ?? 0
  const doublePctOverall = (career?.doublePctDart ?? 0) / 100 // Store liefert in %, hier als 0..1
  const fav = getFavouriteDoubleForPlayer?.(pid)
  const favDoubleText = fav ? `${fav.bed} (${fav.count}x)` : '—'

  // Heatmaps & Finishes
  const topFinishes = topFromRecord(career?.finishingDoubles, 8)
  const doublesTop = topFromRecord(career?.doublesHitCount, 12)
  const triplesTop = topFromRecord(career?.triplesHitCount, 12)
  const segmentsTop = topFromRecord(career?.segmentsHitCount, 12)

  return {
    games, wins, tda,
    tdaTrend: tdaTrend.slice(-30),
    doublePctTrend: doublePctTrend.slice(-30),
    recent: recent.slice(0,10),

    // Details
    tons180, tons140Plus, tons100Plus,
    highestCheckout,
    doublePctOverall,
    favDoubleText,

    // Heatmaps/Mini-Boards
    topFinishes,
    doublesTop,
    triplesTop,
    segmentsTop,
  }
}

function deriveX01SetScore(derived: any, pid: string): string {
  if (!derived?.match) return '—'
  if (derived.match.structure.kind === 'legs') {
    const wins: Record<string, number> = {}
    for (const L of derived.legs || []) {
      if (L.winnerPlayerId) wins[L.winnerPlayerId] = (wins[L.winnerPlayerId] ?? 0) + 1
    }
    const mine = wins[pid] ?? 0
    const maxOther = Math.max(0, ...Object.keys(wins).filter(k=>k!==pid).map(k=>wins[k] ?? 0))
    return `${mine}–${maxOther}`
  } else {
    const wins: Record<string, number> = {}
    for (const s of derived.sets || []) {
      if (s.winnerPlayerId) wins[s.winnerPlayerId] = (wins[s.winnerPlayerId] ?? 0) + 1
    }
    const mine = wins[pid] ?? 0
    const maxOther = Math.max(0, ...Object.keys(wins).filter(k=>k!==pid).map(k=>wins[k] ?? 0))
    return `${mine}–${maxOther} Sets`
  }
}

/* Cricket */
function buildCricketSeries(pid: string) {
  const cms = (getCricketMatches() || []) as any[]
  const finished = cms.filter(m => m.finished).sort((a,b)=> (a.createdAt<b.createdAt? -1:1))

  let games=0, wins=0, legsWon=0, legsPlayed=0
  let sumMpd=0, sumMpt=0, sumNstr=0, nMpd=0, nMpt=0, nNstr=0
  const mpdTrend:number[]=[], mptTrend:number[]=[], nstrTrend:number[]=[]
  const legWRTrend:number[]=[], matchWRTrend:number[]=[]
  let bestTurnMarks:number|undefined

  const recent: { opp: string; wl:'W'|'L'; legs:string; mpd:number|null; mpt:number|null; ts:string }[] = []

  for (const m of finished) {
    let comp: any = null
    try { comp = getCricketComputedStats(m.id) } catch { comp = null }
    if (!comp) continue
    const ps = (comp.players || []).find((p: any) => p.playerId === pid)
    if (!ps) continue

    games++
    const fin = (m.events || []).find((ev: any) => ev?.type === 'CricketMatchFinished')
    const won = fin?.winnerPlayerId === pid
    if (won) wins++
    matchWRTrend.push(won ? 1 : 0)

    const lp = Array.isArray(m.events) ? m.events.filter((ev: any) => ev?.type === 'CricketLegFinished').length : 0
    legsPlayed += lp
    legsWon += (ps.legsWon ?? 0)
    const legWR = lp>0 ? (ps.legsWon ?? 0)/lp : NaN
    if (isFinite(legWR)) legWRTrend.push(legWR)

    // Mk/D
    const darts = typeof ps?.dartsThrown === 'number' ? ps.dartsThrown : NaN
    const mpd = isFinite(darts) && darts>0 ? (ps.totalMarks ?? 0)/darts : (typeof ps?.marksPerDart === 'number' ? ps.marksPerDart : NaN)
    if (isFinite(mpd)) { sumMpd += mpd; nMpd++; mpdTrend.push(mpd) }

    // Mk/T
    const mpt = typeof ps?.marksPerTurn === 'number' ? ps.marksPerTurn : NaN
    if (isFinite(mpt)) { sumMpt += mpt; nMpt++; mptTrend.push(mpt) }

    // NoScore%
    let nstr = NaN
    if (typeof ps?.turnsWithNoScore === 'number' && typeof ps?.turns === 'number' && ps.turns>0) {
      nstr = ps.turnsWithNoScore/ps.turns
    }
    if (isFinite(nstr)) { sumNstr += nstr; nNstr++; nstrTrend.push(nstr) }

    // Best Turn Marks
    if (typeof ps?.bestTurnMarks === 'number') {
      bestTurnMarks = Math.max(bestTurnMarks ?? 0, ps.bestTurnMarks)
    }

    // Recent
    const start = (m.events || []).find((e:any)=>e?.type==='CricketMatchStarted') as any
    const oppName = Array.isArray(start?.players)
      ? (start.players.find((pp:any)=>pp.playerId!==pid)?.name ?? '—')
      : '—'
    const myLegs = ps.legsWon ?? 0
    const otherLegs = Math.max(0, ...comp.players.filter((pp:any)=>pp.playerId!==pid).map((pp:any)=>pp.legsWon ?? 0))
    recent.push({
      opp: oppName,
      wl: won ? 'W' : 'L',
      legs: `${myLegs}–${otherLegs}`,
      mpd: isFinite(mpd) ? mpd : null,
      mpt: isFinite(mpt) ? mpt : null,
      ts: m.createdAt,
    })
  }

  recent.sort((a,b)=> (a.ts<b.ts? 1: -1))

  return {
    games, wins, legsWon, legsPlayed,
    mpd: nMpd? (sumMpd/nMpd): 0,
    mpt: nMpt? (sumMpt/nMpt): 0,
    nstr: nNstr? (sumNstr/nNstr): 0,
    mpdTrend: mpdTrend.slice(-30),
    mptTrend: mptTrend.slice(-30),
    nstrTrend: nstrTrend.slice(-30),
    legWR: legsPlayed>0 ? legsWon/legsPlayed : 0,
    legWRTrend: legWRTrend.slice(-30),
    matchWR: games>0 ? wins/games : 0,
    matchWRTrend: matchWRTrend.slice(-30),
    bestTurnMarks,
    recent: recent.slice(0,10),
  }
}

/* ---------- Kleine UI-Bausteine ---------- */
function Sparkline({ values, width = 320, height = 42 }: { values: number[]; width?: number; height?: number }) {
  const pad = 3
  const w = Math.max(60, width)
  const h = Math.max(24, height)
  const innerW = w - pad * 2
  const innerH = h - pad * 2
  if (!values || values.length === 0) return <svg width={w} height={h}></svg>
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const n = values.length
  const stepX = innerW / Math.max(1, n - 1)
  const pts = values.map((v, i) => {
    const x = pad + i * stepX
    const y = pad + (1 - (v - min) / span) * innerH
    return `${x},${y}`
  })
  const rising = values[values.length - 1] >= values[0]
  return (
    <svg width={w} height={h} style={{ display:'block' }}>
      <polyline points={pts.join(' ')} fill="none" stroke={rising ? '#0f766e' : '#9a3412'} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

function SparkBox({ title, values, asPct=false }: { title:string; values:number[]; asPct?:boolean }) {
  const l = last(values)
  const val = l==null ? '—' : (asPct ? (l*100).toFixed(1)+' %' : l.toFixed(2))
  return (
    <div style={sparkBox}>
      <div style={label}>{title}</div>
      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
        <div style={{ fontWeight:800 }}>{val}</div>
        <Sparkline values={values} width={120} height={34} />
      </div>
    </div>
  )
}
function SparkBlock({ title, values, asPct=false }:{ title:string; values:number[]; asPct?:boolean }) {
  const l = last(values)
  const val = l==null ? '—' : (asPct ? (l*100).toFixed(1)+' %' : l.toFixed(2))
  return (
    <div>
      <div style={label}>{title} · <b>{val}</b></div>
      <Sparkline values={values} width={560} height={52} />
    </div>
  )
}

function MetricCard({ k, v, spark }:{ k:string; v:string; spark?:React.ReactNode }) {
  return (
    <div style={metricCard}>
      <div style={label}>{k}</div>
      <div style={bigNum}>{v}</div>
      {spark && <div style={{ marginTop:6 }}>{spark}</div>}
    </div>
  )
}

/* --- BarList (für Heatmaps & Finishes) --- */
function BarList({ title, items, unit='x', hint }:{ title:string; items:BarItem[]; unit?:string; hint?:string }) {
  const max = Math.max(1, ...items.map(i=>i.value))
  return (
    <div style={barCard}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline' }}>
        <div style={label}>{title}</div>
        {hint ? <div style={{ ...ui.sub, fontSize:11 }}>{hint}</div> : null}
      </div>
      <div style={{ display:'grid', gap:6, marginTop:8 }}>
        {items.length === 0 ? (
          <div style={{ ...ui.sub, textAlign:'center', padding:'8px 0' }}>Keine Daten</div>
        ) : items.map((it, idx)=>(
          <div key={idx} style={{ display:'grid', gridTemplateColumns:'minmax(36px,1fr) 1fr 8ch', gap:8, alignItems:'center' }}>
            <div style={{ fontWeight:700 }}>{it.label}</div>
            <div style={{ position:'relative', height:8, background:'#f1f5f9', borderRadius:6, overflow:'hidden' }}>
              <div style={{ position:'absolute', inset:0, width: `${(it.value/max)*100}%`, background:'#0f766e' }} />
            </div>
            <div style={{ textAlign:'right', fontVariantNumeric:'tabular-nums', fontWeight:700 }}>{it.value} {unit}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* --- Tabellen --- */
function TableCricket({ rows }:{ rows: { opp:string; wl:'W'|'L'; legs:string; mpd:number|null; mpt:number|null; ts:string }[] }) {
  return (
    <div style={tableWrap}>
      <div style={theadRow}>
        <div>Gegner</div>
        <div style={thRight}>W/L</div>
        <div style={thRight}>Legs</div>
        <div style={thRight}>Mk/D</div>
        <div style={thRight}>Mk/T</div>
        <div style={thRight}>Datum</div>
      </div>
      {rows.map((r,i)=>(
        <div key={i} style={trow}>
          <div style={cellName}>{r.opp}</div>
          <div style={tdNum}>{r.wl}</div>
          <div style={tdNum}>{r.legs}</div>
          <div style={tdNum}>{fmt2(r.mpd)}</div>
          <div style={tdNum}>{fmt2(r.mpt)}</div>
          <div style={tdNum}>{new Date(r.ts).toLocaleDateString()}</div>
        </div>
      ))}
    </div>
  )
}

function TableX({ rows }:{ rows: { opp:string; wl:'W'|'L'; set:string; tda:number; dblPct:number; ts:string }[] }) {
  return (
    <div style={tableWrap}>
      <div style={theadRow}>
        <div>Gegner</div>
        <div style={thRight}>W/L</div>
        <div style={thRight}>Sets/Legs</div>
        <div style={thRight}>Ø 3-Dart</div>
        <div style={thRight}>Double%</div>
        <div style={thRight}>Datum</div>
      </div>
      {rows.map((r,i)=>(
        <div key={i} style={trow}>
          <div style={cellName}>{r.opp}</div>
          <div style={tdNum}>{r.wl}</div>
          <div style={tdNum}>{r.set}</div>
          <div style={tdNum}>{fmt2(r.tda)}</div>
          <div style={tdNum}>{fmtPct(r.dblPct)}</div>
          <div style={tdNum}>{new Date(r.ts).toLocaleDateString()}</div>
        </div>
      ))}
    </div>
  )
}

/* ---------- Styles ---------- */
const tabsBar: React.CSSProperties = { display:'flex', gap:8, margin:'8px 0' }
const tabBtn: React.CSSProperties = { ...ui.pill, padding:'6px 10px', cursor:'pointer' }
const tabBtnActive: React.CSSProperties = { borderColor:'#111827', background:'#111827', color:'#fff' }

const card: React.CSSProperties = {
  border:'1px solid #e5e7eb', background:'#fff', borderRadius:14, padding:14,
  boxShadow:'0 1px 2px rgba(0,0,0,0.04), 0 10px 20px rgba(0,0,0,0.03)',
  display:'grid', gap:12, maxWidth:760, margin:'0 auto'
}
const secTitle: React.CSSProperties = { fontWeight:700, fontSize:15 }
const smallTitle: React.CSSProperties = { fontWeight:700, fontSize:13, marginTop:6 }
const grid2: React.CSSProperties = { display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }
const grid3: React.CSSProperties = { display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12 }
const bigNum: React.CSSProperties = { fontWeight:800, fontSize:20 }
const label: React.CSSProperties = { fontSize:12, color:'#475569', fontWeight:700 }
const sub: React.CSSProperties = { ...ui.sub }
const sparkRow: React.CSSProperties = { display:'grid', gridTemplateColumns:'repeat(3, minmax(120px,1fr))', gap:10, marginTop:8 }
const sparkBox: React.CSSProperties = { border:'1px solid #e5e7eb', borderRadius:12, padding:10 }
const sparkCol: React.CSSProperties = { display:'grid', gap:12, marginTop:12 }

const metricsGrid: React.CSSProperties = { display:'grid', gridTemplateColumns:'repeat(3, minmax(160px,1fr))', gap:10 }
const metricsGridX01: React.CSSProperties = { display:'grid', gridTemplateColumns:'repeat(6, minmax(120px,1fr))', gap:10 }

const metricCard: React.CSSProperties = { border:'1px solid #e5e7eb', borderRadius:12, padding:10, display:'grid', gap:4 }

const barCard: React.CSSProperties = { border:'1px solid #e5e7eb', borderRadius:12, padding:10, display:'grid', gap:6 }

const tableWrap: React.CSSProperties = { display:'grid', gap:0, marginTop:8 }
const theadRow: React.CSSProperties = {
  display:'grid',
  gridTemplateColumns:'minmax(120px,2fr) 8ch 10ch 10ch 10ch 12ch',
  padding:'8px 10px',
  borderBottom:'1px solid #e2e8f0',
  fontSize:12, color:'#475569', fontWeight:700
}
const trow: React.CSSProperties = {
  display:'grid',
  gridTemplateColumns:'minmax(120px,2fr) 8ch 10ch 10ch 10ch 12ch',
  padding:'8px 10px',
  borderBottom:'1px solid #e2e8f0',
  fontSize:14, alignItems:'center'
}
const tdNum: React.CSSProperties = { textAlign:'right', fontVariantNumeric:'tabular-nums', fontWeight:700 }
const thRight: React.CSSProperties = { textAlign:'right' }
const cellName: React.CSSProperties = { whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', minWidth:0, fontWeight:700 }
