import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { requireAdmin, getAuthUser } from '@/lib/apiAuth';
import { pingRealtime } from '@/lib/realtimeServer';

/**
 * Hero (Hot Deals) banner settings shown on the Explore page.
 *
 *   GET  /api/settings/hero   — public; anyone can read the current banner.
 *   PUT  /api/settings/hero   — full admins only; updates the banner.
 *
 * Stored as a single JSONB row in `site_settings` (key = 'hero_banner').
 * See supabase/migration_v3_4.sql.
 */

const KEY = 'hero_banner';

export interface HeroBanner {
  enabled:  boolean;
  imageUrl: string;
  tag:      string;
  title:    string;
  subtitle: string;
  ctaLabel: string;
}

/** Fallback used when the DB row is missing (fresh DB / migration not yet run). */
const DEFAULT_HERO: HeroBanner = {
  enabled:  true,
  imageUrl: '',
  tag:      '🔥 Hot Deals',
  title:    'Up to 30% Off This Week',
  subtitle: 'Limited time offers on top products',
  ctaLabel: 'Shop Now',
};

/** Coerce arbitrary input into a clean HeroBanner, trimming + capping lengths. */
function sanitize(input: unknown): HeroBanner {
  const o = (input ?? {}) as Partial<Record<keyof HeroBanner, unknown>>;
  const str = (v: unknown, max: number, fallback: string) =>
    typeof v === 'string' ? v.trim().slice(0, max) : fallback;
  return {
    enabled:  typeof o.enabled === 'boolean' ? o.enabled : DEFAULT_HERO.enabled,
    imageUrl: str(o.imageUrl, 1000, DEFAULT_HERO.imageUrl),
    tag:      str(o.tag,       60, DEFAULT_HERO.tag),
    title:    str(o.title,    120, DEFAULT_HERO.title),
    subtitle: str(o.subtitle, 200, DEFAULT_HERO.subtitle),
    ctaLabel: str(o.ctaLabel,  40, DEFAULT_HERO.ctaLabel),
  };
}

export async function GET() {
  try {
    const { data } = await getSupabaseAdmin()
      .from('site_settings').select('value').eq('key', KEY).maybeSingle();
    const hero = data?.value ? sanitize(data.value) : DEFAULT_HERO;
    return NextResponse.json(hero);
  } catch {
    // Table missing or DB unreachable — never break the storefront over this.
    return NextResponse.json(DEFAULT_HERO);
  }
}

export async function PUT(req: Request) {
  const denied = await requireAdmin(req, { role: 'admin' });
  if (denied) return denied;

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const hero = sanitize(body);
  const user = await getAuthUser(req);

  try {
    const { error } = await getSupabaseAdmin()
      .from('site_settings')
      .upsert({ key: KEY, value: hero, updated_at: new Date().toISOString(), updated_by: user?.id ?? null },
              { onConflict: 'key' });
    if (error) throw error;
    pingRealtime(['settings']); // open storefronts re-pull the banner instantly
    return NextResponse.json(hero);
  } catch (e) {
    return NextResponse.json(
      { error: 'Save failed — has migration_v3_4.sql been run?', detail: String(e) },
      { status: 500 },
    );
  }
}
