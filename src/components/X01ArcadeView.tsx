// src/components/X01ArcadeView.tsx
// Arcade-Style Ansicht für X01 Spiele (301/501/etc.)
// Siebensegment-Anzeige im Stil klassischer Löwen/Becker Dartautomaten

import React from 'react'

type PlayerData = {
  id: string
  name: string
  remaining: number
  isActive: boolean
  lastVisitScore: number | null
  lastVisitDarts?: string[] | null
  threeDartAvg: number
  legs: number
  sets: number
  checkoutRoute?: string | null
  setupShot?: string | null
  color?: string // Spielerfarbe für Glow-Effekt
}

// Visit-Eintrag für Aufnahmen-Liste
export type VisitEntry = {
  playerName: string
  darts: string[] // z.B. ['T20', 'T20', 'T20']
  score: number
  remaining: number
  isLive?: boolean // Aktueller Wurf (noch nicht bestätigt)
  avg?: number // 3-Dart Average des Spielers
}

type Props = {
  players: PlayerData[]
  currentScore: number
  currentDart: number // 0-3
  currentDarts?: string[] // Labels der geworfenen Darts (z.B. ['T20', 'D18'])
  activePlayerName: string
  checkoutRoute: string | null
  setupShot: string | null
  bust: boolean
  showSets: boolean
  confirmedScore?: { value: number; bust: boolean; key: number } | null
}

// Farben
const c = {
  bg: '#0f0f0f',
  ledOn: '#f97316',
  ledOff: '#1c1c1c',
  ledGlow: '#fb923c',
  scoreYellow: '#eab308',
  scoreYellowGlow: '#facc15',
  green: '#22c55e',
  red: '#ef4444',
  textDim: '#6b7280',
  textBright: '#e5e7eb',
  activeGlow: 'rgba(249, 115, 22, 0.3)',
}

// ===== Siebensegment-Anzeige =====
// Segment-Layout:
//  aaaa
// f    b
// f    b
//  gggg
// e    c
// e    c
//  dddd

const SEGMENTS: Record<string, boolean[]> = {
  //       a     b     c     d     e     f     g
  '0': [true, true, true, true, true, true, false],
  '1': [false, true, true, false, false, false, false],
  '2': [true, true, false, true, true, false, true],
  '3': [true, true, true, true, false, false, true],
  '4': [false, true, true, false, false, true, true],
  '5': [true, false, true, true, false, true, true],
  '6': [true, false, true, true, true, true, true],
  '7': [true, true, true, false, false, false, false],
  '8': [true, true, true, true, true, true, true],
  '9': [true, true, true, true, false, true, true],
  '-': [false, false, false, false, false, false, true],
  ' ': [false, false, false, false, false, false, false],
}

