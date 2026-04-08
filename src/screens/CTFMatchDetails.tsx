// src/screens/CTFMatchDetails.tsx
// Spielzusammenfassung fuer Capture the Field Matches
// Mit Leg-Uebersicht und Drill-Down (analog zu ATBMatchDetails)

import React, { useMemo, useState, useEffect } from 'react'
import { getCTFMatchById, getProfiles } from '../storage'
import { applyCTFEvents, formatDuration, formatDart, formatTarget, calculateFieldPoints } from '../dartsCaptureTheField'
import type { CTFTurnAddedEvent, CTFRoundFinishedEvent, CTFLegStartedEvent, CTFLegFinishedEvent, CTFEvent } from '../types/captureTheField'
import { computeCTFDetailedStats, type CTFDetailedStats } from '../stats/computeCTFStats'
import ATBCaptureFieldDistributionChart from '../components/ATBCaptureFieldDistributionChart'
import ATBCaptureScoreChart from '../components/ATBCaptureScoreChart'
import { getThemedUI } from '../ui'
import { useTheme } from '../ThemeProvider'
import MatchHeader, { type MatchHeaderPlayer } from '../components/MatchHeader'
import LegHeader, { type LegHeaderPlayer } from '../components/LegHeader'
import { PLAYER_COLORS } from '../playerColors'

// Bestimmt Spielerfarbe fuer den Gewinner einer Statistik-Zeile
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
}

// Statistik-Typ fuer einen Spieler
type PlayerStats = {
  playerId: string
  name: string
  totalDarts: number
  triples: number
  doubles: number
  singles: number
  misses: number
  hitRate: number
  fieldsWon: number
  fieldPoints: number
  totalScore: number
  perfectTurns: number
  tripleRate: number
  doubleRate: number
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
  turns: CTFTurnAddedEvent[]
  roundFinished: CTFRoundFinishedEvent[]
}

// Berechne Statistiken aus Turn-Events und RoundFinished-Events
function computeStatsFromTurns(
  turns: CTFTurnAddedEvent[],
  roundEvents: CTFRoundFinishedEvent[],
  players: { playerId: string; name: string }[],
  winnerId?: string
): PlayerStats[] {
  return players.map((player) => {
    const pid = player.playerId
    let totalDarts = 0
    let triples = 0
    let doubles = 0
    let singles = 0
    let misses = 0
    let perfectTurns = 0
    let totalScore = 0

    const playerTurns = turns.filter(t => t.playerId === pid)

    for (const turn of playerTurns) {
      let turnHits = 0
      totalScore += turn.captureScore

      for (const dart of turn.darts) {
        totalDarts++
        if (dart.target === 'MISS') {
          misses++
        } else if (dart.mult === 3) {
          triples++
          turnHits++
        } else if (dart.mult === 2) {
          doubles++
          turnHits++
        } else {
          singles++
          turnHits++
        }
      }

      if (turnHits === 3 && turn.darts.length === 3) {
        perfectTurns++
      }
    }

    // Felder gewonnen und Feldpunkte zaehlen
    let fieldsWon = 0
    let fieldPoints = 0
    for (const round of roundEvents) {
      if (round.winnerId === pid) {
        fieldsWon++
      }
      // fieldPoints aus Event oder retroaktiv berechnen
      const fp = round.fieldPoints ?? calculateFieldPoints(round.scoresByPlayer, round.winnerId)
      fieldPoints += fp[pid] ?? 0
    }

    const hits = totalDarts - misses
    const hitRate = totalDarts > 0 ? (hits / totalDarts) * 100 : 0
    const tripleRate = totalDarts > 0 ? (triples / totalDarts) * 100 : 0
    const doubleRate = totalDarts > 0 ? (doubles / totalDarts) * 100 : 0

    return {
      playerId: pid,
      name: player.name,
      totalDarts,
      triples,
      doubles,
      singles,
      misses,
      hitRate,
      fieldsWon,
      fieldPoints,
      totalScore,
      perfectTurns,
      tripleRate,
      doubleRate,
      isWinner: winnerId === pid,
    }
  })
}

// Hilfsfunktion: Standardabweichung berechnen
function computeStdDev(values: number[]): number {
  if (values.length === 0) return 0
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length
  return Math.sqrt(variance)
}

// Feld-Breakdown-Daten pro Spieler
type FieldBreakdownRow = {
  fieldNumber: number | 'BULL'
  fieldLabel: string
  scoresByPlayer: Record<string, number>
  winnerId: string | null
}

