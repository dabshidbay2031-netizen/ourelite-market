import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { errMsg, isMissingTableError } from '@/lib/apiHelpers';

function mapProduct(p: Record<string, unknown>) {
  return {
    id:            p.id,
    name:          p.name,
    price:         p.price,
    originalPrice: p.original_price,
    category:      p.category,
    subCategory:   p.sub_category ?? null,
    icon:          p.icon,
    stock:         p.stock,
    sku:           p.sku,
    supplierId:    p.supplier_id  ?? null,
    rating:        p.rating,
    reviews:       p.reviews,
    sold:          p.sold,
    description:   p.description,
    barcode:       p.barcode      ?? null,
    tags:          p.tags         ?? [],
    brand:         p.brand        ?? null,
    imageUrl:      p.image_url    ?? null,
  };
}

function mapBP(row: Record<string, unknown>) {
  return {
    id:          row.id,
    supplierId:  row.supplier_id,
    productId:   row.product_id,
    customPrice: row.custom_price,
    stockQty:    row.stock_qty,
    moq:         (row.moq as number) ?? 1,
    isActive:    row.is_active,
    createdAt:   row.created_at,
    product:     row.products
      ? mapProduct(row.products as Record<string, unknown>)
      : null,
  };
}

/** GET /api/business-products?supplierId=X */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const supplierId = searchParams.get('supplierId');
  if (!supplierId) return NextResponse.json({ error: 'supplierId required' }, { status: 400 });

  try {
    const { data, error } = await getSupabaseAdmin()
      .from('business_products')
      .select('*, products(*)')
      .eq('supplier_id', parseInt(supplierId, 10))
      .order('created_at', { ascending: false });

    if (error) throw error;
    return NextResponse.json(data.map(r => mapBP(r as Record<string, unknown>)));
  } catch (e) {
    if (isMissingTableError(e)) {
      // Table doesn't exist yet — run migration.sql
      return NextResponse.json([]);
    }
    return NextResponse.json({ error: errMsg(e) }, { status: 500 });
  }
}

/** POST /api/business-products — claim a product into a business's store */
export async function POST(req: Request) {
  const body = await req.json();
  const { supplierId, productId, customPrice, stockQty = 0, moq = 1 } = body;

  if (!supplierId || !productId || customPrice === undefined) {
    return NextResponse.json(
      { error: 'supplierId, productId and customPrice are required' },
      { status: 400 }
    );
  }

  try {
    const { data, error } = await getSupabaseAdmin()
      .from('business_products')
      .upsert({
        supplier_id:  parseInt(String(supplierId), 10),
        product_id:   parseInt(String(productId),  10),
        custom_price: parseFloat(String(customPrice)),
        stock_qty:    parseInt(String(stockQty),    10),
        moq:          Math.max(1, parseInt(String(moq), 10)),
        is_active:    true,
      }, { onConflict: 'supplier_id,product_id' })
      .select('*, products(*)')
      .single();

    if (error) throw error;
    return NextResponse.json(mapBP(data as Record<string, unknown>), { status: 201 });
  } catch (e) {
    if (isMissingTableError(e)) {
      return NextResponse.json({
        error: 'business_products table missing. Run supabase/migration.sql in your Supabase SQL editor.',
        needsMigration: true,
      }, { status: 500 });
    }
    return NextResponse.json({ error: errMsg(e) }, { status: 500 });
  }
}
