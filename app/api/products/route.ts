import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { PRODUCTS } from '@/lib/seed-data';
import { errMsg, isMissingColumnError, isForeignKeyError } from '@/lib/apiHelpers';

/**
 * Map a Supabase product row, filling in brand/tags/barcode/subCategory
 * from the static seed data whenever the DB columns are empty.
 */
function mapProduct(p: Record<string, unknown>) {
  const id   = typeof p.id === 'number' ? p.id : parseInt(String(p.id), 10);
  const seed = PRODUCTS.find(s => s.id === id);

  const tags    = (Array.isArray(p.tags) && (p.tags as unknown[]).length > 0)
                    ? p.tags as string[]
                    : (seed?.tags ?? []);
  const brand   = (p.brand   && String(p.brand).trim())   ? String(p.brand)   : (seed?.brand   ?? null);
  const barcode = (p.barcode && String(p.barcode).trim())  ? String(p.barcode) : (seed?.barcode ?? null);
  const subCat  = (p.sub_category && String(p.sub_category).trim()) ? String(p.sub_category) : (seed?.subCategory ?? null);

  return {
    id,
    name:          p.name,
    price:         p.price,
    originalPrice: p.original_price,
    category:      p.category,
    subCategory:   subCat,
    icon:          p.icon,
    stock:         p.stock,
    sku:           p.sku,
    supplierId:    p.supplier_id   ?? null,
    rating:        p.rating,
    reviews:       p.reviews,
    sold:          p.sold,
    description:   p.description,
    barcode,
    tags,
    brand,
    imageUrl:      p.image_url     ?? null,
    imageUrls:     p.image_urls    ?? [],
  };
}

/** Search filter — checks name, description, sku, brand, tags */
function matchesQuery(p: { name?: unknown; description?: unknown; sku?: unknown; brand?: unknown | null; tags?: unknown }, q: string): boolean {
  const qL   = q.toLowerCase();
  const name = String(p.name  ?? '').toLowerCase();
  const desc = String(p.description ?? '').toLowerCase();
  const sku  = String(p.sku   ?? '').toLowerCase();
  const brand= String(p.brand ?? '').toLowerCase();
  const tags = Array.isArray(p.tags) ? (p.tags as string[]) : [];
  return name.includes(qL)  || desc.includes(qL) || sku.includes(qL) ||
         brand.includes(qL) || tags.some(t => String(t).toLowerCase().includes(qL));
}

/**
 * Builds the full product catalog.
 * DB IS THE SOURCE OF TRUTH:
 *   1. Start with every product in Supabase (incl. newly-added ones, ID 66+)
 *      enriched with seed metadata where DB columns are empty.
 *   2. Append static seed products whose ID is NOT in the DB, so the catalog
 *      stays complete even if the DB was only partially seeded.
 * Returns null if the DB is unreachable (caller falls back to static).
 */
async function getMergedCatalog(): Promise<ReturnType<typeof mapProduct>[] | null> {
  try {
    const { data, error } = await getSupabaseAdmin()
      .from('products').select('*').order('id');
    if (error) throw error;

    const dbProducts = (data ?? []).map(r => mapProduct(r as Record<string, unknown>));
    const dbIds = new Set(dbProducts.map(p => p.id));

    // Add static products not yet present in the DB
    const staticOnly = PRODUCTS
      .filter(s => !dbIds.has(s.id))
      .map(s => mapProduct({
        id: s.id, name: s.name, price: s.price, original_price: s.originalPrice,
        category: s.category, sub_category: s.subCategory, icon: s.icon,
        stock: s.stock, sku: s.sku, supplier_id: s.supplierId,
        rating: s.rating, reviews: s.reviews, sold: s.sold,
        description: s.description, barcode: s.barcode, tags: s.tags,
        brand: s.brand, image_url: s.imageUrl ?? null, image_urls: s.imageUrls ?? [],
      }));

    return [...dbProducts, ...staticOnly].sort((a, b) => Number(a.id) - Number(b.id));
  } catch {
    return null; // DB unreachable
  }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const barcode  = searchParams.get('barcode');
  const category = searchParams.get('category');
  const q        = searchParams.get('q');

  const CACHE = { 'Cache-Control': 'public, s-maxage=10, stale-while-revalidate=30' };

  // ── Barcode lookup (exact match) ──────────────────────────────
  if (barcode) {
    try {
      const { data } = await getSupabaseAdmin()
        .from('products').select('*').eq('barcode', barcode).maybeSingle();
      if (data) return NextResponse.json(mapProduct(data as Record<string, unknown>));
    } catch { /* fall through to static */ }
    const found = PRODUCTS.find(p => p.barcode === barcode);
    if (!found) return NextResponse.json(null, { status: 404 });
    return NextResponse.json(found);
  }

  // ── Build catalog (DB source of truth, static fills gaps) ─────
  const catalog = await getMergedCatalog();

  // DB unreachable → fall back to static seed
  if (catalog === null) {
    let list: ReturnType<typeof mapProduct>[] = PRODUCTS.map(s => mapProduct({
      id: s.id, name: s.name, price: s.price, original_price: s.originalPrice,
      category: s.category, sub_category: s.subCategory, icon: s.icon,
      stock: s.stock, sku: s.sku, supplier_id: s.supplierId,
      rating: s.rating, reviews: s.reviews, sold: s.sold,
      description: s.description, barcode: s.barcode, tags: s.tags,
      brand: s.brand, image_url: s.imageUrl ?? null, image_urls: s.imageUrls ?? [],
    }));
    if (category) list = list.filter(p => p.category === category);
    if (q)        list = list.filter(p => matchesQuery(p, q));
    return NextResponse.json(list, { headers: CACHE });
  }

  // Apply filters on the live catalog
  let result = catalog;
  if (category) result = result.filter(p => p.category === category);
  if (q)        result = result.filter(p => matchesQuery(p, q));

  return NextResponse.json(result, { headers: CACHE });
}

