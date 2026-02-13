// src/screens/MatchDetails.tsx
import React, { useMemo, useState } from 'react'
import { loadMatchById, getProfiles } from '../storage'
import {
  applyEvents,
  computeStats,
  type DartsEvent,
  type MatchStarted,
  type LegFinished,
  type MatchFinished,
  type SetFinished,
  type VisitAdded,
  type LegStarted,
  // Type Guards
  isMatchStarted,
  isMatchFinished,
  isLegStarted,
} from '../darts501'
import { getThemedUI } from '../ui'
import { useTheme } from '../ThemeProvider'
import MatchHeader, { type MatchHeaderPlayer } from '../components/MatchHeader'
import LegHeader, { type LegHeaderPlayer } from '../components/LegHeader'
import ScoreProgressionChart, { PLAYER_COLORS } from '../components/ScoreProgressionChart'
import X01StaircaseChart from '../components/X01StaircaseChart'
import { compute121LegStats, compute121MatchStats } from '../stats/compute121LegStats'
import type { Stats121Leg, Stats121Match } from '../types/stats121'

type Props = { matchId: string; onBack: () => void }

function pName(match: MatchStarted | undefined, playerId: string) {
  if (!match) return playerId
  return match.players.find((p) => p.playerId === playerId)?.name ?? playerId
}

