// src/stats/computeATBStats.ts
// Statistik-Berechnung für Around the Block Matches

import type { ATBStoredMatch } from '../types/aroundTheBlock'
import { applyATBEvents, getSequence, type ATBEvent, type ATBTurnAddedEvent } from '../dartsAroundTheBlock'

export type ATBMatchStats = {
  playerId: string
  playerName: string
  totalDarts: number
  triples: number
  doubles: number
  singles: number
  misses: number
  hitRate: number // Prozent
  avgDartsPerField: number
  fieldsCompleted: number
  durationMs?: number
  isWinner: boolean
}

/**
 * Berechnet Statistiken für alle Spieler eines ATB-Matches
 */
export function computeATBMatchStats(match: ATBStoredMatch): ATBMatchStats[] {
  const state = applyATBEvents(match.events)
  if (!state.match) return []

  const stats: ATBMatchStats[] = []

  for (const player of state.match.players) {
    const pid = player.playerId

    // Alle Darts dieses Spielers sammeln
    let totalDarts = 0
    let triples = 0
    let doubles = 0
    let singles = 0
    let misses = 0

    for (const event of match.events) {
      if (event.type === 'ATBTurnAdded' && event.playerId === pid) {
        for (const dart of event.darts) {
          totalDarts++
          if (dart.target === 'MISS') {
            misses++
          } else if (dart.mult === 3) {
            triples++
          } else if (dart.mult === 2) {
            doubles++
          } else {
            singles++
          }
        }
      }
    }

    const hits = totalDarts - misses
    const hitRate = totalDarts > 0 ? (hits / totalDarts) * 100 : 0
    const fieldsCompleted = state.currentIndexByPlayer[pid] ?? 0
    const avgDartsPerField = fieldsCompleted > 0 ? totalDarts / fieldsCompleted : 0

    stats.push({
      playerId: pid,
      playerName: player.name,
      totalDarts,
      triples,
      doubles,
      singles,
      misses,
      hitRate,
      avgDartsPerField,
      fieldsCompleted,
      durationMs: match.durationMs,
      isWinner: match.winnerId === pid,
    })
  }

  return stats
}

/**
 * Berechnet aggregierte Statistiken über mehrere Matches
 */
export function computeATBCareerStats(
  playerId: string,
  matches: ATBStoredMatch[]
): {
  matchesPlayed: number
  matchesWon: number
  winRate: number
  totalDarts: number
  totalTriples: number
  totalDoubles: number
  avgHitRate: number
  avgDartsPerField: number
  bestTime?: number
  bestDarts?: number
} {
  const playerMatches = matches.filter(m =>
    m.players.some(p => p.playerId === playerId)
  )

  let matchesWon = 0
  let totalDarts = 0
  let totalTriples = 0
  let totalDoubles = 0
  let totalHitRateSum = 0
  let totalAvgDartsPerFieldSum = 0
  let bestTime: number | undefined
  let bestDarts: number | undefined

  for (const match of playerMatches) {
    const stats = computeATBMatchStats(match)
    const playerStats = stats.find(s => s.playerId === playerId)
    if (!playerStats) continue

    if (playerStats.isWinner) {
      matchesWon++
      // Best Time/Darts nur bei gewonnenen Matches
      if (match.durationMs && (!bestTime || match.durationMs < bestTime)) {
        bestTime = match.durationMs
      }
      if (!bestDarts || playerStats.totalDarts < bestDarts) {
        bestDarts = playerStats.totalDarts
      }
    }

    totalDarts += playerStats.totalDarts
    totalTriples += playerStats.triples
    totalDoubles += playerStats.doubles
    totalHitRateSum += playerStats.hitRate
    totalAvgDartsPerFieldSum += playerStats.avgDartsPerField
  }

  const matchesPlayed = playerMatches.length
  const winRate = matchesPlayed > 0 ? (matchesWon / matchesPlayed) * 100 : 0
  const avgHitRate = matchesPlayed > 0 ? totalHitRateSum / matchesPlayed : 0
  const avgDartsPerField = matchesPlayed > 0 ? totalAvgDartsPerFieldSum / matchesPlayed : 0

  return {
    matchesPlayed,
    matchesWon,
    winRate,
    totalDarts,
    totalTriples,
    totalDoubles,
    avgHitRate,
    avgDartsPerField,
    bestTime,
    bestDarts,
  }
}

