import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { isMissingColumnError } from '@/lib/apiHelpers';
import { requireSelf } from '@/lib/apiAuth';

function mapProfile(p: Record<string, unknown>) {
  return {
    id:        p.id,
    fullName:  p.full_name  ?? '',
    phone:     p.phone      ?? '',
    avatar:    p.avatar     ?? '👤',
    avatarUrl: p.avatar_url ?? null,
    bio:       p.bio        ?? '',
    verified:  p.verified   ?? false,
    createdAt: p.created_at ?? '',
  };
}

/**
 * PATCH /api/profile/[id]
 * Updates a user profile by Supabase auth UID.
 * Uses the service-role admin client — bypasses RLS for the write.
 * Supabase Auth handles authentication on the client side.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = (await params).id;
  const denied = await requireSelf(req, id);
  if (denied) return denied;

  const body = await req.json();

  const updates: Record<string, unknown> = {};
  if (body.fullName  !== undefined) updates.full_name  = String(body.fullName).trim();
  if (body.phone     !== undefined) updates.phone      = String(body.phone).trim();
  if (body.avatar    !== undefined) updates.avatar     = String(body.avatar).trim();
  if (body.avatarUrl !== undefined) updates.avatar_url = body.avatarUrl ?? null;
  if (body.bio       !== undefined) updates.bio        = String(body.bio).trim();

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  }

  let { data, error } = await getSupabaseAdmin()
    .from('profiles')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  // Pre-v3.1 DB without avatar_url/bio columns — drop them and retry.
  if (error && isMissingColumnError(error)) {
    delete updates.avatar_url;
    delete updates.bio;
    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'avatar_url/bio require the v3.1 migration' }, { status: 400 });
    }
    ({ data, error } = await getSupabaseAdmin()
      .from('profiles')
      .update(updates)
      .eq('id', id)
      .select()
      .single());
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(mapProfile(data));
}

/**
 * GET /api/profile/[id]
 * Fetch a profile by Supabase auth UID directly (alternative to ?userId= query param).
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { data, error } = await getSupabaseAdmin()
    .from('profiles')
    .select('*')
    .eq('id', (await params).id)
    .single();

  if (error || !data) return NextResponse.json(null, { status: 404 });
  return NextResponse.json(mapProfile(data));
}
