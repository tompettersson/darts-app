// src/screens/GameOperation.tsx
// Live-Spielscreen fuer Operation - "Ein Feld keine Gnade"
// 30 Darts pro Spieler pro Leg, 3 Darts pro Turn (10 Turns).
// Ziel: moeglichst viele Punkte auf ein Zielfeld sammeln.
// Hit-Types: NO_SCORE, SINGLE, DOUBLE, TRIPLE (Zahlen) oder NO_SCORE, SINGLE_BULL, DOUBLE_BULL (Bull).
// Streak-Tracking: 3+ Treffer in Folge glow, 10+ burn.
// Multi-Leg mit Leg-Summary Modal zwischen den Legs.

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useGameState, useGameColors } from '../hooks/useGameState'
import {
  getOperationMatchById,
  persistOperationEvents,
  finishOperationMatch,
  setMatchPaused,
  setMatchElapsedTime,
  deleteOperationMatch,
  getPlayerColorBackgroundEnabled,
  getProfiles,
  ensureOperationMatchExists,
} from '../storage'
import {
  applyOperationEvents,
  recordOperationDart,
  getActivePlayerId,
  getCurrentLeg,
  getDartsRemaining,
  getDartsInTurnRemaining,
  getCurrentTurnIndex,
  getCurrentDartInTurn,
  startNewLeg,
  formatDuration,
  DARTS_PER_LEG,
  type OperationEvent,
  type OperationDartResult,
  type HitType,
} from '../dartsOperation'
import GameControls, { PauseOverlay } from '../components/GameControls'
import {
  playOperationStreakSound,
  announceOperationGameStart,
  announceOperationNextPlayer,
  announceOperationLastRound,
  announceOperationHits,
  playTriple20Sound,
  cancelDebouncedAnnounce,
  debouncedAnnounce,
} from '../speech'
import OperationLegSummary from './OperationLegSummary'
import { PLAYER_COLORS } from '../playerColors'
import { useDisableScale } from '../components/ScaleWrapper'

// ===== Flammen-Effekt =====
// Wächst mit jedem Treffer, bei 30 Treffern explodiert sie ins Feuerwerk.

function OperationFlame({ streak, totalHits, children }: {
  streak: number
  totalHits: number
  children: React.ReactNode
}) {
  const isPerfect = totalHits >= 30
  // Flamme sichtbar ab 5 Treffern in Folge
  if (streak < 5 && !isPerfect) return <>{children}</>

  // Intensität 0..1 basierend auf Streak (1-30)
  const intensity = Math.min(streak / 30, 1)
  // Flammen-Größe: von klein (20px) bis riesig (100px)
  const flameHeight = 20 + intensity * 80
  // Anzahl Flammenpartikel: 1 bei niedrig, bis 7 bei max
  const particleCount = Math.min(1 + Math.floor(streak / 4), 7)
  // Farbe verschiebt sich: gelb → orange → rot → weiß-blau (bei 30)
  const getFlameColor = (i: number) => {
    if (isPerfect) return i % 2 === 0 ? '#fff' : '#60a5fa'
    if (streak >= 20) return ['#ef4444', '#ff6b35', '#fbbf24'][i % 3]
    if (streak >= 10) return ['#f97316', '#fbbf24', '#ef4444'][i % 3]
    if (streak >= 5) return ['#fbbf24', '#f97316'][i % 2]
    return '#fbbf24'
  }

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      {/* Flammen-Container über dem Score */}
      <div style={{
        position: 'absolute',
        bottom: '100%',
        left: '50%',
        transform: 'translateX(-50%)',
        width: 60 + intensity * 80,
        height: flameHeight,
        pointerEvents: 'none',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-end',
        overflow: 'visible',
      }}>
        {Array.from({ length: particleCount }).map((_, i) => {
          const offset = (i - (particleCount - 1) / 2) * (8 + intensity * 6)
          const h = flameHeight * (0.5 + Math.random() * 0.5)
          const w = 10 + intensity * 14
          const delay = i * 0.08
          const color = getFlameColor(i)
          return (
            <div
              key={i}
              style={{
                position: 'absolute',
                bottom: 0,
                left: `calc(50% + ${offset}px)`,
                width: w,
                height: h,
                borderRadius: '50% 50% 50% 50% / 60% 60% 40% 40%',
                background: `radial-gradient(ellipse at bottom, ${color}, transparent 70%)`,
                opacity: 0.7 + intensity * 0.3,
                animation: `opFlame ${0.3 + Math.random() * 0.2}s ease-in-out infinite alternate`,
                animationDelay: `${delay}s`,
                filter: `blur(${1 + intensity * 2}px)`,
              }}
            />
          )
        })}
      </div>

      {/* Glow auf dem Score */}
      <div style={{
        textShadow: isPerfect
          ? '0 0 30px #60a5fa, 0 0 60px #3b82f6, 0 0 90px #60a5fa'
          : `0 0 ${8 + intensity * 20}px rgba(255, ${Math.round(180 - intensity * 120)}, 0, ${0.4 + intensity * 0.5})`,
        animation: isPerfect ? 'opPerfectPulse 0.5s ease-in-out infinite alternate' : undefined,
      }}>
        {children}
      </div>

      {/* Streak-Badge */}
      {streak >= 3 && !isPerfect && (
        <div style={{
          textAlign: 'center', fontSize: 12, fontWeight: 600,
          color: streak >= 20 ? '#ef4444' : streak >= 10 ? '#ff6400' : '#ffa500',
          marginTop: 4,
          animation: streak >= 15 ? 'opStreakPulse 0.6s ease-in-out infinite alternate' : undefined,
        }}>
          {streak >= 20 ? '🔥🔥🔥' : streak >= 10 ? '🔥🔥' : '🔥'} {streak} Treffer in Folge!
        </div>
      )}

      {/* FEUERWERK bei 30/30 */}
      {isPerfect && <FireworkOverlay />}
    </div>
  )
}

