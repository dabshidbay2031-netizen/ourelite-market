// @vitest-environment node
/**
 * v3.7 customers are per-business (customers.supplier_id):
 *  - GET ?supplierId requires the caller to OWN that store (or be admin)
 *  - the query returns the store's own customers PLUS legacy rows with no
 *    supplier (shared until claimed)
 *  - POST stamps the store; a pre-migration schema (no column) still saves
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

let authedUser: { id: string } | null = null;
let adminRow = false;
let ownsStore = true;
let customerRows: Record<string, unknown>[] = [];
let failInsertWithMissingColumn = false;
let orFilter: string | null = null;                       // captured .or() arg
const insertPayloads: Record<string, unknown>[] = [];

function builder(table: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const b: any = {};
  let inserted: Record<string, unknown> | null = null;
  for (const m of ['select', 'eq', 'in', 'order', 'limit'] as const) b[m] = () => b;
  b.or = (arg: string) => { orFilter = arg; return b; };
  b.insert = (payload: Record<string, unknown>) => {
    // clone — the route mutates the same object between retries
    insertPayloads.push({ ...payload });
    inserted = failInsertWithMissingColumn && 'supplier_id' in payload ? null : payload;
    return b;
  };
  b.single = () => (inserted
    ? Promise.resolve({ data: { id: 101, created_at: '2026-07-11T10:00:00Z', ...inserted }, error: null })
    : Promise.resolve({ data: null, error: { code: '42703', message: 'column customers.supplier_id does not exist' } }));
  b.maybeSingle = () => {
    if (table === 'admins')    return Promise.resolve({ data: adminRow ? { user_id: authedUser?.id } : null, error: null });
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
  customerRows = [{ id: 1, name: 'Ayan', supplier_id: 27 }, { id: 2, name: 'Shared', supplier_id: null }];
  failInsertWithMissingColumn = false;
  orFilter = null;
  insertPayloads.length = 0;
});

describe('GET /api/customers?supplierId — per-business customer book', () => {
  it('no token → 401', async () => {
    expect((await GET(get('?supplierId=27', false))).status).toBe(401);
  });

  it("another store's book → 403", async () => {
    ownsStore = false;
    expect((await GET(get('?supplierId=27'))).status).toBe(403);
  });

  it('owner → 200 and the query asks for own + legacy-null rows', async () => {
    const res = await GET(get('?supplierId=27'));
    expect(res.status).toBe(200);
    expect(await res.json()).toHaveLength(2);
    expect(orFilter).toContain('supplier_id.eq.27');
    expect(orFilter).toContain('supplier_id.is.null');
  });

  it('rows expose supplierId so the client can tell scoped from shared', async () => {
    const body = (await (await GET(get('?supplierId=27'))).json()) as { supplierId: number | null }[];
    expect(body[0].supplierId).toBe(27);
    expect(body[1].supplierId).toBeNull();
  });
});

describe('POST /api/customers — stamped with the store', () => {
  it('saves with supplier_id when given', async () => {
    const res = await POST(post({ name: 'New Customer', phone: '000', supplierId: 27 }));
    expect(res.status).toBe(201);
    expect(insertPayloads[0]).toMatchObject({ supplier_id: 27 });
  });

  it('missing name → 400', async () => {
    expect((await POST(post({ phone: '000', supplierId: 27 }))).status).toBe(400);
  });

  it('pre-migration schema: retries without the column and still saves', async () => {
    failInsertWithMissingColumn = true;
    const res = await POST(post({ name: 'New Customer', supplierId: 27 }));
    expect(res.status).toBe(201);
    expect(insertPayloads).toHaveLength(2);
    expect(insertPayloads[0]).toHaveProperty('supplier_id', 27);
    expect(insertPayloads[1]).not.toHaveProperty('supplier_id');
  });
});
