// src/screens/Bobs27Summary.tsx
// Match-Zusammenfassung fuer Bob's 27

import React, { useMemo } from 'react'
import { getThemedUI } from '../ui'
import { useTheme } from '../ThemeProvider'
import { getBobs27MatchById } from '../storage'
import { applyBobs27Events, formatDuration } from '../dartsBobs27'
import { computeBobs27MatchStats } from '../stats/computeBobs27Stats'
import { PLAYER_COLORS } from '../playerColors'

type Props = {
  matchId: string
  onBackToMenu: () => void
  onRematch: (matchId: string) => void
}

export default function Bobs27Summary({ matchId, onBackToMenu, onRematch }: Props) {
  const { isArcade, colors } = useTheme()
  const styles = useMemo(() => getThemedUI(colors, isArcade), [colors, isArcade])

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
        <div style={{ ...styles.centerInner, maxWidth: 500 }}>

          {/* Ergebnis-Anzeige */}
          <div style={{ ...styles.card, marginBottom: 16, textAlign: 'center' }}>
            <div style={{ fontSize: 14, color: colors.fgMuted, marginBottom: 4 }}>
              {isSolo ? 'Ergebnis' : 'Gewinner'}
            </div>

            {isSolo ? (
              <>
                <div style={{
                  fontSize: 48, fontWeight: 800,
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

          {/* Score-Verlaufs-Chart (SVG) */}
          {rankings.length > 0 && rankings[0].scoreHistory.length > 1 && (
            <div style={{ ...styles.card, marginBottom: 16 }}>
              <div style={{ ...styles.sub, marginBottom: 8 }}>Score-Verlauf</div>
              <ScoreChart
                players={rankings.map(p => ({ name: p.name, color: p.color, scores: p.scoreHistory }))}
                colors={colors}
              />
            </div>
          )}

          {/* Target-Timeline (Solo) */}
          {isSolo && rankings[0]?.targetResults.length > 0 && (
            <div style={{ ...styles.card, marginBottom: 16 }}>
              <div style={{ ...styles.sub, marginBottom: 8 }}>Target-Uebersicht</div>
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
                    {rankings[0].targetResults.map((r, i) => (
                      <tr key={i} style={{ borderBottom: `1px solid ${colors.border}` }}>
                        <td style={{ padding: '4px 6px', fontWeight: 500 }}>{r.label}</td>
                        <td style={{ textAlign: 'center', padding: '4px 6px' }}>
                          {r.hits > 0 ? (
                            <span style={{ color: colors.success }}>{r.hits}/{r.darts}</span>
                          ) : (
                            <span style={{ color: colors.error }}>0/{r.darts}</span>
                          )}
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
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Aktionen */}
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => onRematch(matchId)} style={{ ...styles.pill, flex: 1 }}>
              Rematch
            </button>
            <button onClick={onBackToMenu} style={{ ...styles.backBtn, flex: 1 }}>
              Menu
            </button>
          </div>
        </div>
      </div>
    </div>
  )
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
            D{i + 1}
          </text>
        )
      })}
    </svg>
  )
}
