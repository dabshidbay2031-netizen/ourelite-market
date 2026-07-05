import type { Product } from '@/lib/types';

/**
 * "Similar products" ranking for the product detail page.
 *
 * A product is similar when it shares TAGS, NAME words, or CATEGORY with the
 * one being viewed — weighted so the strongest signals win:
 *   +4 per shared tag           (tags are deliberate, so they matter most)
 *   +3 per shared name word     ("iPhone 15 Pro" ↔ "iPhone 15 Pro Max")
 *   +2 same subcategory
 *   +1 same category            (the old behaviour, now just the weakest tie)
 * Ties break by units sold, so popular items surface first.
 */

/** Filler words that would create false name matches. */
const STOP_WORDS = new Set(['the', 'and', 'for', 'with', 'of', 'a', 'an']);

function nameWords(name: string): Set<string> {
  return new Set(
    String(name ?? '')
      .toLowerCase()
      .split(/[^a-z0-9+]+/)
      .filter(w => w.length >= 2 && !STOP_WORDS.has(w)),
  );
}

export function similarProducts(product: Product, all: Product[], limit = 8): Product[] {
  const tags  = new Set((product.tags ?? []).map(t => t.toLowerCase()));
  const words = nameWords(product.name);

  const scored: { p: Product; score: number }[] = [];
  for (const p of all) {
    if (p.id === product.id) continue;
    let score = 0;
    for (const t of p.tags ?? []) if (tags.has(t.toLowerCase())) score += 4;
    nameWords(p.name).forEach(w => { if (words.has(w)) score += 3; });
    if (product.subCategory && p.subCategory === product.subCategory) score += 2;
    if (p.category === product.category) score += 1;
    // A DIFFERENT-category product needs more than one weak signal — a single
    // shared marketing word ("Pro", "Max") must not make granola similar to a
    // phone. One shared tag (4) or two name words (6) is enough; one word (3) isn't.
    if (p.category !== product.category && score < 4) continue;
    if (score > 0) scored.push({ p, score });
  }

  return scored
    .sort((a, b) => b.score - a.score || (b.p.sold ?? 0) - (a.p.sold ?? 0))
    .slice(0, limit)
    .map(x => x.p);
}
