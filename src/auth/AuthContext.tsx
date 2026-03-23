// src/auth/AuthContext.tsx
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { verifyPassword } from './api'

export type AuthUser = {
  profileId: string
  name: string
  isAdmin: boolean
  isGuest: boolean
}

type AuthContextType = {
  user: AuthUser | null
  login: (profileId: string, name: string, password: string, isAdmin: boolean) => Promise<boolean>
  loginAsGuest: () => void
  logout: () => void
  isLoggedIn: boolean
  isAdmin: boolean
  isGuest: boolean
}

const LS_KEY = 'darts-auth-user'

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => {
    try {
      const stored = localStorage.getItem(LS_KEY)
      if (stored) return JSON.parse(stored)
    } catch {}
    return null
  })

  // Persist to LocalStorage
  useEffect(() => {
    if (user && !user.isGuest) {
      localStorage.setItem(LS_KEY, JSON.stringify(user))
    } else {
      localStorage.removeItem(LS_KEY)
    }
  }, [user])

  const login = useCallback(async (profileId: string, name: string, password: string, isAdmin: boolean): Promise<boolean> => {
    try {
      const valid = await verifyPassword(profileId, password)
      if (valid) {
        setUser({ profileId, name, isAdmin, isGuest: false })
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
  }, [])

  const logout = useCallback(() => {
    setUser(null)
    localStorage.removeItem(LS_KEY)
  }, [])

  const value: AuthContextType = {
    user,
    login,
    loginAsGuest,
    logout,
    isLoggedIn: !!user && !user.isGuest,
    isAdmin: !!user?.isAdmin,
    isGuest: !!user?.isGuest,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
