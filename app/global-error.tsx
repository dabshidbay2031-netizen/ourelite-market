'use client';

/**
 * Last-resort boundary for errors in the root layout itself. It must render
 * its own <html>/<body> because it REPLACES the root layout when it fires.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif' }}>
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', minHeight: '100vh', gap: 14, padding: 24, textAlign: 'center',
        }}>
          <div style={{ fontSize: '2.5rem' }}>🛠️</div>
          <div style={{ fontWeight: 800, fontSize: '1.3rem' }}>The app hit a critical error</div>
          <div style={{ color: '#64748b', maxWidth: 360 }}>
            Reloading usually fixes it. If it keeps happening, try again later.
          </div>
          <button
            onClick={() => reset()}
            style={{
              marginTop: 8, padding: '10px 20px', borderRadius: 8, border: 'none',
              background: '#4F46E5', color: '#fff', fontWeight: 600, cursor: 'pointer',
            }}
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
