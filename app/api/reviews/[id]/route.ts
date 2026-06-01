import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { errMsg } from '@/lib/apiHelpers';

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const { error } = await getSupabaseAdmin()
    .from('reviews')
    .delete()
    .eq('id', parseInt(params.id, 10));
  if (error) return NextResponse.json({ error: errMsg(error) }, { status: 500 });
  return NextResponse.json({ success: true });
}
