# Mogarenta — Website Usage Guide

> How to use the platform, step by step, for every kind of user.
> Last updated: 2026-07-05

---

## 1. For customers (shoppers)

### Browsing
1. Open the site — the **Explore** page shows all products. Under each product you see the store's district, e.g. **📍 Hodan**, so you instantly know where it comes from.
2. Tap a category chip (Electronics, Food, Health…) to filter; subcategory chips appear after you pick a category.
3. Tap any product to see photos, price, the store selling it, and **Similar Products** below.

### Finding the closest store that sells something
1. Tap the search bar and type what you want, e.g. *"phone charger"*.
2. Allow the location permission when asked (only asked while searching).
3. The **📍 Closest stores** list shows the 10 nearest stores selling a match — each with the store name, district, distance (e.g. *1.5 km*), and that store's own price. The list updates as you move.
4. If you type a **store's name** instead (e.g. *"TechZone"*), a **🏪 Stores** section shows matching stores — tap one to open its storefront.
5. Denied location? Everything still works — results are ranked by store rating instead of distance.

### Ordering
1. Tap **+ Add to Cart**. The cart groups items **by shop** — each shop is checked out separately.
2. At checkout choose **Pickup** (collect at the store) or **Delivery** (choose your Mogadishu district).
3. Pay with your mobile wallet (Sifalo) on the page, or pay cash on pickup/delivery.
4. Track your order under **Orders**; message the store via **Chat** if needed.

### Good to know
- ❤️ Wishlist saves products to your account.
- Install the app: your browser will offer **"Add to Home Screen"** — it then works like a normal app.
- The 🤖 chat bubble (bottom-right) answers questions about using the site.

---

## 2. For business owners (stores)

### Opening your store (do this once, ~15 minutes)
1. **Sign up** as a Business. Your store link is created automatically, e.g. `mogarenta.com/your-store-name`.
2. Go to **Profile** and complete these five things — stores that do get found and trusted:
   - **Logo** — upload a photo or pick an emoji. It shows on your storefront and every receipt.
   - **📍 Detect my location** — tap it ONCE while standing in your shop. This puts you on the map: customers searching nearby will see your distance, and your products show your district.
   - **🔗 Your Store Link** — keep the suggested link or type your own; the field tells you live if it's available. Then use **📋 Copy** and share it on WhatsApp, Facebook, your shop window.
   - **Contact numbers** — up to 4.
   - **Bio** — one or two sentences about what you sell.
3. New stores start on a **trial**; request approval from your dashboard when ready.

### Stocking your store — the fast way
1. Browse Explore or Search like a customer. Every product shows **➕ Add to Store**.
2. One tap claims the product into your inventory — then set **your own price and stock** in **Inventory**. You never re-type names, photos, or descriptions.
3. Your copy appears in customer searches under **your store name**, at **your price**, ranked by **your distance** to the shopper.

### Adding your own products
- **Inventory → Add product**: fill the form; the ✨ AI button writes a Somali description for you.
- Scan a **barcode** to find or create a product instantly.
- Bulk import via **CSV** for large catalogs.

### Selling over the counter (POS)
1. Open **POS** for counter sales — it scans barcodes, applies discounts and coupons, prints receipts with your logo.
2. Create **cashier accounts** (Staff page) so employees can sell without access to your money or settings. A cashier login only sees the pages you allow.
3. Note: you cannot buy your own products from your own store (POS sales are exempt).

### Getting paid
1. Online payments accumulate in your **wallet** (top of the business dashboard).
2. Save your **payout number** once, then request withdrawals; every payout is recorded in your ledger.

### Daily routine (5 minutes)
- Check **Orders** → confirm new orders, update statuses.
- Check **Chat** → answer customer questions.
- Check **Inventory** → fix any out-of-stock items.

---

## 3. For wholesale suppliers

- Mark products as **B2B** — customers never see them; only businesses do.
- Set **price tiers** (cheaper per unit at higher quantities) and a **minimum order quantity (MOQ)**.
- Businesses find you via Search and the Suppliers page and order through the same checkout.

---

## 4. For field agents

- Your **Profile** shows businesses registered, stores reached, and your **commission tier**.
- Register a business on the spot: help the owner sign up, set their GPS, claim their link, and stock their first 20 products — the 15-minute setup in §2 is your script.

---

## 5. For platform admins

- **/admin**: user management, store approvals, verification requests, platform stats.
- Approve stores that finish trial; review verification badge requests (the ✔ next to store names).
- Admin access is restricted to accounts listed in `NEXT_PUBLIC_ADMIN_UIDS` plus the admins table.

---

## 6. Troubleshooting

| Problem | Fix |
|---|---|
| "No distances shown in search" | Allow the location permission; the store must also have tapped **Detect my location** |
| "My store doesn't appear when customers search nearby" | Set your GPS in Profile — no location means you rank after located stores |
| "Store link says already taken" | Another store claimed it — the field suggests alternatives; try adding your district, e.g. `-hodan` |
| "Payment says mock/test" | Live Sifalo credentials aren't configured yet — cash on pickup/delivery still works |
| "Product photo missing" | The image URL is broken — re-upload the photo in Inventory |
| "Page looks stale / blank (developers)" | Kill stale `node.exe`, delete `.next`, restart the dev server |
