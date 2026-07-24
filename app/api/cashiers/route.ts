import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { requireStaff, resolveStoreOwner } from '@/lib/apiAuth';
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
  // Staff records carry phone numbers — require auth. Managing/viewing staff is
  // the 'staff' privilege; the list is always scoped to the CALLER'S own store
  // (an admin may target any via ?businessId=).
  { const denied = await requireStaff(req, 'staff'); if (denied) return denied; }
  const acting = await resolveStoreOwner(req);
  if (!acting) return NextResponse.json({ error: 'Forbidden — store access required' }, { status: 403 });

  const requested = new URL(req.url).searchParams.get('businessId');
  const businessId = acting.isAdmin && requested ? requested : acting.ownerUserId;

  const { data, error } = await getSupabaseAdmin()
    .from('cashiers')
    .select('id, business_id, name, phone, privileges, is_active, last_login_at, created_at')
    .eq('business_id', businessId)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json((data ?? []).map(c => mapCashier(c as Record<string, unknown>)));
}

export async function POST(req: Request) {
  // Managing staff requires the 'staff' privilege (owner/admin always have it).
  { const denied = await requireStaff(req, 'staff'); if (denied) return denied; }
  const acting = await resolveStoreOwner(req);
  if (!acting) return NextResponse.json({ error: 'Forbidden — store access required' }, { status: 403 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { name, phone, password, privileges } = body as Record<string, string>;
  if (!name?.trim() || !phone?.trim() || !password) {
    return NextResponse.json({ error: 'name, phone, and password are required' }, { status: 400 });
  }
  if (password.length < 4) {
    return NextResponse.json({ error: 'Password must be at least 4 characters' }, { status: 400 });
  }

  // The store is ALWAYS the caller's own — never taken from the body, so a
  // staff-privileged cashier can't plant a cashier in another business. Admins
  // may target a specific store via ?businessId= would be their own tooling;
  // here we bind to the acting store.
  const businessId = acting.ownerUserId;

  // A cashier granting privileges can't hand out powers they don't hold
  // themselves (no privilege escalation). The owner/admin can grant anything.
  let privArray = Array.isArray(privileges) ? privileges : DEFAULT_PRIVILEGES;
  if (acting.isCashier && acting.privileges) {
    const allowed = new Set(acting.privileges);
    privArray = privArray.filter(p => allowed.has(p));
  }

  const passwordHash = await hashPassword(password);

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
