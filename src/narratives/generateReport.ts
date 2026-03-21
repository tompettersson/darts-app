// src/narratives/generateReport.ts
// Narrative Spielberichte — generiert menschlich klingende Berichte aus Event-Daten
// Variationsreich, deutsche Sportsprache, Muster-Erkennung

// ============================================================================
// Hilfsfunktionen
// ============================================================================

/** Zufällige Auswahl aus einem Array */
function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

/** Zufällige Auswahl basierend auf einem Seed (deterministisch pro Match/Leg) */
function seededPick<T>(arr: T[], seed: string): T {
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0
  }
  return arr[Math.abs(hash) % arr.length]
}

/** Formatiert einen Score-Bereich als Label */
function scoreLabel(score: number): string {
  if (score === 180) return '180'
  if (score >= 170) return `${score}er`
  if (score >= 140) return `${score}er`
  if (score >= 100) return `${score}er`
  return `${score}`
}

/** Formatiert Darts-Anzahl */
function dartsText(n: number): string {
  if (n === 1) return 'einem Dart'
  return `${n} Darts`
}

/** Checkout-Beschreibung */
function checkoutDesc(score: number): string {
  if (score >= 150) return 'brillantem'
  if (score >= 120) return 'herausragendem'
  if (score >= 100) return 'starkem'
  if (score >= 80) return 'solidem'
  if (score >= 60) return 'sauberem'
  return 'sicherem'
}

// ============================================================================
// Textbausteine — Variationen pro Situation
// ============================================================================

const OPENERS = {
  dominant: [
    (name: string) => `${name} ließ von Anfang an keinen Zweifel aufkommen.`,
    (name: string) => `Ein souveränes Leg von ${name}.`,
    (name: string) => `${name} zeigte eine beeindruckende Vorstellung.`,
    (name: string) => `Klasse Performance von ${name} in diesem Leg.`,
    (name: string) => `${name} dominierte dieses Leg von der ersten Aufnahme an.`,
  ],
  close: [
    (p1: string, p2: string) => `Ein packendes Leg zwischen ${p1} und ${p2}.`,
    (p1: string, p2: string) => `Hochspannung bis zum letzten Dart — ${p1} gegen ${p2}.`,
    (p1: string, p2: string) => `Ein Leg auf Augenhöhe zwischen ${p1} und ${p2}.`,
    (p1: string, p2: string) => `Nichts geschenkt — ${p1} und ${p2} lieferten sich ein enges Duell.`,
    (p1: string, p2: string) => `Spannend bis zum Schluss — ${p1} und ${p2} schenkten sich nichts.`,
  ],
  blowout: [
    (winner: string, loser: string) => `${winner} machte kurzen Prozess mit ${loser}.`,
    (winner: string, loser: string) => `Kein Durchkommen für ${loser} — ${winner} war eine Klasse besser.`,
    (winner: string, loser: string) => `${winner} überrollte ${loser} regelrecht.`,
    (winner: string) => `Ein Statement-Leg von ${winner}.`,
  ],
  solo: [
    (name: string) => `${name} gegen das Board.`,
    (name: string) => `Solo-Session für ${name}.`,
  ],
}

const SCORING_HIGH = [
  (name: string, avg: string) => `Mit einem starken Schnitt von ${avg} hielt ${name} konstant Druck.`,
  (name: string, avg: string) => `${name} überzeugte mit einem Average von ${avg}.`,
  (name: string, avg: string) => `Scoring war die Stärke von ${name} — ${avg} im Schnitt.`,
  (name: string, avg: string) => `${name} punktete zuverlässig mit ${avg} 3-Dart-Average.`,
  (name: string, avg: string) => `Stark gescort: ${name} kam auf ${avg} Punkte pro Aufnahme.`,
]

const SCORING_LOW = [
  (name: string, avg: string) => `${name} fand nur schwer ins Spiel (${avg} Average).`,
  (name: string, avg: string) => `Beim Scoring hatte ${name} Mühe — nur ${avg} im Schnitt.`,
  (name: string, avg: string) => `${name} kam nicht richtig in Fahrt (${avg}).`,
  (name: string, avg: string) => `Ein zäher Durchgang für ${name} mit ${avg} Average.`,
]

