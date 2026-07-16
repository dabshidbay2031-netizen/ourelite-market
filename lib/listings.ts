import type { Product } from '@/lib/types';

/**
 * A *listing* = one product as sold by one store.
 *
 * The catalog row (`products`) holds the shared identity: the product id, its
 * barcode, and its reviews — every store selling the item shares those. Each
 * claim (`business_products`) may override presentation and commercial fields;
 * a NULL override means "inherit from the catalog".
 *
 * So a claimed product behaves like a normal product the store owns — it can
 * change the photos, the name, the price, every detail — and only the reviews
 * (and the barcode that identifies the physical item) stay common.
 */
export interface Listing extends Product {
  /** business_products.id — identifies THIS store's listing. */
  listingId: number;
  /** The catalog product id — what reviews and similarity are keyed on. */
  productId: number;
  /** True when this store claimed the product rather than uploading it. */
  claimed: boolean;
  /** True once the store has overridden any catalog field. */
  customized: boolean;
}

/** Fields a store may override on a claimed product. */
export const OVERRIDABLE = [
  'name', 'description', 'imageUrl', 'imageUrls', 'brand',
  'category', 'subCategory', 'tags', 'sku', 'originalPrice', 'cost',
] as const;
export type OverridableField = typeof OVERRIDABLE[number];

/** snake_case DB column for each overridable field. */
export const OVERRIDE_COLUMN: Record<OverridableField, string> = {
  name:          'name',
  description:   'description',
  imageUrl:      'image_url',
  imageUrls:     'image_urls',
  brand:         'brand',
  category:      'category',
  subCategory:   'sub_category',
  tags:          'tags',
  sku:           'sku',
  originalPrice: 'original_price',
  cost:          'cost',
};

/** Treat NULL/undefined as "inherit"; keep 0 and '' as deliberate values. */
function pick<T>(override: T | null | undefined, base: T): T {
  return override === null || override === undefined ? base : override;
}

/** The shape the business-products API returns for one claim. */
export interface ClaimRow {
  id:          number;
  supplierId:  number;
  productId:   number;
  customPrice: number | null;
  stockQty:    number | null;
  moq:         number | null;
  isActive:    boolean;
  customizedAt?: string | null;
  overrides?:  Partial<Record<OverridableField, unknown>> | null;
  product:     Product | null;
}

/**
 * Merge a claim over its catalog product to get what this store actually sells.
 * Returns null when the catalog row is missing (deleted product).
 */
export function resolveListing(claim: ClaimRow): Listing | null {
  const base = claim.product;
  if (!base) return null;
  const o = claim.overrides ?? {};

  return {
    ...base,
    // Identity stays the catalog product's — reviews, similarity, and the
    // /:slug/:productId route all key on it.
    id:            base.id,
    productId:     base.id,
    listingId:     claim.id,
    claimed:       true,
    customized:    Boolean(claim.customizedAt),
    supplierId:    claim.supplierId,

    // Commercial fields are always the store's own.
    price:         Number(claim.customPrice ?? base.price),
    stock:         Number(claim.stockQty ?? 0),
    moq:           claim.moq ?? 1,

    // Presentation: store override, else catalog.
    name:          pick(o.name          as string   | null, base.name),
    description:   pick(o.description   as string   | null, base.description),
    imageUrl:      pick(o.imageUrl      as string   | null, base.imageUrl),
    imageUrls:     pick(o.imageUrls     as string[] | null, base.imageUrls ?? []),
    brand:         pick(o.brand         as string   | null, base.brand) ?? undefined,
    category:      pick(o.category      as string   | null, base.category),
    subCategory:   pick(o.subCategory   as string   | null, base.subCategory) ?? undefined,
    tags:          pick(o.tags          as string[] | null, base.tags ?? []),
    sku:           pick(o.sku           as string   | null, base.sku),
    originalPrice: Number(pick(o.originalPrice as number | null, base.originalPrice ?? 0)),
    cost:          Number(pick(o.cost          as number | null, base.cost ?? 0)),

    // Shared with the catalog, never per store.
    barcode:       base.barcode,
    rating:        base.rating,
    reviews:       base.reviews,
  } as Listing;
}

/** A React key / identity for a listing — the same product sold by two stores
 *  produces two cards, so the product id alone is not unique in a grid. */
export function listingKey(l: { productId?: number; id: number; supplierId?: number | null }): string {
  return `${l.productId ?? l.id}@${l.supplierId ?? 0}`;
}
