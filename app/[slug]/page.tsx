import { redirect, notFound } from 'next/navigation';
import { getSupabaseAdmin } from '@/lib/supabase';

// Reserved paths that must not be claimed as slugs
const RESERVED = new Set([
  'orders','profile','checkout','search','auth','api','chat',
  'customers','dashboard','inventory','notifications','pos',
  'product','settings','supplier','suppliers','_next','static',
  'public','favicon.ico','manifest.json','sw.js','robots.txt',
]);

/**
 * /[slug] — Seller storefront shortcut.
 * Looks up the supplier by slug and redirects to their public profile.
 * Example: mogarenta.com/techvault → /supplier/1
 */
export default async function SlugPage({ params }: { params: { slug: string } }) {
  const slug = params.slug.toLowerCase();

  if (RESERVED.has(slug)) notFound();

  try {
    const { data } = await getSupabaseAdmin()
      .from('suppliers')
      .select('id')
      .eq('slug', slug)
      .maybeSingle();

    if (data?.id) {
      redirect(`/supplier/${data.id}`);
    }
  } catch { /* ignore — table might not have slug column yet */ }

  notFound();
}

// Tell Next.js this is a dynamic segment
export const dynamic = 'force-dynamic';
