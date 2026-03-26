// src/components/CricketArcadeView.tsx
// Klassische Dartautomaten-Ansicht für Cricket
// Unified Dark Screen: Scoreboard + Input + Controls in einem

import React from 'react'
import type { CricketTurnDart } from '../dartsCricket'
import CricketTurnList, { type CricketTurnEntry } from './CricketTurnList'

type PlayerData = {
  id: string
  name: string
  marks: Record<string, number>  // '20': 3, '19': 2, etc. (mit Preview)
  baseMarks: Record<string, number>  // Marks vor dem aktuellen Turn (ohne Preview)
  score: number
  isActive: boolean
  color?: string  // Spielerfarbe für Glow-Effekt
}

type Props = {
  players: PlayerData[]
  currentDart: number  // 1-3 (geworfene Darts in dieser Runde)
  currentRound: number
  targets: string[]  // ['20','19','18','17','16','15','BULL']
  hideScore?: boolean  // Für Simple/Crazy Modi
  closedTargets?: string[]  // Von allen Spielern geschlossene Zahlen
  crazyTargets?: string[]  // Aktive Ziele bei Crazy-Modus

  // Match-Info (für integrierte Score-Leiste)
  legScore?: string       // z.B. "1 : 0"
  targetWins?: number     // z.B. 3 (First to 3)
  starterName?: string    // z.B. "David"

  // Input & Controls
  turn?: CricketTurnDart[]
  mult?: 1 | 2 | 3
  onAddTarget?: (t: number | 'BULL' | 'MISS') => void
  onSetMult?: (m: 1 | 2 | 3) => void
  onUndo?: () => void
  onUndoDart?: () => void  // Remove last dart from current turn only
  onBack?: () => void
  onConfirm?: () => void
  onAnnounceStatus?: () => void
  isShort?: boolean  // short=6 Zahlen, long=11 Zahlen
  gamePaused?: boolean

  // Crazy Pro Vorschau
  crazyPro?: boolean
  crazyProTargets?: string[]

  // Turn History für Leg-Verlauf
  turnHistory?: CricketTurnEntry[]
  turnListRef?: React.RefObject<HTMLDivElement | null>
}

// Farben
const colors = {
  background: '#0a0a0a',
  ledOn: '#f97316',      // Orange für aktive LEDs
  ledOff: '#374151',     // Dunkelgrau für inaktive LEDs
  ledGlow: '#fb923c',    // Helleres Orange für Glow
  statusGreen: '#22c55e',
  statusGreenDim: '#166534',
  textDim: '#6b7280',
  textBright: '#e5e7eb',
  activeGlow: 'rgba(249, 115, 22, 0.3)',
}

// 7-Segment Style Zahl (15% größer)
function SegmentNumber({ value, digits = 4, size = 'normal' }: { value: number; digits?: number; size?: 'small' | 'normal' | 'large' }) {
  const padded = String(value).padStart(digits, '0')
  const fontSize = size === 'large' ? 32 : size === 'small' ? 16 : 23
  return (
    <div
      style={{
        fontFamily: "'Courier New', monospace",
        fontSize,
        fontWeight: 700,
        letterSpacing: 2,
        color: colors.ledOn,
        textShadow: `0 0 8px ${colors.ledGlow}, 0 0 16px ${colors.ledGlow}`,
      }}
    >
      {padded}
    </div>
  )
}

// LED Dot
function LED({ on, color = 'orange', preview = false, size = 10 }: { on: boolean; color?: 'orange' | 'green'; preview?: boolean; size?: number }) {
  const ledColor = color === 'green' ? colors.statusGreen : colors.ledOn
  const glowColor = color === 'green' ? colors.statusGreen : colors.ledGlow
  const opacity = preview ? 0.5 : 1
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: on ? ledColor : colors.ledOff,
        boxShadow: on && !preview ? `0 0 6px ${glowColor}, 0 0 12px ${glowColor}` : 'none',
        transition: 'all 0.15s ease',
        opacity: on ? opacity : 1,
      }}
    />
  )
}

// Mark-LEDs für eine Zahl (3 LEDs vertikal)
function MarkLEDs({ marks, baseMarks = 0, closed, size = 10 }: { marks: number; baseMarks?: number; closed?: boolean; size?: number }) {
  const count = Math.min(3, Math.max(0, marks))
  const baseCount = Math.min(3, Math.max(0, baseMarks))
  const color = closed ? 'green' : 'orange'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, alignItems: 'center' }}>
      <LED on={count >= 3} color={color} preview={baseCount < 3 && count >= 3} size={size} />
      <LED on={count >= 2} color={color} preview={baseCount < 2 && count >= 2} size={size} />
      <LED on={count >= 1} color={color} preview={baseCount < 1 && count >= 1} size={size} />
    </div>
  )
}

