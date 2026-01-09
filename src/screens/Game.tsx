// src/screens/Game.tsx
// Spielscreen – modernisierte UI (weiche Cards, Chips, große Live-Zahl, Dart-Pills rechts)
// Styling komplett via game.css

import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  loadMatchById,
  persistEvents,
  finishMatch,
  finishMatchUpload,
  updateLeaderboardsWithMatch,
  updateGlobalX01PlayerStatsFromMatch, // 🔥 NEU: langfristige Spieler-Stats aktualisieren
} from '../storage'
import {
  applyEvents,
  recordVisit,
  computeStats,
  type DartsEvent,
  type Dart,
  type MatchStarted,
  type DerivedLegState,
  type Bed,
  now,
  id,
} from '../darts501'
import Scoreboard from '../components/Scoreboard'
import './game.css'

// ---- Helpers ----
function requiredToWinLocal(bestOf: number) {
  return Math.floor(bestOf / 2) + 1
}

function nextLegStarter(match: MatchStarted, totalLegsStarted: number) {
  const order = match.players.map((p) => p.playerId)
  const first = match.bullThrow.winnerPlayerId
  const idx0 = order.indexOf(first)
  const idx = (idx0 + totalLegsStarted) % order.length
  return order[idx]
}

function getLegStarterId(events: DartsEvent[], legId: string): string | undefined {
  const ls = events.find((e) => e.type === 'LegStarted' && (e as any).legId === legId) as any
  return ls?.starterPlayerId
}

function getCurrentPlayerId(match: MatchStarted, leg: DerivedLegState, events: DartsEvent[]): string {
  const order = match.players.map((p) => p.playerId)
  const last = leg.visits[leg.visits.length - 1]
  if (!last) {
    const starter = getLegStarterId(events, leg.legId)
    return starter ?? match.bullThrow.winnerPlayerId
  }
  const i = order.indexOf(last.playerId)
  return order[(i + 1) % order.length]
}

function getLastVisitForPlayer(leg: DerivedLegState, playerId: string) {
  for (let i = leg.visits.length - 1; i >= 0; i--) {
    const v = leg.visits[i]
    if (v.playerId === playerId) return v
  }
  return undefined
}

// Nur Punktscore (kein D/T-Text)
function dartScore(d: Dart): number {
  if ((d as any).bed === 'MISS') return 0
  if (d.bed === 'DBULL') return 50
  if (d.bed === 'BULL') return 25
  return (d.bed as number) * d.mult
}

// Live-Preview: Rest nach bisherigen Darts (inkl. Bust-Logik)
function simulateLiveRemaining(startRemaining: number, darts: Dart[]) {
  let tmp = startRemaining
  let bust = false
  for (let i = 0; i < darts.length && i < 3; i++) {
    const d = darts[i]
    const score =
      (d as any).bed === 'MISS'
        ? 0
        : d.bed === 'DBULL'
          ? 50
          : d.bed === 'BULL'
            ? 25
            : (d.bed as number) * d.mult
    const after = tmp - score
    if (after === 0) {
      const isDouble =
        (d as any).bed === 'DBULL' || (typeof d.bed === 'number' && d.mult === 2)
      if (isDouble) {
        tmp = 0
        break
      }
      bust = true
      tmp = startRemaining
      break
    }
    if (after < 0 || after === 1) {
      bust = true
      tmp = startRemaining
      break
    }
    tmp = after
  }
  return { remaining: tmp, bust }
}

// Legs-/Sets-Stand (Anzeige)
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

  const currentLegIndex = state.legs.length
  const currentSetIndex =
    state.sets.length > 0
      ? state.sets[state.sets.length - 1].setIndex
      : match.structure.kind === 'sets'
        ? 1
        : 0
  return { legsWonCurrent, setsWon, currentLegIndex, currentSetIndex }
}

// Punkte pro Leg (Ø)
function computePointsPerLegAvg(events: DartsEvent[], playerId: string): number {
  const byLeg = new Map<string, number>()
  for (const e of events) {
    if (e.type !== 'VisitAdded') continue
    const v = e as any
    if (v.playerId !== playerId) continue
    const legId = v.legId
    byLeg.set(legId, (byLeg.get(legId) ?? 0) + (v.visitScore ?? 0))
  }
  if (byLeg.size === 0) return 0
  const sum = Array.from(byLeg.values()).reduce((a, b) => a + b, 0)
  return sum / byLeg.size
}

/* =========================
   NEU: PlayerTurnCard (inline)
   ========================= */
type Visit = { darts: number[]; score: number; bust?: boolean }

