import type { NextConfig } from "next";

const apiOrigin = process.env.API_ORIGIN ?? "http://localhost:4000";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${apiOrigin}/api/:path*` },
      { source: "/uploads/:path*", destination: `${apiOrigin}/uploads/:path*` },
    ];
  },
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    // Payment submission reads the receipt with an AI model (up to 60s) before responding.
    proxyTimeout: 120_000,
  },
};

export default nextConfig;
