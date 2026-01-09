// src/App.tsx
// Zentraler View-Switcher: Menü, Preset-Auswahl (NewGameStart), NewGame-Config,
// Cricket-Setup, Live-Games (X01 & Cricket), Summary-Screens,
// StatsArea (ausgelagert), Profile-Verwaltung

import React, { useMemo, useState } from 'react'
import { ui } from './ui'

// Storage / State Utils
import {
  getOpenMatch,
  getOpenCricketMatch,
  createCricketMatchShell,
  setLastOpenCricketMatchId,
  setLastActivity,
  getLastActivity,
  getCricketMatchById,
} from './storage'

// X01 Screens
import Game from './screens/Game'
import NewGame from './screens/NewGame'
import NewGameStart, { type Preset } from './screens/NewGameStart'

// StatsArea (NEU ausgelagert)
import StatsArea from './screens/stats/StatsArea'

// Profile Screens (Verwaltung)
import CreateProfile from './screens/CreateProfile'
import ProfileList from './screens/ProfileList'
import ProfileBackup from './screens/ProfileBackup'

// Cricket Screens
import NewGameCricket from './screens/NewGameCricket'
import GameCricket from './screens/GameCricket'
import CricketSummary from './screens/CricketSummary'

// Types
import type { CricketSetup } from './screens/newgame/CricketModePicker'

type View =
  | 'menu'
  | 'new-start'
  | 'new-config'
  | 'new-cricket'
  | 'game'
  | 'game-cricket'
  | 'summary-cricket'
  | 'stats-area'
  // Profiles/Backup
  | 'create-profile'
  | 'profiles'
  | 'profiles-menu'
  | 'profiles-backup'

