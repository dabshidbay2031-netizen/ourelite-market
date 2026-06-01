/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    formats:       ['image/webp'],
    unoptimized:   true,
  },

  poweredByHeader: false,
  compress:        true,

  // Turbopack is enabled via `next dev --turbo` in package.json.
  // These settings apply to both Turbopack and the webpack fallback.
  experimental: {
    // Keep large browser-only packages out of the server bundle
    serverComponentsExternalPackages: [
      'firebase', '@firebase/app', '@firebase/auth',
    ],
    // Tree-shake heavy packages — only include symbols actually imported
    optimizePackageImports: [
      '@supabase/supabase-js',
      'firebase/auth',
      'firebase/app',
    ],
  },

  async headers() {
    return [
      {
        source: '/_next/static/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
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
