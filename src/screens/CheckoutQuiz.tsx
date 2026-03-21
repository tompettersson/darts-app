// src/screens/CheckoutQuiz.tsx
// Checkout Quiz: Trainiere deine Checkout-Wege! (10 Runden, Texteingabe)

import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { getThemedUI } from '../ui'
import { useTheme } from '../ThemeProvider'
import { CHECKOUT_TABLE } from '../checkoutTable'

type Props = {
  onBack: () => void
}

// Alle gültigen Checkout-Scores aus der Tabelle
const ALL_SCORES = Object.keys(CHECKOUT_TABLE).map(Number)

const TOTAL_ROUNDS = 10

/** Parse den ersten Dart aus einer Route wie "T20 S10 D16" */
function getFirstDart(route: string): string {
  return route.split(' ')[0]
}

/** Menschenlesbarer Name für einen Dart */
function dartLabel(d: string): string {
  if (d === 'BULL') return 'Bull'
  if (d === 'DBULL') return 'D-Bull'
  return d
}

/** Validiere und normalisiere Eingabe (reine Zahl = Single) */
function parseInput(raw: string): string | null {
  const s = raw.trim().toUpperCase()
  if (s === 'BULL' || s === 'B' || s === '25') return 'BULL'
  if (s === 'DBULL' || s === 'DB' || s === 'D25') return 'DBULL'
  // Mit Prefix: S20, D16, T19
  const m = s.match(/^([SDT])(\d{1,2})$/)
  if (m) {
    const num = parseInt(m[2], 10)
    if (num < 1 || num > 20) return null
    return `${m[1]}${num}`
  }
  // Ohne Prefix: reine Zahl → Single
  const numMatch = s.match(/^(\d{1,2})$/)
  if (numMatch) {
    const num = parseInt(numMatch[1], 10)
    if (num < 1 || num > 20) return null
    return `S${num}`
  }
  return null
}

/** Generiere 10 zufällige, einzigartige Checkout-Scores */
function generateScores(): number[] {
  const pool = [...ALL_SCORES]
  const scores: number[] = []
  for (let i = 0; i < TOTAL_ROUNDS && pool.length > 0; i++) {
    const idx = Math.floor(Math.random() * pool.length)
    scores.push(pool[idx])
    pool.splice(idx, 1)
  }
  return scores
}

type RoundResult = {
  score: number
  userAnswer: string
  correctAnswer: string
  fullRoute: string
  isCorrect: boolean
}

