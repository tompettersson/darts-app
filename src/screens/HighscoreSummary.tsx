// src/screens/HighscoreSummary.tsx
// Zusammenfassung für Highscore – Match-Kopf + detaillierte Statistik

import React, { useMemo, useState } from 'react'
import { useTheme } from '../ThemeProvider'
import { getThemedUI } from '../ui'
import { getHighscoreMatchById, getProfiles } from '../storage'
import {
  applyHighscoreEvents,
  formatDuration,
} from '../dartsHighscore'
import { computeHighscoreMatchStats } from '../stats/computeHighscoreStats'
import HighscoreProgressionChart from '../components/HighscoreProgressionChart'
import type { HighscoreEvent, HighscoreTurnAddedEvent } from '../types/highscore'

type Props = {
  matchId: string
  onBackToMenu: () => void
  onRematch: (matchId: string) => void
}

const PLAYER_COLORS = [
  '#3b82f6', '#22c55e', '#f97316', '#ef4444',
  '#8b5cf6', '#14b8a6', '#eab308', '#ec4899',
]

export default function HighscoreSummary({ matchId, onBackToMenu, onRematch }: Props) {
  const { isArcade, colors } = useTheme()
  const styles = useMemo(() => getThemedUI(colors, isArcade), [colors, isArcade])

  const storedMatch = getHighscoreMatchById(matchId)

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
          <div style={{ ...styles.card, marginBottom: 16, textAlign: 'center' }}>
            {/* Endergebnis */}
            <div style={{ marginBottom: 12 }}>
              {setScore && (
                <div style={{ fontSize: 14, color: colors.fgDim, marginBottom: 2 }}>
                  Sets: {setScore}
                </div>
              )}
              <div style={{ fontSize: 14, color: colors.fgDim, marginBottom: 4 }}>
                Legs: {legScore}
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
                <div style={{ display: 'flex', justifyContent: 'center', gap: 24 }}>
                  {/* Winner Stats */}
                  {(() => {
                    const winnerStat = sorted.find(s => s.playerId === storedMatch.winnerId)
                    return (
                      <>
                        <div>
                          <div style={{ fontSize: 24, fontWeight: 700, color: '#0ea5e9' }}>
                            {winnerStat?.avgPointsPerTurn.toFixed(1) ?? '0'}
                          </div>
                          <div style={{ fontSize: 11, color: colors.fgDim }}>3-Dart Avg</div>
                        </div>
                        <div>
                          <div style={{ fontSize: 24, fontWeight: 700, color: isArcade ? '#0ea5e9' : '#2563eb' }}>
                            {storedMatch.winnerDarts}
                          </div>
                          <div style={{ fontSize: 11, color: colors.fgDim }}>Darts</div>
                        </div>
                        <div>
                          <div style={{ fontSize: 24, fontWeight: 700, color: colors.accent }}>
                            {winnerStat?.bestTurn ?? 0}
                          </div>
                          <div style={{ fontSize: 11, color: colors.fgDim }}>Best Turn</div>
                        </div>
                      </>
                    )
                  })()}
                </div>
              </>
            )}
          </div>

          {/* Statistik-Tabelle */}
          <div style={{ ...styles.card, padding: 0, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
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
                  <td style={labelStyle}>Endscore</td>
                  {sorted.map(s => (
                    <td key={s.playerId} style={tdStyle(playerColorMap.get(s.playerId))}>
                      {s.finalScore}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td style={labelStyle}>Darts</td>
                  {sorted.map(s => (
                    <td key={s.playerId} style={tdStyle(playerColorMap.get(s.playerId))}>
                      {s.dartsThrown}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td style={labelStyle}>Turns</td>
                  {sorted.map(s => (
                    <td key={s.playerId} style={tdStyle(playerColorMap.get(s.playerId))}>
                      {s.turnsPlayed}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td style={labelStyle}>Ø per Dart</td>
                  {sorted.map(s => (
                    <td key={s.playerId} style={tdStyle(playerColorMap.get(s.playerId))}>
                      {s.avgPointsPerDart.toFixed(1)}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td style={labelStyle}>3-Dart Avg</td>
                  {sorted.map(s => (
                    <td key={s.playerId} style={tdStyle(playerColorMap.get(s.playerId))}>
                      {s.avgPointsPerTurn.toFixed(1)}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td style={labelStyle}>Best Turn</td>
                  {sorted.map(s => (
                    <td key={s.playerId} style={tdStyle(playerColorMap.get(s.playerId))}>
                      {s.bestTurn}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td style={labelStyle}>Speed Rating</td>
                  {sorted.map(s => (
                    <td key={s.playerId} style={tdStyle(playerColorMap.get(s.playerId))}>
                      {s.speedRating.toFixed(2)}
                    </td>
                  ))}
                </tr>
                {sorted[0]?.normalized999Darts != null && (
                  <tr>
                    <td style={labelStyle}>999-Equivalent</td>
                    {sorted.map(s => (
                      <td key={s.playerId} style={tdStyle(playerColorMap.get(s.playerId))}>
                        {s.normalized999Darts?.toFixed(0) ?? '—'}
                      </td>
                    ))}
                  </tr>
                )}
              </tbody>
            </table>
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
                    padding: '8px 16px',
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
                    padding: '8px 16px',
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
              <div style={{ height: 280 }}>
                <HighscoreProgressionChart
                  targetScore={targetScore}
                  players={selectedLegChartPlayers}
                  winnerPlayerId={legs[selectedLegIndex]?.winnerId}
                />
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: 12, marginTop: 20, justifyContent: 'center' }}>
            <button
              style={{
                ...styles.button,
                padding: '12px 24px',
                fontSize: 14,
                background: colors.accent,
                color: '#fff',
              }}
              onClick={() => onRematch(matchId)}
            >
              Revanche
            </button>
            <button
              style={{
                ...styles.button,
                padding: '12px 24px',
                fontSize: 14,
              }}
              onClick={onBackToMenu}
            >
              Zum Menü
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
