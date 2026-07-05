import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { errMsg, isMissingTableError } from '@/lib/apiHelpers';
import { getAuthUser, ownsStoreOrAdmin } from '@/lib/apiAuth';

/**
 * GET /api/agent/stats?agentId=<supplier id>
 *
 * Aggregates a field agent's registry performance — what drives their
 * commission (see lib/agentCommission). All derived from existing data:
 *   • products they registered  → products.supplier_id === agentId
 *   • stores they reached        → distinct business_products.supplier_id whose
 *                                  product_id is one of those products (a store
 *                                  stocking the agent's product = a converted lead)
 */
export async function GET(req: Request) {
  const agentId = new URL(req.url).searchParams.get('agentId');
  if (!agentId) return NextResponse.json({ error: 'agentId required' }, { status: 400 });
  const id = parseInt(agentId, 10);
  if (Number.isNaN(id)) return NextResponse.json({ error: 'invalid agentId' }, { status: 400 });

  // These are the agent's private performance/commission figures — only the
  // agent themselves (or an admin) may read them, not any anon enumerating ids.
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await ownsStoreOrAdmin(user.id, id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const sb = getSupabaseAdmin();

  try {
    // 1. The agent's registered products
    const { data: prods, error: pErr } = await sb
      .from('products').select('id, price, stock, sold').eq('supplier_id', id);
    if (pErr) throw pErr;

    const products = prods ?? [];
    const productIds = products.map(p => p.id as number);

    const productsRegistered = products.length;
    const inStock   = products.filter(p => (p.stock as number) > 0).length;
    const totalUnits = products.reduce((s, p) => s + (Number(p.stock) || 0), 0);
    const everSold  = products.filter(p => (Number(p.sold) || 0) > 0).length;
    const unitsSold = products.reduce((s, p) => s + (Number(p.sold) || 0), 0);
    const soldRevenue = products.reduce((s, p) => s + (Number(p.price) || 0) * (Number(p.sold) || 0), 0);

    // 2. Stores stocking those products (converted leads)
    let stores: { id: number; name: string; icon: string; productCount: number }[] = [];
    if (productIds.length > 0) {
      const { data: claims, error: cErr } = await sb
        .from('business_products')
        .select('supplier_id, product_id, suppliers(id, name, icon)')
        .in('product_id', productIds)
        .eq('is_active', true);
      if (cErr) throw cErr;

      const byStore = new Map<number, { id: number; name: string; icon: string; productCount: number }>();
      for (const row of claims ?? []) {
        const sup = (row as Record<string, unknown>).suppliers as { id: number; name: string; icon: string } | null;
        const sid = (row as Record<string, unknown>).supplier_id as number;
        if (sid === id) continue; // ignore the agent claiming their own product
        const key = sup?.id ?? sid;
        const existing = byStore.get(key);
        if (existing) existing.productCount += 1;
        else byStore.set(key, { id: key, name: sup?.name ?? `Store #${sid}`, icon: sup?.icon ?? '🏪', productCount: 1 });
      }
      stores = Array.from(byStore.values()).sort((a, b) => b.productCount - a.productCount);
    }

    return NextResponse.json({
      productsRegistered, inStock, totalUnits, everSold, unitsSold, soldRevenue,
      storesReached: stores.length,
      stores,
    });
  } catch (e) {
    // business_products table may not exist yet → still return product stats
    if (isMissingTableError(e)) {
      const { data: prods } = await sb
        .from('products').select('id, price, stock, sold').eq('supplier_id', id);
      const products = prods ?? [];
      return NextResponse.json({
        productsRegistered: products.length,
        inStock:   products.filter(p => (p.stock as number) > 0).length,
        totalUnits: products.reduce((s, p) => s + (Number(p.stock) || 0), 0),
        everSold:  products.filter(p => (Number(p.sold) || 0) > 0).length,
        unitsSold: products.reduce((s, p) => s + (Number(p.sold) || 0), 0),
        soldRevenue: products.reduce((s, p) => s + (Number(p.price) || 0) * (Number(p.sold) || 0), 0),
        storesReached: 0,
        stores: [],
      });
    }
    return NextResponse.json({ error: errMsg(e) }, { status: 500 });
  }
}