// Einzelne Siebensegment-Ziffer als SVG
function SevenSegDigit({
  char,
  size = 1,
  colorOn,
  colorOff = c.ledOff,
  glowColor,
}: {
  char: string
  size?: number
  colorOn: string
  colorOff?: string
  glowColor?: string
}) {
  const segs = SEGMENTS[char] ?? SEGMENTS[' ']
  // Segment-Dimensionen (Basisgröße, skaliert mit size)
  const w = 20 * size   // Breite
  const h = 36 * size   // Höhe
  const t = 3 * size    // Segment-Dicke
  const g = 1.5 * size  // Gap zwischen Segmenten
  const r = 0.5 * size  // Rundung

  // Segment-Positionen (Polygone)
  const segPaths = [
    // a - oben horizontal
    `M ${g + t * 0.5},${0} L ${w - g - t * 0.5},${0} L ${w - g - t},${t} L ${g + t},${t} Z`,
    // b - oben rechts vertikal
    `M ${w},${g + t * 0.5} L ${w},${h / 2 - g - t * 0.3} L ${w - t},${h / 2 - g} L ${w - t},${g + t} Z`,
    // c - unten rechts vertikal
    `M ${w},${h / 2 + g + t * 0.3} L ${w},${h - g - t * 0.5} L ${w - t},${h - g - t} L ${w - t},${h / 2 + g} Z`,
    // d - unten horizontal
    `M ${g + t},${h - t} L ${w - g - t},${h - t} L ${w - g - t * 0.5},${h} L ${g + t * 0.5},${h} Z`,
    // e - unten links vertikal
    `M ${0},${h / 2 + g + t * 0.3} L ${t},${h / 2 + g} L ${t},${h - g - t} L ${0},${h - g - t * 0.5} Z`,
    // f - oben links vertikal
    `M ${0},${g + t * 0.5} L ${t},${g + t} L ${t},${h / 2 - g} L ${0},${h / 2 - g - t * 0.3} Z`,
    // g - mitte horizontal
    `M ${g + t},${h / 2 - t / 2} L ${w - g - t},${h / 2 - t / 2} L ${w - g - t * 0.5},${h / 2} L ${w - g - t},${h / 2 + t / 2} L ${g + t},${h / 2 + t / 2} L ${g + t * 0.5},${h / 2} Z`,
  ]

  const glow = glowColor ?? colorOn

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      {segPaths.map((d, i) => {
        const on = segs[i]
        return (
          <path
            key={i}
            d={d}
            fill={on ? colorOn : colorOff}
            style={{
              filter: on ? `drop-shadow(0 0 ${3 * size}px ${glow})` : undefined,
              transition: 'fill 0.15s ease',
            }}
          />
        )
      })}
    </svg>
  )
}

// Mehrziffrige Siebensegment-Anzeige
function SevenSegNumber({
  value,
  digits = 3,
  size = 1,
  colorOn = c.ledOn,
  glowColor,
}: {
  value: number | string
  digits?: number
  size?: number
  colorOn?: string
  glowColor?: string
}) {
  const str = typeof value === 'string'
    ? value.padStart(digits, ' ')
    : String(Math.max(0, value)).padStart(digits, ' ')
  const chars = str.slice(-digits).split('')

  return (
    <div style={{ display: 'flex', gap: 4 * size, alignItems: 'center' }}>
      {chars.map((ch, i) => (
        <SevenSegDigit
          key={i}
          char={ch}
          size={size}
          colorOn={colorOn}
          glowColor={glowColor}
        />
      ))}
    </div>
  )
}

