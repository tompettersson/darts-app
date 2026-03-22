// src/ui.ts
// Zentrales UI-Design-System – konsistent für Menü, Stats, MatchDetails, usw.

import type { CSSProperties } from 'react'
import type { ThemeColors } from './theme'

const cardShadow =
  '0 1px 2px rgba(0,0,0,0.04), 0 10px 20px rgba(0,0,0,0.03)'

const arcadeShadow =
  '0 1px 2px rgba(0,0,0,0.6), 0 10px 20px rgba(0,0,0,0.35)'

export const ui: Record<string, CSSProperties> = {
  /** Seiten-Wrapper */
  page: {
    display: 'grid',
    gap: 16,
    padding: '12px 12px calc(env(safe-area-inset-bottom, 0px) + 20px)',
    background: '#f8fafc', // leichtes Grau-Blau für App-Hintergrund
    minHeight: '100dvh',
    boxSizing: 'border-box',
  },

  /** Zentrier-Helfer für Menüs/Formulare */
  centerPage: {
    display: 'grid',
    placeItems: 'center',
    minHeight: '70vh',
    padding: '12px 12px calc(env(safe-area-inset-bottom, 0px) + 20px)',
  },
  centerInner: {
    display: 'grid',
    gap: 16,
    width: 'min(480px, 92vw)',
  },
  centerInnerWide: {
    display: 'grid',
    gap: 12,
    width: 'min(520px, 92vw)',
  },

  /** Kopfzeile mit Titel + Back-Button rechts */
  headerRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    margin: '2px 0 8px',
  },

  /** Hauptseiten-Headline (statt natives H1 Default) */
  pageHeadline: {
    margin: 0,
    fontSize: 20,
    lineHeight: 1.25,
    fontWeight: 800,
    color: '#0f172a',
  },

  /** Sekundärtitel in Cards / Kacheln */
  title: {
    fontWeight: 700,
    margin: 0,
    fontSize: 16,
    lineHeight: 1.3,
    color: '#0f172a',
  },

  /** Subtext / Meta */
  sub: {
    fontSize: 12,
    lineHeight: 1.4,
    opacity: 0.7,
    marginTop: 4,
    color: '#0f172a',
  },

  /** Standard Card */
  card: {
    border: '1px solid #e5e7eb',
    background: '#fff',
    borderRadius: 14,
    boxShadow: cardShadow,
    padding: 14,
  },

  /** Zeilenkarte in Listen */
  rowCard: {
    border: '1px solid #e5e7eb',
    borderRadius: 12,
    padding: '10px 12px',
    background: '#ffffff',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    cursor: 'pointer',
  },

  /** große Kachel-Buttons im Menü */
  tile: {
    border: '1px solid #e5e7eb',
    background: '#ffffff',
    borderRadius: 14,
    padding: 14,
    boxShadow: cardShadow,
    cursor: 'pointer',
    textAlign: 'left',
    display: 'grid',
    gap: 4,
    transition: 'border-color .12s ease, box-shadow .12s ease, background .12s ease',
  },

  tileHoverable: {
    borderColor: '#cbd5e1',
    boxShadow:
      '0 2px 4px rgba(0,0,0,0.05), 0 16px 24px rgba(0,0,0,0.05)',
    background: '#fff',
  },

  tileDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed',
  },

  /** Button / Links */
  backBtn: {
    height: 36,
    borderRadius: 10,
    border: '1px solid #e5e7eb',
    background: '#fff',
    cursor: 'pointer',
    fontSize: 14,
    lineHeight: 1.2,
    padding: '6px 10px',
    fontWeight: 600,
    color: '#0f172a',
  },

  btnGhost: {
    height: 36,
    borderRadius: 10,
    border: '1px solid #e5e7eb',
    background: '#fff',
    cursor: 'pointer',
    fontSize: 14,
    padding: '6px 12px',
    fontWeight: 600,
    color: '#0f172a',
  },

  btnPrimary: {
    height: 36,
    borderRadius: 10,
    border: '1px solid #111827',
    background: '#111827',
    color: '#fff',
    cursor: 'pointer',
    fontSize: 14,
    fontWeight: 700,
    padding: '6px 12px',
  },

  /** Pills / Badges */
  pills: {
    display: 'flex',
    gap: 8,
    flexWrap: 'wrap',
    alignItems: 'center',
  },

  pill: {
    border: '1px solid #e5e7eb',
    background: '#fff',
    color: '#0f172a',
    borderRadius: 999,
    padding: '6px 10px',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
  },

  badge: {
    display: 'inline-block',
    padding: '4px 8px',
    borderRadius: 999,
    border: '1px solid #e5e7eb',
    background: '#f8fafc',
    fontSize: 12,
    fontWeight: 600,
    color: '#0f172a',
  },

  /** Layout helpers */
  grid: {
    display: 'grid',
    gap: 10,
  },
}

// ============================================================================
// Theme-aware UI styles
// ============================================================================

/**
 * Erstellt theme-aware Styles basierend auf den aktuellen Farben.
 * Verwendung: const styles = getThemedUI(colors) oder getThemedUI(colors, isArcade)
 */
