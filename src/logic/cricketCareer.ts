// Kumulierte Cricket-Spielerstatistiken (Players-only, wie X01)
// Aggregiert: MatchesWon/Gesamt, LegsWon/Gesamt, Marks, Darts, Turns, NoScoreTurns → MPD, MPT, NSTR
// Plus: kleine Trendserien (zuletzt beobachtete MPD-Werte pro Match) für Sparklines

import {
  getCricketMatches,
  getCricketComputedStats,
  getProfiles,
} from '../storage'

export type CricketCareerRow = {
  playerId: string
  // neu:
  matches: number
  matchesWon: number
  legsPlayed: number
  legsWon: number

  marks: number
  darts: number
  turns: number
  noScoreTurns: number

  mpd: number | null
  mpt: number | null
  nstr: number | null // 0..1

  // Trend: letzte MPD-Werte pro Match (aufsteigend nach Zeit)
  mpdTrend: number[]

  lastPlayedTs: number
  name?: string
}

export type CricketCareerOut = {
  rows: CricketCareerRow[]
}

type Thresholds = {
  minDarts?: number
  minTurns?: number
}

function safeNum(n: any, def = 0): number {
  return typeof n === 'number' && isFinite(n) ? n : def
}

function approxFromRatio(total: number, ratio: number): number | null {
  if (ratio == null || !isFinite(ratio) || ratio <= 0) return null
  const v = total / ratio
  return isFinite(v) && v >= 0 ? v : null
}

type _Agg = {
  matches: number
  matchesWon: number
  legsPlayed: number
  legsWon: number
  marks: number
  darts: number
  turns: number
  noScoreTurns: number
  lastPlayedTs: number
  // für Trendaufbau
  _trendPoints: Array<{ ts: number; mpd: number | null }>
}

