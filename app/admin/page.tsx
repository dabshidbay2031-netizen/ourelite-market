'use client';

import dynamic from 'next/dynamic';
import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useApp }  from '@/context/AppContext';
import type { Supplier, Product, Order } from '@/lib/types';
import Link from 'next/link';

/* ── Avoid SSR issues ─────────────────────────────────────────────── */
const AdminDashboard = dynamic(() => Promise.resolve(AdminDashboardInner), { ssr: false });
export default function AdminPage() { return <AdminDashboard />; }

/* ── Types ────────────────────────────────────────────────────────── */
interface AdminStats {
  totalBusinesses:      number;
  totalSuppliers:       number;
  totalProducts:        number;
  totalOrders:          number;
  totalRevenue:         number;
  totalUsers:           number;
  pendingVerifications: number;
  recentOrders:         Order[];
}
interface AdminUser {
  id: string; fullName: string; phone: string;
  avatar: string; verified: boolean; createdAt: string;
}

/* ── Helpers ──────────────────────────────────────────────────────── */
const fmtDate = (s: string) => s ? new Date(s).toLocaleDateString() : '—';
const fmtAmt  = (n: number) => `$${Number(n ?? 0).toFixed(2)}`;

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    completed: '#10B981', pending: '#F59E0B', cancelled: '#EF4444',
    processing: '#3B82F6', refunded: '#8B5CF6',
  };
  const color = map[status?.toLowerCase()] ?? '#64748B';
  return (
    <span style={{
      background: color + '22', color, border: `1px solid ${color}44`,
      borderRadius: 99, padding: '2px 10px', fontSize: '.72rem', fontWeight: 700,
      whiteSpace: 'nowrap',
    }}>
      {status || 'unknown'}
    </span>
  );
}

function PayBadge({ method }: { method: string }) {
  const map: Record<string, string> = { waafi: '#3B82F6', cash: '#10B981', card: '#8B5CF6' };
  const color = map[method?.toLowerCase()] ?? '#64748B';
  return (
    <span style={{
      background: color + '22', color, borderRadius: 99,
      padding: '2px 8px', fontSize: '.72rem', fontWeight: 600,
    }}>
      {method || '—'}
    </span>
  );
}

const EMOJIS = ['📦','🛍️','👕','👗','💄','🍎','🥦','💊','🔌','💻','📱','🎮','🏠','🚗','⚽','📚','🎵','🧴','👟','🧸'];

