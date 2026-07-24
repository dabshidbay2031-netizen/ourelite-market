'use client';

import { useState } from 'react';
import { useRouter } from '@/lib/hashRouter';
import { storePath } from '@/lib/slug';
import Header from '@/components/Header';
import { authHeaders } from '@/lib/clientAuth';
import { useApp } from '@/context/AppContext';
import { useAuth } from '@/context/AuthContext';
import StoreAvatar from '@/components/StoreAvatar';
import type { Supplier } from '@/lib/types';

const CATEGORY_OPTIONS = ['electronics', 'fashion', 'home', 'food', 'health', 'sports'];
const SUPPLIER_ICONS   = ['🏭','🏪','🏬','🚚','🌿','💊','🎵','👗','🏠','🍎','📦','🔧','💡','🔬','🧪'];

interface SupplierForm {
  name: string; location: string; icon: string; description: string; categories: string[];
  discount: string; deliveryDays: string; minOrder: string; badge: string; verified: boolean;
}
const emptyForm: SupplierForm = {
  name:'', location:'', icon:'🏭', description:'', categories:[],
  discount:'0', deliveryDays:'3-5', minOrder:'0', badge:'New', verified: false,
};

export default function SuppliersPage() {
  const router = useRouter();
  const { state, toast, reloadSuppliers } = useApp();
  const { accountType } = useAuth();
  const { suppliers, products, loading } = state;
  // MOQ is wholesale-only information — plain customers don't see it.
  const isB2bViewer = accountType === 'business' || accountType === 'supplier';

  // A "supplier" is a WHOLESALER that sells to businesses — a distinct account
  // type from the retail businesses (and agents) that also live in the
  // suppliers table. This page lists only true suppliers.
  const wholesaleSuppliers = suppliers.filter(s => s.accountType === 'supplier');

  const [showForm, setShowForm]     = useState(false);
  const [editingId, setEditingId]   = useState<number | null>(null);
  const [form, setForm]             = useState<SupplierForm>(emptyForm);
  const [saving, setSaving]         = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const sf = (k: keyof SupplierForm, v: SupplierForm[typeof k]) =>
    setForm(f => ({ ...f, [k]: v }));

  const toggleCategory = (cat: string) => {
    setForm(f => ({
      ...f,
      categories: f.categories.includes(cat) ? f.categories.filter(c => c !== cat) : [...f.categories, cat],
    }));
  };

  const openAdd = () => { setEditingId(null); setForm(emptyForm); setShowForm(true); };

  const openEdit = (s: Supplier) => {
    setEditingId(s.id);
    setForm({
      name: s.name, location: s.location, icon: s.icon, description: s.description,
      categories: s.categories, discount: String(s.discount), deliveryDays: s.deliveryDays,
      minOrder: String(s.minOrder), badge: s.badge, verified: s.verified,
    });
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { toast('Business name is required', 'error'); return; }
    setSaving(true);
    const body = {
      name: form.name.trim(), location: form.location.trim(), icon: form.icon,
      description: form.description.trim(), categories: form.categories,
      discount: form.discount, deliveryDays: form.deliveryDays,
      minOrder: form.minOrder, badge: form.badge.trim(), verified: form.verified,
      // New entries from this page are wholesale suppliers, not retail
      // businesses. (account_type is create-only; the [id] PATCH ignores it.)
      ...(editingId ? {} : { accountType: 'supplier' }),
    };
    const url    = editingId ? `/api/suppliers/${editingId}` : '/api/suppliers';
    const method = editingId ? 'PATCH' : 'POST';
    const res = await fetch(url, { method, headers: await authHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify(body) });
    setSaving(false);
    if (res.ok) {
      toast(editingId ? 'Supplier updated ✓' : 'Supplier added ✓', 'success');
      setShowForm(false);
      await reloadSuppliers();
    } else {
      const err = await res.json();
      toast(err.error ?? 'Save failed', 'error');
    }
  };

  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
    setDeletingId(id);
    const res = await fetch(`/api/suppliers/${id}`, { method: 'DELETE', headers: await authHeaders() });
    setDeletingId(null);
    if (res.ok) { toast('Supplier deleted', 'default'); await reloadSuppliers(); }
    else toast('Delete failed', 'error');
  };

  return (
    <div className="page-anim">
      <Header showSearch={false} />

      <div className="page-title-bar">
        <span className="page-title">🚚 Suppliers</span>
        <button className="btn btn-primary btn-sm" onClick={openAdd}>+ Add Supplier</button>
      </div>
      <p className="page-subtitle">{wholesaleSuppliers.length} wholesale supplier{wholesaleSuppliers.length !== 1 ? 's' : ''}</p>

      <div className="supplier-list">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="supplier-card">
              <div className="supplier-banner">
                <div className="skeleton" style={{ width: 54, height: 54, borderRadius: 14, flexShrink: 0 }} />
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div className="skeleton" style={{ height: 14, width: '50%', borderRadius: 6 }} />
                  <div className="skeleton" style={{ height: 11, width: '35%', borderRadius: 6 }} />
                </div>
              </div>
              <div style={{ height: 60, background: 'var(--border-light)' }} />
            </div>
          ))
        ) : wholesaleSuppliers.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">🚚</div>
            <div className="empty-title">No suppliers yet</div>
            <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={openAdd}>Add First Supplier</button>
          </div>
        ) : (
          wholesaleSuppliers.map(supplier => {
            const supplierProducts = products.filter(p => supplier.productIds.includes(p.id));
            return (
              <div key={supplier.id} className="supplier-card">
                {/* Clickable header */}
                <div className="supplier-banner" style={{ cursor:'pointer' }} onClick={() => router.push(storePath(supplier))}>
                  <div className="supplier-logo"><StoreAvatar value={supplier.icon} /></div>
                  <div className="supplier-info">
                    <div className="supplier-name">{supplier.name}</div>
                    <div className="supplier-loc">
                      {supplier.onlineOnly
                        ? <><span>🌐</span> Online store</>
                        : <><span>📍</span> {supplier.location}</>}
                    </div>
                    <div className="supplier-badges">
                      {supplier.onlineOnly && <span className="sup-badge custom" style={{ background:'var(--primary)', color:'#fff' }}>🌐 Online</span>}
                      {supplier.verified && <span className="sup-badge verified">✓ Verified</span>}
                      <span className="sup-badge custom">{supplier.badge}</span>
                      {supplier.categories.map(c => <span key={c} className="sup-badge custom">{c}</span>)}
                    </div>
                  </div>
                </div>

                <div className="supplier-stats">
                  <div className="sup-stat"><div className="sup-stat-val">⭐ {supplier.rating}</div><div className="sup-stat-lbl">{supplier.reviews} reviews</div></div>
                  <div className="sup-stat"><div className="sup-stat-val">{supplier.discount}%</div><div className="sup-stat-lbl">Bulk Discount</div></div>
                  {isB2bViewer && (
                    <div className="sup-stat"><div className="sup-stat-val">{supplier.minOrder}</div><div className="sup-stat-lbl">Min Order</div></div>
                  )}
                  <div className="sup-stat"><div className="sup-stat-val">{supplier.deliveryDays}d</div><div className="sup-stat-lbl">Delivery</div></div>
                </div>

                {supplierProducts.length > 0 && (
                  <div className="supplier-products">
                    <div className="sup-products-title">Products ({supplierProducts.length})</div>
                    <div className="sup-products-scroll">
                      {supplierProducts.map(p => (
                        <div key={p.id} className="sup-product-chip" onClick={() => router.push(`/product/${p.id}`)}>
                          <div className="sup-product-icon">📦</div>
                          <div className="sup-product-name">{p.name}</div>
                          <div className="sup-product-price">${p.price.toFixed(2)}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="supplier-footer">
                  <button className="btn btn-outline btn-sm" onClick={() => router.push(storePath(supplier))}>View Profile</button>
                  <button className="btn btn-ghost btn-sm crud-edit-btn" onClick={() => openEdit(supplier)}>✏️ Edit</button>
                  <button
                    className="btn btn-ghost btn-sm crud-del-btn"
                    onClick={() => handleDelete(supplier.id, supplier.name)}
                    disabled={deletingId === supplier.id}
                  >
                    {deletingId === supplier.id ? '…' : '🗑️ Delete'}
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* ── Add / Edit Modal ─────────────────────────── */}
      {showForm && (
        <div className="modal-overlay" onClick={() => !saving && setShowForm(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span>{editingId ? '✏️ Edit Supplier' : '➕ Add Supplier'}</span>
              <button className="modal-close" onClick={() => setShowForm(false)}>✕</button>
            </div>
            <div className="modal-body">
              {/* Icon picker */}
              <div className="form-group">
                <label className="form-label">Icon</label>
                <div className="emoji-picker-row">
                  {SUPPLIER_ICONS.map(em => (
                    <button key={em} className={`avatar-opt ${form.icon === em ? 'selected' : ''}`} onClick={() => sf('icon', em)}>{em}</button>
                  ))}
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Business Name *</label>
                <input className="form-input" placeholder="e.g. TechVault Global" value={form.name} onChange={e => sf('name', e.target.value)} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div className="form-group">
                  <label className="form-label">Location</label>
                  <input className="form-input" placeholder="City, Country" value={form.location} onChange={e => sf('location', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Badge</label>
                  <input className="form-input" placeholder="e.g. Top Rated" value={form.badge} onChange={e => sf('badge', e.target.value)} />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Categories</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {CATEGORY_OPTIONS.map(cat => (
                    <button key={cat} className={`chip ${form.categories.includes(cat) ? 'active' : ''}`} onClick={() => toggleCategory(cat)}>{cat}</button>
                  ))}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                <div className="form-group">
                  <label className="form-label">Discount %</label>
                  <input className="form-input" type="number" min="0" max="100" placeholder="0" value={form.discount} onChange={e => sf('discount', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Delivery Days</label>
                  <input className="form-input" placeholder="3-5" value={form.deliveryDays} onChange={e => sf('deliveryDays', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Min Order</label>
                  <input className="form-input" type="number" min="0" placeholder="0" value={form.minOrder} onChange={e => sf('minOrder', e.target.value)} />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Description</label>
                <textarea className="form-input" rows={3} style={{ resize:'vertical', fontFamily:'inherit' }} placeholder="Tell buyers about this supplier…" value={form.description} onChange={e => sf('description', e.target.value)} maxLength={300} />
              </div>

              <div className="form-group" style={{ display:'flex', alignItems:'center', gap:10 }}>
                <input type="checkbox" id="verified" checked={form.verified} onChange={e => sf('verified', e.target.checked)} style={{ width:18, height:18, cursor:'pointer' }} />
                <label htmlFor="verified" style={{ cursor:'pointer', fontSize:'.9rem', fontWeight:600 }}>Mark as Verified ✓</label>
              </div>

              <button className="btn btn-primary btn-full btn-lg" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : editingId ? 'Update Supplier' : 'Add Supplier'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
