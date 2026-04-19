// src/components/Bobs27AggregateSection.tsx
// Wiederverwendbare Aggregat-Anzeige fuer Bob's-27-Matches ueber mehrere Legs.
// Wird in Bobs27Summary und Bobs27MatchDetails eingebunden.
// Bull wird in Kennzahlen strikt separiert (eigene Zeile).

import React, { useMemo } from 'react'
import type { Bobs27StoredMatch, Bobs27Player } from '../types/bobs27'
import { computeBobs27MatchAggregateStats, type Bobs27MatchAggregateStats } from '../stats/computeBobs27MatchAggregateStats'
import type { Bobs27LegStats } from '../stats/computeBobs27LegStats'
import StatTooltip from './StatTooltip'

// Best-Leg = nicht-eliminiertes Leg mit höchstem Score, sonst höchster Score insgesamt.
function pickBestLeg(perLeg: Bobs27LegStats[]): Bobs27LegStats | null {
  if (perLeg.length === 0) return null
  const nonElim = perLeg.filter(l => !l.eliminated)
  const pool = nonElim.length > 0 ? nonElim : perLeg
  return pool.reduce((b, l) => l.finalScore > b.finalScore ? l : b)
}

// Worst-Leg = frühste Elimination (kleinster eliminatedAtTarget), sonst niedrigster Score.
function pickWorstLeg(perLeg: Bobs27LegStats[]): Bobs27LegStats | null {
  if (perLeg.length === 0) return null
  const elim = perLeg.filter(l => l.eliminated)
  if (elim.length > 0) {
    return elim.reduce((w, l) =>
      (l.eliminatedAtTarget ?? Infinity) < (w.eliminatedAtTarget ?? Infinity) ? l : w)
  }
  return perLeg.reduce((w, l) => l.finalScore < w.finalScore ? l : w)
}

function formatBestLeg(leg: Bobs27LegStats | null): string {
  if (!leg) return '\u2013'
  return leg.finalScore >= 0 ? `+${leg.finalScore}` : String(leg.finalScore)
}

function formatWorstLeg(leg: Bobs27LegStats | null): string {
  if (!leg) return '\u2013'
  if (leg.eliminated && leg.eliminatedAtTarget !== null) {
    return `Elim. bei D${leg.eliminatedAtTarget + 1}`
  }
  return leg.finalScore >= 0 ? `+${leg.finalScore}` : String(leg.finalScore)
}

type Props = {
  match: Bobs27StoredMatch
  players: Bobs27Player[]
  playerColor: (playerId: string) => string
  colors: any
  styles: any
  onOpenLeg?: (legIndex: number) => void
}

