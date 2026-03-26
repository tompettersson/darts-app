// src/screens/GameKiller.tsx
// Live-Spielscreen fuer Killer Darts
// 2-8 Spieler, jeder bekommt eine Zielzahl (1-20).
// Phase 1: Qualifying - eigene Zahl treffen (Double/Triple).
// Phase 2: Killer - gegnerische Zahlen treffen um Leben abzuziehen.
// Letzter Ueberlebender gewinnt.

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import {
  getKillerMatchById,
  persistKillerEvents,
  finishKillerMatch,
  deleteKillerMatch,
  setMatchPaused,
  setMatchElapsedTime,
  getProfiles,
  ensureKillerMatchExists,
} from '../storage'
import {
  applyKillerEvents,
  recordKillerTurn,
  getActivePlayerId,
  formatDart,
  formatDuration,
  id as killerId,
  now as killerNow,
  type KillerEvent,
  type KillerDart,
  type KillerTurnResult,
} from '../dartsKiller'
import {
  announceKillerPlayerTurn,
  announceKillerQualifyingTurn,
  announceKillerQualified,
  announceKillerHit,
  announceKillerEliminated,
  announceKillerWinner,
  announceKillerSelfHeal,
  announceKillerLegWin,
  announceKillerSetWin,
  playKillerHitSound,
  playKillerEliminatedSound,
  playTriple20Sound,
  cancelDebouncedAnnounce,
  debouncedAnnounce,
} from '../speech'
import { useGameState } from '../hooks/useGameState'
import { computeKillerMatchStats } from '../stats/computeKillerStats'
import type { KillerStoredMatch } from '../types/killer'
import GameControls, { PauseOverlay } from '../components/GameControls'
import KillerDartboard from '../components/KillerDartboard'
import { PLAYER_COLORS } from '../playerColors'
import { useDisableScale } from '../components/ScaleWrapper'

// Hilfsfunktion: Beste Zelle pro Zeile hervorheben
function getStatWinnerColors(
  numericValues: number[],
  playerIds: string[],
  better: 'high' | 'low',
  playerColorMap: Record<string, string>
): (string | undefined)[] {
  if (playerIds.length < 2) return playerIds.map(() => undefined)
  const allEqual = numericValues.every(v => v === numericValues[0])
  if (allEqual) return playerIds.map(() => undefined)
  const best = better === 'high' ? Math.max(...numericValues) : Math.min(...numericValues)
  return numericValues.map((v, i) => v === best ? playerColorMap[playerIds[i]] : undefined)
}

// Nummernpad-Layout
const NUMBER_PAD = [
  [1, 2, 3, 4, 5],
  [6, 7, 8, 9, 10],
  [11, 12, 13, 14, 15],
  [16, 17, 18, 19, 20],
] as const

// Log-Farben
const LOG_COLORS: Record<string, string> = {
  qualifying: '#3498db',
  hit: '#e67e22',
  kill: '#e74c3c',
  heal: '#2ecc71',
  info: '#95a5a6',
}

type MultiplayerProp = {
  enabled: boolean
  roomCode: string
  myPlayerId: string
  submitEvents: (events: any[]) => void
  undo: (removeCount: number) => void
  remoteEvents: any[] | null
  connectionStatus: string
  playerCount: number
}

type Props = {
  matchId: string
  onFinish: (matchId: string) => void
  onAbort: () => void
  multiplayer?: MultiplayerProp
}

