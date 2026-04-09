// src/screens/GameStraeusschen.tsx
// Spielscreen für Sträußchen – 3× Triple/Double auf 17/18/19/20 (+ Bull)
// Tastatur: Space=Treffer, 0=Miss, Backspace=Undo, P=Pause, Escape=Exit

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { isMatchFinishedInDB } from '../db/storage'
import { useGameState, useGameColors } from '../hooks/useGameState'
import {
  getStrMatchById,
  persistStrEvents,
  finishStrMatch,
  setMatchPaused,
  setMatchElapsedTime,
  deleteStrMatch,
  getProfiles,
  ensureStrMatchExists,
} from '../storage'
import {
  applyStrEvents,
  recordStrTurn,
  getActivePlayerId,
  getActivePlayer,
  getAvailableDarts,
  getRemainingNumbers,
  formatDuration,
  computeStrFieldScore,
  getAllNumbers,
  getTargetLabel,
  type StrEvent,
  type StrDart,
  type StrTurnAddedEvent,
} from '../dartsStraeusschen'
import type { StrTargetNumber, StrRingMode } from '../types/straeusschen'
import StraeusschenDartboard from '../components/StraeusschenDartboard'
import GameControls, { PauseOverlay } from '../components/GameControls'
import { computeStrLegStats, type StrPlayerLegStat } from '../stats/computeStraeusschenStats'
import {
  announceGameStart,
  announceStrPlayerDone,
  announceStrPlayerTurn,
  announceStrLegWinner,
  announceStrMatchWinner,
  playTriple20Sound,
  cancelDebouncedAnnounce,
  debouncedAnnounce,
} from '../speech'
import { PLAYER_COLORS } from '../playerColors'
import { useDisableScale } from '../components/ScaleWrapper'

// Leg-Zusammenfassung Typ
type StrIntermission = {
  kind: 'leg'
  legIndex: number
  legId: string
  legDurationMs: number
  winnerId: string
  winnerName: string
  winnerDarts: number
  pendingNextEvents: StrEvent[]
}

