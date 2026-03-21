// src/screens/GameCheckoutTrainer.tsx
// Checkout Trainer mit Schwierigkeitsstufen und Dart-fuer-Dart Eingabe

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useGameColors } from '../hooks/useGameState'
import {
  getCheckoutTrainerMatchById,
  persistCheckoutTrainerEvents,
  finishCheckoutTrainerMatch,
} from '../storage'
import {
  applyCheckoutTrainerEvents,
  generateCheckoutList,
  parseDartInput,
  isDartDouble,
  id as ctId,
  now as ctNow,
  type CheckoutTrainerEvent,
  type ParsedDart,
  type ScoreRange,
} from '../dartsCheckoutTrainer'

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
}

type Phase = 'difficulty' | 'playing' | 'summary'

type DartEntry = {
  input: string
  parsed: ParsedDart
}

// ===== Helper: Format dart for display =====

function formatDart(dart: ParsedDart): string {
  if (dart.score === 0) return 'MISS'
  if (dart.bed === 'BULL' && dart.mult === 2) return 'DBULL'
  if (dart.bed === 'BULL' && dart.mult === 1) return 'BULL'
  const prefix = dart.mult === 1 ? 'S' : dart.mult === 2 ? 'D' : 'T'
  return `${prefix}${dart.bed}`
}

// ===== Component =====

