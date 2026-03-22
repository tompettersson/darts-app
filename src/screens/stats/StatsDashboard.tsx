// src/screens/stats/StatsDashboard.tsx
// "Vergleiche" - mit Kacheln-Navigation und Head-to-Head Feature

import React, { useState, useMemo, useRef, useEffect } from 'react'
import { ui, getThemedUI } from '../../ui'
import { useTheme } from '../../ThemeProvider'
import { getProfiles, getFinishedNon121Matches, getFinished121Matches, getCricketMatches, getATBMatches, getCTFMatches, getShanghaiMatches, getKillerMatches, type Profile } from '../../storage'
import { computeX01HeadToHead, computeCricketHeadToHead, computeATBHeadToHead, computeCTFHeadToHead, computeShanghaiHeadToHead, computeKillerHeadToHead } from '../../stats/computeHeadToHead'
import type { X01HeadToHeadResult, CricketHeadToHeadResult, ATBHeadToHeadResult, CTFHeadToHeadResult, ShanghaiHeadToHeadResult, KillerHeadToHeadResult } from '../../stats/computeHeadToHead'
import { compute121HeadToHead } from '../../stats/compute121HeadToHead'
import type { Stats121HeadToHead } from '../../types/stats121'
import { AVAILABLE_METRICS, getTrendForMetric, type MetricId } from '../../stats/computeTrendData'
import { formatDuration } from '../../dartsAroundTheBlock'
import ArcadeScrollPicker, { type PickerItem } from '../../components/ArcadeScrollPicker'
import { PLAYER_COLORS } from '../../playerColors'
import { PieChart, BarChart as BarChartComp } from '../../components/charts'

export type DashboardView = 'menu' | 'h2h' | 'compare'
export type DashboardGameMode = 'x01' | '121' | 'cricket' | 'atb' | 'ctf' | 'shanghai' | 'killer'

// H2H State der von außen gesteuert werden kann
export type H2HState = {
  view: DashboardView
  gameMode: DashboardGameMode
  player1Id: string
  player2Id: string
}

type Props = {
  onBack: () => void
  onShowPlayer?: (playerId: string) => void
  onOpenMatch?: (matchId: string) => void
  onOpenCricketMatch?: (matchId: string) => void
  onOpenHallOfFame?: () => void
  // Optionaler externer State (für Persistenz beim Navigieren)
  h2hState?: H2HState
  onH2HStateChange?: (state: H2HState) => void
}

