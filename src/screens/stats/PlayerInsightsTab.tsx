// src/screens/stats/PlayerInsightsTab.tsx
// Cross-Game Spieler-Insights: Profil, Feldanalyse, Head-to-Head, Meilensteine, Tagesform

import React, { useMemo, useState } from 'react'
import { useTheme } from '../../ThemeProvider'
import type { SQLStatsData } from '../../hooks/useSQLStats'
import GaugeChart from '../../components/charts/GaugeChart'
import BarChart from '../../components/charts/BarChart'

type Props = {
  playerId: string
  data: SQLStatsData
}

type SubTab = 'profil' | 'felder' | 'h2h' | 'meilensteine' | 'tagesform'

const SUB_TABS: { key: SubTab; label: string }[] = [
  { key: 'profil', label: 'Profil' },
  { key: 'felder', label: 'Feldanalyse' },
  { key: 'h2h', label: 'Head-to-Head' },
  { key: 'meilensteine', label: 'Meilensteine' },
  { key: 'tagesform', label: 'Tagesform' },
]

export default function PlayerInsightsTab({ playerId, data }: Props) {
  const { colors } = useTheme()
  const [subTab, setSubTab] = useState<SubTab>('profil')

  const tabBarStyle: React.CSSProperties = {
    display: 'flex',
    gap: 0,
    borderBottom: `2px solid ${colors.border}`,
    marginBottom: 16,
    overflowX: 'auto',
  }

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: '10px 16px',
    fontSize: 13,
    fontWeight: active ? 700 : 500,
    color: active ? colors.fg : colors.fgDim,
    background: 'transparent',
    border: 'none',
    borderBottom: active ? `2px solid ${colors.accent}` : '2px solid transparent',
    marginBottom: -2,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  })

  return (
    <div>
      {/* Sub-Tab-Navigation */}
      <div style={tabBarStyle}>
        {SUB_TABS.map(t => (
          <button key={t.key} style={tabStyle(subTab === t.key)} onClick={() => setSubTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {subTab === 'profil' && <ProfilTab data={data} colors={colors} />}
      {subTab === 'felder' && <FeldanalyseTab data={data} colors={colors} />}
      {subTab === 'h2h' && <HeadToHeadTab data={data} playerId={playerId} colors={colors} />}
      {subTab === 'meilensteine' && <MeilensteineTab data={data} colors={colors} />}
      {subTab === 'tagesform' && <TagesformTab data={data} colors={colors} />}
    </div>
  )
}

// ============================================================================
// SHARED COMPONENTS
// ============================================================================

function Section({ title, children, colors }: { title: string; children: React.ReactNode; colors: any }) {
  return (
    <div style={{
      background: colors.bgCard, borderRadius: 10, padding: '14px 16px',
      border: `1px solid ${colors.border}`, marginBottom: 12,
    }}>
      <div style={{
        fontSize: 14, fontWeight: 700, color: colors.fg, marginBottom: 10,
        textTransform: 'uppercase', letterSpacing: '0.04em',
      }}>{title}</div>
      {children}
    </div>
  )
}

function StatGrid({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 8 }}>
      {children}
    </div>
  )
}

function StatCell({ label, value, colors, highlight, sub }: {
  label: string; value: string | number; colors: any; highlight?: boolean; sub?: string
}) {
  return (
    <div style={{ textAlign: 'center', padding: '10px 4px', background: colors.bgDim, borderRadius: 8 }}>
      <div style={{ fontSize: 22, fontWeight: 700, color: highlight ? '#22c55e' : colors.fg }}>{value}</div>
      <div style={{ fontSize: 11, color: colors.fgDim, marginTop: 2 }}>{label}</div>
      {sub && <div style={{ fontSize: 10, color: colors.fgDim }}>{sub}</div>}
    </div>
  )
}

function MiniBar({ value, max, color, colors }: { value: number; max: number; color: string; colors: any }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return (
    <div style={{ width: '100%', height: 8, background: colors.bgDim, borderRadius: 4, overflow: 'hidden' }}>
      <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 4, transition: 'width .3s' }} />
    </div>
  )
}

function NoData({ colors, text }: { colors: any; text?: string }) {
  return (
    <div style={{ padding: 40, textAlign: 'center', color: colors.fgDim }}>
      {text ?? 'Noch keine Daten vorhanden. Spiele ein paar Matches!'}
    </div>
  )
}

// ============================================================================
// SUB-TAB 1: PROFIL (Radar Chart + Player Type + Key Metrics + GaugeCharts)
// ============================================================================

