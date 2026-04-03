// src/screens/MatchHistory.tsx
import React, { useMemo, useState, useEffect } from 'react'
import { ui, getThemedUI } from '../ui'
import { useTheme } from '../ThemeProvider'
import {
  getMatches,
  getMatchesAsync,
  getCricketMatches,
  getATBMatches,
  getStrMatches,
  getHighscoreMatches,
  getCTFMatches,
  getShanghaiMatches,
  getKillerMatches,
  getBobs27Matches,
  getOperationMatches,
  repairBobs27Matches,
  repairOperationMatches,
  type StoredMatch,
  type CricketStoredMatch,
} from '../storage'
import type { ATBStoredMatch } from '../types/aroundTheBlock'
import type { StrStoredMatch } from '../types/straeusschen'
import type { HighscoreStoredMatch } from '../types/highscore'
import type { CTFStoredMatch } from '../types/captureTheField'
import type { ShanghaiStoredMatch } from '../types/shanghai'
import type { KillerStoredMatch } from '../types/killer'
import type { Bobs27StoredMatch } from '../types/bobs27'
import type { OperationStoredMatch } from '../types/operation'
import { getModeLabel, getDirectionLabel, formatDuration, DEFAULT_ATB_CONFIG } from '../dartsAroundTheBlock'
import { formatDuration as formatStrDuration } from '../dartsStraeusschen'
import { formatDuration as formatHsDuration } from '../dartsHighscore'
import { formatDuration as formatCTFDuration } from '../dartsCaptureTheField'
import { formatDuration as formatShanghaiDuration } from '../dartsShanghai'
import { formatDuration as formatKillerDuration } from '../dartsKiller'
import { formatDuration as formatBobs27Duration } from '../dartsBobs27'
import { formatDuration as formatOperationDuration } from '../dartsOperation'

type Props = {
  onBack: () => void
  onOpenX01Match: (matchId: string) => void
  onOpenCricketMatch: (matchId: string) => void
  onOpenATBMatch?: (matchId: string) => void
  onOpenStrMatch?: (matchId: string) => void
  onOpenHighscoreMatch?: (matchId: string) => void
  onOpenCTFMatch?: (matchId: string) => void
  onOpenShanghaiMatch?: (matchId: string) => void
  onOpenKillerMatch?: (matchId: string) => void
  onOpenBobs27Match?: (matchId: string) => void
  onOpenOperationMatch?: (matchId: string) => void
}

type Filter = 'all' | 'x01' | 'cricket' | 'training' | 'party'

const FILTER_LABELS: Record<Filter, string> = {
  all: 'Alle',
  x01: 'X01',
  cricket: 'Cricket',
  training: 'Training',
  party: 'Party',
}

const TRAINING_KINDS = new Set(['atb', 'str', 'highscore', 'bobs27', 'operation'])
const PARTY_KINDS = new Set(['ctf', 'shanghai', 'killer'])

const PAGE_SIZE = 20

