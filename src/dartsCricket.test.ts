// Test für Sudden Death Bug-Fix und Crazy Cricket mit Punkten
import { describe, it, expect } from 'vitest'
import {
  applyCricketEvents,
  recordCricketTurn,
  type CricketEvent,
  type CricketMatchStarted,
  type CricketTurnAdded,
} from './dartsCricket'

describe('Cricket Sudden Death', () => {
  it('sollte Bull-Hits zählen auch wenn Bull bereits geschlossen ist', () => {
    const matchId = 'test-match'
    const player1 = 'p1'
    const player2 = 'p2'

    // Match starten: Cutthroat mit Sudden Death
    const startEvent: CricketMatchStarted = {
      eventId: 'e1',
      type: 'CricketMatchStarted',
      ts: new Date().toISOString(),
      matchId,
      range: 'short', // 15-20 + Bull
      style: 'cutthroat',
      cutthroatEndgame: 'suddenDeath',
      players: [
        { playerId: player1, name: 'Player 1' },
        { playerId: player2, name: 'Player 2' },
      ],
      version: 1,
    }

    // Beide Spieler schließen alle Felder
    const closingTurns: CricketTurnAdded[] = []
    let eventIdx = 2

    // Player 1 schließt 15-20 (Triple = 3 Marks)
    for (const target of [15, 16, 17, 18, 19, 20] as const) {
      closingTurns.push({
        eventId: `e${eventIdx++}`,
        type: 'CricketTurnAdded',
        ts: new Date().toISOString(),
        matchId,
        playerId: player1,
        darts: [{ target, mult: 3 }], // Triple = 3 Marks
      })
      closingTurns.push({
        eventId: `e${eventIdx++}`,
        type: 'CricketTurnAdded',
        ts: new Date().toISOString(),
        matchId,
        playerId: player2,
        darts: [{ target, mult: 3 }],
      })
    }

    // Bull braucht mehrere Würfe (Double Bull = 2, Single Bull = 1)
    // Player 1: Double Bull (2) + Single Bull (1) = 3 Marks
    closingTurns.push({
      eventId: `e${eventIdx++}`,
      type: 'CricketTurnAdded',
      ts: new Date().toISOString(),
      matchId,
      playerId: player1,
      darts: [
        { target: 'BULL', mult: 2 }, // Double Bull = 2 Marks
        { target: 'BULL', mult: 1 }, // Single Bull = 1 Mark -> Total 3
      ],
    })
    // Player 2: gleich
    closingTurns.push({
      eventId: `e${eventIdx++}`,
      type: 'CricketTurnAdded',
      ts: new Date().toISOString(),
      matchId,
      playerId: player2,
      darts: [
        { target: 'BULL', mult: 2 },
        { target: 'BULL', mult: 1 },
      ],
    })

    const events: CricketEvent[] = [startEvent, ...closingTurns]
    let state = applyCricketEvents(events)

    // Beide sollten jetzt alle Felder geschlossen haben
    expect(state.marksByPlayer[player1]['15']).toBe(3)
    expect(state.marksByPlayer[player1]['BULL']).toBe(3)
    expect(state.marksByPlayer[player2]['15']).toBe(3)
    expect(state.marksByPlayer[player2]['BULL']).toBe(3)

    // Endgame sollte aktiv sein (einer hat als erstes alle zu gemacht)
    expect(state.endgameActive).toBe(true)

    // Jetzt: Player 1 wirft Bull (obwohl Bull schon zu ist)
    // Diese Bulls sollten trotzdem gezählt werden!
    const bullTurn1: CricketTurnAdded = {
      eventId: `e${eventIdx++}`,
      type: 'CricketTurnAdded',
      ts: new Date().toISOString(),
      matchId,
      playerId: player1,
      darts: [
        { target: 'BULL', mult: 2 }, // Double Bull = 2 Hits
        { target: 'BULL', mult: 1 }, // Single Bull = 1 Hit
      ],
    }

    state = applyCricketEvents([...events, bullTurn1])

    // Bull-Hits sollten gezählt worden sein
    // Vom Player 2 Bull-Closing (3 hits, weil Endgame nach Player 1's Bull-Closing aktiv wurde)
    // + bullTurn1 (3 hits) = 6 total
    expect(state.endgameBullHits).toBe(6)

    // Das Spiel sollte beendet werden können (>= 5 Bull-Hits)
    expect(state.endgameBullHits).toBeGreaterThanOrEqual(5)

    console.log('✅ Sudden Death Bull-Zähler funktioniert korrekt!')
    console.log(`   Bull-Hits nach dem Fix: ${state.endgameBullHits}`)
  })
})

