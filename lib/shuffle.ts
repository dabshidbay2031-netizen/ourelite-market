'use client';

import { useEffect, useState } from 'react';

/**
 * Stable, seeded shuffling for product grids.
 *
 * Why not just sort by Math.random()?
 *  - The catalog is fetched by `.order('id')`, so products otherwise appear in
 *    upload order — a bulk import of 3,000 items lands as one solid block.
 *  - But the grids poll (useLiveRefresh/ETag) and paginate (useIncrementalList).
 *    A fresh random order on every render would make cards jump around while the
 *    user scrolls, and the same product could appear on two pages.
 *
 * So the order is *random per visit* but *fixed for the session*: we derive each
 * product's sort key from a hash of (id, seed). Same seed + same id => same key,
 * so re-renders and re-fetches keep the exact order the user is looking at.
 */

/**
 * One seed per page load, held in module scope:
 *  - A browser refresh re-evaluates the module => new seed => new order.
 *    (Every visit, and every visitor, sees a different Explore page.)
 *  - SPA navigation and re-renders reuse it => the grid never reshuffles
 *    under someone who is mid-scroll.
 */
let pageSeed: number | null = null;

/** The shuffle seed for this page load. Browser-only. */
export function getShuffleSeed(): number {
  if (typeof window === 'undefined') return 0;
  if (pageSeed === null) pageSeed = Math.floor(Math.random() * 2 ** 31) + 1;
  return pageSeed;
}

/** Deterministic 32-bit mix of an id and the seed (mulberry32-style avalanche). */
function keyFor(id: number, seed: number): number {
  let h = (id ^ seed) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x21f0aaad) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x735a2d97) >>> 0;
  return (h ^ (h >>> 15)) >>> 0;
}

/**
 * Return a shuffled copy, ordered deterministically by the seed.
 * `seed === 0` returns the list untouched (SSR / storage unavailable).
 */
export function shuffleStable<T extends { id: number }>(items: T[], seed: number): T[] {
  if (!seed || items.length < 2) return items;
  return [...items].sort((a, b) => keyFor(a.id, seed) - keyFor(b.id, seed));
}

/**
 * Page-load shuffle seed as state. Starts at 0 so the server and the first
 * client paint agree (no hydration mismatch), then fills in after mount.
 */
export function useShuffleSeed(): number {
  const [seed, setSeed] = useState(0);
  useEffect(() => { setSeed(getShuffleSeed()); }, []);
  return seed;
}
