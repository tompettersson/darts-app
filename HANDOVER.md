# Darts App — Uebergabedokument DB-Refactor

**Datum:** 30. Maerz 2026
**Branch:** main (bereits gemergt)
**Durchgefuehrt von:** Thomas / Claude Code

---

## Was wurde gemacht

### Kurzfassung
Der gesamte Datenbank-Layer wurde ueberarbeitet. Die App spricht jetzt natives PostgreSQL statt SQLite-Dialekt. Der Regex-Konverter der zur Laufzeit 27 Substitutionen pro Query machte ist komplett entfernt. Die App ist funktional identisch, der Code deutlich sauberer.

### Aenderungen im Detail

**1. SQL-Queries auf natives Postgres umgeschrieben (287 Queries)**
- json_extract() zu ::jsonb->>'key'
- strftime() zu to_char() / EXTRACT()
- INSERT OR REPLACE zu INSERT ... ON CONFLICT DO UPDATE
- IFNULL() zu COALESCE()
- GROUP_CONCAT() zu string_agg()
- Betroffene Dateien: src/db/storage.ts, alle src/db/stats/*.ts

**2. SQLite-zu-Postgres Regex-Konverter entfernt**
- api/db.js: von 440 auf 146 Zeilen (convertSQL() komplett weg)
- vite.config.ts: Dev-Proxy ebenfalls bereinigt
- Nur noch Placeholder-Konvertierung (? zu $1, $2, ...) bleibt

**3. LocalStorage-Cache entfernt**
- src/db/dataCache.ts geloescht
- src/db/init.ts vereinfacht — kein Cache-Check mehr beim Start
- App laedt immer frisch aus der DB

**4. Startup-Performance optimiert**
- Vorher: 16 parallele DB-Calls (~13.000 Events) blockierend vor Login-Screen
- Jetzt: Nur Profile laden (1 Query), Rest im Hintergrund nach 100ms
- OPFS-Migration und Passwort-Migration ebenfalls in Background verschoben

**5. Bug-Fixes**
- Echte Transaktionen: BEGIN/COMMIT/ROLLBACK in api/db.js und Dev-Proxy
- Cricket Multiplayer: Events werden nur noch bei Match-Ende in DB geschrieben (nicht bei jedem Wurf)
- Multiplayer: Nur Host schreibt bei Match-Ende in DB (keine doppelten Stats)
- strftime %w Off-by-one behoben (Wochentag-Stats waren um 1 verschoben)
- Live-Preview wird bei Undo zurueckgesetzt
- Diverse Postgres Type-Cast-Fixes (ROUND::numeric, bust als boolean-text)

**6. Neue Infrastruktur (vorbereitet, noch nicht aktiv genutzt)**
- Drizzle ORM Schema fuer alle 43 Tabellen: src/db/drizzle-schema.ts
- Drizzle Client: src/db/drizzle.ts
- Generic Game Repository: src/db/repositories/ (1 Implementation statt 10 Kopien)
- Drizzle RPC-Endpoint in api/db.js (Typ 'repo')
- repoCall() Funktion in src/db/index.ts
- TanStack Query installiert, QueryClientProvider in main.tsx
- Programmatische E2E-Tests: scripts/e2e-game-tests.mjs (15 Tests)

---

## Bekannte offene Punkte

### Stats laden langsam
Die Spieler-Statistiken laden merklich langsam (~3-5 Sekunden). Grund: Der LocalStorage-Cache wurde entfernt, und die 40+ Stats-Queries scannen bei jedem Aufruf die komplette Events-Tabelle mit JSON-Extraktion. Loesung folgt naechste Woche: TanStack Query als Memory-Cache-Layer um den bestehenden useSQLStats Hook wrappen (5 Minuten Stale-Time).

### Drizzle Repository noch nicht aktiv
Die Repositories existieren und funktionieren, aber das Frontend nutzt weiterhin den raw-SQL-Pfad ueber query()/exec(). Die schrittweise Migration auf die Repositories kann bei Bedarf fortgesetzt werden.

### Materialisierte Stats
Die x01_player_stats und cricket_player_stats Tabellen werden bereits inkrementell nach jedem Match aktualisiert. Zukuenftig koennten die Stats-Seiten diese vorberechneten Werte nutzen statt alles aus Events zu berechnen. Ein TODO-Kommentar ist in src/db/stats/general.ts.

---

## Fuer den Entwickler: Git Pull und Weiterarbeiten

Aktuellen Stand holen:

    git pull origin main

Dependencies aktualisieren (neue Packages: drizzle-orm, @tanstack/react-query, @neondatabase/serverless):

    npm install

Dev-Server starten:

    npm run dev

E2E-Tests laufen lassen (Dev-Server muss laufen):

    node scripts/e2e-game-tests.mjs

### Neue Dependencies
- drizzle-orm + @neondatabase/serverless — ORM + Serverless-Driver
- drizzle-kit (devDependency) — Schema-Tools
- @tanstack/react-query — Server-State-Caching (QueryClientProvider aktiv, aber noch nicht fuer Stats genutzt)

### Geaenderte Dateien (Kernaenderungen)

- api/db.js — Regex-Konverter entfernt, Transaktionen gefixt, Repo-Endpoint
- src/db/storage.ts — 76 Queries auf natives Postgres
- src/db/stats/*.ts — 211 Queries auf natives Postgres
- src/db/init.ts — Startup: nur Profile, Rest lazy
- src/screens/Game.tsx — Host-Only DB-Write bei Multiplayer
- src/screens/GameCricket.tsx — Cricket persist nur bei Match-Ende + Host-Only
- src/multiplayer/useMultiplayerRoom.ts — Undo cleart Live-Preview
- vite.config.ts — Dev-Proxy bereinigt, Transaktionen gefixt

### Neue Dateien

- src/db/drizzle-schema.ts — Drizzle Schema fuer alle 43 Tabellen
- src/db/drizzle.ts — Drizzle Client Factory
- src/db/repositories/*.ts — Generic Game + Profile Repository
- src/queryClient.ts — TanStack Query Client Config
- scripts/e2e-game-tests.mjs — 15 programmatische DB-Tests

### Geloeschte Dateien

- src/db/dataCache.ts — LocalStorage-Cache entfernt

---

## Neon DB

- Plan: Launch (Pay-as-you-go, vorher Free)
- Branch refactor-db-layer: Kann geloescht werden, war nur fuer Entwicklung
- Schema: Unveraendert — keine neuen Tabellen, keine Migrationen
- Die Production-DB wurde die ganze Zeit genutzt, auch vom Preview-Deployment

---

## Tests

### Programmatische Tests

    node scripts/e2e-game-tests.mjs
    # 15 Tests: Match CRUD, Events, Transaktionen, Upserts, jsonb, Edge Cases

### Manuelle Tests (durchgefuehrt)
- X01 301 Solo-Spiel: Match erstellt, Wuerfe, Finish — DB korrekt
- Cricket Solo-Spiel: Match erstellt, Finish — DB korrekt
- Stats-Seite: Spieler-Uebersicht zeigt korrekte Daten
- App-Startup: Login-Screen erscheint schnell, Matches laden im Hintergrund

### Noch zu testen
- Multiplayer (PartyKit): Host + Guest Spiel durchspielen, pruefen ob nur Host in DB schreibt
- Alle 10 Spielmodi mindestens einmal starten
- Stats: Alle 7 Tabs fuer verschiedene Spieler pruefen
