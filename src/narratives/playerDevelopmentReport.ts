// src/narratives/playerDevelopmentReport.ts
// Spielerspezifischer Entwicklungsbericht — narrativer "Scouting Report"
// Analysiert Trends, Stärken, Schwächen, Veränderungen über Zeit
// 6-10 Sätze, alle Spielmodi, keine Spielervergleiche

import type { SQLStatsData } from '../hooks/useSQLStats'

// ============================================================================
// Hilfsfunktionen
// ============================================================================

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function seededPick<T>(arr: T[], seed: string): T {
  let hash = 0
  for (let i = 0; i < seed.length; i++) hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0
  return arr[Math.abs(hash) % arr.length]
}

function pct(v: number): string { return `${Math.round(v)}%` }
function avg(v: number): string { return v.toFixed(1) }

// ============================================================================
// Textbausteine — reich variiert
// ============================================================================

const PLAYER_TYPE_INTROS = {
  scorer: [
    (name: string) => `${name} ist ein klassischer Scorer — das Scoring ist die klare Stärke.`,
    (name: string) => `Scoring ist ${name}s Paradedisziplin.`,
    (name: string) => `${name} punktet stark und verlässlich — ein typischer Scoring-Spieler.`,
    (name: string) => `Die Stärke von ${name} liegt eindeutig im Scoring-Bereich.`,
  ],
  finisher: [
    (name: string) => `${name} ist ein Finisher — am Doppel eiskalt.`,
    (name: string) => `Wenn es ums Checken geht, ist ${name} in seinem Element.`,
    (name: string) => `${name} gehört zu den Spielern, die am Doppel ihre Stärke zeigen.`,
    (name: string) => `Finishing ist ${name}s Trumpf — das Doppel sitzt.`,
  ],
  allrounder: [
    (name: string) => `${name} ist ein Allrounder — sowohl beim Scoring als auch am Doppel solide.`,
    (name: string) => `Vielseitig aufgestellt: ${name} hat keine offensichtliche Schwachstelle.`,
    (name: string) => `${name} überzeugt als kompletter Spieler mit ausgeglichenem Profil.`,
    (name: string) => `Scoring und Finishing auf einem Level — ${name} ist ein echter Allrounder.`,
  ],
  beginner: [
    (name: string) => `${name} ist noch am Anfang der Darts-Reise — aber die Entwicklung zählt.`,
    (name: string) => `${name} baut gerade die Grundlagen auf.`,
    (name: string) => `Noch in der Lernphase: ${name} sammelt Erfahrung und wird besser.`,
    (name: string) => `${name} entwickelt sich — jedes Match bringt Fortschritt.`,
  ],
}

const SCORING_TREND_UP = [
  (diff: string) => `Beim Scoring geht es bergauf — der 3-Dart-Average hat sich um ${diff} Punkte verbessert.`,
  (diff: string) => `Positive Entwicklung im Scoring: +${diff} beim Durchschnitt in den letzten Matches.`,
  (diff: string) => `Der Schnitt steigt — ${diff} Punkte mehr pro Aufnahme als zuvor.`,
  (diff: string) => `Klare Aufwärtskurve beim Scoring mit einem Plus von ${diff}.`,
]

const SCORING_TREND_DOWN = [
  (diff: string) => `Im Scoring zeigt sich ein leichter Abwärtstrend (${diff} Punkte weniger als zuvor).`,
  (diff: string) => `Der 3-Dart-Average ist um ${diff} gesunken — ein kleines Formtief.`,
  (diff: string) => `Beim Scoring läuft es aktuell nicht rund: ${diff} weniger im Schnitt.`,
]

const SCORING_STABLE = [
  (avg: string) => `Das Scoring ist stabil bei ${avg} — ein konstantes Niveau.`,
  (avg: string) => `Verlässlich beim Scoring: ${avg} Punkte pro Aufnahme, wie gewohnt.`,
  (avg: string) => `Keine großen Schwankungen beim Scoring — konstant bei ${avg}.`,
]

const DOUBLES_STRONG = [
  (rate: string) => `Am Doppel stark: ${rate} Checkout-Quote — das ist überdurchschnittlich.`,
  (rate: string) => `Die Checkout-Rate von ${rate} zeigt Klasse am Finish.`,
  (rate: string) => `Souverän am Doppel mit ${rate} Trefferquote.`,
]

const DOUBLES_WEAK = [
  (rate: string) => `Am Doppel ist noch Luft nach oben — nur ${rate} Checkout-Quote.`,
  (rate: string) => `Das Finishing ist mit ${rate} die größte Baustelle.`,
  (rate: string) => `Die Checkout-Rate von ${rate} zeigt: Hier liegt das größte Potenzial.`,
]

