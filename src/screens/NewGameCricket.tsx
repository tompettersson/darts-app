// src/screens/NewGameCricket.tsx
import DiceAnimation from '../components/DiceAnimation'
import React, { useMemo, useState } from 'react'
import { getThemedUI } from '../ui'
import { useTheme } from '../ThemeProvider'
import { getProfiles } from '../storage'
import {
  CricketRange,
  CricketStyle,
  CricketSetup,
  CutthroatEndgame,
  CrazyMode,
} from '../types/cricket'
import PasswordVerifyModal from '../components/PasswordVerifyModal'
import { usePasswordGatedStart } from '../hooks/usePasswordGatedStart'


type Props = {
  onCancel?: () => void
  onStart?: (data: {
    cfg: CricketSetup
    players: { id: string; name: string; isGuest?: boolean; color?: string }[]
    orderIds: string[]
    targetWins: number
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

type ScoringMode = 'standard' | 'cutthroat' | 'simple'

export default function NewGameCricket({ onCancel, onStart }: Props) {
  const { isArcade, colors } = useTheme()
  const styles = useMemo(() => getThemedUI(colors, isArcade), [colors, isArcade])
  const profiles = dedupeProfiles(getProfiles())

  // --- Cricket-Einstellungen (früher CricketModePicker) ---
  const [range, setRange] = useState<CricketRange>('short')
  const [scoring, setScoring] = useState<ScoringMode>('standard')
  const [endgameMode, setEndgameMode] = useState<CutthroatEndgame>('standard')
  const [crazyActive, setCrazyActive] = useState(false)
  const [crazyMode, setCrazyMode] = useState<CrazyMode>('normal')
  const [crazySameForAll, setCrazySameForAll] = useState(true)

  // Gäste nur lokal in diesem Screen verwalten
  type GuestPick = { id: string; name: string; color: string; isGuest: true }
  const [guests, setGuests] = useState<GuestPick[]>([])

  // Auswahl + Reihenfolge (IDs; können Profil-IDs oder Gast-IDs sein)
  const [selected, setSelected] = useState<string[]>([])
  const [order, setOrder] = useState<string[]>([])

  // Cricket Serie: First to N
  const [targetWins, setTargetWins] = useState<number>(2)

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

  const [showDice, setShowDice] = useState(false)
  const shuffleOrder = () => { setShowDice(true) }
  const handleDiceDone = () => {
    setOrder((o) => {
      const list = dedupeIds(o)
      const shuffled = [...list]
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
      }
      return shuffled
    })
    setShowDice(false)
  }

  const addGuest = () => {
    const idx = guests.length % GUEST_COLORS.length
    const color = GUEST_COLORS[idx]
    const gid = `guest-${id()}`
    const nice = ['Blau','Grün','Orange','Rot','Violett','Türkis','Amber','Lime'][idx] ?? 'Gast'
    const g: GuestPick = { id: gid, name: `Gast (${nice})`, color, isGuest: true }
    setGuests((prev) => [...prev, g])
    setSelected((s) => dedupeIds([...s, gid]))
    setOrder((o) => dedupeIds([...o, gid]))
  }

  const { pendingPlayers, requestStart, onVerified, onCancelled, skipPlayerId } = usePasswordGatedStart()

  const canStart = selected.length >= 1 && selected.length <= maxPlayers

  // Build config from local state
  const targets: CricketSetup['targets'] =
    range === 'short'
      ? [20,19,18,17,16,15,'BULL']
      : [20,19,18,17,16,15,14,13,12,11,10,'BULL']

  function buildConfig(): CricketSetup {
    const style: CricketStyle = crazyActive ? 'crazy' : scoring
    return {
      gameType: 'cricket',
      range,
      style,
      targets,
      cutthroatEndgame: (scoring === 'cutthroat') ? endgameMode : undefined,
      crazyMode: crazyActive ? crazyMode : undefined,
      crazyScoringMode: crazyActive ? scoring : undefined,
      crazySameForAll: crazyActive ? crazySameForAll : undefined,
    }
  }

  const handleStartConfirmed = () => {
    if (!canStart) return
    const cfg = buildConfig()
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

  // Mini-Pill für Sub-Optionen
  const miniPill = (active: boolean): React.CSSProperties => ({
    padding: '4px 8px',
    borderRadius: 6,
    border: `1px solid ${active ? colors.accent : colors.border}`,
    background: active ? (isArcade ? colors.accent : '#e0f2fe') : colors.bgCard,
    color: active ? (isArcade ? '#fff' : '#0369a1') : colors.fg,
    fontWeight: 500,
    fontSize: 12,
    cursor: 'pointer',
  })

  const variantPill = (active: boolean): React.CSSProperties => ({
    padding: '6px 10px',
    borderRadius: 8,
    border: `1px solid ${active ? colors.warning : colors.border}`,
    background: active ? colors.warningBg : colors.bgCard,
    color: active ? colors.warning : colors.fg,
    fontWeight: 600,
    fontSize: 13,
    cursor: 'pointer',
  })

  return (
    <div style={styles.page}>
      {showDice && <DiceAnimation onDone={handleDiceDone} />}

      <div style={styles.headerRow}>
        <h2 style={{ margin: 0, color: colors.fg }}>Cricket konfigurieren</h2>
        {onCancel ? <button style={styles.backBtn} onClick={onCancel}>← Zurück</button> : null}
      </div>

      {/* Spieler wählen + Gast hinzufügen */}
      <div style={{ display: 'grid', gap: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <div style={styles.sub}>Spieler (1–8)</div>
          <div style={{ display: 'flex', gap: 8 }}>
            {selected.length >= 2 && (
              <button style={styles.pill} onClick={shuffleOrder}>🎲 Zufällig</button>
            )}
            <button style={{ ...styles.pill, ...(selected.length >= maxPlayers ? { opacity: 0.4, cursor: 'not-allowed' } : {}) }} onClick={addGuest} disabled={selected.length >= maxPlayers}>{selected.length >= maxPlayers ? `Max ${maxPlayers}` : 'Gast hinzufügen'}</button>
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

      {/* Einstellungen Card — alles in einem Kästchen */}
      <div style={styles.card}>
        <div style={{ fontWeight: 700, marginBottom: 12, color: colors.fg, fontSize: 16 }}>Einstellungen</div>

        {/* Länge */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ ...styles.sub, marginBottom: 4, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 }}>Länge</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button type="button" style={pill(range === 'short')} onClick={() => setRange('short')}>
              Short (15–20)
            </button>
            <button type="button" style={pill(range === 'long')} onClick={() => setRange('long')}>
              Long (10–20)
            </button>
          </div>
          <div style={{ ...styles.sub, marginTop: 4, fontSize: 11 }}>
            {range === 'short' ? 'Felder 15–20 + Bull — das klassische Cricket.' : 'Felder 10–20 + Bull — mehr Felder, längere Spiele.'}
          </div>
        </div>

        {/* Punkte */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ ...styles.sub, marginBottom: 4, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 }}>Punkte</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button type="button" style={pill(scoring === 'standard')} onClick={() => setScoring('standard')}>
              Standard
            </button>
            <button type="button" style={pill(scoring === 'cutthroat')} onClick={() => setScoring('cutthroat')}>
              Cutthroat
            </button>
            <button type="button" style={pill(scoring === 'simple')} onClick={() => setScoring('simple')}>
              Simple
            </button>
          </div>
          <div style={{ ...styles.sub, marginTop: 4, fontSize: 11 }}>
            {scoring === 'standard' && 'Overflow = Punkte für dich. Alle Felder zu + meiste Punkte gewinnt.'}
            {scoring === 'cutthroat' && 'Overflow = Strafpunkte für Gegner. Wenigste Punkte gewinnt.'}
            {scoring === 'simple' && 'Keine Punkte — wer alle Felder zuerst zumacht, gewinnt.'}
          </div>
        </div>

        {/* Cutthroat Endgame Sub-Option */}
        {scoring === 'cutthroat' && (
          <div style={{ background: colors.bgMuted, borderRadius: 8, padding: 8, marginBottom: 14 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 13, color: colors.fgMuted, fontWeight: 500 }}>Endgame</span>
              <div style={{ display: 'flex', gap: 4 }}>
                <button type="button" style={miniPill(endgameMode === 'standard')} onClick={() => setEndgameMode('standard')}>
                  3 Runden
                </button>
                <button type="button" style={miniPill(endgameMode === 'suddenDeath')} onClick={() => setEndgameMode('suddenDeath')}>
                  Sudden Death
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Varianten */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ ...styles.sub, marginBottom: 4, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 }}>Varianten</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              type="button"
              style={variantPill(crazyActive)}
              onClick={() => setCrazyActive(!crazyActive)}
            >
              {crazyActive ? '✕ ' : ''}Crazy
            </button>
          </div>
          <div style={{ ...styles.sub, marginTop: 4, fontSize: 11 }}>
            Zufällige Zielzahlen pro Runde — chaotisch und spaßig.
          </div>
        </div>

        {/* Crazy Sub-Optionen */}
        {crazyActive && (
          <div style={{ background: colors.warningBg, borderRadius: 8, padding: 8, marginBottom: 14 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between', padding: '5px 0' }}>
              <span style={{ fontSize: 13, color: colors.fgMuted, fontWeight: 500 }}>Darts</span>
              <div style={{ display: 'flex', gap: 4 }}>
                <button type="button" style={miniPill(crazyMode === 'normal')} onClick={() => setCrazyMode('normal')}>
                  1 Ziel/Turn
                </button>
                <button type="button" style={miniPill(crazyMode === 'pro')} onClick={() => setCrazyMode('pro')}>
                  3 Ziele/Turn
                </button>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between', padding: '5px 0' }}>
              <span style={{ fontSize: 13, color: colors.fgMuted, fontWeight: 500 }}>Zielzahl</span>
              <div style={{ display: 'flex', gap: 4 }}>
                <button type="button" style={miniPill(crazySameForAll)} onClick={() => setCrazySameForAll(true)}>
                  Gleich für alle
                </button>
                <button type="button" style={miniPill(!crazySameForAll)} onClick={() => setCrazySameForAll(false)}>
                  Pro Spieler
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Serie: First to N */}
        <div>
          <div style={{ ...styles.sub, marginBottom: 4, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 }}>Serie</div>
          <div style={{ ...styles.pills, marginBottom: 6 }}>
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
            Sieger ist, wer zuerst <b>{targetWins}</b> {targetWins === 1 ? 'Spiel' : 'Spiele'} gewinnt.
          </div>
        </div>

        {/* Targets Vorschau */}
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'center', marginTop: 12, paddingTop: 10, borderTop: `1px solid ${colors.border}` }}>
          {targets.map(t => (
            <span key={String(t)} style={{ ...styles.badge, padding: '2px 6px', fontSize: 11 }}>
              {t === 'BULL' ? 'B' : t}
            </span>
          ))}
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
