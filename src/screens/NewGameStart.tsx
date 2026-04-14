import React, { useEffect, useMemo, useState } from 'react'
import { ui, getThemedUI } from '../ui'
import { useTheme } from '../ThemeProvider'
// CricketModePicker nicht mehr benötigt — Einstellungen sind jetzt in NewGameCricket
import ArcadeScrollPicker, { type PickerItem } from '../components/ArcadeScrollPicker'
import type { ATBMode, ATBDirection } from '../types/aroundTheBlock'
import { getLastGameConfig } from './NewGame'
import { getProfiles } from '../storage'

// --- Inline SVG Icons (32x32) ---
const IconDartboard = () => (
  <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
    <circle cx="16" cy="16" r="14" stroke="#e63946" strokeWidth="2" fill="#1d3557" />
    <circle cx="16" cy="16" r="10" stroke="#f1faee" strokeWidth="1.5" fill="#457b9d" />
    <circle cx="16" cy="16" r="5" stroke="#e63946" strokeWidth="1.5" fill="#a8dadc" />
    <circle cx="16" cy="16" r="2" fill="#e63946" />
  </svg>
)

const IconCricket = () => (
  <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
    <line x1="6" y1="26" x2="26" y2="6" stroke="#2d6a4f" strokeWidth="3" strokeLinecap="round" />
    <line x1="6" y1="6" x2="26" y2="26" stroke="#40916c" strokeWidth="3" strokeLinecap="round" />
    <circle cx="16" cy="16" r="4" fill="#95d5b2" stroke="#2d6a4f" strokeWidth="1.5" />
  </svg>
)

const IconBouquet = () => (
  <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
    <circle cx="16" cy="10" r="4" fill="#f72585" />
    <circle cx="11" cy="13" r="3.5" fill="#b5179e" />
    <circle cx="21" cy="13" r="3.5" fill="#7209b7" />
    <circle cx="13" cy="17" r="3" fill="#560bad" />
    <circle cx="19" cy="17" r="3" fill="#480ca8" />
    <line x1="16" y1="20" x2="16" y2="30" stroke="#2d6a4f" strokeWidth="2.5" strokeLinecap="round" />
  </svg>
)

const IconCircularArrows = () => (
  <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
    <path d="M16 4a12 12 0 0 1 10.39 6" stroke="#0077b6" strokeWidth="2.5" strokeLinecap="round" fill="none" />
    <path d="M28 16a12 12 0 0 1-6 10.39" stroke="#00b4d8" strokeWidth="2.5" strokeLinecap="round" fill="none" />
    <path d="M16 28a12 12 0 0 1-10.39-6" stroke="#0096c7" strokeWidth="2.5" strokeLinecap="round" fill="none" />
    <path d="M4 16a12 12 0 0 1 6-10.39" stroke="#48cae4" strokeWidth="2.5" strokeLinecap="round" fill="none" />
    <polygon points="26,10 28,6 22,8" fill="#0077b6" />
    <polygon points="22,26 26,28 24,22" fill="#00b4d8" />
    <polygon points="6,22 4,26 10,24" fill="#0096c7" />
    <polygon points="10,6 6,4 8,10" fill="#48cae4" />
  </svg>
)

const IconSwords = () => (
  <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
    <line x1="6" y1="6" x2="22" y2="22" stroke="#d62828" strokeWidth="2.5" strokeLinecap="round" />
    <line x1="26" y1="6" x2="10" y2="22" stroke="#f77f00" strokeWidth="2.5" strokeLinecap="round" />
    <line x1="6" y1="6" x2="10" y2="6" stroke="#d62828" strokeWidth="2" strokeLinecap="round" />
    <line x1="6" y1="6" x2="6" y2="10" stroke="#d62828" strokeWidth="2" strokeLinecap="round" />
    <line x1="26" y1="6" x2="22" y2="6" stroke="#f77f00" strokeWidth="2" strokeLinecap="round" />
    <line x1="26" y1="6" x2="26" y2="10" stroke="#f77f00" strokeWidth="2" strokeLinecap="round" />
    <rect x="8" y="22" width="5" height="5" rx="1" fill="#d62828" opacity="0.7" />
    <rect x="19" y="22" width="5" height="5" rx="1" fill="#f77f00" opacity="0.7" />
  </svg>
)