const DOUBLES_IMPROVING = [
  (diff: string) => `Erfreulich: Die Checkout-Quote hat sich um ${diff} Prozentpunkte verbessert.`,
  (diff: string) => `Am Doppel geht es voran — ${diff} besser als in früheren Matches.`,
]

const DOUBLES_DECLINING = [
  (diff: string) => `Am Doppel läuft es schlechter als zuvor (${diff} weniger).`,
  (diff: string) => `Die Checkout-Quote ist um ${diff} gesunken — hier muss gearbeitet werden.`,
]

const FAVORITE_DOUBLE = [
  (field: string, rate: string) => `Lieblingsdoppel: ${field} mit ${rate} Trefferquote.`,
  (field: string, rate: string) => `Am sichersten am ${field} (${rate}).`,
  (field: string, rate: string) => `Wenn es drauf ankommt, trifft ${field} am besten (${rate}).`,
]

const WEAK_DOUBLE = [
  (field: string, rate: string) => `Schwachstelle: ${field} mit nur ${rate} — hier lohnt sich gezieltes Training.`,
  (field: string) => `${field} bleibt ein Sorgenkind am Doppel.`,
]

const WARMUP_NEEDED = [
  (diff: string) => `Typischer Warmup-Spieler: Die ersten Matches liegen ${diff} unter dem Normalniveau.`,
  (diff: string) => `Braucht Anlauf — das Niveau steigt nach den ersten Aufnahmen um ${diff} Punkte.`,
  (diff: string) => `Klassischer Langzünder: ${diff} besser nach dem Warmup.`,
]

const NO_WARMUP = [
  () => `Kein Warmup nötig — von der ersten Aufnahme an auf Betriebstemperatur.`,
  () => `Sofort im Rhythmus — kein messbarer Warmup-Effekt.`,
]

const CLUTCH_STRONG = [
  () => `Unter Druck sogar stärker — echte Wettkampf-Mentalität.`,
  () => `In engen Situationen zuverlässig — die Clutch-Performance stimmt.`,
  () => `Wenn es eng wird, dreht dieser Spieler auf.`,
]

const CLUTCH_WEAK = [
  () => `In Drucksituationen lässt die Treffsicherheit nach — hier zählt mentale Stärke.`,
  () => `Unter Druck fällt die Quote — ein Bereich zum Arbeiten.`,
]

const BEST_TIME = [
  (hour: string, rate: string) => `Beste Tageszeit: ${hour} Uhr (${rate} Winrate).`,
  (hour: string, rate: string) => `Am stärksten um ${hour} Uhr mit ${rate} Siegquote.`,
  (hour: string) => `Peak-Performance um ${hour} Uhr.`,
]

const VERSATILITY_STRONG = [
  (modes: number) => `Vielseitig: Aktiv in ${modes} verschiedenen Spielmodi.`,
  (modes: number) => `Breites Repertoire mit ${modes} gespielten Modi.`,
]

const VERSATILITY_FOCUSED = [
  (mode: string) => `Klar fokussiert auf ${mode} — hier liegt der Schwerpunkt.`,
  (mode: string) => `${mode} ist die Heimat — andere Modi werden selten gespielt.`,
]

const STREAK_HOT = [
  (n: number) => `Aktuell in Topform: ${n} Siege in Folge!`,
  (n: number) => `Heißer Lauf mit ${n} Siegen am Stück.`,
]

const STREAK_COLD = [
  (n: number) => `Momentan eine Durststrecke: ${n} Niederlagen in Folge.`,
  (n: number) => `${n} Niederlagen hintereinander — die Form wird kommen.`,
]

const ACTIVITY_HIGH = [
  (days: number) => `Sehr aktiv: ${days} Spieltage insgesamt — Übung macht den Meister.`,
  (days: number) => `${days} aktive Spieltage zeigen das Engagement.`,
]

const TRAINING_FOCUS = [
  (area: string) => `Trainingsempfehlung: Fokus auf ${area}.`,
  (area: string) => `Nächster Entwicklungsschritt: Gezielt an ${area} arbeiten.`,
  (area: string) => `Für den nächsten Sprung: ${area} verbessern.`,
]

const ACHIEVEMENT_PROGRESS = [
  (unlocked: number, total: number) => `${unlocked} von ${total} Erfolgen freigeschaltet — weiter so!`,
  (unlocked: number, total: number) => `Bereits ${unlocked}/${total} Achievements erreicht.`,
]

const CONSISTENCY_GOOD = [
  () => `Bemerkenswert konstant — kaum Schwankungen von Match zu Match.`,
  () => `Hohe Konstanz: Das Niveau wird zuverlässig gehalten.`,
]

