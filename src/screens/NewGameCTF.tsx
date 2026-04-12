// src/screens/NewGameCTF.tsx
// Spieler-Auswahl und Konfiguration für Capture the Field

import React, { useMemo, useState } from 'react'
import { getThemedUI } from '../ui'
import { useTheme } from '../ThemeProvider'
import { getProfiles } from '../storage'
import type { CTFStructure, CTFMultiplierMode, CTFMatchConfig, CTFSequenceMode } from '../types/captureTheField'
import PasswordVerifyModal from '../components/PasswordVerifyModal'
import { usePasswordGatedStart } from '../hooks/usePasswordGatedStart'

type Props = {
  onCancel?: () => void
  onStart?: (data: {
    players: { id: string; name: string; isGuest?: boolean }[]
    structure: CTFStructure
    config: CTFMatchConfig
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

export default function NewGameCTF({ onCancel, onStart }: Props) {
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

  // CTF-spezifische Konfiguration
  const [sequenceMode, setSequenceMode] = useState<CTFSequenceMode>('ascending')
  const [multiplierMode, setMultiplierMode] = useState<CTFMultiplierMode>('standard')
  const [rotateOrder, setRotateOrder] = useState(true)
  const [retryZeroDrawFields, setRetryZeroDrawFields] = useState(false)

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

  const { pendingPlayers, requestStart, onVerified, onCancelled, skipPlayerId } = usePasswordGatedStart()

  const canStart = selected.length >= 2 && selected.length <= maxPlayers

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

  const handleStartConfirmed = () => {
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

    const structure: CTFStructure = structureKind === 'legs'
      ? { kind: 'legs', bestOfLegs }
      : { kind: 'sets', bestOfSets, legsPerSet }

    const config: CTFMatchConfig = { multiplierMode, rotateOrder, retryZeroDrawFields, sequenceMode }

    onStart?.({ players: orderedPlayers, structure, config })
  }

  const handleStart = () => {
    if (!canStart) return
    const playersForVerify = order
      .filter((pid) => selected.includes(pid))
      .map((pid) => {
        const profile = mixedList.find((p) => p.id === pid)
        const guest = guests.find((g) => g.id === pid)
        return { id: pid, name: profile?.name ?? guest?.name ?? pid, color: (profile as any)?.color }
      })
    requestStart(playersForVerify, handleStartConfirmed)
  }

  return (
    <div style={styles.page}>
      <div style={styles.headerRow}>
        <h2 style={{ margin: 0, color: colors.fg }}>Capture the Field</h2>
        {onCancel && (
          <button style={styles.backBtn} onClick={onCancel}>
            ← Zurück
          </button>
        )}
      </div>

      <div style={styles.centerPage}>
        <div style={styles.centerInner}>
          {/* Spieler-Auswahl */}
          <div style={styles.card}>
            <div style={{ ...styles.title, marginBottom: 8 }}>Spieler auswählen</div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
              {mixedList.map((p) => {
                const isSel = selected.includes(p.id)
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
              <button style={{ ...styles.pill, ...(selected.length >= maxPlayers ? { opacity: 0.4, cursor: 'not-allowed' } : {}) }} onClick={addGuest} disabled={selected.length >= maxPlayers} title="Gast hinzufügen">
                {selected.length >= maxPlayers ? `Max ${maxPlayers}` : '+ Gast'}
              </button>
            </div>

            {selected.length === 1 && (
              <div style={{ ...styles.sub, fontSize: 11, color: '#ef4444', marginBottom: 8 }}>
                Mindestens 2 Spieler erforderlich
              </div>
            )}

            {/* Reihenfolge */}
            {selected.length > 1 && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ ...styles.sub, marginBottom: 4 }}>
                  Reihenfolge{' '}
                  <button
                    style={{ ...styles.pill, padding: '2px 8px', fontSize: 11, marginLeft: 6 }}
                    onClick={shuffleOrder}
                  >
                    Mischen
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
          </div>

          {/* Feldfolge-Modus */}
          <div style={styles.card}>
            <div style={{ ...styles.title, marginBottom: 8 }}>Feldfolge</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button style={pill(sequenceMode === 'ascending')} onClick={() => setSequenceMode('ascending')}>
                Zahlenfolge
              </button>
              <button style={pill(sequenceMode === 'descending')} onClick={() => setSequenceMode('descending')}>
                Countdown
              </button>
              <button style={pill(sequenceMode === 'clockwise')} onClick={() => setSequenceMode('clockwise')}>
                Im Uhrzeigersinn
              </button>
              <button style={pill(sequenceMode === 'counterclockwise')} onClick={() => setSequenceMode('counterclockwise')}>
                Gegenlauf
              </button>
              <button style={pill(sequenceMode === 'random')} onClick={() => setSequenceMode('random')}>
                Random
              </button>
            </div>
            <div style={{ ...styles.sub, marginTop: 6, fontSize: 11 }}>
              {sequenceMode === 'ascending' && '1 → 2 → 3 → ... → 20'}
              {sequenceMode === 'descending' && '20 → 19 → 18 → ... → 1'}
              {sequenceMode === 'clockwise' && '1 → 18 → 4 → 13 → 6 → 10 → ...'}
              {sequenceMode === 'counterclockwise' && '20 → 5 → 12 → 9 → 14 → 11 → ...'}
              {sequenceMode === 'random' && 'Zufällige Reihenfolge (bei jedem Leg neu gemischt)'}
            </div>
          </div>

          {/* Multiplier-Modus */}
          <div style={styles.card}>
            <div style={{ ...styles.title, marginBottom: 8 }}>Multiplier-Modus</div>
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
              {multiplierMode === 'standard' && 'Single=1, Double=2, Triple=3 Punkte pro Treffer'}
              {multiplierMode === 'standard2' && 'Single=1, Double/Triple=2 Punkte pro Treffer'}
              {multiplierMode === 'single' && 'Jeder Treffer zählt 1 Punkt'}
            </div>
          </div>

          {/* Optionen */}
          <div style={styles.card}>
            <div style={{ ...styles.title, marginBottom: 8 }}>Optionen</div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: 8 }}>
              <input
                type="checkbox"
                checked={rotateOrder}
                onChange={(e) => setRotateOrder(e.target.checked)}
              />
              <span style={{ fontSize: 12 }}>Wurfreihenfolge pro Feld rotieren</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={retryZeroDrawFields}
                onChange={(e) => setRetryZeroDrawFields(e.target.checked)}
              />
              <div>
                <span style={{ fontSize: 12 }}>0-Draw Felder wiederholen</span>
                <div style={{ fontSize: 10, color: colors.fgMuted, marginTop: 2 }}>
                  Wenn keiner trifft, wird das Feld vor dem Bull nochmal gespielt
                </div>
              </div>
            </label>
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
            Capture the Field starten →
          </button>
        </div>
      </div>
      {pendingPlayers && (
        <PasswordVerifyModal
          players={pendingPlayers.map(p => ({ id: p.id, name: p.name, color: p.color }))}
          skipPlayerId={skipPlayerId}
          onSuccess={onVerified}
          onCancel={onCancelled}
        />
      )}
    </div>
  )
}
