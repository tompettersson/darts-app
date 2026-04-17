// src/multiplayer/MultiplayerLobby.tsx
// Redesigned lobby: Room code → Players join → Host configures game → Start
// Supports local players per device, drag-and-drop order, random with dice animation

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import type { ConnectionStatus } from './useMultiplayerRoom'
import type { RoomPlayer, RoomPhase, GameConfig, PlayerOrder } from './protocol'
import { generateRoomCode } from './protocol'
import type { Profile } from '../storage'
import { verifyPassword } from '../auth/api'
import { useTheme } from '../ThemeProvider'
import { getThemedUI } from '../ui'
import DiceAnimation from '../components/DiceAnimation'

// ---- Props ----

type Props = {
  mode: 'host' | 'join'
  status: ConnectionStatus
  players: RoomPlayer[]
  phase: RoomPhase
  error: string | null
  myPlayerId: string
  roomCode: string
  gameConfig: GameConfig | null
  playerOrder: string[]
  orderType: PlayerOrder
  localProfiles: Profile[]

  onCreateRoom: (roomCode: string) => void
  onJoinRoom: (roomCode: string) => void
  onAddLocalPlayers: (players: Array<{ playerId: string; name: string; color?: string }>) => void
  onRemovePlayer: (playerId: string) => void
  onSetGameConfig: (config: GameConfig) => void
  onSetPlayerOrder: (playerIds: string[], orderType: PlayerOrder) => void
  onTriggerDiceRoll?: () => void
  onStartGame: () => void
  onReady: (playerId: string) => void
  onBack: () => void
  debugLog?: string[]
  spectatorCount?: number
  diceRollTrigger?: number
}

// ---- Game mode labels ----

const GAME_MODES: Array<{ id: GameConfig['gameType']; label: string; sub: string }> = [
  { id: 'x01', label: 'X01', sub: '501, 301, etc.' },
  { id: 'cricket', label: 'Cricket', sub: 'Standard, Cutthroat, Crazy' },
  { id: 'atb', label: 'Around the Block', sub: 'Klassisches Feldspiel' },
  { id: 'ctf', label: 'Capture the Field', sub: 'Felder erobern' },
  { id: 'shanghai', label: 'Shanghai', sub: '1-20, Sofortsieg möglich' },
  { id: 'killer', label: 'Killer', sub: 'Eliminierungsspiel' },
  { id: 'str', label: 'Sträußchen', sub: 'Triple/Double Training' },
  { id: 'highscore', label: 'Highscore', sub: 'Punkte sammeln' },
  { id: 'bobs27', label: "Bob's 27", sub: 'Double Training' },
  { id: 'operation', label: 'Operation', sub: 'Genauigkeitstraining' },
]

// ---- Dice Animation Component ----

// DiceAnimation imported from ../components/DiceAnimation

// ---- X01 Config Component ----

function X01Config({ config, onChange }: { config: GameConfig; onChange: (c: GameConfig) => void }) {
  const scores = [121, 301, 501, 701, 901]
  const outRules = [
    { value: 'double-out', label: 'Double Out' },
    { value: 'master-out', label: 'Master Out' },
    { value: 'single-out', label: 'Single Out' },
  ]
  const inRules = [
    { value: 'straight-in', label: 'Straight In' },
    { value: 'double-in', label: 'Double In' },
  ]

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <label style={{ fontWeight: 600, fontSize: 13 }}>Score</label>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {scores.map(s => (
          <button key={s} onClick={() => onChange({ ...config, startScore: s })}
            style={pillStyle(config.startScore === s)}>{s}</button>
        ))}
      </div>
      <label style={{ fontWeight: 600, fontSize: 13 }}>Out-Regel</label>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {outRules.map(r => (
          <button key={r.value} onClick={() => onChange({ ...config, outRule: r.value })}
            style={pillStyle(config.outRule === r.value)}>{r.label}</button>
        ))}
      </div>
      <label style={{ fontWeight: 600, fontSize: 13 }}>In-Regel</label>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {inRules.map(r => (
          <button key={r.value} onClick={() => onChange({ ...config, inRule: r.value })}
            style={pillStyle(config.inRule === r.value)}>{r.label}</button>
        ))}
      </div>
      <label style={{ fontWeight: 600, fontSize: 13 }}>Legs</label>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {[1, 2, 3, 4, 5].map(n => (
          <button key={n} onClick={() => onChange({ ...config, bestOfLegs: n, structureKind: 'legs' })}
            style={pillStyle(config.bestOfLegs === n && config.structureKind === 'legs')}>FT{n}</button>
        ))}
      </div>
    </div>
  )
}

// ---- Cricket Config Component ----