// Spieler-Stats-Liste (rechte Spalte im Split-Layout)
export function PlayerStatsList({
  players,
}: {
  players: PlayerData[]
}) {
  return (
    <div
      style={{
        background: c.bg,
        borderRadius: 10,
        padding: '10px 12px',
        border: `1px solid #2a2a2a`,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 50px',
          gap: 6,
          padding: '0 2px 6px',
          borderBottom: `1px solid ${c.ledOff}`,
          marginBottom: 4,
          fontSize: 9,
          color: c.textDim,
          letterSpacing: 0.5,
          textTransform: 'uppercase',
          fontWeight: 700,
        }}
      >
        <span>SPIELER</span>
        <span style={{ textAlign: 'right' }}>3-DA</span>
      </div>

      {/* Spieler-Zeilen */}
      <div style={{ display: 'grid', gap: 2 }}>
        {players.map((p) => {
          const hasDarts = p.lastVisitDarts && p.lastVisitDarts.length > 0
          const activeColor = p.color || c.ledOn
          return (
            <div
              key={p.id}
              style={{
                padding: '5px 2px',
                borderRadius: 4,
                background: p.isActive ? `${activeColor}15` : 'transparent',
                borderLeft: p.isActive ? `2px solid ${activeColor}` : '2px solid transparent',
                boxShadow: p.isActive ? `0 0 8px ${activeColor}30` : 'none',
              }}
            >
              {/* Obere Zeile: Name + 3-DA */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 50px',
                  gap: 6,
                }}
              >
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: p.isActive ? 700 : 500,
                    color: p.isActive ? activeColor : c.textBright,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {p.name}
                </span>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: c.textBright,
                    textAlign: 'right',
                    fontFamily: "'Courier New', monospace",
                  }}
                >
                  {p.threeDartAvg.toFixed(1)}
                </span>
              </div>

              {/* Untere Zeile: Letzte Aufnahme (Dart-Details) */}
              <div
                style={{
                  display: 'flex',
                  gap: 6,
                  marginTop: 3,
                  alignItems: 'center',
                }}
              >
                {hasDarts ? (
                  <>
                    {p.lastVisitDarts!.map((label, i) => (
                      <span
                        key={i}
                        style={{
                          fontSize: 10,
                          fontWeight: 600,
                          color: c.ledGlow,
                          fontFamily: "'Courier New', monospace",
                          background: '#1c1c1c',
                          padding: '1px 4px',
                          borderRadius: 3,
                          border: `1px solid #333`,
                        }}
                      >
                        {label}
                      </span>
                    ))}
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        color: c.textDim,
                        marginLeft: 'auto',
                        fontFamily: "'Courier New', monospace",
                      }}
                    >
                      = {p.lastVisitScore}
                    </span>
                  </>
                ) : (
                  <span style={{ fontSize: 10, color: c.textDim }}>—</span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Aufnahmen-Liste: Zeigt die letzten 8 Visits (neuster oben) + Live-Wurf
export function VisitList({
  visits,
  scrollRef,
}: {
  visits: VisitEntry[]
  scrollRef?: React.RefObject<HTMLDivElement | null>
}) {
  return (
    <div
      ref={scrollRef}
      style={{
        background: '#1a1a1a',
        borderRadius: 10,
        padding: '10px 12px',
        border: 'none',
        width: 'fit-content',
        minWidth: 280,
        height: '100%',
        maxHeight: 350,
        overflowY: 'scroll',
        overflowX: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
      className="visit-list-scroll"
    >
      {/* Scrollbar Styling */}
      <style>{`
        .visit-list-scroll {
          scrollbar-width: thin;
          scrollbar-color: #f97316 #2a2a2a;
        }
        .visit-list-scroll::-webkit-scrollbar {
          width: 12px;
        }
        .visit-list-scroll::-webkit-scrollbar-track {
          background: #2a2a2a;
          border-radius: 6px;
          border: 1px solid #3a3a3a;
        }
        .visit-list-scroll::-webkit-scrollbar-thumb {
          background: linear-gradient(180deg, #f97316, #ea580c);
          border-radius: 6px;
          border: 2px solid #2a2a2a;
        }
        .visit-list-scroll::-webkit-scrollbar-thumb:hover {
          background: linear-gradient(180deg, #fb923c, #f97316);
        }
      `}</style>
      {/* Header */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '60px auto 40px 40px 40px',
          gap: 8,
          padding: '0 2px 6px',
          borderBottom: `1px solid ${c.ledOff}`,
          marginBottom: 4,
          fontSize: 9,
          color: c.textDim,
          letterSpacing: 0.5,
          textTransform: 'uppercase',
          fontWeight: 700,
        }}
      >
        <span>Spieler</span>
        <span>Darts</span>
        <span style={{ textAlign: 'right' }}>Score</span>
        <span style={{ textAlign: 'right' }}>Avg</span>
        <span style={{ textAlign: 'right' }}>Rest</span>
      </div>

      {/* Visit-Zeilen */}
      <div style={{ display: 'grid', gap: 2 }}>
        {visits.length === 0 ? (
          <div style={{ padding: '8px 2px', fontSize: 10, color: c.textDim }}>
            Noch keine Aufnahmen
          </div>
        ) : (
          visits.map((v, idx) => (
            <div
              key={idx}
              style={{
                display: 'grid',
                gridTemplateColumns: '60px auto 40px 40px 40px',
                gap: 8,
                padding: '4px 2px',
                borderRadius: 4,
                background: v.isLive ? c.activeGlow : 'transparent',
                borderLeft: v.isLive ? `2px solid ${c.ledOn}` : '2px solid transparent',
              }}
            >
              {/* Spielername */}
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: v.isLive ? c.ledOn : '#fff',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {v.playerName}
              </span>

              {/* Dart-Labels */}
              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                {v.darts.map((label, i) => (
                  <span
                    key={i}
                    style={{
                      fontSize: 10,
                      fontWeight: 600,
                      color: v.isLive ? c.ledOn : c.ledGlow,
                      fontFamily: "'Courier New', monospace",
                      background: '#1c1c1c',
                      padding: '1px 3px',
                      borderRadius: 3,
                      border: `1px solid ${v.isLive ? c.ledOn : '#333'}`,
                    }}
                  >
                    {label}
                  </span>
                ))}
                {v.isLive && v.darts.length < 3 && (
                  <span style={{ fontSize: 10, color: c.textDim }}>...</span>
                )}
              </div>

              {/* Score */}
              <span
                style={{
                  fontSize: 14,
                  fontWeight: 800,
                  color: v.isLive ? c.scoreYellow : '#fff',
                  textAlign: 'right',
                  fontFamily: "'Courier New', monospace",
                }}
              >
                {v.score}
              </span>

              {/* Average */}
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: c.green,
                  textAlign: 'right',
                  fontFamily: "'Courier New', monospace",
                }}
              >
                {v.avg !== undefined ? v.avg.toFixed(1) : '—'}
              </span>

              {/* Remaining */}
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: c.textDim,
                  textAlign: 'right',
                  fontFamily: "'Courier New', monospace",
                }}
              >
                {v.remaining}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

// Dart-Pfeil Icon (SVG) - zeigt Label wenn geworfen, sonst Pfeil
function DartArrow({ thrown, label, compact = false }: { thrown: boolean; label?: string; compact?: boolean }) {
  // Wenn geworfen und Label vorhanden: Zeige Label statt Pfeil
  if (thrown && label) {
    return (
      <span
        style={{
          fontSize: compact ? 8 : 10,
          fontWeight: 700,
          color: c.ledOn,
          fontFamily: "'Courier New', monospace",
          background: '#1c1c1c',
          padding: compact ? '1px 2px' : '2px 4px',
          borderRadius: 3,
          border: `1px solid ${c.ledOn}`,
          minWidth: compact ? 20 : 28,
          textAlign: 'center',
          display: 'inline-block',
        }}
      >
        {label}
      </span>
    )
  }

  // Sonst: Pfeil-Icon
  const fill = c.green
  const size = compact ? 10 : 14
  return (
    <svg viewBox="0 0 24 24" width={size} height={size}>
      <path
        d="M20 4L4 11L9 13L11 20L20 4Z"
        fill={fill}
        stroke={fill}
        strokeWidth="1"
        strokeLinejoin="round"
      />
    </svg>
  )
}

// Einzelnes Spieler-Display
function PlayerDisplay({
  player,
  showSets,
  currentDart,
  currentDarts,
  compact = false,
}: {
  player: PlayerData
  showSets: boolean
  currentDart: number
  currentDarts?: string[]
  compact?: boolean
}) {
  const { name, remaining, isActive, legs, sets, color } = player

  // Spielerfarbe für Glow-Effekt (Fallback auf Standard-Orange)
  const activeColor = color || c.ledOn

  return (
    <div
      style={{
        background: isActive ? `${activeColor}15` : `${activeColor}08`,
        borderRadius: compact ? 8 : 10,
        padding: compact ? '6px 10px 5px' : '10px 14px 8px',
        border: isActive ? `2px solid ${activeColor}` : `1px solid ${activeColor}40`,
        boxShadow: isActive ? `0 0 15px ${activeColor}40, 0 0 30px ${activeColor}20` : 'none',
        transition: 'all 0.3s ease',
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: compact ? 3 : 6,
      }}
    >
      {/* Name */}
      <div
        style={{
          fontSize: compact ? 9 : 11,
          fontWeight: 700,
          color: isActive ? activeColor : `${activeColor}99`,
          textTransform: 'uppercase',
          letterSpacing: compact ? 1 : 2,
          textAlign: 'center',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          width: '100%',
        }}
      >
        {name}
      </div>

      {/* Remaining als Siebensegment */}
      <SevenSegNumber
        value={remaining}
        digits={remaining > 999 ? 4 : 3}
        size={compact ? 0.9 : 1.2}
        colorOn={isActive ? c.scoreYellow : c.ledOn}
        glowColor={isActive ? c.scoreYellowGlow : c.ledGlow}
      />

      {/* Checkout-Route (grün) oder Setup-Shot (gelb) unter der Zahl */}
      {player.checkoutRoute ? (
        <div
          style={{
            fontSize: compact ? 16 : 20,
            fontWeight: 700,
            color: '#22c55e',
            textAlign: 'center',
            letterSpacing: 0.5,
            lineHeight: 1.2,
            marginTop: compact ? 2 : 4,
            textShadow: '0 0 8px rgba(34, 197, 94, 0.5)',
          }}
        >
          {player.checkoutRoute}
        </div>
      ) : player.setupShot ? (
        <div
          style={{
            fontSize: compact ? 16 : 20,
            fontWeight: 700,
            color: '#eab308',
            textAlign: 'center',
            letterSpacing: 0.5,
            lineHeight: 1.2,
            marginTop: compact ? 2 : 4,
            textShadow: '0 0 8px rgba(234, 179, 8, 0.5)',
          }}
        >
          {player.setupShot}
        </div>
      ) : null}

      {/* Dart-Pfeile + Legs/Sets */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          width: '100%',
          marginTop: compact ? 1 : 2,
        }}
      >
        {/* Legs/Sets */}
        <div
          style={{
            fontSize: compact ? 8 : 9,
            color: c.textDim,
            letterSpacing: 0.5,
            display: 'flex',
            gap: compact ? 4 : 6,
          }}
        >
          <span>
            L:<b style={{ color: c.textBright, marginLeft: 2 }}>{legs}</b>
          </span>
          {showSets && (
            <span>
              S:<b style={{ color: c.textBright, marginLeft: 2 }}>{sets}</b>
            </span>
          )}
        </div>

        {/* Dart-Pfeile nur beim aktiven Spieler */}
        {isActive && (
          <div style={{ display: 'flex', gap: compact ? 2 : 4, alignItems: 'center' }}>
            <DartArrow thrown={currentDart >= 1} label={currentDarts?.[0]} compact={compact} />
            <DartArrow thrown={currentDart >= 2} label={currentDarts?.[1]} compact={compact} />
            <DartArrow thrown={currentDart >= 3} label={currentDarts?.[2]} compact={compact} />
          </div>
        )}
      </div>
    </div>
  )
}

// Score-Anzeige (Mitte)
function CenterScore({
  currentScore,
  currentDart,
  checkoutRoute,
  bust,
  confirmedScore,
}: {
  currentScore: number
  currentDart: number
  checkoutRoute: string | null
  bust: boolean
  confirmedScore?: { value: number; bust: boolean; key: number } | null
}) {
  const hasScore = currentScore > 0 || currentDart > 0
  // Bestätigter Score überlagert kurz die Anzeige
  const showConfirmed = !!confirmedScore && !hasScore

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '8px 16px',
        minWidth: 90,
        position: 'relative',
      }}
    >
      {/* Label */}
      <div
        style={{
          fontSize: 9,
          color: bust || confirmedScore?.bust ? c.red : showConfirmed ? c.green : c.textDim,
          letterSpacing: 1,
          marginBottom: 4,
          textTransform: 'uppercase',
          fontWeight: 700,
        }}
      >
        {bust || confirmedScore?.bust ? 'BUST' : 'SCORE'}
      </div>

      {/* Score als Siebensegment */}
      {showConfirmed ? (
        <div key={confirmedScore!.key} style={{ animation: 'x01confirmedPop 800ms ease-out forwards' }}>
          <SevenSegNumber
            value={confirmedScore!.value}
            digits={3}
            size={1.5}
            colorOn={confirmedScore!.bust ? c.red : c.green}
            glowColor={confirmedScore!.bust ? c.red : '#4ade80'}
          />
        </div>
      ) : hasScore ? (
        <div style={{ animation: bust ? 'x01bustFlash 0.5s ease-in-out' : undefined }}>
          <SevenSegNumber
            value={currentScore}
            digits={3}
            size={1.5}
            colorOn={bust ? c.red : c.scoreYellow}
            glowColor={bust ? c.red : c.scoreYellowGlow}
          />
        </div>
      ) : (
        <div style={{ animation: undefined }}>
          <SevenSegNumber
            value="---"
            digits={3}
            size={1.5}
            colorOn={c.textDim}
            glowColor={c.textDim}
          />
        </div>
      )}

    </div>
  )
}

// Hauptkomponente
export default function X01ArcadeView({
  players,
  currentScore,
  currentDart,
  currentDarts,
  activePlayerName,
  checkoutRoute,
  setupShot,
  bust,
  showSets,
  confirmedScore,
}: Props) {
  // Spieler aufteilen: Links (Index 0, 2, 4, ...) und Rechts (Index 1, 3, 5, ...)
  const leftPlayers = players.filter((_, i) => i % 2 === 0)
  const rightPlayers = players.filter((_, i) => i % 2 === 1)
  const rows = Math.max(leftPlayers.length, rightPlayers.length)

  // Bei mehr als 2 Spielern: kompaktere Darstellung
  const isCompact = players.length > 2

  return (
    <>
      {/* CSS Animationen */}
      <style>{`
        @keyframes x01pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        @keyframes x01bustFlash {
          0%, 100% { opacity: 1; }
          25% { opacity: 0.3; }
          50% { opacity: 1; }
          75% { opacity: 0.3; }
        }
        @keyframes x01confirmedPop {
          0%   { opacity: 0; transform: scale(0.6); }
          15%  { opacity: 1; transform: scale(1.12); }
          30%  { transform: scale(1); }
          75%  { opacity: 1; transform: scale(1); }
          100% { opacity: 0; transform: scale(0.95) translateY(-4px); }
        }
      `}</style>

      {/* Layout: Links | Mitte (Score) | Rechts */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr auto 1fr',
          gridTemplateRows: `repeat(${rows}, auto)`,
          gap: isCompact ? 6 : 10,
          alignItems: 'center',
        }}
      >
        {/* Linke Spalte: Spieler 1, 3, 5, ... */}
        {leftPlayers.map((p, idx) => (
          <div key={p.id} style={{ gridColumn: 1, gridRow: idx + 1 }}>
            <PlayerDisplay
              player={p}
              showSets={showSets}
              currentDart={currentDart}
              currentDarts={p.isActive ? currentDarts : undefined}
              compact={isCompact}
            />
          </div>
        ))}

        {/* Mitte: Score (über alle Zeilen) */}
        <div style={{ gridColumn: 2, gridRow: `1 / span ${rows}`, display: 'flex', alignItems: 'center' }}>
          <CenterScore
            currentScore={currentScore}
            currentDart={currentDart}
            checkoutRoute={checkoutRoute}
            bust={bust}
            confirmedScore={confirmedScore}
          />
        </div>

        {/* Rechte Spalte: Spieler 2, 4, 6, ... */}
        {rightPlayers.map((p, idx) => (
          <div key={p.id} style={{ gridColumn: 3, gridRow: idx + 1 }}>
            <PlayerDisplay
              player={p}
              showSets={showSets}
              currentDart={currentDart}
              currentDarts={p.isActive ? currentDarts : undefined}
              compact={isCompact}
            />
          </div>
        ))}
      </div>
    </>
  )
}
