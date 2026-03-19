// src/screens/OperationSummary.tsx
// Match-Summary Screen fuer Operation

import React, { useMemo } from 'react'
import { useTheme } from '../ThemeProvider'
import { getThemedUI } from '../ui'
import { getOperationMatchById } from '../storage'
import { applyOperationEvents, formatDuration } from '../dartsOperation'
import { computeOperationMatchStats } from '../stats/computeOperationStats'
import { PLAYER_COLORS } from '../playerColors'

type Props = {
  matchId: string
  onBackToMenu: () => void
  onRematch: () => void
}

export default function OperationSummary({ matchId, onBackToMenu, onRematch }: Props) {
  const { isArcade, colors } = useTheme()
  const styles = useMemo(() => getThemedUI(colors, isArcade), [colors, isArcade])

  const match = useMemo(() => getOperationMatchById(matchId), [matchId])
  const state = useMemo(() => match ? applyOperationEvents(match.events) : null, [match])

  if (!match || !state) {
    return (
      <div style={styles.page}>
        <p style={{ color: colors.fg }}>Match nicht gefunden.</p>
        <button style={styles.pill} onClick={onBackToMenu}>Zurueck</button>
      </div>
    )
  }

  const isSolo = match.players.length === 1
  const finished = state.finished

  // Rankings nach Hit Score (faire Bewertung unabhaengig von Zielzahl)
  const rankings = match.players
    .map((p, i) => {
      const stats = computeOperationMatchStats(match, p.playerId)
      return {
        ...p,
        index: i,
        totalScore: stats?.totalScore ?? 0,
        totalHitScore: stats?.totalHitScore ?? 0,
        hitRate: stats?.hitRate ?? 0,
        avgPointsPerDart: stats?.avgPointsPerDart ?? 0,
        avgHitScorePerDart: stats?.avgHitScorePerDart ?? 0,
        maxHitStreak: stats?.maxHitStreak ?? 0,
        bestTurnScore: stats?.bestTurnScore ?? 0,
        legScores: stats?.legScores ?? [],
        legHitScores: stats?.legHitScores ?? [],
        noScoreCount: stats?.noScoreCount ?? 0,
        singleCount: stats?.singleCount ?? 0,
        doubleCount: stats?.doubleCount ?? 0,
        tripleCount: stats?.tripleCount ?? 0,
        singleBullCount: stats?.singleBullCount ?? 0,
        doubleBullCount: stats?.doubleBullCount ?? 0,
        legsWon: finished?.legWins?.[p.playerId] ?? state.totalsByPlayer[p.playerId]?.legsWon ?? 0,
      }
    })
    .sort((a, b) => b.totalHitScore - a.totalHitScore)

  const winner = finished?.winnerId ? match.players.find(p => p.playerId === finished.winnerId) : null

  const cardStyle: React.CSSProperties = {
    background: colors.bgCard,
    borderRadius: 12,
    padding: 16,
    border: `1px solid ${colors.border}`,
  }

  const statRow = (label: string, value: string | number, highlight = false): React.ReactNode => (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
      <span style={{ color: colors.fgDim, fontSize: 13 }}>{label}</span>
      <span style={{ color: highlight ? colors.accent : colors.fg, fontWeight: highlight ? 700 : 600, fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
    </div>
  )

  return (
    <div style={styles.page}>
      <div style={styles.centerPage}>
        <div style={{ ...styles.centerInner, maxWidth: 560 }}>
          {/* Header */}
          <div style={{ textAlign: 'center', marginBottom: 8 }}>
            <h2 style={{ margin: 0, color: colors.fg }}>Operation: EFKG – Ergebnis</h2>
            {finished && (
              <div style={{ color: colors.fgDim, fontSize: 13, marginTop: 4 }}>
                Dauer: {formatDuration(finished.durationMs)} · {match.config.legsCount} Leg{match.config.legsCount > 1 ? 's' : ''}
              </div>
            )}
          </div>

          {/* Hit Score Ergebnis (faire Bewertung) */}
          <div style={{ ...cardStyle, textAlign: 'center', marginBottom: 12 }}>
            {isSolo ? (
              <>
                <div style={{ fontSize: 14, color: colors.fgDim }}>Hit Score</div>
                <div style={{ fontSize: 36, fontWeight: 800, color: colors.accent, fontVariantNumeric: 'tabular-nums' }}>
                  {rankings[0]?.totalHitScore ?? 0}
                </div>
                <div style={{ fontSize: 12, color: colors.fgDim }}>
                  von {(match.config.legsCount * 30 * 3)} moeglich (S=1 D=2 T=3)
                </div>
              </>
            ) : winner ? (
              <>
                <div style={{ fontSize: 14, color: colors.fgDim }}>Sieger</div>
                <div style={{ fontSize: 24, fontWeight: 800, color: PLAYER_COLORS[match.players.findIndex(p => p.playerId === winner.playerId) % PLAYER_COLORS.length] }}>
                  {winner.name}
                </div>
                <div style={{ fontSize: 28, fontWeight: 800, color: colors.accent, fontVariantNumeric: 'tabular-nums' }}>
                  {finished?.finalHitScores?.[winner.playerId] ?? 0} Hit Score
                </div>
                <div style={{ fontSize: 12, color: colors.fgDim }}>
                  ({finished?.finalScores?.[winner.playerId] ?? 0} Punkte)
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize: 14, color: colors.fgDim }}>Unentschieden</div>
                <div style={{ fontSize: 24, fontWeight: 800, color: colors.fg }}>Gleichstand!</div>
              </>
            )}
          </div>

          {/* Rankings */}
          {!isSolo && (
            <div style={{ ...cardStyle, marginBottom: 12 }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: colors.fg, marginBottom: 8 }}>Rankings</div>
              {rankings.map((r, rank) => (
                <div key={r.playerId} style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0',
                  borderTop: rank > 0 ? `1px solid ${colors.border}` : undefined,
                }}>
                  <span style={{ fontWeight: 800, fontSize: 16, color: colors.fgDim, width: 24 }}>{rank + 1}.</span>
                  <span style={{ flex: 1, fontWeight: 600, color: PLAYER_COLORS[r.index % PLAYER_COLORS.length] }}>{r.name}</span>
                  <span style={{ fontWeight: 800, fontSize: 18, color: colors.fg, fontVariantNumeric: 'tabular-nums' }}>{r.totalHitScore}</span>
                  {match.config.legsCount > 1 && (
                    <span style={{ fontSize: 11, color: colors.fgDim }}>({r.legsWon}L)</span>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Stats per Player */}
          {rankings.map((r) => (
            <div key={r.playerId} style={{ ...cardStyle, marginBottom: 12 }}>
              <div style={{
                fontWeight: 700, fontSize: 14, marginBottom: 8,
                color: PLAYER_COLORS[r.index % PLAYER_COLORS.length],
                borderLeft: `3px solid ${PLAYER_COLORS[r.index % PLAYER_COLORS.length]}`,
                paddingLeft: 8,
              }}>
                {r.name}
              </div>
              {statRow('Hit Score', `${r.totalHitScore} / ${match.config.legsCount * 90}`, true)}
              {statRow('Ø Hit Score/Dart', r.avgHitScorePerDart.toFixed(2))}
              {statRow('Hit-Rate', `${r.hitRate.toFixed(1)}%`)}
              {statRow('Beste Streak', `${r.maxHitStreak}x`)}
              {statRow('Punkte', r.totalScore)}
              {statRow('Ø Punkte/Dart', r.avgPointsPerDart.toFixed(1))}
              {statRow('Bester Turn', r.bestTurnScore)}
              {match.config.legsCount > 1 && statRow('Legs gewonnen', r.legsWon)}

              {/* Trefferverteilung */}
              <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${colors.border}` }}>
                <div style={{ fontSize: 12, color: colors.fgDim, marginBottom: 4 }}>Trefferverteilung</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12, background: colors.bgMuted, padding: '2px 6px', borderRadius: 4 }}>
                    Miss: {r.noScoreCount}
                  </span>
                  {match.config.targetMode === 'BULL' ? (
                    <>
                      <span style={{ fontSize: 12, background: colors.bgMuted, padding: '2px 6px', borderRadius: 4 }}>
                        S-Bull: {r.singleBullCount}
                      </span>
                      <span style={{ fontSize: 12, background: colors.bgMuted, padding: '2px 6px', borderRadius: 4 }}>
                        D-Bull: {r.doubleBullCount}
                      </span>
                    </>
                  ) : (
                    <>
                      <span style={{ fontSize: 12, background: colors.bgMuted, padding: '2px 6px', borderRadius: 4 }}>
                        S: {r.singleCount}
                      </span>
                      <span style={{ fontSize: 12, background: colors.bgMuted, padding: '2px 6px', borderRadius: 4 }}>
                        D: {r.doubleCount}
                      </span>
                      <span style={{ fontSize: 12, background: colors.bgMuted, padding: '2px 6px', borderRadius: 4 }}>
                        T: {r.tripleCount}
                      </span>
                    </>
                  )}
                </div>
              </div>

              {/* Leg Hit Scores Sparkline */}
              {r.legHitScores.length > 1 && (
                <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${colors.border}` }}>
                  <div style={{ fontSize: 12, color: colors.fgDim, marginBottom: 4 }}>Hit Score pro Leg</div>
                  <svg viewBox={`0 0 ${r.legHitScores.length * 40} 40`} style={{ width: '100%', height: 40 }}>
                    {(() => {
                      const max = Math.max(...r.legHitScores, 1)
                      const points = r.legHitScores.map((s, i) => `${i * 40 + 20},${40 - (s / max) * 35}`).join(' ')
                      return (
                        <>
                          <polyline
                            points={points}
                            fill="none"
                            stroke={colors.accent}
                            strokeWidth={2}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                          {r.legHitScores.map((s, i) => (
                            <circle key={i} cx={i * 40 + 20} cy={40 - (s / max) * 35} r={3} fill={colors.accent} />
                          ))}
                        </>
                      )
                    })()}
                  </svg>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: colors.fgDim }}>
                    {r.legHitScores.map((s, i) => <span key={i}>L{i + 1}: {s}/90</span>)}
                  </div>
                </div>
              )}
            </div>
          ))}

          {/* Buttons */}
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button
              style={{
                ...styles.pill,
                flex: 1,
                borderColor: isArcade ? colors.accent : '#111827',
                background: isArcade ? colors.accent : '#111827',
                color: '#fff',
                fontWeight: 700,
              }}
              onClick={onRematch}
            >
              Rematch
            </button>
            <button style={{ ...styles.pill, flex: 1 }} onClick={onBackToMenu}>
              Zurueck
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