function CricketConfig({ config, onChange }: { config: GameConfig; onChange: (c: GameConfig) => void }) {
  const styleOptions = [
    { value: 'standard', label: 'Standard' },
    { value: 'cutthroat', label: 'Cutthroat' },
    { value: 'simple', label: 'Simple' },
    { value: 'crazy', label: 'Crazy' },
  ]

  const isCrazy = config.cricketStyle === 'crazy'
  const isCutthroat = config.cricketStyle === 'cutthroat'
  // Bei Crazy: Scoring-Mode separat wählen (Standard/Cutthroat/Simple)
  const crazyScoringMode = config.cricketCrazyScoringMode ?? 'standard'

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <label style={{ fontWeight: 600, fontSize: 13 }}>Variante</label>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {[
          { value: 'short', label: 'Short (15-20)' },
          { value: 'long', label: 'Long (10-20)' },
        ].map(r => (
          <button key={r.value} onClick={() => onChange({ ...config, cricketRange: r.value as any })}
            style={pillStyle(config.cricketRange === r.value)}>{r.label}</button>
        ))}
      </div>
      <label style={{ fontWeight: 600, fontSize: 13 }}>Stil</label>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {styleOptions.map(s => (
          <button key={s.value} onClick={() => onChange({ ...config, cricketStyle: s.value as any })}
            style={pillStyle(config.cricketStyle === s.value)}>{s.label}</button>
        ))}
      </div>

      {/* Cutthroat Endgame */}
      {isCutthroat && (
        <>
          <label style={{ fontWeight: 600, fontSize: 13 }}>Endgame</label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button onClick={() => onChange({ ...config, cricketCutthroatEndgame: 'standard' })}
              style={pillStyle(config.cricketCutthroatEndgame !== 'suddenDeath')}>3 Runden</button>
            <button onClick={() => onChange({ ...config, cricketCutthroatEndgame: 'suddenDeath' })}
              style={pillStyle(config.cricketCutthroatEndgame === 'suddenDeath')}>Sudden Death</button>
          </div>
        </>
      )}

      {/* Crazy-Optionen */}
      {isCrazy && (
        <>
          <label style={{ fontWeight: 600, fontSize: 13 }}>Crazy: Darts</label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button onClick={() => onChange({ ...config, cricketCrazyMode: 'normal' })}
              style={pillStyle(config.cricketCrazyMode !== 'pro')}>1 Ziel/Turn</button>
            <button onClick={() => onChange({ ...config, cricketCrazyMode: 'pro' })}
              style={pillStyle(config.cricketCrazyMode === 'pro')}>3 Ziele/Turn</button>
          </div>
          <label style={{ fontWeight: 600, fontSize: 13 }}>Crazy: Zielzahl</label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button onClick={() => onChange({ ...config, cricketCrazySameForAll: true })}
              style={pillStyle(config.cricketCrazySameForAll !== false)}>Gleich für alle</button>
            <button onClick={() => onChange({ ...config, cricketCrazySameForAll: false })}
              style={pillStyle(config.cricketCrazySameForAll === false)}>Pro Spieler</button>
          </div>
          <label style={{ fontWeight: 600, fontSize: 13 }}>Crazy: Punkte</label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button onClick={() => onChange({ ...config, cricketCrazyScoringMode: 'standard' })}
              style={pillStyle(crazyScoringMode === 'standard')}>Standard</button>
            <button onClick={() => onChange({ ...config, cricketCrazyScoringMode: 'cutthroat' })}
              style={pillStyle(crazyScoringMode === 'cutthroat')}>Cutthroat</button>
            <button onClick={() => onChange({ ...config, cricketCrazyScoringMode: 'simple' })}
              style={pillStyle(crazyScoringMode === 'simple')}>Simple</button>
          </div>
        </>
      )}

      <label style={{ fontWeight: 600, fontSize: 13 }}>Legs</label>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {[1, 2, 3, 4, 5].map(n => (
          <button key={n} onClick={() => onChange({ ...config, cricketLegs: n })}
            style={pillStyle(config.cricketLegs === n)}>FT{n}</button>
        ))}
      </div>
    </div>
  )
}

// ---- Simple Config (for modes with just legs) ----

function SimpleLegsConfig({ config, onChange, label }: { config: GameConfig; onChange: (c: GameConfig) => void; label?: string }) {
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <label style={{ fontWeight: 600, fontSize: 13 }}>{label || 'Legs'}</label>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {[1, 2, 3, 4, 5].map(n => (
          <button key={n} onClick={() => onChange({ ...config, bestOfLegs: n })}
            style={pillStyle(config.bestOfLegs === n)}>FT{n}</button>
        ))}
      </div>
    </div>
  )
}

// ---- Shared primitives for mode-specific configs ----

const configLabel: React.CSSProperties = { fontWeight: 600, fontSize: 13 }
const configHint: React.CSSProperties = { fontSize: 11, color: '#6b7280' }
const selectStyle: React.CSSProperties = {
  padding: '8px 10px',
  borderRadius: 8,
  border: '1px solid #d1d5db',
  fontSize: 13,
  fontWeight: 600,
  background: '#fff',
  color: '#111827',
  cursor: 'pointer',
  minWidth: 160,
}
const checkboxRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  fontSize: 13,
  cursor: 'pointer',
  userSelect: 'none',
}

function LegsRow({ config, onChange }: { config: GameConfig; onChange: (c: GameConfig) => void }) {
  return (
    <>
      <label style={configLabel}>Legs</label>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {[1, 2, 3, 4, 5].map(n => (
          <button key={n} onClick={() => onChange({ ...config, bestOfLegs: n })}
            style={pillStyle(config.bestOfLegs === n)}>FT{n}</button>
        ))}
      </div>
    </>
  )
}

// ---- ATB Config ----

function ATBConfig({ config, onChange }: { config: GameConfig; onChange: (c: GameConfig) => void }) {
  const direction = config.atbDirection ?? 'forward'
  const sequenceMode = config.atbSequenceMode ?? 'ascending'
  const targetMode = config.atbTargetMode ?? 'any'
  const multiplierMode = config.atbMultiplierMode ?? 'standard'
  const specialRule = config.atbSpecialRule ?? 'none'
  const miss3BackVariant = config.atbMiss3BackVariant ?? 'previous'
  const bullPosition = config.atbBullPosition ?? 'end'

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <label style={configLabel}>Richtung</label>
      <select style={selectStyle} value={direction}
        onChange={e => onChange({ ...config, atbDirection: e.target.value as any })}>
        <option value="forward">Vorwärts</option>
        <option value="backward">Rückwärts</option>
      </select>

      <label style={configLabel}>Reihenfolge</label>
      <select style={selectStyle} value={sequenceMode}
        onChange={e => onChange({ ...config, atbSequenceMode: e.target.value as any })}>
        <option value="ascending">Aufsteigend (1–20)</option>
        <option value="board">Board-Reihenfolge</option>
        <option value="random">Zufällig</option>
      </select>

      <label style={configLabel}>Zielmodus</label>
      <select style={selectStyle} value={targetMode}
        onChange={e => onChange({ ...config, atbTargetMode: e.target.value as any })}>
        <option value="any">Alle (Single/Double/Triple)</option>
        <option value="single">Nur Single</option>
        <option value="double">Nur Double</option>
        <option value="triple">Nur Triple</option>
        <option value="mixed">S → D → T (fest)</option>
        <option value="mixedRandom">Mix zufällig</option>
      </select>

      <label style={configLabel}>Multiplier</label>
      <select style={selectStyle} value={multiplierMode}
        onChange={e => onChange({ ...config, atbMultiplierMode: e.target.value as any })}>
        <option value="standard">Standard (D=2, T=3)</option>
        <option value="standard2">Spezial (D=2, T=2)</option>
        <option value="single">Nur Single (1 Feld)</option>
      </select>

      <label style={configLabel}>Spezialregel</label>
      <select style={selectStyle} value={specialRule}
        onChange={e => onChange({ ...config, atbSpecialRule: e.target.value as any })}>
        <option value="none">Keine</option>
        <option value="bullHeavy">Bull Heavy</option>
        <option value="suddenDeath">Sudden Death</option>
        <option value="noDoubleEscape">No Double Escape</option>
        <option value="miss3Back">3× Miss zurück</option>
      </select>

      {specialRule === 'miss3Back' && (
        <>
          <label style={configLabel}>Bei 3× Miss</label>
          <select style={selectStyle} value={miss3BackVariant}
            onChange={e => onChange({ ...config, atbMiss3BackVariant: e.target.value as any })}>
            <option value="previous">Vorherige Zahl</option>
            <option value="start">Zurück zum Start</option>
          </select>
        </>
      )}

      <label style={configLabel}>Bull-Position</label>
      <select style={selectStyle} value={bullPosition}
        onChange={e => onChange({ ...config, atbBullPosition: e.target.value as any })}>
        <option value="start">Am Anfang</option>
        <option value="end">Am Ende</option>
        <option value="random">Zufällig</option>
      </select>

      <LegsRow config={config} onChange={onChange} />
    </div>
  )
}

