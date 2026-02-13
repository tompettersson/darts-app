// src/dartsAroundTheBlock.test.ts
// Tests für Around the Block Erweiterungen

import { describe, it, expect } from 'vitest'
import {
  generateATBSequence,
  isATBHit,
  getJumpValue,
  calculateAdvanceExtended,
  applyATBEvents,
  recordATBTurn,
  createATBMatchStartEvent,
  createATBLegStartEvent,
  type ATBDart,
  type ATBMatchConfig,
  DEFAULT_ATB_CONFIG,
} from './dartsAroundTheBlock'

describe('generateATBSequence', () => {
  it('should generate ascending sequence with any target mode', () => {
    const config: ATBMatchConfig = {
      sequenceMode: 'ascending',
      targetMode: 'any',
      multiplierMode: 'standard',
      specialRule: 'none',
    }
    const seq = generateATBSequence(config, 'forward')
    expect(seq.length).toBe(21) // 1-20 + Bull
    expect(seq[0].number).toBe(1)
    expect(seq[0].requiredMultiplier).toBeUndefined()
    expect(seq[20].number).toBe('BULL')
  })

  it('should generate single-only sequence', () => {
    const config: ATBMatchConfig = {
      sequenceMode: 'ascending',
      targetMode: 'single',
      multiplierMode: 'standard',
      specialRule: 'none',
    }
    const seq = generateATBSequence(config, 'forward')
    expect(seq.length).toBe(21)
    expect(seq[0].requiredMultiplier).toBe(1)
    expect(seq[5].requiredMultiplier).toBe(1)
  })

  it('should generate double-only sequence', () => {
    const config: ATBMatchConfig = {
      sequenceMode: 'ascending',
      targetMode: 'double',
      multiplierMode: 'standard',
      specialRule: 'none',
    }
    const seq = generateATBSequence(config, 'forward')
    expect(seq.length).toBe(21)
    expect(seq[0].requiredMultiplier).toBe(2)
    expect(seq[20].requiredMultiplier).toBe(2) // Double Bull
  })

  it('should generate triple-only sequence (no triple bull)', () => {
    const config: ATBMatchConfig = {
      sequenceMode: 'ascending',
      targetMode: 'triple',
      multiplierMode: 'standard',
      specialRule: 'none',
    }
    const seq = generateATBSequence(config, 'forward')
    expect(seq.length).toBe(21) // 20 triples + single bull
    expect(seq[0].requiredMultiplier).toBe(3)
    expect(seq[19].requiredMultiplier).toBe(3) // T20
    expect(seq[20].number).toBe('BULL')
    expect(seq[20].requiredMultiplier).toBe(1) // Single Bull (kein Triple)
  })

  it('should generate mixed sequence (S→D→T per number)', () => {
    const config: ATBMatchConfig = {
      sequenceMode: 'ascending',
      targetMode: 'mixed',
      multiplierMode: 'standard',
      specialRule: 'none',
    }
    const seq = generateATBSequence(config, 'forward')
    // 20 Zahlen × 3 (S,D,T) + Bull × 2 (S,D) = 62
    expect(seq.length).toBe(62)
    expect(seq[0]).toEqual({ number: 1, requiredMultiplier: 1 }) // S1
    expect(seq[1]).toEqual({ number: 1, requiredMultiplier: 2 }) // D1
    expect(seq[2]).toEqual({ number: 1, requiredMultiplier: 3 }) // T1
    expect(seq[3]).toEqual({ number: 2, requiredMultiplier: 1 }) // S2
  })

  it('should reverse sequence for backward direction (bull at end)', () => {
    const config: ATBMatchConfig = {
      sequenceMode: 'ascending',
      targetMode: 'any',
      multiplierMode: 'standard',
      specialRule: 'none',
      // bullPosition default = 'end' → Bull bleibt am Ende, nur Zahlen umgekehrt
    }
    const seq = generateATBSequence(config, 'backward')
    expect(seq[0].number).toBe(20)  // Zahlen umgekehrt: 20 zuerst
    expect(seq[19].number).toBe(1)   // dann 1
    expect(seq[20].number).toBe('BULL')  // Bull am Ende
  })

  it('should put bull at start when bullPosition is start', () => {
    const config: ATBMatchConfig = {
      sequenceMode: 'ascending',
      targetMode: 'any',
      multiplierMode: 'standard',
      specialRule: 'none',
      bullPosition: 'start',
    }
    const seq = generateATBSequence(config, 'forward')
    expect(seq[0].number).toBe('BULL')  // Bull am Anfang
    expect(seq[1].number).toBe(1)
    expect(seq[20].number).toBe(20)
  })
})

