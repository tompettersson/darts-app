// src/screens/GameCricket.tsx
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { isMatchFinishedInDB } from '../db/storage'
import { useTheme } from '../ThemeProvider'
import {
  applyCricketEvents,
  currentPlayerId,
  recordCricketTurn,
  targetsFor,
  currentLegContext,
  targetWinsFromMatch,
  type CricketEvent,
  type CricketTurnDart,
  type CricketTurnAdded,
} from '../dartsCricket'
import {
  getCricketMatches,
  getCricketMatch,
  persistCricketEvents,
  finishCricketMatch,
  isMatchPaused,
  setMatchPaused,
  clearMatchPaused,
  deleteCricketMatch,
  getProfiles,
  getPlayerColorBackgroundEnabled,
  ensureCricketMatchExists,
  ensureCricketMatchExistsAsync,
} from '../storage'
import { ui } from '../ui'
import CricketArcadeView from '../components/CricketArcadeView'
import GameControls, { PauseOverlay } from '../components/GameControls'
import CricketProgressChart, { prepareCricketChartData, CRICKET_TARGETS } from '../components/CricketProgressChart'
import CricketGanttChart, { computeFieldClosures, type GanttChartPlayer } from '../components/CricketGanttChart'
import CricketTurnList, { formatDartLabel, computeMarksDetail, type CricketTurnEntry } from '../components/CricketTurnList'
import { PLAYER_COLORS } from '../components/ScoreProgressionChart'
import { initSpeech, setSpeechEnabled, announceGameStart, announceNextPlayer, announceCrazyPlayerTarget, announceCricketLeg, announceCricketMatch, announceClosed, announceCricketMarks, announcePlayerNeeds, playTriple20Sound, cancelDebouncedAnnounce, debouncedAnnounce } from '../speech'
import { useDisableScale } from '../components/ScaleWrapper'
import './game.css'

type MultiplayerProp = {
  enabled: boolean
  roomCode: string
  myPlayerId: string
  localPlayerIds?: string[]
  isHost: boolean
  submitEvents: (events: any[]) => void
  undo: (removeCount: number) => void
  remoteEvents: any[] | null
  connectionStatus: string
  playerCount: number
}

type Props = {
  matchId: string
  onExit: () => void
  onShowCricketSummary?: (id: string) => void
  multiplayer?: MultiplayerProp
}

function loadCricketById(id: string) {
  return getCricketMatches().find(m => m.id === id)
}

/* ===========================
   SVG Marks (0..3)
=========================== */
function MarkSVG({ value, preview }: { value: 0 | 1 | 2 | 3; preview?: boolean }) {
  const bg = preview ? '#fef3c7' : 'transparent'
  const stroke = '#111827'
  const sw = 2.4
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      style={{
        background: bg,
        borderRadius: 4,
      }}
    >
      {value === 0 && <circle cx="12" cy="12" r="0.01" fill="transparent" />}
      {value === 1 && (
        <line
          x1="6"
          y1="18"
          x2="18"
          y2="6"
          stroke={stroke}
          strokeWidth={sw}
          strokeLinecap="round"
        />
      )}
      {value === 2 && (
        <>
          <line
            x1="6"
            y1="18"
            x2="18"
            y2="6"
            stroke={stroke}
            strokeWidth={sw}
            strokeLinecap="round"
          />
          <line
            x1="6"
            y1="6"
            x2="18"
            y2="18"
            stroke={stroke}
            strokeWidth={sw}
            strokeLinecap="round"
          />
        </>
      )}
      {value === 3 && (
        <>
          <circle
            cx="12"
            cy="12"
            r="7.5"
            stroke={stroke}
            strokeWidth={sw}
            fill="none"
          />
          <line
            x1="7.5"
            y1="16.5"
            x2="16.5"
            y2="7.5"
            stroke={stroke}
            strokeWidth={sw}
            strokeLinecap="round"
          />
        </>
      )}
    </svg>
  )
}

/* ===========================
   Tally (IIII/) – präzise 5er-Strichliste per SVG
   – 4 Vertikalstriche + diagonaler Querstrich
   – Rest 1..4 als Einzelstriche
   – Look an UI angepasst
=========================== */
const TALLY_BAR_W = 2            // Strichbreite
const TALLY_BAR_H = 14           // Strichhöhe (passt zu ROW_H 32)
const TALLY_GAP  = 4             // Abstand zwischen Strichen
const TALLY_GROUP_W = TALLY_BAR_W * 4 + TALLY_GAP * 3

function FiveGroupSVG() {
  const xs = [0, 1, 2, 3].map(i => i * (TALLY_BAR_W + TALLY_GAP))
  return (
    <svg
      width={TALLY_GROUP_W}
      height={TALLY_BAR_H}
      viewBox={`0 0 ${TALLY_GROUP_W} ${TALLY_BAR_H}`}
      style={{ display: 'block' }}
    >
      {xs.map((x, i) => (
        <rect
          key={i}
          x={x}
          y={0}
          width={TALLY_BAR_W}
          height={TALLY_BAR_H}
          rx={1}
          ry={1}
          fill="currentColor"
        />
      ))}
      {/* Diagonaler Querstrich von links-unten nach rechts-oben */}
      <line
        x1={-1}
        y1={TALLY_BAR_H - 1}
        x2={TALLY_GROUP_W + 1}
        y2={1}
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
      />
    </svg>
  )
}

function SingleBarSVG() {
  return (
    <svg
      width={TALLY_BAR_W}
      height={TALLY_BAR_H}
      viewBox={`0 0 ${TALLY_BAR_W} ${TALLY_BAR_H}`}
      style={{ display: 'block' }}
    >
      <rect
        x={0}
        y={0}
        width={TALLY_BAR_W}
        height={TALLY_BAR_H}
        rx={1}
        ry={1}
        fill="currentColor"
      />
    </svg>
  )
}

function Tally({
  count,
  align = 'right',
  previewIncrease,
}: {
  count: number
  align?: 'left' | 'right'
  previewIncrease?: boolean
}) {
  const safe = Math.max(0, Math.min(count, 999))
  const fullGroups = Math.floor(safe / 5)
  const rest = safe % 5

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: align === 'right' ? 'flex-end' : 'flex-start',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 6,                            // klarer Abstand zwischen Gruppen/Strichen
        background: previewIncrease ? '#fff7ed' : 'transparent', // dezenter Preview-Tint (warm)
        borderRadius: 6,
        padding: previewIncrease ? '2px 6px' : 0,
        minHeight: TALLY_BAR_H,
        color: '#0f172a',                  // etwas dunkler → bessere Lesbarkeit
        fontWeight: 700,
        lineHeight: 1,
      }}
      title={`${safe}x Overflow-Marks`}
    >
      {safe === 0 ? (
        <span style={{ opacity: 0.35 }}>—</span>
      ) : (
        <>
          {Array.from({ length: fullGroups }).map((_, i) => (
            <span key={`g${i}`} style={{ display: 'inline-flex', lineHeight: 0 }}>
              <FiveGroupSVG />
            </span>
          ))}
          {Array.from({ length: rest }).map((_, r) => (
            <span key={`r${r}`} style={{ display: 'inline-flex', lineHeight: 0 }}>
              <SingleBarSVG />
            </span>
          ))}
        </>
      )}
    </div>
  )
}

/* ===========================
   Overflow-Tally Rekonstruktion
=========================== */
function cappedHitsOf(target: number | 'BULL', mult: 1 | 2 | 3): number {
  if (target === 'BULL') {
    return mult > 2 ? 2 : mult // Triple Bull zählt wie Double Bull
  }
  return mult
}

function buildPerTargetTallies(
  events: CricketEvent[],
  match: ReturnType<typeof applyCricketEvents>['match'],
  previewTurn?: CricketEvent
): Record<string, Record<string, number>> {
  const all = previewTurn ? [...events, previewTurn] : events.slice()
  const tKeys = targetsFor(match!.range).map(String)
  const players = match!.players.map(p => p.playerId)

  const marks: Record<string, Record<string, number>> = {}
  const tally: Record<string, Record<string, number>> = {}
  for (const pid of players) {
    marks[pid] = {}
    tally[pid] = {}
    for (const t of tKeys) {
      marks[pid][t] = 0
      tally[pid][t] = 0
    }
  }

  for (const ev of all) {
    // Reset zwischen Legs: Tallies & Marks für neue Leg-Periode leeren
    if (ev.type === 'CricketLegFinished') {
      for (const pid of players) {
        for (const t of tKeys) {
          marks[pid][t] = 0
          tally[pid][t] = 0
        }
      }
      continue
    }

    if (ev.type !== 'CricketTurnAdded') continue
    const pid = ev.playerId
    if (!marks[pid]) { marks[pid] = {}; tKeys.forEach(t => { marks[pid][t] = 0 }) }
    if (!tally[pid]) { tally[pid] = {}; tKeys.forEach(t => { tally[pid][t] = 0 }) }

    for (const d of ev.darts) {
      if (d.target === 'MISS') continue
      const isBull = d.target === 'BULL'
      const tKey = String(isBull ? 'BULL' : d.target)

      if (!tKeys.includes(tKey)) continue

      const cappedMult = isBull && d.mult === 3 ? 2 : d.mult
      const hits = cappedHitsOf(isBull ? 'BULL' : (d.target as number), cappedMult)

      const before = marks[pid][tKey] ?? 0

      // Teil zum Schließen
      const closePart = Math.max(0, Math.min(3 - before, hits))
      const overflowMarks = Math.max(0, hits - closePart)

      // marks-Update (Cap bei 3)
      marks[pid][tKey] = Math.min(3, before + closePart)

      // schauen, ob Gegner das Feld noch offen haben
      const opponents = players.filter(x => x !== pid)
      const anyOpponentOpen = opponents.some(op => (marks[op][tKey] ?? 0) < 3)

      // Overflow:
      let totalOverflow = 0
      if (before === 3) {
        // Feld schon zu -> kompletter Hit ist Scoring
        totalOverflow = hits
      } else {
        // nur Überhang über die 3 Marks
        totalOverflow = overflowMarks
      }

      if (totalOverflow > 0 && anyOpponentOpen) {
        // Crazy-Modus: crazyScoringMode bestimmt die Punkteverteilung
        const crazyScoringMode = (match as any).crazyScoringMode ?? ((match as any).crazyWithPoints ? 'standard' : 'simple')
        const isCrazyWithStandardPoints = match!.style === 'crazy' && crazyScoringMode === 'standard'
        const isCrazyCutthroat = match!.style === 'crazy' && crazyScoringMode === 'cutthroat'

        if (match!.style === 'standard' || isCrazyWithStandardPoints) {
          tally[pid][tKey] = (tally[pid][tKey] ?? 0) + totalOverflow
        } else if (match!.style === 'cutthroat' || isCrazyCutthroat) {
          // cutthroat: Schaden für alle Gegner, die noch offen sind
          for (const op of opponents) {
            if ((marks[op][tKey] ?? 0) < 3) {
              tally[op][tKey] = (tally[op][tKey] ?? 0) + totalOverflow
            }
          }
        }
        // simple und crazy ohne Punkte: keine Tallies
      }
    }
  }

  return tally
}

/* ===========================
   Leg-Dauer Berechnung
=========================== */
function computeLegDuration(events: CricketEvent[], legIndex: number): string {
  let currentLeg = 0
  let legStartTs: string | null = null
  let legEndTs: string | null = null

  for (const ev of events) {
    if (ev.type === 'CricketLegFinished') {
      if (currentLeg === legIndex) {
        legEndTs = ev.ts
        break
      }
      currentLeg++
      legStartTs = null // Reset für nächstes Leg
      continue
    }

    if (ev.type === 'CricketTurnAdded' && currentLeg === legIndex) {
      if (!legStartTs) {
        legStartTs = ev.ts
      }
      legEndTs = ev.ts // Letzter Turn als Fallback
    }
  }

  if (!legStartTs || !legEndTs) return '—'

  const start = new Date(legStartTs).getTime()
  const end = new Date(legEndTs).getTime()
  const diffMs = end - start

  if (diffMs < 0) return '—'

  const mins = Math.floor(diffMs / 60000)
  const secs = Math.floor((diffMs % 60000) / 1000)
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
}

/* ===========================
   Events für ein Leg extrahieren
=========================== */
function getEventsForLeg(allEvents: CricketEvent[], legIndex: number): CricketEvent[] {
  const result: CricketEvent[] = []
  let currentLeg = 0

  for (const ev of allEvents) {
    if (ev.type === 'CricketLegFinished') {
      if (currentLeg === legIndex) {
        return result
      }
      currentLeg++
      continue
    }

    if (currentLeg === legIndex && ev.type === 'CricketTurnAdded') {
      result.push(ev)
    }
  }

  return result
}

/* ===========================
   Marks-State für ein Leg berechnen
=========================== */
function computeMarksForLeg(
  events: CricketEvent[],
  legIndex: number,
  players: string[],
  range: 'short' | 'long'
): {
  marksByPlayer: Record<string, Record<string, number>>
  pointsByPlayer: Record<string, number>
} {
  const validTargets = range === 'short'
    ? ['15', '16', '17', '18', '19', '20', 'BULL']
    : ['10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20', 'BULL']

  const marksByPlayer: Record<string, Record<string, number>> = {}
  const pointsByPlayer: Record<string, number> = {}
  players.forEach(pid => {
    marksByPlayer[pid] = {}
    validTargets.forEach(t => { marksByPlayer[pid][t] = 0 })
    pointsByPlayer[pid] = 0
  })

  let currentLeg = 0
  for (const ev of events) {
    if (ev.type === 'CricketLegFinished') {
      if (currentLeg === legIndex) break
      currentLeg++
      // Reset für nächstes Leg
      players.forEach(pid => {
        validTargets.forEach(t => { marksByPlayer[pid][t] = 0 })
        pointsByPlayer[pid] = 0
      })
      continue
    }

    if (ev.type !== 'CricketTurnAdded' || currentLeg !== legIndex) continue

    const turn = ev as CricketTurnAdded
    const pid = turn.playerId
    if (!marksByPlayer[pid]) { marksByPlayer[pid] = {}; validTargets.forEach(t => { marksByPlayer[pid][t] = 0 }) }

    for (const d of turn.darts) {
      if (d.target === 'MISS') continue
      const tKey = String(d.target)
      if (!validTargets.includes(tKey)) continue

      const before = marksByPlayer[pid][tKey] ?? 0
      if (before >= 3) continue

      const mult = d.target === 'BULL' && d.mult === 3 ? 2 : d.mult
      const added = Math.min(mult, 3 - before)
      marksByPlayer[pid][tKey] = before + added
    }
  }

  return { marksByPlayer, pointsByPlayer }
}

