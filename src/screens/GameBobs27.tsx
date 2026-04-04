// src/screens/GameBobs27.tsx
// Live-Spielscreen fuer Bob's 27 Darts Training
// D1-D20 nacheinander, 3 Darts pro Target. HIT / MISS Buttons.
// Score: Start 27, Treffer +Doppelwert, Fehler -Doppelwert, < 0 = Game Over.

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { isMatchFinishedInDB } from '../db/storage'
import { useGameState, useGameColors } from '../hooks/useGameState'
import {
  getBobs27MatchById,
  persistBobs27Events,
  finishBobs27Match,
  setMatchPaused,
  setMatchElapsedTime,
  deleteBobs27Match,
  ensureBobs27MatchExists,
} from '../storage'
import {
  applyBobs27Events,
  recordBobs27Throw,
  getActivePlayerId,
  getCurrentTarget,
  formatDuration,
  id as bobs27Id,
  now as bobs27Now,
  type Bobs27Event,
  type Bobs27ThrowResult,
} from '../dartsBobs27'
import GameControls, { PauseOverlay } from '../components/GameControls'
import { announceBobs27PlayerTurn, announceBobs27MustScore, announceGameStart, cancelDebouncedAnnounce, debouncedAnnounce } from '../speech'
import { PLAYER_COLORS } from '../playerColors'
import { useDisableScale } from '../components/ScaleWrapper'

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

