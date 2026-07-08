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

/**
 * Read-only hook for the storefront: fetches the admin-configured Hot Deals
 * hero banner once on mount. Falls back to the default copy on any failure so
 * the Explore page never waits on this request.
 */
export function useHeroBanner(): HeroBanner {
  const [hero, setHero] = useState<HeroBanner>(DEFAULT_HERO);

  const load = useCallback(() => {
    fetch('/api/settings/hero')
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d) setHero(d as HeroBanner); })
      .catch(() => { /* keep defaults */ });
  }, []);

  useEffect(() => { load(); }, [load]);
  // Admin saved a new banner → every open storefront swaps it live.
  useRealtimePing(['settings'], load);

  return hero;
}