function PlayerTurnCard({
  name,
  color,
  remaining,
  currentDarts,
  lastVisit,
  flashLabel,
  isActive,
  legs,
  sets,
  showSets,
  threeDartAvg,
}: {
  name: string
  color?: string
  remaining: number
  currentDarts: number[]
  lastVisit?: Visit | null
  flashLabel?: string | null
  isActive: boolean
  legs: number
  sets: number
  showSets: boolean
  threeDartAvg: number
}) {
  const isBustFlash = flashLabel === 'BUST'

  const s: Record<string, React.CSSProperties> = {
    card: {
      position: 'relative',
      border: '1px solid #e5e7eb',
      background: '#fff',
      borderRadius: 14,
      padding: 14,
      boxShadow: '0 1px 2px rgba(0,0,0,0.04), 0 10px 20px rgba(0,0,0,0.03)',
      borderColor: isBustFlash ? '#dc2626' : isActive ? '#0ea5e9' : '#e5e7eb',
      animation: isBustFlash ? ('bustShake 420ms ease-in-out' as any) : undefined,
    },
    header: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 },
    name: { fontWeight: 800 },
    dot: {
      width: 10,
      height: 10,
      borderRadius: 999,
      background: color || '#777',
      boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.15)',
    },
    meta: { marginLeft: 'auto', fontSize: 12, opacity: 0.7 },
    pill: {
      border: '1px solid #0ea5e9',
      color: '#0369a1',
      background: '#e0f2fe',
      borderRadius: 999,
      padding: '4px 8px',
      fontSize: 12,
      fontWeight: 700,
    },
    grid: { display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 12, alignItems: 'stretch' },
    col: { display: 'grid', gap: 6, alignContent: 'start' },
    colTitle: { fontSize: 12, opacity: 0.7, fontWeight: 600 },
    bubble: {
      border: '1px solid #e5e7eb',
      borderRadius: 10,
      padding: '6px 8px',
      minWidth: 42,
      textAlign: 'center',
      fontWeight: 800,
      background: '#fff',
    },
    remainingWrap: { display: 'grid', justifyItems: 'center', alignContent: 'center', gap: 4, padding: '0 6px' },
    remainingLabel: { fontSize: 12, opacity: 0.7 },
    remainingValue: { fontSize: 28, fontWeight: 900 },
    lastMeta: { fontSize: 12, opacity: 0.7 },
    bustTag: { fontSize: 13, fontWeight: 800, color: '#b91c1c' },
    flashWrap: { position: 'absolute', inset: 0, pointerEvents: 'none', display: 'grid', placeItems: 'center' },
    flash: {
      fontSize: 36,
      fontWeight: 900,
      background: isBustFlash ? 'rgba(254,242,242,0.96)' : 'rgba(255,255,255,0.95)',
      border: `2px solid ${isBustFlash ? '#dc2626' : '#e5e7eb'}`,
      color: isBustFlash ? '#b91c1c' : '#0f172a',
      borderRadius: 14,
      padding: '6px 16px',
      boxShadow: isBustFlash
        ? '0 0 0 3px rgba(220,38,38,0.18), 0 10px 30px rgba(0,0,0,0.15)'
        : '0 10px 30px rgba(0,0,0,0.15)',
      animation: flashLabel != null ? ('scoreFlash 1.1s ease-out forwards' as any) : undefined,
    },
  }

  const cur = [currentDarts[0] ?? null, currentDarts[1] ?? null, currentDarts[2] ?? null]
  const last = lastVisit?.darts ?? []

  return (
    <div style={s.card}>
      <style>{`
        @keyframes scoreFlash {
          0%   { opacity: 0; transform: scale(0.8); }
          10%  { opacity: 1; transform: scale(1.0); }
          60%  { opacity: 1; transform: scale(1.0); }
          100% { opacity: 0; transform: scale(1.05); }
        }
        @keyframes bustShake {
          0%   { transform: translateX(0); }
          15%  { transform: translateX(-6px); }
          30%  { transform: translateX(6px); }
          45%  { transform: translateX(-4px); }
          60%  { transform: translateX(4px); }
          75%  { transform: translateX(-2px); }
          90%  { transform: translateX(2px); }
          100% { transform: translateX(0); }
        }
      `}</style>

      <div style={s.header}>
        <span style={s.dot} />
        <div style={s.name}>{name}</div>
        <div style={s.meta}>
          Legs: <b>{legs}</b> {showSets ? <>· Sets: <b>{sets}</b></> : null}
        </div>
        {isActive && <div style={{ ...s.pill, marginLeft: 8 }}>am Zug</div>}
      </div>

      <div style={s.grid}>
        <div style={s.col}>
          <div style={s.colTitle}>Aktuelle Würfe</div>
          {cur.map((v, i) => (
            <div key={i} style={s.bubble}>
              {v ?? '—'}
            </div>
          ))}
        </div>

        <div style={s.remainingWrap}>
          <div style={s.remainingLabel}>Verbleibend</div>
          <div style={s.remainingValue}>{remaining}</div>
        </div>

        <div style={s.col}>
          <div style={s.colTitle}>Letzte Aufnahme</div>
          <div style={{ display: 'grid', gap: 6 }}>
            <div style={{ display: 'flex', gap: 6 }}>
              <div style={s.bubble}>{last[0] ?? '—'}</div>
              <div style={s.bubble}>{last[1] ?? '—'}</div>
              <div style={s.bubble}>{last[2] ?? '—'}</div>
            </div>
            {lastVisit?.bust ? (
              <div style={s.bustTag}>BUST</div>
            ) : (
              <div style={s.lastMeta}>
                Summe: <b>{lastVisit?.score ?? 0}</b>
              </div>
            )}
            <div style={{ ...s.lastMeta, marginTop: 2 }}>
              3-DA (live): <b>{threeDartAvg.toFixed(2)}</b>
            </div>
          </div>
        </div>
      </div>

      {typeof flashLabel === 'string' && (
        <div style={s.flashWrap}>
          <div style={s.flash}>{flashLabel}</div>
        </div>
      )}
    </div>
  )
}

