'use client';

import { useEffect, useState } from 'react';
import { useRouter } from '@/lib/hashRouter';
import { getSupabase } from '@/lib/supabase';

/**
 * #/auth/reset — set a new password after following the emailed reset link.
 *
 * The recovery link established a temporary session (handled in
 * AuthCallbackView), so here we just collect a new password and call
 * updateUser({ password }). Guarded: if there's no session (opened directly),
 * we send the user back to request a fresh link.
 */
export default function ResetPasswordPage() {
  const router = useRouter();
  const [checking,  setChecking]  = useState(true);
  const [hasSession, setHasSession] = useState(false);
  const [password,  setPassword]  = useState('');
  const [confirm,   setConfirm]   = useState('');
  const [showPass,  setShowPass]  = useState(false);
  const [saving,    setSaving]    = useState(false);
  const [error,     setError]     = useState('');
  const [done,      setDone]      = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await getSupabase().auth.getSession();
        setHasSession(!!data.session);
      } catch { setHasSession(false); }
      setChecking(false);
    })();
  }, []);

  async function handleSave() {
    if (password.length < 6)    { setError('Password must be at least 6 characters'); return; }
    if (password !== confirm)   { setError('Passwords do not match'); return; }
    setError(''); setSaving(true);
    const { error: err } = await getSupabase().auth.updateUser({ password });
    setSaving(false);
    if (err) { setError(err.message); return; }
    setDone(true);
    setTimeout(() => router.push('/profile'), 1400);
  }

  if (checking) {
    return (
      <div className="page-anim auth-wrap">
        <div className="empty-state" style={{ marginTop: 80 }}>
          <div className="spinner" style={{ width: 28, height: 28 }} />
        </div>
      </div>
    );
  }

  return (
    <div className="page-anim auth-wrap">
      <div className="auth-logo">
        <div className="auth-logo-icon">🔑</div>
        <div className="auth-logo-title">Hamar Mall</div>
        <div className="auth-logo-sub">Set a new password</div>
      </div>

      <div className="auth-card">
        {!hasSession ? (
          <>
            <div className="auth-card-title">Reset link expired</div>
            <div className="auth-card-sub" style={{ marginBottom: 16 }}>
              This password-reset link is invalid or has expired. Request a new one from the sign-in page.
            </div>
            <button className="btn btn-primary btn-full" onClick={() => router.push('/auth/login')}>
              Back to sign in
            </button>
          </>
        ) : done ? (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '2.6rem', marginBottom: 10 }}>✅</div>
            <div className="auth-card-title">Password updated</div>
            <div className="auth-card-sub">Signing you in…</div>
          </div>
        ) : (
          <>
            <div className="auth-card-title">Choose a new password</div>
            <div className="auth-card-sub" style={{ marginBottom: 8 }}>Enter a new password for your account.</div>

            {error && <div className="auth-error">{error}</div>}

            <div className="form-group" style={{ marginTop: 8 }}>
              <label className="form-label">New password</label>
              <div style={{ position: 'relative' }}>
                <input
                  className="form-input"
                  type={showPass ? 'text' : 'password'}
                  placeholder="Min. 6 characters"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  style={{ paddingRight: 42 }}
                  autoFocus
                />
                <button type="button" tabIndex={-1} onClick={() => setShowPass(v => !v)}
                  style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '.88rem', color: 'var(--text-muted)' }}>
                  {showPass ? '🙈' : '👁️'}
                </button>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Confirm password</label>
              <input
                className="form-input"
                type={showPass ? 'text' : 'password'}
                placeholder="Repeat password"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSave()}
              />
            </div>
            <button className="btn btn-primary btn-full btn-lg" onClick={handleSave}
              disabled={saving || password.length < 6 || !confirm}>
              {saving ? <><span className="btn-spinner" /> Saving…</> : 'Update password →'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