// =====================================================
// DETAILLIERTE STATISTIKEN (Kurzzeit - pro Match/Leg)
// =====================================================

export type FieldStats = {
  field: string
  darts: number
  firstDartHits: number
  triples: number
  doubles: number
  singles: number
  misses: number
  attempts: number // wie oft wurde auf dieses Feld geworfen
}

export type ATBDetailedStats = {
  playerId: string
  playerName: string

  // Grundwerte
  totalDarts: number
  durationMs: number
  avgDartsPerField: number
  fieldsCompleted: number

  // Pro Zahl (1-20 + Bull)
  statsPerField: Record<string, FieldStats>

  // Treffer & Effizienz
  firstDartHitRate: number // % der Felder mit First-Dart-Hit
  bestField: { field: string; darts: number } | null
  worstField: { field: string; darts: number } | null
  triples: number
  doubles: number
  singles: number
  bullHitRate: number // % der Bull-Würfe die getroffen haben

  // Fehler & Streuung
  misses: number
  missesPerField: Record<string, number>
  longestMissSeries: number
  problematicFields: string[] // Felder mit >2x Durchschnitt

  // Flow & Konzentration
  firstDartStreak: number // längste Serie von First-Dart-Hits
  perfectTurns: number // Turns mit 3 Hits
  comparison1to10: number // Avg Darts für 1-10
  comparison11toBull: number // Avg Darts für 11-Bull
  isWinner: boolean
}

/**
 * Berechnet detaillierte Statistiken für ein ATB Match
 * Optional: Nur für bestimmtes Leg (legIndex)
 */
