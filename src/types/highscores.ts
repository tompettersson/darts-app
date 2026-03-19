// src/types/highscores.ts
// Typen für die neue Highscores / Hall of Fame Seite

export type HighscoreGameType = 'all' | 'x01' | 'cricket' | 'atb' | 'bobs27' | 'operation'

export type HighscoreCategory = {
  id: string
  title: string
  icon?: string
  subtitle?: string  // z.B. "X01", "Cricket", "X01 · 501"
  gameType: HighscoreGameType  // Für Tab-Filterung
  entries: HighscoreEntry[]
  sortOrder: 'asc' | 'desc'  // asc = weniger ist besser (Darts), desc = mehr ist besser
  format: 'number' | 'percent' | 'decimal' | 'darts' | 'time'
  minRequirement?: string  // z.B. "min. 10 Matches"
  multiPerPlayer?: boolean  // true = mehrere Einträge pro Spieler möglich
}

export type HighscoreEntry = {
  rank: number
  playerId: string
  playerName: string
  playerColor?: string
  value: number
  matchId?: string  // Optional: Link zum Match für Einzelleistungen
  matchDate?: string  // Optional: Datum der Leistung
}

// Kategorie-IDs für einfache Referenzierung
export type HighscoreCategoryId =
  // Übergreifend
  | 'most-wins'
  | 'best-winrate'
  // X01 varianten-unabhängig
  | 'highest-visit'
  | 'highest-checkout'
  | 'most-180s'
  | 'best-career-avg'
  | 'best-checkout-pct'
  // X01 varianten-abhängig
  | 'best-leg-501'
  | 'best-leg-301'
  | 'best-leg-701'
  | 'best-match-avg-501'
  | 'best-match-avg-301'
  // Cricket (neu)
  | 'cricket-best-turn-marks'
  | 'cricket-best-winrate'
  | 'cricket-highest-leg-score'
  | 'cricket-fewest-darts'
  | 'cricket-best-scoring-round'
  | 'cricket-most-bulls-leg'
  // Around the Block
  | 'atb-fastest-ascending'
  | 'atb-fastest-board'
  | 'atb-fewest-darts-ascending'
  | 'atb-fewest-darts-board'
  | 'atb-most-wins'
  // Bob's 27
  | 'bobs27-best-score'
  | 'bobs27-best-hitrate'
  | 'bobs27-most-wins'
  // Operation
  | 'operation-best-score'
  | 'operation-best-avg-ppd'
  | 'operation-best-hitrate'
  | 'operation-most-wins'
  | 'operation-longest-streak'

