// src/screens/NewGameATB.tsx
// Spieler-Auswahl und Konfiguration für Around the Block

import React, { useEffect, useMemo, useState } from 'react'
import { getThemedUI } from '../ui'
import { useTheme } from '../ThemeProvider'
import { getProfiles } from '../storage'
import type {
  ATBDirection,
  ATBStructure,
  ATBSequenceMode,
  ATBTargetMode,
  ATBMultiplierMode,
  ATBSpecialRule,
  ATBMiss3BackVariant,
  ATBBullPosition,
  ATBMatchConfig,
} from '../types/aroundTheBlock'
import type { ATBMode } from '../dartsAroundTheBlock'

type Props = {
  onCancel?: () => void
  onStart?: (data: {
    mode: ATBMode
    direction: ATBDirection
    players: { id: string; name: string; isGuest?: boolean }[]
    structure: ATBStructure
    config: ATBMatchConfig
  }) => void
}

type Profile = { id: string; name: string; createdAt: string; updatedAt: string; color?: string }

function dedupeProfiles(arr: Profile[]): Profile[] {
  const m = new Map<string, Profile>()
  for (const p of arr) if (!m.has(p.id)) m.set(p.id, p)
  return Array.from(m.values())
}

function dedupeIds(arr: string[]): string[] {
  return Array.from(new Set(arr))
}

function id(): string {
  return (Date.now().toString(36) + Math.random().toString(36).slice(2, 8)).toUpperCase()
}

const GUEST_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#14b8a6', '#f97316', '#84cc16']

