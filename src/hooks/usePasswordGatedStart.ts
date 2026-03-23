// src/hooks/usePasswordGatedStart.ts
// Shared hook: require password verification before starting a game
import { useState, useCallback } from 'react'
import { useAuth } from '../auth/AuthContext'

type PlayerInfo = {
  id: string
  name: string
  color?: string
}

/**
 * Hook that gates game start behind password verification.
 * Returns:
 * - `pendingPlayers`: players that need verification (null if no verification needed)
 * - `requestStart(players, onConfirmed)`: call instead of directly starting the game
 * - `onVerified()`: call when PasswordVerifyModal succeeds
 * - `onCancelled()`: call when PasswordVerifyModal is cancelled
 * - `skipPlayerId`: the logged-in user's ID (skip their verification)
 * - `isGuest`: whether current user is a guest
 */
export function usePasswordGatedStart() {
  const auth = useAuth()
  const [pendingPlayers, setPendingPlayers] = useState<PlayerInfo[] | null>(null)
  const [onConfirmedCallback, setOnConfirmedCallback] = useState<(() => void) | null>(null)

  const requestStart = useCallback((players: PlayerInfo[], onConfirmed: () => void) => {
    // Filter players that need verification
    const needsVerify = players.filter(
      p => p.id !== auth.user?.profileId && !p.id.startsWith('guest-') && !p.id.startsWith('temp-')
    )

    if (needsVerify.length === 0) {
      // No verification needed — start immediately
      onConfirmed()
    } else {
      // Show verification modal
      setPendingPlayers(players)
      setOnConfirmedCallback(() => onConfirmed)
    }
  }, [auth.user?.profileId])

  const onVerified = useCallback(() => {
    setPendingPlayers(null)
    onConfirmedCallback?.()
    setOnConfirmedCallback(null)
  }, [onConfirmedCallback])

  const onCancelled = useCallback(() => {
    setPendingPlayers(null)
    setOnConfirmedCallback(null)
  }, [])

  return {
    pendingPlayers,
    requestStart,
    onVerified,
    onCancelled,
    skipPlayerId: auth.user?.profileId,
    isGuest: auth.isGuest,
  }
}
