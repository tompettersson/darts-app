// src/screens/NewGameCricket.tsx
import React, { useMemo, useState } from 'react'
import { getThemedUI } from '../ui'
import { useTheme } from '../ThemeProvider'
import { getProfiles } from '../storage'
import { CricketSetup } from "./newgame/../../types/cricket"
import PasswordVerifyModal from '../components/PasswordVerifyModal'
import { usePasswordGatedStart } from '../hooks/usePasswordGatedStart'


type Props = {
  cfg: CricketSetup
  onCancel?: () => void
  onStart?: (data: {
    cfg: CricketSetup
    players: { id: string; name: string; isGuest?: boolean; color?: string }[]
    orderIds: string[]
    targetWins: number              // 👈 First to …
  }) => void
}

/* ---------- kleine Utils ---------- */
type Profile = { id: string; name: string; createdAt: string; updatedAt: string; color?: string }
function dedupeProfiles(arr: Profile[]): Profile[] {
  const m = new Map<string, Profile>()
  for (const p of arr) if (!m.has(p.id)) m.set(p.id, p)
  return Array.from(m.values())
}
function dedupeIds(arr: string[]): string[] { return Array.from(new Set(arr)) }
function id(): string { return (Date.now().toString(36) + Math.random().toString(36).slice(2, 8)).toUpperCase() }

/* ---------- Gastfarben ---------- */
const GUEST_COLORS = ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#14b8a6','#f97316','#84cc16']

