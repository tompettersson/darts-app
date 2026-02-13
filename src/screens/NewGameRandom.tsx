// src/screens/NewGameRandom.tsx
// Spieler-Auswahl und Legs/Sets Konfiguration für Zufallsspiel

import React, { useMemo, useState } from 'react'
import { getThemedUI } from '../ui'
import { useTheme } from '../ThemeProvider'
import { getProfiles } from '../storage'

type Profile = { id: string; name: string; createdAt: string; updatedAt: string; color?: string }

export type RandomGameStructure =
  | { kind: 'legs'; bestOfLegs: number }
  | { kind: 'sets'; bestOfSets: number; legsPerSet: number }

type Props = {
  onCancel?: () => void
  onStart: (data: {
    players: { id: string; name: string; isGuest?: boolean }[]
    structure: RandomGameStructure
  }) => void
}

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

export default function NewGameRandom({ onCancel, onStart }: Props) {
  const { isArcade, colors } = useTheme()
  const styles = useMemo(() => getThemedUI(colors, isArcade), [colors, isArcade])

  const profiles = dedupeProfiles(getProfiles())

  type GuestPick = { id: string; name: string; color: string; isGuest: true }
  const [guests, setGuests] = useState<GuestPick[]>([])

  const [selected, setSelected] = useState<string[]>([])
  const [order, setOrder] = useState<string[]>([])

  // Legs/Sets Konfiguration
  const [structureKind, setStructureKind] = useState<'legs' | 'sets'>('legs')
  const [bestOfLegs, setBestOfLegs] = useState(3)
  const [bestOfSets, setBestOfSets] = useState(3)
  const [legsPerSet, setLegsPerSet] = useState(3)

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

  const pillActive: React.CSSProperties = {
    ...styles.pill,
    borderColor: colors.accent,
    background: isArcade ? colors.accent : '#e0f2fe',
    color: isArcade ? '#fff' : '#0369a1',
  }
  const pillInactive: React.CSSProperties = { ...styles.pill }
  const pill = (active: boolean) => active ? pillActive : pillInactive

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

    const structure: RandomGameStructure =
      structureKind === 'legs'
        ? { kind: 'legs', bestOfLegs }
        : { kind: 'sets', bestOfSets, legsPerSet }

    onStart({ players: orderedPlayers, structure })
  }

  return (
    <div style={styles.page}>
      <div style={styles.headerRow}>
        <h2 style={{ margin: 0, color: colors.fg }}>Zufallsspiel</h2>
        {onCancel && (
          <button style={styles.backBtn} onClick={onCancel}>
            ← Zurück
          </button>
        )}
      </div>

      <div style={styles.centerPage}>
        <div style={styles.centerInner}>
          {/* Info Box */}
          <div
            style={{
              ...styles.card,
              background: colors.warningBg,
              borderColor: colors.warning,
            }}
          >
            <div style={{ ...styles.title, marginBottom: 4, color: colors.fg }}>Überraschung!</div>
            <div style={styles.sub}>
              Wähle Spieler und Format. Das Spiel wird zufällig ausgewählt: X01, Cricket oder Around
              the Block mit zufälligen Einstellungen.
            </div>
          </div>

          {/* Spieler-Auswahl */}
          <div style={styles.card}>
            <div style={{ ...styles.title, marginBottom: 8, color: colors.fg }}>Spieler auswählen</div>

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

          {/* Legs / Sets Auswahl */}
          <div style={styles.card}>
            <div style={{ ...styles.title, marginBottom: 8, color: colors.fg }}>Spielformat</div>

            {/* Format-Auswahl */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <button style={pill(structureKind === 'legs')} onClick={() => setStructureKind('legs')}>
                Legs
              </button>
              <button style={pill(structureKind === 'sets')} onClick={() => setStructureKind('sets')}>
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
                  {bestOfLegs === 1 ? 'Einzelnes Leg' : `First to ${Math.ceil(bestOfLegs / 2)} Legs`}
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
              padding: '16px',
              fontSize: 16,
              fontWeight: 700,
              background: canStart ? colors.warningBg : colors.bgMuted,
              borderColor: canStart ? colors.warning : colors.border,
              color: colors.fg,
              opacity: canStart ? 1 : 0.5,
            }}
            onClick={handleStart}
            disabled={!canStart}
          >
            Zufallsspiel starten
          </button>
        </div>
      </div>
    </div>
  )
}
