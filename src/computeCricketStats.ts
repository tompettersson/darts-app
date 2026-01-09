// src/stats/computeCricketStats.ts
import { CricketTarget } from "../screens/GameCricket"; // falls woanders definiert -> ggf. Pfad anpassen
// Du hast wahrscheinlich schon ein CricketTarget-Typ. Wenn nicht, nimm diesen:
// export type CricketTarget = 10|11|12|13|14|15|16|17|18|19|20|'BULL';

export type CricketPlayerMatchStats = {
  playerId: string;
  playerName: string;

  legsWon: number;
  totalMarks: number;
  marksPerTurn: number;
  marksPerDart: number;

  totalPointsGiven?: number;  // Standard-Modus: Punkte die er gemacht hat
  totalPointsTaken?: number;  // Cutthroat-Modus: Punkte die er kassiert hat

  triplesHit: number;
  doublesHit: number;
  bullHitsSingle: number;
  bullHitsDouble: number;
  bullAccuracy: number;       // 0..1 von 0 bis 1

  turnsWithNoScore: number;
  longestStreakMarks: number;
  bestTurnMarks: number;
  bestTurnPoints: number;

  favouriteField: CricketTarget | null;
  strongestField: CricketTarget | null;
  weakestField: CricketTarget | null;

  finishField: CricketTarget | null;

  firstCloseOrder: CricketTarget[];
};

export type CricketMatchComputedStats = {
  matchId: string;
  range: "short" | "long";
  style: "standard" | "cutthroat";
  targetWins: number;

  players: CricketPlayerMatchStats[];

  fastestLegByMarks: {
    legIndex: number;
    playerId: string;
    dartsThrown: number;
    marks: number;
  } | null;

  biggestComeback: {
    playerId: string;
    fromBehindPoints: number;
    result: "wonLeg" | "wonMatch";
  } | null;
};

// ===== WICHTIG =====
// Diese Helper-Funktion hier ist ein SKELETT, aber lauffähig vom Typ-Contract.
// Du kannst sie sofort importieren und rendern.
// Die ganzen TODO-Stellen rechnen später die echten Werte aus.
// D.h. UI kann gebaut werden, ohne dass alles schon perfekt getrackt ist.

export function computeCricketStats(cricketMatch: {
  id: string;
  range: "short" | "long";
  style: "standard" | "cutthroat";
  targetWins: number;
  players: { id: string; name: string }[];
  events: any[]; // deine Event-Liste aus storage / dartsCricket
}): CricketMatchComputedStats {

  // Wir gehen Spieler für Spieler durch und bauen erstmal leere Stats-Objekte
  const playersStats: CricketPlayerMatchStats[] = cricketMatch.players.map(p => ({
    playerId: p.id,
    playerName: p.name,

    legsWon: 0,
    totalMarks: 0,
    marksPerTurn: 0,
    marksPerDart: 0,

    totalPointsGiven: 0,
    totalPointsTaken: 0,

    triplesHit: 0,
    doublesHit: 0,
    bullHitsSingle: 0,
    bullHitsDouble: 0,
    bullAccuracy: 0,

    turnsWithNoScore: 0,
    longestStreakMarks: 0,
    bestTurnMarks: 0,
    bestTurnPoints: 0,

    favouriteField: null,
    strongestField: null,
    weakestField: null,

    finishField: null,

    firstCloseOrder: [],
  }));

  // TODO:
  // - Parse cricketMatch.events
  // - Fülle LegsWon, Marks, etc.
  //
  // Wir lassen das erstmal leer, aber geben sinnvolle Defaults zurück,
  // damit der Screen sauber rendert ohne Crash.

  // Beispiel: fastestLegByMarks lassen wir erstmal leer:
  const fastestLegByMarks = null;

  // Beispiel: biggestComeback erstmal leer:
  const biggestComeback = null;

  return {
    matchId: cricketMatch.id,
    range: cricketMatch.range,
    style: cricketMatch.style,
    targetWins: cricketMatch.targetWins,
    players: playersStats,
    fastestLegByMarks,
    biggestComeback,
  };
}
