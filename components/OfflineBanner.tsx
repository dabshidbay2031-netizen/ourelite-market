'use client';

import { useEffect, useState } from 'react';

/**
 * Thin fixed banner shown whenever the browser reports it's offline, so a
 * failed action reads as "you're offline" instead of "the app is broken".
 * Auto-hides when the connection returns.
 */
export default function OfflineBanner() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  if (!offline) return null;

  return (
    <div
      role="status"
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999,
        background: '#dc2626', color: '#fff',
        textAlign: 'center', padding: '6px 12px',
        fontSize: '.82rem', fontWeight: 600,
        boxShadow: '0 1px 4px rgba(0,0,0,.2)',
      }}
    >
      ⚠️ You&apos;re offline — changes may not save until you reconnect.
    </div>
  );
}
