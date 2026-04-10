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

  // Bobs 27 additional
  'Targets bespielt': 'Anzahl der bespielten Double-Felder (von D1 bis D-Bull)',

  // Cricket additional
  'Total Marks': 'Gesamtanzahl der Marks (Treffer auf offene Felder)',
  'Marks/Turn': 'Marks pro Aufnahme (3 Darts)',
  'Marks/Dart': 'Marks pro einzelnem Dart',
  'Höchste Aufnahme (Marks)': 'Höchste Anzahl Marks in einer einzelnen 3-Dart-Aufnahme',
  'Höchste Aufnahme (Punkte)': 'Höchste Punktzahl in einer einzelnen 3-Dart-Aufnahme (Scoring)',
  'Treffer / Misses': 'Verhältnis von Treffern auf offene Felder zu Fehlwürfen',
  'Single Bull': 'Treffer auf das Single-Bull (25 Punkte)',
  'Double Bull': 'Treffer auf das Double-Bull / Bullseye (50 Punkte)',
  'No-Score Turns': 'Aufnahmen in denen keine Marks oder Punkte erzielt wurden',
  'Bestes Leg': 'Wenigste Darts die für ein Leg benötigt wurden',

  // Killer additional
  'Qualifiziert': 'Runde in der sich der Spieler durch Treffer auf sein Double qualifiziert hat',
  'Total Kills': 'Gesamtanzahl der Kills (andere Spieler eliminiert)',
  'Ueberlebte Runden': 'Anzahl der Runden die der Spieler überlebt hat',
  'Leben geheilt': 'Durch Treffer auf eigenes Double zurückgewonnene Leben',
  'Selbst-Kill': 'Eigene Leben durch Treffer auf das eigene Double verloren',

  // X01 / MatchDetails additional
  'First Nine': 'Durchschnitt der ersten 3 Aufnahmen (9 Darts)',
  'Höchste Aufnahme': 'Höchste Punktzahl in einer einzelnen 3-Dart-Aufnahme',
  'Meistes Feld': 'Das am häufigsten getroffene Segment (1-20, Bull)',
  'Häufigste Punktzahl': 'Die am häufigsten erzielte Aufnahme-Punktzahl',
  '61+': 'Anzahl der Aufnahmen mit 61 oder mehr Punkten',
  'Höchster Checkout': 'Höchster Checkout-Wert mit dem ein Leg beendet wurde',
  'Checkout Versuche': 'Versuche auf das Doppelfeld / davon getroffen',
  'Checkout Quote': 'Prozent der erfolgreichen Checkouts (Doppel-Versuche)',
  'Rest': 'Verbleibende Punkte am Ende des Legs (0 = ausgecheckt)',
  '3-Dart-Average': 'Durchschnittliche Punkte pro 3-Dart-Aufnahme',
  'First-9 Average': 'Durchschnitt der ersten 3 Aufnahmen (9 Darts)',
  'Höchstes Checkout': 'Höchster Checkout-Wert mit dem ein Leg beendet wurde',
  'Darts geworfen': 'Gesamtanzahl der geworfenen Darts im Match',
  'Punkte erzielt': 'Gesamtpunktzahl über alle Aufnahmen im Match',
  '180er': 'Anzahl der perfekten 180-Punkt-Aufnahmen (3x Triple 20)',
  'Double-Versuche': 'Anzahl der Darts die auf ein Doppelfeld geworfen wurden',
  'Lieblingsdoppel': 'Das am häufigsten zum Checkout verwendete Doppelfeld',
  'Busts': 'Anzahl der Überwerfer (Score über das Ziel hinaus)',
  'Sets gewonnen': 'Anzahl der gewonnenen Sets in diesem Match',

  // 121 Sprint additional
  'Darts bis Finish': 'Gesamtanzahl der Darts um 121 auf Null zu bringen',
  'Checkout-Kategorie': 'Bewertung: <=6 Darts = super, <=9 = gut, >9 = ausbaufähig',
  'First-Turn Checkout': 'Leg mit der ersten Aufnahme ausgecheckt (3 Darts reichten)',
  'Darts auf Double': 'Anzahl der Darts die auf das Doppelfeld zum Checkout geworfen wurden',
  'First-Attempt Double': 'Erster Dart auf das Doppelfeld war gleich ein Treffer',
  'Verpasste Double-Darts': 'Darts auf das Doppelfeld die nicht getroffen haben',
  'Finish-Double': 'Das Doppelfeld mit dem das Leg beendet wurde',
  'Längste Serie ohne Bust': 'Längste Serie aufeinanderfolgender Aufnahmen ohne Überwerfer',
  'Verpasste Checkouts': 'Aufnahmen mit Checkout-Chance die nicht genutzt wurden',
  'Checkout nach Fehlversuch': 'Checkout gelungen obwohl vorheriger Double-Versuch daneben ging',
  'Stabilitätsindex': 'Wie konstant der Spieler seine Route gespielt hat (0-100%)',
  'Checkout-Route': 'Die geworfene Route zum Checkout (z.B. T20 → T11 → D14)',
  'Ø Darts bis Finish': 'Durchschnittliche Darts pro Leg um 121 auszuchecken',
  'Schlechtestes Leg': 'Meiste Darts die für ein Leg benötigt wurden',
  'Checkout-Quote': 'Prozent der erfolgreichen Checkouts (Double getroffen wenn möglich)',
  'First-Turn Checkouts': 'Anzahl der Legs die mit der ersten Aufnahme ausgecheckt wurden',
  'Ø Darts auf Double': 'Durchschnittliche Darts auf das Doppelfeld pro Leg',
  'First-Attempt Double Hits': 'Anzahl der Legs bei denen der erste Dart auf das Double gleich traf',
  'Bevorzugtes Double': 'Das am häufigsten zum Checkout verwendete Doppelfeld',
  'Busts gesamt': 'Gesamtanzahl der Überwerfer über alle Legs',
  'Ø Busts pro Leg': 'Durchschnittliche Anzahl Überwerfer pro Leg',
  'Ø Stabilität': 'Durchschnittlicher Stabilitätsindex über alle Legs (0-100%)',
  'Optimale Routen': 'Legs bei denen die optimale Checkout-Route gespielt wurde',

  // CTF additional
  'Feldpunkte': 'Punkte basierend auf der Wertigkeit der gewonnenen Felder',
  'Felder gewonnen': 'Anzahl der im Duell gewonnenen Felder',
  'Wurfpunkte': 'Gesamtpunktzahl aller geworfenen Darts',
  'Bestes Feld': 'Feld auf dem die meisten Punkte erzielt wurden',
  'Schwerstes Feld': 'Feld das am schwierigsten war (wenigste Punkte oder meiste Darts)',
  'Perfekte Runden': 'Runden in denen alle 3 Darts das Zielfeld trafen',
  'Ø Punkte/Feld': 'Durchschnittlich erzielte Punkte pro Feld',
  'Konsistenz': 'Standardabweichung der Punkte pro Feld (niedriger = stabiler)',
  'Beste Serie': 'Längste Serie aufeinanderfolgender Felder mit Treffern',

  // ATB additional
  'Total Darts': 'Gesamtanzahl der geworfenen Darts',
  'Misses': 'Anzahl der Darts die komplett daneben gingen',
  'Hit Rate': 'Anteil der Darts die das Zielfeld getroffen haben',
  'Ø Darts/Feld': 'Durchschnittliche Darts pro Feld (weniger = besser)',

  // Shanghai additional
  'Avg/R': 'Durchschnittliche Punkte pro Runde',
  'Beste': 'Beste Runde (höchste Punktzahl)',
  'Schw.': 'Schwächste Runde (niedrigste Punktzahl)',
  'T/D/S': 'Triple / Double / Single Treffer',
  'Hit%': 'Trefferquote — Anteil der Darts die das Zielfeld trafen',
  'Konsist.': 'Konsistenz (Standardabweichung — niedriger = stabiler)',
  'Streak': 'Längste Serie aufeinanderfolgender Runden mit Punkten',

  // Highscore additional
  'Endscore': 'Erreichte Gesamtpunktzahl am Ende des Matches',
  'Turns': 'Anzahl der gespielten 3-Dart-Aufnahmen',
  'Ø per Dart': 'Durchschnittlich erzielte Punkte pro einzelnem Dart',
  '3-Dart Avg': 'Durchschnittliche Punkte pro 3-Dart-Aufnahme',
  'Best Turn': 'Höchste Punktzahl in einer einzelnen 3-Dart-Aufnahme',
  'Speed Rating': 'Effizienz-Bewertung: Score geteilt durch Darts (höher = schneller)',
  '999-Equivalent': 'Hochgerechnete Darts die für 999 Punkte nötig wären',

  // Sträußchen additional
  'Aufnahmen': 'Anzahl der gespielten 3-Dart-Aufnahmen',
  'Treffer / Fehl': 'Verhältnis von Treffern zu Fehlwürfen',
  'Beste Runde': 'Runde mit den meisten Treffern (Treffer/Darts)',
  'Schlechteste Runde': 'Runde mit den wenigsten Treffern (Treffer/Darts)',
  'Ø Treffer/Runde': 'Durchschnittliche Treffer pro Aufnahme',
  'Längste Trefferserie': 'Längste Serie aufeinanderfolgender Treffer ohne Fehlwurf',
  '1. Dart Trefferquote': 'Wie oft der erste Dart einer Aufnahme ein Treffer war',
  'Ø Score': 'Durchschnittliche Punktzahl pro Leg',
  'Ø Darts/Leg': 'Durchschnittliche Darts pro Leg',
  'Längste Serie': 'Längste Serie aufeinanderfolgender Treffer ohne Fehlwurf',

  // ATB MatchDetails additional
  'Felder': 'Anzahl der abgeschlossenen Felder in der Sequenz',
  'Ø Darts pro Feld': 'Durchschnittliche Darts die pro Feld benötigt wurden',
  'First-Dart-Hit-Rate': 'Wie oft der erste Dart einer Aufnahme das Zielfeld traf',
  'Längste First-Dart-Serie': 'Längste Serie aufeinanderfolgender Felder bei denen der erste Dart traf',
  'Bull-Trefferquote': 'Trefferquote auf das Bull-Feld',
  'Misses gesamt': 'Gesamtanzahl der Darts die komplett daneben gingen',
  'Längste Miss-Serie': 'Längste Serie aufeinanderfolgender Fehlwürfe',
  'Problemfelder': 'Felder die überdurchschnittlich viele Darts benötigten',
  'Problematische Felder': 'Felder die überdurchschnittlich viele Darts benötigten',
  'Ø Darts (1-10)': 'Durchschnittliche Darts pro Feld für die Felder 1-10',
  'Ø Darts (11-Bull)': 'Durchschnittliche Darts pro Feld für die Felder 11-Bull',
  'Fazit': 'Vergleich der Leistung in der ersten vs. zweiten Hälfte',

  // Shanghai MatchDetails additional
  'Gesamt': 'Gesamtpunktzahl über alle Runden',
  'Ø pro Runde': 'Durchschnittliche Punkte pro Runde',
  'Schlechteste': 'Schwächste Runde (niedrigste Punktzahl)',
  'Scoring-Streak': 'Längste Serie aufeinanderfolgender Runden mit Punkten',

  // Highscore MatchDetails additional
  'Punkte gesamt': 'Gesamtpunktzahl über alle Aufnahmen',
  'Ø pro Dart': 'Durchschnittlich erzielte Punkte pro einzelnem Dart',
  'Ø pro Turn': 'Durchschnittliche Punkte pro 3-Dart-Aufnahme',
  'Endstand': 'Erreichte Gesamtpunktzahl am Ende des Legs',

  // Cricket MatchDetails additional
  'Felder geschlossen': 'Anzahl der Felder die auf 3 Marks geschlossen wurden',
  'Marks/Turn (MPR)': 'Marks Per Round — durchschnittliche Marks pro 3-Dart-Aufnahme',
  'Marks/Dart (MPD)': 'Marks Pro Dart — durchschnittliche Marks pro einzelnem Dart',
  'Staerkstes Feld': 'Feld auf dem die meisten Marks erzielt wurden',
  'Schwaechstes Feld': 'Feld auf dem die wenigsten Marks erzielt wurden',
  'Beste Aufnahme (Marks)': 'Höchste Anzahl Marks in einer einzelnen 3-Dart-Aufnahme',
  'Beste Aufnahme (Punkte)': 'Höchste Punktzahl in einer einzelnen 3-Dart-Aufnahme',
}
