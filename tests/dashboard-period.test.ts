// @vitest-environment node
/**
 * The dashboard's Daily/Weekly/Monthly/Yearly bucketing decides which orders
 * land in which column — an off-by-one here misreports a shop's takings, so the
 * boundaries are pinned down here.
 */
import { describe, it, expect } from 'vitest';
import {
  buildBuckets, bucketIndexFor, PERIOD_META, shortMoney, type Period,
} from '@/lib/dashboardPeriod';

// A fixed "now" so the assertions don't drift with the wall clock.
// 2026-07-24 is a Friday.
const NOW = new Date(2026, 6, 24, 15, 30);

describe('buildBuckets', () => {
  it('returns the configured number of buckets for every period', () => {
    for (const p of ['day', 'week', 'month', 'year'] as Period[]) {
      expect(buildBuckets(p, NOW)).toHaveLength(PERIOD_META[p].count);
    }
  });

  it('always ends with the bucket containing "now"', () => {
    for (const p of ['day', 'week', 'month', 'year'] as Period[]) {
      const b = buildBuckets(p, NOW);
      const last = b[b.length - 1];
      expect(NOW.getTime()).toBeGreaterThanOrEqual(last.start.getTime());
      expect(NOW.getTime()).toBeLessThan(last.end.getTime());
    }
  });

  it('produces gapless, strictly increasing ranges', () => {
    for (const p of ['day', 'week', 'month', 'year'] as Period[]) {
      const b = buildBuckets(p, NOW);
      for (let i = 1; i < b.length; i++) {
        // each bucket starts exactly where the previous one ended
        expect(b[i].start.getTime()).toBe(b[i - 1].end.getTime());
        expect(b[i].end.getTime()).toBeGreaterThan(b[i].start.getTime());
      }
    }
  });

  it('starts weekly buckets on a Monday', () => {
    for (const b of buildBuckets('week', NOW)) {
      expect(b.start.getDay()).toBe(1); // Monday
    }
  });

  it('starts monthly buckets on the 1st and yearly on Jan 1', () => {
    for (const b of buildBuckets('month', NOW)) expect(b.start.getDate()).toBe(1);
    for (const b of buildBuckets('year', NOW)) {
      expect(b.start.getMonth()).toBe(0);
      expect(b.start.getDate()).toBe(1);
    }
  });
});

describe('bucketIndexFor', () => {
  it('places "now" in the final bucket', () => {
    const b = buildBuckets('month', NOW);
    expect(bucketIndexFor(NOW, b)).toBe(b.length - 1);
  });

  it('is inclusive of a bucket start and exclusive of its end', () => {
    const b = buildBuckets('day', NOW);
    const mid = b[5];
    expect(bucketIndexFor(new Date(mid.start.getTime()), b)).toBe(5);
    expect(bucketIndexFor(new Date(mid.end.getTime() - 1), b)).toBe(5);
    expect(bucketIndexFor(new Date(mid.end.getTime()), b)).toBe(6); // next bucket
  });

  it('returns -1 for dates outside the window and for invalid dates', () => {
    const b = buildBuckets('day', NOW);
    expect(bucketIndexFor(new Date(2020, 0, 1), b)).toBe(-1);          // too old
    expect(bucketIndexFor(new Date(2030, 0, 1), b)).toBe(-1);          // future
    expect(bucketIndexFor(new Date('nonsense'), b)).toBe(-1);          // unparseable
  });
});

describe('shortMoney', () => {
  it('formats magnitudes compactly', () => {
    expect(shortMoney(0)).toBe('$0');
    expect(shortMoney(999)).toBe('$999');
    expect(shortMoney(1500)).toBe('$1.5k');
    expect(shortMoney(2_400_000)).toBe('$2.4M');
  });

  it('keeps negatives readable (a loss is still a number)', () => {
    expect(shortMoney(-1500)).toBe('$-1.5k');
  });
});