const HIGHLIGHT_180 = [
  (name: string) => `${name} setzte ein Ausrufezeichen mit einer 180!`,
  (name: string) => `Die perfekte Aufnahme! ${name} warf eine 180.`,
  (name: string) => `Maximum! ${name} mit der 180.`,
  (name: string) => `${name} zeigte Klasse mit einer 180er-Aufnahme.`,
  (name: string) => `Highlight: Die 180 von ${name}.`,
]

const HIGHLIGHT_140PLUS = [
  (name: string, score: number) => `Starke ${score}er-Aufnahme von ${name}.`,
  (name: string, score: number) => `${name} mit einer sehenswerten ${score}.`,
  (name: string, score: number) => `${name} legte mit ${score} Punkten vor.`,
]

const BUST_SINGLE = [
  (name: string) => `Ein Bust kostete ${name} wertvolles Tempo.`,
  (name: string) => `${name} bustete einmal — ein kleiner Rückschlag.`,
  (name: string) => `Unglücklich: ${name} überworfen.`,
]

const BUST_MULTIPLE = [
  (name: string, n: number) => `${name} bustete gleich ${n} Mal — das war teuer.`,
  (name: string, n: number) => `${n} Busts von ${name} bremsten den Rhythmus.`,
  (name: string, n: number) => `Die ${n} Überwerfer von ${name} waren spielentscheidend.`,
]

const CHECKOUT_PHRASES = [
  (name: string, score: number, darts: number) => `${name} checkte ${score} mit ${dartsText(darts)} aus.`,
  (name: string, score: number, darts: number) => `Checkout ${score} — ${name} brauchte ${dartsText(darts)}.`,
  (name: string, score: number) => `${name} stellte das Leg mit ${checkoutDesc(score)} ${score}er-Checkout.`,
  (name: string, score: number) => `Finish über ${score} — sauber von ${name}.`,
]

const CHECKOUT_HIGH = [
  (name: string, score: number) => `Herausragend: ${name} checkte die ${score} aus!`,
  (name: string, score: number) => `Big Fish! ${name} mit dem ${score}er-Checkout.`,
  (name: string, score: number) => `Was für ein Finish! ${name} nagelt die ${score}.`,
  (name: string, score: number) => `Die ${score} — ein Checkout der Extraklasse von ${name}.`,
]

const PRESSURE_WIN = [
  (name: string) => `${name} behielt die Nerven am Doppel.`,
  (name: string) => `Unter Druck eiskalt — ${name} machte den Sack zu.`,
  (name: string) => `${name} ließ sich die Butter nicht vom Brot nehmen.`,
]

const COMEBACK_PHRASES = [
  (name: string) => `${name} kämpfte sich zurück ins Match.`,
  (name: string) => `Beeindruckendes Comeback von ${name}!`,
  (name: string) => `${name} drehte das Spiel — was für eine Moral!`,
  (name: string) => `Totgesagte leben länger — ${name} mit der Aufholjagd.`,
]

const MATCH_DOMINANT = [
  (name: string, score: string) => `${name} gewann souverän mit ${score}.`,
  (name: string, score: string) => `Klarer Sieg für ${name} — ${score} Endstand.`,
  (name: string, score: string) => `${name} ließ nichts anbrennen und siegte ${score}.`,
]

const MATCH_CLOSE = [
  (score: string) => `Ein Krimi bis zum letzten Dart! Endstand: ${score}.`,
  (score: string) => `Enger geht's kaum — ${score} am Ende.`,
  (score: string) => `Spannung pur! Das Match endete ${score}.`,
]

const MATCH_OVERVIEW_PHRASES = [
  (winner: string, legs: string) => `${winner} sicherte sich das Match mit ${legs}.`,
  (winner: string, legs: string) => `Am Ende stand ${winner} mit ${legs} als Sieger fest.`,
  (winner: string, legs: string) => `${winner} holte sich den Sieg — ${legs}.`,
]

