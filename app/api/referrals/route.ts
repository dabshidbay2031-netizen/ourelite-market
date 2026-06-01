import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { errMsg, isMissingTableError } from '@/lib/apiHelpers';

function makeCode(userId: string): string {
  // Deterministic but human-readable: MG + first 4 alphanum chars of UID + 4 random
  const base    = userId.replace(/[^a-z0-9]/gi, '').slice(0, 4).toUpperCase().padEnd(4, 'X');
  const rand    = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `MG${base}${rand}`;
}

/** GET /api/referrals?userId=X — get or create referral code for this user */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get('userId');
  if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 });

  try {
    // Check if user already has a referral code
    const { data: existing } = await getSupabaseAdmin()
      .from('referrals')
      .select('*')
      .eq('referrer_id', userId)
      .is('referred_id', null)
      .limit(1)
      .maybeSingle();

    if (existing) return NextResponse.json(existing);

    // Create a new code
    let code = makeCode(userId);
    // Retry if collision
    for (let i = 0; i < 3; i++) {
      const { data, error } = await getSupabaseAdmin()
        .from('referrals')
        .insert({ code, referrer_id: userId, credit: 5.00 })
        .select()
        .single();
      if (!error) return NextResponse.json(data, { status: 201 });
      // Collision — try new code
      code = makeCode(userId + i);
    }
    return NextResponse.json({ error: 'Could not generate referral code' }, { status: 500 });
  } catch (e) {
    if (isMissingTableError(e)) return NextResponse.json({ code: null, noTable: true });
    return NextResponse.json({ error: errMsg(e) }, { status: 500 });
  }
}

/** POST /api/referrals/use — called at signup with referral code */
export async function POST(req: Request) {
  const { code, referredUserId } = await req.json();
  if (!code || !referredUserId) return NextResponse.json({ error: 'code and referredUserId required' }, { status: 400 });

  try {
    const { data, error } = await getSupabaseAdmin()
      .from('referrals')
      .update({ referred_id: referredUserId, redeemed: true })
      .eq('code', code.toUpperCase())
      .eq('redeemed', false)
      .select()
      .maybeSingle();

    if (error) throw error;
    if (!data)  return NextResponse.json({ valid: false, message: 'Invalid or already used code' });
    return NextResponse.json({ valid: true, credit: data.credit, referrerId: data.referrer_id });
  } catch (e) {
    if (isMissingTableError(e)) return NextResponse.json({ valid: false, message: 'Referrals not configured' });
    return NextResponse.json({ error: errMsg(e) }, { status: 500 });
  }
}
