// src/storage.ts
// LocalStorage-Persistenz für X01 & Cricket
// - Profile
// - Matches (X01)
// - CricketMatches
// - Leaderboards (X01 & Cricket)
// - Backup / Restore (Merge)
// - LastActivity (zuletzt gespieltes Spiel)

import {
  id,
  now,
  type DartsEvent,
  type MatchStarted,
  type VisitAdded,
  type LegFinished,
  type MatchFinished,
  computeStats,
  applyEvents,
} from './darts501'

import {
  type CricketRange,
  type CricketStyle,
  type CricketEvent,
  type CricketMatchStarted,
  applyCricketEvents as applyCricket,
  now as cricketNow,
  id as cricketId,
  targetWinsFromMatch,
} from './dartsCricket'

import {
  computeCricketStats,
  type CricketMatchComputedStats,
} from './stats/computeCricketStats'

import type { CricketLeaderboardsUI, X01LeaderboardsUI } from './types/stats'


// 🔥 Langzeit X01 Spieler-Stats
import {
  computeX01PlayerMatchStats,
  type X01PerMatchStatsBundle,
  type X01PerMatchPlayerStats,
} from './stats/computeX01PlayerMatchStats'

/* -------------------------------------------------
   Globale LocalStorage Keys
------------------------------------------------- */
const LS_KEYS = {
  matches: 'darts.matches.v1',
  profiles: 'darts.profiles.v1',
  lastOpenMatchId: 'darts.lastOpenMatchId.v1',
  outbox: 'darts.outbox.v1',
  leaderboards: 'darts.leaderboards.v1',
  lastActivity: 'darts.lastActivity.v1',
} as const

const LS_CRICKET = {
  matches: 'cricket.matches.v1',
  lastOpenMatchId: 'cricket.lastOpenMatchId.v1',
} as const

const LS_CRICKET_LB = 'cricket.leaderboards.v1'

// 🔥 NEU: eigener Speicherbereich für langfristige X01-Spieler-Stats
const LS_X01_PLAYERSTATS = 'x01.playerStats.v1'

/* -------------------------------------------------
   Helper: read / write JSON
------------------------------------------------- */
function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function writeJSON<T>(key: string, value: T) {
  localStorage.setItem(key, JSON.stringify(value))
}

function isAfter(a?: string, b?: string): boolean {
  if (!a && b) return false
  if (a && !b) return true
  if (!a && !b) return false
  return new Date(a as string).getTime() > new Date(b as string).getTime()
}

/** Prüft, ob Spieler Gast ist (aus MatchStarted). */
function isGuestPlayerInStart(
  start: MatchStarted | undefined,
  playerId: string
): boolean {
  if (!start) return false
  const p = (start.players as any[]).find(p => p.playerId === playerId)
  return !!(
    p &&
    (p.isGuest === true || String(p.playerId).startsWith('guest:'))
  )
}

/* -------------------------------------------------
   Profile
------------------------------------------------- */
export type Profile = {
  id: string
  name: string
  createdAt: string
  updatedAt: string
  color?: string
}

export function getProfiles(): Profile[] {
  return readJSON<Profile[]>(LS_KEYS.profiles, [])
}

export function saveProfiles(list: Profile[]) {
  writeJSON(LS_KEYS.profiles, list)
}

export function upsertProfile(name: string): Profile {
  const list = getProfiles()
  const existing = list.find(
    p =>
      p.name.trim().toLowerCase() === name.trim().toLowerCase()
  )
  const ts = now()
  if (existing) {
    const updated = { ...existing, name, updatedAt: ts }
    const next = list.map(p => (p.id === existing.id ? updated : p))
    saveProfiles(next)
    return updated
  }
  const created: Profile = {
    id: id(),
    name,
    createdAt: ts,
    updatedAt: ts,
  }
  list.push(created)
  saveProfiles(list)
  return created
}

export async function createProfile(input: {
  name: string
  color?: string
}): Promise<Profile> {
  const list = getProfiles()
  const ts = now()
  const profile: Profile = {
    id: id(),
    name: input.name.trim(),
    color: input.color,
    createdAt: ts,
    updatedAt: ts,
  }
  list.push(profile)
  saveProfiles(list)
  return profile
}

export async function renameProfile(
  profileId: string,
  newName: string
): Promise<void> {
  const list = getProfiles()
  const idx = list.findIndex(p => p.id === profileId)
  if (idx === -1) return
  const ts = now()
  list[idx] = {
    ...list[idx],
    name: newName.trim(),
    updatedAt: ts,
  }
  saveProfiles(list)
}

export async function deleteProfile(profileId: string): Promise<void> {
  const next = getProfiles().filter(p => p.id !== profileId)
  saveProfiles(next)
}

/* -------------------------------------------------
   X01 Matches
------------------------------------------------- */
export type StoredMatch = {
  id: string
  title: string
  createdAt: string
  events: DartsEvent[]
  playerIds: string[]
  finished?: boolean
}

export type NewGameConfig = {
  players: Profile[]
  setMode: boolean
  legs: number
  legsPerSet?: number
  bestOfSets?: number
  starterId: string
  title?: string
}

export function getMatches(): StoredMatch[] {
  return readJSON<StoredMatch[]>(LS_KEYS.matches, [])
}

export function saveMatches(all: StoredMatch[]) {
  writeJSON(LS_KEYS.matches, all)
}

export function setLastOpenMatchId(matchId?: string) {
  if (!matchId) {
    localStorage.removeItem(LS_KEYS.lastOpenMatchId)
    return
  }
  localStorage.setItem(LS_KEYS.lastOpenMatchId, matchId)
}

export function getLastOpenMatchId(): string | undefined {
  return (
    localStorage.getItem(LS_KEYS.lastOpenMatchId) || undefined
  )
}

export function loadMatchById(
  matchId: string
): StoredMatch | undefined {
  return getMatches().find(m => m.id === matchId)
}

export function getOpenMatch(): StoredMatch | undefined {
  const id = getLastOpenMatchId()
  const m = id ? loadMatchById(id) : undefined
  if (m && !m.finished) return m
  return undefined
}

export function persistEvents(
  matchId: string,
  events: DartsEvent[]
) {
  const list = getMatches()
  const idx = list.findIndex(m => m.id === matchId)
  if (idx === -1) return
  list[idx] = { ...list[idx], events }
  saveMatches(list)
}

export function finishMatch(matchId: string) {
  const list = getMatches()
  const idx = list.findIndex(m => m.id === matchId)
  if (idx === -1) return

  list[idx] = { ...list[idx], finished: true }
  saveMatches(list)

  const last = getLastOpenMatchId()
  if (last === matchId) setLastOpenMatchId(undefined)
}

export function getFinishedMatches(): StoredMatch[] {
  return getMatches().filter(m => m.finished)
}

/** Nur falls du mal ein leeres Shell-Match brauchst. */
export function createMatchShell(args: {
  id?: string
  title: string
  playerIds: string[]
}): StoredMatch {
  const matchId = args.id ?? id()
  const stored: StoredMatch = {
    id: matchId,
    createdAt: now(),
    events: [],
    playerIds: args.playerIds,
    title: args.title,
    finished: false,
  }
  const list = getMatches()
  const idx = list.findIndex(m => m.id === matchId)
  if (idx >= 0) list[idx] = stored
  else list.unshift(stored)
  saveMatches(list)
  setLastOpenMatchId(matchId)
  return stored
}