describe('isATBHit', () => {
  it('should match any multiplier when no requirement', () => {
    const target = { number: 5 as const }
    expect(isATBHit({ target: 5, mult: 1 }, target)).toBe(true)
    expect(isATBHit({ target: 5, mult: 2 }, target)).toBe(true)
    expect(isATBHit({ target: 5, mult: 3 }, target)).toBe(true)
    expect(isATBHit({ target: 6, mult: 1 }, target)).toBe(false)
  })

  it('should require specific multiplier when specified', () => {
    const target = { number: 5 as const, requiredMultiplier: 2 as const }
    expect(isATBHit({ target: 5, mult: 1 }, target)).toBe(false)
    expect(isATBHit({ target: 5, mult: 2 }, target)).toBe(true)
    expect(isATBHit({ target: 5, mult: 3 }, target)).toBe(false)
  })

  it('should handle BULL correctly', () => {
    const target = { number: 'BULL' as const }
    expect(isATBHit({ target: 'BULL', mult: 1 }, target)).toBe(true)
    expect(isATBHit({ target: 'BULL', mult: 2 }, target)).toBe(true)
    expect(isATBHit({ target: 5, mult: 1 }, target)).toBe(false)
  })

  it('should handle MISS', () => {
    const target = { number: 5 as const }
    expect(isATBHit({ target: 'MISS', mult: 1 }, target)).toBe(false)
  })
})

describe('getJumpValue', () => {
  it('should return correct jump for standard mode', () => {
    const config: ATBMatchConfig = {
      ...DEFAULT_ATB_CONFIG,
      multiplierMode: 'standard',
    }
    expect(getJumpValue(1, config)).toBe(1)
    expect(getJumpValue(2, config)).toBe(2)
    expect(getJumpValue(3, config)).toBe(3)
  })

  it('should return correct jump for standard2 mode', () => {
    const config: ATBMatchConfig = {
      ...DEFAULT_ATB_CONFIG,
      multiplierMode: 'standard2',
    }
    expect(getJumpValue(1, config)).toBe(1)
    expect(getJumpValue(2, config)).toBe(2)
    expect(getJumpValue(3, config)).toBe(2) // Triple = 2 statt 3
  })

  it('should return 1 for single mode', () => {
    const config: ATBMatchConfig = {
      ...DEFAULT_ATB_CONFIG,
      multiplierMode: 'single',
    }
    expect(getJumpValue(1, config)).toBe(1)
    expect(getJumpValue(2, config)).toBe(1)
    expect(getJumpValue(3, config)).toBe(1)
  })

  it('should return 1 for non-any target modes', () => {
    const config: ATBMatchConfig = {
      ...DEFAULT_ATB_CONFIG,
      targetMode: 'double',
      multiplierMode: 'standard',
    }
    expect(getJumpValue(2, config)).toBe(1) // Bei Double-only springt man nur 1
  })
})

describe('calculateAdvanceExtended', () => {
  it('should advance correctly with standard mode', () => {
    const config: ATBMatchConfig = {
      ...DEFAULT_ATB_CONFIG,
      multiplierMode: 'standard',
    }
    const seq = generateATBSequence(config, 'forward')
    const darts: ATBDart[] = [
      { target: 1, mult: 1 }, // Treffer S1
      { target: 2, mult: 2 }, // Treffer D2 → springt 2
      { target: 'MISS', mult: 1 },
    ]
    const result = calculateAdvanceExtended(darts, 0, seq, config)
    expect(result.fieldsAdvanced).toBe(3) // 1 + 2 = 3
    expect(result.newIndex).toBe(3)
    expect(result.hitsPerDart).toEqual([true, true, false])
  })

  it('should advance only 1 for single-only mode', () => {
    const config: ATBMatchConfig = {
      ...DEFAULT_ATB_CONFIG,
      targetMode: 'single',
    }
    const seq = generateATBSequence(config, 'forward')
    const darts: ATBDart[] = [
      { target: 1, mult: 1 }, // Treffer S1 ✓
      { target: 2, mult: 2 }, // D2 - falsch, braucht S2
      { target: 2, mult: 1 }, // Treffer S2 ✓
    ]
    const result = calculateAdvanceExtended(darts, 0, seq, config)
    expect(result.fieldsAdvanced).toBe(2)
    expect(result.hitsPerDart).toEqual([true, false, true])
  })
})

