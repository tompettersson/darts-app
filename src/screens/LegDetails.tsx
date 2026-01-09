// src/screens/LegDetails.tsx
import React, { useMemo } from 'react'
import { loadMatchById } from '../storage'
import {
  applyEvents,
  type DartsEvent,
  type MatchStarted,
  type VisitAdded,
  type LegFinished,
} from '../darts501'
import { ui } from '../ui'

type Props = {
  matchId: string
  legId: string
  onBackToMatch: () => void
  onBackToSet?: () => void // optional – nur anzeigen, wenn set vorhanden
}

function requiredToWin(bestOf: number) {
  return Math.floor(bestOf / 2) + 1
}

function pName(match: MatchStarted, playerId: string) {
  return match.players.find(p => p.playerId === playerId)?.name ?? playerId
}

function dartShort(d: any) {
  const mult = d?.mult ?? 1
  const bed = d?.bed
  const prefix = mult === 3 ? 'T' : mult === 2 ? 'D' : 'S'
  if (bed === 'MISS') return 'MISS'
  if (bed === 'DBULL') return 'DBULL'
  if (bed === 'BULL') return 'BULL'
  if (typeof bed === 'number') return `${prefix}${bed}`
  return '—'
}

function fmtCheckoutDouble(d: any): string | null {
  if (!d) return null
  if (d?.bed === 'DBULL') return 'DBULL'
  if (typeof d?.bed === 'number' && d?.mult === 2) return `D${d.bed}`
  return null
}

function isFinishable(rem: number) {
  // double-out: 2..40 even or 50 (DBULL)
  if (rem === 50) return true
  if (rem >= 2 && rem <= 40 && rem % 2 === 0) return true
  return false
}

function isDoubleOrDBull(d: any) {
  if (!d) return false
  if (d.bed === 'DBULL') return true
  if (typeof d.bed === 'number' && d.mult === 2) return true
  return false
}

type LegPlayerRow = {
  playerId: string
  name: string
  legsScore: number
  avg3da: number
  first9: number
  n180: number
  n140: number
  n100: number
  n61: number
  checkoutBest: { value: number; dbl?: string } | null
  coAttempts: number
  coHit: number
  coPct: number
  rest: number
}

type LegVisitRow = {
  eventId: string
  playerId: string
  playerName: string
  darts: string[] // 3 entries max
  visit: number
  bust: boolean
  before: number
  after: number
}

function buildLegMeta(events: DartsEvent[]) {
  // Map legId -> setIndex (if any), via sequential scan
  let curSetIndex: number | undefined = undefined
  const legToSet = new Map<string, number | undefined>()
  for (const e of events as any[]) {
    if (e.type === 'SetStarted') curSetIndex = e.setIndex
    if (e.type === 'LegStarted') legToSet.set(e.legId, curSetIndex)
  }
  return { legToSet }
}

function sliceEventsThroughLegFinish(events: DartsEvent[], legId: string) {
  // include up to & including LegFinished for this leg (if present)
  const idx = events.findIndex(e => e.type === 'LegFinished' && (e as any).legId === legId)
  if (idx >= 0) return events.slice(0, idx + 1)
  // if unfinished, include all up to last VisitAdded of that leg
  return events
}

