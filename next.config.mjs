/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Windows dev-server stability: the persistent webpack filesystem cache under
  // .next/cache repeatedly corrupted itself (half-written on a hard kill, or when
  // two dev servers briefly overlapped), which then 404'd/500'd every route and
  // API — including /api/v1/admins, so in-game admin sync silently broke.
  // Using an in-memory cache in dev trades a slightly slower cold start for a
  // cache that cannot survive to corrupt the next run. Production build is
  // untouched (this only runs when `dev` is true).
  webpack: (config, { dev }) => {
    if (dev) config.cache = { type: "memory" };
    return config;
  },
  async headers() {
    return [
      {
        // Security headers applied to every route.
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-DNS-Prefetch-Control", value: "off" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
