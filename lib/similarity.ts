import type { Product } from '@/lib/types';

/**
 * "Similar products" ranking for the product detail page.
 *
 * Goal: surface as many genuinely-related products as possible, with the
 * strongest signal being SAME CATEGORY + SHARED TAGS. Weighting:
 *   +5 per shared tag           (deliberate labels — the strongest signal)
 *   +3 per shared name word     ("iPhone 15 Pro" ↔ "iPhone 15 Pro Max")
 *   +2 same subcategory
 *   +2 same brand
 *   +1 same category            (the weakest tie, on its own)
 *
 * A same-category item is ALWAYS eligible (so a category page feels complete);
 * a different-category item must earn a real signal (a shared tag, or two name
 * words) so "Pro"/"Max" alone can't make granola look like a phone.
 *
 * Ties break by units sold, so popular items surface first.
 */

/** Filler words that would create false name matches. */
const STOP_WORDS = new Set(['the', 'and', 'for', 'with', 'of', 'a', 'an', 'new', 'set', 'pack']);

function nameWords(name: string): Set<string> {
  return new Set(
    String(name ?? '')
      .toLowerCase()
      .split(/[^a-z0-9+]+/)
      .filter(w => w.length >= 2 && !STOP_WORDS.has(w)),
  );
}

function lowerTags(p: Product): string[] {
  return (p.tags ?? []).map(t => String(t).toLowerCase()).filter(Boolean);
}

export function similarProducts(product: Product, all: Product[], limit = 12): Product[] {
  const tags  = new Set(lowerTags(product));
  const words = nameWords(product.name);
  const brand = (product.brand ?? '').trim().toLowerCase();

  const scored: { p: Product; score: number; sharedTags: number }[] = [];
  for (const p of all) {
    if (p.id === product.id) continue;

    const sameCategory = p.category === product.category;
    const sameBrand    = !!brand && (p.brand ?? '').trim().toLowerCase() === brand;
    let score = 0;
    let sharedTags = 0;

    for (const t of lowerTags(p)) if (tags.has(t)) { score += 5; sharedTags += 1; }
    nameWords(p.name).forEach(w => { if (words.has(w)) score += 3; });
    if (product.subCategory && p.subCategory === product.subCategory) score += 2;
    if (sameBrand) score += 2;
    if (sameCategory) score += 1;

    // Different-category items must earn a genuine signal — a single shared
    // marketing word isn't enough. Qualifiers: a shared tag, two name words,
    // or the SAME BRAND (a phone and its brand's charger belong together).
    if (!sameCategory && !sameBrand && score < 5) continue;

    // Same-category items are always worth showing (score ≥ 1 here), so a
    // category's detail page always has a full "similar" shelf.
    if (score > 0) scored.push({ p, score, sharedTags });
  }

  return scored
    .sort((a, b) =>
      b.score - a.score ||
      b.sharedTags - a.sharedTags ||
      (b.p.sold ?? 0) - (a.p.sold ?? 0))
    .slice(0, limit)
    .map(x => x.p);
}
