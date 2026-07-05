import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { requireStaff } from '@/lib/apiAuth';
import { errMsg, isMissingColumnError, isForeignKeyError, jsonWithEtag } from '@/lib/apiHelpers';

function mapProduct(p: Record<string, unknown>) {
  const id      = typeof p.id === 'number' ? p.id : parseInt(String(p.id), 10);
  const tags    = Array.isArray(p.tags) ? p.tags as string[] : [];
  const brand   = (p.brand   && String(p.brand).trim())   ? String(p.brand)   : null;
  const barcode = (p.barcode && String(p.barcode).trim())  ? String(p.barcode) : null;
  const subCat  = (p.sub_category && String(p.sub_category).trim()) ? String(p.sub_category) : null;

  return {
    id,
    name:          p.name,
    price:         p.price,
    originalPrice: p.original_price,
    cost:          Number(p.cost ?? 0),
    category:      p.category,
    subCategory:   subCat,
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
    priceTiers:    Array.isArray(p.price_tiers) ? p.price_tiers : [],
    isB2b:         Boolean(p.is_b2b ?? false),
    moq:           (p.moq as number) ?? 1,
    taxMode:       (p.tax_mode as 'none' | 'included' | 'excluded') ?? 'none',
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
 * Fetches the full product catalog directly from the DB.
 * DB is the ONLY source of truth — no static seed fallback.
 * Returns null only when the DB is completely unreachable.
 */
async function getCatalogFromDB(): Promise<ReturnType<typeof mapProduct>[] | null> {
  try {
    const { data, error } = await getSupabaseAdmin()
      .from('products').select('*').order('id');
    if (error) throw error;
    return (data ?? []).map(r => mapProduct(r as Record<string, unknown>));
  } catch {
    return null; // DB unreachable
  }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const barcode    = searchParams.get('barcode');
  const category   = searchParams.get('category');
  const q          = searchParams.get('q');
  const supplierId = searchParams.get('supplierId');

  const CACHE = { 'Cache-Control': 'public, s-maxage=10, stale-while-revalidate=30' };

  // ── Supplier product filter ───────────────────────────────────
  if (supplierId) {
    try {
      const { data, error } = await getSupabaseAdmin()
        .from('products').select('*').eq('supplier_id', parseInt(supplierId, 10)).order('id');
      if (error) throw error;
      return NextResponse.json((data ?? []).map(r => mapProduct(r as Record<string, unknown>)));
    } catch {
      return NextResponse.json([]);
    }
  }

  // ── Barcode lookup (exact match) ──────────────────────────────
  if (barcode) {
    try {
      const { data } = await getSupabaseAdmin()
        .from('products').select('*').eq('barcode', barcode).maybeSingle();
      if (data) return NextResponse.json(mapProduct(data as Record<string, unknown>));
    } catch { /* fall through */ }

    // Not in DB — not found
    return NextResponse.json(null, { status: 404 });
  }

  // ── Build catalog purely from DB ─────────────────────────────
  const catalog = await getCatalogFromDB();

  // DB unreachable → return empty (never show static seed products)
  let result = catalog ?? [];
  if (category) result = result.filter(p => p.category === category);
  if (q)        result = result.filter(p => matchesQuery(p, q));

  return jsonWithEtag(req, result, CACHE);
}

export async function POST(req: Request) {
  { const denied = await requireStaff(req); if (denied) return denied; }
  const body = await req.json();
  const {
    name, price, originalPrice, cost, category, subCategory, stock,
    sku, description, imageUrl, imageUrls, supplierId, barcode, tags, brand,
    priceTiers, isB2b, moq, taxMode,
  } = body;

  if (!name || !price || !category) {
    return NextResponse.json({ error: 'name, price, and category are required' }, { status: 400 });
  }

  const fullProduct: Record<string, unknown> = {
    name:           String(name).trim(),
    price:          parseFloat(price),
    original_price: parseFloat(originalPrice ?? price),
    cost:           parseFloat(cost ?? '0') || 0,
    category,
    sub_category:   subCategory  ?? null,
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
    price_tiers:    Array.isArray(priceTiers) ? priceTiers : [],
    is_b2b:         Boolean(isB2b ?? false),
    moq:            parseInt(moq ?? '1', 10),
    tax_mode:       (['none','included','excluded'] as const).includes(taxMode) ? taxMode : 'none',
  };

  const basicProduct: Record<string, unknown> = {
    name: fullProduct.name, price: fullProduct.price,
    original_price: fullProduct.original_price, category: fullProduct.category,
    stock: fullProduct.stock, sku: fullProduct.sku,
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