function fmtDate(s?: string) {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function fmtDart(d: { bed: any; mult: 1 | 2 | 3 }) {
  const prefix = d.mult === 3 ? 'T' : d.mult === 2 ? 'D' : ''
  if (typeof d.bed === 'number') return `${prefix}${d.bed}`
  if (d.bed === 'BULL') return d.mult === 2 ? 'Bull' : '25'
  if (d.bed === 'DBULL') return 'Bull'
  return 'Miss'
}

export default function MatchDetails({ matchId, onBack }: Props) {
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
  const [selectedSetIndex, setSelectedSetIndex] = useState<number | null>(null)
  const [chartLegIndex, setChartLegIndex] = useState(0)

  const stored = loadMatchById(matchId)
  const profiles = useMemo(() => getProfiles(), [])

  if (!stored) {
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

  const events = stored.events as DartsEvent[]
  const state = useMemo(() => applyEvents(events), [events])
  const match = state.match as MatchStarted | undefined

  if (!match) {
    return (
      <div style={styles.page}>
        <div style={styles.centerPage}>
          <div style={styles.centerInner}>
            <div style={styles.card}>
              <h2 style={{ margin: 0 }}>Unvollständige Matchdaten</h2>
              <div style={{ marginTop: 10 }}>
                <button style={styles.backBtn} onClick={onBack}>← Zurück</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Spielerfarben aus Profilen holen
  const playerColors: Record<string, string> = {}
  match.players.forEach((p, idx) => {
    const profile = profiles.find((pr) => pr.id === p.playerId)
    playerColors[p.playerId] = profile?.color ?? PLAYER_COLORS[idx % PLAYER_COLORS.length]
  })

  const isSets = match.structure.kind === 'sets'
  const finishedEvt = state.events.find((e) => e.type === 'MatchFinished') as MatchFinished | undefined
  const winnerName = finishedEvt ? pName(match, finishedEvt.winnerPlayerId) : undefined

  // Stats berechnen
  const statsByPlayer = useMemo(() => computeStats(events), [events])

  // Format-String
  let format = ''
  if (match.structure.kind === 'sets') {
    const sets = Math.floor((match.structure.bestOfSets || 1) / 2) + 1
    const legs = match.structure.legsPerSet || 1
    format = `First to ${sets} Sets, ${legs} Legs`
  } else {
    const legs = Math.floor((match.structure.bestOfLegs || 1) / 2) + 1
    format = `First to ${legs} Legs`
  }

  // Score aus mode extrahieren
  const score = (match.mode || '').split('-')[0] || '501'

  // Sets/Legs sammeln
  const setFinished = state.events.filter((e) => e.type === 'SetFinished') as SetFinished[]
  const legFinished = state.events.filter((e) => e.type === 'LegFinished') as LegFinished[]

  // Chart-Daten für das ausgewählte Leg im Carousel
  const chartLegData = useMemo(() => {
    if (!match || legFinished.length === 0) return null

    const legFinishedEvent = legFinished[chartLegIndex]
    if (!legFinishedEvent) return null

    const legId = legFinishedEvent.legId
    const legState = state.legs.find(l => l.legId === legId)
    if (!legState) return null

    // ScoreProgressionChart-Format: players Array mit visits (gleiches Format wie in Leg-Detail-Ansicht)
    const players = match.players.map((p, idx) => ({
      id: p.playerId,
      name: p.name ?? p.playerId,
      color: playerColors[p.playerId] ?? PLAYER_COLORS[idx],
      visits: legState.visits
        .filter((v: any) => v.playerId === p.playerId)
        .map((v: any, i: number) => ({
          visitIndex: i + 1,
          remainingBefore: v.remainingBefore,
          remainingAfter: v.remainingAfter,
          bust: v.bust,
          dartScores: v.darts.map((d: any) => d.score),
        })),
    }))

    return {
      legId,
      players,
      winnerPlayerId: legFinishedEvent.winnerPlayerId,
    }
  }, [chartLegIndex, state.legs, match, legFinished, playerColors])

  // Höchste Aufnahme und Höchstes Checkout pro Spieler berechnen
  const highestVisitByPlayer: Record<string, number> = {}
  const highestCheckoutByPlayer: Record<string, number> = {}
  match.players.forEach((p) => {
    highestVisitByPlayer[p.playerId] = 0
    highestCheckoutByPlayer[p.playerId] = 0
  })
  state.legs.forEach((leg) => {
    leg.visits.forEach((v: any) => {
      // Höchste Aufnahme
      if (v.visitScore > (highestVisitByPlayer[v.playerId] || 0)) {
        highestVisitByPlayer[v.playerId] = v.visitScore
      }
      // Höchstes Checkout
      if (v.remainingAfter === 0 && !v.bust) {
        if (v.remainingBefore > (highestCheckoutByPlayer[v.playerId] || 0)) {
          highestCheckoutByPlayer[v.playerId] = v.remainingBefore
        }
      }
    })
  })

  // Statistik-Zeilen
  const statRows = [
    { label: '3-Dart-Average', getValue: (pid: string) => (statsByPlayer[pid]?.threeDartAvg ?? 0).toFixed(2) },
    { label: 'First-9 Average', getValue: (pid: string) => (statsByPlayer[pid]?.first9OverallAvg ?? 0).toFixed(2) },
    { label: 'Höchste Aufnahme', getValue: (pid: string) => String(highestVisitByPlayer[pid] || 0) },
    { label: 'Höchstes Checkout', getValue: (pid: string) => highestCheckoutByPlayer[pid] ? String(highestCheckoutByPlayer[pid]) : '–' },
    { label: 'Checkout %', getValue: (pid: string) => {
      const sp = statsByPlayer[pid]
      const made = sp?.doublesHitDart ?? 0
      const att = sp?.doubleAttemptsDart ?? 0
      const pct = att > 0 ? (made / att) * 100 : 0
      return `${pct.toFixed(1)}% (${made}/${att})`
    }},
    { label: 'Darts geworfen', getValue: (pid: string) => String(statsByPlayer[pid]?.dartsThrown ?? 0) },
    { label: 'Punkte erzielt', getValue: (pid: string) => String(statsByPlayer[pid]?.pointsScored ?? 0) },
    { label: 'Legs gewonnen', getValue: (pid: string) => {
      let count = 0
      legFinished.forEach((lf) => { if (lf.winnerPlayerId === pid) count++ })
      return String(count)
    }},
    // === Scoring-Bins ===
    { label: '180er', getValue: (pid: string) => String(statsByPlayer[pid]?.bins._180 ?? 0) },
    { label: '140+', getValue: (pid: string) => String(statsByPlayer[pid]?.bins._140plus ?? 0) },
    { label: '100+', getValue: (pid: string) => String(statsByPlayer[pid]?.bins._100plus ?? 0) },
    { label: '61+', getValue: (pid: string) => String(statsByPlayer[pid]?.bins._61plus ?? 0) },
    // === Checkout-Details ===
    { label: 'Double-Versuche', getValue: (pid: string) => String(statsByPlayer[pid]?.doubleAttemptsDart ?? 0) },
    { label: 'Lieblingsdoppel', getValue: (pid: string) => {
      const doubles = statsByPlayer[pid]?.finishingDoubles ?? {}
      const sorted = Object.entries(doubles).sort(([, a], [, b]) => b - a)
      return sorted.length > 0 ? sorted[0][0] : '–'
    }},
    // === Effizienz ===
    { label: 'Bestes Leg', getValue: (pid: string) => {
      const best = statsByPlayer[pid]?.bestLegDarts
      return best ? `${best} Darts` : '–'
    }},
    { label: 'Busts', getValue: (pid: string) => String(statsByPlayer[pid]?.busts ?? 0) },
  ]

  if (isSets) {
    statRows.push({
      label: 'Sets gewonnen',
      getValue: (pid: string) => {
        let count = 0
        setFinished.forEach((sf) => { if (sf.winnerPlayerId === pid) count++ })
        return String(count)
      }
    })
  }

  // Legs pro Set ermitteln
  const getLegIdsForSet = (setIdx: number): string[] => {
    const sfIndex = setFinished.findIndex((sf) => sf.setIndex === setIdx)
    if (sfIndex === -1) return []
    const sfEvent = setFinished[sfIndex]
    const sfEventIndex = events.indexOf(sfEvent as any)
    const prevSfEventIndex = sfIndex > 0 ? events.indexOf(setFinished[sfIndex - 1] as any) : -1

    return legFinished
      .filter((lf: any) => {
        const lfIndex = events.indexOf(lf as any)
        return lfIndex > prevSfEventIndex && lfIndex <= sfEventIndex
      })
      .map((lf: any) => lf.legId)
  }

  // Set-Stats berechnen
  const setStatsByPlayer = useMemo(() => {
    if (selectedSetIndex === null) return null
    const legIds = getLegIdsForSet(selectedSetIndex)
    const setEvents = events.filter((e) => {
      if (isMatchStarted(e)) return true
      if ('legId' in e) return legIds.includes(e.legId)
      return false
    })
    return computeStats(setEvents)
  }, [events, selectedSetIndex])

  // Legs im ausgewählten Set
  const legsInSelectedSet = useMemo(() => {
    if (selectedSetIndex === null) return []
    const legIds = getLegIdsForSet(selectedSetIndex)
    return legFinished.filter((lf: any) => legIds.includes(lf.legId))
  }, [selectedSetIndex, legFinished])

  // Leg-Details: Visits für ein bestimmtes Leg
  const selectedLeg = selectedLegId ? state.legs.find((l) => l.legId === selectedLegId) : null
  const selectedLegFinish = selectedLegId
    ? legFinished.find((lf: any) => lf.legId === selectedLegId)
    : null
  const selectedLegIndex = selectedLegId
    ? legFinished.findIndex((lf: any) => lf.legId === selectedLegId) + 1
    : 0

  // Stats für einzelnes Leg berechnen
  const legStatsByPlayer = useMemo(() => {
    if (!selectedLegId) return null
    const legEvents = events.filter((e) => {
      if (isMatchStarted(e)) return true
      if ('legId' in e) return e.legId === selectedLegId
      return false
    })
    return computeStats(legEvents as DartsEvent[])
  }, [events, selectedLegId])

  // 121-spezifische Stats berechnen (falls 121-Spiel)
  const is121Game = match?.startingScorePerLeg === 121
  const stats121ByPlayer = useMemo(() => {
    if (!selectedLegId || !is121Game || !match) return null
    const result: Record<string, Stats121Leg | null> = {}
    for (const p of match.players) {
      result[p.playerId] = compute121LegStats(events, selectedLegId, p.playerId)
    }
    return result
  }, [events, selectedLegId, is121Game, match])

  // 121-Match-Stats (aggregiert über alle Legs)
  const stats121MatchByPlayer = useMemo(() => {
    if (!is121Game || !match) return null
    // Alle Leg-Stats für alle Spieler sammeln
    const allLegStats: Stats121Leg[] = []
    for (const lf of legFinished) {
      for (const p of match.players) {
        const legStat = compute121LegStats(events, lf.legId, p.playerId)
        if (legStat) allLegStats.push(legStat)
      }
    }
    // Match-Stats pro Spieler berechnen
    const result: Record<string, Stats121Match | null> = {}
    for (const p of match.players) {
      result[p.playerId] = compute121MatchStats(allLegStats, p.playerId)
    }
    return result
  }, [events, is121Game, match, legFinished])

  // SET DETAIL VIEW (nur wenn kein Leg ausgewählt)
  if (selectedSetIndex !== null && isSets && !selectedLegId) {
    const selectedSetFinish = setFinished.find((sf) => sf.setIndex === selectedSetIndex)
    const legIds = getLegIdsForSet(selectedSetIndex)

    // 61+ für Set berechnen
    const setBins61plus: Record<string, number> = {}
    match.players.forEach((p) => { setBins61plus[p.playerId] = 0 })
    legIds.forEach((legId) => {
      const leg = state.legs.find((l) => l.legId === legId)
      leg?.visits.forEach((v: any) => {
        if (v.visitScore >= 61 && v.visitScore < 100) {
          setBins61plus[v.playerId] = (setBins61plus[v.playerId] || 0) + 1
        }
      })
    })

    // Höchste Aufnahme im Set berechnen
    const setHighestVisit: Record<string, number> = {}
    match.players.forEach((p) => { setHighestVisit[p.playerId] = 0 })
    legIds.forEach((legId) => {
      const leg = state.legs.find((l) => l.legId === legId)
      leg?.visits.forEach((v: any) => {
        if (v.visitScore > (setHighestVisit[v.playerId] || 0)) {
          setHighestVisit[v.playerId] = v.visitScore
        }
      })
    })

    // Checkout-Info für Set (höchster Checkout)
    const setCheckoutInfo: Record<string, { height: number; lastDart: string }> = {}
    legIds.forEach((legId) => {
      const leg = state.legs.find((l) => l.legId === legId)
      leg?.visits.forEach((v: any) => {
        if (v.remainingAfter === 0 && !v.bust) {
          const existing = setCheckoutInfo[v.playerId]
          if (!existing || v.remainingBefore > existing.height) {
            const lastDart = v.darts[v.darts.length - 1]
            setCheckoutInfo[v.playerId] = {
              height: v.remainingBefore,
              lastDart: fmtDart(lastDart),
            }
          }
        }
      })
    })

    // Set-Spielzeit berechnen
    const firstLegInSet = legIds[0]
    const setStartEvent = events.find((e): e is LegStarted => isLegStarted(e) && e.legId === firstLegInSet)
    const setEndEvent = selectedSetFinish
    let setDuration = ''
    if (setStartEvent?.ts && setEndEvent?.ts) {
      const start = new Date(setStartEvent.ts).getTime()
      const end = new Date(setEndEvent.ts).getTime()
      const diffMs = end - start
      const mins = Math.floor(diffMs / 60000)
      const secs = Math.floor((diffMs % 60000) / 1000)
      setDuration = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
    }

    return (
      <div style={styles.page}>
        <div style={styles.centerPage}>
          <div style={{ ...styles.centerInner, width: 'min(600px, 95vw)' }}>
            {/* Header mit Navigation */}
            <div style={styles.headerRow}>
              <button style={styles.backBtn} onClick={() => setSelectedSetIndex(null)}>← Zurück</button>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <button
                  onClick={() => {
                    const currentIdx = setFinished.findIndex((sf) => sf.setIndex === selectedSetIndex)
                    if (currentIdx > 0) setSelectedSetIndex(setFinished[currentIdx - 1].setIndex)
                  }}
                  disabled={setFinished.findIndex((sf) => sf.setIndex === selectedSetIndex) === 0}
                  style={{
                    background: 'none',
                    border: 'none',
                    fontSize: 24,
                    cursor: setFinished.findIndex((sf) => sf.setIndex === selectedSetIndex) === 0 ? 'default' : 'pointer',
                    opacity: setFinished.findIndex((sf) => sf.setIndex === selectedSetIndex) === 0 ? 0.3 : 1,
                    padding: '4px 8px',
                  }}
                >
                  ←
                </button>
                <h2 style={{ margin: 0, fontSize: 22 }}>Set {selectedSetIndex}</h2>
                <button
                  onClick={() => {
                    const currentIdx = setFinished.findIndex((sf) => sf.setIndex === selectedSetIndex)
                    if (currentIdx < setFinished.length - 1) setSelectedSetIndex(setFinished[currentIdx + 1].setIndex)
                  }}
                  disabled={setFinished.findIndex((sf) => sf.setIndex === selectedSetIndex) === setFinished.length - 1}
                  style={{
                    background: 'none',
                    border: 'none',
                    fontSize: 24,
                    cursor: setFinished.findIndex((sf) => sf.setIndex === selectedSetIndex) === setFinished.length - 1 ? 'default' : 'pointer',
                    opacity: setFinished.findIndex((sf) => sf.setIndex === selectedSetIndex) === setFinished.length - 1 ? 0.3 : 1,
                    padding: '4px 8px',
                  }}
                >
                  →
                </button>
              </div>
              <div style={{ width: 80 }} /> {/* Spacer für Balance */}
            </div>

            {/* Set Statistik */}
            <div style={styles.card}>
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
                <span>{match.players.map((p) => p.name).join(' vs ')}</span>
                {selectedSetFinish && (
                  <span style={{ fontWeight: 600, color: colors.success }}>
                    Sieger: {pName(match, selectedSetFinish.winnerPlayerId)}
                  </span>
                )}
              </div>

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
                    {match.players.map((p) => (
                      <td key={p.playerId} style={tdRight}>{(setStatsByPlayer?.[p.playerId]?.threeDartAvg ?? 0).toFixed(1)}</td>
                    ))}
                  </tr>
                  <tr>
                    <td style={tdLeft}>First Nine</td>
                    {match.players.map((p) => (
                      <td key={p.playerId} style={tdRight}>{(setStatsByPlayer?.[p.playerId]?.first9OverallAvg ?? 0).toFixed(1)}</td>
                    ))}
                  </tr>
                  <tr>
                    <td style={tdLeft}>Höchste Aufnahme</td>
                    {match.players.map((p) => (
                      <td key={p.playerId} style={tdRight}>{setHighestVisit[p.playerId] || 0}</td>
                    ))}
                  </tr>
                  <tr>
                    <td style={tdLeft}>180s</td>
                    {match.players.map((p) => (
                      <td key={p.playerId} style={tdRight}>{setStatsByPlayer?.[p.playerId]?.bins?._180 ?? 0}</td>
                    ))}
                  </tr>
                  <tr>
                    <td style={tdLeft}>140+</td>
                    {match.players.map((p) => (
                      <td key={p.playerId} style={tdRight}>{setStatsByPlayer?.[p.playerId]?.bins?._140plus ?? 0}</td>
                    ))}
                  </tr>
                  <tr>
                    <td style={tdLeft}>100+</td>
                    {match.players.map((p) => (
                      <td key={p.playerId} style={tdRight}>{setStatsByPlayer?.[p.playerId]?.bins?._100plus ?? 0}</td>
                    ))}
                  </tr>
                  <tr>
                    <td style={tdLeft}>61+</td>
                    {match.players.map((p) => (
                      <td key={p.playerId} style={tdRight}>{setBins61plus[p.playerId] ?? 0}</td>
                    ))}
                  </tr>

                  <tr><td colSpan={match.players.length + 1} style={{ borderBottom: `2px solid ${colors.border}`, padding: '4px 0' }}></td></tr>

                  <tr>
                    <td style={tdLeft}>Höchster Checkout</td>
                    {match.players.map((p) => {
                      const info = setCheckoutInfo[p.playerId]
                      return (
                        <td key={p.playerId} style={tdRight}>
                          {info ? `${info.height} (${info.lastDart})` : '–'}
                        </td>
                      )
                    })}
                  </tr>
                  <tr>
                    <td style={tdLeft}>Checkout Versuche</td>
                    {match.players.map((p) => {
                      const attempts = setStatsByPlayer?.[p.playerId]?.doubleAttemptsDart ?? 0
                      const hits = setStatsByPlayer?.[p.playerId]?.doublesHitDart ?? 0
                      return <td key={p.playerId} style={tdRight}>{attempts} / {hits}</td>
                    })}
                  </tr>
                  <tr>
                    <td style={tdLeft}>Checkout Quote</td>
                    {match.players.map((p) => (
                      <td key={p.playerId} style={tdRight}>{(setStatsByPlayer?.[p.playerId]?.doublePctDart ?? 0).toFixed(0)} %</td>
                    ))}
                  </tr>
                  <tr>
                    <td style={tdLeft}>Legs gewonnen</td>
                    {match.players.map((p) => {
                      let count = 0
                      legsInSelectedSet.forEach((lf: any) => { if (lf.winnerPlayerId === p.playerId) count++ })
                      return <td key={p.playerId} style={tdRight}>{count}</td>
                    })}
                  </tr>
                </tbody>
              </table>

              <div style={{ marginTop: 12, color: colors.fgDim, fontSize: 13 }}>
                Modus: {format}
              </div>
              {setDuration && (
                <div style={{ marginTop: 8, padding: '8px 12px', background: colors.bgMuted, borderRadius: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 500, color: colors.fg }}>Spielzeit Set</span>
                  <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{setDuration}</span>
                </div>
              )}
            </div>

            {/* Legs in diesem Set */}
            <div style={styles.card}>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>Legs in Set {selectedSetIndex}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {legsInSelectedSet.length === 0 ? (
                  <div style={{ opacity: 0.6 }}>Keine Legs vorhanden.</div>
                ) : (
                  (() => {
                    // Kumulativen Spielstand im Set berechnen
                    const cumulativeScore: Record<string, number> = {}
                    match.players.forEach((p) => { cumulativeScore[p.playerId] = 0 })

                    return legsInSelectedSet.map((lf: any, idx) => {
                      if (lf.winnerPlayerId) {
                        cumulativeScore[lf.winnerPlayerId]++
                      }
                      const scoreAfterLeg = match.players.map((p) => cumulativeScore[p.playerId]).join(':')

                      const winnerLegName = pName(match, lf.winnerPlayerId)
                      const checkout = lf.highestCheckoutThisLeg

                      return (
                        <div
                          key={lf.eventId}
                          onClick={() => setSelectedLegId(lf.legId)}
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
                          <span style={{ fontWeight: 700, minWidth: 60 }}>Leg {idx + 1}</span>
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
                          {checkout > 0 && <span style={{ color: colors.fgDim, fontSize: 12 }}>Checkout: {checkout}</span>}
                          <span style={{ flex: 1 }} />
                          <span style={{ fontWeight: 600, color: colors.success }}>{winnerLegName}</span>
                          <span style={{ color: colors.fgMuted, fontSize: 12 }}>→</span>
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

  // LEG DETAIL VIEW
  if (selectedLegId && selectedLeg) {
    // 61+ und Höchste Aufnahme berechnen
    const bins61plus: Record<string, number> = {}
    const highestVisitInLeg: Record<string, number> = {}
    match.players.forEach((p) => {
      bins61plus[p.playerId] = 0
      highestVisitInLeg[p.playerId] = 0
    })
    selectedLeg.visits.forEach((v: any) => {
      if (v.visitScore >= 61 && v.visitScore < 100) {
        bins61plus[v.playerId] = (bins61plus[v.playerId] || 0) + 1
      }
      if (v.visitScore > (highestVisitInLeg[v.playerId] || 0)) {
        highestVisitInLeg[v.playerId] = v.visitScore
      }
    })

    // Checkout-Info pro Spieler (Höhe + letzter Dart)
    const checkoutInfo: Record<string, { height: number; lastDart: string }> = {}
    selectedLeg.visits.forEach((v: any) => {
      if (v.remainingAfter === 0 && !v.bust) {
        const lastDart = v.darts[v.darts.length - 1]
        checkoutInfo[v.playerId] = {
          height: v.remainingBefore,
          lastDart: fmtDart(lastDart),
        }
      }
    })

    // Rest pro Spieler (letzter Stand)
    const restByPlayer: Record<string, number> = {}
    match.players.forEach((p) => { restByPlayer[p.playerId] = match.startingScorePerLeg })
    selectedLeg.visits.forEach((v: any) => {
      restByPlayer[v.playerId] = v.remainingAfter
    })

    // Spielzeit berechnen
    const legStartEvent = events.find((e): e is LegStarted => isLegStarted(e) && e.legId === selectedLegId)
    const legEndEvent = selectedLegFinish
    let legDurationMs: number | undefined
    if (legStartEvent?.ts && legEndEvent?.ts) {
      const start = new Date(legStartEvent.ts).getTime()
      const end = new Date(legEndEvent.ts).getTime()
      legDurationMs = end - start
    }

    // Kumulativen Spielstand nach diesem Leg berechnen
    const cumulativeScore: Record<string, number> = {}
    match.players.forEach(p => { cumulativeScore[p.playerId] = 0 })
    for (let i = 0; i < selectedLegIndex; i++) {
      const lf = legFinished[i]
      if (lf?.winnerPlayerId) cumulativeScore[lf.winnerPlayerId]++
    }
    const scoreAfterLeg = match.players.map(p => cumulativeScore[p.playerId]).join(':')

    // Spielmodus-String für Header
    const inPart = match.inRule === 'double-in' ? 'Double In' : ''
    const outPart = match.outRule === 'double-out' ? 'Double Out' : (match.outRule === 'master-out' ? 'Master Out' : 'Straight Out')
    const gameMode = `${score} ${inPart ? inPart + '/' : ''}${outPart}`

    // Leg-Index in der aktuellen Liste
    const currentLegIdx = legFinished.findIndex((lf: any) => lf.legId === selectedLegId)

    return (
      <div style={styles.page}>
        <div style={styles.centerPage}>
          <div style={{ ...styles.centerInner, width: 'min(650px, 95vw)' }}>
            {/* Einheitlicher Leg-Header */}
            <LegHeader
              legNumber={selectedLegIndex}
              gameName={stored.matchName}
              gameMode={gameMode}
              players={match.players.map(p => ({
                id: p.playerId,
                name: p.name ?? p.playerId,
                color: playerColors[p.playerId],
              }))}
              winnerId={selectedLegFinish?.winnerPlayerId}
              scoreAfterLeg={scoreAfterLeg}
              legDurationMs={legDurationMs}
              onBack={() => setSelectedLegId(null)}
              onPrevLeg={() => {
                if (currentLegIdx > 0) setSelectedLegId(legFinished[currentLegIdx - 1].legId)
              }}
              onNextLeg={() => {
                if (currentLegIdx < legFinished.length - 1) setSelectedLegId(legFinished[currentLegIdx + 1].legId)
              }}
              hasPrev={currentLegIdx > 0}
              hasNext={currentLegIdx < legFinished.length - 1}
            />

            {/* Leg Statistik */}
            <div style={styles.card}>
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
                  {/* Scoring Stats */}
                  <tr>
                    <td style={tdLeft}>Average</td>
                    {match.players.map((p) => (
                      <td key={p.playerId} style={tdRight}>{(legStatsByPlayer?.[p.playerId]?.threeDartAvg ?? 0).toFixed(1)}</td>
                    ))}
                  </tr>
                  <tr>
                    <td style={tdLeft}>First Nine</td>
                    {match.players.map((p) => (
                      <td key={p.playerId} style={tdRight}>{(legStatsByPlayer?.[p.playerId]?.first9OverallAvg ?? 0).toFixed(1)}</td>
                    ))}
                  </tr>
                  <tr>
                    <td style={tdLeft}>Höchste Aufnahme</td>
                    {match.players.map((p) => (
                      <td key={p.playerId} style={tdRight}>{highestVisitInLeg[p.playerId] || 0}</td>
                    ))}
                  </tr>
                  <tr>
                    <td style={tdLeft}>180s</td>
                    {match.players.map((p) => (
                      <td key={p.playerId} style={tdRight}>{legStatsByPlayer?.[p.playerId]?.bins?._180 ?? 0}</td>
                    ))}
                  </tr>
                  <tr>
                    <td style={tdLeft}>140+</td>
                    {match.players.map((p) => (
                      <td key={p.playerId} style={tdRight}>{legStatsByPlayer?.[p.playerId]?.bins?._140plus ?? 0}</td>
                    ))}
                  </tr>
                  <tr>
                    <td style={tdLeft}>100+</td>
                    {match.players.map((p) => (
                      <td key={p.playerId} style={tdRight}>{legStatsByPlayer?.[p.playerId]?.bins?._100plus ?? 0}</td>
                    ))}
                  </tr>
                  <tr>
                    <td style={tdLeft}>61+</td>
                    {match.players.map((p) => (
                      <td key={p.playerId} style={tdRight}>{bins61plus[p.playerId] ?? 0}</td>
                    ))}
                  </tr>

                  {/* Trennlinie */}
                  <tr><td colSpan={match.players.length + 1} style={{ borderBottom: `2px solid ${colors.border}`, padding: '4px 0' }}></td></tr>

                  {/* Checkout Stats */}
                  <tr>
                    <td style={tdLeft}>Checkout Höhe</td>
                    {match.players.map((p) => {
                      const info = checkoutInfo[p.playerId]
                      return (
                        <td key={p.playerId} style={tdRight}>
                          {info ? `${info.height} (${info.lastDart})` : '–'}
                        </td>
                      )
                    })}
                  </tr>
                  <tr>
                    <td style={tdLeft}>Checkout Versuche</td>
                    {match.players.map((p) => {
                      const attempts = legStatsByPlayer?.[p.playerId]?.doubleAttemptsDart ?? 0
                      const hits = legStatsByPlayer?.[p.playerId]?.doublesHitDart ?? 0
                      return <td key={p.playerId} style={tdRight}>{attempts} / {hits}</td>
                    })}
                  </tr>
                  <tr>
                    <td style={tdLeft}>Checkout Quote</td>
                    {match.players.map((p) => (
                      <td key={p.playerId} style={tdRight}>{(legStatsByPlayer?.[p.playerId]?.doublePctDart ?? 0).toFixed(0)} %</td>
                    ))}
                  </tr>
                  <tr>
                    <td style={tdLeft}>Rest</td>
                    {match.players.map((p) => (
                      <td key={p.playerId} style={tdRight}>{restByPlayer[p.playerId]}</td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>

            {/* 121-spezifische Stats (nur bei 121-Spielen) */}
            {is121Game && stats121ByPlayer && (
              <div style={styles.card}>
                <div style={{
                  fontWeight: 700,
                  marginBottom: 12,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}>
                  <span style={{
                    background: colors.accent,
                    color: 'white',
                    padding: '2px 8px',
                    borderRadius: 4,
                    fontSize: 12,
                    fontWeight: 700,
                  }}>121</span>
                  Sprint-Statistik
                </div>
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
                    {/* Darts to Finish */}
                    <tr>
                      <td style={tdLeft}>Darts bis Finish</td>
                      {match.players.map((p) => {
                        const s = stats121ByPlayer[p.playerId]
                        return (
                          <td key={p.playerId} style={tdRight}>
                            {s?.dartsToFinish != null ? s.dartsToFinish : '–'}
                          </td>
                        )
                      })}
                    </tr>
                    {/* Checkout-Kategorie */}
                    <tr>
                      <td style={tdLeft}>Checkout-Kategorie</td>
                      {match.players.map((p) => {
                        const s = stats121ByPlayer[p.playerId]
                        const cat = s?.checkoutCategory
                        const color = cat === '<=6' ? colors.success : cat === '<=9' ? colors.warning : cat === '>9' ? colors.error : colors.fgDim
                        return (
                          <td key={p.playerId} style={{ ...tdRight, color, fontWeight: 700 }}>
                            {cat && cat !== 'none' ? cat : '–'}
                          </td>
                        )
                      })}
                    </tr>
                    {/* First-Turn Checkout */}
                    <tr>
                      <td style={tdLeft}>First-Turn Checkout</td>
                      {match.players.map((p) => {
                        const s = stats121ByPlayer[p.playerId]
                        const success = s?.firstTurnCheckoutSuccess
                        return (
                          <td key={p.playerId} style={{ ...tdRight, color: success ? colors.success : colors.fgDim }}>
                            {success ? '✓ Ja' : '–'}
                          </td>
                        )
                      })}
                    </tr>
                    {/* Darts auf Double */}
                    <tr>
                      <td style={tdLeft}>Darts auf Double</td>
                      {match.players.map((p) => {
                        const s = stats121ByPlayer[p.playerId]
                        return (
                          <td key={p.playerId} style={tdRight}>
                            {s?.dartsOnDouble ?? 0}
                          </td>
                        )
                      })}
                    </tr>
                    {/* First-Attempt Double Hit */}
                    <tr>
                      <td style={tdLeft}>First-Attempt Double</td>
                      {match.players.map((p) => {
                        const s = stats121ByPlayer[p.playerId]
                        const hit = s?.firstAttemptDoubleHit
                        return (
                          <td key={p.playerId} style={{ ...tdRight, color: hit ? colors.success : colors.fgDim }}>
                            {hit ? '✓' : '–'}
                          </td>
                        )
                      })}
                    </tr>
                    {/* Verpasste Double-Darts */}
                    <tr>
                      <td style={tdLeft}>Verpasste Double-Darts</td>
                      {match.players.map((p) => {
                        const s = stats121ByPlayer[p.playerId]
                        const missed = s?.missedDoubleDarts ?? 0
                        return (
                          <td key={p.playerId} style={{ ...tdRight, color: missed > 0 ? colors.error : colors.fgDim }}>
                            {missed}
                          </td>
                        )
                      })}
                    </tr>
                    {/* Double-Feld verwendet */}
                    <tr>
                      <td style={tdLeft}>Finish-Double</td>
                      {match.players.map((p) => {
                        const s = stats121ByPlayer[p.playerId]
                        return (
                          <td key={p.playerId} style={{ ...tdRight, fontWeight: 700, color: s?.doubleFieldUsed ? colors.accent : colors.fgDim }}>
                            {s?.doubleFieldUsed ?? '–'}
                          </td>
                        )
                      })}
                    </tr>

                    {/* Trennlinie */}
                    <tr><td colSpan={match.players.length + 1} style={{ borderBottom: `2px solid ${colors.border}`, padding: '4px 0' }}></td></tr>

                    {/* Busts */}
                    <tr>
                      <td style={tdLeft}>Busts</td>
                      {match.players.map((p) => {
                        const s = stats121ByPlayer[p.playerId]
                        const busts = s?.bustCount ?? 0
                        return (
                          <td key={p.playerId} style={{ ...tdRight, color: busts > 0 ? colors.error : colors.success }}>
                            {busts}
                          </td>
                        )
                      })}
                    </tr>
                    {/* Längste Serie ohne Bust */}
                    <tr>
                      <td style={tdLeft}>Längste Serie ohne Bust</td>
                      {match.players.map((p) => {
                        const s = stats121ByPlayer[p.playerId]
                        return (
                          <td key={p.playerId} style={tdRight}>
                            {s?.longestStreakWithoutBust ?? 0} Visits
                          </td>
                        )
                      })}
                    </tr>
                    {/* Verpasste Checkouts */}
                    <tr>
                      <td style={tdLeft}>Verpasste Checkouts</td>
                      {match.players.map((p) => {
                        const s = stats121ByPlayer[p.playerId]
                        const missed = s?.missedCheckoutsCount ?? 0
                        return (
                          <td key={p.playerId} style={{ ...tdRight, color: missed > 0 ? colors.warning : colors.fgDim }}>
                            {missed}
                          </td>
                        )
                      })}
                    </tr>
                    {/* Checkout nach Miss */}
                    <tr>
                      <td style={tdLeft}>Checkout nach Fehlversuch</td>
                      {match.players.map((p) => {
                        const s = stats121ByPlayer[p.playerId]
                        const afterMiss = s?.checkoutAfterMiss
                        return (
                          <td key={p.playerId} style={{ ...tdRight, color: afterMiss ? colors.success : colors.fgDim }}>
                            {afterMiss ? '✓' : '–'}
                          </td>
                        )
                      })}
                    </tr>

                    {/* Trennlinie */}
                    <tr><td colSpan={match.players.length + 1} style={{ borderBottom: `2px solid ${colors.border}`, padding: '4px 0' }}></td></tr>

                    {/* Stabilität */}
                    <tr>
                      <td style={tdLeft}>Stabilitätsindex</td>
                      {match.players.map((p) => {
                        const s = stats121ByPlayer[p.playerId]
                        const stability = s?.stabilityIndex ?? 0
                        const color = stability >= 70 ? colors.success : stability >= 40 ? colors.warning : colors.error
                        return (
                          <td key={p.playerId} style={{ ...tdRight, color, fontWeight: 700 }}>
                            {stability}%
                          </td>
                        )
                      })}
                    </tr>
                    {/* Checkout-Route (falls vorhanden) */}
                    {match.players.some(p => stats121ByPlayer[p.playerId]?.checkoutRoute) && (
                      <tr>
                        <td style={tdLeft}>Checkout-Route</td>
                        {match.players.map((p) => {
                          const s = stats121ByPlayer[p.playerId]
                          const route = s?.checkoutRoute
                          if (!route) return <td key={p.playerId} style={tdRight}>–</td>
                          const routeStr = route.routeTaken.join(' → ')
                          const isOptimal = !route.deviatedFromOptimal
                          return (
                            <td key={p.playerId} style={{ ...tdRight, fontSize: 12 }}>
                              <div>{routeStr}</div>
                              {isOptimal ? (
                                <span style={{ color: colors.success, fontSize: 10 }}>✓ Optimal</span>
                              ) : (
                                <span style={{ color: colors.warning, fontSize: 10 }}>
                                  Alternativ (Optimal: {route.optimalRoute.join(' ')})
                                </span>
                              )}
                            </td>
                          )
                        })}
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* Score Progression Chart */}
            <div style={styles.card}>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>Punkteverlauf</div>
              <div style={{ height: 270 }}>
                <ScoreProgressionChart
                  startScore={match.startingScorePerLeg}
                  players={match.players.map((p, index) => ({
                    id: p.playerId,
                    name: p.name ?? p.playerId,
                    color: playerColors[p.playerId],
                    visits: selectedLeg.visits
                      .filter((v: any) => v.playerId === p.playerId)
                      .map((v: any, i: number) => ({
                        visitIndex: i + 1,
                        remainingBefore: v.remainingBefore,
                        remainingAfter: v.remainingAfter,
                        bust: v.bust,
                        dartScores: v.darts.map((d: any) => d.score),
                      })),
                  }))}
                  winnerPlayerId={selectedLegFinish?.winnerPlayerId}
                  showCheckoutLine={true}
                  showFinishLine={true}
                />
              </div>
            </div>

            {/* Leg-Verlauf (Staircase) */}
            <div style={styles.card}>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>Leg-Verlauf</div>
              {selectedLeg.visits.length === 0 ? (
                <div style={{ opacity: 0.6 }}>Keine Würfe in diesem Leg.</div>
              ) : (
                <X01StaircaseChart
                  startScore={match.startingScorePerLeg}
                  visits={selectedLeg.visits.map((v: any) => ({
                    visitScore: v.visitScore,
                    remainingBefore: v.remainingBefore,
                    remainingAfter: v.remainingAfter,
                    bust: !!v.bust,
                    darts: v.darts.map(fmtDart),
                    playerId: v.playerId,
                    playerName: pName(match, v.playerId),
                    playerColor: playerColors[v.playerId] || PLAYER_COLORS[match.players.findIndex(p => p.playerId === v.playerId) % PLAYER_COLORS.length],
                    isCheckout: v.remainingAfter === 0 && !v.bust,
                  }))}
                  compact={false}
                  showHeader={false}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }

  // MATCH OVERVIEW
  // Match-Spielzeit berechnen
  const matchStartEvent = events.find(isMatchStarted)
  const matchEndEvent = events.find(isMatchFinished)
  let matchDurationMs: number | undefined
  if (matchStartEvent?.ts && matchEndEvent?.ts) {
    const start = new Date(matchStartEvent.ts).getTime()
    const end = new Date(matchEndEvent.ts).getTime()
    matchDurationMs = end - start
  }

  // Spielmodus-String für Header
  const inPart = match.inRule === 'double-in' ? 'Double In' : ''
  const outPart = match.outRule === 'double-out' ? 'Double Out' : (match.outRule === 'master-out' ? 'Master Out' : 'Straight Out')
  const gameMode = `${score} ${inPart ? inPart + '/' : ''}${outPart}`

  // Legs pro Spieler zählen
  const legWinsPerPlayer: Record<string, number> = {}
  match.players.forEach(p => { legWinsPerPlayer[p.playerId] = 0 })
  legFinished.forEach(lf => {
    if (lf.winnerPlayerId) legWinsPerPlayer[lf.winnerPlayerId]++
  })
  const legScore = match.players.map(p => legWinsPerPlayer[p.playerId]).join(':')

  // Sets-Score berechnen (falls Sets-Modus)
  let setScoreString: string | undefined
  if (isSets) {
    const setWinsPerPlayer: Record<string, number> = {}
    match.players.forEach(p => { setWinsPerPlayer[p.playerId] = 0 })
    setFinished.forEach(sf => {
      if (sf.winnerPlayerId) setWinsPerPlayer[sf.winnerPlayerId]++
    })
    setScoreString = match.players.map(p => setWinsPerPlayer[p.playerId]).join(':')
  }

  return (
    <div style={styles.page}>
      <div style={styles.centerPage}>
        <div style={{ ...styles.centerInner, width: 'min(650px, 95vw)' }}>
          {/* Einheitlicher Match-Header */}
          <MatchHeader
            gameName={stored.matchName}
            gameMode={gameMode}
            players={match.players.map(p => ({
              id: p.playerId,
              name: p.name ?? p.playerId,
              color: playerColors[p.playerId],
              legsWon: legWinsPerPlayer[p.playerId],
              setsWon: isSets ? (setFinished.filter(sf => sf.winnerPlayerId === p.playerId).length) : undefined,
            }))}
            winnerId={finishedEvt?.winnerPlayerId}
            legScore={legScore}
            setScore={setScoreString}
            durationMs={matchDurationMs}
            playedAt={stored.createdAt}
            onBack={onBack}
          />

          {/* Spielinfo (Bemerkungen) */}
          {stored.notes && (
            <div style={styles.card}>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>Bemerkungen</div>
              <div style={{ whiteSpace: 'pre-wrap' }}>{stored.notes}</div>
            </div>
          )}

          {/* Statistik-Tabelle (nicht bei 121-Spielen, da 121 Sprint Card reicht) */}
          {!is121Game && (
            <div style={styles.card}>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>Match-Statistik</div>
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
                  {statRows.map((row) => (
                    <tr key={row.label}>
                      <td style={tdLeft}>{row.label}</td>
                      {match.players.map((p) => (
                        <td key={p.playerId} style={tdRight}>{row.getValue(p.playerId)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* 121 Sprint Match-Statistik (nur bei 121-Spielen) */}
          {is121Game && stats121MatchByPlayer && (
            <div style={styles.card}>
              <div style={{
                fontWeight: 700,
                marginBottom: 12,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}>
                <span style={{
                  background: colors.accent,
                  color: 'white',
                  padding: '2px 8px',
                  borderRadius: 4,
                  fontSize: 12,
                  fontWeight: 700,
                }}>121</span>
                Sprint - Match-Statistik
              </div>
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
                  {/* Legs */}
                  <tr>
                    <td style={tdLeft}>Legs gewonnen</td>
                    {match.players.map((p) => {
                      const s = stats121MatchByPlayer[p.playerId]
                      return (
                        <td key={p.playerId} style={tdRight}>
                          {s?.legsWon ?? 0} / {s?.legsPlayed ?? 0}
                        </td>
                      )
                    })}
                  </tr>
                  {/* Durchschnitt Darts bis Finish */}
                  <tr>
                    <td style={tdLeft}>Ø Darts bis Finish</td>
                    {match.players.map((p) => {
                      const s = stats121MatchByPlayer[p.playerId]
                      const avg = s?.avgDartsToFinish ?? 0
                      const color = avg > 0 ? (avg <= 6 ? colors.success : avg <= 9 ? colors.warning : colors.error) : colors.fgDim
                      return (
                        <td key={p.playerId} style={{ ...tdRight, color, fontWeight: 700 }}>
                          {avg > 0 ? avg.toFixed(1) : '–'}
                        </td>
                      )
                    })}
                  </tr>
                  {/* Bestes Leg */}
                  <tr>
                    <td style={tdLeft}>Bestes Leg</td>
                    {match.players.map((p) => {
                      const s = stats121MatchByPlayer[p.playerId]
                      const best = s?.bestLegDarts
                      const color = best != null ? (best <= 6 ? colors.success : best <= 9 ? colors.warning : colors.error) : colors.fgDim
                      return (
                        <td key={p.playerId} style={{ ...tdRight, color, fontWeight: 700 }}>
                          {best != null ? `${best} Darts` : '–'}
                        </td>
                      )
                    })}
                  </tr>
                  {/* Schlechtestes Leg */}
                  <tr>
                    <td style={tdLeft}>Schlechtestes Leg</td>
                    {match.players.map((p) => {
                      const s = stats121MatchByPlayer[p.playerId]
                      const worst = s?.worstLegDarts
                      return (
                        <td key={p.playerId} style={tdRight}>
                          {worst != null ? `${worst} Darts` : '–'}
                        </td>
                      )
                    })}
                  </tr>

                  {/* Trennlinie */}
                  <tr><td colSpan={match.players.length + 1} style={{ borderBottom: `2px solid ${colors.border}`, padding: '4px 0' }}></td></tr>

                  {/* Checkout Quote */}
                  <tr>
                    <td style={tdLeft}>Checkout-Quote</td>
                    {match.players.map((p) => {
                      const s = stats121MatchByPlayer[p.playerId]
                      const pct = s?.checkoutPct ?? 0
                      return (
                        <td key={p.playerId} style={tdRight}>
                          {pct.toFixed(1)}% ({s?.checkoutsMade ?? 0}/{s?.checkoutAttempts ?? 0})
                        </td>
                      )
                    })}
                  </tr>
                  {/* First-Turn Checkouts */}
                  <tr>
                    <td style={tdLeft}>First-Turn Checkouts</td>
                    {match.players.map((p) => {
                      const s = stats121MatchByPlayer[p.playerId]
                      const ftc = s?.firstTurnCheckouts ?? 0
                      return (
                        <td key={p.playerId} style={{ ...tdRight, color: ftc > 0 ? colors.success : colors.fgDim, fontWeight: ftc > 0 ? 700 : 400 }}>
                          {ftc}
                        </td>
                      )
                    })}
                  </tr>
                  {/* Ø Darts auf Double */}
                  <tr>
                    <td style={tdLeft}>Ø Darts auf Double</td>
                    {match.players.map((p) => {
                      const s = stats121MatchByPlayer[p.playerId]
                      const avg = s?.avgDartsOnDouble ?? 0
                      const color = avg > 0 ? (avg <= 1.5 ? colors.success : avg <= 3 ? colors.warning : colors.error) : colors.fgDim
                      return (
                        <td key={p.playerId} style={{ ...tdRight, color }}>
                          {avg > 0 ? avg.toFixed(1) : '–'}
                        </td>
                      )
                    })}
                  </tr>
                  {/* First-Attempt Double Hits */}
                  <tr>
                    <td style={tdLeft}>First-Attempt Double Hits</td>
                    {match.players.map((p) => {
                      const s = stats121MatchByPlayer[p.playerId]
                      return (
                        <td key={p.playerId} style={tdRight}>
                          {s?.firstAttemptDoubleHits ?? 0}
                        </td>
                      )
                    })}
                  </tr>
                  {/* Bevorzugtes Double */}
                  <tr>
                    <td style={tdLeft}>Bevorzugtes Double</td>
                    {match.players.map((p) => {
                      const s = stats121MatchByPlayer[p.playerId]
                      return (
                        <td key={p.playerId} style={{ ...tdRight, fontWeight: 700, color: s?.preferredDouble ? colors.accent : colors.fgDim }}>
                          {s?.preferredDouble ?? '–'}
                        </td>
                      )
                    })}
                  </tr>

                  {/* Trennlinie */}
                  <tr><td colSpan={match.players.length + 1} style={{ borderBottom: `2px solid ${colors.border}`, padding: '4px 0' }}></td></tr>

                  {/* Busts */}
                  <tr>
                    <td style={tdLeft}>Busts gesamt</td>
                    {match.players.map((p) => {
                      const s = stats121MatchByPlayer[p.playerId]
                      const busts = s?.totalBusts ?? 0
                      return (
                        <td key={p.playerId} style={{ ...tdRight, color: busts > 0 ? colors.error : colors.success }}>
                          {busts}
                        </td>
                      )
                    })}
                  </tr>
                  {/* Ø Busts pro Leg */}
                  <tr>
                    <td style={tdLeft}>Ø Busts pro Leg</td>
                    {match.players.map((p) => {
                      const s = stats121MatchByPlayer[p.playerId]
                      const avg = s?.avgBustsPerLeg ?? 0
                      return (
                        <td key={p.playerId} style={tdRight}>
                          {avg.toFixed(2)}
                        </td>
                      )
                    })}
                  </tr>

                  {/* Trennlinie */}
                  <tr><td colSpan={match.players.length + 1} style={{ borderBottom: `2px solid ${colors.border}`, padding: '4px 0' }}></td></tr>

                  {/* Stabilitätsindex */}
                  <tr>
                    <td style={tdLeft}>Ø Stabilität</td>
                    {match.players.map((p) => {
                      const s = stats121MatchByPlayer[p.playerId]
                      const stability = s?.avgStabilityIndex ?? 0
                      const color = stability >= 70 ? colors.success : stability >= 40 ? colors.warning : colors.error
                      return (
                        <td key={p.playerId} style={{ ...tdRight, color, fontWeight: 700 }}>
                          {stability.toFixed(0)}%
                        </td>
                      )
                    })}
                  </tr>
                  {/* Optimale Routen */}
                  <tr>
                    <td style={tdLeft}>Optimale Routen</td>
                    {match.players.map((p) => {
                      const s = stats121MatchByPlayer[p.playerId]
                      const optimal = s?.optimalRouteCount ?? 0
                      const alt = s?.alternativeRouteCount ?? 0
                      const total = optimal + alt
                      return (
                        <td key={p.playerId} style={tdRight}>
                          {total > 0 ? `${optimal}/${total}` : '–'}
                        </td>
                      )
                    })}
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {/* === LEG-CHART CAROUSEL === */}
          {legFinished.length > 0 && (
            <div style={styles.card}>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>Leg-Verlauf</div>
              {/* Navigation Header */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 12,
                padding: '8px 12px',
                background: colors.bgMuted,
                borderRadius: 6,
              }}>
                <button
                  style={{
                    ...styles.pill,
                    opacity: chartLegIndex === 0 ? 0.4 : 1,
                    cursor: chartLegIndex === 0 ? 'not-allowed' : 'pointer',
                  }}
                  disabled={chartLegIndex === 0}
                  onClick={() => setChartLegIndex(i => i - 1)}
                >
                  ←
                </button>
                <span style={{ fontWeight: 600, color: colors.fg }}>
                  Leg {chartLegIndex + 1} von {legFinished.length}
                </span>
                <button
                  style={{
                    ...styles.pill,
                    opacity: chartLegIndex >= legFinished.length - 1 ? 0.4 : 1,
                    cursor: chartLegIndex >= legFinished.length - 1 ? 'not-allowed' : 'pointer',
                  }}
                  disabled={chartLegIndex >= legFinished.length - 1}
                  onClick={() => setChartLegIndex(i => i + 1)}
                >
                  →
                </button>
              </div>

              {/* ScoreProgressionChart für das ausgewählte Leg */}
              {chartLegData && (
                <div style={{ height: 270 }}>
                  <ScoreProgressionChart
                    startScore={match.startingScorePerLeg}
                    players={chartLegData.players}
                    winnerPlayerId={chartLegData.winnerPlayerId}
                    showCheckoutLine={true}
                    showFinishLine={true}
                  />
                </div>
              )}
            </div>
          )}

          {/* Sets oder Legs Liste */}
          <div style={styles.card}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>
              {isSets ? 'Sets' : 'Legs'}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {isSets ? (
                setFinished.length === 0 ? (
                  <div style={{ opacity: 0.6 }}>Keine Sets vorhanden.</div>
                ) : (
                  setFinished.map((sf, idx) => {
                    const legsInSet = legFinished.filter((lf: any) => {
                      const sfIndex = events.indexOf(sf as any)
                      const lfIndex = events.indexOf(lf as any)
                      const prevSfIndex = idx > 0 ? events.indexOf(setFinished[idx - 1] as any) : -1
                      return lfIndex > prevSfIndex && lfIndex < sfIndex
                    })

                    const legsWonByPlayer: Record<string, number> = {}
                    match.players.forEach((p) => { legsWonByPlayer[p.playerId] = 0 })
                    legsInSet.forEach((lf) => {
                      if (lf.winnerPlayerId) legsWonByPlayer[lf.winnerPlayerId]++
                    })

                    const legScore = match.players.map((p) => legsWonByPlayer[p.playerId]).join(':')
                    const winnerSetName = pName(match, sf.winnerPlayerId)

                    return (
                      <div
                        key={sf.eventId}
                        onClick={() => setSelectedSetIndex(sf.setIndex)}
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
                        <span style={{ fontWeight: 700, minWidth: 60 }}>Set {sf.setIndex}</span>
                        <span style={{ color: colors.fgDim, minWidth: 60 }}>Legs {legScore}</span>
                        <span style={{ flex: 1 }}>{match.players.map((p) => p.name).join(' vs ')}</span>
                        <span style={{ fontWeight: 600, color: colors.success }}>{winnerSetName}</span>
                        <span style={{ color: colors.fgMuted, fontSize: 12 }}>→</span>
                      </div>
                    )
                  })
                )
              ) : (
                legFinished.length === 0 ? (
                  <div style={{ opacity: 0.6 }}>Keine Legs vorhanden.</div>
                ) : (
                  (() => {
                    // Kumulativen Spielstand berechnen
                    const cumulativeScore: Record<string, number> = {}
                    match.players.forEach((p) => { cumulativeScore[p.playerId] = 0 })

                    return legFinished.map((lf: any, idx) => {
                      // Spielstand nach diesem Leg aktualisieren
                      if (lf.winnerPlayerId) {
                        cumulativeScore[lf.winnerPlayerId]++
                      }
                      const scoreAfterLeg = match.players.map((p) => cumulativeScore[p.playerId]).join(':')

                      const winnerLegName = pName(match, lf.winnerPlayerId)
                      const checkout = lf.highestCheckoutThisLeg

                      return (
                        <div
                          key={lf.eventId}
                          onClick={() => setSelectedLegId(lf.legId)}
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
                          <span style={{ fontWeight: 700, minWidth: 60 }}>Leg {idx + 1}</span>
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
                          {checkout > 0 && <span style={{ color: colors.fgDim, fontSize: 12 }}>Checkout: {checkout}</span>}
                          <span style={{ flex: 1 }} />
                          <span style={{ fontWeight: 600, color: colors.success }}>{winnerLegName}</span>
                          <span style={{ color: colors.fgMuted, fontSize: 12 }}>→</span>
                        </div>
                      )
                    })
                  })()
                )
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
