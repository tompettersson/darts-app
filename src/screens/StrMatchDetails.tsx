// src/screens/StrMatchDetails.tsx
// Match-Details für Sträußchen mit Leg-Drill-Down

import React, { useMemo, useState } from 'react'
import { useTheme } from '../ThemeProvider'
import { getThemedUI } from '../ui'
import { getStrMatchById } from '../storage'
import {
  applyStrEvents,
  formatDuration,
  computeStrFieldScore,
} from '../dartsStraeusschen'
import type {
  StrTurnAddedEvent,
  StrLegStartedEvent,
  StrLegFinishedEvent,
  StrEvent,
} from '../dartsStraeusschen'
import type { StrTargetNumber } from '../types/straeusschen'
import {
  computeStrMatchStats,
  computeStrLegStats,
  type StrPlayerMatchStat,
  type StrPlayerLegStat,
} from '../stats/computeStraeusschenStats'
import { getAllNumbers, getTargetLabel } from '../dartsStraeusschen'
import type { StrRingMode } from '../types/straeusschen'
import MatchHeader, { type MatchHeaderPlayer } from '../components/MatchHeader'
import LegHeader, { type LegHeaderPlayer } from '../components/LegHeader'
import { PLAYER_COLORS } from '../playerColors'

type Props = {
  matchId: string
  onBack: () => void
}

type LegInfo = {
  legId: string
  legIndex: number
  setIndex?: number
  winnerId?: string
  winnerName?: string
  winnerDarts?: number
  winnerScore?: number
  turns: StrTurnAddedEvent[]
}

