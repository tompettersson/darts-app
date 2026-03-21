// src/screens/stats/PlayerComparison.tsx
// Side-by-side X01 career comparison between two players + H2H data

import React, { useEffect, useMemo, useState } from 'react'
import { useTheme } from '../../ThemeProvider'
import { getThemedUI } from '../../ui'
import {
  getGlobalX01PlayerStats,
  type X01PlayerLongTermStats,
} from '../../storage'
import { getHeadToHead, type HeadToHeadDetailed } from '../../db/stats/player-insights'

type Props = {
  player1Id: string
  player2Id: string
  onBack: () => void
}

type MetricRow = {
  label: string
  val1: number
  val2: number
  /** Higher is better (default true). Set false for metrics like "losses". */
  higherIsBetter?: boolean
  format?: (v: number) => string
}

const fmt0 = (v: number) => String(v)
const fmt1 = (v: number) => v.toFixed(1)
const fmt2 = (v: number) => v.toFixed(2)
const fmtPct = (v: number) => `${v.toFixed(1)}%`

function calc3DA(p: X01PlayerLongTermStats): number {
  if (typeof p.threeDartAvgOverall === 'number' && p.threeDartAvgOverall > 0) return p.threeDartAvgOverall
  return p.dartsThrownTotal > 0 ? (p.pointsScoredTotal / p.dartsThrownTotal) * 3 : 0
}

function calcCheckoutPct(p: X01PlayerLongTermStats): number {
  if (typeof p.doublePctDart === 'number' && p.doublePctDart > 0) return p.doublePctDart
  return p.doubleAttemptsDart > 0 ? (p.doublesHitDart / p.doubleAttemptsDart) * 100 : 0
}

