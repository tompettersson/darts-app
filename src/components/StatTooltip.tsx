// src/components/StatTooltip.tsx
// Reusable tooltip for stat labels — hover on desktop, tap on mobile

import React, { useState, useRef, useEffect } from 'react'

type Props = {
  label: string
  tooltip: string
  colors: { fg: string; fgMuted: string; bgCard: string; border: string; bg: string }
  style?: React.CSSProperties
}

export default function StatTooltip({ label, tooltip, colors, style }: Props) {
  const [showTip, setShowTip] = useState(false)
  const [isMobile] = useState(() => 'ontouchstart' in window || navigator.maxTouchPoints > 0)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const elRef = useRef<HTMLSpanElement>(null)

  // Close on outside tap (mobile)
  useEffect(() => {
    if (!showTip || !isMobile) return
    const handler = (e: TouchEvent) => {
      if (elRef.current && !elRef.current.contains(e.target as Node)) setShowTip(false)
    }
    document.addEventListener('touchstart', handler)
    return () => document.removeEventListener('touchstart', handler)
  }, [showTip, isMobile])

  const handleMouseEnter = () => {
    if (isMobile) return
    timerRef.current = setTimeout(() => setShowTip(true), 300)
  }

  const handleMouseLeave = () => {
    if (timerRef.current) clearTimeout(timerRef.current)
    setShowTip(false)
  }

  const handleTap = () => {
    if (!isMobile) return
    setShowTip(prev => !prev)
  }

  return (
    <span
      ref={elRef}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={handleTap}
      style={{
        position: 'relative',
        cursor: isMobile ? 'pointer' : 'help',
        borderBottom: `1px dotted ${colors.fgMuted}40`,
        ...style,
      }}
    >
      {label}
      {showTip && (
        <span style={{
          position: isMobile ? 'relative' : 'absolute',
          display: isMobile ? 'block' : 'inline-block',
          left: isMobile ? 0 : 0,
          top: isMobile ? 4 : '100%',
          marginTop: isMobile ? 0 : 4,
          zIndex: 100,
          background: colors.bgCard,
          color: colors.fgMuted,
          border: `1px solid ${colors.border}`,
          borderRadius: 6,
          padding: '6px 10px',
          fontSize: 11,
          lineHeight: 1.4,
          fontWeight: 400,
          fontStyle: 'normal',
          whiteSpace: isMobile ? 'normal' : 'nowrap',
          maxWidth: isMobile ? '100%' : 280,
          boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
          pointerEvents: 'none',
        }}>
          {tooltip}
        </span>
      )}
    </span>
  )
}

