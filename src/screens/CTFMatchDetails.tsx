// src/screens/CTFMatchDetails.tsx
// Spielzusammenfassung fuer Capture the Field Matches
// Mit Leg-Uebersicht und Drill-Down (analog zu ATBMatchDetails)

import React, { useMemo, useState } from 'react'
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

type Props = {
  matchId: string
  onBack: () => void
}

// Spielerfarben (satte Farben)
const PLAYER_COLORS = [
  '#3b82f6', // Blau (500)
  '#22c55e', // Gruen (500)
  '#f97316', // Orange (500)
  '#ef4444', // Rot (500)
  '#a855f7', // Violett (500)
  '#14b8a6', // Tuerkis (500)
  '#eab308', // Gelb (500)
  '#ec4899', // Pink (500)
]

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

export default function CTFMatchDetails({ matchId, onBack }: Props) {
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
                <button style={styles.backBtn} onClick={onBack}>← Zurueck</button>
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
                    <td style={{ ...tdLeft, fontWeight: 700 }}>Feldpunkte</td>
                    {legStats.map((ps) => <td key={ps.playerId} style={{ ...tdRight, color: colors.warning, fontWeight: 800, fontSize: 16 }}>{ps.fieldPoints}</td>)}
                  </tr>
                  <tr>
                    <td style={tdLeft}>Felder gewonnen</td>
                    {legStats.map((ps) => <td key={ps.playerId} style={tdRight}>{ps.fieldsWon}</td>)}
                  </tr>
                  <tr>
                    <td style={tdLeft}>Wurfpunkte</td>
                    {legStats.map((ps) => <td key={ps.playerId} style={tdRight}>{ps.totalScore}</td>)}
                  </tr>
                  <tr>
                    <td style={tdLeft}>Darts</td>
                    {legStats.map((ps) => <td key={ps.playerId} style={tdRight}>{ps.totalDarts}</td>)}
                  </tr>
                  <tr><td colSpan={legStats.length + 1} style={{ borderBottom: `2px solid ${colors.border}`, padding: '4px 0' }}></td></tr>
                  <tr>
                    <td style={tdLeft}>Triples</td>
                    {legStats.map((ps) => <td key={ps.playerId} style={tdRight}>{ps.triples}</td>)}
                  </tr>
                  <tr>
                    <td style={tdLeft}>Doubles</td>
                    {legStats.map((ps) => <td key={ps.playerId} style={tdRight}>{ps.doubles}</td>)}
                  </tr>
                  <tr>
                    <td style={tdLeft}>Singles</td>
                    {legStats.map((ps) => <td key={ps.playerId} style={tdRight}>{ps.singles}</td>)}
                  </tr>
                  <tr>
                    <td style={tdLeft}>Misses</td>
                    {legStats.map((ps) => <td key={ps.playerId} style={tdRight}>{ps.misses}</td>)}
                  </tr>
                  <tr>
                    <td style={tdLeft}>Trefferquote</td>
                    {legStats.map((ps) => <td key={ps.playerId} style={tdRight}>{ps.hitRate.toFixed(1)}%</td>)}
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Feldverteilung */}
            {legChartData.length > 0 && (
              <div style={styles.card}>
                <div style={{ fontWeight: 700, marginBottom: 16 }}>Feldverteilung</div>
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  <ATBCaptureFieldDistributionChart data={legChartData} size={240} />
                </div>
              </div>
            )}

            {/* Erweiterte Leg-Statistiken */}
            {legDetailedStats.length > 0 && (
              <>
                {/* Detailstatistiken */}
                <div style={styles.card}>
                  <div style={{ fontWeight: 700, marginBottom: 12 }}>Detailstatistiken</div>
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
                        {legDetailedStats.map((ps) => (
                          <td key={ps.playerId} style={tdRight}>{ps.perfectTurns}</td>
                        ))}
                      </tr>
                      <tr>
                        <td style={tdLeft}>\u00D8 Punkte/Feld</td>
                        {legDetailedStats.map((ps) => (
                          <td key={ps.playerId} style={tdRight}>{ps.avgScorePerField.toFixed(2)}</td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Punkte pro Feld Chart */}
                <div style={styles.card}>
                  <div style={{ fontWeight: 700, marginBottom: 12 }}>Punkte pro Feld</div>
                  <ATBCaptureScoreChart
                    rounds={legCaptureRounds}
                    players={match.players.map((p, idx) => ({
                      playerId: p.playerId,
                      name: p.name,
                      color: playerColors[p.playerId] || PLAYER_COLORS[idx % PLAYER_COLORS.length],
                    }))}
                  />
                </div>
              </>
            )}

            {/* Wurfabfolge */}
            <div style={styles.card}>
              <div style={{ fontWeight: 700, marginBottom: 12 }}>Wurfabfolge</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 400, overflowY: 'auto' }}>
                {selectedLeg.turns.length === 0 ? (
                  <div style={{ opacity: 0.6 }}>Keine Wuerfe in diesem Leg.</div>
                ) : (
                  (() => {
                    // Ordne Turns den Feldern zu ueber RoundFinished-Events
                    // Wir bauen eine Map: legId + turnIndex -> fieldNumber
                    const turnFieldMap: Map<string, number | 'BULL'> = new Map()
                    let turnCountPerPlayer: Record<string, number> = {}

                    // Zaehle Turns pro Spieler und ordne sie dem Feld zu
                    let fieldIdx = 0
                    let turnsInCurrentRound = 0
                    const playerCount = match.players.length

                    for (const turn of selectedLeg.turns) {
                      // Aktuelles Feld bestimmen
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
                            gap: 12,
                            padding: '10px 12px',
                            background: `${color}10`,
                            borderLeft: `4px solid ${color}`,
                            borderRadius: '0 6px 6px 0',
                            fontSize: 14,
                          }}
                        >
                          <span style={{ fontWeight: 700, minWidth: 80, color }}>{player?.name}</span>
                          <span style={{ minWidth: 90, fontFamily: 'monospace', fontSize: 12 }}>
                            {turn.darts.map(formatDart).join(' \u00B7 ')}
                          </span>
                          <span style={{ minWidth: 50, color: colors.fgDim, fontSize: 12 }}>
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
                  <td style={{ ...tdLeft, fontWeight: 700 }}>Feldpunkte</td>
                  {matchStats.map((ps) => <td key={ps.playerId} style={{ ...tdRight, color: colors.warning, fontWeight: 800, fontSize: 16 }}>{ps.fieldPoints}</td>)}
                </tr>
                <tr>
                  <td style={tdLeft}>Felder gewonnen</td>
                  {matchStats.map((ps) => <td key={ps.playerId} style={tdRight}>{ps.fieldsWon}</td>)}
                </tr>
                <tr>
                  <td style={tdLeft}>Wurfpunkte</td>
                  {matchStats.map((ps) => <td key={ps.playerId} style={tdRight}>{ps.totalScore}</td>)}
                </tr>
                <tr>
                  <td style={tdLeft}>Darts</td>
                  {matchStats.map((ps) => <td key={ps.playerId} style={tdRight}>{ps.totalDarts}</td>)}
                </tr>
                <tr><td colSpan={matchStats.length + 1} style={{ borderBottom: `2px solid ${colors.border}`, padding: '4px 0' }}></td></tr>
                <tr>
                  <td style={tdLeft}>Triples</td>
                  {matchStats.map((ps) => (
                    <td key={ps.playerId} style={tdRight}>
                      {ps.triples} <span style={{ color: colors.fgMuted, fontSize: 11 }}>({ps.tripleRate.toFixed(1)}%)</span>
                    </td>
                  ))}
                </tr>
                <tr>
                  <td style={tdLeft}>Doubles</td>
                  {matchStats.map((ps) => (
                    <td key={ps.playerId} style={tdRight}>
                      {ps.doubles} <span style={{ color: colors.fgMuted, fontSize: 11 }}>({ps.doubleRate.toFixed(1)}%)</span>
                    </td>
                  ))}
                </tr>
                <tr>
                  <td style={tdLeft}>Singles</td>
                  {matchStats.map((ps) => <td key={ps.playerId} style={tdRight}>{ps.singles}</td>)}
                </tr>
                <tr>
                  <td style={tdLeft}>Misses</td>
                  {matchStats.map((ps) => <td key={ps.playerId} style={tdRight}>{ps.misses}</td>)}
                </tr>
                <tr>
                  <td style={tdLeft}>Trefferquote</td>
                  {matchStats.map((ps) => <td key={ps.playerId} style={tdRight}>{ps.hitRate.toFixed(1)}%</td>)}
                </tr>
              </tbody>
            </table>
          </div>

          {/* Feldverteilung */}
          {matchChartData.length > 0 && (
            <div style={styles.card}>
              <div style={{ fontWeight: 700, marginBottom: 16 }}>Feldverteilung</div>
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <ATBCaptureFieldDistributionChart data={matchChartData} size={240} />
              </div>
            </div>
          )}

          {/* Erweiterte Statistiken */}
          {detailedStats.length > 0 && (
            <div style={styles.card}>
              <div style={{ fontWeight: 700, marginBottom: 12 }}>Detailstatistiken</div>
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
                    {detailedStats.map((ps) => (
                      <td key={ps.playerId} style={tdRight}>{ps.perfectTurns}</td>
                    ))}
                  </tr>
                  <tr>
                    <td style={tdLeft}>{'\u00D8'} Punkte/Feld</td>
                    {detailedStats.map((ps) => (
                      <td key={ps.playerId} style={tdRight}>{ps.avgScorePerField.toFixed(2)}</td>
                    ))}
                  </tr>
                </tbody>
              </table>
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
        </div>
      </div>
    </div>
  )
}
