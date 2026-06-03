import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';

/**
 * GET /api/admin/check?uid=USER_UID
 * Returns { role: 'admin' | 'semi_admin' | null }
 *
 * Bootstrap fallback: if the admins table has 0 rows AND the UID matches
 * BOOTSTRAP_ADMIN_UID env var, auto-insert as admin (first-run only).
 */
export async function GET(req: Request) {
  const uid = new URL(req.url).searchParams.get('uid');
  if (!uid) return NextResponse.json({ role: null });

  const sb = getSupabaseAdmin();

  try {
    // Check DB
    const { data, error } = await sb
      .from('admins')
      .select('role')
      .eq('user_id', uid)
      .maybeSingle();

    if (error) throw error;
    if (data) return NextResponse.json({ role: data.role as string });

    // Bootstrap: if table is empty and UID matches env var, auto-seed as admin
    const bootstrap = process.env.BOOTSTRAP_ADMIN_UID ?? '';
    if (bootstrap && bootstrap === uid) {
      const { count } = await sb.from('admins').select('*', { count: 'exact', head: true });
      if ((count ?? 0) === 0) {
        await sb.from('admins').insert({ user_id: uid, role: 'admin', name: 'Owner' });
        return NextResponse.json({ role: 'admin' });
      }
    }

    return NextResponse.json({ role: null });
  } catch {
    return NextResponse.json({ role: null });
  }
}
