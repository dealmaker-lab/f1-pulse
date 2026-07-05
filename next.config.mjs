/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'media.formula1.com' },
      { protocol: 'https', hostname: '**.fiaformula1.com' },
      { protocol: 'https', hostname: 'www.formula1.com' },
    ],
    unoptimized: true,
  },
  async headers() {
    // Baseline hardening — the app had no security headers at all, so every
    // page (incl. the Clerk-gated dashboard) was iframe-able for clickjacking
    // and responses could be MIME-sniffed.
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
