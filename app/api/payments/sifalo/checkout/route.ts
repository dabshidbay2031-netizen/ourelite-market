import { NextResponse } from 'next/server';
import { createSifaloCheckout } from '@/lib/payments/sifalo';
import { rateLimit, clientIp } from '@/lib/rateLimit';

/**
 * POST /api/payments/sifalo/checkout
 * Body: { amount, returnUrl, orderId? }
 *
 * Starts a Sifalo hosted-checkout session and returns the pay.sifalo.com URL to
 * redirect the customer to. Credentials stay server-side. `returnUrl` must be an
 * absolute http(s) URL carrying ?order_id=<ref> so the customer comes back here.
 */
export async function POST(req: Request) {
  const rl = rateLimit(`sifalo-checkout:${clientIp(req)}`, 15, 60_000);
  if (!rl.ok) return NextResponse.json({ error: 'Too many attempts. Please wait a moment.' },
    { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const amount    = Number(body.amount);
  const returnUrl = String(body.returnUrl ?? '').trim();
  const orderId   = body.orderId ? String(body.orderId) : undefined;

  if (!Number.isFinite(amount) || amount <= 0)
    return NextResponse.json({ error: 'amount must be a positive number' }, { status: 400 });
  if (!/^https?:\/\//i.test(returnUrl))
    return NextResponse.json({ error: 'returnUrl must be an absolute URL' }, { status: 400 });

  const result = await createSifaloCheckout({ amount, returnUrl, orderId });
  return NextResponse.json(result);
}
