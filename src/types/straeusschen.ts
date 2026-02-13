// src/types/straeusschen.ts
// Types für Sträußchen Spielmodus

import type { StrEvent, StrPlayer, StrStructure, StrMode, StrNumberOrder, StrTurnOrder } from '../dartsStraeusschen'

export type { StrEvent, StrPlayer, StrStructure, StrMode, StrNumberOrder, StrTurnOrder }

// Zielzahlen (25 = Bull)
export type StrTargetNumber = 17 | 18 | 19 | 20 | 25

// Ring-Modus: Triple oder Double
export type StrRingMode = 'triple' | 'double'

// Bull-Modus: nur rotes Bull (Double Bull) oder beide (Single + Double Bull)
export type StrBullMode = 'red-only' | 'both'

// Bull-Position bei "Alle + Fest": Am Anfang, Am Ende, Zufall
export type StrBullPosition = 'start' | 'end' | 'random'

// Gespeichertes Match
export type StrStoredMatch = {
  id: string
  title: string
  createdAt: string
  players: StrPlayer[]
  mode: StrMode
  targetNumber?: StrTargetNumber
  numberOrder?: StrNumberOrder
  turnOrder?: StrTurnOrder
  generatedOrder?: StrTargetNumber[]
  structure: StrStructure
  events: StrEvent[]
  finished?: boolean
  finishedAt?: string
  durationMs?: number
  winnerId?: string
  winnerDarts?: number
  legWins?: Record<string, number>
  setWins?: Record<string, number>
  ringMode?: StrRingMode          // default 'triple' (Rückwärtskompatibilität)
  bullMode?: StrBullMode          // nur wenn Bull im Spiel
  bullPosition?: StrBullPosition  // nur bei mode='all' + numberOrder='fixed'
}
