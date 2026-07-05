-- ================================================================
-- Mogarenta — Complete Database Schema
-- Run this ONCE in Supabase SQL Editor on a fresh database.
--
-- Already have an existing database? This file is safe to re-run:
-- every statement uses CREATE TABLE IF NOT EXISTS, DROP POLICY IF
-- EXISTS, CREATE INDEX IF NOT EXISTS, and ON CONFLICT DO NOTHING.
--
-- Firebase UID compatibility:
--   • profiles.id          TEXT  (Firebase UIDs are not UUIDs)
--   • orders.user_id       TEXT  (same)
--   • suppliers.auth_user_id TEXT (same)
--   No REFERENCES auth.users — Firebase users live outside Supabase.
-- ================================================================


-- ============================================================
-- 1. DROP OLD CONSTRAINTS (safe no-ops on fresh DBs)
-- ============================================================

-- Remove any old FK from products.category — we store category as
-- free-text; the old categories table constraint blocks new values.
-- Guard: only runs if the products table already exists.
DO $$
DECLARE con TEXT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'products'
  ) THEN
    RETURN;  -- fresh DB, nothing to drop
  END IF;

  SELECT conname INTO con
  FROM   pg_constraint
  WHERE  conrelid = 'products'::regclass
  AND    contype  = 'f'
  AND    conname  LIKE '%category%'
  LIMIT  1;
  IF con IS NOT NULL THEN
    EXECUTE 'ALTER TABLE products DROP CONSTRAINT ' || quote_ident(con);
  END IF;
END $$;


-- ============================================================
-- 2. TABLES
-- ============================================================

-- ── products ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS products (
  id             SERIAL        PRIMARY KEY,
  name           TEXT          NOT NULL DEFAULT '',
  price          DECIMAL(10,2) NOT NULL DEFAULT 0,
  original_price DECIMAL(10,2) NOT NULL DEFAULT 0,
  category       TEXT          NOT NULL DEFAULT '',
  sub_category   TEXT,
  icon           TEXT          NOT NULL DEFAULT '📦',
  stock          INTEGER       NOT NULL DEFAULT 0,
  sku            TEXT          NOT NULL DEFAULT '',
  supplier_id    INTEGER,
  rating         DECIMAL(3,1)  NOT NULL DEFAULT 0,
  reviews        INTEGER       NOT NULL DEFAULT 0,
  sold           INTEGER       NOT NULL DEFAULT 0,
  description    TEXT          NOT NULL DEFAULT '',
  barcode        TEXT,
  tags           TEXT[]        DEFAULT '{}',
  brand          TEXT,
  image_url      TEXT,
  image_urls     TEXT[]        DEFAULT '{}',
  created_at     TIMESTAMPTZ   DEFAULT NOW()
);
-- Ensure new columns exist on already-created tables
ALTER TABLE products ADD COLUMN IF NOT EXISTS sub_category  TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS barcode       TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS tags          TEXT[] DEFAULT '{}';
ALTER TABLE products ADD COLUMN IF NOT EXISTS brand         TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS image_url     TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS image_urls    TEXT[] DEFAULT '{}';

-- ── suppliers ────────────────────────────────────────────────
-- If auth_user_id is still UUID, drop any policies that reference it,
-- cast the column to TEXT, then the open policies below will replace them.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE  table_name  = 'suppliers'
    AND    column_name = 'auth_user_id'
    AND    udt_name    = 'uuid'
  ) THEN
    -- Drop every policy on suppliers so the ALTER can proceed
    DROP POLICY IF EXISTS "Suppliers can update their own"          ON suppliers;
    DROP POLICY IF EXISTS "Authenticated users can create supplier" ON suppliers;
    DROP POLICY IF EXISTS "Suppliers viewable by everyone"          ON suppliers;
    DROP POLICY IF EXISTS "suppliers_read"                          ON suppliers;
    DROP POLICY IF EXISTS "suppliers_write"                         ON suppliers;
    ALTER TABLE suppliers ALTER COLUMN auth_user_id TYPE TEXT;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS suppliers (
  id              SERIAL        PRIMARY KEY,
  name            TEXT          NOT NULL DEFAULT '',
  rating          DECIMAL(3,1)  NOT NULL DEFAULT 0,
  reviews         INTEGER       NOT NULL DEFAULT 0,
  location        TEXT          NOT NULL DEFAULT '',
  min_order       INTEGER       NOT NULL DEFAULT 0,
  categories      TEXT[]        DEFAULT '{}',
  icon            TEXT          NOT NULL DEFAULT '🏭',
  description     TEXT          NOT NULL DEFAULT '',
  product_ids     INTEGER[]     DEFAULT '{}',
  discount        INTEGER       NOT NULL DEFAULT 0,
  delivery_days   TEXT          NOT NULL DEFAULT '3-5',
  verified        BOOLEAN       NOT NULL DEFAULT false,
  badge           TEXT          NOT NULL DEFAULT '',
  bio             TEXT,
  contact_numbers TEXT[]        DEFAULT '{}',
  auth_user_id    TEXT,
  created_at      TIMESTAMPTZ   DEFAULT NOW()
);

