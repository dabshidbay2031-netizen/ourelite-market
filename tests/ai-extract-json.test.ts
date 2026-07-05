// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { extractJson } from '@/lib/ai/gemini';

describe('extractJson (robust model-reply parsing)', () => {
  it('parses plain JSON', () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
  });

  it('strips ```json code fences', () => {
    const r = extractJson<{ name: string }>('```json\n{"name":"Kabaha"}\n```');
    expect(r?.name).toBe('Kabaha');
  });

  it('ignores prose before and after the object', () => {
    const r = extractJson<{ ok: boolean }>('Sure! Here you go:\n{"ok":true}\nHope that helps.');
    expect(r?.ok).toBe(true);
  });

  it('handles a closing brace inside a string value', () => {
    const r = extractJson<{ desc: string }>('{"desc":"price is 5} dollars","x":2}');
    expect(r?.desc).toBe('price is 5} dollars');
  });

  it('handles escaped quotes in strings', () => {
    const r = extractJson<{ q: string }>('{"q":"say \\"hi\\""}');
    expect(r?.q).toBe('say "hi"');
  });

  it('returns null when there is no object', () => {
    expect(extractJson('no json here')).toBeNull();
  });
});
