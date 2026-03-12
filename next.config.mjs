/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'media.formula1.com' },
      { protocol: 'https', hostname: '**.fiaformula1.com' },
    ],
  },
};

export default nextConfig;