const CONSISTENCY_GOOD = [
  (name: string) => `${name} überzeugte durch Konstanz.`,
  (name: string) => `Bemerkenswert war die Gleichmäßigkeit von ${name}.`,
  (name: string) => `${name} lieferte Aufnahme für Aufnahme ab.`,
]

const CONSISTENCY_BAD = [
  (name: string) => `${name} schwankte stark zwischen brillant und schwach.`,
  (name: string) => `Die Inkonstanz war ${name}s größtes Problem.`,
  (name: string) => `${name} konnte das Niveau nicht halten.`,
]

const TURNING_POINT = [
  (legIdx: number, name: string) => `Das ${legIdx}. Leg war der Wendepunkt — ${name} fand ab hier seinen Rhythmus.`,
  (legIdx: number, name: string) => `Ab Leg ${legIdx} übernahm ${name} das Kommando.`,
  (legIdx: number, name: string) => `Im ${legIdx}. Leg drehte ${name} auf.`,
]

const ZERO_BUSTS = [
  (name: string) => `${name} blieb fehlerfrei — kein einziger Bust.`,
  (name: string) => `Null Busts von ${name} — makellos.`,
  (name: string) => `Sauberes Spiel: ${name} ohne Überwerfer.`,
]

const SOLO_COMMENTARY = [
  (name: string, avg: string, darts: number) => `${name} absolvierte das Leg mit ${avg} Average in ${darts} Darts.`,
  (name: string, avg: string) => `Solide Trainingsrunde von ${name} mit ${avg} Schnitt.`,
]

// ============================================================================
// LEG-BERICHT
// ============================================================================

export type LegReportInput = {
  legId: string
  legIndex?: number
  starterPlayerId?: string
  winnerPlayerId?: string
  highestCheckout?: number
  dartsThrownTotal: number
  bestVisit: number
  byPlayer: Array<{
    playerId: string
    name: string
    points: number
    darts: number
    turns: number
    threeDA: number
    bestVisit: number
    busts: number
  }>
  visits: Array<{
    playerId: string
    playerName: string
    visitScore: number
    bust: boolean
    remainingBefore: number
    remainingAfter: number
  }>
  startingScore?: number // 501, 301, etc.
}

