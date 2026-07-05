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
          {(error?.message || error?.digest) && (
            <code style={{
              fontSize: '0.75rem', color: '#94a3b8', background: 'rgba(100,116,139,0.1)',
              padding: '6px 10px', borderRadius: 6, maxWidth: 420, wordBreak: 'break-word',
            }}>
              {error.message || `digest: ${error.digest}`}
            </code>
          )}
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
