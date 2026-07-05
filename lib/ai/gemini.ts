/**
 * Google Gemini provider (server-side only — reads the API key).
 *
 * Uses the free-tier Generative Language REST API directly (no SDK dependency),
 * so it stays small and swappable. Get a FREE key at https://aistudio.google.com
 * and set GEMINI_API_KEY in .env.local.
 *
 *   GEMINI_API_KEY   required (free tier)
 *   GEMINI_MODEL     default gemini-2.0-flash (free, fast, multimodal)
 */

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

export const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash';

function apiKey(): string {
  return process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
}

export function isGeminiConfigured(): boolean {
  return apiKey() !== '';
}

export interface GeminiPart {
  text?:       string;
  inlineData?: { mimeType: string; data: string }; // base64 image
}
export interface GeminiContent {
  role:  'user' | 'model';
  parts: GeminiPart[];
}

export type GeminiResult = { ok: true; text: string } | { ok: false; error: string };

interface GenerateOpts {
  system?:      string;
  /** Single user turn — convenience for one-shot prompts. */
  parts?:       GeminiPart[];
  /** Full multi-turn conversation — overrides `parts` when given. */
  contents?:    GeminiContent[];
  json?:        boolean;  // ask Gemini to return application/json
  temperature?: number;
  maxTokens?:   number;
  model?:       string;
}

/** Low-level call to Gemini generateContent. */
export async function geminiGenerate(opts: GenerateOpts): Promise<GeminiResult> {
  const key = apiKey();
  if (!key) return { ok: false, error: 'GEMINI_API_KEY not set' };

  const contents: GeminiContent[] = opts.contents
    ?? [{ role: 'user', parts: opts.parts ?? [] }];

  const body: Record<string, unknown> = {
    contents,
    generationConfig: {
      temperature:     opts.temperature ?? 0.7,
      maxOutputTokens: opts.maxTokens ?? 1024,
      ...(opts.json ? { responseMimeType: 'application/json' } : {}),
    },
  };
  if (opts.system) body.systemInstruction = { parts: [{ text: opts.system }] };

  const model = opts.model || GEMINI_MODEL;
  try {
    const res = await fetch(`${API_BASE}/${model}:generateContent?key=${key}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = (data as { error?: { message?: string } })?.error?.message || `Gemini HTTP ${res.status}`;
      // limit:0 free-tier = the project has no free quota (region/billing) — give a clear hint.
      if (res.status === 429 || /quota|billing/i.test(msg)) {
        return { ok: false, error: 'Gemini is over its quota for this API key. Enable billing on the Google project, or use a free-tier key from an eligible region.' };
      }
      return { ok: false, error: msg };
    }
    const cand = (data as { candidates?: { content?: { parts?: { text?: string }[] } }[] }).candidates?.[0];
    const text = (cand?.content?.parts ?? []).map(p => p.text ?? '').join('').trim();
    if (!text) return { ok: false, error: 'Empty response from Gemini' };
    return { ok: true, text };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Network error' };
  }
}

/** Fetch an image URL and return it base64-encoded for inlineData. */
export async function fetchImageAsBase64(url: string): Promise<{ data: string; mimeType: string } | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const mimeType = (res.headers.get('content-type') || 'image/jpeg').split(';')[0].trim();
    const buf = Buffer.from(await res.arrayBuffer());
    return { data: buf.toString('base64'), mimeType };
  } catch {
    return null;
  }
}

/**
 * Pull a JSON object out of a model reply and parse it — robust to ```json
 * code fences and trailing prose. Uses balanced-brace scanning (string-aware)
 * so a `}` inside a description doesn't truncate the object.
 */
export function extractJson<T = Record<string, unknown>>(text: string): T | null {
  let s = text.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  try { return JSON.parse(s) as T; } catch { /* fall through */ }

  const start = s.indexOf('{');
  if (start === -1) return null;
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
    } else if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) {
      try { return JSON.parse(s.slice(start, i + 1)) as T; } catch { return null; }
    }
  }
  return null;
}
