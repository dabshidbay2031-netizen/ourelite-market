import { NextResponse } from 'next/server';
import { isAiConfigured, aiDescribeImage, extractJson } from '@/lib/ai';
import { rateLimit, clientIp } from '@/lib/rateLimit';

const CATEGORIES = [
  'electronics','clothes','home','food','health','sports',
  'medicine','cosmetics','construction','furniture','cars','books','other',
];

/**
 * POST /api/ai/describe-product   Body: { imageUrl: string }
 * Returns: { name, description, category, subCategory, brand, tags, priceHint }
 *
 * Powered by Google Gemini (free tier). The DESCRIPTION is written in fluent,
 * persuasive Somali; category/tags stay machine-readable for the catalog.
 * Needs GEMINI_API_KEY in .env.local — without it returns noKey so the UI
 * degrades gracefully.
 */
export async function POST(req: Request) {
  const rl = rateLimit(`ai-describe:${clientIp(req)}`, 10, 60_000);
  if (!rl.ok) return NextResponse.json({ error: 'Too many requests. Please wait a moment.' },
    { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } });

  if (!isAiConfigured()) {
    return NextResponse.json({
      error: 'AI not configured. Add OPENROUTER_API_KEY (free at openrouter.ai/keys) to .env.local.',
      noKey: true,
    }, { status: 503 });
  }

  const { imageUrl } = await req.json();
  if (!imageUrl) return NextResponse.json({ error: 'imageUrl required' }, { status: 400 });

  const prompt = `Waxaad tahay khabiir qoraal-suuq-elektaroonig ah oo ku takhasusay suuqa Soomaaliyeed iyo Bariga Afrika.
Eeg sawirka badeecada oo soo celi KELIYA shay JSON ah — ha ku darin markdown ama qoraal kale.

Qaab-dhismeedka:
{
  "name": "magaca badeecada (3-7 eray, cad oo gaaban)",
  "description": "sharaxaad SOOMAALI ah, suuq-geyn wanaagsan, 2-3 jumlado, soo jiidasho leh oo sax ah — ku qor af-Soomaali fasaxan oo macaamiisha Soomaaliyeed soo jiidanaya",
  "category": "mid ka mid ah: ${CATEGORIES.join(', ')}",
  "subCategory": "nooc-hoosaad ku habboon",
  "brand": "magaca brand-ka haddii uu muuqdo, haddii kale string madhan",
  "tags": ["3-5 eray-fure (Ingiriisi) oo raadinta u fiican"],
  "price_hint": "low | mid | premium"
}

Muhiim: "description"-ku WAA inuu noqdaa af-Soomaali wanaagsan, dabiici ah oo suuqgeyn leh. Sax oo soo jiidasho leh.`;

  const r = await aiDescribeImage({ imageUrl, prompt });

  if (!r.ok) return NextResponse.json({ error: `AI failed: ${r.error}` }, { status: 500 });

  const parsed = extractJson<Record<string, unknown>>(r.text);
  if (!parsed) return NextResponse.json({ error: 'AI returned an unreadable response.' }, { status: 502 });

  const cat = String(parsed.category ?? '');
  return NextResponse.json({
    name:        String(parsed.name        ?? '').trim(),
    description: String(parsed.description ?? '').trim(),
    category:    CATEGORIES.includes(cat) ? cat : 'other',
    subCategory: String(parsed.subCategory ?? '').trim(),
    brand:       String(parsed.brand       ?? '').trim(),
    tags:        Array.isArray(parsed.tags) ? parsed.tags.slice(0, 5).map(String) : [],
    priceHint:   parsed.price_hint ?? 'mid',
  });
}
