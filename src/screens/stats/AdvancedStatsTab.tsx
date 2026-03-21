// src/screens/stats/AdvancedStatsTab.tsx
// Erweiterte Statistiken: Analyse, Achievements, Training

import React, { useMemo, useState } from 'react'
import { useTheme } from '../../ThemeProvider'
import { getThemedUI } from '../../ui'
import type { SQLStatsData } from '../../hooks/useSQLStats'
import DartboardHeatmap from '../../components/DartboardHeatmap'

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

  const todaySession = data.todaySession
  const winStreaks = data.winStreaks

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Session Stats: Heute gespielt */}
      {todaySession && todaySession.totalMatchesToday > 0 && (
        <div style={{
          background: `linear-gradient(135deg, ${colors.accent}15, ${colors.accent}05, transparent)`,
          borderRadius: 12, padding: '14px 16px',
          border: `1px solid ${colors.accent}30`,
        }}>
          <div style={{
            fontSize: 14, fontWeight: 700, color: colors.accent, marginBottom: 10,
            textTransform: 'uppercase', letterSpacing: '0.04em',
          }}>Heute gespielt</div>
          <StatGrid>
            <StatCell label="Matches" value={todaySession.totalMatchesToday} colors={colors} />
            <StatCell label="Siege" value={todaySession.winsToday} colors={colors} highlight={todaySession.winsToday > 0} />
            {todaySession.bestThreeDartAvgToday != null && (
              <StatCell label="Bester Avg" value={todaySession.bestThreeDartAvgToday.toFixed(1)} colors={colors} />
            )}
            {todaySession.bestCheckoutToday != null && (
              <StatCell label="Bester Checkout" value={todaySession.bestCheckoutToday} colors={colors} />
            )}
            {todaySession.totalDartsThrownToday > 0 && (
              <StatCell label="Darts geworfen" value={todaySession.totalDartsThrownToday} colors={colors} />
            )}
          </StatGrid>
        </div>
      )}

      {/* Cross-Game Dashboard */}
      {dashboard && (
        <Section title="Gesamtbild" colors={colors}>
          <StatGrid>
            <StatCell label="Matches gesamt" value={dashboard.totalMatchesAllModes} colors={colors} />
            <StatCell label="Siege gesamt" value={dashboard.totalWinsAllModes} colors={colors} />
            <StatCell label="Winrate (Multi)" value={`${dashboard.overallWinRateMultiOnly}%`} colors={colors} highlight={dashboard.overallWinRateMultiOnly >= 50} />
            <StatCell label="Lieblings-Modus" value={dashboard.favoriteModeLabel ?? '-'} colors={colors} />
          </StatGrid>

          {/* Win/Loss Streaks */}
          {winStreaks && (winStreaks.currentWinStreak > 0 || winStreaks.longestWinStreak > 0 || winStreaks.currentLossStreak > 0) && (
            <StatGrid>
              <StatCell label="Aktuelle Siegesserie" value={winStreaks.currentWinStreak} colors={colors} highlight={winStreaks.currentWinStreak >= 3} />
              <StatCell label="Laengste Siegesserie" value={winStreaks.longestWinStreak} colors={colors} />
              <StatCell label="Aktuelle Niederlagen" value={winStreaks.currentLossStreak} colors={colors} />
            </StatGrid>
          )}

          {/* Spieltage-Streak */}
          <StatGrid>
            <StatCell label="Aktive Tage" value={dashboard.playingStreak.totalActiveDays} colors={colors} />
            <StatCell label="Aktuelle Serie" value={`${dashboard.playingStreak.currentDays} Tage`} colors={colors} />
            <StatCell label="Längste Serie" value={`${dashboard.playingStreak.longestDays} Tage`} colors={colors} />
          </StatGrid>

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

      {/* Dartboard Heatmap — Feldverteilung */}
      {data.fieldAccuracy.length > 0 && (
        <Section title="Feldverteilung (X01)" colors={colors}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ flex: '0 0 auto' }}>
              <DartboardHeatmap
                segments={data.fieldAccuracy
                  .filter((f): f is typeof f & { field: number } => typeof f.field === 'number')
                  .map(f => ({ field: f.field, hits: f.totalAttempts }))}
                bullHits={data.fieldAccuracy.find(f => f.field === 'BULL')?.totalAttempts ?? 0}
                bullDoubleHits={0}
                size={180}
                colors={{ bg: colors.bgDim, fg: colors.fgDim }}
              />
            </div>
            <div style={{ flex: 1, minWidth: 140 }}>
              <div style={{ fontSize: 12, color: colors.fgDim, marginBottom: 8 }}>Top-Felder</div>
              {data.fieldAccuracy.slice(0, 5).map(f => (
                <div key={String(f.field)} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '4px 0', borderBottom: `1px solid ${colors.bgDim}`,
                }}>
                  <span style={{ fontWeight: 600, color: colors.fg, fontSize: 14 }}>
                    {f.field === 'BULL' ? 'Bull' : f.field}
                  </span>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ color: colors.fg, fontSize: 13 }}>{f.distributionPct}%</span>
                    <span style={{ color: colors.fgDim, fontSize: 11, marginLeft: 6 }}>({f.totalAttempts}x)</span>
                  </div>
                </div>
              ))}
              {data.fieldAccuracy.length > 5 && (
                <div style={{ fontSize: 11, color: colors.fgDim, marginTop: 6 }}>
                  + {data.fieldAccuracy.length - 5} weitere Felder
                </div>
              )}
            </div>
          </div>
        </Section>
      )}

      {/* Doppel-Trefferquote Heatmap */}
      {data.doubleSuccessPerField.length > 0 && (
        <Section title="Doppel-Trefferquote (X01)" colors={colors}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ flex: '0 0 auto' }}>
              <DartboardHeatmap
                segments={data.doubleSuccessPerField
                  .filter((f): f is typeof f & { field: number } => typeof f.field === 'number')
                  .map(f => ({ field: f.field, hits: f.hitRate }))}
                bullHits={data.doubleSuccessPerField.find(f => f.field === 'BULL')?.hitRate ?? 0}
                bullDoubleHits={0}
                size={180}
                colors={{ bg: colors.bgDim, fg: colors.fgDim }}
              />
            </div>
            <div style={{ flex: 1, minWidth: 140 }}>
              <div style={{ fontSize: 12, color: colors.fgDim, marginBottom: 8 }}>Top-Doppelfelder</div>
              {data.doubleSuccessPerField
                .filter(f => f.attempts >= 3)
                .sort((a, b) => b.hitRate - a.hitRate)
                .slice(0, 5)
                .map(f => (
                <div key={String(f.field)} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '4px 0', borderBottom: `1px solid ${colors.bgDim}`,
                }}>
                  <span style={{ fontWeight: 600, color: colors.fg, fontSize: 14 }}>
                    D{f.field === 'BULL' ? 'Bull' : f.field}
                  </span>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{
                      color: f.hitRate >= 40 ? '#22c55e' : f.hitRate >= 20 ? colors.fg : '#ef4444',
                      fontSize: 13, fontWeight: 600,
                    }}>{f.hitRate}%</span>
                    <span style={{ color: colors.fgDim, fontSize: 11, marginLeft: 6 }}>({f.hits}/{f.attempts})</span>
                  </div>
                </div>
              ))}
            </div>
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

