// src/screens/StatsProfile.tsx
import React, { useEffect, useMemo, useState } from 'react'
import { getProfiles, getStrMatches, getHighscoreMatches, getCTFMatches, getGlobalX01PlayerStats, type Profile } from '../storage'
import { useTheme } from '../ThemeProvider'
import { computeStrMatchStats, type StrPlayerMatchStat } from '../stats/computeStraeusschenStats'
import { computeCTFMatchStats } from '../stats/computeCTFStats'

// Chart-Komponenten
import { BarChart, GaugeChart, ProgressBar, CheckoutHeatmap } from '../components/charts'
import Accordion from '../components/Accordion'

// SQL Stats Tabs
import SQLStatsTab from './stats/SQLStatsTab'
const PlayerInsightsTab = React.lazy(() => import('./stats/PlayerInsightsTab'))
const AdvancedStatsTab = React.lazy(() => import('./stats/AdvancedStatsTab'))

// SQL Stats Hook
import { useSQLStats, formatDuration } from '../hooks/useSQLStats'

type Tab = 'uebersicht' | 'x01' | 'cricketco' | 'insights' | 'trends' | 'analyse' | 'erfolge'

export default function StatsProfile({
  onOpenMatch,
  onBack,
  initialTab,
}: {
  onOpenMatch?: (matchId: string) => void
  onBack?: () => void
  initialTab?: Tab
}) {
  const [profiles, setProfiles] = useState<Profile[]>(() => getProfiles())
  const [cursor, setCursor] = useState(0)
  const [activeTab, setActiveTab] = useState<Tab>(initialTab ?? 'uebersicht')
  const [x01Variant, setX01Variant] = useState<121 | 301 | 501 | 701 | 901>(501)

  // Theme System
  const { isArcade, colors } = useTheme()

  // SQL Stats laden
  const selected: Profile | undefined = profiles[cursor]
  const sqlStats = useSQLStats(selected?.id, activeTab)

  // X01 Career Stats (für Checkout-Heatmap)
  const x01Career = useMemo(() => {
    if (!selected?.id) return undefined
    return getGlobalX01PlayerStats()[selected.id]
  }, [selected?.id])

  useEffect(() => {
    const list = getProfiles()
    setProfiles(list)
    if (cursor >= list.length) setCursor(0)
  }, [])

  // Styles (theme-aware)
  const s = useMemo(() => ({
    shell: { maxWidth: 960, margin: '0 auto', padding: '16px 12px 40px', background: 'transparent', overflowX: 'hidden' } as React.CSSProperties,

    // Player Navigation
    playerNav: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 16,
      padding: '16px 0',
      marginBottom: 8,
    } as React.CSSProperties,
    navBtn: {
      width: 44,
      height: 44,
      borderRadius: 8,
      border: `1px solid ${colors.border}`,
      background: colors.bgCard,
      color: colors.fg,
      cursor: 'pointer',
      fontSize: 18,
      fontWeight: 600,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      transition: 'background .12s, border-color .12s',
    } as React.CSSProperties,
    navBtnDisabled: {
      opacity: 0.4,
      cursor: 'not-allowed',
    } as React.CSSProperties,
    playerInfo: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 4,
      minWidth: 0,
      flex: 1,
      overflow: 'hidden',
    } as React.CSSProperties,
    colorDot: (color?: string) => ({
      width: 12,
      height: 12,
      borderRadius: 9999,
      background: color || colors.fgDim,
    }) as React.CSSProperties,
    playerName: {
      fontSize: 22,
      fontWeight: 800,
      textAlign: 'center',
      color: colors.fg,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
      maxWidth: '100%',
    } as React.CSSProperties,
    playerMeta: {
      fontSize: 12,
      color: colors.fgDim,
    } as React.CSSProperties,

    // Tabs
    tabBar: {
      display: 'flex',
      gap: 0,
      borderBottom: `2px solid ${colors.border}`,
      marginBottom: 16,
      overflowX: 'auto',
      WebkitOverflowScrolling: 'touch',  // iOS smooth scroll
      scrollbarWidth: 'none',          // Firefox
      msOverflowStyle: 'none',         // IE/Edge
    } as React.CSSProperties,
    tab: (active: boolean) => ({
      padding: '12px 14px',
      fontSize: 13,
      fontWeight: active ? 700 : 500,
      color: active ? colors.fg : colors.fgDim,
      background: 'transparent',
      border: 'none',
      borderBottom: active ? `2px solid ${colors.fg}` : '2px solid transparent',
      marginBottom: -2,
      cursor: 'pointer',
      transition: 'color .12s',
      whiteSpace: 'nowrap',
    }) as React.CSSProperties,

    // Content - wird dynamisch mit Spielerfarbe berechnet
    contentBox: (playerColor?: string) => ({
      background: playerColor
        ? `linear-gradient(135deg, ${playerColor}15 0%, ${colors.bgCard} 50%)`
        : colors.bgCard,
      borderRadius: 8,
      border: `1px solid ${playerColor ? playerColor + '40' : colors.border}`,
      overflow: 'hidden',
    }) as React.CSSProperties,

    // Stats Card
    statsCard: {
      padding: 16,
      borderBottom: `1px solid ${colors.bgMuted}`,
    } as React.CSSProperties,
    statsCardLast: {
      padding: 16,
    } as React.CSSProperties,
    statsCardTitle: {
      fontSize: 14,
      fontWeight: 700,
      color: colors.fgMuted,
      marginBottom: 12,
      textTransform: 'uppercase',
      letterSpacing: '0.05em',
    } as React.CSSProperties,
    statsRow: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '8px 0',
      borderBottom: `1px solid ${isArcade ? colors.bgMuted : '#F9FAFB'}`,
    } as React.CSSProperties,
    statsRowLast: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '8px 0',
    } as React.CSSProperties,
    statsLabel: {
      fontSize: 14,
      color: colors.fgDim,
      minWidth: 0,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
      marginRight: 8,
    } as React.CSSProperties,
    statsValue: {
      fontSize: 14,
      fontWeight: 600,
      color: colors.fg,
      flexShrink: 0,
    } as React.CSSProperties,
    statsValueGood: {
      fontSize: 14,
      fontWeight: 600,
      color: colors.success,
      flexShrink: 0,
    } as React.CSSProperties,
    statsValueBad: {
      fontSize: 14,
      fontWeight: 600,
      color: colors.error,
      flexShrink: 0,
    } as React.CSSProperties,
    statsValueHighlight: {
      fontSize: 16,
      fontWeight: 700,
      color: isArcade ? colors.accent : '#2563EB',
      flexShrink: 0,
    } as React.CSSProperties,

    // No data
    noData: {
      padding: 40,
      textAlign: 'center',
      color: colors.fgDim,
    } as React.CSSProperties,

    // Grid for doubles
    doublesGrid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(5, 1fr)',
      gap: 8,
      marginTop: 8,
    } as React.CSSProperties,
    doubleItem: {
      padding: '8px 4px',
      background: colors.bgMuted,
      borderRadius: 4,
      textAlign: 'center',
      fontSize: 12,
      color: colors.fg,
    } as React.CSSProperties,

    // Trend indicator
    trendUp: { color: colors.success, fontSize: 12 },
    trendDown: { color: colors.error, fontSize: 12 },
    trendStable: { color: colors.fgDim, fontSize: 12 },

    // Last 5 matches
    matchDot: (won: boolean) => ({
      width: 24,
      height: 24,
      borderRadius: '50%',
      background: won ? colors.success : colors.error,
      color: '#fff',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: 12,
      fontWeight: 600,
    }) as React.CSSProperties,
  }), [colors, isArcade])

  const tabs: { key: Tab; label: string }[] = [
    { key: 'uebersicht', label: 'Übersicht' },
    { key: 'x01', label: 'X01' },
    { key: 'cricketco', label: 'Cricket & Co' },
    { key: 'insights', label: 'Spielerprofil' },
    { key: 'trends', label: 'Trends' },
    { key: 'analyse', label: 'Analyse' },
    { key: 'erfolge', label: 'Erfolge' },
  ]

  const prevPlayer = () => {
    setCursor(c => (c - 1 + profiles.length) % profiles.length)
  }

  const nextPlayer = () => {
    setCursor(c => (c + 1) % profiles.length)
  }

  // Keyboard-Navigation: Pfeiltasten für Tabs, Escape/Backspace zum Zurückgehen
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return

      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault()
        const currentIdx = tabs.findIndex(t => t.key === activeTab)
        if (e.key === 'ArrowLeft' && currentIdx > 0) {
          setActiveTab(tabs[currentIdx - 1].key)
        } else if (e.key === 'ArrowRight' && currentIdx < tabs.length - 1) {
          setActiveTab(tabs[currentIdx + 1].key)
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        prevPlayer()
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        nextPlayer()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [activeTab, tabs])

  const formatPct = (v: number | null | undefined) => v != null ? `${v.toFixed(1)}%` : '—'
  const formatNum = (v: number | null | undefined, decimals = 1) => v != null ? v.toFixed(decimals) : '—'

  if (profiles.length === 0) {
    return (
      <div style={s.shell}>
        <div style={s.contentBox()}>
          <div style={s.noData as React.CSSProperties}>
            Keine Spielerprofile vorhanden.
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={s.shell}>
      {/* Header mit Zurück-Button */}
      {onBack && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: colors.fg }}>Spieler-Statistiken</h2>
          <button
            style={{
              height: 36,
              borderRadius: 10,
              border: `1px solid ${colors.border}`,
              background: colors.bgCard,
              cursor: 'pointer',
              fontSize: 14,
              lineHeight: 1.2,
              padding: '6px 10px',
              fontWeight: 600,
              color: colors.fg,
            }}
            onClick={onBack}
          >
            ← Zurück
          </button>
        </div>
      )}

      {/* Spieler-Navigation */}
      <div style={s.playerNav}>
        <button
          style={{
            ...s.navBtn,
            ...(profiles.length <= 1 ? s.navBtnDisabled : {}),
          }}
          disabled={profiles.length <= 1}
          onClick={prevPlayer}
          aria-label="Vorheriger Spieler"
        >
          ←
        </button>

        <div style={s.playerInfo as React.CSSProperties}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={s.colorDot(selected?.color)} />
            <div style={s.playerName as React.CSSProperties}>{selected?.name ?? '—'}</div>
          </div>
          <div style={s.playerMeta}>
            {cursor + 1} von {profiles.length} Spielern
          </div>
        </div>

        <button
          style={{
            ...s.navBtn,
            ...(profiles.length <= 1 ? s.navBtnDisabled : {}),
          }}
          disabled={profiles.length <= 1}
          onClick={nextPlayer}
          aria-label="Nächster Spieler"
        >
          →
        </button>
      </div>

      {/* Tabs */}
      <div style={s.tabBar} className="hide-scrollbar" role="tablist" aria-label="Statistik-Kategorien">
        {tabs.map(tab => (
          <button
            key={tab.key}
            style={s.tab(activeTab === tab.key)}
            onClick={() => setActiveTab(tab.key)}
            role="tab"
            aria-selected={activeTab === tab.key}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab-Inhalt */}
      <div style={s.contentBox(selected?.color)}>
        {/* Loading State */}
        {sqlStats.loading && (
          <div style={{ padding: 40, textAlign: 'center', color: colors.fgDim }}>
            Lade Statistiken...
          </div>
        )}

        {/* Error State */}
        {sqlStats.error && (
          <div style={{ padding: 40, textAlign: 'center', color: colors.error }}>
            Fehler: {sqlStats.error}
          </div>
        )}

        {/* ============ ALLGEMEIN (SQL) ============ */}
        {activeTab === 'uebersicht' && !sqlStats.loading && sqlStats.data.general && (() => {
          const gen = sqlStats.data.general
          const streaks = sqlStats.data.streaks
          const x01WinRate = gen.multiX01Matches > 0 ? Math.round(gen.x01Wins / gen.multiX01Matches * 100) : 0
          const cricketWinRate = gen.multiCricketMatches > 0 ? Math.round(gen.cricketWins / gen.multiCricketMatches * 100) : 0
          const atbWinRate = gen.multiATBMatches > 0 ? Math.round(gen.atbWins / gen.multiATBMatches * 100) : 0

          return (
          <>
            {/* Gesamt (nur Mehrspieler-Matches für Gewinnquote) */}
            <div style={s.statsCard}>
              <div style={s.statsCardTitle as React.CSSProperties}>Gesamt (gegen Gegner)</div>
              <div style={s.statsRow}>
                <span style={s.statsLabel}>Matches gespielt</span>
                <span style={s.statsValueHighlight}>{gen.multiTotalMatches}</span>
              </div>
              <div style={s.statsRow}>
                <span style={s.statsLabel}>Matches gewonnen</span>
                <span style={s.statsValueGood}>{gen.totalWins}</span>
              </div>
              <div style={s.statsRow}>
                <span style={s.statsLabel}>Gewinnquote</span>
                <span style={s.statsValueHighlight}>{formatPct(gen.overallWinRate)}</span>
              </div>
              <div style={s.statsRowLast}>
                <span style={s.statsLabel}>Längste Siegesserie</span>
                <span style={s.statsValue}>{streaks?.longestWinStreak ?? 0} Spiele</span>
              </div>

              {/* Win-Rate Gauge */}
              {gen.multiTotalMatches > 0 && (
                <div style={{ marginTop: 16, display: 'flex', justifyContent: 'center' }}>
                  <GaugeChart
                    value={gen.overallWinRate}
                    label="Gewinnquote"
                    size={140}
                  />
                </div>
              )}
            </div>

            {/* Einzelspiele */}
            {gen.soloTotalMatches > 0 && (
              <div style={s.statsCard}>
                <div style={s.statsCardTitle as React.CSSProperties}>Einzelspiele (Solo)</div>
                <div style={s.statsRow}>
                  <span style={s.statsLabel}>Gesamt</span>
                  <span style={s.statsValue}>{gen.soloTotalMatches}</span>
                </div>
                {gen.soloX01Matches > 0 && (
                  <div style={s.statsRow}>
                    <span style={s.statsLabel}>X01</span>
                    <span style={s.statsValue}>{gen.soloX01Matches}</span>
                  </div>
                )}
                {gen.soloCricketMatches > 0 && (
                  <div style={s.statsRow}>
                    <span style={s.statsLabel}>Cricket</span>
                    <span style={s.statsValue}>{gen.soloCricketMatches}</span>
                  </div>
                )}
                {gen.soloATBMatches > 0 && (
                  <div style={s.statsRow}>
                    <span style={s.statsLabel}>Around the Block</span>
                    <span style={s.statsValue}>{gen.soloATBMatches}</span>
                  </div>
                )}
                <div style={s.statsRowLast}>
                  <span style={{ ...s.statsLabel, fontSize: 12, fontStyle: 'italic' }}>Zählen nicht zur Gewinnquote</span>
                  <span />
                </div>
              </div>
            )}

            {/* X01 */}
            <div style={s.statsCard}>
              <div style={s.statsCardTitle as React.CSSProperties}>X01</div>
              <div style={s.statsRow}>
                <span style={s.statsLabel}>Matches (gegen Gegner)</span>
                <span style={s.statsValue}>{gen.multiX01Matches}</span>
              </div>
              <div style={s.statsRow}>
                <span style={s.statsLabel}>Gewonnen</span>
                <span style={s.statsValueGood}>{gen.x01Wins}</span>
              </div>
              {gen.multiX01Matches > 0 && (
                <div style={{ marginTop: 8 }}>
                  <ProgressBar
                    value={x01WinRate}
                    label="Quote"
                    color="#3b82f6"
                  />
                </div>
              )}
              {gen.soloX01Matches > 0 && (
                <div style={{ ...s.statsRow, borderTop: `1px solid ${colors.bgMuted}`, marginTop: 4 }}>
                  <span style={{ ...s.statsLabel, fontSize: 12 }}>Einzelspiele</span>
                  <span style={{ ...s.statsValue, fontSize: 12 }}>{gen.soloX01Matches}</span>
                </div>
              )}
            </div>

            {/* Cricket */}
            <div style={s.statsCard}>
              <div style={s.statsCardTitle as React.CSSProperties}>Cricket</div>
              <div style={s.statsRow}>
                <span style={s.statsLabel}>Matches (gegen Gegner)</span>
                <span style={s.statsValue}>{gen.multiCricketMatches}</span>
              </div>
              <div style={s.statsRow}>
                <span style={s.statsLabel}>Gewonnen</span>
                <span style={s.statsValueGood}>{gen.cricketWins}</span>
              </div>
              {gen.multiCricketMatches > 0 && (
                <div style={{ marginTop: 8 }}>
                  <ProgressBar
                    value={cricketWinRate}
                    label="Quote"
                    color="#10b981"
                  />
                </div>
              )}
              {gen.soloCricketMatches > 0 && (
                <div style={{ ...s.statsRow, borderTop: `1px solid ${colors.bgMuted}`, marginTop: 4 }}>
                  <span style={{ ...s.statsLabel, fontSize: 12 }}>Einzelspiele</span>
                  <span style={{ ...s.statsValue, fontSize: 12 }}>{gen.soloCricketMatches}</span>
                </div>
              )}
            </div>

            {/* ATB */}
            <div style={s.statsCard}>
              <div style={s.statsCardTitle as React.CSSProperties}>Around the Block</div>
              <div style={s.statsRow}>
                <span style={s.statsLabel}>Matches (gegen Gegner)</span>
                <span style={s.statsValue}>{gen.multiATBMatches}</span>
              </div>
              <div style={s.statsRow}>
                <span style={s.statsLabel}>Gewonnen</span>
                <span style={s.statsValueGood}>{gen.atbWins}</span>
              </div>
              {gen.multiATBMatches > 0 && (
                <div style={{ marginTop: 8 }}>
                  <ProgressBar
                    value={atbWinRate}
                    label="Quote"
                    color="#8b5cf6"
                  />
                </div>
              )}
              {gen.soloATBMatches > 0 && (
                <div style={{ ...s.statsRow, borderTop: `1px solid ${colors.bgMuted}`, marginTop: 4 }}>
                  <span style={{ ...s.statsLabel, fontSize: 12 }}>Einzelspiele</span>
                  <span style={{ ...s.statsValue, fontSize: 12 }}>{gen.soloATBMatches}</span>
                </div>
              )}
            </div>

            {/* CTF (Capture the Field) - aus LocalStorage */}
            {(() => {
              const ctfAll = getCTFMatches().filter(m => m.finished && m.players.some(p => p.playerId === selected.id))
              const ctfMulti = ctfAll.filter(m => m.players.length > 1)
              const ctfSolo = ctfAll.filter(m => m.players.length <= 1)
              const ctfWon = ctfMulti.filter(m => m.winnerId === selected.id).length
              const ctfWinRate = ctfMulti.length > 0 ? Math.round(ctfWon / ctfMulti.length * 100) : 0
              return (
                <div style={s.statsCard}>
                  <div style={s.statsCardTitle as React.CSSProperties}>Capture the Field</div>
                  <div style={s.statsRow}>
                    <span style={s.statsLabel}>Matches (gegen Gegner)</span>
                    <span style={s.statsValue}>{ctfMulti.length}</span>
                  </div>
                  <div style={s.statsRow}>
                    <span style={s.statsLabel}>Gewonnen</span>
                    <span style={s.statsValueGood}>{ctfWon}</span>
                  </div>
                  {ctfMulti.length > 0 && (
                    <div style={{ marginTop: 8 }}>
                      <ProgressBar
                        value={ctfWinRate}
                        label="Quote"
                        color="#f59e0b"
                      />
                    </div>
                  )}
                  {ctfSolo.length > 0 && (
                    <div style={{ ...s.statsRow, borderTop: `1px solid ${colors.bgMuted}`, marginTop: 4 }}>
                      <span style={{ ...s.statsLabel, fontSize: 12 }}>Einzelspiele</span>
                      <span style={{ ...s.statsValue, fontSize: 12 }}>{ctfSolo.length}</span>
                    </div>
                  )}
                </div>
              )
            })()}

            {/* Spielaktivität */}
            <div style={s.statsCard}>
              <div style={s.statsCardTitle as React.CSSProperties}>Spielaktivität</div>
              <div style={s.statsRow}>
                <span style={s.statsLabel}>Geworfene Darts (X01)</span>
                <span style={s.statsValueHighlight}>{gen.totalDartsThrown.toLocaleString('de-DE')}</span>
              </div>
              <div style={s.statsRow}>
                <span style={s.statsLabel}>180er</span>
                <span style={s.statsValueHighlight}>{gen.highest180Count}</span>
              </div>
              <div style={s.statsRow}>
                <span style={s.statsLabel}>Höchstes Checkout</span>
                <span style={s.statsValueHighlight}>{gen.highestCheckout || '—'}</span>
              </div>
              {gen.firstMatchDate && (
                <div style={s.statsRow}>
                  <span style={s.statsLabel}>Erstes Spiel</span>
                  <span style={s.statsValue}>{new Date(gen.firstMatchDate).toLocaleDateString('de-DE')}</span>
                </div>
              )}
              {gen.lastMatchDate && (
                <div style={s.statsRowLast}>
                  <span style={s.statsLabel}>Letztes Spiel</span>
                  <span style={s.statsValue}>{new Date(gen.lastMatchDate).toLocaleDateString('de-DE')}</span>
                </div>
              )}
            </div>

            {/* Streaks */}
            {streaks && (
              <div style={s.statsCard}>
                <div style={s.statsCardTitle as React.CSSProperties}>Serien</div>
                <div style={s.statsRow}>
                  <span style={s.statsLabel}>Aktuelle Serie</span>
                  <span style={streaks.currentWinStreak > 0 ? s.statsValueGood : streaks.currentLoseStreak > 0 ? s.statsValueBad : s.statsValue}>
                    {streaks.currentWinStreak > 0 ? `${streaks.currentWinStreak} Siege` :
                     streaks.currentLoseStreak > 0 ? `${streaks.currentLoseStreak} Niederlagen` : '—'}
                  </span>
                </div>
                <div style={s.statsRow}>
                  <span style={s.statsLabel}>Längste Siegesserie</span>
                  <span style={s.statsValueGood}>{streaks.longestWinStreak} Spiele</span>
                </div>
                <div style={s.statsRowLast}>
                  <span style={s.statsLabel}>Längste Pechsträhne</span>
                  <span style={s.statsValueBad}>{streaks.longestLoseStreak} Spiele</span>
                </div>
              </div>
            )}

            {/* Besondere Leistungen (SQL) */}
            {sqlStats.data.achievements.length > 0 && (
              <div style={s.statsCard}>
                <div style={s.statsCardTitle as React.CSSProperties}>Besondere Leistungen</div>
                {sqlStats.data.achievements.map((a, i) => {
                  const medal = a.rank === 1 ? '🥇' : a.rank === 2 ? '🥈' : '🥉'
                  // Format basierend auf Kategorie
                  const isPercent = a.categoryId.includes('winrate') || a.categoryId.includes('checkout-pct')
                  const isDecimal = a.categoryId.includes('avg')
                  const formattedValue = isPercent ? `${a.value.toFixed(1)}%` :
                    isDecimal ? a.value.toFixed(2) : String(Math.round(a.value))
                  return (
                    <div key={`${a.categoryId}-${i}`} style={i === sqlStats.data.achievements.length - 1 ? s.statsRowLast : s.statsRow}>
                      <span style={{ fontSize: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 18 }}>{medal}</span>
                        <span>{a.categoryTitle}</span>
                      </span>
                      <span style={s.statsValueHighlight}>{formattedValue}</span>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Form & Konstanz (aus Speziell) */}
            {sqlStats.data.special && (() => {
              const special = sqlStats.data.special
              return (
              <div style={s.statsCardLast}>
                <div style={s.statsCardTitle as React.CSSProperties}>Form & Konstanz (X01)</div>
                <div style={s.statsRow}>
                  <span style={s.statsLabel}>Trend</span>
                  <span style={
                    special.averageTrend === 'rising' ? s.trendUp :
                    special.averageTrend === 'falling' ? s.trendDown :
                    s.trendStable
                  }>
                    {special.averageTrend === 'rising' ? '-> Steigend' :
                     special.averageTrend === 'falling' ? '-> Fallend' :
                     '-> Stabil'}
                  </span>
                </div>
                <div style={s.statsRow}>
                  <span style={s.statsLabel}>Letzte 5 Matches gewonnen</span>
                  <span style={s.statsValue}>{special.last5Wins} / 5</span>
                </div>
                <div style={s.statsRowLast}>
                  <span style={s.statsLabel}>Avg letzte 5 Matches</span>
                  <span style={s.statsValueHighlight}>{formatNum(special.last5Avg)}</span>
                </div>
              </div>
              )
            })()}
          </>
        )})()}

        {/* ============ X01 (SQL) — Redesigned with Accordions ============ */}
        {activeTab === 'x01' && !sqlStats.loading && (() => {
          const x01v = x01Variant !== 121 ? sqlStats.data.x01ByScore[x01Variant] : null
          const variants = [121, 301, 501, 701, 901] as const

          return (
          <div style={{ maxWidth: 520, margin: '0 auto' }}>
            {/* Score-Variant Switcher */}
            <div style={{ display: 'flex', gap: 0, marginBottom: 16, borderRadius: 10, overflow: 'hidden', border: `1px solid ${colors.border}` }}>
              {variants.map(v => (
                <button
                  key={v}
                  onClick={() => setX01Variant(v)}
                  style={{
                    flex: 1,
                    padding: '10px 0',
                    fontSize: 14,
                    fontWeight: x01Variant === v ? 700 : 500,
                    background: x01Variant === v ? colors.accent : colors.bgCard,
                    color: x01Variant === v ? (isArcade ? '#0a0a0a' : '#fff') : colors.fg,
                    border: 'none',
                    cursor: 'pointer',
                    transition: 'background .12s, color .12s',
                  }}
                >
                  {v}
                </button>
              ))}
            </div>

            {/* 121 Sprint Variante */}
            {x01Variant === 121 && (() => {
              const s121 = sqlStats.data.stats121
              if (!s121 || s121.totalLegs === 0) {
                return <div style={{ ...s.noData as React.CSSProperties, padding: 40 }}>Noch keine 121-Sprint-Spiele gespielt</div>
              }
              return (
                <>
                  <Accordion title="Übersicht" defaultOpen>
                    <div style={s.statsRow}><span style={s.statsLabel}>Legs gespielt</span><span style={s.statsValue}>{s121.totalLegs}</span></div>
                    <div style={s.statsRow}><span style={s.statsLabel}>Legs gewonnen</span><span style={s.statsValueGood}>{s121.legsWon}</span></div>
                    {s121.matchesPlayed > 0 && (<>
                      <div style={s.statsRow}><span style={s.statsLabel}>Matches gespielt</span><span style={s.statsValue}>{s121.matchesPlayed}</span></div>
                      <div style={s.statsRow}><span style={s.statsLabel}>Matches gewonnen</span><span style={s.statsValueGood}>{s121.matchesWon}</span></div>
                    </>)}
                    <div style={s.statsRow}><span style={s.statsLabel}>Gewinnquote</span><span style={s.statsValueHighlight}>{formatPct(s121.winRate)}</span></div>
                    <div style={s.statsRow}><span style={s.statsLabel}>Ø Darts bis Finish</span><span style={s.statsValueHighlight}>{formatNum(s121.avgDartsToFinish)}</span></div>
                    <div style={s.statsRowLast}><span style={s.statsLabel}>Persönliche Bestleistung</span><span style={s.statsValueGood}>{s121.bestDarts ?? '—'} Darts</span></div>
                  </Accordion>
                  <Accordion title="Checkout-Analyse" defaultOpen={false}>
                    <div style={s.statsRow}><span style={s.statsLabel}>Checkout-Quote</span><span style={s.statsValueHighlight}>{formatPct(s121.checkoutPct)}</span></div>
                    <div style={s.statsRow}><span style={s.statsLabel}>Versuche / Treffer</span><span style={s.statsValue}>{s121.checkoutAttempts} / {s121.checkoutsMade}</span></div>
                    <div style={s.statsRowLast}><span style={s.statsLabel}>Darts gesamt</span><span style={s.statsValue}>{s121.totalDarts}</span></div>
                  </Accordion>
                  <Accordion title="Konsistenz" defaultOpen={false}>
                    <div style={s.statsRow}><span style={s.statsLabel}>Beste Runde</span><span style={s.statsValueGood}>{s121.bestDarts ?? '—'} Darts</span></div>
                    <div style={s.statsRow}><span style={s.statsLabel}>Schlechteste Runde</span><span style={s.statsValueBad}>{s121.worstDarts ?? '—'} Darts</span></div>
                    <div style={s.statsRow}><span style={s.statsLabel}>Busts</span><span style={s.statsValueBad}>{s121.bustCount}</span></div>
                    <div style={s.statsRowLast}><span style={s.statsLabel}>Bust-Quote</span><span style={s.statsValue}>{formatPct(s121.bustRate)}</span></div>
                  </Accordion>
                  <Accordion title="Skill-Score" defaultOpen={false}>
                    <div style={{ display: 'flex', justifyContent: 'center', padding: 20 }}>
                      <div style={{
                        width: 100, height: 100, borderRadius: '50%',
                        background: s121.skillScore >= 70 ? colors.successBg : s121.skillScore >= 40 ? colors.warningBg : colors.errorBg,
                        border: `4px solid ${s121.skillScore >= 70 ? colors.success : s121.skillScore >= 40 ? colors.warning : colors.error}`,
                        display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
                      }}>
                        <span style={{ fontSize: 28, fontWeight: 800, color: s121.skillScore >= 70 ? colors.success : s121.skillScore >= 40 ? colors.warning : colors.error }}>{s121.skillScore}</span>
                        <span style={{ fontSize: 10, color: colors.fgDim }}>/ 100</span>
                      </div>
                    </div>
                  </Accordion>
                </>
              )
            })()}

            {/* X01 Stats (301-901) */}
            {x01Variant !== 121 && (!x01v || x01v.matchesPlayed === 0) && (
              <div style={{ ...s.noData as React.CSSProperties, padding: 40 }}>
                Noch keine {x01Variant}-Spiele gespielt
              </div>
            )}

            {/* Stats Accordions (nur für 301-901) */}
            {x01Variant !== 121 && x01v && x01v.matchesPlayed > 0 && (
            <>
              {/* 1. Allgemeine Matchdaten */}
              <Accordion title="Allgemeine Matchdaten" defaultOpen>
                <div style={s.statsRow}>
                  <span style={s.statsLabel}>Matches gespielt</span>
                  <span style={s.statsValue}>{x01v.multiMatchesPlayed}</span>
                </div>
                <div style={s.statsRow}>
                  <span style={s.statsLabel}>Siege</span>
                  <span style={s.statsValueGood}>{x01v.multiMatchesWon}</span>
                </div>
                <div style={s.statsRow}>
                  <span style={s.statsLabel}>Niederlagen</span>
                  <span style={s.statsValueBad}>{x01v.multiMatchesLost}</span>
                </div>
                <div style={s.statsRow}>
                  <span style={s.statsLabel}>Siegquote</span>
                  <span style={s.statsValueHighlight}>
                    {x01v.multiMatchesPlayed > 0
                      ? formatPct(Math.round(x01v.multiMatchesWon / x01v.multiMatchesPlayed * 100))
                      : '—'}
                  </span>
                </div>
                <div style={{ height: 8 }} />
                <div style={s.statsRow}>
                  <span style={s.statsLabel}>Darts gesamt</span>
                  <span style={s.statsValue}>{x01v.totalDarts.toLocaleString('de-DE')}</span>
                </div>
                <div style={s.statsRow}>
                  <span style={s.statsLabel}>Ø Darts pro Leg</span>
                  <span style={s.statsValue}>{formatNum(x01v.avgDartsPerLeg)}</span>
                </div>
                {x01v.soloMatches > 0 && (
                  <div style={s.statsRowLast}>
                    <span style={s.statsLabel}>Solo Spiele</span>
                    <span style={s.statsValue}>{x01v.soloMatches}</span>
                  </div>
                )}
              </Accordion>

              {/* 2. Scoring */}
              <Accordion title="Scoring" defaultOpen>
                <div style={s.statsRow}>
                  <span style={s.statsLabel}>Höchste Aufnahme</span>
                  <span style={s.statsValueHighlight}>{x01v.highestVisit}</span>
                </div>
                <div style={s.statsRow}>
                  <span style={s.statsLabel}>180er</span>
                  <span style={s.statsValue}>{x01v.count180}</span>
                </div>
                <div style={s.statsRow}>
                  <span style={s.statsLabel}>140+</span>
                  <span style={s.statsValue}>{x01v.count140plus}</span>
                </div>
                <div style={s.statsRow}>
                  <span style={s.statsLabel}>100+</span>
                  <span style={s.statsValue}>{x01v.count100plus}</span>
                </div>
                <div style={s.statsRow}>
                  <span style={s.statsLabel}>60+</span>
                  <span style={s.statsValue}>{x01v.count60plus}</span>
                </div>
                <div style={{ marginTop: 12, marginBottom: 8 }}>
                  <BarChart
                    data={[
                      { label: '180', value: x01v.count180, color: '#ef4444' },
                      { label: '140+', value: x01v.count140plus, color: '#f59e0b' },
                      { label: '100+', value: x01v.count100plus, color: '#10b981' },
                      { label: '60+', value: x01v.count60plus, color: '#3b82f6' },
                    ]}
                    height={20}
                  />
                </div>
                <div style={s.statsRowLast}>
                  <span style={s.statsLabel}>Punkte gesamt</span>
                  <span style={s.statsValue}>{x01v.totalPoints.toLocaleString('de-DE')}</span>
                </div>
              </Accordion>

              {/* 3. Averages */}
              <Accordion title="Averages">
                <div style={s.statsRow}>
                  <span style={s.statsLabel}>3-Dart-Average</span>
                  <span style={s.statsValueHighlight}>{formatNum(x01v.threeDartAvg)}</span>
                </div>
                <div style={s.statsRow}>
                  <span style={s.statsLabel}>First-9-Average</span>
                  <span style={s.statsValue}>—</span>
                </div>
                <div style={s.statsRow}>
                  <span style={s.statsLabel}>Bester Match-Average</span>
                  <span style={s.statsValueGood}>{x01v.bestMatchAvg != null ? formatNum(x01v.bestMatchAvg) : '—'}</span>
                </div>
                <div style={s.statsRowLast}>
                  <span style={s.statsLabel}>Niedrigster Match-Average</span>
                  <span style={s.statsValueBad}>{x01v.worstMatchAvg != null ? formatNum(x01v.worstMatchAvg) : '—'}</span>
                </div>
              </Accordion>

              {/* 4. Checkouts / Finishing */}
              <Accordion title="Checkouts / Finishing" defaultOpen>
                <div style={s.statsRow}>
                  <span style={s.statsLabel}>Checkout-Quote</span>
                  <span style={s.statsValueHighlight}>{formatPct(x01v.checkoutPercent)}</span>
                </div>
                <div style={s.statsRow}>
                  <span style={s.statsLabel}>Getroffen / Versucht</span>
                  <span style={s.statsValue}>{x01v.checkoutsMade} / {x01v.checkoutAttempts}</span>
                </div>
                <div style={s.statsRow}>
                  <span style={s.statsLabel}>Höchstes Finish</span>
                  <span style={s.statsValueHighlight}>{x01v.highestCheckout || '—'}</span>
                </div>
                <div style={s.statsRow}>
                  <span style={s.statsLabel}>Ø Checkout</span>
                  <span style={s.statsValue}>{x01v.avgCheckout || '—'}</span>
                </div>
                <div style={s.statsRow}>
                  <span style={s.statsLabel}>100+ Checkouts</span>
                  <span style={s.statsValue}>{x01v.checkouts100plus}</span>
                </div>
                <div style={s.statsRow}>
                  <span style={s.statsLabel}>Ø Darts pro Checkout</span>
                  <span style={s.statsValue}>{x01v.dartsPerCheckout != null ? formatNum(x01v.dartsPerCheckout) : '—'}</span>
                </div>
                <div style={s.statsRow}>
                  <span style={s.statsLabel}>Meistgenutztes Gewinn-Doppel</span>
                  <span style={s.statsValueHighlight}>{x01v.topFinishingDouble ?? '—'}</span>
                </div>

                {/* Checkout-Bereiche Tabelle */}
                {x01v.checkoutRanges.length > 0 && (
                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: colors.fgMuted, marginBottom: 8 }}>Checkout-Bereiche</div>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                      <thead>
                        <tr style={{ borderBottom: `1px solid ${colors.bgMuted}` }}>
                          <th style={{ textAlign: 'left', padding: '4px 0', fontWeight: 600, color: colors.fgDim }}>Range</th>
                          <th style={{ textAlign: 'right', padding: '4px 0', fontWeight: 600, color: colors.fgDim }}>Versuche</th>
                          <th style={{ textAlign: 'right', padding: '4px 0', fontWeight: 600, color: colors.fgDim }}>Getroffen</th>
                          <th style={{ textAlign: 'right', padding: '4px 0', fontWeight: 600, color: colors.fgDim }}>Quote</th>
                        </tr>
                      </thead>
                      <tbody>
                        {x01v.checkoutRanges.map(cr => (
                          <tr key={cr.range} style={{ borderBottom: `1px solid ${colors.bgMuted}` }}>
                            <td style={{ padding: '6px 0', color: colors.fg }}>{cr.range}</td>
                            <td style={{ textAlign: 'right', padding: '6px 0', color: colors.fgDim }}>{cr.attempts}</td>
                            <td style={{ textAlign: 'right', padding: '6px 0', color: colors.fg, fontWeight: 600 }}>{cr.made}</td>
                            <td style={{ textAlign: 'right', padding: '6px 0', color: colors.fg, fontWeight: 600 }}>{cr.percent.toFixed(1)}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Checkout-Heatmap (aus LocalStorage) */}
                {x01Career?.finishingDoubles && Object.keys(x01Career.finishingDoubles).length > 0 && (
                  <div style={{ marginTop: 16 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: colors.fgMuted, marginBottom: 8 }}>Checkout-Profil</div>
                    <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0' }}>
                      <CheckoutHeatmap finishingDoubles={x01Career.finishingDoubles} />
                    </div>
                    <div style={{ fontSize: 11, color: colors.fgDim, textAlign: 'center', marginTop: 4 }}>
                      Häufigste Doppelfelder beim Auschecken (alle Varianten)
                    </div>
                  </div>
                )}
              </Accordion>

              {/* 5. Highscores / Bestleistungen */}
              <Accordion title="Highscores / Bestleistungen">
                <div style={s.statsRow}>
                  <span style={s.statsLabel}>Bestes Leg (wenigste Darts)</span>
                  <span style={s.statsValueGood}>{x01v.bestLegDarts != null ? `${x01v.bestLegDarts} Darts` : '—'}</span>
                </div>
                <div style={s.statsRow}>
                  <span style={s.statsLabel}>Meiste 180er in einem Match</span>
                  <span style={s.statsValue}>{x01v.most180sInMatch}</span>
                </div>
                <div style={s.statsRow}>
                  <span style={s.statsLabel}>Bester Match-Average</span>
                  <span style={s.statsValueGood}>{x01v.bestMatchAvg != null ? formatNum(x01v.bestMatchAvg) : '—'}</span>
                </div>
                <div style={s.statsRow}>
                  <span style={s.statsLabel}>Beste Checkout-Quote (Match)</span>
                  <span style={s.statsValue}>{x01v.bestCheckoutPctInMatch != null ? `${x01v.bestCheckoutPctInMatch.toFixed(1)}%` : '—'}</span>
                </div>
                <div style={s.statsRowLast}>
                  <span style={s.statsLabel}>Meiste 140+ in einem Match</span>
                  <span style={s.statsValue}>{x01v.best140plusInMatch}</span>
                </div>
              </Accordion>

              {/* 6. Legs */}
              <Accordion title="Legs">
                <div style={s.statsRow}>
                  <span style={s.statsLabel}>Legs gespielt</span>
                  <span style={s.statsValue}>{x01v.legsPlayed}</span>
                </div>
                <div style={s.statsRow}>
                  <span style={s.statsLabel}>Legs gewonnen</span>
                  <span style={s.statsValueGood}>{x01v.legsWon}</span>
                </div>
                <div style={s.statsRow}>
                  <span style={s.statsLabel}>Leg-Differenz</span>
                  <span style={x01v.legDifference >= 0 ? s.statsValueGood : s.statsValueBad}>
                    {x01v.legDifference > 0 ? '+' : ''}{x01v.legDifference}
                  </span>
                </div>
                <div style={s.statsRow}>
                  <span style={s.statsLabel}>Leg-Siegquote</span>
                  <span style={s.statsValue}>{formatPct(x01v.legWinRate)}</span>
                </div>
                <div style={{ height: 8 }} />
                <div style={s.statsRow}>
                  <span style={s.statsLabel}>
                    Gewonnen mit ≤{x01Variant >= 901 ? 30 : x01Variant >= 701 ? 25 : 15} Darts
                  </span>
                  <span style={s.statsValue}>
                    {x01Variant >= 901 ? x01v.legsWonUnder30 : x01Variant >= 701 ? x01v.legsWonUnder25 : x01v.legsWonUnder15}
                  </span>
                </div>
                <div style={s.statsRow}>
                  <span style={s.statsLabel}>
                    Gewonnen mit ≤{x01Variant >= 901 ? 35 : x01Variant >= 701 ? 30 : 18} Darts
                  </span>
                  <span style={s.statsValue}>
                    {x01Variant >= 901 ? x01v.legsWonUnder35 : x01Variant >= 701 ? x01v.legsWonUnder30 : x01v.legsWonUnder18}
                  </span>
                </div>
                <div style={{ height: 8 }} />
                <div style={s.statsRow}>
                  <span style={s.statsLabel}>Schnellstes Leg (wenigste Darts)</span>
                  <span style={s.statsValueGood}>{x01v.bestLegDarts != null ? `${x01v.bestLegDarts} Darts` : '—'}</span>
                </div>
                <div style={s.statsRow}>
                  <span style={s.statsLabel}>Längstes Leg (meiste Darts)</span>
                  <span style={s.statsValue}>{x01v.longestLegDarts != null ? `${x01v.longestLegDarts} Darts` : '—'}</span>
                </div>
                <div style={s.statsRowLast}>
                  <span style={s.statsLabel}>Ø Darts im gewonnenen Leg</span>
                  <span style={s.statsValue}>{x01v.avgDartsWonLeg != null ? formatNum(x01v.avgDartsWonLeg) : '—'}</span>
                </div>
              </Accordion>

            </>
            )}
          </div>
          )
        })()}

        {/* ============ CRICKET & CO (Cricket + ATB + CTF) ============ */}
        {activeTab === 'cricketco' && !sqlStats.loading && (
          <>
          {/* --- Cricket --- */}
          <Accordion title="Cricket" defaultOpen>
            {sqlStats.data.cricket && (() => {
              const cricket = sqlStats.data.cricket
              return (
              <>
                {/* Übersicht */}
                <div style={s.statsCard}>
                  <div style={s.statsCardTitle as React.CSSProperties}>Übersicht</div>
                  <div style={s.statsRow}>
                    <span style={s.statsLabel}>Matches gespielt</span>
                    <span style={s.statsValue}>{cricket.matchesPlayed}</span>
                  </div>
                  <div style={s.statsRow}>
                    <span style={s.statsLabel}>Matches gewonnen</span>
                    <span style={s.statsValueGood}>{cricket.matchesWon}</span>
                  </div>
                  <div style={s.statsRow}>
                    <span style={s.statsLabel}>Match-Quote</span>
                    <span style={s.statsValueHighlight}>{formatPct(cricket.matchWinRate)}</span>
                  </div>
                  <div style={s.statsRow}>
                    <span style={s.statsLabel}>Legs gespielt</span>
                    <span style={s.statsValue}>{cricket.legsPlayed}</span>
                  </div>
                  <div style={s.statsRow}>
                    <span style={s.statsLabel}>Legs gewonnen</span>
                    <span style={s.statsValue}>{cricket.legsWon}</span>
                  </div>
                  <div style={s.statsRowLast}>
                    <span style={s.statsLabel}>Leg-Quote</span>
                    <span style={s.statsValue}>{formatPct(cricket.legWinRate)}</span>
                  </div>
                </div>

                {/* Marks */}
                <div style={s.statsCard}>
                  <div style={s.statsCardTitle as React.CSSProperties}>Marks</div>
                  <div style={s.statsRow}>
                    <span style={s.statsLabel}>Marks gesamt</span>
                    <span style={s.statsValueHighlight}>{cricket.totalMarks}</span>
                  </div>
                  <div style={s.statsRow}>
                    <span style={s.statsLabel}>Marks/Runde (MPR)</span>
                    <span style={s.statsValue}>{formatNum(cricket.marksPerRound, 2)}</span>
                  </div>
                  <div style={s.statsRowLast}>
                    <span style={s.statsLabel}>Turns gesamt</span>
                    <span style={s.statsValue}>{cricket.totalTurns}</span>
                  </div>
                </div>

                {/* Treffer */}
                <div style={s.statsCard}>
                  <div style={s.statsCardTitle as React.CSSProperties}>Treffer</div>
                  <div style={s.statsRow}>
                    <span style={s.statsLabel}>Triples</span>
                    <span style={s.statsValueHighlight}>{cricket.totalTriples}</span>
                  </div>
                  <div style={s.statsRow}>
                    <span style={s.statsLabel}>Doubles</span>
                    <span style={s.statsValue}>{cricket.totalDoubles}</span>
                  </div>
                  <div style={s.statsRow}>
                    <span style={s.statsLabel}>Singles</span>
                    <span style={s.statsValue}>{cricket.totalSingles}</span>
                  </div>
                  <div style={s.statsRow}>
                    <span style={s.statsLabel}>Bull (Single)</span>
                    <span style={s.statsValue}>{cricket.bullHits}</span>
                  </div>
                  <div style={s.statsRow}>
                    <span style={s.statsLabel}>Bull (Double)</span>
                    <span style={s.statsValue}>{cricket.doubleBullHits}</span>
                  </div>
                  <div style={s.statsRowLast}>
                    <span style={s.statsLabel}>Triple-Rate</span>
                    <span style={s.statsValue}>{formatPct(cricket.tripleRate)}</span>
                  </div>

                  {/* Treffer-Verteilung Balkendiagramm */}
                  {cricket.totalTriples + cricket.totalDoubles > 0 && (
                    <div style={{ marginTop: 16 }}>
                      <BarChart
                        data={[
                          { label: 'Triples', value: cricket.totalTriples, color: '#ef4444' },
                          { label: 'Doubles', value: cricket.totalDoubles, color: '#f59e0b' },
                          { label: 'Singles', value: cricket.totalSingles, color: '#6b7280' },
                          { label: 'Bull', value: cricket.bullHits + cricket.doubleBullHits, color: '#3b82f6' },
                        ]}
                        height={18}
                      />
                    </div>
                  )}
                </div>

                {/* Effizienz */}
                <div style={s.statsCardLast}>
                  <div style={s.statsCardTitle as React.CSSProperties}>Effizienz</div>
                  <div style={s.statsRow}>
                    <span style={s.statsLabel}>Bestes Leg</span>
                    <span style={s.statsValueGood}>{cricket.bestLegDarts ?? '—'} {cricket.bestLegDarts ? 'Darts' : ''}</span>
                  </div>
                  <div style={s.statsRow}>
                    <span style={s.statsLabel}>No-Score Turns</span>
                    <span style={s.statsValueBad}>{cricket.noScoreTurns}</span>
                  </div>
                  <div style={s.statsRowLast}>
                    <span style={s.statsLabel}>No-Score Quote</span>
                    <span style={s.statsValue}>{formatPct(cricket.noScoreRate)}</span>
                  </div>
                </div>
              </>
              )
            })()}
            {!sqlStats.data.cricket && (
              <div style={s.noData as React.CSSProperties}>Keine Cricket-Statistiken vorhanden.</div>
            )}
          </Accordion>

          {/* --- ATB (Around the Block) --- */}
          <Accordion title="Around the Block" defaultOpen={false}>
            {sqlStats.data.atb && sqlStats.data.atb.matchesPlayed > 0 ? (() => {
              const atb = sqlStats.data.atb
              return (
              <>
                {/* Übersicht */}
                <div style={s.statsCard}>
                  <div style={s.statsCardTitle as React.CSSProperties}>Übersicht</div>
                  <div style={s.statsRow}>
                    <span style={s.statsLabel}>Matches gespielt</span>
                    <span style={s.statsValueHighlight}>{atb.matchesPlayed}</span>
                  </div>
                  <div style={s.statsRow}>
                    <span style={s.statsLabel}>Matches gewonnen</span>
                    <span style={s.statsValueGood}>{atb.matchesWon}</span>
                  </div>
                  <div style={s.statsRowLast}>
                    <span style={s.statsLabel}>Gewinnquote</span>
                    <span style={s.statsValueHighlight}>{formatPct(atb.matchWinRate)}</span>
                  </div>
                </div>

                {/* Leistung */}
                <div style={s.statsCard}>
                  <div style={s.statsCardTitle as React.CSSProperties}>Leistung</div>
                  <div style={s.statsRow}>
                    <span style={s.statsLabel}>Darts gesamt</span>
                    <span style={s.statsValue}>{atb.totalDarts}</span>
                  </div>
                  <div style={s.statsRow}>
                    <span style={s.statsLabel}>Avg Darts pro Sieg</span>
                    <span style={s.statsValueHighlight}>{formatNum(atb.avgDartsPerWin, 1)}</span>
                  </div>
                  {/* Progress-Bar für Hit-Rate */}
                  <div style={{ marginTop: 8, marginBottom: 8 }}>
                    <ProgressBar
                      value={atb.hitRate}
                      label="Trefferquote"
                      color="#10b981"
                      height={16}
                    />
                  </div>
                  <div style={s.statsRow}>
                    <span style={s.statsLabel}>Treffer</span>
                    <span style={s.statsValue}>{atb.totalHits}</span>
                  </div>
                  <div style={s.statsRow}>
                    <span style={s.statsLabel}>Fehlwürfe</span>
                    <span style={s.statsValueBad}>{atb.totalMisses}</span>
                  </div>
                  <div style={s.statsRow}>
                    <span style={s.statsLabel}>Triples</span>
                    <span style={s.statsValue}>{atb.totalTriples}</span>
                  </div>
                  <div style={s.statsRowLast}>
                    <span style={s.statsLabel}>Doubles</span>
                    <span style={s.statsValue}>{atb.totalDoubles}</span>
                  </div>
                </div>

                {/* Bestleistungen */}
                <div style={s.statsCard}>
                  <div style={s.statsCardTitle as React.CSSProperties}>Bestleistungen</div>
                  <div style={s.statsRow}>
                    <span style={s.statsLabel}>Wenigste Darts (Sieg)</span>
                    <span style={s.statsValueGood}>{atb.bestDarts || '—'}</span>
                  </div>
                  <div style={s.statsRowLast}>
                    <span style={s.statsLabel}>Beste Zeit (Sieg)</span>
                    <span style={s.statsValue}>
                      {atb.bestTimeMs ? formatDuration(atb.bestTimeMs) : '—'}
                    </span>
                  </div>
                </div>

                {/* Best Times pro Modus */}
                {sqlStats.data.atbBestTimes.length > 0 && (
                  <div style={s.statsCardLast}>
                    <div style={s.statsCardTitle as React.CSSProperties}>Bestzeiten nach Modus</div>
                    {sqlStats.data.atbBestTimes.map((bt, i) => {
                      const modeLabel = bt.mode === 'classic' ? 'Klassisch' :
                                       bt.mode === 'doubles' ? 'Doubles' :
                                       bt.mode === 'triples' ? 'Triples' : bt.mode
                      const dirLabel = bt.direction === 'forward' ? '->' :
                                      bt.direction === 'backward' ? '<-' : '<->'
                      return (
                        <div key={`${bt.mode}-${bt.direction}`}
                             style={i === sqlStats.data.atbBestTimes.length - 1 ? s.statsRowLast : s.statsRow}>
                          <span style={s.statsLabel}>{modeLabel} {dirLabel}</span>
                          <div style={{ textAlign: 'right' }}>
                            <span style={s.statsValueGood}>{bt.bestDarts} Darts</span>
                            <span style={{ ...s.statsValue, marginLeft: 8, color: colors.fgDim }}>
                              ({formatDuration(bt.bestTime)})
                            </span>
                            <span style={{ fontSize: 11, color: colors.fgDim, marginLeft: 8 }}>
                              {bt.attempts}x
                            </span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </>
              )
            })() : (
              <div style={s.noData as React.CSSProperties}>Keine ATB-Statistiken vorhanden.</div>
            )}
          </Accordion>

          {/* --- CTF (Capture the Field) --- */}
          <Accordion title="Capture the Field" defaultOpen={false}>
            {selected && (() => {
              const allCtfMatches = getCTFMatches()
              const playerMatches = allCtfMatches.filter(m =>
                m.finished && m.players.some(p => p.playerId === selected.id)
              )
              if (playerMatches.length === 0) return (
                <div style={s.noData as React.CSSProperties}>Keine CTF-Statistiken vorhanden.</div>
              )

              const multiMatches = playerMatches.filter(m => m.players.length > 1)
              const soloMatches = playerMatches.filter(m => m.players.length <= 1)

              let totalDarts = 0
              let totalTriples = 0
              let totalDoubles = 0
              let totalSingles = 0
              let totalMisses = 0
              let totalFieldsWon = 0
              let totalScore = 0
              let multiWon = 0

              for (const m of playerMatches) {
                if (m.players.length > 1 && m.winnerId === selected.id) multiWon++
                const stats = computeCTFMatchStats(m)
                const ps = stats.find(s => s.playerId === selected.id)
                if (!ps) continue
                totalDarts += ps.totalDarts
                totalTriples += ps.triples
                totalDoubles += ps.doubles
                totalSingles += ps.singles
                totalMisses += ps.misses
                totalFieldsWon += ps.fieldsWon
                totalScore += ps.totalScore
              }

              const hits = totalDarts - totalMisses
              const hitRate = totalDarts > 0 ? (hits / totalDarts) * 100 : 0
              const multiTotal = multiMatches.length
              const multiWinRate = multiTotal > 0 ? (multiWon / multiTotal) * 100 : 0
              const avgScorePerMatch = playerMatches.length > 0 ? totalScore / playerMatches.length : 0
              const avgFieldsPerMatch = playerMatches.length > 0 ? totalFieldsWon / playerMatches.length : 0

              return (
              <>
                {/* Übersicht */}
                <div style={s.statsCard}>
                  <div style={s.statsCardTitle as React.CSSProperties}>Übersicht</div>
                  <div style={s.statsRow}>
                    <span style={s.statsLabel}>Matches gesamt</span>
                    <span style={s.statsValueHighlight}>{playerMatches.length}</span>
                  </div>
                  {multiTotal > 0 && (
                    <>
                      <div style={s.statsRow}>
                        <span style={s.statsLabel}>Gegen Gegner gewonnen</span>
                        <span style={s.statsValueGood}>{multiWon} / {multiTotal}</span>
                      </div>
                      <div style={s.statsRow}>
                        <span style={s.statsLabel}>Gewinnquote</span>
                        <span style={s.statsValueHighlight}>{formatPct(multiWinRate)}</span>
                      </div>
                    </>
                  )}
                  {soloMatches.length > 0 && (
                    <div style={s.statsRow}>
                      <span style={{ ...s.statsLabel, fontSize: 12 }}>Einzelspiele</span>
                      <span style={{ ...s.statsValue, fontSize: 12 }}>{soloMatches.length}</span>
                    </div>
                  )}
                </div>

                {/* Leistung */}
                <div style={s.statsCard}>
                  <div style={s.statsCardTitle as React.CSSProperties}>Leistung</div>
                  <div style={s.statsRow}>
                    <span style={s.statsLabel}>Darts gesamt</span>
                    <span style={s.statsValue}>{totalDarts.toLocaleString('de-DE')}</span>
                  </div>
                  <div style={s.statsRow}>
                    <span style={s.statsLabel}>Felder gewonnen</span>
                    <span style={s.statsValueGood}>{totalFieldsWon}</span>
                  </div>
                  <div style={s.statsRow}>
                    <span style={s.statsLabel}>Avg Felder pro Match</span>
                    <span style={s.statsValueHighlight}>{formatNum(avgFieldsPerMatch, 1)}</span>
                  </div>
                  <div style={s.statsRow}>
                    <span style={s.statsLabel}>Gesamtpunkte</span>
                    <span style={s.statsValueHighlight}>{totalScore.toLocaleString('de-DE')}</span>
                  </div>
                  <div style={s.statsRowLast}>
                    <span style={s.statsLabel}>Avg Punkte pro Match</span>
                    <span style={s.statsValue}>{formatNum(avgScorePerMatch, 1)}</span>
                  </div>
                </div>

                {/* Treffer */}
                <div style={s.statsCard}>
                  <div style={s.statsCardTitle as React.CSSProperties}>Treffer</div>
                  <div style={{ marginBottom: 8 }}>
                    <ProgressBar
                      value={hitRate}
                      label="Trefferquote"
                      color="#10b981"
                      height={16}
                    />
                  </div>
                  <div style={s.statsRow}>
                    <span style={s.statsLabel}>Triples</span>
                    <span style={s.statsValueHighlight}>{totalTriples}</span>
                  </div>
                  <div style={s.statsRow}>
                    <span style={s.statsLabel}>Doubles</span>
                    <span style={s.statsValue}>{totalDoubles}</span>
                  </div>
                  <div style={s.statsRow}>
                    <span style={s.statsLabel}>Singles</span>
                    <span style={s.statsValue}>{totalSingles}</span>
                  </div>
                  <div style={s.statsRowLast}>
                    <span style={s.statsLabel}>Fehlwürfe</span>
                    <span style={s.statsValueBad}>{totalMisses}</span>
                  </div>

                  {/* Treffer-Verteilung Balkendiagramm */}
                  {totalTriples + totalDoubles > 0 && (
                    <div style={{ marginTop: 16 }}>
                      <BarChart
                        data={[
                          { label: 'Triples', value: totalTriples, color: '#ef4444' },
                          { label: 'Doubles', value: totalDoubles, color: '#f59e0b' },
                          { label: 'Singles', value: totalSingles, color: '#6b7280' },
                        ]}
                        height={18}
                      />
                    </div>
                  )}
                </div>
              </>
              )
            })()}
          </Accordion>
          </>
        )}

        {/* ============ ANALYSE (Dart-Averages, Druck + Trainingsspiele) ============ */}
        {activeTab === 'analyse' && !sqlStats.loading && (
          <>
          {/* Speziell-Inhalte: Dart-Averages, Druck-Situationen */}
          {sqlStats.data.special && (() => {
            const special = sqlStats.data.special
            return (
            <>
              {/* Treffergenauigkeit */}
              <Accordion title="Treffergenauigkeit (Cricket)" defaultOpen>
                <div style={s.statsRow}>
                  <span style={s.statsLabel}>Triple-Quote</span>
                  <span style={s.statsValue}>{formatPct(special.tripleHitRate)}</span>
                </div>
                <div style={s.statsRowLast}>
                  <span style={s.statsLabel}>Double-Quote</span>
                  <span style={s.statsValue}>{formatPct(special.doubleHitRate)}</span>
                </div>
              </Accordion>

              {/* Dart 1/2/3 Average */}
              {(special.dart1Avg > 0 || special.dart2Avg > 0 || special.dart3Avg > 0) && (
              <Accordion title="Dart-Durchschnitt (X01)" defaultOpen>
                {(() => {
                  const maxAvg = Math.max(special.dart1Avg, special.dart2Avg, special.dart3Avg, 1)
                  const barColor = (val: number) => val >= maxAvg * 0.9 ? '#22c55e' : val >= maxAvg * 0.7 ? '#f59e0b' : '#ef4444'
                  return (
                    <>
                      {[
                        { label: '1. Dart', value: special.dart1Avg },
                        { label: '2. Dart', value: special.dart2Avg },
                        { label: '3. Dart', value: special.dart3Avg },
                      ].map((d, i) => (
                        <div key={i} style={{ ...s.statsRow, alignItems: 'center', ...(i === 2 ? { borderBottom: 'none' } : {}) }}>
                          <span style={{ ...s.statsLabel, flex: '0 0 60px' }}>{d.label}</span>
                          <div style={{ flex: 1, height: 14, background: colors.bgMuted, borderRadius: 4, overflow: 'hidden', margin: '0 8px' }}>
                            <div style={{
                              width: `${maxAvg > 0 ? (d.value / maxAvg) * 100 : 0}%`,
                              height: '100%',
                              background: barColor(d.value),
                              borderRadius: 4,
                              transition: 'width 0.3s ease',
                            }} />
                          </div>
                          <span style={{ ...s.statsValue, flex: '0 0 40px', textAlign: 'right' }}>{formatNum(d.value)}</span>
                        </div>
                      ))}
                    </>
                  )
                })()}
              </Accordion>
              )}

              {/* Druck-Situationen */}
              <Accordion title="Druck-Situationen" defaultOpen={false}>
                <div style={s.statsRow}>
                  <span style={s.statsLabel}>Average bei Rückstand</span>
                  <span style={s.statsValue}>
                    {special.performanceWhenBehind > 0 ? formatNum(special.performanceWhenBehind) : '—'}
                  </span>
                </div>
                <div style={s.statsRowLast}>
                  <span style={s.statsLabel}>Average bei Führung</span>
                  <span style={s.statsValue}>
                    {special.performanceWhenAhead > 0 ? formatNum(special.performanceWhenAhead) : '—'}
                  </span>
                </div>
              </Accordion>
            </>
            )
          })()}

          {/* Trainingsspiele */}
          {/* --- Sträußchen --- */}
          <Accordion title="Sträußchen" defaultOpen={false}>
            {selected && (() => {
              const allStrMatches = getStrMatches()
              const playerMatches = allStrMatches.filter(m =>
                m.finished && m.players.some(p => p.playerId === selected.id)
              )
              if (playerMatches.length === 0) return (
                <div style={s.noData as React.CSSProperties}>Keine Sträußchen-Statistiken vorhanden.</div>
              )

              const multiMatches = playerMatches.filter(m => m.players.length > 1)
              const soloMatches = playerMatches.filter(m => m.players.length <= 1)

              let totalLegs = 0
              let totalDarts = 0
              let totalHits = 0
              let totalMisses = 0
              let totalScore = 0
              let bestLegDarts: number | null = null
              let multiTotal = multiMatches.length
              let multiWon = 0

              for (const m of playerMatches) {
                if (m.players.length > 1 && m.winnerId === selected.id) multiWon++
                const players = m.players.map(p => ({ playerId: p.playerId, name: p.name }))
                const matchStats = computeStrMatchStats(m.events, players)
                const ps = matchStats.find(s => s.playerId === selected.id)
                if (!ps) continue
                totalLegs += ps.legsPlayed
                totalDarts += ps.totalDarts
                totalHits += ps.totalHits
                totalMisses += ps.totalMisses
                totalScore += ps.totalScore
                const legStartEvents = m.events.filter(e => e.type === 'StrLegStarted')
                for (const legStart of legStartEvents) {
                  if (legStart.type !== 'StrLegStarted') continue
                  const legFinish = m.events.find(e => e.type === 'StrLegFinished' && (e as any).legId === legStart.legId) as any
                  if (!legFinish) continue
                  const result = legFinish.results?.find((r: any) => r.playerId === selected.id)
                  if (result && (bestLegDarts === null || result.totalDarts < bestLegDarts)) {
                    bestLegDarts = result.totalDarts
                  }
                }
              }

              const hitRate = totalDarts > 0 ? (totalHits / (totalHits + totalMisses)) * 100 : 0
              const avgScorePerLeg = totalLegs > 0 ? totalScore / totalLegs : 0
              const avgDartsPerLeg = totalLegs > 0 ? totalDarts / totalLegs : 0
              const multiWinRate = multiTotal > 0 ? (multiWon / multiTotal) * 100 : 0

              return (
                <>
                  <div style={s.statsCard}>
                    <div style={s.statsCardTitle as React.CSSProperties}>Übersicht</div>
                    <div style={s.statsRow}>
                      <span style={s.statsLabel}>Matches gesamt</span>
                      <span style={s.statsValue}>{playerMatches.length}</span>
                    </div>
                    {multiTotal > 0 && (
                      <>
                        <div style={s.statsRow}>
                          <span style={s.statsLabel}>Gegen Gegner gewonnen</span>
                          <span style={s.statsValueGood}>{multiWon} / {multiTotal}</span>
                        </div>
                        <div style={s.statsRow}>
                          <span style={s.statsLabel}>Gewinnquote</span>
                          <span style={s.statsValueHighlight}>{formatPct(multiWinRate)}</span>
                        </div>
                      </>
                    )}
                    {soloMatches.length > 0 && (
                      <div style={s.statsRow}>
                        <span style={{ ...s.statsLabel, fontSize: 12 }}>Einzelspiele</span>
                        <span style={{ ...s.statsValue, fontSize: 12 }}>{soloMatches.length}</span>
                      </div>
                    )}
                    <div style={s.statsRowLast}>
                      <span style={s.statsLabel}>Legs gespielt</span>
                      <span style={s.statsValue}>{totalLegs}</span>
                    </div>
                  </div>
                  <div style={s.statsCard}>
                    <div style={s.statsCardTitle as React.CSSProperties}>Leistung</div>
                    <div style={s.statsRow}>
                      <span style={s.statsLabel}>Ø Score pro Leg</span>
                      <span style={s.statsValueHighlight}>{avgScorePerLeg.toFixed(1)}</span>
                    </div>
                    <div style={s.statsRow}>
                      <span style={s.statsLabel}>Ø Darts pro Leg</span>
                      <span style={s.statsValue}>{avgDartsPerLeg.toFixed(1)}</span>
                    </div>
                    <div style={s.statsRow}>
                      <span style={s.statsLabel}>Hit Rate</span>
                      <span style={s.statsValueGood}>{formatPct(hitRate)}</span>
                    </div>
                    <div style={s.statsRowLast}>
                      <span style={s.statsLabel}>Bestes Leg</span>
                      <span style={s.statsValueGood}>{bestLegDarts ?? '—'} Darts</span>
                    </div>
                  </div>
                </>
              )
            })()}
          </Accordion>

          {/* --- Highscore --- */}
          <Accordion title="Highscore" defaultOpen={false}>
            {selected && (() => {
              const allHsMatches = getHighscoreMatches()
              const playerMatches = allHsMatches.filter(m =>
                m.finished && m.players.some(p => p.id === selected.id)
              )
              if (playerMatches.length === 0) return (
                <div style={s.noData as React.CSSProperties}>Keine Highscore-Statistiken vorhanden.</div>
              )

              const multiMatches = playerMatches.filter(m => m.players.length > 1)
              const soloMatches = playerMatches.filter(m => m.players.length <= 1)

              let totalLegs = 0
              let totalDarts = 0
              let totalPoints = 0
              let total180s = 0
              let total140plus = 0
              let total100plus = 0
              let bestAvg: number | null = null
              let multiTotal = multiMatches.length
              let multiWon = 0

              for (const m of playerMatches) {
                if (m.players.length > 1 && m.winnerId === selected.id) multiWon++
                const playerTurns = m.events.filter(
                  (e: any) => e.type === 'HighscoreTurnAdded' && e.playerId === selected.id
                ) as any[]
                let legPoints = 0
                let legDarts = 0
                for (const turn of playerTurns) {
                  totalDarts += turn.darts?.length ?? 0
                  legDarts += turn.darts?.length ?? 0
                  totalPoints += turn.turnScore ?? 0
                  legPoints += turn.turnScore ?? 0
                  if (turn.turnScore === 180) total180s++
                  else if (turn.turnScore >= 140) total140plus++
                  else if (turn.turnScore >= 100) total100plus++
                }
                const legFinishes = m.events.filter(
                  (e: any) => e.type === 'HighscoreLegFinished'
                )
                totalLegs += legFinishes.length
                if (legDarts > 0) {
                  const avg = (legPoints / legDarts) * 3
                  if (bestAvg === null || avg > bestAvg) bestAvg = avg
                }
              }

              const avgPerDart = totalDarts > 0 ? totalPoints / totalDarts : 0
              const avgPerTurn = totalDarts > 0 ? (totalPoints / totalDarts) * 3 : 0
              const multiWinRate = multiTotal > 0 ? (multiWon / multiTotal) * 100 : 0

              return (
                <>
                  <div style={s.statsCard}>
                    <div style={s.statsCardTitle as React.CSSProperties}>Übersicht</div>
                    <div style={s.statsRow}>
                      <span style={s.statsLabel}>Matches gesamt</span>
                      <span style={s.statsValue}>{playerMatches.length}</span>
                    </div>
                    {multiTotal > 0 && (
                      <>
                        <div style={s.statsRow}>
                          <span style={s.statsLabel}>Gegen Gegner gewonnen</span>
                          <span style={s.statsValueGood}>{multiWon} / {multiTotal}</span>
                        </div>
                        <div style={s.statsRow}>
                          <span style={s.statsLabel}>Gewinnquote</span>
                          <span style={s.statsValueHighlight}>{formatPct(multiWinRate)}</span>
                        </div>
                      </>
                    )}
                    {soloMatches.length > 0 && (
                      <div style={s.statsRow}>
                        <span style={{ ...s.statsLabel, fontSize: 12 }}>Einzelspiele</span>
                        <span style={{ ...s.statsValue, fontSize: 12 }}>{soloMatches.length}</span>
                      </div>
                    )}
                    <div style={s.statsRowLast}>
                      <span style={s.statsLabel}>Legs gespielt</span>
                      <span style={s.statsValue}>{totalLegs}</span>
                    </div>
                  </div>
                  <div style={s.statsCard}>
                    <div style={s.statsCardTitle as React.CSSProperties}>Scoring</div>
                    <div style={s.statsRow}>
                      <span style={s.statsLabel}>Punkte gesamt</span>
                      <span style={s.statsValueHighlight}>{totalPoints.toLocaleString('de-DE')}</span>
                    </div>
                    <div style={s.statsRow}>
                      <span style={s.statsLabel}>Darts gesamt</span>
                      <span style={s.statsValue}>{totalDarts.toLocaleString('de-DE')}</span>
                    </div>
                    <div style={s.statsRow}>
                      <span style={s.statsLabel}>Ø pro Dart</span>
                      <span style={s.statsValueHighlight}>{formatNum(avgPerDart, 2)}</span>
                    </div>
                    <div style={s.statsRowLast}>
                      <span style={s.statsLabel}>Ø pro Turn (3 Darts)</span>
                      <span style={s.statsValueHighlight}>{formatNum(avgPerTurn, 1)}</span>
                    </div>
                  </div>
                  <div style={s.statsCardLast}>
                    <div style={s.statsCardTitle as React.CSSProperties}>High Scores</div>
                    <div style={s.statsRow}>
                      <span style={s.statsLabel}>180er</span>
                      <span style={{ ...s.statsValueHighlight, color: '#fbbf24' }}>{total180s}</span>
                    </div>
                    <div style={s.statsRow}>
                      <span style={s.statsLabel}>140+</span>
                      <span style={s.statsValue}>{total140plus}</span>
                    </div>
                    <div style={s.statsRow}>
                      <span style={s.statsLabel}>100+</span>
                      <span style={s.statsValue}>{total100plus}</span>
                    </div>
                    <div style={s.statsRowLast}>
                      <span style={s.statsLabel}>Bester Match-Avg</span>
                      <span style={s.statsValueGood}>{bestAvg ? formatNum(bestAvg, 1) : '—'}</span>
                    </div>
                  </div>
                </>
              )
            })()}
          </Accordion>

          {/* --- Bob's 27 --- */}
          <Accordion title="Bob's 27" defaultOpen={false}>
            {sqlStats.data.bobs27 && sqlStats.data.bobs27.matchesPlayed > 0 ? (() => {
              const b27 = sqlStats.data.bobs27
              return (
              <>
                <div style={s.statsCard}>
                  <div style={s.statsCardTitle as React.CSSProperties}>Übersicht</div>
                  <div style={s.statsRow}>
                    <span style={s.statsLabel}>Matches gespielt</span>
                    <span style={s.statsValueHighlight}>{b27.matchesPlayed}</span>
                  </div>
                  <div style={s.statsRow}>
                    <span style={s.statsLabel}>Ø Endstand</span>
                    <span style={s.statsValueHighlight}>{b27.avgFinalScore.toFixed(1)}</span>
                  </div>
                  <div style={s.statsRow}>
                    <span style={s.statsLabel}>Bester Endstand</span>
                    <span style={s.statsValueGood}>{b27.bestScore}</span>
                  </div>
                  <div style={s.statsRowLast}>
                    <span style={s.statsLabel}>Schlechtester Endstand</span>
                    <span style={s.statsValueBad}>{b27.worstScore}</span>
                  </div>
                </div>
                <div style={s.statsCard}>
                  <div style={s.statsCardTitle as React.CSSProperties}>Leistung</div>
                  <div style={s.statsRow}>
                    <span style={s.statsLabel}>Hit-Rate</span>
                    <span style={s.statsValueHighlight}>{formatPct(b27.avgHitRate)}</span>
                  </div>
                  <div style={s.statsRow}>
                    <span style={s.statsLabel}>Ø Targets abgeschlossen</span>
                    <span style={s.statsValue}>{b27.avgTargetsCompleted.toFixed(1)}</span>
                  </div>
                  <div style={s.statsRow}>
                    <span style={s.statsLabel}>Durchlaufquote</span>
                    <span style={s.statsValue}>{formatPct(b27.completionRate)}</span>
                  </div>
                  <div style={s.statsRow}>
                    <span style={s.statsLabel}>Darts gesamt</span>
                    <span style={s.statsValue}>{b27.totalDarts.toLocaleString('de-DE')}</span>
                  </div>
                  <div style={s.statsRowLast}>
                    <span style={s.statsLabel}>Ø Darts pro Match</span>
                    <span style={s.statsValue}>{b27.avgDartsPerMatch.toFixed(1)}</span>
                  </div>
                </div>
              </>
            )})() : (
              <div style={s.noData as React.CSSProperties}>Keine Bob's 27-Statistiken vorhanden.</div>
            )}
          </Accordion>

          {/* --- Operation: EFKG --- */}
          <Accordion title="Operation: EFKG" defaultOpen={false}>
            {sqlStats.data.operation && sqlStats.data.operation.matchesPlayed > 0 ? (() => {
              const op = sqlStats.data.operation
              return (
              <>
                <div style={s.statsCard}>
                  <div style={s.statsCardTitle as React.CSSProperties}>Übersicht</div>
                  <div style={s.statsRow}>
                    <span style={s.statsLabel}>Matches gespielt</span>
                    <span style={s.statsValueHighlight}>{op.matchesPlayed}</span>
                  </div>
                  {op.multiMatchesPlayed > 0 && (
                  <div style={s.statsRow}>
                    <span style={s.statsLabel}>Win / Loss</span>
                    <span style={s.statsValueHighlight}>{op.multiMatchesWon} / {op.multiMatchesPlayed - op.multiMatchesWon}</span>
                  </div>
                  )}
                  {op.soloMatchesPlayed > 0 && (
                  <div style={s.statsRow}>
                    <span style={s.statsLabel}>Solo Spiele</span>
                    <span style={s.statsValue}>{op.soloMatchesPlayed}</span>
                  </div>
                  )}
                  <div style={s.statsRow}>
                    <span style={s.statsLabel}>Ø Score</span>
                    <span style={s.statsValueHighlight}>{op.avgScore.toFixed(1)}</span>
                  </div>
                  <div style={s.statsRowLast}>
                    <span style={s.statsLabel}>Bester Score</span>
                    <span style={s.statsValueGood}>{op.bestScore}</span>
                  </div>
                </div>
                <div style={s.statsCard}>
                  <div style={s.statsCardTitle as React.CSSProperties}>Leistung</div>
                  <div style={s.statsRow}>
                    <span style={s.statsLabel}>Hit-Rate</span>
                    <span style={s.statsValueHighlight}>{formatPct(op.avgHitRate)}</span>
                  </div>
                  <div style={s.statsRow}>
                    <span style={s.statsLabel}>Ø Punkte/Dart</span>
                    <span style={s.statsValueHighlight}>{op.avgPointsPerDart.toFixed(2)}</span>
                  </div>
                  <div style={s.statsRow}>
                    <span style={s.statsLabel}>Darts gesamt</span>
                    <span style={s.statsValue}>{op.totalDarts.toLocaleString('de-DE')}</span>
                  </div>
                  <div style={s.statsRowLast}>
                    <span style={s.statsLabel}>Beste Trefferserie</span>
                    <span style={s.statsValueGood}>{op.bestStreak || '—'}</span>
                  </div>
                </div>
              </>
            )})() : (
              <div style={s.noData as React.CSSProperties}>Keine Operation: EFKG-Statistiken vorhanden.</div>
            )}
          </Accordion>

          {/* --- Killer --- */}
          <Accordion title="Killer" defaultOpen={false}>
            {sqlStats.data.killer && sqlStats.data.killer.matchesPlayed > 0 ? (() => {
              const k = sqlStats.data.killer
              return (
              <>
                <div style={s.statsCard}>
                  <div style={s.statsCardTitle as React.CSSProperties}>Übersicht</div>
                  <div style={s.statsRow}>
                    <span style={s.statsLabel}>Matches gespielt</span>
                    <span style={s.statsValueHighlight}>{k.matchesPlayed}</span>
                  </div>
                  <div style={s.statsRow}>
                    <span style={s.statsLabel}>Matches gewonnen</span>
                    <span style={s.statsValueGood}>{k.matchesWon}</span>
                  </div>
                  <div style={s.statsRow}>
                    <span style={s.statsLabel}>Siegquote</span>
                    <span style={s.statsValueHighlight}>{formatPct(k.winRate)}</span>
                  </div>
                  <div style={s.statsRowLast}>
                    <span style={s.statsLabel}>Ø Platzierung</span>
                    <span style={s.statsValueHighlight}>{k.avgPlacement.toFixed(1)}</span>
                  </div>
                </div>
                <div style={s.statsCard}>
                  <div style={s.statsCardTitle as React.CSSProperties}>Leistung</div>
                  <div style={s.statsRow}>
                    <span style={s.statsLabel}>Hit-Rate</span>
                    <span style={s.statsValueHighlight}>{formatPct(k.avgHitRate)}</span>
                  </div>
                  <div style={s.statsRow}>
                    <span style={s.statsLabel}>Ø Darts pro Match</span>
                    <span style={s.statsValue}>{k.avgDartsPerMatch.toFixed(1)}</span>
                  </div>
                  <div style={s.statsRow}>
                    <span style={s.statsLabel}>Darts gesamt</span>
                    <span style={s.statsValue}>{k.totalDarts.toLocaleString('de-DE')}</span>
                  </div>
                  <div style={s.statsRow}>
                    <span style={s.statsLabel}>Kills gesamt</span>
                    <span style={s.statsValueHighlight}>{k.totalKills}</span>
                  </div>
                  <div style={s.statsRow}>
                    <span style={s.statsLabel}>Ø Kills pro Match</span>
                    <span style={s.statsValue}>{k.avgKillsPerMatch.toFixed(1)}</span>
                  </div>
                  <div style={s.statsRowLast}>
                    <span style={s.statsLabel}>Ø Runden pro Match</span>
                    <span style={s.statsValue}>{k.avgRoundsPerMatch.toFixed(1)}</span>
                  </div>
                </div>
              </>
            )})() : (
              <div style={s.noData as React.CSSProperties}>Keine Killer-Statistiken vorhanden.</div>
            )}
          </Accordion>
          </>
        )}

        {/* ============ SPIELERPROFIL / INSIGHTS ============ */}
        {activeTab === 'insights' && selected && !sqlStats.loading && (
          <React.Suspense fallback={<div style={{ padding: 20, textAlign: 'center', color: colors.fgDim }}>Laden...</div>}>
            <PlayerInsightsTab playerId={selected.id} data={sqlStats.data} />
          </React.Suspense>
        )}

        {/* ============ TRENDS (SQL-basiert) ============ */}
        {activeTab === 'trends' && selected && (
          <SQLStatsTab playerId={selected.id} playerName={selected.name} />
        )}

        {/* ============ ERFOLGE & MEILENSTEINE ============ */}
        {activeTab === 'erfolge' && selected && !sqlStats.loading && (
          <React.Suspense fallback={<div style={{ padding: 20, textAlign: 'center', color: colors.fgDim }}>Laden...</div>}>
            <AdvancedStatsTab data={sqlStats.data} tab="erfolge" playerName={selected.name} />
          </React.Suspense>
        )}

        {/* Keine Daten */}
        {activeTab === 'uebersicht' && !sqlStats.loading && !sqlStats.data.general && (
          <div style={s.noData as React.CSSProperties}>Keine Statistiken vorhanden.</div>
        )}
      </div>
    </div>
  )
}