export function computeCricketCareer(
  thresholds: Thresholds = { minDarts: 30, minTurns: 10 }
): CricketCareerOut {
  const minDarts = thresholds.minDarts ?? 30
  const minTurns = thresholds.minTurns ?? 10

  const matches = (getCricketMatches() || []) as any[]
  const profiles = getProfiles() || []
  const nameMap = new Map<string, string>()
  for (const p of profiles) {
    if (p?.id) nameMap.set(p.id, (p.name || '').trim() || p.id)
  }

  const agg = new Map<string, _Agg>()

  for (const m of matches) {
    if (!m?.id) continue
    if (m?.finished !== true) continue

    const createdAtTs = Date.parse(m?.createdAt || '') || 0

    let comp: any = null
    try {
      comp = getCricketComputedStats ? getCricketComputedStats(m.id) : null
    } catch {
      comp = null
    }
    if (!comp || !Array.isArray(comp.players) || comp.players.length === 0) continue

    // Winner ableiten: Spieler mit maximalen legsWon (bei Gleichstand erster Eintrag)
    const sortedByLegs = [...comp.players].sort((a: any, b: any) => (safeNum(b?.legsWon) - safeNum(a?.legsWon)))
    const winner = sortedByLegs[0]
    const winnerId: string | undefined = winner?.playerId

    // Legs pro Match: Anzahl beendeter Legs (alle Spieler haben die Legs „gespielt“)
    const legsFinishedCount = Array.isArray(comp.events)
      ? (comp.events.filter((ev: any) => ev?.type === 'CricketLegFinished') as any[]).length
      : // Fallback wenn events nicht in comp stecken: aus m.events lesen
        (Array.isArray(m.events) ? m.events.filter((ev: any) => ev?.type === 'CricketLegFinished').length : 0)

    for (const ps of comp.players as any[]) {
      const pid: string = ps?.playerId
      if (!pid) continue

      const totalMarks = safeNum(ps?.totalMarks, 0)

      // direkte Zähler, falls vorhanden
      const turnsRaw = safeNum(ps?.turns, -1)
      const dartsRaw = safeNum(ps?.dartsThrown, -1)

      // aus Ratios abschätzen
      const turnsViaRatio = approxFromRatio(totalMarks, safeNum(ps?.marksPerTurn, 0))
      const dartsViaRatio = approxFromRatio(totalMarks, safeNum(ps?.marksPerDart, 0))

      const turns = turnsRaw >= 0 ? turnsRaw : (turnsViaRatio != null ? Math.round(turnsViaRatio) : 0)
      const darts = dartsRaw >= 0 ? dartsRaw : (dartsViaRatio != null ? Math.round(dartsViaRatio) : 0)

      const noScoreTurns = safeNum(ps?.turnsWithNoScore, 0)
      const legsWon = safeNum(ps?.legsWon, 0)

      // MPD dieses Matches für Trend (nur wenn sinnvoll)
      const mpdThisMatch: number | null =
        darts > 0 ? totalMarks / darts :
        (ps?.marksPerDart && isFinite(ps.marksPerDart) ? ps.marksPerDart : null)

      const cur = agg.get(pid) ?? {
        matches: 0,
        matchesWon: 0,
        legsPlayed: 0,
        legsWon: 0,
        marks: 0,
        darts: 0,
        turns: 0,
        noScoreTurns: 0,
        lastPlayedTs: 0,
        _trendPoints: [],
      }
      cur.matches += 1
      if (winnerId && winnerId === pid) cur.matchesWon += 1

      cur.legsPlayed += legsFinishedCount
      cur.legsWon += legsWon

      cur.marks += totalMarks
      cur.darts += Math.max(0, darts)
      cur.turns += Math.max(0, turns)
      cur.noScoreTurns += Math.max(0, noScoreTurns)
      cur.lastPlayedTs = Math.max(cur.lastPlayedTs, createdAtTs)

      // Trend sammeln
      cur._trendPoints.push({ ts: createdAtTs, mpd: (mpdThisMatch != null && isFinite(mpdThisMatch)) ? mpdThisMatch : null })

      agg.set(pid, cur)
    }
  }

  const rows: CricketCareerRow[] = []
  for (const [pid, v] of agg) {
    const mpd = v.darts >= minDarts && v.darts > 0 ? v.marks / v.darts : null
    const mpt = v.turns >= minTurns && v.turns > 0 ? v.marks / v.turns : null
    const nstr = v.turns >= minTurns && v.turns > 0 ? v.noScoreTurns / v.turns : null

    // Trend: sortieren, leere raus, auf 10 deckeln
    const trend = v._trendPoints
      .filter(p => p.mpd != null && isFinite(p.mpd as number))
      .sort((a, b) => a.ts - b.ts)
      .map(p => p.mpd as number)
      .slice(-10)

    rows.push({
      playerId: pid,
      matches: v.matches,
      matchesWon: v.matchesWon,
      legsPlayed: v.legsPlayed,
      legsWon: v.legsWon,
      marks: v.marks,
      darts: v.darts,
      turns: v.turns,
      noScoreTurns: v.noScoreTurns,
      mpd,
      mpt,
      nstr,
      mpdTrend: trend,
      lastPlayedTs: v.lastPlayedTs,
      name: nameMap.get(pid),
    })
  }

  // Sortierung: MPD desc -> MPT desc -> LegsWon desc -> MatchesWon desc
  rows.sort((a, b) => {
    const am = a.mpd ?? -1
    const bm = b.mpd ?? -1
    if (bm !== am) return bm - am
    const at = a.mpt ?? -1
    const bt = b.mpt ?? -1
    if (bt !== at) return bt - at
    if (b.legsWon !== a.legsWon) return b.legsWon - a.legsWon
    return b.matchesWon - a.matchesWon
  })

  return { rows }
}

// Format-Helper (werden in der UI importiert)
export function fmtFixed2(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return '—'
  return n.toFixed(2)
}
export function fmtPct(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return '—'
  return (n * 100).toFixed(1) + ' %'
}