// ------------------------------------------------------------
// Intermission (Leg/Set Summary zwischen den Runden)
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

function buildLegSummary(allEvents: DartsEvent[], match: MatchStarted, legId: string): LegSummary {
  const ls = allEvents.find((e) => e.type === 'LegStarted' && (e as any).legId === legId) as any
  const lf = allEvents.find((e) => e.type === 'LegFinished' && (e as any).legId === legId) as any

  const startedAt = ls?.ts
  const finishedAt = lf?.ts
  const starterPlayerId = ls?.starterPlayerId
  const winnerPlayerId = lf?.winnerPlayerId
  const highestCheckout = lf?.highestCheckoutThisLeg ?? undefined

  const visitsRaw = allEvents.filter((e) => e.type === 'VisitAdded' && (e as any).legId === legId) as any[]

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
  const startIdx = allEvents.findIndex((e) => e.type === 'SetStarted' && (e as any).setIndex === setIndex)
  if (startIdx < 0) return []
  const endIdx = allEvents.findIndex(
    (e, i) => i > startIdx && e.type === 'SetFinished' && (e as any).setIndex === setIndex
  )
  const slice = allEvents.slice(startIdx, endIdx >= 0 ? endIdx + 1 : allEvents.length)
  const legFinished = slice.filter((e) => e.type === 'LegFinished') as any[]
  const legIds: string[] = []
  for (const lf of legFinished) {
    if (lf.legId && !legIds.includes(lf.legId)) legIds.push(lf.legId)
  }
  return legIds
}

// ------------------------------------------------------------
type Props = { matchId: string; onExit: () => void; onNewGame?: () => void }

