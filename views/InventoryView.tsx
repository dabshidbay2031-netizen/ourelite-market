'use client';

import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import Header from '@/components/Header';
import ProductImage from '@/components/ProductImage';
import { useApp } from '@/context/AppContext';
import { useAuth } from '@/context/AuthContext';
import { useMyProductIds, type ClaimRecord } from '@/lib/useMyProductIds';
import { CATEGORIES } from '@/lib/data';

const ProductImageUpload = dynamic(() => import('@/components/ProductImageUpload'), { ssr: false });

type StockFilter = 'all' | 'low' | 'out';

const EMOJI_OPTIONS = ['📦','📱','💻','🎧','👗','👟','🏠','🍎','💊','⚽','🎵','📷','🧴','🌿','☕','🍯','🥛','💡','🌬️','🩹','❤️','🧘','🪢','💪','🍶','🕶️','👔','📺','📲','⌚','🎮','🖱️','⌨️'];

interface ProductForm {
  name: string; price: string; originalPrice: string; cost: string; category: string;
  stock: string; sku: string; description: string;
  supplierId: string; barcode: string; imageUrls: string[];
  taxMode: 'none' | 'included' | 'excluded';
}
const emptyForm: ProductForm = {
  name: '', price: '', originalPrice: '', cost: '', category: 'electronics',
  stock: '0', sku: '', description: '', supplierId: '', barcode: '', imageUrls: [],
  taxMode: 'none',
};

