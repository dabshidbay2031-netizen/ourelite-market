import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';

function mapProfile(p: Record<string, unknown>) {
  return {
    id:        p.id,
    fullName:  p.full_name  ?? '',
    phone:     p.phone      ?? '',
    avatar:    p.avatar     ?? '👤',
    verified:  p.verified   ?? false,
    createdAt: p.created_at ?? '',
  };
}

/**
 * PATCH /api/profile/[id]
 * Updates a user profile by Firebase UID.
 * Uses the service-role admin client — no Supabase auth token needed.
 * Firebase handles authentication on the client side.
 */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const body = await req.json();

  const updates: Record<string, unknown> = {};
  if (body.fullName !== undefined) updates.full_name = String(body.fullName).trim();
  if (body.phone    !== undefined) updates.phone     = String(body.phone).trim();
  if (body.avatar   !== undefined) updates.avatar    = String(body.avatar).trim();

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  }

  const { data, error } = await getSupabaseAdmin()
    .from('profiles')
    .update(updates)
    .eq('id', params.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(mapProfile(data));
}

/**
 * GET /api/profile/[id]
 * Fetch a profile by Firebase UID directly (alternative to ?userId= query param).
 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const { data, error } = await getSupabaseAdmin()
    .from('profiles')
    .select('*')
    .eq('id', params.id)
    .single();

  if (error || !data) return NextResponse.json(null, { status: 404 });
  return NextResponse.json(mapProfile(data));
}