export default function CheckoutQuiz({ onBack }: Props) {
  const { colors, isArcade } = useTheme()
  const styles = useMemo(() => getThemedUI(colors, isArcade), [colors, isArcade])
  const inputRef = useRef<HTMLInputElement>(null)

  const [scores, setScores] = useState(() => generateScores())
  const [round, setRound] = useState(0) // 0-based index
  const [input, setInput] = useState('')
  const [error, setError] = useState('')
  const [results, setResults] = useState<RoundResult[]>([])
  const [feedback, setFeedback] = useState<RoundResult | null>(null)
  const [finished, setFinished] = useState(false)

  const currentScore = scores[round]
  const entry = currentScore != null ? CHECKOUT_TABLE[currentScore] : undefined

  // Auto-focus input
  useEffect(() => {
    if (!feedback && !finished) {
      // small delay so DOM is ready
      const t = setTimeout(() => inputRef.current?.focus(), 50)
      return () => clearTimeout(t)
    }
  }, [round, feedback, finished])

  // Escape key to go back
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onBack()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onBack])

  const handleSubmit = useCallback(() => {
    if (feedback) return
    const parsed = parseInput(input)
    if (!parsed) {
      setError('Ungültige Eingabe. Erlaubt: S1-S20, D1-D20, T1-T20, BULL, DBULL')
      return
    }
    setError('')

    const correctFirst = entry ? getFirstDart(entry.route) : ''
    const correct = parsed === correctFirst
    const result: RoundResult = {
      score: currentScore,
      userAnswer: parsed,
      correctAnswer: correctFirst,
      fullRoute: entry?.route ?? '',
      isCorrect: correct,
    }

    setFeedback(result)
    setResults(prev => [...prev, result])
    setInput('')
  }, [input, feedback, entry, currentScore])

  const advanceRound = useCallback(() => {
    if (round + 1 >= TOTAL_ROUNDS) {
      setFinished(true)
    } else {
      setRound(r => r + 1)
    }
    setFeedback(null)
  }, [round])

  // Handle keydown during feedback (Enter/Space to advance)
  useEffect(() => {
    if (!feedback) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        advanceRound()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [feedback, advanceRound])

  // Auto-advance after 1.5s
  useEffect(() => {
    if (!feedback) return
    const t = setTimeout(advanceRound, 1500)
    return () => clearTimeout(t)
  }, [feedback, advanceRound])

  const restart = useCallback(() => {
    setScores(generateScores())
    setRound(0)
    setInput('')
    setError('')
    setResults([])
    setFeedback(null)
    setFinished(false)
  }, [])

  const correctCount = results.filter(r => r.isCorrect).length
  const percentage = results.length > 0 ? Math.round((correctCount / results.length) * 100) : 0

  // ---------- Result Screen ----------
  if (finished) {
    return (
      <div style={{
        ...styles.page,
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: 16,
        gap: 20,
      }}>
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: 'min(520px, 92vw)',
        }}>
          <button style={{ ...styles.backBtn, color: colors.fg }} onClick={onBack}>
            Zurück
          </button>
          <div style={{ fontWeight: 700, fontSize: 15, color: colors.fg, opacity: 0.8 }}>
            Ergebnis
          </div>
        </div>

        {/* Big percentage */}
        <div style={{
          ...styles.card,
          width: 'min(520px, 92vw)',
          boxSizing: 'border-box',
          textAlign: 'center',
          padding: '32px 16px',
        }}>
          <div style={{
            fontSize: 72,
            fontWeight: 900,
            color: percentage >= 70 ? '#22c55e' : percentage >= 40 ? '#f59e0b' : '#ef4444',
            lineHeight: 1,
          }}>
            {percentage}%
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color: colors.fg, marginTop: 12 }}>
            {correctCount} von {TOTAL_ROUNDS} richtig
          </div>
        </div>

        {/* Results list */}
        <div style={{
          width: 'min(520px, 92vw)',
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
        }}>
          {results.map((r, i) => (
            <div key={i} style={{
              ...styles.card,
              padding: '10px 14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
              borderLeft: `4px solid ${r.isCorrect ? '#22c55e' : '#ef4444'}`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 22,
                  fontWeight: 900,
                  color: colors.fg,
                  fontFamily: 'monospace',
                  minWidth: 44,
                }}>
                  {r.score}
                </div>
                <div style={{ fontSize: 13, color: colors.fg, opacity: 0.7, minWidth: 0 }}>
                  <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>
                    {dartLabel(r.userAnswer)}
                  </span>
                  {!r.isCorrect && (
                    <>
                      {' → '}
                      <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#22c55e' }}>
                        {dartLabel(r.correctAnswer)}
                      </span>
                    </>
                  )}
                  <div style={{ fontSize: 11, opacity: 0.5, marginTop: 2 }}>
                    {r.fullRoute}
                  </div>
                </div>
              </div>
              <div style={{ fontSize: 20, flexShrink: 0 }}>
                {r.isCorrect ? '\u2713' : '\u2717'}
              </div>
            </div>
          ))}
        </div>

        {/* Buttons */}
        <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
          <button
            onClick={restart}
            style={{
              padding: '14px 32px',
              borderRadius: 12,
              border: 'none',
              background: colors.accent,
              color: '#fff',
              fontSize: 17,
              fontWeight: 800,
              cursor: 'pointer',
            }}
          >
            Nochmal
          </button>
          <button
            onClick={onBack}
            style={{
              padding: '14px 32px',
              borderRadius: 12,
              border: `1.5px solid ${isArcade ? '#3a3a4a' : '#e2e8f0'}`,
              background: 'transparent',
              color: colors.fg,
              fontSize: 17,
              fontWeight: 800,
              cursor: 'pointer',
            }}
          >
            Zurück
          </button>
        </div>
      </div>
    )
  }

  // ---------- Quiz Screen ----------
  const feedbackBg = feedback
    ? feedback.isCorrect
      ? (isArcade ? '#1a4d2e' : '#dcfce7')
      : (isArcade ? '#4d1a1a' : '#fee2e2')
    : 'transparent'

  const feedbackBorder = feedback
    ? feedback.isCorrect ? '#22c55e' : '#ef4444'
    : 'transparent'

  return (
    <div style={{
      ...styles.page,
      minHeight: '100dvh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: 16,
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        width: 'min(480px, 92vw)',
      }}>
        <button style={{ ...styles.backBtn, color: colors.fg }} onClick={onBack}>
          Zurück
        </button>
        <div style={{ fontWeight: 700, fontSize: 14, color: colors.fg, opacity: 0.7 }}>
          Runde {round + 1} von {TOTAL_ROUNDS}
        </div>
      </div>

      {/* Spacer top */}
      <div style={{ flex: 1 }} />

      {/* Score Display - centered */}
      <div style={{
        ...styles.card,
        textAlign: 'center',
        width: 'min(480px, 92vw)',
        boxSizing: 'border-box',
        padding: '32px 16px',
        background: feedbackBg,
        borderColor: feedbackBorder,
        transition: 'background .2s, border-color .2s',
      }}>
        <div style={{ fontSize: 14, color: colors.fg, opacity: 0.6, marginBottom: 4 }}>
          Restpunktestand
        </div>
        <div style={{ fontSize: 80, fontWeight: 900, color: colors.fg, lineHeight: 1 }}>
          {currentScore}
        </div>
        <div style={{ fontSize: 13, color: colors.fg, opacity: 0.5, marginTop: 8 }}>
          {entry ? `${entry.darts}-Dart Checkout` : ''}
        </div>

        {/* Feedback */}
        {feedback && (
          <div style={{ marginTop: 20 }}>
            <div style={{
              fontSize: 22,
              fontWeight: 800,
              color: feedback.isCorrect ? '#22c55e' : '#ef4444',
              marginBottom: 8,
            }}>
              {feedback.isCorrect ? 'Richtig!' : `Falsch! Korrekt: ${feedback.fullRoute}`}
            </div>
            {!feedback.isCorrect && (
              <div style={{ fontSize: 13, color: colors.fg, opacity: 0.6 }}>
                Deine Antwort: {dartLabel(feedback.userAnswer)}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Spacer middle */}
      <div style={{ flex: 1 }} />

      {/* Input area at bottom */}
      {!feedback && (
        <div style={{
          width: 'min(480px, 92vw)',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          paddingBottom: 24,
        }}>
          <div style={{
            fontSize: 16,
            fontWeight: 700,
            color: colors.fg,
            textAlign: 'center',
          }}>
            Was wirfst du zuerst?
          </div>

          <form
            onSubmit={(e) => { e.preventDefault(); handleSubmit() }}
            style={{ display: 'flex', gap: 8 }}
          >
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={e => { setInput(e.target.value); setError('') }}
              placeholder="z.B. T20, D16, BULL"
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              style={{
                flex: 1,
                padding: '14px 16px',
                borderRadius: 12,
                border: `1.5px solid ${error ? '#ef4444' : isArcade ? '#3a3a4a' : '#e2e8f0'}`,
                background: isArcade ? '#1a1a2e' : '#fff',
                color: colors.fg,
                fontSize: 22,
                fontWeight: 700,
                fontFamily: 'monospace',
                outline: 'none',
                textAlign: 'center',
                letterSpacing: 1,
              }}
            />
            <button
              type="submit"
              style={{
                padding: '14px 24px',
                borderRadius: 12,
                border: 'none',
                background: colors.accent,
                color: '#fff',
                fontSize: 17,
                fontWeight: 800,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              OK
            </button>
          </form>

          {error && (
            <div style={{
              fontSize: 13,
              color: '#ef4444',
              textAlign: 'center',
              fontWeight: 600,
            }}>
              {error}
            </div>
          )}
        </div>
      )}

      {/* Progress dots */}
      <div style={{
        display: 'flex',
        gap: 6,
        justifyContent: 'center',
        paddingBottom: 16,
      }}>
        {scores.map((_, i) => {
          let dotColor = isArcade ? '#3a3a4a' : '#e2e8f0' // future
          if (i < results.length) {
            dotColor = results[i].isCorrect ? '#22c55e' : '#ef4444'
          } else if (i === round) {
            dotColor = colors.accent
          }
          return (
            <div
              key={i}
              style={{
                width: i === round ? 12 : 8,
                height: 8,
                borderRadius: 4,
                background: dotColor,
                transition: 'all .2s',
              }}
            />
          )
        })}
      </div>
    </div>
  )
}
