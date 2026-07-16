'use client';

import { useCallback, useEffect, useState } from 'react';
import { shuffleStable } from '@/lib/shuffle';

/**
 * Lightweight, on-device interest model for the Explore grid.
 *
 * Someone who searches "laptop" should keep seeing laptops and electronics —
 * but Explore must stay a marketplace, not an echo chamber. So we mix: a fixed
 * share of the grid (INTEREST_RATIO, 30%) is drawn from what the shopper has
 * shown interest in, and the rest stays randomly shuffled discovery.
 *
 * Signals are recorded when we already know the context (a search that matched
 * products, a product page view, a category tap), so we never have to re-run
 * the query against the catalog to figure out intent.
 *
 * Everything lives in localStorage — no profile ever leaves the device.
 */

const KEY          = 'mg_affinity';
const MAX_EVENTS   = 60;                       // ring buffer; oldest fall off
const HALF_LIFE_MS = 14 * 24 * 60 * 60 * 1000; // interest halves every 14 days

/** Weight of each signal — an explicit search says more than a passing view. */
const WEIGHTS = { search: 3, view: 2, category: 1 } as const;
export type SignalKind = keyof typeof WEIGHTS;

interface Event {
  c: string;        // category id
  s?: string;       // subcategory id
  k: SignalKind;    // signal kind
  t: number;        // timestamp
}

export interface Affinity {
  categories: Record<string, number>;
  subs:       Record<string, number>;
  known:      boolean;   // false => cold start, pure discovery
}

export const EMPTY_AFFINITY: Affinity = { categories: {}, subs: {}, known: false };

/** Share of the Explore grid drawn from the shopper's interests. */
export const INTEREST_RATIO = 0.3;

function readEvents(): Event[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

/** Record one interest signal. Safe to call often; cheap and best-effort. */
export function recordInterest(category: string, subCategory?: string | null, kind: SignalKind = 'view'): void {
  if (typeof window === 'undefined' || !category) return;
  try {
    const events = readEvents();
    events.push({ c: category, s: subCategory || undefined, k: kind, t: Date.now() });
    localStorage.setItem(KEY, JSON.stringify(events.slice(-MAX_EVENTS)));
  } catch { /* storage full / private mode — personalization just stays off */ }
}

/** Collapse the event log into decayed category + subcategory weights. */
export function computeAffinity(): Affinity {
  const events = readEvents();
  if (events.length === 0) return EMPTY_AFFINITY;

  const now = Date.now();
  const categories: Record<string, number> = {};
  const subs:       Record<string, number> = {};

  for (const e of events) {
    if (!e?.c) continue;
    const age    = Math.max(0, now - (e.t ?? now));
    const decay  = Math.pow(0.5, age / HALF_LIFE_MS);
    const weight = (WEIGHTS[e.k] ?? 1) * decay;
    categories[e.c] = (categories[e.c] ?? 0) + weight;
    if (e.s) subs[e.s] = (subs[e.s] ?? 0) + weight;
  }

  const known = Object.values(categories).some(v => v > 0.15); // ignore fully-decayed noise
  return { categories, subs, known };
}

/** Read the interest profile after mount (SSR-safe: cold start on first paint). */
export function useAffinity(): Affinity {
  const [affinity, setAffinity] = useState<Affinity>(EMPTY_AFFINITY);
  useEffect(() => { setAffinity(computeAffinity()); }, []);
  return affinity;
}

/** Stable callback for views that record signals. */
export function useRecordInterest() {
  return useCallback(
    (category: string, subCategory?: string | null, kind: SignalKind = 'view') =>
      recordInterest(category, subCategory, kind),
    [],
  );
}

/**
 * Interleave interest-matched products into a shuffled catalog.
 *
 * Both buckets are shuffled with the page seed (so the order is fresh every
 * visit but stable while scrolling), then merged on a fixed cadence: in each
 * block of 10 slots the first 3 come from the interest bucket. That holds the
 * blend at ~30% for as long as interest items last, without ever clumping them
 * all at the top. Falls back to a plain shuffle at cold start.
 */
export function personalizeMix<T extends { id: number; category: string; subCategory?: string | null }>(
  items: T[],
  affinity: Affinity,
  seed: number,
  ratio: number = INTEREST_RATIO,
): T[] {
  if (!affinity.known || items.length < 4) return shuffleStable(items, seed);

  const interested = new Set(
    Object.entries(affinity.categories).filter(([, w]) => w > 0.15).map(([c]) => c),
  );
  if (interested.size === 0) return shuffleStable(items, seed);

  const hits: T[] = [];
  const rest: T[] = [];
  for (const p of items) (interested.has(p.category) ? hits : rest).push(p);
  if (hits.length === 0 || rest.length === 0) return shuffleStable(items, seed);

  // Within the interest bucket, the strongest signal leads (searching "laptop"
  // should surface laptops before other electronics) — but shuffle inside each
  // score band so it isn't the same parade every visit.
  const score = (p: T) =>
    (affinity.categories[p.category] ?? 0) +
    (p.subCategory ? (affinity.subs[p.subCategory] ?? 0) * 2 : 0);
  const band = (p: T) => Math.round(score(p) * 2) / 2;
  const hitsOrdered = shuffleStable(hits, seed).sort((a, b) => band(b) - band(a));
  const restOrdered = shuffleStable(rest, seed);

  // Blend on a repeating cadence: `perBlock` of every 10 slots are interest items.
  const perBlock = Math.max(1, Math.min(9, Math.round(ratio * 10)));
  const out: T[] = [];
  let hi = 0, ri = 0;
  while (hi < hitsOrdered.length || ri < restOrdered.length) {
    const wantHit = out.length % 10 < perBlock;
    if (wantHit && hi < hitsOrdered.length)      out.push(hitsOrdered[hi++]);
    else if (!wantHit && ri < restOrdered.length) out.push(restOrdered[ri++]);
    else if (hi < hitsOrdered.length)             out.push(hitsOrdered[hi++]);
    else                                          out.push(restOrdered[ri++]);
  }
  return out;
}
