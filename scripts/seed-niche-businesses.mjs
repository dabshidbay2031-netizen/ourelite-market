/**
 * Seed 25 niche businesses + the wholesale suppliers they source from.
 *
 * For every niche this creates:
 *   • 1 WHOLESALE SUPPLIER account (account_type 'supplier') that OWNS a
 *     25-item catalog (products.supplier_id = supplier.id), each product
 *     carrying 3 real, on-theme photos.
 *   • 1 BUSINESS account (account_type 'business') that CLAIMS all 25 of
 *     that supplier's products via the business_products table (the formal
 *     "this shop sources these items from that supplier" link), each with
 *     its own retail price + stock.
 *
 * Totals: 25 suppliers + 25 businesses (50 auth users), 625 catalog
 * products, 625 business_products claim rows.
 *
 * Everything is written with the SERVICE-ROLE client (bypasses RLS and the
 * requireStaff API guards). Re-running is safe: auth users are reused, and a
 * supplier that already has products is skipped.
 *
 * Run (no dev server needed):
 *   node scripts/seed-niche-businesses.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

/* ── env ──────────────────────────────────────────────────────────── */
const env = {};
for (const line of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const PASSWORD = 'Mogarenta2026!';
const CITIES = ['Mogadishu', 'Hargeisa', 'Bosaso', 'Kismayo', 'Garowe', 'Berbera', 'Baidoa', 'Galkayo'];

/* A real, on-theme photo by keyword. `lock` keeps each URL stable + distinct
   so a product always shows the same 3 images. The app's <ProductImage>
   falls back to an SVG placeholder if a URL ever fails to load. */
const photo = (kw, lock) => `https://loremflickr.com/600/600/${encodeURIComponent(kw)}?lock=${lock}`;

/* ── 25 niches × 25 product names ─────────────────────────────────── */
const NICHES = [
  { key: 'pharmacy', biz: 'City Care Pharmacy', sup: 'MediSource Wholesale', icon: '💊', cat: 'medicine', sub: 'supplements', kw: 'medicine,pharmacy,pills', brand: 'MediSource',
    items: ['Paracetamol 500mg (100 tabs)','Ibuprofen 400mg (50 tabs)','Amoxicillin 250mg Caps','Vitamin C 1000mg','Multivitamin Daily','Cough Syrup 200ml','Antacid Chewables','ORS Rehydration Salts','Hand Sanitizer 500ml','Digital Thermometer','Blood Pressure Monitor','Adhesive Bandages (100)','Antiseptic Cream 30g','Allergy Relief Tablets','Omeprazole 20mg','Calcium + D3','Iron Supplement','Zinc Lozenges','Eye Drops 10ml','Burn Relief Gel','First Aid Kit','Glucose Tablets','Nasal Spray 15ml','Pain Relief Patches','Pregnancy Test Kit'] },

  { key: 'restaurant', biz: 'Saffron Family Restaurant', sup: 'FreshKitchen Supplies Co.', icon: '🍽️', cat: 'food', sub: 'packaged', kw: 'restaurant,food,meal', brand: 'FreshKitchen',
    items: ['Basmati Rice 5kg','Cooking Oil 5L','Tomato Paste Tin','Mixed Spices Pack','Chicken Stock Cubes','Pasta 1kg','Chickpeas 2kg','Lentils 2kg','Wheat Flour 10kg','Sugar 2kg','Tea Leaves 500g','Coffee Beans 1kg','Coconut Milk Tin','Curry Powder 200g','Black Pepper 100g','Sea Salt 1kg','Garlic Paste Jar','Ginger Paste Jar','Vinegar 1L','Soy Sauce 500ml','Honey 500g','Dates 1kg','Olive Oil 1L','Cardamom 100g','Saffron 5g'] },

  { key: 'bakery', biz: 'Golden Crust Bakery', sup: 'BakeWell Ingredients Ltd.', icon: '🥐', cat: 'food', sub: 'snacks', kw: 'bakery,bread,pastry', brand: 'BakeWell',
    items: ['Sourdough Loaf','Whole Wheat Bread','Croissant (6 pack)','Cinnamon Rolls','Chocolate Muffins','Baguette','Dinner Rolls (12)','Banana Bread','Cheese Danish','Glazed Donuts (6)','Birthday Cake 1kg','Cupcakes (12)','Apple Pie','Bagels (6)','Brownies (9)','Shortbread Cookies','Pita Bread (10)','Pretzels (6)','Fruit Tart','Eclairs (4)','Focaccia','Pizza Dough Balls','Naan Bread (5)','Sponge Cake','Almond Biscotti'] },

  { key: 'convenience', biz: 'QuickStop Convenience', sup: 'DailyGoods Distributors', icon: '🏪', cat: 'food', sub: 'packaged', kw: 'grocery,convenience,store', brand: 'DailyGoods',
    items: ['Bottled Water 1.5L','Cola Can (330ml)','Potato Chips','Chocolate Bar','Instant Noodles','Energy Drink','Chewing Gum','Biscuits Pack','Canned Beans','Long-life Milk 1L','Eggs (12)','Bread Loaf','Toilet Paper (4)','Dish Soap 500ml','Laundry Powder 1kg','Batteries AA (4)','Phone Top-up Card','Matches Box','Candles (6)','Salt 500g','Sugar 1kg','Tea Bags (50)','Instant Coffee 100g','Peanut Butter','Jam 340g'] },

  { key: 'electronics', biz: 'TechHub Electronics', sup: 'GadgetLine Wholesale', icon: '📱', cat: 'electronics', sub: 'phones', kw: 'electronics,gadget,technology', brand: 'GadgetLine',
    items: ['Smartphone 128GB','Bluetooth Speaker','Wireless Earbuds','Power Bank 20000mAh','USB-C Cable 2m','Phone Charger 25W','HDMI Cable 2m','Wireless Mouse','Mechanical Keyboard','Webcam 1080p','LED Desk Lamp','Smart Watch','Tablet 10"','Laptop Stand','Surge Protector','Memory Card 128GB','USB Flash Drive 64GB','Earphones Wired','Phone Holder','Screen Protector','Extension Cord','Router Dual-Band','Smart Bulb','Car Charger','Headphone Splitter'] },

  { key: 'mobileshop', biz: 'CallPoint Mobile Shop', sup: 'MobileParts Wholesale', icon: '📲', cat: 'electronics', sub: 'acc_elec', kw: 'smartphone,mobile,phone', brand: 'MobileParts',
    items: ['Phone Screen Glass','Replacement Battery','Charging Port Flex','Back Cover Case','Tempered Glass','SIM Tray','Camera Lens Glass','Vibration Motor','Earpiece Speaker','Loudspeaker Module','Volume Button Flex','Power Button Flex','Display Assembly','Touch Digitizer','Phone Frame','Sticker Adhesive','Repair Tool Kit','Suction Cup Tool','Pry Spudger Set','Precision Screwdriver','SIM Ejector Pin','Phone Stand','Pop Socket','Lanyard Strap','Anti-dust Plug'] },

  { key: 'boutique', biz: 'Elegance Clothing Boutique', sup: 'StyleSource Apparel', icon: '👗', cat: 'clothes', sub: 'womens', kw: 'clothing,fashion,boutique', brand: 'StyleSource',
    items: ['Floral Maxi Dress','Cotton T-Shirt','Denim Jeans','Linen Shirt','Knit Sweater','Pleated Skirt','Blazer Jacket','Hoodie','Chino Trousers','Summer Blouse','Cardigan','Polo Shirt','Jumpsuit','Leggings','Wrap Dress','Formal Shirt','Casual Shorts','Tank Top','Maxi Abaya','Pashmina Scarf','Leather Belt','Sun Hat','Pajama Set','Raincoat','Evening Gown'] },

  { key: 'shoestore', biz: 'StepUp Shoe Store', sup: 'Footwear Trading Co.', icon: '👟', cat: 'clothes', sub: 'footwear', kw: 'shoes,sneakers,footwear', brand: 'Footwear Trading',
    items: ['Running Sneakers','Leather Loafers','Canvas Shoes','Sandals','Formal Oxfords','High-top Sneakers','Flip Flops','Ankle Boots','Ballet Flats','Slip-on Shoes','Hiking Boots','Court Heels','Espadrilles','Moccasins','Slippers','Wedge Sandals','Football Cleats','Derby Shoes','Platform Sneakers','Rain Boots','Kids Sneakers','Driving Shoes','Gladiator Sandals','Brogues','Trail Runners'] },

  { key: 'hardware', biz: 'BuildRight Hardware', sup: 'ConstructPro Supplies', icon: '🔧', cat: 'construction', sub: null, kw: 'hardware,tools,construction', brand: 'ConstructPro',
    items: ['Claw Hammer','Screwdriver Set','Cordless Drill','Measuring Tape 5m','Spirit Level','Adjustable Wrench','Pliers Set','Utility Knife','Hand Saw','Paint Roller Set','Wood Screws (200)','Wall Anchors (100)','Masking Tape','PVC Pipe 2m','Padlock','Door Hinges (4)','LED Work Light','Safety Goggles','Work Gloves','Sandpaper Pack','Wood Glue 500ml','Silicone Sealant','Nail Assortment','Chisel Set','Tool Box'] },

  { key: 'furniture', biz: 'HomeComfort Furniture', sup: 'WoodWorks Wholesale', icon: '🪑', cat: 'furniture', sub: null, kw: 'furniture,interior,home', brand: 'WoodWorks',
    items: ['Office Chair','Dining Table','Wooden Bookshelf','Queen Bed Frame','Sofa 3-Seater','Coffee Table','Wardrobe 2-Door','TV Stand','Bar Stool (2)','Study Desk','Nightstand','Shoe Cabinet','Accent Armchair','Dresser','Dining Chairs (4)','Console Table','Ottoman Stool','Bunk Bed','Sideboard','Recliner Chair','Folding Table','Bench Seat','Display Cabinet','Bed Headboard','Corner Shelf'] },

  { key: 'autoparts', biz: 'DriveLine Auto Parts', sup: 'AutoZone Distributors', icon: '🚗', cat: 'cars', sub: null, kw: 'car,auto,parts', brand: 'AutoZone',
    items: ['Engine Oil 4L','Oil Filter','Air Filter','Brake Pads Set','Spark Plugs (4)','Wiper Blades Pair','Car Battery 12V','Headlight Bulb','Fan Belt','Radiator Coolant 2L','Brake Fluid 1L','Cabin Filter','Fuel Filter','Tyre Inflator','Jump Leads','Car Floor Mats','Seat Covers Set','Steering Cover','Tow Rope','Car Vacuum','Phone Mount','Tyre Pressure Gauge','Microfibre Cloths','Car Shampoo 1L','Touch-up Paint'] },

  { key: 'bookstore', biz: 'PageTurner Bookstore', sup: 'BookHouse Wholesale', icon: '📚', cat: 'books', sub: null, kw: 'books,bookstore,reading', brand: 'BookHouse',
    items: ['Bestseller Novel','Children Picture Book','English Dictionary','Notebook A5','Quran with Translation','Cookbook','Science Textbook','Atlas of the World','Coloring Book','Self-Help Guide','Poetry Collection','History Hardcover','Biography','Travel Guide','Sticker Activity Book','Graph Notebook','Sketchbook','Crossword Puzzle Book','Comic Graphic Novel','Business Paperback','Language Phrasebook','Kids Storybook Set','Planner 2026','Encyclopedia Volume','Religious Study Book'] },

  { key: 'sports', biz: 'PeakPerformance Sports', sup: 'SportGear Wholesale', icon: '⚽', cat: 'sports', sub: null, kw: 'sports,fitness,gym', brand: 'SportGear',
    items: ['Football Size 5','Basketball','Yoga Mat','Dumbbell Set 10kg','Skipping Rope','Resistance Bands','Water Bottle 1L','Gym Gloves','Running Shorts','Tennis Racket','Badminton Set','Cricket Bat','Shin Guards','Football Boots','Swimming Goggles','Foam Roller','Kettlebell 8kg','Pull-up Bar','Cycling Helmet','Sports Backpack','Whistle','Cones Set (10)','Boxing Gloves','Jump Box','Weightlifting Belt'] },

  { key: 'beauty', biz: 'Glow Beauty Shop', sup: 'CosmeticsHub Wholesale', icon: '💄', cat: 'cosmetics', sub: 'personal', kw: 'cosmetics,makeup,beauty', brand: 'CosmeticsHub',
    items: ['Matte Lipstick','Foundation 30ml','Mascara','Eyeshadow Palette','Face Moisturizer','Sunscreen SPF50','Micellar Water','Nail Polish Set','Makeup Brush Set','Concealer','Setting Powder','Blush','Eyeliner Pen','Lip Gloss','Face Mask Sheets','Perfume 50ml','Body Lotion','Hair Serum','Makeup Remover','Cotton Pads','Hand Cream','Cleansing Foam','Toner 200ml','Eyebrow Pencil','Highlighter Stick'] },

  { key: 'supermarket', biz: 'MegaMart Supermarket', sup: 'BulkFoods Distributors', icon: '🛒', cat: 'food', sub: 'fresh', kw: 'supermarket,grocery,food', brand: 'BulkFoods',
    items: ['Rice 25kg','Sugar 10kg','Cooking Oil 10L','Wheat Flour 25kg','Pasta Carton','Canned Tomatoes (12)','Powdered Milk 2.5kg','Tea 1kg','Dish Detergent 5L','Laundry Soap (10)','Bottled Water (12)','Soft Drinks Crate','Biscuit Carton','Salt 10kg','Lentils 5kg','Beans 5kg','Tomato Paste Box','Tuna Cans (24)','Soap Bars (12)','Tissue Box (10)','Honey 2kg','Dates Box 5kg','Spaghetti (20)','Instant Noodles (40)','Vinegar 5L'] },

  { key: 'butcher', biz: 'Prime Cut Butchery', sup: 'MeatSupply Wholesale', icon: '🥩', cat: 'food', sub: 'fresh', kw: 'butcher,meat,beef', brand: 'MeatSupply',
    items: ['Beef Steak 1kg','Lamb Chops 1kg','Minced Beef 1kg','Chicken Whole','Chicken Breast 1kg','Goat Meat 1kg','Beef Ribs 1kg','Lamb Leg','Chicken Wings 1kg','Beef Liver 500g','Sausages 1kg','Beef Burgers (8)','Kebab Skewers','Camel Meat 1kg','Chicken Drumsticks','Beef Bones 1kg','Marinated Chicken','Lamb Mince 1kg','Beef Cubes 1kg','Turkey Breast','Smoked Beef','Chicken Gizzards','Oxtail 1kg','Beef Tenderloin','Mixed Grill Pack'] },

  { key: 'coffeeshop', biz: 'Aroma Coffee House', sup: 'BeanBrew Suppliers', icon: '☕', cat: 'food', sub: 'beverages', kw: 'coffee,cafe,espresso', brand: 'BeanBrew',
    items: ['Espresso Beans 1kg','Arabica Beans 1kg','Ground Coffee 500g','Decaf Beans 1kg','Hot Chocolate Mix','Chai Tea Mix','Vanilla Syrup 1L','Caramel Syrup 1L','Paper Cups (50)','Cup Lids (50)','Stirrers (200)','Whipped Cream Can','Oat Milk 1L','Coffee Filters (100)','Matcha Powder 250g','Cinnamon Powder','Sugar Sachets (500)','Napkins (500)','To-go Trays (50)','Iced Tea Mix','Cocoa Powder 500g','Brown Sugar 1kg','Cold Brew Concentrate','Frappe Mix 1kg','Honey Sticks (100)'] },

  { key: 'toystore', biz: 'FunZone Toy Store', sup: 'PlayWorld Wholesale', icon: '🧸', cat: 'other', sub: null, kw: 'toys,kids,play', brand: 'PlayWorld',
    items: ['Building Blocks Set','Teddy Bear','Toy Car','Doll House','Puzzle 100pc','Action Figure','Board Game','Remote Control Car','Plush Animal','Play-Doh Set','Toy Train','Kite','Yo-Yo','Skipping Rope','Water Gun','Coloring Set','Stacking Rings','Toy Kitchen','Marble Run','Dinosaur Figures','Spinning Top','Bubble Maker','Toy Robot','Card Game','Building Bricks 500pc'] },

  { key: 'petstore', biz: 'Happy Paws Pet Store', sup: 'PetSupply Wholesale', icon: '🐾', cat: 'other', sub: null, kw: 'pet,dog,cat', brand: 'PetSupply',
    items: ['Dog Food 5kg','Cat Food 4kg','Pet Bowl','Dog Leash','Cat Litter 10L','Chew Toys','Pet Shampoo','Bird Seed 2kg','Fish Food','Dog Collar','Pet Bed','Scratching Post','Aquarium Filter','Pet Carrier','Flea Treatment','Dog Treats','Cat Treats','Grooming Brush','Pet Vitamins','Hamster Cage','Dog Chew Bone','Litter Scoop','Pet Nail Clipper','Bird Cage','Fish Tank 20L'] },

  { key: 'stationery', biz: 'WriteWell Stationery', sup: 'OfficePlus Wholesale', icon: '✏️', cat: 'books', sub: null, kw: 'stationery,office,supplies', brand: 'OfficePlus',
    items: ['Ballpoint Pens (50)','Pencils HB (12)','A4 Paper Ream','Stapler','Sticky Notes','File Folders (10)','Highlighters (6)','Whiteboard Marker','Glue Stick (5)','Scissors','Ruler 30cm','Calculator','Notebook Pack','Paper Clips (100)','Binder Clips','Correction Tape','Eraser (10)','Sharpener','Envelopes (50)','Index Cards','Desk Organizer','Printer Ink','Tape Dispenser','Hole Punch','Document Wallet'] },

  { key: 'jewelry', biz: 'Luster Jewelry Store', sup: 'GemTrade Wholesale', icon: '💍', cat: 'other', sub: null, kw: 'jewelry,gold,accessories', brand: 'GemTrade',
    items: ['Gold Necklace','Silver Ring','Pearl Earrings','Bangle Set','Pendant Chain','Charm Bracelet','Stud Earrings','Anklet','Brooch','Cufflinks','Wedding Band','Gemstone Ring','Hoop Earrings','Layered Necklace','Watch Bracelet','Nose Pin','Toe Ring','Beaded Bracelet','Choker','Ear Cuffs','Tennis Bracelet','Signet Ring','Locket','Chain Anklet','Jewelry Box'] },

  { key: 'homedecor', biz: 'Casa Home Décor', sup: 'DecorTrend Wholesale', icon: '🖼️', cat: 'home', sub: 'decor', kw: 'home,decor,interior', brand: 'DecorTrend',
    items: ['Scented Candle Set','Wall Clock','Throw Pillow','Picture Frame','Table Lamp','Area Rug','Vase Ceramic','Wall Art Print','Fairy Lights','Curtain Panel','Mirror Round','Artificial Plant','Storage Basket','Coasters Set','Photo Wall Set','Tablecloth','Cushion Cover','Candle Holder','Aroma Diffuser','Wall Shelf','Door Mat','Bookends','Decorative Bowl','Lantern','Macrame Hanging'] },

  { key: 'nursery', biz: 'GreenLeaf Plant Nursery', sup: 'GardenGrow Suppliers', icon: '🌱', cat: 'home', sub: 'garden', kw: 'plants,garden,nursery', brand: 'GardenGrow',
    items: ['Indoor Succulent','Snake Plant','Potting Soil 10L','Ceramic Plant Pot','Watering Can','Garden Trowel','Plant Fertilizer','Hanging Planter','Seeds Variety Pack','Pruning Shears','Garden Gloves','Cactus Mix','Aloe Vera Plant','Bonsai Tree','Plant Stand','Spray Bottle','Herb Seedlings','Garden Hose 15m','Plant Food Sticks','Terracotta Pot Set','Moss Pole','Garden Rake','Bamboo Stakes','Flower Bulbs','Compost Bag 5kg'] },

  { key: 'optical', biz: 'ClearView Optical', sup: 'OptiCare Wholesale', icon: '👓', cat: 'health', sub: null, kw: 'glasses,optical,eyewear', brand: 'OptiCare',
    items: ['Reading Glasses +1.5','Sunglasses UV400','Blue-Light Glasses','Eyeglass Frame','Contact Lens Solution','Lens Cleaning Kit','Glasses Case','Anti-fog Spray','Sports Sunglasses','Kids Glasses Frame','Bifocal Readers','Microfibre Wipes','Eye Mask','Magnifying Glass','Lens Wipes (50)','Eyeglass Chain','Polarized Sunglasses','Nose Pads Set','Screwdriver Repair Kit','Goggles Swimming','Safety Glasses','Photochromic Lens','Glasses Strap','Sunglass Clip-on','Lens Spray 100ml'] },

  { key: 'mobileacc', biz: 'GearUp Mobile Accessories', sup: 'AccessLine Wholesale', icon: '🎧', cat: 'electronics', sub: 'acc_elec', kw: 'phone,accessories,charger', brand: 'AccessLine',
    items: ['Fast Charger 33W','USB-C to USB-C Cable','Lightning Cable','Wireless Charger Pad','Phone Case Clear','Phone Ring Holder','Car Phone Mount','Selfie Stick','Bluetooth Headset','Earbud Tips Set','Cable Organizer','Phone Grip Strap','Tablet Case','Stylus Pen','Phone Cooling Fan','Tripod Stand','Memory Card Reader','OTG Adapter','Power Strip USB','Earphone Case','Phone Wallet Case','Magnetic Mount','Charging Dock','Screen Cleaner Kit','Gaming Trigger'] },
];

/* ── helpers ──────────────────────────────────────────────────────── */
const round2 = (n) => Math.round(n * 100) / 100;
const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

async function nextId(table) {
  const { data } = await sb.from(table).select('id').order('id', { ascending: false }).limit(1).maybeSingle();
  return ((data?.id) || 0) + 1;
}

async function ensureAuthUser(email, name) {
  const { data, error } = await sb.auth.admin.createUser({
    email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: name },
  });
  if (!error) return data.user.id;
  // already exists → find + reset password
  let page = 1, found = null;
  while (page <= 20 && !found) {
    const { data: list } = await sb.auth.admin.listUsers({ page, perPage: 200 });
    found = list.users.find((u) => u.email === email);
    if (!list.users.length || list.users.length < 200) break;
    page++;
  }
  if (!found) throw new Error(`auth create failed and not found: ${email}: ${error.message}`);
  await sb.auth.admin.updateUserById(found.id, { password: PASSWORD, email_confirm: true });
  return found.id;
}

