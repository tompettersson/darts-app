// src/screens/stats/StatsArea.tsx
// Komplett ausgelagerter Statistikbereich (Untermenü + Subscreens)
// App.tsx bleibt dadurch schlank.

import React, { useState, useEffect, useMemo, Suspense } from 'react'
import { ui, getThemedUI } from '../../ui'
import { useTheme } from '../../ThemeProvider'
import ArcadeScrollPicker, { type PickerItem } from '../../components/ArcadeScrollPicker'
import { getProfiles, type Profile } from '../../storage'
import { useSQLStats } from '../../hooks/useSQLStats'

// H2HState Type-Import (nur Typ, kein Code-Bundle)
import type { H2HState } from './StatsDashboard'

// Retry-wrapper for lazy imports — survives stale chunks after deployment
function lazyRetry<T extends { default: React.ComponentType<any> }>(
  factory: () => Promise<T>,
): React.LazyExoticComponent<T['default']> {
  return React.lazy(() =>
    factory().catch(() => {
      if ('caches' in window) caches.keys().then(ks => ks.forEach(k => caches.delete(k)))
      return factory().catch(() => { window.location.reload(); return factory() })
    }),
  )
}

// Lazy-loaded Screens (nur bei Bedarf geladen)
const StatsDashboard = lazyRetry(() => import('./StatsDashboard'))
const PlayersOverview = lazyRetry(() => import('./PlayersOverview'))
const StatsProfile = lazyRetry(() => import('../StatsProfile'))
const AdvancedStatsTab = lazyRetry(() => import('./AdvancedStatsTab'))
const MatchDetails = lazyRetry(() => import('../MatchDetails'))
const ATBMatchDetails = lazyRetry(() => import('../ATBMatchDetails'))
const StrMatchDetails = lazyRetry(() => import('../StrMatchDetails'))
const HighscoreMatchDetails = lazyRetry(() => import('../HighscoreMatchDetails'))
const CTFMatchDetails = lazyRetry(() => import('../CTFMatchDetails'))
const ShanghaiMatchDetails = lazyRetry(() => import('../ShanghaiMatchDetails'))
const KillerSummary = lazyRetry(() => import('../KillerSummary'))
const CricketMatchDetails = lazyRetry(() => import('../CricketMatchDetails'))
const Bobs27MatchDetails = lazyRetry(() => import('../Bobs27MatchDetails'))
const Bobs27LegSummary = lazyRetry(() => import('../Bobs27LegSummary'))
const OperationMatchDetails = lazyRetry(() => import('../OperationMatchDetails'))
const HallOfFame = lazyRetry(() => import('../HallOfFame'))
const MatchHistory = lazyRetry(() => import('../MatchHistory'))

type View =
  | 'stats-menu'
  | 'stats-dashboard'
  | 'match-history'
  | 'players-overview'
  | 'player-profile'
  | 'match-details'
  | 'atb-match-details'
  | 'cricket-match-details'
  | 'str-match-details'
  | 'highscore-match-details'
  | 'ctf-match-details'
  | 'shanghai-match-details'
  | 'killer-match-details'
  | 'bobs27-match-details'
  | 'bobs27-leg-summary'
  | 'operation-match-details'
  | 'hall-of-fame'
  | 'erfolge'

type Props = {
  onBackToMenu: () => void
  onOpenCricketMatch: (id: string, returnView?: View) => void // Cricket-Summary läuft weiterhin über App.tsx
  initialView?: View // Für Navigation zurück aus Cricket-Summary
  onInitialViewUsed?: () => void // Callback um initialView zu resetten
}

