// src/components/ShanghaiAggregateSection.tsx
// Wiederverwendbare Aggregat-Anzeige fuer Shanghai-Matches ueber mehrere Legs.

import React, { useMemo } from 'react'
import type { ShanghaiStoredMatch, ShanghaiPlayer } from '../types/shanghai'
import {
  computeShanghaiMatchAggregateStats,
  type ShanghaiMatchAggregateStats,
} from '../stats/computeShanghaiMatchAggregateStats'
import StatTooltip from './StatTooltip'

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
              {aggRow('Legs gespielt', aggregates, a => String(a.stats?.legsPlayed ?? 0), colors, undefined, 'Anzahl abgeschlossener Legs (je 20 Runden).')}
              {aggRow('\u00d8 Score', aggregates, a => (a.stats?.avgFinalScore ?? 0).toFixed(1), colors, undefined, 'Durchschnittlicher Leg-Endscore. Max 1890 (alle 20 Runden 3× Triple).')}
              {aggRow('\u00d8 Score %', aggregates, a => `${(a.stats?.avgScorePercent ?? 0).toFixed(1)}%`, colors, 'accent', 'Ø Leg-Score geteilt durch 1890 (Maximum). Wichtigste Leistungskennzahl.')}
              {aggRow('Bestes Leg', aggregates, a => String(a.stats?.bestLegScore ?? 0), colors, 'success', 'Höchster Leg-Endscore in diesem Match.')}
              {aggRow('Schlechtestes Leg', aggregates, a => String(a.stats?.worstLegScore ?? 0), colors, 'error', 'Niedrigster Leg-Endscore in diesem Match.')}
              {aggRow('\u00d8 Trefferquote', aggregates, a => `${(a.stats?.avgHitRatePerDart ?? 0).toFixed(1)}%`, colors, undefined, 'Anteil der Darts die das Zielfeld dieser Runde trafen (über alle Legs).')}
              {aggRow('\u00d8 Aufnahme-Quote', aggregates, a => `${(a.stats?.avgVisitHitRate ?? 0).toFixed(1)}%`, colors, undefined, 'Anteil der Runden mit mindestens 1 Treffer auf die Zielzahl.')}
              {aggRow('\u00d8 Triple-Rate', aggregates, a => `${(a.stats?.avgTripleRate ?? 0).toFixed(1)}%`, colors, undefined, 'Anteil der Treffer die Triples waren. Höher = gezielterer Scoring-Stil.')}
              {aggRow('\u00d8 Effizienz', aggregates, a => (a.stats?.avgEfficiency ?? 0).toFixed(1), colors, undefined, 'Punkte pro Treffer. Höher = wertvollere Treffer (mehr Triples).')}
              {aggRow('\u00d8 Aggressions-Index', aggregates, a => `${(a.stats?.avgAggressionIndex ?? 0).toFixed(1)}%`, colors, undefined, 'Triple-Hits im Verhältnis zu allen Darts. Misst Risiko-/Triple-Orientierung.')}
              {aggRow('\u00d8 Clutch Score', aggregates, a => (a.stats?.avgClutchScore ?? 0).toFixed(1), colors, undefined, 'Durchschnittlich erzielte Punkte in den hohen Runden 15–20 (Scoring-Phase).')}
              {aggRow('\u00d8 Zero Rounds', aggregates, a => (a.stats?.avgZeroRounds ?? 0).toFixed(1), colors, undefined, 'Ø Runden pro Leg ohne einen einzigen Treffer auf die Zielzahl.')}
              {aggRow('\u00d8 Konsistenz', aggregates, a => `${(a.stats?.avgConsistencyRate ?? 0).toFixed(1)}%`, colors, undefined, 'Anteil der Runden mit mindestens 2 Treffern. Höher = stabiler.')}
              {aggRow('Shanghai-Rate', aggregates, a => `${(a.stats?.shanghaiRate ?? 0).toFixed(1)}%`, colors, 'accent', 'Anteil der Legs mit einem Shanghai (S+D+T einer Zahl in einer Aufnahme).')}
              {aggRow('Konstanz (\u03c3)', aggregates, a => (a.stats?.scoreStdDev ?? 0).toFixed(1), colors, undefined, 'Standardabweichung der Leg-Endscores. Niedriger = stabilere Leistung.')}
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
  tooltip?: string,
) {
  const color =
    tone === 'success' ? colors.success :
    tone === 'error' ? colors.error :
    tone === 'accent' ? colors.accent :
    colors.fg
  return (
    <tr key={label}>
      <td style={{ padding: '5px 8px', color: colors.fgMuted, borderBottom: `1px solid ${colors.border}`, whiteSpace: 'nowrap' }}>
        {tooltip ? <StatTooltip label={label} tooltip={tooltip} colors={colors} /> : label}
      </td>
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
