# E2E-Testplan — Performance & Active Games

Testplan für alle Änderungen der letzten Session (Stats Materialization, Startup-Optimierung, Active Games, Service Worker).

## Bekannte Bugs (vor dem Test zu fixen)

### BUG-1: Spiel fortsetzen funktioniert nicht (alle Modi außer X01)
- **Symptom:** Offene Spiele erscheinen in der Auswahl, Klick führt zu leerem Screen
- **Ursache:** `resumeGame()` in App.tsx lädt nur für X01 die Match-Daten aus der DB. Für Cricket, ATB und alle anderen Modi wird direkt zum Game-Screen navigiert ohne den In-Memory-Cache zu befüllen.
- **Fix:** Alle 9 Modi im `resumeGame()` Switch müssen das X01-Pattern übernehmen: DB-Fetch → Cache wärmen → navigieren

---

## Testbereich 1: App-Startup

### T1.1 — Minimale DB-Calls beim Start
- [ ] App öffnen (frischer Browser oder nach SW-Entfernung)
- [ ] DevTools → Netzwerk → Filter "db"
- [ ] **Erwartung:** Max 4-5 `db` Calls (Health + Profiles+ActiveGames Batch + Migration-Check + ggf. OPFS-Check)
- [ ] **Keine** Match-Daten-Requests (keine `x01_matches`, `cricket_matches` etc.)

### T1.2 — Spielerprofile werden angezeigt
- [ ] Login-Screen zeigt alle Spieler (David, Leo, Nora, Susanka, Test1, Test2, Thomas, Tim)
- [ ] Kein Lade-Spinner der hängen bleibt

### T1.3 — "Spiel fortsetzen" zeigt offene Spiele
- [ ] Hauptmenü: "Spiel fortsetzen" Button zeigt Anzahl offener Spiele ODER einzelnen Spieltitel
- [ ] Wenn mehrere offen: Klick führt zum OpenGames Auswahl-Screen
- [ ] Wenn genau eins offen: Klick führt direkt zum Spiel

### T1.4 — Service Worker Update
- [ ] Nach neuem Deployment: Seite neu laden → neuer Code aktiv (ohne manuelles SW-Entfernen)
- [ ] Prüfen: Console zeigt neuen Bundle-Hash

---

## Testbereich 2: Spiel fortsetzen (Active Games)

### T2.1 — X01 fortsetzen
- [ ] Offenes X01-Spiel vorhanden
- [ ] Klick auf "Spiel fortsetzen" → Spiel lädt korrekt
- [ ] Spielstand ist vollständig (Punkte, Legs, Events)
- [ ] Console: 0 Errors

### T2.2 — Cricket fortsetzen
- [ ] Offenes Cricket-Spiel vorhanden
- [ ] Klick → Spiel lädt korrekt mit allen Marks/Scores
- [ ] Console: 0 Errors

### T2.3 — ATB fortsetzen
- [ ] Offenes ATB-Spiel vorhanden
- [ ] Klick → Spiel lädt korrekt
- [ ] Console: 0 Errors

### T2.4 — Sträußchen fortsetzen
- [ ] Test wie T2.3 für Sträußchen

### T2.5 — CTF fortsetzen
- [ ] Test wie T2.3 für CTF

### T2.6 — Shanghai fortsetzen
- [ ] Test wie T2.3 für Shanghai

### T2.7 — Killer fortsetzen
- [ ] Test wie T2.3 für Killer

### T2.8 — Bob's 27 fortsetzen
- [ ] Test wie T2.3 für Bob's 27

### T2.9 — Operation fortsetzen
- [ ] Test wie T2.3 für Operation

### T2.10 — Highscore fortsetzen
- [ ] Test wie T2.3 für Highscore

### T2.11 — Spiel verwerfen
- [ ] Im OpenGames Screen: "×" Button bei einem Spiel klicken
- [ ] Bestätigen → Spiel verschwindet aus der Liste
- [ ] Prüfen: `active_games` Tabelle hat den Eintrag nicht mehr

### T2.12 — Neues Spiel → active_games Eintrag
- [ ] Neues X01-Spiel starten
- [ ] Prüfen: Eintrag in `active_games` vorhanden (mit Titel, Spielern, Config)
- [ ] Spiel beenden
- [ ] Prüfen: Eintrag aus `active_games` gelöscht

### T2.13 — Neues Cricket-Spiel → active_games Eintrag
- [ ] Wie T2.12 für Cricket

---

## Testbereich 3: Statistiken

### T3.1 — Stats-Cache wird gelesen (nicht live berechnet)
- [ ] Spieler-Stats öffnen (z.B. David)
- [ ] DevTools Netzwerk: Filter "db"
- [ ] **Erwartung:** 1-2 `player_stats_cache` Reads (Batch), KEINE 80+ Event-Queries
- [ ] Stats werden korrekt angezeigt (Übersicht-Tab)

### T3.2 — Tab-Wechsel ist instant
- [ ] Von Übersicht → X01 → Cricket & Co → Spielerprofil → Analyse → Erfolge wechseln
- [ ] Jeder Tab lädt ohne merkliche Verzögerung (aus Cache)
- [ ] Keine neuen DB-Calls bei Tab-Wechsel (Prefetch hat alle Gruppen geladen)

### T3.3 — X01 301-Tab zeigt Daten (alter Bug)
- [ ] David → X01 Tab → 301 Sub-Tab
- [ ] **Erwartung:** Volle Stats (Matches, Scoring, Checkouts, Legs) — NICHT "Noch keine 301-Spiele"
- [ ] 501 Sub-Tab: ebenfalls Daten

