// src/screens/MatchDetails.tsx
import React, { useMemo, useState, useEffect } from 'react'
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
  isVisitAdded,
} from '../darts501'
import { getThemedUI } from '../ui'
import { useTheme } from '../ThemeProvider'
import MatchHeader, { type MatchHeaderPlayer } from '../components/MatchHeader'
import LegHeader, { type LegHeaderPlayer } from '../components/LegHeader'
import ScoreProgressionChart, { PLAYER_COLORS } from '../components/ScoreProgressionChart'
import X01StaircaseChart from '../components/X01StaircaseChart'
import { compute121LegStats, compute121MatchStats } from '../stats/compute121LegStats'
import type { Stats121Leg, Stats121Match } from '../types/stats121'
import StatTooltip, { STAT_TOOLTIPS } from '../components/StatTooltip'

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

// Meistes Feld: Welches Segment (1-20, Bull) am häufigsten getroffen
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

// Häufigste Punktzahl: Welcher 3-Dart-Visit-Score am häufigsten geworfen
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

// Meistes Feld für eine Menge von Leg-IDs (z.B. ein Set)
function computeMostHitFieldForLegs(allEvents: DartsEvent[], legIds: string[], playerId: string): string {
  const hitCount: Record<string, number> = {}
  const visits = allEvents.filter((e): e is VisitAdded =>
    isVisitAdded(e) && e.playerId === playerId && legIds.includes(e.legId)
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

function computeMostCommonScoreForLegs(allEvents: DartsEvent[], legIds: string[], playerId: string): string {
  const scoreCount: Record<number, number> = {}
  const visits = allEvents.filter((e): e is VisitAdded =>
    isVisitAdded(e) && e.playerId === playerId && !e.bust && legIds.includes(e.legId)
  )
  for (const v of visits) {
    scoreCount[v.visitScore] = (scoreCount[v.visitScore] ?? 0) + 1
  }
  const sorted = Object.entries(scoreCount).sort((a, b) => Number(b[1]) - Number(a[1]))
  if (sorted.length === 0) return '–'
  return `${sorted[0][0]} (${sorted[0][1]}×)`
}

// Bestimmt Spielerfarbe für den Gewinner einer Statistik-Zeile
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

export default function MatchDetails({ matchId, onBack }: Props) {
  const { isArcade, colors } = useTheme()
  const styles = useMemo(() => getThemedUI(colors, isArcade), [colors, isArcade])

  const [isMobile, setIsMobile] = useState(() => Math.min(window.innerWidth, window.innerHeight) < 600)
  useEffect(() => {
    const check = () => setIsMobile(Math.min(window.innerWidth, window.innerHeight) < 600)
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  const thLeft: React.CSSProperties = {
    textAlign: 'left', fontSize: isMobile ? 11 : 13, fontWeight: 600,
    color: colors.fgDim, padding: isMobile ? '6px 6px' : '8px 12px',
    borderBottom: `2px solid ${colors.border}`,
  }
  const thRight: React.CSSProperties = {
    textAlign: 'right', fontSize: isMobile ? 11 : 13, fontWeight: 700,
    color: colors.fg, padding: isMobile ? '6px 6px' : '8px 12px',
    borderBottom: `2px solid ${colors.border}`,
  }
  const tdLeft: React.CSSProperties = {
    padding: isMobile ? '6px 6px' : '10px 12px', borderBottom: `1px solid ${colors.bgMuted}`,
    fontWeight: 500, color: colors.fg, fontSize: isMobile ? 11 : undefined,
  }
  const tdRight: React.CSSProperties = {
    padding: isMobile ? '6px 6px' : '10px 12px', borderBottom: `1px solid ${colors.bgMuted}`,
    textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600, fontSize: isMobile ? 11 : undefined,
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
  const pids = match.players.map(p => p.playerId)
  const tdWin = (c: string | undefined): React.CSSProperties => c ? { ...tdRight, color: c, fontWeight: 700 } : tdRight

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
  type StatRow = { label: string; getValue: (pid: string) => string; getCompareValue?: (pid: string) => number; better?: 'high' | 'low' }
  const statRows: StatRow[] = [
    { label: '3-Dart-Average', getValue: (pid) => (statsByPlayer[pid]?.threeDartAvg ?? 0).toFixed(2), getCompareValue: (pid) => statsByPlayer[pid]?.threeDartAvg ?? 0, better: 'high' },
    { label: 'First-9 Average', getValue: (pid) => (statsByPlayer[pid]?.first9OverallAvg ?? 0).toFixed(2), getCompareValue: (pid) => statsByPlayer[pid]?.first9OverallAvg ?? 0, better: 'high' },
    { label: 'Höchste Aufnahme', getValue: (pid) => String(highestVisitByPlayer[pid] || 0), getCompareValue: (pid) => highestVisitByPlayer[pid] || 0, better: 'high' },
    { label: 'Höchstes Checkout', getValue: (pid) => highestCheckoutByPlayer[pid] ? String(highestCheckoutByPlayer[pid]) : '–', getCompareValue: (pid) => highestCheckoutByPlayer[pid] || 0, better: 'high' },
    { label: 'Checkout %', getValue: (pid) => {
      const sp = statsByPlayer[pid]
      const made = sp?.doublesHitDart ?? 0
      const att = sp?.doubleAttemptsDart ?? 0
      const pct = att > 0 ? (made / att) * 100 : 0
      return `${pct.toFixed(1)}% (${made}/${att})`
    }, getCompareValue: (pid) => { const sp = statsByPlayer[pid]; const m = sp?.doublesHitDart ?? 0; const a = sp?.doubleAttemptsDart ?? 0; return a > 0 ? (m / a) * 100 : 0 }, better: 'high' },
    { label: 'Darts geworfen', getValue: (pid) => String(statsByPlayer[pid]?.dartsThrown ?? 0) },
    { label: 'Punkte erzielt', getValue: (pid) => String(statsByPlayer[pid]?.pointsScored ?? 0), getCompareValue: (pid) => statsByPlayer[pid]?.pointsScored ?? 0, better: 'high' },
    { label: 'Legs gewonnen', getValue: (pid) => {
      let count = 0
      legFinished.forEach((lf) => { if (lf.winnerPlayerId === pid) count++ })
      return String(count)
    }, getCompareValue: (pid) => legFinished.filter(lf => lf.winnerPlayerId === pid).length, better: 'high' },
    // === Scoring-Bins ===
    { label: '180er', getValue: (pid) => String(statsByPlayer[pid]?.bins._180 ?? 0), getCompareValue: (pid) => statsByPlayer[pid]?.bins._180 ?? 0, better: 'high' },
    { label: '140+', getValue: (pid) => String(statsByPlayer[pid]?.bins._140plus ?? 0), getCompareValue: (pid) => statsByPlayer[pid]?.bins._140plus ?? 0, better: 'high' },
    { label: '100+', getValue: (pid) => String(statsByPlayer[pid]?.bins._100plus ?? 0), getCompareValue: (pid) => statsByPlayer[pid]?.bins._100plus ?? 0, better: 'high' },
    { label: '61+', getValue: (pid) => String(statsByPlayer[pid]?.bins._61plus ?? 0), getCompareValue: (pid) => statsByPlayer[pid]?.bins._61plus ?? 0, better: 'high' },
    // === Checkout-Details ===
    { label: 'Double-Versuche', getValue: (pid) => String(statsByPlayer[pid]?.doubleAttemptsDart ?? 0) },
    { label: 'Lieblingsdoppel', getValue: (pid) => {
      const doubles = statsByPlayer[pid]?.finishingDoubles ?? {}
      const sorted = Object.entries(doubles).sort(([, a], [, b]) => b - a)
      return sorted.length > 0 ? sorted[0][0] : '–'
    }},
    // === Effizienz ===
    { label: 'Bestes Leg', getValue: (pid) => {
      const best = statsByPlayer[pid]?.bestLegDarts
      return best ? `${best} Darts` : '–'
    }, getCompareValue: (pid) => statsByPlayer[pid]?.bestLegDarts ?? Infinity, better: 'low' },
    { label: 'Busts', getValue: (pid) => String(statsByPlayer[pid]?.busts ?? 0), getCompareValue: (pid) => statsByPlayer[pid]?.busts ?? 0, better: 'low' },
    // === Feld- & Score-Analyse ===
    { label: 'Meistes Feld', getValue: (pid) => computeMostHitField(events, null, pid) },
    { label: 'Häufigste Punktzahl', getValue: (pid) => computeMostCommonScore(events, null, pid) },
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

    // Winner-Farben für Set-Statistik
    const setAvgWin = getStatWinnerColors(match.players.map(p => setStatsByPlayer?.[p.playerId]?.threeDartAvg ?? 0), pids, 'high', playerColors)
    const setF9Win = getStatWinnerColors(match.players.map(p => setStatsByPlayer?.[p.playerId]?.first9OverallAvg ?? 0), pids, 'high', playerColors)
    const setHvWin = getStatWinnerColors(match.players.map(p => setHighestVisit[p.playerId] || 0), pids, 'high', playerColors)
    const set180Win = getStatWinnerColors(match.players.map(p => setStatsByPlayer?.[p.playerId]?.bins?._180 ?? 0), pids, 'high', playerColors)
    const set140Win = getStatWinnerColors(match.players.map(p => setStatsByPlayer?.[p.playerId]?.bins?._140plus ?? 0), pids, 'high', playerColors)
    const set100Win = getStatWinnerColors(match.players.map(p => setStatsByPlayer?.[p.playerId]?.bins?._100plus ?? 0), pids, 'high', playerColors)
    const set61Win = getStatWinnerColors(match.players.map(p => setBins61plus[p.playerId] ?? 0), pids, 'high', playerColors)
    const setCoHWin = getStatWinnerColors(match.players.map(p => setCheckoutInfo[p.playerId]?.height ?? 0), pids, 'high', playerColors)
    const setCoQWin = getStatWinnerColors(match.players.map(p => setStatsByPlayer?.[p.playerId]?.doublePctDart ?? 0), pids, 'high', playerColors)
    const setLegsWin = getStatWinnerColors(match.players.map(p => {
      const legsInSet = legFinished.filter((lf: any) => legIds.includes(lf.legId))
      return legsInSet.filter((lf: any) => lf.winnerPlayerId === p.playerId).length
    }), pids, 'high', playerColors)

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
          <div style={{ ...styles.centerInner, width: 'min(600px, 95vw)', maxWidth: '100vw' }}>
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
              <div style={{ display: 'flex', gap: isMobile ? 8 : 16, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12, fontSize: isMobile ? 13 : undefined }}>
                <span>{match.players.map((p) => p.name).join(' vs ')}</span>
                {selectedSetFinish && (
                  <span style={{ fontWeight: 600, color: colors.success }}>
                    Sieger: {pName(match, selectedSetFinish.winnerPlayerId)}
                  </span>
                )}
              </div>

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
                    <td style={tdLeft}><StatTooltip label="Average" tooltip={STAT_TOOLTIPS['Average'] || 'Average'} colors={colors} /></td>
                    {match.players.map((p, i) => (
                      <td key={p.playerId} style={tdWin(setAvgWin[i])}>{(setStatsByPlayer?.[p.playerId]?.threeDartAvg ?? 0).toFixed(1)}</td>
                    ))}
                  </tr>
                  <tr>
                    <td style={tdLeft}><StatTooltip label="First Nine" tooltip={STAT_TOOLTIPS['First Nine'] || 'First Nine'} colors={colors} /></td>
                    {match.players.map((p, i) => (
                      <td key={p.playerId} style={tdWin(setF9Win[i])}>{(setStatsByPlayer?.[p.playerId]?.first9OverallAvg ?? 0).toFixed(1)}</td>
                    ))}
                  </tr>
                  <tr>
                    <td style={tdLeft}><StatTooltip label="Höchste Aufnahme" tooltip={STAT_TOOLTIPS['Höchste Aufnahme'] || 'Höchste Aufnahme'} colors={colors} /></td>
                    {match.players.map((p, i) => (
                      <td key={p.playerId} style={tdWin(setHvWin[i])}>{setHighestVisit[p.playerId] || 0}</td>
                    ))}
                  </tr>
                  <tr>
                    <td style={tdLeft}><StatTooltip label="Meistes Feld" tooltip={STAT_TOOLTIPS['Meistes Feld'] || 'Meistes Feld'} colors={colors} /></td>
                    {match.players.map((p) => (
                      <td key={p.playerId} style={tdRight}>{computeMostHitFieldForLegs(events, legIds, p.playerId)}</td>
                    ))}
                  </tr>
                  <tr>
                    <td style={tdLeft}><StatTooltip label="Häufigste Punktzahl" tooltip={STAT_TOOLTIPS['Häufigste Punktzahl'] || 'Häufigste Punktzahl'} colors={colors} /></td>
                    {match.players.map((p) => (
                      <td key={p.playerId} style={tdRight}>{computeMostCommonScoreForLegs(events, legIds, p.playerId)}</td>
                    ))}
                  </tr>
                  <tr>
                    <td style={tdLeft}><StatTooltip label="180s" tooltip={STAT_TOOLTIPS['180s'] || '180s'} colors={colors} /></td>
                    {match.players.map((p, i) => (
                      <td key={p.playerId} style={tdWin(set180Win[i])}>{setStatsByPlayer?.[p.playerId]?.bins?._180 ?? 0}</td>
                    ))}
                  </tr>
                  <tr>
                    <td style={tdLeft}><StatTooltip label="140+" tooltip={STAT_TOOLTIPS['140+'] || '140+'} colors={colors} /></td>
                    {match.players.map((p, i) => (
                      <td key={p.playerId} style={tdWin(set140Win[i])}>{setStatsByPlayer?.[p.playerId]?.bins?._140plus ?? 0}</td>
                    ))}
                  </tr>
                  <tr>
                    <td style={tdLeft}><StatTooltip label="100+" tooltip={STAT_TOOLTIPS['100+'] || '100+'} colors={colors} /></td>
                    {match.players.map((p, i) => (
                      <td key={p.playerId} style={tdWin(set100Win[i])}>{setStatsByPlayer?.[p.playerId]?.bins?._100plus ?? 0}</td>
                    ))}
                  </tr>
                  <tr>
                    <td style={tdLeft}><StatTooltip label="61+" tooltip={STAT_TOOLTIPS['61+'] || '61+'} colors={colors} /></td>
                    {match.players.map((p, i) => (
                      <td key={p.playerId} style={tdWin(set61Win[i])}>{setBins61plus[p.playerId] ?? 0}</td>
                    ))}
                  </tr>

                  <tr><td colSpan={match.players.length + 1} style={{ borderBottom: `2px solid ${colors.border}`, padding: '4px 0' }}></td></tr>

                  <tr>
                    <td style={tdLeft}><StatTooltip label="Höchster Checkout" tooltip={STAT_TOOLTIPS['Höchster Checkout'] || 'Höchster Checkout'} colors={colors} /></td>
                    {match.players.map((p, i) => {
                      const info = setCheckoutInfo[p.playerId]
                      return (
                        <td key={p.playerId} style={tdWin(setCoHWin[i])}>
                          {info ? `${info.height} (${info.lastDart})` : '–'}
                        </td>
                      )
                    })}
                  </tr>
                  <tr>
                    <td style={tdLeft}><StatTooltip label="Checkout Versuche" tooltip={STAT_TOOLTIPS['Checkout Versuche'] || 'Checkout Versuche'} colors={colors} /></td>
                    {match.players.map((p) => {
                      const attempts = setStatsByPlayer?.[p.playerId]?.doubleAttemptsDart ?? 0
                      const hits = setStatsByPlayer?.[p.playerId]?.doublesHitDart ?? 0
                      return <td key={p.playerId} style={tdRight}>{attempts} / {hits}</td>
                    })}
                  </tr>
                  <tr>
                    <td style={tdLeft}><StatTooltip label="Checkout Quote" tooltip={STAT_TOOLTIPS['Checkout Quote'] || 'Checkout Quote'} colors={colors} /></td>
                    {match.players.map((p, i) => (
                      <td key={p.playerId} style={tdWin(setCoQWin[i])}>{(setStatsByPlayer?.[p.playerId]?.doublePctDart ?? 0).toFixed(0)} %</td>
                    ))}
                  </tr>
                  <tr>
                    <td style={tdLeft}><StatTooltip label="Legs gewonnen" tooltip={STAT_TOOLTIPS['Legs gewonnen'] || 'Legs gewonnen'} colors={colors} /></td>
                    {match.players.map((p, i) => {
                      let count = 0
                      legsInSelectedSet.forEach((lf: any) => { if (lf.winnerPlayerId === p.playerId) count++ })
                      return <td key={p.playerId} style={tdWin(setLegsWin[i])}>{count}</td>
                    })}
                  </tr>
                </tbody>
              </table>
              </div>

              <div style={{ marginTop: 12, color: colors.fgDim, fontSize: isMobile ? 11 : 13 }}>
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
                            gap: isMobile ? 6 : 12,
                            padding: isMobile ? '6px 8px' : '8px 12px',
                            background: colors.bgMuted,
                            borderRadius: 6,
                            fontSize: isMobile ? 12 : 14,
                            cursor: 'pointer',
                          }}
                        >
                          <span style={{ fontWeight: 700, minWidth: isMobile ? 44 : 60 }}>Leg {idx + 1}</span>
                          <span style={{
                            fontWeight: 800,
                            fontSize: isMobile ? 12 : 14,
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

    // Winner-Farben für Leg-Statistik
    const legAvgWin = getStatWinnerColors(match.players.map(p => legStatsByPlayer?.[p.playerId]?.threeDartAvg ?? 0), pids, 'high', playerColors)
    const legF9Win = getStatWinnerColors(match.players.map(p => legStatsByPlayer?.[p.playerId]?.first9OverallAvg ?? 0), pids, 'high', playerColors)
    const legHvWin = getStatWinnerColors(match.players.map(p => highestVisitInLeg[p.playerId] || 0), pids, 'high', playerColors)
    const leg180Win = getStatWinnerColors(match.players.map(p => legStatsByPlayer?.[p.playerId]?.bins?._180 ?? 0), pids, 'high', playerColors)
    const leg140Win = getStatWinnerColors(match.players.map(p => legStatsByPlayer?.[p.playerId]?.bins?._140plus ?? 0), pids, 'high', playerColors)
    const leg100Win = getStatWinnerColors(match.players.map(p => legStatsByPlayer?.[p.playerId]?.bins?._100plus ?? 0), pids, 'high', playerColors)
    const leg61Win = getStatWinnerColors(match.players.map(p => bins61plus[p.playerId] ?? 0), pids, 'high', playerColors)
    const legCoHWin = getStatWinnerColors(match.players.map(p => checkoutInfo[p.playerId]?.height ?? 0), pids, 'high', playerColors)
    const legCoQWin = getStatWinnerColors(match.players.map(p => legStatsByPlayer?.[p.playerId]?.doublePctDart ?? 0), pids, 'high', playerColors)
    const legRestWin = getStatWinnerColors(match.players.map(p => restByPlayer[p.playerId]), pids, 'low', playerColors)

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
          <div style={{ ...styles.centerInner, width: 'min(650px, 95vw)', maxWidth: '100vw' }}>
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
                  {/* Scoring Stats */}
                  <tr>
                    <td style={tdLeft}><StatTooltip label="Average" tooltip={STAT_TOOLTIPS['Average'] || 'Average'} colors={colors} /></td>
                    {match.players.map((p, i) => (
                      <td key={p.playerId} style={tdWin(legAvgWin[i])}>{(legStatsByPlayer?.[p.playerId]?.threeDartAvg ?? 0).toFixed(1)}</td>
                    ))}
                  </tr>
                  <tr>
                    <td style={tdLeft}><StatTooltip label="First Nine" tooltip={STAT_TOOLTIPS['First Nine'] || 'First Nine'} colors={colors} /></td>
                    {match.players.map((p, i) => (
                      <td key={p.playerId} style={tdWin(legF9Win[i])}>{(legStatsByPlayer?.[p.playerId]?.first9OverallAvg ?? 0).toFixed(1)}</td>
                    ))}
                  </tr>
                  <tr>
                    <td style={tdLeft}><StatTooltip label="Höchste Aufnahme" tooltip={STAT_TOOLTIPS['Höchste Aufnahme'] || 'Höchste Aufnahme'} colors={colors} /></td>
                    {match.players.map((p, i) => (
                      <td key={p.playerId} style={tdWin(legHvWin[i])}>{highestVisitInLeg[p.playerId] || 0}</td>
                    ))}
                  </tr>
                  <tr>
                    <td style={tdLeft}><StatTooltip label="Meistes Feld" tooltip={STAT_TOOLTIPS['Meistes Feld'] || 'Meistes Feld'} colors={colors} /></td>
                    {match.players.map((p) => (
                      <td key={p.playerId} style={tdRight}>{computeMostHitField(events, selectedLegId, p.playerId)}</td>
                    ))}
                  </tr>
                  <tr>
                    <td style={tdLeft}><StatTooltip label="Häufigste Punktzahl" tooltip={STAT_TOOLTIPS['Häufigste Punktzahl'] || 'Häufigste Punktzahl'} colors={colors} /></td>
                    {match.players.map((p) => (
                      <td key={p.playerId} style={tdRight}>{computeMostCommonScore(events, selectedLegId, p.playerId)}</td>
                    ))}
                  </tr>
                  <tr>
                    <td style={tdLeft}><StatTooltip label="180s" tooltip={STAT_TOOLTIPS['180s'] || '180s'} colors={colors} /></td>
                    {match.players.map((p, i) => (
                      <td key={p.playerId} style={tdWin(leg180Win[i])}>{legStatsByPlayer?.[p.playerId]?.bins?._180 ?? 0}</td>
                    ))}
                  </tr>
                  <tr>
                    <td style={tdLeft}><StatTooltip label="140+" tooltip={STAT_TOOLTIPS['140+'] || '140+'} colors={colors} /></td>
                    {match.players.map((p, i) => (
                      <td key={p.playerId} style={tdWin(leg140Win[i])}>{legStatsByPlayer?.[p.playerId]?.bins?._140plus ?? 0}</td>
                    ))}
                  </tr>
                  <tr>
                    <td style={tdLeft}><StatTooltip label="100+" tooltip={STAT_TOOLTIPS['100+'] || '100+'} colors={colors} /></td>
                    {match.players.map((p, i) => (
                      <td key={p.playerId} style={tdWin(leg100Win[i])}>{legStatsByPlayer?.[p.playerId]?.bins?._100plus ?? 0}</td>
                    ))}
                  </tr>
                  <tr>
                    <td style={tdLeft}><StatTooltip label="61+" tooltip={STAT_TOOLTIPS['61+'] || '61+'} colors={colors} /></td>
                    {match.players.map((p, i) => (
                      <td key={p.playerId} style={tdWin(leg61Win[i])}>{bins61plus[p.playerId] ?? 0}</td>
                    ))}
                  </tr>

                  {/* Trennlinie */}
                  <tr><td colSpan={match.players.length + 1} style={{ borderBottom: `2px solid ${colors.border}`, padding: '4px 0' }}></td></tr>

                  {/* Checkout Stats */}
                  <tr>
                    <td style={tdLeft}><StatTooltip label="Checkout Höhe" tooltip={STAT_TOOLTIPS['Checkout Höhe'] || 'Checkout Höhe'} colors={colors} /></td>
                    {match.players.map((p, i) => {
                      const info = checkoutInfo[p.playerId]
                      return (
                        <td key={p.playerId} style={tdWin(legCoHWin[i])}>
                          {info ? `${info.height} (${info.lastDart})` : '–'}
                        </td>
                      )
                    })}
                  </tr>
                  <tr>
                    <td style={tdLeft}><StatTooltip label="Checkout Versuche" tooltip={STAT_TOOLTIPS['Checkout Versuche'] || 'Checkout Versuche'} colors={colors} /></td>
                    {match.players.map((p) => {
                      const attempts = legStatsByPlayer?.[p.playerId]?.doubleAttemptsDart ?? 0
                      const hits = legStatsByPlayer?.[p.playerId]?.doublesHitDart ?? 0
                      return <td key={p.playerId} style={tdRight}>{attempts} / {hits}</td>
                    })}
                  </tr>
                  <tr>
                    <td style={tdLeft}><StatTooltip label="Checkout Quote" tooltip={STAT_TOOLTIPS['Checkout Quote'] || 'Checkout Quote'} colors={colors} /></td>
                    {match.players.map((p, i) => (
                      <td key={p.playerId} style={tdWin(legCoQWin[i])}>{(legStatsByPlayer?.[p.playerId]?.doublePctDart ?? 0).toFixed(0)} %</td>
                    ))}
                  </tr>
                  <tr>
                    <td style={tdLeft}><StatTooltip label="Rest" tooltip={STAT_TOOLTIPS['Rest'] || 'Rest'} colors={colors} /></td>
                    {match.players.map((p, i) => (
                      <td key={p.playerId} style={tdWin(legRestWin[i])}>{restByPlayer[p.playerId]}</td>
                    ))}
                  </tr>
                </tbody>
              </table>
              </div>
            </div>

            {/* 121-spezifische Stats (nur bei 121-Spielen) */}
            {is121Game && stats121ByPlayer && (() => {
              // Winner-Farben für 121 Leg-Statistik
              const leg121DartsWin = getStatWinnerColors(match.players.map(p => stats121ByPlayer[p.playerId]?.dartsToFinish ?? Infinity), pids, 'low', playerColors)
              const leg121DartsOnDblWin = getStatWinnerColors(match.players.map(p => stats121ByPlayer[p.playerId]?.dartsOnDouble ?? Infinity), pids, 'low', playerColors)
              const leg121MissedDblWin = getStatWinnerColors(match.players.map(p => stats121ByPlayer[p.playerId]?.missedDoubleDarts ?? Infinity), pids, 'low', playerColors)
              const leg121BustsWin = getStatWinnerColors(match.players.map(p => stats121ByPlayer[p.playerId]?.bustCount ?? Infinity), pids, 'low', playerColors)
              const leg121StreakWin = getStatWinnerColors(match.players.map(p => stats121ByPlayer[p.playerId]?.longestStreakWithoutBust ?? 0), pids, 'high', playerColors)
              const leg121MissedCoWin = getStatWinnerColors(match.players.map(p => stats121ByPlayer[p.playerId]?.missedCheckoutsCount ?? Infinity), pids, 'low', playerColors)
              return (
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
                    {/* Darts to Finish */}
                    <tr>
                      <td style={tdLeft}><StatTooltip label="Darts bis Finish" tooltip={STAT_TOOLTIPS['Darts bis Finish'] || 'Darts bis Finish'} colors={colors} /></td>
                      {match.players.map((p, i) => {
                        const s = stats121ByPlayer[p.playerId]
                        return (
                          <td key={p.playerId} style={tdWin(leg121DartsWin[i])}>
                            {s?.dartsToFinish != null ? s.dartsToFinish : '–'}
                          </td>
                        )
                      })}
                    </tr>
                    {/* Checkout-Kategorie */}
                    <tr>
                      <td style={tdLeft}><StatTooltip label="Checkout-Kategorie" tooltip={STAT_TOOLTIPS['Checkout-Kategorie'] || 'Checkout-Kategorie'} colors={colors} /></td>
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
                      <td style={tdLeft}><StatTooltip label="First-Turn Checkout" tooltip={STAT_TOOLTIPS['First-Turn Checkout'] || 'First-Turn Checkout'} colors={colors} /></td>
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
                      <td style={tdLeft}><StatTooltip label="Darts auf Double" tooltip={STAT_TOOLTIPS['Darts auf Double'] || 'Darts auf Double'} colors={colors} /></td>
                      {match.players.map((p, i) => {
                        const s = stats121ByPlayer[p.playerId]
                        return (
                          <td key={p.playerId} style={tdWin(leg121DartsOnDblWin[i])}>
                            {s?.dartsOnDouble ?? 0}
                          </td>
                        )
                      })}
                    </tr>
                    {/* First-Attempt Double Hit */}
                    <tr>
                      <td style={tdLeft}><StatTooltip label="First-Attempt Double" tooltip={STAT_TOOLTIPS['First-Attempt Double'] || 'First-Attempt Double'} colors={colors} /></td>
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
                      <td style={tdLeft}><StatTooltip label="Verpasste Double-Darts" tooltip={STAT_TOOLTIPS['Verpasste Double-Darts'] || 'Verpasste Double-Darts'} colors={colors} /></td>
                      {match.players.map((p, i) => {
                        const s = stats121ByPlayer[p.playerId]
                        const missed = s?.missedDoubleDarts ?? 0
                        const winColor = leg121MissedDblWin[i]
                        return (
                          <td key={p.playerId} style={winColor ? tdWin(winColor) : { ...tdRight, color: missed > 0 ? colors.error : colors.fgDim }}>
                            {missed}
                          </td>
                        )
                      })}
                    </tr>
                    {/* Double-Feld verwendet */}
                    <tr>
                      <td style={tdLeft}><StatTooltip label="Finish-Double" tooltip={STAT_TOOLTIPS['Finish-Double'] || 'Finish-Double'} colors={colors} /></td>
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
                      <td style={tdLeft}><StatTooltip label="Busts" tooltip={STAT_TOOLTIPS['Busts'] || 'Busts'} colors={colors} /></td>
                      {match.players.map((p, i) => {
                        const s = stats121ByPlayer[p.playerId]
                        const busts = s?.bustCount ?? 0
                        const winColor = leg121BustsWin[i]
                        return (
                          <td key={p.playerId} style={winColor ? tdWin(winColor) : { ...tdRight, color: busts > 0 ? colors.error : colors.success }}>
                            {busts}
                          </td>
                        )
                      })}
                    </tr>
                    {/* Längste Serie ohne Bust */}
                    <tr>
                      <td style={tdLeft}><StatTooltip label="Längste Serie ohne Bust" tooltip={STAT_TOOLTIPS['Längste Serie ohne Bust'] || 'Längste Serie ohne Bust'} colors={colors} /></td>
                      {match.players.map((p, i) => {
                        const s = stats121ByPlayer[p.playerId]
                        return (
                          <td key={p.playerId} style={tdWin(leg121StreakWin[i])}>
                            {s?.longestStreakWithoutBust ?? 0} Visits
                          </td>
                        )
                      })}
                    </tr>
                    {/* Verpasste Checkouts */}
                    <tr>
                      <td style={tdLeft}><StatTooltip label="Verpasste Checkouts" tooltip={STAT_TOOLTIPS['Verpasste Checkouts'] || 'Verpasste Checkouts'} colors={colors} /></td>
                      {match.players.map((p, i) => {
                        const s = stats121ByPlayer[p.playerId]
                        const missed = s?.missedCheckoutsCount ?? 0
                        const winColor = leg121MissedCoWin[i]
                        return (
                          <td key={p.playerId} style={winColor ? tdWin(winColor) : { ...tdRight, color: missed > 0 ? colors.warning : colors.fgDim }}>
                            {missed}
                          </td>
                        )
                      })}
                    </tr>
                    {/* Checkout nach Miss */}
                    <tr>
                      <td style={tdLeft}><StatTooltip label="Checkout nach Fehlversuch" tooltip={STAT_TOOLTIPS['Checkout nach Fehlversuch'] || 'Checkout nach Fehlversuch'} colors={colors} /></td>
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
                      <td style={tdLeft}><StatTooltip label="Stabilitätsindex" tooltip={STAT_TOOLTIPS['Stabilitätsindex'] || 'Stabilitätsindex'} colors={colors} /></td>
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
                        <td style={tdLeft}><StatTooltip label="Checkout-Route" tooltip={STAT_TOOLTIPS['Checkout-Route'] || 'Checkout-Route'} colors={colors} /></td>
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
              </div>
              )})()}

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
        <div style={{ ...styles.centerInner, width: 'min(650px, 95vw)', maxWidth: '100vw' }}>
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
              <div style={{ fontWeight: 700, marginBottom: 8, fontSize: isMobile ? 14 : undefined }}>Match-Statistik</div>
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
                  {statRows.map((row) => {
                    const winColors = row.better && row.getCompareValue
                      ? getStatWinnerColors(match.players.map(p => row.getCompareValue!(p.playerId)), pids, row.better, playerColors)
                      : undefined
                    return (
                      <tr key={row.label}>
                        <td style={tdLeft}><StatTooltip label={row.label} tooltip={STAT_TOOLTIPS[row.label] || row.label} colors={colors} /></td>
                        {match.players.map((p, i) => (
                          <td key={p.playerId} style={tdWin(winColors?.[i])}>{row.getValue(p.playerId)}</td>
                        ))}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              </div>
            </div>
          )}

          {/* 121 Sprint Match-Statistik (nur bei 121-Spielen) */}
          {is121Game && stats121MatchByPlayer && (() => {
            // Winner-Farben für 121 Match-Statistik
            const m121LegsWin = getStatWinnerColors(match.players.map(p => stats121MatchByPlayer[p.playerId]?.legsWon ?? 0), pids, 'high', playerColors)
            const m121AvgDartsWin = getStatWinnerColors(match.players.map(p => stats121MatchByPlayer[p.playerId]?.avgDartsToFinish ?? Infinity), pids, 'low', playerColors)
            const m121BestLegWin = getStatWinnerColors(match.players.map(p => stats121MatchByPlayer[p.playerId]?.bestLegDarts ?? Infinity), pids, 'low', playerColors)
            const m121WorstLegWin = getStatWinnerColors(match.players.map(p => stats121MatchByPlayer[p.playerId]?.worstLegDarts ?? Infinity), pids, 'low', playerColors)
            const m121CoQWin = getStatWinnerColors(match.players.map(p => stats121MatchByPlayer[p.playerId]?.checkoutPct ?? 0), pids, 'high', playerColors)
            const m121FtcWin = getStatWinnerColors(match.players.map(p => stats121MatchByPlayer[p.playerId]?.firstTurnCheckouts ?? 0), pids, 'high', playerColors)
            const m121AvgDblWin = getStatWinnerColors(match.players.map(p => stats121MatchByPlayer[p.playerId]?.avgDartsOnDouble ?? Infinity), pids, 'low', playerColors)
            const m121FaDblWin = getStatWinnerColors(match.players.map(p => stats121MatchByPlayer[p.playerId]?.firstAttemptDoubleHits ?? 0), pids, 'high', playerColors)
            const m121BustsWin = getStatWinnerColors(match.players.map(p => stats121MatchByPlayer[p.playerId]?.totalBusts ?? Infinity), pids, 'low', playerColors)
            const m121AvgBustsWin = getStatWinnerColors(match.players.map(p => stats121MatchByPlayer[p.playerId]?.avgBustsPerLeg ?? Infinity), pids, 'low', playerColors)
            const m121StabWin = getStatWinnerColors(match.players.map(p => stats121MatchByPlayer[p.playerId]?.avgStabilityIndex ?? 0), pids, 'high', playerColors)
            const m121OptimalWin = getStatWinnerColors(match.players.map(p => stats121MatchByPlayer[p.playerId]?.optimalRouteCount ?? 0), pids, 'high', playerColors)
            return (
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
                  {/* Legs */}
                  <tr>
                    <td style={tdLeft}><StatTooltip label="Legs gewonnen" tooltip={STAT_TOOLTIPS['Legs gewonnen'] || 'Legs gewonnen'} colors={colors} /></td>
                    {match.players.map((p, i) => {
                      const s = stats121MatchByPlayer[p.playerId]
                      return (
                        <td key={p.playerId} style={tdWin(m121LegsWin[i])}>
                          {s?.legsWon ?? 0} / {s?.legsPlayed ?? 0}
                        </td>
                      )
                    })}
                  </tr>
                  {/* Durchschnitt Darts bis Finish */}
                  <tr>
                    <td style={tdLeft}><StatTooltip label="Ø Darts bis Finish" tooltip={STAT_TOOLTIPS['Ø Darts bis Finish'] || 'Ø Darts bis Finish'} colors={colors} /></td>
                    {match.players.map((p, i) => {
                      const s = stats121MatchByPlayer[p.playerId]
                      const avg = s?.avgDartsToFinish ?? 0
                      const winColor = m121AvgDartsWin[i]
                      return (
                        <td key={p.playerId} style={winColor ? tdWin(winColor) : { ...tdRight, color: avg > 0 ? (avg <= 6 ? colors.success : avg <= 9 ? colors.warning : colors.error) : colors.fgDim, fontWeight: 700 }}>
                          {avg > 0 ? avg.toFixed(1) : '–'}
                        </td>
                      )
                    })}
                  </tr>
                  {/* Bestes Leg */}
                  <tr>
                    <td style={tdLeft}><StatTooltip label="Bestes Leg" tooltip={STAT_TOOLTIPS['Bestes Leg'] || 'Bestes Leg'} colors={colors} /></td>
                    {match.players.map((p, i) => {
                      const s = stats121MatchByPlayer[p.playerId]
                      const best = s?.bestLegDarts
                      const winColor = m121BestLegWin[i]
                      return (
                        <td key={p.playerId} style={winColor ? tdWin(winColor) : { ...tdRight, color: best != null ? (best <= 6 ? colors.success : best <= 9 ? colors.warning : colors.error) : colors.fgDim, fontWeight: 700 }}>
                          {best != null ? `${best} Darts` : '–'}
                        </td>
                      )
                    })}
                  </tr>
                  {/* Schlechtestes Leg */}
                  <tr>
                    <td style={tdLeft}><StatTooltip label="Schlechtestes Leg" tooltip={STAT_TOOLTIPS['Schlechtestes Leg'] || 'Schlechtestes Leg'} colors={colors} /></td>
                    {match.players.map((p, i) => {
                      const s = stats121MatchByPlayer[p.playerId]
                      const worst = s?.worstLegDarts
                      return (
                        <td key={p.playerId} style={tdWin(m121WorstLegWin[i])}>
                          {worst != null ? `${worst} Darts` : '–'}
                        </td>
                      )
                    })}
                  </tr>

                  {/* Trennlinie */}
                  <tr><td colSpan={match.players.length + 1} style={{ borderBottom: `2px solid ${colors.border}`, padding: '4px 0' }}></td></tr>

                  {/* Checkout Quote */}
                  <tr>
                    <td style={tdLeft}><StatTooltip label="Checkout-Quote" tooltip={STAT_TOOLTIPS['Checkout-Quote'] || 'Checkout-Quote'} colors={colors} /></td>
                    {match.players.map((p, i) => {
                      const s = stats121MatchByPlayer[p.playerId]
                      const pct = s?.checkoutPct ?? 0
                      return (
                        <td key={p.playerId} style={tdWin(m121CoQWin[i])}>
                          {pct.toFixed(1)}% ({s?.checkoutsMade ?? 0}/{s?.checkoutAttempts ?? 0})
                        </td>
                      )
                    })}
                  </tr>
                  {/* First-Turn Checkouts */}
                  <tr>
                    <td style={tdLeft}><StatTooltip label="First-Turn Checkouts" tooltip={STAT_TOOLTIPS['First-Turn Checkouts'] || 'First-Turn Checkouts'} colors={colors} /></td>
                    {match.players.map((p, i) => {
                      const s = stats121MatchByPlayer[p.playerId]
                      const ftc = s?.firstTurnCheckouts ?? 0
                      const winColor = m121FtcWin[i]
                      return (
                        <td key={p.playerId} style={winColor ? tdWin(winColor) : { ...tdRight, color: ftc > 0 ? colors.success : colors.fgDim, fontWeight: ftc > 0 ? 700 : 400 }}>
                          {ftc}
                        </td>
                      )
                    })}
                  </tr>
                  {/* Ø Darts auf Double */}
                  <tr>
                    <td style={tdLeft}><StatTooltip label="Ø Darts auf Double" tooltip={STAT_TOOLTIPS['Ø Darts auf Double'] || 'Ø Darts auf Double'} colors={colors} /></td>
                    {match.players.map((p, i) => {
                      const s = stats121MatchByPlayer[p.playerId]
                      const avg = s?.avgDartsOnDouble ?? 0
                      const winColor = m121AvgDblWin[i]
                      return (
                        <td key={p.playerId} style={winColor ? tdWin(winColor) : { ...tdRight, color: avg > 0 ? (avg <= 1.5 ? colors.success : avg <= 3 ? colors.warning : colors.error) : colors.fgDim }}>
                          {avg > 0 ? avg.toFixed(1) : '–'}
                        </td>
                      )
                    })}
                  </tr>
                  {/* First-Attempt Double Hits */}
                  <tr>
                    <td style={tdLeft}><StatTooltip label="First-Attempt Double Hits" tooltip={STAT_TOOLTIPS['First-Attempt Double Hits'] || 'First-Attempt Double Hits'} colors={colors} /></td>
                    {match.players.map((p, i) => {
                      const s = stats121MatchByPlayer[p.playerId]
                      return (
                        <td key={p.playerId} style={tdWin(m121FaDblWin[i])}>
                          {s?.firstAttemptDoubleHits ?? 0}
                        </td>
                      )
                    })}
                  </tr>
                  {/* Bevorzugtes Double */}
                  <tr>
                    <td style={tdLeft}><StatTooltip label="Bevorzugtes Double" tooltip={STAT_TOOLTIPS['Bevorzugtes Double'] || 'Bevorzugtes Double'} colors={colors} /></td>
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
                    <td style={tdLeft}><StatTooltip label="Busts gesamt" tooltip={STAT_TOOLTIPS['Busts gesamt'] || 'Busts gesamt'} colors={colors} /></td>
                    {match.players.map((p, i) => {
                      const s = stats121MatchByPlayer[p.playerId]
                      const busts = s?.totalBusts ?? 0
                      const winColor = m121BustsWin[i]
                      return (
                        <td key={p.playerId} style={winColor ? tdWin(winColor) : { ...tdRight, color: busts > 0 ? colors.error : colors.success }}>
                          {busts}
                        </td>
                      )
                    })}
                  </tr>
                  {/* Ø Busts pro Leg */}
                  <tr>
                    <td style={tdLeft}><StatTooltip label="Ø Busts pro Leg" tooltip={STAT_TOOLTIPS['Ø Busts pro Leg'] || 'Ø Busts pro Leg'} colors={colors} /></td>
                    {match.players.map((p, i) => {
                      const s = stats121MatchByPlayer[p.playerId]
                      const avg = s?.avgBustsPerLeg ?? 0
                      return (
                        <td key={p.playerId} style={tdWin(m121AvgBustsWin[i])}>
                          {avg.toFixed(2)}
                        </td>
                      )
                    })}
                  </tr>

                  {/* Trennlinie */}
                  <tr><td colSpan={match.players.length + 1} style={{ borderBottom: `2px solid ${colors.border}`, padding: '4px 0' }}></td></tr>

                  {/* Stabilitätsindex */}
                  <tr>
                    <td style={tdLeft}><StatTooltip label="Ø Stabilität" tooltip={STAT_TOOLTIPS['Ø Stabilität'] || 'Ø Stabilität'} colors={colors} /></td>
                    {match.players.map((p, i) => {
                      const s = stats121MatchByPlayer[p.playerId]
                      const stability = s?.avgStabilityIndex ?? 0
                      const winColor = m121StabWin[i]
                      return (
                        <td key={p.playerId} style={winColor ? tdWin(winColor) : { ...tdRight, color: stability >= 70 ? colors.success : stability >= 40 ? colors.warning : colors.error, fontWeight: 700 }}>
                          {stability.toFixed(0)}%
                        </td>
                      )
                    })}
                  </tr>
                  {/* Optimale Routen */}
                  <tr>
                    <td style={tdLeft}><StatTooltip label="Optimale Routen" tooltip={STAT_TOOLTIPS['Optimale Routen'] || 'Optimale Routen'} colors={colors} /></td>
                    {match.players.map((p, i) => {
                      const s = stats121MatchByPlayer[p.playerId]
                      const optimal = s?.optimalRouteCount ?? 0
                      const alt = s?.alternativeRouteCount ?? 0
                      const total = optimal + alt
                      return (
                        <td key={p.playerId} style={tdWin(m121OptimalWin[i])}>
                          {total > 0 ? `${optimal}/${total}` : '–'}
                        </td>
                      )
                    })}
                  </tr>
                </tbody>
              </table>
              </div>
            </div>
            )})()}

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

          {/* Sets oder Legs Liste (hide when only 1 leg in non-sets mode) */}
          {(isSets || legFinished.length > 1) && (
          <div style={styles.card}>
            <div style={{ fontWeight: 700, marginBottom: 8, fontSize: isMobile ? 14 : undefined }}>
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
                          gap: isMobile ? 6 : 12,
                          padding: isMobile ? '6px 8px' : '8px 12px',
                          background: colors.bgMuted,
                          borderRadius: 6,
                          fontSize: isMobile ? 12 : 14,
                          cursor: 'pointer',
                        }}
                      >
                        <span style={{ fontWeight: 700, minWidth: isMobile ? 44 : 60 }}>Set {sf.setIndex}</span>
                        <span style={{ color: colors.fgDim, minWidth: isMobile ? 44 : 60 }}>Legs {legScore}</span>
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
                            gap: isMobile ? 6 : 12,
                            padding: isMobile ? '6px 8px' : '8px 12px',
                            background: colors.bgMuted,
                            borderRadius: 6,
                            fontSize: isMobile ? 12 : 14,
                            cursor: 'pointer',
                          }}
                        >
                          <span style={{ fontWeight: 700, minWidth: isMobile ? 44 : 60 }}>Leg {idx + 1}</span>
                          <span style={{
                            fontWeight: 800,
                            fontSize: isMobile ? 12 : 14,
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
          )}
        </div>
      </div>
    </div>
  )
}