export default function PlayerComparison({ player1Id, player2Id, onBack }: Props) {
  const { colors, isArcade } = useTheme()
  const styles = useMemo(() => getThemedUI(colors, isArcade), [colors, isArcade])

  // Career stats
  const store = getGlobalX01PlayerStats()
  const p1 = store[player1Id]
  const p2 = store[player2Id]

  // H2H async
  const [h2h, setH2h] = useState<HeadToHeadDetailed | null>(null)
  const [h2hLoading, setH2hLoading] = useState(true)

  useEffect(() => {
    setH2hLoading(true)
    getHeadToHead(player1Id, player2Id)
      .then(setH2h)
      .catch(() => setH2h(null))
      .finally(() => setH2hLoading(false))
  }, [player1Id, player2Id])

  if (!p1 || !p2) {
    return (
      <div style={styles.card}>
        <p style={{ color: colors.fgMuted }}>Spielerdaten nicht gefunden.</p>
        <button onClick={onBack} style={btnStyle(colors)}>Zurueck zur Liste</button>
      </div>
    )
  }

  const name1 = p1.playerName ?? player1Id
  const name2 = p2.playerName ?? player2Id

  const metrics: MetricRow[] = [
    { label: 'Matches gespielt', val1: p1.matchesPlayed, val2: p2.matchesPlayed, format: fmt0 },
    { label: 'Siege', val1: p1.matchesWon, val2: p2.matchesWon, format: fmt0 },
    { label: 'Niederlagen', val1: p1.matchesPlayed - p1.matchesWon, val2: p2.matchesPlayed - p2.matchesWon, higherIsBetter: false, format: fmt0 },
    { label: 'Legs gewonnen', val1: p1.legsWon ?? 0, val2: p2.legsWon ?? 0, format: fmt0 },
    { label: '3-Dart-Average', val1: calc3DA(p1), val2: calc3DA(p2), format: fmt2 },
    { label: 'First 9 Avg', val1: p1.first9OverallAvg ?? 0, val2: p2.first9OverallAvg ?? 0, format: fmt2 },
    { label: 'Checkout %', val1: calcCheckoutPct(p1), val2: calcCheckoutPct(p2), format: fmtPct },
    { label: 'Bestes Checkout', val1: p1.highestCheckout ?? 0, val2: p2.highestCheckout ?? 0, format: fmt0 },
    { label: '180er', val1: p1.tons180, val2: p2.tons180, format: fmt0 },
    { label: '140+', val1: p1.tons140Plus, val2: p2.tons140Plus, format: fmt0 },
    { label: '100+', val1: p1.tons100Plus, val2: p2.tons100Plus, format: fmt0 },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header */}
      <div style={styles.card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <h3 style={{ margin: 0, color: colors.fg, fontSize: 18, fontWeight: 800 }}>
              {name1} vs {name2}
            </h3>
            <div style={{ fontSize: 13, color: colors.fgMuted, marginTop: 4 }}>
              X01 Karriere-Vergleich
            </div>
          </div>
          <button onClick={onBack} style={btnStyle(colors)}>
            Zurueck zur Liste
          </button>
        </div>
      </div>

      {/* Metrics comparison */}
      <div style={styles.card}>
        <h4 style={{ margin: '0 0 12px', color: colors.fg, fontSize: 15, fontWeight: 700 }}>
          Karriere-Statistiken
        </h4>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {metrics.map((m) => (
            <CompareRow
              key={m.label}
              label={m.label}
              val1={m.val1}
              val2={m.val2}
              name1={name1}
              name2={name2}
              higherIsBetter={m.higherIsBetter ?? true}
              format={m.format ?? fmt1}
              colors={colors}
            />
          ))}
        </div>
      </div>

      {/* H2H section */}
      <div style={styles.card}>
        <h4 style={{ margin: '0 0 12px', color: colors.fg, fontSize: 15, fontWeight: 700 }}>
          Head-to-Head
        </h4>
        {h2hLoading ? (
          <div style={{ color: colors.fgMuted, fontSize: 13, padding: '12px 0' }}>Lade H2H-Daten...</div>
        ) : !h2h || h2h.totalMatches === 0 ? (
          <div style={{ color: colors.fgMuted, fontSize: 13, padding: '12px 0' }}>
            Keine gemeinsamen Matches gefunden.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Win overview */}
            <div style={{
              display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 16,
              padding: '16px 0',
            }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 28, fontWeight: 800, color: h2h.playerWins >= h2h.opponentWins ? colors.accent : colors.fg }}>
                  {h2h.playerWins}
                </div>
                <div style={{ fontSize: 12, color: colors.fgMuted, fontWeight: 600 }}>{name1}</div>
              </div>
              <div style={{
                fontSize: 13, color: colors.fgMuted, fontWeight: 700,
                padding: '6px 12px', borderRadius: 8,
                background: `${colors.border}40`,
              }}>
                {h2h.totalMatches} {h2h.totalMatches === 1 ? 'Match' : 'Matches'}
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 28, fontWeight: 800, color: h2h.opponentWins >= h2h.playerWins ? colors.accent : colors.fg }}>
                  {h2h.opponentWins}
                </div>
                <div style={{ fontSize: 12, color: colors.fgMuted, fontWeight: 600 }}>{name2}</div>
              </div>
            </div>

            {/* H2H bars */}
            {h2h.totalMatches > 0 && (
              <div style={{ borderRadius: 8, overflow: 'hidden', height: 24, display: 'flex' }}>
                <div style={{
                  width: `${(h2h.playerWins / h2h.totalMatches) * 100}%`,
                  background: colors.accent,
                  minWidth: h2h.playerWins > 0 ? 8 : 0,
                  transition: 'width 0.3s',
                }} />
                <div style={{
                  width: `${((h2h.totalMatches - h2h.playerWins - h2h.opponentWins) / h2h.totalMatches) * 100}%`,
                  background: `${colors.border}60`,
                  transition: 'width 0.3s',
                }} />
                <div style={{
                  width: `${(h2h.opponentWins / h2h.totalMatches) * 100}%`,
                  background: `${colors.fg}40`,
                  minWidth: h2h.opponentWins > 0 ? 8 : 0,
                  transition: 'width 0.3s',
                }} />
              </div>
            )}

            {/* H2H extra stats */}
            {(h2h.playerAvgScore != null || h2h.opponentAvgScore != null) && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                {h2h.playerAvgScore != null && h2h.opponentAvgScore != null && (
                  <CompareRow
                    label="H2H 3-Dart Avg"
                    val1={h2h.playerAvgScore}
                    val2={h2h.opponentAvgScore}
                    name1={name1}
                    name2={name2}
                    higherIsBetter
                    format={fmt2}
                    colors={colors}
                  />
                )}
                {h2h.playerBestCheckout != null && h2h.opponentBestCheckout != null && (
                  <CompareRow
                    label="H2H Bestes Checkout"
                    val1={h2h.playerBestCheckout}
                    val2={h2h.opponentBestCheckout}
                    name1={name1}
                    name2={name2}
                    higherIsBetter
                    format={fmt0}
                    colors={colors}
                  />
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ============================================================================
// CompareRow: a single metric comparison row with visual bar
// ============================================================================

function CompareRow({
  label, val1, val2, name1: _name1, name2: _name2, higherIsBetter, format, colors,
}: {
  label: string
  val1: number
  val2: number
  name1: string
  name2: string
  higherIsBetter: boolean
  format: (v: number) => string
  colors: any
}) {
  const maxVal = Math.max(val1, val2) || 1
  const pct1 = (val1 / maxVal) * 100
  const pct2 = (val2 / maxVal) * 100

  const better1 = higherIsBetter ? val1 > val2 : val1 < val2
  const better2 = higherIsBetter ? val2 > val1 : val2 < val1
  const tie = val1 === val2

  const winColor = colors.accent
  const neutralColor = `${colors.fg}30`

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '1fr auto 1fr',
      alignItems: 'center',
      gap: 10,
      padding: '8px 0',
      borderBottom: `1px solid ${colors.border}30`,
    }}>
      {/* Left: player 1 value + bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
        <div style={{
          flex: 1,
          display: 'flex',
          justifyContent: 'flex-end',
        }}>
          <div style={{
            height: 6,
            width: `${pct1}%`,
            borderRadius: 3,
            background: better1 ? winColor : tie ? neutralColor : neutralColor,
            transition: 'width 0.3s',
            minWidth: val1 > 0 ? 4 : 0,
          }} />
        </div>
        <span style={{
          fontSize: 14,
          fontWeight: better1 ? 800 : 500,
          color: better1 ? winColor : colors.fg,
          fontVariantNumeric: 'tabular-nums',
          minWidth: 48,
          textAlign: 'right',
        }}>
          {format(val1)}
        </span>
      </div>

      {/* Center: label */}
      <div style={{
        fontSize: 11,
        fontWeight: 600,
        color: colors.fgMuted,
        textAlign: 'center',
        textTransform: 'uppercase',
        letterSpacing: '0.03em',
        minWidth: 90,
        whiteSpace: 'nowrap',
      }}>
        {label}
      </div>

      {/* Right: player 2 bar + value */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{
          fontSize: 14,
          fontWeight: better2 ? 800 : 500,
          color: better2 ? winColor : colors.fg,
          fontVariantNumeric: 'tabular-nums',
          minWidth: 48,
          textAlign: 'left',
        }}>
          {format(val2)}
        </span>
        <div style={{
          flex: 1,
          display: 'flex',
          justifyContent: 'flex-start',
        }}>
          <div style={{
            height: 6,
            width: `${pct2}%`,
            borderRadius: 3,
            background: better2 ? winColor : tie ? neutralColor : neutralColor,
            transition: 'width 0.3s',
            minWidth: val2 > 0 ? 4 : 0,
          }} />
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// Helpers
// ============================================================================

function btnStyle(colors: any): React.CSSProperties {
  return {
    background: 'none',
    border: `1px solid ${colors.border}`,
    borderRadius: 8,
    padding: '6px 14px',
    fontSize: 13,
    fontWeight: 600,
    color: colors.fg,
    cursor: 'pointer',
  }
}
