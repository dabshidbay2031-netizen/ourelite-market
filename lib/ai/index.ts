/**
 * Provider-agnostic AI layer. Routes call THIS, not a specific vendor.
 *
 * Picks a backend by which key is configured:
 *   1. OpenRouter  (OPENROUTER_API_KEY) — preferred; has free models
 *   2. Gemini      (GEMINI_API_KEY)
 * Swapping providers is just an env change; no route code changes.
 */
import * as gem from './gemini';
import * as orr from './openrouter';

export type AiResult = { ok: true; text: string } | { ok: false; error: string };

export function isAiConfigured(): boolean {
  return orr.isOpenRouterConfigured() || gem.isGeminiConfigured();
}

export interface ChatMessage { role: 'user' | 'assistant'; content: string }

/** Multi-turn chat with a system prompt. */
export async function aiChat(opts: { system: string; messages: ChatMessage[]; temperature?: number; maxTokens?: number }): Promise<AiResult> {
  const { system, messages, temperature = 0.5, maxTokens = 800 } = opts;

  if (orr.isOpenRouterConfigured()) {
    return orr.openrouterGenerate({
      messages: [
        { role: 'system', content: system },
        ...messages.map(m => ({ role: m.role, content: m.content }) as orr.ORMessage),
      ],
      temperature, maxTokens,
    });
  }
  if (gem.isGeminiConfigured()) {
    return gem.geminiGenerate({
      system,
      contents: messages.map(m => ({ role: m.role === 'assistant' ? 'model' as const : 'user' as const, parts: [{ text: m.content }] })),
      temperature, maxTokens,
    });
  }
  return { ok: false, error: 'AI not configured' };
}

/** Describe an image from a URL with a prompt. */
export async function aiDescribeImage(opts: { imageUrl: string; prompt: string; temperature?: number; maxTokens?: number }): Promise<AiResult> {
  const { imageUrl, prompt, temperature = 0.7, maxTokens = 700 } = opts;

  if (orr.isOpenRouterConfigured()) {
    return orr.openrouterGenerate({
      model: orr.OPENROUTER_VISION_MODEL,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: imageUrl } },
        ],
      }],
      temperature, maxTokens,
    });
  }
  if (gem.isGeminiConfigured()) {
    const img = await gem.fetchImageAsBase64(imageUrl);
    if (!img) return { ok: false, error: 'Could not load the product image.' };
    return gem.geminiGenerate({
      parts: [{ inlineData: { mimeType: img.mimeType, data: img.data } }, { text: prompt }],
      json: true, temperature, maxTokens,
    });
  }
  return { ok: false, error: 'AI not configured' };
}

export { extractJson } from './gemini';
