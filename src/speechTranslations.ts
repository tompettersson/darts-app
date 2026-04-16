// src/speechTranslations.ts
// Zentrale Übersetzungsdatei für alle Sprachansagen

export type SpeechLang = 'en' | 'de' | 'fr' | 'it' | 'sv' | 'nl'

export type SpeechTexts = {
  // === Allgemein / X01 ===
  gameOn: () => string
  gameStart: (name: string) => string
  noScore: () => string
  oneEighty: () => string
  score: (score: number) => string
  scoreExcited: (score: number) => string
  bull: () => string
  double: (n: number) => string
  playerRemaining: (name: string, remaining: number) => string
  andTheLeg: () => string
  andTheSet: () => string
  gameShotMatch: () => string
  nextPlayer: (name: string) => string

  // === Cricket ===
  crazyTarget: (target: string) => string
  crazyPlayerTargets: (name: string, targets: string[]) => string
  cricketLeg: (name: string) => string
  cricketMatch: (name: string) => string
  closed: (target: string) => string
  cricketMarks: (count: number) => string
  playerNeeds: (name: string, needs: { target: string; count: number }[]) => string

  // === ATB ===
  atbGameOn: () => string
  triple: () => string
  doubleHit: () => string
  atbWinner: (name: string, darts: number, time: string) => string
  atbPlayerTurn: (name: string, target: string) => string
  bullRequired: () => string
  eliminated: (name: string) => string
  threeMissesBack: (target: string) => string
  threeMissesStart: () => string

  // === CTF ===
  ctfPlayerTurn: (name: string) => string
  ctfNewRound: (round: number, name: string, target: string) => string
  ctfNewRoundNoNum: (name: string, target: string) => string
  ctfNoScore: () => string
  ctfPoints: (score: number) => string
  ctfRoundWin: (name: string, target: string) => string
  ctfRoundTied: (target: string) => string
  ctfThirdToLast: () => string
  ctfSecondToLast: () => string
  ctfFinalRound: () => string
  ctfWinner: (name: string, fields: number) => string
  ctfPlace: (placeIndex: number, name: string, fields: number) => string

  // === Bob's 27 ===
  bobs27Turn: (name: string, score: number, target: string) => string
  bobs27MustScore: () => string

  // === Sträußchen ===
  strPlayerTurn: (name: string, number: number, ring: 'triple' | 'double') => string
  strPlayerDone: (name: string, darts: number, turns: number) => string
  strLegWinner: (name: string, darts: number) => string
  strMatchWinner: (name: string) => string
  strGameOn: () => string

  // === Shanghai ===
  shanghaiRoundPlayer: (target: number, name: string) => string
  shanghaiHits: (count: number) => string
  shanghaiScore: (name: string, score: number) => string
  shanghai: () => string
  shanghaiWinner: (name: string, score: number) => string
  shanghaiDraw: () => string

  // === Killer ===
  killerPlayerTurn: (name: string) => string
  killerQualifying: (name: string, ring: string, number: number) => string
  killerQualified: (name: string) => string
  killerHit: (attacker: string, victim: string, lives: number) => string
  killerEliminated: (name: string) => string
  killerWinner: (name: string) => string
  killerSelfHeal: (name: string) => string
  killerLegWin: (name: string) => string
  killerSetWin: (name: string) => string
  killerTurnSummary: (name: string, hits: number) => string

  // === Operation ===
  opGameStart: (name: string) => string
  opLastRound: () => string
  opHits: (count: number) => string
}

// Helper: Bedürfnisse als natürlichsprachige Liste formatieren
function formatNeedsDe(needs: { target: string; count: number }[]): string {
  if (needs.length === 0) return 'alles geschlossen, mach Punkte!'

  const countWord = (n: number) => n === 1 ? 'eine' : n === 2 ? 'zwei' : 'drei'
  const bullWord = (n: number) => n === 1 ? 'einmal das Bullen' : n === 2 ? 'zweimal das Bullen' : 'dreimal das Bullen'

  const parts = needs.map(({ target, count }) => {
    if (target === 'BULL') return bullWord(count)
    return `${countWord(count)} ${target}er`
  })
  return joinList(parts, 'und')
}

function formatNeedsEn(needs: { target: string; count: number }[]): string {
  if (needs.length === 0) return 'all closed, score points!'

  const parts = needs.map(({ target, count }) => {
    if (target === 'BULL') return `${count} bull${count > 1 ? 's' : ''}`
    return `${count} ${target}${count > 1 ? 's' : ''}`
  })
  return joinList(parts, 'and')
}

function formatNeedsFr(needs: { target: string; count: number }[]): string {
  if (needs.length === 0) return 'tout fermé, marque des points !'

  const parts = needs.map(({ target, count }) => {
    if (target === 'BULL') return `${count} bull`
    return `${count} ${target}`
  })
  return joinList(parts, 'et')
}

