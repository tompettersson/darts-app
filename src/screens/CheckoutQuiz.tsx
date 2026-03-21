// src/screens/CheckoutQuiz.tsx
// Checkout Quiz: Trainiere deine Checkout-Wege!

import React, { useState, useMemo, useCallback } from 'react'
import { getThemedUI } from '../ui'
import { useTheme } from '../ThemeProvider'
import { CHECKOUT_TABLE } from '../checkoutTable'
import type { ThemeColors } from '../theme'

type Props = {
  onBack: () => void
}

// Alle gültigen Checkout-Scores aus der Tabelle
const ALL_SCORES = Object.keys(CHECKOUT_TABLE).map(Number)

/** Parse den ersten Dart aus einer Route wie "T20 S10 D16" → "T20" */
function getFirstDart(route: string): string {
  return route.split(' ')[0]
}

/** Menschenlesbarer Name für einen Dart */
function dartLabel(d: string): string {
  if (d === 'BULL') return 'Bull'
  if (d === 'DBULL') return 'D-Bull'
  return d
}

// Häufigste erste Darts als Button-Optionen
const DART_OPTIONS = [
  // Triples
  'T20', 'T19', 'T18', 'T17', 'T16', 'T15', 'T14', 'T13', 'T12', 'T11', 'T10',
  // Doubles
  'D20', 'D19', 'D18', 'D17', 'D16', 'D15', 'D14', 'D13', 'D12', 'D11', 'D10',
  'D9', 'D8', 'D7', 'D6', 'D5', 'D4', 'D3', 'D2', 'D1',
  // Singles
  'S20', 'S19', 'S18', 'S17', 'S16', 'S15', 'S14', 'S13', 'S12', 'S11', 'S10',
  'S9', 'S8', 'S7', 'S6', 'S5', 'S4', 'S3', 'S2', 'S1',
  // Bull
  'BULL',
]

function pickRandomScore(exclude?: number): number {
  let score: number
  do {
    score = ALL_SCORES[Math.floor(Math.random() * ALL_SCORES.length)]
  } while (score === exclude)
  return score
}

