// src/screens/CricketMatchDetails.tsx
// Vollständige Cricket Match-Details Ansicht (analog zu MatchDetails.tsx für X01)
// Zeigt umfassende Statistiken, Charts und Leg-Details

import React, { useMemo, useState } from 'react'
import { getThemedUI } from '../ui'
import { useTheme } from '../ThemeProvider'
import { getCricketComputedStats, getCricketMatchById, getProfiles } from '../storage'
import type { CricketMatchComputedStats } from '../types/stats'
import {
  targetsFor,
  type CricketEvent,
  type CricketTurnAdded,
  type CricketLegFinished,
  type CricketMatchStarted,
  type CricketMatchFinished,
} from '../dartsCricket'
import MatchHeader from '../components/MatchHeader'
import { generateCricketMatchReport } from '../narratives/generateModeReports'
import LegHeader from '../components/LegHeader'
import { PLAYER_COLORS } from '../components/ScoreProgressionChart'
import StatTooltip, { STAT_TOOLTIPS } from '../components/StatTooltip'

type Props = {
  matchId: string
  onBack: () => void
}

function fmtFixed2(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return '\u2014'
  return n.toFixed(2)
}

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

function computeLegDuration(events: CricketEvent[], legIndex: number): number | undefined {
  let currentLeg = 0
  let legStartTs: string | null = null
  let legEndTs: string | null = null

  for (const ev of events) {
    if (ev.type === 'CricketLegFinished') {
      if (currentLeg === legIndex) {
        legEndTs = ev.ts
        break
      }
      currentLeg++
      legStartTs = null
      continue
    }

    if (ev.type === 'CricketTurnAdded' && currentLeg === legIndex) {
      if (!legStartTs) legStartTs = ev.ts
      legEndTs = ev.ts
    }
  }

  if (!legStartTs || !legEndTs) return undefined
  const diffMs = new Date(legEndTs).getTime() - new Date(legStartTs).getTime()
  return diffMs >= 0 ? diffMs : undefined
}

function fmtDart(d: { target: number | 'BULL' | 'MISS'; mult: 1 | 2 | 3 }): string {
  if (d.target === 'MISS') return 'Miss'
  if (d.target === 'BULL') return d.mult === 2 ? 'Bull' : '25'
  const prefix = d.mult === 3 ? 'T' : d.mult === 2 ? 'D' : 'S'
  return `${prefix}${d.target}`
}

// Berechnet Marks die durch einen Dart neu geschlossen werden
function calcNewMarks(
  darts: CricketTurnAdded['darts'],
  marksBefore: Record<string, number>,
  validTargets: Set<string>
): { marksText: string; totalNewMarks: number } {
  const newMarks: Record<string, number> = {}
  const currentMarks = { ...marksBefore }

  for (const d of darts) {
    if (d.target === 'MISS') continue
    const tKey = String(d.target)
    if (!validTargets.has(tKey)) continue
    const before = currentMarks[tKey] ?? 0
    if (before >= 3) continue
    const mult = d.target === 'BULL' && d.mult === 3 ? 2 : d.mult
    const added = Math.min(mult, 3 - before)
    currentMarks[tKey] = before + added
    newMarks[tKey] = (newMarks[tKey] ?? 0) + added
  }

  const parts: string[] = []
  for (const [t, count] of Object.entries(newMarks)) {
    if (count > 0) parts.push(`${t} (${count}x)`)
  }
  const totalNewMarks = Object.values(newMarks).reduce((a, b) => a + b, 0)
  return { marksText: parts.join(', ') || '\u2014', totalNewMarks }
}

// Berechnet Punkte die durch einen Turn erzielt werden
function calcTurnPoints(
  darts: CricketTurnAdded['darts'],
  marksBefore: Record<string, number>,
  style: 'standard' | 'cutthroat' | 'simple' | 'crazy',
  validTargets: Set<string>,
  allPlayersMarks: Record<string, Record<string, number>>,
  playerId: string,
  allPlayers: string[]
): number {
  if (style === 'simple' || style === 'crazy') return 0
  let points = 0
  const currentMarks = { ...marksBefore }

  for (const d of darts) {
    if (d.target === 'MISS') continue
    const tKey = String(d.target)
    if (!validTargets.has(tKey)) continue
    const before = currentMarks[tKey] ?? 0
    const mult = d.target === 'BULL' && d.mult === 3 ? 2 : d.mult
    const value = tKey === 'BULL' ? 25 : parseInt(tKey, 10)

    if (before >= 3) {
      const opponents = allPlayers.filter(p => p !== playerId)
      const anyOpen = opponents.some(op => (allPlayersMarks[op]?.[tKey] ?? 0) < 3)
      if (anyOpen && style === 'standard') points += mult * value
    } else {
      const added = Math.min(mult, 3 - before)
      currentMarks[tKey] = before + added
      const overflow = mult - added
      if (overflow > 0) {
        const opponents = allPlayers.filter(p => p !== playerId)
        const anyOpen = opponents.some(op => (allPlayersMarks[op]?.[tKey] ?? 0) < 3)
        if (anyOpen && style === 'standard') points += overflow * value
      }
    }
  }
  return points
}

