// src/screens/NewGame.tsx
import React, { useEffect, useMemo, useState } from 'react'
import {
  id, now,
  type MatchStarted, type DartsEvent,
  type InRule, type OutRule
} from '../darts501'
import {
  getProfiles, getMatches, saveMatches, setLastOpenMatchId,
  type Profile, type StoredMatch
} from '../storage'
import { ui } from '../ui'
import './game.css'

type ModeStr = '121-double-out' | '301-double-out' | '501-double-out' | '701-double-out' | '901-double-out'
type Score = 121 | 301 | 501 | 701 | 901
type Structure =
  | { kind: 'legs'; bestOfLegs?: number }
  | { kind: 'sets'; legsPerSet: number; bestOfSets: number }

type Props = {
  preset?: { mode: ModeStr; startingScore: Score }
  onCancel?: () => void
  onStarted?: (matchId: string) => void
}

/* ---------- kleine Utils ---------- */
function dedupeProfiles(arr: Profile[]): Profile[] {
  const m = new Map<string, Profile>()
  for (const p of arr) if (!m.has(p.id)) m.set(p.id, p)
  return Array.from(m.values())
}
function dedupeIds(arr: string[]): string[] { return Array.from(new Set(arr)) }

function outRuleLabel(r: OutRule) { return r === 'double-out' ? 'Double Out' : r === 'master-out' ? 'Master Out' : 'Single Out' }
function outRuleShort(r: OutRule) { return r === 'double-out' ? 'DO' : r === 'master-out' ? 'MO' : 'SO' }
function inRuleLabel(r: InRule) { return r === 'double-in' ? 'Double In' : 'Normal In' }
function inRuleShort(r: InRule) { return r === 'double-in' ? 'DI' : 'SI' }

/* ---------- Gastfarben ---------- */
const GUEST_COLORS = ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#14b8a6','#f97316','#84cc16']

