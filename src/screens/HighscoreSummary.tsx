// src/screens/HighscoreSummary.tsx
// Zusammenfassung für Highscore – Match-Kopf + detaillierte Statistik

import React, { useMemo, useState, useEffect } from 'react'
import { useTheme } from '../ThemeProvider'
import { getThemedUI } from '../ui'
import { getHighscoreMatchById, getProfiles, setHighscoreMatchMetadata } from '../storage'
import {
  applyHighscoreEvents,
  formatDuration,
} from '../dartsHighscore'
import { computeHighscoreMatchStats } from '../stats/computeHighscoreStats'
import HighscoreProgressionChart from '../components/HighscoreProgressionChart'
import type { HighscoreEvent, HighscoreTurnAddedEvent } from '../types/highscore'
import { PLAYER_COLORS } from '../playerColors'
import { generateHighscoreReport } from '../narratives/generateModeReports'
import StatTooltip, { STAT_TOOLTIPS } from '../components/StatTooltip'

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
  onRematch?: (matchId: string) => void
  onBackToLobby?: () => void
  isMultiplayerGuest?: boolean
}

export default function HighscoreSummary({ matchId, onBackToMenu, onRematch, onBackToLobby, isMultiplayerGuest }: Props) {
  const { isArcade, colors } = useTheme()
  const styles = useMemo(() => getThemedUI(colors, isArcade), [colors, isArcade])

  const [isMobile, setIsMobile] = useState(() => Math.min(window.innerWidth, window.innerHeight) < 600)
  useEffect(() => {
    const check = () => setIsMobile(Math.min(window.innerWidth, window.innerHeight) < 600)
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  const storedMatch = getHighscoreMatchById(matchId)

  const [endscreenName, setEndscreenName] = useState((storedMatch as any)?.matchName ?? '')
  const [endscreenNotes, setEndscreenNotes] = useState((storedMatch as any)?.notes ?? '')
  const [metadataSaved, setMetadataSaved] = useState(
    (storedMatch as any)?.matchName !== undefined || (storedMatch as any)?.notes !== undefined
  )

  const handleSaveMetadata = () => {
    const success = setHighscoreMatchMetadata(matchId, endscreenName, endscreenNotes)
    if (success) setMetadataSaved(true)
  }

  if (!storedMatch) {
    return (
      <div style={styles.page}>
        <p style={{ color: colors.fg }}>Match nicht gefunden.</p>
        <button style={styles.backBtn} onClick={onBackToMenu}>← Zurück</button>
      </div>
    )
  }

  const state = applyHighscoreEvents(storedMatch.events)
  const match = state.match

  if (!match) {
    return (
      <div style={styles.page}>
        <p style={{ color: colors.fg }}>Match-Daten nicht verfügbar.</p>
        <button style={styles.backBtn} onClick={onBackToMenu}>← Zurück</button>
      </div>
    )
  }

  const winner = match.players.find(p => p.id === storedMatch.winnerId)
  const { targetScore, structure, players } = match

  // Match-Stats berechnen
  const matchStats = useMemo(
    () => computeHighscoreMatchStats(storedMatch),
    [storedMatch]
  )

  // Sortieren: Gewinner zuerst, dann nach Score (höchster zuerst)
  const sorted = [...matchStats].sort((a, b) => {
    if (a.playerId === storedMatch.winnerId) return -1
    if (b.playerId === storedMatch.winnerId) return 1
    return b.finalScore - a.finalScore
  })

  // Leg-Stand Endergebnis
  const legScore = players.map(p => storedMatch.legWins?.[p.id] || 0).join(' : ')
  const setScore = structure.kind === 'sets' && storedMatch.setWins
    ? players.map(p => storedMatch.setWins?.[p.id] || 0).join(' : ')
    : null

  // Anzahl Legs
  const legsPlayed = storedMatch.events.filter(e => e.type === 'HighscoreLegFinished').length

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

  // Spielerfarben aus Profilen (mit Fallback auf PLAYER_COLORS)
  const profiles = useMemo(() => getProfiles(), [])
  const playerColorMap = useMemo(() => {
    const map = new Map<string, string>()
    players.forEach((p, i) => {
      const profile = profiles.find(pr => pr.id === p.id)
      map.set(p.id, profile?.color ?? PLAYER_COLORS[i % PLAYER_COLORS.length])
    })
    return map
  }, [players, profiles])

  // Record-Version für getStatWinnerColors
  const playerColorRecord: Record<string, string> = {}
  players.forEach((p, i) => {
    const profile = profiles.find(pr => pr.id === p.id)
    playerColorRecord[p.id] = profile?.color ?? PLAYER_COLORS[i % PLAYER_COLORS.length]
  })
  const pids = sorted.map(s => s.playerId)

  // Winner-Farben pro Statistik-Zeile
  const endscoreWin = getStatWinnerColors(sorted.map(s => s.finalScore), pids, 'high', playerColorRecord)
  const dartsWin = getStatWinnerColors(sorted.map(s => s.dartsThrown), pids, 'low', playerColorRecord)
  const turnsWin = getStatWinnerColors(sorted.map(s => s.turnsPlayed), pids, 'low', playerColorRecord)
  const avgPerDartWin = getStatWinnerColors(sorted.map(s => s.avgPointsPerDart), pids, 'high', playerColorRecord)
  const avg3DartWin = getStatWinnerColors(sorted.map(s => s.avgPointsPerTurn), pids, 'high', playerColorRecord)
  const bestTurnWin = getStatWinnerColors(sorted.map(s => s.bestTurn), pids, 'high', playerColorRecord)
  const speedWin = getStatWinnerColors(sorted.map(s => s.speedRating), pids, 'high', playerColorRecord)
  const equiv999Win = getStatWinnerColors(sorted.map(s => s.normalized999Darts ?? Infinity), pids, 'low', playerColorRecord)

  // State für ausgewählten Leg-Index
  const [selectedLegIndex, setSelectedLegIndex] = useState(0)

  // Legs aus Events extrahieren (für Chart)
  type LegData = {
    legIndex: number
    winnerId?: string
    winnerName?: string
    turns: HighscoreTurnAddedEvent[]
  }

  const legs = useMemo((): LegData[] => {
    const result: LegData[] = []
    let currentLeg: LegData | null = null

    for (const event of storedMatch.events) {
      if (event.type === 'HighscoreLegStarted') {
        currentLeg = {
          legIndex: (event as any).legIndex ?? result.length,
          turns: [],
        }
      } else if (event.type === 'HighscoreTurnAdded' && currentLeg) {
        currentLeg.turns.push(event as HighscoreTurnAddedEvent)
      } else if (event.type === 'HighscoreLegFinished' && currentLeg) {
        currentLeg.winnerId = (event as any).winnerId
        currentLeg.winnerName = players.find(p => p.id === currentLeg?.winnerId)?.name
        result.push(currentLeg)
        currentLeg = null
      }
    }

    return result
  }, [storedMatch.events, players])

  // Chart-Daten für das ausgewählte Leg
  const selectedLegChartPlayers = useMemo(() => {
    const leg = legs[selectedLegIndex]
    if (!leg) return []

    return players.map((player, idx) => {
      const playerTurns = leg.turns
        .filter(t => t.playerId === player.id)
        .map((turn, i, arr) => ({
          turnIndex: i,
          scoreBefore: i === 0 ? 0 : arr[i - 1].runningScore,
          scoreAfter: turn.runningScore,
          dartScores: turn.darts.map(d => d.value),
        }))

      return {
        id: player.id,
        name: player.name,
        color: playerColorMap.get(player.id) ?? PLAYER_COLORS[idx % PLAYER_COLORS.length],
        turns: playerTurns,
      }
    })
  }, [legs, selectedLegIndex, players])

  return (
    <div style={styles.page}>
      <div style={styles.headerRow}>
        <h2 style={{ margin: 0, color: colors.fg }}>Highscore {targetScore}</h2>
        <button style={styles.backBtn} onClick={onBackToMenu}>← Menü</button>
      </div>

      <div style={styles.centerPage}>
        <div style={{ ...styles.centerInner, maxWidth: 600 }}>

          {/* Match-Kopf */}
          <div style={{ ...styles.card, marginBottom: isMobile ? 10 : 16, textAlign: 'center', padding: isMobile ? '10px 8px' : undefined }}>
            {/* Endergebnis */}
            <div style={{ marginBottom: isMobile ? 8 : 12 }}>
              {setScore && (
                <div style={{ fontSize: isMobile ? 12 : 14, color: colors.fgDim, marginBottom: 2 }}>
                  Sets: {setScore}
                </div>
              )}
              <div style={{ fontSize: isMobile ? 12 : 14, color: colors.fgDim, marginBottom: 4 }}>
                Legs: {legScore}
              </div>
              <div style={{ fontSize: isMobile ? 12 : 14, color: colors.fgDim }}>
                {formatDuration(storedMatch.durationMs ?? 0)}
              </div>
            </div>

            {/* Gewinner */}
            {winner && (
              <>
                <div style={{ fontSize: isMobile ? 12 : 14, color: colors.fgDim, marginBottom: 2 }}>Gewinner</div>
                <div style={{ fontSize: isMobile ? 24 : 32, fontWeight: 700, color: colors.success, marginBottom: 8 }}>
                  {winner.name}
                </div>
                {/* 999-Equivalent prominent anzeigen (wenn targetScore < 999) */}
                {(() => {
                  const winnerStat = sorted.find(s => s.playerId === storedMatch.winnerId)
                  const has999Equiv = targetScore < 999 && winnerStat?.normalized999Darts != null
                  return has999Equiv ? (
                    <div style={{
                      marginBottom: 16,
                      padding: '10px 20px',
                      background: isArcade ? '#1e3a5f' : '#dbeafe',
                      borderRadius: 8,
                      display: 'inline-block',
                    }}>
                      <div style={{ fontSize: 11, color: isArcade ? '#93c5fd' : '#3b82f6', marginBottom: 2 }}>
                        Hochgerechnet auf 999 Punkte
                      </div>
                      <div style={{ fontSize: 28, fontWeight: 800, color: isArcade ? '#60a5fa' : '#2563eb' }}>
                        {winnerStat?.normalized999Darts?.toFixed(0)} Darts
                      </div>
                    </div>
                  ) : null
                })()}
                <div style={{ display: 'flex', justifyContent: 'center', gap: isMobile ? 16 : 24 }}>
                  {/* Winner Stats */}
                  {(() => {
                    const winnerStat = sorted.find(s => s.playerId === storedMatch.winnerId)
                    return (
                      <>
                        <div>
                          <div style={{ fontSize: isMobile ? 18 : 24, fontWeight: 700, color: '#0ea5e9' }}>
                            {winnerStat?.avgPointsPerTurn.toFixed(1) ?? '0'}
                          </div>
                          <div style={{ fontSize: isMobile ? 10 : 11, color: colors.fgDim }}>3-Dart Avg</div>
                        </div>
                        <div>
                          <div style={{ fontSize: isMobile ? 18 : 24, fontWeight: 700, color: isArcade ? '#0ea5e9' : '#2563eb' }}>
                            {storedMatch.winnerDarts}
                          </div>
                          <div style={{ fontSize: isMobile ? 10 : 11, color: colors.fgDim }}>Darts</div>
                        </div>
                        <div>
                          <div style={{ fontSize: isMobile ? 18 : 24, fontWeight: 700, color: colors.accent }}>
                            {winnerStat?.bestTurn ?? 0}
                          </div>
                          <div style={{ fontSize: isMobile ? 10 : 11, color: colors.fgDim }}>Best Turn</div>
                        </div>
                      </>
                    )
                  })()}
                </div>
              </>
            )}
          </div>

          {/* Spielbericht */}
          {(() => {
            const report = generateHighscoreReport({
              matchId,
              players: players.map(p => ({ id: p.id, name: p.name })),
              winnerId: storedMatch.winnerId,
              targetScore,
              playerStats: sorted.map(s => ({
                playerId: s.playerId,
                playerName: s.playerName,
                finalScore: s.finalScore,
                dartsThrown: s.dartsThrown,
                avgPointsPerTurn: s.avgPointsPerTurn,
                bestTurn: s.bestTurn,
                speedRating: s.speedRating,
                normalized999Darts: s.normalized999Darts,
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
          <div style={{ ...styles.card, padding: 0, overflow: 'hidden' }}>
           <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: isMobile ? 12 : 13 }}>
              <thead>
                <tr>
                  <th style={labelStyle}></th>
                  {sorted.map(s => (
                    <th key={s.playerId} style={{ ...headerStyle, color: playerColorMap.get(s.playerId) }}>
                      {s.playerName}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={labelStyle}><StatTooltip label="Endscore" tooltip={STAT_TOOLTIPS['Endscore'] || 'Endscore'} colors={colors} /></td>
                  {sorted.map((s, i) => (
                    <td key={s.playerId} style={tdStyle(endscoreWin[i] ?? undefined)}>
                      {s.finalScore}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td style={labelStyle}><StatTooltip label="Darts" tooltip={STAT_TOOLTIPS['Darts'] || 'Darts'} colors={colors} /></td>
                  {sorted.map((s, i) => (
                    <td key={s.playerId} style={tdStyle(dartsWin[i] ?? undefined)}>
                      {s.dartsThrown}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td style={labelStyle}><StatTooltip label="Turns" tooltip={STAT_TOOLTIPS['Turns'] || 'Turns'} colors={colors} /></td>
                  {sorted.map((s, i) => (
                    <td key={s.playerId} style={tdStyle(turnsWin[i] ?? undefined)}>
                      {s.turnsPlayed}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td style={labelStyle}><StatTooltip label="Ø per Dart" tooltip={STAT_TOOLTIPS['Ø per Dart'] || 'Ø per Dart'} colors={colors} /></td>
                  {sorted.map((s, i) => (
                    <td key={s.playerId} style={tdStyle(avgPerDartWin[i] ?? undefined)}>
                      {s.avgPointsPerDart.toFixed(1)}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td style={labelStyle}><StatTooltip label="3-Dart Avg" tooltip={STAT_TOOLTIPS['3-Dart Avg'] || '3-Dart Avg'} colors={colors} /></td>
                  {sorted.map((s, i) => (
                    <td key={s.playerId} style={tdStyle(avg3DartWin[i] ?? undefined)}>
                      {s.avgPointsPerTurn.toFixed(1)}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td style={labelStyle}><StatTooltip label="Best Turn" tooltip={STAT_TOOLTIPS['Best Turn'] || 'Best Turn'} colors={colors} /></td>
                  {sorted.map((s, i) => (
                    <td key={s.playerId} style={tdStyle(bestTurnWin[i] ?? undefined)}>
                      {s.bestTurn}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td style={labelStyle}><StatTooltip label="Speed Rating" tooltip={STAT_TOOLTIPS['Speed Rating'] || 'Speed Rating'} colors={colors} /></td>
                  {sorted.map((s, i) => (
                    <td key={s.playerId} style={tdStyle(speedWin[i] ?? undefined)}>
                      {s.speedRating.toFixed(2)}
                    </td>
                  ))}
                </tr>
                {sorted[0]?.normalized999Darts != null && (
                  <tr>
                    <td style={labelStyle}><StatTooltip label="999-Equivalent" tooltip={STAT_TOOLTIPS['999-Equivalent'] || '999-Equivalent'} colors={colors} /></td>
                    {sorted.map((s, i) => (
                      <td key={s.playerId} style={tdStyle(equiv999Win[i] ?? undefined)}>
                        {s.normalized999Darts?.toFixed(0) ?? '—'}
                      </td>
                    ))}
                  </tr>
                )}
              </tbody>
            </table>
           </div>
          </div>

          {/* Leg-Grafiken mit Navigation */}
          {legs.length > 0 && (
            <div style={{ ...styles.card, marginTop: 16 }}>
              {/* Leg-Navigation */}
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
                  }}
                >
                  ← Vorheriges
                </button>

                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontWeight: 700, fontSize: 16, color: colors.fg }}>
                    Leg {selectedLegIndex + 1} von {legs.length}
                  </div>
                  {legs[selectedLegIndex]?.winnerName && (
                    <div style={{
                      fontSize: 12,
                      color: playerColorMap.get(legs[selectedLegIndex]?.winnerId ?? '') ?? colors.success,
                      fontWeight: 600,
                    }}>
                      Gewinner: {legs[selectedLegIndex].winnerName}
                    </div>
                  )}
                </div>

                <button
                  onClick={() => setSelectedLegIndex(i => Math.min(legs.length - 1, i + 1))}
                  disabled={selectedLegIndex === legs.length - 1}
                  style={{
                    padding: isMobile ? '6px 10px' : '8px 16px',
                    borderRadius: 6,
                    border: `1px solid ${colors.border}`,
                    background: selectedLegIndex === legs.length - 1 ? 'transparent' : colors.bgCard,
                    color: selectedLegIndex === legs.length - 1 ? colors.fgDim : colors.fg,
                    fontWeight: 600,
                    cursor: selectedLegIndex === legs.length - 1 ? 'not-allowed' : 'pointer',
                    opacity: selectedLegIndex === legs.length - 1 ? 0.5 : 1,
                  }}
                >
                  Nächstes →
                </button>
              </div>

              {/* Chart */}
              <div style={{ height: isMobile ? 200 : 280 }}>
                <HighscoreProgressionChart
                  targetScore={targetScore}
                  players={selectedLegChartPlayers}
                  winnerPlayerId={legs[selectedLegIndex]?.winnerId}
                />
              </div>
            </div>
          )}

          {/* Spielname + Bemerkungen */}
          <div style={{ ...styles.card, marginTop: 16, marginBottom: 16 }}>
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
            ) : isMultiplayerGuest ? (
              <div style={{ color: colors.fgDim, fontSize: 13, textAlign: 'center', padding: 12 }}>
                Spielname & Bemerkungen werden vom Host eingegeben.
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

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: isMobile ? 8 : 12, marginTop: isMobile ? 12 : 20, justifyContent: 'center', flexDirection: isMobile ? 'column' : 'row' }}>
            {onRematch && (
              <button
                style={{
                  ...styles.button,
                  padding: isMobile ? '10px 16px' : '12px 24px',
                  fontSize: isMobile ? 13 : 14,
                  background: colors.accent,
                  color: '#fff',
                  width: isMobile ? '100%' : undefined,
                }}
                onClick={() => onRematch(matchId)}
              >
                Revanche
              </button>
            )}
            {onBackToLobby && (
              <button
                style={{
                  ...styles.button,
                  padding: isMobile ? '10px 16px' : '12px 24px',
                  fontSize: isMobile ? 13 : 14,
                  width: isMobile ? '100%' : undefined,
                }}
                onClick={onBackToLobby}
              >
                Neues Spiel
              </button>
            )}
            <button
              style={{
                ...styles.button,
                padding: isMobile ? '10px 16px' : '12px 24px',
                fontSize: isMobile ? 13 : 14,
                width: isMobile ? '100%' : undefined,
              }}
              onClick={onBackToMenu}
            >
              {onBackToLobby ? '← Menü' : 'Zum Menü'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
