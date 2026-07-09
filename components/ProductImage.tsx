'use client';

import { useState, type CSSProperties } from 'react';
import { reliableImageSrc } from '@/lib/imageFallback';

interface Props {
  icon?:      string;
  imageUrl?:  string | null;
  imageUrls?: string[];
  name:       string;
  className?: string;
  style?:     CSSProperties;
}

function Placeholder({ className, style }: Pick<Props, 'className' | 'style'>) {
  return (
    <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.5" opacity=".25"
      className={className} style={{ width: '100%', height: '100%', ...style }}>
      <rect x="4" y="4" width="40" height="40" rx="6"/>
      <path d="M4 34l10-10 8 8 8-12 14 16"/>
      <circle cx="16" cy="16" r="4"/>
    </svg>
  );
}

export default function ProductImage({ imageUrl, imageUrls, name, className, style }: Props) {
  const src = reliableImageSrc(imageUrls?.[0] ?? imageUrl ?? null);
  // A broken/unreachable URL (404, timeout, CORS…) otherwise renders as raw alt
  // TEXT in place of the photo — track load failure and fall back to the SVG
  // placeholder instead. Reset per src so switching products retries the new URL.
  const [failed, setFailed] = useState(false);

  if (!src || failed) return <Placeholder className={className} style={style} />;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      key={src}
      src={src}
      alt={name}
      className={className}
      style={{ objectFit: 'cover', width: '100%', height: '100%', ...style }}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}