function formatNeedsIt(needs: { target: string; count: number }[]): string {
  if (needs.length === 0) return 'tutto chiuso, fai punti!'

  const parts = needs.map(({ target, count }) => {
    if (target === 'BULL') return `${count} bull`
    return `${count} ${target}`
  })
  return joinList(parts, 'e')
}

function formatNeedsSv(needs: { target: string; count: number }[]): string {
  if (needs.length === 0) return 'allt stängt, gör poäng!'

  const parts = needs.map(({ target, count }) => {
    if (target === 'BULL') return `${count} bull`
    return `${count} ${target}`
  })
  return joinList(parts, 'och')
}

function formatNeedsNl(needs: { target: string; count: number }[]): string {
  if (needs.length === 0) return 'alles dicht, scoor punten!'

  const parts = needs.map(({ target, count }) => {
    if (target === 'BULL') return `${count} bull`
    return `${count} ${target}`
  })
  return joinList(parts, 'en')
}

function joinList(parts: string[], conjunction: string): string {
  if (parts.length === 1) return parts[0]
  return parts.slice(0, -1).join(', ') + ` ${conjunction} ` + parts[parts.length - 1]
}

const PLACE_LABELS: Record<SpeechLang, string[]> = {
  en: ['First place', 'Second place', 'Third place', 'Fourth place'],
  de: ['Erster Platz', 'Zweiter Platz', 'Dritter Platz', 'Vierter Platz'],
  fr: ['Première place', 'Deuxième place', 'Troisième place', 'Quatrième place'],
  it: ['Primo posto', 'Secondo posto', 'Terzo posto', 'Quarto posto'],
  sv: ['Första plats', 'Andra plats', 'Tredje plats', 'Fjärde plats'],
  nl: ['Eerste plaats', 'Tweede plaats', 'Derde plaats', 'Vierde plaats'],
}

function strTarget(name: string, num: number, ring: 'triple' | 'double'): string {
  if (num === 25) return `${name}, Bull`
  return ring === 'double' ? `${name}, Double ${num}` : `${name}, Triple ${num}`
}

