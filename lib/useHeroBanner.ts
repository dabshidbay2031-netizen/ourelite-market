'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRealtimePing } from '@/lib/useRealtimePing';
import type { HeroBanner } from '@/app/api/settings/hero/route';

/** Matches the server-side fallback so the banner renders instantly, then
 *  refreshes from /api/settings/hero once mounted. */
const DEFAULT_HERO: HeroBanner = {
  enabled:  true,
  imageUrl: '',
  tag:      '🔥 Hot Deals',
  title:    'Up to 30% Off This Week',
  subtitle: 'Limited time offers on top products',
  ctaLabel: 'Shop Now',
};

const CACHE_KEY = 'mg_c_hero';

function readCachedHero(): HeroBanner | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as HeroBanner) : null;
  } catch { return null; }
}

/**
 * Read-only hook for the storefront: fetches the admin-configured Hot Deals
 * hero banner. On refresh it shows the last banner THIS browser actually saw
 * (cached) instead of the hardcoded default, so the real banner never flashes
 * a stale/wrong version before the network responds, then revalidates.
 */
export function useHeroBanner(): HeroBanner {
  const [hero, setHero] = useState<HeroBanner>(DEFAULT_HERO);

  // Swap in the cached banner as early as possible (before the fetch resolves).
  useEffect(() => { const c = readCachedHero(); if (c) setHero(c); }, []);

  const load = useCallback(() => {
    fetch('/api/settings/hero')
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (d) {
          setHero(d as HeroBanner);
          try { localStorage.setItem(CACHE_KEY, JSON.stringify(d)); } catch { /* storage full */ }
        }
      })
      .catch(() => { /* keep last-known / defaults */ });
  }, []);

  useEffect(() => { load(); }, [load]);
  // Admin saved a new banner → every open storefront swaps it live.
  useRealtimePing(['settings'], load);

  return hero;
}