// Events fuer ein bestimmtes Leg extrahieren
function getEventsForLeg(allEvents: CricketEvent[], legIndex: number): CricketEvent[] {
  const result: CricketEvent[] = []
  let currentLeg = 0
  for (const ev of allEvents) {
    if (ev.type === 'CricketLegFinished') {
      if (currentLeg === legIndex) return result
      currentLeg++
      continue
    }
    if (currentLeg === legIndex && ev.type === 'CricketTurnAdded') {
      result.push(ev)
    }
  }
  return result
}

// Per-field marks berechnen fuer ein Leg
function computeFieldMarksForLeg(
  events: CricketEvent[],
  legIndex: number,
  players: string[],
  range: 'short' | 'long'
): Record<string, Record<string, number>> {
  const tKeys = targetsFor(range).map(String)
  const marksByPlayer: Record<string, Record<string, number>> = {}
  players.forEach(pid => {
    marksByPlayer[pid] = {}
    tKeys.forEach(t => { marksByPlayer[pid][t] = 0 })
  })

  let currentLeg = 0
  for (const ev of events) {
    if (ev.type === 'CricketLegFinished') {
      if (currentLeg === legIndex) break
      currentLeg++
      players.forEach(pid => { tKeys.forEach(t => { marksByPlayer[pid][t] = 0 }) })
      continue
    }
    if (ev.type !== 'CricketTurnAdded' || currentLeg !== legIndex) continue
    const turn = ev as CricketTurnAdded
    const pid = turn.playerId
    for (const d of turn.darts) {
      if (d.target === 'MISS') continue
      const tKey = String(d.target)
      if (!tKeys.includes(tKey)) continue
      const before = marksByPlayer[pid][tKey] ?? 0
      const mult = d.target === 'BULL' && d.mult === 3 ? 2 : d.mult
      marksByPlayer[pid][tKey] = (marksByPlayer[pid][tKey] ?? 0) + mult // Alle Marks zaehlen, nicht nur bis 3
    }
  }
  return marksByPlayer
}

// Turns fuer ein bestimmtes Leg
function getLegTurns(events: CricketEvent[], legIdx: number): CricketTurnAdded[] {
  const turns: CricketTurnAdded[] = []
  let currentLeg = 0
  for (const ev of events) {
    if (ev.type === 'CricketLegFinished') { currentLeg++; continue }
    if (ev.type === 'CricketTurnAdded' && currentLeg === legIdx) turns.push(ev)
  }
  return turns
}