// Spieler-fertig-Zusammenfassung (ein Spieler hat alle Treffer, Leg noch offen)
type StrPlayerDoneInfo = {
  playerId: string
  playerName: string
  playerColor: string
  totalDarts: number
  totalTurns: number
  legScore: number
  legId: string
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

export default function GameStraeusschen({ matchId, onExit, onShowSummary, multiplayer }: Props) {
  useDisableScale()
  const { c, isArcade, colors } = useGameColors()

  // Events + State
  const [storedMatch, setStoredMatch] = useState(() => getStrMatchById(matchId))
  const [events, setEvents] = useState<StrEvent[]>(storedMatch?.events ?? [])

  // Retry loading match if not found yet (multiplayer: match created by host, may not be in cache yet)
  useEffect(() => {
    if (storedMatch) return
    const timer = setInterval(() => {
      const found = getStrMatchById(matchId)
      if (found) { setStoredMatch(found); setEvents(found.events as StrEvent[]); clearInterval(timer) }
    }, 500)
    return () => clearInterval(timer)
  }, [matchId, storedMatch])
  const [current, setCurrent] = useState<StrDart[]>([])
  const [saving, setSaving] = useState(false)

  // Multiplayer: Remote-Events synchronisieren
  const prevRemoteStrRef = useRef<any[] | null>(null)
  useEffect(() => {
    if (!multiplayer?.remoteEvents) return
    if (multiplayer.remoteEvents === prevRemoteStrRef.current) return
    const prevEvents = prevRemoteStrRef.current as any[] | null
    prevRemoteStrRef.current = multiplayer.remoteEvents
    const remote = multiplayer.remoteEvents as StrEvent[]
    setEvents(remote)
    persistStrEvents(matchId, remote)
    // Detect MatchFinished: only trigger when NEW
    const matchFinishedEvt = remote.find((e: any) => e.type === 'StrMatchFinished') as any
    const prevHadFinished = prevEvents ? prevEvents.some((e: any) => e.type === 'StrMatchFinished') : false
    if (matchFinishedEvt && !prevHadFinished) {
      if (multiplayer?.isHost) {
        // Host persists immediately
        ;(async () => {
          try { await persistStrEvents(matchId, remote) } catch {}
          await finishStrMatch(matchId, matchFinishedEvt.winnerId, matchFinishedEvt.totalDarts, matchFinishedEvt.durationMs)
          if (onShowSummary) setTimeout(() => onShowSummary(matchId), 2000)
        })()
      } else {
        // Guest: persist as backup after 5s (in case host disconnected before saving)
        setTimeout(async () => {
          try {
            // Skip if host already saved
            if (await isMatchFinishedInDB('str_matches', matchId)) return
            await persistStrEvents(matchId, remote)
            await finishStrMatch(matchId, matchFinishedEvt.winnerId, matchFinishedEvt.totalDarts, matchFinishedEvt.durationMs)
          } catch {}
        }, 5000)
        if (onShowSummary) setTimeout(() => onShowSummary(matchId), 2000)
      }
    }
    // Ensure match exists locally for guest
    if (remote.length > 0) {
      const startEvt = remote.find((e: any) => e.type === 'StrMatchStarted') as any
      if (startEvt) {
        ensureStrMatchExists(matchId, remote, startEvt.players?.map((p: any) => p.playerId) ?? [])
      }
    }
  }, [multiplayer?.remoteEvents]) // eslint-disable-line react-hooks/exhaustive-deps

  // State ableiten (before useGameState, because we need `state.finished`)
  const state = applyStrEvents(events)

  // Shared game state (pause, timer, speech/mute, visibility)
  const { gamePaused, setGamePaused, muted, setMuted, elapsedMs, setElapsedMs } = useGameState({
    matchId,
    mode: 'str',
    finished: state.finished,
  })

  const [legStartElapsedMs, setLegStartElapsedMs] = useState(0)

  // Intermission (Leg-Zusammenfassung)
  const [intermission, setIntermission] = useState<StrIntermission | null>(null)

  // Spieler-fertig-Zusammenfassung
  const [playerDoneInfo, setPlayerDoneInfo] = useState<StrPlayerDoneInfo | null>(null)

  // Zahlenwahl-Overlay (für 'free' mode)
  const [showNumberPicker, setShowNumberPicker] = useState(false)
  const pendingNextNumberRef = useRef<{ darts: StrDart[] } | null>(null)

  const activePlayerId = getActivePlayerId(state)
  const activePlayer = getActivePlayer(state)
  const availableDarts = activePlayerId ? getAvailableDarts(state, activePlayerId) : 0
  const activePlayerState = activePlayerId ? state.playerState[activePlayerId] : null

  // Multiplayer: Ist der lokale Spieler gerade am Zug?
  const strLocalIds = multiplayer?.localPlayerIds ?? (multiplayer?.myPlayerId ? [multiplayer.myPlayerId] : [])
  const isMyTurn = !multiplayer?.enabled || (activePlayerId != null && strLocalIds.includes(activePlayerId))

  // Ring-Modus Helpers
  const ringMode: StrRingMode = state.match?.ringMode ?? 'triple'
  const ringPrefix = ringMode === 'double' ? 'D' : 'T'
  const ringLabel = ringMode === 'double' ? 'Double' : 'Triple'
  const formatTarget = (num: StrTargetNumber) => getTargetLabel(num, ringMode)

  // Profile laden für Spielerfarben
  const profiles = useMemo(() => getProfiles(), [])

  // Spielerfarben aus Profilen holen (Fallback auf PLAYER_COLORS)
  const playerColors = useMemo(() => {
    if (!state.match) return {}
    const colors: Record<string, string> = {}
    state.match.players.forEach((p, idx) => {
      const profile = profiles.find(pr => pr.id === p.playerId)
      colors[p.playerId] = profile?.color ?? PLAYER_COLORS[idx % PLAYER_COLORS.length]
    })
    return colors
  }, [state.match, profiles])

  // "[Name], throw first! Game on!" am Spielstart
  const gameOnAnnouncedRef = useRef(false)
  useEffect(() => {
    if (!gameOnAnnouncedRef.current && state.match && activePlayer && !state.finished) {
      // Prüfe ob es ein frisches Spiel ist (keine Turns)
      const hasTurns = events.some(e => e.type === 'StrTurnAdded')
      if (!hasTurns) {
        gameOnAnnouncedRef.current = true
        setTimeout(() => announceGameStart(activePlayer.name), 300)
      }
    }
  }, [state.match, activePlayer, state.finished, events])

  // Treffer hinzufügen
  const addHit = useCallback(() => {
    if (gamePaused || !activePlayerId) return
    // Multiplayer: Nur eigene Würfe eingeben
    if (multiplayer?.enabled && !isMyTurn) return
    if (activePlayerState?.currentNumber === 20 && ringMode === 'triple') playTriple20Sound()
    setCurrent(prev => {
      if (prev.length >= availableDarts) return prev
      return [...prev, 'hit' as StrDart]
    })
  }, [gamePaused, activePlayerId, availableDarts, activePlayerState?.currentNumber, ringMode, multiplayer, isMyTurn])

  // Miss hinzufügen
  const addMiss = useCallback(() => {
    if (gamePaused || !activePlayerId) return
    // Multiplayer: Nur eigene Würfe eingeben
    if (multiplayer?.enabled && !isMyTurn) return
    setCurrent(prev => {
      if (prev.length >= availableDarts) return prev
      return [...prev, 'miss' as StrDart]
    })
  }, [gamePaused, activePlayerId, availableDarts, multiplayer, isMyTurn])

  // Turn bestätigen (intern)
  const doConfirmTurn = useCallback((darts: StrDart[], nextNumber?: StrTargetNumber) => {
    if (!activePlayerId || darts.length === 0) return

    const result = recordStrTurn(state, activePlayerId, darts, nextNumber, elapsedMs)
    const newEvents: StrEvent[] = [...events, result.turnEvent]

    // Spieler fertig, aber Leg NICHT fertig → Player-Done-Modal zeigen
    if (result.turnEvent.playerFinished && !result.legFinished) {
      persistStrEvents(matchId, newEvents)
      setEvents(newEvents)
      setCurrent([])
      if (multiplayer?.enabled) multiplayer.submitEvents(newEvents.slice(events.length))

      // Score aus dem neuen State berechnen
      const newState = applyStrEvents(newEvents)
      const playerScore = newState.playerState[activePlayerId]?.legScore ?? 0

      const pIdx = state.match!.players.findIndex(p => p.playerId === activePlayerId)
      setPlayerDoneInfo({
        playerId: activePlayerId,
        playerName: activePlayer?.name ?? '?',
        playerColor: playerColors[activePlayerId] ?? PLAYER_COLORS[pIdx % PLAYER_COLORS.length],
        totalDarts: result.turnEvent.totalDartsInLeg,
        totalTurns: result.turnEvent.turnIndexInLeg,
        legScore: playerScore,
        legId: state.currentLegId!,
      })
      announceStrPlayerDone(activePlayer?.name ?? '?', result.turnEvent.totalDartsInLeg, result.turnEvent.turnIndexInLeg)
      return
    }

    // Leg beendet?
    if (result.legFinished) {
      newEvents.push(result.legFinished)
      if (result.setFinished) newEvents.push(result.setFinished)

      // Match beendet?
      if (result.matchFinished) {
        newEvents.push(result.matchFinished)
        setEvents(newEvents)
        setCurrent([])
        if (multiplayer?.enabled) multiplayer.submitEvents(newEvents.slice(events.length))
        const winnerPlayer = state.match?.players.find(p => p.playerId === result.matchFinished!.winnerId)
        announceStrMatchWinner(winnerPlayer?.name ?? '?')
        // Persist + finish must complete before navigating to summary
        setSaving(true)
        ;(async () => {
          try {
            await persistStrEvents(matchId, newEvents)
            await finishStrMatch(matchId, result.matchFinished!.winnerId, result.matchFinished!.totalDarts, result.matchFinished!.durationMs)
          } catch (err) {
            console.warn('[Straeusschen] Persist failed:', err)
          } finally {
            setSaving(false)
          }
          onShowSummary(matchId)
        })()
        return
      }

      // Leg fertig, Match nicht – Intermission
      if (result.nextLegStart) {
        const winnerPlayer = state.match?.players.find(p => p.playerId === result.legFinished!.winnerId)
        persistStrEvents(matchId, newEvents)
        setEvents(newEvents)
        setCurrent([])
        if (multiplayer?.enabled) multiplayer.submitEvents(newEvents.slice(events.length))

        announceStrLegWinner(winnerPlayer?.name ?? '?', result.legFinished.winnerDarts)

        setIntermission({
          kind: 'leg',
          legIndex: state.currentLegIndex,
          legId: state.currentLegId!,
          legDurationMs: elapsedMs - legStartElapsedMs,
          winnerId: result.legFinished.winnerId,
          winnerName: winnerPlayer?.name ?? '?',
          winnerDarts: result.legFinished.winnerDarts,
          pendingNextEvents: [result.nextLegStart],
        })
        return
      }
    }

    persistStrEvents(matchId, newEvents)
    setEvents(newEvents)
    setCurrent([])
    if (multiplayer?.enabled) multiplayer.submitEvents(newEvents.slice(events.length))
  }, [activePlayerId, events, state, matchId, elapsedMs, onShowSummary, activePlayer, legStartElapsedMs, multiplayer])

  // Turn bestätigen (public) – prüft ob Zahlenwahl nötig
  const confirmTurn = useCallback(() => {
    if (gamePaused || !activePlayerId || current.length === 0) return
    // Multiplayer: Nur eigene Turns bestätigen
    if (multiplayer?.enabled && !isMyTurn) return

    // Prüfe ob aktuelle Zahl mit diesen Darts abgeschlossen wird UND mode='all' + order='free'
    const ps = state.playerState[activePlayerId]
    if (!ps || !state.match) return

    const hits = current.filter(d => d === 'hit').length
    const progress = ps.numberProgress[ps.currentNumber]
    const totalHits = (progress?.triplesHit ?? 0) + hits
    const numberCompleted = totalHits >= 3

    // Wenn Zahl abgeschlossen, mode=all, order=free, und noch weitere Zahlen offen
    if (numberCompleted && state.match.mode === 'all' && state.match.numberOrder === 'free') {
      const remaining = getRemainingNumbers(state, activePlayerId).filter(n => n !== ps.currentNumber)
      if (remaining.length > 0) {
        // Zahlenwahl-Overlay anzeigen
        pendingNextNumberRef.current = { darts: [...current] }
        setShowNumberPicker(true)
        return
      }
    }

    doConfirmTurn(current)
  }, [gamePaused, activePlayerId, current, state, doConfirmTurn, multiplayer, isMyTurn])

  // Zahlenwahl bestätigen
  const handlePickNumber = useCallback((num: StrTargetNumber) => {
    setShowNumberPicker(false)
    const pending = pendingNextNumberRef.current
    pendingNextNumberRef.current = null
    if (pending) {
      doConfirmTurn(pending.darts, num)
    }
  }, [doConfirmTurn])

  // Auto-Confirm bei voller Dartanzahl
  useEffect(() => {
    if (current.length > 0 && current.length >= availableDarts) {
      confirmTurn()
    }
  }, [current.length, availableDarts, confirmTurn])

  // Undo letzten Turn
  const undoLastTurn = useCallback(() => {
    let lastTurnIndex = -1
    for (let i = events.length - 1; i >= 0; i--) {
      if (events[i].type === 'StrTurnAdded') { lastTurnIndex = i; break }
    }
    if (lastTurnIndex === -1) return

    // Ausstehende Sprachansagen abbrechen
    cancelDebouncedAnnounce()

    const newEvents = events.slice(0, lastTurnIndex)
    persistStrEvents(matchId, newEvents)
    setEvents(newEvents)
    setCurrent([])
    if (multiplayer?.enabled) multiplayer.undo(events.length - lastTurnIndex)
  }, [events, matchId, multiplayer])

  const canUndo = useMemo(() => events.some(e => e.type === 'StrTurnAdded'), [events])

  // Ensure keyboard focus when a local player's turn starts
  useEffect(() => {
    if (!multiplayer?.enabled || isMyTurn) { if (document.activeElement instanceof HTMLElement) document.activeElement.blur() }
  }, [activePlayerId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Keyboard Handler
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase()
      if (tag === 'input' || tag === 'textarea') return

      if (e.key === 'p' || e.key === 'P') { setGamePaused(p => !p); return }
      if (gamePaused) return

      if (e.code === 'Space' || e.key === ' ') { addHit(); e.preventDefault(); return }
      if (e.key === '0') { addMiss(); e.preventDefault(); return }
      if (e.key === 'Backspace') { setCurrent(prev => prev.slice(0, -1)); e.preventDefault(); return }
      if (e.key === 'Enter') { confirmTurn(); e.preventDefault(); return }
      if (e.key === 'Escape') { onExit(); e.preventDefault(); return }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [addHit, addMiss, confirmTurn, onExit, gamePaused])

  // Turn-History für aktiven Spieler im aktuellen Leg
  const turnHistory = useMemo(() => {
    if (!activePlayerId) return []
    return events.filter(
      (e): e is StrTurnAddedEvent => e.type === 'StrTurnAdded' && (e as StrTurnAddedEvent).playerId === activePlayerId
    )
  }, [events, activePlayerId])

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

  const modeLabel = state.match.mode === 'single'
    ? `Sträußchen · ${formatTarget(state.match.targetNumber ?? 20)}`
    : `Sträußchen · ${formatTarget(17)}–${formatTarget(state.match.includeBull ? 25 : 20)}`

  // Fortschritts-Infos für alle Spieler
  const playerInfos = state.match.players.map((p, index) => {
    const ps = state.playerState[p.playerId]
    const isActive = p.playerId === activePlayerId
    const color = playerColors[p.playerId] ?? PLAYER_COLORS[index % PLAYER_COLORS.length]
    return { player: p, ps, isActive, color, index }
  })

  // Aktiver Spieler-Index für Dartboard-Farbe
  const activePlayerIndex = state.match.players.findIndex(p => p.playerId === activePlayerId)
  const activeColor = activePlayerIndex >= 0
    ? (playerColors[state.match.players[activePlayerIndex]?.playerId] ?? PLAYER_COLORS[activePlayerIndex % PLAYER_COLORS.length])
    : '#f97316'

  return (
    <div
      style={{
        background: c.bg,
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        color: c.textBright,
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      {/* Pause Overlay */}
      {gamePaused && <PauseOverlay onResume={() => setGamePaused(false)} />}

      {/* Zahlenwahl-Overlay (free mode) */}
      {showNumberPicker && activePlayerId && (
        <NumberPickerOverlay
          remaining={getRemainingNumbers(state, activePlayerId).filter(
            n => n !== (activePlayerState?.currentNumber)
          )}
          onPick={handlePickNumber}
          colors={c}
          isArcade={isArcade}
          formatTarget={formatTarget}
        />
      )}

      {/* Header */}
      <GameControls
        isPaused={gamePaused}
        onTogglePause={() => setGamePaused(p => !p)}
        isMuted={muted}
        onToggleMute={() => setMuted(m => !m)}
        onExit={() => {
          setMatchPaused(matchId, 'str', true)
          setMatchElapsedTime(matchId, 'str', elapsedMs)
          onExit()
        }}
        onCancel={() => {
          deleteStrMatch(matchId)
          onExit()
        }}
        title={`${modeLabel}${multiplayer?.enabled && multiplayer.roomCode ? ` · ${multiplayer.roomCode}` : ''}`}
      />

      {/* Info-Leiste */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          gap: 16,
          padding: '8px 20px',
          borderBottom: `1px solid ${c.border}`,
          background: c.cardBg,
          fontSize: 13,
        }}
      >
        {/* Leg/Set Score */}
        {state.match.structure.kind === 'legs' && state.match.structure.bestOfLegs > 1 && (
          <span style={{ color: c.ledOn, fontWeight: 700 }}>
            Legs: {state.match.players.map(p => state.totalLegWinsByPlayer[p.playerId] || 0).join(' : ')}
          </span>
        )}
        {state.match.structure.kind === 'sets' && (
          <span style={{ color: c.ledOn, fontWeight: 700 }}>
            Sets: {state.match.players.map(p => state.setWinsByPlayer[p.playerId] || 0).join(' : ')}
            <span style={{ marginLeft: 8, color: c.textDim, fontSize: 12 }}>
              (Legs: {state.match.players.map(p => state.legWinsByPlayer[p.playerId] || 0).join(' : ')})
            </span>
          </span>
        )}
        {/* Timer */}
        <div
          style={{
            fontFamily: 'monospace',
            fontSize: 18,
            fontWeight: 700,
            color: c.ledOn,
            textShadow: `0 0 10px ${c.ledGlow}`,
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
          alignItems: 'center',
          justifyContent: 'center',
          gap: 50,
          padding: 20,
        }}
      >
        {/* Dartboard */}
        <div style={{ position: 'relative' }}>
          <StraeusschenDartboard
            targetNumber={activePlayerState?.currentNumber ?? 20}
            triplesHit={activePlayerState?.numberProgress[activePlayerState.currentNumber]?.triplesHit ?? 0}
            size={420}
            glowColor={activeColor}
            ringMode={state.match?.ringMode}
            bullMode={state.match?.bullMode}
          />

          {/* Aktuelles Ziel unter der Dartscheibe */}
          {activePlayer && activePlayerState && (
            <div
              style={{
                position: 'absolute',
                bottom: -70,
                left: '50%',
                transform: 'translateX(-50%)',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: 13, color: c.textDim, marginBottom: 4 }}>
                {activePlayer.name} – Ziel:
              </div>
              <div
                style={{
                  fontSize: 56,
                  fontWeight: 700,
                  color: c.ledOn,
                  textShadow: `0 0 25px ${c.ledGlow}`,
                }}
              >
                {formatTarget(activePlayerState.currentNumber)}
              </div>
            </div>
          )}
        </div>

        {/* Rechte Seite: Controls + Spieler */}
        <div style={{ minWidth: 300, maxWidth: 380 }}>
          {/* Dart-Eingabe */}
          <div
            style={{
              background: c.cardBg,
              borderRadius: 12,
              padding: '14px 18px',
              marginBottom: 16,
              border: `1px solid ${c.border}`,
            }}
          >
            <div style={{ fontSize: 11, color: c.textDim, marginBottom: 10, textAlign: 'center' }}>
              DARTS – Runde {(activePlayerState?.turnsInLeg ?? 0) + 1}
            </div>

            {/* Dart-Slots */}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 12 }}>
              {Array.from({ length: availableDarts }).map((_, i) => {
                const dart = current[i]
                const isHit = dart === 'hit'
                const isMiss = dart === 'miss'
                return (
                  <div
                    key={i}
                    style={{
                      width: 70,
                      height: 44,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: dart
                        ? (isHit ? (isArcade ? '#14532d' : '#dcfce7') : (isArcade ? '#7f1d1d' : '#fef2f2'))
                        : (isArcade ? '#0a0a0a' : colors.bgMuted),
                      border: dart
                        ? `2px solid ${isHit ? c.green : c.red}`
                        : `1px solid ${c.border}`,
                      borderRadius: 8,
                      fontWeight: 700,
                      fontSize: 14,
                      color: dart
                        ? (isHit ? c.green : c.red)
                        : c.textDim,
                    }}
                  >
                    {dart ? (isHit ? (activePlayerState?.currentNumber === 25 ? 'Bull!' : ringLabel + '!') : 'Miss') : '—'}
                  </div>
                )
              })}
            </div>

            {/* Triple-Progress für aktuelle Zahl */}
            {activePlayerState && (
              <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginBottom: 12 }}>
                {[0, 1, 2].map(i => {
                  const progress = activePlayerState.numberProgress[activePlayerState.currentNumber]
                  const hitsTotal = (progress?.triplesHit ?? 0) + current.filter(d => d === 'hit').length
                  const filled = i < hitsTotal
                  return (
                    <div
                      key={i}
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: '50%',
                        background: filled ? c.accent : (isArcade ? '#1a1a1a' : colors.bgMuted),
                        border: `2px solid ${filled ? c.accent : c.border}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 14,
                        fontWeight: 700,
                        color: filled ? '#fff' : c.textDim,
                        boxShadow: filled ? `0 0 10px ${c.accent}60` : 'none',
                        transition: 'all 0.2s',
                      }}
                    >
                      {filled ? '✓' : ''}
                    </div>
                  )
                })}
              </div>
            )}

            {/* Undo + Keyboard Hint */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button
                onClick={undoLastTurn}
                disabled={!canUndo}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: '50%',
                  border: canUndo ? `1px solid ${c.border}` : `1px solid ${isArcade ? '#333' : '#e5e7eb'}`,
                  background: canUndo ? (isArcade ? '#2a2a2a' : '#f9fafb') : (isArcade ? '#1a1a1a' : '#f3f4f6'),
                  color: canUndo ? c.textBright : c.textDim,
                  cursor: canUndo ? 'pointer' : 'not-allowed',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 18,
                  opacity: canUndo ? 1 : 0.4,
                }}
                title="Letzten Zug rückgängig"
              >
                ↶
              </button>
              <div style={{ fontSize: 11, color: c.textDim, textAlign: 'center' }}>
                [Space] Treffer · [0] Miss · [Enter] Bestätigen
              </div>
            </div>
          </div>

          {/* Spieler-Liste */}
          <div
            style={{
              background: c.cardBg,
              borderRadius: 12,
              padding: 16,
              border: `1px solid ${c.border}`,
              marginBottom: 16,
            }}
          >
            <div style={{ fontSize: 11, color: c.textDim, marginBottom: 12 }}>SPIELER</div>
            <div style={{ display: 'grid', gap: 10 }}>
              {playerInfos.map(({ player, ps, isActive, color }) => {
                if (!ps) return null
                const triplesHit = ps.numberProgress[ps.currentNumber]?.triplesHit ?? 0

                return (
                  <div
                    key={player.playerId}
                    style={{
                      padding: '10px 12px',
                      borderRadius: 8,
                      background: isActive ? (isArcade ? '#1a1a1a' : '#f0f9ff') : 'transparent',
                      borderLeft: `4px solid ${color}`,
                      boxShadow: isActive ? `0 0 20px ${color}30` : 'none',
                      opacity: ps.legComplete ? 0.5 : 1,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div
                          style={{
                            width: 10,
                            height: 10,
                            borderRadius: '50%',
                            background: color,
                            boxShadow: isActive ? `0 0 10px ${color}` : 'none',
                          }}
                        />
                        <span style={{ fontWeight: isActive ? 700 : 500, color: isActive ? color : c.textBright }}>
                          {player.name}
                        </span>
                      </div>
                      <span style={{ fontSize: 12, color: c.textDim }}>
                        {ps.dartsInLeg} D · {ps.legScore.toFixed(1)} Pkt
                      </span>
                    </div>

                    {/* Status */}
                    <div style={{ fontSize: 12, color: c.textDim }}>
                      {ps.legComplete ? (
                        <span style={{ color: c.green, fontWeight: 600 }}>Fertig ({ps.dartsInLeg} Darts)</span>
                      ) : (
                        <>
                          <span style={{ color }}>{formatTarget(ps.currentNumber)}</span>
                          <span style={{ margin: '0 4px' }}>–</span>
                          <span>{triplesHit}/3 Treffer</span>
                          {state.match!.mode === 'all' && (
                            <span style={{ marginLeft: 8 }}>
                              ({ps.completedNumbers.length}/{getAllNumbers(state.match!.includeBull).length} Zahlen)
                            </span>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Runden-History (aktiver Spieler) */}
          {turnHistory.length > 0 && (
            <div
              style={{
                background: c.cardBg,
                borderRadius: 12,
                padding: '12px 16px',
                border: `1px solid ${c.border}`,
                maxHeight: 160,
                overflowY: 'auto',
              }}
            >
              <div style={{ fontSize: 11, color: c.textDim, marginBottom: 8 }}>VERLAUF</div>
              <div style={{ display: 'grid', gap: 4 }}>
                {turnHistory.map((turn, i) => (
                  <div key={turn.eventId} style={{ fontSize: 12, display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: c.textDim }}>R{i + 1} ({formatTarget(turn.targetNumber)}):</span>
                    <span>
                      {turn.darts.map((d, j) => (
                        <span
                          key={j}
                          style={{
                            color: d === 'hit' ? c.green : c.red,
                            fontWeight: d === 'hit' ? 700 : 400,
                            marginLeft: j > 0 ? 4 : 0,
                          }}
                        >
                          {d === 'hit' ? (turn.targetNumber === 25 ? 'B' : ringPrefix) : '•'}
                        </span>
                      ))}
                      <span style={{ color: c.textDim, marginLeft: 6 }}>
                        ({turn.hits}/{turn.darts.length})
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Fortschrittsleiste für 'all' mode */}
          {state.match.mode === 'all' && activePlayerState && (
            <div
              style={{
                marginTop: 16,
                display: 'flex',
                gap: 8,
                justifyContent: 'center',
              }}
            >
              {getAllNumbers(state.match.includeBull).map(n => {
                const progress = activePlayerState.numberProgress[n]
                const hits = progress?.triplesHit ?? 0
                const completed = progress?.completed ?? false
                const isCurrent = n === activePlayerState.currentNumber
                return (
                  <div
                    key={n}
                    style={{
                      textAlign: 'center',
                      padding: '6px 10px',
                      borderRadius: 8,
                      background: completed
                        ? (isArcade ? '#14532d' : '#dcfce7')
                        : isCurrent
                          ? (isArcade ? '#1a1a1a' : '#f0f9ff')
                          : 'transparent',
                      border: `1px solid ${isCurrent ? c.accent : c.border}`,
                      minWidth: 56,
                    }}
                  >
                    <div style={{ fontSize: 14, fontWeight: 700, color: completed ? c.green : isCurrent ? c.accent : c.textDim }}>
                      {formatTarget(n)}
                    </div>
                    <div style={{ fontSize: 11, color: completed ? c.green : c.textDim }}>
                      {completed ? '✓' : `${hits}/3`}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Spieler-fertig-Modal */}
      {playerDoneInfo && (
        <PlayerDoneModal
          info={playerDoneInfo}
          events={events}
          mode={state.match.mode}
          ringLabel={ringLabel}
          formatTarget={formatTarget}
          onContinue={() => {
            setPlayerDoneInfo(null)
            // Nächsten Spieler ansagen
            const nextState = applyStrEvents(events)
            const nextPid = getActivePlayerId(nextState)
            const nextPlayer = getActivePlayer(nextState)
            const nextPs = nextPid ? nextState.playerState[nextPid] : null
            const isNextLocalStr = !multiplayer?.enabled || (nextPid != null && strLocalIds.includes(nextPid))
            if (nextPlayer && nextPs && isNextLocalStr) {
              debouncedAnnounce(() => announceStrPlayerTurn(nextPlayer.name, nextPs.currentNumber))
            }
          }}
        />
      )}

      {/* Speichern-Indikator */}
      {saving && (
        <div style={{ fontSize: 13, color: c.textDim, padding: '8px 0', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <span style={{ display: 'inline-block', width: 14, height: 14, border: '2px solid currentColor', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          Speichern...
        </div>
      )}

      {/* Leg-Zusammenfassung (Intermission) */}
      {intermission && (
        <LegIntermissionModal
          intermission={intermission}
          match={state.match}
          events={events}
          legWinsByPlayer={state.totalLegWinsByPlayer}
          modeLabel={modeLabel}
          ringLabel={ringLabel}
          formatTarget={formatTarget}
          includeBull={state.match.includeBull}
          playerColors={playerColors}
          onContinue={() => {
            const newEvents = [...events, ...intermission.pendingNextEvents]
            persistStrEvents(matchId, newEvents)
            setEvents(newEvents)
            setIntermission(null)
            setLegStartElapsedMs(elapsedMs)
            if (multiplayer?.enabled) multiplayer.submitEvents(intermission.pendingNextEvents)
          }}
        />
      )}
    </div>
  )
}

// ===== Zahlenwahl-Overlay =====

function NumberPickerOverlay({
  remaining,
  onPick,
  colors: c,
  isArcade,
  formatTarget,
}: {
  remaining: StrTargetNumber[]
  onPick: (n: StrTargetNumber) => void
  colors: any
  isArcade: boolean
  formatTarget: (num: StrTargetNumber) => string
}) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.85)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        gap: 20,
      }}
    >
      <div style={{ fontSize: 20, fontWeight: 700, color: c.textBright }}>
        Nächste Zahl wählen
      </div>
      <div style={{ display: 'flex', gap: 16 }}>
        {remaining.map(n => (
          <button
            key={n}
            onClick={() => onPick(n)}
            style={{
              width: 80,
              height: 80,
              borderRadius: 12,
              border: `2px solid ${c.accent}`,
              background: isArcade ? '#1a1a1a' : '#fff',
              color: c.accent,
              fontSize: 28,
              fontWeight: 800,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {formatTarget(n)}
          </button>
        ))}
      </div>
    </div>
  )
}

// ===== Spieler-fertig Modal =====

function PlayerDoneModal({
  info,
  events,
  mode,
  ringLabel,
  formatTarget,
  onContinue,
}: {
  info: StrPlayerDoneInfo
  events: StrEvent[]
  mode: 'single' | 'all'
  ringLabel: string
  formatTarget: (num: StrTargetNumber) => string
  onContinue: () => void
}) {
  // Enter-Taste zum Weitergehen
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Enter') onContinue()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onContinue])

  const playerStats = useMemo(() => {
    const legTurns = events.filter(
      (e): e is StrTurnAddedEvent =>
        e.type === 'StrTurnAdded' &&
        (e as StrTurnAddedEvent).legId === info.legId &&
        (e as StrTurnAddedEvent).playerId === info.playerId
    )
    const stats = computeStrLegStats(legTurns, [{ playerId: info.playerId, name: info.playerName }])
    return stats[0] || null
  }, [events, info.legId, info.playerId, info.playerName])

  const isMultiField = mode === 'all'

  const tdStyle: React.CSSProperties = { textAlign: 'right', padding: '5px 10px', borderBottom: '1px solid #222', fontWeight: 600 }
  const labelStyle: React.CSSProperties = { padding: '5px 10px', borderBottom: '1px solid #222', color: '#9ca3af', fontSize: 12 }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.85)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: 20,
      }}
    >
      <div
        style={{
          background: '#111',
          borderRadius: 16,
          padding: 24,
          maxWidth: 420,
          width: '100%',
          maxHeight: '90vh',
          overflowY: 'auto',
          border: `2px solid ${info.playerColor}40`,
        }}
      >
        {/* Spielername + Fertig */}
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div style={{ fontSize: 14, color: info.playerColor, fontWeight: 700, marginBottom: 6 }}>
            {info.playerName}
          </div>
          <div style={{ fontSize: 36, fontWeight: 800, color: '#22c55e' }}>
            Fertig!
          </div>
          <div style={{ fontSize: 18, color: '#f97316', marginTop: 6 }}>
            {info.totalDarts} Darts · {info.totalTurns} Aufnahmen
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#0ea5e9', marginTop: 8 }}>
            Score: {info.legScore.toFixed(1)}
          </div>
        </div>

        {/* Stats */}
        {playerStats && (
          <div style={{ marginBottom: 20 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, color: '#e5e7eb' }}>
              <tbody>
                <tr>
                  <td style={labelStyle}>Score</td>
                  <td style={{ ...tdStyle, color: '#0ea5e9' }}>{playerStats.totalScore.toFixed(1)}</td>
                </tr>
                <tr>
                  <td style={labelStyle}>Hit Rate</td>
                  <td style={{ ...tdStyle, color: '#22c55e' }}>{playerStats.hitRate.toFixed(1)}%</td>
                </tr>

                {/* Single-Mode: dartsToTriple */}
                {!isMultiField && playerStats.fields[0] && (
                  <>
                    <tr>
                      <td style={labelStyle}>{'1. ' + (playerStats.fields[0].targetNumber === 25 ? 'Bull' : ringLabel)}</td>
                      <td style={{ ...tdStyle, color: '#f97316' }}>{playerStats.fields[0].dartsToTriple[0] ?? '—'}</td>
                    </tr>
                    <tr>
                      <td style={labelStyle}>{'2. ' + (playerStats.fields[0].targetNumber === 25 ? 'Bull' : ringLabel)}</td>
                      <td style={{ ...tdStyle, color: '#f97316' }}>{playerStats.fields[0].dartsToTriple[1] ?? '—'}</td>
                    </tr>
                    <tr>
                      <td style={labelStyle}>{'3. ' + (playerStats.fields[0].targetNumber === 25 ? 'Bull' : ringLabel)}</td>
                      <td style={{ ...tdStyle, color: '#f97316' }}>{playerStats.fields[0].dartsToTriple[2] ?? '—'}</td>
                    </tr>
                  </>
                )}

                {/* All-Mode: Schwerstes Feld */}
                {isMultiField && playerStats.hardestField && (
                  <tr>
                    <td style={labelStyle}>Schwerstes Feld</td>
                    <td style={{ ...tdStyle, color: '#ef4444' }}>
                      {formatTarget(playerStats.hardestField.number as StrTargetNumber)} ({playerStats.hardestField.darts} Darts)
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            {/* All-Mode: Per-Feld Aufschlüsselung */}
            {isMultiField && playerStats.fields.length > 1 && (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 6 }}>Pro Feld</div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, color: '#e5e7eb' }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left', padding: '4px 10px', borderBottom: '1px solid #333', color: '#6b7280', fontWeight: 700, fontSize: 11 }}>Feld</th>
                      <th style={{ textAlign: 'right', padding: '4px 10px', borderBottom: '1px solid #333', color: '#6b7280', fontWeight: 700, fontSize: 11 }}>Darts</th>
                      <th style={{ textAlign: 'right', padding: '4px 10px', borderBottom: '1px solid #333', color: '#0ea5e9', fontWeight: 700, fontSize: 11 }}>Score</th>
                      <th style={{ textAlign: 'right', padding: '4px 10px', borderBottom: '1px solid #333', color: '#f97316', fontWeight: 700, fontSize: 11 }}>1.</th>
                      <th style={{ textAlign: 'right', padding: '4px 10px', borderBottom: '1px solid #333', color: '#f97316', fontWeight: 700, fontSize: 11 }}>2.</th>
                      <th style={{ textAlign: 'right', padding: '4px 10px', borderBottom: '1px solid #333', color: '#f97316', fontWeight: 700, fontSize: 11 }}>3.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {playerStats.fields.map(f => (
                      <tr key={f.targetNumber}>
                        <td style={{ padding: '4px 10px', borderBottom: '1px solid #222', fontWeight: 600 }}>{formatTarget(f.targetNumber as StrTargetNumber)}</td>
                        <td style={{ textAlign: 'right', padding: '4px 10px', borderBottom: '1px solid #222' }}>{f.totalDarts}</td>
                        <td style={{ textAlign: 'right', padding: '4px 10px', borderBottom: '1px solid #222', color: '#0ea5e9' }}>{f.score.toFixed(1)}</td>
                        <td style={{ textAlign: 'right', padding: '4px 10px', borderBottom: '1px solid #222', color: '#f97316' }}>{f.dartsToTriple[0] ?? '—'}</td>
                        <td style={{ textAlign: 'right', padding: '4px 10px', borderBottom: '1px solid #222', color: '#f97316' }}>{f.dartsToTriple[1] ?? '—'}</td>
                        <td style={{ textAlign: 'right', padding: '4px 10px', borderBottom: '1px solid #222', color: '#f97316' }}>{f.dartsToTriple[2] ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Weiter-Button */}
        <button
          onClick={onContinue}
          style={{
            width: '100%',
            padding: '14px 20px',
            fontSize: 16,
            fontWeight: 700,
            background: `linear-gradient(180deg, ${info.playerColor}, ${info.playerColor}cc)`,
            color: '#fff',
            border: 'none',
            borderRadius: 10,
            cursor: 'pointer',
            boxShadow: `0 4px 15px ${info.playerColor}40`,
          }}
        >
          Weiter →
        </button>
      </div>
    </div>
  )
}

// ===== Leg-Zusammenfassung Modal =====

function LegIntermissionModal({
  intermission,
  match,
  events,
  legWinsByPlayer,
  modeLabel,
  ringLabel,
  formatTarget,
  includeBull,
  playerColors,
  onContinue,
}: {
  intermission: StrIntermission
  match: any
  events: StrEvent[]
  legWinsByPlayer: Record<string, number>
  modeLabel: string
  ringLabel: string
  formatTarget: (num: StrTargetNumber) => string
  includeBull: boolean
  playerColors: Record<string, string>
  onContinue: () => void
}) {
  // Enter-Taste zum Weitergehen
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Enter') onContinue()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onContinue])

  const legScore = match.players.map((p: any) => legWinsByPlayer[p.playerId] || 0).join(' : ')

  // Leg-Stats berechnen
  const legStats = useMemo(() => {
    const legTurns = events.filter(
      (e): e is StrTurnAddedEvent => e.type === 'StrTurnAdded' && (e as StrTurnAddedEvent).legId === intermission.legId
    )
    return computeStrLegStats(
      legTurns,
      match.players.map((p: any) => ({ playerId: p.playerId, name: p.name }))
    )
  }, [events, intermission.legId, match.players])

  const isMultiField = match.mode === 'all'
  const isMultiPlayer = match.players.length > 1

  const tdStyle: React.CSSProperties = { textAlign: 'right', padding: '5px 8px', borderBottom: '1px solid #222', fontWeight: 600 }
  const labelStyle: React.CSSProperties = { padding: '5px 8px', borderBottom: '1px solid #222', color: '#9ca3af', fontSize: 12, whiteSpace: 'nowrap' }
  const headerStyle: React.CSSProperties = { textAlign: 'right', padding: '5px 8px', borderBottom: '1px solid #333', fontWeight: 700, fontSize: 12 }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.85)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: 20,
      }}
    >
      <div
        style={{
          background: '#111',
          borderRadius: 16,
          padding: 24,
          maxWidth: 650,
          width: '100%',
          maxHeight: '90vh',
          overflowY: 'auto',
          border: '1px solid #333',
        }}
      >
        {/* Match-Kopf */}
        <div style={{ textAlign: 'center', marginBottom: 16 }}>
          <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 2 }}>{modeLabel}</div>
          <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 8 }}>
            Leg {intermission.legIndex} · {formatDuration(intermission.legDurationMs)}
          </div>

          {/* Leg-Stand */}
          <div
            style={{
              background: '#1a1a1a',
              borderRadius: 10,
              padding: '10px 20px',
              display: 'inline-block',
              marginBottom: 12,
            }}
          >
            <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 2 }}>Spielstand</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: '#e5e7eb' }}>{legScore}</div>
          </div>
        </div>

        {/* Gewinner */}
        <div style={{ textAlign: 'center', marginBottom: 16 }}>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#22c55e' }}>
            {intermission.winnerName} gewinnt!
          </div>
          <div style={{ fontSize: 16, color: '#f97316', marginTop: 4 }}>
            {intermission.winnerDarts} Darts
          </div>
          {/* Score des Gewinners */}
          {(() => {
            const winnerStat = legStats.find(s => s.playerId === intermission.winnerId)
            return winnerStat ? (
              <div style={{ fontSize: 18, fontWeight: 700, color: '#0ea5e9', marginTop: 4 }}>
                Score: {winnerStat.totalScore.toFixed(1)}
              </div>
            ) : null
          })()}
        </div>

        {/* Statistik-Tabelle */}
        {legStats.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#9ca3af', marginBottom: 8 }}>
              Leg-Statistik
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, color: '#e5e7eb' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', ...headerStyle, color: '#6b7280' }}></th>
                  {legStats.map((ps, idx) => (
                    <th key={ps.playerId} style={{ ...headerStyle, color: playerColors[ps.playerId] ?? PLAYER_COLORS[idx % PLAYER_COLORS.length] }}>
                      {ps.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={labelStyle}>Score</td>
                  {legStats.map(ps => (
                    <td key={ps.playerId} style={{ ...tdStyle, color: '#0ea5e9', fontSize: 15 }}>
                      {ps.totalScore.toFixed(1)}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td style={labelStyle}>Aufnahmen</td>
                  {legStats.map(ps => <td key={ps.playerId} style={tdStyle}>{ps.totalTurns}</td>)}
                </tr>
                <tr>
                  <td style={labelStyle}>Darts</td>
                  {legStats.map(ps => <td key={ps.playerId} style={tdStyle}>{ps.totalDarts}</td>)}
                </tr>

                {/* Bei Single-Mode: dartsToTriple direkt anzeigen */}
                {!isMultiField && (
                  <>
                    {[0, 1, 2].map(idx => {
                      const targetNum = legStats[0]?.fields[0]?.targetNumber
                      const label = targetNum === 25 ? `${idx + 1}. Bull` : `${idx + 1}. ${ringLabel}`
                      return (
                        <tr key={idx}>
                          <td style={labelStyle}>{label}</td>
                          {legStats.map(ps => (
                            <td key={ps.playerId} style={{ ...tdStyle, color: '#f97316' }}>
                              {ps.fields[0]?.dartsToTriple[idx] ?? '—'}
                            </td>
                          ))}
                        </tr>
                      )
                    })}
                  </>
                )}

                <tr>
                  <td style={labelStyle}>Hit Rate</td>
                  {legStats.map(ps => (
                    <td key={ps.playerId} style={{ ...tdStyle, color: '#22c55e' }}>
                      {ps.hitRate.toFixed(1)}%
                    </td>
                  ))}
                </tr>

                {/* Schwerstes Feld (bei all mode) */}
                {isMultiField && (
                  <tr>
                    <td style={labelStyle}>Schwerstes Feld</td>
                    {legStats.map(ps => (
                      <td key={ps.playerId} style={{ ...tdStyle, color: '#ef4444', fontSize: 12 }}>
                        {ps.hardestField ? `${formatTarget(ps.hardestField.number as StrTargetNumber)} (${ps.hardestField.darts}D)` : '—'}
                      </td>
                    ))}
                  </tr>
                )}
              </tbody>
            </table>

            {/* Per-Feld Aufschlüsselung (bei all mode) */}
            {isMultiField && legStats.some(ps => ps.fields.length > 1) && (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 6 }}>Pro Feld</div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, color: '#e5e7eb' }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left', ...headerStyle, color: '#6b7280' }}>Feld</th>
                      {isMultiPlayer && legStats.map((ps, idx) => (
                        <th key={`${ps.playerId}-hdr`} colSpan={4} style={{ ...headerStyle, color: playerColors[ps.playerId] ?? PLAYER_COLORS[idx % PLAYER_COLORS.length] }}>
                          {ps.name}
                        </th>
                      ))}
                      {!isMultiPlayer && (
                        <>
                          <th style={{ ...headerStyle, color: '#6b7280' }}>Darts</th>
                          <th style={{ ...headerStyle, color: '#0ea5e9' }}>Score</th>
                          <th style={{ ...headerStyle, color: '#f97316' }}>1.</th>
                          <th style={{ ...headerStyle, color: '#f97316' }}>2.</th>
                          <th style={{ ...headerStyle, color: '#f97316' }}>3.</th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {getAllNumbers(includeBull).map(num => {
                      // Prüfe ob mindestens ein Spieler dieses Feld hat
                      const anyHasField = legStats.some(ps => ps.fields.some(f => f.targetNumber === num))
                      if (!anyHasField) return null

                      return (
                        <tr key={num}>
                          <td style={{ ...labelStyle, fontWeight: 600 }}>{formatTarget(num)}</td>
                          {isMultiPlayer ? legStats.map(ps => {
                            const field = ps.fields.find(f => f.targetNumber === num)
                            return (
                              <React.Fragment key={ps.playerId}>
                                <td style={{ ...tdStyle, fontSize: 11 }}>{field?.totalDarts ?? '—'}</td>
                                <td style={{ ...tdStyle, fontSize: 11, color: '#f97316' }}>{field?.dartsToTriple[0] ?? '—'}</td>
                                <td style={{ ...tdStyle, fontSize: 11, color: '#f97316' }}>{field?.dartsToTriple[1] ?? '—'}</td>
                                <td style={{ ...tdStyle, fontSize: 11, color: '#f97316' }}>{field?.dartsToTriple[2] ?? '—'}</td>
                              </React.Fragment>
                            )
                          }) : (() => {
                            const field = legStats[0]?.fields.find(f => f.targetNumber === num)
                            return (
                              <>
                                <td style={tdStyle}>{field?.totalDarts ?? '—'}</td>
                                <td style={{ ...tdStyle, color: '#0ea5e9' }}>{field ? field.score.toFixed(1) : '—'}</td>
                                <td style={{ ...tdStyle, color: '#f97316' }}>{field?.dartsToTriple[0] ?? '—'}</td>
                                <td style={{ ...tdStyle, color: '#f97316' }}>{field?.dartsToTriple[1] ?? '—'}</td>
                                <td style={{ ...tdStyle, color: '#f97316' }}>{field?.dartsToTriple[2] ?? '—'}</td>
                              </>
                            )
                          })()}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Weiter-Button */}
        <button
          onClick={onContinue}
          style={{
            width: '100%',
            padding: '14px 20px',
            fontSize: 16,
            fontWeight: 700,
            background: 'linear-gradient(180deg, #f97316, #ea580c)',
            color: '#fff',
            border: 'none',
            borderRadius: 10,
            cursor: 'pointer',
            boxShadow: '0 4px 15px rgba(249, 115, 22, 0.4)',
          }}
        >
          Weiter zum nächsten Leg →
        </button>
      </div>
    </div>
  )
}