/**
 * Vollständiger X01-Match-Start
 */
export function createNewMatch(cfg: NewGameConfig): StoredMatch {
  const matchId = id()
  const legId = id()

  const structure = cfg.setMode
    ? {
        kind: 'sets' as const,
        legsPerSet: Math.max(1, cfg.legsPerSet || 5),
        bestOfSets: Math.max(1, cfg.bestOfSets || 3),
      }
    : {
        kind: 'legs' as const,
        bestOfLegs: Math.max(1, cfg.legs),
      }

  const start: MatchStarted = {
    eventId: id(),
    type: 'MatchStarted',
    ts: now(),
    matchId,
    mode: '501-double-out',
    structure,
    startingScorePerLeg: 501,
    players: cfg.players.map(p => ({
      playerId: p.id,
      name: p.name,
    })),
    bullThrow: { winnerPlayerId: cfg.starterId },
    version: 1,
    inRule: 'straight-in',
    outRule: 'double-out',
  }

  const events: DartsEvent[] = [start]

  if (structure.kind === 'sets') {
    const set1 = {
      eventId: id(),
      type: 'SetStarted',
      ts: now(),
      matchId,
      setIndex: 1,
    } as any
    events.push(set1)
  }

  const legStart = {
    eventId: id(),
    type: 'LegStarted' as const,
    ts: now(),
    matchId,
    legId,
    legIndex: 1,
    starterPlayerId: cfg.starterId,
  }
  events.push(legStart)

  const stored: StoredMatch = {
    id: matchId,
    createdAt: now(),
    events,
    playerIds: cfg.players.map(p => p.id),
    title:
      cfg.title ??
      `501 – ${cfg.players
        .map(p => p.name)
        .join(' vs ')}`,
    finished: false,
  }

  const list = getMatches()
  list.unshift(stored)
  saveMatches(list)
  setLastOpenMatchId(matchId)
  return stored
}

/* -------------------------------------------------
   Upload Outbox (kannst du easy komplett droppen, wenn du wirklich GAR KEIN MVP willst)
------------------------------------------------- */
export type BackendMatchDTO = {
  matchId: string
  title: string
  players: { id: string; name: string }[]
  startedAt?: string
  finishedAt?: string
  events: DartsEvent[]
}

type OutboxItem = {
  id: string
  createdAt: string
  payload: BackendMatchDTO
  status: 'queued' | 'sent' | 'error'
  errorMessage?: string
}

function getOutbox(): OutboxItem[] {
  return readJSON<OutboxItem[]>(LS_KEYS.outbox, [])
}
function saveOutbox(list: OutboxItem[]) {
  writeJSON(LS_KEYS.outbox, list)
}
function addOutboxItem(payload: BackendMatchDTO) {
  const list = getOutbox()
  list.unshift({
    id: id(),
    createdAt: now(),
    payload,
    status: 'queued',
  })
  saveOutbox(list)
}
export async function tryUploadOutbox(): Promise<void> {
  return
}
export function finishMatchUpload(
  m: StoredMatch,
  players: { id: string; name: string }[]
) {
  const startEvt = m.events.find(
    e => (e as any).type === 'MatchStarted'
  ) as any
  const finishedEvt = m.events.find(
    e => (e as any).type === 'MatchFinished'
  ) as any
  const dto: BackendMatchDTO = {
    matchId: m.id,
    title: m.title,
    players,
    startedAt: startEvt?.ts,
    finishedAt: finishedEvt?.ts ?? now(),
    events: m.events,
  }
  addOutboxItem(dto)
}

/* -------------------------------------------------
   Aggregation X01 pro Spieler (matchweise)
------------------------------------------------- */
export type AggregatedPlayerStats = {
  playerId: string
  name?: string
  matches: number
  wins: number
  losses: number
  dartsThrown: number
  pointsScored: number
  threeDartAvg: number
  first9OverallAvg?: number
}

export function aggregatePlayerStats(
  matches: StoredMatch[]
): Record<string, AggregatedPlayerStats> {
  const result: Record<
    string,
    AggregatedPlayerStats
  > = {}

  for (const m of matches) {
    const start = m.events.find(
      e => (e as any).type === 'MatchStarted'
    ) as MatchStarted | undefined

    const winnerId = (m.events.find(
      e => (e as any).type === 'MatchFinished'
    ) as any)?.winnerPlayerId as
      | string
      | undefined

    const byPlayer = computeStats(m.events as DartsEvent[])

    const idToName: Record<
      string,
      string | undefined
    > = {}
    if (start) {
      for (const pid of m.playerIds) {
        const pname = start.players?.find(
          (p: any) => p.playerId === pid
        )?.name
        idToName[pid] = pname
      }
    }

    // Gäste rausfiltern
    const realPlayerIds = m.playerIds.filter(
      pid => !isGuestPlayerInStart(start, pid)
    )

    for (const pid of realPlayerIds) {
      const ps = byPlayer[pid]
      if (!result[pid]) {
        result[pid] = {
          playerId: pid,
          name: idToName[pid],
          matches: 0,
          wins: 0,
          losses: 0,
          dartsThrown: 0,
          pointsScored: 0,
          threeDartAvg: 0,
          first9OverallAvg: undefined,
        }
      }
      const agg = result[pid]

      if (winnerId) {
        agg.matches += 1
        if (winnerId === pid) agg.wins += 1
        else agg.losses += 1
      }

      if (ps) {
        agg.pointsScored += ps.pointsScored
        agg.dartsThrown += ps.dartsThrown

        if (typeof ps.first9OverallAvg === 'number') {
          if (typeof agg.first9OverallAvg !== 'number')
            agg.first9OverallAvg = 0
          const anyAgg = agg as any
          anyAgg.__first9Count =
            (anyAgg.__first9Count ?? 0) + 1
          const c = anyAgg.__first9Count
          agg.first9OverallAvg =
            ((agg.first9OverallAvg ?? 0) *
              (c - 1) +
              ps.first9OverallAvg) /
            c
        }
      }
    }
  }

  for (const pid of Object.keys(result)) {
    const r: any = result[pid]
    r.threeDartAvg =
      r.dartsThrown > 0
        ? (r.pointsScored / r.dartsThrown) * 3
        : 0
    delete r.__first9Count
  }
  return result as Record<
    string,
    AggregatedPlayerStats
  >
}

/* -------------------------------------------------
   Persistierte X01-Langzeitwerte pro Spieler
------------------------------------------------- */

export type X01PlayerLongTermStats = {
  playerId: string
  playerName?: string

  matchesPlayed: number
  matchesWon: number

  legsWon: number
  setsWon: number

  dartsThrownTotal: number
  pointsScoredTotal: number
  threeDartAvgOverall: number
  first9OverallAvg?: number

  highestCheckout: number

  doubleAttemptsDart: number
  doublesHitDart: number
  doublePctDart: number

  finishingDoubles: Record<string, number>

  tons100Plus: number
  tons140Plus: number
  tons180: number

  doublesHitCount: Record<string, number>
  triplesHitCount: Record<string, number>
  segmentsHitCount: Record<string, number>

  updatedAt: string
}

