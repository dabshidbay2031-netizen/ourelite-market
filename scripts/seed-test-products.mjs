// Seed a few catalog products via the local API (owned by business supplier_id 9).
const API = 'http://localhost:3001';
const SUPPLIER_ID = 9; // TechVault Store (business)

const PRODUCTS = [
  { name: 'iPhone 15 Pro', price: 999, originalPrice: 1199, category: 'electronics', stock: 25, description: '6.1-inch ProMotion, A17 Pro chip, titanium body.', brand: 'Apple', imageUrls: ['https://images.unsplash.com/photo-1592286927505-1def25115558?w=600'], tags: ['phone','apple','5g'] },
  { name: 'Sony WH-1000XM5', price: 349, originalPrice: 399, category: 'electronics', stock: 40, description: 'Industry-leading noise cancelling headphones.', brand: 'Sony', imageUrls: ['https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=600'], tags: ['audio','headphones'] },
  { name: 'Nike Air Max 270', price: 150, originalPrice: 180, category: 'fashion', stock: 60, description: 'Breathable mesh upper with large Air unit.', brand: 'Nike', imageUrls: ['https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=600'], tags: ['shoes','sneakers'] },
  { name: 'Organic Green Tea', price: 12, originalPrice: 15, category: 'food', stock: 200, description: 'Premium loose-leaf green tea, 100g.', brand: 'PureLeaf', imageUrls: ['https://images.unsplash.com/photo-1627435601361-ec25f5b1d0e5?w=600'], tags: ['tea','organic'] },
];

for (const p of PRODUCTS) {
  const r = await fetch(`${API}/api/products`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...p, supplierId: SUPPLIER_ID }),
  });
  const t = await r.text();
  console.log(`${p.name} -> ${r.status} ${t.slice(0, 100)}`);
}
console.log('done');