function FireworkOverlay() {
  // 20 Partikel die in alle Richtungen fliegen
  const particles = useMemo(() =>
    Array.from({ length: 24 }).map((_, i) => ({
      angle: (i / 24) * 360,
      distance: 60 + Math.random() * 100,
      size: 4 + Math.random() * 6,
      color: ['#ef4444', '#fbbf24', '#22c55e', '#3b82f6', '#a855f7', '#ec4899', '#f97316', '#fff'][i % 8],
      delay: Math.random() * 0.3,
      duration: 0.8 + Math.random() * 0.6,
    })), [])

  return (
    <div style={{
      position: 'absolute',
      top: '50%', left: '50%',
      transform: 'translate(-50%, -50%)',
      width: 0, height: 0,
      pointerEvents: 'none',
      zIndex: 100,
    }}>
      {particles.map((p, i) => {
        const rad = (p.angle * Math.PI) / 180
        const tx = Math.cos(rad) * p.distance
        const ty = Math.sin(rad) * p.distance
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              width: p.size,
              height: p.size,
              borderRadius: '50%',
              background: p.color,
              boxShadow: `0 0 ${p.size * 2}px ${p.color}`,
              animation: `opFirework ${p.duration}s ease-out ${p.delay}s both`,
              '--fw-tx': `${tx}px`,
              '--fw-ty': `${ty}px`,
            } as React.CSSProperties}
          />
        )
      })}
      {/* Perfekt-Text */}
      <div style={{
        position: 'absolute',
        top: -80,
        left: '50%',
        transform: 'translateX(-50%)',
        fontSize: 28,
        fontWeight: 900,
        color: '#fbbf24',
        textShadow: '0 0 20px #f97316, 0 0 40px #ef4444',
        whiteSpace: 'nowrap',
        animation: 'opPerfectText 1.5s ease-out both',
      }}>
        PERFEKT! 30/30
      </div>
    </div>
  )
}

// ===== Dart-Kurzformat fuer Verlauf und Indikatoren =====

function formatDartShort(hitType: HitType, isBull: boolean): string {
  switch (hitType) {
    case 'NO_SCORE': return '0'
    case 'SINGLE': return isBull ? 'SB' : 'S'
    case 'DOUBLE': return isBull ? 'DB' : 'D'
    case 'TRIPLE': return 'T'
    case 'SINGLE_BULL': return 'SB'
    case 'DOUBLE_BULL': return 'DB'
    default: return '?'
  }
}

function formatDartLabel(hitType: HitType, isBull: boolean, targetLabel: string): string {
  switch (hitType) {
    case 'NO_SCORE': return '0'
    case 'SINGLE': return isBull ? 'SB' : targetLabel
    case 'DOUBLE': return isBull ? 'DB' : `D${targetLabel}`
    case 'TRIPLE': return `T${targetLabel}`
    case 'SINGLE_BULL': return 'SB'
    case 'DOUBLE_BULL': return 'DB'
    default: return '?'
  }
}

// ===== Live Dart-Indikatoren =====

