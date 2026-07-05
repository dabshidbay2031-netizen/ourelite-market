import { NextResponse } from 'next/server';
import { initiateSifaloPayment } from '@/lib/payments/sifalo';
import { rateLimit, clientIp } from '@/lib/rateLimit';
import type { SifaloGateway } from '@/lib/types';

const GATEWAYS: SifaloGateway[] = ['waafi', 'edahab', 'pbwallet'];

/**
 * POST /api/payments/sifalo/initiate
 * Body: { account, gateway, amount, orderId? }
 *
 * Runs server-side so Sifalo credentials never reach the browser. Returns a
 * normalized { status, sid, code, message, mock }. The client should only place
 * the order once status === 'success' (or after a successful verify on pending).
 */
export async function POST(req: Request) {
  const rl = rateLimit(`sifalo-initiate:${clientIp(req)}`, 15, 60_000);
  if (!rl.ok) return NextResponse.json({ error: 'Too many attempts. Please wait a moment.' },
    { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const account = String(body.account ?? '').trim();
  const gateway = String(body.gateway ?? '') as SifaloGateway;
  const amount  = Number(body.amount);
  const orderId = body.orderId ? String(body.orderId) : undefined;

  if (!account)                       return NextResponse.json({ error: 'account (wallet number) is required' }, { status: 400 });
  if (!GATEWAYS.includes(gateway))    return NextResponse.json({ error: `gateway must be one of ${GATEWAYS.join(', ')}` }, { status: 400 });
  if (!Number.isFinite(amount) || amount <= 0)
    return NextResponse.json({ error: 'amount must be a positive number' }, { status: 400 });

  const result = await initiateSifaloPayment({ account, gateway, amount, orderId });
  // Always 200 — the normalized `status` tells the client what happened.
  return NextResponse.json(result);
}
