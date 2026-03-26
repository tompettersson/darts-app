// src/components/X01IntermissionScreen.tsx
// Extracted from Game.tsx — Intermission/Leg Summary overlay

import React, { useState } from 'react'
import {
  type DartsEvent,
  type MatchStarted,
  type VisitAdded,
  computeStats,
  isMatchStarted,
  isLegStarted,
  isLegFinished,
  isVisitAdded,
  isSetStarted,
  isSetFinished,
  type LegStarted,
  type LegFinished,
  type SetStarted,
  type SetFinished,
} from '../darts501'
import ScoreProgressionChart, { PLAYER_COLORS } from './ScoreProgressionChart'
import LegStaircaseChart, { type LegVisit } from './LegStaircaseChart'
import { generateLegReport, type LegReportInput } from '../narratives/generateReport'

// ---- Types ----

type Intermission =
  | {
      kind: 'leg'
      legId: string
      legIndex?: number
      setIndex?: number
      pendingNextEvents: DartsEvent[]
    }
  | {
      kind: 'set'
      setIndex: number
      winnerPlayerId?: string
      pendingNextEvents: DartsEvent[]
    }

type LegSummary = {
  legId: string
  legIndex?: number
  setIndex?: number
  startedAt?: string
  finishedAt?: string
  starterPlayerId?: string
  winnerPlayerId?: string
  highestCheckout?: number
  dartsThrownTotal: number
  turnsTotal: number
  bestVisit: number
  bustsTotal: number
  byPlayer: Array<{
    playerId: string
    name: string
    points: number
    darts: number
    turns: number
    threeDA: number
    bestVisit: number
    busts: number
  }>
  visits: Array<{
    eventId: string
    ts?: string
    playerId: string
    playerName: string
    dartsLabel: string
    visitScore: number
    bust: boolean
    remainingBefore: number
    remainingAfter: number
  }>
}

// ---- Helper Functions ----

function fmtClock(ts?: string) {
  if (!ts) return '—'
  try {
    return new Date(ts).toLocaleTimeString()
  } catch {
    return '—'
  }
}

function dartLabelShort(d: any) {
  const mult = d?.mult ?? 1
  const bed = d?.bed
  const prefix = mult === 3 ? 'T' : mult === 2 ? 'D' : 'S'
  if (bed === 'MISS') return 'MISS'
  if (bed === 'DBULL') return 'DBULL'
  if (bed === 'BULL') return 'BULL'
  if (typeof bed === 'number') return `${prefix}${bed}`
  return '—'
}

function fmtDart(d: { bed: any; mult: 1 | 2 | 3 }) {
  const prefix = d.mult === 3 ? 'T' : d.mult === 2 ? 'D' : ''
  if (typeof d.bed === 'number') return `${prefix}${d.bed}`
  if (d.bed === 'BULL') return d.mult === 2 ? 'Bull' : '25'
  if (d.bed === 'DBULL') return 'Bull'
  return 'Miss'
}

function computeLegStats(allEvents: DartsEvent[], match: MatchStarted, legId: string) {
  const legEvents = allEvents.filter((e) => {
    if (isMatchStarted(e)) return true
    if ('legId' in e) return e.legId === legId
    return false
  })
  return computeStats(legEvents)
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
  return `${sorted[0][0]} (${sorted[0][1]}×)`
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
  return `${sorted[0][0]} (${sorted[0][1]}×)`
}

