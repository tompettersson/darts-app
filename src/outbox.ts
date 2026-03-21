// src/outbox.ts
// Offline-Outbox: SQLite only

import { ensureDB, dbQueueMatch, dbReadOutbox, dbRemoveFromOutbox } from './db/storage'

export type MatchPayload = {
  id: string;
  createdAt: string;
  title?: string;
  players: { id: string; name: string }[];
  events: any[];              // DartsEvent[]
  statsByPlayer: Record<string, any>;
};

// Job zur Outbox hinzufügen (idempotent nach match.id)
export function queueMatch(payload: MatchPayload) {
  // SQLite async (fire-and-forget)
  dbQueueMatch(payload).catch(e =>
    console.warn('[Outbox] SQLite queue failed:', e)
  )
}

// Alle Jobs versuchen zu senden (mit optionalem Backoff)
export async function flushOutbox(submit: (p: MatchPayload) => Promise<any>) {
  try {
    const useSQLite = await ensureDB()
    if (!useSQLite) return

    const items = await dbReadOutbox()
    if (items.length === 0) return

    for (const p of items) {
      try {
        await submit(p);
        console.debug('[Outbox] delivered', p.id);
        await dbRemoveFromOutbox(p.id)
      } catch (err) {
        console.warn('[Outbox] still failing', p.id, err);
      }
    }
  } catch (e) {
    console.warn('[Outbox] flush failed:', e)
  }
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
      }
    } catch { /* ignore */ }

    if (stillPending) {
      scheduleFlushWithBackoff(submit, attempt + 1);
    }
  }, delay);
}
