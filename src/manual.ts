import {
  id, now,
  type MatchStarted, type LegStarted,
  type DartsEvent,               // <— hinzufügen
  recordVisit, applyEvents, computeStats, getCheckoutRoutes
} from "./darts501";


// 1) Match & Leg starten
const matchId = id();
const legId = id();

const match: MatchStarted = {
  eventId: id(),
  type: "MatchStarted",
  ts: now(),
  matchId,
  mode: "501-double-out",
  structure: { kind: "legs", bestOfLegs: 1 },
  startingScorePerLeg: 501,
  players: [
    { playerId: "p1", name: "Thomas" },
    { playerId: "p2", name: "CPU" }
  ],
  bullThrow: { winnerPlayerId: "p1" },
  version: 1
};

const legStart: LegStarted = {
  eventId: id(),
  type: "LegStarted",
  ts: now(),
  matchId,
  legId,
  legIndex: 1,
  starterPlayerId: "p1"
};

let events: DartsEvent[] = [match, legStart];


// Hilfsfunktion: Leg-State neu ableiten
const deriveLeg = () => {
  const st = applyEvents(events);
  // aktives Leg = letztes
  return st.legs[st.legs.length - 1];
};

// 2) P1 wirft 140 (T20 T20 S20)
{
  const leg = deriveLeg();
  const { events: evs } = recordVisit({
    match,
    leg,
    playerId: "p1",
    darts: [
      { seq: 1, bed: 20, mult: 3 },
      { seq: 2, bed: 20, mult: 3 },
      { seq: 3, bed: 20, mult: 1 }
    ]
  });
  events = events.concat(evs);
  console.log("P1 nach Visit:", deriveLeg().remainingByPlayer["p1"]);
}

// 3) P2 wirft 100 (T20 S20 S20)
{
  const leg = deriveLeg();
  const { events: evs } = recordVisit({
    match,
    leg,
    playerId: "p2",
    darts: [
      { seq: 1, bed: 20, mult: 3 },
      { seq: 2, bed: 20, mult: 1 },
      { seq: 3, bed: 20, mult: 1 }
    ]
  });
  events = events.concat(evs);
  console.log("P2 nach Visit:", deriveLeg().remainingByPlayer["p2"]);
}

// 4) P1 weiterer Visit – danach Checkout-Hinweise anzeigen
{
  const leg = deriveLeg();
  const { events: evs } = recordVisit({
    match,
    leg,
    playerId: "p1",
    darts: [
      { seq: 1, bed: 20, mult: 3 },
      { seq: 2, bed: 19, mult: 3 },
      { seq: 3, bed: 18, mult: 1 }
    ]
  });
  events = events.concat(evs);

  const rem = deriveLeg().remainingByPlayer["p1"];
  const routes = getCheckoutRoutes(rem, "safe", { preferDoubles: ["D16", "D20"] });
  console.log(`P1 Rest ${rem}, Routen:`, routes.map(r => r.route.join(" → ")).join(" | ") || "—");
}

// 5) Stats zwischendurch
{
  const stats = computeStats(events);
  console.log("Zwischen-Stats:", JSON.stringify(stats, null, 2));
}
