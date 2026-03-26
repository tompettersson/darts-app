// src/screens/Game.tsx
// Spielscreen – modernisierte UI (weiche Cards, Chips, große Live-Zahl, Dart-Pills rechts)
// Styling komplett via game.css

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { showToast } from '../components/Toast'
import { useTheme } from '../ThemeProvider'
import {
  loadMatchById,
  persistEvents,
  finishMatch,
  finishMatchUpload,
  updateLeaderboardsWithMatch,
  updateGlobalX01PlayerStatsFromMatch, // 🔥 NEU: langfristige Spieler-Stats aktualisieren
  setMatchMetadata,
  isMatchPaused,
  setMatchPaused,
  clearMatchPaused,
  getMatchElapsedTime,
  setMatchElapsedTime,
  deleteX01Match,
  getProfiles,
  getPlayerColorBackgroundEnabled,
  ensureX01MatchExists,
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
  type LegStarted,
  type LegFinished,
  type VisitAdded,
  type SetStarted,
  type SetFinished,
  now,
  id,
  // Type Guards
  isMatchStarted,
  isLegStarted,
  isLegFinished,
  isVisitAdded,
  isSetStarted,
  isSetFinished,
} from '../darts501'
import { getCheckoutRoute, isCheckout, getSetupShot } from '../checkoutTable'
import X01IntermissionScreen from '../components/X01IntermissionScreen'
import Scoreboard from '../components/Scoreboard'
import X01ArcadeView, { PlayerStatsList, VisitList, type VisitEntry } from '../components/X01ArcadeView'
import ScoreProgressionChart, { PLAYER_COLORS } from '../components/ScoreProgressionChart'
import LegStaircaseChart, { type LegVisit } from '../components/LegStaircaseChart'
import GameControls, { PauseOverlay } from '../components/GameControls'
import {
  initSpeech,
  setSpeechEnabled,
  isSpeechEnabled,
  announceGameStart,
  announceNextPlayer,
  announceScore,
  announceCheckoutDouble,
  announceLegDart,
  announceSetDart,
  announceMatchDart,
  playTriple20Sound,
  announceDouble,
  announcePlayerFinishArea,
  cancelDebouncedAnnounce,
  debouncedAnnounce,
} from '../speech'
import { play180Sound, playHighCheckoutSound, playMatchWinSound, playBustSound } from '../sounds'
import ConnectionBadge from '../multiplayer/ConnectionBadge'
import X01EndScreen from '../components/X01EndScreen'
import MiniSparkline from '../components/MiniSparkline'
import CelebrationEffect from '../components/CelebrationEffect'
import './game.css'
import { useDisableScale } from '../components/ScaleWrapper'

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
  const ls = events.find((e): e is LegStarted => isLegStarted(e) && e.legId === legId)
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
  if (d.bed === 'MISS') return 0
  if (d.bed === 'DBULL') return 50
  if (d.bed === 'BULL') return 25
  return d.bed * d.mult
}