// Stat descriptions for all game modes
export const STAT_TOOLTIPS: Record<string, string> = {
  // X01
  'Average': 'Durchschnittliche Punkte pro 3-Dart-Aufnahme',
  'First 9 Avg': 'Durchschnitt der ersten 3 Aufnahmen (9 Darts)',
  'Checkout %': 'Prozent der erfolgreichen Checkouts (Double getroffen wenn möglich)',
  'Highest Finish': 'Höchster Checkout-Wert mit dem ein Leg beendet wurde',
  'Best Leg': 'Wenigste Darts die für ein Leg benötigt wurden',
  'Worst Leg': 'Meiste Darts die für ein Leg benötigt wurden',
  '180s': 'Anzahl der perfekten 180-Punkt-Aufnahmen (3× Triple 20)',
  '140+': 'Anzahl der Aufnahmen mit 140 oder mehr Punkten',
  '100+': 'Anzahl der Aufnahmen mit 100 oder mehr Punkten',
  'Ton+': 'Aufnahmen mit 100+ Punkten (auch "Ton" oder "Tonne" genannt)',
  'Doubles': 'Anzahl geworfener Doubles (D1-D20, D-Bull)',

  // Cricket
  'MPR': 'Marks Per Round — durchschnittliche Marks pro 3-Dart-Aufnahme',
  'Marks': 'Gesamtanzahl der Marks (Treffer auf offene Felder)',
  'Triples': 'Anzahl der Triple-Treffer (3 Marks auf einmal)',
  'Closed': 'Anzahl der Felder die du zuerst geschlossen hast',
  'Points': 'Gesamtpunkte (Scoring auf bereits geschlossene Felder)',

  // Operation EFKG
  'Hit Score': 'Gewichtete Treffer: S=1, D=2, T=3. Maximum = Darts × 3. Zeigt wie präzise und wertvoll deine Treffer waren.',
  'Hit-Rate': 'Anteil der Darts die das Zielfeld getroffen haben (Treffer ÷ geworfene Darts). Egal ob Single, Double oder Triple.',
  'Ø Hit/Dart': 'Durchschnittlicher Hit-Score pro Dart (Hit Score ÷ Darts). Max 3.0 = jeder Dart wäre ein Triple.',
  'Ø Pkt/Dart': 'Durchschnittlich erzielte Punkte pro Dart (Gesamtpunkte ÷ Darts).',
  'Beste Streak': 'Längste Serie aufeinanderfolgender Treffer ohne Fehlwurf',
  'Bester Turn': 'Höchste Punktzahl in einer einzelnen 3-Dart-Aufnahme',
  'Punkte': 'Gesamtpunktzahl über alle Aufnahmen',
  'No Score Turns': 'Aufnahmen in denen kein einziger Dart das Ziel traf',
  'Miss': 'Anzahl der Darts die komplett daneben gingen',
  'S-Bull': 'Single-Bull Treffer (25 Punkte)',
  'D-Bull': 'Double-Bull Treffer (50 Punkte, Bullseye)',
  'Single': 'Einfache Treffer auf das Zielfeld',
  'Double': 'Double-Treffer auf das Zielfeld (2× Punkte)',
  'Triple': 'Triple-Treffer auf das Zielfeld (3× Punkte)',

  // Shanghai
  'Score': 'Gesamtpunktzahl — Summe aller Treffer über alle Runden',
  'Shanghai': 'Shanghai = Single + Double + Triple der Zielzahl in einer Aufnahme → sofortiger Sieg!',
  'Darts': 'Gesamtanzahl der geworfenen Darts',

  // Bobs 27
  'Final Score': 'Endpunktzahl — Start bei 27, +/- je nach Treffern auf die Doubles',
  'Targets': 'Anzahl der bespielten Double-Felder (von D1 bis D20/Bull)',
  'Trefferquote': 'Prozent der Darts die das Double-Feld getroffen haben',
  'Treffer gesamt': 'Gesamtanzahl der Darts die ein Double-Feld trafen',
  'Perfekte Targets': 'Doubles bei denen alle 3 Darts getroffen haben (3/3)',
  'Bester Target': 'Double-Feld mit dem höchsten Punktegewinn',
  'Schlechtester Target': 'Double-Feld mit dem höchsten Punkteverlust',
  'Hoechster Target-Score': 'Höchste Einzelpunktzahl auf einem Double-Feld',

  // ATB
  'Darts gesamt': 'Gesamtanzahl der geworfenen Darts',
  'Treffer': 'Anzahl der Darts die das Zielfeld getroffen haben',

  // Killer
  'Kills': 'Anderen Spielern abgenommene Leben',
  'Leben verloren': 'Eigene verlorene Leben durch andere Spieler',
  'Runden': 'Anzahl der überlebten Runden',
  'Zielzahl': 'Das zugewiesene Double-Feld des Spielers',

  // Highscore
  'Target': 'Zielpunktzahl die erreicht werden muss',
  'Avg/Turn': 'Durchschnittliche Punkte pro 3-Dart-Aufnahme',

  // General
  'Darts pro Leg': 'Durchschnittliche Anzahl Darts pro gewonnenem Leg',
  'Legs gewonnen': 'Anzahl der gewonnenen Legs in diesem Match',
}
