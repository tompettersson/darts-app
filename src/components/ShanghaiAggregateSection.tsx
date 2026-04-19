// src/components/ShanghaiAggregateSection.tsx
// Wiederverwendbare Aggregat-Anzeige fuer Shanghai-Matches ueber mehrere Legs.

import React, { useMemo } from 'react'
import type { ShanghaiStoredMatch, ShanghaiPlayer } from '../types/shanghai'
import {
  computeShanghaiMatchAggregateStats,
  type ShanghaiMatchAggregateStats,
} from '../stats/computeShanghaiMatchAggregateStats'

type Props = {
  match: ShanghaiStoredMatch
  players: ShanghaiPlayer[]
  playerColor: (playerId: string) => string
  colors: any
  styles: any
  onOpenLeg?: (legIndex: number) => void
}

export default function ShanghaiAggregateSection({
  match, players, playerColor, colors, styles, onOpenLeg,
}: Props) {
  const aggregates = useMemo(() => {
    return players.map(p => ({
      playerId: p.playerId,
      name: p.name,
      color: playerColor(p.playerId),
      stats: computeShanghaiMatchAggregateStats(match, p.playerId),
    }))
  }, [players, match, playerColor])

  const legsPlayed = aggregates.find(a => a.stats)?.stats?.legsPlayed ?? 0
  if (legsPlayed <= 1) return null

  const legCount = Math.max(...aggregates.map(a => a.stats?.legsPlayed ?? 0))

  return (
    <>
      <div style={{ ...styles.card, marginBottom: 16 }}>
        <div style={{ ...styles.sub, marginBottom: 8 }}>
          Match-Aggregate ueber {legsPlayed} Legs
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '6px 8px', color: colors.fgMuted, borderBottom: `1px solid ${colors.border}` }}>Kennzahl</th>
                {aggregates.map(a => (
                  <th key={a.playerId} style={{
                    textAlign: 'right', padding: '6px 8px', color: a.color,
                    borderBottom: `1px solid ${colors.border}`, fontWeight: 700,
                  }}>
                    {a.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {aggRow('Legs gespielt', aggregates, a => String(a.stats?.legsPlayed ?? 0), colors)}
              {aggRow('\u00d8 Score', aggregates, a => (a.stats?.avgFinalScore ?? 0).toFixed(1), colors)}
              {aggRow('\u00d8 Score %', aggregates, a => `${(a.stats?.avgScorePercent ?? 0).toFixed(1)}%`, colors, 'accent')}
              {aggRow('Bestes Leg', aggregates, a => String(a.stats?.bestLegScore ?? 0), colors, 'success')}
              {aggRow('Schlechtestes Leg', aggregates, a => String(a.stats?.worstLegScore ?? 0), colors, 'error')}
              {aggRow('\u00d8 Trefferquote', aggregates, a => `${(a.stats?.avgHitRatePerDart ?? 0).toFixed(1)}%`, colors)}
              {aggRow('\u00d8 Aufnahme-Quote', aggregates, a => `${(a.stats?.avgVisitHitRate ?? 0).toFixed(1)}%`, colors)}
              {aggRow('\u00d8 Triple-Rate', aggregates, a => `${(a.stats?.avgTripleRate ?? 0).toFixed(1)}%`, colors)}
              {aggRow('\u00d8 Effizienz', aggregates, a => (a.stats?.avgEfficiency ?? 0).toFixed(1), colors)}
              {aggRow('\u00d8 Aggressions-Index', aggregates, a => `${(a.stats?.avgAggressionIndex ?? 0).toFixed(1)}%`, colors)}
              {aggRow('\u00d8 Clutch Score', aggregates, a => (a.stats?.avgClutchScore ?? 0).toFixed(1), colors)}
              {aggRow('\u00d8 Zero Rounds', aggregates, a => (a.stats?.avgZeroRounds ?? 0).toFixed(1), colors)}
              {aggRow('\u00d8 Konsistenz', aggregates, a => `${(a.stats?.avgConsistencyRate ?? 0).toFixed(1)}%`, colors)}
              {aggRow('Shanghai-Rate', aggregates, a => `${(a.stats?.shanghaiRate ?? 0).toFixed(1)}%`, colors, 'accent')}
              {aggRow('Konstanz (\u03c3)', aggregates, a => (a.stats?.scoreStdDev ?? 0).toFixed(1), colors)}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ ...styles.card, marginBottom: 16 }}>
        <div style={{ ...styles.sub, marginBottom: 8 }}>Legs einzeln ansehen</div>
        <div style={{ display: 'grid', gap: 6 }}>
          {Array.from({ length: legCount }).map((_, legIdx) => {
            const row = aggregates.map(a => ({
              name: a.name,
              color: a.color,
              score: a.stats?.perLeg[legIdx]?.finalScore ?? null,
              scorePct: a.stats?.perLeg[legIdx]?.scorePercent ?? null,
              shanghai: a.stats?.perLeg[legIdx]?.shanghaiAchieved ?? false,
            }))
            const clickable = !!onOpenLeg
            return (
              <button
                key={legIdx}
                onClick={clickable ? () => onOpenLeg!(legIdx) : undefined}
                disabled={!clickable}
                style={{
                  textAlign: 'left',
                  padding: '10px 12px', borderRadius: 8,
                  border: `1px solid ${colors.border}`,
                  background: colors.bgCard ?? colors.bgMuted,
                  color: colors.fg,
                  cursor: clickable ? 'pointer' : 'default',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10,
                }}>
                <span style={{ fontWeight: 700, fontSize: 14, minWidth: 60 }}>Leg {legIdx + 1}</span>
                <span style={{ flex: 1, display: 'flex', flexWrap: 'wrap', gap: 10, fontSize: 12 }}>
                  {row.map((r, i) => (
                    <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: r.color }} />
                      <strong>{r.name}</strong>: {r.score ?? '\u2013'}
                      {r.scorePct !== null && ` (${r.scorePct.toFixed(0)}%)`}
                      {r.shanghai && ' \u2605'}
                    </span>
                  ))}
                </span>
                {clickable && <span style={{ color: colors.fgMuted, fontSize: 18 }}>{'\u203a'}</span>}
              </button>
            )
          })}
        </div>
      </div>
    </>
  )
}

function aggRow(
  label: string,
  aggregates: Array<{ playerId: string; stats: ShanghaiMatchAggregateStats | null }>,
  render: (a: { stats: ShanghaiMatchAggregateStats | null }) => string,
  colors: any,
  tone?: 'success' | 'error' | 'accent',
) {
  const color =
    tone === 'success' ? colors.success :
    tone === 'error' ? colors.error :
    tone === 'accent' ? colors.accent :
    colors.fg
  return (
    <tr key={label}>
      <td style={{ padding: '5px 8px', color: colors.fgMuted, borderBottom: `1px solid ${colors.border}`, whiteSpace: 'nowrap' }}>{label}</td>
      {aggregates.map(a => (
        <td key={a.playerId} style={{
          padding: '5px 8px', textAlign: 'right', fontWeight: 600,
          borderBottom: `1px solid ${colors.border}`, color,
        }}>
          {render(a)}
        </td>
      ))}
    </tr>
  )
}