export default function Game({ matchId, onExit }: Props) {
  const [matchStored] = useState(() => loadMatchById(matchId))

  if (!matchStored) {
    return (
      <div className="g-page">
        <h3>Kein aktives Match gefunden.</h3>
        <button className="g-btn" onClick={onExit}>
          Zurück
        </button>
      </div>
    )
  }

  const [events, setEvents] = useState<DartsEvent[]>(() => matchStored.events as DartsEvent[])
  const state = useMemo(() => applyEvents(events), [events])
  const match = state.match as MatchStarted | undefined

  if (!match) {
    return (
      <div className="g-page">
        <h3>Match-Start-Events fehlen. Bitte neues Spiel starten.</h3>
        <button className="g-btn" onClick={onExit}>
          Zurück
        </button>
      </div>
    )
  }
  if (state.legs.length === 0) {
    return (
      <div className="g-page">
        <h3>Kein Leg gefunden – bitte neues Spiel starten.</h3>
        <button className="g-btn" onClick={onExit}>
          Zurück
        </button>
      </div>
    )
  }

  // -------- helper to finalize match safely (TS-safe non-null args) --------
  function finalizeIfFinished(
    allEvents: DartsEvent[],
    matchNonNull: MatchStarted,
    matchStoredNonNull: {
      id: string
      title: string
      createdAt: string
      events: DartsEvent[]
      playerIds: string[]
      finished?: boolean
    }
  ): boolean {
    const tmpApplied = applyEvents(allEvents)
    const mStruct = matchNonNull.structure

    let winnerId: string | undefined

    if (mStruct.kind === 'legs') {
      const needLegs = requiredToWinLocal(mStruct.bestOfLegs ?? 1)
      const wins: Record<string, number> = Object.fromEntries(matchNonNull.players.map((p) => [p.playerId, 0]))
      for (const L of tmpApplied.legs) {
        if (L.winnerPlayerId) wins[L.winnerPlayerId] = (wins[L.winnerPlayerId] ?? 0) + 1
      }
      for (const [pid, w] of Object.entries(wins)) {
        if (w >= needLegs) {
          winnerId = pid
          break
        }
      }
    } else {
      const needSets = requiredToWinLocal(mStruct.bestOfSets)
      const setsWon: Record<string, number> = Object.fromEntries(matchNonNull.players.map((p) => [p.playerId, 0]))
      for (const s of tmpApplied.sets) {
        if (s.winnerPlayerId) setsWon[s.winnerPlayerId] = (setsWon[s.winnerPlayerId] ?? 0) + 1
      }
      for (const [pid, w] of Object.entries(setsWon)) {
        if (w >= needSets) {
          winnerId = pid
          break
        }
      }
    }

    if (!winnerId) return false

    let finalEvents = allEvents
    const alreadyFinished = finalEvents.some((e) => e.type === 'MatchFinished')
    if (!alreadyFinished) {
      finalEvents = [
        ...finalEvents,
        {
          eventId: id(),
          type: 'MatchFinished',
          ts: now(),
          matchId: matchNonNull.matchId,
          winnerPlayerId: winnerId,
        } as any,
      ]
    }

    persistEvents(matchStoredNonNull.id, finalEvents)
    setEvents(finalEvents)
    setCurrent([])

    finishMatch(matchStoredNonNull.id)

    finishMatchUpload(
      { ...matchStoredNonNull, events: finalEvents },
      matchNonNull.players.map((p) => ({ id: p.playerId, name: p.name ?? p.playerId }))
    )

    updateLeaderboardsWithMatch({
      id: matchStoredNonNull.id,
      events: finalEvents,
      finishedAt: now(),
    })

    updateGlobalX01PlayerStatsFromMatch(matchStoredNonNull.id, finalEvents)

    const wName = matchNonNull.players.find((p) => p.playerId === winnerId)?.name ?? '—'
    setEnded({ winnerName: wName })

    return true
  }

  const isSets = match.structure.kind === 'sets'
  const leg = state.legs[state.legs.length - 1]!

  const [current, setCurrent] = useState<Dart[]>([])
  const activePlayerId = getCurrentPlayerId(match, leg, events)

  useEffect(() => {
    setCurrent([])
  }, [leg.legId])

  // Flash + LastVisit States
  const [flashByPlayer, setFlashByPlayer] = useState<Record<string, string | null>>({})
  const flashTimerRef = useRef<Record<string, number>>({})
  const [lastVisitByPlayer, setLastVisitByPlayer] = useState<Record<string, Visit | null>>({})

  // --- Intermission (Leg/Set Summary zwischen den Runden) ---
  const [intermission, setIntermission] = useState<Intermission | null>(null)
  const [showDetails, setShowDetails] = useState(false)
  const isPaused = !!intermission

  // ---------- ENDSCREEN ----------
  const finishedEvt = state.events.find((e) => e.type === 'MatchFinished') as
    | { type: 'MatchFinished'; winnerPlayerId: string; ts: string }
    | undefined
  const [ended, setEnded] = useState<{ winnerName: string } | null>(null)

  if (finishedEvt || ended) {
    const winnerId = finishedEvt?.winnerPlayerId
    const winnerName =
      ended?.winnerName ??
      (winnerId ? match.players.find((p) => p.playerId === winnerId)?.name ?? '—' : '—')

    const { legsWonCurrent, setsWon } = computeLegsAndSetsScore(match, state)
    const statsByPlayer = computeStats(events)
    const players = match.players
    const headerCells = players.map((p) => p.name ?? p.playerId)

    type Row = { label: string; values: React.ReactNode[] }
    const rows: Row[] = []

    rows.push({
      label: 'Sieger',
      values: players.map((p) => {
        const is = p.playerId === winnerId
        return (
          <span key={p.playerId} className={is ? 'g-winner' : ''}>
            {is ? '🏆 Sieger' : '—'}
          </span>
        )
      }),
    })

    if (isSets) {
      rows.push({
        label: 'Sets gewonnen',
        values: players.map((p) => <span key={p.playerId}>{setsWon[p.playerId] ?? 0}</span>),
      })
    }

    rows.push({
      label: 'Legs gewonnen (aktuelles/letztes Set)',
      values: players.map((p) => <span key={p.playerId}>{legsWonCurrent[p.playerId] ?? 0}</span>),
    })

    rows.push({
      label: 'Checkout-Quote (Darts)',
      values: players.map((p) => {
        const s: any = statsByPlayer[p.playerId] ?? {}
        const made = s.doublesHitDart ?? 0
        const att = s.doubleAttemptsDart ?? 0
        const pct = att > 0 ? (made / att) * 100 : 0
        return (
          <span key={p.playerId}>
            {pct.toFixed(1)}% <span className="g-dim">({made}/{att})</span>
          </span>
        )
      }),
    })

    rows.push({
      label: '3-Dart Average (Ø)',
      values: players.map((p) => (
        <span key={p.playerId}>{(statsByPlayer[p.playerId]?.threeDartAvg ?? 0).toFixed(2)}</span>
      )),
    })

    rows.push({
      label: 'First-9 Average (Ø)',
      values: players.map((p) => (
        <span key={p.playerId}>{(statsByPlayer[p.playerId]?.first9OverallAvg ?? 0).toFixed(2)}</span>
      )),
    })

    rows.push({
      label: 'Punkte pro Leg (Ø)',
      values: players.map((p) => <span key={p.playerId}>{computePointsPerLegAvg(events, p.playerId).toFixed(1)}</span>),
    })

    return (
      <div className="g-page">
        <div className="g-header">
          <h2 className="g-title">{matchStored.title} – beendet</h2>
          <button className="g-btn" onClick={onExit}>
            Zurück ins Menü
          </button>
        </div>

        <div className="g-tableWrap">
          <table className="g-table">
            <thead>
              <tr>
                <th className="g-th"></th>
                {headerCells.map((h, i) => (
                  <th key={i} className="g-th">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => (
                <tr key={ri}>
                  <td className="g-tdh" style={{ fontWeight: 700 }}>
                    {r.label}
                  </td>
                  {r.values.map((v, ci) => (
                    <td key={ci} className="g-td">
                      {v}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ textAlign: 'right' }}>
          <button className="g-btn" onClick={onExit}>
            Zurück ins Menü
          </button>
        </div>
      </div>
    )
  }
  // ---------- ENDSCREEN Ende ----------

  const handleThrow = (bed: Bed | 'MISS', mult: 1 | 2 | 3) => {
    if (isPaused) return
    setCurrent((list) => {
      if (list.length >= 3) return list
      const next: Dart = {
        seq: (list.length + 1) as 1 | 2 | 3,
        bed: bed as any,
        mult,
        aim: { bed: bed as any, mult },
      }
      const draft = [...list, next]

      const { remaining, bust } = simulateLiveRemaining(leg.remainingByPlayer[activePlayerId], draft)
      if (bust || remaining === 0) {
        confirmVisit(draft)
        return []
      }
      return draft
    })
  }

  const confirmVisit = (forcedDarts?: Dart[]) => {
    try {
      if (isPaused) return
      if (!leg) return
      const dartsToSave = forcedDarts && forcedDarts.length ? forcedDarts : current
      if (dartsToSave.length === 0) return

      const { events: visitEvents } = recordVisit({ match, leg, playerId: activePlayerId, darts: dartsToSave })
      let newEvents: DartsEvent[] = [...events, ...visitEvents]

      let tmp1 = applyEvents(newEvents)

      const lastLegTmp = tmp1.legs[tmp1.legs.length - 1]
      const firstVisitEvt = visitEvents.find((e) => e.type === 'VisitAdded') as any
      const engineSetLegFinished = !!lastLegTmp?.winnerPlayerId && lastLegTmp.legId === leg.legId
      const activeIsZero = lastLegTmp?.remainingByPlayer?.[activePlayerId] === 0

      if (!engineSetLegFinished && activeIsZero && firstVisitEvt && !firstVisitEvt.bust && firstVisitEvt.remainingAfter === 0) {
        const finishingDartSeq =
          firstVisitEvt.finishingDartSeq ??
          (() => {
            let tmp = firstVisitEvt.remainingBefore
            for (let i = 0; i < firstVisitEvt.darts.length; i++) {
              tmp -= firstVisitEvt.darts[i].score ?? 0
              if (tmp === 0) return (i + 1) as 1 | 2 | 3
              if (tmp < 0 || tmp === 1) break
            }
            return undefined
          })()

        newEvents.push({
          eventId: id(),
          type: 'LegFinished',
          ts: now(),
          matchId: match.matchId,
          legId: leg.legId,
          winnerPlayerId: activePlayerId,
          finishingVisitId: firstVisitEvt.eventId,
          finishingDartSeq: (finishingDartSeq ?? 1) as 1 | 2 | 3,
          highestCheckoutThisLeg: firstVisitEvt.visitScore ?? 0,
        } as any)

        tmp1 = applyEvents(newEvents)
      }

      const lastLeg = tmp1.legs[tmp1.legs.length - 1]
      const justFinishedLeg = !!lastLeg?.winnerPlayerId && lastLeg.legId === leg.legId

      // ======== LEGS MODE ========
      if (match.structure.kind === 'legs') {
        const need = requiredToWinLocal(match.structure.bestOfLegs ?? 1)

        const wins: Record<string, number> = Object.fromEntries(match.players.map((p) => [p.playerId, 0]))
        for (const L of tmp1.legs) if (L.winnerPlayerId) wins[L.winnerPlayerId]++

        const winnerId = Object.entries(wins).find(([_, w]) => w >= need)?.[0]
        if (winnerId) {
          const mergedEvts = [...newEvents]
          if (!mergedEvts.some((e) => e.type === 'MatchFinished')) {
            mergedEvts.push({
              eventId: id(),
              type: 'MatchFinished',
              ts: now(),
              matchId: match.matchId,
              winnerPlayerId: winnerId,
            } as any)
          }

          finalizeIfFinished(
            mergedEvts,
            match,
            {
              id: matchStored.id,
              title: matchStored.title,
              createdAt: matchStored.createdAt,
              events: matchStored.events as DartsEvent[],
              playerIds: matchStored.playerIds,
              finished: matchStored.finished,
            }
          )
          return
        }

        // Leg fertig -> Leg Summary, nächstes Leg erst nach "Weiter"
        if (justFinishedLeg) {
          const totalLegsStarted = applyEvents(newEvents).legs.length
          const starter = nextLegStarter(match, totalLegsStarted)

          const nextLegEvt: DartsEvent = {
            eventId: id(),
            type: 'LegStarted',
            ts: now(),
            matchId: match.matchId,
            legId: id(),
            legIndex: totalLegsStarted + 1,
            starterPlayerId: starter,
          } as any

          persistEvents(matchStored.id, newEvents)
          setEvents(newEvents)
          setCurrent([])

          setShowDetails(false)
          setIntermission({
            kind: 'leg',
            legId: leg.legId,
            legIndex: (tmp1.legs[tmp1.legs.length - 1] as any)?.legIndex ?? totalLegsStarted,
            pendingNextEvents: [nextLegEvt],
          })
          return
        }
      } else {
        // ======== SETS MODE ========
        const lastLegSetAware = tmp1.legs[tmp1.legs.length - 1]
        const justFinishedLegSet = !!lastLegSetAware?.winnerPlayerId && lastLegSetAware.legId === leg.legId

        if (justFinishedLegSet) {
          const { legsPerSet, bestOfSets } = match.structure
          const needLegs = requiredToWinLocal(legsPerSet)
          const needSets = requiredToWinLocal(bestOfSets)

          const tmpApplied2 = applyEvents(newEvents) as any
          const tmpSets: any[] = tmpApplied2.sets || []
          const curSet = tmpSets[tmpSets.length - 1]
          const curSetIndex = curSet?.setIndex ?? tmpSets.length ?? 1

          let setWinnerId: string | undefined
          if (curSet?.legsWonByPlayer) {
            for (const pid of Object.keys(curSet.legsWonByPlayer)) {
              if (curSet.legsWonByPlayer[pid] >= needLegs) {
                setWinnerId = pid
                break
              }
            }
          }

          // Set fertig -> SetFinished, dann Set Summary (inkl. Leg Summaries)
          if (setWinnerId) {
            newEvents.push({
              eventId: id(),
              type: 'SetFinished',
              ts: now(),
              matchId: match.matchId,
              setIndex: curSetIndex,
              winnerPlayerId: setWinnerId,
            } as any)

            const afterSetsApplied: any = applyEvents(newEvents)
            const afterSets: any[] = afterSetsApplied.sets || []
            const setsWonCount: Record<string, number> = Object.fromEntries(match.players.map((p) => [p.playerId, 0]))
            for (const s of afterSets) if (s.winnerPlayerId) setsWonCount[s.winnerPlayerId]++

            const matchWinner = Object.entries(setsWonCount).find(([_, w]) => w >= needSets)?.[0]
            if (matchWinner) {
              const mergedEvts = [...newEvents]
              if (!mergedEvts.some((e) => e.type === 'MatchFinished')) {
                mergedEvts.push({
                  eventId: id(),
                  type: 'MatchFinished',
                  ts: now(),
                  matchId: match.matchId,
                  winnerPlayerId: matchWinner,
                } as any)
              }

              finalizeIfFinished(
                mergedEvts,
                match,
                {
                  id: matchStored.id,
                  title: matchStored.title,
                  createdAt: matchStored.createdAt,
                  events: matchStored.events as DartsEvent[],
                  playerIds: matchStored.playerIds,
                  finished: matchStored.finished,
                }
              )
              return
            }

            // Nächstes Set + nächstes Leg vorbereiten (Start erst nach "Weiter")
            const nextSetIdx = curSetIndex + 1

            const totalLegsStarted = applyEvents(newEvents).legs.length
            const starter = nextLegStarter(match, totalLegsStarted)

            const nextSetEvt: DartsEvent = {
              eventId: id(),
              type: 'SetStarted',
              ts: now(),
              matchId: match.matchId,
              setIndex: nextSetIdx,
            } as any

            const nextLegEvt: DartsEvent = {
              eventId: id(),
              type: 'LegStarted',
              ts: now(),
              matchId: match.matchId,
              legId: id(),
              legIndex: totalLegsStarted + 1,
              starterPlayerId: starter,
            } as any

            persistEvents(matchStored.id, newEvents)
            setEvents(newEvents)
            setCurrent([])

            setShowDetails(false)
            setIntermission({
              kind: 'set',
              setIndex: curSetIndex,
              winnerPlayerId: setWinnerId,
              pendingNextEvents: [nextSetEvt, nextLegEvt],
            })
            return
          }

          // Set nicht fertig -> nur Leg Summary (nächstes Leg erst nach "Weiter")
          const totalLegsStarted = applyEvents(newEvents).legs.length
          const starter = nextLegStarter(match, totalLegsStarted)

          const nextLegEvt: DartsEvent = {
            eventId: id(),
            type: 'LegStarted',
            ts: now(),
            matchId: match.matchId,
            legId: id(),
            legIndex: totalLegsStarted + 1,
            starterPlayerId: starter,
          } as any

          persistEvents(matchStored.id, newEvents)
          setEvents(newEvents)
          setCurrent([])

          setShowDetails(false)
          setIntermission({
            kind: 'leg',
            legId: leg.legId,
            legIndex: (tmp1.legs[tmp1.legs.length - 1] as any)?.legIndex ?? totalLegsStarted,
            setIndex: curSetIndex,
            pendingNextEvents: [nextLegEvt],
          })
          return
        }
      }

      // ----- Flash + Letzte Aufnahme (mit BUST-Handling) -----
      const latestVisitEvt = newEvents.slice().reverse().find((e) => e.type === 'VisitAdded') as any
      const visitScore: number = latestVisitEvt?.visitScore ?? 0
      const isBust: boolean = !!latestVisitEvt?.bust
      const dartsNums: number[] = (latestVisitEvt?.darts ?? []).map((d: any) => d?.score ?? 0)

      const label = isBust ? 'BUST' : String(visitScore)
      setFlashByPlayer((prev) => ({ ...prev, [activePlayerId]: label }))
      if (flashTimerRef.current[activePlayerId]) window.clearTimeout(flashTimerRef.current[activePlayerId])
      flashTimerRef.current[activePlayerId] = window.setTimeout(() => {
        setFlashByPlayer((prev) => ({ ...prev, [activePlayerId]: null }))
      }, 1100)

      setLastVisitByPlayer((prev) => ({ ...prev, [activePlayerId]: { darts: dartsNums, score: visitScore, bust: isBust } }))

      persistEvents(matchStored.id, newEvents)
      setEvents(newEvents)
      setCurrent([])
    } catch (err) {
      console.error('Visit bestätigen fehlgeschlagen:', err)
      alert('Unerwarteter Fehler beim Speichern des Wurfs. Details in der Konsole.')
    }
  }

  const { legsWonCurrent, setsWon, currentLegIndex, currentSetIndex } = computeLegsAndSetsScore(match, state)
  const requiredLegs =
    match.structure.kind === 'legs'
      ? requiredToWinLocal(match.structure.bestOfLegs ?? 1)
      : requiredToWinLocal(match.structure.legsPerSet)
  const requiredSets = match.structure.kind === 'sets' ? requiredToWinLocal(match.structure.bestOfSets) : undefined

  const statsByPlayer = computeStats(events)
  const remainingOfActive = leg.remainingByPlayer[activePlayerId]
  const live = simulateLiveRemaining(remainingOfActive, current)

  return (
    <div className="g-page">
      {/* Intermission Overlay (Leg/Set Summary) */}
      {intermission && (
        <div className="g-overlay" role="dialog" aria-modal="true">
          <div className="g-modal">
            <div className="g-modalHeader">
              <div>
                <div className="g-modalTitle">
                  {intermission.kind === 'leg'
                    ? `Leg Summary${intermission.legIndex ? ` · Leg #${intermission.legIndex}` : ''}`
                    : `Set Summary · Set #${intermission.setIndex}`}
                </div>
                <div className="g-modalSub">Klick auf „Details“ zeigt den ausführlichen Verlauf.</div>
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <button className="g-btn" onClick={() => setShowDetails((v) => !v)}>
                  {showDetails ? 'Details verbergen' : 'Details anzeigen'}
                </button>
                <button
                  className="g-btn"
                  onClick={() => {
                    const next = [...events, ...(intermission.pendingNextEvents ?? [])]
                    persistEvents(matchStored.id, next)
                    setEvents(next)
                    setCurrent([])
                    setIntermission(null)
                    setShowDetails(false)
                  }}
                >
                  Weiter →
                </button>
              </div>
            </div>

            {intermission.kind === 'leg' ? (
              (() => {
                const sum = buildLegSummary(events, match, intermission.legId)
                const winnerName = sum.winnerPlayerId
                  ? match.players.find((p) => p.playerId === sum.winnerPlayerId)?.name ?? sum.winnerPlayerId
                  : '—'
                const starterName = sum.starterPlayerId
                  ? match.players.find((p) => p.playerId === sum.starterPlayerId)?.name ?? sum.starterPlayerId
                  : '—'

                return (
                  <>
                    <div className="g-summaryGrid">
                      <div className="g-summaryTile">
                        <div className="g-k">Sieger</div>
                        <div className="g-v">{winnerName}</div>
                      </div>
                      <div className="g-summaryTile">
                        <div className="g-k">Starter</div>
                        <div className="g-v">{starterName}</div>
                      </div>
                      <div className="g-summaryTile">
                        <div className="g-k">Zeit</div>
                        <div className="g-v">
                          {fmtClock(sum.startedAt)} → {fmtClock(sum.finishedAt)}
                        </div>
                      </div>
                      <div className="g-summaryTile">
                        <div className="g-k">Checkout</div>
                        <div className="g-v">{sum.highestCheckout ?? 0}</div>
                      </div>
                      <div className="g-summaryTile">
                        <div className="g-k">Darts</div>
                        <div className="g-v">{sum.dartsThrownTotal}</div>
                      </div>
                      <div className="g-summaryTile">
                        <div className="g-k">Best Visit</div>
                        <div className="g-v">{sum.bestVisit}</div>
                      </div>
                    </div>

                    <div className="g-miniTableWrap">
                      <table className="g-miniTable">
                        <thead>
                          <tr>
                            <th>Spieler</th>
                            <th style={{ textAlign: 'right' }}>Punkte</th>
                            <th style={{ textAlign: 'right' }}>Darts</th>
                            <th style={{ textAlign: 'right' }}>3-DA</th>
                            <th style={{ textAlign: 'right' }}>Best</th>
                            <th style={{ textAlign: 'right' }}>Busts</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sum.byPlayer.map((p) => (
                            <tr key={p.playerId}>
                              <td style={{ fontWeight: 800 }}>{p.name}</td>
                              <td style={{ textAlign: 'right' }}>{p.points}</td>
                              <td style={{ textAlign: 'right' }}>{p.darts}</td>
                              <td style={{ textAlign: 'right' }}>{p.threeDA.toFixed(2)}</td>
                              <td style={{ textAlign: 'right' }}>{p.bestVisit}</td>
                              <td style={{ textAlign: 'right' }}>{p.busts}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {showDetails && (
                      <div className="g-details">
                        <div className="g-detailsTitle">Leg-Verlauf</div>
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
      )}

      {/* Kopfzeile */}
      <div className="g-header">
        <h2 className="g-title">{matchStored.title}</h2>
        <button className="g-btn" onClick={onExit}>
          Menü
        </button>
      </div>

      {/* Struktur-/Fortschritt-Chips */}
      <div className="g-chipRow">
        {match.structure.kind === 'legs' ? (
          <>
            <span className="g-chip">
              Modus:
              <b style={{ marginLeft: 6 }}>Best of {match.structure.bestOfLegs ?? 1} Legs</b>
            </span>
            <span className="g-chip">
              Leg <b style={{ marginLeft: 6 }}>#{currentLegIndex}</b>
            </span>
            <span className="g-chip">
              zum Gewinn:
              <b style={{ marginLeft: 6 }}>{requiredLegs} Legs</b>
            </span>
            <span className="g-chip">
              Modus:
              <b style={{ marginLeft: 6 }}>{match.startingScorePerLeg} Double-Out</b>
            </span>
          </>
        ) : (
          <>
            <span className="g-chip">
              Modus:
              <b style={{ marginLeft: 6 }}>{match.startingScorePerLeg} Double-Out</b>
            </span>
            <span className="g-chip">
              Modus:
              <b style={{ marginLeft: 6 }}>Sets</b>
            </span>
            <span className="g-chip">
              Set <b style={{ marginLeft: 6 }}>#{currentSetIndex || 1}</b>
            </span>
            <span className="g-chip">
              pro Set:
              <b style={{ marginLeft: 6 }}>Best of {match.structure.legsPerSet} Legs</b>
            </span>
            <span className="g-chip">
              Matchgewinn:
              <b style={{ marginLeft: 6 }}>{requiredSets} Sets</b>
            </span>
          </>
        )}
      </div>

      {/* Spieler-Karten */}
      <div className="g-grid">
        {match.players.map((p) => {
          const isActive = p.playerId === activePlayerId
          const avg = statsByPlayer[p.playerId]?.threeDartAvg ?? 0
          const playerLegs = legsWonCurrent[p.playerId] ?? 0
          const playerSets = setsWon[p.playerId] ?? 0

          const remaining = leg.remainingByPlayer[p.playerId]
          const currentDarts = isActive ? current.map(dartScore) : []

          const derivedLast = getLastVisitForPlayer(leg, p.playerId)
          const derivedVisit: Visit | null = derivedLast
            ? {
                darts: derivedLast.darts.map((d: any) => d?.score ?? 0),
                score: (derivedLast as any).visitScore ?? 0,
                bust: !!(derivedLast as any).bust,
              }
            : null
          const lastVisit = lastVisitByPlayer[p.playerId] ?? derivedVisit

          const flashLabel = flashByPlayer[p.playerId] ?? null

          return (
            <PlayerTurnCard
              key={p.playerId}
              name={p.name ?? p.playerId}
              color={(p as any).color}
              remaining={isActive ? live.remaining : remaining}
              currentDarts={currentDarts}
              lastVisit={lastVisit}
              flashLabel={flashLabel}
              isActive={isActive}
              legs={playerLegs}
              sets={playerSets}
              showSets={isSets}
              threeDartAvg={avg}
            />
          )
        })}
      </div>

      {/* Eingabeblock */}
      <Scoreboard onThrow={handleThrow} />

      {/* Manuelle Steuerung */}
      <div className="g-toolbar">
        <button className="g-btn" onClick={() => setCurrent((l) => l.slice(0, -1))} disabled={current.length === 0 || isPaused}>
          ← Back
        </button>
        <button className="g-btn" onClick={() => setCurrent([])} disabled={current.length === 0 || isPaused}>
          ✖ Clear
        </button>
        <button className="g-btn" onClick={() => confirmVisit(current)} disabled={current.length === 0 || isPaused}>
          ✔ Visit bestätigen
        </button>
      </div>
    </div>
  )
}
