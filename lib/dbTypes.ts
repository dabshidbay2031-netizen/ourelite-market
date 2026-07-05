/**
 * dbTypes.ts — TypeScript types that mirror supabase/schema_v3.sql exactly.
 *
 * Two layers, kept deliberately separate:
 *
 *   1. `DB.*`  — RAW ROW types: the snake_case shape Supabase returns from
 *                `.select('*')`. Use these inside API route handlers to type
 *                the rows you read before mapping them.
 *
 *   2. The exported camelCase interfaces — API DTOs: the shape your route
 *                handlers return to the client (what `mapX()` produces).
 *                The front-end consumes these.
 *
 * Column-for-column with schema_v3. If you change the SQL, change this file.
 * (Several DTOs already live in lib/types.ts — Product, Supplier, Order,
 * Customer, Conversation, Message, PosSession, PaymentSplit. This file adds
 * the ones that were missing and the raw-row layer for every table.)
 */

/* ════════════════════════════════════════════════════════════════
   LAYER 1 — RAW DB ROW TYPES  (snake_case, as Supabase returns them)
   ════════════════════════════════════════════════════════════════ */

export namespace DB {
  export interface Profile {
    id:         string;
    full_name:  string;
    phone:      string;
    avatar:     string;
    avatar_url: string | null;
    bio:        string;
    verified:   boolean;
    created_at: string;
    updated_at: string;
  }

  export interface Supplier {
    id:                    number;
    name:                  string;
    rating:                number;
    reviews:               number;
    location:              string;
    min_order:             number;
    categories:            string[];
    icon:                  string;
    description:           string;
    product_ids:           number[];
    discount:              number;
    delivery_days:         string;
    verified:              boolean;
    badge:                 string;
    bio:                   string | null;
    contact_numbers:       string[];
    auth_user_id:          string | null;
    slug:                  string | null;
    latitude:              number | null;
    longitude:             number | null;
    hide_stock:            boolean;
    account_type:          'business' | 'supplier';
    approval_status:       'trial' | 'pending' | 'approved' | 'rejected';
    trial_started_at:      string;
    approval_requested_at: string | null;
    created_at:            string;
    updated_at:            string;
  }

  export interface Admin {
    id:         number;
    user_id:    string;
    role:       'admin' | 'semi_admin';
    name:       string;
    email:      string;
    created_at: string;
  }

  export interface Cashier {
    id:            string;   // uuid
    business_id:   string;
    name:          string;
    phone:         string;
    password_hash: string;   // never sent to the client
    privileges:    string[];
    is_active:     boolean;
    last_login_at: string | null;
    created_at:    string;
  }

  export interface Product {
    id:             number;
    name:           string;
    price:          number;
    original_price: number;
    cost:           number;
    category:       string;
    sub_category:   string | null;
    stock:          number;
    sku:            string;
    supplier_id:    number | null;
    rating:         number;
    reviews:        number;
    sold:           number;
    description:    string;
    barcode:        string | null;
    tags:           string[];
    brand:          string | null;
    image_url:      string | null;
    image_urls:     string[];
    price_tiers:    PriceTierRow[];
    is_b2b:         boolean;
    moq:            number;
    tax_mode:       'none' | 'included' | 'excluded';
    created_at:     string;
    updated_at:     string;
  }

  export interface PriceTierRow {
    minQty: number;
    maxQty: number | null;
    price:  number;
  }

  export interface BusinessProduct {
    id:           number;
    supplier_id:  number;
    product_id:   number;
    custom_price: number;
    stock_qty:    number;
    is_active:    boolean;
    moq:          number;
    created_at:   string;
    products?:    Product;   // populated by .select('*, products(*)')
  }

  export interface Review {
    id:          number;
    product_id:  number;
    user_id:     string;
    user_name:   string;
    user_avatar: string | null;
    rating:      number;
    comment:     string | null;
    created_at:  string;
  }

  export interface PosSession {
    id:              string;   // uuid
    opened_by:       string;
    business_id:     string | null;
    cashier_id:      string | null;
    cashier_name:    string;
    opened_at:       string;
    closed_at:       string | null;
    opening_float:   number;
    closing_counted: number | null;
    expected_cash:   number | null;
    discrepancy:     number | null;
    status:          'open' | 'closed';
    notes:           string | null;
  }

  export interface OrderItemRow { id: number; qty: number; }

  export interface Order {
    id:             string;
    customer_name:  string;
    customer_phone: string;
    user_id:        string | null;
    items:          OrderItemRow[];   // JSONB
    subtotal:       number;
    discount:       number;
    total:          number;
    payment_method: string;
    status:         OrderStatus;
    notes:          string | null;
    session_id:     string | null;
    cashier_id:     string | null;
    cashier_name:   string | null;
    created_at:     string;
  }

  export interface OrderItem {
    id:          number;   // bigint identity
    order_id:    string;
    product_id:  number;
    supplier_id: number | null;
    qty:         number;
    unit_price:  number;
    line_total:  number;
    created_at:  string;
  }

  export interface Coupon {
    id:          number;
    code:        string;
    type:        'percent' | 'fixed';
    value:       number;
    min_order:   number;
    max_uses:    number | null;
    used_count:  number;
    expires_at:  string | null;
    supplier_id: number | null;
    active:      boolean;
    created_at:  string;
  }

  export interface Customer {
    id:         number;   // bigint identity
    name:       string;
    phone:      string;
    email:      string;
    address:    string;
    notes:      string;
    created_at: string;
  }