export default function GameBobs27({ matchId, onExit, onShowSummary, multiplayer }: Props) {
  useDisableScale()
  const { c, isArcade, colors } = useGameColors()

  const [storedMatch, setStoredMatch] = useState(() => getBobs27MatchById(matchId))
  const [events, setEvents] = useState<Bobs27Event[]>(storedMatch?.events ?? [])

  // Retry loading match if not found yet (multiplayer: match created by host, may not be in cache yet)
  useEffect(() => {
    if (storedMatch) return
    const timer = setInterval(() => {
      const found = getBobs27MatchById(matchId)
      if (found) { setStoredMatch(found); setEvents(found.events as Bobs27Event[]); clearInterval(timer) }
    }, 500)
    return () => clearInterval(timer)
  }, [matchId, storedMatch])

  // State aus Events ableiten (vor useGameState, da finished benoetigt wird)
  const state = useMemo(() => applyBobs27Events(events), [events])

  const { gamePaused, setGamePaused, muted, setMuted, elapsedMs, setElapsedMs } = useGameState({
    matchId,
    mode: 'bobs27',
    finished: state.finished,
  })

  // Delta-Animation
  const [deltaFlash, setDeltaFlash] = useState<{ value: number; key: number } | null>(null)

  // Match-End delay
  const [matchEndDelay, setMatchEndDelay] = useState(false)
  const [saving, setSaving] = useState(false)

  const players = state.match?.players ?? []
  const activePlayerId = getActivePlayerId(state)
  const activePlayer = players.find(p => p.playerId === activePlayerId)
  const activePlayerState = activePlayerId ? state.playerStates[activePlayerId] : null
  const currentTarget = activePlayerId ? getCurrentTarget(state, activePlayerId) : null

  // Multiplayer: Ist der lokale Spieler gerade am Zug?
  const bobsLocalIds = multiplayer?.localPlayerIds ?? (multiplayer?.myPlayerId ? [multiplayer.myPlayerId] : [])
  const isMyTurn = !multiplayer?.enabled || (activePlayerId != null && bobsLocalIds.includes(activePlayerId))

  // Safety-Net: Erkennt wenn alle Spieler fertig sind aber kein MatchFinished generiert wurde
  useEffect(() => {
    if (!state.match || state.finished || matchEndDelay) return
    if (events.length <= 1) return // Nur MatchStarted vorhanden

    // Pruefen ob alle Spieler fertig sind (eliminiert oder alle Targets gespielt)
    const allDone = state.match.players.every(p => {
      const ps = state.playerStates[p.playerId]
      return ps?.finished === true
    })
    if (!allDone) return

    console.warn('[GameBobs27] Safety-Net: Alle Spieler fertig aber kein MatchFinished — generiere Event')

    // finalScores berechnen
    const finalScores: Record<string, number> = {}
    for (const p of state.match.players) {
      finalScores[p.playerId] = state.playerStates[p.playerId]?.score ?? 0
    }

    // Ranking: Fortschritt (Targets) absteigend, dann Score absteigend
    const ranking = state.match.players.map(p => {
      const ps = state.playerStates[p.playerId]
      return {
        pid: p.playerId,
        progress: ps?.eliminated ? (ps.eliminatedAtTarget ?? 0) : (ps?.currentTargetIndex ?? 0),
        score: finalScores[p.playerId] ?? 0,
      }
    }).sort((a, b) => b.progress - a.progress || b.score - a.score)

    let winnerId: string | null = ranking[0]?.pid ?? null
    if (ranking.length > 1 &&
        ranking[0].progress === ranking[1].progress &&
        ranking[0].score === ranking[1].score) {
      winnerId = null
    }

    const totalDarts = Object.values(state.playerStates).reduce((s, ps) => s + ps.totalDarts, 0)
    const durationMs = Date.now() - state.startTime

    const finishEvent: Bobs27Event = {
      type: 'Bobs27MatchFinished',
      eventId: bobs27Id(),
      matchId: state.match.matchId,
      ts: bobs27Now(),
      winnerId,
      totalDarts,
      durationMs,
      finalScores,
    }

    const updatedEvents = [...events, finishEvent]
    setEvents(updatedEvents)
    setMatchEndDelay(true)
    // Persist + finish must complete before navigating to summary
    setSaving(true)
    ;(async () => {
      try {
        await persistBobs27Events(matchId, updatedEvents)
        await finishBobs27Match(matchId, winnerId, totalDarts, elapsedMs, finalScores)
      } catch (err) {
        console.warn('[Bobs27] Persist failed:', err)
      } finally {
        setSaving(false)
      }
      setTimeout(() => onShowSummary(matchId), 2000)
    })()
  }, [state, events, matchId, matchEndDelay, elapsedMs, onShowSummary])

  // Multiplayer: Remote-Events synchronisieren
  const prevRemoteBobs27Ref = useRef<any[] | null>(null)
  useEffect(() => {
    if (!multiplayer?.remoteEvents) return
    if (multiplayer.remoteEvents === prevRemoteBobs27Ref.current) return
    const prevEvents = prevRemoteBobs27Ref.current as any[] | null
    prevRemoteBobs27Ref.current = multiplayer.remoteEvents
    const remote = multiplayer.remoteEvents as Bobs27Event[]
    setEvents(remote)
    persistBobs27Events(matchId, remote)
    // Detect MatchFinished: only trigger when NEW
    const matchFinishedEvt = remote.find((e: any) => e.type === 'Bobs27MatchFinished') as any
    const prevHadFinished = prevEvents ? prevEvents.some((e: any) => e.type === 'Bobs27MatchFinished') : false
    if (matchFinishedEvt && !prevHadFinished) {
      setMatchEndDelay(true)
      if (multiplayer?.isHost) {
        // Host persists immediately
        ;(async () => {
          try { await persistBobs27Events(matchId, remote) } catch {}
          await finishBobs27Match(matchId, matchFinishedEvt.winnerId, matchFinishedEvt.totalDarts, matchFinishedEvt.durationMs, matchFinishedEvt.finalScores)
          if (onShowSummary) setTimeout(() => onShowSummary(matchId), 2000)
        })()
      } else {
        // Guest: persist as backup after 5s (in case host disconnected before saving)
        setTimeout(async () => {
          try {
            // Skip if host already saved
            if (await isMatchFinishedInDB('bobs27_matches', matchId)) return
            await persistBobs27Events(matchId, remote)
            await finishBobs27Match(matchId, matchFinishedEvt.winnerId, matchFinishedEvt.totalDarts, matchFinishedEvt.durationMs, matchFinishedEvt.finalScores)
          } catch {}
        }, 5000)
        if (onShowSummary) setTimeout(() => onShowSummary(matchId), 2000)
      }
    }
    // Ensure match exists locally for guest
    if (remote.length > 0) {
      const startEvt = remote.find((e: any) => e.type === 'Bobs27MatchStarted') as any
      if (startEvt) {
        ensureBobs27MatchExists(matchId, remote, startEvt.players?.map((p: any) => p.playerId) ?? [])
      }
    }
  }, [multiplayer?.remoteEvents]) // eslint-disable-line react-hooks/exhaustive-deps

  // Sprachausgabe: Spieler + Score + Ziel ansagen bei Spielerwechsel/Target-Wechsel
  const lastAnnouncedKeyRef = React.useRef<string>('')
  const gameOnAnnouncedRef = React.useRef(false)

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

  useEffect(() => {
    if (!activePlayer || !activePlayerState || !currentTarget) return
    if (state.finished || gamePaused || matchEndDelay) return

    const key = `${activePlayer.playerId}-${currentTarget.fieldNumber}`

    // "Must score"-Warnung: Nur bei allowNegative=false, wenn Score < doubleValue
    const mustScore = state.match && !state.match.config.allowNegative &&
      activePlayerState.score < currentTarget.doubleValue

    // Beim allerersten Mal "Game On!" ansagen, danach den Turn
    if (!gameOnAnnouncedRef.current) {
      gameOnAnnouncedRef.current = true
      announceGameStart(activePlayer.name)
      lastAnnouncedKeyRef.current = key
      // Kurz danach den Turn ansagen
      scheduleSpeech(() => {
        announceBobs27PlayerTurn(activePlayer.name, activePlayerState.score, currentTarget.label)
        if (mustScore) announceBobs27MustScore()
      }, 1500)
      return
    }

    if (key !== lastAnnouncedKeyRef.current) {
      lastAnnouncedKeyRef.current = key
      debouncedAnnounce(() => {
        announceBobs27PlayerTurn(activePlayer.name, activePlayerState.score, currentTarget.label)
        if (mustScore) announceBobs27MustScore()
      })
    }
  }, [activePlayer, activePlayerState, currentTarget, state.finished, gamePaused, matchEndDelay, state.match])

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

  // Wurf aufnehmen (HIT oder MISS)
  const doThrow = useCallback((hit: boolean) => {
    if (gamePaused || state.finished || matchEndDelay) return
    if (!activePlayerId || !state.match) return
    // Multiplayer: Nur eigene Würfe eingeben
    if (multiplayer?.enabled && !isMyTurn) return

    const result: Bobs27ThrowResult = recordBobs27Throw(state, activePlayerId, hit)

    const newEvents: Bobs27Event[] = [result.throwEvent]
    if (result.targetFinished) {
      newEvents.push(result.targetFinished)

      // Delta-Animation
      setDeltaFlash({ value: result.targetFinished.delta, key: Date.now() })
    }
    if (result.matchFinished) {
      newEvents.push(result.matchFinished)
    }

    const updatedEvents = [...events, ...newEvents]
    setEvents(updatedEvents)

    // Multiplayer: Events senden
    if (multiplayer?.enabled) {
      multiplayer.submitEvents(newEvents)
    }

    // Match beendet?
    if (result.matchFinished) {
      setMatchEndDelay(true)
      // Persist + finish must complete before navigating to summary
      setSaving(true)
      ;(async () => {
        try {
          await persistBobs27Events(matchId, updatedEvents)
          await finishBobs27Match(
            matchId,
            result.matchFinished!.winnerId,
            result.matchFinished!.totalDarts,
            elapsedMs,
            result.matchFinished!.finalScores
          )
        } catch (err) {
          console.warn('[Bobs27] Persist failed:', err)
        } finally {
          setSaving(false)
        }
        setTimeout(() => onShowSummary(matchId), 2000)
      })()
    } else {
      persistBobs27Events(matchId, updatedEvents)
    }
  }, [events, state, activePlayerId, gamePaused, matchEndDelay, matchId, elapsedMs, onShowSummary, multiplayer, isMyTurn])

  // Undo: Letzten Wurf rueckgaengig machen
  const undoLast = useCallback(() => {
    if (gamePaused || state.finished || matchEndDelay) return
    if (events.length <= 1) return // Mindestens MatchStarted behalten

    // Finde letztes Throw-Event und entferne alles ab dort
    let cutIndex = events.length
    for (let i = events.length - 1; i >= 0; i--) {
      if (events[i].type === 'Bobs27Throw') {
        cutIndex = i
        break
      }
    }

    if (cutIndex === events.length) return

    // Ausstehende Sprachansagen abbrechen
    clearSpeechTimers()
    cancelDebouncedAnnounce()

    const trimmed = events.slice(0, cutIndex)
    setEvents(trimmed)
    persistBobs27Events(matchId, trimmed)
    setDeltaFlash(null)

    // Multiplayer: Undo senden
    if (multiplayer?.enabled) {
      multiplayer.undo(events.length - cutIndex)
    }
  }, [events, gamePaused, state.finished, matchEndDelay, matchId, multiplayer])

  // Tastatur-Steuerung
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (gamePaused && e.key !== 'Escape') return
      if (state.finished || matchEndDelay) return

      switch (e.key) {
        case ' ':
        case 'Enter':
          e.preventDefault()
          doThrow(true)
          break
        case '0':
        case 'm':
        case 'M':
          e.preventDefault()
          doThrow(false)
          break
        case 'Backspace':
          e.preventDefault()
          undoLast()
          break
        case 'Escape':
          e.preventDefault()
          setGamePaused(p => !p)
          break
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [doThrow, undoLast, gamePaused, state.finished, matchEndDelay])

  // Pause-Handler
  const handlePause = () => {
    setGamePaused(true)
    setMatchPaused(matchId, 'bobs27', true)
    setMatchElapsedTime(matchId, 'bobs27', elapsedMs)
  }

  const handleResume = () => setGamePaused(false)

  const handleExitMatch = () => {
    setMatchElapsedTime(matchId, 'bobs27', elapsedMs)
    setMatchPaused(matchId, 'bobs27', true)
    onExit()
  }

  const handleDeleteMatch = () => {
    deleteBobs27Match(matchId)
    onExit()
  }

  // Aktueller Spieler-Index fuer Farbe
  const activePlayerIndex = players.findIndex(p => p.playerId === activePlayerId)
  const playerColor = PLAYER_COLORS[activePlayerIndex % PLAYER_COLORS.length] ?? c.accent

  const isMulti = players.length > 1

  // Sidebar-Reihenfolge: naechster Spieler oben, gerade gespielter unten
  // Alle Spieler ausser dem aktiven, rotiert ab currentPlayerIndex+1
  const sidebarPlayers = useMemo(() => {
    if (!isMulti) return []
    const count = players.length
    const result: { player: typeof players[0]; index: number }[] = []
    for (let offset = 1; offset < count; offset++) {
      const idx = (state.currentPlayerIndex + offset) % count
      result.push({ player: players[idx], index: idx })
    }
    return result
  }, [players, state.currentPlayerIndex, isMulti])

  return (
    <div style={{ background: c.bg, minHeight: '100dvh', color: c.textBright }}>
      {/* Pause Overlay */}
      {gamePaused && (
        <PauseOverlay
          onResume={handleResume}
        />
      )}

      {/* Header: Score + Timer + Controls */}
      <div style={{
        display: 'flex', justifyContent: 'center',
        borderBottom: `1px solid ${c.border}`,
      }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '8px 12px',
          width: isMulti ? 600 : 440,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 13, color: c.textDim }}>Bob's 27</span>
            <span style={{ fontSize: 13, fontFamily: 'monospace', color: c.textDim }}>
              {formatDuration(elapsedMs)}
            </span>
          </div>
          <GameControls
            isPaused={gamePaused}
            onTogglePause={() => {
              if (gamePaused) handleResume()
              else handlePause()
            }}
            isMuted={muted}
            onToggleMute={() => setMuted(m => !m)}
            onExit={handleExitMatch}
            title={`Bob's 27${multiplayer?.enabled && multiplayer.roomCode ? ` · ${multiplayer.roomCode}` : ''}`}
          />
        </div>
      </div>

      {/* Layout: zentrierte Gruppe aus Content + Sidebar */}
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        minHeight: 'calc(100dvh - 50px)',
      }}>
        {/* Haupt-Content */}
        <div style={{
          width: 440,
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          padding: '16px 12px', gap: 16,
        }}>
          {/* Aktueller Spieler */}
          {activePlayer && isMulti && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <div style={{
                width: 12, height: 12, borderRadius: '50%',
                background: playerColor,
              }} />
              <div style={{ fontSize: 22, fontWeight: 800, color: playerColor }}>
                {activePlayer.name}
              </div>
            </div>
          )}

          {/* Score gross */}
          <div style={{
            fontSize: 64, fontWeight: 800, color: c.textBright,
            lineHeight: 1, position: 'relative',
          }}>
            {activePlayerState?.score ?? state.match?.config.startScore ?? 27}

            {/* Delta-Animation */}
            {deltaFlash && (
              <div key={deltaFlash.key} style={{
                position: 'absolute', top: -8, right: -60,
                fontSize: 28, fontWeight: 700,
                color: deltaFlash.value >= 0 ? c.green : c.red,
                animation: 'fadeUp 1.5s forwards',
              }}>
                {deltaFlash.value >= 0 ? `+${deltaFlash.value}` : deltaFlash.value}
              </div>
            )}
          </div>

          {/* Aktuelles Target */}
          {currentTarget && !state.finished && (
            <div style={{
              background: c.cardBg, border: `2px solid ${c.accent}`,
              borderRadius: 12, padding: '12px 24px', textAlign: 'center',
            }}>
              <div style={{ fontSize: 12, color: c.textDim, marginBottom: 2 }}>
                Ziel {(activePlayerState?.currentTargetIndex ?? 0) + 1}/{state.match?.targets.length ?? 20}
              </div>
              <div style={{ fontSize: 36, fontWeight: 800, color: c.accent }}>
                {currentTarget.label}
              </div>
              <div style={{ fontSize: 13, color: c.textDim, marginTop: 2 }}>
                Dart {activePlayerState?.currentDartNumber ?? 1}/{state.match?.config.dartsPerTarget ?? 3}
                {(activePlayerState?.hitsOnCurrentTarget ?? 0) > 0 && (
                  <span style={{ color: c.green, marginLeft: 8 }}>
                    {activePlayerState?.hitsOnCurrentTarget} Treffer
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Match beendet */}
          {(state.finished || matchEndDelay) && (
            <div style={{
              background: c.cardBg, border: `2px solid ${c.green}`,
              borderRadius: 12, padding: '16px 24px', textAlign: 'center',
            }}>
              <div style={{ fontSize: 24, fontWeight: 700, color: c.green }}>
                {activePlayerState?.eliminated ? 'Game Over!' : 'Geschafft!'}
              </div>
              {saving ? (
                <div style={{ fontSize: 13, color: c.textDim, marginTop: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                  <span style={{ display: 'inline-block', width: 14, height: 14, border: '2px solid currentColor', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                  Speichern...
                </div>
              ) : (
                <div style={{ fontSize: 14, color: c.textDim, marginTop: 4 }}>
                  Ergebnis wird geladen...
                </div>
              )}
            </div>
          )}

          {/* HIT / MISS Buttons */}
          {!state.finished && !matchEndDelay && currentTarget && (
            <div style={{ display: 'flex', gap: 12, width: '100%', maxWidth: 440 }}>
              <button
                onClick={() => doThrow(false)}
                style={{
                  flex: 1, padding: '20px 0', fontSize: 20, fontWeight: 700,
                  background: c.red + '20', border: `2px solid ${c.red}`,
                  color: c.red, borderRadius: 12, cursor: 'pointer',
                  touchAction: 'manipulation',
                }}
              >
                MISS
              </button>
              <button
                onClick={() => doThrow(true)}
                style={{
                  flex: 1, padding: '20px 0', fontSize: 20, fontWeight: 700,
                  background: c.green + '20', border: `2px solid ${c.green}`,
                  color: c.green, borderRadius: 12, cursor: 'pointer',
                  touchAction: 'manipulation',
                }}
              >
                HIT
              </button>
            </div>
          )}

          {/* Undo Button */}
          {!state.finished && !matchEndDelay && events.length > 1 && (
            <button
              onClick={undoLast}
              style={{
                padding: '6px 16px', fontSize: 12,
                background: 'transparent', border: `1px solid ${c.border}`,
                color: c.textDim, borderRadius: 6, cursor: 'pointer',
              }}
            >
              Undo
            </button>
          )}

          {/* Timeline: bisherige Targets */}
          {activePlayerState && activePlayerState.targetResults.length > 0 && (
            <div style={{
              width: '100%', maxWidth: 440, background: c.cardBg,
              borderRadius: 8, border: `1px solid ${c.border}`,
              overflow: 'hidden',
            }}>
              <div style={{
                padding: '6px 10px', fontSize: 11, fontWeight: 600,
                color: c.textDim, borderBottom: `1px solid ${c.border}`,
              }}>
                Verlauf
              </div>
              <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${c.border}` }}>
                      <th style={{ textAlign: 'left', padding: '4px 8px', color: c.textDim }}>Ziel</th>
                      <th style={{ textAlign: 'center', padding: '4px 8px', color: c.textDim }}>Treffer</th>
                      <th style={{ textAlign: 'right', padding: '4px 8px', color: c.textDim }}>Delta</th>
                      <th style={{ textAlign: 'right', padding: '4px 8px', color: c.textDim }}>Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...activePlayerState.targetResults].reverse().map((r, i) => (
                      <tr key={i} style={{ borderBottom: `1px solid ${c.border}` }}>
                        <td style={{ padding: '4px 8px', fontWeight: 500 }}>{r.target.label}</td>
                        <td style={{ textAlign: 'center', padding: '4px 8px' }}>
                          {r.hits > 0 ? (
                            <span style={{ color: c.green }}>{r.hits}/{r.dartsThrown}</span>
                          ) : (
                            <span style={{ color: c.red }}>0/{r.dartsThrown}</span>
                          )}
                        </td>
                        <td style={{
                          textAlign: 'right', padding: '4px 8px', fontWeight: 600,
                          color: r.delta >= 0 ? c.green : c.red,
                        }}>
                          {r.delta >= 0 ? `+${r.delta}` : r.delta}
                        </td>
                        <td style={{ textAlign: 'right', padding: '4px 8px', fontWeight: 600 }}>
                          {r.scoreAfter}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Tastatur-Hinweis */}
          <div style={{ fontSize: 10, color: c.textDim, textAlign: 'center', opacity: 0.6, marginTop: 8 }}>
            Space/Enter = HIT | 0/M = MISS | Backspace = Undo | Esc = Pause
          </div>
        </div>

        {/* Spieler-Sidebar rechts (nur Multiplayer) */}
        {isMulti && (
          <div style={{
            width: 160,
            borderLeft: `1px solid ${c.border}`,
            padding: '12px 8px',
            display: 'flex',
            flexDirection: 'column',
            gap: 0,
            flexShrink: 0,
          }}>
            <div style={{
              fontSize: 10, fontWeight: 600, color: c.textDim,
              textTransform: 'uppercase', letterSpacing: 1,
              marginBottom: 8, textAlign: 'center',
            }}>
              Wartend
            </div>

            {sidebarPlayers.map(({ player: p, index: i }) => {
              const ps = state.playerStates[p.playerId]
              const color = PLAYER_COLORS[i % PLAYER_COLORS.length]
              const isEliminated = ps?.eliminated ?? false
              const isFinished = ps?.finished ?? false
              const targetIdx = ps?.currentTargetIndex ?? 0
              const totalTargets = state.match?.targets.length ?? 20

              return (
                <div key={p.playerId} style={{
                  padding: '8px 10px',
                  borderBottom: `1px solid ${c.border}`,
                  opacity: isEliminated ? 0.4 : 1,
                  transition: 'all 0.3s ease',
                }}>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    marginBottom: 2,
                  }}>
                    <div style={{
                      width: 8, height: 8, borderRadius: '50%',
                      background: color, flexShrink: 0,
                    }} />
                    <div style={{
                      fontSize: 13, fontWeight: 600, color: color,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {p.name}
                    </div>
                  </div>
                  <div style={{
                    fontSize: 22, fontWeight: 800, color: c.textBright,
                    paddingLeft: 14,
                  }}>
                    {ps?.score ?? 27}
                  </div>
                  <div style={{
                    fontSize: 10, color: c.textDim,
                    paddingLeft: 14,
                  }}>
                    {isEliminated
                      ? '\u2620 Eliminiert'
                      : isFinished
                        ? '\u2714 Fertig'
                        : `D${state.match?.targets[targetIdx]?.fieldNumber ?? '?'} (${targetIdx + 1}/${totalTargets})`
                    }
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* CSS Animation */}
      <style>{`
        @keyframes fadeUp {
          0% { opacity: 1; transform: translateY(0); }
          100% { opacity: 0; transform: translateY(-30px); }
        }
      `}</style>
    </div>
  )
}