/* ===========================
   Leg-Stats Berechnung
=========================== */
function computeLegStats(
  events: CricketEvent[],
  legIndex: number,
  range: 'short' | 'long',
  players: { playerId: string; name?: string }[]
): Record<string, {
  totalMarks: number
  totalPoints: number
  turns: number
  marksPerTurn: number
  triplesHit: number
  doublesHit: number
  bestTurnMarks: number
  bullHits: number
  doubleBullHits: number
}> {
  const targetList = targetsFor(range)
  const validTargets = new Set(targetList.map(String))
  const allPlayerIds = players.map(p => p.playerId)

  // Marks-Tracking für Punkteberechnung
  const marksByPlayer: Record<string, Record<string, number>> = {}
  allPlayerIds.forEach(pid => {
    marksByPlayer[pid] = {}
    validTargets.forEach(t => { marksByPlayer[pid][t] = 0 })
  })

  // Stats pro Spieler
  const stats: Record<string, {
    totalMarks: number
    totalPoints: number
    turns: number
    triplesHit: number
    doublesHit: number
    bestTurnMarks: number
    bullHits: number
    doubleBullHits: number
  }> = {}
  allPlayerIds.forEach(pid => {
    stats[pid] = { totalMarks: 0, totalPoints: 0, turns: 0, triplesHit: 0, doublesHit: 0, bestTurnMarks: 0, bullHits: 0, doubleBullHits: 0 }
  })

  // Zum richtigen Leg navigieren
  let currentLeg = 0
  for (const ev of events) {
    if (ev.type === 'CricketLegFinished') {
      currentLeg++
      // Nach unserem Leg aufhören
      if (currentLeg > legIndex) break
      // Marks für neues Leg zurücksetzen
      allPlayerIds.forEach(pid => {
        validTargets.forEach(t => { marksByPlayer[pid][t] = 0 })
      })
      continue
    }

    if (ev.type !== 'CricketTurnAdded' || currentLeg !== legIndex) continue

    const turn = ev as CricketTurnAdded
    const pid = turn.playerId
    if (!marksByPlayer[pid]) { marksByPlayer[pid] = {}; validTargets.forEach(t => { marksByPlayer[pid][t] = 0 }) }
    if (!stats[pid]) { stats[pid] = { totalMarks: 0, totalPoints: 0, turns: 0, triplesHit: 0, doublesHit: 0, bestTurnMarks: 0, bullHits: 0, doubleBullHits: 0 } }
    const ps = stats[pid]
    ps.turns++

    let turnMarks = 0

    for (const d of turn.darts) {
      if (d.target === 'MISS') continue
      const tKey = String(d.target)
      if (!validTargets.has(tKey)) continue

      const before = marksByPlayer[pid][tKey] ?? 0
      if (before >= 3) continue // schon geschlossen

      const mult = d.target === 'BULL' && d.mult === 3 ? 2 : d.mult
      const added = Math.min(mult, 3 - before)
      marksByPlayer[pid][tKey] = before + added
      turnMarks += added
      ps.totalMarks += added

      if (d.mult === 3) ps.triplesHit++
      if (d.mult === 2) ps.doublesHit++

      // Bull-Treffer zählen
      if (d.target === 'BULL') {
        if (d.mult === 2 || d.mult === 3) {
          ps.doubleBullHits++
        } else {
          ps.bullHits++
        }
      }
    }

    if (turnMarks > ps.bestTurnMarks) ps.bestTurnMarks = turnMarks
  }

  // MPT berechnen
  const result: Record<string, {
    totalMarks: number
    totalPoints: number
    turns: number
    marksPerTurn: number
    triplesHit: number
    doublesHit: number
    bestTurnMarks: number
    bullHits: number
    doubleBullHits: number
  }> = {}
  for (const pid of allPlayerIds) {
    const s = stats[pid]
    result[pid] = {
      ...s,
      marksPerTurn: s.turns > 0 ? s.totalMarks / s.turns : 0,
    }
  }
  return result
}