export default function StatsArea({ onBackToMenu, onOpenCricketMatch, initialView, onInitialViewUsed }: Props) {
  // Theme System
  const { isArcade, colors } = useTheme()
  const styles = useMemo(() => getThemedUI(colors, isArcade), [colors, isArcade])

  const [view, setView] = useState<View>(initialView || 'stats-menu')
  const [statsPickerIndex, setStatsPickerIndex] = useState(0)

  const [detailMatchId, setDetailMatchId] = useState<string | undefined>(undefined)
  const [atbDetailMatchId, setAtbDetailMatchId] = useState<string | undefined>(undefined)
  const [cricketDetailMatchId, setCricketDetailMatchId] = useState<string | undefined>(undefined)
  const [strDetailMatchId, setStrDetailMatchId] = useState<string | undefined>(undefined)
  const [highscoreDetailMatchId, setHighscoreDetailMatchId] = useState<string | undefined>(undefined)
  const [ctfDetailMatchId, setCtfDetailMatchId] = useState<string | undefined>(undefined)
  const [shanghaiDetailMatchId, setShanghaiDetailMatchId] = useState<string | undefined>(undefined)
  const [killerDetailMatchId, setKillerDetailMatchId] = useState<string | undefined>(undefined)
  const [bobs27DetailMatchId, setBobs27DetailMatchId] = useState<string | undefined>(undefined)
  const [bobs27LegSummaryLeg, setBobs27LegSummaryLeg] = useState<number | undefined>(undefined)
  const [operationDetailMatchId, setOperationDetailMatchId] = useState<string | undefined>(undefined)
  const [playerProfileId, setPlayerProfileId] = useState<string | undefined>(undefined)

  // Speichert wohin "Zurück" bei Match-Details führen soll
  const [returnFromMatchDetails, setReturnFromMatchDetails] = useState<View>('match-history')

  // H2H State (bleibt erhalten beim Navigieren zu Match-Details)
  const [h2hState, setH2HState] = useState<H2HState>({
    view: 'menu',
    gameMode: 'x01',
    player1Id: '',
    player2Id: '',
  })

  // Backspace-Navigation: einen Menüpunkt zurück
  useEffect(() => {
    const handleBackspace = (e: KeyboardEvent) => {
      if (e.key !== 'Backspace' && e.key !== 'Escape') return
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return

      e.preventDefault()
      if (view === 'stats-menu') {
        onBackToMenu()
      } else if (view === 'match-details' || view === 'atb-match-details' || view === 'cricket-match-details' || view === 'str-match-details' || view === 'highscore-match-details' || view === 'ctf-match-details' || view === 'shanghai-match-details' || view === 'killer-match-details' || view === 'bobs27-match-details' || view === 'operation-match-details') {
        setView(returnFromMatchDetails)
      } else if (view === 'bobs27-leg-summary') {
        setView('bobs27-match-details')
      } else {
        setView('stats-menu')
      }
    }

    window.addEventListener('keydown', handleBackspace)
    return () => window.removeEventListener('keydown', handleBackspace)
  }, [view, onBackToMenu, returnFromMatchDetails])

  // Wenn initialView sich ändert (z.B. bei Rückkehr aus Cricket-Summary), View aktualisieren
  useEffect(() => {
    if (initialView) {
      setView(initialView)
      // Signal dass initialView verwendet wurde, damit App.tsx ihn resetten kann
      onInitialViewUsed?.()
    }
  }, [initialView, onInitialViewUsed])

  // ---------- STATS UNTERMENÜ ----------
  if (view === 'stats-menu') {
    const statsItems: PickerItem[] = [
      { id: 'stats-dashboard', label: 'Vergleiche', sub: 'Head-to-Head, Spielervergleich', icon: <span style={{ fontSize: 22 }}>{'\u2694'}</span> },
      { id: 'match-history', label: 'Matchhistorie', sub: 'Alle gespielten Matches', icon: <span style={{ fontSize: 22 }}>{'\uD83D\uDCCB'}</span> },
      { id: 'player-profile', label: 'Spieler', sub: 'Statistiken pro Spieler', icon: <span style={{ fontSize: 22 }}>{'\uD83D\uDC64'}</span> },
      { id: 'hall-of-fame', label: 'Highscores', sub: 'Hall of Fame / Leaderboards', icon: <span style={{ fontSize: 22 }}>{'\uD83C\uDFC6'}</span> },
      { id: 'erfolge', label: 'Erfolge', sub: 'Achievements & Fortschritt', icon: <span style={{ fontSize: 22 }}>{'\u2B50'}</span> },
    ]

    const handleStatsConfirm = (index: number) => {
      setView(statsItems[index].id as View)
    }

    return (
      <div style={{ ...styles.page, display: 'flex', flexDirection: 'column', minHeight: '100dvh' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px 0' }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: colors.fg }}>Statistiken</h2>
          <button style={styles.backBtn} onClick={onBackToMenu}>← Zurück</button>
        </div>
        <div style={{ height: 20 }} />
        <div style={{ flex: 1, display: 'grid', placeItems: 'center' }}>
          {isArcade ? (
            <div style={{ display: 'grid', gap: 12, width: 'min(480px, 92vw)' }}>
              <h1 style={{ margin: 0, color: colors.fg, textAlign: 'center' }}>Statistiken</h1>
              <ArcadeScrollPicker
                items={statsItems}
                selectedIndex={statsPickerIndex}
                onChange={setStatsPickerIndex}
                onConfirm={handleStatsConfirm}
                colors={colors}
              />
            </div>
          ) : (
            <div style={styles.centerInner}>
              <h1 style={{ margin: 0, color: colors.fg, textAlign: 'center' }}>Statistiken</h1>
              <div style={styles.card}>
                <div style={{ display: 'grid', gap: 8 }}>
                  {([
                    { id: 'stats-dashboard', icon: '\u2694', color: '#3b82f6', title: 'Vergleiche', sub: 'Head-to-Head, Spielervergleich' },
                    { id: 'match-history', icon: '\u{1F4CB}', color: '#8b5cf6', title: 'Matchhistorie', sub: 'Alle gespielten Matches' },
                    { id: 'player-profile', icon: '\u{1F464}', color: '#10b981', title: 'Spieler', sub: 'Statistiken pro Spieler' },
                    { id: 'hall-of-fame', icon: '\u{1F3C6}', color: '#FFD700', title: 'Highscores', sub: 'Hall of Fame / Leaderboards' },
                    { id: 'erfolge', icon: '\u2B50', color: '#f59e0b', title: 'Erfolge', sub: 'Achievements & Fortschritt' },
                  ] as const).map(item => (
                    <button key={item.id} onClick={() => setView(item.id as View)} style={{
                      ...styles.tile,
                      borderLeft: `4px solid ${item.color}`,
                      display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px',
                    }}>
                      <span style={{ fontSize: 22, flexShrink: 0 }}>{item.icon}</span>
                      <div>
                        <div style={styles.title}>{item.title}</div>
                        <div style={styles.sub}>{item.sub}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ ...styles.sub, textAlign: 'center', marginTop: 8 }}>
                Profile & Backup findest du im Hauptmenü.
              </div>
            </div>
          )}
        </div>

      </div>
    )
  }

  // ---------- Suspense Fallback ----------
  const suspenseFallback = (
    <div style={{ ...styles.page, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '50vh' }}>
      <div style={{ color: colors.fgDim, fontSize: 14 }}>Laden...</div>
    </div>
  )

  // ---------- DASHBOARD ----------
  if (view === 'stats-dashboard') {
    return (
      <Suspense fallback={suspenseFallback}>
        <StatsDashboard
          onBack={() => setView('stats-menu')}
          onShowPlayer={(pid: string) => {
            setPlayerProfileId(pid)
            setView('player-profile')
          }}
          onOpenMatch={(id: string) => {
            setDetailMatchId(id)
            setReturnFromMatchDetails('stats-dashboard')
            setView('match-details')
          }}
          onOpenCricketMatch={(id: string) => {
            setCricketDetailMatchId(id)
            setReturnFromMatchDetails('stats-dashboard')
            setView('cricket-match-details')
          }}
          onOpenHallOfFame={() => {
            setView('hall-of-fame')
          }}
          h2hState={h2hState}
          onH2HStateChange={setH2HState}
        />
      </Suspense>
    )
  }

  // ---------- MATCH HISTORY ----------
  if (view === 'match-history') {
    return (
      <Suspense fallback={suspenseFallback}>
        <MatchHistory
          onBack={() => setView('stats-menu')}
          onOpenX01Match={(id: string) => {
            setDetailMatchId(id)
            setReturnFromMatchDetails('match-history')
            setView('match-details')
          }}
          onOpenCricketMatch={(id: string) => {
            setCricketDetailMatchId(id)
            setReturnFromMatchDetails('match-history')
            setView('cricket-match-details')
          }}
          onOpenATBMatch={(id: string) => {
            setAtbDetailMatchId(id)
            setReturnFromMatchDetails('match-history')
            setView('atb-match-details')
          }}
          onOpenStrMatch={(id: string) => {
            setStrDetailMatchId(id)
            setReturnFromMatchDetails('match-history')
            setView('str-match-details')
          }}
          onOpenHighscoreMatch={(id: string) => {
            setHighscoreDetailMatchId(id)
            setReturnFromMatchDetails('match-history')
            setView('highscore-match-details')
          }}
          onOpenCTFMatch={(id: string) => {
            setCtfDetailMatchId(id)
            setReturnFromMatchDetails('match-history')
            setView('ctf-match-details')
          }}
          onOpenShanghaiMatch={(id: string) => {
            setShanghaiDetailMatchId(id)
            setReturnFromMatchDetails('match-history')
            setView('shanghai-match-details')
          }}
          onOpenKillerMatch={(id: string) => {
            setKillerDetailMatchId(id)
            setReturnFromMatchDetails('match-history')
            setView('killer-match-details')
          }}
          onOpenBobs27Match={(id: string) => {
            setBobs27DetailMatchId(id)
            setReturnFromMatchDetails('match-history')
            setView('bobs27-match-details')
          }}
          onOpenOperationMatch={(id: string) => {
            setOperationDetailMatchId(id)
            setReturnFromMatchDetails('match-history')
            setView('operation-match-details')
          }}
        />
      </Suspense>
    )
  }

  // ---------- PLAYERS OVERVIEW ----------
  if (view === 'players-overview') {
    return (
      <Suspense fallback={suspenseFallback}>
        <div style={styles.page}>
          <div style={styles.headerRow}>
            <h2 style={{ margin: 0, color: colors.fg }}>Spielerübersicht</h2>
            <button style={styles.backBtn} onClick={() => setView('stats-menu')}>
              ← Zurück
            </button>
          </div>

          <div style={styles.centerPage}>
            <div style={styles.centerInnerWide}>
              <PlayersOverview
                onSelectPlayer={(pid: string) => {
                  setPlayerProfileId(pid)
                  setView('player-profile')
                }}
              />
            </div>
          </div>
        </div>
      </Suspense>
    )
  }

  // ---------- PLAYER PROFILE (neue StatsProfile Komponente) ----------
  if (view === 'player-profile') {
    return (
      <Suspense fallback={suspenseFallback}>
        <div style={styles.page}>
          <StatsProfile
            onBack={() => setView('stats-menu')}
            onOpenMatch={(matchId: string) => {
              setDetailMatchId(matchId)
              setReturnFromMatchDetails('player-profile')
              setView('match-details')
            }}
          />
        </div>
      </Suspense>
    )
  }

  // ---------- HALL OF FAME ----------
  if (view === 'hall-of-fame') {
    return <Suspense fallback={suspenseFallback}><HallOfFame onBack={() => setView('stats-menu')} /></Suspense>
  }

  // ---------- ERFOLGE (eigenständige Seite mit Spieler-Auswahl) ----------
  if (view === 'erfolge') {
    return (
      <Suspense fallback={suspenseFallback}>
        <ErfolgeStandalone onBack={() => setView('stats-menu')} />
      </Suspense>
    )
  }

  // ---------- MATCH DETAILS (X01) ----------
  if (view === 'match-details' && detailMatchId) {
    return <Suspense fallback={suspenseFallback}><MatchDetails matchId={detailMatchId} onBack={() => setView(returnFromMatchDetails)} /></Suspense>
  }

  // ---------- CRICKET MATCH DETAILS ----------
  if (view === 'cricket-match-details' && cricketDetailMatchId) {
    return <Suspense fallback={suspenseFallback}><CricketMatchDetails matchId={cricketDetailMatchId} onBack={() => setView(returnFromMatchDetails)} /></Suspense>
  }

  // ---------- ATB MATCH DETAILS ----------
  if (view === 'atb-match-details' && atbDetailMatchId) {
    return <Suspense fallback={suspenseFallback}><ATBMatchDetails matchId={atbDetailMatchId} onBack={() => setView(returnFromMatchDetails)} /></Suspense>
  }

  // ---------- STRÄUSSCHEN MATCH DETAILS ----------
  if (view === 'str-match-details' && strDetailMatchId) {
    return <Suspense fallback={suspenseFallback}><StrMatchDetails matchId={strDetailMatchId} onBack={() => setView(returnFromMatchDetails)} /></Suspense>
  }

  // ---------- HIGHSCORE MATCH DETAILS ----------
  if (view === 'highscore-match-details' && highscoreDetailMatchId) {
    return <Suspense fallback={suspenseFallback}><HighscoreMatchDetails matchId={highscoreDetailMatchId} onBack={() => setView(returnFromMatchDetails)} /></Suspense>
  }

  // ---------- CTF MATCH DETAILS ----------
  if (view === 'ctf-match-details' && ctfDetailMatchId) {
    return <Suspense fallback={suspenseFallback}><CTFMatchDetails matchId={ctfDetailMatchId} onBack={() => setView(returnFromMatchDetails)} /></Suspense>
  }

  // ---------- SHANGHAI MATCH DETAILS ----------
  if (view === 'shanghai-match-details' && shanghaiDetailMatchId) {
    return <Suspense fallback={suspenseFallback}><ShanghaiMatchDetails matchId={shanghaiDetailMatchId} onBack={() => setView(returnFromMatchDetails)} /></Suspense>
  }

  // ---------- KILLER MATCH DETAILS ----------
  if (view === 'killer-match-details' && killerDetailMatchId) {
    return <Suspense fallback={suspenseFallback}><KillerSummary matchId={killerDetailMatchId} onBack={() => setView(returnFromMatchDetails)} readOnly /></Suspense>
  }

  // ---------- BOB'S 27 MATCH DETAILS ----------
  if (view === 'bobs27-match-details' && bobs27DetailMatchId) {
    return <Suspense fallback={suspenseFallback}>
      <Bobs27MatchDetails
        matchId={bobs27DetailMatchId}
        onBack={() => setView(returnFromMatchDetails)}
        onOpenLegSummary={(_mid, legIdx) => {
          setBobs27LegSummaryLeg(legIdx)
          setView('bobs27-leg-summary')
        }}
      />
    </Suspense>
  }

  // ---------- BOB'S 27 LEG SUMMARY (aus History) ----------
  if (view === 'bobs27-leg-summary' && bobs27DetailMatchId && bobs27LegSummaryLeg !== undefined) {
    return <Suspense fallback={suspenseFallback}>
      <Bobs27LegSummary
        matchId={bobs27DetailMatchId}
        legIndex={bobs27LegSummaryLeg}
        onBack={() => setView('bobs27-match-details')}
      />
    </Suspense>
  }

  // ---------- OPERATION MATCH DETAILS ----------
  if (view === 'operation-match-details' && operationDetailMatchId) {
    return <Suspense fallback={suspenseFallback}><OperationMatchDetails matchId={operationDetailMatchId} onBack={() => setView(returnFromMatchDetails)} /></Suspense>
  }

  // Fallback
  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={{ fontWeight: 800 }}>StatsArea: Ungültiger Zustand</div>
        <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
          <button style={styles.backBtn} onClick={() => setView('stats-menu')}>Zum Stats-Menü</button>
          <button style={styles.backBtn} onClick={onBackToMenu}>Ins Menü</button>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// Eigenständige Erfolge-Seite (Spieler-Auswahl + Achievements)
// ============================================================================

const ERFOLGE_SHIMMER_CSS = `
@keyframes erfolge-shimmer {
  0% { background-position: -200% center; }
  100% { background-position: 200% center; }
}
@keyframes erfolge-sparkle {
  0%, 100% { opacity: 0.3; transform: scale(0.8); }
  50% { opacity: 1; transform: scale(1.2); }
}
`

function ErfolgeStandalone({ onBack }: { onBack: () => void }) {
  const { colors, isArcade } = useTheme()
  const styles = useMemo(() => getThemedUI(colors, isArcade), [colors, isArcade])
  const [profiles] = useState<Profile[]>(() => getProfiles())
  const [cursor, setCursor] = useState(0)

  const selected = profiles[cursor]
  const sqlStats = useSQLStats(selected?.id ?? '')

  const prev = () => setCursor(c => (c - 1 + profiles.length) % profiles.length)
  const next = () => setCursor(c => (c + 1) % profiles.length)

  const shimmerTitle: React.CSSProperties = {
    fontSize: 28,
    fontWeight: 900,
    letterSpacing: '0.02em',
    background: `linear-gradient(90deg, ${colors.accent}, #FFD700, ${colors.accent}, #FFD700, ${colors.accent})`,
    backgroundSize: '200% auto',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    backgroundClip: 'text',
    animation: 'erfolge-shimmer 3s linear infinite',
    display: 'inline-block',
  }

  const sparkle = (delay: number): React.CSSProperties => ({
    display: 'inline-block',
    animation: `erfolge-sparkle 2s ease-in-out ${delay}s infinite`,
    fontSize: 18,
    verticalAlign: 'middle',
    margin: '0 6px',
  })

  if (profiles.length === 0) {
    return (
      <div style={styles.page}>
        <div style={styles.headerRow}>
          <h2 style={{ margin: 0, color: colors.fg }}>Erfolge</h2>
          <button style={styles.backBtn} onClick={onBack}>\u2190 Zurück</button>
        </div>
        <div style={{ padding: 40, textAlign: 'center', color: colors.fgDim }}>
          Keine Spieler vorhanden. Erstelle zuerst ein Profil.
        </div>
      </div>
    )
  }

  return (
    <div style={{ ...styles.page, maxWidth: 600, margin: '0 auto', width: '100%' }}>
      <style>{ERFOLGE_SHIMMER_CSS}</style>

      {/* Header zentriert */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button style={styles.backBtn} onClick={onBack}>{'\u2190'}</button>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span style={sparkle(0)}>{'\u2728'}</span>
          <h2 style={{ ...shimmerTitle, margin: 0 }}>Erfolge</h2>
          <span style={sparkle(0.7)}>{'\u2728'}</span>
        </div>
        <div style={{ width: 40 }} />
      </div>

      {/* Spieler-Auswahl */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '12px 0',
        background: `linear-gradient(135deg, ${colors.accent}08, transparent)`,
        borderRadius: 12,
      }}>
        {profiles.length > 1 && (
          <button onClick={prev} style={{
            ...styles.backBtn, fontSize: 16, padding: '6px 12px', borderRadius: 10,
            background: colors.bgMuted, border: `1px solid ${colors.border}`,
          }}>{'\u2190'}</button>
        )}
        <div style={{ textAlign: 'center', minWidth: 100 }}>
          <div style={{ fontSize: 20, fontWeight: 900, color: colors.fg }}>{selected?.name}</div>
          <div style={{ fontSize: 11, color: colors.fgDim }}>{cursor + 1} von {profiles.length}</div>
        </div>
        {profiles.length > 1 && (
          <button onClick={next} style={{
            ...styles.backBtn, fontSize: 16, padding: '6px 12px', borderRadius: 10,
            background: colors.bgMuted, border: `1px solid ${colors.border}`,
          }}>{'\u2192'}</button>
        )}
      </div>

      {/* Achievements */}
      {sqlStats.loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: colors.fgDim }}>Laden...</div>
      ) : (
        <Suspense fallback={<div style={{ padding: 20, textAlign: 'center', color: colors.fgDim }}>Laden...</div>}>
          <AdvancedStatsTab data={sqlStats.data} tab="erfolge" playerName={selected?.name ?? ''} />
        </Suspense>
      )}
    </div>
  )
}
