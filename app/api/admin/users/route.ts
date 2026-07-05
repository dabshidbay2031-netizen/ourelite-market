import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { requireAdmin } from '@/lib/apiAuth';

export async function GET(req: Request) {
  const denied = await requireAdmin(req);
  if (denied) return denied;

  const { data, error } = await getSupabaseAdmin()
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const users = (data ?? []).map((p: Record<string, unknown>) => ({
    id:        p.id,
    fullName:  p.full_name  ?? '',
    phone:     p.phone      ?? '',
    avatar:    p.avatar     ?? '👤',
    verified:  p.verified   ?? false,
    createdAt: p.created_at ?? '',
  }));

  return NextResponse.json(users);
}
