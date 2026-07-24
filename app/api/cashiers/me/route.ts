import { NextResponse } from 'next/server';
import { getCashierActor } from '@/lib/cashierAuth';

/**
 * GET /api/cashiers/me — the CURRENT cashier's live status + privileges.
 *
 * The client polls this so a privilege change or deactivation the owner makes
 * takes effect WITHOUT the staff member logging out and back in. Authenticated
 * purely by the X-Cashier-Token (getCashierActor re-reads the live row), so a
 * deactivated cashier resolves to no actor → 401 → the client signs them out.
 */
export async function GET(req: Request) {
  const actor = await getCashierActor(req);
  if (!actor) {
    return NextResponse.json({ error: 'Not a valid staff session' }, { status: 401 });
  }
  return NextResponse.json({
    id:         actor.cashierId,
    name:       actor.name,
    businessId: actor.ownerUserId,
    supplierId: actor.supplierId,
    privileges: actor.privileges,
    active:     true,
  });
}
