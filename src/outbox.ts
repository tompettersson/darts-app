// src/outbox.ts
// Offline-Outbox: SQLite (primary) + LocalStorage (fallback)

import { ensureDB, dbQueueMatch, dbReadOutbox, dbRemoveFromOutbox } from './db/storage'

const OUTBOX_KEY = 'darts.outbox.v1';

export type MatchPayload = {
  id: string;
  createdAt: string;
  title?: string;
  players: { id: string; name: string }[];
  events: any[];              // DartsEvent[]
  statsByPlayer: Record<string, any>;
};

// LS Fallback helpers
function readBoxLS(): MatchPayload[] {
  try {
    const raw = localStorage.getItem(OUTBOX_KEY);
    return raw ? (JSON.parse(raw) as MatchPayload[]) : [];
  } catch {
    return [];
  }
}

function writeBoxLS(list: MatchPayload[]) {
  localStorage.setItem(OUTBOX_KEY, JSON.stringify(list));
}

// Job zur Outbox hinzufügen (idempotent nach match.id)
export function queueMatch(payload: MatchPayload) {
  // LS als synchroner Fallback
  const list = readBoxLS();
  const exists = list.some((p) => p.id === payload.id);
  if (!exists) {
    list.push(payload);
    writeBoxLS(list);
    console.debug('[Outbox] queued (LS)', payload.id);
  }

  // SQLite async (fire-and-forget)
  dbQueueMatch(payload).catch(e =>
    console.warn('[Outbox] SQLite queue failed:', e)
  )
}

// Alle Jobs versuchen zu senden (mit optionalem Backoff)
export async function flushOutbox(submit: (p: MatchPayload) => Promise<any>) {
  let items: MatchPayload[]

  // Try SQLite first
  try {
    const useSQLite = await ensureDB()
    if (useSQLite) {
      items = await dbReadOutbox()
      if (items.length > 0) {
        const remaining: MatchPayload[] = []
        for (const p of items) {
          try {
            await submit(p);
            console.debug('[Outbox] delivered', p.id);
            await dbRemoveFromOutbox(p.id)
          } catch (err) {
            console.warn('[Outbox] still failing', p.id, err);
            remaining.push(p);
          }
        }
        // Sync LS
        writeBoxLS(remaining)
        return
      }
    }
  } catch (e) {
    console.warn('[Outbox] SQLite read failed, falling back to LS:', e)
  }

  // LS fallback
  items = readBoxLS();
  if (items.length === 0) return;

  const remaining: MatchPayload[] = [];
  for (const p of items) {
    try {
      await submit(p);
      console.debug('[Outbox] delivered', p.id);
      // Also remove from SQLite
      dbRemoveFromOutbox(p.id).catch(() => {})
    } catch (err) {
      console.warn('[Outbox] still failing', p.id, err);
      remaining.push(p);
    }
  }
  writeBoxLS(remaining);
}

// Komfort: Flush mit einfachem Retry/Backoff (z. B. beim App-Start)
let retryTimer: number | undefined;

export function scheduleFlushWithBackoff(
  submit: (p: MatchPayload) => Promise<any>,
  attempt = 1
) {
  const delay = Math.min(30000, 1000 * Math.pow(2, attempt)); // 1s, 2s, 4s, … max 30s
  if (retryTimer) window.clearTimeout(retryTimer);

  retryTimer = window.setTimeout(async () => {
    await flushOutbox(submit);

    // Check if still pending
    let stillPending = false
    try {
      const useSQLite = await ensureDB()
      if (useSQLite) {
        const items = await dbReadOutbox()
        stillPending = items.length > 0
      } else {
        stillPending = readBoxLS().length > 0
      }
    } catch {
      stillPending = readBoxLS().length > 0
    }

    if (stillPending) {
      scheduleFlushWithBackoff(submit, attempt + 1);
    }
  }, delay);
}
