import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { getAuthUser, isAdminUser } from '@/lib/apiAuth';
import { errMsg, isMissingTableError } from '@/lib/apiHelpers';

function makeCode(userId: string): string {
  // Deterministic but human-readable: MG + first 4 alphanum chars of UID + 4 random
  const base = userId.replace(/[^a-z0-9]/gi, '').slice(0, 4).toUpperCase().padEnd(4, 'X');
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `MG${base}${rand}`;
}

/**
 * GET /api/referrals?userId=X — get or create THIS user's referral code.
 *
 * Auth required: the caller may only fetch/mint their OWN code (or an admin
 * may fetch anyone's). Previously any unauthenticated caller could mint a
 * $5-credit row for any uid — a code-farming / self-referral door.
 */
export async function GET(req: Request) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized — sign in required' }, { status: 401 });

  const requested = new URL(req.url).searchParams.get('userId');
  // A caller only ever gets their own code; an admin may target a specific uid.
  let userId = user.id;
  if (requested && requested !== user.id) {
    if (!(await isAdminUser(user.id))) {
      return NextResponse.json({ error: 'Forbidden — not your account' }, { status: 403 });
    }
    userId = requested;
  }

  try {
    // Existing unredeemed code for this user?
    const { data: existing } = await getSupabaseAdmin()
      .from('referrals')
      .select('*')
      .eq('referrer_id', userId)
      .is('referred_id', null)
      .limit(1)
      .maybeSingle();

    if (existing) return NextResponse.json(existing);

    // Create a new code (retry on collision)
    let code = makeCode(userId);
    for (let i = 0; i < 3; i++) {
      const { data, error } = await getSupabaseAdmin()
        .from('referrals')
        .insert({ code, referrer_id: userId, credit: 5.00 })
        .select()
        .single();
      if (!error) return NextResponse.json(data, { status: 201 });
      code = makeCode(userId + i);
    }
    return NextResponse.json({ error: 'Could not generate referral code' }, { status: 500 });
  } catch (e) {
    if (isMissingTableError(e)) return NextResponse.json({ code: null, noTable: true });
    return NextResponse.json({ error: errMsg(e) }, { status: 500 });
  }
}

/**
 * POST /api/referrals — redeem a referral code (called once, at signup).
 * Body: { code }.
 *
 * The person redeeming is always the AUTHENTICATED caller — you can't redeem
 * on someone else's behalf, and you can't redeem your OWN code (self-referral).
 */
export async function POST(req: Request) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized — sign in required' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const code = typeof body.code === 'string' ? body.code.trim().toUpperCase() : '';
  if (!code) return NextResponse.json({ error: 'code required' }, { status: 400 });

  const referredUserId = user.id; // redeem AS yourself — never taken from the body

  try {
    const sb = getSupabaseAdmin();

    // Look up the code first so we can reject a self-referral WITHOUT consuming it.
    const { data: refRow } = await sb
      .from('referrals')
      .select('referrer_id, redeemed')
      .eq('code', code)
      .maybeSingle();

    if (!refRow) return NextResponse.json({ valid: false, message: 'Invalid or already used code' });
    if (String(refRow.referrer_id) === referredUserId) {
      return NextResponse.json({ valid: false, message: 'You cannot use your own referral code' }, { status: 400 });
    }

    // Atomic claim: only succeeds while still unredeemed (blocks double-redeem).
    const { data, error } = await sb
      .from('referrals')
      .update({ referred_id: referredUserId, redeemed: true })
      .eq('code', code)
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
