// src/screens/GameShanghai.tsx
// Live-Spielscreen fuer Shanghai Darts
// 20 Runden (1-20), alle Spieler werfen auf die gleiche Zahl.
// Punkte: S=Feld×1, D=Feld×2, T=Feld×3. Shanghai (S+D+T) = Sofortsieg.
// Tastatursteuerung: S/D/T=Multiplier, 1-9/0=Zahlen, Space/Enter=Bestaetigen, Backspace=Undo

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { isMatchFinishedInDB } from '../db/storage'
import { useGameState, useGameColors } from '../hooks/useGameState'
import {
  getShanghaiMatchById,
  persistShanghaiEvents,
  finishShanghaiMatch,
  setMatchPaused,
  setMatchElapsedTime,
  deleteShanghaiMatch,
  getPlayerColorBackgroundEnabled,
  getProfiles,
  ensureShanghaiMatchExists,
} from '../storage'
import {
  applyShanghaiEvents,
  recordShanghaiTurn,
  getActivePlayerId,
  getCurrentRound,
  getTargetNumber,
  formatDuration,
  formatDart,
  type ShanghaiEvent,
  type ShanghaiDart,
  type ShanghaiTurnResult,
} from '../dartsShanghai'
import ATBDartboard from '../components/ATBDartboard'
import ShanghaiHitChart from '../components/ShanghaiHitChart'
import GameControls, { PauseOverlay } from '../components/GameControls'
import {
  announceGameStart,
  announceATBHit,
  announceShanghaiRoundAndPlayer,
  announceShanghaiPlayerTurn,
  announceShanghaiHits,
  announceShanghai,
  playTriple20Sound,
  playShanghaiDrumRoll,
  cancelDebouncedAnnounce,
  debouncedAnnounce,
} from '../speech'
import { PLAYER_COLORS } from '../playerColors'
import { useDisableScale } from '../components/ScaleWrapper'

// Intermission-Typ fuer Leg-Zusammenfassung
type ShanghaiIntermission = {
  kind: 'leg'
  legId: string
  legIndex: number
  winnerId: string | null // null for draw
  winnerName: string // or "Unentschieden" for draw
  finalScores: Record<string, number>
  shanghaiWin: boolean
  pendingNextEvents: ShanghaiEvent[]
}

// Nummernpad-Layout fuer Dartfeld-Eingabe
const NUMBER_PAD = [
  [1, 2, 3, 4, 5],
  [6, 7, 8, 9, 10],
  [11, 12, 13, 14, 15],
  [16, 17, 18, 19, 20],
] as const

type MultiplayerProp = {
  enabled: boolean
  roomCode: string
  myPlayerId: string
  localPlayerIds?: string[]
  isHost: boolean
  submitEvents: (events: any[]) => void
  undo: (removeCount: number) => void
  remoteEvents: any[] | null
  connectionStatus: string
  playerCount: number
}

type Props = {
  matchId: string
  onExit: () => void
  onShowSummary: (matchId: string) => void
  multiplayer?: MultiplayerProp
}