function ProfilTab({ data, colors }: { data: SQLStatsData; colors: any }) {
  const dashboard = data.crossGameDashboard
  const clutch = data.clutchStats
  const crossGameWinRates = data.crossGameWinRates ?? []

  // Compute radar axes (0-100 each)
  const radarScores = useMemo(() => {
    const x01 = data.x01
    const scoring = x01 ? Math.min(100, (x01.threeDartAvg / 80) * 100) : 0
    const finishing = x01 ? Math.min(100, (x01.checkoutPercent / 50) * 100) : 0
    // Consistency: based on how close avg darts per leg is to best leg
    const consistency = x01 ? Math.min(100, Math.max(0, x01.bestLegDarts != null && x01.avgDartsPerLeg > 0
      ? (x01.bestLegDarts / x01.avgDartsPerLeg) * 100
      : 50)) : 0
    const bulls = data.segmentAccuracy.find(s => s.field === 25)
    const bullScore = bulls ? Math.min(100, bulls.hitRate * 3) : 0
    const trebles = data.trebleRates
    const avgTreble = trebles.length > 0
      ? trebles.reduce((sum, t) => sum + t.hitRate, 0) / trebles.length
      : 0
    const tripleScore = Math.min(100, avgTreble * 4)
    const clutchScore = clutch ? Math.min(100, clutch.clutchRate * 2.5) : 0

    return {
      scoring: Math.round(scoring),
      finishing: Math.round(finishing),
      consistency: Math.round(consistency),
      bulls: Math.round(bullScore),
      triples: Math.round(tripleScore),
      clutch: Math.round(clutchScore),
    }
  }, [data])

  // Determine player type
  const playerType = useMemo(() => {
    const { scoring, finishing, consistency, bulls, triples, clutch: clutchVal } = radarScores
    const avg = (scoring + finishing + consistency + bulls + triples + clutchVal) / 6

    if (avg < 15) return { type: 'Anfaenger' as const, label: 'Anfaenger', desc: 'Du stehst am Anfang deiner Darts-Karriere. Weiter so!' }
    if (finishing > scoring && finishing > 40) return { type: 'Finisher' as const, label: 'Finisher', desc: 'Stark im Checkout! Deine Doppel sitzen.' }
    if (scoring > finishing && scoring > 40) return { type: 'Scorer' as const, label: 'Scorer', desc: 'Du erzielst konstant hohe Aufnahmen.' }
    return { type: 'Allrounder' as const, label: 'Allrounder', desc: 'Ausgewogenes Spiel ohne grosse Schwaechen.' }
  }, [radarScores])

  const typeColors: Record<string, string> = {
    Scorer: '#3b82f6',
    Finisher: '#22c55e',
    Allrounder: '#a855f7',
    Anfaenger: '#6b7280',
  }

  // Cross-game mode distribution (percentage-based)
  const gameModeWinRates = useMemo(() => {
    if (!dashboard) return []
    return dashboard.gameModeDistribution.map(g => ({
      mode: g.label,
      matches: g.matchCount,
      percentage: g.percentage,
    }))
  }, [dashboard])

  // Total hours (estimated from avg match duration * total matches)
  const totalHours = useMemo(() => {
    if (!data.timeInsights || !dashboard) return 0
    const avgMin = data.timeInsights.avgMatchDurationMinutes
    return avgMin > 0 ? Math.round((avgMin * dashboard.totalMatchesAllModes) / 60) : 0
  }, [data.timeInsights, dashboard])

  const totalDarts = data.x01?.totalDarts ?? 0
  const totalMatches = dashboard?.totalMatchesAllModes ?? 0

  // Color for gauge based on win rate
  const getGaugeColor = (wr: number) => {
    if (wr >= 60) return '#22c55e'
    if (wr >= 40) return '#f59e0b'
    return '#ef4444'
  }

  if (!dashboard && !data.x01) return <NoData colors={colors} />

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {/* Radar/Spider Chart */}
      <Section title="Spielerprofil" colors={colors}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
          <RadarChart
            scores={radarScores}
            colors={colors}
            accentColor={typeColors[playerType.type] ?? colors.accent}
          />
        </div>

        {/* Player Type Badge */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          gap: 10, padding: '12px 16px', borderRadius: 8,
          background: (typeColors[playerType.type] ?? colors.accent) + '15',
          border: `1px solid ${(typeColors[playerType.type] ?? colors.accent)}40`,
        }}>
          <div style={{
            width: 40, height: 40, borderRadius: '50%',
            background: (typeColors[playerType.type] ?? colors.accent) + '30',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 18, fontWeight: 800,
            color: typeColors[playerType.type] ?? colors.accent,
          }}>
            {playerType.label.charAt(0)}
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16, color: typeColors[playerType.type] ?? colors.accent }}>
              {playerType.label}
            </div>
            <div style={{ fontSize: 12, color: colors.fgDim }}>{playerType.desc}</div>
          </div>
        </div>
      </Section>

      {/* Key Metrics */}
      <Section title="Kennzahlen" colors={colors}>
        <StatGrid>
          <StatCell label="Darts geworfen" value={totalDarts.toLocaleString('de-DE')} colors={colors} />
          <StatCell label="Matches gesamt" value={totalMatches} colors={colors} />
          <StatCell label="Spielstunden" value={totalHours > 0 ? `${totalHours}h` : '-'} colors={colors} />
        </StatGrid>
      </Section>

      {/* Cross-Game Win Rate Gauges */}
      {crossGameWinRates.length > 0 && (
        <Section title="Winrate pro Spielmodus" colors={colors}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))',
            gap: 12,
            justifyItems: 'center',
          }}>
            {crossGameWinRates.map(wr => (
              <div key={wr.gameMode} style={{ textAlign: 'center' }}>
                <GaugeChart
                  value={wr.winRate}
                  size={90}
                  strokeWidth={10}
                  color={getGaugeColor(wr.winRate)}
                  backgroundColor={colors.bgDim}
                  formatValue={v => `${v.toFixed(0)}%`}
                />
                <div style={{ fontSize: 12, fontWeight: 600, color: colors.fg, marginTop: 2 }}>
                  {wr.gameMode}
                </div>
                <div style={{ fontSize: 10, color: colors.fgDim }}>
                  {wr.matchesWon}/{wr.matchesPlayed} Siege
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Cross-Game Distribution Table */}
      {gameModeWinRates.length > 0 && (
        <Section title="Spielmodus-Verteilung" colors={colors}>
          {gameModeWinRates.map(g => (
            <div key={g.mode} style={{
              display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8,
            }}>
              <div style={{ width: 100, fontSize: 13, fontWeight: 600, color: colors.fg, flexShrink: 0 }}>
                {g.mode}
              </div>
              <div style={{ flex: 1 }}>
                <MiniBar value={g.percentage} max={100} color={colors.accent} colors={colors} />
              </div>
              <div style={{ width: 70, textAlign: 'right', fontSize: 13, fontWeight: 600, color: colors.fg }}>
                {g.percentage}%
              </div>
              <div style={{ width: 50, textAlign: 'right', fontSize: 11, color: colors.fgDim }}>
                {g.matches}x
              </div>
            </div>
          ))}
        </Section>
      )}
    </div>
  )
}

