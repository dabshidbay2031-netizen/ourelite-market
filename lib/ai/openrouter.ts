/**
 * OpenRouter provider (server-side only — reads the API key).
 *
 * OpenAI-compatible chat completions, with access to genuinely FREE models
 * (the ":free" variants), including multimodal ones for image understanding.
 * Get a free key at https://openrouter.ai/keys and set OPENROUTER_API_KEY.
 *
 *   OPENROUTER_API_KEY      required
 *   OPENROUTER_MODEL        default google/gemini-2.0-flash-exp:free  (chat)
 *   OPENROUTER_VISION_MODEL default = OPENROUTER_MODEL                (image)
 */

const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';

export const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'google/gemma-4-26b-a4b-it:free';
export const OPENROUTER_VISION_MODEL = process.env.OPENROUTER_VISION_MODEL || OPENROUTER_MODEL;

function apiKey(): string {
  return process.env.OPENROUTER_API_KEY || '';
}

export function isOpenRouterConfigured(): boolean {
  return apiKey() !== '';
}

/** OpenAI-style message; content is a string OR a multimodal parts array. */
export type ORContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };
export interface ORMessage {
  role:    'system' | 'user' | 'assistant';
  content: string | ORContentPart[];
}

export type ORResult = { ok: true; text: string } | { ok: false; error: string };

interface GenOpts {
  messages:     ORMessage[];
  model?:       string;
  temperature?: number;
  maxTokens?:   number;
}

export async function openrouterGenerate(opts: GenOpts): Promise<ORResult> {
  const key = apiKey();
  if (!key) return { ok: false, error: 'OPENROUTER_API_KEY not set' };

  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type':  'application/json',
        // Optional attribution (shows in OpenRouter dashboards).
        'X-Title':       'Hamar Mall',
      },
      body: JSON.stringify({
        model:       opts.model || OPENROUTER_MODEL,
        messages:    opts.messages,
        temperature: opts.temperature ?? 0.7,
        max_tokens:  opts.maxTokens ?? 1024,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = (data as { error?: { message?: string } })?.error?.message || `OpenRouter HTTP ${res.status}`;
      if (res.status === 429 || /quota|rate|credit/i.test(msg)) {
        return { ok: false, error: 'AI is rate-limited right now. Please try again in a moment.' };
      }
      return { ok: false, error: msg };
    }
    const text = (data as { choices?: { message?: { content?: string } }[] })
      .choices?.[0]?.message?.content?.trim() ?? '';
    if (!text) return { ok: false, error: 'Empty response from OpenRouter' };
    return { ok: true, text };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Network error' };
  }
}
