import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { errMsg, isMissingTableError } from '@/lib/apiHelpers';

/**
 * POST /api/coupons/validate
 * Body: { code, orderTotal }
 * Returns: { valid, coupon, discountAmount, message }
 */
export async function POST(req: Request) {
  const { code, orderTotal } = await req.json();
  if (!code) return NextResponse.json({ valid: false, message: 'No code provided' });

  // Reject missing/garbage totals — `undefined < minOrder` is false, which
  // previously let invalid requests through and produced NaN discounts.
  const total = Number(orderTotal);
  if (!Number.isFinite(total) || total < 0) {
    return NextResponse.json({ valid: false, message: 'Invalid order total' });
  }

  try {
    const { data, error } = await getSupabaseAdmin()
      .from('coupons')
      .select('*')
      .eq('code', String(code).toUpperCase().trim())
      .eq('active', true)
      .maybeSingle();

    if (error) throw error;
    if (!data)  return NextResponse.json({ valid: false, message: 'Coupon code not found' });

    const c = data as Record<string, unknown>;

    // Check expiry
    if (c.expires_at && new Date(c.expires_at as string) < new Date()) {
      return NextResponse.json({ valid: false, message: 'Coupon has expired' });
    }
    // Check max uses
    if (c.max_uses != null && (c.used_count as number) >= (c.max_uses as number)) {
      return NextResponse.json({ valid: false, message: 'Coupon usage limit reached' });
    }
    // Check minimum order
    const minOrder = parseFloat(String(c.min_order ?? 0));
    if (total < minOrder) {
      return NextResponse.json({ valid: false, message: `Minimum order $${minOrder.toFixed(2)} required` });
    }

    // Calculate discount
    const value        = parseFloat(String(c.value));
    const discountAmount = c.type === 'percent'
      ? Math.min((total * value) / 100, total)
      : Math.min(value, total);

    return NextResponse.json({
      valid: true,
      coupon: {
        id:    c.id,
        code:  c.code,
        type:  c.type,
        value: c.value,
      },
      discountAmount: Math.round(discountAmount * 100) / 100,
      message: c.type === 'percent'
        ? `${value}% off applied!`
        : `$${value.toFixed(2)} off applied!`,
    });
  } catch (e) {
    if (isMissingTableError(e)) return NextResponse.json({ valid: false, message: 'Coupons not yet configured' });
    return NextResponse.json({ valid: false, message: errMsg(e) });
  }
}