function loadX01PlayerStatsStore(): Record<string, X01PlayerLongTermStats> {
  return readJSON<Record<string, X01PlayerLongTermStats>>(LS_X01_PLAYERSTATS, {})
}

function saveX01PlayerStatsStore(store: Record<string, X01PlayerLongTermStats>) {
  writeJSON(LS_X01_PLAYERSTATS, store)
}

export function getGlobalX01PlayerStats(): Record<string, X01PlayerLongTermStats> {
  return loadX01PlayerStatsStore()
}

// Hilfsmerge: addiere Keys eines number-Record in ein Ziel
function mergeCountMap(
  base: Record<string, number>,
  add: Record<string, number> | undefined
) {
  if (!add) return
  for (const k of Object.keys(add)) {
    base[k] = (base[k] ?? 0) + (add[k] ?? 0)
  }
}

function mergePlayerMatchIntoCareer(
  prev: X01PlayerLongTermStats | undefined,
  nowData: X01PerMatchPlayerStats,
  powerBins: { _100plus: number; _140plus: number; _180: number },
): X01PlayerLongTermStats {
  const ts = now()

  const fresh: X01PlayerLongTermStats = prev ?? {
    playerId: nowData.playerId,
    playerName: nowData.playerName,

    matchesPlayed: 0,
    matchesWon: 0,

    legsWon: 0,
    setsWon: 0,

    dartsThrownTotal: 0,
    pointsScoredTotal: 0,
    threeDartAvgOverall: 0,
    first9OverallAvg: undefined,

    highestCheckout: 0,

    doubleAttemptsDart: 0,
    doublesHitDart: 0,
    doublePctDart: 0,

    finishingDoubles: {},

    tons100Plus: 0,
    tons140Plus: 0,
    tons180: 0,

    doublesHitCount: {},
    triplesHitCount: {},
    segmentsHitCount: {},

    updatedAt: ts,
  }

  const matchesPlayed = fresh.matchesPlayed + 1
  const matchesWon = fresh.matchesWon + (nowData.wonMatch ? 1 : 0)

  const legsWon = fresh.legsWon + (nowData.legsWon ?? 0)
  const setsWon = fresh.setsWon + (nowData.setsWon ?? 0)

  const dartsThrownTotal = fresh.dartsThrownTotal + nowData.dartsThrown
  const pointsScoredTotal = fresh.pointsScoredTotal + nowData.pointsScored

  const threeDartAvgOverall =
    dartsThrownTotal > 0
      ? (pointsScoredTotal / dartsThrownTotal) * 3
      : 0

  let first9OverallAvg: number | undefined = fresh.first9OverallAvg
  if (typeof nowData.first9OverallAvg === 'number') {
    if (typeof first9OverallAvg !== 'number') {
      first9OverallAvg = nowData.first9OverallAvg
    } else {
      first9OverallAvg =
        ((first9OverallAvg * fresh.matchesPlayed) +
          nowData.first9OverallAvg) /
        matchesPlayed
    }
  }

  const highestCheckout = Math.max(
    fresh.highestCheckout ?? 0,
    nowData.highestCheckout ?? 0
  )

  const doubleAttemptsDart =
    fresh.doubleAttemptsDart + (nowData.doubleAttemptsDart ?? 0)
  const doublesHitDart =
    fresh.doublesHitDart + (nowData.doublesHitDart ?? 0)
  const doublePctDart =
    doubleAttemptsDart > 0
      ? (doublesHitDart / doubleAttemptsDart) * 100
      : 0

  const tons100Plus =
    (fresh.tons100Plus ?? 0) + (powerBins._100plus ?? 0)
  const tons140Plus =
    (fresh.tons140Plus ?? 0) + (powerBins._140plus ?? 0)
  const tons180 =
    (fresh.tons180 ?? 0) + (powerBins._180 ?? 0)

  const finishingDoubles = { ...fresh.finishingDoubles }
  mergeCountMap(finishingDoubles, nowData.finishingDoubles)

  const doublesHitCount = { ...fresh.doublesHitCount }
  const triplesHitCount = { ...fresh.triplesHitCount }
  const segmentsHitCount = { ...fresh.segmentsHitCount }
  mergeCountMap(doublesHitCount, nowData.doublesHitCount)
  mergeCountMap(triplesHitCount, nowData.triplesHitCount)
  mergeCountMap(segmentsHitCount, nowData.segmentsHitCount)

  return {
    playerId: nowData.playerId,
    playerName: nowData.playerName ?? fresh.playerName,

    matchesPlayed,
    matchesWon,

    legsWon,
    setsWon,

    dartsThrownTotal,
    pointsScoredTotal,
    threeDartAvgOverall,
    first9OverallAvg,

    highestCheckout,

    doubleAttemptsDart,
    doublesHitDart,
    doublePctDart,

    finishingDoubles,

    tons100Plus,
    tons140Plus,
    tons180,

    doublesHitCount,
    triplesHitCount,
    segmentsHitCount,

    updatedAt: ts,
  }
}

/**
 * Öffentliche Funktion:
 * Diese Funktion soll am Match-Ende aufgerufen werden.
 * Sie merged Match-Stats pro Spieler → Karriere-Store.
 */
export function updateGlobalX01PlayerStatsFromMatch(matchId: string, events: DartsEvent[]) {
  try {
    const startEvt = events.find(e => e.type === 'MatchStarted') as MatchStarted | undefined
    const finishEvt = events.find(e => e.type === 'MatchFinished') as MatchFinished | undefined

    if (!startEvt) return
    if (!finishEvt) {
      // kein Sieger => kein abgeschlossenes Match => skip
      return
    }

    const bundle: X01PerMatchStatsBundle = computeX01PlayerMatchStats(matchId, events)
    const perPlayerBasic = computeStats(events)

    const store = loadX01PlayerStatsStore()

    for (const pStats of bundle.players) {
      const bins = perPlayerBasic[pStats.playerId]?.bins ?? {
        _100plus: 0,
        _140plus: 0,
        _180: 0,
      }

      const prev = store[pStats.playerId]
      const merged = mergePlayerMatchIntoCareer(prev, pStats, bins)
      store[pStats.playerId] = merged
    }

    saveX01PlayerStatsStore(store)
  } catch (err) {
    console.error('updateGlobalX01PlayerStatsFromMatch failed:', err)
  }
}

export function getFavouriteDoubleForPlayer(pid: string): { bed: string; count: number } | null {
  const store = loadX01PlayerStatsStore()
  const s = store[pid]
  if (!s) return null
  let bestBed = ''
  let bestCount = 0
  for (const k of Object.keys(s.finishingDoubles || {})) {
    const c = s.finishingDoubles[k] ?? 0
    if (c > bestCount) {
      bestCount = c
      bestBed = k
    }
  }
  if (!bestBed) return null
  return { bed: bestBed, count: bestCount }
}

/* -------------------------------------------------
   Leaderboards X01
------------------------------------------------- */
export type LBVisit = {
  playerId: string
  playerName: string
  matchId: string
  visitId: string
  value: number
  ts: string
}

