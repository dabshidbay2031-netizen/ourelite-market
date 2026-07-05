'use client';

import { useEffect } from 'react';

/**
 * Route-level error boundary (Next.js App Router). Catches errors thrown while
 * rendering the page tree before/around the SPA shell, so the user gets a
 * recoverable screen instead of a blank page.
 */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[app/error] route render failed:', error);
  }, [error]);

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', minHeight: '100dvh', gap: 14, padding: 24, textAlign: 'center',
    }}>
      <div style={{ fontSize: '2.5rem' }}>⚠️</div>
      <div style={{ fontWeight: 800, fontSize: '1.3rem' }}>Something went wrong</div>
      <div style={{ color: 'var(--text-light, #64748b)', maxWidth: 360 }}>
        An unexpected error occurred. You can try again, or reload the app.
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
        <button className="btn btn-primary" onClick={() => reset()}>Try again</button>
        <button className="btn btn-secondary" onClick={() => window.location.assign('/')}>Go home</button>
      </div>
    </div>
  );
}
