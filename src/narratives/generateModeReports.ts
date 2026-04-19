// src/narratives/generateModeReports.ts
// Narrative Spielberichte fuer alle Non-X01-Spielmodi
// Deutsche Sportsprache, variationsreich, seededPick fuer deterministische Auswahl

// ============================================================================
// Hilfsfunktionen (gleich wie in generateReport.ts)
// ============================================================================

function seededPick<T>(arr: T[], seed: string): T {
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0
  }
  return arr[Math.abs(hash) % arr.length]
}

// ============================================================================
// 1. CRICKET REPORT
// ============================================================================

export function generateCricketMatchReport(input: {
  matchId: string
  players: { id: string; name: string }[]
  winnerId?: string
  style?: 'standard' | 'cutthroat' | 'simple' | 'crazy'
  range?: 'short' | 'long'
  playerStats?: Array<{
    playerId: string
    playerName: string
    totalMarks: number
    marksPerTurn: number
    legsWon: number
    bestTurnMarks: number
    triplesHit: number
    bullHitsSingle: number
    bullHitsDouble: number
    turnsWithNoScore: number
  }>
}): string {
  const { matchId, players, winnerId, style, range, playerStats } = input
  const seed = matchId
  const parts: string[] = []

  const winner = players.find(p => p.id === winnerId)
  const loser = players.find(p => p.id !== winnerId)
  const isSolo = players.length === 1
  const isCutthroat = style === 'cutthroat'

  if (!playerStats || playerStats.length === 0) return ''

  const winnerStats = playerStats.find(s => s.playerId === winnerId)
  const loserStats = playerStats.find(s => s.playerId !== winnerId)

  // Opener
  if (isSolo && winner) {
    parts.push(seededPick([
      `${winner.name} trat allein gegen das Board an.`,
      `Solo-Session fuer ${winner.name}.`,
    ], seed))
  } else if (winner && loser) {
    const mprDiff = winnerStats && loserStats ? Math.abs(winnerStats.marksPerTurn - loserStats.marksPerTurn) : 0
    if (mprDiff > 1.5) {
      parts.push(seededPick([
        `${winner.name} liess ${loser.name} keine Chance und dominierte das Board.`,
        `Klare Sache fuer ${winner.name} gegen ${loser.name}.`,
        `${winner.name} zeigte eine ueberlegene Vorstellung gegen ${loser.name}.`,
      ], seed))
    } else {
      parts.push(seededPick([
        `Ein enges Cricket-Duell zwischen ${winner.name} und ${loser.name}.`,
        `Spannendes Cricket-Match — ${winner.name} gegen ${loser.name}.`,
        `${winner.name} und ${loser.name} schenkten sich nichts am Board.`,
        `Intensives Hin und Her zwischen ${winner.name} und ${loser.name}.`,
      ], seed))
    }
  }

  // Cutthroat-Variante
  if (isCutthroat && winner) {
    parts.push(seededPick([
      `Im Cutthroat-Modus hiess es: Punkte verteilen statt sammeln.`,
      `Cutthroat-Taktik war gefragt — wer am wenigsten kassiert, gewinnt.`,
      `Cutthroat: ${winner.name} hielt geschickt den eigenen Score niedrig.`,
    ], seed))
  }

  // MPR-Analyse
  if (winnerStats && !isSolo) {
    if (winnerStats.marksPerTurn >= 3.0) {
      parts.push(seededPick([
        `Mit starken ${winnerStats.marksPerTurn.toFixed(2)} Marks pro Runde war ${winner!.name} kaum zu stoppen.`,
        `Beeindruckende ${winnerStats.marksPerTurn.toFixed(2)} MPR von ${winner!.name}.`,
        `${winner!.name} ueberzeugte mit ${winnerStats.marksPerTurn.toFixed(2)} Marks pro Aufnahme.`,
      ], seed))
    } else if (winnerStats.marksPerTurn >= 2.0) {
      parts.push(`Solide ${winnerStats.marksPerTurn.toFixed(2)} MPR von ${winner!.name}.`)
    }
  }

  // Triples
  const tripleKing = [...playerStats].sort((a, b) => b.triplesHit - a.triplesHit)[0]
  if (tripleKing && tripleKing.triplesHit >= 5) {
    parts.push(seededPick([
      `${tripleKing.playerName} traf ${tripleKing.triplesHit} Triples — stark!`,
      `Triple-Festival von ${tripleKing.playerName} mit ${tripleKing.triplesHit} Stueck.`,
      `${tripleKing.playerName} dominierte mit ${tripleKing.triplesHit} Triple-Treffern.`,
    ], seed + 'triple'))
  }

  // Bull-Dominanz
  const bullKing = [...playerStats].sort((a, b) => (b.bullHitsDouble + b.bullHitsSingle) - (a.bullHitsDouble + a.bullHitsSingle))[0]
  if (bullKing && (bullKing.bullHitsDouble + bullKing.bullHitsSingle) >= 4) {
    parts.push(seededPick([
      `${bullKing.playerName} zeigte Bull-Staerke mit ${bullKing.bullHitsDouble + bullKing.bullHitsSingle} Bull-Treffern.`,
      `Am Bull war ${bullKing.playerName} nicht zu stoppen.`,
      `${bullKing.playerName} konterte mit einer Bull-Serie.`,
    ], seed + 'bull'))
  }

  // Best Turn
  const bestTurnPlayer = [...playerStats].sort((a, b) => b.bestTurnMarks - a.bestTurnMarks)[0]
  if (bestTurnPlayer && bestTurnPlayer.bestTurnMarks >= 7) {
    parts.push(`Highlight: ${bestTurnPlayer.playerName} mit einer ${bestTurnPlayer.bestTurnMarks}-Mark-Aufnahme.`)
  }

  // Fazit
  if (winner && loser && winnerStats && loserStats) {
    const legDiff = winnerStats.legsWon - loserStats.legsWon
    if (legDiff >= 3) {
      parts.push(seededPick([
        `Am Ende ein deutlicher Sieg fuer ${winner.name}.`,
        `${winner.name} machte kurzen Prozess.`,
      ], seed + 'end'))
    } else {
      parts.push(seededPick([
        `Am Ende entschied ${winner.name} das Match fuer sich.`,
        `${winner.name} behielt die Oberhand.`,
        `Verdienter Sieg fuer ${winner.name}.`,
      ], seed + 'end'))
    }
  }

  return parts.join(' ')
}

