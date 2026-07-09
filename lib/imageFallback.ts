/**
 * Reliable product-image resolver.
 *
 * ~690 of the seeded products point their photos at loremflickr.com, which has
 * become flaky — many requests error out or hang, so most product images render
 * blank. This maps every loremflickr keyword theme to a curated, load-tested
 * Unsplash photo (relevant AND reliable) and falls back to a deterministic
 * picsum.photos image for anything it can't classify. Non-loremflickr URLs
 * (real uploads, existing Unsplash links) pass through untouched.
 *
 * Applied at every render site (ProductImage, ProductCard, the detail gallery),
 * so it needs no data migration and survives a re-seed.
 */

// Each theme has 2–3 verified Unsplash photo IDs; the loremflickr `lock` number
// picks one deterministically so items in the same category aren't identical.
const THEME_PHOTOS: Record<string, string[]> = {
  bakery:      ['1509440159596-0249088772ff', '1608198093002-ad4e005484ec', '1555507036-ab1f4038808a'],
  books:       ['1512820790803-83ca734da794', '1524995997946-a1c2e315a42f', '1495446815901-a7297e633e8d'],
  meat:        ['1607623814075-e51df1bdc82f', '1603048297172-c92544798d5a', '1588347818036-558601350947'],
  car:         ['1492144534655-ae79c964c9d7', '1486262715619-67b85e0b08d3', '1503376780353-7e6692767b70'],
  clothing:    ['1521572163474-6864f9cf17ab', '1489987707025-afc232f7ea0f', '1445205170230-053b83016050'],
  coffee:      ['1495474472287-4d71bcdd2085', '1447933601403-0c6688de566e', '1442512595331-e89e73853f31'],
  cosmetics:   ['1596462502278-27bfdc403348', '1522335789203-aabd1fc54bc9', '1512496015851-a90fb38ba796'],
  electronics: ['1592286927505-1def25115558', '1498049794561-7780e7231661', '1526170375885-4d8ecf77b99f'],
  furniture:   ['1592078615290-033ee584e267', '1555041469-a586c61ea9bc', '1538688525198-9b88f6f53126'],
  glasses:     ['1574258495973-f010dfbb5371', '1511499767150-a48a237f0083', '1577803645773-f96470509666'],
  grocery:     ['1542838132-92c53300491e', '1543168256-418811576931', '1550989460-0adf9ea622e2'],
  hardware:    ['1530124566582-a618bc2615dc', '1572981779307-38b8cabb2407'],
  health:      ['1571019613454-1cb2f99b2d8b', '1505576399279-565b52d4ac71'],
  home:        ['1507473885765-e6ed057f782c', '1513694203232-719a280e022f', '1556228453-efd6c1ff04f6'],
  jewelry:     ['1515562141207-7a88fb7ce338', '1599643478518-a784e5dc4c8f', '1611591437281-460bfbe1220a'],
  medicine:    ['1584308666744-24d5c474f2ae', '1471864190281-a93a3070b6de', '1587854692152-cbe660dbde88'],
  pet:         ['1583337130417-3346a1be7dee', '1450778869180-41d0601e046e', '1425082661705-1834bfd09dca'],
  phone:       ['1511707171634-5f897ff02aa9', '1580910051074-3eb694886505', '1523206489230-c012c64b2b48'],
  plants:      ['1416879595882-3373a0480b5b', '1485955900006-10f4d324d411', '1462530260150-162092dbf011'],
  restaurant:  ['1517248135467-4c7edcad34c4', '1414235077428-338989a2e8c0', '1552566626-52f8b828add9'],
  shoes:       ['1542291026-7eec264c27ff', '1600185365483-26d7a4cc7519', '1595950653106-6c9ebd614d3a'],
  sports:      ['1517649763962-0c623066013b', '1571019614242-c5c5dee9f50b', '1517836357463-d25dfeac3438'],
  stationery:  ['1497032628192-86f99bcd76bc', '1519682337058-a94d519337bc', '1531346878377-a5be20888e57'],
  toys:        ['1566576912321-d58ddd7a6088', '1596464716127-f2a82984de30'],
};

// The first term of a loremflickr keyword set → a canonical theme above.
const KEYWORD_ALIAS: Record<string, string> = {
  butcher: 'meat', fashion: 'clothing', food: 'grocery',
  smartphone: 'phone', supermarket: 'grocery',
};

const unsplash = (id: string) => `https://images.unsplash.com/photo-${id}?w=600&q=70`;

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Rewrite a flaky loremflickr URL to a reliable, relevant image. Everything
 *  else is returned unchanged. */
export function reliableImageSrc(src: string | null | undefined): string | null {
  if (!src) return src ?? null;
  if (!src.includes('loremflickr.com')) return src;

  const kwMatch   = src.match(/loremflickr\.com\/\d+\/\d+\/([^/?]+)/i);
  const lockMatch = src.match(/lock=(\d+)/);
  const seed      = lockMatch ? parseInt(lockMatch[1], 10) : hash(src);

  if (kwMatch) {
    const first = decodeURIComponent(kwMatch[1]).split(/[\s,]/)[0].toLowerCase();
    const theme = KEYWORD_ALIAS[first] ?? first;
    const photos = THEME_PHOTOS[theme];
    if (photos && photos.length) return unsplash(photos[seed % photos.length]);
  }
  // Unclassified → deterministic, always-reliable picsum photo.
  return `https://picsum.photos/seed/mg${seed}/600/600`;
}

/** Map an array of photo URLs through {@link reliableImageSrc}. */
export function reliableImageSrcs(urls: string[]): string[] {
  return urls.map(u => reliableImageSrc(u) ?? u);
}
