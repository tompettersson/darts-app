// src/screens/Bobs27LegSummary.tsx
// Leg-Zusammenfassung fuer Bob's 27 (nach jedem Leg + aus Match-History aufrufbar).
// Zeigt pro Spieler: Kennzahlen-Tabelle + Doppel-Detailtabelle mit Bull strikt separiert.

import React, { useMemo, useState, useEffect } from 'react'
import { getThemedUI } from '../ui'
import { useTheme } from '../ThemeProvider'
import { getBobs27MatchById } from '../storage'
import { applyBobs27Events } from '../dartsBobs27'
import { computeBobs27LegStats, type Bobs27LegStats } from '../stats/computeBobs27LegStats'
import { PLAYER_COLORS } from '../playerColors'
import StatTooltip from '../components/StatTooltip'

type Props = {
  matchId: string
  legIndex: number
  onBack: () => void
  onNextLeg?: () => void
  onFinishMatch?: () => void
}

export default function Bobs27LegSummary({ matchId, legIndex, onBack, onNextLeg, onFinishMatch }: Props) {
  const { colors, isArcade } = useTheme()
  const styles = useMemo(() => getThemedUI(colors, isArcade), [colors, isArcade])

  const [isMobile, setIsMobile] = useState(() => Math.min(window.innerWidth, window.innerHeight) < 600)
  useEffect(() => {
    const check = () => setIsMobile(Math.min(window.innerWidth, window.innerHeight) < 600)
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  const storedMatch = getBobs27MatchById(matchId)
  const events = storedMatch?.events ?? []

  const derived = useMemo(() => applyBobs27Events(events), [events])
  const match = derived.match
  const players = match?.players ?? []

  const legWinnerId = useMemo(() => {
    for (const ev of events) {
      if (ev.type === 'Bobs27LegFinished' && ev.legIndex === legIndex) return ev.winnerId
    }
    return null
  }, [events, legIndex])

  const playerStats: Array<{ playerId: string; name: string; color: string; stats: Bobs27LegStats | null }> = useMemo(() => {
    if (!storedMatch) return []
    return players.map((p, i) => ({
      playerId: p.playerId,
      name: p.name,
      color: PLAYER_COLORS[i % PLAYER_COLORS.length],
      stats: computeBobs27LegStats(storedMatch, p.playerId, legIndex),
    }))
  }, [storedMatch, players, legIndex])

  if (!storedMatch) {
    return (
      <div style={styles.page}>
        <p>Match nicht gefunden.</p>
        <button style={styles.backBtn} onClick={onBack}>&larr; Zurueck</button>
      </div>
    )
  }
  if (!match) {
    return (
      <div style={styles.page}>
        <p>Match-Daten nicht verfuegbar.</p>
        <button style={styles.backBtn} onClick={onBack}>&larr; Zurueck</button>
      </div>
    )
  }

  const legsCount = storedMatch.config?.legsCount ?? 1
  const winsNeeded = Math.ceil(legsCount / 2)

  const winnerName = legWinnerId
    ? players.find(p => p.playerId === legWinnerId)?.name ?? null
    : null

  const isSolo = players.length === 1

  return (
    <div style={styles.page}>
      <div style={styles.headerRow}>
        <h2 style={{ margin: 0 }}>
          {legsCount > 1 ? `FT${winsNeeded} · Leg ${legIndex + 1}` : `Leg ${legIndex + 1}`}
        </h2>
        <button style={styles.backBtn} onClick={onBack}>&larr; Zurueck</button>
      </div>

      <div style={styles.centerPage}>
        <div style={{ ...styles.centerInner, maxWidth: isMobile ? '100%' : 560, padding: isMobile ? '0 4px' : undefined }}>

          {/* Leg Ergebnis-Header */}
          <div style={{ ...styles.card, marginBottom: 16, textAlign: 'center' }}>
            <div style={{ fontSize: 13, color: colors.fgMuted, marginBottom: 4 }}>
              {isSolo ? 'Leg-Ergebnis' : 'Leg-Sieger'}
            </div>
            {isSolo ? (
              <div style={{ fontSize: 28, fontWeight: 800, color: colors.accent }}>
                {playerStats[0]?.stats?.finalScore ?? 0} Punkte
              </div>
            ) : winnerName ? (
              <div style={{ fontSize: 24, fontWeight: 700, color: colors.success }}>
                {winnerName} {'\u{1F3C6}'}
              </div>
            ) : (
              <div style={{ fontSize: 22, fontWeight: 700, color: colors.fgDim }}>Unentschieden</div>
            )}
          </div>

          {/* Pro Spieler: Kennzahlen + Doppel-Detail */}
          {playerStats.map(ps => ps.stats && (
            <LegStatsBlock
              key={ps.playerId}
              name={ps.name}
              color={ps.color}
              stats={ps.stats}
              colors={colors}
              styles={styles}
              showPlayerHeader={!isSolo}
            />
          ))}

          {/* Aktionen */}
          <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 8, marginTop: 4 }}>
            {onNextLeg && (
              <button onClick={onNextLeg} style={{ ...styles.pill, flex: 1, minHeight: isMobile ? 44 : undefined, background: colors.accent, color: '#fff', fontWeight: 700 }}>
                Naechstes Leg &rarr;
              </button>
            )}
            {onFinishMatch && (
              <button onClick={onFinishMatch} style={{ ...styles.pill, flex: 1, minHeight: isMobile ? 44 : undefined, background: colors.success, color: '#fff', fontWeight: 700 }}>
                Match-Summary
              </button>
            )}
            <button onClick={onBack} style={{ ...styles.backBtn, flex: 1, minHeight: isMobile ? 44 : undefined }}>
              {'\u2190'} Zurueck
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ================= Unter-Komponenten =================

function LegStatsBlock({
  name, color, stats, colors, styles, showPlayerHeader,
}: {
  name: string
  color: string
  stats: Bobs27LegStats
  colors: any
  styles: any
  showPlayerHeader: boolean
}) {
  const row = (label: string, value: string, explanation?: string) => (
    <tr>
      <td style={{ padding: '6px 8px', color: colors.fgMuted, fontSize: 13, whiteSpace: 'nowrap' }}>
        {explanation
          ? <StatTooltip label={label} tooltip={explanation} colors={colors} />
          : label}
      </td>
      <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700, fontSize: 14, whiteSpace: 'nowrap' }}>{value}</td>
    </tr>
  )

  return (
    <div style={{ ...styles.card, marginBottom: 16 }}>
      {showPlayerHeader && (
        <div style={{ ...styles.sub, marginBottom: 8, borderLeft: `4px solid ${color}`, paddingLeft: 8 }}>
          {name}
        </div>
      )}

      {/* Kennzahlen-Tabelle */}
      <div style={{ overflowX: 'auto', marginBottom: 12 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <tbody>
            {row('Endscore', String(stats.finalScore))}
            {row('Darts gesamt', String(stats.totalDarts))}
            {row('Treffer gesamt', String(stats.totalHits))}
            {row('Doppelquote (Dart)', `${stats.doubleRatePerDart.toFixed(1)}%`, `D1\u2013D20: ${stats.doublesHits}/${stats.doublesDarts}`)}
            {row('Doppelquote (Aufnahme)', `${stats.doubleRatePerVisit.toFixed(1)}%`, `D1\u2013D20: ${stats.doublesVisitsWithHit}/${stats.doublesVisits}`)}
            {stats.bullDarts !== null && row('Bull-Quote (Dart)', `${(stats.bullRatePerDart ?? 0).toFixed(1)}%`, `${stats.bullHits}/${stats.bullDarts}`)}
            {stats.bullDarts !== null && row('Bull-Aufnahme', stats.bullVisitHit ? 'Getroffen \u2714' : 'Nicht getroffen')}
            {row('Zero Visits', String(stats.zeroVisits), 'Felder mit 0/3')}
            {row('First Dart Hits', String(stats.firstDartHits), 'Treffer mit Dart 1')}
            {row('Conversion Rate', `${stats.conversionRate.toFixed(1)}%`, 'Treffer mit Dart 2/3 nach Fehlwurf')}
            {row('Beste Serie', String(stats.longestHitStreak), 'Treffer in Folge')}
            {row('Beste Target-Serie', String(stats.bestTargetStreak), 'Felder mit \u22651 Treffer in Folge')}
            {row('Schlechteste Phase', String(stats.worstZeroStreak), 'Zero Visits in Folge')}
            {stats.eliminated && row('Eliminiert', `bei D${(stats.eliminatedAtTarget ?? 0) + 1}`)}
          </tbody>
        </table>
      </div>

      {/* Doppel-Detailtabelle */}
      <div style={{ fontSize: 12, color: colors.fgMuted, marginBottom: 6, fontWeight: 600 }}>
        Doppel-Detail
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${colors.border}` }}>
              <th style={{ textAlign: 'left', padding: '4px 6px', color: colors.fgMuted }}>Doppel</th>
              <th style={{ textAlign: 'center', padding: '4px 6px', color: colors.fgMuted }}>Treffer</th>
              <th style={{ textAlign: 'center', padding: '4px 6px', color: colors.fgMuted }}>Darts</th>
              <th style={{ textAlign: 'right', padding: '4px 6px', color: colors.fgMuted }}>Delta</th>
              <th style={{ textAlign: 'center', padding: '4px 6px', color: colors.fgMuted }}>Aufnahme</th>
            </tr>
          </thead>
          <tbody>
            {stats.doubleRows.map((r, i) => {
              const isBull = r.isBull
              const bg = isBull
                ? (colors.warningBg ?? 'rgba(255,200,0,0.12)')
                : r.hits === r.darts && r.darts > 0
                  ? colors.successBg
                  : r.hits > 0
                    ? (colors.warningBg ?? 'rgba(255,200,0,0.08)')
                    : (colors.errorBg ?? 'rgba(255,0,0,0.06)')
              return (
                <tr key={i} style={{
                  borderBottom: `1px solid ${colors.border}`,
                  borderTop: isBull ? `2px solid ${colors.accent}` : undefined,
                  background: bg,
                }}>
                  <td style={{ padding: '4px 6px', fontWeight: isBull ? 700 : 500 }}>
                    {r.label}{isBull ? ' (extra)' : ''}
                  </td>
                  <td style={{ textAlign: 'center', padding: '4px 6px' }}>
                    <HitDots hits={r.hits} total={r.darts} colors={colors} />
                  </td>
                  <td style={{ textAlign: 'center', padding: '4px 6px', fontSize: 11, color: colors.fgMuted }}>
                    {r.firstDartHit ? 'D1 \u2714' : r.conversionAfterMiss ? 'Konv.' : '\u2013'}
                  </td>
                  <td style={{
                    textAlign: 'right', padding: '4px 6px', fontWeight: 600,
                    color: r.delta >= 0 ? colors.success : colors.error,
                  }}>
                    {r.delta >= 0 ? `+${r.delta}` : r.delta}
                  </td>
                  <td style={{ textAlign: 'center', padding: '4px 6px', fontWeight: 700, color: r.success ? colors.success : colors.error }}>
                    {r.success}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function HitDots({ hits, total, colors }: { hits: number; total: number; colors: any }) {
  const dots: React.ReactNode[] = []
  for (let i = 0; i < total; i++) {
    dots.push(
      <span key={i} style={{
        display: 'inline-block',
        width: 8, height: 8, borderRadius: '50%',
        background: i < hits ? colors.success : colors.error,
        marginRight: i < total - 1 ? 3 : 0,
        opacity: i < hits ? 1 : 0.4,
      }} />
    )
  }
  return <span style={{ display: 'inline-flex', alignItems: 'center' }}>{dots}</span>
}