// ============================================================================
// 2. AROUND THE BLOCK (ATB) REPORT
// ============================================================================

export function generateATBReport(input: {
  matchId: string
  players: { id: string; name: string }[]
  winnerId?: string
  winnerDarts?: number
  mode?: string
  direction?: string
  playerDarts?: Record<string, number>
  playerProgress?: Record<string, number>
  totalFields?: number
}): string {
  const { matchId, players, winnerId, winnerDarts, mode, direction, playerDarts, playerProgress, totalFields } = input
  const seed = matchId
  const parts: string[] = []

  const winner = players.find(p => p.id === winnerId)
  const isSolo = players.length === 1

  // Opener
  if (winner) {
    if (winnerDarts && winnerDarts <= (totalFields ?? 20) * 1.5) {
      parts.push(seededPick([
        `${winner.name} raste durch die Felder und brauchte nur ${winnerDarts} Darts!`,
        `Beeindruckendes Tempo! ${winner.name} mit nur ${winnerDarts} Darts durch.`,
        `${winner.name} liess nichts anbrennen — ${winnerDarts} Darts und fertig.`,
        `Speed-Run von ${winner.name}: Nur ${winnerDarts} Darts fuer alle Felder.`,
      ], seed))
    } else if (winnerDarts) {
      parts.push(seededPick([
        `${winner.name} kaempfte sich durch und schaffte es in ${winnerDarts} Darts.`,
        `${winner.name} brauchte ${winnerDarts} Darts — kein Spaziergang.`,
        `Mit ${winnerDarts} Darts erreichte ${winner.name} das Ziel.`,
        `${winner.name} arbeitete sich Feld fuer Feld vor — ${winnerDarts} Darts.`,
      ], seed))
    }
  }

  // Richtung
  if (direction) {
    parts.push(seededPick([
      `Gespielt wurde ${direction === 'forward' ? 'vorwaerts' : direction === 'reverse' ? 'rueckwaerts' : 'zufaellig'}.`,
      `Richtung: ${direction === 'forward' ? 'Von 1 bis 20' : direction === 'reverse' ? 'Von 20 bis 1' : 'Zufaellige Reihenfolge'}.`,
    ], seed + 'dir'))
  }

  // Vergleich (Multiplayer)
  if (!isSolo && playerDarts && winner) {
    const others = players.filter(p => p.id !== winnerId)
    for (const other of others) {
      const otherDarts = playerDarts[other.id]
      if (otherDarts && winnerDarts) {
        const diff = otherDarts - winnerDarts
        if (diff > 10) {
          parts.push(seededPick([
            `${other.name} lag deutlich zurueck mit ${diff} Darts mehr.`,
            `${winner.name} war ${diff} Darts schneller als ${other.name}.`,
            `Klarer Vorsprung: ${diff} Darts Unterschied zu ${other.name}.`,
          ], seed + other.id))
        } else if (diff > 0) {
          parts.push(`Knapp: ${other.name} brauchte nur ${diff} Darts mehr.`)
        }
      }
    }
  }

  // Fortschritt (wenn nicht alle fertig)
  if (playerProgress && totalFields && !isSolo) {
    const unfinished = players.filter(p => (playerProgress[p.id] ?? 0) < totalFields && p.id !== winnerId)
    for (const p of unfinished) {
      const prog = playerProgress[p.id] ?? 0
      parts.push(`${p.name} kam bis Feld ${prog} von ${totalFields}.`)
    }
  }

  return parts.join(' ')
}