export default function StrMatchDetails({ matchId, onBack }: Props) {
  const { isArcade, colors } = useTheme()
  const styles = useMemo(() => getThemedUI(colors, isArcade), [colors, isArcade])

  const [selectedLegId, setSelectedLegId] = useState<string | null>(null)

  const storedMatch = useMemo(() => getStrMatchById(matchId), [matchId])

  // Legs aus Events extrahieren
  const legs = useMemo<LegInfo[]>(() => {
    if (!storedMatch) return []
    const result: LegInfo[] = []
    let currentLeg: LegInfo | null = null
    const players = storedMatch.players ?? []

    for (const event of storedMatch.events) {
      if (event.type === 'StrLegStarted') {
        currentLeg = {
          legId: event.legId,
          legIndex: event.legIndex,
          setIndex: event.setIndex,
          turns: [],
        }
      } else if (event.type === 'StrTurnAdded' && currentLeg) {
        currentLeg.turns.push(event)
      } else if (event.type === 'StrLegFinished' && currentLeg) {
        currentLeg.winnerId = event.winnerId
        currentLeg.winnerName = players.find(p => p.playerId === event.winnerId)?.name
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
  }, [storedMatch])

  // Match state
  const state = useMemo(() => {
    if (!storedMatch) return null
    return applyStrEvents(storedMatch.events)
  }, [storedMatch])

  const players = useMemo(() => {
    if (!storedMatch) return []
    return storedMatch.players.map(p => ({ playerId: p.playerId, name: p.name }))
  }, [storedMatch])

  // Match-Stats
  const matchStats = useMemo(() => {
    if (!storedMatch) return []
    return computeStrMatchStats(storedMatch.events, players)
  }, [storedMatch, players])

  // Selected leg
  const selectedLeg = selectedLegId ? legs.find(l => l.legId === selectedLegId) : null
  const selectedLegIndex = selectedLeg ? legs.findIndex(l => l.legId === selectedLegId) : -1

  // Leg-Stats für ausgewähltes Leg
  const legStats = useMemo(() => {
    if (!selectedLeg) return []
    return computeStrLegStats(selectedLeg.turns, players)
  }, [selectedLeg, players])

  // Early return
  if (!storedMatch || !state || !state.match) {
    return (
      <div style={styles.page}>
        <div style={styles.centerPage}>
          <div style={styles.centerInner}>
            <div style={styles.card}>
              <h2 style={{ margin: 0, color: colors.fg }}>Match nicht gefunden</h2>
              <div style={{ marginTop: 10 }}>
                <button style={styles.backBtn} onClick={onBack}>← Zurück</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const match = state.match
  const isMultiField = match.mode === 'all'
  const legsPlayed = legs.length
  const isMultiLeg = legsPlayed > 1

  // Ring mode
  const ringMode: StrRingMode = storedMatch?.ringMode ?? 'triple'
  const ringLabel = ringMode === 'double' ? 'Double' : 'Triple'
  const formatTarget = (num: StrTargetNumber) => getTargetLabel(num, ringMode)
  const includeBull = !!storedMatch.ringMode && (
    storedMatch.generatedOrder?.includes(25 as StrTargetNumber) ||
    (match.mode === 'single' && match.targetNumber === 25) ||
    !!storedMatch.bullMode
  )

  // Spielerfarben
  const playerColorMap = new Map<string, string>()
  match.players.forEach((p, i) => playerColorMap.set(p.playerId, PLAYER_COLORS[i % PLAYER_COLORS.length]))

  // Mode label
  const ringPrefix = ringMode === 'double' ? 'D' : 'T'
  const modeLabel = match.mode === 'single'
    ? `Sträußchen · ${formatTarget(match.targetNumber ?? 20 as StrTargetNumber)}`
    : `Sträußchen · ${ringPrefix}17–${ringPrefix}20${includeBull ? ' + Bull' : ''}`

  // Sorted stats (winner first, then by score)
  const sorted = [...matchStats].sort((a, b) => {
    if (a.playerId === storedMatch.winnerId) return -1
    if (b.playerId === storedMatch.winnerId) return 1
    return b.totalScore - a.totalScore
  })

  // Leg scores
  const legScore = match.players.map(p => state.totalLegWinsByPlayer[p.playerId] || 0).join(' : ')
  const setScore = match.structure.kind === 'sets'
    ? match.players.map(p => state.setWinsByPlayer[p.playerId] || 0).join(' : ')
    : undefined

  // Table styles
  const tdStyle = (c: string | undefined): React.CSSProperties => ({
    textAlign: 'right',
    padding: '6px 8px',
    borderBottom: `1px solid ${colors.border}`,
    fontWeight: 600,
    color: c ?? colors.fg,
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

  // ===== LEG DETAIL VIEW =====
  if (selectedLeg) {
    const sortedLeg = sorted.map(ms => legStats.find(ls => ls.playerId === ms.playerId)!).filter(Boolean)

    // Kumulativen Spielstand nach diesem Leg
    const cumulativeWins: Record<string, number> = {}
    match.players.forEach(p => { cumulativeWins[p.playerId] = 0 })
    for (let i = 0; i <= selectedLegIndex; i++) {
      const leg = legs[i]
      if (leg.winnerId) cumulativeWins[leg.winnerId]++
    }
    const scoreAfterLeg = match.players.map(p => cumulativeWins[p.playerId]).join(':')

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
          <div style={{ ...styles.centerInner, maxWidth: 650 }}>
            {/* Leg Header */}
            <LegHeader
              legNumber={selectedLeg.legIndex + 1}
              setNumber={selectedLeg.setIndex != null ? selectedLeg.setIndex + 1 : undefined}
              gameMode={modeLabel}
              players={match.players.map(p => ({
                id: p.playerId,
                name: p.name,
                color: playerColorMap.get(p.playerId),
              })) as LegHeaderPlayer[]}
              winnerId={selectedLeg.winnerId}
              scoreAfterLeg={scoreAfterLeg}
              legDurationMs={legDurationMs}
              onBack={() => setSelectedLegId(null)}
              onPrevLeg={selectedLegIndex > 0
                ? () => setSelectedLegId(legs[selectedLegIndex - 1].legId)
                : undefined}
              onNextLeg={selectedLegIndex < legs.length - 1
                ? () => setSelectedLegId(legs[selectedLegIndex + 1].legId)
                : undefined}
              hasPrev={selectedLegIndex > 0}
              hasNext={selectedLegIndex < legs.length - 1}
            />

            {/* Leg Stats */}
            <div style={{ ...styles.card, marginBottom: 16, overflowX: 'auto' }}>
              <div style={{ ...styles.sub, marginBottom: 8, fontWeight: 700, color: colors.fg }}>
                Leg-Statistik
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, color: colors.fg }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', ...headerStyle, color: colors.fgDim }}></th>
                    {sortedLeg.map(s => (
                      <th
                        key={s.playerId}
                        style={{
                          ...headerStyle,
                          color: s.playerId === selectedLeg.winnerId
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
                  <tr>
                    <td style={labelStyle}>Score</td>
                    {sortedLeg.map(s => (
                      <td key={s.playerId} style={tdStyle('#0ea5e9')}>{s.totalScore.toFixed(1)}</td>
                    ))}
                  </tr>
                  <tr>
                    <td style={labelStyle}>Darts</td>
                    {sortedLeg.map(s => <td key={s.playerId} style={tdStyle(undefined)}>{s.totalDarts}</td>)}
                  </tr>
                  <tr>
                    <td style={labelStyle}>Aufnahmen</td>
                    {sortedLeg.map(s => <td key={s.playerId} style={tdStyle(undefined)}>{s.totalTurns}</td>)}
                  </tr>
                  {/* Darts to Triple */}
                  {sortedLeg[0]?.fields.length === 1 && (
                    <>
                      <tr>
                        <td style={labelStyle}>1. Triple</td>
                        {sortedLeg.map(s => (
                          <td key={s.playerId} style={tdStyle(colors.accent)}>
                            {s.fields[0]?.dartsToTriple[0] ?? '—'}
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <td style={labelStyle}>2. Triple</td>
                        {sortedLeg.map(s => (
                          <td key={s.playerId} style={tdStyle(colors.accent)}>
                            {s.fields[0]?.dartsToTriple[1] ?? '—'}
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <td style={labelStyle}>3. Triple</td>
                        {sortedLeg.map(s => (
                          <td key={s.playerId} style={tdStyle(colors.accent)}>
                            {s.fields[0]?.dartsToTriple[2] ?? '—'}
                          </td>
                        ))}
                      </tr>
                    </>
                  )}
                  <tr>
                    <td style={labelStyle}>Hit Rate</td>
                    {sortedLeg.map(s => (
                      <td key={s.playerId} style={tdStyle(colors.success)}>
                        {s.hitRate.toFixed(1)}%
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td style={labelStyle}>Treffer / Fehl</td>
                    {sortedLeg.map(s => (
                      <td key={s.playerId} style={tdStyle(undefined)}>
                        <span style={{ color: colors.success }}>{s.totalHits}</span>
                        {' / '}
                        <span style={{ color: colors.error }}>{s.totalMisses}</span>
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td style={labelStyle}>Beste Runde</td>
                    {sortedLeg.map(s => (
                      <td key={s.playerId} style={tdStyle(colors.accent)}>
                        {s.bestRound ? `${s.bestRound.hits}/${s.bestRound.darts}` : '—'}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td style={labelStyle}>Schlechteste Runde</td>
                    {sortedLeg.map(s => (
                      <td key={s.playerId} style={tdStyle(undefined)}>
                        {s.worstRound ? `${s.worstRound.hits}/${s.worstRound.darts}` : '—'}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td style={labelStyle}>Ø Treffer/Runde</td>
                    {sortedLeg.map(s => (
                      <td key={s.playerId} style={tdStyle(undefined)}>
                        {s.avgHitsPerRound.toFixed(2)}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td style={labelStyle}>Längste Serie</td>
                    {sortedLeg.map(s => (
                      <td key={s.playerId} style={tdStyle(colors.accent)}>
                        {s.longestHitStreak}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td style={labelStyle}>1. Dart Trefferquote</td>
                    {sortedLeg.map(s => (
                      <td key={s.playerId} style={tdStyle(undefined)}>
                        {s.firstDartHitRate.toFixed(1)}%
                      </td>
                    ))}
                  </tr>
                  {isMultiField && (
                    <tr>
                      <td style={labelStyle}>Schwerstes Feld</td>
                      {sortedLeg.map(s => (
                        <td key={s.playerId} style={tdStyle(colors.error)}>
                          {s.hardestField ? `${formatTarget(s.hardestField.number)} (${s.hardestField.darts}D)` : '—'}
                        </td>
                      ))}
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Per-Feld Tabelle (bei all mode) */}
            {isMultiField && (
              <div style={{ ...styles.card, marginBottom: 16, overflowX: 'auto' }}>
                <div style={{ ...styles.sub, marginBottom: 8, fontWeight: 700, color: colors.fg }}>Pro Feld</div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, color: colors.fg }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left', ...headerStyle, color: colors.fgDim }}>Feld</th>
                      {sortedLeg.length === 1 ? (
                        <>
                          <th style={{ ...headerStyle, color: colors.fgDim }}>Darts</th>
                          <th style={{ ...headerStyle, color: '#0ea5e9' }}>Score</th>
                          <th style={{ ...headerStyle, color: colors.accent }}>1.</th>
                          <th style={{ ...headerStyle, color: colors.accent }}>2.</th>
                          <th style={{ ...headerStyle, color: colors.accent }}>3.</th>
                        </>
                      ) : sortedLeg.map(s => (
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
                    {sortedLeg.length > 1 && (
                      <tr>
                        <th style={{ ...headerStyle, color: colors.fgDim }}></th>
                        {sortedLeg.map(s => (
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
                    {getAllNumbers(includeBull).map(num => (
                      <tr key={num}>
                        <td style={{ ...labelStyle, fontWeight: 600 }}>{formatTarget(num)}</td>
                        {sortedLeg.length === 1 ? (() => {
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
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Per-Number Efficiency Chart (Leg, all mode) */}
            {isMultiField && (
              <div style={{ ...styles.card, marginBottom: 16 }}>
                <div style={{ ...styles.sub, marginBottom: 12, fontWeight: 700, color: colors.fg }}>
                  Effizienz pro Feld
                </div>
                {sortedLeg.map(s => {
                  const nums = getAllNumbers(includeBull)
                  const maxDarts = Math.max(...nums.map(n => {
                    const field = s.fields.find(f => f.targetNumber === n)
                    return field?.totalDarts ?? 0
                  }), 3)
                  const barH = 22
                  const gap = 6
                  const chartW2 = 400
                  const labelW2 = 50
                  const valueW2 = 45
                  const svgH = nums.length * (barH + gap)

                  return (
                    <div key={s.playerId} style={{ marginBottom: sortedLeg.length > 1 ? 16 : 0 }}>
                      {sortedLeg.length > 1 && (
                        <div style={{ fontSize: 12, fontWeight: 700, color: playerColorMap.get(s.playerId) ?? colors.fg, marginBottom: 6 }}>
                          {s.name}
                        </div>
                      )}
                      <svg width="100%" viewBox={`0 0 ${labelW2 + chartW2 + valueW2} ${svgH}`} style={{ maxWidth: 500, display: 'block' }}>
                        {nums.map((num, i) => {
                          const field = s.fields.find(f => f.targetNumber === num)
                          const darts = field?.totalDarts ?? 0
                          const barW = maxDarts > 0 ? (darts / maxDarts) * chartW2 : 0
                          const y = i * (barH + gap)
                          const ratio = darts > 0 ? Math.min(3 / darts, 1) : 0
                          const barColor = ratio >= 0.8 ? (colors.success ?? '#22c55e')
                            : ratio >= 0.5 ? (colors.warning ?? '#f59e0b')
                            : (colors.error ?? '#ef4444')

                          return (
                            <g key={num}>
                              <text x={labelW2 - 6} y={y + barH / 2 + 4} textAnchor="end" fontSize={12} fontWeight={600} fill={colors.fgDim}>
                                {formatTarget(num)}
                              </text>
                              <rect x={labelW2} y={y + 2} width={barW} height={barH - 4} rx={4} fill={barColor} opacity={0.85} />
                              <text x={labelW2 + chartW2 + 4} y={y + barH / 2 + 4} fontSize={11} fontWeight={600} fill={colors.fg}>
                                {darts > 0 ? darts : '—'}
                              </text>
                            </g>
                          )
                        })}
                      </svg>
                      <div style={{ fontSize: 10, color: colors.fgDim, marginTop: 4 }}>
                        Darts pro Feld (weniger = besser)
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Hit Rate Progression (Leg) */}
            {(() => {
              const playerRoundsLeg: { playerId: string; name: string; color: string; rounds: { turnIndex: number; cumHitRate: number }[] }[] = []
              for (const p of match.players) {
                const pTurns = selectedLeg.turns.filter(t => t.playerId === p.playerId)
                let cumDarts = 0
                let cumHits = 0
                const rounds = pTurns.map((t, i) => {
                  cumDarts += t.darts.length
                  cumHits += t.hits
                  return { turnIndex: i + 1, cumHitRate: cumDarts > 0 ? (cumHits / cumDarts) * 100 : 0 }
                })
                playerRoundsLeg.push({
                  playerId: p.playerId,
                  name: p.name,
                  color: playerColorMap.get(p.playerId) ?? colors.fg,
                  rounds,
                })
              }

              const maxRoundsLeg = Math.max(...playerRoundsLeg.map(pr => pr.rounds.length))
              if (maxRoundsLeg < 2) return null

              const cW = 460
              const cH = 160
              const pL = 36
              const pR = 10
              const pT = 10
              const pB = 24
              const pW = cW - pL - pR
              const pH = cH - pT - pB

              return (
                <div style={{ ...styles.card, marginBottom: 16 }}>
                  <div style={{ ...styles.sub, marginBottom: 12, fontWeight: 700, color: colors.fg }}>
                    Hit Rate Verlauf
                  </div>
                  <svg width="100%" viewBox={`0 0 ${cW} ${cH}`} style={{ maxWidth: 500, display: 'block' }}>
                    {[0, 25, 50, 75, 100].map(v => {
                      const yPos = pT + pH - (v / 100) * pH
                      return (
                        <g key={v}>
                          <line x1={pL} y1={yPos} x2={pL + pW} y2={yPos} stroke={colors.border} strokeWidth={0.5} />
                          <text x={pL - 4} y={yPos + 3} textAnchor="end" fontSize={9} fill={colors.fgDim}>{v}%</text>
                        </g>
                      )
                    })}
                    {playerRoundsLeg.map(pr => {
                      if (pr.rounds.length < 2) return null
                      const pts = pr.rounds.map((r, idx) => {
                        const xPos = pL + (idx / (maxRoundsLeg - 1)) * pW
                        const yPos = pT + pH - (r.cumHitRate / 100) * pH
                        return `${xPos},${yPos}`
                      }).join(' ')
                      return (
                        <polyline
                          key={pr.playerId}
                          points={pts}
                          fill="none"
                          stroke={pr.color}
                          strokeWidth={2}
                          strokeLinejoin="round"
                        />
                      )
                    })}
                    {Array.from({ length: Math.min(maxRoundsLeg, 10) }).map((_, idx) => {
                      const rIdx = maxRoundsLeg <= 10 ? idx : Math.round((idx / 9) * (maxRoundsLeg - 1))
                      const xPos = pL + (rIdx / (maxRoundsLeg - 1)) * pW
                      return (
                        <text key={idx} x={xPos} y={cH - 4} textAnchor="middle" fontSize={9} fill={colors.fgDim}>
                          {rIdx + 1}
                        </text>
                      )
                    })}
                  </svg>
                  {match.players.length > 1 && (
                    <div style={{ display: 'flex', gap: 16, marginTop: 4, justifyContent: 'center' }}>
                      {playerRoundsLeg.map(pr => (
                        <div key={pr.playerId} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
                          <div style={{ width: 12, height: 3, background: pr.color, borderRadius: 1 }} />
                          <span style={{ color: pr.color }}>{pr.name}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div style={{ fontSize: 10, color: colors.fgDim, marginTop: 4, textAlign: 'center' }}>
                    Kumulative Hit Rate pro Runde
                  </div>
                </div>
              )
            })()}

            {/* Turn-Verlauf */}
            <div style={{ ...styles.card, overflowX: 'auto' }}>
              <div style={{ ...styles.sub, marginBottom: 8, fontWeight: 700, color: colors.fg }}>
                Wurfverlauf
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, color: colors.fg }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', ...headerStyle, color: colors.fgDim }}>#</th>
                    <th style={{ textAlign: 'left', ...headerStyle, color: colors.fgDim }}>Spieler</th>
                    <th style={{ textAlign: 'left', ...headerStyle, color: colors.fgDim }}>Ziel</th>
                    <th style={{ textAlign: 'left', ...headerStyle, color: colors.fgDim }}>Würfe</th>
                    <th style={{ textAlign: 'right', ...headerStyle, color: colors.fgDim }}>Treffer</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedLeg.turns.map((turn, i) => {
                    const pColor = playerColorMap.get(turn.playerId) ?? colors.fg
                    const pName = match.players.find(p => p.playerId === turn.playerId)?.name ?? '?'
                    const dartsDisplay = turn.darts.map(d => d === 'hit' ? '●' : '○').join(' ')
                    return (
                      <tr key={i}>
                        <td style={{ ...labelStyle, fontWeight: 600 }}>{i + 1}</td>
                        <td style={{ ...labelStyle, color: pColor, fontWeight: 600 }}>{pName}</td>
                        <td style={labelStyle}>{formatTarget(turn.targetNumber)}</td>
                        <td style={labelStyle}>{dartsDisplay}</td>
                        <td style={tdStyle(turn.hits > 0 ? colors.success : undefined)}>
                          {turn.hits}/{turn.darts.length}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ===== MATCH OVERVIEW =====
  return (
    <div style={styles.page}>
      <div style={styles.centerPage}>
        <div style={{ ...styles.centerInner, maxWidth: 650 }}>
          {/* Match Header */}
          <MatchHeader
            gameMode={modeLabel}
            players={match.players.map(p => ({
              id: p.playerId,
              name: p.name,
              color: playerColorMap.get(p.playerId),
              legsWon: state.totalLegWinsByPlayer[p.playerId] || 0,
              setsWon: match.structure.kind === 'sets'
                ? state.setWinsByPlayer[p.playerId] || 0
                : undefined,
            })) as MatchHeaderPlayer[]}
            winnerId={storedMatch.winnerId}
            legScore={legScore}
            setScore={setScore}
            durationMs={storedMatch.durationMs}
            playedAt={storedMatch.createdAt}
            onBack={onBack}
          />

          {/* Match Stats */}
          <div style={{ ...styles.card, marginBottom: 16, overflowX: 'auto' }}>
            <div style={{ ...styles.sub, marginBottom: 8, fontWeight: 700, color: colors.fg }}>
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
                <tr>
                  <td style={labelStyle}>{isMultiLeg ? 'Ø Score' : 'Score'}</td>
                  {sorted.map(s => (
                    <td key={s.playerId} style={tdStyle('#0ea5e9')}>
                      {isMultiLeg ? s.avgScorePerLeg.toFixed(1) : s.totalScore.toFixed(1)}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td style={labelStyle}>Aufnahmen</td>
                  {sorted.map(s => <td key={s.playerId} style={tdStyle(undefined)}>{s.totalTurns}</td>)}
                </tr>
                <tr>
                  <td style={labelStyle}>Darts</td>
                  {sorted.map(s => <td key={s.playerId} style={tdStyle(undefined)}>{s.totalDarts}</td>)}
                </tr>
                {/* Ø Darts to Triple */}
                {!isMultiField && (
                  <>
                    <tr>
                      <td style={labelStyle}>{isMultiLeg ? 'Ø 1. Triple' : '1. Triple'}</td>
                      {sorted.map(s => (
                        <td key={s.playerId} style={tdStyle(colors.accent)}>
                          {isMultiLeg
                            ? (s.avgDartsToTriple[0] != null ? s.avgDartsToTriple[0].toFixed(1) : '—')
                            : (s.avgFields[0]?.avgDartsToTriple[0] ?? s.avgDartsToTriple[0]?.toFixed(1) ?? '—')}
                        </td>
                      ))}
                    </tr>
                    <tr>
                      <td style={labelStyle}>{isMultiLeg ? 'Ø 2. Triple' : '2. Triple'}</td>
                      {sorted.map(s => (
                        <td key={s.playerId} style={tdStyle(colors.accent)}>
                          {isMultiLeg
                            ? (s.avgDartsToTriple[1] != null ? s.avgDartsToTriple[1].toFixed(1) : '—')
                            : (s.avgFields[0]?.avgDartsToTriple[1] ?? s.avgDartsToTriple[1]?.toFixed(1) ?? '—')}
                        </td>
                      ))}
                    </tr>
                    <tr>
                      <td style={labelStyle}>{isMultiLeg ? 'Ø 3. Triple' : '3. Triple'}</td>
                      {sorted.map(s => (
                        <td key={s.playerId} style={tdStyle(colors.accent)}>
                          {isMultiLeg
                            ? (s.avgDartsToTriple[2] != null ? s.avgDartsToTriple[2].toFixed(1) : '—')
                            : (s.avgFields[0]?.avgDartsToTriple[2] ?? s.avgDartsToTriple[2]?.toFixed(1) ?? '—')}
                        </td>
                      ))}
                    </tr>
                  </>
                )}
                {isMultiLeg && (
                  <tr>
                    <td style={labelStyle}>Ø Darts/Leg</td>
                    {sorted.map(s => (
                      <td key={s.playerId} style={tdStyle(undefined)}>
                        {s.avgDartsPerLeg > 0 ? s.avgDartsPerLeg.toFixed(1) : '—'}
                      </td>
                    ))}
                  </tr>
                )}
                <tr>
                  <td style={labelStyle}>Hit Rate</td>
                  {sorted.map(s => (
                    <td key={s.playerId} style={tdStyle(colors.success)}>
                      {s.hitRate.toFixed(1)}%
                    </td>
                  ))}
                </tr>
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
                <tr>
                  <td style={labelStyle}>Beste Runde</td>
                  {sorted.map(s => (
                    <td key={s.playerId} style={tdStyle(colors.accent)}>
                      {s.bestRound ? `${s.bestRound.hits}/${s.bestRound.darts}` : '—'}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td style={labelStyle}>Schlechteste Runde</td>
                  {sorted.map(s => (
                    <td key={s.playerId} style={tdStyle(undefined)}>
                      {s.worstRound ? `${s.worstRound.hits}/${s.worstRound.darts}` : '—'}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td style={labelStyle}>Ø Treffer/Runde</td>
                  {sorted.map(s => (
                    <td key={s.playerId} style={tdStyle(undefined)}>
                      {s.avgHitsPerRound.toFixed(2)}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td style={labelStyle}>Längste Serie</td>
                  {sorted.map(s => (
                    <td key={s.playerId} style={tdStyle(colors.accent)}>
                      {s.longestHitStreak}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td style={labelStyle}>1. Dart Trefferquote</td>
                  {sorted.map(s => (
                    <td key={s.playerId} style={tdStyle(undefined)}>
                      {s.firstDartHitRate.toFixed(1)}%
                    </td>
                  ))}
                </tr>
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
              <div style={{ ...styles.sub, marginBottom: 8, fontWeight: 700, color: colors.fg }}>Pro Feld</div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, color: colors.fg }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', ...headerStyle, color: colors.fgDim }}>Feld</th>
                    {sorted.length === 1 ? (
                      <>
                        <th style={{ ...headerStyle, color: colors.fgDim }}>Ø D</th>
                        <th style={{ ...headerStyle, color: '#0ea5e9' }}>Ø Score</th>
                        <th style={{ ...headerStyle, color: colors.accent }}>Ø 1.</th>
                        <th style={{ ...headerStyle, color: colors.accent }}>Ø 2.</th>
                        <th style={{ ...headerStyle, color: colors.accent }}>Ø 3.</th>
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
                  {getAllNumbers(includeBull).map(num => (
                    <tr key={num}>
                      <td style={{ ...labelStyle, fontWeight: 600 }}>{formatTarget(num)}</td>
                      {sorted.length === 1 ? (() => {
                        const af = sorted[0].avgFields.find(f => f.targetNumber === num)
                        return (
                          <>
                            <td style={tdStyle(undefined)}>{af ? (af.avgDarts > 0 ? af.avgDarts.toFixed(1) : '—') : '—'}</td>
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
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Per-Number Efficiency Chart (SVG Bars) */}
          {isMultiField && (
            <div style={{ ...styles.card, marginBottom: 16 }}>
              <div style={{ ...styles.sub, marginBottom: 12, fontWeight: 700, color: colors.fg }}>
                Effizienz pro Feld
              </div>
              {sorted.map((s, sIdx) => {
                const nums = getAllNumbers(includeBull)
                const maxDarts = Math.max(...nums.map(n => {
                  const af = s.avgFields.find(f => f.targetNumber === n)
                  return af?.avgDarts ?? 0
                }), 3)
                const barH = 22
                const gap = 6
                const chartW = 400
                const labelW = 50
                const valueW = 45
                const svgH = nums.length * (barH + gap)

                return (
                  <div key={s.playerId} style={{ marginBottom: sorted.length > 1 ? 16 : 0 }}>
                    {sorted.length > 1 && (
                      <div style={{ fontSize: 12, fontWeight: 700, color: playerColorMap.get(s.playerId) ?? colors.fg, marginBottom: 6 }}>
                        {s.name}
                      </div>
                    )}
                    <svg width="100%" viewBox={`0 0 ${labelW + chartW + valueW} ${svgH}`} style={{ maxWidth: 500, display: 'block' }}>
                      {nums.map((num, i) => {
                        const af = s.avgFields.find(f => f.targetNumber === num)
                        const darts = af?.avgDarts ?? 0
                        const barW = maxDarts > 0 ? (darts / maxDarts) * chartW : 0
                        const y = i * (barH + gap)
                        const ratio = darts > 0 ? Math.min(3 / darts, 1) : 0
                        const barColor = ratio >= 0.8 ? (colors.success ?? '#22c55e')
                          : ratio >= 0.5 ? (colors.warning ?? '#f59e0b')
                          : (colors.error ?? '#ef4444')

                        return (
                          <g key={num}>
                            <text x={labelW - 6} y={y + barH / 2 + 4} textAnchor="end" fontSize={12} fontWeight={600} fill={colors.fgDim}>
                              {formatTarget(num)}
                            </text>
                            <rect x={labelW} y={y + 2} width={barW} height={barH - 4} rx={4} fill={barColor} opacity={0.85} />
                            <text x={labelW + chartW + 4} y={y + barH / 2 + 4} fontSize={11} fontWeight={600} fill={colors.fg}>
                              {darts > 0 ? (isMultiLeg ? darts.toFixed(1) : darts.toFixed(0)) : '—'}
                            </text>
                          </g>
                        )
                      })}
                    </svg>
                    <div style={{ fontSize: 10, color: colors.fgDim, marginTop: 4 }}>
                      {isMultiLeg ? 'Ø Darts pro Feld' : 'Darts pro Feld'} (weniger = besser)
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Hit Rate Progression Chart */}
          {!isMultiLeg && (() => {
            // For single-leg matches, compute round-by-round data from first leg
            const firstLeg = legs[0]
            if (!firstLeg || firstLeg.turns.length < 2) return null

            // Build per-player round data
            const playerRounds: { playerId: string; name: string; color: string; rounds: { turnIndex: number; cumHitRate: number }[] }[] = []
            for (const p of match.players) {
              const pTurns = firstLeg.turns.filter(t => t.playerId === p.playerId)
              let cumDarts = 0
              let cumHits = 0
              const rounds = pTurns.map((t, i) => {
                cumDarts += t.darts.length
                cumHits += t.hits
                return { turnIndex: i + 1, cumHitRate: cumDarts > 0 ? (cumHits / cumDarts) * 100 : 0 }
              })
              playerRounds.push({
                playerId: p.playerId,
                name: p.name,
                color: playerColorMap.get(p.playerId) ?? colors.fg,
                rounds,
              })
            }

            const maxRounds = Math.max(...playerRounds.map(pr => pr.rounds.length))
            if (maxRounds < 2) return null

            const chartW = 460
            const chartH = 160
            const padL = 36
            const padR = 10
            const padT = 10
            const padB = 24
            const plotW = chartW - padL - padR
            const plotH = chartH - padT - padB

            return (
              <div style={{ ...styles.card, marginBottom: 16 }}>
                <div style={{ ...styles.sub, marginBottom: 12, fontWeight: 700, color: colors.fg }}>
                  Hit Rate Verlauf
                </div>
                <svg width="100%" viewBox={`0 0 ${chartW} ${chartH}`} style={{ maxWidth: 500, display: 'block' }}>
                  {/* Y axis labels */}
                  {[0, 25, 50, 75, 100].map(v => {
                    const y = padT + plotH - (v / 100) * plotH
                    return (
                      <g key={v}>
                        <line x1={padL} y1={y} x2={padL + plotW} y2={y} stroke={colors.border} strokeWidth={0.5} />
                        <text x={padL - 4} y={y + 3} textAnchor="end" fontSize={9} fill={colors.fgDim}>{v}%</text>
                      </g>
                    )
                  })}
                  {/* Lines per player */}
                  {playerRounds.map(pr => {
                    if (pr.rounds.length < 2) return null
                    const points = pr.rounds.map((r, i) => {
                      const x = padL + (i / (maxRounds - 1)) * plotW
                      const y = padT + plotH - (r.cumHitRate / 100) * plotH
                      return `${x},${y}`
                    }).join(' ')
                    return (
                      <polyline
                        key={pr.playerId}
                        points={points}
                        fill="none"
                        stroke={pr.color}
                        strokeWidth={2}
                        strokeLinejoin="round"
                      />
                    )
                  })}
                  {/* X axis labels */}
                  {Array.from({ length: Math.min(maxRounds, 10) }).map((_, i) => {
                    const rIdx = maxRounds <= 10 ? i : Math.round((i / 9) * (maxRounds - 1))
                    const x = padL + (rIdx / (maxRounds - 1)) * plotW
                    return (
                      <text key={i} x={x} y={chartH - 4} textAnchor="middle" fontSize={9} fill={colors.fgDim}>
                        {rIdx + 1}
                      </text>
                    )
                  })}
                </svg>
                {/* Legend */}
                {match.players.length > 1 && (
                  <div style={{ display: 'flex', gap: 16, marginTop: 4, justifyContent: 'center' }}>
                    {playerRounds.map(pr => (
                      <div key={pr.playerId} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
                        <div style={{ width: 12, height: 3, background: pr.color, borderRadius: 1 }} />
                        <span style={{ color: pr.color }}>{pr.name}</span>
                      </div>
                    ))}
                  </div>
                )}
                <div style={{ fontSize: 10, color: colors.fgDim, marginTop: 4, textAlign: 'center' }}>
                  Kumulative Hit Rate pro Runde
                </div>
              </div>
            )
          })()}

          {/* Leg-Verlauf */}
          {legs.length > 0 && (
            <div style={{ ...styles.card }}>
              <div style={{ ...styles.sub, marginBottom: 8, fontWeight: 700, color: colors.fg }}>
                Leg-Verlauf
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {legs.map((leg, i) => {
                  const winnerColor = leg.winnerId ? playerColorMap.get(leg.winnerId) : undefined

                  // Score nach diesem Leg
                  const winsAfter: Record<string, number> = {}
                  match.players.forEach(p => { winsAfter[p.playerId] = 0 })
                  for (let j = 0; j <= i; j++) {
                    const l = legs[j]
                    if (l.winnerId) winsAfter[l.winnerId]++
                  }
                  const legScoreStr = match.players.map(p => winsAfter[p.playerId]).join(':')

                  return (
                    <div
                      key={leg.legId}
                      onClick={() => setSelectedLegId(leg.legId)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        padding: '10px 12px',
                        background: colors.bgMuted,
                        borderRadius: 6,
                        cursor: 'pointer',
                        fontSize: 14,
                        transition: 'background .12s',
                      }}
                    >
                      <span style={{ fontWeight: 700, color: colors.fgDim, minWidth: 50 }}>
                        {leg.setIndex != null ? `S${leg.setIndex + 1} ` : ''}Leg {leg.legIndex + 1}
                      </span>
                      <span style={{
                        fontWeight: 800,
                        fontSize: 15,
                        color: colors.fg,
                        background: colors.bgCard,
                        padding: '2px 8px',
                        borderRadius: 4,
                        minWidth: 40,
                        textAlign: 'center',
                      }}>
                        {legScoreStr}
                      </span>
                      {leg.winnerName && (
                        <span style={{ fontWeight: 600, color: winnerColor ?? colors.success }}>
                          {leg.winnerName}
                        </span>
                      )}
                      {leg.winnerDarts != null && (
                        <span style={{ color: colors.fgDim, fontSize: 12, marginLeft: 'auto' }}>
                          {leg.winnerDarts}D · {leg.winnerScore?.toFixed(1)}Pkt
                        </span>
                      )}
                      <span style={{ color: colors.fgDim, fontSize: 16 }}>›</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