// ---- Killer Config ----

function KillerConfig({ config, onChange }: { config: GameConfig; onChange: (c: GameConfig) => void }) {
  const lives = config.killerLives ?? 3
  const qualifyingRing = config.killerQualifyingRing ?? 'DOUBLE'
  const hitsToBecomeKiller = config.killerHitsToBecomeKiller ?? 1
  const friendlyFire = config.killerFriendlyFire ?? true
  const selfHeal = config.killerSelfHeal ?? false
  const noNegativeLives = config.killerNoNegativeLives ?? true
  const secretNumbers = config.killerSecretNumbers ?? false

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <label style={configLabel}>Leben</label>
      <select style={selectStyle} value={lives}
        onChange={e => onChange({ ...config, killerLives: parseInt(e.target.value, 10) })}>
        {[2, 3, 4, 5].map(n => <option key={n} value={n}>{n}</option>)}
      </select>

      <label style={configLabel}>Qualifying-Ring</label>
      <select style={selectStyle} value={qualifyingRing}
        onChange={e => onChange({ ...config, killerQualifyingRing: e.target.value as any })}>
        <option value="DOUBLE">Double</option>
        <option value="TRIPLE">Triple</option>
      </select>

      <label style={configLabel}>Treffer zum Killer</label>
      <select style={selectStyle} value={hitsToBecomeKiller}
        onChange={e => onChange({ ...config, killerHitsToBecomeKiller: parseInt(e.target.value, 10) })}>
        {[1, 2, 3].map(n => <option key={n} value={n}>{n}</option>)}
      </select>

      <label style={checkboxRowStyle}>
        <input type="checkbox" checked={friendlyFire}
          onChange={e => onChange({ ...config, killerFriendlyFire: e.target.checked })} />
        Friendly Fire
      </label>
      <label style={checkboxRowStyle}>
        <input type="checkbox" checked={selfHeal}
          onChange={e => onChange({ ...config, killerSelfHeal: e.target.checked })} />
        Selbstheilung
      </label>
      <label style={checkboxRowStyle}>
        <input type="checkbox" checked={noNegativeLives}
          onChange={e => onChange({ ...config, killerNoNegativeLives: e.target.checked })} />
        Keine negativen Leben
      </label>
      <label style={checkboxRowStyle}>
        <input type="checkbox" checked={secretNumbers}
          onChange={e => onChange({ ...config, killerSecretNumbers: e.target.checked })} />
        Geheime Zahlen
      </label>

      <LegsRow config={config} onChange={onChange} />
    </div>
  )
}

// ---- CTF Config ----

function CTFConfig({ config, onChange }: { config: GameConfig; onChange: (c: GameConfig) => void }) {
  const rounds = config.ctfRounds ?? 20
  const sequenceMode = config.ctfSequenceMode ?? 'ascending'
  const multiplierMode = config.ctfMultiplierMode ?? 'standard'
  const rotateOrder = config.ctfRotateOrder ?? true
  const retryZeroDraw = config.ctfRetryZeroDraw ?? false

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <label style={configLabel}>Anzahl Runden</label>
      <input type="number" min={1} max={50} value={rounds}
        onChange={e => {
          const n = parseInt(e.target.value, 10)
          onChange({ ...config, ctfRounds: isNaN(n) ? 20 : n })
        }}
        style={{ ...selectStyle, minWidth: 100, textAlign: 'center' }} />

      <label style={configLabel}>Feldfolge</label>
      <select style={selectStyle} value={sequenceMode}
        onChange={e => onChange({ ...config, ctfSequenceMode: e.target.value as any })}>
        <option value="ascending">Aufsteigend (1→20)</option>
        <option value="board">Board-Reihenfolge</option>
        <option value="random">Zufällig</option>
      </select>

      <label style={configLabel}>Multiplier</label>
      <select style={selectStyle} value={multiplierMode}
        onChange={e => onChange({ ...config, ctfMultiplierMode: e.target.value as any })}>
        <option value="standard">Standard (S=1, D=2, T=3)</option>
        <option value="standard2">Spezial (S=1, D/T=2)</option>
        <option value="single">Single (alles × 1)</option>
      </select>

      <label style={checkboxRowStyle}>
        <input type="checkbox" checked={rotateOrder}
          onChange={e => onChange({ ...config, ctfRotateOrder: e.target.checked })} />
        Wurfreihenfolge rotieren
      </label>
      <label style={checkboxRowStyle}>
        <input type="checkbox" checked={retryZeroDraw}
          onChange={e => onChange({ ...config, ctfRetryZeroDraw: e.target.checked })} />
        0-Draw Felder wiederholen
      </label>

      <LegsRow config={config} onChange={onChange} />
    </div>
  )
}

// ---- Sträußchen Config ----

