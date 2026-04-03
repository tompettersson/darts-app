// src/screens/GameATB.tsx
// Arcade-Spielscreen für Around the Block
// Tastatursteuerung: Space=Treffer, S/D/T=Multiplier, 0=Miss

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useGameState, useGameColors } from '../hooks/useGameState'
import {
  getATBMatchById,
  persistATBEvents,
  finishATBMatch,
  setMatchPaused,
  setMatchElapsedTime,
  deleteATBMatch,
  getPlayerColorBackgroundEnabled,
  getProfiles,
  ensureATBMatchExists,
} from '../storage'
import {
  applyATBEvents,
  recordATBTurn,
  getActivePlayerId,
  calculateAdvance,
  calculateAdvanceExtended,
  formatDuration,
  getModeLabel,
  getDirectionLabel,
  type ATBEvent,
  type ATBDart,
  type ATBTarget,
  type ATBMatchConfig,
  DEFAULT_ATB_CONFIG,
} from '../dartsAroundTheBlock'
import ATBDartboard from '../components/ATBDartboard'
import GameControls, { PauseOverlay } from '../components/GameControls'
import {
  announceGameStart,
  announceATBHit,
  announceATBNextTarget,
  announceATBWinner,
  announceATBPlayerTurn,
  announceATBBullRequired,
  announceATBEliminated,
  announceATBMissBack,
  playTriple20Sound,
  cancelDebouncedAnnounce,
  debouncedAnnounce,
} from '../speech'
import { computeATBDetailedStats, type ATBDetailedStats } from '../stats/computeATBStats'
import { PLAYER_COLORS } from '../playerColors'
import { useDisableScale } from '../components/ScaleWrapper'

// Intermission-Typ für Leg-Zusammenfassung
type ATBIntermission = {
  kind: 'leg'
  legId: string
  legIndex: number
  winnerId: string
  winnerName: string
  winnerDarts: number
  pendingNextEvents: ATBEvent[]
}

// Farben - werden jetzt über Theme-System bezogen (siehe useTheme im Component)

// ===== Helper-Funktionen für erweiterte Ziele =====

/** Formatiert ein ATBTarget für die Anzeige (z.B. "D5", "T20", "Bull") */
function formatTarget(target: ATBTarget): string {
  const { number: num, requiredMultiplier } = target
  if (num === 'BULL') {
    if (requiredMultiplier === 2) return 'DBull'
    return 'Bull'
  }
  if (!requiredMultiplier) return String(num) // 'any' mode - nur Zahl
  const prefix = requiredMultiplier === 1 ? 'S' : requiredMultiplier === 2 ? 'D' : 'T'
  return `${prefix}${num}`
}

/** Holt das Ziel-Label aus Sequenz oder erweiterter Sequenz */
function getTargetLabel(
  index: number,
  sequence: readonly (number | 'BULL')[],
  extendedSequence?: ATBTarget[]
): string {
  if (extendedSequence && extendedSequence[index]) {
    return formatTarget(extendedSequence[index])
  }
  const num = sequence[index]
  if (!num) return ''
  return num === 'BULL' ? 'Bull' : String(num)
}

/** Beschreibung der Spezialregel für Header */
function getSpecialRuleLabel(config: ATBMatchConfig): string {
  switch (config.specialRule) {
    case 'bullHeavy': return 'Bull Heavy'
    case 'suddenDeath': return 'Sudden Death'
    case 'noDoubleEscape': return 'No Double Escape'
    case 'miss3Back': return 'Miss 3 → Zurück'
    default: return ''
  }
}

