'use client';

import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import Header from '@/components/Header';
import ProductImage from '@/components/ProductImage';
import { useApp } from '@/context/AppContext';
import { CATEGORIES } from '@/lib/data';

type StockFilter = 'all' | 'low' | 'out';

const EMOJI_OPTIONS = ['📦','📱','💻','🎧','👗','👟','🏠','🍎','💊','⚽','🎵','📷','🧴','🌿','☕','🍯','🥛','💡','🌬️','🩹','❤️','🧘','🪢','💪','🍶','🕶️','👔','📺','📲','⌚','🎮','🖱️','⌨️'];

interface ProductForm {
  name: string; price: string; originalPrice: string; category: string;
  icon: string; stock: string; sku: string; description: string;
  supplierId: string; barcode: string; imageUrl: string;
}
const emptyForm: ProductForm = {
  name: '', price: '', originalPrice: '', category: 'electronics',
  icon: '📦', stock: '0', sku: '', description: '', supplierId: '', barcode: '', imageUrl: '',
};

export default function InventoryPage() {
  const { state, adjustStock, toast, reloadProducts } = useApp();
  const { products, inventory, suppliers, loading } = state;

  const [search, setSearch]   = useState('');
  const [filter, setFilter]   = useState<StockFilter>('all');

  // ── CRUD state ────────────────────────────────────────────
  const [showForm, setShowForm]     = useState(false);
  const [editingId, setEditingId]   = useState<number | null>(null);
  const [form, setForm]             = useState<ProductForm>(emptyForm);
  const [saving, setSaving]         = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  // ── Barcode scanner state ─────────────────────────────────
  const [barcodeInput, setBarcodeInput] = useState('');
  const [lookingUp, setLookingUp]       = useState(false);
  const [scanning, setScanning]         = useState(false);
  const scanningRef = useRef(false);
  const videoRef    = useRef<HTMLVideoElement>(null);
  const streamRef   = useRef<MediaStream | null>(null);
  const rafRef      = useRef<number>(0);

  const pf = (k: keyof ProductForm, v: string) => setForm(f => ({ ...f, [k]: v }));

  const openAdd = () => { setEditingId(null); setForm(emptyForm); setShowForm(true); };

  const openEdit = (productId: number) => {
    const p = products.find(x => x.id === productId) as (typeof products[number] & { barcode?: string }) | undefined;
    if (!p) return;
    setEditingId(productId);
    setForm({
      name: p.name, price: String(p.price), originalPrice: String(p.originalPrice),
      category: p.category, icon: p.icon,
      stock: String(inventory.find(i => i.id === p.id)?.stock ?? p.stock),
      sku: p.sku, description: p.description,
      supplierId: p.supplierId ? String(p.supplierId) : '',
      barcode: p.barcode ?? '',
      imageUrl: p.imageUrls?.[0] ?? p.imageUrl ?? '',
    });
    setShowForm(true);
  };

  // ── Barcode lookup ────────────────────────────────────────
  const handleBarcodeLookup = useCallback(async (code: string) => {
    code = code.trim();
    if (!code) return;
    setLookingUp(true);
    try {
      const res = await fetch(`/api/products?barcode=${encodeURIComponent(code)}`);
      if (res.ok && res.status !== 404) {
        const p = await res.json();
        if (p && p.id) {
          toast(`Found: ${p.name}`, 'success');
          const localStock = inventory.find(i => i.id === p.id)?.stock ?? p.stock ?? 0;
          setEditingId(p.id);
          setForm({
            name: p.name ?? '', price: String(p.price ?? ''),
            originalPrice: String(p.originalPrice ?? p.price ?? ''),
            category: p.category ?? 'electronics', icon: p.icon ?? '📦',
            stock: String(localStock),
            sku: p.sku ?? '', description: p.description ?? '',
            supplierId: p.supplierId ? String(p.supplierId) : '',
            barcode: code,
            imageUrl: p.imageUrls?.[0] ?? p.imageUrl ?? '',
          });
          setShowForm(true);
        } else {
          toast('No product with that barcode — create one', 'default');
          setEditingId(null);
          setForm({ ...emptyForm, barcode: code });
          setShowForm(true);
        }
      } else {
        toast('No product with that barcode — create one', 'default');
        setEditingId(null);
        setForm({ ...emptyForm, barcode: code });
        setShowForm(true);
      }
    } catch {
      toast('Lookup failed — check your connection', 'error');
    }
    setLookingUp(false);
    setBarcodeInput('');
  }, [inventory, toast]);

  // ── Camera scan ───────────────────────────────────────────
  const stopScan = useCallback(() => {
    scanningRef.current = false;
    setScanning(false);
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  }, []);

  const startCameraScan = useCallback(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (!('BarcodeDetector' in window)) {
      toast('Camera barcode detection not supported in this browser. Enter the barcode manually.', 'error');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
      });
      streamRef.current = stream;
      scanningRef.current = true;
      setScanning(true);

      // Give React time to render the <video> element
      requestAnimationFrame(async () => {
        if (!videoRef.current) { stopScan(); return; }
        videoRef.current.srcObject = stream;
        try { await videoRef.current.play(); } catch { stopScan(); return; }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const detector = new (window as any).BarcodeDetector({
          formats: ['ean_13','ean_8','upc_a','upc_e','code_128','code_39','code_93','qr_code','data_matrix'],
        });

        const scanFrame = async () => {
          if (!scanningRef.current || !videoRef.current) return;
          try {
            const barcodes = await detector.detect(videoRef.current);
            if (barcodes.length > 0) {
              const code = barcodes[0].rawValue as string;
              stopScan();
              await handleBarcodeLookup(code);
              return;
            }
          } catch { /* keep scanning */ }
          rafRef.current = requestAnimationFrame(scanFrame);
        };
        rafRef.current = requestAnimationFrame(scanFrame);
      });
    } catch (err: unknown) {
      const name = err instanceof Error ? err.name : '';
      toast(name === 'NotAllowedError' ? 'Camera permission denied' : 'Could not access camera', 'error');
    }
  }, [handleBarcodeLookup, stopScan, toast]);

  // Clean up camera on unmount
  useEffect(() => () => stopScan(), [stopScan]);

  // ── Save ──────────────────────────────────────────────────
  const handleSave = async () => {
    if (!form.name.trim() || !form.price) { toast('Name and price required', 'error'); return; }
    setSaving(true);
    const body = {
      name: form.name.trim(), price: form.price,
      originalPrice: form.originalPrice || form.price,
      category: form.category, icon: form.icon, stock: form.stock,
      sku: form.sku.trim(), description: form.description.trim(),
      supplierId: form.supplierId ? parseInt(form.supplierId, 10) : null,
      barcode: form.barcode.trim() || null,
      imageUrl: form.imageUrl.trim() || null,
      imageUrls: form.imageUrl.trim() ? [form.imageUrl.trim()] : [],
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

  // ── Delete / restock ──────────────────────────────────────
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

  // ── Filtered list ─────────────────────────────────────────
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
      const bc = (p as typeof p & { barcode?: string }).barcode ?? '';
      return p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q) || bc.toLowerCase().includes(q);
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

      {/* ── Barcode scanner ──────────────────────────────── */}
      <div style={{ padding: '0 16px 12px' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 16, pointerEvents: 'none' }}>
              {lookingUp ? '⏳' : '🔖'}
            </span>
            <input
              className="form-input"
              style={{ paddingLeft: 34 }}
              placeholder="Scan or type barcode to find / edit product…"
              value={barcodeInput}
              onChange={e => setBarcodeInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleBarcodeLookup(barcodeInput)}
              disabled={lookingUp || scanning}
            />
          </div>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => handleBarcodeLookup(barcodeInput)}
            disabled={!barcodeInput.trim() || lookingUp || scanning}
            style={{ whiteSpace: 'nowrap' }}
          >
            {lookingUp ? 'Looking…' : '🔍 Find'}
          </button>
          <button
            className={`btn btn-sm ${scanning ? 'btn-danger' : 'btn-secondary'}`}
            onClick={scanning ? stopScan : startCameraScan}
            style={{ whiteSpace: 'nowrap' }}
            title={scanning ? 'Stop camera' : 'Scan with camera'}
          >
            {scanning ? '✕ Stop' : '📷 Scan'}
          </button>
        </div>

        {scanning && (
          <div style={{
            marginTop: 10, borderRadius: 12, overflow: 'hidden', position: 'relative',
            background: '#000', maxHeight: 240,
          }}>
            <video
              ref={videoRef}
              playsInline
              muted
              style={{ width: '100%', display: 'block', maxHeight: 240, objectFit: 'cover' }}
            />
            {/* aim guide */}
            <div style={{
              position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none',
            }}>
              <div style={{
                width: 220, height: 80, border: '2px solid rgba(255,255,255,.8)',
                borderRadius: 8, boxShadow: '0 0 0 9999px rgba(0,0,0,.35)',
              }} />
            </div>
            <div style={{
              position: 'absolute', bottom: 8, left: 0, right: 0, textAlign: 'center',
              color: '#fff', fontSize: 12, textShadow: '0 1px 3px #000',
            }}>
              Point camera at barcode
            </div>
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="stats-grid">
        <div className="stat-card"><div className="stat-icon">📦</div><div className="stat-value">{totalUnits.toLocaleString()}</div><div className="stat-label">Total Units</div></div>
        <div className="stat-card warning"><div className="stat-icon">⚠️</div><div className="stat-value">{lowStock}</div><div className="stat-label">Low Stock</div></div>
        <div className="stat-card danger"><div className="stat-icon">❌</div><div className="stat-value">{outOfStock}</div><div className="stat-label">Out of Stock</div></div>
        <div className="stat-card success"><div className="stat-icon">💰</div><div className="stat-value">${Math.round(totalValue / 1000)}k</div><div className="stat-label">Total Value</div></div>
      </div>

      {/* Filters */}
      <div className="inventory-header">
        <input className="inv-search" placeholder="Search by name, SKU or barcode…" value={search} onChange={e => setSearch(e.target.value)} />
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
            const barcode = (p as typeof p & { barcode?: string }).barcode;
            return (
              <div key={p.id} className="inv-item">
                <div className="inv-item-icon">
                  <ProductImage icon={p.icon} imageUrl={(p as typeof p & {imageUrl?:string}).imageUrl} imageUrls={(p as typeof p & {imageUrls?:string[]}).imageUrls} name={p.name} style={{ borderRadius: 10 }} />
                </div>
                <div className="inv-item-info">
                  <div className="inv-item-name">{p.name}</div>
                  <div className="inv-item-sku">
                    {p.sku} · ${p.price.toFixed(2)}
                    {barcode && (
                      <span style={{ marginLeft: 6, opacity: 0.55, fontSize: 11 }}>🔖 {barcode}</span>
                    )}
                  </div>
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

      {/* ── Add / Edit Modal ──────────────────────────────── */}
      {showForm && (
        <div className="modal-overlay" onClick={() => !saving && setShowForm(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span>{editingId ? '✏️ Edit Product' : '➕ Add Product'}</span>
              <button className="modal-close" onClick={() => setShowForm(false)}>✕</button>
            </div>
            <div className="modal-body">

              {/* Photo preview + URL input */}
              <div className="form-group">
                <label className="form-label">📷 Product Photo</label>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  {/* Live preview */}
                  <div style={{
                    width: 72, height: 72, borderRadius: 12, overflow: 'hidden', flexShrink: 0,
                    background: 'var(--border-light, #f1f5f9)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    border: '1.5px solid var(--border)', fontSize: 32,
                  }}>
                    <ProductImage icon={form.icon} imageUrl={form.imageUrl || null} name="preview" style={{ borderRadius: 10 }} />
                  </div>
                  <input
                    className="form-input"
                    placeholder="Paste image URL (https://…)"
                    value={form.imageUrl}
                    onChange={e => pf('imageUrl', e.target.value)}
                    style={{ flex: 1 }}
                  />
                </div>
                <div style={{ fontSize: '.75rem', color: 'var(--text-muted)', marginTop: 4 }}>
                  Paste a direct image link (jpg/png/webp). Leave blank to use the emoji icon below.
                </div>
              </div>

              {/* Fallback icon picker — shown/used only when no photo URL */}
              <div className="form-group">
                <label className="form-label">Fallback Icon {form.imageUrl ? <span style={{ color:'var(--text-muted)', fontWeight:400 }}>(hidden while photo is set)</span> : null}</label>
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

              {/* Barcode field */}
              <div className="form-group">
                <label className="form-label">Barcode</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    className="form-input"
                    placeholder="EAN-13, UPC-A, Code-128…"
                    value={form.barcode}
                    onChange={e => pf('barcode', e.target.value)}
                    style={{ flex: 1 }}
                  />
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    title="Scan with camera"
                    onClick={async () => {
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      if (!('BarcodeDetector' in window)) {
                        toast('Camera scan not supported. Enter barcode manually.', 'error'); return;
                      }
                      try {
                        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } } });
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        const detector = new (window as any).BarcodeDetector({ formats: ['ean_13','ean_8','upc_a','upc_e','code_128','code_39','qr_code'] });
                        const tmpVideo = document.createElement('video');
                        tmpVideo.srcObject = stream; tmpVideo.playsInline = true; tmpVideo.muted = true;
                        await tmpVideo.play();
                        let found = false;
                        for (let i = 0; i < 60 && !found; i++) {
                          await new Promise(r => setTimeout(r, 200));
                          const barcodes = await detector.detect(tmpVideo);
                          if (barcodes.length > 0) {
                            pf('barcode', barcodes[0].rawValue);
                            found = true;
                          }
                        }
                        stream.getTracks().forEach(t => t.stop());
                        if (!found) toast('No barcode detected. Try again.', 'error');
                      } catch { toast('Camera not available', 'error'); }
                    }}
                    style={{ flexShrink: 0 }}
                  >
                    📷
                  </button>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Description</label>
                <textarea className="form-input" rows={3} style={{ resize: 'vertical', fontFamily: 'inherit' }} placeholder="Product details…" value={form.description} onChange={e => pf('description', e.target.value)} maxLength={500} />
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