-- ── orders ───────────────────────────────────────────────────
-- Cast user_id from UUID → TEXT if the old schema is still in place.
-- Must drop the FK to auth.users and any dependent policies first.
DO $$
DECLARE fk TEXT;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE  table_name  = 'orders'
    AND    column_name = 'user_id'
    AND    udt_name    = 'uuid'
  ) THEN
    -- Drop the foreign-key constraint (name may vary, cover both)
    ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_user_id_fkey;
    -- Also drop any FK whose name differs
    SELECT conname INTO fk
    FROM   pg_constraint
    WHERE  conrelid = 'orders'::regclass
    AND    contype  = 'f'
    AND    conkey   @> ARRAY[
             (SELECT attnum FROM pg_attribute
              WHERE  attrelid = 'orders'::regclass
              AND    attname  = 'user_id')
           ]::smallint[]
    LIMIT 1;
    IF fk IS NOT NULL THEN
      EXECUTE 'ALTER TABLE orders DROP CONSTRAINT ' || quote_ident(fk);
    END IF;
    -- Drop policies that reference user_id
    DROP POLICY IF EXISTS "Orders viewable by owner" ON orders;
    DROP POLICY IF EXISTS "Anyone can create orders" ON orders;
    DROP POLICY IF EXISTS "orders_all"               ON orders;
    -- Now safe to change the type
    ALTER TABLE orders ALTER COLUMN user_id TYPE TEXT;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS orders (
  id             TEXT          PRIMARY KEY,
  customer_name  TEXT          NOT NULL DEFAULT '',
  customer_phone TEXT          NOT NULL DEFAULT '',
  user_id        TEXT,
  items          JSONB         NOT NULL DEFAULT '[]',
  subtotal       DECIMAL(10,2) NOT NULL DEFAULT 0,
  discount       DECIMAL(10,2) NOT NULL DEFAULT 0,
  total          DECIMAL(10,2) NOT NULL DEFAULT 0,
  payment_method TEXT          NOT NULL DEFAULT 'cash',
  status         TEXT          NOT NULL DEFAULT 'pending',
  notes          TEXT,
  created_at     TIMESTAMPTZ   DEFAULT NOW()
);
-- Ensure notes exists on already-created orders tables
ALTER TABLE orders ADD COLUMN IF NOT EXISTS notes TEXT;

-- ── notifications ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id         SERIAL      PRIMARY KEY,
  type       TEXT        NOT NULL DEFAULT 'info',
  title      TEXT        NOT NULL DEFAULT '',
  message    TEXT        NOT NULL DEFAULT '',
  time_ago   TEXT        NOT NULL DEFAULT '',
  read       BOOLEAN     NOT NULL DEFAULT false,
  icon       TEXT        NOT NULL DEFAULT '🔔',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── profiles ──────────────────────────────────────────────────
-- Cast id from UUID → TEXT if old schema is still in place.
-- Must drop the FK to auth.users and any dependent policies first.
DO $$
DECLARE fk TEXT;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE  table_name  = 'profiles'
    AND    column_name = 'id'
    AND    udt_name    = 'uuid'
  ) THEN
    -- Drop FK to auth.users (old schema used REFERENCES auth.users(id))
    ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey;
    -- Also catch any differently-named FK on the id column
    SELECT conname INTO fk
    FROM   pg_constraint
    WHERE  conrelid = 'profiles'::regclass
    AND    contype  = 'f'
    AND    conkey   @> ARRAY[
             (SELECT attnum FROM pg_attribute
              WHERE  attrelid = 'profiles'::regclass
              AND    attname  = 'id')
           ]::smallint[]
    LIMIT 1;
    IF fk IS NOT NULL THEN
      EXECUTE 'ALTER TABLE profiles DROP CONSTRAINT ' || quote_ident(fk);
    END IF;
    -- Drop policies that reference id
    DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON profiles;
    DROP POLICY IF EXISTS "Users can insert their own profile"       ON profiles;
    DROP POLICY IF EXISTS "Users can update their own profile"       ON profiles;
    DROP POLICY IF EXISTS "profiles_all"                             ON profiles;
    -- Now safe to change the type
    ALTER TABLE profiles ALTER COLUMN id TYPE TEXT;
  END IF;
END $$;