export default function GameKiller({ matchId, onFinish, onAbort, multiplayer }: Props) {
  useDisableScale()
  // --- Intermission (Leg-Ende) ---
  const [intermission, setIntermission] = useState<{
    legWinnerId: string
    legIndex: number
    setIndex: number
    setFinished: boolean
    pendingEvents: KillerEvent[]
    needsManualAssignment: boolean
  } | null>(null)

  // Manual Target-Picker State (fuer Intermission bei manual-Modus)
  const [legManualTargets, setLegManualTargets] = useState<Record<string, number>>({})

  const storedMatch = getKillerMatchById(matchId)
  const [events, setEvents] = useState<KillerEvent[]>(storedMatch?.events ?? [])
  const [current, setCurrent] = useState<KillerDart[]>([])
  const [mult, setMult] = useState<1 | 2 | 3>(1)
  const multRef = useRef(mult)

  // Nummern-Buffer fuer zweistellige Eingabe (10-20)
  const numBufferRef = useRef('')
  const numTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Animation-Tracking: welche Spieler gerade einen Leben-Verlust/-Gewinn animieren
  const [heartAnimations, setHeartAnimations] = useState<Record<string, 'break' | 'gain'>>({})
  const [eliminatedFlash, setEliminatedFlash] = useState<Record<string, boolean>>({})

  // Input-Modus: Nummernpad oder Dartscheibe
  const [inputMode, setInputMode] = useState<'pad' | 'board'>('pad')

  // Previous lives fuer Animation-Erkennung
  const prevLivesRef = useRef<Record<string, number>>({})

  // Multiplayer: Remote-Events synchronisieren
  useEffect(() => {
    if (!multiplayer?.remoteEvents) return
    const remote = multiplayer.remoteEvents as KillerEvent[]
    setEvents(remote)
    persistKillerEvents(matchId, remote)
    const lastEvt = remote[remote.length - 1]
    if (lastEvt?.type === 'KillerMatchFinished') {
      const finalState = applyKillerEvents(remote)
      finishKillerMatch(matchId, lastEvt.winnerId, lastEvt.finalStandings, lastEvt.totalDarts, lastEvt.durationMs, finalState.legWinsByPlayer, finalState.setWinsByPlayer)
    }
    // Ensure match exists locally for guest
    if (remote.length > 0) {
      const startEvt = remote.find((e: any) => e.type === 'KillerMatchStarted') as any
      if (startEvt) {
        ensureKillerMatchExists(matchId, remote, startEvt.players?.map((p: any) => p.playerId) ?? [])
      }
    }
  }, [multiplayer?.remoteEvents]) // eslint-disable-line react-hooks/exhaustive-deps

  // State aus Events ableiten
  const state = useMemo(() => applyKillerEvents(events), [events])

  // --- Shared game state (pause, mute, timer, visibility) ---
  const { gamePaused, setGamePaused, muted, setMuted, elapsedMs } = useGameState({
    matchId,
    mode: 'killer',
    finished: state.phase === 'finished',
  })

  const players = state.players
  const config = state.config
  const activePlayerId = getActivePlayerId(state)

  // Spielernamen aus dem MatchStarted Event
  const playerNames = useMemo(() => {
    const names: Record<string, string> = {}
    const startEvt = events.find(e => e.type === 'KillerMatchStarted')
    if (startEvt && startEvt.type === 'KillerMatchStarted') {
      for (const p of startEvt.players) {
        names[p.playerId] = p.name
      }
    }
    return names
  }, [events])

  const activePlayerName = activePlayerId ? playerNames[activePlayerId] ?? '' : ''

  // Leben-Animations-Erkennung
  useEffect(() => {
    const newAnims: Record<string, 'break' | 'gain'> = {}
    const newFlash: Record<string, boolean> = {}

    for (const ps of players) {
      const prevLives = prevLivesRef.current[ps.playerId]
      if (prevLives !== undefined && prevLives !== ps.lives) {
        if (ps.lives < prevLives) {
          newAnims[ps.playerId] = 'break'
          if (ps.isEliminated) {
            newFlash[ps.playerId] = true
          }
        } else if (ps.lives > prevLives) {
          newAnims[ps.playerId] = 'gain'
        }
      }
      prevLivesRef.current[ps.playerId] = ps.lives
    }

    if (Object.keys(newAnims).length > 0) {
      setHeartAnimations(newAnims)
      setTimeout(() => setHeartAnimations({}), 800)
    }
    if (Object.keys(newFlash).length > 0) {
      setEliminatedFlash(newFlash)
      setTimeout(() => setEliminatedFlash({}), 600)
    }
  }, [players])

  // Sync mult with ref
  useEffect(() => {
    multRef.current = mult
  }, [mult])

  // Log auto-scroll
  const logRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight
    }
  }, [state.log.length])

  // Speech: Announce active player
  const prevActiveRef = useRef<string | null>(null)
  useEffect(() => {
    if (!activePlayerId || muted || gamePaused || intermission) return
    if (prevActiveRef.current === activePlayerId) return
    prevActiveRef.current = activePlayerId

    const ps = players.find(p => p.playerId === activePlayerId)
    if (!ps) return
    const name = playerNames[activePlayerId] ?? ''

    debouncedAnnounce(() => {
      if (state.phase === 'qualifying' && !ps.isKiller && ps.targetNumber !== null) {
        const ring = config.qualifyingRing === 'TRIPLE' ? 'Triple' : 'Double'
        announceKillerQualifyingTurn(name, ps.targetNumber, ring)
      } else {
        announceKillerPlayerTurn(name)
      }
    })
  }, [activePlayerId, muted, gamePaused, intermission, state.phase, players, playerNames, config.qualifyingRing])

  if (!storedMatch) {
    return (
      <div style={{ background: '#181c20', minHeight: '100dvh', color: '#e5e7eb', padding: 20 }}>
        <p>Match nicht gefunden.</p>
        <button onClick={onAbort} style={{ color: '#e5e7eb', background: '#333', border: 'none', padding: '8px 16px', borderRadius: 6, cursor: 'pointer' }}>
          Zurueck
        </button>
      </div>
    )
  }

  // Dart hinzufuegen
  const addDart = useCallback((dartTarget: number) => {
    if (gamePaused) return
    if (!activePlayerId) return
    if (current.length >= 3) return

    const currentMult = multRef.current
    const dart: KillerDart = { target: dartTarget, mult: currentMult }

    if (dartTarget === 20 && currentMult === 3) playTriple20Sound()

    setCurrent(prev => {
      if (prev.length >= 3) return prev
      return [...prev, dart]
    })
    setMult(1)
  }, [activePlayerId, current, gamePaused])

  // Miss hinzufuegen
  const addMiss = useCallback(() => {
    if (gamePaused) return
    if (current.length >= 3) return
    const dart: KillerDart = { target: 'MISS', mult: 1 }
    setCurrent(prev => {
      if (prev.length >= 3) return prev
      return [...prev, dart]
    })
    setMult(1)
  }, [gamePaused, current])

  // Refs fuer Timer-Callbacks
  const addDartRef = useRef(addDart)
  const addMissRef = useRef(addMiss)
  useEffect(() => { addDartRef.current = addDart }, [addDart])
  useEffect(() => { addMissRef.current = addMiss }, [addMiss])

  // Nummern-Buffer leeren
  const flushNumBuffer = useCallback(() => {
    const buf = numBufferRef.current
    numBufferRef.current = ''
    if (numTimerRef.current) {
      clearTimeout(numTimerRef.current)
      numTimerRef.current = null
    }
    if (!buf) return
    const num = parseInt(buf, 10)
    if (num === 0) addMissRef.current()
    else if (num >= 1 && num <= 20) addDartRef.current(num)
  }, [])

  // Turn bestaetigen
  const confirmTurn = useCallback(() => {
    if (gamePaused || intermission) return
    if (!activePlayerId || current.length === 0) return

    const darts = [...current]
    while (darts.length < 3) {
      darts.push({ target: 'MISS', mult: 1 })
    }

    const result: KillerTurnResult = recordKillerTurn(state, activePlayerId, darts)
    const turnPlayerName = playerNames[activePlayerId] ?? ''

    // Speech + SFX fuer Turn-Ergebnis
    if (result.turnEvent.becameKiller) {
      announceKillerQualified(turnPlayerName)
    }

    for (const lc of result.turnEvent.livesChanges) {
      if (lc.delta < 0 && lc.playerId !== activePlayerId) {
        const victimName = playerNames[lc.playerId] ?? ''
        announceKillerHit(turnPlayerName, victimName, lc.newLives)
        playKillerHitSound()
      } else if (lc.delta > 0) {
        announceKillerSelfHeal(turnPlayerName)
      }
    }

    for (const elimId of result.turnEvent.eliminations) {
      const elimName = playerNames[elimId] ?? ''
      announceKillerEliminated(elimName)
      playKillerEliminatedSound()
    }

    // Alle neuen Events sammeln
    const newEvents: KillerEvent[] = [...events, result.turnEvent]

    // Elimination Events
    for (const elimEvt of result.eliminationEvents) {
      newEvents.push(elimEvt)
    }

    // LegFinished Event
    if (result.legFinished) {
      newEvents.push(result.legFinished)
    }

    // SetFinished Event
    if (result.setFinished) {
      newEvents.push(result.setFinished)
    }

    // Match beendet?
    if (result.matchFinished) {
      newEvents.push(result.matchFinished)

      // Compute final leg/set wins from state applied to all events
      const finalState = applyKillerEvents(newEvents)

      finishKillerMatch(
        matchId,
        result.matchFinished.winnerId,
        result.matchFinished.finalStandings,
        result.matchFinished.totalDarts,
        result.matchFinished.durationMs,
        finalState.legWinsByPlayer,
        finalState.setWinsByPlayer,
      )

      if (result.matchFinished.winnerId) {
        announceKillerWinner(playerNames[result.matchFinished.winnerId] ?? '')
      }

      persistKillerEvents(matchId, newEvents)
      setEvents(newEvents)
      setCurrent([])
      setMult(1)
      if (multiplayer?.enabled) multiplayer.submitEvents(newEvents.slice(events.length))
      setTimeout(() => onFinish(matchId), 2500)
      return
    }

    // Leg beendet aber Match geht weiter -> Intermission
    if (result.legFinished && result.pendingNextEvents) {
      const legWinnerId = result.legFinished.winnerId
      const legWinnerName = playerNames[legWinnerId] ?? ''

      if (result.setFinished) {
        announceKillerSetWin(legWinnerName)
      } else {
        announceKillerLegWin(legWinnerName)
      }

      // Pruefen ob Best of 1 -> kein Intermission noetig (sollte nicht hier landen)
      const isSingleLeg = state.structure.kind === 'legs' && state.structure.bestOfLegs === 1
      if (isSingleLeg) {
        // Direkt naechstes Leg starten (sollte nicht passieren bei BoL=1, da Match dann vorbei waere)
        const allEvents = [...newEvents, ...result.pendingNextEvents]
        persistKillerEvents(matchId, allEvents)
        setEvents(allEvents)
        setCurrent([])
        setMult(1)
        if (multiplayer?.enabled) multiplayer.submitEvents(allEvents.slice(events.length))
        return
      }

      persistKillerEvents(matchId, newEvents)
      setEvents(newEvents)
      setCurrent([])
      setMult(1)
      if (multiplayer?.enabled) multiplayer.submitEvents(newEvents.slice(events.length))

      setLegManualTargets({})
      setIntermission({
        legWinnerId,
        legIndex: result.legFinished.legIndex,
        setIndex: result.legFinished.setIndex,
        setFinished: !!result.setFinished,
        pendingEvents: result.pendingNextEvents,
        needsManualAssignment: !!result.needsManualAssignment,
      })
      return
    }

    persistKillerEvents(matchId, newEvents)
    setEvents(newEvents)
    setCurrent([])
    setMult(1)
    if (multiplayer?.enabled) multiplayer.submitEvents(newEvents.slice(events.length))
  }, [activePlayerId, current, events, matchId, state, gamePaused, onFinish, intermission, playerNames, multiplayer])

  // Undo
  const undoLastTurn = useCallback(() => {
    // Finde den letzten KillerTurnAdded Event
    let lastTurnIndex = -1
    for (let i = events.length - 1; i >= 0; i--) {
      if (events[i].type === 'KillerTurnAdded') {
        lastTurnIndex = i
        break
      }
    }
    if (lastTurnIndex === -1) return

    // Ausstehende Sprachansagen abbrechen
    cancelDebouncedAnnounce()

    // Entferne alle Events ab dem letzten Turn
    const newEvents = events.slice(0, lastTurnIndex)
    persistKillerEvents(matchId, newEvents)
    setEvents(newEvents)
    setCurrent([])
    setMult(1)
    if (multiplayer?.enabled) multiplayer.undo(events.length - lastTurnIndex)
  }, [events, matchId, multiplayer])

  const canUndo = useMemo(() => {
    return events.some(e => e.type === 'KillerTurnAdded')
  }, [events])

  // Naechstes Leg starten (nach Intermission)
  const continueNextLeg = useCallback(() => {
    if (!intermission) return
    let allEvents = [...events, ...intermission.pendingEvents]

    // Bei manual-Modus: TargetsAssigned-Event aus legManualTargets erstellen
    if (intermission.needsManualAssignment && Object.keys(legManualTargets).length > 0) {
      const assignEvent: KillerEvent = {
        type: 'KillerTargetsAssigned',
        eventId: killerId(),
        matchId,
        ts: killerNow(),
        assignments: state.playerOrder.map(pid => ({
          playerId: pid,
          targetNumber: legManualTargets[pid],
        })),
      }
      allEvents = [...allEvents, assignEvent]
    }

    persistKillerEvents(matchId, allEvents)
    setEvents(allEvents)
    setIntermission(null)
    setLegManualTargets({})
    prevActiveRef.current = null // Reset speech tracking
    if (multiplayer?.enabled) multiplayer.submitEvents(allEvents.slice(events.length))
  }, [intermission, events, matchId, legManualTargets, state.playerOrder, multiplayer])

  // Enter-Taste zum Weitergehen bei Intermission
  useEffect(() => {
    if (!intermission) return
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Enter') return
      // Prüfe ob Button disabled wäre (manuelle Zuweisung nötig aber nicht vollständig)
      if (intermission.needsManualAssignment) {
        const assigned = state.playerOrder.every(pid =>
          legManualTargets[pid] != null && legManualTargets[pid] >= 1 && legManualTargets[pid] <= 20
        )
        if (!assigned) return
        const nums = state.playerOrder.map(pid => legManualTargets[pid])
        if (new Set(nums).size !== nums.length) return
      }
      continueNextLeg()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [intermission, continueNextLeg, state.playerOrder, legManualTargets])

  // Auto-Confirm bei 3 Darts
  useEffect(() => {
    if (current.length === 3) {
      confirmTurn()
    }
  }, [current.length, confirmTurn])

  // Keyboard Handler
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase()
      if (tag === 'input' || tag === 'textarea') return

      // P = Pause
      if (e.key === 'p' || e.key === 'P') {
        setGamePaused(p => !p)
        return
      }

      if (gamePaused) return

      const k = e.key.toLowerCase()

      // S/D/T fuer Multiplier
      if (k === 's') { setMult(1); e.preventDefault(); return }
      if (k === 'd') { setMult(2); e.preventDefault(); return }
      if (k === 't') { setMult(3); e.preventDefault(); return }

      // Zahlentasten 0-9
      if (k >= '0' && k <= '9') {
        e.preventDefault()
        const digit = parseInt(k, 10)

        if (numTimerRef.current) {
          clearTimeout(numTimerRef.current)
          numTimerRef.current = null
        }

        if (numBufferRef.current !== '') {
          const firstDigit = parseInt(numBufferRef.current)
          numBufferRef.current = ''
          const combined = firstDigit * 10 + digit

          if (combined >= 10 && combined <= 20) {
            addDart(combined)
          } else {
            addDart(firstDigit)
            if (digit === 0) {
              addMiss()
            } else if (digit >= 3) {
              addDart(digit)
            } else {
              numBufferRef.current = String(digit)
              numTimerRef.current = setTimeout(flushNumBuffer, 500)
            }
          }
        } else {
          if (digit === 0) {
            addMiss()
          } else if (digit >= 3) {
            addDart(digit)
          } else {
            numBufferRef.current = String(digit)
            numTimerRef.current = setTimeout(flushNumBuffer, 500)
          }
        }
        return
      }

      // Backspace
      if (e.key === 'Backspace') {
        e.preventDefault()
        if (current.length > 0) {
          setCurrent(prev => prev.slice(0, -1))
        } else {
          undoLastTurn()
        }
        return
      }

      // Enter
      if (e.key === 'Enter') {
        confirmTurn()
        e.preventDefault()
        return
      }

      // Escape
      if (e.key === 'Escape') {
        onAbort()
        e.preventDefault()
        return
      }
    }

    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      if (numTimerRef.current) {
        clearTimeout(numTimerRef.current)
        numTimerRef.current = null
      }
    }
  }, [addDart, addMiss, confirmTurn, undoLastTurn, onAbort, gamePaused, current.length, flushNumBuffer])

  // Spielerfarben aus Profilen
  const profiles = useMemo(() => getProfiles(), [])
  const playerColors = useMemo(() => {
    const colorMap: Record<string, string> = {}
    for (const ps of players) {
      const profile = profiles.find(pr => pr.id === ps.playerId)
      const idx = state.playerOrder.indexOf(ps.playerId)
      colorMap[ps.playerId] = profile?.color ?? PLAYER_COLORS[idx >= 0 ? idx % PLAYER_COLORS.length : 0]
    }
    return colorMap
  }, [players, profiles, state.playerOrder])

  // Aktiver Spieler-Info
  const activePs = players.find(p => p.playerId === activePlayerId)
  const activeColor = activePlayerId ? playerColors[activePlayerId] : undefined

  // Qualifying status text
  const getStatusText = (ps: typeof players[0]) => {
    if (ps.isEliminated) return 'ELIMINIERT'
    if (ps.isKiller) return 'KILLER'
    return `Qualifying (${ps.qualifyingHits}/${config.hitsToBecomeKiller})`
  }

  // Hearts rendering
  const renderHearts = (ps: typeof players[0]) => {
    const total = config.startingLives
    const alive = Math.max(0, ps.lives)
    const dead = total - alive
    const anim = heartAnimations[ps.playerId]

    return (
      <span style={{ fontSize: 18, letterSpacing: 2 }}>
        {Array.from({ length: alive }).map((_, i) => (
          <span
            key={`alive-${i}`}
            style={{
              display: 'inline-block',
              animation: anim === 'gain' ? 'heartGain 0.6s ease-out' : undefined,
            }}
          >
            {'\u2764\uFE0F'}
          </span>
        ))}
        {Array.from({ length: dead }).map((_, i) => (
          <span
            key={`dead-${i}`}
            style={{
              display: 'inline-block',
              animation: anim === 'break' && i === dead - 1 ? 'heartBreak 0.6s ease-out' : undefined,
            }}
          >
            {'\uD83D\uDDA4'}
          </span>
        ))}
      </span>
    )
  }

  return (
    <div
      style={{
        background: '#181c20',
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        color: '#e5e7eb',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      {/* CSS Animations */}
      <style>{`
        @keyframes heartBreak {
          0% { transform: scale(1); filter: brightness(1); }
          30% { transform: scale(1.3); filter: brightness(1.5) hue-rotate(-20deg); }
          100% { transform: scale(0.8); filter: brightness(0.6); }
        }
        @keyframes heartGain {
          0% { transform: scale(1); filter: brightness(1); }
          40% { transform: scale(1.3); filter: brightness(1.5) hue-rotate(80deg); }
          100% { transform: scale(1); filter: brightness(1); }
        }
        @keyframes killerGlow {
          0% { text-shadow: 0 0 5px #e74c3c, 0 0 10px #e74c3c; }
          50% { text-shadow: 0 0 15px #e74c3c, 0 0 30px #ff4444, 0 0 45px #ff0000; }
          100% { text-shadow: 0 0 5px #e74c3c, 0 0 10px #e74c3c; }
        }
        @keyframes eliminatedFlash {
          0% { background: rgba(231, 76, 60, 0.4); }
          100% { background: transparent; }
        }
      `}</style>

      {/* Pause Overlay */}
      {gamePaused && <PauseOverlay onResume={() => setGamePaused(false)} />}

      {/* Header */}
      <GameControls
        isPaused={gamePaused}
        onTogglePause={() => setGamePaused(p => !p)}
        isMuted={muted}
        onToggleMute={() => setMuted(m => !m)}
        onExit={() => {
          setMatchPaused(matchId, 'killer', true)
          setMatchElapsedTime(matchId, 'killer', elapsedMs)
          onAbort()
        }}
        onCancel={() => {
          deleteKillerMatch(matchId)
          onAbort()
        }}
        title="Killer"
      />

      {/* Info-Leiste */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          gap: 12,
          padding: '6px 20px',
          borderBottom: '1px solid #222',
          background: '#23272b',
          fontSize: 12,
          flexWrap: 'wrap',
        }}
      >
        {/* Runde */}
        <span style={{
          background: '#1e293b',
          padding: '3px 8px',
          borderRadius: 4,
          color: '#e74c3c',
          fontWeight: 600,
        }}>
          Runde {state.roundNumber}
        </span>

        {/* Phase */}
        <span style={{
          background: '#1e293b',
          padding: '3px 8px',
          borderRadius: 4,
          color: state.phase === 'killing' ? '#e74c3c' : state.phase === 'qualifying' ? '#3498db' : '#2ecc71',
          fontWeight: 600,
        }}>
          {state.phase === 'qualifying' ? 'Qualifying' : state.phase === 'killing' ? 'Killing' : 'Beendet'}
        </span>

        {/* Qualifying Ring */}
        <span style={{
          background: '#1e293b',
          padding: '3px 8px',
          borderRadius: 4,
          color: '#6b7280',
        }}>
          {config.qualifyingRing === 'TRIPLE' ? 'Triple-Ring' : 'Double-Ring'}
        </span>

        {/* Leben */}
        <span style={{
          background: '#1e293b',
          padding: '3px 8px',
          borderRadius: 4,
          color: '#6b7280',
        }}>
          {config.startingLives} Leben
        </span>

        {/* Legs/Sets Score */}
        {state.structure.kind === 'legs' && state.structure.bestOfLegs > 1 && (
          <span style={{
            background: '#1e293b',
            padding: '3px 8px',
            borderRadius: 4,
            color: '#eab308',
            fontWeight: 600,
          }}>
            Leg {state.currentLegIndex + 1} | {Object.entries(state.legWinsByPlayer).filter(([,w]) => w > 0).map(([pid, w]) => `${playerNames[pid] ?? '?'}: ${w}`).join(' – ')}
          </span>
        )}
        {state.structure.kind === 'sets' && (
          <span style={{
            background: '#1e293b',
            padding: '3px 8px',
            borderRadius: 4,
            color: '#eab308',
            fontWeight: 600,
          }}>
            Set {state.currentSetIndex + 1} Leg {state.currentLegIndex + 1} | {Object.entries(state.setWinsByPlayer).filter(([,w]) => w > 0).map(([pid, w]) => `${playerNames[pid] ?? '?'}: ${w}S`).join(' ')}
          </span>
        )}

        {/* Aktiver Spieler */}
        {activePlayerId && (
          <>
            <span style={{ color: '#6b7280' }}>|</span>
            <span style={{
              color: activeColor ?? '#e5e7eb',
              fontWeight: 700,
            }}>
              {activePlayerName} wirft
            </span>
          </>
        )}

        {/* Timer */}
        <div
          style={{
            fontFamily: 'monospace',
            fontSize: 16,
            fontWeight: 700,
            color: '#e74c3c',
            textShadow: '0 0 10px rgba(231, 76, 60, 0.4)',
            marginLeft: 'auto',
          }}
        >
          {formatDuration(elapsedMs)}
        </div>
      </div>

      {/* Main Content */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          gap: 20,
          padding: 20,
          overflow: 'hidden',
        }}
      >
        {/* Linke Seite: Spieler-Tabelle */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          {/* Spieler-Tabelle */}
          <div
            style={{
              background: '#23272b',
              borderRadius: 12,
              border: '1px solid #333',
              flex: 1,
              overflow: 'auto',
            }}
          >
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #333' }}>
                  <th style={{ textAlign: 'left', padding: '10px 14px', color: '#6b7280', fontWeight: 600, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>Spieler</th>
                  <th style={{ textAlign: 'center', padding: '10px 14px', color: '#6b7280', fontWeight: 600, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>Zahl</th>
                  <th style={{ textAlign: 'center', padding: '10px 14px', color: '#6b7280', fontWeight: 600, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>Status</th>
                  <th style={{ textAlign: 'center', padding: '10px 14px', color: '#6b7280', fontWeight: 600, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>Leben</th>
                </tr>
              </thead>
              <tbody>
                {players.map((ps) => {
                  const isActive = ps.playerId === activePlayerId
                  const color = playerColors[ps.playerId] ?? '#e5e7eb'
                  const name = playerNames[ps.playerId] ?? ps.playerId
                  const isFlashing = eliminatedFlash[ps.playerId]

                  return (
                    <tr
                      key={ps.playerId}
                      style={{
                        borderBottom: '1px solid #2a2a2a',
                        background: isFlashing
                          ? undefined
                          : isActive
                            ? `${color}18`
                            : ps.isEliminated
                              ? '#1a1a1a'
                              : 'transparent',
                        animation: isFlashing ? 'eliminatedFlash 0.6s ease-out' : undefined,
                        transition: 'background 0.3s',
                        opacity: ps.isEliminated ? 0.45 : 1,
                      }}
                    >
                      {/* Spieler */}
                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div
                            style={{
                              width: 10,
                              height: 10,
                              borderRadius: '50%',
                              background: color,
                              boxShadow: isActive ? `0 0 10px ${color}` : 'none',
                              flexShrink: 0,
                            }}
                          />
                          <span
                            style={{
                              fontWeight: isActive ? 700 : 500,
                              color: ps.isEliminated ? '#555' : isActive ? color : '#e5e7eb',
                              textDecoration: ps.isEliminated ? 'line-through' : 'none',
                            }}
                          >
                            {name}
                          </span>
                          {isActive && (
                            <span style={{
                              fontSize: 10,
                              color: color,
                              background: `${color}20`,
                              padding: '1px 6px',
                              borderRadius: 4,
                              fontWeight: 600,
                            }}>
                              AM WURF
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Zahl */}
                      <td style={{ textAlign: 'center', padding: '12px 14px' }}>
                        <span
                          style={{
                            fontSize: 20,
                            fontWeight: 800,
                            color: ps.isEliminated ? '#555' : '#eab308',
                            fontFamily: 'monospace',
                          }}
                        >
                          {ps.targetNumber !== null
                            ? (config.secretNumbers && ps.playerId !== activePlayerId && !ps.isEliminated
                              ? '???'
                              : ps.targetNumber)
                            : '—'}
                        </span>
                      </td>

                      {/* Status */}
                      <td style={{ textAlign: 'center', padding: '12px 14px' }}>
                        {ps.isEliminated ? (
                          <span style={{ color: '#555', fontWeight: 600, fontSize: 12 }}>ELIMINIERT</span>
                        ) : ps.isKiller ? (
                          <span
                            style={{
                              color: '#e74c3c',
                              fontWeight: 800,
                              fontSize: 14,
                              animation: 'killerGlow 1.5s ease-in-out infinite',
                              letterSpacing: 1,
                            }}
                          >
                            KILLER
                          </span>
                        ) : (
                          <span style={{ color: '#3498db', fontWeight: 600, fontSize: 12 }}>
                            Qualifying ({ps.qualifyingHits}/{config.hitsToBecomeKiller})
                          </span>
                        )}
                      </td>

                      {/* Leben */}
                      <td style={{ textAlign: 'center', padding: '12px 14px' }}>
                        {renderHearts(ps)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Mitte: Dart-Eingabe (Tabbed: Pad / Board) */}
        <div style={{ width: 300, flexShrink: 0 }}>
          <div
            style={{
              background: '#23272b',
              borderRadius: 12,
              padding: '14px 18px',
              border: '1px solid #333',
            }}
          >
            {/* Tab-Auswahl */}
            <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
              {(['pad', 'board'] as const).map(mode => (
                <button
                  key={mode}
                  onClick={() => setInputMode(mode)}
                  style={{
                    flex: 1,
                    padding: '6px 0',
                    borderRadius: 6,
                    border: inputMode === mode ? '1px solid #e74c3c' : '1px solid #333',
                    background: inputMode === mode ? '#2a1a1a' : '#1a1a1a',
                    color: inputMode === mode ? '#e74c3c' : '#6b7280',
                    fontWeight: inputMode === mode ? 700 : 500,
                    fontSize: 12,
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                    boxShadow: inputMode === mode ? '0 0 8px rgba(231, 76, 60, 0.2)' : 'none',
                  }}
                >
                  {mode === 'pad' ? 'Pad' : 'Board'}
                </button>
              ))}
            </div>

            {/* Pad-Modus: Multiplier + Nummernpad */}
            {inputMode === 'pad' && (
              <>
                {/* Multiplier */}
                <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 10, textAlign: 'center', textTransform: 'uppercase', letterSpacing: 0.5 }}>MULTIPLIER</div>
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                  {([1, 2, 3] as const).map(m => (
                    <div
                      key={m}
                      onClick={() => setMult(m)}
                      style={{
                        width: 70,
                        height: 40,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: 8,
                        fontWeight: 700,
                        fontSize: 14,
                        cursor: 'pointer',
                        background: mult === m ? (m === 1 ? '#1e3a5f' : m === 2 ? '#14532d' : '#7f1d1d') : '#1a1a1a',
                        color: mult === m ? (m === 1 ? '#0ea5e9' : m === 2 ? '#22c55e' : '#ef4444') : '#6b7280',
                        border: mult === m ? `2px solid ${m === 1 ? '#0ea5e9' : m === 2 ? '#22c55e' : '#ef4444'}` : '1px solid #333',
                        boxShadow: mult === m ? `0 0 12px ${m === 1 ? '#0ea5e9' : m === 2 ? '#22c55e' : '#ef4444'}50` : 'none',
                        transition: 'all 0.15s',
                      }}
                    >
                      {m === 1 ? 'Single' : m === 2 ? 'Double' : 'Triple'}
                    </div>
                  ))}
                </div>

                {/* Nummernpad */}
                <div>
                  {NUMBER_PAD.map((row, rowIdx) => (
                    <div key={rowIdx} style={{ display: 'flex', gap: 3, justifyContent: 'center', marginBottom: 3 }}>
                      {row.map(num => {
                        const isPlayerTarget = activePs?.targetNumber === num
                        return (
                          <button
                            key={num}
                            onClick={() => addDart(num)}
                            disabled={current.length >= 3 || state.phase === 'finished'}
                            style={{
                              width: 46,
                              height: 34,
                              borderRadius: 6,
                              border: isPlayerTarget ? '2px solid #e74c3c' : '1px solid #333',
                              background: isPlayerTarget ? '#2a1a1a' : '#1a1a1a',
                              color: isPlayerTarget ? '#e74c3c' : '#e5e7eb',
                              fontWeight: isPlayerTarget ? 800 : 600,
                              fontSize: 13,
                              cursor: current.length >= 3 || state.phase === 'finished' ? 'not-allowed' : 'pointer',
                              opacity: current.length >= 3 || state.phase === 'finished' ? 0.5 : 1,
                              boxShadow: isPlayerTarget ? '0 0 8px rgba(231, 76, 60, 0.4)' : 'none',
                              transition: 'all 0.15s',
                            }}
                          >
                            {num}
                          </button>
                        )
                      })}
                    </div>
                  ))}
                  {/* Miss Zeile */}
                  <div style={{ display: 'flex', gap: 3, justifyContent: 'center', marginTop: 4 }}>
                    <button
                      onClick={addMiss}
                      disabled={current.length >= 3 || state.phase === 'finished'}
                      style={{
                        width: 200,
                        height: 34,
                        borderRadius: 6,
                        border: '1px solid #333',
                        background: '#1a1a1a',
                        color: '#e74c3c',
                        fontWeight: 700,
                        fontSize: 13,
                        cursor: current.length >= 3 || state.phase === 'finished' ? 'not-allowed' : 'pointer',
                        opacity: current.length >= 3 || state.phase === 'finished' ? 0.5 : 1,
                        transition: 'all 0.15s',
                      }}
                    >
                      Miss
                    </button>
                  </div>
                </div>
              </>
            )}

            {/* Board-Modus: Interaktive Dartscheibe */}
            {inputMode === 'board' && (
              <KillerDartboard
                onThrow={(target, boardMult) => {
                  if (target === 'MISS') {
                    addMiss()
                  } else {
                    multRef.current = boardMult
                    setMult(boardMult)
                    addDart(target)
                  }
                }}
                disabled={current.length >= 3 || state.phase === 'finished'}
                ownTarget={activePs?.targetNumber ?? null}
                enemyTargets={players
                  .filter(p => p.playerId !== activePlayerId && !p.isEliminated && p.targetNumber != null)
                  .map(p => p.targetNumber!)}
                secretNumbers={config.secretNumbers}
              />
            )}

            {/* Aktuelle Wuerfe (gemeinsam fuer beide Modi) */}
            <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginTop: 12 }}>
              {[0, 1, 2].map(i => {
                const dart = current[i]
                return (
                  <div
                    key={i}
                    style={{
                      width: 68,
                      height: 34,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: dart ? '#1c1c1c' : '#0a0a0a',
                      border: dart ? '2px solid #e74c3c' : '1px solid #333',
                      borderRadius: 6,
                      fontWeight: 700,
                      fontSize: 13,
                      color: dart ? '#e74c3c' : '#6b7280',
                    }}
                  >
                    {dart ? formatDart(dart) : '\u2014'}
                  </div>
                )
              })}
            </div>

            {/* Bestaetigen + Dart entfernen */}
            <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginTop: 10 }}>
              <button
                onClick={() => {
                  if (current.length > 0) {
                    setCurrent(prev => prev.slice(0, -1))
                  } else {
                    undoLastTurn()
                  }
                }}
                disabled={current.length === 0 && !canUndo}
                style={{
                  flex: 1,
                  padding: '8px 10px',
                  borderRadius: 6,
                  border: '1px solid #333',
                  background: '#1a1a1a',
                  color: (current.length > 0 || canUndo) ? '#e5e7eb' : '#6b7280',
                  fontWeight: 600,
                  fontSize: 12,
                  cursor: (current.length > 0 || canUndo) ? 'pointer' : 'not-allowed',
                  opacity: (current.length > 0 || canUndo) ? 1 : 0.4,
                }}
              >
                {current.length > 0 ? 'Dart entfernen' : 'Undo'}
              </button>
              <button
                onClick={confirmTurn}
                disabled={current.length === 0}
                style={{
                  flex: 1,
                  padding: '8px 10px',
                  borderRadius: 6,
                  border: 'none',
                  background: current.length > 0
                    ? 'linear-gradient(180deg, #e74c3c, #c0392b)'
                    : '#1a1a1a',
                  color: current.length > 0 ? '#fff' : '#6b7280',
                  fontWeight: 700,
                  fontSize: 12,
                  cursor: current.length > 0 ? 'pointer' : 'not-allowed',
                  boxShadow: current.length > 0 ? '0 2px 10px rgba(231, 76, 60, 0.3)' : 'none',
                }}
              >
                Bestaetigen
              </button>
            </div>

            {/* Shortcut-Hilfe */}
            <div style={{ fontSize: 10, color: '#6b7280', marginTop: 10, textAlign: 'center', lineHeight: 1.5 }}>
              [S/D/T] Multiplier  [1-20] Feld  [0] Miss<br />
              [Enter] OK  [Backspace] Entfernen/Undo
            </div>
          </div>
        </div>

        {/* Rechte Seite: Game Log */}
        <div style={{ width: 280, flexShrink: 0, display: 'flex', flexDirection: 'column' }}>
          <div
            style={{
              background: '#23272b',
              borderRadius: 12,
              border: '1px solid #333',
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            <div style={{
              fontSize: 11,
              color: '#6b7280',
              padding: '10px 14px 6px',
              textTransform: 'uppercase',
              letterSpacing: 0.5,
              fontWeight: 600,
              borderBottom: '1px solid #2a2a2a',
            }}>
              Game Log
            </div>
            <div
              ref={logRef}
              style={{
                flex: 1,
                overflow: 'auto',
                padding: '8px 14px',
              }}
            >
              {state.log.length === 0 ? (
                <div style={{ color: '#555', fontSize: 12, textAlign: 'center', marginTop: 20 }}>
                  Noch keine Eintraege...
                </div>
              ) : (
                state.log.map((entry, idx) => (
                  <div
                    key={idx}
                    style={{
                      fontSize: 12,
                      color: LOG_COLORS[entry.type] ?? '#95a5a6',
                      padding: '4px 0',
                      borderBottom: '1px solid #1a1a1a',
                      lineHeight: 1.4,
                    }}
                  >
                    <span style={{ color: '#555', fontSize: 10, marginRight: 6 }}>
                      {new Date(entry.ts).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                    {entry.text}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Intermission Overlay (Leg-Ende) */}
      {intermission && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.85)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
          }}
        >
          <div style={{ textAlign: 'center', maxWidth: 400 }}>
            <div style={{ fontSize: 18, color: '#6b7280', marginBottom: 8 }}>
              {intermission.setFinished ? 'SET GEWONNEN' : 'LEG GEWONNEN'}
            </div>
            <div style={{
              fontSize: 48,
              fontWeight: 900,
              color: '#eab308',
              textShadow: '0 0 20px #eab308',
              marginBottom: 16,
            }}>
              {playerNames[intermission.legWinnerId] ?? 'Gewinner'}
            </div>

            {/* Leg/Set Stand */}
            <div style={{
              background: '#23272b',
              borderRadius: 10,
              padding: '14px 20px',
              marginBottom: 20,
              border: '1px solid #333',
            }}>
              {state.structure.kind === 'legs' && (
                <div style={{ fontSize: 14, color: '#e5e7eb' }}>
                  <div style={{ fontWeight: 600, marginBottom: 6, color: '#eab308' }}>Legs Stand</div>
                  {state.playerOrder.map(pid => (
                    <div key={pid} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                      <span style={{ color: playerColors[pid] ?? '#e5e7eb' }}>{playerNames[pid] ?? pid}</span>
                      <span style={{ fontWeight: 700 }}>{state.legWinsByPlayer[pid] ?? 0}</span>
                    </div>
                  ))}
                </div>
              )}
              {state.structure.kind === 'sets' && (
                <div style={{ fontSize: 14, color: '#e5e7eb' }}>
                  <div style={{ fontWeight: 600, marginBottom: 6, color: '#eab308' }}>Sets Stand</div>
                  {state.playerOrder.map(pid => (
                    <div key={pid} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                      <span style={{ color: playerColors[pid] ?? '#e5e7eb' }}>{playerNames[pid] ?? pid}</span>
                      <span style={{ fontWeight: 700 }}>{state.setWinsByPlayer[pid] ?? 0}S / {state.legWinsByPlayer[pid] ?? 0}L</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Leg-Stats Vergleichstabelle */}
            {(() => {
              // Temporaeres KillerStoredMatch fuer computeKillerMatchStats
              const tmpMatch: KillerStoredMatch = {
                id: matchId ?? '',
                title: 'Killer',
                players: state.playerOrder.map(pid => ({
                  playerId: pid,
                  name: playerNames[pid] ?? pid,
                })),
                config: state.config,
                events,
                winnerId: state.winnerId ?? undefined,
                createdAt: new Date().toISOString(),
              }

              const pIds = state.playerOrder
              const colorMap: Record<string, string> = {}
              pIds.forEach(pid => { colorMap[pid] = playerColors[pid] ?? '#e5e7eb' })

              const statsArr = pIds.map(pid => ({
                pid,
                stats: computeKillerMatchStats(tmpMatch, pid),
              })).filter(x => x.stats != null) as { pid: string; stats: NonNullable<ReturnType<typeof computeKillerMatchStats>> }[]

              if (statsArr.length < 2) return null

              const sPids = statsArr.map(x => x.pid)
              const killsWin = getStatWinnerColors(statsArr.map(x => x.stats.totalKills), sPids, 'high', colorMap)
              const hitsDealtWin = getStatWinnerColors(statsArr.map(x => x.stats.hitsDealt), sPids, 'high', colorMap)
              const survivedWin = getStatWinnerColors(statsArr.map(x => x.stats.survivedRounds), sPids, 'high', colorMap)
              const hitRateWin = getStatWinnerColors(statsArr.map(x => x.stats.hitRate), sPids, 'high', colorMap)
              const livesLostWin = getStatWinnerColors(statsArr.map(x => x.stats.livesLost), sPids, 'low', colorMap)

              const thS: React.CSSProperties = { textAlign: 'right', padding: '5px 6px', borderBottom: '1px solid #333', color: '#9ca3af', fontWeight: 600, fontSize: 11 }
              const tdS: React.CSSProperties = { textAlign: 'right', padding: '5px 6px', borderBottom: '1px solid #333', fontSize: 12 }
              const tdL: React.CSSProperties = { ...tdS, textAlign: 'left', color: '#9ca3af', fontWeight: 500 }

              return (
                <div style={{
                  background: '#23272b',
                  borderRadius: 10,
                  padding: '10px 14px',
                  marginBottom: 20,
                  border: '1px solid #333',
                }}>
                  <div style={{ fontWeight: 600, marginBottom: 8, color: '#eab308', textAlign: 'center', fontSize: 13 }}>
                    Leg-Statistiken
                  </div>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr>
                          <th style={{ ...thS, textAlign: 'left' }}>Stat</th>
                          {statsArr.map(x => (
                            <th key={x.pid} style={{ ...thS, color: colorMap[x.pid] }}>
                              {playerNames[x.pid] ?? x.pid}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td style={tdL}>Total Kills</td>
                          {statsArr.map((x, i) => (
                            <td key={x.pid} style={killsWin[i] ? { ...tdS, fontWeight: 700, color: killsWin[i] } : { ...tdS, fontWeight: 600, color: '#e5e7eb' }}>
                              {x.stats.totalKills}
                            </td>
                          ))}
                        </tr>
                        <tr>
                          <td style={tdL}>Treffer</td>
                          {statsArr.map((x, i) => (
                            <td key={x.pid} style={hitsDealtWin[i] ? { ...tdS, fontWeight: 700, color: hitsDealtWin[i] } : { ...tdS, fontWeight: 600, color: '#e5e7eb' }}>
                              {x.stats.hitsDealt}
                            </td>
                          ))}
                        </tr>
                        <tr>
                          <td style={tdL}>Runden ueberlebt</td>
                          {statsArr.map((x, i) => (
                            <td key={x.pid} style={survivedWin[i] ? { ...tdS, fontWeight: 700, color: survivedWin[i] } : { ...tdS, fontWeight: 600, color: '#e5e7eb' }}>
                              {x.stats.survivedRounds}
                            </td>
                          ))}
                        </tr>
                        <tr>
                          <td style={tdL}>Trefferquote</td>
                          {statsArr.map((x, i) => (
                            <td key={x.pid} style={hitRateWin[i] ? { ...tdS, fontWeight: 700, color: hitRateWin[i] } : { ...tdS, fontWeight: 600, color: '#e5e7eb' }}>
                              {x.stats.hitRate.toFixed(1)}%
                            </td>
                          ))}
                        </tr>
                        <tr>
                          <td style={tdL}>Leben verloren</td>
                          {statsArr.map((x, i) => (
                            <td key={x.pid} style={livesLostWin[i] ? { ...tdS, fontWeight: 700, color: livesLostWin[i] } : { ...tdS, fontWeight: 600, color: '#e5e7eb' }}>
                              {x.stats.livesLost}
                            </td>
                          ))}
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              )
            })()}

            {/* Manual Target Picker */}
            {intermission.needsManualAssignment && (
              <div style={{
                background: '#23272b',
                borderRadius: 10,
                padding: '14px 20px',
                marginBottom: 20,
                border: '1px solid #333',
                textAlign: 'left',
              }}>
                <div style={{ fontWeight: 600, marginBottom: 10, color: '#eab308', textAlign: 'center', fontSize: 14 }}>
                  Zielzahlen neu waehlen
                </div>
                <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 10, textAlign: 'center' }}>
                  Jeder Spieler bekommt eine einzigartige Zahl (1-20)
                </div>
                {state.playerOrder.map(pid => {
                  const currentVal = legManualTargets[pid]
                  const usedByOthers = Object.entries(legManualTargets)
                    .filter(([p]) => p !== pid)
                    .map(([, n]) => n)
                  return (
                    <div
                      key={pid}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        marginBottom: 8,
                        padding: '6px 8px',
                        background: '#1a1a1a',
                        borderRadius: 8,
                      }}
                    >
                      <span style={{
                        flex: '0 0 80px',
                        fontWeight: 600,
                        fontSize: 12,
                        color: playerColors[pid] ?? '#e5e7eb',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}>
                        {playerNames[pid] ?? pid}
                      </span>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2, flex: 1 }}>
                        {Array.from({ length: 20 }, (_, i) => i + 1).map(num => {
                          const isSelected = currentVal === num
                          const isUsed = usedByOthers.includes(num)
                          return (
                            <button
                              key={num}
                              onClick={() => {
                                setLegManualTargets(prev => ({
                                  ...prev,
                                  [pid]: isSelected ? undefined! : num,
                                }))
                              }}
                              disabled={isUsed && !isSelected}
                              style={{
                                minWidth: 28,
                                padding: '2px 4px',
                                fontSize: 10,
                                fontWeight: isSelected ? 700 : 500,
                                borderRadius: 4,
                                border: isSelected ? '2px solid #eab308' : '1px solid #333',
                                background: isSelected ? '#3a2a00' : (isUsed ? '#111' : '#1a1a1a'),
                                color: isSelected ? '#eab308' : (isUsed ? '#444' : '#e5e7eb'),
                                cursor: (isUsed && !isSelected) ? 'not-allowed' : 'pointer',
                                opacity: (isUsed && !isSelected) ? 0.4 : 1,
                              }}
                            >
                              {num}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            <button
              onClick={continueNextLeg}
              disabled={intermission.needsManualAssignment && (() => {
                const assigned = state.playerOrder.every(pid =>
                  legManualTargets[pid] != null && legManualTargets[pid] >= 1 && legManualTargets[pid] <= 20
                )
                if (!assigned) return true
                const nums = state.playerOrder.map(pid => legManualTargets[pid])
                return new Set(nums).size !== nums.length
              })()}
              style={{
                padding: '12px 40px',
                borderRadius: 8,
                border: 'none',
                background: 'linear-gradient(180deg, #eab308, #ca8a04)',
                color: '#000',
                fontWeight: 800,
                fontSize: 16,
                cursor: 'pointer',
                boxShadow: '0 4px 15px rgba(234, 179, 8, 0.4)',
                opacity: intermission.needsManualAssignment && (() => {
                  const assigned = state.playerOrder.every(pid =>
                    legManualTargets[pid] != null && legManualTargets[pid] >= 1 && legManualTargets[pid] <= 20
                  )
                  if (!assigned) return true
                  const nums = state.playerOrder.map(pid => legManualTargets[pid])
                  return new Set(nums).size !== nums.length
                })() ? 0.4 : 1,
              }}
            >
              Weiter
            </button>
          </div>
        </div>
      )}

      {/* Match-Ende Overlay */}
      {state.phase === 'finished' && state.winnerId && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
          }}
        >
          <div
            style={{
              textAlign: 'center',
              animation: 'shanghaiFlashIn 0.5s ease-out',
            }}
          >
            <div style={{
              fontSize: 24,
              color: '#6b7280',
              marginBottom: 8,
            }}>
              KILLER
            </div>
            <div style={{
              fontSize: 56,
              fontWeight: 900,
              color: '#e74c3c',
              textShadow: '0 0 30px #e74c3c, 0 0 60px #ff4444',
              marginBottom: 16,
            }}>
              {playerNames[state.winnerId] ?? 'Gewinner'}
            </div>
            <div style={{
              fontSize: 20,
              color: '#2ecc71',
              fontWeight: 700,
            }}>
              gewinnt!
            </div>
          </div>
        </div>
      )}

      {/* Flash-In Animation */}
      <style>{`
        @keyframes shanghaiFlashIn {
          from { opacity: 0; transform: scale(0.5); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  )
}