const CATEGORY_CONFIG: Record<string, { label: string; icon: string; color: string }> = {
  milestone: { label: 'Meilensteine', icon: '\u2605', color: '#3b82f6' },
  rare: { label: 'Seltene Aufnahmen', icon: '\u25C6', color: '#a855f7' },
  skill: { label: 'Können', icon: '\u25CF', color: '#22c55e' },
  cricket: { label: 'Cricket', icon: '\u25B2', color: '#f59e0b' },
  vielseitigkeit: { label: 'Vielseitigkeit', icon: '\u2726', color: '#06b6d4' },
}

const CATEGORY_ORDER = ['milestone', 'rare', 'skill', 'cricket', 'vielseitigkeit']

function ErfolgeTab({ data, colors, styles }: { data: SQLStatsData; colors: any; styles: any }) {
  const achievements = data.fullAchievements
  const unlocked = achievements.filter(a => a.unlocked)
  const [selectedCat, setSelectedCat] = useState<string | null>(null)

  const groupByCategory = (list: typeof achievements) => {
    const groups: Record<string, typeof achievements> = {}
    for (const a of list) {
      if (!groups[a.category]) groups[a.category] = []
      groups[a.category].push(a)
    }
    return groups
  }

  const allGroups = groupByCategory(achievements)

  // Gefilterte Achievements basierend auf Kategorie-Auswahl
  const filtered = selectedCat ? (allGroups[selectedCat] ?? []) : achievements
  const filteredUnlocked = filtered.filter(a => a.unlocked)
  const filteredLocked = filtered.filter(a => !a.unlocked)

  const pct = achievements.length > 0 ? Math.round((unlocked.length / achievements.length) * 100) : 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 600, margin: '0 auto', width: '100%' }}>
      <style>{`
        @keyframes erfolge-glow { 0%,100% { box-shadow: 0 0 8px ${colors.accent}30; } 50% { box-shadow: 0 0 20px ${colors.accent}50; } }
        @keyframes erfolge-progress { from { width: 0%; } }
      `}</style>

      {/* Hero-Bereich mit Gesamtfortschritt */}
      <div style={{
        textAlign: 'center', padding: '24px 16px',
        background: `linear-gradient(135deg, ${colors.accent}18, ${colors.accent}06, transparent)`,
        borderRadius: 16, border: `1px solid ${colors.accent}30`,
        animation: 'erfolge-glow 4s ease-in-out infinite',
      }}>
        <div style={{
          fontSize: 48, fontWeight: 900, lineHeight: 1,
          background: `linear-gradient(135deg, ${colors.accent}, #FFD700)`,
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
        }}>
          {unlocked.length}
        </div>
        <div style={{ fontSize: 14, color: colors.fgDim, marginTop: 6 }}>
          von {achievements.length} Erfolgen freigeschaltet
        </div>
        {achievements.length > 0 && (
          <div style={{ marginTop: 14, position: 'relative' }}>
            <div style={{ height: 14, background: colors.bgDim, borderRadius: 7, overflow: 'hidden' }}>
              <div style={{
                width: `${pct}%`, height: '100%',
                background: `linear-gradient(90deg, ${colors.accent}, #FFD700, #22c55e)`,
                borderRadius: 7, transition: 'width 0.8s ease',
                animation: 'erfolge-progress 1s ease-out',
              }} />
            </div>
            <div style={{ fontSize: 13, fontWeight: 800, color: colors.accent, marginTop: 6 }}>{pct}%</div>
          </div>
        )}
      </div>

      {/* Klickbare Kategorie-Kacheln */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(85px, 1fr))', gap: 6,
      }}>
        {/* "Alle" Button */}
        <button
          onClick={() => setSelectedCat(null)}
          style={{
            textAlign: 'center', padding: '10px 6px', borderRadius: 10,
            background: selectedCat === null ? colors.accent : colors.bgDim,
            color: selectedCat === null ? '#fff' : colors.fg,
            border: selectedCat === null ? `2px solid ${colors.accent}` : `1px solid ${colors.border}`,
            cursor: 'pointer', transition: 'all 0.15s ease',
          }}
        >
          <div style={{ fontSize: 16 }}>{'\u2630'}</div>
          <div style={{ fontSize: 11, fontWeight: 600, marginTop: 2 }}>Alle</div>
          <div style={{ fontSize: 11, opacity: 0.7 }}>{unlocked.length}/{achievements.length}</div>
        </button>

        {CATEGORY_ORDER.filter(cat => allGroups[cat]).map(cat => {
          const cfg = CATEGORY_CONFIG[cat]
          const catAll = allGroups[cat] ?? []
          const catDone = catAll.filter(a => a.unlocked).length
          const isActive = selectedCat === cat
          return (
            <button
              key={cat}
              onClick={() => setSelectedCat(isActive ? null : cat)}
              style={{
                textAlign: 'center', padding: '10px 6px', borderRadius: 10,
                background: isActive ? `${cfg.color}20` : colors.bgDim,
                border: isActive ? `2px solid ${cfg.color}` : `1px solid ${colors.border}`,
                cursor: 'pointer', transition: 'all 0.15s ease',
              }}
            >
              <div style={{ fontSize: 18, color: cfg.color }}>{cfg.icon}</div>
              <div style={{ fontSize: 11, fontWeight: 600, color: isActive ? cfg.color : colors.fg, marginTop: 2 }}>{cfg.label}</div>
              <div style={{ fontSize: 11, color: colors.fgDim }}>{catDone}/{catAll.length}</div>
              <div style={{ marginTop: 4, height: 3, background: `${cfg.color}22`, borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ width: catAll.length > 0 ? `${(catDone / catAll.length) * 100}%` : '0%', height: '100%', background: cfg.color, borderRadius: 2 }} />
              </div>
            </button>
          )
        })}
      </div>

      {/* Freigeschaltete Erfolge */}
      {filteredUnlocked.length > 0 && (
        <Section title={`${filteredUnlocked.length} freigeschaltet`} colors={colors}>
          {filteredUnlocked.map(a => {
            const cfg = CATEGORY_CONFIG[a.category]
            return <AchievementCard key={a.id} achievement={a} colors={colors} catColor={cfg?.color} />
          })}
        </Section>
      )}

      {/* Noch offen */}
      {filteredLocked.length > 0 && (
        <Section title={`${filteredLocked.length} noch offen`} colors={colors}>
          {filteredLocked.map(a => {
            const cfg = CATEGORY_CONFIG[a.category]
            return <AchievementCard key={a.id} achievement={a} colors={colors} locked catColor={cfg?.color} />
          })}
        </Section>
      )}

      {achievements.length === 0 && (
        <div style={{ padding: 40, textAlign: 'center', color: colors.fgDim }}>
          Erfolge werden geladen...
          <br /><small>Falls nichts erscheint, spiele ein paar Matches!</small>
        </div>
      )}
    </div>
  )
}

