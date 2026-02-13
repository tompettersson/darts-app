// src/dartsAroundTheBlock.ts
// Around the Block - Trainings-Spielmodus
// Treffe alle Zahlen von 1-20 + Bull in verschiedenen Reihenfolgen

import type {
  ATBSequenceMode,
  ATBTargetMode,
  ATBMultiplierMode,
  ATBSpecialRule,
  ATBMiss3BackVariant,
  ATBBullPosition,
  ATBTarget,
  ATBMatchConfig,
  ATBPlayerSpecialState,
  ATBGameMode,
  ATBPirateConfig,
} from './types/aroundTheBlock'
import { DEFAULT_ATB_CONFIG } from './types/aroundTheBlock'

export type {
  ATBSequenceMode,
  ATBTargetMode,
  ATBMultiplierMode,
  ATBSpecialRule,
  ATBMiss3BackVariant,
  ATBBullPosition,
  ATBTarget,
  ATBMatchConfig,
  ATBPlayerSpecialState,
  ATBGameMode,
  ATBPirateConfig,
}

export { DEFAULT_ATB_CONFIG }

// ===== Konstanten =====

// Aufsteigende Reihenfolge: 1, 2, 3, ... 20, Bull
export const SEQUENCE_ASCENDING: readonly (number | 'BULL')[] = [
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 'BULL'
]

// Dartboard-Reihenfolge (im Uhrzeigersinn): 1, 18, 4, 13, ...
export const SEQUENCE_BOARD: readonly (number | 'BULL')[] = [
  1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5, 20, 'BULL'
]

// ===== Shuffle Helper =====

// Kryptografisch sichere Zufallszahl für echte Randomness
function secureRandom(): number {
  const array = new Uint32Array(1)
  crypto.getRandomValues(array)
  return array[0] / (0xFFFFFFFF + 1)
}

function shuffle<T>(array: T[]): T[] {
  const result = [...array]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(secureRandom() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

function randomChoice<T>(options: T[]): T {
  return options[Math.floor(secureRandom() * options.length)]
}

// ===== Erweiterte Sequenz-Generierung =====

/**
 * Generiert die Ziel-Sequenz basierend auf der Konfiguration.
 * Wird einmal bei Match-Start aufgerufen und gespeichert.
 */
export function generateATBSequence(
  config: ATBMatchConfig,
  direction: 'forward' | 'backward'
): ATBTarget[] {
  const bullPosition = config.bullPosition ?? 'end'

  // 1. Basis-Reihenfolge der Zahlen bestimmen (OHNE Bull)
  let numbersOnly: number[]
  switch (config.sequenceMode) {
    case 'ascending':
      numbersOnly = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]
      break
    case 'board':
      numbersOnly = [1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5, 20]
      break
    case 'random':
      numbersOnly = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20])
      break
  }

  // 2. Richtung anwenden (nur auf Zahlen)
  if (direction === 'backward') {
    numbersOnly = numbersOnly.reverse()
  }

  // 3. Bull-Position bestimmen
  let numbers: (number | 'BULL')[]
  switch (bullPosition) {
    case 'start':
      numbers = ['BULL', ...numbersOnly]
      break
    case 'end':
      numbers = [...numbersOnly, 'BULL']
      break
    case 'random':
      // Zufällige Position für Bull (0 bis 20, also 21 mögliche Positionen)
      const bullIndex = Math.floor(secureRandom() * 21)
      numbers = [...numbersOnly]
      numbers.splice(bullIndex, 0, 'BULL')
      break
  }

  // 4. Ziele basierend auf targetMode erzeugen
  let targets: ATBTarget[]
  switch (config.targetMode) {
    case 'any':
      // Alle Multiplier erlaubt
      targets = numbers.map(n => ({ number: n }))
      break

    case 'single':
      // Nur Single-Felder
      targets = numbers.map(n => ({ number: n, requiredMultiplier: 1 as const }))
      break

    case 'double':
      // Nur Double-Felder (inkl. Double Bull)
      targets = numbers.map(n => ({ number: n, requiredMultiplier: 2 as const }))
      break

    case 'triple':
      // Nur Triple-Felder (kein Triple Bull!)
      targets = numbers
        .filter(n => n !== 'BULL') // Bull hat kein Triple
        .map(n => ({ number: n, requiredMultiplier: 3 as const }))
      // Am Ende normales Bull hinzufügen
      targets.push({ number: 'BULL', requiredMultiplier: 1 })
      break

    case 'mixed':
      // S→D→T pro Zahl (Bull nur S und D)
      targets = []
      for (const n of numbers) {
        if (n === 'BULL') {
          targets.push({ number: 'BULL', requiredMultiplier: 1 })
          targets.push({ number: 'BULL', requiredMultiplier: 2 })
        } else {
          targets.push({ number: n, requiredMultiplier: 1 })
          targets.push({ number: n, requiredMultiplier: 2 })
          targets.push({ number: n, requiredMultiplier: 3 })
        }
      }
      break

    case 'mixedRandom':
      // Zufälliger Multiplier pro Zahl
      targets = numbers.map(n => ({
        number: n,
        requiredMultiplier: n === 'BULL'
          ? randomChoice([1, 2] as const)
          : randomChoice([1, 2, 3] as const)
      }))
      break
  }

  return targets
}

/**
 * Prüft ob ein Dart das aktuelle Ziel trifft
 */
export function isATBHit(
  dart: ATBDart,
  target: ATBTarget
): boolean {
  if (dart.target === 'MISS') return false

  // Prüfe ob die Zahl stimmt
  const dartNumber = dart.target
  if (dartNumber !== target.number) return false

  // Prüfe Multiplier-Anforderung
  if (target.requiredMultiplier !== undefined) {
    return dart.mult === target.requiredMultiplier
  }

  // Bei 'any': jeder Treffer auf die Zahl zählt
  return true
}

/**
 * Berechnet den Sprung-Wert basierend auf Multiplier-Mode
 */
