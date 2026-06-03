import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';

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

export async function GET() {
  const sb = getSupabaseAdmin();

  const [
    { count: totalBusinesses },
    { count: totalSuppliers },
    { count: totalProducts },
    { count: totalUsers },
    { count: pendingVerifications },
    ordersResult,
    revenueResult,
    recentOrdersResult,
  ] = await Promise.all([
    sb.from('suppliers').select('*', { count: 'exact', head: true }).eq('account_type', 'business'),
    sb.from('suppliers').select('*', { count: 'exact', head: true }).eq('account_type', 'supplier'),
    sb.from('products').select('*', { count: 'exact', head: true }),
    sb.from('profiles').select('*', { count: 'exact', head: true }),
    sb.from('verification_requests').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
    sb.from('orders').select('*', { count: 'exact', head: true }),
    sb.from('orders').select('total'),
    sb.from('orders').select('*').order('created_at', { ascending: false }).limit(8),
  ]);

  const totalRevenue = ((revenueResult.data ?? []) as Record<string, unknown>[])
    .reduce((sum, o) => sum + (Number(o.total) || 0), 0);

  const recentOrders = ((recentOrdersResult.data ?? []) as Record<string, unknown>[])
    .map(mapOrder);

  return NextResponse.json({
    totalBusinesses:      totalBusinesses  ?? 0,
    totalSuppliers:       totalSuppliers   ?? 0,
    totalProducts:        totalProducts    ?? 0,
    totalOrders:          ordersResult.count ?? 0,
    totalRevenue,
    totalUsers:           totalUsers       ?? 0,
    pendingVerifications: pendingVerifications ?? 0,
    recentOrders,
  });
}