-- verified is set manually from Supabase Dashboard to mark trusted users
CREATE TABLE IF NOT EXISTS profiles (
  id         TEXT        PRIMARY KEY,
  full_name  TEXT        NOT NULL DEFAULT '',
  phone      TEXT        NOT NULL DEFAULT '',
  avatar     TEXT        NOT NULL DEFAULT '👤',
  verified   BOOLEAN     NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
-- Ensure verified exists on already-created profiles tables
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS verified BOOLEAN NOT NULL DEFAULT false;

-- ── customers ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS customers (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name       TEXT        NOT NULL,
  phone      TEXT        NOT NULL DEFAULT '',
  email      TEXT        NOT NULL DEFAULT '',
  address    TEXT        NOT NULL DEFAULT '',
  notes      TEXT        NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── business_products ─────────────────────────────────────────
-- Any business can claim any global product at their own price/stock
CREATE TABLE IF NOT EXISTS business_products (
  id           SERIAL        PRIMARY KEY,
  supplier_id  INTEGER       NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  product_id   INTEGER       NOT NULL REFERENCES products(id)  ON DELETE CASCADE,
  custom_price DECIMAL(10,2) NOT NULL DEFAULT 0,
  stock_qty    INTEGER       NOT NULL DEFAULT 0,
  is_active    BOOLEAN       NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ   DEFAULT NOW(),
  UNIQUE(supplier_id, product_id)
);

-- ── conversations ─────────────────────────────────────────────
-- One row per user pair; user_id_1 ≤ user_id_2 (enforced via sort in app)
CREATE TABLE IF NOT EXISTS conversations (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id_1  TEXT        NOT NULL,
  user_id_2  TEXT        NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id_1, user_id_2)
);

-- ── messages ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS messages (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID        NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id       TEXT        NOT NULL,
  content         TEXT,
  image_url       TEXT,
  message_type    TEXT        NOT NULL DEFAULT 'text',   -- 'text' | 'image'
  read_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);


-- ============================================================
-- 3. INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS suppliers_auth_user_id_idx  ON suppliers(auth_user_id);
CREATE INDEX IF NOT EXISTS products_barcode_idx        ON products(barcode);
CREATE INDEX IF NOT EXISTS products_category_idx       ON products(category);
CREATE INDEX IF NOT EXISTS orders_user_id_idx          ON orders(user_id);
CREATE INDEX IF NOT EXISTS orders_created_at_idx       ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS bp_supplier_idx             ON business_products(supplier_id);
CREATE INDEX IF NOT EXISTS bp_product_idx              ON business_products(product_id);
CREATE INDEX IF NOT EXISTS conv_uid1_idx               ON conversations(user_id_1);
CREATE INDEX IF NOT EXISTS conv_uid2_idx               ON conversations(user_id_2);
CREATE INDEX IF NOT EXISTS msg_conv_idx                ON messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS msg_sender_idx              ON messages(sender_id);


-- ============================================================
-- 4. ROW LEVEL SECURITY
-- All tables use open policies — our API routes use the service-role
-- key which bypasses RLS entirely. These policies are only relevant
-- if you add direct client access later.
-- ============================================================

ALTER TABLE products         ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers        ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders           ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications    ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles         ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers        ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations    ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages         ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "products_read"   ON products;       CREATE POLICY "products_read"   ON products       FOR SELECT USING (true);
DROP POLICY IF EXISTS "products_write"  ON products;       CREATE POLICY "products_write"  ON products       FOR ALL    USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "suppliers_read"  ON suppliers;      CREATE POLICY "suppliers_read"  ON suppliers      FOR SELECT USING (true);
DROP POLICY IF EXISTS "suppliers_write" ON suppliers;      CREATE POLICY "suppliers_write" ON suppliers      FOR ALL    USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "orders_all"      ON orders;         CREATE POLICY "orders_all"      ON orders         FOR ALL    USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "notifs_all"      ON notifications;  CREATE POLICY "notifs_all"      ON notifications  FOR ALL    USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "profiles_all"    ON profiles;       CREATE POLICY "profiles_all"    ON profiles       FOR ALL    USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "customers_all"   ON customers;      CREATE POLICY "customers_all"   ON customers      FOR ALL    USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "bp_all"          ON business_products; CREATE POLICY "bp_all"       ON business_products FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "conv_all"        ON conversations;  CREATE POLICY "conv_all"        ON conversations  FOR ALL    USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "msg_all"         ON messages;       CREATE POLICY "msg_all"         ON messages       FOR ALL    USING (true) WITH CHECK (true);


-- ============================================================
-- 5. SUPABASE REALTIME  (live chat)
-- ============================================================

ALTER PUBLICATION supabase_realtime ADD TABLE messages;
ALTER PUBLICATION supabase_realtime ADD TABLE conversations;


-- ============================================================
-- 5b. SCHEMA ADDITIONS (run-safe with IF NOT EXISTS guards)
-- ============================================================

-- Let businesses hide their exact stock count from public customers
ALTER TABLE suppliers         ADD COLUMN IF NOT EXISTS hide_stock BOOLEAN NOT NULL DEFAULT false;

-- Minimum order quantity per business-product listing
ALTER TABLE business_products ADD COLUMN IF NOT EXISTS moq INTEGER NOT NULL DEFAULT 1;

-- Supplier account type (business = retailer, supplier = wholesaler)
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS account_type TEXT NOT NULL DEFAULT 'business';

-- B2B product fields (for wholesale supplier products)
ALTER TABLE products   ADD COLUMN IF NOT EXISTS price_tiers JSONB    DEFAULT '[]';
ALTER TABLE products   ADD COLUMN IF NOT EXISTS is_b2b      BOOLEAN  NOT NULL DEFAULT false;
ALTER TABLE products   ADD COLUMN IF NOT EXISTS moq         INTEGER  NOT NULL DEFAULT 1;


-- ============================================================
-- 6. SUPABASE STORAGE  (chat images + product photos)
-- ============================================================

-- chat-images bucket (live chat photo messages)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'chat-images', 'chat-images', true, 10485760,
  ARRAY['image/jpeg','image/png','image/gif','image/webp','image/heic']
)
ON CONFLICT (id) DO NOTHING;

-- product-images bucket (multiple photos per product)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'product-images', 'product-images', true, 20971520,   -- 20 MB per file
  ARRAY['image/jpeg','image/png','image/webp','image/heic']
)
ON CONFLICT (id) DO NOTHING;

-- Allow public reads on chat-images
DROP POLICY IF EXISTS "chat_images_public_read" ON storage.objects;
CREATE POLICY "chat_images_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'chat-images');

-- Allow authenticated and anonymous uploads (Firebase auth is outside Supabase)
DROP POLICY IF EXISTS "chat_images_upload" ON storage.objects;
CREATE POLICY "chat_images_upload"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'chat-images');

DROP POLICY IF EXISTS "chat_images_delete" ON storage.objects;
CREATE POLICY "chat_images_delete"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'chat-images');

-- product-images policies
DROP POLICY IF EXISTS "product_images_public_read" ON storage.objects;
CREATE POLICY "product_images_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'product-images');

