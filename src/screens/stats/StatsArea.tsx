// src/screens/stats/StatsArea.tsx
// Komplett ausgelagerter Statistikbereich (Untermenü + Subscreens)
// App.tsx bleibt dadurch schlank.

import React, { useState } from 'react'
import { ui } from '../../ui'

// Screens (bestehend)
import StatsDashboard from './StatsDashboard'
import PlayersOverview from './PlayersOverview'
import PlayerProfile from '../player/PlayerProfile'
import MatchDetails from '../MatchDetails'
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
  | 'hall-of-fame'

type Props = {
  onBackToMenu: () => void
  onOpenCricketMatch: (id: string) => void // Cricket-Summary läuft weiterhin über App.tsx
}

export default function StatsArea({ onBackToMenu, onOpenCricketMatch }: Props) {
  const [view, setView] = useState<View>('stats-menu')

  const [detailMatchId, setDetailMatchId] = useState<string | undefined>(undefined)
  const [playerProfileId, setPlayerProfileId] = useState<string | undefined>(undefined)

  // ---------- STATS UNTERMENÜ ----------
  if (view === 'stats-menu') {
    return (
      <div style={ui.page}>
        <div style={ui.headerRow}>
          <h2 style={{ margin: 0 }}>Statistiken</h2>
          <button style={ui.backBtn} onClick={onBackToMenu}>
            ← Menü
          </button>
        </div>

        <div style={ui.centerPage}>
          <div style={ui.centerInner}>
            <div style={ui.card}>
              <div style={{ display: 'grid', gap: 8 }}>
                <button onClick={() => setView('stats-dashboard')} style={ui.tile}>
                  <div style={ui.title}>Dashboard</div>
                  <div style={ui.sub}>Übersicht, Quicklinks</div>
                </button>

                <button onClick={() => setView('match-history')} style={ui.tile}>
                  <div style={ui.title}>Matchhistorie</div>
                  <div style={ui.sub}>Matchauswahl → Details</div>
                </button>

                <button onClick={() => setView('players-overview')} style={ui.tile}>
                  <div style={ui.title}>Spieler</div>
                  <div style={ui.sub}>Rankings & Profile</div>
                </button>

                <button onClick={() => setView('hall-of-fame')} style={ui.tile}>
                  <div style={ui.title}>Highscores</div>
                  <div style={ui.sub}>Hall of Fame / Leaderboards</div>
                </button>
              </div>
            </div>

            <div style={{ ...ui.sub, textAlign: 'center', marginTop: 8 }}>
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
      <div style={ui.page}>
        <div style={ui.centerPage}>
          <div style={ui.centerInnerWide}>
            <StatsDashboard
              onBack={() => setView('stats-menu')}
              onShowPlayer={(pid: string) => {
                setPlayerProfileId(pid)
                setView('player-profile')
              }}
              onOpenMatch={(id: string) => {
                setDetailMatchId(id)
                setView('match-details')
              }}
              onOpenCricketMatch={(id: string) => {
                onOpenCricketMatch(id)
              }}
              onOpenHallOfFame={() => {
                setView('hall-of-fame')
              }}
            />
          </div>
        </div>
      </div>
    )
  }

  // ---------- MATCH HISTORY ----------
  if (view === 'match-history') {
    return (
      <div style={ui.page}>
        <div style={ui.centerPage}>
          <div style={ui.centerInnerWide}>
            <MatchHistory
              onBack={() => setView('stats-menu')}
              onOpenX01Match={(id: string) => {
                setDetailMatchId(id)
                setView('match-details')
              }}
              onOpenCricketMatch={(id: string) => {
                onOpenCricketMatch(id)
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
      <div style={ui.page}>
        <div style={ui.headerRow}>
          <h2 style={{ margin: 0 }}>Spielerübersicht</h2>
          <button style={ui.backBtn} onClick={() => setView('stats-menu')}>
            ← Zurück
          </button>
        </div>

        <div style={ui.centerPage}>
          <div style={ui.centerInnerWide}>
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

  // ---------- PLAYER PROFILE ----------
  if (view === 'player-profile' && playerProfileId) {
    return (
      <div style={ui.page}>
        <div style={ui.headerRow}>
          <h2 style={{ margin: 0 }}>Spielerprofil</h2>
          <button style={ui.backBtn} onClick={() => setView('players-overview')}>
            ← Zurück
          </button>
        </div>

        <div style={ui.centerPage}>
          <div style={ui.centerInnerWide}>
            <PlayerProfile
              playerId={playerProfileId}
              onBack={() => setView('players-overview')}
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

  // ---------- MATCH DETAILS ----------
  if (view === 'match-details' && detailMatchId) {
    return <MatchDetails matchId={detailMatchId} onBack={() => setView('match-history')} />
  }

  // Fallback
  return (
    <div style={ui.page}>
      <div style={ui.card}>
        <div style={{ fontWeight: 800 }}>StatsArea: Ungültiger Zustand</div>
        <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
          <button style={ui.backBtn} onClick={() => setView('stats-menu')}>Zum Stats-Menü</button>
          <button style={ui.backBtn} onClick={onBackToMenu}>Ins Menü</button>
        </div>
      </div>
    </div>
  )
}
