// src/types/highscores.ts
// Typen für die neue Highscores / Hall of Fame Seite

export type HighscoreGameType =
  | 'all'
  | 'x01'
  | 'cricket'
  | 'atb'
  | 'bobs27'
  | 'operation'
  | 'shanghai'
  | 'ctf'
  | 'str'
  | 'killer'
  | 'highscore'

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
  | 'bobs27-best-leg-score'
  | 'bobs27-most-hits-leg'
  | 'bobs27-best-double-rate-dart'
  | 'bobs27-best-double-rate-visit'
  | 'bobs27-fewest-zero-visits'
  | 'bobs27-longest-hit-streak'
  | 'bobs27-best-finish-5'
  | 'bobs27-most-bulls-leg'
  // Operation
  | 'operation-best-score'
  | 'operation-best-avg-ppd'
  | 'operation-best-hitrate'
  | 'operation-most-wins'
  | 'operation-longest-streak'
  // Shanghai
  | 'shanghai-most-wins'
  | 'shanghai-most-finishs'
  | 'shanghai-highest-leg-score'
  | 'shanghai-fewest-darts'
  | 'shanghai-highest-turn'
  | 'shanghai-perfect-turns'
  | 'shanghai-biggest-margin'
  | 'shanghai-focused-match'
  | 'shanghai-triple-master'
  | 'shanghai-best-score-percent'
  | 'shanghai-best-hit-rate'
  | 'shanghai-best-visit-rate'
  | 'shanghai-best-efficiency'
  | 'shanghai-highest-clutch'
  | 'shanghai-most-triples-leg'
  | 'shanghai-fewest-zero-rounds'
  | 'shanghai-longest-hit-streak'
  // CTF
  | 'ctf-most-wins'
  | 'ctf-highest-match-score'
  | 'ctf-most-fields'
  | 'ctf-longest-streak'
  | 'ctf-best-turn'
  | 'ctf-perfect-match'
  | 'ctf-bull-sniper'
  | 'ctf-focused-match'
  | 'ctf-triple-threes'
  | 'ctf-clean-sheet'
  // Sträußchen
  | 'str-most-wins'
  | 'str-fastest-time'
  | 'str-fewest-darts'
  | 'str-hit-streak'
  | 'str-best-hit-rate'
  // Killer
  | 'killer-most-wins'
  | 'killer-most-eliminations-match'
  | 'killer-most-eliminations-career'
  | 'killer-multi-kill'
  | 'killer-flawless-wins'
  // Highscore-Modus
  | 'highscore-most-wins'
  | 'highscore-highest-leg-score'
  | 'highscore-most-180s'
  | 'highscore-fastest-leg'
  | 'highscore-career-180s'
  | 'highscore-best-career-avg'

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
  { id: 'bobs27-best-leg-score', title: 'Bestes Leg aller Zeiten', subtitle: "Einzel-Leg", gameType: 'bobs27', sortOrder: 'desc', format: 'number', multiPerPlayer: true },
  { id: 'bobs27-most-hits-leg', title: 'Meiste Treffer in einem Leg', subtitle: 'Einzel-Leg', gameType: 'bobs27', sortOrder: 'desc', format: 'number', multiPerPlayer: true },
  { id: 'bobs27-best-double-rate-dart', title: 'Beste Dart-Doppelquote (Leg)', subtitle: 'D1-D20, min. 40 Darts', gameType: 'bobs27', sortOrder: 'desc', format: 'percent', multiPerPlayer: true },
  { id: 'bobs27-best-double-rate-visit', title: 'Beste Aufnahme-Quote (Leg)', subtitle: 'D1-D20, min. 20 Aufnahmen', gameType: 'bobs27', sortOrder: 'desc', format: 'percent', multiPerPlayer: true },
  { id: 'bobs27-fewest-zero-visits', title: 'Wenigste Zero Visits (Leg)', subtitle: 'Einzel-Leg', gameType: 'bobs27', sortOrder: 'asc', format: 'number', multiPerPlayer: true },
  { id: 'bobs27-longest-hit-streak', title: 'Laengste Treffer-Serie', subtitle: 'Einzel-Leg', gameType: 'bobs27', sortOrder: 'desc', format: 'number', multiPerPlayer: true },
  { id: 'bobs27-best-finish-5', title: 'Bestes Finish (letzte 5)', subtitle: 'Aufnahme-Quote', gameType: 'bobs27', sortOrder: 'desc', format: 'percent', multiPerPlayer: true },
  { id: 'bobs27-most-bulls-leg', title: 'Meiste Bulls in einem Leg', subtitle: 'Einzel-Leg', gameType: 'bobs27', sortOrder: 'desc', format: 'number', multiPerPlayer: true },

  // Operation
  { id: 'operation-best-score', title: 'Meiste Treffer', subtitle: 'Operation: EFKG', gameType: 'operation', sortOrder: 'desc', format: 'number' },
  { id: 'operation-best-avg-ppd', title: 'Bester Ø Punkte/Dart', subtitle: 'Karriere', gameType: 'operation', sortOrder: 'desc', format: 'decimal', minRequirement: 'min. 5 Matches' },
  { id: 'operation-best-hitrate', title: 'Beste Hit-Rate', subtitle: 'Karriere', gameType: 'operation', sortOrder: 'desc', format: 'percent', minRequirement: 'min. 5 Matches' },
  { id: 'operation-most-wins', title: 'Meiste Siege', subtitle: 'Operation: EFKG', gameType: 'operation', sortOrder: 'desc', format: 'number' },
  { id: 'operation-longest-streak', title: 'Längster Streak', subtitle: 'Operation: EFKG', gameType: 'operation', sortOrder: 'desc', format: 'number' },

  // Shanghai
  { id: 'shanghai-most-wins', title: 'Meiste Siege', icon: '🏯', subtitle: 'Shanghai', gameType: 'shanghai', sortOrder: 'desc', format: 'number' },
  { id: 'shanghai-most-finishs', title: 'Meiste Shanghai-Finishs', icon: '🐉', subtitle: 'S + D + T einer Zahl', gameType: 'shanghai', sortOrder: 'desc', format: 'number' },
  { id: 'shanghai-highest-leg-score', title: 'Höchste Leg-Punktzahl', icon: '💎', subtitle: 'Einzel-Leg', gameType: 'shanghai', sortOrder: 'desc', format: 'number', multiPerPlayer: true },
  { id: 'shanghai-fewest-darts', title: 'Wenigste Darts bis Sieg', icon: '⚡', subtitle: 'Match', gameType: 'shanghai', sortOrder: 'asc', format: 'darts' },
  { id: 'shanghai-highest-turn', title: 'Höchste Aufnahme', icon: '🔥', subtitle: 'Einzel-Turn', gameType: 'shanghai', sortOrder: 'desc', format: 'number', multiPerPlayer: true },
  { id: 'shanghai-perfect-turns', title: 'Perfekte Runden', icon: '💫', subtitle: '3 Darts auf Ziel', gameType: 'shanghai', sortOrder: 'desc', format: 'number' },
  { id: 'shanghai-biggest-margin', title: 'Größter Sieg-Abstand', icon: '👑', subtitle: 'Punkte vor 2.', gameType: 'shanghai', sortOrder: 'desc', format: 'number', multiPerPlayer: true },
  { id: 'shanghai-focused-match', title: 'Fokussierte Matches', icon: '🎯', subtitle: 'Jede Aufnahme trifft', gameType: 'shanghai', sortOrder: 'desc', format: 'number' },
  { id: 'shanghai-triple-master', title: 'Triple-Magier', icon: '🌟', subtitle: 'Triple-Quote auf Ziel', gameType: 'shanghai', sortOrder: 'desc', format: 'percent', minRequirement: 'min. 30 Darts' },
  { id: 'shanghai-best-score-percent', title: 'Beste Score %', subtitle: 'Einzel-Leg', gameType: 'shanghai', sortOrder: 'desc', format: 'percent', multiPerPlayer: true },
  { id: 'shanghai-best-hit-rate', title: 'Beste Trefferquote (Leg)', subtitle: 'Treffer / Darts', gameType: 'shanghai', sortOrder: 'desc', format: 'percent', multiPerPlayer: true },
  { id: 'shanghai-best-visit-rate', title: 'Beste Aufnahme-Quote (Leg)', subtitle: 'Runden mit \u22651 Treffer', gameType: 'shanghai', sortOrder: 'desc', format: 'percent', multiPerPlayer: true },
  { id: 'shanghai-best-efficiency', title: 'Beste Effizienz (Leg)', subtitle: 'Punkte / Treffer', gameType: 'shanghai', sortOrder: 'desc', format: 'decimal', multiPerPlayer: true, minRequirement: 'min. 10 Treffer' },
  { id: 'shanghai-highest-clutch', title: 'Höchster Clutch Score', subtitle: 'Runden 15\u201320', gameType: 'shanghai', sortOrder: 'desc', format: 'number', multiPerPlayer: true },
  { id: 'shanghai-most-triples-leg', title: 'Meiste Triple in einem Leg', subtitle: 'Einzel-Leg', gameType: 'shanghai', sortOrder: 'desc', format: 'number', multiPerPlayer: true },
  { id: 'shanghai-fewest-zero-rounds', title: 'Wenigste Zero Rounds (Leg)', subtitle: 'Vollst. Leg', gameType: 'shanghai', sortOrder: 'asc', format: 'number', multiPerPlayer: true },
  { id: 'shanghai-longest-hit-streak', title: 'Laengste Treffer-Serie', subtitle: 'Einzel-Leg', gameType: 'shanghai', sortOrder: 'desc', format: 'number', multiPerPlayer: true },

  // Capture the Field
  { id: 'ctf-most-wins', title: 'Meiste Siege', icon: '🚩', subtitle: 'Capture the Field', gameType: 'ctf', sortOrder: 'desc', format: 'number' },
  { id: 'ctf-highest-match-score', title: 'Höchste Matchpunkte', icon: '💎', subtitle: 'Einzel-Match', gameType: 'ctf', sortOrder: 'desc', format: 'number', multiPerPlayer: true },
  { id: 'ctf-most-fields', title: 'Meiste eroberte Felder', icon: '🏴', subtitle: 'Einzel-Match', gameType: 'ctf', sortOrder: 'desc', format: 'number', multiPerPlayer: true },
  { id: 'ctf-longest-streak', title: 'Längste Siegesserie', icon: '🔥', subtitle: 'Felder in Folge', gameType: 'ctf', sortOrder: 'desc', format: 'number', multiPerPlayer: true },
  { id: 'ctf-best-turn', title: 'Beste Aufnahme', icon: '💥', subtitle: 'Einzel-Turn', gameType: 'ctf', sortOrder: 'desc', format: 'number', multiPerPlayer: true },
  { id: 'ctf-perfect-match', title: 'Blanke Matches', icon: '⭐', subtitle: 'Alle Felder erobert', gameType: 'ctf', sortOrder: 'desc', format: 'number' },
  { id: 'ctf-bull-sniper', title: 'Bull-Schütze', icon: '🎯', subtitle: 'Bull-Treffer gesamt', gameType: 'ctf', sortOrder: 'desc', format: 'number' },
  { id: 'ctf-focused-match', title: 'Fokussierte Matches', icon: '🎯', subtitle: 'Jede Aufnahme trifft', gameType: 'ctf', sortOrder: 'desc', format: 'number' },
  { id: 'ctf-triple-threes', title: '3-von-3 Aufnahmen', icon: '💯', subtitle: 'Alle Darts Treffer', gameType: 'ctf', sortOrder: 'desc', format: 'number' },
  { id: 'ctf-clean-sheet', title: 'Saubere Weste', icon: '🛡️', subtitle: 'Kein Feld verloren', gameType: 'ctf', sortOrder: 'desc', format: 'number' },

  // Sträußchen
  { id: 'str-most-wins', title: 'Meiste Siege', icon: '💐', subtitle: 'Sträußchen', gameType: 'str', sortOrder: 'desc', format: 'number' },
  { id: 'str-fastest-time', title: 'Schnellste Zeit', icon: '⏱️', subtitle: 'Match', gameType: 'str', sortOrder: 'asc', format: 'time' },
  { id: 'str-fewest-darts', title: 'Wenigste Darts', icon: '⚡', subtitle: 'Match', gameType: 'str', sortOrder: 'asc', format: 'darts' },
  { id: 'str-hit-streak', title: 'Treffer in Folge', icon: '🔥', subtitle: 'Einzel-Match', gameType: 'str', sortOrder: 'desc', format: 'number', multiPerPlayer: true },
  { id: 'str-best-hit-rate', title: 'Beste Trefferquote', icon: '🎯', subtitle: 'Karriere', gameType: 'str', sortOrder: 'desc', format: 'percent', minRequirement: 'min. 10 Turns' },

  // Killer
  { id: 'killer-most-wins', title: 'Meiste Siege', icon: '🗡️', subtitle: 'Killer', gameType: 'killer', sortOrder: 'desc', format: 'number' },
  { id: 'killer-most-eliminations-match', title: 'Meiste Eliminationen', icon: '💀', subtitle: 'Einzel-Match', gameType: 'killer', sortOrder: 'desc', format: 'number', multiPerPlayer: true },
  { id: 'killer-most-eliminations-career', title: 'Killer-Karriere', icon: '☠️', subtitle: 'Gesamt-Eliminationen', gameType: 'killer', sortOrder: 'desc', format: 'number' },
  { id: 'killer-multi-kill', title: 'Multi-Kill', icon: '💥', subtitle: 'Eliminationen in einer Aufnahme', gameType: 'killer', sortOrder: 'desc', format: 'number', multiPerPlayer: true },
  { id: 'killer-flawless-wins', title: 'Makellose Siege', icon: '🛡️', subtitle: 'Ohne Leben-Verlust', gameType: 'killer', sortOrder: 'desc', format: 'number' },

  // Highscore (Spielmodus)
  { id: 'highscore-most-wins', title: 'Meiste Siege', icon: '🏆', subtitle: 'Highscore-Modus', gameType: 'highscore', sortOrder: 'desc', format: 'number' },
  { id: 'highscore-highest-leg-score', title: 'Höchster Leg-Score', icon: '💎', subtitle: 'Einzel-Leg', gameType: 'highscore', sortOrder: 'desc', format: 'number', multiPerPlayer: true },
  { id: 'highscore-most-180s', title: 'Meiste 180er', icon: '🎯', subtitle: 'Einzel-Match', gameType: 'highscore', sortOrder: 'desc', format: 'number', multiPerPlayer: true },
  { id: 'highscore-fastest-leg', title: 'Wenigste Darts bis Finish', icon: '⚡', subtitle: 'Leg', gameType: 'highscore', sortOrder: 'asc', format: 'darts', multiPerPlayer: true },
  { id: 'highscore-career-180s', title: '180er-Karriere', icon: '🎯', subtitle: 'Gesamt', gameType: 'highscore', sortOrder: 'desc', format: 'number' },
  { id: 'highscore-best-career-avg', title: 'Bester Karriere-Ø', icon: '📊', subtitle: 'Punkte pro 3 Darts', gameType: 'highscore', sortOrder: 'desc', format: 'decimal', minRequirement: 'min. 5 Matches' },
]
