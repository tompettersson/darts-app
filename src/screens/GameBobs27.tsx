// src/screens/GameBobs27.tsx
// Live-Spielscreen fuer Bob's 27 Darts Training
// D1-D20 nacheinander, 3 Darts pro Target. HIT / MISS Buttons.
// Score: Start 27, Treffer +Doppelwert, Fehler -Doppelwert, < 0 = Game Over.

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { isMatchFinishedInDB } from '../db/storage'
import { useGameState, useGameColors } from '../hooks/useGameState'
import {
  getBobs27MatchById,
  persistBobs27Events,
  finishBobs27Match,
  setMatchPaused,
  setMatchElapsedTime,
  deleteBobs27Match,
  ensureBobs27MatchExists,
} from '../storage'
import {
  applyBobs27Events,
  recordBobs27Throw,
  getActivePlayerId,
  getCurrentTarget,
  formatDuration,
  startNewBobs27Leg,
  id as bobs27Id,
  now as bobs27Now,
  type Bobs27Event,
  type Bobs27ThrowResult,
} from '../dartsBobs27'
import GameControls, { PauseOverlay } from '../components/GameControls'
import { announceBobs27PlayerTurn, announceBobs27MustScore, announceGameStart, cancelDebouncedAnnounce, debouncedAnnounce } from '../speech'
import { PLAYER_COLORS } from '../playerColors'
import { useDisableScale } from '../components/ScaleWrapper'

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

