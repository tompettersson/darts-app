// src/screens/GameCTF.tsx
// Live-Spielscreen fuer Capture the Field (CTF)
// Alle Spieler werfen 3 Darts auf das gleiche Feld, hoechster Score erobert es.
// Tastatursteuerung: S/D/T=Multiplier, 1-9/0=Zahlen, Space/Enter=Bestaetigen, Backspace=Undo

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useGameState, useGameColors } from '../hooks/useGameState'
import {
  getCTFMatchById,
  persistCTFEvents,
  finishCTFMatch,
  setMatchPaused,
  setMatchElapsedTime,
  deleteCTFMatch,
  getPlayerColorBackgroundEnabled,
  getProfiles,
} from '../storage'
import {
  applyCTFEvents,
  recordCTFTurn,
  isCaptureRoundComplete,
  getActivePlayerId,
  getCurrentTarget,
  getSequenceLength,
  calculateCaptureScore,
  formatDuration,
  formatTarget,
  formatDart,
  type CTFEvent,
  type CTFDart,
  type CTFTurnResult,
} from '../dartsCaptureTheField'
import ATBDartboard from '../components/ATBDartboard'
import GameControls, { PauseOverlay } from '../components/GameControls'
import {
  announceGameStart,
  announceATBHit,
  playTriple20Sound,
  announceCTFPlayerTurn,
  announceCTFNewRound,
  announceCTFPlayerScore,
  announceCTFRoundResult,
  announceCTFLastRounds,
  announceCTFWinner,
  announceCTFMatchEndRankings,
  cancelDebouncedAnnounce,
  debouncedAnnounce,
} from '../speech'
import ATBCaptureScoreChart from '../components/ATBCaptureScoreChart'

// Intermission-Typ fuer Leg-Zusammenfassung
type CTFIntermission = {
  kind: 'leg'
  legId: string
  legIndex: number
  winnerId: string
  winnerName: string
  winnerDarts: number
  pendingNextEvents: CTFEvent[]
}

// Spielerfarben (hell & leuchtend)
const PLAYER_COLORS = [
  '#3b82f6', // Blau (500)
  '#22c55e', // Gruen (500)
  '#f97316', // Orange (500)
  '#ef4444', // Rot (500)
  '#a855f7', // Violett (500)
  '#14b8a6', // Tuerkis (500)
  '#eab308', // Gelb (500)
  '#ec4899', // Pink (500)
]

// Nummernpad-Layout fuer Dartfeld-Eingabe
const NUMBER_PAD = [
  [1, 2, 3, 4, 5],
  [6, 7, 8, 9, 10],
  [11, 12, 13, 14, 15],
  [16, 17, 18, 19, 20],
] as const

type Props = {
  matchId: string
  onExit: () => void
  onShowSummary: (matchId: string) => void
}

