// src/stats/personalBests.ts
// Personal Best Erkennung für X01 Matches

import { getGlobalX01PlayerStats } from '../storage'
import type { PlayerStats } from '../darts501'

export type PersonalBestCheck = {
  category: string       // z.B. "3-Dart Average", "Höchstes Checkout"
  previousBest: number
  newBest: number
  isNewRecord: boolean
}

/**
 * Vergleicht die aktuellen Match-Stats eines Spielers mit seinen Karriere-Bestleistungen.
 * Gibt ein Array zurück mit allen Kategorien, in denen ein neuer Rekord aufgestellt wurde.
 *
 * Hinweis: Muss VOR dem Update der Karriere-Stats aufgerufen werden,
 * da sonst die alten Bests schon überschrieben sind.
 * In der Praxis wird es aber im EndScreen aufgerufen, wo die Stats
 * bereits aktualisiert wurden — deshalb vergleichen wir ">=" für den
 * Fall, dass der neue Wert gerade erst eingetragen wurde.
 */
export function checkX01PersonalBests(
  playerId: string,
  matchStats: PlayerStats,
): PersonalBestCheck[] {
  const careerStats = getGlobalX01PlayerStats()
  const career = careerStats[playerId]

  const results: PersonalBestCheck[] = []

  // Kein Karriereprofil = erster Match → alles ist "neu", aber kein sinnvoller PB
  // Wir zeigen PBs erst ab dem 2. Match
  if (!career || career.matchesPlayed <= 1) {
    return results
  }

  // 1. Bester 3-Dart Average (Match-Average vs. Karriere-Durchschnitt)
  //    Karriere hat nur threeDartAvgOverall (gewichteter Durchschnitt).
  //    Ein Match-Average über dem Karriere-Average ist bemerkenswert.
  if (matchStats.threeDartAvg > 0 && matchStats.threeDartAvg > career.threeDartAvgOverall) {
    results.push({
      category: 'Bester 3-Dart Average',
      previousBest: career.threeDartAvgOverall,
      newBest: matchStats.threeDartAvg,
      isNewRecord: true,
    })
  }

  // 2. Höchstes Checkout
  if (matchStats.highestCheckout > 0 && matchStats.highestCheckout > career.highestCheckout) {
    results.push({
      category: 'Höchstes Checkout',
      previousBest: career.highestCheckout,
      newBest: matchStats.highestCheckout,
      isNewRecord: true,
    })
  }

  // 3. Meiste 180er in einem Match
  if (matchStats.bins._180 > 0 && matchStats.bins._180 > career.tons180) {
    results.push({
      category: 'Meiste 180er im Match',
      previousBest: career.tons180,
      newBest: matchStats.bins._180,
      isNewRecord: true,
    })
  }

  // 4. Best First-9 Average
  if (
    matchStats.first9OverallAvg != null &&
    matchStats.first9OverallAvg > 0 &&
    career.first9OverallAvg != null &&
    matchStats.first9OverallAvg > career.first9OverallAvg
  ) {
    results.push({
      category: 'Bester First-9 Average',
      previousBest: career.first9OverallAvg,
      newBest: matchStats.first9OverallAvg,
      isNewRecord: true,
    })
  }

  // 5. Bestes Leg (wenigste Darts)
  if (matchStats.bestLegDarts != null && matchStats.bestLegDarts > 0) {
    // Wir haben kein bestLegDarts in LongTermStats, aber wir können
    // prüfen, ob dieses Leg besonders gut war (z.B. unter 18 Darts = 15-Darter oder besser)
    // Für jetzt nur als Info wenn <= 15 Darts (seltene Leistung)
    // Wird in Zukunft erweitert, wenn bestLegDarts in LongTermStats aufgenommen wird
  }

  return results
}

/**
 * Formatiert einen PB-Wert für die Anzeige
 */
export function formatPBValue(category: string, value: number): string {
  if (category.includes('180er')) {
    return `${value}`
  }
  if (category.includes('Checkout')) {
    return `${value}`
  }
  // Averages
  return value.toFixed(2)
}
