// src/types/aroundTheBlock.ts
// Types für Around the Block Spielmodus

import type { ATBEvent, ATBMode, ATBDirection, ATBPlayer, ATBStructure } from '../dartsAroundTheBlock'

export type { ATBMode, ATBDirection, ATBPlayer, ATBEvent, ATBStructure }

// ===== Erweiterte Konfigurationstypen =====

/** Reihenfolge der Zahlen */
export type ATBSequenceMode = 'ascending' | 'board' | 'random'

/** Welche Felder getroffen werden müssen */
export type ATBTargetMode = 'any' | 'single' | 'double' | 'triple' | 'mixed' | 'mixedRandom'

/** Wie Treffer gezählt werden (Sprünge) */
export type ATBMultiplierMode = 'standard' | 'standard2' | 'single'

/** Spezialregeln */
export type ATBSpecialRule = 'none' | 'bullHeavy' | 'suddenDeath' | 'noDoubleEscape' | 'miss3Back'

/** Variante für Miss-3-Back Regel */
export type ATBMiss3BackVariant = 'previous' | 'start'

/** Bull-Position in der Sequenz */
export type ATBBullPosition = 'start' | 'end' | 'random'

/** Spielmodus: Klassisch (jeder für sich). 'capture'/'pirate' = Legacy für alte gespeicherte Matches */
export type ATBGameMode = 'individual' | 'capture' | 'pirate'

/** Ein einzelnes Ziel in der Sequenz */
export type ATBTarget = {
  number: number | 'BULL'
  requiredMultiplier?: 1 | 2 | 3  // undefined = any (S/D/T egal)
}

/** Erweiterte Match-Konfiguration */
export type ATBMatchConfig = {
  sequenceMode: ATBSequenceMode
  targetMode: ATBTargetMode
  multiplierMode: ATBMultiplierMode
  specialRule: ATBSpecialRule
  miss3BackVariant?: ATBMiss3BackVariant  // Nur wenn specialRule === 'miss3Back'
  bullPosition?: ATBBullPosition  // Position von Bull in der Sequenz (default: 'end')
  // Legacy: gameMode für alte gespeicherte Matches ('capture'/'pirate')
  gameMode?: ATBGameMode  // Default: 'individual'
}

/** Spieler-spezifischer Spezialregel-Status */
export type ATBPlayerSpecialState = {
  needsBull?: boolean           // Bull Heavy: muss Bull treffen
  mustUseDouble?: boolean       // No Double Escape: muss Double verwenden
  consecutiveMisses?: number    // Miss3Back: Fehlwürfe zählen
  eliminated?: boolean          // Sudden Death: aus dem Spiel
  bullHit?: boolean             // Bull Random: wurde Bull bereits getroffen?
}

/** Default-Konfiguration (Legacy-Kompatibilität) */
export const DEFAULT_ATB_CONFIG: ATBMatchConfig = {
  sequenceMode: 'ascending',
  targetMode: 'any',
  multiplierMode: 'standard',
  specialRule: 'none',
}

export type ATBStoredMatch = {
  id: string
  title: string
  matchName?: string
  notes?: string
  createdAt: string
  players: ATBPlayer[]
  mode: ATBMode
  direction: ATBDirection
  structure: ATBStructure // Legs/Sets Struktur
  events: ATBEvent[]
  finished?: boolean
  finishedAt?: string
  durationMs?: number
  winnerId?: string
  winnerDarts?: number
  allEliminated?: boolean // Sudden Death: alle Spieler eliminiert
  // Leg/Set Ergebnisse
  legWins?: Record<string, number>
  setWins?: Record<string, number>
  // NEU: Erweiterte Konfiguration
  config?: ATBMatchConfig
  // NEU: Generierte Sequenz (für random/mixedRandom Modi)
  generatedSequence?: ATBTarget[]
  // Capture the Field: Feld-Gewinner pro Leg
  captureFieldWinners?: Record<string, string | null>  // "1" -> playerId | null (Gleichstand)
  captureTotalScores?: Record<string, number>  // playerId -> Gesamtpunkte (für Tiebreaker)
}

export type ATBHighscore = {
  id: string
  playerId: string
  playerName: string
  mode: ATBMode
  direction: ATBDirection
  durationMs: number
  darts: number
  date: string
}
