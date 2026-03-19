// src/screens/OperationMatchDetails.tsx
// Match-Details Screen fuer Operation (Stats-Area Drill-Down)

import React, { useMemo, useState } from 'react'
import { useTheme } from '../ThemeProvider'
import { getThemedUI } from '../ui'
import { getOperationMatchById } from '../storage'
import { applyOperationEvents, formatDuration, DARTS_PER_LEG } from '../dartsOperation'
import { computeOperationMatchStats, computeOperationLegStats } from '../stats/computeOperationStats'
import type { OperationDartEvent } from '../types/operation'
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
          {selectedLeg === null && match.players.map((p, pi) => {
            const stats = computeOperationMatchStats(match, p.playerId)
            if (!stats) return null
            return (
              <div key={p.playerId} style={cardStyle}>
                <div style={{
                  fontWeight: 700, fontSize: 14, marginBottom: 8,
                  color: PLAYER_COLORS[pi % PLAYER_COLORS.length],
                  borderLeft: `3px solid ${PLAYER_COLORS[pi % PLAYER_COLORS.length]}`,
                  paddingLeft: 8,
                }}>
                  {p.name}
                </div>
                {statRow('Hit Score', `${stats.totalHitScore} / ${match.config.legsCount * 90}`, true)}
                {statRow('Ø Hit/Dart', stats.avgHitScorePerDart.toFixed(2))}
                {statRow('Hit-Rate', `${stats.hitRate.toFixed(1)}%`)}
                {statRow('Beste Streak', `${stats.maxHitStreak}x`)}
                {statRow('Punkte', stats.totalScore)}
                {statRow('Ø Punkte/Dart', stats.avgPointsPerDart.toFixed(1))}
                {statRow('Bester Turn', stats.bestTurnScore)}
                {statRow('Darts', stats.totalDarts)}

                <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${colors.border}` }}>
                  <div style={{ fontSize: 12, color: colors.fgDim, marginBottom: 4 }}>Verteilung</div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 12, background: colors.bgMuted, padding: '2px 6px', borderRadius: 4, color: colors.fg }}>
                      Miss: {stats.noScoreCount}
                    </span>
                    {match.config.targetMode === 'BULL' ? (
                      <>
                        <span style={{ fontSize: 12, background: colors.bgMuted, padding: '2px 6px', borderRadius: 4, color: colors.fg }}>SB: {stats.singleBullCount}</span>
                        <span style={{ fontSize: 12, background: colors.bgMuted, padding: '2px 6px', borderRadius: 4, color: colors.fg }}>DB: {stats.doubleBullCount}</span>
                      </>
                    ) : (
                      <>
                        <span style={{ fontSize: 12, background: colors.bgMuted, padding: '2px 6px', borderRadius: 4, color: colors.fg }}>S: {stats.singleCount}</span>
                        <span style={{ fontSize: 12, background: colors.bgMuted, padding: '2px 6px', borderRadius: 4, color: colors.fg }}>D: {stats.doubleCount}</span>
                        <span style={{ fontSize: 12, background: colors.bgMuted, padding: '2px 6px', borderRadius: 4, color: colors.fg }}>T: {stats.tripleCount}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )
          })}

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

                {match.players.map((p, pi) => {
                  const ls = computeOperationLegStats(match, p.playerId, selectedLeg)
                  if (!ls) return null

                  // Turns fuer diesen Spieler
                  const dartEvents = leg.players.find(lp => lp.playerId === p.playerId)?.events ?? []
                  const turns: OperationDartEvent[][] = []
                  for (const ev of dartEvents) {
                    if (!turns[ev.turnIndex - 1]) turns[ev.turnIndex - 1] = []
                    turns[ev.turnIndex - 1].push(ev)
                  }

                  return (
                    <div key={p.playerId} style={cardStyle}>
                      <div style={{
                        fontWeight: 700, fontSize: 14, marginBottom: 8,
                        color: PLAYER_COLORS[pi % PLAYER_COLORS.length],
                        borderLeft: `3px solid ${PLAYER_COLORS[pi % PLAYER_COLORS.length]}`,
                        paddingLeft: 8,
                      }}>
                        {p.name}
                      </div>

                      {statRow('Hit Score', `${ls.hitScore}/90`, true)}
                      {statRow('Ø Hit/Dart', ls.avgHitScorePerDart.toFixed(2))}
                      {statRow('Hit-Rate', `${ls.hitRate.toFixed(1)}%`)}
                      {statRow('Punkte', ls.totalScore)}
                      {statRow('Streak', `${ls.maxHitStreak}x`)}
                      {statRow('Bester Turn', ls.bestTurnScore)}

                      {/* Turn-Uebersicht */}
                      <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${colors.border}` }}>
                        <div style={{ fontSize: 12, color: colors.fgDim, marginBottom: 4 }}>Turns</div>
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
                    </div>
                  )
                })}
              </>
            )
          })()}

        </div>
      </div>
    </div>
  )
}
