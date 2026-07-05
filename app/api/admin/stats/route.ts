import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { sumRevenue } from '@/lib/revenue';
import { requireAdmin } from '@/lib/apiAuth';

function mapOrder(o: Record<string, unknown>) {
  return {
    id:            o.id,
    customerName:  o.customer_name,
    customerPhone: o.customer_phone,
    items:         o.items,
    subtotal:      o.subtotal,
    discount:      o.discount,
    total:         o.total,
    paymentMethod: o.payment_method,
    status:        o.status,
    createdAt:     o.created_at,
  };
}

const sb = () => getSupabaseAdmin();

async function getCount(table: string, filter?: { col: string; val: string }): Promise<number> {
  try {
    const base = sb().from(table).select('*', { count: 'exact', head: true });
    const query = filter ? base.eq(filter.col, filter.val) : base;
    const { count } = await query;
    return count ?? 0;
  } catch { return 0; }
}

async function getRevenue(): Promise<number> {
  try {
    // status included so deleted/cancelled/refunded money never counts
    const { data } = await sb().from('orders').select('total, status');
    return sumRevenue((data ?? []) as { total: number; status: string }[]);
  } catch { return 0; }
}

async function getRecentOrders(): Promise<ReturnType<typeof mapOrder>[]> {
  try {
    const { data } = await sb().from('orders')
      .select('*').order('created_at', { ascending: false }).limit(8);
    return ((data ?? []) as Record<string, unknown>[]).map(mapOrder);
  } catch { return []; }
}

export async function GET(req: Request) {
  const denied = await requireAdmin(req);
  if (denied) return denied;

  const [
    totalBusinesses,
    totalSuppliers,
    totalProducts,
    totalUsers,
    pendingVerifications,
    totalOrders,
    totalRevenue,
    recentOrders,
  ] = await Promise.all([
    getCount('suppliers', { col: 'account_type', val: 'business' }),
    getCount('suppliers', { col: 'account_type', val: 'supplier' }),
    getCount('products'),
    getCount('profiles'),
    getCount('verification_requests', { col: 'status', val: 'pending' }),
    getCount('orders'),
    getRevenue(),
    getRecentOrders(),
  ]);

  return NextResponse.json({
    totalBusinesses,
    totalSuppliers,
    totalProducts,
    totalOrders,
    totalRevenue,
    totalUsers,
    pendingVerifications,
    recentOrders,
  });
}
