// src/screens/NewGameBobs27.tsx
// Spieler-Auswahl und Konfiguration fuer Bob's 27

import React, { useMemo, useState } from 'react'
import { getThemedUI } from '../ui'
import { useTheme } from '../ThemeProvider'
import { getProfiles } from '../storage'
import type { Bobs27Config } from '../types/bobs27'

type Props = {
  onCancel?: () => void
  onStart?: (data: {
    players: { id: string; name: string; isGuest?: boolean }[]
    config: Partial<Bobs27Config>
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

export default function NewGameBobs27({ onCancel, onStart }: Props) {
  const { isArcade, colors } = useTheme()
  const styles = useMemo(() => getThemedUI(colors, isArcade), [colors, isArcade])

  const profiles = dedupeProfiles(getProfiles())

  type GuestPick = { id: string; name: string; color: string; isGuest: true }
  const [guests, setGuests] = useState<GuestPick[]>([])

  const [selected, setSelected] = useState<string[]>([])
  const [order, setOrder] = useState<string[]>([])

  // Config
  const [includeBull, setIncludeBull] = useState(false)
  const [allowNegative, setAllowNegative] = useState(false)

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

  const canStart = selected.length >= 1 && selected.length <= maxPlayers

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

    const config: Partial<Bobs27Config> = { includeBull, allowNegative }
    onStart?.({ players: orderedPlayers, config })
  }

  const checkboxRow = (label: string, sub: string, checked: boolean, onChange: () => void): React.ReactNode => (
    <label
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '8px 12px',
        borderRadius: 8,
        background: colors.bgMuted,
        cursor: 'pointer',
        userSelect: 'none',
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        style={{ width: 18, height: 18, accentColor: colors.accent, cursor: 'pointer', flexShrink: 0 }}
      />
      <div>
        <div style={{ fontWeight: 600, fontSize: 14, color: colors.fg }}>{label}</div>
        <div style={{ fontSize: 11, color: colors.fgDim }}>{sub}</div>
      </div>
    </label>
  )

  return (
    <div style={styles.page}>
      <div style={styles.headerRow}>
        <h2 style={{ margin: 0, color: colors.fg }}>Bob's 27</h2>
        {onCancel && (
          <button style={styles.backBtn} onClick={onCancel}>
            &larr; Zurueck
          </button>
        )}
      </div>

      <div style={styles.centerPage}>
        <div style={styles.centerInner}>
          {/* Optionen */}
          <div style={styles.card}>
            <div style={{ ...styles.title, marginBottom: 8 }}>Optionen</div>
            <div style={{ display: 'grid', gap: 8 }}>
              {checkboxRow(
                'D-Bull als 21. Ziel',
                'Nach D20 kommt noch D-Bull (50 Punkte)',
                includeBull,
                () => setIncludeBull(!includeBull)
              )}
              {checkboxRow(
                'Minus erlauben',
                'Weiterspielen auch unter 0 Punkten',
                allowNegative,
                () => setAllowNegative(!allowNegative)
              )}
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
            Bob's 27 starten &rarr;
          </button>
        </div>
      </div>
    </div>
  )
}
