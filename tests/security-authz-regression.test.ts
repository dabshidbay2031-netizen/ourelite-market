// @vitest-environment node
/**
 * Security regression guards for auth holes found in the 2026-07-03 audit:
 *  - reviews/[id] DELETE had NO auth → anyone could delete anyone's reviews
 *  - verification-requests PATCH had NO auth → anyone could self-approve and
 *    set suppliers.verified (trust-badge escalation); POST/GET were open too
 *  - agent/stats GET had NO auth → anyone could scrape an agent's commission
 *    figures by enumerating agentId
 * Every one must reject an anonymous (no-JWT) caller with 401.
 */
import { describe, it, expect, vi } from 'vitest';

// No token → getAuthUser resolves to null everywhere.
vi.mock('@/lib/supabase', () => ({
  getSupabaseAdmin: () => ({
    auth: { getUser: async () => ({ data: { user: null }, error: { message: 'no token' } }) },
    from: () => {
      const b: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'in', 'order', 'limit', 'update', 'delete', 'insert', 'upsert']) b[m] = () => b;
      b.maybeSingle = () => Promise.resolve({ data: null, error: null });
      b.single = () => Promise.resolve({ data: null, error: null });
      (b as { then?: unknown }).then = (r: (v: unknown) => void) => Promise.resolve({ data: [], error: null }).then(r);
      return b;
    },
  }),
}));

import { DELETE as reviewsDelete } from '@/app/api/reviews/[id]/route';
import { PATCH as verifPatch, POST as verifPost, GET as verifGet } from '@/app/api/verification-requests/route';
import { GET as agentStatsGet } from '@/app/api/agent/stats/route';

const anon = (url = 'http://t/x', init: RequestInit = {}) => new Request(url, init);
const params = (id: string) => ({ params: Promise.resolve({ id }) });

describe('anonymous callers are rejected (401) on the newly-gated routes', () => {
  it('reviews/[id] DELETE → 401', async () => {
    expect((await reviewsDelete(anon('http://t/api/reviews/5', { method: 'DELETE' }), params('5'))).status).toBe(401);
  });

  it('verification-requests PATCH (self-approve) → 401', async () => {
    const req = anon('http://t/api/verification-requests?supplierId=31', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: '{"status":"approved"}' });
    expect((await verifPatch(req)).status).toBe(401);
  });

  it('verification-requests POST → 401', async () => {
    const req = anon('http://t/api/verification-requests', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"supplierId":31}' });
    expect((await verifPost(req)).status).toBe(401);
  });

  it('verification-requests GET → 401', async () => {
    expect((await verifGet(anon('http://t/api/verification-requests?supplierId=31'))).status).toBe(401);
  });

  it('agent/stats GET → 401', async () => {
    expect((await agentStatsGet(anon('http://t/api/agent/stats?agentId=11'))).status).toBe(401);
  });
});
