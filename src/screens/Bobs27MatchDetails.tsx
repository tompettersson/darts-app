// src/screens/Bobs27MatchDetails.tsx
// Match-Details-Ansicht fuer abgeschlossene Bob's 27 Matches (aus StatsArea)

import React, { useMemo } from 'react'
import { getThemedUI } from '../ui'
import { useTheme } from '../ThemeProvider'
import { getBobs27MatchById } from '../storage'
import { applyBobs27Events, formatDuration } from '../dartsBobs27'
import { computeBobs27MatchStats } from '../stats/computeBobs27Stats'
import { PLAYER_COLORS } from '../playerColors'

type Props = {
  matchId: string
  onBack: () => void
}

export default function Bobs27MatchDetails({ matchId, onBack }: Props) {
  const { isArcade, colors } = useTheme()
  const styles = useMemo(() => getThemedUI(colors, isArcade), [colors, isArcade])

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
        scoreHistory: stats?.scoreHistory ?? [],
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

          {/* Detaillierte Statistik pro Spieler */}
          {rankings.map((p) => (
            <div key={`stats-${p.playerId}`} style={{ ...styles.card, marginBottom: 16 }}>
              <div style={{
                ...styles.sub, marginBottom: 8,
                borderLeft: !isSolo ? `4px solid ${p.color}` : undefined,
                paddingLeft: !isSolo ? 8 : undefined,
              }}>
                {isSolo ? 'Statistiken' : p.name}
              </div>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: '8px 16px',
                fontSize: 13,
              }}>
                <StatItem label="Final Score" value={`${p.finalScore}`} colors={colors}
                  valueColor={p.eliminated ? colors.error : colors.success} bold />
                <StatItem label="Hit-Rate" value={`${p.hitRate.toFixed(1)}%`} colors={colors}
                  valueColor={colors.accent} />
                <StatItem label="Bestes Target"
                  value={p.bestTarget ? `${p.bestTarget.label} (${p.bestTarget.hits}/3)` : '-'}
                  colors={colors} valueColor={colors.success} />
                <StatItem label="Schwachstes Target"
                  value={p.worstTarget ? `${p.worstTarget.label} (${p.worstTarget.hits}/3)` : '-'}
                  colors={colors} valueColor={colors.error} />
                <StatItem label="Laengste Hit-Serie"
                  value={`${p.longestHitStreak} Treffer`}
                  colors={colors} />
                <StatItem label="Hoechster Target-Score"
                  value={p.highestSingleTargetScore ? `+${p.highestSingleTargetScore.delta} (${p.highestSingleTargetScore.label})` : '-'}
                  colors={colors} valueColor={colors.success} />
                <StatItem label="Targets mit Treffer"
                  value={`${p.targetsWithHits}/${p.targetsCompleted}`}
                  colors={colors} />
                <StatItem label="Perfekte Targets (3/3)"
                  value={`${p.perfectTargets}`}
                  colors={colors} valueColor={p.perfectTargets > 0 ? colors.success : colors.fgDim} />
              </div>
            </div>
          ))}

          {/* Score-Verlaufs-Chart */}
          {rankings.length > 0 && rankings[0].scoreHistory.length > 1 && (
            <div style={{ ...styles.card, marginBottom: 16 }}>
              <div style={{ ...styles.sub, marginBottom: 8 }}>Score-Verlauf</div>
              <ScoreChart
                players={rankings.map(p => ({ name: p.name, color: p.color, scores: p.scoreHistory }))}
                colors={colors}
              />
              {/* Legende bei Multiplayer */}
              {!isSolo && (
                <div style={{ display: 'flex', gap: 12, marginTop: 6, flexWrap: 'wrap' }}>
                  {rankings.map(p => (
                    <div key={p.playerId} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
                      <span style={{
                        display: 'inline-block', width: 10, height: 10,
                        borderRadius: '50%', background: p.color,
                      }} />
                      <span style={{ color: colors.fgDim }}>{p.name}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

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

function StatItem({ label, value, colors, valueColor, bold }: {
  label: string
  value: string
  colors: any
  valueColor?: string
  bold?: boolean
}) {
  return (
    <div>
      <div style={{ fontSize: 11, color: colors.fgMuted, marginBottom: 2 }}>{label}</div>
      <div style={{
        fontSize: 14, fontWeight: bold ? 700 : 600,
        color: valueColor ?? colors.fg,
      }}>
        {value}
      </div>
    </div>
  )
}

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

// ===== Score-Verlaufs-Chart =====

function ScoreChart({ players, colors }: {
  players: Array<{ name: string; color: string; scores: number[] }>
  colors: any
}) {
  const W = 400
  const H = 160
  const PAD = { top: 12, bottom: 22, left: 38, right: 12 }
  const chartW = W - PAD.left - PAD.right
  const chartH = H - PAD.top - PAD.bottom

  const allScores = players.flatMap(p => p.scores)
  const minScore = Math.min(0, ...allScores)
  const maxScore = Math.max(27, ...allScores)
  const range = maxScore - minScore || 1

  const scaleX = (i: number, total: number) => PAD.left + (i / Math.max(total - 1, 1)) * chartW
  const scaleY = (v: number) => PAD.top + chartH - ((v - minScore) / range) * chartH

  // Max data points across all players
  const maxLen = Math.max(...players.map(p => p.scores.length))

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }}>
      {/* Grid lines */}
      {[minScore, Math.round(minScore + range * 0.25), Math.round(minScore + range * 0.5), Math.round(minScore + range * 0.75), maxScore].map((v, i) => (
        <line key={`grid-${i}`} x1={PAD.left} y1={scaleY(v)} x2={W - PAD.right} y2={scaleY(v)}
          stroke={colors.border} strokeWidth={0.5} opacity={0.3} />
      ))}

      {/* Null-Linie */}
      {minScore < 0 && (
        <line x1={PAD.left} y1={scaleY(0)} x2={W - PAD.right} y2={scaleY(0)}
          stroke={colors.error} strokeWidth={0.8} strokeDasharray="4,3" opacity={0.6} />
      )}

      {/* Start-Linie bei 27 */}
      <line x1={PAD.left} y1={scaleY(27)} x2={W - PAD.right} y2={scaleY(27)}
        stroke={colors.fgDim} strokeWidth={0.5} strokeDasharray="2,4" opacity={0.3} />

      {/* Y-Achse Labels */}
      {[minScore, Math.round((minScore + maxScore) / 2), maxScore].map((v, i) => (
        <text key={i} x={PAD.left - 4} y={scaleY(v) + 3}
          fill={colors.fgDim} fontSize={9} textAnchor="end">
          {v}
        </text>
      ))}

      {/* Area fill + Linien */}
      {players.map((p, pi) => {
        if (p.scores.length < 2) return null
        const points = p.scores.map((s, i) => ({
          x: scaleX(i, p.scores.length),
          y: scaleY(s),
        }))
        const linePath = points.map((pt, i) =>
          `${i === 0 ? 'M' : 'L'} ${pt.x} ${pt.y}`
        ).join(' ')

        // Area fill (line down to zero-line or bottom)
        const zeroY = scaleY(Math.max(0, minScore))
        const areaPath = linePath +
          ` L ${points[points.length - 1].x} ${zeroY}` +
          ` L ${points[0].x} ${zeroY} Z`

        return (
          <g key={pi}>
            <path d={areaPath} fill={p.color} opacity={0.08} />
            <path d={linePath} fill="none" stroke={p.color} strokeWidth={2} opacity={0.9} />
            {/* Data points */}
            {points.map((pt, i) => (
              <circle key={i} cx={pt.x} cy={pt.y} r={2} fill={p.color} opacity={0.7} />
            ))}
            {/* Endpunkt groesser */}
            <circle
              cx={points[points.length - 1].x}
              cy={points[points.length - 1].y}
              r={4} fill={p.color}
            />
            {/* Final score label */}
            <text
              x={points[points.length - 1].x + 6}
              y={points[points.length - 1].y + 3}
              fill={p.color} fontSize={10} fontWeight={700}>
              {p.scores[p.scores.length - 1]}
            </text>
          </g>
        )
      })}

      {/* X-Achse Labels */}
      {Array.from({ length: maxLen }, (_, i) => {
        if (maxLen > 12 && i % 2 !== 0 && i !== maxLen - 1 && i !== 0) return null
        return (
          <text key={i} x={scaleX(i, maxLen)} y={H - 4}
            fill={colors.fgDim} fontSize={8} textAnchor="middle">
            {i === 0 ? 'Start' : `D${i}`}
          </text>
        )
      })}
    </svg>
  )
}
