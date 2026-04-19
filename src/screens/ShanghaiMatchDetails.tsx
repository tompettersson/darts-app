// src/screens/ShanghaiMatchDetails.tsx
// Spielzusammenfassung fuer Shanghai Matches (aus Match History)
// Mit Leg-Uebersicht, Drill-Down, Charts und umfangreichen Statistiken

import React, { useMemo } from 'react'
import { getShanghaiMatchById, getProfiles } from '../storage'
import { applyShanghaiEvents, formatDuration } from '../dartsShanghai'
import type {
  ShanghaiPlayer,
  ShanghaiTurnAddedEvent,
  ShanghaiRoundFinishedEvent,
} from '../types/shanghai'
import { getThemedUI } from '../ui'
import { useTheme } from '../ThemeProvider'
import MatchHeader, { type MatchHeaderPlayer } from '../components/MatchHeader'
import StatTooltip, { STAT_TOOLTIPS } from '../components/StatTooltip'
import { PLAYER_COLORS } from '../playerColors'
import { generateShanghaiReport } from '../narratives/generateModeReports'
import ShanghaiAggregateSection from '../components/ShanghaiAggregateSection'
import { listShanghaiLegIndices, computeShanghaiLegStats } from '../stats/computeShanghaiLegStats'

type Props = {
  matchId: string
  onBack: () => void
  onOpenLegSummary?: (matchId: string, legIndex: number) => void
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

export default function ShanghaiMatchDetails({ matchId, onBack, onOpenLegSummary }: Props) {
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

  // selectedLegId-Drilldown entfernt — Leg-Drilldown läuft jetzt über ShanghaiLegSummary

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

          {/* Match-Aggregat + Leg-Liste (nur bei > 1 Leg) */}
          <ShanghaiAggregateSection
            match={match}
            players={match.players}
            playerColor={(pid) => playerColors[pid] ?? PLAYER_COLORS[0]}
            colors={colors}
            styles={styles}
            onOpenLeg={onOpenLegSummary ? (idx) => onOpenLegSummary(matchId, idx) : undefined}
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

          {/* Leg-Vergleichstabelle — pro Spieler eine Card mit Zeile pro Leg + Total-Zeile */}
          {(() => {
            const legIndices = listShanghaiLegIndices(match)
            if (legIndices.length <= 1) return null

            return match.players.map(player => {
              const perLegStats = legIndices
                .map(idx => computeShanghaiLegStats(match, player.playerId, idx))
                .filter((s): s is NonNullable<typeof s> => s !== null)
              if (perLegStats.length === 0) return null

              const totals = {
                score: perLegStats.reduce((a, s) => a + s.finalScore, 0),
                scorePct: perLegStats.reduce((a, s) => a + s.scorePercent, 0) / perLegStats.length,
                hits: perLegStats.reduce((a, s) => a + s.totalHits, 0),
                triples: perLegStats.reduce((a, s) => a + s.triples, 0),
                zero: perLegStats.reduce((a, s) => a + s.zeroRounds, 0) / perLegStats.length,
                shanghai: perLegStats.filter(s => s.shanghaiAchieved).length,
              }

              const thStyle: React.CSSProperties = {
                textAlign: 'right', padding: '6px 8px',
                color: colors.fgMuted, borderBottom: `1px solid ${colors.border}`,
                fontSize: 11, whiteSpace: 'nowrap',
              }
              const tdStyle: React.CSSProperties = {
                padding: '6px 8px', textAlign: 'right',
                borderBottom: `1px solid ${colors.border}`,
                fontSize: 13, whiteSpace: 'nowrap',
              }

              return (
                <div key={player.playerId} style={{ ...styles.card, marginBottom: 16 }}>
                  <div style={{
                    ...styles.sub, marginBottom: 8,
                    borderLeft: `4px solid ${playerColors[player.playerId]}`,
                    paddingLeft: 8, color: playerColors[player.playerId],
                  }}>
                    {player.name} — Leg-Vergleich ({perLegStats.length} Legs)
                  </div>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr>
                          <th style={{ ...thStyle, textAlign: 'left' }}>Leg</th>
                          <th style={thStyle}>Score</th>
                          <th style={thStyle}>Score %</th>
                          <th style={thStyle}>Hits</th>
                          <th style={thStyle}>Triples</th>
                          <th style={thStyle}>Zero</th>
                          <th style={thStyle}>Shanghai</th>
                          <th style={{ ...thStyle, width: 24 }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {perLegStats.map(s => (
                          <tr
                            key={s.legIndex}
                            onClick={() => onOpenLegSummary?.(matchId, s.legIndex)}
                            style={{
                              cursor: onOpenLegSummary ? 'pointer' : 'default',
                              background: 'transparent',
                            }}
                          >
                            <td style={{ ...tdStyle, textAlign: 'left', fontWeight: 600 }}>Leg {s.legIndex + 1}</td>
                            <td style={{ ...tdStyle, fontWeight: 700 }}>{s.finalScore}</td>
                            <td style={tdStyle}>{s.scorePercent.toFixed(1)}%</td>
                            <td style={tdStyle}>{s.totalHits}</td>
                            <td style={tdStyle}>{s.triples}</td>
                            <td style={tdStyle}>{s.zeroRounds}</td>
                            <td style={{ ...tdStyle, color: s.shanghaiAchieved ? colors.warning : colors.fgDim, fontWeight: s.shanghaiAchieved ? 700 : 400 }}>
                              {s.shanghaiAchieved ? 'Ja \u2605' : '–'}
                            </td>
                            <td style={{ ...tdStyle, color: colors.fgMuted }}>
                              {onOpenLegSummary ? '›' : ''}
                            </td>
                          </tr>
                        ))}
                        <tr style={{ borderTop: `2px solid ${colors.border}`, background: colors.bgMuted }}>
                          <td style={{ ...tdStyle, textAlign: 'left', fontWeight: 800 }}>Ø / Total</td>
                          <td style={{ ...tdStyle, fontWeight: 800, color: colors.accent }}>
                            {(totals.score / perLegStats.length).toFixed(0)}
                          </td>
                          <td style={{ ...tdStyle, fontWeight: 800, color: colors.accent }}>
                            {totals.scorePct.toFixed(1)}%
                          </td>
                          <td style={{ ...tdStyle, fontWeight: 700 }}>{totals.hits}</td>
                          <td style={{ ...tdStyle, fontWeight: 700 }}>{totals.triples}</td>
                          <td style={{ ...tdStyle, fontWeight: 700 }}>{totals.zero.toFixed(1)}</td>
                          <td style={{ ...tdStyle, fontWeight: 700, color: totals.shanghai > 0 ? colors.warning : colors.fgDim }}>
                            {totals.shanghai}/{perLegStats.length}
                          </td>
                          <td style={tdStyle}></td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              )
            })
          })()}

        </div>
      </div>
    </div>
  )
}
