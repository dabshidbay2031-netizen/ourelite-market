'use client';

import { useState, useEffect } from 'react';
import { useApp } from '@/context/AppContext';
import { useAuth } from '@/context/AuthContext';
import { CATEGORIES } from '@/lib/data';
import { authHeaders } from '@/lib/clientAuth';
import ProductImage from '@/components/ProductImage';
import type { Supplier, Product, Order, PriceTier } from '@/lib/types';

const BIZ_ICONS     = ['🏭','🏪','🏬','🏢','🏗️','🚚','📦','⚙️','🔧','🛒','💼','🌐'];

type DashTab = 'products' | 'sales' | 'settings';

interface SupplierProductFormData {
  name:        string;
  category:    string;
  sku:         string;
  stock:       string;
  moq:         string;
  description: string;
  imageUrl:    string;
  tier1Max:    string;
  tier1Price:  string;
  tier2Max:    string;
  tier2Price:  string;
  tier3Price:  string;
}

const emptyProductForm: SupplierProductFormData = {
  name:        '',
  category:    'electronics',
  sku:         '',
  stock:       '0',
  moq:         '1',
  description: '',
  imageUrl:    '',
  tier1Max:    '299',
  tier1Price:  '',
  tier2Max:    '599',
  tier2Price:  '',
  tier3Price:  '',
};

interface Props {
  supplier: Supplier;
}

