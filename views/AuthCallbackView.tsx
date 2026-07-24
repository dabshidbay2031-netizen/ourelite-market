'use client';

import { useEffect, useState } from 'react';
import { getSupabase } from '@/lib/supabase';

/**
 * OAuth lands on the REAL path /auth/callback (with provider tokens in the
 * URL hash), so leaving must replace the whole URL — a hash-only push would
 * keep the /auth/callback pathname and the shell would re-render this view.
 */
function leaveTo(hashPath: string) {
  window.location.replace(`${window.location.origin}/#${hashPath}`);
}

/**
 * OAuth callback handler.
 * After Google redirects back here, Supabase JS automatically detects
 * the session from the URL hash/code. We then:
 *  1. Wait for the session to be established
 *  2. Create the Supabase supplier / profile record if it's a new signup
 *  3. Redirect to /profile
 */
export default function AuthCallbackPage() {
  const [status, setStatus] = useState('Completing sign-in…');

  useEffect(() => {
    // A password-reset link lands here as `#…&type=recovery`. Capture it before
    // the Supabase client consumes the hash, so we can route to the
    // set-new-password screen instead of straight into the app.
    const isRecovery = typeof window !== 'undefined' && /[#&?]type=recovery(&|$)/.test(window.location.hash);

    const handle = async () => {
      // Poll for the session — Supabase client auto-processes the URL
      let session = null;
      for (let i = 0; i < 10; i++) {
        const { data } = await getSupabase().auth.getSession();
        if (data.session) { session = data.session; break; }
        await new Promise(r => setTimeout(r, 400));
      }

      if (!session) {
        setStatus('Sign-in failed. Redirecting…');
        setTimeout(() => leaveTo('/auth/login'), 2000);
        return;
      }

      // Password recovery → let the user set a new password.
      if (isRecovery) {
        setStatus('Opening password reset…');
        leaveTo('/auth/reset');
        return;
      }

      const uid = session.user.id;

      /* ── Handle pending OAuth signup ─────────────── */
      const pendingRaw = localStorage.getItem('mogarenta_pending_oauth');
      if (pendingRaw) {
        try {
          setStatus('Setting up your account…');
          const { accountType, name } = JSON.parse(pendingRaw) as {
            accountType: 'user' | 'business' | 'supplier';
            name:        string;
          };
          localStorage.removeItem('mogarenta_pending_oauth');

          if (accountType === 'business' || accountType === 'supplier') {
            await fetch('/api/suppliers', {
              method:  'POST',
              headers: { 'Content-Type': 'application/json' },
              body:    JSON.stringify({ name: name || 'My Business', authUserId: uid, accountType }),
            });
          } else {
            await fetch('/api/profile', {
              method:  'POST',
              headers: { 'Content-Type': 'application/json' },
              body:    JSON.stringify({
                id:       uid,
                fullName: name || (session.user.user_metadata?.full_name as string | undefined) || '',
                phone:    session.user.phone ?? '',
                avatar:   '👤',
              }),
            });
          }
        } catch { /* non-fatal */ }
        // While the record above was being created, AuthContext may have
        // already resolved (and cached) this brand-new user as a plain
        // customer. Drop that cache so the next page load resolves the real
        // account type instead of flashing/sticking on the customer UI.
        try { localStorage.removeItem('mg_c_account'); } catch { /* ignore */ }
      }

      leaveTo('/profile');
    };

    handle();
  }, []);

  return (
    <div style={{
      display:        'flex',
      flexDirection:  'column',
      alignItems:     'center',
      justifyContent: 'center',
      minHeight:      '100dvh',
      gap:            16,
      background:     'var(--bg)',
    }}>
      <div style={{ fontSize: '2.5rem' }}>🏪</div>
      <div style={{ fontWeight: 800, fontSize: '1.3rem', color: 'var(--text)' }}>Hamar Mall</div>
      <div style={{ color: 'var(--text-muted)', fontSize: '.9rem' }}>{status}</div>
      <div className="spinner" style={{ width: 28, height: 28, marginTop: 8 }} />
    </div>
  );
}
