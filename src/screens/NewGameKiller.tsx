// src/screens/NewGameKiller.tsx
// Spieler-Auswahl und Konfiguration fuer Killer Darts

import React, { useMemo, useState } from 'react'
import { getThemedUI } from '../ui'
import { useTheme } from '../ThemeProvider'
import { createKillerMatchShell } from '../storage'
import { assignTargetsAuto } from '../dartsKiller'
import type { KillerMatchConfig, KillerPlayer, KillerStructure } from '../types/killer'

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
  const handleStart = () => {
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

  // ===== RENDER =====
  return (
    <div style={styles.page}>
      <div style={{ ...styles.headerRow, justifyContent: 'center', position: 'relative' as const }}>
        <h2 style={{ margin: 0, color: ACCENT }}>Killer</h2>
        <button
          style={{ ...styles.backBtn, position: 'absolute' as const, right: 0 }}
          onClick={() => {
            if (step === 1) onBack()
            else if (step === 3) setStep(2)
            else setStep(1)
          }}
        >
          &larr; Zurueck
        </button>
      </div>

      <div style={styles.centerPage}>
        <div style={styles.centerInner}>
          {/* Step indicator */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              gap: 8,
              marginBottom: 16,
            }}
          >
            {[1, 2, 3].map((s) => {
              const isActive = step === s
              const showStep3 = targetAssignment === 'manual'
              if (s === 3 && !showStep3) return null
              return (
                <div
                  key={s}
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 12,
                    fontWeight: 700,
                    background: isActive ? ACCENT : colors.bgMuted,
                    color: isActive ? '#fff' : colors.fgDim,
                    border: `2px solid ${isActive ? ACCENT : colors.border}`,
                    transition: 'all 0.2s',
                  }}
                >
                  {s}
                </div>
              )
            })}
          </div>

          {/* ===== STEP 1: Player Selection ===== */}
          {step === 1 && (
            <>
              <div style={styles.card}>
                <div style={{ ...styles.title, marginBottom: 8 }}>Spieler auswaehlen (2-8)</div>

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
                  <button style={styles.pill} onClick={addGuest} title="Gast hinzufuegen">
                    + Gast
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
                      {orderedSelected.map((pid, i) => {
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
                              disabled={i === orderedSelected.length - 1}
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

              <button
                style={{
                  ...styles.pill,
                  width: '100%',
                  opacity: canProceedStep1 ? 1 : 0.5,
                  ...(canProceedStep1
                    ? {
                        border: `1px solid ${ACCENT}`,
                        background: ACCENT,
                        color: '#fff',
                        fontWeight: 700,
                      }
                    : {}),
                }}
                onClick={() => canProceedStep1 && setStep(2)}
                disabled={!canProceedStep1}
              >
                Weiter: Optionen &rarr;
              </button>
            </>
          )}

          {/* ===== STEP 2: Options ===== */}
          {step === 2 && (
            <>
              {/* Qualifying Ring */}
              <div style={styles.card}>
                <div style={{ ...styles.title, marginBottom: 8 }}>Qualifying Ring</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button style={pill(qualifyingRing === 'DOUBLE')} onClick={() => setQualifyingRing('DOUBLE')}>
                    Double
                  </button>
                  <button style={pill(qualifyingRing === 'TRIPLE')} onClick={() => setQualifyingRing('TRIPLE')}>
                    Triple
                  </button>
                </div>
                <div style={{ ...styles.sub, marginTop: 6, fontSize: 11 }}>
                  {qualifyingRing === 'DOUBLE'
                    ? 'Double-Ring treffen um Killer zu werden und Gegner zu treffen'
                    : 'Triple-Ring treffen um Killer zu werden und Gegner zu treffen'}
                </div>
              </div>

              {/* Treffer zum Killer */}
              <div style={styles.card}>
                <div style={{ ...styles.title, marginBottom: 8 }}>Treffer zum Killer</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button key={n} style={pill(hitsToBecomeKiller === n)} onClick={() => setHitsToBecomeKiller(n)}>
                      {n}
                    </button>
                  ))}
                </div>
                <div style={{ ...styles.sub, marginTop: 6, fontSize: 11 }}>
                  {hitsToBecomeKiller === 1
                    ? '1 Treffer auf eigene Zahl zum Killer werden'
                    : `${hitsToBecomeKiller} Treffer auf eigene Zahl zum Killer werden`}
                </div>
              </div>

              {/* Startleben */}
              <div style={styles.card}>
                <div style={{ ...styles.title, marginBottom: 8 }}>Startleben</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button key={n} style={pill(startingLives === n)} onClick={() => setStartingLives(n)}>
                      {n}
                    </button>
                  ))}
                </div>
                <div style={{ ...styles.sub, marginTop: 6, fontSize: 11 }}>
                  Jeder Spieler startet mit {startingLives} {startingLives === 1 ? 'Leben' : 'Leben'}
                </div>
              </div>

              {/* Toggle Options */}
              <div style={styles.card}>
                <div style={{ ...styles.title, marginBottom: 12 }}>Regeln</div>

                {/* Friendly Fire */}
                <div style={{ marginBottom: 10 }}>
                  <div style={{ ...styles.sub, marginBottom: 4 }}>Friendly Fire</div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button style={togglePill(friendlyFire)} onClick={() => { setFriendlyFire(true); setSelfHeal(false) }}>
                      An
                    </button>
                    <button style={togglePill(!friendlyFire)} onClick={() => setFriendlyFire(false)}>
                      Aus
                    </button>
                  </div>
                  <div style={{ ...styles.sub, marginTop: 4, fontSize: 10, color: colors.fgMuted }}>
                    Killer trifft eigene Zahl: verliert 1 Leben
                  </div>
                </div>

                {/* Self Heal */}
                <div style={{ marginBottom: 10 }}>
                  <div style={{ ...styles.sub, marginBottom: 4 }}>Self Heal</div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button style={togglePill(selfHeal)} onClick={() => { setSelfHeal(true); setFriendlyFire(false) }}>
                      An
                    </button>
                    <button style={togglePill(!selfHeal)} onClick={() => setSelfHeal(false)}>
                      Aus
                    </button>
                  </div>
                  <div style={{ ...styles.sub, marginTop: 4, fontSize: 10, color: colors.fgMuted }}>
                    Killer trifft eigene Zahl: heilt 1 Leben
                  </div>
                </div>

                {/* Keine negativen Leben */}
                <div style={{ marginBottom: 10 }}>
                  <div style={{ ...styles.sub, marginBottom: 4 }}>Keine negativen Leben</div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button style={togglePill(noNegativeLives)} onClick={() => setNoNegativeLives(true)}>
                      An
                    </button>
                    <button style={togglePill(!noNegativeLives)} onClick={() => setNoNegativeLives(false)}>
                      Aus
                    </button>
                  </div>
                  <div style={{ ...styles.sub, marginTop: 4, fontSize: 10, color: colors.fgMuted }}>
                    Leben koennen nicht unter 0 fallen
                  </div>
                </div>

                {/* Geheime Zahlen */}
                <div style={{ marginBottom: 10 }}>
                  <div style={{ ...styles.sub, marginBottom: 4 }}>Geheime Zahlen</div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button style={togglePill(secretNumbers)} onClick={() => setSecretNumbers(true)}>
                      An
                    </button>
                    <button style={togglePill(!secretNumbers)} onClick={() => setSecretNumbers(false)}>
                      Aus
                    </button>
                  </div>
                  <div style={{ ...styles.sub, marginTop: 4, fontSize: 10, color: colors.fgMuted }}>
                    Zielzahlen der Gegner werden verborgen
                  </div>
                </div>
              </div>

              {/* Legs / Sets */}
              <div style={styles.card}>
                <div style={{ ...styles.title, marginBottom: 8 }}>Legs / Sets</div>
                <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                  <button style={pill(structureKind === 'legs')} onClick={() => setStructureKind('legs')}>Legs</button>
                  <button style={pill(structureKind === 'sets')} onClick={() => setStructureKind('sets')}>Sets</button>
                </div>

                {structureKind === 'legs' && (
                  <div>
                    <div style={{ ...styles.sub, marginBottom: 4 }}>Best of</div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {[1, 3, 5, 7, 9, 11].map(n => (
                        <button key={n} style={pill(bestOfLegs === n)} onClick={() => setBestOfLegs(n)}>
                          {n}
                        </button>
                      ))}
                    </div>
                    <div style={{ ...styles.sub, marginTop: 6, fontSize: 11 }}>
                      {bestOfLegs === 1 ? 'Einzelnes Leg (Standard)' : `Best of ${bestOfLegs} Legs (${Math.ceil(bestOfLegs / 2)} zum Sieg)`}
                    </div>
                  </div>
                )}

                {structureKind === 'sets' && (
                  <div>
                    <div style={{ ...styles.sub, marginBottom: 4 }}>Best of Sets</div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                      {[1, 3, 5, 7].map(n => (
                        <button key={n} style={pill(bestOfSets === n)} onClick={() => setBestOfSets(n)}>
                          {n}
                        </button>
                      ))}
                    </div>
                    <div style={{ ...styles.sub, marginBottom: 4 }}>Legs pro Set</div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {[1, 3, 5].map(n => (
                        <button key={n} style={pill(legsPerSet === n)} onClick={() => setLegsPerSet(n)}>
                          {n}
                        </button>
                      ))}
                    </div>
                    <div style={{ ...styles.sub, marginTop: 6, fontSize: 11 }}>
                      Best of {bestOfSets} Sets ({Math.ceil(bestOfSets / 2)} zum Sieg), je Best of {legsPerSet} Legs
                    </div>
                  </div>
                )}
              </div>

              {/* Zielzuweisung */}
              <div style={styles.card}>
                <div style={{ ...styles.title, marginBottom: 8 }}>Zielzuweisung</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button style={pill(targetAssignment === 'auto')} onClick={() => setTargetAssignment('auto')}>
                    Auto
                  </button>
                  <button style={pill(targetAssignment === 'manual')} onClick={() => setTargetAssignment('manual')}>
                    Manuell
                  </button>
                </div>
                <div style={{ ...styles.sub, marginTop: 6, fontSize: 11 }}>
                  {targetAssignment === 'auto'
                    ? 'Zufaellige Zielzahlen (1-20) werden automatisch zugewiesen'
                    : 'Zielzahlen werden manuell fuer jeden Spieler festgelegt'}
                </div>
              </div>

              {/* Next / Start button */}
              {targetAssignment === 'manual' ? (
                <button
                  style={{
                    ...styles.pill,
                    width: '100%',
                    border: `1px solid ${ACCENT}`,
                    background: ACCENT,
                    color: '#fff',
                    fontWeight: 700,
                  }}
                  onClick={() => setStep(3)}
                >
                  Weiter: Zahlen zuweisen &rarr;
                </button>
              ) : (
                <button
                  style={{
                    ...styles.pill,
                    width: '100%',
                    border: `1px solid ${ACCENT}`,
                    background: ACCENT,
                    color: '#fff',
                    fontWeight: 700,
                  }}
                  onClick={handleStart}
                >
                  Killer starten &rarr;
                </button>
              )}
            </>
          )}

          {/* ===== STEP 3: Manual Target Assignment ===== */}
          {step === 3 && targetAssignment === 'manual' && (
            <>
              <div style={styles.card}>
                <div style={{ ...styles.title, marginBottom: 12 }}>Zielzahlen zuweisen</div>
                <div style={{ ...styles.sub, marginBottom: 12, fontSize: 11 }}>
                  Jeder Spieler bekommt eine einzigartige Zahl (1-20)
                </div>

                {orderedSelected.map((pid) => {
                  const p = mixedList.find((x) => x.id === pid)
                  const currentVal = manualTargets[pid]
                  const available = getAvailableNumbers(pid)

                  return (
                    <div
                      key={pid}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        marginBottom: 10,
                        padding: '8px 10px',
                        background: colors.bgMuted,
                        borderRadius: 8,
                      }}
                    >
                      <span
                        style={{
                          flex: '0 0 100px',
                          fontWeight: 600,
                          fontSize: 13,
                          color: p?.color ?? colors.fg,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {p?.name ?? pid}
                      </span>

                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, flex: 1 }}>
                        {Array.from({ length: 20 }, (_, i) => i + 1).map((num) => {
                          const isSelected = currentVal === num
                          const isAvailable = available.includes(num)
                          return (
                            <button
                              key={num}
                              style={{
                                ...pill(isSelected, !isAvailable && !isSelected),
                                minWidth: 30,
                                padding: '3px 5px',
                                fontSize: 11,
                              }}
                              onClick={() => isAvailable && setManualTarget(pid, num)}
                              disabled={!isAvailable && !isSelected}
                            >
                              {num}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}

                {manualHasDuplicates && (
                  <div style={{ ...styles.sub, fontSize: 11, color: '#ef4444', marginTop: 8 }}>
                    Jede Zahl darf nur einmal vergeben werden
                  </div>
                )}
              </div>

              <button
                style={{
                  ...styles.pill,
                  width: '100%',
                  opacity: canStart ? 1 : 0.5,
                  ...(canStart
                    ? {
                        border: `1px solid ${ACCENT}`,
                        background: ACCENT,
                        color: '#fff',
                        fontWeight: 700,
                      }
                    : {}),
                }}
                onClick={handleStart}
                disabled={!canStart}
              >
                Killer starten &rarr;
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
