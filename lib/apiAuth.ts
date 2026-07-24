import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { getCashierActor } from '@/lib/cashierAuth';

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

/** This user's OWN field-agent store id (account_type='agent'), or null. */
export async function agentSupplierIdFor(userId: string): Promise<number | null> {
  try {
    const { data } = await getSupabaseAdmin()
      .from('suppliers').select('id, account_type')
      .eq('auth_user_id', userId).maybeSingle();
    if (data && (data.account_type as string) === 'agent') return data.id as number;
  } catch { /* account_type column may be absent on a very old schema */ }
  return null;
}

/**
 * True when `userId` is the FIELD AGENT who onboarded store `storeId` AND that
 * store is still being set up (approval_status trial/pending). This is the ONLY
 * window an agent may edit a store they don't own: once an admin approves (or
 * rejects) the store, the agent instantly loses access and the owner takes over.
 * Self-registered stores (registered_by_agent_id NULL) never match.
 */
export async function agentManagesStore(userId: string, storeId: number): Promise<boolean> {
  const agentId = await agentSupplierIdFor(userId);
  if (agentId == null) return false;
  try {
    const { data } = await getSupabaseAdmin()
      .from('suppliers').select('registered_by_agent_id, approval_status')
      .eq('id', storeId).maybeSingle();
    if (!data) return false;
    const registrar = data.registered_by_agent_id as number | null;
    const status    = (data.approval_status as string | null) ?? null;
    return registrar === agentId && (status === 'trial' || status === 'pending' || status === null);
  } catch {
    // registered_by_agent_id column absent (migration_v3_9 not run) → feature off
    return false;
  }
}