// Spieler-Zeile — compact mode for mobile with 3+ players
function PlayerRow({
  player,
  targets,
  hideScore,
  compact,
  closedTargets = [],
}: {
  player: PlayerData
  targets: string[]
  hideScore?: boolean
  closedTargets?: string[]
  compact?: boolean
}) {
  const isActive = player.isActive
  const playerColor = player.color || colors.ledOn
  const playerGlow = `${playerColor}50`

  const pad = compact ? '6px 8px' : '12px 14px'
  const nameSize = compact ? 13 : 18
  const markGap = compact ? 6 : 14
  const markMin = compact ? 20 : 30
  const markFontSize = compact ? 11 : 14
  const ledSize = compact ? 10 : 14

  return (
    <div
      style={{
        background: isActive ? `${playerColor}20` : 'transparent',
        borderRadius: compact ? 8 : 10,
        padding: pad,
        border: isActive ? `2px solid ${playerColor}` : '2px solid transparent',
        boxShadow: isActive ? `0 0 15px ${playerGlow}, 0 0 30px ${playerColor}20` : 'none',
        transition: 'all 0.3s ease',
      }}
    >
      {/* Spielername */}
      <div
        style={{
          textAlign: 'center',
          marginBottom: compact ? 4 : 12,
          fontSize: nameSize,
          fontWeight: 700,
          color: isActive ? playerColor : colors.textDim,
          textTransform: 'uppercase',
          letterSpacing: compact ? 1 : 3,
          textShadow: isActive ? `0 0 12px ${playerGlow}` : 'none',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}
      >
        {player.name}
        {isActive && (
          <span style={{ marginLeft: 6, fontSize: compact ? 9 : 11, color: colors.statusGreen, animation: 'pulse 1.5s infinite' }}>
            {compact ? '●' : 'THROWING'}
          </span>
        )}
      </div>

      {/* Marks + Score */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: compact ? 4 : 10 }}>
        {/* Mark LEDs */}
        <div style={{ display: 'flex', gap: markGap, flex: 1, justifyContent: 'center' }}>
          {targets.map(t => {
            const key = t === 'BULL' ? 'BULL' : t
            const marks = player.marks[key] ?? 0
            const baseMarks = player.baseMarks[key] ?? 0
            const isClosed = closedTargets.includes(t)
            return (
              <div key={t} style={{ textAlign: 'center', minWidth: markMin, opacity: isClosed ? 0.5 : 1 }}>
                <div style={{
                  fontSize: markFontSize,
                  color: isClosed ? colors.statusGreen : (marks >= 3 ? colors.ledOn : colors.textDim),
                  marginBottom: compact ? 2 : 5,
                  fontWeight: marks >= 3 ? 700 : 500,
                  textDecoration: isClosed ? 'line-through' : 'none',
                  letterSpacing: 1,
                }}>
                  {t === 'BULL' ? 'B' : t}
                </div>
                <MarkLEDs marks={marks} baseMarks={baseMarks} closed={isClosed} size={ledSize} />
              </div>
            )
          })}
        </div>

        {/* Score */}
        {!hideScore && (
          <div style={{
            padding: compact ? '4px 6px' : '10px 14px',
            background: '#111', borderRadius: compact ? 6 : 10,
            border: '1px solid #222', flexShrink: 0,
          }}>
            <SegmentNumber value={player.score} digits={compact ? 3 : 4} size={compact ? 'small' : 'large'} />
          </div>
        )}
      </div>
    </div>
  )
}

// Dart-Label für Badge
function dartLabel(d: CricketTurnDart): string {
  if (d.target === 'MISS') return 'MISS'
  if (d.target === 'BULL') return d.mult === 2 ? 'DB' : 'B'
  return `${d.mult === 3 ? 'T' : d.mult === 2 ? 'D' : 'S'}${d.target}`
}

