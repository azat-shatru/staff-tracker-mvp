import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    staleTimes: {
      // Never serve stale RSC payloads for dynamic pages from the client router cache
      dynamic: 0,
    },
  },
};

export default nextConfig;