DROP POLICY IF EXISTS "product_images_upload" ON storage.objects;
CREATE POLICY "product_images_upload"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'product-images');

DROP POLICY IF EXISTS "product_images_update" ON storage.objects;
CREATE POLICY "product_images_update"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'product-images');

DROP POLICY IF EXISTS "product_images_delete" ON storage.objects;
CREATE POLICY "product_images_delete"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'product-images');


-- ============================================================
-- 7. NEW CATEGORIES (if a legacy categories table exists)
-- ============================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE  table_schema = 'public' AND table_name = 'categories'
  ) THEN
    INSERT INTO categories (id, name, icon, color) VALUES
      ('clothes',      'Clothes',      '👕', '#EC4899'),
      ('medicine',     'Medicine',     '💊', '#EF4444'),
      ('cosmetics',    'Cosmetics',    '💄', '#F472B6'),
      ('construction', 'Construction', '🏗️', '#92400E'),
      ('furniture',    'Furniture',    '🪑', '#78350F'),
      ('cars',         'Automotive',   '🚗', '#1D4ED8'),
      ('books',        'Books',        '📚', '#7C3AED'),
      ('other',        'Other',        '📦', '#94A3B8')
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;


-- ============================================================
-- 8. SEED — SUPPLIERS
-- ============================================================

INSERT INTO suppliers (id, name, rating, reviews, location, min_order, categories, icon, description, product_ids, discount, delivery_days, verified, badge)
OVERRIDING SYSTEM VALUE VALUES
  (1,'TechVault Global',          4.8,234,'Shenzhen, China',        10, ARRAY['electronics'],                         '🏭','Premium electronics supplier with 15+ years. Direct manufacturer partnerships with Apple, Samsung, Sony.',  ARRAY[1,2,3,4,5,6,7,8,9,10],                    15,'7-14', true, 'Top Rated'  ),
  (2,'SoundPro Distributors',     4.6,156,'Tokyo, Japan',            5, ARRAY['electronics'],                         '🎵','Specialized in premium audio equipment. Sony and Bose authorized distributor.',                            ARRAY[6],                                        12,'10-18',true, 'Verified'   ),
  (3,'Fashion Hub International', 4.5,567,'Istanbul, Turkey',       20, ARRAY['clothes','sports'],                    '👗','Top fashion & sportswear distributor. Authorized for Nike, Adidas, Levis and Ray-Ban.',                  ARRAY[11,12,13,14,15,16,17,18,32,33,34],         20,'5-10', true, 'Best Seller'),
  (4,'HomePro Solutions',         4.7,345,'Dubai, UAE',              5, ARRAY['home','construction','furniture','cars'],'🏠','Premium home, furniture & construction goods. Dyson, KitchenAid, Makita partner.',                      ARRAY[19,20,21,22,23,35,46,47,48,49,50,51,52,53,54,55,56,57,58,59], 10,'3-7',  true, 'Fast Ship'  ),
  (5,'NaturalGoods Trading',      4.4,189,'Singapore',              50, ARRAY['food','books'],                        '🌿','Organic food & books distributor. Direct farm partnerships & eco-certified.',                              ARRAY[24,25,26,27,60,61,62,63,64,65],            25,'14-21',false,'Eco'        ),
  (6,'PharmaTrade Global',        4.9,456,'Amsterdam, Netherlands', 100,ARRAY['health','medicine','cosmetics'],        '💊','GMP-certified pharmaceutical, health & cosmetics. ISO 9001, EU licensed.',                                ARRAY[28,29,30,31,36,37,38,39,40,41,42,43,44,45],30,'7-14', true, 'Certified'  )
ON CONFLICT (id) DO NOTHING;


-- ============================================================
-- 9. SEED — PRODUCTS  (65 products across 13 categories)
-- ============================================================

