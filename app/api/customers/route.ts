import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { errMsg } from '@/lib/apiHelpers';

function map(c: Record<string, unknown>) {
  return {
    id:        String(c.id),
    name:      c.name      ?? '',
    phone:     c.phone     ?? '',
    email:     c.email     ?? '',
    address:   c.address   ?? '',
    notes:     c.notes     ?? '',
    createdAt: c.created_at ?? new Date().toISOString(),
  };
}

export async function GET() {
  try {
    const { data, error } = await getSupabaseAdmin()
      .from('customers')
      .select('*')
      .order('id', { ascending: false });
    if (error) throw error;
    return NextResponse.json(data.map(map));
  } catch {
    return NextResponse.json([]);
  }
}

export async function POST(req: Request) {
  const body = await req.json();
  const { name, phone, email, address, notes } = body;
  if (!name?.trim()) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }
  try {
    const { data, error } = await getSupabaseAdmin()
      .from('customers')
      .insert({
        name:    name.trim(),
        phone:   phone?.trim()   ?? '',
        email:   email?.trim()   ?? '',
        address: address?.trim() ?? '',
        notes:   notes?.trim()   ?? '',
      })
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json(map(data as Record<string, unknown>), { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: errMsg(e) }, { status: 500 });
  }
}