function LiveDartIndicators({ playerLegState, dartsThrown, targetLabel, isBullTarget, colors: c }: {
  playerLegState: import('../types/operation').OperationPlayerLegState
  dartsThrown: number
  targetLabel: string
  isBullTarget: boolean
  colors: { textBright: string; textDim: string; border: string; green: string; red: string; accent: string; cardBg: string }
}) {
  // Welche Darts im aktuellen Turn?
  const dartsInTurn = dartsThrown % 3
  const turnStart = dartsThrown - dartsInTurn
  // Wieviele Darts hat dieser Turn maximal? (letzter Turn kann weniger als 3 haben)
  const remaining = 30 - turnStart
  const turnSize = Math.min(3, remaining)

  const indicators: React.ReactNode[] = []
  for (let i = 0; i < 3; i++) {
    if (i >= turnSize) {
      // Dieser Pfeil existiert nicht (letzter Turn hat weniger als 3)
      indicators.push(
        <div key={i} style={{
          width: 48, height: 48, borderRadius: 8,
          border: `2px dashed ${c.border}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          opacity: 0.3,
        }}>
          <span style={{ fontSize: 16, color: c.textDim }}>–</span>
        </div>
      )
    } else if (i < dartsInTurn) {
      // Bereits geworfen — zeige Ergebnis
      const dartEvent = playerLegState.events[turnStart + i]
      const isHit = dartEvent && dartEvent.hitType !== 'NO_SCORE'
      const label = dartEvent ? formatDartLabel(dartEvent.hitType, isBullTarget, targetLabel) : '?'
      indicators.push(
        <div key={i} style={{
          width: 48, height: 48, borderRadius: 8,
          border: `2px solid ${isHit ? c.green : c.red}`,
          background: isHit ? c.green + '18' : c.red + '18',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'all 0.2s ease',
          animation: 'dartPop 0.3s ease-out',
        }}>
          <span style={{
            fontSize: label.length > 2 ? 13 : 16,
            fontWeight: 700,
            color: isHit ? c.green : c.red,
          }}>
            {label}
          </span>
        </div>
      )
    } else {
      // Noch nicht geworfen — leerer Slot
      indicators.push(
        <div key={i} style={{
          width: 48, height: 48, borderRadius: 8,
          border: `2px solid ${c.border}`,
          background: c.cardBg,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <span style={{ fontSize: 18, color: c.textDim, opacity: 0.4 }}>🎯</span>
        </div>
      )
    }
  }

  return (
    <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
      {indicators}
    </div>
  )
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
  onExit: () => void
  onShowSummary: (matchId: string) => void
  multiplayer?: MultiplayerProp
}

export default function GameOperation({ matchId, onExit, onShowSummary, multiplayer }: Props) {
  useDisableScale()
  const { c, isArcade, colors } = useGameColors()

  const storedMatch = getOperationMatchById(matchId)
  const [events, setEvents] = useState<OperationEvent[]>(storedMatch?.events ?? [])

  // Leg-Summary Modal
  const [showLegSummary, setShowLegSummary] = useState(false)

  // Match-End delay
  const [matchEndDelay, setMatchEndDelay] = useState(false)
  const [saving, setSaving] = useState(false)

  // Animation: Hit/Miss Flash
  const [hitFlash, setHitFlash] = useState<{ type: 'hit' | 'miss'; key: number } | null>(null)

  // Delta-Animation fuer Punkte
  const [deltaFlash, setDeltaFlash] = useState<{ value: number; key: number } | null>(null)

  // State aus Events ableiten
  const state = useMemo(() => applyOperationEvents(events), [events])

  // Shared game state: pause, timer, speech/mute, visibility
  const { gamePaused, setGamePaused, muted, setMuted, elapsedMs, setElapsedMs } = useGameState({
    matchId,
    mode: 'operation',
    finished: state.isComplete || showLegSummary,
  })

  const players = state.match?.players ?? []
  const activePlayerId = getActivePlayerId(state)
  const activePlayer = players.find(p => p.playerId === activePlayerId)
  const currentLeg = getCurrentLeg(state)

  // Aktiver Spieler-State im aktuellen Leg
  const activePlayerLegState = useMemo(() => {
    if (!currentLeg || !activePlayerId) return null
    return currentLeg.players.find(p => p.playerId === activePlayerId) ?? null
  }, [currentLeg, activePlayerId])

  // Darts-Info
  const dartsRemaining = activePlayerId ? getDartsRemaining(state, activePlayerId) : 0
  const dartsInTurnRemaining = activePlayerId ? getDartsInTurnRemaining(state, activePlayerId) : 0
  const dartsThrown = activePlayerLegState?.dartsThrown ?? 0
  const turnIndex = getCurrentTurnIndex(dartsThrown)
  const dartInTurn = getCurrentDartInTurn(dartsThrown)

  // Zielfeld-Info
  const isBullTarget = currentLeg?.targetMode === 'BULL'
  const targetNumber = currentLeg?.targetNumber
  const targetLabel = isBullTarget ? 'Bull' : `${targetNumber ?? '?'}`

  // Multiplayer: Remote-Events synchronisieren
  useEffect(() => {
    if (!multiplayer?.remoteEvents) return
    const remote = multiplayer.remoteEvents as OperationEvent[]
    setEvents(remote)
    persistOperationEvents(matchId, remote)
    const lastEvt = remote[remote.length - 1]
    if (lastEvt?.type === 'OperationMatchFinished') {
      finishOperationMatch(matchId, lastEvt.winnerId, lastEvt.durationMs, lastEvt.finalScores, lastEvt.legWins)
    }
    // Ensure match exists locally for guest
    if (remote.length > 0) {
      const startEvt = remote.find((e: any) => e.type === 'OperationMatchStarted') as any
      if (startEvt) {
        ensureOperationMatchExists(matchId, remote, startEvt.players?.map((p: any) => p.playerId) ?? [])
      }
    }
  }, [multiplayer?.remoteEvents]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-Start: Ersten Leg starten falls noch keiner existiert
  useEffect(() => {
    if (!state.match) return
    if (state.legs.length > 0) return // Leg existiert bereits

    const config = state.match.config
    const legStartEvent = startNewLeg(state, config.targetMode, config.targetNumber)
    const updatedEvents = [...events, legStartEvent]
    setEvents(updatedEvents)
    persistOperationEvents(matchId, updatedEvents)
  }, [state.match, state.legs.length]) // eslint-disable-line react-hooks/exhaustive-deps

  // Zeige Leg-Summary wenn Leg gerade fertig geworden ist (und Match nicht fertig)
  useEffect(() => {
    if (!currentLeg) return
    if (currentLeg.isComplete && !state.isComplete && !showLegSummary && !matchEndDelay) {
      setShowLegSummary(true)
    }
  }, [currentLeg?.isComplete, state.isComplete, showLegSummary, matchEndDelay]) // eslint-disable-line react-hooks/exhaustive-deps

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

  // Dart aufnehmen
  const recordDart = useCallback((hitType: HitType) => {
    if (gamePaused || state.isComplete || matchEndDelay || showLegSummary) return
    if (!activePlayerId || !state.match) return

    const result: OperationDartResult = recordOperationDart(state, activePlayerId, hitType)

    // Triple 20 Sound
    if (hitType === 'TRIPLE' && targetNumber === 20) playTriple20Sound()

    const newEvents: OperationEvent[] = [result.dartEvent]

    // Punkte-Animation + Streak-Sound
    const points = result.dartEvent.points
    if (points > 0) {
      setHitFlash({ type: 'hit', key: Date.now() })
      setDeltaFlash({ value: points, key: Date.now() })
      // Streak-Sound: aktueller Streak + 1 (da State noch nicht aktualisiert)
      const newStreak = (activePlayerLegState?.currentHitStreak ?? 0) + 1
      const newTotalHits = activePlayerLegState
        ? activePlayerLegState.dartsThrown - activePlayerLegState.noScoreCount + 1
        : 1
      playOperationStreakSound(newTotalHits >= 30 ? 30 : newStreak)
    } else {
      setHitFlash({ type: 'miss', key: Date.now() })
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

    // Speech: Turn-Ende → erst Hits ansagen, dann nächsten Spieler
    const newDartsCount = dartsThrown + 1
    const turnComplete = newDartsCount % 3 === 0 || newDartsCount >= DARTS_PER_LEG

    if (turnComplete) {
      // Gewichtete Treffer berechnen (inkl. gerade geworfenem Dart)
      const turnSize = newDartsCount >= DARTS_PER_LEG
        ? newDartsCount - (Math.floor((newDartsCount - 1) / 3) * 3)
        : 3
      const prevTurnDarts = (activePlayerLegState?.events ?? []).slice(-(turnSize - 1))
      const allHitTypes = [...prevTurnDarts.map(d => d.hitType), hitType]
      let hits = 0
      for (const ht of allHitTypes) {
        switch (ht) {
          case 'SINGLE': hits += 1; break
          case 'DOUBLE': hits += 2; break
          case 'TRIPLE': hits += 3; break
          case 'SINGLE_BULL': hits += 1; break
          case 'DOUBLE_BULL': hits += 2; break
        }
      }
      // 1) Treffer ansagen
      announceOperationHits(hits)

      // 2) Danach: nächsten Spieler ansagen (oder "Letzte Runde")
      if (!result.legFinished && !result.matchFinished) {
        const newState = applyOperationEvents(updatedEvents)
        const nextPlayerId = getActivePlayerId(newState)
        if (nextPlayerId) {
          const nextPlayer = players.find(p => p.playerId === nextPlayerId)
          // Letzte Runde ansagen wenn nächster Turn = 10
          const nextLeg = getCurrentLeg(newState)
          const nextPs = nextLeg?.players.find(p => p.playerId === nextPlayerId)
          const nextTurnIdx = nextPs ? getCurrentTurnIndex(nextPs.dartsThrown) : 0
          if (nextTurnIdx === 10 && nextPs && nextPs.dartsThrown % 3 === 0) {
            announceOperationLastRound()
          }
          if (nextPlayer) {
            debouncedAnnounce(() => announceOperationNextPlayer(nextPlayer.name))
          }
        }
      }
    }

    // Match beendet?
    if (result.matchFinished) {
      setMatchEndDelay(true)
      // Persist + finish — navigate to summary regardless of DB success
      setSaving(true)
      ;(async () => {
        try {
          await persistOperationEvents(matchId, updatedEvents)
          await finishOperationMatch(
            matchId,
            result.matchFinished!.winnerId,
            elapsedMs,
            result.matchFinished!.finalScores,
            result.matchFinished!.legWins
          )
        } catch (err) {
          console.warn('[Operation] Persist failed, continuing to summary:', err)
        } finally {
          setSaving(false)
        }
      })()
    } else {
      persistOperationEvents(matchId, updatedEvents)
    }
  }, [events, state, activePlayerId, activePlayerLegState, dartsThrown, players, gamePaused, matchEndDelay, showLegSummary, matchId, elapsedMs, onShowSummary, multiplayer])

  // Undo: Letztes Dart-Event entfernen
  const undoLast = useCallback(() => {
    if (gamePaused || state.isComplete || matchEndDelay || showLegSummary) return
    if (events.length <= 1) return // Mindestens MatchStarted behalten

    // Ausstehende Sprachansagen abbrechen
    cancelDebouncedAnnounce()

    // Finde letztes OperationDart Event und entferne alles ab dort
    let cutIndex = events.length
    for (let i = events.length - 1; i >= 0; i--) {
      if (events[i].type === 'OperationDart') {
        cutIndex = i
        break
      }
    }

    if (cutIndex === events.length) return

    // Entferne auch automatisch generierte Events danach (LegFinished, MatchFinished)
    const trimmed = events.slice(0, cutIndex)
    setEvents(trimmed)
    persistOperationEvents(matchId, trimmed)
    setDeltaFlash(null)
    setHitFlash(null)

    // Multiplayer: Undo senden
    if (multiplayer?.enabled) {
      multiplayer.undo(events.length - cutIndex)
    }
  }, [events, gamePaused, state.isComplete, matchEndDelay, showLegSummary, matchId, multiplayer])

  // Naechstes Leg starten (aus dem LegSummary Modal)
  const handleStartNextLeg = useCallback((targetMode: typeof state.match extends null ? never : NonNullable<typeof state.match>['config']['targetMode'], targetNumber?: number) => {
    if (!state.match) return

    const legStartEvent = startNewLeg(state, targetMode, targetNumber)
    const updatedEvents = [...events, legStartEvent]
    setEvents(updatedEvents)
    persistOperationEvents(matchId, updatedEvents)
    setShowLegSummary(false)
  }, [events, state, matchId])

  // Tastatur-Steuerung
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (showLegSummary) return // Im Modal keine Tastenkuerzel
      if (gamePaused && e.key !== 'Escape') return
      if (state.isComplete || matchEndDelay) return

      const key = e.key.toUpperCase()

      switch (key) {
        case '0':
          e.preventDefault()
          recordDart('NO_SCORE')
          break
        case '1':
        case 'S':
          e.preventDefault()
          if (isBullTarget) {
            recordDart('SINGLE_BULL')
          } else {
            recordDart('SINGLE')
          }
          break
        case '2':
        case 'D':
          e.preventDefault()
          if (isBullTarget) {
            recordDart('DOUBLE_BULL')
          } else {
            recordDart('DOUBLE')
          }
          break
        case '3':
        case 'T':
          e.preventDefault()
          if (!isBullTarget) {
            recordDart('TRIPLE')
          }
          break
        case 'BACKSPACE':
          e.preventDefault()
          undoLast()
          break
        case 'ESCAPE':
          e.preventDefault()
          setGamePaused(p => !p)
          break
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [recordDart, undoLast, gamePaused, state.isComplete, matchEndDelay, showLegSummary, isBullTarget])

  // Pause-Handler
  const handlePause = () => {
    setGamePaused(true)
    setMatchPaused(matchId, 'operation', true)
    setMatchElapsedTime(matchId, 'operation', elapsedMs)
  }

  const handleResume = () => setGamePaused(false)

  const handleExitMatch = () => {
    setMatchElapsedTime(matchId, 'operation', elapsedMs)
    setMatchPaused(matchId, 'operation', true)
    onExit()
  }

  const handleDeleteMatch = () => {
    deleteOperationMatch(matchId)
    onExit()
  }

  // Profil-basierte Spielerfarben (wie andere Games)
  const profiles = useMemo(() => getProfiles(), [])
  const playerColors = useMemo(() => {
    const colorMap: Record<string, string> = {}
    players.forEach((p, idx) => {
      const profile = profiles.find(pr => pr.id === p.playerId)
      colorMap[p.playerId] = profile?.color ?? PLAYER_COLORS[idx % PLAYER_COLORS.length]
    })
    return colorMap
  }, [players, profiles])

  const activePlayerIndex = players.findIndex(p => p.playerId === activePlayerId)
  const playerColor = activePlayerId
    ? playerColors[activePlayerId] ?? PLAYER_COLORS[activePlayerIndex % PLAYER_COLORS.length]
    : c.accent

  const playerColorBgEnabled = getPlayerColorBackgroundEnabled()

  const isMulti = players.length > 1

  // Sidebar-Reihenfolge: naechster Spieler oben
  const sidebarPlayers = useMemo(() => {
    if (!isMulti || !currentLeg) return []
    const count = players.length
    const result: { player: typeof players[0]; index: number }[] = []
    for (let offset = 1; offset < count; offset++) {
      const idx = (currentLeg.currentPlayerIndex + offset) % count
      result.push({ player: players[idx], index: idx })
    }
    return result
  }, [players, currentLeg?.currentPlayerIndex, isMulti]) // eslint-disable-line react-hooks/exhaustive-deps

  // Speech: "Game On" bei Match-Start + erster Spieler
  const gameStartAnnouncedRef = useRef(false)
  useEffect(() => {
    if (!currentLeg || !activePlayer || gameStartAnnouncedRef.current) return
    if (currentLeg.legIndex === 0 && dartsThrown === 0) {
      gameStartAnnouncedRef.current = true
      announceOperationGameStart(activePlayer.name)
    }
  }, [currentLeg, activePlayer, dartsThrown])

  // Speech-Ansagen nach Turn-Ende werden direkt in recordDart() gemacht
  // (korrekte Reihenfolge: erst Hits, dann Spielername)

  // Aktiver Spieler Hit Score im aktuellen Leg
  const activeScore = activePlayerLegState?.hitScore ?? 0
  const activeStreak = activePlayerLegState?.currentHitStreak ?? 0
  const totalHits = activePlayerLegState
    ? activePlayerLegState.dartsThrown - activePlayerLegState.noScoreCount
    : 0

  // Hit-Type Label
  const hitTypeLabel = (ht: HitType): string => {
    switch (ht) {
      case 'NO_SCORE': return 'Daneben'
      case 'SINGLE': return 'Single'
      case 'DOUBLE': return 'Double'
      case 'TRIPLE': return 'Triple'
      case 'SINGLE_BULL': return 'Single Bull'
      case 'DOUBLE_BULL': return 'Double Bull'
      default: return '?'
    }
  }

  // Aufnahmen aller Spieler gruppiert (fuer Multi-Spalten-Verlauf)
  type TurnData = { turnIndex: number; darts: import('../types/operation').OperationDartEvent[]; totalPoints: number }

  const allPlayerTurns = useMemo(() => {
    if (!currentLeg) return new Map<string, TurnData[]>()
    const result = new Map<string, TurnData[]>()
    for (const ps of currentLeg.players) {
      const turns: TurnData[] = []
      for (let i = 0; i < ps.events.length; i += 3) {
        const chunk = ps.events.slice(i, Math.min(i + 3, ps.events.length))
        const totalPoints = chunk.reduce((sum, d) => sum + d.points, 0)
        turns.push({ turnIndex: chunk[0].turnIndex, darts: chunk, totalPoints })
      }
      result.set(ps.playerId, turns)
    }
    return result
  }, [currentLeg])

  // Maximale Turn-Anzahl (fuer Zeilen)
  const maxTurnCount = useMemo(() => {
    let max = 0
    allPlayerTurns.forEach(turns => { if (turns.length > max) max = turns.length })
    return max
  }, [allPlayerTurns])

  // Animation-Reset
  useEffect(() => {
    if (!hitFlash) return
    const t = setTimeout(() => setHitFlash(null), 500)
    return () => clearTimeout(t)
  }, [hitFlash])

  // Flash-Stil fuer Score
  const scoreFlashStyle: React.CSSProperties = hitFlash
    ? hitFlash.type === 'hit'
      ? { animation: 'hitGreen 0.4s ease-out' }
      : { animation: 'missShake 0.4s ease-out' }
    : {}

  return (
    <div style={{
      background: playerColorBgEnabled && activePlayerId
        ? `linear-gradient(180deg, ${playerColor}20 0%, ${playerColor}05 100%)`
        : c.bg,
      minHeight: '100dvh', color: c.textBright,
      transition: 'background 0.5s ease',
    }}>
      {/* Pause Overlay */}
      {gamePaused && (
        <PauseOverlay onResume={handleResume} />
      )}

      {/* Leg-Summary Modal */}
      {showLegSummary && currentLeg && state.match && (
        <OperationLegSummary
          legState={currentLeg}
          players={state.match.players}
          legIndex={currentLeg.legIndex}
          totalLegs={state.match.config.legsCount}
          targetMode={state.match.config.targetMode}
          onNextLeg={(targetNumber) => handleStartNextLeg(state.match!.config.targetMode, targetNumber)}
        />
      )}

      {/* Header: Operation + Timer + Controls */}
      <div style={{
        display: 'flex', justifyContent: 'center',
        borderBottom: `1px solid ${c.border}`,
      }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '8px 12px',
          width: isMulti ? 600 : 440,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 13, color: c.textDim }}>Operation: Ein Feld, keine Gnade</span>
            <span style={{ fontSize: 13, fontFamily: 'monospace', color: c.textDim }}>
              {formatDuration(elapsedMs)}
            </span>
            {state.match!.config.legsCount > 1 && (
              <span style={{ fontSize: 11, color: c.textDim }}>
                First to {Math.ceil(state.match!.config.legsCount / 2)} · Leg {(state.currentLegIndex + 1)}
              </span>
            )}
          </div>
          <GameControls
            isPaused={gamePaused}
            onTogglePause={() => {
              if (gamePaused) handleResume()
              else handlePause()
            }}
            isMuted={muted}
            onToggleMute={() => setMuted(m => !m)}
            onExit={handleExitMatch}
            title="Operation: Ein Feld, keine Gnade"
          />
        </div>
      </div>

      {/* Layout: zentrierte Gruppe aus Content + Sidebar */}
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        minHeight: 'calc(100dvh - 50px)',
      }}>
        {/* Haupt-Content */}
        <div style={{
          width: 440,
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          padding: '16px 12px', gap: 14,
        }}>
          {/* Aktueller Spieler (immer sichtbar) */}
          {activePlayer && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <div style={{
                width: 12, height: 12, borderRadius: '50%',
                background: playerColor,
              }} />
              <div style={{ fontSize: 22, fontWeight: 800, color: playerColor }}>
                {activePlayer.name}
              </div>
            </div>
          )}

          {/* Target-Anzeige */}
          {currentLeg && !currentLeg.isComplete && (
            <div style={{
              background: c.cardBg, border: `2px solid ${c.accent}`,
              borderRadius: 12, padding: '12px 32px', textAlign: 'center',
              minWidth: 180,
            }}>
              <div style={{ fontSize: 11, color: c.textDim, marginBottom: 2, textTransform: 'uppercase', letterSpacing: 1 }}>
                Ziel
              </div>
              <div style={{ fontSize: 42, fontWeight: 800, color: c.accent }}>
                {targetLabel}
              </div>
            </div>
          )}

          {/* Score gross mit Flammen-Effekt (~20% groesser) */}
          {!currentLeg?.isComplete && (
            <div style={{ position: 'relative', ...scoreFlashStyle, paddingTop: 20 + Math.min(activeStreak / 30, 1) * 80 }}>
              <OperationFlame streak={activeStreak} totalHits={totalHits}>
                <div style={{
                  fontSize: 72, fontWeight: 800, color: playerColor,
                  lineHeight: 1,
                }}>
                  {activeScore}
                </div>
              </OperationFlame>

              {/* Delta-Animation */}
              {deltaFlash && (
                <div key={deltaFlash.key} style={{
                  position: 'absolute', top: -8, right: -70,
                  fontSize: 28, fontWeight: 700,
                  color: c.green,
                  animation: 'fadeUp 1.5s forwards',
                }}>
                  +{deltaFlash.value}
                </div>
              )}
            </div>
          )}

          {/* Live Dart-Anzeige: 3 Pfeile im aktuellen Turn */}
          {currentLeg && !currentLeg.isComplete && activePlayerLegState && (
            <LiveDartIndicators
              playerLegState={activePlayerLegState}
              dartsThrown={dartsThrown}
              targetLabel={targetLabel}
              isBullTarget={!!isBullTarget}
              colors={c}
            />
          )}

          {/* Fortschrittsbalken: Darts 0-30 */}
          {currentLeg && !currentLeg.isComplete && activePlayerLegState && (
            <div style={{ width: '100%', maxWidth: 440 }}>
              <div style={{
                display: 'flex', justifyContent: 'space-between', fontSize: 11,
                color: c.textDim, marginBottom: 4,
              }}>
                <span>Dart {dartsThrown}/{DARTS_PER_LEG}</span>
                <span>Turn {turnIndex}/10</span>
              </div>
              <div style={{
                width: '100%', height: 8, borderRadius: 4,
                background: c.border, overflow: 'hidden',
              }}>
                <div style={{
                  width: `${(dartsThrown / DARTS_PER_LEG) * 100}%`,
                  height: '100%', borderRadius: 4,
                  background: dartsThrown >= 27
                    ? c.red
                    : dartsThrown >= 18
                      ? '#f59e0b'
                      : c.accent,
                  transition: 'width 0.3s ease, background 0.3s ease',
                }} />
              </div>
            </div>
          )}

          {/* Match beendet */}
          {(state.isComplete || matchEndDelay) && (
            <div style={{
              background: c.cardBg, border: `2px solid ${c.green}`,
              borderRadius: 12, padding: '16px 24px', textAlign: 'center',
            }}>
              <div style={{ fontSize: 24, fontWeight: 700, color: c.green }}>
                Geschafft!
              </div>
              {saving && (
                <div style={{ fontSize: 13, color: c.textDim, marginTop: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                  <span style={{ display: 'inline-block', width: 14, height: 14, border: '2px solid currentColor', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                  Speichern...
                </div>
              )}
              <button
                onClick={() => onShowSummary(matchId)}
                style={{
                  marginTop: 12, padding: '10px 24px', borderRadius: 8,
                  background: c.green, color: '#fff', border: 'none',
                  fontWeight: 700, fontSize: 16, cursor: 'pointer',
                }}
              >
                Ergebnis anzeigen
              </button>
            </div>
          )}

          {/* Hit-Type Input Buttons */}
          {currentLeg && !currentLeg.isComplete && !matchEndDelay && activePlayerId && (
            <div style={{ width: '100%', maxWidth: 440 }}>
              {isBullTarget ? (
                // Bull: 3 Buttons
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => recordDart('NO_SCORE')}
                    style={{
                      flex: 1, padding: '18px 0', fontSize: 16, fontWeight: 700,
                      background: c.red + '20', border: `2px solid ${c.red}`,
                      color: c.red, borderRadius: 12, cursor: 'pointer',
                      touchAction: 'manipulation',
                    }}
                  >
                    Daneben
                  </button>
                  <button
                    onClick={() => recordDart('SINGLE_BULL')}
                    style={{
                      flex: 1, padding: '18px 0', fontSize: 16, fontWeight: 700,
                      background: c.green + '20', border: `2px solid ${c.green}`,
                      color: c.green, borderRadius: 12, cursor: 'pointer',
                      touchAction: 'manipulation',
                    }}
                  >
                    Single Bull
                    <div style={{ fontSize: 11, fontWeight: 400, opacity: 0.7 }}>25</div>
                  </button>
                  <button
                    onClick={() => recordDart('DOUBLE_BULL')}
                    style={{
                      flex: 1, padding: '18px 0', fontSize: 16, fontWeight: 700,
                      background: c.accent + '20', border: `2px solid ${c.accent}`,
                      color: c.accent, borderRadius: 12, cursor: 'pointer',
                      touchAction: 'manipulation',
                    }}
                  >
                    Double Bull
                    <div style={{ fontSize: 11, fontWeight: 400, opacity: 0.7 }}>50</div>
                  </button>
                </div>
              ) : (
                // Zahlen: 4 Buttons
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => recordDart('NO_SCORE')}
                    style={{
                      flex: 1, padding: '18px 0', fontSize: 16, fontWeight: 700,
                      background: c.red + '20', border: `2px solid ${c.red}`,
                      color: c.red, borderRadius: 12, cursor: 'pointer',
                      touchAction: 'manipulation',
                    }}
                  >
                    Daneben
                    <div style={{ fontSize: 11, fontWeight: 400, opacity: 0.7 }}>0</div>
                  </button>
                  <button
                    onClick={() => recordDart('SINGLE')}
                    style={{
                      flex: 1, padding: '18px 0', fontSize: 16, fontWeight: 700,
                      background: c.green + '20', border: `2px solid ${c.green}`,
                      color: c.green, borderRadius: 12, cursor: 'pointer',
                      touchAction: 'manipulation',
                    }}
                  >
                    Single
                    <div style={{ fontSize: 11, fontWeight: 400, opacity: 0.7 }}>{targetNumber}</div>
                  </button>
                  <button
                    onClick={() => recordDart('DOUBLE')}
                    style={{
                      flex: 1, padding: '18px 0', fontSize: 16, fontWeight: 700,
                      background: c.accent + '20', border: `2px solid ${c.accent}`,
                      color: c.accent, borderRadius: 12, cursor: 'pointer',
                      touchAction: 'manipulation',
                    }}
                  >
                    Double
                    <div style={{ fontSize: 11, fontWeight: 400, opacity: 0.7 }}>{(targetNumber ?? 0) * 2}</div>
                  </button>
                  <button
                    onClick={() => recordDart('TRIPLE')}
                    style={{
                      flex: 1, padding: '18px 0', fontSize: 16, fontWeight: 700,
                      background: '#a855f7' + '20', border: '2px solid #a855f7',
                      color: '#a855f7', borderRadius: 12, cursor: 'pointer',
                      touchAction: 'manipulation',
                    }}
                  >
                    Triple
                    <div style={{ fontSize: 11, fontWeight: 400, opacity: 0.7 }}>{(targetNumber ?? 0) * 3}</div>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Undo Button */}
          {!state.isComplete && !matchEndDelay && !showLegSummary && events.length > 2 && (
            <button
              onClick={undoLast}
              style={{
                padding: '6px 16px', fontSize: 12,
                background: 'transparent', border: `1px solid ${c.border}`,
                color: c.textDim, borderRadius: 6, cursor: 'pointer',
              }}
            >
              Undo
            </button>
          )}

          {/* Verlauf: Multi-Spalten (Spieler nebeneinander) oder Solo */}
          {maxTurnCount > 0 && currentLeg && (
            <div style={{
              width: '100%', maxWidth: isMulti ? 600 : 440, background: c.cardBg,
              borderRadius: 8, border: `1px solid ${c.border}`,
              overflow: 'hidden',
            }}>
              <div style={{
                padding: '6px 10px', fontSize: 11, fontWeight: 600,
                color: c.textDim, borderBottom: `1px solid ${c.border}`,
              }}>
                Verlauf
              </div>
              <div style={{ maxHeight: 320, overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${c.border}` }}>
                      <th style={{ textAlign: 'center', padding: '4px 6px', color: c.textDim, width: 32 }}>#</th>
                      {players.map((p, idx) => {
                        const pColor = playerColors[p.playerId] ?? PLAYER_COLORS[idx % PLAYER_COLORS.length]
                        return (
                          <th key={p.playerId} style={{
                            textAlign: 'center', padding: '4px 6px',
                            color: pColor, fontWeight: 700,
                            borderLeft: idx > 0 ? `1px solid ${c.border}` : undefined,
                          }}>
                            {isMulti ? p.name : 'Aufnahme'}
                          </th>
                        )
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from({ length: maxTurnCount }).map((_, rowIdx) => (
                      <tr key={rowIdx} style={{ borderBottom: `1px solid ${c.border}` }}>
                        <td style={{ textAlign: 'center', padding: '4px 6px', color: c.textDim, fontWeight: 500 }}>
                          {rowIdx + 1}
                        </td>
                        {players.map((p, pIdx) => {
                          const pColor = playerColors[p.playerId] ?? PLAYER_COLORS[pIdx % PLAYER_COLORS.length]
                          const turns = allPlayerTurns.get(p.playerId) ?? []
                          const turn = turns[rowIdx]
                          if (!turn) {
                            return (
                              <td key={p.playerId} style={{
                                textAlign: 'center', padding: '4px 6px',
                                color: c.textDim, opacity: 0.3,
                                borderLeft: pIdx > 0 ? `1px solid ${c.border}` : undefined,
                              }}>
                                –
                              </td>
                            )
                          }
                          return (
                            <td key={p.playerId} style={{
                              textAlign: 'center', padding: '4px 6px',
                              borderLeft: pIdx > 0 ? `1px solid ${c.border}` : undefined,
                            }}>
                              <div style={{ display: 'flex', gap: 4, justifyContent: 'center', alignItems: 'center' }}>
                                {turn.darts.map((d, j) => (
                                  <span key={j} style={{
                                    fontWeight: 600, fontSize: 11,
                                    color: d.hitType === 'NO_SCORE' ? c.red : pColor,
                                  }}>
                                    {formatDartShort(d.hitType, isBullTarget)}
                                  </span>
                                ))}
                                <span style={{
                                  fontWeight: 700, fontSize: 11, marginLeft: 4,
                                  color: turn.totalPoints > 0 ? pColor : c.red,
                                  opacity: 0.8,
                                }}>
                                  {turn.totalPoints > 0 ? `+${turn.totalPoints}` : '0'}
                                </span>
                              </div>
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Hit-Type Zaehler (kompakte Uebersicht) */}
          {activePlayerLegState && activePlayerLegState.dartsThrown > 0 && !currentLeg?.isComplete && (
            <div style={{
              display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center',
              fontSize: 11, color: c.textDim,
            }}>
              {isBullTarget ? (
                <>
                  <span>SB: <strong style={{ color: c.green }}>{activePlayerLegState.singleBullCount}</strong></span>
                  <span>DB: <strong style={{ color: c.accent }}>{activePlayerLegState.doubleBullCount}</strong></span>
                  <span>Miss: <strong style={{ color: c.red }}>{activePlayerLegState.noScoreCount}</strong></span>
                </>
              ) : (
                <>
                  <span>S: <strong style={{ color: c.green }}>{activePlayerLegState.singleCount}</strong></span>
                  <span>D: <strong style={{ color: c.accent }}>{activePlayerLegState.doubleCount}</strong></span>
                  <span>T: <strong style={{ color: '#a855f7' }}>{activePlayerLegState.tripleCount}</strong></span>
                  <span>Miss: <strong style={{ color: c.red }}>{activePlayerLegState.noScoreCount}</strong></span>
                </>
              )}
              <span>|</span>
              <span>Treffer: <strong style={{ color: c.textBright }}>
                {activePlayerLegState.dartsThrown - activePlayerLegState.noScoreCount}/{activePlayerLegState.dartsThrown}
              </strong></span>
            </div>
          )}

          {/* Tastatur-Hinweis */}
          <div style={{ fontSize: 10, color: c.textDim, textAlign: 'center', opacity: 0.6, marginTop: 8 }}>
            {isBullTarget
              ? '0 = Daneben | 1/S = Single Bull | 2/D = Double Bull | Backspace = Undo | Esc = Pause'
              : '0 = Daneben | 1/S = Single | 2/D = Double | 3/T = Triple | Backspace = Undo | Esc = Pause'
            }
          </div>
        </div>

        {/* Spieler-Sidebar rechts (nur Multiplayer) */}
        {isMulti && (
          <div style={{
            width: 160,
            borderLeft: `1px solid ${c.border}`,
            padding: '12px 8px',
            display: 'flex',
            flexDirection: 'column',
            gap: 0,
            flexShrink: 0,
          }}>
            <div style={{
              fontSize: 10, fontWeight: 600, color: c.textDim,
              textTransform: 'uppercase', letterSpacing: 1,
              marginBottom: 8, textAlign: 'center',
            }}>
              Spieler
            </div>

            {sidebarPlayers.map(({ player: p, index: i }) => {
              const legPs = currentLeg?.players.find(lp => lp.playerId === p.playerId)
              const totals = state.totalsByPlayer[p.playerId]
              const color = playerColors[p.playerId] ?? PLAYER_COLORS[i % PLAYER_COLORS.length]
              const legHitScore = legPs?.hitScore ?? 0
              const totalHitScore = totals?.totalHitScore ?? 0
              const legsWon = totals?.legsWon ?? 0
              const isDone = legPs ? legPs.dartsThrown >= DARTS_PER_LEG : false

              return (
                <div key={p.playerId} style={{
                  padding: '8px 10px',
                  borderBottom: `1px solid ${c.border}`,
                  opacity: isDone ? 0.5 : 1,
                  transition: 'all 0.3s ease',
                }}>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    marginBottom: 2,
                  }}>
                    <div style={{
                      width: 8, height: 8, borderRadius: '50%',
                      background: color, flexShrink: 0,
                    }} />
                    <div style={{
                      fontSize: 13, fontWeight: 600, color: color,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {p.name}
                    </div>
                  </div>
                  <div style={{
                    fontSize: 22, fontWeight: 800, color: color,
                    paddingLeft: 14,
                  }}>
                    {legHitScore}
                  </div>
                  <div style={{
                    fontSize: 10, color: c.textDim,
                    paddingLeft: 14,
                  }}>
                    {isDone
                      ? 'Fertig'
                      : `Dart ${legPs?.dartsThrown ?? 0}/${DARTS_PER_LEG}`
                    }
                    {state.match!.config.legsCount > 1 && (
                      <span style={{ marginLeft: 6 }}>
                        ({legsWon}L / {totalHitScore + legHitScore} HS)
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* CSS Animationen */}
      <style>{`
        @keyframes fadeUp {
          0% { opacity: 1; transform: translateY(0); }
          100% { opacity: 0; transform: translateY(-30px); }
        }
        @keyframes hitGreen {
          0% { filter: brightness(1); }
          30% { filter: brightness(1.4) drop-shadow(0 0 8px rgba(34, 197, 94, 0.6)); }
          100% { filter: brightness(1); }
        }
        @keyframes missShake {
          0%, 100% { transform: translateX(0); }
          15% { transform: translateX(-6px); }
          30% { transform: translateX(6px); }
          45% { transform: translateX(-4px); }
          60% { transform: translateX(4px); }
          75% { transform: translateX(-2px); }
          90% { transform: translateX(2px); }
        }
        @keyframes opFlame {
          0% { transform: scaleY(1) scaleX(1) translateY(0); opacity: 0.7; }
          100% { transform: scaleY(1.15) scaleX(0.85) translateY(-6px); opacity: 0.9; }
        }
        @keyframes opStreakPulse {
          0% { transform: scale(1); }
          100% { transform: scale(1.08); }
        }
        @keyframes opPerfectPulse {
          0% { text-shadow: 0 0 20px #60a5fa, 0 0 40px #3b82f6; }
          100% { text-shadow: 0 0 40px #60a5fa, 0 0 80px #3b82f6, 0 0 120px #818cf8; }
        }
        @keyframes opFirework {
          0% { transform: translate(0, 0) scale(1); opacity: 1; }
          70% { opacity: 1; }
          100% { transform: translate(var(--fw-tx), var(--fw-ty)) scale(0); opacity: 0; }
        }
        @keyframes dartPop {
          0% { transform: scale(0.7); opacity: 0.5; }
          50% { transform: scale(1.1); }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes opPerfectText {
          0% { transform: translateX(-50%) scale(0.3); opacity: 0; }
          40% { transform: translateX(-50%) scale(1.2); opacity: 1; }
          60% { transform: translateX(-50%) scale(1); }
          100% { transform: translateX(-50%) scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  )
}