export function getThemedUI(colors: ThemeColors, isArcade = false): Record<string, CSSProperties> {
  const shadow = isArcade ? arcadeShadow : cardShadow

  return {
    // Seiten-Wrapper
    page: {
      display: 'grid',
      gap: 16,
      padding: '12px 12px calc(env(safe-area-inset-bottom, 0px) + 20px)',
      background: colors.bg,
      minHeight: '100dvh',
      boxSizing: 'border-box',
      color: colors.fg,
    },

    // Zentrier-Helfer
    centerPage: {
      display: 'grid',
      placeItems: 'center',
      minHeight: '70vh',
      padding: '12px 12px calc(env(safe-area-inset-bottom, 0px) + 20px)',
      background: colors.bg,
      color: colors.fg,
    },
    centerInner: {
      display: 'grid',
      gap: 16,
      width: 'min(480px, 92vw)',
    },
    centerInnerWide: {
      display: 'grid',
      gap: 12,
      width: 'min(520px, 92vw)',
    },

    // Header
    headerRow: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
      margin: '2px 0 8px',
    },
    pageHeadline: {
      margin: 0,
      fontSize: 20,
      lineHeight: 1.25,
      fontWeight: 800,
      color: colors.fg,
    },

    // Text styles
    title: {
      fontWeight: 700,
      margin: 0,
      fontSize: 16,
      lineHeight: 1.3,
      color: colors.fg,
    },
    sub: {
      fontSize: 12,
      lineHeight: 1.4,
      opacity: 0.7,
      marginTop: 4,
      color: colors.fgMuted,
    },

    // Cards
    card: {
      border: `1px solid ${colors.border}`,
      background: colors.bgCard,
      borderRadius: 14,
      boxShadow: shadow,
      padding: 14,
      color: colors.fg,
    },
    rowCard: {
      border: `1px solid ${colors.border}`,
      borderRadius: 12,
      padding: '10px 12px',
      background: colors.bgCard,
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'baseline',
      cursor: 'pointer',
      color: colors.fg,
    },

    // Tiles
    tile: {
      border: `1px solid ${colors.border}`,
      background: colors.bgCard,
      borderRadius: 14,
      padding: 14,
      boxShadow: shadow,
      cursor: 'pointer',
      textAlign: 'left',
      display: 'grid',
      gap: 4,
      transition: 'border-color .12s ease, box-shadow .12s ease, background .12s ease',
      color: colors.fg,
    },
    tileHoverable: {
      borderColor: colors.borderStrong,
      boxShadow: isArcade
        ? '0 2px 4px rgba(0,0,0,0.4), 0 16px 24px rgba(0,0,0,0.4)'
        : '0 2px 4px rgba(0,0,0,0.05), 0 16px 24px rgba(0,0,0,0.05)',
      background: colors.bgCard,
    },
    tileDisabled: {
      opacity: 0.5,
      cursor: 'not-allowed',
    },

    // Buttons
    backBtn: {
      height: 36,
      borderRadius: 10,
      border: `1px solid ${colors.border}`,
      background: colors.bgCard,
      cursor: 'pointer',
      fontSize: 14,
      lineHeight: 1.2,
      padding: '6px 10px',
      fontWeight: 600,
      color: colors.fg,
    },
    btnGhost: {
      height: 36,
      borderRadius: 10,
      border: `1px solid ${colors.border}`,
      background: colors.bgCard,
      cursor: 'pointer',
      fontSize: 14,
      padding: '6px 12px',
      fontWeight: 600,
      color: colors.fg,
    },
    btnPrimary: {
      height: 36,
      borderRadius: 10,
      border: `1px solid ${colors.accent}`,
      background: colors.accent,
      color: isArcade ? '#0a0a0a' : '#fff',
      cursor: 'pointer',
      fontSize: 14,
      fontWeight: 700,
      padding: '6px 12px',
    },

    // Pills / Badges
    pills: {
      display: 'flex',
      gap: 8,
      flexWrap: 'wrap',
      alignItems: 'center',
    },
    pill: {
      border: `1px solid ${colors.border}`,
      background: colors.bgCard,
      color: colors.fg,
      borderRadius: 999,
      padding: '6px 10px',
      fontSize: 12,
      fontWeight: 600,
      cursor: 'pointer',
    },
    pillActive: {
      border: `1px solid ${colors.accent}`,
      background: colors.accent,
      color: isArcade ? '#0a0a0a' : '#fff',
      borderRadius: 999,
      padding: '6px 10px',
      fontSize: 12,
      fontWeight: 600,
      cursor: 'pointer',
    },
    badge: {
      display: 'inline-block',
      padding: '4px 8px',
      borderRadius: 999,
      border: `1px solid ${colors.border}`,
      background: colors.bgMuted,
      fontSize: 12,
      fontWeight: 600,
      color: colors.fg,
    },

    // Layout
    grid: {
      display: 'grid',
      gap: 10,
    },
  }
}

// ============================================================================
// Spieler-Profilfarben zur Auswahl
// ============================================================================

/**
 * 20 leuchtende Neon-Farben für Spielerprofile.
 * Jeder Spieler kann eine davon als persönliche Farbe wählen.
 * Farben die bereits vergeben sind, können nicht erneut gewählt werden.
 */
export const PROFILE_COLORS = [
  '#ff6b1a', // Neon Orange
  '#00f5ff', // Neon Cyan
  '#bf5fff', // Neon Lila
  '#00ff6a', // Neon Grün
  '#ff3355', // Neon Rot
  '#3399ff', // Neon Blau
  '#ffee00', // Neon Gelb
  '#ff44aa', // Neon Pink
  '#00ffcc', // Neon Teal
  '#9955ff', // Neon Violett
  '#ff5577', // Neon Rose
  '#00ccff', // Neon Hellblau
  '#aaff00', // Neon Lime
  '#ff00ff', // Neon Magenta
  '#00aaff', // Neon Sky
  '#00ff99', // Neon Mint
  '#ffaa00', // Neon Amber
  '#7777ff', // Neon Indigo
  '#00ffaa', // Neon Aqua
  '#ff7744', // Neon Coral
]

