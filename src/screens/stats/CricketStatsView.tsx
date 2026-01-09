import React, { useMemo, useState } from 'react'
import { ui } from '../../ui'
import { getCricketMatches, getCricketComputedStats, getProfiles } from '../../storage'

/* ---------- Helpers: Format ---------- */
function fmtFixed2(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return '—'
  return n.toFixed(2)
}
function fmtPct(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return '—'
  return (n * 100).toFixed(1) + ' %'
}

/* ---------- Name-Resolver ---------- */
function useNameOf(matches: any[]) {
  const profiles = getProfiles() || []
  return React.useMemo(() => {
    const map = new Map<string, string>()
    for (const p of profiles) {
      if (p?.id) map.set(p.id, (p.name || '').trim() || p.id)
    }
    for (const m of matches || []) {
      const start = Array.isArray(m?.events)
        ? m.events.find((ev: any) => ev?.type === 'CricketMatchStarted')
        : null
      const players = (start?.players || m?.players || []) as any[]
      for (const p of players) {
        const pid = p?.playerId ?? p?.id
        const pname = p?.name
        if (pid && !map.has(pid)) map.set(pid, (pname || '').trim() || pid)
      }
    }
    return (pid: string | undefined) => (pid ? map.get(pid) || pid : '—')
  }, [profiles, matches])
}

/* ---------- Aggregation für Tabelle + Trends ---------- */
type TrendMetric = 'mpd' | 'mpt' | 'nstr'

function countCricketMatchWins(playerId: string) {
  const finished = (getCricketMatches() || []).filter((m: any) => m.finished)
  let wins = 0
  for (const m of finished) {
    const fin = (m.events as any[] | undefined)?.find(ev => (ev as any)?.type === 'CricketMatchFinished') as any
    if (fin?.winnerPlayerId === playerId) wins++
  }
  return wins
}

function safeGetStats(matchId: string) {
  try { return getCricketComputedStats(matchId) } catch { return null }
}

function getTrend(playerId: string, metric: TrendMetric) {
  const finished = (getCricketMatches() || [])
    .filter((m: any) => m.finished)
    .sort((a: any, b: any) => (Date.parse(a.createdAt || '') - Date.parse(b.createdAt || '')))
  const series: number[] = []
  for (const m of finished) {
    const comp = safeGetStats(m.id)
    if (!comp) continue
    const ps = (comp.players || []).find((p: any) => p.playerId === playerId)
    if (!ps) continue

    if (metric === 'mpd') {
      const mpd = typeof ps?.marksPerDart === 'number' ? ps.marksPerDart : NaN
      if (isFinite(mpd)) series.push(mpd)
    } else if (metric === 'mpt') {
      const v = typeof ps?.marksPerTurn === 'number' ? ps.marksPerTurn : NaN
      if (isFinite(v)) series.push(v)
    } else {
      // NoScore% über Schätzung (totalMarks / marksPerTurn)
      const totalMarks = typeof ps?.totalMarks === 'number' ? ps.totalMarks : NaN
      const mpt = typeof ps?.marksPerTurn === 'number' ? ps.marksPerTurn : NaN
      const turnsEst = isFinite(totalMarks) && isFinite(mpt) && mpt > 0 ? totalMarks / mpt : NaN
      const nstr = isFinite(turnsEst) && turnsEst > 0 && typeof ps?.turnsWithNoScore === 'number'
        ? ps.turnsWithNoScore / turnsEst
        : NaN
      if (isFinite(nstr)) series.push(nstr)
    }
  }
  return series.slice(-10)
}

function buildTrendTitle(values: number[], metric: TrendMetric): string {
  if (!values || values.length === 0) return 'Trend: keine Daten'
  const label = metric === 'mpd' ? 'Mk/D' : metric === 'mpt' ? 'Mk/T' : 'NoScore%'
  const last = values[values.length - 1]
  const first = values[0]
  const arrow = last > first ? '↑' : last < first ? '↓' : '→'
  const fmt = (v: number) => metric === 'nstr' ? (v * 100).toFixed(1) + '%' : v.toFixed(2)
  return `Trend (${label}) – alt→neu: ${values.map(fmt).join(' · ')}  (${arrow} ${fmt(last)})`
}

/* ---------- Sparkline ---------- */
function Sparkline({ values, width = 82, height = 22 }: { values: number[]; width?: number; height?: number }) {
  const pad = 2
  const w = Math.max(16, width)
  const h = Math.max(12, height)
  const innerW = w - pad * 2
  const innerH = h - pad * 2

  if (!values || values.length === 0) {
    return <svg width={w} height={h}><rect x={0} y={0} width={w} height={h} fill="transparent" /></svg>
  }

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
    <svg width={w} height={h} style={{ display: 'block' }}>
      <polyline
        points={pts.join(' ')}
        fill="none"
        stroke={rising ? '#0f766e' : '#9a3412'}
        strokeWidth={1.6}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  )
}

