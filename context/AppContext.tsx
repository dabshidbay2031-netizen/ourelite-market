'use client';

import React, { createContext, useContext, useReducer, useCallback, useEffect, useRef } from 'react';
import type { CartItem, Notification, Order, Product, Supplier, Toast, PaymentMethod, PaymentState } from '@/lib/types';

interface InventoryItem { id: number; stock: number; }

/* Cache keys — data is stale-while-revalidated on every mount */
const CACHE = {
  products:      'mg_c_products',
  suppliers:     'mg_c_suppliers',
  notifications: 'mg_c_notifications',
};

function readCache<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch { return null; }
}
function writeCache(key: string, data: unknown) {
  try { localStorage.setItem(key, JSON.stringify(data)); } catch { /* storage full */ }
}

interface AppState {
  products:      Product[];
  suppliers:     Supplier[];
  orders:        Order[];
  cart:          CartItem[];
  wishlist:      number[];
  inventory:     InventoryItem[];
  notifications: Notification[];
  paymentMethod: PaymentMethod;
  paymentState:  PaymentState;
  discount:      number;
  toasts:        Toast[];
  cartOpen:      boolean;
  loading:       boolean;
}

type Action =
  | { type: 'SET_PRODUCTS';      payload: Product[] }
  | { type: 'SET_SUPPLIERS';     payload: Supplier[] }
  | { type: 'SET_ORDERS';        payload: Order[] }
  | { type: 'SET_CART';          payload: CartItem[] }
  | { type: 'SET_WISHLIST';      payload: number[] }
  | { type: 'SET_INVENTORY';     payload: InventoryItem[] }
  | { type: 'SET_NOTIFICATIONS'; payload: Notification[] }
  | { type: 'SET_PAYMENT_METHOD';payload: PaymentMethod }
  | { type: 'SET_PAYMENT_STATE'; payload: PaymentState }
  | { type: 'SET_DISCOUNT';      payload: number }
  | { type: 'ADD_TOAST';         payload: Toast }
  | { type: 'REMOVE_TOAST';      payload: string }
  | { type: 'SET_CART_OPEN';     payload: boolean }
  | { type: 'SET_LOADING';       payload: boolean };

const initial: AppState = {
  products: [], suppliers: [], orders: [],
  cart: [], wishlist: [], inventory: [],
  notifications: [],
  paymentMethod: 'waafi', paymentState: 'idle',
  discount: 0, toasts: [],
  cartOpen: false,
  loading: true,
};

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'SET_PRODUCTS':      return { ...state, products:      action.payload };
    case 'SET_SUPPLIERS':     return { ...state, suppliers:     action.payload };
    case 'SET_ORDERS':        return { ...state, orders:        action.payload };
    case 'SET_CART':          return { ...state, cart:          action.payload };
    case 'SET_WISHLIST':      return { ...state, wishlist:      action.payload };
    case 'SET_INVENTORY':     return { ...state, inventory:     action.payload };
    case 'SET_NOTIFICATIONS': return { ...state, notifications: action.payload };
    case 'SET_PAYMENT_METHOD':return { ...state, paymentMethod: action.payload };
    case 'SET_PAYMENT_STATE': return { ...state, paymentState:  action.payload };
    case 'SET_DISCOUNT':      return { ...state, discount:      action.payload };
    case 'ADD_TOAST':         return { ...state, toasts: [...state.toasts, action.payload] };
    case 'REMOVE_TOAST':      return { ...state, toasts: state.toasts.filter(t => t.id !== action.payload) };
    case 'SET_CART_OPEN':     return { ...state, cartOpen:      action.payload };
    case 'SET_LOADING':       return { ...state, loading:       action.payload };
    default: return state;
  }
}

