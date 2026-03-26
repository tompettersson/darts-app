// src/auth/AuthContext.tsx
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { verifyPassword, logoutSession, validateSession, updateProfileSettings, type ProfileSettings } from './api'

export type AuthUser = {
  profileId: string
  name: string
  isAdmin: boolean
  isGuest: boolean
  sessionToken?: string
}

/** A player verified on this device (co-authenticated) */
export type VerifiedPlayer = {
  profileId: string
  name: string
  color?: string
}

type AuthContextType = {
  user: AuthUser | null
  login: (profileId: string, name: string, password: string, isAdmin: boolean) => Promise<boolean>
  loginAsGuest: () => void
  /** Dev-only: Login ohne Auth-Server (nur auf localhost) */
  devLogin: (profileId: string, name: string, isAdmin: boolean) => void
  logout: () => void
  /** Update a profile setting (syncs to server + localStorage) */
  updateSetting: <K extends keyof ProfileSettings>(key: K, value: ProfileSettings[K]) => void
  isLoggedIn: boolean
  isAdmin: boolean
  isGuest: boolean
  /** All players verified on this device (main user + co-authenticated) */
  verifiedPlayers: VerifiedPlayer[]
  /** Add a player to the verified list (after password check during game start) */
  addVerifiedPlayer: (player: VerifiedPlayer) => void
  /** Check if a player is already verified on this device */
  isPlayerVerified: (profileId: string) => boolean
  /** Remove a single co-authenticated player */
  removeVerifiedPlayer: (profileId: string) => void
}

const LS_KEY = 'darts-auth-user'
const LS_VERIFIED = 'darts-verified-players'