export type LBCheckout = {
  playerId: string
  playerName: string
  matchId: string
  visitId: string
  value: number
  ts: string
}

export type LBLeg = {
  playerId: string
  playerName: string
  matchId: string
  legId: string
  darts: number
  ts: string
}

export type LBPct = {
  playerId: string
  playerName: string
  value: number
  attempts: number
  made: number
}

export type Leaderboards = {
  highVisits: LBVisit[]
  highCheckouts: LBCheckout[]
  bestLegs: LBLeg[]
  worstLegs: LBLeg[]
  bestCheckoutPct: LBPct[]
  worstCheckoutPct: LBPct[]
  processedMatchIds: string[]
  version: 1
}

export function loadLeaderboards(): Leaderboards {
  const raw = readJSON<Leaderboards>(LS_KEYS.leaderboards, {
    highVisits: [],
    highCheckouts: [],
    bestLegs: [],
    worstLegs: [],
    bestCheckoutPct: [],
    worstCheckoutPct: [],
    processedMatchIds: [],
    version: 1,
  })

  if (!Array.isArray(raw.processedMatchIds)) {
    raw.processedMatchIds = []
  }

  return raw
}

export function saveLeaderboards(lb: Leaderboards) {
  writeJSON(LS_KEYS.leaderboards, lb)
}

function playerNameById(match: MatchStarted, pid: string) {
  return (
    match.players.find(p => p.playerId === pid)?.name ??
    pid
  )
}

function dartsToFinishForWinner(
  legId: string,
  winnerId: string,
  events: DartsEvent[]
): { darts: number; ts: string } | null {
  const visits = events.filter(
    e =>
      e.type === 'VisitAdded' &&
      (e as VisitAdded).legId === legId
  ) as VisitAdded[]

  const fin = events.find(
    e =>
      e.type === 'LegFinished' &&
      (e as LegFinished).legId === legId
  ) as LegFinished | undefined

  if (!fin) return null

  let total = 0
  for (const v of visits) {
    if (v.playerId !== winnerId) continue
    if (v.eventId === fin.finishingVisitId) {
      const seq = fin.finishingDartSeq
      total += Math.min(seq, v.darts.length)
      break
    } else {
      total += v.darts.length
    }
  }
  return { darts: total, ts: fin.ts }
}

export function updateLeaderboardsWithMatch(finished: {
  id: string
  events: DartsEvent[]
  finishedAt?: string
}) {
  const lb = loadLeaderboards()

  if (lb.processedMatchIds.includes(finished.id)) {
    return
  }

  const events = finished.events
  const match = events.find(
    e => e.type === 'MatchStarted'
  ) as MatchStarted | undefined
  if (!match) return

  // High Visits
  const visits = events.filter(
    e => e.type === 'VisitAdded'
  ) as VisitAdded[]
  for (const v of visits) {
    if (isGuestPlayerInStart(match, v.playerId)) continue
    lb.highVisits.push({
      playerId: v.playerId,
      playerName: playerNameById(match, v.playerId),
      matchId: finished.id,
      visitId: v.eventId,
      value: v.visitScore,
      ts: v.ts,
    })
  }

  // High Checkouts
  const legsFinished = events.filter(
    e => e.type === 'LegFinished'
  ) as LegFinished[]
  const finishingVisitIds = new Set(
    legsFinished.map(l => l.finishingVisitId)
  )
  for (const v of visits) {
    if (!finishingVisitIds.has(v.eventId)) continue
    if (isGuestPlayerInStart(match, v.playerId)) continue
    lb.highCheckouts.push({
      playerId: v.playerId,
      playerName: playerNameById(match, v.playerId),
      matchId: finished.id,
      visitId: v.eventId,
      value: v.visitScore,
      ts: v.ts,
    })
  }

  // Bestes / schlechtestes Leg
  for (const lf of legsFinished) {
    if (isGuestPlayerInStart(match, lf.winnerPlayerId))
      continue
    const dtf = dartsToFinishForWinner(
      lf.legId,
      lf.winnerPlayerId,
      events
    )
    if (!dtf) continue
    const entry: LBLeg = {
      playerId: lf.winnerPlayerId,
      playerName: playerNameById(match, lf.winnerPlayerId),
      matchId: finished.id,
      legId: lf.legId,
      darts: dtf.darts,
      ts: dtf.ts,
    }
    lb.bestLegs.push(entry)
    lb.worstLegs.push(entry)
  }

  // Checkout %-Leaderboards (DART-basierte Quote!)
  const stats = computeStats(events)
  const pctList: LBPct[] = Object.values(stats)
    .filter(s => !isGuestPlayerInStart(match, s.playerId))
    .map(s => ({
      playerId: s.playerId,
      playerName: playerNameById(match, s.playerId),
      value: s.doublePctDart ?? 0,
      attempts: s.doubleAttemptsDart ?? 0,
      made: s.doublesHitDart ?? 0,
    }))

  lb.bestCheckoutPct.push(
    ...pctList.filter(p => p.attempts > 0)
  )
  lb.worstCheckoutPct.push(
    ...pctList.filter(p => p.attempts > 0)
  )

  // Sortieren
  const byTsDesc = <T extends { ts: string }>(
    a: T,
    b: T
  ) => (a.ts < b.ts ? 1 : -1)

  lb.highVisits.sort(
    (a, b) => b.value - a.value || byTsDesc(a, b)
  )
  lb.highCheckouts.sort(
    (a, b) => b.value - a.value || byTsDesc(a, b)
  )
  lb.bestLegs.sort(
    (a, b) => a.darts - b.darts || byTsDesc(a, b)
  )
  lb.worstLegs.sort(
    (a, b) => b.darts - a.darts || byTsDesc(a, b)
  )
  lb.bestCheckoutPct.sort(
    (a, b) => b.value - a.value
  )
  lb.worstCheckoutPct.sort(
    (a, b) => a.value - b.value
  )

  // Deckeln
  lb.highVisits = lb.highVisits.slice(0, 50)
  lb.highCheckouts = lb.highCheckouts.slice(0, 50)
  lb.bestLegs = lb.bestLegs.slice(0, 50)
  lb.worstLegs = lb.worstLegs.slice(0, 50)
  lb.bestCheckoutPct =
    lb.bestCheckoutPct.slice(0, 50)
  lb.worstCheckoutPct =
    lb.worstCheckoutPct.slice(0, 50)

  lb.processedMatchIds.push(finished.id)

  saveLeaderboards(lb)
}

/** komplette X01-Leaderboards neu aufbauen */
export function rebuildLeaderboards() {
  const empty: Leaderboards = {
    highVisits: [],
    highCheckouts: [],
    bestLegs: [],
    worstLegs: [],
    bestCheckoutPct: [],
    worstCheckoutPct: [],
    processedMatchIds: [],
    version: 1,
  }
  saveLeaderboards(empty)

  const all = getFinishedMatches()
  for (const m of all) {
    updateLeaderboardsWithMatch({
      id: m.id,
      events: m.events,
      finishedAt: (m as any).finishedAt,
    })
  }
}

