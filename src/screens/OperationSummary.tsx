// src/screens/OperationSummary.tsx
// Match-Summary Screen fuer Operation

import React, { useMemo, useState, useEffect } from 'react'
import { useTheme } from '../ThemeProvider'
import { getThemedUI } from '../ui'
import { getOperationMatchById } from '../storage'
import { applyOperationEvents, formatDuration } from '../dartsOperation'
import { computeOperationMatchStats, computeOperationLegStats } from '../stats/computeOperationStats'
import { PLAYER_COLORS } from '../playerColors'
import StatTooltip, { STAT_TOOLTIPS } from '../components/StatTooltip'
import { generateOperationReport } from '../narratives/generateModeReports'

// Bestimmt Spielerfarbe fuer den Gewinner einer Statistik-Spalte
function getStatWinnerColors(
  numericValues: number[],
  playerIds: string[],
  better: 'high' | 'low',
  playerColorMap: Record<string, string>
): (string | undefined)[] {
  if (playerIds.length < 2) return playerIds.map(() => undefined)
  const allEqual = numericValues.every(v => v === numericValues[0])
  if (allEqual) return playerIds.map(() => undefined)
  const best = better === 'high' ? Math.max(...numericValues) : Math.min(...numericValues)
  return numericValues.map((v, i) => v === best ? playerColorMap[playerIds[i]] : undefined)
}

type Props = {
  matchId: string
  onBackToMenu: () => void
  onRematch: () => void
  onBackToLobby?: () => void
}

