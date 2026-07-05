import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { errMsg, isMissingTableError } from '@/lib/apiHelpers';
import { getAuthUser } from '@/lib/apiAuth';

function mapAddr(a: Record<string, unknown>) {
  return {
    id:        a.id,
    userId:    a.user_id,
    label:     a.label     ?? 'My Location',
    latitude:  a.latitude  ?? null,
    longitude: a.longitude ?? null,
    notes:     a.notes     ?? '',
    createdAt: a.created_at,
  };
}

/** GET /api/addresses?userId=X — your own saved locations only (GPS = PII). */
export async function GET(req: Request) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const userId = searchParams.get('userId');
  if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 });
  if (userId !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  try {
    const { data, error } = await getSupabaseAdmin()
      .from('addresses')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return NextResponse.json(data.map(mapAddr));
  } catch (e) {
    if (isMissingTableError(e)) return NextResponse.json([]);
    return NextResponse.json({ error: errMsg(e) }, { status: 500 });
  }
}

/** POST /api/addresses — save GPS location (for yourself only) */
export async function POST(req: Request) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { userId, label, latitude, longitude, notes } = body;
  if (!userId || latitude == null || longitude == null) {
    return NextResponse.json({ error: 'userId, latitude, longitude required' }, { status: 400 });
  }
  if (String(userId) !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  try {
    const { data, error } = await getSupabaseAdmin()
      .from('addresses')
      .insert({
        user_id:   userId,
        label:     label ?? 'My Location',
        latitude:  parseFloat(latitude),
        longitude: parseFloat(longitude),
        notes:     notes ?? '',
      })
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json(mapAddr(data as Record<string, unknown>), { status: 201 });
  } catch (e) {
    if (isMissingTableError(e)) {
      return NextResponse.json({ error: 'addresses table missing — run migration_v3_1.sql', needsMigration: true }, { status: 500 });
    }
    return NextResponse.json({ error: errMsg(e) }, { status: 500 });
  }
}