function buildLegSummary(allEvents: DartsEvent[], match: MatchStarted, legId: string): LegSummary {
  const ls = allEvents.find((e): e is LegStarted => isLegStarted(e) && e.legId === legId)
  const lf = allEvents.find((e): e is LegFinished => isLegFinished(e) && e.legId === legId)

  const startedAt = ls?.ts
  const finishedAt = lf?.ts
  const starterPlayerId = ls?.starterPlayerId
  const winnerPlayerId = lf?.winnerPlayerId
  const highestCheckout = lf?.highestCheckoutThisLeg ?? undefined

  const visitsRaw = allEvents.filter((e): e is VisitAdded => isVisitAdded(e) && e.legId === legId)

  const nameOf = (pid: string) => match.players.find((p) => p.playerId === pid)?.name ?? pid

  const byPlayerMap: Record<
    string,
    {
      playerId: string
      name: string
      points: number
      darts: number
      turns: number
      bestVisit: number
      busts: number
    }
  > = {}

  for (const p of match.players) {
    byPlayerMap[p.playerId] = {
      playerId: p.playerId,
      name: p.name ?? p.playerId,
      points: 0,
      darts: 0,
      turns: 0,
      bestVisit: 0,
      busts: 0,
    }
  }

  let dartsThrownTotal = 0
  let turnsTotal = 0
  let bestVisit = 0
  let bustsTotal = 0

  const visits = visitsRaw.map((v) => {
    const bust = !!v.bust
    const visitScore = bust ? 0 : (v.visitScore ?? 0)
    const darts = Array.isArray(v.darts) ? v.darts : []
    const dartsLabel = darts.map(dartLabelShort).join(' · ')

    const pl =
      byPlayerMap[v.playerId] ??
      (byPlayerMap[v.playerId] = {
        playerId: v.playerId,
        name: nameOf(v.playerId),
        points: 0,
        darts: 0,
        turns: 0,
        bestVisit: 0,
        busts: 0,
      })

    pl.turns += 1
    pl.darts += darts.length
    pl.points += visitScore
    pl.bestVisit = Math.max(pl.bestVisit, visitScore)
    if (bust) pl.busts += 1

    turnsTotal += 1
    dartsThrownTotal += darts.length
    bestVisit = Math.max(bestVisit, visitScore)
    if (bust) bustsTotal += 1

    return {
      eventId: v.eventId,
      ts: v.ts,
      playerId: v.playerId,
      playerName: nameOf(v.playerId),
      dartsLabel,
      visitScore,
      bust,
      remainingBefore: v.remainingBefore ?? 0,
      remainingAfter: v.remainingAfter ?? 0,
    }
  })

  const byPlayer = Object.values(byPlayerMap)
    .map((p) => ({
      ...p,
      threeDA: p.darts > 0 ? (p.points / p.darts) * 3 : 0,
    }))
    .sort((a, b) => b.points - a.points)

  return {
    legId,
    legIndex: ls?.legIndex,
    setIndex: undefined,
    startedAt,
    finishedAt,
    starterPlayerId,
    winnerPlayerId,
    highestCheckout,
    dartsThrownTotal,
    turnsTotal,
    bestVisit,
    bustsTotal,
    byPlayer,
    visits,
  }
}

