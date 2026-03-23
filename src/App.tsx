// src/App.tsx
// Zentraler View-Switcher: Menü, Preset-Auswahl (NewGameStart), NewGame-Config,
// Cricket-Setup, Live-Games (X01 & Cricket), Summary-Screens,
// StatsArea (ausgelagert), Profile-Verwaltung

import React, { useMemo, useState, useCallback, useEffect } from 'react'
import { ui, getThemedUI } from './ui'
import { useTheme } from './ThemeProvider'
import type { AppTheme } from './theme'
import { showToast } from './components/Toast'

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
  createCTFMatchShell,
  migrateATBCaptureMatchesToCTF,
  cleanupStaleUnfinishedMatches,
  setLastOpenCTFMatchId,
  getOpenCTFMatch,
  getCTFMatchById,
  createShanghaiMatchShell,
  setLastOpenShanghaiMatchId,
  getOpenShanghaiMatch,
  getShanghaiMatchById,
  getOpenKillerMatch,
  getKillerMatchById,
  createBobs27MatchShell,
  setLastOpenBobs27MatchId,
  getOpenBobs27Match,
  getBobs27MatchById,
  createOperationMatchShell,
  setLastOpenOperationMatchId,
  getOpenOperationMatch,
  getOperationMatchById,
  createCheckoutTrainerMatchShell,
  type StoredMatch,
} from './storage'

// Auth
import { useAuth } from './auth/AuthContext'
const LoginScreen = React.lazy(() => import('./screens/LoginScreen'))

// X01 Engine Types
import { id as genId, now, type MatchStarted, type DartsEvent } from './darts501'

// Types (erased at compile time)
import type { Preset } from './screens/NewGameStart'

// Lazy-loaded NewGame & Profile Screens
const NewGame = React.lazy(() => import('./screens/NewGame'))
const NewGameStart = React.lazy(() => import('./screens/NewGameStart'))
const CreateProfile = React.lazy(() => import('./screens/CreateProfile'))
const ProfileList = React.lazy(() => import('./screens/ProfileList'))
const NewGameCricket = React.lazy(() => import('./screens/NewGameCricket'))
const NewGameATB = React.lazy(() => import('./screens/NewGameATB'))
const NewGame121 = React.lazy(() => import('./screens/NewGame121'))
const NewGameStraeusschen = React.lazy(() => import('./screens/NewGameStraeusschen'))
const NewGameHighscore = React.lazy(() => import('./screens/NewGameHighscore'))
const NewGameCTF = React.lazy(() => import('./screens/NewGameCTF'))
const NewGameShanghai = React.lazy(() => import('./screens/NewGameShanghai'))
const NewGameKiller = React.lazy(() => import('./screens/NewGameKiller'))
const NewGameBobs27 = React.lazy(() => import('./screens/NewGameBobs27'))
const NewGameOperation = React.lazy(() => import('./screens/NewGameOperation'))
const CheckoutQuiz = React.lazy(() => import('./screens/CheckoutQuiz'))

// Lazy-loaded Game Screens, Summaries & Stats
const Game = React.lazy(() => import('./screens/Game'))
const GameCricket = React.lazy(() => import('./screens/GameCricket'))
const GameATB = React.lazy(() => import('./screens/GameATB'))
const GameStraeusschen = React.lazy(() => import('./screens/GameStraeusschen'))
const GameHighscore = React.lazy(() => import('./screens/GameHighscore'))
const GameCTF = React.lazy(() => import('./screens/GameCTF'))
const GameShanghai = React.lazy(() => import('./screens/GameShanghai'))
const GameKiller = React.lazy(() => import('./screens/GameKiller'))
const GameBobs27 = React.lazy(() => import('./screens/GameBobs27'))
const GameOperation = React.lazy(() => import('./screens/GameOperation'))
const GameCheckoutTrainer = React.lazy(() => import('./screens/GameCheckoutTrainer'))
const StatsArea = React.lazy(() => import('./screens/stats/StatsArea'))
const CricketSummary = React.lazy(() => import('./screens/CricketSummary'))
const ATBSummary = React.lazy(() => import('./screens/ATBSummary'))
const StraeusschenSummary = React.lazy(() => import('./screens/StraeusschenSummary'))
const HighscoreSummary = React.lazy(() => import('./screens/HighscoreSummary'))
const CTFSummary = React.lazy(() => import('./screens/CTFSummary'))
const ShanghaiSummary = React.lazy(() => import('./screens/ShanghaiSummary'))
const KillerSummary = React.lazy(() => import('./screens/KillerSummary'))
const Bobs27Summary = React.lazy(() => import('./screens/Bobs27Summary'))
const OperationSummary = React.lazy(() => import('./screens/OperationSummary'))

// Zufallsspiel (lazy)
const NewGameRandom = React.lazy(() => import('./screens/NewGameRandom'))
import { generateRandomGame, describeRandomGame } from './randomGame'

// Multiplayer
import { useMultiplayerRoom, MultiplayerLobby } from './multiplayer'
import type { DartsEvent as DartsEventType } from './darts501'

// Arcade Scroll Picker
import ArcadeScrollPicker, { type PickerItem } from './components/ArcadeScrollPicker'

// --- Main Menu SVG Icons (24x24) ---
const MenuIconContinue = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
    <rect x="2" y="3" width="20" height="18" rx="3" fill="#1d3557" />
    <polygon points="10,8 17,12 10,16" fill="#a8dadc" />
  </svg>
)

const MenuIconNewGame = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="12" r="10" fill="#2d6a4f" />
    <line x1="12" y1="7" x2="12" y2="17" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" />
    <line x1="7" y1="12" x2="17" y2="12" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" />
  </svg>
)

const MenuIconStats = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
    <rect x="3" y="14" width="4" height="7" rx="1" fill="#e76f51" />
    <rect x="10" y="8" width="4" height="13" rx="1" fill="#f4a261" />
    <rect x="17" y="3" width="4" height="18" rx="1" fill="#2a9d8f" />
  </svg>
)