const CONSISTENCY_BAD = [
  () => `Die Leistungen schwanken stark — an der Konstanz muss gearbeitet werden.`,
  () => `Zwischen Glanzleistung und Durchhänger wechselnd — mehr Gleichmäßigkeit wäre ideal.`,
]

const CROSS_GAME_STRONG = [
  (mode: string, rate: string) => `Stärkster Modus: ${mode} mit ${rate} Winrate.`,
  (mode: string, rate: string) => `In ${mode} am erfolgreichsten (${rate}).`,
]

const CROSS_GAME_WEAK = [
  (mode: string, rate: string) => `Schwächster Modus: ${mode} mit nur ${rate} Winrate.`,
  (mode: string) => `Bei ${mode} ist noch viel Potenzial.`,
]

// ============================================================================
// Hauptfunktion
// ============================================================================

export function generatePlayerDevelopmentReport(
  playerName: string,
  playerId: string,
  data: SQLStatsData
): string {
  const seed = playerId
  const parts: string[] = []

  const profile = data.playerTypeProfile
  const general = data.general
  const x01 = data.x01
  const formCurve = data.formCurve
  const warmup = data.warmupEffect
  const clutch = data.clutchStats
  const doubles = data.doubleSuccessPerField
  const crossGame = data.crossGameDashboard
  const winRates = data.crossGameWinRates
  const timeInsights = data.timeInsights
  const achievements = data.fullAchievements
  const training = data.trainingRecommendations
  const winStreaks = data.winStreaks

  // Nicht genug Daten?
  const totalMatches = general?.totalMatches ?? 0
  if (totalMatches < 3) {
    return `${playerName} hat bisher ${totalMatches} Match${totalMatches === 1 ? '' : 'es'} gespielt. Für einen aussagekräftigen Entwicklungsbericht werden mindestens 3 Matches benötigt.`
  }

  // ---- 1. SPIELERTYP & ÜBERBLICK ----
  if (profile) {
    const typeIntros = PLAYER_TYPE_INTROS[profile.playerType] ?? PLAYER_TYPE_INTROS.beginner
    parts.push(seededPick(typeIntros, seed)(playerName))
  } else {
    parts.push(`${playerName} hat ${totalMatches} Matches absolviert.`)
  }

  // ---- 2. SCORING-TREND (Formkurve analysieren) ----
  if (formCurve.length >= 6) {
    const half = Math.floor(formCurve.length / 2)
    const olderAvg = formCurve.slice(0, half).reduce((s, p) => s + p.threeDartAvg, 0) / half
    const newerAvg = formCurve.slice(half).reduce((s, p) => s + p.threeDartAvg, 0) / (formCurve.length - half)
    const diff = newerAvg - olderAvg

    if (diff > 3) {
      parts.push(seededPick(SCORING_TREND_UP, seed)(diff.toFixed(1)))
    } else if (diff < -3) {
      parts.push(seededPick(SCORING_TREND_DOWN, seed)(Math.abs(diff).toFixed(1)))
    } else if (x01) {
      parts.push(seededPick(SCORING_STABLE, seed)(avg(x01.threeDartAvg)))
    }

    // Checkout-Trend
    const olderCO = formCurve.slice(0, half).filter(p => p.checkoutPct > 0)
    const newerCO = formCurve.slice(half).filter(p => p.checkoutPct > 0)
    if (olderCO.length >= 2 && newerCO.length >= 2) {
      const olderCOAvg = olderCO.reduce((s, p) => s + p.checkoutPct, 0) / olderCO.length
      const newerCOAvg = newerCO.reduce((s, p) => s + p.checkoutPct, 0) / newerCO.length
      const coDiff = newerCOAvg - olderCOAvg

      if (coDiff > 5) {
        parts.push(seededPick(DOUBLES_IMPROVING, seed)(pct(coDiff)))
      } else if (coDiff < -5) {
        parts.push(seededPick(DOUBLES_DECLINING, seed)(pct(Math.abs(coDiff))))
      }
    }
  } else if (x01) {
    // Zu wenige Matches für Trend, aber Gesamtwert angeben
    parts.push(`Der aktuelle 3-Dart-Average liegt bei ${avg(x01.threeDartAvg)}.`)
  }

  // ---- 3. DOUBLES / FINISHING ----
  if (x01 && x01.checkoutPercent > 0) {
    if (x01.checkoutPercent >= 35) {
      parts.push(seededPick(DOUBLES_STRONG, seed)(pct(x01.checkoutPercent)))
    } else if (x01.checkoutPercent < 20) {
      parts.push(seededPick(DOUBLES_WEAK, seed)(pct(x01.checkoutPercent)))
    }
  }

  // Lieblings- und Schwachstellen-Doppel
  if (doubles.length >= 3) {
    const sorted = [...doubles].filter(d => d.attempts >= 5).sort((a, b) => b.hitRate - a.hitRate)
    if (sorted.length >= 2) {
      const best = sorted[0]
      const worst = sorted[sorted.length - 1]
      const bestField = best.field === 'BULL' ? 'DBull' : `D${best.field}`
      parts.push(seededPick(FAVORITE_DOUBLE, seed)(bestField, pct(best.hitRate)))

      if (worst.hitRate < best.hitRate * 0.5 && worst.attempts >= 5) {
        const worstField = worst.field === 'BULL' ? 'DBull' : `D${worst.field}`
        parts.push(seededPick(WEAK_DOUBLE, seed)(worstField, pct(worst.hitRate)))
      }
    }
  }

  // ---- 4. KONSTANZ ----
  if (profile) {
    if (profile.consistencyRating >= 70) {
      parts.push(seededPick(CONSISTENCY_GOOD, seed)())
    } else if (profile.consistencyRating < 40) {
      parts.push(seededPick(CONSISTENCY_BAD, seed)())
    }
  }

  // ---- 5. WARMUP-EFFEKT ----
  if (warmup && warmup.sessionCount >= 3) {
    if (warmup.difference > 3) {
      parts.push(seededPick(WARMUP_NEEDED, seed)(avg(warmup.difference)))
    } else if (Math.abs(warmup.difference) <= 2) {
      parts.push(seededPick(NO_WARMUP, seed)())
    }
  }

  // ---- 6. CLUTCH-PERFORMANCE ----
  if (clutch && (clutch.clutchAttempts + clutch.normalAttempts) >= 10) {
    if (clutch.clutchRate > clutch.normalRate + 5) {
      parts.push(seededPick(CLUTCH_STRONG, seed)())
    } else if (clutch.clutchRate < clutch.normalRate - 10) {
      parts.push(seededPick(CLUTCH_WEAK, seed)())
    }
  }

  // ---- 7. BESTE TAGESZEIT ----
  if (timeInsights && timeInsights.bestHour !== null && timeInsights.bestHourWinRate > 0) {
    parts.push(seededPick(BEST_TIME, seed)(
      `${timeInsights.bestHour}:00`,
      pct(timeInsights.bestHourWinRate)
    ))
  }

  // ---- 8. SIEGESSERIE / FORM ----
  if (winStreaks) {
    if (winStreaks.currentWinStreak >= 3) {
      parts.push(seededPick(STREAK_HOT, seed)(winStreaks.currentWinStreak))
    } else if (winStreaks.currentLossStreak >= 3) {
      parts.push(seededPick(STREAK_COLD, seed)(winStreaks.currentLossStreak))
    }
  }

  // ---- 9. VIELSEITIGKEIT (Cross-Game) ----
  if (winRates.length >= 2) {
    parts.push(seededPick(VERSATILITY_STRONG, seed)(winRates.length))

    const bestMode = winRates.filter(w => w.matchesPlayed >= 3).sort((a, b) => b.winRate - a.winRate)[0]
    const worstMode = winRates.filter(w => w.matchesPlayed >= 3).sort((a, b) => a.winRate - b.winRate)[0]

    if (bestMode && bestMode.winRate >= 40) {
      parts.push(seededPick(CROSS_GAME_STRONG, seed)(bestMode.gameMode, pct(bestMode.winRate)))
    }
    if (worstMode && worstMode !== bestMode && worstMode.winRate < 40 && worstMode.matchesPlayed >= 5) {
      parts.push(seededPick(CROSS_GAME_WEAK, seed)(worstMode.gameMode, pct(worstMode.winRate)))
    }
  } else if (crossGame?.favoriteModeLabel) {
    parts.push(seededPick(VERSATILITY_FOCUSED, seed)(crossGame.favoriteModeLabel))
  }

  // ---- 10. AKTIVITÄT ----
  if (crossGame && crossGame.playingStreak.totalActiveDays >= 5) {
    parts.push(seededPick(ACTIVITY_HIGH, seed)(crossGame.playingStreak.totalActiveDays))
  }

  // ---- 11. ACHIEVEMENTS ----
  if (achievements.length > 0) {
    const unlocked = achievements.filter(a => a.unlocked).length
    if (unlocked > 0) {
      parts.push(seededPick(ACHIEVEMENT_PROGRESS, seed)(unlocked, achievements.length))
    }
  }

  // ---- 12. TRAININGSEMPFEHLUNG ----
  if (training.length > 0) {
    const highPrio = training.find(t => t.priority === 'high')
    if (highPrio) {
      parts.push(seededPick(TRAINING_FOCUS, seed)(highPrio.title))
    }
  }

  return parts.join(' ')
}
