// src/screens/ShanghaiSummary.tsx
// Match-Zusammenfassung fuer Shanghai Darts

import React, { useMemo, useState, useEffect } from 'react'
import { getThemedUI } from '../ui'
import { useTheme } from '../ThemeProvider'
import { getShanghaiMatchById, setShanghaiMatchMetadata } from '../storage'
import { applyShanghaiEvents, formatDuration } from '../dartsShanghai'
import { computeShanghaiMatchStats } from '../stats/computeShanghaiStats'
import { PLAYER_COLORS } from '../playerColors'
import { generateShanghaiReport } from '../narratives/generateModeReports'
import StatTooltip, { STAT_TOOLTIPS } from '../components/StatTooltip'

// Bestimmt Spielerfarbe für den Gewinner einer Statistik-Spalte
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

export default function ShanghaiSummary({ matchId, onBackToMenu, onRematch, onBackToLobby }: Props) {
  const { isArcade, colors } = useTheme()
  const styles = useMemo(() => getThemedUI(colors, isArcade), [colors, isArcade])

  const [isMobile, setIsMobile] = useState(() => Math.min(window.innerWidth, window.innerHeight) < 600)
  useEffect(() => {
    const check = () => setIsMobile(Math.min(window.innerWidth, window.innerHeight) < 600)
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  const storedMatch = getShanghaiMatchById(matchId)

  const [endscreenName, setEndscreenName] = useState((storedMatch as any)?.matchName ?? '')
  const [endscreenNotes, setEndscreenNotes] = useState((storedMatch as any)?.notes ?? '')
  const [metadataSaved, setMetadataSaved] = useState(
    (storedMatch as any)?.matchName !== undefined || (storedMatch as any)?.notes !== undefined
  )

  const handleSaveMetadata = () => {
    const success = setShanghaiMatchMetadata(matchId, endscreenName, endscreenNotes)
    if (success) setMetadataSaved(true)
  }

  if (!storedMatch) {
    return (
      <div style={styles.page}>
        <p>Match nicht gefunden.</p>
        <button style={styles.backBtn} onClick={onBackToMenu}>← Zurueck</button>
      </div>
    )
  }

  const state = applyShanghaiEvents(storedMatch.events)
  const match = state.match

  if (!match) {
    return (
      <div style={styles.page}>
        <p>Match-Daten nicht verfuegbar.</p>
        <button style={styles.backBtn} onClick={onBackToMenu}>← Zurueck</button>
      </div>
    )
  }

  const players = match.players
  const isDraw = storedMatch.winnerId === null || storedMatch.winnerId === undefined
  const winner = players.find(p => p.playerId === storedMatch.winnerId)

  // Per-player Stats berechnen
  const playerStats = useMemo(() => {
    return players.map(p => ({
      playerId: p.playerId,
      stats: computeShanghaiMatchStats(storedMatch, p.playerId),
    }))
  }, [players, storedMatch])

  // Rankings: Spieler nach Gesamtpunkten sortieren
  const rankings = useMemo(() => {
    return players.map((p, i) => {
      const stats = playerStats.find(ps => ps.playerId === p.playerId)?.stats
      const totalScore = stats?.totalScore ?? (storedMatch.finalScores?.[p.playerId] ?? 0)
      return {
        playerId: p.playerId,
        name: p.name,
        color: PLAYER_COLORS[i % PLAYER_COLORS.length],
        totalScore,
        avgPerRound: stats?.avgPerRound ?? 0,
        bestRound: stats?.bestRound ?? { round: 0, score: 0 },
        worstRound: stats?.worstRound ?? { round: 0, score: 0 },
        shanghaiCount: stats?.shanghaiCount ?? 0,
        triples: stats?.triples ?? 0,
        doubles: stats?.doubles ?? 0,
        singles: stats?.singles ?? 0,
        misses: stats?.misses ?? 0,
        totalDarts: stats?.totalDarts ?? 0,
        hitRate: stats?.hitRate ?? 0,
        consistencyScore: stats?.consistencyScore ?? 0,
        longestScoringStreak: stats?.longestScoringStreak ?? 0,
        dartsUsed: state.dartsUsedTotalByPlayer[p.playerId] ?? 0,
        isWinner: p.playerId === storedMatch.winnerId,
      }
    }).sort((a, b) => b.totalScore - a.totalScore)
  }, [players, playerStats, state.dartsUsedTotalByPlayer, storedMatch.winnerId, storedMatch.finalScores])

  const maxScore = rankings.length > 0 ? rankings[0].totalScore : 1

  // Gesamte Shanghai-Hits ueber alle Spieler
  const totalShanghais = rankings.reduce((sum, p) => sum + p.shanghaiCount, 0)

  // Runden-Uebersicht aus RoundFinished-Events
  const roundBreakdown = useMemo(() => {
    const rounds: Array<{
      roundNumber: number
      scoresByPlayer: Record<string, number>
      totalsByPlayer: Record<string, number>
    }> = []

    for (const event of storedMatch.events) {
      if (event.type === 'ShanghaiRoundFinished') {
        rounds.push({
          roundNumber: event.roundNumber,
          scoresByPlayer: event.scoresByPlayer,
          totalsByPlayer: event.totalsByPlayer,
        })
      }
    }

    return rounds
  }, [storedMatch.events])

  // Gesamtdarts
  const totalDartsAll = Object.values(state.dartsUsedTotalByPlayer).reduce((a, b) => a + b, 0)

  // Gespielte Runden
  const roundsPlayed = roundBreakdown.length

  // Struktur-Info
  const structureLabel = match.structure.kind === 'legs'
    ? `Best of ${match.structure.bestOfLegs} Legs`
    : `Best of ${match.structure.bestOfSets} Sets (${match.structure.legsPerSet} Legs)`

  // Draw: Spieler mit gleichem Top-Score
  const tiedPlayers = useMemo(() => {
    if (!isDraw) return []
    const topScore = rankings[0]?.totalScore ?? 0
    return rankings.filter(p => p.totalScore === topScore)
  }, [isDraw, rankings])

  return (
    <div style={styles.page}>
      <div style={styles.headerRow}>
        <h2 style={{ margin: 0 }}>Shanghai</h2>
        <button style={styles.backBtn} onClick={onBackToMenu}>
          ← Menu
        </button>
      </div>

      <div style={styles.centerPage}>
        <div style={{ ...styles.centerInner, maxWidth: isMobile ? '100%' : 500, padding: isMobile ? '0 4px' : undefined }}>

          {/* Modus-Badge */}
          <div style={{ ...styles.card, marginBottom: 16, padding: '10px 14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
              <span style={{ fontWeight: 600 }}>
                Shanghai – Ergebnis
              </span>
              <span style={{
                background: colors.accent,
                color: colors.bg,
                padding: '2px 8px',
                borderRadius: 4,
                fontSize: 11,
                fontWeight: 600,
              }}>
                {structureLabel}
              </span>
            </div>
          </div>

          {/* Gewinner-Anzeige oder Unentschieden */}
          {isDraw ? (
            <div style={{ ...styles.card, marginBottom: 16, textAlign: 'center' }}>
              <div style={{ fontSize: 14, color: colors.fgMuted, marginBottom: 4 }}>
                Ergebnis
              </div>
              <div style={{ fontSize: 28, fontWeight: 700, color: '#888', marginBottom: 8 }}>
                Unentschieden
              </div>
              <div style={{ fontSize: 14, color: colors.fgMuted, marginBottom: 8 }}>
                {tiedPlayers.map(p => p.name).join(' & ')}
              </div>
              <div style={{ display: 'flex', justifyContent: 'center', gap: 24 }}>
                <div>
                  <div style={{ fontSize: 24, fontWeight: 700, color: colors.accent }}>
                    {tiedPlayers[0]?.totalScore ?? 0}
                  </div>
                  <div style={{ fontSize: 11, color: colors.fgMuted }}>Punkte</div>
                </div>
                <div>
                  <div style={{ fontSize: 24, fontWeight: 700, color: colors.fgDim }}>
                    {formatDuration(storedMatch.durationMs ?? 0)}
                  </div>
                  <div style={{ fontSize: 11, color: colors.fgMuted }}>Zeit</div>
                </div>
              </div>
            </div>
          ) : winner && rankings.length > 0 ? (
            <div style={{ ...styles.card, marginBottom: 16, textAlign: 'center' }}>
              <div style={{ fontSize: 14, color: colors.fgMuted, marginBottom: 4 }}>
                Gewinner
              </div>
              <div style={{ fontSize: isMobile ? 24 : 32, fontWeight: 700, color: colors.success, marginBottom: 8 }}>
                {winner.name}
              </div>
              <div style={{ display: 'flex', justifyContent: 'center', gap: 24 }}>
                <div>
                  <div style={{ fontSize: 24, fontWeight: 700, color: colors.accent }}>
                    {rankings.find(p => p.isWinner)?.totalScore ?? 0}
                  </div>
                  <div style={{ fontSize: 11, color: colors.fgMuted }}>Punkte</div>
                </div>
                {(rankings.find(p => p.isWinner)?.shanghaiCount ?? 0) > 0 && (
                  <div>
                    <div style={{ fontSize: 24, fontWeight: 700, color: colors.warning }}>
                      {rankings.find(p => p.isWinner)?.shanghaiCount ?? 0}
                    </div>
                    <div style={{ fontSize: 11, color: colors.fgMuted }}>Shanghai</div>
                  </div>
                )}
                <div>
                  <div style={{ fontSize: 24, fontWeight: 700, color: colors.fgDim }}>
                    {formatDuration(storedMatch.durationMs ?? 0)}
                  </div>
                  <div style={{ fontSize: 11, color: colors.fgMuted }}>Zeit</div>
                </div>
              </div>
            </div>
          ) : null}

          {/* Spielbericht */}
          {(() => {
            const report = generateShanghaiReport({
              matchId,
              players: players.map(p => ({ id: p.playerId, name: p.name })),
              winnerId: storedMatch.winnerId,
              rankings: rankings.map(r => ({
                playerId: r.playerId,
                name: r.name,
                totalScore: r.totalScore,
                avgPerRound: r.avgPerRound,
                bestRound: r.bestRound,
                worstRound: r.worstRound,
                shanghaiCount: r.shanghaiCount,
                hitRate: r.hitRate,
                longestScoringStreak: r.longestScoringStreak,
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

          {/* Shanghai-Highlights */}
          {totalShanghais > 0 && (
            <div style={{ ...styles.card, marginBottom: 16, textAlign: 'center' }}>
              <div style={{ ...styles.sub, marginBottom: 8 }}>Shanghai-Highlights</div>
              <div style={{ display: 'flex', justifyContent: 'center', gap: 20, flexWrap: 'wrap' }}>
                {rankings.filter(p => p.shanghaiCount > 0).map(p => (
                  <div key={p.playerId} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{
                      width: 10,
                      height: 10,
                      borderRadius: 2,
                      background: p.color,
                    }} />
                    <span style={{ fontWeight: 600, color: p.color }}>{p.name}</span>
                    <span style={{
                      background: colors.warning,
                      color: colors.bg,
                      padding: '1px 6px',
                      borderRadius: 4,
                      fontSize: 12,
                      fontWeight: 700,
                    }}>
                      {p.shanghaiCount}x Shanghai
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Score-Rangliste */}
          {rankings.length > 0 && (
            <div style={{ ...styles.card, marginBottom: 16 }}>
              <div style={{ ...styles.sub, marginBottom: 8 }}>Rangliste</div>
              <div style={{ display: 'grid', gap: 8 }}>
                {rankings.map((p, i) => {
                  const percent = maxScore > 0 ? (p.totalScore / maxScore) * 100 : 0

                  return (
                    <div
                      key={p.playerId}
                      style={{
                        padding: '10px 14px',
                        borderRadius: 8,
                        background: p.isWinner ? colors.successBg : colors.bgMuted,
                        border: p.isWinner ? `2px solid ${colors.success}` : `1px solid ${colors.border}`,
                        borderLeft: `4px solid ${p.color}`,
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <span style={{ fontWeight: p.isWinner ? 700 : 500, color: p.isWinner ? colors.success : colors.fg }}>
                          {i + 1}. {p.name} {p.isWinner && '\u{1F3C6}'}
                        </span>
                        <span style={{ fontSize: 16, color: colors.accent, fontWeight: 700 }}>
                          {p.totalScore} Pkt
                        </span>
                      </div>
                      {/* Score-Bar */}
                      <div style={{ height: 6, background: colors.bgSoft, borderRadius: 3, overflow: 'hidden' }}>
                        <div
                          style={{
                            height: '100%',
                            width: `${percent}%`,
                            background: p.color,
                            opacity: 0.8,
                          }}
                        />
                      </div>
                      <div style={{ fontSize: 11, color: colors.fgMuted, marginTop: 4, display: 'flex', justifyContent: 'space-between' }}>
                        <span>
                          Avg {p.avgPerRound.toFixed(1)}/Runde
                          {p.shanghaiCount > 0 && ` | ${p.shanghaiCount}x Shanghai`}
                        </span>
                        <span>{p.dartsUsed} Darts</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Spieler-Stats Tabelle */}
          <div style={{ ...styles.card, marginBottom: 16 }}>
            <div style={{ ...styles.sub, marginBottom: 8 }}>Spieler-Statistiken</div>
            <div style={{ overflowX: 'auto' }}>
              {(() => {
                // Per-Column Winner berechnen
                const pids = rankings.map(p => p.playerId)
                const colorMap: Record<string, string> = {}
                rankings.forEach(p => { colorMap[p.playerId] = p.color })
                const avgWin = getStatWinnerColors(rankings.map(p => p.avgPerRound), pids, 'high', colorMap)
                const bestWin = getStatWinnerColors(rankings.map(p => p.bestRound.score), pids, 'high', colorMap)
                const worstWin = getStatWinnerColors(rankings.map(p => p.worstRound.score), pids, 'high', colorMap)
                const missWin = getStatWinnerColors(rankings.map(p => p.misses), pids, 'low', colorMap)
                const hitWin = getStatWinnerColors(rankings.map(p => p.hitRate), pids, 'high', colorMap)
                const consistWin = getStatWinnerColors(rankings.map(p => p.consistencyScore), pids, 'low', colorMap)
                const streakWin = getStatWinnerColors(rankings.map(p => p.longestScoringStreak), pids, 'high', colorMap)
                const shanghaiWin = getStatWinnerColors(rankings.map(p => p.shanghaiCount), pids, 'high', colorMap)

                const thStyle: React.CSSProperties = { textAlign: 'right', padding: '6px 8px', color: colors.fgMuted, whiteSpace: 'nowrap' }
                const tdStyle: React.CSSProperties = { textAlign: 'right', padding: '6px 8px' }

                return (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ borderBottom: `1px solid ${colors.border}` }}>
                        <th style={{ ...thStyle, textAlign: 'left' }}>Spieler</th>
                        <th style={thStyle}><StatTooltip label="Punkte" tooltip={STAT_TOOLTIPS['Punkte'] || 'Punkte'} colors={colors} /></th>
                        <th style={thStyle}><StatTooltip label="Darts" tooltip={STAT_TOOLTIPS['Darts'] || 'Darts'} colors={colors} /></th>
                        <th style={thStyle}><StatTooltip label="Avg/R" tooltip={STAT_TOOLTIPS['Avg/R'] || 'Avg/R'} colors={colors} /></th>
                        <th style={thStyle}><StatTooltip label="Beste" tooltip={STAT_TOOLTIPS['Beste'] || 'Beste'} colors={colors} /></th>
                        <th style={thStyle}><StatTooltip label="Schw." tooltip={STAT_TOOLTIPS['Schw.'] || 'Schw.'} colors={colors} /></th>
                        <th style={thStyle}><StatTooltip label="Shanghai" tooltip={STAT_TOOLTIPS['Shanghai'] || 'Shanghai'} colors={colors} /></th>
                        <th style={thStyle}><StatTooltip label="T/D/S" tooltip={STAT_TOOLTIPS['T/D/S'] || 'T/D/S'} colors={colors} /></th>
                        <th style={thStyle}><StatTooltip label="Miss" tooltip={STAT_TOOLTIPS['Miss'] || 'Miss'} colors={colors} /></th>
                        <th style={thStyle}><StatTooltip label="Hit%" tooltip={STAT_TOOLTIPS['Hit%'] || 'Hit%'} colors={colors} /></th>
                        <th style={thStyle}><StatTooltip label="Konsist." tooltip={STAT_TOOLTIPS['Konsist.'] || 'Konsist.'} colors={colors} /></th>
                        <th style={thStyle}><StatTooltip label="Streak" tooltip={STAT_TOOLTIPS['Streak'] || 'Streak'} colors={colors} /></th>
                      </tr>
                    </thead>
                    <tbody>
                      {rankings.map((p, i) => (
                        <tr key={p.playerId} style={{ borderBottom: `1px solid ${colors.border}` }}>
                          <td style={{ padding: '6px 8px', fontWeight: 600 }}>
                            <span style={{ color: p.color }}>{p.name}</span>
                          </td>
                          <td style={{ ...tdStyle, fontWeight: 700, color: colors.accent }}>
                            {p.totalScore}
                          </td>
                          <td style={tdStyle}>
                            {p.dartsUsed}
                          </td>
                          <td style={{ ...tdStyle, ...(avgWin[i] ? { color: avgWin[i], fontWeight: 700 } : {}) }}>
                            {p.avgPerRound.toFixed(1)}
                          </td>
                          <td style={{ ...tdStyle, ...(bestWin[i] ? { color: bestWin[i], fontWeight: 700 } : { color: colors.success }) }}>
                            {p.bestRound.score > 0 ? `${p.bestRound.score} (R${p.bestRound.round})` : '-'}
                          </td>
                          <td style={{ ...tdStyle, ...(worstWin[i] ? { color: worstWin[i], fontWeight: 700 } : { color: colors.error }) }}>
                            {p.worstRound.round > 0 ? `${p.worstRound.score} (R${p.worstRound.round})` : '-'}
                          </td>
                          <td style={{ ...tdStyle, ...(shanghaiWin[i] ? { color: shanghaiWin[i], fontWeight: 700 } : p.shanghaiCount > 0 ? { color: colors.warning, fontWeight: 700 } : { color: colors.fgDim }) }}>
                            {p.shanghaiCount}x
                          </td>
                          <td style={tdStyle}>
                            {p.triples}/{p.doubles}/{p.singles}
                          </td>
                          <td style={{ ...tdStyle, ...(missWin[i] ? { color: missWin[i], fontWeight: 700 } : { color: colors.fgDim }) }}>
                            {p.misses}
                          </td>
                          <td style={{ ...tdStyle, fontWeight: 600, ...(hitWin[i] ? { color: hitWin[i], fontWeight: 700 } : {}) }}>
                            {p.hitRate.toFixed(0)}%
                          </td>
                          <td style={{ ...tdStyle, ...(consistWin[i] ? { color: consistWin[i], fontWeight: 700 } : {}) }} title={`Standardabweichung: ${p.consistencyScore.toFixed(1)}`}>
                            {p.consistencyScore.toFixed(1)}
                          </td>
                          <td style={{ ...tdStyle, ...(streakWin[i] ? { color: streakWin[i], fontWeight: 700 } : {}) }}>
                            {p.longestScoringStreak}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )
              })()}
            </div>
          </div>

          {/* Runden-Uebersicht */}
          {roundBreakdown.length > 0 && (
            <div style={{ ...styles.card, marginBottom: 16 }}>
              <div style={{ ...styles.sub, marginBottom: 8 }}>Runden-Uebersicht</div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${colors.border}` }}>
                      <th style={{ textAlign: 'left', padding: '4px 6px', color: colors.fgMuted }}>Runde</th>
                      {rankings.map(p => (
                        <th key={p.playerId} style={{ textAlign: 'right', padding: '4px 6px', color: p.color }}>
                          {p.name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {roundBreakdown.map(round => {
                      // Hoechsten Score der Runde finden
                      const roundScores = rankings.map(p => round.scoresByPlayer[p.playerId] ?? 0)
                      const roundMax = Math.max(...roundScores)

                      return (
                        <tr key={round.roundNumber} style={{ borderBottom: `1px solid ${colors.border}` }}>
                          <td style={{ padding: '4px 6px', fontWeight: 500, color: colors.fgDim }}>
                            R{round.roundNumber}
                          </td>
                          {rankings.map(p => {
                            const roundScore = round.scoresByPlayer[p.playerId] ?? 0
                            const isBest = roundScore > 0 && roundScore === roundMax
                            return (
                              <td
                                key={p.playerId}
                                style={{
                                  textAlign: 'right',
                                  padding: '4px 6px',
                                  fontWeight: isBest ? 700 : 400,
                                  color: roundScore === 0 ? colors.fgDim : (isBest ? colors.success : colors.fg),
                                }}
                              >
                                {roundScore}
                              </td>
                            )
                          })}
                        </tr>
                      )
                    })}
                    {/* Gesamtsumme */}
                    <tr style={{ borderTop: `2px solid ${colors.border}` }}>
                      <td style={{ padding: '6px 6px', fontWeight: 700 }}>Gesamt</td>
                      {rankings.map(p => (
                        <td key={p.playerId} style={{ textAlign: 'right', padding: '6px 6px', fontWeight: 700, color: p.color }}>
                          {p.totalScore}
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Match-Info */}
          <div style={{ ...styles.card, marginBottom: 16 }}>
            <div style={{ ...styles.sub, marginBottom: 8 }}>Match-Info</div>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr', gap: isMobile ? 8 : 12, textAlign: 'center' }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 700, color: colors.fg }}>
                  {formatDuration(storedMatch.durationMs ?? 0)}
                </div>
                <div style={{ fontSize: 11, color: colors.fgMuted }}>Dauer</div>
              </div>
              <div>
                <div style={{ fontSize: 18, fontWeight: 700, color: colors.accent }}>
                  {totalDartsAll}
                </div>
                <div style={{ fontSize: 11, color: colors.fgMuted }}>Darts gesamt</div>
              </div>
              <div>
                <div style={{ fontSize: 18, fontWeight: 700, color: colors.fgDim }}>
                  {roundsPlayed}
                </div>
                <div style={{ fontSize: 11, color: colors.fgMuted }}>Runden</div>
              </div>
            </div>
          </div>

          {/* Spielname + Bemerkungen */}
          <div style={{ ...styles.card, marginBottom: 16 }}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>Spielinfo</div>
            {metadataSaved ? (
              <div>
                {endscreenName && (
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ fontWeight: 600, marginBottom: 4, fontSize: 13, color: colors.fgDim }}>Spielname</div>
                    <div style={{ fontWeight: 500 }}>{endscreenName}</div>
                  </div>
                )}
                {endscreenNotes && (
                  <div>
                    <div style={{ fontWeight: 600, marginBottom: 4, fontSize: 13, color: colors.fgDim }}>Bemerkungen</div>
                    <div style={{ whiteSpace: 'pre-wrap' }}>{endscreenNotes}</div>
                  </div>
                )}
                {!endscreenName && !endscreenNotes && (
                  <div style={{ color: colors.fgDim, fontSize: 13 }}>Keine Spielinfo gespeichert</div>
                )}
              </div>
            ) : (
              <div>
                <div style={{ marginBottom: 12 }}>
                  <label style={{ display: 'block', fontWeight: 600, marginBottom: 4, fontSize: 13 }}>Spielname (optional)</label>
                  <input type="text" value={endscreenName} onChange={(e) => setEndscreenName(e.target.value)}
                    placeholder="z.B. Finale WM 2024"
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: `1px solid ${colors.border}`, background: colors.bgInput, color: colors.fg, fontSize: 14, boxSizing: 'border-box' }} />
                </div>
                <div style={{ marginBottom: 12 }}>
                  <label style={{ display: 'block', fontWeight: 600, marginBottom: 4, fontSize: 13 }}>Bemerkungen (optional)</label>
                  <textarea value={endscreenNotes} onChange={(e) => setEndscreenNotes(e.target.value)}
                    placeholder="Besonderheiten, Highlights, etc." rows={3}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: `1px solid ${colors.border}`, background: colors.bgInput, color: colors.fg, fontSize: 14, resize: 'vertical', boxSizing: 'border-box' }} />
                </div>
                <button onClick={handleSaveMetadata}
                  style={{ padding: '8px 16px', borderRadius: 8, border: `1px solid ${colors.border}`, background: colors.bgCard, color: colors.fg, fontWeight: 600, fontSize: 14, cursor: 'pointer', width: '100%' }}>
                  Speichern
                </button>
              </div>
            )}
          </div>

          {/* Aktionen */}
          <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 8 }}>
            <button
              onClick={() => onRematch(matchId)}
              style={{ ...styles.pill, flex: 1, minHeight: isMobile ? 44 : undefined }}
            >
              Rematch
            </button>
            {onBackToLobby && (
              <button
                onClick={onBackToLobby}
                style={{ ...styles.pill, flex: 1, minHeight: isMobile ? 44 : undefined }}
              >
                Neues Spiel
              </button>
            )}
            <button
              onClick={onBackToMenu}
              style={{ ...styles.backBtn, flex: 1, minHeight: isMobile ? 44 : undefined }}
            >
              {onBackToLobby ? '← Menü' : 'Menu'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
