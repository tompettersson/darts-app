// src/screens/HallOfFame.tsx
// Neue Hall of Fame mit Navigation zwischen Kategorien

import React, { useState, useMemo, useEffect } from 'react'
import { getThemedUI } from '../ui'
import { useTheme } from '../ThemeProvider'
import { getAllHighscoresSQL } from '../db/stats'
import type { HighscoreCategory, HighscoreGameType } from '../types/highscores'
import BarChart from '../components/charts/BarChart'

type Props = {
  onBack: () => void
}

const GAME_TYPE_LABELS: Record<HighscoreGameType, string> = {
  all: 'Allgemein',
  x01: 'X01',
  cricket: 'Cricket',
  atb: 'ATB',
  bobs27: "Bob's 27",
  operation: 'Operation: EFKG',
}

// Deduplizierung: gleicher Spieler + gleicher Wert → nur einmal
function deduplicateEntries(cats: HighscoreCategory[]): HighscoreCategory[] {
  return cats.map(cat => {
    const seen = new Set<string>()
    const filtered = cat.entries.filter(e => {
      const key = `${e.playerId}::${e.value}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    // Ränge neu vergeben
    return {
      ...cat,
      entries: filtered.map((e, i) => ({ ...e, rank: i + 1 })),
    }
  })
}

export default function HallOfFame({ onBack }: Props) {
  const { isArcade, colors } = useTheme()
  const styles = useMemo(() => getThemedUI(colors, isArcade), [colors, isArcade])

  const [activeTab, setActiveTab] = useState<HighscoreGameType>('all')
  const [cursor, setCursor] = useState(0)

  // Async SQL-Laden
  const [allCategories, setAllCategories] = useState<HighscoreCategory[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    getAllHighscoresSQL().then(cats => {
      if (!cancelled) {
        setAllCategories(deduplicateEntries(cats))
        setLoading(false)
      }
    }).catch(() => {
      if (!cancelled) setLoading(false)
    })
    return () => { cancelled = true }
  }, [])

  // Nach Tab filtern
  const categories = useMemo(() => {
    return allCategories.filter(c => c.gameType === activeTab)
  }, [allCategories, activeTab])

  // Cursor zurücksetzen wenn Tab wechselt
  const handleTabChange = (tab: HighscoreGameType) => {
    setActiveTab(tab)
    setCursor(0)
  }

  const currentCategory: HighscoreCategory | undefined = categories[cursor]

  // Navigation
  const prevCategory = () => {
    setCursor(c => (c - 1 + categories.length) % categories.length)
  }

  const nextCategory = () => {
    setCursor(c => (c + 1) % categories.length)
  }

  // Wert formatieren
  const formatValue = (value: number, format: string): string => {
    switch (format) {
      case 'percent':
        return `${value.toFixed(1)}%`
      case 'decimal':
        return value.toFixed(2)
      case 'darts':
        return `${value} Pfeile`
      case 'time': {
        // Millisekunden in mm:ss.xx formatieren
        const totalSecs = value / 1000
        const mins = Math.floor(totalSecs / 60)
        const secs = totalSecs % 60
        return `${mins}:${secs.toFixed(2).padStart(5, '0')}`
      }
      default:
        return value.toString()
    }
  }

  // Pokale für Top 3 (Gold, Silber, Bronze)
  const getTrophy = (rank: number): React.ReactNode => {
    const trophyColors: Record<number, string> = {
      1: '#FFD700', // Gold
      2: '#C0C0C0', // Silber
      3: '#CD7F32', // Bronze
    }
    const color = trophyColors[rank]
    if (!color) return null
    return <span style={{ fontSize: rank === 1 ? 18 : rank === 2 ? 16 : 15 }}>🏆</span>
  }

  const getTrophyBg = (rank: number): string => {
    if (rank === 1) return '#FFD70015'
    if (rank === 2) return '#C0C0C015'
    if (rank === 3) return '#CD7F3215'
    return 'transparent'
  }

  // Shimmer-Animation per <style> tag
  const shimmerCSS = `
    @keyframes hof-shimmer {
      0% { background-position: -200% center; }
      100% { background-position: 200% center; }
    }
    @keyframes hof-sparkle {
      0%, 100% { opacity: 0.3; transform: scale(0.8); }
      50% { opacity: 1; transform: scale(1.2); }
    }
  `

  // Styles
  const s = {
    shell: {
      maxWidth: 600,
      width: '100%',
      margin: '0 auto',
      padding: '16px 12px 40px',
      background: 'transparent',
      boxSizing: 'border-box' as const,
      overflowX: 'hidden' as const,
    } as React.CSSProperties,

    // Hero Title
    heroWrap: {
      textAlign: 'center',
      marginBottom: 20,
      padding: '20px 0 12px',
    } as React.CSSProperties,
    heroTitle: {
      fontSize: 32,
      fontWeight: 900,
      letterSpacing: '0.02em',
      background: `linear-gradient(90deg, ${colors.accent}, #FFD700, ${colors.accent}, #FFD700, ${colors.accent})`,
      backgroundSize: '200% auto',
      WebkitBackgroundClip: 'text',
      WebkitTextFillColor: 'transparent',
      backgroundClip: 'text',
      animation: 'hof-shimmer 3s linear infinite',
      display: 'inline-block',
    } as React.CSSProperties,
    heroSparkle: (delay: number) => ({
      display: 'inline-block',
      animation: `hof-sparkle 2s ease-in-out ${delay}s infinite`,
      fontSize: 20,
      verticalAlign: 'middle',
      margin: '0 6px',
    }) as React.CSSProperties,

    // Tab Bar
    tabBar: {
      display: 'flex',
      gap: 8,
      marginBottom: 16,
      overflowX: 'auto',
      flexWrap: 'nowrap',
      whiteSpace: 'nowrap',
      WebkitOverflowScrolling: 'touch',
      scrollbarWidth: 'none',
      msOverflowStyle: 'none',
    } as React.CSSProperties,
    tab: (isActive: boolean) => ({
      flex: '0 0 auto',
      padding: '10px 16px',
      borderRadius: 8,
      border: isActive ? `2px solid ${colors.accent}` : `1px solid ${colors.border}`,
      background: isActive ? (isArcade ? colors.accent : '#EFF6FF') : colors.bgCard,
      color: isActive ? (isArcade ? '#fff' : colors.accent) : colors.fgMuted,
      fontWeight: isActive ? 700 : 500,
      fontSize: 14,
      cursor: 'pointer',
      textAlign: 'center',
      transition: 'all .15s',
    }) as React.CSSProperties,

    // Navigation Header
    navHeader: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
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
    categoryInfo: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 4,
      flex: 1,
    } as React.CSSProperties,
    categoryTitle: {
      fontSize: 20,
      fontWeight: 800,
      textAlign: 'center',
      color: colors.fg,
    } as React.CSSProperties,
    categorySubtitle: {
      fontSize: 13,
      color: colors.fgMuted,
      textAlign: 'center',
    } as React.CSSProperties,
    categoryCounter: {
      fontSize: 12,
      color: colors.fgDim,
    } as React.CSSProperties,

    // Content Box
    contentBox: {
      background: colors.bgCard,
      borderRadius: 8,
      border: `1px solid ${colors.border}`,
      overflow: 'hidden',
    } as React.CSSProperties,

    // Table Header
    tableHeader: {
      display: 'grid',
      gridTemplateColumns: '40px 1fr 80px',
      padding: '12px 16px',
      background: colors.bgMuted,
      borderBottom: `1px solid ${colors.border}`,
      fontSize: 12,
      fontWeight: 600,
      color: colors.fgMuted,
      textTransform: 'uppercase',
      letterSpacing: '0.05em',
    } as React.CSSProperties,

    // Table Row
    tableRow: (isTop3: boolean, rank: number) => ({
      display: 'grid',
      gridTemplateColumns: '40px 1fr 80px',
      padding: '12px 16px',
      borderBottom: `1px solid ${colors.border}`,
      background: isTop3 ? getTrophyBg(rank) : colors.bgCard,
      alignItems: 'center',
    }) as React.CSSProperties,
    tableRowLast: (isTop3: boolean, rank: number) => ({
      display: 'grid',
      gridTemplateColumns: '40px 1fr 80px',
      padding: '12px 16px',
      background: isTop3 ? getTrophyBg(rank) : colors.bgCard,
      alignItems: 'center',
    }) as React.CSSProperties,

    rank: {
      fontSize: 14,
      fontWeight: 700,
      color: colors.fg,
    } as React.CSSProperties,
    rankMedal: {
      fontSize: 18,
    } as React.CSSProperties,

    playerCell: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
    } as React.CSSProperties,
    playerDot: (color?: string) => ({
      width: 10,
      height: 10,
      borderRadius: 9999,
      background: color || colors.fgDim,
      flexShrink: 0,
    }) as React.CSSProperties,
    playerName: {
      fontSize: 14,
      fontWeight: 500,
      color: colors.fg,
    } as React.CSSProperties,

    value: {
      fontSize: 14,
      fontWeight: 700,
      color: colors.fg,
      textAlign: 'right',
    } as React.CSSProperties,
    valueHighlight: {
      fontSize: 15,
      fontWeight: 800,
      color: colors.accent,
      textAlign: 'right',
    } as React.CSSProperties,

    // Empty State
    emptyState: {
      padding: 40,
      textAlign: 'center',
      color: colors.fgDim,
    } as React.CSSProperties,

    // Requirement Note
    requirement: {
      padding: '8px 16px',
      background: colors.bgMuted,
      fontSize: 11,
      color: colors.fgMuted,
      textAlign: 'center',
    } as React.CSSProperties,

    // Back Button Area
    backArea: {
      display: 'flex',
      justifyContent: 'center',
      marginTop: 16,
    } as React.CSSProperties,
  }

  // Hero Title Block (wiederverwendbar)
  const heroTitle = (
    <>
      <style>{shimmerCSS}</style>
      <div style={s.heroWrap}>
        <span style={s.heroSparkle(0)}>✨</span>
        <span style={s.heroTitle}>Highscores</span>
        <span style={s.heroSparkle(0.7)}>✨</span>
      </div>
    </>
  )

  // Loading State
  if (loading) {
    return (
      <div style={styles.page}>
        <div style={s.shell}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: colors.fg }}>Highscores</h2>
            <button style={styles.backBtn} onClick={onBack}>← Zurück</button>
          </div>
          {heroTitle}
          <div style={s.contentBox}>
            <div style={s.emptyState as React.CSSProperties}>
              Lade Highscores…
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (categories.length === 0) {
    return (
      <div style={styles.page}>
        <div style={s.shell}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: colors.fg }}>Highscores</h2>
            <button style={styles.backBtn} onClick={onBack}>← Zurück</button>
          </div>
          {heroTitle}
          <div style={s.contentBox}>
            <div style={s.emptyState as React.CSSProperties}>
              Keine Highscore-Daten vorhanden.
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={styles.page}>
      <div style={s.shell}>
        {/* Header mit Zurück-Button */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: colors.fg }}>Highscores</h2>
          <button style={styles.backBtn} onClick={onBack}>← Zurück</button>
        </div>

        {heroTitle}

        {/* Tab Bar */}
        <div style={s.tabBar} className="hide-scrollbar" role="tablist" aria-label="Spielmodus-Filter">
          {(['all', 'x01', 'cricket', 'atb', 'bobs27', 'operation'] as HighscoreGameType[]).map(tab => (
            <button
              key={tab}
              style={s.tab(activeTab === tab)}
              onClick={() => handleTabChange(tab)}
              role="tab"
              aria-selected={activeTab === tab}
            >
              {GAME_TYPE_LABELS[tab]}
            </button>
          ))}
        </div>

        {/* Navigation Header */}
        <div style={s.navHeader}>
          <button style={s.navBtn} onClick={prevCategory} aria-label="Vorherige Kategorie">
            ←
          </button>

          <div style={s.categoryInfo as React.CSSProperties}>
            <div style={s.categoryTitle as React.CSSProperties}>
              {currentCategory?.icon ? `${currentCategory.icon} ` : ''}{currentCategory?.title ?? '—'}
            </div>
            {currentCategory?.subtitle && (
              <div style={s.categorySubtitle as React.CSSProperties}>
                {currentCategory.subtitle}
              </div>
            )}
            <div style={s.categoryCounter}>
              {cursor + 1} von {categories.length}
            </div>
          </div>

          <button style={s.navBtn} onClick={nextCategory} aria-label="Nächste Kategorie">
            →
          </button>
        </div>

        {/* Content */}
        <div style={s.contentBox}>
          {/* Mindestanforderung */}
          {currentCategory?.minRequirement && (
            <div style={s.requirement as React.CSSProperties}>
              {currentCategory.minRequirement}
            </div>
          )}

          {/* Table Header */}
          <div style={s.tableHeader as React.CSSProperties}>
            <span>#</span>
            <span>Spieler</span>
            <span style={{ textAlign: 'right' }}>Wert</span>
          </div>

          {/* Entries */}
          {currentCategory?.entries && currentCategory.entries.length > 0 ? (
            currentCategory.entries.map((entry, i) => {
              const isLast = i === currentCategory.entries.length - 1
              const isTop3 = entry.rank <= 3
              const rowStyle = isLast ? s.tableRowLast(isTop3, entry.rank) : s.tableRow(isTop3, entry.rank)
              const trophy = getTrophy(entry.rank)

              return (
                <div key={`${entry.playerId}-${entry.matchId ?? ''}-${i}`} style={rowStyle}>
                  {/* Rank */}
                  <div style={trophy ? s.rankMedal : s.rank}>
                    {trophy || entry.rank}
                  </div>

                  {/* Player */}
                  <div style={s.playerCell}>
                    <span style={s.playerDot(entry.playerColor)} />
                    <span style={s.playerName}>{entry.playerName}</span>
                  </div>

                  {/* Value */}
                  <div style={isTop3 ? s.valueHighlight as React.CSSProperties : s.value as React.CSSProperties}>
                    {formatValue(entry.value, currentCategory.format)}
                  </div>
                </div>
              )
            })
          ) : (
            <div style={s.emptyState as React.CSSProperties}>
              Noch keine Einträge in dieser Kategorie.
            </div>
          )}
        </div>

        {/* Top-Visualisierung als BarChart */}
        {currentCategory?.entries && currentCategory.entries.length >= 2 && (() => {
          const MEDAL_COLORS = ['#FFD700', '#C0C0C0', '#CD7F32']
          const top = currentCategory.entries.slice(0, 5)
          const barData = top.map((entry, i) => ({
            label: entry.playerName.length > 8 ? entry.playerName.slice(0, 7) + '.' : entry.playerName,
            value: entry.value,
            color: i < 3 ? MEDAL_COLORS[i] : (entry.playerColor ?? '#6b7280'),
          }))

          // For "asc" categories (lower is better), invert the visual so
          // the best (lowest) value gets the longest bar
          const isAscBetter = currentCategory.sortOrder === 'asc'
          const displayData = isAscBetter
            ? (() => {
                const maxVal = Math.max(...barData.map(d => d.value), 1)
                return barData.map(d => ({ ...d, value: maxVal - d.value + maxVal * 0.15 }))
              })()
            : barData

          return (
            <div style={{
              background: colors.bgCard,
              borderRadius: 8,
              border: `1px solid ${colors.border}`,
              padding: 16,
              marginTop: 12,
            }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: colors.fgMuted, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Top {top.length} Vergleich
              </div>
              <BarChart
                data={displayData}
                height={22}
                gap={6}
                showValues={false}
              />
              {/* Show actual values as labels */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
                {top.map((entry, i) => (
                  <div key={`val-${i}`} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: colors.fgMuted }}>
                    <span style={{ color: i < 3 ? MEDAL_COLORS[i] : colors.fgDim, fontWeight: i < 3 ? 700 : 400 }}>
                      {i + 1}. {entry.playerName}
                    </span>
                    <span style={{ fontWeight: 600, color: colors.fg }}>
                      {formatValue(entry.value, currentCategory.format)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )
        })()}

      </div>
    </div>
  )
}
