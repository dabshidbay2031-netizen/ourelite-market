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
 */
export default function ApiAuthInstaller() {
  useEffect(() => {
    const w = window as unknown as { __apiAuthPatched?: boolean };
    if (w.__apiAuthPatched) return;
    w.__apiAuthPatched = true;

    const orig = window.fetch.bind(window);

    function isApi(input: RequestInfo | URL): boolean {
      try {
        const url = typeof input === 'string' ? input
          : input instanceof URL ? input.href
          : (input as Request).url;
        // same-origin /api/ only
        const u = new URL(url, window.location.origin);
        return u.origin === window.location.origin && u.pathname.startsWith('/api/');
      } catch { return false; }
    }

    function hasAuth(init?: RequestInit, input?: RequestInfo | URL): boolean {
      const h = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
      return h.has('authorization');
    }

    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      if (!isApi(input) || hasAuth(init, input)) return orig(input, init);
      try {
        const { data } = await getSupabase().auth.getSession();
        const token = data.session?.access_token;
        if (token) {
          const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
          headers.set('Authorization', `Bearer ${token}`);
          // If input is a Request, fold our header set into a fresh init.
          if (input instanceof Request && !init) {
            return orig(new Request(input, { headers }));
          }
          return orig(input, { ...init, headers });
        }
      } catch { /* not signed in — send unauthenticated */ }
      return orig(input, init);
    };

    return () => { window.fetch = orig; w.__apiAuthPatched = false; };
  }, []);

  return null;
}
