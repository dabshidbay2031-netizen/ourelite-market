import { describe, expect, it } from 'vitest';
import { mergeCashierSession } from '@/lib/cashierSession';

describe('mergeCashierSession', () => {
  it('updates the active session privileges without dropping its other details', () => {
    const session = {
      id: 'cashier-1',
      name: 'Amina',
      phone: '+252611000000',
      businessId: 'business-1',
      privileges: ['pos'],
      loginAt: '2024-01-01T00:00:00.000Z',
    };

    const updated = mergeCashierSession(session, { privileges: ['pos', 'chat'] });

    expect(updated).toEqual({
      ...session,
      privileges: ['pos', 'chat'],
    });
  });

  it('returns null unchanged when there is no active session', () => {
    expect(mergeCashierSession(null, { privileges: ['staff'] })).toBeNull();
  });
});
