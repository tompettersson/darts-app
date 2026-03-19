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

  // Spielerfarben
  const playerColorMap = new Map<string, string>()
  match.players.forEach((p, i) => playerColorMap.set(p.playerId, PLAYER_COLORS[i % PLAYER_COLORS.length]))

  // Mode label
  const modeLabel = match.mode === 'single'
    ? `Sträußchen · T${match.targetNumber ?? 20}`
    : 'Sträußchen · T17–T20'

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
                  {isMultiField && (
                    <tr>
                      <td style={labelStyle}>Schwerstes Feld</td>
                      {sortedLeg.map(s => (
                        <td key={s.playerId} style={tdStyle(colors.error)}>
                          {s.hardestField ? `T${s.hardestField.number} (${s.hardestField.darts}D)` : '—'}
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
                    {([17, 18, 19, 20] as StrTargetNumber[]).map(num => (
                      <tr key={num}>
                        <td style={{ ...labelStyle, fontWeight: 600 }}>T{num}</td>
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
                        <td style={labelStyle}>T{turn.targetNumber}</td>
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
                {isMultiField && (
                  <tr>
                    <td style={labelStyle}>Schwerstes Feld</td>
                    {sorted.map(s => (
                      <td key={s.playerId} style={tdStyle(colors.error)}>
                        {s.hardestField
                          ? `T${s.hardestField.number} (${isMultiLeg ? `Ø ${s.hardestField.avgDarts.toFixed(1)}` : `${s.hardestField.avgDarts}`}D)`
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
                  {([17, 18, 19, 20] as StrTargetNumber[]).map(num => (
                    <tr key={num}>
                      <td style={{ ...labelStyle, fontWeight: 600 }}>T{num}</td>
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
