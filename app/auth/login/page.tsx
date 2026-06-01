'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { signInWithPhoneNumber, RecaptchaVerifier, type ConfirmationResult } from 'firebase/auth';
import { FirebaseError } from 'firebase/app';
import { firebaseAuth } from '@/lib/firebase';
import { getSupabase } from '@/lib/supabase';

const COUNTRY_CODES = [
  { flag: '🇸🇴', code: '+252', label: 'Somalia'      },
  { flag: '🇪🇹', code: '+251', label: 'Ethiopia'     },
  { flag: '🇰🇪', code: '+254', label: 'Kenya'        },
  { flag: '🇦🇪', code: '+971', label: 'UAE'          },
  { flag: '🇸🇦', code: '+966', label: 'Saudi Arabia' },
  { flag: '🇬🇧', code: '+44',  label: 'UK'           },
  { flag: '🇺🇸', code: '+1',   label: 'USA'          },
];

function fbErrMsg(e: unknown): string {
  const code = e instanceof FirebaseError ? e.code : '';
  if (code === 'auth/operation-not-allowed')
    return '⚠️ Phone auth not enabled. Firebase Console → Authentication → Phone → Enable.';
  if (code === 'auth/unauthorized-domain')
    return '⚠️ Domain not authorized. Add localhost in Firebase Console → Auth → Authorized domains.';
  if (code === 'auth/invalid-phone-number')      return 'Invalid phone number. Use full format e.g. +252 61 234 5678';
  if (code === 'auth/too-many-requests')          return 'Too many attempts — wait a few minutes.';
  if (code === 'auth/quota-exceeded')             return 'SMS quota exceeded. Try again tomorrow.';
  if (code === 'auth/invalid-verification-code')  return 'Wrong code — check the SMS and try again.';
  if (code === 'auth/code-expired')               return 'Code expired. Press "Resend code".';
  if (code === 'auth/captcha-check-failed')       return 'reCAPTCHA failed. Refresh and try again.';
  if (code === 'auth/missing-phone-number')       return 'Please enter your phone number.';
  if (code === 'auth/network-request-failed')     return 'Network error — check your connection.';
  return code ? `Firebase error: ${code}` : 'Something went wrong. Please try again.';
}

type Tab       = 'phone' | 'email' | 'google';
type PhoneStep = 'phone' | 'otp';