type MultiplayerProp = {
  enabled: boolean
  roomCode: string
  myPlayerId: string
  localPlayerIds?: string[]
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

export default function GameATB({ matchId, onExit, onShowSummary, multiplayer }: Props) {
  useDisableScale()
  const { c, isArcade, colors } = useGameColors()

  const [storedMatch, setStoredMatch] = useState(() => getATBMatchById(matchId))
  const [events, setEvents] = useState<ATBEvent[]>(storedMatch?.events ?? [])

  // Retry loading match if not found yet (multiplayer: match created by host, may not be in cache yet)
  useEffect(() => {
    if (storedMatch) return
    const timer = setInterval(() => {
      const found = getATBMatchById(matchId)
      if (found) { setStoredMatch(found); setEvents(found.events as ATBEvent[]); clearInterval(timer) }
    }, 500)
    return () => clearInterval(timer)
  }, [matchId, storedMatch])

  const state = applyATBEvents(events)

  // Multiplayer: Remote-Events synchronisieren
  const prevRemoteATBRef = useRef<any[] | null>(null)
  useEffect(() => {
    if (!multiplayer?.remoteEvents) return
    if (multiplayer.remoteEvents === prevRemoteATBRef.current) return
    const prevEvents = prevRemoteATBRef.current as any[] | null
    prevRemoteATBRef.current = multiplayer.remoteEvents
    const remote = multiplayer.remoteEvents as ATBEvent[]
    setEvents(remote)
    persistATBEvents(matchId, remote)
    // Detect MatchFinished: only trigger when NEW
    const matchFinishedEvt = remote.find((e: any) => e.type === 'ATBMatchFinished') as any
    const prevHadFinished = prevEvents ? prevEvents.some((e: any) => e.type === 'ATBMatchFinished') : false
    if (matchFinishedEvt && !prevHadFinished) {
      ;(async () => {
        await finishATBMatch(matchId, matchFinishedEvt.winnerId, matchFinishedEvt.totalDarts, matchFinishedEvt.durationMs)
        if (onShowSummary) setTimeout(() => onShowSummary(matchId), 2000)
      })()
    }
    // Ensure match exists locally for guest
    if (remote.length > 0) {
      const startEvt = remote.find((e: any) => e.type === 'ATBMatchStarted') as any
      if (startEvt) {
        ensureATBMatchExists(matchId, remote, startEvt.players?.map((p: any) => p.playerId) ?? [])
      }
    }
  }, [multiplayer?.remoteEvents]) // eslint-disable-line react-hooks/exhaustive-deps

  const { gamePaused, setGamePaused, muted, setMuted, elapsedMs, setElapsedMs } = useGameState({
    matchId, mode: 'atb', finished: state.finished,
  })

  const [current, setCurrent] = useState<ATBDart[]>([])
  const [mult, setMult] = useState<1 | 2 | 3>(1)
  const [saving, setSaving] = useState(false)
  const multRef = useRef(mult)

  // Für Sprachansagen: letztes angesagtes Ziel/Spieler merken
  const lastAnnouncedTargetRef = useRef<number | 'BULL' | null>(null)
  const lastAnnouncedPlayerRef = useRef<string | null>(null)
  const gameOnAnnouncedRef = useRef(false)

  // Leg-Zusammenfassung (Intermission zwischen Legs)
  const [intermission, setIntermission] = useState<ATBIntermission | null>(null)

  // Aktiver Spieler + Ziel für Ansage (muss VOR den useEffects definiert werden)
  const activePlayerId = getActivePlayerId(state)
  const activePlayer = state.match?.players.find(p => p.playerId === activePlayerId)

  // Multiplayer: Ist der lokale Spieler gerade am Zug?
  const atbLocalIds = multiplayer?.localPlayerIds ?? (multiplayer?.myPlayerId ? [multiplayer.myPlayerId] : [])
  const isMyTurn = !multiplayer?.enabled || (activePlayerId != null && atbLocalIds.includes(activePlayerId))

  // "[Name], throw first! Game on!" + erstes Ziel ansagen
  useEffect(() => {
    if (!gameOnAnnouncedRef.current && state.match && activePlayerId && activePlayer) {
      gameOnAnnouncedRef.current = true

      const extSeq = state.match.extendedSequence

      announceGameStart(activePlayer.name)

      // Erstes Ziel direkt nach Game-On ansagen (mit Verzögerung)
      const startIndex = state.currentIndexByPlayer[activePlayerId] ?? 0

      const firstTarget = extSeq
        ? extSeq[startIndex]?.number
        : state.match.sequence[startIndex]

      if (firstTarget) {
        lastAnnouncedPlayerRef.current = activePlayerId
        lastAnnouncedTargetRef.current = firstTarget
        setTimeout(() => {
          announceATBPlayerTurn(activePlayer.name, firstTarget)
        }, 1200)
      }
    }
  }, [state.match, activePlayerId, activePlayer, state.currentIndexByPlayer])

  // Sync mult with ref
  useEffect(() => {
    multRef.current = mult
  }, [mult])

  // Spieler-Wechsel ansagen: Name + Ziel (bei Multiplayer)
  useEffect(() => {
    if (!activePlayerId || !activePlayer) return
    if (state.finished) return
    // Nur nach Game-On und wenn sich der Spieler geändert hat
    if (!gameOnAnnouncedRef.current) return

    const extSeq = state.match?.extendedSequence

    // Target für diese Runde berechnen
    const playerIndex = state.currentIndexByPlayer[activePlayerId] ?? 0

    const currentTarget = extSeq
      ? extSeq[playerIndex]?.number
      : state.match?.sequence[playerIndex]

    if (!currentTarget) return

    // Nur ansagen wenn sich der Spieler geändert hat
    if (lastAnnouncedPlayerRef.current !== activePlayerId) {
      lastAnnouncedPlayerRef.current = activePlayerId
      lastAnnouncedTargetRef.current = currentTarget

      // Debounced für natürlichen Fluss (verhindert Stacking bei schnellem Undo)
      debouncedAnnounce(() => {
        announceATBPlayerTurn(activePlayer.name, currentTarget)
      })
    }
  }, [activePlayerId, activePlayer, state.finished, state.match?.sequence, state.match?.extendedSequence, state.currentIndexByPlayer])

  if (!storedMatch || !state.match) {
    return (
      <div style={{ background: c.bg, minHeight: '100dvh', color: c.textBright, padding: 20 }}>
        <p>Match nicht gefunden.</p>
        <button onClick={onExit} style={{ color: c.textBright, background: '#333', border: 'none', padding: '8px 16px', borderRadius: 6, cursor: 'pointer' }}>
          ← Zurück
        </button>
      </div>
    )
  }

  // Konfiguration und Sequenzen
  const config = state.match.config ?? DEFAULT_ATB_CONFIG
  const extSeq = state.match.extendedSequence
  const totalFields = extSeq ? extSeq.length : state.match.sequence.length

  // Preview-Index basierend auf aktuellen Würfen
  const getPreviewIndex = (playerId: string): number => {
    const baseIndex = state.currentIndexByPlayer[playerId] ?? 0
    if (playerId !== activePlayerId || current.length === 0) {
      return baseIndex
    }
    // Erweiterte Berechnung wenn verfügbar
    if (extSeq) {
      const specialState = state.specialStateByPlayer[playerId] ?? {}
      const { newIndex } = calculateAdvanceExtended(current, baseIndex, extSeq, config, specialState.bullHit ?? false)
      return newIndex
    }
    const { newIndex } = calculateAdvance(current, baseIndex, state.match!.sequence)
    return newIndex
  }

  // Holt das aktuelle Ziel-Label (mit Multiplier wenn extended)
  const getPreviewTargetLabel = (playerId: string): string | null => {
    // Bull Heavy: Wenn Bull benötigt wird, zeige "Bull" als Ziel
    const specialState = state.specialStateByPlayer[playerId]
    if (specialState?.needsBull) return 'Bull'

    const idx = getPreviewIndex(playerId)
    if (idx >= totalFields) return null
    return getTargetLabel(idx, state.match!.sequence, extSeq)
  }

  // Holt die Zahl des Ziels (für Dartboard-Highlighting)
  const getPreviewTargetNumber = (playerId: string): number | 'BULL' | null => {
    // Bull Heavy: Wenn Bull benötigt wird, zeige Bull als Ziel
    const specialState = state.specialStateByPlayer[playerId]
    if (specialState?.needsBull) return 'BULL'

    const idx = getPreviewIndex(playerId)
    if (extSeq) {
      if (idx >= extSeq.length) return null
      return extSeq[idx].number
    }
    if (idx >= state.match!.sequence.length) return null
    return state.match!.sequence[idx]
  }

  const nextTargetLabel = activePlayerId ? getPreviewTargetLabel(activePlayerId) : null
  const nextTargetNumber = activePlayerId ? getPreviewTargetNumber(activePlayerId) : null

  // Spezialregel-Status des aktiven Spielers
  const activeSpecialState = activePlayerId ? state.specialStateByPlayer[activePlayerId] : undefined

  // Dart hinzufügen (Treffer auf aktuelles Ziel)
  const addHit = useCallback(() => {
    if (gamePaused) return
    if (!activePlayerId || !state.match) return
    // Multiplayer: Nur eigene Würfe eingeben
    if (multiplayer?.enabled && !isMyTurn) return
    const targetNum = getPreviewTargetNumber(activePlayerId)
    if (!targetNum) return

    const currentMult = multRef.current
    const dart: ATBDart = { target: targetNum, mult: currentMult }
    if (targetNum === 20 && currentMult === 3) playTriple20Sound()

    // Berechne das nächste Ziel nach diesem Wurf
    const baseIndex = state.currentIndexByPlayer[activePlayerId] ?? 0
    let newIndex: number
    let nextTargetAfterHit: number | 'BULL' | null = null

    if (extSeq) {
      const specialState = state.specialStateByPlayer[activePlayerId] ?? {}
      const result = calculateAdvanceExtended([...current, dart], baseIndex, extSeq, config, specialState.bullHit ?? false)
      newIndex = result.newIndex
      if (newIndex < extSeq.length) {
        nextTargetAfterHit = extSeq[newIndex].number
      }
    } else {
      const result = calculateAdvance([...current, dart], baseIndex, state.match.sequence)
      newIndex = result.newIndex
      if (newIndex < state.match.sequence.length) {
        nextTargetAfterHit = state.match.sequence[newIndex]
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

    // Sprachansage: Nächstes Ziel (wenn es sich ändert)
    if (nextTargetAfterHit && nextTargetAfterHit !== lastAnnouncedTargetRef.current) {
      setTimeout(() => {
        announceATBNextTarget(nextTargetAfterHit)
        lastAnnouncedTargetRef.current = nextTargetAfterHit
      }, currentMult >= 2 ? 400 : 100)
    }

    // Nach jedem Wurf zurück auf Single
    setMult(1)
  }, [activePlayerId, current, state, multiplayer, isMyTurn])

  // Miss hinzufügen
  const addMiss = useCallback(() => {
    if (gamePaused) return
    // Multiplayer: Nur eigene Würfe eingeben
    if (multiplayer?.enabled && !isMyTurn) return
    const dart: ATBDart = { target: 'MISS', mult: 1 }
    setCurrent(prev => {
      if (prev.length >= 3) return prev
      return [...prev, dart]
    })
    setMult(1)
  }, [gamePaused, multiplayer, isMyTurn])

  // Turn bestätigen
  const confirmTurn = useCallback(() => {
    if (gamePaused) return
    if (!activePlayerId || current.length === 0) return
    // Multiplayer: Nur eigene Turns bestätigen
    if (multiplayer?.enabled && !isMyTurn) return

    const darts = [...current]
    while (darts.length < 3) {
      darts.push({ target: 'MISS', mult: 1 })
    }

    const result = recordATBTurn(state, activePlayerId, darts)

    const newEvents: ATBEvent[] = [...events, result.turnEvent]

    // Spezialregel-Ansagen
    {
      const effects = result.turnEvent.specialEffects
      if (effects) {
        // Sudden Death: Spieler eliminiert
        if (effects.eliminated) {
          const player = state.match?.players.find(p => p.playerId === activePlayerId)
          if (player) {
            setTimeout(() => announceATBEliminated(player.name), 200)
          }
        }
        // Bull Heavy: Bull erforderlich
        if (effects.needsBull) {
          setTimeout(() => announceATBBullRequired(), 300)
        }
        // Miss 3 Back: Zurückgesetzt
        if (effects.setBackTo !== undefined) {
          const variant = config.miss3BackVariant ?? 'previous'
          if (variant === 'start') {
            setTimeout(() => announceATBMissBack('start'), 200)
          } else {
            // Finde das Ziel an der neuen Position
            const targetNum = extSeq
              ? extSeq[effects.setBackTo]?.number ?? 1
              : state.match?.sequence[effects.setBackTo] ?? 1
            setTimeout(() => announceATBMissBack(targetNum), 200)
          }
        }
      }
    }

    // Leg beendet?
    if (result.legFinished) {
      newEvents.push(result.legFinished)

      // Leg-Sieger ansagen
      const legWinner = state.match?.players.find(p => p.playerId === result.legFinished!.winnerId)
      if (legWinner) {
        announceATBWinner(legWinner.name, result.legFinished.winnerDarts, '')
      }

      // Set beendet?
      if (result.setFinished) {
        newEvents.push(result.setFinished)
      }

      // Match beendet?
      if (result.matchFinished) {
        newEvents.push(result.matchFinished)

        // Match-Gewinner-Ansage
        const winnerPlayer = state.match?.players.find(p => p.playerId === result.matchFinished!.winnerId)
        if (winnerPlayer) {
          announceATBWinner(winnerPlayer.name, result.matchFinished.totalDarts, formatDuration(result.matchFinished.durationMs))
        }

        setEvents(newEvents)
        setCurrent([])
        setMult(1)
        if (multiplayer?.enabled) multiplayer.submitEvents(newEvents.slice(events.length))
        // Persist + finish must complete before navigating to summary
        setSaving(true)
        ;(async () => {
          try {
            await persistATBEvents(matchId, newEvents)
            await finishATBMatch(matchId, result.matchFinished!.winnerId, result.matchFinished!.totalDarts, result.matchFinished!.durationMs)
          } catch (err) {
            console.warn('[ATB] Persist failed:', err)
          } finally {
            setSaving(false)
          }
          onShowSummary(matchId)
        })()
        return
      }

      // Leg fertig aber Match nicht - Intermission zeigen
      if (result.nextLegStart && legWinner) {
        // Events OHNE nextLegStart speichern - das kommt nach dem "Weiter"
        persistATBEvents(matchId, newEvents)
        setEvents(newEvents)
        setCurrent([])
        setMult(1)
        if (multiplayer?.enabled) multiplayer.submitEvents(newEvents.slice(events.length))

        // Leg-Index aus dem Event ermitteln
        const legIndex = (result.legFinished as any).legIndex ?? 1

        // Intermission aktivieren
        setIntermission({
          kind: 'leg',
          legId: result.legFinished.legId,
          legIndex,
          winnerId: result.legFinished.winnerId,
          winnerName: legWinner.name,
          winnerDarts: result.legFinished.winnerDarts,
          pendingNextEvents: [result.nextLegStart],
        })
        return
      }
    }

    persistATBEvents(matchId, newEvents)
    setEvents(newEvents)
    setCurrent([])
    setMult(1)

    // Multiplayer: Events senden
    if (multiplayer?.enabled) multiplayer.submitEvents(newEvents.slice(events.length))

    // Einzelspieler: Nächstes Ziel nach jeder Runde ansagen
    if (!result.matchFinished && state.match && state.match.players.length === 1) {
      const newState = applyATBEvents(newEvents)
      const currentIndex = newState.currentIndexByPlayer[activePlayerId] ?? 0
      const totalFields = extSeq ? extSeq.length : state.match.sequence.length

      // Nächstes Ziel ermitteln
      if (currentIndex < totalFields) {
        const nextTarget = extSeq
          ? extSeq[currentIndex]?.number
          : state.match.sequence[currentIndex]

        if (nextTarget) {
          lastAnnouncedTargetRef.current = nextTarget
          // Verzögerung, damit andere Ansagen zuerst kommen
          setTimeout(() => {
            announceATBNextTarget(nextTarget)
          }, 500)
        }
      }
    }

  }, [activePlayerId, current, events, matchId, state, onShowSummary, config, extSeq, multiplayer, isMyTurn])

  // Letzten Zug rückgängig machen
  const undoLastTurn = useCallback(() => {
    // Finde den letzten ATBTurnAdded Event
    let lastTurnIndex = -1
    for (let i = events.length - 1; i >= 0; i--) {
      if (events[i].type === 'ATBTurnAdded') {
        lastTurnIndex = i
        break
      }
    }

    if (lastTurnIndex === -1) return // Kein Turn zum Rückgängigmachen

    // Ausstehende Sprachansagen abbrechen
    cancelDebouncedAnnounce()

    // Entferne alle Events ab dem letzten Turn (inkl. eventueller LegFinished etc.)
    const newEvents = events.slice(0, lastTurnIndex)
    persistATBEvents(matchId, newEvents)
    setEvents(newEvents)
    setCurrent([])
    setMult(1)

    // Multiplayer: Undo senden
    if (multiplayer?.enabled) multiplayer.undo(events.length - lastTurnIndex)
  }, [events, matchId, multiplayer])

  // Prüfe ob Undo möglich ist (mindestens ein Turn vorhanden)
  const canUndo = useMemo(() => {
    return events.some(e => e.type === 'ATBTurnAdded')
  }, [events])

  // Auto-Confirm bei 3 Darts
  useEffect(() => {
    if (current.length === 3) {
      confirmTurn()
    }
  }, [current.length, confirmTurn])

  // Keyboard Handler - Arcade Style
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

      // S/D/T für Multiplier
      if (k === 's') { setMult(1); e.preventDefault(); return }
      if (k === 'd') { setMult(2); e.preventDefault(); return }
      if (k === 't') { setMult(3); e.preventDefault(); return }

      // Space = Treffer auf aktuelles Ziel
      if (e.code === 'Space' || e.key === ' ') {
        addHit()
        e.preventDefault()
        return
      }

      // 0 = Miss
      if (k === '0') {
        addMiss()
        e.preventDefault()
        return
      }

      // Backspace = letzten Dart entfernen
      if (e.key === 'Backspace') {
        setCurrent(prev => prev.slice(0, -1))
        e.preventDefault()
        return
      }

      // Enter = Turn bestätigen
      if (e.key === 'Enter') {
        confirmTurn()
        e.preventDefault()
        return
      }

      // Escape = Menü
      if (e.key === 'Escape') {
        onExit()
        e.preventDefault()
        return
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [addHit, addMiss, confirmTurn, onExit, gamePaused])

  // Profile laden für Spielerfarben
  const profiles = useMemo(() => getProfiles(), [])

  // Spielerfarben aus Profilen holen (Fallback auf PLAYER_COLORS)
  const playerColors = useMemo(() => {
    const colors: Record<string, string> = {}
    if (!state.match) return colors
    state.match.players.forEach((p, idx) => {
      const profile = profiles.find(pr => pr.id === p.playerId)
      colors[p.playerId] = profile?.color ?? PLAYER_COLORS[idx % PLAYER_COLORS.length]
    })
    return colors
  }, [state.match?.players, profiles])

  // Spieler-Daten für Dartboard
  const dartboardPlayers = state.match.players.map((p, index) => ({
    playerId: p.playerId,
    name: p.name,
    target: getPreviewTargetNumber(p.playerId),
    color: playerColors[p.playerId] ?? PLAYER_COLORS[index % PLAYER_COLORS.length],
    isActive: p.playerId === activePlayerId,
  }))

  // Farbe des aktiven Spielers für Zielfeld-Highlight
  const activePlayerIndex = state.match.players.findIndex(p => p.playerId === activePlayerId)
  const activePlayerColor = activePlayerIndex >= 0
    ? playerColors[state.match.players[activePlayerIndex].playerId] ?? PLAYER_COLORS[activePlayerIndex % PLAYER_COLORS.length]
    : undefined

  // Spielerfarben-Hintergrund Einstellung
  const playerColorBgEnabled = getPlayerColorBackgroundEnabled()

  // Berechne welche Multiplier für die aktuelle Zahl leuchten sollen
  const pendingMultipliers = useMemo(() => {
    if (!activePlayerId) return undefined

    // Bei "any" Modus: Volles Segment leuchten (kein pendingMultipliers)
    if (config.targetMode === 'any') return undefined

    // Bei single/double/triple: Nur den entsprechenden Ring
    if (config.targetMode === 'single') {
      return { single: true, double: false, triple: false }
    }
    if (config.targetMode === 'double') {
      return { single: false, double: true, triple: false }
    }
    if (config.targetMode === 'triple') {
      return { single: false, double: false, triple: true }
    }

    // Mixed-Modus: Dynamisch berechnen (welche Multiplier noch ausstehen)
    if (config.targetMode === 'mixed' && extSeq) {
      const currentIdx = state.currentIndexByPlayer[activePlayerId] ?? 0
      const currentTarget = extSeq[currentIdx]
      if (!currentTarget) return undefined

      const currentNumber = currentTarget.number

      // Finde alle Targets mit der gleichen Zahl und Index >= currentIdx
      const pending = { single: false, double: false, triple: false }
      for (let i = currentIdx; i < extSeq.length; i++) {
        const target = extSeq[i]
        if (target.number !== currentNumber) break // Nächste Zahl erreicht
        if (target.requiredMultiplier === 1) pending.single = true
        if (target.requiredMultiplier === 2) pending.double = true
        if (target.requiredMultiplier === 3) pending.triple = true
      }

      return pending
    }

    return undefined
  }, [config.targetMode, extSeq, activePlayerId, state.currentIndexByPlayer])

  // Dart formatieren
  const formatDart = (dart: ATBDart): string => {
    if (dart.target === 'MISS') return 'Miss'
    if (dart.target === 'BULL') return dart.mult === 2 ? 'DBull' : 'Bull'
    const prefix = dart.mult === 3 ? 'T' : dart.mult === 2 ? 'D' : 'S'
    return `${prefix}${dart.target}`
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

      {/* Header mit Pause/Mute/Exit */}
      <GameControls
        isPaused={gamePaused}
        onTogglePause={() => setGamePaused(p => !p)}
        isMuted={muted}
        onToggleMute={() => setMuted(m => !m)}
        onExit={() => {
          // Pause-Status und verstrichene Zeit speichern bevor wir verlassen
          setMatchPaused(matchId, 'atb', true)
          setMatchElapsedTime(matchId, 'atb', elapsedMs)
          onExit()
        }}
        onCancel={() => {
          deleteATBMatch(matchId)
          onExit()
        }}
        title={`ATB - ${getModeLabel(state.match.mode)} - ${getDirectionLabel(state.match.direction)}${multiplayer?.enabled && multiplayer.roomCode ? ` · ${multiplayer.roomCode}` : ''}`}
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
        {/* Struktur: First to X Legs/Sets */}
        <span style={{
          background: isArcade ? '#1e293b' : colors.bgMuted,
          padding: '3px 8px',
          borderRadius: 4,
          color: c.accent,
          fontWeight: 600,
        }}>
          {state.match.structure.kind === 'sets'
            ? `FT${state.match.structure.bestOfSets} Sets (FT${state.match.structure.legsPerSet} Legs)`
            : state.match.structure.bestOfLegs > 1
              ? `FT${state.match.structure.bestOfLegs} Legs`
              : '1 Leg'
          }
        </span>

        {/* Zielfelder-Modus */}
        {(
          <span style={{
            background: isArcade ? '#1e293b' : colors.bgMuted,
            padding: '3px 8px',
            borderRadius: 4,
            color: c.textDim,
          }}>
            {config.targetMode === 'any' ? 'Alle Felder' :
              config.targetMode === 'single' ? 'Nur Single' :
              config.targetMode === 'double' ? 'Nur Double' :
              config.targetMode === 'triple' ? 'Nur Triple' :
              config.targetMode === 'mixed' ? 'Gemischt' : 'Zufall'}
          </span>
        )}

        {/* Sprung-Modus */}
        <span style={{
          background: isArcade ? '#1e293b' : colors.bgMuted,
          padding: '3px 8px',
          borderRadius: 4,
          color: c.textDim,
        }}>
          {config.multiplierMode === 'standard' ? 'D=2, T=3' :
            config.multiplierMode === 'standard2' ? 'D=2' : 'Alle=1'}
        </span>

        {/* Bull-Modus */}
        {config.bullPosition && (
          <span style={{
            background: isArcade ? '#1e293b' : colors.bgMuted,
            padding: '3px 8px',
            borderRadius: 4,
            color: c.yellow,
          }}>
            Bull: {config.bullPosition === 'start' ? 'Am Anfang' :
              config.bullPosition === 'end' ? 'Am Ende' : 'Zufällig'}
          </span>
        )}

        {/* Spezialregel */}
        {config.specialRule !== 'none' && (
          <span style={{
            background: isArcade ? '#422006' : '#fef3c7',
            padding: '3px 8px',
            borderRadius: 4,
            color: isArcade ? '#fbbf24' : '#92400e',
            fontWeight: 600,
          }}>
            🎯 {getSpecialRuleLabel(config)}
          </span>
        )}

        {/* Trenner */}
        <span style={{ color: c.textDim }}>│</span>

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
          gap: 50,
          padding: 20,
        }}
      >
        {/* Dartboard mit aktuellem Ziel */}
        <div style={{ position: 'relative' }}>
          <ATBDartboard
            currentTarget={nextTargetNumber}
            players={dartboardPlayers}
            size={420}
            activePlayerColor={activePlayerColor}
            pendingMultipliers={pendingMultipliers}
          />

          {/* Aktuelles Ziel groß unter der Dartscheibe */}
          {activePlayer && nextTargetLabel && (
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
                {activePlayer.name} - Ziel:
              </div>
              <div
                style={{
                  fontSize: 56,
                  fontWeight: 700,
                  color: c.ledOn,
                  textShadow: `0 0 25px ${c.ledGlow}`,
                }}
              >
                {nextTargetLabel}
              </div>
              {/* Spezialregel-Status */}
              {activeSpecialState?.needsBull && (
                <div style={{ fontSize: 16, color: c.yellow, marginTop: 8, fontWeight: 600 }}>
                  🎯 Bull benötigt!
                </div>
              )}
              {activeSpecialState?.mustUseDouble && (
                <div style={{ fontSize: 16, color: c.yellow, marginTop: 8, fontWeight: 600 }}>
                  🎯 Double erforderlich!
                </div>
              )}
              {activeSpecialState?.consecutiveMisses !== undefined && activeSpecialState.consecutiveMisses > 0 && (
                <div style={{ fontSize: 14, color: c.red, marginTop: 8 }}>
                  ⚠️ Misses: {activeSpecialState.consecutiveMisses}/3
                </div>
              )}
            </div>
          )}
        </div>

        {/* Rechte Seite: Spieler + Controls */}
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
                  style={{
                    width: 70,
                    height: 44,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: 8,
                    fontWeight: 700,
                    fontSize: 16,
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
              {/* Undo Button - macht letzten kompletten Zug rückgängig */}
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
                title="Letzten Zug rückgängig"
              >
                ↶
              </button>
            </div>

            {/* Aktuelle Würfe */}
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
                    {dart ? formatDart(dart) : '—'}
                  </div>
                )
              })}
            </div>

            <div style={{ fontSize: 11, color: c.textDim, marginTop: 12, textAlign: 'center' }}>
              [Space] Treffer · [S/D/T] Multiplier · [0] Miss · [Enter] Bestätigen
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
              {state.match.players.map((p, index) => {
                const isActive = p.playerId === activePlayerId
                const progress = getPreviewIndex(p.playerId)
                const targetLabel = getPreviewTargetLabel(p.playerId)
                const darts = state.dartsUsedByPlayer[p.playerId] ?? 0
                const percent = (progress / totalFields) * 100
                const color = playerColors[p.playerId] ?? PLAYER_COLORS[index % PLAYER_COLORS.length]
                const playerSpecial = state.specialStateByPlayer[p.playerId]

                return (
                  <div
                    key={p.playerId}
                    style={{
                      padding: '10px 12px',
                      borderRadius: 8,
                      background: isActive ? '#1a1a1a' : 'transparent',
                      borderLeft: `4px solid ${color}`,
                      boxShadow: isActive ? `0 0 20px ${color}30` : 'none',
                      opacity: playerSpecial?.eliminated ? 0.4 : 1,
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
                          {playerSpecial?.eliminated && <span style={{ marginLeft: 6, color: c.red }}>✗</span>}
                        </span>
                      </div>
                      <span style={{ fontSize: 12, color: c.textDim }}>
                        {darts} Darts
                      </span>
                    </div>

                    {/* Progress Bar */}
                    <div style={{ height: 6, background: '#333', borderRadius: 3, overflow: 'hidden', marginBottom: 4 }}>
                      <div
                        style={{
                          height: '100%',
                          width: `${percent}%`,
                          background: color,
                          boxShadow: `0 0 6px ${color}`,
                          transition: 'width 0.3s',
                        }}
                      />
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: c.textDim }}>
                      <span>{progress} / {totalFields}</span>
                      <span style={{ color }}>
                        {playerSpecial?.eliminated ? 'Ausgeschieden' : targetLabel ?? '✓ Fertig'}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Speichern-Indikator */}
      {saving && (
        <div style={{ fontSize: 13, color: c.textDim, padding: '8px 0', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <span style={{ display: 'inline-block', width: 14, height: 14, border: '2px solid currentColor', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          Speichern...
        </div>
      )}

      {/* Leg-Zusammenfassung (Intermission) */}
      {intermission && (
        <LegIntermissionModal
          intermission={intermission}
          match={state.match}
          events={events}
          playerColors={state.match.players.map((p: any) => playerColors[p.playerId] ?? PLAYER_COLORS[0])}
          config={config}
          onContinue={() => {
            // Nächstes Leg starten
            const newEvents = [...events, ...intermission.pendingNextEvents]
            persistATBEvents(matchId, newEvents)
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

function LegIntermissionModal({
  intermission,
  match,
  events,
  playerColors,
  config,
  onContinue,
}: {
  intermission: ATBIntermission
  match: any
  events: ATBEvent[]
  playerColors: string[]
  config: ATBMatchConfig
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

  // Stats für dieses Leg berechnen
  const legStats = useMemo(() => {
    // Erstelle ein temporäres Match-Objekt für die Stats-Berechnung
    const tempMatch = {
      ...match,
      events,
    }
    return computeATBDetailedStats(tempMatch as any, intermission.legIndex - 1)
  }, [match, events, intermission.legIndex])

  // Leg-Score berechnen (kumulativ bis zu diesem Leg)
  const legWins: Record<string, number> = {}
  match.players.forEach((p: any) => { legWins[p.playerId] = 0 })

  for (const ev of events) {
    if (ev.type === 'ATBLegFinished') {
      const wid = (ev as any).winnerId
      if (wid in legWins) legWins[wid]++
    }
  }
  const legScore = match.players.map((p: any) => legWins[p.playerId]).join(' : ')

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

        {/* Statistiken */}
        {legStats.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#9ca3af', marginBottom: 12 }}>
              Leg-Statistik
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '8px 0', borderBottom: '1px solid #333', color: '#6b7280' }}></th>
                  {legStats.map((ps, idx) => (
                    <th
                      key={ps.playerId}
                      style={{
                        textAlign: 'right',
                        padding: '8px 0',
                        borderBottom: '1px solid #333',
                        color: playerColors[idx % playerColors.length],
                        fontWeight: 700,
                      }}
                    >
                      {ps.playerName}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={{ padding: '6px 0', color: '#9ca3af' }}>Darts</td>
                  {legStats.map((ps) => (
                    <td key={ps.playerId} style={{ textAlign: 'right', padding: '6px 0', fontWeight: 600 }}>
                      {ps.totalDarts}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td style={{ padding: '6px 0', color: '#9ca3af' }}>Ø Darts/Feld</td>
                  {legStats.map((ps) => (
                    <td key={ps.playerId} style={{ textAlign: 'right', padding: '6px 0', fontWeight: 600 }}>
                      {ps.avgDartsPerField.toFixed(2)}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td style={{ padding: '6px 0', color: '#9ca3af' }}>Triples</td>
                  {legStats.map((ps) => (
                    <td key={ps.playerId} style={{ textAlign: 'right', padding: '6px 0', color: '#f97316', fontWeight: 600 }}>
                      {ps.triples}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td style={{ padding: '6px 0', color: '#9ca3af' }}>Doubles</td>
                  {legStats.map((ps) => (
                    <td key={ps.playerId} style={{ textAlign: 'right', padding: '6px 0', color: '#0ea5e9', fontWeight: 600 }}>
                      {ps.doubles}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td style={{ padding: '6px 0', color: '#9ca3af' }}>Misses</td>
                  {legStats.map((ps) => (
                    <td key={ps.playerId} style={{ textAlign: 'right', padding: '6px 0', color: '#ef4444' }}>
                      {ps.misses}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td style={{ padding: '6px 0', color: '#9ca3af' }}>Hit Rate</td>
                  {legStats.map((ps) => {
                    const hitRate = ps.totalDarts > 0 ? ((ps.totalDarts - ps.misses) / ps.totalDarts) * 100 : 0
                    return (
                      <td key={ps.playerId} style={{ textAlign: 'right', padding: '6px 0', color: '#22c55e', fontWeight: 600 }}>
                        {hitRate.toFixed(1)}%
                      </td>
                    )
                  })}
                </tr>
                <tr>
                  <td style={{ padding: '6px 0', color: '#9ca3af' }}>First-Dart-Hit</td>
                  {legStats.map((ps) => (
                    <td key={ps.playerId} style={{ textAlign: 'right', padding: '6px 0', fontWeight: 600 }}>
                      {ps.firstDartHitRate.toFixed(1)}%
                    </td>
                  ))}
                </tr>
                <tr>
                  <td style={{ padding: '6px 0', color: '#9ca3af' }}>Bestes Feld</td>
                  {legStats.map((ps) => (
                    <td key={ps.playerId} style={{ textAlign: 'right', padding: '6px 0', color: '#22c55e', fontSize: 12 }}>
                      {ps.bestField ? `${ps.bestField.field} (${ps.bestField.darts}D)` : '—'}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td style={{ padding: '6px 0', color: '#9ca3af' }}>Schwerstes Feld</td>
                  {legStats.map((ps) => (
                    <td key={ps.playerId} style={{ textAlign: 'right', padding: '6px 0', color: '#ef4444', fontSize: 12 }}>
                      {ps.worstField ? `${ps.worstField.field} (${ps.worstField.darts}D)` : '—'}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
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
          Weiter zum nächsten Leg →
        </button>
      </div>
    </div>
  )
}
