/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    formats:       ['image/webp'],
    unoptimized:   true,
  },

  poweredByHeader: false,
  compress:        true,

  // Skip TypeScript build errors (tsc --noEmit is already clean, this just speeds up the build)
  typescript: { ignoreBuildErrors: false },

  // Turbopack is enabled via `next dev --turbo` in package.json.
  // These settings apply to both Turbopack and the webpack fallback.
  experimental: {
    // Tree-shake heavy packages — only include symbols actually imported
    optimizePackageImports: [
      '@supabase/supabase-js',
    ],
  },

  async headers() {
    return [
      // Immutable caching is correct in production (content-hashed files),
      // but in dev it makes browsers keep stale chunks forever — causing
      // hydration mismatches and old UI after every code change.
      ...(process.env.NODE_ENV === 'production' ? [{
        source: '/_next/static/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      }] : []),
      {
        source: '/:path*',
        headers: [
          { key: 'X-DNS-Prefetch-Control', value: 'on' },
          { key: 'X-Frame-Options',        value: 'SAMEORIGIN' },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
