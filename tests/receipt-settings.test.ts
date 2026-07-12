import { beforeEach, describe, expect, it } from 'vitest';
import { readReceiptAutoPrintSetting } from '@/lib/receiptSettings';

describe('readReceiptAutoPrintSetting', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns true when the setting is enabled in local storage', () => {
    localStorage.setItem('mogarenta_settings', JSON.stringify({ autoPrint: true }));
    expect(readReceiptAutoPrintSetting()).toBe(true);
  });

  it('returns false when the setting is disabled or missing', () => {
    localStorage.setItem('mogarenta_settings', JSON.stringify({ autoPrint: false }));
    expect(readReceiptAutoPrintSetting()).toBe(false);

    localStorage.removeItem('mogarenta_settings');
    expect(readReceiptAutoPrintSetting()).toBe(false);
  });
});
