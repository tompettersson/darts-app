// src/screens/HallOfFame.tsx
// Neue Hall of Fame mit Navigation zwischen Kategorien

import React, { useState, useMemo, useEffect } from 'react'
import { getThemedUI } from '../ui'
import { useTheme } from '../ThemeProvider'
import { getAllHighscoresSQL } from '../db/stats'
import type { HighscoreCategory, HighscoreGameType } from '../types/highscores'

type Props = {
  onBack: () => void
}

const GAME_TYPE_LABELS: Record<HighscoreGameType, string> = {
  all: 'Allgemein',
  x01: 'X01',
  cricket: 'Cricket',
  atb: 'Around the Block',
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
        setAllCategories(cats)
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

  // Medaillen für Top 3
  const getMedal = (rank: number): string => {
    if (rank === 1) return '🥇'
    if (rank === 2) return '🥈'
    if (rank === 3) return '🥉'
    return ''
  }

  // Styles
  const s = {
    shell: {
      maxWidth: 600,
      margin: '0 auto',
      padding: '16px 16px 40px',
      background: 'transparent',
    } as React.CSSProperties,

    // Tab Bar
    tabBar: {
      display: 'flex',
      gap: 8,
      marginBottom: 16,
    } as React.CSSProperties,
    tab: (isActive: boolean) => ({
      flex: 1,
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
    tableRow: (isTop3: boolean) => ({
      display: 'grid',
      gridTemplateColumns: '40px 1fr 80px',
      padding: '12px 16px',
      borderBottom: `1px solid ${colors.border}`,
      background: isTop3 ? colors.warningBg : colors.bgCard,
      alignItems: 'center',
    }) as React.CSSProperties,
    tableRowLast: (isTop3: boolean) => ({
      display: 'grid',
      gridTemplateColumns: '40px 1fr 80px',
      padding: '12px 16px',
      background: isTop3 ? colors.warningBg : colors.bgCard,
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

  // Loading State
  if (loading) {
    return (
      <div style={styles.page}>
        <div style={s.shell}>
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
        {/* Tab Bar */}
        <div style={s.tabBar}>
          {(['all', 'x01', 'cricket', 'atb'] as HighscoreGameType[]).map(tab => (
            <button
              key={tab}
              style={s.tab(activeTab === tab)}
              onClick={() => handleTabChange(tab)}
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
              {currentCategory?.title ?? '—'}
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
              const rowStyle = isLast ? s.tableRowLast(isTop3) : s.tableRow(isTop3)
              const medal = getMedal(entry.rank)

              return (
                <div key={entry.playerId} style={rowStyle}>
                  {/* Rank */}
                  <div style={medal ? s.rankMedal : s.rank}>
                    {medal || entry.rank}
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

        {/* Back Button */}
        <div style={s.backArea}>
          <button style={styles.backBtn} onClick={onBack}>
            ← Zurück
          </button>
        </div>
      </div>
    </div>
  )
}