// ============================================================================
// 3. CAPTURE THE FIELD (CTF) REPORT
// ============================================================================

export function generateCTFReport(input: {
  matchId: string
  players: { id: string; name: string }[]
  winnerId?: string
  rankings?: Array<{
    playerId: string
    name: string
    fieldsWon: number
    fieldPoints: number
    totalScore: number
    triples: number
    hitRate: number
    bestField?: { field: string; score: number } | null
  }>
  totalFields?: number
}): string {
  const { matchId, players, winnerId, rankings, totalFields } = input
  const seed = matchId
  const parts: string[] = []

  const winner = players.find(p => p.id === winnerId)

  if (!rankings || rankings.length === 0) return ''

  const winnerRank = rankings.find(r => r.playerId === winnerId)

  // Opener
  if (winner && winnerRank) {
    const dominance = totalFields ? (winnerRank.fieldsWon / totalFields) * 100 : 0
    if (dominance >= 70) {
      parts.push(seededPick([
        `${winner.name} eroberte ${winnerRank.fieldsWon} von ${totalFields} Feldern — totale Dominanz!`,
        `Territoriale Ueberlegenheit: ${winner.name} mit ${winnerRank.fieldsWon} Feldern.`,
        `${winner.name} beherrschte das Board mit ${winnerRank.fieldsWon} eroberten Feldern.`,
      ], seed))
    } else if (dominance >= 50) {
      parts.push(seededPick([
        `${winner.name} sicherte sich die Mehrheit mit ${winnerRank.fieldsWon} Feldern.`,
        `Knappe Mehrheit fuer ${winner.name} — ${winnerRank.fieldsWon} Felder.`,
        `${winner.name} gewann den Kampf um die Felder (${winnerRank.fieldsWon}/${totalFields}).`,
      ], seed))
    } else {
      parts.push(seededPick([
        `Ein enger Kampf um jedes Feld — ${winner.name} setzte sich durch.`,
        `Kampf um jedes Feld! ${winner.name} gewann mit ${winnerRank.fieldPoints} Feldpunkten.`,
        `Umkaempftes Match — am Ende reichte es fuer ${winner.name}.`,
      ], seed))
    }
  }

  // Best Field
  if (winnerRank?.bestField) {
    parts.push(seededPick([
      `Staerkstes Feld: ${winnerRank.bestField.field} mit ${winnerRank.bestField.score} Punkten.`,
      `Auf ${winnerRank.bestField.field} war ${winner!.name} besonders stark (${winnerRank.bestField.score}).`,
    ], seed + 'best'))
  }

  // Vergleich
  if (rankings.length >= 2) {
    const second = rankings.find(r => r.playerId !== winnerId)
    if (second && winnerRank) {
      const fpDiff = winnerRank.fieldPoints - second.fieldPoints
      if (fpDiff <= 2) {
        parts.push(seededPick([
          `Nur ${fpDiff} Feldpunkte Unterschied zu ${second.name} — das haette kippen koennen.`,
          `Hauchduenner Vorsprung vor ${second.name}.`,
        ], seed + 'diff'))
      }
    }
  }

  // Triples
  const tripleKing = [...rankings].sort((a, b) => b.triples - a.triples)[0]
  if (tripleKing && tripleKing.triples >= 3) {
    parts.push(`${tripleKing.name} setzte ${tripleKing.triples} Triple-Akzente.`)
  }

  return parts.join(' ')
}

// ============================================================================
// 4. STRAEUSSCHEN (STR) REPORT
// ============================================================================