export function getJumpValue(
  dartMult: 1 | 2 | 3,
  config: ATBMatchConfig
): number {
  // Bei spezifischen Target-Modi: immer 1 Feld pro Treffer
  if (config.targetMode !== 'any') {
    return 1
  }

  // Bei 'any' Target-Mode: Multiplier-Mode entscheidet
  switch (config.multiplierMode) {
    case 'standard':
      return dartMult // S=1, D=2, T=3
    case 'standard2':
      return dartMult === 1 ? 1 : 2 // S=1, D=2, T=2
    case 'single':
      return 1 // Alle gleich
  }
}

// ===== Types =====

export type ATBMode = 'ascending' | 'board'
export type ATBDirection = 'forward' | 'backward'

// Legs/Sets Struktur (analog zu X01)
export type ATBStructure =
  | { kind: 'legs'; bestOfLegs: number }
  | { kind: 'sets'; bestOfSets: number; legsPerSet: number }

export type ATBPlayer = {
  playerId: string
  name: string
  isGuest?: boolean
}

export type ATBDart = {
  target: number | 'BULL' | 'MISS'
  mult: 1 | 2 | 3
}

// Events (Event-Sourcing)
export type ATBMatchStartedEvent = {
  type: 'ATBMatchStarted'
  eventId: string
  matchId: string
  ts: string
  players: ATBPlayer[]
  mode: ATBMode
  direction: ATBDirection
  structure: ATBStructure
  // NEU: Erweiterte Konfiguration
  config?: ATBMatchConfig
  // NEU: Generierte Sequenz (für random/mixedRandom)
  generatedSequence?: ATBTarget[]
}

export type ATBLegStartedEvent = {
  type: 'ATBLegStarted'
  eventId: string
  matchId: string
  ts: string
  legId: string
  legIndex: number
  setIndex?: number // Nur bei Sets-Modus
  // NEU: Neue Sequenz für dieses Leg (bei Random-Modi)
  newExtendedSequence?: ATBTarget[]
}

export type ATBTurnAddedEvent = {
  type: 'ATBTurnAdded'
  eventId: string
  matchId: string
  legId: string
  ts: string
  playerId: string
  darts: ATBDart[]
  fieldsAdvanced: number
  newIndex: number
  // NEU: Spezialregel-Effekte
  specialEffects?: {
    eliminated?: boolean          // Sudden Death: Spieler ausgeschieden
    setBackTo?: number            // Miss3Back: Zurückgesetzt auf Index
    needsBull?: boolean           // Bull Heavy: Muss jetzt Bull treffen
    bullHit?: boolean             // Bull Heavy: Bull wurde getroffen
    missCount?: number            // Miss3Back: Aktuelle Fehlwurf-Zählung
    usedDouble?: boolean          // No Double Escape: Double verwendet
  }
  // Piratenmodus: Score für diesen Turn
  pirateScore?: number
}

export type ATBLegFinishedEvent = {
  type: 'ATBLegFinished'
  eventId: string
  matchId: string
  legId: string
  ts: string
  winnerId: string
  winnerDarts: number
}

export type ATBSetFinishedEvent = {
  type: 'ATBSetFinished'
  eventId: string
  matchId: string
  ts: string
  setIndex: number
  winnerId: string
}

export type ATBMatchFinishedEvent = {
  type: 'ATBMatchFinished'
  eventId: string
  matchId: string
  ts: string
  winnerId: string
  totalDarts: number
  durationMs: number
}

// Piratenmodus: Runde abgeschlossen (alle haben auf ein Feld geworfen)
export type ATBPirateRoundFinishedEvent = {
  type: 'ATBPirateRoundFinished'
  eventId: string
  matchId: string
  legId: string
  ts: string
  fieldIndex: number
  fieldNumber: number | 'BULL'
  scoresByPlayer: Record<string, number>  // playerId -> Punkte in dieser Runde
  winnerId: string | null  // null = Gleichstand
}

export type ATBEvent =
  | ATBMatchStartedEvent
  | ATBLegStartedEvent
  | ATBTurnAddedEvent
  | ATBLegFinishedEvent
  | ATBSetFinishedEvent
  | ATBMatchFinishedEvent
  | ATBPirateRoundFinishedEvent

// Derived State
export type ATBState = {
  match: {
    matchId: string
    players: ATBPlayer[]
    mode: ATBMode
    direction: ATBDirection
    structure: ATBStructure
    sequence: readonly (number | 'BULL')[]
    // NEU: Erweiterte Konfiguration
    config?: ATBMatchConfig
    // NEU: Erweiterte Sequenz mit Ziel-Typen
    extendedSequence?: ATBTarget[]
  } | null
  // Aktuelles Leg
  currentLegId: string | null
  currentLegIndex: number
  currentSetIndex: number
  currentIndexByPlayer: Record<string, number> // Index in der Sequenz (0 = erstes Feld)
  dartsUsedByPlayer: Record<string, number> // Darts im aktuellen Leg
  dartsUsedTotalByPlayer: Record<string, number> // Darts im gesamten Match
  turnIndex: number // Wer ist dran (0 = erster Spieler)
  startPlayerIndex: number // Wer hat das Leg begonnen (für Rotation)
  startTime: number // Timestamp in ms
  // Leg/Set Siege
  legWinsByPlayer: Record<string, number> // Im aktuellen Set (bei Sets-Modus)
  setWinsByPlayer: Record<string, number>
  totalLegWinsByPlayer: Record<string, number> // Gesamte Legs (bei Legs-Modus)
  finished: {
    winnerId: string
    totalDarts: number
    durationMs: number
  } | null
  events: ATBEvent[]
  // NEU: Spezialregel-Status pro Spieler
  specialStateByPlayer: Record<string, ATBPlayerSpecialState>
  // Piratenmodus-State
  pirateState?: {
    currentFieldIndex: number  // Welches Feld ist gerade dran (0-20)
    fieldWinners: Record<string, string | null>  // "1", "2", ..., "BULL" -> playerId | null
    totalScoreByPlayer: Record<string, number>  // playerId -> Gesamtpunkte (Tiebreaker)
    currentRoundTurns: Record<string, { darts: ATBDart[]; score: number }>  // Würfe dieser Runde
    playersCompletedThisRound: string[]  // Wer hat in dieser Runde schon geworfen
  }
}

// ===== Hilfsfunktionen =====

function id(): string {
  return Math.random().toString(36).slice(2, 11)
}