function fmtDate(s?: string) {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

function safeTsFromMatch(m: { createdAt?: string; events?: any[] }) {
  const ts = m.createdAt
  if (ts) return ts
  const ev0 = Array.isArray(m.events) ? m.events[0] : undefined
  return ev0?.ts ?? ''
}

function getX01Info(m: StoredMatch) {
  const startEv = m.events?.find((e: any) => e.type === 'MatchStarted') as any
  const finishEv = m.events?.find((e: any) => e.type === 'MatchFinished') as any
  const players = startEv?.players ?? []
  const mode = startEv?.mode ?? ''
  // Parse mode like '501-double-out' -> '501'
  const baseScore = mode.split('-')[0] || '501'
  const playerNames = players.map((p: any) => p.name)

  // Struktur: Sets/Legs
  const structure = startEv?.structure
  const isSets = structure?.kind === 'sets'

  // Winner: from MatchFinished event, or fallback to leg/set wins if event is missing
  let winnerId = finishEv?.winnerPlayerId
  if (!winnerId && m.finished) {
    const winEvents = (m.events || []).filter((e: any) => e.type === (isSets ? 'SetFinished' : 'LegFinished'))
    const wins: Record<string, number> = {}
    for (const ev of winEvents) {
      const wid = (ev as any).winnerPlayerId
      if (wid) wins[wid] = (wins[wid] || 0) + 1
    }
    const sorted = Object.entries(wins).sort((a, b) => b[1] - a[1])
    if (sorted.length > 0 && (sorted.length === 1 || sorted[0][1] > sorted[1][1])) {
      winnerId = sorted[0][0]
    }
  }
  const winnerName = players.find((p: any) => p.playerId === winnerId)?.name

  // Modus mit S/L Suffix
  const score = `${baseScore} ${isSets ? 'S' : 'L'}`

  // Ergebnis berechnen (Sets oder Legs) für beliebig viele Spieler
  let result = ''
  if (players.length >= 1 && (finishEv || m.finished)) {
    // Wins pro Spieler zählen
    const winsPerPlayer: Record<string, number> = {}
    for (const p of players) {
      winsPerPlayer[p.playerId] = 0
    }

    if (isSets) {
      const setEvents = (m.events || []).filter((e: any) => e.type === 'SetFinished')
      for (const ev of setEvents) {
        const wid = (ev as any).winnerPlayerId
        if (wid in winsPerPlayer) winsPerPlayer[wid]++
      }
    } else {
      const legEvents = (m.events || []).filter((e: any) => e.type === 'LegFinished')
      for (const ev of legEvents) {
        const wid = (ev as any).winnerPlayerId
        if (wid in winsPerPlayer) winsPerPlayer[wid]++
      }
    }
    const scores = players.map((p: any) => winsPerPlayer[p.playerId])
    result = scores.join(':')
  }

  return { score, playerNames, winnerName, result }
}

function getCricketInfo(m: CricketStoredMatch) {
  const startEv = m.events?.find((e: any) => e.type === 'CricketMatchStarted') as any
  const finishEv = m.events?.find((e: any) => e.type === 'CricketMatchFinished') as any
  const players = startEv?.players ?? []
  const range = startEv?.range === 'long' ? 'Long' : 'Short'
  const style = startEv?.style as string | undefined // 'standard' | 'cutthroat' | 'simple' | 'crazy'
  const isCrazy = style === 'crazy'
  const playerNames = players.map((p: any) => p.name)
  let winnerId = finishEv?.winnerPlayerId
  if (!winnerId && m.finished) {
    const legEvents = (m.events || []).filter((e: any) => e.type === 'CricketLegFinished')
    const wins: Record<string, number> = {}
    for (const ev of legEvents) { const wid = (ev as any).winnerPlayerId; if (wid) wins[wid] = (wins[wid] || 0) + 1 }
    const sorted = Object.entries(wins).sort((a, b) => b[1] - a[1])
    if (sorted.length > 0 && (sorted.length === 1 || sorted[0][1] > sorted[1][1])) winnerId = sorted[0][0]
  }
  const winnerName = players.find((p: any) => p.playerId === winnerId)?.name

  // Ergebnis berechnen (Legs) für beliebig viele Spieler
  let result = ''
  if (players.length >= 1 && (finishEv || m.finished)) {
    const winsPerPlayer: Record<string, number> = {}
    for (const p of players) {
      winsPerPlayer[p.playerId] = 0
    }
    const legEvents = (m.events || []).filter((e: any) => e.type === 'CricketLegFinished')
    for (const ev of legEvents) {
      const wid = (ev as any).winnerPlayerId
      if (wid in winsPerPlayer) winsPerPlayer[wid]++
    }
    const scores = players.map((p: any) => winsPerPlayer[p.playerId])
    result = scores.join(':')
  }

  return { range, playerNames, winnerName, result, isCrazy }
}

function isFinishedX01(m: StoredMatch) {
  if (m.finished) return true
  if ((m.events as any[])?.some((e) => e?.type === 'MatchFinished')) return true
  // Detect completed matches where MatchFinished was lost (race condition):
  // check if a player won enough legs/sets to win the series
  const startEv = (m.events as any[])?.find((e) => e?.type === 'MatchStarted')
  if (!startEv) return false
  const structure = startEv.structure
  const isSets = structure?.kind === 'sets'
  const bestOf = isSets
    ? (structure?.bestOfSets ?? structure?.setsCount ?? 1)
    : (structure?.bestOfLegs ?? structure?.legsCount ?? 1)
  const target = Math.ceil(bestOf / 2)
  const winType = isSets ? 'SetFinished' : 'LegFinished'
  const wins: Record<string, number> = {}
  for (const e of (m.events || [])) {
    if ((e as any).type === winType) {
      const wid = (e as any).winnerPlayerId
      if (wid) wins[wid] = (wins[wid] || 0) + 1
    }
  }
  return Object.values(wins).some(w => w >= target)
}

function isFinishedCricket(m: CricketStoredMatch) {
  if (m.finished) return true
  if ((m.events as any[])?.some((e) => e?.type === 'CricketMatchFinished')) return true
  // Detect completed matches where CricketMatchFinished was lost
  const startEv = (m.events as any[])?.find((e) => e?.type === 'CricketMatchStarted')
  if (!startEv) return false
  const targetWins = startEv.targetWins ?? Math.ceil((startEv.legsCount ?? 1) / 2)
  if (!targetWins || targetWins <= 0) return false
  const wins: Record<string, number> = {}
  for (const e of (m.events || [])) {
    if ((e as any).type === 'CricketLegFinished') {
      const wid = (e as any).winnerPlayerId
      if (wid) wins[wid] = (wins[wid] || 0) + 1
    }
  }
  return Object.values(wins).some(w => w >= targetWins)
}

function getATBInfo(m: ATBStoredMatch) {
  const players = m.players ?? []
  const playerNames = players.map((p) => p.name)
  const winnerName = m.winnerId
    ? players.find((p) => p.playerId === m.winnerId)?.name
    : undefined

  // Kurzes Format wie X01/Cricket: "ATB L" oder "ATB S"
  const isSets = m.structure?.kind === 'sets'
  const mode = `ATB ${isSets ? 'S' : 'L'}`

  // Prüfe ob Capture the Field - Fallback: config aus ATBMatchStarted Event holen
  const startEvent = (m.events || []).find((e: any) => e.type === 'ATBMatchStarted') as any
  const config = m.config ?? startEvent?.config ?? DEFAULT_ATB_CONFIG
  const isCapture = config.gameMode === 'capture' || config.gameMode === 'pirate'

  // Ergebnis: Legs/Sets gewonnen statt Darts
  let result = ''
  if (m.finished && players.length >= 1) {
    const winsPerPlayer: Record<string, number> = {}
    for (const p of players) {
      winsPerPlayer[p.playerId] = 0
    }

    if (isSets) {
      const setEvents = (m.events || []).filter((e: any) => e.type === 'ATBSetFinished')
      for (const ev of setEvents) {
        const wid = (ev as any).winnerId
        if (wid in winsPerPlayer) winsPerPlayer[wid]++
      }
    } else {
      const legEvents = (m.events || []).filter((e: any) => e.type === 'ATBLegFinished')
      for (const ev of legEvents) {
        const wid = (ev as any).winnerId
        if (wid in winsPerPlayer) winsPerPlayer[wid]++
      }
    }
    const scores = players.map((p) => winsPerPlayer[p.playerId])
    result = scores.join(':')
  }

  const duration = m.durationMs ? formatDuration(m.durationMs) : ''

  const isSuddenDeath = config.specialRule === 'suddenDeath'

  return { mode, playerNames, winnerName, result, duration, isCapture, isSuddenDeath }
}

function isFinishedATB(m: ATBStoredMatch) {
  return !!m.finished
}

function getStrInfo(m: StrStoredMatch) {
  const players = m.players ?? []
  const playerNames = players.map((p) => p.name)
  const winnerName = m.winnerId
    ? players.find((p) => p.playerId === m.winnerId)?.name
    : undefined

  const isSets = m.structure?.kind === 'sets'
  const mode = `Str ${isSets ? 'S' : 'L'}`

  let result = ''
  if (m.finished && players.length >= 1) {
    const winsPerPlayer: Record<string, number> = {}
    for (const p of players) {
      winsPerPlayer[p.playerId] = 0
    }

    if (isSets) {
      const setEvents = (m.events || []).filter((e: any) => e.type === 'StrSetFinished')
      for (const ev of setEvents) {
        const wid = (ev as any).winnerId
        if (wid in winsPerPlayer) winsPerPlayer[wid]++
      }
    } else {
      const legEvents = (m.events || []).filter((e: any) => e.type === 'StrLegFinished')
      for (const ev of legEvents) {
        const wid = (ev as any).winnerId
        if (wid in winsPerPlayer) winsPerPlayer[wid]++
      }
    }
    const scores = players.map((p) => winsPerPlayer[p.playerId])
    result = scores.join(':')
  }

  return { mode, playerNames, winnerName, result }
}

function getHighscoreInfo(m: HighscoreStoredMatch) {
  const players = m.players ?? []
  const playerNames = players.map((p) => p.name)
  const winnerName = m.winnerId
    ? players.find((p) => p.id === m.winnerId)?.name
    : undefined

  const isSets = m.structure?.kind === 'sets'
  const mode = `HS ${m.targetScore} ${isSets ? 'S' : 'L'}`

  let result = ''
  if (m.finished && players.length >= 1) {
    const winsPerPlayer: Record<string, number> = {}
    for (const p of players) {
      winsPerPlayer[p.id] = 0
    }

    if (isSets) {
      const setEvents = (m.events || []).filter((e: any) => e.type === 'HighscoreSetFinished')
      for (const ev of setEvents) {
        const wid = (ev as any).winnerId
        if (wid in winsPerPlayer) winsPerPlayer[wid]++
      }
    } else {
      const legEvents = (m.events || []).filter((e: any) => e.type === 'HighscoreLegFinished')
      for (const ev of legEvents) {
        const wid = (ev as any).winnerId
        if (wid in winsPerPlayer) winsPerPlayer[wid]++
      }
    }
    const scores = players.map((p) => winsPerPlayer[p.id])
    result = scores.join(':')
  }

  const duration = m.durationMs ? formatHsDuration(m.durationMs) : ''

  return { mode, playerNames, winnerName, result, duration }
}

function isFinishedHighscore(m: HighscoreStoredMatch) {
  return !!m.finished
}

function getCTFInfo(m: CTFStoredMatch) {
  const players = m.players ?? []
  const playerNames = players.map((p) => p.name)
  const winnerName = m.winnerId
    ? players.find((p) => p.playerId === m.winnerId)?.name
    : undefined

  const isSets = m.structure?.kind === 'sets'
  const mode = `CTF ${isSets ? 'S' : 'L'}`

  let result = ''
  if (m.finished && players.length >= 1) {
    const winsPerPlayer: Record<string, number> = {}
    for (const p of players) {
      winsPerPlayer[p.playerId] = 0
    }

    if (isSets) {
      const setEvents = (m.events || []).filter((e: any) => e.type === 'CTFSetFinished')
      for (const ev of setEvents) {
        const wid = (ev as any).winnerId
        if (wid in winsPerPlayer) winsPerPlayer[wid]++
      }
    } else {
      const legEvents = (m.events || []).filter((e: any) => e.type === 'CTFLegFinished')
      for (const ev of legEvents) {
        const wid = (ev as any).winnerId
        if (wid in winsPerPlayer) winsPerPlayer[wid]++
      }
    }
    const scores = players.map((p) => winsPerPlayer[p.playerId])
    result = scores.join(':')
  }

  const duration = m.durationMs ? formatCTFDuration(m.durationMs) : ''

  return { mode, playerNames, winnerName, result, duration }
}

function getShanghaiInfo(m: ShanghaiStoredMatch) {
  const players = m.players ?? []
  const playerNames = players.map((p) => p.name)
  const winnerName = m.winnerId
    ? players.find((p) => p.playerId === m.winnerId)?.name
    : m.winnerId === null && m.finished ? undefined : undefined

  const isSets = m.structure?.kind === 'sets'
  const mode = `Shanghai ${isSets ? 'S' : 'L'}`

  let result = ''
  if (m.finished && players.length >= 1) {
    // Show final scores instead of leg wins for Shanghai
    if (m.finalScores) {
      const scores = players.map((p) => m.finalScores![p.playerId] ?? 0)
      result = scores.join(':')
    } else {
      const winsPerPlayer: Record<string, number> = {}
      for (const p of players) {
        winsPerPlayer[p.playerId] = 0
      }
      const legEvents = (m.events || []).filter((e: any) => e.type === 'ShanghaiLegFinished')
      for (const ev of legEvents) {
        const wid = (ev as any).winnerId
        if (wid && wid in winsPerPlayer) winsPerPlayer[wid]++
      }
      const scores = players.map((p) => winsPerPlayer[p.playerId])
      result = scores.join(':')
    }
  }

  const duration = m.durationMs ? formatShanghaiDuration(m.durationMs) : ''
  const isDraw = m.finished && m.winnerId === null

  return { mode, playerNames, winnerName, result, duration, isDraw }
}

function getKillerInfo(m: KillerStoredMatch) {
  const players = m.players ?? []
  const playerNames = players.map((p) => p.name)
  const winnerName = m.winnerId
    ? players.find((p) => p.playerId === m.winnerId)?.name
    : undefined

  const mode = 'Killer'

  let result = ''
  if (m.finished && m.finalStandings) {
    // Show position ranking
    const sorted = [...m.finalStandings].sort((a, b) => a.position - b.position)
    const top = sorted.slice(0, 3)
    result = top.map((s) => {
      const name = players.find((p) => p.playerId === s.playerId)?.name ?? '?'
      return `${s.position}. ${name}`
    }).join(', ')
  }

  const duration = m.durationMs ? formatKillerDuration(m.durationMs) : ''

  return { mode, playerNames, winnerName, result, duration }
}

function getBobs27Info(m: Bobs27StoredMatch) {
  const players = m.players ?? []
  const playerNames = players.map((p) => p.name)
  const winnerName = m.winnerId
    ? players.find((p) => p.playerId === m.winnerId)?.name
    : undefined

  const mode = "Bob's 27"

  let result = ''
  if (m.finished && m.finalScores) {
    result = players.map((p) => m.finalScores?.[p.playerId] ?? 0).join(':')
  }

  const duration = m.durationMs ? formatBobs27Duration(m.durationMs) : ''

  return { mode, playerNames, winnerName, result, duration }
}

function getOperationInfo(m: OperationStoredMatch) {
  const players = m.players ?? []
  const playerNames = players.map((p) => p.name)
  const winnerName = m.winnerId
    ? players.find((p) => p.playerId === m.winnerId)?.name
    : undefined

  const targetLabel = m.config?.targetMode === 'BULL' ? 'Bull' :
    m.config?.targetMode === 'RANDOM_NUMBER' ? 'Zufall' : 'Manuell'
  const mode = `Operation: EFKG (${targetLabel})`

  let result = ''
  if (m.finished && m.finalScores) {
    result = players.map((p) => m.finalScores?.[p.playerId] ?? 0).join(':')
  }

  const duration = m.durationMs ? formatOperationDuration(m.durationMs) : ''

  return { mode, playerNames, winnerName, result, duration }
}

export default function MatchHistory({ onBack, onOpenX01Match, onOpenCricketMatch, onOpenATBMatch, onOpenStrMatch, onOpenHighscoreMatch, onOpenCTFMatch, onOpenShanghaiMatch, onOpenKillerMatch, onOpenBobs27Match, onOpenOperationMatch }: Props) {
  // Theme System
  const { isArcade, colors } = useTheme()
  const styles = useMemo(() => getThemedUI(colors, isArcade), [colors, isArcade])

  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')
  const [showUnfinished, setShowUnfinished] = useState(false)
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)

  // Refresh key: incremented to force all match lists to re-evaluate from cache
  const [refreshKey, setRefreshKey] = useState(0)

  // Re-read match data when: focus returns, visibility changes, or DB phase 2 finishes loading
  useEffect(() => {
    const refresh = () => setRefreshKey(k => k + 1)
    const onVisChange = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    window.addEventListener('focus', refresh)
    window.addEventListener('darts-data-ready', refresh)
    document.addEventListener('visibilitychange', onVisChange)
    return () => {
      window.removeEventListener('focus', refresh)
      window.removeEventListener('darts-data-ready', refresh)
      document.removeEventListener('visibilitychange', onVisChange)
    }
  }, [])

  // X01 Matches async laden (SQLite-aware)
  const [x01, setX01] = useState<StoredMatch[]>(() => getMatches())
  useEffect(() => {
    const syncMatches = getMatches()
    if (syncMatches.length > 0) setX01(syncMatches)
    getMatchesAsync().then(setX01).catch(() => {})
  }, [refreshKey])

  const cricket = useMemo(() => getCricketMatches(), [refreshKey])
  const atb = useMemo(() => getATBMatches(), [refreshKey])
  const str = useMemo(() => getStrMatches(), [refreshKey])
  const highscore = useMemo(() => getHighscoreMatches(), [refreshKey])
  const ctf = useMemo(() => getCTFMatches(), [refreshKey])
  const shanghai = useMemo(() => getShanghaiMatches(), [refreshKey])
  const killer = useMemo(() => getKillerMatches(), [refreshKey])
  const bobs27 = useMemo(() => { repairBobs27Matches(); return getBobs27Matches() }, [refreshKey])
  const operation = useMemo(() => { repairOperationMatches(); return getOperationMatches() }, [refreshKey])

  const items = useMemo(() => {
    const x01Items = x01.map((m) => {
      const info = getX01Info(m)
      const startEv = (m.events as any[])?.find((e) => e?.type === 'MatchStarted')
      const is121 = startEv?.startingScorePerLeg === 121
      return {
        kind: (is121 ? '121' : 'x01') as '121' | 'x01',
        id: m.id,
        createdAt: safeTsFromMatch(m),
        finished: isFinishedX01(m),
        mode: info.score,
        matchName: m.matchName,
        playerNames: info.playerNames,
        winnerName: info.winnerName,
        result: info.result,
      }
    })

    const cricketItems = cricket.map((m) => {
      const info = getCricketInfo(m)
      return {
        kind: 'cricket' as const,
        id: m.id,
        createdAt: safeTsFromMatch(m),
        finished: isFinishedCricket(m),
        mode: `Cricket ${info.range} L`,
        matchName: m.matchName,
        playerNames: info.playerNames,
        winnerName: info.winnerName,
        result: info.result,
        isCrazy: info.isCrazy,
      }
    })

    const atbItems = atb.map((m) => {
      const info = getATBInfo(m)
      return {
        kind: 'atb' as const,
        id: m.id,
        createdAt: m.createdAt,
        finished: isFinishedATB(m),
        mode: info.mode,
        matchName: undefined, // Nur mode anzeigen (ATB L/S)
        playerNames: info.playerNames,
        winnerName: info.winnerName,
        result: info.result,
        duration: info.duration,
        isCapture: info.isCapture,
        isSuddenDeath: info.isSuddenDeath,
      }
    })

    const strItems = str.map((m) => {
      const info = getStrInfo(m)
      return {
        kind: 'str' as const,
        id: m.id,
        createdAt: m.createdAt,
        finished: !!m.finished,
        mode: info.mode,
        matchName: undefined as string | undefined,
        playerNames: info.playerNames,
        winnerName: info.winnerName,
        result: info.result,
      }
    })

    const highscoreItems = highscore.map((m) => {
      const info = getHighscoreInfo(m)
      return {
        kind: 'highscore' as const,
        id: m.id,
        createdAt: m.createdAt,
        finished: isFinishedHighscore(m),
        mode: `Highscore ${m.targetScore}`,
        matchName: undefined,
        playerNames: info.playerNames, // Spielernamen anzeigen (wie bei anderen Spielen)
        winnerName: info.winnerName,
        result: info.result,
        duration: info.duration,
      }
    })

    const ctfItems = ctf.map((m) => {
      const info = getCTFInfo(m)
      return {
        kind: 'ctf' as const,
        id: m.id,
        createdAt: m.createdAt,
        finished: !!m.finished,
        mode: info.mode,
        matchName: undefined as string | undefined,
        playerNames: info.playerNames,
        winnerName: info.winnerName,
        result: info.result,
        duration: info.duration,
      }
    })

    const shanghaiItems = shanghai.map((m) => {
      const info = getShanghaiInfo(m)
      return {
        kind: 'shanghai' as const,
        id: m.id,
        createdAt: m.createdAt,
        finished: !!m.finished,
        mode: info.mode,
        matchName: undefined as string | undefined,
        playerNames: info.playerNames,
        winnerName: info.winnerName,
        result: info.result,
        duration: info.duration,
        isDraw: info.isDraw,
      }
    })

    const killerItems = killer.map((m) => {
      const info = getKillerInfo(m)
      return {
        kind: 'killer' as const,
        id: m.id,
        createdAt: m.createdAt,
        finished: !!m.finished,
        mode: info.mode,
        matchName: undefined as string | undefined,
        playerNames: info.playerNames,
        winnerName: info.winnerName,
        result: info.result,
        duration: info.duration,
      }
    })

    const bobs27Items = bobs27.map((m) => {
      const info = getBobs27Info(m)
      return {
        kind: 'bobs27' as const,
        id: m.id,
        createdAt: m.createdAt,
        finished: !!m.finished,
        mode: info.mode,
        matchName: undefined as string | undefined,
        playerNames: info.playerNames,
        winnerName: info.winnerName,
        result: info.result,
        duration: info.duration,
      }
    })

    const operationItems = operation.map((m) => {
      const info = getOperationInfo(m)
      return {
        kind: 'operation' as const,
        id: m.id,
        createdAt: m.createdAt,
        finished: !!m.finished,
        mode: info.mode,
        matchName: undefined as string | undefined,
        playerNames: info.playerNames,
        winnerName: info.winnerName,
        result: info.result,
        duration: info.duration,
      }
    })

    // Beendete/Unbeendete Matches anzeigen basierend auf Toggle
    let merged = [...x01Items, ...cricketItems, ...atbItems, ...strItems, ...highscoreItems, ...ctfItems, ...shanghaiItems, ...killerItems, ...bobs27Items, ...operationItems]
    if (!showUnfinished) {
      merged = merged.filter((m) => m.finished)
    }

    if (filter === 'x01') merged = merged.filter((x) => x.kind === 'x01' || x.kind === '121')
    if (filter === 'cricket') merged = merged.filter((x) => x.kind === 'cricket')
    if (filter === 'training') merged = merged.filter((x) => TRAINING_KINDS.has(x.kind))
    if (filter === 'party') merged = merged.filter((x) => PARTY_KINDS.has(x.kind))

    // Suchfilter: Name, Datum, Spielernamen
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      merged = merged.filter((m) => {
        // Spielname
        if (m.matchName?.toLowerCase().includes(q)) return true
        // Mode (501 L, Cricket Short L, etc.)
        if (m.mode.toLowerCase().includes(q)) return true
        // Spielernamen
        if (m.playerNames.some((name: string) => name.toLowerCase().includes(q))) return true
        // Datum (formatiert)
        const dateStr = fmtDate(m.createdAt).toLowerCase()
        if (dateStr.includes(q)) return true
        return false
      })
    }

    merged.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
    return merged
  }, [x01, cricket, atb, str, highscore, ctf, shanghai, killer, bobs27, operation, filter, search, showUnfinished])

  return (
    <div style={styles.page}>
      <div style={styles.headerRow}>
        <h2 style={{ margin: 0, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Matchhistorie</h2>
        <button style={styles.backBtn} onClick={onBack}>
          ← Zurück
        </button>
      </div>

      {/* Filter + Suche */}
      <div style={styles.card}>
        <div style={{ display: 'grid', gap: 10 }}>
          {/* Filter Buttons */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }} role="tablist" aria-label="Spielmodus-Filter">
            {(['all', 'x01', 'cricket', 'training', 'party'] as Filter[]).map((f) => (
              <button
                key={f}
                onClick={() => { setFilter(f); setVisibleCount(PAGE_SIZE) }}
                role="tab"
                aria-selected={filter === f}
                style={{
                  height: 36,
                  borderRadius: 999,
                  border: `1px solid ${filter === f ? colors.accent : colors.border}`,
                  background: filter === f
                    ? (isArcade ? colors.accent : '#e0f2fe')
                    : colors.bgCard,
                  color: filter === f
                    ? (isArcade ? '#fff' : '#0369a1')
                    : colors.fg,
                  padding: '0 12px',
                  cursor: 'pointer',
                  fontWeight: 800,
                }}
              >
                {FILTER_LABELS[f]}
              </button>
            ))}

            {/* Toggle für unbeendete Spiele */}
            <button
              onClick={() => setShowUnfinished(!showUnfinished)}
              style={{
                height: 36,
                borderRadius: 999,
                border: `1px solid ${showUnfinished ? colors.accent : colors.border}`,
                background: showUnfinished
                  ? (isArcade ? colors.accent : '#fef3c7')
                  : colors.bgCard,
                color: showUnfinished
                  ? (isArcade ? '#fff' : '#92400e')
                  : colors.fgMuted,
                padding: '0 12px',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: 13,
              }}
            >
              {showUnfinished ? '✓ Unbeendete' : 'Unbeendete'}
            </button>
          </div>

          {/* Suchfeld */}
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <input
                type="text"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setVisibleCount(PAGE_SIZE) }}
                placeholder="Suche: Name, Datum, Spieler..."
                aria-label="Matches durchsuchen"
                style={{
                  width: '100%',
                  height: 36,
                  borderRadius: 999,
                  border: `1px solid ${colors.border}`,
                  background: colors.bgInput,
                  color: colors.fg,
                  padding: '0 36px 0 14px',
                  fontSize: 14,
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  style={{
                    position: 'absolute',
                    right: 8,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: colors.bgSoft,
                    border: 'none',
                    borderRadius: '50%',
                    width: 20,
                    height: 20,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 12,
                    color: colors.fgDim,
                    fontWeight: 700,
                  }}
                >
                  ×
                </button>
              )}
            </div>
          </div>
        </div>

        <div style={{ ...styles.sub, marginTop: 8 }}>
          {items.length} Match{items.length === 1 ? '' : 'es'} gefunden{items.length > visibleCount ? ` (${Math.min(visibleCount, items.length)} angezeigt)` : ''}.
        </div>
      </div>

      {/* Liste (paginiert) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {items.length === 0 ? (
          <div style={{ padding: '12px 16px', background: colors.bgCard, borderRadius: 8, opacity: 0.75, color: colors.fgMuted }}>
            Keine Matches im aktuellen Filter.
          </div>
        ) : (
          items.slice(0, visibleCount).map((m) => (
            <div
              key={`${m.kind}:${m.id}`}
              onClick={() => {
                if (m.kind === 'x01' || m.kind === '121') onOpenX01Match(m.id)
                else if (m.kind === 'cricket') onOpenCricketMatch(m.id)
                else if (m.kind === 'atb' && onOpenATBMatch) onOpenATBMatch(m.id)
                else if (m.kind === 'str' && onOpenStrMatch) onOpenStrMatch(m.id)
                else if (m.kind === 'highscore' && onOpenHighscoreMatch) onOpenHighscoreMatch(m.id)
                else if (m.kind === 'ctf' && onOpenCTFMatch) onOpenCTFMatch(m.id)
                else if (m.kind === 'shanghai' && onOpenShanghaiMatch) onOpenShanghaiMatch(m.id)
                else if (m.kind === 'killer' && onOpenKillerMatch) onOpenKillerMatch(m.id)
                else if (m.kind === 'bobs27' && onOpenBobs27Match) onOpenBobs27Match(m.id)
                else if (m.kind === 'operation' && onOpenOperationMatch) onOpenOperationMatch(m.id)
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 10px',
                background: m.finished ? colors.bgCard : (isArcade ? 'rgba(251,191,36,0.15)' : '#fefce8'),
                borderRadius: 6,
                cursor: 'pointer',
                fontSize: 13,
                boxShadow: isArcade ? 'none' : '0 1px 2px rgba(0,0,0,0.05)',
                border: m.finished
                  ? (isArcade ? `1px solid ${colors.border}` : 'none')
                  : `1px solid ${isArcade ? '#fbbf24' : '#fcd34d'}`,
                opacity: m.finished ? 1 : 0.85,
                overflow: 'hidden',
              }}
            >
              {!m.finished && (
                <span style={{
                  background: isArcade ? '#fbbf24' : '#fbbf24',
                  color: '#78350f',
                  fontSize: 10,
                  fontWeight: 800,
                  padding: '2px 6px',
                  borderRadius: 4,
                  textTransform: 'uppercase',
                }}>
                  Abgebr.
                </span>
              )}
              <span style={{ fontWeight: 700, flexShrink: 0, color: colors.fg, fontSize: 12 }}>
                {m.matchName || m.mode}
                {(m as any).isCrazy && ' 🤪'}
                {(m as any).isCapture && ' 🚩'}
                {(m as any).isSuddenDeath && ' ☠️'}
              </span>
              <span style={{ flex: 1, fontSize: 11, color: colors.fgMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
                {m.playerNames.join(', ')}
              </span>
              {m.result && (
                <span style={{
                  fontWeight: 800,
                  fontSize: 13,
                  color: colors.fg,
                  background: colors.bgMuted,
                  padding: '2px 6px',
                  borderRadius: 4,
                  flexShrink: 0,
                  textAlign: 'center',
                }}>
                  {m.result}
                </span>
              )}
              {m.winnerName ? (
                <span style={{ fontWeight: 600, color: colors.success, flexShrink: 0, fontSize: 12 }}>{m.winnerName}</span>
              ) : !m.finished ? (
                <span style={{ color: colors.warning, fontWeight: 500, flexShrink: 0, fontSize: 12 }}>offen</span>
              ) : null}
              <span style={{ color: colors.fgDim, fontSize: 11, flexShrink: 0 }}>{fmtDate(m.createdAt)}</span>
            </div>
          ))
        )}

        {/* Mehr laden Button */}
        {items.length > visibleCount && (
          <button
            onClick={() => setVisibleCount(c => c + PAGE_SIZE)}
            style={{
              marginTop: 8,
              padding: '12px 16px',
              borderRadius: 10,
              border: `1px solid ${colors.border}`,
              background: colors.bgCard,
              color: colors.fg,
              fontWeight: 700,
              fontSize: 14,
              cursor: 'pointer',
              textAlign: 'center',
            }}
          >
            Mehr laden ({items.length - visibleCount} weitere)
          </button>
        )}
      </div>
    </div>
  )
}