export function generateStraeusschenReport(input: {
  matchId: string
  players: { id: string; name: string }[]
  winnerId?: string
  ringMode?: 'triple' | 'double'
  playerStats?: Array<{
    playerId: string
    name: string
    totalScore: number
    hitRate: number
    totalDarts: number
    bestRound?: { hits: number; darts: number } | null
    longestHitStreak: number
    avgHitsPerRound: number
  }>
}): string {
  const { matchId, players, winnerId, ringMode, playerStats } = input
  const seed = matchId
  const parts: string[] = []

  const winner = players.find(p => p.id === winnerId)
  const ringLabel = ringMode === 'double' ? 'Double' : 'Triple'

  if (!playerStats || playerStats.length === 0) return ''

  const winnerStats = playerStats.find(s => s.playerId === winnerId)

  // Opener
  if (winner && winnerStats) {
    if (winnerStats.hitRate >= 60) {
      parts.push(seededPick([
        `${winner.name} zeigte eine starke Leistung beim ${ringLabel}-Sammeln.`,
        `Praezise wie ein Uhrwerk — ${winner.name} mit ${winnerStats.hitRate.toFixed(0)}% Trefferquote.`,
        `${winner.name} demonstrierte ${ringLabel}-Staerke: ${winnerStats.hitRate.toFixed(0)}% Hit-Rate.`,
      ], seed))
    } else if (winnerStats.hitRate >= 40) {
      parts.push(seededPick([
        `${winner.name} sammelte konsequent seine ${ringLabel}s.`,
        `Solide Leistung von ${winner.name} beim Straeusschen.`,
        `${winner.name} arbeitete sich geduldig durch die ${ringLabel}s.`,
      ], seed))
    } else {
      parts.push(seededPick([
        `${winner.name} kaempfte sich durch — die ${ringLabel}s waren heute widerspenstig.`,
        `Keine leichte Aufgabe fuer ${winner.name} — ${winnerStats.hitRate.toFixed(0)}% Trefferquote.`,
      ], seed))
    }
  }

  // Best Round
  const bestRoundPlayer = playerStats.find(s => s.bestRound && s.bestRound.hits >= 3)
  if (bestRoundPlayer?.bestRound) {
    parts.push(seededPick([
      `Highlight: ${bestRoundPlayer.name} mit einer perfekten Runde (${bestRoundPlayer.bestRound.hits}/${bestRoundPlayer.bestRound.darts}).`,
      `Starke Runde von ${bestRoundPlayer.name}: ${bestRoundPlayer.bestRound.hits} Treffer aus ${bestRoundPlayer.bestRound.darts} Darts.`,
    ], seed + 'best'))
  }

  // Longest Streak
  const streakKing = [...playerStats].sort((a, b) => b.longestHitStreak - a.longestHitStreak)[0]
  if (streakKing && streakKing.longestHitStreak >= 5) {
    parts.push(seededPick([
      `${streakKing.name} traf ${streakKing.longestHitStreak} Mal in Folge — beeindruckende Serie!`,
      `Laengste Trefferserie: ${streakKing.longestHitStreak} von ${streakKing.name}.`,
    ], seed + 'streak'))
  }

  // Darts comparison
  if (playerStats.length >= 2 && winnerStats) {
    const loserStats = playerStats.find(s => s.playerId !== winnerId)
    if (loserStats) {
      const dartDiff = loserStats.totalDarts - winnerStats.totalDarts
      if (dartDiff > 5) {
        parts.push(`${winner!.name} war ${dartDiff} Darts schneller als ${loserStats.name}.`)
      }
    }
  }

  return parts.join(' ')
}

// ============================================================================
// 5. SHANGHAI REPORT
// ============================================================================

