// src/screens/StraeusschenSummary.tsx
// Zusammenfassung für Sträußchen – Match-Kopf + detaillierte Statistik

import React, { useMemo } from 'react'
import { useTheme } from '../ThemeProvider'
import { getThemedUI } from '../ui'
import { getStrMatchById } from '../storage'
import {
  applyStrEvents,
  formatDuration,
  computeStrFieldScore,
  getAllNumbers,
  getTargetLabel,
} from '../dartsStraeusschen'
import type { StrTargetNumber, StrRingMode } from '../types/straeusschen'
import { computeStrMatchStats, computeStrLegStats, type StrPlayerMatchStat, type StrPlayerLegStat } from '../stats/computeStraeusschenStats'
import type { StrTurnAddedEvent, StrEvent } from '../dartsStraeusschen'
import { PLAYER_COLORS } from '../playerColors'
import { generateStraeusschenReport } from '../narratives/generateModeReports'

// Bestimmt Spielerfarbe für den Gewinner einer Statistik-Zeile
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

export default function StraeusschenSummary({ matchId, onBackToMenu, onRematch, onBackToLobby }: Props) {
  const { isArcade, colors } = useTheme()
  const styles = useMemo(() => getThemedUI(colors, isArcade), [colors, isArcade])

  const storedMatch = getStrMatchById(matchId)

  if (!storedMatch) {
    return (
      <div style={styles.page}>
        <p style={{ color: colors.fg }}>Match nicht gefunden.</p>
        <button style={styles.backBtn} onClick={onBackToMenu}>← Zurück</button>
      </div>
    )
  }

  const state = applyStrEvents(storedMatch.events)
  const match = state.match

  if (!match) {
    return (
      <div style={styles.page}>
        <p style={{ color: colors.fg }}>Match-Daten nicht verfügbar.</p>
        <button style={styles.backBtn} onClick={onBackToMenu}>← Zurück</button>
      </div>
    )
  }

  const ringMode: StrRingMode = storedMatch?.ringMode ?? 'triple'
  const ringPrefix = ringMode === 'double' ? 'D' : 'T'
  const ringLabel = ringMode === 'double' ? 'Double' : 'Triple'
  const formatTarget = (num: StrTargetNumber) => getTargetLabel(num, ringMode)
  const includeBull = !!storedMatch.ringMode && (
    storedMatch.generatedOrder?.includes(25 as StrTargetNumber) ||
    match.mode === 'single' && match.targetNumber === 25 ||
    !!storedMatch.bullMode
  )

  const winner = match.players.find(p => p.playerId === storedMatch.winnerId)
  const modeLabel = match.mode === 'single'
    ? `Sträußchen · ${formatTarget(match.targetNumber ?? 20 as StrTargetNumber)}`
    : `Sträußchen · ${ringPrefix}17–${ringPrefix}20${includeBull ? ' + Bull' : ''}`

  const isMultiField = match.mode === 'all'
  const players = match.players.map(p => ({ playerId: p.playerId, name: p.name }))

  // Match-Stats berechnen
  const matchStats = useMemo(
    () => computeStrMatchStats(storedMatch.events, players),
    [storedMatch.events]
  )

  // Sortieren: Gewinner zuerst, dann nach Score (höchster zuerst)
  const sorted = [...matchStats].sort((a, b) => {
    if (a.playerId === storedMatch.winnerId) return -1
    if (b.playerId === storedMatch.winnerId) return 1
    return b.totalScore - a.totalScore
  })

  // Leg-Stand Endergebnis
  const legScore = match.players.map(p => state.totalLegWinsByPlayer[p.playerId] || 0).join(' : ')
  const setScore = match.structure.kind === 'sets'
    ? match.players.map(p => state.setWinsByPlayer[p.playerId] || 0).join(' : ')
    : null

  // Anzahl Legs
  const legsPlayed = storedMatch.events.filter(e => e.type === 'StrLegFinished').length
  const isMultiLeg = legsPlayed > 1

  // Per-Leg Stats (für Einzelleg-Anzeige bei Single-Leg-Matches)
  const singleLegStats = useMemo(() => {
    if (isMultiLeg) return null
    const legId = storedMatch.events.find(e => e.type === 'StrLegStarted')
    if (!legId || legId.type !== 'StrLegStarted') return null
    const legTurns = storedMatch.events.filter(
      (e): e is StrTurnAddedEvent => e.type === 'StrTurnAdded' && (e as StrTurnAddedEvent).legId === legId.legId
    )
    return computeStrLegStats(legTurns, players)
  }, [storedMatch.events, isMultiLeg])

  // Für die Statistik-Tabelle: nutze Leg-Stats bei Single-Leg, sonst Match-Stats
  const displayStats = singleLegStats ?? sorted

  const tdStyle = (c: string | undefined): React.CSSProperties => ({
    textAlign: 'right',
    padding: '6px 8px',
    borderBottom: `1px solid ${colors.border}`,
    fontWeight: 600,
    color: c,
  })
  const labelStyle: React.CSSProperties = {
    padding: '6px 8px',
    borderBottom: `1px solid ${colors.border}`,
    color: colors.fgDim,
    fontSize: 13,
    whiteSpace: 'nowrap',
  }
  const headerStyle: React.CSSProperties = {
    textAlign: 'right',
    padding: '6px 8px',
    borderBottom: `1px solid ${colors.border}`,
    fontWeight: 700,
    fontSize: 13,
  }

  // PlayerIndex für Farben
  const playerColorMap = new Map<string, string>()
  match.players.forEach((p, i) => playerColorMap.set(p.playerId, PLAYER_COLORS[i % PLAYER_COLORS.length]))

  // Record-Version für getStatWinnerColors
  const playerColorRecord: Record<string, string> = {}
  match.players.forEach((p, i) => { playerColorRecord[p.playerId] = PLAYER_COLORS[i % PLAYER_COLORS.length] })
  const pids = sorted.map(s => s.playerId)

  // Winner-Farben pro Statistik-Zeile vorberechnen
  const scoreWin = getStatWinnerColors(
    sorted.map(s => isMultiLeg ? s.avgScorePerLeg : s.totalScore), pids, 'high', playerColorRecord
  )
  const turnsWin = getStatWinnerColors(sorted.map(s => s.totalTurns), pids, 'low', playerColorRecord)
  const dartsWin = getStatWinnerColors(sorted.map(s => s.totalDarts), pids, 'low', playerColorRecord)
  const hitRateWin = getStatWinnerColors(sorted.map(s => s.hitRate), pids, 'high', playerColorRecord)
  const bestRoundWin = getStatWinnerColors(sorted.map(s => s.bestRound?.hits ?? 0), pids, 'high', playerColorRecord)
  const worstRoundWin = getStatWinnerColors(sorted.map(s => s.worstRound?.hits ?? 0), pids, 'high', playerColorRecord)
  const avgHitsWin = getStatWinnerColors(sorted.map(s => s.avgHitsPerRound), pids, 'high', playerColorRecord)
  const streakWin = getStatWinnerColors(sorted.map(s => s.longestHitStreak), pids, 'high', playerColorRecord)
  const firstDartWin = getStatWinnerColors(sorted.map(s => s.firstDartHitRate), pids, 'high', playerColorRecord)

  // Single-leg Triple winners
  const singleLegSorted = singleLegStats ? sortedLegStats(singleLegStats, sorted) : []
  const triple1Win = singleLegSorted.length > 0
    ? getStatWinnerColors(singleLegSorted.map(ps => ps.fields[0]?.dartsToTriple[0] ?? Infinity), pids, 'low', playerColorRecord) : []
  const triple2Win = singleLegSorted.length > 0
    ? getStatWinnerColors(singleLegSorted.map(ps => ps.fields[0]?.dartsToTriple[1] ?? Infinity), pids, 'low', playerColorRecord) : []
  const triple3Win = singleLegSorted.length > 0
    ? getStatWinnerColors(singleLegSorted.map(ps => ps.fields[0]?.dartsToTriple[2] ?? Infinity), pids, 'low', playerColorRecord) : []
  // Multi-leg Ø Triple winners
  const avgTriple1Win = getStatWinnerColors(sorted.map(s => s.avgDartsToTriple[0] ?? Infinity), pids, 'low', playerColorRecord)
  const avgTriple2Win = getStatWinnerColors(sorted.map(s => s.avgDartsToTriple[1] ?? Infinity), pids, 'low', playerColorRecord)
  const avgTriple3Win = getStatWinnerColors(sorted.map(s => s.avgDartsToTriple[2] ?? Infinity), pids, 'low', playerColorRecord)
  const avgDartsPerLegWin = getStatWinnerColors(sorted.map(s => s.avgDartsPerLeg > 0 ? s.avgDartsPerLeg : Infinity), pids, 'low', playerColorRecord)

  return (
    <div style={styles.page}>
      <div style={styles.headerRow}>
        <h2 style={{ margin: 0, color: colors.fg }}>{modeLabel}</h2>
        <button style={styles.backBtn} onClick={onBackToMenu}>← Menü</button>
      </div>

      <div style={styles.centerPage}>
        <div style={{ ...styles.centerInner, maxWidth: 600 }}>

          {/* Match-Kopf */}
          <div style={{ ...styles.card, marginBottom: 16, textAlign: 'center' }}>
            {/* Endergebnis */}
            <div style={{ marginBottom: 12 }}>
              {setScore && (
                <div style={{ fontSize: 14, color: colors.fgDim, marginBottom: 2 }}>
                  Sets: {setScore}
                </div>
              )}
              <div style={{ fontSize: 14, color: colors.fgDim, marginBottom: 4 }}>
                {match.structure.kind === 'sets' ? 'Legs' : 'Legs'}: {legScore}
              </div>
              <div style={{ fontSize: 14, color: colors.fgDim }}>
                {formatDuration(storedMatch.durationMs ?? 0)}
              </div>
            </div>

            {/* Gewinner */}
            {winner && (
              <>
                <div style={{ fontSize: 14, color: colors.fgDim, marginBottom: 2 }}>Gewinner</div>
                <div style={{ fontSize: 32, fontWeight: 700, color: colors.success, marginBottom: 8 }}>
                  {winner.name}
                </div>
                <div style={{ display: 'flex', justifyContent: 'center', gap: 24 }}>
                  {/* Winner Score */}
                  {(() => {
                    const winnerStat = sorted.find(s => s.playerId === storedMatch.winnerId)
                    const score = isMultiLeg ? winnerStat?.avgScorePerLeg : winnerStat?.totalScore
                    return score != null ? (
                      <div>
                        <div style={{ fontSize: 24, fontWeight: 700, color: '#0ea5e9' }}>
                          {score.toFixed(1)}
                        </div>
                        <div style={{ fontSize: 11, color: colors.fgDim }}>{isMultiLeg ? 'Ø Score' : 'Score'}</div>
                      </div>
                    ) : null
                  })()}
                  <div>
                    <div style={{ fontSize: 24, fontWeight: 700, color: isArcade ? '#0ea5e9' : '#2563eb' }}>
                      {storedMatch.winnerDarts}
                    </div>
                    <div style={{ fontSize: 11, color: colors.fgDim }}>Darts</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 24, fontWeight: 700, color: colors.accent }}>
                      {formatDuration(storedMatch.durationMs ?? 0)}
                    </div>
                    <div style={{ fontSize: 11, color: colors.fgDim }}>Zeit</div>
                  </div>
                  {isMultiLeg && (
                    <div>
                      <div style={{ fontSize: 24, fontWeight: 700, color: colors.fg }}>
                        {legsPlayed}
                      </div>
                      <div style={{ fontSize: 11, color: colors.fgDim }}>Legs</div>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Spielbericht */}
          {(() => {
            const report = generateStraeusschenReport({
              matchId,
              players: match.players.map(p => ({ id: p.playerId, name: p.name })),
              winnerId: storedMatch.winnerId,
              ringMode,
              playerStats: sorted.map(s => ({
                playerId: s.playerId,
                name: s.name,
                totalScore: s.totalScore,
                hitRate: s.hitRate,
                totalDarts: s.totalDarts,
                bestRound: s.bestRound,
                longestHitStreak: s.longestHitStreak,
                avgHitsPerRound: s.avgHitsPerRound,
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

          {/* Statistik-Tabelle */}
          <div style={{ ...styles.card, marginBottom: 16, overflowX: 'auto' }}>
            <div style={{ ...styles.sub, marginBottom: 8, fontWeight: 700 }}>
              {isMultiLeg ? 'Match-Statistik' : 'Statistik'}
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, color: colors.fg }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', ...headerStyle, color: colors.fgDim }}></th>
                  {sorted.map(s => (
                    <th
                      key={s.playerId}
                      style={{
                        ...headerStyle,
                        color: s.playerId === storedMatch.winnerId
                          ? colors.success
                          : playerColorMap.get(s.playerId) ?? colors.fg,
                      }}
                    >
                      {s.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {/* Score */}
                <tr>
                  <td style={labelStyle}>{isMultiLeg ? 'Ø Score' : 'Score'}</td>
                  {sorted.map((s, i) => (
                    <td key={s.playerId} style={tdStyle(scoreWin[i] ?? '#0ea5e9')}>
                      {isMultiLeg ? s.avgScorePerLeg.toFixed(1) : s.totalScore.toFixed(1)}
                    </td>
                  ))}
                </tr>
                {/* Aufnahmen */}
                <tr>
                  <td style={labelStyle}>Aufnahmen</td>
                  {sorted.map((s, i) => <td key={s.playerId} style={tdStyle(turnsWin[i] ?? undefined)}>{s.totalTurns}</td>)}
                </tr>
                {/* Darts */}
                <tr>
                  <td style={labelStyle}>Darts</td>
                  {sorted.map((s, i) => <td key={s.playerId} style={tdStyle(dartsWin[i] ?? undefined)}>{s.totalDarts}</td>)}
                </tr>

                {/* Darts to Triple/Double (für Single-Mode oder Single-Leg) */}
                {!isMultiField && singleLegStats && (
                  <>
                    <tr>
                      <td style={labelStyle}>{"1. " + ringLabel}</td>
                      {sortedLegStats(singleLegStats, sorted).map((ps, i) => (
                        <td key={ps.playerId} style={tdStyle(triple1Win[i] ?? undefined)}>
                          {ps.fields[0]?.dartsToTriple[0] ?? '—'}
                        </td>
                      ))}
                    </tr>
                    <tr>
                      <td style={labelStyle}>{"2. " + ringLabel}</td>
                      {sortedLegStats(singleLegStats, sorted).map((ps, i) => (
                        <td key={ps.playerId} style={tdStyle(triple2Win[i] ?? undefined)}>
                          {ps.fields[0]?.dartsToTriple[1] ?? '—'}
                        </td>
                      ))}
                    </tr>
                    <tr>
                      <td style={labelStyle}>{"3. " + ringLabel}</td>
                      {sortedLegStats(singleLegStats, sorted).map((ps, i) => (
                        <td key={ps.playerId} style={tdStyle(triple3Win[i] ?? undefined)}>
                          {ps.fields[0]?.dartsToTriple[2] ?? '—'}
                        </td>
                      ))}
                    </tr>
                  </>
                )}

                {/* Ø Darts to Triple/Double (Multi-Leg, Single-Mode) */}
                {!isMultiField && isMultiLeg && (
                  <>
                    <tr>
                      <td style={labelStyle}>{"Ø 1. " + ringLabel}</td>
                      {sorted.map((s, i) => (
                        <td key={s.playerId} style={tdStyle(avgTriple1Win[i] ?? undefined)}>
                          {s.avgDartsToTriple[0] != null ? s.avgDartsToTriple[0].toFixed(1) : '—'}
                        </td>
                      ))}
                    </tr>
                    <tr>
                      <td style={labelStyle}>{"Ø 2. " + ringLabel}</td>
                      {sorted.map((s, i) => (
                        <td key={s.playerId} style={tdStyle(avgTriple2Win[i] ?? undefined)}>
                          {s.avgDartsToTriple[1] != null ? s.avgDartsToTriple[1].toFixed(1) : '—'}
                        </td>
                      ))}
                    </tr>
                    <tr>
                      <td style={labelStyle}>{"Ø 3. " + ringLabel}</td>
                      {sorted.map((s, i) => (
                        <td key={s.playerId} style={tdStyle(avgTriple3Win[i] ?? undefined)}>
                          {s.avgDartsToTriple[2] != null ? s.avgDartsToTriple[2].toFixed(1) : '—'}
                        </td>
                      ))}
                    </tr>
                    <tr>
                      <td style={labelStyle}>Ø Darts/Leg</td>
                      {sorted.map((s, i) => (
                        <td key={s.playerId} style={tdStyle(avgDartsPerLegWin[i] ?? undefined)}>
                          {s.avgDartsPerLeg > 0 ? s.avgDartsPerLeg.toFixed(1) : '—'}
                        </td>
                      ))}
                    </tr>
                  </>
                )}

                {/* Hit Rate */}
                <tr>
                  <td style={labelStyle}>Hit Rate</td>
                  {sorted.map((s, i) => (
                    <td key={s.playerId} style={tdStyle(hitRateWin[i] ?? undefined)}>
                      {s.hitRate.toFixed(1)}%
                    </td>
                  ))}
                </tr>

                {/* Treffer/Fehlwürfe */}
                <tr>
                  <td style={labelStyle}>Treffer / Fehl</td>
                  {sorted.map(s => (
                    <td key={s.playerId} style={tdStyle(undefined)}>
                      <span style={{ color: colors.success }}>{s.totalHits}</span>
                      {' / '}
                      <span style={{ color: colors.error }}>{s.totalMisses}</span>
                    </td>
                  ))}
                </tr>

                {/* Best Round */}
                <tr>
                  <td style={labelStyle}>Beste Runde</td>
                  {sorted.map((s, i) => (
                    <td key={s.playerId} style={tdStyle(bestRoundWin[i] ?? undefined)}>
                      {s.bestRound ? `${s.bestRound.hits}/${s.bestRound.darts}` : '—'}
                    </td>
                  ))}
                </tr>

                {/* Worst Round */}
                <tr>
                  <td style={labelStyle}>Schlechteste Runde</td>
                  {sorted.map((s, i) => (
                    <td key={s.playerId} style={tdStyle(worstRoundWin[i] ?? undefined)}>
                      {s.worstRound ? `${s.worstRound.hits}/${s.worstRound.darts}` : '—'}
                    </td>
                  ))}
                </tr>

                {/* Avg Hits per Round */}
                <tr>
                  <td style={labelStyle}>Ø Treffer/Runde</td>
                  {sorted.map((s, i) => (
                    <td key={s.playerId} style={tdStyle(avgHitsWin[i] ?? undefined)}>
                      {s.avgHitsPerRound.toFixed(2)}
                    </td>
                  ))}
                </tr>

                {/* Longest Hit Streak */}
                <tr>
                  <td style={labelStyle}>Längste Trefferserie</td>
                  {sorted.map((s, i) => (
                    <td key={s.playerId} style={tdStyle(streakWin[i] ?? undefined)}>
                      {s.longestHitStreak}
                    </td>
                  ))}
                </tr>

                {/* First Dart Hit Rate */}
                <tr>
                  <td style={labelStyle}>1. Dart Trefferquote</td>
                  {sorted.map((s, i) => (
                    <td key={s.playerId} style={tdStyle(firstDartWin[i] ?? undefined)}>
                      {s.firstDartHitRate.toFixed(1)}%
                    </td>
                  ))}
                </tr>

                {/* Schwerstes Feld (bei all mode) */}
                {isMultiField && (
                  <tr>
                    <td style={labelStyle}>Schwerstes Feld</td>
                    {sorted.map(s => (
                      <td key={s.playerId} style={tdStyle(colors.error)}>
                        {s.hardestField
                          ? `${formatTarget(s.hardestField.number)} (${isMultiLeg ? `Ø ${s.hardestField.avgDarts.toFixed(1)}` : `${s.hardestField.avgDarts}`}D)`
                          : '—'}
                      </td>
                    ))}
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Per-Feld Aufschlüsselung (bei all mode) */}
          {isMultiField && (
            <div style={{ ...styles.card, marginBottom: 16, overflowX: 'auto' }}>
              <div style={{ ...styles.sub, marginBottom: 8, fontWeight: 700 }}>Pro Feld</div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, color: colors.fg }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', ...headerStyle, color: colors.fgDim }}>Feld</th>
                    {sorted.length === 1 ? (
                      <>
                        <th style={{ ...headerStyle, color: colors.fgDim }}>Darts</th>
                        <th style={{ ...headerStyle, color: '#0ea5e9' }}>Score</th>
                        <th style={{ ...headerStyle, color: colors.accent }}>1.</th>
                        <th style={{ ...headerStyle, color: colors.accent }}>2.</th>
                        <th style={{ ...headerStyle, color: colors.accent }}>3.</th>
                      </>
                    ) : sorted.map(s => (
                      <th
                        key={s.playerId}
                        colSpan={4}
                        style={{
                          ...headerStyle,
                          color: playerColorMap.get(s.playerId) ?? colors.fg,
                        }}
                      >
                        {s.name}
                      </th>
                    ))}
                  </tr>
                  {/* Sub-Header für Multi-Player */}
                  {sorted.length > 1 && (
                    <tr>
                      <th style={{ ...headerStyle, color: colors.fgDim }}></th>
                      {sorted.map(s => (
                        <React.Fragment key={s.playerId}>
                          <th style={{ ...headerStyle, color: colors.fgDim, fontSize: 10 }}>D</th>
                          <th style={{ ...headerStyle, color: colors.accent, fontSize: 10 }}>1.</th>
                          <th style={{ ...headerStyle, color: colors.accent, fontSize: 10 }}>2.</th>
                          <th style={{ ...headerStyle, color: colors.accent, fontSize: 10 }}>3.</th>
                        </React.Fragment>
                      ))}
                    </tr>
                  )}
                </thead>
                <tbody>
                  {getAllNumbers(includeBull).map(num => {
                    if (singleLegStats) {
                      // Single-Leg: exakte Werte
                      const sortedLeg = sortedLegStats(singleLegStats, sorted)
                      return (
                        <tr key={num}>
                          <td style={{ ...labelStyle, fontWeight: 600 }}>{formatTarget(num)}</td>
                          {sorted.length === 1 ? (() => {
                            const field = sortedLeg[0]?.fields.find(f => f.targetNumber === num)
                            return (
                              <>
                                <td style={tdStyle(undefined)}>{field?.totalDarts ?? '—'}</td>
                                <td style={tdStyle('#0ea5e9')}>{field ? field.score.toFixed(1) : '—'}</td>
                                <td style={tdStyle(colors.accent)}>{field?.dartsToTriple[0] ?? '—'}</td>
                                <td style={tdStyle(colors.accent)}>{field?.dartsToTriple[1] ?? '—'}</td>
                                <td style={tdStyle(colors.accent)}>{field?.dartsToTriple[2] ?? '—'}</td>
                              </>
                            )
                          })() : sortedLeg.map(ps => {
                            const field = ps.fields.find(f => f.targetNumber === num)
                            return (
                              <React.Fragment key={ps.playerId}>
                                <td style={tdStyle(undefined)}>{field?.totalDarts ?? '—'}</td>
                                <td style={tdStyle(colors.accent)}>{field?.dartsToTriple[0] ?? '—'}</td>
                                <td style={tdStyle(colors.accent)}>{field?.dartsToTriple[1] ?? '—'}</td>
                                <td style={tdStyle(colors.accent)}>{field?.dartsToTriple[2] ?? '—'}</td>
                              </React.Fragment>
                            )
                          })}
                        </tr>
                      )
                    }

                    // Multi-Leg: Durchschnittswerte
                    return (
                      <tr key={num}>
                        <td style={{ ...labelStyle, fontWeight: 600 }}>{formatTarget(num)}</td>
                        {sorted.length === 1 ? (() => {
                          const af = sorted[0].avgFields.find(f => f.targetNumber === num)
                          return (
                            <>
                              <td style={tdStyle(undefined)}>{af ? (af.avgDarts > 0 ? `Ø ${af.avgDarts.toFixed(1)}` : '—') : '—'}</td>
                              <td style={tdStyle('#0ea5e9')}>{af ? (af.avgScore > 0 ? af.avgScore.toFixed(1) : '—') : '—'}</td>
                              <td style={tdStyle(colors.accent)}>{af?.avgDartsToTriple[0] != null ? af.avgDartsToTriple[0].toFixed(1) : '—'}</td>
                              <td style={tdStyle(colors.accent)}>{af?.avgDartsToTriple[1] != null ? af.avgDartsToTriple[1].toFixed(1) : '—'}</td>
                              <td style={tdStyle(colors.accent)}>{af?.avgDartsToTriple[2] != null ? af.avgDartsToTriple[2].toFixed(1) : '—'}</td>
                            </>
                          )
                        })() : sorted.map(s => {
                          const af = s.avgFields.find(f => f.targetNumber === num)
                          return (
                            <React.Fragment key={s.playerId}>
                              <td style={tdStyle(undefined)}>{af ? (af.avgDarts > 0 ? af.avgDarts.toFixed(1) : '—') : '—'}</td>
                              <td style={tdStyle(colors.accent)}>{af?.avgDartsToTriple[0] != null ? af.avgDartsToTriple[0].toFixed(1) : '—'}</td>
                              <td style={tdStyle(colors.accent)}>{af?.avgDartsToTriple[1] != null ? af.avgDartsToTriple[1].toFixed(1) : '—'}</td>
                              <td style={tdStyle(colors.accent)}>{af?.avgDartsToTriple[2] != null ? af.avgDartsToTriple[2].toFixed(1) : '—'}</td>
                            </React.Fragment>
                          )
                        })}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Aktionen */}
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => onRematch(matchId)}
              style={{ ...styles.pill, flex: 1 }}
            >
              Rematch
            </button>
            {onBackToLobby && (
              <button
                onClick={onBackToLobby}
                style={{ ...styles.pill, flex: 1 }}
              >
                Neues Spiel
              </button>
            )}
            <button
              onClick={onBackToMenu}
              style={{ ...styles.backBtn, flex: 1 }}
            >
              {onBackToLobby ? '← Menü' : 'Menü'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/** Leg-Stats in der Reihenfolge von sorted (match-stats) zurückgeben */
function sortedLegStats(legStats: StrPlayerLegStat[], sortedMatch: StrPlayerMatchStat[]): StrPlayerLegStat[] {
  return sortedMatch.map(ms => legStats.find(ls => ls.playerId === ms.playerId)!).filter(Boolean)
}