/* -------------------------------------------------
   Cricket-Persistenz
------------------------------------------------- */
export type CricketStoredMatch = {
  id: string
  title: string
  createdAt: string
  events: CricketEvent[]
  playerIds: string[] // nur echte Profile (keine Gäste)
  finished?: boolean
  // alte Kompatibilität:
  seriesTargetWins?: number
}

export function getCricketMatches(): CricketStoredMatch[] {
  return readJSON<CricketStoredMatch[]>(
    LS_CRICKET.matches,
    []
  )
}

export function saveCricketMatches(
  all: CricketStoredMatch[]
) {
  writeJSON(LS_CRICKET.matches, all)
}

export function getCricketMatch(
  idStr: string
): CricketStoredMatch | undefined {
  return getCricketMatches().find(m => m.id === idStr)
}

export function getOpenCricketMatch():
  | CricketStoredMatch
  | undefined {
  const idStr =
    localStorage.getItem(LS_CRICKET.lastOpenMatchId) ||
    undefined
  const m = idStr
    ? getCricketMatches().find(x => x.id === idStr)
    : undefined
  if (m && !m.finished) return m
  return undefined
}

export function setLastOpenCricketMatchId(idStr?: string) {
  if (!idStr)
    localStorage.removeItem(LS_CRICKET.lastOpenMatchId)
  else
    localStorage.setItem(
      LS_CRICKET.lastOpenMatchId,
      idStr
    )
}

/**
 * Cricket-Äquivalent zu createNewMatch().
 * bestOfGames: z. B. 3 → First to 2; 5 → First to 3
 */
export function createCricketMatchShell(args: {
  id?: string
  title: string
  players: { id: string; name: string; isGuest?: boolean }[]
  range: CricketRange
  style: CricketStyle
  bestOfGames: number
}): CricketStoredMatch {
  const matchId = args.id ?? cricketId()
  const targetWins = Math.floor(args.bestOfGames / 2) + 1

  const startEvt: CricketMatchStarted = {
    eventId: cricketId(),
    type: 'CricketMatchStarted',
    ts: cricketNow(),
    matchId,
    range: args.range,
    style: args.style,
    players: args.players.map(p => ({
      playerId: p.id,
      name: p.name,
      isGuest: p.isGuest,
    })),
    version: 1,
    bestOfGames: args.bestOfGames,
    targetWins,
  }

  const stored: CricketStoredMatch = {
    id: matchId,
    createdAt: cricketNow(),
    events: [startEvt],
    playerIds: args.players
      .filter(p => !p.isGuest)
      .map(p => p.id),
    title: args.title,
    finished: false,
  }

  const list = getCricketMatches()
  list.unshift(stored)
  saveCricketMatches(list)
  setLastOpenCricketMatchId(matchId)
  return stored
}

export function persistCricketEvents(
  matchId: string,
  events: CricketEvent[]
) {
  const list = getCricketMatches()
  const idx = list.findIndex(m => m.id === matchId)
  if (idx === -1) return
  list[idx] = { ...list[idx], events }
  saveCricketMatches(list)
}

/**
 * Cricket-Match beenden.
 */
export function finishCricketMatch(
  matchId: string
) {
  const list = getCricketMatches()
  const idx = list.findIndex(m => m.id === matchId)
  if (idx === -1) return

  list[idx] = { ...list[idx], finished: true }
  saveCricketMatches(list)

  const last =
    localStorage.getItem(
      LS_CRICKET.lastOpenMatchId
    )
  if (last === matchId) {
    setLastOpenCricketMatchId(undefined)
  }

  try {
    const finishedMatch = list[idx]
    if (finishedMatch.finished) {
      updateCricketLeaderboardsWithMatch(
        finishedMatch
      )
    }
  } catch (err) {
    console.error(
      'Cricket leaderboard update failed',
      err
    )
  }
}

/* -------------------------------------------------
   Cricket Summary Helpers
------------------------------------------------- */

export function rebuildCricketStateFromEvents(
  match: CricketStoredMatch
) {
  const start = match.events.find(
    e => (e as any).type === 'CricketMatchStarted'
  ) as CricketMatchStarted | undefined

  const totalsMarks: Record<
    string,
    number
  > = {}
  const totalsPoints: Record<
    string,
    number
  > = {}
  const totalsClosed: Record<
    string,
    number
  > = {}

  if (start?.players) {
    for (const p of start.players) {
      totalsMarks[p.playerId] = 0
      totalsPoints[p.playerId] = 0
      totalsClosed[p.playerId] = 0
    }
  }

  const seq: CricketEvent[] = []
  for (const ev of match.events) {
    seq.push(ev)

    if (ev.type === 'CricketLegFinished') {
      const st = applyCricket(seq)

      for (const pid of Object.keys(
        st.marksByPlayer
      )) {
        const marksSum = Object.values(
          st.marksByPlayer[pid] ?? {}
        ).reduce(
          (a, b) => a + (b ?? 0),
          0
        )

        totalsMarks[pid] =
          (totalsMarks[pid] ?? 0) + marksSum
        totalsPoints[pid] =
          (totalsPoints[pid] ?? 0) +
          (st.pointsByPlayer[pid] ?? 0)

        const closedCount = Object.values(
          st.marksByPlayer[pid] ?? {}
        ).filter(v => (v ?? 0) >= 3).length

        totalsClosed[pid] =
          (totalsClosed[pid] ?? 0) + closedCount
      }
    }
  }

  const finalState = applyCricket(
    match.events
  ) as any
  finalState.totalMarksByPlayer = totalsMarks
  finalState.totalPointsByPlayer = totalsPoints
  finalState.totalClosedCountByPlayer =
    totalsClosed
  return finalState
}

export function getCricketMatchById(
  matchId: string
): null | {
  id: string
  range: CricketRange
  style: CricketStyle
  targetWins: number
  players: { id: string; name: string }[]
  events: CricketEvent[]
  finished: boolean
} {
  const raw = getCricketMatch(matchId)
  if (!raw) return null

  const startEvt = raw.events.find(
    (e: any) =>
      e.type === 'CricketMatchStarted'
  ) as
    | (CricketMatchStarted & {
        bestOfGames?: number
        targetWins?: number
      })
    | undefined

  const range = startEvt?.range ?? 'short'
  const style = startEvt?.style ?? 'standard'

  const players = (startEvt?.players ?? []).map(
    p => ({
      id: p.playerId,
      name: p.name ?? p.playerId,
    })
  )

  const targetWins =
    (startEvt?.targetWins as
      | number
      | undefined) ??
    (raw.seriesTargetWins as
      | number
      | undefined) ??
    (typeof startEvt?.bestOfGames ===
    'number'
      ? Math.floor(
          startEvt.bestOfGames / 2
        ) + 1
      : 1)

  return {
    id: raw.id,
    range,
    style,
    targetWins: targetWins || 1,
    players,
    events: raw.events,
    finished: !!raw.finished,
  }
}

export function getCricketComputedStats(
  matchId: string
): CricketMatchComputedStats | null {
  const m = getCricketMatchById(matchId)
  if (!m) return null
  return computeCricketStats(m)
}