function now(): string {
  return new Date().toISOString()
}

export function getSequence(mode: ATBMode, direction: ATBDirection): readonly (number | 'BULL')[] {
  const base = mode === 'ascending' ? SEQUENCE_ASCENDING : SEQUENCE_BOARD
  return direction === 'forward' ? base : [...base].reverse()
}

export function getModeLabel(mode: ATBMode): string {
  return mode === 'ascending' ? 'Aufsteigend' : 'Drumherum'
}

export function getDirectionLabel(direction: ATBDirection): string {
  return direction === 'forward' ? 'Vorwärts' : 'Rückwärts'
}

// ===== Event Application =====

export function applyATBEvents(events: ATBEvent[]): ATBState {
  const state: ATBState = {
    match: null,
    currentLegId: null,
    currentLegIndex: 0,
    currentSetIndex: 1,
    currentIndexByPlayer: {},
    dartsUsedByPlayer: {},
    dartsUsedTotalByPlayer: {},
    turnIndex: 0,
    startPlayerIndex: 0,
    startTime: 0,
    legWinsByPlayer: {},
    setWinsByPlayer: {},
    totalLegWinsByPlayer: {},
    finished: null,
    events,
    specialStateByPlayer: {},
  }

  for (const event of events) {
    switch (event.type) {
      case 'ATBMatchStarted': {
        const sequence = getSequence(event.mode, event.direction)
        state.match = {
          matchId: event.matchId,
          players: event.players,
          mode: event.mode,
          direction: event.direction,
          structure: event.structure,
          sequence,
          config: event.config,
          extendedSequence: event.generatedSequence,
        }
        // Alle Spieler initialisieren
        for (const p of event.players) {
          state.currentIndexByPlayer[p.playerId] = 0
          state.dartsUsedByPlayer[p.playerId] = 0
          state.dartsUsedTotalByPlayer[p.playerId] = 0
          state.legWinsByPlayer[p.playerId] = 0
          state.setWinsByPlayer[p.playerId] = 0
          state.totalLegWinsByPlayer[p.playerId] = 0
          state.specialStateByPlayer[p.playerId] = {}
        }
        state.startTime = new Date(event.ts).getTime()

        // Piratenmodus initialisieren
        if (event.config?.gameMode === 'pirate') {
          const totalScoreByPlayer: Record<string, number> = {}
          for (const p of event.players) {
            totalScoreByPlayer[p.playerId] = 0
          }
          state.pirateState = {
            currentFieldIndex: 0,
            fieldWinners: {},
            totalScoreByPlayer,
            currentRoundTurns: {},
            playersCompletedThisRound: [],
          }
        }
        break
      }

      case 'ATBLegStarted': {
        state.currentLegId = event.legId
        state.currentLegIndex = event.legIndex
        if (event.setIndex !== undefined) {
          state.currentSetIndex = event.setIndex
        }
        // Reset für neues Leg
        if (state.match) {
          for (const p of state.match.players) {
            state.currentIndexByPlayer[p.playerId] = 0
            state.dartsUsedByPlayer[p.playerId] = 0
            // Spezialregel-Status zurücksetzen (außer eliminated bei Sudden Death Match)
            state.specialStateByPlayer[p.playerId] = {
              eliminated: state.specialStateByPlayer[p.playerId]?.eliminated,
            }
          }
          // Leg-Rotation: Der Startspieler rotiert pro Leg
          // Leg 0 = Spieler 0, Leg 1 = Spieler 1, etc.
          const playerCount = state.match.players.length
          state.startPlayerIndex = event.legIndex % playerCount
          state.turnIndex = state.startPlayerIndex

          // NEU: Bei Random-Modi neue Sequenz für dieses Leg übernehmen
          if (event.newExtendedSequence) {
            state.match.extendedSequence = event.newExtendedSequence
          }
        }
        // Piratenmodus: State für neues Leg zurücksetzen
        if (state.pirateState && state.match) {
          const totalScoreByPlayer: Record<string, number> = {}
          for (const p of state.match.players) {
            totalScoreByPlayer[p.playerId] = 0
          }
          state.pirateState = {
            currentFieldIndex: 0,
            fieldWinners: {},
            totalScoreByPlayer,
            currentRoundTurns: {},
            playersCompletedThisRound: [],
          }
        }
        break
      }

      case 'ATBTurnAdded': {
        state.dartsUsedByPlayer[event.playerId] += event.darts.length
        state.dartsUsedTotalByPlayer[event.playerId] += event.darts.length
        state.currentIndexByPlayer[event.playerId] = event.newIndex

        // Piratenmodus: Turn in currentRoundTurns speichern
        if (state.pirateState) {
          const score = (event as any).pirateScore ?? 0  // Score wird im Event mitgeliefert
          state.pirateState.currentRoundTurns[event.playerId] = {
            darts: event.darts,
            score,
          }
          if (!state.pirateState.playersCompletedThisRound.includes(event.playerId)) {
            state.pirateState.playersCompletedThisRound.push(event.playerId)
          }
        }

        // Spezialregel-Effekte verarbeiten
        if (event.specialEffects) {
          const specialState = state.specialStateByPlayer[event.playerId] ?? {}

          if (event.specialEffects.eliminated) {
            specialState.eliminated = true
          }
          if (event.specialEffects.setBackTo !== undefined) {
            state.currentIndexByPlayer[event.playerId] = event.specialEffects.setBackTo
          }
          if (event.specialEffects.needsBull !== undefined) {
            specialState.needsBull = event.specialEffects.needsBull
          }
          if (event.specialEffects.missCount !== undefined) {
            specialState.consecutiveMisses = event.specialEffects.missCount
          }
          if (event.specialEffects.usedDouble !== undefined) {
            specialState.mustUseDouble = event.specialEffects.usedDouble
          }
          if (event.specialEffects.bullHit) {
            specialState.bullHit = true
          }

          state.specialStateByPlayer[event.playerId] = specialState
        }

        // Nächster Spieler (überspringe eliminierte Spieler)
        if (state.match) {
          let nextTurn = (state.turnIndex + 1) % state.match.players.length
          // Bei Sudden Death: Überspringe eliminierte Spieler
          let attempts = 0
          while (
            state.specialStateByPlayer[state.match.players[nextTurn]?.playerId]?.eliminated &&
            attempts < state.match.players.length
          ) {
            nextTurn = (nextTurn + 1) % state.match.players.length
            attempts++
          }
          state.turnIndex = nextTurn
        }
        break
      }

      case 'ATBLegFinished': {
        state.totalLegWinsByPlayer[event.winnerId]++
        state.legWinsByPlayer[event.winnerId]++
        break
      }

      case 'ATBSetFinished': {
        state.setWinsByPlayer[event.winnerId]++
        // Reset Leg-Wins für nächstes Set
        if (state.match) {
          for (const p of state.match.players) {
            state.legWinsByPlayer[p.playerId] = 0
          }
        }
        break
      }

      case 'ATBMatchFinished': {
        state.finished = {
          winnerId: event.winnerId,
          totalDarts: event.totalDarts,
          durationMs: event.durationMs,
        }
        break
      }

      case 'ATBPirateRoundFinished': {
        if (state.pirateState) {
          // Feld-Gewinner speichern
          const fieldKey = String(event.fieldNumber)
          state.pirateState.fieldWinners[fieldKey] = event.winnerId

          // Gesamtpunkte aktualisieren
          for (const [playerId, score] of Object.entries(event.scoresByPlayer)) {
            state.pirateState.totalScoreByPlayer[playerId] =
              (state.pirateState.totalScoreByPlayer[playerId] ?? 0) + score
          }

          // Nächstes Feld
          state.pirateState.currentFieldIndex = event.fieldIndex + 1
          state.pirateState.currentRoundTurns = {}
          state.pirateState.playersCompletedThisRound = []

          // turnIndex zurücksetzen (ggf. mit Rotation)
          if (state.match?.config?.pirateConfig?.rotateOrder) {
            state.turnIndex = (state.startPlayerIndex + event.fieldIndex + 1) % state.match.players.length
          } else {
            state.turnIndex = 0
          }
        }
        break
      }
    }
  }

  return state
}

