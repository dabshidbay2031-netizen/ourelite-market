import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';

/**
 * GET /api/health — uptime/readiness probe for monitoring (UptimeRobot, etc.).
 * Reports app liveness and a lightweight DB connectivity check. Never throws;
 * returns 200 when the app is up, with `db: 'up' | 'down'` for the database.
 */
export async function GET() {
  let db: 'up' | 'down' = 'down';
  try {
    const { error } = await getSupabaseAdmin()
      .from('products').select('id', { head: true, count: 'exact' }).limit(1);
    db = error ? 'down' : 'up';
  } catch {
    db = 'down';
  }
  return NextResponse.json(
    { status: 'ok', db, time: new Date().toISOString() },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