const IconDragon = () => (
  <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
    <rect x="4" y="4" width="24" height="24" rx="3" fill="#c1121f" />
    <text x="16" y="22" textAnchor="middle" fontSize="16" fontWeight="bold" fill="#fdf0d5" fontFamily="serif">S</text>
    <circle cx="10" cy="10" r="2" fill="#fdf0d5" />
    <circle cx="22" cy="10" r="2" fill="#fdf0d5" />
  </svg>
)

const IconStar = () => (
  <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
    <polygon points="16,3 19.5,12 29,12 21.5,18 24,28 16,22 8,28 10.5,18 3,12 12.5,12" fill="#ffd60a" stroke="#e6ac00" strokeWidth="1" />
  </svg>
)

const IconSkull = () => (
  <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
    <ellipse cx="16" cy="14" rx="10" ry="11" fill="#f8f9fa" stroke="#343a40" strokeWidth="1.5" />
    <circle cx="12" cy="12" r="3" fill="#343a40" />
    <circle cx="20" cy="12" r="3" fill="#343a40" />
    <ellipse cx="16" cy="18" rx="1.5" ry="2" fill="#343a40" />
    <rect x="12" y="24" width="2" height="4" rx="1" fill="#f8f9fa" stroke="#343a40" strokeWidth="1" />
    <rect x="15" y="24" width="2" height="4" rx="1" fill="#f8f9fa" stroke="#343a40" strokeWidth="1" />
    <rect x="18" y="24" width="2" height="4" rx="1" fill="#f8f9fa" stroke="#343a40" strokeWidth="1" />
  </svg>
)

const IconDice = () => (
  <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
    <rect x="4" y="4" width="24" height="24" rx="4" fill="#6a4c93" stroke="#4a3070" strokeWidth="1.5" />
    <circle cx="10" cy="10" r="2" fill="#fff" />
    <circle cx="22" cy="10" r="2" fill="#fff" />
    <circle cx="16" cy="16" r="2" fill="#fff" />
    <circle cx="10" cy="22" r="2" fill="#fff" />
    <circle cx="22" cy="22" r="2" fill="#fff" />
  </svg>
)

const IconCrosshair = () => (
  <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
    <circle cx="16" cy="16" r="12" stroke="#06d6a0" strokeWidth="2" fill="none" />
    <circle cx="16" cy="16" r="7" stroke="#06d6a0" strokeWidth="1.5" fill="none" />
    <circle cx="16" cy="16" r="2" fill="#06d6a0" />
    <line x1="16" y1="2" x2="16" y2="8" stroke="#06d6a0" strokeWidth="2" strokeLinecap="round" />
    <line x1="16" y1="24" x2="16" y2="30" stroke="#06d6a0" strokeWidth="2" strokeLinecap="round" />
    <line x1="2" y1="16" x2="8" y2="16" stroke="#06d6a0" strokeWidth="2" strokeLinecap="round" />
    <line x1="24" y1="16" x2="30" y2="16" stroke="#06d6a0" strokeWidth="2" strokeLinecap="round" />
  </svg>
)

const IconQuiz = () => (
  <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
    <circle cx="16" cy="16" r="14" stroke="#f59e0b" strokeWidth="2" fill="#fef3c7" />
    <text x="16" y="22" textAnchor="middle" fontSize="20" fontWeight="900" fill="#f59e0b">?</text>
  </svg>
)

const IconTarget = () => (
  <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
    <circle cx="16" cy="16" r="13" stroke="#10b981" strokeWidth="2" fill="none" />
    <circle cx="16" cy="16" r="8" stroke="#10b981" strokeWidth="2" fill="none" />
    <circle cx="16" cy="16" r="3" fill="#10b981" />
    <line x1="16" y1="2" x2="16" y2="8" stroke="#10b981" strokeWidth="2" strokeLinecap="round" />
    <line x1="16" y1="24" x2="16" y2="30" stroke="#10b981" strokeWidth="2" strokeLinecap="round" />
    <line x1="2" y1="16" x2="8" y2="16" stroke="#10b981" strokeWidth="2" strokeLinecap="round" />
    <line x1="24" y1="16" x2="30" y2="16" stroke="#10b981" strokeWidth="2" strokeLinecap="round" />
  </svg>
)

