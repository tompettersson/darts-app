// src/screens/stats/StatsArea.tsx
// Komplett ausgelagerter Statistikbereich (Untermenü + Subscreens)
// App.tsx bleibt dadurch schlank.

import React, { useState, useEffect, useMemo, Suspense } from 'react'
import { ui, getThemedUI } from '../../ui'
import { useTheme } from '../../ThemeProvider'
import ArcadeScrollPicker, { type PickerItem } from '../../components/ArcadeScrollPicker'

// H2HState Type-Import (nur Typ, kein Code-Bundle)
import type { H2HState } from './StatsDashboard'

// Lazy-loaded Screens (nur bei Bedarf geladen)
const StatsDashboard = React.lazy(() => import('./StatsDashboard'))
const PlayersOverview = React.lazy(() => import('./PlayersOverview'))
const StatsProfile = React.lazy(() => import('../StatsProfile'))
const MatchDetails = React.lazy(() => import('../MatchDetails'))
const ATBMatchDetails = React.lazy(() => import('../ATBMatchDetails'))
const StrMatchDetails = React.lazy(() => import('../StrMatchDetails'))
const HighscoreMatchDetails = React.lazy(() => import('../HighscoreMatchDetails'))
const CTFMatchDetails = React.lazy(() => import('../CTFMatchDetails'))
const ShanghaiMatchDetails = React.lazy(() => import('../ShanghaiMatchDetails'))
const KillerSummary = React.lazy(() => import('../KillerSummary'))
const CricketMatchDetails = React.lazy(() => import('../CricketMatchDetails'))
const Bobs27MatchDetails = React.lazy(() => import('../Bobs27MatchDetails'))
const OperationMatchDetails = React.lazy(() => import('../OperationMatchDetails'))
const HallOfFame = React.lazy(() => import('../HallOfFame'))
const MatchHistory = React.lazy(() => import('../MatchHistory'))

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
  | 'operation-match-details'
  | 'hall-of-fame'

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
      if (e.key !== 'Backspace') return
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return

      e.preventDefault()
      if (view === 'stats-menu') {
        onBackToMenu()
      } else if (view === 'match-details' || view === 'atb-match-details' || view === 'cricket-match-details' || view === 'str-match-details' || view === 'highscore-match-details' || view === 'ctf-match-details' || view === 'shanghai-match-details' || view === 'killer-match-details' || view === 'bobs27-match-details' || view === 'operation-match-details') {
        setView(returnFromMatchDetails)
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
      { id: 'stats-dashboard', label: 'Vergleiche', sub: 'Head-to-Head, Spielervergleich' },
      { id: 'match-history', label: 'Matchhistorie', sub: 'Matchauswahl → Details' },
      { id: 'player-profile', label: 'Spieler', sub: 'Statistiken pro Spieler' },
      { id: 'hall-of-fame', label: 'Highscores', sub: 'Hall of Fame / Leaderboards' },
    ]

    const handleStatsConfirm = (index: number) => {
      setView(statsItems[index].id as View)
    }

    return (
      <div style={{ ...styles.page, display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
        <div style={{ height: 60 }} />
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
                  <button onClick={() => setView('stats-dashboard')} style={styles.tile}>
                    <div style={styles.title}>Vergleiche</div>
                    <div style={styles.sub}>Head-to-Head, Spielervergleich</div>
                  </button>

                  <button onClick={() => setView('match-history')} style={styles.tile}>
                    <div style={styles.title}>Matchhistorie</div>
                    <div style={styles.sub}>Matchauswahl → Details</div>
                  </button>

                  <button onClick={() => setView('player-profile')} style={styles.tile}>
                    <div style={styles.title}>Spieler</div>
                    <div style={styles.sub}>Statistiken pro Spieler</div>
                  </button>

                  <button onClick={() => setView('hall-of-fame')} style={styles.tile}>
                    <div style={styles.title}>Highscores</div>
                    <div style={styles.sub}>Hall of Fame / Leaderboards</div>
                  </button>
                </div>
              </div>

              <div style={{ ...styles.sub, textAlign: 'center', marginTop: 8 }}>
                Profile & Backup findest du im Hauptmenü.
              </div>
            </div>
          )}
        </div>

        <div style={{ textAlign: 'center', padding: '12px 0' }}>
          <button style={styles.backBtn} onClick={onBackToMenu}>← Zurück</button>
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
        <div style={styles.page}>
          <div style={styles.centerPage}>
            <div style={styles.centerInnerWide}>
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
            </div>
          </div>
        </div>
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
          <div style={styles.headerRow}>
            <h2 style={{ margin: 0, color: colors.fg }}>Spieler-Statistiken</h2>
            <button style={styles.backBtn} onClick={() => setView('stats-menu')}>
              ← Zurück
            </button>
          </div>

          <StatsProfile
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
    return <Suspense fallback={suspenseFallback}><Bobs27MatchDetails matchId={bobs27DetailMatchId} onBack={() => setView(returnFromMatchDetails)} /></Suspense>
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