// ============================================================================
// RADAR CHART (SVG)
// ============================================================================

function RadarChart({ scores, colors, accentColor }: {
  scores: { scoring: number; finishing: number; consistency: number; bulls: number; triples: number; clutch: number }
  colors: any
  accentColor: string
}) {
  const size = 240
  const cx = size / 2
  const cy = size / 2
  const maxR = 90

  const axes = [
    { key: 'scoring', label: 'Scoring' },
    { key: 'finishing', label: 'Finishing' },
    { key: 'consistency', label: 'Konstanz' },
    { key: 'bulls', label: 'Bulls' },
    { key: 'triples', label: 'Triples' },
    { key: 'clutch', label: 'Clutch' },
  ] as const

  const angleStep = (2 * Math.PI) / axes.length
  const startAngle = -Math.PI / 2 // start at top

  const getPoint = (index: number, value: number): [number, number] => {
    const angle = startAngle + index * angleStep
    const r = (value / 100) * maxR
    return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)]
  }

  // Grid rings
  const rings = [25, 50, 75, 100]

  // Data polygon
  const dataPoints = axes.map((a, i) => getPoint(i, scores[a.key]))
  const dataPath = dataPoints.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0]},${p[1]}`).join(' ') + 'Z'

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {/* Grid rings */}
      {rings.map(r => {
        const pts = axes.map((_, i) => getPoint(i, r))
        const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0]},${p[1]}`).join(' ') + 'Z'
        return <path key={r} d={path} fill="none" stroke={colors.border} strokeWidth={1} opacity={0.5} />
      })}

      {/* Axis lines */}
      {axes.map((_, i) => {
        const [ex, ey] = getPoint(i, 100)
        return <line key={i} x1={cx} y1={cy} x2={ex} y2={ey} stroke={colors.border} strokeWidth={1} opacity={0.3} />
      })}

      {/* Data polygon */}
      <path d={dataPath} fill={accentColor + '30'} stroke={accentColor} strokeWidth={2} />

      {/* Data points */}
      {dataPoints.map((p, i) => (
        <circle key={i} cx={p[0]} cy={p[1]} r={4} fill={accentColor} />
      ))}

      {/* Labels */}
      {axes.map((a, i) => {
        const [lx, ly] = getPoint(i, 120)
        return (
          <text
            key={a.key}
            x={lx}
            y={ly}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={11}
            fontWeight={600}
            fill={colors.fgDim}
          >
            {a.label}
          </text>
        )
      })}

      {/* Value labels */}
      {axes.map((a, i) => {
        const val = scores[a.key]
        if (val === 0) return null
        const [px, py] = dataPoints[i]
        return (
          <text
            key={`val-${a.key}`}
            x={px}
            y={py - 10}
            textAnchor="middle"
            fontSize={9}
            fontWeight={700}
            fill={accentColor}
          >
            {val}
          </text>
        )
      })}
    </svg>
  )
}

// ============================================================================
// SUB-TAB 2: FELDANALYSE (Enhanced Heatmap + Best/Worst + BarChart Doubles)
// ============================================================================