INSERT INTO products (id, name, price, original_price, category, sub_category, icon, stock, sku, supplier_id, rating, reviews, sold, barcode, brand, tags, description)
OVERRIDING SYSTEM VALUE VALUES
  -- Electronics
  (1, 'iPhone 15 Pro',              999.99,1099.99,'electronics','phones',    '📱', 23,'APL-15P',   1,4.8,324, 156,'0194253716907','Apple',       ARRAY['5G','USB-C','48MP','ProMotion'],          'Titanium design, A17 Pro chip, 48MP camera, USB-C.'),
  (2, 'Samsung Galaxy S24',         849.99, 899.99,'electronics','phones',    '📲', 15,'SAM-S24',   1,4.6,287, 203,'8806095071467','Samsung',      ARRAY['5G','AI Camera','120Hz'],                 'Galaxy AI phone, 6.2" display, 50MP camera, Snapdragon 8 Gen 3.'),
  (3, 'MacBook Air M3',            1299.99,1399.99,'electronics','laptops',   '💻',  8,'APL-MBAM3', 1,4.9,156,  89,'0194253913105','Apple',       ARRAY['M3 Chip','15h Battery','Retina','USB-C'], 'Ultra-thin laptop, M3 chip, 15-hour battery, Liquid Retina.'),
  (4, 'AirPods Pro 2',              249.99, 279.99,'electronics','audio',     '🎧', 42,'APL-APP2',  1,4.7,512, 445,'0194253387212','Apple',       ARRAY['ANC','Spatial Audio','H2 Chip'],          'Active Noise Cancellation, Adaptive Audio, H2 chip.'),
  (5, 'iPad Air 5',                 599.99, 649.99,'electronics','phones',    '📟', 19,'APL-IPAD5', 1,4.6,198, 134,'0194252648247','Apple',       ARRAY['M1','5G','10.9 Retina','USB-C'],          'M1 chip, 10.9" Liquid Retina, 5G capable.'),
  (6, 'Sony WH-1000XM5',            349.99, 399.99,'electronics','audio',     '🎵', 31,'SNY-WH5',   2,4.8,678, 312,'4548736132375','Sony',        ARRAY['ANC','30h Battery','LDAC'],               'Industry-leading noise canceling, 30-hour battery.'),
  (7, 'Samsung 4K Smart TV',        799.99, 949.99,'electronics','tv',        '📺',  6,'SAM-TV55',  1,4.5,234,  67,'8806092931749','Samsung',      ARRAY['4K QLED','120Hz','HDR10+','Alexa'],       '55" QLED 4K Smart TV, 120Hz, HDR10+, Alexa & Google.'),
  (8, 'Apple Watch Series 9',       399.99, 449.99,'electronics','wearables', '⌚', 28,'APL-WS9',   1,4.7,445, 289,'0194253947209','Apple',       ARRAY['S9 Chip','Blood Oxygen','ECG'],           'S9 chip, brighter display, blood oxygen, ECG, crash detection.'),
  (9, 'Logitech MX Master 3S',       99.99, 119.99,'electronics','acc_elec',  '🖱️', 54,'LOG-MXM3',  1,4.8,892,1234,'5099206097476','Logitech',    ARRAY['Bluetooth','8K DPI','Silent','USB-C'],    'Ultra-precise 8K DPI, silent clicks, USB-C, MagSpeed scroll.'),
  (10,'USB-C Hub 7-in-1',            49.99,  64.99,'electronics','acc_elec',  '🔌',145,'USB-HUB7',  1,4.4,567, 890,'6922202452179','Anker',       ARRAY['4K HDMI','100W PD','USB 3.0'],            '7-in-1: 4K HDMI, 100W PD, 2× USB 3.0, SD/microSD, Ethernet.'),
  -- Clothes
  (11,'Nike Air Max 2024',           179.99, 199.99,'clothes',    'footwear',  '👟', 67,'NKE-AM24',  3,4.5,234, 567,'0036202218766','Nike',        ARRAY['Air Cushion','Breathable','Running'],     'Visible Air unit, breathable mesh, durable rubber outsole.'),
  (12,'Levis 501 Jeans',              89.99, 109.99,'clothes',    'mens',      '👖',112,'LVI-501',   3,4.4,891, 789,'5400537402054','Levis',       ARRAY['100% Cotton','Button Fly','Straight'],    'Classic straight-leg, button fly. Multiple washes.'),
  (13,'Adidas Originals Hoodie',      79.99,  99.99,'clothes',    'mens',      '🧥', 54,'ADI-HOD',   3,4.3,345, 432,'4062064539258','Adidas',      ARRAY['Fleece','Trefoil Logo','8 Colors'],       'Trefoil hoodie, 70% cotton 30% polyester, 8 colors.'),
  (14,'Ray-Ban Wayfarers',           159.99, 189.99,'clothes',    'acc_elec',  '🕶️', 38,'RB-WAY',    3,4.6,156, 234,'8056597013376','Ray-Ban',     ARRAY['UV400','Polarized','Iconic'],             'Classic wayfarer, UV400 protection, polarized lenses.'),
  (15,'Polo Ralph Lauren Shirt',      99.99, 129.99,'clothes',    'mens',      '👔', 78,'PRL-SHT',   3,4.5,289, 456,'3616531234827','Ralph Lauren',ARRAY['Cotton Pique','Embroidered','Slim Fit'],  'Classic fit cotton polo, embroidered pony logo.'),
  (16,'Womens Floral Dress',          69.99,  89.99,'clothes',    'womens',    '👗', 89,'FLR-DRS',   3,4.4,312, 567,'4893005123456','Zara',        ARRAY['Floral','Midi','Chiffon','Summer'],        'Elegant midi floral dress in lightweight chiffon.'),
  (17,'Childrens Sports Set',         34.99,  44.99,'clothes',    'kids_cloth','🧒',145,'KID-SPT',   3,4.6,189, 678,'5907698123489','H&M',         ARRAY['Age 4-14','Quick-Dry','Set of 2'],         '2-piece sportswear set for kids 4-14, quick-dry fabric.'),
  (18,'Traditional Dirac Dress',     119.99, 149.99,'clothes',    'traditional','🪡', 34,'TRD-DRC',  3,4.9,234, 345,'6133002345678','Xariir',      ARRAY['Silk Blend','Hand-Embroidered','Wedding'], 'Traditional Somali dirac, silk blend, hand-embroidered.'),
  -- Home
  (19,'Dyson V15 Vacuum',            749.99, 849.99,'home',       'cleaning',  '🌀', 12,'DYS-V15',   4,4.8,423, 198,'5025155042984','Dyson',       ARRAY['Laser Detection','HEPA','60min'],         'Cordless vacuum, laser dust detection, 60 min battery, HEPA.'),
  (20,'Nespresso Vertuo Plus',       199.99, 229.99,'home',       'kitchen',   '☕', 28,'NSP-VRT',   4,4.7,567, 445,'7630047571008','Nespresso',   ARRAY['Centrifusion','5 Cup Sizes','25s Heat'],  '5 cup sizes, Centrifusion tech, 25s heat-up.'),
  (21,'KitchenAid Stand Mixer',      449.99, 499.99,'home',       'kitchen',   '🍰',  9,'KTA-STD',   4,4.9,712, 312,'0883049162705','KitchenAid',  ARRAY['5qt','10 Speeds','Tilt-Head'],            'Classic stand mixer, 5-quart, 10 speeds.'),
  (22,'Smart LED Strip 5m',           39.99,  49.99,'home',       'lighting',  '💡',156,'SMT-LED',   4,4.3,892,1234,'6941756701234','Govee',       ARRAY['16M Colors','Music Sync','App Control'],  '16M colors, app controlled, music sync, Alexa compatible.'),
  (23,'Air Purifier HEPA',           129.99, 159.99,'home',       'cleaning',  '🌬️', 23,'AIR-HEP',   4,4.6,345, 267,'6955639803278','Levoit',      ARRAY['True HEPA','500sqft','Ultra-Quiet'],      'True HEPA, covers 500 sqft, removes 99.97% particles.'),
  -- Food
  (24,'Organic Green Tea 100g',       24.99,  29.99,'food',       'organic',   '🍵',234,'TEA-GRN',   5,4.5,234, 890,'4987123456789','Ito En',      ARRAY['Ceremonial Grade','Matcha','USDA Organic'],'Premium Japanese Matcha ceremonial grade, 100g tin.'),
  (25,'Whey Protein 2kg',             59.99,  79.99,'food',       'snacks',    '🥛', 89,'PRO-2KG',   5,4.4,567, 678,'0748927051490','Optimum',     ARRAY['25g Protein','Low Fat','80 Servings'],    'Whey protein isolate, 25g protein per serving, 80 servings.'),
  (26,'Manuka Honey 500g',            44.99,  54.99,'food',       'organic',   '🍯', 67,'HON-MNK',   5,4.8,345, 456,'9421902712340','Comvita',     ARRAY['UMF 15+','New Zealand','Raw'],            'UMF 15+ certified pure New Zealand Manuka honey.'),
  (27,'Cold Brew Coffee Kit',         34.99,  44.99,'food',       'beverages', '☕',145,'CBR-KIT',   5,4.6,198, 567,'0617933534235','Chameleon',   ARRAY['Cold Brew','Ethiopian','Organic'],         'Premium cold brew kit, single-origin Ethiopian coffee.'),
  -- Health
  (28,'Vitamin D3 1000IU 365ct',      19.99,  24.99,'health',     'supplements','🌞',312,'VIT-D3',   6,4.6,678,2345,'0032078920118','NatureMade',  ARRAY['Non-GMO','365 Softgels','Immune'],        '365 softgels, immune support, non-GMO, USP Verified.'),
  (29,'Omega-3 Fish Oil 90ct',        29.99,  39.99,'health',     'supplements','🐟',198,'OMG-FO',   6,4.7,456,1567,'0032078420013','NatureMade',  ARRAY['Triple Strength','2400mg','Heart Health'], 'Triple strength 2400mg per serving, heart & brain health.'),
  (30,'Digital BP Monitor',           89.99, 109.99,'health',     'devices',   '❤️', 45,'BPM-DIG',   6,4.5,234, 345,'4975479108069','Omron',       ARRAY['Upper Arm','2-User','120 Readings'],      'Upper arm, 2-user memory, 120 readings, IHB detection.'),
  (31,'First Aid Kit Pro 200pc',      49.99,  64.99,'health',     'first_aid', '🩹',167,'FAK-PRO',   6,4.8,567, 789,'0753950071062','Johnson',     ARRAY['200-Piece','OSHA','Waterproof'],          '200-piece kit, OSHA compliant, waterproof case.'),
  -- Sports
  (32,'Yoga Mat Pro 6mm',             79.99,  99.99,'sports',     'yoga_fit',  '🧘', 78,'YGA-MAT',   3,4.6,456, 567,'0718122367943','Manduka',     ARRAY['6mm Thick','Non-Slip','TPE'],             'Extra thick 6mm, non-slip TPE, alignment lines.'),
  (33,'Speed Jump Rope',              29.99,  39.99,'sports',     'gym',       '🪢',145,'JMP-SPD',   3,4.4,234, 789,'0810021523174','WOD Nation',  ARRAY['Ball Bearings','Adjustable','Steel Cable'],'Adjustable, ball bearing handles, all fitness levels.'),
  (34,'Resistance Bands Set 5pc',     49.99,  69.99,'sports',     'gym',       '💪', 89,'RES-BND',   3,4.5,567, 678,'0819121020490','Fit Simplify',ARRAY['5 Levels','Loop Bands','Latex'],         '5 resistance levels, handles, ankle straps, door anchor.'),
  (35,'Insulated Water Bottle 1L',    34.99,  44.99,'sports',     'outdoor',   '🍶',167,'WTR-BTL',   4,4.7,892,1234,'0842501138889','Hydro Flask', ARRAY['Stainless Steel','24h Cold','BPA Free'],  'Stainless steel 1L, cold 24h / hot 12h, leak-proof.'),
  -- Medicine
  (36,'Paracetamol 500mg 100ct',       8.99,  12.99,'medicine',   'otc',       '💊',500,'PCM-500',   6,4.7,1234,4567,'5011309076302','Panadol',    ARRAY['500mg','Pain Relief','Fever','100 Tabs'],  'Paracetamol for pain relief and fever, 100 tablets.'),
  (37,'Ibuprofen 400mg 48ct',          7.99,  10.99,'medicine',   'otc',       '💊',345,'IBU-400',   6,4.6,987, 3456,'5000158076036','Nurofen',    ARRAY['400mg','Anti-inflammatory','Pain'],        'Fast acting ibuprofen for pain and inflammation, 48 tablets.'),
  (38,'Vitamin C 1000mg 60ct',        14.99,  18.99,'medicine',   'vitamins',  '🍊',423,'VTC-1G',    6,4.8,1567,5678,'0312547890123','Centrum',    ARRAY['1000mg','Immune','Antioxidant','Timed'],   'High strength Vitamin C with rose hips, immune support.'),
  (39,'Digital Thermometer',          19.99,  24.99,'medicine',   'equipment', '🌡️',234,'TMP-DIG',   6,4.6,678, 1234,'4043702123456','Braun',      ARRAY['10sec Result','Fever Alert','Memory'],    'Fast 10-second reading, fever alert, 9-reading memory.'),
  (40,'ORS Sachets 10pk',              6.99,   9.99,'medicine',   'otc',       '🧂',678,'ORS-SAC',   6,4.9,2345,8901,'5010162004567','Dioralyte',  ARRAY['Rehydration','Lemon','10 Sachets'],       'ORS with electrolytes, lemon flavour, 10 sachets.'),
  -- Cosmetics
  (41,'CeraVe Moisturizing Cream',    24.99,  29.99,'cosmetics',  'skincare',  '🧴',234,'CVE-MCR',   6,4.8,3456,7890,'0301872152105','CeraVe',     ARRAY['3 Ceramides','Hyaluronic Acid','Fragrance-Free'],'Moisturizing cream, 3 ceramides, hyaluronic acid, 16oz.'),
  (42,'LOreal Mascara Lash Paradise', 16.99,  21.99,'cosmetics',  'makeup',    '👁️',189,'LOR-MSC',   6,4.5,2134,5678,'3600523289462','LOreal',     ARRAY['Volumizing','Lengthening','Waterproof'],  'Volumizing & lengthening mascara with soft wavy brush.'),
  (43,'Dove Shampoo Nourishing 1L',   12.99,  15.99,'cosmetics',  'haircare',  '🚿',312,'DOV-SHP',   6,4.6,1678,4321,'8710908157783','Dove',       ARRAY['Nourishing','Keratin','Sulfate-Free'],    'Nourishing shampoo with keratin and silk proteins, 1L.'),
  (44,'Nivea Men After Shave',        11.99,  14.99,'cosmetics',  'mens_groom','🪒',267,'NIV-ASH',   6,4.4,987, 2345,'4005808151387','Nivea',      ARRAY['Sensitive','No Alcohol','Moisturizing'],  'Sensitive after shave, alcohol-free, cools & moisturizes.'),
  (45,'OPI Nail Polish Set 12pc',     39.99,  49.99,'cosmetics',  'nail',      '💅', 78,'OPI-NPS',   6,4.7,567, 1234,'0619828095404','OPI',        ARRAY['Chip Resistant','Quick Dry','12 Colors'], '12-piece nail polish, chip resistant, quick-dry.'),
  -- Construction  
  (46,'Makita 18V Drill Set',        189.99, 229.99,'construction','tools',    '🔧', 34,'MKT-DRL',   4,4.8,456,  234,'0088381623919','Makita',     ARRAY['18V','2 Batteries','Brushless'],          '18V LXT brushless drill set, 2 batteries and charger.'),
  (47,'Cement 50kg Portland',         14.99,  17.99,'construction','materials','🧱',234,'CMT-50K',   4,4.5,123,  890,'6131201234567','SABCO',      ARRAY['Portland','50kg','Grade 42.5'],           'Portland cement Grade 42.5, 50kg bag, high strength.'),
  (48,'Safety Helmet + Vest Kit',     29.99,  39.99,'construction','safety',   '🦺',145,'SAF-KIT',   4,4.7,234,  567,'6933456789012','Portwest',   ARRAY['EN397','Hi-Vis','Adjustable','PPE'],      'CE certified safety helmet and hi-vis vest.'),
  (49,'Paint Roller Set 9in',         22.99,  29.99,'construction','paint',    '🎨',189,'PNT-RLS',   4,4.3,178,  456,'5017003123450','Ronseal',    ARRAY['9 Inch','Smooth Finish','Tray Included'], '9" roller set with tray, lint-free for smooth finish.'),
  (50,'Circuit Breaker 32A MCB',      12.99,  16.99,'construction','electrical','⚡',267,'MCB-32A',  4,4.6,345,  789,'3250610234567','Schneider',  ARRAY['32A','10kA','Type B','DIN Rail'],         '32A type B MCB, 10kA breaking capacity, DIN rail.'),
  -- Furniture
  (51,'Ergonomic Office Chair',      299.99, 399.99,'furniture',  'office_furn','🪑', 23,'CHR-ERG',  4,4.7,678,  234,'6936234567890','Hbada',      ARRAY['Lumbar Support','Mesh','140 Recline'],    'Ergonomic mesh chair, lumbar support, adjustable armrests.'),
  (52,'6-Drawer Chest Dresser',      249.99, 319.99,'furniture',  'bedroom',   '🛏️', 12,'DRS-6DR',  4,4.5,234,  123,'7896543210987','IKEA',       ARRAY['6 Drawers','Pine Wood','Anti-Tip'],       'Solid pine 6-drawer dresser, dovetail joints.'),
  (53,'3-Seater Fabric Sofa',        699.99, 899.99,'furniture',  'living',    '🛋️',  8,'SFA-3ST',  4,4.6,156,   67,'5789654321098','Ashley',     ARRAY['3-Seater','Fabric','Removable Cushions'], '3-seater fabric sofa, hardwood frame, removable covers.'),
  (54,'6-Person Dining Set',         549.99, 699.99,'furniture',  'kitchen_furn','🪑', 6,'DNG-6PS', 4,4.4,123,   45,'4561237890123','Wayfair',    ARRAY['6-Person','Oak Veneer','Extension'],      'Extending dining table and 6 padded chairs.'),
  (55,'5-Tier Bookshelf Unit',        89.99, 119.99,'furniture',  'storage',   '📚', 34,'BSH-5TR',  4,4.5,345,  234,'3210987654321','SONGMICS',   ARRAY['5 Tiers','Metal Frame','100kg Load'],     '5-tier industrial bookshelf, metal frame, MDF boards.'),
  -- Cars / Automotive
  (56,'Dash Cam 4K Front+Rear',      129.99, 159.99,'cars',       'car_elec',  '📷', 45,'DSH-4K2',  4,4.6,567,  345,'6950153568731','Vantrue',    ARRAY['4K Front','1080P Rear','Night Vision','GPS'],'4K front + 1080P rear dash cam, night vision, GPS.'),
  (57,'Car Phone Mount Magnetic',     19.99,  24.99,'cars',       'car_acc',   '📱',234,'PHN-MNT',  4,4.5,1234,3456,'6937295342589','iOttie',    ARRAY['Magnetic','360 Degree','Dashboard'],      'Strong magnetic car mount, 360° rotation.'),
  (58,'Car Jump Starter 2000A',       89.99, 119.99,'cars',       'car_tools', '⚡', 34,'JMP-2KA',  4,4.7,456,  234,'6972365820391','NOCO',       ARRAY['2000A','8L Engine','USB-C','LED'],        '2000A jump starter, 8L engine, USB-C powerbank.'),
  (59,'Tire Pressure Gauge Digital',  24.99,  34.99,'cars',       'car_tools', '🛞',145,'TPG-DIG',  4,4.4,678,  890,'0718122394018','JACO',       ARRAY['Digital','150 PSI','Backlit'],            'Digital tire gauge 150 PSI, backlit, car/truck/bike.'),
  -- Books
  (60,'Rich Dad Poor Dad',            14.99,  18.99,'books',      'business_bk','📗',234,'BK-RDPD', 5,4.8,4567,8901,'9780743255561','Kiyosaki',  ARRAY['Bestseller','Personal Finance','Investing'],'Kiyosaki''s #1 personal finance book, 25th anniversary.'),
  (61,'Atomic Habits',                16.99,  22.99,'books',      'nonfiction', '📘',189,'BK-ATMT', 5,4.9,8901,12345,'9780735211292','James Clear',ARRAY['Self-Help','Habits','Productivity'],'James Clear''s framework for building good habits.'),
  (62,'Holy Quran English',           29.99,  39.99,'books',      'religious',  '📿',145,'BK-QREN', 5,5.0,3456,5678,'9789670526705','Darussalam', ARRAY['Arabic-English','Hardcover','Color Coded'],'Arabic text with English translation, color coded.'),
  (63,'Somali Language Textbook',     24.99,  34.99,'books',      'education',  '📖', 78,'BK-SMTX', 5,4.7,234,  567,'9789990000123','Dawan Press',ARRAY['Somali','A1-B2','Audio CD'],              'Comprehensive Somali language course A1-B2.'),
  (64,'Childrens Story Bundle 5pk',   34.99,  44.99,'books',      'childrens',  '🧸',167,'BK-KID5', 5,4.8,678, 1234,'9780241456781','Penguin',    ARRAY['Ages 3-8','Illustrated','5 Books'],       '5-book illustrated bundle for ages 3-8.'),
  (65,'Python Programming Crash',     39.99,  49.99,'books',      'education',  '💻', 89,'BK-PY3',  5,4.7,1234,2345,'9781718502703','No Starch',  ARRAY['Python 3','Beginner','Projects'],         'Fast-paced Python 3 introduction with projects.')