export default function GameCTF({ matchId, onExit, onShowSummary }: Props) {
  // Theme-aware Farben
  const { c, isArcade, colors } = useGameColors()

  const storedMatch = getCTFMatchById(matchId)
  const [events, setEvents] = useState<CTFEvent[]>(storedMatch?.events ?? [])
  const [current, setCurrent] = useState<CTFDart[]>([])
  const [mult, setMult] = useState<1 | 2 | 3>(1)
  const multRef = useRef(mult)

  // State aus Events ableiten (muss vor useGameState stehen, da finished davon abhaengt)
  const state = useMemo(() => applyCTFEvents(events), [events])

  // Shared game state: Pause, Mute, Timer, Visibility
  const { gamePaused, setGamePaused, muted, setMuted, elapsedMs, setElapsedMs } = useGameState({
    matchId, mode: 'ctf', finished: state.finished,
  })

  // Nummern-Buffer fuer zweistellige Eingabe (10-20)
  const numBufferRef = useRef('')
  const numTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Speech-Timer-IDs fuer Cleanup bei Undo
  const speechTimersRef = useRef<ReturnType<typeof setTimeout>[]>([])
  const scheduleSpeech = (fn: () => void, delay: number) => {
    const id = setTimeout(fn, delay)
    speechTimersRef.current.push(id)
    return id
  }
  const clearSpeechTimers = () => {
    speechTimersRef.current.forEach(id => clearTimeout(id))
    speechTimersRef.current = []
  }

  // Fuer Sprachansagen: letztes angesagtes Ziel/Spieler merken
  const lastAnnouncedTargetRef = useRef<number | 'BULL' | null>(null)
  const lastAnnouncedPlayerRef = useRef<string | null>(null)
  const gameOnAnnouncedRef = useRef(false)

  // Leg-Zusammenfassung (Intermission zwischen Legs)
  const [intermission, setIntermission] = useState<CTFIntermission | null>(null)

  const players = state.match?.players ?? []
  const config = state.match?.config
  const sequence = state.match?.sequence ?? []
  const seqLen = getSequenceLength(state)
  const captureState = state.captureState
  const currentFieldIndex = captureState.currentFieldIndex
  const currentTarget = getCurrentTarget(state)
  const activePlayerId = getActivePlayerId(state)
  const activePlayer = players.find(p => p.playerId === activePlayerId)

  // "[Name], throw first! Game on!" + erstes Ziel ansagen
  useEffect(() => {
    if (!gameOnAnnouncedRef.current && state.match && activePlayerId && activePlayer) {
      gameOnAnnouncedRef.current = true

      announceGameStart(activePlayer.name)

      // Erstes Ziel direkt nach Game-On ansagen (mit Verzoegerung)
      const firstTarget = currentTarget?.number
      if (firstTarget) {
        lastAnnouncedPlayerRef.current = activePlayerId
        lastAnnouncedTargetRef.current = firstTarget
        scheduleSpeech(() => {
          announceCTFNewRound(activePlayer.name, firstTarget, 1)
        }, 1200)
      }
    }
  }, [state.match, activePlayerId, activePlayer, currentTarget])

  // Sync mult with ref
  useEffect(() => {
    multRef.current = mult
  }, [mult])

  // Spieler-Wechsel ansagen (bei Multiplayer, innerhalb einer Runde)
  useEffect(() => {
    if (!activePlayerId || !activePlayer) return
    if (state.finished) return
    if (!gameOnAnnouncedRef.current) return

    // Nur ansagen wenn sich der Spieler geaendert hat
    if (lastAnnouncedPlayerRef.current !== activePlayerId) {
      lastAnnouncedPlayerRef.current = activePlayerId

      // Debounced fuer natuerlichen Fluss (verhindert Stacking bei schnellem Undo)
      debouncedAnnounce(() => {
        announceCTFPlayerTurn(activePlayer.name)
      })
    }
  }, [activePlayerId, activePlayer, state.finished])

  if (!storedMatch || !state.match) {
    return (
      <div style={{ background: c.bg, minHeight: '100vh', color: c.textBright, padding: 20 }}>
        <p>Match nicht gefunden.</p>
        <button onClick={onExit} style={{ color: c.textBright, background: '#333', border: 'none', padding: '8px 16px', borderRadius: 6, cursor: 'pointer' }}>
          Zurueck
        </button>
      </div>
    )
  }

  // Aktuelles Ziel-Nummer (fuer Dartboard-Highlighting)
  const currentTargetNumber = currentTarget?.number ?? null

  // Dart hinzufuegen (Treffer auf eine bestimmte Zahl)
  const addDart = useCallback((targetNumber: number | 'BULL') => {
    if (gamePaused) return
    if (!activePlayerId || !state.match) return
    if (current.length >= 3) return

    const currentMult = multRef.current
    const dart: CTFDart = { target: targetNumber, mult: currentMult }

    if (targetNumber === 20 && currentMult === 3) playTriple20Sound()

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
  }, [activePlayerId, current, state, gamePaused])

  // Miss hinzufuegen
  const addMiss = useCallback(() => {
    if (gamePaused) return
    const dart: CTFDart = { target: 'MISS', mult: 1 }
    setCurrent(prev => {
      if (prev.length >= 3) return prev
      return [...prev, dart]
    })
    setMult(1)
  }, [gamePaused])

  // Refs fuer addDart/addMiss (damit Timer-Callbacks immer die aktuelle Version nutzen)
  const addDartRef = useRef(addDart)
  const addMissRef = useRef(addMiss)
  useEffect(() => { addDartRef.current = addDart }, [addDart])
  useEffect(() => { addMissRef.current = addMiss }, [addMiss])

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

    const darts = [...current]
    while (darts.length < 3) {
      darts.push({ target: 'MISS', mult: 1 })
    }

    const result = recordCTFTurn(state, activePlayerId, darts)
    const newEvents: CTFEvent[] = [...events, result.turnEvent]

    // Score des Spielers nach seinem Wurf ansagen
    const captureScore = result.turnEvent.captureScore
    if (activePlayer) {
      announceCTFPlayerScore(activePlayer.name, captureScore)
    }

    // Runden-Event hinzufuegen falls vorhanden
    if (result.roundFinished) {
      newEvents.push(result.roundFinished)

      // Rundenergebnis ansagen
      const winnerPlayer = result.roundFinished.winnerId
        ? players.find(p => p.playerId === result.roundFinished!.winnerId)
        : null

      scheduleSpeech(() => {
        announceCTFRoundResult(winnerPlayer?.name ?? null, result.roundFinished!.fieldNumber)
      }, 800)

      // Nur bei den letzten 3 Runden die verbleibenden Runden ansagen
      const nextRoundIndex = result.roundFinished.fieldIndex + 1
      scheduleSpeech(() => {
        announceCTFLastRounds(nextRoundIndex, seqLen)
      }, 1600)

      // Wenn das Match noch nicht fertig ist: naechsten Spieler + Ziel ansagen
      if (!result.legFinished && !result.matchFinished) {
        const newState = applyCTFEvents(newEvents)
        const newFieldIndex = newState.captureState.currentFieldIndex
        const nextTarget = newState.match?.sequence[newFieldIndex]?.number
        const nextPlayerId = getActivePlayerId(newState)
        const nextPlayer = newState.match?.players.find(p => p.playerId === nextPlayerId)

        if (nextTarget && nextPlayer) {
          lastAnnouncedTargetRef.current = nextTarget
          lastAnnouncedPlayerRef.current = nextPlayer.playerId
          scheduleSpeech(() => {
            announceCTFNewRound(nextPlayer.name, nextTarget, newFieldIndex + 1)
          }, 2000)
        }
      }
    }

    // Leg beendet?
    if (result.legFinished) {
      newEvents.push(result.legFinished)

      // Leg-Sieger ansagen (Feldpunkte)
      const legWinner = players.find(p => p.playerId === result.legFinished!.winnerId)
      if (legWinner) {
        const newState = applyCTFEvents(newEvents)
        const fieldPts = newState.captureState.totalFieldPointsByPlayer[result.legFinished!.winnerId] ?? 0
        announceCTFWinner(legWinner.name, fieldPts)
      }

      // Set beendet?
      if (result.setFinished) {
        newEvents.push(result.setFinished)
      }

      // Match beendet?
      if (result.matchFinished) {
        newEvents.push(result.matchFinished)
        finishCTFMatch(matchId, result.matchFinished.winnerId, result.matchFinished.totalDarts, result.matchFinished.durationMs)

        // Endplatzierungen berechnen und ansagen (nach Feldpunkten)
        const finalState = applyCTFEvents(newEvents)

        const rankings = players.map(p => ({
          name: p.name,
          fields: finalState.captureState.totalFieldPointsByPlayer[p.playerId] ?? 0,
        }))
        rankings.sort((a, b) => b.fields - a.fields)

        announceCTFMatchEndRankings(rankings)

        persistCTFEvents(matchId, newEvents)
        setEvents(newEvents)
        setCurrent([])
        setMult(1)
        setTimeout(() => onShowSummary(matchId), 2500)
        return
      }

      // Leg fertig aber Match nicht - Intermission zeigen
      if (result.nextLegStart && legWinner) {
        persistCTFEvents(matchId, newEvents)
        setEvents(newEvents)
        setCurrent([])
        setMult(1)

        const legIndex = result.legFinished.winnerDarts > 0
          ? state.currentLegIndex
          : state.currentLegIndex

        setIntermission({
          kind: 'leg',
          legId: result.legFinished.legId,
          legIndex: state.currentLegIndex + 1,
          winnerId: result.legFinished.winnerId,
          winnerName: legWinner.name,
          winnerDarts: result.legFinished.winnerDarts,
          pendingNextEvents: [result.nextLegStart],
        })
        return
      }
    }

    persistCTFEvents(matchId, newEvents)
    setEvents(newEvents)
    setCurrent([])
    setMult(1)
  }, [activePlayerId, activePlayer, current, events, matchId, state, players, seqLen, onShowSummary])

  // Letzten Zug rueckgaengig machen
  const undoLastTurn = useCallback(() => {
    // Finde den letzten CTFTurnAdded Event
    let lastTurnIndex = -1
    for (let i = events.length - 1; i >= 0; i--) {
      if (events[i].type === 'CTFTurnAdded') {
        lastTurnIndex = i
        break
      }
    }

    if (lastTurnIndex === -1) return // Kein Turn zum Rueckgaengigmachen

    // Ausstehende Sprachansagen abbrechen
    clearSpeechTimers()
    cancelDebouncedAnnounce()

    // Entferne alle Events ab dem letzten Turn (inkl. eventueller RoundFinished/LegFinished etc.)
    const newEvents = events.slice(0, lastTurnIndex)
    persistCTFEvents(matchId, newEvents)
    setEvents(newEvents)
    setCurrent([])
    setMult(1)
  }, [events, matchId])

  // Pruefe ob Undo moeglich ist (mindestens ein Turn vorhanden)
  const canUndo = useMemo(() => {
    return events.some(e => e.type === 'CTFTurnAdded')
  }, [events])

  // Auto-Confirm bei 3 Darts
  useEffect(() => {
    if (current.length === 3) {
      confirmTurn()
    }
  }, [current.length, confirmTurn])

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

      // B = Bull
      if (k === 'b') {
        // Pending Buffer erst flushen
        if (numBufferRef.current) flushNumBuffer()
        addDart('BULL')
        e.preventDefault()
        return
      }

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
        if (currentTargetNumber) {
          addDart(currentTargetNumber)
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
  }, [addDart, addMiss, confirmTurn, onExit, gamePaused, currentTargetNumber, flushNumBuffer])

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
  const activePlayerIndex = state.match.players.findIndex(p => p.playerId === activePlayerId)
  const activePlayerColor = activePlayerIndex >= 0
    ? playerColors[state.match.players[activePlayerIndex].playerId] ?? PLAYER_COLORS[activePlayerIndex % PLAYER_COLORS.length]
    : undefined

  // Spielerfarben-Hintergrund Einstellung
  const playerColorBgEnabled = getPlayerColorBackgroundEnabled()

  // Feld-Besitzer fuer Dartboard (gewonnene Felder einfaerben)
  const fieldOwners = useMemo(() => {
    if (!captureState) return undefined

    const owners: Record<string, { playerId: string; color: string } | 'tie'> = {}
    const fieldWinners = captureState.fieldWinners

    for (const [fieldKey, winnerId] of Object.entries(fieldWinners)) {
      if (winnerId === null) {
        // Gleichstand
        owners[fieldKey] = 'tie'
      } else {
        // Spieler hat gewonnen - Farbe aus Profil oder Fallback
        const playerIndex = state.match?.players.findIndex(p => p.playerId === winnerId) ?? 0
        owners[fieldKey] = {
          playerId: winnerId,
          color: playerColors[winnerId] ?? PLAYER_COLORS[playerIndex % PLAYER_COLORS.length],
        }
      }
    }

    return owners
  }, [captureState, state.match?.players, playerColors])

  // Dartboard-Players: keine Spieler-Positionen (nur fieldOwners zur Anzeige)
  // Wir uebergeben eine leere Liste, da CTF keine Spieler-Marker auf der Dartscheibe hat
  const dartboardPlayers = useMemo(() => {
    // Zeige aktuellen Zielfeld-Marker fuer aktiven Spieler
    if (!activePlayerId || !currentTargetNumber) return []
    return [{
      playerId: activePlayerId,
      name: activePlayer?.name ?? '',
      target: currentTargetNumber,
      color: activePlayerColor ?? PLAYER_COLORS[0],
      isActive: true,
    }]
  }, [activePlayerId, activePlayer, currentTargetNumber, activePlayerColor])

  // Aktuelles Ziel-Label
  const currentTargetLabel = currentTargetNumber ? formatTarget(currentTargetNumber) : null

  // Live-Rundendaten fuer den Leg-Verlauf-Chart
  const captureRounds = useMemo(() => {
    // Finde den Start des aktuellen Legs
    let legStartIdx = 0
    for (let i = events.length - 1; i >= 0; i--) {
      if (events[i].type === 'CTFLegStarted') {
        legStartIdx = i
        break
      }
    }

    // Sammle alle CTFRoundFinished Events seit dem letzten LegStarted
    return events
      .slice(legStartIdx)
      .filter((e): e is import('../types/captureTheField').CTFRoundFinishedEvent => e.type === 'CTFRoundFinished')
      .map(e => ({
        fieldNumber: e.fieldNumber,
        scoresByPlayer: e.scoresByPlayer,
        winnerId: e.winnerId,
      }))
  }, [events])

  // Spieler-Info fuer den Chart
  const chartPlayers = useMemo(() =>
    players.map((p, idx) => ({
      playerId: p.playerId,
      name: p.name,
      color: playerColors[p.playerId] ?? PLAYER_COLORS[idx % PLAYER_COLORS.length],
    })),
    [players, playerColors]
  )

  return (
    <div
      style={{
        background: playerColorBgEnabled && activePlayerColor
          ? `linear-gradient(180deg, ${activePlayerColor}20 0%, ${activePlayerColor}05 100%)`
          : c.bg,
        height: '100vh',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        color: c.textBright,
        fontFamily: 'system-ui, -apple-system, sans-serif',
        transition: 'background 0.5s ease',
      }}
    >
      {/* Pause Overlay */}
      {gamePaused && <PauseOverlay onResume={() => setGamePaused(false)} />}

      {/* Header mit Pause/Mute/Exit */}
      <GameControls
        isPaused={gamePaused}
        onTogglePause={() => setGamePaused(p => !p)}
        isMuted={muted}
        onToggleMute={() => setMuted(m => !m)}
        onExit={() => {
          // Pause-Status und verstrichene Zeit speichern bevor wir verlassen
          setMatchPaused(matchId, 'ctf', true)
          setMatchElapsedTime(matchId, 'ctf', elapsedMs)
          onExit()
        }}
        onCancel={() => {
          deleteCTFMatch(matchId)
          onExit()
        }}
        title="Capture the Field"
      />

      {/* Info-Leiste */}
      <div
        style={{
          display: 'flex',
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
        {/* Runde X von 21 */}
        <span style={{
          background: isArcade ? '#1e293b' : colors.bgMuted,
          padding: '3px 8px',
          borderRadius: 4,
          color: c.accent,
          fontWeight: 600,
        }}>
          Runde {currentFieldIndex + 1} von {seqLen}
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
                width: `${((currentFieldIndex + 1) / seqLen) * 100}%`,
                background: c.ledOn,
                transition: 'width 0.3s',
                borderRadius: 2,
              }}
            />
          </div>
          <span style={{ fontSize: 10, color: c.textDim, minWidth: 22, textAlign: 'right' }}>
            {Math.round(((currentFieldIndex + 1) / seqLen) * 100)}%
          </span>
        </div>

        {/* Sprung-Modus */}
        <span style={{
          background: isArcade ? '#1e293b' : colors.bgMuted,
          padding: '3px 8px',
          borderRadius: 4,
          color: c.textDim,
        }}>
          {config?.multiplierMode === 'standard' ? 'D=2, T=3' :
            config?.multiplierMode === 'standard2' ? 'D=2' : 'Alle=1'}
        </span>

        {/* Bull-Position */}
        {config?.bullPosition && (
          <span style={{
            background: isArcade ? '#1e293b' : colors.bgMuted,
            padding: '3px 8px',
            borderRadius: 4,
            color: c.yellow,
          }}>
            Bull: {config.bullPosition === 'start' ? 'Am Anfang' :
              config.bullPosition === 'end' ? 'Am Ende' : 'Zufaellig'}
          </span>
        )}

        {/* Rotation */}
        {config?.rotateOrder && (
          <span style={{
            background: isArcade ? '#1e293b' : colors.bgMuted,
            padding: '3px 8px',
            borderRadius: 4,
            color: c.textDim,
          }}>
            Rotation
          </span>
        )}

        {config?.retryZeroDrawFields && (
          <span style={{
            background: isArcade ? '#1e293b' : colors.bgMuted,
            padding: '3px 8px',
            borderRadius: 4,
            color: c.textDim,
          }}>
            0-Retry
          </span>
        )}

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

      {/* Main Content */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 24,
          padding: '8px 16px',
          minHeight: 0,
          overflow: 'hidden',
        }}
      >
        {/* Dartboard mit fieldOwners Overlay */}
        <div style={{ position: 'relative' }}>
          <ATBDartboard
            currentTarget={currentTargetNumber}
            players={dartboardPlayers}
            size={320}
            activePlayerColor={activePlayerColor}
            fieldOwners={fieldOwners}
          />

          {/* Aktuelles Ziel unter der Dartscheibe */}
          {activePlayer && currentTargetLabel && (
            <div
              style={{
                position: 'absolute',
                bottom: -50,
                left: '50%',
                transform: 'translateX(-50%)',
                textAlign: 'center',
                whiteSpace: 'nowrap',
              }}
            >
              <div style={{ fontSize: 11, color: c.textDim, marginBottom: 2 }}>
                Runde {currentFieldIndex + 1}/{seqLen} - {activePlayer.name} wirft
              </div>
              <div
                style={{
                  fontSize: 40,
                  fontWeight: 700,
                  color: c.ledOn,
                  textShadow: `0 0 25px ${c.ledGlow}`,
                  lineHeight: 1,
                }}
              >
                {currentTargetLabel}
              </div>
              {/* Punkte in dieser Runde */}
              {Object.keys(captureState.currentRoundTurns).length > 0 && (
                <div style={{ fontSize: 11, color: c.textDim, marginTop: 4 }}>
                  {Object.entries(captureState.currentRoundTurns).map(([pid, turn]) => {
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
        <div style={{ minWidth: 280, maxHeight: '100%', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {/* Multiplier-Anzeige */}
          <div
            style={{
              background: c.cardBg,
              borderRadius: 10,
              padding: '10px 14px',
              border: '1px solid #222',
            }}
          >
            <div style={{ fontSize: 10, color: c.textDim, marginBottom: 6, textAlign: 'center' }}>MULTIPLIER</div>
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8 }}>
              {([1, 2, 3] as const).map(m => (
                <div
                  key={m}
                  onClick={() => setMult(m)}
                  style={{
                    width: 60,
                    height: 34,
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
              {/* Undo Button */}
              <button
                onClick={undoLastTurn}
                disabled={!canUndo}
                style={{
                  width: 30,
                  height: 30,
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

            {/* Nummernpad - Dart-Eingabe */}
            <div style={{ marginTop: 8 }}>
              {NUMBER_PAD.map((row, rowIdx) => (
                <div key={rowIdx} style={{ display: 'flex', gap: 3, justifyContent: 'center', marginBottom: 3 }}>
                  {row.map(num => {
                    const isCurrentTarget = currentTargetNumber === num
                    return (
                      <button
                        key={num}
                        onClick={() => addDart(num)}
                        disabled={current.length >= 3}
                        style={{
                          width: 42,
                          height: 30,
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
              {/* Bull + Miss Zeile */}
              <div style={{ display: 'flex', gap: 3, justifyContent: 'center', marginTop: 3 }}>
                <button
                  onClick={() => addDart('BULL')}
                  disabled={current.length >= 3}
                  style={{
                    width: 86,
                    height: 30,
                    borderRadius: 6,
                    border: currentTargetNumber === 'BULL' ? `2px solid ${c.ledOn}` : '1px solid #333',
                    background: currentTargetNumber === 'BULL' ? '#2a1a1a' : '#1a1a1a',
                    color: currentTargetNumber === 'BULL' ? c.ledOn : '#e31b23',
                    fontWeight: 700,
                    fontSize: 14,
                    cursor: current.length >= 3 ? 'not-allowed' : 'pointer',
                    opacity: current.length >= 3 ? 0.5 : 1,
                    boxShadow: currentTargetNumber === 'BULL' ? `0 0 10px ${c.ledGlow}` : 'none',
                    transition: 'all 0.15s',
                  }}
                >
                  Bull
                </button>
                <button
                  onClick={addMiss}
                  disabled={current.length >= 3}
                  style={{
                    width: 86,
                    height: 30,
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
            <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginTop: 8 }}>
              {[0, 1, 2].map(i => {
                const dart = current[i]
                return (
                  <div
                    key={i}
                    style={{
                      width: 60,
                      height: 30,
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
            <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginTop: 6 }}>
              <button
                onClick={() => setCurrent(prev => prev.slice(0, -1))}
                disabled={current.length === 0}
                style={{
                  flex: 1,
                  padding: '5px 10px',
                  borderRadius: 6,
                  border: '1px solid #333',
                  background: '#1a1a1a',
                  color: current.length > 0 ? c.textBright : c.textDim,
                  fontWeight: 600,
                  fontSize: 12,
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
                  padding: '5px 10px',
                  borderRadius: 6,
                  border: 'none',
                  background: current.length > 0
                    ? 'linear-gradient(180deg, #22c55e, #16a34a)'
                    : '#1a1a1a',
                  color: current.length > 0 ? '#fff' : c.textDim,
                  fontWeight: 700,
                  fontSize: 12,
                  cursor: current.length > 0 ? 'pointer' : 'not-allowed',
                  boxShadow: current.length > 0 ? '0 2px 10px rgba(34, 197, 94, 0.3)' : 'none',
                }}
              >
                Bestaetigen
              </button>
            </div>

            <div style={{ fontSize: 10, color: c.textDim, marginTop: 6, textAlign: 'center' }}>
              [Space] Treffer  [D/T] Double/Triple  [1-20] Feld  [0] Miss  [B] Bull  [Enter] OK
            </div>
          </div>

          {/* Spieler-Liste */}
          <div
            style={{
              background: c.cardBg,
              borderRadius: 10,
              padding: '6px 10px',
              border: '1px solid #222',
              flex: 1,
              minHeight: 0,
            }}
          >
            <div style={{ display: 'grid', gap: 3 }}>
              {players.map((p, index) => {
                const isActive = p.playerId === activePlayerId
                const darts = state.dartsUsedByPlayer[p.playerId] ?? 0
                const color = playerColors[p.playerId] ?? PLAYER_COLORS[index % PLAYER_COLORS.length]

                const captureFieldPoints = captureState.totalFieldPointsByPlayer[p.playerId] ?? 0
                const captureFieldsWon = Object.values(captureState.fieldWinners).filter(w => w === p.playerId).length
                const captureTotalScore = captureState.totalScoreByPlayer[p.playerId] ?? 0
                const captureHasThrownThisRound = captureState.playersCompletedThisRound.includes(p.playerId)

                return (
                  <div
                    key={p.playerId}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '4px 8px',
                      borderRadius: 5,
                      background: isActive ? '#1a1a1a' : 'transparent',
                      borderLeft: `3px solid ${color}`,
                      boxShadow: isActive ? `0 0 12px ${color}30` : 'none',
                      fontSize: 12,
                    }}
                  >
                    {/* Farbpunkt */}
                    <div
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        background: color,
                        flexShrink: 0,
                        boxShadow: isActive ? `0 0 8px ${color}` : 'none',
                      }}
                    />
                    {/* Name */}
                    <span style={{
                      fontWeight: isActive ? 700 : 500,
                      color: isActive ? color : c.textBright,
                      minWidth: 0,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      flex: 1,
                    }}>
                      {p.name}
                    </span>
                    {/* Stats kompakt */}
                    <span style={{ color: c.textDim, fontSize: 10, flexShrink: 0 }}>
                      {captureFieldsWon}F {captureTotalScore}P {darts}D
                    </span>
                    {/* Feldpunkte */}
                    <span style={{ color: c.yellow, fontWeight: 700, fontSize: 12, flexShrink: 0, minWidth: 32, textAlign: 'right' }}>
                      {captureFieldPoints} FP
                    </span>
                    {/* Status */}
                    <span style={{
                      fontSize: 10,
                      fontWeight: 600,
                      flexShrink: 0,
                      minWidth: 52,
                      textAlign: 'right',
                      color: captureHasThrownThisRound ? c.green : isActive ? color : c.textDim,
                    }}>
                      {captureHasThrownThisRound ? '\u2713 Done' : isActive ? '\u25B6 Wurf' : 'Wartet'}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Leg-Verlauf Chart (volle Breite) */}
      {captureRounds.length > 0 && (
        <div
          style={{
            padding: '6px 16px 10px',
            borderTop: `1px solid ${c.border}`,
            background: c.cardBg,
            flexShrink: 0,
          }}
        >
          <div style={{ fontSize: 10, color: c.textDim, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Leg-Verlauf
          </div>
          <div style={{ overflowX: 'auto', display: 'flex', justifyContent: 'center' }}>
            <ATBCaptureScoreChart
              rounds={captureRounds}
              players={chartPlayers}
              minGroupWidth={Math.max(24, Math.min(40, 800 / Math.max(captureRounds.length, 1)))}
              height={130}
            />
          </div>
        </div>
      )}

      {/* Leg-Zusammenfassung (Intermission) */}
      {intermission && (
        <LegIntermissionModal
          intermission={intermission}
          match={state.match}
          events={events}
          playerColors={state.match.players.map((p: any) => playerColors[p.playerId] ?? PLAYER_COLORS[0])}
          onContinue={() => {
            // Naechstes Leg starten
            const newEvents = [...events, ...intermission.pendingNextEvents]
            persistCTFEvents(matchId, newEvents)
            setEvents(newEvents)
            setIntermission(null)
          }}
        />
      )}
    </div>
  )
}

// ===== Leg-Zusammenfassung Modal =====

function LegIntermissionModal({
  intermission,
  match,
  events,
  playerColors,
  onContinue,
}: {
  intermission: CTFIntermission
  match: any
  events: CTFEvent[]
  playerColors: string[]
  onContinue: () => void
}) {
  // Capture-Runden fuer Chart sammeln
  const captureRounds = useMemo(() => {
    // Finde das aktuelle Leg anhand der LegStarted Events
    const legStartEvents = events
      .map((e, idx) => ({ e, idx }))
      .filter(({ e }) => e.type === 'CTFLegStarted')

    const currentLegIdx = intermission.legIndex - 1 // 0-based
    const legStartInfo = legStartEvents[currentLegIdx]
    if (!legStartInfo) return []

    const startIdx = legStartInfo.idx
    // Finde das Ende des Legs (LegFinished Event oder Ende der Events)
    const endIdx = events.findIndex((e, idx) => idx > startIdx && e.type === 'CTFLegFinished')
    const legEvents = endIdx >= 0
      ? events.slice(startIdx, endIdx + 1)
      : events.slice(startIdx)

    // Sammle CTFRoundFinished Events
    return legEvents
      .filter((e): e is import('../types/captureTheField').CTFRoundFinishedEvent => e.type === 'CTFRoundFinished')
      .map(e => ({
        fieldNumber: e.fieldNumber,
        scoresByPlayer: e.scoresByPlayer,
        winnerId: e.winnerId,
      }))
  }, [events, intermission.legIndex])

  // Leg-Score berechnen (kumulativ bis zu diesem Leg)
  const legWins: Record<string, number> = {}
  match.players.forEach((p: any) => { legWins[p.playerId] = 0 })

  for (const ev of events) {
    if (ev.type === 'CTFLegFinished') {
      const wid = (ev as any).winnerId
      if (wid in legWins) legWins[wid]++
    }
  }
  const legScore = match.players.map((p: any) => legWins[p.playerId]).join(' : ')

  // Felder-Gewinner fuer dieses Leg berechnen
  const legState = useMemo(() => applyCTFEvents(events), [events])
  const fieldWinners = legState.captureState.fieldWinners

  // Spieler-Rangliste fuer dieses Leg (nach Feldpunkten)
  const rankings = match.players.map((p: any, idx: number) => ({
    name: p.name,
    playerId: p.playerId,
    fieldPoints: legState.captureState.totalFieldPointsByPlayer[p.playerId] ?? 0,
    fields: Object.values(fieldWinners).filter(w => w === p.playerId).length,
    score: legState.captureState.totalScoreByPlayer[p.playerId] ?? 0,
    color: playerColors[idx % playerColors.length],
  }))
  rankings.sort((a: any, b: any) => b.fieldPoints - a.fieldPoints || b.score - a.score)

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
          maxWidth: 600,
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
          <div style={{ fontSize: 32, fontWeight: 800, color: '#22c55e', marginBottom: 8 }}>
            {intermission.winnerName} gewinnt!
          </div>
          <div style={{ fontSize: 18, color: '#f97316' }}>
            {intermission.winnerDarts} Darts
          </div>
        </div>

        {/* Leg-Score */}
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
                <th style={{ textAlign: 'right', padding: '8px 0', borderBottom: '1px solid #333', color: '#6b7280' }}>FP</th>
                <th style={{ textAlign: 'right', padding: '8px 0', borderBottom: '1px solid #333', color: '#6b7280' }}>Felder</th>
                <th style={{ textAlign: 'right', padding: '8px 0', borderBottom: '1px solid #333', color: '#6b7280' }}>Punkte</th>
              </tr>
            </thead>
            <tbody>
              {rankings.map((r: any, idx: number) => (
                <tr key={r.playerId}>
                  <td style={{ padding: '6px 0', fontWeight: 700, color: idx === 0 ? '#22c55e' : '#9ca3af' }}>
                    {idx + 1}.
                  </td>
                  <td style={{ padding: '6px 0', fontWeight: 600, color: r.color }}>
                    {r.name}
                  </td>
                  <td style={{ textAlign: 'right', padding: '6px 0', fontWeight: 700, color: '#eab308' }}>
                    {r.fieldPoints}
                  </td>
                  <td style={{ textAlign: 'right', padding: '6px 0', fontWeight: 700, color: '#e5e7eb' }}>
                    {r.fields}
                  </td>
                  <td style={{ textAlign: 'right', padding: '6px 0', color: '#9ca3af' }}>
                    {r.score}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Punkte pro Feld Chart */}
        {captureRounds.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#9ca3af', marginBottom: 12 }}>
              Punkte pro Feld
            </div>
            <ATBCaptureScoreChart
              rounds={captureRounds}
              players={match.players.map((p: any, idx: number) => ({
                playerId: p.playerId,
                name: p.name,
                color: playerColors[idx % playerColors.length],
              }))}
            />
          </div>
        )}

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