function StrConfig({ config, onChange }: { config: GameConfig; onChange: (c: GameConfig) => void }) {
  const mode = config.strMode ?? 'single'
  const ringMode = config.strRingMode ?? 'triple'
  const targetNumber = config.strTargetNumber ?? 20
  const numberOrder = config.strNumberOrder ?? 'fixed'
  const bullMode = config.strBullMode ?? 'red-only'
  const bullPosition = config.strBullPosition ?? 'end'

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <label style={configLabel}>Modus</label>
      <select style={selectStyle} value={mode}
        onChange={e => onChange({ ...config, strMode: e.target.value as any })}>
        <option value="single">Eine Zahl</option>
        <option value="all">Alle Zahlen</option>
      </select>

      <label style={configLabel}>Ring</label>
      <select style={selectStyle} value={ringMode}
        onChange={e => onChange({ ...config, strRingMode: e.target.value as any })}>
        <option value="triple">Triple</option>
        <option value="double">Double</option>
      </select>

      {mode === 'single' && (
        <>
          <label style={configLabel}>Zielzahl</label>
          <select style={selectStyle} value={targetNumber}
            onChange={e => onChange({ ...config, strTargetNumber: parseInt(e.target.value, 10) })}>
            {Array.from({ length: 20 }, (_, i) => i + 1).map(n => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </>
      )}

      <label style={configLabel}>Zahlen-Reihenfolge</label>
      <select style={selectStyle} value={numberOrder}
        onChange={e => onChange({ ...config, strNumberOrder: e.target.value as any })}>
        <option value="fixed">Fest</option>
        <option value="sequential">Sequentiell</option>
        <option value="random">Zufällig</option>
      </select>

      <label style={configLabel}>Bull-Modus</label>
      <select style={selectStyle} value={bullMode}
        onChange={e => onChange({ ...config, strBullMode: e.target.value as any })}>
        <option value="red-only">Nur rote Bull</option>
        <option value="both">Beide</option>
      </select>

      <label style={configLabel}>Bull-Position</label>
      <select style={selectStyle} value={bullPosition}
        onChange={e => onChange({ ...config, strBullPosition: e.target.value as any })}>
        <option value="start">Am Anfang</option>
        <option value="end">Am Ende</option>
        <option value="random">Zufällig</option>
      </select>

      <LegsRow config={config} onChange={onChange} />
    </div>
  )
}

// ---- Highscore Config ----

function HighscoreConfig({ config, onChange }: { config: GameConfig; onChange: (c: GameConfig) => void }) {
  const targetScore = config.highscoreTargetScore ?? 500
  const clamp = (n: number) => Math.max(300, Math.min(999, n))

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <label style={configLabel}>Zielpunktzahl (300–999)</label>
      {/* Presets */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {[300, 500, 750, 999].map(n => (
          <button key={n} type="button"
            onClick={() => onChange({ ...config, highscoreTargetScore: n })}
            style={{
              padding: '6px 12px', borderRadius: 6, fontSize: 13, fontWeight: 600,
              border: `1px solid ${targetScore === n ? '#3b82f6' : '#444'}`,
              background: targetScore === n ? '#1e3a5f' : '#222',
              color: targetScore === n ? '#3b82f6' : '#ccc',
              cursor: 'pointer',
            }}>{n}</button>
        ))}
      </div>
      {/* Custom Input */}
      <input type="number" min={300} max={999} value={targetScore}
        onChange={e => onChange({ ...config, highscoreTargetScore: clamp(parseInt(e.target.value, 10) || 500) })}
        style={{ ...selectStyle, textAlign: 'center' }} />
      <div style={configHint}>Wer zuerst das Ziel erreicht, gewinnt.</div>

      <LegsRow config={config} onChange={onChange} />
    </div>
  )
}

// ---- Bob's 27 Config ----

function Bobs27Config({ config, onChange }: { config: GameConfig; onChange: (c: GameConfig) => void }) {
  const includeBull = config.bobs27IncludeBull ?? false
  const allowNegative = config.bobs27AllowNegative ?? false

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <label style={checkboxRowStyle}>
        <input type="checkbox" checked={includeBull}
          onChange={e => onChange({ ...config, bobs27IncludeBull: e.target.checked })} />
        D-Bull als 21. Ziel
      </label>
      <label style={checkboxRowStyle}>
        <input type="checkbox" checked={allowNegative}
          onChange={e => onChange({ ...config, bobs27AllowNegative: e.target.checked })} />
        Minus erlauben
      </label>

      <LegsRow config={config} onChange={onChange} />
    </div>
  )
}

// ---- Operation Config ----

