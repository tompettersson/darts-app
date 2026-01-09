import React, { useMemo } from 'react'
import { ui } from '../ui'
import { getCricketComputedStats } from '../storage'
import type { CricketMatchComputedStats, CricketPlayerMatchStats } from '../types/stats'

type Props = {
  matchId: string
  onBackToMenu: () => void
  onRematch?: (oldMatchId: string) => void
  onHallOfFame?: () => void
}

const card: React.CSSProperties = {
  border: '1px solid #e5e7eb',
  background: '#fff',
  borderRadius: 14,
  boxShadow: '0 1px 2px rgba(0,0,0,0.04), 0 10px 20px rgba(0,0,0,0.03)',
  padding: 14,
  display: 'grid',
  gap: 12,
  maxWidth: 560,
  margin: '0 auto',
}
const row: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  columnGap: 12,
  rowGap: 6,
  alignItems: 'baseline',
}
const num: React.CSSProperties = { fontVariantNumeric: 'tabular-nums', fontWeight: 600, textAlign: 'right' }
function fmtFixed2(n: number | null | undefined): string { if (n == null || Number.isNaN(n)) return '—'; return n.toFixed(2) }

export default function CricketSummary({ matchId, onBackToMenu, onRematch, onHallOfFame }: Props) {
  const stats: CricketMatchComputedStats | null = useMemo(() => {
    try { return getCricketComputedStats(matchId) || null } catch { return null }
  }, [matchId])

  if (!stats) {
    return (
      <div style={ui.page}>
        <div style={ui.headerRow}>
          <div>
            <h2 style={{ margin: 0 }}>Cricket Summary</h2>
            <div style={ui.sub}>Keine Daten gefunden.</div>
          </div>
          <button style={ui.backBtn} onClick={onBackToMenu}>← Menü</button>
        </div>
      </div>
    )
  }

  const header = (
    <div style={ui.headerRow}>
      <div>
        <h2 style={{ margin: 0 }}>Cricket Summary</h2>
        <div style={ui.sub}>
          {stats.style.toUpperCase()} · {stats.range} · First to {stats.targetWins}
        </div>
      </div>
      <button style={ui.backBtn} onClick={onBackToMenu}>← Menü</button>
    </div>
  )

  const winner = [...stats.players].sort((a, b) => (b.legsWon - a.legsWon))[0]

  return (
    <div style={ui.page}>
      {header}

      {/* Winner */}
      <div style={card}>
        <div style={{ fontWeight: 700, fontSize: 16, textAlign: 'center' }}>
          Winner: {winner?.playerName}
        </div>
      </div>

      {/* Player Cards (ohne Bull-Accuracy) */}
      {stats.players.map((p: CricketPlayerMatchStats) => (
        <div key={p.playerId} style={card}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{p.playerName}</div>
          <div style={row}>
            <div>Legs won</div><div style={num}>{p.legsWon}</div>
            <div>Total Marks</div><div style={num}>{p.totalMarks}</div>
            <div>Marks/Turn</div><div style={num}>{fmtFixed2(p.marksPerTurn)}</div>
            <div>Marks/Dart</div><div style={num}>{fmtFixed2(p.marksPerDart)}</div>
            <div>No-Score-Turns</div><div style={num}>{p.turnsWithNoScore}</div>
            <div>Best Turn (Marks)</div><div style={num}>{p.bestTurnMarks}</div>
            <div>Best Turn (Points)</div><div style={num}>{p.bestTurnPoints}</div>
            <div>Triples Hit</div><div style={num}>{p.triplesHit}</div>
            <div>Doubles Hit</div><div style={num}>{p.doublesHit}</div>
          </div>
        </div>
      ))}

      {/* Highlights */}
      <div style={card}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>Highlights</div>
        <div style={row}>
          <div>Best Turn (Marks)</div>
          <div style={num}>
            {stats.players.reduce((m, x) => Math.max(m, x.bestTurnMarks || 0), 0)}
          </div>
          <div>Fastest Leg</div>
          <div style={num}>
            {stats.fastestLegByMarks ? `${stats.fastestLegByMarks.dartsThrown} Darts · ${stats.fastestLegByMarks.marks}` : '—'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', paddingTop: 8 }}>
          {onRematch && <button onClick={() => onRematch(matchId)} style={ui.backBtn}>↻ Rematch</button>}
          {onHallOfFame && <button onClick={onHallOfFame} style={ui.backBtn}>🏆 Hall of Fame</button>}
        </div>
      </div>
    </div>
  )
}