export function generateLegReport(input: LegReportInput): string {
  const { byPlayer, visits, winnerPlayerId, highestCheckout, bestVisit, legId } = input
  const seed = legId

  if (byPlayer.length === 0) return ''

  const parts: string[] = []
  const isSolo = byPlayer.length === 1

  // Sortiere Spieler: Gewinner zuerst
  const winner = byPlayer.find(p => p.playerId === winnerPlayerId)
  const loser = byPlayer.find(p => p.playerId !== winnerPlayerId)

  // ---- Muster-Erkennung ----

  // Wie eng war es? (Differenz der Averages)
  const avgDiff = (winner && loser) ? Math.abs(winner.threeDA - loser.threeDA) : 0
  const isDominant = avgDiff > 15 && winner && loser
  const isClose = avgDiff < 5 && winner && loser
  const isBlowout = winner && loser && winner.darts <= 12 && loser.darts > 20

  // Scoring-Analyse
  const highScorer = byPlayer.reduce((a, b) => a.threeDA > b.threeDA ? a : b)
  const lowScorer = byPlayer.reduce((a, b) => a.threeDA < b.threeDA ? a : b)

  // 180er und High Scores finden
  const has180 = visits.some(v => v.visitScore === 180)
  const who180 = visits.filter(v => v.visitScore === 180).map(v => v.playerName)
  const high140 = visits.filter(v => v.visitScore >= 140 && v.visitScore < 180)
  const highVisit = visits.reduce((best, v) => v.visitScore > best.visitScore ? v : best, visits[0])

  // Busts
  const totalBusts = byPlayer.reduce((sum, p) => sum + p.busts, 0)
  const playerWithBusts = byPlayer.filter(p => p.busts > 0)

  // Führungswechsel erkennen
  const leadChanges = detectLeadChanges(visits, byPlayer, input.startingScore ?? 501)

  // Checkout-Details
  const checkoutVisit = visits.find(v => v.remainingAfter === 0 && !v.bust)
  const checkoutScore = checkoutVisit?.remainingBefore ?? highestCheckout ?? 0

  // ---- 1. ERÖFFNUNG ----

  if (isSolo) {
    parts.push(seededPick(SOLO_COMMENTARY, seed)(byPlayer[0].name, byPlayer[0].threeDA.toFixed(1), byPlayer[0].darts))
  } else if (isBlowout && winner && loser) {
    parts.push(seededPick(OPENERS.blowout, seed)(winner.name, loser.name))
  } else if (isDominant && winner && loser) {
    parts.push(seededPick(OPENERS.dominant, seed)(winner.name))
  } else if (isClose && winner && loser) {
    parts.push(seededPick(OPENERS.close, seed)(winner.name, loser.name))
  } else if (winner && loser) {
    parts.push(seededPick(OPENERS.close, seed)(winner.name, loser.name))
  }

  // ---- 2. SCORING-BERICHT ----

  if (!isSolo && winner && loser) {
    // Scoring des Gewinners
    if (highScorer.threeDA >= 60) {
      parts.push(seededPick(SCORING_HIGH, seed)(highScorer.name, highScorer.threeDA.toFixed(1)))
    } else if (highScorer.threeDA >= 40) {
      parts.push(`${highScorer.name} kam auf einen soliden Schnitt von ${highScorer.threeDA.toFixed(1)}.`)
    }

    // Scoring des Verlierers (nur wenn deutlich schlechter)
    if (avgDiff > 10 && lowScorer.threeDA < 40) {
      parts.push(seededPick(SCORING_LOW, seed)(lowScorer.name, lowScorer.threeDA.toFixed(1)))
    }
  }

  // ---- 3. HIGHLIGHTS ----

  // 180er
  if (has180) {
    const unique180Players = [...new Set(who180)]
    for (const name of unique180Players) {
      const count = who180.filter(n => n === name).length
      if (count > 1) {
        parts.push(`${name} warf gleich ${count} Mal die 180 — Weltklasse!`)
      } else {
        parts.push(seededPick(HIGHLIGHT_180, seed)(name))
      }
    }
  }

  // 140+
  if (!has180 && high140.length > 0) {
    const best140 = high140.reduce((a, b) => a.visitScore > b.visitScore ? a : b)
    parts.push(seededPick(HIGHLIGHT_140PLUS, seed)(best140.playerName, best140.visitScore))
  }

  // ---- 4. BUSTS ----

  for (const p of playerWithBusts) {
    if (p.busts === 1) {
      parts.push(seededPick(BUST_SINGLE, seed)(p.name))
    } else if (p.busts >= 2) {
      parts.push(seededPick(BUST_MULTIPLE, seed)(p.name, p.busts))
    }
  }

  // Null-Busts Highlight
  if (!isSolo && winner && winner.busts === 0 && totalBusts > 0) {
    parts.push(seededPick(ZERO_BUSTS, seed)(winner.name))
  }

  // ---- 5. FÜHRUNGSWECHSEL ----

  if (leadChanges > 2) {
    parts.push(`Ein ständiges Hin und Her — ${leadChanges} Führungswechsel in diesem Leg.`)
  } else if (leadChanges === 0 && winner && !isSolo) {
    parts.push(`${winner.name} führte von der ersten bis zur letzten Aufnahme.`)
  }

  // ---- 6. CHECKOUT / FINISH ----

  if (checkoutScore > 0 && winner) {
    if (checkoutScore >= 100) {
      parts.push(seededPick(CHECKOUT_HIGH, seed)(winner.name, checkoutScore))
    } else if (checkoutScore >= 40) {
      parts.push(seededPick(CHECKOUT_PHRASES, seed)(winner.name, checkoutScore, checkoutVisit ? 3 : 3))
    } else {
      parts.push(`${winner.name} machte mit der ${checkoutScore} den Deckel drauf.`)
    }
  }

  // ---- 7. DARTS-EFFIZIENZ ----

  if (winner && winner.darts <= 12) {
    parts.push(`Beeindruckend effizient: ${winner.name} brauchte nur ${winner.darts} Darts.`)
  } else if (winner && winner.darts <= 15) {
    parts.push(`Starkes Tempo von ${winner.name} mit ${winner.darts} Darts.`)
  }

  // ---- ZUSAMMENFÜHREN ----

  return parts.join(' ')
}

