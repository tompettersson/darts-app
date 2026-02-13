// src/ThemeProvider.tsx
// React Context Provider für das globale Theme-System

import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'
import {
  type AppTheme,
  type ThemeColors,
  getStoredTheme,
  setStoredTheme,
  themeColors,
  applyCSSVariables,
} from './theme'

// ============================================================================
// Context Type
// ============================================================================

type ThemeContextValue = {
  /** Aktuelles Theme ('normal' oder 'arcade') */
  theme: AppTheme
  /** Theme setzen und speichern */
  setTheme: (t: AppTheme) => void
  /** Zwischen Normal und Arcade wechseln */
  toggleTheme: () => void
  /** Farben für das aktuelle Theme */
  colors: ThemeColors
  /** Shortcut: true wenn Arcade-Theme aktiv */
  isArcade: boolean
  /** Shortcut: true wenn Normal-Theme aktiv */
  isNormal: boolean
}

// ============================================================================
// Context
// ============================================================================

const ThemeCtx = createContext<ThemeContextValue | null>(null)

// ============================================================================
// Provider
// ============================================================================

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Theme State (initialisiert aus localStorage)
  const [theme, setThemeState] = useState<AppTheme>(getStoredTheme)

  // Theme setzen und speichern
  const setTheme = (t: AppTheme) => {
    setThemeState(t)
    setStoredTheme(t)
  }

  // CSS Variables bei Theme-Änderung aktualisieren
  useEffect(() => {
    applyCSSVariables(theme)
  }, [theme])

  // CSS Variables auch beim ersten Render setzen
  useEffect(() => {
    applyCSSVariables(getStoredTheme())
  }, [])

  // Memoized Context Value
  const value = useMemo<ThemeContextValue>(() => ({
    theme,
    setTheme,
    toggleTheme: () => setTheme(theme === 'normal' ? 'arcade' : 'normal'),
    colors: themeColors[theme],
    isArcade: theme === 'arcade',
    isNormal: theme === 'normal',
  }), [theme])

  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>
}

// ============================================================================
// Hook
// ============================================================================

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeCtx)
  if (!ctx) {
    throw new Error('useTheme must be used within ThemeProvider')
  }
  return ctx
}

// ============================================================================
// Optional: Hook für Komponenten die außerhalb des Providers sein könnten
// ============================================================================

export function useThemeColors(): ThemeColors {
  const ctx = useContext(ThemeCtx)
  // Fallback auf Normal-Theme wenn außerhalb des Providers
  return ctx?.colors ?? themeColors.normal
}
