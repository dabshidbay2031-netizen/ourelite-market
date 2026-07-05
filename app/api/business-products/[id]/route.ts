import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { requireClaimOwner } from '@/lib/apiAuth';

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

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }

  const { data, error } = await getSupabaseAdmin()
    .from('business_products')
    .update(updates)
    .eq('id', id)
    .select('*, products(*)')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const row = data as Record<string, unknown>;
  return NextResponse.json({
    id:          row.id,
    supplierId:  row.supplier_id,
    productId:   row.product_id,
    customPrice: row.custom_price,
    stockQty:    row.stock_qty,
    moq:         (row.moq as number) ?? 1,
    isActive:    row.is_active,
    createdAt:   row.created_at,
    product:     row.products ?? null,
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
  return NextResponse.json({ success: true });
}
