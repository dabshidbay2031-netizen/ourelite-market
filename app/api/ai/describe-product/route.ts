import { NextResponse } from 'next/server';

const CATEGORIES = [
  'electronics','clothes','home','food','health','sports',
  'medicine','cosmetics','construction','furniture','cars','books','other',
];

/**
 * POST /api/ai/describe-product
 * Body: { imageUrl: string }
 * Returns: { name, description, category, subCategory, brand, tags, price_hint }
 *
 * Requires ANTHROPIC_API_KEY in environment.
 * If key is missing, returns a helpful error so the UI can degrade gracefully.
 */
export async function POST(req: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey === 'your_anthropic_api_key_here') {
    return NextResponse.json({
      error: 'ANTHROPIC_API_KEY not set. Add it to .env.local to enable AI descriptions.',
      noKey: true,
    }, { status: 503 });
  }

  const { imageUrl } = await req.json();
  if (!imageUrl) return NextResponse.json({ error: 'imageUrl required' }, { status: 400 });

  try {
    // Dynamic import — keeps the SDK out of the browser bundle
    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    const client    = new Anthropic({ apiKey });

    const response = await client.messages.create({
      model:      'claude-haiku-4-5',
      max_tokens: 512,
      messages: [{
        role:    'user',
        content: [
          {
            type:      'image',
            source:    { type: 'url', url: imageUrl },
          },
          {
            type: 'text',
            text: `You are an expert e-commerce copywriter specialising in East African markets.
Analyse this product image and return a JSON object — nothing else, no markdown, no preamble.

Return exactly this structure:
{
  "name": "concise product name (3–7 words)",
  "description": "compelling 2-sentence product description",
  "category": "one of: ${CATEGORIES.join(', ')}",
  "subCategory": "relevant sub-category string",
  "brand": "brand name if visible, otherwise empty string",
  "tags": ["3-5 feature keywords"],
  "price_hint": "low | mid | premium"
}

Be accurate, concise, and appeal to Somali/East African buyers.`,
          },
        ],
      }],
    });

    const rawText = response.content[0].type === 'text' ? response.content[0].text : '';

    // Extract JSON from response (may have surrounding text)
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in AI response');

    const parsed = JSON.parse(jsonMatch[0]);

    // Sanitise
    const result = {
      name:        String(parsed.name        ?? '').trim(),
      description: String(parsed.description ?? '').trim(),
      category:    CATEGORIES.includes(parsed.category) ? parsed.category : 'other',
      subCategory: String(parsed.subCategory ?? '').trim(),
      brand:       String(parsed.brand       ?? '').trim(),
      tags:        Array.isArray(parsed.tags) ? parsed.tags.slice(0, 5).map(String) : [],
      priceHint:   parsed.price_hint ?? 'mid',
    };

    return NextResponse.json(result);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `AI failed: ${msg}` }, { status: 500 });
  }
}
