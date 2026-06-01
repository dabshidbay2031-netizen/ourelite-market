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
  if (code === 'auth/invalid-verification-code')  return 'Wrong code — check the SMS.';
  if (code === 'auth/code-expired')               return 'Code expired. Press "Resend code".';
  if (code === 'auth/network-request-failed')     return 'Network error — check your connection.';
  return code ? `Firebase error: ${code}` : 'Something went wrong. Please try again.';
}

type Method   = 'phone' | 'email' | 'google';
type AcctType = 'user' | 'business';

/* Phone-specific steps */
type PhoneStep = 'type' | 'name' | 'phone' | 'otp';
/* Email-specific steps */
type EmailStep = 'type' | 'details' | 'done';
/* Google-specific steps */
type GoogleStep = 'type' | 'name';

export default function SignupPage() {
  const router = useRouter();

  /* ── Shared state ────────────────────────────── */
  const [method,    setMethod]    = useState<Method | null>(null);
  const [acctType,  setAcctType]  = useState<AcctType>('user');
  const [name,      setName]      = useState('');
  const [error,     setError]     = useState('');
  const [loading,   setLoading]   = useState(false);

  /* ── Phone state ─────────────────────────────── */
  const [phoneStep,   setPhoneStep]   = useState<PhoneStep>('type');
  const [countryCode, setCountryCode] = useState('+252');
  const [phone,       setPhone]       = useState('');
  const [otp,         setOtp]         = useState(['','','','','','']);
  const [cooldown,    setCooldown]    = useState(0);
  const confirmRef  = useRef<ConfirmationResult | null>(null);
  const verifierRef = useRef<RecaptchaVerifier | null>(null);
  const otpRefs     = useRef<(HTMLInputElement | null)[]>([]);

  /* ── Email state ─────────────────────────────── */
  const [emailStep,   setEmailStep]   = useState<EmailStep>('type');
  const [email,       setEmail]       = useState('');
  const [password,    setPassword]    = useState('');
  const [password2,   setPassword2]   = useState('');
  const [showPass,    setShowPass]    = useState(false);
  const [emailSent,   setEmailSent]   = useState(false);

  /* ── Google state ────────────────────────────── */
  const [googleStep, setGoogleStep] = useState<GoogleStep>('type');

  useEffect(() => () => { verifierRef.current?.clear(); }, []);
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown(c => c - 1), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  const fullPhone = countryCode + phone.trim().replace(/^0/, '');

  /* ── Helpers ─────────────────────────────────── */
  async function createRecord(uid: string, userName: string, userPhone = '') {
    if (acctType === 'business') {
      await fetch('/api/suppliers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: userName.trim(), authUserId: uid }),
      });
    } else {
      await fetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: uid, fullName: userName.trim(), phone: userPhone, avatar: '👤' }),
      });
    }
  }

  /* ══════════════════════════════════════════════
     PHONE OTP FLOW
  ══════════════════════════════════════════════ */
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

  async function verifyPhoneOTP() {
    const code = otp.join('');
    if (code.length !== 6) { setError('Enter all 6 digits'); return; }
    setError(''); setLoading(true);
    try {
      const cred = await confirmRef.current!.confirm(code);
      await createRecord(cred.user.uid, name, fullPhone);
      router.push('/profile');
    } catch (e) {
      setError(fbErrMsg(e));
      setOtp(['','','','','','']);
      setTimeout(() => otpRefs.current[0]?.focus(), 60);
    }
    setLoading(false);
  }

  function handleOtpInput(idx: number, val: string) {
    const d = val.replace(/\D/g, '').slice(-1);
    setOtp(otp.map((x, i) => i === idx ? d : x));
    if (d && idx < 5) otpRefs.current[idx + 1]?.focus();
  }
  function handleOtpKey(idx: number, e: React.KeyboardEvent) {
    if (e.key === 'Backspace' && !otp[idx] && idx > 0) otpRefs.current[idx - 1]?.focus();
    if (e.key === 'Enter') verifyPhoneOTP();
  }
  function handlePaste(e: React.ClipboardEvent) {
    e.preventDefault();
    const digits = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6).split('');
    if (digits.length === 6) { setOtp(digits); setTimeout(() => otpRefs.current[5]?.focus(), 30); }
  }

  /* ══════════════════════════════════════════════
     EMAIL FLOW
  ══════════════════════════════════════════════ */
  async function handleEmailSignup() {
    if (!name.trim())     { setError(`Enter your ${acctType === 'business' ? 'business' : 'full'} name`); return; }
    if (!email.trim())    { setError('Enter your email address'); return; }
    if (password.length < 6) { setError('Password must be at least 6 characters'); return; }
    if (password !== password2) { setError('Passwords do not match'); return; }
    setError(''); setLoading(true);

    const { data, error: err } = await getSupabase().auth.signUp({
      email:    email.trim(),
      password,
      options: {
        data: { full_name: name.trim() },
      },
    });

    if (err) {
      setError(err.message);
      setLoading(false);
      return;
    }

    const uid = data.user?.id;
    if (!uid) { setError('Signup failed. Please try again.'); setLoading(false); return; }

    await createRecord(uid, name);

    if (data.session) {
      // Email confirmation disabled — user is logged in immediately
      router.push('/profile');
    } else {
      // Email confirmation required — show "check email" message
      setEmailSent(true);
      setEmailStep('done');
    }
    setLoading(false);
  }

  /* ══════════════════════════════════════════════
     GOOGLE FLOW
  ══════════════════════════════════════════════ */
  async function handleGoogleSignup() {
    if (!name.trim()) { setError(`Enter your ${acctType === 'business' ? 'business' : 'full'} name`); return; }
    setError(''); setLoading(true);

    // Store pending signup data so the callback page can create the Supabase record
    localStorage.setItem('mogarenta_pending_oauth', JSON.stringify({
      accountType: acctType,
      name:        name.trim(),
    }));

    const { error: err } = await getSupabase().auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });

    if (err) {
      localStorage.removeItem('mogarenta_pending_oauth');
      setError(err.message);
      setLoading(false);
    }
    // On success, browser is redirected — no further action needed
  }

  /* ── Progress dots for phone ─────────────────── */
  const PHONE_STEPS: PhoneStep[] = ['type', 'name', 'phone', 'otp'];
  const phoneStepIdx = PHONE_STEPS.indexOf(phoneStep);

  /* ── Method selector ─────────────────────────── */
  if (!method) {
    return (
      <div className="page-anim auth-wrap">
        <div className="auth-logo">
          <div className="auth-logo-icon">🏪</div>
          <div className="auth-logo-title">Mogarenta</div>
          <div className="auth-logo-sub">Create your account</div>
        </div>

        <div className="auth-card">
          <div className="auth-card-title">How would you like to sign up?</div>
          <div className="auth-card-sub">Choose your preferred method</div>

          <div className="auth-method-list">
            <button className="auth-method-btn" onClick={() => { setMethod('phone'); setPhoneStep('type'); }}>
              <span className="auth-method-icon">📱</span>
              <div className="auth-method-info">
                <div className="auth-method-label">Phone OTP</div>
                <div className="auth-method-sub">Verify with SMS code via Firebase</div>
              </div>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M9 18l6-6-6-6"/></svg>
            </button>

            <button className="auth-method-btn" onClick={() => { setMethod('email'); setEmailStep('type'); }}>
              <span className="auth-method-icon">✉️</span>
              <div className="auth-method-info">
                <div className="auth-method-label">Email & Password</div>
                <div className="auth-method-sub">Sign up with your email address</div>
              </div>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M9 18l6-6-6-6"/></svg>
            </button>

            <button className="auth-method-btn" onClick={() => { setMethod('google'); setGoogleStep('type'); }}>
              <span className="auth-method-icon">
                <svg width="22" height="22" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
              </span>
              <div className="auth-method-info">
                <div className="auth-method-label">Continue with Google</div>
                <div className="auth-method-sub">Quick one-tap sign up</div>
              </div>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M9 18l6-6-6-6"/></svg>
            </button>
          </div>
        </div>

        <div className="auth-switch">
          Already have an account? <Link href="/auth/login">Sign in</Link>
        </div>
        <div className="auth-switch" style={{ marginTop: 6 }}>
          <Link href="/" style={{ color: 'var(--text-muted)', fontSize: '.82rem' }}>← Back to shop</Link>
        </div>
      </div>
    );
  }

  /* ════════════════════════════════════════════════════
     PHONE FLOW
  ════════════════════════════════════════════════════ */
  if (method === 'phone') {
    return (
      <div className="page-anim auth-wrap">
        <div className="auth-logo">
          <div className="auth-logo-icon">{acctType === 'business' ? '🏪' : '👤'}</div>
          <div className="auth-logo-title">Mogarenta</div>
          <div className="auth-logo-sub">Sign up with Phone</div>
        </div>

        <div className="signup-steps">
          {PHONE_STEPS.map((s, i) => (
            <div key={s} className={`signup-dot${i <= phoneStepIdx ? ' done' : ''}${i === phoneStepIdx ? ' current' : ''}`} />
          ))}
        </div>

        {/* Step 1 — Account type */}
        {phoneStep === 'type' && (
          <>
            <div className="acct-type-toggle">
              <button className={`acct-type-btn ${acctType === 'user' ? 'active' : ''}`} onClick={() => setAcctType('user')}>
                <span className="acct-type-icon">👤</span>
                <span className="acct-type-label">Customer</span>
                <span className="acct-type-sub">Shop &amp; track orders</span>
              </button>
              <button className={`acct-type-btn ${acctType === 'business' ? 'active' : ''}`} onClick={() => setAcctType('business')}>
                <span className="acct-type-icon">🏪</span>
                <span className="acct-type-label">Business</span>
                <span className="acct-type-sub">Sell &amp; manage products</span>
              </button>
            </div>
            <div style={{ padding: '0 20px', display: 'flex', gap: 10 }}>
              <button className="btn btn-ghost btn-lg" style={{ flex: 1 }} onClick={() => setMethod(null)}>← Back</button>
              <button className="btn btn-primary btn-lg" style={{ flex: 2 }} onClick={() => { setError(''); setPhoneStep('name'); }}>
                Continue →
              </button>
            </div>
          </>
        )}

        {/* Step 2 — Name */}
        {phoneStep === 'name' && (
          <div className="auth-card">
            <button className="auth-back-btn" onClick={() => { setPhoneStep('type'); setError(''); }}>← Back</button>
            <div className="auth-card-title">{acctType === 'user' ? 'Your name' : 'Business name'}</div>
            <div className="auth-card-sub">{acctType === 'user' ? 'What should we call you?' : 'What is your business called?'}</div>
            {error && <div className="auth-error">{error}</div>}
            <div className="form-group" style={{ marginTop: 16 }}>
              <input
                className="form-input"
                placeholder={acctType === 'user' ? 'Ahmed Hassan' : 'TechVault Store'}
                value={name}
                onChange={e => setName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { if (!name.trim()) { setError('Enter your name'); return; } setError(''); setPhoneStep('phone'); } }}
                autoFocus
              />
            </div>
            <button className="btn btn-primary btn-full btn-lg" onClick={() => {
              if (!name.trim()) { setError('Enter your name'); return; }
              setError(''); setPhoneStep('phone');
            }}>Continue →</button>
          </div>
        )}

        {/* Step 3 — Phone number */}
        {phoneStep === 'phone' && (
          <div className="auth-card">
            <button className="auth-back-btn" onClick={() => { setPhoneStep('name'); setError(''); }}>← Back</button>
            <div className="auth-card-title">Phone Number</div>
            <div className="auth-card-sub">We&apos;ll send a verification code</div>
            {error && <div className="auth-error">{error}</div>}
            <div className="form-group" style={{ marginTop: 16 }}>
              <label className="form-label">Phone Number</label>
              <div className="phone-row">
                <select className="phone-code-sel" value={countryCode} onChange={e => setCountryCode(e.target.value)}>
                  {COUNTRY_CODES.map(c => <option key={c.code + c.label} value={c.code}>{c.flag} {c.code}</option>)}
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
              {phone.trim() && <div className="phone-preview">Sending to: <strong>{fullPhone}</strong></div>}
            </div>
            <div id="recaptcha-container" />
            <button className="btn btn-primary btn-full btn-lg" onClick={() => sendOTP()} disabled={loading || !phone.trim()}>
              {loading ? <><span className="btn-spinner" /> Sending OTP…</> : 'Send Verification Code →'}
            </button>
          </div>
        )}

        {/* Step 4 — OTP */}
        {phoneStep === 'otp' && (
          <div className="auth-card">
            <button className="auth-back-btn" onClick={() => { setPhoneStep('phone'); setOtp(['','','','','','']); setError(''); }}>
              ← Change number
            </button>
            <div className="auth-card-title">Verify Number</div>
            <div className="auth-card-sub">Code sent to <strong className="otp-phone-disp">{fullPhone}</strong></div>
            {error && <div className="auth-error">{error}</div>}
            <div className="otp-row" onPaste={handlePaste}>
              {otp.map((d, i) => (
                <input key={i} ref={el => { otpRefs.current[i] = el; }}
                  className={`otp-box${d ? ' filled' : ''}`}
                  type="text" inputMode="numeric" maxLength={1} value={d}
                  onChange={e => handleOtpInput(i, e.target.value)}
                  onKeyDown={e => handleOtpKey(i, e)}
                  autoFocus={i === 0}
                />
              ))}
            </div>
            <button className="btn btn-primary btn-full btn-lg" onClick={verifyPhoneOTP}
              disabled={loading || otp.join('').length < 6} style={{ marginTop: 8 }}>
              {loading ? <><span className="btn-spinner" /> Creating account…</> : '✓ Verify & Create Account'}
            </button>
            <div className="otp-resend-row">
              {cooldown > 0
                ? <span className="otp-cooldown">Resend in {cooldown}s</span>
                : <button className="otp-resend-btn" onClick={() => sendOTP(true)}>Resend code</button>
              }
            </div>
          </div>
        )}

        <div className="auth-switch" style={{ marginTop: 16 }}>
          Already have an account? <Link href="/auth/login">Sign in</Link>
        </div>
      </div>
    );
  }

  /* ════════════════════════════════════════════════════
     EMAIL FLOW
  ════════════════════════════════════════════════════ */
  if (method === 'email') {
    return (
      <div className="page-anim auth-wrap">
        <div className="auth-logo">
          <div className="auth-logo-icon">{acctType === 'business' ? '🏪' : '👤'}</div>
          <div className="auth-logo-title">Mogarenta</div>
          <div className="auth-logo-sub">Sign up with Email</div>
        </div>

        {/* Email confirmation sent screen */}
        {emailSent ? (
          <div className="auth-card" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '3rem', marginBottom: 12 }}>📧</div>
            <div className="auth-card-title">Check your email</div>
            <div className="auth-card-sub" style={{ marginBottom: 20 }}>
              We sent a confirmation link to<br /><strong>{email}</strong>
            </div>
            <div style={{ fontSize: '.83rem', color: 'var(--text-muted)', marginBottom: 20, lineHeight: 1.6 }}>
              Click the link in the email to activate your account. You can then sign in.
            </div>
            <button className="btn btn-primary btn-full" onClick={() => router.push('/auth/login')}>
              Go to Sign In →
            </button>
          </div>
        ) : (
          <>
            {/* Step 1 — Account type */}
            {emailStep === 'type' && (
              <>
                <div className="acct-type-toggle">
                  <button className={`acct-type-btn ${acctType === 'user' ? 'active' : ''}`} onClick={() => setAcctType('user')}>
                    <span className="acct-type-icon">👤</span>
                    <span className="acct-type-label">Customer</span>
                    <span className="acct-type-sub">Shop &amp; track orders</span>
                  </button>
                  <button className={`acct-type-btn ${acctType === 'business' ? 'active' : ''}`} onClick={() => setAcctType('business')}>
                    <span className="acct-type-icon">🏪</span>
                    <span className="acct-type-label">Business</span>
                    <span className="acct-type-sub">Sell &amp; manage products</span>
                  </button>
                </div>
                <div style={{ padding: '0 20px', display: 'flex', gap: 10 }}>
                  <button className="btn btn-ghost btn-lg" style={{ flex: 1 }} onClick={() => setMethod(null)}>← Back</button>
                  <button className="btn btn-primary btn-lg" style={{ flex: 2 }} onClick={() => { setError(''); setEmailStep('details'); }}>
                    Continue →
                  </button>
                </div>
              </>
            )}

            {/* Step 2 — Details */}
            {emailStep === 'details' && (
              <div className="auth-card">
                <button className="auth-back-btn" onClick={() => { setEmailStep('type'); setError(''); }}>← Back</button>
                <div className="auth-card-title">Create your account</div>
                <div className="auth-card-sub">{acctType === 'business' ? 'Set up your business account' : 'Fill in your details below'}</div>

                {error && <div className="auth-error">{error}</div>}

                <div className="form-group" style={{ marginTop: 12 }}>
                  <label className="form-label">{acctType === 'business' ? 'Business Name' : 'Full Name'} *</label>
                  <input className="form-input"
                    placeholder={acctType === 'business' ? 'TechVault Store' : 'Ahmed Hassan'}
                    value={name} onChange={e => setName(e.target.value)} autoFocus
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Email Address *</label>
                  <input className="form-input" type="email" placeholder="you@example.com"
                    value={email} onChange={e => setEmail(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Password *</label>
                  <div style={{ position: 'relative' }}>
                    <input className="form-input"
                      type={showPass ? 'text' : 'password'} placeholder="Min. 6 characters"
                      value={password} onChange={e => setPassword(e.target.value)}
                      style={{ paddingRight: 42 }}
                    />
                    <button type="button" tabIndex={-1}
                      onClick={() => setShowPass(v => !v)}
                      style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '.88rem', color: 'var(--text-muted)' }}>
                      {showPass ? '🙈' : '👁️'}
                    </button>
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Confirm Password *</label>
                  <input className="form-input"
                    type={showPass ? 'text' : 'password'} placeholder="Repeat password"
                    value={password2} onChange={e => setPassword2(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleEmailSignup()}
                  />
                </div>

                <button className="btn btn-primary btn-full btn-lg" onClick={handleEmailSignup}
                  disabled={loading || !name.trim() || !email.trim() || password.length < 6 || !password2}>
                  {loading ? <><span className="btn-spinner" /> Creating account…</> : 'Create Account →'}
                </button>
              </div>
            )}
          </>
        )}

        <div className="auth-switch" style={{ marginTop: 16 }}>
          Already have an account? <Link href="/auth/login">Sign in</Link>
        </div>
      </div>
    );
  }

  /* ════════════════════════════════════════════════════
     GOOGLE FLOW
  ════════════════════════════════════════════════════ */
  return (
    <div className="page-anim auth-wrap">
      <div className="auth-logo">
        <div className="auth-logo-icon">{acctType === 'business' ? '🏪' : '👤'}</div>
        <div className="auth-logo-title">Mogarenta</div>
        <div className="auth-logo-sub">Sign up with Google</div>
      </div>

      {/* Step 1 — Account type */}
      {googleStep === 'type' && (
        <>
          <div className="acct-type-toggle">
            <button className={`acct-type-btn ${acctType === 'user' ? 'active' : ''}`} onClick={() => setAcctType('user')}>
              <span className="acct-type-icon">👤</span>
              <span className="acct-type-label">Customer</span>
              <span className="acct-type-sub">Shop &amp; track orders</span>
            </button>
            <button className={`acct-type-btn ${acctType === 'business' ? 'active' : ''}`} onClick={() => setAcctType('business')}>
              <span className="acct-type-icon">🏪</span>
              <span className="acct-type-label">Business</span>
              <span className="acct-type-sub">Sell &amp; manage products</span>
            </button>
          </div>
          <div style={{ padding: '0 20px', display: 'flex', gap: 10 }}>
            <button className="btn btn-ghost btn-lg" style={{ flex: 1 }} onClick={() => setMethod(null)}>← Back</button>
            <button className="btn btn-primary btn-lg" style={{ flex: 2 }} onClick={() => { setError(''); setGoogleStep('name'); }}>
              Continue →
            </button>
          </div>
        </>
      )}

      {/* Step 2 — Name + redirect */}
      {googleStep === 'name' && (
        <div className="auth-card">
          <button className="auth-back-btn" onClick={() => { setGoogleStep('type'); setError(''); }}>← Back</button>
          <div className="auth-card-title">{acctType === 'business' ? 'Business name' : 'Your name'}</div>
          <div className="auth-card-sub">
            {acctType === 'business'
              ? 'What is your business called?'
              : 'What should we call you? (or leave for Google to fill in)'}
          </div>

          {error && <div className="auth-error">{error}</div>}

          <div className="form-group" style={{ marginTop: 16 }}>
            <input className="form-input"
              placeholder={acctType === 'business' ? 'TechVault Store' : 'Ahmed Hassan (optional)'}
              value={name} onChange={e => setName(e.target.value)} autoFocus
            />
          </div>

          <button className="auth-google-btn" onClick={handleGoogleSignup} disabled={loading || (acctType === 'business' && !name.trim())}>
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
            You&apos;ll be redirected to Google to complete sign-up.
          </p>
        </div>
      )}

      <div className="auth-switch" style={{ marginTop: 16 }}>
        Already have an account? <Link href="/auth/login">Sign in</Link>
      </div>
    </div>
  );
}
