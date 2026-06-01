import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { errMsg, isMissingTableError } from '@/lib/apiHelpers';

function mapAddr(a: Record<string, unknown>) {
  return {
    id:        a.id,
    userId:    a.user_id,
    label:     a.label,
    fullName:  a.full_name,
    street:    a.street,
    city:      a.city,
    country:   a.country,
    phone:     a.phone,
    isDefault: a.is_default,
    createdAt: a.created_at,
  };
}

/** GET /api/addresses?userId=X */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get('userId');
  if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 });

  try {
    const { data, error } = await getSupabaseAdmin()
      .from('addresses')
      .select('*')
      .eq('user_id', userId)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: false });
    if (error) throw error;
    return NextResponse.json(data.map(mapAddr));
  } catch (e) {
    if (isMissingTableError(e)) return NextResponse.json([]);
    return NextResponse.json({ error: errMsg(e) }, { status: 500 });
  }
}

/** POST /api/addresses */
export async function POST(req: Request) {
  const body = await req.json();
  const { userId, label, fullName, street, city, country, phone, isDefault } = body;
  if (!userId || !street || !city) {
    return NextResponse.json({ error: 'userId, street, city required' }, { status: 400 });
  }

  // If setting as default, clear other defaults first
  if (isDefault) {
    await getSupabaseAdmin()
      .from('addresses')
      .update({ is_default: false })
      .eq('user_id', userId);
  }

  try {
    const { data, error } = await getSupabaseAdmin()
      .from('addresses')
      .insert({
        user_id:    userId,
        label:      label      ?? 'Home',
        full_name:  fullName   ?? '',
        street:     street     ?? '',
        city:       city       ?? '',
        country:    country    ?? 'Somalia',
        phone:      phone      ?? '',
        is_default: isDefault  ?? false,
      })
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json(mapAddr(data as Record<string, unknown>), { status: 201 });
  } catch (e) {
    if (isMissingTableError(e)) {
      return NextResponse.json({ error: 'addresses table missing — run schema_all.sql', needsMigration: true }, { status: 500 });
    }
    return NextResponse.json({ error: errMsg(e) }, { status: 500 });
  }
}
