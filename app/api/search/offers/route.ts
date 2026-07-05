import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { distanceKm } from '@/lib/geo';
import { districtFor } from '@/lib/districts';

/**
 * GET /api/search/offers?q=...&lat=...&lng=...&stores=10
 *
 * Location-aware product search. A product in the shared catalog can be sold
 * by many stores — the original uploader plus every business that claimed it
 * via `business_products`. Plain catalog search only ever surfaced the
 * original uploader; this endpoint expands each matching product into one
 * OFFER per store that actually sells it, then ranks stores by distance from
 * the shopper's live coordinates and returns the best matching product from
 * each of the N closest stores.
 *
 * Without coordinates (permission denied / store has no GPS yet) it degrades
 * to rating+sales order, and stores lacking coordinates always rank after
 * stores that have them.
 */

interface Offer {
  productId:  number;
  name:       string;
  category:   string;
  price:      number;
  imageUrl:   string | null;
  imageUrls:  string[];
  stock:      number;
  sold:       number;
  claimed:    boolean;              // true → this store claimed it from the catalog
  store: {
    id:         number;
    name:       string;
    slug:       string | null;
    icon:       string;
    location:   string | null;     // human label, e.g. district
    distanceKm: number | null;     // null when either side lacks coordinates
    rating:     number;
  };
}

function matches(p: Record<string, unknown>, q: string): boolean {
  const hay = [p.name, p.description, p.sku, p.brand, p.category, p.sub_category]
    .map(v => String(v ?? '').toLowerCase());
  const tags = Array.isArray(p.tags) ? (p.tags as string[]).map(t => t.toLowerCase()) : [];
  return hay.some(h => h.includes(q)) || tags.some(t => t.includes(q));
}

/** Name hits beat description-only hits; popular products break ties. */
function matchScore(p: Record<string, unknown>, q: string): number {
  const name = String(p.name ?? '').toLowerCase();
  let s = 0;
  if (name.startsWith(q))     s += 3;
  else if (name.includes(q))  s += 2;
  return s * 1_000_000 + Number(p.sold ?? 0);
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q   = (searchParams.get('q') ?? '').trim().toLowerCase();
  const lat = parseFloat(searchParams.get('lat') ?? '');
  const lng = parseFloat(searchParams.get('lng') ?? '');
  const maxStores = Math.min(25, Math.max(1, parseInt(searchParams.get('stores') ?? '10', 10) || 10));
  const hasPos = Number.isFinite(lat) && Number.isFinite(lng);

  if (q.length < 2) return NextResponse.json({ offers: [], hasPos });

  try {
    const sb = getSupabaseAdmin();

    const { data: products, error: pErr } = await sb.from('products').select('*');
    if (pErr) throw pErr;

    const matched = (products ?? []).filter(p => matches(p as Record<string, unknown>, q));
    if (matched.length === 0) return NextResponse.json({ offers: [], hasPos });
    const matchedIds = matched.map(p => p.id as number);

    const [{ data: claims }, { data: suppliers, error: sErr }] = await Promise.all([
      sb.from('business_products')
        .select('supplier_id, product_id, custom_price, stock_qty, is_active')
        .in('product_id', matchedIds)
        .eq('is_active', true),
      sb.from('suppliers').select('id, name, slug, icon, location, latitude, longitude, rating'),
    ]);
    if (sErr) throw sErr;

    const supplierById = new Map((suppliers ?? []).map(s => [s.id as number, s]));

    const storeMeta = (sid: number, dist: number | null) => {
      const s = supplierById.get(sid);
      if (!s) return null;
      return {
        id:         sid,
        name:       String(s.name ?? 'Store'),
        slug:       (s.slug as string | null) ?? null,
        icon:       String(s.icon ?? '🏪'),
        // Recognised district from GPS beats the store's free-text location
        location:   districtFor(s.latitude as number | null, s.longitude as number | null)
                      ?? ((s.location as string | null) || null),
        distanceKm: dist,
        rating:     Number(s.rating ?? 0),
      };
    };

    const distFor = (sid: number): number | null => {
      const s = supplierById.get(sid);
      if (!hasPos || !s || s.latitude == null || s.longitude == null) return null;
      return distanceKm(lat, lng, Number(s.latitude), Number(s.longitude));
    };

    // ── Expand matches into per-store offers ─────────────────────────────
    const offers: (Offer & { _score: number })[] = [];

    for (const p of matched) {
      const row = p as Record<string, unknown>;
      const score = matchScore(row, q);
      const base = {
        productId: Number(row.id),
        name:      String(row.name),
        category:  String(row.category ?? ''),
        imageUrl:  (row.image_url as string | null) ?? null,
        imageUrls: Array.isArray(row.image_urls) ? (row.image_urls as string[]) : [],
        sold:      Number(row.sold ?? 0),
        _score:    score,
      };

      // The original uploader's own listing
      const ownerId = row.supplier_id as number | null;
      if (ownerId != null && supplierById.has(ownerId)) {
        const store = storeMeta(ownerId, distFor(ownerId))!;
        offers.push({ ...base, price: Number(row.price ?? 0), stock: Number(row.stock ?? 0), claimed: false, store });
      }

      // Every store that claimed this product sells it too — same visibility
      for (const c of claims ?? []) {
        if (c.product_id !== row.id) continue;
        const sid = c.supplier_id as number;
        if (sid === ownerId || !supplierById.has(sid)) continue;
        const store = storeMeta(sid, distFor(sid))!;
        offers.push({
          ...base,
          price:   Number(c.custom_price ?? row.price ?? 0),
          stock:   Number(c.stock_qty ?? 0),
          claimed: true,
          store,
        });
      }
    }

    // ── Rank stores: nearest first, unknown-distance last ────────────────
    const storeRank = (o: { store: { distanceKm: number | null; rating: number } }) =>
      o.store.distanceKm ?? Infinity;

    const byStore = new Map<number, (Offer & { _score: number })[]>();
    for (const o of offers) {
      const list = byStore.get(o.store.id) ?? [];
      list.push(o);
      byStore.set(o.store.id, list);
    }

    const rankedStores = Array.from(byStore.values())
      .map(list => list.sort((a, b) => b._score - a._score)) // best match per store first
      .sort((a, b) => {
        const da = storeRank(a[0]), db = storeRank(b[0]);
        if (da !== db) return da - db;
        // no-GPS tiebreak: better-rated, better-matching stores first
        return (b[0].store.rating - a[0].store.rating) || (b[0]._score - a[0]._score);
      })
      .slice(0, maxStores);

    // Top product from each of the closest stores
    const top = rankedStores.map(list => {
      const { _score, ...offer } = list[0];
      return offer;
    });

    return NextResponse.json({ offers: top, hasPos });
  } catch {
    return NextResponse.json({ offers: [], hasPos });
  }
}
