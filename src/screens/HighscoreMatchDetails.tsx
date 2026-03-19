// src/screens/HighscoreMatchDetails.tsx
// Spielzusammenfassung für Highscore Matches mit Leg-Übersicht

import React, { useMemo, useState } from 'react'
import { getHighscoreMatchById, getProfiles } from '../storage'
import { applyHighscoreEvents, formatDuration } from '../dartsHighscore'
import type { HighscoreTurnAddedEvent, HighscoreLegFinishedEvent, HighscoreEvent } from '../types/highscore'
import { getThemedUI } from '../ui'
import { useTheme } from '../ThemeProvider'
import MatchHeader from '../components/MatchHeader'
import LegHeader from '../components/LegHeader'
import HighscoreStaircaseChart, { type HighscoreVisit } from '../components/HighscoreStaircaseChart'
import HighscoreProgressionChart from '../components/HighscoreProgressionChart'
import { PLAYER_COLORS } from '../playerColors'

type Props = {
  matchId: string
  onBack: () => void
}

function fmtDate(s?: string) {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// Dart-Label Funktion
function dartLabel(dart: { target: number | 'BULL' | 'MISS'; mult: 1 | 2 | 3 }): string {
  if (dart.target === 'MISS') return '—'
  if (dart.target === 'BULL') return dart.mult === 2 ? 'DB' : 'B'
  const prefix = dart.mult === 3 ? 'T' : dart.mult === 2 ? 'D' : 'S'
  return `${prefix}${dart.target}`
}

// Statistik-Typ für einen Spieler
type PlayerStats = {
  playerId: string
  name: string
  totalDarts: number
  totalScore: number
  avgPerDart: number
  avgPerTurn: number
  bestTurn: number
  turns180: number
  turns140plus: number
  turns100plus: number
  isWinner: boolean
}

// Leg-Info Typ
type LegInfo = {
  legId: string
  legIndex: number
  setIndex?: number
  winnerId?: string
  winnerName?: string
  winnerDarts?: number
  winnerScore?: number
  turns: HighscoreTurnAddedEvent[]
}

// Berechne Statistiken aus Turn-Events
function computeStatsFromTurns(
  turns: HighscoreTurnAddedEvent[],
  players: { id: string; name: string }[],
  winnerId?: string
): PlayerStats[] {
  return players.map((player) => {
    const pid = player.id
    const playerTurns = turns.filter(t => t.playerId === pid)

    let totalDarts = 0
    let totalScore = 0
    let bestTurn = 0
    let turns180 = 0
    let turns140plus = 0
    let turns100plus = 0

    for (const turn of playerTurns) {
      totalDarts += turn.darts.length
      totalScore += turn.turnScore

      if (turn.turnScore === 180) turns180++
      else if (turn.turnScore >= 140) turns140plus++
      else if (turn.turnScore >= 100) turns100plus++

      if (turn.turnScore > bestTurn) bestTurn = turn.turnScore
    }

    const avgPerDart = totalDarts > 0 ? totalScore / totalDarts : 0
    const avgPerTurn = playerTurns.length > 0 ? totalScore / playerTurns.length : 0

    return {
      playerId: pid,
      name: player.name,
      totalDarts,
      totalScore,
      avgPerDart,
      avgPerTurn,
      bestTurn,
      turns180,
      turns140plus,
      turns100plus,
      isWinner: winnerId === pid,
    }
  })
}

export default function HighscoreMatchDetails({ matchId, onBack }: Props) {
  const { isArcade, colors } = useTheme()
  const styles = useMemo(() => getThemedUI(colors, isArcade), [colors, isArcade])

  // Dynamische Table Styles
  const thLeft: React.CSSProperties = {
    textAlign: 'left', fontSize: 13, fontWeight: 600,
    color: colors.fgDim, padding: '8px 12px',
    borderBottom: `2px solid ${colors.border}`,
  }
  const thRight: React.CSSProperties = {
    textAlign: 'right', fontSize: 13, fontWeight: 700,
    color: colors.fg, padding: '8px 12px',
    borderBottom: `2px solid ${colors.border}`,
  }
  const tdLeft: React.CSSProperties = {
    padding: '10px 12px', borderBottom: `1px solid ${colors.bgMuted}`,
    fontWeight: 500, color: colors.fg,
  }
  const tdRight: React.CSSProperties = {
    padding: '10px 12px', borderBottom: `1px solid ${colors.bgMuted}`,
    textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600,
  }

  const [selectedLegId, setSelectedLegId] = useState<string | null>(null)
  const [chartLegIndex, setChartLegIndex] = useState(0) // Für Leg-Chart-Navigation

  const match = useMemo(() => getHighscoreMatchById(matchId), [matchId])
  const profiles = useMemo(() => getProfiles(), [])

  // Legs aus Events extrahieren
  const legs = useMemo<LegInfo[]>(() => {
    if (!match) return []
    const result: LegInfo[] = []
    let currentLeg: LegInfo | null = null

    for (const event of match.events) {
      if (event.type === 'HighscoreLegStarted') {
        currentLeg = {
          legId: event.legId,
          legIndex: event.legIndex,
          setIndex: event.setIndex,
          turns: [],
        }
      } else if (event.type === 'HighscoreTurnAdded' && currentLeg) {
        currentLeg.turns.push(event)
      } else if (event.type === 'HighscoreLegFinished' && currentLeg) {
        currentLeg.winnerId = event.winnerId
        currentLeg.winnerName = match.players.find(p => p.id === event.winnerId)?.name
        currentLeg.winnerDarts = event.winnerDarts
        currentLeg.winnerScore = event.winnerScore
        result.push(currentLeg)
        currentLeg = null
      }
    }

    if (currentLeg && currentLeg.turns.length > 0) {
      result.push(currentLeg)
    }

    return result
  }, [match])

  // Ausgewähltes Leg
  const selectedLeg = selectedLegId ? legs.find(l => l.legId === selectedLegId) : null
  const selectedLegIndex = selectedLeg ? legs.findIndex(l => l.legId === selectedLegId) : -1

  // ===== EARLY RETURN - nach allen Hooks =====
  if (!match) {
    return (
      <div style={styles.page}>
        <div style={styles.centerPage}>
          <div style={styles.centerInner}>
            <div style={styles.card}>
              <h2 style={{ margin: 0 }}>Match nicht gefunden</h2>
              <div style={{ marginTop: 10 }}>
                <button style={styles.backBtn} onClick={onBack}>Zurück</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const state = applyHighscoreEvents(match.events)

  // Spielerfarben aus Profilen oder Standardfarben
  const playerColors: Record<string, string> = {}
  match.players.forEach((p, idx) => {
    const profile = profiles.find((pr) => pr.id === p.id)
    playerColors[p.id] = profile?.color ?? PLAYER_COLORS[idx % PLAYER_COLORS.length]
  })

  // Alle Turn-Events
  const allTurnEvents = match.events.filter(
    (e): e is HighscoreTurnAddedEvent => e.type === 'HighscoreTurnAdded'
  )

  // ===== LEG DETAIL VIEW =====
  if (selectedLeg) {
    const legStats = computeStatsFromTurns(
      selectedLeg.turns,
      match.players,
      selectedLeg.winnerId
    )

    // Kumulativen Spielstand nach diesem Leg berechnen
    const cumulativeScore: Record<string, number> = {}
    match.players.forEach(p => { cumulativeScore[p.id] = 0 })
    for (let i = 0; i <= selectedLegIndex; i++) {
      const leg = legs[i]
      if (leg.winnerId) cumulativeScore[leg.winnerId]++
    }
    const scoreAfterLeg = match.players.map(p => cumulativeScore[p.id]).join(':')

    // Leg-Dauer berechnen (aus Timestamps)
    let legDurationMs: number | undefined
    if (selectedLeg.turns.length >= 2) {
      const firstTs = selectedLeg.turns[0]?.timestamp
      const lastTs = selectedLeg.turns[selectedLeg.turns.length - 1]?.timestamp
      if (firstTs && lastTs) {
        legDurationMs = lastTs - firstTs
      }
    }

    // Spielmodus-String
    const gameMode = `HS ${match.targetScore} ${match.structure?.kind === 'sets' ? 'S' : 'L'}`

    // Visits für Staircase-Chart (alle Spieler abwechselnd, wie sie dran waren)
    // Wir brauchen den scoreBefore pro Spieler individuell
    const runningScoreByPlayer: Record<string, number> = {}
    match.players.forEach(p => { runningScoreByPlayer[p.id] = 0 })

    const allVisits: HighscoreVisit[] = selectedLeg.turns.map((turn) => {
      const scoreBefore = runningScoreByPlayer[turn.playerId] ?? 0
      runningScoreByPlayer[turn.playerId] = turn.runningScore
      const player = match.players.find(p => p.id === turn.playerId)
      return {
        turnScore: turn.turnScore,
        runningScore: turn.runningScore,
        scoreBefore,
        darts: turn.darts,
        isWinningTurn: turn.isWinningTurn,
        playerId: turn.playerId,
        playerName: player?.name,
        playerColor: playerColors[turn.playerId],
      }
    })

    return (
      <div style={styles.page}>
        <div style={styles.centerPage}>
          <div style={{ ...styles.centerInner, width: 'min(650px, 95vw)' }}>
            {/* Einheitlicher Leg-Header */}
            <LegHeader
              legNumber={selectedLeg.legIndex}
              setNumber={selectedLeg.setIndex}
              gameName={match.title}
              gameMode={gameMode}
              players={match.players.map(p => ({
                id: p.id,
                name: p.name,
                color: playerColors[p.id],
              }))}
              winnerId={selectedLeg.winnerId}
              scoreAfterLeg={scoreAfterLeg}
              legDurationMs={legDurationMs}
              onBack={() => setSelectedLegId(null)}
              onPrevLeg={() => {
                if (selectedLegIndex > 0) {
                  setSelectedLegId(legs[selectedLegIndex - 1].legId)
                }
              }}
              onNextLeg={() => {
                if (selectedLegIndex < legs.length - 1) {
                  setSelectedLegId(legs[selectedLegIndex + 1].legId)
                }
              }}
              hasPrev={selectedLegIndex > 0}
              hasNext={selectedLegIndex < legs.length - 1}
            />

            {/* 999-Equivalent für Leg (wenn targetScore < 999) */}
            {match.targetScore < 999 && selectedLeg.winnerId && selectedLeg.winnerDarts && (
              <div style={{
                ...styles.card,
                textAlign: 'center',
                background: isArcade ? '#1e3a5f' : '#dbeafe',
                border: `1px solid ${isArcade ? '#3b82f6' : '#93c5fd'}`,
                padding: '12px 16px',
              }}>
                <div style={{ fontSize: 11, color: isArcade ? '#93c5fd' : '#3b82f6', marginBottom: 2 }}>
                  Hochgerechnet auf 999
                </div>
                <div style={{ fontSize: 24, fontWeight: 800, color: isArcade ? '#60a5fa' : '#2563eb' }}>
                  {Math.round(selectedLeg.winnerDarts * (999 / match.targetScore))} Darts
                </div>
              </div>
            )}

            {/* Leg Statistik */}
            <div style={styles.card}>
              <div style={{ fontWeight: 700, marginBottom: 12 }}>Leg-Statistiken</div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={thLeft}></th>
                    {legStats.map((ps) => (
                      <th key={ps.playerId} style={{ ...thRight, color: playerColors[ps.playerId] }}>
                        {ps.name} {ps.isWinner && '🏆'}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={tdLeft}>Endstand</td>
                    {legStats.map((ps) => <td key={ps.playerId} style={tdRight}>{ps.totalScore}</td>)}
                  </tr>
                  <tr>
                    <td style={tdLeft}>Darts</td>
                    {legStats.map((ps) => <td key={ps.playerId} style={tdRight}>{ps.totalDarts}</td>)}
                  </tr>
                  <tr>
                    <td style={tdLeft}>Ø pro Dart</td>
                    {legStats.map((ps) => <td key={ps.playerId} style={tdRight}>{ps.avgPerDart.toFixed(2)}</td>)}
                  </tr>
                  <tr>
                    <td style={tdLeft}>Ø pro Turn</td>
                    {legStats.map((ps) => <td key={ps.playerId} style={tdRight}>{ps.avgPerTurn.toFixed(1)}</td>)}
                  </tr>
                  <tr><td colSpan={legStats.length + 1} style={{ borderBottom: `2px solid ${colors.border}`, padding: '4px 0' }}></td></tr>
                  <tr>
                    <td style={tdLeft}>180er</td>
                    {legStats.map((ps) => <td key={ps.playerId} style={{ ...tdRight, color: ps.turns180 > 0 ? '#fbbf24' : colors.fgDim }}>{ps.turns180}</td>)}
                  </tr>
                  <tr>
                    <td style={tdLeft}>140+</td>
                    {legStats.map((ps) => <td key={ps.playerId} style={tdRight}>{ps.turns140plus}</td>)}
                  </tr>
                  <tr>
                    <td style={tdLeft}>100+</td>
                    {legStats.map((ps) => <td key={ps.playerId} style={tdRight}>{ps.turns100plus}</td>)}
                  </tr>
                  <tr>
                    <td style={tdLeft}>Bester Turn</td>
                    {legStats.map((ps) => <td key={ps.playerId} style={tdRight}>{ps.bestTurn}</td>)}
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Leg-Verlauf (alle Spieler abwechselnd) */}
            {allVisits.length > 0 && (
              <div style={styles.card}>
                <div style={{ fontWeight: 700, marginBottom: 12 }}>Leg-Verlauf</div>
                <HighscoreStaircaseChart
                  targetScore={match.targetScore}
                  visits={allVisits}
                  playerName=""
                  playerColor={playerColors[match.players[0]?.id] || '#3b82f6'}
                  totalDarts={selectedLeg.turns.reduce((sum, t) => sum + t.darts.length, 0)}
                  compact={false}
                  showHeader={false}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ===== MATCH OVERVIEW =====
  const matchStats = computeStatsFromTurns(allTurnEvents, match.players, match.winnerId)

  // Leg-Siege pro Spieler zählen
  const legWinsPerPlayer: Record<string, number> = {}
  match.players.forEach(p => { legWinsPerPlayer[p.id] = 0 })
  legs.forEach(leg => {
    if (leg.winnerId) legWinsPerPlayer[leg.winnerId]++
  })

  // Spielmodus-String für Header
  const gameMode = `HS ${match.targetScore} ${match.structure?.kind === 'sets' ? 'S' : 'L'}`

  // Legs-Score
  const legScore = match.players.map(p => legWinsPerPlayer[p.id]).join(':')

  // Sets-Score berechnen (falls Sets-Modus)
  let setScore: string | undefined
  if (match.structure?.kind === 'sets') {
    const setWinsPerPlayer: Record<string, number> = {}
    match.players.forEach(p => { setWinsPerPlayer[p.id] = 0 })
    for (const ev of match.events) {
      if (ev.type === 'HighscoreSetFinished') {
        const wid = ev.winnerId
        if (wid in setWinsPerPlayer) setWinsPerPlayer[wid]++
      }
    }
    setScore = match.players.map(p => setWinsPerPlayer[p.id]).join(':')
  }

  return (
    <div style={styles.page}>
      <div style={styles.centerPage}>
        <div style={{ ...styles.centerInner, width: 'min(650px, 95vw)' }}>
          {/* Einheitlicher Match-Header */}
          <MatchHeader
            gameName={match.title}
            gameMode={gameMode}
            players={match.players.map(p => ({
              id: p.id,
              name: p.name,
              color: playerColors[p.id],
              legsWon: legWinsPerPlayer[p.id],
            }))}
            winnerId={match.winnerId}
            legScore={legScore}
            setScore={setScore}
            durationMs={match.durationMs}
            playedAt={match.createdAt}
            onBack={onBack}
          />

          {/* 999-Equivalent prominent (wenn targetScore < 999) */}
          {match.targetScore < 999 && match.winnerId && (() => {
            const winnerStats = matchStats.find(s => s.playerId === match.winnerId)
            if (!winnerStats) return null
            const normalized999Darts = Math.round(winnerStats.totalDarts * (999 / match.targetScore))
            return (
              <div style={{
                ...styles.card,
                textAlign: 'center',
                background: isArcade ? '#1e3a5f' : '#dbeafe',
                border: `1px solid ${isArcade ? '#3b82f6' : '#93c5fd'}`,
              }}>
                <div style={{ fontSize: 12, color: isArcade ? '#93c5fd' : '#3b82f6', marginBottom: 4 }}>
                  Hochgerechnet auf 999 Punkte
                </div>
                <div style={{ fontSize: 32, fontWeight: 800, color: isArcade ? '#60a5fa' : '#2563eb' }}>
                  {normalized999Darts} Darts
                </div>
                <div style={{ fontSize: 11, color: isArcade ? '#93c5fd' : '#6b7280', marginTop: 2 }}>
                  ({winnerStats.name} - Original: {winnerStats.totalDarts} Darts für {match.targetScore} Punkte)
                </div>
              </div>
            )
          })()}

          {/* Match-Statistik */}
          <div style={styles.card}>
            <div style={{ fontWeight: 700, marginBottom: 12 }}>Match-Statistik</div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={thLeft}></th>
                  {matchStats.map((ps) => (
                    <th key={ps.playerId} style={{ ...thRight, color: playerColors[ps.playerId] }}>
                      {ps.name} {ps.isWinner && '🏆'}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {legs.length > 1 && (
                  <tr>
                    <td style={tdLeft}>Legs gewonnen</td>
                    {match.players.map((p) => (
                      <td key={p.id} style={tdRight}>{legWinsPerPlayer[p.id]}</td>
                    ))}
                  </tr>
                )}
                <tr>
                  <td style={tdLeft}>Punkte gesamt</td>
                  {matchStats.map((ps) => <td key={ps.playerId} style={tdRight}>{ps.totalScore}</td>)}
                </tr>
                <tr>
                  <td style={tdLeft}>Darts gesamt</td>
                  {matchStats.map((ps) => <td key={ps.playerId} style={tdRight}>{ps.totalDarts}</td>)}
                </tr>
                <tr>
                  <td style={tdLeft}>Ø pro Dart</td>
                  {matchStats.map((ps) => <td key={ps.playerId} style={tdRight}>{ps.avgPerDart.toFixed(2)}</td>)}
                </tr>
                <tr>
                  <td style={tdLeft}>Ø pro Turn</td>
                  {matchStats.map((ps) => <td key={ps.playerId} style={tdRight}>{ps.avgPerTurn.toFixed(1)}</td>)}
                </tr>
                <tr><td colSpan={matchStats.length + 1} style={{ borderBottom: `2px solid ${colors.border}`, padding: '4px 0' }}></td></tr>
                <tr>
                  <td style={tdLeft}>180er</td>
                  {matchStats.map((ps) => <td key={ps.playerId} style={{ ...tdRight, color: ps.turns180 > 0 ? '#fbbf24' : colors.fgDim }}>{ps.turns180}</td>)}
                </tr>
                <tr>
                  <td style={tdLeft}>140+</td>
                  {matchStats.map((ps) => <td key={ps.playerId} style={tdRight}>{ps.turns140plus}</td>)}
                </tr>
                <tr>
                  <td style={tdLeft}>100+</td>
                  {matchStats.map((ps) => <td key={ps.playerId} style={tdRight}>{ps.turns100plus}</td>)}
                </tr>
                <tr>
                  <td style={tdLeft}>Bester Turn</td>
                  {matchStats.map((ps) => <td key={ps.playerId} style={tdRight}>{ps.bestTurn}</td>)}
                </tr>
              </tbody>
            </table>
          </div>

          {/* Leg-Grafiken mit Navigation */}
          {legs.length > 0 && (() => {
            // Chart-Daten für das ausgewählte Leg berechnen
            const selectedLeg = legs[chartLegIndex]
            const chartPlayers = selectedLeg ? match.players.map((player, idx) => {
              const playerTurns = selectedLeg.turns
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
                color: PLAYER_COLORS[idx % PLAYER_COLORS.length],
                turns: playerTurns,
              }
            }) : []

            return (
              <div style={{ ...styles.card, marginBottom: 16 }}>
                {/* Leg-Navigation */}
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 12,
                }}>
                  <button
                    onClick={() => setChartLegIndex(i => Math.max(0, i - 1))}
                    disabled={chartLegIndex === 0}
                    style={{
                      padding: '6px 14px',
                      borderRadius: 6,
                      border: `1px solid ${colors.border}`,
                      background: chartLegIndex === 0 ? 'transparent' : colors.bgCard,
                      color: chartLegIndex === 0 ? colors.fgDim : colors.fg,
                      fontWeight: 600,
                      fontSize: 12,
                      cursor: chartLegIndex === 0 ? 'not-allowed' : 'pointer',
                      opacity: chartLegIndex === 0 ? 0.5 : 1,
                    }}
                  >
                    ←
                  </button>

                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: colors.fg }}>
                      Leg {chartLegIndex + 1} von {legs.length}
                    </div>
                    {selectedLeg?.winnerName && (
                      <div style={{
                        fontSize: 11,
                        color: playerColors[selectedLeg.winnerId ?? ''] ?? colors.success,
                        fontWeight: 600,
                      }}>
                        {selectedLeg.winnerName}
                      </div>
                    )}
                  </div>

                  <button
                    onClick={() => setChartLegIndex(i => Math.min(legs.length - 1, i + 1))}
                    disabled={chartLegIndex === legs.length - 1}
                    style={{
                      padding: '6px 14px',
                      borderRadius: 6,
                      border: `1px solid ${colors.border}`,
                      background: chartLegIndex === legs.length - 1 ? 'transparent' : colors.bgCard,
                      color: chartLegIndex === legs.length - 1 ? colors.fgDim : colors.fg,
                      fontWeight: 600,
                      fontSize: 12,
                      cursor: chartLegIndex === legs.length - 1 ? 'not-allowed' : 'pointer',
                      opacity: chartLegIndex === legs.length - 1 ? 0.5 : 1,
                    }}
                  >
                    →
                  </button>
                </div>

                {/* Chart */}
                <div style={{ height: 250 }}>
                  <HighscoreProgressionChart
                    targetScore={match.targetScore}
                    players={chartPlayers}
                    winnerPlayerId={selectedLeg?.winnerId}
                  />
                </div>
              </div>
            )
          })()}

          {/* Legs Liste */}
          <div style={styles.card}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Legs</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {legs.length === 0 ? (
                <div style={{ opacity: 0.6 }}>Keine Legs vorhanden.</div>
              ) : (
                (() => {
                  // Kumulativen Spielstand berechnen
                  const cumulativeScore: Record<string, number> = {}
                  match.players.forEach(p => { cumulativeScore[p.id] = 0 })

                  return legs.map((leg) => {
                    // Spielstand nach diesem Leg aktualisieren
                    if (leg.winnerId) {
                      cumulativeScore[leg.winnerId]++
                    }
                    const scoreAfterLeg = match.players.map(p => cumulativeScore[p.id]).join(':')

                    return (
                      <div
                        key={leg.legId}
                        onClick={() => setSelectedLegId(leg.legId)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 12,
                          padding: '8px 12px',
                          background: colors.bgMuted,
                          borderRadius: 6,
                          fontSize: 14,
                          cursor: 'pointer',
                        }}
                      >
                        <span style={{ fontWeight: 700, minWidth: 60 }}>
                          {leg.setIndex !== undefined ? `S${leg.setIndex + 1} ` : ''}Leg {leg.legIndex + 1}
                        </span>
                        <span style={{
                          fontWeight: 800,
                          fontSize: 14,
                          color: colors.fg,
                          background: colors.bgSoft,
                          padding: '2px 8px',
                          borderRadius: 4,
                          minWidth: 45,
                          textAlign: 'center',
                        }}>
                          {scoreAfterLeg}
                        </span>
                        {leg.winnerDarts && (
                          <span style={{ color: colors.fgDim, fontSize: 12 }}>{leg.winnerDarts} Darts</span>
                        )}
                        {leg.winnerScore && (
                          <span style={{ color: colors.success, fontSize: 12 }}>{leg.winnerScore} Pts</span>
                        )}
                        <span style={{ flex: 1 }} />
                        {leg.winnerName ? (
                          <span style={{ fontWeight: 600, color: playerColors[leg.winnerId!] }}>{leg.winnerName}</span>
                        ) : (
                          <span style={{ color: colors.warning, fontWeight: 500 }}>offen</span>
                        )}
                        <span style={{ color: colors.fgMuted, fontSize: 12 }}>→</span>
                      </div>
                    )
                  })
                })()
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
