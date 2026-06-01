import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { PRODUCTS } from '@/lib/seed-data';

export async function GET() {
  try {
    const { data, error } = await getSupabaseAdmin()
      .from('products')
      .select('id, stock')
      .order('id');

    if (error) throw error;
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(PRODUCTS.map(p => ({ id: p.id, stock: p.stock })));
  }
}
