'use client';

/**
 * CLIENT-SIDE VIEW ROUTER
 * ──────────────────────────────────────────────────────────────────
 * Replaces Next.js file-based routing for the main app pages.
 * Navigation is INSTANT — it's a React state change, no server round-
 * trip, no webpack compilation, no network request.
 *
 * How it works:
 *   1. The URL stays at "/" (or whatever the current path is).
 *   2. `viewPath` holds the logical "current page" (e.g. "/dashboard").
 *   3. Any component calls `navigate('/dashboard')` to switch views.
 *   4. The router syncs the browser URL via history.pushState so the
 *      back button, bookmarks, and refreshes still work.
 *   5. On mount it reads the URL path to restore the correct view.
 */

import React, {
  createContext, useContext, useCallback,
  useState, useEffect, useRef,
} from 'react';

interface ViewContextValue {
  viewPath:  string;
  navigate:  (path: string) => void;
  back:      () => void;
}

const ViewContext = createContext<ViewContextValue>({
  viewPath: '/',
  navigate: () => {},
  back:     () => {},
});

export function ViewProvider({ children }: { children: React.ReactNode }) {
  const [viewPath, setViewPath] = useState<string>('/');
  const history = useRef<string[]>(['/']);

  // Restore from the actual URL on first mount
  useEffect(() => {
    const initial = window.location.pathname || '/';
    setViewPath(initial);
    history.current = [initial];
  }, []);

  const navigate = useCallback((path: string) => {
    setViewPath(path);
    history.current.push(path);
    // Keep the browser URL in sync without a page reload
    window.history.pushState({}, '', path);
  }, []);

  const back = useCallback(() => {
    if (history.current.length > 1) {
      history.current.pop();
      const prev = history.current[history.current.length - 1];
      setViewPath(prev);
      window.history.pushState({}, '', prev);
    } else {
      navigate('/');
    }
  }, [navigate]);

  // Handle browser back/forward buttons
  useEffect(() => {
    const onPop = () => {
      const path = window.location.pathname || '/';
      setViewPath(path);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  return (
    <ViewContext.Provider value={{ viewPath, navigate, back }}>
      {children}
    </ViewContext.Provider>
  );
}

/** Use this instead of Next.js useRouter for instant navigation */
export function useView() {
  return useContext(ViewContext);
}

/**
 * A drop-in replacement for Next.js useRouter that uses
 * the client-side view router for instant navigation.
 * Only `push` and `back` are implemented — other methods
 * fall through to window.location.
 */
export function useInstantRouter() {
  const { navigate, back } = useView();
  return {
    push:    navigate,
    replace: navigate,
    back,
    prefetch: () => {},   // no-op — views are already loaded
  } as const;
}
