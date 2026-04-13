// src/screens/NewGameKiller.tsx
// Spieler-Auswahl und Konfiguration fuer Killer Darts

import DiceAnimation from '../components/DiceAnimation'
import React, { useMemo, useState } from 'react'
import { getThemedUI } from '../ui'
import { useTheme } from '../ThemeProvider'
import { createKillerMatchShell } from '../storage'
import { assignTargetsAuto } from '../dartsKiller'
import type { KillerMatchConfig, KillerPlayer, KillerStructure } from '../types/killer'
import PasswordVerifyModal from '../components/PasswordVerifyModal'
import { usePasswordGatedStart } from '../hooks/usePasswordGatedStart'

type Props = {
  profiles: { id: string; name: string; color?: string }[]
  onStart: (matchId: string) => void
  onBack: () => void
}

type Profile = { id: string; name: string; color?: string }

function dedupeIds(arr: string[]): string[] {
  return Array.from(new Set(arr))
}

function uid(): string {
  return (Date.now().toString(36) + Math.random().toString(36).slice(2, 8)).toUpperCase()
}

const GUEST_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#14b8a6', '#f97316', '#84cc16']

const ACCENT = '#2ecc40'

export default function NewGameKiller({ profiles, onStart, onBack }: Props) {
  const { isArcade, colors } = useTheme()
  const styles = useMemo(() => getThemedUI(colors, isArcade), [colors, isArcade])

  // --- Step management ---
  const [step, setStep] = useState<1 | 2 | 3>(1)

  // --- Player selection ---
  type GuestPick = { id: string; name: string; color: string; isGuest: true }
  const [guests, setGuests] = useState<GuestPick[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [order, setOrder] = useState<string[]>([])

  const maxPlayers = 8

  const mixedList = useMemo(() => {
    const guestAsProfiles: Profile[] = guests.map((g) => ({
      id: g.id,
      name: g.name,
      color: g.color,
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
    const gid = `guest-${uid()}`
    const nice = ['Blau', 'Gruen', 'Orange', 'Rot', 'Violett', 'Tuerkis', 'Amber', 'Lime'][idx] ?? 'Gast'
    const g: GuestPick = { id: gid, name: `Gast (${nice})`, color, isGuest: true }
    setGuests((prev) => [...prev, g])
    setSelected((s) => dedupeIds([...s, gid]))
    setOrder((o) => dedupeIds([...o, gid]))
  }

  // --- Options state ---
  const [qualifyingRing, setQualifyingRing] = useState<'DOUBLE' | 'TRIPLE'>('DOUBLE')
  const [hitsToBecomeKiller, setHitsToBecomeKiller] = useState(1)
  const [startingLives, setStartingLives] = useState(3)
  const [friendlyFire, setFriendlyFire] = useState(true)
  const [selfHeal, setSelfHeal] = useState(false)
  const [noNegativeLives, setNoNegativeLives] = useState(true)
  const [secretNumbers, setSecretNumbers] = useState(false)
  const [targetAssignment, setTargetAssignment] = useState<'auto' | 'manual'>('auto')

  // --- Legs/Sets state ---
  const [structureKind, setStructureKind] = useState<'legs' | 'sets'>('legs')
  const [bestOfLegs, setBestOfLegs] = useState(1)
  const [bestOfSets, setBestOfSets] = useState(3)
  const [legsPerSet, setLegsPerSet] = useState(3)

  // --- Manual target assignments ---
  const orderedSelected = order.filter((pid) => selected.includes(pid))
  const [manualTargets, setManualTargets] = useState<Record<string, number>>({})

  const setManualTarget = (playerId: string, num: number) => {
    setManualTargets((prev) => ({ ...prev, [playerId]: num }))
  }

  const usedNumbers = Object.values(manualTargets).filter((n) =>
    orderedSelected.some((pid) => manualTargets[pid] === n)
  )

  const getAvailableNumbers = (playerId: string): number[] => {
    const current = manualTargets[playerId]
    return Array.from({ length: 20 }, (_, i) => i + 1).filter(
      (n) => n === current || !orderedSelected.some((pid) => pid !== playerId && manualTargets[pid] === n)
    )
  }

  // --- Validation ---
  const canProceedStep1 = selected.length >= 2 && selected.length <= maxPlayers

  const allManualAssigned =
    targetAssignment === 'manual'
      ? orderedSelected.every((pid) => manualTargets[pid] != null && manualTargets[pid] >= 1 && manualTargets[pid] <= 20)
      : true

  const manualHasDuplicates = (() => {
    if (targetAssignment !== 'manual') return false
    const nums = orderedSelected.map((pid) => manualTargets[pid]).filter((n) => n != null)
    return new Set(nums).size !== nums.length
  })()

  const { pendingPlayers, requestStart, onVerified, onCancelled, skipPlayerId } = usePasswordGatedStart()

  const canStart = canProceedStep1 && (targetAssignment === 'auto' || (allManualAssigned && !manualHasDuplicates))

  // --- Pill helper ---
  const pill = (active: boolean, disabled = false): React.CSSProperties => ({
    ...styles.pill,
    ...(active
      ? {
          border: `1px solid ${ACCENT}`,
          background: isArcade ? ACCENT : '#e8fde8',
          color: isArcade ? '#fff' : '#166534',
        }
      : {}),
    ...(disabled
      ? {
          background: colors.bgMuted,
          color: colors.fgDim,
          opacity: 0.5,
          cursor: 'not-allowed',
        }
      : {}),
  })

  const togglePill = (active: boolean): React.CSSProperties => ({
    ...styles.pill,
    minWidth: 52,
    ...(active
      ? {
          border: `1px solid ${ACCENT}`,
          background: isArcade ? ACCENT : '#e8fde8',
          color: isArcade ? '#fff' : '#166534',
        }
      : {}),
  })

  // --- Start handler ---
  const handleStartConfirmed = () => {
    if (!canStart) return

    const players: KillerPlayer[] = orderedSelected.map((pid) => {
      const profile = mixedList.find((p) => p.id === pid)
      const guest = guests.find((g) => g.id === pid)
      return {
        playerId: pid,
        name: profile?.name ?? guest?.name ?? pid,
        isGuest: !!guest,
      }
    })

    const config: KillerMatchConfig = {
      hitsToBecomeKiller,
      qualifyingRing,
      startingLives,
      friendlyFire,
      selfHeal,
      noNegativeLives,
      secretNumbers,
      targetAssignment,
    }

    let assignments: { playerId: string; targetNumber: number }[]
    if (targetAssignment === 'auto') {
      assignments = assignTargetsAuto(players)
    } else {
      assignments = orderedSelected.map((pid) => ({
        playerId: pid,
        targetNumber: manualTargets[pid],
      }))
    }

    const structure: KillerStructure = structureKind === 'sets'
      ? { kind: 'sets', bestOfSets, legsPerSet }
      : { kind: 'legs', bestOfLegs }

    const stored = createKillerMatchShell(players, config, assignments, structure)
    onStart(stored.id)
  }

  const handleStart = () => {
    if (!canStart) return
    const playersForVerify = orderedSelected.map((pid) => {
      const profile = mixedList.find((p) => p.id === pid)
      const guest = guests.find((g) => g.id === pid)
      return { id: pid, name: profile?.name ?? guest?.name ?? pid, color: profile?.color }
    })
    requestStart(playersForVerify, handleStartConfirmed)
  }

  // ===== RENDER =====
  return (
    <div style={styles.page}>
      {showDice && <DiceAnimation onDone={handleDiceDone} />}
      <div style={{ ...styles.headerRow, justifyContent: 'center', position: 'relative' as const }}>
        <h2 style={{ margin: 0, color: ACCENT }}>Killer</h2>
        <button
          style={{ ...styles.backBtn, position: 'absolute' as const, right: 0 }}
          onClick={onBack}
        >
          &larr; Zurueck
        </button>
      </div>

      <div style={styles.centerPage}>
        <div style={styles.centerInner}>
          {/* Spieler auswaehlen */}
          <div style={styles.card}>
            <div style={{ ...styles.title, marginBottom: 8 }}>Spieler (2-8)</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
              {mixedList.map((p) => {
                const isSel = selected.includes(p.id)
                return (
                  <button
                    key={p.id}
                    style={{
                      ...pill(isSel),
                      borderLeft: p.color
                        ? `3px solid ${p.color}`
                        : `1px solid ${isSel ? ACCENT : colors.border}`,
                      color: p.color ?? undefined,
                      fontWeight: p.color ? 600 : undefined,
                    }}
                    onClick={() => toggleSel(p.id)}
                  >
                    {p.name}
                  </button>
                )
              })}
              <button style={{ ...styles.pill, ...(selected.length >= maxPlayers ? { opacity: 0.4, cursor: 'not-allowed' } : {}) }} onClick={addGuest} disabled={selected.length >= maxPlayers}>
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
              <div>
                <div style={{ ...styles.sub, marginBottom: 4 }}>
                  Reihenfolge{' '}
                  <button style={{ ...styles.pill, padding: '2px 8px', fontSize: 11, marginLeft: 6 }} onClick={shuffleOrder}>
                    🎲 Zufällig
                  </button>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {orderedSelected.map((pid, i) => {
                    const p = mixedList.find((x) => x.id === pid)
                    return (
                      <div key={pid} style={{ display: 'flex', alignItems: 'center', gap: 2, background: colors.bgMuted, borderRadius: 6, padding: '2px 6px', fontSize: 12, color: colors.fg }}>
                        <span style={{ fontWeight: 600 }}>{i + 1}.</span>
                        <span>{p?.name ?? pid}</span>
                        <button style={{ ...styles.pill, padding: '0 4px', fontSize: 10 }} onClick={() => moveInOrder(pid, -1)} disabled={i === 0}>&uarr;</button>
                        <button style={{ ...styles.pill, padding: '0 4px', fontSize: 10 }} onClick={() => moveInOrder(pid, 1)} disabled={i === orderedSelected.length - 1}>&darr;</button>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Alle Einstellungen in einer Card */}
          <div style={styles.card}>
            <div style={{ ...styles.title, marginBottom: 10 }}>Einstellungen</div>

            {/* Qualifying Ring */}
            <div style={{ marginBottom: 10 }}>
              <div style={{ ...styles.sub, marginBottom: 4 }}>Qualifying Ring</div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button style={pill(qualifyingRing === 'DOUBLE')} onClick={() => setQualifyingRing('DOUBLE')}>Double</button>
                <button style={pill(qualifyingRing === 'TRIPLE')} onClick={() => setQualifyingRing('TRIPLE')}>Triple</button>
              </div>
              <div style={{ ...styles.sub, marginTop: 4, fontSize: 10, color: colors.fgMuted }}>
                Welchen Ring muss man treffen, um Killer zu werden und Gegner anzugreifen
              </div>
            </div>

            {/* Treffer zum Killer + Startleben */}
            <div style={{ display: 'flex', gap: 16, marginBottom: 10, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 120 }}>
                <div style={{ ...styles.sub, marginBottom: 4 }}>Treffer zum Killer</div>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button key={n} style={pill(hitsToBecomeKiller === n)} onClick={() => setHitsToBecomeKiller(n)}>{n}</button>
                  ))}
                </div>
                <div style={{ ...styles.sub, marginTop: 4, fontSize: 10, color: colors.fgMuted }}>
                  Wie oft die eigene Zahl treffen, um Killer zu werden
                </div>
              </div>
              <div style={{ flex: 1, minWidth: 120 }}>
                <div style={{ ...styles.sub, marginBottom: 4 }}>Startleben</div>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button key={n} style={pill(startingLives === n)} onClick={() => setStartingLives(n)}>{n}</button>
                  ))}
                </div>
                <div style={{ ...styles.sub, marginTop: 4, fontSize: 10, color: colors.fgMuted }}>
                  Leben pro Spieler zu Spielbeginn
                </div>
              </div>
            </div>

            {/* Regeln als kompakte Toggles */}
            <div style={{ ...styles.sub, marginBottom: 6 }}>Regeln</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 4 }}>
              <button style={togglePill(friendlyFire)} onClick={() => { setFriendlyFire(!friendlyFire); if (!friendlyFire) setSelfHeal(false) }}>
                {friendlyFire ? '✓' : '✗'} Friendly Fire
              </button>
              <button style={togglePill(selfHeal)} onClick={() => { setSelfHeal(!selfHeal); if (!selfHeal) setFriendlyFire(false) }}>
                {selfHeal ? '✓' : '✗'} Self Heal
              </button>
              <button style={togglePill(noNegativeLives)} onClick={() => setNoNegativeLives(!noNegativeLives)}>
                {noNegativeLives ? '✓' : '✗'} Keine neg. Leben
              </button>
              <button style={togglePill(secretNumbers)} onClick={() => setSecretNumbers(!secretNumbers)}>
                {secretNumbers ? '✓' : '✗'} Geheime Zahlen
              </button>
            </div>
            <div style={{ ...styles.sub, fontSize: 10, color: colors.fgMuted, marginBottom: 10, lineHeight: 1.5 }}>
              <b>Friendly Fire:</b> Killer verliert 1 Leben wenn er seine eigene Zahl trifft<br/>
              <b>Self Heal:</b> Killer heilt 1 Leben wenn er seine eigene Zahl trifft<br/>
              <b>Keine neg. Leben:</b> Leben können nicht unter 0 fallen<br/>
              <b>Geheime Zahlen:</b> Die Zielzahlen der Gegner sind verborgen
            </div>

            {/* Legs / Sets */}
            <div style={{ ...styles.sub, marginBottom: 4 }}>Legs / Sets</div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
              <button style={pill(structureKind === 'legs')} onClick={() => setStructureKind('legs')}>Legs</button>
              <button style={pill(structureKind === 'sets')} onClick={() => setStructureKind('sets')}>Sets</button>
            </div>
            {structureKind === 'legs' && (
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 6 }}>
                {[1, 3, 5, 7, 9, 11].map(n => (
                  <button key={n} style={pill(bestOfLegs === n)} onClick={() => setBestOfLegs(n)}>{n}</button>
                ))}
              </div>
            )}
            {structureKind === 'sets' && (
              <div style={{ marginBottom: 6 }}>
                <div style={{ ...styles.sub, marginBottom: 4, fontSize: 11 }}>Best of Sets</div>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 6 }}>
                  {[1, 3, 5, 7].map(n => (
                    <button key={n} style={pill(bestOfSets === n)} onClick={() => setBestOfSets(n)}>{n}</button>
                  ))}
                </div>
                <div style={{ ...styles.sub, marginBottom: 4, fontSize: 11 }}>Legs pro Set</div>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {[1, 3, 5].map(n => (
                    <button key={n} style={pill(legsPerSet === n)} onClick={() => setLegsPerSet(n)}>{n}</button>
                  ))}
                </div>
              </div>
            )}

            {/* Zielzuweisung */}
            <div style={{ ...styles.sub, marginBottom: 4 }}>Zielzuweisung</div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button style={pill(targetAssignment === 'auto')} onClick={() => setTargetAssignment('auto')}>Auto</button>
              <button style={pill(targetAssignment === 'manual')} onClick={() => setTargetAssignment('manual')}>Manuell</button>
            </div>
          </div>

          {/* Manuelle Zielzuweisung (nur wenn manuell gewählt) */}
          {targetAssignment === 'manual' && (
            <div style={styles.card}>
              <div style={{ ...styles.title, marginBottom: 8 }}>Zielzahlen zuweisen</div>
              {orderedSelected.map((pid) => {
                const p = mixedList.find((x) => x.id === pid)
                const currentVal = manualTargets[pid]
                const available = getAvailableNumbers(pid)
                return (
                  <div key={pid} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, padding: '6px 8px', background: colors.bgMuted, borderRadius: 8 }}>
                    <span style={{ flex: '0 0 80px', fontWeight: 600, fontSize: 12, color: p?.color ?? colors.fg, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p?.name ?? pid}
                    </span>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, flex: 1 }}>
                      {Array.from({ length: 20 }, (_, i) => i + 1).map((num) => {
                        const isSel = currentVal === num
                        const isAvail = available.includes(num)
                        return (
                          <button key={num} style={{ ...pill(isSel, !isAvail && !isSel), minWidth: 28, padding: '2px 4px', fontSize: 11 }}
                            onClick={() => isAvail && setManualTarget(pid, num)} disabled={!isAvail && !isSel}>
                            {num}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
              {manualHasDuplicates && (
                <div style={{ ...styles.sub, fontSize: 11, color: '#ef4444', marginTop: 4 }}>
                  Jede Zahl darf nur einmal vergeben werden
                </div>
              )}
            </div>
          )}

          {/* Start Button */}
          <button
            style={{
              ...styles.pill,
              width: '100%',
              opacity: canStart ? 1 : 0.5,
              ...(canStart ? { border: `1px solid ${ACCENT}`, background: ACCENT, color: '#fff', fontWeight: 700 } : {}),
            }}
            onClick={handleStart}
            disabled={!canStart}
          >
            Killer starten &rarr;
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
