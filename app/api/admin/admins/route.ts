import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';

function mapAdmin(r: Record<string, unknown>) {
  return {
    id:        r.id,
    userId:    r.user_id,
    role:      r.role,
    name:      r.name ?? '',
    email:     r.email ?? '',
    createdAt: r.created_at,
  };
}

/** GET /api/admin/admins — list all admins & semi-admins */
export async function GET() {
  try {
    const { data, error } = await getSupabaseAdmin()
      .from('admins')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return NextResponse.json((data ?? []).map(r => mapAdmin(r as Record<string, unknown>)));
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

/** POST /api/admin/admins — add a new admin or semi-admin */
export async function POST(req: Request) {
  const { userId, role, name, email } = await req.json();
  if (!userId || !role) {
    return NextResponse.json({ error: 'userId and role are required' }, { status: 400 });
  }
  if (role !== 'admin' && role !== 'semi_admin') {
    return NextResponse.json({ error: 'role must be admin or semi_admin' }, { status: 400 });
  }

  try {
    const { data, error } = await getSupabaseAdmin()
      .from('admins')
      .upsert({ user_id: userId, role, name: name?.trim() ?? '', email: email?.trim() ?? '' },
               { onConflict: 'user_id' })
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json(mapAdmin(data as Record<string, unknown>), { status: 201 });
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
