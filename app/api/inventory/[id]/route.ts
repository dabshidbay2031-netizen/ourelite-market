import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { requireProductOwner } from '@/lib/apiAuth';
import { errMsg } from '@/lib/apiHelpers';

/**
 * PATCH /api/inventory/[id]
 *
 * Body (one of):
 *   { delta: number }  — atomic relative adjustment (preferred; race-free
 *                        via the adjust_stock() function on schema v2)
 *   { stock: number }  — absolute set (admin restock flows)
 *
 * Returns { id, stock } with the authoritative post-update value, or a
 * real error status — never a fake success.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = parseInt((await params).id, 10);
  if (Number.isNaN(id) || id <= 0) {
    return NextResponse.json({ error: 'Invalid product id' }, { status: 400 });
  }
  { const denied = await requireProductOwner(req, id); if (denied) return denied; }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const sb = getSupabaseAdmin();

  // ── Relative adjustment ────────────────────────────────────
  if (body.delta !== undefined) {
    const delta = Number(body.delta);
    if (!Number.isInteger(delta) || Math.abs(delta) > 100000) {
      return NextResponse.json({ error: 'delta must be an integer' }, { status: 400 });
    }

    // Atomic path (schema v2): single UPDATE with a row lock, clamped ≥ 0
    try {
      const { data, error } = await sb.rpc('adjust_stock', {
        p_product_id: id,
        p_delta:      delta,
      });
      if (!error && typeof data === 'number') {
        return NextResponse.json({ id, stock: data });
      }
      const code = String((error as Record<string, unknown> | null)?.code ?? '');
      const fnMissing = code === 'PGRST202' || code === '42883';
      if (!fnMissing && error) throw error;
    } catch (e) {
      const code = String((e as Record<string, unknown>)?.code ?? '');
      if (code !== 'PGRST202' && code !== '42883') {
        return NextResponse.json({ error: errMsg(e) }, { status: 500 });
      }
    }

    // Legacy fallback: read-modify-write (not race-free, but server-side)
    try {
      const { data: row, error: readErr } = await sb
        .from('products').select('stock').eq('id', id).maybeSingle();
      if (readErr) throw readErr;
      if (!row) return NextResponse.json({ error: 'Product not found' }, { status: 404 });

      const newStock = Math.max((row.stock as number) + delta, 0);
      const { error: writeErr } = await sb
        .from('products').update({ stock: newStock }).eq('id', id);
      if (writeErr) throw writeErr;
      return NextResponse.json({ id, stock: newStock });
    } catch (e) {
      return NextResponse.json({ error: errMsg(e) }, { status: 500 });
    }
  }

  // ── Absolute set ───────────────────────────────────────────
  const stock = Number(body.stock);
  if (!Number.isInteger(stock) || stock < 0 || stock > 100000000) {
    return NextResponse.json({ error: 'stock must be a non-negative integer' }, { status: 400 });
  }

  try {
    const { data, error } = await sb
      .from('products').update({ stock }).eq('id', id).select('stock').maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    return NextResponse.json({ id, stock: data.stock });
  } catch (e) {
    return NextResponse.json({ error: errMsg(e) }, { status: 500 });
  }
}
