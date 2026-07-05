import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { requireStaff } from '@/lib/apiAuth';
import { hashPassword } from '@/lib/passwordHash';
import { DEFAULT_PRIVILEGES } from '@/lib/cashierPrivileges';

function mapCashier(c: Record<string, unknown>) {
  return {
    id:          c.id,
    businessId:  c.business_id,
    name:        c.name,
    phone:       c.phone,
    privileges:  c.privileges ?? DEFAULT_PRIVILEGES,
    isActive:    c.is_active !== false,
    lastLoginAt: c.last_login_at ?? null,
    createdAt:   c.created_at,
  };
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const businessId = searchParams.get('businessId');
  if (!businessId) return NextResponse.json({ error: 'businessId required' }, { status: 400 });

  const { data, error } = await getSupabaseAdmin()
    .from('cashiers')
    .select('id, business_id, name, phone, privileges, is_active, last_login_at, created_at')
    .eq('business_id', businessId)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json((data ?? []).map(c => mapCashier(c as Record<string, unknown>)));
}

export async function POST(req: Request) {
  { const denied = await requireStaff(req); if (denied) return denied; }
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { businessId, name, phone, password, privileges } = body as Record<string, string>;
  if (!businessId || !name?.trim() || !phone?.trim() || !password) {
    return NextResponse.json({ error: 'businessId, name, phone, and password are required' }, { status: 400 });
  }
  if (password.length < 4) {
    return NextResponse.json({ error: 'Password must be at least 4 characters' }, { status: 400 });
  }

  const passwordHash = await hashPassword(password);
  const privArray    = Array.isArray(privileges) ? privileges : DEFAULT_PRIVILEGES;

  const { data, error } = await getSupabaseAdmin()
    .from('cashiers')
    .insert({
      business_id:   businessId,
      name:          name.trim(),
      phone:         phone.trim(),
      password_hash: passwordHash,
      privileges:    privArray,
      is_active:     true,
    })
    .select('id, business_id, name, phone, privileges, is_active, last_login_at, created_at')
    .single();

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'A cashier with that phone number already exists' }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(mapCashier(data as Record<string, unknown>), { status: 201 });
}