export function generateShanghaiReport(input: {
  matchId: string
  players: { id: string; name: string }[]
  winnerId?: string | null
  rankings?: Array<{
    playerId: string
    name: string
    totalScore: number
    avgPerRound: number
    bestRound: { round: number; score: number }
    worstRound: { round: number; score: number }
    shanghaiCount: number
    hitRate: number
    longestScoringStreak: number
  }>
}): string {
  const { matchId, players, winnerId, rankings } = input
  const seed = matchId
  const parts: string[] = []

  if (!rankings || rankings.length === 0) return ''

  const winner = rankings.find(r => r.playerId === winnerId)
  const isDraw = !winnerId

  // Opener
  if (isDraw) {
    parts.push(seededPick([
      `Ein seltenes Unentschieden beim Shanghai — beide gleichauf!`,
      `Gleichstand! Keiner konnte sich absetzen.`,
      `Kein Sieger heute — das Shanghai-Duell endete remis.`,
    ], seed))
  } else if (winner) {
    if (winner.shanghaiCount > 0) {
      parts.push(seededPick([
        `Shanghai! ${winner.name} landete den grossen Coup mit ${winner.shanghaiCount}x Shanghai-Kombination!`,
        `Was fuer ein Moment! ${winner.name} traf Single, Double und Triple in einer Runde!`,
        `Perfekt kombiniert: ${winner.name} mit ${winner.shanghaiCount} Shanghai-Treffern.`,
      ], seed))
    } else {
      parts.push(seededPick([
        `${winner.name} holte sich den Shanghai-Sieg mit ${winner.totalScore} Punkten.`,
        `${winner.name} setzte sich mit ${winner.totalScore} Punkten durch.`,
        `Sieg fuer ${winner.name} — ${winner.totalScore} Punkte am Ende.`,
      ], seed))
    }
  }

  // Best Round
  const bestRoundPlayer = [...rankings].sort((a, b) => b.bestRound.score - a.bestRound.score)[0]
  if (bestRoundPlayer && bestRoundPlayer.bestRound.score > 0) {
    parts.push(seededPick([
      `Beste Runde des Matches: R${bestRoundPlayer.bestRound.round} von ${bestRoundPlayer.name} mit ${bestRoundPlayer.bestRound.score} Punkten.`,
      `${bestRoundPlayer.name} glaenzte in Runde ${bestRoundPlayer.bestRound.round} (${bestRoundPlayer.bestRound.score} Pkt).`,
    ], seed + 'best'))
  }

  // Scoring streak
  const streaker = [...rankings].sort((a, b) => b.longestScoringStreak - a.longestScoringStreak)[0]
  if (streaker && streaker.longestScoringStreak >= 8) {
    parts.push(`${streaker.name} punktete ${streaker.longestScoringStreak} Runden am Stueck.`)
  }

  // Score comparison
  if (rankings.length >= 2 && !isDraw) {
    const scoreDiff = rankings[0].totalScore - rankings[1].totalScore
    if (scoreDiff <= 10) {
      parts.push(seededPick([
        `Nur ${scoreDiff} Punkte Unterschied — das haette in jede Richtung gehen koennen.`,
        `Hauchduenn: ${scoreDiff} Punkte trennten die Kontrahenten.`,
      ], seed + 'diff'))
    } else if (scoreDiff >= 50) {
      parts.push(`Deutlicher Abstand von ${scoreDiff} Punkten.`)
    }
  }

  // Average
  if (winner && winner.avgPerRound >= 15) {
    parts.push(`Stark: ${winner.name} mit ${winner.avgPerRound.toFixed(1)} Punkten pro Runde im Schnitt.`)
  }

  return parts.join(' ')
}

// ============================================================================
// 6. KILLER REPORT
// ============================================================================

export function generateKillerReport(input: {
  matchId: string
  players: { id: string; name: string }[]
  winnerId?: string | null
  playerStats?: Array<{
    playerId: string
    name: string
    totalKills: number
    hitsDealt: number
    livesLost: number
    hitRate: number
    survivedRounds: number
    isWinner: boolean
    position: number
  }>
  startingLives?: number
}): string {
  const { matchId, players, winnerId, playerStats, startingLives } = input
  const seed = matchId
  const parts: string[] = []

  if (!playerStats || playerStats.length === 0) return ''

  const winner = playerStats.find(s => s.playerId === winnerId)

  // Opener
  if (winner) {
    const totalKills = playerStats.reduce((sum, p) => sum + p.totalKills, 0)
    if (totalKills >= players.length * 2) {
      parts.push(seededPick([
        `Blutbad beim Killer! ${winner.name} ueberlebte das Gemetzel.`,
        `Erbarmungsloser Killer-Abend — ${winner.name} stand als Letzter.`,
        `${winner.name} ueberlebte das Chaos und holte den Sieg.`,
      ], seed))
    } else {
      parts.push(seededPick([
        `${winner.name} setzte sich beim Killer durch!`,
        `${winner.name} als letzter Ueberlebender — Killer-Champion!`,
        `Gewonnen! ${winner.name} eliminierte die Konkurrenz.`,
      ], seed))
    }
  } else {
    parts.push('Unentschieden beim Killer — keiner konnte sich durchsetzen.')
  }

  // Top Killer
  const topKiller = [...playerStats].sort((a, b) => b.totalKills - a.totalKills)[0]
  if (topKiller && topKiller.totalKills >= 2) {
    parts.push(seededPick([
      `${topKiller.name} war der gefaehrlichste Spieler mit ${topKiller.totalKills} Eliminierungen.`,
      `${topKiller.name} raeumte ${topKiller.totalKills} Gegner ab.`,
      `Top-Killer: ${topKiller.name} mit ${topKiller.totalKills} Kills.`,
    ], seed + 'killer'))
  }

  // Hit Rate
  const bestHitter = [...playerStats].sort((a, b) => b.hitRate - a.hitRate)[0]
  if (bestHitter && bestHitter.hitRate >= 50) {
    parts.push(seededPick([
      `${bestHitter.name} traf am praezisesten: ${bestHitter.hitRate.toFixed(0)}% Trefferquote.`,
      `Praezision: ${bestHitter.name} mit ${bestHitter.hitRate.toFixed(0)}% Hit-Rate.`,
    ], seed + 'hit'))
  }

  // Drama: Wer wurde zuerst eliminiert?
  const firstElim = [...playerStats].filter(p => !p.isWinner).sort((a, b) => a.survivedRounds - b.survivedRounds)[0]
  if (firstElim && firstElim.survivedRounds <= 3 && players.length >= 3) {
    parts.push(seededPick([
      `${firstElim.name} wurde frueh eliminiert — nur ${firstElim.survivedRounds} Runden ueberlebt.`,
      `Fruehes Aus fuer ${firstElim.name} nach ${firstElim.survivedRounds} Runden.`,
    ], seed + 'elim'))
  }

  // Lives
  if (winner && startingLives) {
    const livesLeft = startingLives - winner.livesLost
    if (livesLeft === startingLives) {
      parts.push(`${winner.name} blieb unberuehrt — kein einziges Leben verloren!`)
    } else if (livesLeft === 1) {
      parts.push(seededPick([
        `Knapp! ${winner.name} hatte am Ende nur noch ein Leben uebrig.`,
        `${winner.name} ueberlebte mit dem letzten Leben — Nervenkitzel pur.`,
      ], seed + 'lives'))
    }
  }

  return parts.join(' ')
}

