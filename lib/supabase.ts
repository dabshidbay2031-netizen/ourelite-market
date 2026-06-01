import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * NOTE: Do NOT use module-level singletons here.
 * Next.js hot-reload keeps old module state when .env.local changes,
 * causing the old Supabase URL to persist until the process is killed.
 * We create clients lazily inside functions so they always read the
 * current env var values at call time.
 */

let _supabase: SupabaseClient | null = null;
let _supabaseAdmin: SupabaseClient | null = null;
let _cachedUrl = '';

function resetIfUrlChanged() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  if (_cachedUrl && _cachedUrl !== url) {
    // URL changed (e.g. new project) — drop cached clients
    _supabase      = null;
    _supabaseAdmin = null;
  }
  _cachedUrl = url;
}

/** Browser client — use in Client Components and pages */
export function getSupabase(): SupabaseClient {
  resetIfUrlChanged();
  if (!_supabase) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    if (!url || !key) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY');
    _supabase = createClient(url, key, {
      auth: { persistSession: true, detectSessionInUrl: true },
    });
  }
  return _supabase;
}

/** Server/admin client — call this inside API route handlers only */
export function getSupabaseAdmin(): SupabaseClient {
  resetIfUrlChanged();
  if (!_supabaseAdmin) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    if (!url || !key) throw new Error('Missing Supabase environment variables');
    _supabaseAdmin = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return _supabaseAdmin;
}