export function computeATBDetailedStats(
  match: ATBStoredMatch,
  legIndex?: number
): ATBDetailedStats[] {
  const state = applyATBEvents(match.events)
  if (!state.match) return []

  // Verwende die tatsächliche Sequenz aus dem Match (wichtig für Random-Modus!)
  // Das Match-Start-Event enthält generatedSequence bei erweiterten Modi
  const matchStartEvent = match.events.find(e => e.type === 'ATBMatchStarted') as any

  // Priorität: extendedSequence (aus State) > generatedSequence (aus Event) > Standard-Sequenz
  let sequence: readonly (number | 'BULL')[]
  if (state.match.extendedSequence) {
    // Erweiterte Sequenz mit Target-Objekten -> nur Nummern extrahieren
    sequence = state.match.extendedSequence.map(t => t.number)
  } else if (matchStartEvent?.generatedSequence) {
    // Generierte Sequenz aus dem Event
    sequence = matchStartEvent.generatedSequence.map((t: any) => t.number)
  } else {
    // Fallback: Standard-Sequenz
    const mode = match.mode ?? 'ascending'
    const direction = match.direction ?? 'forward'
    sequence = getSequence(mode, direction)
  }

  // Events für das gewünschte Leg filtern
  let relevantEvents: ATBEvent[] = match.events
  if (legIndex !== undefined) {
    // Finde Start/Ende des Legs
    let currentLeg = 0
    let legStartIdx = 0
    let legEndIdx = match.events.length

    for (let i = 0; i < match.events.length; i++) {
      const ev = match.events[i]
      if (ev.type === 'ATBLegStarted') {
        if (currentLeg === legIndex) {
          legStartIdx = i
        }
      }
      if (ev.type === 'ATBLegFinished') {
        if (currentLeg === legIndex) {
          legEndIdx = i + 1
          break
        }
        currentLeg++
      }
    }
    relevantEvents = match.events.slice(legStartIdx, legEndIdx)
  }

  const results: ATBDetailedStats[] = []

  for (const player of state.match.players) {
    const pid = player.playerId

    // Initialisiere Stats pro Feld
    const statsPerField: Record<string, FieldStats> = {}
    for (const field of sequence) {
      const key = String(field)
      statsPerField[key] = {
        field: key,
        darts: 0,
        firstDartHits: 0,
        triples: 0,
        doubles: 0,
        singles: 0,
        misses: 0,
        attempts: 0,
      }
    }

    let totalDarts = 0
    let triples = 0
    let doubles = 0
    let singles = 0
    let misses = 0
    let perfectTurns = 0
    let longestMissSeries = 0
    let currentMissSeries = 0
    let firstDartHits = 0 // Felder die mit dem ersten Dart getroffen wurden
    let firstDartStreak = 0
    let currentFirstDartStreak = 0
    let fieldsCompleted = 0
    let bullAttempts = 0
    let bullHits = 0

    // Track current field index per player (verwende newIndex aus Events!)
    let currentFieldIdx = 0
    let dartsOnCurrentField = 0
    let previousFieldIdx = 0

    const turnEvents = relevantEvents.filter(
      (e): e is ATBTurnAddedEvent => e.type === 'ATBTurnAdded' && e.playerId === pid
    )

    for (const turn of turnEvents) {
      let turnHits = 0
      let turnMisses = 0

      // Verwende fieldsAdvanced aus dem Event für die Fortschritts-Berechnung
      const turnFieldsAdvanced = turn.fieldsAdvanced ?? 0
      const turnNewIndex = turn.newIndex ?? previousFieldIdx

      // Für jeden Dart im Turn
      for (let dartIdx = 0; dartIdx < turn.darts.length; dartIdx++) {
        const dart = turn.darts[dartIdx]
        if (currentFieldIdx >= sequence.length) break

        const currentField = sequence[currentFieldIdx]
        const fieldKey = String(currentField)

        // Stelle sicher, dass das Feld im statsPerField existiert
        if (!statsPerField[fieldKey]) {
          statsPerField[fieldKey] = {
            field: fieldKey,
            darts: 0,
            firstDartHits: 0,
            triples: 0,
            doubles: 0,
            singles: 0,
            misses: 0,
            attempts: 0,
          }
        }

        totalDarts++
        dartsOnCurrentField++

        if (dart.target === 'MISS') {
          misses++
          turnMisses++
          currentMissSeries++
          if (currentMissSeries > longestMissSeries) {
            longestMissSeries = currentMissSeries
          }
          statsPerField[fieldKey].misses++
          statsPerField[fieldKey].darts++
          currentFirstDartStreak = 0
        } else {
          currentMissSeries = 0

          // Zähle immer Multiplier-Statistiken
          if (dart.mult === 3) {
            triples++
          } else if (dart.mult === 2) {
            doubles++
          } else {
            singles++
          }

          // Prüfe ob das Ziel getroffen wurde
          // Verwende den newIndex vom Event um zu bestimmen ob Felder abgeschlossen wurden
          const dartNumber = dart.target
          const targetNumber = currentField

          // Treffer: Dart-Zahl entspricht aktuellem Ziel
          const targetHit = dartNumber === targetNumber ||
            (targetNumber === 'BULL' && dartNumber === 'BULL')

          if (targetHit) {
            turnHits++

            // Bull-Statistik
            if (currentField === 'BULL') {
              bullAttempts++
              bullHits++
            }

            if (dart.mult === 3) {
              statsPerField[fieldKey].triples++
            } else if (dart.mult === 2) {
              statsPerField[fieldKey].doubles++
            } else {
              statsPerField[fieldKey].singles++
            }

            statsPerField[fieldKey].darts++

            // First-Dart-Hit?
            if (dartsOnCurrentField === 1) {
              firstDartHits++
              currentFirstDartStreak++
              if (currentFirstDartStreak > firstDartStreak) {
                firstDartStreak = currentFirstDartStreak
              }
              statsPerField[fieldKey].firstDartHits++
            } else {
              currentFirstDartStreak = 0
            }

            statsPerField[fieldKey].attempts++
            fieldsCompleted++

            // Nächstes Feld - verwende die tatsächliche Logik vom Event
            // Bei targetMode=any: Multiplier bestimmt Advance
            // Bei anderen Modi: immer 1
            currentFieldIdx++
            dartsOnCurrentField = 0
          } else {
            // Wurf war kein Miss, aber hat nicht das aktuelle Ziel getroffen
            statsPerField[fieldKey].darts++
            currentFirstDartStreak = 0

            // Bull tracking
            if (currentField === 'BULL') {
              bullAttempts++
            }
          }
        }
      }

      // Update Index basierend auf Event-Daten (zuverlässiger als eigene Berechnung)
      currentFieldIdx = turnNewIndex
      previousFieldIdx = turnNewIndex

      // Perfect Turn (3 Hits)
      if (turnHits >= 3 && turnMisses === 0) {
        perfectTurns++
      }
    }

    // fieldsCompleted basierend auf dem finalen Index (zuverlässiger)
    // Das ist der letzte newIndex aus den Events
    // Überschreibe die manuelle Zählung mit dem tatsächlichen Fortschritt
    const actualFieldsCompleted = currentFieldIdx

    // Berechne Darts-Zeitstempel für Dauer (wenn legIndex spezifiziert)
    let durationMs = match.durationMs ?? 0
    if (legIndex !== undefined && turnEvents.length >= 2) {
      const firstTs = turnEvents[0]?.ts
      const lastTs = turnEvents[turnEvents.length - 1]?.ts
      if (firstTs && lastTs) {
        durationMs = new Date(lastTs).getTime() - new Date(firstTs).getTime()
      }
    }

    // Best/Worst Field berechnen
    const completedFields = Object.entries(statsPerField)
      .filter(([_, s]) => s.attempts > 0)
      .map(([field, s]) => ({ field, darts: s.darts }))

    const bestField = completedFields.length > 0
      ? completedFields.reduce((best, curr) => curr.darts < best.darts ? curr : best)
      : null
    const worstField = completedFields.length > 0
      ? completedFields.reduce((worst, curr) => curr.darts > worst.darts ? curr : worst)
      : null

    // Problematic Fields (>2x Durchschnitt)
    const avgDartsPerField = actualFieldsCompleted > 0 ? totalDarts / actualFieldsCompleted : 0
    const problematicFields = completedFields
      .filter(f => f.darts > avgDartsPerField * 2)
      .map(f => f.field)

    // Misses per Field
    const missesPerField: Record<string, number> = {}
    for (const [field, s] of Object.entries(statsPerField)) {
      if (s.misses > 0) {
        missesPerField[field] = s.misses
      }
    }

    // Vergleich 1-10 vs 11-Bull
    let darts1to10 = 0
    let fields1to10 = 0
    let darts11toBull = 0
    let fields11toBull = 0

    for (const [field, s] of Object.entries(statsPerField)) {
      if (s.attempts === 0) continue
      const fieldNum = field === 'BULL' ? 21 : parseInt(field)
      if (fieldNum <= 10) {
        darts1to10 += s.darts
        fields1to10 += s.attempts
      } else {
        darts11toBull += s.darts
        fields11toBull += s.attempts
      }
    }

    const comparison1to10 = fields1to10 > 0 ? darts1to10 / fields1to10 : 0
    const comparison11toBull = fields11toBull > 0 ? darts11toBull / fields11toBull : 0

    // First-Dart-Hit-Rate
    const firstDartHitRate = actualFieldsCompleted > 0 ? (firstDartHits / actualFieldsCompleted) * 100 : 0

    // Bull Hit Rate
    const bullHitRate = bullAttempts > 0 ? (bullHits / bullAttempts) * 100 : 0

    results.push({
      playerId: pid,
      playerName: player.name,
      totalDarts,
      durationMs,
      avgDartsPerField,
      fieldsCompleted: actualFieldsCompleted,
      statsPerField,
      firstDartHitRate,
      bestField,
      worstField,
      triples,
      doubles,
      singles,
      bullHitRate,
      misses,
      missesPerField,
      longestMissSeries,
      problematicFields,
      firstDartStreak,
      perfectTurns,
      comparison1to10,
      comparison11toBull,
      isWinner: match.winnerId === pid,
    })
  }

  return results
}

