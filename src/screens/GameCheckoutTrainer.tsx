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
  const [currentInput, setCurrentInput] = useState('')
  const [inputError, setInputError] = useState('')
  const [remaining, setRemaining] = useState(0)
  const [isBust, setIsBust] = useState(false)

  const inputRef = useRef<HTMLInputElement>(null)
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [flash, setFlash] = useState<'success' | 'fail' | null>(null)

  // Focus input on mount and after each dart
  useEffect(() => {
    if (phase === 'playing' && inputRef.current) {
      inputRef.current.focus()
    }
  }, [phase, thrownDarts.length, state.attemptIndex])

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
    setCurrentInput('')
    setInputError('')
    setIsBust(false)
  }, [phase, state.finished, state.currentTarget, state.attemptIndex, state.targetCount, state.matchId, checkoutList]) // eslint-disable-line react-hooks/exhaustive-deps

  // When currentTarget changes, reset remaining
  useEffect(() => {
    if (state.currentTarget) {
      setRemaining(state.currentTarget.score)
      setThrownDarts([])
      setCurrentInput('')
      setInputError('')
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

  // Submit a dart input
  const handleDartSubmit = useCallback(() => {
    if (!state.currentTarget || state.finished || isBust) return

    const parsed = parseDartInput(currentInput)
    if (!parsed) {
      setInputError('Ungueltig! z.B. S20, D16, T19, BULL, DBULL, MISS')
      return
    }

    setInputError('')
    const newRemaining = remaining - parsed.score
    const newDarts = [...thrownDarts, { input: currentInput.toUpperCase(), parsed }]
    const dartCount = newDarts.length

    setThrownDarts(newDarts)
    setCurrentInput('')

    // Check checkout: exactly 0 with last dart being a double
    if (newRemaining === 0 && isDartDouble(parsed)) {
      // Success! Checkout!
      triggerFlash('success')
      submitResult(true, dartCount, newDarts)
      return
    }

    // Bust conditions: below 0, equals 1, equals 0 but not a double
    if (newRemaining < 0 || newRemaining === 1 || (newRemaining === 0 && !isDartDouble(parsed))) {
      setIsBust(true)
      setRemaining(newRemaining < 0 ? remaining : newRemaining) // show remaining before bust
      triggerFlash('fail')
      // Auto-advance after short delay
      setTimeout(() => {
        submitResult(false, dartCount, newDarts)
      }, 800)
      return
    }

    // 3 darts used without checkout → fail
    if (dartCount >= 3) {
      setRemaining(newRemaining)
      triggerFlash('fail')
      setTimeout(() => {
        submitResult(false, 3, newDarts)
      }, 800)
      return
    }

    // Continue: more darts to throw
    setRemaining(newRemaining)

    // Re-focus after state update
    setTimeout(() => inputRef.current?.focus(), 50)
  }, [state.currentTarget, state.finished, isBust, currentInput, remaining, thrownDarts]) // eslint-disable-line react-hooks/exhaustive-deps

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
    setCurrentInput('')
    setInputError('')
    setIsBust(false)
    if (nextCheckout) {
      setRemaining(nextCheckout.score)
    }

    setTimeout(() => inputRef.current?.focus(), 100)
  }, [state, events, matchId, checkoutList]) // eslint-disable-line react-hooks/exhaustive-deps

  // Skip / not attempted
  const handleSkip = useCallback(() => {
    if (!state.currentTarget || state.finished) return
    triggerFlash('fail')
    const dartCount = thrownDarts.length || 3
    submitResult(false, dartCount, thrownDarts)
  }, [state.currentTarget, state.finished, thrownDarts, triggerFlash, submitResult])

  // Undo last dart within current attempt
  const handleUndoDart = useCallback(() => {
    if (thrownDarts.length === 0 || isBust) return
    const newDarts = thrownDarts.slice(0, -1)
    setThrownDarts(newDarts)
    const newRemaining = (state.currentTarget?.score ?? 0) - newDarts.reduce((sum, d) => sum + d.parsed.score, 0)
    setRemaining(newRemaining)
    setCurrentInput('')
    setInputError('')
    setTimeout(() => inputRef.current?.focus(), 50)
  }, [thrownDarts, isBust, state.currentTarget?.score])

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
      justifyContent: 'space-between', minHeight: '100dvh',
      background: flashBg, color: colors.fg,
      padding: '16px 16px env(safe-area-inset-bottom, 16px)',
      transition: 'background 0.3s ease',
    }}>
      {/* === TOP: Progress bar + header === */}
      <div style={{ width: '100%', maxWidth: 440 }}>
        {/* Header row */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginBottom: 8,
        }}>
          <button
            onClick={onExit}
            style={{
              background: 'none', border: 'none', color: colors.fg,
              fontSize: 14, cursor: 'pointer', opacity: 0.5, padding: '4px 8px',
            }}
          >
            Beenden
          </button>
          <span style={{ fontSize: 13, opacity: 0.5, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
            {state.attemptIndex + 1} / {state.targetCount}
          </span>
          <button
            onClick={handleSkip}
            style={{
              background: 'none', border: 'none', color: colors.fg,
              fontSize: 14, cursor: 'pointer', opacity: 0.5, padding: '4px 8px',
            }}
          >
            Skip
          </button>
        </div>

        {/* Progress bar */}
        <div style={{
          width: '100%', height: 5, borderRadius: 3,
          background: colors.bgMuted, overflow: 'hidden',
        }}>
          <div style={{
            height: '100%', borderRadius: 3,
            background: colors.accent,
            width: `${progressFraction * 100}%`,
            transition: 'width 0.3s ease',
          }} />
        </div>

        {/* Success rate */}
        {state.attemptIndex > 0 && (
          <div style={{ textAlign: 'center', fontSize: 12, opacity: 0.4, marginTop: 6, fontWeight: 600 }}>
            {Math.round((state.successCount / state.attemptIndex) * 100)}% Erfolgsquote
          </div>
        )}
      </div>

      {/* === CENTER: Target score + Route + Dart inputs === */}
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        width: '100%', maxWidth: 440, gap: 12,
      }}>
        {target ? (
          <>
            {/* Target score */}
            <div style={{
              fontSize: isArcade ? 100 : 80, fontWeight: 900,
              lineHeight: 1, fontVariantNumeric: 'tabular-nums',
              color: colors.accent, textAlign: 'center',
            }}>
              {target.score}
            </div>

            {/* Optimal route (dimmed) */}
            <div style={{
              fontSize: 18, fontWeight: 600, opacity: 0.3,
              letterSpacing: 1.5, textAlign: 'center',
            }}>
              {target.route}
            </div>

            {/* Remaining display */}
            <div style={{
              fontSize: 20, fontWeight: 700, marginTop: 8,
              color: isBust ? colors.error : colors.fg,
              opacity: isBust ? 1 : 0.7,
            }}>
              {isBust ? 'BUST!' : thrownDarts.length > 0 ? `Rest: ${remaining}` : ''}
            </div>

            {/* Dart progress visualization */}
            <div style={{
              display: 'flex', gap: 12, marginTop: 8,
              justifyContent: 'center', width: '100%',
            }}>
              {[0, 1, 2].map(dartIdx => {
                const thrown = thrownDarts[dartIdx]
                const isActive = dartIdx === thrownDarts.length && !isBust
                return (
                  <div key={dartIdx} style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                    opacity: thrown ? 1 : isActive ? 1 : 0.3,
                  }}>
                    <span style={{ fontSize: 11, fontWeight: 600, opacity: 0.6 }}>
                      Dart {dartIdx + 1}
                    </span>
                    <div style={{
                      width: 72, height: 38,
                      borderRadius: 8,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontFamily: 'monospace', fontSize: 16, fontWeight: 700,
                      background: thrown
                        ? (thrown.parsed.score === 0 ? 'rgba(239,68,68,0.15)' : 'rgba(34,197,94,0.12)')
                        : isActive
                          ? colors.bgCard
                          : colors.bgMuted,
                      border: isActive
                        ? `2px solid ${colors.accent}`
                        : `1px solid ${colors.border}`,
                      color: thrown
                        ? (thrown.parsed.mult === 2 ? '#22c55e' : thrown.parsed.mult === 3 ? '#f59e0b' : colors.fg)
                        : colors.fgDim,
                    }}>
                      {thrown ? formatDart(thrown.parsed) : isActive ? '_' : ''}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Input field */}
            {!isBust && thrownDarts.length < 3 && (
              <div style={{ marginTop: 12, width: 'min(300px, 80vw)' }}>
                <input
                  ref={inputRef}
                  type="text"
                  value={currentInput}
                  onChange={e => {
                    setCurrentInput(e.target.value)
                    setInputError('')
                  }}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      handleDartSubmit()
                    }
                  }}
                  placeholder={`Dart ${thrownDarts.length + 1} eingeben...`}
                  autoComplete="off"
                  autoCapitalize="characters"
                  style={{
                    width: '100%',
                    padding: '14px 16px',
                    borderRadius: 12,
                    border: `2px solid ${inputError ? colors.error : colors.border}`,
                    background: colors.bgInput,
                    color: colors.fg,
                    fontSize: 20,
                    fontFamily: 'monospace',
                    fontWeight: 700,
                    textAlign: 'center',
                    outline: 'none',
                    boxSizing: 'border-box',
                    letterSpacing: 2,
                  }}
                />
                {inputError && (
                  <div style={{
                    fontSize: 12, color: colors.error, marginTop: 6,
                    textAlign: 'center', fontWeight: 500,
                  }}>
                    {inputError}
                  </div>
                )}
                <div style={{
                  fontSize: 11, opacity: 0.35, marginTop: 6,
                  textAlign: 'center',
                }}>
                  S1-S20, D1-D20, T1-T20, BULL, DBULL, MISS
                </div>
              </div>
            )}
          </>
        ) : (
          <div style={{ fontSize: 20, opacity: 0.4 }}>Laden...</div>
        )}
      </div>

      {/* === BOTTOM: Action buttons === */}
      <div style={{
        width: 'min(400px, 92vw)', display: 'flex', gap: 8,
        paddingTop: 8,
      }}>
        {thrownDarts.length > 0 && !isBust && (
          <button
            onClick={handleUndoDart}
            style={{
              flex: 1, padding: '12px 16px', borderRadius: 12,
              background: colors.bgCard,
              color: colors.fg, border: `2px solid ${colors.border}`,
              fontSize: 14, fontWeight: 700, cursor: 'pointer',
            }}
          >
            Undo
          </button>
        )}
        <button
          onClick={handleDartSubmit}
          disabled={!currentInput.trim() || isBust || thrownDarts.length >= 3}
          style={{
            flex: 2, padding: '14px 16px', borderRadius: 12,
            background: colors.accent, color: '#fff',
            border: 'none',
            fontSize: 16, fontWeight: 800, cursor: 'pointer',
            opacity: (!currentInput.trim() || isBust || thrownDarts.length >= 3) ? 0.4 : 1,
            transition: 'opacity 0.15s ease',
          }}
        >
          OK
        </button>
        <button
          onClick={handleSkip}
          disabled={isBust}
          style={{
            flex: 1, padding: '12px 16px', borderRadius: 12,
            background: 'rgba(239,68,68,0.1)',
            color: colors.error, border: `2px solid rgba(239,68,68,0.2)`,
            fontSize: 14, fontWeight: 700, cursor: 'pointer',
            opacity: isBust ? 0.4 : 1,
          }}
        >
          Nicht geschafft
        </button>
      </div>
    </div>
  )
}