export const speechTexts: Record<SpeechLang, SpeechTexts> = {
  // ==================== ENGLISH ====================
  en: {
    gameOn: () => 'Game on!',
    gameStart: (name) => `${name}, throw first! Game on!`,
    noScore: () => 'No score!',
    oneEighty: () => 'One hundred and eighty!',
    score: (n) => String(n),
    scoreExcited: (n) => `${n}!`,
    bull: () => 'Bull',
    double: (n) => `Double ${n}`,
    playerRemaining: (name, remaining) => `${name}, ${remaining}`,
    andTheLeg: () => 'And the Leg!',
    andTheSet: () => 'And the Set!',
    gameShotMatch: () => 'Game shot, and the match!',
    nextPlayer: (name) => name,

    crazyTarget: (target) => `The new target is ${target}`,
    crazyPlayerTargets: (name, targets) => `${name}, ${targets.join(', ')}`,
    cricketLeg: (name) => `${name}, and the Leg!`,
    cricketMatch: (name) => `Game shot, and the match! ${name}!`,
    closed: (target) => `${target} is closed`,
    cricketMarks: (count) => count === 1 ? '1 mark' : `${count} marks`,
    playerNeeds: (name, needs) => `${name}, you still need ${formatNeedsEn(needs)}`,

    atbGameOn: () => 'Around the Block, Game on!',
    triple: () => 'Triple!',
    doubleHit: () => 'Double!',
    atbWinner: (name, darts, time) => `${name} wins! ${darts} darts in ${time}`,
    atbPlayerTurn: (name, target) => `${name}, ${target}`,
    bullRequired: () => 'Bull required!',
    eliminated: (name) => `${name} is eliminated!`,
    threeMissesBack: (target) => `Three misses! Back to ${target}!`,
    threeMissesStart: () => 'Three misses! Back to start!',

    ctfPlayerTurn: (name) => `${name}, your turn`,
    ctfNewRound: (round, name, target) => `Round ${round}, ${name}, ${target}`,
    ctfNewRoundNoNum: (name, target) => `${name}, ${target}`,
    ctfNoScore: () => 'no score',
    ctfPoints: (score) => score === 1 ? '1 point' : `${score} points`,
    ctfRoundWin: (name, target) => `${name} wins ${target}!`,
    ctfRoundTied: (target) => `${target} is tied!`,
    ctfThirdToLast: () => 'Third to last round!',
    ctfSecondToLast: () => 'Second to last round!',
    ctfFinalRound: () => 'Final round!',
    ctfWinner: (name, fields) => `${name} wins the match with ${fields} fields!`,
    ctfPlace: (i, name, fields) => `${PLACE_LABELS.en[i]}: ${name}, with ${fields} ${fields === 1 ? 'field' : 'fields'}.`,

    bobs27Turn: (name, score, target) => `${name}, you have ${score} points. Target: ${target}.`,
    bobs27MustScore: () => 'Attention, you have to score.',

    strPlayerTurn: (name, num, ring) => strTarget(name, num, ring),
    strPlayerDone: (name, darts, turns) => `${name} done! ${darts} darts in ${turns} rounds.`,
    strLegWinner: (name, darts) => `${name} wins the leg! ${darts} darts.`,
    strMatchWinner: (name) => `Game shot, and the match! ${name}!`,
    strGameOn: () => 'Sträußchen, Game on!',

    shanghaiRoundPlayer: (target, name) => `${target}! ${name}`,
    shanghaiHits: (count) => count === 0 ? 'no hits' : count === 1 ? '1 hit' : `${count} hits`,
    shanghaiScore: (_name, score) => score === 0 ? 'no score' : `${score} points`,
    shanghai: () => 'SHANGHAI!',
    shanghaiWinner: (name, score) => `${name} wins with ${score} points!`,
    shanghaiDraw: () => 'Draw!',

    killerPlayerTurn: (name) => `${name}, your turn`,
    killerQualifying: (name, ring, number) => `${name}, hit the ${ring} ${number}!`,
    killerQualified: (name) => `${name} is now a Killer!`,
    killerHit: (attacker, victim, lives) => `${attacker} hits ${victim}! ${lives} ${lives === 1 ? 'life' : 'lives'} left`,
    killerEliminated: (name) => `${name} is eliminated!`,
    killerWinner: (name) => `${name} wins! Last one standing!`,
    killerSelfHeal: (name) => `${name} heals!`,
    killerLegWin: (name) => `${name} wins the Leg!`,
    killerSetWin: (name) => `${name} wins the Set!`,
    killerTurnSummary: (name, hits) => hits === 0 ? `${name}, no hits` : hits === 1 ? `${name}, one hit` : `${name}, ${hits} hits`,

    opGameStart: (name) => `${name}, Game on!`,
    opLastRound: () => 'Last round!',
    opHits: (count) => count === 0 ? 'no hits' : count === 1 ? '1 hit' : `${count} hits`,
  },

  // ==================== DEUTSCH ====================
  de: {
    gameOn: () => 'Game on!',
    gameStart: (name) => `${name}, wirf zuerst! Game on!`,
    noScore: () => 'Kein Score!',
    oneEighty: () => 'Einhundertachtzig!',
    score: (n) => String(n),
    scoreExcited: (n) => `${n}!`,
    bull: () => 'Bull',
    double: (n) => `Doppel ${n}`,
    playerRemaining: (name, remaining) => `${name}, ${remaining}`,
    andTheLeg: () => 'Und das Leg!',
    andTheSet: () => 'Und das Set!',
    gameShotMatch: () => 'Game shot, und das Match!',
    nextPlayer: (name) => name,

    crazyTarget: (target) => `Das neue Ziel ist ${target}`,
    crazyPlayerTargets: (name, targets) => `${name}, ${targets.join(', ')}`,
    cricketLeg: (name) => `${name}, und das Leg!`,
    cricketMatch: (name) => `Game shot, und das Match! ${name}!`,
    closed: (target) => `${target} ist geschlossen`,
    cricketMarks: (count) => `${count === 1 ? 'ein' : count === 2 ? 'zwei' : count === 3 ? 'drei' : count} Treffer`,
    playerNeeds: (name, needs) => needs.length === 0
      ? `${name}, alles geschlossen, mach Punkte!`
      : `${name}, du brauchst noch ${formatNeedsDe(needs)}.`,

    atbGameOn: () => 'Around the Block, Game on!',
    triple: () => 'Triple!',
    doubleHit: () => 'Double!',
    atbWinner: (name, darts, time) => `${name} gewinnt! ${darts} Darts in ${time}`,
    atbPlayerTurn: (name, target) => `${name}, ${target}`,
    bullRequired: () => 'Bull gefordert!',
    eliminated: (name) => `${name} ist raus!`,
    threeMissesBack: (target) => `Drei Fehlwürfe! Zurück auf ${target}!`,
    threeMissesStart: () => 'Drei Fehlwürfe! Zurück zum Start!',

    ctfPlayerTurn: (name) => `${name}, du bist dran`,
    ctfNewRound: (round, name, target) => `Runde ${round}, ${name}, ${target}`,
    ctfNewRoundNoNum: (name, target) => `${name}, ${target}`,
    ctfNoScore: () => 'kein Score',
    ctfPoints: (score) => score === 1 ? '1 Punkt' : `${score} Punkte`,
    ctfRoundWin: (name, target) => `${name} gewinnt ${target}!`,
    ctfRoundTied: (target) => `${target} ist unentschieden!`,
    ctfThirdToLast: () => 'Drittletzte Runde!',
    ctfSecondToLast: () => 'Vorletzte Runde!',
    ctfFinalRound: () => 'Letzte Runde!',
    ctfWinner: (name, fields) => `${name} gewinnt das Match mit ${fields} Feldern!`,
    ctfPlace: (i, name, fields) => `${PLACE_LABELS.de[i]}: ${name}, mit ${fields} ${fields === 1 ? 'Feld' : 'Feldern'}.`,

    bobs27Turn: (name, score, target) => `${name}, du hast ${score} Punkte. Ziel: ${target}.`,
    bobs27MustScore: () => 'Achtung, du musst treffen.',

    strPlayerTurn: (name, num, ring) => strTarget(name, num, ring),
    strPlayerDone: (name, darts, turns) => `${name} fertig! ${darts} Darts in ${turns} Aufnahmen.`,
    strLegWinner: (name, darts) => `${name} gewinnt das Leg! ${darts} Darts.`,
    strMatchWinner: (name) => `Game shot, und das Match! ${name}!`,
    strGameOn: () => 'Sträußchen, Game on!',

    shanghaiRoundPlayer: (target, name) => `${target}! ${name}`,
    shanghaiHits: (count) => count === 0 ? 'kein Treffer' : count === 1 ? '1 Treffer' : `${count} Treffer`,
    shanghaiScore: (_name, score) => score === 0 ? 'kein Score' : `${score} Punkte`,
    shanghai: () => 'SHANGHAI!',
    shanghaiWinner: (name, score) => `${name} gewinnt mit ${score} Punkten!`,
    shanghaiDraw: () => 'Unentschieden!',

    killerPlayerTurn: (name) => `${name}, du bist dran`,
    killerQualifying: (name, ring, number) => `${name}, triff die ${ring} ${number}!`,
    killerQualified: (name) => `${name} ist jetzt ein Killer!`,
    killerHit: (attacker, victim, lives) => `${attacker} trifft ${victim}! Noch ${lives} Leben`,
    killerEliminated: (name) => `${name} ist raus!`,
    killerWinner: (name) => `${name} gewinnt! Letzter Überlebender!`,
    killerSelfHeal: (name) => `${name} heilt sich!`,
    killerLegWin: (name) => `${name} gewinnt das Leg!`,
    killerTurnSummary: (name, hits) => hits === 0 ? `${name}, kein Treffer` : hits === 1 ? `${name}, ein Treffer` : `${name}, ${hits} Treffer`,
    killerSetWin: (name) => `${name} gewinnt das Set!`,

    opGameStart: (name) => `${name}, Game on!`,
    opLastRound: () => 'Letzte Runde!',
    opHits: (count) => count === 0 ? 'kein Treffer' : count === 1 ? '1 Treffer' : `${count} Treffer`,
  },

  // ==================== FRANÇAIS ====================
  fr: {
    gameOn: () => 'Game on!',
    gameStart: (name) => `${name}, lance en premier ! Game on !`,
    noScore: () => 'Pas de score !',
    oneEighty: () => 'Cent quatre-vingts !',
    score: (n) => String(n),
    scoreExcited: (n) => `${n} !`,
    bull: () => 'Bull',
    double: (n) => `Double ${n}`,
    playerRemaining: (name, remaining) => `${name}, ${remaining}`,
    andTheLeg: () => 'Et le Leg !',
    andTheSet: () => 'Et le Set !',
    gameShotMatch: () => 'Game shot, et le match !',
    nextPlayer: (name) => name,

    crazyTarget: (target) => `La nouvelle cible est ${target}`,
    crazyPlayerTargets: (name, targets) => `${name}, ${targets.join(', ')}`,
    cricketLeg: (name) => `${name}, et le Leg !`,
    cricketMatch: (name) => `Game shot, et le match ! ${name} !`,
    closed: (target) => `${target} est fermé`,
    cricketMarks: (count) => count === 1 ? '1 touche' : `${count} touches`,
    playerNeeds: (name, needs) => needs.length === 0
      ? `${name}, tout fermé, marque des points !`
      : `${name}, il te faut encore ${formatNeedsFr(needs)}.`,

    atbGameOn: () => 'Around the Block, Game on !',
    triple: () => 'Triple !',
    doubleHit: () => 'Double !',
    atbWinner: (name, darts, time) => `${name} gagne ! ${darts} fléchettes en ${time}`,
    atbPlayerTurn: (name, target) => `${name}, ${target}`,
    bullRequired: () => 'Bull requis !',
    eliminated: (name) => `${name} est éliminé !`,
    threeMissesBack: (target) => `Trois ratés ! Retour à ${target} !`,
    threeMissesStart: () => 'Trois ratés ! Retour au début !',

    ctfPlayerTurn: (name) => `${name}, à toi`,
    ctfNewRound: (round, name, target) => `Manche ${round}, ${name}, ${target}`,
    ctfNewRoundNoNum: (name, target) => `${name}, ${target}`,
    ctfNoScore: () => 'pas de score',
    ctfPoints: (score) => score === 1 ? '1 point' : `${score} points`,
    ctfRoundWin: (name, target) => `${name} gagne ${target} !`,
    ctfRoundTied: (target) => `${target} est à égalité !`,
    ctfThirdToLast: () => 'Antépénultième manche !',
    ctfSecondToLast: () => 'Avant-dernière manche !',
    ctfFinalRound: () => 'Dernière manche !',
    ctfWinner: (name, fields) => `${name} gagne le match avec ${fields} champs !`,
    ctfPlace: (i, name, fields) => `${PLACE_LABELS.fr[i]} : ${name}, avec ${fields} ${fields === 1 ? 'champ' : 'champs'}.`,

    bobs27Turn: (name, score, target) => `${name}, tu as ${score} points. Cible : ${target}.`,
    bobs27MustScore: () => 'Attention, tu dois marquer.',

    strPlayerTurn: (name, num, ring) => strTarget(name, num, ring),
    strPlayerDone: (name, darts, turns) => `${name} terminé ! ${darts} fléchettes en ${turns} volées.`,
    strLegWinner: (name, darts) => `${name} gagne le leg ! ${darts} fléchettes.`,
    strMatchWinner: (name) => `Game shot, et le match ! ${name} !`,
    strGameOn: () => 'Sträußchen, Game on !',

    shanghaiRoundPlayer: (target, name) => `${target} ! ${name}`,
    shanghaiHits: (count) => count === 0 ? 'aucune touche' : count === 1 ? '1 touche' : `${count} touches`,
    shanghaiScore: (_name, score) => score === 0 ? 'pas de score' : `${score} points`,
    shanghai: () => 'SHANGHAI !',
    shanghaiWinner: (name, score) => `${name} gagne avec ${score} points !`,
    shanghaiDraw: () => 'Égalité !',

    killerPlayerTurn: (name) => `${name}, à toi`,
    killerQualifying: (name, ring, number) => `${name}, touche le ${ring} ${number} !`,
    killerQualified: (name) => `${name} est maintenant un Killer !`,
    killerHit: (attacker, victim, lives) => `${attacker} touche ${victim} ! ${lives} ${lives === 1 ? 'vie' : 'vies'} restante${lives === 1 ? '' : 's'}`,
    killerEliminated: (name) => `${name} est éliminé !`,
    killerWinner: (name) => `${name} gagne ! Dernier survivant !`,
    killerSelfHeal: (name) => `${name} se soigne !`,
    killerTurnSummary: (name, hits) => hits === 0 ? `${name}, aucun coup` : hits === 1 ? `${name}, un coup` : `${name}, ${hits} coups`,
    killerLegWin: (name) => `${name} gagne le Leg !`,
    killerSetWin: (name) => `${name} gagne le Set !`,

    opGameStart: (name) => `${name}, Game on !`,
    opLastRound: () => 'Dernière manche !',
    opHits: (count) => count === 0 ? 'aucune touche' : count === 1 ? '1 touche' : `${count} touches`,
  },

  // ==================== ITALIANO ====================
  it: {
    gameOn: () => 'Game on!',
    gameStart: (name) => `${name}, tira per primo! Game on!`,
    noScore: () => 'Nessun punteggio!',
    oneEighty: () => 'Centottanta!',
    score: (n) => String(n),
    scoreExcited: (n) => `${n}!`,
    bull: () => 'Bull',
    double: (n) => `Doppio ${n}`,
    playerRemaining: (name, remaining) => `${name}, ${remaining}`,
    andTheLeg: () => 'E il Leg!',
    andTheSet: () => 'E il Set!',
    gameShotMatch: () => 'Game shot, e il match!',
    nextPlayer: (name) => name,

    crazyTarget: (target) => `Il nuovo bersaglio è ${target}`,
    crazyPlayerTargets: (name, targets) => `${name}, ${targets.join(', ')}`,
    cricketLeg: (name) => `${name}, e il Leg!`,
    cricketMatch: (name) => `Game shot, e il match! ${name}!`,
    closed: (target) => `${target} è chiuso`,
    cricketMarks: (count) => count === 1 ? '1 segno' : `${count} segni`,
    playerNeeds: (name, needs) => needs.length === 0
      ? `${name}, tutto chiuso, fai punti!`
      : `${name}, ti servono ancora ${formatNeedsIt(needs)}.`,

    atbGameOn: () => 'Around the Block, Game on!',
    triple: () => 'Triple!',
    doubleHit: () => 'Double!',
    atbWinner: (name, darts, time) => `${name} vince! ${darts} freccette in ${time}`,
    atbPlayerTurn: (name, target) => `${name}, ${target}`,
    bullRequired: () => 'Bull richiesto!',
    eliminated: (name) => `${name} è eliminato!`,
    threeMissesBack: (target) => `Tre errori! Torna a ${target}!`,
    threeMissesStart: () => 'Tre errori! Torna all\'inizio!',

    ctfPlayerTurn: (name) => `${name}, tocca a te`,
    ctfNewRound: (round, name, target) => `Round ${round}, ${name}, ${target}`,
    ctfNewRoundNoNum: (name, target) => `${name}, ${target}`,
    ctfNoScore: () => 'nessun punteggio',
    ctfPoints: (score) => score === 1 ? '1 punto' : `${score} punti`,
    ctfRoundWin: (name, target) => `${name} vince ${target}!`,
    ctfRoundTied: (target) => `${target} è in parità!`,
    ctfThirdToLast: () => 'Terzultimo round!',
    ctfSecondToLast: () => 'Penultimo round!',
    ctfFinalRound: () => 'Ultimo round!',
    ctfWinner: (name, fields) => `${name} vince il match con ${fields} campi!`,
    ctfPlace: (i, name, fields) => `${PLACE_LABELS.it[i]}: ${name}, con ${fields} ${fields === 1 ? 'campo' : 'campi'}.`,

    bobs27Turn: (name, score, target) => `${name}, hai ${score} punti. Bersaglio: ${target}.`,
    bobs27MustScore: () => 'Attenzione, devi segnare.',

    strPlayerTurn: (name, num, ring) => strTarget(name, num, ring),
    strPlayerDone: (name, darts, turns) => `${name} finito! ${darts} freccette in ${turns} turni.`,
    strLegWinner: (name, darts) => `${name} vince il leg! ${darts} freccette.`,
    strMatchWinner: (name) => `Game shot, e il match! ${name}!`,
    strGameOn: () => 'Sträußchen, Game on!',

    shanghaiRoundPlayer: (target, name) => `${target}! ${name}`,
    shanghaiHits: (count) => count === 0 ? 'nessun colpo' : count === 1 ? '1 colpo' : `${count} colpi`,
    shanghaiScore: (_name, score) => score === 0 ? 'nessun punteggio' : `${score} punti`,
    shanghai: () => 'SHANGHAI!',
    shanghaiWinner: (name, score) => `${name} vince con ${score} punti!`,
    shanghaiDraw: () => 'Pareggio!',

    killerPlayerTurn: (name) => `${name}, tocca a te`,
    killerQualifying: (name, ring, number) => `${name}, colpisci il ${ring} ${number}!`,
    killerQualified: (name) => `${name} è ora un Killer!`,
    killerHit: (attacker, victim, lives) => `${attacker} colpisce ${victim}! ${lives} ${lives === 1 ? 'vita' : 'vite'} rimast${lives === 1 ? 'a' : 'e'}`,
    killerEliminated: (name) => `${name} è eliminato!`,
    killerWinner: (name) => `${name} vince! Ultimo sopravvissuto!`,
    killerTurnSummary: (name, hits) => hits === 0 ? `${name}, nessun colpo` : hits === 1 ? `${name}, un colpo` : `${name}, ${hits} colpi`,
    killerSelfHeal: (name) => `${name} si cura!`,
    killerLegWin: (name) => `${name} vince il Leg!`,
    killerSetWin: (name) => `${name} vince il Set!`,

    opGameStart: (name) => `${name}, Game on!`,
    opLastRound: () => 'Ultimo round!',
    opHits: (count) => count === 0 ? 'nessun colpo' : count === 1 ? '1 colpo' : `${count} colpi`,
  },

  // ==================== SVENSKA ====================
  sv: {
    gameOn: () => 'Game on!',
    gameStart: (name) => `${name}, kasta först! Game on!`,
    noScore: () => 'Ingen poäng!',
    oneEighty: () => 'Hundraåttio!',
    score: (n) => String(n),
    scoreExcited: (n) => `${n}!`,
    bull: () => 'Bull',
    double: (n) => `Dubbel ${n}`,
    playerRemaining: (name, remaining) => `${name}, ${remaining}`,
    andTheLeg: () => 'Och Legget!',
    andTheSet: () => 'Och Settet!',
    gameShotMatch: () => 'Game shot, och matchen!',
    nextPlayer: (name) => name,

    crazyTarget: (target) => `Nytt mål är ${target}`,
    crazyPlayerTargets: (name, targets) => `${name}, ${targets.join(', ')}`,
    cricketLeg: (name) => `${name}, och Legget!`,
    cricketMatch: (name) => `Game shot, och matchen! ${name}!`,
    closed: (target) => `${target} är stängd`,
    cricketMarks: (count) => count === 1 ? '1 träff' : `${count} träffar`,
    playerNeeds: (name, needs) => needs.length === 0
      ? `${name}, allt stängt, gör poäng!`
      : `${name}, du behöver fortfarande ${formatNeedsSv(needs)}.`,

    atbGameOn: () => 'Around the Block, Game on!',
    triple: () => 'Triple!',
    doubleHit: () => 'Double!',
    atbWinner: (name, darts, time) => `${name} vinner! ${darts} pilar på ${time}`,
    atbPlayerTurn: (name, target) => `${name}, ${target}`,
    bullRequired: () => 'Bull krävs!',
    eliminated: (name) => `${name} är utslagen!`,
    threeMissesBack: (target) => `Tre missar! Tillbaka till ${target}!`,
    threeMissesStart: () => 'Tre missar! Tillbaka till start!',

    ctfPlayerTurn: (name) => `${name}, din tur`,
    ctfNewRound: (round, name, target) => `Runda ${round}, ${name}, ${target}`,
    ctfNewRoundNoNum: (name, target) => `${name}, ${target}`,
    ctfNoScore: () => 'ingen poäng',
    ctfPoints: (score) => score === 1 ? '1 poäng' : `${score} poäng`,
    ctfRoundWin: (name, target) => `${name} vinner ${target}!`,
    ctfRoundTied: (target) => `${target} är oavgjort!`,
    ctfThirdToLast: () => 'Tredje sista rundan!',
    ctfSecondToLast: () => 'Näst sista rundan!',
    ctfFinalRound: () => 'Sista rundan!',
    ctfWinner: (name, fields) => `${name} vinner matchen med ${fields} fält!`,
    ctfPlace: (i, name, fields) => `${PLACE_LABELS.sv[i]}: ${name}, med ${fields} fält.`,

    bobs27Turn: (name, score, target) => `${name}, du har ${score} poäng. Mål: ${target}.`,
    bobs27MustScore: () => 'Obs, du måste träffa.',

    strPlayerTurn: (name, num, ring) => strTarget(name, num, ring),
    strPlayerDone: (name, darts, turns) => `${name} klar! ${darts} pilar på ${turns} omgångar.`,
    strLegWinner: (name, darts) => `${name} vinner legget! ${darts} pilar.`,
    strMatchWinner: (name) => `Game shot, och matchen! ${name}!`,
    strGameOn: () => 'Sträußchen, Game on!',

    shanghaiRoundPlayer: (target, name) => `${target}! ${name}`,
    shanghaiHits: (count) => count === 0 ? 'inga träffar' : count === 1 ? '1 träff' : `${count} träffar`,
    shanghaiScore: (_name, score) => score === 0 ? 'ingen poäng' : `${score} poäng`,
    shanghai: () => 'SHANGHAI!',
    shanghaiWinner: (name, score) => `${name} vinner med ${score} poäng!`,
    shanghaiDraw: () => 'Oavgjort!',

    killerPlayerTurn: (name) => `${name}, din tur`,
    killerQualifying: (name, ring, number) => `${name}, träffa ${ring} ${number}!`,
    killerQualified: (name) => `${name} är nu en Killer!`,
    killerHit: (attacker, victim, lives) => `${attacker} träffar ${victim}! ${lives} liv kvar`,
    killerEliminated: (name) => `${name} är utslagen!`,
    killerTurnSummary: (name, hits) => hits === 0 ? `${name}, ingen traff` : hits === 1 ? `${name}, en traff` : `${name}, ${hits} traffar`,
    killerWinner: (name) => `${name} vinner! Sista överlevande!`,
    killerSelfHeal: (name) => `${name} läker sig!`,
    killerLegWin: (name) => `${name} vinner Legget!`,
    killerSetWin: (name) => `${name} vinner Settet!`,

    opGameStart: (name) => `${name}, Game on!`,
    opLastRound: () => 'Sista rundan!',
    opHits: (count) => count === 0 ? 'inga träffar' : count === 1 ? '1 träff' : `${count} träffar`,
  },

  // ==================== NEDERLANDS ====================
  nl: {
    gameOn: () => 'Game on!',
    gameStart: (name) => `${name}, gooi eerst! Game on!`,
    noScore: () => 'Geen score!',
    oneEighty: () => 'Honderdtachtig!',
    score: (n) => String(n),
    scoreExcited: (n) => `${n}!`,
    bull: () => 'Bull',
    double: (n) => `Dubbel ${n}`,
    playerRemaining: (name, remaining) => `${name}, ${remaining}`,
    andTheLeg: () => 'En de Leg!',
    andTheSet: () => 'En de Set!',
    gameShotMatch: () => 'Game shot, en de match!',
    nextPlayer: (name) => name,

    crazyTarget: (target) => `Het nieuwe doel is ${target}`,
    crazyPlayerTargets: (name, targets) => `${name}, ${targets.join(', ')}`,
    cricketLeg: (name) => `${name}, en de Leg!`,
    cricketMatch: (name) => `Game shot, en de match! ${name}!`,
    closed: (target) => `${target} is gesloten`,
    cricketMarks: (count) => count === 1 ? '1 treffer' : `${count} treffers`,
    playerNeeds: (name, needs) => needs.length === 0
      ? `${name}, alles dicht, scoor punten!`
      : `${name}, je hebt nog ${formatNeedsNl(needs)} nodig.`,

    atbGameOn: () => 'Around the Block, Game on!',
    triple: () => 'Triple!',
    doubleHit: () => 'Double!',
    atbWinner: (name, darts, time) => `${name} wint! ${darts} pijlen in ${time}`,
    atbPlayerTurn: (name, target) => `${name}, ${target}`,
    bullRequired: () => 'Bull vereist!',
    eliminated: (name) => `${name} is uitgeschakeld!`,
    threeMissesBack: (target) => `Drie missers! Terug naar ${target}!`,
    threeMissesStart: () => 'Drie missers! Terug naar start!',

    ctfPlayerTurn: (name) => `${name}, jouw beurt`,
    ctfNewRound: (round, name, target) => `Ronde ${round}, ${name}, ${target}`,
    ctfNewRoundNoNum: (name, target) => `${name}, ${target}`,
    ctfNoScore: () => 'geen score',
    ctfPoints: (score) => score === 1 ? '1 punt' : `${score} punten`,
    ctfRoundWin: (name, target) => `${name} wint ${target}!`,
    ctfRoundTied: (target) => `${target} is gelijk!`,
    ctfThirdToLast: () => 'Op twee na laatste ronde!',
    ctfSecondToLast: () => 'Voorlaatste ronde!',
    ctfFinalRound: () => 'Laatste ronde!',
    ctfWinner: (name, fields) => `${name} wint de match met ${fields} velden!`,
    ctfPlace: (i, name, fields) => `${PLACE_LABELS.nl[i]}: ${name}, met ${fields} ${fields === 1 ? 'veld' : 'velden'}.`,

    bobs27Turn: (name, score, target) => `${name}, je hebt ${score} punten. Doel: ${target}.`,
    bobs27MustScore: () => 'Let op, je moet scoren.',

    strPlayerTurn: (name, num, ring) => strTarget(name, num, ring),
    strPlayerDone: (name, darts, turns) => `${name} klaar! ${darts} pijlen in ${turns} rondes.`,
    strLegWinner: (name, darts) => `${name} wint de leg! ${darts} pijlen.`,
    strMatchWinner: (name) => `Game shot, en de match! ${name}!`,
    strGameOn: () => 'Sträußchen, Game on!',

    shanghaiRoundPlayer: (target, name) => `${target}! ${name}`,
    shanghaiHits: (count) => count === 0 ? 'geen treffers' : count === 1 ? '1 treffer' : `${count} treffers`,
    shanghaiScore: (_name, score) => score === 0 ? 'geen score' : `${score} punten`,
    shanghai: () => 'SHANGHAI!',
    shanghaiWinner: (name, score) => `${name} wint met ${score} punten!`,
    shanghaiDraw: () => 'Gelijkspel!',

    killerPlayerTurn: (name) => `${name}, jouw beurt`,
    killerQualifying: (name, ring, number) => `${name}, raak de ${ring} ${number}!`,
    killerQualified: (name) => `${name} is nu een Killer!`,
    killerHit: (attacker, victim, lives) => `${attacker} raakt ${victim}! Nog ${lives} ${lives === 1 ? 'leven' : 'levens'}`,
    killerTurnSummary: (name, hits) => hits === 0 ? `${name}, geen raak` : hits === 1 ? `${name}, een raak` : `${name}, ${hits} raak`,
    killerEliminated: (name) => `${name} is uitgeschakeld!`,
    killerWinner: (name) => `${name} wint! Laatste overlevende!`,
    killerSelfHeal: (name) => `${name} geneest zichzelf!`,
    killerLegWin: (name) => `${name} wint de Leg!`,
    killerSetWin: (name) => `${name} wint de Set!`,

    opGameStart: (name) => `${name}, Game on!`,
    opLastRound: () => 'Laatste ronde!',
    opHits: (count) => count === 0 ? 'geen treffers' : count === 1 ? '1 treffer' : `${count} treffers`,
  },
}