/** Owns the store (or admin) OR is the field agent currently setting it up. */
export async function ownsOrManagesStore(userId: string, supplierId: number): Promise<boolean> {
  return (await ownsStoreOrAdmin(userId, supplierId)) || (await agentManagesStore(userId, supplierId));
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
 * True when the request may act on this store. Three kinds of caller:
 *   • platform admin
 *   • the store OWNER (suppliers.auth_user_id)
 *   • a STAFF cashier of that store holding `privilege` (they have no Supabase
 *     JWT — see lib/cashierAuth), so staff can do exactly what the owner
 *     granted them and nothing more.
 */
export async function canAccessStore(
  req: Request,
  supplierId: number,
  privilege?: string,
): Promise<boolean> {
  const user = await getAuthUser(req);
  if (user) {
    const sb = getSupabaseAdmin();
    const { data: admin } = await sb.from('admins').select('user_id').eq('user_id', user.id).maybeSingle();
    if (admin) return true;
    const { data: sup } = await sb.from('suppliers')
      .select('id').eq('id', supplierId).eq('auth_user_id', user.id).maybeSingle();
    if (sup) return true;
    // A field agent may fully set up a store they onboarded while it's still in
    // review (any privilege), and nothing after it's approved.
    if (await agentManagesStore(user.id, supplierId)) return true;
  }
  const actor = await getCashierActor(req);
  if (actor && actor.supplierId === supplierId) {
    return !privilege || actor.privileges.includes(privilege);
  }
  return false;
}

/**
 * Gate: the caller must be an admin, the store OWNER, or a privileged STAFF
 * cashier of that store. Use for per-store reads/writes that must not leak
 * across tenants (e.g. GET /api/orders?supplierId= — orders carry customer PII).
 */
export async function requireSupplierAccess(
  req: Request,
  supplierId: number,
  privilege?: string,
): Promise<Response | null> {
  if (await canAccessStore(req, supplierId, privilege)) return null;
  const user   = await getAuthUser(req);
  const actor  = await getCashierActor(req);
  if (!user && !actor) {
    return NextResponse.json({ error: 'Unauthorized — sign in required' }, { status: 401 });
  }
  return NextResponse.json({ error: 'Forbidden — not your store' }, { status: 403 });
}

/**
 * Gate: the caller must be an admin OR the supplier that OWNS the catalog
 * row `products.id = productId` (products.supplier_id). requireStaff alone
 * (any business/supplier account) let ANY store edit/delete/restock ANY OTHER
 * store's products — this closes that. A product with no owner (supplier_id
 * null) can only be touched by an admin.
 */
export async function requireProductOwner(req: Request, productId: number, privilege = 'inventory_edit'): Promise<Response | null> {
  const user  = await getAuthUser(req);
  const actor = user ? null : await getCashierActor(req);
  if (!user && !actor) return NextResponse.json({ error: 'Unauthorized — sign in required' }, { status: 401 });

  const { data: prod } = await getSupabaseAdmin()
    .from('products').select('supplier_id').eq('id', productId).maybeSingle();
  if (!prod) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const ownerId = prod.supplier_id as number | null;

  // STAFF cashier: only their own store's products, with the edit grant.
  if (actor) {
    const ok = ownerId != null && actor.supplierId === ownerId && actor.privileges.includes(privilege);
    if (!ok) return NextResponse.json({ error: 'Forbidden — not your product' }, { status: 403 });
    return null;
  }

  const ok = ownerId != null ? await ownsOrManagesStore(user!.id, ownerId) : await isAdminUser(user!.id);
  if (!ok) return NextResponse.json({ error: 'Forbidden — not your product' }, { status: 403 });
  return null;
}

/** The store this user owns (suppliers.auth_user_id), or null. */
export async function ownedStoreId(userId: string): Promise<number | null> {
  const { data } = await getSupabaseAdmin()
    .from('suppliers').select('id').eq('auth_user_id', userId).maybeSingle();
  return (data?.id as number | undefined) ?? null;
}

export interface ActingStore {
  /** The account that OWNS the store's data (suppliers.auth_user_id / cashiers.business_id). */
  ownerUserId: string;
  supplierId:  number | null;
  isAdmin:     boolean;
  isCashier:   boolean;
  /** A cashier's granted privileges (null for owner/admin — they have all). */
  privileges:  string[] | null;
}

/**
 * Who is operating a store on this request — the owner, a platform admin, or a
 * privileged cashier. Lets a route scope writes (staff management, settings…)
 * to the caller's OWN store and cap a cashier to what they were granted.
 * Returns null when the caller operates no store.
 */
export async function resolveStoreOwner(req: Request): Promise<ActingStore | null> {
  const user = await getAuthUser(req);
  if (user) {
    if (await isAdminUser(user.id)) {
      return { ownerUserId: user.id, supplierId: null, isAdmin: true, isCashier: false, privileges: null };
    }
    const supplierId = await ownedStoreId(user.id);
    if (supplierId != null) {
      return { ownerUserId: user.id, supplierId, isAdmin: false, isCashier: false, privileges: null };
    }
    return null;
  }
  const actor = await getCashierActor(req);
  if (actor && actor.supplierId != null) {
    return { ownerUserId: actor.ownerUserId, supplierId: actor.supplierId, isAdmin: false, isCashier: true, privileges: actor.privileges };
  }
  return null;
}

/**
 * Gate: the caller must be an admin OR the business that owns this customer
 * (customers.supplier_id). requireStaff alone let ANY store edit or delete
 * ANOTHER store's customer record — this closes that.
 *
 * A customer with no owner (supplier_id null — legacy row) belongs to no
 * store, so only an admin may touch it. It must never be handed to whoever
 * asks first: that is how one store's customer book leaks into another's.
 */
export async function requireCustomerOwner(req: Request, customerId: string): Promise<Response | null> {
  const user  = await getAuthUser(req);
  const actor = user ? null : await getCashierActor(req);
  if (!user && !actor) return NextResponse.json({ error: 'Unauthorized — sign in required' }, { status: 401 });

  const { data: row } = await getSupabaseAdmin()
    .from('customers').select('supplier_id').eq('id', customerId).maybeSingle();
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const ownerId = row.supplier_id as number | null;

  // STAFF cashier: only their own store's customers, and only with the grant.
  if (actor) {
    const ok = ownerId != null
      && actor.supplierId === ownerId
      && actor.privileges.includes('customers');
    if (!ok) return NextResponse.json({ error: 'Forbidden — not your customer' }, { status: 403 });
    return null;
  }

  const ok = ownerId != null
    ? await ownsStoreOrAdmin(user!.id, ownerId)
    : await isAdminUser(user!.id);
  if (!ok) return NextResponse.json({ error: 'Forbidden — not your customer' }, { status: 403 });
  return null;
}

/**
 * Gate: the caller must be an admin OR the business that made this claim
 * (business_products.id = rowId → business_products.supplier_id).
 * requireStaff alone let ANY store reprice/unclaim a COMPETITOR's claimed
 * listing — this closes that.
 */
export async function requireClaimOwner(req: Request, rowId: number, privilege = 'inventory_edit'): Promise<Response | null> {
  const user  = await getAuthUser(req);
  const actor = user ? null : await getCashierActor(req);
  if (!user && !actor) return NextResponse.json({ error: 'Unauthorized — sign in required' }, { status: 401 });

  const { data: row } = await getSupabaseAdmin()
    .from('business_products').select('supplier_id').eq('id', rowId).maybeSingle();
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const ownerId = row.supplier_id as number;

  if (actor) {
    const ok = actor.supplierId === ownerId && actor.privileges.includes(privilege);
    if (!ok) return NextResponse.json({ error: 'Forbidden — not your store' }, { status: 403 });
    return null;
  }
  if (!(await ownsOrManagesStore(user!.id, ownerId))) {
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
export async function requireStaff(req: Request, privilege?: string): Promise<Response | null> {
  const user = await getAuthUser(req);
  if (user) {
    const sb = getSupabaseAdmin();
    const { data: admin } = await sb.from('admins').select('user_id').eq('user_id', user.id).maybeSingle();
    if (admin) return null;
    const { data: sup } = await sb.from('suppliers').select('id').eq('auth_user_id', user.id).maybeSingle();
    if (sup) return null;
    return NextResponse.json({ error: 'Forbidden — store access required' }, { status: 403 });
  }
  // A STAFF cashier counts as store staff for their own store's operations.
  const actor = await getCashierActor(req);
  if (!actor) return NextResponse.json({ error: 'Unauthorized — sign in required' }, { status: 401 });
  if (actor.supplierId == null) {
    return NextResponse.json({ error: 'Forbidden — store access required' }, { status: 403 });
  }
  if (privilege && !actor.privileges.includes(privilege)) {
    return NextResponse.json({ error: 'Forbidden — your account does not have that permission' }, { status: 403 });
  }
  return null;
}
