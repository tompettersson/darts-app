// src/screens/GameHighscore.tsx
// Spielscreen für Highscore – Erreiche als Erster das Target!

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { isMatchFinishedInDB } from '../db/storage'
import { useGameState, useGameColors } from '../hooks/useGameState'
import {
  getHighscoreMatchById,
  persistHighscoreEvents,
  finishHighscoreMatch,
  setMatchPaused,
  setMatchElapsedTime,
  deleteHighscoreMatch,
  getProfiles,
  ensureHighscoreMatchExists,
  ensureHighscoreMatchExistsAsync,
} from '../storage'
import {
  applyHighscoreEvents,
  recordHighscoreTurn,
  getActivePlayerId,
  getActivePlayer,
  getPlayerScore,
  getPlayerProgress,
  getRemainingScore,
  formatDuration,
  type HighscoreEvent,
} from '../dartsHighscore'
import {
  type HighscoreDart,
  createHighscoreDart,
} from '../types/highscore'
import type { Bed } from '../darts501'
import { playTriple20Sound, announceGameStart, announceNextPlayer, announceScore, announceLegDart, announceMatchDart, cancelDebouncedAnnounce, debouncedAnnounce } from '../speech'
import GameControls, { PauseOverlay } from '../components/GameControls'
import HighscoreStaircaseChart, { type HighscoreVisit } from '../components/HighscoreStaircaseChart'
import HighscoreProgressionChart from '../components/HighscoreProgressionChart'
import { PLAYER_COLORS } from '../playerColors'
import { useDisableScale } from '../components/ScaleWrapper'

// Leg-Zusammenfassung Typ
type HighscoreIntermission = {
  kind: 'leg'
  legIndex: number
  legDurationMs: number
  winnerId: string
  winnerName: string
  winnerDarts: number
  winnerScore: number
  pendingNextEvents: HighscoreEvent[]
}

type MultiplayerProp = {
  enabled: boolean
  roomCode: string
  myPlayerId: string
  localPlayerIds?: string[]
  isHost: boolean
  submitEvents: (events: any[]) => void
  undo: (removeCount: number) => void
  remoteEvents: any[] | null
  connectionStatus: string
  playerCount: number
}

type Props = {
  matchId: string
  onExit: () => void
  onShowSummary: (matchId: string) => void
  multiplayer?: MultiplayerProp
}