export default function NewGameCricket({ cfg, onCancel, onStart }: Props) {
  const { isArcade, colors } = useTheme()
  const styles = useMemo(() => getThemedUI(colors, isArcade), [colors, isArcade])
  const profiles = dedupeProfiles(getProfiles())

  // Gäste nur lokal in diesem Screen verwalten
  type GuestPick = { id: string; name: string; color: string; isGuest: true }
  const [guests, setGuests] = useState<GuestPick[]>([])

  // Auswahl + Reihenfolge (IDs; können Profil-IDs oder Gast-IDs sein)
  const [selected, setSelected] = useState<string[]>([])
  const [order, setOrder] = useState<string[]>([])

  // Cricket Serie: First to N
  const [targetWins, setTargetWins] = useState<number>(2) // „First to 2“ als Default

  const maxPlayers = 8

  // gemischte Liste (Profile + Gäste) zur Anzeige
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

  const toggleSel = (id: string) => {
    setSelected((prev) => {
      const exists = prev.includes(id)
      if (exists) {
        setOrder((o) => o.filter((x) => x !== id))
        return prev.filter((x) => x !== id)
      } else {
        if (prev.length >= maxPlayers) return prev
        setOrder((o) => dedupeIds([...o, id]))
        return dedupeIds([...prev, id])
      }
    })
  }

  const moveInOrder = (id: string, dir: -1 | 1) => {
    setOrder((o) => {
      const list = dedupeIds(o)
      const i = list.indexOf(id)
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
      // Fisher-Yates Shuffle
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
    const nice = ['Blau','Grün','Orange','Rot','Violett','Türkis','Amber','Lime'][idx] ?? 'Gast'
    const g: GuestPick = { id: gid, name: `Gast (${nice})`, color, isGuest: true }
    setGuests((prev) => [...prev, g])
    // direkt auswählen und ans Ende der Reihenfolge hängen
    setSelected((s) => dedupeIds([...s, gid]))
    setOrder((o) => dedupeIds([...o, gid]))
  }

  const { pendingPlayers, requestStart, onVerified, onCancelled, skipPlayerId } = usePasswordGatedStart()

  const canStart = selected.length >= 1 && selected.length <= maxPlayers

  const handleStartConfirmed = () => {
    if (!canStart) return
    const ids = dedupeIds(order).filter((pid) => selected.includes(pid))
    const idToGuest = new Map(guests.map(g => [g.id, g]))
    const idToProfile = new Map(profiles.map(p => [p.id, p]))
    const players = ids.map((pid) => {
      const g = idToGuest.get(pid)
      if (g) return { id: g.id, name: g.name, isGuest: true, color: g.color }
      const pr = idToProfile.get(pid)!
      return { id: pr.id, name: pr.name }
    })
    onStart?.({ cfg, players, orderIds: ids, targetWins })
  }

  const handleStart = () => {
    if (!canStart) return
    const ids = dedupeIds(order).filter((pid) => selected.includes(pid))
    const idToGuest = new Map(guests.map(g => [g.id, g]))
    const idToProfile = new Map(profiles.map(p => [p.id, p]))
    const playersForVerify = ids.map((pid) => {
      const g = idToGuest.get(pid)
      if (g) return { id: g.id, name: g.name, color: g.color }
      const pr = idToProfile.get(pid)!
      return { id: pr.id, name: pr.name }
    })
    requestStart(playersForVerify, handleStartConfirmed)
  }

  const pillActive: React.CSSProperties = {
    ...styles.pill,
    borderColor: colors.accent,
    background: isArcade ? colors.accent : '#e0f2fe',
    color: isArcade ? '#fff' : '#0369a1',
  }
  const pillInactive: React.CSSProperties = { ...styles.pill }
  const pill = (active: boolean) => active ? pillActive : pillInactive

  return (
    <div style={styles.page}>
      <div style={styles.headerRow}>
        <h2 style={{ margin: 0, color: colors.fg }}>Cricket konfigurieren</h2>
        {onCancel ? <button style={styles.backBtn} onClick={onCancel}>← Zurück</button> : null}
      </div>

      {/* Auswahl-Info aus dem Picker */}
      <div style={{ ...styles.card, marginBottom: 8 }}>
        <div style={styles.sub}>Auswahl</div>
        <div style={{ ...styles.pills, marginTop: 6 }}>
          <span style={{ ...styles.pill, background: colors.bgMuted, cursor: 'default', borderColor: colors.border }}>
            Range: <b style={{ marginLeft: 6 }}>{cfg.range === 'short' ? 'Short (15–20)' : 'Long (10–20)'}</b>
          </span>
          <span style={{ ...styles.pill, background: colors.bgMuted, cursor: 'default', borderColor: colors.border }}>
            Variante: <b style={{ marginLeft: 6 }}>{cfg.style === 'cutthroat' ? 'Cutthroat' : 'Standard'}</b>
          </span>
        </div>
      </div>

      {/* Spieler wählen + Gast hinzufügen */}
      <div style={{ display: 'grid', gap: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <div style={styles.sub}>Spieler (1–8)</div>
          <div style={{ display: 'flex', gap: 8 }}>
            {selected.length >= 2 && (
              <button style={styles.pill} onClick={shuffleOrder}>🎲 Zufällig</button>
            )}
            <button style={styles.pill} onClick={addGuest}>Gast hinzufügen</button>
          </div>
        </div>

        <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
          {mixedList.map((p) => {
            const isSel = selected.includes(p.id)
            return (
              <div key={p.id} style={styles.rowCard}>
                <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
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

      {/* Serie: First to N */}
      <div style={styles.card}>
        <div style={{ fontWeight: 700, marginBottom: 8, color: colors.fg }}>Serie</div>
        <div style={{ ...styles.pills, marginBottom: 10 }}>
          {[1,2,3,4,5].map(n => (
            <button
              key={n}
              style={pill(targetWins === n)}
              onClick={() => setTargetWins(n)}
            >
              First to {n}
            </button>
          ))}
        </div>
        <div style={styles.sub}>
          Sieger ist, wer zuerst <b>{targetWins}</b> Spiele gewinnt.
        </div>
      </div>

      {/* Starten */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        {onCancel ? <button style={styles.backBtn} onClick={onCancel}>Abbrechen</button> : null}
        <button
          style={{ ...styles.backBtn, ...(canStart ? { borderColor: isArcade ? colors.accent : '#111827', background: isArcade ? colors.accent : '#111827', color: '#fff', fontWeight: 700 } : {}) }}
          disabled={!canStart}
          onClick={handleStart}
        >
          Spiel starten
        </button>
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
