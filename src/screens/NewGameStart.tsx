import React, { useEffect, useMemo, useState } from 'react'
import { ui, getThemedUI } from '../ui'
import { useTheme } from '../ThemeProvider'
import CricketModePicker, { type CricketSetup } from './newgame/CricketModePicker'
import ArcadeScrollPicker, { type PickerItem } from '../components/ArcadeScrollPicker'
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
  /** Capture the Field Auswahl */
  onSelectCTF?: () => void
  /** Shanghai Auswahl */
  onSelectShanghai?: () => void
  /** Killer Auswahl */
  onSelectKiller?: () => void
}

type Step = 'type' | 'preset' | 'cricket' | 'training'

export default function NewGameStart({ onBack, onSelectPreset, onSelectCricket, onSelectATB, onSelectRandom, onSelect121, onSelectStraeusschen, onSelectHighscore, onSelectCTF, onSelectShanghai, onSelectKiller }: Props) {
  // Theme System
  const { isArcade, colors } = useTheme()
  const styles = useMemo(() => getThemedUI(colors, isArcade), [colors, isArcade])

  const [step, setStep] = useState<Step>('type')
  const [pickerIndex, setPickerIndex] = useState(0)
  const [presetPickerIndex, setPresetPickerIndex] = useState(0)
  const [trainingPickerIndex, setTrainingPickerIndex] = useState(0)

  // Arcade Picker items
  const pickerItems: PickerItem[] = useMemo(() => [
    { id: 'random', label: 'Zufallsspiel', sub: 'Überraschung! Zufälliger Spielmodus' },
    { id: 'x01', label: 'X01', sub: '301 / 501 / 701 / 901' },
    { id: 'cricket', label: 'Cricket', sub: 'Short / Long & Cutthroat' },
    { id: 'training', label: 'Trainingspiele', sub: '121 Sprint & mehr' },
    { id: 'atb', label: 'Around the Block', sub: '1-20 + Bull treffen' },
    { id: 'ctf', label: 'Capture the Field', sub: 'Felder erobern!' },
    { id: 'shanghai', label: 'Shanghai', sub: '1-20 punkten, Shanghai = Sofortsieg!' },
    { id: 'killer', label: 'Killer', sub: 'Eliminiere alle Gegner!' },
  ], [])

  const handlePickerConfirm = (index: number) => {
    const id = pickerItems[index].id
    if (id === 'random') onSelectRandom?.()
    else if (id === 'x01') setStep('preset')
    else if (id === 'cricket') setStep('cricket')
    else if (id === 'training') setStep('training')
    else if (id === 'atb') onSelectATB?.({ mode: 'ascending', direction: 'forward' })
    else if (id === 'ctf') onSelectCTF?.()
    else if (id === 'shanghai') onSelectShanghai?.()
    else if (id === 'killer') onSelectKiller?.()
  }

  // Preset Picker items (X01)
  const presetItems: PickerItem[] = useMemo(() => [
    { id: '301', label: '301', sub: 'Double-Out' },
    { id: '501', label: '501', sub: 'Double-Out' },
    { id: '701', label: '701', sub: 'Double-Out' },
    { id: '901', label: '901', sub: 'Double-Out' },
  ], [])

  const handlePresetConfirm = (index: number) => {
    const score = parseInt(presetItems[index].id) as Score
    pick(score)
  }

  // Training Picker items
  const trainingItems: PickerItem[] = useMemo(() => [
    { id: '121', label: '121 Sprint', sub: 'Straight-In / Double-Out' },
    { id: 'str', label: 'Sträußchen', sub: '3× Triple auf 17/18/19/20' },
    { id: 'highscore', label: 'Highscore', sub: 'Erreiche als Erster das Target!' },
    { id: 'killer', label: 'Killer', sub: 'Eliminiere alle Gegner!' },
  ], [])

  const handleTrainingConfirm = (index: number) => {
    const id = trainingItems[index].id
    if (id === '121') onSelect121?.()
    else if (id === 'str') onSelectStraeusschen?.()
    else if (id === 'highscore') onSelectHighscore?.()
    else if (id === 'killer') onSelectKiller?.()
  }

  // Tastatur: ESC = zurück
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Backspace') {
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
        e.preventDefault()
        if (step === 'preset' || step === 'cricket' || step === 'training') setStep('type')
        else if (onBack) onBack()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [step, onBack])

  const pick = (startingScore: Score) =>
    onSelectPreset({ mode: `${startingScore}-double-out` as ModeStr, startingScore })

  const titleStyle: React.CSSProperties = { margin: 0, color: colors.fg, textAlign: 'center' }

  return (
    <div style={{ ...styles.page, display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <div style={{ height: 60 }} />
      <div style={{ flex: 1, display: 'grid', placeItems: 'center' }}>
        {/* Step 1: Spielauswahl */}
        {step === 'type' && (
          isArcade ? (
            <div style={{ display: 'grid', gap: 12, width: 'min(480px, 92vw)' }}>
              <h1 style={titleStyle}>Neues Spiel</h1>
              <ArcadeScrollPicker
                items={pickerItems}
                selectedIndex={pickerIndex}
                onChange={setPickerIndex}
                onConfirm={handlePickerConfirm}
                colors={colors}
              />
            </div>
          ) : (
            <div style={styles.centerInner}>
              <h1 style={titleStyle}>Neues Spiel</h1>
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

              {/* Capture the Field */}
              <button
                style={{ ...styles.tile, textAlign: 'center' }}
                onClick={() => onSelectCTF?.()}
                aria-label="Capture the Field auswählen"
              >
                <div style={{ ...styles.title, marginBottom: 4 }}>Capture the Field</div>
                <div style={styles.sub}>Felder erobern!</div>
              </button>

              {/* Shanghai */}
              <button
                style={{ ...styles.tile, textAlign: 'center' }}
                onClick={() => onSelectShanghai?.()}
                aria-label="Shanghai auswählen"
              >
                <div style={{ ...styles.title, marginBottom: 4 }}>Shanghai</div>
                <div style={styles.sub}>1-20 punkten, Shanghai = Sofortsieg!</div>
              </button>

              {/* Killer */}
              <button
                style={{ ...styles.tile, textAlign: 'center' }}
                onClick={() => onSelectKiller?.()}
                aria-label="Killer auswählen"
              >
                <div style={{ ...styles.title, marginBottom: 4 }}>Killer</div>
                <div style={styles.sub}>Eliminiere alle Gegner!</div>
              </button>
            </div>
          )
        )}

        {/* Step 2: X01 Presets (ohne 121) */}
        {step === 'preset' && (
          isArcade ? (
            <div style={{ display: 'grid', gap: 12, width: 'min(480px, 92vw)' }}>
              <h1 style={titleStyle}>Neues Spiel</h1>
              <ArcadeScrollPicker
                items={presetItems}
                selectedIndex={presetPickerIndex}
                onChange={setPresetPickerIndex}
                onConfirm={handlePresetConfirm}
                colors={colors}
              />
            </div>
          ) : (
            <div style={styles.centerInnerWide} aria-label="X01-Presets">
              <h1 style={titleStyle}>Neues Spiel</h1>
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
          )
        )}

        {/* Step 2b: Trainingspiele */}
        {step === 'training' && (
          isArcade ? (
            <div style={{ display: 'grid', gap: 12, width: 'min(480px, 92vw)' }}>
              <h1 style={titleStyle}>Neues Spiel</h1>
              <ArcadeScrollPicker
                items={trainingItems}
                selectedIndex={trainingPickerIndex}
                onChange={setTrainingPickerIndex}
                onConfirm={handleTrainingConfirm}
                colors={colors}
              />
            </div>
          ) : (
            <div style={styles.centerInnerWide} aria-label="Trainingspiele">
              <h1 style={titleStyle}>Neues Spiel</h1>
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

              <div style={styles.rowCard}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 18, lineHeight: 1.1 }}>
                    Killer
                  </div>
                  <div style={styles.sub}>Eliminiere alle Gegner!</div>
                </div>
                <button
                  style={styles.pill}
                  onClick={() => onSelectKiller?.()}
                  aria-label="Killer auswählen"
                >
                  auswählen
                </button>
              </div>
            </div>
          )
        )}

        {/* Step 3: Cricket Picker */}
        {step === 'cricket' && (
          <CricketModePicker
            onBack={() => setStep('type')}
            onConfirm={(cfg) => onSelectCricket?.(cfg)}
          />
        )}
      </div>

      {/* Zurück-Button am unteren Rand */}
      <div style={{ textAlign: 'center', padding: '12px 0' }}>
        {step !== 'type' ? (
          <button style={styles.backBtn} onClick={() => setStep('type')} aria-label="Zurück" title="Zurück">← Zurück</button>
        ) : onBack ? (
          <button style={styles.backBtn} onClick={onBack} aria-label="Zurück" title="Zurück">← Zurück</button>
        ) : null}
      </div>
    </div>
  )
}
