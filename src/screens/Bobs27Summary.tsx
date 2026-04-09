// src/screens/Bobs27Summary.tsx
// Match-Zusammenfassung fuer Bob's 27

import React, { useMemo, useState, useEffect } from 'react'
import { getThemedUI } from '../ui'
import { useTheme } from '../ThemeProvider'
import { getBobs27MatchById } from '../storage'
import { applyBobs27Events, formatDuration } from '../dartsBobs27'
import { computeBobs27MatchStats } from '../stats/computeBobs27Stats'
import { PLAYER_COLORS } from '../playerColors'
import { generateBobs27Report } from '../narratives/generateModeReports'
import StatTooltip, { STAT_TOOLTIPS } from '../components/StatTooltip'

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
  onRematch: (matchId: string) => void
  onBackToLobby?: () => void
}

export default function Bobs27Summary({ matchId, onBackToMenu, onRematch, onBackToLobby }: Props) {
  const { isArcade, colors } = useTheme()
  const styles = useMemo(() => getThemedUI(colors, isArcade), [colors, isArcade])

  const [isMobile, setIsMobile] = useState(() => Math.min(window.innerWidth, window.innerHeight) < 600)
  useEffect(() => {
    const check = () => setIsMobile(Math.min(window.innerWidth, window.innerHeight) < 600)
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  const storedMatch = getBobs27MatchById(matchId)

  if (!storedMatch) {
    return (
      <div style={styles.page}>
        <p>Match nicht gefunden.</p>
        <button style={styles.backBtn} onClick={onBackToMenu}>&larr; Zurueck</button>
      </div>
    )
  }

  const state = applyBobs27Events(storedMatch.events)
  const match = state.match

  if (!match) {
    return (
      <div style={styles.page}>
        <p>Match-Daten nicht verfuegbar.</p>
        <button style={styles.backBtn} onClick={onBackToMenu}>&larr; Zurueck</button>
      </div>
    )
  }

  const players = match.players

  // Per-player Stats
  const playerStats = useMemo(() => {
    return players.map(p => ({
      playerId: p.playerId,
      stats: computeBobs27MatchStats(storedMatch, p.playerId),
    }))
  }, [players, storedMatch])

  // Rankings: Spieler nach Final Score sortieren (nicht-eliminierte zuerst, dann nach Score)
  const rankings = useMemo(() => {
    return players.map((p, i) => {
      const ps = state.playerStates[p.playerId]
      const stats = playerStats.find(s => s.playerId === p.playerId)?.stats
      return {
        playerId: p.playerId,
        name: p.name,
        color: PLAYER_COLORS[i % PLAYER_COLORS.length],
        finalScore: stats?.finalScore ?? ps?.score ?? 0,
        eliminated: stats?.eliminated ?? ps?.eliminated ?? false,
        eliminatedAtTarget: stats?.eliminatedAtTarget ?? null,
        targetsCompleted: stats?.targetsCompleted ?? 0,
        totalTargets: stats?.totalTargets ?? 20,
        hitRate: stats?.hitRate ?? 0,
        totalDarts: stats?.totalDarts ?? 0,
        totalHits: stats?.totalHits ?? 0,
        bestTargetDelta: stats?.bestTargetDelta,
        worstTargetDelta: stats?.worstTargetDelta,
        bestTarget: stats?.bestTarget,
        worstTarget: stats?.worstTarget,
        longestHitStreak: stats?.longestHitStreak ?? 0,
        perfectTargets: stats?.perfectTargets ?? 0,
        highestSingleTargetScore: stats?.highestSingleTargetScore,
        targetsWithHits: stats?.targetsWithHits ?? 0,
        targetResults: stats?.targetResults ?? [],
        scoreHistory: stats?.scoreHistory ?? [],
        isWinner: p.playerId === storedMatch.winnerId,
      }
    }).sort((a, b) => {
      // Nicht-eliminierte zuerst
      if (a.eliminated !== b.eliminated) return a.eliminated ? 1 : -1
      return b.finalScore - a.finalScore
    })
  }, [players, playerStats, state.playerStates, storedMatch.winnerId])

  const winner = players.find(p => p.playerId === storedMatch.winnerId)
  const isSolo = players.length === 1

  return (
    <div style={styles.page}>
      <div style={styles.headerRow}>
        <h2 style={{ margin: 0 }}>Bob's 27</h2>
        <button style={styles.backBtn} onClick={onBackToMenu}>&larr; Menu</button>
      </div>

      <div style={styles.centerPage}>
        <div style={{ ...styles.centerInner, maxWidth: isMobile ? '100%' : 500, padding: isMobile ? '0 4px' : undefined }}>

          {/* Ergebnis-Anzeige */}
          <div style={{ ...styles.card, marginBottom: 16, textAlign: 'center' }}>
            <div style={{ fontSize: 14, color: colors.fgMuted, marginBottom: 4 }}>
              {isSolo ? 'Ergebnis' : 'Gewinner'}
            </div>

            {isSolo ? (
              <>
                <div style={{
                  fontSize: isMobile ? 28 : 48, fontWeight: 800,
                  color: rankings[0]?.eliminated ? colors.error : colors.success,
                  marginBottom: 4,
                }}>
                  {rankings[0]?.eliminated
                    ? `Game Over bei D${(rankings[0]?.eliminatedAtTarget ?? 0) + 1}`
                    : 'Geschafft!'}
                </div>
                <div style={{
                  fontSize: 16, fontWeight: 600,
                  color: rankings[0]?.eliminated ? colors.error : colors.success,
                  marginBottom: 8,
                }}>
                  {rankings[0]?.finalScore ?? 0} Punkte
                </div>
              </>
            ) : winner ? (
              <>
                <div style={{ fontSize: 32, fontWeight: 700, color: colors.success, marginBottom: 4 }}>
                  {winner.name}
                </div>
                {(storedMatch.config.legsCount ?? 1) > 1 && storedMatch.legWins && (
                  <div style={{ fontSize: 18, fontWeight: 700, color: colors.accent, marginBottom: 4 }}>
                    {players.map(p => storedMatch.legWins![p.playerId] ?? 0).join(' – ')} Legs
                  </div>
                )}
                <div style={{ fontSize: 24, fontWeight: 700, color: colors.accent }}>
                  {rankings.find(p => p.isWinner)?.finalScore ?? 0} Punkte
                </div>
              </>
            ) : (
              <div style={{ fontSize: 28, fontWeight: 700, color: '#888' }}>
                Unentschieden
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'center', gap: 24, marginTop: 12 }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 700, color: colors.accent }}>
                  {rankings[0]?.hitRate.toFixed(0)}%
                </div>
                <div style={{ fontSize: 11, color: colors.fgMuted }}>Hit-Rate</div>
              </div>
              <div>
                <div style={{ fontSize: 18, fontWeight: 700, color: colors.fgDim }}>
                  {rankings[0]?.targetsCompleted}/{rankings[0]?.totalTargets}
                </div>
                <div style={{ fontSize: 11, color: colors.fgMuted }}>Targets</div>
              </div>
              <div>
                <div style={{ fontSize: 18, fontWeight: 700, color: colors.fgDim }}>
                  {formatDuration(storedMatch.durationMs ?? 0)}
                </div>
                <div style={{ fontSize: 11, color: colors.fgMuted }}>Zeit</div>
              </div>
            </div>
          </div>

          {/* Spielbericht */}
          {(() => {
            const report = generateBobs27Report({
              matchId,
              players: players.map(p => ({ id: p.playerId, name: p.name })),
              winnerId: storedMatch.winnerId,
              rankings: rankings.map(r => ({
                playerId: r.playerId,
                name: r.name,
                finalScore: r.finalScore,
                eliminated: r.eliminated,
                eliminatedAtTarget: r.eliminatedAtTarget,
                hitRate: r.hitRate,
                longestHitStreak: r.longestHitStreak,
                perfectTargets: r.perfectTargets,
                targetsCompleted: r.targetsCompleted,
                totalTargets: r.totalTargets,
                bestTarget: r.bestTarget ? { label: r.bestTarget.label, hits: r.bestTarget.hits } : null,
                worstTarget: r.worstTarget ? { label: r.worstTarget.label, hits: r.worstTarget.hits } : null,
              })),
            })
            return report ? (
              <div style={{
                marginBottom: 16, padding: '16px 20px', borderRadius: 12,
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

          {/* Multi-Player Rankings */}
          {!isSolo && (
            <div style={{ ...styles.card, marginBottom: 16 }}>
              <div style={{ ...styles.sub, marginBottom: 8 }}>Rangliste</div>
              <div style={{ display: 'grid', gap: 8 }}>
                {rankings.map((p, i) => (
                  <div key={p.playerId} style={{
                    padding: '8px 12px', borderRadius: 8,
                    background: p.isWinner ? colors.successBg : colors.bgMuted,
                    border: p.isWinner ? `2px solid ${colors.success}` : `1px solid ${colors.border}`,
                    borderLeft: `4px solid ${p.color}`,
                    opacity: p.eliminated ? 0.6 : 1,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: p.isWinner ? 700 : 500, color: p.isWinner ? colors.success : colors.fg }}>
                        {i + 1}. {p.name} {p.isWinner && '\u{1F3C6}'} {p.eliminated && '\u2620'}
                      </span>
                      <span style={{ fontSize: 16, fontWeight: 700, color: p.eliminated ? colors.error : colors.accent }}>
                        {p.finalScore}
                      </span>
                    </div>
                    <div style={{ fontSize: 11, color: colors.fgMuted, marginTop: 2 }}>
                      {p.targetsCompleted}/{p.totalTargets} Targets | {p.hitRate.toFixed(0)}% Hit | {p.totalDarts} Darts
                      {p.eliminated && ` | Eliminiert bei D${(p.eliminatedAtTarget ?? 0) + 1}`}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Spieler-Statistiken (Vergleichstabelle) */}
          {(() => {
            const pIds = rankings.map(p => p.playerId)
            const colorMap: Record<string, string> = {}
            rankings.forEach(p => { colorMap[p.playerId] = p.color })

            const scoreWin = getStatWinnerColors(rankings.map(p => p.finalScore), pIds, 'high', colorMap)
            const targetsWin = getStatWinnerColors(rankings.map(p => p.targetsCompleted), pIds, 'high', colorMap)
            const hitRateWin = getStatWinnerColors(rankings.map(p => p.hitRate), pIds, 'high', colorMap)
            const dartsWin = getStatWinnerColors(rankings.map(p => p.totalDarts), pIds, 'low', colorMap)
            const hitsWin = getStatWinnerColors(rankings.map(p => p.totalHits), pIds, 'high', colorMap)
            const perfectWin = getStatWinnerColors(rankings.map(p => p.perfectTargets), pIds, 'high', colorMap)
            const streakWin = getStatWinnerColors(rankings.map(p => p.longestHitStreak), pIds, 'high', colorMap)
            const bestDeltaWin = getStatWinnerColors(
              rankings.map(p => p.bestTargetDelta?.delta ?? -Infinity), pIds, 'high', colorMap)
            const worstDeltaWin = getStatWinnerColors(
              rankings.map(p => p.worstTargetDelta?.delta ?? Infinity), pIds, 'low', colorMap)
            const highScoreWin = getStatWinnerColors(
              rankings.map(p => p.highestSingleTargetScore?.delta ?? 0), pIds, 'high', colorMap)

            const thStyle: React.CSSProperties = {
              textAlign: 'right',
              padding: '6px 8px',
              borderBottom: `1px solid ${colors.border}`,
              color: colors.fgMuted,
              fontWeight: 600,
              whiteSpace: 'nowrap',
            }
            const tdStyle: React.CSSProperties = {
              textAlign: 'right',
              padding: '6px 8px',
              borderBottom: `1px solid ${colors.border}`,
              fontSize: 13,
            }
            const tdLabelStyle: React.CSSProperties = {
              ...tdStyle,
              textAlign: 'left',
              color: colors.fgMuted,
              fontWeight: 500,
              whiteSpace: 'nowrap',
            }

            const cellStyle = (win: string | undefined, fallbackColor?: string): React.CSSProperties =>
              win
                ? { ...tdStyle, fontWeight: 700, color: win }
                : { ...tdStyle, fontWeight: 600, ...(fallbackColor ? { color: fallbackColor } : {}) }

            return (
              <div style={{ ...styles.card, marginBottom: 16 }}>
                <div style={{ ...styles.sub, marginBottom: 8 }}>Spieler-Statistiken</div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <th style={{ ...thStyle, textAlign: 'left' }}>Stat</th>
                        {rankings.map(p => (
                          <th key={p.playerId} style={{ ...thStyle, color: p.isWinner ? colors.success : p.color }}>
                            {p.name}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td style={tdLabelStyle}><StatTooltip label="Punkte" tooltip={STAT_TOOLTIPS['Punkte'] || 'Punkte'} colors={colors} /></td>
                        {rankings.map((p, i) => (
                          <td key={p.playerId} style={cellStyle(scoreWin[i], p.eliminated ? colors.error : colors.success)}>
                            {p.finalScore}
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <td style={tdLabelStyle}><StatTooltip label="Targets bespielt" tooltip={STAT_TOOLTIPS['Targets bespielt'] || 'Targets bespielt'} colors={colors} /></td>
                        {rankings.map((p, i) => (
                          <td key={p.playerId} style={cellStyle(targetsWin[i])}>
                            {p.targetsCompleted}/{p.totalTargets}
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <td style={tdLabelStyle}><StatTooltip label="Trefferquote" tooltip={STAT_TOOLTIPS['Trefferquote'] || 'Trefferquote'} colors={colors} /></td>
                        {rankings.map((p, i) => (
                          <td key={p.playerId} style={cellStyle(hitRateWin[i], colors.accent)}>
                            {p.hitRate.toFixed(1)}%
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <td style={tdLabelStyle}><StatTooltip label="Darts gesamt" tooltip={STAT_TOOLTIPS['Darts gesamt'] || 'Darts gesamt'} colors={colors} /></td>
                        {rankings.map((p, i) => (
                          <td key={p.playerId} style={cellStyle(dartsWin[i])}>
                            {p.totalDarts}
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <td style={tdLabelStyle}><StatTooltip label="Treffer gesamt" tooltip={STAT_TOOLTIPS['Treffer gesamt'] || 'Treffer gesamt'} colors={colors} /></td>
                        {rankings.map((p, i) => (
                          <td key={p.playerId} style={cellStyle(hitsWin[i])}>
                            {p.totalHits}
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <td style={tdLabelStyle}><StatTooltip label="Perfekte Targets" tooltip={STAT_TOOLTIPS['Perfekte Targets'] || 'Perfekte Targets'} colors={colors} /></td>
                        {rankings.map((p, i) => (
                          <td key={p.playerId} style={cellStyle(perfectWin[i], p.perfectTargets > 0 ? colors.success : colors.fgDim)}>
                            {p.perfectTargets}
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <td style={tdLabelStyle}><StatTooltip label="Beste Streak" tooltip={STAT_TOOLTIPS['Beste Streak'] || 'Beste Streak'} colors={colors} /></td>
                        {rankings.map((p, i) => (
                          <td key={p.playerId} style={cellStyle(streakWin[i])}>
                            {p.longestHitStreak}
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <td style={tdLabelStyle}><StatTooltip label="Bester Target" tooltip={STAT_TOOLTIPS['Bester Target'] || 'Bester Target'} colors={colors} /></td>
                        {rankings.map((p, i) => (
                          <td key={p.playerId} style={cellStyle(bestDeltaWin[i], colors.success)}>
                            {p.bestTarget
                              ? `${p.bestTarget.label} (+${p.bestTargetDelta?.delta ?? 0})`
                              : '-'}
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <td style={tdLabelStyle}><StatTooltip label="Schlechtester Target" tooltip={STAT_TOOLTIPS['Schlechtester Target'] || 'Schlechtester Target'} colors={colors} /></td>
                        {rankings.map((p, i) => (
                          <td key={p.playerId} style={cellStyle(worstDeltaWin[i], colors.error)}>
                            {p.worstTarget
                              ? `${p.worstTarget.label} (${p.worstTargetDelta?.delta ?? 0})`
                              : '-'}
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <td style={tdLabelStyle}><StatTooltip label="Hoechster Target-Score" tooltip={STAT_TOOLTIPS['Hoechster Target-Score'] || 'Hoechster Target-Score'} colors={colors} /></td>
                        {rankings.map((p, i) => (
                          <td key={p.playerId} style={cellStyle(highScoreWin[i], colors.success)}>
                            {p.highestSingleTargetScore
                              ? `+${p.highestSingleTargetScore.delta} (${p.highestSingleTargetScore.label})`
                              : '-'}
                          </td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )
          })()}

          {/* Target-Timeline */}
          {rankings.map((p, pi) => {
            if (p.targetResults.length === 0) return null
            return (
              <div key={`targets-${p.playerId}`} style={{ ...styles.card, marginBottom: 16 }}>
                <div style={{
                  ...styles.sub, marginBottom: 8,
                  borderLeft: !isSolo ? `4px solid ${p.color}` : undefined,
                  paddingLeft: !isSolo ? 8 : undefined,
                }}>
                  {isSolo ? 'Target-Uebersicht' : `${p.name} - Targets`}
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ borderBottom: `1px solid ${colors.border}` }}>
                        <th style={{ textAlign: 'left', padding: '4px 6px', color: colors.fgMuted }}>Ziel</th>
                        <th style={{ textAlign: 'center', padding: '4px 6px', color: colors.fgMuted }}>Treffer</th>
                        <th style={{ textAlign: 'right', padding: '4px 6px', color: colors.fgMuted }}>Delta</th>
                        <th style={{ textAlign: 'right', padding: '4px 6px', color: colors.fgMuted }}>Score</th>
                      </tr>
                    </thead>
                    <tbody>
                      {p.targetResults.map((r, i) => {
                        const bg = r.hits === r.darts
                          ? colors.successBg
                          : r.hits > 0
                            ? (colors.warningBg ?? 'rgba(255,200,0,0.08)')
                            : (colors.errorBg ?? 'rgba(255,0,0,0.06)')
                        return (
                          <tr key={i} style={{
                            borderBottom: `1px solid ${colors.border}`,
                            background: bg,
                          }}>
                            <td style={{ padding: '4px 6px', fontWeight: 500 }}>{r.label}</td>
                            <td style={{ textAlign: 'center', padding: '4px 6px' }}>
                              <HitDots hits={r.hits} total={r.darts} colors={colors} />
                            </td>
                            <td style={{
                              textAlign: 'right', padding: '4px 6px', fontWeight: 600,
                              color: r.delta >= 0 ? colors.success : colors.error,
                            }}>
                              {r.delta >= 0 ? `+${r.delta}` : r.delta}
                            </td>
                            <td style={{ textAlign: 'right', padding: '4px 6px', fontWeight: 600 }}>
                              {r.scoreAfter}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          })}

          {/* Aktionen */}
          <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 8 }}>
            <button onClick={() => onRematch(matchId)} style={{ ...styles.pill, flex: 1, minHeight: isMobile ? 44 : undefined }}>
              Rematch
            </button>
            {onBackToLobby && (
              <button onClick={onBackToLobby} style={{ ...styles.pill, flex: 1, minHeight: isMobile ? 44 : undefined }}>
                Neues Spiel
              </button>
            )}
            <button onClick={onBackToMenu} style={{ ...styles.backBtn, flex: 1, minHeight: isMobile ? 44 : undefined }}>
              {onBackToLobby ? '← Menü' : 'Menu'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ===== Hilfskomponenten =====

function HitDots({ hits, total, colors }: { hits: number; total: number; colors: any }) {
  const dots: React.ReactNode[] = []
  for (let i = 0; i < total; i++) {
    dots.push(
      <span key={i} style={{
        display: 'inline-block',
        width: 8, height: 8, borderRadius: '50%',
        background: i < hits ? colors.success : colors.error,
        marginRight: i < total - 1 ? 3 : 0,
        opacity: i < hits ? 1 : 0.4,
      }} />
    )
  }
  return <span style={{ display: 'inline-flex', alignItems: 'center' }}>{dots}</span>
}

// ===== Score-Verlaufs-Chart =====

function ScoreChart({ players, colors }: {
  players: Array<{ name: string; color: string; scores: number[] }>
  colors: any
}) {
  const W = 360
  const H = 140
  const PAD = { top: 10, bottom: 20, left: 35, right: 10 }
  const chartW = W - PAD.left - PAD.right
  const chartH = H - PAD.top - PAD.bottom

  // Min/Max Score ueber alle Spieler
  const allScores = players.flatMap(p => p.scores)
  const minScore = Math.min(0, ...allScores)
  const maxScore = Math.max(27, ...allScores)
  const range = maxScore - minScore || 1

  const scaleX = (i: number, total: number) => PAD.left + (i / Math.max(total - 1, 1)) * chartW
  const scaleY = (v: number) => PAD.top + chartH - ((v - minScore) / range) * chartH

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }}>
      {/* Null-Linie */}
      {minScore < 0 && (
        <line x1={PAD.left} y1={scaleY(0)} x2={W - PAD.right} y2={scaleY(0)}
          stroke={colors.error} strokeWidth={0.5} strokeDasharray="3,3" opacity={0.5} />
      )}

      {/* Y-Achse Labels */}
      {[minScore, Math.round((minScore + maxScore) / 2), maxScore].map((v, i) => (
        <text key={i} x={PAD.left - 4} y={scaleY(v) + 3}
          fill={colors.fgDim} fontSize={9} textAnchor="end">
          {v}
        </text>
      ))}

      {/* Start-Linie bei 27 */}
      <line x1={PAD.left} y1={scaleY(27)} x2={W - PAD.right} y2={scaleY(27)}
        stroke={colors.fgDim} strokeWidth={0.5} strokeDasharray="2,4" opacity={0.3} />

      {/* Linien */}
      {players.map((p, pi) => {
        if (p.scores.length < 2) return null
        const path = p.scores.map((s, i) => {
          const x = scaleX(i, p.scores.length)
          const y = scaleY(s)
          return `${i === 0 ? 'M' : 'L'} ${x} ${y}`
        }).join(' ')

        return (
          <g key={pi}>
            <path d={path} fill="none" stroke={p.color} strokeWidth={2} opacity={0.8} />
            {/* Endpunkt */}
            <circle
              cx={scaleX(p.scores.length - 1, p.scores.length)}
              cy={scaleY(p.scores[p.scores.length - 1])}
              r={3} fill={p.color}
            />
          </g>
        )
      })}

      {/* X-Achse Labels */}
      {players[0]?.scores.map((_, i) => {
        const total = players[0].scores.length
        if (total > 10 && i % 2 !== 0 && i !== total - 1) return null
        return (
          <text key={i} x={scaleX(i, total)} y={H - 4}
            fill={colors.fgDim} fontSize={8} textAnchor="middle">
            {i === 0 ? 'Start' : `D${i}`}
          </text>
        )
      })}
    </svg>
  )
}