ON CONFLICT (id) DO NOTHING;


-- ============================================================
-- 10. SEED — NOTIFICATIONS
-- ============================================================

INSERT INTO notifications (type, title, message, time_ago, read, icon) VALUES
  ('stock',    'Low Stock Alert',   'MacBook Air M3 has only 8 units left',    '5m ago',  false, '📦'),
  ('order',    'New Order',         'ORD-003 — Mohamed Ali — $1,299.99',       '12m ago', false, '🛍️'),
  ('stock',    'Low Stock Alert',   'Samsung 4K TV has only 6 units left',     '1h ago',  false, '📦'),
  ('supplier', 'Supplier Deal',     'PharmaTrade — 30% off this week only!',   '2h ago',  true,  '🚚'),
  ('payment',  'Payment Confirmed', 'Waafi payment of $1,499.97 received',     '3h ago',  true,  '✅'),
  ('stock',    'Restocked',         'Nike Air Max — 67 units now available',   '5h ago',  true,  '📦')
ON CONFLICT DO NOTHING;


-- ============================================================
-- 11. FIX SEQUENCES
-- OVERRIDING SYSTEM VALUE bypasses SERIAL auto-increment.
-- This resets all sequences to continue from the correct next id.
-- ============================================================

SELECT setval('products_id_seq',      COALESCE((SELECT MAX(id) FROM products),      0), true);
SELECT setval('suppliers_id_seq',     COALESCE((SELECT MAX(id) FROM suppliers),     0), true);
SELECT setval('notifications_id_seq', COALESCE((SELECT MAX(id) FROM notifications), 0), true);
