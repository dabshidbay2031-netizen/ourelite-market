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
  return localId;
}

export function getQueue(): QueuedOrder[] {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '[]'); } catch { return []; }
}

export function dequeueOrder(localId: string) {
  const next = getQueue().filter(q => q.localId !== localId);
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* storage full */ }
}

export function queueCount(): number {
  return getQueue().length;
}
