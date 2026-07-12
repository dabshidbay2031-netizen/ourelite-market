'use client';

import { useState, useEffect, useCallback } from 'react';
import Header from '@/components/Header';
import { useAuth } from '@/context/AuthContext';
import { useCashier } from '@/context/CashierContext';
import { PRIVILEGES, DEFAULT_PRIVILEGES } from '@/lib/cashierPrivileges';

interface Cashier {
  id:          string;
  businessId:  string;
  name:        string;
  phone:       string;
  privileges:  string[];
  isActive:    boolean;
  lastLoginAt: string | null;
  createdAt:   string;
}

/* ── Small reusable components ─────────────────────────────── */
function PrivilegeTags({ keys }: { keys: string[] }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
      {PRIVILEGES.filter(p => keys.includes(p.key)).map(p => (
        <span key={p.key} style={{
          background: 'var(--primary-light, #EEF2FF)', color: 'var(--primary)',
          borderRadius: 6, padding: '2px 7px', fontSize: '.7rem', fontWeight: 600,
        }}>{p.label}</span>
      ))}
    </div>
  );
}

/* ── Main view ─────────────────────────────────────────────── */
export default function StaffView() {
  const { user } = useAuth();
  const { cashier, updateCashierSession, logoutCashier } = useCashier();

  const [cashiers,  setCashiers]  = useState<Cashier[]>([]);
  const [fetching,  setFetching]  = useState(true);

  /* ── Add / Edit modal ── */
  const [showModal, setShowModal] = useState(false);
  const [editing,   setEditing]   = useState<Cashier | null>(null);
  const [form,      setForm]      = useState({ name: '', phone: '', password: '', confirmPassword: '' });
  const [privs,     setPrivs]     = useState<string[]>(DEFAULT_PRIVILEGES);
  const [saving,    setSaving]    = useState(false);
  const [formError, setFormError] = useState('');
  const [showPw,    setShowPw]    = useState(false);

  /* ── Change password modal ── */
  const [showPwModal, setShowPwModal] = useState(false);
  const [pwTarget,    setPwTarget]    = useState<Cashier | null>(null);
  const [newPw,       setNewPw]       = useState('');
  const [confirmPw,   setConfirmPw]   = useState('');
  const [pwError,     setPwError]     = useState('');
  const [pwSaving,    setPwSaving]    = useState(false);

  const load = useCallback(async () => {
    if (!user?.id) return;
    setFetching(true);
    try {
      const res = await fetch(`/api/cashiers?businessId=${user.id}`);
      if (res.ok) setCashiers(await res.json());
    } catch { /* offline */ }
    setFetching(false);
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);

  /* ── Open add modal ── */
  function openAdd() {
    setEditing(null);
    setForm({ name: '', phone: '', password: '', confirmPassword: '' });
    setPrivs(DEFAULT_PRIVILEGES);
    setFormError('');
    setShowPw(false);
    setShowModal(true);
  }

  /* ── Open edit modal ── */
  function openEdit(c: Cashier) {
    setEditing(c);
    setForm({ name: c.name, phone: c.phone, password: '', confirmPassword: '' });
    setPrivs([...c.privileges]);
    setFormError('');
    setShowPw(false);
    setShowModal(true);
  }

  /* ── Toggle privilege ── */
  function togglePriv(key: string) {
    setPrivs(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
  }

  /* ── Save cashier ── */
  async function handleSave() {
    setFormError('');
    if (!form.name.trim())  { setFormError('Name is required');  return; }
    if (!form.phone.trim()) { setFormError('Phone is required'); return; }
    if (!editing) {
      if (!form.password)                          { setFormError('Password is required'); return; }
      if (form.password.length < 4)                { setFormError('Password must be at least 4 characters'); return; }
      if (form.password !== form.confirmPassword)  { setFormError('Passwords do not match'); return; }
    }

    setSaving(true);
    try {
      let res: Response;
      if (editing) {
        res = await fetch(`/api/cashiers/${editing.id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: form.name, phone: form.phone, privileges: privs }),
        });
      } else {
        res = await fetch('/api/cashiers', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ businessId: user!.id, name: form.name, phone: form.phone, password: form.password, privileges: privs }),
        });
      }
      const data = await res.json();
      if (!res.ok) { setFormError(data.error ?? 'Failed to save'); setSaving(false); return; }

      if (editing) {
        setCashiers(prev => prev.map(c => c.id === editing.id ? data : c));
      } else {
        setCashiers(prev => [data, ...prev]);
      }

      if (cashier && cashier.id === data.id) {
        if (data.isActive === false) {
          logoutCashier();
        } else {
          updateCashierSession({
            id: data.id,
            name: data.name,
            phone: data.phone,
            businessId: data.businessId,
            privileges: data.privileges ?? [],
            loginAt: cashier.loginAt,
          });
        }
      }

      setShowModal(false);
    } catch {
      setFormError('Network error');
    }
    setSaving(false);
  }

  /* ── Toggle active ── */
  async function toggleActive(c: Cashier) {
    const res = await fetch(`/api/cashiers/${c.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !c.isActive }),
    });
    if (res.ok) {
      const updated = await res.json();
      setCashiers(prev => prev.map(x => x.id === c.id ? updated : x));
      if (cashier && cashier.id === updated.id) {
        if (updated.isActive === false) {
          logoutCashier();
        } else {
          updateCashierSession({
            id: updated.id,
            name: updated.name,
            phone: updated.phone,
            businessId: updated.businessId,
            privileges: updated.privileges ?? [],
            loginAt: cashier.loginAt,
          });
        }
      }
    }
  }

  /* ── Change password ── */
  function openPwModal(c: Cashier) {
    setPwTarget(c);
    setNewPw('');
    setConfirmPw('');
    setPwError('');
    setShowPwModal(true);
  }

  async function handleChangePassword() {
    setPwError('');
    if (newPw.length < 4)        { setPwError('Password must be at least 4 characters'); return; }
    if (newPw !== confirmPw)     { setPwError('Passwords do not match'); return; }
    setPwSaving(true);
    try {
      const res = await fetch(`/api/cashiers/${pwTarget!.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: newPw }),
      });
      if (res.ok) { setShowPwModal(false); }
      else        { const d = await res.json(); setPwError(d.error ?? 'Failed'); }
    } catch { setPwError('Network error'); }
    setPwSaving(false);
  }

  const fmt = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Never';

  return (
    <div className="page-anim">
      <Header showSearch={false} />

      <div className="page-title-bar">
        <span className="page-title">👥 Staff</span>
        <button className="btn btn-primary btn-sm" onClick={openAdd}>+ Add Cashier</button>
      </div>
      <p className="page-subtitle">Manage who can use the POS and what they can access</p>

      {fetching ? (
        <div style={{ padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[1,2].map(i => <div key={i} className="skeleton" style={{ height: 90, borderRadius: 12 }} />)}
        </div>
      ) : cashiers.length === 0 ? (
        <div className="empty-state" style={{ marginTop: 60 }}>
          <div className="empty-icon">👤</div>
          <div className="empty-title">No cashiers yet</div>
          <div className="empty-sub">Add your first cashier to let staff use the POS</div>
          <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={openAdd}>Add Cashier</button>
        </div>
      ) : (
        <div style={{ padding: '12px 16px 100px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {cashiers.map(c => (
            <div key={c.id} className="staff-card">
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 700, fontSize: '.95rem' }}>{c.name}</span>
                    <span className={`status-pill ${c.isActive ? 'status-active' : 'status-inactive'}`}>
                      {c.isActive ? '● Active' : '○ Inactive'}
                    </span>
                  </div>
                  <div style={{ fontSize: '.82rem', color: 'var(--text-light)', marginTop: 2 }}>{c.phone}</div>
                  <PrivilegeTags keys={c.privileges} />
                  <div style={{ fontSize: '.75rem', color: 'var(--text-muted)', marginTop: 6 }}>
                    Last login: {fmt(c.lastLoginAt)} · Added: {fmt(c.createdAt)}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button className="btn btn-sm btn-secondary" onClick={() => openEdit(c)}>Edit</button>
                  <button className="btn btn-sm btn-secondary" onClick={() => openPwModal(c)}>🔑</button>
                  <button
                    className="btn btn-sm btn-secondary"
                    onClick={() => toggleActive(c)}
                    title={c.isActive ? 'Deactivate' : 'Activate'}
                    style={c.isActive ? { color: '#dc2626' } : { color: '#059669' }}
                  >
                    {c.isActive ? '✕' : '✓'}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Add / Edit modal ── */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-box" style={{ maxWidth: 520 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              {editing ? `Edit — ${editing.name}` : '+ Add Cashier'}
              <button className="modal-close" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Full name</label>
                  <input className="form-input" value={form.name}
                    onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Ahmed Ali" />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Phone number</label>
                  <input className="form-input" type="tel" value={form.phone}
                    onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} placeholder="+252…" />
                </div>
              </div>

              {!editing && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">Password</label>
                    <div style={{ position: 'relative' }}>
                      <input className="form-input" type={showPw ? 'text' : 'password'}
                        value={form.password} placeholder="Min. 4 characters"
                        onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                        style={{ paddingRight: 36 }} />
                      <button type="button" onClick={() => setShowPw(v => !v)}
                        style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-light)', fontSize: '1rem' }}>
                        {showPw ? '🙈' : '👁'}
                      </button>
                    </div>
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">Confirm password</label>
                    <input className="form-input" type={showPw ? 'text' : 'password'}
                      value={form.confirmPassword} placeholder="Same as above"
                      onChange={e => setForm(p => ({ ...p, confirmPassword: e.target.value }))} />
                  </div>
                </div>
              )}

              {/* Privileges */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontWeight: 600, marginBottom: 8, fontSize: '.9rem' }}>Permissions</div>
                <div className="staff-priv-grid">
                  {PRIVILEGES.map(p => (
                    <label key={p.key} className={`staff-priv-item${privs.includes(p.key) ? ' selected' : ''}`}>
                      <input type="checkbox" checked={privs.includes(p.key)}
                        onChange={() => togglePriv(p.key)} style={{ display: 'none' }} />
                      <div style={{ fontWeight: 600, fontSize: '.82rem' }}>{p.label}</div>
                      <div style={{ fontSize: '.72rem', color: 'var(--text-light)', marginTop: 2 }}>{p.desc}</div>
                    </label>
                  ))}
                </div>
              </div>

              {formError && <div className="auth-error" style={{ marginBottom: 12 }}>{formError}</div>}

              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowModal(false)}>Cancel</button>
                <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleSave} disabled={saving}>
                  {saving ? 'Saving…' : editing ? 'Save Changes' : 'Add Cashier'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Change password modal ── */}
      {showPwModal && pwTarget && (
        <div className="modal-overlay" onClick={() => setShowPwModal(false)}>
          <div className="modal-box" style={{ maxWidth: 400 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              🔑 Change Password — {pwTarget.name}
              <button className="modal-close" onClick={() => setShowPwModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">New password</label>
                <input className="form-input" type="password" value={newPw}
                  onChange={e => setNewPw(e.target.value)} placeholder="Min. 4 characters" />
              </div>
              <div className="form-group">
                <label className="form-label">Confirm new password</label>
                <input className="form-input" type="password" value={confirmPw}
                  onChange={e => setConfirmPw(e.target.value)} placeholder="Same as above" />
              </div>
              {pwError && <div className="auth-error" style={{ marginBottom: 12 }}>{pwError}</div>}
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowPwModal(false)}>Cancel</button>
                <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleChangePassword} disabled={pwSaving}>
                  {pwSaving ? 'Saving…' : 'Change Password'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