export default function GameHighscore({ matchId, onExit, onShowSummary, multiplayer }: Props) {
  useDisableScale()
  const { c, isArcade, colors } = useGameColors()

  // Profile für Spielerfarben
  const profiles = useMemo(() => getProfiles(), [])

  // Events + State
  const [storedMatch, setStoredMatch] = useState(() => getHighscoreMatchById(matchId))
  const [events, setEvents] = useState<HighscoreEvent[]>(storedMatch?.events ?? [])

  // Retry loading match if not found yet (multiplayer: match created by host, may not be in cache yet)
  useEffect(() => {
    if (storedMatch) return
    const timer = setInterval(() => {
      const found = getHighscoreMatchById(matchId)
      if (found) { setStoredMatch(found); setEvents(found.events as HighscoreEvent[]); clearInterval(timer) }
    }, 500)
    return () => clearInterval(timer)
  }, [matchId, storedMatch])
  const [currentDarts, setCurrentDarts] = useState<HighscoreDart[]>([])
  const [saving, setSaving] = useState(false)

  // Multiplayer: Remote-Events synchronisieren
  const prevRemoteHsRef = useRef<any[] | null>(null)
  useEffect(() => {
    if (!multiplayer?.remoteEvents) return
    if (multiplayer.remoteEvents === prevRemoteHsRef.current) return
    const prevEvents = prevRemoteHsRef.current as any[] | null
    prevRemoteHsRef.current = multiplayer.remoteEvents
    const remote = multiplayer.remoteEvents as HighscoreEvent[]
    setEvents(remote)
    persistHighscoreEvents(matchId, remote)
    // Detect MatchFinished: only trigger when NEW
    const matchFinishedEvt = remote.find((e: any) => e.type === 'HighscoreMatchFinished') as any
    const prevHadFinished = prevEvents ? prevEvents.some((e: any) => e.type === 'HighscoreMatchFinished') : false
    if (matchFinishedEvt && !prevHadFinished) {
      const startEvtForFinish = remote.find((e: any) => e.type === 'HighscoreMatchStarted') as any
      const playerIds = startEvtForFinish?.players?.map((p: any) => p.playerId) ?? []
      if (multiplayer?.isHost) {
        // Host persists immediately
        ;(async () => {
          await ensureHighscoreMatchExistsAsync(matchId, remote, playerIds)
          try { await persistHighscoreEvents(matchId, remote) } catch {}
          await finishHighscoreMatch(matchId, matchFinishedEvt.winnerId, matchFinishedEvt.totalDarts, matchFinishedEvt.durationMs)
          if (onShowSummary) setTimeout(() => onShowSummary(matchId), 2000)
        })()
      } else {
        // Guest: persist as backup after 5s (in case host disconnected before saving)
        setTimeout(async () => {
          try {
            // Skip if host already saved
            if (await isMatchFinishedInDB('highscore_matches', matchId)) return
            await ensureHighscoreMatchExistsAsync(matchId, remote, playerIds)
            await persistHighscoreEvents(matchId, remote)
            await finishHighscoreMatch(matchId, matchFinishedEvt.winnerId, matchFinishedEvt.totalDarts, matchFinishedEvt.durationMs)
          } catch {}
        }, 5000)
        if (onShowSummary) setTimeout(() => onShowSummary(matchId), 2000)
      }
    }
    // Ensure match exists locally for guest
    if (remote.length > 0) {
      const startEvt = remote.find((e: any) => e.type === 'HighscoreMatchStarted') as any
      if (startEvt) {
        ensureHighscoreMatchExists(matchId, remote, startEvt.players?.map((p: any) => p.playerId) ?? [])
      }
    }
  }, [multiplayer?.remoteEvents]) // eslint-disable-line react-hooks/exhaustive-deps

  // State ableiten (vor useGameState, da finished benötigt wird)
  const state = applyHighscoreEvents(events)
  const activePlayerId = getActivePlayerId(state)
  const activePlayer = getActivePlayer(state)

  // Multiplayer: Ist der lokale Spieler gerade am Zug?
  const hsLocalIds = multiplayer?.localPlayerIds ?? (multiplayer?.myPlayerId ? [multiplayer.myPlayerId] : [])
  const isMyTurn = !multiplayer?.enabled || (activePlayerId != null && hsLocalIds.includes(activePlayerId))

  // Shared game state (pause, mute, timer, visibility)
  const { gamePaused, setGamePaused, muted, setMuted, elapsedMs, setElapsedMs } = useGameState({
    matchId,
    mode: 'highscore',
    finished: state.finished,
  })

  const [legStartElapsedMs, setLegStartElapsedMs] = useState(0)

  // Intermission (Leg-Zusammenfassung)
  const [intermission, setIntermission] = useState<HighscoreIntermission | null>(null)
  const [intermissionView, setIntermissionView] = useState<'staircase' | 'progression'>('staircase')

  // Multiplikator für Tastatureingabe (1=Single, 2=Double, 3=Triple)
  const [mult, setMult] = useState<1 | 2 | 3>(1)
  const multRef = useRef<1 | 2 | 3>(1)
  useEffect(() => { multRef.current = mult }, [mult])

  // Number Buffer für Tastatureingabe
  const numBuf = useRef('')
  const numBufTimer = useRef<number | null>(null)

  // Spielerfarben aus Profilen (mit Fallback auf lokale PLAYER_COLORS)
  const playerColors = useMemo(() => {
    const colors: Record<string, string> = {}
    if (state.match) {
      state.match.players.forEach((p, idx) => {
        const profile = profiles.find(pr => pr.id === p.id)
        colors[p.id] = profile?.color ?? PLAYER_COLORS[idx % PLAYER_COLORS.length]
      })
    }
    return colors
  }, [state.match, profiles])

  // Refs für Keyboard-Handler
  const currentDartsRef = useRef(currentDarts)
  useEffect(() => { currentDartsRef.current = currentDarts }, [currentDarts])
  const gamePausedRef = useRef(gamePaused)
  useEffect(() => { gamePausedRef.current = gamePaused }, [gamePaused])
  const activePlayerIdRef = useRef(activePlayerId)
  useEffect(() => { activePlayerIdRef.current = activePlayerId }, [activePlayerId])

  // Ref für addDart (für Timer-Callbacks)
  const addDartRef = useRef<((bed: Bed | 'MISS', multOverride?: 1 | 2 | 3) => void) | null>(null)

  // "[Name], throw first! Game on!" am Spielstart
  const hasAnnouncedGameOn = useRef(false)
  useEffect(() => {
    if (!hasAnnouncedGameOn.current && state.match && !state.finished) {
      // Prüfe ob es ein frisches Spiel ist (keine Turns)
      const hasTurns = events.some(e => e.type === 'HighscoreTurnAdded')
      if (!hasTurns) {
        const firstPlayer = state.match.players[0]
        announceGameStart(firstPlayer?.name ?? 'Player 1')
        hasAnnouncedGameOn.current = true
      }
    }
  }, [state.match, state.finished, events])

  // Dart hinzufügen
  const addDart = useCallback((bed: Bed | 'MISS', multOverride?: 1 | 2 | 3) => {
    if (gamePausedRef.current || !activePlayerIdRef.current) return
    // Multiplayer: Nur eigene Würfe eingeben
    if (multiplayer?.enabled && !isMyTurn) return
    if (currentDartsRef.current.length >= 3) return

    let target: number | 'BULL' | 'MISS'
    let actualMult: 1 | 2 | 3 = multOverride ?? 1

    if (bed === 'MISS') {
      target = 'MISS'
      actualMult = 1
    } else if (bed === 'BULL') {
      target = 'BULL'
      actualMult = 1
    } else if (bed === 'DBULL') {
      target = 'BULL'
      actualMult = 2
    } else {
      target = bed as number
    }

    // Triple 20 Sound
    if (target === 20 && actualMult === 3) {
      playTriple20Sound()
    }

    const dart = createHighscoreDart(target, actualMult)
    setCurrentDarts(prev => [...prev, dart])

    // Reset Multiplikator nach Wurf
    setMult(1)
  }, [multiplayer, isMyTurn])

  // Ref für Timer-Callbacks aktualisieren
  addDartRef.current = addDart

  // Turn bestätigen
  const confirmTurn = useCallback(() => {
    if (!activePlayerId || currentDarts.length === 0) return
    // Multiplayer: Nur eigene Turns bestätigen
    if (multiplayer?.enabled && !isMyTurn) return

    const result = recordHighscoreTurn(state, activePlayerId, currentDarts, elapsedMs)
    let newEvents: HighscoreEvent[] = [...events, result.turnEvent]

    // Punkte ansagen
    const turnScore = currentDarts.reduce((sum, d) => sum + d.value, 0)
    announceScore(turnScore, false)

    // Nächsten Spieler ansagen (falls Spiel weitergeht)
    if (!result.legFinished && !result.matchFinished && state.match) {
      const tmpState = applyHighscoreEvents(newEvents)
      const nextPlayer = getActivePlayer(tmpState)
      const nextPid = getActivePlayerId(tmpState)
      const isNextLocalHs = !multiplayer?.enabled || (nextPid != null && hsLocalIds.includes(nextPid))
      if (nextPlayer && isNextLocalHs) {
        debouncedAnnounce(() => announceNextPlayer(nextPlayer.name))
      }
    }

    // Leg beendet?
    if (result.legFinished) {
      newEvents.push(result.legFinished)
      if (result.setFinished) newEvents.push(result.setFinished)

      // Match beendet?
      if (result.matchFinished) {
        newEvents.push(result.matchFinished)
        // "Game shot, and the match!"
        setTimeout(() => announceMatchDart(), 500)
        setEvents(newEvents)
        setCurrentDarts([])
        if (multiplayer?.enabled) multiplayer.submitEvents(newEvents.slice(events.length))
        // Persist + finish must complete before navigating to summary
        setSaving(true)
        ;(async () => {
          try {
            await persistHighscoreEvents(matchId, newEvents)
            await finishHighscoreMatch(
              matchId,
              result.matchFinished!.winnerId,
              result.matchFinished!.totalDarts,
              result.matchFinished!.durationMs,
              result.matchFinished!.legWins,
              result.matchFinished!.setWins
            )
          } catch (err) {
            console.warn('[Highscore] Persist failed:', err)
          } finally {
            setSaving(false)
          }
          onShowSummary(matchId)
        })()
        return
      }

      // Leg fertig, Match nicht – Intermission
      if (result.nextLegStart) {
        // "And the Leg!"
        setTimeout(() => announceLegDart(), 500)
        const winnerPlayer = state.match?.players.find(p => p.id === result.legFinished!.winnerId)
        persistHighscoreEvents(matchId, newEvents)
        setEvents(newEvents)
        setCurrentDarts([])
        if (multiplayer?.enabled) multiplayer.submitEvents(newEvents.slice(events.length))

        setIntermissionView('staircase') // Reset view für neue Intermission
        setIntermission({
          kind: 'leg',
          legIndex: state.currentLegIndex,
          legDurationMs: elapsedMs - legStartElapsedMs,
          winnerId: result.legFinished.winnerId,
          winnerName: winnerPlayer?.name ?? '?',
          winnerDarts: result.legFinished.winnerDarts,
          winnerScore: result.legFinished.winnerScore,
          pendingNextEvents: [result.nextLegStart],
        })
        return
      }
    }

    persistHighscoreEvents(matchId, newEvents)
    setEvents(newEvents)
    setCurrentDarts([])
    if (multiplayer?.enabled) multiplayer.submitEvents(newEvents.slice(events.length))
  }, [activePlayerId, currentDarts, state, events, matchId, elapsedMs, legStartElapsedMs, onShowSummary, multiplayer, isMyTurn])

  // Auto-Confirm bei 3 Darts
  useEffect(() => {
    if (currentDarts.length >= 3) {
      confirmTurn()
    }
  }, [currentDarts.length, confirmTurn])

  // Undo letzter Dart
  const undoLastDart = useCallback(() => {
    cancelDebouncedAnnounce()
    setCurrentDarts(prev => prev.slice(0, -1))
  }, [])

  // Intermission fortsetzen
  const continueFromIntermission = useCallback(() => {
    if (!intermission) return

    const newEvents = [...events, ...intermission.pendingNextEvents]
    persistHighscoreEvents(matchId, newEvents)
    setEvents(newEvents)
    setLegStartElapsedMs(elapsedMs)
    setIntermission(null)
    if (multiplayer?.enabled) multiplayer.submitEvents(intermission.pendingNextEvents)
  }, [intermission, events, matchId, elapsedMs, multiplayer])

  // Enter-Taste zum Weitergehen bei Intermission
  useEffect(() => {
    if (!intermission) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Enter') continueFromIntermission()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [intermission, continueFromIntermission])

  // Match abbrechen
  const handleAbort = useCallback(() => {
    deleteHighscoreMatch(matchId)
    onExit()
  }, [matchId, onExit])


  // Ensure keyboard focus when a local player's turn starts
  useEffect(() => {
    if (!multiplayer?.enabled || isMyTurn) { if (document.activeElement instanceof HTMLElement) document.activeElement.blur() }
  }, [activePlayerId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Tastatur
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      // Ignore input fields
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return

      // Escape = Pause
      if (e.key === 'Escape') {
        if (intermission) return
        setGamePaused(true)
        return
      }

      // P = Toggle Pause
      if (e.key === 'p' || e.key === 'P') {
        if (intermission) return
        setGamePaused(p => !p)
        return
      }

      // Enter/Space = Confirm or Continue
      if (e.key === 'Enter' || e.key === ' ') {
        if (intermission) {
          continueFromIntermission()
          return
        }
        if (currentDartsRef.current.length > 0) {
          // Flush pending number first
          if (numBuf.current) {
            if (numBufTimer.current) {
              window.clearTimeout(numBufTimer.current)
              numBufTimer.current = null
            }
            const n = parseInt(numBuf.current, 10)
            if (n >= 1 && n <= 20) {
              addDart(n as Bed, multRef.current)
            }
            numBuf.current = ''
          }
          confirmTurn()
        }
        return
      }

      // Backspace = Undo
      if (e.key === 'Backspace') {
        // Clear number buffer first, then undo dart
        if (numBuf.current) {
          numBuf.current = numBuf.current.slice(0, -1)
        } else {
          undoLastDart()
        }
        return
      }

      // Don't process further if paused or in intermission
      if (gamePausedRef.current || intermission) return

      // S = Single
      if (e.key === 's' || e.key === 'S') {
        setMult(1)
        return
      }

      // D = Double
      if (e.key === 'd' || e.key === 'D') {
        setMult(2)
        return
      }

      // T = Triple
      if (e.key === 't' || e.key === 'T') {
        setMult(3)
        return
      }

      // B = Bull (with current mult: S=Bull, D=Double Bull)
      if (e.key === 'b' || e.key === 'B') {
        const currentMult = multRef.current
        if (currentMult === 2 || currentMult === 3) {
          addDart('DBULL', 2) // Double Bull
        } else {
          addDart('BULL', 1) // Single Bull
        }
        return
      }

      // M = Miss
      if (e.key === 'm' || e.key === 'M') {
        addDart('MISS', 1)
        return
      }

      // Numbers 0-9 - Highscore: Einzelne Dartfelder (1-20)
      const k = e.key
      if (k >= '0' && k <= '9') {
        e.preventDefault()
        const digit = k

        // Hilfsfunktion: Eine Ziffer verarbeiten
        const processDigit = (d: string, isBuffered: boolean = false) => {
          if (d === '0') {
            if (!isBuffered) addDart('MISS', 1)
            return
          }
          // 1, 2: Puffern für mögliche zweite Ziffer (10-20)
          if (d === '1' || d === '2') {
            numBuf.current = d
            numBufTimer.current = window.setTimeout(() => {
              const n = parseInt(numBuf.current, 10)
              if (n >= 1 && n <= 20 && addDartRef.current) {
                addDartRef.current(n as Bed, multRef.current)
              }
              numBuf.current = ''
              numBufTimer.current = null
            }, 500)
          } else {
            // 3-9: Sofort feuern
            addDart(parseInt(d, 10) as Bed, multRef.current)
          }
        }

        if (numBuf.current === '') {
          // Keine gepufferte Ziffer
          processDigit(digit)
        } else {
          // Zweite Ziffer - Timer stoppen
          if (numBufTimer.current) {
            window.clearTimeout(numBufTimer.current)
            numBufTimer.current = null
          }

          const first = numBuf.current
          numBuf.current = ''

          if (first === '1') {
            // 10-19: Alle gültig
            const combined = parseInt(first + digit, 10)
            addDart(combined as Bed, multRef.current)
          } else if (first === '2') {
            if (digit === '0') {
              addDart(20 as Bed, multRef.current)
            } else {
              // 21-29: Erst die 2 feuern, dann die zweite Ziffer neu verarbeiten
              addDart(2 as Bed, multRef.current)
              // Die zweite Ziffer als neuen Wurf starten
              processDigit(digit)
            }
          }
        }
        return
      }
    }

    window.addEventListener('keydown', handleKey)
    return () => {
      window.removeEventListener('keydown', handleKey)
      // Timer NICHT hier abbrechen - er soll auch nach Re-Render noch feuern
    }
  }, [intermission, confirmTurn, undoLastDart, continueFromIntermission, addDart])

  // Timer nur beim Unmount der Komponente abbrechen
  useEffect(() => {
    return () => {
      if (numBufTimer.current) window.clearTimeout(numBufTimer.current)
    }
  }, [])

  // Berechne Live-Score
  const liveScore = useMemo(() => {
    if (!activePlayerId) return 0
    const baseScore = getPlayerScore(state, activePlayerId)
    const turnScore = currentDarts.reduce((sum, d) => sum + d.value, 0)
    return baseScore + turnScore
  }, [state, activePlayerId, currentDarts])

  // Berechne Live-Progress
  const liveProgress = useMemo(() => {
    if (!state.match) return 0
    return Math.min(100, (liveScore / state.match.targetScore) * 100)
  }, [state.match, liveScore])

  // Live-Visits des aktiven Spielers für Staircase-Chart (nur aktuelles Leg!)
  const liveVisits = useMemo((): HighscoreVisit[] => {
    if (!activePlayerId) return []

    // Finde den Index des letzten LegStarted Events (= aktuelles Leg)
    let lastLegStartIndex = -1
    for (let i = events.length - 1; i >= 0; i--) {
      if (events[i].type === 'HighscoreLegStarted') {
        lastLegStartIndex = i
        break
      }
    }

    // Nur Events nach dem letzten LegStarted (= aktuelles Leg)
    const currentLegEvents = lastLegStartIndex >= 0
      ? events.slice(lastLegStartIndex + 1)
      : events

    const playerTurns = currentLegEvents
      .filter((e): e is HighscoreEvent & { type: 'HighscoreTurnAdded' } =>
        e.type === 'HighscoreTurnAdded' && e.playerId === activePlayerId
      )
      .map((turn, idx, arr) => ({
        turnScore: turn.turnScore,
        runningScore: turn.runningScore,
        scoreBefore: idx === 0 ? 0 : arr[idx - 1].runningScore,
        darts: turn.darts,
        isWinningTurn: turn.isWinningTurn,
      }))

    // Füge aktuellen Turn hinzu wenn Darts geworfen wurden
    if (currentDarts.length > 0) {
      const lastScore = playerTurns.length > 0
        ? playerTurns[playerTurns.length - 1].runningScore
        : 0
      const turnScore = currentDarts.reduce((sum, d) => sum + d.value, 0)
      playerTurns.push({
        turnScore,
        runningScore: lastScore + turnScore,
        scoreBefore: lastScore,
        darts: currentDarts,
        isWinningTurn: false,
      })
    }

    return playerTurns
  }, [events, activePlayerId, currentDarts])

  // Chart-Daten für ProgressionChart (nur aktuelles Leg!)
  const chartPlayers = useMemo(() => {
    if (!state.match) return []

    // Finde den Index des letzten LegStarted Events (= aktuelles Leg)
    let lastLegStartIndex = -1
    for (let i = events.length - 1; i >= 0; i--) {
      if (events[i].type === 'HighscoreLegStarted') {
        lastLegStartIndex = i
        break
      }
    }

    // Nur Events nach dem letzten LegStarted (= aktuelles Leg)
    const currentLegEvents = lastLegStartIndex >= 0
      ? events.slice(lastLegStartIndex + 1)
      : events

    return state.match.players.map((player, idx) => {
      const playerTurns = currentLegEvents
        .filter((e): e is HighscoreEvent & { type: 'HighscoreTurnAdded' } =>
          e.type === 'HighscoreTurnAdded' && e.playerId === player.id
        )
        .map((turn, i, arr) => ({
          turnIndex: i,
          scoreBefore: i === 0 ? 0 : arr[i - 1].runningScore,
          scoreAfter: turn.runningScore,
          dartScores: turn.darts.map(d => d.value),
        }))

      return {
        id: player.id,
        name: player.name,
        color: playerColors[player.id] ?? PLAYER_COLORS[idx % PLAYER_COLORS.length],
        turns: playerTurns,
      }
    })
  }, [state.match, events])

  // Live-Dart-Scores für den aktiven Spieler
  const liveDartScores = useMemo(() => {
    return currentDarts.map(d => d.value)
  }, [currentDarts])

  // Format Dart Label
  const formatDartLabel = (d: HighscoreDart): string => {
    if (d.target === 'MISS') return 'MISS'
    if (d.target === 'BULL') return d.mult === 2 ? 'D-BULL' : 'BULL'
    const prefix = d.mult === 3 ? 'T' : d.mult === 2 ? 'D' : ''
    return `${prefix}${d.target}`
  }

  // Format Multiplikator Label
  const getMultLabel = (m: 1 | 2 | 3): string => {
    if (m === 3) return 'Triple'
    if (m === 2) return 'Double'
    return 'Single'
  }

  if (!state.match) {
    return <div style={{ padding: 20, color: colors.fg }}>Match nicht gefunden</div>
  }

  const { players, targetScore, structure } = state.match
  const activeIndex = players.findIndex(p => p.id === activePlayerId)

  // Leg-Stand String
  const legStandStr = structure.kind === 'legs' && structure.targetLegs > 1
    ? ` · FT${structure.targetLegs}: ${players.map(p => state.legWinsByPlayer[p.id] ?? 0).join(':')}`
    : ''

  return (
    <div style={{
      height: '100dvh',
      background: c.bg,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    }}>
      {/* Pause Overlay */}
      {gamePaused && !intermission && <PauseOverlay onResume={() => setGamePaused(false)} />}

      {/* Header mit GameControls */}
      <GameControls
        isPaused={gamePaused}
        onTogglePause={() => setGamePaused(p => !p)}
        isMuted={muted}
        onToggleMute={() => setMuted(m => !m)}
        onExit={() => {
          setMatchPaused(matchId, 'highscore', true)
          setMatchElapsedTime(matchId, 'highscore', elapsedMs)
          onExit()
        }}
        onCancel={() => {
          deleteHighscoreMatch(matchId)
          onExit()
        }}
        title={`Highscore ${targetScore}${legStandStr}${multiplayer?.enabled && multiplayer.roomCode ? ` · ${multiplayer.roomCode}` : ''}`}
      />

      {/* Timer + Multiplikator Info */}
      <div style={{
        flexShrink: 0,
        background: c.cardBg,
        padding: '6px 16px',
        borderBottom: `1px solid ${c.border}`,
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 16,
      }}>
        <span style={{ fontSize: 14, fontWeight: 700, fontFamily: 'monospace', color: c.ledOn }}>
          {formatDuration(elapsedMs)}
        </span>
        {mult !== 1 && (
          <span style={{
            padding: '3px 8px',
            borderRadius: 4,
            background: mult === 3 ? '#ef4444' : '#f97316',
            color: '#fff',
            fontSize: 11,
            fontWeight: 700,
          }}>
            {getMultLabel(mult)}
          </span>
        )}
      </div>

      {/* Haupt-Layout: Links Chart, Rechts Spieler + Input (kompakt) */}
      <div style={{
        flex: 1,
        display: 'flex',
        overflow: 'hidden',
        minHeight: 0,
      }}>
        {/* LINKS: Progression-Chart (~70%) */}
        <div style={{
          flex: 2,
          display: 'flex',
          padding: 12,
          overflow: 'hidden',
          minWidth: 0,
        }}>
          <HighscoreProgressionChart
            targetScore={targetScore}
            players={chartPlayers}
            liveScore={liveScore}
            activePlayerId={activePlayerId ?? undefined}
            liveDartCount={currentDarts.length}
            liveDartScores={liveDartScores}
            winnerPlayerId={state.finished?.winnerId}
          />
        </div>

        {/* RECHTS: Spieler + Input (kompakt, ~30%) */}
        <div style={{
          width: 240,
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          padding: '8px 12px 8px 0',
          overflow: 'hidden',
        }}>
          {/* Spieler-Liste (kompakt) */}
          <div style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
            overflowY: 'auto',
            marginBottom: 8,
          }}>
            {players.map((player, idx) => {
              const score = getPlayerScore(state, player.id)
              const isActive = player.id === activePlayerId
              const playerColor = playerColors[player.id] ?? PLAYER_COLORS[idx % PLAYER_COLORS.length]
              const displayScore = isActive ? liveScore : score

              return (
                <div
                  key={player.id}
                  style={{
                    background: c.cardBg,
                    borderRadius: 6,
                    padding: '6px 10px',
                    border: `2px solid ${isActive ? playerColor : c.border}`,
                    boxShadow: isActive ? `0 0 8px ${playerColor}40` : 'none',
                  }}
                >
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}>
                    {/* Farb-Punkt */}
                    <div style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: playerColor,
                      flexShrink: 0,
                    }} />

                    {/* Name */}
                    <span style={{
                      fontWeight: 600,
                      color: c.textBright,
                      fontSize: 12,
                      flex: 1,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}>
                      {player.name}
                    </span>

                    {/* Score */}
                    <span style={{
                      fontSize: 16,
                      fontWeight: 800,
                      color: isActive ? playerColor : c.textBright,
                      flexShrink: 0,
                    }}>
                      {displayScore}
                    </span>
                  </div>

                  {/* Kompakter Progress */}
                  <div style={{
                    marginTop: 4,
                    background: isArcade ? '#1a1a1a' : '#e5e7eb',
                    borderRadius: 2,
                    height: 3,
                    overflow: 'hidden',
                  }}>
                    <div style={{
                      width: `${Math.min(100, (displayScore / targetScore) * 100)}%`,
                      height: '100%',
                      background: playerColor,
                      transition: 'width 0.3s',
                    }} />
                  </div>
                </div>
              )
            })}
          </div>

          {/* Input-Bereich (kompakt) */}
          <div style={{
            flexShrink: 0,
            background: c.cardBg,
            borderRadius: 6,
            padding: 8,
            border: `1px solid ${c.border}`,
          }}>
            {/* Header */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 6,
            }}>
              <span style={{ fontSize: 10, color: c.textDim }}>
                Aufnahme
              </span>
              <span style={{
                fontSize: 14,
                fontWeight: 700,
                color: c.accent,
              }}>
                +{currentDarts.reduce((sum, d) => sum + d.value, 0)}
              </span>
            </div>

            {/* Darts anzeigen */}
            <div style={{
              display: 'flex',
              gap: 4,
              marginBottom: 6,
            }}>
              {[0, 1, 2].map(i => {
                const dart = currentDarts[i]
                return (
                  <div
                    key={i}
                    style={{
                      flex: 1,
                      height: 28,
                      borderRadius: 4,
                      border: `1px solid ${dart ? c.accent : c.border}`,
                      background: dart ? (isArcade ? '#1a1a1a' : '#f0f9ff') : 'transparent',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 11,
                      fontWeight: 700,
                      color: dart ? c.textBright : c.textDim,
                    }}
                  >
                    {dart ? formatDartLabel(dart) : '—'}
                  </div>
                )
              })}
            </div>

            {/* Buttons */}
            <div style={{
              display: 'flex',
              gap: 6,
            }}>
              <button
                onClick={undoLastDart}
                disabled={currentDarts.length === 0}
                style={{
                  flex: 1,
                  padding: '6px 8px',
                  borderRadius: 4,
                  border: `1px solid ${c.border}`,
                  background: 'transparent',
                  color: currentDarts.length === 0 ? c.textDim : c.textBright,
                  fontSize: 10,
                  fontWeight: 600,
                  cursor: currentDarts.length === 0 ? 'not-allowed' : 'pointer',
                  opacity: currentDarts.length === 0 ? 0.5 : 1,
                }}
              >
                ← Undo
              </button>
              <button
                onClick={confirmTurn}
                disabled={currentDarts.length === 0}
                style={{
                  flex: 1,
                  padding: '6px 12px',
                  borderRadius: 4,
                  border: 'none',
                  background: currentDarts.length === 0 ? c.textDim : c.accent,
                  color: '#fff',
                  fontSize: 10,
                  fontWeight: 700,
                  cursor: currentDarts.length === 0 ? 'not-allowed' : 'pointer',
                  opacity: currentDarts.length === 0 ? 0.5 : 1,
                }}
              >
                OK ↵
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Speichern-Indikator */}
      {saving && (
        <div style={{ fontSize: 13, color: c.textDim, padding: '8px 0', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <span style={{ display: 'inline-block', width: 14, height: 14, border: '2px solid currentColor', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          Speichern...
        </div>
      )}

      {/* Leg Intermission */}
      {intermission && (() => {
        // Extrahiere die Turns des Gewinners aus diesem Leg (für Staircase)
        const winnerVisits: HighscoreVisit[] = events
          .filter((e): e is import('../dartsHighscore').HighscoreEvent & { type: 'HighscoreTurnAdded' } =>
            e.type === 'HighscoreTurnAdded' && e.playerId === intermission.winnerId
          )
          .map((turn, idx, arr) => ({
            turnScore: turn.turnScore,
            runningScore: turn.runningScore,
            scoreBefore: idx === 0 ? 0 : arr[idx - 1].runningScore,
            darts: turn.darts,
            isWinningTurn: turn.isWinningTurn,
          }))

        const winnerColor = playerColors[intermission.winnerId] ?? PLAYER_COLORS[
          players.findIndex(p => p.id === intermission.winnerId) % PLAYER_COLORS.length
        ]

        // Chart-Daten für ProgressionChart (alle Spieler im Leg)
        const legChartPlayers = players.map((player, idx) => {
          const playerTurns = events
            .filter((e): e is HighscoreEvent & { type: 'HighscoreTurnAdded' } =>
              e.type === 'HighscoreTurnAdded' && e.playerId === player.id
            )
            .map((turn, i, arr) => ({
              turnIndex: i,
              scoreBefore: i === 0 ? 0 : arr[i - 1].runningScore,
              scoreAfter: turn.runningScore,
              dartScores: turn.darts.map(d => d.value),
            }))

          return {
            id: player.id,
            name: player.name,
            color: playerColors[player.id] ?? PLAYER_COLORS[idx % PLAYER_COLORS.length],
            turns: playerTurns,
          }
        })

        // Dunkle Farben für Intermission (immer dark theme)
        const darkColors = {
          bg: '#0a0a0a',
          cardBg: '#141414',
          text: '#ffffff',
          textDim: '#9ca3af',
          border: '#333',
          accent: '#3b82f6',
          green: '#22c55e',
        }

        return (
          <div style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.92)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            padding: 20,
          }}>
            <div style={{
              background: darkColors.cardBg,
              borderRadius: 16,
              padding: 24,
              maxWidth: 700,
              width: '100%',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}>
              {/* Header */}
              <div style={{ textAlign: 'center', marginBottom: 12, flexShrink: 0 }}>
                <div style={{ fontSize: 13, color: darkColors.textDim, marginBottom: 4 }}>
                  Leg {intermission.legIndex + 1} beendet
                </div>
                <div style={{ fontSize: 26, fontWeight: 900, color: darkColors.green, marginBottom: 6 }}>
                  {intermission.winnerName} gewinnt!
                </div>
                <div style={{ fontSize: 13, color: darkColors.text }}>
                  {intermission.winnerScore} Punkte mit {intermission.winnerDarts} Darts
                  <span style={{ color: darkColors.textDim, marginLeft: 8 }}>
                    ({formatDuration(intermission.legDurationMs)})
                  </span>
                </div>
                {/* 999-Equivalent (wenn targetScore < 999) */}
                {targetScore < 999 && (
                  <div style={{
                    marginTop: 10,
                    padding: '6px 16px',
                    background: '#1e3a5f',
                    borderRadius: 6,
                    display: 'inline-block',
                  }}>
                    <div style={{ fontSize: 10, color: '#93c5fd', marginBottom: 2 }}>
                      Hochgerechnet auf 999
                    </div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: '#60a5fa' }}>
                      {Math.round(intermission.winnerDarts * (999 / targetScore))} Darts
                    </div>
                  </div>
                )}
              </div>

              {/* Continue Button (oben) */}
              <div style={{ textAlign: 'center', marginBottom: 16, flexShrink: 0 }}>
                <button
                  onClick={continueFromIntermission}
                  style={{
                    padding: '10px 28px',
                    borderRadius: 8,
                    border: 'none',
                    background: darkColors.accent,
                    color: '#fff',
                    fontSize: 14,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Weiter zum nächsten Leg →
                </button>
              </div>

              {/* Ansicht-Umschalter */}
              <div style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                gap: 16,
                marginBottom: 12,
                flexShrink: 0,
              }}>
                <button
                  onClick={() => setIntermissionView('staircase')}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 6,
                    border: `1px solid ${darkColors.border}`,
                    background: intermissionView === 'staircase' ? darkColors.accent : 'transparent',
                    color: intermissionView === 'staircase' ? '#fff' : darkColors.textDim,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  ← Gewinner
                </button>
                <span style={{ color: darkColors.textDim, fontSize: 11 }}>
                  {intermissionView === 'staircase' ? 'Staircase' : 'Verlauf'}
                </span>
                <button
                  onClick={() => setIntermissionView('progression')}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 6,
                    border: `1px solid ${darkColors.border}`,
                    background: intermissionView === 'progression' ? darkColors.accent : 'transparent',
                    color: intermissionView === 'progression' ? '#fff' : darkColors.textDim,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  Alle →
                </button>
              </div>

              {/* Chart-Bereich */}
              <div style={{
                flex: 1,
                minHeight: 280,
                height: 280,
              }}>
                {intermissionView === 'staircase' ? (
                  <div style={{ height: '100%', width: '100%' }}>
                    <HighscoreStaircaseChart
                      targetScore={targetScore}
                      visits={winnerVisits}
                      playerName={intermission.winnerName}
                      playerColor={winnerColor}
                      totalDarts={intermission.winnerDarts}
                      compact={false}
                      showHeader={false}
                    />
                  </div>
                ) : (
                  <div style={{ height: '100%', width: '100%' }}>
                    <HighscoreProgressionChart
                      targetScore={targetScore}
                      players={legChartPlayers}
                      winnerPlayerId={intermission.winnerId}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
