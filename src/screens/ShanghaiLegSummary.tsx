// src/screens/ShanghaiLegSummary.tsx
// Leg-Zusammenfassung fuer Shanghai (nach jedem Leg + aus Match-History aufrufbar).

import React, { useMemo, useState, useEffect } from 'react'
import { getThemedUI } from '../ui'
import { useTheme } from '../ThemeProvider'
import { getShanghaiMatchById } from '../storage'
import {
  computeShanghaiLegStats,
  SHANGHAI_MAX_SCORE,
  SHANGHAI_TOTAL_DARTS,
  type ShanghaiLegStats,
} from '../stats/computeShanghaiLegStats'
import { PLAYER_COLORS } from '../playerColors'
import StatTooltip from '../components/StatTooltip'
import ShanghaiScoreProgressionChart from '../components/ShanghaiScoreProgressionChart'
import type { ShanghaiRoundFinishedEvent } from '../types/shanghai'

type Props = {
  matchId: string
  legIndex: number
  onBack: () => void
  onNextLeg?: () => void
  onFinishMatch?: () => void
}

export default function ShanghaiLegSummary({ matchId, legIndex, onBack, onNextLeg, onFinishMatch }: Props) {
  const { colors, isArcade } = useTheme()
  const styles = useMemo(() => getThemedUI(colors, isArcade), [colors, isArcade])

  const [isMobile, setIsMobile] = useState(() => Math.min(window.innerWidth, window.innerHeight) < 600)
  useEffect(() => {
    const check = () => setIsMobile(Math.min(window.innerWidth, window.innerHeight) < 600)
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  const storedMatch = getShanghaiMatchById(matchId)
  const players = storedMatch?.players ?? []

  const legWinnerId = useMemo(() => {
    if (!storedMatch) return null
    for (const ev of storedMatch.events) {
      if (ev.type === 'ShanghaiLegFinished') {
        let currentLeg = 0
        for (const e2 of storedMatch.events) {
          if (e2 === ev) break
          if (e2.type === 'ShanghaiLegStarted') currentLeg = e2.legIndex
        }
        if (currentLeg === legIndex) return ev.winnerId
      }
    }
    return null
  }, [storedMatch, legIndex])

  const playerStats: Array<{ playerId: string; name: string; color: string; stats: ShanghaiLegStats | null }> = useMemo(() => {
    if (!storedMatch) return []
    return players.map((p, i) => ({
      playerId: p.playerId,
      name: p.name,
      color: PLAYER_COLORS[i % PLAYER_COLORS.length],
      stats: computeShanghaiLegStats(storedMatch, p.playerId, legIndex),
    }))
  }, [storedMatch, players, legIndex])

  // Runden-Events dieses Legs fuer Score-Progression-Chart
  const legRounds: ShanghaiRoundFinishedEvent[] = useMemo(() => {
    if (!storedMatch) return []
    const result: ShanghaiRoundFinishedEvent[] = []
    let currentLeg = 0
    for (const ev of storedMatch.events) {
      if (ev.type === 'ShanghaiLegStarted') { currentLeg = ev.legIndex; continue }
      if (currentLeg !== legIndex) continue
      if (ev.type === 'ShanghaiRoundFinished') result.push(ev)
    }
    return result
  }, [storedMatch, legIndex])

  const playerColorMap: Record<string, string> = useMemo(() => {
    const m: Record<string, string> = {}
    playerStats.forEach(ps => { m[ps.playerId] = ps.color })
    return m
  }, [playerStats])

  const legsCount = useMemo(() => {
    if (!storedMatch) return 1
    const structure = storedMatch.structure
    if (structure.kind === 'legs') return structure.bestOfLegs ?? 1
    return (structure.bestOfSets || 1) * (structure.legsPerSet || 1)
  }, [storedMatch])
  const winsNeeded = Math.ceil(legsCount / 2)

  if (!storedMatch) {
    return (
      <div style={styles.page}>
        <p>Match nicht gefunden.</p>
        <button style={styles.backBtn} onClick={onBack}>&larr; Zurueck</button>
      </div>
    )
  }

  const winnerName = legWinnerId ? players.find(p => p.playerId === legWinnerId)?.name ?? null : null
  const isSolo = players.length === 1

  return (
    <div style={styles.page}>
      <div style={styles.headerRow}>
        <h2 style={{ margin: 0 }}>
          {legsCount > 1 ? `Shanghai · FT${winsNeeded} · Leg ${legIndex + 1}` : `Shanghai · Leg ${legIndex + 1}`}
        </h2>
        <button style={styles.backBtn} onClick={onBack}>&larr; Zurueck</button>
      </div>

      <div style={styles.centerPage}>
        <div style={{ ...styles.centerInner, maxWidth: isMobile ? '100%' : 640, padding: isMobile ? '0 4px' : undefined }}>

          <div style={{ ...styles.card, marginBottom: 16, textAlign: 'center' }}>
            <div style={{ fontSize: 13, color: colors.fgMuted, marginBottom: 4 }}>
              {isSolo ? 'Leg-Ergebnis' : 'Leg-Sieger'}
            </div>
            {isSolo ? (
              <>
                <div style={{ fontSize: 28, fontWeight: 800, color: colors.accent }}>
                  {playerStats[0]?.stats?.finalScore ?? 0} Punkte
                </div>
                <div style={{ fontSize: 13, color: colors.fgMuted, marginTop: 4 }}>
                  {(playerStats[0]?.stats?.scorePercent ?? 0).toFixed(1)}% von {SHANGHAI_MAX_SCORE}
                </div>
              </>
            ) : winnerName ? (
              <div style={{ fontSize: 24, fontWeight: 700, color: colors.success }}>
                {winnerName} {'\u{1F3C6}'}
              </div>
            ) : (
              <div style={{ fontSize: 22, fontWeight: 700, color: colors.fgDim }}>Unentschieden</div>
            )}
          </div>

          {/* Score-Progression-Chart fuer dieses Leg */}
          {legRounds.length >= 2 && (
            <div style={{ ...styles.card, marginBottom: 16 }}>
              <div style={{ ...styles.sub, marginBottom: 8 }}>Punkteverlauf (Leg {legIndex + 1})</div>
              <ShanghaiScoreProgressionChart
                rounds={legRounds}
                players={storedMatch.players}
                playerColors={playerColorMap}
                colors={colors}
              />
            </div>
          )}

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

function LegStatsBlock({
  name, color, stats, colors, styles, showPlayerHeader,
}: {
  name: string
  color: string
  stats: ShanghaiLegStats
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

      <div style={{ overflowX: 'auto', marginBottom: 12 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <tbody>
            {row('Gesamtpunkte', String(stats.finalScore))}
            {row('Max Punkte', String(SHANGHAI_MAX_SCORE), 'Referenz')}
            {row('Score %', `${stats.scorePercent.toFixed(1)}%`, `Score / ${SHANGHAI_MAX_SCORE}`)}
            {row('Darts gesamt', String(stats.totalDarts), `max ${SHANGHAI_TOTAL_DARTS}`)}
            {row('Treffer gesamt', String(stats.totalHits))}
            {row('Trefferquote (Dart)', `${stats.hitRatePerDart.toFixed(1)}%`, 'Treffer / Darts')}
            {row('Aufnahme-Quote', `${stats.visitHitRate.toFixed(1)}%`, 'Runden mit \u22651 Treffer')}
            {row('Zero Rounds', String(stats.zeroRounds))}
            {row('First Dart Hits', String(stats.firstDartHits))}
            {row('First Dart Impact', `${stats.firstDartImpact.toFixed(1)}%`, 'Punkte durch Dart 1')}
            {row('Conversion Rate', `${stats.conversionRate.toFixed(1)}%`, 'Treffer Dart 2/3 nach Fehler')}
            {row('Triple Hits', String(stats.triples))}
            {row('Triple Rate', `${stats.tripleRate.toFixed(1)}%`, 'Triple / Treffer')}
            {row('Effizienz', stats.efficiency.toFixed(1), 'Punkte / Treffer')}
            {row('Aggressions-Index', `${stats.aggressionIndex.toFixed(1)}%`, 'Triple / Darts')}
            {row('Clutch Score (15\u201320)', String(stats.clutchScore))}
            {row('Clutch Quote (15\u201320)', `${stats.clutchHitRate.toFixed(1)}%`)}
            {row('Einbruch-Index', stats.breakdownIndex.toFixed(1), 'Ø1-10 − Ø11-20')}
            {row('Konsistenz-Rate', `${stats.consistencyRate.toFixed(1)}%`, '\u22652 Treffer pro Runde')}
            {row('Beste Serie', String(stats.longestHitStreak), 'Treffer in Folge')}
            {row('High Score Runde', String(stats.highScoreRound), 'max 60')}
            {row('Shanghai', stats.shanghaiAchieved ? 'Ja \u2714' : 'Nein')}
          </tbody>
        </table>
      </div>

      <div style={{ fontSize: 12, color: colors.fgMuted, marginBottom: 6, fontWeight: 600 }}>
        Pro Runde
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${colors.border}` }}>
              <th style={{ textAlign: 'left', padding: '4px 6px', color: colors.fgMuted }}>Rd</th>
              <th style={{ textAlign: 'center', padding: '4px 6px', color: colors.fgMuted }}>Zahl</th>
              <th style={{ textAlign: 'center', padding: '4px 6px', color: colors.fgMuted }}>Hits</th>
              <th style={{ textAlign: 'right', padding: '4px 6px', color: colors.fgMuted }}>Pkt</th>
              <th style={{ textAlign: 'center', padding: '4px 6px', color: colors.fgMuted }}>Aufn.</th>
              <th style={{ textAlign: 'center', padding: '4px 6px', color: colors.fgMuted }}>1.D</th>
              <th style={{ textAlign: 'center', padding: '4px 6px', color: colors.fgMuted }}>T</th>
              <th style={{ textAlign: 'center', padding: '4px 6px', color: colors.fgMuted }}>D</th>
              <th style={{ textAlign: 'center', padding: '4px 6px', color: colors.fgMuted }}>S</th>
              <th style={{ textAlign: 'center', padding: '4px 6px', color: colors.fgMuted }}>Sh!</th>
            </tr>
          </thead>
          <tbody>
            {stats.rounds.map((r) => {
              const bg = r.hits === 3
                ? colors.successBg
                : r.hits >= 1
                  ? (colors.warningBg ?? 'rgba(255,200,0,0.08)')
                  : (colors.errorBg ?? 'rgba(255,0,0,0.06)')
              return (
                <tr key={r.round} style={{ borderBottom: `1px solid ${colors.border}`, background: bg }}>
                  <td style={{ padding: '4px 6px', fontWeight: 600 }}>{r.round}</td>
                  <td style={{ padding: '4px 6px', textAlign: 'center' }}>{r.targetNumber}</td>
                  <td style={{ padding: '4px 6px', textAlign: 'center', fontWeight: 700, color: r.hits >= 2 ? colors.success : r.hits >= 1 ? colors.fg : colors.error }}>
                    {r.hits}
                  </td>
                  <td style={{ padding: '4px 6px', textAlign: 'right', fontWeight: 600, color: r.score > 0 ? colors.success : colors.fgDim }}>
                    {r.score}
                  </td>
                  <td style={{ padding: '4px 6px', textAlign: 'center' }}>{r.roundHit ? '1' : '0'}</td>
                  <td style={{ padding: '4px 6px', textAlign: 'center' }}>{r.firstDartHit ? (r.firstDartMult === 3 ? 'T' : r.firstDartMult === 2 ? 'D' : 'S') : '\u2013'}</td>
                  <td style={{ padding: '4px 6px', textAlign: 'center', color: r.triples > 0 ? colors.success : colors.fgDim }}>{r.triples}</td>
                  <td style={{ padding: '4px 6px', textAlign: 'center' }}>{r.doubles}</td>
                  <td style={{ padding: '4px 6px', textAlign: 'center' }}>{r.singles}</td>
                  <td style={{ padding: '4px 6px', textAlign: 'center', fontWeight: 700, color: r.isShanghai ? colors.success : colors.fgDim }}>
                    {r.isShanghai ? '\u2605' : ''}
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
