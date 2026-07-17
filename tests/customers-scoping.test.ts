// @vitest-environment node
/**
 * A store's customer book is PRIVATE.
 *  - GET ?supplierId requires the caller to OWN that store (or be admin)
 *  - the query is STRICTLY scoped: unowned (supplier_id null) rows are never
 *    shared with a business — previously `OR supplier_id.is.null` showed every
 *    legacy customer to EVERY store
 *  - GET with no supplierId is admin-only (it is the whole platform's book)
 *  - POST stamps the CALLER'S OWN store; the body can't choose the owner
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

let authedUser: { id: string } | null = null;
let adminRow = false;
let ownsStore = true;
let customerRows: Record<string, unknown>[] = [];
let eqFilters: [string, unknown][] = [];
let orFilter: string | null = null;
const insertPayloads: Record<string, unknown>[] = [];

function builder(table: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const b: any = {};
  let inserted: Record<string, unknown> | null = null;
  for (const m of ['select', 'in', 'order', 'limit'] as const) b[m] = () => b;
  b.eq = (col: string, val: unknown) => { eqFilters.push([col, val]); return b; };
  b.or = (arg: string) => { orFilter = arg; return b; };
  b.insert = (payload: Record<string, unknown>) => {
    insertPayloads.push({ ...payload });
    inserted = payload;
    return b;
  };
  b.single = () => Promise.resolve({
    data: { id: 101, created_at: '2026-07-17T10:00:00Z', ...inserted }, error: null,
  });
  b.maybeSingle = () => {
    // requireAdmin reads .role; isAdminUser only checks the row exists.
    if (table === 'admins')    return Promise.resolve({ data: adminRow ? { user_id: authedUser?.id, role: 'admin' } : null, error: null });
    if (table === 'suppliers') return Promise.resolve({ data: ownsStore ? { id: 27, auth_user_id: authedUser?.id } : null, error: null });
    return Promise.resolve({ data: null, error: null });
  };
  b.then = (res: (v: unknown) => void) =>
    Promise.resolve({ data: table === 'customers' ? customerRows : [], error: null }).then(res);
  return b;
}

vi.mock('@/lib/supabase', () => ({
  getSupabaseAdmin: () => ({
    auth: { getUser: async (t: string) => (t && authedUser ? { data: { user: authedUser }, error: null } : { data: { user: null }, error: { message: 'bad' } }) },
    from: (table: string) => builder(table),
  }),
}));

import { GET, POST } from '@/app/api/customers/route';

const get = (q: string, tok = true) =>
  new Request('http://t/api/customers' + q, tok ? { headers: { Authorization: 'Bearer jwt' } } : {});
const post = (body: object) => new Request('http://t/api/customers', {
  method: 'POST',
  headers: { Authorization: 'Bearer jwt', 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

beforeEach(() => {
  authedUser = { id: 'ownerA' }; adminRow = false; ownsStore = true;
  customerRows = [{ id: 1, name: 'Ayan', supplier_id: 27 }];
  eqFilters = []; orFilter = null;
  insertPayloads.length = 0;
});

describe('GET /api/customers?supplierId — a private, per-store book', () => {
  it('no token → 401', async () => {
    expect((await GET(get('?supplierId=27', false))).status).toBe(401);
  });

  it("another store's book → 403", async () => {
    ownsStore = false;
    expect((await GET(get('?supplierId=27'))).status).toBe(403);
  });

  it('owner → 200', async () => {
    const res = await GET(get('?supplierId=27'));
    expect(res.status).toBe(200);
    expect(await res.json()).toHaveLength(1);
  });

  it('scopes STRICTLY to the store — never shares unowned rows', async () => {
    await GET(get('?supplierId=27'));
    expect(eqFilters).toContainEqual(['supplier_id', 27]);
    // the old `OR supplier_id.is.null` leak must be gone
    expect(orFilter).toBeNull();
  });

  it('bad supplierId → 400', async () => {
    expect((await GET(get('?supplierId=abc'))).status).toBe(400);
  });
});

describe('GET /api/customers (no supplierId) — the whole platform book', () => {
  it('a business cannot dump every store’s customers → 401/403', async () => {
    adminRow = false;
    expect([401, 403]).toContain((await GET(get(''))).status);
  });

  it('an admin may list all', async () => {
    adminRow = true;
    expect((await GET(get(''))).status).toBe(200);
  });
});

describe('POST /api/customers — owner comes from the caller, not the body', () => {
  it('stamps the caller’s own store', async () => {
    const res = await POST(post({ name: 'New Customer', phone: '000' }));
    expect(res.status).toBe(201);
    expect(insertPayloads[0]).toMatchObject({ supplier_id: 27 });
  });

  it('cannot plant a customer in another store’s book → 403', async () => {
    const res = await POST(post({ name: 'Mole', supplierId: 99 }));
    expect(res.status).toBe(403);
    expect(insertPayloads).toHaveLength(0);
  });

  it('never creates an unowned (shared-with-everyone) customer', async () => {
    await POST(post({ name: 'New Customer' }));
    expect(insertPayloads[0].supplier_id).toBe(27);
    expect(insertPayloads[0].supplier_id).not.toBeNull();
  });

  it('a caller with no store → 403', async () => {
    ownsStore = false;
    expect((await POST(post({ name: 'X' }))).status).toBe(403);
  });

  it('missing name → 400', async () => {
    expect((await POST(post({ phone: '000' }))).status).toBe(400);
  });

  it('no token → 401', async () => {
    authedUser = null;
    expect((await POST(post({ name: 'X' }))).status).toBe(401);
  });
});
