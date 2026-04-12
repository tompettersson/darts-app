// src/components/X01EndScreen.tsx
// Extracted end screen component for X01 matches

import React, { useState, useMemo, useEffect } from 'react'
import {
  applyEvents,
  computeStats,
  type DartsEvent,
  type MatchStarted,
  type VisitAdded,
  isVisitAdded,
  isLegStarted,
  isLegFinished,
  isSetStarted,
  isSetFinished,
} from '../darts501'
import { setMatchMetadata } from '../storage'
import type { StoredMatch } from '../storage'
import { checkX01PersonalBests, formatPBValue, type PersonalBestCheck } from '../stats/personalBests'
import { generateMatchReport, type MatchReportInput } from '../narratives/generateReport'

// --- Helpers (moved from Game.tsx, only used in endscreen) ---

function getMedal(
  playerId: string,
  scoreForRank: Record<string, number>,
  sortedByScore: { playerId: string }[]
): string {
  const playerScore = scoreForRank[playerId] ?? 0
  const rank1Score = scoreForRank[sortedByScore[0]?.playerId] ?? 0
  const rank2Score = sortedByScore.length > 1 ? (scoreForRank[sortedByScore[1]?.playerId] ?? 0) : -1
  const rank3Score = sortedByScore.length > 2 ? (scoreForRank[sortedByScore[2]?.playerId] ?? 0) : -1

  if (playerScore === rank1Score) return '\u{1F947}'
  if (playerScore === rank2Score) return '\u{1F948}'
  if (sortedByScore.length > 2 && playerScore === rank3Score) return '\u{1F949}'
  return '\u2014'
}

function computePointsPerLegAvg(events: DartsEvent[], playerId: string): number {
  const byLeg = new Map<string, number>()
  for (const e of events) {
    if (!isVisitAdded(e)) continue
    if (e.playerId !== playerId) continue
    byLeg.set(e.legId, (byLeg.get(e.legId) ?? 0) + (e.visitScore ?? 0))
  }
  if (byLeg.size === 0) return 0
  const sum = Array.from(byLeg.values()).reduce((a, b) => a + b, 0)
  return sum / byLeg.size
}

function computeMostHitField(allEvents: DartsEvent[], legId: string | null, playerId: string): string {
  const hitCount: Record<string, number> = {}
  const visits = allEvents.filter((e): e is VisitAdded =>
    isVisitAdded(e) && e.playerId === playerId && (legId === null || e.legId === legId)
  )
  for (const v of visits) {
    for (const d of v.darts) {
      if (d.bed === 'MISS') continue
      const key = d.bed === 'BULL' || d.bed === 'DBULL' ? 'Bull' : String(d.bed)
      hitCount[key] = (hitCount[key] ?? 0) + 1
    }
  }
  const sorted = Object.entries(hitCount).sort((a, b) => b[1] - a[1])
  if (sorted.length === 0) return '–'
  return `${sorted[0][0]} (${sorted[0][1]}\u00D7)`
}

function computeMostCommonScore(allEvents: DartsEvent[], legId: string | null, playerId: string): string {
  const scoreCount: Record<number, number> = {}
  const visits = allEvents.filter((e): e is VisitAdded =>
    isVisitAdded(e) && e.playerId === playerId && !e.bust && (legId === null || e.legId === legId)
  )
  for (const v of visits) {
    scoreCount[v.visitScore] = (scoreCount[v.visitScore] ?? 0) + 1
  }
  const sorted = Object.entries(scoreCount).sort((a, b) => Number(b[1]) - Number(a[1]))
  if (sorted.length === 0) return '–'
  return `${sorted[0][0]} (${sorted[0][1]}\u00D7)`
}

function computeLegsAndSetsScore(match: MatchStarted, state: ReturnType<typeof applyEvents>) {
  const players = match.players.map((p) => p.playerId)
  const setsWon: Record<string, number> = Object.fromEntries(players.map((pid) => [pid, 0]))
  for (const s of state.sets) if (s.winnerPlayerId) setsWon[s.winnerPlayerId] = (setsWon[s.winnerPlayerId] ?? 0) + 1

  let legsWonCurrent: Record<string, number>
  if (match.structure.kind === 'legs') {
    const allLegs: Record<string, number> = Object.fromEntries(players.map((pid) => [pid, 0]))
    for (const L of state.legs) if (L.winnerPlayerId) allLegs[L.winnerPlayerId]++
    legsWonCurrent = allLegs
  } else {
    const curSet = state.sets[state.sets.length - 1]
    legsWonCurrent = curSet?.legsWonByPlayer
      ? { ...curSet.legsWonByPlayer }
      : Object.fromEntries(players.map((pid) => [pid, 0]))
  }

  return { legsWonCurrent, setsWon }
}

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