export default function LegDetails({ matchId, legId, onBackToMatch, onBackToSet }: Props) {
  const stored = loadMatchById(matchId)

  if (!stored) {
    return (
      <div style={ui.page}>
        <div style={ui.card}>
          <h2 style={{ margin: 0 }}>Match nicht gefunden</h2>
          <div style={{ marginTop: 10 }}>
            <button style={ui.backBtn} onClick={onBackToMatch}>← Zurück</button>
          </div>
        </div>
      </div>
    )
  }

  const eventsAll = stored.events as DartsEvent[]
  const stateAll = useMemo(() => applyEvents(eventsAll), [eventsAll])
  const match = stateAll.match as MatchStarted | undefined

  if (!match) {
    return (
      <div style={ui.page}>
        <div style={ui.card}>
          <h2 style={{ margin: 0 }}>Unvollständige Matchdaten</h2>
          <div style={{ marginTop: 6, opacity: 0.8 }}>Es fehlt das MatchStarted-Event.</div>
          <div style={{ marginTop: 10 }}>
            <button style={ui.backBtn} onClick={onBackToMatch}>← Zurück</button>
          </div>
        </div>
      </div>
    )
  }

  const { legToSet } = useMemo(() => buildLegMeta(eventsAll), [eventsAll])

  const eventsThrough = useMemo(() => sliceEventsThroughLegFinish(eventsAll, legId), [eventsAll, legId])
  const stateThrough = useMemo(() => applyEvents(eventsThrough), [eventsThrough])

  const leg = stateAll.legs.find(l => l.legId === legId)
  if (!leg) {
    return (
      <div style={ui.page}>
        <div style={ui.card}>
          <h2 style={{ margin: 0 }}>Leg nicht gefunden</h2>
          <div style={{ marginTop: 10 }}>
            <button style={ui.backBtn} onClick={onBackToMatch}>← Zurück</button>
          </div>
        </div>
      </div>
    )
  }

  const legIndex = (leg as any).legIndex ?? (stateAll.legs.findIndex(l => l.legId === legId) + 1)

  const lf = eventsAll.find(e => e.type === 'LegFinished' && (e as any).legId === legId) as LegFinished | undefined
  const winnerId = lf?.winnerPlayerId
  const winnerName = winnerId ? pName(match, winnerId) : '—'

  // starter
  const legStarted = eventsAll.find(e => e.type === 'LegStarted' && (e as any).legId === legId) as any
  const starterId = legStarted?.starterPlayerId as string | undefined
  const starterName = starterId ? pName(match, starterId) : '—'

  // structure label
  const structureLabel = useMemo(() => {
    if (match.structure.kind === 'legs') {
      const need = requiredToWin(match.structure.bestOfLegs ?? 1)
      return `FIRST TO ${need} LEGS`
    }
    const needSets = requiredToWin(match.structure.bestOfSets)
    const needLegs = requiredToWin(match.structure.legsPerSet)
    return `FIRST TO ${needSets} SETS / FIRST TO ${needLegs} LEGS`
  }, [match.structure])

  // set context (if any)
  const setIndex = legToSet.get(legId)
  const showSetBack = match.structure.kind === 'sets' && typeof setIndex === 'number' && !!onBackToSet

  // legs score within current set (or match total if legs-only)
  const legsScoreByPlayer = useMemo(() => {
    const players = match.players.map(p => p.playerId)
    const base: Record<string, number> = Object.fromEntries(players.map(pid => [pid, 0]))

    if (match.structure.kind === 'legs') {
      for (const L of stateThrough.legs) {
        if (L.winnerPlayerId) base[L.winnerPlayerId] = (base[L.winnerPlayerId] ?? 0) + 1
      }
      return base
    }

    // sets: count legs winners only within this set up to this leg
    const curSet = typeof setIndex === 'number' ? setIndex : undefined
    if (!curSet) return base

    // scan eventsThrough: count LegFinished that belong to this set
    let cur: number | undefined = undefined
    const legIdToSetLocal = new Map<string, number | undefined>()
    for (const e of eventsThrough as any[]) {
      if (e.type === 'SetStarted') cur = e.setIndex
      if (e.type === 'LegStarted') legIdToSetLocal.set(e.legId, cur)
      if (e.type === 'LegFinished') {
        const sid = legIdToSetLocal.get(e.legId)
        if (sid === curSet && e.winnerPlayerId) {
          base[e.winnerPlayerId] = (base[e.winnerPlayerId] ?? 0) + 1
        }
      }
    }
    return base
  }, [eventsThrough, match.players, match.structure.kind, setIndex, stateThrough.legs])

  // visits in this leg
  const visits = useMemo(() => {
    const v = eventsAll.filter(e => e.type === 'VisitAdded' && (e as any).legId === legId) as VisitAdded[]
    return v
  }, [eventsAll, legId])

  // Build per-player leg stats
  const playerRows: LegPlayerRow[] = useMemo(() => {
    const players = match.players.map(p => ({ id: p.playerId, name: p.name ?? p.playerId }))
    const rows: Record<string, LegPlayerRow> = {}

    for (const p of players) {
      rows[p.id] = {
        playerId: p.id,
        name: p.name,
        legsScore: legsScoreByPlayer[p.id] ?? 0,
        avg3da: 0,
        first9: 0,
        n180: 0,
        n140: 0,
        n100: 0,
        n61: 0,
        checkoutBest: null,
        coAttempts: 0,
        coHit: 0,
        coPct: 0,
        rest: leg.remainingByPlayer?.[p.id] ?? 0,
      }
    }

    // collect darts + points per player
    type Acc = { points: number; darts: number; first9Points: number; first9Darts: number }
    const acc: Record<string, Acc> = Object.fromEntries(players.map(p => [p.id, { points: 0, darts: 0, first9Points: 0, first9Darts: 0 }]))

    // checkout best needs finishing visit dart
    const finishingVisitId = (lf as any)?.finishingVisitId as string | undefined
    const finishingSeq = (lf as any)?.finishingDartSeq as 1 | 2 | 3 | undefined
    let finishingDoubleLabel: string | undefined = undefined
    if (finishingVisitId && finishingSeq) {
      const fv = visits.find(x => x.eventId === finishingVisitId) as any
      const d = fv?.darts?.[finishingSeq - 1]
      const dbl = fmtCheckoutDouble(d)
      if (dbl) finishingDoubleLabel = dbl
    }

    for (const v of visits as any[]) {
      const pid = v.playerId
      if (!rows[pid]) continue

      const bust = !!v.bust
      const visitScore = bust ? 0 : (v.visitScore ?? 0)
      const darts = Array.isArray(v.darts) ? v.darts : []

      acc[pid].points += visitScore
      acc[pid].darts += darts.length

      // first 9 (count first 9 darts per player)
      for (let i = 0; i < darts.length; i++) {
        if (acc[pid].first9Darts >= 9) break
        acc[pid].first9Darts += 1
        acc[pid].first9Points += (darts[i]?.score ?? 0)
      }

      // power scoring buckets by visit
      if (!bust) {
        if (visitScore >= 180) rows[pid].n180 += 1
        if (visitScore >= 140) rows[pid].n140 += 1
        if (visitScore >= 100) rows[pid].n100 += 1
        if (visitScore >= 61) rows[pid].n61 += 1
      }

      // checkout attempts/hits (dart-basiert, leg-spezifisch)
      // We simulate remaining before each dart using remainingBefore and dart scores.
      let rem = v.remainingBefore ?? 0
      for (const d of darts) {
        if (isFinishable(rem) && isDoubleOrDBull(d)) {
          rows[pid].coAttempts += 1
        }
        const score = d?.score ?? 0
        const after = rem - score
        if (after === 0 && isDoubleOrDBull(d)) {
          rows[pid].coHit += 1
        }
        // bust logic: if bust, stop updating rem for attempts (we already counted attempts above per dart)
        rem = after
        if (after <= 0 || after === 1) break
      }

      // checkout best for winner (from LegFinished highestCheckoutThisLeg)
      if (lf && pid === lf.winnerPlayerId) {
        const val = (lf as any).highestCheckoutThisLeg ?? 0
        rows[pid].checkoutBest = {
          value: val,
          dbl: finishingDoubleLabel,
        }
      }
    }

    for (const pid of Object.keys(rows)) {
      const a = acc[pid]
      rows[pid].avg3da = a.darts > 0 ? (a.points / a.darts) * 3 : 0
      rows[pid].first9 = a.first9Darts > 0 ? (a.first9Points / a.first9Darts) * 3 : 0
      rows[pid].coPct = rows[pid].coAttempts > 0 ? (rows[pid].coHit / rows[pid].coAttempts) * 100 : 0
    }

    return match.players.map(p => rows[p.playerId])
  }, [match.players, visits, lf, leg.remainingByPlayer, legsScoreByPlayer])

  // compact leg timeline (no date/time)
  const visitRows: LegVisitRow[] = useMemo(() => {
    return visits.map((v: any) => {
      const darts = (Array.isArray(v.darts) ? v.darts : []).slice(0, 3).map(dartShort)
      while (darts.length < 3) darts.push('—')
      return {
        eventId: v.eventId,
        playerId: v.playerId,
        playerName: pName(match, v.playerId),
        darts,
        visit: v.visitScore ?? 0,
        bust: !!v.bust,
        before: v.remainingBefore ?? 0,
        after: v.remainingAfter ?? 0,
      }
    })
  }, [visits, match])

  // current set score line (e.g. "Aktuelles Set: 1-0")
  const setScoreLine = useMemo(() => {
    const players = match.players.map(p => p.playerId)
    if (players.length < 2) return ''
    // show first two players in "a-b" style; for 3+ we show "A:1 · B:0 · C:0"
    if (players.length === 2) {
      const a = legsScoreByPlayer[players[0]] ?? 0
      const b = legsScoreByPlayer[players[1]] ?? 0
      return `${a}-${b}`
    }
    return players.map(pid => `${pName(match, pid)}:${legsScoreByPlayer[pid] ?? 0}`).join(' · ')
  }, [legsScoreByPlayer, match])

  const headerTitle = `LEG ${legIndex} | 501 | ${structureLabel}`

  const styles: Record<string, React.CSSProperties> = {
    head: {
      background: '#0b1220',
      color: 'white',
      borderRadius: 14,
      padding: 16,
      border: '1px solid rgba(255,255,255,0.08)',
    },
    headTitle: { fontSize: 28, fontWeight: 900, letterSpacing: 0.5, margin: 0 },
    headSub: { marginTop: 6, opacity: 0.75, display: 'flex', gap: 10, flexWrap: 'wrap' },

    card: { ...ui.card, padding: 14 },
    tableWrap: { overflowX: 'auto' },
    th: {
      textAlign: 'left',
      fontSize: 12,
      fontWeight: 700,
      color: '#64748b',
      padding: '6px 8px',
      borderBottom: '1px solid #e5e7eb',
      whiteSpace: 'nowrap',
    },
    td: {
      padding: '8px 8px',
      borderBottom: '1px solid #f1f5f9',
      whiteSpace: 'nowrap',
      fontVariantNumeric: 'tabular-nums',
    },
    tdR: {
      padding: '8px 8px',
      borderBottom: '1px solid #f1f5f9',
      textAlign: 'right',
      whiteSpace: 'nowrap',
      fontVariantNumeric: 'tabular-nums',
    },
    winner: { color: '#16a34a', fontWeight: 900 },
    timelineRow: {
      border: '1px solid #e5e7eb',
      borderRadius: 12,
      padding: 10,
      display: 'grid',
      gap: 6,
      background: '#fff',
    },
    timelineTop: { display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' },
    pills: { display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' },
    pill: {
      border: '1px solid #e5e7eb',
      borderRadius: 999,
      padding: '4px 8px',
      fontSize: 12,
      background: '#f8fafc',
      fontVariantNumeric: 'tabular-nums',
    },
    bust: { background: '#fff1f2', borderColor: '#fecdd3', color: '#9f1239', fontWeight: 800 },
  }

  return (
    <div style={ui.page}>
      {/* Header */}
      <div style={styles.head}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div>
            <h1 style={styles.headTitle}>{headerTitle}</h1>
            <div style={styles.headSub}>
              <span>Anwurf: <b>{starterName}</b></span>
              <span>Leg Winner: <b style={winnerId ? styles.winner : undefined}>{winnerName}</b></span>
              {match.structure.kind === 'sets'
                ? <span>Aktuelles Set: <b>{setScoreLine || '—'}</b></span>
                : <span>Match-Stand: <b>{setScoreLine || '—'}</b></span>
              }
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            {showSetBack && (
              <button style={ui.backBtn} onClick={onBackToSet}>← Set</button>
            )}
            <button style={ui.backBtn} onClick={onBackToMatch}>← Match</button>
          </div>
        </div>
      </div>

      {/* Summary Table */}
      <div style={styles.card}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>Leg Summary</div>

        <div style={styles.tableWrap}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 980 }}>
            <thead>
              <tr>
                <th style={styles.th}>Spieler</th>
                <th style={{ ...styles.th, textAlign: 'right' }}>Spielstand</th>
                <th style={{ ...styles.th, textAlign: 'right' }}>Average</th>
                <th style={{ ...styles.th, textAlign: 'right' }}>First Nine</th>
                <th style={{ ...styles.th, textAlign: 'right' }}>180s</th>
                <th style={{ ...styles.th, textAlign: 'right' }}>140+</th>
                <th style={{ ...styles.th, textAlign: 'right' }}>100+</th>
                <th style={{ ...styles.th, textAlign: 'right' }}>61+</th>
                <th style={{ ...styles.th, textAlign: 'right' }}>Checkout Höhe</th>
                <th style={{ ...styles.th, textAlign: 'right' }}>CO Versuche</th>
                <th style={{ ...styles.th, textAlign: 'right' }}>CO Quote</th>
                <th style={{ ...styles.th, textAlign: 'right' }}>Rest</th>
              </tr>
            </thead>
            <tbody>
              {playerRows.map(r => {
                const isWinner = winnerId && r.playerId === winnerId
                const coText =
                  r.checkoutBest && r.checkoutBest.value > 0
                    ? `${r.checkoutBest.value}${r.checkoutBest.dbl ? ` (${r.checkoutBest.dbl})` : ''}`
                    : '—'

                return (
                  <tr key={r.playerId}>
                    <td style={{ ...styles.td, fontWeight: 900 }}>
                      {r.name}{isWinner ? <span style={{ marginLeft: 8, ...styles.winner }}>●</span> : null}
                    </td>
                    <td style={styles.tdR}>{r.legsScore}</td>
                    <td style={styles.tdR}>{r.avg3da.toFixed(1)}</td>
                    <td style={styles.tdR}>{r.first9.toFixed(1)}</td>
                    <td style={styles.tdR}>{r.n180}</td>
                    <td style={styles.tdR}>{r.n140}</td>
                    <td style={styles.tdR}>{r.n100}</td>
                    <td style={styles.tdR}>{r.n61}</td>
                    <td style={{ ...styles.tdR, ...(isWinner ? styles.winner : undefined) }}>{coText}</td>
                    <td style={styles.tdR}>{r.coAttempts}</td>
                    <td style={styles.tdR}>
                      {r.coPct.toFixed(0)}% <span style={{ color: '#94a3b8' }}>({r.coHit}/{r.coAttempts})</span>
                    </td>
                    <td style={styles.tdR}>{r.rest}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <div style={{ ...ui.sub, marginTop: 8 }}>
          Checkout-Versuche/Quote sind dart-basiert und leg-spezifisch (Double/DBULL auf finishbarem Rest).
        </div>
      </div>

      {/* Timeline */}
      <div style={styles.card}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>Leg-Verlauf</div>

        <div style={{ display: 'grid', gap: 8 }}>
          {visitRows.length === 0 ? (
            <div style={{ opacity: 0.7 }}>Keine Aufnahmen in diesem Leg.</div>
          ) : (
            visitRows.map((v, i) => (
              <div key={v.eventId} style={{ ...styles.timelineRow, ...(v.bust ? { background: '#fff7f7' } : null) }}>
                <div style={styles.timelineTop}>
                  <div style={{ fontWeight: 900 }}>
                    #{i + 1} · {v.playerName} {v.bust ? <span style={{ marginLeft: 8, ...styles.bust, padding: '3px 8px', borderRadius: 999, border: '1px solid #fecdd3' }}>BUST</span> : null}
                  </div>
                  <div style={{ opacity: 0.8, fontVariantNumeric: 'tabular-nums' }}>
                    Rest: {v.before} → <b>{v.after}</b>
                  </div>
                </div>

                <div style={styles.pills}>
                  <span style={styles.pill}>{v.darts[0]}</span>
                  <span style={styles.pill}>{v.darts[1]}</span>
                  <span style={styles.pill}>{v.darts[2]}</span>
                  <span style={{ ...styles.pill, marginLeft: 6, fontWeight: 900 }}>
                    Visit: {v.visit}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
