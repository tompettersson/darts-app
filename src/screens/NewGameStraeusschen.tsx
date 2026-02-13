// src/screens/NewGameStraeusschen.tsx
// Konfigurationsscreen für Sträußchen
// Modus (Eine Zahl / Alle Zahlen), Zahl-Picker, Reihenfolge, Spieler, Legs/Sets

import React, { useEffect, useMemo, useState } from 'react'
import { id } from '../darts501'
import { getProfiles, type Profile } from '../storage'
import { getThemedUI } from '../ui'
import { useTheme } from '../ThemeProvider'
import type { StrTargetNumber, StrRingMode, StrBullMode, StrBullPosition } from '../types/straeusschen'
import type { StrMode, StrNumberOrder, StrTurnOrder, StrStructure, StrPlayer } from '../dartsStraeusschen'
import { getTargetLabel } from '../dartsStraeusschen'

type Props = {
  onCancel?: () => void
  onStart?: (data: {
    mode: StrMode
    targetNumber?: StrTargetNumber
    numberOrder?: StrNumberOrder
    turnOrder?: StrTurnOrder
    players: StrPlayer[]
    structure: StrStructure
    ringMode: StrRingMode
    bullMode?: StrBullMode
    bullPosition?: StrBullPosition
  }) => void
}

function dedupeIds(arr: string[]): string[] { return Array.from(new Set(arr)) }

const GUEST_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#14b8a6', '#f97316', '#84cc16']

