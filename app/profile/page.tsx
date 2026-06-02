'use client';

import { useState, useEffect, useMemo, lazy, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import Header from '@/components/Header';
import { useAuth } from '@/context/AuthContext';
import { useApp } from '@/context/AppContext';
import { CATEGORIES, SUBCATEGORIES } from '@/lib/data';
import type { Product, BusinessProduct } from '@/lib/types';

const BarcodeScanner       = lazy(() => import('@/components/BarcodeScanner'));
const ProductImageUpload   = lazy(() => import('@/components/ProductImageUpload'));

/* ── AI Generate button (inline component) ─────────────────── */
interface AiResult { name?: string; description?: string; brand?: string; category?: string; subCategory?: string; tags?: string[]; }
function AiGenerateButton({ imageUrl, onResult }: { imageUrl: string; onResult: (r: AiResult) => void }) {
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');
  const [success, setSuccess] = useState(false);

  const generate = async () => {
    setLoading(true); setError(''); setSuccess(false);
    try {
      const res  = await fetch('/api/ai/describe-product', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ imageUrl }),
      });
      const data = await res.json();
      if (data.noKey) {
        setError('Add ANTHROPIC_API_KEY to .env.local to enable AI descriptions');
      } else if (data.error) {
        setError(data.error);
      } else {
        onResult(data);
        setSuccess(true);
        setTimeout(() => setSuccess(false), 3000);
      }
    } catch {
      setError('AI request failed');
    }
    setLoading(false);
  };

  return (
    <div style={{ marginBottom: 8 }}>
      <button
        type="button"
        className="btn btn-secondary btn-full"
        onClick={generate}
        disabled={loading}
        style={{ gap: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
        {loading ? (
          <><span className="btn-spinner" /> Analysing image with AI…</>
        ) : success ? (
          <>✅ AI filled in the details!</>
        ) : (
          <>✨ AI Generate Description</>
        )}
      </button>
      {error && <div className="auth-error" style={{ marginTop: 6, fontSize: '.78rem' }}>{error}</div>}
    </div>
  );
}

/* ── Referral card (inline component) ──────────────────────── */
function ReferralCard({ userId }: { userId: string }) {
  const [code,    setCode]    = useState('');
  const [copied,  setCopied]  = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/referrals?userId=${userId}`)
      .then(r => r.json())
      .then(d => { if (d.code) setCode(d.code); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [userId]);

  const link   = typeof window !== 'undefined'
    ? `${window.location.origin}/auth/signup?ref=${code}`
    : '';

  const share = () => {
    if (navigator.share) {
      navigator.share({ title: 'Mogarenta', text: `Shop with me on Mogarenta — use my code ${code} to get $5 off!`, url: link })
        .catch(() => {});
    } else {
      navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  if (loading || !code) return null;

  return (
    <div className="referral-card">
      <div className="referral-card-top">
        <div className="referral-icon">🎁</div>
        <div>
          <div className="referral-title">Invite Friends, Earn $5</div>
          <div className="referral-desc">Both of you get $5 credit when they sign up</div>
        </div>
      </div>
      <div className="referral-code-row">
        <div className="referral-code">{code}</div>
        <button className="btn btn-primary btn-sm" onClick={share}>
          {copied ? '✓ Copied!' : '📤 Share'}
        </button>
      </div>
      <div className="referral-link">{link}</div>
    </div>
  );
}

const AVATARS       = ['👤','😊','😎','🧑','👩','👨','🧑‍💻','👩‍💼','👨‍💼','🧑‍🍳','🦁','🐯','🐼','🦊','🐸'];
const EMOJI_OPTIONS = ['📦','📱','💻','🎧','👗','👟','🏠','🍎','💊','⚽','🎵','📷','🧴','🌿','☕','🍯','🥛','💡','🌬️','🩹','❤️','🧘','🪢','💪','🍶','🕶️','👔','📺','📲','🏗️','🪑','🚗','📚','💄','🩺','⚙️','🔧'];
const BIZ_ICONS     = ['🏭','🏪','🏬','🛒','🏥','💊','👗','🔧','🚗','🍎','🍕','📚','💻','🌿','💄','🏗️'];

interface ProductFormData {
  name: string; price: string; originalPrice: string;
  category: string; subCategory: string; icon: string;
  stock: string; sku: string; description: string;
  barcode: string; brand: string; tags: string;
  imageUrls: string[];
}

const emptyForm: ProductFormData = {
  name:'', price:'', originalPrice:'', category:'electronics', subCategory:'',
  icon:'📦', stock:'0', sku:'', description:'', barcode:'', brand:'', tags:'',
  imageUrls: [],
};

type BizTab = 'store' | 'edit' | 'analytics' | 'coupons';

interface Coupon {
  id: number; code: string; type: string; value: number;
  minOrder: number; maxUses: number | null; usedCount: number;
  expiresAt: string | null; active: boolean;
}

interface VerifRequest { id: number; status: string; message: string | null; createdAt: string; }

export default function ProfilePage() {
  const router  = useRouter();
  const { user, currentSupplier, currentProfile, accountType, loading,
          signOut, refreshAccount, updateProfile } = useAuth();
  const { state, toast, reloadProducts } = useApp();

  /* ── User profile state ──────────────────────────────────── */
  const [fullName,     setFullName]     = useState('');
  const [phone,        setPhone]        = useState('');
  const [avatar,       setAvatar]       = useState('👤');
  const [showAvatars,  setShowAvatars]  = useState(false);
  const [savingUser,   setSavingUser]   = useState(false);
  const [savedUser,    setSavedUser]    = useState(false);

  /* ── Business core state ─────────────────────────────────── */
  const [bizTab,       setBizTab]       = useState<BizTab>('store');
  const [bio,          setBio]          = useState('');
  const [contacts,     setContacts]     = useState<string[]>(['']);
  const [bizName,      setBizName]      = useState('');
  const [bizIcon,      setBizIcon]      = useState('🏭');
  const [bizSlug,      setBizSlug]      = useState('');
  const [slugError,    setSlugError]    = useState('');
  const [location,     setLocation]     = useState('');
  const [hideStock,    setHideStock]    = useState(false);
  const [savingBiz,    setSavingBiz]    = useState(false);
  const [savedBiz,     setSavedBiz]     = useState(false);

  /* ── Business product management ────────────────────────── */
  const [bizProducts,  setBizProducts]  = useState<BusinessProduct[]>([]);
  const [bpLoading,    setBpLoading]    = useState(false);
  const [bpSearch,     setBpSearch]     = useState('');
  const [showScanner,  setShowScanner]  = useState(false);
  const [scanLoading,  setScanLoading]  = useState(false);

  // Coupons state
  const [coupons,       setCoupons]       = useState<Coupon[]>([]);
  const [couponsLoaded, setCouponsLoaded] = useState(false);
  const [newCoupon,     setNewCoupon]     = useState({ code:'', type:'percent', value:'', minOrder:'0', maxUses:'', expiresAt:'' });
  const [savingCoupon,  setSavingCoupon]  = useState(false);
  const [showCouponForm,setShowCouponForm]= useState(false);

  // Verification request state
  const [verifRequest,  setVerifRequest]  = useState<VerifRequest | null | 'none'>('none');
  const [requestingVerif,setRequestingVerif]= useState(false);

  // CSV bulk import state
  const [csvFile,      setCsvFile]      = useState<File | null>(null);
  const [csvImporting, setCsvImporting] = useState(false);
  const [csvResult,    setCsvResult]    = useState('');
  const [editBP,       setEditBP]       = useState<BusinessProduct | null>(null);
  const [editPrice,    setEditPrice]    = useState('');
  const [editStock,    setEditStock]    = useState('');
  const [editMoq,      setEditMoq]      = useState('1');
  const [savingBP,     setSavingBP]     = useState(false);
  const [deletingBP,   setDeletingBP]   = useState<number | null>(null);

  /* ── Claim modal (scan result) ───────────────────────────── */
  const [claimProduct, setClaimProduct] = useState<Product | null>(null);
  const [claimPrice,   setClaimPrice]   = useState('');
  const [claimStock,   setClaimStock]   = useState('10');
  const [claimMoq,     setClaimMoq]     = useState('1');
  const [savingClaim,  setSavingClaim]  = useState(false);

  /* ── New product form (profile page) ────────────────────── */
  const [showForm,     setShowForm]     = useState(false);
  const [editingProd,  setEditingProd]  = useState<Product | null>(null);
  const [form,         setForm]         = useState<ProductFormData>(emptyForm);
  const [savingProd,   setSavingProd]   = useState(false);
  const [deletingId,   setDeletingId]   = useState<number | null>(null);

  /* ── Load profile & business data ────────────────────────── */
  useEffect(() => {
    if (currentProfile) {
      setFullName(currentProfile.fullName ?? '');
      setPhone(currentProfile.phone ?? '');
      setAvatar(currentProfile.avatar ?? '👤');
    }
  }, [currentProfile]);

  useEffect(() => {
    if (currentSupplier) {
      setBio(currentSupplier.bio ?? '');
      setBizName(currentSupplier.name ?? '');
      setBizIcon(currentSupplier.icon ?? '🏭');
      setLocation(currentSupplier.location ?? '');
      setHideStock(currentSupplier.hideStock ?? false);
      setBizSlug((currentSupplier as unknown as Record<string,unknown>).slug as string ?? '');
      const nums = currentSupplier.contactNumbers ?? [];
      setContacts(nums.length > 0 ? nums : ['']);
    }
  }, [currentSupplier]);

  /* Load business products + coupons + verification status */
  useEffect(() => {
    if (!currentSupplier) return;
    loadBizProducts();
    // Load coupons
    fetch(`/api/coupons?supplierId=${currentSupplier.id}`)
      .then(r => r.json())
      .then(d => { setCoupons(Array.isArray(d) ? d : []); setCouponsLoaded(true); })
      .catch(() => setCouponsLoaded(true));
    // Load verification request status
    fetch(`/api/verification-requests?supplierId=${currentSupplier.id}`)
      .then(r => r.json())
      .then(d => setVerifRequest(Array.isArray(d) && d[0] ? d[0] : null))
      .catch(() => setVerifRequest(null));
  }, [currentSupplier]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadBizProducts() {
    if (!currentSupplier) return;
    setBpLoading(true);
    try {
      const res  = await fetch(`/api/business-products?supplierId=${currentSupplier.id}`);
      const data = await res.json();
      setBizProducts(Array.isArray(data) ? data : []);
    } catch {
      setBizProducts([]);
    }
    setBpLoading(false);
  }

  /* ── Computed ──────────────────────────────────────────────── */
  const wishlistCount   = state.wishlist.length;
  const cartItemCount   = state.cart.reduce((n, i) => n + i.qty, 0);
  const supplierProducts = useMemo(
    () => currentSupplier ? state.products.filter(p => p.supplierId === currentSupplier.id) : [],
    [state.products, currentSupplier]
  );
  const filteredBP = useMemo(() => {
    if (!bpSearch.trim()) return bizProducts;
    const q = bpSearch.toLowerCase();
    return bizProducts.filter(bp =>
      bp.product?.name.toLowerCase().includes(q) ||
      bp.product?.brand?.toLowerCase().includes(q) ||
      bp.product?.category.toLowerCase().includes(q)
    );
  }, [bizProducts, bpSearch]);

  /* ── Sign out ──────────────────────────────────────────────── */
  const handleSignOut = async () => { await signOut(); router.push('/'); };

  /* ── Save user profile ─────────────────────────────────────── */
  const handleSaveUser = async () => {
    setSavingUser(true);
    await updateProfile({ fullName: fullName.trim(), phone: phone.trim(), avatar });
    setSavingUser(false); setSavedUser(true);
    setTimeout(() => setSavedUser(false), 3000);
  };

  /* ── Save business profile ─────────────────────────────────── */
  const handleSaveBiz = async () => {
    if (!currentSupplier) return;
    // Validate slug
    const slug = bizSlug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
    if (bizSlug.trim() && (slug.length < 3 || slug.length > 30)) {
      setSlugError('Slug must be 3–30 characters (letters, numbers, hyphens)');
      return;
    }
    setSlugError('');
    setSavingBiz(true);
    const cleanContacts = contacts.map(c => c.trim()).filter(Boolean);
    await fetch(`/api/suppliers/${currentSupplier.id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        bio:            bio.trim(),
        contactNumbers: cleanContacts,
        name:           bizName.trim(),
        icon:           bizIcon,
        location:       location.trim(),
        slug:           slug || null,
        hideStock,
      }),
    });
    await refreshAccount();
    setSavingBiz(false); setSavedBiz(true);
    setTimeout(() => setSavedBiz(false), 3000);
  };

  const addContact    = () => { if (contacts.length < 4) setContacts(c => [...c, '']); };
  const updateContact = (i: number, v: string) => setContacts(c => c.map((x, j) => j === i ? v : x));
  const removeContact = (i: number) => setContacts(c => c.length > 1 ? c.filter((_, j) => j !== i) : ['']);

  /* ── Barcode scan ──────────────────────────────────────────── */
  async function handleBarcodeDetected(code: string) {
    setScanLoading(true);
    try {
      const res = await fetch(`/api/products?barcode=${encodeURIComponent(code)}`);
      if (res.ok) {
        const product = await res.json() as Product;
        setClaimProduct(product);
        setClaimPrice(String(product.price));
        setClaimStock('10');
      } else {
        toast(`Barcode ${code} not found in database`, 'error');
      }
    } catch {
      toast('Network error', 'error');
    }
    setScanLoading(false);
  }

  /* ── Claim product ─────────────────────────────────────────── */
  async function handleClaim() {
    if (!claimProduct || !currentSupplier) return;
    const p = parseFloat(claimPrice);
    if (!p || p <= 0) { toast('Enter a valid price', 'error'); return; }
    setSavingClaim(true);
    try {
      const res = await fetch('/api/business-products', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          supplierId:  currentSupplier.id,
          productId:   claimProduct.id,
          customPrice: p,
          stockQty:    parseInt(claimStock) || 0,
          moq:         Math.max(1, parseInt(claimMoq) || 1),
        }),
      });
      if (res.ok) {
        toast(`✅ "${claimProduct.name}" added to your store!`, 'success');
        setClaimProduct(null);
        await loadBizProducts();
      } else {
        const err = await res.json();
        toast(err.error ?? 'Failed to add product', 'error');
      }
    } catch { toast('Network error', 'error'); }
    setSavingClaim(false);
  }

  /* ── Edit BP price/stock inline ────────────────────────────── */
  function openEditBP(bp: BusinessProduct) {
    setEditBP(bp);
    setEditPrice(String(bp.customPrice));
    setEditStock(String(bp.stockQty));
    setEditMoq(String(bp.moq ?? 1));
  }

  async function saveEditBP() {
    if (!editBP) return;
    setSavingBP(true);
    try {
      const res = await fetch(`/api/business-products/${editBP.id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          customPrice: parseFloat(editPrice),
          stockQty:    parseInt(editStock) || 0,
          moq:         Math.max(1, parseInt(editMoq) || 1),
        }),
      });
      if (res.ok) {
        toast('Updated ✓', 'success');
        setEditBP(null);
        await loadBizProducts();
      }
    } catch { toast('Failed to update', 'error'); }
    setSavingBP(false);
  }

  async function toggleBPActive(bp: BusinessProduct) {
    await fetch(`/api/business-products/${bp.id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ isActive: !bp.isActive }),
    });
    await loadBizProducts();
  }

  async function deleteBP(id: number) {
    if (!confirm('Remove this product from your store?')) return;
    setDeletingBP(id);
    await fetch(`/api/business-products/${id}`, { method: 'DELETE' });
    setBizProducts(prev => prev.filter(bp => bp.id !== id));
    setDeletingBP(null);
    toast('Product removed', 'default');
  }

  /* ── New/Edit product form ─────────────────────────────────── */
  function openAddProduct() { setEditingProd(null); setForm(emptyForm); setShowForm(true); }
  function openEditProduct(p: Product) {
    setEditingProd(p);
    setForm({
      name:         p.name,
      price:        String(p.price),
      originalPrice:String(p.originalPrice),
      category:     p.category,
      subCategory:  p.subCategory ?? '',
      icon:         p.icon,
      stock:        String(p.stock),
      sku:          p.sku,
      description:  p.description,
      barcode:      p.barcode    ?? '',
      brand:        p.brand      ?? '',
      tags:         (p.tags ?? []).join(', '),
      imageUrls:    p.imageUrls  ?? [],
    });
    setShowForm(true);
  }
  const pf = (k: keyof ProductFormData, v: string | string[]) => setForm(f => ({ ...f, [k]: v }));

  /* ── Save coupon ─────────────────────────────────── */
  const handleSaveCoupon = async () => {
    if (!newCoupon.code.trim() || !newCoupon.value || !currentSupplier) return;
    setSavingCoupon(true);
    const res = await fetch('/api/coupons', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        code:       newCoupon.code.toUpperCase().trim(),
        type:       newCoupon.type,
        value:      parseFloat(newCoupon.value),
        minOrder:   parseFloat(newCoupon.minOrder || '0'),
        maxUses:    newCoupon.maxUses ? parseInt(newCoupon.maxUses) : null,
        expiresAt:  newCoupon.expiresAt || null,
        supplierId: currentSupplier.id,
      }),
    });
    if (res.ok) {
      const saved = await res.json();
      setCoupons(prev => [saved, ...prev]);
      setNewCoupon({ code:'', type:'percent', value:'', minOrder:'0', maxUses:'', expiresAt:'' });
      setShowCouponForm(false);
      toast('Coupon created ✓', 'success');
    } else {
      toast('Failed to create coupon', 'error');
    }
    setSavingCoupon(false);
  };

  const toggleCouponActive = async (c: Coupon) => {
    const res = await fetch(`/api/coupons/${c.id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ active: !c.active }),
    });
    if (res.ok) setCoupons(prev => prev.map(x => x.id === c.id ? { ...x, active: !x.active } : x));
  };

  const deleteCoupon = async (id: number) => {
    if (!confirm('Delete this coupon?')) return;
    const res = await fetch(`/api/coupons/${id}`, { method: 'DELETE' });
    if (res.ok) { setCoupons(prev => prev.filter(c => c.id !== id)); toast('Coupon deleted', 'default'); }
  };

  /* ── CSV bulk import ──────────────────────────────── */
  const handleCsvImport = async () => {
    if (!csvFile || !currentSupplier) return;
    setCsvImporting(true); setCsvResult('');
    const text = await csvFile.text();
    const lines = text.split('\n').filter(l => l.trim());
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/[^a-z0-9]/g, '_'));
    let created = 0; let failed = 0;
    for (let i = 1; i < lines.length; i++) {
      const vals = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
      const row: Record<string, string> = {};
      headers.forEach((h, j) => { row[h] = vals[j] ?? ''; });
      const name = row.name || row.product_name;
      const price = parseFloat(row.price || row.selling_price || '0');
      if (!name || !price) { failed++; continue; }
      const res = await fetch('/api/products', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          name, price,
          originalPrice: parseFloat(row.original_price || row.compare_price || String(price)),
          category:      row.category || 'other',
          icon:          row.icon || '📦',
          stock:         parseInt(row.stock || row.quantity || '0', 10),
          sku:           row.sku || `CSV-${Date.now()}-${i}`,
          description:   row.description || '',
          brand:         row.brand || '',
          barcode:       row.barcode || row.ean || '',
          tags:          row.tags ? row.tags.split('|').map(t => t.trim()) : [],
          supplierId:    currentSupplier.id,
        }),
      });
      if (res.ok) created++; else failed++;
    }
    setCsvResult(`✅ ${created} products imported${failed > 0 ? `, ❌ ${failed} skipped` : ''}`);
    if (created > 0) await reloadProducts();
    setCsvImporting(false);
    setCsvFile(null);
  };

  /* ── Verification request ─────────────────────────── */
  const handleRequestVerification = async () => {
    if (!currentSupplier) return;
    setRequestingVerif(true);
    const res = await fetch('/api/verification-requests', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ supplierId: currentSupplier.id }),
    });
    if (res.ok) {
      const data = await res.json();
      setVerifRequest(data);
      toast('Verification request sent ✓', 'success');
    } else {
      toast('Failed to send request', 'error');
    }
    setRequestingVerif(false);
  };

  const handleSaveProduct = async () => {
    if (!form.name.trim() || !form.price) { toast('Name and price required', 'error'); return; }
    setSavingProd(true);
    const body = {
      name:          form.name.trim(),
      price:         form.price,
      originalPrice: form.originalPrice || form.price,
      category:      form.category,
      subCategory:   form.subCategory   || null,
      icon:          form.icon,
      stock:         form.stock,
      sku:           form.sku.trim(),
      description:   form.description.trim(),
      barcode:       form.barcode.trim() || null,
      brand:         form.brand.trim()   || null,
      tags:          form.tags ? form.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
      imageUrls:     form.imageUrls,
      // Keep legacy imageUrl in sync with first photo
      imageUrl:      form.imageUrls[0] ?? null,
      supplierId:    currentSupplier?.id ?? null,
    };
    if (editingProd) {
      const res = await fetch(`/api/products/${editingProd.id}`, { method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) });
      if (res.ok) toast('Product updated ✓', 'success'); else toast('Failed to update', 'error');
    } else {
      const res = await fetch('/api/products', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) });
      if (res.ok) toast('Product added ✓', 'success'); else toast('Failed to add product', 'error');
    }
    setSavingProd(false);
    setShowForm(false);
    await reloadProducts();
  };

  const handleDeleteProduct = async (productId: number) => {
    if (!confirm('Delete this product?')) return;
    setDeletingId(productId);
    const res = await fetch(`/api/products/${productId}`, { method:'DELETE' });
    setDeletingId(null);
    if (res.ok) { toast('Product deleted', 'default'); await reloadProducts(); }
    else toast('Failed to delete', 'error');
  };

  /* ── Loading state ─────────────────────────────────────────── */
  if (loading) {
    return (
      <div className="page-anim">
        <Header showSearch={false} />
        <div style={{ padding: 20 }}>
          <div className="skeleton" style={{ height: 140, borderRadius: 20, marginBottom: 16 }} />
          <div className="skeleton" style={{ height: 44, borderRadius: 8, marginBottom: 10 }} />
          <div className="skeleton" style={{ height: 80, borderRadius: 8 }} />
        </div>
      </div>
    );
  }

  /* ── Not logged in ─────────────────────────────────────────── */
  if (!user) {
    return (
      <div className="page-anim">
        <Header showSearch={false} />
        <div className="empty-state" style={{ marginTop: 60 }}>
          <div className="empty-icon">🔐</div>
          <div className="empty-title">Sign in required</div>
          <div className="empty-sub">Log in to access your profile</div>
          <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => router.push('/auth/login')}>Sign In</button>
          <button className="btn btn-outline" style={{ marginTop: 10 }} onClick={() => router.push('/auth/signup')}>Create Account</button>
        </div>
      </div>
    );
  }

  /* ══════════════════════════════════════════════════════════════
     CUSTOMER PROFILE
  ══════════════════════════════════════════════════════════════ */
  if (accountType === 'user') {
    return (
      <div className="page-anim">
        <Header showSearch={false} />
        <div className="page-title-bar">
          <span className="page-title">👤 My Profile</span>
          <button className="btn btn-ghost btn-sm" onClick={handleSignOut}>Sign Out</button>
        </div>

        <div className="my-profile-wrap">
          <div className="profile-photo-row">
            <button className="profile-photo-big" style={{ cursor:'pointer', border:'none', background:'var(--surface)' }} onClick={() => setShowAvatars(v => !v)}>
              {avatar}
            </button>
            {showAvatars && (
              <div className="avatar-picker">
                {AVATARS.map(em => (
                  <button key={em} className={`avatar-opt ${avatar === em ? 'selected' : ''}`} onClick={() => { setAvatar(em); setShowAvatars(false); }}>
                    {em}
                  </button>
                ))}
              </div>
            )}
            <div className="profile-photo-name">
              {currentProfile?.fullName || 'Your Name'}
              {currentProfile?.verified && (
                <span className="verified-badge-inline">✓ Verified</span>
              )}
            </div>
            <div className="profile-photo-sub">{user.phoneNumber ?? user.email ?? ''}</div>
          </div>

          <div className="user-stats-row">
            <div className="user-stat-chip"><span className="user-stat-val">{wishlistCount}</span><span className="user-stat-lbl">Wishlist</span></div>
            <div className="user-stat-chip"><span className="user-stat-val">{cartItemCount}</span><span className="user-stat-lbl">In Cart</span></div>
            <div className="user-stat-chip" style={{ cursor:'pointer' }} onClick={() => router.push('/orders')}>
              <span className="user-stat-val">📋</span><span className="user-stat-lbl">Orders</span>
            </div>
            <div className="user-stat-chip" style={{ cursor:'pointer' }} onClick={() => router.push('/')}>
              <span className="user-stat-val">🛍️</span><span className="user-stat-lbl">Shop</span>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Full Name</label>
            <input className="form-input" placeholder="Your full name" value={fullName} onChange={e => setFullName(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Phone Number</label>
            <input className="form-input" placeholder="+252 XX XXX XXXX" value={phone} onChange={e => setPhone(e.target.value)} />
          </div>

          {savedUser && <div className="auth-success" style={{ marginBottom: 12 }}>✓ Profile saved</div>}
          <button className="btn btn-primary btn-full btn-lg" onClick={handleSaveUser} disabled={savingUser}>
            {savingUser ? 'Saving…' : 'Save Profile'}
          </button>

          <button className="user-wishlist-card" style={{ marginTop: 16 }} onClick={() => router.push('/orders')}>
            <div style={{ display:'flex', alignItems:'center', gap: 10 }}>
              <span style={{ fontSize:'1.5rem' }}>📋</span>
              <div><div style={{ fontWeight: 700, fontSize:'.92rem' }}>Order History</div>
                <div style={{ fontSize:'.8rem', color:'var(--text-muted)' }}>View all your past orders</div></div>
            </div>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M9 18l6-6-6-6"/></svg>
          </button>

          {/* Referral section */}
          <ReferralCard userId={user.id} />
        </div>
      </div>
    );
  }

  /* ══════════════════════════════════════════════════════════════
     BUSINESS PROFILE
  ══════════════════════════════════════════════════════════════ */
  return (
    <div className="page-anim">
      <Header showSearch={false} />

      {/* ── Business Hero Card ─────────────────────────────────── */}
      <div className="biz-hero-card">
        <div className="biz-hero-top">
          <div className="biz-hero-icon">{currentSupplier?.icon ?? '🏭'}</div>
          <div className="biz-hero-info">
            <div className="biz-hero-name">
              {currentSupplier?.name ?? 'Your Business'}
              {currentSupplier?.verified && <span className="biz-verified-badge">✓ Verified</span>}
            </div>
            <div className="biz-hero-sub">{user.phoneNumber ?? user.email ?? ''}</div>
            {currentSupplier?.location && (
              <div className="biz-hero-location">📍 {currentSupplier.location}</div>
            )}
          </div>
          <button className="btn btn-ghost btn-sm" style={{ alignSelf:'flex-start', flexShrink:0 }} onClick={handleSignOut}>
            Sign Out
          </button>
        </div>

        {/* Stats row */}
        <div className="biz-stats-row">
          <div className="biz-stat">
            <div className="biz-stat-val">{bizProducts.length + supplierProducts.length}</div>
            <div className="biz-stat-lbl">Products</div>
          </div>
          <div className="biz-stat">
            <div className="biz-stat-val">{currentSupplier?.rating?.toFixed(1) ?? '–'}</div>
            <div className="biz-stat-lbl">⭐ Rating</div>
          </div>
          <div className="biz-stat">
            <div className="biz-stat-val">{currentSupplier?.reviews ?? 0}</div>
            <div className="biz-stat-lbl">Reviews</div>
          </div>
          <div className="biz-stat" style={{ cursor:'pointer' }} onClick={() => router.push(`/supplier/${currentSupplier?.id}`)}>
            <div className="biz-stat-val">👁️</div>
            <div className="biz-stat-lbl">View Store</div>
          </div>
        </div>

        {/* Tab bar */}
        <div className="biz-tabs">
          <button className={`biz-tab${bizTab === 'store'     ? ' active' : ''}`} onClick={() => setBizTab('store')}>📦 Store</button>
          <button className={`biz-tab${bizTab === 'coupons'   ? ' active' : ''}`} onClick={() => setBizTab('coupons')}>🎟️ Coupons</button>
          <button className={`biz-tab${bizTab === 'analytics' ? ' active' : ''}`} onClick={() => setBizTab('analytics')}>📊 Reports</button>
          <button className={`biz-tab${bizTab === 'edit'      ? ' active' : ''}`} onClick={() => setBizTab('edit')}>⚙️ Settings</button>
        </div>
      </div>

      {/* ══════════ TAB: MY STORE ══════════ */}
      {bizTab === 'store' && (
        <div className="biz-store-wrap">
          {/* Store action bar */}
          <div className="biz-store-actions">
            <input
              className="form-input"
              placeholder="Search your products…"
              value={bpSearch}
              onChange={e => setBpSearch(e.target.value)}
              style={{ flex: 1 }}
            />
            <button className="btn btn-secondary btn-sm" style={{ flexShrink:0, gap:6, display:'flex', alignItems:'center' }}
              onClick={() => setShowScanner(true)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <rect x="3" y="3" width="4" height="4" rx=".5"/><rect x="17" y="3" width="4" height="4" rx=".5"/>
                <rect x="3" y="17" width="4" height="4" rx=".5"/>
                <line x1="7" y1="5" x2="17" y2="5"/><line x1="7" y1="19" x2="13" y2="19"/>
                <line x1="19" y1="7" x2="19" y2="13"/><line x1="5" y1="7" x2="5" y2="17"/>
              </svg>
              Scan
            </button>
            <button className="btn btn-primary btn-sm" style={{ flexShrink:0 }} onClick={openAddProduct}>
              + New
            </button>
          </div>

          {/* CSV Bulk Import */}
          <div className="csv-import-bar">
            <span className="csv-import-label">📥 Bulk Import</span>
            <input
              type="file" accept=".csv,.txt"
              style={{ display:'none' }} id="csv-upload"
              onChange={e => { setCsvFile(e.target.files?.[0] ?? null); setCsvResult(''); }}
            />
            <label htmlFor="csv-upload" className="btn btn-ghost btn-sm" style={{ cursor:'pointer' }}>
              {csvFile ? `📄 ${csvFile.name}` : 'Choose CSV'}
            </label>
            {csvFile && (
              <button className="btn btn-secondary btn-sm" onClick={handleCsvImport} disabled={csvImporting}>
                {csvImporting ? 'Importing…' : 'Import'}
              </button>
            )}
            {csvResult && <span className="csv-result">{csvResult}</span>}
            <a href="#" style={{ fontSize:'.72rem', color:'var(--text-muted)', textDecoration:'underline' }}
              onClick={e => { e.preventDefault();
                const sample = 'name,price,original_price,category,icon,stock,sku,description,brand,barcode,tags\nSample Product,9.99,12.99,electronics,📦,10,SKU-001,Description here,BrandName,1234567890123,Tag1|Tag2';
                const blob = new Blob([sample], { type: 'text/csv' });
                const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'products_template.csv'; a.click();
              }}>
              Download template
            </a>
          </div>

          {/* Scan loading indicator */}
          {scanLoading && (
            <div style={{ padding:'10px 16px', display:'flex', alignItems:'center', gap:10, color:'var(--text-muted)', fontSize:'.85rem' }}>
              <span className="btn-spinner" /> Looking up barcode…
            </div>
          )}

          {/* Business Products (from business_products table) */}
          {bpLoading ? (
            <div style={{ padding: '16px' }}>
              {[1,2,3].map(i => <div key={i} className="skeleton" style={{ height: 76, borderRadius: 12, marginBottom: 10 }} />)}
            </div>
          ) : filteredBP.length > 0 && (
            <div className="biz-products-section">
              <div className="biz-section-label">Catalog Products</div>
              <div className="biz-product-list">
                {filteredBP.map(bp => {
                  const p = bp.product;
                  if (!p) return null;
                  const cat = CATEGORIES.find(c => c.id === p.category);
                  return (
                    <div key={bp.id} className={`biz-product-item${bp.isActive ? '' : ' paused'}`}>
                      <div className="biz-product-icon">{p.icon}</div>
                      <div className="biz-product-info">
                        <div className="biz-product-name">{p.name}</div>
                        {p.brand && <div className="biz-product-brand">{p.brand}</div>}
                        <div className="biz-product-meta">
                          {cat?.icon} {cat?.name}
                          {p.barcode && <span className="biz-product-barcode"> · 🔢 {p.barcode}</span>}
                        </div>
                        {p.tags && p.tags.length > 0 && (
                          <div className="claim-tags-row" style={{ marginTop: 4 }}>
                            {p.tags.slice(0, 3).map(t => <span key={t} className="claim-tag">{t}</span>)}
                          </div>
                        )}
                      </div>
                      <div className="biz-product-pricing">
                        {editBP?.id === bp.id ? (
                          <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                            <input className="form-input" type="number" value={editPrice} onChange={e => setEditPrice(e.target.value)}
                              style={{ width:80, padding:'4px 8px', fontSize:'.82rem' }} placeholder="Price $" />
                            <input className="form-input" type="number" value={editStock} onChange={e => setEditStock(e.target.value)}
                              style={{ width:80, padding:'4px 8px', fontSize:'.82rem' }} placeholder="Stock" />
                            <input className="form-input" type="number" min="1" value={editMoq} onChange={e => setEditMoq(e.target.value)}
                              style={{ width:80, padding:'4px 8px', fontSize:'.82rem' }} placeholder="MOQ" title="Minimum Order Quantity" />
                            <div style={{ display:'flex', gap:4 }}>
                              <button className="btn btn-primary" style={{ fontSize:'.75rem', padding:'4px 8px' }} onClick={saveEditBP} disabled={savingBP}>
                                {savingBP ? '…' : '✓'}
                              </button>
                              <button className="btn btn-ghost" style={{ fontSize:'.75rem', padding:'4px 8px' }} onClick={() => setEditBP(null)}>✕</button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="biz-price-mine">${bp.customPrice.toFixed(2)}</div>
                            <div className="biz-price-global">Catalog: ${p.price.toFixed(2)}</div>
                            <div className={`biz-stock-badge${bp.stockQty < 5 ? ' low' : ''}`}>
                              {bp.stockQty} in stock
                            </div>
                            {(bp.moq ?? 1) > 1 && (
                              <div style={{ fontSize:'.72rem', color:'var(--primary)', fontWeight:600, marginTop:2 }}>
                                MOQ: {bp.moq}
                              </div>
                            )}
                          </>
                        )}
                      </div>
                      <div className="biz-product-actions">
                        <button className="btn btn-ghost btn-sm" onClick={() => openEditBP(bp)} title="Edit price & stock">✏️</button>
                        <button className="btn btn-ghost btn-sm" onClick={() => toggleBPActive(bp)} title={bp.isActive ? 'Pause' : 'Activate'}>
                          {bp.isActive ? '⏸️' : '▶️'}
                        </button>
                        <button className="btn btn-ghost btn-sm" style={{ color:'var(--danger)' }}
                          onClick={() => deleteBP(bp.id)}
                          disabled={deletingBP === bp.id}
                          title="Remove from store"
                        >
                          {deletingBP === bp.id ? '…' : '🗑️'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* My own created products */}
          {supplierProducts.length > 0 && (
            <div className="biz-products-section">
              <div className="biz-section-label">My Created Products</div>
              <div className="biz-product-list">
                {supplierProducts.map(p => {
                  const cat = CATEGORIES.find(c => c.id === p.category);
                  return (
                    <div key={p.id} className="biz-product-item">
                      <div className="biz-product-icon">{p.icon}</div>
                      <div className="biz-product-info">
                        <div className="biz-product-name">{p.name}</div>
                        {p.brand && <div className="biz-product-brand">{p.brand}</div>}
                        <div className="biz-product-meta">{cat?.icon} {cat?.name}</div>
                        {p.tags && p.tags.length > 0 && (
                          <div className="claim-tags-row" style={{ marginTop: 4 }}>
                            {p.tags.slice(0, 3).map(t => <span key={t} className="claim-tag">{t}</span>)}
                          </div>
                        )}
                      </div>
                      <div className="biz-product-pricing">
                        <div className="biz-price-mine">${p.price.toFixed(2)}</div>
                        <div className={`biz-stock-badge${p.stock < 5 ? ' low' : ''}`}>{p.stock} in stock</div>
                      </div>
                      <div className="biz-product-actions">
                        <button className="btn btn-ghost btn-sm" onClick={() => openEditProduct(p)}>✏️</button>
                        <button className="btn btn-ghost btn-sm" style={{ color:'var(--danger)' }}
                          onClick={() => handleDeleteProduct(p.id)} disabled={deletingId === p.id}>
                          {deletingId === p.id ? '…' : '🗑️'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Empty state */}
          {bizProducts.length === 0 && supplierProducts.length === 0 && !bpLoading && (
            <div className="empty-state" style={{ marginTop: 40 }}>
              <div className="empty-icon">📦</div>
              <div className="empty-title">No products yet</div>
              <div className="empty-sub">Scan a barcode to add a product from the catalog, or create one manually.</div>
              <div style={{ display:'flex', gap:10, marginTop:16 }}>
                <button className="btn btn-primary" onClick={() => setShowScanner(true)}>
                  📷 Scan Barcode
                </button>
                <button className="btn btn-ghost" onClick={openAddProduct}>+ Create New</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══════════ TAB: EDIT PROFILE ══════════ */}
      {bizTab === 'edit' && (
        <div style={{ padding: '0 16px 100px' }}>
          {!currentSupplier && (
            <div className="auth-error" style={{ marginBottom: 16 }}>No business profile found. Please re-register.</div>
          )}
          {currentSupplier && (
            <>
              {/* Icon picker */}
              <div className="form-group" style={{ marginTop: 16 }}>
                <label className="form-label">Business Icon</label>
                <div className="emoji-picker-row">
                  {BIZ_ICONS.map(em => (
                    <button key={em} className={`avatar-opt ${bizIcon === em ? 'selected' : ''}`} onClick={() => setBizIcon(em)}>{em}</button>
                  ))}
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Business Name</label>
                <input className="form-input" value={bizName} onChange={e => setBizName(e.target.value)} placeholder="Your business name" />
              </div>

              <div className="form-group">
                <label className="form-label">Location</label>
                <input className="form-input" value={location} onChange={e => setLocation(e.target.value)} placeholder="City, Country" />
              </div>

              {/* Custom storefront URL slug */}
              <div className="form-group">
                <label className="form-label">
                  🔗 Custom Store URL
                  <span style={{ fontWeight:400, color:'var(--text-muted)', marginLeft:6, fontSize:'.78rem' }}>optional</span>
                </label>
                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <span style={{ color:'var(--text-muted)', fontSize:'.85rem', flexShrink:0 }}>mogarenta.com/</span>
                  <input
                    className="form-input"
                    placeholder="your-store-name"
                    value={bizSlug}
                    onChange={e => { setBizSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '')); setSlugError(''); }}
                    maxLength={30}
                  />
                </div>
                {slugError && <div className="auth-error" style={{ marginTop:6, fontSize:'.78rem' }}>{slugError}</div>}
                {bizSlug.trim().length >= 3 && !slugError && (
                  <div style={{ fontSize:'.76rem', color:'var(--text-muted)', marginTop:4 }}>
                    Customers can find you at: <strong>/{bizSlug.trim()}</strong>
                  </div>
                )}
              </div>

              <div className="form-group">
                <label className="form-label">Bio / Description</label>
                <textarea className="form-input" rows={4} style={{ resize:'vertical', fontFamily:'inherit' }}
                  placeholder="Tell customers about your business…"
                  value={bio} onChange={e => setBio(e.target.value)} maxLength={400} />
                <div style={{ fontSize:'.75rem', color:'var(--text-muted)', textAlign:'right', marginTop:4 }}>{bio.length}/400</div>
              </div>

              <div className="contacts-section">
                <div className="contacts-section-header">
                  <div className="contacts-section-title">Contact Numbers <span style={{ color:'var(--text-muted)', fontWeight:400 }}>({contacts.length}/4)</span></div>
                </div>
                {contacts.map((num, i) => (
                  <div key={i} className="contact-input-row">
                    <input className="form-input" placeholder="+252 XX XXX XXXX" value={num} onChange={e => updateContact(i, e.target.value)} />
                    <button className="contact-remove-btn" onClick={() => removeContact(i)}>✕</button>
                  </div>
                ))}
                {contacts.length < 4 && (
                  <button className="add-contact-btn" onClick={addContact}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    Add contact number
                  </button>
                )}
              </div>

              {/* Hide stock toggle */}
              <div className="form-group">
                <label className="form-label">Visibility Settings</label>
                <button
                  type="button"
                  onClick={() => setHideStock(h => !h)}
                  style={{
                    display:'flex', alignItems:'center', gap:12, width:'100%',
                    background: hideStock ? 'var(--primary-light, #EEF2FF)' : 'var(--surface)',
                    border:`1px solid ${hideStock ? 'var(--primary)' : 'var(--border)'}`,
                    borderRadius:10, padding:'12px 14px', cursor:'pointer', textAlign:'left',
                  }}
                >
                  <span style={{ fontSize:20 }}>{hideStock ? '🔒' : '👁️'}</span>
                  <div>
                    <div style={{ fontWeight:600, fontSize:'.88rem', color:'var(--text)' }}>
                      {hideStock ? 'Stock count hidden from customers' : 'Stock count visible to customers'}
                    </div>
                    <div style={{ fontSize:'.76rem', color:'var(--text-muted)', marginTop:2 }}>
                      {hideStock
                        ? 'Customers see "In stock" instead of exact quantity'
                        : 'Customers can see exact stock numbers on your products'}
                    </div>
                  </div>
                  <div style={{ marginLeft:'auto', flexShrink:0 }}>
                    <div style={{
                      width:38, height:22, borderRadius:11,
                      background: hideStock ? 'var(--primary)' : '#d1d5db',
                      position:'relative', transition:'background .2s',
                    }}>
                      <div style={{
                        position:'absolute', top:3, left: hideStock ? 19 : 3,
                        width:16, height:16, borderRadius:'50%', background:'#fff',
                        transition:'left .2s', boxShadow:'0 1px 3px rgba(0,0,0,.2)',
                      }} />
                    </div>
                  </div>
                </button>
              </div>

              {savedBiz && <div className="auth-success" style={{ marginBottom: 12 }}>✓ Profile saved successfully</div>}
              <button className="btn btn-primary btn-full btn-lg" onClick={handleSaveBiz} disabled={savingBiz}>
                {savingBiz ? 'Saving…' : 'Save Profile'}
              </button>

              {/* Verification request */}
              <div className="verif-section">
                <div className="verif-section-title">🛡️ Business Verification</div>
                {currentSupplier?.verified ? (
                  <div className="verif-status verified">✓ Your business is verified</div>
                ) : verifRequest && verifRequest !== 'none' && (verifRequest as VerifRequest).status === 'pending' ? (
                  <div className="verif-status pending">⏳ Verification request pending review</div>
                ) : verifRequest && verifRequest !== 'none' && (verifRequest as VerifRequest).status === 'rejected' ? (
                  <div>
                    <div className="verif-status rejected">❌ Request rejected{(verifRequest as VerifRequest).message ? `: ${(verifRequest as VerifRequest).message}` : ''}</div>
                    <button className="btn btn-ghost btn-sm" style={{ marginTop:8 }} onClick={handleRequestVerification} disabled={requestingVerif}>
                      Re-apply for Verification
                    </button>
                  </div>
                ) : (
                  <div>
                    <div style={{ fontSize:'.83rem', color:'var(--text-muted)', marginBottom:10 }}>
                      Get a ✓ verified badge on your store. An admin will review your business.
                    </div>
                    <button className="btn btn-secondary btn-full" onClick={handleRequestVerification} disabled={requestingVerif}>
                      {requestingVerif ? 'Sending…' : '🛡️ Request Verification'}
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* ══════════ TAB: COUPONS ══════════ */}
      {bizTab === 'coupons' && (
        <div style={{ padding:'0 16px 100px' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'16px 0 12px' }}>
            <div style={{ fontWeight:700, fontSize:'.95rem' }}>🎟️ Promo Codes ({coupons.length})</div>
            <button className="btn btn-primary btn-sm" onClick={() => setShowCouponForm(v => !v)}>
              {showCouponForm ? 'Cancel' : '+ New Coupon'}
            </button>
          </div>

          {/* New coupon form */}
          {showCouponForm && (
            <div className="coupon-form-card">
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                <div className="form-group">
                  <label className="form-label">Code *</label>
                  <input className="form-input" placeholder="SAVE20" value={newCoupon.code}
                    onChange={e => setNewCoupon(p => ({ ...p, code: e.target.value.toUpperCase() }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Type</label>
                  <select className="form-input" value={newCoupon.type}
                    onChange={e => setNewCoupon(p => ({ ...p, type: e.target.value }))}>
                    <option value="percent">% Percentage</option>
                    <option value="fixed">$ Fixed Amount</option>
                  </select>
                </div>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10 }}>
                <div className="form-group">
                  <label className="form-label">Value *</label>
                  <input className="form-input" type="number" min="0" placeholder={newCoupon.type === 'percent' ? '20' : '5.00'}
                    value={newCoupon.value} onChange={e => setNewCoupon(p => ({ ...p, value: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Min Order ($)</label>
                  <input className="form-input" type="number" min="0" placeholder="0"
                    value={newCoupon.minOrder} onChange={e => setNewCoupon(p => ({ ...p, minOrder: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Max Uses</label>
                  <input className="form-input" type="number" min="1" placeholder="∞"
                    value={newCoupon.maxUses} onChange={e => setNewCoupon(p => ({ ...p, maxUses: e.target.value }))} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Expires At</label>
                <input className="form-input" type="datetime-local"
                  value={newCoupon.expiresAt} onChange={e => setNewCoupon(p => ({ ...p, expiresAt: e.target.value }))} />
              </div>
              <button className="btn btn-primary btn-full" onClick={handleSaveCoupon}
                disabled={savingCoupon || !newCoupon.code || !newCoupon.value}>
                {savingCoupon ? 'Saving…' : 'Create Coupon'}
              </button>
            </div>
          )}

          {/* Coupons list */}
          {!couponsLoaded ? (
            <div style={{ padding:20, textAlign:'center', color:'var(--text-muted)' }}>Loading…</div>
          ) : coupons.length === 0 ? (
            <div className="empty-state" style={{ marginTop:30 }}>
              <div className="empty-icon">🎟️</div>
              <div className="empty-title">No coupons yet</div>
              <div className="empty-sub">Create promo codes to drive sales</div>
            </div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              {coupons.map(c => (
                <div key={c.id} className={`coupon-card${c.active ? '' : ' inactive'}`}>
                  <div className="coupon-card-left">
                    <div className="coupon-code">{c.code}</div>
                    <div className="coupon-details">
                      {c.type === 'percent' ? `${c.value}% off` : `$${c.value} off`}
                      {c.minOrder > 0 && ` · min $${c.minOrder}`}
                      {c.maxUses && ` · ${c.usedCount}/${c.maxUses} used`}
                      {c.expiresAt && ` · expires ${new Date(c.expiresAt).toLocaleDateString()}`}
                    </div>
                  </div>
                  <div style={{ display:'flex', gap:6, flexShrink:0 }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => toggleCouponActive(c)}>
                      {c.active ? '⏸️' : '▶️'}
                    </button>
                    <button className="btn btn-ghost btn-sm" style={{ color:'var(--danger)' }}
                      onClick={() => deleteCoupon(c.id)}>🗑️</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ══════════ TAB: ANALYTICS ══════════ */}
      {bizTab === 'analytics' && (
        <div style={{ padding: '16px 16px 100px' }}>
          <div className="dash-kpi-grid" style={{ marginBottom: 20 }}>
            <div className="dash-kpi-card">
              <div className="dash-kpi-icon">📦</div>
              <div className="dash-kpi-value">{bizProducts.length + supplierProducts.length}</div>
              <div className="dash-kpi-label">Total Products</div>
            </div>
            <div className="dash-kpi-card">
              <div className="dash-kpi-icon">✅</div>
              <div className="dash-kpi-value">{bizProducts.filter(b => b.isActive).length}</div>
              <div className="dash-kpi-label">Active Listings</div>
            </div>
            <div className="dash-kpi-card">
              <div className="dash-kpi-icon">⭐</div>
              <div className="dash-kpi-value">{currentSupplier?.rating?.toFixed(1) ?? '–'}</div>
              <div className="dash-kpi-label">Avg Rating</div>
            </div>
            <div className="dash-kpi-card">
              <div className="dash-kpi-icon">💬</div>
              <div className="dash-kpi-value">{currentSupplier?.reviews ?? 0}</div>
              <div className="dash-kpi-label">Reviews</div>
            </div>
          </div>
          <div style={{ textAlign:'center', color:'var(--text-muted)', padding:'40px 0', fontSize:'.88rem' }}>
            <div style={{ fontSize:'2rem', marginBottom:8 }}>📊</div>
            Full sales analytics available on the Dashboard
            <br /><br />
            <button className="btn btn-primary" onClick={() => router.push('/dashboard')}>Open Dashboard →</button>
          </div>
        </div>
      )}

      {/* ── Scanner Modal ─────────────────────────────── */}
      {showScanner && (
        <Suspense fallback={null}>
          <BarcodeScanner
            onDetected={code => { setShowScanner(false); handleBarcodeDetected(code); }}
            onClose={() => setShowScanner(false)}
          />
        </Suspense>
      )}

      {/* ── Claim Modal ───────────────────────────────── */}
      {claimProduct && (
        <div className="modal-overlay" onClick={() => setClaimProduct(null)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span>🛒 Add to Your Store</span>
              <button className="modal-close" onClick={() => setClaimProduct(null)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="claim-product-card">
                <div className="claim-product-icon">{claimProduct.icon}</div>
                <div className="claim-product-info">
                  <div className="claim-product-name">{claimProduct.name}</div>
                  {claimProduct.brand && <div className="claim-product-brand">{claimProduct.brand}</div>}
                  <div className="claim-product-meta">
                    {CATEGORIES.find(c => c.id === claimProduct.category)?.icon}{' '}
                    {CATEGORIES.find(c => c.id === claimProduct.category)?.name}
                  </div>
                  {claimProduct.barcode && <div className="claim-product-barcode">🔢 {claimProduct.barcode}</div>}
                  {claimProduct.tags && claimProduct.tags.length > 0 && (
                    <div className="claim-tags-row">
                      {claimProduct.tags.slice(0, 4).map(t => <span key={t} className="claim-tag">{t}</span>)}
                    </div>
                  )}
                </div>
              </div>
              <div style={{ fontSize:'.8rem', color:'var(--text-muted)', margin:'8px 0' }}>
                Catalog price: <strong>${claimProduct.price.toFixed(2)}</strong>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10 }}>
                <div className="form-group">
                  <label className="form-label">Your Price ($) *</label>
                  <input className="form-input" type="number" min="0" step="0.01" value={claimPrice}
                    onChange={e => setClaimPrice(e.target.value)} autoFocus />
                </div>
                <div className="form-group">
                  <label className="form-label">Stock Qty</label>
                  <input className="form-input" type="number" min="0" value={claimStock}
                    onChange={e => setClaimStock(e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label" title="Minimum Order Quantity">MOQ</label>
                  <input className="form-input" type="number" min="1" value={claimMoq}
                    onChange={e => setClaimMoq(e.target.value)} placeholder="1" />
                </div>
              </div>
              <button className="btn btn-primary btn-full btn-lg" onClick={handleClaim} disabled={savingClaim} style={{ marginTop:8 }}>
                {savingClaim ? <><span className="btn-spinner" /> Adding…</> : '✓ Add to My Store'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Product Form Modal ─────────────────────────── */}
      {showForm && (
        <div className="modal-overlay" onClick={() => !savingProd && setShowForm(false)}>
          <div className="modal-box" style={{ maxHeight:'90vh', overflowY:'auto' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span>{editingProd ? '✏️ Edit Product' : '➕ New Product'}</span>
              <button className="modal-close" onClick={() => setShowForm(false)}>✕</button>
            </div>
            <div className="modal-body">
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

              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                <div className="form-group">
                  <label className="form-label">Price ($) *</label>
                  <input className="form-input" type="number" min="0" step="0.01" value={form.price} onChange={e => pf('price', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Original Price ($)</label>
                  <input className="form-input" type="number" min="0" step="0.01" value={form.originalPrice} onChange={e => pf('originalPrice', e.target.value)} />
                </div>
              </div>

              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                <div className="form-group">
                  <label className="form-label">Category *</label>
                  <select className="form-input" value={form.category} onChange={e => { pf('category', e.target.value); pf('subCategory', ''); }}>
                    {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Sub-Category</label>
                  <select className="form-input" value={form.subCategory} onChange={e => pf('subCategory', e.target.value)}>
                    <option value="">— Select —</option>
                    {(SUBCATEGORIES[form.category] ?? []).map(s => (
                      <option key={s.id} value={s.id}>{s.icon} {s.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                <div className="form-group">
                  <label className="form-label">Stock Qty</label>
                  <input className="form-input" type="number" min="0" value={form.stock} onChange={e => pf('stock', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">SKU</label>
                  <input className="form-input" placeholder="MY-PRD-001" value={form.sku} onChange={e => pf('sku', e.target.value)} />
                </div>
              </div>

              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                <div className="form-group">
                  <label className="form-label">Brand</label>
                  <input className="form-input" placeholder="Apple, Samsung…" value={form.brand} onChange={e => pf('brand', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Barcode (EAN-13)</label>
                  <input className="form-input" placeholder="1234567890123" inputMode="numeric" maxLength={14} value={form.barcode} onChange={e => pf('barcode', e.target.value.replace(/\D/g, ''))} />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Feature Tags <span style={{ color:'var(--text-muted)', fontWeight:400 }}>(comma-separated)</span></label>
                <input className="form-input" placeholder="Wireless, USB-C, 5G, Waterproof" value={form.tags} onChange={e => pf('tags', e.target.value)} />
              </div>

              <div className="form-group">
                <label className="form-label">Description</label>
                <textarea className="form-input" rows={3} style={{ resize:'vertical', fontFamily:'inherit' }}
                  placeholder="Product details…" value={form.description} onChange={e => pf('description', e.target.value)} maxLength={500} />
              </div>

              {/* ── Product Photos ─────────────────────── */}
              <div className="form-group">
                <label className="form-label">
                  Product Photos
                  <span style={{ fontWeight:400, color:'var(--text-muted)', marginLeft:6 }}>
                    (up to 8 · first is cover)
                  </span>
                </label>
                <Suspense fallback={
                  <div style={{ height:60, display:'flex', alignItems:'center', color:'var(--text-muted)', fontSize:'.85rem' }}>
                    Loading uploader…
                  </div>
                }>
                  <ProductImageUpload
                    urls={form.imageUrls}
                    onChange={urls => pf('imageUrls', urls)}
                    maxPhotos={8}
                  />
                </Suspense>
              </div>

              {/* ── AI Generate button ────────────────────── */}
              {form.imageUrls.length > 0 && (
                <AiGenerateButton
                  imageUrl={form.imageUrls[0]}
                  onResult={result => {
                    if (result.name)        pf('name',        result.name);
                    if (result.description) pf('description', result.description);
                    if (result.brand)       pf('brand',       result.brand);
                    if (result.category)    pf('category',    result.category);
                    if (result.subCategory) pf('subCategory', result.subCategory);
                    if (result.tags?.length) pf('tags', result.tags.join(', '));
                  }}
                />
              )}

              <button className="btn btn-primary btn-full btn-lg" onClick={handleSaveProduct} disabled={savingProd}>
                {savingProd ? 'Saving…' : editingProd ? 'Update Product' : 'Add Product'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