function FeldanalyseTab({ data, colors }: { data: SQLStatsData; colors: any }) {
  const segments = data.segmentAccuracy ?? []
  const doubleRates = data.doubleRates ?? []
  const trebleRates = data.trebleRates ?? []

  // Use new doubleSuccessPerField if available, otherwise fall back to doubleRates
  const doubleSuccessPerField = data.doubleSuccessPerField ?? []

  // Compute per-field data from segment accuracy
  const fieldData = useMemo(() => {
    if (segments.length === 0) return []
    return segments.map(s => ({
      field: s.field,
      hitRate: s.hitRate,
      tripleRate: trebleRates.find(t => t.field === `T${s.field}`)?.hitRate ?? 0,
      doubleRate: doubleRates.find(d => d.field === `D${s.field}`)?.hitRate ?? 0,
    }))
  }, [segments, doubleRates, trebleRates])

  // Best/Worst fields
  const sortedByHitRate = useMemo(() => {
    return [...fieldData].sort((a, b) => b.hitRate - a.hitRate)
  }, [fieldData])

  const bestFields = sortedByHitRate.slice(0, 3)
  const worstFields = sortedByHitRate.slice(-3).reverse()

  // Max for heatmap color scaling
  const maxHitRate = fieldData.length > 0 ? Math.max(...fieldData.map(f => f.hitRate)) : 100

  // Heat color with better gradient
  const getHeatColor = (rate: number) => {
    if (maxHitRate === 0) return colors.bgDim
    const intensity = rate / maxHitRate
    if (intensity <= 0.2) return '#ef444440'
    if (intensity <= 0.4) return '#f9731644'
    if (intensity <= 0.6) return '#eab30855'
    if (intensity <= 0.8) return '#84cc1666'
    return '#22c55e88'
  }

  // Double rates sorted by hit rate (best first) for BarChart
  const sortedDoublesByRate = useMemo(() => {
    const source = doubleSuccessPerField.length > 0
      ? doubleSuccessPerField.map(d => ({
          field: d.field === 'BULL' ? 'DBull' : `D${d.field}`,
          hitRate: d.hitRate,
          hits: d.hits,
          attempts: d.attempts,
        }))
      : doubleRates

    return [...source]
      .filter(d => d.attempts > 0)
      .sort((a, b) => b.hitRate - a.hitRate)
  }, [doubleSuccessPerField, doubleRates])

  // BarChart data for doubles
  const doubleBarData = useMemo(() => {
    return sortedDoublesByRate.slice(0, 15).map(d => ({
      label: d.field,
      value: d.hitRate,
      color: d.hitRate >= 30 ? '#22c55e' : d.hitRate >= 15 ? '#f59e0b' : '#ef4444',
    }))
  }, [sortedDoublesByRate])

  if (segments.length === 0 && doubleRates.length === 0 && doubleSuccessPerField.length === 0) {
    return <NoData colors={colors} text="Noch keine Felddaten vorhanden. Spiele ein paar X01-Matches!" />
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {/* Enhanced Field Heatmap */}
      {fieldData.length > 0 && (
        <Section title="Feld-Heatmap" colors={colors}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(7, 1fr)',
            gap: 4,
          }}>
            {fieldData.map(f => (
              <div key={f.field} title={`Feld ${f.field}: ${f.hitRate.toFixed(1)}% Treffer`} style={{
                padding: '10px 4px', borderRadius: 8, textAlign: 'center',
                background: getHeatColor(f.hitRate),
                border: `1px solid ${colors.border}`,
                cursor: 'default',
                transition: 'transform 0.15s, box-shadow 0.15s',
                position: 'relative',
              }}>
                <div style={{
                  fontWeight: 800, fontSize: 18, color: colors.fg,
                  lineHeight: 1.1,
                }}>{f.field}</div>
                <div style={{
                  fontSize: 11, color: colors.fg, fontWeight: 600, marginTop: 2,
                  opacity: 0.85,
                }}>{f.hitRate.toFixed(0)}%</div>
                <div style={{ display: 'flex', justifyContent: 'center', gap: 4, marginTop: 3 }}>
                  {f.tripleRate > 0 && (
                    <span style={{
                      fontSize: 9, color: '#a855f7', fontWeight: 600,
                      background: '#a855f715', padding: '0 3px', borderRadius: 3,
                    }}>T{f.tripleRate.toFixed(0)}</span>
                  )}
                  {f.doubleRate > 0 && (
                    <span style={{
                      fontSize: 9, color: '#3b82f6', fontWeight: 600,
                      background: '#3b82f615', padding: '0 3px', borderRadius: 3,
                    }}>D{f.doubleRate.toFixed(0)}</span>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Color Legend */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6, marginTop: 10,
            justifyContent: 'center', flexWrap: 'wrap',
          }}>
            <span style={{ fontSize: 10, color: colors.fgDim, marginRight: 4 }}>Legende:</span>
            {[
              { label: 'Niedrig', color: '#ef444440' },
              { label: '', color: '#f97316044' },
              { label: 'Mittel', color: '#eab30855' },
              { label: '', color: '#84cc1666' },
              { label: 'Hoch', color: '#22c55e88' },
            ].map((item, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                <div style={{
                  width: 16, height: 10, borderRadius: 2,
                  background: item.color, border: `1px solid ${colors.border}`,
                }} />
                {item.label && (
                  <span style={{ fontSize: 10, color: colors.fgDim }}>{item.label}</span>
                )}
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 12, marginTop: 6, fontSize: 10, color: colors.fgDim, justifyContent: 'center' }}>
            <span style={{ color: '#a855f7' }}>T = Triple%</span>
            <span style={{ color: '#3b82f6' }}>D = Double%</span>
          </div>
        </Section>
      )}

      {/* Best/Worst Fields */}
      {bestFields.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <Section title="Beste Felder" colors={colors}>
            {bestFields.map((f, i) => (
              <div key={f.field} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '6px 0',
                borderBottom: i < bestFields.length - 1 ? `1px solid ${colors.border}22` : 'none',
              }}>
                <span style={{ fontWeight: 700, fontSize: 16, color: '#22c55e' }}>{f.field}</span>
                <span style={{ fontSize: 13, color: colors.fg }}>{f.hitRate.toFixed(1)}%</span>
              </div>
            ))}
          </Section>
          <Section title="Schwachstellen" colors={colors}>
            {worstFields.map((f, i) => (
              <div key={f.field} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '6px 0',
                borderBottom: i < worstFields.length - 1 ? `1px solid ${colors.border}22` : 'none',
              }}>
                <span style={{ fontWeight: 700, fontSize: 16, color: '#ef4444' }}>{f.field}</span>
                <span style={{ fontSize: 13, color: colors.fg }}>{f.hitRate.toFixed(1)}%</span>
              </div>
            ))}
          </Section>
        </div>
      )}

      {/* Double Success BarChart (sorted by hit rate) */}
      {doubleBarData.length > 0 && (
        <Section title="Doppel-Trefferquote (sortiert)" colors={colors}>
          <BarChart
            data={doubleBarData}
            maxValue={Math.max(...doubleBarData.map(d => d.value), 1)}
            height={20}
            gap={6}
            showValues
            formatValue={v => `${v.toFixed(1)}%`}
          />
          {sortedDoublesByRate.length > 0 && (
            <div style={{ fontSize: 10, color: colors.fgDim, marginTop: 8, textAlign: 'center' }}>
              Top {Math.min(15, sortedDoublesByRate.length)} Doppelfelder nach Trefferquote
            </div>
          )}
        </Section>
      )}
    </div>
  )
}

