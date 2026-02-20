// src/screens/ShanghaiMatchDetails.tsx
// Spielzusammenfassung fuer Shanghai Matches (aus Match History)
// Mit Leg-Uebersicht und Drill-Down (analog zu CTFMatchDetails)

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

type Props = {
  matchId: string
  onBack: () => void
}

const PLAYER_COLORS = [
  '#3b82f6', '#22c55e', '#f97316', '#ef4444',
  '#a855f7', '#14b8a6', '#eab308', '#ec4899',
]

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

  // Stats pro Spieler berechnen (fuer bestimmtes Leg oder gesamtes Match)
  function computePlayerStats(turns: ShanghaiTurnAddedEvent[], players: ShanghaiPlayer[], winnerId?: string | null) {
    return players.map((player) => {
      const pid = player.playerId
      const playerTurns = turns.filter(t => t.playerId === pid)
      let totalScore = 0, triples = 0, doubles = 0, singles = 0, misses = 0, totalDarts = 0, hits = 0, shanghaiCount = 0

      for (const turn of playerTurns) {
        totalScore += turn.turnScore
        if (turn.isShanghai) shanghaiCount++
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
        avgPerRound: playerTurns.length > 0 ? totalScore / playerTurns.length : 0,
        isWinner: winnerId === pid,
      }
    })
  }

  // ===== LEG DETAIL VIEW =====
  if (selectedLeg) {
    const legStats = computePlayerStats(selectedLeg.turns, match.players, selectedLeg.winnerId)

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

            {/* Leg-Statistiken */}
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
                    <td style={{ ...tdLeft, fontWeight: 700 }}>Gesamt</td>
                    {legStats.map((ps) => <td key={ps.playerId} style={{ ...tdRight, color: colors.accent, fontWeight: 800, fontSize: 16 }}>{ps.totalScore}</td>)}
                  </tr>
                  <tr>
                    <td style={tdLeft}>{'\u00D8'} pro Runde</td>
                    {legStats.map((ps) => <td key={ps.playerId} style={tdRight}>{ps.avgPerRound.toFixed(1)}</td>)}
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
                  {legStats.some(ps => ps.shanghaiCount > 0) && (
                    <tr>
                      <td style={{ ...tdLeft, color: colors.warning, fontWeight: 600 }}>Shanghai</td>
                      {legStats.map((ps) => <td key={ps.playerId} style={{ ...tdRight, color: ps.shanghaiCount > 0 ? colors.warning : colors.fgDim, fontWeight: ps.shanghaiCount > 0 ? 700 : 400 }}>{ps.shanghaiCount}x</td>)}
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Runden-Uebersicht */}
            {selectedLeg.rounds.length > 0 && (
              <div style={styles.card}>
                <div style={{ fontWeight: 700, marginBottom: 12 }}>Runden-Uebersicht</div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ borderBottom: `1px solid ${colors.border}` }}>
                        <th style={{ textAlign: 'left', padding: '4px 6px', color: colors.fgMuted }}>Runde</th>
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

                        return (
                          <tr key={round.roundNumber} style={{ borderBottom: `1px solid ${colors.border}` }}>
                            <td style={{ padding: '4px 6px', fontWeight: 500, color: colors.fgDim }}>
                              R{round.roundNumber}
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
                        <td style={{ padding: '6px 6px', fontWeight: 700 }}>Gesamt</td>
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
                  <td style={{ ...tdLeft, fontWeight: 700 }}>Gesamt</td>
                  {matchStats.map((ps) => <td key={ps.playerId} style={{ ...tdRight, color: colors.accent, fontWeight: 800, fontSize: 16 }}>{ps.totalScore}</td>)}
                </tr>
                <tr>
                  <td style={tdLeft}>{'\u00D8'} pro Runde</td>
                  {matchStats.map((ps) => <td key={ps.playerId} style={tdRight}>{ps.avgPerRound.toFixed(1)}</td>)}
                </tr>
                <tr>
                  <td style={tdLeft}>Darts</td>
                  {matchStats.map((ps) => <td key={ps.playerId} style={tdRight}>{ps.totalDarts}</td>)}
                </tr>
                <tr><td colSpan={matchStats.length + 1} style={{ borderBottom: `2px solid ${colors.border}`, padding: '4px 0' }}></td></tr>
                <tr>
                  <td style={tdLeft}>Triples</td>
                  {matchStats.map((ps) => <td key={ps.playerId} style={tdRight}>{ps.triples}</td>)}
                </tr>
                <tr>
                  <td style={tdLeft}>Doubles</td>
                  {matchStats.map((ps) => <td key={ps.playerId} style={tdRight}>{ps.doubles}</td>)}
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
                {matchStats.some(ps => ps.shanghaiCount > 0) && (
                  <tr>
                    <td style={{ ...tdLeft, color: colors.warning, fontWeight: 600 }}>Shanghai</td>
                    {matchStats.map((ps) => <td key={ps.playerId} style={{ ...tdRight, color: ps.shanghaiCount > 0 ? colors.warning : colors.fgDim, fontWeight: ps.shanghaiCount > 0 ? 700 : 400 }}>{ps.shanghaiCount}x</td>)}
                  </tr>
                )}
              </tbody>
            </table>
          </div>

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