// ===== Game Logic =====

export function getActivePlayerId(state: ATBState): string | null {
  if (!state.match || state.finished) return null
  return state.match.players[state.turnIndex]?.playerId ?? null
}

export function getNextTarget(state: ATBState, playerId: string): number | 'BULL' | null {
  if (!state.match) return null
  const idx = state.currentIndexByPlayer[playerId] ?? 0

  // Erweiterte Sequenz verwenden falls vorhanden
  if (state.match.extendedSequence) {
    if (idx >= state.match.extendedSequence.length) return null
    return state.match.extendedSequence[idx].number
  }

  if (idx >= state.match.sequence.length) return null
  return state.match.sequence[idx]
}

/** Gibt das vollständige Ziel-Objekt zurück (inkl. requiredMultiplier) */
export function getNextTargetFull(state: ATBState, playerId: string): ATBTarget | null {
  if (!state.match) return null
  const idx = state.currentIndexByPlayer[playerId] ?? 0

  // Erweiterte Sequenz verwenden falls vorhanden
  if (state.match.extendedSequence) {
    if (idx >= state.match.extendedSequence.length) return null
    return state.match.extendedSequence[idx]
  }

  // Legacy: Keine requiredMultiplier
  if (idx >= state.match.sequence.length) return null
  return { number: state.match.sequence[idx] }
}

/** Gibt die Gesamtlänge der Sequenz zurück */
export function getSequenceLength(state: ATBState): number {
  if (!state.match) return 0
  if (state.match.extendedSequence) {
    return state.match.extendedSequence.length
  }
  return state.match.sequence.length
}

export function calculateAdvance(
  darts: ATBDart[],
  currentIndex: number,
  sequence: readonly (number | 'BULL')[]
): { fieldsAdvanced: number; newIndex: number } {
  let idx = currentIndex
  let advanced = 0
  const bullIndex = sequence.length - 1 // Bull ist immer das letzte Feld

  for (const dart of darts) {
    if (dart.target === 'MISS') continue
    if (idx >= sequence.length) break

    const target = sequence[idx]

    // Prüfe ob der Wurf das aktuelle Ziel trifft
    if (dart.target === target || (dart.target === 'BULL' && target === 'BULL')) {
      if (target === 'BULL') {
        // Bull getroffen = Abschluss (Double Bull zählt auch als Bull-Treffer)
        idx = sequence.length
        advanced++
      } else {
        // Bei Zahlen: Multiplier bestimmt Schritte
        // ABER: Man kann maximal bis zum Bull vorrücken, nicht darüber!
        // Um abzuschließen muss man explizit Bull treffen.
        const steps = dart.mult
        const maxSteps = bullIndex - idx // Maximal bis Bull-Index, nicht darüber
        const actualSteps = Math.min(steps, maxSteps)
        idx += actualSteps
        advanced += actualSteps
      }
    }
  }

  return { fieldsAdvanced: advanced, newIndex: idx }
}

/**
 * Erweiterte calculateAdvance für neue Modi mit ATBTarget-Sequenz
 * @param bullHit - Bei bullPosition='random': wurde Bull bereits getroffen?
 */
