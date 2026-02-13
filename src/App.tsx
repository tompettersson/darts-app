// src/App.tsx
// Zentraler View-Switcher: Menü, Preset-Auswahl (NewGameStart), NewGame-Config,
// Cricket-Setup, Live-Games (X01 & Cricket), Summary-Screens,
// StatsArea (ausgelagert), Profile-Verwaltung

import React, { useMemo, useState, useCallback, useEffect } from 'react'
import { ui, getThemedUI } from './ui'
import { useTheme } from './ThemeProvider'
import type { AppTheme } from './theme'

// SQLite Startup
import { startupWithSQLite, isSQLiteReady } from './db/init'

// Storage / State Utils
import {
  getOpenMatch,
  getOpenCricketMatch,
  createCricketMatchShell,
  setLastOpenCricketMatchId,
  setLastActivity,
  getLastActivity,
  getCricketMatchById,
  createATBMatchShell,
  setLastOpenATBMatchId,
  getOpenATBMatch,
  getATBMatchById,
  setLastOpenMatchId,
  getProfiles,
  getMatches,
  saveMatches,
  createStrMatchShell,
  setLastOpenStrMatchId,
  getOpenStrMatch,
  getStrMatchById,
  createHighscoreMatchShell,
  setLastOpenHighscoreMatchId,
  getOpenHighscoreMatch,
  getHighscoreMatchById,
  getPlayerColorBackgroundEnabled,
  setPlayerColorBackgroundEnabled,
  type StoredMatch,
} from './storage'

// X01 Engine Types
import { id as genId, now, type MatchStarted, type DartsEvent } from './darts501'

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

// Around the Block Screens
import NewGameATB from './screens/NewGameATB'
import GameATB from './screens/GameATB'
import ATBSummary from './screens/ATBSummary'

// 121 Sprint
import NewGame121 from './screens/NewGame121'

// Sträußchen
import NewGameStraeusschen from './screens/NewGameStraeusschen'
import GameStraeusschen from './screens/GameStraeusschen'
import StraeusschenSummary from './screens/StraeusschenSummary'

// Highscore
import NewGameHighscore from './screens/NewGameHighscore'
import GameHighscore from './screens/GameHighscore'
import HighscoreSummary from './screens/HighscoreSummary'

// Zufallsspiel
import NewGameRandom from './screens/NewGameRandom'
import { generateRandomGame, describeRandomGame } from './randomGame'

// Speech (Einstellungen)
import { getVoiceLang, setVoiceLang, type VoiceLang } from './speech'

// Types
import type { CricketSetup } from './screens/newgame/CricketModePicker'
import type { ATBSetup } from './screens/NewGameStart'
import type { ATBMode, ATBDirection } from './types/aroundTheBlock'

type View =
  | 'menu'
  | 'new-start'
  | 'new-config'
  | 'new-cricket'
  | 'new-atb'
  | 'new-121'
  | 'new-random'
  | 'game'
  | 'game-cricket'
  | 'game-atb'
  | 'summary-cricket'
  | 'summary-atb'
  | 'new-str'
  | 'game-str'
  | 'summary-str'
  | 'new-highscore'
  | 'game-highscore'
  | 'summary-highscore'
  | 'stats-area'
  // Profiles/Backup
  | 'create-profile'
  | 'profiles'
  | 'profiles-menu'
  | 'profiles-backup'
  | 'settings'