export default function GameCheckoutTrainer({ matchId, onExit, onShowSummary }: Props) {
  const { colors, isArcade } = useGameColors()

  const storedMatch = getCheckoutTrainerMatchById(matchId)
  const [events, setEvents] = useState<CheckoutTrainerEvent[]>(storedMatch?.events ?? [])

  // State aus Events ableiten
  const state = useMemo(() => applyCheckoutTrainerEvents(events), [events])

  // Phase: difficulty → playing → summary
  const [phase, setPhase] = useState<Phase>('difficulty')
  const [scoreRange, setScoreRange] = useState<ScoreRange>([2, 170])

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

  // Auto-Start: generate first checkout when entering playing phase
  useEffect(() => {
    if (phase !== 'playing') return
    if (state.finished) return
    if (state.currentTarget) return
    if (state.attemptIndex >= state.targetCount) return

    // Start the next checkout from our pre-generated list
    const checkoutIdx = state.attemptIndex
    if (checkoutIdx >= checkoutList.length) return

    const checkout = checkoutList[checkoutIdx]
    const attemptEvent: CheckoutTrainerEvent = {
      type: 'CheckoutAttemptStarted',
      eventId: ctId(),
      matchId: state.matchId,
      ts: ctNow(),
      targetScore: checkout.score,
      optimalRoute: checkout.route,
      optimalDarts: checkout.darts,
    }

    const updatedEvents = [...events, attemptEvent]
    setEvents(updatedEvents)
    persistCheckoutTrainerEvents(matchId, updatedEvents)
    setRemaining(checkout.score)
    setThrownDarts([])
    setDisplayBuffer('')
    setMultiplier(1)
    setIsBust(false)
  }, [phase, state.finished, state.currentTarget, state.attemptIndex, state.targetCount, state.matchId, checkoutList]) // eslint-disable-line react-hooks/exhaustive-deps

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

  // Start game with selected difficulty
  const handleStartGame = useCallback((range: ScoreRange) => {
    setScoreRange(range)
    const list = generateCheckoutList(10, range)
    setCheckoutList(list)
    setPhase('playing')
  }, [])

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

    // 3 darts used without checkout → fail
    if (dartCount >= 3) {
      setRemaining(newRemaining)
      triggerFlash('fail')
      setTimeout(() => submitResult(false, 3, newDarts), 800)
      return
    }

    // Continue: more darts to throw
    setRemaining(newRemaining)
  }, [state.currentTarget, state.finished, isBust, remaining, thrownDarts]) // eslint-disable-line react-hooks/exhaustive-deps

  // Flush number buffer → submit dart
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
      matchId: state.matchId,
      ts: ctNow(),
      success,
      dartsUsed,
      dartsThrown,
    }

    let updatedEvents = [...events, resultEvent]

    // Check if this was the last attempt
    const newAttemptIndex = state.attemptIndex + 1
    if (newAttemptIndex >= state.targetCount) {
      const newSuccessCount = state.successCount + (success ? 1 : 0)
      const finishEvent: CheckoutTrainerEvent = {
        type: 'CheckoutTrainerFinished',
        eventId: ctId(),
        matchId: state.matchId,
        ts: ctNow(),
        successCount: newSuccessCount,
        totalAttempts: state.targetCount,
        totalDartsUsed: state.totalDartsUsed + dartsUsed,
        durationMs: Date.now() - state.startTime,
      }
      updatedEvents = [...updatedEvents, finishEvent]
      setEvents(updatedEvents)
      persistCheckoutTrainerEvents(matchId, updatedEvents)
      finishCheckoutTrainerMatch(matchId)

      setTimeout(() => setPhase('summary'), 1000)
      return
    }

    // Next checkout from pre-generated list
    const nextCheckout = checkoutList[newAttemptIndex]
    if (nextCheckout) {
      const nextAttemptEvent: CheckoutTrainerEvent = {
        type: 'CheckoutAttemptStarted',
        eventId: ctId(),
        matchId: state.matchId,
        ts: ctNow(),
        targetScore: nextCheckout.score,
        optimalRoute: nextCheckout.route,
        optimalDarts: nextCheckout.darts,
      }
      updatedEvents = [...updatedEvents, nextAttemptEvent]
    }

    setEvents(updatedEvents)
    persistCheckoutTrainerEvents(matchId, updatedEvents)

    // Reset dart input for next checkout
    setThrownDarts([])
    setDisplayBuffer('')
    setMultiplier(1)
    setIsBust(false)
    if (nextCheckout) {
      setRemaining(nextCheckout.score)
    }

    // Reset multiplier for next checkout
    setMultiplier(1)
    setDisplayBuffer('')
  }, [state, events, matchId, checkoutList]) // eslint-disable-line react-hooks/exhaustive-deps

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

  // ===== DIFFICULTY SELECTION SCREEN =====
  if (phase === 'difficulty') {
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
          marginBottom: 8, textAlign: 'center',
        }}>
          Checkout Training
        </h1>
        <p style={{ fontSize: 14, opacity: 0.6, margin: 0, textAlign: 'center' }}>
          Waehle eine Schwierigkeit
        </p>

        <div style={{
          display: 'flex', flexDirection: 'column', gap: 10,
          width: 'min(400px, 90vw)', marginTop: 8,
        }}>
          {DIFFICULTIES.map(d => (
            <button
              key={d.key}
              onClick={() => handleStartGame(d.range)}
              style={{
                padding: '16px 20px',
                borderRadius: 14,
                border: `2px solid ${colors.border}`,
                background: colors.bgCard,
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

        {/* Big success rate */}
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

        {/* Result list */}
        <div style={{
          width: 'min(420px, 92vw)', maxHeight: '45vh', overflowY: 'auto',
          display: 'flex', flexDirection: 'column', gap: 6, marginTop: 12,
        }}>
          {state.results.map((r, i) => (
            <div key={i} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '10px 14px', borderRadius: 10,
              background: r.success ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
              border: `1px solid ${r.success ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`,
              fontSize: 14,
            }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontWeight: 800, fontSize: 16, fontVariantNumeric: 'tabular-nums' }}>{r.score}</span>
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
          ))}
        </div>

        {/* Buttons */}
        <div style={{
          display: 'flex', gap: 12, marginTop: 16,
          width: 'min(400px, 90vw)',
        }}>
          <button
            onClick={() => {
              // Restart with same difficulty
              const list = generateCheckoutList(10, scoreRange)
              setCheckoutList(list)
              // We need a fresh match — just exit and let App handle it
              onExit()
            }}
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
            onClick={() => {
              onShowSummary(matchId)
            }}
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
            height: '100%', borderRadius: 2, background: colors.accent,
            width: `${progressFraction * 100}%`, transition: 'width 0.3s ease',
          }} />
        </div>

        {target ? (
          <>
            {/* Target score */}
            <div style={{ textAlign: 'center', padding: '24px 0 12px' }}>
              <div style={{
                fontSize: 90, fontWeight: 900, lineHeight: 1, fontVariantNumeric: 'tabular-nums',
                color: isBust ? colors.error : colors.accent,
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
                    border: isActive ? `2px solid ${colors.accent}` : `1px solid ${colors.border}`,
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
                  border: `2px solid ${displayBuffer ? colors.accent : colors.border}`,
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
                        background: active ? (m === 'D' ? '#22c55e22' : m === 'T' ? '#f59e0b22' : `${colors.accent}15`) : 'transparent',
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
                  Tippe: 20 = S20 \u00B7 D16 \u00B7 T19 \u00B7 B = Bull
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
