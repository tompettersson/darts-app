// src/screens/stats/StatsArea.tsx
// Komplett ausgelagerter Statistikbereich (Untermenü + Subscreens)
// App.tsx bleibt dadurch schlank.

import React, { useState, useEffect, useMemo } from 'react'
import { ui, getThemedUI } from '../../ui'
import { useTheme } from '../../ThemeProvider'

// Screens (bestehend)
import StatsDashboard, { type H2HState } from './StatsDashboard'
import PlayersOverview from './PlayersOverview'
import StatsProfile from '../StatsProfile'
import MatchDetails from '../MatchDetails'
import ATBMatchDetails from '../ATBMatchDetails'
import StrMatchDetails from '../StrMatchDetails'
import HighscoreMatchDetails from '../HighscoreMatchDetails'
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

  const [detailMatchId, setDetailMatchId] = useState<string | undefined>(undefined)
  const [atbDetailMatchId, setAtbDetailMatchId] = useState<string | undefined>(undefined)
  const [strDetailMatchId, setStrDetailMatchId] = useState<string | undefined>(undefined)
  const [highscoreDetailMatchId, setHighscoreDetailMatchId] = useState<string | undefined>(undefined)
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
    return (
      <div style={styles.page}>
        <div style={styles.headerRow}>
          <h2 style={{ margin: 0, color: colors.fg }}>Statistiken</h2>
          <button style={styles.backBtn} onClick={onBackToMenu}>
            ← Menü
          </button>
        </div>

        <div style={styles.centerPage}>
          <div style={styles.centerInner}>
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
        </div>
      </div>
    )
  }

  // ---------- DASHBOARD ----------
  if (view === 'stats-dashboard') {
    return (
      <div style={styles.page}>
        <div style={styles.centerPage}>
          <div style={styles.centerInnerWide}>
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
          </div>
        </div>
      </div>
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

        <div style={styles.centerPage}>
          <div style={styles.centerInnerWide}>
            <StatsProfile
              onOpenMatch={(matchId: string) => {
                setDetailMatchId(matchId)
                setReturnFromMatchDetails('player-profile')
                setView('match-details')
              }}
            />
          </div>
        </div>
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