/* -------------------------------------------------
   Cricket Leaderboards
------------------------------------------------- */
export type CricketLBEntry = {
  playerId: string
  playerName: string
  matchId: string
  value: number
  ts: string
}

export type CricketLeaderboards = {
  bullMaster: CricketLBEntry[]
  tripleHunter: CricketLBEntry[]
  fastestLegs: {
    matchId: string
    playerId: string
    playerName: string
    dartsThrown: number
    marks: number
    ts: string
  }[]
  bestTurnMarks: CricketLBEntry[]
  processedMatchIds: string[]
  version: 1
}

export function loadCricketLeaderboards(): CricketLeaderboards {
  return readJSON<CricketLeaderboards>(
    LS_CRICKET_LB,
    {
      bullMaster: [],
      tripleHunter: [],
      fastestLegs: [],
      bestTurnMarks: [],
      processedMatchIds: [],
      version: 1,
    }
  )
}

export function saveCricketLeaderboards(
  lb: CricketLeaderboards
) {
  writeJSON(LS_CRICKET_LB, lb)
}

export function updateCricketLeaderboardsWithMatch(
  match: CricketStoredMatch
) {
  const lb = loadCricketLeaderboards()

  if (lb.processedMatchIds.includes(match.id)) {
    return
  }

  const startEvt = match.events.find(
    (e: any) =>
      e.type === 'CricketMatchStarted'
  ) as CricketMatchStarted | undefined

  const stats = computeCricketStats({
    id: match.id,
    range: startEvt?.range ?? 'short',
    style: startEvt?.style ?? 'standard',
    targetWins:
      (startEvt as any)?.targetWins ??
      ((startEvt as any)?.bestOfGames
        ? Math.floor(
            (startEvt as any).bestOfGames /
              2
          ) + 1
        : 1),
    players: (startEvt?.players ?? []).map(
      p => ({
        id: p.playerId,
        name: p.name ?? p.playerId,
      })
    ),
    events: match.events,
  })

  const finishedTs =
    (match.events.find(
      (e: any) =>
        e.type ===
        'CricketMatchFinished'
    ) as any)?.ts ?? match.createdAt

  for (const p of stats.players) {
    lb.bullMaster.push({
      playerId: p.playerId,
      playerName: p.playerName,
      matchId: match.id,
      value:
        Math.round(
          (p.bullAccuracy ?? 0) * 1000
        ) / 10,
      ts: finishedTs,
    })

    lb.tripleHunter.push({
      playerId: p.playerId,
      playerName: p.playerName,
      matchId: match.id,
      value: p.triplesHit ?? 0,
      ts: finishedTs,
    })

    lb.bestTurnMarks.push({
      playerId: p.playerId,
      playerName: p.playerName,
      matchId: match.id,
      value: p.bestTurnMarks ?? 0,
      ts: finishedTs,
    })
  }

  if (stats.fastestLegByMarks) {
    const fastest = stats.fastestLegByMarks
    const winnerName =
      stats.players.find(
        pp =>
          pp.playerId === fastest.playerId
      )?.playerName ?? fastest.playerId

    lb.fastestLegs.push({
      matchId: match.id,
      playerId: fastest.playerId,
      playerName: winnerName,
      dartsThrown: fastest.dartsThrown,
      marks: fastest.marks,
      ts: finishedTs,
    })
  }

  lb.bullMaster.sort(
    (a, b) => b.value - a.value
  )
  lb.tripleHunter.sort(
    (a, b) => b.value - a.value
  )
  lb.bestTurnMarks.sort(
    (a, b) => b.value - a.value
  )
  lb.fastestLegs.sort(
    (a, b) =>
      a.dartsThrown - b.dartsThrown ||
      b.marks - a.marks
  )

  lb.bullMaster = lb.bullMaster.slice(
    0,
    50
  )
  lb.tripleHunter = lb.tripleHunter.slice(
    0,
    50
  )
  lb.bestTurnMarks = lb.bestTurnMarks.slice(
    0,
    50
  )
  lb.fastestLegs = lb.fastestLegs.slice(
    0,
    50
  )

  lb.processedMatchIds.push(match.id)

  saveCricketLeaderboards(lb)
}

export function rebuildCricketLeaderboards() {
  const empty: CricketLeaderboards = {
    bullMaster: [],
    tripleHunter: [],
    fastestLegs: [],
    bestTurnMarks: [],
    processedMatchIds: [],
    version: 1,
  }
  saveCricketLeaderboards(empty)

  const all = getCricketMatches().filter(
    m => m.finished
  )
  for (const m of all) {
    updateCricketLeaderboardsWithMatch(m)
  }
}

export function getCricketLeaderboards(): CricketLeaderboardsUI {
  const lb = loadCricketLeaderboards()

  const bullMaster = lb.bullMaster.map(entry => ({
    playerId: entry.playerId,
    name: entry.playerName,
    bullPct: entry.value, // Prozent als Zahl (z.B. 42.5)
  }))

  const tripleHunter = lb.tripleHunter.map(entry => ({
    playerId: entry.playerId,
    name: entry.playerName,
    triplesHit: entry.value,
  }))

  const bestTurn = lb.bestTurnMarks.map(entry => ({
    playerId: entry.playerId,
    name: entry.playerName,
    marks: entry.value,
    turnDesc: `${entry.value} Marks Turn`,
  }))

  const fastestLeg = lb.fastestLegs.map(entry => ({
    playerId: entry.playerId,
    name: entry.playerName,
    dartsThrown: entry.dartsThrown,
    marksTotal: entry.marks,
  }))

  return {
    bullMaster,
    tripleHunter,
    bestTurn,
    fastestLeg,
  }
}

export function getX01Leaderboards(): X01LeaderboardsUI {
  const lb = loadLeaderboards()

  return {
    highVisits: lb.highVisits.map(v => ({
      playerId: v.playerId,
      playerName: v.playerName,
      matchId: v.matchId,
      value: v.value,
      ts: v.ts,
    })),

    highCheckouts: lb.highCheckouts.map(v => ({
      playerId: v.playerId,
      playerName: v.playerName,
      matchId: v.matchId,
      value: v.value,
      ts: v.ts,
    })),

    bestLegs: lb.bestLegs.map(l => ({
      playerId: l.playerId,
      playerName: l.playerName,
      matchId: l.matchId,
      darts: l.darts,
      ts: l.ts,
    })),

    worstLegs: lb.worstLegs.map(l => ({
      playerId: l.playerId,
      playerName: l.playerName,
      matchId: l.matchId,
      darts: l.darts,
      ts: l.ts,
    })),

    bestCheckoutPct: lb.bestCheckoutPct.map(p => ({
      playerId: p.playerId,
      playerName: p.playerName,
      value: p.value,
      attempts: p.attempts,
      made: p.made,
    })),

    worstCheckoutPct: lb.worstCheckoutPct.map(p => ({
      playerId: p.playerId,
      playerName: p.playerName,
      value: p.value,
      attempts: p.attempts,
      made: p.made,
    })),
  }
}

