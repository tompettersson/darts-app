// src/screens/Bobs27MatchDetails.tsx
// Match-Details-Ansicht fuer abgeschlossene Bob's 27 Matches (aus StatsArea)

import React, { useMemo, useState, useEffect } from 'react'
import { getThemedUI } from '../ui'
import { useTheme } from '../ThemeProvider'
import { getBobs27MatchById } from '../storage'
import { applyBobs27Events, formatDuration } from '../dartsBobs27'
import { computeBobs27MatchStats } from '../stats/computeBobs27Stats'
import { PLAYER_COLORS } from '../playerColors'
import StatTooltip, { STAT_TOOLTIPS } from '../components/StatTooltip'
import { generateBobs27Report } from '../narratives/generateModeReports'
import Bobs27AggregateSection from '../components/Bobs27AggregateSection'

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
  onBack: () => void
  onOpenLegSummary?: (matchId: string, legIndex: number) => void
}

export default function Bobs27MatchDetails({ matchId, onBack, onOpenLegSummary }: Props) {
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
        <button style={styles.backBtn} onClick={onBack}>&larr; Zurueck</button>
      </div>
    )
  }

  const state = applyBobs27Events(storedMatch.events)
  const match = state.match

  if (!match) {
    return (
      <div style={styles.page}>
        <p>Match-Daten nicht verfuegbar.</p>
        <button style={styles.backBtn} onClick={onBack}>&larr; Zurueck</button>
      </div>
    )
  }

  const players = match.players
  const isSolo = players.length === 1

  const playerStats = useMemo(() => {
    return players.map(p => ({
      playerId: p.playerId,
      stats: computeBobs27MatchStats(storedMatch, p.playerId),
    }))
  }, [players, storedMatch])

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
        isWinner: p.playerId === storedMatch.winnerId,
      }
    }).sort((a, b) => {
      if (a.eliminated !== b.eliminated) return a.eliminated ? 1 : -1
      return b.finalScore - a.finalScore
    })
  }, [players, playerStats, state.playerStates, storedMatch.winnerId])

  const winner = players.find(p => p.playerId === storedMatch.winnerId)

  // Config info
  const config = match.config

  return (
    <div style={styles.page}>
      <div style={styles.headerRow}>
        <h2 style={{ margin: 0 }}>Bob's 27</h2>
        <button style={styles.backBtn} onClick={onBack}>&larr; Zurueck</button>
      </div>

      <div style={styles.centerPage}>
        <div style={{ ...styles.centerInner, maxWidth: 560 }}>

          {/* Match Header */}
          <div style={{ ...styles.card, marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
              <div>
                <div style={{ fontSize: 12, color: colors.fgMuted }}>
                  {new Date(storedMatch.createdAt).toLocaleDateString('de-DE', {
                    weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric',
                  })}
                  {' '}
                  {new Date(storedMatch.createdAt).toLocaleTimeString('de-DE', {
                    hour: '2-digit', minute: '2-digit',
                  })}
                </div>
                <div style={{ fontSize: 12, color: colors.fgMuted, marginTop: 2 }}>
                  {players.map(p => p.name).join(' vs ')}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 12, color: colors.fgMuted }}>
                  {formatDuration(storedMatch.durationMs ?? 0)}
                </div>
                <div style={{ fontSize: 11, color: colors.fgDim, marginTop: 2 }}>
                  {config.includeBull ? '21 Targets (+ Bull)' : '20 Targets'}
                  {config.allowNegative ? ' | Negativ erlaubt' : ''}
                </div>
              </div>
            </div>

            {/* Ergebnis */}
            <div style={{ textAlign: 'center', paddingTop: 8, borderTop: `1px solid ${colors.border}` }}>
              {isSolo ? (
                <>
                  <div style={{
                    fontSize: 48, fontWeight: 800,
                    color: rankings[0]?.eliminated ? colors.error : colors.success,
                    marginBottom: 4,
                  }}>
                    {rankings[0]?.finalScore ?? 0}
                  </div>
                  <div style={{
                    fontSize: 16, fontWeight: 600,
                    color: rankings[0]?.eliminated ? colors.error : colors.success,
                    marginBottom: 8,
                  }}>
                    {rankings[0]?.eliminated
                      ? `Game Over bei D${(rankings[0]?.eliminatedAtTarget ?? 0) + 1}`
                      : 'Geschafft!'}
                  </div>
                </>
              ) : winner ? (
                <>
                  <div style={{ fontSize: 14, color: colors.fgMuted, marginBottom: 4 }}>Gewinner</div>
                  <div style={{ fontSize: 32, fontWeight: 700, color: colors.success, marginBottom: 4 }}>
                    {winner.name}
                  </div>
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
                    {rankings[0]?.totalDarts}
                  </div>
                  <div style={{ fontSize: 11, color: colors.fgMuted }}>Darts</div>
                </div>
              </div>
            </div>
          </div>

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
                background: isArcade ? `${colors.accent}15` : 'linear-gradient(135deg, #eff6ff, #dbeafe)',
                border: `1px solid ${isArcade ? colors.accent + '40' : '#93c5fd'}`,
                maxWidth: 700, margin: '0 auto 16px',
              }}>
                <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 8, color: isArcade ? colors.accent : '#1e40af' }}>
                  Spielbericht
                </div>
                <div style={{ lineHeight: 1.7, fontSize: 14, color: colors.fg }}>
                  {report}
                </div>
              </div>
            ) : null
          })()}

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
                <div style={{ ...styles.sub, marginBottom: 8 }}>Statistiken</div>
                <div style={{ overflowX: isMobile ? 'auto' : undefined }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <th style={{ ...thStyle, textAlign: 'left' }}>Stat</th>
                        {rankings.map(p => (
                          <th key={p.playerId} style={{ ...thStyle, color: isSolo ? colors.fgMuted : (p.isWinner ? colors.success : p.color) }}>
                            {isSolo ? '' : p.name}
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
                        <td style={tdLabelStyle}><StatTooltip label="Targets" tooltip={STAT_TOOLTIPS['Targets'] || 'Targets'} colors={colors} /></td>
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
                        <td style={tdLabelStyle}><StatTooltip label="Darts" tooltip={STAT_TOOLTIPS['Darts'] || 'Darts'} colors={colors} /></td>
                        {rankings.map((p, i) => (
                          <td key={p.playerId} style={cellStyle(dartsWin[i])}>
                            {p.totalDarts}
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <td style={tdLabelStyle}><StatTooltip label="Treffer" tooltip={STAT_TOOLTIPS['Treffer'] || 'Treffer'} colors={colors} /></td>
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

          {/* Match-Aggregat + Leg-Liste (nur bei > 1 Leg) */}
          <Bobs27AggregateSection
            match={storedMatch}
            players={players}
            playerColor={(pid) => rankings.find(r => r.playerId === pid)?.color ?? PLAYER_COLORS[0]}
            colors={colors}
            styles={styles}
            onOpenLeg={onOpenLegSummary ? (idx) => onOpenLegSummary(matchId, idx) : undefined}
          />

          {/* Target-by-target Breakdown */}
          {isSolo ? (
            // Solo: einzelne Tabelle
            rankings[0]?.targetResults.length > 0 && (
              <div style={{ ...styles.card, marginBottom: 16 }}>
                <div style={{ ...styles.sub, marginBottom: 8 }}>Target-Uebersicht</div>
                <TargetTable results={rankings[0].targetResults} colors={colors} />
              </div>
            )
          ) : (
            // Multiplayer: Vergleichstabelle nebeneinander
            <div style={{ ...styles.card, marginBottom: 16 }}>
              <div style={{ ...styles.sub, marginBottom: 8 }}>Target-Vergleich</div>
              <ComparisonTable rankings={rankings} targets={match.targets} colors={colors} />
            </div>
          )}

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

type TargetResultStat = {
  label: string
  hits: number
  darts: number
  delta: number
  scoreAfter: number
}

function TargetTable({ results, colors }: { results: TargetResultStat[]; colors: any }) {
  // Find best and worst targets
  let bestIdx = -1
  let worstIdx = -1
  let bestDelta = -Infinity
  let worstDelta = Infinity
  results.forEach((r, i) => {
    if (r.delta > bestDelta) { bestDelta = r.delta; bestIdx = i }
    if (r.delta < worstDelta) { worstDelta = r.delta; worstIdx = i }
  })

  return (
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
          {results.map((r, i) => {
            const bg = r.hits === r.darts
              ? colors.successBg
              : r.hits > 0
                ? (colors.warningBg ?? 'rgba(255,200,0,0.08)')
                : (colors.errorBg ?? 'rgba(255,0,0,0.06)')
            const isBest = i === bestIdx
            const isWorst = i === worstIdx
            return (
              <tr key={i} style={{
                borderBottom: `1px solid ${colors.border}`,
                background: bg,
              }}>
                <td style={{ padding: '4px 6px', fontWeight: 500 }}>
                  {r.label}
                  {isBest && <span style={{ marginLeft: 4, fontSize: 10, color: colors.success }} title="Bestes Target">&#9650;</span>}
                  {isWorst && <span style={{ marginLeft: 4, fontSize: 10, color: colors.error }} title="Schwachstes Target">&#9660;</span>}
                </td>
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
  )
}

/** Multiplayer Comparison Table - side by side */
function ComparisonTable({ rankings, targets, colors }: {
  rankings: Array<{
    playerId: string; name: string; color: string
    targetResults: TargetResultStat[]
  }>
  targets: Array<{ label: string }>
  colors: any
}) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
        <thead>
          <tr style={{ borderBottom: `2px solid ${colors.border}` }}>
            <th style={{ textAlign: 'left', padding: '4px 4px', color: colors.fgMuted }}>Ziel</th>
            {rankings.map(p => (
              <th key={p.playerId} colSpan={2} style={{
                textAlign: 'center', padding: '4px 4px',
                color: p.color, borderLeft: `2px solid ${colors.border}`,
              }}>
                {p.name}
              </th>
            ))}
          </tr>
          <tr style={{ borderBottom: `1px solid ${colors.border}` }}>
            <th style={{ padding: '2px 4px' }}></th>
            {rankings.map(p => (
              <React.Fragment key={p.playerId}>
                <th style={{
                  textAlign: 'center', padding: '2px 4px', color: colors.fgDim, fontSize: 10,
                  borderLeft: `2px solid ${colors.border}`,
                }}>Hits</th>
                <th style={{
                  textAlign: 'right', padding: '2px 4px', color: colors.fgDim, fontSize: 10,
                }}>Score</th>
              </React.Fragment>
            ))}
          </tr>
        </thead>
        <tbody>
          {targets.map((t, ti) => (
            <tr key={ti} style={{ borderBottom: `1px solid ${colors.border}` }}>
              <td style={{ padding: '3px 4px', fontWeight: 500, fontSize: 12 }}>{t.label}</td>
              {rankings.map(p => {
                const r = p.targetResults[ti]
                if (!r) {
                  return (
                    <React.Fragment key={p.playerId}>
                      <td style={{
                        textAlign: 'center', padding: '3px 4px',
                        borderLeft: `2px solid ${colors.border}`,
                        color: colors.fgDim,
                      }}>-</td>
                      <td style={{ textAlign: 'right', padding: '3px 4px', color: colors.fgDim }}>-</td>
                    </React.Fragment>
                  )
                }
                const bg = r.hits === r.darts
                  ? colors.successBg
                  : r.hits > 0
                    ? (colors.warningBg ?? 'rgba(255,200,0,0.08)')
                    : (colors.errorBg ?? 'rgba(255,0,0,0.06)')
                return (
                  <React.Fragment key={p.playerId}>
                    <td style={{
                      textAlign: 'center', padding: '3px 4px',
                      borderLeft: `2px solid ${colors.border}`,
                      background: bg,
                    }}>
                      <HitDots hits={r.hits} total={r.darts} colors={colors} />
                    </td>
                    <td style={{
                      textAlign: 'right', padding: '3px 4px',
                      fontWeight: 600, background: bg,
                      color: r.delta >= 0 ? colors.success : colors.error,
                      fontSize: 12,
                    }}>
                      {r.scoreAfter}
                    </td>
                  </React.Fragment>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

