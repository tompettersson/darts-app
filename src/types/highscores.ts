// src/types/highscores.ts
// Typen für die neue Highscores / Hall of Fame Seite

export type HighscoreGameType = 'all' | 'x01' | 'cricket' | 'atb'

export type HighscoreCategory = {
  id: string
  title: string
  subtitle?: string  // z.B. "X01", "Cricket", "X01 · 501"
  gameType: HighscoreGameType  // Für Tab-Filterung
  entries: HighscoreEntry[]
  sortOrder: 'asc' | 'desc'  // asc = weniger ist besser (Darts), desc = mehr ist besser
  format: 'number' | 'percent' | 'decimal' | 'darts' | 'time'
  minRequirement?: string  // z.B. "min. 10 Matches"
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
  // Cricket
  | 'best-mpt'
  | 'best-mpd'
  | 'most-triples'
  | 'best-turn-marks'
  // Around the Block
  | 'atb-fastest-ascending'
  | 'atb-fastest-board'
  | 'atb-fewest-darts-ascending'
  | 'atb-fewest-darts-board'
  | 'atb-most-wins'

// Konfiguration für alle Kategorien
export const HIGHSCORE_CATEGORIES: {
  id: HighscoreCategoryId
  title: string
  subtitle?: string
  gameType: HighscoreGameType
  sortOrder: 'asc' | 'desc'
  format: 'number' | 'percent' | 'decimal' | 'darts' | 'time'
  minRequirement?: string
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

  // Cricket
  { id: 'best-mpt', title: 'Beste Treffer/Runde', subtitle: 'Karriere', gameType: 'cricket', sortOrder: 'desc', format: 'decimal', minRequirement: 'min. 50 Runden' },
  { id: 'best-mpd', title: 'Beste Treffer/Pfeil', subtitle: 'Karriere', gameType: 'cricket', sortOrder: 'desc', format: 'decimal', minRequirement: 'min. 100 Pfeile' },
  { id: 'most-triples', title: 'Meiste Triples', subtitle: 'Karriere', gameType: 'cricket', sortOrder: 'desc', format: 'number' },
  { id: 'best-turn-marks', title: 'Beste Runde', gameType: 'cricket', sortOrder: 'desc', format: 'number' },

  // Around the Block
  { id: 'atb-fastest-ascending', title: 'Schnellste Zeit', subtitle: 'Aufsteigend', gameType: 'atb', sortOrder: 'asc', format: 'time' as any },
  { id: 'atb-fastest-board', title: 'Schnellste Zeit', subtitle: 'Drumherum', gameType: 'atb', sortOrder: 'asc', format: 'time' as any },
  { id: 'atb-fewest-darts-ascending', title: 'Wenigste Darts', subtitle: 'Aufsteigend', gameType: 'atb', sortOrder: 'asc', format: 'darts' },
  { id: 'atb-fewest-darts-board', title: 'Wenigste Darts', subtitle: 'Drumherum', gameType: 'atb', sortOrder: 'asc', format: 'darts' },
  { id: 'atb-most-wins', title: 'Meiste Siege', subtitle: 'Around the Block', gameType: 'atb', sortOrder: 'desc', format: 'number' },
]
