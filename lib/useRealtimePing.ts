'use client';

import { useEffect, useRef } from 'react';
import { getSupabase } from '@/lib/supabase';

/**
 * Subscribe to server-sent realtime pings (see lib/realtimeServer.ts) and run
 * `onPing` the moment one arrives — this is what makes screens update
 * instantly instead of waiting for the next poll.
 *
 * `topics` may contain null/undefined entries (e.g. a store id that isn't
 * known yet) — those are skipped until they resolve. The interval polling in
 * useLiveRefresh stays as the fallback for when the websocket is down.
 */
export function useRealtimePing(
  topics: Array<string | null | undefined>,
  onPing: () => void | Promise<void>,
): void {
  const fnRef = useRef(onPing);
  fnRef.current = onPing;

  // Stable dependency: resubscribe only when the actual topic set changes.
  const key = topics.filter(Boolean).join('|');

  useEffect(() => {
    if (!key) return;
    const sb = getSupabase();

    const channels = key.split('|').map(topic =>
      sb.channel(topic, { config: { broadcast: { self: false } } })
        .on('broadcast', { event: 'ping' }, () => { fnRef.current(); })
        .subscribe(),
    );

    return () => { channels.forEach(ch => { try { sb.removeChannel(ch); } catch { /* noop */ } }); };
  }, [key]);
}
