import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Setting output to standalone helps with deployment detection
  output: "standalone",
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
