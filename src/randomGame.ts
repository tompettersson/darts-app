// src/randomGame.ts
// Zufalls-Generator für das "Zufallsspiel" Feature

import type { CricketRange, CricketStyle, CutthroatEndgame } from './dartsCricket'
import type {
  ATBSequenceMode,
  ATBTargetMode,
  ATBMultiplierMode,
  ATBSpecialRule,
  ATBMiss3BackVariant,
  ATBMatchConfig,
  ATBDirection,
} from './types/aroundTheBlock'
import type { ATBMode } from './dartsAroundTheBlock'

// X01 Konfiguration
export type X01RandomConfig = {
  startingScore: 121 | 301 | 501 | 701 | 901
  mode: '121-double-out' | '301-double-out' | '501-double-out' | '701-double-out' | '901-double-out'
}

// Cricket Konfiguration
export type CricketRandomConfig = {
  range: CricketRange
  style: CricketStyle
  cutthroatEndgame?: CutthroatEndgame
}

// ATB Konfiguration
export type ATBRandomConfig = {
  mode: ATBMode
  direction: ATBDirection
  config: ATBMatchConfig
}

// Ergebnis des Zufalls-Generators
export type RandomGameResult =
  | { kind: 'x01'; config: X01RandomConfig }
  | { kind: 'cricket'; config: CricketRandomConfig }
  | { kind: 'atb'; config: ATBRandomConfig }

// Verbesserter Zufallsgenerator: kombiniert mehrere Random-Werte für bessere Verteilung
function betterRandom(): number {
  // XOR von mehreren Random-Werten für weniger vorhersagbare Ergebnisse
  const r1 = Math.random()
  const r2 = Math.random()
  const r3 = Math.random()
  // Kombiniere die Werte auf eine nicht-lineare Weise
  return ((r1 * 1000 + r2 * 100 + r3 * 10) % 1)
}

// Fisher-Yates Shuffle für echte Durchmischung
function shuffleArray<T>(arr: T[]): T[] {
  const shuffled = [...arr]
  for (let i = shuffled.length - 1; i > 0; i--) {
    // Verwende betterRandom für den Index
    const j = Math.floor(betterRandom() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled
}

// Hilfsfunktion: zufälliges Element aus Array (verbessert)
function pickRandom<T>(arr: T[]): T {
  // Shuffle das Array erst, dann nimm ein Element mit betterRandom
  const shuffled = shuffleArray(arr)
  const index = Math.floor(betterRandom() * shuffled.length)
  return shuffled[index]
}

// Generiert zufällige X01 Konfiguration
function generateRandomX01(): X01RandomConfig {
  const scores = [121, 301, 501, 701, 901] as const
  const startingScore = pickRandom([...scores])
  return {
    startingScore,
    mode: `${startingScore}-double-out` as X01RandomConfig['mode'],
  }
}

// Generiert zufällige Cricket Konfiguration
function generateRandomCricket(): CricketRandomConfig {
  const range = pickRandom<CricketRange>(['short', 'long'])
  const style = pickRandom<CricketStyle>(['standard', 'cutthroat'])

  const result: CricketRandomConfig = { range, style }

  // Bei Cutthroat zufälliges Endgame
  if (style === 'cutthroat') {
    result.cutthroatEndgame = pickRandom<CutthroatEndgame>(['standard', 'suddenDeath'])
  }

  return result
}

// Generiert zufällige ATB Konfiguration mit Kompatibilitätsregeln
function generateRandomATB(): ATBRandomConfig {
  const sequenceMode = pickRandom<ATBSequenceMode>(['ascending', 'board', 'random'])

  // Richtung: bei random irrelevant, sonst zufällig
  const direction: ATBDirection =
    sequenceMode === 'random' ? 'forward' : pickRandom<ATBDirection>(['forward', 'backward'])

  // Target-Modus
  const targetMode = pickRandom<ATBTargetMode>([
    'any',
    'single',
    'double',
    'triple',
    'mixed',
    'mixedRandom',
  ])

  // Multiplier-Modus: nur bei 'any' relevant
  let multiplierMode: ATBMultiplierMode = 'standard'
  if (targetMode === 'any') {
    multiplierMode = pickRandom<ATBMultiplierMode>(['standard', 'standard2', 'single'])
  }

  // Spezialregeln mit Kompatibilitätsprüfung
  const availableRules: ATBSpecialRule[] = ['none', 'suddenDeath']

  // Bull Heavy: nicht bei mixed/mixedRandom
  if (!['mixed', 'mixedRandom'].includes(targetMode)) {
    availableRules.push('bullHeavy')
  }

  // No Double Escape: nur bei 'any'
  if (targetMode === 'any') {
    availableRules.push('noDoubleEscape')
  }

  // Miss 3 Back: immer verfügbar
  availableRules.push('miss3Back')

  const specialRule = pickRandom(availableRules)

  // Miss 3 Back Variante
  let miss3BackVariant: ATBMiss3BackVariant | undefined
  if (specialRule === 'miss3Back') {
    miss3BackVariant = pickRandom<ATBMiss3BackVariant>(['previous', 'start'])
  }

  const config: ATBMatchConfig = {
    sequenceMode,
    targetMode,
    multiplierMode,
    specialRule,
    miss3BackVariant,
  }

  // Legacy mode für Kompatibilität
  const mode: ATBMode = sequenceMode === 'random' ? 'ascending' : sequenceMode

  return {
    mode,
    direction,
    config,
  }
}

/**
 * Generiert ein komplett zufälliges Spiel.
 * Wählt zufällig zwischen X01, Cricket und ATB,
 * dann generiert zufällige Einstellungen für den gewählten Modus.
 *
 * Verwendet verbesserte Zufallslogik für mehr Variation.
 */
export function generateRandomGame(): RandomGameResult {
  // Shuffle die Spielarten mehrfach für bessere Durchmischung
  const gameKinds = shuffleArray(shuffleArray(['x01', 'cricket', 'atb'] as const))
  const gameKind = pickRandom([...gameKinds])

  switch (gameKind) {
    case 'x01':
      return { kind: 'x01', config: generateRandomX01() }
    case 'cricket':
      return { kind: 'cricket', config: generateRandomCricket() }
    case 'atb':
      return { kind: 'atb', config: generateRandomATB() }
  }
}

/**
 * Gibt eine lesbare Beschreibung des zufälligen Spiels zurück.
 */
export function describeRandomGame(result: RandomGameResult): string {
  switch (result.kind) {
    case 'x01':
      return `X01 (${result.config.startingScore})`
    case 'cricket': {
      const rangeLabel = result.config.range === 'short' ? 'Short' : 'Long'
      const styleLabel = result.config.style === 'standard' ? 'Standard' : 'Cutthroat'
      return `Cricket ${rangeLabel} ${styleLabel}`
    }
    case 'atb': {
      const { config } = result.config
      const seqLabel =
        config.sequenceMode === 'ascending'
          ? 'Zählend'
          : config.sequenceMode === 'board'
            ? 'Ums Board'
            : 'Random'
      return `Around the Block (${seqLabel})`
    }
  }
}