export function calculateAdvanceExtended(
  darts: ATBDart[],
  currentIndex: number,
  extendedSequence: ATBTarget[],
  config: ATBMatchConfig,
  bullHit: boolean = false
): { fieldsAdvanced: number; newIndex: number; hitsPerDart: boolean[]; newBullHit: boolean } {
  let idx = currentIndex
  let advanced = 0
  const hitsPerDart: boolean[] = []
  let localBullHit = bullHit

  // Finde den Index des (ersten) Bull-Ziels in der Sequenz
  const bullIndex = extendedSequence.findIndex(t => t.number === 'BULL')
  const bullPosition = config.bullPosition ?? 'end'

  for (const dart of darts) {
    if (dart.target === 'MISS') {
      hitsPerDart.push(false)
      continue
    }
    if (idx >= extendedSequence.length) {
      hitsPerDart.push(false)
      continue
    }

    const target = extendedSequence[idx]

    // Prüfe ob der Wurf das aktuelle Ziel trifft
    if (isATBHit(dart, target)) {
      hitsPerDart.push(true)

      // Bull-Treffer: Markiere als getroffen
      if (target.number === 'BULL') {
        localBullHit = true

        // Ist Bull das LETZTE Ziel in der Sequenz? (= Spielende)
        const isAtSequenceEnd = idx === extendedSequence.length - 1

        if (isAtSequenceEnd) {
          // Bull am Ende = Spieler hat gewonnen
          idx = extendedSequence.length
          advanced++
        } else {
          // Bull nicht am Ende (z.B. am Anfang oder in der Mitte bei Random)
          // → Einfach ein Feld weiter
          idx++
          advanced++
        }
      } else {
        // Zahlen-Treffer: Sprung-Wert berechnen
        const jump = getJumpValue(dart.mult, config)
        let actualJump = jump

        // Bei bullPosition='random' und Bull noch nicht getroffen:
        // Man kann nicht über Bull hinaus springen!
        if (bullPosition === 'random' && !localBullHit && bullIndex !== -1 && bullIndex > idx) {
          const newIdx = idx + jump
          if (newIdx > bullIndex) {
            // Stoppe vor Bull - kann nicht überspringen
            actualJump = bullIndex - idx
          }
        } else if (bullIndex > idx && bullIndex !== -1) {
          // Standard-Logik: Max bis Bull-Index
          const maxJump = bullIndex - idx
          actualJump = Math.min(jump, maxJump)
        } else {
          // Bull bereits passiert oder nicht vorhanden
          actualJump = Math.min(jump, extendedSequence.length - idx)
        }

        idx += actualJump
        advanced += actualJump
      }
    } else {
      hitsPerDart.push(false)
    }
  }

  return { fieldsAdvanced: advanced, newIndex: idx, hitsPerDart, newBullHit: localBullHit }
}

// ===== Match Creation =====

export function createATBMatchStartEvent(
  players: ATBPlayer[],
  mode: ATBMode,
  direction: ATBDirection,
  structure: ATBStructure = { kind: 'legs', bestOfLegs: 1 },
  config?: ATBMatchConfig
): ATBMatchStartedEvent {
  // Generiere Sequenz falls Config vorhanden
  let generatedSequence: ATBTarget[] | undefined
  if (config) {
    generatedSequence = generateATBSequence(config, direction)
  }

  return {
    type: 'ATBMatchStarted',
    eventId: id(),
    matchId: id(),
    ts: now(),
    players,
    mode,
    direction,
    structure,
    config,
    generatedSequence,
  }
}

export function createATBLegStartEvent(
  matchId: string,
  legIndex: number,
  setIndex?: number,
  config?: ATBMatchConfig,
  direction?: ATBDirection
): ATBLegStartedEvent {
  // Bei Random-Modi neue Sequenz für dieses Leg generieren
  let newExtendedSequence: ATBTarget[] | undefined = undefined
  if (config && direction) {
    const needsNewSequence =
      config.sequenceMode === 'random' ||
      config.targetMode === 'mixed' ||
      config.targetMode === 'mixedRandom' ||
      config.bullPosition === 'random' ||
      config.gameMode === 'pirate'

    if (needsNewSequence) {
      newExtendedSequence = generateATBSequence(config, direction)
    }
  }

  return {
    type: 'ATBLegStarted',
    eventId: id(),
    matchId,
    ts: now(),
    legId: id(),
    legIndex,
    setIndex,
    newExtendedSequence,
  }
}

// ===== Spezialregel-Verarbeitung =====

export type ATBSpecialEffects = {
  eliminated?: boolean
  setBackTo?: number
  needsBull?: boolean
  bullHit?: boolean
  missCount?: number
  usedDouble?: boolean
  doubleRequired?: boolean  // Zeigt an, dass Double erforderlich war aber nicht getroffen
}

/**
 * Verarbeitet Spezialregeln nach einem Turn
 */
export function processATBSpecialRules(
  state: ATBState,
  playerId: string,
  darts: ATBDart[],
  fieldsAdvanced: number,
  newIndex: number,
  hitsPerDart: boolean[]
): ATBSpecialEffects {
  if (!state.match?.config) return {}
  const config = state.match.config
  const specialState = state.specialStateByPlayer[playerId] ?? {}
  const effects: ATBSpecialEffects = {}

  switch (config.specialRule) {
    case 'suddenDeath': {
      // Wer in einer Aufnahme nichts trifft, verliert sofort
      if (fieldsAdvanced === 0) {
        effects.eliminated = true
      }
      break
    }

    case 'bullHeavy': {
      // Nach jedem Zahlenabschluss muss Bull getroffen werden
      if (specialState.needsBull) {
        // Prüfe ob Bull getroffen wurde
        const bullHit = darts.some(d => d.target === 'BULL')
        if (bullHit) {
          effects.needsBull = false
          effects.bullHit = true
        } else {
          // Kein Fortschritt möglich solange Bull nicht getroffen
          effects.needsBull = true
        }
      } else if (fieldsAdvanced > 0) {
        // Feld(er) abgeschlossen - jetzt muss Bull getroffen werden
        // (außer wenn das letzte Feld Bull war)
        const seqLength = state.match.extendedSequence?.length ?? state.match.sequence.length
        if (newIndex < seqLength) {
          effects.needsBull = true
        }
      }
      break
    }

    case 'noDoubleEscape': {
      // Wenn mit Double abgeschlossen, muss nächste Zahl auch mit Double
      if (fieldsAdvanced > 0) {
        // Finde den letzten erfolgreichen Dart
        for (let i = darts.length - 1; i >= 0; i--) {
          if (hitsPerDart[i]) {
            effects.usedDouble = darts[i].mult === 2
            break
          }
        }
      }
      break
    }

    case 'miss3Back': {
      // 3 Fehldarts → zurück
      const currentMisses = specialState.consecutiveMisses ?? 0

      if (fieldsAdvanced === 0) {
        // Keine Treffer in diesem Turn = Misses zählen
        const newMisses = currentMisses + darts.length
        if (newMisses >= 3) {
          // Zurücksetzen
          const variant = config.miss3BackVariant ?? 'previous'
          if (variant === 'start') {
            effects.setBackTo = 0
          } else {
            // Vorherige Zahl (mindestens 0)
            const currentIdx = state.currentIndexByPlayer[playerId] ?? 0
            effects.setBackTo = Math.max(0, currentIdx - 1)
          }
          effects.missCount = 0 // Reset nach Strafe
        } else {
          effects.missCount = newMisses
        }
      } else {
        // Treffer = Reset Miss-Counter
        effects.missCount = 0
      }
      break
    }
  }

  return effects
}