interface AppContextValue {
  state: AppState;
  addToCart:         (productId: number, qty?: number) => void;
  removeFromCart:    (productId: number) => void;
  changeQty:         (productId: number, delta: number) => void;
  clearCart:         () => void;
  cartCount:         () => number;
  cartTotal:         () => number;
  setCartOpen:       (open: boolean) => void;
  toggleWishlist:    (productId: number) => void;
  getStock:          (productId: number) => number;
  adjustStock:       (productId: number, delta: number) => void;
  markAllRead:       () => void;
  clearNotifications:() => void;
  unreadCount:       () => number;
  setPaymentMethod:  (m: PaymentMethod) => void;
  setPaymentState:   (s: PaymentState) => void;
  setDiscount:       (d: number) => void;
  toast:             (message: string, type?: Toast['type']) => void;
  reloadProducts:      () => Promise<void>;
  reloadSuppliers:     () => Promise<void>;
  loadWishlistFromDB:  (userId: string) => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initial);
  const toastTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  /* ── Load data: serve cache instantly, fetch fresh in background ── */
  useEffect(() => {
    // 1. Immediately serve from cache (makes reload feel instant)
    const cachedProducts      = readCache<Product[]>     (CACHE.products);
    const cachedSuppliers     = readCache<Supplier[]>    (CACHE.suppliers);
    const cachedNotifications = readCache<Notification[]>(CACHE.notifications);

    if (cachedProducts) {
      dispatch({ type: 'SET_PRODUCTS',   payload: cachedProducts });
      dispatch({ type: 'SET_INVENTORY',  payload: cachedProducts.map(p => ({ id: p.id, stock: p.stock })) });
      dispatch({ type: 'SET_LOADING',    payload: false });  // show content immediately
    }
    if (cachedSuppliers)     dispatch({ type: 'SET_SUPPLIERS',     payload: cachedSuppliers });
    if (cachedNotifications) dispatch({ type: 'SET_NOTIFICATIONS', payload: cachedNotifications });

    // 2. Fetch fresh data in background (stale-while-revalidate)
    async function loadFresh() {
      try {
        const [pRes, sRes, nRes] = await Promise.all([
          fetch('/api/products'),
          fetch('/api/suppliers'),
          fetch('/api/notifications'),
        ]);

        const [products, suppliers, notifications] = await Promise.all([
          pRes.json(), sRes.json(), nRes.json(),
        ]);

        if (Array.isArray(products) && products.length) {
          dispatch({ type: 'SET_PRODUCTS',   payload: products });
          dispatch({ type: 'SET_INVENTORY',  payload: products.map((p: Product) => ({ id: p.id, stock: p.stock })) });
          writeCache(CACHE.products, products);
        }
        if (Array.isArray(suppliers) && suppliers.length) {
          dispatch({ type: 'SET_SUPPLIERS',  payload: suppliers });
          writeCache(CACHE.suppliers, suppliers);
        }
        if (Array.isArray(notifications)) {
          dispatch({ type: 'SET_NOTIFICATIONS', payload: notifications });
          writeCache(CACHE.notifications, notifications);
        }
      } catch (err) {
        console.error('[AppContext] data fetch failed:', err);
      } finally {
        dispatch({ type: 'SET_LOADING', payload: false });
      }
    }
    loadFresh();
  }, []);

  /* ── Persist cart + wishlist ─────────────────────────────── */
  useEffect(() => {
    const cart     = readCache<CartItem[]>('mg_cart');
    const wishlist = readCache<number[]>  ('mg_wishlist');
    if (cart)     dispatch({ type: 'SET_CART',     payload: cart });
    if (wishlist) dispatch({ type: 'SET_WISHLIST', payload: wishlist });
  }, []);
  useEffect(() => { writeCache('mg_cart',     state.cart);     }, [state.cart]);
  useEffect(() => { writeCache('mg_wishlist', state.wishlist); }, [state.wishlist]);

  /* ── Toast ───────────────────────────────────────────────── */
  const toast = useCallback((message: string, type: Toast['type'] = 'default') => {
    const id = `${Date.now()}-${Math.random()}`;
    dispatch({ type: 'ADD_TOAST', payload: { id, message, type } });
    const timer = setTimeout(() => {
      dispatch({ type: 'REMOVE_TOAST', payload: id });
      toastTimers.current.delete(id);
    }, 3000);
    toastTimers.current.set(id, timer);
  }, []);

  /* ── Helpers ─────────────────────────────────────────────── */
  const getStock  = useCallback((id: number) => state.inventory.find(i => i.id === id)?.stock ?? 0, [state.inventory]);
  const cartCount = useCallback(() => state.cart.reduce((n, i) => n + i.qty, 0), [state.cart]);
  const cartTotal = useCallback(() =>
    state.cart.reduce((n, item) => {
      const p = state.products.find(x => x.id === item.id);
      return n + (p ? p.price * item.qty : 0);
    }, 0),
  [state.cart, state.products]);

  /* ── Cart ────────────────────────────────────────────────── */
  const addToCart = useCallback((productId: number, qty = 1) => {
    const stock    = state.inventory.find(i => i.id === productId)?.stock ?? 0;
    const inCart   = state.cart.find(i => i.id === productId);
    const inCartQty= inCart?.qty ?? 0;
    if (inCartQty + qty > stock) { toast('Not enough stock available', 'error'); return; }
    const updated  = inCart
      ? state.cart.map(i => i.id === productId ? { ...i, qty: i.qty + qty } : i)
      : [...state.cart, { id: productId, qty }];
    dispatch({ type: 'SET_CART', payload: updated });
    const p = state.products.find(x => x.id === productId);
    toast(`${p?.name} added to cart ✓`, 'success');
  }, [state.cart, state.inventory, state.products, toast]);

  const removeFromCart = useCallback((id: number) =>
    dispatch({ type: 'SET_CART', payload: state.cart.filter(i => i.id !== id) }),
  [state.cart]);

  const changeQty = useCallback((productId: number, delta: number) => {
    const updated = state.cart.reduce<CartItem[]>((acc, item) => {
      if (item.id !== productId) return [...acc, item];
      const newQty = item.qty + delta;
      if (newQty <= 0) return acc;
      const stock  = state.inventory.find(i => i.id === productId)?.stock ?? 0;
      return [...acc, { ...item, qty: Math.min(newQty, stock) }];
    }, []);
    dispatch({ type: 'SET_CART', payload: updated });
  }, [state.cart, state.inventory]);

  const clearCart    = useCallback(() => dispatch({ type: 'SET_CART', payload: [] }), []);
  const setCartOpen  = useCallback((open: boolean) => dispatch({ type: 'SET_CART_OPEN', payload: open }), []);

  /* ── Wishlist (localStorage + optional DB sync) ─────────────── */
  const toggleWishlist = useCallback((id: number) => {
    const updated = state.wishlist.includes(id)
      ? state.wishlist.filter(x => x !== id)
      : [...state.wishlist, id];
    dispatch({ type: 'SET_WISHLIST', payload: updated });
  }, [state.wishlist]);

  /** Load wishlist from DB (call after user logs in) */
  const loadWishlistFromDB = useCallback(async (userId: string) => {
    try {
      const res = await fetch(`/api/wishlist?userId=${userId}`);
      const ids = await res.json();
      if (Array.isArray(ids) && ids.length > 0) {
        // Merge DB wishlist with local wishlist
        const merged = Array.from(new Set([...state.wishlist, ...ids]));
        dispatch({ type: 'SET_WISHLIST', payload: merged });
        writeCache('mg_wishlist', merged);
      }
    } catch { /* ignore — local wishlist is fine */ }
  }, [state.wishlist]);

  /* ── Inventory ───────────────────────────────────────────── */
  const adjustStock = useCallback((productId: number, delta: number) => {
    const updated = state.inventory.map(i =>
      i.id === productId ? { ...i, stock: Math.max(0, i.stock + delta) } : i
    );
    dispatch({ type: 'SET_INVENTORY', payload: updated });
    const newStock = updated.find(i => i.id === productId)?.stock ?? 0;
    fetch(`/api/inventory/${productId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stock: newStock }),
    }).catch(() => {});
  }, [state.inventory]);

  /* ── Notifications ───────────────────────────────────────── */
  const unreadCount       = useCallback(() => state.notifications.filter(n => !n.read).length, [state.notifications]);
  const clearNotifications= useCallback(() => dispatch({ type: 'SET_NOTIFICATIONS', payload: [] }), []);
  const markAllRead       = useCallback(() => {
    const updated = state.notifications.map(n => ({ ...n, read: true }));
    dispatch({ type: 'SET_NOTIFICATIONS', payload: updated });
    const ids = state.notifications.filter(n => !n.read).map(n => n.id);
    if (ids.length > 0) {
      fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, read: true }),
      }).catch(() => {});
    }
  }, [state.notifications]);

  /* ── Data reload ─────────────────────────────────────────── */
  const reloadProducts = useCallback(async () => {
    try {
      const res      = await fetch('/api/products');
      const products = await res.json();
      if (Array.isArray(products) && products.length) {
        dispatch({ type: 'SET_PRODUCTS',  payload: products });
        dispatch({ type: 'SET_INVENTORY', payload: products.map((p: Product) => ({ id: p.id, stock: p.stock })) });
        writeCache(CACHE.products, products);
      }
    } catch { /* ignore */ }
  }, []);

  const reloadSuppliers = useCallback(async () => {
    try {
      const res       = await fetch('/api/suppliers');
      const suppliers = await res.json();
      if (Array.isArray(suppliers) && suppliers.length) {
        dispatch({ type: 'SET_SUPPLIERS', payload: suppliers });
        writeCache(CACHE.suppliers, suppliers);
      }
    } catch { /* ignore */ }
  }, []);

  /* ── Payment ─────────────────────────────────────────────── */
  const setPaymentMethod = useCallback((m: PaymentMethod) => dispatch({ type: 'SET_PAYMENT_METHOD', payload: m }), []);
  const setPaymentState  = useCallback((s: PaymentState)  => dispatch({ type: 'SET_PAYMENT_STATE',  payload: s }), []);
  const setDiscount      = useCallback((d: number)        => dispatch({ type: 'SET_DISCOUNT',        payload: d }), []);

  return (
    <AppContext.Provider value={{
      state,
      addToCart, removeFromCart, changeQty, clearCart, cartCount, cartTotal, setCartOpen,
      toggleWishlist,
      getStock, adjustStock,
      markAllRead, clearNotifications, unreadCount,
      setPaymentMethod, setPaymentState, setDiscount,
      toast,
      reloadProducts, reloadSuppliers, loadWishlistFromDB,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}