// =====================================================
// LANGZEIT-STATISTIKEN (über viele Matches)
// =====================================================

export type FieldProfile = {
  field: string
  avgDarts: number
  firstDartHitRate: number
  missRate: number
  samples: number
  trend: 'improving' | 'stable' | 'declining'
}

export type ATBLongTermStats = {
  playerId: string

  // Übersicht
  matchesPlayed: number
  matchesWon: number
  legsWon: number
  winRate: number
  totalDarts: number
  totalTime: number

  // Zahlen-Profil (1-20 + Bull)
  fieldProfile: Record<string, FieldProfile>

  // Konsistenz
  avgDartsToFinish: number
  bestRound: { darts: number; date: string; matchId: string } | null
  worstRound: { darts: number; date: string; matchId: string } | null
  variance: number

  // Fortschritt
  personalBestDarts: number | null
  personalBestTime: number | null
  movingAvgDarts: number // letzte 10 Matches
  improvementTrend: 'improving' | 'stable' | 'declining'

  // Bull-Statistiken
  bullHitRate: number
  avgDartsToBull: number
  bullSamples: number

  // Skill-Score (0-100)
  skillScore: number

  // Totals
  totalTriples: number
  totalDoubles: number
  totalMisses: number
  overallHitRate: number
  overallFirstDartHitRate: number
}

