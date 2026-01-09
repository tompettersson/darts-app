import React, { useEffect, useState } from 'react'
import { ui } from '../ui'
import CricketModePicker, { type CricketSetup } from './newgame/CricketModePicker'

type ModeStr = '121-double-out' | '301-double-out' | '501-double-out' | '701-double-out' | '901-double-out'
type Score = 121 | 301 | 501 | 701 | 901
export type Preset = { mode: ModeStr; startingScore: Score }

type Props = {
  onBack?: () => void
  onSelectPreset: (p: Preset) => void
  /** NEU: Cricket-Auswahl nach „Weiter“ */
  onSelectCricket?: (cfg: CricketSetup) => void
}

type Step = 'type' | 'preset' | 'cricket'

export default function NewGameStart({ onBack, onSelectPreset, onSelectCricket }: Props) {
  const [step, setStep] = useState<Step>('type')

  // Tastatur: ESC = zurück
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (step === 'preset' || step === 'cricket') setStep('type')
        else if (onBack) onBack()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [step, onBack])

  const pick = (startingScore: Score) =>
    onSelectPreset({ mode: `${startingScore}-double-out` as ModeStr, startingScore })

  return (
    <div style={ui.page}>
      {/* Header */}
      <div style={ui.headerRow}>
        <h2 style={{ margin: 0 }}>Neues Spiel</h2>
        {step !== 'type' ? (
          <button
            style={ui.backBtn}
            onClick={() => setStep('type')}
            aria-label="Zurück"
            title="Zurück"
          >
            ← Zurück
          </button>
        ) : onBack ? (
          <button style={ui.backBtn} onClick={onBack} aria-label="Zurück" title="Zurück">← Zurück</button>
        ) : null}
      </div>

      {/* Step 1: Spielauswahl */}
      {step === 'type' && (
        <div style={ui.centerPage}>
          <div style={ui.centerInner}>
            <button
              style={{ ...ui.tile, textAlign: 'center' }}
              onClick={() => setStep('preset')}
              aria-label="Spiel (X01) auswählen"
            >
              <div style={{ ...ui.title, marginBottom: 4 }}>Spiel</div>
              <div style={ui.sub}>X01 (Double-Out) – Preset wählen</div>
            </button>

            {/* NEU: Cricket aktiv */}
            <button
              style={{ ...ui.tile, textAlign: 'center' }}
              onClick={() => setStep('cricket')}
              aria-label="Cricket auswählen"
            >
              <div style={{ ...ui.title, marginBottom: 4 }}>Cricket</div>
              <div style={ui.sub}>Short / Long & Cutthroat</div>
            </button>
          </div>
        </div>
      )}

      {/* Step 2: X01 Presets */}
      {step === 'preset' && (
        <div style={ui.centerPage} aria-label="X01-Presets">
          <div style={ui.centerInnerWide}>
            {([121, 301, 501, 701, 901] as const).map((score) => (
              <div key={score} style={ui.rowCard}>
                <div>
                  <div style={{ fontWeight: 800, fontVariantNumeric: 'tabular-nums', fontSize: 18, lineHeight: 1.1 }}>
                    {score}
                  </div>
                  <div style={ui.sub}>
                    {score === 121 ? 'Standard (DO/SI)' : 'Double-Out'}
                  </div>
                </div>
                <button
                  style={ui.pill}
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
