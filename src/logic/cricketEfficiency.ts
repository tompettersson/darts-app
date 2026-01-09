// src/logic/cricketEfficiency.ts
// Berechnung von Cricket-Effizienzmetriken aus gespeicherten Matches.
// Metriken:
//  - Marks per Dart (MPD)
//  - Marks per Turn (MPT)
//  - No-Score-Turn-Rate (NSTR) = Anteil an Aufnahmen ohne Marks
//
// Annahmen:
//  - Events enthalten CricketTurnAdded mit darts[] (target: number | 'BULL' | 'MISS', mult: 1|2|3)
//  - Marks-Logik: NUMBER: S=1, D=2, T=3; BULL: S=1, D|T=2; MISS=0
//  - NSTR wird als "Turn ohne Marks" gezählt (keine Punkte-Berechnung nötig)
//  - Spielernamen kommen aus match.players; falls nicht vorhanden, fällt zurück auf playerId

export type EfficiencyRow = {
  playerId: string
  name?: string
  marks: number
  darts: number
  turns: number
  noScoreTurns: number
  mpd: number
  mpt: number
  noScoreTurnRate: number
}

export type EfficiencyResult = {
  mpd: EfficiencyRow[]
  mpt: EfficiencyRow[]
  nstr: EfficiencyRow[]
}

type TurnDart = { target: number | 'BULL' | 'MISS'; mult: 1 | 2 | 3 }

type CricketTurnAdded = {
  type: 'CricketTurnAdded'
  playerId: string
  darts: TurnDart[]
}

type CricketMatchLike = {
  id: string
  title?: string
  players: Array<{ id: string; name?: string }>
  events: Array<any>
}

export function marksFromDart(d: TurnDart): number {
  if (d.target === 'MISS') return 0
  if (d.target === 'BULL') return d.mult >= 2 ? 2 : 1 // Triple Bull wird wie Double gezählt
  // number target
  if (d.mult === 3) return 3
  if (d.mult === 2) return 2
  return 1
}

export function computeCricketEfficiencyFromMatches(
  matches: CricketMatchLike[] | undefined | null,
  opts: { minDarts?: number; minTurns?: number } = {}
): EfficiencyResult {
  const minDarts = opts.minDarts ?? 0
  const minTurns = opts.minTurns ?? 0

  const nameById: Record<string, string> = {}
  const acc: Record<string, EfficiencyRow> = {}

  if (!matches || matches.length === 0) {
    return { mpd: [], mpt: [], nstr: [] }
  }

  // Map für Namen befüllen
  for (const m of matches) {
    if (!m || !Array.isArray(m.players)) continue
    for (const p of m.players) {
      if (!nameById[p.id]) nameById[p.id] = p.name ?? p.id
    }
  }

  // Events aggregieren
  for (const m of matches) {
    if (!m || !Array.isArray(m.events)) continue

    for (const ev of m.events) {
      if (!ev || ev.type !== 'CricketTurnAdded') continue
      const turn = ev as CricketTurnAdded
      const pid = turn.playerId

      if (!acc[pid]) {
        acc[pid] = {
          playerId: pid,
          name: nameById[pid] ?? pid,
          marks: 0,
          darts: 0,
          turns: 0,
          noScoreTurns: 0,
          mpd: 0,
          mpt: 0,
          noScoreTurnRate: 0,
        }
      }

      let turnMarks = 0
      const darts = turn.darts ?? []
      for (const d of darts) {
        const mks = marksFromDart(d)
        acc[pid].marks += mks
        acc[pid].darts += 1
        turnMarks += mks
      }
      acc[pid].turns += 1
      if (turnMarks === 0) acc[pid].noScoreTurns += 1
    }
  }

  // Kennzahlen berechnen & filtern
  const rows = Object.values(acc).map(r => {
    const mpd = r.darts > 0 ? r.marks / r.darts : 0
    const mpt = r.turns > 0 ? r.marks / r.turns : 0
    const nstr = r.turns > 0 ? r.noScoreTurns / r.turns : 0
    return { ...r, mpd, mpt, noScoreTurnRate: nstr }
  })

  const filtered = rows.filter(r => r.darts >= minDarts || r.turns >= minTurns)

  const byMpd = [...filtered].sort((a, b) => b.mpd - a.mpd)
  const byMpt = [...filtered].sort((a, b) => b.mpt - a.mpt)
  const byNstr = [...filtered].sort((a, b) => a.noScoreTurnRate - b.noScoreTurnRate) // kleiner ist besser

  return { mpd: byMpd, mpt: byMpt, nstr: byNstr }
}

// Format-Helper
export function fmtFixed2(v: number | undefined | null): string {
  const n = typeof v === 'number' && isFinite(v) ? v : 0
  return n.toFixed(2)
}

export function fmtPct(v: number | undefined | null): string {
  const n = typeof v === 'number' && isFinite(v) ? v : 0
  return (n * 100).toFixed(1) + '%'
}