export default function StatsDashboard({ onBack, onOpenMatch, onOpenCricketMatch, h2hState, onH2HStateChange }: Props) {
  // Theme System
  const { isArcade, colors } = useTheme()
  const styles = useMemo(() => getThemedUI(colors, isArcade), [colors, isArcade])

  // Interner State (falls kein externer übergeben wird)
  const [internalView, setInternalView] = useState<DashboardView>(h2hState?.view || 'menu')
  const [internalGameMode, setInternalGameMode] = useState<DashboardGameMode>(h2hState?.gameMode || 'x01')
  const [internalPlayer1Id, setInternalPlayer1Id] = useState<string>(h2hState?.player1Id || '')
  const [internalPlayer2Id, setInternalPlayer2Id] = useState<string>(h2hState?.player2Id || '')

  // Verwende externen State wenn vorhanden, sonst internen
  const view = h2hState?.view ?? internalView
  const gameMode = h2hState?.gameMode ?? internalGameMode
  const player1Id = h2hState?.player1Id ?? internalPlayer1Id
  const player2Id = h2hState?.player2Id ?? internalPlayer2Id

  // State-Setter die sowohl intern als auch extern updaten
  const setView = (v: DashboardView) => {
    setInternalView(v)
    onH2HStateChange?.({ view: v, gameMode, player1Id, player2Id })
  }
  const setGameMode = (m: DashboardGameMode) => {
    setInternalGameMode(m)
    onH2HStateChange?.({ view, gameMode: m, player1Id, player2Id })
  }
  const setPlayer1Id = (id: string) => {
    setInternalPlayer1Id(id)
    onH2HStateChange?.({ view, gameMode, player1Id: id, player2Id })
  }
  const setPlayer2Id = (id: string) => {
    setInternalPlayer2Id(id)
    onH2HStateChange?.({ view, gameMode, player1Id, player2Id: id })
  }

  // Spieler aus Profilen laden (keine temporären Spieler)
  const profiles = useMemo(() => {
    return getProfiles().filter(p => !p.name.startsWith('Spieler '))
  }, [])

  // Arcade Picker Index für Menü
  const [menuPickerIndex, setMenuPickerIndex] = useState(0)

  // Vergleiche-Ansicht State
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<string[]>([])
  const [selectedMetric, setSelectedMetric] = useState<MetricId>('tda')
  const [matchLimit, setMatchLimit] = useState<number>(20)
  const [multiplayerOnly, setMultiplayerOnly] = useState(false)
  const MATCH_LIMIT_OPTIONS = [3, 5, 10, 20, 30, 50] as const

  // Matches laden
  const x01Matches = useMemo(() => getFinishedNon121Matches(), [])
  const matches121 = useMemo(() => getFinished121Matches(), [])
  const cricketMatches = useMemo(() => getCricketMatches().filter(m => m.finished), [])
  const atbMatches = useMemo(() => getATBMatches().filter(m => m.finished), [])
  const ctfMatches = useMemo(() => getCTFMatches().filter(m => m.finished), [])
  const shanghaiMatches = useMemo(() => getShanghaiMatches().filter(m => m.finished), [])
  const killerMatches = useMemo(() => getKillerMatches().filter(m => m.finished), [])

  // Head-to-Head berechnen
  const x01H2H = useMemo<X01HeadToHeadResult | null>(() => {
    if (!player1Id || !player2Id || player1Id === player2Id) return null
    return computeX01HeadToHead(player1Id, player2Id, x01Matches)
  }, [player1Id, player2Id, x01Matches])

  const cricketH2H = useMemo<CricketHeadToHeadResult | null>(() => {
    if (!player1Id || !player2Id || player1Id === player2Id) return null
    return computeCricketHeadToHead(player1Id, player2Id, cricketMatches)
  }, [player1Id, player2Id, cricketMatches])

  const atbH2H = useMemo<ATBHeadToHeadResult | null>(() => {
    if (!player1Id || !player2Id || player1Id === player2Id) return null
    return computeATBHeadToHead(player1Id, player2Id, atbMatches)
  }, [player1Id, player2Id, atbMatches])

  const ctfH2H = useMemo<CTFHeadToHeadResult | null>(() => {
    if (!player1Id || !player2Id || player1Id === player2Id) return null
    return computeCTFHeadToHead(player1Id, player2Id, ctfMatches)
  }, [player1Id, player2Id, ctfMatches])

  const shanghaiH2H = useMemo<ShanghaiHeadToHeadResult | null>(() => {
    if (!player1Id || !player2Id || player1Id === player2Id) return null
    return computeShanghaiHeadToHead(player1Id, player2Id, shanghaiMatches)
  }, [player1Id, player2Id, shanghaiMatches])

  const killerH2H = useMemo<KillerHeadToHeadResult | null>(() => {
    if (!player1Id || !player2Id || player1Id === player2Id) return null
    return computeKillerHeadToHead(player1Id, player2Id, killerMatches)
  }, [player1Id, player2Id, killerMatches])

  const h2h121 = useMemo<Stats121HeadToHead | null>(() => {
    if (!player1Id || !player2Id || player1Id === player2Id) return null
    const converted = matches121.map(m => ({ matchId: m.id, events: (m.events ?? []) as any[] }))
    return compute121HeadToHead(player1Id, player2Id, converted)
  }, [player1Id, player2Id, matches121])

  const currentH2H = gameMode === 'x01' ? x01H2H
    : gameMode === '121' ? (h2h121 ? { matchesPlayed: h2h121.legsPlayed, player1Wins: h2h121.player1Wins, player2Wins: h2h121.player2Wins } : null)
    : gameMode === 'cricket' ? cricketH2H
    : gameMode === 'ctf' ? ctfH2H
    : gameMode === 'shanghai' ? shanghaiH2H
    : gameMode === 'killer' ? killerH2H
    : atbH2H
  const player1 = profiles.find(p => p.id === player1Id)
  const player2 = profiles.find(p => p.id === player2Id)

  // Trend-Daten für Vergleiche-Ansicht
  const trendData = useMemo(() => {
    if (selectedPlayerIds.length === 0) return []
    const raw = getTrendForMetric(selectedMetric, selectedPlayerIds, matchLimit, multiplayerOnly)
    return raw.map((r) => {
      // Index in profiles für konsistente Farbzuweisung
      const profileIdx = profiles.findIndex(p => p.id === r.playerId)
      const profile = profileIdx >= 0 ? profiles[profileIdx] : null
      // Profilfarbe oder Farbe aus Palette (basierend auf Profil-Index)
      const color = profile?.color || PLAYER_COLORS[profileIdx >= 0 ? profileIdx % PLAYER_COLORS.length : 0]
      return {
        playerId: r.playerId,
        name: profile?.name || 'Unbekannt',
        color,
        values: r.values,
      }
    })
  }, [selectedMetric, selectedPlayerIds, profiles, matchLimit, multiplayerOnly])

  // Dynamische Breite für Trend-Chart (Callback-Ref damit ResizeObserver auch bei View-Wechsel greift)
  const [trendChartWidth, setTrendChartWidth] = useState(600)
  const trendObserverRef = useRef<ResizeObserver | null>(null)
  const trendChartRef = useRef<HTMLDivElement | null>(null)
  const trendChartCallbackRef = (node: HTMLDivElement | null) => {
    // Alten Observer aufräumen
    if (trendObserverRef.current) {
      trendObserverRef.current.disconnect()
      trendObserverRef.current = null
    }
    trendChartRef.current = node
    if (!node) return
    // Sofort messen
    setTrendChartWidth(node.clientWidth)
    // Observer für Resize
    const ro = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect.width
      if (w && w > 0) setTrendChartWidth(Math.floor(w))
    })
    ro.observe(node)
    trendObserverRef.current = ro
  }

  // Styles (Theme-aware)
  const s = useMemo(() => ({
    shell: {
      maxWidth: 800,
      margin: '0 auto',
      padding: '16px 16px 40px',
      background: colors.bg,
      color: colors.fg,
    } as React.CSSProperties,
    shellWide: {
      maxWidth: 800,
      margin: '0 auto',
      padding: '16px 4px 40px',
      background: colors.bg,
      color: colors.fg,
    } as React.CSSProperties,

    // Header Navigation
    headerNav: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 16,
    } as React.CSSProperties,
    backBtn: {
      padding: '8px 16px',
      borderRadius: 8,
      border: `1px solid ${colors.border}`,
      background: colors.bgCard,
      color: colors.fg,
      cursor: 'pointer',
      fontSize: 14,
      fontWeight: 500,
      display: 'flex',
      alignItems: 'center',
      gap: 4,
    } as React.CSSProperties,
    pageTitle: {
      fontSize: 20,
      fontWeight: 800,
      textAlign: 'center',
      flex: 1,
      color: colors.fg,
    } as React.CSSProperties,
    spacer: {
      width: 80,
    } as React.CSSProperties,

    // Content Box
    contentBox: {
      background: colors.bgCard,
      borderRadius: 12,
      border: `1px solid ${colors.border}`,
      overflow: 'hidden',
    } as React.CSSProperties,

    // Menu Tiles
    menuTile: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'flex-start',
      padding: 20,
      borderBottom: `1px solid ${colors.bgMuted}`,
      cursor: 'pointer',
      background: colors.bgCard,
      border: 'none',
      width: '100%',
      textAlign: 'left',
      transition: 'background .12s',
    } as React.CSSProperties,
    menuTileLast: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'flex-start',
      padding: 20,
      cursor: 'pointer',
      background: colors.bgCard,
      border: 'none',
      width: '100%',
      textAlign: 'left',
      transition: 'background .12s',
    } as React.CSSProperties,
    menuTileDisabled: {
      opacity: 0.5,
      cursor: 'not-allowed',
    } as React.CSSProperties,
    menuTileTitle: {
      fontSize: 16,
      fontWeight: 700,
      color: colors.fg,
      marginBottom: 4,
    } as React.CSSProperties,
    menuTileSub: {
      fontSize: 13,
      color: colors.fgMuted,
    } as React.CSSProperties,

    // Section Title
    sectionTitle: {
      padding: '12px 16px',
      background: colors.bgMuted,
      borderBottom: `1px solid ${colors.border}`,
      fontSize: 13,
      fontWeight: 700,
      color: colors.fgMuted,
      textTransform: 'uppercase',
      letterSpacing: '0.05em',
    } as React.CSSProperties,

    // Selection Area
    selectionArea: {
      padding: 20,
      borderBottom: `1px solid ${colors.border}`,
    } as React.CSSProperties,
    selectionRow: {
      display: 'grid',
      gridTemplateColumns: '1fr auto 1fr',
      gap: 12,
      alignItems: 'center',
      marginBottom: 16,
    } as React.CSSProperties,
    vsText: {
      fontSize: 14,
      fontWeight: 800,
      color: colors.fgDim,
    } as React.CSSProperties,
    selectWrapper: {
      display: 'flex',
      flexDirection: 'column',
      gap: 4,
    } as React.CSSProperties,
    selectLabel: {
      fontSize: 11,
      fontWeight: 600,
      color: colors.fgMuted,
      textTransform: 'uppercase',
      letterSpacing: '0.05em',
    } as React.CSSProperties,
    select: {
      padding: '10px 12px',
      borderRadius: 8,
      border: `1px solid ${colors.border}`,
      fontSize: 14,
      fontWeight: 500,
      cursor: 'pointer',
      background: colors.bgInput,
      color: colors.fg,
      width: '100%',
    } as React.CSSProperties,

    // Mode Tabs
    modeTabs: {
      display: 'flex',
      gap: 8,
      justifyContent: 'center',
    } as React.CSSProperties,
    modeTab: (active: boolean): React.CSSProperties => ({
      padding: '8px 20px',
      borderRadius: 8,
      border: active ? `2px solid ${colors.accent}` : `2px solid ${colors.border}`,
      background: active ? colors.bgSoft : colors.bgCard,
      color: active ? colors.accent : colors.fg,
      cursor: 'pointer',
      fontWeight: 600,
      fontSize: 14,
    }),

    // Bilanz
    bilanzArea: {
      padding: 24,
      textAlign: 'center',
      borderBottom: `1px solid ${colors.border}`,
    } as React.CSSProperties,
    bilanzLabel: {
      fontSize: 12,
      fontWeight: 600,
      color: colors.fgMuted,
      marginBottom: 8,
      textTransform: 'uppercase',
      letterSpacing: '0.05em',
    } as React.CSSProperties,
    bilanzScore: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 12,
    } as React.CSSProperties,
    bilanzDot: (color?: string): React.CSSProperties => ({
      width: 10,
      height: 10,
      borderRadius: 9999,
      background: color || colors.fgDim,
    }),
    bilanzName: {
      fontSize: 16,
      fontWeight: 700,
      color: colors.fg,
    } as React.CSSProperties,
    bilanzNum: {
      fontSize: 28,
      fontWeight: 800,
      color: colors.fg,
    } as React.CSSProperties,
    bilanzColon: {
      fontSize: 28,
      fontWeight: 300,
      color: colors.border,
    } as React.CSSProperties,

    // Stats Card
    statsCard: {
      padding: 16,
      borderBottom: `1px solid ${colors.bgMuted}`,
    } as React.CSSProperties,
    statsCardLast: {
      padding: 16,
    } as React.CSSProperties,
    statsCardTitle: {
      fontSize: 13,
      fontWeight: 700,
      color: colors.fgMuted,
      marginBottom: 12,
      textTransform: 'uppercase',
      letterSpacing: '0.05em',
    } as React.CSSProperties,

    // Versus Row
    versusRow: {
      display: 'grid',
      gridTemplateColumns: '1fr 90px 1fr',
      padding: '8px 0',
      alignItems: 'center',
      borderBottom: `1px solid ${colors.bgMuted}`,
    } as React.CSSProperties,
    versusRowLast: {
      display: 'grid',
      gridTemplateColumns: '1fr 90px 1fr',
      padding: '8px 0',
      alignItems: 'center',
    } as React.CSSProperties,
    versusLabel: {
      textAlign: 'center',
      fontSize: 12,
      fontWeight: 500,
      color: colors.fgMuted,
    } as React.CSSProperties,

    // Empty State
    emptyState: {
      padding: 40,
      textAlign: 'center',
      color: colors.fgDim,
    } as React.CSSProperties,
    emptyStateTitle: {
      fontSize: 15,
      fontWeight: 600,
      marginBottom: 6,
      color: colors.fgMuted,
    } as React.CSSProperties,
    emptyStateSub: {
      fontSize: 13,
    } as React.CSSProperties,
  }), [colors])

  // Versus Bar Komponente - Verbessert mit größeren Balken und Gradient
  const VersusBar = ({
    label,
    value1,
    value2,
    format = 'number',
    higherIsBetter = true,
    isLast = false,
  }: {
    label: string
    value1: number
    value2: number
    format?: 'number' | 'decimal' | 'percent'
    higherIsBetter?: boolean
    isLast?: boolean
  }) => {
    const formatValue = (v: number): string => {
      switch (format) {
        case 'percent': return `${v.toFixed(1)}%`
        case 'decimal': return v.toFixed(2)
        default: return v.toString()
      }
    }

    const maxVal = Math.max(value1, value2, 0.01)
    const bar1Pct = maxVal > 0 ? (value1 / maxVal) * 100 : 0
    const bar2Pct = maxVal > 0 ? (value2 / maxVal) * 100 : 0

    const p1Better = higherIsBetter ? value1 > value2 : value1 < value2
    const p2Better = higherIsBetter ? value2 > value1 : value2 < value1
    const isTie = value1 === value2

    const color1 = player1?.color || '#3B82F6'
    const color2 = player2?.color || '#EF4444'

    // Balken-Styles mit Gradient für 3D-Effekt
    const barStyle = (color: string, isBetter: boolean): React.CSSProperties => ({
      height: 14,
      borderRadius: 7,
      background: isBetter || isTie
        ? `linear-gradient(180deg, ${color}ee 0%, ${color} 50%, ${color}cc 100%)`
        : `linear-gradient(180deg, #e5e7eb 0%, #d1d5db 100%)`,
      boxShadow: isBetter ? `0 2px 4px ${color}40` : 'none',
      transition: 'width 0.4s ease-out, background 0.3s ease',
      minWidth: bar1Pct > 0 || bar2Pct > 0 ? 4 : 0,
    })

    return (
      <div style={{
        ...isLast ? s.versusRowLast : s.versusRow,
        padding: '10px 0',
      }}>
        {/* Spieler 1 - Balken wächst von rechts nach links */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
          {/* Balken-Container */}
          <div style={{
            flex: 1,
            display: 'flex',
            justifyContent: 'flex-end',
            background: '#f3f4f6',
            borderRadius: 7,
            height: 14,
            overflow: 'hidden',
          }}>
            <div style={{
              ...barStyle(color1, p1Better),
              width: `${bar1Pct}%`,
            }} />
          </div>
          {/* Wert */}
          <span style={{
            fontSize: 14,
            fontWeight: p1Better ? 700 : 500,
            color: p1Better ? color1 : isTie ? '#374151' : '#9CA3AF',
            minWidth: 52,
            textAlign: 'right',
            fontVariantNumeric: 'tabular-nums',
          }}>
            {formatValue(value1)}
          </span>
        </div>

        {/* Label in der Mitte */}
        <div style={{
          ...s.versusLabel as React.CSSProperties,
          fontSize: 12,
          fontWeight: 600,
          color: '#6b7280',
          minWidth: 80,
          textAlign: 'center',
        }}>{label}</div>

        {/* Spieler 2 - Balken wächst von links nach rechts */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
          {/* Wert */}
          <span style={{
            fontSize: 14,
            fontWeight: p2Better ? 700 : 500,
            color: p2Better ? color2 : isTie ? '#374151' : '#9CA3AF',
            minWidth: 52,
            textAlign: 'left',
            fontVariantNumeric: 'tabular-nums',
          }}>
            {formatValue(value2)}
          </span>
          {/* Balken-Container */}
          <div style={{
            flex: 1,
            display: 'flex',
            justifyContent: 'flex-start',
            background: '#f3f4f6',
            borderRadius: 7,
            height: 14,
            overflow: 'hidden',
          }}>
            <div style={{
              ...barStyle(color2, p2Better),
              width: `${bar2Pct}%`,
            }} />
          </div>
        </div>
      </div>
    )
  }

  // X01 Stats Rendering
  const renderX01Stats = () => {
    if (!x01H2H || x01H2H.matchesPlayed === 0) {
      return (
        <div style={s.emptyState as React.CSSProperties}>
          <div style={s.emptyStateTitle}>Keine gemeinsamen X01-Spiele</div>
          <div style={s.emptyStateSub as React.CSSProperties}>
            Die beiden Spieler haben noch keine X01-Spiele gegeneinander gespielt.
          </div>
        </div>
      )
    }

    const p1 = x01H2H.player1Stats
    const p2 = x01H2H.player2Stats

    return (
      <>
        {/* Übersicht */}
        <div style={s.statsCard}>
          <div style={s.statsCardTitle as React.CSSProperties}>Übersicht</div>
          <VersusBar label="Spiele" value1={p1.matchesPlayed} value2={p2.matchesPlayed} />
          <VersusBar label="Siege" value1={p1.matchesWon} value2={p2.matchesWon} />
          <VersusBar label="Legs" value1={p1.legsWon} value2={p2.legsWon} isLast />
        </div>

        {/* Scoring */}
        <div style={s.statsCard}>
          <div style={s.statsCardTitle as React.CSSProperties}>Scoring</div>
          <VersusBar label="Average" value1={p1.threeDartAvg} value2={p2.threeDartAvg} format="decimal" />
          <VersusBar label="First-9" value1={p1.first9Avg} value2={p2.first9Avg} format="decimal" />
          <VersusBar label="Höchste" value1={p1.highestVisit} value2={p2.highestVisit} />
          <VersusBar label="180er" value1={p1.tons180} value2={p2.tons180} />
          <VersusBar label="140+" value1={p1.tons140Plus} value2={p2.tons140Plus} />
          <VersusBar label="100+" value1={p1.tons100Plus} value2={p2.tons100Plus} isLast />
        </div>

        {/* Checkout */}
        <div style={s.statsCard}>
          <div style={s.statsCardTitle as React.CSSProperties}>Checkout</div>
          <VersusBar label="Doppelquote" value1={p1.checkoutPct} value2={p2.checkoutPct} format="percent" />
          <VersusBar label="Treffer" value1={p1.doublesHit} value2={p2.doublesHit} />
          <VersusBar label="Versuche" value1={p1.doubleAttempts} value2={p2.doubleAttempts} />
          <VersusBar label="Höchstes" value1={p1.highestCheckout} value2={p2.highestCheckout} />
          <VersusBar label="Quote ≤40" value1={p1.checkoutPctLow} value2={p2.checkoutPctLow} format="percent" />
          <VersusBar label="Quote 41-100" value1={p1.checkoutPctMid} value2={p2.checkoutPctMid} format="percent" />
          <VersusBar label="Quote 101-170" value1={p1.checkoutPctHigh} value2={p2.checkoutPctHigh} format="percent" isLast />
        </div>

        {/* Lieblingsdoppel */}
        <div style={s.statsCard}>
          <div style={s.statsCardTitle as React.CSSProperties}>Lieblingsdoppel</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, padding: '8px 0' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: '#6B7280', marginBottom: 4 }}>{player1?.name}</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: player1?.color || '#3B82F6' }}>
                {p1.favouriteDouble ? `D${p1.favouriteDouble}` : '—'}
              </div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: '#6B7280', marginBottom: 4 }}>{player2?.name}</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: player2?.color || '#EF4444' }}>
                {p2.favouriteDouble ? `D${p2.favouriteDouble}` : '—'}
              </div>
            </div>
          </div>
        </div>

        {/* Busts */}
        <div style={s.statsCard}>
          <div style={s.statsCardTitle as React.CSSProperties}>Busts</div>
          <VersusBar label="Anzahl" value1={p1.totalBusts} value2={p2.totalBusts} higherIsBetter={false} />
          <VersusBar label="Quote" value1={p1.bustRate} value2={p2.bustRate} format="percent" higherIsBetter={false} isLast />
        </div>

        {/* Effizienz */}
        <div style={s.statsCard}>
          <div style={s.statsCardTitle as React.CSSProperties}>Effizienz</div>
          <VersusBar label="Legs gespielt" value1={p1.legsPlayed} value2={p2.legsPlayed} />
          <VersusBar label="Ø Pfeile/Leg" value1={p1.avgDartsPerLeg} value2={p2.avgDartsPerLeg} format="decimal" higherIsBetter={false} />
          <VersusBar label="Pfeile total" value1={p1.dartsThrown} value2={p2.dartsThrown} isLast />
        </div>

        {/* Triple-Analyse */}
        <div style={s.statsCard}>
          <div style={s.statsCardTitle as React.CSSProperties}>Triple-Analyse</div>
          <VersusBar label="Triple-Streak" value1={p1.longestTripleStreak} value2={p2.longestTripleStreak} />
          <VersusBar label="1. Dart Triple" value1={p1.tripleFollowUp.totalVisits} value2={p2.tripleFollowUp.totalVisits} />
          <VersusBar label="→ Triple-Rate" value1={p1.tripleFollowUp.tripleRate} value2={p2.tripleFollowUp.tripleRate} format="percent" />
          <VersusBar label="→ Waste-Rate" value1={p1.tripleFollowUp.wasteRate} value2={p2.tripleFollowUp.wasteRate} format="percent" higherIsBetter={false} isLast />
        </div>

        {/* Letzte 5 Spiele */}
        {renderLast5Matches('x01')}
      </>
    )
  }

  // 121 Stats Rendering
  const render121Stats = () => {
    if (!h2h121 || h2h121.legsPlayed === 0) {
      return (
        <div style={s.emptyState as React.CSSProperties}>
          <div style={s.emptyStateTitle}>Keine gemeinsamen 121-Spiele</div>
          <div style={s.emptyStateSub as React.CSSProperties}>
            Die beiden Spieler haben noch keine 121-Spiele gegeneinander gespielt.
          </div>
        </div>
      )
    }

    const p1 = h2h121.player1Stats
    const p2 = h2h121.player2Stats

    return (
      <>
        {/* Übersicht */}
        <div style={s.statsCard}>
          <div style={s.statsCardTitle as React.CSSProperties}>Übersicht</div>
          <VersusBar label="Siege" value1={h2h121.player1Wins} value2={h2h121.player2Wins} />
          <VersusBar label="Legs" value1={p1.legsWon} value2={p2.legsWon} isLast />
        </div>

        {/* Darts */}
        <div style={s.statsCard}>
          <div style={s.statsCardTitle as React.CSSProperties}>Darts</div>
          <VersusBar label="Ø Darts/Finish" value1={p1.avgDartsToFinish} value2={p2.avgDartsToFinish} format="decimal" higherIsBetter={false} />
          <VersusBar label="Bestes Finish" value1={p1.bestFinish} value2={p2.bestFinish} higherIsBetter={false} isLast />
        </div>

        {/* Checkout */}
        <div style={s.statsCard}>
          <div style={s.statsCardTitle as React.CSSProperties}>Checkout</div>
          <VersusBar label="Doppelquote" value1={p1.checkoutPct} value2={p2.checkoutPct} format="percent" />
          <VersusBar label="Ø Darts/Double" value1={p1.avgDartsOnDouble} value2={p2.avgDartsOnDouble} format="decimal" higherIsBetter={false} isLast />
        </div>

        {/* Skill-Score */}
        <div style={s.statsCard}>
          <div style={s.statsCardTitle as React.CSSProperties}>Skill-Score</div>
          <VersusBar label="Score" value1={p1.skillScore} value2={p2.skillScore} isLast />
        </div>
      </>
    )
  }

  // Letzte 5 H2H-Matches rendern
  const renderLast5Matches = (mode: 'x01' | 'cricket') => {
    const h2hResult = mode === 'x01' ? x01H2H : cricketH2H
    if (!h2hResult || h2hResult.matchesPlayed === 0) return null

    const matches = h2hResult.h2hMatches
      .slice()
      .sort((a, b) => {
        const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0
        const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0
        return dateB - dateA // Neueste zuerst
      })
      .slice(0, 5)

    if (matches.length === 0) return null

    return (
      <div style={s.statsCardLast}>
        <div style={s.statsCardTitle as React.CSSProperties}>Letzte Spiele</div>
        {matches.map((match, idx) => {
          // Gewinner ermitteln
          let winnerId: string | undefined
          let p1Legs = 0
          let p2Legs = 0

          if (mode === 'x01') {
            const finishEvt = (match as any).events?.find((e: any) => e.type === 'MatchFinished')
            winnerId = finishEvt?.winnerPlayerId
            // Legs zählen
            const legFinishes = ((match as any).events || []).filter((e: any) => e.type === 'LegFinished')
            for (const lf of legFinishes) {
              if (lf.winnerPlayerId === player1Id) p1Legs++
              if (lf.winnerPlayerId === player2Id) p2Legs++
            }
          } else {
            const finishEvt = (match as any).events?.find((e: any) => e.type === 'CricketMatchFinished')
            winnerId = finishEvt?.winnerPlayerId
            // Legs zählen
            const legFinishes = ((match as any).events || []).filter((e: any) => e.type === 'CricketLegFinished')
            for (const lf of legFinishes) {
              if (lf.winnerPlayerId === player1Id) p1Legs++
              if (lf.winnerPlayerId === player2Id) p2Legs++
            }
          }

          const winnerProfile = winnerId === player1Id ? player1 : winnerId === player2Id ? player2 : null
          const dateStr = match.createdAt
            ? new Date(match.createdAt).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
            : '—'

          const handleClick = () => {
            if (mode === 'x01' && onOpenMatch) {
              onOpenMatch(match.id)
            } else if (mode === 'cricket' && onOpenCricketMatch) {
              onOpenCricketMatch(match.id)
            }
          }

          return (
            <div
              key={match.id || idx}
              onClick={handleClick}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 0',
                borderBottom: idx < matches.length - 1 ? '1px solid #F3F4F6' : 'none',
                cursor: (mode === 'x01' && onOpenMatch) || (mode === 'cricket' && onOpenCricketMatch) ? 'pointer' : 'default',
                borderRadius: 4,
                marginLeft: -4,
                marginRight: -4,
                paddingLeft: 4,
                paddingRight: 4,
                transition: 'background .12s',
              }}
              onMouseEnter={e => {
                if ((mode === 'x01' && onOpenMatch) || (mode === 'cricket' && onOpenCricketMatch)) {
                  (e.currentTarget as HTMLDivElement).style.background = '#F9FAFB'
                }
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLDivElement).style.background = 'transparent'
              }}
            >
              {/* Datum */}
              <span style={{ fontSize: 12, color: '#6B7280', minWidth: 80 }}>
                {dateStr}
              </span>

              {/* Ergebnis */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{
                  fontSize: 14,
                  fontWeight: winnerId === player1Id ? 700 : 500,
                  color: winnerId === player1Id ? (player1?.color || '#3B82F6') : '#9CA3AF',
                }}>
                  {player1?.name?.substring(0, 10)}
                </span>
                <span style={{
                  fontSize: 16,
                  fontWeight: 700,
                  color: '#111',
                  padding: '2px 8px',
                  background: '#F3F4F6',
                  borderRadius: 4,
                }}>
                  {p1Legs} : {p2Legs}
                </span>
                <span style={{
                  fontSize: 14,
                  fontWeight: winnerId === player2Id ? 700 : 500,
                  color: winnerId === player2Id ? (player2?.color || '#EF4444') : '#9CA3AF',
                }}>
                  {player2?.name?.substring(0, 10)}
                </span>
              </div>

              {/* Sieger-Indikator */}
              <span style={{
                width: 10,
                height: 10,
                borderRadius: 9999,
                background: winnerProfile?.color || '#9CA3AF',
              }} />
            </div>
          )
        })}
      </div>
    )
  }

  // Cricket Stats Rendering
  const renderCricketStats = () => {
    if (!cricketH2H || cricketH2H.matchesPlayed === 0) {
      return (
        <div style={s.emptyState as React.CSSProperties}>
          <div style={s.emptyStateTitle}>Keine gemeinsamen Cricket-Spiele</div>
          <div style={s.emptyStateSub as React.CSSProperties}>
            Die beiden Spieler haben noch keine Cricket-Spiele gegeneinander gespielt.
          </div>
        </div>
      )
    }

    const p1 = cricketH2H.player1Stats
    const p2 = cricketH2H.player2Stats

    return (
      <>
        {/* Übersicht */}
        <div style={s.statsCard}>
          <div style={s.statsCardTitle as React.CSSProperties}>Übersicht</div>
          <VersusBar label="Spiele" value1={p1.matchesPlayed} value2={p2.matchesPlayed} />
          <VersusBar label="Siege" value1={p1.matchesWon} value2={p2.matchesWon} />
          <VersusBar label="Legs" value1={p1.legsWon} value2={p2.legsWon} isLast />
        </div>

        {/* Marks */}
        <div style={s.statsCard}>
          <div style={s.statsCardTitle as React.CSSProperties}>Marks</div>
          <VersusBar label="Total" value1={p1.totalMarks} value2={p2.totalMarks} />
          <VersusBar label="Marks/Runde" value1={p1.avgMarksPerTurn} value2={p2.avgMarksPerTurn} format="decimal" />
          <VersusBar label="Marks/Pfeil" value1={p1.avgMarksPerDart} value2={p2.avgMarksPerDart} format="decimal" />
          <VersusBar label="Beste Runde" value1={p1.bestTurnMarks} value2={p2.bestTurnMarks} isLast />
        </div>

        {/* Treffer */}
        <div style={s.statsCard}>
          <div style={s.statsCardTitle as React.CSSProperties}>Treffer</div>
          <VersusBar label="Triples" value1={p1.totalTriples} value2={p2.totalTriples} />
          <VersusBar label="Doubles" value1={p1.totalDoubles} value2={p2.totalDoubles} />
          <VersusBar label="Bull Single" value1={p1.totalBullSingles} value2={p2.totalBullSingles} />
          <VersusBar label="Bull Double" value1={p1.totalBullDoubles} value2={p2.totalBullDoubles} />
          <VersusBar label="Bull-Quote" value1={p1.bullAccuracy} value2={p2.bullAccuracy} format="percent" isLast />
        </div>

        {/* Feld-Analyse */}
        <div style={s.statsCard}>
          <div style={s.statsCardTitle as React.CSSProperties}>Feld-Analyse</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, padding: '8px 0' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: '#6B7280', marginBottom: 4 }}>{player1?.name}</div>
              <div style={{ fontSize: 13, marginBottom: 2 }}>
                <span style={{ color: '#10B981', fontWeight: 600 }}>Stark: {p1.strongestField || '—'}</span>
              </div>
              <div style={{ fontSize: 13 }}>
                <span style={{ color: '#EF4444', fontWeight: 600 }}>Schwach: {p1.weakestField || '—'}</span>
              </div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: '#6B7280', marginBottom: 4 }}>{player2?.name}</div>
              <div style={{ fontSize: 13, marginBottom: 2 }}>
                <span style={{ color: '#10B981', fontWeight: 600 }}>Stark: {p2.strongestField || '—'}</span>
              </div>
              <div style={{ fontSize: 13 }}>
                <span style={{ color: '#EF4444', fontWeight: 600 }}>Schwach: {p2.weakestField || '—'}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Effizienz */}
        <div style={s.statsCard}>
          <div style={s.statsCardTitle as React.CSSProperties}>Effizienz</div>
          <VersusBar label="No-Score" value1={p1.noScoreTurns} value2={p2.noScoreTurns} higherIsBetter={false} />
          <VersusBar label="No-Score %" value1={p1.noScoreRate} value2={p2.noScoreRate} format="percent" higherIsBetter={false} />
          <VersusBar label="Runden" value1={p1.totalTurns} value2={p2.totalTurns} isLast />
        </div>

        {/* Triple-Analyse */}
        <div style={s.statsCard}>
          <div style={s.statsCardTitle as React.CSSProperties}>Triple-Analyse</div>
          <VersusBar label="Triple-Streak" value1={p1.longestTripleStreak} value2={p2.longestTripleStreak} />
          <VersusBar label="1. Dart Triple" value1={p1.tripleFollowUp.totalTurns} value2={p2.tripleFollowUp.totalTurns} />
          <VersusBar label="→ Triple-Rate" value1={p1.tripleFollowUp.tripleRate} value2={p2.tripleFollowUp.tripleRate} format="percent" />
          <VersusBar label="→ Waste-Rate" value1={p1.tripleFollowUp.wasteRate} value2={p2.tripleFollowUp.wasteRate} format="percent" higherIsBetter={false} isLast />
        </div>

        {/* Letzte 5 Spiele */}
        {renderLast5Matches('cricket')}
      </>
    )
  }

  // ATB Stats Rendering
  const renderATBStats = () => {
    if (!atbH2H || atbH2H.matchesPlayed === 0) {
      return (
        <div style={s.emptyState as React.CSSProperties}>
          <div style={s.emptyStateTitle}>Keine gemeinsamen ATB-Spiele</div>
          <div style={s.emptyStateSub as React.CSSProperties}>
            Die beiden Spieler haben noch keine Around the Block-Spiele gegeneinander gespielt.
          </div>
        </div>
      )
    }

    const p1 = atbH2H.player1Stats
    const p2 = atbH2H.player2Stats

    return (
      <>
        {/* Übersicht */}
        <div style={s.statsCard}>
          <div style={s.statsCardTitle as React.CSSProperties}>Übersicht</div>
          <VersusBar label="Spiele" value1={p1.matchesPlayed} value2={p2.matchesPlayed} />
          <VersusBar label="Siege" value1={p1.matchesWon} value2={p2.matchesWon} isLast />
        </div>

        {/* Darts */}
        <div style={s.statsCard}>
          <div style={s.statsCardTitle as React.CSSProperties}>Darts</div>
          <VersusBar label="Total" value1={p1.totalDarts} value2={p2.totalDarts} />
          <VersusBar label="Ø pro Spiel" value1={p1.avgDartsPerMatch} value2={p2.avgDartsPerMatch} format="decimal" higherIsBetter={false} />
          <VersusBar label="Ø pro Feld" value1={p1.avgDartsPerField} value2={p2.avgDartsPerField} format="decimal" higherIsBetter={false} isLast />
        </div>

        {/* Treffer */}
        <div style={s.statsCard}>
          <div style={s.statsCardTitle as React.CSSProperties}>Treffer</div>
          <VersusBar label="Triples" value1={p1.totalTriples} value2={p2.totalTriples} />
          <VersusBar label="Doubles" value1={p1.totalDoubles} value2={p2.totalDoubles} />
          <VersusBar label="Singles" value1={p1.totalSingles} value2={p2.totalSingles} />
          <VersusBar label="Misses" value1={p1.totalMisses} value2={p2.totalMisses} higherIsBetter={false} />
          <VersusBar label="Trefferquote" value1={p1.hitRate} value2={p2.hitRate} format="percent" isLast />
        </div>

        {/* Bestleistungen */}
        <div style={s.statsCard}>
          <div style={s.statsCardTitle as React.CSSProperties}>Bestleistungen</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, padding: '8px 0' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: '#6B7280', marginBottom: 4 }}>{player1?.name}</div>
              <div style={{ fontSize: 12, marginBottom: 2 }}>
                <span style={{ color: '#374151' }}>Beste Zeit: </span>
                <span style={{ fontWeight: 700, color: player1?.color || '#3B82F6' }}>
                  {p1.bestTime ? formatDuration(p1.bestTime) : '—'}
                </span>
              </div>
              <div style={{ fontSize: 12 }}>
                <span style={{ color: '#374151' }}>Beste Darts: </span>
                <span style={{ fontWeight: 700, color: player1?.color || '#3B82F6' }}>
                  {p1.bestDarts ?? '—'}
                </span>
              </div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: '#6B7280', marginBottom: 4 }}>{player2?.name}</div>
              <div style={{ fontSize: 12, marginBottom: 2 }}>
                <span style={{ color: '#374151' }}>Beste Zeit: </span>
                <span style={{ fontWeight: 700, color: player2?.color || '#EF4444' }}>
                  {p2.bestTime ? formatDuration(p2.bestTime) : '—'}
                </span>
              </div>
              <div style={{ fontSize: 12 }}>
                <span style={{ color: '#374151' }}>Beste Darts: </span>
                <span style={{ fontWeight: 700, color: player2?.color || '#EF4444' }}>
                  {p2.bestDarts ?? '—'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Letzte 5 Spiele */}
        {renderLast5ATBMatches()}
      </>
    )
  }

  // Letzte 5 ATB H2H-Matches rendern
  const renderLast5ATBMatches = () => {
    if (!atbH2H || atbH2H.matchesPlayed === 0) return null

    const matches = atbH2H.h2hMatches
      .slice()
      .sort((a, b) => {
        const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0
        const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0
        return dateB - dateA // Neueste zuerst
      })
      .slice(0, 5)

    if (matches.length === 0) return null

    return (
      <div style={s.statsCardLast}>
        <div style={s.statsCardTitle as React.CSSProperties}>Letzte Spiele</div>
        {matches.map((match, idx) => {
          const winnerId = match.winnerId
          const winnerProfile = winnerId === player1Id ? player1 : winnerId === player2Id ? player2 : null
          const dateStr = match.createdAt
            ? new Date(match.createdAt).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
            : '—'

          return (
            <div
              key={match.id || idx}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 0',
                borderBottom: idx < matches.length - 1 ? '1px solid #F3F4F6' : 'none',
              }}
            >
              {/* Datum */}
              <span style={{ fontSize: 12, color: '#6B7280', minWidth: 80 }}>
                {dateStr}
              </span>

              {/* Gewinner */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{
                  fontSize: 14,
                  fontWeight: winnerId === player1Id ? 700 : 500,
                  color: winnerId === player1Id ? (player1?.color || '#3B82F6') : '#9CA3AF',
                }}>
                  {player1?.name?.substring(0, 10)}
                </span>
                <span style={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: '#6B7280',
                }}>
                  vs
                </span>
                <span style={{
                  fontSize: 14,
                  fontWeight: winnerId === player2Id ? 700 : 500,
                  color: winnerId === player2Id ? (player2?.color || '#EF4444') : '#9CA3AF',
                }}>
                  {player2?.name?.substring(0, 10)}{(match.config?.gameMode === 'capture' || match.config?.gameMode === 'pirate') && ' 🚩'}
                </span>
              </div>

              {/* Darts */}
              {match.winnerDarts && (
                <span style={{ fontSize: 12, color: '#6B7280' }}>
                  {match.winnerDarts} Darts
                </span>
              )}

              {/* Sieger-Indikator */}
              <span style={{
                width: 10,
                height: 10,
                borderRadius: 9999,
                background: winnerProfile?.color || '#9CA3AF',
              }} />
            </div>
          )
        })}
      </div>
    )
  }

  // CTF Stats Rendering
  const renderCTFStats = () => {
    if (!ctfH2H || ctfH2H.matchesPlayed === 0) {
      return (
        <div style={s.emptyState as React.CSSProperties}>
          <div style={s.emptyStateTitle}>Keine gemeinsamen CTF-Spiele</div>
          <div style={s.emptyStateSub as React.CSSProperties}>
            Die beiden Spieler haben noch keine Capture the Field-Spiele gegeneinander gespielt.
          </div>
        </div>
      )
    }

    const p1 = ctfH2H.player1Stats
    const p2 = ctfH2H.player2Stats

    return (
      <>
        {/* Übersicht */}
        <div style={s.statsCard}>
          <div style={s.statsCardTitle as React.CSSProperties}>Übersicht</div>
          <VersusBar label="Spiele" value1={p1.matchesPlayed} value2={p2.matchesPlayed} />
          <VersusBar label="Siege" value1={p1.matchesWon} value2={p2.matchesWon} isLast />
        </div>

        {/* Felder & Punkte */}
        <div style={s.statsCard}>
          <div style={s.statsCardTitle as React.CSSProperties}>Felder & Punkte</div>
          <VersusBar label="Felder ges." value1={p1.totalFieldsWon} value2={p2.totalFieldsWon} />
          <VersusBar label="Ø Felder" value1={p1.avgFieldsPerMatch} value2={p2.avgFieldsPerMatch} format="decimal" />
          <VersusBar label="Punkte ges." value1={p1.totalScore} value2={p2.totalScore} />
          <VersusBar label="Ø Punkte" value1={p1.avgScorePerMatch} value2={p2.avgScorePerMatch} format="decimal" isLast />
        </div>

        {/* Darts */}
        <div style={s.statsCard}>
          <div style={s.statsCardTitle as React.CSSProperties}>Darts</div>
          <VersusBar label="Total" value1={p1.totalDarts} value2={p2.totalDarts} />
          <VersusBar label="Ø pro Spiel" value1={p1.avgDartsPerMatch} value2={p2.avgDartsPerMatch} format="decimal" isLast />
        </div>

        {/* Treffer */}
        <div style={s.statsCard}>
          <div style={s.statsCardTitle as React.CSSProperties}>Treffer</div>
          <VersusBar label="Triples" value1={p1.totalTriples} value2={p2.totalTriples} />
          <VersusBar label="Doubles" value1={p1.totalDoubles} value2={p2.totalDoubles} />
          <VersusBar label="Singles" value1={p1.totalSingles} value2={p2.totalSingles} />
          <VersusBar label="Misses" value1={p1.totalMisses} value2={p2.totalMisses} higherIsBetter={false} />
          <VersusBar label="Trefferquote" value1={p1.hitRate} value2={p2.hitRate} format="percent" isLast />
        </div>

        {/* Letzte 5 Spiele */}
        {renderLast5CTFMatches()}
      </>
    )
  }

  // Shanghai Stats Rendering
  const renderShanghaiStats = () => {
    if (!shanghaiH2H || shanghaiH2H.matchesPlayed === 0) {
      return (
        <div style={s.emptyState as React.CSSProperties}>
          <div style={s.emptyStateTitle}>Keine gemeinsamen Shanghai-Spiele</div>
          <div style={s.emptyStateSub as React.CSSProperties}>
            Die beiden Spieler haben noch keine Shanghai-Spiele gegeneinander gespielt.
          </div>
        </div>
      )
    }

    const p1 = shanghaiH2H.player1Stats
    const p2 = shanghaiH2H.player2Stats

    return (
      <>
        {/* Übersicht */}
        <div style={s.statsCard}>
          <div style={s.statsCardTitle as React.CSSProperties}>Übersicht</div>
          <VersusBar label="Spiele" value1={p1.matchesPlayed} value2={p2.matchesPlayed} />
          <VersusBar label="Siege" value1={p1.matchesWon} value2={p2.matchesWon} />
          <VersusBar label="Shanghai!" value1={p1.shanghaiCount} value2={p2.shanghaiCount} isLast />
        </div>

        {/* Punkte */}
        <div style={s.statsCard}>
          <div style={s.statsCardTitle as React.CSSProperties}>Punkte</div>
          <VersusBar label="Punkte ges." value1={p1.totalScore} value2={p2.totalScore} />
          <VersusBar label="Ø Punkte" value1={p1.avgScore} value2={p2.avgScore} format="decimal" />
          <VersusBar label="Ø pro Runde" value1={p1.avgPerRound} value2={p2.avgPerRound} format="decimal" />
          <VersusBar label="Best Score" value1={p1.bestScore} value2={p2.bestScore} isLast />
        </div>

        {/* Treffer */}
        <div style={s.statsCard}>
          <div style={s.statsCardTitle as React.CSSProperties}>Treffer</div>
          <VersusBar label="Triples" value1={p1.triples} value2={p2.triples} />
          <VersusBar label="Doubles" value1={p1.doubles} value2={p2.doubles} />
          <VersusBar label="Singles" value1={p1.singles} value2={p2.singles} />
          <VersusBar label="Misses" value1={p1.misses} value2={p2.misses} higherIsBetter={false} />
          <VersusBar label="Trefferquote" value1={p1.hitRate} value2={p2.hitRate} format="percent" isLast />
        </div>

        {/* Letzte 5 Spiele */}
        {renderLast5ShanghaiMatches()}
      </>
    )
  }

  // Letzte 5 Shanghai H2H-Matches rendern
  const renderLast5ShanghaiMatches = () => {
    if (!shanghaiH2H || shanghaiH2H.matchesPlayed === 0) return null

    const matches = shanghaiH2H.h2hMatches
      .slice()
      .sort((a, b) => {
        const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0
        const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0
        return dateB - dateA
      })
      .slice(0, 5)

    if (matches.length === 0) return null

    return (
      <div style={s.statsCardLast}>
        <div style={s.statsCardTitle as React.CSSProperties}>Letzte Spiele</div>
        {matches.map((match, idx) => {
          const winnerId = match.winnerId
          const winnerProfile = winnerId === player1Id ? player1 : winnerId === player2Id ? player2 : null
          const dateStr = match.createdAt
            ? new Date(match.createdAt).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
            : '—'

          const p1Score = match.finalScores?.[player1Id] ?? 0
          const p2Score = match.finalScores?.[player2Id] ?? 0

          return (
            <div
              key={match.id || idx}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 0',
                borderBottom: idx < matches.length - 1 ? '1px solid #F3F4F6' : 'none',
              }}
            >
              <span style={{ fontSize: 12, color: '#6B7280', minWidth: 80 }}>
                {dateStr}
              </span>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{
                  fontSize: 14,
                  fontWeight: winnerId === player1Id ? 700 : 500,
                  color: winnerId === player1Id ? (player1?.color || '#3B82F6') : '#9CA3AF',
                }}>
                  {player1?.name?.substring(0, 10)}
                </span>
                <span style={{
                  fontSize: 16,
                  fontWeight: 700,
                  color: '#111',
                  padding: '2px 8px',
                  background: '#F3F4F6',
                  borderRadius: 4,
                }}>
                  {p1Score} : {p2Score}
                </span>
                <span style={{
                  fontSize: 14,
                  fontWeight: winnerId === player2Id ? 700 : 500,
                  color: winnerId === player2Id ? (player2?.color || '#EF4444') : '#9CA3AF',
                }}>
                  {player2?.name?.substring(0, 10)}
                </span>
              </div>

              <span style={{
                width: 10,
                height: 10,
                borderRadius: 9999,
                background: winnerProfile?.color || '#9CA3AF',
              }} />
            </div>
          )
        })}
      </div>
    )
  }

  // Killer Stats Rendering
  const renderKillerStats = () => {
    if (!killerH2H || killerH2H.matchesPlayed === 0) {
      return (
        <div style={s.emptyState as React.CSSProperties}>
          <div style={s.emptyStateTitle}>Keine gemeinsamen Killer-Spiele</div>
          <div style={s.emptyStateSub as React.CSSProperties}>
            Die beiden Spieler haben noch keine Killer-Spiele gegeneinander gespielt.
          </div>
        </div>
      )
    }

    const p1 = killerH2H.player1Stats
    const p2 = killerH2H.player2Stats

    return (
      <>
        {/* Übersicht */}
        <div style={s.statsCard}>
          <div style={s.statsCardTitle as React.CSSProperties}>Übersicht</div>
          <VersusBar label="Spiele" value1={p1.matchesPlayed} value2={p2.matchesPlayed} />
          <VersusBar label="Siege" value1={p1.matchesWon} value2={p2.matchesWon} isLast />
        </div>

        {/* Kills & Überleben */}
        <div style={s.statsCard}>
          <div style={s.statsCardTitle as React.CSSProperties}>Kills & Überleben</div>
          <VersusBar label="Kills ges." value1={p1.totalKills} value2={p2.totalKills} />
          <VersusBar label="Ø Kills" value1={p1.avgKillsPerMatch} value2={p2.avgKillsPerMatch} format="decimal" />
          <VersusBar label="Ø Runden überlebt" value1={p1.avgSurvivedRounds} value2={p2.avgSurvivedRounds} format="decimal" />
          <VersusBar label="Ø Platzierung" value1={p1.avgPosition} value2={p2.avgPosition} format="decimal" higherIsBetter={false} isLast />
        </div>

        {/* Leben */}
        <div style={s.statsCard}>
          <div style={s.statsCardTitle as React.CSSProperties}>Leben</div>
          <VersusBar label="Leben verloren" value1={p1.livesLost} value2={p2.livesLost} higherIsBetter={false} />
          <VersusBar label="Leben geheilt" value1={p1.livesHealed} value2={p2.livesHealed} />
          <VersusBar label="Darts ges." value1={p1.totalDarts} value2={p2.totalDarts} isLast />
        </div>

        {/* Letzte 5 Spiele */}
        {renderLast5KillerMatches()}
      </>
    )
  }

  // Letzte 5 Killer H2H-Matches rendern
  const renderLast5KillerMatches = () => {
    if (!killerH2H || killerH2H.matchesPlayed === 0) return null

    const matches = killerH2H.h2hMatches
      .slice()
      .sort((a, b) => {
        const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0
        const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0
        return dateB - dateA
      })
      .slice(0, 5)

    if (matches.length === 0) return null

    return (
      <div style={s.statsCardLast}>
        <div style={s.statsCardTitle as React.CSSProperties}>Letzte Spiele</div>
        {matches.map((match, idx) => {
          const winnerId = match.winnerId
          const winnerProfile = winnerId === player1Id ? player1 : winnerId === player2Id ? player2 : null
          const dateStr = match.createdAt
            ? new Date(match.createdAt).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
            : '—'

          // Platzierungen aus finalStandings
          const p1Standing = match.finalStandings?.find(s => s.playerId === player1Id)
          const p2Standing = match.finalStandings?.find(s => s.playerId === player2Id)

          return (
            <div
              key={match.id || idx}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 0',
                borderBottom: idx < matches.length - 1 ? '1px solid #F3F4F6' : 'none',
              }}
            >
              <span style={{ fontSize: 12, color: '#6B7280', minWidth: 80 }}>
                {dateStr}
              </span>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{
                  fontSize: 14,
                  fontWeight: winnerId === player1Id ? 700 : 500,
                  color: winnerId === player1Id ? (player1?.color || '#3B82F6') : '#9CA3AF',
                }}>
                  {player1?.name?.substring(0, 10)} #{p1Standing?.position ?? '?'}
                </span>
                <span style={{
                  fontSize: 14,
                  color: '#6B7280',
                }}>
                  vs
                </span>
                <span style={{
                  fontSize: 14,
                  fontWeight: winnerId === player2Id ? 700 : 500,
                  color: winnerId === player2Id ? (player2?.color || '#EF4444') : '#9CA3AF',
                }}>
                  {player2?.name?.substring(0, 10)} #{p2Standing?.position ?? '?'}
                </span>
              </div>

              <span style={{
                width: 10,
                height: 10,
                borderRadius: 9999,
                background: winnerProfile?.color || '#9CA3AF',
              }} />
            </div>
          )
        })}
      </div>
    )
  }

  // Letzte 5 CTF H2H-Matches rendern
  const renderLast5CTFMatches = () => {
    if (!ctfH2H || ctfH2H.matchesPlayed === 0) return null

    const matches = ctfH2H.h2hMatches
      .slice()
      .sort((a, b) => {
        const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0
        const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0
        return dateB - dateA
      })
      .slice(0, 5)

    if (matches.length === 0) return null

    return (
      <div style={s.statsCardLast}>
        <div style={s.statsCardTitle as React.CSSProperties}>Letzte Spiele</div>
        {matches.map((match, idx) => {
          const winnerId = match.winnerId
          const winnerProfile = winnerId === player1Id ? player1 : winnerId === player2Id ? player2 : null
          const dateStr = match.createdAt
            ? new Date(match.createdAt).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
            : '—'

          // Felder gewonnen
          let p1Fields = 0
          let p2Fields = 0
          for (const ev of match.events) {
            if (ev.type === 'CTFRoundFinished') {
              if (ev.winnerId === player1Id) p1Fields++
              if (ev.winnerId === player2Id) p2Fields++
            }
          }

          return (
            <div
              key={match.id || idx}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 0',
                borderBottom: idx < matches.length - 1 ? '1px solid #F3F4F6' : 'none',
              }}
            >
              {/* Datum */}
              <span style={{ fontSize: 12, color: '#6B7280', minWidth: 80 }}>
                {dateStr}
              </span>

              {/* Ergebnis */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{
                  fontSize: 14,
                  fontWeight: winnerId === player1Id ? 700 : 500,
                  color: winnerId === player1Id ? (player1?.color || '#3B82F6') : '#9CA3AF',
                }}>
                  {player1?.name?.substring(0, 10)}
                </span>
                <span style={{
                  fontSize: 16,
                  fontWeight: 700,
                  color: '#111',
                  padding: '2px 8px',
                  background: '#F3F4F6',
                  borderRadius: 4,
                }}>
                  {p1Fields} : {p2Fields}
                </span>
                <span style={{
                  fontSize: 14,
                  fontWeight: winnerId === player2Id ? 700 : 500,
                  color: winnerId === player2Id ? (player2?.color || '#EF4444') : '#9CA3AF',
                }}>
                  {player2?.name?.substring(0, 10)}
                </span>
              </div>

              {/* Sieger-Indikator */}
              <span style={{
                width: 10,
                height: 10,
                borderRadius: 9999,
                background: winnerProfile?.color || '#9CA3AF',
              }} />
            </div>
          )
        })}
      </div>
    )
  }

  // ======== MULTI-LINE CHART KOMPONENTE ========
  type PlayerTrend = {
    playerId: string
    name: string
    color: string
    values: number[]
  }

  const MultiLineChart = ({
    players,
    width = 360,
    height = 220,
    format = 'decimal',
  }: {
    players: PlayerTrend[]
    width?: number
    height?: number
    format?: 'decimal' | 'percent'
  }) => {
    if (players.length === 0 || players.every(p => p.values.length === 0)) {
      return (
        <div style={{
          width,
          height,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#9CA3AF',
          fontSize: 13,
          background: '#fafafa',
          borderRadius: 8,
        }}>
          Keine Daten verfügbar
        </div>
      )
    }

    // Alle Werte sammeln für Min/Max
    const allValues = players.flatMap(p => p.values).filter(v => isFinite(v))
    if (allValues.length === 0) {
      return (
        <div style={{
          width,
          height,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#9CA3AF',
          fontSize: 13,
          background: '#fafafa',
          borderRadius: 8,
        }}>
          Keine Daten verfügbar
        </div>
      )
    }

    const minVal = Math.min(...allValues)
    const maxVal = Math.max(...allValues)
    const span = maxVal - minVal || 1
    const maxLen = Math.max(...players.map(p => p.values.length))

    // Padding für Achsen-Labels
    const padLeft = 50
    const padRight = 15
    const padTop = 20
    const padBottom = 35

    const innerW = width - padLeft - padRight
    const innerH = height - padTop - padBottom

    // Formatierung für Y-Achse Labels
    const formatYLabel = (v: number): string => {
      if (format === 'percent') return `${(v * 100).toFixed(0)}%`
      return v.toFixed(1)
    }

    // Y-Achsen Schritte (5 Labels für bessere Übersicht)
    const yLabels = Array.from({ length: 5 }, (_, i) => minVal + (span * i) / 4)

    return (
      <div style={{ background: '#fafafa', width: '100%', overflow: 'hidden' }}>
        <svg width={width} height={height} style={{ display: 'block' }}>
          {/* Hintergrund-Gitter mit 5 Linien */}
          {yLabels.map((yVal, i) => {
            const y = padTop + innerH * (1 - (yVal - minVal) / span)
            return (
              <g key={i}>
                <line
                  x1={padLeft}
                  y1={y}
                  x2={width - padRight}
                  y2={y}
                  stroke={i === 0 ? '#e5e7eb' : '#f3f4f6'}
                  strokeWidth={1}
                  strokeDasharray={i === 0 ? 'none' : '4,4'}
                />
                <text
                  x={padLeft - 8}
                  y={y + 4}
                  fontSize={11}
                  fill="#6b7280"
                  textAnchor="end"
                  fontWeight={500}
                >
                  {formatYLabel(yVal)}
                </text>
              </g>
            )
          })}

          {/* X-Achsen-Linie */}
          <line
            x1={padLeft}
            y1={height - padBottom}
            x2={width - padRight}
            y2={height - padBottom}
            stroke="#e5e7eb"
            strokeWidth={1}
          />

          {/* X-Achse Labels mit mehr Punkten */}
          {maxLen > 0 && (
            <>
              <text x={padLeft} y={height - 12} fontSize={10} fill="#9CA3AF" textAnchor="start">1</text>
              {maxLen > 4 && (
                <text
                  x={padLeft + innerW * 0.25}
                  y={height - 12}
                  fontSize={10}
                  fill="#9CA3AF"
                  textAnchor="middle"
                >
                  {Math.round(maxLen * 0.25)}
                </text>
              )}
              {maxLen > 2 && (
                <text
                  x={padLeft + innerW / 2}
                  y={height - 12}
                  fontSize={10}
                  fill="#9CA3AF"
                  textAnchor="middle"
                >
                  {Math.ceil(maxLen / 2)}
                </text>
              )}
              {maxLen > 4 && (
                <text
                  x={padLeft + innerW * 0.75}
                  y={height - 12}
                  fontSize={10}
                  fill="#9CA3AF"
                  textAnchor="middle"
                >
                  {Math.round(maxLen * 0.75)}
                </text>
              )}
              <text x={padLeft + innerW} y={height - 12} fontSize={10} fill="#9CA3AF" textAnchor="end">
                {maxLen}
              </text>
            </>
          )}

          {/* Bereichsfüllung unter den Linien (halbtransparent) */}
          {(() => {
            const stepX = maxLen > 1 ? innerW / (maxLen - 1) : 0
            const baseY = padTop + innerH

            return players.map((player) => {
              if (player.values.length === 0) return null

              const areaPoints = player.values.map((v, i) => {
                const x = padLeft + i * stepX
                const y = padTop + innerH * (1 - (v - minVal) / span)
                return `${x},${y}`
              })

              // Schließen des Pfads nach unten
              const lastX = padLeft + (player.values.length - 1) * stepX
              const firstX = padLeft
              const areaPath = `${areaPoints.join(' ')} ${lastX},${baseY} ${firstX},${baseY}`

              return (
                <polygon
                  key={`area-${player.playerId}`}
                  points={areaPath}
                  fill={player.color}
                  fillOpacity={0.1}
                />
              )
            })
          })()}

          {/* Spieler-Kurven - alle auf derselben Zeitachse (maxLen) */}
          {(() => {
            const stepX = maxLen > 1 ? innerW / (maxLen - 1) : 0

            return players.map((player) => {
              if (player.values.length === 0) return null

              const pts = player.values.map((v, i) => {
                const x = padLeft + i * stepX
                const y = padTop + innerH * (1 - (v - minVal) / span)
                return `${x},${y}`
              }).join(' ')

              return (
                <polyline
                  key={player.playerId}
                  points={pts}
                  fill="none"
                  stroke={player.color}
                  strokeWidth={3}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )
            })
          })()}

          {/* Punkte an den Endpunkten - größer */}
          {(() => {
            const stepX = maxLen > 1 ? innerW / (maxLen - 1) : 0

            return players.map((player) => {
              if (player.values.length === 0) return null
              const lastVal = player.values[player.values.length - 1]
              const x = padLeft + (player.values.length - 1) * stepX
              const y = padTop + innerH * (1 - (lastVal - minVal) / span)

              return (
                <g key={`dot-${player.playerId}`}>
                  {/* Weißer Rand für bessere Sichtbarkeit */}
                  <circle
                    cx={x}
                    cy={y}
                    r={6}
                    fill="white"
                    stroke={player.color}
                    strokeWidth={2}
                  />
                  <circle
                    cx={x}
                    cy={y}
                    r={3}
                    fill={player.color}
                  />
                </g>
              )
            })
          })()}
        </svg>

        {/* Legende */}
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 12,
          marginTop: 8,
          justifyContent: 'center',
        }}>
          {players.map(player => (
            <div key={player.playerId} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{
                width: 10,
                height: 10,
                borderRadius: 9999,
                background: player.color,
              }} />
              <span style={{ fontSize: 12, color: '#374151', fontWeight: 500 }}>
                {player.name}
              </span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // Spieler-Toggle für Vergleiche
  const togglePlayerSelection = (playerId: string) => {
    setSelectedPlayerIds(prev =>
      prev.includes(playerId)
        ? prev.filter(id => id !== playerId)
        : [...prev, playerId]
    )
  }

  // ======== MENU VIEW ========
  if (view === 'menu') {
    const menuItems: PickerItem[] = [
      { id: 'h2h', label: 'Head-to-Head', sub: 'Direktvergleich zwischen zwei Spielern' },
      { id: 'compare', label: 'Trend-Vergleich', sub: 'Spieler-Entwicklung über Zeit vergleichen' },
    ]

    const handleMenuConfirm = (index: number) => {
      setView(menuItems[index].id as DashboardView)
    }

    return (
      <div style={{ ...styles.page, display: 'flex', flexDirection: 'column', minHeight: '100dvh' }}>
        <div style={{ height: 60 }} />
        <div style={{ flex: 1, display: 'grid', placeItems: 'center' }}>
          {isArcade ? (
            <div style={{ display: 'grid', gap: 12, width: 'min(480px, 92vw)' }}>
              <h1 style={{ margin: 0, color: colors.fg, textAlign: 'center' }}>Vergleiche</h1>
              <ArcadeScrollPicker
                items={menuItems}
                selectedIndex={menuPickerIndex}
                onChange={setMenuPickerIndex}
                onConfirm={handleMenuConfirm}
                colors={colors}
              />
            </div>
          ) : (
            <div style={styles.centerInner}>
              <h1 style={{ margin: 0, color: colors.fg, textAlign: 'center' }}>Vergleiche</h1>
              <div style={styles.card}>
                <div style={{ display: 'grid', gap: 8 }}>
                  <button onClick={() => setView('h2h')} style={styles.tile}>
                    <div style={styles.title}>Head-to-Head</div>
                    <div style={styles.sub}>Direktvergleich zwischen zwei Spielern</div>
                  </button>

                  <button onClick={() => setView('compare')} style={styles.tile}>
                    <div style={styles.title}>Trend-Vergleich</div>
                    <div style={styles.sub}>Spieler-Entwicklung über Zeit vergleichen</div>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        <div style={{ textAlign: 'center', padding: '12px 0' }}>
          <button style={styles.backBtn} onClick={onBack}>← Zurück</button>
        </div>
      </div>
    )
  }

  // ======== HEAD-TO-HEAD VIEW ========
  if (view === 'h2h') {
    return (
      <div style={s.shell}>
        <div style={s.headerNav}>
          <button style={s.backBtn} onClick={() => setView('menu')}>← Zurück</button>
          <div style={s.pageTitle as React.CSSProperties}>Head-to-Head</div>
          <div style={s.spacer} />
        </div>

        <div style={s.contentBox}>
          {/* Spieler-Auswahl */}
          {profiles.length < 2 ? (
            <div style={s.emptyState as React.CSSProperties}>
              <div style={s.emptyStateTitle}>Mindestens 2 Spieler benötigt</div>
              <div style={s.emptyStateSub as React.CSSProperties}>
                Erstelle Profile im Hauptmenü.
              </div>
            </div>
          ) : (
            <>
              <div style={s.selectionArea}>
                <div style={s.selectionRow}>
                  <div style={s.selectWrapper as React.CSSProperties}>
                    <label style={s.selectLabel as React.CSSProperties}>Spieler 1</label>
                    <select
                      style={s.select}
                      value={player1Id}
                      onChange={e => setPlayer1Id(e.target.value)}
                    >
                      <option value="">Wählen...</option>
                      {profiles.map(p => (
                        <option key={p.id} value={p.id} disabled={p.id === player2Id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div style={s.vsText}>VS</div>

                  <div style={s.selectWrapper as React.CSSProperties}>
                    <label style={s.selectLabel as React.CSSProperties}>Spieler 2</label>
                    <select
                      style={s.select}
                      value={player2Id}
                      onChange={e => setPlayer2Id(e.target.value)}
                    >
                      <option value="">Wählen...</option>
                      {profiles.map(p => (
                        <option key={p.id} value={p.id} disabled={p.id === player1Id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Modus-Auswahl */}
                <div style={s.modeTabs}>
                  <button style={s.modeTab(gameMode === 'x01')} onClick={() => setGameMode('x01')}>
                    X01
                  </button>
                  <button style={s.modeTab(gameMode === '121')} onClick={() => setGameMode('121')}>
                    121
                  </button>
                  <button style={s.modeTab(gameMode === 'cricket')} onClick={() => setGameMode('cricket')}>
                    Cricket
                  </button>
                  <button style={s.modeTab(gameMode === 'atb')} onClick={() => setGameMode('atb')}>
                    ATB
                  </button>
                  <button style={s.modeTab(gameMode === 'ctf')} onClick={() => setGameMode('ctf')}>
                    CTF
                  </button>
                  <button style={s.modeTab(gameMode === 'shanghai')} onClick={() => setGameMode('shanghai')}>
                    Shanghai
                  </button>
                  <button style={s.modeTab(gameMode === 'killer')} onClick={() => setGameMode('killer')}>
                    Killer
                  </button>
                </div>
              </div>

              {/* Bilanz */}
              {player1Id && player2Id && player1 && player2 && currentH2H && currentH2H.matchesPlayed > 0 && (
                <div style={s.bilanzArea as React.CSSProperties}>
                  <div style={s.bilanzLabel}>Bilanz ({gameMode === 'x01' ? 'X01' : gameMode === '121' ? '121' : gameMode === 'cricket' ? 'Cricket' : gameMode === 'ctf' ? 'CTF' : gameMode === 'shanghai' ? 'Shanghai' : gameMode === 'killer' ? 'Killer' : 'ATB'})</div>
                  <div style={s.bilanzScore}>
                    <span style={s.bilanzDot(player1.color)} />
                    <span style={s.bilanzName}>{player1.name}</span>
                    <span style={s.bilanzNum}>
                      {gameMode === 'x01' ? x01H2H?.player1Wins : gameMode === '121' ? h2h121?.player1Wins : gameMode === 'cricket' ? cricketH2H?.player1Wins : gameMode === 'ctf' ? ctfH2H?.player1Wins : gameMode === 'shanghai' ? shanghaiH2H?.player1Wins : gameMode === 'killer' ? killerH2H?.player1Wins : atbH2H?.player1Wins}
                    </span>
                    <span style={s.bilanzColon}>:</span>
                    <span style={s.bilanzNum}>
                      {gameMode === 'x01' ? x01H2H?.player2Wins : gameMode === '121' ? h2h121?.player2Wins : gameMode === 'cricket' ? cricketH2H?.player2Wins : gameMode === 'ctf' ? ctfH2H?.player2Wins : gameMode === 'shanghai' ? shanghaiH2H?.player2Wins : gameMode === 'killer' ? killerH2H?.player2Wins : atbH2H?.player2Wins}
                    </span>
                    <span style={s.bilanzName}>{player2.name}</span>
                    <span style={s.bilanzDot(player2.color)} />
                  </div>
                </div>
              )}

              {/* H2H Siegverteilung Donut */}
              {player1Id && player2Id && player1 && player2 && currentH2H && currentH2H.matchesPlayed > 0 && (
                <div style={{ padding: '16px 24px', borderBottom: `1px solid ${colors.border}`, display: 'flex', justifyContent: 'center' }}>
                  <PieChart
                    data={[
                      { label: player1.name, value: currentH2H.player1Wins, color: player1.color || '#3B82F6' },
                      { label: player2.name, value: currentH2H.player2Wins, color: player2.color || '#EF4444' },
                    ]}
                    size={110}
                    strokeWidth={20}
                    donut
                  />
                </div>
              )}

              {/* H2H pro Modus - Balkenvergleich */}
              {player1Id && player2Id && player1 && player2 && (() => {
                const modeData: { label: string; p1: number; p2: number }[] = []
                if (x01H2H && x01H2H.matchesPlayed > 0) modeData.push({ label: 'X01', p1: x01H2H.player1Wins, p2: x01H2H.player2Wins })
                if (h2h121 && h2h121.legsPlayed > 0) modeData.push({ label: '121', p1: h2h121.player1Wins, p2: h2h121.player2Wins })
                if (cricketH2H && cricketH2H.matchesPlayed > 0) modeData.push({ label: 'Cricket', p1: cricketH2H.player1Wins, p2: cricketH2H.player2Wins })
                if (atbH2H && atbH2H.matchesPlayed > 0) modeData.push({ label: 'ATB', p1: atbH2H.player1Wins, p2: atbH2H.player2Wins })
                if (ctfH2H && ctfH2H.matchesPlayed > 0) modeData.push({ label: 'CTF', p1: ctfH2H.player1Wins, p2: ctfH2H.player2Wins })
                if (shanghaiH2H && shanghaiH2H.matchesPlayed > 0) modeData.push({ label: 'Shanghai', p1: shanghaiH2H.player1Wins, p2: shanghaiH2H.player2Wins })
                if (killerH2H && killerH2H.matchesPlayed > 0) modeData.push({ label: 'Killer', p1: killerH2H.player1Wins, p2: killerH2H.player2Wins })

                if (modeData.length < 2) return null

                const color1 = player1.color || '#3B82F6'
                const color2 = player2.color || '#EF4444'
                const maxVal = Math.max(...modeData.map(d => Math.max(d.p1, d.p2)), 1)

                return (
                  <div style={{ padding: 16, borderBottom: `1px solid ${colors.border}` }}>
                    <div style={{
                      fontSize: 13, fontWeight: 700, color: colors.fgMuted, marginBottom: 12,
                      textTransform: 'uppercase', letterSpacing: '0.05em',
                    }}>Siege pro Modus</div>

                    {/* Legende */}
                    <div style={{ display: 'flex', gap: 16, marginBottom: 12, fontSize: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ width: 10, height: 10, borderRadius: 2, background: color1, display: 'inline-block' }} />
                        {player1.name}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ width: 10, height: 10, borderRadius: 2, background: color2, display: 'inline-block' }} />
                        {player2.name}
                      </div>
                    </div>

                    {/* Grouped Bars */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {modeData.map(d => (
                        <div key={d.label}>
                          <div style={{ fontSize: 12, color: colors.fgMuted, marginBottom: 4 }}>{d.label}</div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <div style={{ flex: 1, height: 12, background: '#f3f4f6', borderRadius: 6, overflow: 'hidden' }}>
                                <div style={{
                                  width: `${(d.p1 / maxVal) * 100}%`, height: '100%',
                                  background: color1, borderRadius: 6, transition: 'width 0.3s ease',
                                  minWidth: d.p1 > 0 ? 4 : 0,
                                }} />
                              </div>
                              <span style={{ fontSize: 12, fontWeight: 600, color: color1, minWidth: 20, textAlign: 'right' }}>{d.p1}</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <div style={{ flex: 1, height: 12, background: '#f3f4f6', borderRadius: 6, overflow: 'hidden' }}>
                                <div style={{
                                  width: `${(d.p2 / maxVal) * 100}%`, height: '100%',
                                  background: color2, borderRadius: 6, transition: 'width 0.3s ease',
                                  minWidth: d.p2 > 0 ? 4 : 0,
                                }} />
                              </div>
                              <span style={{ fontSize: 12, fontWeight: 600, color: color2, minWidth: 20, textAlign: 'right' }}>{d.p2}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })()}

              {/* Stats */}
              {player1Id && player2Id && (
                gameMode === 'x01' ? renderX01Stats() : gameMode === '121' ? render121Stats() : gameMode === 'cricket' ? renderCricketStats() : gameMode === 'ctf' ? renderCTFStats() : gameMode === 'shanghai' ? renderShanghaiStats() : gameMode === 'killer' ? renderKillerStats() : renderATBStats()
              )}

              {/* Empty State */}
              {(!player1Id || !player2Id) && (
                <div style={s.emptyState as React.CSSProperties}>
                  <div style={s.emptyStateTitle}>Spieler auswählen</div>
                  <div style={s.emptyStateSub as React.CSSProperties}>
                    Wähle zwei Spieler aus, um den Vergleich zu sehen.
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    )
  }

  // ======== COMPARE (TREND-VERGLEICH) VIEW ========
  const currentMetric = AVAILABLE_METRICS.find(m => m.id === selectedMetric)

  return (
    <div style={s.shellWide}>
      <div style={s.headerNav}>
        <button style={s.backBtn} onClick={() => setView('menu')}>← Zurück</button>
        <div style={s.pageTitle as React.CSSProperties}>Trend-Vergleich</div>
        <div style={s.spacer} />
      </div>

      <div ref={trendChartCallbackRef} style={s.contentBox}>
        {/* Spieler-Auswahl mit Checkboxen */}
        <div style={s.sectionTitle as React.CSSProperties}>Spieler auswählen</div>
        <div style={{ padding: 16, borderBottom: '1px solid #E5E7EB' }}>
          {profiles.length === 0 ? (
            <div style={{ color: '#9CA3AF', fontSize: 13, textAlign: 'center', padding: 12 }}>
              Keine Spieler-Profile vorhanden
            </div>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {profiles.map((p, idx) => {
                const isSelected = selectedPlayerIds.includes(p.id)
                const playerColor = p.color || PLAYER_COLORS[idx % PLAYER_COLORS.length]
                return (
                  <button
                    key={p.id}
                    onClick={() => togglePlayerSelection(p.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '8px 14px',
                      borderRadius: 8,
                      border: isSelected ? `2px solid ${playerColor}` : '2px solid #E5E7EB',
                      background: isSelected ? `${playerColor}15` : '#fff',
                      cursor: 'pointer',
                      transition: 'all .15s',
                    }}
                  >
                    <span style={{
                      width: 14,
                      height: 14,
                      borderRadius: 4,
                      border: isSelected ? 'none' : '2px solid #D1D5DB',
                      background: isSelected ? playerColor : '#fff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#fff',
                      fontSize: 10,
                      fontWeight: 700,
                    }}>
                      {isSelected && '✓'}
                    </span>
                    <span style={{
                      fontSize: 14,
                      fontWeight: isSelected ? 600 : 500,
                      color: isSelected ? '#111' : '#6B7280',
                    }}>
                      {p.name}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Metrik-Auswahl */}
        <div style={s.sectionTitle as React.CSSProperties}>Metrik</div>
        <div style={{ padding: 16, borderBottom: '1px solid #E5E7EB' }}>
          <select
            value={selectedMetric}
            onChange={e => setSelectedMetric(e.target.value as MetricId)}
            style={{
              ...s.select,
              maxWidth: 280,
            }}
          >
            <optgroup label="X01">
              {AVAILABLE_METRICS.filter(m => m.mode === 'x01').map(m => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </optgroup>
            <optgroup label="Cricket">
              {AVAILABLE_METRICS.filter(m => m.mode === 'cricket').map(m => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </optgroup>
            <optgroup label="Around the Block">
              {AVAILABLE_METRICS.filter(m => m.mode === 'atb').map(m => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </optgroup>
            <optgroup label="Capture the Field">
              {AVAILABLE_METRICS.filter(m => m.mode === 'ctf').map(m => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </optgroup>
            <optgroup label="Sträußchen">
              {AVAILABLE_METRICS.filter(m => m.mode === 'str').map(m => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </optgroup>
            <optgroup label="Highscore">
              {AVAILABLE_METRICS.filter(m => m.mode === 'highscore').map(m => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </optgroup>
            <optgroup label="Shanghai">
              {AVAILABLE_METRICS.filter(m => m.mode === 'shanghai').map(m => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </optgroup>
            <optgroup label="Killer">
              {AVAILABLE_METRICS.filter(m => m.mode === 'killer').map(m => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </optgroup>
          </select>
        </div>

        {/* Match-Anzahl Auswahl */}
        <div style={s.sectionTitle as React.CSSProperties}>Anzahl Matches</div>
        <div style={{ padding: 16, borderBottom: '1px solid #E5E7EB' }}>
          <div style={{ display: 'flex', gap: 8 }}>
            {MATCH_LIMIT_OPTIONS.map(num => (
              <button
                key={num}
                onClick={() => setMatchLimit(num)}
                style={{
                  padding: '8px 16px',
                  borderRadius: 8,
                  border: matchLimit === num ? '2px solid #0ea5e9' : '2px solid #E5E7EB',
                  background: matchLimit === num ? '#e0f2fe' : '#fff',
                  color: matchLimit === num ? '#0369a1' : '#374151',
                  cursor: 'pointer',
                  fontWeight: 600,
                  fontSize: 14,
                  transition: 'all .15s',
                }}
              >
                {num}
              </button>
            ))}
          </div>
        </div>

        {/* Filter: Nur Mehrspieler */}
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #E5E7EB' }}>
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              cursor: 'pointer',
              fontSize: 14,
              color: multiplayerOnly ? '#0369a1' : '#374151',
              fontWeight: multiplayerOnly ? 600 : 500,
            }}
          >
            <span style={{
              width: 18,
              height: 18,
              borderRadius: 4,
              border: multiplayerOnly ? '2px solid #0ea5e9' : '2px solid #D1D5DB',
              background: multiplayerOnly ? '#0ea5e9' : '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              fontSize: 12,
              fontWeight: 700,
              flexShrink: 0,
            }}>
              {multiplayerOnly && '\u2713'}
            </span>
            <input
              type="checkbox"
              checked={multiplayerOnly}
              onChange={e => setMultiplayerOnly(e.target.checked)}
              style={{ display: 'none' }}
            />
            Nur Mehrspieler-Partien
          </label>
        </div>

        {/* Diagramm */}
        <div style={s.sectionTitle as React.CSSProperties}>
          {currentMetric?.label || 'Trend'} ({{ x01: 'X01', cricket: 'Cricket', atb: 'ATB', ctf: 'CTF', str: 'Sträußchen', highscore: 'Highscore', shanghai: 'Shanghai', killer: 'Killer' }[currentMetric?.mode ?? 'x01']})
        </div>
        <div>
          {selectedPlayerIds.length === 0 ? (
            <div style={{ padding: 20, display: 'flex', justifyContent: 'center' }}>
              <div style={s.emptyState as React.CSSProperties}>
                <div style={s.emptyStateTitle}>Spieler auswählen</div>
                <div style={s.emptyStateSub as React.CSSProperties}>
                  Wähle mindestens einen Spieler aus, um den Trend zu sehen.
                </div>
              </div>
            </div>
          ) : (
            <MultiLineChart
              players={trendData}
              width={trendChartWidth - 2}
              height={200}
              format={currentMetric?.format || 'decimal'}
            />
          )}
        </div>

        {/* Info-Text */}
        <div style={{
          padding: '12px 16px',
          background: '#F9FAFB',
          borderTop: '1px solid #E5E7EB',
          fontSize: 12,
          color: '#6B7280',
          textAlign: 'center',
        }}>
          Zeigt die letzten {matchLimit} Spiele pro Spieler
        </div>
      </div>
    </div>
  )
}
