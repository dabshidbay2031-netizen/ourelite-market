export interface Category {
  id:    string;
  name:  string;
  icon:  string;
  color: string;
}

export interface SubCategory {
  id:   string;
  name: string;
  icon: string;
}

export interface PriceTier {
  minQty: number;
  maxQty: number | null;
  price:  number;
}

export interface Product {
  id:            number;
  name:          string;
  price:         number;
  originalPrice: number;
  cost?:         number; // what it costs to acquire/produce — drives profit on the dashboard
  category:      string;
  subCategory?:  string;
  stock:         number;
  sku:           string;
  supplierId:    number | null;
  rating:        number;
  reviews:       number;
  sold:          number;
  description:   string;
  barcode?:      string;        // EAN-13 / UPC-A / EAN-8
  tags?:         string[];      // feature tags e.g. ["Wireless","USB-C"]
  brand?:        string;
  imageUrl?:     string | null; // legacy single photo (kept for backwards compat)
  imageUrls?:    string[];      // multiple product photos (preferred)
  priceTiers?:   PriceTier[];   // wholesale tier pricing
  isB2b?:        boolean;       // only visible to business/supplier accounts
  moq?:          number;        // minimum order quantity
  taxMode?:      'none' | 'included' | 'excluded'; // VAT handling (5%)
}

/** A product that a specific business has claimed from the global catalog */
export interface BusinessProduct {
  id:          number;
  supplierId:  number;
  productId:   number;
  product?:    Product; // populated on GET
  customPrice: number;
  stockQty:    number;
  moq:         number;  // minimum order quantity
  isActive:    boolean;
  createdAt:   string;
}

export interface Supplier {
  id:             number;
  name:           string;
  rating:         number;
  reviews:        number;
  location:       string;
  minOrder:       number;
  categories:     string[];
  icon:           string;
  description:    string;
  productIds:     number[];
  discount:       number;
  deliveryDays:   string;
  verified:       boolean;
  badge:          string;
  bio?:           string;
  contactNumbers?:string[];
  authUserId?:    string;
  slug?:          string | null;  // storefront URL slug (#/:slug)
  latitude?:      number | null;  // store GPS location (for map + directions)
  longitude?:     number | null;
  hideStock?:     boolean;  // hide stock count from public customers
  onlineOnly?:    boolean;  // internet-only store — no physical shopfront, no pickup
  accountType?:   'business' | 'supplier' | 'agent';
  /* Trial + approval lifecycle (absent on pre-migration schemas = approved) */
  approvalStatus?:      'trial' | 'pending' | 'approved' | 'rejected' | null;
  trialStartedAt?:      string | null;
  approvalRequestedAt?: string | null;
  /* Subscription billing (absent on pre-migration schemas) */
  billingEnabled?:         boolean;   // false = billing columns not deployed yet
  subscriptionPaidAt?:     string | null;
  subscriptionRefundedAt?: string | null;
  subscriptionPlan?:       string | null;
  subscriptionAmount?:     number | null;
}

export interface CartItem {
  id:  number;
  qty: number;
}

export interface Order {
  id:            string;
  customerName:  string;
  customerPhone: string;
  items:         CartItem[];
  subtotal:      number;
  discount:      number;
  total:         number;
  paymentMethod: string;
  status:        string;
  /** The store that SOLD this order (v3.7 attribution); null on legacy orders. */
  supplierId?:   number | null;
  createdAt:     string;
}

export interface Notification {
  id:      number;
  type:    string;
  title:   string;
  message: string;
  time:    string;
  read:    boolean;
  icon:    string;
}

export interface Toast {
  id:      string;
  message: string;
  type:    'default' | 'success' | 'error' | 'warning';
}

export interface UserProfile {
  id:        string;
  fullName:  string;
  phone:     string;
  avatar:    string;
  avatarUrl: string | null;
  bio:       string;
  verified:  boolean;
  createdAt: string;
}

export type AccountType   = 'user' | 'business' | 'supplier' | 'agent';
export type PaymentMethod = 'waafi' | 'cash' | 'card' | 'sifalo';

/** Sifalo Pay sub-gateways (which wallet the customer pays from). */
export type SifaloGateway = 'waafi' | 'edahab' | 'pbwallet';
export type PaymentState  = 'idle'  | 'pending' | 'success' | 'error';

export interface PaymentSplit {
  method: PaymentMethod;
  amount: string;
}

export interface PosSession {
  id:             string;
  openedBy:       string;
  cashierName:    string;
  openedAt:       string;
  closedAt:       string | null;
  openingFloat:   number;
  closingCounted: number | null;
  expectedCash:   number | null;
  discrepancy:    number | null;
  status:         'open' | 'closed';
  notes:          string | null;
  totalOrders?:   number;
  totalRevenue?:  number;
  cashRevenue?:   number;
}

/** Minimal user info carried inside chat responses */
export interface ChatUser {
  id:             string;
  name:           string;
  avatar:         string;   // emoji or URL
  type:           'user' | 'business';
  verified:       boolean;
  bio?:           string;
  location?:      string;
  categories?:    string[];
  contactNumbers?:string[];
}

export interface Conversation {
  id:           string;   // UUID
  userId1:      string;
  userId2:      string;
  otherUser?:   ChatUser; // populated on GET
  lastMessage?: Message;
  unreadCount:  number;
  createdAt:    string;
  updatedAt:    string;
}

export interface Message {
  id:             string;   // UUID
  conversationId: string;
  senderId:       string;
  content:        string | null;
  imageUrl:       string | null;
  messageType:    'text' | 'image';
  readAt:         string | null;
  createdAt:      string;
  senderInfo?:    ChatUser; // populated on GET
}

export interface Customer {
  id:        string;
  name:      string;
  phone:     string;
  email:     string;
  address:   string;
  gender?:   'male' | 'female' | '';
  notes:     string;
  createdAt: string;
}