export default function OperationSummary({ matchId, onBackToMenu, onRematch, onBackToLobby }: Props) {
  const { isArcade, colors } = useTheme()
  const styles = useMemo(() => getThemedUI(colors, isArcade), [colors, isArcade])

  const [isMobile, setIsMobile] = useState(() => Math.min(window.innerWidth, window.innerHeight) < 600)
  useEffect(() => {
    const check = () => setIsMobile(Math.min(window.innerWidth, window.innerHeight) < 600)
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  const match = useMemo(() => getOperationMatchById(matchId), [matchId])
  const state = useMemo(() => match ? applyOperationEvents(match.events) : null, [match])

  // Leg selector state
  const [selectedLegIndex, setSelectedLegIndex] = useState(0)

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
  const legsCount = match.config.legsCount
  const isBull = match.config.targetMode === 'BULL'

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
        noScoreTurns: stats?.noScoreTurns ?? 0,
        legsWon: finished?.legWins?.[p.playerId] ?? state.totalsByPlayer[p.playerId]?.legsWon ?? 0,
      }
    })
    .sort((a, b) => b.totalHitScore - a.totalHitScore)

  const winner = finished?.winnerId ? match.players.find(p => p.playerId === finished.winnerId) : null

  // Player color map
  const playerColorMap: Record<string, string> = {}
  match.players.forEach((p, i) => { playerColorMap[p.playerId] = PLAYER_COLORS[i % PLAYER_COLORS.length] })

  const pIds = rankings.map(r => r.playerId)

  // Stat winner colors for table
  const hitScoreWin = getStatWinnerColors(rankings.map(r => r.totalHitScore), pIds, 'high', playerColorMap)
  const hitRateWin = getStatWinnerColors(rankings.map(r => r.hitRate), pIds, 'high', playerColorMap)
  const avgHitWin = getStatWinnerColors(rankings.map(r => r.avgHitScorePerDart), pIds, 'high', playerColorMap)
  const avgPtsWin = getStatWinnerColors(rankings.map(r => r.avgPointsPerDart), pIds, 'high', playerColorMap)
  const streakWin = getStatWinnerColors(rankings.map(r => r.maxHitStreak), pIds, 'high', playerColorMap)
  const bestTurnWin = getStatWinnerColors(rankings.map(r => r.bestTurnScore), pIds, 'high', playerColorMap)
  const noScoreWin = getStatWinnerColors(rankings.map(r => r.noScoreTurns), pIds, 'low', playerColorMap)

  // Per-leg stats for selected leg
  const legPlayerStats = useMemo(() => {
    return rankings.map(r => ({
      ...r,
      legStats: computeOperationLegStats(match, r.playerId, selectedLegIndex),
    }))
  }, [match, rankings, selectedLegIndex])

  // Table styles
  const thStyle: React.CSSProperties = {
    textAlign: 'right',
    padding: '6px 8px',
    borderBottom: `1px solid ${colors.border}`,
    color: colors.fgMuted,
    fontWeight: 600,
    fontSize: 12,
    whiteSpace: 'nowrap',
  }
  const tdStyle: React.CSSProperties = {
    textAlign: 'right',
    padding: '6px 8px',
    borderBottom: `1px solid ${colors.border}`,
    fontSize: 13,
    fontVariantNumeric: 'tabular-nums',
  }
  const tdLabelStyle: React.CSSProperties = {
    ...tdStyle,
    textAlign: 'left',
    color: colors.fgMuted,
    fontWeight: 500,
  }

  const tdHighlight = (winColor: string | undefined): React.CSSProperties =>
    winColor ? { ...tdStyle, fontWeight: 700, color: winColor } : { ...tdStyle, fontWeight: 600 }

  return (
    <div style={styles.page}>
      <div style={styles.centerPage}>
        <div style={{ ...styles.centerInner, maxWidth: isMobile ? '100%' : 560, padding: isMobile ? '0 4px' : undefined }}>
          {/* Header */}
          <div style={{ textAlign: 'center', marginBottom: 8 }}>
            <h2 style={{ margin: 0, color: colors.fg, fontSize: isMobile ? 18 : undefined }}>Operation: EFKG – Ergebnis</h2>
            {finished && (
              <div style={{ color: colors.fgDim, fontSize: 13, marginTop: 4 }}>
                Dauer: {formatDuration(finished.durationMs)} · {legsCount} Leg{legsCount > 1 ? 's' : ''}
              </div>
            )}
          </div>

          {/* Hit Score Ergebnis (faire Bewertung) */}
          <div style={{ ...styles.card, textAlign: 'center', marginBottom: 12, padding: isMobile ? '10px 8px' : undefined }}>
            {isSolo ? (
              <>
                <div style={{ fontSize: 14, color: colors.fgDim }}>Hit Score</div>
                <div style={{ fontSize: 36, fontWeight: 800, color: colors.accent, fontVariantNumeric: 'tabular-nums' }}>
                  {rankings[0]?.totalHitScore ?? 0}
                </div>
                <div style={{ fontSize: 12, color: colors.fgDim }}>
                  von {(legsCount * 30 * 3)} moeglich (S=1 D=2 T=3)
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

          {/* Spielbericht */}
          {(() => {
            const report = generateOperationReport({
              matchId,
              players: match.players.map(p => ({ id: p.playerId, name: p.name })),
              winnerId: finished?.winnerId,
              rankings: rankings.map(r => ({
                playerId: r.playerId,
                name: r.name,
                totalHitScore: r.totalHitScore,
                hitRate: r.hitRate,
                avgHitScorePerDart: r.avgHitScorePerDart,
                maxHitStreak: r.maxHitStreak,
                bestTurnScore: r.bestTurnScore,
                tripleCount: r.tripleCount,
                doubleCount: r.doubleCount,
                singleCount: r.singleCount,
                noScoreCount: r.noScoreCount,
              })),
              legsCount,
            })
            return report ? (
              <div style={{
                marginBottom: 12, padding: '16px 20px', borderRadius: 12,
                background: 'linear-gradient(135deg, #eff6ff, #dbeafe)',
                border: '1px solid #93c5fd',
              }}>
                <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 8, color: '#1e40af' }}>
                  Spielbericht
                </div>
                <div style={{ lineHeight: 1.7, fontSize: 14, color: '#1e293b' }}>
                  {report}
                </div>
              </div>
            ) : null
          })()}

          {/* Rankings (multi-player only) */}
          {!isSolo && (
            <div style={{ ...styles.card, marginBottom: 12 }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: colors.fg, marginBottom: 8 }}>Rankings</div>
              {rankings.map((r, rank) => (
                <div key={r.playerId} style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0',
                  borderTop: rank > 0 ? `1px solid ${colors.border}` : undefined,
                }}>
                  <span style={{ fontWeight: 800, fontSize: 16, color: colors.fgDim, width: 24 }}>{rank + 1}.</span>
                  <span style={{ flex: 1, fontWeight: 600, color: PLAYER_COLORS[r.index % PLAYER_COLORS.length] }}>{r.name}</span>
                  <span style={{ fontWeight: 800, fontSize: 18, color: colors.fg, fontVariantNumeric: 'tabular-nums' }}>{r.totalHitScore}</span>
                  {legsCount > 1 && (
                    <span style={{ fontSize: 11, color: colors.fgDim }}>({r.legsWon}L)</span>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* ============================================================ */}
          {/* Spieler-Statistiken (Vergleichstabelle) - Match Summary */}
          {/* ============================================================ */}
          <div style={{ ...styles.card, marginBottom: 12 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: colors.fg, marginBottom: 8 }}>
              {legsCount > 1 ? 'Gesamt-Statistiken' : 'Spieler-Statistiken'}
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ ...thStyle, textAlign: 'left' }}>Stat</th>
                    {rankings.map(r => (
                      <th key={r.playerId} style={{ ...thStyle, color: PLAYER_COLORS[r.index % PLAYER_COLORS.length] }}>
                        {r.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={tdLabelStyle}><StatTooltip label="Hit Score" tooltip={STAT_TOOLTIPS['Hit Score'] || 'Hit Score'} colors={colors} /></td>
                    {rankings.map((r, i) => (
                      <td key={r.playerId} style={tdHighlight(hitScoreWin[i])}>
                        {r.totalHitScore} / {legsCount * 90}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td style={tdLabelStyle}><StatTooltip label="Hit-Rate" tooltip={STAT_TOOLTIPS['Hit-Rate'] || 'Hit-Rate'} colors={colors} /></td>
                    {rankings.map((r, i) => (
                      <td key={r.playerId} style={tdHighlight(hitRateWin[i])}>
                        {r.hitRate.toFixed(1)}%
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td style={tdLabelStyle}><StatTooltip label="Ø Hit/Dart" tooltip={STAT_TOOLTIPS['Ø Hit/Dart'] || 'Ø Hit/Dart'} colors={colors} /></td>
                    {rankings.map((r, i) => (
                      <td key={r.playerId} style={tdHighlight(avgHitWin[i])}>
                        {r.avgHitScorePerDart.toFixed(2)}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td style={tdLabelStyle}><StatTooltip label="Ø Pkt/Dart" tooltip={STAT_TOOLTIPS['Ø Pkt/Dart'] || 'Ø Pkt/Dart'} colors={colors} /></td>
                    {rankings.map((r, i) => (
                      <td key={r.playerId} style={tdHighlight(avgPtsWin[i])}>
                        {r.avgPointsPerDart.toFixed(1)}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td style={tdLabelStyle}><StatTooltip label="Beste Streak" tooltip={STAT_TOOLTIPS['Beste Streak'] || 'Beste Streak'} colors={colors} /></td>
                    {rankings.map((r, i) => (
                      <td key={r.playerId} style={tdHighlight(streakWin[i])}>
                        {r.maxHitStreak}x
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td style={tdLabelStyle}><StatTooltip label="Bester Turn" tooltip={STAT_TOOLTIPS['Bester Turn'] || 'Bester Turn'} colors={colors} /></td>
                    {rankings.map((r, i) => (
                      <td key={r.playerId} style={tdHighlight(bestTurnWin[i])}>
                        {r.bestTurnScore}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td style={tdLabelStyle}><StatTooltip label="Punkte" tooltip={STAT_TOOLTIPS['Punkte'] || 'Punkte'} colors={colors} /></td>
                    {rankings.map((r) => (
                      <td key={r.playerId} style={{ ...tdStyle, fontWeight: 600 }}>
                        {r.totalScore}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td style={tdLabelStyle}><StatTooltip label="No Score Turns" tooltip={STAT_TOOLTIPS['No Score Turns'] || 'No Score Turns'} colors={colors} /></td>
                    {rankings.map((r, i) => (
                      <td key={r.playerId} style={tdHighlight(noScoreWin[i])}>
                        {r.noScoreTurns}
                      </td>
                    ))}
                  </tr>
                  {legsCount > 1 && (
                    <tr>
                      <td style={tdLabelStyle}><StatTooltip label="Legs gewonnen" tooltip={STAT_TOOLTIPS['Legs gewonnen'] || 'Legs gewonnen'} colors={colors} /></td>
                      {rankings.map((r) => (
                        <td key={r.playerId} style={{ ...tdStyle, fontWeight: 600 }}>
                          {r.legsWon}
                        </td>
                      ))}
                    </tr>
                  )}
                  {/* Trefferverteilung */}
                  {isBull ? (
                    <>
                      <tr>
                        <td style={tdLabelStyle}><StatTooltip label="Miss" tooltip={STAT_TOOLTIPS['Miss'] || 'Miss'} colors={colors} /></td>
                        {rankings.map((r) => (
                          <td key={r.playerId} style={{ ...tdStyle, fontWeight: 600 }}>
                            {r.noScoreCount}
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <td style={tdLabelStyle}><StatTooltip label="S-Bull" tooltip={STAT_TOOLTIPS['S-Bull'] || 'S-Bull'} colors={colors} /></td>
                        {rankings.map((r) => (
                          <td key={r.playerId} style={{ ...tdStyle, fontWeight: 600 }}>
                            {r.singleBullCount}
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <td style={tdLabelStyle}><StatTooltip label="D-Bull" tooltip={STAT_TOOLTIPS['D-Bull'] || 'D-Bull'} colors={colors} /></td>
                        {rankings.map((r) => (
                          <td key={r.playerId} style={{ ...tdStyle, fontWeight: 600 }}>
                            {r.doubleBullCount}
                          </td>
                        ))}
                      </tr>
                    </>
                  ) : (
                    <>
                      <tr>
                        <td style={tdLabelStyle}><StatTooltip label="Miss" tooltip={STAT_TOOLTIPS['Miss'] || 'Miss'} colors={colors} /></td>
                        {rankings.map((r) => (
                          <td key={r.playerId} style={{ ...tdStyle, fontWeight: 600 }}>
                            {r.noScoreCount}
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <td style={tdLabelStyle}><StatTooltip label="Single" tooltip={STAT_TOOLTIPS['Single'] || 'Single'} colors={colors} /></td>
                        {rankings.map((r) => (
                          <td key={r.playerId} style={{ ...tdStyle, fontWeight: 600 }}>
                            {r.singleCount}
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <td style={tdLabelStyle}><StatTooltip label="Double" tooltip={STAT_TOOLTIPS['Double'] || 'Double'} colors={colors} /></td>
                        {rankings.map((r) => (
                          <td key={r.playerId} style={{ ...tdStyle, fontWeight: 600 }}>
                            {r.doubleCount}
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <td style={tdLabelStyle}><StatTooltip label="Triple" tooltip={STAT_TOOLTIPS['Triple'] || 'Triple'} colors={colors} /></td>
                        {rankings.map((r) => (
                          <td key={r.playerId} style={{ ...tdStyle, fontWeight: 600 }}>
                            {r.tripleCount}
                          </td>
                        ))}
                      </tr>
                    </>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* ============================================================ */}
          {/* Leg Breakdown (only if >1 leg) */}
          {/* ============================================================ */}
          {legsCount > 1 && (
            <div style={{ ...styles.card, marginBottom: 12 }}>
              {/* Leg Navigation */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 12,
              }}>
                <button
                  onClick={() => setSelectedLegIndex(i => Math.max(0, i - 1))}
                  disabled={selectedLegIndex === 0}
                  style={{
                    padding: isMobile ? '6px 10px' : '8px 16px',
                    borderRadius: 6,
                    border: `1px solid ${colors.border}`,
                    background: selectedLegIndex === 0 ? 'transparent' : colors.bgCard,
                    color: selectedLegIndex === 0 ? colors.fgDim : colors.fg,
                    fontWeight: 600,
                    cursor: selectedLegIndex === 0 ? 'not-allowed' : 'pointer',
                    opacity: selectedLegIndex === 0 ? 0.5 : 1,
                    fontSize: isMobile ? 12 : 14,
                  }}
                >
                  ←
                </button>

                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontWeight: 700, fontSize: 16, color: colors.fg }}>
                    Leg {selectedLegIndex + 1} von {legsCount}
                  </div>
                  {state.legs[selectedLegIndex] && (
                    <div style={{ fontSize: 12, color: colors.fgDim }}>
                      Ziel: {state.legs[selectedLegIndex].targetMode === 'BULL' ? 'Bull' : state.legs[selectedLegIndex].targetNumber}
                    </div>
                  )}
                </div>

                <button
                  onClick={() => setSelectedLegIndex(i => Math.min(legsCount - 1, i + 1))}
                  disabled={selectedLegIndex === legsCount - 1}
                  style={{
                    padding: isMobile ? '6px 10px' : '8px 16px',
                    borderRadius: 6,
                    border: `1px solid ${colors.border}`,
                    background: selectedLegIndex === legsCount - 1 ? 'transparent' : colors.bgCard,
                    color: selectedLegIndex === legsCount - 1 ? colors.fgDim : colors.fg,
                    fontWeight: 600,
                    cursor: selectedLegIndex === legsCount - 1 ? 'not-allowed' : 'pointer',
                    opacity: selectedLegIndex === legsCount - 1 ? 0.5 : 1,
                    fontSize: isMobile ? 12 : 14,
                  }}
                >
                  →
                </button>
              </div>

              {/* Leg Stats Table */}
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={{ ...thStyle, textAlign: 'left' }}>Stat</th>
                      {legPlayerStats.map(r => (
                        <th key={r.playerId} style={{ ...thStyle, color: PLAYER_COLORS[r.index % PLAYER_COLORS.length] }}>
                          {r.name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td style={tdLabelStyle}><StatTooltip label="Hit Score" tooltip={STAT_TOOLTIPS['Hit Score'] || 'Hit Score'} colors={colors} /></td>
                      {legPlayerStats.map(r => (
                        <td key={r.playerId} style={{ ...tdStyle, fontWeight: 700, color: colors.accent }}>
                          {r.legStats?.hitScore ?? 0} / 90
                        </td>
                      ))}
                    </tr>
                    <tr>
                      <td style={tdLabelStyle}><StatTooltip label="Hit-Rate" tooltip={STAT_TOOLTIPS['Hit-Rate'] || 'Hit-Rate'} colors={colors} /></td>
                      {legPlayerStats.map(r => (
                        <td key={r.playerId} style={{ ...tdStyle, fontWeight: 600 }}>
                          {(r.legStats?.hitRate ?? 0).toFixed(1)}%
                        </td>
                      ))}
                    </tr>
                    <tr>
                      <td style={tdLabelStyle}><StatTooltip label="Ø Hit/Dart" tooltip={STAT_TOOLTIPS['Ø Hit/Dart'] || 'Ø Hit/Dart'} colors={colors} /></td>
                      {legPlayerStats.map(r => (
                        <td key={r.playerId} style={{ ...tdStyle, fontWeight: 600 }}>
                          {(r.legStats?.avgHitScorePerDart ?? 0).toFixed(2)}
                        </td>
                      ))}
                    </tr>
                    <tr>
                      <td style={tdLabelStyle}><StatTooltip label="Beste Streak" tooltip={STAT_TOOLTIPS['Beste Streak'] || 'Beste Streak'} colors={colors} /></td>
                      {legPlayerStats.map(r => (
                        <td key={r.playerId} style={{ ...tdStyle, fontWeight: 600 }}>
                          {r.legStats?.maxHitStreak ?? 0}x
                        </td>
                      ))}
                    </tr>
                    <tr>
                      <td style={tdLabelStyle}><StatTooltip label="Punkte" tooltip={STAT_TOOLTIPS['Punkte'] || 'Punkte'} colors={colors} /></td>
                      {legPlayerStats.map(r => (
                        <td key={r.playerId} style={{ ...tdStyle, fontWeight: 600 }}>
                          {r.legStats?.totalScore ?? 0}
                        </td>
                      ))}
                    </tr>
                    <tr>
                      <td style={tdLabelStyle}><StatTooltip label="No Score Turns" tooltip={STAT_TOOLTIPS['No Score Turns'] || 'No Score Turns'} colors={colors} /></td>
                      {legPlayerStats.map(r => (
                        <td key={r.playerId} style={{ ...tdStyle, fontWeight: 600 }}>
                          {r.legStats?.noScoreTurns ?? 0}
                        </td>
                      ))}
                    </tr>
                    {/* Leg-Trefferverteilung */}
                    {isBull ? (
                      <>
                        <tr>
                          <td style={tdLabelStyle}><StatTooltip label="Miss" tooltip={STAT_TOOLTIPS['Miss'] || 'Miss'} colors={colors} /></td>
                          {legPlayerStats.map(r => (
                            <td key={r.playerId} style={{ ...tdStyle, fontWeight: 600 }}>
                              {r.legStats?.noScoreCount ?? 0}
                            </td>
                          ))}
                        </tr>
                        <tr>
                          <td style={tdLabelStyle}><StatTooltip label="S-Bull" tooltip={STAT_TOOLTIPS['S-Bull'] || 'S-Bull'} colors={colors} /></td>
                          {legPlayerStats.map(r => (
                            <td key={r.playerId} style={{ ...tdStyle, fontWeight: 600 }}>
                              {r.legStats?.singleBullCount ?? 0}
                            </td>
                          ))}
                        </tr>
                        <tr>
                          <td style={tdLabelStyle}><StatTooltip label="D-Bull" tooltip={STAT_TOOLTIPS['D-Bull'] || 'D-Bull'} colors={colors} /></td>
                          {legPlayerStats.map(r => (
                            <td key={r.playerId} style={{ ...tdStyle, fontWeight: 600 }}>
                              {r.legStats?.doubleBullCount ?? 0}
                            </td>
                          ))}
                        </tr>
                      </>
                    ) : (
                      <>
                        <tr>
                          <td style={tdLabelStyle}><StatTooltip label="Miss" tooltip={STAT_TOOLTIPS['Miss'] || 'Miss'} colors={colors} /></td>
                          {legPlayerStats.map(r => (
                            <td key={r.playerId} style={{ ...tdStyle, fontWeight: 600 }}>
                              {r.legStats?.noScoreCount ?? 0}
                            </td>
                          ))}
                        </tr>
                        <tr>
                          <td style={tdLabelStyle}>S / D / T</td>
                          {legPlayerStats.map(r => (
                            <td key={r.playerId} style={{ ...tdStyle, fontWeight: 600 }}>
                              {r.legStats?.singleCount ?? 0} / {r.legStats?.doubleCount ?? 0} / {r.legStats?.tripleCount ?? 0}
                            </td>
                          ))}
                        </tr>
                      </>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Buttons */}
          <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 8, marginTop: 8 }}>
            <button
              style={{
                ...styles.pill,
                flex: 1,
                borderColor: isArcade ? colors.accent : '#111827',
                background: isArcade ? colors.accent : '#111827',
                color: '#fff',
                fontWeight: 700,
                minHeight: isMobile ? 44 : undefined,
              }}
              onClick={onRematch}
            >
              Rematch
            </button>
            {onBackToLobby && (
              <button style={{ ...styles.pill, flex: 1, minHeight: isMobile ? 44 : undefined }} onClick={onBackToLobby}>
                Neues Spiel
              </button>
            )}
            <button style={{ ...styles.pill, flex: 1, minHeight: isMobile ? 44 : undefined }} onClick={onBackToMenu}>
              {onBackToLobby ? '← Menü' : 'Zurueck'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