// ===== Turn Recording =====

export type ATBTurnResult = {
  turnEvent: ATBTurnAddedEvent
  legFinished?: ATBLegFinishedEvent
  setFinished?: ATBSetFinishedEvent
  matchFinished?: ATBMatchFinishedEvent
  nextLegStart?: ATBLegStartedEvent
}

export function recordATBTurn(
  state: ATBState,
  playerId: string,
  darts: ATBDart[]
): ATBTurnResult {
  if (!state.match) throw new Error('No match started')
  if (!state.currentLegId) throw new Error('No leg started')

  const currentIndex = state.currentIndexByPlayer[playerId] ?? 0
  const config = state.match.config
  const specialState = state.specialStateByPlayer[playerId] ?? {}

  // Berechne Fortschritt - verwende erweiterte Sequenz falls vorhanden
  let fieldsAdvanced: number
  let newIndex: number
  let hitsPerDart: boolean[] = []
  let newBullHit = specialState.bullHit ?? false

  if (state.match.extendedSequence && config) {
    const result = calculateAdvanceExtended(
      darts,
      currentIndex,
      state.match.extendedSequence,
      config,
      specialState.bullHit ?? false
    )
    fieldsAdvanced = result.fieldsAdvanced
    newIndex = result.newIndex
    hitsPerDart = result.hitsPerDart
    newBullHit = result.newBullHit
  } else {
    const result = calculateAdvance(darts, currentIndex, state.match.sequence)
    fieldsAdvanced = result.fieldsAdvanced
    newIndex = result.newIndex
    hitsPerDart = darts.map((d, i) => i < fieldsAdvanced) // Approximation für Legacy
  }

  // Spezialregeln verarbeiten
  const specialEffects = processATBSpecialRules(state, playerId, darts, fieldsAdvanced, newIndex, hitsPerDart)

  // Bull Random: bullHit-Status speichern wenn Bull neu getroffen wurde
  if (config?.bullPosition === 'random' && newBullHit && !specialState.bullHit) {
    specialEffects.bullHit = true
  }

  // Bei Bull Heavy: Kein Fortschritt wenn Bull benötigt aber nicht getroffen
  if (config?.specialRule === 'bullHeavy' && specialState.needsBull && !specialEffects.bullHit) {
    // Fortschritt blockieren
    fieldsAdvanced = 0
    newIndex = currentIndex
  }

  // Bei No Double Escape: Prüfe ob Double erforderlich war
  if (config?.specialRule === 'noDoubleEscape' && specialState.mustUseDouble && fieldsAdvanced > 0) {
    // Finde den ersten erfolgreichen Dart
    const firstHitIndex = hitsPerDart.findIndex(h => h)
    if (firstHitIndex >= 0 && darts[firstHitIndex]?.mult !== 2) {
      // Erster Treffer war kein Double - Fortschritt blockieren
      fieldsAdvanced = 0
      newIndex = currentIndex
      // mustUseDouble bleibt aktiv
      specialEffects.usedDouble = undefined
      specialEffects.doubleRequired = true
    }
  }

  // Bei setBackTo: Index überschreiben
  if (specialEffects.setBackTo !== undefined) {
    newIndex = specialEffects.setBackTo
  }

  const turnEvent: ATBTurnAddedEvent = {
    type: 'ATBTurnAdded',
    eventId: id(),
    matchId: state.match.matchId,
    legId: state.currentLegId,
    ts: now(),
    playerId,
    darts,
    fieldsAdvanced,
    newIndex,
    specialEffects: Object.keys(specialEffects).length > 0 ? specialEffects : undefined,
  }

  const result: ATBTurnResult = { turnEvent }

  // Sequenzlänge bestimmen
  const seqLength = state.match.extendedSequence?.length ?? state.match.sequence.length

  // Prüfe ob Spieler das Leg gewonnen hat (alle Felder erreicht)
  if (newIndex >= seqLength) {
    const legDarts = (state.dartsUsedByPlayer[playerId] ?? 0) + darts.length

    result.legFinished = {
      type: 'ATBLegFinished',
      eventId: id(),
      matchId: state.match.matchId,
      legId: state.currentLegId,
      ts: now(),
      winnerId: playerId,
      winnerDarts: legDarts,
    }

    // Berechne neue Leg-Wins
    const newLegWins = (state.legWinsByPlayer[playerId] ?? 0) + 1
    const newTotalLegWins = (state.totalLegWinsByPlayer[playerId] ?? 0) + 1

    const structure = state.match.structure

    if (structure.kind === 'legs') {
      // Legs-Modus: Prüfe ob Match gewonnen
      const targetLegs = Math.ceil(structure.bestOfLegs / 2)
      if (newTotalLegWins >= targetLegs) {
        const totalDarts = (state.dartsUsedTotalByPlayer[playerId] ?? 0) + darts.length
        const durationMs = Date.now() - state.startTime

        result.matchFinished = {
          type: 'ATBMatchFinished',
          eventId: id(),
          matchId: state.match.matchId,
          ts: now(),
          winnerId: playerId,
          totalDarts,
          durationMs,
        }
      } else {
        // Nächstes Leg starten
        result.nextLegStart = createATBLegStartEvent(
          state.match.matchId,
          state.currentLegIndex + 1,
          undefined,
          state.match.config,
          state.match.direction
        )
      }
    } else {
      // Sets-Modus: Prüfe ob Set gewonnen
      const targetLegsPerSet = Math.ceil(structure.legsPerSet / 2)
      if (newLegWins >= targetLegsPerSet) {
        // Set gewonnen
        const newSetWins = (state.setWinsByPlayer[playerId] ?? 0) + 1

        result.setFinished = {
          type: 'ATBSetFinished',
          eventId: id(),
          matchId: state.match.matchId,
          ts: now(),
          setIndex: state.currentSetIndex,
          winnerId: playerId,
        }

        // Prüfe ob Match gewonnen
        const targetSets = Math.ceil(structure.bestOfSets / 2)
        if (newSetWins >= targetSets) {
          const totalDarts = (state.dartsUsedTotalByPlayer[playerId] ?? 0) + darts.length
          const durationMs = Date.now() - state.startTime

          result.matchFinished = {
            type: 'ATBMatchFinished',
            eventId: id(),
            matchId: state.match.matchId,
            ts: now(),
            winnerId: playerId,
            totalDarts,
            durationMs,
          }
        } else {
          // Nächstes Set (neues Leg im neuen Set)
          result.nextLegStart = createATBLegStartEvent(
            state.match.matchId,
            1,
            state.currentSetIndex + 1,
            state.match.config,
            state.match.direction
          )
        }
      } else {
        // Nächstes Leg im gleichen Set
        result.nextLegStart = createATBLegStartEvent(
          state.match.matchId,
          state.currentLegIndex + 1,
          state.currentSetIndex,
          state.match.config,
          state.match.direction
        )
      }
    }
  }

  return result
}