// ============================================================================
// SUB-TAB 3: HEAD-TO-HEAD
// ============================================================================

function HeadToHeadTab({ data, playerId, colors }: { data: SQLStatsData; playerId: string; colors: any }) {
  const h2hList = data.crossGameH2H ?? []
  const [selectedOpponent, setSelectedOpponent] = useState<string | null>(null)

  const opponent = h2hList.find(h => h.opponentId === selectedOpponent)

  if (h2hList.length === 0) {
    return <NoData colors={colors} text="Keine Head-to-Head-Daten vorhanden. Spiele gegen andere Spieler!" />
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {/* Opponent Selector */}
      <Section title="Gegner auswaehlen" colors={colors}>
        <select
          value={selectedOpponent ?? ''}
          onChange={e => setSelectedOpponent(e.target.value || null)}
          style={{
            width: '100%', padding: '10px 12px', borderRadius: 8,
            border: `1px solid ${colors.border}`, background: colors.bgDim,
            color: colors.fg, fontSize: 14,
          }}
        >
          <option value="">-- Gegner waehlen --</option>
          {h2hList.map(h => (
            <option key={h.opponentId} value={h.opponentId}>{h.opponentName}</option>
          ))}
        </select>
      </Section>

      {opponent && (
        <>
          {/* Overall Record */}
          <Section title="Gesamtbilanz" colors={colors}>
            <div style={{
              display: 'flex', justifyContent: 'center', alignItems: 'center',
              gap: 24, padding: '16px 0',
            }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 36, fontWeight: 800, color: '#22c55e' }}>{opponent.wins}</div>
                <div style={{ fontSize: 12, color: colors.fgDim }}>Siege</div>
              </div>
              <div style={{
                fontSize: 24, fontWeight: 300, color: colors.fgDim,
              }}>:</div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 36, fontWeight: 800, color: '#ef4444' }}>{opponent.losses}</div>
                <div style={{ fontSize: 12, color: colors.fgDim }}>Niederlagen</div>
              </div>
            </div>
            <div style={{ textAlign: 'center', fontSize: 13, color: colors.fgDim }}>
              {opponent.totalMatches} Matches gesamt | Winrate: {opponent.winRate.toFixed(0)}%
            </div>
            <div style={{ marginTop: 8 }}>
              <MiniBar
                value={opponent.winRate}
                max={100}
                color={opponent.winRate >= 50 ? '#22c55e' : '#ef4444'}
                colors={colors}
              />
            </div>
          </Section>

          {/* Per-Mode Breakdown */}
          {opponent.modes && opponent.modes.length > 0 && (
            <Section title="Bilanz pro Spielmodus" colors={colors}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${colors.border}` }}>
                    <th style={{ textAlign: 'left', padding: '6px 8px', color: colors.fgDim, fontWeight: 600 }}>Modus</th>
                    <th style={{ textAlign: 'right', padding: '6px 8px', color: colors.fgDim, fontWeight: 600 }}>Matches</th>
                    <th style={{ textAlign: 'right', padding: '6px 8px', color: colors.fgDim, fontWeight: 600 }}>Siege</th>
                    <th style={{ textAlign: 'right', padding: '6px 8px', color: colors.fgDim, fontWeight: 600 }}>Quote</th>
                  </tr>
                </thead>
                <tbody>
                  {opponent.modes.map(m => {
                    const wr = m.matches > 0 ? (m.wins / m.matches) * 100 : 0
                    return (
                      <tr key={m.label} style={{ borderBottom: `1px solid ${colors.border}22` }}>
                        <td style={{ padding: '6px 8px', color: colors.fg, fontWeight: 600 }}>{m.label}</td>
                        <td style={{ textAlign: 'right', padding: '6px 8px', color: colors.fgDim }}>{m.matches}</td>
                        <td style={{ textAlign: 'right', padding: '6px 8px', color: '#22c55e' }}>{m.wins}</td>
                        <td style={{
                          textAlign: 'right', padding: '6px 8px', fontWeight: 600,
                          color: wr >= 50 ? '#22c55e' : '#ef4444',
                        }}>{wr.toFixed(0)}%</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </Section>
          )}
        </>
      )}
    </div>
  )
}

// ============================================================================
// SUB-TAB 4: MEILENSTEINE (Enhanced Milestones with Icons + Progress Bars)
// ============================================================================

type MilestoneCategory = 'scoring' | 'finishing' | 'consistency' | 'endurance'

interface MilestoneItem {
  id: string
  title: string
  description: string
  category: MilestoneCategory
  unlocked: boolean
  unlockedAt?: string
  progress: number  // 0-1
  value?: number
  target?: number
}

const CATEGORY_ICONS: Record<MilestoneCategory, string> = {
  scoring: '\u2605',     // filled star
  finishing: '\u25C6',   // diamond
  consistency: '\u25CF', // circle
  endurance: '\u25B2',   // triangle
}

function MeilensteineTab({ data, colors }: { data: SQLStatsData; colors: any }) {
  const achievements = data.fullAchievements ?? []

  // Map achievements to milestones
  const milestones: MilestoneItem[] = useMemo(() => {
    if (achievements.length === 0) return getDefaultMilestones(data)
    return achievements.map(a => ({
      id: a.id,
      title: a.title,
      description: a.description,
      category: mapCategory(a.category),
      unlocked: a.unlocked,
      unlockedAt: a.unlockedDate,
      progress: a.progress ?? (a.unlocked ? 1 : 0),
      value: a.value,
      target: a.target,
    }))
  }, [achievements, data])

  const unlocked = milestones.filter(m => m.unlocked)
  const locked = milestones.filter(m => !m.unlocked)

  const categoryLabels: Record<MilestoneCategory, string> = {
    scoring: 'Scoring',
    finishing: 'Finishing',
    consistency: 'Konstanz',
    endurance: 'Ausdauer',
  }
  const categoryColors: Record<MilestoneCategory, string> = {
    scoring: '#3b82f6',
    finishing: '#22c55e',
    consistency: '#a855f7',
    endurance: '#f59e0b',
  }

  if (milestones.length === 0) {
    return <NoData colors={colors} text="Noch keine Meilensteine verfuegbar." />
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {/* Progress overview */}
      <Section title="Fortschritt" colors={colors}>
        <div style={{ textAlign: 'center', marginBottom: 8 }}>
          <div style={{ fontSize: 32, fontWeight: 800, color: colors.accent }}>{unlocked.length}</div>
          <div style={{ fontSize: 13, color: colors.fgDim }}>von {milestones.length} Meilensteinen erreicht</div>
        </div>
        {milestones.length > 0 && (
          <div style={{ height: 10, background: colors.bgDim, borderRadius: 5, overflow: 'hidden' }}>
            <div style={{
              width: `${(unlocked.length / milestones.length) * 100}%`,
              height: '100%', background: `linear-gradient(90deg, ${colors.accent}, #22c55e)`, borderRadius: 5,
              transition: 'width 0.5s ease',
            }} />
          </div>
        )}

        {/* Category breakdown */}
        <div style={{
          display: 'flex', justifyContent: 'center', gap: 16, marginTop: 12, flexWrap: 'wrap',
        }}>
          {(Object.keys(categoryLabels) as MilestoneCategory[]).map(cat => {
            const total = milestones.filter(m => m.category === cat).length
            const done = milestones.filter(m => m.category === cat && m.unlocked).length
            if (total === 0) return null
            return (
              <div key={cat} style={{
                display: 'flex', alignItems: 'center', gap: 4,
                fontSize: 11, color: colors.fgDim,
              }}>
                <span style={{ color: categoryColors[cat], fontSize: 14 }}>
                  {CATEGORY_ICONS[cat]}
                </span>
                <span style={{ fontWeight: 600, color: categoryColors[cat] }}>
                  {categoryLabels[cat]}
                </span>
                <span>{done}/{total}</span>
              </div>
            )
          })}
        </div>
      </Section>

      {/* Unlocked milestones timeline */}
      {unlocked.length > 0 && (
        <Section title="Erreichte Meilensteine" colors={colors}>
          <div style={{ position: 'relative', paddingLeft: 28 }}>
            {/* Vertical line */}
            <div style={{
              position: 'absolute', left: 10, top: 8, bottom: 8,
              width: 2, background: colors.border,
            }} />
            {unlocked.map((m, i) => (
              <div key={m.id} style={{
                position: 'relative', paddingBottom: i < unlocked.length - 1 ? 16 : 0,
              }}>
                {/* Icon on timeline */}
                <div style={{
                  position: 'absolute', left: -24, top: 2,
                  width: 20, height: 20, borderRadius: '50%',
                  background: categoryColors[m.category],
                  border: `2px solid ${colors.bgCard}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 10, color: '#fff', fontWeight: 700,
                }}>
                  {'\u2713'}
                </div>
                <div style={{ paddingLeft: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{ color: categoryColors[m.category], fontSize: 14 }}>
                      {CATEGORY_ICONS[m.category]}
                    </span>
                    <span style={{ fontWeight: 700, fontSize: 14, color: colors.fg }}>{m.title}</span>
                    <span style={{
                      fontSize: 10, padding: '1px 6px', borderRadius: 4,
                      background: categoryColors[m.category] + '22',
                      color: categoryColors[m.category],
                    }}>{categoryLabels[m.category]}</span>
                  </div>
                  <div style={{ fontSize: 12, color: colors.fgDim, marginTop: 2 }}>{m.description}</div>
                  {m.unlockedAt && (
                    <div style={{ fontSize: 10, color: colors.fgDim, marginTop: 2 }}>
                      {new Date(m.unlockedAt).toLocaleDateString('de-DE')}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Locked milestones with progress bars */}
      {locked.length > 0 && (
        <Section title="Noch offen" colors={colors}>
          {locked.map(m => {
            const progressPct = Math.min(100, m.progress * 100)
            return (
              <div key={m.id} style={{
                padding: '10px 12px', borderRadius: 8, marginBottom: 6,
                background: colors.bgDim,
                border: `1px solid ${colors.border}`,
                display: 'flex', alignItems: 'flex-start', gap: 10,
              }}>
                {/* Category icon */}
                <div style={{
                  width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: categoryColors[m.category] + '18',
                  color: categoryColors[m.category], fontSize: 16,
                }}>
                  {CATEGORY_ICONS[m.category]}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontWeight: 600, fontSize: 13, color: colors.fg }}>{m.title}</span>
                  </div>
                  <div style={{ fontSize: 11, color: colors.fgDim, marginTop: 1 }}>{m.description}</div>
                  {/* Progress bar */}
                  <div style={{ marginTop: 6 }}>
                    <div style={{
                      height: 6, background: colors.border, borderRadius: 3, overflow: 'hidden',
                      position: 'relative',
                    }}>
                      <div style={{
                        width: `${progressPct}%`,
                        height: '100%',
                        background: progressPct >= 80
                          ? `linear-gradient(90deg, ${categoryColors[m.category]}, #22c55e)`
                          : categoryColors[m.category],
                        borderRadius: 3,
                        transition: 'width 0.4s ease',
                      }} />
                    </div>
                    <div style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      fontSize: 10, color: colors.fgDim, marginTop: 3,
                    }}>
                      <span>
                        {m.value != null && m.target != null
                          ? `${m.value} / ${m.target}`
                          : `${progressPct.toFixed(0)}%`}
                      </span>
                      <span style={{
                        fontWeight: 600,
                        color: progressPct >= 80 ? '#22c55e' : progressPct >= 50 ? '#f59e0b' : colors.fgDim,
                      }}>
                        {progressPct >= 80 ? 'Fast geschafft!' : progressPct >= 50 ? 'Auf gutem Weg' : ''}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </Section>
      )}
    </div>
  )
}

