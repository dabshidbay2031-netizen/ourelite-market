// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { mapSifaloCode, mapSifaloStatus, buildBasicAuth } from '@/lib/payments/sifalo';

describe('Sifalo Basic auth header', () => {
  it('base64-encodes user:key per the HTTP standard', () => {
    // base64('user:key') === 'dXNlcjprZXk='
    expect(buildBasicAuth('user', 'key')).toBe('Basic dXNlcjprZXk=');
  });
});

describe('Sifalo gateway code mapping', () => {
  it('601 → success', () => expect(mapSifaloCode('601')).toBe('success'));
  it('603 → pending', () => expect(mapSifaloCode('603')).toBe('pending'));
  it('604 (insufficient) → failed', () => expect(mapSifaloCode('604')).toBe('failed'));
  it('600 (failed) → failed', () => expect(mapSifaloCode('600')).toBe('failed'));
  it('accepts numeric codes', () => expect(mapSifaloCode(601)).toBe('success'));
  it('unknown / null → failed', () => {
    expect(mapSifaloCode('999')).toBe('failed');
    expect(mapSifaloCode(null)).toBe('failed');
    expect(mapSifaloCode(undefined)).toBe('failed');
  });
});

describe('Sifalo verify status mapping', () => {
  it('normalizes success/pending', () => {
    expect(mapSifaloStatus('success')).toBe('success');
    expect(mapSifaloStatus('SUCCESS')).toBe('success');
    expect(mapSifaloStatus('pending')).toBe('pending');
  });
  it('treats failure / unknown as failed', () => {
    expect(mapSifaloStatus('failure')).toBe('failed');
    expect(mapSifaloStatus('')).toBe('failed');
    expect(mapSifaloStatus(undefined)).toBe('failed');
  });
});