### T3.4 — X01 Gesamt-Tab zeigt Daten
- [ ] David → X01 Tab → 501 (Standard)
- [ ] Allgemeine Matchdaten, Scoring, Averages, Checkouts, Highscores, Legs — alle Sections gefüllt

### T3.5 — Stats-Cache wird nach Spielende aktualisiert
- [ ] Stats für David aufrufen → merken: Anzahl Matches
- [ ] Ein X01-Spiel mit David spielen und beenden
- [ ] Stats erneut aufrufen
- [ ] **Erwartung:** Matches-Zähler ist um 1 gestiegen
- [ ] Console: kein Error bei `queueStatsRefresh`

### T3.6 — Erster Stats-Aufruf für neuen Spieler
- [ ] Stats für einen Spieler ohne Cache öffnen (z.B. Thomas, falls Cache leer)
- [ ] **Erwartung:** Zeigt "Lade Statistiken..." dann Daten — kein Crash
- [ ] Zweiter Aufruf: deutlich schneller (Cache befüllt)

### T3.7 — Kein "Etwas ist schiefgelaufen" Crash
- [ ] Stats für beliebigen Spieler öffnen
- [ ] **Erwartung:** Kein ErrorBoundary-Crash, keine rote Fehlermeldung
- [ ] Wiederhole 3x (Race Conditions sind timing-abhängig)

---

## Testbereich 4: Highscores

### T4.1 — Highscores laden aus Cache
- [ ] Statistiken → Highscores öffnen
- [ ] DevTools: Filter "db" → **1 Cache-Read** (`_global/highscores`), NICHT 31 Queries
- [ ] Alle Kategorien angezeigt (Allgemein, X01, Cricket, ATB, Bob's 27, Operation)
- [ ] Tab-Wechsel zwischen Kategorien: instant

### T4.2 — Highscores nach Spielende aktualisiert
- [ ] Highscores aufrufen → merken: "Meiste Siege" Wert für David
- [ ] X01-Spiel mit David gewinnen
- [ ] Highscores erneut aufrufen
- [ ] **Erwartung:** Wert aktualisiert (Cache wurde invalidiert + neu befüllt)

---

## Testbereich 5: Matchhistorie

### T5.1 — Alle Spielmodi in Matchhistorie
- [ ] Statistiken → Matchhistorie
- [ ] **Erwartung:** Matches aus ALLEN Modi sichtbar (X01, Cricket, ATB, etc.)
- [ ] NICHT nur X01

### T5.2 — Filter funktioniert
- [ ] Tab-Filter: "X01" → nur X01 Matches
- [ ] Tab-Filter: "Cricket" → nur Cricket Matches
- [ ] Tab-Filter: "Alle" → gemischt

### T5.3 — Pagination funktioniert
- [ ] "Mehr laden" Button am Ende der Liste
- [ ] Klick → weitere Matches erscheinen

---

## Testbereich 6: Spielablauf (Regression)

### T6.1 — X01-Spiel komplett durchspielen
- [ ] Neues X01-Spiel (301, 2 Spieler, Best of 3)
- [ ] Spiel durchspielen bis zum Ende
- [ ] Summary-Screen erscheint korrekt
- [ ] active_games Eintrag wird gelöscht
- [ ] Stats-Cache wird im Hintergrund aktualisiert

### T6.2 — Cricket-Spiel komplett durchspielen
- [ ] Neues Cricket-Spiel (Standard, 2 Spieler)
- [ ] Spiel durchspielen bis zum Ende
- [ ] Summary-Screen korrekt
- [ ] active_games gelöscht

### T6.3 — Bob's 27 durchspielen
- [ ] Neues Bob's 27 Spiel
- [ ] Durchspielen
- [ ] Summary + active_games Check

### T6.4 — Spiel unterbrechen und fortsetzen
- [ ] Neues X01 starten → einige Würfe machen → App schließen (Tab zu)
- [ ] App neu öffnen → "Spiel fortsetzen"
- [ ] **Erwartung:** Spielstand ist erhalten, Spiel geht weiter

---

## Testbereich 7: Edge Cases

### T7.1 — Kein offenes Spiel
- [ ] Alle offenen Spiele beenden oder verwerfen
- [ ] "Spiel fortsetzen" zeigt "Kein laufendes Spiel"
- [ ] Klick auf Button: nichts passiert (kein Crash)

### T7.2 — Mehrere offene Spiele verschiedener Modi
- [ ] X01 starten → unterbrechen
- [ ] Cricket starten → unterbrechen
- [ ] "Spiel fortsetzen" → OpenGames Screen mit 2 Karten
- [ ] Beide einzeln auswählen → jeweils korrekt laden

### T7.3 — Spieler wechseln
- [ ] Als David einloggen → Stats aufrufen
- [ ] Ausloggen → als Tim einloggen
- [ ] Stats aufrufen → Tims Daten (nicht Davids Cache)

### T7.4 — Offline-Verhalten
- [ ] App öffnen → Netzwerk trennen (DevTools: Offline)
- [ ] **Erwartung:** App-Shell lädt (PWA Cache), aber "Verbindungsfehler" bei Daten
- [ ] Netzwerk wieder an → Seite neu laden → funktioniert

---

## Durchführung

Für jeden Test:
1. Status notieren: PASS / FAIL / SKIP
2. Bei FAIL: Screenshot + Console-Errors dokumentieren
3. Nach allen Tests: Fehler-Liste erstellen und priorisieren