function mapCategory(cat: string): MilestoneCategory {
  if (cat === 'rare' || cat === 'skill') return 'scoring'
  if (cat === 'dedication') return 'endurance'
  if (cat === 'milestone') return 'consistency'
  return 'scoring'
}

function getDefaultMilestones(data: SQLStatsData): MilestoneItem[] {
  const x01 = data.x01
  const dashboard = data.crossGameDashboard
  const milestones: MilestoneItem[] = []

  // Scoring milestones
  const totalMatches = dashboard?.totalMatchesAllModes ?? 0
  const matchTargets = [10, 50, 100, 250, 500]
  for (const t of matchTargets) {
    milestones.push({
      id: `matches-${t}`,
      title: `${t} Matches`,
      description: `Spiele ${t} Matches`,
      category: 'endurance',
      unlocked: totalMatches >= t,
      progress: Math.min(1, totalMatches / t),
      value: totalMatches,
      target: t,
    })
  }

  // Scoring milestones (X01)
  if (x01) {
    const avg = x01.threeDartAvg
    const avgTargets = [30, 40, 50, 60, 70]
    for (const t of avgTargets) {
      milestones.push({
        id: `avg-${t}`,
        title: `${t}er Average`,
        description: `Erreiche einen 3-Dart-Average von ${t}+`,
        category: 'scoring',
        unlocked: avg >= t,
        progress: Math.min(1, avg / t),
        value: Math.round(avg * 10) / 10,
        target: t,
      })
    }

    // Finishing milestones
    const coTargets = [20, 30, 40, 50]
    for (const t of coTargets) {
      milestones.push({
        id: `checkout-${t}`,
        title: `${t}% Checkout`,
        description: `Checkout-Quote von ${t}%+`,
        category: 'finishing',
        unlocked: x01.checkoutPercent >= t,
        progress: Math.min(1, x01.checkoutPercent / t),
        value: Math.round(x01.checkoutPercent * 10) / 10,
        target: t,
      })
    }
  }

  return milestones
}