export default function App() {
  const [view, setView] = useState<View>('menu')

  // offene Matches (X01 + Cricket)
  const [activeMatchId, setActiveMatchId] = useState<string | undefined>(() => getOpenMatch()?.id)
  const [activeCricketId, setActiveCricketId] = useState<string | undefined>(() => getOpenCricketMatch()?.id)
  const [summaryCricketId, setSummaryCricketId] = useState<string | undefined>(undefined)

  // Auswahl / Config
  const [preset, setPreset] = useState<Preset | null>(null)
  const [cricketCfg, setCricketCfg] = useState<CricketSetup | null>(null)

  const openMatch = getOpenMatch()
  const openCricket = getOpenCricketMatch()

  // Wer soll bei "Spiel fortsetzen" genommen werden?
  const continueInfo = useMemo(() => {
    const act = getLastActivity()

    function buildResult(kind: 'x01' | 'cricket') {
      if (kind === 'x01') {
        if (openMatch && !openMatch.finished) {
          return { kind: 'x01' as const, id: openMatch.id, title: openMatch.title }
        }
      } else {
        if (openCricket && !openCricket.finished) {
          return { kind: 'cricket' as const, id: openCricket.id, title: openCricket.title }
        }
      }
      return null
    }

    // 1) bevorzugt das zuletzt aktive
    if (act && act.matchExists && !act.finished) {
      const pref = buildResult(act.kind)
      if (pref) return pref
    }
    // 2) fallback: X01
    const x01res = buildResult('x01')
    if (x01res) return x01res
    // 3) fallback: Cricket
    const cricRes = buildResult('cricket')
    if (cricRes) return cricRes
    // 4) nix offen
    return null
  }, [openMatch, openCricket])

  // ---------- View Routing ----------

  // PRESET-AUSWAHL (X01 / Cricket)
  if (view === 'new-start') {
    return (
      <NewGameStart
        onBack={() => setView('menu')}
        onSelectPreset={(p: Preset) => {
          setPreset(p)
          setView('new-config')
        }}
        onSelectCricket={(cfg) => {
          setCricketCfg(cfg)
          setView('new-cricket')
        }}
      />
    )
  }

  // X01 KONFIG
  if (view === 'new-config' && preset) {
    return (
      <NewGame
        preset={preset}
        onCancel={() => setView('new-start')}
        onStarted={(matchId) => {
          setActiveMatchId(matchId)
          setLastActivity('x01', matchId)
          setView('game')
        }}
      />
    )
  }

  // CRICKET KONFIG
  if (view === 'new-cricket' && cricketCfg) {
    return (
      <NewGameCricket
        cfg={cricketCfg}
        onCancel={() => setView('new-start')}
        onStart={({ cfg, players, targetWins }) => {
          const bestOfGames = targetWins * 2 - 1

          const title = `Cricket ${cfg.range === 'short' ? 'Short' : 'Long'} · ${
            cfg.style === 'cutthroat' ? 'Cutthroat' : 'Standard'
          } – ${players.map((p) => p.name).join(' vs ')} (First to ${targetWins})`

          const stored = createCricketMatchShell({
            title,
            players: players.map((p) => ({ id: p.id, name: p.name, isGuest: !!p.isGuest })),
            range: cfg.range,
            style: cfg.style,
            bestOfGames,
          })

          setLastOpenCricketMatchId(stored.id)
          setActiveCricketId(stored.id)
          setLastActivity('cricket', stored.id)
          setView('game-cricket')
        }}
      />
    )
  }

  // X01 LIVE GAME
  if (view === 'game' && activeMatchId) {
    return (
      <Game
        matchId={activeMatchId}
        onExit={() => {
          setView('menu')
          setActiveMatchId(undefined)
        }}
        onNewGame={() => setView('new-start')}
      />
    )
  }

  // CRICKET LIVE GAME
  if (view === 'game-cricket' && activeCricketId) {
    return (
      <GameCricket
        matchId={activeCricketId}
        onExit={() => {
          setView('menu')
          setActiveCricketId(undefined)
        }}
        onShowCricketSummary={(id) => {
          setSummaryCricketId(id)
          setView('summary-cricket')
        }}
      />
    )
  }

  // CRICKET SUMMARY (Match-Review + Rematch)
  if (view === 'summary-cricket' && summaryCricketId) {
    return (
      <CricketSummary
        matchId={summaryCricketId}
        onBackToMenu={() => {
          setView('menu')
          setSummaryCricketId(undefined)
        }}
        onRematch={(oldMatchId: string) => {
          const oldData = getCricketMatchById(oldMatchId)
          if (!oldData) {
            setView('menu')
            return
          }

          const prevPlayers = oldData.players
          if (prevPlayers.length === 0) {
            setView('menu')
            return
          }
          const rotatedPlayers = [...prevPlayers.slice(1), prevPlayers[0]]

          const bestOfGames = oldData.targetWins * 2 - 1

          const title = `Cricket ${oldData.range === 'short' ? 'Short' : 'Long'} · ${
            oldData.style === 'cutthroat' ? 'Cutthroat' : 'Standard'
          } – ${rotatedPlayers.map((p) => p.name).join(' vs ')} (First to ${oldData.targetWins})`

          const newStored = createCricketMatchShell({
            title,
            players: rotatedPlayers.map((p) => ({ id: p.id, name: p.name, isGuest: false })),
            range: oldData.range,
            style: oldData.style,
            bestOfGames,
          })

          setLastOpenCricketMatchId(newStored.id)
          setActiveCricketId(newStored.id)
          setLastActivity('cricket', newStored.id)

          setSummaryCricketId(undefined)
          setView('game-cricket')
        }}
      />
    )
  }

  // ---------- STATS AREA (ausgelagert) ----------
  if (view === 'stats-area') {
    return (
      <StatsArea
        onBackToMenu={() => setView('menu')}
        onOpenCricketMatch={(id: string) => {
          setSummaryCricketId(id)
          setView('summary-cricket')
        }}
      />
    )
  }

  // ---------- PROFILE / BACKUP (bleibt im Hauptmenü) ----------

  if (view === 'create-profile') {
    return <CreateProfile onCancel={() => setView('profiles-menu')} onDone={() => setView('profiles-menu')} />
  }

  if (view === 'profiles') {
    return <ProfileList onBack={() => setView('profiles-menu')} />
  }

  if (view === 'profiles-backup') {
    return <ProfileBackup onBack={() => setView('profiles-menu')} />
  }

  if (view === 'profiles-menu') {
    return (
      <div style={ui.page}>
        <div style={ui.headerRow}>
          <h2 style={{ margin: 0 }}>Profile & Backup</h2>
          <button style={ui.backBtn} onClick={() => setView('menu')}>
            ← Menü
          </button>
        </div>
        <div style={ui.centerPage}>
          <div style={ui.centerInner}>
            <div style={ui.card}>
              <div style={{ display: 'grid', gap: 8 }}>
                <button onClick={() => setView('profiles')} style={ui.tile}>
                  <div style={ui.title}>Profil bearbeiten</div>
                  <div style={ui.sub}>Umbenennen & löschen</div>
                </button>

                <button onClick={() => setView('create-profile')} style={ui.tile}>
                  <div style={ui.title}>Neues Profil</div>
                  <div style={ui.sub}>Spieler anlegen</div>
                </button>

                <button onClick={() => setView('profiles-backup')} style={ui.tile}>
                  <div style={ui.title}>Backup & Restore</div>
                  <div style={ui.sub}>Speichern oder importieren</div>
                </button>
              </div>
            </div>

            <div style={{ ...ui.sub, textAlign: 'center', marginTop: 8 }}>
              Gäste fügst du direkt beim Spielstart hinzu.
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ---------- HAUPTMENÜ ----------
  return (
    <div style={ui.page}>
      <div style={ui.centerPage}>
        <div style={ui.centerInner}>
          <div style={{ display: 'grid', gap: 12 }}>
            <h1 style={{ margin: 0 }}>Darts</h1>

            <div style={ui.card}>
              <div style={{ display: 'grid', gap: 8 }}>
                {/* SPIEL FORTSETZEN */}
                <button
                  onClick={() => {
                    if (!continueInfo) return
                    if (continueInfo.kind === 'x01') {
                      setActiveMatchId(continueInfo.id)
                      setLastActivity('x01', continueInfo.id)
                      setView('game')
                    } else {
                      setActiveCricketId(continueInfo.id)
                      setLastActivity('cricket', continueInfo.id)
                      setView('game-cricket')
                    }
                  }}
                  disabled={!continueInfo}
                  style={{
                    ...ui.tile,
                    ...(!continueInfo ? ui.tileDisabled : {}),
                  }}
                  title={continueInfo ? continueInfo.title : 'Kein laufendes Match'}
                >
                  <div style={ui.title}>Spiel fortsetzen</div>
                  <div style={ui.sub}>{continueInfo ? continueInfo.title : '—'}</div>
                </button>

                {/* NEUES SPIEL */}
                <button onClick={() => setView('new-start')} style={ui.tile}>
                  <div style={ui.title}>Neues Spiel</div>
                  <div style={ui.sub}>X01 oder Cricket</div>
                </button>

                {/* STATISTIKEN (ausgelagert) */}
                <button onClick={() => setView('stats-area')} style={ui.tile}>
                  <div style={ui.title}>Statistiken</div>
                  <div style={ui.sub}>Matchhistorie, Spieler, Highscores</div>
                </button>

                {/* PROFILE & BACKUP */}
                <button onClick={() => setView('profiles-menu')} style={ui.tile}>
                  <div style={ui.title}>Profile & Backup</div>
                  <div style={ui.sub}>Profile verwalten, sichern / laden</div>
                </button>
              </div>
            </div>

            <div style={{ ...ui.sub, textAlign: 'center' }}>
              Gäste fügst du direkt im Spiel unter „Spieler“ hinzu.
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