export default function Bobs27AggregateSection({
  match, players, playerColor, colors, styles, onOpenLeg,
}: Props) {
  const aggregates = useMemo(() => {
    return players.map(p => ({
      playerId: p.playerId,
      name: p.name,
      color: playerColor(p.playerId),
      stats: computeBobs27MatchAggregateStats(match, p.playerId),
    }))
  }, [players, match, playerColor])

  // Nur anzeigen wenn tatsaechlich mehr als 1 Leg gespielt wurde
  const legsPlayed = aggregates.find(a => a.stats)?.stats?.legsPlayed ?? 0
  if (legsPlayed <= 1) return null

  const legCount = Math.max(...aggregates.map(a => a.stats?.legsPlayed ?? 0))

  return (
    <>
      {/* Match-Aggregat-Karte */}
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
              {aggRow('Legs gespielt', aggregates, a => String(a.stats?.legsPlayed ?? 0), colors, undefined, 'Anzahl abgeschlossener Legs in diesem Match.')}
              {aggRow('\u00d8 Endscore', aggregates, a => (a.stats?.avgFinalScore ?? 0).toFixed(1), colors, undefined, 'Durchschnittlicher Endscore über alle Legs (Start 27, +/- je nach Doppel-Treffern).')}
              {aggRow('Bestes Leg', aggregates, a => formatBestLeg(pickBestLeg(a.stats?.perLeg ?? [])), colors, 'success', 'Leg mit dem höchsten Endscore. Nicht-eliminierte Legs werden bevorzugt.')}
              {aggRow('Schlechtestes Leg', aggregates, a => formatWorstLeg(pickWorstLeg(a.stats?.perLeg ?? [])), colors, 'error', 'Bei Eliminierung: wie weit gekommen (Abbruch-Doppel). Sonst niedrigster Endscore.')}
              {aggRow('\u00d8 Doppelquote (Dart, D1\u2013D20)', aggregates, a => `${(a.stats?.avgDoubleRatePerDart ?? 0).toFixed(1)}%`, colors, undefined, 'Mittlere Trefferquote pro Dart auf D1–D20 (ohne Bull). Max 100%.')}
              {aggRow('\u00d8 Doppelquote (Aufnahme, D1\u2013D20)', aggregates, a => `${(a.stats?.avgDoubleRatePerVisit ?? 0).toFixed(1)}%`, colors, undefined, 'Mittlerer Anteil der D1–D20-Aufnahmen mit mindestens 1 Treffer.')}
              {anyBullPlayed(aggregates) && aggRow('\u00d8 Bull-Quote (Dart, extra)', aggregates, a => formatNullable(a.stats?.avgBullRatePerDart, v => `${v.toFixed(1)}%`), colors, 'accent', 'Mittlere Bull-Trefferquote pro Dart – separat von D1–D20.')}
              {anyBullPlayed(aggregates) && aggRow('Bull-Aufnahmen getroffen', aggregates, a => formatNullable(a.stats?.bullLegsWithHit, v => String(v)), colors, 'accent', 'Anzahl Legs mit mindestens 1 Bull-Treffer.')}
              {aggRow('\u00d8 Zero Visits', aggregates, a => (a.stats?.avgZeroVisits ?? 0).toFixed(1), colors, undefined, 'Durchschnitt pro Leg: Doppel-Aufnahmen ohne einen Treffer (0/3).')}
              {aggRow('Gesamt Treffer', aggregates, a => String(a.stats?.totalHits ?? 0), colors, undefined, 'Summe der Doppel-Treffer über das ganze Match.')}
              {aggRow('Gesamt Darts', aggregates, a => String(a.stats?.totalDarts ?? 0), colors, undefined, 'Summe aller geworfenen Darts über das ganze Match.')}
              {aggRow('Konstanz (\u03c3)', aggregates, a => (a.stats?.scoreStdDev ?? 0).toFixed(1), colors, undefined, 'Standardabweichung der Leg-Endscores. Niedriger = stabilere Leistung.')}
            </tbody>
          </table>
        </div>
      </div>

      {/* Leg-Liste */}
      <div style={{ ...styles.card, marginBottom: 16 }}>
        <div style={{ ...styles.sub, marginBottom: 8 }}>
          Legs einzeln ansehen
        </div>
        <div style={{ display: 'grid', gap: 6 }}>
          {Array.from({ length: legCount }).map((_, legIdx) => {
            const row = aggregates.map(a => ({
              name: a.name,
              color: a.color,
              score: a.stats?.perLeg[legIdx]?.finalScore ?? null,
              hitRate: a.stats?.perLeg[legIdx]?.doubleRatePerDart ?? null,
              eliminated: a.stats?.perLeg[legIdx]?.eliminated ?? false,
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
                    <span key={i} style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                      color: r.eliminated ? colors.error : colors.fg,
                    }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: r.color }} />
                      <strong>{r.name}</strong>: {r.score ?? '\u2013'} · {r.hitRate !== null ? `${r.hitRate.toFixed(0)}%` : '\u2013'}
                      {r.eliminated && ' \u2620'}
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
  aggregates: Array<{ playerId: string; stats: Bobs27MatchAggregateStats | null }>,
  render: (a: { stats: Bobs27MatchAggregateStats | null }) => string,
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

function anyBullPlayed(aggregates: Array<{ stats: Bobs27MatchAggregateStats | null }>): boolean {
  return aggregates.some(a => a.stats?.avgBullRatePerDart !== null && a.stats?.avgBullRatePerDart !== undefined)
}

function formatNullable<T>(v: T | null | undefined, fn: (v: T) => string): string {
  if (v === null || v === undefined) return '\u2013'
  return fn(v)
}