/** Dev-Bypass: auf localhost Login ohne Auth-Server erlauben */
export const IS_DEV_BYPASS = typeof window !== 'undefined' && window.location.hostname === 'localhost'

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => {
    try {
      const stored = localStorage.getItem(LS_KEY)
      if (stored) return JSON.parse(stored)
    } catch {}
    return null
  })

  const [verifiedPlayers, setVerifiedPlayers] = useState<VerifiedPlayer[]>(() => {
    try {
      const stored = localStorage.getItem(LS_VERIFIED)
      if (stored) return JSON.parse(stored)
    } catch {}
    return []
  })

  // Persist user to LocalStorage
  useEffect(() => {
    if (user && !user.isGuest) {
      localStorage.setItem(LS_KEY, JSON.stringify(user))
    } else {
      localStorage.removeItem(LS_KEY)
    }
  }, [user])

  // Persist verified players to LocalStorage
  useEffect(() => {
    if (verifiedPlayers.length > 0) {
      localStorage.setItem(LS_VERIFIED, JSON.stringify(verifiedPlayers))
    } else {
      localStorage.removeItem(LS_VERIFIED)
    }
  }, [verifiedPlayers])

  // Apply profile settings to localStorage (so existing readers still work)
  const applySettings = useCallback((settings: ProfileSettings) => {
    if (settings.theme) localStorage.setItem('darts-theme', settings.theme)
    if (settings.voiceLang) localStorage.setItem('darts-voice-lang', settings.voiceLang)
    if (settings.playerColorBg !== undefined) localStorage.setItem('darts-player-color-bg', JSON.stringify(settings.playerColorBg))
  }, [])

  // Validate stored session on app start (skip on localhost dev bypass)
  useEffect(() => {
    if (!user?.sessionToken || user.isGuest) return
    if (IS_DEV_BYPASS && user.sessionToken === 'dev-bypass') return
    validateSession(user.sessionToken).then(result => {
      if (!result.valid) {
        console.warn('[Auth] Session ungültig — bitte erneut anmelden')
        setUser(null)
        setVerifiedPlayers([])
        localStorage.removeItem(LS_KEY)
        localStorage.removeItem(LS_VERIFIED)
      } else if (result.settings) {
        applySettings(result.settings)
      }
    }).catch(() => {})
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const login = useCallback(async (profileId: string, name: string, password: string, isAdmin: boolean): Promise<boolean> => {
    try {
      const result = await verifyPassword(profileId, password)
      if (result.valid && result.sessionToken) {
        setUser({ profileId, name, isAdmin, isGuest: false, sessionToken: result.sessionToken })
        setVerifiedPlayers([{ profileId, name }])
        // Apply server settings to localStorage
        if (result.settings && Object.keys(result.settings).length > 0) {
          applySettings(result.settings)
        } else {
          // First login: migrate local settings to server
          const localSettings: ProfileSettings = {
            theme: (localStorage.getItem('darts-theme') as any) || undefined,
            voiceLang: localStorage.getItem('darts-voice-lang') || undefined,
            playerColorBg: localStorage.getItem('darts-player-color-bg') ? JSON.parse(localStorage.getItem('darts-player-color-bg')!) : undefined,
          }
          if (Object.values(localSettings).some(v => v !== undefined)) {
            updateProfileSettings(result.sessionToken, localSettings).catch(() => {})
          }
        }
        return true
      }
      return false
    } catch (e) {
      console.error('[Auth] Login failed:', e)
      return false
    }
  }, [])

  const loginAsGuest = useCallback(() => {
    setUser({ profileId: 'guest', name: 'Gast', isAdmin: false, isGuest: true })
    setVerifiedPlayers([])
  }, [])

  const devLogin = useCallback((profileId: string, name: string, isAdmin: boolean) => {
    if (!IS_DEV_BYPASS) return
    setUser({ profileId, name, isAdmin, isGuest: false, sessionToken: 'dev-bypass' })
    setVerifiedPlayers([{ profileId, name }])
  }, [])

  const logout = useCallback(async () => {
    if (user?.sessionToken) {
      try { await logoutSession(user.sessionToken) } catch {}
    }
    setUser(null)
    setVerifiedPlayers([])
    localStorage.removeItem(LS_KEY)
    localStorage.removeItem(LS_VERIFIED)
  }, [user])

  const updateSetting = useCallback(<K extends keyof ProfileSettings>(key: K, value: ProfileSettings[K]) => {
    // Apply locally immediately
    const settings: ProfileSettings = { [key]: value }
    applySettings(settings)
    // Sync to server (fire-and-forget)
    if (user?.sessionToken && !user.isGuest && user.sessionToken !== 'dev-bypass') {
      // Read all current settings from localStorage, merge, send
      const current: ProfileSettings = {
        theme: (localStorage.getItem('darts-theme') as any) || undefined,
        voiceLang: localStorage.getItem('darts-voice-lang') || undefined,
        playerColorBg: localStorage.getItem('darts-player-color-bg') ? JSON.parse(localStorage.getItem('darts-player-color-bg')!) : undefined,
      }
      updateProfileSettings(user.sessionToken, { ...current, ...settings }).catch(() => {})
    }
  }, [user, applySettings])

  const addVerifiedPlayer = useCallback((player: VerifiedPlayer) => {
    setVerifiedPlayers(prev => {
      if (prev.some(p => p.profileId === player.profileId)) return prev
      return [...prev, player]
    })
  }, [])

  const isPlayerVerified = useCallback((profileId: string): boolean => {
    return verifiedPlayers.some(p => p.profileId === profileId)
  }, [verifiedPlayers])

  const removeVerifiedPlayer = useCallback((profileId: string) => {
    setVerifiedPlayers(prev => prev.filter(p => p.profileId !== profileId))
  }, [])

  const value: AuthContextType = {
    user,
    login,
    loginAsGuest,
    devLogin,
    logout,
    updateSetting,
    isLoggedIn: !!user && !user.isGuest,
    isAdmin: !!user?.isAdmin,
    isGuest: !!user?.isGuest,
    verifiedPlayers,
    addVerifiedPlayer,
    isPlayerVerified,
    removeVerifiedPlayer,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
