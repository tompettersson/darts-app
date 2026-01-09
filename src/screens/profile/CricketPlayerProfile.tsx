import React, { useMemo } from 'react'
import { ui } from '../../ui'
import { getCricketMatches, getCricketComputedStats, getProfiles } from '../../storage'
import { fmtFixed2, fmtPct } from '../../logic/cricketCareer'

export default function CricketPlayerProfile({ playerId, onBack }: { playerId: string; onBack: () => void }) {
  const profiles = getProfiles() || []
  const name = useMemo(() => profiles.find(p => p.id === playerId)?.name || playerId, [profiles, playerId])

  const finished = (getCricketMatches() || []).filter((m: any) => m.finished) as any[]
  const rows = useMemo(() => {
    const list: Array<{
      id: string
      ts: number
      title: string
      mpd: number | null
      mpt: number | null
      nstr: number | null
      legsWon: number
      legsPlayed: number
    }> = []

    for (const m of finished) {
      let comp: any = null
      try { comp = getCricketComputedStats(m.id) } catch { comp = null }
      if (!comp) continue
      const ps = (comp.players || []).find((p: any) => p.playerId === playerId)
      if (!ps) continue
      const legsPlayed = Array.isArray(m.events) ? m.events.filter((ev: any) => ev?.type === 'CricketLegFinished').length : 0
      const darts = typeof ps?.dartsThrown === 'number' ? ps.dartsThrown : 0
      const mpd = darts > 0 ? (ps.totalMarks ?? 0) / darts : (typeof ps?.marksPerDart === 'number' ? ps.marksPerDart : null)
      const mpt = typeof ps?.marksPerTurn === 'number' ? ps.marksPerTurn : null
      const nstr = typeof ps?.turnsWithNoScore === 'number' && typeof ps?.turns === 'number' && ps.turns > 0
        ? ps.turnsWithNoScore / ps.turns : null
      const ts = Date.parse(m.createdAt || '') || 0
      list.push({
        id: m.id,
        ts,
        title: m.title || `Match ${m.id.slice(0, 6)}`,
        mpd, mpt, nstr,
        legsWon: ps.legsWon ?? 0,
        legsPlayed,
      })
    }
    return list.sort((a, b) => a.ts - b.ts)
  }, [playerId])

  return (
    <div style={ui.page}>
      <div style={ui.headerRow}>
        <div>
          <h2 style={{ margin: 0 }}>{name}</h2>
          <div style={ui.sub}>Cricket – Profil</div>
        </div>
        <button style={ui.backBtn} onClick={onBack}>← Zurück</button>
      </div>

      <div style={card}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 8 }}>Matches</div>
        {rows.length === 0 ? (
          <div style={{ ...ui.sub, textAlign: 'center' }}>Keine fertigen Matches.</div>
        ) : (
          <div style={{ display: 'grid', gap: 6 }}>
            <div style={headRow}>
              <div>Match</div>
              <div style={thRight}>Legs</div>
              <div style={thRight}>Mk/D</div>
              <div style={thRight}>Mk/T</div>
              <div style={thRight}>NoScore%</div>
            </div>
            {rows.map(r => (
              <div key={r.id} style={row}>
                <div>{new Date(r.ts).toLocaleDateString()} · {r.title}</div>
                <div style={num}>{r.legsWon}/{r.legsPlayed}</div>
                <div style={num}>{fmtFixed2(r.mpd)}</div>
                <div style={num}>{fmtFixed2(r.mpt)}</div>
                <div style={num}>{fmtPct(r.nstr)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

const card: React.CSSProperties = {
  border: '1px solid #e5e7eb',
  background: '#fff',
  borderRadius: 14,
  boxShadow: '0 1px 2px rgba(0,0,0,0.04), 0 10px 20px rgba(0,0,0,0.03)',
  padding: 14,
  display: 'grid',
  gap: 12,
  maxWidth: 720,
  margin: '12px auto',
}

const headRow: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 8ch 6ch 6ch 8ch',
  columnGap: 12,
  fontSize: 12,
  fontWeight: 700,
  color: '#475569',
  borderBottom: '1px solid #e2e8f0',
  padding: '6px 8px',
}

const row: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 8ch 6ch 6ch 8ch',
  columnGap: 12,
  padding: '8px 8px',
  borderBottom: '1px solid #e2e8f0',
  fontSize: 14,
  alignItems: 'baseline',
}

const thRight: React.CSSProperties = { textAlign: 'right' }
const num: React.CSSProperties = {
  fontVariantNumeric: 'tabular-nums',
  fontWeight: 600,
  textAlign: 'right',
  whiteSpace: 'nowrap',
}
