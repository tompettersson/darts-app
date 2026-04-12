// src/screens/NewGame121.tsx
// Eigenständiger Konfigurationsscreen für 121 Sprint
// Nur Spieler + Leganzahl (kein Regelblock, keine Sets)

import DiceAnimation from '../components/DiceAnimation'
import React, { useEffect, useMemo, useState } from 'react'
import {
  id, now,
  type MatchStarted, type DartsEvent,
} from '../darts501'
import {
  getProfiles, getMatches, saveMatches, setLastOpenMatchId,
  type Profile, type StoredMatch,
} from '../storage'
import { dbSaveX01Match } from '../db/storage'
import { registerActiveGame } from '../storage'
import { getThemedUI } from '../ui'
import { useTheme } from '../ThemeProvider'
import PasswordVerifyModal from '../components/PasswordVerifyModal'
import { usePasswordGatedStart } from '../hooks/usePasswordGatedStart'

type Props = {
  onCancel?: () => void
  onStarted?: (matchId: string) => void
}

function dedupeProfiles(arr: Profile[]): Profile[] {
  const m = new Map<string, Profile>()
  for (const p of arr) if (!m.has(p.id)) m.set(p.id, p)
  return Array.from(m.values())
}
function dedupeIds(arr: string[]): string[] { return Array.from(new Set(arr)) }

const GUEST_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#14b8a6', '#f97316', '#84cc16']