// ============================================================================
// SUB-TAB 5: TAGESFORM (Time Insights with BarChart)
// ============================================================================

function TagesformTab({ data, colors }: { data: SQLStatsData; colors: any }) {
  const timeInsights = data.timeInsights
  const warmup = data.warmupEffect
  const sessions = data.sessionPerformance ?? []
  const timeOfDayStats = data.timeOfDayStats ?? []

  if (!timeInsights && !warmup && sessions.length === 0 && timeOfDayStats.length === 0) {
    return <NoData colors={colors} text="Noch keine Zeitdaten vorhanden. Spiele ein paar Matches!" />
  }

  // Hourly performance — prefer timeOfDayStats if available, else timeInsights
  const hourlyData = timeInsights?.hourlyPerformance ?? []

  // Find best hour
  const bestHourEntry = useMemo(() => {
    if (hourlyData.length === 0) return null
    const withData = hourlyData.filter(h => h.matchCount >= 3)
    if (withData.length === 0) return null
    return withData.reduce((best, h) => h.winRate > best.winRate ? h : best, withData[0])
  }, [hourlyData])

  // BarChart data for hourly performance
  const hourlyBarData = useMemo(() => {
    if (hourlyData.length === 0) return []
    return hourlyData.map(h => ({
      label: `${h.hour}:00`,
      value: h.matchCount >= 3 ? h.winRate : 0,
      color: bestHourEntry && h.hour === bestHourEntry.hour
        ? '#22c55e'
        : h.matchCount >= 3
          ? (h.winRate >= 50 ? '#3b82f6' : '#ef4444')
          : colors.bgDim,
    }))
  }, [hourlyData, bestHourEntry, colors])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {/* Best time overview */}
      {timeInsights && (
        <Section title="Deine beste Spielzeit" colors={colors}>
          <StatGrid>
            {timeInsights.bestHour !== null && timeInsights.bestHour !== undefined && (
              <StatCell
                label="Beste Uhrzeit"
                value={`${timeInsights.bestHour}:00`}
                colors={colors}
                highlight
                sub={`${timeInsights.bestHourWinRate}% Winrate`}
              />
            )}
            {timeInsights.fastestMatchMinutes != null && (
              <StatCell
                label="Schnellstes Match"
                value={`${timeInsights.fastestMatchMinutes} min`}
                colors={colors}
              />
            )}
            {timeInsights.avgMatchDurationMinutes > 0 && (
              <StatCell
                label="Avg. Spieldauer"
                value={`${timeInsights.avgMatchDurationMinutes} min`}
                colors={colors}
              />
            )}
          </StatGrid>
        </Section>
      )}

      {/* Hourly performance BarChart */}
      {hourlyBarData.length > 0 && (
        <Section title="Performance nach Uhrzeit" colors={colors}>
          <BarChart
            data={hourlyBarData}
            maxValue={100}
            height={20}
            gap={4}
            showValues
            formatValue={v => v > 0 ? `${v.toFixed(0)}%` : '-'}
          />
          <div style={{ fontSize: 10, color: colors.fgDim, marginTop: 8, textAlign: 'center' }}>
            Winrate nach Uhrzeit (mind. 3 Matches) |{' '}
            {bestHourEntry && (
              <span style={{ color: '#22c55e', fontWeight: 600 }}>
                Beste Stunde: {bestHourEntry.hour}:00 ({bestHourEntry.winRate.toFixed(0)}%)
              </span>
            )}
          </div>
        </Section>
      )}

      {/* Day-of-week: computed from session data */}
      {sessions.length > 0 && (() => {
        const dayLabels = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa']
        const dayCounts: { wins: number; total: number }[] = Array.from({ length: 7 }, () => ({ wins: 0, total: 0 }))
        for (const s of sessions) {
          const d = new Date(s.sessionDate).getDay()
          dayCounts[d].total++
          if (s.won) dayCounts[d].wins++
        }
        // Reorder Mon-Sun
        const ordered = [1, 2, 3, 4, 5, 6, 0].map(i => ({ label: dayLabels[i], ...dayCounts[i] })).filter(d => d.total > 0)
        if (ordered.length === 0) return null
        return (
          <Section title="Performance nach Wochentag" colors={colors}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {ordered.map(d => {
                const wr = d.total > 0 ? (d.wins / d.total) * 100 : 0
                return (
                  <div key={d.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 28, fontSize: 13, fontWeight: 600, color: colors.fg }}>{d.label}</div>
                    <div style={{ flex: 1 }}>
                      <MiniBar value={wr} max={100} color={wr >= 50 ? '#22c55e' : wr > 0 ? '#ef4444' : colors.bgDim} colors={colors} />
                    </div>
                    <div style={{ width: 40, fontSize: 12, textAlign: 'right', fontWeight: 600, color: wr >= 50 ? '#22c55e' : '#ef4444' }}>
                      {wr.toFixed(0)}%
                    </div>
                    <div style={{ width: 40, fontSize: 10, color: colors.fgDim, textAlign: 'right' }}>{d.total}x</div>
                  </div>
                )
              })}
            </div>
          </Section>
        )
      })()}

      {/* Warm-up Effect */}
      {warmup && warmup.sessionCount >= 3 && (
        <Section title="Warmup-Effekt" colors={colors}>
          <div style={{ display: 'flex', justifyContent: 'space-around', padding: '12px 0' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: colors.fgDim, marginBottom: 4 }}>1. Match</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: colors.fg }}>{warmup.firstMatchAvg.toFixed(1)}</div>
            </div>
            <div style={{
              display: 'flex', alignItems: 'center',
              fontSize: 20, fontWeight: 700,
              color: warmup.difference > 0 ? '#22c55e' : warmup.difference < 0 ? '#ef4444' : colors.fgDim,
            }}>
              {warmup.difference > 0 ? '+' : ''}{warmup.difference.toFixed(1)}
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: colors.fgDim, marginBottom: 4 }}>Spaetere Matches</div>
              <div style={{ fontSize: 28, fontWeight: 700, color: colors.fg }}>{warmup.laterMatchesAvg.toFixed(1)}</div>
            </div>
          </div>
          <div style={{ textAlign: 'center', fontSize: 12, color: colors.fgDim }}>
            Basierend auf {warmup.sessionCount} Sessions
          </div>
        </Section>
      )}

      {/* Session Performance */}
      {sessions.length > 0 && (() => {
        // Group sessions by date
        const grouped: Record<string, { date: string; matches: typeof sessions }> = {}
        for (const s of sessions) {
          if (!grouped[s.sessionDate]) grouped[s.sessionDate] = { date: s.sessionDate, matches: [] }
          grouped[s.sessionDate].matches.push(s)
        }
        const sessionList = Object.values(grouped).slice(0, 10)
        return (
          <Section title="Sessions (letzte 10)" colors={colors}>
            {sessionList.map((session, i) => {
              const avgTda = session.matches.reduce((s, m) => s + m.threeDartAvg, 0) / session.matches.length
              const wins = session.matches.filter(m => m.won).length
              const wr = session.matches.length > 0 ? (wins / session.matches.length) * 100 : 0
              return (
                <div key={session.date} style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0',
                  borderBottom: i < sessionList.length - 1 ? `1px solid ${colors.border}22` : 'none',
                }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: colors.fg }}>
                      {new Date(session.date).toLocaleDateString('de-DE')}
                    </div>
                    <div style={{ fontSize: 11, color: colors.fgDim }}>
                      {session.matches.length} Match{session.matches.length !== 1 ? 'es' : ''} | Avg: {avgTda.toFixed(1)}
                    </div>
                  </div>
                  <div style={{
                    fontSize: 14, fontWeight: 700,
                    color: wr >= 50 ? '#22c55e' : '#ef4444',
                  }}>
                    {wr.toFixed(0)}%
                  </div>
                </div>
              )
            })}
          </Section>
        )
      })()}
    </div>
  )
}
