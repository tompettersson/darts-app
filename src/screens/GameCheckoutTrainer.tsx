// src/screens/GameCheckoutTrainer.tsx
// Live-Spielscreen fuer Checkout Trainer
// Zeigt zufaellige Checkout-Scores, Spieler gibt an ob/mit wie vielen Darts gecheckt.

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useGameColors } from '../hooks/useGameState'
import {
  getCheckoutTrainerMatchById,
  persistCheckoutTrainerEvents,
  finishCheckoutTrainerMatch,
} from '../storage'
import {
  applyCheckoutTrainerEvents,
  generateRandomCheckout,
  id as ctId,
  now as ctNow,
  type CheckoutTrainerEvent,
} from '../dartsCheckoutTrainer'

type Props = {
  matchId: string
  onExit: () => void
  onShowSummary: (matchId: string) => void
}

export default function GameCheckoutTrainer({ matchId, onExit, onShowSummary }: Props) {
  const { c, isArcade, colors } = useGameColors()

  const storedMatch = getCheckoutTrainerMatchById(matchId)
  const [events, setEvents] = useState<CheckoutTrainerEvent[]>(storedMatch?.events ?? [])

  // State aus Events ableiten
  const state = useMemo(() => applyCheckoutTrainerEvents(events), [events])

  // Flash-Animation fuer Ergebnis
  const [flash, setFlash] = useState<'success' | 'fail' | null>(null)
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Auto-Start: ersten Checkout generieren wenn noch keiner aktiv
  useEffect(() => {
    if (state.finished) return
    if (state.currentTarget) return
    if (state.attemptIndex >= state.targetCount) return

    // Naechsten Checkout starten
    const checkout = generateRandomCheckout()
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
  }, [state.finished, state.currentTarget, state.attemptIndex, state.targetCount, state.matchId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Ergebnis melden
  const handleResult = useCallback((success: boolean, dartsUsed: number) => {
    if (!state.currentTarget || state.finished) return

    // Flash zeigen
    setFlash(success ? 'success' : 'fail')
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current)
    flashTimerRef.current = setTimeout(() => setFlash(null), 600)

    const resultEvent: CheckoutTrainerEvent = {
      type: 'CheckoutAttemptResult',
      eventId: ctId(),
      matchId: state.matchId,
      ts: ctNow(),
      success,
      dartsUsed,
    }

    let updatedEvents = [...events, resultEvent]

    // Pruefen ob das letzte Attempt war
    const newAttemptIndex = state.attemptIndex + 1
    if (newAttemptIndex >= state.targetCount) {
      // Match beendet
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

      // Kurz warten, dann Summary zeigen
      setTimeout(() => onShowSummary(matchId), 1200)
      return
    }

    // Naechsten Checkout direkt starten
    const nextCheckout = generateRandomCheckout()
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
    setEvents(updatedEvents)
    persistCheckoutTrainerEvents(matchId, updatedEvents)
  }, [state, events, matchId, onShowSummary])

  // Undo: letztes Ergebnis rueckgaengig machen
  const handleUndo = useCallback(() => {
    if (state.results.length === 0 || state.finished) return

    // Entferne: letztes AttemptStarted (aktuell) + letztes AttemptResult + letztes AttemptStarted (vorheriges)
    // Dann starte vorheriges Attempt neu
    let trimmed = [...events]

    // Aktuelles AttemptStarted entfernen (wenn vorhanden)
    if (trimmed.length > 0 && trimmed[trimmed.length - 1].type === 'CheckoutAttemptStarted') {
      trimmed.pop()
    }

    // Letztes AttemptResult entfernen
    if (trimmed.length > 0 && trimmed[trimmed.length - 1].type === 'CheckoutAttemptResult') {
      trimmed.pop()
    }

    // Vorheriges AttemptStarted auch entfernen und neu generieren
    // (Wir zeigen den gleichen Checkout nochmal)
    // Nein — besser: wir lassen es stehen und starten keinen neuen
    // Das AttemptStarted vom vorherigen Attempt bleibt → wird erneut angezeigt

    setEvents(trimmed)
    persistCheckoutTrainerEvents(matchId, trimmed)
  }, [events, state.results.length, state.finished, matchId])

  // Cleanup
  useEffect(() => {
    return () => {
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current)
    }
  }, [])

  // === Summary-Ansicht (inline, wenn fertig) ===
  if (state.finished) {
    const successRate = state.targetCount > 0
      ? Math.round((state.successCount / state.targetCount) * 100)
      : 0

    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', minHeight: '100dvh',
        background: colors.bg, color: colors.fg, padding: 20, gap: 16,
      }}>
        <h1 style={{ fontSize: 28, fontWeight: 900, margin: 0 }}>Checkout Training</h1>
        <div style={{ fontSize: 64, fontWeight: 900, color: colors.accent }}>
          {successRate}%
        </div>
        <div style={{ fontSize: 18, opacity: 0.7 }}>
          {state.successCount} von {state.targetCount} geschafft
        </div>

        {/* Ergebnis-Liste */}
        <div style={{
          width: 'min(400px, 90vw)', maxHeight: '40vh', overflowY: 'auto',
          display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8,
        }}>
          {state.results.map((r, i) => (
            <div key={i} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '8px 12px', borderRadius: 8,
              background: r.success ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
              fontSize: 15,
            }}>
              <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{r.score}</span>
              <span style={{ opacity: 0.6, fontSize: 13 }}>{r.route}</span>
              <span style={{
                fontWeight: 700,
                color: r.success ? '#22c55e' : '#ef4444',
              }}>
                {r.success ? `${r.dartsUsed} Dart${r.dartsUsed > 1 ? 's' : ''}` : 'Verpasst'}
              </span>
            </div>
          ))}
        </div>

        <button
          onClick={onExit}
          style={{
            marginTop: 16, padding: '12px 32px', borderRadius: 12,
            background: colors.accent, color: '#fff', border: 'none',
            fontSize: 16, fontWeight: 700, cursor: 'pointer',
          }}
        >
          Fertig
        </button>
      </div>
    )
  }

  // === Active Game UI ===
  const target = state.currentTarget
  const progressText = `Checkout ${state.attemptIndex + 1} von ${state.targetCount}`
  const currentSuccessRate = state.attemptIndex > 0
    ? Math.round((state.successCount / state.attemptIndex) * 100)
    : 0

  // Dart-Buttons: nur Buttons anzeigen die zur Checkout-Route passen
  // 1-Dart Finish → nur "1 Dart" Button
  // 2-Dart Finish → "1 Dart" und "2 Darts"
  // 3-Dart Finish → "1 Dart", "2 Darts", "3 Darts"
  const maxDarts = target?.darts ?? 3

  // Flash-Overlay
  const flashColor = flash === 'success' ? 'rgba(34,197,94,0.15)' : flash === 'fail' ? 'rgba(239,68,68,0.15)' : 'transparent'

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'space-between', minHeight: '100dvh',
      background: flash ? flashColor : colors.bg,
      color: colors.fg, padding: '20px 16px',
      transition: 'background 0.3s ease',
    }}>
      {/* Top: Progress + Stats */}
      <div style={{ textAlign: 'center', width: '100%' }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '0 8px', marginBottom: 8,
        }}>
          <button
            onClick={onExit}
            style={{
              background: 'none', border: 'none', color: colors.fg,
              fontSize: 14, cursor: 'pointer', opacity: 0.6, padding: '4px 8px',
            }}
            aria-label="Beenden"
          >
            Beenden
          </button>
          {state.results.length > 0 && (
            <button
              onClick={handleUndo}
              style={{
                background: 'none', border: 'none', color: colors.fg,
                fontSize: 14, cursor: 'pointer', opacity: 0.6, padding: '4px 8px',
              }}
              aria-label="Rueckgaengig"
            >
              Undo
            </button>
          )}
        </div>

        <div style={{ fontSize: 14, opacity: 0.6, fontWeight: 600 }}>
          {progressText}
        </div>
        {state.attemptIndex > 0 && (
          <div style={{ fontSize: 13, opacity: 0.5, marginTop: 2 }}>
            Erfolgsquote: {currentSuccessRate}%
          </div>
        )}

        {/* Progress Bar */}
        <div style={{
          width: 'min(300px, 80vw)', height: 4, borderRadius: 2,
          background: colors.bgCard, margin: '12px auto 0',
          overflow: 'hidden',
        }}>
          <div style={{
            height: '100%', borderRadius: 2,
            background: colors.accent,
            width: `${(state.attemptIndex / state.targetCount) * 100}%`,
            transition: 'width 0.3s ease',
          }} />
        </div>
      </div>

      {/* Center: Target Score + Route */}
      <div style={{ textAlign: 'center', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        {target ? (
          <>
            <div style={{
              fontSize: isArcade ? 120 : 96, fontWeight: 900,
              lineHeight: 1, fontVariantNumeric: 'tabular-nums',
              color: colors.accent,
            }}>
              {target.score}
            </div>
            <div style={{
              fontSize: 24, fontWeight: 600, opacity: 0.4,
              marginTop: 8, letterSpacing: 2,
            }}>
              {target.route}
            </div>
            <div style={{
              fontSize: 13, opacity: 0.3, marginTop: 4,
            }}>
              {target.darts === 1 ? '1-Dart Finish' : `${target.darts}-Dart Finish`}
            </div>
          </>
        ) : (
          <div style={{ fontSize: 24, opacity: 0.4 }}>Laden...</div>
        )}
      </div>

      {/* Bottom: Action Buttons */}
      <div style={{
        width: 'min(400px, 92vw)', display: 'flex', flexDirection: 'column',
        gap: 8, paddingBottom: 'env(safe-area-inset-bottom, 12px)',
      }}>
        {/* Success Buttons */}
        <div style={{ display: 'flex', gap: 8 }}>
          {maxDarts >= 1 && (
            <button
              onClick={() => handleResult(true, 1)}
              disabled={!target}
              style={{
                ...buttonStyle,
                flex: 1,
                background: 'rgba(34,197,94,0.15)',
                color: '#22c55e',
                border: '2px solid rgba(34,197,94,0.3)',
              }}
              aria-label="Geschafft mit 1 Dart"
            >
              <span style={{ fontSize: 20, fontWeight: 900 }}>1</span>
              <span style={{ fontSize: 11, opacity: 0.8 }}>Dart</span>
            </button>
          )}
          {maxDarts >= 2 && (
            <button
              onClick={() => handleResult(true, 2)}
              disabled={!target}
              style={{
                ...buttonStyle,
                flex: 1,
                background: 'rgba(34,197,94,0.15)',
                color: '#22c55e',
                border: '2px solid rgba(34,197,94,0.3)',
              }}
              aria-label="Geschafft mit 2 Darts"
            >
              <span style={{ fontSize: 20, fontWeight: 900 }}>2</span>
              <span style={{ fontSize: 11, opacity: 0.8 }}>Darts</span>
            </button>
          )}
          {maxDarts >= 3 && (
            <button
              onClick={() => handleResult(true, 3)}
              disabled={!target}
              style={{
                ...buttonStyle,
                flex: 1,
                background: 'rgba(34,197,94,0.15)',
                color: '#22c55e',
                border: '2px solid rgba(34,197,94,0.3)',
              }}
              aria-label="Geschafft mit 3 Darts"
            >
              <span style={{ fontSize: 20, fontWeight: 900 }}>3</span>
              <span style={{ fontSize: 11, opacity: 0.8 }}>Darts</span>
            </button>
          )}
        </div>

        {/* Fail Button */}
        <button
          onClick={() => handleResult(false, maxDarts)}
          disabled={!target}
          style={{
            ...buttonStyle,
            background: 'rgba(239,68,68,0.12)',
            color: '#ef4444',
            border: '2px solid rgba(239,68,68,0.25)',
          }}
          aria-label="Nicht geschafft"
        >
          Nicht geschafft
        </button>
      </div>
    </div>
  )
}

const buttonStyle: React.CSSProperties = {
  padding: '14px 16px',
  borderRadius: 12,
  fontSize: 16,
  fontWeight: 700,
  cursor: 'pointer',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 2,
  minHeight: 56,
  transition: 'transform 0.1s ease, opacity 0.1s ease',
}