const IconShuffle = () => (
  <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
    <path d="M4 10h6l4 6 4-6h6" stroke="#e76f51" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    <path d="M4 22h6l4-6 4 6h6" stroke="#f4a261" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    <polygon points="24,7 28,10 24,13" fill="#e76f51" />
    <polygon points="24,19 28,22 24,25" fill="#f4a261" />
  </svg>
)

const IconTraining = () => (
  <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
    <rect x="4" y="8" width="24" height="18" rx="3" fill="#264653" />
    <line x1="8" y1="14" x2="24" y2="14" stroke="#2a9d8f" strokeWidth="2" strokeLinecap="round" />
    <line x1="8" y1="18" x2="20" y2="18" stroke="#e9c46a" strokeWidth="2" strokeLinecap="round" />
    <line x1="8" y1="22" x2="16" y2="22" stroke="#e76f51" strokeWidth="2" strokeLinecap="round" />
    <circle cx="22" cy="6" r="3" fill="#e76f51" />
  </svg>
)

const IconBoard = () => (
  <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
    <rect x="3" y="3" width="26" height="26" rx="4" fill="#003049" />
    <circle cx="16" cy="16" r="9" stroke="#fcbf49" strokeWidth="2" fill="none" />
    <line x1="16" y1="5" x2="16" y2="27" stroke="#fcbf49" strokeWidth="1" opacity="0.4" />
    <line x1="5" y1="16" x2="27" y2="16" stroke="#fcbf49" strokeWidth="1" opacity="0.4" />
    <circle cx="16" cy="16" r="3" fill="#fcbf49" />
  </svg>
)

const IconOnline = () => (
  <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
    <circle cx="16" cy="16" r="12" stroke="#7b2cbf" strokeWidth="2" fill="none" />
    <ellipse cx="16" cy="16" rx="6" ry="12" stroke="#7b2cbf" strokeWidth="1.5" fill="none" />
    <line x1="4" y1="12" x2="28" y2="12" stroke="#7b2cbf" strokeWidth="1" />
    <line x1="4" y1="20" x2="28" y2="20" stroke="#7b2cbf" strokeWidth="1" />
    <circle cx="16" cy="16" r="2" fill="#c77dff" />
  </svg>
)

// Color accents per mode
const modeAccents: Record<string, string> = {
  random: '#e76f51',
  x01: '#e63946',
  cricket: '#2d6a4f',
  training: '#264653',
  feldspiele: '#003049',
  funparty: '#f72585',
  online: '#7b2cbf',
  '121': '#1d3557',
  str: '#b5179e',
  highscore: '#e6ac00',
  killer: '#343a40',
  bobs27: '#6a4c93',
  operation: '#06d6a0',
  'checkout-quiz': '#f59e0b',
  'checkout-trainer': '#10b981',
  atb: '#0077b6',
  ctf: '#d62828',
  shanghai: '#c1121f',
  host: '#7b2cbf',
  join: '#9d4edd',
}

// Icon wrapper style
const iconWrapStyle: React.CSSProperties = {
  width: 32,
  height: 32,
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
}

// Tile with icon layout
const tileWithIconStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  textAlign: 'left',
}

// ATBSetup wird noch von App.tsx verwendet

type ModeStr = '121-double-out' | '301-double-out' | '501-double-out' | '701-double-out' | '901-double-out'
type Score = 121 | 301 | 501 | 701 | 901
export type Preset = { mode: ModeStr; startingScore: Score }

export type ATBSetup = { mode: ATBMode; direction: ATBDirection }

type Props = {
  onBack?: () => void
  onSelectPreset: (p: Preset) => void
  /** Cricket-Auswahl */
  onSelectCricket?: () => void
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
  /** Checkout Quiz Auswahl */
  onSelectCheckoutQuiz?: () => void
  /** Checkout Trainer Auswahl */
  onSelectCheckoutTrainer?: () => void
  /** Multiplayer Host */
  onMultiplayerHost?: () => void
  /** Multiplayer Join */
  onMultiplayerJoin?: () => void
  /** Multiplayer Spectate */
  onMultiplayerSpectate?: () => void
  /** Zeigt an, dass wir im Multiplayer-Setup sind */
  isMultiplayerSetup?: boolean
  /** Start directly on the online step (from main menu "Online spielen") */
  initialStep?: 'online' | 'type'
}

type Step = 'type' | 'preset' | 'cricket' | 'feldspiele' | 'funparty' | 'training' | 'online'