// Berechnet die Spieler-Reihen basierend auf Anzahl
// Layout: Bei 3 Spielern → 1+3 oben, 2 unten (nicht 1+2 oben, 3 unten)
function getPlayerRows<T>(players: T[]): { topRows: T[][]; bottomRows: T[][] } {
  const n = players.length

  switch (n) {
    case 1:
      return { topRows: [[players[0]]], bottomRows: [] }
    case 2:
      return { topRows: [[players[0]]], bottomRows: [[players[1]]] }
    case 3:
      // Spieler 1 + 3 oben, Spieler 2 unten
      return { topRows: [[players[0], players[2]]], bottomRows: [[players[1]]] }
    case 4:
      return { topRows: [[players[0], players[1]]], bottomRows: [[players[2], players[3]]] }
    case 5:
      // 1 oben, 2+3 mitte (=top), 4+5 unten
      return { topRows: [[players[0]], [players[1], players[2]]], bottomRows: [[players[3], players[4]]] }
    case 6:
      return { topRows: [[players[0], players[1]], [players[2], players[3]]], bottomRows: [[players[4], players[5]]] }
    case 7:
      return { topRows: [[players[0], players[1]], [players[2], players[3]]], bottomRows: [[players[4], players[5]], [players[6]]] }
    case 8:
      return { topRows: [[players[0], players[1]], [players[2], players[3]]], bottomRows: [[players[4], players[5]], [players[6], players[7]]] }
    default:
      // Fallback: 2er-Reihen, Hälfte oben, Hälfte unten
      const allRows: T[][] = []
      for (let i = 0; i < n; i += 2) {
        allRows.push(players.slice(i, Math.min(i + 2, n)))
      }
      const midpoint = Math.ceil(allRows.length / 2)
      return { topRows: allRows.slice(0, midpoint), bottomRows: allRows.slice(midpoint) }
  }
}