export default function SupplierDashboard({ supplier }: Props) {
  const { toast, reloadProducts } = useApp();
  const { refreshAccount } = useAuth();

  const [tab, setTab] = useState<DashTab>('products');

  /* ── Products state ───────────────────────────────────── */
  const [products,       setProducts]       = useState<Product[]>([]);
  const [productsLoading,setProductsLoading]= useState(false);
  const [showForm,       setShowForm]       = useState(false);
  const [editingProd,    setEditingProd]    = useState<Product | null>(null);
  const [form,           setForm]           = useState<SupplierProductFormData>(emptyProductForm);
  const [savingProd,     setSavingProd]     = useState(false);
  const [deletingId,     setDeletingId]     = useState<number | null>(null);
  // window.confirm is blocked in the Next 16 / Turbopack runtime, so deletion
  // is gated by this in-app confirm modal (same pattern as Inventory).
  const [confirmDelete,  setConfirmDelete]  = useState<{ id: number; name: string } | null>(null);

  /* ── Sales state ──────────────────────────────────────── */
  const [orders,       setOrders]       = useState<Order[]>([]);
  const [ordersLoading,setOrdersLoading]= useState(false);
  const [ordersLoaded, setOrdersLoaded] = useState(false);

  /* ── Settings state ───────────────────────────────────── */
  const [settingName,     setSettingName]     = useState(supplier.name     ?? '');
  const [settingIcon,     setSettingIcon]     = useState(supplier.icon     ?? '🏭');
  const [settingBio,      setSettingBio]      = useState(supplier.bio      ?? '');
  const [settingLocation, setSettingLocation] = useState(supplier.location ?? '');
  const [settingLat,      setSettingLat]      = useState<number | null>(supplier.latitude  ?? null);
  const [settingLng,      setSettingLng]      = useState<number | null>(supplier.longitude ?? null);
  const [locating,        setLocating]        = useState(false);
  const [savingSettings,  setSavingSettings]  = useState(false);

  /* One tap: request permission → read GPS → save the coordinates to the
     store immediately (no separate Save step). */
  function captureStoreLocation() {
    if (!navigator.geolocation) { toast('Location not available on this device', 'error'); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async pos => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setSettingLat(lat);
        setSettingLng(lng);
        try {
          const res = await fetch(`/api/suppliers/${supplier.id}`, {
            method:  'PATCH',
            headers: await authHeaders({ 'Content-Type': 'application/json' }),
            body:    JSON.stringify({ latitude: lat, longitude: lng }),
          });
          if (res.ok) {
            const saved = await res.json().catch(() => null);
            if (saved?.skippedColumns?.length) {
              toast('Got location, but the map needs the DB migration (suppliers lat/lng columns)', 'warning');
            } else {
              toast('📍 Store location saved', 'success');
              await refreshAccount();
            }
          } else {
            toast('Got your location but could not save it — try again', 'error');
          }
        } catch {
          toast('Network error — location not saved', 'error');
        }
        setLocating(false);
      },
      () => { setLocating(false); toast('Could not get location. Allow permission and retry.', 'error'); },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  /* ── Load products on mount ───────────────────────────── */
  useEffect(() => {
    loadProducts();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Load sales when tab activated ───────────────────── */
  useEffect(() => {
    if (tab === 'sales' && !ordersLoaded) {
      loadOrders();
    }
  }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadProducts() {
    setProductsLoading(true);
    try {
      const res  = await fetch(`/api/products?supplierId=${supplier.id}`);
      const data = await res.json();
      setProducts(Array.isArray(data) ? data : []);
    } catch {
      setProducts([]);
    }
    setProductsLoading(false);
  }

  async function loadOrders() {
    setOrdersLoading(true);
    try {
      const res  = await fetch(`/api/orders?supplierId=${supplier.id}`, { headers: await authHeaders() });
      const data = await res.json();
      setOrders(Array.isArray(data) ? data : []);
      setOrdersLoaded(true);
    } catch {
      setOrders([]);
      setOrdersLoaded(true);
    }
    setOrdersLoading(false);
  }

  /* ── Helpers ──────────────────────────────────────────── */
  function pf(k: keyof SupplierProductFormData, v: string) {
    setForm(f => ({ ...f, [k]: v }));
  }

  function buildPriceTiers(): PriceTier[] {
    const tiers: PriceTier[] = [];
    const t1Max   = parseInt(form.tier1Max,   10);
    const t1Price = parseFloat(form.tier1Price);
    const t2Max   = parseInt(form.tier2Max,   10);
    const t2Price = parseFloat(form.tier2Price);
    const t3Price = parseFloat(form.tier3Price);

    if (form.tier1Price && !isNaN(t1Price)) {
      tiers.push({ minQty: 1, maxQty: isNaN(t1Max) ? 299 : t1Max, price: t1Price });
    }
    if (form.tier2Price && !isNaN(t2Price) && tiers.length > 0) {
      const t2Min = (tiers[0]?.maxQty ?? 299) + 1;
      tiers.push({ minQty: t2Min, maxQty: isNaN(t2Max) ? 599 : t2Max, price: t2Price });
    }
    if (form.tier3Price && !isNaN(t3Price) && tiers.length > 0) {
      const t3Min = (tiers[tiers.length - 1]?.maxQty ?? 599) + 1;
      tiers.push({ minQty: t3Min, maxQty: null, price: t3Price });
    }
    return tiers;
  }

  function openAddProduct() {
    setEditingProd(null);
    setForm(emptyProductForm);
    setShowForm(true);
  }

  function openEditProduct(p: Product) {
    setEditingProd(p);
    const tiers = p.priceTiers ?? [];
    setForm({
      name:        p.name,
      category:    p.category,
      sku:         p.sku,
      stock:       String(p.stock),
      moq:         String(p.moq ?? 1),
      description: p.description,
      imageUrl:    p.imageUrls?.[0] ?? p.imageUrl ?? '',
      tier1Max:    tiers[0]?.maxQty != null ? String(tiers[0].maxQty) : '299',
      tier1Price:  tiers[0] ? String(tiers[0].price) : '',
      tier2Max:    tiers[1]?.maxQty != null ? String(tiers[1].maxQty) : '599',
      tier2Price:  tiers[1] ? String(tiers[1].price) : '',
      tier3Price:  tiers[2] ? String(tiers[2].price) : '',
    });
    setShowForm(true);
  }

  async function handleSaveProduct() {
    if (!form.name.trim() || !form.tier1Price) {
      toast('Name and at least one tier price are required', 'error');
      return;
    }
    setSavingProd(true);
    const priceTiers = buildPriceTiers();
    const body = {
      name:        form.name.trim(),
      price:       parseFloat(form.tier1Price) || 0,
      originalPrice: parseFloat(form.tier1Price) || 0,
      category:    form.category,
      stock:       form.stock,
      sku:         form.sku.trim() || undefined,
      description: form.description.trim(),
      supplierId:  supplier.id,
      priceTiers,
      isB2b:       true,
      moq:         form.moq,
      imageUrl:    form.imageUrl.trim() || null,
      imageUrls:   form.imageUrl.trim() ? [form.imageUrl.trim()] : [],
    };

    if (editingProd) {
      const res = await fetch(`/api/products/${editingProd.id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      });
      if (res.ok) { toast('Product updated', 'success'); }
      else        { toast('Failed to update product', 'error'); }
    } else {
      const res = await fetch('/api/products', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      });
      if (res.ok) { toast('Product added', 'success'); }
      else        { toast('Failed to add product', 'error'); }
    }

    setSavingProd(false);
    setShowForm(false);
    await loadProducts();
    await reloadProducts();
  }

  async function doDeleteProduct() {
    if (!confirmDelete) return;
    const productId = confirmDelete.id;
    setConfirmDelete(null);
    setDeletingId(productId);
    const res = await fetch(`/api/products/${productId}`, { method: 'DELETE' });
    setDeletingId(null);
    if (res.ok) {
      toast('Product deleted', 'default');
      setProducts(prev => prev.filter(p => p.id !== productId));
      await reloadProducts();
    } else {
      const err = await res.json().catch(() => null);
      toast(err?.error ?? 'Failed to delete', 'error');
    }
  }

  async function handleSaveSettings() {
    if (!settingName.trim()) { toast('Name is required', 'error'); return; }
    setSavingSettings(true);
    const res = await fetch(`/api/suppliers/${supplier.id}`, {
      method:  'PATCH',
      headers: await authHeaders({ 'Content-Type': 'application/json' }),
      body:    JSON.stringify({
        name:      settingName.trim(),
        icon:      settingIcon,
        bio:       settingBio.trim(),
        location:  settingLocation.trim(),
        latitude:  settingLat,
        longitude: settingLng,
      }),
    });
    if (res.ok) {
      const saved = await res.json().catch(() => null);
      if (saved?.skippedColumns?.length) {
        toast('Saved, but map needs the DB migration (suppliers lat/lng columns)', 'warning');
      } else {
        toast('Settings saved', 'success');
      }
      await refreshAccount();
    } else {
      toast('Failed to save settings', 'error');
    }
    setSavingSettings(false);
  }

  /* ── Render helpers ─────────────────────────────────────── */
  function renderStatusBadge(status: string) {
    const styles: Record<string, { background: string; color: string }> = {
      completed: { background: '#D1FAE5', color: '#065F46' },
      pending:   { background: '#FEF3C7', color: '#92400E' },
      cancelled: { background: '#FEE2E2', color: '#991B1B' },
      deleted:   { background: '#F3F4F6', color: '#6B7280' },
    };
    const s = styles[status] ?? { background: 'var(--surface)', color: 'var(--text-muted)' };
    return (
      <span style={{
        ...s,
        padding: '2px 8px',
        borderRadius: 20,
        fontSize: '.72rem',
        fontWeight: 600,
        textTransform: 'capitalize',
      }}>
        {status}
      </span>
    );
  }

  /* ── RENDER ─────────────────────────────────────────────── */
  return (
    <div className="page-anim">
      {/* Hero Card */}
      <div className="biz-hero-card">
        <div className="biz-hero-top">
          <div className="biz-hero-icon">{supplier.icon ?? '🏭'}</div>
          <div className="biz-hero-info">
            <div className="biz-hero-name">
              {supplier.name ?? 'Your Company'}
              <span style={{
                marginLeft: 8,
                fontSize: '.7rem',
                fontWeight: 700,
                background: '#EEF2FF',
                color: 'var(--primary)',
                padding: '2px 8px',
                borderRadius: 20,
              }}>
                Supplier
              </span>
              {supplier.verified && <span className="biz-verified-badge">✓ Verified</span>}
            </div>
            {supplier.location && (
              <div className="biz-hero-location">📍 {supplier.location}</div>
            )}
          </div>
        </div>

        {/* Stats row */}
        <div className="biz-stats-row">
          <div className="biz-stat">
            <div className="biz-stat-val">{products.length}</div>
            <div className="biz-stat-lbl">Products</div>
          </div>
          <div className="biz-stat">
            <div className="biz-stat-val">{orders.length}</div>
            <div className="biz-stat-lbl">Orders</div>
          </div>
          <div className="biz-stat">
            <div className="biz-stat-val">{supplier.rating?.toFixed(1) ?? '–'}</div>
            <div className="biz-stat-lbl">⭐ Rating</div>
          </div>
          <div className="biz-stat">
            <div className="biz-stat-val">{supplier.reviews ?? 0}</div>
            <div className="biz-stat-lbl">Reviews</div>
          </div>
        </div>

        {/* Tab bar */}
        <div className="biz-tabs">
          <button className={`biz-tab${tab === 'products'  ? ' active' : ''}`} onClick={() => setTab('products')}>📦 Products</button>
          <button className={`biz-tab${tab === 'sales'     ? ' active' : ''}`} onClick={() => setTab('sales')}>📊 Sales</button>
          <button className={`biz-tab${tab === 'settings'  ? ' active' : ''}`} onClick={() => setTab('settings')}>⚙️ Settings</button>
        </div>
      </div>

      {/* ═══════════ TAB: PRODUCTS ═══════════ */}
      {tab === 'products' && (
        <div className="biz-store-wrap">
          <div className="biz-store-actions">
            <div style={{ fontWeight: 700, fontSize: '.95rem', flex: 1 }}>
              My B2B Products
            </div>
            <button className="btn btn-primary btn-sm" onClick={openAddProduct}>
              + Add Product
            </button>
          </div>

          {productsLoading ? (
            <div style={{ padding: 16 }}>
              {[1,2,3].map(i => (
                <div key={i} className="skeleton" style={{ height: 80, borderRadius: 12, marginBottom: 10 }} />
              ))}
            </div>
          ) : products.length === 0 ? (
            <div className="empty-state" style={{ marginTop: 40 }}>
              <div className="empty-icon">📦</div>
              <div className="empty-title">No products yet</div>
              <div className="empty-sub">Add your first wholesale product with tier pricing.</div>
              <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={openAddProduct}>
                + Add Product
              </button>
            </div>
          ) : (
            <div className="biz-product-list" style={{ padding: '0 16px 100px' }}>
              {products.map(p => {
                const cat = CATEGORIES.find(c => c.id === p.category);
                return (
                  <div key={p.id} className="biz-product-item">
                    <div className="biz-product-icon">
                      <ProductImage imageUrl={(p as Product & {imageUrl?:string}).imageUrl} imageUrls={(p as Product & {imageUrls?:string[]}).imageUrls} name={p.name} style={{ borderRadius: 8 }} />
                    </div>
                    <div className="biz-product-info">
                      <div className="biz-product-name">{p.name}</div>
                      <div className="biz-product-meta">{cat?.icon} {cat?.name}</div>
                      {p.sku && (
                        <div style={{ fontSize: '.72rem', color: 'var(--text-muted)', marginTop: 2 }}>
                          SKU: {p.sku}
                        </div>
                      )}
                      {/* MOQ badge */}
                      <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                        <span style={{
                          background: '#EEF2FF',
                          color: 'var(--primary)',
                          fontSize: '.7rem',
                          fontWeight: 700,
                          padding: '2px 7px',
                          borderRadius: 20,
                        }}>
                          MOQ: {p.moq ?? 1}
                        </span>
                        <span style={{
                          background: '#FEF3C7',
                          color: '#92400E',
                          fontSize: '.7rem',
                          fontWeight: 600,
                          padding: '2px 7px',
                          borderRadius: 20,
                        }}>
                          B2B
                        </span>
                      </div>
                      {/* Price tiers */}
                      {p.priceTiers && p.priceTiers.length > 0 && (
                        <div style={{
                          marginTop: 6,
                          background: 'var(--surface)',
                          border: '1px solid var(--border)',
                          borderRadius: 8,
                          overflow: 'hidden',
                          fontSize: '.72rem',
                        }}>
                          {p.priceTiers.map((tier, i) => (
                            <div key={i} style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              padding: '4px 8px',
                              borderBottom: i < (p.priceTiers?.length ?? 0) - 1 ? '1px solid var(--border)' : undefined,
                            }}>
                              <span style={{ color: 'var(--text-muted)' }}>
                                {tier.minQty}
                                {tier.maxQty != null ? `–${tier.maxQty}` : '+'} units
                              </span>
                              <span style={{ fontWeight: 700, color: 'var(--primary)' }}>
                                ${Number(tier.price).toFixed(2)} ea
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="biz-product-pricing">
                      <div className="biz-price-mine">${Number(p.price).toFixed(2)}</div>
                      <div className={`biz-stock-badge${p.stock < 5 ? ' low' : ''}`}>{p.stock} in stock</div>
                    </div>
                    <div className="biz-product-actions">
                      <button className="btn btn-ghost btn-sm" onClick={() => openEditProduct(p)} title="Edit">✏️</button>
                      <button
                        className="btn btn-ghost btn-sm"
                        style={{ color: 'var(--danger)' }}
                        onClick={() => setConfirmDelete({ id: p.id, name: p.name })}
                        disabled={deletingId === p.id}
                        title="Delete"
                      >
                        {deletingId === p.id ? '…' : '🗑️'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ═══════════ TAB: SALES ═══════════ */}
      {tab === 'sales' && (
        <div style={{ padding: '0 16px 100px' }}>
          <div style={{ padding: '16px 0 12px', fontWeight: 700, fontSize: '.95rem' }}>
            📊 Sales Orders
          </div>

          {ordersLoading ? (
            <div style={{ padding: 16 }}>
              {[1,2,3].map(i => (
                <div key={i} className="skeleton" style={{ height: 80, borderRadius: 12, marginBottom: 10 }} />
              ))}
            </div>
          ) : orders.length === 0 ? (
            <div className="empty-state" style={{ marginTop: 40 }}>
              <div className="empty-icon">📊</div>
              <div className="empty-title">No sales yet</div>
              <div className="empty-sub">
                When businesses order your products, they&apos;ll appear here.
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {orders.map(order => {
                // Filter items to only those from this supplier's products
                const supplierProductIds = new Set(products.map(p => p.id));
                const relevantItems = (order.items ?? []).filter(item =>
                  supplierProductIds.has(item.id)
                );
                const itemsSubtotal = relevantItems.reduce((sum, item) => {
                  const prod = products.find(p => p.id === item.id);
                  return sum + (prod ? prod.price * item.qty : 0);
                }, 0);

                return (
                  <div key={order.id} style={{
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderRadius: 12,
                    padding: 14,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '.88rem' }}>
                          {order.customerName || 'Unknown Customer'}
                        </div>
                        <div style={{ fontSize: '.75rem', color: 'var(--text-muted)', marginTop: 2 }}>
                          Order #{String(order.id).slice(0, 8)}
                        </div>
                        <div style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>
                          {order.createdAt ? new Date(order.createdAt).toLocaleDateString() : ''}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        {renderStatusBadge(order.status)}
                        <div style={{ fontWeight: 700, fontSize: '.92rem', marginTop: 4, color: 'var(--primary)' }}>
                          ${itemsSubtotal > 0 ? itemsSubtotal.toFixed(2) : Number(order.total).toFixed(2)}
                        </div>
                      </div>
                    </div>

                    {/* Items from this supplier */}
                    <div style={{ borderTop: '1px solid var(--border)', paddingTop: 8 }}>
                      <div style={{ fontSize: '.72rem', color: 'var(--text-muted)', marginBottom: 4 }}>
                        Your items in this order:
                      </div>
                      {relevantItems.length > 0 ? relevantItems.map(item => {
                        const prod = products.find(p => p.id === item.id);
                        return (
                          <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.8rem', marginBottom: 2 }}>
                            <span>{prod ? prod.name : `Product #${item.id}`}</span>
                            <span style={{ color: 'var(--text-muted)' }}>×{item.qty}</span>
                          </div>
                        );
                      }) : (
                        <div style={{ fontSize: '.8rem', color: 'var(--text-muted)' }}>–</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ═══════════ TAB: SETTINGS ═══════════ */}
      {tab === 'settings' && (
        <div style={{ padding: '0 16px 100px' }}>
          <div style={{ padding: '16px 0 12px', fontWeight: 700, fontSize: '.95rem' }}>
            ⚙️ Supplier Settings
          </div>

          {/* Icon picker */}
          <div className="form-group">
            <label className="form-label">Company Icon</label>
            <div className="emoji-picker-row">
              {BIZ_ICONS.map(em => (
                <button
                  key={em}
                  className={`avatar-opt ${settingIcon === em ? 'selected' : ''}`}
                  onClick={() => setSettingIcon(em)}
                >
                  {em}
                </button>
              ))}
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Company Name *</label>
            <input
              className="form-input"
              placeholder="Acme Wholesale Co."
              value={settingName}
              onChange={e => setSettingName(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Location</label>
            <input
              className="form-input"
              placeholder="City, Country"
              value={settingLocation}
              onChange={e => setSettingLocation(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Map Pin (for customer directions)</label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={captureStoreLocation}
                disabled={locating}
              >
                {locating ? 'Locating…' : '📍 Use my current location'}
              </button>
              {settingLat != null && settingLng != null ? (
                <span style={{ fontSize: '.8rem', color: 'var(--success, #059669)', fontWeight: 600 }}>
                  ✓ saved {settingLat.toFixed(5)}, {settingLng.toFixed(5)}
                  <button
                    type="button"
                    disabled={locating}
                    onClick={async () => {
                      setSettingLat(null); setSettingLng(null);
                      try {
                        await fetch(`/api/suppliers/${supplier.id}`, {
                          method: 'PATCH', headers: await authHeaders({ 'Content-Type': 'application/json' }),
                          body: JSON.stringify({ latitude: null, longitude: null }),
                        });
                        await refreshAccount();
                        toast('Map pin removed', 'default');
                      } catch { /* noop */ }
                    }}
                    style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', marginLeft: 6, fontSize: '.8rem' }}
                  >clear</button>
                </span>
              ) : (
                <span style={{ fontSize: '.8rem', color: 'var(--text-muted)' }}>No pin set</span>
              )}
            </div>
            <div style={{ fontSize: '.72rem', color: 'var(--text-muted)', marginTop: 6 }}>
              Tap once while standing at your store — it asks for location permission, then saves your map pin instantly.
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Bio / Description</label>
            <textarea
              className="form-input"
              rows={4}
              style={{ resize: 'vertical', fontFamily: 'inherit' }}
              placeholder="Tell businesses about your products and terms…"
              value={settingBio}
              onChange={e => setSettingBio(e.target.value)}
              maxLength={400}
            />
            <div style={{ fontSize: '.75rem', color: 'var(--text-muted)', textAlign: 'right', marginTop: 4 }}>
              {settingBio.length}/400
            </div>
          </div>

          <button
            className="btn btn-primary btn-full btn-lg"
            onClick={handleSaveSettings}
            disabled={savingSettings}
          >
            {savingSettings ? 'Saving…' : 'Save Settings'}
          </button>
        </div>
      )}

      {/* ═══════════ PRODUCT FORM MODAL ═══════════ */}
      {showForm && (
        <div className="modal-overlay" onClick={() => !savingProd && setShowForm(false)}>
          <div
            className="modal-box"
            style={{ maxHeight: '90vh', overflowY: 'auto' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="modal-header">
              <span>{editingProd ? '✏️ Edit Product' : '➕ New Wholesale Product'}</span>
              <button className="modal-close" onClick={() => setShowForm(false)}>✕</button>
            </div>
            <div className="modal-body">

              {/* Photo URL + preview */}
              <div className="form-group">
                <label className="form-label">📷 Product Photo</label>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <div style={{
                    width: 72, height: 72, borderRadius: 12, overflow: 'hidden', flexShrink: 0,
                    background: 'var(--border-light, #f1f5f9)', display: 'flex', alignItems: 'center',
                    justifyContent: 'center', border: '1.5px solid var(--border)', fontSize: 32,
                  }}>
                    <ProductImage imageUrl={form.imageUrl || null} name="preview" style={{ borderRadius: 10 }} />
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
                  Paste a direct image URL. An SVG placeholder is shown when no photo is set.
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Product Name *</label>
                <input
                  className="form-input"
                  placeholder="e.g. Bulk Phone Cases"
                  value={form.name}
                  onChange={e => pf('name', e.target.value)}
                  autoFocus
                />
              </div>

              <div className="form-group">
                <label className="form-label">Category *</label>
                <select
                  className="form-input"
                  value={form.category}
                  onChange={e => pf('category', e.target.value)}
                >
                  {CATEGORIES.map(c => (
                    <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div className="form-group">
                  <label className="form-label">SKU</label>
                  <input
                    className="form-input"
                    placeholder="WHL-001"
                    value={form.sku}
                    onChange={e => pf('sku', e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Stock Qty</label>
                  <input
                    className="form-input"
                    type="number"
                    min="0"
                    value={form.stock}
                    onChange={e => pf('stock', e.target.value)}
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">MOQ (Minimum Order Quantity)</label>
                <input
                  className="form-input"
                  type="number"
                  min="1"
                  value={form.moq}
                  onChange={e => pf('moq', e.target.value)}
                  placeholder="1"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Description</label>
                <textarea
                  className="form-input"
                  rows={3}
                  style={{ resize: 'vertical', fontFamily: 'inherit' }}
                  placeholder="Product details, material, specs…"
                  value={form.description}
                  onChange={e => pf('description', e.target.value)}
                  maxLength={500}
                />
              </div>

              {/* Price Tiers */}
              <div className="form-group">
                <label className="form-label">
                  Price Tiers
                  <span style={{ fontWeight: 400, color: 'var(--text-muted)', marginLeft: 6, fontSize: '.78rem' }}>
                    (at least Tier 1 required)
                  </span>
                </label>
                <div style={{
                  border: '1px solid var(--border)',
                  borderRadius: 10,
                  overflow: 'hidden',
                  background: 'var(--surface)',
                }}>
                  {/* Tier 1 */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 80px 90px',
                    gap: 8,
                    padding: '10px 12px',
                    alignItems: 'center',
                    borderBottom: '1px solid var(--border)',
                  }}>
                    <div style={{ fontSize: '.8rem', color: 'var(--text-muted)' }}>
                      Tier 1: qty 1 to
                    </div>
                    <input
                      className="form-input"
                      type="number"
                      min="1"
                      placeholder="299"
                      value={form.tier1Max}
                      onChange={e => pf('tier1Max', e.target.value)}
                      style={{ padding: '5px 8px', fontSize: '.82rem' }}
                    />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ fontSize: '.8rem', color: 'var(--text-muted)', flexShrink: 0 }}>$</span>
                      <input
                        className="form-input"
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="3.50"
                        value={form.tier1Price}
                        onChange={e => pf('tier1Price', e.target.value)}
                        style={{ padding: '5px 8px', fontSize: '.82rem' }}
                      />
                    </div>
                  </div>

                  {/* Tier 2 */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 80px 90px',
                    gap: 8,
                    padding: '10px 12px',
                    alignItems: 'center',
                    borderBottom: '1px solid var(--border)',
                  }}>
                    <div style={{ fontSize: '.8rem', color: 'var(--text-muted)' }}>
                      Tier 2: auto to
                    </div>
                    <input
                      className="form-input"
                      type="number"
                      min="1"
                      placeholder="599"
                      value={form.tier2Max}
                      onChange={e => pf('tier2Max', e.target.value)}
                      style={{ padding: '5px 8px', fontSize: '.82rem' }}
                    />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ fontSize: '.8rem', color: 'var(--text-muted)', flexShrink: 0 }}>$</span>
                      <input
                        className="form-input"
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="3.00"
                        value={form.tier2Price}
                        onChange={e => pf('tier2Price', e.target.value)}
                        style={{ padding: '5px 8px', fontSize: '.82rem' }}
                      />
                    </div>
                  </div>

                  {/* Tier 3 */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 80px 90px',
                    gap: 8,
                    padding: '10px 12px',
                    alignItems: 'center',
                  }}>
                    <div style={{ fontSize: '.8rem', color: 'var(--text-muted)' }}>
                      Tier 3: auto+
                    </div>
                    <div style={{ fontSize: '.78rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>no max</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ fontSize: '.8rem', color: 'var(--text-muted)', flexShrink: 0 }}>$</span>
                      <input
                        className="form-input"
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="2.60"
                        value={form.tier3Price}
                        onChange={e => pf('tier3Price', e.target.value)}
                        style={{ padding: '5px 8px', fontSize: '.82rem' }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div style={{
                background: '#EEF2FF',
                border: '1px solid #C7D2FE',
                borderRadius: 8,
                padding: '8px 12px',
                fontSize: '.78rem',
                color: '#3730A3',
                marginBottom: 14,
              }}>
                This product will be marked as <strong>B2B only</strong> — visible only to registered businesses and suppliers, not public customers.
              </div>

              <button
                className="btn btn-primary btn-full btn-lg"
                onClick={handleSaveProduct}
                disabled={savingProd}
              >
                {savingProd ? 'Saving…' : editingProd ? 'Update Product' : 'Add Product'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════ DELETE CONFIRM MODAL ═══════════ */}
      {confirmDelete && (
        <div className="modal-overlay" onClick={() => setConfirmDelete(null)}>
          <div className="modal-box" style={{ maxWidth: 400 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span>🗑️ Delete product</span>
              <button className="modal-close" onClick={() => setConfirmDelete(null)}>✕</button>
            </div>
            <div className="modal-body">
              <p style={{ marginBottom: 18, lineHeight: 1.5 }}>
                Delete <strong>{confirmDelete.name}</strong>? This cannot be undone.
              </p>
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="btn btn-outline btn-lg" style={{ flex: 1 }} onClick={() => setConfirmDelete(null)}>
                  Cancel
                </button>
                <button className="btn btn-danger btn-lg" style={{ flex: 1 }} onClick={doDeleteProduct}>
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