// ============================================================================
// 7. BOB'S 27 REPORT
// ============================================================================

export function generateBobs27Report(input: {
  matchId: string
  players: { id: string; name: string }[]
  winnerId?: string | null
  rankings?: Array<{
    playerId: string
    name: string
    finalScore: number
    eliminated: boolean
    eliminatedAtTarget?: number | null
    hitRate: number
    longestHitStreak: number
    perfectTargets: number
    targetsCompleted: number
    totalTargets: number
    bestTarget?: { label: string; hits: number } | null
    worstTarget?: { label: string; hits: number } | null
  }>
}): string {
  const { matchId, players, winnerId, rankings } = input
  const seed = matchId
  const parts: string[] = []

  if (!rankings || rankings.length === 0) return ''

  const isSolo = players.length === 1
  const winner = rankings.find(r => r.playerId === winnerId)
  const topPlayer = rankings[0]

  // Opener
  if (isSolo) {
    if (topPlayer.eliminated) {
      parts.push(seededPick([
        `Game Over bei D${(topPlayer.eliminatedAtTarget ?? 0) + 1} — der Score fiel unter Null.`,
        `${topPlayer.name} scheiterte bei D${(topPlayer.eliminatedAtTarget ?? 0) + 1}. Endstand: ${topPlayer.finalScore}.`,
        `Kein Durchkommen bei D${(topPlayer.eliminatedAtTarget ?? 0) + 1} — ${topPlayer.name} ist raus.`,
      ], seed))
    } else {
      parts.push(seededPick([
        `${topPlayer.name} hat es geschafft! Alle Doubles bezwungen mit ${topPlayer.finalScore} Punkten.`,
        `Durchgekommen! ${topPlayer.name} beendet Bob's 27 mit ${topPlayer.finalScore} Punkten.`,
        `Starke Vorstellung: ${topPlayer.name} meistert alle Targets (${topPlayer.finalScore} Pkt).`,
      ], seed))
    }
  } else if (winner) {
    parts.push(seededPick([
      `${winner.name} gewinnt Bob's 27 mit ${winner.finalScore} Punkten!`,
      `Sieg fuer ${winner.name} — ${winner.finalScore} Punkte am Ende.`,
      `${winner.name} setzt sich mit ${winner.finalScore} Punkten durch.`,
    ], seed))
  }

  // Hit Rate
  if (topPlayer.hitRate >= 50) {
    parts.push(seededPick([
      `Starke ${topPlayer.hitRate.toFixed(0)}% Trefferquote auf die Doubles.`,
      `${topPlayer.name} traf die Haelfte aller Doubles — beachtlich.`,
    ], seed + 'hr'))
  } else if (topPlayer.hitRate <= 20 && isSolo) {
    parts.push(`Nur ${topPlayer.hitRate.toFixed(0)}% Double-Trefferquote — ein harter Tag.`)
  }

  // Best & Worst Target — "Bestes" nur erwähnen wenn es wirklich Treffer gab
  if (topPlayer.bestTarget && topPlayer.bestTarget.hits > 0) {
    parts.push(`Bestes Target: ${topPlayer.bestTarget.label} (${topPlayer.bestTarget.hits}/3 Treffer).`)
  }
  if (topPlayer.worstTarget && topPlayer.worstTarget.hits === 0 && (topPlayer.bestTarget?.hits ?? 0) > 0) {
    // Schwachstelle nur erwähnen wenn es ein echtes Kontrast-Bild gibt
    // (sonst: wenn alle Targets 0 Treffer haben, wäre jedes Target "Schwachstelle")
    parts.push(seededPick([
      `Auf ${topPlayer.worstTarget.label} ging nichts — null Treffer.`,
      `Schwachstelle: ${topPlayer.worstTarget.label} ohne Treffer.`,
    ], seed + 'worst'))
  }

  // Longest Streak
  if (topPlayer.longestHitStreak >= 5) {
    parts.push(seededPick([
      `Perfekter Lauf ueber ${topPlayer.longestHitStreak} Darts in Folge.`,
      `${topPlayer.longestHitStreak} Treffer am Stueck — starke Phase!`,
    ], seed + 'streak'))
  }

  // Perfect Targets
  if (topPlayer.perfectTargets >= 3) {
    parts.push(`${topPlayer.perfectTargets} perfekte Targets (3/3) — Klasse!`)
  }

  return parts.join(' ')
}