describe('Special Rules', () => {
  const createTestMatch = (specialRule: ATBMatchConfig['specialRule']) => {
    const config: ATBMatchConfig = {
      sequenceMode: 'ascending',
      targetMode: 'any',
      multiplierMode: 'standard',
      specialRule,
    }
    const players = [
      { playerId: 'p1', name: 'Player 1' },
      { playerId: 'p2', name: 'Player 2' },
    ]
    const startEvent = createATBMatchStartEvent(players, 'ascending', 'forward', { kind: 'legs', bestOfLegs: 1 }, config)
    const legEvent = createATBLegStartEvent(startEvent.matchId, 1)
    return applyATBEvents([startEvent, legEvent])
  }

  describe('Sudden Death', () => {
    it('should eliminate player on no hits', () => {
      const state = createTestMatch('suddenDeath')
      const darts: ATBDart[] = [
        { target: 'MISS', mult: 1 },
        { target: 'MISS', mult: 1 },
        { target: 'MISS', mult: 1 },
      ]
      const result = recordATBTurn(state, 'p1', darts)
      expect(result.turnEvent.specialEffects?.eliminated).toBe(true)
    })

    it('should not eliminate player on hits', () => {
      const state = createTestMatch('suddenDeath')
      const darts: ATBDart[] = [
        { target: 1, mult: 1 },
        { target: 'MISS', mult: 1 },
        { target: 'MISS', mult: 1 },
      ]
      const result = recordATBTurn(state, 'p1', darts)
      expect(result.turnEvent.specialEffects?.eliminated).toBeUndefined()
    })
  })

  describe('Bull Heavy', () => {
    it('should require bull after advancing', () => {
      const state = createTestMatch('bullHeavy')
      const darts: ATBDart[] = [
        { target: 1, mult: 1 }, // Hit 1
        { target: 'MISS', mult: 1 },
        { target: 'MISS', mult: 1 },
      ]
      const result = recordATBTurn(state, 'p1', darts)
      expect(result.turnEvent.specialEffects?.needsBull).toBe(true)
    })
  })

  describe('Miss 3 Back (previous)', () => {
    it('should set back after 3 misses', () => {
      const config: ATBMatchConfig = {
        sequenceMode: 'ascending',
        targetMode: 'any',
        multiplierMode: 'standard',
        specialRule: 'miss3Back',
        miss3BackVariant: 'previous',
      }
      const players = [{ playerId: 'p1', name: 'Player 1' }]
      const startEvent = createATBMatchStartEvent(players, 'ascending', 'forward', { kind: 'legs', bestOfLegs: 1 }, config)
      const legEvent = createATBLegStartEvent(startEvent.matchId, 1)

      // Erst ein paar Felder vorrücken
      let state = applyATBEvents([startEvent, legEvent])
      const advanceDarts: ATBDart[] = [
        { target: 1, mult: 1 },
        { target: 2, mult: 1 },
        { target: 3, mult: 1 },
      ]
      const result1 = recordATBTurn(state, 'p1', advanceDarts)
      state = applyATBEvents([startEvent, legEvent, result1.turnEvent])

      expect(state.currentIndexByPlayer['p1']).toBe(3) // Auf Feld 4

      // Jetzt 3 Misses
      const missDarts: ATBDart[] = [
        { target: 'MISS', mult: 1 },
        { target: 'MISS', mult: 1 },
        { target: 'MISS', mult: 1 },
      ]
      const result2 = recordATBTurn(state, 'p1', missDarts)
      expect(result2.turnEvent.specialEffects?.setBackTo).toBe(2) // Zurück auf Feld 3
    })
  })
})
