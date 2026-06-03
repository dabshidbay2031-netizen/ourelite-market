import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
function mapProduct(p: Record<string, unknown>) {
  const id      = typeof p.id === 'number' ? p.id : parseInt(String(p.id), 10);
  const tags    = Array.isArray(p.tags) ? p.tags as string[] : [];
  const brand   = (p.brand   && String(p.brand).trim())  ? String(p.brand)  : null;
  const barcode = (p.barcode && String(p.barcode).trim()) ? String(p.barcode): null;
  const subCat  = (p.sub_category && String(p.sub_category).trim()) ? String(p.sub_category) : null;

  return {
    id,
    name:          p.name,
    price:         p.price,
    originalPrice: p.original_price,
    category:      p.category,
    subCategory:   subCat,
    icon:          p.icon,
    stock:         p.stock,
    sku:           p.sku,
    supplierId:    p.supplier_id  ?? null,
    rating:        p.rating,
    reviews:       p.reviews,
    sold:          p.sold,
    description:   p.description,
    barcode,
    tags,
    brand,
    imageUrl:      p.image_url    ?? null,
    imageUrls:     p.image_urls   ?? [],
    priceTiers:    Array.isArray(p.price_tiers) ? p.price_tiers : [],
    isB2b:         Boolean(p.is_b2b ?? false),
    moq:           (p.moq as number) ?? 1,
  };
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const id = parseInt(params.id, 10);
  try {
    const { data, error } = await getSupabaseAdmin()
      .from('products').select('*').eq('id', id).single();
    if (error) throw error;
    return NextResponse.json(mapProduct(data));
  } catch {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const id   = parseInt(params.id, 10);
  const body = await req.json();

  const updates: Record<string, unknown> = {};
  if (body.name          !== undefined) updates.name          = body.name;
  if (body.price         !== undefined) updates.price         = parseFloat(body.price);
  if (body.originalPrice !== undefined) updates.original_price= parseFloat(body.originalPrice);
  if (body.category      !== undefined) updates.category      = body.category;
  if (body.icon          !== undefined) updates.icon          = body.icon;
  if (body.stock         !== undefined) updates.stock         = parseInt(body.stock, 10);
  if (body.sku           !== undefined) updates.sku           = body.sku;
  if (body.supplierId    !== undefined) updates.supplier_id   = body.supplierId
    ? parseInt(String(body.supplierId), 10) : null;
  if (body.description   !== undefined) updates.description   = body.description;
  if (body.imageUrl      !== undefined) updates.image_url     = body.imageUrl;
  if (body.imageUrls     !== undefined) updates.image_urls    = Array.isArray(body.imageUrls) ? body.imageUrls : [];
  if (body.subCategory   !== undefined) updates.sub_category  = body.subCategory ?? null;
  if (body.barcode       !== undefined) updates.barcode       = body.barcode ?? null;
  if (body.tags          !== undefined) updates.tags          = Array.isArray(body.tags) ? body.tags : [];
  if (body.brand         !== undefined) updates.brand         = body.brand ?? null;
  if (body.priceTiers    !== undefined) updates.price_tiers   = Array.isArray(body.priceTiers) ? body.priceTiers : [];
  if (body.isB2b         !== undefined) updates.is_b2b        = Boolean(body.isB2b);
  if (body.moq           !== undefined) updates.moq           = parseInt(String(body.moq), 10);

  const { data, error } = await getSupabaseAdmin()
    .from('products').update(updates).eq('id', id).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(mapProduct(data));
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const id = parseInt(params.id, 10);
  const { error } = await getSupabaseAdmin().from('products').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