// --- Component ---

type X01EndScreenProps = {
  matchId: string
  match: MatchStarted
  matchStored: StoredMatch | { id: string; title: string; matchName?: string; notes?: string; createdAt: string; events: DartsEvent[]; playerIds: string[]; finished?: boolean }
  events: DartsEvent[]
  state: ReturnType<typeof applyEvents>
  winnerName: string
  isSets: boolean
  playerColors: Record<string, string>
  onExit: () => void
  onRematch?: () => void
  onBackToLobby?: () => void
  /** Hide name/notes input on guest devices in multiplayer */
  isMultiplayerGuest?: boolean
  isArcade: boolean
  c: Record<string, string>
  saving?: boolean
}

export default function X01EndScreen({
  matchId,
  match,
  matchStored,
  events,
  state,
  winnerName,
  isSets,
  playerColors,
  onExit,
  onRematch,
  onBackToLobby,
  isMultiplayerGuest,
  saving,
}: X01EndScreenProps) {
  const [isMobile, setIsMobile] = useState(() => Math.min(window.innerWidth, window.innerHeight) < 600)
  useEffect(() => {
    const check = () => setIsMobile(Math.min(window.innerWidth, window.innerHeight) < 600)
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // Spielname + Bemerkungen Eingabe im Endscreen
  const [endscreenName, setEndscreenName] = useState(matchStored?.matchName ?? '')
  const [endscreenNotes, setEndscreenNotes] = useState(matchStored?.notes ?? '')
  const [metadataSaved, setMetadataSaved] = useState(
    matchStored?.matchName !== undefined || matchStored?.notes !== undefined
  )

  // Auto-dismiss after 2 minutes → go back to menu
  useEffect(() => {
    const timer = setTimeout(() => {
      onExit()
    }, 2 * 60 * 1000)
    return () => clearTimeout(timer)
  }, [onExit])

  const { legsWonCurrent, setsWon } = computeLegsAndSetsScore(match, state)
  const statsByPlayer = computeStats(events)
  const players = match.players
  const headerCells = players.map((p) => p.name ?? p.playerId)

  // Personal Bests pro Spieler berechnen
  const personalBests = useMemo(() => {
    const pbMap: Record<string, PersonalBestCheck[]> = {}
    for (const p of players) {
      const ps = statsByPlayer[p.playerId]
      if (!ps) continue
      const pbs = checkX01PersonalBests(p.playerId, ps)
      if (pbs.length > 0) {
        pbMap[p.playerId] = pbs
      }
    }
    return pbMap
  }, [players, statsByPlayer])

  type Row = { label: string; values: React.ReactNode[]; compareValues?: number[]; better?: 'high' | 'low' }
  const rows: Row[] = []
  const pids = players.map(p => p.playerId)

  // Platzierung berechnen (nach Sets oder Legs sortiert)
  const scoreForRank = isSets ? setsWon : legsWonCurrent
  const sortedByScore = [...players].sort((a, b) => (scoreForRank[b.playerId] ?? 0) - (scoreForRank[a.playerId] ?? 0))

  rows.push({
    label: 'Platz',
    values: players.map((p) => {
      return (
        <span key={p.playerId}>
          {getMedal(p.playerId, scoreForRank, sortedByScore)}
        </span>
      )
    }),
  })

  if (isSets) {
    rows.push({
      label: 'Sets gewonnen',
      values: players.map((p) => <span key={p.playerId}>{setsWon[p.playerId] ?? 0}</span>),
      compareValues: players.map(p => setsWon[p.playerId] ?? 0), better: 'high',
    })
  }

  rows.push({
    label: 'Legs gewonnen (aktuelles/letztes Set)',
    values: players.map((p) => <span key={p.playerId}>{legsWonCurrent[p.playerId] ?? 0}</span>),
    compareValues: players.map(p => legsWonCurrent[p.playerId] ?? 0), better: 'high',
  })

  const checkoutPcts = players.map(p => {
    const s: any = statsByPlayer[p.playerId] ?? {}
    const made = s.doublesHitDart ?? 0
    const att = s.doubleAttemptsDart ?? 0
    return { pct: att > 0 ? (made / att) * 100 : 0, made, att }
  })
  rows.push({
    label: 'Checkout-Quote (Darts)',
    values: players.map((p, i) => (
      <span key={p.playerId}>
        {checkoutPcts[i].pct.toFixed(1)}% <span className="g-dim">({checkoutPcts[i].made}/{checkoutPcts[i].att})</span>
      </span>
    )),
    compareValues: checkoutPcts.map(c => c.pct), better: 'high',
  })

  rows.push({
    label: '3-Dart Average (\u00D8)',
    values: players.map((p) => (
      <span key={p.playerId}>{(statsByPlayer[p.playerId]?.threeDartAvg ?? 0).toFixed(2)}</span>
    )),
    compareValues: players.map(p => statsByPlayer[p.playerId]?.threeDartAvg ?? 0), better: 'high',
  })

  rows.push({
    label: 'First-9 Average (\u00D8)',
    values: players.map((p) => (
      <span key={p.playerId}>{(statsByPlayer[p.playerId]?.first9OverallAvg ?? 0).toFixed(2)}</span>
    )),
    compareValues: players.map(p => statsByPlayer[p.playerId]?.first9OverallAvg ?? 0), better: 'high',
  })

  const pointsPerLeg = players.map(p => computePointsPerLegAvg(events, p.playerId))
  rows.push({
    label: 'Punkte pro Leg (\u00D8)',
    values: players.map((p, i) => <span key={p.playerId}>{pointsPerLeg[i].toFixed(1)}</span>),
    compareValues: pointsPerLeg, better: 'high',
  })

  // Höchste Aufnahme pro Spieler (über alle Legs)
  const highestVisitMatch: Record<string, number> = {}
  for (const p of players) highestVisitMatch[p.playerId] = 0
  for (const ev of events) {
    if (isVisitAdded(ev) && !ev.bust && ev.visitScore > (highestVisitMatch[ev.playerId] ?? 0)) {
      highestVisitMatch[ev.playerId] = ev.visitScore
    }
  }

  rows.push({
    label: 'Höchste Aufnahme',
    values: players.map((p) => {
      const hv = highestVisitMatch[p.playerId] ?? 0
      return <span key={p.playerId}>{hv > 0 ? hv : '\u2014'}</span>
    }),
    compareValues: players.map(p => highestVisitMatch[p.playerId] ?? 0), better: 'high',
  })

  rows.push({
    label: 'Bestes Leg',
    values: players.map((p) => {
      const best = statsByPlayer[p.playerId]?.bestLegDarts
      return <span key={p.playerId}>{best ? `${best} Darts` : '\u2014'}</span>
    }),
    compareValues: players.map(p => statsByPlayer[p.playerId]?.bestLegDarts ?? Infinity), better: 'low',
  })

  rows.push({
    label: 'Meistes Feld',
    values: players.map((p) => (
      <span key={p.playerId}>{computeMostHitField(events, null, p.playerId)}</span>
    )),
  })

  rows.push({
    label: 'Häufigste Punktzahl',
    values: players.map((p) => (
      <span key={p.playerId}>{computeMostCommonScore(events, null, p.playerId)}</span>
    )),
  })

  const handleSaveMetadata = () => {
    const success = setMatchMetadata(matchId, endscreenName, endscreenNotes)
    if (success) {
      setMetadataSaved(true)
    }
  }

  return (
    <div className="g-page" style={isMobile ? { padding: '8px 4px' } : undefined}>
      <div className="g-header" style={isMobile ? { flexDirection: 'column', gap: 8, alignItems: 'stretch' } : undefined}>
        <h2 className="g-title" style={isMobile ? { fontSize: 16 } : undefined}>
          {metadataSaved && endscreenName ? endscreenName : matchStored?.title ?? 'Match'} – beendet
        </h2>
        <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 8 }}>
          {onRematch && (
            <button className="g-btn" onClick={onRematch} style={{ fontWeight: 700, minHeight: isMobile ? 44 : undefined }}>
              ↻ Nochmal
            </button>
          )}
          {onBackToLobby && (
            <button className="g-btn" onClick={onBackToLobby} style={{ fontWeight: 700, minHeight: isMobile ? 44 : undefined }}>
              Neues Spiel
            </button>
          )}
          <button className="g-btn" onClick={onExit} style={isMobile ? { minHeight: 44 } : undefined}>
            {onBackToLobby ? '← Menü' : 'Zurück ins Menü'}
          </button>
        </div>
      </div>

      {saving && (
        <div style={{ fontSize: 13, color: '#6b7280', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <span style={{ display: 'inline-block', width: 14, height: 14, border: '2px solid currentColor', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          Speichern...
        </div>
      )}

      {/* Stats: Mobile 5+ = Cards per player, otherwise comparison table */}
      {isMobile && players.length >= 5 ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6, width: '100%', boxSizing: 'border-box', overflow: 'hidden' }}>
          {players.map((p) => {
            const isWinner = p.playerId === state.finished?.winnerPlayerId
            return (
              <div key={p.playerId} style={{
                padding: '4px 6px', borderRadius: 8, minWidth: 0, overflow: 'hidden',
                border: isWinner ? '2px solid #16a34a' : '1px solid #e5e7eb',
                background: isWinner ? '#f0fdf4' : '#fafafa',
              }}>
                <div style={{ fontWeight: 800, fontSize: 11, marginBottom: 3, color: isWinner ? '#16a34a' : '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {getMedal(p.playerId, scoreForRank, sortedByScore)} {p.name}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '0px 4px', fontSize: 10 }}>
                  {rows.filter(r => r.label !== 'Platz').map((r, ri) => {
                    const ci = players.indexOf(p)
                    const winColors = r.better && r.compareValues
                      ? getStatWinnerColors(r.compareValues, pids, r.better, playerColors)
                      : undefined
                    const isHighlight = winColors?.[ci]
                    // Shorter labels for cards
                    const shortLabel = r.label
                      .replace('Checkout-Quote (Darts)', 'CO %')
                      .replace('3-Dart Average (Ø)', 'Avg')
                      .replace('First-9 Average (Ø)', 'F9')
                      .replace('Punkte pro Leg (Ø)', 'Pkt/Leg')
                      .replace(/Legs gewonnen.*/, 'Legs')
                      .replace('Sets gewonnen', 'Sets')
                      .replace('Höchste Aufnahme', 'Höchste')
                      .replace('Bestes Leg', 'Best Leg')
                      .replace('Meistes Feld', 'Feld')
                      .replace('Häufigste Punktzahl', 'Häufigste')
                    return (
                      <React.Fragment key={ri}>
                        <span style={{ color: '#6b7280' }}>{shortLabel}</span>
                        <span style={{ fontWeight: 700, textAlign: 'right', color: isHighlight || undefined }}>{r.values[ci]}</span>
                      </React.Fragment>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="g-tableWrap" style={{ overflowX: 'hidden' }}>
          <table className="g-table" style={{ ...(isMobile ? { fontSize: 11 } : {}), tableLayout: 'fixed' }}>
            <thead>
              <tr>
                <th className="g-th"></th>
                {headerCells.map((h, i) => (
                  <th key={i} className="g-th" style={isMobile ? { fontSize: 10, padding: '4px 3px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } : undefined}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => {
                const winColors = r.better && r.compareValues
                  ? getStatWinnerColors(r.compareValues, pids, r.better, playerColors)
                  : undefined
                return (
                  <tr key={ri}>
                    <td className="g-tdh" style={{ fontWeight: 700, ...(isMobile ? { fontSize: 10, padding: '4px 3px', whiteSpace: 'nowrap' } : {}) }}>
                      {isMobile ? r.label.replace('Checkout-Quote (Darts)', 'CO %').replace('3-Dart Average (Ø)', 'Avg').replace('First-9 Average (Ø)', 'F9').replace('Punkte pro Leg (Ø)', 'Pkt/Leg').replace('Legs gewonnen (aktuelles/letztes Set)', 'Legs').replace('Sets gewonnen', 'Sets').replace('Höchste Aufnahme', 'Höchste').replace('Bestes Leg', 'Best Leg').replace('Meistes Feld', 'Feld').replace('Häufigste Punktzahl', 'Häufigste') : r.label}
                    </td>
                    {r.values.map((v, ci) => (
                      <td key={ci} className="g-td" style={{ ...(winColors?.[ci] ? { color: winColors[ci], fontWeight: 700 } : {}), ...(isMobile ? { fontSize: 11, padding: '4px 3px' } : {}) }}>
                        {v}
                      </td>
                    ))}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Spielbericht */}
      {(() => {
        // Legs-Daten für den Bericht sammeln
        const legIds: string[] = []
        const legWinners: Record<string, string | undefined> = {}
        const legDarts: Record<string, number> = {}
        const legCheckouts: Record<string, number | undefined> = {}
        const legHas180: Record<string, boolean> = {}
        const legByPlayer: Record<string, Array<{ playerId: string; name: string; threeDA: number; bestVisit: number; busts: number; darts: number }>> = {}

        for (const ev of events) {
          if (isLegStarted(ev) && !legIds.includes(ev.legId)) legIds.push(ev.legId)
          if (isLegFinished(ev)) {
            legWinners[ev.legId] = ev.winnerPlayerId
            legCheckouts[ev.legId] = ev.highestCheckoutThisLeg
          }
        }

        for (const legId of legIds) {
          const legVisits = events.filter((e): e is VisitAdded => isVisitAdded(e) && e.legId === legId)
          legDarts[legId] = legVisits.reduce((sum, v) => sum + v.darts.length, 0)
          legHas180[legId] = legVisits.some(v => v.visitScore === 180)

          const pMap: Record<string, { darts: number; points: number; best: number; busts: number }> = {}
          for (const p of players) pMap[p.playerId] = { darts: 0, points: 0, best: 0, busts: 0 }
          for (const v of legVisits) {
            if (!pMap[v.playerId]) continue
            pMap[v.playerId].darts += v.darts.length
            if (!v.bust) {
              pMap[v.playerId].points += v.visitScore
              if (v.visitScore > pMap[v.playerId].best) pMap[v.playerId].best = v.visitScore
            } else {
              pMap[v.playerId].busts++
            }
          }
          legByPlayer[legId] = players.map(p => ({
            playerId: p.playerId, name: p.name ?? p.playerId,
            threeDA: pMap[p.playerId].darts > 0 ? (pMap[p.playerId].points / pMap[p.playerId].darts) * 3 : 0,
            bestVisit: pMap[p.playerId].best, busts: pMap[p.playerId].busts, darts: pMap[p.playerId].darts,
          }))
        }

        const reportInput: MatchReportInput = {
          matchId, startingScore: match.startingScorePerLeg, isSets,
          players: players.map(p => ({ playerId: p.playerId, name: p.name ?? p.playerId })),
          winnerPlayerId: state.finished?.winnerPlayerId,
          legs: legIds.map((legId, i) => ({
            legIndex: i + 1, winnerPlayerId: legWinners[legId],
            dartsThrownTotal: legDarts[legId] ?? 0, byPlayer: legByPlayer[legId] ?? [],
            highestCheckout: legCheckouts[legId], has180: legHas180[legId] ?? false,
          })),
          overallStats: players.map(p => {
            const ps = statsByPlayer[p.playerId]
            return {
              playerId: p.playerId, name: p.name ?? p.playerId,
              threeDA: ps?.threeDartAvg ?? 0, checkoutPct: ps?.doublePctDart ?? 0,
              highestCheckout: ps?.highestCheckout ?? 0, tons180: ps?.bins._180 ?? 0,
              tons140plus: ps?.bins._140plus ?? 0, tons100plus: ps?.bins._100plus ?? 0,
              busts: ps?.busts ?? 0, dartsThrown: ps?.dartsThrown ?? 0,
              bestLegDarts: ps?.bestLegDarts ?? null,
            }
          }),
        }
        const report = generateMatchReport(reportInput)

        return report ? (
          <div style={{
            margin: isMobile ? '12px 0 0' : '16px 8px 0', padding: isMobile ? '12px 10px' : '16px 20px', borderRadius: 12,
            background: 'linear-gradient(135deg, #eff6ff, #dbeafe)',
            border: '1px solid #93c5fd',
          }}>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 8, color: '#1e40af' }}>
              Spielbericht
            </div>
            <div style={{ lineHeight: 1.7, fontSize: 14, color: '#1e293b' }}>
              {report}
            </div>
          </div>
        ) : null
      })()}

      {/* Personal Bests */}
      {Object.keys(personalBests).length > 0 && (
        <div style={{
          margin: isMobile ? '12px 0 0' : '16px 8px 0',
          padding: isMobile ? 10 : 16,
          background: 'linear-gradient(135deg, #fef9c3 0%, #fde68a 100%)',
          borderRadius: 12,
          border: '2px solid #f59e0b',
          boxShadow: '0 2px 8px rgba(245,158,11,0.25)',
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginBottom: 12,
            fontWeight: 700,
            fontSize: 16,
            color: '#92400e',
          }}>
            <span style={{ fontSize: 22 }}>{'\u{1F3C6}'}</span>
            Neuer persönlicher Rekord!
          </div>
          {Object.entries(personalBests).map(([playerId, pbs]) => {
            const playerName = players.find(p => p.playerId === playerId)?.name ?? playerId
            return (
              <div key={playerId} style={{ marginBottom: 8 }}>
                <div style={{
                  fontWeight: 600,
                  fontSize: 14,
                  color: '#78350f',
                  marginBottom: 4,
                }}>
                  {playerName}
                </div>
                {pbs.map((pb, i) => (
                  <div key={i} style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '6px 10px',
                    background: 'rgba(255,255,255,0.6)',
                    borderRadius: 8,
                    marginBottom: 4,
                    fontSize: 14,
                  }}>
                    <span style={{ fontSize: 16 }}>{'\u2B50'}</span>
                    <span style={{ fontWeight: 600, color: '#92400e' }}>{pb.category}</span>
                    <span style={{ marginLeft: 'auto', color: '#78350f' }}>
                      <span style={{ textDecoration: 'line-through', opacity: 0.5, marginRight: 6 }}>
                        {formatPBValue(pb.category, pb.previousBest)}
                      </span>
                      <span style={{ fontWeight: 700, fontSize: 16 }}>
                        {formatPBValue(pb.category, pb.newBest)}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      )}

      {/* Spielname + Bemerkungen */}
      <div style={{ marginTop: 16, padding: '0 8px' }}>
        {metadataSaved ? (
          // Nach dem Speichern: nur Anzeige
          <div style={{ background: '#f8fafc', borderRadius: 8, padding: 12 }}>
            {endscreenName && (
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>Spielname</div>
                <div>{endscreenName}</div>
              </div>
            )}
            {endscreenNotes && (
              <div>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>Bemerkungen</div>
                <div style={{ whiteSpace: 'pre-wrap' }}>{endscreenNotes}</div>
              </div>
            )}
            {!endscreenName && !endscreenNotes && (
              <div style={{ color: '#6b7280' }}>Keine Spielinfo gespeichert</div>
            )}
          </div>
        ) : isMultiplayerGuest ? (
          // Guest in multiplayer: no editing, host handles metadata
          <div style={{ color: '#6b7280', textAlign: 'center', padding: 12 }}>
            Spielname & Bemerkungen werden vom Host eingegeben.
          </div>
        ) : (
          // Host / local: Eingabefelder
          <div style={{ background: '#f8fafc', borderRadius: 8, padding: 12 }}>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>
                Spielname (optional)
              </label>
              <input
                type="text"
                value={endscreenName}
                onChange={(e) => setEndscreenName(e.target.value)}
                placeholder="z.B. Finale WM 2024"
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: 6,
                  border: '1px solid #d1d5db',
                  fontSize: 14,
                  boxSizing: 'border-box',
                }}
              />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>
                Bemerkungen (optional)
              </label>
              <textarea
                value={endscreenNotes}
                onChange={(e) => setEndscreenNotes(e.target.value)}
                placeholder="Besonderheiten, Highlights, etc."
                rows={3}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: 6,
                  border: '1px solid #d1d5db',
                  fontSize: 14,
                  resize: 'vertical',
                  boxSizing: 'border-box',
                }}
              />
            </div>
            <button
              className="g-btn"
              onClick={handleSaveMetadata}
              style={{ width: '100%' }}
            >
              Speichern
            </button>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
        {onRematch && (
          <button className="g-btn" onClick={onRematch} style={{ fontWeight: 700, minHeight: isMobile ? 44 : undefined }}>
            ↻ Nochmal
          </button>
        )}
        {onBackToLobby && (
          <button className="g-btn" onClick={onBackToLobby} style={{ fontWeight: 700, minHeight: isMobile ? 44 : undefined }}>
            Neues Spiel
          </button>
        )}
        <button className="g-btn" onClick={onExit} style={isMobile ? { minHeight: 44 } : undefined}>
          {onBackToLobby ? '← Menü' : 'Zurück ins Menü'}
        </button>
      </div>
    </div>
  )
}