// Status-Zeile (Mitte) — kompakt mit Darts
function StatusRow({
  currentDart,
  currentRound,
  bullActive,
  crazyTargets,
  darts,
}: {
  currentDart: number
  currentRound: number
  bullActive?: boolean
  crazyTargets?: string[]
  darts?: CricketTurnDart[]
}) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 20,
        padding: '8px 0',
        borderTop: `1px solid #222`,
        borderBottom: `1px solid #222`,
      }}
    >
      {/* Dart Counter */}
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 9, color: colors.statusGreenDim, letterSpacing: 1, marginBottom: 1 }}>DART</div>
        <div
          style={{
            fontSize: 20,
            fontWeight: 700,
            color: colors.statusGreen,
            textShadow: `0 0 6px ${colors.statusGreen}`,
            fontFamily: "'Courier New', monospace",
          }}
        >
          {currentDart}
        </div>
      </div>

      {/* Round Counter */}
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 9, color: colors.statusGreenDim, letterSpacing: 1, marginBottom: 1 }}>RND</div>
        <div
          style={{
            fontSize: 20,
            fontWeight: 700,
            color: colors.statusGreen,
            textShadow: `0 0 6px ${colors.statusGreen}`,
            fontFamily: "'Courier New', monospace",
          }}
        >
          {currentRound}
        </div>
      </div>

      {/* Crazy Targets oder Bull Status */}
      {crazyTargets && crazyTargets.length > 0 ? (
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 9, color: '#fbbf24', letterSpacing: 1, marginBottom: 1 }}>
            {crazyTargets.length > 1 ? 'TARGETS' : 'TARGET'}
          </div>
          <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
            {crazyTargets.map((t, i) => (
              <div
                key={i}
                style={{
                  fontSize: 18,
                  fontWeight: 700,
                  color: '#fbbf24',
                  textShadow: '0 0 10px #fbbf24',
                  fontFamily: "'Courier New', monospace",
                  animation: 'pulse 1s infinite',
                }}
              >
                {t === 'BULL' ? 'B' : t}
              </div>
            ))}
          </div>
        </div>
      ) : bullActive ? (
        <div
          style={{
            fontSize: 18,
            fontWeight: 700,
            color: colors.ledOn,
            textShadow: `0 0 10px ${colors.ledGlow}`,
            letterSpacing: 4,
            animation: 'pulse 1s infinite',
          }}
        >
          B B
        </div>
      ) : null}

      {/* Aktuelle Darts */}
      {darts && (
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <span style={{ fontSize: 9, color: colors.textDim, letterSpacing: 1 }}>DARTS</span>
          {[0, 1, 2].map(i => {
            const d = darts[i]
            return (
              <span
                key={i}
                style={{
                  fontFamily: "'Courier New', monospace",
                  fontSize: 12,
                  fontWeight: 800,
                  color: d ? colors.ledOn : '#333',
                  background: d ? '#151515' : '#111',
                  padding: '2px 6px',
                  borderRadius: 4,
                  border: d ? `1px solid ${colors.ledOn}` : '1px solid #1a1a1a',
                  textShadow: d ? `0 0 6px ${colors.ledGlow}` : 'none',
                  minWidth: 32,
                  textAlign: 'center',
                }}
              >
                {d ? dartLabel(d) : '—'}
              </span>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function CricketArcadeView({
  players,
  currentDart,
  currentRound,
  targets,
  hideScore,
  closedTargets = [],
  crazyTargets,
  // Match-Info
  legScore,
  targetWins,
  // Input props
  turn,
  mult = 1,
  onAddTarget,
  onSetMult,
  onUndo,
  onBack,
  onConfirm,
  onAnnounceStatus,
  onUndoDart,
  isShort = true,
  crazyPro,
  crazyProTargets,
  turnHistory,
  turnListRef,
}: Props) {
  const hasControls = !!onAddTarget
  const darts = turn ?? []

  // Mobile detection + compact mode
  const [screenWidth, setScreenWidth] = React.useState(() => typeof window !== 'undefined' ? window.innerWidth : 600)
  React.useEffect(() => {
    const update = () => setScreenWidth(window.innerWidth)
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])
  const isMobile = screenWidth < 500
  const isTablet = screenWidth >= 500 && screenWidth <= 1024
  const compact = isMobile && players.length >= 2

  // On mobile: split players into top/bottom halves with input in middle
  // 2 players: 1 top, 1 bottom
  // 3 players: 1 top, 2 bottom
  // 4 players: 2 top, 2 bottom
  // 5 players: 2 top, 3 bottom
  const { topRows, bottomRows } = (() => {
    if (isMobile && hasControls) {
      const n = players.length
      const topCount = Math.ceil(n / 2)
      const topPlayers = players.slice(0, topCount)
      const bottomPlayers = players.slice(topCount)
      // Mobile: always 1 player per row (stacked vertically)
      return {
        topRows: topPlayers.map(p => [p]),
        bottomRows: bottomPlayers.map(p => [p]),
      }
    }
    return getPlayerRows(players)
  })()

  // Bull aktiv prüfen
  const bullActive = players.some(p => (p.marks['BULL'] ?? 0) < 3)

  // Target-Zahlen für Input-Buttons
  const inputNumbers = isShort
    ? [20, 19, 18, 17, 16, 15]
    : [20, 19, 18, 17, 16, 15, 14, 13, 12, 11, 10]

  return (
    <div
      style={{
        background: colors.background,
        padding: isMobile ? '4px 2px 8px' : '8px 8px 12px',
      }}
    >
      {/* CSS für Animationen */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>

      {/* Mobile Header: Ansage-Button */}
      {isMobile && onAnnounceStatus && (
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 4 }}>
          <button onClick={onAnnounceStatus} style={{
            padding: '4px 12px', borderRadius: 4, border: `1px solid ${colors.statusGreen}`,
            background: colors.statusGreenDim, color: '#fff',
            fontSize: 11, fontWeight: 700, cursor: 'pointer',
          }}>
            🔊 Status ansagen
          </button>
        </div>
      )}

      {/* Obere Spieler */}
      <div style={{ marginBottom: compact ? 4 : 8, display: 'flex', flexDirection: 'column', gap: compact ? 4 : 6 }}>
        {topRows.map((row, rowIndex) => (
          <div key={rowIndex} style={{ display: 'flex', gap: compact ? 4 : 8 }}>
            {row.map(p => (
              <div key={p.id} style={{ flex: row.length === 1 ? '1' : '0 0 calc(50% - 2px)' }}>
                <PlayerRow player={p} targets={targets} hideScore={hideScore} closedTargets={closedTargets} compact={compact} />
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Mobile: Inline Input between players */}
      {isMobile && hasControls && (
        <div style={{ margin: '4px 0' }}>
          {/* Row 1: Target numbers in one line */}
          <div style={{ display: 'flex', gap: 2, marginBottom: 3 }}>
            {[...inputNumbers, 'B', 'X'].map(item => {
              const isBull = item === 'B'
              const isMiss = item === 'X'
              return (
                <button key={String(item)} onClick={(e) => {
                  e.currentTarget.blur()
                  if (isBull) onAddTarget!('BULL')
                  else if (isMiss) onAddTarget!('MISS')
                  else onAddTarget!(item as number)
                }} style={{
                  flex: 1, padding: '8px 0', borderRadius: 4,
                  border: `1px solid ${isMiss ? '#555' : colors.ledOn}`,
                  background: isMiss ? '#2a2a2a' : '#1a1a1a',
                  color: isMiss ? colors.textBright : colors.ledOn,
                  fontWeight: 800, fontSize: 12, cursor: 'pointer',
                }}>
                  {isBull ? 'B' : isMiss ? '✕' : item}
                </button>
              )
            })}
          </div>
          {/* Row 2: S, D, T, Undo, Confirm */}
          <div style={{ display: 'flex', gap: 2 }}>
            {[1, 2, 3].map(m => (
              <button key={m} onClick={(e) => { e.currentTarget.blur(); onSetMult!(m as 1 | 2 | 3) }}
                style={{
                  flex: 1, padding: '8px 0', borderRadius: 4,
                  border: `1px solid ${mult === m ? colors.statusGreen : '#555'}`,
                  background: mult === m ? colors.statusGreenDim : '#1a1a1a',
                  color: mult === m ? '#fff' : '#777', fontWeight: 700, fontSize: 13, cursor: 'pointer',
                }}>
                {m === 1 ? 'S' : m === 2 ? 'D' : 'T'}
              </button>
            ))}
            <button onClick={(e) => { e.currentTarget.blur(); onUndo?.() }}
              style={{ flex: 1, padding: '8px 0', borderRadius: 4, border: '1px solid #555',
                background: '#1a1a1a', color: '#aaa', fontWeight: 700, fontSize: 11, cursor: 'pointer' }}>
              ↩ Aufn.
            </button>
            <button onClick={(e) => { e.currentTarget.blur(); onUndoDart?.() }}
              disabled={darts.length === 0}
              style={{ flex: 1, padding: '8px 0', borderRadius: 4,
                border: `1px solid ${darts.length > 0 ? '#f59e0b' : '#555'}`,
                background: darts.length > 0 ? '#1a1a0a' : '#1a1a1a',
                color: darts.length > 0 ? '#f59e0b' : '#555', fontWeight: 700, fontSize: 11, cursor: 'pointer' }}>
              ↩ Dart
            </button>
          </div>
        </div>
      )}

      {/* Status-Zeile mit Darts */}
      {!isMobile && (
        <StatusRow currentDart={currentDart} currentRound={currentRound}
          bullActive={bullActive} crazyTargets={crazyTargets} darts={darts} />
      )}

      {/* Untere Spieler */}
      {bottomRows.length > 0 && (
        <div style={{ marginTop: compact ? 4 : 8, display: 'flex', flexDirection: 'column', gap: compact ? 4 : 6 }}>
          {bottomRows.map((row, rowIndex) => (
            <div key={rowIndex} style={{ display: 'flex', gap: compact ? 4 : 8 }}>
              {row.map(p => (
                <div key={p.id} style={{ flex: row.length === 1 ? '1' : '0 0 calc(50% - 2px)' }}>
                  <PlayerRow player={p} targets={targets} hideScore={hideScore} closedTargets={closedTargets} compact={compact} />
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* === Desktop Controls === */}
      {hasControls && !isMobile && (
        <div style={{ display: 'flex', gap: 16, marginTop: 6, borderTop: '1px solid #222', paddingTop: 6, justifyContent: 'center' }}>
          {turnHistory && (
            <div style={{ width: 300, flexShrink: 0, overflow: 'hidden' }}>
              <CricketTurnList turns={turnHistory} scrollRef={turnListRef} maxHeight={200} isLight={false} />
            </div>
          )}
          <div style={{ width: 300, flexShrink: 0 }}>
            {/* Crazy Pro: Ziele-Vorschau */}
            {crazyPro && crazyProTargets && crazyProTargets.length === 3 && (
              <div
                style={{
                  display: 'flex',
                  gap: 6,
                  justifyContent: 'center',
                  alignItems: 'center',
                  padding: '6px 10px',
                  marginBottom: 6,
                  background: '#111',
                  borderRadius: 6,
                  border: '1px solid #fbbf24',
                }}
              >
                <span style={{ fontSize: 10, fontWeight: 600, color: '#92400e' }}>Ziele:</span>
                {crazyProTargets.map((target, i) => {
                  const isCurrent = i === Math.min(darts.length, 2)
                  const isPast = i < darts.length
                  return (
                    <span
                      key={i}
                      style={{
                        fontSize: 14,
                        fontWeight: 800,
                        fontFamily: "'Courier New', monospace",
                        color: isPast ? '#555' : (isCurrent ? '#fbbf24' : '#92400e'),
                        background: isCurrent ? '#1a1a1a' : 'transparent',
                        padding: '2px 6px',
                        borderRadius: 4,
                        border: isCurrent ? '1px solid #fbbf24' : '1px solid transparent',
                        textDecoration: isPast ? 'line-through' : 'none',
                        textShadow: isCurrent ? '0 0 8px #fbbf24' : 'none',
                      }}
                    >
                      {target === 'BULL' ? 'Bull' : target}
                    </span>
                  )
                })}
              </div>
            )}

            {/* Target-Buttons */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${inputNumbers.length + 2}, 1fr)`,
                gap: 3,
                marginBottom: 6,
              }}
            >
              {[...inputNumbers, 'B', 'X'].map(item => {
                const isBull = item === 'B'
                const isMiss = item === 'X'
                return (
                  <button
                    key={String(item)}
                    onClick={(e) => {
                      e.currentTarget.blur()
                      if (isBull) onAddTarget!('BULL')
                      else if (isMiss) onAddTarget!('MISS')
                      else onAddTarget!(item as number)
                    }}
                    style={{
                      padding: '6px 8px',
                      borderRadius: 5,
                      border: `1px solid ${isMiss ? '#555' : colors.ledOn}`,
                      background: isMiss ? '#2a2a2a' : '#1a1a1a',
                      color: isMiss ? colors.textBright : colors.ledOn,
                      fontWeight: 800,
                      fontSize: 11,
                      cursor: 'pointer',
                    }}
                  >
                    {isBull ? 'B' : isMiss ? 'X' : item}
                  </button>
                )
              })}
            </div>

            {/* S/D/T Multiplikator */}
            <div
              style={{
                display: 'flex',
                gap: 4,
                marginBottom: 6,
              }}
            >
              {[1, 2, 3].map(m => (
                <button
                  key={m}
                  onClick={(e) => {
                    e.currentTarget.blur()
                    onSetMult!(m as 1 | 2 | 3)
                  }}
                  style={{
                    flex: 1,
                    padding: '6px 10px',
                    borderRadius: 6,
                    border: `1px solid ${mult === m ? colors.statusGreen : '#555'}`,
                    background: mult === m ? colors.statusGreenDim : '#1a1a1a',
                    color: mult === m ? '#fff' : '#777',
                    fontWeight: 700,
                    fontSize: 13,
                    cursor: 'pointer',
                  }}
                >
                  {m === 1 ? 'S' : m === 2 ? 'D' : 'T'}
                </button>
              ))}
            </div>

            {/* Control-Bar */}
            <div
              style={{
                display: 'flex',
                gap: 4,
                borderTop: `1px solid #222`,
                paddingTop: 6,
              }}
            >
              <button
                onClick={onUndo}
                style={{
                  padding: '6px 10px',
                  borderRadius: 5,
                  border: '1px solid #333',
                  background: '#151515',
                  color: '#888',
                  fontWeight: 700,
                  fontSize: 12,
                  cursor: 'pointer',
                }}
                title="Undo (Strg/Cmd+Z)"
              >
                ↶
              </button>
              <button
                onClick={onBack}
                disabled={darts.length === 0}
                style={{
                  padding: '6px 10px',
                  borderRadius: 5,
                  border: '1px solid #333',
                  background: '#151515',
                  color: darts.length === 0 ? '#333' : '#888',
                  fontWeight: 700,
                  fontSize: 12,
                  cursor: darts.length === 0 ? 'default' : 'pointer',
                }}
              >
                ←
              </button>
              {onAnnounceStatus && (
                <button
                  onClick={onAnnounceStatus}
                  style={{
                    padding: '6px 10px',
                    borderRadius: 5,
                    border: '1px solid #333',
                    background: '#151515',
                    color: '#888',
                    fontWeight: 700,
                    fontSize: 12,
                    cursor: 'pointer',
                  }}
                  title="Status ansagen"
                >
                  🔊
                </button>
              )}
              <button
                onClick={onConfirm}
                style={{
                  padding: '6px 14px',
                  borderRadius: 5,
                  border: `1px solid ${colors.ledOn}`,
                  background: colors.ledOn,
                  color: '#0a0a0a',
                  fontWeight: 800,
                  fontSize: 12,
                  cursor: 'pointer',
                  flex: 1,
                }}
              >
                {darts.length === 0 ? '✔ 3× Miss' : '✔ OK'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