/* ===========================
   Hauptkomponente
=========================== */
export default function GameCricket({ matchId, onExit, onShowCricketSummary, multiplayer }: Props) {
  useDisableScale()
  // Globales Theme System
  const { isArcade, colors } = useTheme()

  // View-Toggle: 'auto' (theme-based), 'table', or 'arcade'
  const [cricketViewMode, setCricketViewMode] = useState<'auto' | 'table' | 'arcade'>('auto')
  const showArcadeView = cricketViewMode === 'arcade'

  // --- Pause-Modus ---
  const [gamePaused, setGamePaused] = useState(() => isMatchPaused(matchId, 'cricket'))

  // Beim Fortsetzen (Pause beenden) den Pause-Status löschen
  useEffect(() => {
    if (!gamePaused) {
      clearMatchPaused(matchId, 'cricket')
    }
  }, [gamePaused, matchId])

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

  // --- Sprachausgabe ---
  const [speechEnabled, setSpeechEnabledState] = useState(true)

  const [matchStored, setMatchStored] = useState(() => loadCricketById(matchId))
  const [events, setEvents] = useState<CricketEvent[]>(
    () => (matchStored?.events ?? []) as CricketEvent[]
  )

  // Retry loading match if not found yet (multiplayer: match created by host, may not be in cache yet)
  useEffect(() => {
    if (matchStored) return
    const timer = setInterval(() => {
      const found = loadCricketById(matchId)
      if (found) {
        setMatchStored(found)
        setEvents(found.events as CricketEvent[])
        clearInterval(timer)
      }
    }, 500)
    return () => clearInterval(timer)
  }, [matchId, matchStored])

  const baseState = useMemo(() => applyCricketEvents(events), [events])

  // Multiplayer: Remote-Events synchronisieren
  const prevRemoteCricketRef = useRef<any[] | null>(null)
  useEffect(() => {
    if (!multiplayer?.remoteEvents) return
    if (multiplayer.remoteEvents === prevRemoteCricketRef.current) return

    // Read previous state BEFORE updating the ref
    const prevEvents = prevRemoteCricketRef.current as any[] | null
    const prevLen = prevEvents?.length ?? 0

    // Update ref and local state
    prevRemoteCricketRef.current = multiplayer.remoteEvents
    const remote = multiplayer.remoteEvents as CricketEvent[]
    setEvents(remote)

    // Skip diff logic on initial load or reconnect sync (same length = no new events)
    const isInitialSync = !prevEvents
    const isSameLength = prevLen === remote.length
    if (isInitialSync || isSameLength) {
      // Still ensure match exists on initial sync
      if (isInitialSync && remote.length > 0) {
        const startEvt = remote.find((e: any) => e.type === 'CricketMatchStarted') as any
        if (startEvt) {
          ensureCricketMatchExists(matchId, remote, startEvt.players?.map((p: any) => p.playerId) ?? [])
        }
      }
      return
    }

    // Ensure match exists locally for guest (incremental update from 0 events)
    if (prevLen === 0 && remote.length > 0) {
      const startEvt = remote.find((e: any) => e.type === 'CricketMatchStarted') as any
      if (startEvt) {
        ensureCricketMatchExists(matchId, remote, startEvt.players?.map((p: any) => p.playerId) ?? [])
      }
    }

    // Announce newly closed fields on ALL devices
    if (prevLen > 0 && remote.length > prevLen) {
      const prevState = applyCricketEvents(prevEvents as CricketEvent[])
      const newState = applyCricketEvents(remote)
      const tKeys = (newState.match?.range === 'short')
        ? ['15', '16', '17', '18', '19', '20', 'BULL']
        : ['10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20', 'BULL']
      const players = newState.players ?? []
      const closed: string[] = tKeys.filter(tKey => {
        const wasClosed = players.every(pid => (prevState.marksByPlayer[pid]?.[tKey] ?? 0) >= 3)
        const isClosed = players.every(pid => (newState.marksByPlayer[pid]?.[tKey] ?? 0) >= 3)
        return !wasClosed && isClosed
      })
      closed.forEach((target, i) => {
        setTimeout(() => announceClosed(target), 400 + i * 1200)
      })
    }

    // Detect CricketMatchFinished: check if it's NEW (not in previous batch)
    // Uses diff-check like X01 — searches anywhere in array, not just lastEvt
    const cricketMatchFinishedEvt = remote.find((e: any) => e.type === 'CricketMatchFinished')
    const prevHadCricketFinished = prevEvents
      ? prevEvents.some((e: any) => e.type === 'CricketMatchFinished')
      : false
    if (cricketMatchFinishedEvt && !prevHadCricketFinished) {
      const startEvtForFinish = remote.find((e: any) => e.type === 'CricketMatchStarted') as any
      const playerIds = startEvtForFinish?.players?.map((p: any) => p.playerId) ?? []
      if (multiplayer?.isHost) {
        // Host persists immediately
        ;(async () => {
          await ensureCricketMatchExistsAsync(matchId, remote, playerIds)
          try { await persistCricketEvents(matchId, remote) } catch {}
          await finishCricketMatch(matchId)
          if (onShowCricketSummary) setTimeout(() => onShowCricketSummary(matchId), 2000)
        })()
      } else {
        // Guest: persist as backup after 5s (in case host disconnected before saving)
        setTimeout(async () => {
          try {
            // Skip if host already saved
            if (await isMatchFinishedInDB('cricket_matches', matchId)) return
            await ensureCricketMatchExistsAsync(matchId, remote, playerIds)
            await persistCricketEvents(matchId, remote)
            await finishCricketMatch(matchId)
          } catch {}
        }, 5000)
        if (onShowCricketSummary) setTimeout(() => onShowCricketSummary(matchId), 2000)
      }
    }
  }, [multiplayer?.remoteEvents]) // eslint-disable-line react-hooks/exhaustive-deps

  const matchNotReady = !matchStored || !baseState.match

  const storedId = matchStored?.id ?? matchId
  const match = baseState.match ?? {
    matchId, players: [] as { playerId: string; name: string }[], range: 'short' as const,
    style: 'standard' as const, crazyMode: undefined as any, crazySameForAll: undefined as any,
    crazySalt: undefined as any, crazyWithPoints: undefined as any, cutthroatEndgame: undefined as any,
  } as NonNullable<typeof baseState.match>
  const order = baseState.players?.length > 0 ? baseState.players : [] as string[]
  const activeId = (baseState.match ? currentPlayerId(baseState) : null) ?? order[0] ?? ''

  // Multiplayer: Ist der lokale Spieler gerade am Zug?
  const cricketLocalIds = multiplayer?.localPlayerIds ?? (multiplayer?.myPlayerId ? [multiplayer.myPlayerId] : [])
  const isMyTurn = !multiplayer?.enabled || cricketLocalIds.includes(activeId)

  // Spielerfarben aus Profilen holen
  const profiles = useMemo(() => getProfiles(), [])
  const playerChartColors = useMemo(() => {
    return order.map((pid, i) => {
      const profile = profiles.find(p => p.id === pid)
      return profile?.color ?? PLAYER_COLORS[i % PLAYER_COLORS.length]
    })
  }, [order, profiles])

  // Spielerfarben-Hintergrund Einstellung
  const playerColorBgEnabled = getPlayerColorBackgroundEnabled()
  const activePlayerIndex = order.indexOf(activeId)
  const activePlayerColor = playerChartColors[activePlayerIndex] ?? '#f97316'

  // Targets für diese Cricket-Variante
  const matchRange = match?.range ?? 'short'
  const targetList: (number | 'BULL' | 'MISS')[] = [
    ...(matchRange === 'short'
      ? [20, 19, 18, 17, 16, 15]
      : [20, 19, 18, 17, 16, 15, 14, 13, 12, 11, 10]),
    'BULL',
    'MISS',
  ]

  // Valid Targets für Marks-Berechnung (ohne MISS)
  const validTargets = matchRange === 'short'
    ? ['15', '16', '17', '18', '19', '20', 'BULL']
    : ['10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20', 'BULL']

  // Serien-Kontext (First to X etc.)
  const legCtx = currentLegContext(baseState)
  const winsArray = Object.values(legCtx.legWinsByPlayer) as number[]
  const leaderWins = winsArray.length ? Math.max(...winsArray) : 0
  const targetWins = legCtx.targetWins
  const starterBadge =
    match.players[legCtx.currentStarterIndex]?.name ?? `P${legCtx.currentStarterIndex + 1}`

  // Input-Status
  const [mult, setMultState] = useState<1 | 2 | 3>(1)
  const multRef = useRef<1 | 2 | 3>(1)
  const setMult = (m: 1 | 2 | 3) => { multRef.current = m; setMultState(m) }
  const [turn, setTurn] = useState<CricketTurnDart[]>([])
  const [saving, setSaving] = useState(false)

  // Turn-History: Letzte Turns + Live-Turn
  const turnListScrollRef = useRef<HTMLDivElement | null>(null)

  const recentTurns = useMemo((): CricketTurnEntry[] => {
    const result: CricketTurnEntry[] = []

    // 1. Live-Turn (aktueller Spieler, noch nicht bestätigt)
    if (turn.length > 0) {
      const activeName = match.players.find(p => p.playerId === activeId)?.name ?? activeId
      const activeColor = playerChartColors[order.indexOf(activeId)]

      // Marks-State vor diesem Turn
      const marksBefore = baseState.marksByPlayer[activeId] ?? {}
      const { marksAdded, marksDetail, closedFields } = computeMarksDetail(turn, marksBefore, validTargets)

      result.push({
        playerName: activeName,
        playerColor: activeColor,
        darts: turn.map(d => formatDartLabel(d)),
        marksAdded,
        marksDetail,
        closedFields,
        isLive: true,
      })
    }

    // 2. Letzte Turn-Events (max 8 insgesamt)
    const turnEvents = events.filter(e => e.type === 'CricketTurnAdded') as CricketTurnAdded[]

    // Marks-State rekonstruieren für jedes Event
    const marksByPlayerAtTurn: Record<string, Record<string, number>>[] = []
    const tempMarks: Record<string, Record<string, number>> = {}
    order.forEach(pid => {
      tempMarks[pid] = {}
      validTargets.forEach(t => { tempMarks[pid][t] = 0 })
    })

    for (const ev of events) {
      if (ev.type === 'CricketLegFinished') {
        // Reset bei neuem Leg
        order.forEach(pid => {
          validTargets.forEach(t => { tempMarks[pid][t] = 0 })
        })
        continue
      }
      if (ev.type === 'CricketTurnAdded') {
        // Marks VOR diesem Turn speichern
        marksByPlayerAtTurn.push(JSON.parse(JSON.stringify(tempMarks)))

        // Marks aktualisieren
        const t = ev as CricketTurnAdded
        for (const d of t.darts) {
          if (d.target === 'MISS') continue
          const tKey = String(d.target)
          if (!validTargets.includes(tKey)) continue
          if (!tempMarks[t.playerId]) tempMarks[t.playerId] = {}
          const before = tempMarks[t.playerId][tKey] ?? 0
          if (before >= 3) continue
          const m = d.target === 'BULL' && d.mult === 3 ? 2 : d.mult
          tempMarks[t.playerId][tKey] = Math.min(3, before + m)
        }
      }
    }

    // Letzte 8 Turns (minus Live)
    const maxToShow = 8 - result.length
    const lastTurns = turnEvents.slice(-maxToShow).reverse()

    for (let i = 0; i < lastTurns.length && result.length < 8; i++) {
      const ev = lastTurns[i]
      const evIdx = turnEvents.length - (lastTurns.length - i)
      const marksBefore = marksByPlayerAtTurn[evIdx] ?? {}

      const playerName = match.players.find(p => p.playerId === ev.playerId)?.name ?? ev.playerId
      const playerColor = playerChartColors[order.indexOf(ev.playerId)]
      const { marksAdded, marksDetail, closedFields } = computeMarksDetail(
        ev.darts,
        marksBefore[ev.playerId] ?? {},
        validTargets
      )

      result.push({
        playerName,
        playerColor,
        darts: ev.darts.map(d => formatDartLabel(d)),
        marksAdded,
        marksDetail,
        closedFields,
        isLive: false,
      })
    }

    return result
  }, [events, turn, activeId, order, match, baseState, playerChartColors, validTargets])

  // Auto-Scroll bei neuem Dart
  useEffect(() => {
    if (turn.length > 0 && turnListScrollRef.current) {
      turnListScrollRef.current.scrollTop = 0
    }
  }, [turn.length])

  // Leg-Summary-State: zeigt nach Leg-Ende eine Zusammenfassung
  const [legSummary, setLegSummary] = useState<{
    legIndex: number
    winnerId: string
    winnerName: string
    legStats: Record<string, {
      totalMarks: number
      totalPoints: number
      turns: number
      marksPerTurn: number
      triplesHit: number
      doublesHit: number
      bestTurnMarks: number
      bullHits: number
      doubleBullHits: number
    }>
    legWinsAfter: Record<string, number>
    legDuration: string // Format: "MM:SS"
  } | null>(null)

  // Chart-Tab im Leg Summary (Marks-Verlauf vs Feldfortschritt)
  const [chartTab, setChartTab] = useState<'marks' | 'fields'>('marks')

  // NEU: Eingabe-Lock (Debounce) gegen Doppel-Adds
  const inputLockRef = useRef(false)
  // Lock nach Turn-Bestätigung um Übernahme zum nächsten Spieler zu verhindern
  const turnLockRef = useRef(false)

  // Preview-State
  const tempTurnEv = useMemo(() => {
    if (turn.length === 0) return undefined
    const { event: tempTurn } = recordCricketTurn({
      state: baseState,
      playerId: activeId,
      darts: turn,
    })
    return tempTurn
  }, [baseState, activeId, turn])

  const previewState = useMemo(
    () => (tempTurnEv ? applyCricketEvents([...events, tempTurnEv]) : baseState),
    [events, baseState, tempTurnEv]
  )

  // Tallies (Overflow)
  const baseTallies = useMemo(() => buildPerTargetTallies(events, match), [events, match])
  const previewTallies = useMemo(
    () => buildPerTargetTallies(events, match, tempTurnEv),
    [events, match, tempTurnEv]
  )

  // Wenn letztes Event ein LegFinish war (und kein Preview aktiv), zeigen wir Marks=0
  const legJustFinished =
    events.length > 0 && events[events.length - 1].type === 'CricketLegFinished' && !tempTurnEv

  // Anzeige-Helfer
  const scoreOf = (pid: string) => previewState.pointsByPlayer[pid] ?? 0
  const markOf = (pid: string, tKey: string) =>
    (previewState.marksByPlayer[pid]?.[tKey] ?? 0) as 0 | 1 | 2 | 3
  const baseMarkOf = (pid: string, tKey: string) =>
    (baseState.marksByPlayer[pid]?.[tKey] ?? 0) as 0 | 1 | 2 | 3

  // global geschlossen?
  function isClosedForAll(tKey: string) {
    return order.every(pid => (previewState.marksByPlayer[pid]?.[tKey] ?? 0) >= 3)
  }

  // Hinweis bei letztem offenen Feld oder alle geschlossen
  const lastFieldHint = useMemo(() => {
    // Skip bei Simple-Mode (keine Punkte)
    if (match.style === 'simple') return null
    // Skip bei Crazy (zu komplex)
    if (match.style === 'crazy') return null

    const scoringTargets = targetList.filter(t => t !== 'MISS').map(String)
    const openFields = scoringTargets.filter(tKey => !isClosedForAll(tKey))

    // Alle Felder geschlossen?
    if (openFields.length === 0) {
      // Punkte-Modus: Zeige was jeder treffen muss
      // Finde Felder wo der jeweilige Spieler noch Punkte machen kann
      const hints: { playerId: string; name: string; canScore: string[] }[] = []

      for (const pid of order) {
        const canScoreOn: string[] = []
        for (const tKey of scoringTargets) {
          const myMarks = previewState.marksByPlayer[pid]?.[tKey] ?? 0
          // Kann Punkte machen wenn ICH geschlossen habe aber andere nicht
          if (myMarks >= 3) {
            const othersOpen = order.some(
              otherPid => otherPid !== pid && (previewState.marksByPlayer[otherPid]?.[tKey] ?? 0) < 3
            )
            if (othersOpen) canScoreOn.push(tKey)
          }
        }
        const player = match.players.find(p => p.playerId === pid)
        hints.push({ playerId: pid, name: player?.name ?? pid, canScore: canScoreOn })
      }

      // Nur anzeigen wenn jemand noch punkten kann
      if (hints.some(h => h.canScore.length > 0)) {
        return { type: 'allClosed' as const, hints }
      }
      return null
    }

    // Genau ein Feld offen?
    if (openFields.length === 1) {
      const lastField = openFields[0]
      const hitsNeeded: { playerId: string; name: string; needed: number }[] = []

      for (const pid of order) {
        const marks = previewState.marksByPlayer[pid]?.[lastField] ?? 0
        const needed = Math.max(0, 3 - marks)
        const player = match.players.find(p => p.playerId === pid)
        hitsNeeded.push({ playerId: pid, name: player?.name ?? pid, needed })
      }

      return { type: 'lastField' as const, field: lastField, hitsNeeded }
    }

    return null
  }, [match.style, targetList, order, previewState.marksByPlayer, match.players])

  // Crazy Cricket: Berechne aktive Zielzahlen für den aktuellen Turn
  const crazyTargets = useMemo(() => {
    if (match.style !== 'crazy' || !match.crazyMode) return undefined

    // crazySameForAll: Alle Spieler haben dieselbe Zielzahl pro Runde
    const sameForAll = match.crazySameForAll ?? true // Default: gleich für alle

    // WICHTIG: Gleiche Reihenfolge wie in der Engine (aufsteigend + BULL am Ende)
    const engineOrder = match.range === 'short'
      ? ['15', '16', '17', '18', '19', '20', 'BULL']
      : ['10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20', 'BULL']

    // Verfügbare Zahlen:
    // - Bei sameForAll: Nur global offene Zahlen
    // - Bei !sameForAll: Zusätzlich muss der aktive Spieler sie noch offen haben
    const availableTargets = sameForAll
      ? engineOrder.filter(t => order.some(p => (baseState.marksByPlayer[p]?.[t] ?? 0) < 3))
      : engineOrder.filter(t =>
          order.some(p => (baseState.marksByPlayer[p]?.[t] ?? 0) < 3) && // global offen
          (baseState.marksByPlayer[activeId]?.[t] ?? 0) < 3 // aktiver Spieler hat noch nicht geschlossen
        )

    if (availableTargets.length === 0) return []

    // Einfache Hash-Funktion für Seed
    const hashString = (str: string): number => {
      let hash = 0
      for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i)
        hash = ((hash << 5) - hash) + char
        hash = hash & hash
      }
      return Math.abs(hash)
    }

    // Deterministischer Random
    const seededRandom = (seed: number) => {
      return () => {
        let t = seed += 0x6D2B79F5
        t = Math.imul(t ^ t >>> 15, t | 1)
        t ^= t + Math.imul(t ^ t >>> 7, t | 61)
        return ((t ^ t >>> 14) >>> 0) / 4294967296
      }
    }

    // turnIndex = Anzahl bereits gespielter Turns im AKTUELLEN Leg (nach letztem LegFinished)
    let turnIndex = 0
    for (let i = events.length - 1; i >= 0; i--) {
      const ev = events[i]
      if (ev.type === 'CricketLegFinished') break
      if (ev.type === 'CricketTurnAdded') turnIndex++
    }

    // Bei sameForAll: Seed basiert auf Spielrunde (turnIndex / Spielerzahl)
    // Bei !sameForAll: Seed basiert auf turnIndex (jeder Turn hat eigene Zahl)
    const seedNumber = sameForAll
      ? Math.floor(turnIndex / order.length)
      : turnIndex

    // Salt für echten Zufall (beim Match-Start generiert), Fallback auf matchId-Hash
    const salt = match.crazySalt ?? hashString(match.matchId)
    const seed = salt + seedNumber * 7919 // 7919 ist eine Primzahl für gute Verteilung
    const random = seededRandom(seed)

    const count = match.crazyMode === 'pro' ? 3 : 1
    const targets: string[] = []
    for (let i = 0; i < count; i++) {
      const idx = Math.floor(random() * availableTargets.length)
      targets.push(availableTargets[idx])
    }

    return targets
  }, [match.style, match.crazyMode, match.crazySameForAll, match.crazySalt, match.matchId, events, baseState.marksByPlayer, order, activeId])

  // Aktuelles aktives Ziel (bei Pro: je nach Dart-Index, bei Normal: immer das erste)
  const currentActiveTarget = useMemo(() => {
    if (!crazyTargets || crazyTargets.length === 0) return undefined
    const dartIndex = Math.min(turn.length, crazyTargets.length - 1)
    return crazyTargets[dartIndex]
  }, [crazyTargets, turn.length])

  // --- Sprachausgabe initialisieren ---
  useEffect(() => {
    initSpeech()
  }, [])

  // Initiale Ansage beim Spielstart (einmalig)
  const initialAnnounceDone = useRef(false)
  useEffect(() => {
    if (initialAnnounceDone.current) return
    initialAnnounceDone.current = true

    // "[Name], throw first! Game on!" Ansage
    const firstPlayer = match.players.find(p => p.playerId === activeId)
    setTimeout(() => {
      announceGameStart(firstPlayer?.name ?? activeId)
    }, 300)

    // Crazy-Target-Ansage (falls vorhanden)
    if (crazyTargets && crazyTargets.length > 0) {
      const activePlayer = match.players.find(p => p.playerId === activeId)
      setTimeout(() => {
        announceCrazyPlayerTarget(activePlayer?.name ?? activeId, crazyTargets)
      }, 1200)
    }
  }, [crazyTargets, activeId, match.players])

  // Announce when a local player's turn starts (multiplayer)
  const prevActiveCricketRef = useRef<string | null>(null)
  useEffect(() => {
    if (!multiplayer?.enabled) return
    if (!activeId || activeId === prevActiveCricketRef.current) return
    prevActiveCricketRef.current = activeId
    const localIds = multiplayer.localPlayerIds ?? (multiplayer.myPlayerId ? [multiplayer.myPlayerId] : [])
    if (localIds.includes(activeId)) {
      const player = match.players.find(p => p.playerId === activeId)
      const pName = player?.name
      if (pName) debouncedAnnounce(() => announceNextPlayer(pName))
    }
  }, [activeId, multiplayer?.enabled]) // eslint-disable-line react-hooks/exhaustive-deps

  // ===== Keyboard Shortcuts =====
  // Ensure keyboard focus — blur any focused button/input so keydown reaches window
  const cricketContainerRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!multiplayer?.enabled || isMyTurn) {
      // Remove focus from any button/input that might be capturing keystrokes
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
    }
  }, [activeId, matchNotReady]) // eslint-disable-line react-hooks/exhaustive-deps

  const currentActiveTargetRef = useRef(currentActiveTarget)
  currentActiveTargetRef.current = currentActiveTarget
  const numBuf = useRef('')
  const numBufTimer = useRef<number | null>(null)
  const clearNumBufLater = () => {
    if (numBufTimer.current) window.clearTimeout(numBufTimer.current)
    numBufTimer.current = window.setTimeout(() => {
      numBuf.current = ''
    }, 700) as unknown as number
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Key-Repeat ignorieren (außer für Backspace)
      if (e.repeat && e.key !== 'Backspace') return

      // P = Pause umschalten
      if (e.key === 'p' || e.key === 'P') {
        setGamePaused(p => !p)
        return
      }

      // Pause aktiv? Keine anderen Eingaben
      if (gamePaused) return

      // Turn-Lock aktiv? Dann alle Eingaben ignorieren
      if (turnLockRef.current) return

      const k = e.key

      if (k === 's' || k === 'S') setMult(1)
      if (k === 'd' || k === 'D') setMult(2)
      if (k === 't' || k === 'T') setMult(3)

      if (k === 'm' || k === 'M') addTarget('MISS')
      if (k === 'b' || k === 'B') addTarget('BULL')

      // Leertaste: Treffer auf das aktuelle Crazy-Target
      if (k === ' ' && match.style === 'crazy' && currentActiveTargetRef.current) {
        e.preventDefault()
        const ct = currentActiveTargetRef.current
        const t = ct === 'BULL' ? 'BULL' : parseInt(ct, 10)
        addTarget(t as any)
        return
      }

      if (k >= '0' && k <= '9') {
        if (numBuf.current === '') {
          if (k === '0') {
            addTarget('MISS')
          } else if (k === '1' || k === '2') {
            numBuf.current = k
            clearNumBufLater()
          }
        } else if (numBuf.current === '1') {
          const n = parseInt('1' + k, 10)
          if (n >= 10 && n <= 19) addTarget(n as any)
          numBuf.current = ''
          if (numBufTimer.current) window.clearTimeout(numBufTimer.current)
        } else if (numBuf.current === '2') {
          if (k === '0') addTarget(20)
          numBuf.current = ''
          if (numBufTimer.current) window.clearTimeout(numBufTimer.current)
        }
      }

      if (e.key === 'Enter') {
        // Leere Eingabe = 3 Fehlwürfe, sonst Turn bestätigen (mit Auto-Fill)
        confirmTurn()
      }
      if (e.key === 'Backspace') setTurn(t => t.slice(0, -1))
      if (e.key === 'Escape') { setTurn([]); setMult(1) }
      if ((e.ctrlKey || e.metaKey) && (k === 'z' || k === 'Z')) {
        e.preventDefault()
        undoLastTurn()
      }

    }

    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      if (numBufTimer.current) window.clearTimeout(numBufTimer.current)
    }
  }, [turn, gamePaused])

  // ===== Layout Konstanten =====
  // Responsive widths based on screen size and player count
  const [screenWidth, setScreenWidth] = useState(() => typeof window !== 'undefined' ? window.innerWidth : 800)
  const [isLandscape, setIsLandscape] = useState(() => typeof window !== 'undefined' && window.innerWidth > window.innerHeight)
  useEffect(() => {
    const update = () => {
      setScreenWidth(window.innerWidth)
      setIsLandscape(window.innerWidth > window.innerHeight)
    }
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])
  const screenHeight = typeof window !== 'undefined' ? window.innerHeight : 800
  const isMobileScreen = Math.min(screenWidth, screenHeight) < 600
  const isTabletScreen = !isMobileScreen && screenWidth <= 1200
  const isMobileLandscape = isLandscape && Math.min(screenWidth, screenHeight) < 600
  const playerCount = order.length

  const isLongRange = matchRange === 'long'
  const targetCount = isLongRange ? 13 : 8 // 10-20+Bull+Miss vs 15-20+Bull+Miss
  const ROW_H = isMobileScreen ? (isLongRange ? 16 : 26) : isTabletScreen ? (isLongRange ? 22 : 30) : 32
  const headerBarHeight = isMobileScreen ? (isLongRange ? 18 : 22) : isTabletScreen ? 26 : 28

  // Responsive column widths
  const mobileCricketWidth = playerCount <= 2 ? 80 : playerCount <= 4 ? 55 : playerCount <= 6 ? 38 : 28
  const CRICKET_CARD_WIDTH_MIN = isMobileScreen ? mobileCricketWidth : isTabletScreen ? 140 : 220
  const CRICKET_CARD_WIDTH_MAX = isMobileScreen ? mobileCricketWidth : isTabletScreen ? 180 : 260
  const mobilePlayersOnScreen = Math.min(playerCount, 4)
  const mobileGaps = (mobilePlayersOnScreen + 1) * 4 // gaps between columns
  const PLAYER_CARD_WIDTH = isMobileScreen
    ? Math.max(40, Math.floor((screenWidth - mobileCricketWidth - mobileGaps - 16) / mobilePlayersOnScreen))
    : 140
  const useCompactWidth = isMobileScreen && playerCount <= 4

  function playerCardStyle(active: boolean, playerColor?: string): React.CSSProperties {
    const color = playerColor || '#f97316'
    // ≤4 Spieler Mobile: minimaler Rahmen, kein Padding
    if (useCompactWidth) {
      return {
        border: active ? `2px solid ${color}` : 'none',
        background: active ? `${color}08` : 'transparent',
        borderRadius: 4,
        position: 'relative',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        padding: 0,
        boxSizing: 'border-box',
      }
    }
    return {
      border: active ? `2px solid ${color}` : '1px solid #e5e7eb',
      background: active ? `${color}10` : '#fff',
      borderRadius: isMobileScreen ? 8 : 12,
      position: 'relative',
      overflow: 'hidden',
      width: isMobileScreen ? '100%' : PLAYER_CARD_WIDTH,
      minWidth: isMobileScreen ? 0 : PLAYER_CARD_WIDTH,
      maxWidth: isMobileScreen ? undefined : PLAYER_CARD_WIDTH,
      display: 'flex',
      flexDirection: 'column',
      padding: isMobileScreen ? 1 : 10,
      paddingTop: isMobileScreen ? 1 : 10,
      boxShadow: active ? `0 0 20px ${color}50, 0 0 40px ${color}30` : 'none',
      transition: 'box-shadow 0.3s ease, border-color 0.3s ease, background 0.3s ease',
      boxSizing: 'border-box',
    }
  }

  const cricketCardStyle: React.CSSProperties = {
    border: useCompactWidth ? 'none' : '1px solid #e5e7eb',
    background: useCompactWidth ? 'transparent' : '#fff',
    borderRadius: isMobileScreen ? 8 : 12,
    position: 'relative',
    overflow: 'hidden',
    minWidth: isMobileScreen ? 0 : CRICKET_CARD_WIDTH_MIN,
    maxWidth: isMobileScreen ? undefined : CRICKET_CARD_WIDTH_MAX,
    width: isMobileScreen ? '100%' : CRICKET_CARD_WIDTH_MAX,
    display: 'flex',
    flexDirection: 'column',
    padding: useCompactWidth ? 0 : (isMobileScreen ? 1 : 10),
    paddingTop: isMobileScreen ? 1 : 10,
  }

  function PlayerHeader({
    name,
    score,
    side,
    hideScore,
  }: {
    name: string
    score: number
    side: 'left' | 'right'
    hideScore?: boolean
  }) {
    const textAlign = side === 'left' ? 'right' : 'left'
    const fontSize = isMobileScreen ? 11 : 14

    // Mobile: vertical name, fixed height, aligned to bottom
    if (isMobileScreen) {
      // ≤4 Spieler: horizontaler Name über den Marks
      if (playerCount <= 4) {
        return (
          <div style={{
            textAlign: 'center', marginBottom: 2, height: 14,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <span style={{
              fontSize: 7, fontWeight: 700,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>{name}</span>
          </div>
        )
      }
      // 5+ Spieler: vertikaler Name
      const nameHeight = isLongRange ? 35 : 45
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          marginBottom: 2, height: nameHeight, justifyContent: 'flex-end',
        }}>
          <span style={{
            writingMode: 'vertical-rl', textOrientation: 'mixed',
            fontSize: isLongRange ? 7 : 8, fontWeight: 700, maxHeight: nameHeight - 3,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            transform: 'rotate(180deg)',
          }}>{name}</span>
        </div>
      )
    }

    return (
      <div
        style={{
          minHeight: headerBarHeight,
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'baseline',
          justifyContent: side === 'left' ? 'flex-end' : 'flex-start',
          fontWeight: 700,
          fontSize,
          lineHeight: `${headerBarHeight}px`,
          marginBottom: 6,
          textAlign,
          width: '100%',
          gap: 8,
        }}
      >
        <span
          style={{
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            flexShrink: 1,
            fontWeight: 700,
            fontSize,
            lineHeight: `${headerBarHeight}px`,
          }}
        >
          {name}
        </span>
        {!hideScore && (
          <span
            style={{
              fontSize: 12,
              opacity: 0.7,
              marginTop: 4,
              lineHeight: `${headerBarHeight}px`,
              whiteSpace: 'nowrap',
            }}
          >
            Score: {score}
          </span>
        )}
      </div>
    )
  }

  function PlayerRows({ pid, side }: { pid: string; side: 'left' | 'right' }) {
    const alignTallies: 'left' | 'right' = side === 'left' ? 'right' : 'left'
    const crazyScoringMode = (match as any).crazyScoringMode ?? ((match as any).crazyWithPoints ? 'standard' : 'simple')
    const isSimple = match.style === 'simple' || (match.style === 'crazy' && crazyScoringMode === 'simple')

    // Anzeige-Helper für Marks (nach Leg-Ende 0 anzeigen)
    const displayMarkOf = (playerId: string, key: string): 0 | 1 | 2 | 3 => {
      if (legJustFinished) return 0
      return (previewState.marksByPlayer[playerId]?.[key] ?? 0) as 0 | 1 | 2 | 3
    }

    return (
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: isSimple
            ? (isMobileScreen ? (playerCount > 6 ? '12px' : '14px') : '18px')
            : side === 'left' ? `1fr ${isMobileScreen ? (playerCount > 6 ? '12px' : '14px') : '18px'}` : `${isMobileScreen ? (playerCount > 6 ? '12px' : '14px') : '18px'} 1fr`,
          gridTemplateRows: `repeat(${targetList.length}, ${ROW_H}px)`,
          alignItems: 'center',
          justifyContent: isSimple ? (side === 'left' ? 'flex-end' : 'flex-start') : undefined,
          rowGap: isMobileScreen ? 2 : 4,
          columnGap: isMobileScreen ? 2 : 8,
          textAlign: alignTallies === 'right' ? 'right' : 'left',
        }}
      >
        {targetList.map(t => {
          const tKey = String(t)

          // MISS row: show score instead of marks/tally
          if (t === 'MISS' && !isSimple) {
            return (
              <div
                key={pid + '-score'}
                style={{
                  gridColumn: '1 / -1',
                  fontWeight: 800,
                  fontSize: isMobileScreen ? (isLongRange ? 12 : 16) : 20,
                  color: playerChartColors[order.indexOf(pid)] ?? '#f97316',
                  textAlign: side === 'left' ? 'right' : 'left',
                  lineHeight: `${ROW_H}px`,
                }}
              >
                {scoreOf(pid)}
              </div>
            )
          }

          const mv = displayMarkOf(pid, tKey)
          const mvBase = baseMarkOf(pid, tKey)
          const isPreview = mv > mvBase

          const markNode = (
            <div
              key={tKey + '-mark'}
              style={{
                display: 'flex',
                justifyContent: side === 'left' ? 'flex-end' : 'flex-start',
              }}
            >
              <MarkSVG value={mv} preview={isPreview} />
            </div>
          )

          // Simple: nur Marks anzeigen (keine Tally/Punkte)
          if (isSimple) {
            return <React.Fragment key={pid + '-' + tKey}>{markNode}</React.Fragment>
          }

          const tallyBase = baseTallies[pid]?.[tKey] ?? 0
          const tallyPrev = previewTallies[pid]?.[tKey] ?? 0
          const previewInc = tallyPrev > tallyBase

          const tallyNode = (
            <Tally
              key={tKey + '-tally'}
              count={tallyPrev}
              align={alignTallies}
              previewIncrease={previewInc}
            />
          )

          return side === 'left' ? (
            <React.Fragment key={pid + '-' + tKey}>
              {tallyNode}
              {markNode}
            </React.Fragment>
          ) : (
            <React.Fragment key={pid + '-' + tKey}>
              {markNode}
              {tallyNode}
            </React.Fragment>
          )
        })}
      </div>
    )
  }

  function renderPlayerCard(pid: string, side: 'left' | 'right') {
    const p = match.players.find(x => x.playerId === pid)
    const score = scoreOf(pid)
    const isActive = pid === activeId
    const playerIndex = order.indexOf(pid)
    const playerColor = playerChartColors[playerIndex] ?? '#f97316'

    const isSimpleStyle = match.style === 'simple' || (match.style === 'crazy' && ((match as any).crazyScoringMode ?? ((match as any).crazyWithPoints ? 'standard' : 'simple')) === 'simple')

    return (
      <div style={playerCardStyle(isActive, playerColor)}>
        <PlayerHeader name={p?.name ?? pid} score={score} side={side} hideScore={!isSimpleStyle} />
        <PlayerRows pid={pid} side={side} />
      </div>
    )
  }

  function renderCricketColumn() {
    return (
      <div style={cricketCardStyle}>
        {/* Cricket Header */}
        <div
          style={{
            minHeight: headerBarHeight,
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'center',
            fontWeight: 700,
            fontSize: 14,
            lineHeight: `${headerBarHeight}px`,
            marginBottom: 6,
            textAlign: 'center',
            width: '100%',
            gap: 8,
            flexWrap: 'wrap',
          }}
        >
          {!isMobileScreen && <span>Cricket</span>}
          {!isMobileScreen && <span
            style={{
              fontSize: 12,
              opacity: 0.7,
              marginTop: 4,
              whiteSpace: 'nowrap',
            }}
          >
            {match.range === 'short' ? '15–20, Bull' : '10–20, Bull'}
          </span>}
        </div>

        {/* Target Buttons */}
        <div
          style={{
            display: 'grid',
            gridTemplateRows: `repeat(${targetList.length}, ${ROW_H}px)`,
            rowGap: isMobileScreen ? 2 : 4,
          }}
        >
          {targetList.map(t => {
            const tKey = String(t)
            const closedAll = t !== 'MISS' && isClosedForAll(tKey)
            // Nur das aktive Ziel für den aktuellen Dart hervorheben
            const activeCrazyTarget = crazyTargets?.[Math.min(turn.length, (crazyTargets?.length ?? 1) - 1)]
            const isCrazyTarget = activeCrazyTarget === tKey

            return (
              <button
                key={tKey}
                type="button"
                style={{
                  border: isCrazyTarget ? '2px solid #f59e0b' : (isMobileScreen && playerCount > 4 ? 'none' : '1px solid #e5e7eb'),
                  borderRadius: isMobileScreen ? 2 : 12,
                  padding: isMobileScreen ? '0' : '6px 10px',
                  background: isCrazyTarget ? '#fef3c7' : (isMobileScreen ? 'transparent' : '#fff'),
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  cursor: 'pointer',
                  width: '100%',
                  position: 'relative',
                  boxShadow: isCrazyTarget ? '0 0 8px rgba(245, 158, 11, 0.4)' : 'none',
                }}
                onClick={(e) => {
                  // Fokus entfernen damit Enter den Button nicht nochmal aktiviert
                  // WICHTIG: e.currentTarget statt e.target, da e.target ein Kind-Element sein kann
                  e.currentTarget.blur()
                  if (t === 'MISS') addTarget('MISS')
                  else addTarget(t as any)
                }}
              >
                <div
                  style={{
                    fontWeight: 800,
                    fontSize: isMobileScreen ? (isLongRange || playerCount > 6 ? 8 : 10) : 14,
                    position: 'relative',
                    display: 'flex',
                    alignItems: 'center',
                    gap: isMobileScreen ? 0 : 6,
                  }}
                >
                  <span
                    style={{
                      textDecoration: closedAll ? 'line-through' : 'none',
                      textDecorationThickness: closedAll ? '2px' : undefined,
                      color: isCrazyTarget ? '#b45309' : (closedAll ? '#475569' : '#111827'),
                      background: closedAll && !isMobileScreen ? '#f1f5f9' : 'transparent',
                      borderRadius: 6,
                      padding: closedAll && !isMobileScreen ? '0 6px' : 0,
                    }}
                  >
                    {isCrazyTarget && !isMobileScreen && '🎯 '}{t === 'BULL' ? (isMobileScreen ? 'B' : 'BULL') : t === 'MISS' ? (isMobileScreen ? 'X' : 'Miss') : String(t)}
                  </span>
                  {closedAll && !isMobileScreen && (
                    <span style={{ ...ui.badge, background: '#e2e8f0', color: '#334155' }}>
                      CLOSED
                    </span>
                  )}
                </div>

                {!isMobileScreen && (
                <div style={{ ...ui.sub, textAlign: 'right' }}>
                  {t === 'MISS'
                    ? 'kein Treffer (M)'
                    : `werfen (${mult === 1 ? 'S' : mult === 2 ? 'D' : 'T'})${
                        t === 'BULL' ? ' · S=Bull, D/T=DBull' : ''
                      }`}
                </div>
                )}
              </button>
            )
          })}
        </div>

        {/* S/D/T Multiplier Buttons */}
        <div
          style={{
            display: 'flex',
            gap: 6,
            justifyContent: 'center',
            marginTop: 8,
          }}
        >
          {[1, 2, 3].map(m => (
            <button
              key={m}
              style={{
                ...ui.pill,
                borderColor: mult === m ? '#0ea5e9' : '#e5e7eb',
                background: mult === m ? '#e0f2fe' : '#fff',
                color: '#111827',
                flex: 1,
              }}
              onClick={() => setMult(m as 1 | 2 | 3)}
            >
              {m === 1 ? 'S' : m === 2 ? 'D' : 'T'}
            </button>
          ))}
        </div>
      </div>
    )
  }

  // Spielerhälften bestimmen
  const leftCount = Math.ceil(order.length / 2)
  const leftIds = order.slice(0, leftCount)
  const rightIds = order.slice(leftCount)

  // Grid-Aufbau
  const gridCells: Array<
    | { kind: 'player'; pid: string; side: 'left' | 'right' }
    | { kind: 'cricket' }
  > = [
    ...leftIds.map(pid => ({ kind: 'player' as const, pid, side: 'left' as const })),
    { kind: 'cricket' as const },
    ...rightIds.map(pid => ({ kind: 'player' as const, pid, side: 'right' as const })),
  ]

  const mobilePlayerCol = useCompactWidth ? 'auto' : '1fr'
  const gridTemplateColumns = isMobileScreen
    ? [...leftIds.map(() => mobilePlayerCol), `${mobileCricketWidth}px`, ...rightIds.map(() => mobilePlayerCol)].join(' ')
    : [...leftIds.map(() => `${PLAYER_CARD_WIDTH}px`), `${CRICKET_CARD_WIDTH_MAX}px`, ...rightIds.map(() => `${PLAYER_CARD_WIDTH}px`)].join(' ')

  // Sticky Header
  const headerStyle: React.CSSProperties = {
    ...ui.headerRow,
    position: 'sticky',
    top: 0,
    background: '#ffffffcc',
    backdropFilter: 'blur(2px)',
    zIndex: 20,
    padding: '6px 0',
  }

  // Darts im aktuellen Turn
  const dartsUsed = turn.length
  const dartsLeft = Math.max(0, 3 - dartsUsed)

  // Titel für Header (mit Leg-Stand wenn First to X)
  const legStandStr = typeof targetWins === 'number'
    ? ` · FT${targetWins}: ${order.map(pid => legCtx.legWinsByPlayer[pid] ?? 0).join(':')}`
    : ''
  const cricketTitle = `Cricket ${match.range === 'short' ? '(15–20)' : '(10–20)'} · ${
    match.style === 'cutthroat' ? 'Cutthroat'
    : match.style === 'simple' ? 'Simple'
    : match.style === 'crazy' ? (() => {
        const scoringMode = (match as any).crazyScoringMode ?? ((match as any).crazyWithPoints ? 'standard' : 'simple')
        const scoringLabel = scoringMode === 'cutthroat' ? 'Cutthroat' : scoringMode === 'standard' ? '(Punkte)' : ''
        return `Crazy ${match.crazyMode === 'pro' ? 'Pro ' : ''}${scoringLabel}`.trim()
      })()
    : 'Standard'
  }${legStandStr}${multiplayer?.enabled && multiplayer.roomCode ? ` · ${multiplayer.roomCode}` : ''}`

  // Dynamischer Hintergrund basierend auf aktivem Spieler
  const mobileFullScreen = isMobileScreen ? { height: '100dvh', maxHeight: '100dvh', overflow: 'hidden', display: 'flex', flexDirection: 'column' as const, gap: 2, padding: '2px 4px 0' } : {}
  const fullscreenClass = isMobileScreen ? 'game-fullscreen' : undefined
  const backgroundStyle = playerColorBgEnabled
    ? {
        ...ui.page,
        ...mobileFullScreen,
        background: `linear-gradient(180deg, ${activePlayerColor}20 0%, ${activePlayerColor}05 100%)`,
        transition: 'background 0.5s ease',
      }
    : { ...ui.page, ...mobileFullScreen }

  // Enter-Taste zum Weitergehen bei Leg-Summary
  useEffect(() => {
    if (!legSummary) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Enter') setLegSummary(null)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [legSummary])

  if (matchNotReady) {
    return (
      <div style={ui.page}>
        <div style={{ ...ui.headerRow, position: 'sticky', top: 0, background: '#fff', zIndex: 10 }}>
          <h2 style={{ margin: 0 }}>Cricket</h2>
          <button style={ui.backBtn} onClick={onExit}>← Menü</button>
        </div>
        <div style={ui.centerPage}>
          <div style={ui.centerInner}>Lade Cricket-Match...</div>
        </div>
      </div>
    )
  }

  return (
    <div style={backgroundStyle} className={fullscreenClass}>
      {/* Pause Overlay */}
      {gamePaused && <PauseOverlay onResume={() => setGamePaused(false)} />}

      {/* HEADER mit Pause/Mute/Exit */}
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
          // Pause-Status speichern bevor wir verlassen
          setMatchPaused(matchId, 'cricket', true)
          onExit()
        }}
        onCancel={() => {
          deleteCricketMatch(matchId)
          onExit()
        }}
        title={cricketTitle}
      />

      {/* View-Toggle moved to bottom next to Leg-Verlauf */}

      {/* Score-Info Leiste — nur im Normal-Modus (im Arcade in der ArcadeView integriert) */}
      {!showArcadeView && (
        <div
          style={{
            ...headerStyle,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            gap: 16,
            padding: '8px 16px',
            fontSize: 13,
          }}
        >
          <span style={{ color: colors.fgMuted }}>Starter: {starterBadge}</span>

          {/* Aktuelle Darts */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 8 }}>
            <span style={{ color: colors.fgMuted, fontSize: 12 }}>Darts:</span>
            {Array.from({ length: 3 }).map((_, i) => {
              const dart = turn[i]
              if (dart) {
                const label = dart.target === 'MISS'
                  ? 'X'
                  : dart.target === 'BULL'
                    ? dart.mult === 2 ? 'DB' : 'B'
                    : `${dart.mult === 3 ? 'T' : dart.mult === 2 ? 'D' : 'S'}${dart.target}`
                return (
                  <span key={i} className="game-dart-slot filled dart-slot-fill">
                    {label}
                  </span>
                )
              }
              return (
                <span key={i} className="game-dart-slot empty">
                  —
                </span>
              )
            })}
          </div>
          {/* Ansage + LED Toggle — nur Landscape, neben Darts */}
          {isMobileLandscape && (
            <div style={{ display: 'flex', gap: 4, marginLeft: 8 }}>
              <button onClick={() => {
                const name = match.players.find(p => p.playerId === activeId)?.name ?? activeId
                const statusTargets = match.range === 'short' ? ['20','19','18','17','16','15','BULL'] : ['10','11','12','13','14','15','16','17','18','19','20','BULL']
                const needs: { target: string; count: number }[] = []
                for (const t of statusTargets) { const marks = baseState.marksByPlayer[activeId]?.[t] ?? 0; if (marks < 3) needs.push({ target: t, count: 3 - marks }) }
                announcePlayerNeeds(name, needs)
              }} style={{ padding: '2px 6px', fontSize: 9, border: `1px solid ${colors.border}`, borderRadius: 3, background: 'transparent', color: colors.fgDim, cursor: 'pointer' }}>🔊</button>
              <button onClick={() => setCricketViewMode(prev => prev === 'arcade' ? 'auto' : 'arcade')}
                style={{ padding: '2px 6px', fontSize: 9, border: `1px solid ${colors.border}`, borderRadius: 3, background: 'transparent', color: colors.fgDim, cursor: 'pointer' }}>◉ LED</button>
            </div>
          )}
        </div>
      )}

      {/* Speichern-Indikator */}
      {saving && (
        <div style={{ fontSize: 13, color: colors.fgMuted, padding: '8px 0', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <span style={{ display: 'inline-block', width: 14, height: 14, border: '2px solid currentColor', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          Speichern...
        </div>
      )}

      {/* LEG SUMMARY OVERLAY */}
      {legSummary && (
        <div
          className="game-overlay"
          onClick={() => setLegSummary(null)}
        >
          <div
            className="game-modal"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{ textAlign: 'center', marginBottom: 16 }}>
              <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 4 }}>
                Leg {legSummary.legIndex + 1} beendet
              </div>
              <div style={{ fontSize: 28, fontWeight: 900, color: '#16a34a' }}>
                {legSummary.winnerName} gewinnt!
              </div>
            </div>

            {/* Spielstand */}
            <div className="game-summary-panel">
              <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>Spielstand</div>
              <div style={{ fontSize: 32, fontWeight: 900, letterSpacing: 2 }}>
                {order.map(pid => legSummary.legWinsAfter[pid] ?? 0).join(' : ')}
              </div>
              <div style={{ display: 'flex', justifyContent: 'center', gap: 24, marginTop: 4 }}>
                {order.map(pid => {
                  const p = match.players.find(x => x.playerId === pid)
                  return (
                    <span key={pid} style={{ fontSize: 12, color: '#6b7280' }}>
                      {p?.name ?? pid}
                    </span>
                  )
                })}
              </div>
            </div>

            {/* Leg-Dauer */}
            <div className="game-meta-row">
              <span style={{ fontWeight: 500, color: '#374151' }}>Leg-Dauer</span>
              <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{legSummary.legDuration}</span>
            </div>

            {/* Leg-Statistik Tabelle */}
            <div className="game-section">
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>Leg-Statistik</div>
              <table className="game-stats-table">
                <thead>
                  <tr>
                    <th></th>
                    {order.map(pid => {
                      const p = match.players.find(x => x.playerId === pid)
                      return (
                        <th
                          key={pid}
                          className="game-th-center"
                          style={{
                            fontWeight: 700,
                            color: pid === legSummary.winnerId ? '#16a34a' : '#0f172a',
                          }}
                        >
                          {p?.name ?? pid}
                        </th>
                      )
                    })}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Total Marks</td>
                    {order.map(pid => (
                      <td key={pid} className="game-td-center" style={{ fontWeight: 600 }}>
                        {legSummary.legStats[pid]?.totalMarks ?? 0}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td>Marks/Turn</td>
                    {order.map(pid => (
                      <td key={pid} className="game-td-center">
                        {(legSummary.legStats[pid]?.marksPerTurn ?? 0).toFixed(2)}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td>Turns</td>
                    {order.map(pid => (
                      <td key={pid} className="game-td-center">
                        {legSummary.legStats[pid]?.turns ?? 0}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td>Best Turn</td>
                    {order.map(pid => (
                      <td key={pid} className="game-td-center">
                        {legSummary.legStats[pid]?.bestTurnMarks ?? 0}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td>Triples</td>
                    {order.map(pid => (
                      <td key={pid} className="game-td-center">
                        {legSummary.legStats[pid]?.triplesHit ?? 0}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td>Doubles</td>
                    {order.map(pid => (
                      <td key={pid} className="game-td-center">
                        {legSummary.legStats[pid]?.doublesHit ?? 0}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td>Single Bull</td>
                    {order.map(pid => (
                      <td key={pid} className="game-td-center">
                        {legSummary.legStats[pid]?.bullHits ?? 0}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td>Double Bull</td>
                    {order.map(pid => (
                      <td key={pid} className="game-td-center">
                        {legSummary.legStats[pid]?.doubleBullHits ?? 0}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Cricket Charts mit Tab-Auswahl */}
            <div className="game-section">
              {/* Tab-Buttons */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <button
                  onClick={() => setChartTab('marks')}
                  className={`game-tab-btn ${chartTab === 'marks' ? 'active' : 'inactive'}`}
                >
                  Marks-Verlauf
                </button>
                <button
                  onClick={() => setChartTab('fields')}
                  className={`game-tab-btn ${chartTab === 'fields' ? 'active' : 'inactive'}`}
                >
                  Feldfortschritt
                </button>
              </div>

              {/* Chart-Bereich */}
              <div style={{ height: 270, background: '#f9fafb', borderRadius: 8 }}>
                {(() => {
                  const legEvents = getEventsForLeg(events, legSummary.legIndex)
                  const legMarks = computeMarksForLeg(events, legSummary.legIndex, order, match.range)

                  if (chartTab === 'marks') {
                    const chartData = prepareCricketChartData(
                      legEvents,
                      {
                        marksByPlayer: legMarks.marksByPlayer,
                        pointsByPlayer: legMarks.pointsByPlayer,
                        players: order,
                        match: match,
                      },
                      playerChartColors
                    )

                    return (
                      <CricketProgressChart
                        players={chartData.players}
                        scoringMode={chartData.scoringMode}
                        winnerPlayerId={legSummary.winnerId}
                      />
                    )
                  }

                  // Feldfortschritt (Gantt-Chart)
                  const { fieldClosures, maxTurns } = computeFieldClosures(legEvents, order, match.range)

                  const ganttPlayers: GanttChartPlayer[] = order.map((pid, i) => ({
                    id: pid,
                    name: match.players.find(p => p.playerId === pid)?.name ?? pid,
                    color: playerChartColors[i],
                    fieldClosures: fieldClosures[pid],
                  }))

                  return (
                    <CricketGanttChart
                      players={ganttPlayers}
                      maxTurns={maxTurns}
                      winnerPlayerId={legSummary.winnerId}
                    />
                  )
                })()}
              </div>
            </div>

            {/* Weiter Button */}
            <button
              onClick={() => setLegSummary(null)}
              className="game-btn-primary"
            >
              Weiter zum nächsten Leg →
            </button>
          </div>
        </div>
      )}

      {/* ENDGAME BANNER (Cutthroat) */}
      {match.style === 'cutthroat' && match.cutthroatEndgame && baseState.endgameActive && (
        <div
          style={{
            background: match.cutthroatEndgame === 'suddenDeath' ? '#fef3c7' : '#dbeafe',
            border: `2px solid ${match.cutthroatEndgame === 'suddenDeath' ? '#f59e0b' : '#3b82f6'}`,
            borderRadius: 12,
            padding: '12px 20px',
            marginBottom: 12,
            textAlign: 'center',
            fontWeight: 700,
            fontSize: 16,
          }}
        >
          {match.cutthroatEndgame === 'standard' ? (
            <>
              Endgame! Noch <span style={{ fontSize: 20, color: '#1d4ed8' }}>{baseState.endgameRoundsRemaining ?? 0}</span> Runde{(baseState.endgameRoundsRemaining ?? 0) !== 1 ? 'n' : ''}
            </>
          ) : (
            <>
              Sudden Death! <span style={{ fontSize: 20, color: '#b45309' }}>{baseState.endgameBullHits ?? 0}</span> / 5 Bulls
            </>
          )}
        </div>
      )}

      {/* LAST FIELD HINT */}
      {lastFieldHint && lastFieldHint.type === 'lastField' && (
        <div className="game-hint-banner warning">
          <div style={{ fontSize: 13, fontWeight: 600, color: '#92400e', marginBottom: 6 }}>
            🎯 Letztes Feld: <span style={{ fontSize: 16, fontWeight: 800 }}>{lastFieldHint.field === 'BULL' ? 'Bull' : lastFieldHint.field}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 16, flexWrap: 'wrap' }}>
            {lastFieldHint.hitsNeeded.map(h => (
              <span key={h.playerId} style={{ fontSize: 14, fontWeight: 600, color: '#78350f' }}>
                {h.name}: {h.needed > 0 ? `${h.needed} Treffer` : '✓ Zu'}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ALL CLOSED HINT (Punkte entscheiden) */}
      {lastFieldHint && lastFieldHint.type === 'allClosed' && (
        <div className="game-hint-banner info">
          <div style={{ fontSize: 13, fontWeight: 600, color: '#1e40af', marginBottom: 6 }}>
            Alle Felder zu! Punkte entscheiden:
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 16, flexWrap: 'wrap' }}>
            {lastFieldHint.hints.map(h => (
              <span key={h.playerId} style={{ fontSize: 13, color: '#1e3a8a' }}>
                <b>{h.name}:</b>{' '}
                {h.canScore.length > 0
                  ? h.canScore.map(f => f === 'BULL' ? 'Bull' : f).join(', ')
                  : <span style={{ color: '#dc2626' }}>—</span>}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* VIEW MODE: Classic oder Arcade */}
      {!showArcadeView ? (
        /* Tabellen-Layout */
        isMobileLandscape ? (
        /* LANDSCAPE: Spieler links (volle Breite), Eingabe rechts */
        <div style={{ display: 'flex', gap: 4, flex: 1, minHeight: 0, overflow: 'hidden', padding: '0 2px' }}>
          {/* Links: Spieler-Grid — volle restliche Breite, Mittelspalte 3× breiter */}
          <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{
              display: 'grid',
              gridTemplateColumns: [...leftIds.map(() => '1fr'), `${mobileCricketWidth * 3}px`, ...rightIds.map(() => '1fr')].join(' '),
              alignItems: 'stretch',
              gap: 2, flex: 1, minHeight: 0, overflow: 'hidden',
            }}>
              {gridCells.map((cell, idx) => {
                if (cell.kind === 'cricket') {
                  return (
                    <div key={`c-${idx}`} style={{ ...cricketCardStyle, padding: 0, display: 'flex', flexDirection: 'column' }}>
                      {/* Spacer: gleiche Höhe wie PlayerHeader (45px + 2px margin) */}
                      {/* Spacer: gleiche Höhe wie PlayerHeader */}
                      <div style={{ height: useCompactWidth ? 16 : (isLongRange ? 37 : 47), flexShrink: 0 }} />
                      <div style={{
                        display: 'grid',
                        gridTemplateRows: `repeat(${targetList.length}, ${ROW_H}px)`,
                        rowGap: 2,
                      }}>
                        {targetList.map(t => {
                          const tKey = String(t)
                          const closedAll = t !== 'MISS' && isClosedForAll(tKey)
                          const mobileLabel = t === 'BULL' ? 'B' : t === 'MISS' ? 'X' : String(t)
                          return (
                            <button key={tKey}
                              onClick={() => t === 'MISS' ? addTarget('MISS') : addTarget(typeof t === 'number' ? t : t as 'BULL')}
                              style={{
                                borderRadius: 3, padding: 0, border: 'none', height: ROW_H,
                                background: colors.bgCard, display: 'flex', justifyContent: 'center', alignItems: 'center',
                                fontWeight: 800, fontSize: isLongRange ? 8 : 12, color: closedAll ? '#94a3b8' : colors.fg,
                                textDecoration: closedAll ? 'line-through' : 'none', cursor: 'pointer',
                                WebkitTapHighlightColor: 'transparent', boxSizing: 'border-box',
                              }}>
                              {mobileLabel}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )
                }
                return <div key={cell.pid}>{renderPlayerCard(cell.pid, cell.side)}</div>
              })}
            </div>
          </div>
          {/* Rechts: Eingabe oben + Wurffolge unten */}
          <div style={{ width: 120, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 2, minHeight: 0 }}>
            {/* Target Buttons: 2 Spalten — 20 bis 10 durchgehend, dann B + X */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
              {(isLongRange ? [20,19,18,17,16,15,14,13,12,11,10] : [20,19,18,17,16,15]).map(num => (
                <button key={num} type="button" onClick={(e) => { e.currentTarget.blur(); addTarget(num) }}
                  style={{ border: '1px solid #e5e7eb', borderRadius: 3, padding: isLongRange ? '3px 0' : '5px 0',
                    background: colors.bgCard, fontWeight: 700, fontSize: isLongRange ? 10 : 11, cursor: 'pointer', color: colors.fg }}>{num}</button>
              ))}
              <button type="button" onClick={(e) => { e.currentTarget.blur(); addTarget('BULL') }}
                style={{ border: '1px solid #e5e7eb', borderRadius: 3, padding: isLongRange ? '3px 0' : '5px 0',
                  background: colors.bgCard, fontWeight: 700, fontSize: isLongRange ? 10 : 11, cursor: 'pointer', color: colors.fg }}>B</button>
              <button type="button" onClick={(e) => { e.currentTarget.blur(); addTarget('MISS') }}
                style={{ border: '1px solid #e5e7eb', borderRadius: 3, padding: isLongRange ? '3px 0' : '5px 0',
                  background: colors.bgMuted, fontWeight: 600, fontSize: isLongRange ? 10 : 11, cursor: 'pointer', color: colors.fgDim }}>X</button>
            </div>
            {/* S/D/T */}
            <div style={{ display: 'flex', gap: 2 }}>
              {[1, 2, 3].map(m => (
                <button key={m} onClick={() => setMult(m as 1 | 2 | 3)}
                  style={{ flex: 1, padding: '4px 0', borderRadius: 3,
                    border: mult === m ? '2px solid #0ea5e9' : '1px solid #e5e7eb',
                    background: mult === m ? '#e0f2fe' : colors.bgCard, fontWeight: 700, fontSize: 11, cursor: 'pointer', color: colors.fg }}>
                  {m === 1 ? 'S' : m === 2 ? 'D' : 'T'}
                </button>
              ))}
            </div>
            {/* Undo + Back + OK */}
            <div style={{ display: 'flex', gap: 2 }}>
              <button style={{ flex: 1, padding: '4px 0', borderRadius: 3, border: '1px solid #e5e7eb', background: colors.bgCard, fontSize: 10, cursor: 'pointer', color: colors.fg }}
                onClick={undoLastTurn}>↶</button>
              <button style={{ flex: 1, padding: '4px 0', borderRadius: 3, border: '1px solid #e5e7eb', background: colors.bgCard, fontSize: 10, cursor: 'pointer', color: colors.fg }}
                onClick={() => setTurn(t => t.slice(0, -1))} disabled={turn.length === 0}>←</button>
              <button style={{ flex: 2, padding: '4px 0', borderRadius: 3, border: 'none', background: '#111827', color: '#fff', fontWeight: 700, fontSize: 11, cursor: 'pointer' }}
                onClick={() => confirmTurn()}>OK</button>
            </div>
            {/* Wurffolge — scrollbar, nimmt restlichen Platz */}
            <div style={{ flex: 1, minHeight: 30, overflowY: 'auto', overflowX: 'hidden', borderTop: `1px solid ${colors.border}`, paddingTop: 3 }}>
              {recentTurns.map((t, i) => {
                const pColor = t.playerColor ?? '#999'
                const shortName = (t.playerName ?? '').slice(0, 5)
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 3, whiteSpace: 'nowrap', overflow: 'hidden', fontSize: 8, lineHeight: '13px' }}>
                    <span style={{ width: 5, height: 5, borderRadius: 99, background: pColor, flexShrink: 0 }} />
                    <span style={{ color: colors.fgDim, fontWeight: 600, minWidth: 25, overflow: 'hidden', textOverflow: 'ellipsis' }}>{shortName}</span>
                    <span style={{ color: colors.fg, fontWeight: 700 }}>{t.darts?.join(' ') ?? '—'}</span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
        ) : (
        /* PORTRAIT: Spieler oben, darunter Leg-Verlauf + Eingabe nebeneinander */
        <div style={{ display: 'flex', flexDirection: 'column', gap: isMobileScreen ? 6 : 12, width: '100%', maxWidth: isMobileScreen ? '100vw' : undefined, margin: '0 auto', overflow: 'hidden', boxSizing: 'border-box', padding: isMobileScreen ? (playerCount > 6 ? '0 1px' : '0 4px') : undefined }}>
          {/* OBERER BEREICH: Spieler-Grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns,
              alignItems: isMobileScreen ? 'end' : 'start',
              gap: isMobileScreen ? 2 : 12,
              width: '100%',
              maxWidth: '100%',
              justifyContent: 'center',
              overflow: 'hidden',
              boxSizing: 'border-box',
            }}
          >
            {gridCells.map((cell, idx) => {
              if (cell.kind === 'cricket') {
                // Cricket-Column: Nur Marks, keine Buttons mehr
                return (
                  <div key={`c-${idx}`} style={cricketCardStyle}>
                    {/* Cricket Header — gleiche Höhe wie PlayerHeader */}
                    <div
                      style={{
                        minHeight: useCompactWidth ? 14 : headerBarHeight,
                        height: useCompactWidth ? 14 : undefined,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 700,
                        fontSize: isMobileScreen ? 11 : 14,
                        lineHeight: useCompactWidth ? '14px' : `${headerBarHeight}px`,
                        marginBottom: isMobileScreen ? 2 : 6,
                        textAlign: 'center',
                        width: '100%',
                      }}
                    >
                      {isMobileScreen ? '' : 'Cricket'}
                      {!isMobileScreen && (
                        <span style={{ fontSize: 12, opacity: 0.7, marginLeft: 6 }}>
                          {match.range === 'short' ? '15–20, Bull' : '10–20, Bull'}
                        </span>
                      )}
                    </div>

                    {/* Target-Felder (klickbar als Eingabe) */}
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateRows: `repeat(${targetList.length}, ${ROW_H}px)`,
                        rowGap: isMobileScreen ? 2 : 4,
                      }}
                    >
                      {targetList.map(t => {
                        const tKey = String(t)
                        const closedAll = t !== 'MISS' && isClosedForAll(tKey)
                        const activeCrazyTarget = crazyTargets?.[Math.min(turn.length, (crazyTargets?.length ?? 1) - 1)]
                        const isCrazyTarget = activeCrazyTarget === tKey
                        const mobileLabel = t === 'BULL' ? 'B' : t === 'MISS' ? 'X' : String(t)

                        return (
                          <button
                            key={tKey}
                            onClick={() => t === 'MISS' ? addTarget('MISS') : addTarget(typeof t === 'number' ? t : t as 'BULL')}
                            style={{
                              borderRadius: useCompactWidth ? 4 : (isMobileScreen ? 2 : 8),
                              padding: isMobileScreen ? (useCompactWidth ? '1px 2px' : '0') : '4px 10px',
                              background: t === 'MISS' ? '#f8fafc' : (isCrazyTarget ? '#fef3c7' : (closedAll ? '#f1f5f9' : (useCompactWidth ? '#fff' : (isMobileScreen ? 'transparent' : '#fff')))),
                              border: isCrazyTarget ? '2px solid #f59e0b' : (isMobileScreen && playerCount > 4 ? 'none' : '1px solid #d1d5db'),
                              display: 'flex',
                              justifyContent: 'center',
                              alignItems: 'center',
                              fontWeight: 700,
                              fontSize: isMobileScreen ? (isLongRange || playerCount > 6 ? 8 : 10) : 14,
                              color: t === 'MISS' ? '#64748b' : (closedAll ? '#94a3b8' : '#111827'),
                              textDecoration: closedAll ? 'line-through' : 'none',
                              cursor: 'pointer',
                              WebkitTapHighlightColor: 'transparent',
                            }}
                          >
                            {isCrazyTarget && !isMobileScreen && '🎯 '}{isMobileScreen ? mobileLabel : (t === 'MISS' ? 'Miss' : String(t))}
                            {closedAll && !isMobileScreen && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 600, color: '#64748b' }}>CLOSED</span>}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              }
              return <div key={cell.pid}>{renderPlayerCard(cell.pid, cell.side)}</div>
            })}
          </div>

          {/* UNTERER BEREICH: Eingabe + Leg-Verlauf */}
          <div
            style={{
              display: 'flex',
              flexDirection: isMobileScreen ? 'column-reverse' : 'row',
              gap: isMobileScreen ? 8 : 16,
              justifyContent: 'center',
            }}
          >
            {/* Leg-Verlauf (unter Eingabe auf Mobile, links auf Desktop) */}
            <div style={{ width: isMobileScreen ? '100%' : 300, flexShrink: 0, overflow: 'hidden', maxHeight: isMobileScreen ? 150 : undefined }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, gap: 4 }}>
                <span style={{ fontWeight: 700, fontSize: 13, color: colors.fg }}>Leg-Verlauf</span>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button
                    onClick={() => {
                      const name = match.players.find(p => p.playerId === activeId)?.name ?? activeId
                      const statusTargets = match.range === 'short' ? ['20','19','18','17','16','15','BULL'] : ['10','11','12','13','14','15','16','17','18','19','20','BULL']
                      const needs: { target: string; count: number }[] = []
                      for (const t of statusTargets) {
                        const marks = baseState.marksByPlayer[activeId]?.[t] ?? 0
                        if (marks < 3) needs.push({ target: t, count: 3 - marks })
                      }
                      announcePlayerNeeds(name, needs)
                    }}
                    style={{
                      padding: '2px 8px', fontSize: 10, fontWeight: 600,
                      border: `1px solid ${colors.border}`, borderRadius: 4,
                      background: 'transparent', color: colors.fgDim, cursor: 'pointer',
                    }}
                  >
                    🔊 Ansage
                  </button>
                  <button
                    onClick={() => setCricketViewMode(prev => prev === 'arcade' ? 'auto' : 'arcade')}
                    style={{
                      padding: '2px 8px', fontSize: 10, fontWeight: 600,
                      border: `1px solid ${colors.border}`, borderRadius: 4,
                      background: showArcadeView ? (isArcade ? '#1e293b' : '#dbeafe') : 'transparent',
                      color: showArcadeView ? (isArcade ? '#e5e7eb' : '#1e40af') : colors.fgDim,
                      cursor: 'pointer',
                    }}
                  >
                    {showArcadeView ? '⊞ Tabelle' : '◉ LED'}
                  </button>
                </div>
              </div>
              <CricketTurnList
                turns={recentTurns}
                scrollRef={turnListScrollRef}
                maxHeight={320}
                isLight={true}
              />
            </div>

            {/* Eingabe-Buttons (oben auf Mobile, rechts auf Desktop) */}
            <div style={{ width: isMobileScreen ? '100%' : 300, flexShrink: 0 }}>
              {/* Crazy Pro: Vorschau aller 3 Ziele */}
              {match.style === 'crazy' && match.crazyMode === 'pro' && crazyTargets && crazyTargets.length === 3 && (
                <div
                  style={{
                    display: 'flex',
                    gap: 6,
                    justifyContent: 'center',
                    alignItems: 'center',
                    marginBottom: 8,
                    padding: '6px 10px',
                    background: '#fef3c7',
                    borderRadius: 6,
                    border: '2px solid #f59e0b',
                  }}
                >
                  <span style={{ fontSize: 11, fontWeight: 600, color: '#92400e' }}>Ziele:</span>
                  {crazyTargets.map((target, i) => {
                    const isCurrent = i === Math.min(turn.length, 2)
                    const isPast = i < turn.length
                    return (
                      <span
                        key={i}
                        style={{
                          fontSize: 14,
                          fontWeight: 800,
                          color: isPast ? '#9ca3af' : (isCurrent ? '#b45309' : '#d97706'),
                          background: isCurrent ? '#fff' : 'transparent',
                          padding: '2px 6px',
                          borderRadius: 4,
                          border: isCurrent ? '2px solid #f59e0b' : 'none',
                          textDecoration: isPast ? 'line-through' : 'none',
                        }}
                      >
                        {target === 'BULL' ? 'Bull' : target}
                      </span>
                    )
                  })}
                </div>
              )}

              {/* Target Buttons */}
              {isLongRange && isMobileScreen ? (
                <>
                  {/* Long Portrait: 4er-Grid */}
                  <div style={{ display: 'flex', gap: 2, marginBottom: 3 }}>
                    {[20, 19, 18, 17].map(n => (
                      <button key={n} type="button" onClick={(e) => { e.currentTarget.blur(); addTarget(n) }}
                        style={{ flex: 1, border: '1px solid #e5e7eb', borderRadius: 6, padding: '6px 2px',
                          background: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer', color: '#111827', minWidth: 0 }}>{n}</button>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 2, marginBottom: 3 }}>
                    {[16, 15, 14, 13].map(n => (
                      <button key={n} type="button" onClick={(e) => { e.currentTarget.blur(); addTarget(n) }}
                        style={{ flex: 1, border: '1px solid #e5e7eb', borderRadius: 6, padding: '6px 2px',
                          background: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer', color: '#111827', minWidth: 0 }}>{n}</button>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 2, marginBottom: 3 }}>
                    {[12, 11, 10].map(n => (
                      <button key={n} type="button" onClick={(e) => { e.currentTarget.blur(); addTarget(n) }}
                        style={{ flex: 1, border: '1px solid #e5e7eb', borderRadius: 6, padding: '6px 2px',
                          background: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer', color: '#111827', minWidth: 0 }}>{n}</button>
                    ))}
                    <button type="button" onClick={(e) => { e.currentTarget.blur(); addTarget('MISS') }}
                      style={{ flex: 1, border: '1px solid #e5e7eb', borderRadius: 6, padding: '6px 2px',
                        background: '#f8fafc', fontWeight: 600, fontSize: 12, cursor: 'pointer', color: '#64748b', minWidth: 0 }}>X</button>
                  </div>
                  <div style={{ display: 'flex', gap: 2, marginBottom: 3 }}>
                    {[1, 2, 3].map(m => (
                      <button key={m} onClick={() => setMult(m as 1 | 2 | 3)}
                        style={{ flex: 1, padding: '6px 2px', borderRadius: 6,
                          border: mult === m ? '2px solid #0ea5e9' : '1px solid #e5e7eb',
                          background: mult === m ? '#e0f2fe' : '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
                        {m === 1 ? 'S' : m === 2 ? 'D' : 'T'}
                      </button>
                    ))}
                    <button type="button" onClick={(e) => { e.currentTarget.blur(); addTarget('BULL') }}
                      style={{ flex: 1, border: '1px solid #e5e7eb', borderRadius: 6, padding: '6px 2px',
                        background: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer', minWidth: 0 }}>B</button>
                  </div>
                  <div style={{ display: 'flex', gap: 2, marginBottom: 8 }}>
                    <button style={{ flex: 1, padding: '6px 2px', borderRadius: 6, border: '1px solid #e5e7eb', background: '#fff', fontSize: 11, cursor: 'pointer' }}
                      onClick={undoLastTurn}>↶ Aufn.</button>
                    <button style={{ flex: 1, padding: '6px 2px', borderRadius: 6, border: '1px solid #e5e7eb', background: '#fff', fontSize: 11, cursor: 'pointer' }}
                      onClick={() => setTurn(t => t.slice(0, -1))} disabled={turn.length === 0}>← Dart</button>
                    <button style={{ flex: 2, padding: '6px 2px', borderRadius: 6, border: 'none', background: '#111827', color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}
                      onClick={() => confirmTurn()}>{turn.length === 0 ? '3× Miss' : 'OK'}</button>
                  </div>
                </>
              ) : (
                <>
                  {/* Short: 1 Zeile 20-15+B+X */}
                  <div style={{ display: 'flex', flexWrap: 'nowrap', gap: isMobileScreen ? 2 : 4, marginBottom: 8 }}>
                    {[20, 19, 18, 17, 16, 15].map(num => {
                      const tKey = String(num)
                      const closedAll = isClosedForAll(tKey)
                      return (
                        <button key={num} type="button" onClick={(e) => { e.currentTarget.blur(); addTarget(num) }}
                          style={{ flex: 1, border: '1px solid #e5e7eb', borderRadius: 6,
                            padding: isMobileScreen ? '6px 2px' : '8px 10px', background: '#fff',
                            fontWeight: 700, fontSize: isMobileScreen ? 12 : 14, cursor: 'pointer',
                            color: closedAll ? '#94a3b8' : '#111827', textDecoration: closedAll ? 'line-through' : 'none', minWidth: 0 }}>
                          {num}
                        </button>
                      )
                    })}
                    <button type="button" onClick={(e) => { e.currentTarget.blur(); addTarget('BULL') }}
                      style={{ flex: 1, border: '1px solid #e5e7eb', borderRadius: 6, padding: isMobileScreen ? '6px 2px' : '8px 10px',
                        background: '#fff', fontWeight: 700, fontSize: isMobileScreen ? 12 : 14, cursor: 'pointer', minWidth: 0 }}>
                      {isMobileScreen ? 'B' : 'Bull'}
                    </button>
                    <button type="button" onClick={(e) => { e.currentTarget.blur(); addTarget('MISS') }}
                      style={{ flex: 1, border: '1px solid #e5e7eb', borderRadius: 6, padding: isMobileScreen ? '6px 2px' : '8px 10px',
                        background: '#f8fafc', fontWeight: 600, fontSize: isMobileScreen ? 12 : 14, cursor: 'pointer', color: '#64748b', minWidth: 0 }}>
                      {isMobileScreen ? 'X' : 'Miss'}
                    </button>
                  </div>
                </>
              )}

              {/* S/D/T Multiplier — nur wenn nicht Long Mobile (dort im 4er-Grid) */}
              {!(isLongRange && isMobileScreen) && <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
                {[1, 2, 3].map(m => (
                  <button
                    key={m}
                    style={{
                      flex: 1,
                      padding: '8px 6px',
                      borderRadius: 6,
                      border: mult === m ? '2px solid #0ea5e9' : '1px solid #e5e7eb',
                      background: mult === m ? '#e0f2fe' : '#fff',
                      color: '#111827',
                      fontWeight: mult === m ? 700 : 500,
                      fontSize: 12,
                      cursor: 'pointer',
                    }}
                    onClick={() => setMult(m as 1 | 2 | 3)}
                  >
                    {m === 1 ? 'S' : m === 2 ? 'D' : 'T'}
                  </button>
                ))}
              </div>}

              {/* Action Buttons — nur wenn nicht Long Mobile */}
              {!(isLongRange && isMobileScreen) && <div style={{ display: 'flex', gap: 4 }}>
                <button
                  style={{
                    flex: 1,
                    padding: '8px 6px',
                    borderRadius: 6,
                    border: '1px solid #e5e7eb',
                    background: '#fff',
                    fontSize: 12,
                    cursor: 'pointer',
                  }}
                  onClick={undoLastTurn}
                  title="Undo"
                >
                  ↶
                </button>
                <button
                  style={{
                    flex: 1,
                    padding: '8px 6px',
                    borderRadius: 6,
                    border: '1px solid #e5e7eb',
                    background: '#fff',
                    fontSize: 12,
                    cursor: 'pointer',
                  }}
                  onClick={() => setTurn(t => t.slice(0, -1))}
                  disabled={turn.length === 0}
                >
                  ←
                </button>
                <button
                  style={{
                    flex: 2,
                    padding: '8px 12px',
                    borderRadius: 6,
                    border: 'none',
                    background: '#111827',
                    color: '#fff',
                    fontWeight: 700,
                    fontSize: 12,
                    cursor: 'pointer',
                  }}
                  onClick={() => confirmTurn()}
                >
                  {turn.length === 0 ? '3× Miss' : 'OK'}
                </button>
              </div>}
            </div>
          </div>
        </div>
        )
      ) : (
        /* ARCADE VIEW — Unified Dark Screen */
        <CricketArcadeView
          players={order.map((pid, idx) => {
            const p = match.players.find(x => x.playerId === pid)
            return {
              id: pid,
              name: p?.name ?? pid,
              marks: previewState.marksByPlayer[pid] ?? {},
              baseMarks: baseState.marksByPlayer[pid] ?? {},
              score: previewState.pointsByPlayer[pid] ?? 0,
              isActive: pid === activeId,
              color: playerChartColors[idx],
            }
          })}
          currentDart={turn.length + 1}
          currentRound={(() => {
            // Nur Turns im aktuellen Leg zählen
            let turnsInLeg = 0
            for (let i = events.length - 1; i >= 0; i--) {
              if (events[i].type === 'CricketLegFinished') break
              if (events[i].type === 'CricketTurnAdded') turnsInLeg++
            }
            return Math.floor(turnsInLeg / order.length) + 1
          })()}
          targets={targetList.filter(t => t !== 'MISS').map(String)}
          hideScore={match.style === 'simple' || (match.style === 'crazy' && ((match as any).crazyScoringMode ?? ((match as any).crazyWithPoints ? 'standard' : 'simple')) === 'simple')}
          closedTargets={targetList.filter(t => t !== 'MISS' && isClosedForAll(String(t))).map(String)}
          crazyTargets={crazyTargets && crazyTargets.length > 0
            ? [crazyTargets[Math.min(turn.length, crazyTargets.length - 1)]]
            : undefined}
          legScore={typeof targetWins === 'number' ? order.map(pid => legCtx.legWinsByPlayer[pid] ?? 0).join(' : ') : undefined}
          targetWins={typeof targetWins === 'number' ? targetWins : undefined}
          turn={turn}
          mult={mult}
          onAddTarget={addTarget}
          onSetMult={setMult}
          onUndo={undoLastTurn}
          onUndoDart={() => setTurn(t => t.length > 0 ? t.slice(0, -1) : t)}
          onBack={() => setTurn(t => t.slice(0, -1))}
          onConfirm={() => confirmTurn()}
          onAnnounceStatus={() => {
            const name = match.players.find(p => p.playerId === activeId)?.name ?? activeId
            const statusTargets = ['20', '19', '18', '17', '16', '15', 'BULL']
            const needs: { target: string; count: number }[] = []
            for (const t of statusTargets) {
              const marks = baseState.marksByPlayer[activeId]?.[t] ?? 0
              if (marks < 3) needs.push({ target: t, count: 3 - marks })
            }
            announcePlayerNeeds(name, needs)
          }}
          isShort={match.range !== 'long'}
          gamePaused={gamePaused}
          crazyPro={match.style === 'crazy' && match.crazyMode === 'pro'}
          crazyProTargets={crazyTargets}
          turnHistory={recentTurns}
          turnListRef={turnListScrollRef}
          onToggleView={() => setCricketViewMode('auto')}
          viewLabel="⊞ Tabelle"
          forceLandscape={isMobileLandscape}
        />
      )}

    </div>
  )

  // ===== Turn Helpers =====
  function addTarget(t: number | 'BULL' | 'MISS') {
    // Pause? Keine Eingaben
    if (gamePaused) return
    if (events.some(e => e.type === 'CricketMatchFinished')) return
    // Multiplayer: Nur eigene Würfe eingeben
    if (multiplayer?.enabled && !isMyTurn) return

    // Doppeltrigger verhindern (Debounce 120ms)
    if (inputLockRef.current) return
    inputLockRef.current = true
    window.setTimeout(() => {
      inputLockRef.current = false
    }, 120)

    let dart: CricketTurnDart
    if (t === 'MISS') {
      dart = { target: 'MISS', mult: 1 }
    } else {
      const currentMult = multRef.current
      const m = t === 'BULL' && currentMult === 3 ? 2 : currentMult // Triple Bull => Double Bull
      dart = { target: t, mult: m }
      if (t === 20 && m === 3) playTriple20Sound()
    }

    setTurn(prev => {
      if (prev.length >= 3) return prev
      const next: CricketTurnDart[] = [...prev, dart]
      if (next.length === 3) {
        // Buffer sofort leeren BEVOR Turn bestätigt wird
        numBuf.current = ''
        if (numBufTimer.current) window.clearTimeout(numBufTimer.current)
        setTimeout(() => confirmTurn(next), 0)
      }
      return next
    })

    // Immer nach Wurf auf Single zurücksetzen (außer Miss)
    if (multRef.current !== 1 && t !== 'MISS') setMult(1)

    if (numBufTimer.current) window.clearTimeout(numBufTimer.current)
    numBuf.current = ''
  }

  async function confirmTurn(override?: CricketTurnDart[]) {
    // Pause? Keine Eingaben
    if (gamePaused) return
    if (events.some(e => e.type === 'CricketMatchFinished')) return
    // Multiplayer: Nur eigene Turns bestätigen
    if (multiplayer?.enabled && !isMyTurn) return

    // Lock setzen um doppelte Eingaben zu verhindern
    if (turnLockRef.current) return
    turnLockRef.current = true

    // Buffer sofort leeren
    numBuf.current = ''
    if (numBufTimer.current) window.clearTimeout(numBufTimer.current)

    const inputDarts = override ?? turn

    // Fehlende Darts mit MISS auffüllen (0 Darts = 3 MISS, 1 Dart = 2 MISS, etc.)
    const darts: CricketTurnDart[] = [...inputDarts]
    while (darts.length < 3) {
      darts.push({ target: 'MISS', mult: 1 })
    }

    const { event: turnEv, winnerId } = recordCricketTurn({
      state: baseState,
      playerId: activeId,
      darts,
    })

    // Prüfe welche Zahlen durch diesen Turn neu von ALLEN geschlossen wurden
    const nextStateForClosedCheck = applyCricketEvents([...events, turnEv])
    const targetKeys = match.range === 'short'
      ? ['15', '16', '17', '18', '19', '20', 'BULL']
      : ['10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20', 'BULL']
    const newlyClosed: string[] = targetKeys.filter(tKey => {
      const wasClosedBefore = order.every(pid => (baseState.marksByPlayer[pid]?.[tKey] ?? 0) >= 3)
      const isClosedNow = order.every(pid => (nextStateForClosedCheck.marksByPlayer[pid]?.[tKey] ?? 0) >= 3)
      return !wasClosedBefore && isClosedNow
    })

    const nextEvents: CricketEvent[] = [...events, turnEv]

    let matchJustFinished = false

    if (winnerId) {
      // Leg beendet
      const legFinishedEv: CricketEvent = {
        eventId: (turnEv as any).eventId + '-LEG',
        type: 'CricketLegFinished',
        ts: (turnEv as any).ts,
        matchId: match.matchId,
        winnerPlayerId: winnerId,
      } as CricketEvent
      nextEvents.push(legFinishedEv)

      // Check Serienabschluss
      const tmpAfterLeg = applyCricketEvents(nextEvents)
      const need = targetWinsFromMatch(tmpAfterLeg.match) ?? 0
      const wins = tmpAfterLeg.legWinsByPlayer[winnerId] ?? 0
      if (need > 0 && wins >= need) {
        const matchFinishedEv: CricketEvent = {
          eventId: (turnEv as any).eventId + '-MF',
          type: 'CricketMatchFinished',
          ts: (turnEv as any).ts,
          matchId: match.matchId,
          winnerPlayerId: winnerId,
        } as CricketEvent
        nextEvents.push(matchFinishedEv)

        // Match abschließen + Leaderboards aktualisieren (passiert in finishCricketMatch)
        matchJustFinished = true

        // Ansage: "Game shot, and the match!"
        const matchWinner = match.players.find(p => p.playerId === winnerId)
        announceCricketMatch(matchWinner?.name ?? winnerId)
      } else {
        // Leg fertig aber Match geht weiter -> Leg-Summary anzeigen
        const legIndex = (nextEvents.filter(e => e.type === 'CricketLegFinished').length) - 1
        const winnerPlayer = match.players.find(p => p.playerId === winnerId)
        const legStats = computeLegStats(nextEvents, legIndex, match.range, match.players)

        const legDuration = computeLegDuration(nextEvents, legIndex)

        // Ansage: "And the Leg!"
        announceCricketLeg(winnerPlayer?.name ?? winnerId)

        setLegSummary({
          legIndex,
          winnerId,
          winnerName: winnerPlayer?.name ?? winnerId,
          legStats,
          legWinsAfter: { ...tmpAfterLeg.legWinsByPlayer },
          legDuration,
        })
      }
    }

    // persist Events lokal
    if (matchJustFinished) {
      setSaving(true)
      try {
        await persistCricketEvents(storedId, nextEvents)
        await finishCricketMatch(storedId)
      } catch (err) {
        console.warn('[Cricket] Persist failed:', err)
      } finally {
        setSaving(false)
      }
    } else {
      persistCricketEvents(storedId, nextEvents)
    }
    setEvents(nextEvents)
    setTurn([])
    setMult(1) // Multiplier zurücksetzen nach Turn-Bestätigung

    // Multiplayer: neue Events senden
    if (multiplayer?.enabled) {
      const delta = nextEvents.slice(events.length)
      if (delta.length > 0) multiplayer.submitEvents(delta)
    }

    // Berechne marksAdded für Ansage
    const marksBefore = baseState.marksByPlayer[activeId] ?? {}
    const { marksAdded } = computeMarksDetail(darts, marksBefore, targetKeys)

    // Ansagen: Treffer → Closed → Nächster Spieler (alle queued, in Reihenfolge)
    const marksDelay = marksAdded > 0 ? 1200 : 0
    const closedDelay = newlyClosed.length * 1200 + marksDelay
    if (!winnerId) {
      // 1) Treffer ansagen
      if (marksAdded > 0) {
        setTimeout(() => announceCricketMarks(marksAdded), 400)
      }

      // 2) Neu geschlossene Zahlen ansagen
      if (newlyClosed.length > 0) {
        newlyClosed.forEach((target, i) => {
          setTimeout(() => announceClosed(target), 400 + marksDelay + i * 1200)
        })
      }

      // 3) Nächsten Spieler ansagen — NACH allen anderen Ansagen
      const totalDelay = 400 + closedDelay + 200
      if (match.style !== 'crazy') {
        const nextState = applyCricketEvents(nextEvents)
        const nextActiveId = currentPlayerId(nextState) ?? order[0]
        const nextActivePlayer = match.players.find(p => p.playerId === nextActiveId)
        const isNextLocal = !multiplayer?.enabled || cricketLocalIds.includes(nextActiveId)
        if (isNextLocal) {
          setTimeout(() => announceNextPlayer(nextActivePlayer?.name ?? nextActiveId), totalDelay)
        }
      }
    }

    // Crazy-Target-Ansage für den NÄCHSTEN Turn (nur wenn kein Leg/Match gewonnen)
    // Ansage erfolgt wenn:
    // - Am Anfang jeder Runde (bei sameForAll)
    // - Wenn sich das Ziel geändert hat (z.B. durch Schließung einer Zahl)
    // Delay: Nach evtl. Closed-Ansagen
    if (!winnerId && match.style === 'crazy' && match.crazyMode) {
      // Berechne nächstes Ziel nach dem State-Update
      setTimeout(() => {
        // Nächsten Turn-Index berechnen
        let nextTurnIndex = 0
        for (let i = nextEvents.length - 1; i >= 0; i--) {
          if (nextEvents[i].type === 'CricketLegFinished') break
          if (nextEvents[i].type === 'CricketTurnAdded') nextTurnIndex++
        }

        const sameForAll = match.crazySameForAll ?? true

        const engineOrder = match.range === 'short'
          ? ['15', '16', '17', '18', '19', '20', 'BULL']
          : ['10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20', 'BULL']

        const nextState = applyCricketEvents(nextEvents)
        const nextActiveId = currentPlayerId(nextState) ?? order[0]
        const nextActivePlayer = match.players.find(p => p.playerId === nextActiveId)
        const availTargets = sameForAll
          ? engineOrder.filter(t => order.some(p => (nextState.marksByPlayer[p]?.[t] ?? 0) < 3))
          : engineOrder.filter(t =>
              order.some(p => (nextState.marksByPlayer[p]?.[t] ?? 0) < 3) &&
              (nextState.marksByPlayer[nextActiveId]?.[t] ?? 0) < 3
            )

        if (availTargets.length > 0) {
          const hashStr = (str: string): number => {
            let hash = 0
            for (let i = 0; i < str.length; i++) {
              hash = ((hash << 5) - hash) + str.charCodeAt(i)
              hash = hash & hash
            }
            return Math.abs(hash)
          }
          const seedNum = sameForAll ? Math.floor(nextTurnIndex / order.length) : nextTurnIndex
          const salt = match.crazySalt ?? hashStr(match.matchId)
          const seed = salt + seedNum * 7919
          const seededRandom = (s: number) => {
            return () => {
              let t = s += 0x6D2B79F5
              t = Math.imul(t ^ t >>> 15, t | 1)
              t ^= t + Math.imul(t ^ t >>> 7, t | 61)
              return ((t ^ t >>> 14) >>> 0) / 4294967296
            }
          }

          // Bei Pro-Modus: 3 Ziele berechnen, sonst 1
          const count = match.crazyMode === 'pro' ? 3 : 1
          const targets: string[] = []
          const rng = seededRandom(seed)
          for (let i = 0; i < count; i++) {
            const idx = Math.floor(rng() * availTargets.length)
            targets.push(availTargets[idx])
          }

          // Prüfen ob Ansage erfolgen soll:
          // 1. Bei sameForAll: Am Rundenanfang ODER wenn eine Zahl geschlossen wurde
          // 2. Bei !sameForAll: Immer (jeder Spieler hat eigenes Ziel)
          const isRoundStart = sameForAll && (nextTurnIndex % order.length === 0)
          const targetChanged = newlyClosed.length > 0 // Zahl wurde geschlossen = Ziel könnte sich ändern

          if (!sameForAll || isRoundStart || targetChanged) {
            // Ansage mit Spielername + alle Ziele — nur für lokale Spieler
            const isNextLocalCrazy = !multiplayer?.enabled || cricketLocalIds.includes(nextActiveId)
            if (isNextLocalCrazy) {
              announceCrazyPlayerTarget(nextActivePlayer?.name ?? nextActiveId, targets)
            }
          }
        }
      }, 400 + closedDelay)
    }

    // Lock nach kurzer Zeit freigeben (300ms um sicherzustellen, dass keine Tasten übernommen werden)
    setTimeout(() => {
      turnLockRef.current = false
    }, 300)

    // Falls Match durch -> direkt Summary
    if (matchJustFinished && onShowCricketSummary) {
      const finalMatch = getCricketMatch(storedId)
      if (finalMatch) {
        onShowCricketSummary(storedId)
      }
    }
  }

  function undoLastTurn() {
    if (events.length === 0) return
    cancelDebouncedAnnounce()
    const next = [...events]
    let removedTurn = false
    // poppe MatchFinished / LegFinished / letzten Turn
    while (next.length > 0) {
      const last = next[next.length - 1] as CricketEvent
      if (last.type === 'CricketMatchFinished' || last.type === 'CricketLegFinished') {
        next.pop()
        continue
      }
      if (last.type === 'CricketTurnAdded') {
        next.pop()
        removedTurn = true
      }
      break
    }
    if (!removedTurn) return
    persistCricketEvents(storedId, next)
    setEvents(next)
    setTurn([])
    setMult(1) // Multiplier zurücksetzen

    // Multiplayer: Undo senden
    if (multiplayer?.enabled) {
      multiplayer.undo(events.length - next.length)
    }
  }
}
