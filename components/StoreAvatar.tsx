'use client';

import type { CSSProperties } from 'react';

/** A business "icon" is either an emoji (e.g. 🏪) or an uploaded logo URL. */
export function isLogoUrl(value?: string | null): boolean {
  return !!value && /^https?:\/\//i.test(value.trim());
}

interface Props {
  /** The supplier.icon value — emoji OR an http(s) logo URL. */
  value?: string | null;
  /** Shown when value is empty. */
  fallback?: string;
  alt?: string;
  /** Extra styles for the rendered <img> (it fills its container by default). */
  imgStyle?: CSSProperties;
}

/**
 * Renders a business avatar: an uploaded logo image when `value` is a URL,
 * otherwise the emoji text. Drops into existing fixed-size icon containers
 * (the image fills them); emoji rendering is unchanged from before.
 */
export default function StoreAvatar({ value, fallback = '🏪', alt = 'Store logo', imgStyle }: Props) {
  if (isLogoUrl(value)) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={value as string}
        alt={alt}
        style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit', display: 'block', ...imgStyle }}
      />
    );
  }
  return <>{value || fallback}</>;
}
