import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // No output setting - use default (standalone-like behavior without explicit config)
  // This fixes the static export build errors
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb",
    },
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