export default function NewGame121({ onCancel, onStarted }: Props) {
  const { isArcade, colors } = useTheme()
  const styles = useMemo(() => getThemedUI(colors, isArcade), [colors, isArcade])

  const profiles = dedupeProfiles(getProfiles())

  type GuestPick = { id: string; name: string; color: string; isGuest: true }
  const [guests, setGuests] = useState<GuestPick[]>([])

  const [selected, setSelected] = useState<string[]>([])
  const [order, setOrder] = useState<string[]>([])
  const [targetWins, setTargetWins] = useState(2) // First to N Legs

  const { pendingPlayers, requestStart, onVerified, onCancelled, skipPlayerId } = usePasswordGatedStart()

  const maxPlayers = 8
  const canStart = selected.length >= 1 && selected.length <= maxPlayers

  // ESC = Zurück
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  // Gemischte Liste (Profile + Gäste)
  const mixedList = useMemo(() => {
    const guestAsProfiles: Profile[] = guests.map((g) => ({
      id: g.id, name: g.name, color: g.color, createdAt: '', updatedAt: '',
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
    const nice = ['Blau', 'Grün', 'Orange', 'Rot', 'Violett', 'Türkis', 'Amber', 'Lime'][idx] ?? 'Gast'
    const g: GuestPick = { id: gid, name: `Gast (${nice})`, color, isGuest: true }
    setGuests((prev) => [...prev, g])
    setSelected((s) => dedupeIds([...s, gid]))
    setOrder((o) => dedupeIds([...o, gid]))
  }

  const title = useMemo(() => {
    const ids = dedupeIds(order).filter((pid) => selected.includes(pid))
    const idToName = new Map<string, string>()
    mixedList.forEach(p => idToName.set(p.id, p.name ?? p.id))
    const names = ids.map((pid) => idToName.get(pid) ?? pid)
    return `121 DO – ${names.length ? names.join(' vs ') : 'neues Match'}`
  }, [order, selected, mixedList])

  const handleStartConfirmed = async () => {
    if (!canStart) return

    const playerIds = dedupeIds(order).filter((pid) => selected.includes(pid))
    if (playerIds.length < 1) return

    type FlexPlayer = { playerId: string; name: string; isGuest?: true; color?: string }
    const idToGuest = new Map(guests.map(g => [g.id, g]))
    const idToProfile = new Map(profiles.map(p => [p.id, p]))
    const players: FlexPlayer[] = playerIds.map((pid) => {
      const g = idToGuest.get(pid)
      if (g) return { playerId: g.id, name: g.name, isGuest: true, color: g.color }
      const pr = idToProfile.get(pid)!
      return { playerId: pr.id, name: pr.name }
    })

    const matchId = id()
    const legId = id()
    const bestOfLegs = targetWins * 2 - 1

    const startEvt: MatchStarted = {
      eventId: id(),
      type: 'MatchStarted',
      ts: now(),
      matchId,
      mode: '121-double-out',
      structure: { kind: 'legs', bestOfLegs },
      startingScorePerLeg: 121,
      players,
      bullThrow: { winnerPlayerId: players[0].playerId },
      version: 1,
      inRule: 'straight-in',
      outRule: 'double-out',
    }

    const events: DartsEvent[] = [
      startEvt,
      {
        eventId: id(),
        type: 'LegStarted',
        ts: now(),
        matchId,
        legId,
        legIndex: 1,
        starterPlayerId: players[0].playerId,
      } as DartsEvent,
    ]

    const stored: StoredMatch = {
      id: matchId,
      createdAt: now(),
      events,
      playerIds: players.filter(p => !(p as any).isGuest).map((p) => p.playerId),
      title,
    }
    const all = getMatches()
    all.unshift(stored)
    saveMatches(all)
    setLastOpenMatchId(matchId)

    // Await DB write
    try {
      await dbSaveX01Match({
        id: stored.id,
        title: stored.title,
        matchName: null,
        notes: null,
        createdAt: stored.createdAt,
        finished: false,
        finishedAt: null,
        events: stored.events,
        playerIds: stored.playerIds,
      })
    } catch (err) {
      console.warn('[NewGame121] DB save failed:', err)
    }

    registerActiveGame({
      id: matchId,
      playerId: players[0]?.playerId ?? '',
      gameType: 'x01',
      title: stored.title,
      config: { startingScore: 121 },
      players: players.map(p => ({ id: p.playerId, name: p.name })),
      startedAt: new Date().toISOString(),
    })

    onStarted?.(matchId)
  }

  const handleStart = () => {
    if (!canStart) return
    const playerIds = dedupeIds(order).filter((pid) => selected.includes(pid))
    const idToGuest = new Map(guests.map(g => [g.id, g]))
    const idToProfile = new Map(profiles.map(p => [p.id, p]))
    const playersForVerify = playerIds.map((pid) => {
      const g = idToGuest.get(pid)
      if (g) return { id: g.id, name: g.name, color: g.color }
      const pr = idToProfile.get(pid)!
      return { id: pr.id, name: pr.name, color: pr.color }
    })
    requestStart(playersForVerify, handleStartConfirmed)
  }

  // Styles
  const pillActive: React.CSSProperties = {
    ...styles.pill,
    borderColor: colors.accent,
    background: isArcade ? colors.accent : '#e0f2fe',
    color: isArcade ? '#fff' : '#0369a1',
  }
  const pillInactive: React.CSSProperties = {
    ...styles.pill,
  }

  return (
    <div style={styles.page}>
      {showDice && <DiceAnimation onDone={handleDiceDone} />}

      <div style={styles.headerRow}>
        <h2 style={{ margin: 0, color: colors.fg }}>121 Sprint konfigurieren</h2>
        {onCancel && <button style={styles.backBtn} onClick={onCancel}>← Zurück</button>}
      </div>

      <div style={styles.centerPage}>
        <div style={styles.centerInner}>
          {/* Modus-Info */}
          <div style={styles.card}>
            <div style={{ fontWeight: 800, fontSize: 18, color: colors.fg }}>121 Sprint</div>
            <div style={{ ...styles.sub, marginTop: 4 }}>Straight-In / Double-Out – Wer zuerst auscheckt, gewinnt das Leg.</div>
          </div>

          {/* Spieler wählen */}
          <div style={{ display: 'grid', gap: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
              <div style={{ ...styles.sub, fontWeight: 700 }}>Spieler (1–8)</div>
              <div style={{ display: 'flex', gap: 8 }}>
                {selected.length >= 2 && (
                  <button style={styles.pill} onClick={shuffleOrder}>Zufällig</button>
                )}
                <button style={{ ...styles.pill, ...(selected.length >= maxPlayers ? { opacity: 0.4, cursor: 'not-allowed' } : {}) }} onClick={addGuest} disabled={selected.length >= maxPlayers}>{selected.length >= maxPlayers ? `Max ${maxPlayers}` : 'Gast hinzufügen'}</button>
              </div>
            </div>

            <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
              {mixedList.map((p) => {
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

          {/* Leganzahl */}
          <div style={styles.card}>
            <div style={{ fontWeight: 700, marginBottom: 8, color: colors.fg }}>Legs</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ color: colors.fg }}>First to</span>
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  style={targetWins === n ? pillActive : pillInactive}
                  onClick={() => setTargetWins(n)}
                >
                  {n}
                </button>
              ))}
              <span style={{ color: colors.fg }}>Legs</span>
            </div>
            <div style={{ ...styles.sub, marginTop: 6 }}>
              Best of {targetWins * 2 - 1} Legs
            </div>
          </div>

          {/* Starten */}
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