/**
 * Berechnet Langzeit-Statistiken für einen Spieler über alle Matches
 */
export function computeATBLongTermStats(
  playerId: string,
  allMatches: ATBStoredMatch[]
): ATBLongTermStats {
  // Nur Matches mit diesem Spieler (beendet)
  const playerMatches = allMatches.filter(m =>
    m.finished && m.players.some(p => p.playerId === playerId)
  ).sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? ''))

  // Initialisiere Ergebnis
  const result: ATBLongTermStats = {
    playerId,
    matchesPlayed: playerMatches.length,
    matchesWon: 0,
    legsWon: 0,
    winRate: 0,
    totalDarts: 0,
    totalTime: 0,
    fieldProfile: {},
    avgDartsToFinish: 0,
    bestRound: null,
    worstRound: null,
    variance: 0,
    personalBestDarts: null,
    personalBestTime: null,
    movingAvgDarts: 0,
    improvementTrend: 'stable',
    bullHitRate: 0,
    avgDartsToBull: 0,
    bullSamples: 0,
    skillScore: 0,
    totalTriples: 0,
    totalDoubles: 0,
    totalMisses: 0,
    overallHitRate: 0,
    overallFirstDartHitRate: 0,
  }

  if (playerMatches.length === 0) return result

  // Aggregierte Daten sammeln
  const allFieldData: Record<string, { darts: number[]; firstDartHits: number; total: number; misses: number }> = {}
  const matchDarts: { darts: number; date: string; matchId: string }[] = []
  let totalFirstDartHits = 0
  let totalFieldsCompleted = 0
  let bullDarts = 0
  let bullHits = 0

  for (const match of playerMatches) {
    const stats = computeATBDetailedStats(match)
    const playerStats = stats.find(s => s.playerId === playerId)
    if (!playerStats) continue

    // Wins
    if (match.winnerId === playerId) {
      result.matchesWon++
    }

    // Legs gewonnen zählen
    for (const ev of match.events) {
      if (ev.type === 'ATBLegFinished' && (ev as any).winnerPlayerId === playerId) {
        result.legsWon++
      }
    }

    // Totals
    result.totalDarts += playerStats.totalDarts
    result.totalTime += playerStats.durationMs
    result.totalTriples += playerStats.triples
    result.totalDoubles += playerStats.doubles
    result.totalMisses += playerStats.misses

    // Track Darts per Match
    matchDarts.push({
      darts: playerStats.totalDarts,
      date: match.createdAt ?? '',
      matchId: match.id,
    })

    // Best/Worst Round
    if (!result.bestRound || playerStats.totalDarts < result.bestRound.darts) {
      result.bestRound = { darts: playerStats.totalDarts, date: match.createdAt ?? '', matchId: match.id }
    }
    if (!result.worstRound || playerStats.totalDarts > result.worstRound.darts) {
      result.worstRound = { darts: playerStats.totalDarts, date: match.createdAt ?? '', matchId: match.id }
    }

    // Personal Best (nur bei Siegen)
    if (match.winnerId === playerId) {
      if (!result.personalBestDarts || playerStats.totalDarts < result.personalBestDarts) {
        result.personalBestDarts = playerStats.totalDarts
      }
      if (playerStats.durationMs && (!result.personalBestTime || playerStats.durationMs < result.personalBestTime)) {
        result.personalBestTime = playerStats.durationMs
      }
    }

    // Field Profile aggregieren
    for (const [field, fieldStats] of Object.entries(playerStats.statsPerField)) {
      if (!allFieldData[field]) {
        allFieldData[field] = { darts: [], firstDartHits: 0, total: 0, misses: 0 }
      }
      if (fieldStats.attempts > 0) {
        allFieldData[field].darts.push(fieldStats.darts)
        allFieldData[field].firstDartHits += fieldStats.firstDartHits
        allFieldData[field].total += fieldStats.attempts
        allFieldData[field].misses += fieldStats.misses
      }
    }

    // First-Dart-Hits total
    totalFirstDartHits += Math.round(playerStats.firstDartHitRate * playerStats.fieldsCompleted / 100)
    totalFieldsCompleted += playerStats.fieldsCompleted

    // Bull stats
    if (playerStats.statsPerField['BULL']) {
      const bullField = playerStats.statsPerField['BULL']
      bullDarts += bullField.darts
      bullHits += bullField.attempts
      result.bullSamples++
    }
  }

  // Berechne Averages
  result.winRate = playerMatches.length > 0 ? (result.matchesWon / playerMatches.length) * 100 : 0
  result.avgDartsToFinish = matchDarts.length > 0
    ? matchDarts.reduce((sum, m) => sum + m.darts, 0) / matchDarts.length
    : 0

  // Varianz berechnen
  if (matchDarts.length > 1) {
    const mean = result.avgDartsToFinish
    const squaredDiffs = matchDarts.map(m => Math.pow(m.darts - mean, 2))
    result.variance = squaredDiffs.reduce((a, b) => a + b, 0) / matchDarts.length
  }

  // Moving Average (letzte 10)
  const last10 = matchDarts.slice(-10)
  result.movingAvgDarts = last10.length > 0
    ? last10.reduce((sum, m) => sum + m.darts, 0) / last10.length
    : 0

  // Trend berechnen (Vergleich erste Hälfte vs zweite Hälfte)
  if (matchDarts.length >= 6) {
    const half = Math.floor(matchDarts.length / 2)
    const firstHalf = matchDarts.slice(0, half)
    const secondHalf = matchDarts.slice(half)
    const avgFirst = firstHalf.reduce((s, m) => s + m.darts, 0) / firstHalf.length
    const avgSecond = secondHalf.reduce((s, m) => s + m.darts, 0) / secondHalf.length

    if (avgSecond < avgFirst * 0.95) {
      result.improvementTrend = 'improving'
    } else if (avgSecond > avgFirst * 1.05) {
      result.improvementTrend = 'declining'
    } else {
      result.improvementTrend = 'stable'
    }
  }

  // Field Profile berechnen
  for (const [field, data] of Object.entries(allFieldData)) {
    if (data.darts.length === 0) continue

    const avgDarts = data.darts.reduce((a, b) => a + b, 0) / data.darts.length
    const firstDartHitRate = data.total > 0 ? (data.firstDartHits / data.total) * 100 : 0
    // Miss-Rate: Fehlwürfe / Gesamtwürfe (total = attempts = alle Würfe auf dieses Feld)
    const missRate = data.total > 0 ? (data.misses / data.total) * 100 : 0

    // Trend für dieses Feld (letzte 5 vs erste 5)
    let trend: 'improving' | 'stable' | 'declining' = 'stable'
    if (data.darts.length >= 6) {
      const fh = data.darts.slice(0, 3)
      const sh = data.darts.slice(-3)
      const avgF = fh.reduce((a, b) => a + b, 0) / fh.length
      const avgS = sh.reduce((a, b) => a + b, 0) / sh.length
      if (avgS < avgF * 0.9) trend = 'improving'
      else if (avgS > avgF * 1.1) trend = 'declining'
    }

    result.fieldProfile[field] = {
      field,
      avgDarts,
      firstDartHitRate,
      missRate,
      samples: data.darts.length,
      trend,
    }
  }

  // Bull-Statistiken
  result.bullHitRate = bullDarts > 0 ? (bullHits / bullDarts) * 100 : 0
  result.avgDartsToBull = result.bullSamples > 0 ? bullDarts / result.bullSamples : 0

  // Overall rates
  const totalHits = result.totalDarts - result.totalMisses
  result.overallHitRate = result.totalDarts > 0 ? (totalHits / result.totalDarts) * 100 : 0
  result.overallFirstDartHitRate = totalFieldsCompleted > 0 ? (totalFirstDartHits / totalFieldsCompleted) * 100 : 0

  // Skill-Score berechnen (0-100)
  // Basiert auf: Avg Darts (50%), First-Dart-Rate (25%), Win-Rate (25%)
  const optimalDarts = 21 // Theoretisches Optimum: 21 Darts für 21 Felder
  const dartsScore = Math.max(0, 100 - ((result.avgDartsToFinish - optimalDarts) / optimalDarts) * 50)
  const firstDartScore = result.overallFirstDartHitRate
  const winScore = result.winRate

  result.skillScore = Math.round(
    dartsScore * 0.5 +
    firstDartScore * 0.25 +
    winScore * 0.25
  )
  result.skillScore = Math.min(100, Math.max(0, result.skillScore))

  return result
}

