// src/screens/GameCricket.tsx
import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  applyCricketEvents,
  currentPlayerId,
  recordCricketTurn,
  targetsFor,
  currentLegContext,
  targetWinsFromMatch,
  type CricketEvent,
  type CricketTurnDart,
} from '../dartsCricket'
import {
  getCricketMatches,
  getCricketMatch,
  persistCricketEvents,
  finishCricketMatch,
} from '../storage'
import { ui } from '../ui'

type Props = {
  matchId: string
  onExit: () => void
  onShowCricketSummary?: (id: string) => void
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
        if (match!.style === 'standard') {
          tally[pid][tKey] = (tally[pid][tKey] ?? 0) + totalOverflow
        } else {
          // cutthroat: Schaden für alle Gegner, die noch offen sind
          for (const op of opponents) {
            if ((marks[op][tKey] ?? 0) < 3) {
              tally[op][tKey] = (tally[op][tKey] ?? 0) + totalOverflow
            }
          }
        }
      }
    }
  }

  return tally
}

/* ===========================
   Hauptkomponente
=========================== */
export default function GameCricket({ matchId, onExit, onShowCricketSummary }: Props) {
  const matchStored = loadCricketById(matchId)
  const [events, setEvents] = useState<CricketEvent[]>(
    () => (matchStored?.events ?? []) as CricketEvent[]
  )

  const baseState = useMemo(() => applyCricketEvents(events), [events])

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

  // Targets für diese Cricket-Variante
  const targetList: (number | 'BULL' | 'MISS')[] = [
    ...(match.range === 'short'
      ? [20, 19, 18, 17, 16, 15]
      : [20, 19, 18, 17, 16, 15, 14, 13, 12, 11, 10]),
    'BULL',
    'MISS',
  ]

  // Serien-Kontext (First to X etc.)
  const legCtx = currentLegContext(baseState)
  const winsArray = Object.values(legCtx.legWinsByPlayer) as number[]
  const leaderWins = winsArray.length ? Math.max(...winsArray) : 0
  const targetWins = legCtx.targetWins
  const starterBadge =
    match.players[legCtx.currentStarterIndex]?.name ?? `P${legCtx.currentStarterIndex + 1}`

  // Input-Status
  const [mult, setMult] = useState<1 | 2 | 3>(1)
  const [turn, setTurn] = useState<CricketTurnDart[]>([])

  // NEU: Eingabe-Lock (Debounce) gegen Doppel-Adds
  const inputLockRef = useRef(false)

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

  // ===== Keyboard Shortcuts =====
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
      const k = e.key

      if (k === 's' || k === 'S') setMult(1)
      if (k === 'd' || k === 'D') setMult(2)
      if (k === 't' || k === 'T') setMult(3)

      if (k === 'm' || k === 'M') addTarget('MISS')
      if (k === 'b' || k === 'B') addTarget('BULL')

      if (k >= '0' && k <= '9') {
        if (numBuf.current === '') {
          if (k === '1' || k === '2') {
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

      if (e.key === 'Enter' && turn.length > 0) confirmTurn()
      if (e.key === 'Backspace') setTurn(t => t.slice(0, -1))
      if (e.key === 'Escape') setTurn([])
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
  }, [turn])

  // ===== Layout Konstanten =====
  const ROW_H = 32
  const headerBarHeight = 28

  const PLAYER_CARD_WIDTH = 140
  const CRICKET_CARD_WIDTH_MIN = 220
  const CRICKET_CARD_WIDTH_MAX = 260

  function playerCardStyle(active: boolean): React.CSSProperties {
    return {
      border: '1px solid #e5e7eb',
      background: active ? '#f3f4f6' : '#fff',
      borderRadius: 12,
      position: 'relative',
      overflow: 'hidden',
      width: PLAYER_CARD_WIDTH,
      minWidth: PLAYER_CARD_WIDTH,
      maxWidth: PLAYER_CARD_WIDTH,
      display: 'flex',
      flexDirection: 'column',
      padding: 10,
      paddingTop: 10,
      boxShadow: active ? '0 0 0 3px rgba(0,0,0,0.05)' : 'none',
    }
  }

  const cricketCardStyle: React.CSSProperties = {
    border: '1px solid #e5e7eb',
    background: '#fff',
    borderRadius: 12,
    position: 'relative',
    overflow: 'hidden',
    minWidth: CRICKET_CARD_WIDTH_MIN,
    maxWidth: CRICKET_CARD_WIDTH_MAX,
    width: CRICKET_CARD_WIDTH_MAX,
    display: 'flex',
    flexDirection: 'column',
    padding: 10,
    paddingTop: 10,
  }

  function PlayerHeader({
    name,
    score,
    side,
  }: {
    name: string
    score: number
    side: 'left' | 'right'
  }) {
    const justifyContent = side === 'left' ? 'flex-end' : 'flex-start'
    const textAlign = side === 'left' ? 'right' : 'left'

    return (
      <div
        style={{
          minHeight: headerBarHeight,
          display: 'flex',
          flexDirection: side === 'left' ? 'row-reverse' : 'row',
          alignItems: 'baseline',
          justifyContent,
          fontWeight: 700,
          fontSize: 14,
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
            fontSize: 14,
            lineHeight: `${headerBarHeight}px`,
          }}
        >
          {name}
        </span>
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
      </div>
    )
  }

  function PlayerRows({ pid, side }: { pid: string; side: 'left' | 'right' }) {
    const alignTallies: 'left' | 'right' = side === 'left' ? 'right' : 'left'

    // Anzeige-Helper für Marks (nach Leg-Ende 0 anzeigen)
    const displayMarkOf = (playerId: string, key: string): 0 | 1 | 2 | 3 => {
      if (legJustFinished) return 0
      return (previewState.marksByPlayer[playerId]?.[key] ?? 0) as 0 | 1 | 2 | 3
    }

    return (
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: side === 'left' ? '1fr 18px' : '18px 1fr',
          gridTemplateRows: `repeat(${targetList.length}, ${ROW_H}px)`,
          alignItems: 'center',
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

    return (
      <div style={playerCardStyle(isActive)}>
        <PlayerHeader name={p?.name ?? pid} score={score} side={side} />
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

            return (
              <button
                key={tKey}
                style={{
                  border: '1px solid #e5e7eb',
                  borderRadius: 12,
                  padding: '6px 10px',
                  background: '#fff',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  cursor: 'pointer',
                  width: '100%',
                  position: 'relative',
                }}
                onClick={() => {
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
                      color: closedAll ? '#475569' : '#111827',
                      background: closedAll ? '#f1f5f9' : 'transparent',
                      borderRadius: 6,
                      padding: closedAll ? '0 6px' : 0,
                    }}
                  >
                    {String(t)}
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
    ...leftIds.map(() => `${PLAYER_CARD_WIDTH}px`),
    `${CRICKET_CARD_WIDTH_MAX}px`,
    ...rightIds.map(() => `${PLAYER_CARD_WIDTH}px`),
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

  return (
    <div style={ui.page}>
      {/* HEADER */}
      <div style={headerStyle}>
        <h2 style={{ margin: 0 }}>
          Cricket {match.range === 'short' ? '(15–20, Bull)' : '(10–20, Bull)'} ·{' '}
          {match.style === 'cutthroat' ? 'Cutthroat' : 'Standard'}
          {typeof targetWins === 'number' ? (
            <span style={{ ...ui.sub, marginLeft: 8 }}>
              First to {targetWins} · Stand: {leaderWins} / {targetWins}
            </span>
          ) : null}
          <span
            style={{
              ...ui.sub,
              marginLeft: 12,
              padding: '2px 8px',
              border: '1px solid #e5e7eb',
              borderRadius: 999,
            }}
          >
            Starter: {starterBadge}
          </span>
        </h2>
        <button style={ui.backBtn} onClick={onExit}>
          ← Menü
        </button>
      </div>

      {/* CONTROLS */}
      <div style={{ ...ui.card, marginBottom: 12 }}>
        <div
          style={{
            display: 'flex',
            gap: 8,
            justifyContent: 'center',
            flexWrap: 'wrap',
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
              }}
              onClick={() => setMult(m as 1 | 2 | 3)}
            >
              {m === 1 ? 'Single (S)' : m === 2 ? 'Double (D)' : 'Triple (T)'}
            </button>
          ))}
        </div>
        <div style={{ ...ui.sub, textAlign: 'center', marginTop: 6 }}>
          Shortcuts: <strong>10–20</strong> · <strong>B</strong>=Bull (S=Bull,
          D/T=DBull) · <strong>M</strong>=Miss · <strong>Enter</strong>=Bestätigen ·{' '}
          <strong>←</strong>=Back · <strong>Esc</strong>=Clear ·{' '}
          <strong>Strg/⌘+Z</strong>=Undo Turn
        </div>
      </div>

      {/* GRID (Spieler links + Cricket + Spieler rechts) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns,
          alignItems: 'start',
          gap: 12,
          width: '100%',
          justifyContent: 'center',
        }}
      >
        {gridCells.map((cell, idx) => {
          if (cell.kind === 'cricket') {
            return <div key={`c-${idx}`}>{renderCricketColumn()}</div>
          }
          return <div key={cell.pid}>{renderPlayerCard(cell.pid, cell.side)}</div>
        })}
      </div>

      {/* AKTUELLE RUNDE */}
      <div style={{ ...ui.card, marginTop: 12 }}>
        <div
          style={{
            fontWeight: 700,
            marginBottom: 6,
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            rowGap: 4,
          }}
        >
          <span style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span>Aktuelle Runde</span>
            <span style={{ fontSize: 12, opacity: 0.7, fontWeight: 400 }}>
              {Array.from({ length: 3 }).map((_, i) => {
                const used = i < dartsUsed
                return (
                  <span
                    key={i}
                    style={{
                      marginRight: 2,
                      opacity: used ? 0.25 : 1,
                      fontWeight: 700,
                    }}
                  >
                    ➤
                  </span>
                )
              })}
              <span style={{ marginLeft: 4, opacity: 0.6 }}>({dartsLeft} left)</span>
            </span>
          </span>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {turn.map((d, i) => (
            <span key={i} style={ui.badge}>
              {d.target === 'MISS'
                ? 'MISS'
                : d.target === 'BULL'
                ? d.mult === 2
                  ? 'DBULL'
                  : 'BULL'
                : `${d.mult === 3 ? 'T' : d.mult === 2 ? 'D' : 'S'}${d.target}`}
            </span>
          ))}
          {turn.length === 0 && <span style={ui.sub}>—</span>}
        </div>

        <div
          style={{
            display: 'flex',
            gap: 8,
            justifyContent: 'flex-end',
            marginTop: 8,
            flexWrap: 'wrap',
          }}
        >
          <button style={ui.backBtn} onClick={undoLastTurn} title="Undo (Strg/⌘+Z)">
            ↶ Undo Turn
          </button>
          <button
            style={ui.backBtn}
            onClick={() => setTurn(t => t.slice(0, -1))}
            disabled={turn.length === 0}
          >
            ← Back
          </button>
          <button
            style={ui.backBtn}
            onClick={() => setTurn([])}
            disabled={turn.length === 0}
          >
            ✖ Clear
          </button>
          <button
            style={{
              ...ui.backBtn,
              ...(turn.length > 0
                ? {
                    borderColor: '#111827',
                    background: '#111827',
                    color: '#fff',
                    fontWeight: 700,
                  }
                : {}),
            }}
            onClick={() => confirmTurn()}
            disabled={turn.length === 0}
          >
            ✔ Turn bestätigen
          </button>
        </div>
      </div>
    </div>
  )

  // ===== Turn Helpers =====
  function addTarget(t: number | 'BULL' | 'MISS') {
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
      const m = t === 'BULL' && mult === 3 ? 2 : mult // Triple Bull => Double Bull
      dart = { target: t, mult: m }
    }

    setTurn(prev => {
      if (prev.length >= 3) return prev
      const next: CricketTurnDart[] = [...prev, dart]
      if (next.length === 3) {
        setTimeout(() => confirmTurn(next), 0)
      }
      return next
    })

    if (mult !== 1 && t !== 'MISS') setMult(1)

    if (numBufTimer.current) window.clearTimeout(numBufTimer.current)
    numBuf.current = ''
  }

  function confirmTurn(override?: CricketTurnDart[]) {
    const darts = override ?? turn
    if (darts.length === 0) return

    const { event: turnEv, winnerId } = recordCricketTurn({
      state: baseState,
      playerId: activeId,
      darts,
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
      }
    }

    // persist Events lokal
    persistCricketEvents(storedId, nextEvents)
    setEvents(nextEvents)
    setTurn([])

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
  }
}