/* -------------------------------------------------
   Rematch-Helfer für Cricket
------------------------------------------------- */
export function createCricketRematchFromMatch(
  originalMatchId: string
): string | null {
  const original =
    getCricketMatch(originalMatchId)
  if (!original) return null

  const startEvt = original.events.find(
    (e: any) =>
      e.type === 'CricketMatchStarted'
  ) as
    | {
        range: 'short' | 'long'
        style: 'standard' | 'cutthroat'
        players: {
          playerId: string
          name: string
          isGuest?: boolean
        }[]
        targetWins?: number
        bestOfGames?: number
      }
    | undefined

  if (!startEvt) return null

  const playersInput = (startEvt.players || []).map(
    p => ({
      id: p.playerId,
      name: p.name,
      isGuest: !!p.isGuest,
    })
  )

  const targetWins = startEvt.targetWins
  let bestOfGames: number
  if (
    typeof targetWins === 'number' &&
    targetWins > 0
  ) {
    bestOfGames = targetWins * 2 - 1
  } else if (
    typeof startEvt.bestOfGames ===
      'number' &&
    startEvt.bestOfGames > 0
  ) {
    bestOfGames = startEvt.bestOfGames
  } else {
    bestOfGames = 3
  }

  const title = `Cricket ${
    startEvt.range === 'long'
      ? 'Long'
      : 'Short'
  } · ${
    startEvt.style === 'cutthroat'
      ? 'Cutthroat'
      : 'Standard'
  } – ${playersInput
    .map(p => p.name)
    .join(' vs ')} (Rematch)`

  const newStored =
    createCricketMatchShell({
      title,
      players: playersInput,
      range: startEvt.range,
      style: startEvt.style,
      bestOfGames,
    })

  return newStored.id
}

/* -------------------------------------------------
   Backup / Restore
------------------------------------------------- */
export type BackupBundle = {
  kind: 'darts-backup'
  version: 1
  exportedAt: string
  profiles: Profile[]
  matches: StoredMatch[]
  leaderboards: Leaderboards
  outbox: any[]
  lastOpenMatchId?: string

  cricketMatches?: CricketStoredMatch[]
  cricketLastOpenMatchId?: string
}

export function exportBackup(): BackupBundle {
  const profiles = readJSON<Profile[]>(
    LS_KEYS.profiles,
    []
  )
  const matches = readJSON<StoredMatch[]>(
    LS_KEYS.matches,
    []
  )
  const leaderboards =
    readJSON<Leaderboards>(
      LS_KEYS.leaderboards,
      {
        highVisits: [],
        highCheckouts: [],
        bestLegs: [],
        worstLegs: [],
        bestCheckoutPct: [],
        worstCheckoutPct: [],
        processedMatchIds: [],
        version: 1,
      }
    )
  const outbox = readJSON<any[]>(
    LS_KEYS.outbox,
    []
  )
  const lastOpenMatchId =
    localStorage.getItem(
      LS_KEYS.lastOpenMatchId
    ) || undefined

  const cricketMatches =
    readJSON<CricketStoredMatch[]>(
      LS_CRICKET.matches,
      []
    )
  const cricketLastOpenMatchId =
    localStorage.getItem(
      LS_CRICKET.lastOpenMatchId
    ) || undefined

  return {
    kind: 'darts-backup',
    version: 1,
    exportedAt: now(),
    profiles,
    matches,
    leaderboards,
    outbox,
    lastOpenMatchId,
    cricketMatches,
    cricketLastOpenMatchId,
  }
}

function mergeProfiles(
  local: Profile[],
  incoming: Profile[]
): Profile[] {
  const byId = new Map(local.map(p => [p.id, p]))
  for (const p of incoming) {
    const existing = byId.get(p.id)
    if (!existing) {
      byId.set(p.id, p)
      continue
    }
    const winner = isAfter(
      p.updatedAt,
      existing.updatedAt
    )
      ? p
      : existing
    byId.set(p.id, {
      ...existing,
      ...winner,
    })
  }
  return Array.from(byId.values())
}

function mergeMatches(
  local: StoredMatch[],
  incoming: StoredMatch[]
): StoredMatch[] {
  const byId = new Map(local.map(m => [m.id, m]))
  for (const m of incoming) {
    const existing = byId.get(m.id)
    if (!existing) {
      byId.set(m.id, m)
      continue
    }
    const a = existing.events?.length ?? 0
    const b = m.events?.length ?? 0

    let winner = existing
    if (b > a) winner = m
    else if (b === a && isAfter(m.createdAt, existing.createdAt))
      winner = m

    const finished =
      existing.finished || m.finished
    const title =
      winner.title ||
      existing.title ||
      m.title
    const playerIds = Array.from(
      new Set([
        ...(existing.playerIds || []),
        ...(m.playerIds || []),
      ])
    )

    byId.set(m.id, {
      ...winner,
      finished,
      title,
      playerIds,
    })
  }
  return Array.from(byId.values())
}

type AnyOutbox = {
  id: string
  createdAt?: string
  [k: string]: any
}

function mergeOutbox(
  local: AnyOutbox[],
  incoming: AnyOutbox[]
): AnyOutbox[] {
  const byId = new Map<string, AnyOutbox>(
    local.map(o => [o.id, o])
  )
  for (const o of incoming) {
    const ex = byId.get(o.id)
    if (!ex) {
      byId.set(o.id, o)
      continue
    }
    const winner = isAfter(
      o.createdAt,
      ex.createdAt
    )
      ? o
      : ex
    byId.set(o.id, {
      ...ex,
      ...winner,
    })
  }
  return Array.from(byId.values())
}

/* Cricket-Merge für Backup */
function mergeCricketMatches(
  local: CricketStoredMatch[],
  incoming: CricketStoredMatch[]
): CricketStoredMatch[] {
  const byId = new Map(local.map(m => [m.id, m]))
  for (const m of incoming) {
    const existing = byId.get(m.id)
    if (!existing) {
      byId.set(m.id, m)
      continue
    }
    const a = existing.events?.length ?? 0
    const b = m.events?.length ?? 0

    let winner = existing
    if (b > a) winner = m
    else if (
      b === a &&
      isAfter(m.createdAt, existing.createdAt)
    )
      winner = m

    const finished =
      existing.finished || m.finished
    const title =
      winner.title ||
      existing.title ||
      m.title
    const playerIds = Array.from(
      new Set([
        ...(existing.playerIds || []),
        ...(m.playerIds || []),
      ])
    )

    byId.set(m.id, {
      ...winner,
      finished,
      title,
      playerIds,
    })
  }
  return Array.from(byId.values())
}