async function ensureSupplier({ id, name, authUserId, accountType, icon, cat, city, slug, desc }) {
  const { data: existing } = await sb.from('suppliers').select('id').eq('auth_user_id', authUserId).maybeSingle();
  if (existing) return { id: existing.id, created: false };
  const row = {
    id, name, rating: round2(4 + Math.random()), reviews: 10 + Math.floor(Math.random() * 200),
    location: city, min_order: accountType === 'supplier' ? 50 : 0,
    categories: [cat], icon, description: desc, product_ids: [],
    discount: 0, delivery_days: '2-4', verified: true, badge: accountType === 'supplier' ? 'Wholesaler' : 'Verified',
    bio: desc, contact_numbers: [], auth_user_id: authUserId, slug,
    account_type: accountType, approval_status: 'approved',
  };
  const { error } = await sb.from('suppliers').insert(row);
  if (error) throw new Error(`supplier insert ${name}: ${error.message}`);
  return { id, created: true };
}

/* ── main ─────────────────────────────────────────────────────────── */
console.log('\n🌱  Seeding 25 niche businesses + suppliers...\n');

let supId = await nextId('suppliers');
let prodId = await nextId('products');
let bpId   = await nextId('business_products');

const creds = [];
let nIdx = 0;

for (const niche of NICHES) {
  const city = CITIES[nIdx % CITIES.length];
  nIdx++;
  try {
    /* 1. wholesale supplier (the source) */
    const supEmail = `sup.${niche.key}@mogarenta.com`;
    const supUid   = await ensureAuthUser(supEmail, niche.sup);
    const supplier = await ensureSupplier({
      id: supId, name: niche.sup, authUserId: supUid, accountType: 'supplier',
      icon: niche.icon, cat: niche.cat, city, slug: slugify(niche.sup),
      desc: `Wholesale supplier of ${niche.biz.split(' ').slice(-1)[0].toLowerCase()} goods.`,
    });
    if (supplier.created) supId++;

    /* 2. business (the retailer) */
    const bizEmail = `biz.${niche.key}@mogarenta.com`;
    const bizUid   = await ensureAuthUser(bizEmail, niche.biz);
    const business = await ensureSupplier({
      id: supId, name: niche.biz, authUserId: bizUid, accountType: 'business',
      icon: niche.icon, cat: niche.cat, city, slug: slugify(niche.biz),
      desc: `${niche.biz} — your local ${niche.key} store.`,
    });
    if (business.created) supId++;

    /* 3. catalog products owned by the supplier (skip if already seeded) */
    const { count: existingCount } = await sb.from('products')
      .select('id', { count: 'exact', head: true }).eq('supplier_id', supplier.id);

    const productRows = [];
    if ((existingCount ?? 0) === 0) {
      niche.items.forEach((nm, i) => {
        const wholesale = round2(((i * 7 + 5) % 45) + 1.5 + 0.49);
        const lock = supplier.id * 1000 + i;
        productRows.push({
          id: prodId++,
          name: nm,
          price: wholesale,
          original_price: round2(wholesale * 1.25),
          category: niche.cat,
          sub_category: niche.sub,
          icon: niche.icon,
          stock: 25 + ((i * 11) % 200),
          sku: `${niche.key.toUpperCase()}-${String(i + 1).padStart(3, '0')}`,
          supplier_id: supplier.id,
          rating: round2(3.8 + Math.random() * 1.2),
          reviews: Math.floor(Math.random() * 80),
          sold: (i * 13 + 7) % 90,
          description: `${nm} — sourced wholesale from ${niche.sup}.`,
          barcode: null,
          tags: [niche.key, niche.cat],
          brand: niche.brand,
          image_url: photo(niche.kw, lock * 3),
          image_urls: [photo(niche.kw, lock * 3), photo(niche.kw, lock * 3 + 1), photo(niche.kw, lock * 3 + 2)],
          price_tiers: [],
          is_b2b: false,
          moq: 1,
          tax_mode: 'none',
        });
      });
      const { error: pErr } = await sb.from('products').insert(productRows);
      if (pErr) throw new Error(`products insert ${niche.key}: ${pErr.message}`);
    }

    /* 4. business claims every one of the supplier's products */
    const { data: supProducts } = await sb.from('products')
      .select('id, price').eq('supplier_id', supplier.id).order('id');

    const { count: claimCount } = await sb.from('business_products')
      .select('id', { count: 'exact', head: true }).eq('supplier_id', business.id);

    if ((claimCount ?? 0) === 0 && supProducts?.length) {
      const claims = supProducts.map((p, i) => ({
        id: bpId++,
        supplier_id: business.id,                       // the BUSINESS that stocks it
        product_id:  p.id,                              // the supplier's catalog item
        custom_price: round2(Number(p.price) * 1.45),   // retail markup
        stock_qty: 15 + ((i * 9) % 120),
        is_active: true,
        moq: 1,
      }));
      const { error: bErr } = await sb.from('business_products').insert(claims);
      if (bErr) throw new Error(`claims insert ${niche.key}: ${bErr.message}`);
    }

    creds.push({ niche: niche.key, business: niche.biz, bizEmail, supplier: niche.sup, supEmail });
    console.log(`✅  ${niche.icon}  ${niche.biz.padEnd(34)} ⟵ ${niche.sup.padEnd(28)} (25 products)`);
  } catch (e) {
    console.log(`❌  ${niche.key}: ${e.message}`);
  }
}

/* ── credentials summary ──────────────────────────────────────────── */
const lines = [];
lines.push('MOGARENTA — SEEDED NICHE ACCOUNTS');
lines.push(`All passwords: ${PASSWORD}`);
lines.push('='.repeat(72));
lines.push('');
lines.push('BUSINESSES (retail stores — log in to see their own dashboard):');
for (const c of creds) lines.push(`  ${c.business.padEnd(34)} ${c.bizEmail}`);
lines.push('');
lines.push('SUPPLIERS (wholesale sources):');
for (const c of creds) lines.push(`  ${c.supplier.padEnd(34)} ${c.supEmail}`);
lines.push('');
lines.push(`Password for every account: ${PASSWORD}`);

const out = lines.join('\n');
writeFileSync(new URL('../seed-credentials.txt', import.meta.url), out);
console.log('\n' + out);
console.log(`\n📄  Saved credentials to seed-credentials.txt  (${creds.length} niches seeded)\n`);
