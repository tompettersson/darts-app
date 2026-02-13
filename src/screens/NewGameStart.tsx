import React, { useEffect, useMemo, useState } from 'react'
import { ui, getThemedUI } from '../ui'
import { useTheme } from '../ThemeProvider'
import CricketModePicker, { type CricketSetup } from './newgame/CricketModePicker'
import type { ATBMode, ATBDirection } from '../types/aroundTheBlock'

// ATBSetup wird noch von App.tsx verwendet

type ModeStr = '121-double-out' | '301-double-out' | '501-double-out' | '701-double-out' | '901-double-out'
type Score = 121 | 301 | 501 | 701 | 901
export type Preset = { mode: ModeStr; startingScore: Score }

export type ATBSetup = { mode: ATBMode; direction: ATBDirection }

type Props = {
  onBack?: () => void
  onSelectPreset: (p: Preset) => void
  /** Cricket-Auswahl nach „Weiter" */
  onSelectCricket?: (cfg: CricketSetup) => void
  /** Around the Block Auswahl */
  onSelectATB?: (cfg: ATBSetup) => void
  /** Zufallsspiel Auswahl */
  onSelectRandom?: () => void
  /** 121 Sprint Auswahl */
  onSelect121?: () => void
  /** Sträußchen Auswahl */
  onSelectStraeusschen?: () => void
  /** Highscore Auswahl */
  onSelectHighscore?: () => void
}

type Step = 'type' | 'preset' | 'cricket' | 'training'

export default function NewGameStart({ onBack, onSelectPreset, onSelectCricket, onSelectATB, onSelectRandom, onSelect121, onSelectStraeusschen, onSelectHighscore }: Props) {
  // Theme System
  const { isArcade, colors } = useTheme()
  const styles = useMemo(() => getThemedUI(colors, isArcade), [colors, isArcade])

  const [step, setStep] = useState<Step>('type')

  // Tastatur: ESC = zurück
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (step === 'preset' || step === 'cricket' || step === 'training') setStep('type')
        else if (onBack) onBack()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [step, onBack])

  const pick = (startingScore: Score) =>
    onSelectPreset({ mode: `${startingScore}-double-out` as ModeStr, startingScore })

  return (
    <div style={styles.page}>
      {/* Header */}
      <div style={styles.headerRow}>
        <h2 style={{ margin: 0, color: colors.fg }}>Neues Spiel</h2>
        {step !== 'type' ? (
          <button
            style={styles.backBtn}
            onClick={() => setStep('type')}
            aria-label="Zurück"
            title="Zurück"
          >
            ← Zurück
          </button>
        ) : onBack ? (
          <button style={styles.backBtn} onClick={onBack} aria-label="Zurück" title="Zurück">← Zurück</button>
        ) : null}
      </div>

      {/* Step 1: Spielauswahl */}
      {step === 'type' && (
        <div style={styles.centerPage}>
          <div style={styles.centerInner}>
            {/* Zufallsspiel - ganz oben */}
            <button
              style={{ ...styles.tile, textAlign: 'center', background: colors.warningBg, borderColor: colors.warning }}
              onClick={() => onSelectRandom?.()}
              aria-label="Zufallsspiel starten"
            >
              <div style={{ ...styles.title, marginBottom: 4 }}>Zufallsspiel</div>
              <div style={styles.sub}>Überraschung! Zufälliger Spielmodus</div>
            </button>

            <button
              style={{ ...styles.tile, textAlign: 'center' }}
              onClick={() => setStep('preset')}
              aria-label="X01 auswählen"
            >
              <div style={{ ...styles.title, marginBottom: 4 }}>X01</div>
              <div style={styles.sub}>301 / 501 / 701 / 901 – Double-Out</div>
            </button>

            {/* Cricket */}
            <button
              style={{ ...styles.tile, textAlign: 'center' }}
              onClick={() => setStep('cricket')}
              aria-label="Cricket auswählen"
            >
              <div style={{ ...styles.title, marginBottom: 4 }}>Cricket</div>
              <div style={styles.sub}>Short / Long & Cutthroat</div>
            </button>

            {/* Trainingspiele */}
            <button
              style={{ ...styles.tile, textAlign: 'center' }}
              onClick={() => setStep('training')}
              aria-label="Trainingspiele auswählen"
            >
              <div style={{ ...styles.title, marginBottom: 4 }}>Trainingspiele</div>
              <div style={styles.sub}>121 Sprint & mehr</div>
            </button>

            {/* Around the Block - direkt zur erweiterten Konfiguration */}
            <button
              style={{ ...styles.tile, textAlign: 'center' }}
              onClick={() => onSelectATB?.({ mode: 'ascending', direction: 'forward' })}
              aria-label="Around the Block auswählen"
            >
              <div style={{ ...styles.title, marginBottom: 4 }}>Around the Block</div>
              <div style={styles.sub}>1-20 + Bull treffen</div>
            </button>
          </div>
        </div>
      )}

      {/* Step 2: X01 Presets (ohne 121) */}
      {step === 'preset' && (
        <div style={styles.centerPage} aria-label="X01-Presets">
          <div style={styles.centerInnerWide}>
            {([301, 501, 701, 901] as const).map((score) => (
              <div key={score} style={styles.rowCard}>
                <div>
                  <div style={{ fontWeight: 800, fontVariantNumeric: 'tabular-nums', fontSize: 18, lineHeight: 1.1 }}>
                    {score}
                  </div>
                  <div style={styles.sub}>Double-Out</div>
                </div>
                <button
                  style={styles.pill}
                  onClick={() => pick(score)}
                  aria-label={`Preset ${score} auswählen`}
                >
                  auswählen
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Step 2b: Trainingspiele */}
      {step === 'training' && (
        <div style={styles.centerPage} aria-label="Trainingspiele">
          <div style={styles.centerInnerWide}>
            <div style={styles.rowCard}>
              <div>
                <div style={{ fontWeight: 800, fontVariantNumeric: 'tabular-nums', fontSize: 18, lineHeight: 1.1 }}>
                  121
                </div>
                <div style={styles.sub}>Sprint – Straight-In / Double-Out</div>
              </div>
              <button
                style={styles.pill}
                onClick={() => onSelect121?.()}
                aria-label="121 Sprint auswählen"
              >
                auswählen
              </button>
            </div>

            <div style={styles.rowCard}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 18, lineHeight: 1.1 }}>
                  Sträußchen
                </div>
                <div style={styles.sub}>3× Triple auf 17/18/19/20</div>
              </div>
              <button
                style={styles.pill}
                onClick={() => onSelectStraeusschen?.()}
                aria-label="Sträußchen auswählen"
              >
                auswählen
              </button>
            </div>

            <div style={styles.rowCard}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 18, lineHeight: 1.1 }}>
                  Highscore
                </div>
                <div style={styles.sub}>Erreiche als Erster das Target!</div>
              </div>
              <button
                style={styles.pill}
                onClick={() => onSelectHighscore?.()}
                aria-label="Highscore auswählen"
              >
                auswählen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Step 3: Cricket Picker */}
      {step === 'cricket' && (
        <CricketModePicker
          onBack={() => setStep('type')}
          onConfirm={(cfg) => onSelectCricket?.(cfg)}
        />
      )}
    </div>
  )
}
