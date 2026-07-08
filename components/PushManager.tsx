'use client';

import { useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { ensureServiceWorker, refreshPushSubscription } from '@/lib/push';

/**
 * Invisible bootstrap for Web Push.
 *  • Registers the service worker once on load (needed to receive pushes).
 *  • When a user is signed in AND has already granted notification
 *    permission, silently re-syncs the subscription to their account —
 *    keeps endpoints fresh and re-points shared browsers to the current user.
 *
 * The actual permission ASK lives in NotificationsView (user gesture),
 * never automatic — browsers punish prompt-on-load.
 */
export default function PushManager() {
  const { user } = useAuth();

  useEffect(() => { ensureServiceWorker(); }, []);

  useEffect(() => {
    if (user?.id) refreshPushSubscription();
  }, [user?.id]);

  return null;
}