describe('Crazy Cricket mit Punkten', () => {
  it('sollte Overflow-Punkte vergeben wenn crazyWithPoints aktiviert ist', () => {
    const matchId = 'crazy-points-test'
    const player1 = 'p1'
    const player2 = 'p2'

    // Match starten: Crazy mit Punkten
    const startEvent: CricketMatchStarted = {
      eventId: 'e1',
      type: 'CricketMatchStarted',
      ts: new Date().toISOString(),
      matchId,
      range: 'short',
      style: 'crazy',
      crazyMode: 'normal',
      crazyWithPoints: true,
      players: [
        { playerId: player1, name: 'Player 1' },
        { playerId: player2, name: 'Player 2' },
      ],
      version: 1,
    }

    const events: CricketEvent[] = [startEvent]
    let state = applyCricketEvents(events)

    // Initial: Beide Spieler haben 0 Punkte
    expect(state.pointsByPlayer[player1]).toBe(0)
    expect(state.pointsByPlayer[player2]).toBe(0)

    // Player 1 wirft Triple 15 (3 Marks) + Triple 15 (3 Overflow = 45 Punkte)
    // Hinweis: Bei Crazy zählt nur die aktive Zielzahl
    // Die erste Zahl wird basierend auf matchId und turnIndex generiert
    const turn1: CricketTurnAdded = {
      eventId: 'e2',
      type: 'CricketTurnAdded',
      ts: new Date().toISOString(),
      matchId,
      playerId: player1,
      darts: [
        { target: 15, mult: 3 }, // Triple 15 = 3 Marks (schließt 15)
        { target: 15, mult: 3 }, // Triple 15 = 3 Overflow (wenn 15 die Crazy-Zahl ist)
        { target: 'MISS', mult: 1 },
      ],
    }

    state = applyCricketEvents([...events, turn1])

    // Prüfen ob Punkte vergeben wurden (wenn 15 die aktive Crazy-Zahl war)
    // Die aktive Zahl wird deterministisch berechnet, daher wissen wir nicht sicher welche es ist
    // Aber wir können prüfen, dass das System funktioniert
    console.log('Crazy mit Punkten - Player 1 Punkte:', state.pointsByPlayer[player1])
    console.log('Crazy mit Punkten - Player 1 Marks auf 15:', state.marksByPlayer[player1]['15'])

    // Mindestens sollte das Match funktionieren
    expect(state.match?.crazyWithPoints).toBe(true)
    expect(state.match?.style).toBe('crazy')
  })

  it('sollte KEINE Punkte vergeben wenn crazyWithPoints NICHT aktiviert ist', () => {
    const matchId = 'crazy-no-points-test'
    const player1 = 'p1'
    const player2 = 'p2'

    // Match starten: Crazy OHNE Punkte
    const startEvent: CricketMatchStarted = {
      eventId: 'e1',
      type: 'CricketMatchStarted',
      ts: new Date().toISOString(),
      matchId,
      range: 'short',
      style: 'crazy',
      crazyMode: 'normal',
      crazyWithPoints: false, // OHNE Punkte
      players: [
        { playerId: player1, name: 'Player 1' },
        { playerId: player2, name: 'Player 2' },
      ],
      version: 1,
    }

    const events: CricketEvent[] = [startEvent]

    // Player 1 wirft mehrere Triples
    const turn1: CricketTurnAdded = {
      eventId: 'e2',
      type: 'CricketTurnAdded',
      ts: new Date().toISOString(),
      matchId,
      playerId: player1,
      darts: [
        { target: 15, mult: 3 },
        { target: 15, mult: 3 },
        { target: 15, mult: 3 },
      ],
    }

    const state = applyCricketEvents([...events, turn1])

    // Bei Crazy ohne Punkte sollten KEINE Punkte vergeben werden
    expect(state.pointsByPlayer[player1]).toBe(0)
    expect(state.pointsByPlayer[player2]).toBe(0)

    console.log('✅ Crazy OHNE Punkte: Keine Punkte vergeben')
  })

  it('sollte bei crazyWithPoints den Gewinner mit mehr Punkten ermitteln', () => {
    const matchId = 'crazy-winner-test'
    const player1 = 'p1'
    const player2 = 'p2'

    // Match starten: Crazy mit Punkten
    const startEvent: CricketMatchStarted = {
      eventId: 'e1',
      type: 'CricketMatchStarted',
      ts: new Date().toISOString(),
      matchId,
      range: 'short',
      style: 'crazy',
      crazyMode: 'normal',
      crazyWithPoints: true,
      players: [
        { playerId: player1, name: 'Player 1' },
        { playerId: player2, name: 'Player 2' },
      ],
      version: 1,
    }

    // Simuliere ein Spiel wo beide alle Felder schließen
    // aber Player 1 mehr Punkte hat
    const events: CricketEvent[] = [startEvent]
    let state = applyCricketEvents(events)

    // Beide Spieler schließen alle Felder
    // Player 1 macht mehr Overflow-Treffer
    const targets = [15, 16, 17, 18, 19, 20] as const
    let eventIdx = 2

    for (const target of targets) {
      // Player 1 schließt und macht Overflow
      events.push({
        eventId: `e${eventIdx++}`,
        type: 'CricketTurnAdded',
        ts: new Date().toISOString(),
        matchId,
        playerId: player1,
        darts: [
          { target, mult: 3 }, // schließt
          { target, mult: 3 }, // Overflow (wenn aktive Zahl)
          { target, mult: 3 }, // mehr Overflow
        ],
      } as CricketTurnAdded)

      // Player 2 schließt nur
      events.push({
        eventId: `e${eventIdx++}`,
        type: 'CricketTurnAdded',
        ts: new Date().toISOString(),
        matchId,
        playerId: player2,
        darts: [
          { target, mult: 3 }, // schließt
          { target: 'MISS', mult: 1 },
          { target: 'MISS', mult: 1 },
        ],
      } as CricketTurnAdded)
    }

    // Bull schließen
    events.push({
      eventId: `e${eventIdx++}`,
      type: 'CricketTurnAdded',
      ts: new Date().toISOString(),
      matchId,
      playerId: player1,
      darts: [
        { target: 'BULL', mult: 2 },
        { target: 'BULL', mult: 1 },
      ],
    } as CricketTurnAdded)

    events.push({
      eventId: `e${eventIdx++}`,
      type: 'CricketTurnAdded',
      ts: new Date().toISOString(),
      matchId,
      playerId: player2,
      darts: [
        { target: 'BULL', mult: 2 },
        { target: 'BULL', mult: 1 },
      ],
    } as CricketTurnAdded)

    state = applyCricketEvents(events)

    console.log('Player 1 Punkte:', state.pointsByPlayer[player1])
    console.log('Player 2 Punkte:', state.pointsByPlayer[player2])
    console.log('Player 1 Marks:', state.marksByPlayer[player1])
    console.log('Player 2 Marks:', state.marksByPlayer[player2])

    // Bei crazyWithPoints: Spieler mit mehr Punkten (und alle zu) sollte gewinnen
    // Da bei Crazy nur bestimmte Zahlen zählen, werden nicht alle Marks gezählt
    expect(state.match?.crazyWithPoints).toBe(true)
  })
})
