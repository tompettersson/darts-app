// src/screens/OperationMatchDetails.tsx
// Match-Details Screen fuer Operation (Stats-Area Drill-Down)

import React, { useMemo, useState } from 'react'
import { useTheme } from '../ThemeProvider'
import { getThemedUI } from '../ui'
import { getOperationMatchById } from '../storage'
import { applyOperationEvents, formatDuration, DARTS_PER_LEG } from '../dartsOperation'
import { computeOperationMatchStats, computeOperationLegStats } from '../stats/computeOperationStats'
import type { OperationDartEvent } from '../types/operation'
import StatTooltip, { STAT_TOOLTIPS } from '../components/StatTooltip'
import { PLAYER_COLORS } from '../playerColors'

type Props = {
  matchId: string
  onBack: () => void
}

export default function OperationMatchDetails({ matchId, onBack }: Props) {
  const { isArcade, colors } = useTheme()
  const styles = useMemo(() => getThemedUI(colors, isArcade), [colors, isArcade])

  const match = useMemo(() => getOperationMatchById(matchId), [matchId])
  const state = useMemo(() => match ? applyOperationEvents(match.events) : null, [match])

  const [selectedLeg, setSelectedLeg] = useState<number | null>(null)

  if (!match || !state) {
    return (
      <div style={styles.page}>
        <p style={{ color: colors.fg }}>Match nicht gefunden.</p>
        <button style={styles.pill} onClick={onBack}>Zurueck</button>
      </div>
    )
  }

  const targetModeLabel = match.config.targetMode === 'BULL' ? 'Bull' :
    match.config.targetMode === 'RANDOM_NUMBER' ? 'Zufallszahl' : 'Manuelle Zahl'

  const cardStyle: React.CSSProperties = {
    background: colors.bgCard,
    borderRadius: 12,
    padding: 16,
    border: `1px solid ${colors.border}`,
    marginBottom: 12,
  }

  const thLeft: React.CSSProperties = {
    textAlign: 'left', fontSize: 13, fontWeight: 600,
    color: colors.fgDim, padding: '8px 12px',
    borderBottom: `2px solid ${colors.border}`,
  }
  const thRight: React.CSSProperties = {
    textAlign: 'right', fontSize: 13, fontWeight: 700,
    color: colors.fg, padding: '8px 12px',
    borderBottom: `2px solid ${colors.border}`,
  }
  const tdLeft: React.CSSProperties = {
    padding: '10px 12px', borderBottom: `1px solid ${colors.bgMuted}`,
    fontWeight: 500, color: colors.fg,
  }
  const tdRight: React.CSSProperties = {
    padding: '10px 12px', borderBottom: `1px solid ${colors.bgMuted}`,
    textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600,
  }

  const statRow = (label: string, value: string | number, highlight = false): React.ReactNode => (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
      <span style={{ color: colors.fgDim, fontSize: 13 }}>{label}</span>
      <span style={{ color: highlight ? colors.accent : colors.fg, fontWeight: highlight ? 700 : 600, fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
    </div>
  )

  const hitTypeLabel = (ht: string) => {
    switch (ht) {
      case 'NO_SCORE': return 'Miss'
      case 'SINGLE': return 'S'
      case 'DOUBLE': return 'D'
      case 'TRIPLE': return 'T'
      case 'SINGLE_BULL': return 'SB'
      case 'DOUBLE_BULL': return 'DB'
      default: return ht
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.headerRow}>
        <h2 style={{ margin: 0, color: colors.fg }}>Operation: EFKG – Details</h2>
        <button style={styles.backBtn} onClick={onBack}>&larr; Zurueck</button>
      </div>

      <div style={styles.centerPage}>
        <div style={{ ...styles.centerInner, maxWidth: 560 }}>

          {/* Match Info */}
          <div style={cardStyle}>
            <div style={{ fontSize: 12, color: colors.fgDim }}>
              {new Date(match.createdAt).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
              {match.durationMs ? ` · ${formatDuration(match.durationMs)}` : ''}
            </div>
            <div style={{ fontSize: 14, color: colors.fg, fontWeight: 600, marginTop: 4 }}>
              {match.players.map(p => p.name).join(' vs ')}
            </div>
            <div style={{ fontSize: 12, color: colors.fgDim, marginTop: 2 }}>
              {match.config.legsCount} Leg{match.config.legsCount > 1 ? 's' : ''} · Modus: {targetModeLabel}
            </div>
            {match.winnerId && (
              <div style={{ fontSize: 13, color: colors.success, fontWeight: 600, marginTop: 4 }}>
                Sieger: {match.players.find(p => p.playerId === match.winnerId)?.name ?? '?'}
              </div>
            )}
          </div>

          {/* Legs Navigation */}
          {state.legs.length > 1 && (
            <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
              <button
                style={{
                  ...styles.pill,
                  ...(selectedLeg === null ? { borderColor: colors.accent, background: isArcade ? colors.accent : '#e0f2fe', color: isArcade ? '#fff' : '#0369a1' } : {}),
                }}
                onClick={() => setSelectedLeg(null)}
              >
                Gesamt
              </button>
              {state.legs.map((leg, i) => (
                <button
                  key={i}
                  style={{
                    ...styles.pill,
                    ...(selectedLeg === i ? { borderColor: colors.accent, background: isArcade ? colors.accent : '#e0f2fe', color: isArcade ? '#fff' : '#0369a1' } : {}),
                  }}
                  onClick={() => setSelectedLeg(i)}
                >
                  Leg {i + 1}{leg.targetNumber ? ` (${leg.targetNumber})` : leg.targetMode === 'BULL' ? ' (Bull)' : ''}
                </button>
              ))}
            </div>
          )}

          {/* Gesamt-Stats */}
          {selectedLeg === null && (() => {
            const allStats = match.players.map(p => computeOperationMatchStats(match, p.playerId)).filter(Boolean) as NonNullable<ReturnType<typeof computeOperationMatchStats>>[]
            if (allStats.length === 0) return null
            return (
              <div style={cardStyle}>
                <div style={{ fontWeight: 700, marginBottom: 12 }}>Match-Statistik</div>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={thLeft}></th>
                      {match.players.map((p, pi) => (
                        <th key={p.playerId} style={{ ...thRight, color: PLAYER_COLORS[pi % PLAYER_COLORS.length] }}>
                          {p.name} {match.winnerId === p.playerId && '\u{1F3C6}'}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td style={tdLeft}><StatTooltip label="Hit Score" tooltip={STAT_TOOLTIPS['Hit Score'] || 'Hit Score'} colors={colors} /></td>
                      {allStats.map((s, i) => <td key={i} style={{ ...tdRight, color: colors.accent, fontWeight: 700 }}>{s.totalHitScore} / {match.config.legsCount * 90}</td>)}
                    </tr>
                    <tr>
                      <td style={tdLeft}><StatTooltip label="Ø Hit/Dart" tooltip={STAT_TOOLTIPS['Ø Hit/Dart'] || 'Ø Hit/Dart'} colors={colors} /></td>
                      {allStats.map((s, i) => <td key={i} style={tdRight}>{s.avgHitScorePerDart.toFixed(2)}</td>)}
                    </tr>
                    <tr>
                      <td style={tdLeft}><StatTooltip label="Hit-Rate" tooltip={STAT_TOOLTIPS['Hit-Rate'] || 'Hit-Rate'} colors={colors} /></td>
                      {allStats.map((s, i) => <td key={i} style={tdRight}>{s.hitRate.toFixed(1)}%</td>)}
                    </tr>
                    <tr>
                      <td style={tdLeft}><StatTooltip label="Beste Streak" tooltip={STAT_TOOLTIPS['Beste Streak'] || 'Beste Streak'} colors={colors} /></td>
                      {allStats.map((s, i) => <td key={i} style={tdRight}>{s.maxHitStreak}x</td>)}
                    </tr>
                    <tr>
                      <td style={tdLeft}><StatTooltip label="Punkte" tooltip={STAT_TOOLTIPS['Punkte'] || 'Punkte'} colors={colors} /></td>
                      {allStats.map((s, i) => <td key={i} style={tdRight}>{s.totalScore}</td>)}
                    </tr>
                    <tr>
                      <td style={tdLeft}><StatTooltip label="Ø Pkt/Dart" tooltip={STAT_TOOLTIPS['Ø Pkt/Dart'] || 'Ø Pkt/Dart'} colors={colors} /></td>
                      {allStats.map((s, i) => <td key={i} style={tdRight}>{s.avgPointsPerDart.toFixed(1)}</td>)}
                    </tr>
                    <tr>
                      <td style={tdLeft}><StatTooltip label="Bester Turn" tooltip={STAT_TOOLTIPS['Bester Turn'] || 'Bester Turn'} colors={colors} /></td>
                      {allStats.map((s, i) => <td key={i} style={tdRight}>{s.bestTurnScore}</td>)}
                    </tr>
                    <tr>
                      <td style={tdLeft}><StatTooltip label="Darts" tooltip={STAT_TOOLTIPS['Darts'] || 'Darts'} colors={colors} /></td>
                      {allStats.map((s, i) => <td key={i} style={tdRight}>{s.totalDarts}</td>)}
                    </tr>
                    <tr><td colSpan={allStats.length + 1} style={{ borderBottom: `2px solid ${colors.border}`, padding: '4px 0' }}></td></tr>
                    <tr>
                      <td style={tdLeft}><StatTooltip label="Miss" tooltip={STAT_TOOLTIPS['Miss'] || 'Miss'} colors={colors} /></td>
                      {allStats.map((s, i) => <td key={i} style={tdRight}>{s.noScoreCount}</td>)}
                    </tr>
                    {match.config.targetMode === 'BULL' ? (
                      <>
                        <tr>
                          <td style={tdLeft}><StatTooltip label="S-Bull" tooltip={STAT_TOOLTIPS['S-Bull'] || 'S-Bull'} colors={colors} /></td>
                          {allStats.map((s, i) => <td key={i} style={tdRight}>{s.singleBullCount}</td>)}
                        </tr>
                        <tr>
                          <td style={tdLeft}><StatTooltip label="D-Bull" tooltip={STAT_TOOLTIPS['D-Bull'] || 'D-Bull'} colors={colors} /></td>
                          {allStats.map((s, i) => <td key={i} style={tdRight}>{s.doubleBullCount}</td>)}
                        </tr>
                      </>
                    ) : (
                      <>
                        <tr>
                          <td style={tdLeft}><StatTooltip label="Single" tooltip={STAT_TOOLTIPS['Single'] || 'Single'} colors={colors} /></td>
                          {allStats.map((s, i) => <td key={i} style={tdRight}>{s.singleCount}</td>)}
                        </tr>
                        <tr>
                          <td style={tdLeft}><StatTooltip label="Double" tooltip={STAT_TOOLTIPS['Double'] || 'Double'} colors={colors} /></td>
                          {allStats.map((s, i) => <td key={i} style={tdRight}>{s.doubleCount}</td>)}
                        </tr>
                        <tr>
                          <td style={tdLeft}><StatTooltip label="Triple" tooltip={STAT_TOOLTIPS['Triple'] || 'Triple'} colors={colors} /></td>
                          {allStats.map((s, i) => <td key={i} style={tdRight}>{s.tripleCount}</td>)}
                        </tr>
                      </>
                    )}
                  </tbody>
                </table>
              </div>
            )
          })()}

          {/* Leg Detail */}
          {selectedLeg !== null && (() => {
            const leg = state.legs[selectedLeg]
            if (!leg) return null
            return (
              <>
                <div style={{ ...cardStyle, background: colors.bgMuted }}>
                  <div style={{ fontWeight: 700, color: colors.fg, marginBottom: 4 }}>
                    Leg {selectedLeg + 1} – Ziel: {leg.targetNumber ?? 'Bull'}
                  </div>
                </div>

                {(() => {
                  const allLegStats = match.players.map(p => computeOperationLegStats(match, p.playerId, selectedLeg)).filter(Boolean) as NonNullable<ReturnType<typeof computeOperationLegStats>>[]
                  if (allLegStats.length === 0) return null
                  return (
                    <>
                      <div style={cardStyle}>
                        <div style={{ fontWeight: 700, marginBottom: 12 }}>Leg-Statistiken</div>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                          <thead>
                            <tr>
                              <th style={thLeft}></th>
                              {match.players.map((p, pi) => (
                                <th key={p.playerId} style={{ ...thRight, color: PLAYER_COLORS[pi % PLAYER_COLORS.length] }}>
                                  {p.name}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            <tr>
                              <td style={tdLeft}><StatTooltip label="Hit Score" tooltip={STAT_TOOLTIPS['Hit Score'] || 'Hit Score'} colors={colors} /></td>
                              {allLegStats.map((s, i) => <td key={i} style={{ ...tdRight, color: colors.accent, fontWeight: 700 }}>{s.hitScore}/90</td>)}
                            </tr>
                            <tr>
                              <td style={tdLeft}><StatTooltip label="Ø Hit/Dart" tooltip={STAT_TOOLTIPS['Ø Hit/Dart'] || 'Ø Hit/Dart'} colors={colors} /></td>
                              {allLegStats.map((s, i) => <td key={i} style={tdRight}>{s.avgHitScorePerDart.toFixed(2)}</td>)}
                            </tr>
                            <tr>
                              <td style={tdLeft}><StatTooltip label="Hit-Rate" tooltip={STAT_TOOLTIPS['Hit-Rate'] || 'Hit-Rate'} colors={colors} /></td>
                              {allLegStats.map((s, i) => <td key={i} style={tdRight}>{s.hitRate.toFixed(1)}%</td>)}
                            </tr>
                            <tr>
                              <td style={tdLeft}><StatTooltip label="Punkte" tooltip={STAT_TOOLTIPS['Punkte'] || 'Punkte'} colors={colors} /></td>
                              {allLegStats.map((s, i) => <td key={i} style={tdRight}>{s.totalScore}</td>)}
                            </tr>
                            <tr>
                              <td style={tdLeft}><StatTooltip label="Beste Streak" tooltip={STAT_TOOLTIPS['Beste Streak'] || 'Beste Streak'} colors={colors} /></td>
                              {allLegStats.map((s, i) => <td key={i} style={tdRight}>{s.maxHitStreak}x</td>)}
                            </tr>
                            <tr>
                              <td style={tdLeft}><StatTooltip label="Bester Turn" tooltip={STAT_TOOLTIPS['Bester Turn'] || 'Bester Turn'} colors={colors} /></td>
                              {allLegStats.map((s, i) => <td key={i} style={tdRight}>{s.bestTurnScore}</td>)}
                            </tr>
                          </tbody>
                        </table>
                      </div>

                      {/* Turn-Uebersicht pro Spieler */}
                      {match.players.map((p, pi) => {
                        const dartEvents = leg.players.find(lp => lp.playerId === p.playerId)?.events ?? []
                        const turns: OperationDartEvent[][] = []
                        for (const ev of dartEvents) {
                          if (!turns[ev.turnIndex - 1]) turns[ev.turnIndex - 1] = []
                          turns[ev.turnIndex - 1].push(ev)
                        }
                        if (turns.length === 0) return null
                        return (
                          <div key={p.playerId} style={cardStyle}>
                            <div style={{
                              fontWeight: 700, fontSize: 13, marginBottom: 8,
                              color: PLAYER_COLORS[pi % PLAYER_COLORS.length],
                              borderLeft: `3px solid ${PLAYER_COLORS[pi % PLAYER_COLORS.length]}`,
                              paddingLeft: 8,
                            }}>
                              {p.name} — Turns
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))', gap: 4 }}>
                              {turns.map((turnDarts, ti) => {
                                if (!turnDarts) return null
                                const turnScore = turnDarts.reduce((s, d) => s + d.points, 0)
                                return (
                                  <div key={ti} style={{
                                    background: colors.bgMuted, borderRadius: 6, padding: '4px 6px',
                                    fontSize: 11, textAlign: 'center',
                                  }}>
                                    <div style={{ fontWeight: 700, color: colors.fg }}>T{ti + 1}: {turnScore}</div>
                                    <div style={{ color: colors.fgDim }}>
                                      {turnDarts.map(d => hitTypeLabel(d.hitType)).join(' ')}
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )
                      })}
                    </>
                  )
                })()}
              </>
            )
          })()}

        </div>
      </div>
    </div>
  )
}
