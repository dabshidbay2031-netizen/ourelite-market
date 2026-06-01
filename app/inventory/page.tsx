'use client';

import { useState, useMemo } from 'react';
import Header from '@/components/Header';
import { useApp } from '@/context/AppContext';
import { CATEGORIES } from '@/lib/data';

type StockFilter = 'all' | 'low' | 'out';

const EMOJI_OPTIONS = ['📦','📱','💻','🎧','👗','👟','🏠','🍎','💊','⚽','🎵','📷','🧴','🌿','☕','🍯','🥛','💡','🌬️','🩹','❤️','🧘','🪢','💪','🍶','🕶️','👔','📺','📲','⌚','🎮','🖱️','⌨️'];

interface ProductForm {
  name: string; price: string; originalPrice: string; category: string;
  icon: string; stock: string; sku: string; description: string; supplierId: string;
}
const emptyForm: ProductForm = { name:'', price:'', originalPrice:'', category:'electronics', icon:'📦', stock:'0', sku:'', description:'', supplierId:'' };

export default function InventoryPage() {
  const { state, adjustStock, toast, reloadProducts } = useApp();
  const { products, inventory, suppliers, loading } = state;

  const [search, setSearch]   = useState('');
  const [filter, setFilter]   = useState<StockFilter>('all');

  // ── CRUD state ───────────────────────────────────────────
  const [showForm, setShowForm]     = useState(false);
  const [editingId, setEditingId]   = useState<number | null>(null);
  const [form, setForm]             = useState<ProductForm>(emptyForm);
  const [saving, setSaving]         = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const pf = (k: keyof ProductForm, v: string) => setForm(f => ({ ...f, [k]: v }));

  const openAdd = () => {
    setEditingId(null);
    setForm(emptyForm);
    setShowForm(true);
  };

  const openEdit = (productId: number) => {
    const p = products.find(x => x.id === productId);
    if (!p) return;
    setEditingId(productId);
    setForm({
      name: p.name, price: String(p.price), originalPrice: String(p.originalPrice),
      category: p.category, icon: p.icon,
      stock: String(inventory.find(i => i.id === p.id)?.stock ?? p.stock),
      sku: p.sku, description: p.description,
      supplierId: p.supplierId ? String(p.supplierId) : '',
    });
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.price) { toast('Name and price required', 'error'); return; }
    setSaving(true);
    const body = {
      name: form.name.trim(), price: form.price, originalPrice: form.originalPrice || form.price,
      category: form.category, icon: form.icon, stock: form.stock, sku: form.sku.trim(),
      description: form.description.trim(), supplierId: form.supplierId ? parseInt(form.supplierId, 10) : null,
    };
    const url    = editingId ? `/api/products/${editingId}` : '/api/products';
    const method = editingId ? 'PATCH' : 'POST';
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    setSaving(false);
    if (res.ok) {
      toast(editingId ? 'Product updated ✓' : 'Product added ✓', 'success');
      setShowForm(false);
      await reloadProducts();
    } else {
      const err = await res.json();
      toast(err.error ?? 'Save failed', 'error');
    }
  };

  const handleDelete = async (productId: number, name: string) => {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
    setDeletingId(productId);
    const res = await fetch(`/api/products/${productId}`, { method: 'DELETE' });
    setDeletingId(null);
    if (res.ok) { toast('Product deleted', 'default'); await reloadProducts(); }
    else toast('Delete failed', 'error');
  };

  const handleRestock = (productId: number) => {
    const qty = parseInt(prompt('Enter restock quantity:') ?? '0', 10);
    if (qty > 0) { adjustStock(productId, qty); toast(`Restocked ${qty} units ✓`, 'success'); }
  };

  // ── Filtered items ───────────────────────────────────────
  const items = useMemo(() => {
    return products.map(p => ({
      ...p, stock: inventory.find(i => i.id === p.id)?.stock ?? p.stock,
    })).filter(p => {
      if (filter === 'low') return p.stock > 0 && p.stock <= 10;
      if (filter === 'out') return p.stock === 0;
      return true;
    }).filter(p => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q);
    });
  }, [products, inventory, filter, search]);

  const totalUnits = inventory.reduce((n, i) => n + i.stock, 0);
  const lowStock   = inventory.filter(i => i.stock > 0 && i.stock <= 10).length;
  const outOfStock = inventory.filter(i => i.stock === 0).length;
  const totalValue = products.reduce((n, p) => {
    const stock = inventory.find(i => i.id === p.id)?.stock ?? 0;
    return n + p.price * stock;
  }, 0);

  function stockClass(s: number) { return s === 0 ? 'stock-danger' : s <= 10 ? 'stock-warn' : 'stock-ok'; }
  function fillClass(s: number)  { return s === 0 ? 'fill-danger'  : s <= 10 ? 'fill-warn'  : 'fill-ok'; }

  return (
    <div className="page-anim">
      <Header showSearch={false} />

      <div className="page-title-bar">
        <span className="page-title">📦 Inventory</span>
        <button className="btn btn-primary btn-sm" onClick={openAdd}>+ Add Product</button>
      </div>
      <p className="page-subtitle">Manage stock levels and product catalogue</p>

      {/* Stats */}
      <div className="stats-grid">
        <div className="stat-card"><div className="stat-icon">📦</div><div className="stat-value">{totalUnits.toLocaleString()}</div><div className="stat-label">Total Units</div></div>
        <div className="stat-card warning"><div className="stat-icon">⚠️</div><div className="stat-value">{lowStock}</div><div className="stat-label">Low Stock</div></div>
        <div className="stat-card danger"><div className="stat-icon">❌</div><div className="stat-value">{outOfStock}</div><div className="stat-label">Out of Stock</div></div>
        <div className="stat-card success"><div className="stat-icon">💰</div><div className="stat-value">${Math.round(totalValue / 1000)}k</div><div className="stat-label">Total Value</div></div>
      </div>

      {/* Filters */}
      <div className="inventory-header">
        <input className="inv-search" placeholder="Search by name or SKU…" value={search} onChange={e => setSearch(e.target.value)} />
        <select className="inv-filter" value={filter} onChange={e => setFilter(e.target.value as StockFilter)}>
          <option value="all">All</option>
          <option value="low">Low Stock</option>
          <option value="out">Out of Stock</option>
        </select>
      </div>

      {/* List */}
      <div className="inv-list">
        {loading ? (
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="inv-item">
              <div className="skeleton" style={{ width: 46, height: 46, borderRadius: 10, flexShrink: 0 }} />
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div className="skeleton" style={{ height: 13, width: '60%', borderRadius: 6 }} />
                <div className="skeleton" style={{ height: 10, width: '30%', borderRadius: 6 }} />
                <div className="skeleton" style={{ height: 5, borderRadius: 99 }} />
              </div>
            </div>
          ))
        ) : items.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📦</div>
            <div className="empty-title">No items found</div>
            <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={openAdd}>Add First Product</button>
          </div>
        ) : (
          items.map(p => {
            const original = products.find(x => x.id === p.id);
            const maxStock = original?.stock ?? 100;
            const pct = Math.round((p.stock / Math.max(maxStock, 1)) * 100);
            return (
              <div key={p.id} className="inv-item">
                <div className="inv-item-icon">{p.icon}</div>
                <div className="inv-item-info">
                  <div className="inv-item-name">{p.name}</div>
                  <div className="inv-item-sku">{p.sku} · ${p.price.toFixed(2)}</div>
                  <div className="stock-bar-wrap">
                    <div className="stock-bar">
                      <div className={`stock-bar-fill ${fillClass(p.stock)}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                    </div>
                    <span className={`stock-count ${stockClass(p.stock)}`}>
                      {p.stock === 0 ? '❌ Out' : p.stock <= 10 ? `⚠️ ${p.stock}` : `${p.stock} units`}
                    </span>
                  </div>
                </div>
                <div className="inv-item-actions">
                  <button className="inv-action-btn" onClick={() => adjustStock(p.id, -1)} title="Remove 1">−</button>
                  <button className="inv-action-btn" onClick={() => adjustStock(p.id,  1)} title="Add 1">+</button>
                  <button className="inv-action-btn" onClick={() => handleRestock(p.id)}  title="Bulk restock">↑</button>
                  <button className="inv-action-btn edit" onClick={() => openEdit(p.id)} title="Edit">✏️</button>
                  <button
                    className="inv-action-btn del"
                    onClick={() => handleDelete(p.id, p.name)}
                    disabled={deletingId === p.id}
                    title="Delete"
                  >
                    {deletingId === p.id ? '…' : '🗑️'}
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
              <span>{editingId ? '✏️ Edit Product' : '➕ Add Product'}</span>
              <button className="modal-close" onClick={() => setShowForm(false)}>✕</button>
            </div>
            <div className="modal-body">
              {/* Icon picker */}
              <div className="form-group">
                <label className="form-label">Icon</label>
                <div className="emoji-picker-row">
                  {EMOJI_OPTIONS.map(em => (
                    <button key={em} className={`avatar-opt ${form.icon === em ? 'selected' : ''}`} onClick={() => pf('icon', em)}>{em}</button>
                  ))}
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Product Name *</label>
                <input className="form-input" placeholder="e.g. iPhone 15 Pro" value={form.name} onChange={e => pf('name', e.target.value)} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div className="form-group">
                  <label className="form-label">Sale Price ($) *</label>
                  <input className="form-input" type="number" min="0" step="0.01" placeholder="0.00" value={form.price} onChange={e => pf('price', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Original Price ($)</label>
                  <input className="form-input" type="number" min="0" step="0.01" placeholder="0.00" value={form.originalPrice} onChange={e => pf('originalPrice', e.target.value)} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div className="form-group">
                  <label className="form-label">Category *</label>
                  <select className="form-input" value={form.category} onChange={e => pf('category', e.target.value)}>
                    {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Stock Qty</label>
                  <input className="form-input" type="number" min="0" placeholder="0" value={form.stock} onChange={e => pf('stock', e.target.value)} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div className="form-group">
                  <label className="form-label">SKU</label>
                  <input className="form-input" placeholder="e.g. PRD-001" value={form.sku} onChange={e => pf('sku', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Supplier</label>
                  <select className="form-input" value={form.supplierId} onChange={e => pf('supplierId', e.target.value)}>
                    <option value="">None</option>
                    {suppliers.map(s => <option key={s.id} value={s.id}>{s.icon} {s.name}</option>)}
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Description</label>
                <textarea className="form-input" rows={3} style={{ resize:'vertical', fontFamily:'inherit' }} placeholder="Product details…" value={form.description} onChange={e => pf('description', e.target.value)} maxLength={500} />
              </div>

              <button className="btn btn-primary btn-full btn-lg" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : editingId ? 'Update Product' : 'Add Product'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