// ============================================================================
// 8. OPERATION REPORT
// ============================================================================

export function generateOperationReport(input: {
  matchId: string
  players: { id: string; name: string }[]
  winnerId?: string | null
  rankings?: Array<{
    playerId: string
    name: string
    totalHitScore: number
    hitRate: number
    avgHitScorePerDart: number
    maxHitStreak: number
    bestTurnScore: number
    tripleCount: number
    doubleCount: number
    singleCount: number
    noScoreCount: number
  }>
  legsCount?: number
}): string {
  const { matchId, players, winnerId, rankings, legsCount } = input
  const seed = matchId
  const parts: string[] = []

  if (!rankings || rankings.length === 0) return ''

  const isSolo = players.length === 1
  const winner = rankings.find(r => r.playerId === winnerId)
  const topPlayer = rankings[0]

  // Opener
  if (winner || isSolo) {
    const p = winner ?? topPlayer
    if (p.hitRate >= 70) {
      parts.push(seededPick([
        `${p.name} zeigte chirurgische Praezision bei Operation: EFKG.`,
        `Herausragend: ${p.name} mit ${p.hitRate.toFixed(0)}% Trefferquote.`,
        `${p.name} operierte praezise — ${p.hitRate.toFixed(0)}% Hit-Rate.`,
      ], seed))
    } else if (p.hitRate >= 40) {
      parts.push(seededPick([
        `Solide Operation von ${p.name} mit ${p.totalHitScore} Hit Score.`,
        `${p.name} kam auf ${p.totalHitScore} Hit Score — ordentlich.`,
        `${p.name} erreichte ${p.totalHitScore} Hit Score.`,
      ], seed))
    } else {
      parts.push(seededPick([
        `${p.name} hatte Muehe bei der Operation — nur ${p.hitRate.toFixed(0)}% trafen.`,
        `Schwieriger Tag fuer ${p.name}: ${p.hitRate.toFixed(0)}% Hit-Rate.`,
      ], seed))
    }
  }

  // Hit Score System
  if (topPlayer.tripleCount >= 5) {
    parts.push(seededPick([
      `${topPlayer.name} punktete gross mit ${topPlayer.tripleCount} Triples (je 3 Hit-Punkte).`,
      `Triple-Maschine ${topPlayer.name}: ${topPlayer.tripleCount} Volltreffer.`,
    ], seed + 'triple'))
  }

  // Best Turn
  if (topPlayer.bestTurnScore >= 7) {
    parts.push(`Bester Turn: ${topPlayer.bestTurnScore} Punkte.`)
  }

  // Streak
  if (topPlayer.maxHitStreak >= 6) {
    parts.push(`${topPlayer.name} traf ${topPlayer.maxHitStreak} Darts in Folge — Konzentration pur.`)
  }

  // Comparison
  if (rankings.length >= 2 && winner) {
    const second = rankings.find(r => r.playerId !== winnerId)
    if (second) {
      const diff = winner.totalHitScore - second.totalHitScore
      if (diff <= 5) {
        parts.push(`Nur ${diff} Hit-Score-Punkte Unterschied zu ${second.name} — enorm eng!`)
      } else if (diff >= 20) {
        parts.push(`${winner.name} distanzierte ${second.name} um ${diff} Hit-Score-Punkte.`)
      }
    }
  }

  // Legs
  if (legsCount && legsCount > 1) {
    parts.push(`Gespielt ueber ${legsCount} Legs.`)
  }

  return parts.join(' ')
}

