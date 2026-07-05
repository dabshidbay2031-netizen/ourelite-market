import { getSupabaseAdmin } from '@/lib/supabase';
import type { ChatUser } from '@/lib/types';

/** Resolve a Supabase auth UID to a ChatUser shape.
 *  Checks suppliers table first (business accounts), then profiles (customers). */
export async function resolveChatUser(uid: string): Promise<ChatUser> {
  // Business account?
  try {
    const { data } = await getSupabaseAdmin()
      .from('suppliers')
      .select('id,name,icon,verified,bio,location,categories,contact_numbers')
      .eq('auth_user_id', uid)
      .maybeSingle();
    if (data) {
      return {
        id:             uid,
        name:           String(data.name),
        avatar:         String(data.icon ?? '🏭'),
        type:           'business',
        verified:       Boolean(data.verified),
        bio:            String(data.bio ?? ''),
        location:       String(data.location ?? ''),
        categories:     (data.categories as string[]) ?? [],
        contactNumbers: (data.contact_numbers as string[]) ?? [],
      };
    }
  } catch { /* ignore */ }

  // Customer profile?
  try {
    const { data } = await getSupabaseAdmin()
      .from('profiles')
      .select('id,full_name,avatar,verified,phone')
      .eq('id', uid)
      .maybeSingle();
    if (data) {
      return {
        id:       uid,
        name:     String(data.full_name || 'User'),
        avatar:   String(data.avatar ?? '👤'),
        type:     'user',
        verified: Boolean((data as Record<string, unknown>).verified ?? false),
      };
    }
  } catch { /* ignore */ }

  return { id: uid, name: 'Unknown', avatar: '👤', type: 'user', verified: false };
}
