import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { requireClaimOwner } from '@/lib/apiAuth';
import { pingRealtime } from '@/lib/realtimeServer';

/**
 * PATCH /api/business-products/[id]
 * Update custom price, stock quantity, or active status.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const id = parseInt((await params).id, 10);
  { const denied = await requireClaimOwner(req, id); if (denied) return denied; }
  const body = await req.json();

  const updates: Record<string, unknown> = {};
  if (body.customPrice !== undefined) updates.custom_price = parseFloat(String(body.customPrice));
  if (body.stockQty    !== undefined) updates.stock_qty    = parseInt(String(body.stockQty), 10);
  if (body.moq         !== undefined) updates.moq          = Math.max(1, parseInt(String(body.moq), 10));
  if (body.isActive    !== undefined) updates.is_active    = Boolean(body.isActive);

  /* Per-store overrides — a claimed product is the store's to edit: photos,
     name, every detail. Sending null RESETS a field back to the catalog value,
     so `undefined` (absent) and `null` (reset) mean different things here.
     Reviews and barcode are never per-store, so they are not accepted. */
  const str   = (v: unknown) => (v === null ? null : String(v));
  const num   = (v: unknown) => (v === null ? null : parseFloat(String(v)));
  const arr   = (v: unknown) => (v === null ? null : (Array.isArray(v) ? v.map(String) : []));

  if (body.name          !== undefined) updates.name           = str(body.name);
  if (body.description   !== undefined) updates.description    = str(body.description);
  if (body.imageUrl      !== undefined) updates.image_url      = str(body.imageUrl);
  if (body.imageUrls     !== undefined) updates.image_urls     = arr(body.imageUrls);
  if (body.brand         !== undefined) updates.brand          = str(body.brand);
  if (body.category      !== undefined) updates.category       = str(body.category);
  if (body.subCategory   !== undefined) updates.sub_category   = str(body.subCategory);
  if (body.tags          !== undefined) updates.tags           = arr(body.tags);
  if (body.sku           !== undefined) updates.sku            = str(body.sku);
  if (body.originalPrice !== undefined) updates.original_price = num(body.originalPrice);
  if (body.cost          !== undefined) updates.cost           = num(body.cost);

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }

  // Mark the listing as customized the first time a catalog field is overridden.
  const OVERRIDE_COLS = ['name','description','image_url','image_urls','brand',
    'category','sub_category','tags','sku','original_price','cost'];
  if (OVERRIDE_COLS.some(c => c in updates)) updates.customized_at = new Date().toISOString();

  const { data, error } = await getSupabaseAdmin()
    .from('business_products')
    .update(updates)
    .eq('id', id)
    .select('*, products(*)')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  pingRealtime(['catalog']);

  const row = data as Record<string, unknown>;
  return NextResponse.json({
    id:           row.id,
    supplierId:   row.supplier_id,
    productId:    row.product_id,
    customPrice:  row.custom_price,
    stockQty:     row.stock_qty,
    moq:          (row.moq as number) ?? 1,
    isActive:     row.is_active,
    createdAt:    row.created_at,
    customizedAt: row.customized_at ?? null,
    overrides: {
      name:          row.name           ?? null,
      description:   row.description    ?? null,
      imageUrl:      row.image_url      ?? null,
      imageUrls:     row.image_urls     ?? null,
      brand:         row.brand          ?? null,
      category:      row.category       ?? null,
      subCategory:   row.sub_category   ?? null,
      tags:          row.tags           ?? null,
      sku:           row.sku            ?? null,
      originalPrice: row.original_price ?? null,
      cost:          row.cost           ?? null,
    },
    product:      row.products ?? null,
  });
}

/**
 * DELETE /api/business-products/[id]
 * Remove a product from a business's store.
 */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const id = parseInt((await params).id, 10);
  { const denied = await requireClaimOwner(req, id); if (denied) return denied; }
  const { error } = await getSupabaseAdmin()
    .from('business_products')
    .delete()
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  pingRealtime(['catalog']);
  return NextResponse.json({ success: true });
}
