'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabase } from '@/lib/supabase';

/**
 * OAuth callback handler.
 * After Google redirects back here, Supabase JS automatically detects
 * the session from the URL hash/code. We then:
 *  1. Wait for the session to be established
 *  2. Create the Supabase supplier / profile record if it's a new signup
 *  3. Redirect to /profile
 */
export default function AuthCallbackPage() {
  const router  = useRouter();
  const [status, setStatus] = useState('Completing sign-in…');

  useEffect(() => {
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
        setTimeout(() => router.push('/auth/login'), 2000);
        return;
      }

      const uid = session.user.id;

      /* ── Handle pending OAuth signup ─────────────── */
      const pendingRaw = localStorage.getItem('mogarenta_pending_oauth');
      if (pendingRaw) {
        try {
          setStatus('Setting up your account…');
          const { accountType, name } = JSON.parse(pendingRaw) as {
            accountType: 'user' | 'business';
            name:        string;
          };
          localStorage.removeItem('mogarenta_pending_oauth');

          if (accountType === 'business') {
            await fetch('/api/suppliers', {
              method:  'POST',
              headers: { 'Content-Type': 'application/json' },
              body:    JSON.stringify({ name: name || 'My Business', authUserId: uid }),
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
      }

      router.push('/profile');
    };

    handle();
  }, [router]);

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
      <div style={{ fontWeight: 800, fontSize: '1.3rem', color: 'var(--text)' }}>Mogarenta</div>
      <div style={{ color: 'var(--text-muted)', fontSize: '.9rem' }}>{status}</div>
      <div className="spinner" style={{ width: 28, height: 28, marginTop: 8 }} />
    </div>
  );
}