export function importBackupMerge(
  bundle: BackupBundle
) {
  if (
    !bundle ||
    bundle.kind !== 'darts-backup' ||
    bundle.version !== 1
  ) {
    throw new Error(
      'Ungültiges Backup-Format oder Version.'
    )
  }

  const mergedProfiles = mergeProfiles(
    readJSON<Profile[]>(LS_KEYS.profiles, []),
    bundle.profiles ?? []
  )
  writeJSON(LS_KEYS.profiles, mergedProfiles)

  const mergedMatches = mergeMatches(
    readJSON<StoredMatch[]>(LS_KEYS.matches, []),
    bundle.matches ?? []
  )
  writeJSON(LS_KEYS.matches, mergedMatches)

  const mergedOutbox = mergeOutbox(
    readJSON<any[]>(LS_KEYS.outbox, []),
    bundle.outbox ?? []
  )
  writeJSON(LS_KEYS.outbox, mergedOutbox)

  const exists = bundle.lastOpenMatchId &&
    mergedMatches.some(
      m => m.id === bundle.lastOpenMatchId
    )
  if (exists && bundle.lastOpenMatchId) {
    localStorage.setItem(
      LS_KEYS.lastOpenMatchId,
      bundle.lastOpenMatchId
    )
  }

  // Cricket Merge
  const localCricket = readJSON<
    CricketStoredMatch[]
  >(LS_CRICKET.matches, [])
  const incomingCricket =
    bundle.cricketMatches ?? []
  const mergedCricket = mergeCricketMatches(
    localCricket,
    incomingCricket
  )
  writeJSON(
    LS_CRICKET.matches,
    mergedCricket
  )

  const existsCricketOpen =
    bundle.cricketLastOpenMatchId &&
    mergedCricket.some(
      m =>
        m.id ===
        bundle.cricketLastOpenMatchId
    )
  if (
    existsCricketOpen &&
    bundle.cricketLastOpenMatchId
  ) {
    localStorage.setItem(
      LS_CRICKET.lastOpenMatchId,
      bundle.cricketLastOpenMatchId
    )
  }

  rebuildLeaderboards()
  rebuildCricketLeaderboards()
}

/* -------------------------------------------------
   Last Activity (Start Menu → "Spiel fortsetzen")
------------------------------------------------- */
type LastActivityInfo = {
  kind: 'x01' | 'cricket'
  matchId: string
  ts: string
}

export function setLastActivity(
  kind: 'x01' | 'cricket',
  matchId: string
) {
  const data: LastActivityInfo = {
    kind,
    matchId,
    ts: now(),
  }
  writeJSON(LS_KEYS.lastActivity, data)
}

export function getLastActivity():
  | (LastActivityInfo & {
      matchExists: boolean
      finished: boolean
    })
  | undefined {
  const raw = readJSON<LastActivityInfo | null>(
    LS_KEYS.lastActivity,
    null
  )
  if (!raw) return undefined

  if (raw.kind === 'x01') {
    const m = getMatches().find(
      mm => mm.id === raw.matchId
    )
    if (!m) {
      return {
        ...raw,
        matchExists: false,
        finished: true,
      }
    }
    return {
      ...raw,
      matchExists: true,
      finished: !!m.finished,
    }
  } else {
    const m = getCricketMatches().find(
      mm => mm.id === raw.matchId
    )
    if (!m) {
      return {
        ...raw,
        matchExists: false,
        finished: true,
      }
    }
    return {
      ...raw,
      matchExists: true,
      finished: !!m.finished,
    }
  }
}

/* -------------------------------------------------
   Match-Ende Helper für X01
   -> zentrale Logik um zu prüfen, ob ein Match vorbei ist.
------------------------------------------------- */

/**
 * checkIfX01MatchIsOver(eventsSoFar):
 * - analysiert die Events mit applyEvents
 * - liefert { finished: boolean, winnerId?: string }
 * - finished=true heißt: wir haben einen MatchFinished Event ODER
 *   aus Legs/Sets klaren Sieger abgeleitet.
 */
export function checkIfX01MatchIsOver(eventsSoFar: DartsEvent[]): {
  finished: boolean
  winnerId?: string
} {
  const derived = applyEvents(eventsSoFar)
  const match = derived.match
  if (!match) return { finished: false }

  // 1. Falls schon ein MatchFinished Event drin ist → Winner übernehmen.
  if (derived.finished?.winnerPlayerId) {
    return { finished: true, winnerId: derived.finished.winnerPlayerId }
  }

  // 2. Sonst aus Legs / Sets ableiten:
  if (match.structure.kind === 'legs') {
    const bestOfLegs = match.structure.bestOfLegs ?? 1
    const need = Math.floor(bestOfLegs / 2) + 1

    const wins: Record<string, number> = {}
    for (const p of match.players) wins[p.playerId] = 0
    for (const L of derived.legs) {
      if (L.winnerPlayerId) {
        wins[L.winnerPlayerId]++
      }
    }
    for (const pid of Object.keys(wins)) {
      if (wins[pid] >= need) {
        return { finished: true, winnerId: pid }
      }
    }
  } else {
    const needSets = Math.floor(match.structure.bestOfSets / 2) + 1

    const setsWon: Record<string, number> = {}
    for (const p of match.players) setsWon[p.playerId] = 0
    for (const s of derived.sets) {
      if (s.winnerPlayerId) {
        setsWon[s.winnerPlayerId]++
      }
    }
    for (const pid of Object.keys(setsWon)) {
      if (setsWon[pid] >= needSets) {
        return { finished: true, winnerId: pid }
      }
    }
  }

  return { finished: false }
}

// src/storage.ts
// ------------------------------------------------------------
// ADD: listMatches()
// Robust: scannt localStorage und sammelt alle Match-Objekte, die wie deine gespeicherten Matches aussehen.
// Erwartet grob: { id, title, createdAt, events: [...] }
// ------------------------------------------------------------

export type StoredMatchListItem = {
  id: string
  title: string
  createdAt: string
  finished?: boolean
  playerIds?: string[]
}

function looksLikeStoredMatch(x: any): x is {
  id: string
  title: string
  createdAt: string
  events: any[]
  finished?: boolean
  playerIds?: string[]
} {
  if (!x || typeof x !== 'object') return false
  if (typeof x.id !== 'string') return false
  if (typeof x.title !== 'string') return false
  if (typeof x.createdAt !== 'string') return false
  if (!Array.isArray(x.events)) return false
  // Minimaler Plausibilitätscheck: MatchStarted muss in events vorkommen
  const hasMatchStarted = x.events.some((e: any) => e && e.type === 'MatchStarted')
  return hasMatchStarted
}

export function listMatches(): StoredMatchListItem[] {
  const res: StoredMatchListItem[] = []

  // 1) Optional: Falls du irgendwo eine Index-Liste hast (unbekannt), könntest du die hier später einhängen.
  // 2) Default: localStorage scan
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (!key) continue

      const raw = localStorage.getItem(key)
      if (!raw) continue

      let parsed: any
      try {
        parsed = JSON.parse(raw)
      } catch {
        continue
      }

      if (looksLikeStoredMatch(parsed)) {
        res.push({
          id: parsed.id,
          title: parsed.title,
          createdAt: parsed.createdAt,
          finished: !!parsed.finished,
          playerIds: Array.isArray(parsed.playerIds) ? parsed.playerIds : undefined,
        })
      }
    }
  } catch (err) {
    console.error('listMatches() failed:', err)
  }

  // Dedupe by id (falls Matches doppelt vorkommen sollten)
  const map = new Map<string, StoredMatchListItem>()
  for (const m of res) map.set(m.id, m)
  return Array.from(map.values()).sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
}


/* -------------------------------------------------
   Dev Helper
------------------------------------------------- */
;(window as any).rebuildCricketLB = rebuildCricketLeaderboards
;(window as any).rebuildX01LB = rebuildLeaderboards