const MenuIconSettings = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="12" r="4" fill="#6c757d" />
    <circle cx="12" cy="12" r="9" stroke="#6c757d" strokeWidth="2" fill="none" strokeDasharray="4 3" />
    <circle cx="12" cy="12" r="2" fill="#adb5bd" />
  </svg>
)

const menuAccentColors = {
  continue: '#1d3557',
  newGame: '#2d6a4f',
  stats: '#e76f51',
  settings: '#6c757d',
}

// Speech (Einstellungen)
import { getVoiceLang, setVoiceLang, type SpeechLang } from './speech'

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
  | 'new-ctf'
  | 'game-ctf'
  | 'summary-ctf'
  | 'new-shanghai'
  | 'game-shanghai'
  | 'summary-shanghai'
  | 'new-killer'
  | 'game-killer'
  | 'summary-killer'
  | 'new-bobs27'
  | 'game-bobs27'
  | 'summary-bobs27'
  | 'new-operation'
  | 'game-operation'
  | 'summary-operation'
  | 'stats-area'
  // Profiles/Backup
  | 'create-profile'
  | 'profiles'
  | 'profiles-menu'
  | 'settings'
  | 'multiplayer-lobby-host'
  | 'multiplayer-lobby-join'
  | 'checkout-quiz'
  | 'game-checkout-trainer'
  | 'multiplayer-game'