/* ── Main inner component ─────────────────────────────────────────── */
function AdminDashboardInner() {
  const { user, loading: authLoading } = useAuth();
  const { toast } = useApp();

  const adminUids = (process.env.NEXT_PUBLIC_ADMIN_UIDS ?? '').split(',').map(s => s.trim()).filter(Boolean);
  const isAdmin   = !!user?.id && adminUids.includes(user.id);

  /* ── Data state ─────────────────────────────────────────────────── */
  const [tab,       setTab]       = useState<'overview'|'businesses'|'products'|'orders'|'users'>('overview');
  const [stats,     setStats]     = useState<AdminStats | null>(null);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products,  setProducts]  = useState<Product[]>([]);
  const [orders,    setOrders]    = useState<Order[]>([]);
  const [users,     setUsers]     = useState<AdminUser[]>([]);
  const [loadingData, setLoadingData] = useState(false);

  /* ── Edit/Delete modals ─────────────────────────────────────────── */
  const [editSupplier, setEditSupplier] = useState<Supplier | null>(null);
  const [editProduct,  setEditProduct]  = useState<Product  | null>(null);
  const [confirmDel,   setConfirmDel]   = useState<{ type: string; id: number | string; name: string } | null>(null);

  /* ── Filters / search ───────────────────────────────────────────── */
  const [bizSearch,      setBizSearch]      = useState('');
  const [prodSearch,     setProdSearch]     = useState('');
  const [prodCategory,   setProdCategory]   = useState('');
  const [prodSupplier,   setProdSupplier]   = useState('');
  const [orderStatus,    setOrderStatus]    = useState('');
  const [userSearch,     setUserSearch]     = useState('');
  const [expandedOrder,  setExpandedOrder]  = useState<string | null>(null);

  /* ── Load data by tab ───────────────────────────────────────────── */
  const load = useCallback(async (t: typeof tab) => {
    setLoadingData(true);
    try {
      if (t === 'overview') {
        const r = await fetch('/api/admin/stats');
        if (r.ok) setStats(await r.json());
      } else if (t === 'businesses') {
        const r = await fetch('/api/suppliers');
        if (r.ok) setSuppliers(await r.json());
      } else if (t === 'products') {
        const [pr, sr] = await Promise.all([fetch('/api/products'), fetch('/api/suppliers')]);
        if (pr.ok) setProducts(await pr.json());
        if (sr.ok) setSuppliers(await sr.json());
      } else if (t === 'orders') {
        const [or, pr] = await Promise.all([fetch('/api/orders'), fetch('/api/products')]);
        if (or.ok) setOrders(await or.json());
        if (pr.ok) setProducts(await pr.json());
      } else if (t === 'users') {
        const r = await fetch('/api/admin/users');
        if (r.ok) setUsers(await r.json());
      }
    } catch { toast('Failed to load data', 'error'); }
    setLoadingData(false);
  }, [toast]);

  useEffect(() => { if (isAdmin) load(tab); }, [tab, isAdmin]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Guards ─────────────────────────────────────────────────────── */
  if (authLoading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100dvh', color: 'var(--text-muted)' }}>
      Loading…
    </div>
  );
  if (!user) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100dvh', gap: 16 }}>
      <div style={{ fontSize: '2rem' }}>🔒</div>
      <p>Please <Link href="/auth/login" style={{ color: 'var(--primary)', fontWeight: 700 }}>log in</Link> to access the admin panel.</p>
    </div>
  );
  if (!isAdmin) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100dvh', gap: 12, padding: 24, textAlign: 'center' }}>
      <div style={{ fontSize: '2.5rem' }}>🚫</div>
      <h2 style={{ fontWeight: 700 }}>Access Denied</h2>
      <p style={{ color: 'var(--text-muted)', maxWidth: 400 }}>
        Your account is not authorized. Add your UID to <code style={{ background: 'var(--bg)', padding: '2px 6px', borderRadius: 4 }}>NEXT_PUBLIC_ADMIN_UIDS</code> in <code>.env.local</code>.
      </p>
      <p style={{ fontSize: '.8rem', color: 'var(--text-muted)', background: 'var(--bg)', padding: '8px 16px', borderRadius: 8, fontFamily: 'monospace', wordBreak: 'break-all' }}>
        Your UID: {user.id}
      </p>
    </div>
  );

  /* ── Derived lists ──────────────────────────────────────────────── */
  const filteredBiz = suppliers.filter(s => {
    const q = bizSearch.toLowerCase();
    return !q || s.name.toLowerCase().includes(q) || s.location.toLowerCase().includes(q);
  });
  const categories = Array.from(new Set(products.map(p => p.category).filter(Boolean)));
  const filteredProducts = products.filter(p => {
    const q = prodSearch.toLowerCase();
    const matchQ  = !q || p.name.toLowerCase().includes(q) || (p.sku ?? '').toLowerCase().includes(q);
    const matchCat = !prodCategory || p.category === prodCategory;
    const matchSup = !prodSupplier || String(p.supplierId) === prodSupplier;
    return matchQ && matchCat && matchSup;
  });
  const filteredOrders = orders.filter(o => !orderStatus || o.status === orderStatus);
  const filteredUsers  = users.filter(u => {
    const q = userSearch.toLowerCase();
    return !q || u.fullName.toLowerCase().includes(q) || u.phone.includes(q);
  });

  /* ── CRUD handlers ──────────────────────────────────────────────── */
  async function saveSupplier(id: number, body: Record<string, unknown>) {
    const r = await fetch(`/api/suppliers/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    if (r.ok) {
      const updated = await r.json();
      setSuppliers(prev => prev.map(s => s.id === id ? updated : s));
      toast('Supplier updated', 'success');
      setEditSupplier(null);
    } else toast('Update failed', 'error');
  }

  async function saveProduct(id: number, body: Record<string, unknown>) {
    const r = await fetch(`/api/products/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    if (r.ok) {
      const updated = await r.json();
      setProducts(prev => prev.map(p => p.id === id ? updated : p));
      toast('Product updated', 'success');
      setEditProduct(null);
    } else toast('Update failed', 'error');
  }

  async function handleDelete() {
    if (!confirmDel) return;
    const { type, id } = confirmDel;
    const url = type === 'supplier' ? `/api/suppliers/${id}` : `/api/products/${id}`;
    const r = await fetch(url, { method: 'DELETE' });
    if (r.ok) {
      if (type === 'supplier') setSuppliers(prev => prev.filter(s => s.id !== id));
      else setProducts(prev => prev.filter(p => p.id !== id));
      toast('Deleted successfully', 'success');
    } else toast('Delete failed', 'error');
    setConfirmDel(null);
  }

  async function deleteUser(id: string) {
    const r = await fetch(`/api/profile/${id}`, { method: 'DELETE' });
    if (r.status === 405 || r.status === 404) {
      toast('Use Supabase dashboard to delete users', 'warning');
    } else if (r.ok) {
      setUsers(prev => prev.filter(u => u.id !== id));
      toast('User deleted', 'success');
    } else toast('Delete failed', 'error');
  }

  /* ── Skeleton ───────────────────────────────────────────────────── */
  const Skel = ({ w = '100%', h = 18 }: { w?: string | number; h?: number }) => (
    <div style={{ width: w, height: h, background: 'var(--border)', borderRadius: 6, animation: 'mgPulse 1.4s ease-in-out infinite' }} />
  );

  /* ── Shared table styles ────────────────────────────────────────── */
  const thStyle: React.CSSProperties = { padding: '10px 12px', textAlign: 'left', fontSize: '.75rem', fontWeight: 700, color: 'var(--text-muted)', borderBottom: '2px solid var(--border)', whiteSpace: 'nowrap' };
  const tdStyle: React.CSSProperties = { padding: '10px 12px', fontSize: '.83rem', borderBottom: '1px solid var(--border-light)', verticalAlign: 'middle' };

  /* ─────────────────────────────────────────────────────────────────
     TAB: OVERVIEW
  ───────────────────────────────────────────────────────────────── */
  const TabOverview = () => {
    if (loadingData) return (
      <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
          {Array.from({ length: 6 }).map((_, i) => <Skel key={i} h={80} />)}
        </div>
        <Skel h={200} />
      </div>
    );
    if (!stats) return <p style={{ padding: 20, color: 'var(--text-muted)' }}>No data available.</p>;

    const cards = [
      { label: 'Businesses',  value: stats.totalBusinesses, icon: '🏪', color: 'var(--primary)' },
      { label: 'Suppliers',   value: stats.totalSuppliers,  icon: '🏭', color: '#7C3AED' },
      { label: 'Products',    value: stats.totalProducts,   icon: '📦', color: 'var(--secondary)' },
      { label: 'Orders',      value: stats.totalOrders,     icon: '🛒', color: '#06B6D4' },
      { label: 'Revenue',     value: fmtAmt(stats.totalRevenue), icon: '💰', color: 'var(--success)' },
      { label: 'Users',       value: stats.totalUsers,      icon: '👥', color: '#F59E0B' },
    ];

    return (
      <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 20 }}>
        {stats.pendingVerifications > 0 && (
          <div style={{ background: '#FEF3C7', border: '1px solid #F59E0B', borderRadius: 10, padding: '10px 16px', color: '#92400E', fontWeight: 600, fontSize: '.88rem', display: 'flex', alignItems: 'center', gap: 8 }}>
            ⚠️ {stats.pendingVerifications} pending verification{stats.pendingVerifications > 1 ? 's' : ''}
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(140px,1fr))', gap: 12 }}>
          {cards.map(c => (
            <div key={c.label} style={{ background: 'var(--surface)', borderRadius: 12, padding: '16px 14px', boxShadow: 'var(--shadow)', borderTop: `3px solid ${c.color}` }}>
              <div style={{ fontSize: '1.5rem', marginBottom: 6 }}>{c.icon}</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: c.color }}>{c.value}</div>
              <div style={{ fontSize: '.72rem', color: 'var(--text-muted)', fontWeight: 500 }}>{c.label}</div>
            </div>
          ))}
        </div>

        <div style={{ background: 'var(--surface)', borderRadius: 12, boxShadow: 'var(--shadow)', overflow: 'hidden' }}>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', fontWeight: 700, fontSize: '.9rem' }}>Recent Orders</div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Order ID','Customer','Items','Total','Payment','Status','Date'].map(h => (
                    <th key={h} style={thStyle}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {stats.recentOrders.length === 0 && (
                  <tr><td colSpan={7} style={{ ...tdStyle, textAlign: 'center', color: 'var(--text-muted)' }}>No orders yet</td></tr>
                )}
                {stats.recentOrders.map(o => (
                  <tr key={o.id}>
                    <td style={tdStyle}><span style={{ fontFamily: 'monospace', fontSize: '.75rem' }}>{String(o.id).slice(0, 8)}…</span></td>
                    <td style={tdStyle}>{o.customerName || '—'}</td>
                    <td style={tdStyle}>{(Array.isArray(o.items) ? o.items : []).length}</td>
                    <td style={tdStyle}>{fmtAmt(o.total)}</td>
                    <td style={tdStyle}><PayBadge method={o.paymentMethod} /></td>
                    <td style={tdStyle}><StatusBadge status={o.status} /></td>
                    <td style={tdStyle}>{fmtDate(o.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  /* ─────────────────────────────────────────────────────────────────
     TAB: BUSINESSES
  ───────────────────────────────────────────────────────────────── */
  const TabBusinesses = () => {
    const [form, setForm] = useState(editSupplier ? {
      name: editSupplier.name, bio: editSupplier.bio ?? '', location: editSupplier.location,
      verified: editSupplier.verified, accountType: editSupplier.accountType ?? 'business',
    } : { name: '', bio: '', location: '', verified: false, accountType: 'business' });

    useEffect(() => {
      if (editSupplier) setForm({
        name: editSupplier.name, bio: editSupplier.bio ?? '', location: editSupplier.location,
        verified: editSupplier.verified, accountType: editSupplier.accountType ?? 'business',
      });
    }, []);

    if (loadingData) return <div style={{ padding: 20 }}><Skel h={300} /></div>;

    return (
      <div style={{ padding: 20 }}>
        <div style={{ marginBottom: 14, display: 'flex', gap: 10 }}>
          <input className="form-input" placeholder="Search name or location…" value={bizSearch}
            onChange={e => setBizSearch(e.target.value)} style={{ flex: 1 }} />
        </div>
        <div style={{ background: 'var(--surface)', borderRadius: 12, boxShadow: 'var(--shadow)', overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>{['Name','Type','Location','Verified','Created','Actions'].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {filteredBiz.length === 0 && (
                  <tr><td colSpan={6} style={{ ...tdStyle, textAlign: 'center', color: 'var(--text-muted)' }}>No results</td></tr>
                )}
                {filteredBiz.map(s => (
                  <tr key={s.id} style={{ transition: 'background .15s' }} onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg)')} onMouseLeave={e => (e.currentTarget.style.background = '')}>
                    <td style={tdStyle}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: '1.3rem' }}>{s.icon}</span>
                        <span style={{ fontWeight: 600 }}>{s.name}</span>
                      </div>
                    </td>
                    <td style={tdStyle}>
                      <span style={{ background: s.accountType === 'supplier' ? '#EDE9FE' : '#EFF6FF', color: s.accountType === 'supplier' ? '#7C3AED' : '#1D4ED8', padding: '2px 8px', borderRadius: 99, fontSize: '.72rem', fontWeight: 700 }}>
                        {s.accountType === 'supplier' ? '🏭 Supplier' : '🏪 Business'}
                      </span>
                    </td>
                    <td style={tdStyle}>{s.location || '—'}</td>
                    <td style={tdStyle}>
                      {s.verified
                        ? <span style={{ color: 'var(--success)', fontWeight: 700, fontSize: '.8rem' }}>✅ Verified</span>
                        : <span style={{ color: 'var(--text-muted)', fontWeight: 700, fontSize: '.8rem' }}>⏳ Pending</span>}
                    </td>
                    <td style={tdStyle}>{fmtDate((s as unknown as Record<string, unknown>).createdAt as string ?? '')}</td>
                    <td style={tdStyle}>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => setEditSupplier(s)}>Edit</button>
                        <button className="btn btn-ghost btn-sm" style={{ color: s.verified ? 'var(--warning)' : 'var(--success)' }}
                          onClick={() => saveSupplier(s.id, { verified: !s.verified })}>
                          {s.verified ? 'Unverify' : 'Verify'}
                        </button>
                        <button className="btn btn-danger btn-sm" onClick={() => setConfirmDel({ type: 'supplier', id: s.id, name: s.name })}>Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Edit Modal */}
        {editSupplier && (
          <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setEditSupplier(null); }}>
            <div className="modal-box">
              <div className="modal-header">
                <span>Edit Supplier — {editSupplier.name}</span>
                <button className="modal-close" onClick={() => setEditSupplier(null)}>✕</button>
              </div>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Name</label>
                  <input className="form-input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Bio</label>
                  <textarea className="form-input" rows={3} value={form.bio} onChange={e => setForm(f => ({ ...f, bio: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Location</label>
                  <input className="form-input" value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} />
                </div>
                <div className="form-group" style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontWeight: 600, fontSize: '.88rem' }}>
                    <input type="checkbox" checked={form.verified} onChange={e => setForm(f => ({ ...f, verified: e.target.checked }))} />
                    Verified
                  </label>
                </div>
                <div className="form-group">
                  <label className="form-label">Account Type</label>
                  <select className="form-input" value={form.accountType} onChange={e => setForm(f => ({ ...f, accountType: e.target.value }))}>
                    <option value="business">Business</option>
                    <option value="supplier">Supplier</option>
                  </select>
                </div>
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 8 }}>
                  <button className="btn btn-ghost" onClick={() => setEditSupplier(null)}>Cancel</button>
                  <button className="btn btn-primary" onClick={() => saveSupplier(editSupplier.id, form)}>Save</button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  /* ─────────────────────────────────────────────────────────────────
     TAB: PRODUCTS
  ───────────────────────────────────────────────────────────────── */
  const TabProducts = () => {
    const [form, setForm] = useState(editProduct ? {
      name: String(editProduct.name), price: String(editProduct.price),
      originalPrice: String(editProduct.originalPrice), category: editProduct.category,
      icon: editProduct.icon, stock: String(editProduct.stock), moq: String(editProduct.moq ?? 1),
      description: editProduct.description,
    } : { name: '', price: '', originalPrice: '', category: '', icon: '📦', stock: '', moq: '1', description: '' });
    const [showEmojiPicker, setShowEmojiPicker] = useState(false);

    useEffect(() => {
      if (editProduct) setForm({
        name: String(editProduct.name), price: String(editProduct.price),
        originalPrice: String(editProduct.originalPrice), category: editProduct.category,
        icon: editProduct.icon, stock: String(editProduct.stock), moq: String(editProduct.moq ?? 1),
        description: editProduct.description,
      });
    }, []);

    if (loadingData) return <div style={{ padding: 20 }}><Skel h={300} /></div>;

    return (
      <div style={{ padding: 20 }}>
        <div style={{ marginBottom: 14, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <input className="form-input" placeholder="Search name or SKU…" value={prodSearch}
            onChange={e => setProdSearch(e.target.value)} style={{ flex: 1, minWidth: 180 }} />
          <select className="form-input" value={prodCategory} onChange={e => setProdCategory(e.target.value)} style={{ minWidth: 130 }}>
            <option value="">All categories</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select className="form-input" value={prodSupplier} onChange={e => setProdSupplier(e.target.value)} style={{ minWidth: 150 }}>
            <option value="">All suppliers</option>
            {suppliers.map(s => <option key={s.id} value={String(s.id)}>{s.name}</option>)}
          </select>
        </div>
        <div style={{ background: 'var(--surface)', borderRadius: 12, boxShadow: 'var(--shadow)', overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>{['Photo','Name / SKU','Category','Price','Stock','Supplier','B2B','MOQ','Actions'].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {filteredProducts.length === 0 && (
                  <tr><td colSpan={9} style={{ ...tdStyle, textAlign: 'center', color: 'var(--text-muted)' }}>No results</td></tr>
                )}
                {filteredProducts.map(p => {
                  const imgSrc = (p.imageUrls && p.imageUrls.length > 0) ? p.imageUrls[0] : p.imageUrl;
                  const sup    = suppliers.find(s => s.id === p.supplierId);
                  return (
                    <tr key={p.id} onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg)')} onMouseLeave={e => (e.currentTarget.style.background = '')}>
                      <td style={tdStyle}>
                        {imgSrc
                          ? <img src={imgSrc} alt={String(p.name)} style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 8 }} />
                          : <span style={{ fontSize: '1.8rem', display: 'block', textAlign: 'center' }}>{p.icon}</span>}
                      </td>
                      <td style={tdStyle}>
                        <div style={{ fontWeight: 600 }}>{String(p.name)}</div>
                        <div style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>{p.sku}</div>
                      </td>
                      <td style={tdStyle}>
                        <div style={{ fontSize: '.8rem' }}>{p.category}</div>
                        {p.subCategory && <div style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>{p.subCategory}</div>}
                      </td>
                      <td style={tdStyle}>
                        <div style={{ fontWeight: 700 }}>{fmtAmt(p.price)}</div>
                        {p.originalPrice > p.price && <div style={{ fontSize: '.72rem', color: 'var(--text-muted)', textDecoration: 'line-through' }}>{fmtAmt(p.originalPrice)}</div>}
                      </td>
                      <td style={tdStyle}>{p.stock}</td>
                      <td style={tdStyle}>{sup?.name ?? <span style={{ color: 'var(--text-muted)' }}>—</span>}</td>
                      <td style={tdStyle}>
                        {p.isB2b && <span style={{ background: '#EDE9FE', color: '#7C3AED', padding: '2px 8px', borderRadius: 99, fontSize: '.72rem', fontWeight: 700 }}>B2B</span>}
                      </td>
                      <td style={tdStyle}>{p.moq ?? 1}</td>
                      <td style={tdStyle}>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button className="btn btn-ghost btn-sm" onClick={() => setEditProduct(p)}>Edit</button>
                          <button className="btn btn-danger btn-sm" onClick={() => setConfirmDel({ type: 'product', id: p.id, name: String(p.name) })}>Delete</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Product Edit Modal */}
        {editProduct && (
          <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setEditProduct(null); }}>
            <div className="modal-box">
              <div className="modal-header">
                <span>Edit Product — {String(editProduct.name)}</span>
                <button className="modal-close" onClick={() => setEditProduct(null)}>✕</button>
              </div>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Name</label>
                  <input className="form-input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div className="form-group">
                    <label className="form-label">Price ($)</label>
                    <input className="form-input" type="number" step="0.01" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Original Price ($)</label>
                    <input className="form-input" type="number" step="0.01" value={form.originalPrice} onChange={e => setForm(f => ({ ...f, originalPrice: e.target.value }))} />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div className="form-group">
                    <label className="form-label">Category</label>
                    <input className="form-input" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} />
                  </div>
                  <div className="form-group" style={{ position: 'relative' }}>
                    <label className="form-label">Icon Emoji</label>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button type="button" style={{ fontSize: '1.4rem', background: 'var(--bg)', border: '1.5px solid var(--border)', borderRadius: 8, padding: '6px 12px', cursor: 'pointer' }}
                        onClick={() => setShowEmojiPicker(v => !v)}>
                        {form.icon}
                      </button>
                      <input className="form-input" value={form.icon} onChange={e => setForm(f => ({ ...f, icon: e.target.value }))} style={{ flex: 1 }} />
                    </div>
                    {showEmojiPicker && (
                      <div style={{ position: 'absolute', top: '100%', left: 0, zIndex: 50, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 10, display: 'flex', flexWrap: 'wrap', gap: 6, width: 220, boxShadow: 'var(--shadow-lg)' }}>
                        {EMOJIS.map(em => (
                          <button key={em} type="button" style={{ fontSize: '1.3rem', background: 'none', border: 'none', cursor: 'pointer', padding: 4, borderRadius: 6 }}
                            onClick={() => { setForm(f => ({ ...f, icon: em })); setShowEmojiPicker(false); }}>
                            {em}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div className="form-group">
                    <label className="form-label">Stock</label>
                    <input className="form-input" type="number" value={form.stock} onChange={e => setForm(f => ({ ...f, stock: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">MOQ</label>
                    <input className="form-input" type="number" value={form.moq} onChange={e => setForm(f => ({ ...f, moq: e.target.value }))} />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Description</label>
                  <textarea className="form-input" rows={3} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
                </div>
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 8 }}>
                  <button className="btn btn-ghost" onClick={() => setEditProduct(null)}>Cancel</button>
                  <button className="btn btn-primary" onClick={() => saveProduct(editProduct.id, {
                    name: form.name, price: form.price, originalPrice: form.originalPrice,
                    category: form.category, icon: form.icon, stock: form.stock,
                    moq: form.moq, description: form.description,
                  })}>Save</button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  /* ─────────────────────────────────────────────────────────────────
     TAB: ORDERS
  ───────────────────────────────────────────────────────────────── */
  const TabOrders = () => {
    if (loadingData) return <div style={{ padding: 20 }}><Skel h={300} /></div>;
    const statuses = Array.from(new Set(orders.map(o => o.status).filter(Boolean)));
    return (
      <div style={{ padding: 20 }}>
        <div style={{ marginBottom: 14, display: 'flex', gap: 10 }}>
          <select className="form-input" value={orderStatus} onChange={e => setOrderStatus(e.target.value)} style={{ minWidth: 150 }}>
            <option value="">All statuses</option>
            {statuses.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div style={{ background: 'var(--surface)', borderRadius: 12, boxShadow: 'var(--shadow)', overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>{['Order ID','Customer','Phone','Items','Total','Payment','Status','Date'].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {filteredOrders.length === 0 && (
                  <tr><td colSpan={8} style={{ ...tdStyle, textAlign: 'center', color: 'var(--text-muted)' }}>No orders</td></tr>
                )}
                {filteredOrders.map(o => {
                  const items = Array.isArray(o.items) ? o.items : [];
                  const isExpanded = expandedOrder === o.id;
                  return (
                    <React.Fragment key={o.id}>
                      <tr
                        onClick={() => setExpandedOrder(isExpanded ? null : o.id)}
                        style={{ cursor: 'pointer', background: isExpanded ? 'var(--primary-light)' : '' }}
                        onMouseEnter={e => { if (!isExpanded) e.currentTarget.style.background = 'var(--bg)'; }}
                        onMouseLeave={e => { if (!isExpanded) e.currentTarget.style.background = ''; }}
                      >
                        <td style={tdStyle}><span style={{ fontFamily: 'monospace', fontSize: '.75rem' }}>{String(o.id).slice(0, 8)}…</span></td>
                        <td style={tdStyle}>{o.customerName || '—'}</td>
                        <td style={tdStyle}>{o.customerPhone || '—'}</td>
                        <td style={tdStyle}>{items.length}</td>
                        <td style={tdStyle}>{fmtAmt(o.total)}</td>
                        <td style={tdStyle}><PayBadge method={o.paymentMethod} /></td>
                        <td style={tdStyle}><StatusBadge status={o.status} /></td>
                        <td style={tdStyle}>{fmtDate(o.createdAt)}</td>
                      </tr>
                      {isExpanded && (
                        <tr>
                          <td colSpan={8} style={{ padding: '0 12px 12px', background: 'var(--primary-light)' }}>
                            <div style={{ paddingTop: 8, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                              {items.map((item: { id: number; qty: number }, idx: number) => {
                                const prod = products.find(p => p.id === item.id);
                                return (
                                  <span key={idx} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '4px 12px', fontSize: '.8rem', fontWeight: 600 }}>
                                    {prod?.icon ?? '📦'} {prod ? String(prod.name) : `Product #${item.id}`} × {item.qty}
                                  </span>
                                );
                              })}
                              {items.length === 0 && <span style={{ color: 'var(--text-muted)', fontSize: '.8rem' }}>No items data</span>}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  /* ─────────────────────────────────────────────────────────────────
     TAB: USERS
  ───────────────────────────────────────────────────────────────── */
  const TabUsers = () => {
    if (loadingData) return <div style={{ padding: 20 }}><Skel h={300} /></div>;
    return (
      <div style={{ padding: 20 }}>
        <div style={{ marginBottom: 14 }}>
          <input className="form-input" placeholder="Search by name or phone…" value={userSearch}
            onChange={e => setUserSearch(e.target.value)} style={{ maxWidth: 320 }} />
        </div>
        <div style={{ background: 'var(--surface)', borderRadius: 12, boxShadow: 'var(--shadow)', overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>{['Avatar','Full Name','Phone','Verified','Joined','Actions'].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {filteredUsers.length === 0 && (
                  <tr><td colSpan={6} style={{ ...tdStyle, textAlign: 'center', color: 'var(--text-muted)' }}>No users found</td></tr>
                )}
                {filteredUsers.map(u => (
                  <tr key={u.id} onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg)')} onMouseLeave={e => (e.currentTarget.style.background = '')}>
                    <td style={tdStyle}><span style={{ fontSize: '1.5rem' }}>{u.avatar || '👤'}</span></td>
                    <td style={tdStyle}><span style={{ fontWeight: 600 }}>{u.fullName || <span style={{ color: 'var(--text-muted)' }}>—</span>}</span></td>
                    <td style={tdStyle}>{u.phone || '—'}</td>
                    <td style={tdStyle}>
                      {u.verified
                        ? <span style={{ color: 'var(--success)', fontWeight: 700, fontSize: '.8rem' }}>✅ Yes</span>
                        : <span style={{ color: 'var(--text-muted)', fontSize: '.8rem' }}>No</span>}
                    </td>
                    <td style={tdStyle}>{fmtDate(u.createdAt)}</td>
                    <td style={tdStyle}>
                      <button className="btn btn-danger btn-sm" onClick={() => deleteUser(u.id)}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  /* ── Confirm Delete Dialog ───────────────────────────────────────── */
  const ConfirmDialog = () => {
    if (!confirmDel) return null;
    return (
      <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setConfirmDel(null); }}>
        <div className="modal-box" style={{ maxWidth: 400 }}>
          <div className="modal-header">
            <span>Confirm Delete</span>
            <button className="modal-close" onClick={() => setConfirmDel(null)}>✕</button>
          </div>
          <div className="modal-body">
            <p style={{ marginBottom: 20, color: 'var(--text-muted)' }}>
              Are you sure you want to delete <strong style={{ color: 'var(--text)' }}>{confirmDel.name}</strong>? This cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setConfirmDel(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={handleDelete}>Delete</button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const TABS = [
    { key: 'overview',    label: 'Overview' },
    { key: 'businesses',  label: 'Businesses' },
    { key: 'products',    label: 'Products' },
    { key: 'orders',      label: 'Orders' },
    { key: 'users',       label: 'Users' },
  ] as const;

  /* ── Render ─────────────────────────────────────────────────────── */
  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg)' }}>
      {/* Admin Header */}
      <header style={{ position: 'sticky', top: 0, zIndex: 100, background: 'var(--surface)', borderBottom: '1px solid var(--border)', padding: '0 20px', height: 60, display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: '0 1px 3px rgba(0,0,0,.06)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: '1.3rem' }}>⚙️</span>
          <span style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--primary)' }}>Mogarenta Admin</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: '.8rem', color: 'var(--text-muted)' }}>{user.displayName ?? user.email ?? user.id.slice(0, 8)}</span>
          <Link href="/" style={{ fontSize: '.8rem', color: 'var(--primary)', fontWeight: 600 }}>← Store</Link>
        </div>
      </header>

      {/* Tab Bar */}
      <div style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)', padding: '0 20px', display: 'flex', gap: 4, overflowX: 'auto' }}>
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              padding: '14px 16px', background: 'none', border: 'none', cursor: 'pointer',
              fontSize: '.88rem', fontWeight: 700, whiteSpace: 'nowrap',
              color: tab === t.key ? 'var(--primary)' : 'var(--text-muted)',
              borderBottom: tab === t.key ? '2px solid var(--primary)' : '2px solid transparent',
              transition: 'all .15s',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        {tab === 'overview'   && <TabOverview />}
        {tab === 'businesses' && <TabBusinesses />}
        {tab === 'products'   && <TabProducts />}
        {tab === 'orders'     && <TabOrders />}
        {tab === 'users'      && <TabUsers />}
      </div>

      <ConfirmDialog />
    </div>
  );
}
