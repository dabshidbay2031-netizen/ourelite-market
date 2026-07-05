// @vitest-environment node
/**
 * Admin route authorization. Regression guard for the privilege-escalation
 * hole where /api/admin/* ran with the service-role client and NO caller check:
 *  - anyone could self-promote via POST /api/admin/admins
 *  - anyone could read all users' PII (GET /api/admin/users) and revenue (stats)
 *
 * These assert that the server-side guard (lib/apiAuth) now rejects callers
 * who are anonymous or not in the `admins` table, and enforces full-admin-only
 * on mutations.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

/* Test-controlled auth state */
let authedUser: { id: string; email: string | null } | null = null; // who the JWT resolves to
let adminRole: 'admin' | 'semi_admin' | null = null;                  // their row in `admins`

function makeBuilder(table: string) {
  const b: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'in', 'order', 'limit', 'update', 'insert', 'upsert', 'delete']) {
    b[m] = () => b;
  }
  // getAdminRole() reads admins via maybeSingle
  b.maybeSingle = () => Promise.resolve(
    table === 'admins' ? { data: adminRole ? { role: adminRole } : null, error: null }
                       : { data: null, error: null });
  // POST upsert(...).select().single() returns the created row
  b.single = () => Promise.resolve({
    data: { id: 1, user_id: 'new', role: 'admin', name: '', email: '', created_at: '2026' },
    error: null,
  });
  // awaiting the builder resolves benign empty data (stats counts / lists)
  (b as { then?: unknown }).then =
    (res: (v: unknown) => void) => Promise.resolve({ data: [], error: null, count: 0 }).then(res);
  return b;
}

vi.mock('@/lib/supabase', () => ({
  getSupabaseAdmin: () => ({
    auth: {
      // Only resolves a user when a token was provided (route passes the bearer through)
      getUser: async (token: string) =>
        token && authedUser ? { data: { user: authedUser }, error: null }
                            : { data: { user: null }, error: { message: 'invalid token' } },
    },
    from: (table: string) => makeBuilder(table),
    rpc: async () => ({ data: null, error: null }),
  }),
}));

import { POST as adminsPost, GET as adminsGet } from '@/app/api/admin/admins/route';
import { GET as usersGet } from '@/app/api/admin/users/route';
import { GET as statsGet } from '@/app/api/admin/stats/route';

const url = 'http://test/api/admin';
const withAuth = (init: RequestInit = {}) =>
  new Request(url, { headers: { Authorization: 'Bearer test-jwt' }, ...init });
const noAuth = (init: RequestInit = {}) => new Request(url, init);
const postBody = (auth: boolean) => new Request(url, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: 'Bearer test-jwt' } : {}) },
  body: JSON.stringify({ userId: 'attacker-uid', role: 'admin' }),
});

beforeEach(() => { authedUser = null; adminRole = null; });

describe('admin routes reject anonymous callers', () => {
  it('GET /admin/users without a token → 401', async () => {
    expect((await usersGet(noAuth())).status).toBe(401);
  });
  it('GET /admin/stats without a token → 401', async () => {
    expect((await statsGet(noAuth())).status).toBe(401);
  });
  it('GET /admin/admins without a token → 401', async () => {
    expect((await adminsGet(noAuth())).status).toBe(401);
  });
  it('POST /admin/admins (self-promote) without a token → 401, no insert', async () => {
    expect((await adminsPost(postBody(false))).status).toBe(401);
  });
});

describe('admin routes reject signed-in non-admins', () => {
  beforeEach(() => { authedUser = { id: 'random-user', email: 'u@x.com' }; adminRole = null; });

  it('valid JWT but not in admins table → 401 on users', async () => {
    expect((await usersGet(withAuth())).status).toBe(401);
  });
  it('self-promote attempt by a normal user → 401', async () => {
    expect((await adminsPost(postBody(true))).status).toBe(401);
  });
});

describe('role enforcement for admins vs semi-admins', () => {
  it('semi_admin can READ users/stats', async () => {
    authedUser = { id: 'viewer', email: null }; adminRole = 'semi_admin';
    expect((await usersGet(withAuth())).status).toBe(200);
    expect((await statsGet(withAuth())).status).toBe(200);
  });
  it('semi_admin CANNOT add admins (full-admin only) → 403', async () => {
    authedUser = { id: 'viewer', email: null }; adminRole = 'semi_admin';
    expect((await adminsPost(postBody(true))).status).toBe(403);
  });
  it('full admin CAN add admins → 201', async () => {
    authedUser = { id: 'boss', email: null }; adminRole = 'admin';
    expect((await adminsPost(postBody(true))).status).toBe(201);
  });
});