// ============================================================================
// MATCH-BERICHT
// ============================================================================

export type MatchReportInput = {
  matchId: string
  startingScore: number
  isSets: boolean
  players: Array<{ playerId: string; name: string }>
  winnerPlayerId?: string
  legs: Array<{
    legIndex: number
    winnerPlayerId?: string
    dartsThrownTotal: number
    byPlayer: Array<{
      playerId: string
      name: string
      threeDA: number
      bestVisit: number
      busts: number
      darts: number
    }>
    highestCheckout?: number
    has180: boolean
  }>
  overallStats: Array<{
    playerId: string
    name: string
    threeDA: number
    checkoutPct: number
    highestCheckout: number
    tons180: number
    tons140plus: number
    tons100plus: number
    busts: number
    dartsThrown: number
    bestLegDarts: number | null
  }>
}

export function generateMatchReport(input: MatchReportInput): string {
  const { players, winnerPlayerId, legs, overallStats, matchId, isSets } = input
  const seed = matchId

  if (players.length === 0 || legs.length === 0) return ''

  const isSolo = players.length === 1
  const parts: string[] = []

  const winner = players.find(p => p.playerId === winnerPlayerId)
  const loser = players.find(p => p.playerId !== winnerPlayerId)

  // Legs-Score berechnen
  const legWins: Record<string, number> = {}
  for (const p of players) legWins[p.playerId] = 0
  for (const leg of legs) {
    if (leg.winnerPlayerId) legWins[leg.winnerPlayerId] = (legWins[leg.winnerPlayerId] ?? 0) + 1
  }

  const winnerLegs = winner ? legWins[winner.playerId] ?? 0 : 0
  const loserLegs = loser ? legWins[loser.playerId] ?? 0 : 0
  const scoreText = loser ? `${winnerLegs}:${loserLegs}` : `${winnerLegs} Legs`

  // Stats
  const winnerStats = overallStats.find(s => s.playerId === winnerPlayerId)
  const loserStats = loser ? overallStats.find(s => s.playerId === loser.playerId) : null

  // ---- MUSTER-ERKENNUNG ----

  // War es eng?
  const legDiff = Math.abs(winnerLegs - loserLegs)
  const isCloseMatch = !isSolo && legDiff <= 1 && legs.length >= 3
  const isDominantMatch = !isSolo && loserLegs === 0
  const isComeback = !isSolo && detectComeback(legs, winnerPlayerId)

  // Momentum-Shifts
  const momentumShifts = detectMomentumShifts(legs, players)

  // ---- 1. ERÖFFNUNG ----

  if (isSolo) {
    parts.push(`Solo-Match mit ${legs.length} Legs.`)
  } else if (isDominantMatch && winner && loser) {
    parts.push(seededPick(MATCH_DOMINANT, seed)(winner.name, scoreText))
  } else if (isCloseMatch) {
    parts.push(seededPick(MATCH_CLOSE, seed)(scoreText))
    if (winner) {
      parts.push(`${winner.name} behielt am Ende die Oberhand.`)
    }
  } else if (winner) {
    parts.push(seededPick(MATCH_OVERVIEW_PHRASES, seed)(winner.name, scoreText))
  }

  // ---- 2. VERLAUF (Leg-für-Leg Zusammenfassung) ----

  if (legs.length >= 3 && !isSolo) {
    // Identifiziere Phasen
    const phases = identifyPhases(legs, players)
    for (const phase of phases) {
      parts.push(phase)
    }
  } else if (legs.length <= 2 && !isSolo) {
    // Kurzes Match — jedes Leg kurz beschreiben
    for (const leg of legs) {
      const lw = players.find(p => p.playerId === leg.winnerPlayerId)
      if (lw) {
        const bestPlayer = leg.byPlayer.reduce((a, b) => a.threeDA > b.threeDA ? a : b)
        if (leg.highestCheckout && leg.highestCheckout >= 80) {
          parts.push(`Leg ${leg.legIndex}: ${lw.name} mit einem ${leg.highestCheckout}er-Checkout.`)
        } else {
          parts.push(`Leg ${leg.legIndex}: ${lw.name} (${bestPlayer.threeDA.toFixed(1)} Avg).`)
        }
      }
    }
  }

  // ---- 3. COMEBACK ----

  if (isComeback && winner) {
    parts.push(seededPick(COMEBACK_PHRASES, seed)(winner.name))
  }

  // ---- 4. SCHLÜSSELMOMENTE ----

  // Höchster Checkout im Match
  const bestCheckoutLeg = legs.filter(l => l.highestCheckout).sort((a, b) => (b.highestCheckout ?? 0) - (a.highestCheckout ?? 0))[0]
  if (bestCheckoutLeg && bestCheckoutLeg.highestCheckout && bestCheckoutLeg.highestCheckout >= 100) {
    const who = players.find(p => p.playerId === bestCheckoutLeg.winnerPlayerId)
    if (who) {
      parts.push(`Checkout des Matches: ${who.name} mit der ${bestCheckoutLeg.highestCheckout} in Leg ${bestCheckoutLeg.legIndex}.`)
    }
  }

  // 180er im Match
  const legs180 = legs.filter(l => l.has180)
  if (legs180.length > 0) {
    const total180 = overallStats.reduce((sum, s) => sum + s.tons180, 0)
    if (total180 === 1) {
      const who180 = overallStats.find(s => s.tons180 > 0)
      if (who180) parts.push(`Die einzige 180 des Matches kam von ${who180.name}.`)
    } else if (total180 > 1) {
      parts.push(`Insgesamt ${total180} perfekte 180er-Aufnahmen in diesem Match.`)
    }
  }

  // ---- 5. STATISTIK-VERGLEICH ----

  if (winnerStats && loserStats && !isSolo) {
    // Average-Vergleich
    const avgDiff = winnerStats.threeDA - loserStats.threeDA
    if (Math.abs(avgDiff) > 10) {
      const better = avgDiff > 0 ? winnerStats : loserStats
      parts.push(`Im Scoring war ${better.name} klar überlegen (${better.threeDA.toFixed(1)} vs. ${(avgDiff > 0 ? loserStats : winnerStats).threeDA.toFixed(1)}).`)
    } else if (Math.abs(avgDiff) < 3) {
      parts.push(`Beim Scoring lagen beide eng beisammen (${winnerStats.threeDA.toFixed(1)} vs. ${loserStats.threeDA.toFixed(1)}).`)
    }

    // Was war entscheidend?
    if (winnerStats.checkoutPct > loserStats.checkoutPct + 10) {
      parts.push(`Den Unterschied machte die Checkout-Quote: ${winnerStats.name} traf ${winnerStats.checkoutPct.toFixed(0)}% gegenüber ${loserStats.checkoutPct.toFixed(0)}%.`)
    } else if (loserStats.busts > winnerStats.busts + 2) {
      parts.push(`Entscheidend: ${loserStats.name} bustete ${loserStats.busts} Mal, ${winnerStats.name} nur ${winnerStats.busts} Mal.`)
    }
  }

  // ---- 6. FAZIT ----

  if (!isSolo && winner) {
    if (isDominantMatch) {
      parts.push(`${winner.name} zeigte heute eine makellose Leistung.`)
    } else if (isCloseMatch) {
      parts.push(`Am Ende entschieden Kleinigkeiten zugunsten von ${winner.name}.`)
    }

    // Bestes Leg des Gewinners
    if (winnerStats?.bestLegDarts && winnerStats.bestLegDarts <= 15) {
      parts.push(`Bestes Leg: ${winnerStats.bestLegDarts} Darts von ${winner.name}.`)
    }
  }

  return parts.join(' ')
}

