import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { errMsg, isUUIDError, isMissingColumnError } from '@/lib/apiHelpers';

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

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get('userId');
  if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 });

  const { data, error } = await getSupabaseAdmin()
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (error || !data) return NextResponse.json(null);
  return NextResponse.json(mapProfile(data as Record<string, unknown>));
}

export async function POST(req: Request) {
  const body = await req.json();
  const { id, fullName, phone, avatar, avatarUrl, bio } = body;
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const payload: Record<string, unknown> = {
    id,
    full_name:  fullName  ?? '',
    phone:      phone     ?? '',
    avatar:     avatar    ?? '👤',
    avatar_url: avatarUrl ?? null,
    bio:        bio       ?? '',
  };

  let { data, error } = await getSupabaseAdmin()
    .from('profiles')
    .upsert(payload)
    .select()
    .single();

  // Pre-v3.1 DB without avatar_url/bio columns — retry without them so the
  // app still works against an un-migrated schema.
  if (error && isMissingColumnError(error)) {
    delete payload.avatar_url;
    delete payload.bio;
    ({ data, error } = await getSupabaseAdmin()
      .from('profiles')
      .upsert(payload)
      .select()
      .single());
  }

  if (error) {
    // UUID type error = schema not migrated yet — return a helpful message
    if (isUUIDError(error)) {
      return NextResponse.json({
        error: 'Schema not migrated: profiles.id must be TEXT. Run supabase/migration.sql in your Supabase SQL editor.',
        needsMigration: true,
      }, { status: 500 });
    }
    return NextResponse.json({ error: errMsg(error) }, { status: 500 });
  }
  return NextResponse.json(mapProfile(data as Record<string, unknown>), { status: 201 });
}
