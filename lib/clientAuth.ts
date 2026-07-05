'use client';

import { getSupabase } from '@/lib/supabase';

/**
 * Build request headers carrying the current user's Supabase JWT, so
 * server-side guards (see lib/apiAuth.ts) can authenticate the caller.
 * Merges any extra headers (e.g. Content-Type) you pass in.
 */
export async function authHeaders(
  extra: Record<string, string> = {},
): Promise<Record<string, string>> {
  try {
    const { data } = await getSupabase().auth.getSession();
    const token = data.session?.access_token;
    return token ? { ...extra, Authorization: `Bearer ${token}` } : extra;
  } catch {
    return extra;
  }
}