// ===== Piratenmodus Funktionen =====

/**
 * Berechnet den Score für einen Piratenmodus-Turn.
 * Nur Treffer auf das aktuelle Ziel zählen.
 */
export function calculatePirateScore(
  darts: ATBDart[],
  targetNumber: number | 'BULL',
  multiplierMode: ATBMultiplierMode
): number {
  let score = 0
  for (const dart of darts) {
    if (dart.target === 'MISS') continue
    if (dart.target !== targetNumber) continue  // Nur Treffer auf Ziel zählen

    switch (multiplierMode) {
      case 'standard':
        score += dart.mult  // T=3, D=2, S=1
        break
      case 'standard2':
        score += dart.mult === 1 ? 1 : 2  // T=2, D=2, S=1
        break
      case 'single':
        score += 1  // Alle = 1
        break
    }
  }
  return score
}

/**
 * Prüft ob eine Piratenmodus-Runde abgeschlossen ist (alle haben geworfen)
 */
export function isPirateRoundComplete(state: ATBState): boolean {
  if (!state.pirateState || !state.match) return false
  return state.pirateState.playersCompletedThisRound.length >= state.match.players.length
}

/**
 * Ermittelt den Gewinner einer Piratenmodus-Runde
 */
export function determinePirateRoundWinner(
  scoresByPlayer: Record<string, number>
): string | null {
  const entries = Object.entries(scoresByPlayer)
  if (entries.length === 0) return null

  // Höchsten Score finden
  const maxScore = Math.max(...entries.map(([_, score]) => score))
  const winners = entries.filter(([_, score]) => score === maxScore)

  // Bei Gleichstand: null (keiner gewinnt)
  if (winners.length !== 1) return null

  return winners[0][0]
}

/**
 * Ermittelt den Gesamtgewinner eines Piratenmodus-Legs
 * Primär: Anzahl gewonnener Felder
 * Sekundär (Tiebreaker): Gesamtpunkte
 */
export function determinePirateLegWinner(state: ATBState): string | null {
  if (!state.pirateState || !state.match) return null

  const fieldWins: Record<string, number> = {}
  for (const p of state.match.players) {
    fieldWins[p.playerId] = 0
  }

  // Felder zählen
  for (const winnerId of Object.values(state.pirateState.fieldWinners)) {
    if (winnerId) {
      fieldWins[winnerId] = (fieldWins[winnerId] ?? 0) + 1
    }
  }

  // Höchste Anzahl Felder
  const maxFields = Math.max(...Object.values(fieldWins))
  const topPlayers = Object.entries(fieldWins).filter(([_, wins]) => wins === maxFields)

  // Eindeutiger Gewinner
  if (topPlayers.length === 1) {
    return topPlayers[0][0]
  }

  // Tiebreaker: Gesamtpunkte
  let highestScore = -1
  let winner: string | null = null
  for (const [playerId] of topPlayers) {
    const score = state.pirateState.totalScoreByPlayer[playerId] ?? 0
    if (score > highestScore) {
      highestScore = score
      winner = playerId
    } else if (score === highestScore) {
      // Auch bei Punktegleichstand: Unentschieden (null)
      winner = null
    }
  }

  return winner
}

export type ATBPirateTurnResult = {
  turnEvent: ATBTurnAddedEvent
  roundFinished?: ATBPirateRoundFinishedEvent
  legFinished?: ATBLegFinishedEvent
  setFinished?: ATBSetFinishedEvent
  matchFinished?: ATBMatchFinishedEvent
  nextLegStart?: ATBLegStartedEvent
}

/**
 * Nimmt einen Turn im Piratenmodus auf.
 */