export default function GameBobs27({ matchId, onExit, onShowSummary, multiplayer }: Props) {
  useDisableScale()
  const { c, isArcade, colors } = useGameColors()

  const [isMobile, setIsMobile] = useState(() => Math.min(window.innerWidth, window.innerHeight) < 600)
  const [isLandscape, setIsLandscape] = useState(() => window.innerWidth > window.innerHeight)
  useEffect(() => {
    const check = () => {
      setIsMobile(Math.min(window.innerWidth, window.innerHeight) < 600)
      setIsLandscape(window.innerWidth > window.innerHeight)
    }
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  const [storedMatch, setStoredMatch] = useState(() => getBobs27MatchById(matchId))
  const [events, setEvents] = useState<Bobs27Event[]>(storedMatch?.events ?? [])

  // Retry loading match if not found yet (multiplayer: match created by host, may not be in cache yet)
  useEffect(() => {
    if (storedMatch) return
    const timer = setInterval(() => {
      const found = getBobs27MatchById(matchId)
      if (found) { setStoredMatch(found); setEvents(found.events as Bobs27Event[]); clearInterval(timer) }
    }, 500)
    return () => clearInterval(timer)
  }, [matchId, storedMatch])

  // State aus Events ableiten (vor useGameState, da finished benoetigt wird)
  const state = useMemo(() => applyBobs27Events(events), [events])

  const { gamePaused, setGamePaused, muted, setMuted, elapsedMs, setElapsedMs } = useGameState({
    matchId,
    mode: 'bobs27',
    finished: state.finished,
  })

  // Delta-Animation
  const [deltaFlash, setDeltaFlash] = useState<{ value: number; key: number } | null>(null)

  // Match-End delay
  const [matchEndDelay, setMatchEndDelay] = useState(false)
  const [saving, setSaving] = useState(false)

  const players = state.match?.players ?? []
  const activePlayerId = getActivePlayerId(state)
  const activePlayer = players.find(p => p.playerId === activePlayerId)
  const activePlayerState = activePlayerId ? state.playerStates[activePlayerId] : null
  const currentTarget = activePlayerId ? getCurrentTarget(state, activePlayerId) : null

  // Multiplayer: Ist der lokale Spieler gerade am Zug?
  const bobsLocalIds = multiplayer?.localPlayerIds ?? (multiplayer?.myPlayerId ? [multiplayer.myPlayerId] : [])
  const isMyTurn = !multiplayer?.enabled || (activePlayerId != null && bobsLocalIds.includes(activePlayerId))

  // Safety-Net: Erkennt wenn alle Spieler fertig sind aber kein MatchFinished/LegFinished generiert wurde
  useEffect(() => {
    if (!state.match || state.finished || matchEndDelay) return
    if (state.legFinished) return // Leg already finished, waiting for user to start next
    if (events.length <= 1) return // Nur MatchStarted vorhanden

    // Pruefen ob alle Spieler fertig sind (eliminiert oder alle Targets gespielt)
    const allDone = state.match.players.every(p => {
      const ps = state.playerStates[p.playerId]
      return ps?.finished === true
    })
    if (!allDone) return

    console.warn('[GameBobs27] Safety-Net: Alle Spieler fertig aber kein MatchFinished/LegFinished — generiere Event')

    // finalScores berechnen
    const finalScores: Record<string, number> = {}
    for (const p of state.match.players) {
      finalScores[p.playerId] = state.playerStates[p.playerId]?.score ?? 0
    }

    // Ranking: Fortschritt (Targets) absteigend, dann Score absteigend
    const ranking = state.match.players.map(p => {
      const ps = state.playerStates[p.playerId]
      return {
        pid: p.playerId,
        progress: ps?.eliminated ? (ps.eliminatedAtTarget ?? 0) : (ps?.currentTargetIndex ?? 0),
        score: finalScores[p.playerId] ?? 0,
      }
    }).sort((a, b) => b.progress - a.progress || b.score - a.score)

    let winnerId: string | null = ranking[0]?.pid ?? null
    if (ranking.length > 1 &&
        ranking[0].progress === ranking[1].progress &&
        ranking[0].score === ranking[1].score) {
      winnerId = null
    }

    const legsCount = state.match.config.legsCount ?? 1
    const winsNeeded = Math.ceil(legsCount / 2)

    if (legsCount > 1) {
      // Multi-leg: generate LegFinished, then check if match is done
      const legFinishEvent: Bobs27Event = {
        type: 'Bobs27LegFinished',
        eventId: bobs27Id(),
        matchId: state.match.matchId,
        ts: bobs27Now(),
        legIndex: state.currentLegIndex,
        winnerId,
        finalScores,
      }

      const newLegWins = { ...state.legWins }
      if (winnerId) newLegWins[winnerId] = (newLegWins[winnerId] ?? 0) + 1

      const safetyEvents: Bobs27Event[] = [legFinishEvent]

      if (winnerId && newLegWins[winnerId] >= winsNeeded) {
        // Match is also done
        const totalDarts = Object.values(state.playerStates).reduce((s, ps) => s + ps.totalDarts, 0)
        const durationMs = Date.now() - state.startTime
        const matchFinishEvent: Bobs27Event = {
          type: 'Bobs27MatchFinished',
          eventId: bobs27Id(),
          matchId: state.match.matchId,
          ts: bobs27Now(),
          winnerId,
          totalDarts,
          durationMs,
          finalScores,
        }
        safetyEvents.push(matchFinishEvent)

        const updatedEvents = [...events, ...safetyEvents]
        setEvents(updatedEvents)
        setMatchEndDelay(true)
        setSaving(true)
        ;(async () => {
          try {
            await persistBobs27Events(matchId, updatedEvents)
            await finishBobs27Match(matchId, winnerId, totalDarts, elapsedMs, finalScores, newLegWins)
          } catch (err) {
            console.warn('[Bobs27] Persist failed:', err)
          } finally {
            setSaving(false)
          }
          setTimeout(() => onShowSummary(matchId), 2000)
        })()
      } else {
        // Just leg finished, match continues — show leg summary
        const updatedEvents = [...events, ...safetyEvents]
        setEvents(updatedEvents)
        persistBobs27Events(matchId, updatedEvents)
      }
    } else {
      // Single-leg: original behavior
      const totalDarts = Object.values(state.playerStates).reduce((s, ps) => s + ps.totalDarts, 0)
      const durationMs = Date.now() - state.startTime

      const finishEvent: Bobs27Event = {
        type: 'Bobs27MatchFinished',
        eventId: bobs27Id(),
        matchId: state.match.matchId,
        ts: bobs27Now(),
        winnerId,
        totalDarts,
        durationMs,
        finalScores,
      }

      const updatedEvents = [...events, finishEvent]
      setEvents(updatedEvents)
      setMatchEndDelay(true)
      setSaving(true)
      ;(async () => {
        try {
          await persistBobs27Events(matchId, updatedEvents)
          await finishBobs27Match(matchId, winnerId, totalDarts, elapsedMs, finalScores)
        } catch (err) {
          console.warn('[Bobs27] Persist failed:', err)
        } finally {
          setSaving(false)
        }
        setTimeout(() => onShowSummary(matchId), 2000)
      })()
    }
  }, [state, events, matchId, matchEndDelay, elapsedMs, onShowSummary])

  // Multiplayer: Remote-Events synchronisieren
  const prevRemoteBobs27Ref = useRef<any[] | null>(null)
  useEffect(() => {
    if (!multiplayer?.remoteEvents) return
    if (multiplayer.remoteEvents === prevRemoteBobs27Ref.current) return
    const prevEvents = prevRemoteBobs27Ref.current as any[] | null
    prevRemoteBobs27Ref.current = multiplayer.remoteEvents
    const remote = multiplayer.remoteEvents as Bobs27Event[]
    setEvents(remote)
    persistBobs27Events(matchId, remote)
    // Detect MatchFinished: only trigger when NEW
    const matchFinishedEvt = remote.find((e: any) => e.type === 'Bobs27MatchFinished') as any
    const prevHadFinished = prevEvents ? prevEvents.some((e: any) => e.type === 'Bobs27MatchFinished') : false
    if (matchFinishedEvt && !prevHadFinished) {
      setMatchEndDelay(true)
      if (multiplayer?.isHost) {
        // Host persists immediately
        ;(async () => {
          try { await persistBobs27Events(matchId, remote) } catch {}
          await finishBobs27Match(matchId, matchFinishedEvt.winnerId, matchFinishedEvt.totalDarts, matchFinishedEvt.durationMs, matchFinishedEvt.finalScores)
          if (onShowSummary) setTimeout(() => onShowSummary(matchId), 2000)
        })()
      } else {
        // Guest: persist as backup after 5s (in case host disconnected before saving)
        setTimeout(async () => {
          try {
            // Skip if host already saved
            if (await isMatchFinishedInDB('bobs27_matches', matchId)) return
            await persistBobs27Events(matchId, remote)
            await finishBobs27Match(matchId, matchFinishedEvt.winnerId, matchFinishedEvt.totalDarts, matchFinishedEvt.durationMs, matchFinishedEvt.finalScores)
          } catch {}
        }, 5000)
        if (onShowSummary) setTimeout(() => onShowSummary(matchId), 2000)
      }
    }
    // Ensure match exists locally for guest
    if (remote.length > 0) {
      const startEvt = remote.find((e: any) => e.type === 'Bobs27MatchStarted') as any
      if (startEvt) {
        ensureBobs27MatchExists(matchId, remote, startEvt.players?.map((p: any) => p.playerId) ?? [])
      }
    }
  }, [multiplayer?.remoteEvents]) // eslint-disable-line react-hooks/exhaustive-deps

  // Sprachausgabe: Spieler + Score + Ziel ansagen bei Spielerwechsel/Target-Wechsel
  const lastAnnouncedKeyRef = React.useRef<string>('')
  const gameOnAnnouncedRef = React.useRef(false)

  // Speech-Timer-IDs fuer Cleanup bei Undo
  const speechTimersRef = useRef<ReturnType<typeof setTimeout>[]>([])
  const scheduleSpeech = (fn: () => void, delay: number) => {
    const id = setTimeout(fn, delay)
    speechTimersRef.current.push(id)
    return id
  }
  const clearSpeechTimers = () => {
    speechTimersRef.current.forEach(id => clearTimeout(id))
    speechTimersRef.current = []
  }

  useEffect(() => {
    if (!activePlayer || !activePlayerState || !currentTarget) return
    if (state.finished || gamePaused || matchEndDelay) return

    const key = `${activePlayer.playerId}-${currentTarget.fieldNumber}`

    // "Must score"-Warnung: Nur bei allowNegative=false, wenn Score < doubleValue
    const mustScore = state.match && !state.match.config.allowNegative &&
      activePlayerState.score < currentTarget.doubleValue

    // Beim allerersten Mal "Game On!" ansagen, danach den Turn
    if (!gameOnAnnouncedRef.current) {
      gameOnAnnouncedRef.current = true
      announceGameStart(activePlayer.name)
      lastAnnouncedKeyRef.current = key
      // Kurz danach den Turn ansagen
      scheduleSpeech(() => {
        announceBobs27PlayerTurn(activePlayer.name, activePlayerState.score, currentTarget.label)
        if (mustScore) announceBobs27MustScore()
      }, 1500)
      return
    }

    if (key !== lastAnnouncedKeyRef.current) {
      lastAnnouncedKeyRef.current = key
      debouncedAnnounce(() => {
        announceBobs27PlayerTurn(activePlayer.name, activePlayerState.score, currentTarget.label)
        if (mustScore) announceBobs27MustScore()
      })
    }
  }, [activePlayer, activePlayerState, currentTarget, state.finished, gamePaused, matchEndDelay, state.match])

  // Wurf aufnehmen (HIT oder MISS)
  const doThrow = useCallback((hit: boolean) => {
    if (gamePaused || state.finished || matchEndDelay) return
    if (!activePlayerId || !state.match) return
    // Multiplayer: Nur eigene Würfe eingeben
    if (multiplayer?.enabled && !isMyTurn) return

    const result: Bobs27ThrowResult = recordBobs27Throw(state, activePlayerId, hit)

    const newEvents: Bobs27Event[] = [result.throwEvent]
    if (result.targetFinished) {
      newEvents.push(result.targetFinished)

      // Delta-Animation
      setDeltaFlash({ value: result.targetFinished.delta, key: Date.now() })
    }
    if (result.legFinished) {
      newEvents.push(result.legFinished)
    }
    if (result.matchFinished) {
      newEvents.push(result.matchFinished)
    }

    const updatedEvents = [...events, ...newEvents]
    setEvents(updatedEvents)

    // Multiplayer: Events senden
    if (multiplayer?.enabled) {
      multiplayer.submitEvents(newEvents)
    }

    // Match beendet?
    if (result.matchFinished) {
      setMatchEndDelay(true)
      // Persist + finish must complete before navigating to summary
      setSaving(true)
      ;(async () => {
        try {
          await persistBobs27Events(matchId, updatedEvents)
          // Include legWins in finish data
          const updatedState = applyBobs27Events(updatedEvents)
          await finishBobs27Match(
            matchId,
            result.matchFinished!.winnerId,
            result.matchFinished!.totalDarts,
            elapsedMs,
            result.matchFinished!.finalScores,
            updatedState.legWins
          )
        } catch (err) {
          console.warn('[Bobs27] Persist failed:', err)
        } finally {
          setSaving(false)
        }
        setTimeout(() => onShowSummary(matchId), 2000)
      })()
    } else if (result.legFinished && !result.matchFinished) {
      // Leg finished but match continues — show leg summary
      persistBobs27Events(matchId, updatedEvents)
    } else {
      persistBobs27Events(matchId, updatedEvents)
    }
  }, [events, state, activePlayerId, gamePaused, matchEndDelay, matchId, elapsedMs, onShowSummary, multiplayer, isMyTurn])

  // Undo: Letzten Wurf rueckgaengig machen
  const undoLast = useCallback(() => {
    if (gamePaused || state.finished || matchEndDelay) return
    if (events.length <= 1) return // Mindestens MatchStarted behalten

    // Finde letztes Throw-Event und entferne alles ab dort
    let cutIndex = events.length
    for (let i = events.length - 1; i >= 0; i--) {
      if (events[i].type === 'Bobs27Throw') {
        cutIndex = i
        break
      }
    }

    if (cutIndex === events.length) return

    // Ausstehende Sprachansagen abbrechen
    clearSpeechTimers()
    cancelDebouncedAnnounce()

    const trimmed = events.slice(0, cutIndex)
    setEvents(trimmed)
    persistBobs27Events(matchId, trimmed)
    setDeltaFlash(null)

    // Multiplayer: Undo senden
    if (multiplayer?.enabled) {
      multiplayer.undo(events.length - cutIndex)
    }
  }, [events, gamePaused, state.finished, matchEndDelay, matchId, multiplayer])

  // Naechstes Leg starten
  const handleNextLeg = useCallback(() => {
    if (!state.match || state.finished) return
    const legStartEvent = startNewBobs27Leg(state)
    const updatedEvents = [...events, legStartEvent]
    setEvents(updatedEvents)
    persistBobs27Events(matchId, updatedEvents)
    // Reset speech tracking for new leg
    gameOnAnnouncedRef.current = false
    lastAnnouncedKeyRef.current = ''
    if (multiplayer?.enabled) {
      multiplayer.submitEvents([legStartEvent])
    }
  }, [events, state, matchId, multiplayer])

  // Ensure keyboard focus when a local player's turn starts
  useEffect(() => {
    if (!multiplayer?.enabled || isMyTurn) document.body.focus()
  }, [activePlayerId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Tastatur-Steuerung
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (gamePaused && e.key !== 'Escape') return
      if (state.finished || matchEndDelay) return

      switch (e.key) {
        case ' ':
        case 'Enter':
          e.preventDefault()
          doThrow(true)
          break
        case '0':
        case 'm':
        case 'M':
          e.preventDefault()
          doThrow(false)
          break
        case 'Backspace':
          e.preventDefault()
          undoLast()
          break
        case 'Escape':
          e.preventDefault()
          setGamePaused(p => !p)
          break
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [doThrow, undoLast, gamePaused, state.finished, matchEndDelay])

  // Pause-Handler
  const handlePause = () => {
    setGamePaused(true)
    setMatchPaused(matchId, 'bobs27', true)
    setMatchElapsedTime(matchId, 'bobs27', elapsedMs)
  }

  const handleResume = () => setGamePaused(false)

  const handleExitMatch = () => {
    setMatchElapsedTime(matchId, 'bobs27', elapsedMs)
    setMatchPaused(matchId, 'bobs27', true)
    onExit()
  }

  const handleDeleteMatch = () => {
    deleteBobs27Match(matchId)
    onExit()
  }

  // Aktueller Spieler-Index fuer Farbe
  const activePlayerIndex = players.findIndex(p => p.playerId === activePlayerId)
  const playerColor = PLAYER_COLORS[activePlayerIndex % PLAYER_COLORS.length] ?? c.accent

  const isMulti = players.length > 1

  // Sidebar-Reihenfolge: naechster Spieler oben, gerade gespielter unten
  // Alle Spieler ausser dem aktiven, rotiert ab currentPlayerIndex+1
  const sidebarPlayers = useMemo(() => {
    if (!isMulti) return []
    const count = players.length
    const result: { player: typeof players[0]; index: number }[] = []
    for (let offset = 1; offset < count; offset++) {
      const idx = (state.currentPlayerIndex + offset) % count
      result.push({ player: players[idx], index: idx })
    }
    return result
  }, [players, state.currentPlayerIndex, isMulti])

  if (!storedMatch || !state.match) {
    return (
      <div style={{ background: c.bg, minHeight: '100dvh', color: c.textBright, padding: 20 }}>
        <p>Match nicht gefunden.</p>
        <button onClick={onExit} style={{ color: c.textBright, background: '#333', border: 'none', padding: '8px 16px', borderRadius: 6, cursor: 'pointer' }}>
          Zurueck
        </button>
      </div>
    )
  }

  // --- Mini Dartboard SVG (visual only) ---
  const BOARD_SEGS = [20,1,18,4,13,6,10,15,2,17,3,19,7,16,8,11,14,9,12,5] as const
  const targetFieldNumber = currentTarget?.fieldNumber ?? 0
  const renderMiniDartboard = (size: number) => {
    const cx = 120, cy = 120
    return (
      <svg viewBox="0 0 240 240" style={{ width: size, height: size, flexShrink: 0, filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.3))' }}>
        {/* Board background */}
        <circle cx={cx} cy={cy} r={115} fill={isArcade ? '#111' : '#1a1a2e'} />
        <circle cx={cx} cy={cy} r={110} fill={isArcade ? '#0a0a0a' : '#111827'} />
        {/* Main segments */}
        {BOARD_SEGS.map((num, i) => {
          const a1 = (i * 18 - 99) * Math.PI / 180
          const a2 = ((i + 1) * 18 - 99) * Math.PI / 180
          const r1 = 28, r2 = 88
          return (
            <path key={`seg-${num}`}
              d={`M${cx+r1*Math.cos(a1)},${cy+r1*Math.sin(a1)} L${cx+r2*Math.cos(a1)},${cy+r2*Math.sin(a1)} A${r2},${r2} 0 0,1 ${cx+r2*Math.cos(a2)},${cy+r2*Math.sin(a2)} L${cx+r1*Math.cos(a2)},${cy+r1*Math.sin(a2)} A${r1},${r1} 0 0,0 ${cx+r1*Math.cos(a1)},${cy+r1*Math.sin(a1)} Z`}
              fill={i % 2 === 0 ? '#1f2937' : '#111827'}
              stroke="#374151" strokeWidth="0.5" opacity={0.7}
            />
          )
        })}
        {/* Double ring segments (outer thin ring) */}
        {BOARD_SEGS.map((num, i) => {
          const a1 = (i * 18 - 99) * Math.PI / 180
          const a2 = ((i + 1) * 18 - 99) * Math.PI / 180
          const r1 = 88, r2 = 100
          const isTarget = num === targetFieldNumber
          return (
            <path key={`dbl-${num}`}
              d={`M${cx+r1*Math.cos(a1)},${cy+r1*Math.sin(a1)} L${cx+r2*Math.cos(a1)},${cy+r2*Math.sin(a1)} A${r2},${r2} 0 0,1 ${cx+r2*Math.cos(a2)},${cy+r2*Math.sin(a2)} L${cx+r1*Math.cos(a2)},${cy+r1*Math.sin(a2)} A${r1},${r1} 0 0,0 ${cx+r1*Math.cos(a1)},${cy+r1*Math.sin(a1)} Z`}
              fill={isTarget ? '#22c55e' : (i % 2 === 0 ? '#dc262640' : '#14532d40')}
              stroke="#374151" strokeWidth="0.5"
              opacity={isTarget ? 1 : 0.5}
              style={isTarget ? { filter: 'drop-shadow(0 0 8px #22c55e90)' } : undefined}
            />
          )
        })}
        {/* Wire circle at double ring boundary */}
        <circle cx={cx} cy={cy} r={88} fill="none" stroke="#4b5563" strokeWidth="0.5" />
        <circle cx={cx} cy={cy} r={100} fill="none" stroke="#4b5563" strokeWidth="0.5" />
        {/* Bull rings */}
        <circle cx={cx} cy={cy} r={16} fill="#14532d" stroke="#374151" strokeWidth="0.5" />
        <circle cx={cx} cy={cy} r={7} fill="#dc2626" stroke="#374151" strokeWidth="0.5" />
        {/* Wire lines between segments */}
        {BOARD_SEGS.map((_, i) => {
          const angle = (i * 18 - 99) * Math.PI / 180
          return (
            <line key={`wire-${i}`}
              x1={cx + 16 * Math.cos(angle)} y1={cy + 16 * Math.sin(angle)}
              x2={cx + 100 * Math.cos(angle)} y2={cy + 100 * Math.sin(angle)}
              stroke="#374151" strokeWidth="0.3"
            />
          )
        })}
        {/* Number labels */}
        {BOARD_SEGS.map((num, i) => {
          const angle = (i * 18 - 90) * Math.PI / 180
          const r = 109
          const isTarget = num === targetFieldNumber
          return (
            <text key={`lbl-${num}`}
              x={cx + r * Math.cos(angle)} y={cy + r * Math.sin(angle) + 3.5}
              textAnchor="middle" fontSize={isTarget ? 11 : 8} fontWeight={isTarget ? 900 : 500}
              fill={isTarget ? '#22c55e' : '#9ca3af'}
              style={isTarget ? { filter: 'drop-shadow(0 0 4px #22c55e)' } : undefined}
            >{num}</text>
          )
        })}
      </svg>
    )
  }

  // --- Hit/Miss button styles ---
  const hitBtnStyle: React.CSSProperties = {
    flex: 1, height: 60, borderRadius: 12, border: 'none', cursor: 'pointer',
    fontSize: 18, fontWeight: 700, touchAction: 'manipulation',
    background: isArcade ? '#14532d' : '#dcfce7',
    color: isArcade ? '#22c55e' : '#15803d',
    boxShadow: isArcade ? 'inset 0 0 0 2px #22c55e' : 'inset 0 0 0 2px #16a34a40',
  }
  const missBtnStyle: React.CSSProperties = {
    flex: 1, height: 60, borderRadius: 12, border: 'none', cursor: 'pointer',
    fontSize: 18, fontWeight: 700, touchAction: 'manipulation',
    background: isArcade ? '#7f1d1d' : '#fee2e2',
    color: isArcade ? '#ef4444' : '#b91c1c',
    boxShadow: isArcade ? 'inset 0 0 0 2px #ef4444' : 'inset 0 0 0 2px #dc262640',
  }

  // --- Mobile Layout ---
  if (isMobile) {
    const showButtons = !state.finished && !matchEndDelay && !state.legFinished && currentTarget

    if (isLandscape) {
      // ==================== LANDSCAPE ====================
      return (
        <div style={{ background: c.bg, minHeight: '100dvh', maxHeight: '100dvh', color: c.textBright, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {gamePaused && <PauseOverlay onResume={handleResume} />}
          {/* Compact Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 10px', borderBottom: `1px solid ${c.border}`, flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 11, color: c.textDim }}>Bob's 27</span>
              {(state.match?.config.legsCount ?? 1) > 1 && (
                <span style={{ fontSize: 11, color: c.accent, fontWeight: 600 }}>Leg {state.currentLegIndex + 1}</span>
              )}
              <span style={{ fontSize: 11, fontFamily: 'monospace', color: c.textDim }}>{formatDuration(elapsedMs)}</span>
            </div>
            <GameControls isPaused={gamePaused} onTogglePause={() => { if (gamePaused) handleResume(); else handlePause() }} isMuted={muted} onToggleMute={() => setMuted(m => !m)} onExit={handleExitMatch}
              title={`Bob's 27${multiplayer?.enabled && multiplayer.roomCode ? ` \u00b7 ${multiplayer.roomCode}` : ''}`} />
          </div>
          {/* Main landscape content */}
          <div style={{ flex: 1, display: 'flex', minHeight: 0, padding: '6px 8px', gap: 10 }}>
            {/* LEFT: Dartboard + dart count */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, flexShrink: 0 }}>
              {renderMiniDartboard(150)}
              {currentTarget && !state.finished && (
                <div style={{ fontSize: 11, color: c.textDim }}>
                  Dart {activePlayerState?.currentDartNumber ?? 1}/{state.match?.config.dartsPerTarget ?? 3}
                  {(activePlayerState?.hitsOnCurrentTarget ?? 0) > 0 && (
                    <span style={{ color: c.green, marginLeft: 6 }}>{activePlayerState?.hitsOnCurrentTarget} Treffer</span>
                  )}
                </div>
              )}
            </div>
            {/* CENTER: Target + buttons */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, minWidth: 0 }}>
              {activePlayer && isMulti && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: playerColor }} />
                  <span style={{ fontSize: 16, fontWeight: 700, color: playerColor }}>{activePlayer.name}</span>
                </div>
              )}
              {/* Score + Target */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{ fontSize: 48, fontWeight: 800, color: c.textBright, lineHeight: 1, position: 'relative' }}>
                  {activePlayerState?.score ?? state.match?.config.startScore ?? 27}
                  {deltaFlash && (
                    <div key={deltaFlash.key} style={{ position: 'absolute', top: -6, right: -40, fontSize: 20, fontWeight: 700, color: deltaFlash.value >= 0 ? c.green : c.red, animation: 'fadeUp 1.5s forwards' }}>
                      {deltaFlash.value >= 0 ? `+${deltaFlash.value}` : deltaFlash.value}
                    </div>
                  )}
                </div>
                {currentTarget && !state.finished && (
                  <div style={{ background: c.cardBg, border: `2px solid ${c.accent}`, borderRadius: 10, padding: '6px 16px', textAlign: 'center' }}>
                    <div style={{ fontSize: 10, color: c.textDim }}>Ziel {(activePlayerState?.currentTargetIndex ?? 0) + 1}/{state.match?.targets.length ?? 20}</div>
                    <div style={{ fontSize: 30, fontWeight: 800, color: c.accent }}>{currentTarget.label}</div>
                  </div>
                )}
              </div>

              {/* Leg Summary overlay */}
              {state.legFinished && !state.finished && !matchEndDelay && (
                <div style={{ background: c.cardBg, border: `2px solid ${c.accent}`, borderRadius: 12, padding: '12px 16px', textAlign: 'center', width: '100%', maxWidth: 300 }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: c.accent, marginBottom: 6 }}>Leg {state.currentLegIndex + 1} beendet</div>
                  {state.legWinnerId && <div style={{ fontSize: 14, fontWeight: 600, color: c.green, marginBottom: 4 }}>{players.find(p => p.playerId === state.legWinnerId)?.name ?? 'Unbekannt'} gewinnt!</div>}
                  {!state.legWinnerId && <div style={{ fontSize: 14, color: c.textDim, marginBottom: 4 }}>Unentschieden</div>}
                  {state.legFinalScores && <div style={{ marginBottom: 6 }}>{players.map((p, i) => (
                    <div key={p.playerId} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: p.playerId === state.legWinnerId ? c.green : c.textBright, fontWeight: p.playerId === state.legWinnerId ? 700 : 400, padding: '2px 6px' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: PLAYER_COLORS[i % PLAYER_COLORS.length] }} />{p.name}</span>
                      <span>{state.legFinalScores![p.playerId] ?? 0}</span>
                    </div>
                  ))}</div>}
                  <div style={{ fontSize: 11, color: c.textDim, marginBottom: 8 }}>Stand: {players.map(p => `${p.name} ${state.legWins[p.playerId] ?? 0}`).join(' \u2013 ')}</div>
                  <button onClick={handleNextLeg} style={{ padding: '8px 16px', fontSize: 14, fontWeight: 700, background: c.accent, border: 'none', color: '#fff', borderRadius: 8, cursor: 'pointer', touchAction: 'manipulation' }}>Naechstes Leg &rarr;</button>
                </div>
              )}

              {/* Match finished */}
              {(state.finished || matchEndDelay) && (
                <div style={{ background: c.cardBg, border: `2px solid ${c.green}`, borderRadius: 12, padding: '12px 16px', textAlign: 'center' }}>
                  <div style={{ fontSize: 20, fontWeight: 700, color: c.green }}>{activePlayerState?.eliminated ? 'Game Over!' : 'Geschafft!'}</div>
                  {(state.match?.config.legsCount ?? 1) > 1 && state.finished?.winnerId && (
                    <div style={{ fontSize: 12, color: c.textDim, marginTop: 2 }}>{players.find(p => p.playerId === state.finished?.winnerId)?.name ?? ''} gewinnt {players.map(p => `${state.legWins[p.playerId] ?? 0}`).join('\u2013')}</div>
                  )}
                  {saving ? (
                    <div style={{ fontSize: 12, color: c.textDim, marginTop: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                      <span style={{ display: 'inline-block', width: 12, height: 12, border: '2px solid currentColor', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />Speichern...
                    </div>
                  ) : (
                    <div style={{ fontSize: 12, color: c.textDim, marginTop: 4 }}>Ergebnis wird geladen...</div>
                  )}
                </div>
              )}

              {/* Hit/Miss Buttons */}
              {showButtons && (
                <div style={{ display: 'flex', gap: 10, width: '100%', maxWidth: 300 }}>
                  <button onClick={() => doThrow(false)} style={missBtnStyle}>{'\u2715'} Daneben</button>
                  <button onClick={() => doThrow(true)} style={hitBtnStyle}>{'\u2713'} Treffer!</button>
                </div>
              )}
              {/* Undo */}
              {!state.finished && !matchEndDelay && !state.legFinished && events.length > 1 && (
                <button onClick={undoLast} style={{ padding: '4px 12px', fontSize: 11, background: 'transparent', border: `1px solid ${c.border}`, color: c.textDim, borderRadius: 6, cursor: 'pointer' }}>Undo</button>
              )}
            </div>
            {/* RIGHT: Player list */}
            <div style={{ width: 130, flexShrink: 0, overflowY: 'auto', borderLeft: `1px solid ${c.border}`, paddingLeft: 8 }}>
              {players.map((p, i) => {
                const ps = state.playerStates[p.playerId]
                const color = PLAYER_COLORS[i % PLAYER_COLORS.length]
                const isActive = p.playerId === activePlayerId
                const isEliminated = ps?.eliminated ?? false
                const isFinished = ps?.finished ?? false
                const targetIdx = ps?.currentTargetIndex ?? 0
                const totalTargets = state.match?.targets.length ?? 20
                return (
                  <div key={p.playerId} style={{ padding: '5px 6px', borderBottom: `1px solid ${c.border}`, opacity: isEliminated ? 0.4 : 1, background: isActive ? (isArcade ? '#1a1a1a' : `${color}10`) : 'transparent', borderRadius: isActive ? 6 : 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 1 }}>
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0 }} />
                      <span style={{ fontSize: 11, fontWeight: isActive ? 700 : 500, color: isActive ? color : c.textBright, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                    </div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: c.textBright, paddingLeft: 10 }}>{ps?.score ?? 27}</div>
                    <div style={{ fontSize: 9, color: c.textDim, paddingLeft: 10 }}>
                      {isEliminated ? '\u2620 Eliminiert' : isFinished ? '\u2714 Fertig' : `D${state.match?.targets[targetIdx]?.fieldNumber ?? '?'} (${targetIdx + 1}/${totalTargets})`}
                    </div>
                    {(state.match?.config.legsCount ?? 1) > 1 && (
                      <div style={{ fontSize: 9, color: c.accent, fontWeight: 600, paddingLeft: 10, marginTop: 1 }}>Legs: {state.legWins[p.playerId] ?? 0}</div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
          <style>{`
            @keyframes fadeUp { 0% { opacity: 1; transform: translateY(0); } 100% { opacity: 0; transform: translateY(-30px); } }
            @keyframes spin { to { transform: rotate(360deg); } }
          `}</style>
        </div>
      )
    }

    // ==================== PORTRAIT ====================
    return (
      <div style={{ background: c.bg, minHeight: '100dvh', color: c.textBright, display: 'flex', flexDirection: 'column' }}>
        {gamePaused && <PauseOverlay onResume={handleResume} />}
        {/* Compact Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 10px', borderBottom: `1px solid ${c.border}`, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, color: c.textDim }}>Bob's 27</span>
            {(state.match?.config.legsCount ?? 1) > 1 && (
              <span style={{ fontSize: 11, color: c.accent, fontWeight: 600 }}>Leg {state.currentLegIndex + 1}</span>
            )}
            <span style={{ fontSize: 11, fontFamily: 'monospace', color: c.textDim }}>{formatDuration(elapsedMs)}</span>
          </div>
          <GameControls isPaused={gamePaused} onTogglePause={() => { if (gamePaused) handleResume(); else handlePause() }} isMuted={muted} onToggleMute={() => setMuted(m => !m)} onExit={handleExitMatch}
            title={`Bob's 27${multiplayer?.enabled && multiplayer.roomCode ? ` \u00b7 ${multiplayer.roomCode}` : ''}`} />
        </div>

        {/* Scrollable content */}
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '8px 12px', gap: 8 }}>
          {/* Mini Dartboard */}
          {!state.finished && !matchEndDelay && (
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              {renderMiniDartboard(120)}
            </div>
          )}

          {/* Target Info */}
          {currentTarget && !state.finished && !matchEndDelay && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 36, fontWeight: 800, color: c.accent, lineHeight: 1 }}>{currentTarget.label}</div>
              <div style={{ fontSize: 12, color: c.textDim, marginTop: 2 }}>
                Dart {activePlayerState?.currentDartNumber ?? 1}/{state.match?.config.dartsPerTarget ?? 3}
                {' \u00b7 '}Ziel {(activePlayerState?.currentTargetIndex ?? 0) + 1}/{state.match?.targets.length ?? 20}
                {(activePlayerState?.hitsOnCurrentTarget ?? 0) > 0 && (
                  <span style={{ color: c.green, marginLeft: 6 }}>{activePlayerState?.hitsOnCurrentTarget} Treffer</span>
                )}
              </div>
            </div>
          )}

          {/* Player name + Score */}
          <div style={{ textAlign: 'center' }}>
            {activePlayer && isMulti && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 2 }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: playerColor }} />
                <span style={{ fontSize: 15, fontWeight: 700, color: playerColor }}>{activePlayer.name}</span>
              </div>
            )}
            <div style={{ fontSize: 52, fontWeight: 800, color: c.textBright, lineHeight: 1, position: 'relative', display: 'inline-block' }}>
              {activePlayerState?.score ?? state.match?.config.startScore ?? 27}
              {deltaFlash && (
                <div key={deltaFlash.key} style={{ position: 'absolute', top: -6, right: -40, fontSize: 22, fontWeight: 700, color: deltaFlash.value >= 0 ? c.green : c.red, animation: 'fadeUp 1.5s forwards' }}>
                  {deltaFlash.value >= 0 ? `+${deltaFlash.value}` : deltaFlash.value}
                </div>
              )}
            </div>
          </div>

          {/* Leg Summary overlay */}
          {state.legFinished && !state.finished && !matchEndDelay && (
            <div style={{ background: c.cardBg, border: `2px solid ${c.accent}`, borderRadius: 12, padding: '14px 18px', textAlign: 'center', width: '100%', maxWidth: 340 }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: c.accent, marginBottom: 8 }}>Leg {state.currentLegIndex + 1} beendet</div>
              {state.legWinnerId && <div style={{ fontSize: 14, fontWeight: 600, color: c.green, marginBottom: 6 }}>{players.find(p => p.playerId === state.legWinnerId)?.name ?? 'Unbekannt'} gewinnt!</div>}
              {!state.legWinnerId && <div style={{ fontSize: 14, color: c.textDim, marginBottom: 6 }}>Unentschieden</div>}
              {state.legFinalScores && <div style={{ marginBottom: 8 }}>{players.map((p, i) => (
                <div key={p.playerId} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: p.playerId === state.legWinnerId ? c.green : c.textBright, fontWeight: p.playerId === state.legWinnerId ? 700 : 400, padding: '2px 8px' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 7, height: 7, borderRadius: '50%', background: PLAYER_COLORS[i % PLAYER_COLORS.length] }} />{p.name}</span>
                  <span>{state.legFinalScores![p.playerId] ?? 0}</span>
                </div>
              ))}</div>}
              <div style={{ fontSize: 12, color: c.textDim, marginBottom: 10 }}>Stand: {players.map(p => `${p.name} ${state.legWins[p.playerId] ?? 0}`).join(' \u2013 ')}</div>
              <button onClick={handleNextLeg} style={{ padding: '10px 20px', fontSize: 15, fontWeight: 700, background: c.accent, border: 'none', color: '#fff', borderRadius: 8, cursor: 'pointer', touchAction: 'manipulation' }}>Naechstes Leg &rarr;</button>
            </div>
          )}

          {/* Match finished */}
          {(state.finished || matchEndDelay) && (
            <div style={{ background: c.cardBg, border: `2px solid ${c.green}`, borderRadius: 12, padding: '14px 20px', textAlign: 'center' }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: c.green }}>{activePlayerState?.eliminated ? 'Game Over!' : 'Geschafft!'}</div>
              {(state.match?.config.legsCount ?? 1) > 1 && state.finished?.winnerId && (
                <div style={{ fontSize: 13, color: c.textDim, marginTop: 3 }}>{players.find(p => p.playerId === state.finished?.winnerId)?.name ?? ''} gewinnt {players.map(p => `${state.legWins[p.playerId] ?? 0}`).join('\u2013')}</div>
              )}
              {saving ? (
                <div style={{ fontSize: 12, color: c.textDim, marginTop: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                  <span style={{ display: 'inline-block', width: 12, height: 12, border: '2px solid currentColor', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />Speichern...
                </div>
              ) : (
                <div style={{ fontSize: 13, color: c.textDim, marginTop: 4 }}>Ergebnis wird geladen...</div>
              )}
            </div>
          )}

          {/* HIT / MISS Buttons */}
          {showButtons && (
            <div style={{ display: 'flex', gap: 10, width: '100%', maxWidth: 340 }}>
              <button onClick={() => doThrow(false)} style={missBtnStyle}>{'\u2715'} Daneben</button>
              <button onClick={() => doThrow(true)} style={hitBtnStyle}>{'\u2713'} Treffer!</button>
            </div>
          )}

          {/* Undo */}
          {!state.finished && !matchEndDelay && !state.legFinished && events.length > 1 && (
            <button onClick={undoLast} style={{ padding: '4px 14px', fontSize: 11, background: 'transparent', border: `1px solid ${c.border}`, color: c.textDim, borderRadius: 6, cursor: 'pointer' }}>Undo</button>
          )}

          {/* Player scores (compact list) */}
          {isMulti && (
            <div style={{ width: '100%', maxWidth: 340, background: c.cardBg, borderRadius: 8, border: `1px solid ${c.border}`, overflow: 'hidden' }}>
              {players.map((p, i) => {
                const ps = state.playerStates[p.playerId]
                const color = PLAYER_COLORS[i % PLAYER_COLORS.length]
                const isActive = p.playerId === activePlayerId
                const isEliminated = ps?.eliminated ?? false
                const isPlayerFinished = ps?.finished ?? false
                const targetIdx = ps?.currentTargetIndex ?? 0
                const totalTargets = state.match?.targets.length ?? 20
                return (
                  <div key={p.playerId} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '6px 10px', borderBottom: `1px solid ${c.border}`,
                    opacity: isEliminated ? 0.4 : 1,
                    background: isActive ? (isArcade ? '#1a1a1a' : `${color}10`) : 'transparent',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
                      <div>
                        <div style={{ fontSize: 13, fontWeight: isActive ? 700 : 500, color: isActive ? color : c.textBright }}>{p.name}</div>
                        <div style={{ fontSize: 10, color: c.textDim }}>
                          {isEliminated ? '\u2620 Eliminiert' : isPlayerFinished ? '\u2714 Fertig' : `D${state.match?.targets[targetIdx]?.fieldNumber ?? '?'} (${targetIdx + 1}/${totalTargets})`}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {(state.match?.config.legsCount ?? 1) > 1 && (
                        <span style={{ fontSize: 10, color: c.accent, fontWeight: 600 }}>L:{state.legWins[p.playerId] ?? 0}</span>
                      )}
                      <span style={{ fontSize: 20, fontWeight: 800, color: c.textBright }}>{ps?.score ?? 27}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Single-player: compact history */}
          {!isMulti && activePlayerState && activePlayerState.targetResults.length > 0 && (
            <div style={{ width: '100%', maxWidth: 340, background: c.cardBg, borderRadius: 8, border: `1px solid ${c.border}`, overflow: 'hidden' }}>
              <div style={{ padding: '4px 8px', fontSize: 10, fontWeight: 600, color: c.textDim, borderBottom: `1px solid ${c.border}` }}>Verlauf</div>
              <div style={{ maxHeight: 120, overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                  <tbody>
                    {[...activePlayerState.targetResults].reverse().map((r, i) => (
                      <tr key={i} style={{ borderBottom: `1px solid ${c.border}` }}>
                        <td style={{ padding: '3px 8px', fontWeight: 500 }}>{r.target.label}</td>
                        <td style={{ textAlign: 'center', padding: '3px 6px' }}>
                          {r.hits > 0 ? <span style={{ color: c.green }}>{r.hits}/{r.dartsThrown}</span> : <span style={{ color: c.red }}>0/{r.dartsThrown}</span>}
                        </td>
                        <td style={{ textAlign: 'right', padding: '3px 6px', fontWeight: 600, color: r.delta >= 0 ? c.green : c.red }}>
                          {r.delta >= 0 ? `+${r.delta}` : r.delta}
                        </td>
                        <td style={{ textAlign: 'right', padding: '3px 8px', fontWeight: 600 }}>{r.scoreAfter}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <style>{`
          @keyframes fadeUp { 0% { opacity: 1; transform: translateY(0); } 100% { opacity: 0; transform: translateY(-30px); } }
          @keyframes spin { to { transform: rotate(360deg); } }
        `}</style>
      </div>
    )
  }

  // ==================== DESKTOP ====================
  // Realistic dartboard renderer
  const renderRealisticDartboard = (size: number) => {
    const cx = 150, cy = 150
    // Standard dartboard segment order (clockwise from top)
    const segs = BOARD_SEGS
    // Radii for each ring (scaled to viewBox 300x300)
    const rNumberRing = 142 // number label position
    const rOuterWire = 136
    const rDoubleOuter = 136
    const rDoubleInner = 126
    const rSingleOuter = 126
    const rTripleOuter = 82
    const rTripleInner = 74
    const rSingleInner = 74
    const rBullOuter = 26
    const rBullInner = 10

    const segPath = (r1: number, r2: number, i: number) => {
      const a1 = (i * 18 - 99) * Math.PI / 180
      const a2 = ((i + 1) * 18 - 99) * Math.PI / 180
      return `M${cx+r1*Math.cos(a1)},${cy+r1*Math.sin(a1)} L${cx+r2*Math.cos(a1)},${cy+r2*Math.sin(a1)} A${r2},${r2} 0 0,1 ${cx+r2*Math.cos(a2)},${cy+r2*Math.sin(a2)} L${cx+r1*Math.cos(a2)},${cy+r1*Math.sin(a2)} A${r1},${r1} 0 0,0 ${cx+r1*Math.cos(a1)},${cy+r1*Math.sin(a1)} Z`
    }

    const RED = '#c41e3a'
    const GREEN = '#0a7e3b'
    const BLACK = '#1a1a1a'
    const CREAM = '#f5f0e6'
    const WIRE = '#c0c0c0'

    return (
      <svg viewBox="0 0 300 300" style={{ width: size, height: size, flexShrink: 0, filter: 'drop-shadow(0 4px 20px rgba(0,0,0,0.5))' }}>
        <defs>
          <filter id="targetGlow">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <radialGradient id="boardBg" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#2a2a2a" />
            <stop offset="100%" stopColor="#111" />
          </radialGradient>
        </defs>

        {/* Board backing */}
        <circle cx={cx} cy={cy} r={145} fill="#222" stroke="#444" strokeWidth="2" />
        <circle cx={cx} cy={cy} r={rOuterWire} fill="url(#boardBg)" />

        {/* Number ring background */}
        <circle cx={cx} cy={cy} r={145} fill="none" />

        {/* Single outer segments (between double and triple) */}
        {segs.map((num, i) => {
          const fillColor = i % 2 === 0 ? BLACK : CREAM
          return (
            <path key={`so-${num}`}
              d={segPath(rTripleOuter, rDoubleInner, i)}
              fill={fillColor} stroke={WIRE} strokeWidth="0.3"
            />
          )
        })}

        {/* Single inner segments (between triple and bull) */}
        {segs.map((num, i) => {
          const fillColor = i % 2 === 0 ? BLACK : CREAM
          return (
            <path key={`si-${num}`}
              d={segPath(rBullOuter, rTripleInner, i)}
              fill={fillColor} stroke={WIRE} strokeWidth="0.3"
            />
          )
        })}

        {/* Triple ring */}
        {segs.map((num, i) => {
          const fillColor = i % 2 === 0 ? RED : GREEN
          return (
            <path key={`tr-${num}`}
              d={segPath(rTripleInner, rTripleOuter, i)}
              fill={fillColor} stroke={WIRE} strokeWidth="0.3"
            />
          )
        })}

        {/* Double ring */}
        {segs.map((num, i) => {
          const isTarget = num === targetFieldNumber
          const fillColor = i % 2 === 0 ? RED : GREEN
          return (
            <path key={`db-${num}`}
              d={segPath(rDoubleInner, rDoubleOuter, i)}
              fill={isTarget ? '#ffdd00' : fillColor}
              stroke={isTarget ? '#ffdd00' : WIRE}
              strokeWidth={isTarget ? 1.5 : 0.3}
              style={isTarget ? { filter: 'url(#targetGlow)' } : undefined}
            />
          )
        })}

        {/* Target glow overlay for double (drawn again on top for extra brightness) */}
        {segs.map((num, i) => {
          if (num !== targetFieldNumber) return null
          return (
            <path key={`glow-${num}`}
              d={segPath(rDoubleInner - 2, rDoubleOuter + 2, i)}
              fill="none"
              stroke="#ffdd00"
              strokeWidth="2"
              opacity="0.6"
              className="bobs27-target-pulse"
            />
          )
        })}

        {/* Bull outer (green) */}
        <circle cx={cx} cy={cy} r={rBullOuter}
          fill={targetFieldNumber === 25 ? '#ffdd00' : GREEN}
          stroke={targetFieldNumber === 25 ? '#ffdd00' : WIRE}
          strokeWidth={targetFieldNumber === 25 ? 1.5 : 0.5}
          style={targetFieldNumber === 25 ? { filter: 'url(#targetGlow)' } : undefined}
        />
        {/* Bull inner (red) */}
        <circle cx={cx} cy={cy} r={rBullInner}
          fill={targetFieldNumber === 25 ? '#ffdd00' : RED}
          stroke={targetFieldNumber === 25 ? '#ffdd00' : WIRE}
          strokeWidth={targetFieldNumber === 25 ? 1.5 : 0.5}
          style={targetFieldNumber === 25 ? { filter: 'url(#targetGlow)' } : undefined}
        />
        {/* Bull glow pulse */}
        {targetFieldNumber === 25 && (
          <circle cx={cx} cy={cy} r={rBullOuter + 2}
            fill="none" stroke="#ffdd00" strokeWidth="2" opacity="0.6"
            className="bobs27-target-pulse"
          />
        )}

        {/* Wire circles */}
        <circle cx={cx} cy={cy} r={rDoubleOuter} fill="none" stroke={WIRE} strokeWidth="0.5" />
        <circle cx={cx} cy={cy} r={rDoubleInner} fill="none" stroke={WIRE} strokeWidth="0.5" />
        <circle cx={cx} cy={cy} r={rTripleOuter} fill="none" stroke={WIRE} strokeWidth="0.5" />
        <circle cx={cx} cy={cy} r={rTripleInner} fill="none" stroke={WIRE} strokeWidth="0.5" />
        <circle cx={cx} cy={cy} r={rBullOuter} fill="none" stroke={WIRE} strokeWidth="0.5" />
        <circle cx={cx} cy={cy} r={rBullInner} fill="none" stroke={WIRE} strokeWidth="0.5" />

        {/* Wire lines between segments */}
        {segs.map((_, i) => {
          const angle = (i * 18 - 99) * Math.PI / 180
          return (
            <line key={`w-${i}`}
              x1={cx + rBullOuter * Math.cos(angle)} y1={cy + rBullOuter * Math.sin(angle)}
              x2={cx + rDoubleOuter * Math.cos(angle)} y2={cy + rDoubleOuter * Math.sin(angle)}
              stroke={WIRE} strokeWidth="0.4"
            />
          )
        })}

        {/* Number labels */}
        {segs.map((num, i) => {
          const angle = (i * 18 - 90) * Math.PI / 180
          const isTarget = num === targetFieldNumber
          return (
            <text key={`n-${num}`}
              x={cx + rNumberRing * Math.cos(angle)}
              y={cy + rNumberRing * Math.sin(angle) + 4}
              textAnchor="middle"
              fontSize={isTarget ? 13 : 10}
              fontWeight={isTarget ? 900 : 600}
              fill={isTarget ? '#ffdd00' : '#ddd'}
              style={isTarget ? { filter: 'drop-shadow(0 0 4px #ffdd00)' } : undefined}
              fontFamily="system-ui, sans-serif"
            >{num}</text>
          )
        })}
      </svg>
    )
  }

  const showDesktopButtons = !state.finished && !matchEndDelay && !state.legFinished && currentTarget
  const legsCount = state.match?.config.legsCount ?? 1

  return (
    <div style={{ background: c.bg, minHeight: '100dvh', maxHeight: '100dvh', color: c.textBright, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Pause Overlay */}
      {gamePaused && <PauseOverlay onResume={handleResume} />}

      {/* Header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '8px 20px',
        borderBottom: `1px solid ${c.border}`,
        background: isArcade ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.02)',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: c.textBright }}>Bob's 27</span>
          {legsCount > 1 && (
            <span style={{
              fontSize: 12, color: c.accent, fontWeight: 600,
              background: c.accent + '18', padding: '2px 8px', borderRadius: 4,
            }}>
              Leg {state.currentLegIndex + 1}/{legsCount}
            </span>
          )}
          <span style={{ fontSize: 13, fontFamily: 'monospace', color: c.textDim }}>
            {formatDuration(elapsedMs)}
          </span>
        </div>
        <GameControls
          isPaused={gamePaused}
          onTogglePause={() => { if (gamePaused) handleResume(); else handlePause() }}
          isMuted={muted}
          onToggleMute={() => setMuted(m => !m)}
          onExit={handleExitMatch}
          title={`Bob's 27${multiplayer?.enabled && multiplayer.roomCode ? ` \u00b7 ${multiplayer.roomCode}` : ''}`}
        />
      </div>

      {/* Main content area */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>

        {/* Left side: Dartboard + controls */}
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', padding: '16px 24px', gap: 12, minHeight: 0,
          position: 'relative',
        }}>

          {/* Active player name (multiplayer) */}
          {activePlayer && isMulti && !state.finished && !matchEndDelay && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 12, height: 12, borderRadius: '50%', background: playerColor, boxShadow: `0 0 8px ${playerColor}` }} />
              <span style={{ fontSize: 20, fontWeight: 800, color: playerColor }}>{activePlayer.name}</span>
            </div>
          )}

          {/* Score display overlaid near dartboard */}
          <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            {/* Dartboard */}
            {!state.finished && !matchEndDelay && renderRealisticDartboard(260)}

            {/* Score badge */}
            <div style={{
              marginTop: 8,
              display: 'flex', alignItems: 'center', gap: 16,
              position: 'relative',
            }}>
              <div style={{
                fontSize: 56, fontWeight: 800, color: c.textBright, lineHeight: 1,
                textShadow: isArcade ? '0 0 20px rgba(255,255,255,0.15)' : 'none',
                position: 'relative',
              }}>
                {activePlayerState?.score ?? state.match?.config.startScore ?? 27}
                {deltaFlash && (
                  <div key={deltaFlash.key} style={{
                    position: 'absolute', top: -8, right: -50,
                    fontSize: 26, fontWeight: 700,
                    color: deltaFlash.value >= 0 ? c.green : c.red,
                    animation: 'bobs27FadeUp 1.5s forwards',
                  }}>
                    {deltaFlash.value >= 0 ? `+${deltaFlash.value}` : deltaFlash.value}
                  </div>
                )}
              </div>
              {currentTarget && !state.finished && !matchEndDelay && (
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 11, color: c.textDim, letterSpacing: 0.5 }}>
                    Ziel {(activePlayerState?.currentTargetIndex ?? 0) + 1}/{state.match?.targets.length ?? 20}
                  </div>
                  <div style={{ fontSize: 32, fontWeight: 800, color: '#ffdd00', lineHeight: 1 }}>
                    {currentTarget.label}
                  </div>
                  <div style={{ fontSize: 12, color: c.textDim, marginTop: 2 }}>
                    Dart {activePlayerState?.currentDartNumber ?? 1}/{state.match?.config.dartsPerTarget ?? 3}
                    {(activePlayerState?.hitsOnCurrentTarget ?? 0) > 0 && (
                      <span style={{ color: c.green, marginLeft: 6, fontWeight: 600 }}>
                        {activePlayerState?.hitsOnCurrentTarget} Treffer
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Leg Summary overlay */}
          {state.legFinished && !state.finished && !matchEndDelay && (
            <div style={{
              background: c.cardBg, border: `2px solid ${c.accent}`,
              borderRadius: 16, padding: '24px 32px', textAlign: 'center',
              maxWidth: 440, width: '100%',
              boxShadow: `0 8px 32px rgba(0,0,0,0.3)`,
            }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: c.accent, marginBottom: 12 }}>
                Leg {state.currentLegIndex + 1} beendet
              </div>
              {state.legWinnerId && (
                <div style={{ fontSize: 16, fontWeight: 600, color: c.green, marginBottom: 8 }}>
                  {players.find(p => p.playerId === state.legWinnerId)?.name ?? 'Unbekannt'} gewinnt das Leg!
                </div>
              )}
              {!state.legWinnerId && (
                <div style={{ fontSize: 16, fontWeight: 600, color: c.textDim, marginBottom: 8 }}>Unentschieden</div>
              )}
              {state.legFinalScores && (
                <div style={{ marginBottom: 12 }}>
                  {players.map((p, i) => (
                    <div key={p.playerId} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '4px 8px', fontSize: 14,
                      color: p.playerId === state.legWinnerId ? c.green : c.textBright,
                      fontWeight: p.playerId === state.legWinnerId ? 700 : 400,
                    }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: PLAYER_COLORS[i % PLAYER_COLORS.length] }} />
                        {p.name}
                      </span>
                      <span>{state.legFinalScores![p.playerId] ?? 0}</span>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ fontSize: 13, color: c.textDim, marginBottom: 12 }}>
                Stand: {players.map(p => `${p.name} ${state.legWins[p.playerId] ?? 0}`).join(' \u2013 ')}
              </div>
              <button onClick={handleNextLeg} style={{
                padding: '12px 28px', fontSize: 16, fontWeight: 700,
                background: `linear-gradient(135deg, ${c.accent}, ${c.accent}dd)`,
                border: 'none', color: '#fff', borderRadius: 10, cursor: 'pointer',
                boxShadow: `0 4px 12px ${c.accent}40`,
              }}>
                Naechstes Leg &rarr;
              </button>
            </div>
          )}

          {/* Match finished */}
          {(state.finished || matchEndDelay) && (
            <div style={{
              background: c.cardBg, border: `2px solid ${c.green}`,
              borderRadius: 16, padding: '24px 32px', textAlign: 'center',
              boxShadow: `0 8px 32px rgba(0,0,0,0.3)`,
            }}>
              <div style={{ fontSize: 28, fontWeight: 800, color: c.green }}>
                {activePlayerState?.eliminated ? 'Game Over!' : 'Geschafft!'}
              </div>
              {legsCount > 1 && state.finished?.winnerId && (
                <div style={{ fontSize: 14, color: c.textDim, marginTop: 4 }}>
                  {players.find(p => p.playerId === state.finished?.winnerId)?.name ?? ''} gewinnt{' '}
                  {players.map(p => `${state.legWins[p.playerId] ?? 0}`).join('\u2013')}
                </div>
              )}
              {saving ? (
                <div style={{ fontSize: 13, color: c.textDim, marginTop: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                  <span style={{ display: 'inline-block', width: 14, height: 14, border: '2px solid currentColor', borderTopColor: 'transparent', borderRadius: '50%', animation: 'bobs27Spin 0.8s linear infinite' }} />
                  Speichern...
                </div>
              ) : (
                <div style={{ fontSize: 14, color: c.textDim, marginTop: 4 }}>Ergebnis wird geladen...</div>
              )}
            </div>
          )}

          {/* Hit / Miss buttons */}
          {showDesktopButtons && (
            <div style={{ display: 'flex', gap: 16, width: '100%', maxWidth: 400, justifyContent: 'center' }}>
              <button
                onClick={() => doThrow(false)}
                style={{
                  flex: 1, height: 56, borderRadius: 14, border: 'none', cursor: 'pointer',
                  fontSize: 18, fontWeight: 700,
                  background: 'linear-gradient(135deg, #b91c1c, #dc2626)',
                  color: '#fff',
                  boxShadow: '0 4px 14px rgba(220,38,38,0.35), inset 0 1px 0 rgba(255,255,255,0.15)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  transition: 'transform 0.1s, box-shadow 0.1s',
                }}
                onMouseDown={e => (e.currentTarget.style.transform = 'scale(0.97)')}
                onMouseUp={e => (e.currentTarget.style.transform = 'scale(1)')}
                onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
              >
                <span style={{ fontSize: 22 }}>{'\u2715'}</span> Daneben
              </button>
              <button
                onClick={() => doThrow(true)}
                style={{
                  flex: 1, height: 56, borderRadius: 14, border: 'none', cursor: 'pointer',
                  fontSize: 18, fontWeight: 700,
                  background: 'linear-gradient(135deg, #15803d, #22c55e)',
                  color: '#fff',
                  boxShadow: '0 4px 14px rgba(34,197,94,0.35), inset 0 1px 0 rgba(255,255,255,0.15)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  transition: 'transform 0.1s, box-shadow 0.1s',
                }}
                onMouseDown={e => (e.currentTarget.style.transform = 'scale(0.97)')}
                onMouseUp={e => (e.currentTarget.style.transform = 'scale(1)')}
                onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
              >
                <span style={{ fontSize: 22 }}>{'\u2713'}</span> Treffer!
              </button>
            </div>
          )}

          {/* Undo */}
          {!state.finished && !matchEndDelay && !state.legFinished && events.length > 1 && (
            <button onClick={undoLast} style={{
              padding: '5px 18px', fontSize: 12, background: 'transparent',
              border: `1px solid ${c.border}`, color: c.textDim,
              borderRadius: 8, cursor: 'pointer', opacity: 0.7,
              transition: 'opacity 0.15s',
            }}
              onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
              onMouseLeave={e => (e.currentTarget.style.opacity = '0.7')}
            >
              {'\u21a9'} Rueckgaengig
            </button>
          )}

          {/* Keyboard hint */}
          <div style={{ fontSize: 10, color: c.textDim, textAlign: 'center', opacity: 0.5 }}>
            Space/Enter = Treffer | 0/M = Daneben | Backspace = Undo | Esc = Pause
          </div>
        </div>

        {/* Right sidebar: Players + Timeline */}
        <div style={{
          width: isMulti ? 260 : 240,
          borderLeft: `1px solid ${c.border}`,
          display: 'flex', flexDirection: 'column',
          flexShrink: 0,
          background: isArcade ? 'rgba(0,0,0,0.15)' : 'rgba(0,0,0,0.02)',
          overflow: 'hidden',
        }}>
          {/* Player cards */}
          {isMulti && (
            <div style={{ flexShrink: 0 }}>
              <div style={{
                fontSize: 10, fontWeight: 600, color: c.textDim,
                textTransform: 'uppercase', letterSpacing: 1.5,
                padding: '10px 14px 6px',
              }}>
                Spieler
              </div>
              {players.map((p, i) => {
                const ps = state.playerStates[p.playerId]
                const color = PLAYER_COLORS[i % PLAYER_COLORS.length]
                const isActive = p.playerId === activePlayerId
                const isEliminated = ps?.eliminated ?? false
                const isPlayerFinished = ps?.finished ?? false
                const targetIdx = ps?.currentTargetIndex ?? 0
                const totalTargets = state.match?.targets.length ?? 20

                return (
                  <div key={p.playerId} style={{
                    padding: '10px 14px',
                    borderBottom: `1px solid ${c.border}`,
                    opacity: isEliminated ? 0.35 : 1,
                    background: isActive ? (isArcade ? 'rgba(255,255,255,0.05)' : `${color}0c`) : 'transparent',
                    borderLeft: isActive ? `3px solid ${color}` : '3px solid transparent',
                    transition: 'all 0.3s ease',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{
                          width: 10, height: 10, borderRadius: '50%', background: color, flexShrink: 0,
                          boxShadow: isActive ? `0 0 8px ${color}` : 'none',
                        }} />
                        <span style={{
                          fontSize: 14, fontWeight: isActive ? 700 : 500,
                          color: isActive ? color : c.textBright,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>{p.name}</span>
                      </div>
                      <span style={{
                        fontSize: 24, fontWeight: 800, color: c.textBright,
                        textShadow: isActive ? '0 0 10px rgba(255,255,255,0.1)' : 'none',
                      }}>
                        {ps?.score ?? 27}
                      </span>
                    </div>
                    <div style={{ fontSize: 11, color: c.textDim, marginTop: 3, paddingLeft: 18 }}>
                      {isEliminated
                        ? <span style={{ color: c.red }}>{'\u2620'} Eliminiert</span>
                        : isPlayerFinished
                          ? <span style={{ color: c.green }}>{'\u2714'} Fertig</span>
                          : <>
                              <span style={{ color: c.accent, fontWeight: 600 }}>
                                {'\u2192'} D{state.match?.targets[targetIdx]?.fieldNumber ?? '?'}
                              </span>
                              <span style={{ marginLeft: 4 }}>({targetIdx + 1}/{totalTargets})</span>
                            </>
                      }
                    </div>
                    {legsCount > 1 && (
                      <div style={{ fontSize: 10, color: c.accent, fontWeight: 600, paddingLeft: 18, marginTop: 2 }}>
                        Legs: {state.legWins[p.playerId] ?? 0}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Timeline */}
          {activePlayerState && activePlayerState.targetResults.length > 0 && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              <div style={{
                padding: '10px 14px 6px', fontSize: 10, fontWeight: 600,
                color: c.textDim, textTransform: 'uppercase', letterSpacing: 1.5,
                flexShrink: 0,
              }}>
                Verlauf
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: '0 8px 8px' }}>
                {[...activePlayerState.targetResults].reverse().map((r, i) => (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '5px 8px', borderBottom: `1px solid ${c.border}`,
                    fontSize: 12,
                  }}>
                    <span style={{ fontWeight: 600, minWidth: 30 }}>{r.target.label}</span>
                    <span style={{ display: 'flex', gap: 3, flex: 1, justifyContent: 'center' }}>
                      {Array.from({ length: r.dartsThrown }).map((_, di) => (
                        <span key={di} style={{
                          display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
                          background: di < r.hits ? c.green : (isArcade ? '#444' : '#ddd'),
                        }} />
                      ))}
                    </span>
                    <span style={{
                      fontWeight: 600, minWidth: 36, textAlign: 'right',
                      color: r.delta >= 0 ? c.green : c.red,
                    }}>
                      {r.delta >= 0 ? `+${r.delta}` : r.delta}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* CSS Animations */}
      <style>{`
        @keyframes bobs27FadeUp {
          0% { opacity: 1; transform: translateY(0); }
          100% { opacity: 0; transform: translateY(-30px); }
        }
        @keyframes bobs27Spin {
          to { transform: rotate(360deg); }
        }
        @keyframes bobs27Pulse {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 1; }
        }
        .bobs27-target-pulse {
          animation: bobs27Pulse 1.2s ease-in-out infinite;
        }
      `}</style>
    </div>
  )
}