/* ---------- Styles (feste Spalten) ---------- */
const GRID = 'minmax(160px,2fr) 10ch 10ch 7ch 7ch 9ch 9ch'

const cardStyle: React.CSSProperties = {
  border: '1px solid #e5e7eb',
  background: '#fff',
  borderRadius: 14,
  boxShadow: '0 1px 2px rgba(0,0,0,0.04), 0 10px 20px rgba(0,0,0,0.03)',
  padding: 14,
  display: 'grid',
  gap: 12,
  maxWidth: 740,
  margin: '0 auto',
}
const headerTitle: React.CSSProperties = { fontWeight: 600, fontSize: 15, lineHeight: 1.3, textAlign: 'center' }
const tableHeaderRow: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: GRID,
  columnGap: 12,
  alignItems: 'center',
  maxWidth: 740,
  width: '100%',
  margin: '0 auto',
  padding: '8px 12px',
  borderBottom: '1px solid #e2e8f0',
  fontSize: 12,
  color: '#475569',
  fontWeight: 700,
}
const thRight: React.CSSProperties = { textAlign: 'right' }
const rowDivStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: GRID,
  columnGap: 12,
  alignItems: 'center',
  maxWidth: 740,
  width: '100%',
  margin: '0 auto',
  padding: '8px 12px',
  borderBottom: '1px solid #e2e8f0',
  fontSize: 14,
  lineHeight: 1.3,
  boxSizing: 'border-box',
}
const nameCellWrap: React.CSSProperties = { display:'flex', alignItems:'center', minWidth:0 }
const nameBtn: React.CSSProperties = {
  background:'transparent', border:0, padding:0, margin:0, cursor:'pointer',
  fontWeight:700, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'
}
const num: React.CSSProperties = { fontVariantNumeric: 'tabular-nums', fontWeight: 700, textAlign: 'right', whiteSpace: 'nowrap' }
const trendCell: React.CSSProperties = { display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }
const legend: React.CSSProperties = { fontSize: 11, color: '#64748b', textAlign: 'center', marginTop: 8, lineHeight: 1.3 }

/* ---------- Hauptkomponente ---------- */
type Props = { onOpenPlayer?: (playerId: string) => void }

