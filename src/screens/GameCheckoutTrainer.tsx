// src/screens/GameCheckoutTrainer.tsx
// Checkout Trainer mit Schwierigkeitsstufen, Dart-fuer-Dart Eingabe und Mehrspieler

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useGameColors } from '../hooks/useGameState'
import {
  getCheckoutTrainerMatchById,
  persistCheckoutTrainerEvents,
  finishCheckoutTrainerMatch,
  createCheckoutTrainerMatchShell,
  getProfiles,
} from '../storage'
import {
  applyCheckoutTrainerEvents,
  generateCheckoutList,
  isDartDouble,
  id as ctId,
  now as ctNow,
  type CheckoutTrainerEvent,
  type ParsedDart,
  type ScoreRange,
} from '../dartsCheckoutTrainer'
import { useDisableScale } from '../components/ScaleWrapper'

// ===== Difficulty Levels =====

type DifficultyKey = 'beginner' | 'medium' | 'advanced' | 'pro' | 'mixed'

const DIFFICULTIES: { key: DifficultyKey; label: string; desc: string; range: ScoreRange }[] = [
  { key: 'beginner', label: 'Anfaenger', desc: '2-40 (1-Dart Finishes)', range: [2, 40] },
  { key: 'medium', label: 'Mittel', desc: '41-100 (2-Dart Setups)', range: [41, 100] },
  { key: 'advanced', label: 'Fortgeschritten', desc: '101-130 (3-Dart Checkouts)', range: [101, 130] },
  { key: 'pro', label: 'Profi', desc: '131-170 (Big Finishes)', range: [131, 170] },
  { key: 'mixed', label: 'Gemischt', desc: '2-170 (Alles)', range: [2, 170] },
]

// ===== Types =====

type Props = {
  matchId: string
  onExit: () => void
  onShowSummary: (matchId: string) => void
  /** Callback wenn ein neues Match erstellt wird (nach Spielerauswahl) */
  onMatchCreated?: (matchId: string) => void
}

type Phase = 'players' | 'difficulty' | 'playing' | 'summary'

type DartEntry = {
  input: string
  parsed: ParsedDart
}

type SelectedPlayer = {
  id: string
  name: string
  isGuest?: boolean
}

// ===== Helper: Format dart for display =====

function formatDart(dart: ParsedDart): string {
  if (dart.score === 0) return 'MISS'
  if (dart.bed === 'BULL' && dart.mult === 2) return 'DBULL'
  if (dart.bed === 'BULL' && dart.mult === 1) return 'BULL'
  const prefix = dart.mult === 1 ? 'S' : dart.mult === 2 ? 'D' : 'T'
  return `${prefix}${dart.bed}`
}

function genId(): string {
  return (Date.now().toString(36) + Math.random().toString(36).slice(2, 8)).toUpperCase()
}

const GUEST_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#14b8a6', '#f97316', '#84cc16']
const GUEST_NAMES = ['Blau', 'Gruen', 'Orange', 'Rot', 'Violett', 'Tuerkis', 'Amber', 'Lime']

const PLAYER_COLORS = [
  '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6',
  '#14b8a6', '#f97316', '#ec4899',
]

// ===== Component =====

