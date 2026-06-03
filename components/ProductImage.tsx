'use client';

/**
 * Renders a product's primary photo, falling back to the emoji icon.
 * Drop-in replacement wherever {product.icon} was used.
 */
interface Props {
  icon:      string;
  imageUrl?: string | null;
  imageUrls?: string[];
  name:      string;
  /** CSS class applied to <img> OR the outer <span> wrapper */
  className?: string;
  style?:    React.CSSProperties;
}

export default function ProductImage({ icon, imageUrl, imageUrls, name, className, style }: Props) {
  const src = imageUrls?.[0] ?? imageUrl ?? null;

  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={name}
        className={className}
        style={{ objectFit: 'cover', width: '100%', height: '100%', ...style }}
        loading="lazy"
        decoding="async"
      />
    );
  }

  return (
    <span className={className} style={style}>
      {icon}
    </span>
  );
}
