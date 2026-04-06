# Startup-Optimierung: Lazy Loading statt Eager Loading

## Status: Geplant

## Problem

Beim App-Start (Phase 2 in `src/db/init.ts`) werden die kompletten Match-Daten aller 10 Spielmodi geladen — inkl. Events, Spieler-Zuordnungen. Das sind ~30 DB-Queries mit teils großen Payloads (Events: ~500 Bytes pro Eintrag x tausende).

Das einzige was der Startscreen braucht:
- **Profile** (Phase 1, bereits optimiert)
- **Gibt es ein offenes Spiel?** (für "Spiel fortsetzen" Button)

## Ist-Zustand

```
Phase 1: Profile laden (1 Query)                    → BEHALTEN
Phase 2: 10x komplette Match-Listen laden (30 Queries) → OPTIMIEREN
Phase 2: 5x Stats/Leaderboards laden (5 Queries)    → ENTFERNT (toter Code)
```

Die Stats/Leaderboard-Loads wurden bereits entfernt (wurden nirgends gelesen).

## Ziel-Zustand

```
Phase 1: Profile laden (1 Query)
Phase 2: Nur offene Matches prüfen (1 Query)
Lazy:    Match-Daten erst laden wenn gebraucht
```

## Umsetzungsplan

### Schritt 1: Leichtgewichtige Open-Match-Prüfung

Neuer DB-Query der für alle 10 Spielmodi in einem Call prüft ob ein offenes Match existiert:

```sql
SELECT 'x01' as game_type, id, title FROM x01_matches WHERE finished = 0 ORDER BY created_at DESC LIMIT 1
UNION ALL
SELECT 'cricket', id, title FROM cricket_matches WHERE finished = 0 ORDER BY created_at DESC LIMIT 1
UNION ALL
-- ... für alle 10 Modi
```

Ein einziger Query statt 30. Ergebnis: `{x01: {id, title} | null, cricket: ...}`.

### Schritt 2: Match-Daten lazy laden

Wenn der User auf "Spiel fortsetzen" klickt → dann erst das komplette Match mit Events laden.
Wenn der User auf "Matchhistorie" geht → dann erst die Match-Listen laden.
Wenn der User ein neues Spiel startet → keine historischen Matches nötig.

### Schritt 3: Cache-Architektur anpassen

Die In-Memory-Caches (`x01MatchesCache`, `cricketMatchesCache`, etc.) in `storage.ts` müssen lazy befüllt werden statt eager beim Start. Getter-Funktionen wie `getMatches()` müssen entweder:
- Synchron aus Cache lesen (wenn bereits geladen)
- Async aus DB laden (beim ersten Zugriff)

Das erfordert eine Umstellung der Getter von sync auf async an allen Aufrufstellen.

### Betroffene Dateien

- `src/db/init.ts` — Phase 2 durch Open-Match-Check ersetzen
- `src/storage.ts` — Cache-Getter lazy machen
- `src/App.tsx` — "Spiel fortsetzen" async laden
- `src/screens/MatchHistory.tsx` — Match-Daten on-demand laden
- Alle `src/screens/Game*.tsx` — Match-Daten beim Öffnen laden

### Risiken

- Viele Stellen im Code rufen `getMatches()` synchron auf
- Game-Screens erwarten Match-Daten sofort verfügbar
- "Spiel fortsetzen" muss ggf. kurz "Laden..." zeigen

### Aufwand

Mittel-groß. Die sync-zu-async-Umstellung der Getter betrifft viele Dateien. Aber der Gewinn ist erheblich: App-Start reduziert von ~35 DB-Calls auf 2.