export default function GameShanghai({ matchId, onExit, onShowSummary, multiplayer }: Props) {
  useDisableScale()
  // Shared theme colors
  const { c, isArcade, colors } = useGameColors()

  // Mobile detection — stays mobile in landscape too (check shortest dimension)
  const [isMobile, setIsMobile] = useState(() => Math.min(window.innerWidth, window.innerHeight) < 600)
  useEffect(() => {
    const check = () => setIsMobile(Math.min(window.innerWidth, window.innerHeight) < 600)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  const [storedMatch, setStoredMatch] = useState(() => getShanghaiMatchById(matchId))
  const [events, setEvents] = useState<ShanghaiEvent[]>(storedMatch?.events ?? [])

  // Retry loading match if not found yet (multiplayer: match created by host, may not be in cache yet)
  useEffect(() => {
    if (storedMatch) return
    const timer = setInterval(() => {
      const found = getShanghaiMatchById(matchId)
      if (found) { setStoredMatch(found); setEvents(found.events as ShanghaiEvent[]); clearInterval(timer) }
    }, 500)
    return () => clearInterval(timer)
  }, [matchId, storedMatch])
  const [current, setCurrent] = useState<ShanghaiDart[]>([])
  const [mult, setMult] = useState<1 | 2 | 3>(1)
  const [saving, setSaving] = useState(false)
  const multRef = useRef(mult)

  // Nummern-Buffer fuer zweistellige Eingabe (10-20)
  const numBufferRef = useRef('')
  const numTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Fuer Sprachansagen: letztes angesagtes Ziel/Spieler merken
  const lastAnnouncedPlayerRef = useRef<string | null>(null)
  const lastAnnouncedRoundRef = useRef<number>(0)
  const gameOnAnnouncedRef = useRef(false)

  // Leg-Zusammenfassung (Intermission zwischen Legs)
  const [intermission, setIntermission] = useState<ShanghaiIntermission | null>(null)

  // Shanghai Flash-Overlay
  const [showShanghaiFlash, setShowShanghaiFlash] = useState(false)

  // Multiplayer: Remote-Events synchronisieren
  const prevRemoteShanghaiRef = useRef<any[] | null>(null)
  useEffect(() => {
    if (!multiplayer?.remoteEvents) return
    if (multiplayer.remoteEvents === prevRemoteShanghaiRef.current) return
    const prevEvents = prevRemoteShanghaiRef.current as any[] | null
    prevRemoteShanghaiRef.current = multiplayer.remoteEvents
    const remote = multiplayer.remoteEvents as ShanghaiEvent[]
    setEvents(remote)
    persistShanghaiEvents(matchId, remote)
    // Detect MatchFinished: only trigger when NEW
    const matchFinishedEvt = remote.find((e: any) => e.type === 'ShanghaiMatchFinished') as any
    const prevHadFinished = prevEvents ? prevEvents.some((e: any) => e.type === 'ShanghaiMatchFinished') : false
    if (matchFinishedEvt && !prevHadFinished) {
      if (multiplayer?.isHost) {
        // Host persists immediately
        ;(async () => {
          try { await persistShanghaiEvents(matchId, remote) } catch {}
          await finishShanghaiMatch(matchId, matchFinishedEvt.winnerId, matchFinishedEvt.totalDarts, matchFinishedEvt.durationMs)
          if (onShowSummary) setTimeout(() => onShowSummary(matchId), 2000)
        })()
      } else {
        // Guest: persist as backup after 5s (in case host disconnected before saving)
        setTimeout(async () => {
          try {
            // Skip if host already saved
            if (await isMatchFinishedInDB('shanghai_matches', matchId)) return
            await persistShanghaiEvents(matchId, remote)
            await finishShanghaiMatch(matchId, matchFinishedEvt.winnerId, matchFinishedEvt.totalDarts, matchFinishedEvt.durationMs)
          } catch {}
        }, 5000)
        if (onShowSummary) setTimeout(() => onShowSummary(matchId), 2000)
      }
    }
    // Ensure match exists locally for guest
    if (remote.length > 0) {
      const startEvt = remote.find((e: any) => e.type === 'ShanghaiMatchStarted') as any
      if (startEvt) {
        ensureShanghaiMatchExists(matchId, remote, startEvt.players?.map((p: any) => p.playerId) ?? [])
      }
    }
  }, [multiplayer?.remoteEvents]) // eslint-disable-line react-hooks/exhaustive-deps

  // State aus Events ableiten
  const state = useMemo(() => applyShanghaiEvents(events), [events])

  // Shared game state: pause, timer, speech/mute, visibility
  const { gamePaused, setGamePaused, muted, setMuted, elapsedMs, setElapsedMs } = useGameState({
    matchId,
    mode: 'shanghai',
    finished: state.finished,
  })

  const players = state.match?.players ?? []
  const currentRound = getCurrentRound(state)
  const targetNumber = getTargetNumber(state)
  const activePlayerId = getActivePlayerId(state)
  const activePlayer = players.find(p => p.playerId === activePlayerId)
  const shanghaiState = state.shanghaiState

  // Multiplayer: Ist der lokale Spieler gerade am Zug?
  const shanghaiLocalIds = multiplayer?.localPlayerIds ?? (multiplayer?.myPlayerId ? [multiplayer.myPlayerId] : [])
  const isMyTurn = !multiplayer?.enabled || (activePlayerId != null && shanghaiLocalIds.includes(activePlayerId))

  // "[Name], throw first! Game on!" Ansage
  useEffect(() => {
    if (!gameOnAnnouncedRef.current && state.match && activePlayerId && activePlayer) {
      gameOnAnnouncedRef.current = true
      announceGameStart(activePlayer.name)
      lastAnnouncedPlayerRef.current = activePlayerId
      lastAnnouncedRoundRef.current = currentRound
    }
  }, [state.match, activePlayerId, activePlayer, currentRound])

  // Sync mult with ref
  useEffect(() => {
    multRef.current = mult
  }, [mult])

  // Spieler-Wechsel + Runden-Ansage
  useEffect(() => {
    if (!activePlayerId || !activePlayer) return
    if (state.finished) return
    if (!gameOnAnnouncedRef.current) return
    if (gamePaused || intermission) return

    // Nur ansagen wenn sich der Spieler geaendert hat
    if (lastAnnouncedPlayerRef.current !== activePlayerId) {
      lastAnnouncedPlayerRef.current = activePlayerId

      // Debounced (verhindert Stacking bei schnellem Undo)
      debouncedAnnounce(() => {
        // Neue Runde? -> Zielzahl + Name ansagen
        if (currentRound !== lastAnnouncedRoundRef.current) {
          lastAnnouncedRoundRef.current = currentRound
          announceShanghaiRoundAndPlayer(targetNumber, activePlayer.name)
        } else {
          // Gleiche Runde, nur Spielerwechsel -> nur Name
          announceShanghaiPlayerTurn(activePlayer.name)
        }
      })
    }
  }, [activePlayerId, activePlayer, state.finished, gamePaused, intermission, currentRound, targetNumber])

  // Dart hinzufuegen (Treffer auf eine bestimmte Zahl)
  const addDart = useCallback((dartTarget: number) => {
    if (gamePaused) return
    if (!activePlayerId || !state.match) return
    // Multiplayer: Nur eigene Würfe eingeben
    if (multiplayer?.enabled && !isMyTurn) return
    if (current.length >= 3) return

    const currentMult = multRef.current
    const dart: ShanghaiDart = { target: dartTarget, mult: currentMult }

    if (dartTarget === 20 && currentMult === 3) playTriple20Sound()

    // Trommelwirbel-Check: Wenn nach diesem Dart 2 Darts auf dem Target liegen
    // mit 2 verschiedenen Multipliern, ist ein Shanghai moeglich
    const newCurrent = [...current, dart]
    if (newCurrent.length === 2) {
      const hitsOnTarget = newCurrent.filter(d => d.target !== 'MISS' && d.target === targetNumber)
      if (hitsOnTarget.length === 2) {
        const mults = new Set(hitsOnTarget.map(d => d.mult))
        if (mults.size === 2) {
          const turnKey = `${activePlayerId}-${currentRound}-${targetNumber}`
          if (drumRollPlayedRef.current !== turnKey) {
            drumRollPlayedRef.current = turnKey
            playShanghaiDrumRoll()
          }
        }
      }
    }

    setCurrent(prev => {
      if (prev.length >= 3) return prev
      return [...prev, dart]
    })

    // Sprachansage: Double/Triple
    if (currentMult >= 2) {
      announceATBHit(currentMult)
    }

    // Nach jedem Wurf zurueck auf Single
    setMult(1)
  }, [activePlayerId, current, state, gamePaused, targetNumber, currentRound, multiplayer, isMyTurn])

  // Miss hinzufuegen
  const addMiss = useCallback(() => {
    if (gamePaused) return
    // Multiplayer: Nur eigene Würfe eingeben
    if (multiplayer?.enabled && !isMyTurn) return
    const dart: ShanghaiDart = { target: 'MISS', mult: 1 }
    setCurrent(prev => {
      if (prev.length >= 3) return prev
      return [...prev, dart]
    })
    setMult(1)
  }, [gamePaused, multiplayer, isMyTurn])

  // Refs fuer addDart/addMiss (damit Timer-Callbacks immer die aktuelle Version nutzen)
  const addDartRef = useRef(addDart)
  const addMissRef = useRef(addMiss)
  useEffect(() => { addDartRef.current = addDart }, [addDart])
  useEffect(() => { addMissRef.current = addMiss }, [addMiss])

  // Ref fuer Trommelwirbel-Dedup (wird in addDart genutzt)
  const drumRollPlayedRef = useRef<string>('')

  // Nummern-Buffer leeren und als Dart verarbeiten
  const flushNumBuffer = useCallback(() => {
    const buf = numBufferRef.current
    numBufferRef.current = ''
    if (numTimerRef.current) {
      clearTimeout(numTimerRef.current)
      numTimerRef.current = null
    }
    if (!buf) return
    const num = parseInt(buf, 10)
    if (num === 0) addMissRef.current()
    else if (num >= 1 && num <= 20) addDartRef.current(num)
  }, [])

  // Turn bestaetigen
  const confirmTurn = useCallback(() => {
    if (gamePaused) return
    if (!activePlayerId || current.length === 0) return
    // Multiplayer: Nur eigene Turns bestätigen
    if (multiplayer?.enabled && !isMyTurn) return

    const darts = [...current]
    while (darts.length < 3) {
      darts.push({ target: 'MISS', mult: 1 })
    }

    const result = recordShanghaiTurn(state, activePlayerId, darts)
    const newEvents: ShanghaiEvent[] = [...events, result.turnEvent]

    // Gewichtete Treffer-Anzahl berechnen (Single=1, Double=2, Triple=3)
    const hitCount = darts
      .filter(d => d.target !== 'MISS' && d.target === result.turnEvent.targetNumber)
      .reduce((sum, d) => sum + d.mult, 0)

    // Shanghai-Flash anzeigen
    if (result.turnEvent.isShanghai) {
      setShowShanghaiFlash(true)
      announceShanghai()
      setTimeout(() => setShowShanghaiFlash(false), 2000)
    } else {
      // Treffer-Ansage (nicht bei Shanghai - da wird "SHANGHAI!" angesagt)
      announceShanghaiHits(hitCount)
    }

    // Runden-Event hinzufuegen falls vorhanden
    if (result.roundFinished) {
      newEvents.push(result.roundFinished)
    }

    // Leg beendet?
    if (result.legFinished) {
      newEvents.push(result.legFinished)

      // Set beendet?
      if (result.setFinished) {
        newEvents.push(result.setFinished)
      }

      // Match beendet?
      if (result.matchFinished) {
        newEvents.push(result.matchFinished)

        setEvents(newEvents)
        setCurrent([])
        setMult(1)
        if (multiplayer?.enabled) multiplayer.submitEvents(newEvents.slice(events.length))
        // Persist + finish must complete before navigating to summary
        setSaving(true)
        ;(async () => {
          try {
            await persistShanghaiEvents(matchId, newEvents)
            await finishShanghaiMatch(matchId, result.matchFinished!.winnerId, result.matchFinished!.totalDarts, result.matchFinished!.durationMs)
          } catch (err) {
            console.warn('[Shanghai] Persist failed:', err)
          } finally {
            setSaving(false)
          }
          setTimeout(() => onShowSummary(matchId), 2500)
        })()
        return
      }

      // Leg fertig aber Match nicht - Intermission zeigen
      if (result.nextLegStart) {
        const legWinnerId = result.legFinished.winnerId
        const legWinnerPlayer = legWinnerId ? players.find(p => p.playerId === legWinnerId) : null
        const winnerName = legWinnerPlayer ? legWinnerPlayer.name : 'Unentschieden'

        persistShanghaiEvents(matchId, newEvents)
        setEvents(newEvents)
        setCurrent([])
        setMult(1)
        if (multiplayer?.enabled) multiplayer.submitEvents(newEvents.slice(events.length))

        setIntermission({
          kind: 'leg',
          legId: result.legFinished.legId,
          legIndex: state.currentLegIndex + 1,
          winnerId: legWinnerId,
          winnerName,
          finalScores: result.legFinished.finalScores,
          shanghaiWin: result.legFinished.shanghaiWin,
          pendingNextEvents: [result.nextLegStart],
        })
        return
      }
    }

    persistShanghaiEvents(matchId, newEvents)
    setEvents(newEvents)
    setCurrent([])
    setMult(1)
    if (multiplayer?.enabled) multiplayer.submitEvents(newEvents.slice(events.length))
  }, [activePlayerId, current, events, matchId, state, players, onShowSummary, multiplayer, isMyTurn])

  // Letzten Zug rueckgaengig machen
  const undoLastTurn = useCallback(() => {
    // Finde den letzten ShanghaiTurnAdded Event
    let lastTurnIndex = -1
    for (let i = events.length - 1; i >= 0; i--) {
      if (events[i].type === 'ShanghaiTurnAdded') {
        lastTurnIndex = i
        break
      }
    }

    if (lastTurnIndex === -1) return // Kein Turn zum Rueckgaengigmachen

    // Ausstehende Sprachansagen abbrechen
    cancelDebouncedAnnounce()

    // Entferne alle Events ab dem letzten Turn (inkl. eventueller RoundFinished/LegFinished etc.)
    const newEvents = events.slice(0, lastTurnIndex)
    persistShanghaiEvents(matchId, newEvents)
    setEvents(newEvents)
    setCurrent([])
    setMult(1)
    if (multiplayer?.enabled) multiplayer.undo(events.length - lastTurnIndex)
  }, [events, matchId, multiplayer])

  // Pruefe ob Undo moeglich ist (mindestens ein Turn vorhanden)
  const canUndo = useMemo(() => {
    return events.some(e => e.type === 'ShanghaiTurnAdded')
  }, [events])

  // Auto-Confirm bei 3 Darts
  useEffect(() => {
    if (current.length === 3) {
      confirmTurn()
    }
  }, [current.length, confirmTurn])

  // Ensure keyboard focus when a local player's turn starts
  useEffect(() => {
    if (!multiplayer?.enabled || isMyTurn) document.body.focus()
  }, [activePlayerId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Keyboard Handler
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase()
      if (tag === 'input' || tag === 'textarea') return

      // P = Pause umschalten
      if (e.key === 'p' || e.key === 'P') {
        setGamePaused(p => !p)
        return
      }

      // Pause aktiv? Keine anderen Eingaben
      if (gamePaused) return

      const k = e.key.toLowerCase()

      // S/D/T fuer Multiplier
      if (k === 's') { setMult(1); e.preventDefault(); return }
      if (k === 'd') { setMult(2); e.preventDefault(); return }
      if (k === 't') { setMult(3); e.preventDefault(); return }

      // Zahlentasten 0-9 mit zweistelliger Eingabe (500ms Buffer)
      if (k >= '0' && k <= '9') {
        e.preventDefault()
        const digit = parseInt(k, 10)

        // Laufenden Timer abbrechen
        if (numTimerRef.current) {
          clearTimeout(numTimerRef.current)
          numTimerRef.current = null
        }

        if (numBufferRef.current !== '') {
          // Zweite Ziffer: kombinieren
          const firstDigit = parseInt(numBufferRef.current)
          numBufferRef.current = ''
          const combined = firstDigit * 10 + digit

          if (combined >= 10 && combined <= 20) {
            addDart(combined)
          } else {
            // Ungueltig (z.B. 21+): erste Ziffer als Feld, zweite neu verarbeiten
            addDart(firstDigit)
            if (digit === 0) {
              addMiss()
            } else if (digit >= 3) {
              addDart(digit)
            } else {
              // 1 oder 2: neuen Buffer starten
              numBufferRef.current = String(digit)
              numTimerRef.current = setTimeout(flushNumBuffer, 500)
            }
          }
        } else {
          // Erste Ziffer
          if (digit === 0) {
            addMiss()
          } else if (digit >= 3) {
            // 3-9: kein zweistelliges Dartfeld moeglich, sofort feuern
            addDart(digit)
          } else {
            // 1 oder 2: koennte Beginn von 10-20 sein, 500ms warten
            numBufferRef.current = String(digit)
            numTimerRef.current = setTimeout(flushNumBuffer, 500)
          }
        }
        return
      }

      // Backspace = letzten Dart entfernen
      if (e.key === 'Backspace') {
        setCurrent(prev => prev.slice(0, -1))
        e.preventDefault()
        return
      }

      // Space = Treffer auf aktuelles Zielfeld (mit aktuellem Multiplier)
      if (e.code === 'Space' || e.key === ' ') {
        e.preventDefault()
        if (targetNumber >= 1 && targetNumber <= 20) {
          addDart(targetNumber)
        }
        return
      }

      // Enter = Turn bestaetigen
      if (e.key === 'Enter') {
        confirmTurn()
        e.preventDefault()
        return
      }

      // Escape = Menue
      if (e.key === 'Escape') {
        onExit()
        e.preventDefault()
        return
      }
    }

    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      // Timer aufraeumen
      if (numTimerRef.current) {
        clearTimeout(numTimerRef.current)
        numTimerRef.current = null
      }
    }
  }, [addDart, addMiss, confirmTurn, onExit, gamePaused, targetNumber, flushNumBuffer])

  // Profile laden fuer Spielerfarben
  const profiles = useMemo(() => getProfiles(), [])

  // Spielerfarben aus Profilen holen (Fallback auf PLAYER_COLORS)
  const playerColors = useMemo(() => {
    const colorMap: Record<string, string> = {}
    if (!state.match) return colorMap
    state.match.players.forEach((p, idx) => {
      const profile = profiles.find(pr => pr.id === p.playerId)
      colorMap[p.playerId] = profile?.color ?? PLAYER_COLORS[idx % PLAYER_COLORS.length]
    })
    return colorMap
  }, [state.match?.players, profiles])

  // Farbe des aktiven Spielers fuer Zielfeld-Highlight
  const activePlayerIndex = (state.match?.players ?? []).findIndex(p => p.playerId === activePlayerId)
  const activePlayerColor = activePlayerIndex >= 0
    ? playerColors[(state.match?.players ?? [])[activePlayerIndex]?.playerId] ?? PLAYER_COLORS[activePlayerIndex % PLAYER_COLORS.length]
    : undefined

  // Spielerfarben-Hintergrund Einstellung
  const playerColorBgEnabled = getPlayerColorBackgroundEnabled()

  // Dartboard-Players: Zeige aktuellen Zielfeld-Marker fuer aktiven Spieler
  const dartboardPlayers = useMemo(() => {
    if (!activePlayerId || !targetNumber) return []
    return [{
      playerId: activePlayerId,
      name: activePlayer?.name ?? '',
      target: targetNumber,
      color: activePlayerColor ?? PLAYER_COLORS[0],
      isActive: true,
    }]
  }, [activePlayerId, activePlayer, targetNumber, activePlayerColor])

  if (!storedMatch || !state.match) {
    return (
      <div style={{ background: c.bg, minHeight: '100dvh', color: c.textBright, padding: 20 }}>
        <p>Match nicht gefunden.</p>
        <button onClick={onExit} style={{ color: c.textBright, background: '#333', border: 'none', padding: '8px 16px', borderRadius: 6, cursor: 'pointer' }}>
          Zurueck
        </button>
      </div>
    )
  }

  return (
    <div
      style={{
        background: playerColorBgEnabled && activePlayerColor
          ? `linear-gradient(180deg, ${activePlayerColor}20 0%, ${activePlayerColor}05 100%)`
          : c.bg,
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        color: c.textBright,
        fontFamily: 'system-ui, -apple-system, sans-serif',
        transition: 'background 0.5s ease',
      }}
    >
      {/* Pause Overlay */}
      {gamePaused && <PauseOverlay onResume={() => setGamePaused(false)} />}

      {/* Shanghai Flash Overlay */}
      {showShanghaiFlash && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
            background: 'rgba(0, 0, 0, 0.75)',
            animation: 'shanghaiFlashIn 0.3s ease-out',
          }}
        >
          <div
            style={{
              fontSize: 80,
              fontWeight: 900,
              color: '#eab308',
              textShadow: '0 0 40px #eab308, 0 0 80px #f97316, 0 0 120px #ef4444',
              textTransform: 'uppercase',
              letterSpacing: 8,
              animation: 'shanghaiPulse 0.5s ease-in-out infinite alternate',
            }}
          >
            SHANGHAI!
          </div>
        </div>
      )}

      {/* CSS Animationen fuer Shanghai Flash */}
      <style>{`
        @keyframes shanghaiFlashIn {
          from { opacity: 0; transform: scale(0.5); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes shanghaiPulse {
          from { transform: scale(1); text-shadow: 0 0 40px #eab308, 0 0 80px #f97316, 0 0 120px #ef4444; }
          to { transform: scale(1.1); text-shadow: 0 0 60px #eab308, 0 0 100px #f97316, 0 0 160px #ef4444; }
        }
      `}</style>

      {/* Header mit Pause/Mute/Exit */}
      <GameControls
        isPaused={gamePaused}
        onTogglePause={() => setGamePaused(p => !p)}
        isMuted={muted}
        onToggleMute={() => setMuted(m => !m)}
        onExit={() => {
          // Pause-Status und verstrichene Zeit speichern bevor wir verlassen
          setMatchPaused(matchId, 'shanghai', true)
          setMatchElapsedTime(matchId, 'shanghai', elapsedMs)
          onExit()
        }}
        onCancel={() => {
          deleteShanghaiMatch(matchId)
          onExit()
        }}
        title={`Shanghai${multiplayer?.enabled && multiplayer.roomCode ? ` · ${multiplayer.roomCode}` : ''}`}
      />

      {/* Info-Leiste (hidden on mobile — info shown in mobile round bar) */}
      <div
        style={{
          display: isMobile ? 'none' : 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          gap: 12,
          padding: '6px 20px',
          borderBottom: '1px solid #222',
          background: c.cardBg,
          fontSize: 12,
          flexWrap: 'wrap',
        }}
      >
        {/* Runde X von 20 */}
        <span style={{
          background: isArcade ? '#1e293b' : colors.bgMuted,
          padding: '3px 8px',
          borderRadius: 4,
          color: c.accent,
          fontWeight: 600,
        }}>
          Runde {currentRound} von 20
        </span>

        {/* Fortschrittsbalken */}
        <div style={{
          flex: '0 1 150px',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}>
          <div style={{
            flex: 1,
            height: 4,
            background: colors.bgMuted,
            borderRadius: 2,
            overflow: 'hidden'
          }}>
            <div
              style={{
                height: '100%',
                width: `${(currentRound / 20) * 100}%`,
                background: c.ledOn,
                transition: 'width 0.3s',
                borderRadius: 2,
              }}
            />
          </div>
          <span style={{ fontSize: 10, color: c.textDim, minWidth: 22, textAlign: 'right' }}>
            {Math.round((currentRound / 20) * 100)}%
          </span>
        </div>

        {/* Trenner */}
        <span style={{ color: c.textDim }}>|</span>

        {/* Leg/Set Score */}
        {state.match.structure.kind === 'legs' && state.match.structure.bestOfLegs > 1 && (
          <span style={{ color: c.ledOn, fontWeight: 700 }}>
            Legs: {state.match.players.map(p => state.totalLegWinsByPlayer[p.playerId] || 0).join(' : ')}
          </span>
        )}
        {state.match.structure.kind === 'sets' && (
          <span style={{ color: c.ledOn, fontWeight: 700 }}>
            Sets: {state.match.players.map(p => state.setWinsByPlayer[p.playerId] || 0).join(' : ')}
            <span style={{ marginLeft: 6, color: c.textDim, fontSize: 11 }}>
              (L: {state.match.players.map(p => state.legWinsByPlayer[p.playerId] || 0).join(':')})
            </span>
          </span>
        )}

        {/* Timer */}
        <div
          style={{
            fontFamily: 'monospace',
            fontSize: 16,
            fontWeight: 700,
            color: c.ledOn,
            textShadow: `0 0 10px ${c.ledGlow}`,
            marginLeft: 'auto',
          }}
        >
          {formatDuration(elapsedMs)}
        </div>
      </div>

      {/* Main Content — Mobile */}
      {isMobile ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '0 8px 8px' }}>
          {/* Header: Runde + Spieler + Timer */}
          {activePlayer && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 10px', marginBottom: 4 }}>
              <div style={{ fontSize: 11, color: isArcade ? c.textDim : colors.fgMuted }}>Runde {currentRound}/20</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: activePlayerColor ?? (isArcade ? c.textBright : colors.fg) }}>
                {activePlayer.name}
                <span style={{ fontWeight: 500, color: isArcade ? c.yellow : '#b45309', marginLeft: 6 }}>
                  {shanghaiState.scoreByPlayer[activePlayerId!] ?? 0}
                </span>
              </div>
              <div style={{ fontFamily: 'monospace', fontSize: 11, color: isArcade ? c.ledOn : colors.fgMuted }}>{formatDuration(elapsedMs)}</div>
            </div>
          )}

          {/* Zielzahl + Mini-Dartscheibe */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 6 }}>
            {/* Mini Dartboard — highlights target segment */}
            <svg viewBox="0 0 200 200" style={{ width: 90, height: 90, flexShrink: 0 }}>
              {/* Board background */}
              <circle cx="100" cy="100" r="95" fill={isArcade ? '#1a1a1a' : '#e5e7eb'} />
              {/* Segments */}
              {[20,1,18,4,13,6,10,15,2,17,3,19,7,16,8,11,14,9,12,5].map((num, i) => {
                const angle = (i * 18 - 99) * Math.PI / 180
                const angle2 = ((i + 1) * 18 - 99) * Math.PI / 180
                const isTarget = num === targetNumber
                const r1 = 30, r2 = 90
                const d = `M${100+r1*Math.cos(angle)},${100+r1*Math.sin(angle)} L${100+r2*Math.cos(angle)},${100+r2*Math.sin(angle)} A${r2},${r2} 0 0,1 ${100+r2*Math.cos(angle2)},${100+r2*Math.sin(angle2)} L${100+r1*Math.cos(angle2)},${100+r1*Math.sin(angle2)} A${r1},${r1} 0 0,0 ${100+r1*Math.cos(angle)},${100+r1*Math.sin(angle)} Z`
                const baseColor = i % 2 === 0
                  ? (isArcade ? '#222' : '#d1d5db')
                  : (isArcade ? '#333' : '#f3f4f6')
                return (
                  <path key={num} d={d}
                    fill={isTarget ? '#22c55e' : baseColor}
                    stroke={isArcade ? '#444' : '#9ca3af'} strokeWidth="0.5"
                    opacity={isTarget ? 1 : 0.5}
                  />
                )
              })}
              {/* Bull */}
              <circle cx="100" cy="100" r="12" fill={isArcade ? '#333' : '#d1d5db'} stroke={isArcade ? '#444' : '#9ca3af'} strokeWidth="0.5" />
              {/* Number labels */}
              {[20,1,18,4,13,6,10,15,2,17,3,19,7,16,8,11,14,9,12,5].map((num, i) => {
                const angle = (i * 18 - 90) * Math.PI / 180
                const r = 82
                const isTarget = num === targetNumber
                return (
                  <text key={num} x={100 + r * Math.cos(angle)} y={100 + r * Math.sin(angle) + 3}
                    textAnchor="middle" fontSize={isTarget ? 9 : 7} fontWeight={isTarget ? 900 : 400}
                    fill={isTarget ? '#fff' : (isArcade ? '#888' : '#6b7280')}
                  >{num}</text>
                )
              })}
            </svg>
            {/* Große Zielzahl */}
            <div style={{
              fontSize: 88, fontWeight: 900, lineHeight: 1,
              color: isArcade ? c.ledOn : colors.accent,
              textShadow: isArcade ? `0 0 30px ${c.ledGlow}` : '0 2px 8px rgba(0,0,0,0.1)',
            }}>
              {targetNumber}
            </div>
          </div>

          {/* Dart Slots */}
          <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginBottom: 6 }}>
            {[0, 1, 2].map(i => {
              const dart = current[i]
              return (
                <div key={i} style={{
                  flex: 1, maxWidth: 80, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: dart ? (isArcade ? '#1c1c1c' : colors.bgCard) : (isArcade ? '#0a0a0a' : colors.bgMuted),
                  border: dart ? `2px solid ${isArcade ? c.ledOn : colors.accent}` : `1px solid ${isArcade ? '#333' : colors.border}`,
                  borderRadius: 6, fontWeight: 700, fontSize: 12,
                  color: dart ? (isArcade ? c.ledOn : colors.fg) : (isArcade ? c.textDim : colors.fgMuted),
                }}>
                  {dart ? formatDart(dart) : '\u2014'}
                </div>
              )
            })}
            {current.length > 0 && (
              <div style={{ height: 30, display: 'flex', alignItems: 'center', paddingLeft: 4, fontSize: 13, fontWeight: 700, color: isArcade ? c.yellow : '#b45309' }}>
                = {current.reduce((sum, d) => sum + (d.target === 'MISS' ? 0 : d.target * d.mult), 0)}
              </div>
            )}
          </div>

          {/* Buttons */}
          {(() => {
            const dis = current.length >= 3
            const sCol = '#0ea5e9', dCol = '#22c55e', tCol = '#ef4444'
            const btnH = 48
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {/* Row 1: Single / Double / Triple */}
                <div style={{ display: 'flex', gap: 5 }}>
                  <button onClick={() => { multRef.current = 1; setMult(1); addDart(targetNumber as any) }} disabled={dis}
                    style={{ flex: 1, height: btnH, borderRadius: 8, border: `2px solid ${sCol}`, background: isArcade ? '#1e3a5f' : '#dbeafe', color: isArcade ? sCol : '#1d4ed8', fontWeight: 800, fontSize: 15, cursor: dis ? 'not-allowed' : 'pointer', opacity: dis ? 0.4 : 1 }}>
                    Single
                  </button>
                  <button onClick={() => { multRef.current = 2; setMult(2); addDart(targetNumber as any) }} disabled={dis}
                    style={{ flex: 1, height: btnH, borderRadius: 8, border: `2px solid ${dCol}`, background: isArcade ? '#14532d' : '#dcfce7', color: isArcade ? dCol : '#15803d', fontWeight: 800, fontSize: 15, cursor: dis ? 'not-allowed' : 'pointer', opacity: dis ? 0.4 : 1 }}>
                    Double
                  </button>
                  <button onClick={() => { multRef.current = 3; setMult(3); addDart(targetNumber as any) }} disabled={dis}
                    style={{ flex: 1, height: btnH, borderRadius: 8, border: `2px solid ${tCol}`, background: isArcade ? '#7f1d1d' : '#fee2e2', color: isArcade ? tCol : '#b91c1c', fontWeight: 800, fontSize: 15, cursor: dis ? 'not-allowed' : 'pointer', opacity: dis ? 0.4 : 1 }}>
                    Triple
                  </button>
                </div>
                {/* Row 2: Undo / Dart zurück / Miss / OK */}
                <div style={{ display: 'flex', gap: 5 }}>
                  <button onClick={undoLastTurn} disabled={!canUndo}
                    style={{ flex: 1, height: 38, borderRadius: 6, border: `1.5px solid ${isArcade ? '#555' : colors.border}`, background: isArcade ? '#222' : colors.bgCard, color: canUndo ? (isArcade ? c.textBright : colors.fg) : (isArcade ? c.textDim : colors.fgMuted), fontWeight: 700, fontSize: 12, cursor: canUndo ? 'pointer' : 'not-allowed', opacity: canUndo ? 1 : 0.3 }}>
                    ↩ Undo
                  </button>
                  <button onClick={() => setCurrent(prev => prev.slice(0, -1))} disabled={current.length === 0}
                    style={{ flex: 1, height: 38, borderRadius: 6, border: `1.5px solid ${isArcade ? '#444' : colors.border}`, background: isArcade ? '#222' : colors.bgCard, color: current.length > 0 ? (isArcade ? c.textBright : colors.fg) : (isArcade ? c.textDim : colors.fgMuted), fontWeight: 700, fontSize: 12, cursor: current.length > 0 ? 'pointer' : 'not-allowed', opacity: current.length > 0 ? 1 : 0.3 }}>
                    ← Dart
                  </button>
                  <button onClick={addMiss} disabled={dis}
                    style={{ flex: 1.5, height: 38, borderRadius: 6, border: `1.5px solid ${isArcade ? '#666' : '#dc262680'}`, background: isArcade ? '#2a1a1a' : '#fef2f2', color: isArcade ? c.red : '#dc2626', fontWeight: 800, fontSize: 14, cursor: dis ? 'not-allowed' : 'pointer', opacity: dis ? 0.4 : 1 }}>
                    ✕ Miss
                  </button>
                  <button onClick={confirmTurn} disabled={current.length === 0}
                    style={{ flex: 1.5, height: 38, borderRadius: 6, border: 'none', background: current.length > 0 ? 'linear-gradient(180deg, #22c55e, #16a34a)' : (isArcade ? '#1a1a1a' : colors.bgMuted), color: current.length > 0 ? '#fff' : (isArcade ? c.textDim : colors.fgMuted), fontWeight: 800, fontSize: 14, cursor: current.length > 0 ? 'pointer' : 'not-allowed' }}>
                    ✓ OK
                  </button>
                </div>
              </div>
            )
          })()}

          {/* Player scores — compact horizontal */}
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 4,
              padding: '6px',
              background: isArcade ? c.cardBg : colors.bgCard,
              borderRadius: 10,
              border: `1px solid ${isArcade ? '#222' : colors.border}`,
            }}
          >
            {players.map((p, index) => {
              const isActive = p.playerId === activePlayerId
              const color = playerColors[p.playerId] ?? PLAYER_COLORS[index % PLAYER_COLORS.length]
              const totalScore = shanghaiState.scoreByPlayer[p.playerId] ?? 0
              const hasThrownThisRound = shanghaiState.playersCompletedThisRound.includes(p.playerId)
              const roundTurn = shanghaiState.currentRoundTurns[p.playerId]
              const roundScore = roundTurn?.score ?? 0

              return (
                <div
                  key={p.playerId}
                  style={{
                    flex: '1 1 calc(50% - 4px)',
                    minWidth: 100,
                    padding: '4px 6px',
                    borderRadius: 6,
                    background: isActive ? (isArcade ? '#1a1a1a' : `${color}10`) : 'transparent',
                    borderLeft: `3px solid ${color}`,
                    boxShadow: isActive ? `0 0 8px ${color}30` : 'none',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: isActive ? 700 : 500, fontSize: 12, color: isActive ? color : (isArcade ? c.textBright : colors.fg) }}>
                      {p.name}
                    </span>
                    <span style={{ fontSize: 15, color: isArcade ? c.yellow : '#b45309', fontWeight: 800 }}>
                      {totalScore}
                    </span>
                  </div>
                  {hasThrownThisRound && (
                    <div style={{ fontSize: 10, color: roundScore > 0 ? (isArcade ? c.green : '#16a34a') : (isArcade ? c.red : '#dc2626') }}>
                      +{roundScore}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ) : (
      /* Main Content — Desktop (unchanged) */
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 50,
          padding: 20,
        }}
      >
        {/* Dartboard */}
        <div style={{ position: 'relative' }}>
          <ATBDartboard
            currentTarget={targetNumber}
            players={dartboardPlayers}
            size={420}
            activePlayerColor={activePlayerColor}
          />

          {/* Aktuelles Ziel gross unter der Dartscheibe */}
          {activePlayer && (
            <div
              style={{
                position: 'absolute',
                bottom: -70,
                left: '50%',
                transform: 'translateX(-50%)',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: 13, color: c.textDim, marginBottom: 4 }}>
                Runde {currentRound} {'\u00b7'} Feld {targetNumber} - {activePlayer.name} wirft
              </div>
              <div
                style={{
                  fontSize: 56,
                  fontWeight: 700,
                  color: c.ledOn,
                  textShadow: `0 0 25px ${c.ledGlow}`,
                }}
              >
                {targetNumber}
              </div>
              {/* Punkte in dieser Runde */}
              {Object.keys(shanghaiState.currentRoundTurns).length > 0 && (
                <div style={{ fontSize: 12, color: c.textDim, marginTop: 8 }}>
                  {Object.entries(shanghaiState.currentRoundTurns).map(([pid, turn]) => {
                    const player = players.find(p => p.playerId === pid)
                    return (
                      <span key={pid} style={{ marginRight: 8 }}>
                        {player?.name}: {turn.score} Pkt
                      </span>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Rechte Seite: Controls + Spieler */}
        <div style={{ minWidth: 300 }}>
          {/* Multiplier-Anzeige */}
          <div
            style={{
              background: c.cardBg,
              borderRadius: 12,
              padding: '14px 18px',
              marginBottom: 16,
              border: '1px solid #222',
            }}
          >
            <div style={{ fontSize: 11, color: c.textDim, marginBottom: 10, textAlign: 'center' }}>MULTIPLIER</div>
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12 }}>
              {([1, 2, 3] as const).map(m => (
                <div
                  key={m}
                  onClick={() => setMult(m)}
                  style={{
                    width: 70,
                    height: 44,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: 8,
                    fontWeight: 700,
                    fontSize: 16,
                    cursor: 'pointer',
                    background: mult === m ? (m === 1 ? '#1e3a5f' : m === 2 ? '#14532d' : '#7f1d1d') : '#1a1a1a',
                    color: mult === m ? (m === 1 ? '#0ea5e9' : m === 2 ? '#22c55e' : '#ef4444') : c.textDim,
                    border: mult === m ? `2px solid ${m === 1 ? '#0ea5e9' : m === 2 ? '#22c55e' : '#ef4444'}` : '1px solid #333',
                    boxShadow: mult === m ? `0 0 15px ${m === 1 ? '#0ea5e9' : m === 2 ? '#22c55e' : '#ef4444'}50` : 'none',
                    transition: 'all 0.15s',
                  }}
                >
                  {m === 1 ? 'Single' : m === 2 ? 'Double' : 'Triple'}
                </div>
              ))}
              {/* Undo Button - macht letzten kompletten Zug rueckgaengig */}
              <button
                onClick={undoLastTurn}
                disabled={!canUndo}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: '50%',
                  border: canUndo ? '1px solid #666' : '1px solid #333',
                  background: canUndo ? '#2a2a2a' : '#1a1a1a',
                  color: canUndo ? c.textBright : c.textDim,
                  cursor: canUndo ? 'pointer' : 'not-allowed',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 18,
                  marginLeft: 4,
                  opacity: canUndo ? 1 : 0.4,
                  transition: 'all 0.15s',
                }}
                title="Letzten Zug rueckgaengig"
              >
                {'\u21B6'}
              </button>
            </div>

            {/* Nummernpad - Dart-Eingabe (kein Bull bei Shanghai) */}
            <div style={{ marginTop: 14 }}>
              {NUMBER_PAD.map((row, rowIdx) => (
                <div key={rowIdx} style={{ display: 'flex', gap: 4, justifyContent: 'center', marginBottom: 4 }}>
                  {row.map(num => {
                    const isCurrentTarget = targetNumber === num
                    return (
                      <button
                        key={num}
                        onClick={() => addDart(num)}
                        disabled={current.length >= 3}
                        style={{
                          width: 48,
                          height: 36,
                          borderRadius: 6,
                          border: isCurrentTarget ? `2px solid ${c.ledOn}` : '1px solid #333',
                          background: isCurrentTarget ? '#1a2a3a' : '#1a1a1a',
                          color: isCurrentTarget ? c.ledOn : c.textBright,
                          fontWeight: isCurrentTarget ? 800 : 600,
                          fontSize: 14,
                          cursor: current.length >= 3 ? 'not-allowed' : 'pointer',
                          opacity: current.length >= 3 ? 0.5 : 1,
                          boxShadow: isCurrentTarget ? `0 0 10px ${c.ledGlow}` : 'none',
                          transition: 'all 0.15s',
                        }}
                      >
                        {num}
                      </button>
                    )
                  })}
                </div>
              ))}
              {/* Nur Miss Zeile (kein Bull bei Shanghai) */}
              <div style={{ display: 'flex', gap: 4, justifyContent: 'center', marginTop: 4 }}>
                <button
                  onClick={addMiss}
                  disabled={current.length >= 3}
                  style={{
                    width: 200,
                    height: 36,
                    borderRadius: 6,
                    border: '1px solid #333',
                    background: '#1a1a1a',
                    color: c.red,
                    fontWeight: 700,
                    fontSize: 14,
                    cursor: current.length >= 3 ? 'not-allowed' : 'pointer',
                    opacity: current.length >= 3 ? 0.5 : 1,
                    transition: 'all 0.15s',
                  }}
                >
                  Miss
                </button>
              </div>
            </div>

            {/* Aktuelle Wuerfe */}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 14 }}>
              {[0, 1, 2].map(i => {
                const dart = current[i]
                return (
                  <div
                    key={i}
                    style={{
                      width: 70,
                      height: 36,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: dart ? '#1c1c1c' : '#0a0a0a',
                      border: dart ? `2px solid ${c.ledOn}` : '1px solid #333',
                      borderRadius: 6,
                      fontWeight: 700,
                      fontSize: 13,
                      color: dart ? c.ledOn : c.textDim,
                    }}
                  >
                    {dart ? formatDart(dart) : '\u2014'}
                  </div>
                )
              })}
            </div>

            {/* Bestaetigen + Rueckgaengig Buttons */}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 10 }}>
              <button
                onClick={() => setCurrent(prev => prev.slice(0, -1))}
                disabled={current.length === 0}
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  borderRadius: 6,
                  border: '1px solid #333',
                  background: '#1a1a1a',
                  color: current.length > 0 ? c.textBright : c.textDim,
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: current.length > 0 ? 'pointer' : 'not-allowed',
                  opacity: current.length > 0 ? 1 : 0.4,
                }}
              >
                Dart entfernen
              </button>
              <button
                onClick={confirmTurn}
                disabled={current.length === 0}
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  borderRadius: 6,
                  border: 'none',
                  background: current.length > 0
                    ? 'linear-gradient(180deg, #22c55e, #16a34a)'
                    : '#1a1a1a',
                  color: current.length > 0 ? '#fff' : c.textDim,
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: current.length > 0 ? 'pointer' : 'not-allowed',
                  boxShadow: current.length > 0 ? '0 2px 10px rgba(34, 197, 94, 0.3)' : 'none',
                }}
              >
                Bestaetigen
              </button>
            </div>

            <div style={{ fontSize: 11, color: c.textDim, marginTop: 12, textAlign: 'center' }}>
              [Space] Treffer  [D+Space] Double  [T+Space] Triple  [1-20] Feld  [0] Miss  [Enter] OK
            </div>
          </div>

          {/* Spieler-Liste */}
          <div
            style={{
              background: c.cardBg,
              borderRadius: 12,
              padding: 16,
              border: '1px solid #222',
            }}
          >
            <div style={{ fontSize: 11, color: c.textDim, marginBottom: 12 }}>SPIELER</div>
            <div style={{ display: 'grid', gap: 10 }}>
              {players.map((p, index) => {
                const isActive = p.playerId === activePlayerId
                const darts = state.dartsUsedByPlayer[p.playerId] ?? 0
                const color = playerColors[p.playerId] ?? PLAYER_COLORS[index % PLAYER_COLORS.length]

                // Shanghai: Gesamtpunkte und Rundenpunkte
                const totalScore = shanghaiState.scoreByPlayer[p.playerId] ?? 0
                const hasThrownThisRound = shanghaiState.playersCompletedThisRound.includes(p.playerId)
                const roundTurn = shanghaiState.currentRoundTurns[p.playerId]
                const roundScore = roundTurn?.score ?? 0

                return (
                  <div
                    key={p.playerId}
                    style={{
                      padding: '10px 12px',
                      borderRadius: 8,
                      background: isActive ? '#1a1a1a' : 'transparent',
                      borderLeft: `4px solid ${color}`,
                      boxShadow: isActive ? `0 0 20px ${color}30` : 'none',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div
                          style={{
                            width: 10,
                            height: 10,
                            borderRadius: '50%',
                            background: color,
                            boxShadow: isActive ? `0 0 10px ${color}` : 'none',
                          }}
                        />
                        <span style={{ fontWeight: isActive ? 700 : 500, color: isActive ? color : c.textBright }}>
                          {p.name}
                        </span>
                      </div>
                      <span style={{ fontSize: 22, color: c.yellow, fontWeight: 800 }}>
                        {totalScore}
                      </span>
                    </div>

                    {/* Shanghai: Rundeninfo und Status */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: c.textDim }}>
                      <span>
                        {darts} Darts
                        {hasThrownThisRound && roundScore > 0 && (
                          <span style={{ color: c.green, marginLeft: 6 }}>
                            +{roundScore} (Runde {currentRound})
                          </span>
                        )}
                        {hasThrownThisRound && roundScore === 0 && (
                          <span style={{ color: c.red, marginLeft: 6 }}>
                            +0 (Runde {currentRound})
                          </span>
                        )}
                      </span>
                      <span style={{ color: hasThrownThisRound ? c.green : color }}>
                        {hasThrownThisRound ? 'Geworfen' : isActive ? 'Am Wurf' : 'Wartet...'}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
      )}

      {/* Trefferwerte-Diagramm (hidden on mobile) */}
      {!isMobile && currentRound > 1 && (
        <div style={{ padding: '0 20px 16px' }}>
          <ShanghaiHitChart
            events={events}
            players={players.map((p, idx) => ({
              playerId: p.playerId,
              name: p.name,
              color: playerColors[p.playerId] ?? PLAYER_COLORS[idx % PLAYER_COLORS.length],
            }))}
            currentRound={currentRound}
          />
        </div>
      )}

      {/* Speichern-Indikator */}
      {saving && (
        <div style={{ fontSize: 13, color: c.textDim, padding: '8px 0', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <span style={{ display: 'inline-block', width: 14, height: 14, border: '2px solid currentColor', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          Speichern...
        </div>
      )}

      {/* Leg-Zusammenfassung (Intermission) */}
      {intermission && (
        <ShanghaiLegIntermissionModal
          intermission={intermission}
          match={state.match}
          events={events}
          playerColors={state.match.players.map((p: any) => playerColors[p.playerId] ?? PLAYER_COLORS[0])}
          onContinue={() => {
            // Naechstes Leg starten
            const newEvents = [...events, ...intermission.pendingNextEvents]
            persistShanghaiEvents(matchId, newEvents)
            setEvents(newEvents)
            setIntermission(null)
            if (multiplayer?.enabled) multiplayer.submitEvents(intermission.pendingNextEvents)
          }}
        />
      )}
    </div>
  )
}

// ===== Leg-Zusammenfassung Modal =====

function ShanghaiLegIntermissionModal({
  intermission,
  match,
  events,
  playerColors,
  onContinue,
}: {
  intermission: ShanghaiIntermission
  match: any
  events: ShanghaiEvent[]
  playerColors: string[]
  onContinue: () => void
}) {
  // Enter-Taste zum Weitergehen
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Enter') onContinue()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onContinue])

  // Leg-Score berechnen (kumulativ bis zu diesem Leg)
  const legWins: Record<string, number> = {}
  match.players.forEach((p: any) => { legWins[p.playerId] = 0 })

  for (const ev of events) {
    if (ev.type === 'ShanghaiLegFinished') {
      const wid = (ev as any).winnerId
      if (wid && wid in legWins) legWins[wid]++
    }
  }
  const legScore = match.players.map((p: any) => legWins[p.playerId]).join(' : ')

  // Spieler-Rangliste fuer dieses Leg (nach Gesamtpunkten)
  const rankings = match.players.map((p: any, idx: number) => ({
    name: p.name,
    playerId: p.playerId,
    score: intermission.finalScores[p.playerId] ?? 0,
    color: playerColors[idx % playerColors.length],
  }))
  rankings.sort((a: any, b: any) => b.score - a.score)

  const isDraw = intermission.winnerId === null

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.85)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: 20,
      }}
    >
      <div
        style={{
          background: '#111',
          borderRadius: 16,
          padding: 24,
          maxWidth: 500,
          width: '100%',
          maxHeight: '90vh',
          overflowY: 'auto',
          border: '1px solid #333',
        }}
      >
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div style={{ fontSize: 14, color: '#6b7280', marginBottom: 4 }}>
            Leg {intermission.legIndex} beendet
          </div>
          <div style={{
            fontSize: 32,
            fontWeight: 800,
            color: isDraw ? '#f97316' : '#22c55e',
            marginBottom: 8,
          }}>
            {isDraw ? 'Unentschieden!' : `${intermission.winnerName} gewinnt!`}
          </div>
          {intermission.shanghaiWin && (
            <div style={{
              fontSize: 20,
              fontWeight: 800,
              color: '#eab308',
              textShadow: '0 0 15px #eab308',
              marginBottom: 8,
            }}>
              SHANGHAI!
            </div>
          )}
        </div>

        {/* Leg-Score (nur bei Best-of > 1) */}
        {match.structure.kind === 'legs' && match.structure.bestOfLegs > 1 && (
          <div
            style={{
              background: '#1a1a1a',
              borderRadius: 12,
              padding: '12px 20px',
              marginBottom: 16,
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>Spielstand</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: '#e5e7eb' }}>{legScore}</div>
          </div>
        )}
        {match.structure.kind === 'sets' && (
          <div
            style={{
              background: '#1a1a1a',
              borderRadius: 12,
              padding: '12px 20px',
              marginBottom: 16,
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>Spielstand</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: '#e5e7eb' }}>{legScore}</div>
          </div>
        )}

        {/* Rangliste */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#9ca3af', marginBottom: 12 }}>
            Leg-Ergebnis
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '8px 0', borderBottom: '1px solid #333', color: '#6b7280' }}>Platz</th>
                <th style={{ textAlign: 'left', padding: '8px 0', borderBottom: '1px solid #333', color: '#6b7280' }}>Spieler</th>
                <th style={{ textAlign: 'right', padding: '8px 0', borderBottom: '1px solid #333', color: '#6b7280' }}>Punkte</th>
              </tr>
            </thead>
            <tbody>
              {rankings.map((r: any, idx: number) => (
                <tr key={r.playerId}>
                  <td style={{ padding: '6px 0', fontWeight: 700, color: idx === 0 && !isDraw ? '#22c55e' : '#9ca3af' }}>
                    {idx + 1}.
                  </td>
                  <td style={{ padding: '6px 0', fontWeight: 600, color: r.color }}>
                    {r.name}
                  </td>
                  <td style={{ textAlign: 'right', padding: '6px 0', fontWeight: 700, color: '#eab308' }}>
                    {r.score}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Weiter-Button */}
        <button
          onClick={onContinue}
          style={{
            width: '100%',
            padding: '14px 20px',
            fontSize: 16,
            fontWeight: 700,
            background: 'linear-gradient(180deg, #f97316, #ea580c)',
            color: '#fff',
            border: 'none',
            borderRadius: 10,
            cursor: 'pointer',
            boxShadow: '0 4px 15px rgba(249, 115, 22, 0.4)',
          }}
        >
          Weiter zum naechsten Leg
        </button>
      </div>
    </div>
  )
}
