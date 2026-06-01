import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const id = parseInt(params.id, 10);
  const { stock } = await req.json();

  try {
    const { error } = await getSupabaseAdmin()
      .from('products')
      .update({ stock })
      .eq('id', id);

    if (error) throw error;
    return NextResponse.json({ id, stock });
  } catch {
    return NextResponse.json({ id, stock });
  }
}