export default function NewGameStart({ onBack, onSelectPreset, onSelectCricket, onSelectATB, onSelectRandom, onSelect121, onSelectStraeusschen, onSelectHighscore, onSelectCTF, onSelectShanghai, onSelectKiller, onSelectBobs27, onSelectOperation, onSelectCheckoutQuiz, onSelectCheckoutTrainer, onMultiplayerHost, onMultiplayerJoin, onMultiplayerSpectate, isMultiplayerSetup, initialStep }: Props) {
  // Theme System
  const { isArcade, colors } = useTheme()
  const styles = useMemo(() => getThemedUI(colors, isArcade), [colors, isArcade])

  const [step, setStep] = useState<Step>(initialStep || 'type')
  const [pickerIndex, setPickerIndex] = useState(0)
  const [presetPickerIndex, setPresetPickerIndex] = useState(0)
  const [trainingPickerIndex, setTrainingPickerIndex] = useState(0)
  const [feldspielePickerIndex, setFeldspielePickerIndex] = useState(0)
  const [funPartyPickerIndex, setFunPartyPickerIndex] = useState(0)
  const [onlinePickerIndex, setOnlinePickerIndex] = useState(0)

  // Quick-Start: Letztes X01-Spiel wiederholen
  const lastConfig = useMemo(() => {
    const cfg = getLastGameConfig()
    if (!cfg || !cfg.score) return null
    const profiles = getProfiles()
    const playerNames = (cfg.playerIds ?? [])
      .map(id => profiles.find(p => p.id === id)?.name)
      .filter(Boolean) as string[]
    if (playerNames.length === 0) return null
    return { ...cfg, playerNames }
  }, [])

  // Arcade Picker items
  const pickerItems: PickerItem[] = useMemo(() => [
    { id: 'random', label: 'Zufallsspiel', sub: 'Überraschung! Zufälliger Spielmodus', icon: <IconShuffle /> },
    { id: 'x01', label: 'X01', sub: '301 / 501 / 701 / 901', icon: <IconDartboard /> },
    { id: 'cricket', label: 'Cricket', sub: 'Short / Long & Cutthroat', icon: <IconCricket /> },
    { id: 'feldspiele', label: 'Feldspiele', sub: 'ATB, Capture the Field, Shanghai', icon: <IconBoard /> },
    { id: 'funparty', label: 'Fun & Party', sub: 'Sträußchen, Highscore, Killer & mehr', icon: <IconBouquet /> },
    { id: 'training', label: 'Training', sub: '121 Sprint, Bob\'s 27 & Checkout', icon: <IconTraining /> },
  ], [])

  const handlePickerConfirm = (index: number) => {
    const id = pickerItems[index].id
    if (id === 'random') onSelectRandom?.()
    else if (id === 'x01') setStep('preset')
    else if (id === 'cricket') onSelectCricket?.()
    else if (id === 'feldspiele') setStep('feldspiele')
    else if (id === 'funparty') setStep('funparty')
    else if (id === 'training') setStep('training')
  }

  // Preset Picker items (X01 only)
  const presetItems: PickerItem[] = useMemo(() => [
    { id: '301', label: '301', sub: 'Double-Out', icon: <IconDartboard /> },
    { id: '501', label: '501', sub: 'Double-Out', icon: <IconDartboard /> },
    { id: '701', label: '701', sub: 'Double-Out', icon: <IconDartboard /> },
    { id: '901', label: '901', sub: 'Double-Out', icon: <IconDartboard /> },
  ], [])

  const handlePresetConfirm = (index: number) => {
    const id = presetItems[index].id
    pick(parseInt(id) as Score)
  }

  // Training Picker items
  const trainingItems: PickerItem[] = useMemo(() => [
    { id: '121', label: '121 Sprint', sub: 'SI / Double-Out', icon: <IconDartboard /> },
    { id: 'bobs27', label: "Bob's 27", sub: 'Doubles Training D1-D20', icon: <IconDice /> },
    { id: 'checkout-quiz', label: 'Checkout Quiz', sub: 'Was wirfst du bei X Rest?', icon: <IconQuiz /> },
    { id: 'checkout-trainer', label: 'Checkout Training', sub: '10 zufällige Checkouts üben', icon: <IconTarget /> },
  ], [])

  // Feldspiele Picker items
  const feldspieleItems: PickerItem[] = useMemo(() => [
    { id: 'atb', label: 'Around the Block', sub: '1-20 + Bull treffen', icon: <IconCircularArrows /> },
    { id: 'ctf', label: 'Capture the Field', sub: 'Felder erobern!', icon: <IconSwords /> },
    { id: 'shanghai', label: 'Shanghai', sub: '1-20 punkten, Shanghai = Sofortsieg!', icon: <IconDragon /> },
  ], [])

  const handleFeldspieleConfirm = (index: number) => {
    const id = feldspieleItems[index].id
    if (id === 'atb') onSelectATB?.({ mode: 'ascending', direction: 'forward' })
    else if (id === 'ctf') onSelectCTF?.()
    else if (id === 'shanghai') onSelectShanghai?.()
  }

  // Fun & Party Picker items
  const funPartyItems: PickerItem[] = useMemo(() => [
    { id: 'str', label: 'Sträußchen', sub: '3× Triple auf 17/18/19/20', icon: <IconBouquet /> },
    { id: 'highscore', label: 'Highscore', sub: 'Erreiche als Erster das Target!', icon: <IconStar /> },
    { id: 'killer', label: 'Killer', sub: 'Eliminiere alle Gegner!', icon: <IconSkull /> },
    { id: 'operation', label: 'Operation: EFKG', sub: 'Ein Feld, keine Gnade', icon: <IconCrosshair /> },
  ], [])

  const handleFunPartyConfirm = (index: number) => {
    const id = funPartyItems[index].id
    if (id === 'str') onSelectStraeusschen?.()
    else if (id === 'highscore') onSelectHighscore?.()
    else if (id === 'killer') onSelectKiller?.()
    else if (id === 'operation') onSelectOperation?.()
  }

  // Online Picker items
  const onlineItems: PickerItem[] = useMemo(() => [
    { id: 'host', label: 'Match hosten', sub: 'Remote-Spiel erstellen', icon: <IconOnline /> },
    { id: 'join', label: 'Match beitreten', sub: 'Code eingeben', icon: <IconOnline /> },
  ], [])

  const handleOnlineConfirm = (index: number) => {
    const id = onlineItems[index].id
    if (id === 'host') {
      onMultiplayerHost?.()
      setStep('type') // Zurück zur Spielmodus-Auswahl
    }
    else if (id === 'join') onMultiplayerJoin?.()
  }

  const handleTrainingConfirm = (index: number) => {
    const id = trainingItems[index].id
    if (id === '121') onSelect121?.()
    else if (id === 'bobs27') onSelectBobs27?.()
    else if (id === 'checkout-quiz') onSelectCheckoutQuiz?.()
    else if (id === 'checkout-trainer') onSelectCheckoutTrainer?.()
  }

  // Tastatur: ESC = zurück
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Backspace') {
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
        e.preventDefault()
        if (step === 'preset' || step === 'feldspiele' || step === 'funparty' || step === 'training' || step === 'online') setStep('type')
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
    <div style={{ ...styles.page, display: 'flex', flexDirection: 'column', minHeight: '100dvh' }}>
      {/* Zurück-Button am oberen Rand */}
      {isMultiplayerSetup && (
        <div style={{
          margin: '8px 16px 0', padding: '10px 14px', borderRadius: 10,
          background: isArcade ? '#1a2e4a' : '#eff6ff',
          border: `1px solid ${isArcade ? '#3b82f6' : '#bfdbfe'}`,
          color: isArcade ? '#93c5fd' : '#1d4ed8',
          fontSize: 13, fontWeight: 700, textAlign: 'center',
        }}>
          Online-Match hosten — wähle einen Spielmodus
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px 0' }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: colors.fg }}>
          {isMultiplayerSetup ? 'Spielmodus wählen' : 'Neues Spiel'}
        </h2>
        {step !== 'type' ? (
          <button style={styles.backBtn} onClick={() => setStep('type')} aria-label="Zurück" title="Zurück">← Zurück</button>
        ) : onBack ? (
          <button style={styles.backBtn} onClick={onBack} aria-label="Zurück" title="Zurück">← Zurück</button>
        ) : null}
      </div>
      <div style={{ height: 20 }} />
      <div style={{ flex: 1, display: 'grid', placeItems: 'center' }}>
        {/* Step 1: Spielauswahl */}
        {step === 'type' && (
          isArcade ? (
            <div style={{ display: 'grid', gap: 12, width: 'min(480px, 92vw)' }}>
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
              {/* Quick-Start: Letztes Spiel wiederholen */}
              {lastConfig && (
                <button
                  style={{
                    ...styles.tile,
                    background: `linear-gradient(135deg, ${colors.accent}18, ${colors.accent}08)`,
                    borderColor: `${colors.accent}40`,
                    borderLeft: `4px solid ${colors.accent}`,
                  }}
                  onClick={() => {
                    const score = lastConfig.score as Score
                    onSelectPreset({ mode: `${score}-double-out` as ModeStr, startingScore: score })
                  }}
                  aria-label="Letztes Spiel wiederholen"
                >
                  <div style={tileWithIconStyle}>
                    <div style={iconWrapStyle}><IconDartboard /></div>
                    <div>
                      <div style={{ ...styles.title, marginBottom: 4 }}>Schnellstart</div>
                      <div style={styles.sub}>
                        {lastConfig.score} {lastConfig.outRule === 'double-out' ? 'DO' : lastConfig.outRule === 'master-out' ? 'MO' : 'SO'}
                        {' \u00B7 '}
                        {lastConfig.playerNames.join(' vs ')}
                      </div>
                    </div>
                  </div>
                </button>
              )}

              {/* Zufallsspiel - ganz oben */}
              <button
                style={{ ...styles.tile, background: colors.warningBg, borderColor: colors.warning, borderLeft: `4px solid ${modeAccents.random}` }}
                onClick={() => onSelectRandom?.()}
                aria-label="Zufallsspiel starten"
              >
                <div style={tileWithIconStyle}>
                  <div style={iconWrapStyle}><IconShuffle /></div>
                  <div>
                    <div style={{ ...styles.title, marginBottom: 4 }}>Zufallsspiel</div>
                    <div style={styles.sub}>Überraschung! Zufälliger Spielmodus</div>
                  </div>
                </div>
              </button>

              <button
                style={{ ...styles.tile, borderLeft: `4px solid ${modeAccents.x01}` }}
                onClick={() => setStep('preset')}
                aria-label="X01 auswählen"
              >
                <div style={tileWithIconStyle}>
                  <div style={iconWrapStyle}><IconDartboard /></div>
                  <div>
                    <div style={{ ...styles.title, marginBottom: 4 }}>X01</div>
                    <div style={styles.sub}>301 / 501 / 701 / 901 – Double-Out</div>
                  </div>
                </div>
              </button>

              {/* Cricket */}
              <button
                style={{ ...styles.tile, borderLeft: `4px solid ${modeAccents.cricket}` }}
                onClick={() => onSelectCricket?.()}
                aria-label="Cricket auswählen"
              >
                <div style={tileWithIconStyle}>
                  <div style={iconWrapStyle}><IconCricket /></div>
                  <div>
                    <div style={{ ...styles.title, marginBottom: 4 }}>Cricket</div>
                    <div style={styles.sub}>Short / Long & Cutthroat</div>
                  </div>
                </div>
              </button>

              {/* Feldspiele */}
              <button
                style={{ ...styles.tile, borderLeft: `4px solid ${modeAccents.feldspiele}` }}
                onClick={() => setStep('feldspiele')}
                aria-label="Feldspiele auswählen"
              >
                <div style={tileWithIconStyle}>
                  <div style={iconWrapStyle}><IconBoard /></div>
                  <div>
                    <div style={{ ...styles.title, marginBottom: 4 }}>Feldspiele</div>
                    <div style={styles.sub}>ATB, Capture the Field, Shanghai</div>
                  </div>
                </div>
              </button>

              {/* Fun & Party */}
              <button
                style={{ ...styles.tile, borderLeft: `4px solid ${modeAccents.funparty}` }}
                onClick={() => setStep('funparty')}
                aria-label="Fun & Party auswählen"
              >
                <div style={tileWithIconStyle}>
                  <div style={iconWrapStyle}><IconBouquet /></div>
                  <div>
                    <div style={{ ...styles.title, marginBottom: 4 }}>Fun & Party</div>
                    <div style={styles.sub}>Sträußchen, Highscore, Killer & mehr</div>
                  </div>
                </div>
              </button>

              {/* Training */}
              <button
                style={{ ...styles.tile, borderLeft: `4px solid ${modeAccents.training}` }}
                onClick={() => setStep('training')}
                aria-label="Training auswählen"
              >
                <div style={tileWithIconStyle}>
                  <div style={iconWrapStyle}><IconTraining /></div>
                  <div>
                    <div style={{ ...styles.title, marginBottom: 4 }}>Training</div>
                    <div style={styles.sub}>121 Sprint, Bob's 27 & Checkout</div>
                  </div>
                </div>
              </button>

            </div>
          )
        )}

        {/* Step 2: X01 Presets */}
        {step === 'preset' && (
          isArcade ? (
            <div style={{ display: 'grid', gap: 12, width: 'min(480px, 92vw)' }}>
              <h1 style={titleStyle}>X01</h1>
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
              <h1 style={titleStyle}>X01</h1>
              {/* 301-901 Presets */}
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

        {/* Step: Training */}
        {step === 'training' && (
          isArcade ? (
            <div style={{ display: 'grid', gap: 12, width: 'min(480px, 92vw)' }}>
              <h1 style={titleStyle}>Training</h1>
              <ArcadeScrollPicker
                items={trainingItems}
                selectedIndex={trainingPickerIndex}
                onChange={setTrainingPickerIndex}
                onConfirm={handleTrainingConfirm}
                colors={colors}
              />
            </div>
          ) : (
            <div style={styles.centerInnerWide} aria-label="Training">
              <h1 style={titleStyle}>Training</h1>

              <div style={{ ...styles.rowCard, borderLeft: `4px solid ${modeAccents['121']}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={iconWrapStyle}><IconDartboard /></div>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 18, lineHeight: 1.1 }}>121 Sprint</div>
                    <div style={styles.sub}>Straight-In / Double-Out</div>
                  </div>
                </div>
                <button style={styles.pill} onClick={() => onSelect121?.()} aria-label="121 Sprint auswählen">auswählen</button>
              </div>

              <div style={{ ...styles.rowCard, borderLeft: `4px solid ${modeAccents.bobs27}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={iconWrapStyle}><IconDice /></div>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 18, lineHeight: 1.1 }}>Bob's 27</div>
                    <div style={styles.sub}>Doubles Training D1-D20</div>
                  </div>
                </div>
                <button style={styles.pill} onClick={() => onSelectBobs27?.()} aria-label="Bob's 27 auswählen">auswählen</button>
              </div>

              <div style={{ ...styles.rowCard, borderLeft: `4px solid ${modeAccents['checkout-quiz']}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={iconWrapStyle}><IconQuiz /></div>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 18, lineHeight: 1.1 }}>Checkout Quiz</div>
                    <div style={styles.sub}>Was wirfst du bei X Rest?</div>
                  </div>
                </div>
                <button style={styles.pill} onClick={() => onSelectCheckoutQuiz?.()} aria-label="Checkout Quiz auswählen">auswählen</button>
              </div>

              <div style={{ ...styles.rowCard, borderLeft: `4px solid ${modeAccents['checkout-trainer'] ?? '#10b981'}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={iconWrapStyle}><IconTarget /></div>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 18, lineHeight: 1.1 }}>Checkout Training</div>
                    <div style={styles.sub}>10 zufällige Checkouts üben</div>
                  </div>
                </div>
                <button style={styles.pill} onClick={() => onSelectCheckoutTrainer?.()} aria-label="Checkout Training auswählen">auswählen</button>
              </div>
            </div>
          )
        )}

        {/* Step: Feldspiele */}
        {step === 'feldspiele' && (
          isArcade ? (
            <div style={{ display: 'grid', gap: 12, width: 'min(480px, 92vw)' }}>
              <h1 style={titleStyle}>Feldspiele</h1>
              <ArcadeScrollPicker
                items={feldspieleItems}
                selectedIndex={feldspielePickerIndex}
                onChange={setFeldspielePickerIndex}
                onConfirm={handleFeldspieleConfirm}
                colors={colors}
              />
            </div>
          ) : (
            <div style={styles.centerInner}>
              <h1 style={titleStyle}>Feldspiele</h1>
              <button
                style={{ ...styles.tile, borderLeft: `4px solid ${modeAccents.atb}` }}
                onClick={() => onSelectATB?.({ mode: 'ascending', direction: 'forward' })}
                aria-label="Around the Block auswählen"
              >
                <div style={tileWithIconStyle}>
                  <div style={iconWrapStyle}><IconCircularArrows /></div>
                  <div>
                    <div style={{ ...styles.title, marginBottom: 4 }}>Around the Block</div>
                    <div style={styles.sub}>1-20 + Bull treffen</div>
                  </div>
                </div>
              </button>
              <button
                style={{ ...styles.tile, borderLeft: `4px solid ${modeAccents.ctf}` }}
                onClick={() => onSelectCTF?.()}
                aria-label="Capture the Field auswählen"
              >
                <div style={tileWithIconStyle}>
                  <div style={iconWrapStyle}><IconSwords /></div>
                  <div>
                    <div style={{ ...styles.title, marginBottom: 4 }}>Capture the Field</div>
                    <div style={styles.sub}>Felder erobern!</div>
                  </div>
                </div>
              </button>
              <button
                style={{ ...styles.tile, borderLeft: `4px solid ${modeAccents.shanghai}` }}
                onClick={() => onSelectShanghai?.()}
                aria-label="Shanghai auswählen"
              >
                <div style={tileWithIconStyle}>
                  <div style={iconWrapStyle}><IconDragon /></div>
                  <div>
                    <div style={{ ...styles.title, marginBottom: 4 }}>Shanghai</div>
                    <div style={styles.sub}>1-20 punkten, Shanghai = Sofortsieg!</div>
                  </div>
                </div>
              </button>
            </div>
          )
        )}

        {/* Step: Fun & Party */}
        {step === 'funparty' && (
          isArcade ? (
            <div style={{ display: 'grid', gap: 12, width: 'min(480px, 92vw)' }}>
              <h1 style={titleStyle}>Fun & Party</h1>
              <ArcadeScrollPicker
                items={funPartyItems}
                selectedIndex={funPartyPickerIndex}
                onChange={setFunPartyPickerIndex}
                onConfirm={handleFunPartyConfirm}
                colors={colors}
              />
            </div>
          ) : (
            <div style={styles.centerInner}>
              <h1 style={titleStyle}>Fun & Party</h1>
              <button
                style={{ ...styles.tile, borderLeft: `4px solid ${modeAccents.str}` }}
                onClick={() => onSelectStraeusschen?.()}
                aria-label="Sträußchen auswählen"
              >
                <div style={tileWithIconStyle}>
                  <div style={iconWrapStyle}><IconBouquet /></div>
                  <div>
                    <div style={{ ...styles.title, marginBottom: 4 }}>Sträußchen</div>
                    <div style={styles.sub}>3x Triple auf 17/18/19/20</div>
                  </div>
                </div>
              </button>
              <button
                style={{ ...styles.tile, borderLeft: `4px solid ${modeAccents.highscore}` }}
                onClick={() => onSelectHighscore?.()}
                aria-label="Highscore auswählen"
              >
                <div style={tileWithIconStyle}>
                  <div style={iconWrapStyle}><IconStar /></div>
                  <div>
                    <div style={{ ...styles.title, marginBottom: 4 }}>Highscore</div>
                    <div style={styles.sub}>Erreiche als Erster das Target!</div>
                  </div>
                </div>
              </button>
              <button
                style={{ ...styles.tile, borderLeft: `4px solid ${modeAccents.killer}` }}
                onClick={() => onSelectKiller?.()}
                aria-label="Killer auswählen"
              >
                <div style={tileWithIconStyle}>
                  <div style={iconWrapStyle}><IconSkull /></div>
                  <div>
                    <div style={{ ...styles.title, marginBottom: 4 }}>Killer</div>
                    <div style={styles.sub}>Eliminiere alle Gegner!</div>
                  </div>
                </div>
              </button>
              <button
                style={{ ...styles.tile, borderLeft: `4px solid ${modeAccents.operation}` }}
                onClick={() => onSelectOperation?.()}
                aria-label="Operation auswählen"
              >
                <div style={tileWithIconStyle}>
                  <div style={iconWrapStyle}><IconCrosshair /></div>
                  <div>
                    <div style={{ ...styles.title, marginBottom: 4 }}>Operation: EFKG</div>
                    <div style={styles.sub}>Ein Feld, keine Gnade</div>
                  </div>
                </div>
              </button>
            </div>
          )
        )}

        {/* Cricket geht jetzt direkt zu NewGameCricket */}
      </div>

    </div>
  )
}