// =====================================================
// FELD-INSIGHTS (Lieblings- & Problemfelder)
// =====================================================

export type ATBFieldInsight = {
  field: string
  avgDarts: number
  firstDartHitRate: number
  missRate: number
  samples: number
  trend: 'improving' | 'stable' | 'declining'
}

/**
 * Extrahiert die Top-3 Lieblings- und Problemfelder aus den Langzeit-Stats
 */
export function getATBFieldInsights(stats: ATBLongTermStats): {
  favorites: ATBFieldInsight[]  // Top 3 niedrigste Ø Darts
  problems: ATBFieldInsight[]   // Top 3 höchste Ø Darts
} {
  const fields = Object.values(stats.fieldProfile)
    .filter(f => f.samples >= 3)  // Mindestens 3 Samples für valide Daten
    .map(f => ({
      field: f.field,
      avgDarts: f.avgDarts,
      firstDartHitRate: f.firstDartHitRate,
      missRate: f.missRate,
      samples: f.samples,
      trend: f.trend,
    }))
    .sort((a, b) => a.avgDarts - b.avgDarts)

  return {
    favorites: fields.slice(0, 3),
    problems: fields.slice(-3).reverse()
  }
}

/**
 * Berechnet Farbcode für Dartboard-Heatmap basierend auf Ø Darts
 */
export function getATBFieldColor(avgDarts: number): 'green' | 'yellow' | 'red' | 'gray' {
  if (avgDarts === 0) return 'gray'  // Keine Daten
  if (avgDarts <= 1.5) return 'green'
  if (avgDarts <= 2.5) return 'yellow'
  return 'red'
}
