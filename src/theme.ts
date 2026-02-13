// src/theme.ts
// Globales Theme-System für die Darts App

// ============================================================================
// Types
// ============================================================================

export type AppTheme = 'normal' | 'arcade'

// ============================================================================
// Storage
// ============================================================================

const THEME_KEY = 'darts.theme.v1'

export function getStoredTheme(): AppTheme {
  const stored = localStorage.getItem(THEME_KEY)
  if (stored === 'normal' || stored === 'arcade') {
    return stored
  }
  return 'normal' // Default
}

export function setStoredTheme(theme: AppTheme): void {
  localStorage.setItem(THEME_KEY, theme)
}

// ============================================================================
// Theme Color Definitions
// ============================================================================

export const themeColors = {
  normal: {
    // Backgrounds
    bg: '#f8fafc',
    bgCard: '#ffffff',
    bgMuted: '#f1f5f9',
    bgSoft: '#e2e8f0',
    bgInput: '#ffffff',

    // Foregrounds
    fg: '#0f172a',
    fgMuted: '#475569',
    fgDim: '#6b7280',

    // Borders
    border: '#e5e7eb',
    borderStrong: '#cbd5e1',

    // Accent
    accent: '#111827',
    accentSoft: '#1e293b',

    // Status
    success: '#16a34a',
    successBg: '#dcfce7',
    error: '#dc2626',
    errorBg: '#fee2e2',
    warning: '#d97706',
    warningBg: '#fef3c7',

    // Special (für Normal-Mode nicht benötigt, aber für Konsistenz)
    ledOn: '#111827',
    ledOff: '#e5e7eb',
    ledGlow: '#374151',
    scoreYellow: '#ca8a04',
  },

  arcade: {
    // Backgrounds
    bg: '#0a0a0a',
    bgCard: '#111111',
    bgMuted: '#1a1a1a',
    bgSoft: '#222222',
    bgInput: '#1a1a1a',

    // Foregrounds
    fg: '#e5e7eb',
    fgMuted: '#9ca3af',
    fgDim: '#6b7280',

    // Borders
    border: '#2a2a2a',
    borderStrong: '#3a3a3a',

    // Accent (Orange LED)
    accent: '#f97316',
    accentSoft: '#ea580c',

    // Status
    success: '#22c55e',
    successBg: '#14532d',
    error: '#ef4444',
    errorBg: '#7f1d1d',
    warning: '#eab308',
    warningBg: '#713f12',

    // LED-specific (Arcade)
    ledOn: '#f97316',
    ledOff: '#1c1c1c',
    ledGlow: '#fb923c',
    scoreYellow: '#eab308',
  },
} as const

// Type für Theme-Farben (ohne literale String-Typen für Kompatibilität)
export type ThemeColors = {
  // Backgrounds
  bg: string
  bgCard: string
  bgMuted: string
  bgSoft: string
  bgInput: string
  // Foregrounds
  fg: string
  fgMuted: string
  fgDim: string
  // Borders
  border: string
  borderStrong: string
  // Accent
  accent: string
  accentSoft: string
  // Status
  success: string
  successBg: string
  error: string
  errorBg: string
  warning: string
  warningBg: string
  // LED-specific
  ledOn: string
  ledOff: string
  ledGlow: string
  scoreYellow: string
}

// ============================================================================
// CSS Variable Helpers
// ============================================================================

// Font Families
export const themeFonts = {
  normal: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  arcade: '"Orbitron", -apple-system, BlinkMacSystemFont, sans-serif',
} as const

export function applyCSSVariables(theme: AppTheme): void {
  const colors = themeColors[theme]
  const font = themeFonts[theme]
  const root = document.documentElement

  // Set data attribute for CSS selectors
  root.setAttribute('data-theme', theme)

  // Set font family
  root.style.setProperty('--theme-font', font)
  root.style.fontFamily = font

  // Set CSS custom properties
  root.style.setProperty('--theme-bg', colors.bg)
  root.style.setProperty('--theme-bg-card', colors.bgCard)
  root.style.setProperty('--theme-bg-muted', colors.bgMuted)
  root.style.setProperty('--theme-bg-soft', colors.bgSoft)
  root.style.setProperty('--theme-bg-input', colors.bgInput)

  root.style.setProperty('--theme-fg', colors.fg)
  root.style.setProperty('--theme-fg-muted', colors.fgMuted)
  root.style.setProperty('--theme-fg-dim', colors.fgDim)

  root.style.setProperty('--theme-border', colors.border)
  root.style.setProperty('--theme-border-strong', colors.borderStrong)

  root.style.setProperty('--theme-accent', colors.accent)
  root.style.setProperty('--theme-accent-soft', colors.accentSoft)

  root.style.setProperty('--theme-success', colors.success)
  root.style.setProperty('--theme-success-bg', colors.successBg)
  root.style.setProperty('--theme-error', colors.error)
  root.style.setProperty('--theme-error-bg', colors.errorBg)
  root.style.setProperty('--theme-warning', colors.warning)
  root.style.setProperty('--theme-warning-bg', colors.warningBg)

  root.style.setProperty('--theme-led-on', colors.ledOn)
  root.style.setProperty('--theme-led-off', colors.ledOff)
  root.style.setProperty('--theme-led-glow', colors.ledGlow)
  root.style.setProperty('--theme-score-yellow', colors.scoreYellow)
}