export async function POST(req: Request) {
  const body = await req.json();
  const {
    name, price, originalPrice, category, subCategory, icon, stock,
    sku, description, imageUrl, imageUrls, supplierId, barcode, tags, brand,
  } = body;

  if (!name || !price || !category) {
    return NextResponse.json({ error: 'name, price, and category are required' }, { status: 400 });
  }

  const fullProduct: Record<string, unknown> = {
    name:           String(name).trim(),
    price:          parseFloat(price),
    original_price: parseFloat(originalPrice ?? price),
    category,
    sub_category:   subCategory  ?? null,
    icon:           icon         ?? '📦',
    stock:          parseInt(stock ?? '0', 10),
    sku:            sku?.trim()  ?? `SKU-${Date.now()}`,
    supplier_id:    supplierId   ? parseInt(String(supplierId), 10) : null,
    rating: 0, reviews: 0, sold: 0,
    description:    description?.trim() ?? '',
    barcode:        barcode?.trim()     ?? null,
    tags:           Array.isArray(tags) ? tags : [],
    brand:          brand?.trim()       ?? null,
    image_url:      imageUrl            ?? null,
    image_urls:     Array.isArray(imageUrls) ? imageUrls : [],
  };

  const basicProduct: Record<string, unknown> = {
    name: fullProduct.name, price: fullProduct.price,
    original_price: fullProduct.original_price, category: fullProduct.category,
    icon: fullProduct.icon, stock: fullProduct.stock, sku: fullProduct.sku,
    supplier_id: fullProduct.supplier_id, rating: 0, reviews: 0, sold: 0,
    description: fullProduct.description,
  };

  // Compute next safe ID (bypasses broken SERIAL sequence)
  const { data: maxRow } = await getSupabaseAdmin()
    .from('products').select('id').order('id', { ascending: false }).limit(1).maybeSingle();
  const nextId = ((maxRow?.id as number) ?? 0) + 1;

  const LEGACY_CATS: Record<string, string> = {
    medicine:'health', cosmetics:'health', construction:'home',
    furniture:'home',  cars:'home',        books:'food',
    clothes:'fashion', other:'sports',
  };

  const attempts = [
    { ...fullProduct,  id: nextId },
    { ...basicProduct, id: nextId },
    { ...basicProduct, id: nextId, category: LEGACY_CATS[category] ?? 'electronics' },
  ];

  let lastErr: unknown;
  for (const attempt of attempts) {
    try {
      const { data, error } = await getSupabaseAdmin()
        .from('products').insert(attempt).select().single();
      if (error) throw error;
      const result = mapProduct(data as Record<string, unknown>);
      return NextResponse.json({ ...result, category }, { status: 201 });
    } catch (e) {
      lastErr = e;
      if (!isMissingColumnError(e) && !isForeignKeyError(e)) break;
    }
  }
  return NextResponse.json({ error: errMsg(lastErr) }, { status: 500 });
}