// Inline SVG Bar Chart fuer Feld-Effizienz
function FieldEfficiencyChart({
  rounds,
  players,
  playerColors,
}: {
  rounds: FieldBreakdownRow[]
  players: { playerId: string; name: string }[]
  playerColors: Record<string, string>
}) {
  const { colors } = useTheme()

  if (rounds.length === 0) return null

  const paddingLeft = 40
  const paddingRight = 16
  const paddingTop = 16
  const paddingBottom = 40
  const barHeight = 14
  const groupGap = 6
  const playerGap = 2
  const numPlayers = players.length
  const groupHeight = numPlayers * (barHeight + playerGap) + groupGap
  const chartHeight = paddingTop + rounds.length * groupHeight + paddingBottom
  const chartWidth = 600

  const graphWidth = chartWidth - paddingLeft - paddingRight
  const maxScore = Math.max(1, ...rounds.flatMap(r => Object.values(r.scoresByPlayer)))

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg width={chartWidth} height={chartHeight} style={{ display: 'block' }}>
        {/* Y-Achsen Labels (Feldnummern) */}
        {rounds.map((round, i) => {
          const groupY = paddingTop + i * groupHeight + groupHeight / 2
          return (
            <text
              key={i}
              x={paddingLeft - 8}
              y={groupY + 4}
              textAnchor="end"
              fontSize={11}
              fill={colors.fgMuted}
              fontWeight={600}
            >
              {round.fieldLabel}
            </text>
          )
        })}

        {/* Bars */}
        {rounds.map((round, roundIdx) => {
          const groupY = paddingTop + roundIdx * groupHeight

          return (
            <g key={roundIdx}>
              {players.map((player, pIdx) => {
                const score = round.scoresByPlayer[player.playerId] ?? 0
                const barW = (score / maxScore) * graphWidth
                const y = groupY + pIdx * (barHeight + playerGap)
                const isWinner = round.winnerId === player.playerId
                const color = playerColors[player.playerId] || PLAYER_COLORS[pIdx % PLAYER_COLORS.length]

                return (
                  <g key={player.playerId}>
                    {/* Background bar */}
                    <rect
                      x={paddingLeft}
                      y={y}
                      width={graphWidth}
                      height={barHeight}
                      fill={colors.bgMuted}
                      rx={3}
                    />
                    {/* Score bar */}
                    {score > 0 && (
                      <rect
                        x={paddingLeft}
                        y={y}
                        width={barW}
                        height={barHeight}
                        fill={color}
                        rx={3}
                        opacity={isWinner ? 1 : 0.6}
                      />
                    )}
                    {/* Score label */}
                    <text
                      x={paddingLeft + Math.max(barW, 0) + 6}
                      y={y + barHeight / 2 + 4}
                      fontSize={10}
                      fill={isWinner ? color : colors.fgMuted}
                      fontWeight={isWinner ? 700 : 400}
                    >
                      {score}{isWinner ? ' \u2605' : ''}
                    </text>
                  </g>
                )
              })}
              {/* Separator line */}
              {roundIdx < rounds.length - 1 && (
                <line
                  x1={paddingLeft}
                  y1={groupY + groupHeight - groupGap / 2}
                  x2={chartWidth - paddingRight}
                  y2={groupY + groupHeight - groupGap / 2}
                  stroke={colors.border}
                  strokeWidth={0.5}
                  opacity={0.4}
                />
              )}
            </g>
          )
        })}
      </svg>

      {/* Legende */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginTop: 4, flexWrap: 'wrap' }}>
        {players.map((p, idx) => (
          <div key={p.playerId} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
            <div style={{
              width: 12, height: 12, borderRadius: 2,
              background: playerColors[p.playerId] || PLAYER_COLORS[idx % PLAYER_COLORS.length],
            }} />
            <span style={{ color: colors.fg }}>{p.name}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function CTFMatchDetails({ matchId, onBack }: Props) {
  const { isArcade, colors } = useTheme()
  const styles = useMemo(() => getThemedUI(colors, isArcade), [colors, isArcade])

  const [isMobile, setIsMobile] = useState(() => Math.min(window.innerWidth, window.innerHeight) < 600)
  useEffect(() => {
    const check = () => setIsMobile(Math.min(window.innerWidth, window.innerHeight) < 600)
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // Dynamische Table Styles
  const thLeft: React.CSSProperties = {
    textAlign: 'left', fontSize: isMobile ? 11 : 13, fontWeight: 600,
    color: colors.fgDim, padding: isMobile ? '6px 6px' : '8px 12px',
    borderBottom: `2px solid ${colors.border}`,
  }
  const thRight: React.CSSProperties = {
    textAlign: 'right', fontSize: isMobile ? 11 : 13, fontWeight: 700,
    color: colors.fg, padding: isMobile ? '6px 6px' : '8px 12px',
    borderBottom: `2px solid ${colors.border}`,
  }
  const tdLeft: React.CSSProperties = {
    padding: isMobile ? '6px 6px' : '10px 12px', borderBottom: `1px solid ${colors.bgMuted}`,
    fontWeight: 500, color: colors.fg, fontSize: isMobile ? 11 : undefined,
  }
  const tdRight: React.CSSProperties = {
    padding: isMobile ? '6px 6px' : '10px 12px', borderBottom: `1px solid ${colors.bgMuted}`,
    textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600, fontSize: isMobile ? 11 : undefined,
  }

  const [selectedLegId, setSelectedLegId] = useState<string | null>(null)

  const match = useMemo(() => getCTFMatchById(matchId), [matchId])
  const profiles = useMemo(() => getProfiles(), [])

  // Legs aus Events extrahieren (muss vor early return sein wegen Hook-Regeln)
  const legs = useMemo<LegInfo[]>(() => {
    if (!match) return []
    const result: LegInfo[] = []
    let currentLeg: LegInfo | null = null

    for (const event of match.events) {
      if (event.type === 'CTFLegStarted') {
        currentLeg = {
          legId: event.legId,
          legIndex: event.legIndex,
          setIndex: event.setIndex,
          turns: [],
          roundFinished: [],
        }
      } else if (event.type === 'CTFTurnAdded' && currentLeg) {
        currentLeg.turns.push(event)
      } else if (event.type === 'CTFRoundFinished' && currentLeg) {
        currentLeg.roundFinished.push(event)
      } else if (event.type === 'CTFLegFinished' && currentLeg) {
        currentLeg.winnerId = event.winnerId
        currentLeg.winnerName = match.players.find(p => p.playerId === event.winnerId)?.name
        currentLeg.winnerDarts = event.winnerDarts
        result.push(currentLeg)
        currentLeg = null
      }
    }

    if (currentLeg && currentLeg.turns.length > 0) {
      result.push(currentLeg)
    }

    return result
  }, [match])

  // Ausgewaehltes Leg (muss vor early return sein)
  const selectedLeg = selectedLegId ? legs.find(l => l.legId === selectedLegId) : null
  const selectedLegIndex = selectedLeg ? legs.findIndex(l => l.legId === selectedLegId) : -1

  // Detaillierte Statistiken fuer ausgewaehltes Leg (muss vor early return sein wegen Hook-Regeln)
  const legDetailedStats = useMemo(() => {
    if (!match || selectedLegIndex < 0) return []
    return computeCTFDetailedStats(match, selectedLegIndex)
  }, [match, selectedLegIndex])

  // Detaillierte Statistiken fuer Match-Uebersicht (muss vor early return sein)
  const detailedStats = useMemo(() => {
    if (!match) return []
    return computeCTFDetailedStats(match)
  }, [match])

  // Capture the Field Rundendaten fuer das Score-Chart (muss vor early return sein)
  const captureRounds = useMemo(() => {
    if (!match || selectedLegIndex < 0) return []
    const leg = legs[selectedLegIndex]
    if (!leg) return []

    const rounds: Array<{
      fieldNumber: number | 'BULL'
      scoresByPlayer: Record<string, number>
      winnerId: string | null
    }> = []

    for (const event of match.events) {
      if (event.type === 'CTFRoundFinished' && event.legId === leg.legId) {
        rounds.push({
          fieldNumber: event.fieldNumber,
          scoresByPlayer: event.scoresByPlayer,
          winnerId: event.winnerId ?? null,
        })
      }
    }

    return rounds
  }, [match, selectedLegIndex, legs])

  // ===== EARLY RETURN - nach allen Hooks =====
  if (!match) {
    return (
      <div style={styles.page}>
        <div style={styles.centerPage}>
          <div style={styles.centerInner}>
            <div style={styles.card}>
              <h2 style={{ margin: 0 }}>Match nicht gefunden</h2>
              <div style={{ marginTop: 10 }}>
                <button style={styles.backBtn} onClick={onBack}>← Zurück</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const state = applyCTFEvents(match.events)
  const sequence = match.generatedSequence ?? state.match?.sequence ?? []

  // Spielerfarben aus Profilen oder Standardfarben
  const playerColors: Record<string, string> = {}
  match.players.forEach((p, idx) => {
    const profile = profiles.find((pr) => pr.id === p.playerId)
    playerColors[p.playerId] = profile?.color ?? PLAYER_COLORS[idx % PLAYER_COLORS.length]
  })
  const pids = match.players.map(p => p.playerId)
  const tdWin = (c: string | undefined): React.CSSProperties => c ? { ...tdRight, color: c, fontWeight: 700 } : tdRight

  // Alle Turn-Events fuer Match-Gesamtstatistik
  const allTurnEvents = match.events.filter(
    (e): e is CTFTurnAddedEvent => e.type === 'CTFTurnAdded'
  )

  // Alle RoundFinished-Events fuer Match-Gesamtstatistik
  const allRoundEvents = match.events.filter(
    (e): e is CTFRoundFinishedEvent => e.type === 'CTFRoundFinished'
  )

  // Format-Label fuer Legs/Sets
  let formatLabel = ''
  if (match.structure?.kind === 'legs' && match.structure.bestOfLegs > 1) {
    formatLabel = `First to ${Math.ceil(match.structure.bestOfLegs / 2)} Legs`
  } else if (match.structure?.kind === 'sets') {
    formatLabel = `First to ${Math.ceil(match.structure.bestOfSets / 2)} Sets (Best of ${Math.ceil(match.structure.legsPerSet / 2)} Legs)`
  }

  // Helper: Feld-Breakdown-Daten aus Round-Events
  function buildFieldBreakdown(roundEvents: CTFRoundFinishedEvent[]): FieldBreakdownRow[] {
    return roundEvents.map(r => ({
      fieldNumber: r.fieldNumber,
      fieldLabel: r.fieldNumber === 'BULL' ? 'Bull' : String(r.fieldNumber),
      scoresByPlayer: r.scoresByPlayer,
      winnerId: r.winnerId,
    }))
  }

  // Helper: Konsistenz-Stats (Std Dev der Feld-Scores pro Spieler)
  function buildConsistencyStats(roundEvents: CTFRoundFinishedEvent[]): Record<string, number> {
    if (!match) return {}
    const result: Record<string, number> = {}
    for (const p of match.players) {
      const scores = roundEvents.map(r => r.scoresByPlayer[p.playerId] ?? 0)
      result[p.playerId] = computeStdDev(scores)
    }
    return result
  }

  // Helper: Head-to-Head Vergleich (wer hat mehr Felder gewonnen, nur bei 2+ Spielern)
  function buildHeadToHead(roundEvents: CTFRoundFinishedEvent[]): {
    fieldsWonBy: Record<string, number>
    tiedFields: number
  } | null {
    if (!match || match.players.length < 2) return null

    const fieldsWonBy: Record<string, number> = {}
    match.players.forEach(p => { fieldsWonBy[p.playerId] = 0 })
    let tiedFields = 0

    for (const round of roundEvents) {
      if (round.winnerId === null) {
        tiedFields++
      } else {
        fieldsWonBy[round.winnerId] = (fieldsWonBy[round.winnerId] ?? 0) + 1
      }
    }

    return { fieldsWonBy, tiedFields }
  }

  // Helper: Streaks berechnen (laengste Gewinnserie)
  function buildStreaks(roundEvents: CTFRoundFinishedEvent[]): Record<string, { current: number; longest: number }> {
    if (!match) return {}
    const result: Record<string, { current: number; longest: number }> = {}
    match.players.forEach(p => { result[p.playerId] = { current: 0, longest: 0 } })

    for (const round of roundEvents) {
      for (const p of match.players) {
        if (round.winnerId === p.playerId) {
          result[p.playerId].current++
          result[p.playerId].longest = Math.max(result[p.playerId].longest, result[p.playerId].current)
        } else {
          result[p.playerId].current = 0
        }
      }
    }

    return result
  }

  // ===== LEG DETAIL VIEW =====
  if (selectedLeg) {
    const legStats = computeStatsFromTurns(
      selectedLeg.turns,
      selectedLeg.roundFinished,
      match.players,
      selectedLeg.winnerId
    )

    // Kumulativen Spielstand nach diesem Leg berechnen
    const cumulativeScore: Record<string, number> = {}
    match.players.forEach(p => { cumulativeScore[p.playerId] = 0 })
    for (let i = 0; i <= selectedLegIndex; i++) {
      const leg = legs[i]
      if (leg.winnerId) cumulativeScore[leg.winnerId]++
    }
    const scoreAfterLeg = match.players.map(p => cumulativeScore[p.playerId]).join(':')

    // Leg-Dauer berechnen (aus Timestamps)
    let legDurationMs: number | undefined
    if (selectedLeg.turns.length >= 2) {
      const firstTs = selectedLeg.turns[0]?.ts
      const lastTs = selectedLeg.turns[selectedLeg.turns.length - 1]?.ts
      if (firstTs && lastTs) {
        legDurationMs = new Date(lastTs).getTime() - new Date(firstTs).getTime()
      }
    }

    // Spielmodus-String
    const gameMode = `CTF ${match.structure?.kind === 'sets' ? 'S' : 'L'}`

    // Capture-Rounds fuer dieses Leg (fuer Score-Chart)
    const legCaptureRounds: Array<{
      fieldNumber: number | 'BULL'
      scoresByPlayer: Record<string, number>
      winnerId: string | null
    }> = selectedLeg.roundFinished.map(r => ({
      fieldNumber: r.fieldNumber,
      scoresByPlayer: r.scoresByPlayer,
      winnerId: r.winnerId ?? null,
    }))

    // Feldverteilung fuer dieses Leg
    const legFieldDistribution: Record<string, number> = {}
    match.players.forEach(p => { legFieldDistribution[p.playerId] = 0 })
    legFieldDistribution['ties'] = 0

    for (const round of selectedLeg.roundFinished) {
      if (round.winnerId === null) {
        legFieldDistribution['ties']++
      } else {
        legFieldDistribution[round.winnerId] = (legFieldDistribution[round.winnerId] ?? 0) + 1
      }
    }

    const legChartData = match.players
      .filter(p => legFieldDistribution[p.playerId] > 0)
      .map((p) => ({
        label: p.name,
        count: legFieldDistribution[p.playerId],
        color: playerColors[p.playerId] || PLAYER_COLORS[0],
      }))

    if (legFieldDistribution['ties'] > 0) {
      legChartData.push({
        label: 'Unentschieden',
        count: legFieldDistribution['ties'],
        color: colors.fgMuted,
      })
    }

    // Leg-spezifische erweiterte Daten
    const legFieldBreakdown = buildFieldBreakdown(selectedLeg.roundFinished)
    const legConsistency = buildConsistencyStats(selectedLeg.roundFinished)
    const legHeadToHead = buildHeadToHead(selectedLeg.roundFinished)
    const legStreaks = buildStreaks(selectedLeg.roundFinished)

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
                id: p.playerId,
                name: p.name,
                color: playerColors[p.playerId],
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

            {/* Leg Statistik */}
            {(() => {
              const legFpWin = getStatWinnerColors(legStats.map(ps => ps.fieldPoints), pids, 'high', playerColors)
              const legFwWin = getStatWinnerColors(legStats.map(ps => ps.fieldsWon), pids, 'high', playerColors)
              const legWpWin = getStatWinnerColors(legStats.map(ps => ps.totalScore), pids, 'high', playerColors)
              const legTriWin = getStatWinnerColors(legStats.map(ps => ps.triples), pids, 'high', playerColors)
              const legDblWin = getStatWinnerColors(legStats.map(ps => ps.doubles), pids, 'high', playerColors)
              const legSglWin = getStatWinnerColors(legStats.map(ps => ps.singles), pids, 'high', playerColors)
              const legMissWin = getStatWinnerColors(legStats.map(ps => ps.misses), pids, 'low', playerColors)
              const legHrWin = getStatWinnerColors(legStats.map(ps => ps.hitRate), pids, 'high', playerColors)
              return (
              <div style={styles.card}>
                <div style={{ fontWeight: 700, marginBottom: 12, fontSize: isMobile ? 14 : undefined }}>Leg-Statistiken</div>
                <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={thLeft}></th>
                      {legStats.map((ps) => (
                        <th key={ps.playerId} style={{ ...thRight, color: playerColors[ps.playerId] }}>
                          {ps.name} {ps.isWinner && '\u{1F3C6}'}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td style={{ ...tdLeft, fontWeight: 700 }}>Feldpunkte</td>
                      {legStats.map((ps, i) => <td key={ps.playerId} style={legFpWin[i] ? { ...tdRight, color: legFpWin[i], fontWeight: 800, fontSize: 16 } : { ...tdRight, color: colors.warning, fontWeight: 800, fontSize: 16 }}>{ps.fieldPoints}</td>)}
                    </tr>
                    <tr>
                      <td style={tdLeft}>Felder gewonnen</td>
                      {legStats.map((ps, i) => <td key={ps.playerId} style={tdWin(legFwWin[i])}>{ps.fieldsWon}</td>)}
                    </tr>
                    <tr>
                      <td style={tdLeft}>Wurfpunkte</td>
                      {legStats.map((ps, i) => <td key={ps.playerId} style={tdWin(legWpWin[i])}>{ps.totalScore}</td>)}
                    </tr>
                    <tr>
                      <td style={tdLeft}>Darts</td>
                      {legStats.map((ps) => <td key={ps.playerId} style={tdRight}>{ps.totalDarts}</td>)}
                    </tr>
                    <tr><td colSpan={legStats.length + 1} style={{ borderBottom: `2px solid ${colors.border}`, padding: '4px 0' }}></td></tr>
                    <tr>
                      <td style={tdLeft}>Triples</td>
                      {legStats.map((ps, i) => <td key={ps.playerId} style={tdWin(legTriWin[i])}>{ps.triples}</td>)}
                    </tr>
                    <tr>
                      <td style={tdLeft}>Doubles</td>
                      {legStats.map((ps, i) => <td key={ps.playerId} style={tdWin(legDblWin[i])}>{ps.doubles}</td>)}
                    </tr>
                    <tr>
                      <td style={tdLeft}>Singles</td>
                      {legStats.map((ps, i) => <td key={ps.playerId} style={tdWin(legSglWin[i])}>{ps.singles}</td>)}
                    </tr>
                    <tr>
                      <td style={tdLeft}>Misses</td>
                      {legStats.map((ps, i) => <td key={ps.playerId} style={tdWin(legMissWin[i])}>{ps.misses}</td>)}
                    </tr>
                    <tr>
                      <td style={tdLeft}>Trefferquote</td>
                      {legStats.map((ps, i) => <td key={ps.playerId} style={tdWin(legHrWin[i])}>{ps.hitRate.toFixed(1)}%</td>)}
                    </tr>
                  </tbody>
                </table>
                </div>
              </div>
              )
            })()}

            {/* Feldverteilung */}
            {legChartData.length > 0 && (
              <div style={styles.card}>
                <div style={{ fontWeight: 700, marginBottom: 16 }}>Feldverteilung</div>
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  <ATBCaptureFieldDistributionChart data={legChartData} size={isMobile ? 180 : 240} />
                </div>
              </div>
            )}

            {/* Erweiterte Leg-Statistiken */}
            {legDetailedStats.length > 0 && (
              <>
                {/* Detailstatistiken mit Konsistenz */}
                {(() => {
                  const ldPids = legDetailedStats.map(ps => ps.playerId)
                  const ldPerfWin = getStatWinnerColors(legDetailedStats.map(ps => ps.perfectTurns), ldPids, 'high', playerColors)
                  const ldAvgWin = getStatWinnerColors(legDetailedStats.map(ps => ps.avgScorePerField), ldPids, 'high', playerColors)
                  const consistencyValues = ldPids.map(pid => legConsistency[pid] ?? 0)
                  const ldConsWin = getStatWinnerColors(consistencyValues, ldPids, 'low', playerColors)
                  const streakValues = ldPids.map(pid => legStreaks[pid]?.longest ?? 0)
                  const ldStreakWin = getStatWinnerColors(streakValues, ldPids, 'high', playerColors)
                  return (
                  <div style={styles.card}>
                    <div style={{ fontWeight: 700, marginBottom: 12, fontSize: isMobile ? 14 : undefined }}>Detailstatistiken</div>
                    <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr>
                          <th style={thLeft}></th>
                          {legDetailedStats.map((ps) => (
                            <th key={ps.playerId} style={{ ...thRight, color: playerColors[ps.playerId] }}>
                              {ps.playerName}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td style={tdLeft}>Bestes Feld</td>
                          {legDetailedStats.map((ps) => (
                            <td key={ps.playerId} style={{ ...tdRight, color: colors.success }}>
                              {ps.bestField ? `${ps.bestField.field} (${ps.bestField.score} Pkt)` : '\u2014'}
                            </td>
                          ))}
                        </tr>
                        <tr>
                          <td style={tdLeft}>Schwerstes Feld</td>
                          {legDetailedStats.map((ps) => (
                            <td key={ps.playerId} style={{ ...tdRight, color: colors.error }}>
                              {ps.worstField ? `${ps.worstField.field} (${ps.worstField.score} Pkt)` : '\u2014'}
                            </td>
                          ))}
                        </tr>
                        <tr>
                          <td style={tdLeft}>Perfekte Runden</td>
                          {legDetailedStats.map((ps, i) => (
                            <td key={ps.playerId} style={tdWin(ldPerfWin[i])}>{ps.perfectTurns}</td>
                          ))}
                        </tr>
                        <tr>
                          <td style={tdLeft}>{'\u00D8'} Punkte/Feld</td>
                          {legDetailedStats.map((ps, i) => (
                            <td key={ps.playerId} style={tdWin(ldAvgWin[i])}>{ps.avgScorePerField.toFixed(2)}</td>
                          ))}
                        </tr>
                        <tr>
                          <td style={tdLeft}>Konsistenz ({'\u03C3'})</td>
                          {legDetailedStats.map((ps, i) => (
                            <td key={ps.playerId} style={tdWin(ldConsWin[i])}>{(legConsistency[ps.playerId] ?? 0).toFixed(2)}</td>
                          ))}
                        </tr>
                        <tr>
                          <td style={tdLeft}>Beste Serie</td>
                          {legDetailedStats.map((ps, i) => (
                            <td key={ps.playerId} style={tdWin(ldStreakWin[i])}>{legStreaks[ps.playerId]?.longest ?? 0} Felder</td>
                          ))}
                        </tr>
                      </tbody>
                    </table>
                    </div>
                  </div>
                  )
                })()}

                {/* Punkte pro Feld Chart */}
                <div style={styles.card}>
                  <div style={{ fontWeight: 700, marginBottom: 12, fontSize: isMobile ? 14 : undefined }}>Punkte pro Feld</div>
                  <ATBCaptureScoreChart
                    rounds={legCaptureRounds}
                    players={match.players.map((p, idx) => ({
                      playerId: p.playerId,
                      name: p.name,
                      color: playerColors[p.playerId] || PLAYER_COLORS[idx % PLAYER_COLORS.length],
                    }))}
                  />
                </div>

                {/* Feld-Effizienz Chart (horizontale Bars) */}
                {legFieldBreakdown.length > 0 && (
                  <div style={styles.card}>
                    <div style={{ fontWeight: 700, marginBottom: 12, fontSize: isMobile ? 14 : undefined }}>Feld-Effizienz</div>
                    <FieldEfficiencyChart
                      rounds={legFieldBreakdown}
                      players={match.players}
                      playerColors={playerColors}
                    />
                  </div>
                )}

                {/* Head-to-Head Vergleich */}
                {legHeadToHead && match.players.length >= 2 && (
                  <div style={styles.card}>
                    <div style={{ fontWeight: 700, marginBottom: 12, fontSize: isMobile ? 14 : undefined }}>Head-to-Head</div>
                    {(() => {
                      const totalFields = selectedLeg.roundFinished.length
                      const barWidth = 100
                      return (
                        <div>
                          {/* Balkenvisualisierung */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                            {match.players.map((p, idx) => {
                              const won = legHeadToHead.fieldsWonBy[p.playerId] ?? 0
                              const pct = totalFields > 0 ? (won / totalFields) * barWidth : 0
                              return (
                                <div key={p.playerId} style={{ flex: 1, textAlign: idx === 0 ? 'right' : 'left' }}>
                                  <div style={{ fontWeight: 700, fontSize: 20, color: playerColors[p.playerId] }}>
                                    {won}
                                  </div>
                                  <div style={{ fontSize: 12, color: colors.fgMuted }}>{p.name}</div>
                                </div>
                              )
                            })}
                          </div>
                          {/* Stacked bar */}
                          <div style={{ display: 'flex', height: 12, borderRadius: 6, overflow: 'hidden', background: colors.bgMuted }}>
                            {match.players.map((p, idx) => {
                              const won = legHeadToHead.fieldsWonBy[p.playerId] ?? 0
                              const pct = totalFields > 0 ? (won / totalFields) * 100 : 0
                              return (
                                <div
                                  key={p.playerId}
                                  style={{
                                    width: `${pct}%`,
                                    background: playerColors[p.playerId],
                                    transition: 'width 0.3s',
                                  }}
                                />
                              )
                            })}
                            {legHeadToHead.tiedFields > 0 && (
                              <div style={{
                                width: `${totalFields > 0 ? (legHeadToHead.tiedFields / totalFields) * 100 : 0}%`,
                                background: '#888',
                              }} />
                            )}
                          </div>
                          {legHeadToHead.tiedFields > 0 && (
                            <div style={{ fontSize: 11, color: '#888', textAlign: 'center', marginTop: 4 }}>
                              {legHeadToHead.tiedFields} Unentschieden
                            </div>
                          )}
                        </div>
                      )
                    })()}
                  </div>
                )}

                {/* Feld-Breakdown Tabelle */}
                {legFieldBreakdown.length > 0 && (
                  <div style={styles.card}>
                    <div style={{ fontWeight: 700, marginBottom: 12, fontSize: isMobile ? 14 : undefined }}>Feld-Breakdown</div>
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead>
                          <tr>
                            <th style={{ ...thLeft, fontSize: 12 }}>Feld</th>
                            {match.players.map((p) => (
                              <th key={p.playerId} style={{ ...thRight, fontSize: 12, color: playerColors[p.playerId] }}>
                                {p.name}
                              </th>
                            ))}
                            <th style={{ ...thRight, fontSize: 12 }}>Gewinner</th>
                          </tr>
                        </thead>
                        <tbody>
                          {legFieldBreakdown.map((row, idx) => {
                            const winnerPlayer = row.winnerId
                              ? match.players.find(p => p.playerId === row.winnerId)
                              : null

                            return (
                              <tr key={idx}>
                                <td style={{ ...tdLeft, fontWeight: 700, fontSize: 13 }}>
                                  {row.fieldLabel}
                                </td>
                                {match.players.map((p) => {
                                  const score = row.scoresByPlayer[p.playerId] ?? 0
                                  const isFieldWinner = row.winnerId === p.playerId
                                  return (
                                    <td
                                      key={p.playerId}
                                      style={{
                                        ...tdRight,
                                        fontSize: 13,
                                        color: isFieldWinner ? playerColors[p.playerId] : score > 0 ? colors.fg : colors.fgMuted,
                                        fontWeight: isFieldWinner ? 800 : 500,
                                        background: isFieldWinner ? `${playerColors[p.playerId]}15` : 'transparent',
                                      }}
                                    >
                                      {score}
                                    </td>
                                  )
                                })}
                                <td style={{
                                  ...tdRight,
                                  fontSize: 12,
                                  color: winnerPlayer ? playerColors[winnerPlayer.playerId] : '#888',
                                  fontWeight: 600,
                                }}>
                                  {winnerPlayer ? winnerPlayer.name : row.winnerId === null ? 'Draw' : '\u2014'}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Wurfabfolge */}
            <div style={styles.card}>
              <div style={{ fontWeight: 700, marginBottom: 12, fontSize: isMobile ? 14 : undefined }}>Wurfabfolge</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 400, overflowY: 'auto' }}>
                {selectedLeg.turns.length === 0 ? (
                  <div style={{ opacity: 0.6 }}>Keine Wuerfe in diesem Leg.</div>
                ) : (
                  (() => {
                    // Ordne Turns den Feldern zu ueber RoundFinished-Events
                    const turnFieldMap: Map<string, number | 'BULL'> = new Map()

                    let fieldIdx = 0
                    let turnsInCurrentRound = 0
                    const playerCount = match.players.length

                    for (const turn of selectedLeg.turns) {
                      const currentRound = selectedLeg.roundFinished[fieldIdx]
                      if (currentRound) {
                        turnFieldMap.set(turn.eventId, currentRound.fieldNumber)
                      }

                      turnsInCurrentRound++
                      if (turnsInCurrentRound >= playerCount) {
                        turnsInCurrentRound = 0
                        fieldIdx++
                      }
                    }

                    return selectedLeg.turns.map((turn, idx) => {
                      const player = match.players.find(p => p.playerId === turn.playerId)
                      const color = playerColors[turn.playerId] || colors.fgDim
                      const targetField = turnFieldMap.get(turn.eventId)

                      return (
                        <div
                          key={turn.eventId || idx}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: isMobile ? 6 : 12,
                            padding: isMobile ? '6px 6px' : '10px 12px',
                            background: `${color}10`,
                            borderLeft: `4px solid ${color}`,
                            borderRadius: '0 6px 6px 0',
                            fontSize: isMobile ? 12 : 14,
                            flexWrap: isMobile ? 'wrap' : undefined,
                          }}
                        >
                          <span style={{ fontWeight: 700, minWidth: isMobile ? 60 : 80, color }}>{player?.name}</span>
                          <span style={{ minWidth: isMobile ? 70 : 90, fontFamily: 'monospace', fontSize: isMobile ? 10 : 12 }}>
                            {turn.darts.map(formatDart).join(' \u00B7 ')}
                          </span>
                          <span style={{ minWidth: isMobile ? 40 : 50, color: colors.fgDim, fontSize: isMobile ? 10 : 12 }}>
                            Ziel: {targetField !== undefined ? formatTarget(targetField) : '?'}
                          </span>
                          {turn.captureScore > 0 ? (
                            <span style={{
                              fontWeight: 600,
                              color: colors.success,
                              background: colors.successBg,
                              padding: '2px 8px',
                              borderRadius: 4,
                              fontSize: 12,
                            }}>
                              {turn.captureScore} {turn.captureScore === 1 ? 'Punkt' : 'Punkte'}
                            </span>
                          ) : (
                            <span style={{ color: colors.fgMuted, fontSize: 12 }}>0 Punkte</span>
                          )}
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

  // ===== MATCH OVERVIEW =====
  const matchStats = computeStatsFromTurns(allTurnEvents, allRoundEvents, match.players, match.winnerId)

  // Leg-Siege pro Spieler zaehlen
  const legWinsPerPlayer: Record<string, number> = {}
  match.players.forEach(p => { legWinsPerPlayer[p.playerId] = 0 })
  legs.forEach(leg => {
    if (leg.winnerId) legWinsPerPlayer[leg.winnerId]++
  })

  // Spielmodus-String fuer Header
  const gameMode = `CTF ${match.structure?.kind === 'sets' ? 'S' : 'L'}`

  // Legs-Score und Sets-Score
  const legScore = match.players.map(p => legWinsPerPlayer[p.playerId]).join(':')

  // Sets-Score berechnen (falls Sets-Modus)
  let setScore: string | undefined
  if (match.structure?.kind === 'sets') {
    const setWinsPerPlayer: Record<string, number> = {}
    match.players.forEach(p => { setWinsPerPlayer[p.playerId] = 0 })
    for (const ev of match.events) {
      if (ev.type === 'CTFSetFinished') {
        const wid = ev.winnerId
        if (wid in setWinsPerPlayer) setWinsPerPlayer[wid]++
      }
    }
    setScore = match.players.map(p => setWinsPerPlayer[p.playerId]).join(':')
  }

  // Feldverteilung fuer Match-Uebersicht
  const matchFieldDistribution: Record<string, number> = {}
  match.players.forEach(p => { matchFieldDistribution[p.playerId] = 0 })
  matchFieldDistribution['ties'] = 0

  for (const round of allRoundEvents) {
    if (round.winnerId === null) {
      matchFieldDistribution['ties']++
    } else {
      matchFieldDistribution[round.winnerId] = (matchFieldDistribution[round.winnerId] ?? 0) + 1
    }
  }

  const matchChartData = match.players
    .filter(p => matchFieldDistribution[p.playerId] > 0)
    .map((p) => ({
      label: p.name,
      count: matchFieldDistribution[p.playerId],
      color: playerColors[p.playerId] || PLAYER_COLORS[0],
    }))

  if (matchFieldDistribution['ties'] > 0) {
    matchChartData.push({
      label: 'Unentschieden',
      count: matchFieldDistribution['ties'],
      color: colors.fgMuted,
    })
  }

  // Match-level erweiterte Daten
  const matchFieldBreakdown = buildFieldBreakdown(allRoundEvents)
  const matchConsistency = buildConsistencyStats(allRoundEvents)
  const matchHeadToHead = buildHeadToHead(allRoundEvents)
  const matchStreaks = buildStreaks(allRoundEvents)

  return (
    <div style={styles.page}>
      <div style={styles.centerPage}>
        <div style={{ ...styles.centerInner, width: 'min(650px, 95vw)' }}>
          {/* Einheitlicher Match-Header */}
          <MatchHeader
            gameName={match.title}
            gameMode={gameMode}
            players={match.players.map(p => ({
              id: p.playerId,
              name: p.name,
              color: playerColors[p.playerId],
              legsWon: legWinsPerPlayer[p.playerId],
            }))}
            winnerId={match.winnerId}
            legScore={legScore}
            setScore={setScore}
            durationMs={match.durationMs}
            playedAt={match.createdAt}
            onBack={onBack}
          />

          {/* Match-Statistik */}
          {(() => {
            const mFpWin = getStatWinnerColors(matchStats.map(ps => ps.fieldPoints), pids, 'high', playerColors)
            const mFwWin = getStatWinnerColors(matchStats.map(ps => ps.fieldsWon), pids, 'high', playerColors)
            const mWpWin = getStatWinnerColors(matchStats.map(ps => ps.totalScore), pids, 'high', playerColors)
            const mTriWin = getStatWinnerColors(matchStats.map(ps => ps.triples), pids, 'high', playerColors)
            const mDblWin = getStatWinnerColors(matchStats.map(ps => ps.doubles), pids, 'high', playerColors)
            const mSglWin = getStatWinnerColors(matchStats.map(ps => ps.singles), pids, 'high', playerColors)
            const mMissWin = getStatWinnerColors(matchStats.map(ps => ps.misses), pids, 'low', playerColors)
            const mHrWin = getStatWinnerColors(matchStats.map(ps => ps.hitRate), pids, 'high', playerColors)
            return (
            <div style={styles.card}>
              <div style={{ fontWeight: 700, marginBottom: 12, fontSize: isMobile ? 14 : undefined }}>Match-Statistik</div>
              <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={thLeft}></th>
                    {matchStats.map((ps) => (
                      <th key={ps.playerId} style={{ ...thRight, color: playerColors[ps.playerId] }}>
                        {ps.name} {ps.isWinner && '\u{1F3C6}'}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={{ ...tdLeft, fontWeight: 700 }}>Feldpunkte</td>
                    {matchStats.map((ps, i) => <td key={ps.playerId} style={mFpWin[i] ? { ...tdRight, color: mFpWin[i], fontWeight: 800, fontSize: 16 } : { ...tdRight, color: colors.warning, fontWeight: 800, fontSize: 16 }}>{ps.fieldPoints}</td>)}
                  </tr>
                  <tr>
                    <td style={tdLeft}>Felder gewonnen</td>
                    {matchStats.map((ps, i) => <td key={ps.playerId} style={tdWin(mFwWin[i])}>{ps.fieldsWon}</td>)}
                  </tr>
                  <tr>
                    <td style={tdLeft}>Wurfpunkte</td>
                    {matchStats.map((ps, i) => <td key={ps.playerId} style={tdWin(mWpWin[i])}>{ps.totalScore}</td>)}
                  </tr>
                  <tr>
                    <td style={tdLeft}>Darts</td>
                    {matchStats.map((ps) => <td key={ps.playerId} style={tdRight}>{ps.totalDarts}</td>)}
                  </tr>
                  <tr><td colSpan={matchStats.length + 1} style={{ borderBottom: `2px solid ${colors.border}`, padding: '4px 0' }}></td></tr>
                  <tr>
                    <td style={tdLeft}>Triples</td>
                    {matchStats.map((ps, i) => (
                      <td key={ps.playerId} style={tdWin(mTriWin[i])}>
                        {ps.triples} <span style={{ color: colors.fgMuted, fontSize: 11 }}>({ps.tripleRate.toFixed(1)}%)</span>
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td style={tdLeft}>Doubles</td>
                    {matchStats.map((ps, i) => (
                      <td key={ps.playerId} style={tdWin(mDblWin[i])}>
                        {ps.doubles} <span style={{ color: colors.fgMuted, fontSize: 11 }}>({ps.doubleRate.toFixed(1)}%)</span>
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td style={tdLeft}>Singles</td>
                    {matchStats.map((ps, i) => <td key={ps.playerId} style={tdWin(mSglWin[i])}>{ps.singles}</td>)}
                  </tr>
                  <tr>
                    <td style={tdLeft}>Misses</td>
                    {matchStats.map((ps, i) => <td key={ps.playerId} style={tdWin(mMissWin[i])}>{ps.misses}</td>)}
                  </tr>
                  <tr>
                    <td style={tdLeft}>Trefferquote</td>
                    {matchStats.map((ps, i) => <td key={ps.playerId} style={tdWin(mHrWin[i])}>{ps.hitRate.toFixed(1)}%</td>)}
                  </tr>
                </tbody>
              </table>
              </div>
            </div>
            )
          })()}

          {/* Feldverteilung */}
          {matchChartData.length > 0 && (
            <div style={styles.card}>
              <div style={{ fontWeight: 700, marginBottom: 16, fontSize: isMobile ? 14 : undefined }}>Feldverteilung</div>
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <ATBCaptureFieldDistributionChart data={matchChartData} size={isMobile ? 180 : 240} />
              </div>
            </div>
          )}

          {/* Erweiterte Statistiken mit Konsistenz und Streaks */}
          {detailedStats.length > 0 && (() => {
            const mdPids = detailedStats.map(ps => ps.playerId)
            const mdPerfWin = getStatWinnerColors(detailedStats.map(ps => ps.perfectTurns), mdPids, 'high', playerColors)
            const mdAvgWin = getStatWinnerColors(detailedStats.map(ps => ps.avgScorePerField), mdPids, 'high', playerColors)
            const consistencyValues = mdPids.map(pid => matchConsistency[pid] ?? 0)
            const mdConsWin = getStatWinnerColors(consistencyValues, mdPids, 'low', playerColors)
            const streakValues = mdPids.map(pid => matchStreaks[pid]?.longest ?? 0)
            const mdStreakWin = getStatWinnerColors(streakValues, mdPids, 'high', playerColors)
            return (
            <div style={styles.card}>
              <div style={{ fontWeight: 700, marginBottom: 12, fontSize: isMobile ? 14 : undefined }}>Detailstatistiken</div>
              <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={thLeft}></th>
                    {detailedStats.map((ps) => (
                      <th key={ps.playerId} style={{ ...thRight, color: playerColors[ps.playerId] }}>
                        {ps.playerName}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={tdLeft}>Bestes Feld</td>
                    {detailedStats.map((ps) => (
                      <td key={ps.playerId} style={{ ...tdRight, color: colors.success }}>
                        {ps.bestField ? `${ps.bestField.field} (${ps.bestField.score} Pkt)` : '\u2014'}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td style={tdLeft}>Schwerstes Feld</td>
                    {detailedStats.map((ps) => (
                      <td key={ps.playerId} style={{ ...tdRight, color: colors.error }}>
                        {ps.worstField ? `${ps.worstField.field} (${ps.worstField.score} Pkt)` : '\u2014'}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td style={tdLeft}>Perfekte Runden</td>
                    {detailedStats.map((ps, i) => (
                      <td key={ps.playerId} style={tdWin(mdPerfWin[i])}>{ps.perfectTurns}</td>
                    ))}
                  </tr>
                  <tr>
                    <td style={tdLeft}>{'\u00D8'} Punkte/Feld</td>
                    {detailedStats.map((ps, i) => (
                      <td key={ps.playerId} style={tdWin(mdAvgWin[i])}>{ps.avgScorePerField.toFixed(2)}</td>
                    ))}
                  </tr>
                  <tr>
                    <td style={tdLeft}>Konsistenz ({'\u03C3'})</td>
                    {detailedStats.map((ps, i) => (
                      <td key={ps.playerId} style={tdWin(mdConsWin[i])}>{(matchConsistency[ps.playerId] ?? 0).toFixed(2)}</td>
                    ))}
                  </tr>
                  <tr>
                    <td style={tdLeft}>Beste Serie</td>
                    {detailedStats.map((ps, i) => (
                      <td key={ps.playerId} style={tdWin(mdStreakWin[i])}>{matchStreaks[ps.playerId]?.longest ?? 0} Felder</td>
                    ))}
                  </tr>
                </tbody>
              </table>
              </div>
            </div>
            )
          })()}

          {/* Head-to-Head Vergleich (Match-Ebene) */}
          {matchHeadToHead && match.players.length >= 2 && (
            <div style={styles.card}>
              <div style={{ fontWeight: 700, marginBottom: 12, fontSize: isMobile ? 14 : undefined }}>Head-to-Head</div>
              {(() => {
                const totalFields = allRoundEvents.length
                return (
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                      {match.players.map((p, idx) => {
                        const won = matchHeadToHead.fieldsWonBy[p.playerId] ?? 0
                        return (
                          <div key={p.playerId} style={{ flex: 1, textAlign: idx === 0 ? 'right' : 'left' }}>
                            <div style={{ fontWeight: 700, fontSize: 20, color: playerColors[p.playerId] }}>
                              {won}
                            </div>
                            <div style={{ fontSize: 12, color: colors.fgMuted }}>{p.name}</div>
                          </div>
                        )
                      })}
                    </div>
                    <div style={{ display: 'flex', height: 12, borderRadius: 6, overflow: 'hidden', background: colors.bgMuted }}>
                      {match.players.map((p) => {
                        const won = matchHeadToHead.fieldsWonBy[p.playerId] ?? 0
                        const pct = totalFields > 0 ? (won / totalFields) * 100 : 0
                        return (
                          <div
                            key={p.playerId}
                            style={{
                              width: `${pct}%`,
                              background: playerColors[p.playerId],
                              transition: 'width 0.3s',
                            }}
                          />
                        )
                      })}
                      {matchHeadToHead.tiedFields > 0 && (
                        <div style={{
                          width: `${totalFields > 0 ? (matchHeadToHead.tiedFields / totalFields) * 100 : 0}%`,
                          background: '#888',
                        }} />
                      )}
                    </div>
                    {matchHeadToHead.tiedFields > 0 && (
                      <div style={{ fontSize: 11, color: '#888', textAlign: 'center', marginTop: 4 }}>
                        {matchHeadToHead.tiedFields} Unentschieden
                      </div>
                    )}
                  </div>
                )
              })()}
            </div>
          )}

          {/* Feld-Breakdown Tabelle (Match-Ebene) */}
          {matchFieldBreakdown.length > 0 && (
            <div style={styles.card}>
              <div style={{ fontWeight: 700, marginBottom: 12, fontSize: isMobile ? 14 : undefined }}>Feld-Breakdown</div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr>
                      <th style={{ ...thLeft, fontSize: 12 }}>Feld</th>
                      {match.players.map((p) => (
                        <th key={p.playerId} style={{ ...thRight, fontSize: 12, color: playerColors[p.playerId] }}>
                          {p.name}
                        </th>
                      ))}
                      <th style={{ ...thRight, fontSize: 12 }}>Gewinner</th>
                    </tr>
                  </thead>
                  <tbody>
                    {matchFieldBreakdown.map((row, idx) => {
                      const winnerPlayer = row.winnerId
                        ? match.players.find(p => p.playerId === row.winnerId)
                        : null

                      return (
                        <tr key={idx}>
                          <td style={{ ...tdLeft, fontWeight: 700, fontSize: 13 }}>
                            {row.fieldLabel}
                          </td>
                          {match.players.map((p) => {
                            const score = row.scoresByPlayer[p.playerId] ?? 0
                            const isFieldWinner = row.winnerId === p.playerId
                            return (
                              <td
                                key={p.playerId}
                                style={{
                                  ...tdRight,
                                  fontSize: 13,
                                  color: isFieldWinner ? playerColors[p.playerId] : score > 0 ? colors.fg : colors.fgMuted,
                                  fontWeight: isFieldWinner ? 800 : 500,
                                  background: isFieldWinner ? `${playerColors[p.playerId]}15` : 'transparent',
                                }}
                              >
                                {score}
                              </td>
                            )
                          })}
                          <td style={{
                            ...tdRight,
                            fontSize: 12,
                            color: winnerPlayer ? playerColors[winnerPlayer.playerId] : '#888',
                            fontWeight: 600,
                          }}>
                            {winnerPlayer ? winnerPlayer.name : row.winnerId === null ? 'Draw' : '\u2014'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Feld-Effizienz Chart (Match-Ebene) */}
          {matchFieldBreakdown.length > 0 && (
            <div style={styles.card}>
              <div style={{ fontWeight: 700, marginBottom: 12, fontSize: isMobile ? 14 : undefined }}>Feld-Effizienz</div>
              <FieldEfficiencyChart
                rounds={matchFieldBreakdown}
                players={match.players}
                playerColors={playerColors}
              />
            </div>
          )}

          {/* Legs Liste (hide when only 1 leg) */}
          {legs.length > 1 && (
          <div style={styles.card}>
            <div style={{ fontWeight: 700, marginBottom: 8, fontSize: isMobile ? 14 : undefined }}>Legs</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {legs.length === 0 ? (
                <div style={{ opacity: 0.6 }}>Keine Legs vorhanden.</div>
              ) : (
                (() => {
                  // Kumulativen Spielstand berechnen
                  const cumulativeScore: Record<string, number> = {}
                  match.players.forEach(p => { cumulativeScore[p.playerId] = 0 })

                  return legs.map((leg, idx) => {
                    // Spielstand nach diesem Leg aktualisieren
                    if (leg.winnerId) {
                      cumulativeScore[leg.winnerId]++
                    }
                    const scoreAfterLeg = match.players.map(p => cumulativeScore[p.playerId]).join(':')

                    return (
                      <div
                        key={leg.legId}
                        onClick={() => setSelectedLegId(leg.legId)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: isMobile ? 6 : 12,
                          padding: isMobile ? '6px 8px' : '8px 12px',
                          background: colors.bgMuted,
                          borderRadius: 6,
                          fontSize: isMobile ? 12 : 14,
                          cursor: 'pointer',
                        }}
                      >
                        <span style={{ fontWeight: 700, minWidth: isMobile ? 44 : 60 }}>
                          {leg.setIndex ? `S${leg.setIndex} ` : ''}Leg {leg.legIndex}
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
                        <span style={{ flex: 1 }} />
                        {leg.winnerName ? (
                          <span style={{ fontWeight: 600, color: playerColors[leg.winnerId!] }}>{leg.winnerName}</span>
                        ) : (
                          <span style={{ color: colors.warning, fontWeight: 500 }}>offen</span>
                        )}
                        <span style={{ color: colors.fgMuted, fontSize: 12 }}>{'\u2192'}</span>
                      </div>
                    )
                  })
                })()
              )}
            </div>
          </div>
          )}
        </div>
      </div>
    </div>
  )
}
