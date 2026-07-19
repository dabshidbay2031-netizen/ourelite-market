'use client';

import { useEffect } from 'react';
import { getSupabase } from '@/lib/supabase';

/**
 * Installs a one-time global fetch interceptor that attaches the current
 * Supabase JWT (`Authorization: Bearer …`) to every same-origin `/api/*`
 * request that doesn't already carry one. This lets the server-side route
 * guards (lib/apiAuth) authenticate the caller without every call site
 * having to set the header by hand. Cross-origin requests (Supabase,
 * Unsplash, OSRM…) are passed straight through untouched.
 *
 * The access token is CACHED from `onAuthStateChange` and read synchronously.
 * We must never call `getSession()` inside the interceptor: on a slow/flaky
 * connection that can trigger a blocking network token-refresh that times out
 * ("signal timed out") or fails ("Failed to fetch") and stalls the /api call.
 * Reading a cached token keeps the request path network-free.
 */
export default function ApiAuthInstaller() {
  useEffect(() => {
    const w = window as unknown as { __apiAuthPatched?: boolean };
    if (w.__apiAuthPatched) return;
    w.__apiAuthPatched = true;

    // Kept up to date by auth events (INITIAL_SESSION, SIGNED_IN,
    // TOKEN_REFRESHED, SIGNED_OUT…). No network happens in the fetch path.
    let currentToken: string | null = null;
    let unsub: (() => void) | null = null;
    try {
      const { data } = getSupabase().auth.onAuthStateChange((_event, session) => {
        currentToken = session?.access_token ?? null;
      });
      unsub = () => data.subscription.unsubscribe();
    } catch {
      // Supabase not configured — leave fetch untouched below (token stays null).
    }

    const orig = window.fetch.bind(window);

    function isApi(input: RequestInfo | URL): boolean {
      try {
        const url = typeof input === 'string' ? input
          : input instanceof URL ? input.href
          : (input as Request).url;
        const u = new URL(url, window.location.origin);
        return u.origin === window.location.origin && u.pathname.startsWith('/api/');
      } catch { return false; }
    }

    function hasAuth(init?: RequestInit, input?: RequestInfo | URL): boolean {
      const h = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
      return h.has('authorization');
    }

    // Synchronous: no await, no getSession, no network — just attach the
    // cached token when we have one.
    window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
      if (!currentToken || !isApi(input) || hasAuth(init, input)) return orig(input, init);
      const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
      headers.set('Authorization', `Bearer ${currentToken}`);
      if (input instanceof Request && !init) return orig(new Request(input, { headers }));
      return orig(input, { ...init, headers });
    };

    return () => {
      window.fetch = orig;
      w.__apiAuthPatched = false;
      try { unsub?.(); } catch { /* ignore */ }
    };
  }, []);

  return null;
}