// ============================================================================
// MUSTER-ERKENNUNGS-HELFER
// ============================================================================

/** Erkennt Führungswechsel innerhalb eines Legs */
function detectLeadChanges(
  visits: LegReportInput['visits'],
  players: LegReportInput['byPlayer'],
  startingScore: number
): number {
  if (players.length < 2) return 0

  let changes = 0
  let lastLeader = ''
  const remaining: Record<string, number> = {}
  for (const p of players) remaining[p.playerId] = startingScore

  for (const v of visits) {
    if (v.bust) continue
    remaining[v.playerId] = v.remainingAfter

    // Wer führt? (niedrigeres Remaining = führt)
    const sorted = Object.entries(remaining).sort((a, b) => a[1] - b[1])
    const currentLeader = sorted[0][0]
    if (lastLeader && currentLeader !== lastLeader) {
      changes++
    }
    lastLeader = currentLeader
  }

  return changes
}

/** Erkennt ob ein Comeback stattfand */
function detectComeback(
  legs: MatchReportInput['legs'],
  winnerPlayerId?: string
): boolean {
  if (!winnerPlayerId || legs.length < 3) return false

  let maxBehind = 0
  let winnerLegs = 0
  let otherLegs = 0

  for (const leg of legs) {
    if (leg.winnerPlayerId === winnerPlayerId) winnerLegs++
    else otherLegs++

    const deficit = otherLegs - winnerLegs
    if (deficit > maxBehind) maxBehind = deficit
  }

  return maxBehind >= 2
}

