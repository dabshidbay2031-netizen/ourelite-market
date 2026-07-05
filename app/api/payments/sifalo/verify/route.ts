import { NextResponse } from 'next/server';
import { verifySifaloPayment } from '@/lib/payments/sifalo';
import { rateLimit, clientIp } from '@/lib/rateLimit';

/**
 * POST /api/payments/sifalo/verify
 * Body: { sid?, orderId? }  — sid preferred.
 * Used to poll a pending (603) charge until it settles.
 */
export async function POST(req: Request) {
  const rl = rateLimit(`sifalo-verify:${clientIp(req)}`, 30, 60_000);
  if (!rl.ok) return NextResponse.json({ error: 'Too many attempts. Please wait a moment.' },
    { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const sid     = body.sid ? String(body.sid) : undefined;
  const orderId = body.orderId ? String(body.orderId) : undefined;
  if (!sid && !orderId) return NextResponse.json({ error: 'sid or orderId is required' }, { status: 400 });

  const result = await verifySifaloPayment({ sid, orderId });
  return NextResponse.json(result);
}