  export interface Conversation {
    id:         string;   // uuid
    user_id_1:  string;
    user_id_2:  string;
    created_at: string;
    updated_at: string;
  }

  export interface Message {
    id:              string;   // uuid
    conversation_id: string;
    sender_id:       string;
    content:         string | null;
    image_url:       string | null;
    message_type:    'text' | 'image';
    read_at:         string | null;
    created_at:      string;
  }

  export interface Notification {
    id:         number;
    user_id:    string | null;
    type:       string;
    title:      string;
    message:    string;
    time_ago:   string;
    read:       boolean;
    icon:       string;
    created_at: string;
  }

  export interface Wishlist {
    user_id:    string;
    product_id: number;
    created_at: string;
  }

  export interface Address {
    id:         number;
    user_id:    string;
    label:      string;
    latitude:   number | null;
    longitude:  number | null;
    notes:      string;
    created_at: string;
  }

  export interface Referral {
    id:          number;
    code:        string;
    referrer_id: string;
    referred_id: string | null;
    credit:      number;
    redeemed:    boolean;
    created_at:  string;
  }

  export interface VerificationRequest {
    supplier_id: number;
    status:      'pending' | 'approved' | 'rejected';
    message:     string | null;
    reviewed_at: string | null;
    created_at:  string;
  }
}

/* ════════════════════════════════════════════════════════════════
   Shared enums / unions  (single source of truth)
   ════════════════════════════════════════════════════════════════ */

export type OrderStatus =
  | 'pending' | 'processing' | 'shipped' | 'completed'
  | 'cancelled' | 'refunded' | 'bulk_pending' | 'deleted';

/** Statuses excluded from every revenue figure (see lib/revenue.ts). */
export const NON_REVENUE_STATUSES: readonly OrderStatus[] =
  ['deleted', 'cancelled', 'refunded'] as const;

export type AccountType     = 'business' | 'supplier';
export type ApprovalStatus  = 'trial' | 'pending' | 'approved' | 'rejected';
export type CouponType      = 'percent' | 'fixed';
export type MessageType     = 'text' | 'image';
export type SessionStatus   = 'open' | 'closed';
export type AdminRole       = 'admin' | 'semi_admin';

/* ════════════════════════════════════════════════════════════════
   LAYER 2 — API DTOs  (camelCase, what routes return to the client)
   Only the ones NOT already defined in lib/types.ts live here.
   ════════════════════════════════════════════════════════════════ */

/** GET/POST /api/cashiers — password_hash is never included. */
export interface Cashier {
  id:          string;
  businessId:  string;
  name:        string;
  phone:       string;
  privileges:  string[];
  isActive:    boolean;
  lastLoginAt: string | null;
  createdAt:   string;
}

/** Returned by POST /api/cashiers/login — the cashier's localStorage session. */
export interface CashierLoginResult {
  id:         string;
  name:       string;
  phone:      string;
  businessId: string;
  privileges: string[];
  loginAt:    string;
}

/** GET/POST /api/coupons */
export interface Coupon {
  id:         number;
  code:       string;
  type:       CouponType;
  value:      number;
  minOrder:   number;
  maxUses:    number | null;
  usedCount:  number;
  expiresAt:  string | null;
  supplierId: number | null;
  active:     boolean;
  createdAt:  string;
}

/** GET/POST /api/reviews */
export interface Review {
  id:         number;
  productId:  number;
  userId:     string;
  rating:     number;
  comment:    string | null;
  userName:   string;
  userAvatar: string;
  createdAt:  string;
}

/** GET/POST /api/addresses */
export interface Address {
  id:        number;
  userId:    string;
  label:     string;
  latitude:  number | null;
  longitude: number | null;
  notes:     string;
  createdAt: string;
}

/** Row of the referrals table (the API returns it largely as-is). */
export interface Referral {
  id:          number;
  code:        string;
  referrer_id: string;
  referred_id: string | null;
  credit:      number;
  redeemed:    boolean;
  created_at:  string;
}

/** Platform admin (GET /api/admin). */
export interface Admin {
  id:        number;
  userId:    string;
  role:      AdminRole;
  name:      string;
  email:     string;
  createdAt: string;
}

/** Supplier-side verification request (GET/POST/PATCH /api/verification-requests). */
export interface VerificationRequest {
  supplierId: number;
  status:     'pending' | 'approved' | 'rejected';
  message:    string | null;
  reviewedAt: string | null;
  createdAt:  string;
}

/** A normalized order line (order_items table) — for analytics/reporting. */
export interface OrderLine {
  id:         number;
  orderId:    string;
  productId:  number;
  supplierId: number | null;
  qty:        number;
  unitPrice:  number;
  lineTotal:  number;
  createdAt:  string;
}

/* ════════════════════════════════════════════════════════════════
   RPC parameter shapes  (supabase.rpc('name', ...args))
   ════════════════════════════════════════════════════════════════ */

export interface PlaceOrderArgs {
  p_customer_name:  string;
  p_customer_phone: string;
  p_user_id:        string | null;
  p_items:          DB.OrderItemRow[];
  p_payment_method?: string;
  p_coupon_code?:    string | null;
  p_notes?:          string | null;
  p_session_id?:     string | null;
  p_cashier_id?:     string | null;
  p_cashier_name?:   string | null;
}

export interface AdjustStockArgs {
  p_product_id: number;
  p_delta:      number;
}

export interface ClosePosSessionArgs {
  p_session_id: string;
  p_counted:    number;
  p_notes?:     string | null;
}