// Konfiguration für alle Kategorien
export const HIGHSCORE_CATEGORIES: {
  id: HighscoreCategoryId
  title: string
  icon?: string
  subtitle?: string
  gameType: HighscoreGameType
  sortOrder: 'asc' | 'desc'
  format: 'number' | 'percent' | 'decimal' | 'darts' | 'time'
  minRequirement?: string
  multiPerPlayer?: boolean
}[] = [
  // Übergreifend
  { id: 'most-wins', title: 'Meiste Siege', subtitle: 'Gesamt', gameType: 'all', sortOrder: 'desc', format: 'number' },
  { id: 'best-winrate', title: 'Beste Gewinnquote', subtitle: 'Gesamt', gameType: 'all', sortOrder: 'desc', format: 'percent', minRequirement: 'min. 10 Spiele' },

  // X01 varianten-unabhängig
  { id: 'highest-visit', title: 'Höchste Aufnahme', subtitle: 'X01', gameType: 'x01', sortOrder: 'desc', format: 'number' },
  { id: 'highest-checkout', title: 'Höchstes Finish', subtitle: 'X01', gameType: 'x01', sortOrder: 'desc', format: 'number' },
  { id: 'most-180s', title: 'Meiste 180er', subtitle: 'X01', gameType: 'x01', sortOrder: 'desc', format: 'number' },
  { id: 'best-career-avg', title: 'Bester Average', subtitle: 'X01 · Karriere', gameType: 'x01', sortOrder: 'desc', format: 'decimal' },
  { id: 'best-checkout-pct', title: 'Beste Doppelquote', subtitle: 'X01 · Karriere', gameType: 'x01', sortOrder: 'desc', format: 'percent', minRequirement: 'min. 20 Versuche' },

  // X01 varianten-abhängig
  { id: 'best-leg-501', title: 'Bestes Leg', subtitle: '501', gameType: 'x01', sortOrder: 'asc', format: 'darts' },
  { id: 'best-leg-301', title: 'Bestes Leg', subtitle: '301', gameType: 'x01', sortOrder: 'asc', format: 'darts' },
  { id: 'best-leg-701', title: 'Bestes Leg', subtitle: '701', gameType: 'x01', sortOrder: 'asc', format: 'darts' },
  { id: 'best-match-avg-501', title: 'Bester Match-Average', subtitle: '501', gameType: 'x01', sortOrder: 'desc', format: 'decimal' },
  { id: 'best-match-avg-301', title: 'Bester Match-Average', subtitle: '301', gameType: 'x01', sortOrder: 'desc', format: 'decimal' },

  // Cricket (6 Kategorien, mit Icons und Trophäen)
  { id: 'cricket-best-turn-marks', title: 'Meiste Treffer pro Turn', icon: '🎯', gameType: 'cricket', sortOrder: 'desc', format: 'number', multiPerPlayer: true },
  { id: 'cricket-best-winrate', title: 'Beste Siegquote', icon: '👑', subtitle: 'Alle Cricket-Modi', gameType: 'cricket', sortOrder: 'desc', format: 'percent', minRequirement: 'min. 10 Spiele', multiPerPlayer: false },
  { id: 'cricket-highest-leg-score', title: 'Höchste Punktzahl', icon: '💎', subtitle: 'Leg', gameType: 'cricket', sortOrder: 'desc', format: 'number', multiPerPlayer: true },
  { id: 'cricket-fewest-darts', title: 'Wenigste Darts bis Finish', icon: '⚡', subtitle: 'Leg', gameType: 'cricket', sortOrder: 'asc', format: 'darts', multiPerPlayer: true },
  { id: 'cricket-best-scoring-round', title: 'Beste Scoring-Runde', icon: '🔥', subtitle: 'Aufnahme', gameType: 'cricket', sortOrder: 'desc', format: 'number', multiPerPlayer: true },
  { id: 'cricket-most-bulls-leg', title: 'Meiste Bulls in einem Leg', icon: '🐂', subtitle: 'Leg', gameType: 'cricket', sortOrder: 'desc', format: 'number', multiPerPlayer: true },

  // Around the Block
  { id: 'atb-fastest-ascending', title: 'Schnellste Zeit', subtitle: 'Aufsteigend', gameType: 'atb', sortOrder: 'asc', format: 'time' as any },
  { id: 'atb-fastest-board', title: 'Schnellste Zeit', subtitle: 'Drumherum', gameType: 'atb', sortOrder: 'asc', format: 'time' as any },
  { id: 'atb-fewest-darts-ascending', title: 'Wenigste Darts', subtitle: 'Aufsteigend', gameType: 'atb', sortOrder: 'asc', format: 'darts' },
  { id: 'atb-fewest-darts-board', title: 'Wenigste Darts', subtitle: 'Drumherum', gameType: 'atb', sortOrder: 'asc', format: 'darts' },
  { id: 'atb-most-wins', title: 'Meiste Siege', subtitle: 'Around the Block', gameType: 'atb', sortOrder: 'desc', format: 'number' },

  // Bob's 27
  { id: 'bobs27-best-score', title: 'Bester Endstand', subtitle: "Bob's 27", gameType: 'bobs27', sortOrder: 'desc', format: 'number' },
  { id: 'bobs27-best-hitrate', title: 'Beste Hit-Rate', subtitle: 'Karriere', gameType: 'bobs27', sortOrder: 'desc', format: 'percent', minRequirement: 'min. 5 Matches' },
  { id: 'bobs27-most-wins', title: 'Meiste Siege', subtitle: "Bob's 27", gameType: 'bobs27', sortOrder: 'desc', format: 'number' },

  // Operation
  { id: 'operation-best-score', title: 'Meiste Treffer', subtitle: 'Operation: EFKG', gameType: 'operation', sortOrder: 'desc', format: 'number' },
  { id: 'operation-best-avg-ppd', title: 'Bester Ø Punkte/Dart', subtitle: 'Karriere', gameType: 'operation', sortOrder: 'desc', format: 'decimal', minRequirement: 'min. 5 Matches' },
  { id: 'operation-best-hitrate', title: 'Beste Hit-Rate', subtitle: 'Karriere', gameType: 'operation', sortOrder: 'desc', format: 'percent', minRequirement: 'min. 5 Matches' },
  { id: 'operation-most-wins', title: 'Meiste Siege', subtitle: 'Operation: EFKG', gameType: 'operation', sortOrder: 'desc', format: 'number' },
  { id: 'operation-longest-streak', title: 'Längster Streak', subtitle: 'Operation: EFKG', gameType: 'operation', sortOrder: 'desc', format: 'number' },
]