export default function InventoryPage() {
  const { state, adjustStock, toast, reloadProducts } = useApp();
  const { currentSupplier } = useAuth();
  const { products, inventory, suppliers, loading } = state;

  // A store only manages its OWN products (owned + claimed), never the whole
  // catalog. `scoped` is false for admins / non-store accounts → show all.
  // `claimed` distinguishes products this store CLAIMED from a wholesaler
  // (only price/stock are theirs to change — "delete" = unclaim) from
  // products the store OWNS directly (full edit; "delete" = remove from the
  // shared catalog). Getting this wrong either 403s (owner-only APIs) or lets
  // a claim edit silently mutate the WHOLESALER's shared catalog row.
  const { ids: myIds, scoped: myScoped, claimed, refresh: refreshClaims } = useMyProductIds();

  const [search, setSearch]   = useState('');
  const [filter, setFilter]   = useState<StockFilter>('all');

  // ── CRUD state ────────────────────────────────────────────
  const [showForm, setShowForm]     = useState(false);
  const [editingId, setEditingId]   = useState<number | null>(null);
  // Set only when editing a product CLAIMED from a wholesaler — only price
  // and stock are this store's to change; everything else belongs to the
  // wholesaler's shared catalog row (see useMyProductIds).
  const [editingClaim, setEditingClaim] = useState<ClaimRecord | null>(null);
  const [form, setForm]             = useState<ProductForm>(emptyForm);
  const [saving, setSaving]         = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  // Bulk-restock modal (replaces the blocked window.prompt) + delete confirm
  // modal (replaces the blocked window.confirm — neither is supported in the
  // Next 16 / Turbopack runtime).
  const [restockFor, setRestockFor] = useState<number | null>(null);
  const [restockQty, setRestockQty] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<{ id: number; name: string; isClaim: boolean } | null>(null);

  // ── Barcode scanner state ─────────────────────────────────
  const [barcodeInput, setBarcodeInput] = useState('');
  const [lookingUp, setLookingUp]       = useState(false);
  const [scanning, setScanning]         = useState(false);
  const scanningRef = useRef(false);
  const videoRef    = useRef<HTMLVideoElement>(null);
  const streamRef   = useRef<MediaStream | null>(null);
  const rafRef      = useRef<number>(0);

  const pf = (k: keyof ProductForm, v: string) => setForm(f => ({ ...f, [k]: v }));

  const openAdd = () => { setEditingId(null); setEditingClaim(null); setForm(emptyForm); setShowForm(true); };

  const openEdit = (productId: number) => {
    const p = products.find(x => x.id === productId) as (typeof products[number] & { barcode?: string }) | undefined;
    if (!p) return;
    // A CLAIMED product's real price/stock are THIS store's own claim record,
    // not the wholesaler's catalog price/stock — show the right numbers.
    const claim = claimed.get(productId) ?? null;
    setEditingId(productId);
    setEditingClaim(claim);
    setForm({
      name: p.name,
      price: String(claim ? claim.customPrice : p.price),
      originalPrice: String(p.originalPrice),
      cost: p.cost ? String(p.cost) : '',
      category: p.category,
      stock: String(claim ? claim.stockQty : (inventory.find(i => i.id === p.id)?.stock ?? p.stock)),
      sku: p.sku, description: p.description,
      supplierId: p.supplierId ? String(p.supplierId) : '',
      barcode: p.barcode ?? '',
      imageUrls: p.imageUrls?.length ? p.imageUrls : (p.imageUrl ? [p.imageUrl] : []),
      taxMode: (p as typeof p & { taxMode?: 'none' | 'included' | 'excluded' }).taxMode ?? 'none',
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
          const claim = claimed.get(p.id) ?? null;
          const localStock = claim ? claim.stockQty : (inventory.find(i => i.id === p.id)?.stock ?? p.stock ?? 0);
          setEditingId(p.id);
          setEditingClaim(claim);
          setForm({
            name: p.name ?? '', price: String(claim ? claim.customPrice : (p.price ?? '')),
            originalPrice: String(p.originalPrice ?? p.price ?? ''),
            cost: p.cost ? String(p.cost) : '',
            category: p.category ?? 'electronics',
            stock: String(localStock),
            sku: p.sku ?? '', description: p.description ?? '',
            supplierId: p.supplierId ? String(p.supplierId) : '',
            barcode: code,
            imageUrls: p.imageUrls?.length ? p.imageUrls : (p.imageUrl ? [p.imageUrl] : []),
            taxMode: (p.taxMode as 'none' | 'included' | 'excluded') ?? 'none',
          });
          setShowForm(true);
        } else {
          toast('No product with that barcode — create one', 'default');
          setEditingId(null);
          setEditingClaim(null);
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
  }, [inventory, toast, claimed]);

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

    // A CLAIMED product isn't ours to rename/recategorize/etc. — only OUR
    // price + stock for it are ours to change, via the claim record.
    if (editingId && editingClaim) {
      const res = await fetch(`/api/business-products/${editingClaim.bpId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customPrice: form.price, stockQty: form.stock }),
      });
      setSaving(false);
      if (res.ok) {
        toast('Price & stock updated ✓', 'success');
        setShowForm(false);
        refreshClaims();
        await reloadProducts();
      } else {
        const err = await res.json();
        toast(err.error ?? 'Save failed', 'error');
      }
      return;
    }

    const body = {
      name: form.name.trim(), price: form.price,
      originalPrice: form.originalPrice || form.price,
      cost: form.cost || '0',
      category: form.category, stock: form.stock,
      sku: form.sku.trim(), description: form.description.trim(),
      // Default to the signed-in store: a product created with NO supplier is
      // an orphan (supplier_id null) that its own creator can't edit/delete
      // (requireProductOwner treats ownerless rows as admin-only).
      supplierId: form.supplierId ? parseInt(form.supplierId, 10) : (currentSupplier?.id ?? null),
      barcode: form.barcode.trim() || null,
      imageUrl: form.imageUrls[0] ?? null,
      imageUrls: form.imageUrls,
      taxMode: form.taxMode,
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
  // A CLAIMED product isn't ours to delete from the shared catalog — only to
  // remove FROM OUR OWN STORE (unclaim). An OWNED product is deleted outright.
  // Opens a confirm modal (window.confirm is blocked in this runtime).
  const handleDelete = (productId: number, name: string) => {
    setConfirmDelete({ id: productId, name, isClaim: claimed.has(productId) });
  };

  const doDelete = async () => {
    if (!confirmDelete) return;
    const { id: productId, isClaim } = confirmDelete;
    const claim = claimed.get(productId);
    setConfirmDelete(null);

    setDeletingId(productId);
    const res = isClaim && claim
      ? await fetch(`/api/business-products/${claim.bpId}`, { method: 'DELETE' })
      : await fetch(`/api/products/${productId}`, { method: 'DELETE' });
    setDeletingId(null);

    if (res.ok) {
      toast(isClaim ? 'Removed from your store' : 'Product deleted', 'default');
      if (isClaim) refreshClaims();
      await reloadProducts();
    } else {
      const err = await res.json().catch(() => null);
      toast(err?.error ?? 'Delete failed', 'error');
    }
  };

  // Same claimed-vs-owned branch as handleRestock, for the ±1 quick buttons.
  const quickAdjust = async (productId: number, delta: number) => {
    const claim = claimed.get(productId);
    if (claim) {
      const nextQty = Math.max(0, claim.stockQty + delta);
      const res = await fetch(`/api/business-products/${claim.bpId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stockQty: nextQty }),
      });
      if (res.ok) { refreshClaims(); await reloadProducts(); }
      else toast('Stock update failed', 'error');
      return;
    }
    adjustStock(productId, delta);
  };

  // Opens the bulk-restock modal (window.prompt is blocked in this runtime).
  const handleRestock = (productId: number) => {
    setRestockQty('');
    setRestockFor(productId);
  };

  const doRestock = async () => {
    if (restockFor == null) return;
    const productId = restockFor;
    const qty = parseInt(restockQty, 10);
    if (!Number.isFinite(qty) || qty <= 0) { toast('Enter a quantity greater than 0', 'error'); return; }
    setRestockFor(null);

    // A CLAIMED product's stock is OUR OWN allocation (business_products
    // .stock_qty), not the wholesaler's shared catalog stock.
    const claim = claimed.get(productId);
    if (claim) {
      const res = await fetch(`/api/business-products/${claim.bpId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stockQty: claim.stockQty + qty }),
      });
      if (res.ok) { toast(`Restocked ${qty} units ✓`, 'success'); refreshClaims(); await reloadProducts(); }
      else toast('Restock failed', 'error');
      return;
    }

    adjustStock(productId, qty);
    toast(`Restocked ${qty} units ✓`, 'success');
  };

  // ── Filtered list ─────────────────────────────────────────
  // Only this store's products (owned + claimed); the whole catalog for admins.
  const myProducts   = useMemo(
    () => myScoped ? products.filter(p => myIds.has(p.id)) : products,
    [products, myIds, myScoped]
  );

  // A CLAIMED product's real price/stock are THIS store's own claim record
  // (custom_price / stock_qty) — the global catalog only holds the
  // wholesaler's numbers, which would otherwise show as this store's own.
  const effectiveStock = useCallback((id: number) => {
    const c = claimed.get(id);
    if (c) return c.stockQty;
    return inventory.find(i => i.id === id)?.stock ?? 0;
  }, [claimed, inventory]);
  const effectivePrice = useCallback((p: typeof products[number]) => claimed.get(p.id)?.customPrice ?? p.price, [claimed]);

  const myInventory = useMemo(
    () => myProducts.map(p => ({ id: p.id, stock: effectiveStock(p.id) })),
    [myProducts, effectiveStock]
  );

  // Live margin readout in the add/edit form as the owner types price & cost.
  const formMargin = useMemo(() => {
    const price = parseFloat(form.price) || 0;
    const cost  = parseFloat(form.cost)  || 0;
    if (!form.cost || price <= 0) return null;
    const profit = price - cost;
    return { profit, pct: Math.round((profit / price) * 100) };
  }, [form.price, form.cost]);

  const items = useMemo(() => {
    return myProducts.map(p => ({
      ...p, price: effectivePrice(p), stock: effectiveStock(p.id),
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
  }, [myProducts, effectivePrice, effectiveStock, filter, search]);

  const totalUnits = myInventory.reduce((n, i) => n + i.stock, 0);
  const lowStock   = myInventory.filter(i => i.stock > 0 && i.stock <= 10).length;
  const outOfStock = myInventory.filter(i => i.stock === 0).length;
  const totalValue = myProducts.reduce((n, p) => n + effectivePrice(p) * effectiveStock(p.id), 0);

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
            const isClaimedItem = claimed.has(p.id);
            return (
              <div key={p.id} className="inv-item">
                <div className="inv-item-icon">
                  <ProductImage imageUrl={(p as typeof p & {imageUrl?:string}).imageUrl} imageUrls={(p as typeof p & {imageUrls?:string[]}).imageUrls} name={p.name} style={{ borderRadius: 10 }} />
                </div>
                <div className="inv-item-info">
                  <div className="inv-item-name">
                    {p.name}
                    {isClaimedItem && <span className="inv-claimed-badge" title="Claimed from a wholesaler — price & stock are yours; everything else isn't">🔗 Claimed</span>}
                  </div>
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
                  <button className="inv-action-btn" onClick={() => quickAdjust(p.id, -1)} title="Remove 1">−</button>
                  <button className="inv-action-btn" onClick={() => quickAdjust(p.id,  1)} title="Add 1">+</button>
                  <button className="inv-action-btn" onClick={() => handleRestock(p.id)}  title="Bulk restock">↑</button>
                  <button className="inv-action-btn edit" onClick={() => openEdit(p.id)} title="Edit">✏️</button>
                  <button
                    className="inv-action-btn del"
                    onClick={() => handleDelete(p.id, p.name)}
                    disabled={deletingId === p.id}
                    title={isClaimedItem ? 'Remove from your store' : 'Delete'}
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
              <span>{editingClaim ? '🔗 Update Price & Stock' : editingId ? '✏️ Edit Product' : '➕ Add Product'}</span>
              <button className="modal-close" onClick={() => setShowForm(false)}>✕</button>
            </div>
            <div className="modal-body">

              {editingClaim && (
                <div className="inv-claim-notice">
                  This product is claimed from a wholesaler — <strong>{form.name}</strong> and its photos, category,
                  and description belong to their catalog. Only <strong>your price and stock</strong> are yours to change here.
                  Use Delete below to remove it from your store instead.
                </div>
              )}

              {/* Product photos — upload up to 8; the first is the cover.
                  Not applicable to a claimed item — it belongs to the wholesaler. */}
              {!editingClaim && (
                <div className="form-group">
                  <label className="form-label">📷 Product Photos</label>
                  <ProductImageUpload
                    urls={form.imageUrls}
                    onChange={urls => setForm(f => ({ ...f, imageUrls: urls }))}
                    maxPhotos={8}
                  />
                </div>
              )}

              <div className="form-group">
                <label className="form-label">Product Name *</label>
                <input className="form-input" placeholder="e.g. iPhone 15 Pro" value={form.name} onChange={e => pf('name', e.target.value)} disabled={!!editingClaim} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div className="form-group">
                  <label className="form-label">{editingClaim ? 'Your Price ($) *' : 'Sale Price ($) *'}</label>
                  <input className="form-input" type="number" min="0" step="0.01" placeholder="0.00" value={form.price} onChange={e => pf('price', e.target.value)} />
                </div>
                {!editingClaim && (
                  <div className="form-group">
                    <label className="form-label">Original Price ($)</label>
                    <input className="form-input" type="number" min="0" step="0.01" placeholder="0.00" value={form.originalPrice} onChange={e => pf('originalPrice', e.target.value)} />
                  </div>
                )}
              </div>

              {!editingClaim && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div className="form-group">
                    <label className="form-label">Cost ($)</label>
                    <input className="form-input" type="number" min="0" step="0.01" placeholder="0.00" value={form.cost} onChange={e => pf('cost', e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Profit Margin</label>
                    <div className="form-input" style={{
                      display: 'flex', alignItems: 'center', fontWeight: 700,
                      color: formMargin == null ? 'var(--text-muted)' : formMargin.profit >= 0 ? 'var(--success)' : 'var(--danger)',
                    }}>
                      {formMargin == null ? '— enter a cost' : `$${formMargin.profit.toFixed(2)} (${formMargin.pct}%)`}
                    </div>
                  </div>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: editingClaim ? '1fr' : '1fr 1fr', gap: 10 }}>
                {!editingClaim && (
                  <div className="form-group">
                    <label className="form-label">Category *</label>
                    <select className="form-input" value={form.category} onChange={e => pf('category', e.target.value)}>
                      {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
                    </select>
                  </div>
                )}
                <div className="form-group">
                  <label className="form-label">Stock Qty</label>
                  <input className="form-input" type="number" min="0" placeholder="0" value={form.stock} onChange={e => pf('stock', e.target.value)} />
                </div>
              </div>

              {!editingClaim && (
                <>
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

                  {/* Tax / VAT mode */}
                  <div className="form-group">
                    <label className="form-label">VAT / Tax (5%)</label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
                      {([
                        { value: 'none',     label: 'No Tax',       sub: 'Tax-free' },
                        { value: 'included', label: 'Tax Included', sub: 'Price incl. VAT' },
                        { value: 'excluded', label: 'Tax Excluded', sub: '+5% at checkout' },
                      ] as const).map(opt => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setForm(f => ({ ...f, taxMode: opt.value }))}
                          style={{
                            padding: '8px 6px',
                            borderRadius: 10,
                            border: `2px solid ${form.taxMode === opt.value ? 'var(--primary)' : 'var(--border)'}`,
                            background: form.taxMode === opt.value ? 'var(--primary-soft, rgba(99,102,241,.1))' : 'var(--surface)',
                            color: form.taxMode === opt.value ? 'var(--primary)' : 'var(--text)',
                            cursor: 'pointer',
                            textAlign: 'center',
                            transition: 'border-color .15s, background .15s',
                          }}
                        >
                          <div style={{ fontWeight: 600, fontSize: '.8rem' }}>{opt.label}</div>
                          <div style={{ fontSize: '.68rem', opacity: .7, marginTop: 2 }}>{opt.sub}</div>
                        </button>
                      ))}
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
                </>
              )}

              <button className="btn btn-primary btn-full btn-lg" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : editingClaim ? 'Update Price & Stock' : editingId ? 'Update Product' : 'Add Product'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Bulk Restock Modal ────────────────────────────── */}
      {restockFor !== null && (
        <div className="modal-overlay" onClick={() => setRestockFor(null)}>
          <div className="modal-box" style={{ maxWidth: 380 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span>↑ Restock {products.find(p => p.id === restockFor)?.name ?? 'product'}</span>
              <button className="modal-close" onClick={() => setRestockFor(null)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Quantity to add</label>
                <input
                  className="form-input"
                  type="number" min="1" inputMode="numeric" autoFocus
                  placeholder="e.g. 50"
                  value={restockQty}
                  onChange={e => setRestockQty(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') doRestock(); }}
                />
              </div>
              <button className="btn btn-primary btn-full btn-lg" onClick={doRestock}>
                Add to stock
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete / Unclaim Confirm Modal ────────────────── */}
      {confirmDelete && (
        <div className="modal-overlay" onClick={() => setConfirmDelete(null)}>
          <div className="modal-box" style={{ maxWidth: 400 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span>{confirmDelete.isClaim ? '🔗 Remove from your store' : '🗑️ Delete product'}</span>
              <button className="modal-close" onClick={() => setConfirmDelete(null)}>✕</button>
            </div>
            <div className="modal-body">
              <p style={{ marginBottom: 18, lineHeight: 1.5 }}>
                {confirmDelete.isClaim
                  ? <>Remove <strong>{confirmDelete.name}</strong> from your store? Other stores that claimed it are unaffected.</>
                  : <>Delete <strong>{confirmDelete.name}</strong>? This cannot be undone.</>}
              </p>
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="btn btn-outline btn-lg" style={{ flex: 1 }} onClick={() => setConfirmDelete(null)}>
                  Cancel
                </button>
                <button className="btn btn-danger btn-lg" style={{ flex: 1 }} onClick={doDelete}>
                  {confirmDelete.isClaim ? 'Remove' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