// ============================================================================
// 9. HIGHSCORE REPORT
// ============================================================================

export function generateHighscoreReport(input: {
  matchId: string
  players: { id: string; name: string }[]
  winnerId?: string | null
  targetScore?: number
  playerStats?: Array<{
    playerId: string
    playerName: string
    finalScore: number
    dartsThrown: number
    avgPointsPerTurn: number
    bestTurn: number
    speedRating: number
    normalized999Darts?: number | null
  }>
}): string {
  const { matchId, players, winnerId, targetScore, playerStats } = input
  const seed = matchId
  const parts: string[] = []

  if (!playerStats || playerStats.length === 0) return ''

  const winner = playerStats.find(s => s.playerId === winnerId)
  const isSolo = players.length === 1

  // Opener
  if (winner) {
    if (winner.avgPointsPerTurn >= 60) {
      parts.push(seededPick([
        `${winner.playerName} steuerte das Highscore-Ziel souveraen an — ${winner.avgPointsPerTurn.toFixed(1)} 3-Dart-Schnitt.`,
        `Beeindruckend: ${winner.playerName} mit ${winner.avgPointsPerTurn.toFixed(1)} Punkten pro Aufnahme.`,
        `Highscore-Klasse von ${winner.playerName}: ${winner.avgPointsPerTurn.toFixed(1)} Average.`,
        `${winner.playerName} zeigte Scoring-Power mit ${winner.avgPointsPerTurn.toFixed(1)} 3-Dart-Average.`,
      ], seed))
    } else if (winner.avgPointsPerTurn >= 40) {
      parts.push(seededPick([
        `${winner.playerName} arbeitete sich solide zum Ziel: ${winner.dartsThrown} Darts.`,
        `Solides Highscore-Match von ${winner.playerName}.`,
        `${winner.playerName} erreichte ${targetScore ?? winner.finalScore} in ${winner.dartsThrown} Darts.`,
      ], seed))
    } else {
      parts.push(seededPick([
        `${winner.playerName} kaempfte sich zum Highscore-Ziel — ${winner.dartsThrown} Darts noetig.`,
        `Zaehes Spiel fuer ${winner.playerName}, aber am Ende geschafft.`,
      ], seed))
    }
  }

  // Best Turn
  const bestTurnPlayer = [...playerStats].sort((a, b) => b.bestTurn - a.bestTurn)[0]
  if (bestTurnPlayer && bestTurnPlayer.bestTurn >= 100) {
    parts.push(seededPick([
      `Beste Aufnahme: ${bestTurnPlayer.bestTurn} von ${bestTurnPlayer.playerName}.`,
      `${bestTurnPlayer.playerName} mit einer starken ${bestTurnPlayer.bestTurn}er-Aufnahme.`,
      `Highlight: ${bestTurnPlayer.bestTurn} Punkte in einer Aufnahme von ${bestTurnPlayer.playerName}.`,
    ], seed + 'best'))
  }

  // 999 Equivalent
  if (winner?.normalized999Darts && targetScore && targetScore < 999) {
    parts.push(`Hochgerechnet auf 999: ${winner.normalized999Darts.toFixed(0)} Darts.`)
  }

  // Speed comparison
  if (playerStats.length >= 2 && winner) {
    const loser = playerStats.find(s => s.playerId !== winnerId)
    if (loser) {
      const dartsDiff = loser.dartsThrown - winner.dartsThrown
      if (dartsDiff > 10) {
        parts.push(seededPick([
          `${winner.playerName} war ${dartsDiff} Darts schneller als ${loser.playerName}.`,
          `Klarer Geschwindigkeitsvorteil: ${dartsDiff} Darts Unterschied.`,
        ], seed + 'speed'))
      } else if (dartsDiff >= 0 && dartsDiff <= 3) {
        parts.push(`Kopf-an-Kopf: Nur ${dartsDiff} Darts Unterschied.`)
      }
    }
  }

  return parts.join(' ')
}