export default function CricketStatsView({ onOpenPlayer }: Props) {
  const matches = getCricketMatches() as any[]
  const nameOf = useNameOf(matches)
  const [trendMetric, setTrendMetric] = useState<TrendMetric>('mpd')

  // Tabelle zusammenbauen
  const rows = useMemo(() => {
    const done = (getCricketMatches() || []).filter((m: any) => m.finished)
    const byPlayer: Record<string, {
      matches: number; legsWon: number; legsPlayed: number;
      mpdSum: number; mpdN: number;
      mptSum: number; mptN: number;
      nstrSum: number; nstrN: number;
    }> = {}

    for (const m of done) {
      const comp = safeGetStats(m.id)
      if (!comp) continue
      for (const ps of comp.players as any[]) {
        const pid = ps.playerId
        byPlayer[pid] ??= { matches: 0, legsWon: 0, legsPlayed: 0, mpdSum: 0, mpdN: 0, mptSum: 0, mptN: 0, nstrSum: 0, nstrN: 0 }
        byPlayer[pid].matches += 1
        const lp = (m.events as any[]).filter(ev => (ev as any)?.type === 'CricketLegFinished').length
        byPlayer[pid].legsPlayed += lp
        byPlayer[pid].legsWon += (ps.legsWon ?? 0)

        // mpd (über Ratio)
        const mpd = typeof ps?.marksPerDart === 'number' ? ps.marksPerDart : NaN
        if (isFinite(mpd)) { byPlayer[pid].mpdSum += mpd; byPlayer[pid].mpdN++ }

        // mpt
        if (typeof ps?.marksPerTurn === 'number' && isFinite(ps.marksPerTurn)) {
          byPlayer[pid].mptSum += ps.marksPerTurn; byPlayer[pid].mptN++
        }

        // nstr über geschätzte Turns (totalMarks / marksPerTurn)
        const totalMarks = typeof ps?.totalMarks === 'number' ? ps.totalMarks : NaN
        const mpt = typeof ps?.marksPerTurn === 'number' ? ps.marksPerTurn : NaN
        const turnsEst = isFinite(totalMarks) && isFinite(mpt) && mpt > 0 ? totalMarks / mpt : NaN
        if (isFinite(turnsEst) && turnsEst > 0 && typeof ps?.turnsWithNoScore === 'number') {
          const nstr = ps.turnsWithNoScore / turnsEst
          if (isFinite(nstr)) { byPlayer[pid].nstrSum += nstr; byPlayer[pid].nstrN++ }
        }
      }
    }

    const rows = Object.keys(byPlayer).map(pid => {
      const v = byPlayer[pid]
      return {
        playerId: pid,
        name: nameOf(pid),
        matches: v.matches,
        wins: countCricketMatchWins(pid),
        legsWon: v.legsWon,
        legsPlayed: v.legsPlayed,
        mpd: v.mpdN ? v.mpdSum / v.mpdN : null,
        mpt: v.mptN ? v.mptSum / v.mptN : null,
        nstr: v.nstrN ? v.nstrSum / v.nstrN : null,
      }
    })

    rows.sort((a, b) => {
      const keyA = a.mpd ?? -1, keyB = b.mpd ?? -1
      if (keyB !== keyA) return keyB - keyA
      const tA = a.mpt ?? -1, tB = b.mpt ?? -1
      if (tB !== tA) return tB - tA
      if (b.legsWon !== a.legsWon) return b.legsWon - a.legsWon
      return b.matches - a.matches
    })
    return rows
  }, [nameOf])

  const hasRows = rows.length > 0

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={cardStyle}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: 14, color: '#0f172a' }}>Cricket</div>
            <div style={ui.sub}>Spielerübersicht (kumuliert über alle fertigen Matches)</div>
          </div>
          {/* Trend-Umschalter */}
          <div style={{ display:'flex', gap:8, alignItems:'center', fontSize:12 }}>
            <span style={{ fontWeight:700, color:'#475569' }}>Trend:</span>
            <label><input type="radio" name="trend" checked={trendMetric==='mpd'} onChange={()=>setTrendMetric('mpd')} /> Mk/D</label>
            <label><input type="radio" name="trend" checked={trendMetric==='mpt'} onChange={()=>setTrendMetric('mpt')} /> Mk/T</label>
            <label><input type="radio" name="trend" checked={trendMetric==='nstr'} onChange={()=>setTrendMetric('nstr')} /> NoScore%</label>
          </div>
        </div>

        <div style={headerTitle}>Players</div>

        {/* Tabellen-Header */}
        <div style={tableHeaderRow}>
          <div style={{ textAlign: 'left' }}>Spieler</div>
          <div style={thRight}>Matches</div>
          <div style={thRight}>Legs</div>
          <div style={thRight}>Mk/D</div>
          <div style={thRight}>Mk/T</div>
          <div style={thRight}>NoScore%</div>
          <div style={thRight}>Trend</div>
        </div>

        {/* Daten */}
        {!hasRows ? (
          <div style={{ ...ui.sub, textAlign: 'center', padding: '16px 0' }}>
            Noch keine fertigen Cricket-Spiele vorhanden.
          </div>
        ) : (
          <div style={{ display: 'grid' }}>
            {rows.map((r) => {
              const trendValues = getTrend(r.playerId, trendMetric)
              const trendTitle = buildTrendTitle(trendValues, trendMetric)
              const go = () => {
                if (typeof onOpenPlayer === 'function') onOpenPlayer(r.playerId)
                else window.location.hash = `#/player/${r.playerId}`
              }
              return (
                <div key={r.playerId} style={rowDivStyle}>
                  <div style={nameCellWrap}>
                    <button onClick={go} title={r.name} style={nameBtn}>{r.name}</button>
                  </div>
                  <div style={num} title="Wins/Games">{r.wins}/{r.matches}</div>
                  <div style={num} title="Legs Wins/Games">{r.legsWon}/{r.legsPlayed}</div>
                  <div style={num} title="Marks per Dart">{fmtFixed2(r.mpd)}</div>
                  <div style={num} title="Marks per Turn">{fmtFixed2(r.mpt)}</div>
                  <div style={num} title="No-Score-Turn-Rate">{fmtPct(r.nstr)}</div>
                  <div style={trendCell} title={trendTitle}>
                    <Sparkline values={trendValues} width={82} height={22} />
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Legende */}
        <div style={legend}>
          Matches = Wins/Games · Legs = Wins/Games · Mk/D = Marks per Dart · Mk/T = Marks per Turn · NoScore% = No-Score-Turn-Rate · Trend = letzte 10 Werte des gewählten Metrics (links alt → rechts neu)
        </div>
      </div>
    </div>
  )
}