function getLegIdsForSet(allEvents: DartsEvent[], setIndex: number): string[] {
  const startIdx = allEvents.findIndex((e): e is SetStarted => isSetStarted(e) && e.setIndex === setIndex)
  if (startIdx < 0) return []
  const endIdx = allEvents.findIndex(
    (e, i): e is SetFinished => i > startIdx && isSetFinished(e) && e.setIndex === setIndex
  )
  const slice = allEvents.slice(startIdx, endIdx >= 0 ? endIdx + 1 : allEvents.length)
  const legFinishedEvents = slice.filter(isLegFinished)
  const legIds: string[] = []
  for (const lf of legFinishedEvents) {
    if (lf.legId && !legIds.includes(lf.legId)) legIds.push(lf.legId)
  }
  return legIds
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

// ---- Props ----

export type X01IntermissionScreenProps = {
  intermission: Intermission
  events: DartsEvent[]
  match: MatchStarted
  playerColors: Record<string, string>
  isArcade: boolean
  onContinue: () => void
}

// ---- Component ----

export default function X01IntermissionScreen({
  intermission,
  events,
  match,
  playerColors,
  isArcade,
  onContinue,
}: X01IntermissionScreenProps) {
  const [showDetails, setShowDetails] = useState(false)
  const [legChartMode, setLegChartMode] = useState<'progression' | 'staircase'>('staircase')
  const [viewMode, setViewMode] = useState<'stats' | 'bericht'>('stats')

  return (
    <div className="g-overlay" role="dialog" aria-modal="true">
      <div className="g-modal">
        <div className="g-modalHeader">
          <div>
            <div className="g-modalTitle">
              {intermission.kind === 'leg'
                ? `Leg Summary${intermission.legIndex ? ` · Leg #${intermission.legIndex}` : ''}`
                : `Set Summary · Set #${intermission.setIndex}`}
            </div>
            <div className="g-modalSub">Klick auf „Details" zeigt den ausführlichen Verlauf.</div>
          </div>

          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button
              className="g-btn"
              onClick={() => setViewMode(v => v === 'stats' ? 'bericht' : 'stats')}
              style={viewMode === 'bericht' ? { background: '#2563eb', color: '#fff', fontSize: 13 } : { fontSize: 13 }}
            >
              {viewMode === 'stats' ? 'Bericht' : 'Stats'}
            </button>
            <button className="g-btn" onClick={() => setShowDetails((v) => !v)} style={{ fontSize: 13 }}>
              {showDetails ? 'Details verbergen' : 'Details anzeigen'}
            </button>
            <button
              className="g-btn"
              onClick={onContinue}
              style={{ fontSize: 13 }}
            >
              Weiter →
            </button>
          </div>
        </div>

        {intermission.kind === 'leg' ? (
          (() => {
            const sum = buildLegSummary(events, match, intermission.legId)
            const legStats = computeLegStats(events, match, intermission.legId)
            const winnerName = sum.winnerPlayerId
              ? match.players.find((p) => p.playerId === sum.winnerPlayerId)?.name ?? sum.winnerPlayerId
              : '—'

            // Zwischenstand nach diesem Leg berechnen
            const legWinsAfterThis: Record<string, number> = {}
            match.players.forEach((p) => { legWinsAfterThis[p.playerId] = 0 })
            // Alle LegFinished Events bis einschließlich dieses Legs zählen
            for (const ev of events) {
              if (isLegFinished(ev)) {
                if (ev.winnerPlayerId) {
                  legWinsAfterThis[ev.winnerPlayerId] = (legWinsAfterThis[ev.winnerPlayerId] ?? 0) + 1
                }
                if (ev.legId === intermission.legId) break
              }
            }
            const scoreAfterLeg = match.players.map((p) => legWinsAfterThis[p.playerId]).join(' : ')

            // 61+ berechnen (nicht in bins)
            const bins61plus: Record<string, number> = {}
            match.players.forEach((p) => { bins61plus[p.playerId] = 0 })
            sum.visits.forEach((v: any) => {
              if (v.visitScore >= 61 && v.visitScore < 100) {
                bins61plus[v.playerId] = (bins61plus[v.playerId] || 0) + 1
              }
            })

            // Höchste Aufnahme pro Spieler
            const highestVisit: Record<string, number> = {}
            match.players.forEach((p) => { highestVisit[p.playerId] = 0 })
            sum.visits.forEach((v: any) => {
              if (!v.bust && v.visitScore > (highestVisit[v.playerId] ?? 0)) {
                highestVisit[v.playerId] = v.visitScore
              }
            })

            // Checkout-Info pro Spieler (aus Visit mit remainingAfter === 0)
            const checkoutInfo: Record<string, { height: number; lastDart: string }> = {}
            sum.visits.forEach((v: any) => {
              if (v.remainingAfter === 0 && !v.bust) {
                // Finde den letzten Dart der tatsächlich getroffen hat
                const dartsArr = v.dartsLabel?.split(' · ') ?? []
                const lastDart = dartsArr[dartsArr.length - 1] || '—'
                checkoutInfo[v.playerId] = {
                  height: v.remainingBefore,
                  lastDart: lastDart,
                }
              }
            })

            // Rest pro Spieler
            const restByPlayer: Record<string, number> = {}
            match.players.forEach((p) => { restByPlayer[p.playerId] = match.startingScorePerLeg })
            sum.visits.forEach((v: any) => {
              restByPlayer[v.playerId] = v.remainingAfter
            })

            // Spielzeit
            let legDuration = ''
            if (sum.startedAt && sum.finishedAt) {
              const start = new Date(sum.startedAt).getTime()
              const end = new Date(sum.finishedAt).getTime()
              const diffMs = end - start
              const mins = Math.floor(diffMs / 60000)
              const secs = Math.floor((diffMs % 60000) / 1000)
              legDuration = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
            }

            // Table Styles (compact for mobile)
            const isMobileSummary = typeof window !== 'undefined' && window.innerWidth < 500
            const thLeft: React.CSSProperties = { textAlign: 'left', fontSize: isMobileSummary ? 11 : 12, fontWeight: 600, color: '#475569', padding: isMobileSummary ? '4px 4px' : '6px 8px', borderBottom: '2px solid #e5e7eb' }
            const thRight: React.CSSProperties = { textAlign: 'right', fontSize: isMobileSummary ? 11 : 12, fontWeight: 700, color: '#0f172a', padding: isMobileSummary ? '4px 4px' : '6px 8px', borderBottom: '2px solid #e5e7eb' }
            const tdLeft: React.CSSProperties = { padding: isMobileSummary ? '4px 4px' : '6px 8px', borderBottom: '1px solid #f1f5f9', fontWeight: 500, color: '#374151', fontSize: isMobileSummary ? 11 : 13, whiteSpace: 'nowrap' }
            const tdRight: React.CSSProperties = { padding: isMobileSummary ? '4px 4px' : '6px 8px', borderBottom: '1px solid #f1f5f9', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600, fontSize: isMobileSummary ? 12 : 13 }
            const tdWin = (c: string | undefined): React.CSSProperties => c ? { ...tdRight, color: c, fontWeight: 700 } : tdRight

            // Winner-Farben für Leg-Statistik
            const legPids = match.players.map(p => p.playerId)
            const avgWin = getStatWinnerColors(match.players.map(p => legStats[p.playerId]?.threeDartAvg ?? 0), legPids, 'high', playerColors)
            const f9Win = getStatWinnerColors(match.players.map(p => legStats[p.playerId]?.first9OverallAvg ?? 0), legPids, 'high', playerColors)
            const w180 = getStatWinnerColors(match.players.map(p => legStats[p.playerId]?.bins?._180 ?? 0), legPids, 'high', playerColors)
            const w140 = getStatWinnerColors(match.players.map(p => legStats[p.playerId]?.bins?._140plus ?? 0), legPids, 'high', playerColors)
            const w100 = getStatWinnerColors(match.players.map(p => legStats[p.playerId]?.bins?._100plus ?? 0), legPids, 'high', playerColors)
            const w61 = getStatWinnerColors(match.players.map(p => bins61plus[p.playerId] ?? 0), legPids, 'high', playerColors)
            const hvWin = getStatWinnerColors(match.players.map(p => highestVisit[p.playerId] ?? 0), legPids, 'high', playerColors)
            const coWin = getStatWinnerColors(match.players.map(p => legStats[p.playerId]?.doublePctDart ?? 0), legPids, 'high', playerColors)
            const restWin = getStatWinnerColors(match.players.map(p => restByPlayer[p.playerId]), legPids, 'low', playerColors)
            const dartsWin = getStatWinnerColors(sum.byPlayer.map(bp => bp.darts), legPids, 'low', playerColors)

            return (
              <>
                {/* Zwischenstand groß oben */}
                <div style={{ textAlign: 'center', padding: isMobileSummary ? '6px 0' : '12px 0', marginBottom: isMobileSummary ? 4 : 8 }}>
                  <div style={{ fontSize: isMobileSummary ? 11 : 13, color: '#6b7280', marginBottom: 2 }}>Zwischenstand nach Leg {intermission.legIndex ?? '?'}</div>
                  <div style={{ fontSize: isMobileSummary ? 24 : 32, fontWeight: 900, color: '#0f172a', letterSpacing: 2 }}>
                    {scoreAfterLeg}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'center', gap: 24, marginTop: 4 }}>
                    {match.players.map((p) => (
                      <span key={p.playerId} style={{ fontSize: 13, color: '#6b7280' }}>{p.name}</span>
                    ))}
                  </div>
                </div>

                {/* Sieger-Banner */}
                <div style={{ textAlign: 'center', padding: '8px 0', fontWeight: 800, fontSize: 16, color: '#16a34a' }}>
                  Sieger: {winnerName}
                  {checkoutInfo[sum.winnerPlayerId ?? ''] && (
                    <span style={{ fontWeight: 500, fontSize: 13, color: '#6b7280', marginLeft: 8 }}>
                      (Checkout: {checkoutInfo[sum.winnerPlayerId ?? ''].height})
                    </span>
                  )}
                </div>

                {/* Spielbericht oder Statistik-Tabelle */}
                {viewMode === 'bericht' ? (
                  <div style={{
                    padding: '16px 20px', margin: '8px 0', borderRadius: 8,
                    background: '#f8fafc', border: '1px solid #e2e8f0',
                    lineHeight: 1.7, fontSize: 14, color: '#1e293b',
                  }}>
                    <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 8, color: '#0f172a' }}>
                      Spielbericht — Leg {intermission.legIndex ?? '?'}
                    </div>
                    {generateLegReport({
                      legId: sum.legId,
                      legIndex: sum.legIndex,
                      starterPlayerId: sum.starterPlayerId,
                      winnerPlayerId: sum.winnerPlayerId,
                      highestCheckout: sum.highestCheckout,
                      dartsThrownTotal: sum.dartsThrownTotal,
                      bestVisit: sum.bestVisit,
                      byPlayer: sum.byPlayer,
                      visits: sum.visits,
                      startingScore: match.startingScorePerLeg,
                    })}
                  </div>
                ) : (
                <>
                {/* Statistik-Tabelle wie in MatchDetails */}
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <th style={thLeft}></th>
                        {match.players.map((p) => (
                          <th key={p.playerId} style={thRight}>{p.name}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td style={tdLeft}>Average</td>
                        {match.players.map((p, i) => (
                          <td key={p.playerId} style={tdWin(avgWin[i])}>{(legStats[p.playerId]?.threeDartAvg ?? 0).toFixed(1)}</td>
                        ))}
                      </tr>
                      <tr>
                        <td style={tdLeft}>First Nine</td>
                        {match.players.map((p, i) => (
                          <td key={p.playerId} style={tdWin(f9Win[i])}>{(legStats[p.playerId]?.first9OverallAvg ?? 0).toFixed(1)}</td>
                        ))}
                      </tr>
                      <tr>
                        <td style={tdLeft}>180s</td>
                        {match.players.map((p, i) => (
                          <td key={p.playerId} style={tdWin(w180[i])}>{legStats[p.playerId]?.bins?._180 ?? 0}</td>
                        ))}
                      </tr>
                      <tr>
                        <td style={tdLeft}>140+</td>
                        {match.players.map((p, i) => (
                          <td key={p.playerId} style={tdWin(w140[i])}>{legStats[p.playerId]?.bins?._140plus ?? 0}</td>
                        ))}
                      </tr>
                      <tr>
                        <td style={tdLeft}>100+</td>
                        {match.players.map((p, i) => (
                          <td key={p.playerId} style={tdWin(w100[i])}>{legStats[p.playerId]?.bins?._100plus ?? 0}</td>
                        ))}
                      </tr>
                      <tr>
                        <td style={tdLeft}>61+</td>
                        {match.players.map((p, i) => (
                          <td key={p.playerId} style={tdWin(w61[i])}>{bins61plus[p.playerId] ?? 0}</td>
                        ))}
                      </tr>
                      <tr>
                        <td style={tdLeft}>Höchste Aufnahme</td>
                        {match.players.map((p, i) => (
                          <td key={p.playerId} style={tdWin(hvWin[i])}>{highestVisit[p.playerId] ?? 0}</td>
                        ))}
                      </tr>
                      <tr>
                        <td style={tdLeft}>Darts geworfen</td>
                        {match.players.map((p, i) => {
                          const bp = sum.byPlayer.find(b => b.playerId === p.playerId)
                          return (
                            <td key={p.playerId} style={tdWin(dartsWin[i])}>{bp?.darts ?? 0}</td>
                          )
                        })}
                      </tr>
                      <tr>
                        <td style={tdLeft}>Meistes Feld</td>
                        {match.players.map((p) => (
                          <td key={p.playerId} style={tdRight}>{computeMostHitField(events, intermission.legId, p.playerId)}</td>
                        ))}
                      </tr>
                      <tr>
                        <td style={tdLeft}>Häufigste Punktzahl</td>
                        {match.players.map((p) => (
                          <td key={p.playerId} style={tdRight}>{computeMostCommonScore(events, intermission.legId, p.playerId)}</td>
                        ))}
                      </tr>

                      <tr><td colSpan={match.players.length + 1} style={{ borderBottom: '2px solid #e5e7eb', padding: '4px 0' }}></td></tr>

                      <tr>
                        <td style={tdLeft}>Checkout Höhe</td>
                        {match.players.map((p) => {
                          const info = checkoutInfo[p.playerId]
                          return <td key={p.playerId} style={tdRight}>{info ? `${info.height} (${info.lastDart})` : '–'}</td>
                        })}
                      </tr>
                      <tr>
                        <td style={tdLeft}>Checkout Versuche</td>
                        {match.players.map((p) => {
                          const attempts = legStats[p.playerId]?.doubleAttemptsDart ?? 0
                          const hits = legStats[p.playerId]?.doublesHitDart ?? 0
                          return <td key={p.playerId} style={tdRight}>{attempts} / {hits}</td>
                        })}
                      </tr>
                      <tr>
                        <td style={tdLeft}>Checkout Quote</td>
                        {match.players.map((p, i) => (
                          <td key={p.playerId} style={tdWin(coWin[i])}>{(legStats[p.playerId]?.doublePctDart ?? 0).toFixed(0)} %</td>
                        ))}
                      </tr>
                      <tr>
                        <td style={tdLeft}>Rest</td>
                        {match.players.map((p, i) => (
                          <td key={p.playerId} style={tdWin(restWin[i])}>{restByPlayer[p.playerId]}</td>
                        ))}
                      </tr>

                      <tr><td colSpan={match.players.length + 1} style={{ borderBottom: '2px solid #e5e7eb', padding: '4px 0' }}></td></tr>

                      <tr>
                        <td style={tdLeft}>Spielzeit</td>
                        <td colSpan={match.players.length} style={{ ...tdRight, textAlign: 'center' }}>{legDuration || '–'}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Chart Toggle */}
                <div style={{
                  display: 'flex',
                  gap: 4,
                  marginTop: 16,
                  marginBottom: 8,
                }}>
                  <button
                    onClick={() => setLegChartMode('staircase')}
                    style={{
                      flex: 1,
                      padding: '8px 12px',
                      borderRadius: 6,
                      border: legChartMode === 'staircase' ? '2px solid #f97316' : '1px solid #e5e7eb',
                      background: legChartMode === 'staircase' ? '#fff7ed' : '#fff',
                      color: legChartMode === 'staircase' ? '#ea580c' : '#6b7280',
                      fontWeight: 600,
                      fontSize: 12,
                      cursor: 'pointer',
                    }}
                  >
                    📊 Staircase
                  </button>
                  <button
                    onClick={() => setLegChartMode('progression')}
                    style={{
                      flex: 1,
                      padding: '8px 12px',
                      borderRadius: 6,
                      border: legChartMode === 'progression' ? '2px solid #f97316' : '1px solid #e5e7eb',
                      background: legChartMode === 'progression' ? '#fff7ed' : '#fff',
                      color: legChartMode === 'progression' ? '#ea580c' : '#6b7280',
                      fontWeight: 600,
                      fontSize: 12,
                      cursor: 'pointer',
                    }}
                  >
                    📈 Verlauf
                  </button>
                </div>

                {/* Chart-Ansicht basierend auf Modus */}
                {legChartMode === 'staircase' ? (
                  /* Staircase-Visualisierung für den Gewinner */
                  (() => {
                    const winnerId = sum.winnerPlayerId
                    const winnerPlayer = match.players.find(p => p.playerId === winnerId)

                    // Hole die rohen VisitAdded Events (haben darts Property)
                    const rawVisits = events.filter((e): e is VisitAdded =>
                      isVisitAdded(e) && e.legId === intermission.legId && e.playerId === winnerId
                    )

                    const totalDarts = rawVisits.reduce((acc, v) => acc + v.darts.length, 0)
                    const lastVisit = rawVisits[rawVisits.length - 1]
                    const checkoutHeight = lastVisit?.remainingBefore
                    const lastDart = lastVisit?.darts?.[lastVisit.darts.length - 1]
                    const finishingDart = lastDart ? fmtDart(lastDart) : undefined

                    // Visits in LegVisit-Format konvertieren
                    const legVisits: LegVisit[] = rawVisits.map((v) => ({
                      visitScore: v.visitScore,
                      remainingBefore: v.remainingBefore,
                      remainingAfter: v.remainingAfter,
                      bust: v.bust,
                      darts: v.darts.map((d) => ({
                        bed: d.bed,
                        mult: d.mult,
                        score: d.score ?? 0,
                      })),
                    }))

                    return (
                      <LegStaircaseChart
                        startScore={match.startingScorePerLeg}
                        visits={legVisits}
                        playerName={winnerPlayer?.name ?? winnerId ?? 'Spieler'}
                        playerColor={winnerId ? (playerColors[winnerId] ?? PLAYER_COLORS[match.players.findIndex(p => p.playerId === winnerId) % PLAYER_COLORS.length]) : PLAYER_COLORS[0]}
                        totalDarts={totalDarts}
                        checkoutHeight={checkoutHeight}
                        finishingDart={finishingDart}
                        showHeader={true}
                      />
                    )
                  })()
                ) : (
                  /* Klassischer Score Progression Chart */
                  (() => {
                    // Hole die rohen VisitAdded Events für alle Spieler
                    const allRawVisits = events.filter((e): e is VisitAdded =>
                      isVisitAdded(e) && e.legId === intermission.legId
                    )

                    return (
                      <div style={{
                        height: 270,
                        background: isArcade ? '#0a0a0a' : '#f8fafc',
                        borderRadius: 8,
                        overflow: 'hidden',
                      }}>
                        <ScoreProgressionChart
                          startScore={match.startingScorePerLeg}
                          players={match.players.map((p, index) => ({
                            id: p.playerId,
                            name: p.name ?? p.playerId,
                            color: playerColors[p.playerId] ?? PLAYER_COLORS[index % PLAYER_COLORS.length],
                            visits: allRawVisits
                              .filter((v) => v.playerId === p.playerId)
                              .map((v, i) => ({
                                visitIndex: i + 1,
                                remainingBefore: v.remainingBefore,
                                remainingAfter: v.remainingAfter,
                                bust: v.bust,
                                dartScores: v.darts.map((d) => d.score ?? 0),
                              })),
                          }))}
                          winnerPlayerId={sum.winnerPlayerId}
                          showCheckoutLine={true}
                          showFinishLine={true}
                        />
                      </div>
                    )
                  })()
                )}

                </>
                )}

                {/* Wurfabfolge */}
                {showDetails && (
                  <div className="g-details" style={{ marginTop: 12 }}>
                    <div className="g-detailsTitle">Wurfabfolge</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {sum.visits.map((v: any, idx: number) => {
                        const color = '#6b7280'
                        const darts = v.darts?.map(fmtDart) ?? []
                        return (
                          <div
                            key={v.eventId || idx}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 12,
                              padding: '8px 12px',
                              background: v.bust ? '#fef2f2' : '#f8fafc',
                              borderLeft: `4px solid ${v.bust ? '#ef4444' : color}`,
                              borderRadius: '0 6px 6px 0',
                              fontSize: 14,
                            }}
                          >
                            <span style={{ fontWeight: 700, minWidth: 80 }}>{v.playerName}</span>
                            <span style={{ minWidth: 120, fontFamily: 'monospace' }}>
                              {darts[0] || '—'} · {darts[1] || '—'} · {darts[2] || '—'}
                            </span>
                            <span style={{ fontWeight: 600, minWidth: 50 }}>= {v.visitScore}</span>
                            <span style={{ color: '#6b7280' }}>Rest: {v.remainingAfter}</span>
                            {v.bust && <span style={{ color: '#ef4444', fontWeight: 600 }}>BUST</span>}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </>
            )
          })()
        ) : (
          (() => {
            const legIds = getLegIdsForSet(events, intermission.setIndex)
            const legs = legIds.map((legId) => {
              const s = buildLegSummary(events, match, legId)
              s.setIndex = intermission.setIndex
              return s
            })

            const winnerName = intermission.winnerPlayerId
              ? match.players.find((p) => p.playerId === intermission.winnerPlayerId)?.name ?? intermission.winnerPlayerId
              : '—'

            return (
              <>
                <div className="g-summaryGrid">
                  <div className="g-summaryTile">
                    <div className="g-k">Set-Sieger</div>
                    <div className="g-v">{winnerName}</div>
                  </div>
                  <div className="g-summaryTile">
                    <div className="g-k">Legs im Set</div>
                    <div className="g-v">{legs.length}</div>
                  </div>
                </div>

                <div className="g-details">
                  <div className="g-detailsTitle">Leg Summaries (im Set)</div>

                  <div className="g-visitList">
                    {legs.map((sum) => {
                      const wName = sum.winnerPlayerId
                        ? match.players.find((p) => p.playerId === sum.winnerPlayerId)?.name ?? sum.winnerPlayerId
                        : '—'
                      return (
                        <div key={sum.legId} className="g-legCard">
                          <div className="g-legCardTop">
                            <div style={{ fontWeight: 900 }}>Leg #{sum.legIndex ?? '—'} · Sieger: {wName}</div>
                            <div className="g-dim">
                              {fmtClock(sum.startedAt)} → {fmtClock(sum.finishedAt)}
                            </div>
                          </div>

                          <div className="g-legCardGrid">
                            <div className="g-legMini">
                              <div className="g-k">Checkout</div>
                              <div className="g-v">{sum.highestCheckout ?? 0}</div>
                            </div>
                            <div className="g-legMini">
                              <div className="g-k">Darts</div>
                              <div className="g-v">{sum.dartsThrownTotal}</div>
                            </div>
                            <div className="g-legMini">
                              <div className="g-k">Best Visit</div>
                              <div className="g-v">{sum.bestVisit}</div>
                            </div>
                            <div className="g-legMini">
                              <div className="g-k">Busts</div>
                              <div className="g-v">{sum.bustsTotal}</div>
                            </div>
                          </div>

                          {showDetails && (
                            <div className="g-subDetails">
                              <div className="g-detailsTitle" style={{ marginTop: 10 }}>
                                Verlauf
                              </div>
                              <div className="g-visitList">
                                {sum.visits.map((v) => (
                                  <div key={v.eventId} className={`g-visit ${v.bust ? 'is-bust' : ''}`}>
                                    <div className="g-visitTop">
                                      <div>
                                        <b>{v.playerName}</b> · {v.dartsLabel}
                                      </div>
                                      <div className="g-dim">{fmtClock(v.ts)}</div>
                                    </div>
                                    <div className="g-visitBottom">
                                      <div>
                                        Score: <b>{v.visitScore}</b>
                                        {v.bust ? ' (BUST)' : ''}
                                      </div>
                                      <div className="g-dim">
                                        Rest: {v.remainingBefore} → <b>{v.remainingAfter}</b>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              </>
            )
          })()
        )}
      </div>
    </div>
  )
}
