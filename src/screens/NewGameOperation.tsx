// src/screens/NewGameOperation.tsx
// Spieler-Auswahl und Konfiguration fuer Operation

import React, { useMemo, useState } from 'react'
import { getThemedUI } from '../ui'
import { useTheme } from '../ThemeProvider'
import { getProfiles } from '../storage'
import type { OperationConfig, OperationTargetMode } from '../types/operation'

type Props = {
  onCancel?: () => void
  onStart?: (data: {
    players: { id: string; name: string; isGuest?: boolean }[]
    config: OperationConfig
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

function genId(): string {
  return (Date.now().toString(36) + Math.random().toString(36).slice(2, 8)).toUpperCase()
}

const GUEST_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#14b8a6', '#f97316', '#84cc16']

export default function NewGameOperation({ onCancel, onStart }: Props) {
  const { isArcade, colors } = useTheme()
  const styles = useMemo(() => getThemedUI(colors, isArcade), [colors, isArcade])

  const profiles = dedupeProfiles(getProfiles())

  type GuestPick = { id: string; name: string; color: string; isGuest: true }
  const [guests, setGuests] = useState<GuestPick[]>([])

  const [selected, setSelected] = useState<string[]>([])
  const [order, setOrder] = useState<string[]>([])

  // Config
  const [targetMode, setTargetMode] = useState<OperationTargetMode>('MANUAL_NUMBER')
  const [targetNumber, setTargetNumber] = useState<number | null>(null)
  const [legsCount, setLegsCount] = useState(1)

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
    const gid = `guest-${genId()}`
    const nice = ['Blau', 'Gruen', 'Orange', 'Rot', 'Violett', 'Tuerkis', 'Amber', 'Lime'][idx] ?? 'Gast'
    const g: GuestPick = { id: gid, name: `Gast (${nice})`, color, isGuest: true }
    setGuests((prev) => [...prev, g])
    setSelected((s) => dedupeIds([...s, gid]))
    setOrder((o) => dedupeIds([...o, gid]))
  }

  const needsTargetNumber = targetMode === 'MANUAL_NUMBER'
  const canStart =
    selected.length >= 1 &&
    selected.length <= maxPlayers &&
    (!needsTargetNumber || targetNumber !== null)

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

    const config: OperationConfig = {
      legsCount,
      targetMode,
      ...(needsTargetNumber && targetNumber !== null ? { targetNumber } : {}),
    }
    onStart?.({ players: orderedPlayers, config })
  }

  const TARGET_MODE_OPTIONS: { value: OperationTargetMode; label: string }[] = [
    { value: 'MANUAL_NUMBER', label: 'Zahl waehlen' },
    { value: 'RANDOM_NUMBER', label: 'Zufallszahl' },
    { value: 'BULL', label: 'Bull' },
  ]

  const LEGS_OPTIONS = [1, 3, 5, 7]

  return (
    <div style={styles.page}>
      <div style={styles.headerRow}>
        <h2 style={{ margin: 0, color: colors.fg }}>Operation: Ein Feld, keine Gnade</h2>
        {onCancel && (
          <button style={styles.backBtn} onClick={onCancel}>
            &larr; Zurueck
          </button>
        )}
      </div>

      <div style={styles.centerPage}>
        <div style={styles.centerInner}>
          {/* Target Mode */}
          <div style={styles.card}>
            <div style={{ ...styles.title, marginBottom: 8 }}>Ziel-Modus</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
              {TARGET_MODE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  style={pill(targetMode === opt.value)}
                  onClick={() => {
                    setTargetMode(opt.value)
                    if (opt.value !== 'MANUAL_NUMBER') setTargetNumber(null)
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {/* Number Grid for MANUAL_NUMBER */}
            {needsTargetNumber && (
              <div>
                <div style={{ ...styles.sub, marginBottom: 6 }}>Zahl auswaehlen</div>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(5, 1fr)',
                    gap: 6,
                  }}
                >
                  {Array.from({ length: 20 }, (_, i) => i + 1).map((n) => (
                    <button
                      key={n}
                      style={{
                        ...pill(targetNumber === n),
                        padding: '8px 0',
                        fontSize: 15,
                        fontWeight: 700,
                        textAlign: 'center' as const,
                      }}
                      onClick={() => setTargetNumber(n)}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Legs */}
          <div style={styles.card}>
            <div style={{ ...styles.title, marginBottom: 8 }}>Legs</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {LEGS_OPTIONS.map((l) => (
                <button
                  key={l}
                  style={pill(legsCount === l)}
                  onClick={() => setLegsCount(l)}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>

          {/* Spieler-Auswahl */}
          <div style={styles.card}>
            <div style={{ ...styles.title, marginBottom: 8 }}>Spieler auswaehlen</div>

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
              <button style={styles.pill} onClick={addGuest} title="Gast hinzufuegen">
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
                            &uarr;
                          </button>
                          <button
                            style={{ ...styles.pill, padding: '0 4px', fontSize: 10 }}
                            onClick={() => moveInOrder(pid, 1)}
                            disabled={i === order.filter((x) => selected.includes(x)).length - 1}
                          >
                            &darr;
                          </button>
                        </div>
                      )
                    })}
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
            Operation: EFKG starten &rarr;
          </button>
        </div>
      </div>
    </div>
  )
}
