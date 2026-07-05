'use client';

import { useEffect, useRef } from 'react';

interface Options {
  /** Poll cadence in ms while the tab is visible. Default 12s. */
  intervalMs?: number;
  /** Turn the whole thing off (e.g. until an id is known). Default true. */
  enabled?: boolean;
}

/**
 * Keep a screen live without a manual refresh.
 *
 * Calls `fn` again:
 *   • on a steady interval, but ONLY while the tab is visible (no background
 *     polling — saves battery/requests),
 *   • the moment the tab regains focus or becomes visible again (so switching
 *     back to the app shows fresh data instantly).
 *
 * It does NOT fire on mount — views already do their initial fetch — so it
 * layers cleanly on top of existing load logic. We poll the app's own scoped
 * API endpoints rather than subscribing the browser straight to Postgres, so
 * each store keeps seeing only its own data (the anon key can't be trusted
 * with a firehose of every tenant's rows).
 */
export function useLiveRefresh(fn: () => void | Promise<void>, opts: Options = {}) {
  const { intervalMs = 12000, enabled = true } = opts;
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    if (!enabled) return;
    const run = () => { if (!document.hidden) fnRef.current(); };

    let timer: ReturnType<typeof setInterval> | null = setInterval(run, intervalMs);
    const onFocus = () => fnRef.current();
    const onVisible = () => { if (!document.hidden) fnRef.current(); };

    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      if (timer) clearInterval(timer);
      timer = null;
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [intervalMs, enabled]);
}
