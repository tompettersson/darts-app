// src/screens/ShanghaiMatchDetails.tsx
// Spielzusammenfassung fuer Shanghai Matches (aus Match History)
// Mit Leg-Uebersicht, Drill-Down, Charts und umfangreichen Statistiken

import React, { useMemo, useState } from 'react'
import { getShanghaiMatchById, getProfiles } from '../storage'
import { applyShanghaiEvents, formatDuration, formatDart } from '../dartsShanghai'
import type {
  ShanghaiPlayer,
  ShanghaiTurnAddedEvent,
  ShanghaiRoundFinishedEvent,
  ShanghaiLegFinishedEvent,
} from '../types/shanghai'
import { computeShanghaiMatchStats } from '../stats/computeShanghaiStats'
import { getThemedUI } from '../ui'
import { useTheme } from '../ThemeProvider'
import MatchHeader, { type MatchHeaderPlayer } from '../components/MatchHeader'
import LegHeader from '../components/LegHeader'
import StatTooltip, { STAT_TOOLTIPS } from '../components/StatTooltip'
import { PLAYER_COLORS } from '../playerColors'
import { generateShanghaiReport } from '../narratives/generateModeReports'

type Props = {
  matchId: string
  onBack: () => void
}

type LegInfo = {
  legId: string
  legIndex: number
  setIndex?: number
  winnerId?: string | null
  winnerName?: string
  shanghaiWin: boolean
  finalScores: Record<string, number>
  turns: ShanghaiTurnAddedEvent[]
  rounds: ShanghaiRoundFinishedEvent[]
}

// ===== SVG Score Progression Chart =====
function ShanghaiScoreProgressionChart({
  rounds,
  players,
  playerColors,
  colors,
}: {
  rounds: ShanghaiRoundFinishedEvent[]
  players: ShanghaiPlayer[]
  playerColors: Record<string, string>
  colors: any
}) {
  if (rounds.length === 0) return null

  const W = 580
  const H = 200
  const PAD = { top: 20, right: 20, bottom: 30, left: 45 }
  const chartW = W - PAD.left - PAD.right
  const chartH = H - PAD.top - PAD.bottom

  // Max total score across all rounds
  const maxTotal = Math.max(
    1,
    ...rounds.flatMap(r => players.map(p => r.totalsByPlayer[p.playerId] ?? 0))
  )

  const xScale = (i: number) => PAD.left + (i / Math.max(1, rounds.length - 1)) * chartW
  const yScale = (v: number) => PAD.top + chartH - (v / maxTotal) * chartH

  // Build polylines per player
  const lines = players.map(p => {
    const points = rounds.map((r, i) => {
      const total = r.totalsByPlayer[p.playerId] ?? 0
      return `${xScale(i)},${yScale(total)}`
    })
    return {
      playerId: p.playerId,
      color: playerColors[p.playerId],
      name: p.name,
      d: points.join(' '),
      lastTotal: rounds[rounds.length - 1]?.totalsByPlayer[p.playerId] ?? 0,
    }
  })

  // Y-axis ticks
  const yTicks: number[] = []
  const step = Math.ceil(maxTotal / 5 / 10) * 10 || 10
  for (let v = 0; v <= maxTotal; v += step) yTicks.push(v)
  if (yTicks[yTicks.length - 1] < maxTotal) yTicks.push(Math.ceil(maxTotal / step) * step)

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', maxWidth: W, height: 'auto' }}>
        {/* Grid lines */}
        {yTicks.map(v => (
          <g key={v}>
            <line
              x1={PAD.left} y1={yScale(v)}
              x2={W - PAD.right} y2={yScale(v)}
              stroke={colors.border} strokeWidth={0.5} strokeDasharray="4,3"
            />
            <text x={PAD.left - 6} y={yScale(v) + 4} textAnchor="end" fontSize={10} fill={colors.fgMuted}>
              {v}
            </text>
          </g>
        ))}

        {/* X-axis labels */}
        {rounds.map((r, i) => (
          <text
            key={i}
            x={xScale(i)}
            y={H - 6}
            textAnchor="middle"
            fontSize={9}
            fill={colors.fgMuted}
          >
            {r.roundNumber}
          </text>
        ))}

        {/* Lines */}
        {lines.map(l => (
          <g key={l.playerId}>
            <polyline
              points={l.d}
              fill="none"
              stroke={l.color}
              strokeWidth={2.5}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {/* Dots */}
            {rounds.map((r, i) => {
              const total = r.totalsByPlayer[l.playerId] ?? 0
              return (
                <circle
                  key={i}
                  cx={xScale(i)}
                  cy={yScale(total)}
                  r={3}
                  fill={l.color}
                  stroke={colors.bg}
                  strokeWidth={1}
                />
              )
            })}
            {/* End label */}
            <text
              x={xScale(rounds.length - 1) + 6}
              y={yScale(l.lastTotal) + 4}
              fontSize={10}
              fontWeight={700}
              fill={l.color}
            >
              {l.lastTotal}
            </text>
          </g>
        ))}

        {/* X-axis label */}
        <text x={PAD.left + chartW / 2} y={H - 0} textAnchor="middle" fontSize={10} fill={colors.fgMuted}>
          Runde
        </text>
      </svg>
    </div>
  )
}