function AchievementCard({ achievement: a, colors, locked, catColor }: {
  achievement: { id: string; title: string; description: string; unlocked: boolean; value?: number; target?: number; progress?: number }
  colors: any; locked?: boolean; catColor?: string
}) {
  const accentColor = catColor ?? colors.accent
  const progressHint = a.progress !== undefined && a.progress >= 0.8 ? 'Fast geschafft!' :
    a.progress !== undefined && a.progress >= 0.5 ? 'Auf gutem Weg' : null

  return (
    <div style={{
      padding: '10px 12px', borderRadius: 10, marginBottom: 6,
      background: locked
        ? `${colors.bgDim}88`
        : `linear-gradient(135deg, ${accentColor}12, ${colors.bgDim})`,
      opacity: locked ? 0.6 : 1,
      display: 'flex', alignItems: 'center', gap: 10,
      borderLeft: a.unlocked ? `3px solid ${accentColor}` : '3px solid transparent',
      boxShadow: a.unlocked ? `0 2px 8px ${accentColor}15` : 'none',
      transition: 'all 0.2s ease',
    }}>
      <div style={{
        width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: a.unlocked ? `linear-gradient(135deg, ${accentColor}40, ${accentColor}20)` : colors.bgDim,
        fontSize: 16, color: a.unlocked ? accentColor : colors.fgDim,
        boxShadow: a.unlocked ? `0 0 12px ${accentColor}25` : 'none',
      }}>
        {a.unlocked ? '\u2713' : '\u25CB'}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, fontSize: 13, color: colors.fg }}>{a.title}</div>
        <div style={{ fontSize: 11, color: colors.fgDim }}>{a.description}</div>
        {a.progress !== undefined && a.progress < 1 && a.target && (
          <div style={{ marginTop: 4 }}>
            <div style={{ height: 4, background: `${accentColor}22`, borderRadius: 2, overflow: 'hidden' }}>
              <div style={{ width: `${a.progress * 100}%`, height: '100%', background: accentColor, borderRadius: 2 }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
              <div style={{ fontSize: 10, color: colors.fgDim }}>{a.value ?? 0} / {a.target}</div>
              {progressHint && <div style={{ fontSize: 10, color: accentColor, fontWeight: 600 }}>{progressHint}</div>}
            </div>
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