export default function NewGame({ preset, onCancel, onStarted }: Props) {
  const profiles = dedupeProfiles(getProfiles())

  // Gäste nur lokal in diesem Screen verwalten
  type GuestPick = { id: string; name: string; color: string; isGuest: true }
  const [guests, setGuests] = useState<GuestPick[]>([])

  // Auswahl + Reihenfolge (IDs; können Profil-IDs oder Gast-IDs sein)
  const [selected, setSelected] = useState<string[]>([])
  const [order, setOrder] = useState<string[]>([])
  const [structure, setStructure] = useState<Structure>({ kind: 'legs', bestOfLegs: 3 })

  // Regelauswahl – Default (SI + DO)
  const [inRule, setInRule] = useState<InRule>('straight-in')
  const [outRule, setOutRule] = useState<OutRule>('double-out')

  const maxPlayers = 8
  const score: Score = preset?.startingScore ?? 501
  const rulesDisabled = score === 121

  useEffect(() => {
    if (rulesDisabled) {
      if (inRule !== 'straight-in') setInRule('straight-in')
      if (outRule !== 'double-out') setOutRule('double-out')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rulesDisabled])

  const canStart =
    selected.length >= 1 &&
    selected.length <= maxPlayers &&
    (structure.kind === 'legs'
      ? !!structure.bestOfLegs
      : !!structure.legsPerSet && !!structure.bestOfSets)

  // Preset-Badge
  const presetBadge = useMemo(() => {
    if (!preset) return null
    const label = preset.mode.replace('-double-out', '').toUpperCase()
    return (
      <div style={{ display: 'grid', gap: 6 }}>
        <div style={ui.pills}>
          <span style={{ ...ui.pill, borderColor: '#e5e7eb', background: '#f8fafc', cursor: 'default' }}>
            Modus: <b style={{ marginLeft: 6 }}>{label}</b>
          </span>
          <span style={{ ...ui.pill, borderColor: '#e5e7eb', background: '#f8fafc', cursor: 'default' }}>
            Startscore: <b style={{ marginLeft: 6 }}>{preset.startingScore}</b>
          </span>
        </div>
        {rulesDisabled ? <div style={ui.sub}>Hinweis: Bei 121 sind In/Out-Optionen deaktiviert.</div> : null}
      </div>
    )
  }, [preset, rulesDisabled])

  // gemischte Liste (Profile + Gäste) zur Anzeige
  const mixedList = useMemo(() => {
    const guestAsProfiles: Profile[] = guests.map((g) => ({
      id: g.id,
      name: g.name,
      createdAt: '',
      updatedAt: '',
    }))
    return [...profiles, ...guestAsProfiles]
  }, [profiles, guests])

  // Auswahl toggeln
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

  // Reihenfolge ändern
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

  // Gast hinzufügen
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

  // Matchtitel (kurz)
  const title = useMemo(() => {
    const ids = dedupeIds(order).filter((pid) => selected.includes(pid))
    const idToName = new Map<string,string>()
    mixedList.forEach(p => idToName.set(p.id, p.name ?? p.id))
    const names = ids.map((pid) => idToName.get(pid) ?? pid)
    const rules = rulesDisabled ? 'DO' : `${outRuleShort(outRule)} / ${inRuleShort(inRule)}`
    return `${score} ${rules} – ${names.length ? names.join(' vs ') : 'neues Match'}`
  }, [score, order, selected, mixedList, inRule, outRule, rulesDisabled])

  const handleStart = () => {
    if (!canStart) return

    const playerIds = dedupeIds(order).filter((pid) => selected.includes(pid))
    if (playerIds.length < 1) return

    // Spielerobjekte bauen (Profile ODER Gäste)
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

    const structureEv: MatchStarted['structure'] =
      structure.kind === 'legs'
        ? { kind: 'legs', bestOfLegs: structure.bestOfLegs ?? 1 }
        : { kind: 'sets', legsPerSet: structure.legsPerSet, bestOfSets: structure.bestOfSets }

    const finalInRule: InRule = rulesDisabled ? 'straight-in' : inRule
    const finalOutRule: OutRule = rulesDisabled ? 'double-out' : outRule

    const startEvt: MatchStarted = {
      eventId: id(),
      type: 'MatchStarted',
      ts: now(),
      matchId,
      mode: (preset?.mode ?? '501-double-out') as MatchStarted['mode'],
      structure: structureEv,
      startingScorePerLeg: score,
      // Spieler mit erweiterten Feldern → als any casten, damit TS nicht meckert
      players, // PlayerRef[] mit optionalen isGuest/color,
      bullThrow: { winnerPlayerId: players[0].playerId },
      version: 1,
      inRule: finalInRule,
      outRule: finalOutRule,
    }

    const events: DartsEvent[] = [startEvt]

    if (structureEv.kind === 'sets') {
      events.push({
        eventId: id(), type: 'SetStarted', ts: now(), matchId, setIndex: 1,
      } as DartsEvent)
    }

    events.push({
      eventId: id(),
      type: 'LegStarted',
      ts: now(),
      matchId,
      legId,
      legIndex: 1,
      starterPlayerId: players[0].playerId,
    } as DartsEvent)

    const stored: StoredMatch = {
      id: matchId,
      createdAt: now(),
      events,
      // Nur echte Profil-IDs persistieren → Gäste tauchen nicht in Profil-/Highscore-Statistiken auf
      playerIds: players.filter(p => !(p as any).isGuest).map((p) => p.playerId),
      title,
    }
    const all = getMatches()
    all.unshift(stored)
    saveMatches(all)
    setLastOpenMatchId(matchId)
    onStarted?.(matchId)
  }

  const pillStyle = (active: boolean): React.CSSProperties => ({
    ...ui.pill,
    borderColor: active ? '#0ea5e9' : '#e5e7eb',
    background: active ? '#e0f2fe' : '#fff',
    color: active ? '#0369a1' : '#0f172a',
  })

  return (
    <div style={ui.page}>
      <div style={ui.headerRow}>
        <h2 style={{ margin: 0 }}>Spiel konfigurieren</h2>
        {onCancel ? <button style={ui.backBtn} onClick={onCancel}>← Zurück</button> : null}
      </div>

      {/* Preset-Anzeige */}
      {preset ? (
        <div>
          <div style={ui.sub}>Auswahl</div>
          {presetBadge}
        </div>
      ) : null}

      {/* Regeln */}
      <div style={ui.card}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Regeln</div>
        <div style={{ display: 'grid', gap: 10 }}>
          <div>
            <div style={ui.sub}>Out</div>
            <div style={{ ...ui.pills, marginTop: 4 }}>
              {(['double-out', 'master-out', 'single-out'] as const).map((r) => {
                const active = outRule === r
                return (
                  <button
                    key={r}
                    style={{ ...pillStyle(active), ...(rulesDisabled ? { opacity: 0.5, cursor: 'not-allowed' } : {}) }}
                    onClick={() => !rulesDisabled && setOutRule(r)}
                    disabled={rulesDisabled}
                    aria-pressed={active}
                  >
                    {outRuleLabel(r)}
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            <div style={ui.sub}>In</div>
            <div style={{ ...ui.pills, marginTop: 4 }}>
              {(['straight-in', 'double-in'] as const).map((r) => {
                const active = inRule === r
                return (
                  <button
                    key={r}
                    style={{ ...pillStyle(active), ...(rulesDisabled ? { opacity: 0.5, cursor: 'not-allowed' } : {}) }}
                    onClick={() => !rulesDisabled && setInRule(r)}
                    disabled={rulesDisabled}
                    aria-pressed={active}
                  >
                    {inRuleLabel(r)}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
        {rulesDisabled ? <div style={{ ...ui.sub, marginTop: 8 }}>Bei 121 ist die Regelwahl deaktiviert (Standard: DO / SI).</div> : null}
      </div>

      {/* Spieler wählen + Gast hinzufügen */}
      <div style={{ display: 'grid', gap: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={ui.sub}>Spieler (1–8)</div>
          <button style={ui.pill} onClick={addGuest}>Gast hinzufügen</button>
        </div>

        <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
          {mixedList.map((p) => {
            const isSel = selected.includes(p.id)
            const isGuest = guests.some(g => g.id === p.id)
            const gColor = guests.find(g => g.id === p.id)?.color
            return (
              <div key={p.id} style={ui.rowCard}>
                <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input type="checkbox" checked={isSel} onChange={() => toggleSel(p.id)} />
                  <span style={{ ...(isGuest ? { color: gColor } : {}) }}>{p.name}</span>
                </label>
                {isSel ? (
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <button style={ui.backBtn} onClick={() => moveInOrder(p.id, -1)}>↑</button>
                    <button style={ui.backBtn} onClick={() => moveInOrder(p.id, +1)}>↓</button>
                    <span style={ui.sub}>Pos: {dedupeIds(order).indexOf(p.id) + 1}</span>
                  </div>
                ) : <div />}
              </div>
            )
          })}
        </div>
      </div>

      {/* Struktur */}
      <div style={ui.card}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Struktur</div>
        <div style={{ ...ui.pills, marginBottom: 10 }}>
          <button
            style={pillStyle(structure.kind === 'legs')}
            onClick={() => setStructure({ kind: 'legs', bestOfLegs: structure.kind === 'legs' ? structure.bestOfLegs : 3 })}
          >
            Legs
          </button>
          <button
            style={pillStyle(structure.kind === 'sets')}
            onClick={() => setStructure({ kind: 'sets', legsPerSet: 5, bestOfSets: 3 })}
          >
            Sets
          </button>
        </div>

        {structure.kind === 'legs' ? (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span>Best of</span>
            <select
              value={structure.bestOfLegs ?? 3}
              onChange={(e) => setStructure({ kind: 'legs', bestOfLegs: Number(e.target.value) })}
              style={{ height: 36, borderRadius: 10, border: '1px solid #e5e7eb', background: '#fff', padding: '6px 10px' }}
            >
              <option value={1}>1</option><option value={3}>3</option><option value={5}>5</option><option value={7}>7</option><option value={9}>9</option>
            </select>
            <span>Legs</span>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span>Je Set: Best of</span>
              <select
                value={structure.legsPerSet}
                onChange={(e) => setStructure({ kind: 'sets', legsPerSet: Number(e.target.value), bestOfSets: (structure as any).bestOfSets ?? 3 })}
                style={{ height: 36, borderRadius: 10, border: '1px solid #e5e7eb', background: '#fff', padding: '6px 10px' }}
              >
                <option value={3}>3</option><option value={5}>5</option><option value={7}>7</option>
              </select>
              <span>Legs</span>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span>Best of</span>
              <select
                value={(structure as any).bestOfSets}
                onChange={(e) => setStructure({ kind: 'sets', legsPerSet: (structure as any).legsPerSet, bestOfSets: Number(e.target.value) })}
                style={{ height: 36, borderRadius: 10, border: '1px solid #e5e7eb', background: '#fff', padding: '6px 10px' }}
              >
                <option value={1}>1</option><option value={3}>3</option><option value={5}>5</option>
              </select>
              <span>Sets</span>
            </div>
          </div>
        )}
      </div>

      {/* Starten */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        {onCancel ? <button style={ui.backBtn} onClick={onCancel}>Abbrechen</button> : null}
        <button
          style={{ ...ui.backBtn, ...(canStart ? { borderColor: '#111827', background: '#111827', color: '#fff', fontWeight: 700 } : {}) }}
          disabled={!canStart}
          onClick={handleStart}
        >
          Spiel starten
        </button>
      </div>
    </div>
  )
}
