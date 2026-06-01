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

export interface Product {
  id:            number;
  name:          string;
  price:         number;
  originalPrice: number;
  category:      string;
  subCategory?:  string;
  icon:          string;
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
}

/** A product that a specific business has claimed from the global catalog */
export interface BusinessProduct {
  id:          number;
  supplierId:  number;
  productId:   number;
  product?:    Product; // populated on GET
  customPrice: number;
  stockQty:    number;
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
  verified:  boolean;
  createdAt: string;
}

export type AccountType   = 'user' | 'business';
export type PaymentMethod = 'waafi' | 'cash' | 'card';
export type PaymentState  = 'idle'  | 'pending' | 'success' | 'error';

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
  notes:     string;
  createdAt: string;
}
