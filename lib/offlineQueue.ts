'use client';

import { authHeaders } from '@/lib/clientAuth';

const KEY = 'mg_offline_queue';

export interface QueuedOrder {
  localId:  string;
  payload:  Record<string, unknown>;
  queuedAt: string;
}

export function enqueueOrder(payload: Record<string, unknown>): string {
  const localId = `LOCAL-${Date.now().toString(36).toUpperCase()}`;
  const queue = getQueue();
  queue.push({ localId, payload, queuedAt: new Date().toISOString() });
  try { localStorage.setItem(KEY, JSON.stringify(queue)); } catch { /* storage full */ }
  notify();
  return localId;
}

export function getQueue(): QueuedOrder[] {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '[]'); } catch { return []; }
}

export function dequeueOrder(localId: string) {
  const next = getQueue().filter(q => q.localId !== localId);
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* ignore */ }
  notify();
}

export function queueCount(): number {
  return getQueue().length;
}

/* ── Change notifications (so UI badges update without polling) ── */
type Listener = () => void;
const listeners = new Set<Listener>();
export function onQueueChange(fn: Listener): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
function notify() { listeners.forEach(fn => { try { fn(); } catch { /* ignore */ } }); }

let flushing = false;

/**
 * Upload every queued offline sale to the server, oldest first. Safe to call
 * repeatedly (guards against concurrent runs); stops at the first network
 * failure so the rest stay queued for the next attempt. Returns how many synced.
 *
 * Each POST carries auth headers (staff X-Cashier-Token / owner JWT), so a
 * sale queued by a cashier is attributed correctly when it finally lands.
 */
export async function flushQueue(): Promise<{ synced: number; remaining: number }> {
  if (flushing) return { synced: 0, remaining: queueCount() };
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { synced: 0, remaining: queueCount() };
  }
  flushing = true;
  let synced = 0;
  try {
    for (const item of getQueue()) {
      let res: Response;
      try {
        res = await fetch('/api/orders', {
          method: 'POST',
          headers: await authHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify(item.payload),
        });
      } catch {
        break; // still offline — leave this and the rest queued
      }
      if (res.ok) { dequeueOrder(item.localId); synced++; }
      else if (res.status >= 400 && res.status < 500 && res.status !== 429) {
        // A permanent client error (e.g. a product was deleted) would loop
        // forever — drop it so it can't block the rest of the queue.
        dequeueOrder(item.localId);
      } else {
        break; // server/transient error — retry later
      }
    }
  } finally {
    flushing = false;
  }
  return { synced, remaining: queueCount() };
}
