// src/screens/stats/AdvancedStatsTab.tsx
// Erweiterte Statistiken: Analyse, Achievements, Training

import React, { useMemo } from 'react'
import { useTheme } from '../../ThemeProvider'
import { getThemedUI } from '../../ui'
import type { SQLStatsData } from '../../hooks/useSQLStats'
import BarChart from '../../components/charts/BarChart'
import LineChart from '../../components/charts/LineChart'

type Props = {
  data: SQLStatsData
  tab: 'analyse' | 'erfolge' | 'training'
  playerName: string
}

export default function AdvancedStatsTab({ data, tab, playerName }: Props) {
  const { colors, isArcade } = useTheme()
  const styles = useMemo(() => getThemedUI(colors, isArcade), [colors, isArcade])

  if (tab === 'analyse') return <AnalyseTab data={data} colors={colors} styles={styles} playerName={playerName} />
  if (tab === 'erfolge') return <ErfolgeTab data={data} colors={colors} styles={styles} />
  if (tab === 'training') return <TrainingTab data={data} colors={colors} styles={styles} />
  return null
}

// ============================================================================
// ANALYSE TAB
// ============================================================================

function AnalyseTab({ data, colors, styles, playerName }: { data: SQLStatsData; colors: any; styles: any; playerName: string }) {
  const dashboard = data.crossGameDashboard

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Cross-Game Dashboard */}
      {dashboard && (
        <Section title="Gesamtbild" colors={colors}>
          <StatGrid>
            <StatCell label="Matches gesamt" value={dashboard.totalMatchesAllModes} colors={colors} />
            <StatCell label="Siege gesamt" value={dashboard.totalWinsAllModes} colors={colors} />
            <StatCell label="Winrate (Multi)" value={`${dashboard.overallWinRateMultiOnly}%`} colors={colors} highlight={dashboard.overallWinRateMultiOnly >= 50} />
            <StatCell label="Lieblings-Modus" value={dashboard.favoriteModeLabel ?? '-'} colors={colors} />
          </StatGrid>

          {/* Spieltage-Streak */}
          <StatGrid>
            <StatCell label="Aktive Tage" value={dashboard.playingStreak.totalActiveDays} colors={colors} />
            <StatCell label="Aktuelle Serie" value={`${dashboard.playingStreak.currentDays} Tage`} colors={colors} />
            <StatCell label="Längste Serie" value={`${dashboard.playingStreak.longestDays} Tage`} colors={colors} />
          </StatGrid>

          {/* Spielmodus-Verteilung */}
          {dashboard.gameModeDistribution.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 12, color: colors.fgDim, marginBottom: 4 }}>Spielmodus-Verteilung</div>
              {dashboard.gameModeDistribution.map(d => (
                <div key={d.mode} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <div style={{ flex: 1, fontSize: 13, color: colors.fg }}>{d.label}</div>
                  <div style={{ width: 120, height: 8, background: colors.bgDim, borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ width: `${d.percentage}%`, height: '100%', background: colors.accent, borderRadius: 4 }} />
                  </div>
                  <div style={{ fontSize: 12, color: colors.fgDim, width: 60, textAlign: 'right' }}>{d.matchCount} ({d.percentage}%)</div>
                </div>
              ))}
            </div>
          )}

          {/* Aktivitäts-Heatmap */}
          {dashboard.activityHeatmap.length > 0 && (
            <ActivityHeatmap days={dashboard.activityHeatmap} colors={colors} />
          )}
        </Section>
      )}

      {/* Performance Under Pressure */}
      {data.special && (data.special.performanceWhenAhead > 0 || data.special.performanceWhenBehind > 0) && (
        <Section title="Performance Under Pressure" colors={colors}>
          <div style={{ fontSize: 12, color: colors.fgDim, marginBottom: 10 }}>
            3-Dart-Average in gewonnenen vs. verlorenen Matches (nur Multiplayer)
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'stretch' }}>
            {/* Winning Average */}
            <div style={{
              flex: 1, padding: '12px 16px', borderRadius: 8,
              background: '#22c55e11', border: '1px solid #22c55e33',
              textAlign: 'center',
            }}>
              <div style={{ fontSize: 11, color: '#22c55e', marginBottom: 4, fontWeight: 600 }}>Bei Sieg</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: '#22c55e' }}>
                {data.special.performanceWhenAhead > 0 ? data.special.performanceWhenAhead.toFixed(1) : '\u2014'}
              </div>
              <div style={{ fontSize: 10, color: colors.fgDim, marginTop: 2 }}>3-Dart-Avg</div>
            </div>
            {/* Losing Average */}
            <div style={{
              flex: 1, padding: '12px 16px', borderRadius: 8,
              background: '#ef444411', border: '1px solid #ef444433',
              textAlign: 'center',
            }}>
              <div style={{ fontSize: 11, color: '#ef4444', marginBottom: 4, fontWeight: 600 }}>Bei Niederlage</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: '#ef4444' }}>
                {data.special.performanceWhenBehind > 0 ? data.special.performanceWhenBehind.toFixed(1) : '\u2014'}
              </div>
              <div style={{ fontSize: 10, color: colors.fgDim, marginTop: 2 }}>3-Dart-Avg</div>
            </div>
          </div>
          {/* Differenz-Anzeige */}
          {data.special.performanceWhenAhead > 0 && data.special.performanceWhenBehind > 0 && (() => {
            const diff = data.special!.performanceWhenAhead - data.special!.performanceWhenBehind
            const pct = data.special!.performanceWhenBehind > 0
              ? Math.round((diff / data.special!.performanceWhenBehind) * 100)
              : 0
            return (
              <div style={{
                marginTop: 10, padding: '8px 12px', borderRadius: 6,
                background: colors.bgDim, textAlign: 'center', fontSize: 12,
              }}>
                <span style={{ color: colors.fgDim }}>Differenz: </span>
                <span style={{
                  fontWeight: 600,
                  color: Math.abs(diff) < 2 ? colors.fgDim : diff > 0 ? '#22c55e' : '#ef4444',
                }}>
                  {diff > 0 ? '+' : ''}{diff.toFixed(1)} ({pct > 0 ? '+' : ''}{pct}%)
                </span>
                {Math.abs(diff) >= 5 && (
                  <div style={{ marginTop: 4, fontSize: 11, color: colors.fgDim }}>
                    {diff > 0
                      ? 'Du spielst deutlich besser wenn du gewinnst - bleib fokussiert unter Druck!'
                      : 'Du spielst unter Druck sogar besser - echte Wettkampf-Mentalitaet!'}
                  </div>
                )}
              </div>
            )
          })()}
        </Section>
      )}

      {/* Formkurve */}
      {data.formCurve.length > 0 && (
        <Section title="Formkurve (letzte 20 X01 Matches)" colors={colors}>
          {/* LineChart: 3-Dart-Average Trend */}
          {data.formCurve.length >= 2 && (
            <div style={{ marginBottom: 12, overflowX: 'auto' }}>
              <LineChart
                data={data.formCurve.map((f, i) => ({
                  label: `#${i + 1}`,
                  value: f.threeDartAvg,
                }))}
                height={160}
                width={Math.max(300, data.formCurve.length * 40)}
                color={colors.accent}
                showPoints={data.formCurve.length <= 20}
                showLabels
                showGrid
                valueFormatter={(v) => v.toFixed(1)}
              />
            </div>
          )}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {data.formCurve.map((f, i) => (
              <div key={i} style={{
                padding: '4px 8px', borderRadius: 6, fontSize: 12,
                background: f.won ? '#22c55e22' : '#ef444422',
                color: f.won ? '#22c55e' : '#ef4444',
                border: `1px solid ${f.won ? '#22c55e44' : '#ef444444'}`,
              }}>
                {Math.round(f.threeDartAvg)}
              </div>
            ))}
          </div>
          {data.warmupEffect && data.warmupEffect.sessionCount >= 3 && (
            <div style={{ marginTop: 8, fontSize: 12, color: colors.fgDim }}>
              <div>
                Warmup-Effekt (X01): 1. Match Avg {data.warmupEffect.firstMatchAvg}, spätere {data.warmupEffect.laterMatchesAvg}
                {data.warmupEffect.difference > 0 ? ` (+${data.warmupEffect.difference})` : ` (${data.warmupEffect.difference})`}
              </div>
              {data.warmupEffect.modeEffects && data.warmupEffect.modeEffects.filter(m => m.mode !== 'x01').map(me => (
                <div key={me.mode} style={{ marginTop: 2 }}>
                  {me.label} ({me.metric}): {me.firstAvg.toFixed(1)} → {me.laterAvg.toFixed(1)}
                  {me.diff > 0 ? ` (+${me.diff.toFixed(1)})` : ` (${me.diff.toFixed(1)})`}
                </div>
              ))}
            </div>
          )}
        </Section>
      )}

      {/* Segment-Analyse */}
      {data.doubleRates.length > 0 && (
        <Section title="Doppel-Trefferquote (X01)" colors={colors}>
          {/* Horizontales Balkendiagramm - sortiert nach Quote */}
          <div style={{ marginBottom: 12 }}>
            <BarChart
              data={[...data.doubleRates]
                .sort((a, b) => b.hitRate - a.hitRate)
                .slice(0, 20)
                .map(d => ({
                  label: d.field,
                  value: d.hitRate,
                  color: d.hitRate >= 30 ? '#22c55e' : d.hitRate >= 15 ? '#f59e0b' : '#ef4444',
                }))}
              maxValue={100}
              height={20}
              gap={4}
              formatValue={(v) => `${v}%`}
            />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: 4 }}>
            {data.doubleRates.slice(0, 20).map(d => (
              <div key={d.field} style={{
                padding: '6px 8px', borderRadius: 6, fontSize: 12,
                background: colors.bgDim, textAlign: 'center',
              }}>
                <div style={{ fontWeight: 600, color: colors.fg }}>{d.field}</div>
                <div style={{ color: d.hitRate >= 30 ? '#22c55e' : d.hitRate >= 15 ? colors.fgDim : '#ef4444' }}>
                  {d.hitRate}% <span style={{ fontSize: 10 }}>({d.hits}/{d.attempts})</span>
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {data.trebleRates.length > 0 && (
        <Section title="Triple-Trefferquote (X01)" colors={colors}>
          {/* Horizontales Balkendiagramm - sortiert nach Quote */}
          <div style={{ marginBottom: 12 }}>
            <BarChart
              data={[...data.trebleRates]
                .sort((a, b) => b.hitRate - a.hitRate)
                .slice(0, 20)
                .map(d => ({
                  label: d.field,
                  value: d.hitRate,
                  color: d.hitRate >= 30 ? '#22c55e' : d.hitRate >= 15 ? '#f59e0b' : '#ef4444',
                }))}
              maxValue={100}
              height={20}
              gap={4}
              formatValue={(v) => `${v}%`}
            />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: 4 }}>
            {data.trebleRates.slice(0, 20).map(d => (
              <div key={d.field} style={{
                padding: '6px 8px', borderRadius: 6, fontSize: 12,
                background: colors.bgDim, textAlign: 'center',
              }}>
                <div style={{ fontWeight: 600, color: colors.fg }}>{d.field}</div>
                <div style={{ color: d.hitRate >= 30 ? '#22c55e' : d.hitRate >= 15 ? colors.fgDim : '#ef4444' }}>
                  {d.hitRate}% <span style={{ fontSize: 10 }}>({d.hits}/{d.attempts})</span>
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Segment-Genauigkeit */}
      {data.segmentAccuracy.length > 0 && (
        <Section title="Segment-Genauigkeit (X01)" colors={colors}>
          <div style={{ marginBottom: 12 }}>
            <BarChart
              data={[...data.segmentAccuracy]
                .sort((a, b) => b.hitRate - a.hitRate)
                .map(s => ({
                  label: String(s.field),
                  value: s.hitRate,
                  color: s.hitRate >= 50 ? '#22c55e' : s.hitRate >= 30 ? '#f59e0b' : '#ef4444',
                }))}
              maxValue={100}
              height={20}
              gap={4}
              formatValue={(v) => `${v}%`}
            />
          </div>
        </Section>
      )}

      {/* Checkout nach Restpunkten */}
      {data.checkoutByRemaining.length > 0 && (
        <Section title="Checkout-Quote nach Restpunkten" colors={colors}>
          {/* LineChart: Checkout-Quote nach Restpunkten */}
          {data.checkoutByRemaining.length >= 2 && (
            <div style={{ marginBottom: 12, overflowX: 'auto' }}>
              <LineChart
                data={[...data.checkoutByRemaining]
                  .sort((a, b) => a.remaining - b.remaining)
                  .map(c => ({
                    label: `${c.remaining}`,
                    value: c.successRate,
                  }))}
                height={160}
                width={Math.max(300, data.checkoutByRemaining.length * 35)}
                color="#10b981"
                showPoints={data.checkoutByRemaining.length <= 30}
                showLabels
                showGrid
                valueFormatter={(v) => `${v.toFixed(0)}%`}
              />
            </div>
          )}
          <div style={{ maxHeight: 300, overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${colors.border}` }}>
                  <th style={{ textAlign: 'left', padding: '4px 8px', color: colors.fgDim }}>Rest</th>
                  <th style={{ textAlign: 'right', padding: '4px 8px', color: colors.fgDim }}>Versuche</th>
                  <th style={{ textAlign: 'right', padding: '4px 8px', color: colors.fgDim }}>Erfolge</th>
                  <th style={{ textAlign: 'right', padding: '4px 8px', color: colors.fgDim }}>Quote</th>
                </tr>
              </thead>
              <tbody>
                {data.checkoutByRemaining.map(c => (
                  <tr key={c.remaining} style={{ borderBottom: `1px solid ${colors.border}22` }}>
                    <td style={{ padding: '4px 8px', color: colors.fg, fontWeight: 600 }}>{c.remaining}</td>
                    <td style={{ textAlign: 'right', padding: '4px 8px', color: colors.fgDim }}>{c.attempts}</td>
                    <td style={{ textAlign: 'right', padding: '4px 8px', color: colors.fgDim }}>{c.successes}</td>
                    <td style={{ textAlign: 'right', padding: '4px 8px', color: c.successRate >= 30 ? '#22c55e' : colors.fg }}>{c.successRate}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {/* Cricket Field MPR */}
      {data.cricketFieldMPR.length > 0 && (
        <Section title="Cricket: Marks pro Feld" colors={colors}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))', gap: 4 }}>
            {data.cricketFieldMPR.map(f => (
              <div key={f.field} style={{
                padding: '6px 8px', borderRadius: 6, fontSize: 12,
                background: colors.bgDim, textAlign: 'center',
              }}>
                <div style={{ fontWeight: 600, color: colors.fg }}>{f.field}</div>
                <div style={{ color: colors.fgDim }}>{f.marks} Marks</div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Bob's 27 Progression */}
      {data.bobs27Progression.length > 0 && (
        <Section title="Bob's 27: Score-Progression" colors={colors}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {data.bobs27Progression.map((p, i) => (
              <div key={i} style={{
                padding: '4px 8px', borderRadius: 6, fontSize: 12,
                background: p.personalBest ? '#f59e0b22' : colors.bgDim,
                border: p.personalBest ? '1px solid #f59e0b44' : 'none',
                color: p.completed ? colors.fg : '#ef4444',
              }}>
                {p.finalScore}
                {p.personalBest && <span style={{ color: '#f59e0b', marginLeft: 2 }}>*</span>}
              </div>
            ))}
          </div>
          <div style={{ fontSize: 11, color: colors.fgDim, marginTop: 4 }}>* = neuer Rekord zum Zeitpunkt</div>
        </Section>
      )}

      {/* Bob's 27 Doppel-Schwächen */}
      {data.bobs27DoubleWeakness.length > 0 && (
        <Section title="Bob's 27: Doppel-Trefferquote" colors={colors}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))', gap: 4 }}>
            {data.bobs27DoubleWeakness.map(d => (
              <div key={d.field} style={{
                padding: '6px 8px', borderRadius: 6, fontSize: 12,
                background: colors.bgDim, textAlign: 'center',
              }}>
                <div style={{ fontWeight: 600, color: colors.fg }}>{d.field}</div>
                <div style={{ color: d.hitRate >= 40 ? '#22c55e' : d.hitRate >= 20 ? colors.fgDim : '#ef4444' }}>
                  {d.hitRate}%
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Cross-Game H2H */}
      {data.crossGameH2H.length > 0 && (
        <Section title="Gegner-Bilanz (alle Modi)" colors={colors}>
          {data.crossGameH2H.map(h => (
            <div key={h.opponentId} style={{
              padding: '8px 12px', borderRadius: 8, background: colors.bgDim, marginBottom: 6,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontWeight: 600, color: colors.fg }}>{h.opponentName}</div>
                <div style={{
                  color: h.winRate >= 50 ? '#22c55e' : '#ef4444',
                  fontWeight: 600, fontSize: 14,
                }}>{h.wins}:{h.losses}</div>
              </div>
              <div style={{ fontSize: 11, color: colors.fgDim, marginTop: 2 }}>
                {h.totalMatches} Matches | Winrate: {h.winRate}% | Modi: {h.modes.map(m => m.label).join(', ')}
              </div>
            </div>
          ))}
        </Section>
      )}

      {/* Zeit-Insights */}
      {data.timeInsights && (
        <Section title="Zeit-Analyse" colors={colors}>
          <StatGrid>
            {data.timeInsights.avgMatchDurationMinutes > 0 && (
              <StatCell label="Avg. Spieldauer" value={`${data.timeInsights.avgMatchDurationMinutes} min`} colors={colors} />
            )}
            {data.timeInsights.bestHour !== null && (
              <StatCell label="Beste Uhrzeit" value={`${data.timeInsights.bestHour}:00`} colors={colors} />
            )}
            {data.timeInsights.bestHourWinRate > 0 && (
              <StatCell label="Winrate um die Zeit" value={`${data.timeInsights.bestHourWinRate}%`} colors={colors} />
            )}
          </StatGrid>
          {data.timeInsights.hourlyPerformance.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 12, color: colors.fgDim, marginBottom: 4 }}>Winrate nach Uhrzeit</div>
              <div style={{ display: 'flex', gap: 2, alignItems: 'flex-end', height: 60 }}>
                {data.timeInsights.hourlyPerformance.map(h => (
                  <div key={h.hour} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <div style={{
                      width: '100%', maxWidth: 20,
                      height: Math.max(4, h.winRate * 0.6),
                      background: h.matchCount >= 3
                        ? (h.winRate >= 50 ? '#22c55e' : '#ef4444')
                        : colors.bgDim,
                      borderRadius: 2,
                    }} />
                    <div style={{ fontSize: 9, color: colors.fgDim, marginTop: 2 }}>{h.hour}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Section>
      )}

      {data.crossGameDashboard === null && data.formCurve.length === 0 && (
        <div style={{ padding: 40, textAlign: 'center', color: colors.fgDim }}>
          Noch keine Daten vorhanden. Spiele ein paar Matches!
        </div>
      )}
    </div>
  )
}

// ============================================================================
// ERFOLGE TAB
// ============================================================================

function ErfolgeTab({ data, colors, styles }: { data: SQLStatsData; colors: any; styles: any }) {
  const achievements = data.fullAchievements
  const unlocked = achievements.filter(a => a.unlocked)
  const locked = achievements.filter(a => !a.unlocked)

  const categoryLabels: Record<string, string> = {
    milestone: 'Meilensteine',
    rare: 'Seltene Aufnahmen',
    skill: 'Können',
    dedication: 'Hingabe',
  }

  const groupByCategory = (list: typeof achievements) => {
    const groups: Record<string, typeof achievements> = {}
    for (const a of list) {
      const cat = a.category
      if (!groups[cat]) groups[cat] = []
      groups[cat].push(a)
    }
    return groups
  }

  const unlockedGroups = groupByCategory(unlocked)
  const lockedGroups = groupByCategory(locked)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Summary */}
      <div style={{ textAlign: 'center', padding: '16px 0' }}>
        <div style={{ fontSize: 32, fontWeight: 700, color: colors.accent }}>{unlocked.length}</div>
        <div style={{ fontSize: 13, color: colors.fgDim }}>von {achievements.length} Erfolgen freigeschaltet</div>
        {achievements.length > 0 && (
          <div style={{
            marginTop: 8, height: 8, background: colors.bgDim, borderRadius: 4, overflow: 'hidden',
          }}>
            <div style={{
              width: `${(unlocked.length / achievements.length) * 100}%`,
              height: '100%', background: colors.accent, borderRadius: 4,
            }} />
          </div>
        )}
      </div>

      {/* Freigeschaltete Erfolge */}
      {Object.entries(unlockedGroups).map(([cat, items]) => (
        <Section key={cat} title={categoryLabels[cat] || cat} colors={colors}>
          {items.map(a => (
            <AchievementCard key={a.id} achievement={a} colors={colors} />
          ))}
        </Section>
      ))}

      {/* Noch nicht freigeschaltet */}
      {locked.length > 0 && (
        <Section title="Noch offen" colors={colors}>
          {locked.slice(0, 10).map(a => (
            <AchievementCard key={a.id} achievement={a} colors={colors} locked />
          ))}
          {locked.length > 10 && (
            <div style={{ fontSize: 12, color: colors.fgDim, textAlign: 'center', marginTop: 8 }}>
              ... und {locked.length - 10} weitere
            </div>
          )}
        </Section>
      )}

      {achievements.length === 0 && (
        <div style={{ padding: 40, textAlign: 'center', color: colors.fgDim }}>
          Noch keine Daten vorhanden.
        </div>
      )}
    </div>
  )
}

function AchievementCard({ achievement: a, colors, locked }: {
  achievement: { id: string; title: string; description: string; unlocked: boolean; value?: number; target?: number; progress?: number }
  colors: any; locked?: boolean
}) {
  return (
    <div style={{
      padding: '8px 12px', borderRadius: 8, marginBottom: 4,
      background: locked ? `${colors.bgDim}88` : colors.bgDim,
      opacity: locked ? 0.6 : 1,
      display: 'flex', alignItems: 'center', gap: 10,
    }}>
      <div style={{
        width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: a.unlocked ? colors.accent + '33' : colors.bgDim,
        fontSize: 16,
      }}>
        {a.unlocked ? '\u2713' : '\u25CB'}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, fontSize: 13, color: colors.fg }}>{a.title}</div>
        <div style={{ fontSize: 11, color: colors.fgDim }}>{a.description}</div>
        {a.progress !== undefined && a.progress < 1 && a.target && (
          <div style={{ marginTop: 4 }}>
            <div style={{ height: 4, background: colors.bgDim, borderRadius: 2, overflow: 'hidden' }}>
              <div style={{ width: `${a.progress * 100}%`, height: '100%', background: colors.accent, borderRadius: 2 }} />
            </div>
            <div style={{ fontSize: 10, color: colors.fgDim, marginTop: 2 }}>{a.value ?? 0} / {a.target}</div>
          </div>
        )}
      </div>
    </div>
  )
}

// ============================================================================
// TRAINING TAB
// ============================================================================

function TrainingTab({ data, colors, styles }: { data: SQLStatsData; colors: any; styles: any }) {
  const recs = data.trainingRecommendations

  const prioColors = {
    high: '#ef4444',
    medium: '#f59e0b',
    low: '#3b82f6',
  }
  const prioLabels = {
    high: 'Hoch',
    medium: 'Mittel',
    low: 'Niedrig',
  }
  const categoryIcons: Record<string, string> = {
    doubles: 'D',
    trebles: 'T',
    checkout: 'CO',
    consistency: '\u223C',
    endurance: '\u23F1',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {recs.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: colors.fgDim }}>
          {data.crossGameDashboard && data.crossGameDashboard.totalMatchesAllModes >= 5
            ? 'Keine Trainingsempfehlungen - weiter so!'
            : 'Spiele mindestens 5 Matches um Trainingsempfehlungen zu erhalten.'}
        </div>
      ) : (
        <>
          <div style={{ fontSize: 12, color: colors.fgDim, textAlign: 'center' }}>
            {recs.length} Empfehlung{recs.length !== 1 ? 'en' : ''} basierend auf deinen Spieldaten
          </div>
          {recs.map(r => (
            <div key={r.id} style={{
              padding: '12px 16px', borderRadius: 10, background: colors.bgDim,
              borderLeft: `4px solid ${prioColors[r.priority]}`,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    width: 24, height: 24, borderRadius: '50%',
                    background: prioColors[r.priority] + '22', color: prioColors[r.priority],
                    fontSize: 10, fontWeight: 700,
                  }}>
                    {categoryIcons[r.category] || '?'}
                  </span>
                  <span style={{ fontWeight: 600, fontSize: 14, color: colors.fg }}>{r.title}</span>
                </div>
                <span style={{
                  fontSize: 10, padding: '2px 6px', borderRadius: 4,
                  background: prioColors[r.priority] + '22', color: prioColors[r.priority],
                }}>
                  {prioLabels[r.priority]}
                </span>
              </div>
              <div style={{ fontSize: 12, color: colors.fgDim, marginBottom: 6 }}>{r.description}</div>
              {r.drill && (
                <div style={{
                  fontSize: 12, padding: '6px 10px', borderRadius: 6,
                  background: colors.accent + '11', color: colors.accent,
                  border: `1px solid ${colors.accent}22`,
                }}>
                  Drill: {r.drill}
                </div>
              )}
            </div>
          ))}
        </>
      )}
    </div>
  )
}

// ============================================================================
// Shared Components
// ============================================================================

function Section({ title, children, colors }: { title: string; children: React.ReactNode; colors: any }) {
  return (
    <div style={{ background: colors.bg, borderRadius: 10, padding: '12px 16px' }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: colors.fg, marginBottom: 8 }}>{title}</div>
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

function StatCell({ label, value, colors, highlight }: { label: string; value: string | number; colors: any; highlight?: boolean }) {
  return (
    <div style={{ textAlign: 'center', padding: '8px 4px' }}>
      <div style={{ fontSize: 20, fontWeight: 700, color: highlight ? '#22c55e' : colors.fg }}>{value}</div>
      <div style={{ fontSize: 11, color: colors.fgDim }}>{label}</div>
    </div>
  )
}

function ActivityHeatmap({ days, colors }: { days: { date: string; matchCount: number }[]; colors: any }) {
  // Letzte 52 Wochen (364 Tage) als Grid
  const today = new Date()
  const startDate = new Date(today)
  startDate.setDate(startDate.getDate() - 363) // 364 Tage zurück

  const dayMap = new Map(days.map(d => [d.date, d.matchCount]))
  const maxCount = Math.max(1, ...days.map(d => d.matchCount))

  const weeks: { date: Date; count: number }[][] = []
  let currentWeek: { date: Date; count: number }[] = []
  const d = new Date(startDate)

  // Erste Woche auffüllen
  const firstDay = d.getDay()
  for (let i = 0; i < firstDay; i++) {
    currentWeek.push({ date: new Date(0), count: -1 }) // placeholder
  }

  while (d <= today) {
    const dateStr = d.toISOString().split('T')[0]
    currentWeek.push({ date: new Date(d), count: dayMap.get(dateStr) ?? 0 })
    if (d.getDay() === 6) {
      weeks.push(currentWeek)
      currentWeek = []
    }
    d.setDate(d.getDate() + 1)
  }
  if (currentWeek.length > 0) weeks.push(currentWeek)

  const getColor = (count: number) => {
    if (count < 0) return 'transparent'
    if (count === 0) return colors.bgDim
    const intensity = Math.min(1, count / maxCount)
    if (intensity <= 0.25) return '#22c55e44'
    if (intensity <= 0.5) return '#22c55e77'
    if (intensity <= 0.75) return '#22c55eaa'
    return '#22c55e'
  }

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ fontSize: 12, color: colors.fgDim, marginBottom: 4 }}>Aktivität (letzte 52 Wochen)</div>
      <div style={{ display: 'flex', gap: 2, overflowX: 'auto' }}>
        {weeks.map((week, wi) => (
          <div key={wi} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {week.map((day, di) => (
              <div key={di} style={{
                width: 10, height: 10, borderRadius: 2,
                background: getColor(day.count),
              }} title={day.count >= 0 ? `${day.date.toLocaleDateString('de')}: ${day.count} Match${day.count !== 1 ? 'es' : ''}` : ''} />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
