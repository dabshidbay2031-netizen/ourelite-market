'use client';

/**
 * Hash-based SPA router.
 *
 * Every app route lives in the URL hash: `/#/dashboard`, `/#/product/3?from=search`.
 * The API mirrors next/navigation + next/link so views can swap imports 1:1:
 *
 *   import { Link, useRouter, usePathname, useSearchParams, useParams } from '@/lib/hashRouter';
 *
 * Hashes that do not start with `#/` are IGNORED (treated as path `/`) —
 * this is critical for Supabase OAuth, which delivers tokens as
 * `#access_token=...` on the callback URL.
 */

import React, {
  createContext, useContext, useEffect, useState, useMemo, useCallback,
  type ComponentType, type ReactNode, type AnchorHTMLAttributes,
} from 'react';

/* ── Hash parsing ────────────────────────────────────────────── */

export interface HashLocation {
  path:  string;          // '/product/3'
  query: string;          // 'from=search' (no '?')
}

export function parseHash(hash: string): HashLocation {
  if (!hash.startsWith('#/')) return { path: '/', query: '' };
  const body = hash.slice(1);                  // '/product/3?from=search'
  const qIdx = body.indexOf('?');
  if (qIdx === -1) return { path: body, query: '' };
  return { path: body.slice(0, qIdx), query: body.slice(qIdx + 1) };
}

function currentLocation(): HashLocation {
  return parseHash(window.location.hash);
}

/* ── Navigation primitives ───────────────────────────────────── */

function navigate(href: string, replace = false) {
  const target = href.startsWith('#') ? href : `#${href}`;
  if (replace) {
    const base = window.location.href.split('#')[0];
    window.location.replace(base + target);
  } else {
    window.location.hash = target;
  }
}

/* ── Context ─────────────────────────────────────────────────── */

// SSR + first client render both use '/' so hydration always matches;
// an effect syncs to the real hash immediately after mount.
const LocationCtx = createContext<HashLocation>({ path: '/', query: '' });
const ParamsCtx   = createContext<Record<string, string>>({});

export function HashRouterProvider({ children }: { children: ReactNode }) {
  const [loc, setLoc] = useState<HashLocation>({ path: '/', query: '' });

  useEffect(() => {
    const sync = () => setLoc(currentLocation());
    sync();
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, []);

  return <LocationCtx.Provider value={loc}>{children}</LocationCtx.Provider>;
}

/* ── next/navigation-compatible hooks ────────────────────────── */

export function usePathname(): string {
  return useContext(LocationCtx).path;
}

export function useSearchParams(): URLSearchParams {
  const { query } = useContext(LocationCtx);
  return useMemo(() => new URLSearchParams(query), [query]);
}

export function useParams<T extends Record<string, string> = Record<string, string>>(): T {
  return useContext(ParamsCtx) as T;
}

export interface HashRouter {
  push:     (href: string) => void;
  replace:  (href: string) => void;
  back:     () => void;
  forward:  () => void;
  refresh:  () => void;
  prefetch: (href: string) => void;
}

const routerSingleton: HashRouter = {
  push:     (href) => navigate(href, false),
  replace:  (href) => navigate(href, true),
  back:     () => window.history.back(),
  forward:  () => window.history.forward(),
  refresh:  () => window.location.reload(),
  prefetch: () => {},
};

export function useRouter(): HashRouter {
  return routerSingleton;
}

/* ── next/link-compatible <Link> ─────────────────────────────── */

interface LinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> {
  href:     string;
  children: ReactNode;
  replace?: boolean;
}

export function Link({ href, children, replace, onClick, ...rest }: LinkProps) {
  const handleClick = useCallback((e: React.MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    if (replace && !e.defaultPrevented) {
      e.preventDefault();
      navigate(href, true);
    }
  }, [href, replace, onClick]);

  // External / non-app links pass through untouched
  const isExternal = /^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('//');
  return (
    <a href={isExternal ? href : `#${href}`} onClick={handleClick} {...rest}>
      {children}
    </a>
  );
}

/* ── Route matching + view outlet ────────────────────────────── */

export interface RouteDef {
  /** '/product/:id' style pattern. Use '/:slug' as a final catch-all. */
  pattern:   string;
  component: ComponentType;
}

export function matchPath(pattern: string, path: string): Record<string, string> | null {
  const pp = pattern.split('/').filter(Boolean);
  const sp = path.split('/').filter(Boolean);
  if (pp.length !== sp.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < pp.length; i++) {
    if (pp[i].startsWith(':')) params[pp[i].slice(1)] = decodeURIComponent(sp[i]);
    else if (pp[i] !== sp[i]) return null;
  }
  return params;
}

interface RouterViewProps {
  routes:   RouteDef[];
  fallback: ComponentType;
}

export function RouterView({ routes, fallback: Fallback }: RouterViewProps) {
  const { path } = useContext(LocationCtx);

  const matched = useMemo(() => {
    for (const route of routes) {
      const params = matchPath(route.pattern, path);
      if (params) return { Component: route.component, params };
    }
    return null;
  }, [routes, path]);

  // New route → start at the top, like a real page navigation
  useEffect(() => { window.scrollTo(0, 0); }, [path]);

  if (!matched) return <Fallback />;
  const { Component, params } = matched;
  // key={path} re-mounts the view per route, restoring the entrance
  // transition the old per-page app/template.tsx used to provide
  return (
    <ParamsCtx.Provider value={params}>
      <div className="route-anim" key={path}>
        <Component />
      </div>
    </ParamsCtx.Provider>
  );
}
