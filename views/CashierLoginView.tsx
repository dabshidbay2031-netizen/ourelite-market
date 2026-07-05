'use client';

import { useState } from 'react';
import { Link, useRouter } from '@/lib/hashRouter';
import { useCashier } from '@/context/CashierContext';
import type { CashierSession } from '@/context/CashierContext';

export default function CashierLoginView() {
  const router = useRouter();
  const { loginAsCashier } = useCashier();

  const [phone,    setPhone]    = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);
  const [showPw,   setShowPw]   = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!phone.trim() || !password) { setError('Enter your phone and password'); return; }
    setLoading(true);
    try {
      const res  = await fetch('/api/cashiers/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phone.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Login failed'); setLoading(false); return; }
      loginAsCashier(data as CashierSession);
      // Go to POS if they have access, else explore
      const dest = (data.privileges as string[]).includes('pos') ? '/pos' : '/';
      router.push(dest);
    } catch {
      setError('Network error — please try again');
    }
    setLoading(false);
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">🏪</div>
        <div className="auth-title">Staff Login</div>
        <div className="auth-subtitle">Sign in with your cashier account</div>

        <form onSubmit={handleLogin} style={{ width: '100%' }}>
          <div className="form-group">
            <label className="form-label">Phone number</label>
            <input
              className="form-input"
              type="tel"
              placeholder="+252…"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              autoComplete="tel"
            />
          </div>

          <div className="form-group">
            <label className="form-label">Password</label>
            <div style={{ position: 'relative' }}>
              <input
                className="form-input"
                type={showPw ? 'text' : 'password'}
                placeholder="Your password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete="current-password"
                style={{ paddingRight: 42 }}
              />
              <button
                type="button"
                onClick={() => setShowPw(v => !v)}
                style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-light)', fontSize: '1.1rem' }}
              >
                {showPw ? '🙈' : '👁'}
              </button>
            </div>
          </div>

          {error && (
            <div className="auth-error">{error}</div>
          )}

          <button className="btn btn-primary" style={{ width: '100%', marginTop: 8 }} type="submit" disabled={loading}>
            {loading ? 'Signing in…' : 'Log In as Staff'}
          </button>
        </form>

        <div style={{ marginTop: 24, textAlign: 'center', fontSize: '.85rem', color: 'var(--text-light)' }}>
          Business owner?{' '}
          <Link href="/auth/login" style={{ color: 'var(--primary)', fontWeight: 600 }}>
            Sign in here
          </Link>
        </div>
      </div>
    </div>
  );
}
