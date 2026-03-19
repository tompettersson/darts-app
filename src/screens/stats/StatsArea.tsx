// src/screens/stats/StatsArea.tsx
// Komplett ausgelagerter Statistikbereich (Untermenü + Subscreens)
// App.tsx bleibt dadurch schlank.

import React, { useState, useEffect, useMemo } from 'react'
import { ui, getThemedUI } from '../../ui'
import { useTheme } from '../../ThemeProvider'
import ArcadeScrollPicker, { type PickerItem } from '../../components/ArcadeScrollPicker'

// Screens (bestehend)
import StatsDashboard, { type H2HState } from './StatsDashboard'
import PlayersOverview from './PlayersOverview'
import StatsProfile from '../StatsProfile'
import MatchDetails from '../MatchDetails'
import ATBMatchDetails from '../ATBMatchDetails'
import StrMatchDetails from '../StrMatchDetails'
import HighscoreMatchDetails from '../HighscoreMatchDetails'
import CTFMatchDetails from '../CTFMatchDetails'
import ShanghaiMatchDetails from '../ShanghaiMatchDetails'
import KillerSummary from '../KillerSummary'
import Bobs27MatchDetails from '../Bobs27MatchDetails'
import OperationMatchDetails from '../OperationMatchDetails'
import HallOfFame from '../HallOfFame'

// Match History (bei dir liegt es unter /screens)
import MatchHistory from '../MatchHistory'

type View =
  | 'stats-menu'
  | 'stats-dashboard'
  | 'match-history'
  | 'players-overview'
  | 'player-profile'
  | 'match-details'
  | 'atb-match-details'
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
      } else if (view === 'match-details' || view === 'atb-match-details' || view === 'str-match-details' || view === 'highscore-match-details' || view === 'ctf-match-details' || view === 'shanghai-match-details' || view === 'killer-match-details' || view === 'bobs27-match-details' || view === 'operation-match-details') {
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

  // ---------- DASHBOARD ----------
  if (view === 'stats-dashboard') {
    return (
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
          onOpenCricketMatch(id, 'stats-dashboard')
        }}
        onOpenHallOfFame={() => {
          setView('hall-of-fame')
        }}
        h2hState={h2hState}
        onH2HStateChange={setH2HState}
      />
    )
  }

  // ---------- MATCH HISTORY ----------
  if (view === 'match-history') {
    return (
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
                onOpenCricketMatch(id, 'match-history')
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
    )
  }

  // ---------- PLAYERS OVERVIEW ----------
  if (view === 'players-overview') {
    return (
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
    )
  }

  // ---------- PLAYER PROFILE (neue StatsProfile Komponente) ----------
  if (view === 'player-profile') {
    return (
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
    )
  }

  // ---------- HALL OF FAME ----------
  if (view === 'hall-of-fame') {
    return <HallOfFame onBack={() => setView('stats-menu')} />
  }

  // ---------- MATCH DETAILS (X01) ----------
  if (view === 'match-details' && detailMatchId) {
    return <MatchDetails matchId={detailMatchId} onBack={() => setView(returnFromMatchDetails)} />
  }

  // ---------- ATB MATCH DETAILS ----------
  if (view === 'atb-match-details' && atbDetailMatchId) {
    return <ATBMatchDetails matchId={atbDetailMatchId} onBack={() => setView(returnFromMatchDetails)} />
  }

  // ---------- STRÄUSSCHEN MATCH DETAILS ----------
  if (view === 'str-match-details' && strDetailMatchId) {
    return <StrMatchDetails matchId={strDetailMatchId} onBack={() => setView(returnFromMatchDetails)} />
  }

  // ---------- HIGHSCORE MATCH DETAILS ----------
  if (view === 'highscore-match-details' && highscoreDetailMatchId) {
    return <HighscoreMatchDetails matchId={highscoreDetailMatchId} onBack={() => setView(returnFromMatchDetails)} />
  }

  // ---------- CTF MATCH DETAILS ----------
  if (view === 'ctf-match-details' && ctfDetailMatchId) {
    return <CTFMatchDetails matchId={ctfDetailMatchId} onBack={() => setView(returnFromMatchDetails)} />
  }

  // ---------- SHANGHAI MATCH DETAILS ----------
  if (view === 'shanghai-match-details' && shanghaiDetailMatchId) {
    return <ShanghaiMatchDetails matchId={shanghaiDetailMatchId} onBack={() => setView(returnFromMatchDetails)} />
  }

  // ---------- KILLER MATCH DETAILS ----------
  if (view === 'killer-match-details' && killerDetailMatchId) {
    return <KillerSummary matchId={killerDetailMatchId} onBack={() => setView(returnFromMatchDetails)} readOnly />
  }

  // ---------- BOB'S 27 MATCH DETAILS ----------
  if (view === 'bobs27-match-details' && bobs27DetailMatchId) {
    return <Bobs27MatchDetails matchId={bobs27DetailMatchId} onBack={() => setView(returnFromMatchDetails)} />
  }

  // ---------- OPERATION MATCH DETAILS ----------
  if (view === 'operation-match-details' && operationDetailMatchId) {
    return <OperationMatchDetails matchId={operationDetailMatchId} onBack={() => setView(returnFromMatchDetails)} />
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
