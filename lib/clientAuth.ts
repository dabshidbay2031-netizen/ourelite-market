'use client';

import { getSupabase } from '@/lib/supabase';
import { readCashierToken } from '@/lib/cashierSession';

/**
 * Build request headers that identify the caller to the server-side guards
 * (see lib/apiAuth.ts). Two kinds of caller:
 *   • an owner/customer  → Supabase JWT in `Authorization`
 *   • a STAFF cashier    → signed token in `X-Cashier-Token` (cashiers are not
 *     Supabase users, so they have no JWT)
 * Both are sent when present; the server prefers the JWT.
 */
export async function authHeaders(
  extra: Record<string, string> = {},
): Promise<Record<string, string>> {
  const headers: Record<string, string> = { ...extra };

  const cashierToken = readCashierToken();
  if (cashierToken) headers['X-Cashier-Token'] = cashierToken;

  try {
    const { data } = await getSupabase().auth.getSession();
    const token = data.session?.access_token;
    if (token) headers.Authorization = `Bearer ${token}`;
  } catch { /* not signed in as a Supabase user */ }

  return headers;
}
