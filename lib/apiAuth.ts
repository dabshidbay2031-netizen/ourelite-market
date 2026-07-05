import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';

/**
 * Server-side authorization helpers for API route handlers.
 *
 * Every /api route runs with the Supabase *service-role* client, which bypasses
 * Row-Level Security. That makes these helpers the ONLY thing standing between a
 * request and full database access — routes that expose admin data or mutate
 * privileged tables MUST gate on `requireAdmin` (or check ownership) before doing
 * any work. The caller proves identity with a Supabase JWT in the
 * `Authorization: Bearer <token>` header; we validate it against the auth server.
 */

export type AdminRole = 'admin' | 'semi_admin';

function bearerToken(req: Request): string | null {
  const h = req.headers.get('authorization');
  if (!h) return null;
  const m = /^Bearer\s+(.+)$/i.exec(h.trim());
  return m ? m[1] : null;
}

/** Resolve the authenticated user from the request's JWT, or null if absent/invalid. */
export async function getAuthUser(req: Request): Promise<{ id: string; email: string | null } | null> {
  const token = bearerToken(req);
  if (!token) return null;
  try {
    const { data, error } = await getSupabaseAdmin().auth.getUser(token);
    if (error || !data?.user) return null;
    return { id: data.user.id, email: data.user.email ?? null };
  } catch {
    return null;
  }
}

/** The admin role for the request's user (from the `admins` table), or null. */
export async function getAdminRole(req: Request): Promise<AdminRole | null> {
  const user = await getAuthUser(req);
  if (!user) return null;
  try {
    const { data } = await getSupabaseAdmin()
      .from('admins').select('role').eq('user_id', user.id).maybeSingle();
    const role = (data as { role?: string } | null)?.role;
    return role === 'admin' || role === 'semi_admin' ? role : null;
  } catch {
    return null;
  }
}

/**
 * Gate an admin route. Returns a Response to send back when the caller is NOT
 * authorized, or `null` when they are — so handlers can do:
 *
 *   const denied = await requireAdmin(req);          // any admin role
 *   if (denied) return denied;
 *
 *   const denied = await requireAdmin(req, { role: 'admin' }); // full admin only
 *   if (denied) return denied;
 */
export async function requireAdmin(
  req: Request,
  opts?: { role?: AdminRole },
): Promise<Response | null> {
  const role = await getAdminRole(req);
  if (!role) {
    return NextResponse.json({ error: 'Unauthorized — admin access required' }, { status: 401 });
  }
  if (opts?.role === 'admin' && role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden — full admin role required' }, { status: 403 });
  }
  return null;
}

/** True if the user is a platform admin (any role). */
export async function isAdminUser(userId: string): Promise<boolean> {
  const { data } = await getSupabaseAdmin()
    .from('admins').select('user_id').eq('user_id', userId).maybeSingle();
  return !!data;
}

/** True if the user owns supplier `supplierId` (auth_user_id match) or is an admin. */
export async function ownsStoreOrAdmin(userId: string, supplierId: number): Promise<boolean> {
  if (await isAdminUser(userId)) return true;
  const { data: sup } = await getSupabaseAdmin()
    .from('suppliers').select('auth_user_id').eq('id', supplierId).maybeSingle();
  return !!sup && String(sup.auth_user_id) === userId;
}

/** Gate: any signed-in user. Returns the user id, or a 401 Response. */
export async function requireUser(req: Request): Promise<string | Response> {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized — sign in required' }, { status: 401 });
  return user.id;
}

/** Gate: the caller must be the user identified by `id` (self-service). */
export async function requireSelf(req: Request, id: string): Promise<Response | null> {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (user.id !== id) return NextResponse.json({ error: 'Forbidden — not your account' }, { status: 403 });
  return null;
}

/**
 * Gate: the caller must be an admin OR the owner (suppliers.auth_user_id) of the
 * given supplier id. Use for per-store reads/writes that must not leak across
 * tenants (e.g. GET /api/orders?supplierId= — orders carry customer PII).
 */
export async function requireSupplierAccess(req: Request, supplierId: number): Promise<Response | null> {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized — sign in required' }, { status: 401 });
  const sb = getSupabaseAdmin();
  const { data: admin } = await sb.from('admins').select('user_id').eq('user_id', user.id).maybeSingle();
  if (admin) return null;
  const { data: sup } = await sb.from('suppliers')
    .select('id').eq('id', supplierId).eq('auth_user_id', user.id).maybeSingle();
  if (sup) return null;
  return NextResponse.json({ error: 'Forbidden — not your store' }, { status: 403 });
}

/**
 * Gate: the caller must be an admin OR the supplier that OWNS the catalog
 * row `products.id = productId` (products.supplier_id). requireStaff alone
 * (any business/supplier account) let ANY store edit/delete/restock ANY OTHER
 * store's products — this closes that. A product with no owner (supplier_id
 * null) can only be touched by an admin.
 */
export async function requireProductOwner(req: Request, productId: number): Promise<Response | null> {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized — sign in required' }, { status: 401 });
  const { data: prod } = await getSupabaseAdmin()
    .from('products').select('supplier_id').eq('id', productId).maybeSingle();
  if (!prod) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const ownerId = prod.supplier_id as number | null;
  const ok = ownerId != null ? await ownsStoreOrAdmin(user.id, ownerId) : await isAdminUser(user.id);
  if (!ok) return NextResponse.json({ error: 'Forbidden — not your product' }, { status: 403 });
  return null;
}

/**
 * Gate: the caller must be an admin OR the business that made this claim
 * (business_products.id = rowId → business_products.supplier_id).
 * requireStaff alone let ANY store reprice/unclaim a COMPETITOR's claimed
 * listing — this closes that.
 */
export async function requireClaimOwner(req: Request, rowId: number): Promise<Response | null> {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized — sign in required' }, { status: 401 });
  const { data: row } = await getSupabaseAdmin()
    .from('business_products').select('supplier_id').eq('id', rowId).maybeSingle();
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!(await ownsStoreOrAdmin(user.id, row.supplier_id as number))) {
    return NextResponse.json({ error: 'Forbidden — not your store' }, { status: 403 });
  }
  return null;
}

/** Gate: the caller must be the given user (self) OR an admin. */
export async function requireSelfOrAdmin(req: Request, userId: string): Promise<Response | null> {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized — sign in required' }, { status: 401 });
  if (user.id === userId) return null;
  const role = await getAdminRole(req);
  if (role) return null;
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}

/**
 * Gate: store staff — a platform admin OR any business/supplier account owner.
 * Used for catalog/inventory/coupon/customer/POS management endpoints.
 * Returns null when allowed, or a 401/403 Response.
 */
export async function requireStaff(req: Request): Promise<Response | null> {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized — sign in required' }, { status: 401 });
  const sb = getSupabaseAdmin();
  const { data: admin } = await sb.from('admins').select('user_id').eq('user_id', user.id).maybeSingle();
  if (admin) return null;
  const { data: sup } = await sb.from('suppliers').select('id').eq('auth_user_id', user.id).maybeSingle();
  if (sup) return null;
  return NextResponse.json({ error: 'Forbidden — store access required' }, { status: 403 });
}