/** Erkennt Momentum-Phasen im Match */
function detectMomentumShifts(
  legs: MatchReportInput['legs'],
  players: MatchReportInput['players']
): number {
  if (legs.length < 3) return 0

  let shifts = 0
  let lastWinner = ''

  for (const leg of legs) {
    if (leg.winnerPlayerId && leg.winnerPlayerId !== lastWinner && lastWinner !== '') {
      shifts++
    }
    if (leg.winnerPlayerId) lastWinner = leg.winnerPlayerId
  }

  return shifts
}

/** Identifiziert Phasen im Match-Verlauf */
function identifyPhases(
  legs: MatchReportInput['legs'],
  players: MatchReportInput['players']
): string[] {
  const phrases: string[] = []
  if (legs.length === 0) return phrases

  // Streaks finden (aufeinanderfolgende Legs desselben Spielers)
  type Streak = { playerId: string; name: string; start: number; count: number }
  const streaks: Streak[] = []
  let current: Streak | null = null

  for (const leg of legs) {
    if (!leg.winnerPlayerId) continue
    const name = players.find(p => p.playerId === leg.winnerPlayerId)?.name ?? ''

    if (current && current.playerId === leg.winnerPlayerId) {
      current.count++
    } else {
      if (current) streaks.push(current)
      current = { playerId: leg.winnerPlayerId, name, start: leg.legIndex, count: 1 }
    }
  }
  if (current) streaks.push(current)

  // Streaks beschreiben
  for (const s of streaks) {
    if (s.count >= 3) {
      phrases.push(`${s.name} gewann ${s.count} Legs in Folge (ab Leg ${s.start}).`)
    } else if (s.count === 2 && streaks.length >= 3) {
      phrases.push(`${s.name} holte sich Leg ${s.start} und ${s.start + 1}.`)
    }
  }

  // Wenn keine Streaks lang genug, allgemeine Beschreibung
  if (phrases.length === 0 && legs.length >= 3) {
    const alternating = streaks.every(s => s.count === 1)
    if (alternating) {
      phrases.push('Die Legs gingen abwechselnd hin und her — keiner konnte sich absetzen.')
    }
  }

  return phrases
}