export default function CricketMatchDetails({ matchId, onBack }: Props) {
  const { isArcade, colors } = useTheme()
  const styles = useMemo(() => getThemedUI(colors, isArcade), [colors, isArcade])

  const card: React.CSSProperties = {
    border: `1px solid ${colors.border}`,
    background: colors.bgCard,
    borderRadius: 14,
    boxShadow: '0 1px 2px rgba(0,0,0,0.04), 0 10px 20px rgba(0,0,0,0.03)',
    padding: 14,
    display: 'grid',
    gap: 10,
    maxWidth: 700,
    margin: '0 auto',
  }
  const thLeft: React.CSSProperties = { textAlign: 'left', fontSize: 13, fontWeight: 600, color: colors.fgDim, padding: '10px 14px', borderBottom: `2px solid ${colors.border}` }
  const thCenter: React.CSSProperties = { textAlign: 'center', fontSize: 13, fontWeight: 700, color: colors.fg, padding: '10px 14px', borderBottom: `2px solid ${colors.border}` }
  const tdLeft: React.CSSProperties = { padding: '10px 14px', borderBottom: `1px solid ${colors.bgMuted}`, fontWeight: 500, color: colors.fg }
  const tdCenter: React.CSSProperties = { padding: '10px 14px', borderBottom: `1px solid ${colors.bgMuted}`, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }

  const [selectedLegIndex, setSelectedLegIndex] = useState<number | null>(null)

  const stats: CricketMatchComputedStats | null = useMemo(() => {
    try { return getCricketComputedStats(matchId) || null } catch { return null }
  }, [matchId])

  const matchData = useMemo(() => getCricketMatchById(matchId), [matchId])
  const profiles = useMemo(() => getProfiles(), [])

  if (!stats || !matchData) {
    return (
      <div style={styles.page}>
        <div style={styles.headerRow}>
          <div>
            <h2 style={{ margin: 0 }}>Cricket Match Details</h2>
            <div style={styles.sub}>Keine Daten gefunden.</div>
          </div>
          <button style={styles.backBtn} onClick={onBack}>&larr; Zurueck</button>
        </div>
      </div>
    )
  }

  const events = matchData.events as CricketEvent[]
  const startEvt = events.find(e => e.type === 'CricketMatchStarted') as CricketMatchStarted | undefined
  if (!startEvt) return null

  const players = stats.players
  const allPlayerIds = startEvt.players.map(p => p.playerId)
  const validTargets = new Set(targetsFor(startEvt.range).map(String))
  const tKeys = targetsFor(startEvt.range).map(String)

  // Spielerfarben aus Profilen
  const playerColors: Record<string, string> = {}
  const playerNames: Record<string, string> = {}
  matchData.players.forEach(p => {
    const profile = profiles.find(pr => pr.id === p.id)
    playerColors[p.id] = profile?.color ?? colors.fgDim
    playerNames[p.id] = p.name
  })

  // Legs
  const legFinished = events.filter(e => e.type === 'CricketLegFinished') as CricketLegFinished[]
  const matchEndEvent = events.find(e => e.type === 'CricketMatchFinished') as CricketMatchFinished | undefined

  // Spielmodus-String
  const gameMode = `Cricket ${startEvt.range === 'short' ? 'Short' : 'Long'} ${
    startEvt.style === 'crazy' ? 'Crazy'
    : startEvt.style.charAt(0).toUpperCase() + startEvt.style.slice(1)
  }`

  // Legs pro Spieler
  const legWinsPerPlayer: Record<string, number> = {}
  matchData.players.forEach(p => { legWinsPerPlayer[p.id] = 0 })
  legFinished.forEach(lf => { if (lf.winnerPlayerId) legWinsPerPlayer[lf.winnerPlayerId]++ })
  const legScore = matchData.players.map(p => legWinsPerPlayer[p.id]).join(':')

  // Match-Dauer
  let matchDurationMs: number | undefined
  if (startEvt?.ts && matchEndEvent?.ts) {
    matchDurationMs = new Date(matchEndEvent.ts).getTime() - new Date(startEvt.ts).getTime()
  }

  // ========================================
  // LEG DETAIL VIEW
  // ========================================
  if (selectedLegIndex !== null) {
    const legTurns = getLegTurns(events, selectedLegIndex)
    const legFinish = legFinished[selectedLegIndex]

    // Leg-Stats berechnen
    type LegPlayerStats = {
      totalMarks: number
      totalPoints: number
      turns: number
      totalDarts: number
      triplesHit: number
      doublesHit: number
      singlesHit: number
      bestTurnMarks: number
      bestTurnPoints: number
      bullHitsSingle: number
      bullHitsDouble: number
      hits: number
      misses: number
      fieldsClosed: number
      marksPerField: Record<string, number>
    }
    const legStatsByPlayer: Record<string, LegPlayerStats> = {}
    allPlayerIds.forEach(pid => {
      legStatsByPlayer[pid] = {
        totalMarks: 0, totalPoints: 0, turns: 0, totalDarts: 0,
        triplesHit: 0, doublesHit: 0, singlesHit: 0,
        bestTurnMarks: 0, bestTurnPoints: 0,
        bullHitsSingle: 0, bullHitsDouble: 0,
        hits: 0, misses: 0, fieldsClosed: 0,
        marksPerField: Object.fromEntries(tKeys.map(t => [t, 0])),
      }
    })

    // Marks-Tracking
    const marksByPlayer: Record<string, Record<string, number>> = {}
    allPlayerIds.forEach(pid => {
      marksByPlayer[pid] = {}
      validTargets.forEach(t => { marksByPlayer[pid][t] = 0 })
    })

    // Wurfabfolge aufbauen
    type TurnRow = {
      round: number
      playerId: string
      playerName: string
      darts: string[]
      marksText: string
      newMarks: number
      newPoints: number
      totalScore: number
    }
    const turnRows: TurnRow[] = []
    let roundNum = 0
    let lastPlayerIdx = -1

    for (const turn of legTurns) {
      const playerIdx = allPlayerIds.indexOf(turn.playerId)
      if (playerIdx <= lastPlayerIdx || lastPlayerIdx === -1) roundNum++
      lastPlayerIdx = playerIdx

      const darts = turn.darts.map(fmtDart)
      const { marksText, totalNewMarks } = calcNewMarks(turn.darts, marksByPlayer[turn.playerId], validTargets)
      const newPoints = calcTurnPoints(
        turn.darts, marksByPlayer[turn.playerId], startEvt.style,
        validTargets, marksByPlayer, turn.playerId, allPlayerIds
      )

      // Marks aktualisieren
      for (const d of turn.darts) {
        if (d.target === 'MISS') continue
        const tKey = String(d.target)
        if (!validTargets.has(tKey)) continue
        const before = marksByPlayer[turn.playerId][tKey] ?? 0
        if (before >= 3) continue
        const mult = d.target === 'BULL' && d.mult === 3 ? 2 : d.mult
        marksByPlayer[turn.playerId][tKey] = Math.min(3, before + mult)
      }

      // Stats aktualisieren
      const ps = legStatsByPlayer[turn.playerId]
      ps.totalMarks += totalNewMarks
      ps.totalPoints += newPoints
      ps.turns++
      ps.totalDarts += turn.darts.length
      if (totalNewMarks > ps.bestTurnMarks) ps.bestTurnMarks = totalNewMarks
      if (newPoints > ps.bestTurnPoints) ps.bestTurnPoints = newPoints

      for (const d of turn.darts) {
        if (d.target === 'MISS') {
          ps.misses++
          continue
        }
        const tKey = String(d.target)
        if (!validTargets.has(tKey)) {
          ps.misses++
          continue
        }
        ps.hits++
        if (d.target === 'BULL') {
          if (d.mult === 2 || d.mult === 3) ps.bullHitsDouble++
          else ps.bullHitsSingle++
        }
        if (d.mult === 3) ps.triplesHit++
        else if (d.mult === 2) ps.doublesHit++
        else ps.singlesHit++

        // Per-field marks (total, inkl. ueber 3 hinaus)
        const mult = d.target === 'BULL' && d.mult === 3 ? 2 : d.mult
        ps.marksPerField[tKey] = (ps.marksPerField[tKey] ?? 0) + mult
      }

      turnRows.push({
        round: roundNum,
        playerId: turn.playerId,
        playerName: playerNames[turn.playerId] ?? turn.playerId,
        darts,
        marksText,
        newMarks: totalNewMarks,
        newPoints,
        totalScore: ps.totalPoints,
      })
    }

    // Fields closed zaehlen
    allPlayerIds.forEach(pid => {
      legStatsByPlayer[pid].fieldsClosed = tKeys.filter(t => (marksByPlayer[pid][t] ?? 0) >= 3).length
    })

    // Zwischenstand nach diesem Leg
    const cumulativeScore: Record<string, number> = {}
    matchData.players.forEach(p => { cumulativeScore[p.id] = 0 })
    for (let i = 0; i <= selectedLegIndex; i++) {
      const lf = legFinished[i]
      if (lf?.winnerPlayerId) cumulativeScore[lf.winnerPlayerId]++
    }
    const scoreAfterThisLeg = matchData.players.map(p => cumulativeScore[p.id]).join(':')

    const legDurationMs = computeLegDuration(events, selectedLegIndex)

    return (
      <div style={styles.page}>
        <div style={{ maxWidth: 700, margin: '0 auto', padding: '0 10px' }}>
          <LegHeader
            legNumber={selectedLegIndex + 1}
            gameName={matchData.matchName}
            gameMode={gameMode}
            players={matchData.players.map(p => ({
              id: p.id, name: p.name, color: playerColors[p.id],
            }))}
            winnerId={legFinish?.winnerPlayerId}
            scoreAfterLeg={scoreAfterThisLeg}
            legDurationMs={legDurationMs}
            onBack={() => setSelectedLegIndex(null)}
            onPrevLeg={() => { if (selectedLegIndex > 0) setSelectedLegIndex(selectedLegIndex - 1) }}
            onNextLeg={() => { if (selectedLegIndex < legFinished.length - 1) setSelectedLegIndex(selectedLegIndex + 1) }}
            hasPrev={selectedLegIndex > 0}
            hasNext={selectedLegIndex < legFinished.length - 1}
          />

          {/* Leg-Statistik */}
          <div style={card}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>Leg-Statistik</div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={thLeft}></th>
                    {matchData.players.map(p => (
                      <th key={p.id} style={thCenter}>{p.name}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    type LegRow = { label: string; values: (string | number)[]; compareValues?: number[]; better?: 'high' | 'low' }
                    const legRows: LegRow[] = [
                      { label: 'Darts', values: allPlayerIds.map(pid => legStatsByPlayer[pid].totalDarts), better: 'low' },
                      { label: 'Total Marks', values: allPlayerIds.map(pid => legStatsByPlayer[pid].totalMarks), better: 'high' },
                      { label: 'Punkte', values: allPlayerIds.map(pid => legStatsByPlayer[pid].totalPoints), better: startEvt.style === 'cutthroat' ? 'low' : 'high' },
                      { label: 'Marks/Turn', values: allPlayerIds.map(pid => {
                        const s = legStatsByPlayer[pid]; return s.turns > 0 ? (s.totalMarks / s.turns).toFixed(2) : '0.00'
                      }), compareValues: allPlayerIds.map(pid => {
                        const s = legStatsByPlayer[pid]; return s.turns > 0 ? s.totalMarks / s.turns : 0
                      }), better: 'high' },
                      { label: 'Marks/Dart', values: allPlayerIds.map(pid => {
                        const s = legStatsByPlayer[pid]; return s.totalDarts > 0 ? (s.totalMarks / s.totalDarts).toFixed(2) : '0.00'
                      }), compareValues: allPlayerIds.map(pid => {
                        const s = legStatsByPlayer[pid]; return s.totalDarts > 0 ? s.totalMarks / s.totalDarts : 0
                      }), better: 'high' },
                      { label: 'Felder geschlossen', values: allPlayerIds.map(pid => legStatsByPlayer[pid].fieldsClosed), better: 'high' },
                      { label: 'Beste Aufnahme (Marks)', values: allPlayerIds.map(pid => legStatsByPlayer[pid].bestTurnMarks), better: 'high' },
                      { label: 'Beste Aufnahme (Punkte)', values: allPlayerIds.map(pid => legStatsByPlayer[pid].bestTurnPoints), better: 'high' },
                      { label: 'Treffer / Misses', values: allPlayerIds.map(pid => `${legStatsByPlayer[pid].hits} / ${legStatsByPlayer[pid].misses}`), compareValues: allPlayerIds.map(pid => legStatsByPlayer[pid].hits), better: 'high' },
                      { label: 'Triples', values: allPlayerIds.map(pid => legStatsByPlayer[pid].triplesHit), better: 'high' },
                      { label: 'Doubles', values: allPlayerIds.map(pid => legStatsByPlayer[pid].doublesHit), better: 'high' },
                      { label: 'Singles', values: allPlayerIds.map(pid => legStatsByPlayer[pid].singlesHit) },
                      { label: 'Single Bull', values: allPlayerIds.map(pid => legStatsByPlayer[pid].bullHitsSingle), better: 'high' },
                      { label: 'Double Bull', values: allPlayerIds.map(pid => legStatsByPlayer[pid].bullHitsDouble), better: 'high' },
                    ]
                    return legRows.map((row, i) => {
                      const nums = row.compareValues ?? row.values.map(v => typeof v === 'number' ? v : 0)
                      const winColors = row.better ? getStatWinnerColors(nums, allPlayerIds, row.better, playerColors) : undefined
                      return (
                        <tr key={i}>
                          <td style={tdLeft}><StatTooltip label={row.label} tooltip={STAT_TOOLTIPS[row.label] || row.label} colors={colors} /></td>
                          {row.values.map((v, j) => (
                            <td key={j} style={{ ...tdCenter, ...(winColors?.[j] ? { color: winColors[j], fontWeight: 700 } : {}) }}>{v}</td>
                          ))}
                        </tr>
                      )
                    })
                  })()}
                </tbody>
              </table>
            </div>
          </div>

          {/* Feld-Breakdown */}
          <div style={card}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>Marks pro Feld</div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={thLeft}>Feld</th>
                    {matchData.players.map(p => (
                      <th key={p.id} style={thCenter}>{p.name}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tKeys.map(field => {
                    const values = allPlayerIds.map(pid => legStatsByPlayer[pid].marksPerField[field] ?? 0)
                    const winCols = getStatWinnerColors(values, allPlayerIds, 'high', playerColors)
                    const closed = allPlayerIds.map(pid => (marksByPlayer[pid][field] ?? 0) >= 3)
                    return (
                      <tr key={field}>
                        <td style={tdLeft}>{field === 'BULL' ? 'Bull' : field}</td>
                        {values.map((v, j) => (
                          <td key={j} style={{
                            ...tdCenter,
                            fontWeight: closed[j] ? 700 : 400,
                            ...(winCols[j] ? { color: winCols[j], fontWeight: 700 } : {}),
                          }}>
                            {v}{closed[j] ? ' \u2713' : ''}
                          </td>
                        ))}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Wurfabfolge */}
          <div style={card}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>Wurfabfolge</div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr>
                    <th style={{ ...thCenter, minWidth: 40 }}>Runde</th>
                    <th style={{ ...thLeft, minWidth: 80 }}>Spieler</th>
                    <th style={thCenter}>Dart 1</th>
                    <th style={thCenter}>Dart 2</th>
                    <th style={thCenter}>Dart 3</th>
                    <th style={{ ...thLeft, minWidth: 120 }}>Marks (Neu)</th>
                    <th style={{ ...thCenter, minWidth: 50 }}>Punkte</th>
                    <th style={{ ...thCenter, minWidth: 60 }}>Gesamt</th>
                  </tr>
                </thead>
                <tbody>
                  {turnRows.map((row, idx) => (
                    <tr key={idx} style={{ background: idx % 2 === 0 ? colors.bgCard : colors.bgMuted }}>
                      <td style={tdCenter}>{row.round}</td>
                      <td style={{ ...tdLeft, fontWeight: 600 }}>{row.playerName}</td>
                      <td style={tdCenter}>{row.darts[0] || '\u2014'}</td>
                      <td style={tdCenter}>{row.darts[1] || '\u2014'}</td>
                      <td style={tdCenter}>{row.darts[2] || '\u2014'}</td>
                      <td style={tdLeft}>{row.marksText}</td>
                      <td style={tdCenter}>{row.newPoints > 0 ? `+${row.newPoints}` : '0'}</td>
                      <td style={{ ...tdCenter, fontWeight: 600 }}>{row.totalScore}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ========================================
  // MATCH OVERVIEW
  // ========================================

  // Bestes Leg pro Spieler (wenigste Darts zum Sieg)
  const bestLegByPlayer: Record<string, number | null> = {}
  allPlayerIds.forEach(pid => { bestLegByPlayer[pid] = null })
  legFinished.forEach((lf, legIdx) => {
    if (!lf.winnerPlayerId) return
    const lt = getLegTurns(events, legIdx)
    const winnerTurns = lt.filter(t => t.playerId === lf.winnerPlayerId)
    const dartsUsed = winnerTurns.reduce((sum, t) => sum + t.darts.length, 0)
    const current = bestLegByPlayer[lf.winnerPlayerId]
    if (current === null || dartsUsed < current) bestLegByPlayer[lf.winnerPlayerId] = dartsUsed
  })

  // Treffer / Misses pro Spieler
  const hitsPerPlayer: Record<string, number> = {}
  const missesPerPlayer: Record<string, number> = {}
  allPlayerIds.forEach(pid => { hitsPerPlayer[pid] = 0; missesPerPlayer[pid] = 0 })
  for (const ev of events) {
    if (ev.type !== 'CricketTurnAdded') continue
    const turn = ev as CricketTurnAdded
    for (const d of turn.darts) {
      if (d.target !== 'MISS' && validTargets.has(String(d.target))) {
        hitsPerPlayer[turn.playerId] = (hitsPerPlayer[turn.playerId] ?? 0) + 1
      } else {
        missesPerPlayer[turn.playerId] = (missesPerPlayer[turn.playerId] ?? 0) + 1
      }
    }
  }

  // Total marks per field (ueber alle Legs)
  const totalMarksPerField: Record<string, Record<string, number>> = {}
  allPlayerIds.forEach(pid => {
    totalMarksPerField[pid] = Object.fromEntries(tKeys.map(t => [t, 0]))
  })
  for (const ev of events) {
    if (ev.type !== 'CricketTurnAdded') continue
    const turn = ev as CricketTurnAdded
    for (const d of turn.darts) {
      if (d.target === 'MISS') continue
      const tKey = String(d.target)
      if (!validTargets.has(tKey)) continue
      const mult = d.target === 'BULL' && d.mult === 3 ? 2 : d.mult
      totalMarksPerField[turn.playerId][tKey] = (totalMarksPerField[turn.playerId][tKey] ?? 0) + mult
    }
  }

  // Strongest / Weakest Field pro Spieler
  function getStrongestField(pid: string): string {
    let best = '', bestVal = -1
    for (const t of tKeys) {
      const v = totalMarksPerField[pid][t] ?? 0
      if (v > bestVal) { bestVal = v; best = t }
    }
    return best ? `${best === 'BULL' ? 'Bull' : best} (${bestVal})` : '\u2014'
  }
  function getWeakestField(pid: string): string {
    let worst = '', worstVal = Infinity
    for (const t of tKeys) {
      const v = totalMarksPerField[pid][t] ?? 0
      if (v < worstVal) { worstVal = v; worst = t }
    }
    return worst ? `${worst === 'BULL' ? 'Bull' : worst} (${worstVal})` : '\u2014'
  }

  // Statistik-Zeilen
  type Row = { label: string; values: (string | number)[]; compareValues?: number[]; better?: 'high' | 'low' }
  const rows: Row[] = [
    { label: 'Legs gewonnen', values: players.map(p => p.legsWon), better: 'high' },
    { label: 'Darts', values: players.map(p => (hitsPerPlayer[p.playerId] ?? 0) + (missesPerPlayer[p.playerId] ?? 0)) },
    { label: 'Bestes Leg', values: players.map(p => bestLegByPlayer[p.playerId] ? `${bestLegByPlayer[p.playerId]} Darts` : '\u2014'), compareValues: players.map(p => bestLegByPlayer[p.playerId] ?? Infinity), better: 'low' },
    { label: 'Total Marks', values: players.map(p => p.totalMarks), better: 'high' },
    { label: 'Marks/Turn (MPR)', values: players.map(p => fmtFixed2(p.marksPerTurn)), compareValues: players.map(p => p.marksPerTurn), better: 'high' },
    { label: 'Marks/Dart (MPD)', values: players.map(p => fmtFixed2(p.marksPerDart)), compareValues: players.map(p => p.marksPerDart), better: 'high' },
    { label: 'Beste Aufnahme (Marks)', values: players.map(p => p.bestTurnMarks), better: 'high' },
    { label: 'Beste Aufnahme (Punkte)', values: players.map(p => p.bestTurnPoints), better: 'high' },
    { label: 'No-Score Turns', values: players.map(p => p.turnsWithNoScore), better: 'low' },
    { label: 'Treffer / Misses', values: players.map(p => `${hitsPerPlayer[p.playerId] ?? 0} / ${missesPerPlayer[p.playerId] ?? 0}`), compareValues: players.map(p => hitsPerPlayer[p.playerId] ?? 0), better: 'high' },
    { label: 'Triples', values: players.map(p => p.triplesHit), better: 'high' },
    { label: 'Doubles', values: players.map(p => p.doublesHit), better: 'high' },
    { label: 'Single Bull', values: players.map(p => p.bullHitsSingle), better: 'high' },
    { label: 'Double Bull', values: players.map(p => p.bullHitsDouble), better: 'high' },
    { label: 'Staerkstes Feld', values: players.map(p => p.strongestField ? `${p.strongestField === 'BULL' ? 'Bull' : p.strongestField}` : '\u2014') },
    { label: 'Schwaechstes Feld', values: players.map(p => p.weakestField ? `${p.weakestField === 'BULL' ? 'Bull' : p.weakestField}` : '\u2014') },
  ]

  const lastLegIndex = legFinished.length > 0 ? legFinished.length - 1 : 0

  return (
    <div style={styles.page}>
      <div style={{ maxWidth: 700, margin: '0 auto', padding: '0 10px' }}>
        {/* Match Header */}
        <MatchHeader
          gameName={matchData.matchName}
          gameMode={gameMode}
          players={matchData.players.map(p => ({
            id: p.id,
            name: p.name,
            color: playerColors[p.id],
            legsWon: legWinsPerPlayer[p.id],
          }))}
          winnerId={matchEndEvent?.winnerPlayerId}
          legScore={legScore}
          durationMs={matchDurationMs}
          playedAt={startEvt.ts}
          onBack={onBack}
        />

        {/* Spielbericht */}
        {(() => {
          const report = generateCricketMatchReport({
            matchId,
            players: matchData.players.map(p => ({ id: p.id, name: p.name })),
            winnerId: matchEndEvent?.winnerPlayerId,
            style: startEvt.style,
            range: startEvt.range,
            playerStats: players.map(p => ({
              playerId: p.playerId,
              playerName: p.playerName,
              totalMarks: p.totalMarks,
              marksPerTurn: p.marksPerTurn,
              legsWon: p.legsWon,
              bestTurnMarks: p.bestTurnMarks,
              triplesHit: p.triplesHit,
              bullHitsSingle: p.bullHitsSingle,
              bullHitsDouble: p.bullHitsDouble,
              turnsWithNoScore: p.turnsWithNoScore,
            })),
          })
          return report ? (
            <div style={{
              marginBottom: 16, padding: '16px 20px', borderRadius: 12,
              background: isArcade
                ? 'linear-gradient(135deg, rgba(59,130,246,0.15), rgba(37,99,235,0.10))'
                : 'linear-gradient(135deg, #eff6ff, #dbeafe)',
              border: `1px solid ${isArcade ? colors.border : '#93c5fd'}`,
              maxWidth: 700, margin: '0 auto 16px',
            }}>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 8, color: isArcade ? colors.accent : '#1e40af' }}>
                Spielbericht
              </div>
              <div style={{ lineHeight: 1.7, fontSize: 14, color: isArcade ? colors.fg : '#1e293b' }}>
                {report}
              </div>
            </div>
          ) : null
        })()}

        {/* Match-Statistik */}
        <div style={card}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>Match-Statistik</div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={thLeft}></th>
                  {players.map(p => (
                    <th key={p.playerId} style={thCenter}>{p.playerName}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => {
                  const pids = players.map(p => p.playerId)
                  const nums = row.compareValues ?? row.values.map(v => typeof v === 'number' ? v : 0)
                  const winColors = row.better ? getStatWinnerColors(nums, pids, row.better, playerColors) : undefined
                  return (
                    <tr key={i}>
                      <td style={tdLeft}><StatTooltip label={row.label} tooltip={STAT_TOOLTIPS[row.label] || row.label} colors={colors} /></td>
                      {row.values.map((v, j) => (
                        <td key={j} style={{
                          ...tdCenter,
                          fontWeight: i === 0 ? 700 : 400,
                          ...(winColors?.[j] ? { color: winColors[j], fontWeight: 700 } : {}),
                        }}>{v}</td>
                      ))}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Per-Field Breakdown (gesamt) */}
        <div style={card}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>Marks pro Feld (gesamt)</div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={thLeft}>Feld</th>
                  {matchData.players.map(p => (
                    <th key={p.id} style={thCenter}>{p.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tKeys.map(field => {
                  const values = allPlayerIds.map(pid => totalMarksPerField[pid][field] ?? 0)
                  const winCols = getStatWinnerColors(values, allPlayerIds, 'high', playerColors)
                  return (
                    <tr key={field}>
                      <td style={tdLeft}>{field === 'BULL' ? 'Bull' : field}</td>
                      {values.map((v, j) => (
                        <td key={j} style={{
                          ...tdCenter,
                          ...(winCols[j] ? { color: winCols[j], fontWeight: 700 } : {}),
                        }}>{v}</td>
                      ))}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Legs Liste */}
        {legFinished.length > 1 && (
          <div style={card}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>Legs</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {(() => {
                const cumScore: Record<string, number> = {}
                matchData.players.forEach(p => { cumScore[p.id] = 0 })
                return legFinished.map((lf, idx) => {
                  if (lf.winnerPlayerId) cumScore[lf.winnerPlayerId]++
                  const scoreStr = matchData.players.map(p => cumScore[p.id]).join(':')
                  const winnerName = matchData.players.find(p => p.id === lf.winnerPlayerId)?.name ?? lf.winnerPlayerId
                  return (
                    <div
                      key={lf.eventId}
                      onClick={() => setSelectedLegIndex(idx)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 12,
                        padding: '8px 12px', background: colors.bgMuted,
                        borderRadius: 6, fontSize: 14, cursor: 'pointer',
                      }}
                    >
                      <span style={{ fontWeight: 700, minWidth: 60 }}>Leg {idx + 1}</span>
                      <span style={{
                        fontWeight: 800, fontSize: 14, color: colors.fg,
                        background: colors.bgSoft, padding: '2px 8px',
                        borderRadius: 4, minWidth: 45, textAlign: 'center',
                      }}>{scoreStr}</span>
                      <span style={{ flex: 1 }} />
                      <span style={{ fontWeight: 600, color: colors.success }}>{winnerName}</span>
                      <span style={{ color: colors.fgMuted, fontSize: 12 }}>&rarr;</span>
                    </div>
                  )
                })
              })()}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
