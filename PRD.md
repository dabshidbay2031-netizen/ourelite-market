# Mogarenta Platform - Product Requirements Document (PRD)

**Document Version:** 1.0  
**Last Updated:** May 29, 2026  
**Status:** Active Development

---

## Table of Contents
1. [Executive Summary](#executive-summary)
2. [Product Vision](#product-vision)
3. [Target Users](#target-users)
4. [Core Features](#core-features)
5. [User Stories & Use Cases](#user-stories--use-cases)
6. [Technical Architecture](#technical-architecture)
7. [Success Metrics](#success-metrics)
8. [Out of Scope](#out-of-scope)
9. [Timeline & Milestones](#timeline--milestones)

---

## Executive Summary

**Product Name:** Mogarenta  
**Product Type:** Multi-Vendor E-Commerce Marketplace with Integrated Inventory & POS  
**Primary Goal:** Enable small businesses and suppliers to sell products online, manage inventory, process orders, and communicate with customers seamlessly.

Mogarenta is a comprehensive B2B2C (Business-to-Business-to-Consumer) platform that connects suppliers with retailers and end consumers. The platform provides supplier account management, product catalog management, inventory tracking, order fulfillment, real-time messaging, and point-of-sale (POS) capabilities.

---

## Product Vision

To become the leading digital marketplace platform in East Africa that empowers local businesses and suppliers by providing an accessible, scalable, and user-friendly solution for online sales, inventory management, and customer engagement.

### Key Vision Principles
- **Accessibility:** Simple enough for non-technical users to operate
- **Scalability:** Support from single-seller to multi-vendor operations
- **Real-time Communication:** Instant supplier-customer communication
- **Data-Driven:** Comprehensive analytics and insights for business decisions
- **Mobile-First:** Optimized for mobile devices (primary access method in target markets)

---

## Target Users

### Primary Users

#### 1. **Suppliers / Business Owners**
- **Profile:** Small to medium-sized businesses, wholesalers, distributors
- **Location:** East Africa (Somalia, Kenya, Uganda, Ethiopia)
- **Pain Points:**
  - No digital presence or online sales channel
  - Manual inventory management
  - Difficulty reaching customers beyond physical location
  - No integrated customer communication platform
  - Complex order fulfillment process
- **Goals:**
  - Increase sales through online channel
  - Reduce manual paperwork and human error
  - Expand customer base
  - Manage inventory efficiently

#### 2. **Retailers / Resellers**
- **Profile:** Shop owners, store managers, business employees
- **Pain Points:**
  - Time-consuming supplier sourcing
  - Lack of visibility into available products
  - Manual order placement
  - Inventory tracking challenges
- **Goals:**
  - Quick access to multiple suppliers and products
  - Streamlined ordering process
  - Better inventory visibility

#### 3. **End Consumers**
- **Profile:** Individual shoppers, small businesses
- **Pain Points:**
  - Limited product visibility
  - No direct communication with sellers
  - Difficulty comparing prices and products
  - Poor payment options
- **Goals:**
  - Easy product discovery
  - Direct communication with sellers
  - Secure payments
  - Quick delivery

#### 4. **Administrators / Platform Managers**
- **Profile:** Mogarenta team members managing the platform
- **Goals:**
  - Monitor platform health and metrics
  - Manage suppliers and users
  - Resolve disputes
  - Analyze platform performance

---

## Core Features

### 1. **Product & Catalog Management**

#### For Suppliers
- [ ] Add/Edit/Delete products with:
  - Name, description, price, original price
  - Multiple product images (batch upload)
  - SKU, barcode, brand information
  - Category and sub-category classification
  - Tags and attributes
  - Stock quantity management
- [ ] Product categorization system (13+ categories)
- [ ] Bulk product import/export
- [ ] Barcode scanner integration
- [ ] Automatic product availability status
- [ ] Product rating and review management

#### For Consumers
- [ ] Browse all products by category/sub-category
- [ ] Advanced search with filters:
  - Price range
  - Rating
  - Brand
  - Availability
- [ ] Product details view with:
  - Images gallery
  - Description and specifications
  - Customer reviews and ratings
  - Stock availability
  - Price comparison (if from multiple suppliers)
- [ ] Wishlist functionality
- [ ] Product recommendations

---

### 2. **Supplier Management**

#### Supplier Profile
- [ ] Company information (name, location, contact)
- [ ] Verification badge and rating system
- [ ] Supplier bio and contact numbers
- [ ] Categories served
- [ ] Delivery information (delivery days, areas)
- [ ] Discount offerings
- [ ] Minimum order requirements
- [ ] Business verification process

#### Multi-Supplier Product Assignment
- [ ] Business Products feature: Allow suppliers to list global products at custom price/stock
- [ ] Supplier comparison for same products
- [ ] Supplier rating and review system

---

### 3. **Order Management**

#### For Suppliers
- [ ] View all incoming orders
- [ ] Order status tracking:
  - Pending
  - Processing
  - Shipped
  - Delivered
  - Cancelled
- [ ] Order details:
  - Items list with quantities
  - Customer information
  - Payment status
  - Delivery address
  - Special notes
- [ ] Order fulfillment workflow
- [ ] Bulk order actions
- [ ] Order history and analytics

#### For Customers/Retailers
- [ ] Shopping cart with:
  - Add/remove items
  - Quantity adjustment
  - Save for later
- [ ] Checkout process:
  - Shipping address
  - Payment method selection
  - Order review
  - Order confirmation
- [ ] Order tracking with real-time status
- [ ] Order history
- [ ] Ability to view and cancel orders

---

### 4. **Inventory Management**

#### Features
- [ ] Real-time stock level tracking
- [ ] Low stock alerts/notifications
- [ ] Stock updates across all channels (web, POS, mobile)
- [ ] Inventory history and audit logs
- [ ] Stock SKU management
- [ ] Barcode/QR code tracking
- [ ] Manual stock adjustment with notes
- [ ] Inventory reports and analytics
- [ ] Stock forecasting (future feature)

---

### 5. **Customer Communication & Chat**

#### Real-time Messaging System
- [ ] Direct messaging between suppliers and customers
- [ ] Conversation history
- [ ] Message notifications
- [ ] Read receipts
- [ ] Image sharing in chats
- [ ] Message status indicators (sent, delivered, read)
- [ ] Search message history

#### Notifications System
- [ ] Order notifications (new order, shipped, delivered)
- [ ] Stock alerts (low inventory)
- [ ] Supplier deals and promotions
- [ ] Payment confirmations
- [ ] Account activity notifications
- [ ] Push notifications (future)
- [ ] Email notifications (future)

---

### 6. **Payment & Transactions**

#### Supported Payment Methods
- [ ] Cash on Delivery (COD)
- [ ] Mobile Money (Waafi, M-Pesa, etc.)
- [ ] Bank Transfer
- [ ] Future: Credit/Debit Card

#### Payment Features
- [ ] Secure payment processing
- [ ] Payment confirmation
- [ ] Invoice generation
- [ ] Transaction history
- [ ] Refund management
- [ ] Multiple currency support (USD, KES, ETB, etc.)

---

### 7. **Point of Sale (POS) System**

#### Features
- [ ] Fast product search and barcode scanning
- [ ] Quick cart creation
- [ ] Multiple payment methods (cash, mobile, card)
- [ ] Receipt printing
- [ ] Daily sales summary
- [ ] Offline mode capability
- [ ] Cash drawer management
- [ ] User/cashier login
- [ ] Sales reports and analytics

---

### 8. **Authentication & User Management**

#### Features
- [ ] Firebase-based authentication
- [ ] Role-based access:
  - Supplier/Admin
  - Retailer
  - Customer
  - Platform Admin
- [ ] User profile management
- [ ] Account verification and badges
- [ ] Password reset
- [ ] Session management
- [ ] Account security settings

---

### 9. **Dashboard & Analytics**

#### For Suppliers
- [ ] Sales overview
  - Total revenue
  - Number of orders
  - Average order value
  - Top-selling products
- [ ] Customer analytics
  - New customers
  - Repeat customers
  - Customer location distribution
- [ ] Inventory insights
  - Stock levels
  - Slow-moving products
  - Top products
- [ ] Order analytics
  - Orders by status
  - Orders by time period
  - Fulfillment metrics
- [ ] Charts and graphs
- [ ] Export reports

#### For Customers
- [ ] Order history with statistics
- [ ] Spending analytics
- [ ] Favorite suppliers
- [ ] Wishlist management

---

### 10. **Search & Discovery**

#### Features
- [ ] Full-text product search
- [ ] Category-based browsing
- [ ] Filters (price, rating, brand, supplier, etc.)
- [ ] Sort options (price, rating, newest, popularity)
- [ ] Search history
- [ ] Trending products
- [ ] Recommended products
- [ ] Featured suppliers

---

### 11. **Customer Management**

#### Features
- [ ] Customer directory (for suppliers)
- [ ] Customer contact information
- [ ] Purchase history per customer
- [ ] Customer notes and preferences
- [ ] Bulk customer management
- [ ] Customer communication history

---

### 12. **Additional Features**

#### Settings & Configuration
- [ ] User account settings
- [ ] Profile customization
- [ ] Notification preferences
- [ ] Privacy and security settings
- [ ] Two-factor authentication (future)

#### Support & Help
- [ ] Help documentation
- [ ] FAQ section
- [ ] Contact support
- [ ] Reporting system (for issues)

---

## User Stories & Use Cases

### Supplier Use Case Flow

**Scenario 1: New Supplier Onboarding**
```
1. Supplier signs up with business information
2. Submits verification documents
3. Creates initial product catalog
4. Sets delivery zones and minimum order
5. Starts receiving orders
```

**Scenario 2: Daily Order Management**
```
1. Supplier logs in and sees pending orders
2. Reviews order details
3. Confirms/processes order
4. Updates stock levels (manually or via scan)
5. Marks order as shipped
6. Sends delivery notification to customer
7. Receives order confirmation from customer
```

**Scenario 3: Inventory Management**
```
1. Supplier checks current stock levels
2. Reviews low-stock alerts
3. Manually updates inventory (damaged goods, returns)
4. Scans barcode for quick stock check
5. Reviews inventory reports
6. Plans restocking based on sales trends
```

### Customer Use Case Flow

**Scenario 1: Product Discovery and Purchase**
```
1. Customer opens app/website
2. Searches for "iPhone 15 Pro"
3. Filters by price range ($900-$1100)
4. Compares multiple suppliers
5. Reads reviews and ratings
6. Selects preferred supplier
7. Adds to cart
8. Proceeds to checkout
9. Selects payment method
10. Places order
11. Receives order confirmation
```

**Scenario 2: Order Tracking**
```
1. Customer views "My Orders"
2. Clicks on specific order
3. Sees real-time status updates
4. Contacts supplier via chat with questions
5. Receives delivery notification
6. Marks as received/delivered
```

**Scenario 3: Direct Communication**
```
1. Customer wants custom pricing for bulk order
2. Initiates chat with supplier
3. Negotiates quantity and price
4. Supplier sends custom quote via message
5. Customer confirms and makes purchase
6. Order auto-created from chat context
```

---

## Technical Architecture

### Technology Stack
- **Frontend:** Next.js (React), TypeScript, Tailwind CSS
- **Backend:** Next.js API Routes
- **Database:** Supabase (PostgreSQL)
- **Authentication:** Firebase Auth
- **Storage:** Supabase Storage (images)
- **Real-time:** Supabase Realtime (WebSocket)
- **Hosting:** Vercel (frontend), Supabase (backend)

### Database Schema Overview
- **Tables:** Products, Suppliers, Orders, Customers, Conversations, Messages, Notifications, Profiles, Business Products, Inventory (implied)
- **Relations:** Foreign keys for supplier-product, order-items, conversation-messages
- **Indexes:** Optimized for fast queries on commonly filtered fields

### Key Integrations
- Firebase Authentication
- Supabase (Database + Storage + Realtime)
- Payment gateways (Waafi, M-Pesa, etc.)
- Barcode scanning library
- Email service (future)

---

## Success Metrics

### Business Metrics
1. **User Acquisition**
   - Target: 1,000+ suppliers by Q4 2026
   - Target: 10,000+ registered customers by Q4 2026

2. **Revenue Metrics**
   - Platform commission from orders
   - Monthly Recurring Revenue (MRR)
   - Average Order Value (AOV)
   - Customer Lifetime Value (CLV)

3. **Engagement Metrics**
   - Monthly Active Users (MAU)
   - Orders per week
   - Repeat customer rate
   - Message count (chat engagement)

4. **Operational Metrics**
   - Order fulfillment rate
   - Average order processing time
   - Customer support response time
   - Payment success rate

### Product Metrics
1. **Availability**
   - Platform uptime: > 99.9%
   - Page load time: < 2 seconds

2. **Performance**
   - Search response time: < 500ms
   - Image load time: < 1 second

3. **User Satisfaction**
   - Net Promoter Score (NPS): > 50
   - Customer satisfaction rating: > 4.5/5
   - Support ticket resolution rate: > 95%

---

## Out of Scope

The following features are **not** included in the initial MVP and will be considered for future releases:

- [ ] AI-powered product recommendations
- [ ] Advanced analytics with machine learning
- [ ] Multiple language support (beyond initial setup)
- [ ] Advanced logistics/shipping integrations
- [ ] Automated inventory sync with suppliers
- [ ] Video product demonstrations
- [ ] Augmented Reality (AR) try-on features
- [ ] Advanced fraud detection system
- [ ] Return/refund automation
- [ ] Marketing automation platform
- [ ] API for third-party integrations
- [ ] White-label solutions

---

## Timeline & Milestones

### Phase 1: MVP (Current)
**Duration:** January - June 2026
- [x] Product catalog and management
- [x] Basic order management
- [x] Supplier profiles
- [x] Chat and notifications
- [x] Authentication
- [x] Basic dashboard

### Phase 2: Enhanced Features
**Duration:** July - September 2026
- [ ] Advanced analytics and reporting
- [ ] POS system optimization
- [ ] Payment gateway integrations
- [ ] Customer management system
- [ ] Mobile app (iOS/Android)

### Phase 3: Scale & Optimize
**Duration:** October - December 2026
- [ ] Performance optimization
- [ ] Multi-currency support
- [ ] Regional expansion
- [ ] Advanced inventory management
- [ ] AI-powered recommendations

### Phase 4: Growth
**Duration:** 2027+
- [ ] API for third-party sellers
- [ ] Logistics partnerships
- [ ] Marketing automation
- [ ] International expansion

---

## Appendix

### Assumptions
- Users have access to internet (mobile or desktop)
- Most users access via mobile devices
- Payment processing through third-party providers
- Suppliers will accurately input and manage their own inventory
- Firebase Auth is sufficient for current scale

### Constraints
- Single timezone display (can be improved)
- Limited to Supabase storage limits
- Real-time features limited by Supabase plan
- Manual verification process for suppliers

### Dependencies
- Firebase service availability
- Supabase service availability
- Payment gateway uptime
- Internet connectivity

### Success Definition
A successful launch of Mogarenta means:
- Platform runs without critical errors
- 100+ suppliers actively using the platform
- 1,000+ orders processed in first month
- Customer satisfaction rating > 4.0/5
- Daily active users > 500

---

**Document Prepared By:** Development Team  
**Last Review Date:** May 29, 2026  
**Next Review Date:** August 29, 2026
