# Trends-Tab UX & Performance + Speicher-Feedback

## Aufgabe 1: Trends-Tabs zusammenfassen (Dashboard + Top Trends → Übersicht)

**Problem:** Beim Öffnen des Trends-Tabs sieht man erst ein kurzes Dashboard, dann muss man zum Tab "Top Trends" wechseln. Das fühlt sich unvollständig an.

**Lösung:** 
- Tab 1 ("Dashboard") und Tab 2 ("Top Trends") zu einem Tab **"Übersicht"** zusammenfassen
- Dashboard-Infos oben als kompakte Zusammenfassung
- Darunter direkt die Trend-Charts
- Weniger Tab-Wechsel, befriedigenderes Erlebnis beim Öffnen

**Dateien:** `src/screens/stats/` — Trends-Komponenten identifizieren und zusammenführen

---

## Aufgabe 2: Ladebalken statt Spinner

**Problem:** Aktuell zeigt die App einen drehenden Kreis beim Laden. Das gibt kein Gefühl von Fortschritt.

**Lösung:**
- **Trends-Tab**: Ladebalken während die ~6 Live-Queries laufen (animiert, muss nicht exakt die echten Daten widerspiegeln)
- **Spielende/Speichern**: Ladebalken statt Spinner nach Match-Ende, der zeigt "Spiel wird gespeichert..."
- Der Balken kann zeitbasiert animiert werden (z.B. 0-80% schnell, 80-100% langsam bis fertig)

**Wichtig:** Der Ladebalken beim Speichern verhindert, dass User den Browser zu früh schließen weil sie denken es ist fertig.

**Dateien:** 
- Neue Komponente: `src/components/ProgressBar.tsx` (wiederverwendbar)
- `src/screens/stats/` — Trends-Laden
- Game-Screens (Summary/Ende) — Speicher-Feedback

---

## Aufgabe 3: Trends perspektivisch cachen

**Status:** Niedrige Priorität — aktuell OK mit ~6 Live-Queries

**Idee:** Trends-Daten nach Spielende berechnen und in `player_stats_cache` als eigene Gruppe `'trends'` speichern. Gleicher Mechanismus wie die anderen Stats-Gruppen.

**Wichtig:** Das Cache-Update nach Spielende muss asynchron (fire-and-forget) bleiben — darf den Spielfluss nicht blockieren.

**Prüfen:** Ist `queueStatsRefresh` aktuell wirklich non-blocking? Kein `await` vor der Navigation zum Summary-Screen?

---

## Aufgabe 4: Sicherstellen — asynchrones Stats-Update nach Spielende

**Problem:** Nach Spielbeendigung darf das Statistik-Update NICHT blockieren. Der User soll sofort den Summary-Screen sehen.

**Prüfen:**
- Alle `finishXxxMatch()` Funktionen: Wird `queueStatsRefresh` mit `.catch(() => {})` aufgerufen (fire-and-forget)?
- Wird irgendwo `await queueStatsRefresh(...)` verwendet? → Muss entfernt werden
- Der Summary-Screen muss sofort erscheinen, Stats werden im Hintergrund aktualisiert

**Dateien:** `src/storage.ts` — alle 10 `finishXxxMatch()` Funktionen prüfen

---

## Aufgabe 5: Nicht beendete Spiele aus Statistiken ausschließen

**Status:** Prüfen ob das bereits korrekt implementiert ist.

**Erwartung:** Alle Stats-Queries filtern mit `WHERE m.finished = 1` — unbeendete Spiele (`finished = 0`) dürfen NICHT in die Statistiken einfließen.

**Prüfen:** Stichproben in `src/db/stats/x01.ts`, `general.ts`, `highscores.ts` — haben alle relevanten Queries den `finished = 1` Filter?

---

## Reihenfolge

1. **Aufgabe 4** (schnell) — Prüfen ob Stats-Update async ist
2. **Aufgabe 5** (schnell) — Prüfen ob unbeendete Spiele ausgeschlossen sind
3. **Aufgabe 1** (mittel) — Trends-Tabs zusammenfassen
4. **Aufgabe 2** (mittel) — Ladebalken-Komponente + Integration
5. **Aufgabe 3** (später) — Trends cachen