export default function GameCheckoutTrainer({ matchId, onExit, onShowSummary, onMatchCreated }: Props) {
  useDisableScale()
  const { colors, isArcade } = useGameColors()

  // Wenn matchId === 'pending', sind wir in der Spielerauswahl-Phase
  const isPending = matchId === 'pending'

  const storedMatch = isPending ? null : getCheckoutTrainerMatchById(matchId)
  const [events, setEvents] = useState<CheckoutTrainerEvent[]>(storedMatch?.events ?? [])
  const [realMatchId, setRealMatchId] = useState(isPending ? '' : matchId)

  // State aus Events ableiten
  const state = useMemo(() => applyCheckoutTrainerEvents(events), [events])

  // Phase: players → difficulty → playing → summary
  const [phase, setPhase] = useState<Phase>(isPending ? 'players' : 'difficulty')
  const [scoreRange, setScoreRange] = useState<ScoreRange>([2, 170])

  // Spielerauswahl State
  const [selectedPlayers, setSelectedPlayers] = useState<SelectedPlayer[]>([])
  const [guests, setGuests] = useState<{ id: string; name: string; color: string }[]>([])

  // Pre-generated checkout list for current round
  const [checkoutList, setCheckoutList] = useState<{ score: number; route: string; darts: 1 | 2 | 3 }[]>([])

  // Dart-by-dart input state
  const [thrownDarts, setThrownDarts] = useState<DartEntry[]>([])
  const [remaining, setRemaining] = useState(0)
  const [isBust, setIsBust] = useState(false)

  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [flash, setFlash] = useState<'success' | 'fail' | null>(null)

  // Keyboard input: Multiplier prefix + number buffer (like Game.tsx)
  const [multiplier, setMultiplier] = useState<1 | 2 | 3>(1) // S=1, D=2, T=3
  const numBufferRef = useRef('')
  const numTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [displayBuffer, setDisplayBuffer] = useState('') // Was aktuell im "Eingabefeld" steht

  // Multiplayer: targetCount = 10 pro Spieler, also bei N Spielern: N * 10
  const playerCount = state.players.length || 1
  const isMultiplayer = playerCount > 1

  // Auto-Start: generate first checkout when entering playing phase
  useEffect(() => {
    if (phase !== 'playing') return
    if (state.finished) return
    if (state.currentTarget) return
    if (state.attemptIndex >= state.targetCount) return

    // Start the next checkout from our pre-generated list
    // Bei Multiplayer rotieren die Spieler, aber alle nutzen dieselbe Checkout-Liste
    // checkoutList Index = attemptIndex (fuer Multiplayer: geteilt durch playerCount)
    const checkoutIdx = isMultiplayer
      ? Math.floor(state.attemptIndex / playerCount)
      : state.attemptIndex
    if (checkoutIdx >= checkoutList.length) return

    const checkout = checkoutList[checkoutIdx]
    const attemptEvent: CheckoutTrainerEvent = {
      type: 'CheckoutAttemptStarted',
      eventId: ctId(),
      matchId: realMatchId,
      ts: ctNow(),
      targetScore: checkout.score,
      optimalRoute: checkout.route,
      optimalDarts: checkout.darts,
    }

    const updatedEvents = [...events, attemptEvent]
    setEvents(updatedEvents)
    persistCheckoutTrainerEvents(realMatchId, updatedEvents)
    setRemaining(checkout.score)
    setThrownDarts([])
    setDisplayBuffer('')
    setMultiplier(1)
    setIsBust(false)
  }, [phase, state.finished, state.currentTarget, state.attemptIndex, state.targetCount, realMatchId, checkoutList]) // eslint-disable-line react-hooks/exhaustive-deps

  // When currentTarget changes, reset remaining
  useEffect(() => {
    if (state.currentTarget) {
      setRemaining(state.currentTarget.score)
      setThrownDarts([])
      setDisplayBuffer('')
      setMultiplier(1)
      setIsBust(false)
    }
  }, [state.currentTarget?.score]) // eslint-disable-line react-hooks/exhaustive-deps

  // Start game with selected difficulty (after player selection)
  const handleStartGame = useCallback((range: ScoreRange) => {
    setScoreRange(range)

    // Erstelle das Match jetzt mit den ausgewaehlten Spielern
    const players = selectedPlayers.length > 0 ? selectedPlayers : undefined
    const firstPlayer = players?.[0] ?? { id: 'solo', name: 'Spieler' }

    // Bei Multiplayer: 10 Checkouts pro Spieler
    const attemptsPerPlayer = 10
    const totalAttempts = (players?.length ?? 1) * attemptsPerPlayer

    const match = createCheckoutTrainerMatchShell({
      playerId: firstPlayer.id,
      playerName: firstPlayer.name,
      targetCount: totalAttempts,
      players: players?.map(p => ({ playerId: p.id, name: p.name })),
    })

    setRealMatchId(match.id)
    setEvents(match.events)
    onMatchCreated?.(match.id)

    const list = generateCheckoutList(attemptsPerPlayer, range)
    setCheckoutList(list)
    setPhase('playing')
  }, [selectedPlayers, onMatchCreated])

  // Undo last dart within current attempt
  const handleUndoDart = useCallback(() => {
    if (thrownDarts.length === 0 || isBust) return
    const newDarts = thrownDarts.slice(0, -1)
    setThrownDarts(newDarts)
    const newRemaining = (state.currentTarget?.score ?? 0) - newDarts.reduce((sum, d) => sum + d.parsed.score, 0)
    setRemaining(newRemaining)
    setDisplayBuffer('')
    setMultiplier(1)
  }, [thrownDarts, isBust, state.currentTarget?.score])

  // Submit a parsed dart directly
  const submitDart = useCallback((parsed: ParsedDart) => {
    if (!state.currentTarget || state.finished || isBust) return

    const newRemaining = remaining - parsed.score
    const newDarts = [...thrownDarts, { input: formatDart(parsed), parsed }]
    const dartCount = newDarts.length

    setThrownDarts(newDarts)
    setMultiplier(1)
    setDisplayBuffer('')
    numBufferRef.current = ''

    // Check checkout: exactly 0 with last dart being a double
    if (newRemaining === 0 && isDartDouble(parsed)) {
      triggerFlash('success')
      submitResult(true, dartCount, newDarts)
      return
    }

    // Bust conditions: below 0, equals 1, equals 0 but not a double
    if (newRemaining < 0 || newRemaining === 1 || (newRemaining === 0 && !isDartDouble(parsed))) {
      setIsBust(true)
      setRemaining(newRemaining < 0 ? remaining : newRemaining)
      triggerFlash('fail')
      setTimeout(() => submitResult(false, dartCount, newDarts), 800)
      return
    }

    // 3 darts used without checkout -> fail
    if (dartCount >= 3) {
      setRemaining(newRemaining)
      triggerFlash('fail')
      setTimeout(() => submitResult(false, 3, newDarts), 800)
      return
    }

    // Continue: more darts to throw
    setRemaining(newRemaining)
  }, [state.currentTarget, state.finished, isBust, remaining, thrownDarts]) // eslint-disable-line react-hooks/exhaustive-deps

  // Flush number buffer -> submit dart
  const flushNumBuffer = useCallback(() => {
    const buf = numBufferRef.current
    numBufferRef.current = ''
    if (!buf) return
    const bed = parseInt(buf, 10)
    if (bed >= 1 && bed <= 20) {
      submitDart({ bed: String(bed), mult: multiplier, score: bed * multiplier })
    }
    setDisplayBuffer('')
  }, [multiplier, submitDart])

  // Global keyboard handler
  useEffect(() => {
    if (phase !== 'playing' || state.finished || isBust) return

    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase()
      if (tag === 'input' || tag === 'textarea') return

      const k = e.key

      // Multiplier prefix
      if (k === 's' || k === 'S') { setMultiplier(1); setDisplayBuffer('S'); e.preventDefault(); return }
      if (k === 'd' || k === 'D') { setMultiplier(2); setDisplayBuffer('D'); e.preventDefault(); return }
      if (k === 't' || k === 'T') { setMultiplier(3); setDisplayBuffer('T'); e.preventDefault(); return }

      // Bull
      if (k === 'b' || k === 'B') {
        e.preventDefault()
        const mult = multiplier === 2 ? 2 : 1
        submitDart({ bed: 'BULL', mult, score: mult === 2 ? 50 : 25 })
        return
      }

      // Miss
      if (k === 'm' || k === 'M') {
        e.preventDefault()
        submitDart({ bed: '0', mult: 0, score: 0 })
        return
      }

      // Digit input
      if (k >= '0' && k <= '9') {
        e.preventDefault()
        const digit = parseInt(k, 10)

        if (numTimerRef.current) { clearTimeout(numTimerRef.current); numTimerRef.current = null }

        if (numBufferRef.current !== '') {
          // Second digit
          const firstDigit = parseInt(numBufferRef.current)
          numBufferRef.current = ''
          const combined = firstDigit * 10 + digit

          if (combined >= 10 && combined <= 20) {
            setDisplayBuffer(prev => {
              const prefix = prev.match(/^[SDT]/) ? prev[0] : ''
              return prefix + combined
            })
            submitDart({ bed: String(combined), mult: multiplier, score: combined * multiplier })
          } else {
            // Invalid two-digit: submit first, process second
            submitDart({ bed: String(firstDigit), mult: multiplier, score: firstDigit * multiplier })
            if (digit === 0) {
              submitDart({ bed: '0', mult: 0, score: 0 })
            } else if (digit >= 3) {
              submitDart({ bed: String(digit), mult: multiplier, score: digit * multiplier })
            } else {
              numBufferRef.current = String(digit)
              setDisplayBuffer(multiplier === 1 ? String(digit) : (multiplier === 2 ? 'D' : 'T') + digit)
              numTimerRef.current = setTimeout(flushNumBuffer, 500)
            }
          }
        } else {
          // First digit
          if (digit === 0) {
            submitDart({ bed: '0', mult: 0, score: 0 })
          } else if (digit >= 3) {
            const prefix = multiplier === 1 ? '' : multiplier === 2 ? 'D' : 'T'
            setDisplayBuffer(prefix + digit)
            submitDart({ bed: String(digit), mult: multiplier, score: digit * multiplier })
          } else {
            // 1 or 2: wait for possible second digit
            numBufferRef.current = String(digit)
            const prefix = multiplier === 1 ? '' : multiplier === 2 ? 'D' : 'T'
            setDisplayBuffer(prefix + digit)
            numTimerRef.current = setTimeout(flushNumBuffer, 500)
          }
        }
        return
      }

      // Space = confirm buffered 1 or 2 instantly
      if (k === ' ') {
        e.preventDefault()
        if (numBufferRef.current !== '') {
          if (numTimerRef.current) { clearTimeout(numTimerRef.current); numTimerRef.current = null }
          flushNumBuffer()
        }
        return
      }

      // Backspace = undo last dart
      if (k === 'Backspace') {
        e.preventDefault()
        if (numBufferRef.current !== '') {
          numBufferRef.current = ''
          setDisplayBuffer('')
          if (numTimerRef.current) { clearTimeout(numTimerRef.current); numTimerRef.current = null }
        } else {
          handleUndoDart()
        }
        return
      }
    }

    window.addEventListener('keydown', handler)
    return () => {
      window.removeEventListener('keydown', handler)
      if (numTimerRef.current) clearTimeout(numTimerRef.current)
    }
  }, [phase, state.finished, isBust, multiplier, submitDart, flushNumBuffer, handleUndoDart])

  const triggerFlash = useCallback((type: 'success' | 'fail') => {
    setFlash(type)
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current)
    flashTimerRef.current = setTimeout(() => setFlash(null), 600)
  }, [])

  // Submit attempt result and advance
  const submitResult = useCallback((success: boolean, dartsUsed: number, darts: DartEntry[]) => {
    if (!state.currentTarget) return

    const dartsThrown = darts.map(d => formatDart(d.parsed))

    const resultEvent: CheckoutTrainerEvent = {
      type: 'CheckoutAttemptResult',
      eventId: ctId(),
      matchId: realMatchId,
      ts: ctNow(),
      success,
      dartsUsed,
      dartsThrown,
      playerIndex: state.activePlayerIndex,
    }

    let updatedEvents = [...events, resultEvent]

    // Check if this was the last attempt
    const newAttemptIndex = state.attemptIndex + 1
    if (newAttemptIndex >= state.targetCount) {
      const newSuccessCount = state.successCount + (success ? 1 : 0)
      const finishEvent: CheckoutTrainerEvent = {
        type: 'CheckoutTrainerFinished',
        eventId: ctId(),
        matchId: realMatchId,
        ts: ctNow(),
        successCount: newSuccessCount,
        totalAttempts: state.targetCount,
        totalDartsUsed: state.totalDartsUsed + dartsUsed,
        durationMs: Date.now() - state.startTime,
      }
      updatedEvents = [...updatedEvents, finishEvent]
      setEvents(updatedEvents)
      persistCheckoutTrainerEvents(realMatchId, updatedEvents)
      finishCheckoutTrainerMatch(realMatchId)

      setTimeout(() => setPhase('summary'), 1000)
      return
    }

    // Bei Multiplayer: naechster Checkout nur wenn alle Spieler den aktuellen Score gespielt haben
    // Die Engine rotiert den activePlayerIndex automatisch
    const nextActiveIdx = isMultiplayer
      ? (state.activePlayerIndex + 1) % playerCount
      : 0

    // Naechster Checkout wenn wir zurueck bei Spieler 0 sind (oder single player)
    const needNewCheckout = !isMultiplayer || nextActiveIdx === 0
    const nextCheckoutListIdx = isMultiplayer
      ? Math.floor(newAttemptIndex / playerCount)
      : newAttemptIndex

    if (needNewCheckout && nextCheckoutListIdx < checkoutList.length) {
      const nextCheckout = checkoutList[nextCheckoutListIdx]
      const nextAttemptEvent: CheckoutTrainerEvent = {
        type: 'CheckoutAttemptStarted',
        eventId: ctId(),
        matchId: realMatchId,
        ts: ctNow(),
        targetScore: nextCheckout.score,
        optimalRoute: nextCheckout.route,
        optimalDarts: nextCheckout.darts,
      }
      updatedEvents = [...updatedEvents, nextAttemptEvent]
    } else if (!needNewCheckout) {
      // Gleicher Checkout-Score fuer naechsten Spieler — AttemptStarted mit gleichen Werten
      const currentCheckoutIdx = Math.floor(newAttemptIndex / playerCount)
      if (currentCheckoutIdx < checkoutList.length) {
        const sameCheckout = checkoutList[currentCheckoutIdx]
        const nextAttemptEvent: CheckoutTrainerEvent = {
          type: 'CheckoutAttemptStarted',
          eventId: ctId(),
          matchId: realMatchId,
          ts: ctNow(),
          targetScore: sameCheckout.score,
          optimalRoute: sameCheckout.route,
          optimalDarts: sameCheckout.darts,
        }
        updatedEvents = [...updatedEvents, nextAttemptEvent]
      }
    }

    setEvents(updatedEvents)
    persistCheckoutTrainerEvents(realMatchId, updatedEvents)

    // Reset dart input for next checkout
    setThrownDarts([])
    setDisplayBuffer('')
    setMultiplier(1)
    setIsBust(false)

    // Remaining wird durch den useEffect gesetzt wenn currentTarget sich aendert
  }, [state, events, realMatchId, checkoutList, isMultiplayer, playerCount]) // eslint-disable-line react-hooks/exhaustive-deps

  // Skip / not attempted
  const handleSkip = useCallback(() => {
    if (!state.currentTarget || state.finished) return
    triggerFlash('fail')
    const dartCount = thrownDarts.length || 3
    submitResult(false, dartCount, thrownDarts)
  }, [state.currentTarget, state.finished, thrownDarts, triggerFlash, submitResult])

  // Cleanup
  useEffect(() => {
    return () => {
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current)
    }
  }, [])

  // Difficulty selection keyboard state
  const [diffIdx, setDiffIdx] = useState(0)
  const diffBtnRefs = useRef<(HTMLButtonElement | null)[]>([])

  useEffect(() => {
    if (phase !== 'difficulty') return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setDiffIdx(i => { const next = Math.min(i + 1, DIFFICULTIES.length - 1); diffBtnRefs.current[next]?.focus(); return next })
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setDiffIdx(i => { const next = Math.max(i - 1, 0); diffBtnRefs.current[next]?.focus(); return next })
      } else if (e.key === 'Enter') {
        handleStartGame(DIFFICULTIES[diffIdx].range)
      } else if (e.key === 'Escape' || e.key === 'Backspace') {
        // Zurueck zur Spielerauswahl
        setPhase('players')
      }
    }
    window.addEventListener('keydown', handler)
    setTimeout(() => diffBtnRefs.current[0]?.focus(), 100)
    return () => window.removeEventListener('keydown', handler)
  }, [phase, diffIdx, handleStartGame])

  // ===== Player Selection Helpers =====

  const profiles = useMemo(() => getProfiles(), [])

  const allPickable = useMemo(() => {
    const guestAsProfiles = guests.map(g => ({ id: g.id, name: g.name, color: g.color }))
    return [
      ...profiles.map(p => ({ id: p.id, name: p.name, color: (p as { color?: string }).color })),
      ...guestAsProfiles,
    ]
  }, [profiles, guests])

  const togglePlayer = (pid: string) => {
    setSelectedPlayers(prev => {
      const exists = prev.find(p => p.id === pid)
      if (exists) return prev.filter(p => p.id !== pid)
      if (prev.length >= 8) return prev
      const info = allPickable.find(p => p.id === pid)
      const guest = guests.find(g => g.id === pid)
      return [...prev, { id: pid, name: info?.name ?? pid, isGuest: !!guest }]
    })
  }

  const addGuest = () => {
    const idx = guests.length % GUEST_COLORS.length
    const gid = `guest-${genId()}`
    const g = { id: gid, name: `Gast (${GUEST_NAMES[idx]})`, color: GUEST_COLORS[idx] }
    setGuests(prev => [...prev, g])
    const info: SelectedPlayer = { id: gid, name: g.name, isGuest: true }
    setSelectedPlayers(prev => prev.length < 8 ? [...prev, info] : prev)
  }

  const movePlayer = (idx: number, dir: -1 | 1) => {
    setSelectedPlayers(prev => {
      const j = idx + dir
      if (j < 0 || j >= prev.length) return prev
      const copy = [...prev]
      ;[copy[idx], copy[j]] = [copy[j], copy[idx]]
      return copy
    })
  }

  const canStartPlayers = selectedPlayers.length >= 1

  // ===== PLAYER SELECTION SCREEN =====
  if (phase === 'players') {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', minHeight: '100dvh',
        background: colors.bg, color: colors.fg, padding: 20, gap: 16,
      }}>
        <button
          onClick={onExit}
          style={{
            position: 'absolute', top: 16, left: 16,
            background: 'none', border: 'none', color: colors.fg,
            fontSize: 14, cursor: 'pointer', opacity: 0.6, padding: '4px 8px',
          }}
        >
          Zurueck
        </button>

        <h1 style={{
          fontSize: 24, fontWeight: 900, margin: 0,
          marginBottom: 4, textAlign: 'center',
        }}>
          Checkout Training
        </h1>
        <p style={{ fontSize: 14, opacity: 0.6, margin: 0, textAlign: 'center' }}>
          Spieler auswaehlen
        </p>

        <div style={{
          width: 'min(420px, 92vw)',
          display: 'flex', flexDirection: 'column', gap: 14,
          marginTop: 4,
        }}>
          {/* Profile-Auswahl */}
          <div style={{
            display: 'flex', flexWrap: 'wrap', gap: 6,
          }}>
            {allPickable.map((p) => {
              const isSel = selectedPlayers.some(s => s.id === p.id)
              return (
                <button
                  key={p.id}
                  onClick={() => togglePlayer(p.id)}
                  style={{
                    padding: '8px 14px',
                    borderRadius: 10,
                    border: `2px solid ${isSel ? colors.accent : colors.border}`,
                    background: isSel ? `${colors.accent}15` : colors.bgCard,
                    color: p.color ?? colors.fg,
                    fontWeight: isSel ? 700 : 500,
                    fontSize: 14,
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                    borderLeftWidth: p.color ? 3 : 2,
                    borderLeftColor: p.color ?? (isSel ? colors.accent : colors.border),
                  }}
                >
                  {p.name}
                </button>
              )
            })}
            <button
              onClick={addGuest}
              style={{
                padding: '8px 14px',
                borderRadius: 10,
                border: `2px dashed ${colors.border}`,
                background: 'transparent',
                color: colors.fgDim,
                fontSize: 14,
                cursor: 'pointer',
                fontWeight: 500,
              }}
            >
              + Gast
            </button>
          </div>

          {/* Reihenfolge */}
          {selectedPlayers.length > 1 && (
            <div style={{
              background: colors.bgMuted,
              borderRadius: 10,
              padding: '10px 14px',
            }}>
              <div style={{ fontSize: 12, fontWeight: 600, opacity: 0.5, marginBottom: 6 }}>
                Reihenfolge
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {selectedPlayers.map((p, i) => (
                  <div key={p.id} style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '4px 8px', borderRadius: 6,
                    background: colors.bgCard,
                  }}>
                    <span style={{
                      width: 8, height: 8, borderRadius: '50%',
                      background: PLAYER_COLORS[i % PLAYER_COLORS.length],
                      flexShrink: 0,
                    }} />
                    <span style={{ fontWeight: 600, fontSize: 14, flex: 1 }}>{p.name}</span>
                    <button
                      onClick={() => movePlayer(i, -1)}
                      disabled={i === 0}
                      style={{
                        background: 'none', border: 'none', color: colors.fg,
                        fontSize: 14, cursor: i === 0 ? 'default' : 'pointer',
                        opacity: i === 0 ? 0.2 : 0.6, padding: '2px 6px',
                      }}
                    >
                      &uarr;
                    </button>
                    <button
                      onClick={() => movePlayer(i, 1)}
                      disabled={i === selectedPlayers.length - 1}
                      style={{
                        background: 'none', border: 'none', color: colors.fg,
                        fontSize: 14, cursor: i === selectedPlayers.length - 1 ? 'default' : 'pointer',
                        opacity: i === selectedPlayers.length - 1 ? 0.2 : 0.6, padding: '2px 6px',
                      }}
                    >
                      &darr;
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Info fuer Multiplayer */}
          {selectedPlayers.length > 1 && (
            <div style={{ fontSize: 12, opacity: 0.4, textAlign: 'center' }}>
              Alle Spieler bekommen dieselben Checkouts — fairer Vergleich!
            </div>
          )}

          {/* Weiter Button */}
          <button
            onClick={() => setPhase('difficulty')}
            disabled={!canStartPlayers}
            style={{
              width: '100%', padding: '14px 20px', borderRadius: 12,
              background: canStartPlayers ? (isArcade ? colors.accent : '#111827') : colors.bgMuted,
              color: canStartPlayers ? '#fff' : colors.fgDim,
              border: 'none',
              fontSize: 16, fontWeight: 700, cursor: canStartPlayers ? 'pointer' : 'not-allowed',
              opacity: canStartPlayers ? 1 : 0.5,
              transition: 'all 0.15s',
            }}
          >
            Weiter &rarr;
          </button>
        </div>
      </div>
    )
  }

  // ===== DIFFICULTY SELECTION SCREEN =====
  if (phase === 'difficulty') {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', minHeight: '100dvh',
        background: colors.bg, color: colors.fg, padding: 20, gap: 16,
      }}>
        <button
          onClick={() => setPhase('players')}
          style={{
            position: 'absolute', top: 16, left: 16,
            background: 'none', border: 'none', color: colors.fg,
            fontSize: 14, cursor: 'pointer', opacity: 0.6, padding: '4px 8px',
          }}
        >
          Zurueck
        </button>

        <h1 style={{
          fontSize: 24, fontWeight: 900, margin: 0,
          marginBottom: 8, textAlign: 'center',
        }}>
          Checkout Training
        </h1>
        <p style={{ fontSize: 14, opacity: 0.6, margin: 0, textAlign: 'center' }}>
          Waehle eine Schwierigkeit
        </p>

        {/* Spieler-Info */}
        {selectedPlayers.length > 0 && (
          <div style={{
            display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center',
          }}>
            {selectedPlayers.map((p, i) => (
              <span key={p.id} style={{
                fontSize: 12, fontWeight: 600, padding: '3px 10px',
                borderRadius: 20, background: colors.bgMuted,
                borderLeft: `3px solid ${PLAYER_COLORS[i % PLAYER_COLORS.length]}`,
              }}>
                {p.name}
              </span>
            ))}
          </div>
        )}

        <div style={{
          display: 'flex', flexDirection: 'column', gap: 10,
          width: 'min(400px, 90vw)', marginTop: 8,
        }}>
          {DIFFICULTIES.map((d, i) => (
            <button
              key={d.key}
              ref={el => { diffBtnRefs.current[i] = el }}
              onClick={() => handleStartGame(d.range)}
              style={{
                padding: '16px 20px',
                borderRadius: 14,
                border: `2px solid ${diffIdx === i ? colors.accent : colors.border}`,
                background: diffIdx === i ? `${colors.accent}10` : colors.bgCard,
                color: colors.fg,
                cursor: 'pointer',
                textAlign: 'left',
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
                transition: 'transform 0.1s ease, border-color 0.15s ease',
              }}
              onPointerDown={e => (e.currentTarget.style.transform = 'scale(0.97)')}
              onPointerUp={e => (e.currentTarget.style.transform = 'scale(1)')}
              onPointerLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
              onFocus={() => setDiffIdx(i)}
            >
              <span style={{ fontSize: 18, fontWeight: 800 }}>{d.label}</span>
              <span style={{ fontSize: 13, opacity: 0.55, fontWeight: 500 }}>{d.desc}</span>
            </button>
          ))}
        </div>
      </div>
    )
  }

  // ===== SUMMARY SCREEN =====
  if (phase === 'summary' || state.finished) {
    const successRate = state.targetCount > 0
      ? Math.round((state.successCount / state.targetCount) * 100)
      : 0

    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        minHeight: '100dvh',
        background: colors.bg, color: colors.fg, padding: '32px 20px', gap: 16,
      }}>
        <h1 style={{ fontSize: 24, fontWeight: 900, margin: 0 }}>Ergebnis</h1>

        {/* Multiplayer: Spieler-Ergebnisse nebeneinander */}
        {isMultiplayer ? (
          <div style={{
            display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center',
            width: 'min(600px, 95vw)', marginTop: 8,
          }}>
            {state.players.map((p, pi) => {
              const pResults = state.playerResults.get(pi) ?? []
              const pSuccess = state.playerSuccessCounts.get(pi) ?? 0
              const pTotal = pResults.length
              const pRate = pTotal > 0 ? Math.round((pSuccess / pTotal) * 100) : 0
              const pDarts = state.playerDartsUsed.get(pi) ?? 0
              return (
                <div key={p.playerId} style={{
                  flex: '1 1 180px', minWidth: 160,
                  background: colors.bgCard,
                  borderRadius: 14,
                  padding: '16px 14px',
                  border: `1px solid ${colors.border}`,
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                }}>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                  }}>
                    <span style={{
                      width: 10, height: 10, borderRadius: '50%',
                      background: PLAYER_COLORS[pi % PLAYER_COLORS.length],
                    }} />
                    <span style={{ fontWeight: 700, fontSize: 16 }}>{p.name}</span>
                  </div>
                  <div style={{
                    fontSize: 48, fontWeight: 900, lineHeight: 1,
                    color: pRate >= 50 ? colors.success : colors.error,
                  }}>
                    {pRate}%
                  </div>
                  <div style={{ fontSize: 13, opacity: 0.6, fontWeight: 600 }}>
                    {pSuccess} / {pTotal} geschafft
                  </div>
                  <div style={{ fontSize: 12, opacity: 0.4 }}>
                    {pDarts} Darts
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <>
            {/* Single Player: Grosses Ergebnis */}
            <div style={{
              fontSize: 72, fontWeight: 900, lineHeight: 1,
              color: successRate >= 50 ? colors.success : colors.error,
              marginTop: 8,
            }}>
              {successRate}%
            </div>
            <div style={{ fontSize: 16, opacity: 0.6, fontWeight: 600 }}>
              {state.successCount} von {state.targetCount} geschafft
            </div>
          </>
        )}

        {/* Result list */}
        <div style={{
          width: 'min(420px, 92vw)', maxHeight: '45vh', overflowY: 'auto',
          display: 'flex', flexDirection: 'column', gap: 6, marginTop: 12,
        }}>
          {state.results.map((r, i) => {
            // Bei Multiplayer: Spieler-Farbe anzeigen
            const playerIdx = isMultiplayer ? (i % playerCount) : -1
            const playerName = isMultiplayer ? state.players[playerIdx]?.name : undefined
            return (
              <div key={i} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '10px 14px', borderRadius: 10,
                background: r.success ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                border: `1px solid ${r.success ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`,
                fontSize: 14,
                borderLeftWidth: isMultiplayer ? 4 : 1,
                borderLeftColor: isMultiplayer ? PLAYER_COLORS[playerIdx % PLAYER_COLORS.length] : undefined,
              }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontWeight: 800, fontSize: 16, fontVariantNumeric: 'tabular-nums' }}>{r.score}</span>
                    {playerName && (
                      <span style={{ fontSize: 11, opacity: 0.5, fontWeight: 600 }}>{playerName}</span>
                    )}
                  </div>
                  <span style={{ opacity: 0.45, fontSize: 12 }}>Optimal: {r.route}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                  <span style={{
                    fontWeight: 700,
                    color: r.success ? '#22c55e' : '#ef4444',
                    fontSize: 14,
                  }}>
                    {r.success ? `Checkout! (${r.dartsUsed}D)` : 'Verpasst'}
                  </span>
                  {r.dartsThrown && r.dartsThrown.length > 0 && (
                    <span style={{ opacity: 0.5, fontSize: 12, fontFamily: 'monospace' }}>
                      {r.dartsThrown.join(' - ')}
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* Buttons */}
        <div style={{
          display: 'flex', gap: 12, marginTop: 16,
          width: 'min(400px, 90vw)',
        }}>
          <button
            onClick={() => onExit()}
            style={{
              flex: 1, padding: '14px 20px', borderRadius: 12,
              background: colors.bgCard, color: colors.fg,
              border: `2px solid ${colors.border}`,
              fontSize: 16, fontWeight: 700, cursor: 'pointer',
            }}
          >
            Zurueck
          </button>
          <button
            onClick={() => onShowSummary(realMatchId)}
            style={{
              flex: 1, padding: '14px 20px', borderRadius: 12,
              background: colors.accent, color: '#fff',
              border: 'none',
              fontSize: 16, fontWeight: 700, cursor: 'pointer',
            }}
          >
            Fertig
          </button>
        </div>
      </div>
    )
  }

  // ===== PLAYING SCREEN =====
  const target = state.currentTarget
  const progressFraction = state.attemptIndex / state.targetCount

  // Aktiver Spieler
  const activePlayer = isMultiplayer ? state.players[state.activePlayerIndex] : null
  const activePlayerColor = isMultiplayer
    ? PLAYER_COLORS[state.activePlayerIndex % PLAYER_COLORS.length]
    : colors.accent

  const flashBg = flash === 'success'
    ? 'rgba(34,197,94,0.12)'
    : flash === 'fail'
      ? 'rgba(239,68,68,0.12)'
      : colors.bg

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', minHeight: '100dvh',
      background: flashBg, color: colors.fg,
      padding: '16px', gap: 0,
      transition: 'background 0.3s ease',
    }}>
      {/* Alles in einem zentrierten Block */}
      <div style={{ width: '100%', maxWidth: 440, display: 'flex', flexDirection: 'column', gap: 18 }}>

        {/* Header: Beenden | Progress | Erfolgsquote */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button
            onClick={onExit}
            style={{
              background: 'none', border: 'none', color: colors.fg,
              fontSize: 13, cursor: 'pointer', opacity: 0.5, padding: '2px 6px',
            }}
          >
            Beenden
          </button>
          <span style={{ fontSize: 14, fontWeight: 700, opacity: 0.6, fontVariantNumeric: 'tabular-nums' }}>
            {state.attemptIndex + 1} / {state.targetCount}
          </span>
          <span style={{ fontSize: 12, opacity: 0.4, fontWeight: 600, minWidth: 50, textAlign: 'right' }}>
            {state.attemptIndex > 0 ? `${Math.round((state.successCount / state.attemptIndex) * 100)}%` : ''}
          </span>
        </div>

        {/* Progress bar */}
        <div style={{ width: '100%', height: 4, borderRadius: 2, background: colors.bgMuted, overflow: 'hidden' }}>
          <div style={{
            height: '100%', borderRadius: 2, background: activePlayerColor,
            width: `${progressFraction * 100}%`, transition: 'width 0.3s ease',
          }} />
        </div>

        {/* Multiplayer: Aktiver Spieler anzeigen */}
        {isMultiplayer && activePlayer && (
          <div style={{
            display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12,
          }}>
            {state.players.map((p, pi) => {
              const isActive = pi === state.activePlayerIndex
              const pColor = PLAYER_COLORS[pi % PLAYER_COLORS.length]
              return (
                <div key={p.playerId} style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '4px 12px', borderRadius: 20,
                  background: isActive ? `${pColor}20` : 'transparent',
                  border: isActive ? `2px solid ${pColor}` : '2px solid transparent',
                  opacity: isActive ? 1 : 0.35,
                  transition: 'all 0.2s ease',
                }}>
                  <span style={{
                    width: 8, height: 8, borderRadius: '50%',
                    background: pColor,
                  }} />
                  <span style={{
                    fontSize: 13, fontWeight: isActive ? 700 : 500,
                    color: isActive ? pColor : colors.fgDim,
                  }}>
                    {p.name}
                  </span>
                  <span style={{ fontSize: 11, opacity: 0.5, fontWeight: 600 }}>
                    {state.playerSuccessCounts.get(pi) ?? 0}/{(state.playerResults.get(pi) ?? []).length}
                  </span>
                </div>
              )
            })}
          </div>
        )}

        {target ? (
          <>
            {/* Target score */}
            <div style={{ textAlign: 'center', padding: '24px 0 12px' }}>
              <div style={{
                fontSize: 90, fontWeight: 900, lineHeight: 1, fontVariantNumeric: 'tabular-nums',
                color: isBust ? colors.error : activePlayerColor,
              }}>
                {isBust ? 'BUST' : thrownDarts.length > 0 ? remaining : target.score}
              </div>
              <div style={{ fontSize: 16, fontWeight: 600, opacity: 0.25, marginTop: 6, letterSpacing: 2 }}>
                {thrownDarts.length > 0 && !isBust
                  ? `Start: ${target.score} \u00B7 ${target.route}`
                  : target.route}
              </div>
            </div>

            {/* Dart slots */}
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
              {[0, 1, 2].map(dartIdx => {
                const thrown = thrownDarts[dartIdx]
                const isActive = dartIdx === thrownDarts.length && !isBust
                return (
                  <div key={dartIdx} style={{
                    width: 80, height: 44, borderRadius: 10,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontFamily: 'monospace', fontSize: 18, fontWeight: 700,
                    background: thrown
                      ? (thrown.parsed.score === 0 ? 'rgba(239,68,68,0.15)' : 'rgba(34,197,94,0.12)')
                      : isActive ? colors.bgCard : colors.bgMuted,
                    border: isActive ? `2px solid ${activePlayerColor}` : `1px solid ${colors.border}`,
                    color: thrown
                      ? (thrown.parsed.mult === 2 ? '#22c55e' : thrown.parsed.mult === 3 ? '#f59e0b' : colors.fg)
                      : colors.fgDim,
                    opacity: thrown ? 1 : isActive ? 1 : 0.25,
                  }}>
                    {thrown ? formatDart(thrown.parsed) : isActive ? '_' : ''}
                  </div>
                )
              })}
            </div>

            {/* Keyboard input display + buttons */}
            {!isBust && thrownDarts.length < 3 && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, marginTop: 8 }}>
                {/* Eingabe-Anzeige (kein Input-Feld, reagiert auf Tastatur) */}
                <div style={{
                  width: 160, padding: '12px 14px', borderRadius: 12,
                  border: `2px solid ${displayBuffer ? activePlayerColor : colors.border}`,
                  background: colors.bgInput, color: colors.fg,
                  fontSize: 24, fontFamily: 'monospace', fontWeight: 700,
                  textAlign: 'center', letterSpacing: 2, minHeight: 28,
                  transition: 'border-color 0.15s',
                }}>
                  {displayBuffer || <span style={{ opacity: 0.25 }}>Dart {thrownDarts.length + 1}</span>}
                </div>

                {/* Multiplier-Anzeige */}
                <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                  {(['S', 'D', 'T'] as const).map(m => {
                    const mult = m === 'S' ? 1 : m === 'D' ? 2 : 3
                    const active = multiplier === mult
                    return (
                      <div key={m} style={{
                        padding: '4px 12px', borderRadius: 6,
                        fontSize: 13, fontWeight: 700,
                        background: active ? (m === 'D' ? '#22c55e22' : m === 'T' ? '#f59e0b22' : `${activePlayerColor}15`) : 'transparent',
                        color: active ? (m === 'D' ? '#22c55e' : m === 'T' ? '#f59e0b' : colors.fg) : colors.fgDim,
                        opacity: active ? 1 : 0.4,
                        transition: 'all 0.15s',
                      }}>
                        {m === 'S' ? 'Single' : m === 'D' ? 'Double' : 'Triple'}
                      </div>
                    )
                  })}
                </div>

                {/* Action buttons */}
                <div style={{ display: 'flex', gap: 10 }}>
                  {thrownDarts.length > 0 && (
                    <button onClick={handleUndoDart} style={{
                      padding: '10px 16px', borderRadius: 10,
                      background: colors.bgCard, color: colors.fg,
                      border: `1px solid ${colors.border}`,
                      fontSize: 14, fontWeight: 600, cursor: 'pointer',
                    }}>Undo</button>
                  )}
                  <button onClick={handleSkip} style={{
                    padding: '10px 16px', borderRadius: 10,
                    background: 'rgba(239,68,68,0.08)', color: colors.error,
                    border: `1px solid rgba(239,68,68,0.2)`,
                    fontSize: 14, fontWeight: 600, cursor: 'pointer',
                  }}>Skip</button>
                </div>

                <div style={{ fontSize: 12, opacity: 0.25, textAlign: 'center' }}>
                  Tippe: 20 = S20 {'\u00B7'} D16 {'\u00B7'} T19 {'\u00B7'} B = Bull
                </div>
              </div>
            )}
          </>
        ) : (
          <div style={{ fontSize: 18, opacity: 0.4, textAlign: 'center', padding: 20 }}>Laden...</div>
        )}
      </div>
    </div>
  )
}
