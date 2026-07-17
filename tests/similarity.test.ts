import { describe, it, expect } from 'vitest';
import { similarProducts } from '@/lib/similarity';
import type { Product } from '@/lib/types';

let nextId = 1;
function make(over: Partial<Product>): Product {
  return {
    id: nextId++,
    name: 'Item',
    price: 10,
    originalPrice: 10,
    category: 'electronics',
    stock: 5,
    sku: `SKU-${nextId}`,
    supplierId: 1,
    rating: 0,
    reviews: 0,
    sold: 0,
    description: '',
    ...over,
  };
}

describe('similarProducts', () => {
  it('ranks shared tags above same-category-only matches', () => {
    const viewed = make({ name: 'Wireless Earbuds', tags: ['wireless', 'audio'], category: 'electronics' });
    const tagMatch      = make({ name: 'Speaker', tags: ['audio'], category: 'home' });
    const categoryMatch = make({ name: 'USB Cable', category: 'electronics' });
    const unrelated     = make({ name: 'Banana', category: 'food' });

    const result = similarProducts(viewed, [unrelated, categoryMatch, tagMatch]);
    expect(result[0].id).toBe(tagMatch.id);
    expect(result.map(p => p.id)).toContain(categoryMatch.id);
    expect(result.map(p => p.id)).not.toContain(unrelated.id);
  });

  it('matches by shared name words', () => {
    const viewed = make({ name: 'iPhone 15 Pro', category: 'electronics' });
    const nameMatch = make({ name: 'iPhone 15 Pro Max Case', category: 'accessories' });
    const catOnly   = make({ name: 'Laptop', category: 'electronics' });

    const result = similarProducts(viewed, [catOnly, nameMatch]);
    expect(result[0].id).toBe(nameMatch.id);
  });

  it('never includes the viewed product itself', () => {
    const viewed = make({ name: 'Solo', tags: ['x'] });
    expect(similarProducts(viewed, [viewed])).toHaveLength(0);
  });

  it('breaks score ties by units sold', () => {
    const viewed = make({ name: 'Tea', category: 'food' });
    const popular = make({ name: 'Coffee', category: 'food', sold: 100 });
    const slow    = make({ name: 'Juice',  category: 'food', sold: 1 });

    const result = similarProducts(viewed, [slow, popular]);
    expect(result[0].id).toBe(popular.id);
  });

  it('caps the list at the limit', () => {
    const viewed = make({ name: 'Thing', category: 'food' });
    const many = Array.from({ length: 20 }, (_, i) => make({ name: `Item ${i}`, category: 'food' }));
    expect(similarProducts(viewed, many, 8)).toHaveLength(8);
  });

  it('surfaces up to 12 similar by default (was 8)', () => {
    const viewed = make({ name: 'Snack', category: 'food', tags: ['organic'] });
    const many = Array.from({ length: 30 }, (_, i) => make({ name: `Food ${i}`, category: 'food', tags: ['organic'] }));
    expect(similarProducts(viewed, many)).toHaveLength(12);
  });

  it('includes ALL same-category products that share a tag', () => {
    const viewed = make({ name: 'Green Tea', category: 'food', tags: ['tea', 'organic'] });
    const shareTag = Array.from({ length: 15 }, (_, i) => make({ name: `Blend ${i}`, category: 'food', tags: ['tea'] }));
    const other    = make({ name: 'Motor Oil', category: 'home' }); // unrelated
    const result = similarProducts(viewed, [...shareTag, other], 100);
    // every tag-sharing same-category item is returned; the unrelated one isn't
    expect(result).toHaveLength(15);
    expect(result.map(p => p.id)).not.toContain(other.id);
  });

  it('ranks same-category + shared-tag above same-category alone', () => {
    const viewed   = make({ name: 'Running Shoes', category: 'fashion', tags: ['sport', 'shoes'] });
    const sharesTag = make({ name: 'Trainers', category: 'fashion', tags: ['shoes'] });
    const catOnly   = make({ name: 'Hat', category: 'fashion' });
    const result = similarProducts(viewed, [catOnly, sharesTag]);
    expect(result[0].id).toBe(sharesTag.id);
  });

  it('counts a shared brand as a real signal', () => {
    const viewed = make({ name: 'Phone', category: 'electronics', brand: 'Acme' });
    const sameBrand = make({ name: 'Charger', category: 'accessories', brand: 'Acme', tags: ['acme-power'] });
    const noBrand   = make({ name: 'Charger', category: 'accessories' }); // different cat, no signal
    const result = similarProducts(viewed, [noBrand, sameBrand]);
    expect(result.map(p => p.id)).toContain(sameBrand.id);
    expect(result.map(p => p.id)).not.toContain(noBrand.id);
  });
});