// ===== SVG Per-Round Bar Chart =====
function ShanghaiRoundBarChart({
  rounds,
  players,
  playerColors,
  colors,
  shanghaiRounds,
}: {
  rounds: ShanghaiRoundFinishedEvent[]
  players: ShanghaiPlayer[]
  playerColors: Record<string, string>
  colors: any
  shanghaiRounds: Set<number>
}) {
  if (rounds.length === 0) return null

  const playerCount = players.length
  const W = 580
  const H = 180
  const PAD = { top: 15, right: 10, bottom: 30, left: 35 }
  const chartW = W - PAD.left - PAD.right
  const chartH = H - PAD.top - PAD.bottom

  const maxRoundScore = Math.max(
    1,
    ...rounds.flatMap(r => players.map(p => r.scoresByPlayer[p.playerId] ?? 0))
  )

  const groupW = chartW / rounds.length
  const barW = Math.min(20, (groupW - 4) / playerCount)

  const yScale = (v: number) => PAD.top + chartH - (v / maxRoundScore) * chartH

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', maxWidth: W, height: 'auto' }}>
        {/* Y grid */}
        {[0, 0.25, 0.5, 0.75, 1].map(frac => {
          const v = Math.round(maxRoundScore * frac)
          return (
            <g key={frac}>
              <line
                x1={PAD.left} y1={yScale(v)}
                x2={W - PAD.right} y2={yScale(v)}
                stroke={colors.border} strokeWidth={0.5} strokeDasharray="3,3"
              />
              <text x={PAD.left - 4} y={yScale(v) + 3} textAnchor="end" fontSize={9} fill={colors.fgMuted}>
                {v}
              </text>
            </g>
          )
        })}

        {/* Bars */}
        {rounds.map((r, ri) => {
          const groupX = PAD.left + ri * groupW
          const isShanghaiRound = shanghaiRounds.has(r.roundNumber)

          return (
            <g key={ri}>
              {/* Shanghai highlight background */}
              {isShanghaiRound && (
                <rect
                  x={groupX}
                  y={PAD.top}
                  width={groupW}
                  height={chartH}
                  fill={colors.warning}
                  opacity={0.08}
                  rx={2}
                />
              )}
              {players.map((p, pi) => {
                const score = r.scoresByPlayer[p.playerId] ?? 0
                const barH = score > 0 ? Math.max(2, (score / maxRoundScore) * chartH) : 0
                const x = groupX + (groupW - playerCount * barW) / 2 + pi * barW
                return (
                  <rect
                    key={p.playerId}
                    x={x}
                    y={PAD.top + chartH - barH}
                    width={barW - 1}
                    height={barH}
                    fill={playerColors[p.playerId]}
                    opacity={0.85}
                    rx={1}
                  />
                )
              })}
              {/* X label */}
              <text
                x={groupX + groupW / 2}
                y={H - 8}
                textAnchor="middle"
                fontSize={9}
                fill={isShanghaiRound ? colors.warning : colors.fgMuted}
                fontWeight={isShanghaiRound ? 700 : 400}
              >
                {r.roundNumber}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

export default function ShanghaiMatchDetails({ matchId, onBack }: Props) {
  const { isArcade, colors } = useTheme()
  const styles = useMemo(() => getThemedUI(colors, isArcade), [colors, isArcade])

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

  const match = useMemo(() => getShanghaiMatchById(matchId), [matchId])
  const profiles = useMemo(() => getProfiles(), [])

  // Legs aus Events extrahieren
  const legs = useMemo<LegInfo[]>(() => {
    if (!match) return []
    const result: LegInfo[] = []
    let currentLeg: LegInfo | null = null

    for (const event of match.events) {
      if (event.type === 'ShanghaiLegStarted') {
        currentLeg = {
          legId: event.legId,
          legIndex: event.legIndex,
          setIndex: event.setIndex,
          shanghaiWin: false,
          finalScores: {},
          turns: [],
          rounds: [],
        }
      } else if (event.type === 'ShanghaiTurnAdded' && currentLeg) {
        currentLeg.turns.push(event)
      } else if (event.type === 'ShanghaiRoundFinished' && currentLeg) {
        currentLeg.rounds.push(event)
      } else if (event.type === 'ShanghaiLegFinished' && currentLeg) {
        currentLeg.winnerId = event.winnerId
        currentLeg.winnerName = match.players.find(p => p.playerId === event.winnerId)?.name
        currentLeg.shanghaiWin = event.shanghaiWin
        currentLeg.finalScores = event.finalScores
        result.push(currentLeg)
        currentLeg = null
      }
    }

    if (currentLeg && currentLeg.turns.length > 0) {
      result.push(currentLeg)
    }

    return result
  }, [match])

  const selectedLeg = selectedLegId ? legs.find(l => l.legId === selectedLegId) : null
  const selectedLegIndex = selectedLeg ? legs.findIndex(l => l.legId === selectedLegId) : -1

  if (!match) {
    return (
      <div style={styles.page}>
        <div style={styles.centerPage}>
          <div style={styles.centerInner}>
            <div style={styles.card}>
              <h2 style={{ margin: 0 }}>Match nicht gefunden</h2>
              <div style={{ marginTop: 10 }}>
                <button style={styles.backBtn} onClick={onBack}>← Zurueck</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const state = applyShanghaiEvents(match.events)

  // Spielerfarben aus Profilen oder Standardfarben
  const playerColors: Record<string, string> = {}
  match.players.forEach((p, idx) => {
    const profile = profiles.find((pr) => pr.id === p.playerId)
    playerColors[p.playerId] = profile?.color ?? PLAYER_COLORS[idx % PLAYER_COLORS.length]
  })

  // Format-Label
  let formatLabel = ''
  if (match.structure?.kind === 'legs' && match.structure.bestOfLegs > 1) {
    formatLabel = `First to ${Math.ceil(match.structure.bestOfLegs / 2)} Legs`
  } else if (match.structure?.kind === 'sets') {
    formatLabel = `First to ${Math.ceil(match.structure.bestOfSets / 2)} Sets (Best of ${Math.ceil(match.structure.legsPerSet / 2)} Legs)`
  }

  // Spielmodus-String
  const gameMode = `Shanghai ${match.structure?.kind === 'sets' ? 'S' : 'L'}`

  // Erweiterte Stats pro Spieler berechnen (fuer bestimmtes Leg oder gesamtes Match)
  function computePlayerStats(turns: ShanghaiTurnAddedEvent[], players: ShanghaiPlayer[], winnerId?: string | null) {
    return players.map((player) => {
      const pid = player.playerId
      const playerTurns = turns.filter(t => t.playerId === pid)
      let totalScore = 0, triples = 0, doubles = 0, singles = 0, misses = 0, totalDarts = 0, hits = 0, shanghaiCount = 0

      const roundScores: number[] = []
      let bestRound = { round: 0, score: -1 }
      let worstRound = { round: 0, score: Infinity }

      for (const turn of playerTurns) {
        totalScore += turn.turnScore
        roundScores.push(turn.turnScore)
        if (turn.isShanghai) shanghaiCount++
        if (turn.turnScore > bestRound.score) bestRound = { round: turn.targetNumber, score: turn.turnScore }
        if (turn.turnScore < worstRound.score) worstRound = { round: turn.targetNumber, score: turn.turnScore }
        for (const dart of turn.darts) {
          totalDarts++
          if (dart.target === 'MISS') { misses++ }
          else if (dart.target === turn.targetNumber) {
            hits++
            if (dart.mult === 3) triples++
            else if (dart.mult === 2) doubles++
            else singles++
          } else { misses++ }
        }
      }

      const hitRate = totalDarts > 0 ? (hits / totalDarts) * 100 : 0
      const avgPerRound = playerTurns.length > 0 ? totalScore / playerTurns.length : 0

      // Konsistenz
      let consistencyScore = 0
      if (roundScores.length > 1) {
        const mean = totalScore / roundScores.length
        const variance = roundScores.reduce((sum, s) => sum + Math.pow(s - mean, 2), 0) / roundScores.length
        consistencyScore = Math.sqrt(variance)
      }

      // Laengste Scoring-Streak
      let longestScoringStreak = 0
      let currentStreak = 0
      for (const s of roundScores) {
        if (s > 0) { currentStreak++; if (currentStreak > longestScoringStreak) longestScoringStreak = currentStreak }
        else currentStreak = 0
      }

      return {
        playerId: pid,
        name: player.name,
        totalScore,
        totalDarts,
        triples,
        doubles,
        singles,
        misses,
        hitRate,
        shanghaiCount,
        avgPerRound,
        bestRound: bestRound.score >= 0 ? bestRound : { round: 0, score: 0 },
        worstRound: worstRound.score < Infinity ? worstRound : { round: 0, score: 0 },
        consistencyScore,
        longestScoringStreak,
        isWinner: winnerId === pid,
      }
    })
  }

  // Helper: Shanghai-Runden ermitteln (Runden in denen ein Shanghai erzielt wurde)
  function getShanghaiRounds(turns: ShanghaiTurnAddedEvent[]): Set<number> {
    const result = new Set<number>()
    for (const t of turns) {
      if (t.isShanghai) result.add(t.targetNumber)
    }
    return result
  }

  // ===== LEG DETAIL VIEW =====
  if (selectedLeg) {
    const legStats = computePlayerStats(selectedLeg.turns, match.players, selectedLeg.winnerId)
    const shanghaiRounds = getShanghaiRounds(selectedLeg.turns)

    // Kumulativen Spielstand nach diesem Leg berechnen
    const cumulativeScore: Record<string, number> = {}
    match.players.forEach(p => { cumulativeScore[p.playerId] = 0 })
    for (let i = 0; i <= selectedLegIndex; i++) {
      const leg = legs[i]
      if (leg.winnerId) cumulativeScore[leg.winnerId]++
    }
    const scoreAfterLeg = match.players.map(p => cumulativeScore[p.playerId]).join(':')

    // Leg-Dauer
    let legDurationMs: number | undefined
    if (selectedLeg.turns.length >= 2) {
      const firstTs = selectedLeg.turns[0]?.ts
      const lastTs = selectedLeg.turns[selectedLeg.turns.length - 1]?.ts
      if (firstTs && lastTs) {
        legDurationMs = new Date(lastTs).getTime() - new Date(firstTs).getTime()
      }
    }

    return (
      <div style={styles.page}>
        <div style={styles.centerPage}>
          <div style={{ ...styles.centerInner, width: 'min(650px, 95vw)' }}>
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
              winnerId={selectedLeg.winnerId ?? undefined}
              scoreAfterLeg={scoreAfterLeg}
              legDurationMs={legDurationMs}
              onBack={() => setSelectedLegId(null)}
              onPrevLeg={() => {
                if (selectedLegIndex > 0) setSelectedLegId(legs[selectedLegIndex - 1].legId)
              }}
              onNextLeg={() => {
                if (selectedLegIndex < legs.length - 1) setSelectedLegId(legs[selectedLegIndex + 1].legId)
              }}
              hasPrev={selectedLegIndex > 0}
              hasNext={selectedLegIndex < legs.length - 1}
            />

            {/* Shanghai-Win Banner */}
            {selectedLeg.shanghaiWin && (
              <div style={{
                ...styles.card,
                textAlign: 'center',
                background: colors.warningBg,
                border: `2px solid ${colors.warning}`,
              }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: colors.warning }}>
                  SHANGHAI!
                </div>
                <div style={{ fontSize: 13, color: colors.fgDim, marginTop: 4 }}>
                  {selectedLeg.winnerName} gewinnt durch Shanghai-Wurf
                </div>
              </div>
            )}

            {/* Draw Banner */}
            {selectedLeg.winnerId === null && (
              <div style={{
                ...styles.card,
                textAlign: 'center',
                background: colors.bgMuted,
              }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: colors.fgDim }}>
                  Unentschieden
                </div>
              </div>
            )}

            {/* Leg-Statistiken (erweitert) */}
            <div style={styles.card}>
              <div style={{ fontWeight: 700, marginBottom: 12 }}>Leg-Statistiken</div>
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
                    <td style={{ ...tdLeft, fontWeight: 700 }}><StatTooltip label="Gesamt" tooltip={STAT_TOOLTIPS['Gesamt'] || 'Gesamt'} colors={colors} /></td>
                    {legStats.map((ps) => <td key={ps.playerId} style={{ ...tdRight, color: colors.accent, fontWeight: 800, fontSize: 16 }}>{ps.totalScore}</td>)}
                  </tr>
                  <tr>
                    <td style={tdLeft}><StatTooltip label="Darts" tooltip={STAT_TOOLTIPS['Darts'] || 'Darts'} colors={colors} /></td>
                    {legStats.map((ps) => <td key={ps.playerId} style={tdRight}>{ps.totalDarts}</td>)}
                  </tr>
                  <tr>
                    <td style={tdLeft}><StatTooltip label="Ø pro Runde" tooltip={STAT_TOOLTIPS['Ø pro Runde'] || 'Ø pro Runde'} colors={colors} /></td>
                    {legStats.map((ps) => <td key={ps.playerId} style={tdRight}>{ps.avgPerRound.toFixed(1)}</td>)}
                  </tr>
                  <tr>
                    <td style={tdLeft}><StatTooltip label="Beste Runde" tooltip={STAT_TOOLTIPS['Beste Runde'] || 'Beste Runde'} colors={colors} /></td>
                    {legStats.map((ps) => <td key={ps.playerId} style={{ ...tdRight, color: colors.success }}>{ps.bestRound.score > 0 ? `${ps.bestRound.score} (R${ps.bestRound.round})` : '-'}</td>)}
                  </tr>
                  <tr>
                    <td style={tdLeft}><StatTooltip label="Schlechteste" tooltip={STAT_TOOLTIPS['Schlechteste'] || 'Schlechteste'} colors={colors} /></td>
                    {legStats.map((ps) => <td key={ps.playerId} style={{ ...tdRight, color: colors.error }}>{ps.worstRound.round > 0 ? `${ps.worstRound.score} (R${ps.worstRound.round})` : '-'}</td>)}
                  </tr>
                  <tr><td colSpan={legStats.length + 1} style={{ borderBottom: `2px solid ${colors.border}`, padding: '4px 0' }}></td></tr>
                  <tr>
                    <td style={tdLeft}><StatTooltip label="Triples" tooltip={STAT_TOOLTIPS['Triples'] || 'Triples'} colors={colors} /></td>
                    {legStats.map((ps) => <td key={ps.playerId} style={tdRight}>{ps.triples}</td>)}
                  </tr>
                  <tr>
                    <td style={tdLeft}><StatTooltip label="Doubles" tooltip={STAT_TOOLTIPS['Doubles'] || 'Doubles'} colors={colors} /></td>
                    {legStats.map((ps) => <td key={ps.playerId} style={tdRight}>{ps.doubles}</td>)}
                  </tr>
                  <tr>
                    <td style={tdLeft}><StatTooltip label="Singles" tooltip={STAT_TOOLTIPS['Singles'] || 'Singles'} colors={colors} /></td>
                    {legStats.map((ps) => <td key={ps.playerId} style={tdRight}>{ps.singles}</td>)}
                  </tr>
                  <tr>
                    <td style={tdLeft}><StatTooltip label="Misses" tooltip={STAT_TOOLTIPS['Misses'] || 'Misses'} colors={colors} /></td>
                    {legStats.map((ps) => <td key={ps.playerId} style={tdRight}>{ps.misses}</td>)}
                  </tr>
                  <tr>
                    <td style={tdLeft}><StatTooltip label="Trefferquote" tooltip={STAT_TOOLTIPS['Trefferquote'] || 'Trefferquote'} colors={colors} /></td>
                    {legStats.map((ps) => <td key={ps.playerId} style={tdRight}>{ps.hitRate.toFixed(1)}%</td>)}
                  </tr>
                  <tr>
                    <td style={tdLeft}><StatTooltip label="Konsistenz" tooltip={STAT_TOOLTIPS['Konsist.'] || 'Konsistenz'} colors={colors} /></td>
                    {legStats.map((ps) => <td key={ps.playerId} style={tdRight}>{ps.consistencyScore.toFixed(1)}</td>)}
                  </tr>
                  <tr>
                    <td style={tdLeft}><StatTooltip label="Scoring-Streak" tooltip={STAT_TOOLTIPS['Scoring-Streak'] || 'Scoring-Streak'} colors={colors} /></td>
                    {legStats.map((ps) => <td key={ps.playerId} style={tdRight}>{ps.longestScoringStreak}</td>)}
                  </tr>
                  {legStats.some(ps => ps.shanghaiCount > 0) && (
                    <tr>
                      <td style={{ ...tdLeft, color: colors.warning, fontWeight: 600 }}><StatTooltip label="Shanghai" tooltip={STAT_TOOLTIPS['Shanghai'] || 'Shanghai'} colors={colors} /></td>
                      {legStats.map((ps) => <td key={ps.playerId} style={{ ...tdRight, color: ps.shanghaiCount > 0 ? colors.warning : colors.fgDim, fontWeight: ps.shanghaiCount > 0 ? 700 : 400 }}>{ps.shanghaiCount}x</td>)}
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Score Progression Chart */}
            {selectedLeg.rounds.length >= 2 && (
              <div style={styles.card}>
                <div style={{ fontWeight: 700, marginBottom: 12 }}>Punkteverlauf</div>
                <ShanghaiScoreProgressionChart
                  rounds={selectedLeg.rounds}
                  players={match.players}
                  playerColors={playerColors}
                  colors={colors}
                />
                {/* Legende */}
                <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginTop: 8, flexWrap: 'wrap' }}>
                  {match.players.map(p => (
                    <div key={p.playerId} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                      <div style={{ width: 12, height: 3, background: playerColors[p.playerId], borderRadius: 2 }} />
                      <span style={{ color: playerColors[p.playerId], fontWeight: 600 }}>{p.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Per-Round Bar Chart */}
            {selectedLeg.rounds.length > 0 && (
              <div style={styles.card}>
                <div style={{ fontWeight: 700, marginBottom: 12 }}>Punkte pro Runde</div>
                <ShanghaiRoundBarChart
                  rounds={selectedLeg.rounds}
                  players={match.players}
                  playerColors={playerColors}
                  colors={colors}
                  shanghaiRounds={shanghaiRounds}
                />
                {shanghaiRounds.size > 0 && (
                  <div style={{ fontSize: 11, color: colors.warning, textAlign: 'center', marginTop: 6 }}>
                    Hervorgehobene Runden: Shanghai erzielt
                  </div>
                )}
              </div>
            )}

            {/* Runden-Uebersicht (Tabelle mit Running Total) */}
            {selectedLeg.rounds.length > 0 && (
              <div style={styles.card}>
                <div style={{ fontWeight: 700, marginBottom: 12 }}>Runden-Uebersicht</div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ borderBottom: `2px solid ${colors.border}` }}>
                        <th style={{ textAlign: 'left', padding: '4px 6px', color: colors.fgMuted }}>Runde</th>
                        <th style={{ textAlign: 'left', padding: '4px 6px', color: colors.fgMuted }}>Ziel</th>
                        {match.players.map(p => (
                          <th key={p.playerId} style={{ textAlign: 'right', padding: '4px 6px', color: playerColors[p.playerId] }}>
                            {p.name}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {selectedLeg.rounds.map(round => {
                        const roundScores = match.players.map(p => round.scoresByPlayer[p.playerId] ?? 0)
                        const roundMax = Math.max(...roundScores)
                        const isShanghaiRound = shanghaiRounds.has(round.roundNumber)

                        return (
                          <tr
                            key={round.roundNumber}
                            style={{
                              borderBottom: `1px solid ${colors.border}`,
                              background: isShanghaiRound ? `${colors.warning}10` : undefined,
                            }}
                          >
                            <td style={{ padding: '4px 6px', fontWeight: 500, color: isShanghaiRound ? colors.warning : colors.fgDim }}>
                              R{round.roundNumber}
                              {isShanghaiRound && (
                                <span style={{
                                  marginLeft: 4,
                                  background: colors.warning,
                                  color: colors.bg,
                                  padding: '0px 4px',
                                  borderRadius: 3,
                                  fontSize: 9,
                                  fontWeight: 700,
                                }}>S!</span>
                              )}
                            </td>
                            <td style={{ padding: '4px 6px', color: colors.fgDim, fontWeight: 600 }}>
                              {round.roundNumber}
                            </td>
                            {match.players.map(p => {
                              const score = round.scoresByPlayer[p.playerId] ?? 0
                              const total = round.totalsByPlayer[p.playerId] ?? 0
                              const isBest = score > 0 && score === roundMax
                              return (
                                <td
                                  key={p.playerId}
                                  style={{
                                    textAlign: 'right',
                                    padding: '4px 6px',
                                    fontWeight: isBest ? 700 : 400,
                                    color: score === 0 ? colors.fgDim : (isBest ? colors.success : colors.fg),
                                  }}
                                >
                                  {score}
                                  <span style={{ color: colors.fgMuted, fontSize: 10, marginLeft: 4 }}>({total})</span>
                                </td>
                              )
                            })}
                          </tr>
                        )
                      })}
                      {/* Endscore */}
                      <tr style={{ borderTop: `2px solid ${colors.border}` }}>
                        <td colSpan={2} style={{ padding: '6px 6px', fontWeight: 700 }}>Gesamt</td>
                        {match.players.map(p => (
                          <td key={p.playerId} style={{ textAlign: 'right', padding: '6px 6px', fontWeight: 700, color: playerColors[p.playerId] }}>
                            {selectedLeg.finalScores[p.playerId] ?? legStats.find(s => s.playerId === p.playerId)?.totalScore ?? 0}
                          </td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Wurfabfolge */}
            <div style={styles.card}>
              <div style={{ fontWeight: 700, marginBottom: 12 }}>Wurfabfolge</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 400, overflowY: 'auto' }}>
                {selectedLeg.turns.length === 0 ? (
                  <div style={{ opacity: 0.6 }}>Keine Wuerfe in diesem Leg.</div>
                ) : (
                  selectedLeg.turns.map((turn, idx) => {
                    const player = match.players.find(p => p.playerId === turn.playerId)
                    const color = playerColors[turn.playerId] || colors.fgDim

                    return (
                      <div
                        key={turn.eventId || idx}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 12,
                          padding: '10px 12px',
                          background: turn.isShanghai ? `${colors.warning}20` : `${color}10`,
                          borderLeft: `4px solid ${turn.isShanghai ? colors.warning : color}`,
                          borderRadius: '0 6px 6px 0',
                          fontSize: 14,
                        }}
                      >
                        <span style={{ fontWeight: 700, minWidth: 80, color }}>{player?.name}</span>
                        <span style={{ minWidth: 30, color: colors.fgDim, fontSize: 12 }}>
                          R{turn.targetNumber}
                        </span>
                        <span style={{ minWidth: 90, fontFamily: 'monospace', fontSize: 12 }}>
                          {turn.darts.map(formatDart).join(' \u00B7 ')}
                        </span>
                        {turn.isShanghai ? (
                          <span style={{
                            fontWeight: 700,
                            color: colors.warning,
                            background: colors.warningBg,
                            padding: '2px 8px',
                            borderRadius: 4,
                            fontSize: 12,
                          }}>
                            SHANGHAI! ({turn.turnScore})
                          </span>
                        ) : turn.turnScore > 0 ? (
                          <span style={{
                            fontWeight: 600,
                            color: colors.success,
                            background: colors.successBg,
                            padding: '2px 8px',
                            borderRadius: 4,
                            fontSize: 12,
                          }}>
                            {turn.turnScore} Pkt
                          </span>
                        ) : (
                          <span style={{ color: colors.fgMuted, fontSize: 12 }}>0 Pkt</span>
                        )}
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ===== MATCH OVERVIEW =====
  const allTurns = match.events.filter(
    (e): e is ShanghaiTurnAddedEvent => e.type === 'ShanghaiTurnAdded'
  )
  const matchStats = computePlayerStats(allTurns, match.players, match.winnerId)
  const shanghaiRounds = getShanghaiRounds(allTurns)

  // Leg-Siege
  const legWinsPerPlayer: Record<string, number> = {}
  match.players.forEach(p => { legWinsPerPlayer[p.playerId] = 0 })
  legs.forEach(leg => {
    if (leg.winnerId) legWinsPerPlayer[leg.winnerId]++
  })

  const legScore = match.players.map(p => legWinsPerPlayer[p.playerId]).join(':')

  // Sets-Score
  let setScore: string | undefined
  if (match.structure?.kind === 'sets') {
    const setWinsPerPlayer: Record<string, number> = {}
    match.players.forEach(p => { setWinsPerPlayer[p.playerId] = 0 })
    for (const ev of match.events) {
      if (ev.type === 'ShanghaiSetFinished') {
        const wid = ev.winnerId
        if (wid in setWinsPerPlayer) setWinsPerPlayer[wid]++
      }
    }
    setScore = match.players.map(p => setWinsPerPlayer[p.playerId]).join(':')
  }

  // Runden-Uebersicht (alle Legs zusammen)
  const allRounds = match.events.filter(
    (e): e is ShanghaiRoundFinishedEvent => e.type === 'ShanghaiRoundFinished'
  )

  // Shanghai-Highlights zaehlen
  const totalShanghais = matchStats.reduce((sum, ps) => sum + ps.shanghaiCount, 0)

  // Match-Header Info
  const totalDartsAll = matchStats.reduce((sum, ps) => sum + ps.totalDarts, 0)
  const roundsPlayed = allRounds.length

  return (
    <div style={styles.page}>
      <div style={styles.centerPage}>
        <div style={{ ...styles.centerInner, width: 'min(650px, 95vw)' }}>
          {/* Match-Header */}
          <MatchHeader
            gameName={match.title}
            gameMode={gameMode}
            players={match.players.map(p => ({
              id: p.playerId,
              name: p.name,
              color: playerColors[p.playerId],
              legsWon: legWinsPerPlayer[p.playerId],
            }))}
            winnerId={match.winnerId ?? undefined}
            legScore={legScore}
            setScore={setScore}
            durationMs={match.durationMs}
            playedAt={match.createdAt}
            onBack={onBack}
          />

          {/* Match-Info Kacheln */}
          <div style={styles.card}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, textAlign: 'center' }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 700, color: colors.fg }}>
                  {formatDuration(match.durationMs ?? 0)}
                </div>
                <div style={{ fontSize: 11, color: colors.fgMuted }}>Dauer</div>
              </div>
              <div>
                <div style={{ fontSize: 18, fontWeight: 700, color: colors.accent }}>
                  {totalDartsAll}
                </div>
                <div style={{ fontSize: 11, color: colors.fgMuted }}>Darts</div>
              </div>
              <div>
                <div style={{ fontSize: 18, fontWeight: 700, color: colors.fgDim }}>
                  {roundsPlayed}
                </div>
                <div style={{ fontSize: 11, color: colors.fgMuted }}>Runden</div>
              </div>
              <div>
                <div style={{ fontSize: 18, fontWeight: 700, color: colors.fg }}>
                  {match.players.length}
                </div>
                <div style={{ fontSize: 11, color: colors.fgMuted }}>Spieler</div>
              </div>
            </div>
          </div>

          {/* Draw Banner */}
          {match.finished && (match.winnerId === null || match.winnerId === undefined) && (
            <div style={{
              ...styles.card,
              textAlign: 'center',
              background: colors.bgMuted,
            }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: colors.fgDim }}>
                Unentschieden
              </div>
            </div>
          )}

          {/* Shanghai-Highlights */}
          {totalShanghais > 0 && (
            <div style={{ ...styles.card, textAlign: 'center' }}>
              <div style={{ fontWeight: 700, marginBottom: 8, color: colors.warning }}>Shanghai-Highlights</div>
              <div style={{ display: 'flex', justifyContent: 'center', gap: 20, flexWrap: 'wrap' }}>
                {matchStats.filter(ps => ps.shanghaiCount > 0).map(ps => (
                  <div key={ps.playerId} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 10, height: 10, borderRadius: 2, background: playerColors[ps.playerId] }} />
                    <span style={{ fontWeight: 600, color: playerColors[ps.playerId] }}>{ps.name}</span>
                    <span style={{
                      background: colors.warning,
                      color: colors.bg,
                      padding: '1px 6px',
                      borderRadius: 4,
                      fontSize: 12,
                      fontWeight: 700,
                    }}>
                      {ps.shanghaiCount}x Shanghai
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Spielbericht */}
          {(() => {
            const report = generateShanghaiReport({
              matchId,
              players: match.players.map(p => ({ id: p.playerId, name: p.name })),
              winnerId: match.winnerId,
              rankings: matchStats.map(ps => ({
                playerId: ps.playerId,
                name: ps.name,
                totalScore: ps.totalScore,
                avgPerRound: ps.avgPerRound,
                bestRound: ps.bestRound,
                worstRound: ps.worstRound,
                shanghaiCount: ps.shanghaiCount,
                hitRate: ps.hitRate,
                longestScoringStreak: ps.longestScoringStreak,
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

          {/* Match-Statistik (erweitert) */}
          <div style={styles.card}>
            <div style={{ fontWeight: 700, marginBottom: 12 }}>Match-Statistik</div>
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
                  <td style={{ ...tdLeft, fontWeight: 700 }}><StatTooltip label="Gesamt" tooltip={STAT_TOOLTIPS['Gesamt'] || 'Gesamt'} colors={colors} /></td>
                  {matchStats.map((ps) => <td key={ps.playerId} style={{ ...tdRight, color: colors.accent, fontWeight: 800, fontSize: 16 }}>{ps.totalScore}</td>)}
                </tr>
                <tr>
                  <td style={tdLeft}><StatTooltip label="Darts" tooltip={STAT_TOOLTIPS['Darts'] || 'Darts'} colors={colors} /></td>
                  {matchStats.map((ps) => <td key={ps.playerId} style={tdRight}>{ps.totalDarts}</td>)}
                </tr>
                <tr>
                  <td style={tdLeft}><StatTooltip label="Ø pro Runde" tooltip={STAT_TOOLTIPS['Ø pro Runde'] || 'Ø pro Runde'} colors={colors} /></td>
                  {matchStats.map((ps) => <td key={ps.playerId} style={tdRight}>{ps.avgPerRound.toFixed(1)}</td>)}
                </tr>
                <tr>
                  <td style={tdLeft}><StatTooltip label="Beste Runde" tooltip={STAT_TOOLTIPS['Beste Runde'] || 'Beste Runde'} colors={colors} /></td>
                  {matchStats.map((ps) => <td key={ps.playerId} style={{ ...tdRight, color: colors.success }}>{ps.bestRound.score > 0 ? `${ps.bestRound.score} (R${ps.bestRound.round})` : '-'}</td>)}
                </tr>
                <tr>
                  <td style={tdLeft}><StatTooltip label="Schlechteste" tooltip={STAT_TOOLTIPS['Schlechteste'] || 'Schlechteste'} colors={colors} /></td>
                  {matchStats.map((ps) => <td key={ps.playerId} style={{ ...tdRight, color: colors.error }}>{ps.worstRound.round > 0 ? `${ps.worstRound.score} (R${ps.worstRound.round})` : '-'}</td>)}
                </tr>
                <tr><td colSpan={matchStats.length + 1} style={{ borderBottom: `2px solid ${colors.border}`, padding: '4px 0' }}></td></tr>
                {matchStats.some(ps => ps.shanghaiCount > 0) && (
                  <tr>
                    <td style={{ ...tdLeft, color: colors.warning, fontWeight: 600 }}><StatTooltip label="Shanghai" tooltip={STAT_TOOLTIPS['Shanghai'] || 'Shanghai'} colors={colors} /></td>
                    {matchStats.map((ps) => <td key={ps.playerId} style={{ ...tdRight, color: ps.shanghaiCount > 0 ? colors.warning : colors.fgDim, fontWeight: ps.shanghaiCount > 0 ? 700 : 400 }}>{ps.shanghaiCount}x</td>)}
                  </tr>
                )}
                <tr>
                  <td style={tdLeft}><StatTooltip label="Triples" tooltip={STAT_TOOLTIPS['Triples'] || 'Triples'} colors={colors} /></td>
                  {matchStats.map((ps) => <td key={ps.playerId} style={tdRight}>{ps.triples}</td>)}
                </tr>
                <tr>
                  <td style={tdLeft}><StatTooltip label="Doubles" tooltip={STAT_TOOLTIPS['Doubles'] || 'Doubles'} colors={colors} /></td>
                  {matchStats.map((ps) => <td key={ps.playerId} style={tdRight}>{ps.doubles}</td>)}
                </tr>
                <tr>
                  <td style={tdLeft}><StatTooltip label="Singles" tooltip={STAT_TOOLTIPS['Singles'] || 'Singles'} colors={colors} /></td>
                  {matchStats.map((ps) => <td key={ps.playerId} style={tdRight}>{ps.singles}</td>)}
                </tr>
                <tr>
                  <td style={tdLeft}><StatTooltip label="Misses" tooltip={STAT_TOOLTIPS['Misses'] || 'Misses'} colors={colors} /></td>
                  {matchStats.map((ps) => <td key={ps.playerId} style={tdRight}>{ps.misses}</td>)}
                </tr>
                <tr>
                  <td style={tdLeft}><StatTooltip label="Trefferquote" tooltip={STAT_TOOLTIPS['Trefferquote'] || 'Trefferquote'} colors={colors} /></td>
                  {matchStats.map((ps) => <td key={ps.playerId} style={tdRight}>{ps.hitRate.toFixed(1)}%</td>)}
                </tr>
                <tr>
                  <td style={tdLeft}><StatTooltip label="Konsistenz" tooltip={STAT_TOOLTIPS['Konsist.'] || 'Konsistenz'} colors={colors} /></td>
                  {matchStats.map((ps) => <td key={ps.playerId} style={tdRight}>{ps.consistencyScore.toFixed(1)}</td>)}
                </tr>
                <tr>
                  <td style={tdLeft}><StatTooltip label="Scoring-Streak" tooltip={STAT_TOOLTIPS['Scoring-Streak'] || 'Scoring-Streak'} colors={colors} /></td>
                  {matchStats.map((ps) => <td key={ps.playerId} style={tdRight}>{ps.longestScoringStreak}</td>)}
                </tr>
              </tbody>
            </table>
          </div>

          {/* Score Progression Chart */}
          {allRounds.length >= 2 && (
            <div style={styles.card}>
              <div style={{ fontWeight: 700, marginBottom: 12 }}>Punkteverlauf</div>
              <ShanghaiScoreProgressionChart
                rounds={allRounds}
                players={match.players}
                playerColors={playerColors}
                colors={colors}
              />
              {/* Legende */}
              <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginTop: 8, flexWrap: 'wrap' }}>
                {match.players.map(p => (
                  <div key={p.playerId} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                    <div style={{ width: 12, height: 3, background: playerColors[p.playerId], borderRadius: 2 }} />
                    <span style={{ color: playerColors[p.playerId], fontWeight: 600 }}>{p.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Per-Round Bar Chart */}
          {allRounds.length > 0 && (
            <div style={styles.card}>
              <div style={{ fontWeight: 700, marginBottom: 12 }}>Punkte pro Runde</div>
              <ShanghaiRoundBarChart
                rounds={allRounds}
                players={match.players}
                playerColors={playerColors}
                colors={colors}
                shanghaiRounds={shanghaiRounds}
              />
              {shanghaiRounds.size > 0 && (
                <div style={{ fontSize: 11, color: colors.warning, textAlign: 'center', marginTop: 6 }}>
                  Hervorgehobene Runden: Shanghai erzielt
                </div>
              )}
            </div>
          )}

          {/* Runden-Uebersicht Tabelle (mit Running Total) */}
          {allRounds.length > 0 && (
            <div style={styles.card}>
              <div style={{ fontWeight: 700, marginBottom: 12 }}>Runden-Uebersicht</div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: `2px solid ${colors.border}` }}>
                      <th style={{ textAlign: 'left', padding: '4px 6px', color: colors.fgMuted }}>Runde</th>
                      <th style={{ textAlign: 'left', padding: '4px 6px', color: colors.fgMuted }}>Ziel</th>
                      {match.players.map(p => (
                        <th key={p.playerId} style={{ textAlign: 'right', padding: '4px 6px', color: playerColors[p.playerId] }}>
                          {p.name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {allRounds.map(round => {
                      const roundScores = match.players.map(p => round.scoresByPlayer[p.playerId] ?? 0)
                      const roundMax = Math.max(...roundScores)
                      const isShanghaiRound = shanghaiRounds.has(round.roundNumber)

                      return (
                        <tr
                          key={round.roundNumber}
                          style={{
                            borderBottom: `1px solid ${colors.border}`,
                            background: isShanghaiRound ? `${colors.warning}10` : undefined,
                          }}
                        >
                          <td style={{ padding: '4px 6px', fontWeight: 500, color: isShanghaiRound ? colors.warning : colors.fgDim }}>
                            R{round.roundNumber}
                            {isShanghaiRound && (
                              <span style={{
                                marginLeft: 4,
                                background: colors.warning,
                                color: colors.bg,
                                padding: '0px 4px',
                                borderRadius: 3,
                                fontSize: 9,
                                fontWeight: 700,
                              }}>S!</span>
                            )}
                          </td>
                          <td style={{ padding: '4px 6px', color: colors.fgDim, fontWeight: 600 }}>
                            {round.roundNumber}
                          </td>
                          {match.players.map(p => {
                            const score = round.scoresByPlayer[p.playerId] ?? 0
                            const total = round.totalsByPlayer[p.playerId] ?? 0
                            const isBest = score > 0 && score === roundMax
                            return (
                              <td
                                key={p.playerId}
                                style={{
                                  textAlign: 'right',
                                  padding: '4px 6px',
                                  fontWeight: isBest ? 700 : 400,
                                  color: score === 0 ? colors.fgDim : (isBest ? colors.success : colors.fg),
                                }}
                              >
                                {score}
                                <span style={{ color: colors.fgMuted, fontSize: 10, marginLeft: 4 }}>({total})</span>
                              </td>
                            )
                          })}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Legs Liste */}
          <div style={styles.card}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Legs</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {legs.length === 0 ? (
                <div style={{ opacity: 0.6 }}>Keine Legs vorhanden.</div>
              ) : (
                (() => {
                  const cumulativeScore: Record<string, number> = {}
                  match.players.forEach(p => { cumulativeScore[p.playerId] = 0 })

                  return legs.map((leg) => {
                    if (leg.winnerId) cumulativeScore[leg.winnerId]++
                    const scoreAfterLeg = match.players.map(p => cumulativeScore[p.playerId]).join(':')

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
                        {leg.shanghaiWin && (
                          <span style={{
                            background: colors.warning,
                            color: colors.bg,
                            padding: '1px 6px',
                            borderRadius: 4,
                            fontSize: 11,
                            fontWeight: 700,
                          }}>
                            Shanghai!
                          </span>
                        )}
                        <span style={{ flex: 1 }} />
                        {leg.winnerName ? (
                          <span style={{ fontWeight: 600, color: playerColors[leg.winnerId!] }}>{leg.winnerName}</span>
                        ) : leg.winnerId === null ? (
                          <span style={{ color: colors.fgDim, fontWeight: 500 }}>Unentschieden</span>
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
        </div>
      </div>
    </div>
  )
}
