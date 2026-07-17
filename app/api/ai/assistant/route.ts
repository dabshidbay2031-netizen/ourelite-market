import { NextResponse } from 'next/server';
import { isAiConfigured, aiChat, type ChatMessage } from '@/lib/ai';
import { MARKETPLACE_SYSTEM_PROMPT } from '@/lib/ai/marketplaceKnowledge';
import { rateLimit, clientIp } from '@/lib/rateLimit';

/**
 * POST /api/ai/assistant
 * Body: { messages: { role: 'user' | 'assistant', content: string }[] }
 * Returns: { reply }  (or { noKey } when GEMINI_API_KEY is missing)
 *
 * The public help assistant — answers how-to questions about using Hamar Mall,
 * grounded in lib/ai/marketplaceKnowledge (public info only).
 */
export async function POST(req: Request) {
  // AI calls cost credit — throttle hard per IP (public, unauthenticated).
  const rl = rateLimit(`ai-assistant:${clientIp(req)}`, 12, 60_000);
  if (!rl.ok) return NextResponse.json({ error: 'Too many messages. Please slow down.' },
    { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } });

  if (!isAiConfigured()) {
    return NextResponse.json({
      error: 'AI assistant not configured. Add OPENROUTER_API_KEY (free at openrouter.ai/keys) to .env.local.',
      noKey: true,
    }, { status: 503 });
  }

  let body: { messages?: { role?: string; content?: string }[] };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const messages = Array.isArray(body.messages) ? body.messages : [];
  if (messages.length === 0) return NextResponse.json({ error: 'messages required' }, { status: 400 });

  // Normalize history (cap to the last 12 turns).
  const history: ChatMessage[] = messages.slice(-12)
    .filter(m => typeof m.content === 'string' && m.content.trim())
    .map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content) }));

  const r = await aiChat({ system: MARKETPLACE_SYSTEM_PROMPT, messages: history });

  if (!r.ok) return NextResponse.json({ error: `AI failed: ${r.error}` }, { status: 500 });
  return NextResponse.json({ reply: r.text });
}
