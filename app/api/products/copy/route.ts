import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { requireSupplierAccess } from '@/lib/apiAuth';
import { errMsg, isMissingColumnError } from '@/lib/apiHelpers';
import { pingRealtime } from '@/lib/realtimeServer';

/**
 * POST /api/products/copy  { supplierId, productId, price?, stock? }
 *
 * "Add to my store" — takes a catalog product and creates a REAL new product
 * row OWNED by the requesting store. The copy has its own id, price and stock,
 * so opening it shows the copying store as the seller (the old claim model left
 * the row owned by the original uploader, which is what shoppers saw).
 *
 * The copy is made server-side from the source row: the client only says WHICH
 * product to copy, never what the copy contains, so nothing can be spoofed.
 *
 * Idempotent — a store that already copied this product gets its existing copy
 * back instead of a duplicate (also enforced by a unique index in v4_0).
 *
 * `copied_from_product_id` records provenance and ships in migration_v4_0.sql;
 * before that migration this route returns needsMigration rather than silently
 * creating untracked duplicates.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const supplierId = parseInt(String(body.supplierId ?? ''), 10);
  const productId  = parseInt(String(body.productId  ?? ''), 10);

  if (Number.isNaN(supplierId) || Number.isNaN(productId)) {
    return NextResponse.json({ error: 'supplierId and productId are required' }, { status: 400 });
  }

  // Only the store's owner / staff with inventory rights / an admin / the field
  // agent setting the store up may add products to it.
  {
    const denied = await requireSupplierAccess(req, supplierId, 'inventory_edit');
    if (denied) return denied;
  }

  const sb = getSupabaseAdmin();

  try {
    // ── Source row ────────────────────────────────────────────────────────
    const { data: src, error: srcErr } = await sb
      .from('products').select('*').eq('id', productId).maybeSingle();
    if (srcErr) throw srcErr;
    if (!src) return NextResponse.json({ error: 'Product not found' }, { status: 404 });

    // Already this store's own row — nothing to copy.
    if (Number(src.supplier_id) === supplierId) {
      return NextResponse.json({ error: 'This product is already yours', alreadyOwned: true }, { status: 409 });
    }

    // ── Idempotency: return the existing copy if there is one ─────────────
    const { data: existing, error: exErr } = await sb
      .from('products').select('*')
      .eq('supplier_id', supplierId)
      .eq('copied_from_product_id', productId)
      .maybeSingle();
    if (exErr) {
      if (isMissingColumnError(exErr)) {
        return NextResponse.json(
          { error: 'Product copying not enabled yet (run migration_v4_0.sql)', needsMigration: true },
          { status: 501 },
        );
      }
      throw exErr;
    }
    if (existing) {
      return NextResponse.json({ ...mapCopy(existing), alreadyCopied: true });
    }

    // ── Build the copy ────────────────────────────────────────────────────
    // Everything descriptive is inherited; the money/stock start where the
    // store asked (default: the catalog price, no stock yet). A fresh listing
    // owns no history, so rating/reviews/sold reset to zero.
    const price = body.price != null && Number.isFinite(Number(body.price))
      ? Math.max(0, Number(body.price))
      : Number(src.price) || 0;
    const stock = body.stock != null && Number.isFinite(Number(body.stock))
      ? Math.max(0, parseInt(String(body.stock), 10))
      : 0;

    const { data: maxRow } = await sb
      .from('products').select('id').order('id', { ascending: false }).limit(1).maybeSingle();
    const nextId = ((maxRow?.id as number) ?? 0) + 1;

    const copy: Record<string, unknown> = {
      id:             nextId,
      name:           src.name,
      price,
      original_price: Number(src.original_price) || price,
      cost:           Number(src.cost) || 0,
      category:       src.category,
      sub_category:   src.sub_category ?? null,
      icon:           src.icon ?? '📦',
      stock,
      sku:            src.sku ?? '',
      supplier_id:    supplierId,          // ← the copying store OWNS this row
      rating: 0, reviews: 0, sold: 0,      // fresh listing, no borrowed history
      description:    src.description ?? '',
      barcode:        src.barcode ?? null, // identifies the product itself
      tags:           Array.isArray(src.tags) ? src.tags : [],
      brand:          src.brand ?? null,
      image_url:      src.image_url ?? null,
      image_urls:     Array.isArray(src.image_urls) ? src.image_urls : [],
      price_tiers:    Array.isArray(src.price_tiers) ? src.price_tiers : [],
      is_b2b:         Boolean(src.is_b2b ?? false),
      moq:            (src.moq as number) ?? 1,
      tax_mode:       src.tax_mode ?? 'none',
      copied_from_product_id: productId,
    };

    const { data, error } = await sb.from('products').insert(copy).select().single();
    if (error) {
      if (isMissingColumnError(error)) {
        return NextResponse.json(
          { error: 'Product copying not enabled yet (run migration_v4_0.sql)', needsMigration: true },
          { status: 501 },
        );
      }
      throw error;
    }

    pingRealtime(['catalog']); // the new listing shows up everywhere immediately
    return NextResponse.json(mapCopy(data), { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: errMsg(e) }, { status: 500 });
  }
}

function mapCopy(p: Record<string, unknown>) {
  return {
    id:            p.id,
    name:          p.name,
    price:         p.price,
    originalPrice: p.original_price,
    category:      p.category,
    stock:         p.stock,
    sku:           p.sku,
    supplierId:    p.supplier_id ?? null,
    imageUrl:      p.image_url ?? null,
    imageUrls:     p.image_urls ?? [],
    copiedFromProductId: p.copied_from_product_id ?? null,
  };
}
