// src/screens/GameCricket.tsx
import React, { useEffect, useMemo, useRef, useState } from 'react'
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
} from '../storage'
import { ui } from '../ui'
import CricketArcadeView from '../components/CricketArcadeView'
import GameControls, { PauseOverlay } from '../components/GameControls'
import CricketProgressChart, { prepareCricketChartData, CRICKET_TARGETS } from '../components/CricketProgressChart'
import CricketGanttChart, { computeFieldClosures, type GanttChartPlayer } from '../components/CricketGanttChart'
import CricketTurnList, { formatDartLabel, computeMarksDetail, type CricketTurnEntry } from '../components/CricketTurnList'
import { PLAYER_COLORS } from '../components/ScoreProgressionChart'
import { initSpeech, setSpeechEnabled, announceGameStart, announceNextPlayer, announceCrazyPlayerTarget, announceCricketLeg, announceCricketMatch, announceClosed, announceCricketMarks, announcePlayerNeeds, playTriple20Sound, cancelDebouncedAnnounce, debouncedAnnounce } from '../speech'
import './game.css'

type MultiplayerProp = {
  enabled: boolean
  roomCode: string
  myPlayerId: string
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
  // Globales Theme System
  const { isArcade, colors } = useTheme()

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

  const matchStored = loadCricketById(matchId)
  const [events, setEvents] = useState<CricketEvent[]>(
    () => (matchStored?.events ?? []) as CricketEvent[]
  )

  const baseState = useMemo(() => applyCricketEvents(events), [events])

  // Multiplayer: Remote-Events synchronisieren
  useEffect(() => {
    if (!multiplayer?.remoteEvents) return
    const remote = multiplayer.remoteEvents as CricketEvent[]
    setEvents(remote)
    persistCricketEvents(matchId, remote)
  }, [multiplayer?.remoteEvents]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!matchStored || !baseState.match) {
    return (
      <div style={ui.page}>
        <div
          style={{
            ...ui.headerRow,
            position: 'sticky',
            top: 0,
            background: '#fff',
            zIndex: 10,
          }}
        >
          <h2 style={{ margin: 0 }}>Cricket</h2>
          <button style={ui.backBtn} onClick={onExit}>
            ← Menü
          </button>
        </div>
        <div style={ui.centerPage}>
          <div style={ui.centerInner}>Kein Cricket-Match gefunden.</div>
        </div>
      </div>
    )
  }

  const storedId = matchStored.id
  const match = baseState.match
  const order = baseState.players
  const activeId = currentPlayerId(baseState) ?? order[0]

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
  const targetList: (number | 'BULL' | 'MISS')[] = [
    ...(match.range === 'short'
      ? [20, 19, 18, 17, 16, 15]
      : [20, 19, 18, 17, 16, 15, 14, 13, 12, 11, 10]),
    'BULL',
    'MISS',
  ]

  // Valid Targets für Marks-Berechnung (ohne MISS)
  const validTargets = match.range === 'short'
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

  // ===== Keyboard Shortcuts =====
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
  const screenWidth = typeof window !== 'undefined' ? window.innerWidth : 800
  const isMobileScreen = screenWidth < 600
  const playerCount = order.length

  const ROW_H = isMobileScreen ? 26 : 32
  const headerBarHeight = isMobileScreen ? 22 : 28

  // On mobile: fit all columns within screen width (accounting for gaps + borders)
  const CRICKET_CARD_WIDTH_MIN = isMobileScreen ? 70 : 220
  const CRICKET_CARD_WIDTH_MAX = isMobileScreen ? 80 : 260
  const mobilePlayersOnScreen = Math.min(playerCount, 4)
  const mobileGaps = (mobilePlayersOnScreen + 1) * 4 // gaps between columns
  const PLAYER_CARD_WIDTH = isMobileScreen
    ? Math.max(50, Math.floor((screenWidth - CRICKET_CARD_WIDTH_MAX - mobileGaps - 24) / mobilePlayersOnScreen))
    : 140

  function playerCardStyle(active: boolean, playerColor?: string): React.CSSProperties {
    const color = playerColor || '#f97316'
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
      padding: isMobileScreen ? 4 : 10,
      paddingTop: isMobileScreen ? 4 : 10,
      boxShadow: active ? `0 0 20px ${color}50, 0 0 40px ${color}30` : 'none',
      transition: 'box-shadow 0.3s ease, border-color 0.3s ease, background 0.3s ease',
      boxSizing: 'border-box',
    }
  }

  const cricketCardStyle: React.CSSProperties = {
    border: '1px solid #e5e7eb',
    background: '#fff',
    borderRadius: isMobileScreen ? 8 : 12,
    position: 'relative',
    overflow: 'hidden',
    minWidth: isMobileScreen ? 0 : CRICKET_CARD_WIDTH_MIN,
    maxWidth: isMobileScreen ? undefined : CRICKET_CARD_WIDTH_MAX,
    width: isMobileScreen ? '100%' : CRICKET_CARD_WIDTH_MAX,
    display: 'flex',
    flexDirection: 'column',
    padding: isMobileScreen ? 4 : 10,
    paddingTop: isMobileScreen ? 4 : 10,
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
    const justifyContent = side === 'left' ? 'flex-end' : 'flex-start'
    const textAlign = side === 'left' ? 'right' : 'left'
    const fontSize = isMobileScreen ? 11 : 14

    return (
      <div
        style={{
          minHeight: headerBarHeight,
          display: 'flex',
          flexDirection: side === 'left' ? 'row-reverse' : 'row',
          alignItems: 'baseline',
          justifyContent,
          fontWeight: 700,
          fontSize,
          lineHeight: `${headerBarHeight}px`,
          marginBottom: isMobileScreen ? 2 : 6,
          textAlign,
          width: '100%',
          gap: isMobileScreen ? 2 : 8,
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
            ? '18px' // Simple: nur Marks
            : side === 'left' ? '1fr 18px' : '18px 1fr',
          gridTemplateRows: `repeat(${targetList.length}, ${ROW_H}px)`,
          alignItems: 'center',
          justifyContent: isSimple ? (side === 'left' ? 'flex-end' : 'flex-start') : undefined,
          rowGap: 4,
          columnGap: 8,
          textAlign: alignTallies === 'right' ? 'right' : 'left',
        }}
      >
        {targetList.map(t => {
          const tKey = String(t)
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
              count={t === 'MISS' ? 0 : tallyPrev}
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

    return (
      <div style={playerCardStyle(isActive, playerColor)}>
        <PlayerHeader name={p?.name ?? pid} score={score} side={side} hideScore={match.style === 'simple' || (match.style === 'crazy' && ((match as any).crazyScoringMode ?? ((match as any).crazyWithPoints ? 'standard' : 'simple')) === 'simple')} />
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
          <span>Cricket</span>
          <span
            style={{
              fontSize: 12,
              opacity: 0.7,
              marginTop: 4,
              whiteSpace: 'nowrap',
            }}
          >
            {match.range === 'short' ? '15–20, Bull' : '10–20, Bull'}
          </span>
        </div>

        {/* Target Buttons */}
        <div
          style={{
            display: 'grid',
            gridTemplateRows: `repeat(${targetList.length}, ${ROW_H}px)`,
            rowGap: 4,
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
                  border: isCrazyTarget ? '2px solid #f59e0b' : '1px solid #e5e7eb',
                  borderRadius: 12,
                  padding: '6px 10px',
                  background: isCrazyTarget ? '#fef3c7' : '#fff',
                  display: 'flex',
                  justifyContent: 'space-between',
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
                    fontSize: 14,
                    position: 'relative',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <span
                    style={{
                      textDecoration: closedAll ? 'line-through' : 'none',
                      textDecorationThickness: closedAll ? '3px' : undefined,
                      color: isCrazyTarget ? '#b45309' : (closedAll ? '#475569' : '#111827'),
                      background: closedAll ? '#f1f5f9' : 'transparent',
                      borderRadius: 6,
                      padding: closedAll ? '0 6px' : 0,
                    }}
                  >
                    {isCrazyTarget && '🎯 '}{String(t)}
                  </span>
                  {closedAll && (
                    <span style={{ ...ui.badge, background: '#e2e8f0', color: '#334155' }}>
                      CLOSED
                    </span>
                  )}
                </div>

                <div style={{ ...ui.sub, textAlign: 'right' }}>
                  {t === 'MISS'
                    ? 'kein Treffer (M)'
                    : `werfen (${mult === 1 ? 'S' : mult === 2 ? 'D' : 'T'})${
                        t === 'BULL' ? ' · S=Bull, D/T=DBull' : ''
                      }`}
                </div>
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

  const gridTemplateColumns = [
    ...leftIds.map(() => isMobileScreen ? '1fr' : `${PLAYER_CARD_WIDTH}px`),
    isMobileScreen ? `${CRICKET_CARD_WIDTH_MAX}px` : `${CRICKET_CARD_WIDTH_MAX}px`,
    ...rightIds.map(() => isMobileScreen ? '1fr' : `${PLAYER_CARD_WIDTH}px`),
  ].join(' ')

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
  }${legStandStr}`

  // Dynamischer Hintergrund basierend auf aktivem Spieler
  const backgroundStyle = playerColorBgEnabled
    ? {
        ...ui.page,
        background: `linear-gradient(180deg, ${activePlayerColor}20 0%, ${activePlayerColor}05 100%)`,
        transition: 'background 0.5s ease',
      }
    : ui.page

  // Enter-Taste zum Weitergehen bei Leg-Summary
  useEffect(() => {
    if (!legSummary) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Enter') setLegSummary(null)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [legSummary])

  return (
    <div style={backgroundStyle}>
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

      {/* Score-Info Leiste — nur im Normal-Modus (im Arcade in der ArcadeView integriert) */}
      {!isArcade && (
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
      {!isArcade ? (
        /* NEUES LAYOUT: Spieler oben, darunter Leg-Verlauf + Eingabe nebeneinander */
        <div style={{ display: 'flex', flexDirection: 'column', gap: isMobileScreen ? 6 : 12, width: '100%', maxWidth: isMobileScreen ? screenWidth : undefined, margin: '0 auto' }}>
          {/* OBERER BEREICH: Spieler-Grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns,
              alignItems: 'start',
              gap: isMobileScreen ? 4 : 12,
              width: '100%',
              justifyContent: 'center',
              overflowX: 'auto',
              WebkitOverflowScrolling: 'touch',
            }}
          >
            {gridCells.map((cell, idx) => {
              if (cell.kind === 'cricket') {
                // Cricket-Column: Nur Marks, keine Buttons mehr
                return (
                  <div key={`c-${idx}`} style={cricketCardStyle}>
                    {/* Cricket Header */}
                    <div
                      style={{
                        minHeight: headerBarHeight,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 700,
                        fontSize: isMobileScreen ? 11 : 14,
                        lineHeight: `${headerBarHeight}px`,
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

                    {/* Target-Felder (nur Anzeige, keine Buttons) */}
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateRows: `repeat(${targetList.length - 1}, ${ROW_H}px)`,
                        rowGap: 4,
                      }}
                    >
                      {targetList.filter(t => t !== 'MISS').map(t => {
                        const tKey = String(t)
                        const closedAll = isClosedForAll(tKey)
                        const activeCrazyTarget = crazyTargets?.[Math.min(turn.length, (crazyTargets?.length ?? 1) - 1)]
                        const isCrazyTarget = activeCrazyTarget === tKey

                        return (
                          <div
                            key={tKey}
                            style={{
                              borderRadius: isMobileScreen ? 4 : 8,
                              padding: isMobileScreen ? '2px 4px' : '4px 10px',
                              background: isCrazyTarget ? '#fef3c7' : (closedAll ? '#f1f5f9' : '#fff'),
                              border: isCrazyTarget ? '2px solid #f59e0b' : '1px solid #e5e7eb',
                              display: 'flex',
                              justifyContent: 'center',
                              alignItems: 'center',
                              fontWeight: 700,
                              fontSize: isMobileScreen ? 12 : 14,
                              color: closedAll ? '#94a3b8' : '#111827',
                              textDecoration: closedAll ? 'line-through' : 'none',
                            }}
                          >
                            {isCrazyTarget && '🎯 '}{String(t)}
                            {closedAll && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 600, color: '#64748b' }}>CLOSED</span>}
                          </div>
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
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, color: '#374151' }}>
                Leg-Verlauf
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

              {/* Target Buttons - alle in einer Reihe */}
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 4,
                  marginBottom: 8,
                }}
              >
                {/* Short Mode: 20, 19, 18, 17, 16, 15, Bull, Miss */}
                {[20, 19, 18, 17, 16, 15].map(num => {
                  const tKey = String(num)
                  const closedAll = isClosedForAll(tKey)
                  const activeCrazyTarget = crazyTargets?.[Math.min(turn.length, (crazyTargets?.length ?? 1) - 1)]
                  const isCrazyTarget = activeCrazyTarget === tKey

                  return (
                    <button
                      key={num}
                      type="button"
                      style={{
                        border: isCrazyTarget ? '2px solid #f59e0b' : '1px solid #e5e7eb',
                        borderRadius: 6,
                        padding: '8px 10px',
                        background: isCrazyTarget ? '#fef3c7' : '#fff',
                        fontWeight: 700,
                        fontSize: 14,
                        cursor: 'pointer',
                        color: closedAll ? '#94a3b8' : '#111827',
                        textDecoration: closedAll ? 'line-through' : 'none',
                      }}
                      onClick={(e) => {
                        e.currentTarget.blur()
                        addTarget(num)
                      }}
                    >
                      {num}
                    </button>
                  )
                })}
                {/* Bull */}
                <button
                  type="button"
                  style={{
                    border: crazyTargets?.[Math.min(turn.length, (crazyTargets?.length ?? 1) - 1)] === 'BULL' ? '2px solid #f59e0b' : '1px solid #e5e7eb',
                    borderRadius: 6,
                    padding: '8px 10px',
                    background: crazyTargets?.[Math.min(turn.length, (crazyTargets?.length ?? 1) - 1)] === 'BULL' ? '#fef3c7' : '#fff',
                    fontWeight: 700,
                    fontSize: 14,
                    cursor: 'pointer',
                  }}
                  onClick={(e) => {
                    e.currentTarget.blur()
                    addTarget('BULL')
                  }}
                >
                  Bull
                </button>
                {/* Miss */}
                <button
                  type="button"
                  style={{
                    border: '1px solid #e5e7eb',
                    borderRadius: 6,
                    padding: '8px 10px',
                    background: '#f8fafc',
                    fontWeight: 600,
                    fontSize: 14,
                    cursor: 'pointer',
                    color: '#64748b',
                  }}
                  onClick={(e) => {
                    e.currentTarget.blur()
                    addTarget('MISS')
                  }}
                >
                  Miss
                </button>
              </div>

              {/* Long Mode: Extra Zahlen 10-14 */}
              {match.range === 'long' && (
                <div
                  style={{
                    display: 'flex',
                    gap: 4,
                    marginBottom: 8,
                  }}
                >
                  {[14, 13, 12, 11, 10].map(num => {
                    const tKey = String(num)
                    const closedAll = isClosedForAll(tKey)
                    return (
                      <button
                        key={num}
                        type="button"
                        style={{
                          flex: 1,
                          border: '1px solid #e5e7eb',
                          borderRadius: 6,
                          padding: '6px 4px',
                          background: '#fff',
                          fontWeight: 700,
                          fontSize: 13,
                          cursor: 'pointer',
                          color: closedAll ? '#94a3b8' : '#111827',
                          textDecoration: closedAll ? 'line-through' : 'none',
                        }}
                        onClick={(e) => {
                          e.currentTarget.blur()
                          addTarget(num)
                        }}
                      >
                        {num}
                      </button>
                    )
                  })}
                </div>
              )}

              {/* S/D/T Multiplier */}
              <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
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
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: 4 }}>
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
              </div>
            </div>
          </div>
        </div>
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
        />
      )}

    </div>
  )

  // ===== Turn Helpers =====
  function addTarget(t: number | 'BULL' | 'MISS') {
    // Pause? Keine Eingaben
    if (gamePaused) return

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

  function confirmTurn(override?: CricketTurnDart[]) {
    // Pause? Keine Eingaben
    if (gamePaused) return

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
        finishCricketMatch(storedId)
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
    persistCricketEvents(storedId, nextEvents)
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

    // Ansage: Treffer (nur wenn welche gezählt haben)
    if (!winnerId && marksAdded > 0) {
      setTimeout(() => announceCricketMarks(marksAdded), 400)
    }

    // Ansage: Neu geschlossene Zahlen (nicht bei Leg/Match-Ende, da dort eigene Ansage kommt)
    // Zeitplan: Treffer (400ms) -> 1200ms Platz -> Closed Ansagen (1600ms, 2800ms, etc.)
    const marksDelay = marksAdded > 0 ? 1200 : 0 // Platz für Treffer-Ansage
    if (!winnerId && newlyClosed.length > 0) {
      newlyClosed.forEach((target, i) => {
        setTimeout(() => announceClosed(target), 400 + marksDelay + i * 1200)
      })
    }

    // Nächsten Spieler ansagen (nur bei normalem Cricket, nicht Crazy - bei Crazy erfolgt die Ansage mit Target)
    // Nach Treffer + Closed Ansagen
    const closedDelay = newlyClosed.length * 1200 + marksDelay
    if (!winnerId && match.style !== 'crazy') {
      const nextState = applyCricketEvents(nextEvents)
      const nextActiveId = currentPlayerId(nextState) ?? order[0]
      const nextActivePlayer = match.players.find(p => p.playerId === nextActiveId)
      debouncedAnnounce(() => announceNextPlayer(nextActivePlayer?.name ?? nextActiveId))
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
            // Ansage mit Spielername + alle Ziele
            announceCrazyPlayerTarget(nextActivePlayer?.name ?? nextActiveId, targets)
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