function OperationConfig({ config, onChange }: { config: GameConfig; onChange: (c: GameConfig) => void }) {
  const targetMode = config.operationTargetMode ?? 'RANDOM_NUMBER'
  const targetNumber = config.operationTargetNumber ?? 20

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <label style={configLabel}>Ziel-Modus</label>
      <select style={selectStyle} value={targetMode}
        onChange={e => {
          const next = e.target.value as GameConfig['operationTargetMode']
          const cleaned: GameConfig = { ...config, operationTargetMode: next }
          if (next !== 'MANUAL_NUMBER') delete cleaned.operationTargetNumber
          onChange(cleaned)
        }}>
        <option value="RANDOM_NUMBER">Zufallszahl</option>
        <option value="MANUAL_NUMBER">Zahl wählen</option>
        <option value="BULL">Bull</option>
      </select>

      {targetMode === 'MANUAL_NUMBER' && (
        <>
          <label style={configLabel}>Zielzahl</label>
          <select style={selectStyle} value={targetNumber}
            onChange={e => onChange({ ...config, operationTargetNumber: parseInt(e.target.value, 10) })}>
            {Array.from({ length: 20 }, (_, i) => i + 1).map(n => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </>
      )}

      <LegsRow config={config} onChange={onChange} />
    </div>
  )
}

// ---- Pill button style helper ----

function pillStyle(active: boolean): React.CSSProperties {
  return {
    padding: '8px 14px', borderRadius: 20, fontWeight: 700, fontSize: 13,
    border: active ? '2px solid #2563eb' : '1px solid #d1d5db', cursor: 'pointer',
    background: active ? '#eff6ff' : '#fff', color: active ? '#1d4ed8' : '#374151',
  }
}

// ---- Config summary for guests ----

function configSummary(config: GameConfig | null): string {
  if (!config) return 'Noch nicht konfiguriert'
  const mode = GAME_MODES.find(m => m.id === config.gameType)
  let summary = mode?.label || config.gameType
  if (config.gameType === 'x01') {
    summary += ` ${config.startScore || 501}`
    if (config.outRule) summary += ` ${config.outRule}`
    if (config.bestOfLegs) summary += ` · FT${config.bestOfLegs}`
  } else if (config.gameType === 'cricket') {
    summary += ` ${config.cricketRange === 'long' ? 'Long' : 'Short'}`
    if (config.cricketStyle && config.cricketStyle !== 'standard') summary += ` ${config.cricketStyle}`
    if (config.cricketLegs) summary += ` · FT${config.cricketLegs}`
  } else if (config.bestOfLegs) {
    summary += ` · FT${config.bestOfLegs}`
  }
  return summary
}

// ---- Main Component ----

export default function MultiplayerLobby({
  mode, status, players, phase, error, myPlayerId, roomCode,
  gameConfig, playerOrder, orderType, localProfiles,
  onCreateRoom, onJoinRoom, onAddLocalPlayers, onRemovePlayer,
  onSetGameConfig, onSetPlayerOrder, onTriggerDiceRoll, onStartGame, onReady, onBack, debugLog, spectatorCount = 0, diceRollTrigger = 0,
}: Props) {
  const { colors, isArcade } = useTheme()
  const styles = useMemo(() => getThemedUI(colors, isArcade), [colors, isArcade])

  const [joinCode, setJoinCode] = useState('')
  const [copied, setCopied] = useState(false)
  const [showAddPlayer, setShowAddPlayer] = useState(false)
  const [showConfig, setShowConfig] = useState(false)
  const [showDice, setShowDice] = useState(false)
  const [dragIdx, setDragIdx] = useState<number | null>(null)

  // Host: auto-create room
  useEffect(() => {
    if (mode === 'host' && !roomCode) {
      const code = generateRoomCode()
      onCreateRoom(code)
    }
  }, [mode, roomCode, onCreateRoom])

  // Auto-start when phase changes to 'playing'
  useEffect(() => {
    if (phase === 'playing') {
      onStartGame()
    }
  }, [phase, onStartGame])

  const handleCopyCode = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(roomCode)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {}
  }, [roomCode])

  const handleJoinSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const code = joinCode.trim().toUpperCase()
    if (code.length >= 4) onJoinRoom(code)
  }

  // Add a local player — requires password verification
  const [pendingProfile, setPendingProfile] = useState<Profile | null>(null)
  const [addPlayerPw, setAddPlayerPw] = useState('')
  const [addPlayerError, setAddPlayerError] = useState('')
  const [addPlayerBusy, setAddPlayerBusy] = useState(false)
  const addPlayerPwRef = useRef<HTMLInputElement>(null)

  const handleAddLocalPlayer = (profile: Profile) => {
    setPendingProfile(profile)
    setAddPlayerPw('')
    setAddPlayerError('')
    setTimeout(() => addPlayerPwRef.current?.focus(), 100)
  }

  const confirmAddPlayer = async () => {
    if (!pendingProfile || !addPlayerPw) return
    setAddPlayerBusy(true)
    setAddPlayerError('')
    try {
      const result = await verifyPassword(pendingProfile.id, addPlayerPw)
      if (result.valid) {
        onAddLocalPlayers([{ playerId: pendingProfile.id, name: pendingProfile.name, color: pendingProfile.color }])
        setPendingProfile(null)
        setShowAddPlayer(false)
        setAddPlayerPw('')
      } else {
        setAddPlayerError('Falsches Passwort')
      }
    } catch {
      setAddPlayerError('Fehler bei der Überprüfung')
    } finally {
      setAddPlayerBusy(false)
    }
  }

  // Shuffle: Send dice-roll (animation) + new order separately
  const handleRandomOrder = useCallback(() => {
    const shuffled = [...playerOrder]
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }
    // 1. Trigger dice animation on all devices (dedicated message)
    if (onTriggerDiceRoll) {
      onTriggerDiceRoll()
    } else {
      // Local-only fallback (no multiplayer)
      setShowDice(true)
    }
    // 2. Send the new order (this does NOT trigger dice)
    onSetPlayerOrder(shuffled, 'random')
  }, [playerOrder, onSetPlayerOrder, onTriggerDiceRoll])

  // Show dice when dedicated dice-roll message arrives from server
  const lastDiceTriggerRef = useRef(diceRollTrigger)
  useEffect(() => {
    if (diceRollTrigger > 0 && diceRollTrigger !== lastDiceTriggerRef.current) {
      lastDiceTriggerRef.current = diceRollTrigger
      setShowDice(true)
    }
  }, [diceRollTrigger])

  const handleDiceDone = useCallback(() => {
    setShowDice(false)
  }, [])

  // Move player in order (for simple up/down buttons on mobile)
  const movePlayer = useCallback((fromIdx: number, toIdx: number) => {
    if (toIdx < 0 || toIdx >= playerOrder.length) return
    const newOrder = [...playerOrder]
    const [moved] = newOrder.splice(fromIdx, 1)
    newOrder.splice(toIdx, 0, moved)
    onSetPlayerOrder(newOrder, 'manual')
  }, [playerOrder, onSetPlayerOrder])

  // Config state (local until sent to server)
  const [localConfig, setLocalConfig] = useState<GameConfig>(
    gameConfig || { gameType: 'x01', startScore: 501, outRule: 'double-out', inRule: 'straight-in', bestOfLegs: 3, structureKind: 'legs' }
  )

  // Sync server config to local
  useEffect(() => {
    if (gameConfig) setLocalConfig(gameConfig)
  }, [gameConfig])

  const handleConfigChange = (config: GameConfig) => {
    setLocalConfig(config)
    onSetGameConfig(config)
  }

  const handleSelectGameType = (gameType: GameConfig['gameType']) => {
    const defaults: Record<string, Partial<GameConfig>> = {
      x01: { startScore: 501, outRule: 'double-out', inRule: 'straight-in', bestOfLegs: 3, structureKind: 'legs' },
      cricket: { cricketRange: 'short', cricketStyle: 'standard', cricketLegs: 2 },
      atb: {
        bestOfLegs: 1,
        atbMode: 'standard',
        atbDirection: 'forward',
        atbSequenceMode: 'ascending',
        atbTargetMode: 'any',
        atbMultiplierMode: 'standard',
        atbSpecialRule: 'none',
        atbBullPosition: 'end',
      },
      ctf: {
        bestOfLegs: 1,
        ctfRounds: 20,
        ctfSequenceMode: 'ascending',
        ctfMultiplierMode: 'standard',
        ctfRotateOrder: true,
        ctfRetryZeroDraw: false,
      },
      shanghai: { bestOfLegs: 1 },
      killer: {
        bestOfLegs: 1,
        killerLives: 3,
        killerQualifyingRing: 'DOUBLE',
        killerHitsToBecomeKiller: 1,
        killerFriendlyFire: true,
        killerSelfHeal: false,
        killerNoNegativeLives: true,
        killerSecretNumbers: false,
      },
      str: {
        bestOfLegs: 1,
        strMode: 'single',
        strRingMode: 'triple',
        strTargetNumber: 20,
        strNumberOrder: 'fixed',
        strBullMode: 'red-only',
        strBullPosition: 'end',
      },
      highscore: { bestOfLegs: 1, highscoreTargetScore: 500 },
      bobs27: { bestOfLegs: 1, bobs27IncludeBull: false, bobs27AllowNegative: false },
      operation: { bestOfLegs: 1, operationTargetMode: 'RANDOM_NUMBER' },
    }
    const config = { ...(defaults[gameType] || {}), gameType } as GameConfig
    handleConfigChange(config)
    setShowConfig(true)
  }

  const isHost = mode === 'host'
  const me = players.find(p => p.playerId === myPlayerId)
  const amReady = me?.isReady ?? false
  const nonHostPlayers = players.filter(p => !p.isHost)
  const allNonHostReady = nonHostPlayers.length > 0 && nonHostPlayers.every(p => p.isReady)
  const canStart = isHost && players.length >= 2 && gameConfig !== null && allNonHostReady

  // Players already in room (for filtering add-player list)
  const playerIdsInRoom = useMemo(() => new Set(players.map(p => p.playerId)), [players])

  // Available local profiles (not yet in room)
  const availableProfiles = useMemo(
    () => localProfiles.filter(p => !playerIdsInRoom.has(p.id)),
    [localProfiles, playerIdsInRoom]
  )

  // Ordered player list
  const orderedPlayers = useMemo(() => {
    return playerOrder
      .map(pid => players.find(p => p.playerId === pid))
      .filter(Boolean) as RoomPlayer[]
  }, [playerOrder, players])

  // ---- Styles ----

  const s = {
    page: {
      ...styles.page,
      display: 'flex' as const,
      flexDirection: 'column' as const,
      minHeight: '100dvh',
      gap: 12,
    },
    card: { ...styles.card, padding: 16 },
    title: { fontSize: 20, fontWeight: 800, color: colors.fg, margin: 0 },
    sub: { fontSize: 12, color: colors.fgMuted },
    section: { fontSize: 14, fontWeight: 700, color: colors.fg, marginBottom: 6 },
    codeBox: {
      background: isArcade ? '#1a2e4a' : '#f0f9ff',
      border: `2px dashed ${isArcade ? '#3b82f6' : '#93c5fd'}`,
      borderRadius: 12, padding: '12px 20px', textAlign: 'center' as const,
      cursor: 'pointer',
    },
    code: {
      fontSize: 32, fontWeight: 900, letterSpacing: 6,
      color: isArcade ? '#93c5fd' : '#1d4ed8', fontFamily: 'monospace',
    },
    playerRow: {
      display: 'flex' as const, alignItems: 'center' as const, gap: 8,
      padding: '8px 10px', borderRadius: 10, background: colors.bgCard,
      border: `1px solid ${colors.border}`,
    },
    dot: (color?: string, connected = true) => ({
      width: 10, height: 10, borderRadius: '50%',
      background: connected ? (color || colors.accent) : colors.fgDim,
      flexShrink: 0,
    }),
    badge: (ready: boolean) => ({
      fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 99,
      background: ready ? (isArcade ? '#166534' : '#dcfce7') : (isArcade ? '#78350f' : '#fef3c7'),
      color: ready ? (isArcade ? '#86efac' : '#166534') : (isArcade ? '#fde68a' : '#92400e'),
    }),
    btn: {
      padding: '12px 20px', borderRadius: 10, fontWeight: 700, fontSize: 14,
      border: 'none', cursor: 'pointer', textAlign: 'center' as const,
    },
    btnPrimary: { background: colors.accent, color: isArcade ? '#0a0a0a' : '#fff' },
    btnSecondary: { background: colors.bgMuted, color: colors.fg, border: `1px solid ${colors.border}` },
    btnDanger: { background: 'transparent', color: colors.error, border: `1px solid ${colors.error}` },
    statusDot: {
      width: 8, height: 8, borderRadius: '50%',
      background: status === 'connected' ? '#16a34a' : status === 'error' ? '#dc2626' : '#94a3b8',
    },
    input: {
      width: '100%', padding: '12px 16px', borderRadius: 10,
      border: `2px solid ${colors.border}`, fontSize: 18, fontWeight: 700,
      textAlign: 'center' as const, letterSpacing: 4, fontFamily: 'monospace',
      textTransform: 'uppercase' as const, outline: 'none',
      background: colors.bgInput, color: colors.fg, boxSizing: 'border-box' as const,
    },
  }

  const statusLabels: Record<ConnectionStatus, string> = {
    connecting: 'Verbinde...', connected: 'Verbunden', disconnected: 'Getrennt', error: 'Fehler',
  }

  return (
    <div style={s.page}>
      {/* Dice Animation Overlay */}
      {showDice && <DiceAnimation onDone={handleDiceDone} />}

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={s.title}>{isHost ? 'Match hosten' : 'Match beitreten'}</h2>
        <button style={{ ...styles.backBtn, flexShrink: 0 }} onClick={onBack}>← Zurück</button>
      </div>

      {/* Connection Status + Debug Info */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: status === 'connected' ? '#16a34a' : colors.fgMuted }}>
        <div style={s.statusDot} />
        {statusLabels[status]}
        <span style={{ marginLeft: 8, fontSize: 10, color: colors.fgDim }}>
          P:{players.length}{spectatorCount > 0 ? ` 👁${spectatorCount}` : ''} R:{roomCode || '—'}
        </span>
        {status !== 'connected' && roomCode && (
          <button onClick={() => onCreateRoom(roomCode)} style={{
            marginLeft: 6, padding: '2px 8px', borderRadius: 6, fontSize: 10,
            border: `1px solid ${colors.accent}`, background: 'transparent',
            color: colors.accent, cursor: 'pointer', fontWeight: 700,
          }}>
            ↻
          </button>
        )}
      </div>

      {/* Debug Log */}
      {debugLog && debugLog.length > 0 && (
        <div style={{ fontSize: 10, color: colors.fgDim, background: colors.bgMuted, padding: '6px 8px', borderRadius: 6, fontFamily: 'monospace' }}>
          {debugLog.map((line, i) => <div key={i}>{line}</div>)}
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{ background: isArcade ? '#3a1a1a' : '#fef2f2', border: `1px solid ${colors.error}`,
          color: colors.error, padding: '8px 12px', borderRadius: 8, fontSize: 13 }}>
          {error}
        </div>
      )}

      {/* JOIN: Code Input (before connected) */}
      {mode === 'join' && players.length === 0 && (
        <div style={s.card}>
          <form onSubmit={handleJoinSubmit} style={{ display: 'grid', gap: 10 }}>
            <input
              style={s.input} value={joinCode}
              onChange={e => setJoinCode(e.target.value.toUpperCase())}
              placeholder="CODE" maxLength={6} autoFocus
            />
            <button type="submit" disabled={joinCode.length < 4}
              style={{ ...s.btn, ...s.btnPrimary, opacity: joinCode.length < 4 ? 0.5 : 1 }}>
              Beitreten
            </button>
          </form>
        </div>
      )}

      {/* Room Code (Host) */}
      {isHost && roomCode && (
        <div style={s.card}>
          <div style={s.section}>Raum-Code</div>
          <div style={s.codeBox} onClick={handleCopyCode}>
            <div style={s.code}>{roomCode}</div>
            <div style={{ fontSize: 11, color: colors.fgMuted, marginTop: 4 }}>
              {copied ? 'Kopiert!' : 'Tippen zum Kopieren'}
            </div>
          </div>
        </div>
      )}

      {/* Player List */}
      {players.length > 0 && (
        <div style={s.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={s.section}>Spieler ({players.length})</div>
            {availableProfiles.length > 0 && (
              <button style={{ ...s.btn, ...s.btnSecondary, padding: '6px 12px', fontSize: 12 }}
                onClick={() => setShowAddPlayer(!showAddPlayer)}>
                + Lokal
              </button>
            )}
          </div>

          {/* Add Local Player Picker */}
          {showAddPlayer && (
            <div style={{ display: 'grid', gap: 4, marginBottom: 10, padding: 8, background: colors.bgMuted, borderRadius: 8 }}>
              {pendingProfile ? (
                <>
                  <div style={{ fontSize: 12, color: colors.fg, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={s.dot(pendingProfile.color)} />
                    Passwort für {pendingProfile.name}:
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input
                      ref={addPlayerPwRef}
                      type="password"
                      value={addPlayerPw}
                      onChange={e => setAddPlayerPw(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') confirmAddPlayer(); if (e.key === 'Escape') setPendingProfile(null) }}
                      placeholder="Passwort"
                      disabled={addPlayerBusy}
                      style={{ flex: 1, padding: '6px 10px', borderRadius: 6, border: `1px solid ${addPlayerError ? '#ef4444' : colors.border}`, fontSize: 14, background: colors.bgCard, color: colors.fg }}
                    />
                    <button onClick={confirmAddPlayer} disabled={addPlayerBusy || !addPlayerPw}
                      style={{ padding: '6px 14px', borderRadius: 6, border: 'none', background: colors.accent, color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer', opacity: addPlayerBusy || !addPlayerPw ? 0.5 : 1 }}>
                      {addPlayerBusy ? '...' : 'OK'}
                    </button>
                    <button onClick={() => setPendingProfile(null)}
                      style={{ padding: '6px 10px', borderRadius: 6, border: `1px solid ${colors.border}`, background: 'transparent', color: colors.fgMuted, fontSize: 13, cursor: 'pointer' }}>
                      ✕
                    </button>
                  </div>
                  {addPlayerError && <div style={{ fontSize: 12, color: '#ef4444' }}>{addPlayerError}</div>}
                </>
              ) : (
                <>
                  <div style={{ fontSize: 11, color: colors.fgMuted, marginBottom: 2 }}>Lokalen Spieler hinzufügen:</div>
                  {availableProfiles.map(p => (
                    <button key={p.id} onClick={() => handleAddLocalPlayer(p)}
                      style={{ ...s.playerRow, cursor: 'pointer', border: `1px solid ${colors.border}` }}>
                      <div style={s.dot(p.color)} />
                      <div style={{ fontWeight: 600, fontSize: 13, color: colors.fg }}>{p.name}</div>
                    </button>
                  ))}
                  {availableProfiles.length === 0 && (
                    <div style={{ fontSize: 12, color: colors.fgMuted }}>Keine weiteren Profile verfügbar</div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Ordered Player List with reorder controls */}
          <div style={{ display: 'grid', gap: 4 }}>
            {orderedPlayers.map((p, idx) => (
              <div key={p.playerId} style={{
                ...s.playerRow,
                background: p.playerId === myPlayerId ? (isArcade ? '#1a2e4a' : '#f0f9ff') : colors.bgCard,
              }}>
                {/* Order number */}
                <div style={{ fontWeight: 800, fontSize: 12, color: colors.fgMuted, minWidth: 18, textAlign: 'center' }}>
                  {idx + 1}
                </div>

                <div style={s.dot(p.color, p.connected)} />

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: colors.fg, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.name}
                    {p.isHost && <span style={{ fontSize: 10, color: colors.fgMuted, marginLeft: 4 }}>Host</span>}
                    {p.isLocal && <span style={{ fontSize: 10, color: colors.fgMuted, marginLeft: 4 }}>Lokal</span>}
                  </div>
                </div>

                {/* Ready badge / toggle */}
                {!p.isHost && (
                  p.deviceId === me?.deviceId ? (
                    <button
                      onClick={() => onReady(p.playerId)}
                      style={{
                        ...s.badge(p.isReady),
                        border: 'none', cursor: 'pointer',
                        padding: '4px 10px',
                      }}
                    >
                      {p.isReady ? 'Bereit ✓' : 'Bereit?'}
                    </button>
                  ) : (
                    <div style={s.badge(p.isReady)}>
                      {p.isReady ? 'Bereit' : 'Wartet'}
                    </div>
                  )
                )}

                {/* Reorder buttons (host only) */}
                {isHost && players.length > 1 && (
                  <div style={{ display: 'flex', gap: 2 }}>
                    <button onClick={() => movePlayer(idx, idx - 1)} disabled={idx === 0}
                      style={{ padding: '2px 6px', borderRadius: 4, border: `1px solid ${colors.border}`,
                        background: 'transparent', cursor: idx === 0 ? 'default' : 'pointer',
                        opacity: idx === 0 ? 0.3 : 1, fontSize: 12, color: colors.fg }}>
                      ▲
                    </button>
                    <button onClick={() => movePlayer(idx, idx + 1)} disabled={idx === orderedPlayers.length - 1}
                      style={{ padding: '2px 6px', borderRadius: 4, border: `1px solid ${colors.border}`,
                        background: 'transparent', cursor: idx === orderedPlayers.length - 1 ? 'default' : 'pointer',
                        opacity: idx === orderedPlayers.length - 1 ? 0.3 : 1, fontSize: 12, color: colors.fg }}>
                      ▼
                    </button>
                  </div>
                )}

                {/* Remove button (own local players or host can remove anyone except themselves) */}
                {((!p.isHost && p.deviceId === me?.deviceId) || (isHost && !p.isHost)) && (
                  <button onClick={() => onRemovePlayer(p.playerId)}
                    style={{ padding: '2px 6px', borderRadius: 4, border: `1px solid ${colors.error}`,
                      background: 'transparent', color: colors.error, fontSize: 12, cursor: 'pointer' }}>
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Random order button (host only) */}
          {isHost && players.length >= 2 && (
            <button onClick={handleRandomOrder} style={{
              ...s.btn, ...s.btnSecondary, width: '100%', marginTop: 8, fontSize: 13,
            }}>
              🎲 Zufällige Reihenfolge
            </button>
          )}
        </div>
      )}

      {/* Game Configuration (Host only) */}
      {isHost && status === 'connected' && (
        <div style={s.card}>
          <div style={s.section}>Spielmodus</div>

          {!showConfig ? (
            // Mode selection grid
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              {GAME_MODES.map(m => (
                <button key={m.id} onClick={() => handleSelectGameType(m.id)}
                  style={{
                    ...s.playerRow, cursor: 'pointer', flexDirection: 'column' as any,
                    alignItems: 'flex-start', gap: 2,
                    border: gameConfig?.gameType === m.id ? `2px solid ${colors.accent}` : `1px solid ${colors.border}`,
                    background: gameConfig?.gameType === m.id ? (isArcade ? '#1a2e4a' : '#eff6ff') : colors.bgCard,
                  }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: colors.fg }}>{m.label}</div>
                  <div style={{ fontSize: 10, color: colors.fgMuted }}>{m.sub}</div>
                </button>
              ))}
            </div>
          ) : (
            // Config details
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: colors.accent }}>
                  {GAME_MODES.find(m => m.id === localConfig.gameType)?.label}
                </div>
                <button onClick={() => setShowConfig(false)} style={{ ...s.btn, ...s.btnSecondary, padding: '4px 10px', fontSize: 12 }}>
                  Modus wechseln
                </button>
              </div>

              {localConfig.gameType === 'x01' && <X01Config config={localConfig} onChange={handleConfigChange} />}
              {localConfig.gameType === 'cricket' && <CricketConfig config={localConfig} onChange={handleConfigChange} />}
              {localConfig.gameType === 'atb' && <ATBConfig config={localConfig} onChange={handleConfigChange} />}
              {localConfig.gameType === 'killer' && <KillerConfig config={localConfig} onChange={handleConfigChange} />}
              {localConfig.gameType === 'ctf' && <CTFConfig config={localConfig} onChange={handleConfigChange} />}
              {localConfig.gameType === 'str' && <StrConfig config={localConfig} onChange={handleConfigChange} />}
              {localConfig.gameType === 'highscore' && <HighscoreConfig config={localConfig} onChange={handleConfigChange} />}
              {localConfig.gameType === 'shanghai' && <SimpleLegsConfig config={localConfig} onChange={handleConfigChange} />}
              {localConfig.gameType === 'bobs27' && <Bobs27Config config={localConfig} onChange={handleConfigChange} />}
              {localConfig.gameType === 'operation' && <OperationConfig config={localConfig} onChange={handleConfigChange} />}
            </div>
          )}
        </div>
      )}

      {/* Guest: Show config summary (read-only) */}
      {!isHost && gameConfig && (
        <div style={s.card}>
          <div style={s.section}>Spielmodus</div>
          <div style={{ fontWeight: 700, fontSize: 15, color: colors.accent }}>
            {configSummary(gameConfig)}
          </div>
        </div>
      )}

      {/* Action Buttons */}
      {status === 'connected' && phase === 'lobby' && (
        <div style={{ display: 'grid', gap: 8 }}>
          {/* Guest: Ready toggle (for the primary local player) */}
          {!isHost && players.length >= 2 && (
            <button onClick={() => onReady(myPlayerId)}
              style={{ ...s.btn, ...(amReady ? s.btnSecondary : s.btnPrimary), width: '100%' }}>
              {amReady ? 'Bereit ✓ (tippen zum Widerrufen)' : 'Bereit!'}
            </button>
          )}

          {/* Host: Start button */}
          {isHost && (
            <button onClick={onStartGame} disabled={!canStart}
              style={{ ...s.btn, ...s.btnPrimary, width: '100%', opacity: canStart ? 1 : 0.4 }}>
              {players.length < 2 ? 'Warte auf Mitspieler...'
                : !gameConfig ? 'Bitte Spielmodus wählen'
                : !allNonHostReady ? 'Warte bis alle bereit sind...'
                : 'Spiel starten'}
            </button>
          )}

          {/* Waiting text */}
          {!isHost && players.length < 2 && (
            <div style={{ textAlign: 'center', fontSize: 13, color: colors.fgMuted, padding: 8 }}>
              Warte auf weitere Spieler...
            </div>
          )}
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </div>
  )
}
