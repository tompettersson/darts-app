// src/screens/NewGameHighscore.tsx
// Spieler-Auswahl und Konfiguration für Highscore Trainingsspiel

import React, { useMemo, useState } from 'react'
import { getThemedUI } from '../ui'
import { useTheme } from '../ThemeProvider'
import { getProfiles } from '../storage'
import type { HighscoreStructure, HighscorePlayer } from '../types/highscore'
import PasswordVerifyModal from '../components/PasswordVerifyModal'
import { usePasswordGatedStart } from '../hooks/usePasswordGatedStart'

type Props = {
  onCancel?: () => void
  onStart?: (data: {
    players: HighscorePlayer[]
    targetScore: number
    structure: HighscoreStructure
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

// Target-Score Presets
const TARGET_PRESETS = [300, 500, 750, 999]

export default function NewGameHighscore({ onCancel, onStart }: Props) {
  const { isArcade, colors } = useTheme()
  const styles = useMemo(() => getThemedUI(colors, isArcade), [colors, isArcade])

  const profiles = dedupeProfiles(getProfiles())

  type GuestPick = { id: string; name: string; color: string; isGuest: true }
  const [guests, setGuests] = useState<GuestPick[]>([])

  const [selected, setSelected] = useState<string[]>([])
  const [order, setOrder] = useState<string[]>([])

  // Target Score
  const [targetScore, setTargetScore] = useState(999)
  const [customTarget, setCustomTarget] = useState('')

  // Legs/Sets Konfiguration
  const [structureKind, setStructureKind] = useState<'legs' | 'sets'>('legs')
  const [targetLegs, setTargetLegs] = useState(1)
  const [targetSets, setTargetSets] = useState(3)
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

  const { pendingPlayers, requestStart, onVerified, onCancelled, skipPlayerId } = usePasswordGatedStart()

  const canStart = selected.length >= 1 && selected.length <= maxPlayers && targetScore >= 300 && targetScore <= 999

  const pill = (active: boolean): React.CSSProperties => ({
    ...styles.pill,
    ...(active ? {
      borderColor: colors.accent,
      background: isArcade ? colors.accent : '#e0f2fe',
      color: isArcade ? '#fff' : '#0369a1',
    } : {}),
  })

  const handleTargetChange = (value: number) => {
    setTargetScore(value)
    setCustomTarget('')
  }

  const handleCustomTargetChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setCustomTarget(val)
    const num = parseInt(val, 10)
    if (!isNaN(num) && num >= 300 && num <= 999) {
      setTargetScore(num)
    }
  }

  const handleStartConfirmed = () => {
    if (!canStart) return

    const orderedPlayers: HighscorePlayer[] = order
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

    const structure: HighscoreStructure = structureKind === 'legs'
      ? { kind: 'legs', targetLegs }
      : { kind: 'sets', targetSets, legsPerSet }

    onStart?.({ players: orderedPlayers, targetScore, structure })
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
    <div style={{
      ...styles.page,
      display: 'flex',
      flexDirection: 'column',
      gap: 16,
      padding: '16px 20px',
      overflowY: 'auto',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
      }}>
        <h2 style={{ ...styles.heading, margin: 0, fontSize: 22 }}>
          Highscore
        </h2>
        <button onClick={onCancel} style={{ ...styles.button, padding: '6px 14px', fontSize: 13 }}>
          Abbrechen
        </button>
      </div>

      {/* Spielregeln */}
      <div style={{
        ...styles.card,
        padding: 12,
        background: isArcade ? 'rgba(249, 115, 22, 0.1)' : '#fef3c7',
        border: `1px solid ${isArcade ? '#f97316' : '#fbbf24'}`,
      }}>
        <div style={{ fontSize: 12, color: colors.fgDim }}>
          Erreiche als Erster das Zielpunktzahl! Score startet bei 0 und wird addiert.
          Sobald ein Spieler das Target erreicht oder überschreitet, gewinnt er sofort.
        </div>
      </div>

      {/* Target Score */}
      <div style={styles.card}>
        <div style={{ ...styles.label, marginBottom: 10 }}>Zielpunktzahl</div>

        {/* Presets */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          {TARGET_PRESETS.map((preset) => (
            <button
              key={preset}
              onClick={() => handleTargetChange(preset)}
              style={pill(targetScore === preset && !customTarget)}
            >
              {preset}
            </button>
          ))}
        </div>

        {/* Custom Input */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, color: colors.fgDim }}>Eigener Wert:</span>
          <input
            type="number"
            min={300}
            max={999}
            value={customTarget}
            onChange={handleCustomTargetChange}
            placeholder="300-999"
            aria-label="Eigener Zielwert"
            style={{
              ...styles.input,
              width: 100,
              textAlign: 'center',
            }}
          />
          {customTarget && targetScore >= 300 && targetScore <= 999 && (
            <span style={{ color: colors.success, fontSize: 13 }}>
              {targetScore} Punkte
            </span>
          )}
        </div>

        {/* Slider */}
        <div style={{ marginTop: 12 }}>
          <input
            type="range"
            min={300}
            max={999}
            step={1}
            value={targetScore}
            onChange={(e) => {
              setTargetScore(parseInt(e.target.value, 10))
              setCustomTarget('')
            }}
            style={{ width: '100%' }}
            aria-label="Zielwert-Slider"
          />
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: 11,
            color: colors.fgDim,
            marginTop: 4,
          }}>
            <span>300</span>
            <span style={{ fontWeight: 700, color: colors.accent }}>{targetScore}</span>
            <span>999</span>
          </div>
        </div>
      </div>

      {/* Legs/Sets */}
      <div style={styles.card}>
        <div style={{ ...styles.label, marginBottom: 10 }}>Spielformat</div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <button
            onClick={() => setStructureKind('legs')}
            style={pill(structureKind === 'legs')}
          >
            Legs
          </button>
          <button
            onClick={() => setStructureKind('sets')}
            style={pill(structureKind === 'sets')}
          >
            Sets
          </button>
        </div>

        {structureKind === 'legs' && (
          <div>
            <div style={{ fontSize: 12, color: colors.fgDim, marginBottom: 8 }}>
              First to {targetLegs} Leg{targetLegs > 1 ? 's' : ''}
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} onClick={() => setTargetLegs(n)} style={pill(targetLegs === n)}>
                  FT{n}
                </button>
              ))}
            </div>
          </div>
        )}

        {structureKind === 'sets' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <div style={{ fontSize: 12, color: colors.fgDim, marginBottom: 6 }}>
                First to {targetSets} Set{targetSets > 1 ? 's' : ''}
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} onClick={() => setTargetSets(n)} style={pill(targetSets === n)}>
                    FT{n}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: colors.fgDim, marginBottom: 6 }}>
                Legs pro Set: First to {legsPerSet}
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} onClick={() => setLegsPerSet(n)} style={pill(legsPerSet === n)}>
                    FT{n}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Spieler-Auswahl */}
      <div style={styles.card}>
        <div style={{ ...styles.label, marginBottom: 10 }}>
          Spieler ({selected.length}/{maxPlayers})
        </div>

        {/* Profile Liste */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          maxHeight: 180,
          overflowY: 'auto',
          marginBottom: 10,
        }}>
          {mixedList.map((p) => {
            const isSel = selected.includes(p.id)
            const guest = guests.find((g) => g.id === p.id)
            return (
              <div
                key={p.id}
                onClick={() => toggleSel(p.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '8px 12px',
                  borderRadius: 8,
                  background: isSel ? (isArcade ? 'rgba(249, 115, 22, 0.15)' : '#e0f2fe') : colors.bgMuted,
                  border: `1px solid ${isSel ? colors.accent : 'transparent'}`,
                  cursor: 'pointer',
                }}
              >
                <div style={{
                  width: 20,
                  height: 20,
                  borderRadius: 4,
                  border: `2px solid ${isSel ? colors.accent : colors.fgDim}`,
                  background: isSel ? colors.accent : 'transparent',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#fff',
                  fontSize: 12,
                  fontWeight: 700,
                }}>
                  {isSel && '✓'}
                </div>
                <span style={{
                  flex: 1,
                  fontSize: 14,
                  color: p.color ?? colors.fg,
                  fontWeight: p.color ? 600 : (isSel ? 600 : 400),
                }}>
                  {p.name}
                </span>
                {guest && (
                  <span style={{ fontSize: 10, color: colors.fgDim }}>Gast</span>
                )}
              </div>
            )
          })}
        </div>

        {/* Gast hinzufügen */}
        <button
          onClick={addGuest}
          disabled={selected.length >= maxPlayers}
          style={{
            ...styles.button,
            width: '100%',
            padding: '8px 12px',
            fontSize: 13,
            opacity: selected.length >= maxPlayers ? 0.5 : 1,
          }}
        >
          + Gast hinzufügen
        </button>
      </div>

      {/* Reihenfolge */}
      {selected.length > 1 && (
        <div style={styles.card}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 10,
          }}>
            <div style={styles.label}>Reihenfolge</div>
            <button onClick={shuffleOrder} style={{ ...styles.pill, fontSize: 11, padding: '4px 10px' }}>
              Mischen
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {order.filter((pid) => selected.includes(pid)).map((pid, idx) => {
              const p = mixedList.find((x) => x.id === pid)
              const guest = guests.find((g) => g.id === pid)
              return (
                <div
                  key={pid}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '6px 10px',
                    borderRadius: 6,
                    background: colors.bgMuted,
                  }}
                >
                  <span style={{
                    width: 20,
                    height: 20,
                    borderRadius: '50%',
                    background: colors.accent,
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 11,
                    fontWeight: 700,
                  }}>
                    {idx + 1}
                  </span>
                  <span style={{
                    flex: 1,
                    fontSize: 13,
                    color: guest ? guest.color : colors.fg,
                  }}>
                    {p?.name ?? pid}
                  </span>
                  <button
                    onClick={() => moveInOrder(pid, -1)}
                    disabled={idx === 0}
                    style={{ ...styles.pill, padding: '2px 8px', fontSize: 12, opacity: idx === 0 ? 0.3 : 1 }}
                  >
                    ↑
                  </button>
                  <button
                    onClick={() => moveInOrder(pid, 1)}
                    disabled={idx === order.filter((x) => selected.includes(x)).length - 1}
                    style={{
                      ...styles.pill,
                      padding: '2px 8px',
                      fontSize: 12,
                      opacity: idx === order.filter((x) => selected.includes(x)).length - 1 ? 0.3 : 1,
                    }}
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
        onClick={handleStart}
        disabled={!canStart}
        style={{
          ...styles.button,
          width: '100%',
          padding: '14px 20px',
          fontSize: 16,
          fontWeight: 700,
          background: canStart ? colors.accent : colors.bgMuted,
          color: canStart ? '#fff' : colors.fgDim,
          opacity: canStart ? 1 : 0.6,
          marginTop: 8,
        }}
      >
        Spiel starten
      </button>

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
