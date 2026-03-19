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
  /** Bob's 27 Auswahl */
  onSelectBobs27?: () => void
  /** Operation Auswahl */
  onSelectOperation?: () => void
  /** Multiplayer Host */
  onMultiplayerHost?: () => void
  /** Multiplayer Join */
  onMultiplayerJoin?: () => void
}

type Step = 'type' | 'preset' | 'cricket' | 'training' | 'board' | 'online'

export default function NewGameStart({ onBack, onSelectPreset, onSelectCricket, onSelectATB, onSelectRandom, onSelect121, onSelectStraeusschen, onSelectHighscore, onSelectCTF, onSelectShanghai, onSelectKiller, onSelectBobs27, onSelectOperation, onMultiplayerHost, onMultiplayerJoin }: Props) {
  // Theme System
  const { isArcade, colors } = useTheme()
  const styles = useMemo(() => getThemedUI(colors, isArcade), [colors, isArcade])

  const [step, setStep] = useState<Step>('type')
  const [pickerIndex, setPickerIndex] = useState(0)
  const [presetPickerIndex, setPresetPickerIndex] = useState(0)
  const [trainingPickerIndex, setTrainingPickerIndex] = useState(0)
  const [boardPickerIndex, setBoardPickerIndex] = useState(0)
  const [onlinePickerIndex, setOnlinePickerIndex] = useState(0)

  // Arcade Picker items
  const pickerItems: PickerItem[] = useMemo(() => [
    { id: 'random', label: 'Zufallsspiel', sub: 'Überraschung! Zufälliger Spielmodus' },
    { id: 'x01', label: 'X01', sub: '301 / 501 / 701 / 901' },
    { id: 'cricket', label: 'Cricket', sub: 'Short / Long & Cutthroat' },
    { id: 'training', label: 'Trainingspiele', sub: '121 Sprint & mehr' },
    { id: 'board', label: 'Rund ums Board', sub: 'ATB, Capture the Field, Shanghai' },
    { id: 'online', label: 'Online spielen', sub: 'Match hosten oder beitreten' },
  ], [])

  const handlePickerConfirm = (index: number) => {
    const id = pickerItems[index].id
    if (id === 'random') onSelectRandom?.()
    else if (id === 'x01') setStep('preset')
    else if (id === 'cricket') setStep('cricket')
    else if (id === 'training') setStep('training')
    else if (id === 'board') setStep('board')
    else if (id === 'online') setStep('online')
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
    { id: 'bobs27', label: "Bob's 27", sub: 'Doubles Training D1-D20' },
    { id: 'operation', label: 'Operation: EFKG', sub: 'Ein Feld, keine Gnade' },
  ], [])

  // Board Picker items (Rund ums Board)
  const boardItems: PickerItem[] = useMemo(() => [
    { id: 'atb', label: 'Around the Block', sub: '1-20 + Bull treffen' },
    { id: 'ctf', label: 'Capture the Field', sub: 'Felder erobern!' },
    { id: 'shanghai', label: 'Shanghai', sub: '1-20 punkten, Shanghai = Sofortsieg!' },
  ], [])

  const handleBoardConfirm = (index: number) => {
    const id = boardItems[index].id
    if (id === 'atb') onSelectATB?.({ mode: 'ascending', direction: 'forward' })
    else if (id === 'ctf') onSelectCTF?.()
    else if (id === 'shanghai') onSelectShanghai?.()
  }

  // Online Picker items
  const onlineItems: PickerItem[] = useMemo(() => [
    { id: 'host', label: 'Match hosten', sub: 'Remote-Spiel erstellen' },
    { id: 'join', label: 'Match beitreten', sub: 'Code eingeben' },
  ], [])

  const handleOnlineConfirm = (index: number) => {
    const id = onlineItems[index].id
    if (id === 'host') onMultiplayerHost?.()
    else if (id === 'join') onMultiplayerJoin?.()
  }

  const handleTrainingConfirm = (index: number) => {
    const id = trainingItems[index].id
    if (id === '121') onSelect121?.()
    else if (id === 'str') onSelectStraeusschen?.()
    else if (id === 'highscore') onSelectHighscore?.()
    else if (id === 'killer') onSelectKiller?.()
    else if (id === 'bobs27') onSelectBobs27?.()
    else if (id === 'operation') onSelectOperation?.()
  }

  // Tastatur: ESC = zurück
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Backspace') {
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
        e.preventDefault()
        if (step === 'preset' || step === 'cricket' || step === 'training' || step === 'board' || step === 'online') setStep('type')
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

              {/* Rund ums Board */}
              <button
                style={{ ...styles.tile, textAlign: 'center' }}
                onClick={() => setStep('board')}
                aria-label="Rund ums Board"
              >
                <div style={{ ...styles.title, marginBottom: 4 }}>Rund ums Board</div>
                <div style={styles.sub}>ATB, Capture the Field, Shanghai</div>
              </button>

              {/* Online spielen */}
              <button
                style={{ ...styles.tile, textAlign: 'center' }}
                onClick={() => setStep('online')}
                aria-label="Online spielen"
              >
                <div style={{ ...styles.title, marginBottom: 4 }}>Online spielen</div>
                <div style={styles.sub}>Match hosten oder beitreten</div>
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

              <div style={styles.rowCard}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 18, lineHeight: 1.1 }}>
                    Bob's 27
                  </div>
                  <div style={styles.sub}>Doubles Training D1-D20</div>
                </div>
                <button
                  style={styles.pill}
                  onClick={() => onSelectBobs27?.()}
                  aria-label="Bob's 27 auswählen"
                >
                  auswählen
                </button>
              </div>

              <div style={styles.rowCard}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 18, lineHeight: 1.1 }}>
                    Operation: EFKG
                  </div>
                  <div style={styles.sub}>Ein Feld, keine Gnade</div>
                </div>
                <button
                  style={styles.pill}
                  onClick={() => onSelectOperation?.()}
                  aria-label="Operation auswählen"
                >
                  auswählen
                </button>
              </div>
            </div>
          )
        )}

        {/* Step: Rund ums Board */}
        {step === 'board' && (
          isArcade ? (
            <div style={{ display: 'grid', gap: 12, width: 'min(480px, 92vw)' }}>
              <h1 style={titleStyle}>Rund ums Board</h1>
              <ArcadeScrollPicker
                items={boardItems}
                selectedIndex={boardPickerIndex}
                onChange={setBoardPickerIndex}
                onConfirm={handleBoardConfirm}
                colors={colors}
              />
            </div>
          ) : (
            <div style={styles.centerInner}>
              <h1 style={titleStyle}>Rund ums Board</h1>
              <button
                style={{ ...styles.tile, textAlign: 'center' }}
                onClick={() => onSelectATB?.({ mode: 'ascending', direction: 'forward' })}
                aria-label="Around the Block auswählen"
              >
                <div style={{ ...styles.title, marginBottom: 4 }}>Around the Block</div>
                <div style={styles.sub}>1-20 + Bull treffen</div>
              </button>
              <button
                style={{ ...styles.tile, textAlign: 'center' }}
                onClick={() => onSelectCTF?.()}
                aria-label="Capture the Field auswählen"
              >
                <div style={{ ...styles.title, marginBottom: 4 }}>Capture the Field</div>
                <div style={styles.sub}>Felder erobern!</div>
              </button>
              <button
                style={{ ...styles.tile, textAlign: 'center' }}
                onClick={() => onSelectShanghai?.()}
                aria-label="Shanghai auswählen"
              >
                <div style={{ ...styles.title, marginBottom: 4 }}>Shanghai</div>
                <div style={styles.sub}>1-20 punkten, Shanghai = Sofortsieg!</div>
              </button>
            </div>
          )
        )}

        {/* Step: Online spielen */}
        {step === 'online' && (
          isArcade ? (
            <div style={{ display: 'grid', gap: 12, width: 'min(480px, 92vw)' }}>
              <h1 style={titleStyle}>Online spielen</h1>
              <ArcadeScrollPicker
                items={onlineItems}
                selectedIndex={onlinePickerIndex}
                onChange={setOnlinePickerIndex}
                onConfirm={handleOnlineConfirm}
                colors={colors}
              />
            </div>
          ) : (
            <div style={styles.centerInner}>
              <h1 style={titleStyle}>Online spielen</h1>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <button
                  style={{ ...styles.tile, textAlign: 'center' }}
                  onClick={() => onMultiplayerHost?.()}
                  aria-label="Match hosten"
                >
                  <div style={{ ...styles.title, marginBottom: 4 }}>Match hosten</div>
                  <div style={styles.sub}>Remote-Spiel erstellen</div>
                </button>
                <button
                  style={{ ...styles.tile, textAlign: 'center' }}
                  onClick={() => onMultiplayerJoin?.()}
                  aria-label="Match beitreten"
                >
                  <div style={{ ...styles.title, marginBottom: 4 }}>Match beitreten</div>
                  <div style={styles.sub}>Code eingeben</div>
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