export default function CheckoutQuiz({ onBack }: Props) {
  const { colors, isArcade } = useTheme()
  const styles = useMemo(() => getThemedUI(colors, isArcade), [colors, isArcade])

  const [score, setScore] = useState(() => pickRandomScore())
  const [selected, setSelected] = useState<string | null>(null)
  const [total, setTotal] = useState(0)
  const [correct, setCorrect] = useState(0)
  const [showResult, setShowResult] = useState(false)

  const entry = CHECKOUT_TABLE[score]
  const correctFirstDart = entry ? getFirstDart(entry.route) : ''
  const isCorrect = selected === correctFirstDart

  const handleSelect = useCallback((dart: string) => {
    if (showResult) return
    setSelected(dart)
    setShowResult(true)
    setTotal(t => t + 1)
    if (dart === correctFirstDart) {
      setCorrect(c => c + 1)
    }
  }, [showResult, correctFirstDart])

  const handleNext = useCallback(() => {
    setScore(pickRandomScore(score))
    setSelected(null)
    setShowResult(false)
  }, [score])

  // Filtere Optionen: zeige nur relevante Darts (alle Triples, Doubles, häufige Singles, Bull)
  // Gruppiere nach Typ
  const triples = DART_OPTIONS.filter(d => d.startsWith('T'))
  const doubles = DART_OPTIONS.filter(d => d.startsWith('D'))
  const singles = DART_OPTIONS.filter(d => d.startsWith('S'))
  const bulls = DART_OPTIONS.filter(d => d === 'BULL')

  const resultBg = showResult
    ? isCorrect ? (isArcade ? '#1a4d2e' : '#dcfce7') : (isArcade ? '#4d1a1a' : '#fee2e2')
    : 'transparent'

  const resultBorder = showResult
    ? isCorrect ? '#22c55e' : '#ef4444'
    : 'transparent'

  return (
    <div style={{ ...styles.page, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, paddingTop: 16 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: 'min(480px, 92vw)' }}>
        <button
          style={{ ...styles.backBtn, color: colors.fg }}
          onClick={onBack}
        >
          Zurueck
        </button>
        <div style={{ fontWeight: 700, fontSize: 15, color: colors.fg, opacity: 0.8 }}>
          {correct} von {total} richtig
        </div>
      </div>

      {/* Titel */}
      <h1 style={{ margin: 0, color: colors.fg, fontSize: 22, fontWeight: 800, textAlign: 'center' }}>
        Checkout Quiz
      </h1>

      {/* Score Display */}
      <div style={{
        ...styles.card,
        textAlign: 'center',
        width: 'min(480px, 92vw)',
        boxSizing: 'border-box',
        padding: '24px 16px',
        background: resultBg,
        borderColor: resultBorder,
        transition: 'background .2s, border-color .2s',
      }}>
        <div style={{ fontSize: 14, color: colors.fg, opacity: 0.6, marginBottom: 4 }}>Restpunktestand</div>
        <div style={{ fontSize: 64, fontWeight: 900, color: colors.fg, lineHeight: 1 }}>{score}</div>
        <div style={{ fontSize: 13, color: colors.fg, opacity: 0.5, marginTop: 8 }}>
          {entry ? `${entry.darts}-Dart Checkout` : ''}
        </div>

        {/* Result feedback */}
        {showResult && (
          <div style={{ marginTop: 16 }}>
            <div style={{
              fontSize: 20,
              fontWeight: 800,
              color: isCorrect ? '#22c55e' : '#ef4444',
              marginBottom: 8,
            }}>
              {isCorrect ? 'Richtig!' : 'Falsch!'}
            </div>
            <div style={{ fontSize: 15, color: colors.fg, opacity: 0.9 }}>
              <span style={{ fontWeight: 700 }}>Checkout-Weg:</span>{' '}
              <span style={{ fontFamily: 'monospace', fontSize: 16, fontWeight: 600 }}>
                {entry?.route}
              </span>
            </div>
            {!isCorrect && selected && (
              <div style={{ fontSize: 13, color: colors.fg, opacity: 0.6, marginTop: 4 }}>
                Deine Antwort: {dartLabel(selected)}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Question */}
      {!showResult && (
        <div style={{ fontSize: 16, fontWeight: 700, color: colors.fg, textAlign: 'center' }}>
          Was wirfst du zuerst?
        </div>
      )}

      {/* Dart selector or Next button */}
      {showResult ? (
        <button
          style={{
            padding: '14px 40px',
            borderRadius: 12,
            border: 'none',
            background: colors.accent,
            color: '#fff',
            fontSize: 17,
            fontWeight: 800,
            cursor: 'pointer',
            transition: 'transform .1s',
          }}
          onClick={handleNext}
        >
          Naechster
        </button>
      ) : (
        <div style={{ width: 'min(480px, 92vw)', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {/* Triples */}
          <DartRow
            label="Triple"
            darts={triples}
            selected={selected}
            correctDart={correctFirstDart}
            showResult={showResult}
            onSelect={handleSelect}
            colors={colors}
            isArcade={isArcade}
          />
          {/* Doubles */}
          <DartRow
            label="Double"
            darts={doubles}
            selected={selected}
            correctDart={correctFirstDart}
            showResult={showResult}
            onSelect={handleSelect}
            colors={colors}
            isArcade={isArcade}
          />
          {/* Singles */}
          <DartRow
            label="Single"
            darts={singles}
            selected={selected}
            correctDart={correctFirstDart}
            showResult={showResult}
            onSelect={handleSelect}
            colors={colors}
            isArcade={isArcade}
          />
          {/* Bull */}
          <DartRow
            label=""
            darts={bulls}
            selected={selected}
            correctDart={correctFirstDart}
            showResult={showResult}
            onSelect={handleSelect}
            colors={colors}
            isArcade={isArcade}
          />
        </div>
      )}

      {/* Stats bar at bottom */}
      {total > 0 && (
        <div style={{
          fontSize: 13,
          color: colors.fg,
          opacity: 0.5,
          textAlign: 'center',
          marginTop: 8,
        }}>
          Trefferquote: {total > 0 ? Math.round((correct / total) * 100) : 0}%
        </div>
      )}
    </div>
  )
}

// --- Dart Row Component ---
type DartRowProps = {
  label: string
  darts: string[]
  selected: string | null
  correctDart: string
  showResult: boolean
  onSelect: (dart: string) => void
  colors: ThemeColors
  isArcade: boolean
}

function DartRow({ label, darts, selected, correctDart, showResult, onSelect, colors, isArcade }: DartRowProps) {
  return (
    <div>
      {label && (
        <div style={{ fontSize: 11, fontWeight: 700, color: colors.fg, opacity: 0.4, marginBottom: 2, textTransform: 'uppercase', letterSpacing: 1 }}>
          {label}
        </div>
      )}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 4,
      }}>
        {darts.map(dart => {
          const isSelected = selected === dart
          const isAnswer = dart === correctDart
          let bg = isArcade ? '#2a2a3a' : '#f1f5f9'
          let border = isArcade ? '#3a3a4a' : '#e2e8f0'
          let fg = colors.fg

          if (showResult) {
            if (isAnswer) {
              bg = '#22c55e'
              border = '#16a34a'
              fg = '#fff'
            } else if (isSelected && !isAnswer) {
              bg = '#ef4444'
              border = '#dc2626'
              fg = '#fff'
            }
          }

          return (
            <button
              key={dart}
              onClick={() => onSelect(dart)}
              disabled={showResult}
              style={{
                padding: '6px 8px',
                borderRadius: 8,
                border: `1.5px solid ${border}`,
                background: bg,
                color: fg,
                fontSize: 13,
                fontWeight: 700,
                cursor: showResult ? 'default' : 'pointer',
                minWidth: 38,
                textAlign: 'center',
                transition: 'all .12s',
                opacity: showResult && !isSelected && !isAnswer ? 0.4 : 1,
                fontFamily: 'monospace',
              }}
            >
              {dartLabel(dart)}
            </button>
          )
        })}
      </div>
    </div>
  )
}