export default function NewGameStraeusschen({ onCancel, onStart }: Props) {
  const { isArcade, colors } = useTheme()
  const styles = useMemo(() => getThemedUI(colors, isArcade), [colors, isArcade])

  const profiles = useMemo(() => {
    const m = new Map<string, Profile>()
    for (const p of getProfiles()) if (!m.has(p.id)) m.set(p.id, p)
    return Array.from(m.values())
  }, [])

  // Config State
  const [mode, setMode] = useState<StrMode>('single')
  const [ringMode, setRingMode] = useState<StrRingMode>('triple')
  const [targetNumber, setTargetNumber] = useState<StrTargetNumber>(20)
  const [numberOrder, setNumberOrder] = useState<StrNumberOrder>('fixed')
  const [turnOrder, setTurnOrder] = useState<StrTurnOrder>('sequential')
  const [bullMode, setBullMode] = useState<StrBullMode>('red-only')
  const [bullPosition, setBullPosition] = useState<StrBullPosition>('end')

  // Bull relevant?
  const bullRelevant = (mode === 'single' && targetNumber === 25) || mode === 'all'
  const ringLabel = ringMode === 'double' ? 'Double' : 'Triple'
  const [structureKind, setStructureKind] = useState<'legs' | 'sets'>('legs')
  const [targetWins, setTargetWins] = useState(2)
  const [bestOfSets, setBestOfSets] = useState(3)
  const [legsPerSet, setLegsPerSet] = useState(3)

  // Spieler State
  type GuestPick = { id: string; name: string; color: string; isGuest: true }
  const [guests, setGuests] = useState<GuestPick[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [order, setOrder] = useState<string[]>([])

  const maxPlayers = 8
  const canStart = selected.length >= 1

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  const mixedList = useMemo(() => {
    const guestAsProfiles: Profile[] = guests.map(g => ({
      id: g.id, name: g.name, color: g.color, createdAt: '', updatedAt: '',
    }))
    return [...profiles, ...guestAsProfiles]
  }, [profiles, guests])

  const toggleSel = (pid: string) => {
    setSelected(prev => {
      if (prev.includes(pid)) {
        setOrder(o => o.filter(x => x !== pid))
        return prev.filter(x => x !== pid)
      } else {
        if (prev.length >= maxPlayers) return prev
        setOrder(o => dedupeIds([...o, pid]))
        return dedupeIds([...prev, pid])
      }
    })
  }

  const moveInOrder = (pid: string, dir: -1 | 1) => {
    setOrder(o => {
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
    setOrder(o => {
      const list = dedupeIds(o).filter(pid => selected.includes(pid))
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
    setGuests(prev => [...prev, g])
    setSelected(s => dedupeIds([...s, gid]))
    setOrder(o => dedupeIds([...o, gid]))
  }

  const handleStart = () => {
    if (!canStart) return

    const playerIds = dedupeIds(order).filter(pid => selected.includes(pid))
    if (playerIds.length < 1) return

    const idToGuest = new Map(guests.map(g => [g.id, g]))
    const idToProfile = new Map(profiles.map(p => [p.id, p]))

    const players: StrPlayer[] = playerIds.map(pid => {
      const g = idToGuest.get(pid)
      if (g) return { playerId: g.id, name: g.name, isGuest: true }
      const pr = idToProfile.get(pid)!
      return { playerId: pr.id, name: pr.name }
    })

    const structure: StrStructure = structureKind === 'legs'
      ? { kind: 'legs', bestOfLegs: targetWins * 2 - 1 }
      : { kind: 'sets', bestOfSets: Math.ceil(bestOfSets / 2) * 2 - 1, legsPerSet: Math.ceil(legsPerSet / 2) * 2 - 1 }

    onStart?.({
      mode,
      targetNumber: mode === 'single' ? targetNumber : undefined,
      numberOrder: mode === 'all' ? numberOrder : undefined,
      turnOrder: players.length >= 2 ? turnOrder : undefined,
      players,
      structure,
      ringMode,
      bullMode: bullRelevant ? bullMode : undefined,
      bullPosition: (mode === 'all' && numberOrder === 'fixed') ? bullPosition : undefined,
    })
  }

  // Pill styles
  const pillActive: React.CSSProperties = {
    ...styles.pill,
    borderColor: colors.accent,
    background: isArcade ? colors.accent : '#e0f2fe',
    color: isArcade ? '#fff' : '#0369a1',
  }
  const pillInactive: React.CSSProperties = { ...styles.pill }

  return (
    <div style={styles.page}>
      <div style={styles.headerRow}>
        <h2 style={{ margin: 0, color: colors.fg }}>Sträußchen konfigurieren</h2>
        {onCancel && <button style={styles.backBtn} onClick={onCancel}>← Zurück</button>}
      </div>

      <div style={styles.centerPage}>
        <div style={styles.centerInner}>
          {/* Modus */}
          <div style={styles.card}>
            <div style={{ fontWeight: 800, fontSize: 18, color: colors.fg, marginBottom: 8 }}>Modus</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button style={mode === 'single' ? pillActive : pillInactive} onClick={() => setMode('single')}>
                Eine Zahl
              </button>
              <button style={mode === 'all' ? pillActive : pillInactive} onClick={() => setMode('all')}>
                Alle Zahlen
              </button>
            </div>
            <div style={{ ...styles.sub, marginTop: 6 }}>
              {mode === 'single'
                ? `3× ${ringLabel} auf eine gewählte Zahl treffen.`
                : `3× ${ringLabel} auf alle Zahlen + Bull – nacheinander.`}
            </div>
          </div>

          {/* Ring-Modus: Triple / Doppel */}
          <div style={styles.card}>
            <div style={{ fontWeight: 800, fontSize: 18, color: colors.fg, marginBottom: 8 }}>Ring</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button style={ringMode === 'triple' ? pillActive : pillInactive} onClick={() => setRingMode('triple')}>
                Triple
              </button>
              <button style={ringMode === 'double' ? pillActive : pillInactive} onClick={() => setRingMode('double')}>
                Doppel
              </button>
            </div>
            <div style={{ ...styles.sub, marginTop: 6 }}>
              {ringMode === 'triple'
                ? '3× Triple auf jede Zahl treffen.'
                : '3× Double auf jede Zahl treffen.'}
            </div>
          </div>

          {/* Zahl (nur bei single) */}
          {mode === 'single' && (
            <div style={styles.card}>
              <div style={{ fontWeight: 700, marginBottom: 8, color: colors.fg }}>Zielzahl</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {([17, 18, 19, 20, 25] as StrTargetNumber[]).map(n => (
                  <button
                    key={n}
                    style={targetNumber === n ? pillActive : pillInactive}
                    onClick={() => setTargetNumber(n)}
                  >
                    {getTargetLabel(n, ringMode)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Bull-Modus (wenn Bull relevant) */}
          {bullRelevant && (
            <div style={styles.card}>
              <div style={{ fontWeight: 700, marginBottom: 8, color: colors.fg }}>Bull-Modus</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button style={bullMode === 'red-only' ? pillActive : pillInactive} onClick={() => setBullMode('red-only')}>
                  Nur rote Bull
                </button>
                <button style={bullMode === 'both' ? pillActive : pillInactive} onClick={() => setBullMode('both')}>
                  Beide
                </button>
              </div>
              <div style={{ ...styles.sub, marginTop: 6 }}>
                {bullMode === 'red-only'
                  ? 'Nur das innere rote Bull (Double Bull / 50) zählt.'
                  : 'Sowohl äußeres (Single Bull / 25) als auch inneres Bull zählen.'}
              </div>
            </div>
          )}

          {/* Reihenfolge (nur bei all) */}
          {mode === 'all' && (
            <div style={styles.card}>
              <div style={{ fontWeight: 700, marginBottom: 8, color: colors.fg }}>Reihenfolge</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button style={numberOrder === 'fixed' ? pillActive : pillInactive} onClick={() => setNumberOrder('fixed')}>
                  Fest (17→20)
                </button>
                <button style={numberOrder === 'random' ? pillActive : pillInactive} onClick={() => setNumberOrder('random')}>
                  Zufällig
                </button>
                <button style={numberOrder === 'free' ? pillActive : pillInactive} onClick={() => setNumberOrder('free')}>
                  Frei wählen
                </button>
              </div>
            </div>
          )}

          {/* Bull-Position (nur bei all + fixed) */}
          {mode === 'all' && numberOrder === 'fixed' && (
            <div style={styles.card}>
              <div style={{ fontWeight: 700, marginBottom: 8, color: colors.fg }}>Bull-Position</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button style={bullPosition === 'start' ? pillActive : pillInactive} onClick={() => setBullPosition('start')}>
                  Am Anfang
                </button>
                <button style={bullPosition === 'end' ? pillActive : pillInactive} onClick={() => setBullPosition('end')}>
                  Am Ende
                </button>
                <button style={bullPosition === 'random' ? pillActive : pillInactive} onClick={() => setBullPosition('random')}>
                  Zufall
                </button>
              </div>
              <div style={{ ...styles.sub, marginTop: 6 }}>
                {bullPosition === 'start' ? 'Bull → 17 → 18 → 19 → 20'
                  : bullPosition === 'end' ? '17 → 18 → 19 → 20 → Bull'
                  : 'Bull wird zufällig zwischen 17–20 eingereiht.'}
              </div>
            </div>
          )}

          {/* Spielformat */}
          <div style={styles.card}>
            <div style={{ fontWeight: 700, marginBottom: 8, color: colors.fg }}>Spielformat</div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <button style={structureKind === 'legs' ? pillActive : pillInactive} onClick={() => setStructureKind('legs')}>
                Legs
              </button>
              <button style={structureKind === 'sets' ? pillActive : pillInactive} onClick={() => setStructureKind('sets')}>
                Sets
              </button>
            </div>

            {structureKind === 'legs' && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ color: colors.fg }}>First to</span>
                {[1, 2, 3, 4, 5].map(n => (
                  <button key={n} style={targetWins === n ? pillActive : pillInactive} onClick={() => setTargetWins(n)}>
                    {n}
                  </button>
                ))}
                <span style={{ color: colors.fg }}>Legs</span>
              </div>
            )}

            {structureKind === 'sets' && (
              <>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
                  <span style={{ color: colors.fg }}>Best of</span>
                  {[3, 5, 7].map(n => (
                    <button key={n} style={bestOfSets === n ? pillActive : pillInactive} onClick={() => setBestOfSets(n)}>
                      {n}
                    </button>
                  ))}
                  <span style={{ color: colors.fg }}>Sets</span>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ color: colors.fg }}>Best of</span>
                  {[3, 5].map(n => (
                    <button key={n} style={legsPerSet === n ? pillActive : pillInactive} onClick={() => setLegsPerSet(n)}>
                      {n}
                    </button>
                  ))}
                  <span style={{ color: colors.fg }}>Legs/Set</span>
                </div>
              </>
            )}
          </div>

          {/* Spielreihenfolge (nur bei 2+ Spielern) */}
          {selected.length >= 2 && (
            <div style={styles.card}>
              <div style={{ fontWeight: 700, marginBottom: 8, color: colors.fg }}>Spielreihenfolge</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button style={turnOrder === 'sequential' ? pillActive : pillInactive} onClick={() => setTurnOrder('sequential')}>
                  Hintereinander
                </button>
                <button style={turnOrder === 'alternating' ? pillActive : pillInactive} onClick={() => setTurnOrder('alternating')}>
                  Abwechselnd
                </button>
              </div>
              <div style={{ ...styles.sub, marginTop: 6 }}>
                {turnOrder === 'sequential'
                  ? 'Ein Spieler spielt bis fertig, dann der nächste.'
                  : 'Spieler wechseln sich nach jeder Aufnahme ab.'}
              </div>
            </div>
          )}

          {/* Spieler */}
          <div style={{ display: 'grid', gap: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
              <div style={{ ...styles.sub, fontWeight: 700 }}>Spieler (1–8)</div>
              <div style={{ display: 'flex', gap: 8 }}>
                {selected.length >= 2 && (
                  <button style={styles.pill} onClick={shuffleOrder}>Zufällig</button>
                )}
                <button style={styles.pill} onClick={addGuest}>Gast hinzufügen</button>
              </div>
            </div>

            <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
              {mixedList.map(p => {
                const isSel = selected.includes(p.id)
                return (
                  <div key={p.id} style={styles.rowCard}>
                    <label style={{ display: 'flex', gap: 8, alignItems: 'center', color: colors.fg }}>
                      <input type="checkbox" checked={isSel} onChange={() => toggleSel(p.id)} />
                      <span style={{ color: p.color, fontWeight: p.color ? 600 : undefined }}>{p.name}</span>
                    </label>
                    {isSel ? (
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <button style={styles.backBtn} onClick={() => moveInOrder(p.id, -1)}>↑</button>
                        <button style={styles.backBtn} onClick={() => moveInOrder(p.id, +1)}>↓</button>
                        <span style={styles.sub}>Pos: {dedupeIds(order).indexOf(p.id) + 1}</span>
                      </div>
                    ) : <div />}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Start-Button */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            {onCancel && <button style={styles.backBtn} onClick={onCancel}>Abbrechen</button>}
            <button
              style={{
                ...styles.backBtn,
                ...(canStart ? {
                  borderColor: isArcade ? colors.accent : '#111827',
                  background: isArcade ? colors.accent : '#111827',
                  color: '#fff',
                  fontWeight: 700,
                } : {}),
              }}
              disabled={!canStart}
              onClick={handleStart}
            >
              Spiel starten
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