export default function LoginPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('phone');

  /* ── Phone state ──────────────────────────────── */
  const [phoneStep,   setPhoneStep]   = useState<PhoneStep>('phone');
  const [countryCode, setCountryCode] = useState('+252');
  const [phone,       setPhone]       = useState('');
  const [otp,         setOtp]         = useState(['','','','','','']);
  const [cooldown,    setCooldown]    = useState(0);
  const confirmRef  = useRef<ConfirmationResult | null>(null);
  const verifierRef = useRef<RecaptchaVerifier | null>(null);
  const otpRefs     = useRef<(HTMLInputElement | null)[]>([]);

  /* ── Email state ──────────────────────────────── */
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);

  /* ── Shared state ─────────────────────────────── */
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  useEffect(() => () => { verifierRef.current?.clear(); }, []);
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown(c => c - 1), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  const fullPhone = countryCode + phone.trim().replace(/^0/, '');

  /* ── Phone OTP ────────────────────────────────── */
  async function sendOTP(isResend = false) {
    if (!phone.trim()) { setError('Enter your phone number'); return; }
    setError(''); setLoading(true);
    try {
      if (!verifierRef.current) {
        verifierRef.current = new RecaptchaVerifier(
          firebaseAuth, 'recaptcha-container', { size: 'invisible' }
        );
      }
      confirmRef.current = await signInWithPhoneNumber(firebaseAuth, fullPhone, verifierRef.current);
      setPhoneStep('otp');
      setCooldown(60);
      if (!isResend) setTimeout(() => otpRefs.current[0]?.focus(), 80);
    } catch (e) {
      setError(fbErrMsg(e));
      verifierRef.current?.clear();
      verifierRef.current = null;
    }
    setLoading(false);
  }

  async function verifyOTP() {
    const code = otp.join('');
    if (code.length !== 6) { setError('Enter all 6 digits'); return; }
    setError(''); setLoading(true);
    try {
      await confirmRef.current!.confirm(code);
      router.push('/profile');
    } catch (e) {
      setError(fbErrMsg(e));
      setOtp(['','','','','','']);
      setTimeout(() => otpRefs.current[0]?.focus(), 60);
    }
    setLoading(false);
  }

  function handleOtpInput(idx: number, val: string) {
    const digit = val.replace(/\D/g, '').slice(-1);
    setOtp(otp.map((d, i) => i === idx ? digit : d));
    if (digit && idx < 5) otpRefs.current[idx + 1]?.focus();
  }
  function handleOtpKey(idx: number, e: React.KeyboardEvent) {
    if (e.key === 'Backspace' && !otp[idx] && idx > 0) otpRefs.current[idx - 1]?.focus();
    if (e.key === 'Enter') verifyOTP();
  }
  function handlePaste(e: React.ClipboardEvent) {
    e.preventDefault();
    const digits = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6).split('');
    if (digits.length === 6) { setOtp(digits); setTimeout(() => otpRefs.current[5]?.focus(), 30); }
  }

  /* ── Email / password ─────────────────────────── */
  async function handleEmailLogin() {
    if (!email.trim()) { setError('Enter your email'); return; }
    if (!password)     { setError('Enter your password'); return; }
    setError(''); setLoading(true);
    const { error: err } = await getSupabase().auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (err) {
      console.error('Supabase signInWithPassword error:', err);
      const msg = typeof (err as any)?.message === 'string' ? (err as any).message : JSON.stringify(err);
      setError(
        msg.toLowerCase().includes('invalid') || msg.toLowerCase().includes('credentials')
          ? 'Wrong email or password. Please try again.'
          : msg
      );
      setLoading(false);
    } else {
      router.push('/profile');
    }
  }

  /* ── Google OAuth ─────────────────────────────── */
  async function handleGoogleLogin() {
    setError(''); setLoading(true);
    const { error: err } = await getSupabase().auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (err) { setError(err.message); setLoading(false); }
  }

  function switchTab(t: Tab) { setTab(t); setError(''); setLoading(false); }

  /* ── Render ───────────────────────────────────── */
  return (
    <div className="page-anim auth-wrap">
      <div className="auth-logo">
        <div className="auth-logo-icon">🏪</div>
        <div className="auth-logo-title">Mogarenta</div>
        <div className="auth-logo-sub">Business Portal</div>
      </div>

      <div className="auth-card">
        <div className="auth-card-title">Welcome back</div>
        <div className="auth-card-sub">Sign in to your account</div>

        {/* ── Method tabs ──────────────────────────── */}
        <div className="auth-tabs">
          <button className={`auth-tab${tab === 'phone'  ? ' active' : ''}`} onClick={() => switchTab('phone')}>📱 Phone</button>
          <button className={`auth-tab${tab === 'email'  ? ' active' : ''}`} onClick={() => switchTab('email')}>✉️ Email</button>
          <button className={`auth-tab${tab === 'google' ? ' active' : ''}`} onClick={() => switchTab('google')}>🌐 Google</button>
        </div>

        {error && <div className="auth-error">{error}</div>}

        {/* ═══════ Phone OTP ═══════ */}
        {tab === 'phone' && phoneStep === 'phone' && (
          <>
            <div className="form-group">
              <label className="form-label">Phone Number</label>
              <div className="phone-row">
                <select className="phone-code-sel" value={countryCode} onChange={e => setCountryCode(e.target.value)}>
                  {COUNTRY_CODES.map(c => (
                    <option key={c.code + c.label} value={c.code}>{c.flag} {c.code}</option>
                  ))}
                </select>
                <input
                  className="form-input phone-num-input"
                  type="tel" inputMode="numeric" placeholder="61 234 5678"
                  value={phone}
                  onChange={e => setPhone(e.target.value.replace(/[^\d\s\-]/g, ''))}
                  onKeyDown={e => e.key === 'Enter' && sendOTP()}
                  autoFocus
                />
              </div>
              {phone.trim() && (
                <div className="phone-preview">Sending to: <strong>{fullPhone}</strong></div>
              )}
            </div>
            <div id="recaptcha-container" />
            <button
              className="btn btn-primary btn-full btn-lg"
              onClick={() => sendOTP()}
              disabled={loading || !phone.trim()}
              style={{ marginTop: 4 }}
            >
              {loading ? <><span className="btn-spinner" /> Sending OTP…</> : 'Send Verification Code →'}
            </button>
          </>
        )}

        {tab === 'phone' && phoneStep === 'otp' && (
          <>
            <button className="auth-back-btn" onClick={() => { setPhoneStep('phone'); setOtp(['','','','','','']); setError(''); }}>
              ← Change number
            </button>
            <div className="auth-card-sub" style={{ marginTop: 4 }}>
              We sent a 6-digit code to<br />
              <strong className="otp-phone-disp">{fullPhone}</strong>
            </div>
            <div className="otp-row" onPaste={handlePaste}>
              {otp.map((d, i) => (
                <input
                  key={i}
                  ref={el => { otpRefs.current[i] = el; }}
                  className={`otp-box${d ? ' filled' : ''}`}
                  type="text" inputMode="numeric" maxLength={1} value={d}
                  onChange={e => handleOtpInput(i, e.target.value)}
                  onKeyDown={e => handleOtpKey(i, e)}
                  autoFocus={i === 0}
                />
              ))}
            </div>
            <button
              className="btn btn-primary btn-full btn-lg"
              onClick={verifyOTP}
              disabled={loading || otp.join('').length < 6}
              style={{ marginTop: 8 }}
            >
              {loading ? <><span className="btn-spinner" /> Verifying…</> : '✓ Verify & Sign In'}
            </button>
            <div className="otp-resend-row">
              {cooldown > 0
                ? <span className="otp-cooldown">Resend in {cooldown}s</span>
                : <button className="otp-resend-btn" onClick={() => sendOTP(true)}>Didn&apos;t receive it? Resend</button>
              }
            </div>
          </>
        )}

        {/* ═══════ Email / Password ═══════ */}
        {tab === 'email' && (
          <>
            <div className="form-group">
              <label className="form-label">Email Address</label>
              <input
                className="form-input" type="email" placeholder="you@example.com"
                value={email} onChange={e => setEmail(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleEmailLogin()}
                autoFocus
              />
            </div>
            <div className="form-group">
              <label className="form-label">Password</label>
              <div style={{ position: 'relative' }}>
                <input
                  className="form-input"
                  type={showPass ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleEmailLogin()}
                  style={{ paddingRight: 42 }}
                />
                <button
                  type="button"
                  onClick={() => setShowPass(v => !v)}
                  style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '.88rem', color: 'var(--text-muted)' }}
                  tabIndex={-1}
                >
                  {showPass ? '🙈' : '👁️'}
                </button>
              </div>
            </div>
            <button
              className="btn btn-primary btn-full btn-lg"
              onClick={handleEmailLogin}
              disabled={loading || !email.trim() || !password}
              style={{ marginTop: 4 }}
            >
              {loading ? <><span className="btn-spinner" /> Signing in…</> : 'Sign In →'}
            </button>
          </>
        )}

        {/* ═══════ Google ═══════ */}
        {tab === 'google' && (
          <div style={{ padding: '4px 0 8px' }}>
            <button className="auth-google-btn" onClick={handleGoogleLogin} disabled={loading}>
              {loading ? (
                <><span className="btn-spinner" style={{ borderTopColor: '#4285F4' }} /> Redirecting…</>
              ) : (
                <>
                  <svg width="20" height="20" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                  Continue with Google
                </>
              )}
            </button>
            <p className="auth-provider-note">
              You&apos;ll be redirected to Google to sign in securely.
            </p>
          </div>
        )}
      </div>

      <div className="auth-switch">
        New here? <Link href="/auth/signup">Create an account</Link>
      </div>
      <div className="auth-switch" style={{ marginTop: 6 }}>
        <Link href="/" style={{ color: 'var(--text-muted)', fontSize: '.82rem' }}>← Back to shop</Link>
      </div>
    </div>
  );
}
