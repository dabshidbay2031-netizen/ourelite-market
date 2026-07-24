'use client';

import { useEffect, useRef } from 'react';
import { useApp } from '@/context/AppContext';
import { flushQueue, onQueueChange, queueCount } from '@/lib/offlineQueue';

/**
 * App-wide offline-sale sync. Sales rung up on the POS while offline are held
 * in lib/offlineQueue; this uploads them the moment a connection is available —
 * on app load, whenever the browser fires 'online', and whenever the queue
 * grows — no matter which page the user is on (the old logic only ran while
 * the POS screen was mounted).
 *
 * After a batch uploads, the catalog is reloaded so stock/sold reflect the
 * synced sales, and a toast confirms it.
 */
export default function SyncManager() {
  const { reloadProducts, toast } = useApp();
  const busy = useRef(false);

  useEffect(() => {
    const run = async () => {
      if (busy.current || queueCount() === 0) return;
      busy.current = true;
      try {
        const { synced } = await flushQueue();
        if (synced > 0) {
          toast(`Synced ${synced} offline sale${synced === 1 ? '' : 's'} ✓`, 'success');
          try { await reloadProducts(); } catch { /* best-effort */ }
        }
      } finally {
        busy.current = false;
      }
    };

    run();                                   // on load — sync anything left from last session
    window.addEventListener('online', run);  // the moment we reconnect
    const off = onQueueChange(run);          // a new sale was queued while (maybe) online
    return () => { window.removeEventListener('online', run); off(); };
  }, [reloadProducts, toast]);

  return null;
}
