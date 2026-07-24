import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { verifyPassword } from '@/lib/passwordHash';
import { rateLimit, clientIp } from '@/lib/rateLimit';
import { signCashierToken } from '@/lib/cashierAuth';

// Uniform failure response — never reveal whether the phone exists (anti-enumeration).
const BAD_CREDS = () => NextResponse.json({ error: 'Incorrect phone number or password' }, { status: 401 });

export async function POST(req: Request) {
  // Throttle brute-force: 8 attempts per minute per IP.
  const rl = rateLimit(`cashier-login:${clientIp(req)}`, 8, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Too many attempts. Try again shortly.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } });
  }

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const phone    = body.phone    ? String(body.phone).trim()    : '';
  const password = body.password ? String(body.password)        : '';

  if (!phone || !password) {
    return NextResponse.json({ error: 'Phone and password are required' }, { status: 400 });
  }

  // Look up cashier by phone (across all businesses — phone must be unique globally per business,
  // but two different businesses can reuse the same phone; we match on phone and return
  // whichever active cashier matches first — production would scope by businessId)
  const { data: rows, error } = await getSupabaseAdmin()
    .from('cashiers')
    .select('id, business_id, name, phone, password_hash, privileges, is_active')
    .eq('phone', phone)
    .eq('is_active', true);

  if (error) return NextResponse.json({ error: 'Login failed' }, { status: 500 });
  if (!rows || rows.length === 0) {
    return BAD_CREDS(); // same message as wrong-password — no account enumeration
  }

  // Try each matching cashier (rare: same phone at two businesses)
  for (const row of rows as Record<string, unknown>[]) {
    const ok = await verifyPassword(password, row.password_hash as string);
    if (ok) {
      // Update last_login_at
      await getSupabaseAdmin()
        .from('cashiers').update({ last_login_at: new Date().toISOString() }).eq('id', row.id);

      return NextResponse.json({
        id:         row.id,
        businessId: row.business_id,
        name:       row.name,
        phone:      row.phone,
        privileges: row.privileges ?? [],
        loginAt:    new Date().toISOString(),
        // Signed credential the client sends back as X-Cashier-Token so staff
        // API calls authenticate (cashiers have no Supabase JWT).
        token:      signCashierToken(String(row.id)),
      });
    }
  }

  return BAD_CREDS();
}