// Live-Preview: Rest nach bisherigen Darts (inkl. Bust-Logik)
function simulateLiveRemaining(startRemaining: number, darts: Dart[]) {
  let tmp = startRemaining
  let bust = false
  for (let i = 0; i < darts.length && i < 3; i++) {
    const d = darts[i]
    const score =
      d.bed === 'MISS'
        ? 0
        : d.bed === 'DBULL'
          ? 50
          : d.bed === 'BULL'
            ? 25
            : d.bed * d.mult
    const after = tmp - score
    if (after === 0) {
      const isDouble = d.bed === 'DBULL' || (typeof d.bed === 'number' && d.mult === 2)
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
    if (!isVisitAdded(e)) continue
    if (e.playerId !== playerId) continue
    byLeg.set(e.legId, (byLeg.get(e.legId) ?? 0) + (e.visitScore ?? 0))
  }
  if (byLeg.size === 0) return 0
  const sum = Array.from(byLeg.values()).reduce((a, b) => a + b, 0)
  return sum / byLeg.size
}

/* =========================
   NEU: PlayerTurnCard (inline)
   ========================= */
type Visit = { darts: number[]; dartLabels?: string[]; score: number; bust?: boolean }

function PlayerTurnCard({
  name,
  color,
  remaining,
  currentDarts,
  dartsRemaining,
  lastVisit,
  flashLabel,
  isActive,
  isMyPlayer,
  legs,
  sets,
  showSets,
  threeDartAvg,
  recentScores,
}: {
  name: string
  color?: string
  remaining: number
  currentDarts: number[]
  dartsRemaining: number
  lastVisit?: Visit | null
  flashLabel?: string | null
  isActive: boolean
  isMyPlayer: boolean
  legs: number
  sets: number
  showSets: boolean
  threeDartAvg: number
  recentScores?: number[]
}) {
  const isBustFlash = flashLabel === 'BUST'

  // Spielerfarbe für aktiven Zustand (mit Fallback)
  const activeColor = color || '#0ea5e9'

  const s: Record<string, React.CSSProperties> = {
    card: {
      position: 'relative',
      border: isBustFlash ? '2px solid #dc2626' : isActive ? `2px solid ${activeColor}` : '2px solid #e5e7eb',
      background: isActive ? `linear-gradient(135deg, ${activeColor}15 0%, transparent 60%)` : '#fff',
      borderRadius: 14,
      padding: 14,
      boxShadow: isBustFlash
        ? '0 0 20px rgba(220, 38, 38, 0.4)'
        : isActive
          ? `0 0 20px ${activeColor}50, 0 0 40px ${activeColor}30`
          : '0 1px 2px rgba(0,0,0,0.04), 0 10px 20px rgba(0,0,0,0.03)',
      animation: isBustFlash ? 'bustShake 420ms ease-in-out' : undefined,
      transition: 'box-shadow 0.3s ease, border-color 0.3s ease',
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
      border: `1px solid ${activeColor}`,
      color: activeColor,
      background: `${activeColor}15`,
      borderRadius: 999,
      padding: '4px 8px',
      fontSize: 12,
      fontWeight: 700,
    },
    grid: { display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 12, alignItems: 'stretch' } as React.CSSProperties,
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
      fontSize: 22,
      fontWeight: 900,
      background: isBustFlash ? 'rgba(254,242,242,0.96)' : 'rgba(255,255,255,0.95)',
      border: `2px solid ${isBustFlash ? '#dc2626' : '#e5e7eb'}`,
      color: isBustFlash ? '#b91c1c' : '#0f172a',
      borderRadius: 14,
      padding: '6px 16px',
      boxShadow: isBustFlash
        ? '0 0 0 3px rgba(220,38,38,0.18), 0 10px 30px rgba(0,0,0,0.15)'
        : '0 10px 30px rgba(0,0,0,0.15)',
      animation: flashLabel != null ? 'scoreFlash 1.1s ease-out forwards' : undefined,
    },
  }

  const cur = [currentDarts[0] ?? null, currentDarts[1] ?? null, currentDarts[2] ?? null]
  const last = lastVisit?.darts ?? []

  return (
    <div style={s.card} className={isActive ? 'player-switch' : undefined}>
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

      <div style={s.grid} className="g-player-grid">
        <div style={s.col} className="g-player-darts-col">
          <div style={s.colTitle}>Aktuelle Würfe</div>
          {cur.map((v, i) => (
            <div key={i} style={s.bubble} className={v != null ? 'dart-slot-fill' : undefined}>
              {v ?? '—'}
            </div>
          ))}
          {/* Score + Average + Sparkline unter den Würfen */}
          <div style={{ display: 'flex', gap: 12, marginTop: 4, fontSize: 12, alignItems: 'center' }}>
            <span style={{ color: '#6b7280' }}>
              Score: <b style={{ color: '#0f172a' }}>{cur.filter(v => v !== null).reduce((a, b) => a + (b ?? 0), 0)}</b>
            </span>
            <span style={{ color: '#6b7280' }}>
              Avg: <b style={{ color: '#0f172a' }}>{threeDartAvg.toFixed(1)}</b>
            </span>
            {recentScores && recentScores.length >= 2 && (
              <MiniSparkline values={recentScores} color={activeColor} width={60} height={20} />
            )}
          </div>
        </div>

        <div style={s.remainingWrap}>
          <div style={s.remainingLabel}>Verbleibend</div>
          <div style={s.remainingValue}>{remaining}</div>
          {isMyPlayer ? (
            // Eigener Spieler: Checkout-Route anzeigen
            (() => {
              const route = getCheckoutRoute(remaining, dartsRemaining)
              if (route) {
                return (
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#16a34a', marginTop: 4 }}>
                    {route}
                  </div>
                )
              }
              const setup = getSetupShot(remaining, dartsRemaining)
              if (setup) {
                return (
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#eab308', marginTop: 4 }}>
                    {setup}
                  </div>
                )
              }
              if (remaining >= 2 && remaining <= 170 && dartsRemaining < 3) {
                return (
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#9ca3af', marginTop: 4 }}>
                    Kein Finish
                  </div>
                )
              }
              return null
            })()
          ) : (
            // Gegner: Letzte Aufnahme Score anzeigen
            lastVisit && !lastVisit.bust ? (
              <div style={{ fontSize: 14, fontWeight: 700, color: '#6b7280', marginTop: 4 }}>
                Letzte: {lastVisit.score}
              </div>
            ) : lastVisit?.bust ? (
              <div style={{ fontSize: 13, fontWeight: 700, color: '#b91c1c', marginTop: 4 }}>
                BUST
              </div>
            ) : null
          )}
        </div>

        <div style={s.col} className="g-player-darts-col">
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

function fmtDart(d: { bed: any; mult: 1 | 2 | 3 }) {
  const prefix = d.mult === 3 ? 'T' : d.mult === 2 ? 'D' : ''
  if (typeof d.bed === 'number') return `${prefix}${d.bed}`
  if (d.bed === 'BULL') return d.mult === 2 ? 'Bull' : '25'
  if (d.bed === 'DBULL') return 'Bull'
  return 'Miss'
}

// Leg-Statistik berechnen für Intermission (wie in MatchDetails)
function computeLegStats(allEvents: DartsEvent[], match: MatchStarted, legId: string) {
  const legEvents = allEvents.filter((e) => {
    if (isMatchStarted(e)) return true
    if ('legId' in e) return e.legId === legId
    return false
  })
  return computeStats(legEvents)
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

// ------------------------------------------------------------
type MultiplayerProps = {
  enabled: true
  roomCode: string
  myPlayerId: string
  submitEvents: (events: DartsEvent[]) => void
  undo: (removeCount: number) => void
  sendLivePreview?: (playerId: string, darts: any[], remaining: number) => void
  livePreview?: { playerId: string; darts: any[]; remaining: number } | null
  remoteEvents: DartsEvent[] | null
  connectionStatus: import('../multiplayer/useMultiplayerRoom').ConnectionStatus
  playerCount: number
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

type Props = {
  matchId: string
  onExit: () => void
  onNewGame?: () => void
  multiplayer?: MultiplayerProps
}

export default function Game({ matchId, onExit, onNewGame, multiplayer }: Props) {
  useDisableScale() // Game screens handle their own responsive layout

  // Globales Theme System
  const { isArcade, colors } = useTheme()

  // Profile für Spielerfarben laden
  const profiles = useMemo(() => getProfiles(), [])

  const [matchStoredReal] = useState(() => loadMatchById(matchId))

  // Multiplayer-Guest hat kein lokales Match — Stub erstellen damit alle matchStored-Referenzen funktionieren
  const matchStored = useMemo(() => {
    if (matchStoredReal) return matchStoredReal
    if (!multiplayer?.enabled) return null
    // Stub für Multiplayer-Guest: Events kommen vom Server
    const remoteEvents = multiplayer.remoteEvents ?? []
    const matchEvt = remoteEvents.find((e: any) => e.type === 'MatchStarted') as MatchStarted | undefined
    return {
      id: matchId,
      title: matchEvt ? `${matchEvt.mode} – Multiplayer` : 'Multiplayer Match',
      createdAt: matchEvt?.ts ?? new Date().toISOString(),
      events: remoteEvents,
      playerIds: matchEvt?.players.map(p => p.playerId) ?? [],
      finished: false,
    }
  }, [matchStoredReal, multiplayer?.enabled, multiplayer?.remoteEvents, matchId])

  // WICHTIG: Alle Hooks MÜSSEN vor jedem early return aufgerufen werden!
  // Multiplayer-Guest hat kein lokales Match — Events kommen vom Server
  const [events, setEvents] = useState<DartsEvent[]>(() => {
    if (matchStoredReal) return matchStoredReal.events as DartsEvent[]
    if (multiplayer?.enabled && multiplayer.remoteEvents) return multiplayer.remoteEvents
    return []
  })
  const state = useMemo(() => applyEvents(events), [events])
  const match = state.match as MatchStarted | undefined

  // Spielerfarben aus Profilen (mit Fallback auf PLAYER_COLORS)
  const playerColors = useMemo(() => {
    const colors: Record<string, string> = {}
    if (match) {
      match.players.forEach((p, idx) => {
        const profile = profiles.find(pr => pr.id === p.playerId)
        colors[p.playerId] = profile?.color ?? PLAYER_COLORS[idx % PLAYER_COLORS.length]
      })
    }
    return colors
  }, [match, profiles])

  // Spielerfarben-Hintergrund Einstellung
  const playerColorBgEnabled = getPlayerColorBackgroundEnabled()

  // Early return Fehler-Screens - NACH allen Hooks definieren wir eine Hilfsvariable
  const isMultiplayer = !!multiplayer?.enabled
  const errorScreen = useMemo(() => {
    // Im Multiplayer-Modus: kein matchStored nötig (Events kommen vom Server)
    if (!matchStored && !isMultiplayer) {
      return (
        <div className="g-page">
          <h3>Kein aktives Match gefunden.</h3>
          <button className="g-btn" onClick={onExit}>
            Zurück
          </button>
        </div>
      )
    }
    if (!match) {
      // Im Multiplayer warten wir auf Server-Sync
      if (isMultiplayer) {
        return (
          <div className="g-page" style={{ display: 'grid', placeItems: 'center', minHeight: '100dvh' }}>
            <div style={{ textAlign: 'center' }}>
              <h3>Warte auf Spielstand vom Server...</h3>
              <div style={{
                marginTop: 16, width: 32, height: 32,
                border: '3px solid #e5e7eb', borderTopColor: '#0ea5e9',
                borderRadius: '50%', animation: 'spin 1s linear infinite',
                margin: '16px auto',
              }} />
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
              <button className="g-btn" onClick={onExit} style={{ marginTop: 24 }}>
                Zurück
              </button>
            </div>
          </div>
        )
      }
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
    return null
  }, [matchStored, match, state.legs.length, onExit, isMultiplayer])

  // -------- helper to finalize match safely (TS-safe non-null args) --------
  async function finalizeIfFinished(
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
  ): Promise<boolean> {
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
      const matchFinishedEvt: DartsEvent = {
        eventId: id(),
        type: 'MatchFinished',
        ts: now(),
        matchId: matchNonNull.matchId,
        winnerPlayerId: winnerId,
      }
      finalEvents = [...finalEvents, matchFinishedEvt]
    }

    if (multiplayer?.enabled) {
      // In multiplayer, the caller already sent the events via doPersist
      // Just set local state optimistically
      setEvents(finalEvents)
    } else {
      // React-State zuerst setzen, dann persist AWAIT-en (verhindert Datenverlust bei "noch mal spielen")
      setEvents(finalEvents)
      try {
        await persistEvents(matchStoredNonNull.id, finalEvents)
      } catch (persistErr) {
        console.warn('finalizeIfFinished persist failed:', persistErr)
      }
    }
    setCurrent([])

    try { await finishMatch(matchStoredNonNull.id) } catch (e) { console.warn('finishMatch failed:', e) }

    try {
      finishMatchUpload(
        { ...matchStoredNonNull, events: finalEvents },
        matchNonNull.players.map((p) => ({ id: p.playerId, name: p.name ?? p.playerId }))
      )
    } catch (e) { console.warn('finishMatchUpload failed:', e) }

    try {
      updateLeaderboardsWithMatch({
        id: matchStoredNonNull.id,
        events: finalEvents,
        finishedAt: now(),
      })
    } catch (e) { console.warn('updateLeaderboardsWithMatch failed:', e) }

    updateGlobalX01PlayerStatsFromMatch(matchStoredNonNull.id, finalEvents)

    const wName = matchNonNull.players.find((p) => p.playerId === winnerId)?.name ?? '—'
    setCelebration({ type: 'match-win', key: Date.now() })
    if (speechEnabled) playMatchWinSound()
    setEnded({ winnerName: wName })

    return true
  }

  // Sichere Variablen die undefined sein können (vor errorScreen check)
  const isSets = match?.structure.kind === 'sets'
  const leg = state.legs.length > 0 ? state.legs[state.legs.length - 1]! : null

  const [current, setCurrent] = useState<Dart[]>([])
  const activePlayerId = match && leg ? getCurrentPlayerId(match, leg, events) : ''

  useEffect(() => {
    if (leg) setCurrent([])
  }, [leg?.legId])

  // In multiplayer mode, track the event count before each visit
  // so we know which events are "new" and need to be sent to the server
  const eventsBeforeVisitRef = useRef(events.length)

  // Flash + LastVisit States
  const [flashByPlayer, setFlashByPlayer] = useState<Record<string, string | null>>({})
  const flashTimerRef = useRef<Record<string, number>>({})
  const [lastVisitByPlayer, setLastVisitByPlayer] = useState<Record<string, Visit | null>>({})

  // Score Popup (zentrale Einblendung nach Visit)
  const [scorePopup, setScorePopup] = useState<{ label: string; bust: boolean; key: number } | null>(null)
  const scorePopupTimerRef = useRef<number>(0)

  // Celebration Effect (Confetti bei 180, High Checkout, Match Win)
  const [celebration, setCelebration] = useState<{ type: '180' | 'high-checkout' | 'match-win'; key: number } | null>(null)

  // --- Pause-Modus ---
  const [gamePaused, setGamePaused] = useState(() => isMatchPaused(matchId, 'x01'))

  // Beim Fortsetzen (Pause beenden) den Pause-Status löschen
  useEffect(() => {
    if (!gamePaused) {
      clearMatchPaused(matchId, 'x01')
    }
  }, [gamePaused, matchId])

  // --- Intermission (Leg/Set Summary zwischen den Runden) ---
  const [intermission, setIntermission] = useState<Intermission | null>(null)
  const isPaused = !!intermission || gamePaused

  // --- Scroll-Ref für Legverlauf (Arcade) ---
  const visitListScrollRef = useRef<HTMLDivElement | null>(null)

  // --- Toggle Chart/VisitList ---
  const [showChart, setShowChart] = useState(true)

  // Auto-Scroll bei Dart-Eingabe (nach oben scrollen)
  useEffect(() => {
    if (current.length > 0 && visitListScrollRef.current) {
      visitListScrollRef.current.scrollTop = 0
    }
  }, [current.length])

  // --- Legdauer Timer (reine Spielzeit) ---
  // Lade gespeicherte Zeit beim Start (für Fortsetzung nach Exit)
  const [legDuration, setLegDuration] = useState(() => {
    const savedMs = getMatchElapsedTime(matchId, 'x01')
    return Math.floor(savedMs / 1000)
  })

  // Auto-Pause bei Tab-Wechsel/Fokusverlust
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        setGamePaused(true)
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [])

  // Einfacher Timer: +1 Sekunde wenn nicht pausiert
  useEffect(() => {
    if (gamePaused) return // Pausiert = kein Timer

    const timer = setInterval(() => {
      setLegDuration(prev => prev + 1)
    }, 1000)

    return () => clearInterval(timer)
  }, [gamePaused])

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  // --- Multiplayer: Remote-Events synchronisieren ---
  const prevRemoteEventsRef = useRef<DartsEvent[] | null>(null)
  useEffect(() => {
    if (!multiplayer?.enabled || !multiplayer.remoteEvents) return
    if (multiplayer.remoteEvents === prevRemoteEventsRef.current) return
    const prevLen = prevRemoteEventsRef.current?.length ?? 0
    prevRemoteEventsRef.current = multiplayer.remoteEvents
    setEvents(multiplayer.remoteEvents)

    // Ensure match exists locally for guest devices (needed for stats/finish)
    if (prevLen === 0 && multiplayer.remoteEvents.length > 0) {
      const startEvt = multiplayer.remoteEvents.find((e: any) => e.type === 'MatchStarted') as any
      if (startEvt) {
        ensureX01MatchExists(
          matchId,
          multiplayer.remoteEvents,
          startEvt.players?.map((p: any) => p.playerId) ?? [],
          `${startEvt.mode ?? 'X01'} – Multiplayer`,
        )
      }
    }

    // Announce only when it's MY turn (not on other player's phone)
    if (speechEnabled && multiplayer.remoteEvents.length > prevLen && match) {
      const newState = applyEvents(multiplayer.remoteEvents)
      const currentLeg = newState.legs[newState.legs.length - 1]
      if (currentLeg) {
        const nextPid = getCurrentPlayerId(match, currentLeg, multiplayer.remoteEvents)
        // Only announce if it's now MY turn
        if (nextPid === multiplayer.myPlayerId) {
          const nextName = match.players.find(p => p.playerId === nextPid)?.name ?? nextPid
          const nextRemaining = currentLeg.remainingByPlayer[nextPid] ?? 999
          if (nextRemaining <= 170 && nextRemaining >= 2) {
            // Checkable finish — announce remaining
            debouncedAnnounce(() => announcePlayerFinishArea(nextName, nextRemaining))
          } else {
            debouncedAnnounce(() => announceNextPlayer(nextName))
          }
        }
      }
      // Check for leg/match finish — announce winner and show screens on ALL phones
      const lastEvt = multiplayer.remoteEvents[multiplayer.remoteEvents.length - 1] as any
      if (lastEvt?.type === 'LegFinished' && !legWonAnnouncedRef.current) {
        legWonAnnouncedRef.current = true
        setTimeout(() => announceLegDart(), 500)
        // Show intermission on guest too
        const newState2 = applyEvents(multiplayer.remoteEvents)
        const hasMatchFinished = multiplayer.remoteEvents.some((e: any) => e.type === 'MatchFinished')
        if (!hasMatchFinished) {
          setIntermission({
            kind: 'leg',
            legId: lastEvt.legId ?? '',
            pendingNextEvents: [], // Guest doesn't submit next-leg events
          })
        }
      }
      if (lastEvt?.type === 'MatchFinished' && !matchWonAnnouncedRef.current) {
        matchWonAnnouncedRef.current = true
        setTimeout(() => announceMatchDart(), 500)

        // Guest: Save stats + show end screen
        try { finishMatch(matchId) } catch {}
        try {
          updateLeaderboardsWithMatch({ id: matchId, events: multiplayer.remoteEvents, finishedAt: now() })
        } catch {}
        try { updateGlobalX01PlayerStatsFromMatch(matchId, multiplayer.remoteEvents) } catch {}

        // Trigger end screen for guest
        const winnerId = lastEvt.winnerPlayerId
        const winnerName = match?.players.find(p => p.playerId === winnerId)?.name ?? '—'
        setEnded({ winnerName })
      }
    }
  }, [multiplayer?.enabled, multiplayer?.remoteEvents])

  // --- Sprachausgabe ---
  const [speechEnabled, setSpeechEnabledState] = useState(true)

  const gameOnAnnouncedRef = useRef(false)
  // Verhindert doppelte Match/Leg/Set-Ansagen
  const matchWonAnnouncedRef = useRef(false)
  const legWonAnnouncedRef = useRef(false)
  // Tracker: Letzte angesagte Checkout-Remaining pro Spieler (verhindert Wiederholungen)
  const lastAnnouncedCheckout = useRef<Record<string, number>>({})
  // Tracker: Letztes angesagtes Double (verhindert Duplikate bei React StrictMode)
  const lastAnnouncedDouble = useRef<number | null>(null)
  useEffect(() => {
    initSpeech()
  }, [])

  // "[Name], throw first! Game on!" beim Spielstart ansagen + initiales Checkout-Double
  useEffect(() => {
    if (!match) return
    if (gameOnAnnouncedRef.current) return
    gameOnAnnouncedRef.current = true
    const firstPlayerId = match.bullThrow.winnerPlayerId
    const firstPlayerName = match.players.find((p) => p.playerId === firstPlayerId)?.name ?? firstPlayerId

    setTimeout(() => {
      announceGameStart(firstPlayerName)
    }, 500)
  }, [match])

  // Keyboard Handler: P für Pause, Backspace für Undo
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase()
      if (tag === 'input' || tag === 'textarea') return

      // P = Pause umschalten
      if (e.key === 'p' || e.key === 'P') {
        setGamePaused(p => !p)
        return
      }

      // Pause aktiv? Keine anderen Eingaben
      if (gamePaused) return

      // Backspace = nur aktuellen Dart löschen (nicht vorherige Aufnahmen!)
      if (e.key === 'Backspace') {
        if (current.length > 0) {
          setCurrent((list) => list.slice(0, -1))
        }
        e.preventDefault()
        return
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [current, gamePaused])

  // ---------- ENDSCREEN ----------
  const finishedEvt = state.events.find((e) => e.type === 'MatchFinished') as
    | { type: 'MatchFinished'; winnerPlayerId: string; ts: string }
    | undefined
  const [ended, setEnded] = useState<{ winnerName: string } | null>(null)

  // ---------- ENDSCREEN Ende ----------

  // Multiplayer: Ist der lokale Spieler gerade am Zug?
  const isMyTurn = !multiplayer?.enabled || activePlayerId === multiplayer.myPlayerId

  const handleThrow = (bed: Bed, mult: 1 | 2 | 3) => {
    if (isPaused) return
    // Multiplayer: Nur eigene Würfe eingeben
    if (multiplayer?.enabled && !isMyTurn) return
    if (bed === 20 && mult === 3) playTriple20Sound()
    setCurrent((list) => {
      if (list.length >= 3) return list
      const next: Dart = {
        seq: (list.length + 1) as 1 | 2 | 3,
        bed,
        mult,
        aim: { bed, mult },
      }
      const draft = [...list, next]

      if (!leg) return list
      const { remaining, bust } = simulateLiveRemaining(leg.remainingByPlayer[activePlayerId], draft)

      // Send live preview to other devices
      if (multiplayer?.sendLivePreview && !bust && remaining > 0) {
        const previewDarts = draft.map(d => ({
          bed: d.bed, mult: d.mult,
          score: d.bed === 'MISS' ? 0 : d.bed === 'DBULL' ? 50 : d.bed === 'BULL' ? 25 : (d.bed as number) * d.mult,
        }))
        multiplayer.sendLivePreview(activePlayerId, previewDarts, remaining)
      }

      // Auto-Confirm bei Bust, Checkout oder 3 Darts
      if (bust || remaining === 0 || draft.length === 3) {
        confirmVisit(draft)
        return []
      }

      // 🔥 Double-Ansage wenn auf direktem Double-Finish (1-Dart Checkout)
      if (remaining === 50 || (remaining >= 2 && remaining <= 40 && remaining % 2 === 0)) {
        // Nur ansagen wenn es ein anderes Double ist (verhindert Duplikate)
        if (lastAnnouncedDouble.current !== remaining) {
          lastAnnouncedDouble.current = remaining
          setTimeout(() => announceDouble(remaining), 300)
        }
      } else {
        // Reset wenn nicht mehr auf Double
        lastAnnouncedDouble.current = null
      }

      return draft
    })
  }

  // Backspace: Letzten Dart in aktueller Aufnahme rückgängig machen
  // Wenn aktuelle Aufnahme leer ist, letzte bestätigte Aufnahme rückgängig machen
  const handleUndoLastDart = () => {
    if (isPaused) return

    // Wenn aktuelle Aufnahme Darts hat, letzten Dart entfernen
    if (current.length > 0) {
      setCurrent((list) => list.slice(0, -1))
      return
    }

    // Wenn aktuelle Aufnahme leer ist, letzte bestätigte Aufnahme im aktuellen Leg rückgängig machen
    if (!leg || !matchStored) return
    const lastVisitIdx = events.map((e, i) => ({ e, i }))
      .filter(({ e }) => isVisitAdded(e) && e.legId === leg.legId)
      .pop()?.i

    if (lastVisitIdx === undefined) return

    // Entferne den letzten Visit
    const removeCount = events.length - lastVisitIdx
    const newEvents = events.slice(0, lastVisitIdx)

    // Ausstehende Sprachansagen abbrechen
    cancelDebouncedAnnounce()

    if (multiplayer?.enabled) {
      // Multiplayer: Send undo to server, wait for broadcast
      multiplayer.undo(removeCount)
    } else {
      persistEvents(matchStored.id, newEvents)
      setEvents(newEvents)
    }
    setCurrent([])

    // Flash und LastVisit zurücksetzen
    setFlashByPlayer({})
    setLastVisitByPlayer({})
  }

  // Separate undo for last visit only (mobile input uses this)
  const handleUndoLastVisit = () => {
    if (isPaused || current.length > 0) return // Only when no current darts
    if (!leg || !matchStored) return
    const lastVisitIdx = events.map((e, i) => ({ e, i }))
      .filter(({ e }) => isVisitAdded(e) && e.legId === leg.legId)
      .pop()?.i
    if (lastVisitIdx === undefined) return
    const removeCount = events.length - lastVisitIdx
    const newEvents = events.slice(0, lastVisitIdx)
    cancelDebouncedAnnounce()
    if (multiplayer?.enabled) {
      multiplayer.undo(removeCount)
    } else {
      persistEvents(matchStored.id, newEvents)
      setEvents(newEvents)
    }
    setCurrent([])
    setFlashByPlayer({})
    setLastVisitByPlayer({})
  }

  const confirmVisit = (forcedDarts?: Dart[]) => {
    try {
      if (isPaused) return
      if (multiplayer?.enabled && !isMyTurn) return
      if (!leg || !match || !matchStored) return
      const dartsToSave = forcedDarts && forcedDarts.length ? forcedDarts : current
      if (dartsToSave.length === 0) return

      // Multiplayer: track original event count to compute delta
      const originalEventCount = events.length

      // Helper: persist + optionally send to multiplayer
      const doPersist = (allEvents: DartsEvent[]) => {
        if (multiplayer?.enabled) {
          // Send only the new events delta to server
          const delta = allEvents.slice(originalEventCount)
          if (delta.length > 0) {
            multiplayer.submitEvents(delta)
          }
          // Optimistic local update
          setEvents(allEvents)
        } else {
          // React-State zuerst setzen, damit das Spiel auch bei LS-Fehler weitergeht
          setEvents(allEvents)
          try {
            persistEvents(matchStored.id, allEvents)
          } catch (persistErr) {
            console.warn('persistEvents failed (LS quota?), game continues in-memory:', persistErr)
          }
        }
      }

      const { events: visitEvents } = recordVisit({ match, leg, playerId: activePlayerId, darts: dartsToSave })
      let newEvents: DartsEvent[] = [...events, ...visitEvents]

      let tmp1 = applyEvents(newEvents)

      const lastLegTmp = tmp1.legs[tmp1.legs.length - 1]
      const firstVisitEvt = visitEvents.find(isVisitAdded)

      // Score Popup für ALLE Pfade (auch Leg/Match-Finish mit early return)
      if (firstVisitEvt) {
        const popLabel = firstVisitEvt.bust ? 'BUST' : String(firstVisitEvt.visitScore ?? 0)
        if (scorePopupTimerRef.current) window.clearTimeout(scorePopupTimerRef.current)
        setScorePopup({ label: popLabel, bust: !!firstVisitEvt.bust, key: Date.now() })
        scorePopupTimerRef.current = window.setTimeout(() => setScorePopup(null), 800)

        // Sound: Bust
        if (firstVisitEvt.bust && speechEnabled) playBustSound()

        // Celebration: 180 scored
        if (!firstVisitEvt.bust && firstVisitEvt.visitScore === 180) {
          setCelebration({ type: '180', key: Date.now() })
          if (speechEnabled) play180Sound()
        }
      }

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

        const legFinishedEvt: LegFinished = {
          eventId: id(),
          type: 'LegFinished',
          ts: now(),
          matchId: match.matchId,
          legId: leg.legId,
          winnerPlayerId: activePlayerId,
          finishingVisitId: firstVisitEvt.eventId,
          finishingDartSeq: (finishingDartSeq ?? 1) as 1 | 2 | 3,
          highestCheckoutThisLeg: firstVisitEvt.visitScore ?? 0,
        }
        newEvents.push(legFinishedEvt)

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
            const matchFinishedEvt: DartsEvent = {
              eventId: id(),
              type: 'MatchFinished',
              ts: now(),
              matchId: match.matchId,
              winnerPlayerId: winnerId,
            }
            mergedEvts.push(matchFinishedEvt)
          }

          // Sprachausgabe: Match gewonnen
          if (speechEnabled && !matchWonAnnouncedRef.current) {
            matchWonAnnouncedRef.current = true
            const lastVisit = mergedEvts.slice().reverse().find(isVisitAdded)
            announceScore(lastVisit?.visitScore ?? 0, !!lastVisit?.bust)
            setTimeout(() => announceMatchDart(), 800)
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
          // Celebration: High Checkout (100+)
          if (firstVisitEvt && !firstVisitEvt.bust && (firstVisitEvt.visitScore ?? 0) >= 100) {
            setCelebration({ type: 'high-checkout', key: Date.now() })
            if (speechEnabled) playHighCheckoutSound()
          }
          // Sprachausgabe: Leg gewonnen
          if (speechEnabled && !legWonAnnouncedRef.current) {
            legWonAnnouncedRef.current = true
            const lastVisit = newEvents.slice().reverse().find(isVisitAdded)
            announceScore(lastVisit?.visitScore ?? 0, !!lastVisit?.bust)
            setTimeout(() => announceLegDart(), 800)
          }

          const totalLegsStarted = tmp1.legs.length
          const starter = nextLegStarter(match, totalLegsStarted)

          const nextLegEvt: LegStarted = {
            eventId: id(),
            type: 'LegStarted',
            ts: now(),
            matchId: match.matchId,
            legId: id(),
            legIndex: totalLegsStarted + 1,
            starterPlayerId: starter,
          }

          doPersist(newEvents)
          setCurrent([])

          // Find legIndex from the corresponding LegStarted event
          const currentLegStarted = newEvents.find((e): e is LegStarted => isLegStarted(e) && e.legId === leg.legId)
          const currentLegIndex = currentLegStarted?.legIndex ?? totalLegsStarted

          setIntermission({
            kind: 'leg',
            legId: leg.legId,
            legIndex: currentLegIndex,
            pendingNextEvents: [nextLegEvt],
          })
          return
        }
      } else {
        // ======== SETS MODE ========
        const lastLegSetAware = tmp1.legs[tmp1.legs.length - 1]
        const justFinishedLegSet = !!lastLegSetAware?.winnerPlayerId && lastLegSetAware.legId === leg.legId

        if (justFinishedLegSet) {
          // Celebration: High Checkout (100+) in Sets mode
          if (firstVisitEvt && !firstVisitEvt.bust && (firstVisitEvt.visitScore ?? 0) >= 100) {
            setCelebration({ type: 'high-checkout', key: Date.now() })
            if (speechEnabled) playHighCheckoutSound()
          }
          const { legsPerSet, bestOfSets } = match.structure
          const needLegs = requiredToWinLocal(legsPerSet)
          const needSets = requiredToWinLocal(bestOfSets)

          const tmpSets = tmp1.sets
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
            const setFinishedEvt: SetFinished = {
              eventId: id(),
              type: 'SetFinished',
              ts: now(),
              matchId: match.matchId,
              setIndex: curSetIndex,
              winnerPlayerId: setWinnerId,
            }
            newEvents.push(setFinishedEvt)

            tmp1 = applyEvents(newEvents)
            const afterSets: any[] = tmp1.sets || []
            const setsWonCount: Record<string, number> = Object.fromEntries(match.players.map((p) => [p.playerId, 0]))
            for (const s of afterSets) if (s.winnerPlayerId) setsWonCount[s.winnerPlayerId]++

            const matchWinner = Object.entries(setsWonCount).find(([_, w]) => w >= needSets)?.[0]
            if (matchWinner) {
              const mergedEvts = [...newEvents]
              if (!mergedEvts.some((e) => e.type === 'MatchFinished')) {
                const matchFinishedEvt: DartsEvent = {
                  eventId: id(),
                  type: 'MatchFinished',
                  ts: now(),
                  matchId: match.matchId,
                  winnerPlayerId: matchWinner,
                }
                mergedEvts.push(matchFinishedEvt)
              }

              // Sprachausgabe: Match gewonnen (Sets Mode)
              if (speechEnabled && !matchWonAnnouncedRef.current) {
                matchWonAnnouncedRef.current = true
                const lastVisit = mergedEvts.slice().reverse().find(isVisitAdded)
                announceScore(lastVisit?.visitScore ?? 0, !!lastVisit?.bust)
                setTimeout(() => announceMatchDart(), 800)
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

            const totalLegsStarted = tmp1.legs.length
            const starter = nextLegStarter(match, totalLegsStarted)

            const nextSetEvt: SetStarted = {
              eventId: id(),
              type: 'SetStarted',
              ts: now(),
              matchId: match.matchId,
              setIndex: nextSetIdx,
            }

            const nextLegEvt: LegStarted = {
              eventId: id(),
              type: 'LegStarted',
              ts: now(),
              matchId: match.matchId,
              legId: id(),
              legIndex: totalLegsStarted + 1,
              starterPlayerId: starter,
            }

            // Sprachausgabe: Set gewonnen
            if (speechEnabled && !legWonAnnouncedRef.current) {
              legWonAnnouncedRef.current = true
              const lastVisit = newEvents.slice().reverse().find(isVisitAdded)
              announceScore(lastVisit?.visitScore ?? 0, !!lastVisit?.bust)
              setTimeout(() => announceSetDart(), 800)
            }

            doPersist(newEvents)
            setCurrent([])

            setIntermission({
              kind: 'set',
              setIndex: curSetIndex,
              winnerPlayerId: setWinnerId,
              pendingNextEvents: [nextSetEvt, nextLegEvt],
            })
            return
          }

          // Set nicht fertig -> nur Leg Summary (nächstes Leg erst nach "Weiter")
          // Sprachausgabe: Leg gewonnen im Set
          if (speechEnabled && !legWonAnnouncedRef.current) {
            legWonAnnouncedRef.current = true
            const lastVisit = newEvents.slice().reverse().find(isVisitAdded)
            announceScore(lastVisit?.visitScore ?? 0, !!lastVisit?.bust)
            setTimeout(() => announceLegDart(), 800)
          }

          const totalLegsStarted = tmp1.legs.length
          const starter = nextLegStarter(match, totalLegsStarted)

          const nextLegEvt: LegStarted = {
            eventId: id(),
            type: 'LegStarted',
            ts: now(),
            matchId: match.matchId,
            legId: id(),
            legIndex: totalLegsStarted + 1,
            starterPlayerId: starter,
          }

          doPersist(newEvents)
          setCurrent([])

          // Find legIndex from the corresponding LegStarted event
          const currentLegStartedSet = newEvents.find((e): e is LegStarted => isLegStarted(e) && e.legId === leg.legId)
          const currentLegIndexSet = currentLegStartedSet?.legIndex ?? totalLegsStarted

          setIntermission({
            kind: 'leg',
            legId: leg.legId,
            legIndex: currentLegIndexSet,
            setIndex: curSetIndex,
            pendingNextEvents: [nextLegEvt],
          })
          return
        }
      }

      // ----- Flash + Letzte Aufnahme (mit BUST-Handling) -----
      const latestVisitEvt = newEvents.slice().reverse().find(isVisitAdded)
      const visitScore: number = latestVisitEvt?.visitScore ?? 0
      const isBust: boolean = !!latestVisitEvt?.bust
      const rawDarts = latestVisitEvt?.darts ?? []
      const dartsNums: number[] = rawDarts.map((d) => d.score ?? 0)
      const dartLabels: string[] = rawDarts.map((d) => dartLabelShort(d))

      const label = isBust ? 'BUST' : String(visitScore)
      setFlashByPlayer((prev) => ({ ...prev, [activePlayerId]: label }))
      if (flashTimerRef.current[activePlayerId]) window.clearTimeout(flashTimerRef.current[activePlayerId])
      flashTimerRef.current[activePlayerId] = window.setTimeout(() => {
        setFlashByPlayer((prev) => ({ ...prev, [activePlayerId]: null }))
      }, 1100)

      setLastVisitByPlayer((prev) => ({ ...prev, [activePlayerId]: { darts: dartsNums, dartLabels, score: visitScore, bust: isBust } }))

      // Sprachausgabe: Score ansagen + nächsten Spieler ansagen
      if (speechEnabled) {
        announceScore(visitScore, isBust)

        // Nächsten Spieler ermitteln und ansagen
        const tmpLeg = tmp1.legs[tmp1.legs.length - 1]
        if (tmpLeg) {
          const nextPlayerId = getCurrentPlayerId(match, tmpLeg, newEvents)
          const nextPlayerName = match.players.find((p) => p.playerId === nextPlayerId)?.name ?? nextPlayerId
          const nextRemaining = tmpLeg.remainingByPlayer[nextPlayerId]

          // Nächsten Spieler ansagen — nur wenn ICH der nächste bin (Multiplayer)
          // oder im lokalen Spiel (kein Multiplayer)
          const isNextMe = !multiplayer?.enabled || nextPlayerId === multiplayer.myPlayerId
          if (match.players.length > 1 && isNextMe) {
            if (nextRemaining <= 170) {
              debouncedAnnounce(() => announcePlayerFinishArea(nextPlayerName, nextRemaining))
            } else {
              debouncedAnnounce(() => announceNextPlayer(nextPlayerName))
            }
          }

          // Double ansagen nur bei 1-Dart-Finish (2-40 gerade oder 50/Bull)
          const isOneDartFinish = nextRemaining === 50 || (nextRemaining >= 2 && nextRemaining <= 40 && nextRemaining % 2 === 0)
          if (isOneDartFinish) {
            // Nur ansagen wenn sich der Remaining-Wert geändert hat
            if (lastAnnouncedCheckout.current[nextPlayerId] !== nextRemaining) {
              lastAnnouncedCheckout.current[nextPlayerId] = nextRemaining
              const finishDouble = nextRemaining === 50 ? 'BULL' : `D${nextRemaining / 2}`
              setTimeout(() => announceCheckoutDouble(finishDouble), 1200)
            }
          } else {
            // Nicht mehr auf 1-Dart-Finish -> Tracker zurücksetzen
            delete lastAnnouncedCheckout.current[nextPlayerId]
          }
        }
      }

      // Bestmarken-Benachrichtigungen (persönliche Rekorde)
      if (!isBust && visitScore > 0) {
        const playerName = match.players.find(p => p.playerId === activePlayerId)?.name ?? ''
        const prevVisits = events.filter((e): e is VisitAdded => isVisitAdded(e) && e.playerId === activePlayerId)
        const prevBest = prevVisits.length > 0 ? Math.max(...prevVisits.map(v => v.visitScore ?? 0)) : 0

        if (visitScore === 180 && !prevVisits.some(v => (v.visitScore ?? 0) === 180)) {
          showToast(`${playerName}: Erste 180 im Match!`, 'success')
        } else if (visitScore >= 140 && visitScore > prevBest) {
          showToast(`${playerName}: Neuer Match-Bestwurf \u2014 ${visitScore}!`, 'success')
        } else if (visitScore >= 100 && prevVisits.length > 0 && !prevVisits.some(v => (v.visitScore ?? 0) >= 100)) {
          showToast(`${playerName}: Erste Ton+ im Match!`, 'info')
        }

        // High Checkout Toast (100+)
        const lastEvt = newEvents[newEvents.length - 1]
        if (isVisitAdded(lastEvt) && lastEvt.finishingDartSeq && (lastEvt.remainingBefore ?? 0) >= 100) {
          showToast(`${playerName}: ${lastEvt.remainingBefore}er Checkout!`, 'success')
        }
      }

      doPersist(newEvents)
      setCurrent([])
    } catch (err) {
      console.error('Visit bestätigen fehlgeschlagen:', err)
      console.error('Stack:', (err as Error)?.stack)
      console.error('Events count:', events.length, 'Match:', matchStored?.id)
      alert(`Unerwarteter Fehler beim Speichern des Wurfs:\n${(err as Error)?.message ?? err}\n\nDetails in der Konsole (F12).`)
    }
  }

  // Diese Berechnungen verwenden match und leg - mit Fallbacks für null-Fälle
  const { legsWonCurrent, setsWon, currentLegIndex, currentSetIndex } = match
    ? computeLegsAndSetsScore(match, state)
    : { legsWonCurrent: {}, setsWon: {}, currentLegIndex: 0, currentSetIndex: 0 }
  const requiredLegs = match
    ? (match.structure.kind === 'legs'
        ? requiredToWinLocal(match.structure.bestOfLegs ?? 1)
        : requiredToWinLocal(match.structure.legsPerSet))
    : 1
  const requiredSets = match?.structure.kind === 'sets' ? requiredToWinLocal(match.structure.bestOfSets) : undefined

  const statsByPlayer = computeStats(events)
  const remainingOfActive = leg?.remainingByPlayer[activePlayerId] ?? 0
  const live = simulateLiveRemaining(remainingOfActive, current)

  // Chart-Daten für Score Progression
  const chartData = useMemo(() => {
    if (!leg || !match) return null

    const playerData = match.players.map((p, index) => {
      const playerVisits = leg.visits
        .filter(v => v.playerId === p.playerId)
        .map((v, i) => ({
          visitIndex: i + 1,
          remainingBefore: v.remainingBefore,
          remainingAfter: v.remainingAfter,
          bust: v.bust,
          // Einzelne Dart-Scores für jeden Visit
          dartScores: v.darts.map(d => d.score),
        }))

      return {
        id: p.playerId,
        name: p.name ?? p.playerId,
        color: playerColors[p.playerId] ?? PLAYER_COLORS[index % PLAYER_COLORS.length],
        visits: playerVisits,
      }
    })

    return {
      startScore: match.startingScorePerLeg,
      players: playerData,
      liveRemaining: live.remaining,
      activePlayerId: activePlayerId,
      liveDartCount: current.length, // 0, 1, 2 oder 3 - wie viele Darts schon geworfen
      liveDartScores: current.map(d => dartScore(d)), // Score pro Dart für Live-Anzeige
    }
  }, [leg, match, live.remaining, activePlayerId, current.length, current])

  // Enter-Taste zum Weitergehen bei Intermission
  const continueFromIntermission = useCallback(() => {
    if (!intermission || !matchStored) return
    try {
      const next = [...events, ...(intermission.pendingNextEvents ?? [])]
      if (multiplayer?.enabled) {
        const delta = intermission.pendingNextEvents ?? []
        if (delta.length > 0) multiplayer.submitEvents(delta)
        setEvents(next)
      } else {
        // Events zuerst in React-State setzen, dann persist versuchen
        setEvents(next)
        try {
          persistEvents(matchStored.id, next)
        } catch (persistErr) {
          console.warn('Intermission persist failed (LS quota?), continuing in-memory:', persistErr)
        }
      }
      setCurrent([])
      setIntermission(null)
      legWonAnnouncedRef.current = false
    } catch (err) {
      console.error('continueFromIntermission failed:', err)
      alert(`Fehler beim Fortsetzen: ${(err as Error)?.message ?? err}`)
    }
  }, [intermission, events, multiplayer, matchStored])

  useEffect(() => {
    if (!intermission) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Enter') continueFromIntermission()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [intermission, continueFromIntermission])

  // Error-Screen anzeigen wenn nötig (nach allen Hooks!)
  if (errorScreen) {
    return errorScreen
  }

  // Endscreen anzeigen wenn Match beendet (nach allen Hooks!)
  if ((finishedEvt || ended) && match && matchStored) {
    const winnerId = finishedEvt?.winnerPlayerId ?? (ended as any)?.winnerId
    const winnerName =
      ended?.winnerName ??
      (winnerId ? match.players.find((p) => p.playerId === winnerId)?.name ?? '\u2014' : '\u2014')
    // Use current events (not stale matchStored.events) for correct stats
    const endScreenStored = { ...matchStored, events, finished: true }
    return (
      <X01EndScreen
        matchId={matchId}
        match={match}
        matchStored={endScreenStored}
        events={events}
        state={state}
        winnerName={winnerName}
        isSets={!!isSets}
        playerColors={playerColors}
        onExit={onExit}
        onRematch={onNewGame}
        isArcade={isArcade}
        c={colors}
      />
    )
  }

  // Ab hier sind match, leg und matchStored garantiert nicht-null
  if (!match || !leg || !matchStored) {
    return null // Sollte nie erreicht werden (durch errorScreen abgefangen)
  }

  // Type-safe aliases für den Rest der Komponente
  const m = match
  const l = leg
  const ms = matchStored

  // Dynamischer Hintergrund basierend auf aktivem Spieler
  const activePlayerColor = playerColors[activePlayerId] ?? '#f97316'
  const backgroundStyle = playerColorBgEnabled
    ? {
        background: `linear-gradient(180deg, ${activePlayerColor}20 0%, ${activePlayerColor}05 100%)`,
        transition: 'background 0.5s ease',
      }
    : {}

  return (
    <div className="g-page" style={{ ...backgroundStyle, height: '100dvh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Celebration Effect (Confetti) */}
      {celebration && (
        <CelebrationEffect
          key={celebration.key}
          type={celebration.type}
          duration={celebration.type === 'match-win' ? 3000 : 2000}
          onComplete={() => setCelebration(null)}
        />
      )}

      {/* Score Popup (nur Classic-Modus, Arcade nutzt CenterScore) */}
      {scorePopup && !isArcade && (
        <div key={scorePopup.key} className={`g-scorePopup${scorePopup.bust ? ' bust' : ''}`}>
          {scorePopup.label}
        </div>
      )}

      {/* Intermission Overlay (Leg/Set Summary) */}
      {intermission && (
        <X01IntermissionScreen
          intermission={intermission}
          events={events}
          match={match}
          playerColors={playerColors}
          isArcade={isArcade}
          onContinue={continueFromIntermission}
        />
      )}

      {/* Pause Overlay */}
      {gamePaused && (
        <PauseOverlay
          onResume={() => setGamePaused(false)}
          matchScore={(() => {
            if (!match) return undefined
            const parts: string[] = []
            if (isSets) {
              const setsStr = match.players.map(p => `${setsWon[p.playerId] ?? 0}`).join('-')
              parts.push(`Sets: ${setsStr}`)
            }
            const legsStr = match.players.map(p => `${legsWonCurrent[p.playerId] ?? 0}`).join('-')
            parts.push(`Legs: ${legsStr}`)
            return parts.join(', ')
          })()}
          elapsedTime={formatDuration(legDuration)}
          playerStats={match?.players.map(p => ({
            name: p.name ?? p.playerId,
            color: playerColors[p.playerId],
            average: statsByPlayer[p.playerId]?.threeDartAvg ?? 0,
            dartsThrown: statsByPlayer[p.playerId]?.dartsThrown ?? 0,
          }))}
        />
      )}

      {/* Kopfzeile mit Pause/Mute/Exit */}
      <GameControls
        isPaused={gamePaused}
        onTogglePause={() => setGamePaused(p => !p)}
        isMuted={!speechEnabled}
        onToggleMute={() => {
          const newVal = !speechEnabled
          setSpeechEnabledState(newVal)
          setSpeechEnabled(newVal)
        }}
        onExit={() => {
          // Pause-Status und verstrichene Zeit speichern bevor wir verlassen
          setMatchPaused(matchId, 'x01', true)
          setMatchElapsedTime(matchId, 'x01', legDuration * 1000)
          onExit()
        }}
        onCancel={() => {
          // Match löschen und zum Menü
          deleteX01Match(matchId)
          onExit()
        }}
        title={matchStored.title}
        subtitle={
          match.structure.kind === 'sets'
            ? `First to ${requiredSets} Sets · Set #${currentSetIndex || 1} · Leg #${currentLegIndex} · ${formatDuration(legDuration)}`
            : `First to ${requiredLegs} Legs · Leg #${currentLegIndex} · ${formatDuration(legDuration)}`
        }
      />

      {/* Multiplayer Connection Badge */}
      {multiplayer?.enabled && (
        <div className="game-flex-center" style={{ padding: '4px 0' }}>
          <ConnectionBadge status={multiplayer.connectionStatus} playerCount={multiplayer.playerCount} />
        </div>
      )}

      {/* Spieler-Karten / Arcade View */}
      {!isArcade ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
          <div className="g-grid">
            {match.players.map((p) => {
              const isActive = p.playerId === activePlayerId
              const avg = statsByPlayer[p.playerId]?.threeDartAvg ?? 0
              const playerLegs = legsWonCurrent[p.playerId] ?? 0
              const playerSets = setsWon[p.playerId] ?? 0

              const remaining = leg.remainingByPlayer[p.playerId]
              const currentDarts = isActive ? current.map(dartScore) : []
              const dartsRemaining = isActive ? 3 - current.length : 3

              const derivedLast = getLastVisitForPlayer(leg, p.playerId)
              const derivedVisit: Visit | null = derivedLast
                ? {
                    darts: derivedLast.darts.map((d) => d.score ?? 0),
                    score: derivedLast.visitScore ?? 0,
                    bust: !!derivedLast.bust,
                  }
                : null
              const lastVisit = lastVisitByPlayer[p.playerId] ?? derivedVisit

              const flashLabel = flashByPlayer[p.playerId] ?? null
              const recentScores = leg.visits.filter(v => v.playerId === p.playerId).slice(-10).map(v => v.visitScore)

              return (
                <PlayerTurnCard
                  key={`${p.playerId}-${isActive ? 'active' : 'idle'}`}
                  name={p.name ?? p.playerId}
                  color={p.color}
                  remaining={isActive ? live.remaining
                    : (multiplayer?.livePreview?.playerId === p.playerId ? multiplayer.livePreview.remaining : remaining)}
                  currentDarts={currentDarts}
                  dartsRemaining={dartsRemaining}
                  lastVisit={lastVisit}
                  flashLabel={flashLabel}
                  isActive={isActive}
                  isMyPlayer={!multiplayer?.enabled || p.playerId === multiplayer.myPlayerId}
                  legs={playerLegs}
                  sets={playerSets}
                  showSets={isSets}
                  threeDartAvg={avg}
                  recentScores={recentScores}
                />
              )
            })}
          </div>

          {/* Score Progression Chart — hidden on mobile to save space */}
          {chartData && (
            <div className="g-chart-mobile-hide" style={{
              marginTop: 8,
              borderRadius: 12,
              overflow: 'hidden',
              boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
              flex: 1,
              minHeight: 80,
              maxHeight: 180,
            }}>
              <ScoreProgressionChart
                startScore={chartData.startScore}
                players={chartData.players}
                liveRemaining={chartData.liveRemaining}
                activePlayerId={chartData.activePlayerId}
                liveDartCount={chartData.liveDartCount}
                liveDartScores={chartData.liveDartScores}
              />
            </div>
          )}

          {/* Eingabeblock */}
          {multiplayer?.enabled && !isMyTurn && (
            <div style={{
              textAlign: 'center', padding: '12px 16px',
              background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 12,
              color: '#92400e', fontWeight: 700, fontSize: 14, marginBottom: 8,
            }}>
              {match.players.find(p => p.playerId === activePlayerId)?.name ?? 'Gegner'} ist am Zug — warte...
            </div>
          )}
          <Scoreboard onThrow={handleThrow} dartsThrown={current.length} thrownDarts={current.map(d => ({ bed: d.bed, mult: d.mult }))} onUndoLastDart={handleUndoLastDart} onUndoLastVisit={handleUndoLastVisit} />
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
          {/* Arcade View */}
          {(() => {
            const arcadePlayers = match.players.map((p) => {
              const isActive = p.playerId === activePlayerId
              const avg = statsByPlayer[p.playerId]?.threeDartAvg ?? 0
              const playerLegs = legsWonCurrent[p.playerId] ?? 0
              const playerSets = setsWon[p.playerId] ?? 0
              const remaining = isActive ? live.remaining : leg.remainingByPlayer[p.playerId]

              const derivedLast = getLastVisitForPlayer(leg, p.playerId)
              const lastVisitObj = lastVisitByPlayer[p.playerId]
              const lastScore = lastVisitObj
                ? lastVisitObj.score
                : derivedLast
                  ? (derivedLast.visitScore ?? 0)
                  : null

              // Dart-Labels für letzte Aufnahme
              let lastDartLabels: string[] | null = null
              if (lastVisitObj?.dartLabels) {
                lastDartLabels = lastVisitObj.dartLabels
              } else if (derivedLast) {
                lastDartLabels = derivedLast.darts.map((d) => dartLabelShort(d))
              }

              // Checkout-Route nur wenn mit verbleibenden Darts möglich
              const dartsLeft = isActive ? 3 - current.length : 3
              const playerCheckout = getCheckoutRoute(remaining, dartsLeft)
              const playerSetupShot = getSetupShot(remaining, dartsLeft)

              return {
                id: p.playerId,
                name: p.name ?? p.playerId,
                remaining,
                isActive,
                lastVisitScore: lastScore,
                lastVisitDarts: lastDartLabels,
                threeDartAvg: avg,
                legs: playerLegs,
                sets: playerSets,
                checkoutRoute: playerCheckout ?? null,
                setupShot: playerSetupShot ?? null,
                color: playerColors[p.playerId],
              }
            })

            const activePlayer = match.players.find((p) => p.playerId === activePlayerId)
            const activePlayerName = activePlayer?.name ?? activePlayerId
            const activeAvg = statsByPlayer[activePlayerId]?.threeDartAvg ?? 0
            const currentScoreSum = current.reduce((sum, d) => sum + dartScore(d), 0)
            const checkoutRoute = getCheckoutRoute(live.remaining, 3 - current.length)
            const setupShot = getSetupShot(live.remaining, 3 - current.length)

            // Aufnahmen-Liste: Letzte 8 Visits + Live (neuster oben)
            const recentVisits: VisitEntry[] = []

            // Alle VisitAdded Events im aktuellen Leg (für kumulative Average-Berechnung)
            const allLegVisits = events.filter((e): e is VisitAdded => isVisitAdded(e) && e.legId === leg.legId)

            // Kumulative Averages pro Spieler berechnen
            const cumulativeStats: Record<string, { totalScore: number; visitCount: number }> = {}
            const avgAtVisit: number[] = [] // Average nach jedem Visit

            for (const ev of allLegVisits) {
              const { playerId, visitScore } = ev
              const score = visitScore ?? 0

              if (!cumulativeStats[playerId]) {
                cumulativeStats[playerId] = { totalScore: 0, visitCount: 0 }
              }
              cumulativeStats[playerId].totalScore += score
              cumulativeStats[playerId].visitCount += 1

              // Average für diesen Spieler nach diesem Visit
              const playerAvg = cumulativeStats[playerId].totalScore / cumulativeStats[playerId].visitCount
              avgAtVisit.push(playerAvg)
            }

            // Live-Wurf (aktueller Spieler, noch nicht bestätigt)
            if (current.length > 0) {
              // Berechne den Live-Average für den aktiven Spieler
              const activeStats = cumulativeStats[activePlayerId] ?? { totalScore: 0, visitCount: 0 }
              const liveAvg = activeStats.visitCount > 0
                ? (activeStats.totalScore + currentScoreSum) / (activeStats.visitCount + 1)
                : currentScoreSum

              recentVisits.push({
                playerName: activePlayerName,
                darts: current.map(d => dartLabelShort(d)),
                score: currentScoreSum,
                remaining: live.remaining,
                isLive: true,
                avg: liveAvg,
              })
            }

            // Letzte VisitAdded Events aus dem aktuellen Leg (max 8 - liveCount)
            const visitEvents = allLegVisits.slice(-8).reverse() // Neuster oben

            for (let i = 0; i < visitEvents.length; i++) {
              if (recentVisits.length >= 8) break
              const ev = visitEvents[i]
              const { playerId, darts: evDarts, visitScore, remainingAfter } = ev
              const player = match.players.find((p) => p.playerId === playerId)
              const playerName = player?.name ?? playerId
              const darts = evDarts.map((d) => dartLabelShort(d))
              const score = visitScore ?? 0
              const remaining = remainingAfter ?? 0

              // Finde den Index dieses Events in allLegVisits
              const originalIndex = allLegVisits.length - (visitEvents.length - i)
              const avgForThisVisit = avgAtVisit[originalIndex] ?? 0

              recentVisits.push({
                playerName,
                darts,
                score,
                remaining,
                avg: avgForThisVisit,
              })
            }

            // Arcade Action Button Style
            const arcadeActionBtn = (disabled: boolean): React.CSSProperties => ({
              width: 44,
              height: 44,
              borderRadius: 8,
              border: 'none',
              background: disabled ? '#1a1a1a' : '#292524',
              color: disabled ? '#444' : '#f97316',
              cursor: disabled ? 'not-allowed' : 'pointer',
              fontWeight: 800,
              fontSize: 18,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all .15s',
              opacity: disabled ? 0.5 : 1,
            })

            return (
              <div style={{
                background: '#0f0f0f',
                padding: '12px 16px 16px',
                borderRadius: '0 0 12px 12px',
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
              }}>
                {/* Spieler-Segmente oben */}
                <X01ArcadeView
                  players={arcadePlayers}
                  currentScore={currentScoreSum}
                  currentDart={current.length}
                  currentDarts={current.map(d => dartLabelShort(d))}
                  activePlayerName={activePlayerName}
                  checkoutRoute={checkoutRoute ?? null}
                  setupShot={setupShot ?? null}
                  bust={live.bust}
                  showSets={isSets}
                  confirmedScore={scorePopup ? { value: Number(scorePopup.label) || 0, bust: scorePopup.bust, key: scorePopup.key } : null}
                />

                {/* Chart/Legverlauf + Action Buttons + Tastenfeld nebeneinander */}
                <div style={{ display: 'flex', gap: 12, alignItems: 'stretch' }}>
                  {/* Chart oder Legverlauf links (mit Toggle) */}
                  <div style={{ flex: 1, display: 'flex', position: 'relative', minHeight: 140 }}>
                    {/* Toggle-Button */}
                    <button
                      onClick={() => setShowChart(v => !v)}
                      style={{
                        position: 'absolute',
                        top: 4,
                        right: 4,
                        zIndex: 10,
                        padding: '3px 6px',
                        fontSize: 9,
                        background: '#1a1a1a',
                        border: '1px solid #333',
                        borderRadius: 4,
                        color: '#9ca3af',
                        cursor: 'pointer',
                      }}
                    >
                      {showChart ? '📋' : '📊'}
                    </button>

                    {/* Chart oder VisitList */}
                    {showChart && chartData ? (
                      <ScoreProgressionChart
                        startScore={chartData.startScore}
                        players={chartData.players}
                        liveRemaining={chartData.liveRemaining}
                        activePlayerId={chartData.activePlayerId}
                        liveDartCount={chartData.liveDartCount}
                        liveDartScores={chartData.liveDartScores}
                      />
                    ) : (
                      <VisitList visits={recentVisits} scrollRef={visitListScrollRef} />
                    )}
                  </div>

                  {/* Action Buttons (vertikal in der Mitte) */}
                  <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                    justifyContent: 'center',
                  }}>
                    <button
                      onClick={() => setCurrent((l) => l.slice(0, -1))}
                      disabled={current.length === 0 || isPaused}
                      style={arcadeActionBtn(current.length === 0 || isPaused)}
                      title="Letzten Dart löschen"
                    >
                      ⌫
                    </button>
                    <button
                      onClick={() => setCurrent([])}
                      disabled={current.length === 0 || isPaused}
                      style={arcadeActionBtn(current.length === 0 || isPaused)}
                      title="Alle Darts löschen"
                    >
                      ✕
                    </button>
                    <button
                      onClick={() => confirmVisit(current)}
                      disabled={current.length === 0 || isPaused}
                      style={{
                        ...arcadeActionBtn(current.length === 0 || isPaused),
                        background: current.length > 0 && !isPaused ? '#166534' : '#1a1a1a',
                        color: current.length > 0 && !isPaused ? '#22c55e' : '#444',
                      }}
                      title="Visit bestätigen"
                    >
                      ✓
                    </button>
                    <button
                      onClick={() => {
                        const lastVisitIdx = events.map((e, i) => ({ e, i }))
                          .filter(({ e }) => isVisitAdded(e) && e.legId === leg.legId)
                          .pop()?.i
                        if (lastVisitIdx === undefined) return
                        const newEvents = events.slice(0, lastVisitIdx)
                        persistEvents(matchStored.id, newEvents)
                        setEvents(newEvents)
                        setCurrent([])
                        setFlashByPlayer({})
                        setLastVisitByPlayer({})
                      }}
                      disabled={isPaused || leg.visits.length === 0}
                      style={arcadeActionBtn(isPaused || leg.visits.length === 0)}
                      title="Letzten Wurf rückgängig"
                    >
                      ↩
                    </button>
                  </div>

                  {/* Tastenfeld rechts */}
                  {multiplayer?.enabled && !isMyTurn && (
                    <div style={{
                      textAlign: 'center', padding: '8px 12px',
                      background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 8,
                      color: '#92400e', fontWeight: 700, fontSize: 13, marginBottom: 6,
                    }}>
                      {match.players.find(p => p.playerId === activePlayerId)?.name ?? 'Gegner'} ist am Zug
                    </div>
                  )}
                  <Scoreboard onThrow={handleThrow} dartsThrown={current.length} thrownDarts={current.map(d => ({ bed: d.bed, mult: d.mult }))} theme="arcade" onUndoLastDart={handleUndoLastDart} onUndoLastVisit={handleUndoLastVisit} compact={true} />
                </div>
              </div>
            )
          })()}
        </div>
      )}

      {/* Manuelle Steuerung - nur im Classic-Modus, versteckt auf Mobile (MobileScoreInput hat eigene Buttons) */}
      {!isArcade && (
        <div className="g-toolbar g-chart-mobile-hide">
          <button className="g-btn" onClick={() => setCurrent((l) => l.slice(0, -1))} disabled={current.length === 0 || isPaused}>
            ← Back
          </button>
          <button className="g-btn" onClick={() => setCurrent([])} disabled={current.length === 0 || isPaused}>
            ✖ Clear
          </button>
          <button className="g-btn" onClick={() => confirmVisit(current)} disabled={current.length === 0 || isPaused}>
            ✔ Visit bestätigen
          </button>
          <button
            className="g-btn"
            onClick={() => {
              // Finde den letzten VisitAdded Event im aktuellen Leg
              const lastVisitIdx = events.map((e, i) => ({ e, i }))
                .filter(({ e }) => isVisitAdded(e) && e.legId === leg.legId)
                .pop()?.i

              if (lastVisitIdx === undefined) return

              // Entferne den letzten Visit
              const newEvents = events.slice(0, lastVisitIdx)
              persistEvents(matchStored.id, newEvents)
              setEvents(newEvents)
              setCurrent([])

              // Flash und LastVisit zurücksetzen
              setFlashByPlayer({})
              setLastVisitByPlayer({})
            }}
            disabled={isPaused || leg.visits.length === 0}
          >
            ↩ Letzten Wurf rückgängig
          </button>
        </div>
      )}
    </div>
  )
}
