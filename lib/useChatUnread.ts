'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePathname } from '@/lib/hashRouter';
import { useAuth } from '@/context/AuthContext';
import { useRealtimePing } from '@/lib/useRealtimePing';

/**
 * Total number of unread chat messages across all the signed-in user's
 * conversations — powers the Chat icon badge in the nav. Refreshes live on an
 * incoming-message ping and whenever the route changes (so it clears right
 * after the user reads a thread and navigates away).
 */
export function useChatUnread(): number {
  const { user } = useAuth();
  const pathname = usePathname();
  const [count, setCount] = useState(0);

  const load = useCallback(async () => {
    if (!user) { setCount(0); return; }
    try {
      const res  = await fetch(`/api/conversations?userId=${user.id}`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setCount(data.reduce((n, c) => n + (Number(c?.unreadCount) || 0), 0));
      }
    } catch { /* keep last known count */ }
  }, [user]);

  // Re-check on login and on every navigation (cheap query; clears the badge
  // once a thread has been opened and marked read).
  useEffect(() => { load(); }, [load, pathname]);
  useRealtimePing([user ? `user:${user.id}` : null], load);

  return count;
}