export default function NewGameATB({ onCancel, onStart }: Props) {
  const { isArcade, colors } = useTheme()
  const styles = useMemo(() => getThemedUI(colors, isArcade), [colors, isArcade])

  const profiles = dedupeProfiles(getProfiles())

  type GuestPick = { id: string; name: string; color: string; isGuest: true }
  const [guests, setGuests] = useState<GuestPick[]>([])

  const [selected, setSelected] = useState<string[]>([])
  const [order, setOrder] = useState<string[]>([])

  // Legs/Sets Konfiguration
  const [structureKind, setStructureKind] = useState<'legs' | 'sets'>('legs')
  const [bestOfLegs, setBestOfLegs] = useState(1)
  const [bestOfSets, setBestOfSets] = useState(3)
  const [legsPerSet, setLegsPerSet] = useState(3)

  // Erweiterte Konfiguration
  const [sequenceMode, setSequenceMode] = useState<ATBSequenceMode>('ascending')
  const [direction, setDirection] = useState<ATBDirection>('forward')
  const [bullPosition, setBullPosition] = useState<ATBBullPosition>('end')
  const [targetMode, setTargetMode] = useState<ATBTargetMode>('any')
  const [multiplierMode, setMultiplierMode] = useState<ATBMultiplierMode>('standard')
  const [specialRule, setSpecialRule] = useState<ATBSpecialRule>('none')
  const [miss3BackVariant, setMiss3BackVariant] = useState<ATBMiss3BackVariant>('previous')

  // Legacy mode für Kompatibilität
  const mode: ATBMode = sequenceMode === 'random' ? 'ascending' : sequenceMode

  const maxPlayers = 8

  const mixedList = useMemo(() => {
    const guestAsProfiles: Profile[] = guests.map((g) => ({
      id: g.id,
      name: g.name,
      color: g.color,
      createdAt: '',
      updatedAt: '',
    }))
    return [...profiles, ...guestAsProfiles]
  }, [profiles, guests])

  const toggleSel = (pid: string) => {
    setSelected((prev) => {
      const exists = prev.includes(pid)
      if (exists) {
        setOrder((o) => o.filter((x) => x !== pid))
        return prev.filter((x) => x !== pid)
      } else {
        if (prev.length >= maxPlayers) return prev
        setOrder((o) => dedupeIds([...o, pid]))
        return dedupeIds([...prev, pid])
      }
    })
  }

  const moveInOrder = (pid: string, dir: -1 | 1) => {
    setOrder((o) => {
      const list = dedupeIds(o)
      const i = list.indexOf(pid)
      if (i === -1) return list
      const j = i + dir
      if (j < 0 || j >= list.length) return list
      const copy = [...list]
      const [item] = copy.splice(i, 1)
      copy.splice(j, 0, item)
      return copy
    })
  }

  const shuffleOrder = () => {
    setOrder((o) => {
      const list = dedupeIds(o)
      const shuffled = [...list]
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
      }
      return shuffled
    })
  }

  const addGuest = () => {
    const idx = guests.length % GUEST_COLORS.length
    const color = GUEST_COLORS[idx]
    const gid = `guest-${id()}`
    const nice = ['Blau', 'Grün', 'Orange', 'Rot', 'Violett', 'Türkis', 'Amber', 'Lime'][idx] ?? 'Gast'
    const g: GuestPick = { id: gid, name: `Gast (${nice})`, color, isGuest: true }
    setGuests((prev) => [...prev, g])
    setSelected((s) => dedupeIds([...s, gid]))
    setOrder((o) => dedupeIds([...o, gid]))
  }

  const canStart = selected.length >= 1 && selected.length <= maxPlayers

  // Disabled-Zustände berechnen
  const directionDisabled = sequenceMode === 'random'
  const noDoubleEscapeDisabled = ['single', 'triple', 'double', 'mixed', 'mixedRandom'].includes(targetMode)
  const bullHeavyDisabled = ['mixed', 'mixedRandom'].includes(targetMode)

  // Auto-Reset bei Konflikten
  useEffect(() => {
    if (noDoubleEscapeDisabled && specialRule === 'noDoubleEscape') {
      setSpecialRule('none')
    }
    if (bullHeavyDisabled && specialRule === 'bullHeavy') {
      setSpecialRule('none')
    }
  }, [targetMode, noDoubleEscapeDisabled, bullHeavyDisabled, specialRule])

  const pill = (active: boolean, disabled = false): React.CSSProperties => ({
    ...styles.pill,
    ...(active ? {
      borderColor: colors.accent,
      background: isArcade ? colors.accent : '#e0f2fe',
      color: isArcade ? '#fff' : '#0369a1',
    } : {}),
    ...(disabled ? {
      background: colors.bgMuted,
      color: colors.fgDim,
      opacity: 0.5,
      cursor: 'not-allowed',
    } : {}),
  })

  const handleStart = () => {
    if (!canStart) return

    const orderedPlayers = order
      .filter((pid) => selected.includes(pid))
      .map((pid) => {
        const profile = mixedList.find((p) => p.id === pid)
        const guest = guests.find((g) => g.id === pid)
        return {
          id: pid,
          name: profile?.name ?? guest?.name ?? pid,
          isGuest: !!guest,
        }
      })

    const structure: ATBStructure = structureKind === 'legs'
      ? { kind: 'legs', bestOfLegs }
      : { kind: 'sets', bestOfSets, legsPerSet }

    const config: ATBMatchConfig = {
      sequenceMode,
      targetMode,
      multiplierMode,
      specialRule,
      miss3BackVariant: specialRule === 'miss3Back' ? miss3BackVariant : undefined,
      bullPosition,
    }

    onStart?.({ mode, direction, players: orderedPlayers, structure, config })
  }

  return (
    <div style={styles.page}>
      <div style={styles.headerRow}>
        <h2 style={{ margin: 0, color: colors.fg }}>Around the Block</h2>
        {onCancel && (
          <button style={styles.backBtn} onClick={onCancel}>
            ← Zurück
          </button>
        )}
      </div>

      <div style={styles.centerPage}>
        <div style={styles.centerInner}>
          {/* Reihenfolge */}
          <div style={styles.card}>
            <div style={{ ...styles.title, marginBottom: 8 }}>Reihenfolge</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
              <button style={pill(sequenceMode === 'ascending')} onClick={() => setSequenceMode('ascending')}>
                Zählend (1-20)
              </button>
              <button style={pill(sequenceMode === 'board')} onClick={() => setSequenceMode('board')}>
                Ums Board
              </button>
              <button style={pill(sequenceMode === 'random')} onClick={() => setSequenceMode('random')}>
                Random
              </button>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                style={pill(direction === 'forward', directionDisabled)}
                onClick={() => !directionDisabled && setDirection('forward')}
                disabled={directionDisabled}
              >
                Vorwärts
              </button>
              <button
                style={pill(direction === 'backward', directionDisabled)}
                onClick={() => !directionDisabled && setDirection('backward')}
                disabled={directionDisabled}
              >
                Rückwärts
              </button>
            </div>
            {directionDisabled && (
              <div style={{ ...styles.sub, marginTop: 6, fontSize: 11, color: colors.fgDim }}>
                Bei Random ist die Richtung irrelevant
              </div>
            )}
          </div>

          {/* Bull-Position */}
          <div style={styles.card}>
            <div style={{ ...styles.title, marginBottom: 8 }}>Bull-Position</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button style={pill(bullPosition === 'start')} onClick={() => setBullPosition('start')}>
                Bull am Anfang
              </button>
              <button style={pill(bullPosition === 'end')} onClick={() => setBullPosition('end')}>
                Bull am Ende
              </button>
              <button style={pill(bullPosition === 'random')} onClick={() => setBullPosition('random')}>
                Bull Random
              </button>
            </div>
            <div style={{ ...styles.sub, marginTop: 6, fontSize: 11 }}>
              {bullPosition === 'start' && 'Bull muss zuerst getroffen werden'}
              {bullPosition === 'end' && 'Bull muss zuletzt getroffen werden'}
              {bullPosition === 'random' && 'Bull ist an zufälliger Position - kann nicht übersprungen werden!'}
            </div>
          </div>

          {/* Ziele */}
          <div style={styles.card}>
            <div style={{ ...styles.title, marginBottom: 8 }}>Ziele</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button style={pill(targetMode === 'any')} onClick={() => setTargetMode('any')}>
                Alle (S/D/T)
              </button>
              <button style={pill(targetMode === 'single')} onClick={() => setTargetMode('single')}>
                Nur Single
              </button>
              <button style={pill(targetMode === 'double')} onClick={() => setTargetMode('double')}>
                Nur Double
              </button>
              <button style={pill(targetMode === 'triple')} onClick={() => setTargetMode('triple')}>
                Nur Triple
              </button>
              <button style={pill(targetMode === 'mixed')} onClick={() => setTargetMode('mixed')}>
                Mixed (S→D→T)
              </button>
              <button style={pill(targetMode === 'mixedRandom')} onClick={() => setTargetMode('mixedRandom')}>
                Mixed Zufall
              </button>
            </div>
            <div style={{ ...styles.sub, marginTop: 6, fontSize: 11 }}>
              {targetMode === 'any' && 'Jeder Treffer auf die Zahl zählt'}
              {targetMode === 'single' && 'Nur Single-Felder zählen'}
              {targetMode === 'double' && 'Nur Double-Felder zählen'}
              {targetMode === 'triple' && 'Nur Triple-Felder zählen (Bull = Single)'}
              {targetMode === 'mixed' && 'Für jede Zahl: erst Single, dann Double, dann Triple'}
              {targetMode === 'mixedRandom' && 'Zufälliger Multiplier pro Zahl'}
            </div>
          </div>

          {/* Multiplier/Punkteberechnung (bei 'any') */}
          {targetMode === 'any' && (
            <div style={styles.card}>
              <div style={{ ...styles.title, marginBottom: 8 }}>Multiplier</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button style={pill(multiplierMode === 'standard')} onClick={() => setMultiplierMode('standard')}>
                  Standard (S=1, D=2, T=3)
                </button>
                <button style={pill(multiplierMode === 'standard2')} onClick={() => setMultiplierMode('standard2')}>
                  Standard2 (S=1, D/T=2)
                </button>
                <button style={pill(multiplierMode === 'single')} onClick={() => setMultiplierMode('single')}>
                  Single (alle=1)
                </button>
              </div>
              <div style={{ ...styles.sub, marginTop: 6, fontSize: 11 }}>
                {multiplierMode === 'standard' && 'Double springt 2 Felder, Triple springt 3 Felder'}
                {multiplierMode === 'standard2' && 'Double und Triple springen beide 2 Felder'}
                {multiplierMode === 'single' && 'Jeder Treffer springt nur 1 Feld'}
              </div>
            </div>
          )}

          {/* Spezialregeln */}
          <div style={styles.card}>
            <div style={{ ...styles.title, marginBottom: 8 }}>Spezialregeln</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button style={pill(specialRule === 'none')} onClick={() => setSpecialRule('none')}>
                Keine
              </button>
              <button
                style={pill(specialRule === 'bullHeavy', bullHeavyDisabled)}
                onClick={() => !bullHeavyDisabled && setSpecialRule('bullHeavy')}
                disabled={bullHeavyDisabled}
                title={bullHeavyDisabled ? 'Nicht verfügbar bei Mixed-Modi' : undefined}
              >
                Bull Heavy
              </button>
              <button style={pill(specialRule === 'suddenDeath')} onClick={() => setSpecialRule('suddenDeath')}>
                Sudden Death
              </button>
              <button
                style={pill(specialRule === 'noDoubleEscape', noDoubleEscapeDisabled)}
                onClick={() => !noDoubleEscapeDisabled && setSpecialRule('noDoubleEscape')}
                disabled={noDoubleEscapeDisabled}
                title={noDoubleEscapeDisabled ? 'Nur bei "Alle (S/D/T)" verfügbar' : undefined}
              >
                No Double Escape
              </button>
              <button style={pill(specialRule === 'miss3Back')} onClick={() => setSpecialRule('miss3Back')}>
                Miss (3 Fehl)
              </button>
            </div>
            <div style={{ ...styles.sub, marginTop: 6, fontSize: 11 }}>
              {specialRule === 'none' && 'Keine besonderen Regeln'}
              {specialRule === 'bullHeavy' && 'Nach jedem Zahlenabschluss muss Bull getroffen werden'}
              {specialRule === 'suddenDeath' && 'Wer in einer Aufnahme nichts trifft, verliert sofort'}
              {specialRule === 'noDoubleEscape' && 'Mit Double abgeschlossen = nächste Zahl muss auch Double sein'}
              {specialRule === 'miss3Back' && '3 Fehldarts = zurück zur vorherigen Zahl'}
            </div>

            {/* Miss 3 Back Variante */}
            {specialRule === 'miss3Back' && (
              <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${colors.border}` }}>
                <div style={{ ...styles.sub, marginBottom: 4 }}>Bei 3 Fehlwürfen:</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button style={pill(miss3BackVariant === 'previous')} onClick={() => setMiss3BackVariant('previous')}>
                    Vorherige Zahl
                  </button>
                  <button style={pill(miss3BackVariant === 'start')} onClick={() => setMiss3BackVariant('start')}>
                    Auf Anfang
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Legs / Sets Auswahl */}
          <div style={styles.card}>
            <div style={{ ...styles.title, marginBottom: 8 }}>Spielformat</div>

            {/* Format-Auswahl */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <button
                style={pill(structureKind === 'legs')}
                onClick={() => setStructureKind('legs')}
              >
                Legs
              </button>
              <button
                style={pill(structureKind === 'sets')}
                onClick={() => setStructureKind('sets')}
              >
                Sets
              </button>
            </div>

            {structureKind === 'legs' ? (
              <div>
                <div style={{ ...styles.sub, marginBottom: 6 }}>Anzahl Legs (Best of)</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {[1, 3, 5, 7, 9, 11].map((n) => (
                    <button
                      key={n}
                      style={{
                        ...pill(bestOfLegs === n),
                        minWidth: 44,
                      }}
                      onClick={() => setBestOfLegs(n)}
                    >
                      {n === 1 ? '1' : `${Math.ceil(n / 2)}`}
                    </button>
                  ))}
                </div>
                <div style={{ ...styles.sub, marginTop: 6, fontSize: 11 }}>
                  {bestOfLegs === 1
                    ? 'Einzelnes Leg'
                    : `First to ${Math.ceil(bestOfLegs / 2)} Legs`}
                </div>
              </div>
            ) : (
              <div>
                <div style={{ marginBottom: 12 }}>
                  <div style={{ ...styles.sub, marginBottom: 6 }}>Anzahl Sets (Best of)</div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {[1, 3, 5, 7].map((n) => (
                      <button
                        key={n}
                        style={{
                          ...pill(bestOfSets === n),
                          minWidth: 44,
                        }}
                        onClick={() => setBestOfSets(n)}
                      >
                        {Math.ceil(n / 2)}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <div style={{ ...styles.sub, marginBottom: 6 }}>Legs pro Set (Best of)</div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {[1, 3, 5].map((n) => (
                      <button
                        key={n}
                        style={{
                          ...pill(legsPerSet === n),
                          minWidth: 44,
                        }}
                        onClick={() => setLegsPerSet(n)}
                      >
                        {Math.ceil(n / 2)}
                      </button>
                    ))}
                  </div>
                </div>
                <div style={{ ...styles.sub, marginTop: 6, fontSize: 11 }}>
                  First to {Math.ceil(bestOfSets / 2)} Sets (Best of {Math.ceil(legsPerSet / 2)} Legs)
                </div>
              </div>
            )}
          </div>

          {/* Spieler-Auswahl */}
          <div style={styles.card}>
            <div style={{ ...styles.title, marginBottom: 8 }}>Spieler auswählen</div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
              {mixedList.map((p) => {
                const isSel = selected.includes(p.id)
                const guest = guests.find((g) => g.id === p.id)
                return (
                  <button
                    key={p.id}
                    style={{
                      ...pill(isSel),
                      borderLeftWidth: p.color ? 3 : 1,
                      borderLeftColor: p.color ?? (isSel ? colors.accent : colors.border),
                      color: p.color ?? undefined,
                      fontWeight: p.color ? 600 : undefined,
                    }}
                    onClick={() => toggleSel(p.id)}
                  >
                    {p.name}
                  </button>
                )
              })}
              <button style={styles.pill} onClick={addGuest} title="Gast hinzufügen">
                + Gast
              </button>
            </div>

            {/* Reihenfolge */}
            {selected.length > 1 && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ ...styles.sub, marginBottom: 4 }}>
                  Reihenfolge{' '}
                  <button
                    style={{ ...styles.pill, padding: '2px 8px', fontSize: 11, marginLeft: 6 }}
                    onClick={shuffleOrder}
                  >
                    🎲 Mischen
                  </button>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {order
                    .filter((pid) => selected.includes(pid))
                    .map((pid, i) => {
                      const p = mixedList.find((x) => x.id === pid)
                      return (
                        <div
                          key={pid}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 2,
                            background: colors.bgMuted,
                            borderRadius: 6,
                            padding: '2px 6px',
                            fontSize: 12,
                            color: colors.fg,
                          }}
                        >
                          <span style={{ fontWeight: 600 }}>{i + 1}.</span>
                          <span>{p?.name ?? pid}</span>
                          <button
                            style={{ ...styles.pill, padding: '0 4px', fontSize: 10 }}
                            onClick={() => moveInOrder(pid, -1)}
                            disabled={i === 0}
                          >
                            ↑
                          </button>
                          <button
                            style={{ ...styles.pill, padding: '0 4px', fontSize: 10 }}
                            onClick={() => moveInOrder(pid, 1)}
                            disabled={i === order.filter((x) => selected.includes(x)).length - 1}
                          >
                            ↓
                          </button>
                        </div>
                      )
                    })}
                </div>
              </div>
            )}

            {/* Start Button */}
            <button
              style={{
                ...styles.pill,
                width: '100%',
                opacity: canStart ? 1 : 0.5,
                ...(canStart ? {
                  borderColor: isArcade ? colors.accent : '#111827',
                  background: isArcade ? colors.accent : '#111827',
                  color: '#fff',
                  fontWeight: 700,
                } : {}),
              }}
              onClick={handleStart}
              disabled={!canStart}
            >
              Spiel starten →
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