export default function App() {
  // Theme System
  const { theme, setTheme, colors, isArcade } = useTheme()
  const styles = useMemo(() => getThemedUI(colors, isArcade), [colors, isArcade])

  // SQLite Loading State
  const [dbLoading, setDbLoading] = useState(true)
  const [dbError, setDbError] = useState<string | null>(null)

  // SQLite beim App-Start initialisieren
  useEffect(() => {
    let mounted = true

    async function init() {
      try {
        const result = await startupWithSQLite()
        if (!mounted) return

        if (!result.dbInit.success) {
          console.warn('[App] SQLite Init fehlgeschlagen, nutze LocalStorage:', result.dbInit.error)
          setDbError(result.dbInit.error || 'SQLite nicht verfügbar')
        } else if (result.dataLoaded) {
          console.log('[App] SQLite Daten geladen:', result.dataLoaded)
        }
      } catch (e) {
        if (!mounted) return
        console.error('[App] SQLite Startup Fehler:', e)
        setDbError(e instanceof Error ? e.message : 'Unbekannter Fehler')
      } finally {
        if (mounted) setDbLoading(false)
      }
    }

    init()
    return () => { mounted = false }
  }, [])

  const [view, setView] = useState<View>('menu')

  // offene Matches (X01 + Cricket)
  const [activeMatchId, setActiveMatchId] = useState<string | undefined>(() => getOpenMatch()?.id)
  const [activeCricketId, setActiveCricketId] = useState<string | undefined>(() => getOpenCricketMatch()?.id)
  const [summaryCricketId, setSummaryCricketId] = useState<string | undefined>(undefined)

  // Für Return-Navigation aus Cricket-Summary
  const [statsAreaReturnView, setStatsAreaReturnView] = useState<string | undefined>(undefined)

  // Force re-render für Settings
  const [settingsKey, setSettingsKey] = useState(0)

  // Spielerfarben-Hintergrund Einstellung
  const [playerColorBgEnabled, setPlayerColorBgEnabled] = useState(() => getPlayerColorBackgroundEnabled())

  // Auswahl / Config
  const [preset, setPreset] = useState<Preset | null>(null)
  const [cricketCfg, setCricketCfg] = useState<CricketSetup | null>(null)
  const [atbCfg, setAtbCfg] = useState<ATBSetup | null>(null)

  // ATB Match IDs
  const [activeATBId, setActiveATBId] = useState<string | undefined>(() => getOpenATBMatch()?.id)
  const [summaryATBId, setSummaryATBId] = useState<string | undefined>(undefined)

  // Sträußchen Match IDs
  const [activeStrId, setActiveStrId] = useState<string | undefined>(() => getOpenStrMatch()?.id)
  const [summaryStrId, setSummaryStrId] = useState<string | undefined>(undefined)

  // Highscore Match IDs
  const [activeHighscoreId, setActiveHighscoreId] = useState<string | undefined>(() => getOpenHighscoreMatch()?.id)
  const [summaryHighscoreId, setSummaryHighscoreId] = useState<string | undefined>(undefined)

  const openMatch = getOpenMatch()
  const openCricket = getOpenCricketMatch()
  const openATB = getOpenATBMatch()
  const openStr = getOpenStrMatch()
  const openHighscore = getOpenHighscoreMatch()

  // Wer soll bei "Spiel fortsetzen" genommen werden?
  const continueInfo = useMemo(() => {
    const act = getLastActivity()

    function buildResult(kind: 'x01' | 'cricket' | 'atb' | 'str' | 'highscore') {
      if (kind === 'x01') {
        if (openMatch && !openMatch.finished) {
          return { kind: 'x01' as const, id: openMatch.id, title: openMatch.title }
        }
      } else if (kind === 'cricket') {
        if (openCricket && !openCricket.finished) {
          return { kind: 'cricket' as const, id: openCricket.id, title: openCricket.title }
        }
      } else if (kind === 'atb') {
        if (openATB && !openATB.finished) {
          return { kind: 'atb' as const, id: openATB.id, title: openATB.title }
        }
      } else if (kind === 'str') {
        if (openStr && !openStr.finished) {
          return { kind: 'str' as const, id: openStr.id, title: openStr.title }
        }
      } else if (kind === 'highscore') {
        if (openHighscore && !openHighscore.finished) {
          return { kind: 'highscore' as const, id: openHighscore.id, title: openHighscore.title }
        }
      }
      return null
    }

    // 1) bevorzugt das zuletzt aktive
    if (act && act.matchExists && !act.finished) {
      const pref = buildResult(act.kind as 'x01' | 'cricket' | 'atb' | 'str' | 'highscore')
      if (pref) return pref
    }
    // 2) fallback: X01
    const x01res = buildResult('x01')
    if (x01res) return x01res
    // 3) fallback: Cricket
    const cricRes = buildResult('cricket')
    if (cricRes) return cricRes
    // 4) fallback: ATB
    const atbRes = buildResult('atb')
    if (atbRes) return atbRes
    // 5) fallback: Sträußchen
    const strRes = buildResult('str')
    if (strRes) return strRes
    // 6) fallback: Highscore
    const hsRes = buildResult('highscore')
    if (hsRes) return hsRes
    // 7) nix offen
    return null
  }, [openMatch, openCricket, openATB, openStr, openHighscore])

  // ---------- Loading Screen ----------
  if (dbLoading) {
    return (
      <div style={styles.page}>
        <div style={styles.centerPage}>
          <div style={styles.centerInner}>
            <div style={{ textAlign: 'center' }}>
              <h1 style={{ margin: '0 0 16px 0' }}>Darts</h1>
              <div style={styles.sub}>Lade Daten...</div>
              <div style={{
                marginTop: 24,
                width: 40,
                height: 40,
                border: `3px solid ${colors.border}`,
                borderTopColor: colors.accent,
                borderRadius: '50%',
                animation: 'spin 1s linear infinite',
                margin: '24px auto',
              }} />
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
          </div>
        </div>
      </div>
    )
  }

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
        onSelectATB={(cfg) => {
          setAtbCfg(cfg)
          setView('new-atb')
        }}
        onSelectRandom={() => {
          setView('new-random')
        }}
        onSelect121={() => {
          setView('new-121')
        }}
        onSelectStraeusschen={() => {
          setView('new-str')
        }}
        onSelectHighscore={() => {
          setView('new-highscore')
        }}
      />
    )
  }

  // 121 SPRINT KONFIG
  if (view === 'new-121') {
    return (
      <NewGame121
        onCancel={() => setView('new-start')}
        onStarted={(matchId) => {
          setActiveMatchId(matchId)
          setLastActivity('x01', matchId)
          setView('game')
        }}
      />
    )
  }

  // ZUFALLSSPIEL KONFIG
  if (view === 'new-random') {
    return (
      <NewGameRandom
        onCancel={() => setView('new-start')}
        onStart={({ players, structure }) => {
          const result = generateRandomGame()
          console.log('Zufallsspiel:', describeRandomGame(result))

          if (result.kind === 'x01') {
            // X01 Match direkt erstellen (wie in NewGame.tsx)
            const matchId = genId()
            const legId = genId()
            const score = result.config.startingScore

            const structureEv: MatchStarted['structure'] = structure.kind === 'legs'
              ? { kind: 'legs', bestOfLegs: structure.bestOfLegs }
              : { kind: 'sets', legsPerSet: structure.legsPerSet, bestOfSets: structure.bestOfSets }

            const matchPlayers = players.map(p => ({
              playerId: p.id,
              name: p.name,
              isGuest: p.isGuest,
            }))

            const startEvt: MatchStarted = {
              eventId: genId(),
              type: 'MatchStarted',
              ts: now(),
              matchId,
              mode: result.config.mode as MatchStarted['mode'],
              structure: structureEv,
              startingScorePerLeg: score,
              players: matchPlayers,
              bullThrow: { winnerPlayerId: players[0].id },
              version: 1,
              inRule: 'straight-in',
              outRule: 'double-out',
            }

            const events: DartsEvent[] = [startEvt]

            if (structureEv.kind === 'sets') {
              events.push({
                eventId: genId(),
                type: 'SetStarted',
                ts: now(),
                matchId,
                setIndex: 1,
              } as DartsEvent)
            }

            events.push({
              eventId: genId(),
              type: 'LegStarted',
              ts: now(),
              matchId,
              legId,
              legIndex: 1,
              starterPlayerId: players[0].id,
            } as DartsEvent)

            const title = `${score} – ${players.map(p => p.name).join(' vs ')} (Zufallsspiel)`
            const stored: StoredMatch = {
              id: matchId,
              createdAt: now(),
              events,
              playerIds: players.filter(p => !p.isGuest).map(p => p.id),
              title,
            }

            const all = getMatches()
            all.unshift(stored)
            saveMatches(all)
            setLastOpenMatchId(matchId)
            setActiveMatchId(matchId)
            setLastActivity('x01', matchId)
            setView('game')
            return
          }

          if (result.kind === 'cricket') {
            // Cricket starten
            const bestOfGames = structure.kind === 'legs'
              ? structure.bestOfLegs
              : structure.bestOfSets * 2 - 1

            const styleLabel = result.config.style === 'cutthroat' ? 'Cutthroat' : 'Standard'
            const title = `Cricket ${result.config.range === 'short' ? 'Short' : 'Long'} · ${styleLabel} – ${players.map(p => p.name).join(' vs ')} (Zufallsspiel)`

            const stored = createCricketMatchShell({
              title,
              players: players.map(p => ({ id: p.id, name: p.name, isGuest: !!p.isGuest })),
              range: result.config.range,
              style: result.config.style,
              bestOfGames,
              cutthroatEndgame: result.config.cutthroatEndgame,
            })

            setLastOpenCricketMatchId(stored.id)
            setActiveCricketId(stored.id)
            setLastActivity('cricket', stored.id)
            setView('game-cricket')
            return
          }

          if (result.kind === 'atb') {
            // ATB starten
            const atbStructure = structure.kind === 'legs'
              ? { kind: 'legs' as const, bestOfLegs: structure.bestOfLegs }
              : { kind: 'sets' as const, bestOfSets: structure.bestOfSets, legsPerSet: structure.legsPerSet }

            const stored = createATBMatchShell({
              players: players.map(p => ({ playerId: p.id, name: p.name, isGuest: p.isGuest })),
              mode: result.config.mode,
              direction: result.config.direction,
              structure: atbStructure,
              config: result.config.config,
            })

            setLastOpenATBMatchId(stored.id)
            setActiveATBId(stored.id)
            setLastActivity('atb', stored.id)
            setView('game-atb')
            return
          }
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

          const styleLabel = cfg.style === 'cutthroat' ? 'Cutthroat'
            : cfg.style === 'simple' ? 'Simple'
            : cfg.style === 'crazy' ? `Crazy ${cfg.crazyMode === 'pro' ? 'Pro' : ''}`
            : 'Standard'
          const title = `Cricket ${cfg.range === 'short' ? 'Short' : 'Long'} · ${styleLabel} – ${players.map((p) => p.name).join(' vs ')} (First to ${targetWins})`

          const stored = createCricketMatchShell({
            title,
            players: players.map((p) => ({ id: p.id, name: p.name, isGuest: !!p.isGuest })),
            range: cfg.range,
            style: cfg.style,
            bestOfGames,
            cutthroatEndgame: cfg.cutthroatEndgame,
            crazyMode: cfg.crazyMode,
            crazyWithPoints: cfg.crazyWithPoints,
            crazySameForAll: cfg.crazySameForAll,
            crazyScoringMode: cfg.crazyScoringMode,
          })

          setLastOpenCricketMatchId(stored.id)
          setActiveCricketId(stored.id)
          setLastActivity('cricket', stored.id)
          setView('game-cricket')
        }}
      />
    )
  }

  // AROUND THE BLOCK KONFIG
  if (view === 'new-atb') {
    return (
      <NewGameATB
        onCancel={() => setView('new-start')}
        onStart={({ mode, direction, players, structure, config }) => {
          const stored = createATBMatchShell({
            players: players.map((p) => ({ playerId: p.id, name: p.name, isGuest: p.isGuest })),
            mode,
            direction,
            structure,
            config,
          })

          setLastOpenATBMatchId(stored.id)
          setActiveATBId(stored.id)
          setLastActivity('atb', stored.id)
          setView('game-atb')
        }}
      />
    )
  }

  // AROUND THE BLOCK LIVE GAME
  if (view === 'game-atb' && activeATBId) {
    return (
      <GameATB
        matchId={activeATBId}
        onExit={() => {
          setView('menu')
          setActiveATBId(undefined)
        }}
        onShowSummary={(id) => {
          setSummaryATBId(id)
          setView('summary-atb')
        }}
      />
    )
  }

  // AROUND THE BLOCK SUMMARY
  if (view === 'summary-atb' && summaryATBId) {
    return (
      <ATBSummary
        matchId={summaryATBId}
        onBackToMenu={() => {
          setView('menu')
          setSummaryATBId(undefined)
        }}
        onRematch={(oldMatchId: string) => {
          const oldData = getATBMatchById(oldMatchId)
          if (!oldData) {
            setView('menu')
            return
          }

          const prevPlayers = oldData.players
          if (prevPlayers.length === 0) {
            setView('menu')
            return
          }
          // Rotiere Spieler für Rematch
          const rotatedPlayers = [...prevPlayers.slice(1), prevPlayers[0]]

          const newStored = createATBMatchShell({
            players: rotatedPlayers.map((p) => ({ playerId: p.playerId, name: p.name, isGuest: p.isGuest })),
            mode: oldData.mode,
            direction: oldData.direction,
            structure: oldData.structure,
          })

          setLastOpenATBMatchId(newStored.id)
          setActiveATBId(newStored.id)
          setSummaryATBId(undefined)
          setView('game-atb')
        }}
      />
    )
  }

  // STRÄUSSCHEN KONFIG
  if (view === 'new-str') {
    return (
      <NewGameStraeusschen
        onCancel={() => setView('new-start')}
        onStart={({ mode, targetNumber, numberOrder, turnOrder, players, structure, ringMode, bullMode, bullPosition }) => {
          const stored = createStrMatchShell({
            players,
            mode,
            targetNumber,
            numberOrder,
            turnOrder,
            structure,
            ringMode,
            bullMode,
            bullPosition,
          })

          setLastOpenStrMatchId(stored.id)
          setActiveStrId(stored.id)
          setLastActivity('str', stored.id)
          setView('game-str')
        }}
      />
    )
  }

  // STRÄUSSCHEN LIVE GAME
  if (view === 'game-str' && activeStrId) {
    return (
      <GameStraeusschen
        matchId={activeStrId}
        onExit={() => {
          setView('menu')
          setActiveStrId(undefined)
        }}
        onShowSummary={(id) => {
          setSummaryStrId(id)
          setView('summary-str')
        }}
      />
    )
  }

  // STRÄUSSCHEN SUMMARY
  if (view === 'summary-str' && summaryStrId) {
    return (
      <StraeusschenSummary
        matchId={summaryStrId}
        onBackToMenu={() => {
          setView('menu')
          setSummaryStrId(undefined)
        }}
        onRematch={(oldMatchId: string) => {
          const oldData = getStrMatchById(oldMatchId)
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

          const newStored = createStrMatchShell({
            players: rotatedPlayers,
            mode: oldData.mode,
            targetNumber: oldData.targetNumber,
            numberOrder: oldData.numberOrder,
            turnOrder: oldData.turnOrder,
            structure: oldData.structure,
            ringMode: oldData.ringMode,
            bullMode: oldData.bullMode,
            bullPosition: oldData.bullPosition,
          })

          setLastOpenStrMatchId(newStored.id)
          setActiveStrId(newStored.id)
          setLastActivity('str', newStored.id)
          setSummaryStrId(undefined)
          setView('game-str')
        }}
      />
    )
  }

  // HIGHSCORE KONFIG
  if (view === 'new-highscore') {
    return (
      <NewGameHighscore
        onCancel={() => setView('new-start')}
        onStart={({ players, targetScore, structure }) => {
          const stored = createHighscoreMatchShell({
            players,
            targetScore,
            structure,
          })

          setLastOpenHighscoreMatchId(stored.id)
          setActiveHighscoreId(stored.id)
          setLastActivity('highscore', stored.id)
          setView('game-highscore')
        }}
      />
    )
  }

  // HIGHSCORE LIVE GAME
  if (view === 'game-highscore' && activeHighscoreId) {
    return (
      <GameHighscore
        matchId={activeHighscoreId}
        onExit={() => {
          setView('menu')
          setActiveHighscoreId(undefined)
        }}
        onShowSummary={(id) => {
          setSummaryHighscoreId(id)
          setView('summary-highscore')
        }}
      />
    )
  }

  // HIGHSCORE SUMMARY
  if (view === 'summary-highscore' && summaryHighscoreId) {
    return (
      <HighscoreSummary
        matchId={summaryHighscoreId}
        onBackToMenu={() => {
          setView('menu')
          setSummaryHighscoreId(undefined)
        }}
        onRematch={(oldMatchId: string) => {
          const oldData = getHighscoreMatchById(oldMatchId)
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

          const newStored = createHighscoreMatchShell({
            players: rotatedPlayers,
            targetScore: oldData.targetScore,
            structure: oldData.structure,
          })

          setLastOpenHighscoreMatchId(newStored.id)
          setActiveHighscoreId(newStored.id)
          setLastActivity('highscore', newStored.id)
          setSummaryHighscoreId(undefined)
          setView('game-highscore')
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
          // Wenn aus StatsArea gekommen, dorthin zurück
          if (statsAreaReturnView) {
            setView('stats-area')
          } else {
            setView('menu')
          }
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

          const rematchStyleLabel = oldData.style === 'cutthroat' ? 'Cutthroat'
            : oldData.style === 'simple' ? 'Simple'
            : oldData.style === 'crazy' ? `Crazy ${oldData.crazyMode === 'pro' ? 'Pro' : ''}`
            : 'Standard'
          const title = `Cricket ${oldData.range === 'short' ? 'Short' : 'Long'} · ${rematchStyleLabel} – ${rotatedPlayers.map((p) => p.name).join(' vs ')} (First to ${oldData.targetWins})`

          const newStored = createCricketMatchShell({
            title,
            players: rotatedPlayers.map((p) => ({ id: p.id, name: p.name, isGuest: false })),
            range: oldData.range,
            style: oldData.style,
            bestOfGames,
            cutthroatEndgame: oldData.cutthroatEndgame,
            crazyMode: oldData.crazyMode,
            crazyWithPoints: oldData.crazyWithPoints,
            crazySameForAll: oldData.crazySameForAll,
            crazyScoringMode: oldData.crazyScoringMode,
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
        onBackToMenu={() => {
          setStatsAreaReturnView(undefined)
          setView('menu')
        }}
        onOpenCricketMatch={(id: string, fromView?: string) => {
          setSummaryCricketId(id)
          setStatsAreaReturnView(fromView)
          setView('summary-cricket')
        }}
        initialView={statsAreaReturnView as any}
        onInitialViewUsed={() => setStatsAreaReturnView(undefined)}
        key={statsAreaReturnView || 'default'} // Force remount wenn initialView sich ändert
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

  // EINSTELLUNGEN (Theme, Kommentator-Stimme etc.)
  if (view === 'settings') {
    const currentLang = getVoiceLang()
    const voiceOptions: { value: VoiceLang; label: string; desc: string }[] = [
      { value: 'en', label: 'English', desc: 'Darts-Caller Stil (Standard)' },
      { value: 'de', label: 'Deutsch', desc: 'Deutscher Kommentator' },
    ]

    const themeOptions: { value: AppTheme; label: string; desc: string }[] = [
      { value: 'normal', label: 'Normal', desc: 'Helles, klassisches Design' },
      { value: 'arcade', label: 'Arcade', desc: 'Dunkles LED-Design wie am Dartautomaten' },
    ]

    return (
      <div style={styles.page}>
        <div style={styles.headerRow}>
          <h2 style={styles.pageHeadline}>Einstellungen</h2>
          <button style={styles.backBtn} onClick={() => setView('profiles-menu')}>
            ← Zurück
          </button>
        </div>
        <div style={styles.centerPage}>
          <div style={styles.centerInner}>
            {/* Theme Selection */}
            <div style={styles.card}>
              <div style={{ marginBottom: 12 }}>
                <div style={styles.title}>Theme</div>
                <div style={styles.sub}>Design der gesamten App</div>
              </div>
              <div style={{ display: 'grid', gap: 8 }}>
                {themeOptions.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setTheme(opt.value)}
                    style={{
                      ...styles.tile,
                      ...(theme === opt.value ? styles.pillActive : {}),
                      opacity: theme === opt.value ? 1 : 0.6,
                    }}
                  >
                    <div style={styles.title}>
                      {opt.label} {theme === opt.value ? '✓' : ''}
                    </div>
                    <div style={styles.sub}>{opt.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Voice Selection */}
            <div style={styles.card}>
              <div style={{ marginBottom: 12 }}>
                <div style={styles.title}>Kommentator-Stimme</div>
                <div style={styles.sub}>Sprache der Spielansagen</div>
              </div>
              <div style={{ display: 'grid', gap: 8 }}>
                {voiceOptions.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => {
                      setVoiceLang(opt.value)
                      setSettingsKey((k) => k + 1)
                    }}
                    style={{
                      ...styles.tile,
                      opacity: currentLang === opt.value ? 1 : 0.6,
                    }}
                  >
                    <div style={styles.title}>
                      {opt.label} {currentLang === opt.value ? '✓' : ''}
                    </div>
                    <div style={styles.sub}>{opt.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Spielerfarben-Hintergrund Toggle */}
            <div style={styles.card}>
              <div style={{ marginBottom: 12 }}>
                <div style={styles.title}>Spielerfarben-Hintergrund</div>
                <div style={styles.sub}>Hintergrund färbt sich in der Farbe des aktiven Spielers</div>
              </div>
              <button
                onClick={() => {
                  const newValue = !playerColorBgEnabled
                  setPlayerColorBackgroundEnabled(newValue)
                  setPlayerColorBgEnabled(newValue)
                }}
                style={{
                  ...styles.tile,
                  opacity: playerColorBgEnabled ? 1 : 0.6,
                }}
              >
                <div style={styles.title}>
                  {playerColorBgEnabled ? '✓ Aktiviert' : 'Deaktiviert'}
                </div>
                <div style={styles.sub}>
                  {playerColorBgEnabled
                    ? 'Hintergrund wechselt mit Spieler'
                    : 'Neutraler Hintergrund'}
                </div>
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (view === 'profiles-menu') {
    return (
      <div style={styles.page}>
        <div style={styles.headerRow}>
          <h2 style={styles.pageHeadline}>Einstellungen</h2>
          <button style={styles.backBtn} onClick={() => setView('menu')}>
            ← Menü
          </button>
        </div>
        <div style={styles.centerPage}>
          <div style={styles.centerInner}>
            <div style={styles.card}>
              <div style={{ display: 'grid', gap: 8 }}>
                <button onClick={() => setView('profiles')} style={styles.tile}>
                  <div style={styles.title}>Profil bearbeiten</div>
                  <div style={styles.sub}>Umbenennen & löschen</div>
                </button>

                <button onClick={() => setView('create-profile')} style={styles.tile}>
                  <div style={styles.title}>Neues Profil</div>
                  <div style={styles.sub}>Spieler anlegen</div>
                </button>

                <button onClick={() => setView('profiles-backup')} style={styles.tile}>
                  <div style={styles.title}>Backup & Restore</div>
                  <div style={styles.sub}>Speichern oder importieren</div>
                </button>

                <button onClick={() => setView('settings')} style={styles.tile}>
                  <div style={styles.title}>Einstellungen</div>
                  <div style={styles.sub}>Theme, Stimme</div>
                </button>
              </div>
            </div>

            <div style={{ ...styles.sub, textAlign: 'center', marginTop: 8 }}>
              Gäste fügst du direkt beim Spielstart hinzu.
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ---------- HAUPTMENÜ ----------
  return (
    <div style={styles.page}>
      <div style={styles.centerPage}>
        <div style={styles.centerInner}>
          <div style={{ display: 'grid', gap: 12 }}>
            <h1 style={{ margin: 0, color: colors.fg }}>Darts</h1>

            <div style={styles.card}>
              <div style={{ display: 'grid', gap: 8 }}>
                {/* SPIEL FORTSETZEN */}
                <button
                  onClick={() => {
                    if (!continueInfo) return
                    if (continueInfo.kind === 'x01') {
                      setActiveMatchId(continueInfo.id)
                      setLastActivity('x01', continueInfo.id)
                      setView('game')
                    } else if (continueInfo.kind === 'cricket') {
                      setActiveCricketId(continueInfo.id)
                      setLastActivity('cricket', continueInfo.id)
                      setView('game-cricket')
                    } else if (continueInfo.kind === 'atb') {
                      setActiveATBId(continueInfo.id)
                      setLastActivity('atb', continueInfo.id)
                      setView('game-atb')
                    } else if (continueInfo.kind === 'str') {
                      setActiveStrId(continueInfo.id)
                      setLastActivity('str', continueInfo.id)
                      setView('game-str')
                    } else if (continueInfo.kind === 'highscore') {
                      setActiveHighscoreId(continueInfo.id)
                      setLastActivity('highscore', continueInfo.id)
                      setView('game-highscore')
                    }
                  }}
                  disabled={!continueInfo}
                  style={{
                    ...styles.tile,
                    ...(!continueInfo ? styles.tileDisabled : {}),
                  }}
                  title={continueInfo ? continueInfo.title : 'Kein laufendes Match'}
                >
                  <div style={styles.title}>Spiel fortsetzen</div>
                  <div style={styles.sub}>{continueInfo ? continueInfo.title : '—'}</div>
                </button>

                {/* NEUES SPIEL */}
                <button onClick={() => setView('new-start')} style={styles.tile}>
                  <div style={styles.title}>Neues Spiel</div>
                  <div style={styles.sub}>X01 oder Cricket</div>
                </button>

                {/* STATISTIKEN (ausgelagert) */}
                <button onClick={() => setView('stats-area')} style={styles.tile}>
                  <div style={styles.title}>Statistiken</div>
                  <div style={styles.sub}>Matchhistorie, Spieler, Highscores</div>
                </button>

                {/* EINSTELLUNGEN */}
                <button onClick={() => setView('profiles-menu')} style={styles.tile}>
                  <div style={styles.title}>Einstellungen</div>
                  <div style={styles.sub}>Profile, Backup, Theme</div>
                </button>
              </div>
            </div>

            <div style={{ ...styles.sub, textAlign: 'center' }}>
              Gäste fügst du direkt im Spiel unter „Spieler" hinzu.
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
