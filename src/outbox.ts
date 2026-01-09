// src/outbox.ts
// Simple Offline-Outbox im LocalStorage

const OUTBOX_KEY = 'darts.outbox.v1';

export type MatchPayload = {
  id: string;
  createdAt: string;
  title?: string;
  players: { id: string; name: string }[];
  events: any[];              // DartsEvent[]
  statsByPlayer: Record<string, any>;
};

// Aktuelle Outbox lesen
function readBox(): MatchPayload[] {
  try {
    const raw = localStorage.getItem(OUTBOX_KEY);
    return raw ? (JSON.parse(raw) as MatchPayload[]) : [];
  } catch {
    return [];
  }
}

// Outbox speichern
function writeBox(list: MatchPayload[]) {
  localStorage.setItem(OUTBOX_KEY, JSON.stringify(list));
}

// Job zur Outbox hinzufügen (idempotent nach match.id)
export function queueMatch(payload: MatchPayload) {
  const list = readBox();
  const exists = list.some((p) => p.id === payload.id);
  if (!exists) {
    list.push(payload);
    writeBox(list);
    console.log('[Outbox] queued', payload.id);
  } else {
    console.log('[Outbox] already queued, skip', payload.id);
  }
}

// Alle Jobs versuchen zu senden (mit optionalem Backoff)
export async function flushOutbox(submit: (p: MatchPayload) => Promise<any>) {
  const list = readBox();
  if (list.length === 0) return;

  const remaining: MatchPayload[] = [];
  for (const p of list) {
    try {
      await submit(p);
      console.log('[Outbox] delivered', p.id);
    } catch (err) {
      console.warn('[Outbox] still failing', p.id, err);
      remaining.push(p);
    }
  }
  writeBox(remaining);
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
    const stillPending = readBox().length > 0;
    if (stillPending) {
      scheduleFlushWithBackoff(submit, attempt + 1);
    }
  }, delay);
}