export function recordATBPirateTurn(
  state: ATBState,
  playerId: string,
  darts: ATBDart[]
): ATBPirateTurnResult {
  if (!state.match) throw new Error('No match started')
  if (!state.currentLegId) throw new Error('No leg started')
  if (!state.pirateState) throw new Error('Not in pirate mode')

  const config = state.match.config
  if (!config || config.gameMode !== 'pirate') {
    throw new Error('Not in pirate mode')
  }

  const currentFieldIndex = state.pirateState.currentFieldIndex
  const sequence = state.match.extendedSequence ?? state.match.sequence.map(n => ({ number: n }))

  if (currentFieldIndex >= sequence.length) {
    throw new Error('All fields completed')
  }

  const currentTarget = sequence[currentFieldIndex]
  const targetNumber = typeof currentTarget === 'object' ? currentTarget.number : currentTarget

  // Score berechnen
  const pirateScore = calculatePirateScore(darts, targetNumber, config.multiplierMode)

  // Turn-Event erstellen
  const turnEvent: ATBTurnAddedEvent = {
    type: 'ATBTurnAdded',
    eventId: id(),
    matchId: state.match.matchId,
    legId: state.currentLegId,
    ts: now(),
    playerId,
    darts,
    fieldsAdvanced: 0,  // Im Piratenmodus kein individueller Fortschritt
    newIndex: 0,
    pirateScore,
  }

  const result: ATBPirateTurnResult = { turnEvent }

  // State temporär aktualisieren für Prüfungen
  const tempPlayersCompleted = [...state.pirateState.playersCompletedThisRound, playerId]
  const tempRoundTurns = {
    ...state.pirateState.currentRoundTurns,
    [playerId]: { darts, score: pirateScore },
  }

  // Prüfe ob Runde komplett
  if (tempPlayersCompleted.length >= state.match.players.length) {
    // Scores sammeln
    const scoresByPlayer: Record<string, number> = {}
    for (const [pid, turnData] of Object.entries(tempRoundTurns)) {
      scoresByPlayer[pid] = turnData.score
    }

    // Gewinner ermitteln
    const roundWinnerId = determinePirateRoundWinner(scoresByPlayer)

    result.roundFinished = {
      type: 'ATBPirateRoundFinished',
      eventId: id(),
      matchId: state.match.matchId,
      legId: state.currentLegId,
      ts: now(),
      fieldIndex: currentFieldIndex,
      fieldNumber: targetNumber,
      scoresByPlayer,
      winnerId: roundWinnerId,
    }

    // Prüfe ob Leg fertig (alle Felder gespielt)
    if (currentFieldIndex + 1 >= sequence.length) {
      // Leg-Gewinner ermitteln (mit temporärem State-Update)
      const tempFieldWinners = { ...state.pirateState.fieldWinners }
      tempFieldWinners[String(targetNumber)] = roundWinnerId

      const tempTotalScores = { ...state.pirateState.totalScoreByPlayer }
      for (const [pid, score] of Object.entries(scoresByPlayer)) {
        tempTotalScores[pid] = (tempTotalScores[pid] ?? 0) + score
      }

      // Gewinner berechnen
      const fieldWins: Record<string, number> = {}
      for (const p of state.match.players) {
        fieldWins[p.playerId] = 0
      }
      for (const wid of Object.values(tempFieldWinners)) {
        if (wid) fieldWins[wid]++
      }

      const maxFields = Math.max(...Object.values(fieldWins))
      const topPlayers = Object.entries(fieldWins).filter(([_, w]) => w === maxFields)

      let legWinnerId: string
      if (topPlayers.length === 1) {
        legWinnerId = topPlayers[0][0]
      } else {
        // Tiebreaker: Gesamtpunkte
        let highestScore = -1
        let winner = topPlayers[0][0]
        for (const [pid] of topPlayers) {
          const score = tempTotalScores[pid] ?? 0
          if (score > highestScore) {
            highestScore = score
            winner = pid
          }
        }
        legWinnerId = winner
      }

      // Darts zählen für den Gewinner
      const winnerDarts = (state.dartsUsedTotalByPlayer[legWinnerId] ?? 0) +
        (state.dartsUsedByPlayer[legWinnerId] ?? 0) + darts.length

      result.legFinished = {
        type: 'ATBLegFinished',
        eventId: id(),
        matchId: state.match.matchId,
        legId: state.currentLegId,
        ts: now(),
        winnerId: legWinnerId,
        winnerDarts,
      }

      // Prüfe Match-Ende
      const structure = state.match.structure
      const newLegWins = (state.totalLegWinsByPlayer[legWinnerId] ?? 0) + 1

      if (structure.kind === 'legs') {
        const targetLegs = Math.ceil(structure.bestOfLegs / 2)
        if (newLegWins >= targetLegs) {
          const totalDarts = Object.values(state.dartsUsedTotalByPlayer).reduce((a, b) => a + b, 0) + darts.length
          const durationMs = Date.now() - state.startTime

          result.matchFinished = {
            type: 'ATBMatchFinished',
            eventId: id(),
            matchId: state.match.matchId,
            ts: now(),
            winnerId: legWinnerId,
            totalDarts,
            durationMs,
          }
        } else {
          result.nextLegStart = createATBLegStartEvent(
            state.match.matchId,
            state.currentLegIndex + 1,
            undefined,
            state.match.config,
            state.match.direction
          )
        }
      }
      // TODO: Sets-Modus für Piratenmodus (falls benötigt)
    }
  }

  return result
}

// Legacy-Funktion für Abwärtskompatibilität (Single-Leg Spiele)
export function recordATBTurnLegacy(
  state: ATBState,
  playerId: string,
  darts: ATBDart[]
): { event: ATBTurnAddedEvent; finished?: ATBMatchFinishedEvent } {
  if (!state.match) throw new Error('No match started')

  const currentIndex = state.currentIndexByPlayer[playerId] ?? 0
  const { fieldsAdvanced, newIndex } = calculateAdvance(darts, currentIndex, state.match.sequence)

  const turnEvent: ATBTurnAddedEvent = {
    type: 'ATBTurnAdded',
    eventId: id(),
    matchId: state.match.matchId,
    legId: state.currentLegId || 'legacy',
    ts: now(),
    playerId,
    darts,
    fieldsAdvanced,
    newIndex,
  }

  let finishedEvent: ATBMatchFinishedEvent | undefined
  if (newIndex >= state.match.sequence.length) {
    const totalDarts = (state.dartsUsedByPlayer[playerId] ?? 0) + darts.length
    const durationMs = Date.now() - state.startTime

    finishedEvent = {
      type: 'ATBMatchFinished',
      eventId: id(),
      matchId: state.match.matchId,
      ts: now(),
      winnerId: playerId,
      totalDarts,
      durationMs,
    }
  }

  return { event: turnEvent, finished: finishedEvent }
}

// ===== Formatierung =====

export function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  const centis = Math.floor((ms % 1000) / 10)
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${centis.toString().padStart(2, '0')}`
}

export function formatTarget(target: number | 'BULL'): string {
  return target === 'BULL' ? 'Bull' : String(target)
}

export function formatDart(dart: ATBDart): string {
  if (dart.target === 'MISS') return 'Miss'
  if (dart.target === 'BULL') {
    return dart.mult === 2 ? 'DBull' : 'Bull'
  }
  const prefix = dart.mult === 3 ? 'T' : dart.mult === 2 ? 'D' : 'S'
  return `${prefix}${dart.target}`
}
