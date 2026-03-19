// src/hooks/useGameState.ts
// Shared game state management hook used by all game screens.
// Eliminates duplicated pause, timer, speech, and visibility logic.

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useTheme } from '../ThemeProvider'
import {
  isMatchPaused,
  clearMatchPaused,
  getMatchElapsedTime,
  setMatchElapsedTime,
} from '../storage'
import { initSpeech, setSpeechEnabled, isSpeechEnabled } from '../speech'

type GameType = 'x01' | 'cricket' | 'atb' | 'str' | 'highscore' | 'ctf' | 'shanghai' | 'killer' | 'bobs27' | 'operation'

interface UseGameStateOptions {
  matchId: string
  mode: GameType
  /** Truthy if the match is finished (can be object or boolean) */
  finished: unknown
}

export function useGameState({ matchId, mode, finished }: UseGameStateOptions) {
  // Pause management
  const [gamePaused, setGamePaused] = useState(() => isMatchPaused(matchId, mode))

  useEffect(() => {
    if (!gamePaused) {
      clearMatchPaused(matchId, mode)
    }
  }, [gamePaused, matchId, mode])

  // Auto-pause on tab switch
  useEffect(() => {
    const handle = () => {
      if (document.hidden) setGamePaused(true)
    }
    document.addEventListener('visibilitychange', handle)
    return () => document.removeEventListener('visibilitychange', handle)
  }, [])

  // Speech / Mute
  const [muted, setMuted] = useState(() => !isSpeechEnabled())

  useEffect(() => {
    initSpeech()
  }, [])

  useEffect(() => {
    setSpeechEnabled(!muted)
  }, [muted])

  // Timer (+100ms interval)
  const [elapsedMs, setElapsedMs] = useState(() => getMatchElapsedTime(matchId, mode))

  useEffect(() => {
    if (gamePaused || !!finished) return
    const timer = setInterval(() => {
      setElapsedMs(prev => prev + 100)
    }, 100)
    return () => clearInterval(timer)
  }, [gamePaused, !!finished])

  // Persist elapsed time periodically
  useEffect(() => {
    if (gamePaused || !!finished) return
    const persist = setInterval(() => {
      setMatchElapsedTime(matchId, mode, elapsedMs)
    }, 5000)
    return () => clearInterval(persist)
  }, [gamePaused, finished, matchId, mode, elapsedMs])

  return {
    gamePaused,
    setGamePaused,
    muted,
    setMuted,
    elapsedMs,
    setElapsedMs,
  }
}

export function useGameColors() {
  const { isArcade, colors } = useTheme()

  const c = useMemo(() => ({
    bg: colors.bg,
    cardBg: colors.bgCard,
    ledOn: colors.ledOn,
    ledGlow: colors.ledGlow,
    green: colors.success,
    red: colors.error,
    textDim: colors.fgDim,
    textBright: colors.fg,
    yellow: colors.scoreYellow,
    border: colors.border,
    accent: colors.accent,
  }), [colors])

  return { c, isArcade, colors }
}