export default function App() {
  // Theme System
  const { theme, setTheme, colors, isArcade } = useTheme()
  const styles = useMemo(() => getThemedUI(colors, isArcade), [colors, isArcade])

  // SQLite Loading State
  const [dbLoading, setDbLoading] = useState(true)

  // Menu keyboard navigation refs (must be declared before any early returns)
  const menuBtnRefs = React.useRef<(HTMLButtonElement | null)[]>([])
  const [menuFocus, setMenuFocus] = React.useState(1)
  const [dbError, setDbError] = useState<string | null>(null)

  // SQLite beim App-Start initialisieren
  useEffect(() => {
    let mounted = true

    async function init() {
      try {
        const result = await startupWithSQLite()
        if (!mounted) return

        // One-time migration: ATB Capture/Pirate → CTF
        try {
          migrateATBCaptureMatchesToCTF()
        } catch (e) {
          console.error('[Migration] ATB→CTF migration failed:', e)
        }

        // Cleanup: Unbeendete Spiele älter als 100 Stunden löschen
        try {
          cleanupStaleUnfinishedMatches()
        } catch (e) {
          console.error('[Cleanup] Stale match cleanup failed:', e)
        }

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

  // Menu keyboard navigation (arrow keys + enter)
  React.useEffect(() => {
    if (view !== 'menu' || isArcade) return
    const handle = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setMenuFocus(f => { const next = Math.min(f + 1, 3); menuBtnRefs.current[next]?.focus(); return next })
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setMenuFocus(f => { const next = Math.max(f - 1, 0); menuBtnRefs.current[next]?.focus(); return next })
      } else if (e.key === 'Enter') {
        menuBtnRefs.current[menuFocus]?.click()
      }
    }
    window.addEventListener('keydown', handle)
    setTimeout(() => menuBtnRefs.current[1]?.focus(), 100)
    return () => window.removeEventListener('keydown', handle)
  }, [view, isArcade, menuFocus])

  // Backspace/Escape-Navigation: einen Menüpunkt zurück
  useEffect(() => {
    const handleBackspace = (e: KeyboardEvent) => {
      if (e.key !== 'Backspace' && e.key !== 'Escape') return
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return

      const backMap: Partial<Record<View, View>> = {
        'profiles-menu': 'menu',
        'settings': 'profiles-menu',
        'profiles': 'profiles-menu',
        'create-profile': 'profiles-menu',
      }

      const target = backMap[view]
      if (target) {
        e.preventDefault()
        setView(target)
      }
    }

    window.addEventListener('keydown', handleBackspace)
    return () => window.removeEventListener('keydown', handleBackspace)
  }, [view])

  // Arcade Picker Indices
  const [menuPickerIndex, setMenuPickerIndex] = useState(0)
  const [profilesPickerIndex, setProfilesPickerIndex] = useState(0)

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

  // CTF Match IDs
  const [activeCTFId, setActiveCTFId] = useState<string | undefined>(() => getOpenCTFMatch()?.id)
  const [summaryCTFId, setSummaryCTFId] = useState<string | undefined>(undefined)

  // Shanghai Match IDs
  const [activeShanghaiId, setActiveShanghaiId] = useState<string | undefined>(() => getOpenShanghaiMatch()?.id)
  const [summaryShanghaiId, setSummaryShanghaiId] = useState<string | undefined>(undefined)

  // Killer Match IDs
  const [activeKillerId, setActiveKillerId] = useState<string | undefined>(() => getOpenKillerMatch()?.id)
  const [summaryKillerId, setSummaryKillerId] = useState<string | undefined>(undefined)

  // Bob's 27 Match IDs
  const [activeBobs27Id, setActiveBobs27Id] = useState<string | undefined>(() => getOpenBobs27Match()?.id)
  const [summaryBobs27Id, setSummaryBobs27Id] = useState<string | undefined>(undefined)

  // Operation Match IDs
  const [activeOperationId, setActiveOperationId] = useState<string | undefined>(() => getOpenOperationMatch()?.id)
  const [summaryOperationId, setSummaryOperationId] = useState<string | undefined>(undefined)

  // Checkout Trainer Match ID
  const [activeCheckoutTrainerId, setActiveCheckoutTrainerId] = useState<string | undefined>()

  // --- Multiplayer State ---
  const [isMultiplayerSetup, setIsMultiplayerSetup] = useState(false)
  const [multiplayerRoomCode, setMultiplayerRoomCode] = useState<string | null>(null)
  const [multiplayerMatchId, setMultiplayerMatchId] = useState<string | null>(null)
  const [multiplayerMyPlayerId, setMultiplayerMyPlayerId] = useState<string>('')
  const [multiplayerRemoteEvents, setMultiplayerRemoteEvents] = useState<DartsEventType[] | null>(null)
  const [multiplayerGameType, setMultiplayerGameType] = useState<string>('x01')

  const [mpState, mpActions] = useMultiplayerRoom(
    multiplayerRoomCode,
    // onRemoteEvents: sync remote events to local state
    (evts, fromIndex) => {
      if (fromIndex === 0) {
        // Full sync
        setMultiplayerRemoteEvents(evts)
      } else {
        // Incremental
        setMultiplayerRemoteEvents(prev => prev ? [...prev, ...evts] : evts)
      }
    },
    // onRemoteUndo: server sent truncated event log
    (evts) => {
      setMultiplayerRemoteEvents(evts)
    },
  )

  const openMatch = getOpenMatch()
  const openCricket = getOpenCricketMatch()
  const openATB = getOpenATBMatch()
  const openStr = getOpenStrMatch()
  const openHighscore = getOpenHighscoreMatch()
  const openCTF = getOpenCTFMatch()
  const openShanghai = getOpenShanghaiMatch()
  const openKiller = getOpenKillerMatch()
  const openBobs27 = getOpenBobs27Match()
  const openOperation = getOpenOperationMatch()

  // Wer soll bei "Spiel fortsetzen" genommen werden?
  const continueInfo = useMemo(() => {
    const act = getLastActivity()

    function buildResult(kind: 'x01' | 'cricket' | 'atb' | 'str' | 'highscore' | 'ctf' | 'shanghai' | 'killer' | 'bobs27' | 'operation') {
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
      } else if (kind === 'ctf') {
        if (openCTF && !openCTF.finished) {
          return { kind: 'ctf' as const, id: openCTF.id, title: openCTF.title }
        }
      } else if (kind === 'shanghai') {
        if (openShanghai && !openShanghai.finished) {
          return { kind: 'shanghai' as const, id: openShanghai.id, title: openShanghai.title }
        }
      } else if (kind === 'killer') {
        if (openKiller && !openKiller.finished) {
          return { kind: 'killer' as const, id: openKiller.id, title: openKiller.title }
        }
      } else if (kind === 'bobs27') {
        if (openBobs27 && !openBobs27.finished) {
          return { kind: 'bobs27' as const, id: openBobs27.id, title: openBobs27.title }
        }
      } else if (kind === 'operation') {
        if (openOperation && !openOperation.finished) {
          return { kind: 'operation' as const, id: openOperation.id, title: openOperation.title }
        }
      }
      return null
    }

    // 1) bevorzugt das zuletzt aktive
    if (act && act.matchExists && !act.finished) {
      const pref = buildResult(act.kind as 'x01' | 'cricket' | 'atb' | 'str' | 'highscore' | 'ctf' | 'shanghai' | 'killer' | 'bobs27' | 'operation')
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
    // 7) fallback: CTF
    const ctfRes = buildResult('ctf')
    if (ctfRes) return ctfRes
    // 8) fallback: Shanghai
    const shanghaiRes = buildResult('shanghai')
    if (shanghaiRes) return shanghaiRes
    // 9) fallback: Killer
    const killerRes = buildResult('killer')
    if (killerRes) return killerRes
    // 10) fallback: Bob's 27
    const bobs27Res = buildResult('bobs27')
    if (bobs27Res) return bobs27Res
    // 11) fallback: Operation
    const operationRes = buildResult('operation')
    if (operationRes) return operationRes
    // 12) nix offen
    return null
  }, [openMatch, openCricket, openATB, openStr, openHighscore, openCTF, openShanghai, openKiller, openBobs27, openOperation])

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

  // ---------- Auth Gate ----------
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const auth = useAuth()
  if (!auth.user) {
    return <LoginScreen />
  }

  // ---------- View Routing ----------

  // PRESET-AUSWAHL (X01 / Cricket)
  if (view === 'new-start') {
    return (
      <div className="screen-enter" key="new-start">
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
        onSelectCTF={() => {
          setView('new-ctf')
        }}
        onSelectShanghai={() => {
          setView('new-shanghai')
        }}
        onSelectKiller={() => {
          setView('new-killer')
        }}
        onSelectBobs27={() => {
          setView('new-bobs27')
        }}
        onSelectOperation={() => {
          setView('new-operation')
        }}
        onSelectCheckoutQuiz={() => {
          setView('checkout-quiz')
        }}
        onSelectCheckoutTrainer={() => {
          // Spielerauswahl findet jetzt im GameCheckoutTrainer statt (players Phase)
          setActiveCheckoutTrainerId('pending')
          setView('game-checkout-trainer')
        }}
        onMultiplayerHost={() => {
          const profiles = getProfiles()
          if (profiles.length === 0) {
            alert('Erstelle zuerst ein Profil unter Einstellungen')
            return
          }
          setMultiplayerMyPlayerId(profiles[0].id)
          setIsMultiplayerSetup(true)
          setView('new-start')
        }}
        onMultiplayerJoin={() => {
          const profiles = getProfiles()
          if (profiles.length === 0) {
            alert('Erstelle zuerst ein Profil unter Einstellungen')
            return
          }
          setMultiplayerMyPlayerId(profiles[0].id)
          setView('multiplayer-lobby-join')
        }}
      />
      </div>
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
        onCancel={() => {
          setIsMultiplayerSetup(false)
          setView('new-start')
        }}
        onStarted={(matchId) => {
          if (isMultiplayerSetup) {
            // Multiplayer: Load match events and go to lobby
            setIsMultiplayerSetup(false)
            const stored = getMatches().find((m: any) => m.id === matchId)
            if (stored) {
              setMultiplayerMatchId(matchId)
              setMultiplayerGameType('x01')
              setMultiplayerRemoteEvents(stored.events as DartsEventType[])
              setView('multiplayer-lobby-host')
            } else {
              setView('menu')
            }
          } else {
            setActiveMatchId(matchId)
            setLastActivity('x01', matchId)
            setView('game')
          }
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

          if (isMultiplayerSetup) {
            setIsMultiplayerSetup(false)
            setMultiplayerMatchId(stored.id)
            setMultiplayerGameType('cricket')
            setMultiplayerRemoteEvents(stored.events as any[])
            setView('multiplayer-lobby-host')
          } else {
            setLastOpenCricketMatchId(stored.id)
            setActiveCricketId(stored.id)
            setLastActivity('cricket', stored.id)
            setView('game-cricket')
          }
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

          if (isMultiplayerSetup) {
            setIsMultiplayerSetup(false)
            setMultiplayerMatchId(stored.id)
            setMultiplayerGameType('atb')
            setMultiplayerRemoteEvents(stored.events as any[])
            setView('multiplayer-lobby-host')
          } else {
            setLastOpenATBMatchId(stored.id)
            setActiveATBId(stored.id)
            setLastActivity('atb', stored.id)
            setView('game-atb')
          }
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

          if (isMultiplayerSetup) {
            setIsMultiplayerSetup(false)
            setMultiplayerMatchId(stored.id)
            setMultiplayerGameType('str')
            setMultiplayerRemoteEvents(stored.events as any[])
            setView('multiplayer-lobby-host')
          } else {
            setLastOpenStrMatchId(stored.id)
            setActiveStrId(stored.id)
            setLastActivity('str', stored.id)
            setView('game-str')
          }
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

          if (isMultiplayerSetup) {
            setIsMultiplayerSetup(false)
            setMultiplayerMatchId(stored.id)
            setMultiplayerGameType('highscore')
            setMultiplayerRemoteEvents(stored.events as any[])
            setView('multiplayer-lobby-host')
          } else {
            setLastOpenHighscoreMatchId(stored.id)
            setActiveHighscoreId(stored.id)
            setLastActivity('highscore', stored.id)
            setView('game-highscore')
          }
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

  // CAPTURE THE FIELD KONFIG
  if (view === 'new-ctf') {
    return (
      <NewGameCTF
        onCancel={() => setView('new-start')}
        onStart={({ players, structure, config }) => {
          const stored = createCTFMatchShell({
            players: players.map((p) => ({ playerId: p.id, name: p.name, isGuest: p.isGuest })),
            structure,
            config,
          })

          if (isMultiplayerSetup) {
            setIsMultiplayerSetup(false)
            setMultiplayerMatchId(stored.id)
            setMultiplayerGameType('ctf')
            setMultiplayerRemoteEvents(stored.events as any[])
            setView('multiplayer-lobby-host')
          } else {
            setLastOpenCTFMatchId(stored.id)
            setActiveCTFId(stored.id)
            setLastActivity('ctf', stored.id)
            setView('game-ctf')
          }
        }}
      />
    )
  }

  // CAPTURE THE FIELD LIVE GAME
  if (view === 'game-ctf' && activeCTFId) {
    return (
      <GameCTF
        matchId={activeCTFId}
        onExit={() => {
          setView('menu')
          setActiveCTFId(undefined)
        }}
        onShowSummary={(id) => {
          setSummaryCTFId(id)
          setView('summary-ctf')
        }}
      />
    )
  }

  // CAPTURE THE FIELD SUMMARY
  if (view === 'summary-ctf' && summaryCTFId) {
    return (
      <CTFSummary
        matchId={summaryCTFId}
        onBackToMenu={() => {
          setView('menu')
          setSummaryCTFId(undefined)
        }}
        onRematch={(oldMatchId: string) => {
          const oldData = getCTFMatchById(oldMatchId)
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

          const newStored = createCTFMatchShell({
            players: rotatedPlayers.map((p) => ({ playerId: p.playerId, name: p.name, isGuest: p.isGuest })),
            structure: oldData.structure,
            config: oldData.config,
          })

          setLastOpenCTFMatchId(newStored.id)
          setActiveCTFId(newStored.id)
          setLastActivity('ctf', newStored.id)
          setSummaryCTFId(undefined)
          setView('game-ctf')
        }}
      />
    )
  }

  // SHANGHAI KONFIG
  if (view === 'new-shanghai') {
    return (
      <NewGameShanghai
        onCancel={() => setView('new-start')}
        onStart={({ players, structure }) => {
          const stored = createShanghaiMatchShell({
            players: players.map((p) => ({ playerId: p.id, name: p.name, isGuest: p.isGuest })),
            structure,
          })

          if (isMultiplayerSetup) {
            setIsMultiplayerSetup(false)
            setMultiplayerMatchId(stored.id)
            setMultiplayerGameType('shanghai')
            setMultiplayerRemoteEvents(stored.events as any[])
            setView('multiplayer-lobby-host')
          } else {
            setLastOpenShanghaiMatchId(stored.id)
            setActiveShanghaiId(stored.id)
            setLastActivity('shanghai', stored.id)
            setView('game-shanghai')
          }
        }}
      />
    )
  }

  // SHANGHAI LIVE GAME
  if (view === 'game-shanghai' && activeShanghaiId) {
    return (
      <GameShanghai
        matchId={activeShanghaiId}
        onExit={() => {
          setView('menu')
          setActiveShanghaiId(undefined)
        }}
        onShowSummary={(id) => {
          setSummaryShanghaiId(id)
          setView('summary-shanghai')
        }}
      />
    )
  }

  // SHANGHAI SUMMARY
  if (view === 'summary-shanghai' && summaryShanghaiId) {
    return (
      <ShanghaiSummary
        matchId={summaryShanghaiId}
        onBackToMenu={() => {
          setView('menu')
          setSummaryShanghaiId(undefined)
        }}
        onRematch={(oldMatchId: string) => {
          const oldData = getShanghaiMatchById(oldMatchId)
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

          const newStored = createShanghaiMatchShell({
            players: rotatedPlayers.map((p) => ({ playerId: p.playerId, name: p.name, isGuest: p.isGuest })),
            structure: oldData.structure,
          })

          setLastOpenShanghaiMatchId(newStored.id)
          setActiveShanghaiId(newStored.id)
          setLastActivity('shanghai', newStored.id)
          setSummaryShanghaiId(undefined)
          setView('game-shanghai')
        }}
      />
    )
  }

  // KILLER KONFIG
  if (view === 'new-killer') {
    return (
      <NewGameKiller
        profiles={getProfiles()}
        onStart={(matchId) => {
          if (isMultiplayerSetup) {
            setIsMultiplayerSetup(false)
            const stored = getKillerMatchById(matchId)
            if (stored) {
              setMultiplayerMatchId(matchId)
              setMultiplayerGameType('killer')
              setMultiplayerRemoteEvents(stored.events as any[])
              setView('multiplayer-lobby-host')
            } else {
              setView('menu')
            }
          } else {
            setActiveKillerId(matchId)
            setLastActivity('killer', matchId)
            setView('game-killer')
          }
        }}
        onBack={() => setView('new-start')}
      />
    )
  }

  // KILLER LIVE GAME
  if (view === 'game-killer' && activeKillerId) {
    return (
      <GameKiller
        matchId={activeKillerId}
        onFinish={(id) => {
          setSummaryKillerId(id)
          setView('summary-killer')
        }}
        onAbort={() => {
          setView('menu')
          setActiveKillerId(undefined)
        }}
      />
    )
  }

  // KILLER SUMMARY
  if (view === 'summary-killer' && summaryKillerId) {
    return (
      <KillerSummary
        matchId={summaryKillerId}
        onBack={() => {
          setView('menu')
          setSummaryKillerId(undefined)
        }}
        onRematch={() => {
          const oldData = getKillerMatchById(summaryKillerId)
          if (!oldData) {
            setView('menu')
            return
          }
          setSummaryKillerId(undefined)
          setView('new-killer')
        }}
      />
    )
  }

  // BOB'S 27 KONFIG
  if (view === 'new-bobs27') {
    return (
      <NewGameBobs27
        onCancel={() => setView('new-start')}
        onStart={(data) => {
          const match = createBobs27MatchShell({
            players: data.players.map(p => ({ playerId: p.id, name: p.name, isGuest: p.isGuest })),
            config: data.config,
          })
          if (isMultiplayerSetup) {
            setIsMultiplayerSetup(false)
            setMultiplayerMatchId(match.id)
            setMultiplayerGameType('bobs27')
            setMultiplayerRemoteEvents(match.events as any[])
            setView('multiplayer-lobby-host')
          } else {
            setActiveBobs27Id(match.id)
            setLastOpenBobs27MatchId(match.id)
            setLastActivity('bobs27', match.id)
            setView('game-bobs27')
          }
        }}
      />
    )
  }

  // BOB'S 27 LIVE GAME
  if (view === 'game-bobs27' && activeBobs27Id) {
    return (
      <GameBobs27
        matchId={activeBobs27Id}
        onExit={() => setView('menu')}
        onShowSummary={(id) => {
          setSummaryBobs27Id(id)
          setView('summary-bobs27')
        }}
      />
    )
  }

  // BOB'S 27 SUMMARY
  if (view === 'summary-bobs27' && summaryBobs27Id) {
    return (
      <Bobs27Summary
        matchId={summaryBobs27Id}
        onBackToMenu={() => {
          setView('menu')
          setSummaryBobs27Id(undefined)
        }}
        onRematch={() => {
          const oldData = getBobs27MatchById(summaryBobs27Id)
          if (!oldData) {
            setView('menu')
            return
          }
          const match = createBobs27MatchShell({
            players: oldData.players.map(p => ({ playerId: p.playerId, name: p.name, isGuest: p.isGuest })),
            config: oldData.config,
          })
          setActiveBobs27Id(match.id)
          setLastOpenBobs27MatchId(match.id)
          setLastActivity('bobs27', match.id)
          setSummaryBobs27Id(undefined)
          setView('game-bobs27')
        }}
      />
    )
  }

  // OPERATION KONFIG
  if (view === 'new-operation') {
    return (
      <NewGameOperation
        onCancel={() => setView('new-start')}
        onStart={(data) => {
          const match = createOperationMatchShell({
            players: data.players.map(p => ({ playerId: p.id, name: p.name, isGuest: p.isGuest })),
            config: data.config,
          })
          if (isMultiplayerSetup) {
            setIsMultiplayerSetup(false)
            setMultiplayerMatchId(match.id)
            setMultiplayerGameType('operation')
            setMultiplayerRemoteEvents(match.events as any[])
            setView('multiplayer-lobby-host')
          } else {
            setActiveOperationId(match.id)
            setLastOpenOperationMatchId(match.id)
            setLastActivity('operation', match.id)
            setView('game-operation')
          }
        }}
      />
    )
  }

  // OPERATION LIVE GAME
  if (view === 'game-operation' && activeOperationId) {
    return (
      <GameOperation
        matchId={activeOperationId}
        onExit={() => setView('menu')}
        onShowSummary={(id) => {
          setSummaryOperationId(id)
          setView('summary-operation')
        }}
      />
    )
  }

  // OPERATION SUMMARY
  if (view === 'summary-operation' && summaryOperationId) {
    return (
      <OperationSummary
        matchId={summaryOperationId}
        onBackToMenu={() => {
          setView('menu')
          setSummaryOperationId(undefined)
        }}
        onRematch={() => {
          const oldData = getOperationMatchById(summaryOperationId)
          if (!oldData) {
            setView('menu')
            return
          }
          const match = createOperationMatchShell({
            players: oldData.players.map(p => ({ playerId: p.playerId, name: p.name, isGuest: p.isGuest })),
            config: oldData.config,
          })
          setActiveOperationId(match.id)
          setLastOpenOperationMatchId(match.id)
          setLastActivity('operation', match.id)
          setSummaryOperationId(undefined)
          setView('game-operation')
        }}
      />
    )
  }

  // CHECKOUT QUIZ
  if (view === 'checkout-quiz') {
    return <CheckoutQuiz onBack={() => setView('new-start')} />
  }

  // CHECKOUT TRAINER
  if (view === 'game-checkout-trainer' && activeCheckoutTrainerId) {
    return (
      <GameCheckoutTrainer
        matchId={activeCheckoutTrainerId}
        onMatchCreated={(newMatchId) => setActiveCheckoutTrainerId(newMatchId)}
        onExit={() => {
          setActiveCheckoutTrainerId(undefined)
          setView('menu')
        }}
        onShowSummary={(id) => {
          // Summary ist inline im GameCheckoutTrainer
          // Nach Fertig-Button → zurück zum Menü
          setActiveCheckoutTrainerId(undefined)
          setView('menu')
        }}
      />
    )
  }

  // MULTIPLAYER LOBBY (Host)
  if (view === 'multiplayer-lobby-host' && multiplayerMatchId) {
    return (
      <MultiplayerLobby
        mode="host"
        status={mpState.status}
        players={mpState.players}
        phase={mpState.phase}
        error={mpState.error}
        myPlayerId={multiplayerMyPlayerId}
        roomCode={multiplayerRoomCode ?? ''}
        onCreateRoom={(code) => {
          setMultiplayerRoomCode(code)
          // Message will be queued until socket is open
          const profiles = getProfiles()
          const myProfile = profiles.find(p => p.id === multiplayerMyPlayerId)
          mpActions.createRoom(multiplayerMatchId!, multiplayerGameType ?? 'x01', {
            playerId: multiplayerMyPlayerId,
            name: myProfile?.name ?? multiplayerMyPlayerId,
            color: myProfile?.color,
          }, multiplayerRemoteEvents ?? [])
        }}
        onJoinRoom={() => {}}
        onReady={() => mpActions.playerReady(multiplayerMyPlayerId)}
        onGameStart={() => {
          setActiveMatchId(multiplayerMatchId!)
          setView('multiplayer-game')
        }}
        onBack={() => {
          mpActions.disconnect()
          setMultiplayerRoomCode(null)
          setMultiplayerMatchId(null)
          setMultiplayerRemoteEvents(null)
          setView('menu')
        }}
      />
    )
  }

  // MULTIPLAYER LOBBY (Join)
  if (view === 'multiplayer-lobby-join') {
    return (
      <MultiplayerLobby
        mode="join"
        status={mpState.status}
        players={mpState.players}
        phase={mpState.phase}
        error={mpState.error}
        myPlayerId={multiplayerMyPlayerId}
        roomCode={multiplayerRoomCode ?? ''}
        onCreateRoom={() => {}}
        onJoinRoom={(code) => {
          setMultiplayerRoomCode(code)
          // Message will be queued until socket is open
          const profiles = getProfiles()
          const myProfile = profiles.find(p => p.id === multiplayerMyPlayerId)
          mpActions.joinRoom(code, {
            playerId: multiplayerMyPlayerId,
            name: myProfile?.name ?? multiplayerMyPlayerId,
            color: myProfile?.color,
          })
        }}
        onReady={() => mpActions.playerReady(multiplayerMyPlayerId)}
        onGameStart={() => {
          // Detect game type and matchId from synced events
          const firstEvent = mpState.events[0] as any
          if (firstEvent) {
            setMultiplayerMatchId(firstEvent.matchId)
            // Detect game type from first event type
            const eventType: string = firstEvent.type ?? ''
            if (eventType.startsWith('Cricket')) setMultiplayerGameType('cricket')
            else if (eventType.startsWith('ATB')) setMultiplayerGameType('atb')
            else if (eventType.startsWith('Str')) setMultiplayerGameType('str')
            else if (eventType.startsWith('Highscore')) setMultiplayerGameType('highscore')
            else if (eventType.startsWith('CTF')) setMultiplayerGameType('ctf')
            else if (eventType.startsWith('Shanghai')) setMultiplayerGameType('shanghai')
            else if (eventType.startsWith('Killer')) setMultiplayerGameType('killer')
            else if (eventType.startsWith('Bobs27')) setMultiplayerGameType('bobs27')
            else if (eventType.startsWith('Operation')) setMultiplayerGameType('operation')
            else setMultiplayerGameType('x01')
          }
          setView('multiplayer-game')
        }}
        onBack={() => {
          mpActions.disconnect()
          setMultiplayerRoomCode(null)
          setMultiplayerMatchId(null)
          setMultiplayerRemoteEvents(null)
          setView('menu')
        }}
      />
    )
  }

  // MULTIPLAYER GAME (routes to correct game component based on gameType)
  if (view === 'multiplayer-game' && multiplayerMatchId) {
    const mpProps = {
      enabled: true as const,
      roomCode: multiplayerRoomCode ?? '',
      myPlayerId: multiplayerMyPlayerId,
      submitEvents: mpActions.submitEvents,
      undo: mpActions.undo,
      remoteEvents: multiplayerRemoteEvents,
      connectionStatus: mpState.status,
      playerCount: mpState.players.filter(p => p.connected).length,
    }
    const mpOnExit = () => {
      mpActions.disconnect()
      setMultiplayerRoomCode(null)
      setMultiplayerMatchId(null)
      setMultiplayerRemoteEvents(null)
      setActiveMatchId(undefined)
      setView('menu')
    }

    if (multiplayerGameType === 'cricket') {
      return (
        <GameCricket
          matchId={multiplayerMatchId}
          onExit={mpOnExit}
          onShowCricketSummary={(id) => {
            mpActions.disconnect()
            setActiveCricketId(id)
            setView('summary-cricket')
          }}
          multiplayer={mpProps}
        />
      )
    }

    if (multiplayerGameType === 'atb') {
      return (
        <GameATB
          matchId={multiplayerMatchId}
          onExit={mpOnExit}
          onShowSummary={(id) => {
            mpActions.disconnect()
            setSummaryATBId(id)
            setView('summary-atb')
          }}
          multiplayer={mpProps}
        />
      )
    }

    if (multiplayerGameType === 'str') {
      return (
        <GameStraeusschen
          matchId={multiplayerMatchId}
          onExit={mpOnExit}
          onShowSummary={(id) => {
            mpActions.disconnect()
            setSummaryStrId(id)
            setView('summary-str')
          }}
          multiplayer={mpProps}
        />
      )
    }

    if (multiplayerGameType === 'highscore') {
      return (
        <GameHighscore
          matchId={multiplayerMatchId}
          onExit={mpOnExit}
          onShowSummary={(id) => {
            mpActions.disconnect()
            setSummaryHighscoreId(id)
            setView('summary-highscore')
          }}
          multiplayer={mpProps}
        />
      )
    }

    if (multiplayerGameType === 'ctf') {
      return (
        <GameCTF
          matchId={multiplayerMatchId}
          onExit={mpOnExit}
          onShowSummary={(id) => {
            mpActions.disconnect()
            setSummaryCTFId(id)
            setView('summary-ctf')
          }}
          multiplayer={mpProps}
        />
      )
    }

    if (multiplayerGameType === 'shanghai') {
      return (
        <GameShanghai
          matchId={multiplayerMatchId}
          onExit={mpOnExit}
          onShowSummary={(id) => {
            mpActions.disconnect()
            setSummaryShanghaiId(id)
            setView('summary-shanghai')
          }}
          multiplayer={mpProps}
        />
      )
    }

    if (multiplayerGameType === 'killer') {
      return (
        <GameKiller
          matchId={multiplayerMatchId}
          onFinish={(id) => {
            mpActions.disconnect()
            setSummaryKillerId(id)
            setView('summary-killer')
          }}
          onAbort={mpOnExit}
          multiplayer={mpProps}
        />
      )
    }

    if (multiplayerGameType === 'bobs27') {
      return (
        <GameBobs27
          matchId={multiplayerMatchId}
          onExit={mpOnExit}
          onShowSummary={(id) => {
            mpActions.disconnect()
            setActiveBobs27Id(id)
            setView('summary-bobs27')
          }}
          multiplayer={mpProps}
        />
      )
    }

    if (multiplayerGameType === 'operation') {
      return (
        <GameOperation
          matchId={multiplayerMatchId}
          onExit={mpOnExit}
          onShowSummary={(id) => {
            mpActions.disconnect()
            setActiveOperationId(id)
            setView('summary-operation')
          }}
          multiplayer={mpProps}
        />
      )
    }

    // Default: X01
    return (
      <Game
        matchId={multiplayerMatchId}
        onExit={mpOnExit}
        onNewGame={() => setView('new-start')}
        multiplayer={mpProps}
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
      <div className="screen-enter" key="stats-area">
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
      </div>
    )
  }

  // ---------- PROFILE / BACKUP (bleibt im Hauptmenü) ----------

  if (view === 'create-profile') {
    return <div className="screen-enter" key="create-profile"><CreateProfile onCancel={() => setView('profiles-menu')} onDone={() => setView('profiles-menu')} /></div>
  }

  if (view === 'profiles') {
    return <div className="screen-enter" key="profiles"><ProfileList onBack={() => setView('profiles-menu')} /></div>
  }

  // EINSTELLUNGEN (Theme, Kommentator-Stimme etc.)
  if (view === 'settings') {
    // screen-enter wrapper applied below in the return
    const currentLang = getVoiceLang()
    const voiceOptions: { value: SpeechLang; label: string; desc: string }[] = [
      { value: 'en', label: 'English', desc: 'Darts-Caller Stil (Standard)' },
      { value: 'de', label: 'Deutsch', desc: 'Deutscher Kommentator' },
      { value: 'fr', label: 'Français', desc: 'Commentateur français' },
      { value: 'it', label: 'Italiano', desc: 'Commentatore italiano' },
      { value: 'sv', label: 'Svenska', desc: 'Svensk kommentator' },
      { value: 'nl', label: 'Nederlands', desc: 'Nederlandse commentator' },
    ]

    const themeOptions: { value: AppTheme; label: string; desc: string }[] = [
      { value: 'normal', label: 'Normal', desc: 'Helles, klassisches Design' },
      { value: 'arcade', label: 'Arcade', desc: 'Dunkles LED-Design wie am Dartautomaten' },
    ]

    return (
      <div className="screen-enter" key="settings" style={{ ...styles.page, display: 'flex', flexDirection: 'column', minHeight: '100dvh' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 16px', marginBottom: 8 }}>
          <h1 style={{ margin: 0, color: colors.fg }}>Einstellungen</h1>
          <button style={styles.backBtn} onClick={() => setView('profiles-menu')}>← Zurück</button>
        </div>

        <div style={{ flex: 1, display: 'grid', placeItems: 'center' }}>
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
    const profilesItems: PickerItem[] = [
      { id: 'profiles', label: 'Profil bearbeiten', sub: 'Umbenennen & löschen', icon: <span style={{ fontSize: 20 }}>{'\u270F\uFE0F'}</span> },
      { id: 'create-profile', label: 'Neues Profil', sub: 'Spieler anlegen', icon: <span style={{ fontSize: 20 }}>{'\u2795'}</span> },
      { id: 'settings', label: 'Einstellungen', sub: 'Theme, Stimme', icon: <MenuIconSettings /> },
    ]

    const handleProfilesConfirm = (index: number) => {
      setView(profilesItems[index].id as View)
    }

    return (
      <div className="screen-enter" key="profiles-menu" style={{ ...styles.page, display: 'flex', flexDirection: 'column', minHeight: '100dvh' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px 0' }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: colors.fg }}>Einstellungen</h2>
          <button style={styles.backBtn} onClick={() => setView('menu')}>← Zurück</button>
        </div>
        <div style={{ height: 20 }} />
        <div style={{ flex: 1, display: 'grid', placeItems: 'center' }}>
          {isArcade ? (
            <div style={{ display: 'grid', gap: 12, width: 'min(480px, 92vw)' }}>
              <ArcadeScrollPicker
                items={profilesItems}
                selectedIndex={profilesPickerIndex}
                onChange={setProfilesPickerIndex}
                onConfirm={handleProfilesConfirm}
                colors={colors}
              />
            </div>
          ) : (
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
          )}
        </div>

      </div>
    )
  }

  // ---------- HAUPTMENÜ ----------

  const handleContinueGame = () => {
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
    } else if (continueInfo.kind === 'ctf') {
      setActiveCTFId(continueInfo.id)
      setLastActivity('ctf', continueInfo.id)
      setView('game-ctf')
    } else if (continueInfo.kind === 'shanghai') {
      setActiveShanghaiId(continueInfo.id)
      setLastActivity('shanghai', continueInfo.id)
      setView('game-shanghai')
    } else if (continueInfo.kind === 'killer') {
      setActiveKillerId(continueInfo.id)
      setLastActivity('killer', continueInfo.id)
      setView('game-killer')
    } else if (continueInfo.kind === 'bobs27') {
      setActiveBobs27Id(continueInfo.id)
      setLastActivity('bobs27', continueInfo.id)
      setView('game-bobs27')
    } else if (continueInfo.kind === 'operation') {
      setActiveOperationId(continueInfo.id)
      setLastActivity('operation', continueInfo.id)
      setView('game-operation')
    }
  }

  const menuItems: PickerItem[] = [
    { id: 'continue', label: 'Spiel fortsetzen', sub: continueInfo ? continueInfo.title : 'Kein laufendes Spiel', icon: <MenuIconContinue /> },
    { id: 'new-start', label: 'Neues Spiel', sub: 'X01 oder Cricket', icon: <MenuIconNewGame /> },
    { id: 'stats-area', label: 'Statistiken', sub: 'Matchhistorie, Spieler, Highscores', icon: <MenuIconStats /> },
    { id: 'profiles-menu', label: 'Einstellungen', sub: 'Profile, Theme', icon: <MenuIconSettings /> },
  ]

  const handleMenuConfirm = (index: number) => {
    const itemId = menuItems[index].id
    if (itemId === 'continue') handleContinueGame()
    else setView(itemId as View)
  }

  if (isArcade) {
    return (
      <div className="screen-enter" key="menu-arcade" style={{ ...styles.page, display: 'flex', flexDirection: 'column', minHeight: '100dvh' }}>
        <div style={{ flex: 1, display: 'grid', placeItems: 'center' }}>
          <div style={{ display: 'grid', gap: 12, width: 'min(480px, 92vw)' }}>
            <h1 style={{
              margin: 0,
              color: colors.fg,
              textAlign: 'center',
              fontSize: 28,
              fontWeight: 900,
              padding: '16px 0 8px',
              background: `linear-gradient(135deg, ${colors.bg}, #1a1a2e)`,
              borderRadius: 12,
            }}>Darts</h1>
            <ArcadeScrollPicker
              items={menuItems}
              selectedIndex={menuPickerIndex}
              onChange={setMenuPickerIndex}
              onConfirm={handleMenuConfirm}
              colors={colors}
            />
          </div>
        </div>
      </div>
    )
  }

  const menuTileStyle = (accent: string, disabled?: boolean): React.CSSProperties => ({
    ...styles.tile,
    ...(disabled ? styles.tileDisabled : {}),
    borderLeft: `4px solid ${accent}`,
    padding: '14px 16px',
    display: 'flex',
    alignItems: 'center',
    gap: 14,
  })

  return (
    <div className="screen-enter" key="menu" style={styles.page}>
      <div style={styles.centerPage}>
        <div style={styles.centerInner}>
          <div style={{ display: 'grid', gap: 12 }}>
            <h1 style={{
              margin: 0,
              color: colors.fg,
              fontSize: 28,
              fontWeight: 900,
              textAlign: 'center',
              padding: '16px 0 8px',
              background: `linear-gradient(135deg, ${colors.bg}, ${isArcade ? '#1a1a2e' : '#e2e8f0'})`,
              borderRadius: 12,
            }}>Darts</h1>

            <div style={styles.card}>
              <div style={{ display: 'grid', gap: 10 }}>
                {/* SPIEL FORTSETZEN */}
                <button
                  ref={el => { menuBtnRefs.current[0] = el }}
                  onClick={handleContinueGame}
                  disabled={!continueInfo}
                  style={menuTileStyle(menuAccentColors.continue, !continueInfo)}
                  title={continueInfo ? continueInfo.title : 'Kein laufendes Match'}
                >
                  <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}><MenuIconContinue /></div>
                  <div>
                    <div style={styles.title}>Spiel fortsetzen</div>
                    <div style={styles.sub}>{continueInfo ? continueInfo.title : 'Kein laufendes Spiel'}</div>
                  </div>
                </button>

                {/* NEUES SPIEL */}
                <button ref={el => { menuBtnRefs.current[1] = el }} onClick={() => setView('new-start')} style={menuTileStyle(menuAccentColors.newGame)}>
                  <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}><MenuIconNewGame /></div>
                  <div>
                    <div style={styles.title}>Neues Spiel</div>
                    <div style={styles.sub}>X01 oder Cricket</div>
                  </div>
                </button>

                {/* STATISTIKEN (ausgelagert) */}
                <button ref={el => { menuBtnRefs.current[2] = el }} onClick={() => setView('stats-area')} style={menuTileStyle(menuAccentColors.stats)}>
                  <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}><MenuIconStats /></div>
                  <div>
                    <div style={styles.title}>Statistiken</div>
                    <div style={styles.sub}>Matchhistorie, Spieler, Highscores</div>
                  </div>
                </button>

                {/* EINSTELLUNGEN */}
                <button ref={el => { menuBtnRefs.current[3] = el }} onClick={() => setView('profiles-menu')} style={menuTileStyle(menuAccentColors.settings)}>
                  <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}><MenuIconSettings /></div>
                  <div>
                    <div style={styles.title}>Einstellungen</div>
                    <div style={styles.sub}>Profile, Theme</div>
                  </div>
                </button>
              </div>
            </div>

            <div style={{ ...styles.sub, textAlign: 'center' }}>
              Gäste fügst du direkt im Spiel unter "Spieler" hinzu.
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
